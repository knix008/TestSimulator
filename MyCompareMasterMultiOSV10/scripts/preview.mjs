// Builds the release exe without an installer and runs it, which is the quickest way
// to see what an installed My Compare Master will actually do (bundled core + runtime).
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const built = spawnSync(process.execPath, [tauri, "build", "--no-bundle"], { cwd: root, stdio: "inherit" });
if (built.status) process.exit(built.status);

const exe = path.join(root, "src-tauri", "target", "release", process.platform === "win32" ? "MyCompareMaster.exe" : "MyCompareMaster");
const child = spawn(exe, process.argv.slice(2), { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
