// `npm start`: tauri dev on a port nobody else is using. Without this, Tauri's built-in
// static server takes 1430, which other projects on this machine also use.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort } from "./free-port.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = await freePort(1460);
console.log(`MyWeather dev server: http://127.0.0.1:${port}`);
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const child = spawn(process.execPath, [cli, "dev", "--port", String(port), ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
