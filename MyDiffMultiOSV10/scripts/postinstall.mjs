// npm 12 blocks dependency install scripts unless they are explicitly approved, which
// can leave the Electron runtime undownloaded. The root package's own postinstall is
// always allowed to run, so fetch the binary here when it is missing.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(root, "node_modules", "electron");
const installer = path.join(electronDir, "install.js");

if (!fs.existsSync(installer)) process.exit(0);

const binary = process.platform === "win32"
  ? path.join(electronDir, "dist", "electron.exe")
  : process.platform === "darwin"
    ? path.join(electronDir, "dist", "Electron.app")
    : path.join(electronDir, "dist", "electron");

if (fs.existsSync(binary)) process.exit(0);

console.log("postinstall  downloading the Electron runtime...");
try {
  execFileSync(process.execPath, [installer], { cwd: electronDir, stdio: "inherit" });
} catch {
  console.warn("postinstall  could not download Electron; run `node node_modules/electron/install.js` manually.");
}
