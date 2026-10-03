// Read-only publication preflight. Prints filenames/rule names, never secret values.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../../",import.meta.url));
const files=[...new Set(execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean))];
const findings=[];
let checked=0;
for(const file of files) {
  const absolute=path.join(root,file);
  if(!existsSync(absolute))continue; // A working-tree deletion is not published.
  const stat=lstatSync(absolute);
  if(stat.isSymbolicLink()){findings.push({file,rule:"review symlink before publication"});continue;}
  if(!stat.isFile())continue;
  const name=path.basename(file);
  if((name.startsWith(".env")&&name!==".env.example") || /\.(key|pem)$/.test(name) || /^votechain-ballot-.*\.json$/.test(name) ||
    /(^|\/)(node_modules|artifacts|cache|coverage|dist|test-results|playwright-report|\.votechain-local|\.claude|votingdapp-scrub\.git)(\/|$)/.test(file) || name===".DS_Store") {
    findings.push({file,rule:"private/generated file in publication candidates"});continue;
  }
  if(stat.size>2_000_000){findings.push({file,rule:"unexpected large file; review before publication"});continue;}
  const contents=readFileSync(absolute);
  if(contents.includes(0))continue; // Binary files need separate review.
  checked++;
  const text=contents.toString("utf8");
  const rules=[
    ["private key assignment",/\bPRIVATE[_-]?KEY\b\s*[=:]\s*["']?(?:0x)?[a-f0-9]{64}\b/i],
    ["PEM private key",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["Alchemy credential URL",/https:\/\/[^\s"']*alchemy\.com\/v2\/(?!YOUR_ALCHEMY_KEY\b|<)[A-Za-z0-9_-]{12,}/],
    ["GitHub token",/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ];
  for(const [rule,regex] of rules)if(regex.test(text))findings.push({file,rule});
}
console.log(JSON.stringify({checkedTextFiles:checked,findings,scope:"working-tree publication candidates; not history, forks, credentials revocation or a complete secret audit"},null,2));
if(findings.length)process.exitCode=1;
