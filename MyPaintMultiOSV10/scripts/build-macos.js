const { spawnSync } = require("child_process");

if (process.platform !== "darwin") {
  console.log("skipping the macOS build: electron-builder can package .app, .dmg and .pkg only on macOS.");
  process.exit(0);
}

const arch = process.argv.includes("--arm64") ? "arm64" : "x64";
const result = spawnSync("npx", ["electron-builder", "--mac", "--" + arch], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status == null ? 1 : result.status);
