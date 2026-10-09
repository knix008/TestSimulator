// Runs every unit test file (one `node --test` per file — running the folder
// in one go fails on this Windows setup) and prints the results grouped by
// category, each test with its run time, slowest first, followed by a
// colour summary. Exits non-zero when anything fails.
//
//   npm test                    all files
//   npm test -- sim drc         only files whose name contains "sim" or "drc"
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
  ["Core model & connectivity", "핵심 모델·연결", ["core"]],
  ["Schematic & PCB editing", "회로도·PCB 편집", ["editors"]],
  ["PCB checks & routing", "PCB 검사·배선", ["drc", "autoroute", "tuning"]],
  ["Simulation", "시뮬레이션", ["sim"]],
  ["Manufacturing outputs", "제조 출력", ["fab"]],
  ["3D view", "3D 보기", ["view3d"]],
  ["Import / exchange", "가져오기·교환", ["kicad"]],
  ["Samples", "예제", ["samples"]],
  ["Tools & calculators", "도구·계산기", ["calc"]],
  ["Localization", "다국어", ["i18n", "issuetext"]],
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
if (!files.length) {
  console.error("test: no test/unit/*.test.mjs files found");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

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
        try { const r = JSON.parse(line); if (r.t === "result") tests.push({ ...r, file: name }); } catch { /* not ours */ }
      }
      // Drop the file-level wrapper entry node adds for each file.
      const real = tests.filter((x) => !(x.nesting === 0 && x.name.endsWith(".test.mjs")));
      resolve({ name, code, ms: Date.now() - started, tests: real, stderr: err });
    });
  });
}

console.log(`${bgBlue(" MyCircuit ")} ${bold("unit tests")} ${dim(`— ${files.length} files`)}\n`);
const results = [];
for (const name of files) {
  process.stdout.write(dim(`  running ${name} …`));
  const r = await runFile(name);
  results.push(r);
  process.stdout.write(`\r  ${r.code === 0 ? green("✔") : red("✖")} ${name.padEnd(26)} ${dim(`${r.tests.length} tests, ${msFmt(r.ms)}`)}\n`);
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
console.log(`  ${ok ? bgGreen(" ALL TESTS PASSED ") : bgRed(" TESTS FAILED ")}  ${green(`${passed} passed`)}  ${failedTests ? red(`${failedTests} failed`) : dim("0 failed")}  ${skipped ? yellow(`${skipped} skipped`) : dim("0 skipped")}  ${dim("·")}  ${files.length - failedFiles}/${files.length} files  ${dim("·")}  ${msFmt(totalMs)}`);
if (jsonOut) writeFileSync(path.resolve(root, jsonOut), JSON.stringify({ files: results.map(({ stderr, ...r }) => r), passed, failed: failedTests, skipped, ms: totalMs }, null, 2));
process.exit(ok ? 0 : 1);
