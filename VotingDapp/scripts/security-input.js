// Standard Solidity input for scanners that do not understand Hardhat artifacts.
// Reads source only: no environment variables, wallet configuration or secrets.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const sources = {};
for (const filename of readdirSync(path.join(root, "contracts"), { recursive: true }).sort()) {
  if (!filename.endsWith(".sol")) continue;
  const name = `contracts/${filename.split(path.sep).join("/")}`;
  sources[name] = { content: readFileSync(path.join(root, name), "utf8") };
}
console.log(JSON.stringify({
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: false, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"], "": ["ast"] } },
  },
}, null, 2));
