"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const { ensureIco } = require("./ensure-ico");
const { copyInstaller } = require("./copy-installer");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "app");

const targets = {
  win: ["--win", "--x64"],
  mac: ["--mac"],
  linux: ["--linux"]
};

const platformArg = process.argv.includes("--mac")
  ? "mac"
  : process.argv.includes("--linux")
    ? "linux"
    : "win";

function run(cmd, args, cwd, extraEnv) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv }
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

const builderCli = path.join(appDir, "node_modules", "electron-builder", "cli.js");

ensureIco();
run(process.execPath, [path.join(root, "scripts", "build-agent.js")], root);
run(
  process.execPath,
  [builderCli, ...targets[platformArg]],
  appDir,
  { CSC_IDENTITY_AUTO_DISCOVERY: "false" }
);

const copied = copyInstaller();
console.log(`[build-app] copied ${copied.name} to project root`);
