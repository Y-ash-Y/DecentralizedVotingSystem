import { readFileSync } from "node:fs";
import { isHexString, keccak256 } from "ethers";
import { defineConfig } from "vite";
export default defineConfig(({ mode }) => {
  const sandbox = mode === "browser-sandbox";
  return {
  ...(sandbox && {
    base: "./",
    define: { __SANDBOX_ARTIFACT__: JSON.stringify(readSandboxArtifact()) },
  }),
  build: {
    ...(sandbox && { license: { fileName: "third-party-licenses.md" } }),
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "ethereum", test: /node_modules[\\/](ethers|@noble|@adraffy)[\\/]/ },
          ],
        },
      },
    },
  },
  };
});

function readSandboxArtifact() {
  const artifact = JSON.parse(readFileSync(new URL(
    "../artifacts/contracts/VotingV2.sol/VotingSystemV2.json", import.meta.url
  ), "utf8"));
  const { bytecode, deployedBytecode, contractName } = artifact;
  if (contractName !== "VotingSystemV2" ||
      ![bytecode, deployedBytecode].every(code => isHexString(code, true) && code !== "0x")) {
    throw new Error("Compile the scheduled voting contract before building the sandbox.");
  }
  return { bytecode, codeHash: keccak256(deployedBytecode) };
}
