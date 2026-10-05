const { spawnSync } = require("child_process");

const arch = process.argv.includes("--arm64") ? "arm64" : "x64";
const result = spawnSync("npx", ["electron-builder", "--mac", "--" + arch], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status == null ? 1 : result.status);
