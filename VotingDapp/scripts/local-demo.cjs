// All mutations are restricted to a fresh, unforked loopback Hardhat chain.
const fs=require("node:fs");
const path=require("node:path");
const {spawn}=require("node:child_process");

const {participants,assertLocalNode,phaseTimestamp}=require("./local-demo-lib.cjs");
const directory=path.resolve(__dirname,"../.votechain-local");
const file=path.join(directory,"session.json");
async function main() {
  const [command,...args]=process.argv.slice(2);
  const {createHardhatRuntimeEnvironment}=await import("hardhat/hre");
  const {default:config}=await import("../hardhat.local.config.js");
  const hre=await createHardhatRuntimeEnvironment(config,{config:path.resolve(__dirname,"../hardhat.local.config.js")},path.resolve(__dirname,".."));
  const connection=await hre.network.create("localhost");
  const {ethers}=connection;
  const provider=ethers.provider;
  // Hardhat's ethers wrapper reports a generic connection URL; validate the
  // actual Hardhat transport config, then independently verify chain identity.
  const metadata=await assertLocalNode(provider,await connection.networkConfig.url.getUrl());
  if(command==="setup") {
    const wallets=participants(args[0],args[1]);
    let previous;
    if(fs.existsSync(file)) {
      previous=JSON.parse(fs.readFileSync(file,"utf8"));
      if(previous.instanceId===metadata.instanceId) {
        if(args[2]!=="--replace-empty")throw new Error("This node already has a demo session. Use demo:ui, or --replace-empty only to replace a session with zero elections.");
        const old=await ethers.getContractAt("VotingSystemV2",previous.address);
        if((await old.electionCount())!==0n)throw new Error("Existing demo has elections; refusing to replace it");
      }
    }
    await hre.tasks.getTask("build").run({});
    for(const address of Object.values(wallets))await provider.send("hardhat_setBalance",[address,ethers.toQuantity(ethers.parseEther("100"))]);
    // Bootstrap only: the local simulator can impersonate an address, not sign
    // with its real private key. This capability is stopped before wallet tests.
    await provider.send("hardhat_impersonateAccount",[wallets.admin]);
    let voting;
    try {
      const factory=await ethers.getContractFactory("VotingSystemLocalTest",await provider.getSigner(wallets.admin));
      voting=await factory.deploy();await voting.waitForDeployment();
    } finally {await provider.send("hardhat_stopImpersonatingAccount",[wallets.admin]);}
    const receipt=await voting.deploymentTransaction().wait();
    const manifest={...wallets,instanceId:metadata.instanceId,chainId:31337,protocolVersion:2,localTestMode:true,
      address:voting.target,deploymentBlock:receipt.blockNumber,
      runtimeCodeHash:ethers.keccak256(await provider.getCode(voting.target))};
    fs.mkdirSync(directory,{recursive:true});
    if(previous)fs.writeFileSync(path.join(directory,`session-${Date.now()}-previous.json`),JSON.stringify(previous,null,2)+"\n",{flag:"wx"});
    fs.writeFileSync(file,JSON.stringify(manifest,null,2)+"\n");
    console.log("Local fast-test V2 fixture ready (no one-hour minimum). No real funds, keys or public-network transactions used.");
    console.log(JSON.stringify(manifest,null,2));
    return;
  }
  if(!fs.existsSync(file))throw new Error("Run demo:setup with your two PUBLIC addresses first");
  const manifest=JSON.parse(fs.readFileSync(file,"utf8"));
  if(manifest.instanceId!==metadata.instanceId)throw new Error("Local node restarted. Run demo:setup again; this manifest is stale.");
  const code=await provider.getCode(manifest.address);
  if(ethers.keccak256(code)!==manifest.runtimeCodeHash)throw new Error("Local contract no longer matches the session");
  if(command==="ui") {
    const child=spawn(process.execPath,[path.resolve(__dirname,"../voting-frontend/node_modules/vite/bin/vite.js"),"--host","127.0.0.1","--port","5174","--strictPort","--mode","localdemo"],{
      cwd:path.resolve(__dirname,"../voting-frontend"),stdio:"inherit",
      env:{...process.env,VITE_LOCAL_DEMO:"true",VITE_CHAIN_ID:"31337",VITE_PROTOCOL_VERSION:"2",
        VITE_FAST_LOCAL_TEST:String(manifest.localTestMode === true),
        VITE_CONTRACT_ADDRESS:manifest.address,VITE_DEPLOYMENT_BLOCK:String(manifest.deploymentBlock),VITE_EXPECTED_CODE_HASH:manifest.runtimeCodeHash},
    });
    for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
    child.on("error",error=>{console.error(error.message);process.exitCode=1;});
    child.on("exit",code=>{process.exitCode=code||0;});
    return;
  }
  const contract=await ethers.getContractAt("VotingSystemV2",manifest.address);
  const id=args[0];
  if(!/^[1-9][0-9]*$/.test(id||""))throw new Error("Provide a positive election ID");
  const election=await contract.getElection(id);
  if(command==="phase") {
    const now=(await provider.getBlock("latest")).timestamp;
    const target=phaseTimestamp(election,args[1],now);
    await provider.send("evm_setNextBlockTimestamp",[target]);await provider.send("evm_mine",[]);
    console.log("LOCAL clock advanced. This affects every election on this disposable node.");
  } else if(command!=="status")throw new Error("Unknown demo command");
  const current=await contract.getElection(id);
  console.log(JSON.stringify({election:id,name:current.name,state:["created","active","reveal","ended","cancelled"][current.state],
    sealed:current.isSealed,start:Number(current.startTime),votingEnd:Number(current.votingEnd),end:Number(current.endTime),
    candidates:Number(current.candidateCount),voters:Number(current.voterCount)},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
