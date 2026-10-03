import { expect } from "chai";
import { assertDeploymentNetwork } from "../scripts/deployment-network.cjs";
describe("Deployment network identity", function () {
  it("accepts only the reviewed network and chain pairs", function () {
    for (const [name, chain] of [["hardhat",31337],["localhost",31337],["sepolia",11155111]]) {
      expect(() => assertDeploymentNetwork(name, chain)).not.to.throw();
    }
  });
  it("rejects mainnet and mislabeled RPC endpoints before deployment", function () {
    for (const [name, chain] of [["mainnet",1],["sepolia",1],["localhost",11155111],["hardhat",1]]) {
      expect(() => assertDeploymentNetwork(name, chain)).to.throw("identity mismatch");
    }
  });
});
