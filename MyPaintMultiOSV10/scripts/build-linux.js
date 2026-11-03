/* Linux: the .deb (whose pre-install script is build/linux-before-install.sh) and the
 * AppImage. Tauri bundles for Linux only on Linux, so anywhere else this says so and stops
 * without failing the whole `npm run build`. */
const path = require("path");
const { spawnSync } = require("child_process");

if (process.platform !== "linux") {
  console.log("skipping the Linux build: Tauri can make the .deb and AppImage only on Linux.");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const result = spawnSync(process.execPath, [cli, "build", "--bundles", "deb,appimage"], { cwd: root, stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);
