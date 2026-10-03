import { readFile } from "node:fs/promises";

export async function readBuildInfo(artifacts, contractName) {
  const id = await artifacts.getBuildInfoId(contractName);
  const filename = id && await artifacts.getBuildInfoPath(id);
  if (!filename) throw new Error("Compiler build information unavailable");
  return JSON.parse(await readFile(filename, "utf8"));
}
