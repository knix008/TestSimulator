// `tauri build` front-end step: the UI (dist/), the bundled core (dist-server/) and
// the runtime the installer ships (src-tauri/runtime/). Resolved from this file, so it
// works whether the Tauri CLI runs in the project root or in src-tauri.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build"],
  [path.join(root, "scripts", "bundle-server.mjs")],
  [path.join(root, "scripts", "stage-runtime.mjs")],
];
for (const args of steps) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
