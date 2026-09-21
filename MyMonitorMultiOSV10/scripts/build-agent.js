"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const agent = path.join(root, "agent");
const buildDir = path.join(agent, "build");
const config = process.argv.includes("--debug") ? "Debug" : "Release";

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

run("cmake", ["-S", agent, "-B", buildDir]);
run("cmake", ["--build", buildDir, "--config", config]);
