// Puts everything the installed app needs to run its core into src-tauri/runtime/,
// which tauri.conf.json ships as a resource. The installed app then needs no Node.js,
// npm or node_modules on the machine:
//
//   runtime/node(.exe)     the Node runtime this build runs on
//   runtime/desktop.cjs    server/ + core/ + npm dependencies, one file
//   runtime/dist/          the built UI, served by the core to every window
//
// Run after `npm run build:ui` and `npm run build:server` (tauri-before-build does).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src-tauri", "runtime");

for (const needed of ["dist/index.html", "dist-server/desktop.cjs"]) {
  if (!fs.existsSync(path.join(root, needed))) {
    console.error(`[runtime] ${needed} is missing; run npm run build first`);
    process.exit(1);
  }
}

fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, "dist"), { recursive: true, force: true });
fs.cpSync(path.join(root, "dist"), path.join(out, "dist"), { recursive: true });
fs.copyFileSync(path.join(root, "dist-server", "desktop.cjs"), path.join(out, "desktop.cjs"));

// Copy the runtime only when it changed: it is ~90 MB.
const nodeName = process.platform === "win32" ? "node.exe" : "node";
const nodeDest = path.join(out, nodeName);
const source = fs.statSync(process.execPath);
const existing = fs.existsSync(nodeDest) ? fs.statSync(nodeDest) : null;
if (!existing || existing.size !== source.size || existing.mtimeMs < source.mtimeMs) {
  fs.copyFileSync(process.execPath, nodeDest);
  if (process.platform !== "win32") fs.chmodSync(nodeDest, 0o755);
}
console.log(`[runtime] ${path.relative(root, out)} ready (node ${process.version})`);
