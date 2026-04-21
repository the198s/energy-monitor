import Anthropic from "@anthropic-ai/sdk";

export async function POST(request) {
  // Read dynamic usage + tariff sent from the frontend
  let usage, tariff, dealType;
  try {
    const body = await request.json();
    usage    = body.usage;
    tariff   = body.tariff;
    dealType = body.dealType ?? "fixed";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const elecKwh = usage?.electricityKwh ?? 2903;
  const gasKwh  = usage?.gasKwh ?? 12364;

  const currentAnnual = Math.round(
    (elecKwh * (tariff?.elecUnit ?? 19.48)) / 100 +
    (365   * (tariff?.elecSC  ?? 51.77)) / 100 +
    (gasKwh * (tariff?.gasUnit ?? 5.48))  / 100 +
    (365   * (tariff?.gasSC   ?? 31.31)) / 100
  );

  const now  = new Date();
  const year = now.getFullYear();

  const DEAL_TYPE_LABELS = { fixed: "fixed-rate", variable: "variable/tracker", both: "fixed and variable" };
  const dealLabel = DEAL_TYPE_LABELS[dealType] ?? "fixed-rate";
  const searchQuery = dealType === "variable"
    ? `best variable tracker energy deals UK ${year}`
    : dealType === "both"
      ? `best fixed and variable energy deals UK ${year}`
      : `best fixed-rate energy deals UK ${year}`;

  const SYSTEM_PROMPT = `UK energy deal finder. Usage: ${elecKwh} kWh elec, ${gasKwh} kWh gas. Current annual cost: £${currentAnnual}.

Cost formula: ((elecKwh×elecUnit)+(365×elecSC)+(gasKwh×gasUnit)+(365×gasSC))/100, rounded to nearest £.

Return ONLY ${dealLabel} tariffs. Do 2 searches: "${searchQuery}", and "Ofgem price cap ${year} prediction".

CRITICAL: Always return up to 10 deals ordered cheapest first. Include ALL deals found regardless of whether they beat £${currentAnnual} — do NOT filter by competitiveness. If exact unit rates are unavailable, provide your best estimates based on market data and set confidence to LOW. Always populate estimatedAnnual.

Reply ONLY with this JSON, no markdown:
{"searchedAt":"${now.toISOString()}","summary":"1 sentence","recommendation":"SWITCH_NOW|STAY_PUT|MONITOR_CLOSELY","recommendationReason":"1 sentence","ofgemAlert":"string or null","marketContext":"1 sentence","deals":[{"supplier":"","tariffName":"","term":"","elecUnit":0,"elecSC":0,"gasUnit":0,"gasSC":0,"exitFee":0,"estimatedAnnual":0,"beatsBestFound":false,"beatsEon":false,"confidence":"HIGH|MEDIUM|LOW","notes":"","source":""}]}`;

  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();
  const stream  = new TransformStream();
  const writer  = stream.writable.getWriter();

  const send = async (data) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  const STEP_LABELS = [
    { step: "search2", label: "Checking Uswitch comparison tables" },
    { step: "search3", label: "Scanning supplier announcements" },
    { step: "search4", label: "Looking up Ofgem cap predictions" },
    { step: "calc",    label: "Calculating costs against your usage" },
    { step: "analyse", label: "Analysing and ranking deals" },
    { step: "final",   label: "Finalising recommendations" },
  ];

  (async () => {
    try {
      await send({ type: "step", step: "search1", label: "Searching MSE for top fixed deals" });

      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      let messages = [{
        role: "user",
        content: `Today is ${today}. Search for the best UK ${dealLabel} energy deals. My current annual cost is £${currentAnnual} (${elecKwh.toLocaleString()} kWh electricity, ${gasKwh.toLocaleString()} kWh gas). Return ONLY ${dealLabel} tariffs. Return ONLY the JSON specified — no other text.`,
      }];

      let stepIdx   = 0;
      let finalText = "";

      // Phase 1: agentic search loop (tools enabled, up to 5 turns)
      for (let turn = 0; turn < 5; turn++) {
        if (stepIdx < STEP_LABELS.length && turn > 0) {
          await send({ type: "step", ...STEP_LABELS[stepIdx++] });
          await new Promise(r => setTimeout(r, 400));
        }

        const response = await client.messages.create({
          model:      "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          tools:      [{ type: "web_search_20250305", name: "web_search" }],
          system:     SYSTEM_PROMPT,
          messages,
        });

        const { content, stop_reason } = response;
        const textBlocks = content.filter(b => b.type === "text");
        if (textBlocks.length) finalText = textBlocks.map(b => b.text).join("\n");

        if (stop_reason === "end_turn" || !content.some(b => b.type === "tool_use")) break;

        const toolUseBlocks = content.filter(b => b.type === "tool_use");
        messages = [
          ...messages,
          { role: "assistant", content },
          {
            role: "user",
            content: toolUseBlocks.map(tu => ({
              type:        "tool_result",
              tool_use_id: tu.id,
              content:     "Search executed successfully.",
            })),
          },
        ];
      }

      // Phase 2: if the loop ended without producing JSON, force a dedicated
      // generation turn with no tools so the model can't search again.
      // messages always ends with a user message after the loop, so we bridge
      // with a short assistant message before the final user prompt.
      if (!finalText.match(/\{[\s\S]*\}/)) {
        const fallbackResponse = await client.messages.create({
          model:      "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          system:     SYSTEM_PROMPT,
          messages: [
            ...messages,
            { role: "assistant", content: [{ type: "text", text: "I have completed my research." }] },
            { role: "user",      content: "Now output ONLY the JSON object specified. No other text." },
          ],
        });
        const fbBlocks = fallbackResponse.content.filter(b => b.type === "text");
        if (fbBlocks.length) finalText = fbBlocks.map(b => b.text).join("\n");
      }

      // Flush remaining step indicators
      while (stepIdx < STEP_LABELS.length) {
        await send({ type: "step", ...STEP_LABELS[stepIdx++] });
        await new Promise(r => setTimeout(r, 200));
      }

      // Parse and recalculate
      try {
        const jsonMatch = finalText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in agent response");

        const parsed = JSON.parse(jsonMatch[0]);

        const stripCites = (v) =>
          typeof v === "string" ? v.replace(/<cite[^>]*>|<\/cite>/g, "").replace(/\s{2,}/g, " ").trim() : v;

        for (const key of ["summary", "recommendationReason", "ofgemAlert", "marketContext"]) {
          if (parsed[key]) parsed[key] = stripCites(parsed[key]);
        }

        const deals = (parsed.deals ?? [])
          .map(d => {
            const annual = d.elecUnit > 0
              ? Math.round(
                  (elecKwh * d.elecUnit) / 100 + (365 * d.elecSC) / 100 +
                  (gasKwh  * d.gasUnit)  / 100 + (365 * d.gasSC)  / 100
                )
              : (d.estimatedAnnual ?? 9999);
            return {
              ...d,
              notes:          stripCites(d.notes),
              estimatedAnnual: annual,
              beatsBestFound:  annual < currentAnnual,
              beatsEon:        annual < currentAnnual + 40,
            };
          })
          .sort((a, b) => (a.estimatedAnnual ?? 9999) - (b.estimatedAnnual ?? 9999));

        await send({ type: "result", data: { ...parsed, deals } });
      } catch (parseErr) {
        await send({ type: "error", message: `Could not parse response: ${parseErr.message}`, raw: finalText });
      }

    } catch (err) {
      await send({ type: "error", message: err.message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
