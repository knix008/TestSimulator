// Runs Electron against the production build (dist/ + dist-server/) without packaging,
// which is the quickest way to see what an installed My Diff & Merge will actually do.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = { ...process.env, MDM_MODE: "prod" };
// Set globally on some machines; it would make Electron start as plain Node.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(require("electron"), ["electron/main.cjs", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env,
});

child.on("exit", (code) => process.exit(code ?? 0));
