"use client";
import { useState, useRef } from "react";

const DEFAULT_USAGE = { electricityKwh: 2903, gasKwh: 12364 };

const DEFAULT_TARIFF = {
  supplier: "Octopus Energy",
  tariffName: "Loyal Octopus 14M Fixed March 2025 v4",
  term: "14 months",
  endDate: "2026-05-28",
  elecUnit: 19.48,
  elecSC: 51.77,
  gasUnit: 5.48,
  gasSC: 31.31,
  exitFee: 0,
};

const UK_SUPPLIERS = [
  "Octopus Energy","British Gas","EDF Energy","E.ON Next","OVO Energy",
  "Scottish Power","Outfox Energy","Fuse Energy","Utilita","Utility Warehouse",
  "Shell Energy","So Energy","Rebel Energy","Home Energy","Other",
];

const STEPS = [
  { id:"search1", label:"Searching MSE for top fixed deals" },
  { id:"search2", label:"Checking Uswitch comparison tables" },
  { id:"search3", label:"Scanning supplier announcements" },
  { id:"search4", label:"Looking up Ofgem cap predictions" },
  { id:"calc",    label:"Calculating costs against your usage" },
  { id:"analyse", label:"Analysing and ranking deals" },
  { id:"final",   label:"Finalising recommendations" },
];

const REC = {
  SWITCH_NOW:      { color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", icon:"⚡", label:"Switch Now" },
  STAY_PUT:        { color:"#b45309", bg:"#fffbeb", border:"#fde68a", icon:"⏸", label:"Stay Put" },
  MONITOR_CLOSELY: { color:"#1d4ed8", bg:"#eff6ff", border:"#bfdbfe", icon:"👁", label:"Monitor Closely" },
};

function calcAnnual(usage, t) {
  const e = (usage.electricityKwh * t.elecUnit)/100 + (365 * t.elecSC)/100;
  const g = (usage.gasKwh * t.gasUnit)/100 + (365 * t.gasSC)/100;
  return { elec:Math.round(e), gas:Math.round(g), total:Math.round(e+g) };
}

function SliderInput({ label, value, min, max, step, unit, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
        <label style={{ fontSize:12, fontWeight:600, color:"#374151", fontFamily:"'DM Sans',sans-serif" }}>{label}</label>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
            style={{ width:90, padding:"4px 8px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:14, fontWeight:700, color:"#111827", fontFamily:"'DM Sans',sans-serif", textAlign:"right" }} />
          <span style={{ fontSize:11, color:"#6b7280", whiteSpace:"nowrap" }}>{unit}</span>
        </div>
      </div>
      <div style={{ position:"relative", height:8, background:"#f1f5f9", borderRadius:99 }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${pct}%`, borderRadius:99, background:"linear-gradient(90deg,#2563eb,#7c3aed)", transition:"width 0.1s" }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", margin:0 }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
        <span style={{ fontSize:10, color:"#d1d5db" }}>{min.toLocaleString()}</span>
        <span style={{ fontSize:10, color:"#d1d5db" }}>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function RateField({ label, value, onChange, unit }) {
  return (
    <div style={{ background:"#f8fafc", border:"1.5px solid #e5e7eb", borderRadius:10, padding:"10px 12px" }}>
      <div style={{ fontSize:9, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <input type="number" value={value} step="0.001" min={0}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex:1, border:"none", background:"transparent", fontSize:17, fontWeight:700, color:"#111827", fontFamily:"'DM Sans',sans-serif", minWidth:0 }} />
        <span style={{ fontSize:11, color:"#9ca3af", flexShrink:0 }}>{unit}</span>
      </div>
    </div>
  );
}

function ProgressRing({ pct, size=60, stroke=5 }) {
  const r = (size-stroke)/2, circ = 2*Math.PI*r, dash = (pct/100)*circ;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2563eb" strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition:"stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)" }}/>
    </svg>
  );
}

function DealCard({ deal, rank, currentTotal }) {
  const [open, setOpen] = useState(false);
  const beats = deal.beatsBestFound, beatsEon = deal.beatsEon;
  const diff = (deal.estimatedAnnual??0) - currentTotal;
  const confColor = deal.confidence==="HIGH"?"#16a34a":deal.confidence==="MEDIUM"?"#b45309":"#6b7280";
  return (
    <div className="deal-card" style={{ background:"#fff", border:`1.5px solid ${beats?"#86efac":beatsEon?"#bfdbfe":"#e5e7eb"}`, borderRadius:14, overflow:"hidden", boxShadow:beats?"0 4px 24px rgba(22,163,74,0.08)":"0 1px 4px rgba(0,0,0,0.04)", marginBottom:10 }}>
      {beats && <div style={{ background:"linear-gradient(90deg,#16a34a,#22c55e)", padding:"5px 16px", fontSize:10, color:"#fff", fontWeight:700, letterSpacing:"0.1em" }}>✓ BEATS YOUR CURRENT DEAL</div>}
      <div style={{ padding:"16px 18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
              <span style={{ background:beats?"#f0fdf4":beatsEon?"#eff6ff":"#f9fafb", color:beats?"#16a34a":beatsEon?"#1d4ed8":"#6b7280", border:`1px solid ${beats?"#bbf7d0":beatsEon?"#bfdbfe":"#e5e7eb"}`, borderRadius:20, fontSize:10, fontWeight:700, padding:"2px 8px" }}>
                #{rank} {beats?"BEST":beatsEon?"GOOD":""}
              </span>
              <span style={{ fontSize:10, color:confColor, fontWeight:600 }}>{deal.confidence} confidence</span>
            </div>
            <div style={{ fontSize:11, color:"#6b7280", fontFamily:"'DM Sans',sans-serif" }}>{deal.supplier}</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#111827", fontFamily:"'DM Sans',sans-serif" }}>{deal.tariffName}</div>
            <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{deal.term} · Exit £{deal.exitFee}</div>
          </div>
          <div style={{ textAlign:"right", marginLeft:12 }}>
            <div style={{ fontSize:26, fontWeight:800, color:beats?"#16a34a":"#111827", fontFamily:"'DM Sans',sans-serif", lineHeight:1 }}>£{deal.estimatedAnnual?.toLocaleString()}</div>
            <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>per year</div>
            <div style={{ fontSize:11, fontWeight:700, marginTop:4, color:diff<=0?"#16a34a":"#dc2626" }}>
              {diff<=0?`£${Math.abs(diff)} cheaper`:`£${diff} more expensive`}
            </div>
          </div>
        </div>
        <button onClick={()=>setOpen(v=>!v)} style={{ background:"none", border:"none", padding:"6px 0 0", fontSize:11, fontWeight:600, color:"#2563eb", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition:"transform 0.2s", transform:open?"rotate(180deg)":"rotate(0deg)", flexShrink:0 }}>
            <path d="M2 4.5l4 3 4-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {open ? "Hide rates" : "Show rates"}
        </button>
        {open && (
          <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[
              {l:"Elec unit rate", v:deal.elecUnit, ref:DEFAULT_TARIFF.elecUnit, unit:"p/kWh"},
              {l:"Elec standing charge", v:deal.elecSC, ref:DEFAULT_TARIFF.elecSC, unit:"p/day"},
              {l:"Gas unit rate", v:deal.gasUnit, ref:DEFAULT_TARIFF.gasUnit, unit:"p/kWh"},
              {l:"Gas standing charge", v:deal.gasSC, ref:DEFAULT_TARIFF.gasSC, unit:"p/day"},
            ].map(({l,v,ref,unit})=>{
              const better = v < ref;
              return (
                <div key={l} style={{ background:better?"#f0fdf4":"#fafafa", border:`1px solid ${better?"#bbf7d0":"#f3f4f6"}`, borderRadius:8, padding:"8px 10px" }}>
                  <div style={{ fontSize:9, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:better?"#16a34a":"#374151", fontFamily:"'DM Sans',sans-serif" }}>{v}{unit} {better?"▼":"▲"}</div>
                  <div style={{ fontSize:9, color:"#9ca3af" }}>yours: {ref}{unit}</div>
                </div>
              );
            })}
            {deal.notes && <div style={{ gridColumn:"1/-1", fontSize:10, color:"#6b7280", background:"#fafafa", borderRadius:6, padding:"6px 8px" }}>📝 {deal.notes}</div>}
            <div style={{ gridColumn:"1/-1", fontSize:10, color:"#9ca3af" }}>Source: {deal.source}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [usage, setUsage]               = useState(DEFAULT_USAGE);
  const [editingUsage, setEditingUsage] = useState(false);
  const [draftUsage, setDraftUsage]     = useState(DEFAULT_USAGE);

  const [tariff, setTariff]                 = useState(DEFAULT_TARIFF);
  const [editingTariff, setEditingTariff]   = useState(false);
  const [draftTariff, setDraftTariff]       = useState(DEFAULT_TARIFF);

  const [status, setStatus]                 = useState("idle");
  const [completedSteps, setCompletedSteps] = useState([]);
  const [currentStep, setCurrentStep]       = useState(null);
  const [result, setResult]                 = useState(null);
  const [error, setError]                   = useState(null);
  const [lastRun, setLastRun]               = useState(null);
  const [activeTab, setActiveTab]           = useState("deals");
  const cancelledRef                        = useRef(false);
  const readerRef                           = useRef(null);

  const cost      = calcAnnual(usage, tariff);
  const stepIdx   = STEPS.findIndex(s => s.id === currentStep?.id);
  const progress  = currentStep ? Math.round(((stepIdx+1)/STEPS.length)*90) : status==="done" ? 100 : 5;
  const running   = status === "running";

  const setDT = (k,v) => setDraftTariff(p=>({...p,[k]:v}));

  const runAgent = async () => {
    setStatus("running"); setCompletedSteps([]); setCurrentStep(STEPS[0]);
    setResult(null); setError(null); setActiveTab("deals");
    cancelledRef.current = false;
    try {
      const res = await fetch("/api/search", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ usage, tariff }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const reader = res.body.getReader(); readerRef.current = reader;
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        if (cancelledRef.current) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream:true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type==="step") {
              const s = STEPS.find(s=>s.id===msg.step) ?? {id:msg.step,label:msg.label};
              setCurrentStep(s);
              setCompletedSteps(prev => {
                const i = STEPS.findIndex(s=>s.id===msg.step);
                return i>0 ? [...new Set([...prev,STEPS[i-1].id])] : prev;
              });
            }
            if (msg.type==="result") {
              setCompletedSteps(STEPS.map(s=>s.id)); setCurrentStep(null);
              setResult(msg.data); setLastRun(new Date()); setStatus("done");
            }
            if (msg.type==="error") { setError(msg.message); setStatus("error"); }
          } catch {}
        }
      }
      if (cancelledRef.current) setStatus("cancelled");
    } catch (err) {
      if (!cancelledRef.current) { setError(err.message); setStatus("error"); }
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    readerRef.current?.cancel().catch(()=>{});
    setStatus("cancelled"); setCurrentStep(null);
  };

  const rec = result?.recommendation ? REC[result.recommendation] : null;

  const Card = ({children, mb=12, p="18px"}) => (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:p, boxShadow:"0 1px 3px rgba(0,0,0,0.04)", marginBottom:mb }}>
      {children}
    </div>
  );

  const Label = ({children}) => (
    <div style={{ fontSize:10, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700, marginBottom:14 }}>{children}</div>
  );

  const EditBtn = ({onClick}) => (
    <button onClick={onClick} style={{ background:"#f1f5f9", border:"1px solid #e5e7eb", borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:600, color:"#374151", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>✏️ Edit</button>
  );

  const SaveCancel = ({onSave, onCancel, label="Save"}) => (
    <div style={{ display:"flex", gap:8, marginTop:16 }}>
      <button onClick={onSave} style={{ flex:1, padding:"11px", background:"linear-gradient(135deg,#2563eb,#7c3aed)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>{label}</button>
      <button onClick={onCancel} style={{ padding:"11px 18px", background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, color:"#6b7280", fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Cancel</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#eef2ff 0%,#f8fafc 28%)", fontFamily:"'DM Sans',sans-serif" }}>

      {/* Nav */}
      <div style={{ background:"rgba(255,255,255,0.85)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", borderBottom:"1px solid #e5e7eb", padding:"0 24px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10, boxShadow:"0 1px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:9, background:"linear-gradient(135deg,#2563eb,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, boxShadow:"0 2px 8px rgba(37,99,235,0.3)" }}>⚡</div>
          <span style={{ fontWeight:700, fontSize:15, letterSpacing:"-0.01em" }}>Energy Monitor</span>
        </div>
        {lastRun && <span style={{ fontSize:11, color:"#9ca3af" }}>Last checked {lastRun.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>}
      </div>

      <div style={{ maxWidth:680, margin:"0 auto", padding:"28px 18px 60px" }}>

        {/* Hero */}
        <div style={{ marginBottom:28 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:99, padding:"4px 12px", marginBottom:14 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#2563eb", display:"inline-block", flexShrink:0 }}/>
            <span style={{ fontSize:11, fontWeight:600, color:"#1d4ed8", letterSpacing:"0.01em" }}>UK energy market · live search</span>
          </div>
          <h1 style={{ fontSize:28, fontWeight:800, lineHeight:1.2, marginBottom:8 }}>
            Find a better<br />
            <span style={{ background:"linear-gradient(135deg,#2563eb,#7c3aed)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>energy deal</span>
          </h1>
          <p style={{ fontSize:13, color:"#6b7280", lineHeight:1.7 }}>Searches MSE, Uswitch and supplier sites · Calculates costs against your exact usage</p>
        </div>

        {/* ── Usage ── */}
        <Card mb={12}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: editingUsage ? 20 : 0 }}>
            <Label>Your annual usage</Label>
            {!editingUsage && <EditBtn onClick={()=>{setDraftUsage(usage);setEditingUsage(true)}} />}
          </div>

          {!editingUsage ? (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[{icon:"⚡",label:"Electricity",val:`${usage.electricityKwh.toLocaleString()} kWh/yr`},{icon:"🔥",label:"Gas",val:`${usage.gasKwh.toLocaleString()} kWh/yr`}].map(({icon,label,val})=>(
                <div key={label} style={{ background:"#f8fafc", border:"1px solid #f1f5f9", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontSize:10, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                  <div style={{ fontSize:17, fontWeight:800, color:"#111827", fontFamily:"'DM Sans',sans-serif", marginTop:2 }}>{val}</div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <SliderInput label="⚡ Electricity" value={draftUsage.electricityKwh} min={500} max={8000} step={50} unit="kWh/year"
                onChange={v=>setDraftUsage(p=>({...p,electricityKwh:v}))} />
              <SliderInput label="🔥 Gas" value={draftUsage.gasKwh} min={1000} max={30000} step={100} unit="kWh/year"
                onChange={v=>setDraftUsage(p=>({...p,gasKwh:v}))} />
              <SaveCancel label="Save usage" onSave={()=>{setUsage(draftUsage);setEditingUsage(false)}} onCancel={()=>setEditingUsage(false)} />
            </>
          )}
        </Card>

        {/* ── Current tariff ── */}
        <Card mb={20}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <Label>Your current tariff</Label>
            {!editingTariff && <EditBtn onClick={()=>{setDraftTariff(tariff);setEditingTariff(true)}} />}
          </div>

          {!editingTariff ? (
            <>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Sans',sans-serif" }}>{tariff.supplier}</div>
                <div style={{ fontSize:16, fontWeight:700, color:"#111827", fontFamily:"'DM Sans',sans-serif" }}>{tariff.tariffName}</div>
                <div style={{ fontSize:11, color:"#9ca3af", marginTop:3 }}>
                  {tariff.term}
                  {tariff.endDate && ` · ends ${new Date(tariff.endDate).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`}
                  {` · £${tariff.exitFee} exit fee`}
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                {[
                  {l:"⚡ Elec unit rate", v:`${tariff.elecUnit}p/kWh`},
                  {l:"⚡ Elec standing charge", v:`${tariff.elecSC}p/day`},
                  {l:"🔥 Gas unit rate", v:`${tariff.gasUnit}p/kWh`},
                  {l:"🔥 Gas standing charge", v:`${tariff.gasSC}p/day`},
                ].map(({l,v})=>(
                  <div key={l} style={{ background:"#f8fafc", border:"1px solid #f1f5f9", borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:9, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#1d4ed8", fontFamily:"'DM Sans',sans-serif" }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 16px" }}>
                <div>
                  <div style={{ fontSize:10, color:"#1d4ed8", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700 }}>Estimated annual cost</div>
                  <div style={{ fontSize:11, color:"#3b82f6", marginTop:3 }}>⚡ £{cost.elec.toLocaleString()} · 🔥 £{cost.gas.toLocaleString()}</div>
                </div>
                <div style={{ fontSize:28, fontWeight:800, color:"#1d4ed8", fontFamily:"'DM Sans',sans-serif" }}>£{cost.total.toLocaleString()}</div>
              </div>
            </>
          ) : (
            <>
              {/* Supplier */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, fontWeight:600, color:"#374151", fontFamily:"'DM Sans',sans-serif", display:"block", marginBottom:6 }}>Supplier</label>
                <select value={draftTariff.supplier} onChange={e=>setDT("supplier",e.target.value)}
                  style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#111827", fontFamily:"'DM Sans',sans-serif", background:"#fff" }}>
                  {UK_SUPPLIERS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Tariff name */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, fontWeight:600, color:"#374151", fontFamily:"'DM Sans',sans-serif", display:"block", marginBottom:6 }}>Tariff name</label>
                <input type="text" value={draftTariff.tariffName} onChange={e=>setDT("tariffName",e.target.value)}
                  placeholder="e.g. Loyal Octopus 14M Fixed March 2025"
                  style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#111827", fontFamily:"'DM Sans',sans-serif" }} />
              </div>

              {/* Term + End date */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"#374151", fontFamily:"'DM Sans',sans-serif", display:"block", marginBottom:6 }}>Contract length</label>
                  <input type="text" value={draftTariff.term} onChange={e=>setDT("term",e.target.value)} placeholder="e.g. 14 months"
                    style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#111827", fontFamily:"'DM Sans',sans-serif" }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"#374151", fontFamily:"'DM Sans',sans-serif", display:"block", marginBottom:6 }}>Deal end date</label>
                  <input type="date" value={draftTariff.endDate} onChange={e=>setDT("endDate",e.target.value)}
                    style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#111827", fontFamily:"'DM Sans',sans-serif" }} />
                </div>
              </div>

              {/* Electricity rates */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Sans',sans-serif", marginBottom:10 }}>⚡ Electricity rates</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <RateField label="Unit rate" value={draftTariff.elecUnit} unit="p/kWh" onChange={v=>setDT("elecUnit",v)} />
                  <RateField label="Standing charge" value={draftTariff.elecSC} unit="p/day" onChange={v=>setDT("elecSC",v)} />
                </div>
              </div>

              {/* Gas rates */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Sans',sans-serif", marginBottom:10 }}>🔥 Gas rates</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <RateField label="Unit rate" value={draftTariff.gasUnit} unit="p/kWh" onChange={v=>setDT("gasUnit",v)} />
                  <RateField label="Standing charge" value={draftTariff.gasSC} unit="p/day" onChange={v=>setDT("gasSC",v)} />
                </div>
              </div>

              {/* Exit fee */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, fontWeight:600, color:"#374151", fontFamily:"'DM Sans',sans-serif", display:"block", marginBottom:6 }}>Early exit fee (£ total, both fuels)</label>
                <input type="number" value={draftTariff.exitFee} onChange={e=>setDT("exitFee",Number(e.target.value))} min={0}
                  style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#111827", fontFamily:"'DM Sans',sans-serif" }} />
              </div>

              {/* Live preview */}
              {(()=>{
                const p = calcAnnual(usage, draftTariff);
                return (
                  <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 16px", marginBottom:4, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontSize:11, color:"#16a34a", fontFamily:"'DM Sans',sans-serif" }}>Live preview · ⚡ £{p.elec} · 🔥 £{p.gas}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:"#16a34a", fontFamily:"'DM Sans',sans-serif" }}>£{p.total}/yr</div>
                  </div>
                );
              })()}

              <SaveCancel label="Save tariff" onSave={()=>{setTariff(draftTariff);setEditingTariff(false)}} onCancel={()=>setEditingTariff(false)} />
            </>
          )}
        </Card>

        {/* ── Run / Cancel ── */}
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          <button onClick={runAgent} disabled={running} style={{ flex:1, padding:"14px 20px", background:running?"#f1f5f9":"linear-gradient(135deg,#2563eb,#7c3aed)", border:"none", borderRadius:12, color:running?"#9ca3af":"#fff", fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:running?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:running?"none":"0 4px 16px rgba(37,99,235,0.3)", transition:"all 0.2s" }}>
            {running?<><span style={{animation:"pulse 1.5s ease infinite",display:"inline-block"}}>⚡</span> Searching market…</>:<>{lastRun?"🔄 Search again":"⚡ Search market now"}</>}
          </button>
          {running && (
            <button onClick={cancel} style={{ padding:"14px 18px", borderRadius:12, background:"#fff", border:"1.5px solid #e5e7eb", color:"#dc2626", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>✕ Cancel</button>
          )}
        </div>

        {/* ── Progress ── */}
        {running && (
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"22px 22px 20px", marginBottom:20, boxShadow:"0 4px 20px rgba(37,99,235,0.08)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <ProgressRing pct={progress}/>
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", fontWeight:800, fontSize:13, color:"#2563eb" }}>{progress}%</div>
              </div>
              <div>
                <div style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:15, color:"#111827", marginBottom:2 }}>{currentStep?.label ?? "Starting up…"}</div>
                <div style={{ fontSize:11, color:"#9ca3af" }}>Searching energy comparison sites in real time</div>
              </div>
            </div>
            <div style={{ height:6, background:"#f1f5f9", borderRadius:99, overflow:"hidden", marginBottom:18 }}>
              <div style={{ height:"100%", borderRadius:99, background:"linear-gradient(90deg,#2563eb,#7c3aed)", width:`${progress}%`, transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)" }}/>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {STEPS.map(step=>{
                const done=completedSteps.includes(step.id), active=currentStep?.id===step.id;
                return (
                  <div key={step.id} style={{ display:"flex", alignItems:"center", gap:10, opacity:done||active?1:0.3, transition:"opacity 0.4s" }}>
                    <div style={{ width:20, height:20, borderRadius:"50%", flexShrink:0, background:done?"#2563eb":active?"#eff6ff":"#f1f5f9", border:active?"2px solid #2563eb":"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:done?"#fff":"#2563eb", transition:"all 0.3s" }}>
                      {done?"✓":active?<span style={{width:6,height:6,borderRadius:"50%",background:"#2563eb",animation:"pulse 1s ease infinite",display:"block"}}/>:""}
                    </div>
                    <span style={{ fontSize:12, fontFamily:"'DM Sans',sans-serif", color:done?"#16a34a":active?"#2563eb":"#6b7280", fontWeight:active?600:400 }}>{step.label}</span>
                    {active&&<span style={{fontSize:10,color:"#9ca3af",marginLeft:"auto",animation:"pulse 2s ease infinite"}}>in progress…</span>}
                    {done&&<span style={{fontSize:10,color:"#16a34a",marginLeft:"auto"}}>done</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {status==="cancelled" && (
          <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:600, color:"#c2410c" }}>Search cancelled</div>
            <div style={{ fontSize:12, color:"#9a3412", marginTop:4 }}>Hit search again whenever you're ready.</div>
          </div>
        )}
        {status==="error" && (
          <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:600, color:"#dc2626" }}>⚠ Something went wrong</div>
            <div style={{ fontSize:12, color:"#991b1b", marginTop:4, lineHeight:1.6 }}>{error}</div>
          </div>
        )}

        {/* ── Results ── */}
        {status==="done" && result && (
          <div className="fadeup">
            {rec && (
              <div style={{ background:rec.bg, border:`1.5px solid ${rec.border}`, borderRadius:14, padding:"18px 20px", marginBottom:16, boxShadow:"0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <span style={{fontSize:22}}>{rec.icon}</span>
                  <span style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:800, fontSize:16, color:rec.color }}>{rec.label}</span>
                  <span style={{ marginLeft:"auto", fontSize:10, color:"#9ca3af" }}>{lastRun?.toLocaleDateString("en-GB",{day:"numeric",month:"short"})} · {lastRun?.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <div style={{ fontSize:13, color:"#374151", lineHeight:1.7, fontFamily:"'DM Sans',sans-serif" }}>{result.recommendationReason}</div>
              </div>
            )}

            <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:13, color:"#374151", lineHeight:1.7, fontFamily:"'DM Sans',sans-serif" }}>{result.summary}</div>
              {result.ofgemAlert && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #f3f4f6", fontSize:12, color:"#b45309", fontFamily:"'DM Sans',sans-serif", display:"flex", gap:8 }}>
                  <span>📢</span>{result.ofgemAlert}
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:2, marginBottom:16, background:"#f1f5f9", borderRadius:10, padding:3 }}>
              {[{key:"deals",label:`Deals (${result.deals?.length??0})`},{key:"market",label:"Market overview"}].map(({key,label})=>(
                <button key={key} onClick={()=>setActiveTab(key)} style={{ flex:1, padding:"7px 10px", background:activeTab===key?"#fff":"transparent", border:"none", borderRadius:7, color:activeTab===key?"#111827":"#6b7280", fontSize:12, fontWeight:activeTab===key?700:400, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:activeTab===key?"0 1px 4px rgba(0,0,0,0.08)":"none", transition:"all 0.15s" }}>
                  {label}
                </button>
              ))}
            </div>

            {activeTab==="deals" && (
              result.deals?.length>0
                ? result.deals.map((d,i)=><DealCard key={i} deal={d} rank={i+1} currentTotal={cost.total}/>)
                : <div style={{textAlign:"center",padding:32,color:"#9ca3af",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>No deals with full rate details found. Try searching again.</div>
            )}
            {activeTab==="market" && (
              <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"16px 18px", fontSize:13, color:"#374151", lineHeight:1.8, fontFamily:"'DM Sans',sans-serif", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                {result.marketContext ?? "No market context available."}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:40, paddingTop:24, borderTop:"1px solid #e5e7eb", fontSize:11, color:"#9ca3af", lineHeight:1.8, textAlign:"center" }}>
          Results are based on publicly available data. Always verify with a personalised quote before switching.
        </div>
      </div>
    </div>
  );
}
