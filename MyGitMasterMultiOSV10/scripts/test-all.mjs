// `npm test`: the whole test run in one go.
//
//   1. unit tests  — test/run.ts (tsx): themes, settings, git in a scratch repository,
//                    the HTTP API, the terminal, the features, and the build layout —
//                    including the desktop core (server/desktop.ts) starting and answering
//   2. shell tests — `cargo test` in src-tauri: the Tauri shell (theme colours, popup and
//                    tool windows, every command granted, the core's path handling)
//
// Both parts print one line per test case (PASS/FAIL and its time), grouped by category
// with a progress line per category (test/format.mjs); the end is one summary over
// everything. Exit code 1 when anything failed. `--unit` or `--shell` runs one part only.
// Nothing touches the user's settings: the unit tests use a scratch settings folder.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bar, c, createReporter, formatMs, pad, stripAnsi } from "../test/format.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const runUnit = !args.includes("--shell");
const runShell = !args.includes("--unit");
const resultsDir = path.join(root, "test-results");
fs.mkdirSync(resultsDir, { recursive: true });

function run(command, commandArgs, { cwd = root, echo = true, env = {} } = {}) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, FORCE_COLOR: process.env.NO_COLOR ? "0" : "1", ...env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(command, commandArgs, { cwd, stdio: ["ignore", "pipe", "pipe"], env: childEnv, windowsHide: true });
    let output = "";
    const take = (stream) => (chunk) => {
      output += chunk;
      if (echo) stream.write(chunk);
    };
    child.stdout.on("data", take(process.stdout));
    child.stderr.on("data", take(process.stderr));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
  });
}

const sections = [];

if (runUnit) {
  fs.rmSync(path.join(resultsDir, "unit.json"), { force: true });
  const unit = await run(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--import", "./test/register-assets.mjs", "test/run.ts"]);
  fs.writeFileSync(path.join(resultsDir, "unit.log"), stripAnsi(unit.output));
  let counts = { passed: 0, total: 1, ms: 0 };
  try {
    counts = JSON.parse(fs.readFileSync(path.join(resultsDir, "unit.json"), "utf8"));
  } catch {
    /* the runner did not get as far as its summary */
  }
  sections.push({ name: "Unit (TypeScript)", ok: unit.code === 0 && counts.passed === counts.total, ...counts });
}

/** `cargo test` results: JSON with per-test times when libtest allows it, else the plain lines. */
function cargoResults(output) {
  const tests = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "test" && (event.event === "ok" || event.event === "failed")) {
        tests.push({ name: event.name, ok: event.event === "ok", ms: event.exec_time != null ? event.exec_time * 1000 : null, error: event.stdout || "" });
      }
    } catch {
      /* not a JSON line */
    }
  }
  if (tests.length) return tests;
  for (const match of stripAnsi(output).matchAll(/^test (\S+) \.\.\. (ok|FAILED)$/gm)) {
    tests.push({ name: match[1], ok: match[2] === "ok", ms: null, error: "" });
  }
  return tests;
}

if (runShell) {
  process.stdout.write(`\n${c.dim("  building the Tauri shell tests (cargo test)…")}\n`);
  const began = performance.now();
  const cargo = await run("cargo", ["test", "--quiet", "--", "-Z", "unstable-options", "--format", "json", "--report-time"], {
    cwd: path.join(root, "src-tauri"),
    echo: false,
    // Lets the stable test harness accept --format json / --report-time.
    env: { RUSTC_BOOTSTRAP: "1" },
  });
  fs.writeFileSync(path.join(resultsDir, "shell.log"), stripAnsi(cargo.output));
  const tests = cargoResults(cargo.output);
  const reporter = createReporter({ title: "My Git Master · shell tests (Rust)" });
  const category = (name) => {
    const parts = name.split("::").filter((part) => part !== "tests");
    return parts.length > 1 ? `Shell › ${parts[0]}.rs` : "Shell › main.rs";
  };
  const list = tests.map((test) => ({ ...test, group: category(test.name), label: test.name.split("::").pop().replaceAll("_", " ") }));
  list.sort((a, b) => a.group.localeCompare(b.group));
  const sizes = {};
  for (const item of list) sizes[item.group] = (sizes[item.group] ?? 0) + 1;
  reporter.start(list.length, sizes);
  for (const item of list) {
    const n = reporter.begin(item.group, item.label);
    reporter.end(item.group, item.label, n, item.ok, item.ms ?? NaN, item.error);
  }
  const summary = reporter.finish();
  if (!list.length) process.stdout.write(`${c.red(stripAnsi(cargo.output).split("\n").slice(-30).join("\n"))}\n`);
  sections.push({
    name: "Shell (Rust)",
    ok: cargo.code === 0 && summary.failed === 0 && summary.passed > 0,
    passed: summary.passed,
    total: Math.max(summary.total, 1),
    ms: performance.now() - began,
  });
}

const width = 72;
const line = c.dim("═".repeat(width));
process.stdout.write(`\n${line}\n${c.bold(c.white("  TEST SUMMARY"))}\n${line}\n`);
process.stdout.write(c.dim(`  ${pad("Part", 22)}${pad("Passed", 8, "right")}${pad("Failed", 8, "right")}${pad("Total", 7, "right")}${pad("Time", 12, "right")}  Progress\n`));
let passed = 0;
let total = 0;
let ms = 0;
for (const section of sections) {
  passed += section.passed;
  total += section.total;
  ms += section.ms || 0;
  const failed = section.total - section.passed;
  process.stdout.write(`  ${pad(c.cyan(section.name), 22)}${pad(c.green(String(section.passed)), 8, "right")}${pad(failed ? c.red(String(failed)) : c.dim("0"), 8, "right")}${pad(String(section.total), 7, "right")}${pad(c.yellow(formatMs(section.ms)), 12, "right")}  ${bar(section.passed, section.total, 16)}\n`);
}
const ok = sections.length > 0 && sections.every((section) => section.ok);
process.stdout.write(`${line}\n`);
const badge = ok ? c.okBadge(" ALL PASSED ") : c.failBadge(" FAILURES ");
process.stdout.write(`  ${pad(c.bold("TOTAL"), 22)}${pad(c.green(c.bold(String(passed))), 8, "right")}${pad(total - passed ? c.red(c.bold(String(total - passed))) : c.dim("0"), 8, "right")}${pad(c.bold(String(total)), 7, "right")}${pad(c.yellow(formatMs(ms)), 12, "right")}  ${badge}\n`);
process.stdout.write(`${line}\n${c.dim(`  Logs: ${resultsDir}`)}\n`);

fs.writeFileSync(
  path.join(resultsDir, "summary.json"),
  JSON.stringify({ sections, passed, total, ok, at: new Date().toISOString() }, null, 2),
);
process.exit(ok ? 0 : 1);
