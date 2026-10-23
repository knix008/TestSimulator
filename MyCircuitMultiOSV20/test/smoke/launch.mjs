// Shared by the GUI smoke tests: which program to start, and how.
//
// The tests drive src-tauri/target/debug/MyCircuit.exe, the debug build with
// the page embedded (npm run build:debug). When that is missing or older than
// the page or the host sources, it is rebuilt first, so a test never runs
// yesterday's code.
//
// MYCIRCUIT_CONFIG_DIR gives the run its own settings.json and webview profile
// (and no single-instance lock, so a MyCircuit the user has open is left
// alone); WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS opens CDP on `port`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const exe = path.join(root, "src-tauri", "target", "debug", process.platform === "win32" ? "MyCircuit.exe" : "MyCircuit");

if (process.platform !== "win32") {
  console.error("The GUI smoke tests need WebView2's remote debugging (Windows).");
  process.exit(2);
}

function newest(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let t = 0;
  for (const name of fs.readdirSync(p)) {
    if (name === "buildinfo.js") continue;
    t = Math.max(t, newest(path.join(p, name)));
  }
  return t;
}

const SOURCES = ["index.html", "style", "src", "assets", "docs", "sample", "src-tauri/src", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/capabilities"];
// `npm start` rebuilds the same exe without the page (it loads the dev
// server); build:debug leaves a stamp newer than the exe it made.
const stamp = path.join(path.dirname(exe), "embedded.stamp");
const built = fs.existsSync(exe) && fs.existsSync(stamp) && fs.statSync(stamp).mtimeMs >= fs.statSync(exe).mtimeMs ? fs.statSync(exe).mtimeMs : 0;
if (!built || SOURCES.some((s) => newest(path.join(root, s)) > built)) {
  console.log(built ? "MyCircuit.exe is older than the sources: rebuilding (npm run build:debug)…" : "No debug build yet: building (npm run build:debug)…");
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "build.mjs"), "debug"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

export function launchEnv({ port, profile, inlineDialogs = false, extra = {} }) {
  const env = { ...process.env, MYCIRCUIT_CONFIG_DIR: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, ...extra };
  if (inlineDialogs) env.MYCIRCUIT_INLINE_DIALOGS = "1";
  else delete env.MYCIRCUIT_INLINE_DIALOGS;
  return env;
}

// The main window's page (not a dialog window, not the manual).
export function isAppPage(t) {
  return t.type === "page" && /^https?:\/\/(tauri\.localhost|localhost:5196)\/(index\.html)?([?#].*)?$/.test(t.url);
}
