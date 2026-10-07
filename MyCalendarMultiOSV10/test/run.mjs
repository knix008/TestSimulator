import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitest = require.resolve("vitest/vitest.mjs");
const env = { ...process.env, FORCE_COLOR: "1" };
delete env.NO_COLOR;

const child = spawn(process.execPath, [vitest, "run"], {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
