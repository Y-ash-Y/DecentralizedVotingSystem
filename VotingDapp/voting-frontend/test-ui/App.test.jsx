import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

const state = vi.hoisted(() => ({
  owner:"0x0000000000000000000000000000000000000001",
  voter:"0x0000000000000000000000000000000000000002",
  address:"0x0000000000000000000000000000000000000003",
  account:"", events:[], phase:0, sealed:false, mode:true, exists:false,
  authorized:false, committed:false, voted:false, reject:false, wrongChain:false,
  calls:[], tally:0, admin:false, failedResults:false,
}));
vi.mock("../src/contract.js", async () => {
  const { keccak256 } = await import("ethers");
  return { CONTRACT_ADDRESS:state.address, CONTRACT_ABI:[], PROTOCOL_VERSION:2,
    EXPECTED_CODE_HASH:keccak256("0x1234"), NETWORK:{chainId:11155111,hex:"0xaa36a7",name:"Sepolia",symbol:"ETH",rpc:"https://rpc.sepolia.org",explorer:"https://sepolia.etherscan.io",get local(){return state.local;}}, SEPOLIA_CHAIN_ID:11155111, SEPOLIA_HEX:"0xaa36a7",
    SEPOLIA_EXPLORER:"https://sepolia.etherscan.io", SEPOLIA_RPC:"https://rpc.sepolia.org" };
});
function event(name,args) { state.events.push({name,args:{electionId:1n,...args}}); }
function receipt(apply=()=>{}) {
  const tx={to:state.address,data:"0x1234",value:0n};
  return {...tx, wait:async()=>{
    if(state.waitMode === "pending") return new Promise(resolve=>{
      state.resolveReceipt=result=>{if(result.status===1)apply();resolve(result);};
    });
    if(["repriced","cancelled","changed","repricedFailed"].includes(state.waitMode)) {
      const successful=state.waitMode==="repriced";
      if(successful)apply();
      throw {code:"TRANSACTION_REPLACED",cancelled:state.waitMode==="cancelled",
        reason:state.waitMode==="cancelled"?"cancelled":"repriced",
        replacement:{...tx,data:state.waitMode==="changed"?"0xabcd":tx.data},
        receipt:{hash:"0xreplacement",status:state.waitMode==="repricedFailed"?0:1}};
    }
    const result={hash:"0xreceipt",status:state.waitMode==="failed"?0:1};
    if(result.status===1)apply();
    return result;
  }};
}
vi.mock("../src/lib/chainData.js", async original => {
  const real = await original();
  return { ...real, createEventReader:()=>({invalidate:()=>{}, read:async()=>state.events}) };
});
vi.mock("ethers", async original => {
  const actual = await original();
  const runner = {getAddress:async()=>state.account,getNetwork:async()=>({chainId:11155111n}),getCode:async()=>"0x1234",getBlockNumber:async()=>1,getBlock:async()=>({hash:"stable",timestamp:Math.floor(Date.now()/1000)})};
  runner.provider = runner;
  class BrowserProvider { constructor(){Object.assign(this,runner);} async getSigner(){return runner;} }
  class Contract {
    constructor(){this.runner=runner;}
    async protocolVersion(){return 2n;}
    async MIN_PHASE_DURATION(){return state.minimumPhase;}
    async superAdmin(){return state.owner;}
    async getElection(){return {state:BigInt(state.phase),isSealed:state.sealed,startTime:2_000_000_000n,votingEnd:2_000_003_600n,endTime:2_000_007_200n};}
    async isElectionAdmin(){return state.account===state.owner||state.admin;}
    async createElection(name,start,close,end,mode){state.calls.push("create");state.exists=true;state.mode=mode;event("ElectionCreated",{name,commitReveal:mode});return receipt();}
    async addCandidates(id,names){state.calls.push("candidates");names.forEach((name,i)=>event("CandidateAdded",{candidateId:BigInt(i+1),name}));return receipt();}
    async authorizeVoters(id,addresses){state.calls.push("authorize");state.authorized=true;addresses.forEach(voter=>event("VoterAuthorized",{voter}));return receipt();}
    async startElection(){state.calls.push("seal");state.sealed=true;return receipt();}
    async commitVote(){if(state.rejectWrite)throw Object.assign(new Error("Rejected"),{code:4001});state.calls.push("commit");return receipt(()=>{state.committed=true;event("VoteCommitted",{voter:state.account});});}
    async revealVote(){state.calls.push("reveal");return receipt(()=>{state.voted=true;state.tally=1;event("VoteRevealed",{voter:state.account});});}
    async vote(){state.calls.push("vote");return receipt(()=>{state.voted=true;state.tally=1;event("VoteCast",{voter:state.account});});}
    async getCandidateVotes(id,candidate){if(state.failedResults)throw new Error("RPC failed");return candidate===1n?BigInt(state.tally):BigInt(state.bobTally);}
  }
  return {...actual,ethers:{...actual.ethers,BrowserProvider,Contract}};
});
import App from "../src/app.jsx";

beforeEach(()=>{
  state.local=false;
  state.minimumPhase=1n;
  state.rejectMessage="";
  Object.assign(state,{account:state.owner,events:[],phase:0,sealed:false,mode:true,exists:false,authorized:false,committed:false,voted:false,reject:false,wrongChain:false,calls:[],tally:0,bobTally:0,admin:false,failedResults:false,waitMode:"success",resolveReceipt:null,rejectWrite:false});
  localStorage.clear();
  window.ethereum={on:vi.fn(),removeListener:vi.fn(),request:vi.fn(async({method})=>{
    if(method==="eth_requestAccounts") {if(state.reject)throw new Error(state.rejectMessage||"User rejected connection");return [state.account];}
    if(method==="eth_chainId")return state.wrongChain?"0x1":"0xaa36a7";
    if(method==="wallet_switchEthereumChain"){throw new Error("Network switch rejected");}
  })};
});
afterEach(cleanup);
const connect = async()=>{fireEvent.click(screen.getByRole("button",{name:"Connect MetaMask"}));await screen.findByRole("button",{name:"Disconnect"});};
const clickElection=async()=>{fireEvent.click(screen.getByText("Council",{exact:true}));await screen.findByText("Voting as:").catch(()=>{});};
function seed(mode=true){state.exists=true;state.mode=mode;event("ElectionCreated",{name:"Council",commitReveal:mode});event("CandidateAdded",{candidateId:1n,name:"Alice"});event("CandidateAdded",{candidateId:2n,name:"Bob"});event("VoterAuthorized",{voter:state.voter});}

describe("App integration with an isolated wallet/contract simulator",()=>{
  it("local polling updates scheduled phases without a refresh click",async()=>{
    state.local=true;state.account=state.voter;state.phase=0;state.sealed=true;seed();
    let poll;
    const realSetInterval=globalThis.setInterval;
    vi.spyOn(globalThis,"setInterval").mockImplementation((fn,ms,...args)=>{
      if(ms===2000)poll=fn;
      return realSetInterval(fn,ms,...args);
    });
    render(<App/>);await connect();await clickElection();
    expect(screen.queryByRole("button",{name:"Select",exact:true})).toBeNull();
    expect(poll).toBeTypeOf("function");
    state.phase=1;await act(async()=>{await poll();});
    expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2);
    expect(screen.getByText("Commit phase open — submit a hidden vote")).toBeTruthy();
    state.phase=2;await act(async()=>{await poll();});
    expect(screen.getByText("Reveal phase — reveal your committed vote")).toBeTruthy();
    state.phase=3;await act(async()=>{await poll();});
    expect(screen.getByText("Election closed")).toBeTruthy();expect(state.calls).toEqual([]);
  });
  it("renders safely without a wallet and asks for installation",()=>{delete window.ethereum;const alert=vi.spyOn(window,"alert").mockImplementation(()=>{});render(<App/>);fireEvent.click(screen.getByRole("button",{name:"Connect MetaMask"}));expect(alert).toHaveBeenCalledWith("Please install MetaMask");});
  it("shows connection rejection and sends no writes",async()=>{state.reject=true;render(<App/>);fireEvent.click(screen.getByRole("button",{name:"Connect MetaMask"}));await screen.findByText(/User rejected connection/);expect(state.calls).toEqual([]);});
  it("does not display raw provider connection errors",async()=>{
    state.reject=true;state.rejectMessage="https://rpc.example/private-credential";
    render(<App/>);fireEvent.click(screen.getByRole("button",{name:"Connect MetaMask"}));
    await screen.findByText(/Check the wallet network/);
    expect(document.body.textContent).not.toContain("private-credential");expect(state.calls).toEqual([]);
  });
  it("corrupt ballot storage blocks commit without exposing stored contents",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;seed();render(<App/>);await connect();await clickElection();
    localStorage.setItem(`vc_cr_${state.address}_1_${state.voter}`,"invalid-ballot-secret-fixture");
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await screen.findByText(/Cannot prepare commitment/);
    expect(document.body.textContent).not.toContain("invalid-ballot-secret-fixture");expect(state.calls).not.toContain("commit");
  });
  it("wrong-network refusal blocks login",async()=>{state.wrongChain=true;render(<App/>);fireEvent.click(screen.getByRole("button",{name:"Connect MetaMask"}));await screen.findByText(/Network switch rejected/);expect(state.calls).toEqual([]);});
  it("does not expose admin navigation to an ordinary voter",async()=>{state.account=state.voter;render(<App/>);await connect();expect(screen.queryByRole("button",{name:"Admin",exact:true})).toBeNull();});
  it("shows delegated administration without giving election-creation authority",async()=>{state.account=state.voter;state.admin=true;seed();render(<App/>);await connect();await screen.findByRole("button",{name:"Admin",exact:true});expect(screen.queryByRole("button",{name:/Create .*Election/})).toBeNull();});
  it("completes create, candidate batch, authorization and sealing via UI",async()=>{
    render(<App/>);await connect();
    fireEvent.change(screen.getByLabelText("Election name"),{target:{value:"Council"}});
    const date = new Date(Date.now()+86400_000);date.setSeconds(0,0);
    const local = d=>new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);
    fireEvent.change(screen.getByLabelText("Voting starts (local time)"),{target:{value:local(date)}});
    fireEvent.change(screen.getByLabelText("Voting closes (local time)"),{target:{value:local(new Date(+date+7200_000))}});
    fireEvent.click(screen.getByRole("button",{name:"Create Election"}));
    await screen.findByText("Council",{exact:true});fireEvent.click(screen.getByText("Council",{exact:true}));
    fireEvent.change(await screen.findByLabelText("Candidate names"),{target:{value:"Alice,\nBob"}});
    fireEvent.click(screen.getByRole("button",{name:"Add Candidates"}));await screen.findByText("Alice",{exact:true});
    fireEvent.change(screen.getByLabelText("Voter wallet addresses"),{target:{value:state.voter}});
    fireEvent.click(screen.getByRole("button",{name:"Authorize Voter"}));
    await waitFor(()=>expect(state.calls).toContain("authorize"));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Seal Setup"}).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button",{name:"Seal Setup"}));
    await waitFor(()=>expect(state.sealed).toBe(true));
    expect(state.calls).toEqual(["create","candidates","authorize","seal"]);
  });
  it.each([1n,3600n])("checks one-minute schedules against the deployed minimum %s",async(minimum)=>{
    state.minimumPhase=minimum;
    render(<App/>);await connect();
    fireEvent.change(screen.getByLabelText("Election name"),{target:{value:"Minute election"}});
    fireEvent.click(screen.getByRole("checkbox"));
    const date=new Date(Date.now()+86400_000);date.setSeconds(0,0);
    const local=d=>new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16);
    for(const [label,offset] of [["Voting starts (local time)",0],["Commit closes (local time)",60000],["Reveal closes (local time)",120000]]) {
      fireEvent.change(screen.getByLabelText(label),{target:{value:local(new Date(+date+offset))}});
    }
    fireEvent.click(screen.getByRole("button",{name:"Create Commit-Reveal Election"}));
    if(minimum===1n) await waitFor(()=>expect(state.calls).toContain("create"));
    else {await screen.findByText(/requires 3600 seconds per phase/);expect(state.calls).not.toContain("create");}
  });
  it("commits and reveals with a durable secret, then displays the final tally",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;seed();render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);
    fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await waitFor(()=>expect(state.committed).toBe(true));expect(localStorage.length).toBe(1);
    state.phase=2;fireEvent.click(screen.getByRole("button",{name:"↻"}));
    fireEvent.click(await screen.findByRole("button",{name:"Load saved"}));
    fireEvent.click(screen.getByRole("button",{name:/Reveal Vote/}));
    await waitFor(()=>expect(state.voted).toBe(true));
    expect(localStorage.length).toBe(1); // A receipt is not finality: preserve recovery.
    state.phase=3;fireEvent.click(screen.getByRole("button",{name:"↻"}));
    await screen.findByText(/Highest tally: Alice/);expect(state.calls).toEqual(["commit","reveal"]);
  });
  it("plain voting casts once and displays recorded status",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;seed(false);render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Cast Vote/}));
    await screen.findByText(/Your vote has a successful receipt/);expect(state.calls).toEqual(["vote"]);
  });
  it("storage failure prevents a commit transaction",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;seed();render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("Storage denied");});
    fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await screen.findByText(/Cannot prepare commitment/);expect(state.calls).not.toContain("commit");
  });
  it("failed result reads display an error, not a winner",async()=>{
    state.account=state.voter;state.phase=3;state.sealed=true;state.failedResults=true;seed();render(<App/>);await connect();await clickElection();
    await screen.findByRole("alert");expect(screen.queryByText(/Highest tally:/)).toBeNull();
  });
  it("wallet rejection preserves the commit backup without reporting success",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;state.rejectWrite=true;seed();render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await screen.findByText(/Wallet request rejected/);expect(localStorage.length).toBe(1);expect(state.calls).toEqual([]);
  });
  it("a failed receipt is not displayed as a successful vote",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;state.waitMode="failed";seed(false);render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Cast Vote/}));
    await screen.findByText(/Transaction was not confirmed successfully/);
    expect(screen.queryByText(/Your vote has a successful receipt/)).toBeNull();
    expect(state.tally).toBe(0);expect(state.voted).toBe(false);
  });
  it.each(["repriced","cancelled","changed","repricedFailed"])("handles %s replacement without inventing a vote",async(mode)=>{
    state.account=state.voter;state.phase=1;state.sealed=true;state.waitMode=mode;seed(false);
    render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Cast Vote/}));
    if(mode==="repriced") {
      await screen.findByText(/Your vote has a successful receipt/);expect(state.tally).toBe(1);
    } else {
      await screen.findByText(mode==="repricedFailed"?/Transaction was not confirmed successfully/:/Transaction cancelled or replaced/);
      expect(screen.queryByText(/Your vote has a successful receipt/)).toBeNull();expect(state.tally).toBe(0);
    }
    expect(state.calls).toEqual(["vote"]);
  });
  it("reject then retry reuses the exact saved ballot and counts one commitment",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;state.rejectWrite=true;seed();
    render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await screen.findByText(/Wallet request rejected/);
    const key=`vc_cr_${state.address}_1_${state.voter}`,saved=localStorage.getItem(key);
    expect(saved).not.toBeNull();state.rejectWrite=false;
    fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await waitFor(()=>expect(state.committed).toBe(true));
    expect(localStorage.getItem(key)).toBe(saved);expect(state.calls).toEqual(["commit"]);
  });
  it("a remounted app recovers a committed ballot for reveal",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;seed();const first=render(<App/>);
    await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await waitFor(()=>expect(state.committed).toBe(true));
    const saved=localStorage.getItem(`vc_cr_${state.address}_1_${state.voter}`);
    first.unmount();state.phase=2;render(<App/>);await connect();await clickElection();
    fireEvent.click(await screen.findByRole("button",{name:"Load saved"}));fireEvent.click(screen.getByRole("button",{name:/Reveal Vote/}));
    await waitFor(()=>expect(state.voted).toBe(true));expect(state.tally).toBe(1);
    expect(localStorage.getItem(`vc_cr_${state.address}_1_${state.voter}`)).toBe(saved);
  });
  it("an unenrolled wallet has no candidate selection or transaction",async()=>{
    state.account=state.address;state.phase=1;state.sealed=true;seed(false);render(<App/>);await connect();await clickElection();
    await screen.findByText(/This wallet is not on the authorized list/);
    expect(screen.queryByRole("button",{name:"Select",exact:true})).toBeNull();expect(state.calls).toEqual([]);
  });
  it("connection can recover after the user corrects the wallet network",async()=>{
    state.wrongChain=true;render(<App/>);fireEvent.click(screen.getByRole("button",{name:"Connect MetaMask"}));
    await screen.findByText(/Network switch rejected/);state.wrongChain=false;await connect();
    expect(state.calls).toEqual([]);expect(screen.getByRole("button",{name:"Admin",exact:true})).toBeTruthy();
  });
  it("pending receipts block duplicate submission and disconnect",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;state.waitMode="pending";seed(false);render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);
    const button=screen.getByRole("button",{name:/Cast Vote/});fireEvent.click(button);fireEvent.click(button);
    await waitFor(()=>expect(state.resolveReceipt).toBeTypeOf("function"));
    expect(state.calls).toEqual(["vote"]);expect(screen.getByRole("button",{name:"Disconnect"}).disabled).toBe(true);
    state.resolveReceipt({hash:"0xreceipt",status:1});await screen.findByText(/Your vote has a successful receipt/);
  });
  it("a changed wallet sender is rejected before requesting a transaction",async()=>{
    state.account=state.voter;state.phase=1;state.sealed=true;seed();render(<App/>);await connect();await clickElection();
    await waitFor(()=>expect(screen.getAllByRole("button",{name:"Select"})).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button",{name:"Select"})[0]);state.account=state.owner;
    fireEvent.click(screen.getByRole("button",{name:/Commit Vote/}));
    await screen.findByText(/Wallet account changed/);expect(state.calls).toEqual([]);expect(localStorage.length).toBe(1);
  });
  it("zero turnout does not manufacture a leading candidate in the admin statistics",async()=>{
    state.phase=3;state.sealed=true;seed();render(<App/>);await connect();
    fireEvent.click(screen.getByText("Council",{exact:true}));
    await screen.findByText("No votes were counted. No winner can be declared.");
    expect(screen.getByText("No votes cast")).toBeTruthy();
    expect(screen.queryByText("Leading",{exact:true})).toBeNull();
  });
  it("equal tallies list both joint leaders in admin statistics",async()=>{
    state.phase=3;state.sealed=true;state.tally=2;state.bobTally=2;seed();render(<App/>);await connect();
    fireEvent.click(screen.getByText("Council",{exact:true}));
    await screen.findByText("Tie: Alice, Bob. No tie-break rule is implemented.");
    expect(screen.getByText("Joint leaders")).toBeTruthy();
    expect(screen.getByText("Alice, Bob",{exact:true})).toBeTruthy();
  });
});
