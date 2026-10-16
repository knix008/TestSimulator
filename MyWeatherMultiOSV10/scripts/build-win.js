// Builds the Windows installer (NSIS) and copies it to the project root.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const build = spawnSync(process.execPath, [cli, "build", "--bundles", "nsis"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const copy = spawnSync(process.execPath, [path.join(root, "scripts", "copy-installer.js")], { cwd: root, stdio: "inherit" });
process.exit(copy.status ?? 1);
