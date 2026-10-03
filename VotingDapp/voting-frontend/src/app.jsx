import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { createEventReader, loadResults } from "./lib/chainData.js";
import { commitmentKey, loadCommitment, prepareCommitment } from "./lib/commitments.js";
import { verifyDeployment, enrichElections } from "./lib/deployment.js";
import { summarizeResults } from "./lib/results.js";
import { confirmedReceipt, transactionError } from "./lib/transactions.js";
import { safeErrorDetail } from "./lib/errors.js";
import {
  CONTRACT_ADDRESS, CONTRACT_ABI,
  PROTOCOL_VERSION, EXPECTED_CODE_HASH,
  NETWORK,
} from "./contract.js";

import { C, short, Btn, RawInput, Card, SectionTitle, Badge, Toast, ConfirmModal, CopyBtn, BarChart, Outcome, TxLog, Topbar, ElectionSidebar } from "./components/presentation.jsx";
const V2 = PROTOCOL_VERSION === 2;
const eventReader = createEventReader({address:CONTRACT_ADDRESS, deploymentBlock:import.meta.env.VITE_DEPLOYMENT_BLOCK ? Number(import.meta.env.VITE_DEPLOYMENT_BLOCK) : undefined});

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ──
  const [account,    setAccount]    = useState("");
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const accountRef = useRef("");
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
  const [resultError, setResultError] = useState("");
  const [dataReady, setDataReady] = useState(false);
  const [hasVoted,    setHasVoted]    = useState(false);

  // ── Forms — note: onChange handlers use stable `set*` functions from useState ──
  const [elName,       setElName]       = useState("");
  const [candName,     setCandName]     = useState("");
  const [voterAddr,    setVoterAddr]    = useState("");
  const [selCandId,    setSelCandId]    = useState("");
  const [crMode,       setCrMode]       = useState(false); // new election: commit-reveal?
  const [schedule, setSchedule] = useState({ start:"", votingEnd:"", end:"" });
  const [roleAddress, setRoleAddress] = useState("");
  const [voteSecret,   setVoteSecret]   = useState("");
  const [hasCommitted, setHasCommitted] = useState(false); // commit-reveal: this wallet committed

  const selectionRef = useRef(null);
  const selectionVersion = useRef(0);
  const resultRequest = useRef(0);
  const electionRequest = useRef(0);
  const transactionInFlight = useRef(false);

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

  // Results getter is only available after Ended. Do not poll a known revert.

  // ── Network ────────────────────────────────────────────────────────────────
  const ensureNetwork = async () => {
    const hex = await window.ethereum.request({ method:"eth_chainId" });
    if (parseInt(hex,16)===NETWORK.chainId) return;
    try {
      await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{chainId:NETWORK.hex}] });
    } catch(err) {
      if (err.code===4902) {
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[{
          chainId:NETWORK.hex, chainName:NETWORK.name,
          nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},
          rpcUrls:[NETWORK.rpc], ...(NETWORK.explorer ? {blockExplorerUrls:[NETWORK.explorer]} : {}),
        }]});
      } else throw err;
    }
  };

  const getReadContract = async () => {
    await ensureNetwork();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, new ethers.BrowserProvider(window.ethereum));
    await verifyDeployment(contract, {address:CONTRACT_ADDRESS, chainId:NETWORK.chainId, version:PROTOCOL_VERSION, codeHash:EXPECTED_CODE_HASH, fastLocal:NETWORK.fastLocal});
    return contract;
  };

  const getSignerContract = async () => {
    await getReadContract();
    const p = new ethers.BrowserProvider(window.ethereum);
    const signer = await p.getSigner();
    if ((await signer.getAddress()).toLowerCase() !== accountRef.current.toLowerCase()) {
      throw Object.assign(new Error("Wallet changed"), {code:"WALLET_CHANGED"});
    }
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  // ── TX wrapper ─────────────────────────────────────────────────────────────
  const sendTx = async (fn, successMsg) => {
    if (transactionInFlight.current) return null;
    transactionInFlight.current = true;
    setLoading(true);
    setStatus("⏳ Approve the transaction in MetaMask…");
    try {
      const tx      = await fn();
      setStatus("⏳ Transaction sent — waiting for confirmation…");
      const receipt = await confirmedReceipt(tx);
      eventReader.invalidate();
      setStatus(`✅ ${successMsg}`);
      setTxLogs(prev => [...prev, { msg:successMsg, hash:receipt.hash }]);
      return receipt;
    } catch(err) {
      setStatus(`❌ ${transactionError(err)}`);
      return null;
    } finally {
      transactionInFlight.current = false;
      setLoading(false);
    }
  };

  // ── Data loaders (event-based — free, no gas, no MetaMask popup) ──────────
  const fetchElections = useCallback(async () => {
    const request = ++electionRequest.current;
    const viewer = accountRef.current;
    try {
      const rc        = await getReadContract();
      const events = await eventReader.read(rc);
      const [created, started, revealed, ended, voteEvents, revealEvents] =
        ["ElectionCreated", "ElectionStarted", "RevealStarted", "ElectionEnded", "VoteCast", "VoteRevealed"]
          .map(name => events.filter(e => e.name === name));

      const startedIds = new Set(started.map(e  => e.args.electionId.toString()));
      const revealIds  = new Set(revealed.map(e => e.args.electionId.toString()));
      const endedIds   = new Set(ended.map(e    => e.args.electionId.toString()));

      // Count votes per election (plain VoteCast + revealed commit-reveal votes)
      const voteCounts = {};
      [...voteEvents, ...revealEvents].forEach(e => {
        const id = e.args.electionId.toString();
        voteCounts[id] = (voteCounts[id]||0) + 1;
      });

      let list = created.map(e => {
        const id    = e.args.electionId.toString();
        const state = endedIds.has(id)   ? "ended"
                    : revealIds.has(id)  ? "reveal"
                    : startedIds.has(id) ? "active"
                    : "created";
        return { id, name:e.args.name, state, commitReveal: e.args.commitReveal, totalVotes: voteCounts[id]??0 };
      });

      if (V2 && viewer) {
        list = await enrichElections(rc, list, viewer);
        const superUser = (await rc.superAdmin()).toLowerCase() === viewer.toLowerCase();
        if (accountRef.current !== viewer || request !== electionRequest.current) return [];
        setIsSuperAdmin(superUser); setIsAdmin(superUser || list.some(e => e.canManage));
      }

      if (accountRef.current !== viewer || request !== electionRequest.current) return [];
      setElections(list);
      return list;
    } catch(err) {
      if (accountRef.current !== viewer || request !== electionRequest.current) return [];
      setStatus("❌ Could not load elections: " + safeErrorDetail(err));
      setDataReady(false);
      return [];
    }
  }, []);

  const fetchCandidates = useCallback(async (electionId) => {
    const version = selectionVersion.current;
    try {
      const rc        = await getReadContract();
      const all = (await eventReader.read(rc)).filter(e => e.name === "CandidateAdded");
      const list      = all
        .filter(e => e.args.electionId.toString()===electionId.toString())
        .map(e   => ({ id:e.args.candidateId.toString(), name:e.args.name }));
      if (version === selectionVersion.current && selectionRef.current === electionId) setCandidates(list);
      return list;
    } catch(err) {
      if (version === selectionVersion.current) { setCandidates([]); setDataReady(false); setStatus("❌ Candidates unavailable: " + safeErrorDetail(err)); }
      return null;
    }
  }, []);

  const fetchVoters = useCallback(async (electionId) => {
    const version = selectionVersion.current;
    try {
      const rc        = await getReadContract();
      const all = (await eventReader.read(rc)).filter(e => e.name === "VoterAuthorized" || e.name === "VoterRevoked");
      const filtered  = all.filter(e => e.args.electionId.toString()===electionId.toString());
      const authorized = new Set();
      filtered.forEach(e => e.name === "VoterRevoked" ? authorized.delete(e.args.voter.toLowerCase()) : authorized.add(e.args.voter.toLowerCase()));
      if (version === selectionVersion.current && selectionRef.current === electionId) setVoters([...authorized]);
      return true;
    } catch(err) {
      if (version === selectionVersion.current) { setVoters([]); setDataReady(false); setStatus("❌ Authorization unavailable: " + safeErrorDetail(err)); }
      return false;
    }
  }, []);

  const doLoadResults = useCallback(async (electionId, cands) => {
    const request = ++resultRequest.current;
    setResults([]); setResultError("");
    const list = cands || candidates;
    if (!list.length) return;
    try {
      const rc   = await getReadContract();
      const data = await loadResults(rc, electionId, list);
      if (request === resultRequest.current && selectionRef.current === electionId) setResults(data);
    } catch(err) {
      if (request === resultRequest.current && selectionRef.current === electionId)
        setResultError("Results unavailable — no totals are being reported. " + safeErrorDetail(err));
    }
  }, [candidates]);

  // Tracks, for the connected wallet: has it voted (plain VoteCast or a revealed
  // commit-reveal vote), and — for commit-reveal — has it committed yet.
  const checkVoteStatus = useCallback(async (electionId, addr) => {
    const version = selectionVersion.current;
    try {
      const rc        = await getReadContract();
      const events = await eventReader.read(rc);
      const [cast, committed, revealed] = ["VoteCast", "VoteCommitted", "VoteRevealed"]
        .map(name => events.filter(e => e.name === name));
      const mine = ev => ev
        .filter(e => e.args.electionId.toString()===electionId.toString())
        .some(e => e.args.voter.toLowerCase()===addr.toLowerCase());
      if (version === selectionVersion.current && selectionRef.current === electionId) {
        setHasVoted(mine(cast) || mine(revealed));
        setHasCommitted(mine(committed));
        setDataReady(true);
      }
    } catch {
      if (version === selectionVersion.current) { setDataReady(false); setStatus("❌ Could not verify your voting status. Refresh before trying again."); }
    }
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (!window.ethereum) { alert("Please install MetaMask"); return; }
    setConnecting(true);
    setStatus("⏳ Connecting…");
    try {
      const accounts  = await window.ethereum.request({ method:"eth_requestAccounts" });
      await ensureNetwork();
      const userAddr  = accounts[0];
      accountRef.current = userAddr;
      const rc        = await getReadContract();
      const adminAddr = await rc.superAdmin();
      const admin     = adminAddr.toLowerCase()===userAddr.toLowerCase();
      setAccount(userAddr); setIsAdmin(admin);
      setIsSuperAdmin(admin);
      setStatus(`✅ Connected to ${NETWORK.name}`);
      const list = await fetchElections();
      setView(admin || (V2 && list.some(e => e.canManage)) ? "admin" : "voter");
    } catch(err) {
      setStatus("❌ " + safeErrorDetail(err));
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    if (transactionInFlight.current) return;
    electionRequest.current++;
    accountRef.current = ""; setIsSuperAdmin(false);
    selectionVersion.current++; selectionRef.current = null; resultRequest.current++;
    setDataReady(false); eventReader.invalidate();
    setAccount(""); setIsAdmin(false); setView("connect");
    setElections([]); setSelElection(null); setCandidates([]);
    setVoters([]); setResults([]); setStatus("");
  };

  // ── Select election ────────────────────────────────────────────────────────
  const selectElection = async (el) => {
    if (loading || !el) return;
    const version = ++selectionVersion.current;
    selectionRef.current = el.id; resultRequest.current++;
    setDataReady(false); setHasVoted(false); setHasCommitted(false);
    setCandidates([]); setVoters([]); setResultError("");
    setSelElection(el); setResults([]); setSelCandId(""); setVoteSecret("");
    const cands = await fetchCandidates(el.id);
    if (version !== selectionVersion.current || cands === null) return;
    if (!await fetchVoters(el.id)) return;
    if (version !== selectionVersion.current) return;
    if (el.state==="ended") await doLoadResults(el.id, cands);
    if (account)            await checkVoteStatus(el.id, account);
  };

  const handleSwitchView = async (v) => {
    if (loading || (v === "admin" && !isAdmin)) return;
    setView(v);
    if (v==="voter" && selElection) {
      await selectElection(selElection);
    }
  };

  // ── Admin actions ──────────────────────────────────────────────────────────
  const handleCreateElection = async () => {
    const args = [elName, 0, 9999999999, crMode];
    if (V2) {
      const start = Date.parse(schedule.start)/1000;
      const votingEnd = Date.parse(schedule.votingEnd)/1000;
      const end = crMode ? Date.parse(schedule.end)/1000 : votingEnd;
      if (![start,votingEnd,end].every(Number.isSafeInteger) || votingEnd <= start || (crMode && end <= votingEnd)) {
        setStatus("❌ Choose a future start and strictly later closing times for each phase."); return;
      }
      args.splice(0,args.length,elName,start,votingEnd,end,crMode);
    }
    const r = await sendTx(
      async () => {
        const contract = await getSignerContract();
        if (V2) {
          // Existing immutable deployments may still enforce the former policy.
          // Older local fixtures override that policy internally.
          const minimum = NETWORK.fastLocal ? 1n : await contract.MIN_PHASE_DURATION();
          if (BigInt(args[2]-args[1]) < minimum || (crMode && BigInt(args[3]-args[2]) < minimum)) {
            throw Object.assign(new Error("Deployment phase minimum"), {
              code:"PHASE_MINIMUM", minimum,
            });
          }
          const block = await contract.runner.provider.getBlock("latest");
          if (!block || args[1] <= block.timestamp) throw Object.assign(new Error("Start is not in the future"), {code:"START_NOT_FUTURE"});
        }
        return contract.createElection(...args);
      },
      `${crMode ? "Commit-reveal election" : "Election"} "${elName}" created`
    );
    if (r) { setElName(""); setCrMode(false); await fetchElections(); }
  };

  // Add one or many candidates in a single transaction (split on newlines or commas).
  const handleAddCandidates = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const names = candName.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
    if (!names.length) { setStatus("❌ Enter at least one candidate name"); return; }
    const c = () => getSignerContract();
    const r = await sendTx(
      async () => (await c()).addCandidates(BigInt(selElection.id), names),
      names.length===1 ? `Candidate "${names[0]}" added` : `${names.length} candidates added`
    );
    if (r) { setCandName(""); await fetchCandidates(selElection.id); }
  };

  // Authorize one or many voters in a single transaction (whitespace/comma separated).
  const handleAuthorizeVoters = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const addrs = voterAddr.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
    if (!addrs.length) { setStatus("❌ Enter at least one wallet address"); return; }
    const bad = addrs.find(a => !ethers.isAddress(a));
    if (bad) { setStatus(`❌ Invalid address: ${bad}`); return; }
    const c = () => getSignerContract();
    const r = await sendTx(
      async () => (await c()).authorizeVoters(BigInt(selElection.id), addrs),
      addrs.length===1 ? `Voter ${short(addrs[0])} authorized` : `${addrs.length} voters authorized`
    );
    if (r) { setVoterAddr(""); await fetchVoters(selElection.id); }
  };

  const handleStart = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = () => getSignerContract();
    const msg = V2 ? "Setup sealed — eligibility is frozen; voting opens at the scheduled time" : selElection.commitReveal
      ? "Election started — commit phase is open"
      : "Election started — voting is open";
    const r = await sendTx(async () => (await c()).startElection(BigInt(selElection.id)), msg);
    if (r) {
      const u = { ...selElection, state:V2 ? "created" : "active", isSealed:V2 };
      setSelElection(u);
      setElections(prev => prev.map(e => e.id===selElection.id ? u : e));
    }
  };

  const handleStartReveal = async () => {
    if (!selElection) { setStatus("❌ Select an election first"); return; }
    const c = () => getSignerContract();
    const r = await sendTx(async () => (await c()).startReveal(BigInt(selElection.id)), "Reveal phase started — voters can now reveal their votes");
    if (r) {
      const u = { ...selElection, state:"reveal" };
      setSelElection(u);
      setElections(prev => prev.map(e => e.id===selElection.id ? u : e));
    }
  };

  const handleEnd = async () => {
    setConfirmEnd(false);
    const c = () => getSignerContract();
    const r = await sendTx(async () => (await c()).endElection(BigInt(selElection.id)), "Election ended — final tally available");
    if (r) {
      const u = { ...selElection, state:"ended" };
      setSelElection(u);
      setElections(prev => prev.map(e => e.id===selElection.id ? u : e));
      await doLoadResults(selElection.id, candidates);
    }
  };

  // ── Vote (plain elections) ───────────────────────────────────────────────────
  const handleVote = async () => {
    if (!dataReady || !isAuthorizedVoter || loading) return;
    if (!selElection||!selCandId) { setStatus("❌ Select a candidate first"); return; }
    if (hasVoted) { setStatus("❌ Already voted in this election"); return; }
    const c = () => getSignerContract();
    const r = await sendTx(async () => (await c()).vote(BigInt(selElection.id), BigInt(selCandId)), "Vote included successfully — network finality is a separate step");
    if (r) { setHasVoted(true); setSelCandId(""); }
  };

  // localStorage key so a committed vote can be re-loaded for the reveal step.
  const crKey = (electionId, addr) => commitmentKey(CONTRACT_ADDRESS, electionId, addr);

  // ── Commit-reveal phase 1 — commit a hidden vote ─────────────────────────────
  const handleCommit = async () => {
    if (!dataReady || !isAuthorizedVoter || loading) return;
    if (!selElection||!selCandId) { setStatus("❌ Select a candidate first"); return; }
    if (hasCommitted) { setStatus("❌ Already committed in this election"); return; }
    try {
      const domain = V2 ? { chainId:NETWORK.chainId, contract:CONTRACT_ADDRESS, electionId:selElection.id } : undefined;
      const ballot = prepareCommitment(window.localStorage, crKey(selElection.id, account), selCandId, account, domain);
      setVoteSecret(ballot.secret);
      const r = await sendTx(
        async () => (await getSignerContract()).commitVote(BigInt(selElection.id), ballot.hash),
        "Vote committed — keep your backup and return for the reveal phase"
      );
      if (r) setHasCommitted(true);
    } catch (error) {
      setStatus("❌ Cannot prepare commitment: " + safeErrorDetail(error));
    }
  };

  // ── Commit-reveal phase 2 — reveal the committed vote ────────────────────────
  const handleReveal = async () => {
    if (!dataReady || !isAuthorizedVoter || loading) return;
    if (!selElection||!selCandId) { setStatus("❌ Select the candidate you committed to"); return; }
    if (!voteSecret) { setStatus("❌ Enter your secret phrase"); return; }
    if (hasVoted) { setStatus("❌ Already revealed in this election"); return; }
    const c = () => getSignerContract();
    const r = await sendTx(
      async () => (await c()).revealVote(BigInt(selElection.id), BigInt(selCandId), voteSecret),
      "Vote revealed and counted on Ethereum"
    );
    if (r) {
      // One inclusion is not finality. Preserve recovery material if a reorg
      // removes this reveal; users can clear it after verifying finality.
      setHasVoted(true);
    }
  };

  // Pre-fill the reveal form from a locally-saved commitment, if present.
  const loadSavedCommitment = () => {
    try {
      const saved = loadCommitment(window.localStorage, crKey(selElection.id, account));
      if (saved) {
        const { candidateId, secret } = saved;
        setSelCandId(candidateId); setVoteSecret(secret);
        setStatus("✅ Loaded your saved commitment — confirm below to reveal");
      } else {
        setStatus("⏳ No saved commitment on this device — enter your candidate and secret manually");
      }
    } catch { setStatus("❌ Could not read saved commitment"); }
  };

  const downloadBackup = () => {
    try {
      const ballot = loadCommitment(window.localStorage, crKey(selElection.id, account));
      if (!ballot) throw new Error("No saved ballot; submit a commitment first.");
      const blob = new Blob([JSON.stringify({ contract: CONTRACT_ADDRESS, chainId: NETWORK.chainId, electionId: selElection.id, voter: account, ...ballot }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `votechain-ballot-${selElection.id}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setStatus("❌ Backup unavailable: " + safeErrorDetail(error)); }
  };

  const roleAction = async (method) => {
    if (!ethers.isAddress(roleAddress) || roleAddress === ethers.ZeroAddress) { setStatus("❌ Enter a non-zero wallet address"); return; }
    const r = await sendTx(async () => (await getSignerContract())[method](selElection.id, roleAddress), "Election role updated");
    if (r) { setRoleAddress(""); await fetchElections(); await fetchVoters(selElection.id); }
  };
  const cancelSetup = async () => {
    const r = await sendTx(async () => (await getSignerContract()).cancelElection(selElection.id), "Unsealed election cancelled");
    if (r) { const list = await fetchElections(); await selectElection(list.find(e=>e.id===selElection.id)); }
  };

  useEffect(() => {
    if (!V2 || !account || loading) return;
    let stopped = false;
    let refreshing = false;
    const timer = setInterval(async () => {
      if (refreshing || stopped) return;
      refreshing = true;
      try {
        const fresh = await fetchElections();
        if (stopped) return;
        const current = fresh.find(e => e.id === selectionRef.current);
        if (current && current.state !== selElection?.state) await selectElection(current);
        else if (current) setSelElection(current);
      } finally { refreshing = false; }
    }, NETWORK.local ? 2000 : 15000);
    return () => { stopped = true; clearInterval(timer); };
  }, [account, loading, selElection?.id, selElection?.state, fetchElections]);

  // ── Statistics card ────────────────────────────────────────────────────────
  const StatsCard = () => {
    if (!selElection||!candidates.length) return null;
    const totalVotes  = results.length ? results.reduce((s,r)=>s+r.votes,0) : selElection.totalVotes||0;
    const turnout     = voters.length ? ((totalVotes/voters.length)*100).toFixed(1) : "—";
    const outcome = summarizeResults(results);
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
            { label:outcome.status === "tie" ? "Joint leaders" : "Highest tally", value:outcome.status === "no-votes" ? "No votes cast" : outcome.leaders.map(r=>r.name).join(", ") || "Unavailable" },
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
          Auditable voting prototype on {NETWORK.name} — not for binding elections.<br/>
          {NETWORK.local && <strong>LOCAL TEST ONLY — no real funds or Sepolia transactions.<br/></strong>}
          <span style={{ fontFamily:C.mono, fontSize:12 }}>{CONTRACT_ADDRESS.slice(0,14)}…</span>
        </p>
        <Btn size="lg" onClick={connectWallet} disabled={connecting} full>
          {connecting ? "Connecting…" : "Connect MetaMask"}
        </Btn>
        <Toast msg={status} onDismiss={()=>setStatus("")}/>
        <p style={{ color:C.muted, fontSize:12, marginTop:18, lineHeight:1.7 }}>
          Connect your registered wallet. Signed transactions prove wallet control; connecting alone is not server authentication.
        </p>
        <p style={{ color:C.muted, fontSize:11, marginTop:10, lineHeight:1.9 }}>
          Admin (deployer) wallet → Admin Dashboard<br/>
          Any registered voter wallet → Voter Interface
        </p>
      </div>
    </div>
  );

  // ── Shared layout (inlined as variables — never a component, so no remount) ─
  const topbar = (
    <Topbar account={account} isAdmin={isAdmin} view={view}
      loading={loading}
      onSwitchView={handleSwitchView} onDisconnect={disconnectWallet}/>
  );

  const sidebar = (
    <ElectionSidebar
      elections={V2 && view==="admin" ? elections.filter(e=>e.canManage) : elections} selElection={selElection}
      onSelect={selectElection} onRefresh={async () => {
        if (loading) return;
        eventReader.invalidate();
        const fresh = await fetchElections();
        const selected = fresh.find(e => e.id === selectionRef.current);
        if (selected) await selectElection(selected);
      }}
      showCreate={view==="admin" && isSuperAdmin}
      schedule={schedule} onSchedule={setSchedule}
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
  // Portal guard: owner or (in V2) a verified delegated election administrator.
  // (The contract also rejects admin txs from non-admins, so this is defense in depth.)
  if (view==="admin" && !isAdmin) return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      {topbar}
      <div style={{ color:C.muted, fontSize:14, paddingTop:100, textAlign:"center", lineHeight:1.8 }}>
        🔒 Admin portal is restricted to the election authority's wallet.<br/>
        This wallet is not the admin. Connect the admin wallet in MetaMask to manage elections.
      </div>
    </div>
  );
  if (view==="admin") return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      {topbar}
      <ConfirmModal
        open={confirmEnd}
        title="End this election?"
        body={`This will permanently close "${selElection?.name}". Unrevealed commitments will not count. Choices already revealed are public. Voters will no longer be able to cast or reveal ballots.`}
        onConfirm={handleEnd}
        onCancel={()=>setConfirmEnd(false)}
        confirmLabel="End Election"
        variant="danger"
      />
      <div className="app-layout" style={{ display:"flex", minHeight:"calc(100vh - 52px)" }}>
        {sidebar}
        <div style={{ flex:1, padding:24, overflowY:"auto" }}>
          <Toast msg={status} onDismiss={()=>setStatus("")}/>
          {!selElection || (V2 && !selElection.canManage) ? (
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
                    {selElection.commitReveal && <Badge label="Commit-reveal" color={C.blue}/>}
                    <span style={{ fontSize:11, fontFamily:C.mono, color:C.muted }}>ID #{selElection.id}</span>
                  </div>
                </div>
                <div>
                  {selElection.state==="created" && !selElection.isSealed && (
                    <Btn variant="success" onClick={handleStart} disabled={loading}>{V2 ? "Seal Setup" : "▶ Start Election"}</Btn>
                  )}
                  {V2 && selElection.state==="created" && !selElection.isSealed && <Btn variant="danger" onClick={cancelSetup} disabled={loading}>Cancel Unsealed Election</Btn>}
                  {!V2 && selElection.state==="active" && selElection.commitReveal && (
                    <Btn variant="info" onClick={handleStartReveal} disabled={loading}>🔓 Start Reveal Phase</Btn>
                  )}
                  {!V2 && selElection.state==="active" && !selElection.commitReveal && (
                    <Btn variant="danger" onClick={()=>setConfirmEnd(true)} disabled={loading}>⏹ End Election</Btn>
                  )}
                  {!V2 && selElection.state==="reveal" && (
                    <Btn variant="danger" onClick={()=>setConfirmEnd(true)} disabled={loading}>⏹ End Election</Btn>
                  )}
                </div>
              </div>

              <StatsCard/>
              {V2 && <Card>
                <SectionTitle>Published schedule</SectionTitle>
                <p>Start: {new Date(selElection.startTime*1000).toLocaleString()}</p>
                <p>Voting closes: {new Date(selElection.votingEnd*1000).toLocaleString()}</p>
                <p>Election ends: {new Date(selElection.endTime*1000).toLocaleString()}</p>
                <p>{selElection.isSealed ? "Setup sealed; candidates and eligibility cannot change." : "Seal setup before start or the election is abandoned."} Phases follow chain time, not admin buttons.</p>
                {isSuperAdmin && <>
                  <RawInput label="Election administrator / voter address" value={roleAddress} onChange={e=>setRoleAddress(e.target.value)} mono/>
                  <Btn variant="ghost" disabled={loading} onClick={()=>roleAction("assignAdmin")}>Assign Admin</Btn>
                  <Btn variant="ghost" disabled={loading} onClick={()=>roleAction("revokeAdmin")}>Revoke Admin</Btn>
                  {!selElection.isSealed && selElection.state==="created" && <Btn variant="danger" disabled={loading} onClick={()=>roleAction("revokeVoter")}>Revoke Voter</Btn>}
                </>}
              </Card>}

              <div className="admin-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {/* Candidates */}
                <Card>
                  <SectionTitle>Candidates ({candidates.length})</SectionTitle>
                  {selElection.state==="created" && !selElection.isSealed && (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
                        Candidate Names — one per line
                      </div>
                      <textarea
                        aria-label="Candidate names"
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
                  {(V2 ? selElection.state==="created" && !selElection.isSealed : selElection.state!=="ended") && (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
                        Voter Wallet Addresses — one per line
                      </div>
                      <textarea
                        aria-label="Voter wallet addresses"
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
                  {resultError && <p role="alert" style={{ color:C.red }}>{resultError}</p>}
                  <Outcome results={results}/>
                  {results.length===0
                    ? <Btn variant="success" onClick={()=>doLoadResults(selElection.id,candidates)}>Load Results</Btn>
                    : <BarChart data={results}/>
                  }
                </Card>
              )}

              {/* Redeploy / reset note */}
              {isAdmin && !NETWORK.local && (
                <Card style={{ marginTop:8, borderColor:C.red+"44" }}>
                  <SectionTitle>Reset / Fresh Deployment</SectionTitle>
                  <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:12 }}>
                    Blockchain data is <strong style={{ color:C.text }}>immutable</strong> — elections recorded on Sepolia cannot be deleted from the chain. To start completely fresh (new contract, empty election list), redeploy:
                  </p>
                  <div style={{ fontFamily:C.mono, fontSize:12, background:C.surface2, padding:"10px 14px", borderRadius:8, color:C.gold, marginBottom:12 }}>
                    cd VotingDapp<br/>
                    npx hardhat run scripts/{V2 ? "deploy-v2" : "deploy"}.js --network sepolia
                  </div>
                  <p style={{ fontSize:12, color:C.muted }}>
                    {V2 ? "Follow docs/DEPLOYMENT.md and configure the address, version, receipt block and bytecode hash from the new manifest. Do not repoint voters away from elections with pending reveals." : "Update the public deployment address only after preserving access to existing elections."} The "Hide ended" toggle cleans up the view without redeploying.
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
  const isAuthorizedVoter = !!selElection && dataReady &&
    voters.some(v => v.toLowerCase()===(account||"").toLowerCase());
  const canPick = isAuthorizedVoter && !loading && (
    selElection.state==="active"
      ? (selElection.commitReveal ? !hasCommitted : !hasVoted)
      : selElection.state==="reveal" && selElection.commitReveal && !hasVoted
  );
  // Is the *connected* wallet on this election's authorized list? (event-sourced)
  if (view==="voter") return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      {topbar}
      <div className="app-layout" style={{ display:"flex", minHeight:"calc(100vh - 52px)" }}>
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
                  {selElection.commitReveal && <Badge label="Commit-reveal" color={C.blue}/>}
                  {selElection.state==="active"  && <span style={{ fontSize:12, color:C.muted }}>{selElection.commitReveal ? "Commit phase open — submit a hidden vote" : "Voting is open"}</span>}
                  {selElection.state==="reveal"  && <span style={{ fontSize:12, color:C.muted }}>Reveal phase — reveal your committed vote</span>}
                  {selElection.state==="created" && <span style={{ fontSize:12, color:C.muted }}>Voting has not started yet</span>}
                  {selElection.state==="ended"   && <span style={{ fontSize:12, color:C.muted }}>Election closed</span>}
                </div>
              </div>

              {/* Identity card */}
              {V2 && <Card>
                <SectionTitle>Election Schedule</SectionTitle>
                <p>Voting opens: {new Date(selElection.startTime*1000).toLocaleString()}</p>
                <p>{selElection.commitReveal ? "Commit" : "Voting"} deadline: {new Date(selElection.votingEnd*1000).toLocaleString()}</p>
                {selElection.commitReveal && <p>Reveal deadline: {new Date(selElection.endTime*1000).toLocaleString()}</p>}
                <p>{selElection.state === "cancelled" ? "This election was cancelled or its setup was not sealed before the start. Voting is unavailable." : "Deadlines use blockchain time. Submit well before the deadline; a pending transaction does not count until included."}</p>
              </Card>}
              <Card style={{ background:"#0d1f2d", borderColor:"#1e3a5f" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:11, color:C.muted }}>Voting as:</div>
                  <Badge label={!dataReady ? "Status unavailable / loading" : isAuthorizedVoter ? "✓ Authorized" : "Not authorized"} color={isAuthorizedVoter ? C.green : C.red}/>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontFamily:C.mono, fontSize:12, color:C.text, wordBreak:"break-all" }}>{account}</span>
                  <CopyBtn text={account}/>
                </div>
                {isAuthorizedVoter ? (
                  <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
                    This wallet is on the authorized voter list for this election.
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:"#f0a0a0", marginTop:8, lineHeight:1.6 }}>
                    {!dataReady ? "Authorization has not been verified. Refresh the election list to retry." : "This wallet is not on the authorized list for this election, so it cannot vote."}
                    Open MetaMask → switch to your registered voter account → the page reloads automatically.
                    {isAdmin && <span style={{ display:"block", color:C.muted, marginTop:4 }}>
                      (The admin wallet must also be authorized explicitly before it can vote.)
                    </span>}
                  </div>
                )}
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
                      ✅ Your vote has a successful receipt. Inclusion is not finality; refresh to check its current status.
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
                      <Btn variant="primary" size="lg" onClick={handleVote} disabled={loading||!isAuthorizedVoter}>🗳 Cast Vote</Btn>
                    </>
                  )}
                </Card>
              )}

              {/* Commit-reveal — phase 1: commit */}
              {selElection.state==="active" && selElection.commitReveal && (
                <Card>
                  <SectionTitle>Commit Your Vote (Delayed Disclosure)</SectionTitle>
                  <p style={{ color:C.muted, fontSize:12 }}>Your candidate and wallet become public when you reveal. This is not an anonymous or coercion-resistant ballot. Keep your backup private; browser storage can be cleared or read by scripts on this site.</p>
                  <Btn variant="ghost" size="sm" onClick={loadSavedCommitment}>Load saved ballot</Btn>
                  <Btn variant="ghost" size="sm" onClick={downloadBackup}>Download private backup</Btn>
                  {hasCommitted ? (
                    <div style={{ fontSize:13, color:C.green, lineHeight:1.7 }}>
                      🔒 Your vote commitment is on-chain. {V2 ? "Return during the scheduled reveal window to have it counted." : "When the admin opens the reveal phase, come back here to reveal it."}
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
                      <p style={{ color:C.muted, fontSize:12 }}>A cryptographically random 32-byte secret is generated and saved before requesting a signature. Download a backup too. Retrying preserves an existing saved ballot.</p>
                      <Btn variant="primary" size="lg" onClick={handleCommit} disabled={loading||!isAuthorizedVoter}>🔒 Commit Vote</Btn>
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
                      <Btn variant="success" size="lg" onClick={handleReveal} disabled={loading||!isAuthorizedVoter||!selCandId||!voteSecret}>🔓 Reveal Vote</Btn>
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
                  {resultError && <p role="alert" style={{ color:C.red }}>{resultError}</p>}
                  <Outcome results={results}/>
                  {results.length===0
                    ? <Btn variant="success" onClick={()=>doLoadResults(selElection.id,candidates)}>Load Results</Btn>
                    : <>
                        <BarChart data={results}/>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, marginTop:16 }}>
                          <tbody>
                            {[...results].sort((a,b)=>b.votes-a.votes).map(r=>{
                              const leading = r.votes > 0 && r.votes === Math.max(...results.map(row=>row.votes));
                              return <tr key={r.id} style={{ borderBottom:`1px solid ${C.border}22`, background:leading?C.gold+"11":"transparent" }}>
                                <td style={{ padding:"9px 8px", color:C.muted, fontSize:11, fontFamily:C.mono }}>#{r.id}</td>
                                <td style={{ padding:"9px 8px", fontWeight:leading?600:400, color:leading?C.gold:C.text }}>
                                  {r.name}{leading ? " (highest tally)" : ""}
                                </td>
                                <td style={{ padding:"9px 8px", textAlign:"right", fontFamily:C.mono, fontWeight:600, color:leading?C.gold:C.text }}>
                                  {r.votes} {r.votes===1?"vote":"votes"}
                                </td>
                              </tr>;
                            })}
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
