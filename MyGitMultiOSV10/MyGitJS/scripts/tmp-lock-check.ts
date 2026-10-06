import fs from "node:fs";
import path from "node:path";
import { gitEnv, runGit } from "../core/gitProcess.js";

const repo = process.argv[2];
const lock = path.join(repo, ".git", "index.lock");

console.log("GIT_OPTIONAL_LOCKS in gitEnv() =", JSON.stringify(gitEnv().GIT_OPTIONAL_LOCKS));

let hits = 0;
let was = false;
const timer = setInterval(() => {
  const present = fs.existsSync(lock);
  if (present && !was) hits += 1;
  was = present;
}, 1);

const now = Date.now() / 1000;
for (const name of fs.readdirSync(repo)) {
  if (name !== ".git") fs.utimesSync(path.join(repo, name), now, now);
}

for (let round = 0; round < 10; round++) {
  const result = await runGit(repo, ["status", "--porcelain", "-unormal"]);
  if (result.code !== 0) console.log("status failed:", result.stderr);
  await new Promise((resolve) => setTimeout(resolve, 30));
  for (const name of fs.readdirSync(repo)) {
    if (name !== ".git") fs.utimesSync(path.join(repo, name), now, now);
  }
}

clearInterval(timer);
console.log(`runGit status: index.lock created ${hits}/10 runs`);
