import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS, CONTRACT_ABI,
  SEPOLIA_CHAIN_ID, SEPOLIA_HEX, SEPOLIA_EXPLORER, SEPOLIA_RPC,
} from "./contract.js";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2330", border:"#30363d",
  gold:"#d4a017", green:"#238636", red:"#b91c1c",
  text:"#e6edf3", muted:"#8b949e",
  mono:"'Space Mono',monospace", sans:"'DM Sans',sans-serif",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "";
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// ── Atoms ─────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant="primary", size="md", disabled, full }) {
  const sz = { sm:{padding:"5px 12px",fontSize:"12px"}, md:{padding:"8px 18px",fontSize:"13px"}, lg:{padding:"11px 24px",fontSize:"14px"} };
  const va = {
    primary:{ background:C.gold,    color:"#000" },
    danger: { background:C.red,     color:"#fff" },
    success:{ background:C.green,   color:"#fff" },
    ghost:  { background:"transparent", color:C.text, border:`1px solid ${C.border}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily:C.sans, fontWeight:600, border:"none", cursor:disabled?"not-allowed":"pointer",
      borderRadius:8, transition:"all .15s", opacity:disabled?0.5:1,
      width:full?"100%":"auto", marginRight:4, marginBottom:4,
      ...sz[size], ...va[variant],
    }}>
      {children}
    </button>
  );
}

function Input({ label, placeholder, value, onChange, mono, hint }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>{label}</div>}
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{
          width:"100%", padding:"9px 12px", background:C.surface2,
          border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
          fontSize:13, fontFamily:mono?C.mono:C.sans, outline:"none", boxSizing:"border-box",
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

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
      {children}
    </div>
  );
}

function Badge({ label, color }) {
  const map = { active:"#238636", ended:"#6e7681", created:"#8a6800" };
  const c   = map[color] || color;
  return <span style={{ background:c+"22", color:c, padding:"2px 9px", borderRadius:12, fontSize:11, fontWeight:600 }}>{label}</span>;
}

function StatusBanner({ msg }) {
  if (!msg) return null;
  const col = msg.startsWith("❌") ? C.red : msg.startsWith("⏳") ? C.gold : C.green;
  return (
    <div style={{ background:col+"18", border:`1px solid ${col}44`, padding:"10px 14px", borderRadius:8, fontSize:13, color:col, marginBottom:16 }}>
      {msg}
    </div>
  );
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────
function BarChart({ data }) {
  if (!data?.length) return null;
  const W=500, H=160, pad=36;
  const mx = Math.max(...data.map(d=>d.votes), 1);
  const bw = Math.max(20, (W - pad*2)/data.length - 12);
  return (
    <div style={{ background:C.surface2, borderRadius:10, padding:16, overflowX:"auto" }}>
      <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Vote Distribution</div>
      <svg viewBox={`0 0 ${W} ${H+40}`} style={{ width:"100%", maxWidth:W }}>
        {data.map((d,i) => {
          const bh  = Math.max(((d.votes/mx)*H), d.votes>0?2:1);
          const x   = pad + i*((W-pad*2)/data.length)+4;
          const y   = H - bh;
          const win = d.votes===mx && d.votes>0;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} rx={4}
                fill={win?C.gold:C.surface} stroke={win?C.gold:C.border} strokeWidth={1}/>
              {d.votes>0 && <text x={x+bw/2} y={y-5} textAnchor="middle" fill={win?C.gold:C.muted} fontSize={11} fontFamily={C.mono}>{d.votes}</text>}
              <text x={x+bw/2} y={H+16} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily={C.sans}>
                {d.name.length>9?d.name.slice(0,9)+"…":d.name}
              </text>
              {win && <text x={x+bw/2} y={H+30} textAnchor="middle" fill={C.gold} fontSize={10}>🏆</text>}
            </g>
          );
        })}
        <line x1={pad} y1={H} x2={W-pad} y2={H} stroke={C.border} strokeWidth={1}/>
      </svg>
    </div>
  );
}

// ── Tx log ────────────────────────────────────────────────────────────────────
function TxLog({ logs }) {
  if (!logs.length) return null;
  return (
    <Card>
      <SectionTitle>Transaction History</SectionTitle>
      <div style={{ maxHeight:130, overflowY:"auto" }}>
        {[...logs].reverse().map((l,i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:i<logs.length-1?`1px solid ${C.border}`:"" }}>
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

// ── Sidebar nav ───────────────────────────────────────────────────────────────
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

// ── Election sidebar list ──────────────────────────────────────────────────────
function ElectionSidebar({ elections, selElection, onSelect, onRefresh, isAdmin, elName, setElName, onCreate, loading }) {
  return (
    <div style={{ width:268, borderRight:`1px solid ${C.border}`, padding:20, overflowY:"auto", flexShrink:0 }}>
      {isAdmin && (
        <div style={{ marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>New Election</div>
          <Input placeholder="e.g. Student Council 2025" value={elName} onChange={setElName}/>
          <Btn variant="primary" onClick={onCreate} disabled={loading||!elName} full>Create Election</Btn>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:"uppercase", letterSpacing:"0.1em" }}>Elections</div>
        <Btn size="sm" variant="ghost" onClick={onRefresh}>↻</Btn>
      </div>
      {elections.length===0
        ? <div style={{ color:C.muted, fontSize:13, padding:"12px 0" }}>No elections found.</div>
        : elections.map(el => (
            <div key={el.id} onClick={()=>onSelect(el)} style={{
              padding:"12px 14px", borderRadius:8, marginBottom:8, cursor:"pointer",
              background:selElection?.id===el.id ? C.surface2 : "transparent",
              border:`1px solid ${selElection?.id===el.id ? C.gold+"66" : C.border}`,
              transition:"all .15s",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{el.name}</div>
                  <div style={{ fontSize:11, color:C.muted, fontFamily:C.mono, marginTop:2 }}>ID #{el.id}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {el.state==="active" && <span style={{ width:7,height:7,borderRadius:"50%",background:"#3fb950",display:"inline-block" }}/>}
                  <Badge label={el.state} color={el.state}/>
                </div>
              </div>
            </div>
          ))
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP — single component, view switched by state (no router timing issues)
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──
  const [account,    setAccount]    = useState("");
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [view,       setView]       = useState("connect"); // "connect" | "admin" | "voter"
  const [connecting, setConnecting] = useState(false);

  // ── UI ──
  const [status,  setStatus]  = useState("");
  const [loading, setLoading] = useState(false);
  const [txLogs,  setTxLogs]  = useState([]);

  // ── Data ──
  const [elections,   setElections]   = useState([]);
  const [selElection, setSelElection] = useState(null);
  const [candidates,  setCandidates]  = useState([]);
  const [voters,      setVoters]      = useState([]);
  const [results,     setResults]     = useState([]);
  const [hasVoted,    setHasVoted]    = useState(false);

  // ── Forms ──
  const [elName,          setElName]          = useState("");
  const [candName,        setCandName]        = useState("");
  const [voterAddr,       setVoterAddr]       = useState("");
  const [selCandId,       setSelCandId]       = useState("");
  const [useCommitReveal, setUseCommitReveal] = useState(false);
  const [voteSecret,      setVoteSecret]      = useState("");

  const pollRef = useRef(null);

  // ── Listen for MetaMask changes ────────────────────────────────────────────
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

  // ── Poll results when election is active ───────────────────────────────────
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
    if (parseInt(hex,16) === SEPOLIA_CHAIN_ID) return;
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

  // ── Contract helpers ───────────────────────────────────────────────────────
  const getReadContract = async () => {
    await ensureSepolia();
    const p = new ethers.BrowserProvider(window.ethereum);
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
  };

  const getSignerContract = async () => {
    await ensureSepolia();
    const p      = new ethers.BrowserProvider(window.ethereum);
    const signer = await p.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  // ── TX wrapper ─────────────────────────────────────────────────────────────
  const sendTx = async (fn, successMsg) => {
    setLoading(true);
    setStatus("⏳ Check MetaMask — approve the transaction…");
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

  // ── Get safe block range to avoid RPC limits ───────────────────────────────
  // Public RPCs reject queries spanning too many blocks.
  // We query the last ~500k blocks (~70 days on Sepolia) which covers any
  // elections you'll ever create on this contract.
  const getBlockRange = async () => {
    const p       = new ethers.BrowserProvider(window.ethereum);
    const latest  = await p.getBlockNumber();
    const fromBlock = Math.max(0, latest - 500000);
    return { fromBlock, toBlock: "latest" };
  };

  // ── Fetch all elections via events ─────────────────────────────────────────
  const fetchElections = useCallback(async () => {
    try {
      const rc              = await getReadContract();
      const { fromBlock }   = await getBlockRange();

      const [created, started, ended] = await Promise.all([
        rc.queryFilter(rc.filters.ElectionCreated(), fromBlock, "latest"),
        rc.queryFilter(rc.filters.ElectionStarted(), fromBlock, "latest"),
        rc.queryFilter(rc.filters.ElectionEnded(),   fromBlock, "latest"),
      ]);

      const startedIds = new Set(started.map(e => e.args.electionId.toString()));
      const endedIds   = new Set(ended.map(e   => e.args.electionId.toString()));

      const list = created.map(e => {
        const id    = e.args.electionId.toString();
        const state = endedIds.has(id) ? "ended" : startedIds.has(id) ? "active" : "created";
        return { id, name: e.args.name, state };
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
      const rc            = await getReadContract();
      const { fromBlock } = await getBlockRange();
      const events        = await rc.queryFilter(rc.filters.CandidateAdded(Number(electionId)), fromBlock, "latest");
      const list          = events.map(e => ({ id:e.args.candidateId.toString(), name:e.args.name }));
      setCandidates(list);
      return list;
    } catch(err) { console.error("fetchCandidates:", err); return []; }
  }, []);

  const fetchVoters = useCallback(async (electionId) => {
    try {
      const rc            = await getReadContract();
      const { fromBlock } = await getBlockRange();
      const events        = await rc.queryFilter(rc.filters.VoterAuthorized(Number(electionId)), fromBlock, "latest");
      setVoters(events.map(e => e.args.voter));
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

  const checkHasVoted = useCallback(async (electionId, addr) => {
    try {
      const rc            = await getReadContract();
      const { fromBlock } = await getBlockRange();
      const events        = await rc.queryFilter(rc.filters.VoteCast(Number(electionId)), fromBlock, "latest");
      setHasVoted(events.some(e => e.args.voter.toLowerCase()===addr.toLowerCase()));
    } catch { setHasVoted(false); }
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (!window.ethereum) { alert("Please install MetaMask"); return; }
    setConnecting(true);
    setStatus("⏳ Connecting…");
    try {
      const accounts = await window.ethereum.request({ method:"eth_requestAccounts" });
      await ensureSepolia();

      const userAddr = accounts[0];
      const rc       = await getReadContract();
      const adminAddr = await rc.superAdmin();

      console.log("superAdmin:", adminAddr);
      console.log("connected: ", userAddr);

      const admin = adminAddr.toLowerCase() === userAddr.toLowerCase();
      console.log("isAdmin:   ", admin);

      // Set all state atomically before switching view
      setAccount(userAddr);
      setIsAdmin(admin);
      setStatus("✅ Connected to Sepolia");

      await fetchElections();

      // Switch view using state — no router, no timing issue
      setView(admin ? "admin" : "voter");
    } catch(err) {
      console.error("connectWallet:", err);
      setStatus("❌ " + (err.message || "Connection failed"));
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(""); setIsAdmin(false); setView("connect");
    setElections([]); setSelElection(null);
    setCandidates([]); setVoters([]); setResults([]);
  };

  // ── Select an election ─────────────────────────────────────────────────────
  const selectElection = async (el) => {
    setSelElection(el); setResults([]); setSelCandId("");
    const cands = await fetchCandidates(el.id);
    await fetchVoters(el.id);
    if (el.state==="ended") await doLoadResults(el.id, cands);
    if (account)            await checkHasVoted(el.id, account);
  };

  // ── Admin actions ──────────────────────────────────────────────────────────
  const handleCreateElection = async () => {
    const c = await getSignerContract();
    const r = await sendTx(() => c.createElection(elName, 0, 9999999999), `Election "${elName}" created`);
    if (r) {
      setElName("");
      // Small delay — give the RPC node time to index the new event
      await sleep(1500);
      await fetchElections();
    }
  };

  const handleAddCandidate = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.addCandidate(Number(selElection.id), candName), `Candidate "${candName}" added`);
    if (r) { setCandName(""); await sleep(1000); await fetchCandidates(selElection.id); }
  };

  const handleAuthorizeVoter = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.authorizeVoter(Number(selElection.id), voterAddr), `Voter ${short(voterAddr)} authorized`);
    if (r) { setVoterAddr(""); await sleep(1000); await fetchVoters(selElection.id); }
  };

  const handleStart = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.startElection(Number(selElection.id)), "Election started — voting is open");
    if (r) {
      const updated = { ...selElection, state:"active" };
      setSelElection(updated);
      setElections(prev => prev.map(e => e.id===selElection.id ? updated : e));
    }
  };

  const handleEnd = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.endElection(Number(selElection.id)), "Election ended — results are now public");
    if (r) {
      const updated = { ...selElection, state:"ended" };
      setSelElection(updated);
      setElections(prev => prev.map(e => e.id===selElection.id ? updated : e));
      await sleep(1000);
      await doLoadResults(selElection.id, candidates);
    }
  };

  const handleVote = async () => {
    if (!selElection||!selCandId) { setStatus("❌ Select a candidate first"); return; }
    if (hasVoted) { setStatus("❌ Already voted in this election"); return; }

    if (useCommitReveal) {
      const secret     = voteSecret || Math.random().toString(36).slice(2);
      const commitment = ethers.keccak256(ethers.toUtf8Bytes(`${selCandId}:${secret}`));
      setVoteSecret(secret);
      setStatus(`✅ Commitment: ${commitment.slice(0,20)}… — your secret: "${secret}"`);
      return;
    }

    const c = await getSignerContract();
    const r = await sendTx(() => c.vote(Number(selElection.id), Number(selCandId)), "Vote cast — permanently recorded on Ethereum");
    if (r) { setHasVoted(true); setSelCandId(""); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────────

  // ── Connect screen ─────────────────────────────────────────────────────────
  if (view==="connect") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 1px 1px, #30363d 1px, transparent 0)", backgroundSize:"32px 32px", opacity:.3, pointerEvents:"none" }}/>
      <div style={{ position:"relative", textAlign:"center", maxWidth:400 }}>
        <div style={{ fontSize:52, marginBottom:16 }}>🗳</div>
        <h1 style={{ fontSize:28, fontWeight:700, color:C.text, marginBottom:8, fontFamily:C.sans }}>VoteChain</h1>
        <p style={{ color:C.muted, fontSize:14, lineHeight:1.7, marginBottom:6 }}>
          Decentralised, tamper-proof elections on Ethereum Sepolia.
        </p>
        <p style={{ color:C.muted, fontSize:12, fontFamily:C.mono, marginBottom:28 }}>
          {CONTRACT_ADDRESS.slice(0,14)}…
        </p>
        <Btn size="lg" onClick={connectWallet} disabled={connecting} full>
          {connecting ? "Connecting…" : "Connect MetaMask"}
        </Btn>
        <StatusBanner msg={status}/>
        <p style={{ color:C.muted, fontSize:11, marginTop:16, lineHeight:1.7 }}>
          Deployer wallet → Admin Dashboard<br/>
          Any other wallet → Voter Interface
        </p>
      </div>
    </div>
  );

  // ── Shared sidebar + topbar wrapper ────────────────────────────────────────
  const Shell = ({ children }) => (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      <Topbar
        account={account} isAdmin={isAdmin} view={view}
        onSwitchView={setView} onDisconnect={disconnectWallet}
      />
      <div style={{ display:"flex", minHeight:"calc(100vh - 52px)" }}>
        <ElectionSidebar
          elections={elections} selElection={selElection} onSelect={selectElection}
          onRefresh={fetchElections} isAdmin={view==="admin"}
          elName={elName} setElName={setElName}
          onCreate={handleCreateElection} loading={loading}
        />
        <div style={{ flex:1, padding:24, overflowY:"auto" }}>
          <StatusBanner msg={status}/>
          {children}
        </div>
      </div>
    </div>
  );

  // ── Admin view ─────────────────────────────────────────────────────────────
  if (view==="admin") return (
    <Shell>
      {!selElection ? (
        <div style={{ color:C.muted, fontSize:14, paddingTop:60, textAlign:"center" }}>
          ← Create or select an election to manage it
        </div>
      ) : (
        <>
          {/* Election header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
            <div>
              <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:6 }}>{selElection.name}</h2>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {selElection.state==="active" && <span style={{ width:7,height:7,borderRadius:"50%",background:"#3fb950",display:"inline-block" }}/>}
                <Badge label={selElection.state} color={selElection.state}/>
                <span style={{ fontSize:11, fontFamily:C.mono, color:C.muted }}>ID #{selElection.id}</span>
              </div>
            </div>
            <div>
              {selElection.state==="created" && <Btn variant="success" onClick={handleStart} disabled={loading}>▶ Start Election</Btn>}
              {selElection.state==="active"  && <Btn variant="danger"  onClick={handleEnd}   disabled={loading}>⏹ End Election</Btn>}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {/* Candidates */}
            <Card>
              <SectionTitle>Candidates ({candidates.length})</SectionTitle>
              {selElection.state==="created" && (
                <div style={{ marginBottom:14 }}>
                  <Input placeholder="Candidate name" value={candName} onChange={setCandName}/>
                  <Btn variant="primary" size="sm" onClick={handleAddCandidate} disabled={loading||!candName}>Add Candidate</Btn>
                </div>
              )}
              {candidates.length===0
                ? <div style={{ color:C.muted, fontSize:12 }}>No candidates yet.</div>
                : <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
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
              }
            </Card>

            {/* Voters */}
            <Card>
              <SectionTitle>Authorized Voters ({voters.length})</SectionTitle>
              {selElection.state!=="ended" && (
                <div style={{ marginBottom:14 }}>
                  <Input placeholder="0x wallet address" value={voterAddr} onChange={setVoterAddr} mono/>
                  <Btn variant="primary" size="sm" onClick={handleAuthorizeVoter} disabled={loading||!voterAddr}>Authorize Voter</Btn>
                  <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Each authorization is one MetaMask signature — required by the blockchain security model.</div>
                </div>
              )}
              <div style={{ maxHeight:160, overflowY:"auto" }}>
                {voters.length===0
                  ? <div style={{ color:C.muted, fontSize:12 }}>No voters yet.</div>
                  : voters.map((v,i) => (
                      <div key={i} style={{ fontFamily:C.mono, fontSize:11, color:C.muted, padding:"4px 0", borderBottom:i<voters.length-1?`1px solid ${C.border}22`:"" }}>
                        {v}
                      </div>
                    ))
                }
              </div>
            </Card>
          </div>

          {selElection.state==="ended" && (
            <Card style={{ marginTop:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
                <SectionTitle>Final Results</SectionTitle>
                <Btn size="sm" variant="ghost" onClick={()=>doLoadResults(selElection.id, candidates)}>Reload</Btn>
              </div>
              {results.length===0
                ? <Btn variant="success" onClick={()=>doLoadResults(selElection.id, candidates)}>Load Results</Btn>
                : <BarChart data={results}/>
              }
            </Card>
          )}

          <TxLog logs={txLogs}/>
        </>
      )}
    </Shell>
  );

  // ── Voter view ─────────────────────────────────────────────────────────────
  if (view==="voter") return (
    <Shell>
      {!selElection ? (
        <div style={{ color:C.muted, fontSize:14, paddingTop:60, textAlign:"center" }}>
          ← Select an election to view candidates or vote
        </div>
      ) : (
        <>
          <div style={{ marginBottom:20 }}>
            <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:6 }}>{selElection.name}</h2>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {selElection.state==="active" && <span style={{ width:7,height:7,borderRadius:"50%",background:"#3fb950",display:"inline-block" }}/>}
              <Badge label={selElection.state} color={selElection.state}/>
              {selElection.state==="active" && <span style={{ fontSize:12, color:C.muted }}>Voting is open</span>}
            </div>
          </div>

          {/* Identity */}
          <Card style={{ background:"#f0f7ff10", borderColor:"#bfdbfe44" }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Voting as:</div>
            <div style={{ fontFamily:C.mono, fontSize:12, color:C.text, wordBreak:"break-all" }}>{account}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>This wallet must be authorized by the admin to vote.</div>
          </Card>

          {/* Candidates table */}
          <Card>
            <SectionTitle>Candidates</SectionTitle>
            {candidates.length===0
              ? <div style={{ color:C.muted, fontSize:13 }}>No candidates registered yet.</div>
              : <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead><tr>
                    <th style={{ textAlign:"left", padding:8, color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>ID</th>
                    <th style={{ textAlign:"left", padding:8, color:C.muted, fontSize:11, borderBottom:`1px solid ${C.border}` }}>Candidate</th>
                    {selElection.state==="active" && !hasVoted && <th style={{ padding:8, borderBottom:`1px solid ${C.border}` }}/>}
                  </tr></thead>
                  <tbody>
                    {candidates.map(c => (
                      <tr key={c.id}
                        onClick={()=>selElection.state==="active" && !hasVoted && setSelCandId(c.id)}
                        style={{
                          borderBottom:`1px solid ${C.border}22`,
                          background:selCandId===c.id?C.gold+"11":"transparent",
                          cursor:selElection.state==="active"&&!hasVoted?"pointer":"default",
                        }}
                      >
                        <td style={{ padding:"10px 8px", fontFamily:C.mono, fontSize:11, color:C.muted }}>#{c.id}</td>
                        <td style={{ padding:"10px 8px", fontWeight:selCandId===c.id?600:400, color:selCandId===c.id?C.gold:C.text }}>
                          {c.name}{selCandId===c.id?" ←":""}
                        </td>
                        {selElection.state==="active" && !hasVoted && (
                          <td style={{ padding:"10px 8px", textAlign:"right" }}>
                            <Btn size="sm" variant={selCandId===c.id?"primary":"ghost"}
                              onClick={e=>{e.stopPropagation();setSelCandId(c.id);}}>
                              Select
                            </Btn>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </Card>

          {/* Vote action */}
          {selElection.state==="active" && (
            <Card>
              <SectionTitle>Cast Your Vote</SectionTitle>
              {hasVoted ? (
                <div style={{ color:C.green, fontSize:13 }}>✅ Your vote is permanently recorded on Ethereum.</div>
              ) : !selCandId ? (
                <div style={{ color:C.muted, fontSize:13 }}>Click a candidate in the table above to select them.</div>
              ) : (
                <>
                  <div style={{ marginBottom:14, padding:12, background:C.surface2, borderRadius:8, fontSize:13 }}>
                    Voting for: <strong style={{ color:C.gold }}>{candidates.find(c=>c.id===selCandId)?.name}</strong>
                    <div style={{ color:C.muted, fontSize:11, marginTop:4 }}>This cannot be undone — permanently recorded on Ethereum.</div>
                  </div>
                  <div style={{ marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                    <input type="checkbox" id="cr" checked={useCommitReveal} onChange={e=>setUseCommitReveal(e.target.checked)} style={{ cursor:"pointer" }}/>
                    <label htmlFor="cr" style={{ fontSize:12, color:C.muted, cursor:"pointer" }}>
                      Privacy mode (commit-reveal) — hashes vote with a secret before submitting
                    </label>
                  </div>
                  {useCommitReveal && (
                    <Input label="Secret phrase (auto-generated if blank)" placeholder="your-secret" value={voteSecret} onChange={setVoteSecret} mono
                      hint="Save this — you need it to reveal your vote later."/>
                  )}
                  <Btn variant="primary" size="lg" onClick={handleVote} disabled={loading}>
                    {useCommitReveal?"🔒 Commit Vote":"🗳 Cast Vote"}
                  </Btn>
                  {voteSecret && useCommitReveal && (
                    <div style={{ marginTop:12, padding:10, background:C.surface2, borderRadius:8, fontFamily:C.mono, fontSize:11, color:C.gold }}>
                      Your secret: {voteSecret}
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {/* Results */}
          {selElection.state==="ended" && (
            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
                <SectionTitle>Final Results</SectionTitle>
                <Btn size="sm" variant="ghost" onClick={()=>doLoadResults(selElection.id, candidates)}>Refresh</Btn>
              </div>
              {results.length===0
                ? <Btn variant="success" onClick={()=>doLoadResults(selElection.id, candidates)}>Load Results</Btn>
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
                            <td style={{ padding:"9px 8px", textAlign:"right", fontFamily:C.mono, color:i===0?C.gold:C.text, fontWeight:600 }}>
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
    </Shell>
  );

  return null;
}
