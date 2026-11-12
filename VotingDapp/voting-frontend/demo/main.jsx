import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { summarizeResults } from "../src/lib/results.js";
import { applyAction, phases } from "./election.js";
import "./style.css";

const labels = ["Setup", "Sealed", "Commit", "Reveal", "Results"];
const clockLabels = { sealed: "Open voting", commit: "Open reveal", reveal: "Close election" };
const source = "https://github.com/Y-ash-Y/DecentralizedVotingSystem";

function Sandbox() {
  const [actor, setActor] = useState("admin");
  const [election, setElection] = useState(null);
  const [name, setName] = useState("Campus Council Demo");
  const [names, setNames] = useState(["Alice", "Bob"]);
  const [choice, setChoice] = useState(null);
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState("");
  const [resetting, setResetting] = useState(false);
  const phase = election?.phase;
  const currentStep = phases.indexOf(phase);

  function apply(action, message) {
    try {
      setElection(applyAction(election, actor, action));
      setStatus(message);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function request(action, title, message) {
    setStatus("");
    setPending({ action, title, message });
  }

  function reset() {
    setActor("admin");
    setElection(null);
    setName("Campus Council Demo");
    setNames(["Alice", "Bob"]);
    setChoice(null);
    setPending(null);
    setResetting(false);
    setStatus("Demo reset. Create a new election to start again.");
  }

  const results = election?.candidates.map(candidate => ({
    ...candidate, votes: Number(candidate.id === election.vote),
  })) ?? [];
  const summary = phase === "results" ? summarizeResults(results) : null;

  return (
    <main className="shell">
      <header className="masthead">
        <a href={source} className="brand">VoteChain <span>↗</span></a>
        <span className="badge">Browser sandbox</span>
      </header>
      <section className="intro">
        <p className="eyebrow">INTERACTIVE DEMO</p>
        <h1>Run a commit–reveal election.</h1>
        <p>Use two built-in demo accounts to set up an election, cast a hidden ballot and verify the tally. Wallet approvals and the chain clock are simulated in this tab.</p>
        <p className="detail">No MetaMask, test ETH, or terminal. Reloading starts a fresh session.</p>
      </section>
      <ol className="steps" aria-label="Election phases">
        {labels.map((label, index) => (
          <li key={label} data-current={index === currentStep} aria-current={index === currentStep ? "step" : undefined}>
            <span>{index + 1}</span> {label}
          </li>
        ))}
      </ol>
      <div className="layout">
        <aside className="card controls">
          <h2>Demo wallet</h2>
          <p>Select the account acting on this election.</p>
          <fieldset disabled={!!pending || resetting}>
            <legend>Active account</legend>
            {["admin", "voter"].map(role => (
              <label className="account" key={role}>
                <input type="radio" name="account" checked={actor === role}
                  onChange={() => { setActor(role); setStatus(""); }} />
                {role === "admin" ? "Demo Admin" : "Demo Voter"}
              </label>
            ))}
          </fieldset>
          {clockLabels[phase] && <div className="clock">
            <h3>Demo clock</h3>
            <p>Skip the wait between scheduled phases.</p>
            <button className="secondary" disabled={!!pending || resetting}
              onClick={() => apply({ type: "advance" }, "Demo clock advanced.")}>{clockLabels[phase]}</button>
          </div>}
          <button className="text-button" disabled={!election || !!pending || resetting} onClick={() => setResetting(true)}>Reset demo</button>
        </aside>
        <section className="card workspace" aria-label="Election workspace">
          <h2>{election?.name ?? "Create an election"}</h2>
          <fieldset disabled={!!pending || resetting}>
            {!election && (actor === "admin" ? (
              <form onSubmit={event => {
                event.preventDefault();
                request({ type: "create", name }, "Create election", "Election created. Register candidates and enroll the voter.");
              }}>
                <label htmlFor="name">Election name</label>
                <input id="name" value={name} maxLength={60} required onChange={event => setName(event.target.value)} />
                <button type="submit">Create election</button>
              </form>
            ) : <p>Switch to Demo Admin to create an election.</p>)}
            {phase === "setup" && (actor === "admin" ? <>
              <p>Register two candidates and enroll the demo voter before sealing the election.</p>
              <div className="candidates">
                {names.map((value, index) => <label key={index}>
                  Candidate {index + 1}
                  <input value={value} maxLength={40} onChange={event => setNames(current =>
                    current.map((item, i) => i === index ? event.target.value : item))} />
                </label>)}
              </div>
              <div className="actions">
                <button className="secondary" onClick={() => request({ type: "candidates", names },
                  "Register candidates", "Candidates registered.")}>Register candidates</button>
                <button className="secondary" disabled={election.enrolled} onClick={() => request({ type: "enroll" },
                  "Enroll demo voter", "Demo Voter is eligible.")}>{election.enrolled ? "Voter enrolled" : "Enroll demo voter"}</button>
              </div>
              <button disabled={election.candidates.length !== 2 || !election.enrolled}
                onClick={() => request({ type: "seal" }, "Seal setup", "Setup sealed. Use the demo clock to open voting.")}>Seal setup</button>
            </> : <p>The demo admin is preparing the candidate and voter lists.</p>)}
            {phase === "sealed" && <p>Setup is sealed. Switch to Demo Voter and use the demo clock to open voting.</p>}
            {phase === "commit" && (actor === "voter" && !election.hash ? <>
              <p>Pick a candidate. The demo records a cryptographic commitment while your ballot backup stays in memory.</p>
              <fieldset className="choices">
                <legend>Ballot choice</legend>
                {election.candidates.map(candidate => <label className="account" key={candidate.id}>
                  <input type="radio" name="choice" checked={choice === candidate.id}
                    onChange={() => setChoice(candidate.id)} />{candidate.name}
                </label>)}
              </fieldset>
              <button disabled={choice === null} onClick={() => request({ type: "commit", choice },
                "Commit ballot", "Commitment recorded. Open the reveal phase to finish voting.")}>Commit ballot</button>
            </> : <p>{election.hash ? "A ballot commitment is recorded. Its choice remains hidden until reveal." : "Switch to Demo Voter to cast a ballot."}</p>)}
            {phase === "reveal" && (election.vote !== null ? <p>Ballot revealed. Close the election to see the tally.</p> :
              !election.hash ? <p>No ballot was committed. Closing the election will show zero turnout.</p> :
              actor === "admin" ? <p>Switch to Demo Voter to reveal the committed ballot.</p> : <>
                <p>Reveal uses the original choice and secret to recompute the hash and verify that the ballot matches.</p>
                <button onClick={() => request({ type: "reveal", backup: election.backup },
                  "Reveal ballot", "Ballot verified and counted. Close the election to see the tally.")}>Reveal ballot</button>
              </>)}
          </fieldset>
          {election?.hash && <div className="commitment">
            <span>Recorded commitment</span>
            <code>{election.hash}</code>
          </div>}
          {summary && <>
            <p className="result">{summary.total ? `${summary.leaders[0].name} wins · ${summary.total} counted ballot` :
              "No ballots were counted."}</p>
            <dl>{results.map(candidate => <div className="tally" key={candidate.id}>
              <dt>{candidate.name}</dt><dd>{candidate.votes}</dd>
            </div>)}</dl>
          </>}
          {pending && <section className="confirmation" aria-label="Simulated wallet approval">
            <h3>Simulated wallet approval</h3>
            <p>{actor === "admin" ? "Demo Admin" : "Demo Voter"} · {pending.title}</p>
            <button onClick={() => { apply(pending.action, pending.message); setPending(null); }}>Approve demo transaction</button>
            <button className="secondary" onClick={() => { setPending(null); setStatus("Demo transaction rejected."); }}>Reject</button>
          </section>}
          {resetting && <section className="confirmation" aria-label="Reset confirmation">
            <h3>Reset this demo?</h3>
            <p>This clears the election and ballot from this tab.</p>
            <button onClick={reset}>Reset election</button>
            <button className="secondary" onClick={() => setResetting(false)}>Keep election</button>
          </section>}
          <p role="status" className="status">{status}</p>
        </section>
      </div>
      <footer>Election state stays in this tab. <a href={source + "#run-the-local-wallet-demo"}>Try the real MetaMask workflow</a>.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Sandbox />);
