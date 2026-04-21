import Anthropic from "@anthropic-ai/sdk";

export async function POST(request) {
  // Read dynamic usage + tariff sent from the frontend
  let usage, tariff;
  try {
    const body = await request.json();
    usage  = body.usage;
    tariff = body.tariff;
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

  const now = new Date();
  const monthYear = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const year      = now.getFullYear();

  const SYSTEM_PROMPT = `You are a UK energy market monitoring agent. Search for the latest fixed energy deals and report clearly.

User energy profile:
- Electricity: ${elecKwh.toLocaleString()} kWh/year
- Gas: ${gasKwh.toLocaleString()} kWh/year (HIGH — key cost driver)
- Current supplier: ${tariff?.supplier ?? "Unknown"}
- Current tariff: ${tariff?.tariffName ?? "Unknown"}
- Current deal ends: ${tariff?.endDate ?? "Unknown"}
- Current exit fee: £${tariff?.exitFee ?? 0}
- Current rates: Elec ${tariff?.elecUnit ?? 19.48}p/kWh + ${tariff?.elecSC ?? 51.77}p/day SC | Gas ${tariff?.gasUnit ?? 5.48}p/kWh + ${tariff?.gasSC ?? 31.31}p/day SC
- Estimated current annual cost: £${currentAnnual}

Annual cost formula (use this to calculate for every deal):
- Electricity: (${elecKwh} × elecUnit / 100) + (365 × elecSC / 100)
- Gas: (${gasKwh} × gasUnit / 100) + (365 × gasSC / 100)
- Total = Electricity + Gas (round to nearest £)

A deal "beatsBestFound" if its total annual cost is less than £${currentAnnual} (the current deal cost).
A deal "beatsEon" if its total annual cost is less than £${currentAnnual + 40} (slightly above current).

Search strategy — do ALL of these:
1. "best fixed energy deals UK ${monthYear} unit rates"
2. "cheapest fixed energy tariff UK ${year} gas electricity p/kWh"
3. "MSE cheap energy club top fixes ${year}"
4. "Uswitch best fixed energy deal ${year}"
5. "Ofgem price cap July ${year} prediction announcement"

For each deal found, extract unit rates and standing charges, calculate annual cost, and compare to current.

Respond ONLY with valid JSON — no other text, no markdown fences:
{
  "searchedAt": "${now.toISOString()}",
  "summary": "2 sentence market summary",
  "recommendation": "SWITCH_NOW or STAY_PUT or MONITOR_CLOSELY",
  "recommendationReason": "2 sentence explanation referencing the user's current deal cost of £${currentAnnual}",
  "ofgemAlert": "Ofgem news string or null",
  "marketContext": "2-3 sentences on wholesale conditions and direction",
  "deals": [
    {
      "supplier": "name",
      "tariffName": "name",
      "term": "12 months",
      "elecUnit": 19.44,
      "elecSC": 59.72,
      "gasUnit": 6.15,
      "gasSC": 29.11,
      "exitFee": 150,
      "estimatedAnnual": 1649,
      "beatsBestFound": false,
      "beatsEon": false,
      "confidence": "HIGH or MEDIUM or LOW",
      "notes": "any caveats or regional notes",
      "source": "where found e.g. MSE Cheap Energy Club"
    }
  ]
}`;

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
        content: `Today is ${today}. Search for the best UK fixed energy deals. My current annual cost is £${currentAnnual} (${elecKwh.toLocaleString()} kWh electricity, ${gasKwh.toLocaleString()} kWh gas). Find deals cheaper than this. Return ONLY the JSON specified — no other text.`,
      }];

      let stepIdx   = 0;
      let finalText = "";

      for (let turn = 0; turn < 10; turn++) {
        if (stepIdx < STEP_LABELS.length && turn > 0) {
          await send({ type: "step", ...STEP_LABELS[stepIdx++] });
          await new Promise(r => setTimeout(r, 400));
        }

        const response = await client.messages.create({
          model:      "claude-sonnet-4-20250514",
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

      // Flush remaining steps
      while (stepIdx < STEP_LABELS.length) {
        await send({ type: "step", ...STEP_LABELS[stepIdx++] });
        await new Promise(r => setTimeout(r, 200));
      }

      // Parse and recalculate
      try {
        const jsonMatch = finalText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in agent response");

        const parsed = JSON.parse(jsonMatch[0]);

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
