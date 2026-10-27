// The Rust unit tests (src-tauri), one result line per test.

import { assert } from "../lib/harness.mjs";
import { TAURI, run } from "../lib/env.mjs";

export default async function rust(r) {
  const C = "Rust";
  let binary = null;
  await r.test(
    C,
    "Unit-test binary builds (cargo test --no-run)",
    () => {
      const out = run("cargo", ["test", "--no-run", "--message-format=json"], { cwd: TAURI });
      assert(out.status === 0, `cargo test --no-run failed:\n${out.stderr.split("\n").filter((l) => /error/.test(l)).join("\n")}`);
      for (const line of out.stdout.split("\n")) {
        if (!line.startsWith("{")) continue;
        const msg = JSON.parse(line);
        if (msg.reason === "compiler-artifact" && msg.profile?.test && msg.target?.name === "myvideoplayer_lib" && msg.executable) {
          binary = msg.executable;
        }
      }
      assert(binary, "test binary not found in cargo output");
    },
    { timeout: 900_000 },
  );
  if (!binary) return;

  const list = run(binary, ["--list", "--format", "terse"]).stdout;
  const names = list
    .split("\n")
    .filter((l) => l.endsWith(": test"))
    .map((l) => l.slice(0, -": test".length));
  for (const name of names) {
    await r.test(C, name.replace(/::tests::/, " › ").replace(/^tests::/, "lib › ").replace(/_/g, " "), () => {
      const res = run(binary, [name, "--exact", "--quiet", "--test-threads=1"]);
      assert(res.status === 0, (res.stdout + res.stderr).split("\n").filter((l) => l.trim() && !/^running|^test result/.test(l)).slice(-6).join("\n"));
    });
  }
}
