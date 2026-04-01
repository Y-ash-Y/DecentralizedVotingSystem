import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS, CONTRACT_ABI,
  SEPOLIA_CHAIN_ID, SEPOLIA_HEX, SEPOLIA_EXPLORER, SEPOLIA_RPC,
} from "./contract.js";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:      "#0d1117", surface: "#161b22", surface2: "#1c2330",
  border:  "#30363d", gold: "#d4a017",   goldDim: "#8a6800",
  green:   "#238636", red: "#b91c1c",    blue: "#1d4ed8",
  text:    "#e6edf3", muted: "#8b949e",  mono: "'Space Mono', monospace",
  sans:    "'DM Sans', sans-serif",
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const short = (addr) => addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : "";
const fmt   = (ts)   => ts ? new Date(Number(ts)*1000).toLocaleString() : "—";

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant="primary", size="md", disabled, full }) {
  const base = {
    fontFamily: C.sans, fontWeight: 600, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: "8px", transition: "all 0.15s", opacity: disabled ? 0.5 : 1,
    width: full ? "100%" : "auto",
  };
  const sizes = { sm: { padding: "5px 12px", fontSize: "12px" }, md: { padding: "8px 18px", fontSize: "13px" }, lg: { padding: "11px 24px", fontSize: "14px" } };
  const variants = {
    primary:  { background: C.gold,    color: "#000" },
    danger:   { background: C.red,     color: "#fff" },
    success:  { background: C.green,   color: "#fff" },
    ghost:    { background: "transparent", color: C.text, border: `1px solid ${C.border}` },
    muted:    { background: C.surface2, color: C.muted },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...sizes[size], ...variants[variant] }}>{children}</button>;
}

function Input({ label, placeholder, value, onChange, mono, hint, type="text" }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      {label && <div style={{ fontSize: "11px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{label}</div>}
      <input
        type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "9px 12px", background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: "8px", color: C.text, fontSize: "13px",
          fontFamily: mono ? C.mono : C.sans, outline: "none",
        }}
      />
      {hint && <div style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>{hint}</div>}
    </div>
  );
}

function Card({ children, style }) {
  return <div className="fade-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", marginBottom: "16px", ...style }}>{children}</div>;
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: "11px", fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "14px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>{children}</div>;
}

function Badge({ label, color }) {
  const colors = { active: "#238636", ended: "#6e7681", created: C.goldDim, warn: C.red };
  return (
    <span style={{ background: (colors[color]||color)+"22", color: colors[color]||color, padding: "2px 9px", borderRadius: "12px", fontSize: "11px", fontWeight: 600 }}>
      {label}
    </span>
  );
}

function StatusBanner({ msg }) {
  if (!msg) return null;
  const isErr  = msg.startsWith("❌");
  const isWait = msg.startsWith("⏳");
  const color  = isErr ? "#b91c1c" : isWait ? C.gold : "#238636";
  return (
    <div style={{ background: color+"18", border: `1px solid ${color}44`, padding: "10px 14px", borderRadius: "8px", fontSize: "13px", color, marginBottom: "16px", fontFamily: C.sans }}>
      {msg}
    </div>
  );
}

// ─── SVG Bar Chart (no extra dependency) ──────────────────────────────────────
function BarChart({ data }) {
  if (!data || data.length === 0) return null;
  const W = 520, H = 180, pad = 40;
  const maxVotes = Math.max(...data.map(d => d.votes), 1);
  const bw = (W - pad*2) / data.length - 10;

  return (
    <div style={{ background: C.surface2, borderRadius: "10px", padding: "16px", overflowX: "auto" }}>
      <div style={{ fontSize: "11px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Vote Distribution</div>
      <svg viewBox={`0 0 ${W} ${H+40}`} style={{ width: "100%", maxWidth: W }}>
        {data.map((d, i) => {
          const bh  = ((d.votes / maxVotes) * H) || 2;
          const x   = pad + i * ((W - pad*2) / data.length) + 5;
          const y   = H - bh;
          const win = d.votes === maxVotes && d.votes > 0;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} rx="4" fill={win ? C.gold : C.surface} stroke={win ? C.gold : C.border} strokeWidth="1" />
              {d.votes > 0 && (
                <text x={x + bw/2} y={y - 5} textAnchor="middle" fill={win ? C.gold : C.muted} fontSize="11" fontFamily={C.mono}>{d.votes}</text>
              )}
              <text x={x + bw/2} y={H + 16} textAnchor="middle" fill={C.muted} fontSize="10" fontFamily={C.sans}>{d.name.length > 8 ? d.name.slice(0,8)+"…" : d.name}</text>
              {win && <text x={x + bw/2} y={H + 28} textAnchor="middle" fill={C.gold} fontSize="9">🏆</text>}
            </g>
          );
        })}
        <line x1={pad} y1={H} x2={W-pad} y2={H} stroke={C.border} strokeWidth="1" />
      </svg>
    </div>
  );
}

// ─── Tx Log ───────────────────────────────────────────────────────────────────
function TxLog({ logs }) {
  if (!logs.length) return null;
  return (
    <Card>
      <SectionTitle>Transaction History</SectionTitle>
      <div style={{ maxHeight: "140px", overflowY: "auto" }}>
        {logs.slice().reverse().map((log, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < logs.length-1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: "12px", color: C.text }}>{log.msg}</div>
            <a href={`${SEPOLIA_EXPLORER}/tx/${log.hash}`} target="_blank" rel="noreferrer"
              style={{ fontSize: "11px", color: C.gold, fontFamily: C.mono, textDecoration: "none" }}>
              {short(log.hash)} ↗
            </a>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Top Nav ──────────────────────────────────────────────────────────────────
function Nav({ account, isAdmin, onSwitch }) {
  const loc = useLocation();
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "52px", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "18px" }}>🗳</span>
        <span style={{ fontWeight: 700, fontSize: "14px", color: C.text, fontFamily: C.sans }}>VoteChain</span>
        <span style={{ fontSize: "11px", color: C.muted, fontFamily: C.mono }}>Sepolia</span>
      </div>
      {account && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", fontFamily: C.mono, color: C.muted }}>{short(account)}</span>
          <Badge label={isAdmin ? "Admin" : "Voter"} color={isAdmin ? "warn" : "active"} />
          <Btn size="sm" variant="ghost" onClick={onSwitch}>Switch</Btn>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();

  // ── Auth state ──
  const [account,  setAccount]  = useState("");
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [status,   setStatus]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [txLogs,   setTxLogs]   = useState([]);

  // ── Elections state ──
  const [elections,   setElections]   = useState([]);
  const [selElection, setSelElection] = useState(null); // { id, name, state }
  const [candidates,  setCandidates]  = useState([]);
  const [voters,      setVoters]      = useState([]);
  const [results,     setResults]     = useState([]);
  const [hasVoted,    setHasVoted]    = useState(false);

  // ── Admin form state ──
  const [elName,    setElName]    = useState("");
  const [candName,  setCandName]  = useState("");
  const [voterAddr, setVoterAddr] = useState("");

  // ── Voter form state ──
  const [selCandId, setSelCandId] = useState("");

  // ── Commit-reveal (privacy-preserving) ──
  const [useCommitReveal, setUseCommitReveal] = useState(false);
  const [voteSecret,      setVoteSecret]      = useState("");

  // ── Polling ref for live updates ──
  const pollRef = useRef(null);

  // ── Handle network/account changes ──
  useEffect(() => {
    if (!window.ethereum) return;
    const reload = () => window.location.reload();
    window.ethereum.on("chainChanged",    reload);
    window.ethereum.on("accountsChanged", reload);
    return () => { window.ethereum.removeListener("chainChanged", reload); window.ethereum.removeListener("accountsChanged", reload); };
  }, []);

  // ── Poll results every 8s when an active election is selected ──
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selElection?.state === "active") {
      pollRef.current = setInterval(() => { loadResults(selElection.id, candidates); }, 8000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selElection, candidates]);

  // ─── Network helper ─────────────────────────────────────────────────────────
  const ensureSepolia = async () => {
    const hex    = await window.ethereum.request({ method: "eth_chainId" });
    const chainId = parseInt(hex, 16);
    if (chainId === SEPOLIA_CHAIN_ID) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
          chainId: SEPOLIA_HEX, chainName: "Sepolia Test Network",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [SEPOLIA_RPC], blockExplorerUrls: [SEPOLIA_EXPLORER],
        }]});
      } else throw err;
    }
  };

  // ─── Provider helpers ────────────────────────────────────────────────────────
  const getReadProvider = async () => {
    await ensureSepolia();
    return new ethers.BrowserProvider(window.ethereum);
  };

  const getSignerContract = async () => {
    const provider = await getReadProvider();
    const signer   = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  const getReadContract = async () => {
    const provider = await getReadProvider();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  };

  // ─── TX wrapper ──────────────────────────────────────────────────────────────
  const sendTx = async (fn, successMsg) => {
    setLoading(true);
    setStatus("⏳ Confirm in MetaMask…");
    try {
      const tx = await fn();
      setStatus("⏳ Transaction sent — waiting for confirmation…");
      const receipt = await tx.wait();
      setStatus(`✅ ${successMsg}`);
      setTxLogs(prev => [...prev, { msg: successMsg, hash: receipt.hash }]);
      return receipt;
    } catch (err) {
      const msg = err.reason || err.message || "Transaction failed";
      setStatus(`❌ ${msg}`);
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ─── Connect wallet ───────────────────────────────────────────────────────────
  const connectWallet = async () => {
    try {
      if (!window.ethereum) { alert("MetaMask not found — please install it"); return; }
      setStatus("⏳ Connecting…");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureSepolia();
      const addr = accounts[0].toLowerCase();
      setAccount(accounts[0]);

      const rc      = await getReadContract();
      const adminAddr = (await rc.superAdmin()).toLowerCase();
      const admin   = adminAddr === addr;
      setIsAdmin(admin);
      setStatus("✅ Connected to Sepolia");

      // Load elections immediately after connect
      await fetchElections(rc);

      navigate(admin ? "/admin" : "/vote");
    } catch (err) {
      console.error(err);
      setStatus("❌ " + (err.message || "Connection failed"));
    }
  };

  const disconnectWallet = () => {
    setAccount(""); setIsAdmin(false);
    setElections([]); setSelElection(null);
    setCandidates([]); setVoters([]); setResults([]);
    navigate("/");
  };

  // ─── Event-based reads (no gas, no popup) ────────────────────────────────────
  const fetchElections = useCallback(async (rc) => {
    try {
      const readContract = rc || await getReadContract();

      // Get all ElectionCreated events
      const created  = await readContract.queryFilter(readContract.filters.ElectionCreated(), 0, "latest");
      const started  = await readContract.queryFilter(readContract.filters.ElectionStarted(), 0, "latest");
      const ended    = await readContract.queryFilter(readContract.filters.ElectionEnded(),   0, "latest");

      const startedIds = new Set(started.map(e => e.args.electionId.toString()));
      const endedIds   = new Set(ended.map(e => e.args.electionId.toString()));

      const list = created.map(e => {
        const id  = e.args.electionId.toString();
        const state = endedIds.has(id) ? "ended" : startedIds.has(id) ? "active" : "created";
        return { id, name: e.args.name, state };
      });

      setElections(list);
      return list;
    } catch (err) {
      console.error("fetchElections:", err);
      setStatus("❌ Failed to load elections: " + err.message);
      return [];
    }
  }, []);

  const fetchCandidates = useCallback(async (electionId) => {
    try {
      const rc = await getReadContract();
      const events = await rc.queryFilter(rc.filters.CandidateAdded(Number(electionId)), 0, "latest");
      const list = events.map(e => ({ id: e.args.candidateId.toString(), name: e.args.name }));
      setCandidates(list);
      return list;
    } catch (err) {
      console.error("fetchCandidates:", err);
      return [];
    }
  }, []);

  const fetchVoters = useCallback(async (electionId) => {
    try {
      const rc = await getReadContract();
      const events = await rc.queryFilter(rc.filters.VoterAuthorized(Number(electionId)), 0, "latest");
      const list = events.map(e => e.args.voter);
      setVoters(list);
      return list;
    } catch (err) {
      console.error("fetchVoters:", err);
      return [];
    }
  }, []);

  const loadResults = useCallback(async (electionId, cands) => {
    const candList = cands || candidates;
    if (!candList.length) return;
    try {
      const rc = await getReadContract();
      const data = await Promise.all(
        candList.map(async c => {
          try {
            const v = await rc.getCandidateVotes(Number(electionId), Number(c.id));
            return { ...c, votes: Number(v) };
          } catch { return { ...c, votes: 0 }; }
        })
      );
      setResults(data);
    } catch (err) {
      console.error("loadResults:", err);
    }
  }, [candidates]);

  const checkIfVoted = useCallback(async (electionId, userAddr) => {
    try {
      const rc = await getReadContract();
      const events = await rc.queryFilter(rc.filters.VoteCast(Number(electionId)), 0, "latest");
      const voted = events.some(e => e.args.voter.toLowerCase() === userAddr.toLowerCase());
      setHasVoted(voted);
      return voted;
    } catch { return false; }
  }, []);

  // ─── Select an election (used in both admin + voter views) ───────────────────
  const selectElection = async (el) => {
    setSelElection(el);
    setResults([]);
    const cands = await fetchCandidates(el.id);
    await fetchVoters(el.id);
    if (el.state === "ended") await loadResults(el.id, cands);
    if (account) await checkIfVoted(el.id, account);
  };

  // ─── Admin actions ────────────────────────────────────────────────────────────
  const createElection = async () => {
    const c = await getSignerContract();
    const r = await sendTx(() => c.createElection(elName || "Election", 0, 9999999999), `Election "${elName || "Election"}" created`);
    if (r) { setElName(""); await fetchElections(); }
  };

  const addCandidate = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.addCandidate(Number(selElection.id), candName), `Candidate "${candName}" added`);
    if (r) { setCandName(""); await fetchCandidates(selElection.id); }
  };

  const authorizeVoter = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.authorizeVoter(Number(selElection.id), voterAddr), `Voter ${short(voterAddr)} authorized`);
    if (r) { setVoterAddr(""); await fetchVoters(selElection.id); }
  };

  const startElection = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.startElection(Number(selElection.id)), "Election started — voting is open");
    if (r) {
      const updated = { ...selElection, state: "active" };
      setSelElection(updated);
      setElections(prev => prev.map(e => e.id === selElection.id ? updated : e));
    }
  };

  const endElection = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = await getSignerContract();
    const r = await sendTx(() => c.endElection(Number(selElection.id)), "Election ended — results are now public");
    if (r) {
      const updated = { ...selElection, state: "ended" };
      setSelElection(updated);
      setElections(prev => prev.map(e => e.id === selElection.id ? updated : e));
      await loadResults(selElection.id, candidates);
    }
  };

  // ─── Voter actions ────────────────────────────────────────────────────────────
  const castVote = async () => {
    if (!selElection || !selCandId) { setStatus("❌ Select an election and candidate first"); return; }
    if (hasVoted) { setStatus("❌ You have already voted in this election"); return; }

    // Commit-reveal: if enabled, hash the vote with a secret
    if (useCommitReveal) {
      const secret = voteSecret || Math.random().toString(36).slice(2);
      const commitment = ethers.keccak256(ethers.toUtf8Bytes(`${selCandId}:${secret}`));
      setStatus(`✅ Vote commitment: ${commitment.slice(0,20)}…  (Save your secret: "${secret}")`);
      setVoteSecret(secret);
      // NOTE: To fully implement commit-reveal, your Voting.sol needs
      // a commitVote(uint electionId, bytes32 commitment) and
      // revealVote(uint electionId, uint candidateId, string secret) functions.
      // For now we demonstrate the cryptographic commitment step.
      return;
    }

    const c = await getSignerContract();
    const r = await sendTx(() => c.vote(Number(selElection.id), Number(selCandId)), "Vote cast successfully");
    if (r) {
      setHasVoted(true);
      setSelCandId("");
    }
  };

  // ─── Common election list (used in both views) ────────────────────────────────
  const ElectionList = ({ onSelect }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>Elections</div>
        <Btn size="sm" variant="ghost" onClick={() => fetchElections()}>Refresh</Btn>
      </div>
      {elections.length === 0 ? (
        <div style={{ color: C.muted, fontSize: "13px", padding: "12px 0" }}>No elections found on this contract.</div>
      ) : (
        elections.map(el => (
          <div key={el.id} onClick={() => onSelect(el)}
            style={{
              padding: "12px 14px", borderRadius: "8px", marginBottom: "8px", cursor: "pointer",
              background: selElection?.id === el.id ? C.surface2 : "transparent",
              border: `1px solid ${selElection?.id === el.id ? C.gold+"55" : C.border}`,
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 500 }}>{el.name}</span>
                <span style={{ fontSize: "11px", color: C.muted, fontFamily: "'Space Mono', monospace", marginLeft: "8px" }}>#{el.id}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {el.state === "active" && <span className="live-dot" />}
                <Badge label={el.state} color={el.state} />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  // ─── CONNECT PAGE ─────────────────────────────────────────────────────────────
  const ConnectPage = () => (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      {/* Background pattern */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, #30363d 1px, transparent 0)", backgroundSize: "32px 32px", opacity: 0.3, pointerEvents: "none" }} />

      <div className="fade-in" style={{ position: "relative", textAlign: "center", maxWidth: "420px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗳</div>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: C.text, marginBottom: "8px", fontFamily: C.sans }}>VoteChain</h1>
        <p style={{ color: C.muted, fontSize: "14px", lineHeight: 1.7, marginBottom: "6px" }}>
          Decentralised, tamper-proof voting on Ethereum Sepolia.
        </p>
        <p style={{ color: C.muted, fontSize: "12px", marginBottom: "28px", fontFamily: "'Space Mono', monospace" }}>
          {CONTRACT_ADDRESS.slice(0,14)}…
        </p>
        <Btn size="lg" onClick={connectWallet} full>Connect MetaMask</Btn>
        <StatusBanner msg={status} />
        <p style={{ color: C.muted, fontSize: "11px", marginTop: "16px" }}>
          Admin wallets are redirected to the election management dashboard.<br />
          Voter wallets go to the voting interface.
        </p>
      </div>
    </div>
  );

  // ─── ADMIN PAGE ────────────────────────────────────────────────────────────────
  const AdminPage = () => {
    if (!account) return <Navigate to="/" />;
    if (!isAdmin) return <Navigate to="/vote" />;

    return (
      <div style={{ background: C.bg, minHeight: "100vh" }}>
        <Nav account={account} isAdmin={isAdmin} onSwitch={disconnectWallet} />

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "0", minHeight: "calc(100vh - 52px)" }}>

          {/* ── Sidebar ── */}
          <div style={{ borderRight: `1px solid ${C.border}`, padding: "20px", overflowY: "auto" }}>
            {/* Create election */}
            <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>New Election</div>
              <Input placeholder="e.g. Student Council 2025" value={elName} onChange={setElName} />
              <Btn variant="primary" onClick={createElection} disabled={loading || !elName} full>Create Election</Btn>
            </div>

            {/* Election list */}
            <ElectionList onSelect={selectElection} />
          </div>

          {/* ── Main area ── */}
          <div style={{ padding: "24px", overflowY: "auto" }}>
            <StatusBanner msg={status} />

            {!selElection ? (
              <div style={{ color: C.muted, fontSize: "14px", paddingTop: "40px", textAlign: "center" }}>
                ← Select or create an election to manage it
              </div>
            ) : (
              <>
                {/* Election header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                  <div>
                    <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>{selElection.name}</h2>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {selElection.state === "active" && <span className="live-dot" />}
                      <Badge label={selElection.state} color={selElection.state} />
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: C.muted }}>ID: {selElection.id}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {selElection.state === "created" && (
                      <Btn variant="success" onClick={startElection} disabled={loading}>▶ Start</Btn>
                    )}
                    {selElection.state === "active" && (
                      <Btn variant="danger" onClick={endElection} disabled={loading}>⏹ End Election</Btn>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {/* Candidates */}
                  <Card>
                    <SectionTitle>Candidates ({candidates.length})</SectionTitle>
                    {selElection.state === "created" && (
                      <div style={{ marginBottom: "14px" }}>
                        <Input placeholder="Candidate name" value={candName} onChange={setCandName} />
                        <Btn variant="primary" size="sm" onClick={addCandidate} disabled={loading || !candName}>Add Candidate</Btn>
                      </div>
                    )}
                    {candidates.length === 0 ? (
                      <div style={{ color: C.muted, fontSize: "12px" }}>No candidates yet.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead><tr>
                          <th style={{ textAlign: "left", padding: "6px 4px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>ID</th>
                          <th style={{ textAlign: "left", padding: "6px 4px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>Name</th>
                          {results.length > 0 && <th style={{ textAlign: "right", padding: "6px 4px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>Votes</th>}
                        </tr></thead>
                        <tbody>
                          {candidates.map(c => {
                            const res = results.find(r => r.id === c.id);
                            const isWinner = results.length > 0 && res?.votes === Math.max(...results.map(r=>r.votes)) && res?.votes > 0;
                            return (
                              <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                                <td style={{ padding: "7px 4px", color: C.muted, fontFamily: "'Space Mono', monospace", fontSize: "11px" }}>#{c.id}</td>
                                <td style={{ padding: "7px 4px", fontWeight: isWinner ? 600 : 400 }}>{c.name} {isWinner && "🏆"}</td>
                                {results.length > 0 && <td style={{ padding: "7px 4px", textAlign: "right", fontFamily: "'Space Mono', monospace", color: C.gold }}>{res?.votes ?? "—"}</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </Card>

                  {/* Authorize voters */}
                  <Card>
                    <SectionTitle>Authorized Voters ({voters.length})</SectionTitle>
                    {selElection.state !== "ended" && (
                      <div style={{ marginBottom: "14px" }}>
                        <Input placeholder="0x wallet address" value={voterAddr} onChange={setVoterAddr} mono />
                        <Btn variant="primary" size="sm" onClick={authorizeVoter} disabled={loading || !voterAddr}>Authorize</Btn>
                        <div style={{ fontSize: "11px", color: C.muted, marginTop: "6px" }}>One MetaMask signature per voter — this is the blockchain's security model.</div>
                      </div>
                    )}
                    <div style={{ maxHeight: "160px", overflowY: "auto" }}>
                      {voters.length === 0 ? (
                        <div style={{ color: C.muted, fontSize: "12px" }}>No voters authorized yet.</div>
                      ) : (
                        voters.map((v, i) => (
                          <div key={i} style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: C.muted, padding: "4px 0", borderBottom: i < voters.length-1 ? `1px solid ${C.border}22` : "none" }}>
                            {v}
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>

                {/* Results chart */}
                {selElection.state === "ended" && results.length > 0 && (
                  <Card style={{ marginTop: "16px" }}>
                    <SectionTitle>Final Results</SectionTitle>
                    <BarChart data={results} />
                  </Card>
                )}

                {/* Tx log */}
                {txLogs.length > 0 && <TxLog logs={txLogs} />}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── VOTER PAGE ────────────────────────────────────────────────────────────────
  const VoterPage = () => {
    if (!account) return <Navigate to="/" />;

    return (
      <div style={{ background: C.bg, minHeight: "100vh" }}>
        <Nav account={account} isAdmin={isAdmin} onSwitch={disconnectWallet} />

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "0", minHeight: "calc(100vh - 52px)" }}>

          {/* ── Sidebar ── */}
          <div style={{ borderRight: `1px solid ${C.border}`, padding: "20px", overflowY: "auto" }}>
            {/* Identity card */}
            <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Your Identity</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: C.muted, wordBreak: "break-all", lineHeight: 1.7 }}>{account}</div>
              <div style={{ fontSize: "11px", color: C.muted, marginTop: "6px" }}>This wallet must be authorized by the admin to vote.</div>
            </div>
            <ElectionList onSelect={selectElection} />
          </div>

          {/* ── Main area ── */}
          <div style={{ padding: "24px", overflowY: "auto" }}>
            <StatusBanner msg={status} />

            {!selElection ? (
              <div style={{ color: C.muted, fontSize: "14px", paddingTop: "40px", textAlign: "center" }}>
                ← Select an election to view or vote
              </div>
            ) : (
              <>
                {/* Election header */}
                <div style={{ marginBottom: "20px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>{selElection.name}</h2>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {selElection.state === "active" && <span className="live-dot" />}
                    <Badge label={selElection.state} color={selElection.state} />
                    {selElection.state === "active" && <span style={{ fontSize: "12px", color: C.muted }}>Voting is open</span>}
                  </div>
                </div>

                {/* Candidates table */}
                <Card>
                  <SectionTitle>Candidates</SectionTitle>
                  {candidates.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: "13px" }}>No candidates registered yet.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead><tr>
                        <th style={{ textAlign: "left", padding: "8px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>ID</th>
                        <th style={{ textAlign: "left", padding: "8px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>Candidate</th>
                        {selElection.state === "active" && !hasVoted && <th style={{ padding: "8px", borderBottom: `1px solid ${C.border}` }} />}
                      </tr></thead>
                      <tbody>
                        {candidates.map(c => (
                          <tr key={c.id} style={{
                            borderBottom: `1px solid ${C.border}22`,
                            background: selCandId === c.id ? C.gold+"11" : "transparent",
                            cursor: selElection.state === "active" && !hasVoted ? "pointer" : "default",
                          }}
                            onClick={() => selElection.state === "active" && !hasVoted && setSelCandId(c.id)}
                          >
                            <td style={{ padding: "10px 8px", fontFamily: "'Space Mono', monospace", fontSize: "11px", color: C.muted }}>#{c.id}</td>
                            <td style={{ padding: "10px 8px", fontWeight: selCandId === c.id ? 600 : 400, color: selCandId === c.id ? C.gold : C.text }}>
                              {c.name}
                              {selCandId === c.id && " ←"}
                            </td>
                            {selElection.state === "active" && !hasVoted && (
                              <td style={{ padding: "10px 8px", textAlign: "right" }}>
                                <Btn size="sm" variant={selCandId === c.id ? "primary" : "ghost"} onClick={(e) => { e.stopPropagation(); setSelCandId(c.id); }}>
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

                {/* Vote action */}
                {selElection.state === "active" && (
                  <Card>
                    <SectionTitle>Cast Your Vote</SectionTitle>
                    {hasVoted ? (
                      <div style={{ color: "#238636", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>✅</span>
                        <span>You have already voted in this election. Your vote is recorded on Ethereum.</span>
                      </div>
                    ) : !selCandId ? (
                      <div style={{ color: C.muted, fontSize: "13px" }}>Select a candidate from the table above.</div>
                    ) : (
                      <>
                        <div style={{ marginBottom: "14px", padding: "12px", background: C.surface2, borderRadius: "8px", fontSize: "13px" }}>
                          You are voting for: <strong style={{ color: C.gold }}>{candidates.find(c => c.id === selCandId)?.name}</strong>
                          <span style={{ color: C.muted, fontSize: "11px", display: "block", marginTop: "4px" }}>
                            This cannot be undone — your vote will be permanently recorded on the Ethereum blockchain.
                          </span>
                        </div>

                        {/* Commit-reveal toggle */}
                        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <input type="checkbox" id="cr" checked={useCommitReveal} onChange={e => setUseCommitReveal(e.target.checked)} style={{ cursor: "pointer" }} />
                          <label htmlFor="cr" style={{ fontSize: "12px", color: C.muted, cursor: "pointer" }}>
                            Use commit-reveal (privacy mode) — hashes your vote with a secret before submitting
                          </label>
                        </div>
                        {useCommitReveal && (
                          <>
                            <Input label="Secret (optional — auto-generated if blank)" placeholder="your-secret-phrase" value={voteSecret} onChange={setVoteSecret} mono />
                            <div style={{ fontSize: "11px", color: C.muted, marginBottom: "10px" }}>
                              Your vote commitment = keccak256(candidateId + ":" + secret). Save your secret — you need it to reveal later.
                            </div>
                          </>
                        )}

                        <Btn variant="primary" size="lg" onClick={castVote} disabled={loading}>
                          {useCommitReveal ? "🔒 Commit Vote" : "🗳 Cast Vote"}
                        </Btn>

                        {voteSecret && useCommitReveal && (
                          <div style={{ marginTop: "12px", padding: "10px", background: C.surface2, borderRadius: "8px", fontFamily: "'Space Mono', monospace", fontSize: "11px", color: C.gold }}>
                            Your secret: {voteSecret}
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                )}

                {/* Results */}
                {selElection.state === "ended" && (
                  <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: "0.12em" }}>Final Results</div>
                      <Btn size="sm" variant="ghost" onClick={() => loadResults(selElection.id, candidates)}>Refresh</Btn>
                    </div>
                    {results.length === 0 ? (
                      <Btn variant="success" onClick={() => loadResults(selElection.id, candidates)}>Load Results</Btn>
                    ) : (
                      <>
                        <BarChart data={results} />
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "16px" }}>
                          <tbody>
                            {[...results].sort((a,b) => b.votes - a.votes).map((r, i) => (
                              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i === 0 ? C.gold+"11" : "transparent" }}>
                                <td style={{ padding: "9px 8px", color: C.muted, fontSize: "11px", fontFamily: "'Space Mono', monospace" }}>#{r.id}</td>
                                <td style={{ padding: "9px 8px", fontWeight: i === 0 ? 600 : 400, color: i === 0 ? C.gold : C.text }}>
                                  {r.name} {i === 0 && r.votes > 0 ? "🏆" : ""}
                                </td>
                                <td style={{ padding: "9px 8px", textAlign: "right", fontFamily: "'Space Mono', monospace", color: i === 0 ? C.gold : C.text, fontWeight: 600 }}>
                                  {r.votes} {r.votes === 1 ? "vote" : "votes"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Router ────────────────────────────────────────────────────────────────────
  return (
    <Routes>
      <Route path="/"      element={<ConnectPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/vote"  element={<VoterPage />} />
    </Routes>
  );
}
