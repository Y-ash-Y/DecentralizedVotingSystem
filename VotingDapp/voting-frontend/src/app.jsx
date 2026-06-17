import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS, CONTRACT_ABI,
  SEPOLIA_CHAIN_ID, SEPOLIA_HEX, SEPOLIA_EXPLORER, SEPOLIA_RPC,
} from "./contract.js";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2330", border:"#30363d",
  gold:"#d4a017", green:"#238636", red:"#b91c1c", blue:"#1d4ed8",
  text:"#e6edf3", muted:"#8b949e",
  mono:"'Space Mono',monospace", sans:"'DM Sans',sans-serif",
};

const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "";
const sleep  = ms => new Promise(r => setTimeout(r, ms));

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
  return (
    <div style={{ marginBottom:12 }}>
      {label && (
        <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
          {label}
        </div>
      )}
      <input
        type={type} value={value} placeholder={placeholder}
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
  const map = { active:"#238636", ended:"#6e7681", created:"#8a6800", reveal:"#1d4ed8" };
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
    if (!msg) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  const col = msg.startsWith("❌") ? C.red : msg.startsWith("⏳") ? C.gold : C.green;
  return (
    <div onClick={onDismiss} style={{
      background:col+"18", border:`1px solid ${col}44`,
      padding:"10px 14px", borderRadius:8, fontSize:13, color:col,
      marginBottom:16, cursor:"pointer", userSelect:"none",
      display:"flex", justifyContent:"space-between", alignItems:"center",
    }}>
      <span>{msg}</span>
      <span style={{ opacity:.5, fontSize:16, lineHeight:1 }}>×</span>
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
            <a href={`${SEPOLIA_EXPLORER}/tx/${l.hash}`} target="_blank" rel="noreferrer"
               style={{ fontSize:11, color:C.gold, fontFamily:C.mono, textDecoration:"none" }}>
              {short(l.hash)} ↗
            </a>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Top navigation bar
function Topbar({ account, isAdmin, view, onSwitchView, onDisconnect }) {
  return (
    <div style={{
      background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 24px",
      display:"flex", alignItems:"center", justifyContent:"space-between",
      height:52, position:"sticky", top:0, zIndex:100,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontWeight:700, fontSize:15, color:C.text }}>🗳 VoteChain</span>
        <span style={{ fontSize:11, color:C.muted, fontFamily:C.mono }}>Sepolia</span>
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
          <Btn size="sm" variant="ghost" onClick={onDisconnect}>Disconnect</Btn>
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
  hideEnded, onToggleHideEnded,
}) {
  const visible = hideEnded ? elections.filter(e=>e.state!=="ended") : elections;
  const endedCount = elections.filter(e=>e.state==="ended").length;

  return (
    <div style={{ width:272, borderRight:`1px solid ${C.border}`, padding:20, overflowY:"auto", flexShrink:0, display:"flex", flexDirection:"column", gap:0 }}>
      {/* Create election */}
      {showCreate && (
        <div style={{ marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
            New Election
          </div>
          <input
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
              Private election (commit-reveal) — voters submit a hidden vote, then reveal it after a separate reveal phase
            </label>
          </div>
          <Btn variant="primary" onClick={onCreate} disabled={loading||!elName} full>
            Create {crMode ? "Private " : ""}Election
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
        <a href={`${SEPOLIA_EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer"
           style={{ color:C.gold, textDecoration:"none" }}>
          View contract ↗
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──
  const [account,    setAccount]    = useState("");
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [view,       setView]       = useState("connect");
  const [connecting, setConnecting] = useState(false);

  // ── UI ──
  const [status,     setStatus]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [txLogs,     setTxLogs]     = useState([]);
  const [hideEnded,  setHideEnded]  = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // ── Data ──
  const [elections,   setElections]   = useState([]);
  const [selElection, setSelElection] = useState(null);
  const [candidates,  setCandidates]  = useState([]);
  const [voters,      setVoters]      = useState([]);
  const [results,     setResults]     = useState([]);
  const [hasVoted,    setHasVoted]    = useState(false);

  // ── Forms — note: onChange handlers use stable `set*` functions from useState ──
  const [elName,       setElName]       = useState("");
  const [candName,     setCandName]     = useState("");
  const [voterAddr,    setVoterAddr]    = useState("");
  const [selCandId,    setSelCandId]    = useState("");
  const [crMode,       setCrMode]       = useState(false); // new election: commit-reveal?
  const [voteSecret,   setVoteSecret]   = useState("");
  const [hasCommitted, setHasCommitted] = useState(false); // commit-reveal: this wallet committed

  const pollRef = useRef(null);

  // ── MetaMask listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;
    const reload = () => window.location.reload();
    window.ethereum.on("chainChanged",    reload);
    window.ethereum.on("accountsChanged", reload);
    return () => {
      window.ethereum.removeListener("chainChanged",    reload);
      window.ethereum.removeListener("accountsChanged", reload);
    };
  }, []);

  // ── Auto-poll results during active election ───────────────────────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selElection?.state==="active" && candidates.length) {
      pollRef.current = setInterval(() => doLoadResults(selElection.id, candidates), 12000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selElection, candidates]);

  // ── Network ────────────────────────────────────────────────────────────────
  const ensureSepolia = async () => {
    const hex = await window.ethereum.request({ method:"eth_chainId" });
    if (parseInt(hex,16)===SEPOLIA_CHAIN_ID) return;
    try {
      await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{chainId:SEPOLIA_HEX}] });
    } catch(err) {
      if (err.code===4902) {
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[{
          chainId:SEPOLIA_HEX, chainName:"Sepolia Test Network",
          nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},
          rpcUrls:[SEPOLIA_RPC], blockExplorerUrls:[SEPOLIA_EXPLORER],
        }]});
      } else throw err;
    }
  };

  const getReadContract = async () => {
    await ensureSepolia();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, new ethers.BrowserProvider(window.ethereum));
  };

  const getSignerContract = async () => {
    await ensureSepolia();
    const p = new ethers.BrowserProvider(window.ethereum);
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await p.getSigner());
  };

  // ── TX wrapper ─────────────────────────────────────────────────────────────
  const sendTx = async (fn, successMsg) => {
    setLoading(true);
    setStatus("⏳ Approve the transaction in MetaMask…");
    try {
      const tx      = await fn();
      setStatus("⏳ Transaction sent — waiting for confirmation…");
      const receipt = await tx.wait();
      setStatus(`✅ ${successMsg}`);
      setTxLogs(prev => [...prev, { msg:successMsg, hash:receipt.hash }]);
      return receipt;
    } catch(err) {
      setStatus(`❌ ${err.reason||err.message||"Transaction failed"}`);
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ── Block range (avoids RPC limits on free public nodes) ──────────────────
  const getFromBlock = async () => {
    const p = new ethers.BrowserProvider(window.ethereum);
    return Math.max(0, await p.getBlockNumber() - 500000);
  };

  // ── Data loaders (event-based — free, no gas, no MetaMask popup) ──────────
  const fetchElections = useCallback(async () => {
    try {
      const rc        = await getReadContract();
      const fromBlock = await getFromBlock();

      const [created, started, revealed, ended, voteEvents, revealEvents] = await Promise.all([
        rc.queryFilter(rc.filters.ElectionCreated(), fromBlock, "latest"),
        rc.queryFilter(rc.filters.ElectionStarted(), fromBlock, "latest"),
        rc.queryFilter(rc.filters.RevealStarted(),   fromBlock, "latest"),
        rc.queryFilter(rc.filters.ElectionEnded(),   fromBlock, "latest"),
        rc.queryFilter(rc.filters.VoteCast(),        fromBlock, "latest"),
        rc.queryFilter(rc.filters.VoteRevealed(),    fromBlock, "latest"),
      ]);

      const startedIds = new Set(started.map(e  => e.args.electionId.toString()));
      const revealIds  = new Set(revealed.map(e => e.args.electionId.toString()));
      const endedIds   = new Set(ended.map(e    => e.args.electionId.toString()));

      // Count votes per election (plain VoteCast + revealed commit-reveal votes)
      const voteCounts = {};
      [...voteEvents, ...revealEvents].forEach(e => {
        const id = e.args.electionId.toString();
        voteCounts[id] = (voteCounts[id]||0) + 1;
      });

      const list = created.map(e => {
        const id    = e.args.electionId.toString();
        const state = endedIds.has(id)   ? "ended"
                    : revealIds.has(id)  ? "reveal"
                    : startedIds.has(id) ? "active"
                    : "created";
        return { id, name:e.args.name, state, commitReveal: e.args.commitReveal, totalVotes: voteCounts[id]??0 };
      });

      setElections(list);
      return list;
    } catch(err) {
      console.error("fetchElections:", err);
      setStatus("❌ Could not load elections: " + err.message);
      return [];
    }
  }, []);

  const fetchCandidates = useCallback(async (electionId) => {
    try {
      const rc        = await getReadContract();
      const fromBlock = await getFromBlock();
      const all       = await rc.queryFilter(rc.filters.CandidateAdded(), fromBlock, "latest");
      const list      = all
        .filter(e => e.args.electionId.toString()===electionId.toString())
        .map(e   => ({ id:e.args.candidateId.toString(), name:e.args.name }));
      setCandidates(list);
      return list;
    } catch(err) { console.error("fetchCandidates:", err); return []; }
  }, []);

  const fetchVoters = useCallback(async (electionId) => {
    try {
      const rc        = await getReadContract();
      const fromBlock = await getFromBlock();
      const all       = await rc.queryFilter(rc.filters.VoterAuthorized(), fromBlock, "latest");
      const filtered  = all.filter(e => e.args.electionId.toString()===electionId.toString());
      setVoters(filtered.map(e => e.args.voter));
    } catch(err) { console.error("fetchVoters:", err); }
  }, []);

  const doLoadResults = useCallback(async (electionId, cands) => {
    const list = cands || candidates;
    if (!list.length) return;
    try {
      const rc   = await getReadContract();
      const data = await Promise.all(
        list.map(async c => {
          try {
            const v = await rc.getCandidateVotes(Number(electionId), Number(c.id));
            return { ...c, votes:Number(v) };
          } catch { return { ...c, votes:0 }; }
        })
      );
      setResults(data);
    } catch(err) { console.error("loadResults:", err); }
  }, [candidates]);

  // Tracks, for the connected wallet: has it voted (plain VoteCast or a revealed
  // commit-reveal vote), and — for commit-reveal — has it committed yet.
  const checkVoteStatus = useCallback(async (electionId, addr) => {
    try {
      const rc        = await getReadContract();
      const fromBlock = await getFromBlock();
      const [cast, committed, revealed] = await Promise.all([
        rc.queryFilter(rc.filters.VoteCast(),      fromBlock, "latest"),
        rc.queryFilter(rc.filters.VoteCommitted(), fromBlock, "latest"),
        rc.queryFilter(rc.filters.VoteRevealed(),  fromBlock, "latest"),
      ]);
      const mine = ev => ev
        .filter(e => e.args.electionId.toString()===electionId.toString())
        .some(e => e.args.voter.toLowerCase()===addr.toLowerCase());
      setHasVoted(mine(cast) || mine(revealed));
      setHasCommitted(mine(committed));
    } catch { setHasVoted(false); setHasCommitted(false); }
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (!window.ethereum) { alert("Please install MetaMask"); return; }
    setConnecting(true);
    setStatus("⏳ Connecting…");
    try {
      const accounts  = await window.ethereum.request({ method:"eth_requestAccounts" });
      await ensureSepolia();
      const userAddr  = accounts[0];
      const rc        = await getReadContract();
      const adminAddr = await rc.superAdmin();
      const admin     = adminAddr.toLowerCase()===userAddr.toLowerCase();
      setAccount(userAddr); setIsAdmin(admin);
      setStatus("✅ Connected to Sepolia");
      await fetchElections();
      setView(admin ? "admin" : "voter");
    } catch(err) {
      setStatus("❌ " + (err.message||"Connection failed"));
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(""); setIsAdmin(false); setView("connect");
    setElections([]); setSelElection(null); setCandidates([]);
    setVoters([]); setResults([]); setStatus("");
  };

  // ── Select election ────────────────────────────────────────────────────────
  const selectElection = async (el) => {
    setSelElection(el); setResults([]); setSelCandId(""); setVoteSecret("");
    const cands = await fetchCandidates(el.id);
    await fetchVoters(el.id);
    if (el.state==="ended") await doLoadResults(el.id, cands);
    if (account)            await checkVoteStatus(el.id, account);
  };

  const handleSwitchView = async (v) => {
    setView(v);
    if (v==="voter" && selElection) {
      await fetchCandidates(selElection.id);
      await checkVoteStatus(selElection.id, account);
    }
  };

  // ── Admin actions ──────────────────────────────────────────────────────────
  const handleCreateElection = async () => {
    const c = await getSignerContract();
    const r = await sendTx(
      () => c.createElection(elName, 0, 9999999999, crMode),
      `${crMode ? "Private election" : "Election"} "${elName}" created`
    );
    if (r) { setElName(""); setCrMode(false); await sleep(1500); await fetchElections(); }
  };

  // Add one or many candidates in a single transaction (split on newlines or commas).
  const handleAddCandidates = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const names = candName.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
    if (!names.length) { setStatus("❌ Enter at least one candidate name"); return; }
    const c = await getSignerContract();
    const r = await sendTx(
      () => c.addCandidates(Number(selElection.id), names),
      names.length===1 ? `Candidate "${names[0]}" added` : `${names.length} candidates added`
    );
    if (r) { setCandName(""); await sleep(1000); await fetchCandidates(selElection.id); }
  };

  // Authorize one or many voters in a single transaction (whitespace/comma separated).
  const handleAuthorizeVoters = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const addrs = voterAddr.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
    if (!addrs.length) { setStatus("❌ Enter at least one wallet address"); return; }
    const bad = addrs.find(a => !ethers.isAddress(a));
    if (bad) { setStatus(`❌ Invalid address: ${bad}`); return; }
    const c = await getSignerContract();
    const r = await sendTx(
      () => c.authorizeVoters(Number(selElection.id), addrs),
      addrs.length===1 ? `Voter ${short(addrs[0])} authorized` : `${addrs.length} voters authorized`
    );
    if (r) { setVoterAddr(""); await sleep(1000); await fetchVoters(selElection.id); }
  };

  const handleStart = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const msg = selElection.commitReveal
      ? "Election started — commit phase is open"
      : "Election started — voting is open";
    const r = await sendTx(() => c.startElection(Number(selElection.id)), msg);
    if (r) {
      const u = { ...selElection, state:"active" };
      setSelElection(u);
      setElections(prev => prev.map(e => e.id===selElection.id ? u : e));
    }
  };

  const handleStartReveal = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.startReveal(Number(selElection.id)), "Reveal phase started — voters can now reveal their votes");
    if (r) {
      const u = { ...selElection, state:"reveal" };
      setSelElection(u);
      setElections(prev => prev.map(e => e.id===selElection.id ? u : e));
    }
  };

  const handleEnd = async () => {
    setConfirmEnd(false);
    const c = await getSignerContract();
    const r = await sendTx(() => c.endElection(Number(selElection.id)), "Election ended — results are now public");
    if (r) {
      const u = { ...selElection, state:"ended" };
      setSelElection(u);
      setElections(prev => prev.map(e => e.id===selElection.id ? u : e));
      await sleep(1000);
      await doLoadResults(selElection.id, candidates);
    }
  };

  // ── Vote (plain elections) ───────────────────────────────────────────────────
  const handleVote = async () => {
    if (!selElection||!selCandId) { setStatus("❌ Select a candidate first"); return; }
    if (hasVoted) { setStatus("❌ Already voted in this election"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.vote(Number(selElection.id), Number(selCandId)), "Vote cast — permanently recorded on Ethereum");
    if (r) { setHasVoted(true); setSelCandId(""); }
  };

  // localStorage key so a committed vote can be re-loaded for the reveal step.
  const crKey = (electionId, addr) => `vc_cr_${CONTRACT_ADDRESS}_${electionId}_${(addr||"").toLowerCase()}`;

  // ── Commit-reveal phase 1 — commit a hidden vote ─────────────────────────────
  const handleCommit = async () => {
    if (!selElection||!selCandId) { setStatus("❌ Select a candidate first"); return; }
    if (hasCommitted) { setStatus("❌ Already committed in this election"); return; }
    const secret     = voteSecret || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
    const commitment = ethers.solidityPackedKeccak256(
      ["uint256", "string", "address"], [Number(selCandId), secret, account]
    );
    const c = await getSignerContract();
    const r = await sendTx(
      () => c.commitVote(Number(selElection.id), commitment),
      "Vote committed — save your secret to reveal it after the reveal phase opens"
    );
    if (r) {
      try { localStorage.setItem(crKey(selElection.id, account), JSON.stringify({ candidateId:selCandId, secret })); } catch {}
      setVoteSecret(secret);
      setHasCommitted(true);
    }
  };

  // ── Commit-reveal phase 2 — reveal the committed vote ────────────────────────
  const handleReveal = async () => {
    if (!selElection||!selCandId) { setStatus("❌ Select the candidate you committed to"); return; }
    if (!voteSecret) { setStatus("❌ Enter your secret phrase"); return; }
    if (hasVoted) { setStatus("❌ Already revealed in this election"); return; }
    const c = await getSignerContract();
    const r = await sendTx(
      () => c.revealVote(Number(selElection.id), Number(selCandId), voteSecret),
      "Vote revealed and counted on Ethereum"
    );
    if (r) {
      try { localStorage.removeItem(crKey(selElection.id, account)); } catch {}
      setHasVoted(true);
    }
  };

  // Pre-fill the reveal form from a locally-saved commitment, if present.
  const loadSavedCommitment = () => {
    try {
      const raw = localStorage.getItem(crKey(selElection.id, account));
      if (raw) {
        const { candidateId, secret } = JSON.parse(raw);
        setSelCandId(candidateId); setVoteSecret(secret);
        setStatus("✅ Loaded your saved commitment — confirm below to reveal");
      } else {
        setStatus("⏳ No saved commitment on this device — enter your candidate and secret manually");
      }
    } catch { setStatus("❌ Could not read saved commitment"); }
  };

  // ── Statistics card ────────────────────────────────────────────────────────
  const StatsCard = () => {
    if (!selElection||!candidates.length) return null;
    const totalVotes  = results.length ? results.reduce((s,r)=>s+r.votes,0) : selElection.totalVotes||0;
    const turnout     = voters.length ? ((totalVotes/voters.length)*100).toFixed(1) : "—";
    const winner      = results.length ? [...results].sort((a,b)=>b.votes-a.votes)[0] : null;
    return (
      <Card>
        <SectionTitle>Election Statistics</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {[
            { label:"Candidates", value:candidates.length },
            { label:"Authorized Voters", value:voters.length },
            { label:"Votes Cast", value:totalVotes },
            { label:"Turnout", value:`${turnout}%` },
            { label:"Status", value:selElection.state },
            { label:winner?"Leading":"Winner", value:winner?winner.name:"—" },
          ].map(s => (
            <div key={s.label} style={{ background:C.surface2, borderRadius:8, padding:"10px 12px" }}>
              <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:16, fontWeight:600, color:C.text }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────────

  // ── Connect screen ─────────────────────────────────────────────────────────
  if (view==="connect") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 1px 1px, #30363d 1px, transparent 0)", backgroundSize:"32px 32px", opacity:.3, pointerEvents:"none" }}/>
      <div style={{ position:"relative", textAlign:"center", maxWidth:400 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🗳</div>
        <h1 style={{ fontSize:28, fontWeight:700, color:C.text, marginBottom:8, fontFamily:C.sans }}>VoteChain</h1>
        <p style={{ color:C.muted, fontSize:14, lineHeight:1.7, marginBottom:28 }}>
          Decentralised, tamper-proof elections on Ethereum Sepolia.<br/>
          <span style={{ fontFamily:C.mono, fontSize:12 }}>{CONTRACT_ADDRESS.slice(0,14)}…</span>
        </p>
        <Btn size="lg" onClick={connectWallet} disabled={connecting} full>
          {connecting ? "Connecting…" : "Connect MetaMask"}
        </Btn>
        <Toast msg={status} onDismiss={()=>setStatus("")}/>
        <p style={{ color:C.muted, fontSize:11, marginTop:16, lineHeight:1.9 }}>
          Deployer wallet → Admin Dashboard<br/>
          Any other wallet → Voter Interface
        </p>
      </div>
    </div>
  );

  // ── Shared layout (inlined as variables — never a component, so no remount) ─
  const topbar = (
    <Topbar account={account} isAdmin={isAdmin} view={view}
      onSwitchView={handleSwitchView} onDisconnect={disconnectWallet}/>
  );

  const sidebar = (
    <ElectionSidebar
      elections={elections} selElection={selElection}
      onSelect={selectElection} onRefresh={fetchElections}
      showCreate={view==="admin"}
      elName={elName}
      onElNameChange={e => setElName(e.target.value)}
      onCreate={handleCreateElection}
      loading={loading}
      crMode={crMode}
      onToggleCrMode={e => setCrMode(e.target.checked)}
      hideEnded={hideEnded}
      onToggleHideEnded={e => setHideEnded(e.target.checked)}
    />
  );

  // ── Admin view ─────────────────────────────────────────────────────────────
  if (view==="admin") return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      {topbar}
      <ConfirmModal
        open={confirmEnd}
        title="End this election?"
        body={`This will permanently close "${selElection?.name}" and make results public. Voters will no longer be able to cast ballots. This action cannot be undone on the blockchain.`}
        onConfirm={handleEnd}
        onCancel={()=>setConfirmEnd(false)}
        confirmLabel="End Election"
        variant="danger"
      />
      <div style={{ display:"flex", minHeight:"calc(100vh - 52px)" }}>
        {sidebar}
        <div style={{ flex:1, padding:24, overflowY:"auto" }}>
          <Toast msg={status} onDismiss={()=>setStatus("")}/>
          {!selElection ? (
            <div style={{ color:C.muted, fontSize:14, paddingTop:80, textAlign:"center" }}>
              ← Create a new election or click one to manage it
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                <div>
                  <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:6 }}>{selElection.name}</h2>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {selElection.state==="active" && <span style={{ width:7,height:7,borderRadius:"50%",background:"#3fb950",display:"inline-block" }}/>}
                    <Badge label={selElection.state==="active"&&selElection.commitReveal ? "commit" : selElection.state} color={selElection.state}/>
                    {selElection.commitReveal && <Badge label="🔒 private" color={C.blue}/>}
                    <span style={{ fontSize:11, fontFamily:C.mono, color:C.muted }}>ID #{selElection.id}</span>
                  </div>
                </div>
                <div>
                  {selElection.state==="created" && (
                    <Btn variant="success" onClick={handleStart} disabled={loading}>▶ Start Election</Btn>
                  )}
                  {selElection.state==="active" && selElection.commitReveal && (
                    <Btn variant="info" onClick={handleStartReveal} disabled={loading}>🔓 Start Reveal Phase</Btn>
                  )}
                  {selElection.state==="active" && !selElection.commitReveal && (
                    <Btn variant="danger" onClick={()=>setConfirmEnd(true)} disabled={loading}>⏹ End Election</Btn>
                  )}
                  {selElection.state==="reveal" && (
                    <Btn variant="danger" onClick={()=>setConfirmEnd(true)} disabled={loading}>⏹ End Election</Btn>
                  )}
                </div>
              </div>

              <StatsCard/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {/* Candidates */}
                <Card>
                  <SectionTitle>Candidates ({candidates.length})</SectionTitle>
                  {selElection.state==="created" && (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
                        Candidate Names — one per line
                      </div>
                      <textarea
                        value={candName} onChange={e=>setCandName(e.target.value)} rows={4}
                        placeholder={"Alice Sharma\nBob Mehta\nCarol Singh"}
                        style={{
                          width:"100%", padding:"9px 12px", background:C.surface2,
                          border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
                          fontSize:13, fontFamily:C.sans, outline:"none", boxSizing:"border-box",
                          resize:"vertical", marginBottom:6,
                        }}
                      />
                      <Btn variant="primary" size="sm" onClick={handleAddCandidates} disabled={loading||!candName.trim()}>
                        Add Candidate{candName.split(/[\n,]+/).filter(s=>s.trim()).length>1?"s":""}
                      </Btn>
                      <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
                        Add all candidates at once — a single MetaMask signature for the whole list.
                      </div>
                    </div>
                  )}
                  {selElection.state!=="created" && candidates.length===0 && (
                    <div style={{ color:C.muted, fontSize:12 }}>No candidates were registered.</div>
                  )}
                  {candidates.length>0 && (
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead><tr>
                        <th style={{ textAlign:"left", padding:"6px 4px", color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>ID</th>
                        <th style={{ textAlign:"left", padding:"6px 4px", color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>Name</th>
                        {results.length>0 && <th style={{ textAlign:"right", padding:"6px 4px", color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>Votes</th>}
                      </tr></thead>
                      <tbody>
                        {candidates.map(c => {
                          const r   = results.find(x=>x.id===c.id);
                          const win = results.length>0 && r?.votes===Math.max(...results.map(x=>x.votes)) && r?.votes>0;
                          return (
                            <tr key={c.id} style={{ borderBottom:`1px solid ${C.border}22` }}>
                              <td style={{ padding:"7px 4px", color:C.muted, fontFamily:C.mono, fontSize:11 }}>#{c.id}</td>
                              <td style={{ padding:"7px 4px", fontWeight:win?600:400, color:win?C.gold:C.text }}>{c.name}{win?" 🏆":""}</td>
                              {results.length>0 && <td style={{ padding:"7px 4px", textAlign:"right", fontFamily:C.mono, color:C.gold }}>{r?.votes??0}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </Card>

                {/* Voters */}
                <Card>
                  <SectionTitle>Authorized Voters ({voters.length})</SectionTitle>
                  {selElection.state!=="ended" && (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
                        Voter Wallet Addresses — one per line
                      </div>
                      <textarea
                        value={voterAddr} onChange={e=>setVoterAddr(e.target.value)} rows={4}
                        placeholder={"0xabc…\n0xdef…\n0x123…"}
                        style={{
                          width:"100%", padding:"9px 12px", background:C.surface2,
                          border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
                          fontSize:13, fontFamily:C.mono, outline:"none", boxSizing:"border-box",
                          resize:"vertical", marginBottom:6,
                        }}
                      />
                      <Btn variant="primary" size="sm" onClick={handleAuthorizeVoters} disabled={loading||!voterAddr.trim()}>
                        Authorize Voter{voterAddr.trim().split(/[\s,]+/).filter(Boolean).length>1?"s":""}
                      </Btn>
                      <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
                        Paste a whole list — all authorized in a single MetaMask signature.
                      </div>
                    </div>
                  )}
                  <div style={{ maxHeight:160, overflowY:"auto" }}>
                    {voters.length===0
                      ? <div style={{ color:C.muted, fontSize:12 }}>No voters authorized yet.</div>
                      : voters.map((v,i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 0", borderBottom:i<voters.length-1?`1px solid ${C.border}22`:"" }}>
                            <span style={{ fontFamily:C.mono, fontSize:11, color:C.muted }}>{v.slice(0,18)}…</span>
                            <CopyBtn text={v}/>
                          </div>
                        ))
                    }
                  </div>
                </Card>
              </div>

              {/* Results chart */}
              {selElection.state==="ended" && (
                <Card style={{ marginTop:16 }}>
                  <SectionTitle action={<Btn size="sm" variant="ghost" onClick={()=>doLoadResults(selElection.id,candidates)}>Reload</Btn>}>
                    Final Results
                  </SectionTitle>
                  {results.length===0
                    ? <Btn variant="success" onClick={()=>doLoadResults(selElection.id,candidates)}>Load Results</Btn>
                    : <BarChart data={results}/>
                  }
                </Card>
              )}

              {/* Redeploy / reset note */}
              {isAdmin && (
                <Card style={{ marginTop:8, borderColor:C.red+"44" }}>
                  <SectionTitle>Reset / Fresh Deployment</SectionTitle>
                  <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:12 }}>
                    Blockchain data is <strong style={{ color:C.text }}>immutable</strong> — elections recorded on Sepolia cannot be deleted from the chain. To start completely fresh (new contract, empty election list), redeploy:
                  </p>
                  <div style={{ fontFamily:C.mono, fontSize:12, background:C.surface2, padding:"10px 14px", borderRadius:8, color:C.gold, marginBottom:12 }}>
                    cd VotingDapp<br/>
                    npx hardhat run scripts/deploy.js --network sepolia
                  </div>
                  <p style={{ fontSize:12, color:C.muted }}>
                    Then update <code style={{ color:C.gold }}>CONTRACT_ADDRESS</code> in <code style={{ color:C.gold }}>contract.js</code> with the new address. The "Hide ended" toggle in the sidebar lets you clean up the view without redeploying.
                  </p>
                </Card>
              )}

              <TxLog logs={txLogs}/>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── Voter view ─────────────────────────────────────────────────────────────
  // Can the voter still pick a candidate? Commit phase (CR) blocks once committed;
  // plain voting and the reveal phase block once the vote is recorded.
  const canPick = !!selElection && (
    selElection.state==="active"
      ? (selElection.commitReveal ? !hasCommitted : !hasVoted)
      : selElection.state==="reveal" && selElection.commitReveal && !hasVoted
  );
  if (view==="voter") return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      {topbar}
      <div style={{ display:"flex", minHeight:"calc(100vh - 52px)" }}>
        {sidebar}
        <div style={{ flex:1, padding:24, overflowY:"auto" }}>
          <Toast msg={status} onDismiss={()=>setStatus("")}/>
          {!selElection ? (
            <div style={{ color:C.muted, fontSize:14, paddingTop:80, textAlign:"center" }}>
              ← Select an election from the sidebar to view candidates or cast your vote
            </div>
          ) : (
            <>
              <div style={{ marginBottom:20 }}>
                <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:6 }}>{selElection.name}</h2>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {selElection.state==="active" && <span style={{ width:7,height:7,borderRadius:"50%",background:"#3fb950",display:"inline-block" }}/>}
                  <Badge label={selElection.state==="active"&&selElection.commitReveal ? "commit" : selElection.state} color={selElection.state}/>
                  {selElection.commitReveal && <Badge label="🔒 private" color={C.blue}/>}
                  {selElection.state==="active"  && <span style={{ fontSize:12, color:C.muted }}>{selElection.commitReveal ? "Commit phase open — submit a hidden vote" : "Voting is open"}</span>}
                  {selElection.state==="reveal"  && <span style={{ fontSize:12, color:C.muted }}>Reveal phase — reveal your committed vote</span>}
                  {selElection.state==="created" && <span style={{ fontSize:12, color:C.muted }}>Voting has not started yet</span>}
                  {selElection.state==="ended"   && <span style={{ fontSize:12, color:C.muted }}>Election closed</span>}
                </div>
              </div>

              {/* Identity card */}
              <Card style={{ background:"#0d1f2d", borderColor:"#1e3a5f" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Voting as:</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontFamily:C.mono, fontSize:12, color:C.text, wordBreak:"break-all" }}>{account}</span>
                  <CopyBtn text={account}/>
                </div>
                <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
                  This wallet must be authorized by the election admin to cast a vote.
                  Switch accounts in MetaMask if needed, then reconnect.
                </div>
              </Card>

              {/* Candidates table */}
              <Card>
                <SectionTitle action={<Btn size="sm" variant="ghost" onClick={()=>fetchCandidates(selElection.id)}>Refresh</Btn>}>
                  Candidates
                </SectionTitle>
                {candidates.length===0 ? (
                  <div style={{ color:C.muted, fontSize:13 }}>
                    No candidates registered yet. Click Refresh to reload.
                  </div>
                ) : (
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead><tr>
                      <th style={{ textAlign:"left", padding:8, color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>ID</th>
                      <th style={{ textAlign:"left", padding:8, color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>Candidate</th>
                      {canPick && <th style={{ padding:8, borderBottom:`1px solid ${C.border}` }}/>}
                    </tr></thead>
                    <tbody>
                      {candidates.map(c => (
                        <tr key={c.id}
                          onClick={()=>canPick&&setSelCandId(c.id)}
                          style={{
                            borderBottom:`1px solid ${C.border}22`,
                            background:selCandId===c.id?C.gold+"11":"transparent",
                            cursor:canPick?"pointer":"default",
                            transition:"background .1s",
                          }}
                        >
                          <td style={{ padding:"11px 8px", fontFamily:C.mono, fontSize:11, color:C.muted }}>#{c.id}</td>
                          <td style={{ padding:"11px 8px", fontWeight:selCandId===c.id?600:400, color:selCandId===c.id?C.gold:C.text }}>
                            {c.name}{selCandId===c.id?" ← selected":""}
                          </td>
                          {canPick && (
                            <td style={{ padding:"11px 8px", textAlign:"right" }}>
                              <Btn size="sm" variant={selCandId===c.id?"primary":"ghost"}
                                onClick={ev=>{ev.stopPropagation();setSelCandId(c.id);}}>
                                Select
                              </Btn>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {/* Plain voting */}
              {selElection.state==="active" && !selElection.commitReveal && (
                <Card>
                  <SectionTitle>Cast Your Vote</SectionTitle>
                  {hasVoted ? (
                    <div style={{ color:C.green, fontSize:13 }}>
                      ✅ Your vote is permanently and immutably recorded on Ethereum.
                    </div>
                  ) : !selCandId ? (
                    <div style={{ color:C.muted, fontSize:13 }}>
                      Click a row in the table above to select your candidate, then confirm below.
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom:14, padding:12, background:C.surface2, borderRadius:8, fontSize:13 }}>
                        Voting for: <strong style={{ color:C.gold }}>{candidates.find(c=>c.id===selCandId)?.name}</strong>
                        <div style={{ color:C.muted, fontSize:11, marginTop:4 }}>
                          Once submitted, your vote is permanently recorded on Ethereum and cannot be changed.
                        </div>
                      </div>
                      <Btn variant="primary" size="lg" onClick={handleVote} disabled={loading}>🗳 Cast Vote</Btn>
                    </>
                  )}
                </Card>
              )}

              {/* Commit-reveal — phase 1: commit */}
              {selElection.state==="active" && selElection.commitReveal && (
                <Card>
                  <SectionTitle>Commit Your Vote (Private)</SectionTitle>
                  {hasCommitted ? (
                    <div style={{ fontSize:13, color:C.green, lineHeight:1.7 }}>
                      🔒 Your hidden vote is committed on-chain. When the admin opens the reveal phase, come back here to reveal it.
                      {voteSecret && (
                        <div style={{ marginTop:10, padding:10, background:C.surface2, borderRadius:8, fontFamily:C.mono, fontSize:11, color:C.gold, wordBreak:"break-all" }}>
                          Secret (save this): {voteSecret}
                        </div>
                      )}
                    </div>
                  ) : !selCandId ? (
                    <div style={{ color:C.muted, fontSize:13 }}>
                      Select a candidate above, then commit a hashed vote. Your choice stays hidden on-chain until you reveal it later.
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom:12, padding:"10px 12px", background:C.blue+"14", border:`1px solid ${C.blue}44`, borderRadius:8, fontSize:12, color:"#93b4ff", lineHeight:1.6 }}>
                        Your vote is hashed with a secret before being sent, so no one can see your choice on-chain during voting. You reveal the secret after the commit phase closes to have it counted.
                      </div>
                      <div style={{ marginBottom:14, padding:12, background:C.surface2, borderRadius:8, fontSize:13 }}>
                        Committing to: <strong style={{ color:C.gold }}>{candidates.find(c=>c.id===selCandId)?.name}</strong>
                      </div>
                      <RawInput label="Secret phrase (auto-generated if blank)" placeholder="your-secret-phrase"
                        value={voteSecret} onChange={e=>setVoteSecret(e.target.value)} mono
                        hint="Saved in this browser for the reveal step — but keep your own copy too."/>
                      <Btn variant="primary" size="lg" onClick={handleCommit} disabled={loading}>🔒 Commit Vote</Btn>
                    </>
                  )}
                </Card>
              )}

              {/* Commit-reveal — phase 2: reveal */}
              {selElection.state==="reveal" && selElection.commitReveal && (
                <Card>
                  <SectionTitle action={<Btn size="sm" variant="ghost" onClick={loadSavedCommitment}>Load saved</Btn>}>
                    Reveal Your Vote
                  </SectionTitle>
                  {hasVoted ? (
                    <div style={{ color:C.green, fontSize:13 }}>
                      ✅ Your vote has been revealed and counted on Ethereum.
                    </div>
                  ) : !hasCommitted ? (
                    <div style={{ color:C.muted, fontSize:13 }}>
                      You did not commit a vote during the commit phase, so there is nothing to reveal.
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom:12, padding:"10px 12px", background:C.blue+"14", border:`1px solid ${C.blue}44`, borderRadius:8, fontSize:12, color:"#93b4ff", lineHeight:1.6 }}>
                        Reveal the candidate and secret you committed to. The contract re-hashes them and only counts your vote if they match your original commitment. "Load saved" fills these in if you committed on this browser.
                      </div>
                      <div style={{ marginBottom:6, fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                        Candidate you committed to
                      </div>
                      <div style={{ marginBottom:12 }}>
                        {candidates.map(c => (
                          <Btn key={c.id} size="sm" variant={selCandId===c.id?"primary":"ghost"} onClick={()=>setSelCandId(c.id)}>
                            {c.name}
                          </Btn>
                        ))}
                      </div>
                      <RawInput label="Secret phrase" placeholder="the secret you used to commit"
                        value={voteSecret} onChange={e=>setVoteSecret(e.target.value)} mono/>
                      <Btn variant="success" size="lg" onClick={handleReveal} disabled={loading||!selCandId||!voteSecret}>🔓 Reveal Vote</Btn>
                    </>
                  )}
                </Card>
              )}

              {/* Results */}
              {selElection.state==="ended" && (
                <Card>
                  <SectionTitle action={<Btn size="sm" variant="ghost" onClick={()=>doLoadResults(selElection.id,candidates)}>Refresh</Btn>}>
                    Final Results
                  </SectionTitle>
                  {results.length===0
                    ? <Btn variant="success" onClick={()=>doLoadResults(selElection.id,candidates)}>Load Results</Btn>
                    : <>
                        <BarChart data={results}/>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, marginTop:16 }}>
                          <tbody>
                            {[...results].sort((a,b)=>b.votes-a.votes).map((r,i)=>(
                              <tr key={r.id} style={{ borderBottom:`1px solid ${C.border}22`, background:i===0?C.gold+"11":"transparent" }}>
                                <td style={{ padding:"9px 8px", color:C.muted, fontSize:11, fontFamily:C.mono }}>#{r.id}</td>
                                <td style={{ padding:"9px 8px", fontWeight:i===0?600:400, color:i===0?C.gold:C.text }}>
                                  {r.name}{i===0&&r.votes>0?" 🏆":""}
                                </td>
                                <td style={{ padding:"9px 8px", textAlign:"right", fontFamily:C.mono, fontWeight:600, color:i===0?C.gold:C.text }}>
                                  {r.votes} {r.votes===1?"vote":"votes"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                  }
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return null;
}
