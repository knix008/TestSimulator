// Development launcher: starts the API server and the Vite dev server, then opens the
// app. Everything runs from source, so a restart always picks up the latest edit.
//
//   node scripts/dev.mjs desktop [args]   Electron window against the Vite dev server
//   node scripts/dev.mjs web     [args]   browser at http://127.0.0.1:5176
//
// Trailing arguments are the ones the app itself takes (`--merge BASE LOCAL REMOTE
// MERGED` and friends), so a git tool invocation can be reproduced in development.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "web" ? "web" : "desktop";
const uiUrl = "http://127.0.0.1:5176";
const apiPort = Number(process.env.PORT || 4780);
const children = [];

// Tools are launched by their entry script rather than through `npx`, so no shell sits
// between us and them — otherwise killing the launcher leaves orphans on the dev ports.
const bin = (...parts) => path.join(root, "node_modules", ...parts);

function run(command, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  // Set globally on some machines; it would make Electron start as plain Node.
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
      // Windows needs the whole tree; a plain kill() leaves the renderer behind.
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

const appArgs = process.argv.slice(3);

run(process.execPath, [bin("tsx", "dist", "cli.mjs"), "server/cli.ts", ...appArgs], {
  PORT: String(apiPort),
});
run(process.execPath, [bin("vite", "bin", "vite.js"), "--port", "5176", "--strictPort"], {
  MDM_API: `http://127.0.0.1:${apiPort}`,
});

await waitFor(`${uiUrl}/`);

if (mode === "desktop") {
  run(require("electron"), ["electron/main.cjs", ...appArgs], {
    MDM_UI: uiUrl,
    MDM_MODE: "dev",
  });
} else {
  console.log(`\nMy Diff & Merge (web)  ${uiUrl}\n`);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
