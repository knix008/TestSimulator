// Development launcher. Everything runs from source, so a restart always picks up the
// latest edit; UI edits show live.
//
//   node scripts/dev.mjs desktop [args]   the Tauri app (`npm start`): Vite dev server +
//                                         `tauri dev`; the shell starts the core from
//                                         server/desktop.ts and Vite proxies /api to it
//   node scripts/dev.mjs web     [args]   the browser version: API server + Vite
//
// Ports are picked free on both IPv4 and IPv6, so another program's server is never
// what the window shows. Trailing arguments are the ones the app itself takes
// (`--merge BASE LOCAL REMOTE MERGED` and friends).
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { freePort } from "./free-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "web" ? "web" : "desktop";
const appArgs = process.argv.slice(3);
const children = [];

// Tools are launched by their entry script rather than through `npx`, so no shell sits
// between us and them — otherwise killing the launcher leaves orphans on the dev ports.
const bin = (...parts) => path.join(root, "node_modules", ...parts);

function run(command, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, args, { cwd: root, stdio: "inherit", env });
  children.push(child);
  child.on("exit", (code) => {
    if (child.stopped) return;
    shutdown(code ?? 0);
  });
  return child;
}

function shutdown(code) {
  for (const child of children) {
    if (child.stopped || child.exitCode !== null) continue;
    child.stopped = true;
    try {
      // Windows needs the whole tree; a plain kill() leaves the app and the core behind.
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        child.kill();
      }
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

async function waitFor(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const uiPort = await freePort(5176);
const apiPort = await freePort(4780, [uiPort]);
const uiUrl = `http://127.0.0.1:${uiPort}`;

if (mode === "web") {
  run(process.execPath, [bin("tsx", "dist", "cli.mjs"), "server/cli.ts", ...appArgs], { PORT: String(apiPort) });
}
run(process.execPath, [bin("vite", "bin", "vite.js"), "--port", String(uiPort), "--strictPort"], {
  MCM_API: `http://127.0.0.1:${apiPort}`,
});
await waitFor(`${uiUrl}/`);

if (mode === "desktop") {
  console.log(`\nMy Compare Master (desktop)  UI ${uiUrl}  core :${apiPort}\n`);
  run(process.execPath, [bin("@tauri-apps", "cli", "tauri.js"), "dev", "--no-watch", "--", "--", ...appArgs], {
    MCM_UI: uiUrl,
    MCM_CORE_PORT: String(apiPort),
  });
} else {
  console.log(`\nMy Compare Master (web)  ${uiUrl}\n`);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
