import {useState,useEffect,useId} from "react";
import {summarizeResults} from "../lib/results.js";
import {NETWORK,CONTRACT_ADDRESS,PROTOCOL_VERSION} from "../contract.js";
const V2 = PROTOCOL_VERSION === 2;
// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2330", border:"#30363d",
  gold:"#d4a017", green:"#238636", red:"#b91c1c", blue:"#1d4ed8",
  text:"#e6edf3", muted:"#8b949e",
  mono:"'Space Mono',monospace", sans:"'DM Sans',sans-serif",
};

const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "";

// ── Atoms — ALL outside App so React never recreates them ────────────────────

function Btn({ children, onClick, variant="primary", size="md", disabled, full }) {
  const sz = {
    sm:{ padding:"5px 12px", fontSize:"12px" },
    md:{ padding:"8px 18px", fontSize:"13px" },
    lg:{ padding:"11px 24px", fontSize:"14px" },
  };
  const va = {
    primary:{ background:C.gold,        color:"#000" },
    danger: { background:C.red,         color:"#fff" },
    success:{ background:C.green,       color:"#fff" },
    ghost:  { background:"transparent", color:C.text, border:`1px solid ${C.border}` },
    info:   { background:C.blue,        color:"#fff" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily:C.sans, fontWeight:600, border:"none",
      cursor:disabled?"not-allowed":"pointer", borderRadius:8,
      transition:"opacity .15s", opacity:disabled?0.45:1,
      width:full?"100%":"auto", marginRight:4, marginBottom:4,
      ...sz[size], ...va[variant],
    }}>
      {children}
    </button>
  );
}

// Inline input — no wrapper component; caller owns onChange handler directly
// This guarantees React never remounts the DOM input on re-render
function RawInput({ label, placeholder, value, onChange, mono, hint, type="text" }) {
  const inputId = useId();
  return (
    <div style={{ marginBottom:12 }}>
      {label && (
        <label htmlFor={inputId} style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
          {label}
        </label>
      )}
      <input
        id={inputId} type={type} value={value} placeholder={placeholder}
        onChange={onChange}
        style={{
          width:"100%", padding:"9px 12px", background:C.surface2,
          border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
          fontSize:13, fontFamily:mono?C.mono:C.sans, outline:"none",
          boxSizing:"border-box",
        }}
      />
      {hint && <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{hint}</div>}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:16, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
      <span>{children}</span>
      {action}
    </div>
  );
}

function Badge({ label, color }) {
  const map = { active:"#56d364", ended:"#adb6c0", created:"#e3b341", reveal:"#79c0ff", cancelled:"#ff7b72",
    "#238636":"#56d364", "#1d4ed8":"#79c0ff", "#b91c1c":"#ff7b72" };
  const c   = map[color] || color;
  return (
    <span style={{ background:c+"22", color:c, padding:"2px 9px", borderRadius:12, fontSize:11, fontWeight:600 }}>
      {label}
    </span>
  );
}

// Auto-dismissing toast
function Toast({ msg, onDismiss }) {
  useEffect(() => {
    if (!msg || msg.startsWith("❌") || msg.startsWith("⏳")) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  const col = msg.startsWith("❌") ? "#ff7b72" : msg.startsWith("⏳") ? C.gold : "#56d364";
  return (
    <div role="status" aria-live="polite" style={{
      background:col+"18", border:`1px solid ${col}44`,
      padding:"10px 14px", borderRadius:8, fontSize:13, color:col,
      marginBottom:16, cursor:"pointer", userSelect:"none",
      display:"flex", justifyContent:"space-between", alignItems:"center",
    }}>
      <span>{msg}</span>
      <button aria-label="Dismiss notification" onClick={onDismiss} style={{color:C.text,background:"transparent",border:0,padding:4,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
    </div>
  );
}

// Confirmation modal for destructive actions
function ConfirmModal({ open, title, body, onConfirm, onCancel, confirmLabel="Confirm", variant="danger" }) {
  if (!open) return null;
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.7)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:999,
    }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:28, maxWidth:420, width:"90%", boxShadow:"0 8px 32px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:20 }}>{body}</div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant={variant} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// Copy-to-clipboard button
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title="Copy" style={{
      background:"transparent", border:"none", cursor:"pointer",
      color:copied ? C.green : C.muted, fontSize:12, padding:"2px 4px",
    }}>
      {copied ? "✓" : "⎘"}
    </button>
  );
}

// SVG bar chart
function BarChart({ data }) {
  if (!data?.length) return null;
  const W=480, H=150, pad=32;
  const mx = Math.max(...data.map(d=>d.votes), 1);
  const bw = Math.max(18, (W - pad*2)/data.length - 10);
  return (
    <div style={{ background:C.surface2, borderRadius:10, padding:16, overflowX:"auto" }}>
      <svg viewBox={`0 0 ${W} ${H+40}`} style={{ width:"100%", maxWidth:W }}>
        {data.map((d,i) => {
          const bh  = Math.max(((d.votes/mx)*H), d.votes>0?3:1);
          const x   = pad + i*((W-pad*2)/data.length)+4;
          const y   = H - bh;
          const win = d.votes===mx && d.votes>0;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} rx={3}
                fill={win?C.gold:C.surface} stroke={win?C.gold:C.border} strokeWidth={1}/>
              {d.votes>0 && (
                <text x={x+bw/2} y={y-5} textAnchor="middle" fill={win?C.gold:C.muted} fontSize={11} fontFamily={C.mono}>
                  {d.votes}
                </text>
              )}
              <text x={x+bw/2} y={H+15} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily={C.sans}>
                {d.name.length>9 ? d.name.slice(0,9)+"…" : d.name}
              </text>
              {win && <text x={x+bw/2} y={H+28} textAnchor="middle" fill={C.gold} fontSize={10}>🏆</text>}
            </g>
          );
        })}
        <line x1={pad} y1={H} x2={W-pad} y2={H} stroke={C.border} strokeWidth={1}/>
      </svg>
    </div>
  );
}

function Outcome({ results }) {
  const outcome = summarizeResults(results);
  if (outcome.status === "unavailable") return null;
  return <p role="status" style={{ color:C.gold, fontSize:13 }}>
    {outcome.status === "no-votes" ? "No votes were counted. No winner can be declared."
      : outcome.status === "tie" ? `Tie: ${outcome.leaders.map(c => c.name).join(", ")}. No tie-break rule is implemented.`
      : `Highest tally: ${outcome.leaders[0].name} (${outcome.leaders[0].votes} votes).`}
  </p>;
}

// Transaction log
function TxLog({ logs }) {
  if (!logs.length) return null;
  return (
    <Card>
      <SectionTitle>Transaction History</SectionTitle>
      <div style={{ maxHeight:130, overflowY:"auto" }}>
        {[...logs].reverse().map((l,i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:i<logs.length-1?`1px solid ${C.border}`:"" }}>
            <span style={{ fontSize:12, color:C.text }}>{l.msg}</span>
            {NETWORK.explorer ? <a href={`${NETWORK.explorer}/tx/${l.hash}`} target="_blank" rel="noreferrer"
               style={{ fontSize:11, color:C.gold, fontFamily:C.mono, textDecoration:"none" }}>
              {short(l.hash)} ↗
            </a> : <span title={l.hash} style={{fontFamily:C.mono,fontSize:11}}>{short(l.hash)} (local)</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// Top navigation bar
function Topbar({ account, isAdmin, view, onSwitchView, onDisconnect, loading }) {
  return (
    <div className="topbar" style={{
      background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 24px",
      display:"flex", alignItems:"center", justifyContent:"space-between",
      height:52, position:"sticky", top:0, zIndex:100,
    }}>
      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <span style={{ fontWeight:700, fontSize:15, color:C.text }}>🗳 VoteChain</span>
        <span style={{ fontSize:11, color:C.muted, fontFamily:C.mono }}>{NETWORK.name}{NETWORK.local ? " — valueless test ETH" : ""}</span>
        {account && isAdmin && (
          <>
            <Btn size="sm" variant={view==="admin"?"primary":"ghost"} onClick={()=>onSwitchView("admin")}>Admin</Btn>
            <Btn size="sm" variant={view==="voter"?"primary":"ghost"} onClick={()=>onSwitchView("voter")}>Voter View</Btn>
          </>
        )}
      </div>
      {account && (
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, fontFamily:C.mono, color:C.muted }}>{short(account)}</span>
          <Badge label={isAdmin?"Admin":"Voter"} color={isAdmin?"created":"active"}/>
          <Btn size="sm" variant="ghost" onClick={onDisconnect} disabled={loading}>Disconnect</Btn>
        </div>
      )}
    </div>
  );
}

// Election sidebar — defined outside App, receives stable handler refs
function ElectionSidebar({
  elections, selElection, onSelect, onRefresh,
  showCreate, elName, onElNameChange, onCreate, loading,
  crMode, onToggleCrMode,
  schedule, onSchedule,
  hideEnded, onToggleHideEnded,
}) {
  const visible = hideEnded ? elections.filter(e=>e.state!=="ended") : elections;
  const endedCount = elections.filter(e=>e.state==="ended").length;

  return (
    <div className="election-sidebar" style={{ width:272, borderRight:`1px solid ${C.border}`, padding:20, overflowY:"auto", flexShrink:0, display:"flex", flexDirection:"column", gap:0 }}>
      {/* Create election */}
      {showCreate && (
        <div style={{ marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
            New Election
          </div>
          <input
            aria-label="Election name"
            value={elName}
            placeholder="e.g. Student Council 2025"
            onChange={onElNameChange}
            style={{
              width:"100%", padding:"9px 12px", background:C.surface2,
              border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
              fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:8,
            }}
          />
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <input type="checkbox" id="crMode" checked={crMode} onChange={onToggleCrMode}
              style={{ cursor:"pointer", accentColor:C.gold }}/>
            <label htmlFor="crMode" style={{ fontSize:12, color:C.muted, cursor:"pointer", lineHeight:1.4 }}>
              Commit-reveal — choices are concealed until reveal, then become public with the voter's wallet
            </label>
          </div>
          {V2 && <>
            <RawInput label="Voting starts (local time)" type="datetime-local" value={schedule.start} onChange={e=>onSchedule({...schedule,start:e.target.value})}/>
            <RawInput label={crMode ? "Commit closes (local time)" : "Voting closes (local time)"} type="datetime-local" value={schedule.votingEnd} onChange={e=>onSchedule({...schedule,votingEnd:e.target.value})}/>
            {crMode && <RawInput label="Reveal closes (local time)" type="datetime-local" value={schedule.end} onChange={e=>onSchedule({...schedule,end:e.target.value})}/>}
            <p style={{ color:C.muted, fontSize:11 }}>New deployments allow any positive phase duration, including one minute. Older deployments may require longer windows. Short windows risk missed transactions and uncounted reveals. Seal setup before voting starts; the published schedule cannot be changed.</p>
          </>}
          <Btn variant="primary" onClick={onCreate} disabled={loading||!elName} full>
            Create {crMode ? "Commit-Reveal " : ""}Election
          </Btn>
        </div>
      )}

      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.1em" }}>
          Elections
        </div>
        <Btn size="sm" variant="ghost" onClick={onRefresh}>↻</Btn>
      </div>

      {/* Hide-ended toggle */}
      {endedCount>0 && (
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
          <input type="checkbox" id="hideEnded" checked={hideEnded} onChange={onToggleHideEnded}
            style={{ cursor:"pointer", accentColor:C.gold }}/>
          <label htmlFor="hideEnded" style={{ fontSize:12, color:C.muted, cursor:"pointer" }}>
            Hide ended ({endedCount})
          </label>
        </div>
      )}

      {/* Election list */}
      {visible.length===0 ? (
        <div style={{ color:C.muted, fontSize:13, lineHeight:1.7, padding:"8px 0" }}>
          {elections.length===0 ? "No elections yet." : "All elections are hidden."}
        </div>
      ) : (
        visible.map(el => (
          <div key={el.id} onClick={()=>onSelect(el)} style={{
            padding:"11px 14px", borderRadius:8, marginBottom:8, cursor:"pointer",
            background:selElection?.id===el.id ? C.surface2 : "transparent",
            border:`1px solid ${selElection?.id===el.id ? C.gold+"66" : C.border}`,
            transition:"all .15s",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:2 }}>{el.name}</div>
                <div style={{ fontSize:11, color:C.muted, fontFamily:C.mono }}>ID #{el.id}</div>
                {el.totalVotes!=null && (
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                    {el.totalVotes} vote{el.totalVotes!==1?"s":""}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0, marginLeft:8 }}>
                {el.state==="active" && (
                  <span style={{ width:7,height:7,borderRadius:"50%",background:"#3fb950",display:"inline-block" }}/>
                )}
                <Badge label={el.state} color={el.state}/>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Footer: contract link */}
      <div style={{ marginTop:"auto", paddingTop:16, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted }}>
        {NETWORK.explorer ? <a href={`${NETWORK.explorer}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer"
           style={{ color:C.gold, textDecoration:"none" }}>
          View contract ↗
        </a> : <span style={{wordBreak:"break-all"}}>Local contract: {CONTRACT_ADDRESS}</span>}
      </div>
    </div>
  );
}


export { C, short, Btn, RawInput, Card, SectionTitle, Badge, Toast, ConfirmModal, CopyBtn, BarChart, Outcome, TxLog, Topbar, ElectionSidebar };
