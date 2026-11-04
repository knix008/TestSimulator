// npm start: the app with the current sources (Vite + Tauri dev), on a port nobody else uses.
// npm run dev:web: only the page, in a browser.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort } from "./free-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webOnly = process.argv[2] === "web";
const port = await freePort(5288);
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(port), "--host", "127.0.0.1"], { cwd: root, stdio: "inherit" });

let tauri = null;
const quit = (code) => {
  vite.kill();
  tauri?.kill();
  process.exit(code ?? 0);
};
process.on("SIGINT", () => quit(0));
vite.on("exit", (code) => quit(code));

if (!webOnly) {
  const config = JSON.stringify({ build: { devUrl: `http://127.0.0.1:${port}`, beforeDevCommand: "" } });
  tauri = spawn(process.execPath, ["node_modules/@tauri-apps/cli/tauri.js", "dev", "--config", config], { cwd: root, stdio: "inherit" });
  tauri.on("exit", (code) => quit(code));
}
