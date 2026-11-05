// Builds the app for npm run test:gui into its own folder, so a window started with npm start
// can stay open while the tests run.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, ["node_modules/@tauri-apps/cli/tauri.js", "build", "--debug", "--no-bundle"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, CARGO_TARGET_DIR: path.join(root, "src-tauri", "target", "e2e") },
});
process.exit(result.status ?? 1);
