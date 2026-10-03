import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { Interface } from "ethers";
const require=createRequire(import.meta.url);
const owner="0x0000000000000000000000000000000000000001";
const iface=new Interface(["function superAdmin() view returns(address)","function electionCount() view returns(uint)"]);
const responses={
  [iface.getFunction("superAdmin").selector]:iface.encodeFunctionResult("superAdmin",[owner]),
  [iface.getFunction("electionCount").selector]:iface.encodeFunctionResult("electionCount",[0]),
};
async function simulatedWallet(page) {
  // Read-only EIP-1193 simulator. Never a real wallet or a signing provider.
  await page.addInitScript(({owner,responses})=>{
    const zero="0x"+"0".repeat(64);
    window.ethereum={on(){},removeListener(){},async request({method,params}){
      if(method==="eth_chainId")return "0xaa36a7";
      if(method==="eth_requestAccounts"||method==="eth_accounts")return [owner];
      if(method==="eth_getCode")return "0x1234";
      if(method==="eth_blockNumber")return "0x1";
      if(method==="eth_getLogs")return [];
      if(method==="eth_call")return responses[params[0].data.slice(0,10)]||"0x";
      if(method==="eth_getBlockByNumber")return {number:params[0]==="0x0"?"0x0":"0x1",hash:zero,parentHash:zero,
        timestamp:"0x70000000",nonce:"0x0000000000000000",difficulty:"0x0",gasLimit:"0x1c9c380",
        gasUsed:"0x0",miner:owner,extraData:"0x",transactions:[],baseFeePerGas:"0x1"};
      throw new Error(`Read-only simulator: unexpected ${method}`);
    }};
  },{owner,responses});
}
async function checkPage(page,label,testInfo) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.addScriptTag({path:require.resolve("axe-core/axe.min.js")});
  const violations=await page.evaluate(async()=> (await window.axe.run()).violations
    .filter(v=>["serious","critical"].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
  expect(violations).toEqual([]);
  await page.screenshot({path:testInfo.outputPath(`${label}.png`),fullPage:true});
}
for(const width of [375,768,1440]) {
  test(`built landing and admin layout at ${width}px; isolated simulated wallet`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    // Reject unexpected network destinations; no external font/API/browser access.
    await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
    await simulatedWallet(page);
    await page.goto("/");
    await expect(page.getByRole("heading",{name:"VoteChain"})).toBeVisible();
    await checkPage(page,"landing",testInfo);
    await page.getByRole("button",{name:"Connect MetaMask"}).click();
    await expect(page.getByRole("button",{name:"Disconnect"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Admin",exact:true})).toBeVisible();
    await checkPage(page,"admin",testInfo);
    expect(errors).toEqual([]);
  });
}
