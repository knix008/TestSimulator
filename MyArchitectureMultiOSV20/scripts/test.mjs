// Runs every unit test file (one `node --test` per file — running the folder
// in one go fails on this Windows setup) and prints the results grouped by
// category, each test with its run time, slowest first, followed by a
// colour summary. The desktop shell's own tests (cargo test in src-tauri)
// run last, as one more category. Exits non-zero when anything fails.
//
//   npm test                    all files, then the Rust tests
//   npm test -- sim drc         only files whose name contains "sim" or "drc"
//   npm test -- rust            only the Rust tests (npm run test:rust prints cargo's own output)
//   npm test -- --json out.json also write the full result list as JSON
import { spawn } from "node:child_process";
import { readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "test", "unit");
const args = process.argv.slice(2);
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? args.splice(jsonIdx, 2)[1] : null;
const filters = args;

// Which category each test file belongs to (order = display order).
export const CATEGORIES = [
  ["Core model & geometry", "핵심 모델·기하", ["core", "walls", "rooms", "elements"]],
  ["Plan editing", "평면 편집", ["plan", "editor", "store", "docs"]],
  ["Checks & schedules", "검사·집계", ["check", "schedule"]],
  ["Views, sheets & annotation", "뷰·시트·주석", ["views"]],
  ["3D model", "3D 모델", ["view3d", "lights", "perf3d", "interior", "members", "structures"]],
  ["SketchUp modelling (meshes, solid tools, components)", "스케치업 모델링 (메시, 솔리드 도구, 컴포넌트)", ["mesh", "sketchup", "massing"]],
  ["CAD exchange (DXF, DWG, SVG)", "CAD 교환 (DXF, DWG, SVG)", ["dxf", "dwg", "dwgwrite", "cadextra", "dxfbin", "svgimport"]],
  ["Printing & PDF", "인쇄·PDF", ["pdf"]],
  ["BIM exchange (IFC, ifcXML, IFCZIP)", "BIM 교환 (IFC, ifcXML, IFCZIP)", ["ifc", "ifcxml"]],
  ["Other BIM (SH3D, gbXML, IFCZIP)", "다른 BIM (SH3D, gbXML, IFCZIP)", ["interop", "gbxml", "sh3d"]],
  ["3D exchange", "3D 교환", ["export3d", "models", "rhino3dm"]],
  ["Samples", "예제", ["samples"]],
  ["Start page", "시작 화면", ["startlayout"]],
  ["Localization", "다국어", ["i18n"]],
  ["Desktop shell (Rust)", "데스크톱 셸 (Rust)", ["rust"]],
];
const categoryOf = (file) => {
  const base = path.basename(file).replace(".test.mjs", "");
  const c = CATEGORIES.find(([, , list]) => list.includes(base));
  return c ? c[0] : "Other";
};

const color = process.stdout.isTTY || process.env.FORCE_COLOR ? true : !process.env.NO_COLOR;
const C = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = C("32"), red = C("31"), yellow = C("33"), cyan = C("36"), dim = C("2"), bold = C("1"), magenta = C("35");
const bgGreen = C("42;30;1"), bgRed = C("41;37;1"), bgBlue = C("44;37;1");
const msFmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`);
const timeColor = (ms) => (ms < 50 ? green : ms < 500 ? yellow : red);
const bar = (frac, width, paint) => { const n = Math.max(0, Math.round(frac * width)); return paint("█".repeat(n)) + dim("░".repeat(Math.max(0, width - n))); };

const files = existsSync(dir)
  ? readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).filter((n) => !filters.length || filters.some((f) => n.includes(f))).sort()
  : [];
const wantRust = !filters.length || filters.some((f) => "rust".includes(f));
if (!files.length && !wantRust) {
  console.error("test: no test/unit/*.test.mjs files found");
  process.exit(1);
}

const env = { ...process.env };

function runFile(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ["--test", "--test-reporter=./scripts/test-reporter.mjs", path.join("test", "unit", name)], { cwd: root, env });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { err += b; });
    child.on("close", (code) => {
      const tests = [];
      for (const line of out.split("\n")) {
        if (!line.startsWith("{")) continue;
        // A failing `todo` test documents a known gap: shown, but not a failure.
        try { const r = JSON.parse(line); if (r.t === "result") tests.push({ ...r, ok: r.ok || r.todo, skipped: r.skipped || (r.todo && !r.ok), file: name }); } catch { /* not ours */ }
      }
      // Drop the file-level wrapper entry node adds for each file.
      const real = tests.filter((x) => !(x.nesting === 0 && x.name.endsWith(".test.mjs")));
      resolve({ name, code, ms: Date.now() - started, tests: real, stderr: err });
    });
  });
}

console.log(`${bgBlue(" MyArchitecture ")} ${bold("unit tests")} ${dim(`— ${files.length} files`)}\n`);
const results = [];
for (const name of files) {
  process.stdout.write(dim(`  running ${name} …`));
  const r = await runFile(name);
  results.push(r);
  process.stdout.write(`\r  ${r.code === 0 ? green("✔") : red("✖")} ${name.padEnd(26)} ${dim(`${r.tests.length} tests, ${msFmt(r.ms)}`)}\n`);
}

// The Rust tests: cargo prints "test name ... ok | FAILED | ignored" per test
// and no times, so each test gets an equal share of the run.
function runRust() {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("cargo", ["test", "--manifest-path", path.join("src-tauri", "Cargo.toml")], { cwd: root, env, shell: process.platform === "win32" });
    let out = "";
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { out += b; });
    child.on("error", () => resolve({ name: "rust", code: 1, ms: 0, tests: [], stderr: "cargo was not found (install Rust: https://rustup.rs)" }));
    child.on("close", (code) => {
      const ms = Date.now() - started;
      const lines = [...out.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)\s*$/gm)];
      const tests = lines.map((m) => {
        const t = { t: "result", name: m[1].replace(/^tests::/, "").replace(/::tests::/, " › ").replace(/_/g, " "), ok: m[2] !== "FAILED", skipped: m[2] === "ignored", ms: ms / Math.max(1, lines.length), file: "rust" };
        const at = t.ok ? -1 : out.indexOf(`---- ${m[1]} stdout ----`);
        if (at >= 0) t.error = out.slice(at, at + 600).split("\n").slice(1, 8).join("\n");
        return t;
      });
      resolve({ name: "rust", code, ms, tests, stderr: out });
    });
  });
}
if (wantRust) {
  process.stdout.write(dim("  running cargo test (src-tauri) …"));
  const r = await runRust();
  results.push(r);
  process.stdout.write(`\r  ${r.code === 0 ? green("✔") : red("✖")} ${"src-tauri (Rust)".padEnd(26)} ${dim(`${r.tests.length} tests, ${msFmt(r.ms)}`)}\n`);
}

// ---------------------------------------------------------------- per category
const all = results.flatMap((r) => r.tests.map((x) => ({ ...x, category: categoryOf(r.name) })));
const order = [...CATEGORIES.map((c) => c[0]), "Other"];
const byCat = new Map(order.map((c) => [c, []]));
for (const t of all) byCat.get(t.category).push(t);
const longest = Math.max(1, ...all.map((t) => t.ms));

console.log("");
for (const [cat, tests] of byCat) {
  if (!tests.length) continue;
  const ko = (CATEGORIES.find((c) => c[0] === cat) || [, ""])[1];
  const failed = tests.filter((t) => !t.ok).length;
  const total = tests.reduce((s, t) => s + t.ms, 0);
  console.log(`${failed ? bgRed(` ${cat} `) : bgGreen(` ${cat} `)} ${dim(ko)}  ${dim(`${tests.length} tests · ${msFmt(total)}`)}`);
  for (const t of [...tests].sort((a, b) => b.ms - a.ms)) {
    const mark = t.skipped ? yellow("○") : t.ok ? green("✔") : red("✖");
    const name = t.name.length > 74 ? t.name.slice(0, 73) + "…" : t.name;
    console.log(`  ${mark} ${timeColor(t.ms)(msFmt(t.ms).padStart(9))} ${bar(t.ms / longest, 12, timeColor(t.ms))} ${t.ok ? name : red(name)} ${dim(path.basename(t.file, ".test.mjs"))}`);
    if (!t.ok && t.error) for (const line of t.error.split("\n")) console.log(`      ${red(line)}`);
  }
  console.log("");
}
for (const r of results) {
  if (r.code !== 0 && !r.tests.some((t) => !t.ok)) {
    console.log(red(`✖ ${r.name} exited with code ${r.code} before reporting:`));
    console.log(dim(r.stderr.split("\n").slice(-15).join("\n")));
  }
}

// ---------------------------------------------------------------- summary
const passed = all.filter((t) => t.ok && !t.skipped).length;
const skipped = all.filter((t) => t.skipped).length;
const failedTests = all.filter((t) => !t.ok).length;
const failedFiles = results.filter((r) => r.code !== 0).length;
const totalMs = results.reduce((s, r) => s + r.ms, 0);
const catTotals = [...byCat].filter(([, ts]) => ts.length).map(([cat, ts]) => ({ cat, n: ts.length, ok: ts.filter((t) => t.ok).length, ms: ts.reduce((s, t) => s + t.ms, 0) }));
const maxCat = Math.max(1, ...catTotals.map((c) => c.ms));
console.log(bold("Summary"));
console.log(dim("  category                          tests   pass   fail      time"));
for (const c of catTotals) {
  const fail = c.n - c.ok;
  console.log(`  ${(fail ? red : cyan)(c.cat.padEnd(32))} ${String(c.n).padStart(6)} ${green(String(c.ok).padStart(6))} ${(fail ? red : dim)(String(fail).padStart(6))} ${msFmt(c.ms).padStart(9)} ${bar(c.ms / maxCat, 16, magenta)}`);
}
const ok = failedTests === 0 && failedFiles === 0;
console.log("");
console.log(`  ${ok ? bgGreen(" ALL TESTS PASSED ") : bgRed(" TESTS FAILED ")}  ${green(`${passed} passed`)}  ${failedTests ? red(`${failedTests} failed`) : dim("0 failed")}  ${skipped ? yellow(`${skipped} skipped`) : dim("0 skipped")}  ${dim("·")}  ${results.length - failedFiles}/${results.length} files  ${dim("·")}  ${msFmt(totalMs)}`);
if (jsonOut) writeFileSync(path.resolve(root, jsonOut), JSON.stringify({ files: results.map(({ stderr, ...r }) => r), passed, failed: failedTests, skipped, ms: totalMs }, null, 2));
process.exit(ok ? 0 : 1);
