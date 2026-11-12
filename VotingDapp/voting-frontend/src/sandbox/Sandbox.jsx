import { useEffect, useState } from "react";
import App from "../app.jsx";
import { Btn, C, CopyBtn } from "../components/presentation.jsx";
import { createSandboxChain } from "./chain.js";

const chainReady = createSandboxChain(__SANDBOX_ARTIFACT__);

export default function Sandbox() {
  const [chain, setChain] = useState(null);
  const [role, setRole] = useState("Admin");
  const [clock, setClock] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    chainReady.then(value => { if (mounted) setChain(value); },
      () => { if (mounted) setFailed(true); });
    return () => { mounted = false; };
  }, []);

  async function advance(seconds = 0) {
    try {
      await chain.advance(seconds);
      const latest = await chain.runnerFor(chain.admin).getBlock("latest");
      setClock(new Date(latest.timestamp * 1000));
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    if (!chain || failed) return;
    void advance();
    const timer = setInterval(advance, 2000);
    return () => clearInterval(timer);
  }, [chain, failed]);

  if (failed) return <p role="alert" style={{ padding: 20 }}>The browser chain could not start. Reload to open a fresh sandbox.</p>;
  if (!chain) return <p role="status" style={{ padding: 20 }}>Starting the isolated voting contract…</p>;
  const account = role === "Admin" ? chain.admin : chain.voter;

  return <>
    <aside aria-label="Sandbox controls" style={{ background: C.surface, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <strong style={{ color: C.gold, marginRight: 8 }}>Recruiter sandbox</strong>
        <div role="group" aria-label="Demo account">
          {["Admin", "Voter"].map(value => <button key={value}
            className="sandbox-role" type="button" aria-pressed={role === value} onClick={() => setRole(value)}>
            Demo {value}
          </button>)}
        </div>
        <span style={{ fontSize: 12, wordBreak: "break-all" }}>Voter address: {chain.voter}</span>
        <CopyBtn text={chain.voter} />
        <Btn size="sm" variant="ghost" onClick={() => advance(60)}>Advance 1 minute</Btn>
        {clock && <time dateTime={clock.toISOString()} style={{ color: C.muted, fontSize: 12 }}>Chain time {clock.toLocaleTimeString()}</time>}
      </div>
      <details style={{ fontSize: 12, color: C.muted }}>
        <summary style={{ cursor: "pointer" }}>How to try an election</summary>
        Enter as Demo Admin, choose a future start, create an election, add candidates, authorize the displayed voter address, and seal setup.
        Switch to Demo Voter and enter again. Advance the sandbox clock to vote, reveal, and see results.
        Reloading starts a fresh chain. This session runs the voting contract in your browser.
      </details>
    </aside>
    <App key={account} sandbox={{ ...chain, account, role, runner: chain.runnerFor(account) }} />
  </>;
}
