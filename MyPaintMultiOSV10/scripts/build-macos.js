/* macOS: the .app and the .dmg. Tauri can bundle for macOS only on macOS, so anywhere else
 * this says so and stops without failing the whole `npm run build`. */
const path = require("path");
const { spawnSync } = require("child_process");

if (process.platform !== "darwin") {
  console.log("skipping the macOS build: Tauri can make the .app and .dmg only on macOS.");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const args = [path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build", "--bundles", "app,dmg"];
if (process.argv.includes("--arm64")) args.push("--target", "aarch64-apple-darwin");
else if (process.argv.includes("--x64")) args.push("--target", "x86_64-apple-darwin");
const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);
