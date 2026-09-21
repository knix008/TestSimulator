"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const testDir = path.join(root, "test");
const files = fs
  .readdirSync(testDir)
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => path.join(testDir, name));

if (!files.length) {
  console.error("no test files in test/");
  process.exit(1);
}

const extra = process.argv.slice(2);
const reporter = pathToFileURL(path.join(root, "test", "reporter.js")).href
const args = extra.includes("--watch")
  ? ["--test", "--test-reporter", reporter, ...extra, ...files]
  : ["--test", "--test-reporter", reporter, "--test-force-exit", "--test-timeout=60000", ...extra, ...files];
const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit"
});
process.exit(result.status === null ? 1 : result.status);
