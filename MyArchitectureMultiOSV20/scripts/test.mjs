// Runs every unit test file (one `node --test` per file — running the folder
// in one go fails on this Windows setup), category by category, printing
// each test in colour the moment it finishes, with a live status line (overall
// progress, pass/fail counts, time) at the bottom. The desktop shell's own
// tests (cargo test in src-tauri) run last, as one more category. Then the
// failures again, a colour summary table aligned in columns, and a Markdown
// report (test/TestReport.md). Exits non-zero when anything fails.
//
//   npm test                    all files, then the Rust tests
//   npm test -- sim drc         only files whose name contains "sim" or "drc"
//   npm test -- rust            only the Rust tests (npm run test:rust prints cargo's own output)
//   npm test -- --quiet         per-file lines only (failing tests still shown)
//   npm test -- --json out.json also write the full result list as JSON
//   npm test -- --md out.md     write the Markdown report there instead
import { spawn } from "node:child_process";
import { readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "test", "unit");
const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : null; };
const jsonOut = take("--json");
const mdOut = take("--md") || path.join("test", "TestReport.md");
const quiet = args.includes("--quiet") ? (args.splice(args.indexOf("--quiet"), 1), true) : false;
const filters = args;

// Which category each test file belongs to (order = display and run order).
export const CATEGORIES = [
  ["Core model & geometry", "핵심 모델·기하", ["core", "walls", "rooms", "elements"]],
  ["Plan editing", "평면 편집", ["plan", "editor", "store", "docs"]],
  ["Checks & schedules", "검사·집계", ["check", "schedule"]],
  ["Views, sheets & annotation", "뷰·시트·주석", ["views"]],
  ["3D model", "3D 모델", ["view3d", "lights", "perf3d", "interior", "members", "structures"]],
  ["Furniture library", "가구 라이브러리", ["library"]],
  ["Furniture library", "가구 라이브러리", ["furniture", "library", "props"]],
  ["SketchUp modelling", "스케치업 모델링", ["mesh", "sketchup", "massing"]],
  ["CAD exchange (DXF, DWG, SVG)", "CAD 교환 (DXF, DWG, SVG)", ["dxf", "dwg", "dwgwrite", "cadextra", "dxfbin", "svgimport"]],
  ["Printing & PDF", "인쇄·PDF", ["pdf"]],
  ["BIM exchange (IFC, ifcXML)", "BIM 교환 (IFC, ifcXML)", ["ifc", "ifcxml"]],
  ["Other BIM (SH3D, gbXML)", "다른 BIM (SH3D, gbXML)", ["interop", "gbxml", "sh3d"]],
  ["3D exchange", "3D 교환", ["export3d", "models", "rhino3dm"]],
  ["Samples", "예제", ["samples"]],
  ["User interface (icons, widgets)", "사용자 인터페이스 (아이콘, 위젯)", ["autoicon", "widgets", "icons"]],
  ["Start page & tutorial", "시작 화면·튜토리얼", ["startlayout", "start", "templates", "tutorial", "welcome"]],
  ["Localization", "다국어", ["i18n"]],
  ["Desktop shell (Rust)", "데스크톱 셸 (Rust)", ["rust"]],
];
const OTHER = ["Other", "기타", []];
const baseOf = (file) => path.basename(file).replace(".test.mjs", "");
const categoryOf = (file) => CATEGORIES.find(([, , list]) => list.includes(baseOf(file))) || OTHER;

// ---------------------------------------------------------------- terminal
const tty = !!process.stdout.isTTY;
const color = process.env.NO_COLOR ? false : tty || !!process.env.FORCE_COLOR;
const C = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = C("32"), red = C("31"), yellow = C("33"), cyan = C("36"), blue = C("34"), magenta = C("35"), dim = C("2"), bold = C("1");
const bgGreen = C("42;30;1"), bgRed = C("41;37;1"), bgBlue = C("44;37;1"), bgCyan = C("46;30;1"), bgYellow = C("43;30;1"), bgMagenta = C("45;37;1");
// A colour per category, so the progress and the summary can be matched by eye.
const PALETTE = [C("38;5;39"), C("38;5;208"), C("38;5;41"), C("38;5;171"), C("38;5;220"), C("38;5;45"), C("38;5;203"), C("38;5;114"), C("38;5;141"), C("38;5;215"), C("38;5;81"), C("38;5;177"), C("38;5;149"), C("38;5;75"), C("38;5;210"), C("38;5;228"), C("38;5;250")];
const catColor = (cat) => PALETTE[Math.max(0, [...CATEGORIES, OTHER].indexOf(cat)) % PALETTE.length];
const msFmt = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} m ${((ms % 60000) / 1000).toFixed(0).padStart(2, "0")} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 1 : 0)} ms`);
const timeColor = (ms) => (ms < 50 ? green : ms < 500 ? yellow : red);
const bar = (frac, width, paint) => { const n = Math.max(0, Math.min(width, Math.round(frac * width))); return paint("█".repeat(n)) + dim("░".repeat(width - n)); };
// Display width: Hangul and other wide characters take two columns.
const wide = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);
const width = (s) => { let w = 0; for (const ch of String(s)) w += wide(ch.codePointAt(0)) ? 2 : 1; return w; };
const fit = (s, w) => { s = String(s); if (width(s) <= w) return s + " ".repeat(w - width(s)); let out = ""; for (const ch of s) { if (width(out + ch) > w - 1) break; out += ch; } return out + "…" + " ".repeat(Math.max(0, w - width(out) - 1)); };
const right = (s, w) => " ".repeat(Math.max(0, w - width(s))) + s;
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ---------------------------------------------------------------- what to run
const files = existsSync(dir)
  ? readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).filter((n) => !filters.length || filters.some((f) => n.includes(f))).sort()
  : [];
const wantRust = !filters.length || filters.some((f) => "rust".includes(f));
if (!files.length && !wantRust) {
  console.error("test: no test/unit/*.test.mjs files found");
  process.exit(1);
}
const plan = [...CATEGORIES, OTHER].map((cat) => ({ cat, files: cat[2].includes("rust") ? (wantRust ? ["rust"] : []) : files.filter((f) => categoryOf(f) === cat) })).filter((g) => g.files.length);
const totalJobs = plan.reduce((s, g) => s + g.files.length, 0);

const env = { ...process.env };
delete env.NODE_TEST_CONTEXT; // a nested `node --test` must not report to a parent runner

// One unit test file; onTest(result) fires for each test as it finishes.
function runFile(name, onTest) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ["--test", "--test-reporter=./scripts/test-reporter.mjs", path.join("test", "unit", name)], { cwd: root, env });
    const tests = [];
    let buf = "";
    let err = "";
    const take = (line) => {
      if (!line.startsWith("{")) return;
      // A failing `todo` test documents a known gap: shown, but not a failure.
      try {
        const r = JSON.parse(line);
        if (r.t !== "result" || (r.nesting === 0 && r.name.endsWith(".test.mjs"))) return; // the file-level wrapper
        const t = { ...r, ok: r.ok || r.todo, skipped: r.skipped || (r.todo && !r.ok), file: name };
        tests.push(t);
        onTest(t);
      } catch { /* not ours */ }
    };
    child.stdout.on("data", (b) => { buf += b; let i; while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } });
    child.stderr.on("data", (b) => { err += b; });
    child.on("close", (code) => { take(buf.trim()); resolve({ name, code, ms: Date.now() - started, tests, stderr: err }); });
  });
}

// The Rust tests: cargo prints "test name ... ok | FAILED | ignored" per test
// and no times, so each test gets an equal share of the run.
function runRust(onTest) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("cargo", ["test", "--manifest-path", path.join("src-tauri", "Cargo.toml")], { cwd: root, env, shell: process.platform === "win32" });
    let out = "";
    const seen = new Set();
    const scan = () => {
      for (const m of out.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)\s*$/gm)) if (!seen.has(m[1])) { seen.add(m[1]); onTest({ name: m[1].replace(/^tests::/, "").replace(/::tests::/, " › ").replace(/_/g, " "), ok: m[2] !== "FAILED", skipped: m[2] === "ignored" }); }
    };
    child.stdout.on("data", (b) => { out += b; scan(); });
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

// ---------------------------------------------------------------- run, streaming each result
// Every test is printed the moment it finishes, under its file and category;
// in a terminal one status line (spinner, current file, overall bar) stays at
// the bottom and is redrawn below the new lines.
const runStarted = Date.now();
const startedAt = new Date();
console.log(`\n${bgBlue(" MyArchitecture ")}${bgCyan(" unit tests ")} ${dim(`${files.length} files${wantRust ? " + Rust" : ""} in ${plan.length} categories · node ${process.version} · ${os.platform()} ${os.arch()}`)}\n`);
const results = [];
let jobsDone = 0, testsDone = 0, passDone = 0, failDone = 0, skipDone = 0, frame = 0;
let current = "";
let statusShown = false;
const status = () => `  ${cyan(SPIN[frame % SPIN.length])} ${bar(jobsDone / Math.max(1, totalJobs), 20, cyan)} ${bold(right(`${Math.round((100 * jobsDone) / Math.max(1, totalJobs))}%`, 4))} ${dim(`${jobsDone}/${totalJobs} files`)}  ${green(`✔ ${passDone}`)} ${failDone ? red(`✖ ${failDone}`) : dim("✖ 0")} ${skipDone ? yellow(`○ ${skipDone}`) : dim("○ 0")}  ${dim(msFmt(Date.now() - runStarted))}  ${dim(current)}`;
const clearStatus = () => { if (tty && statusShown) { process.stdout.write("\r\x1b[K"); statusShown = false; } };
const drawStatus = () => { if (!tty) return; process.stdout.write(`\r\x1b[K${status()}`); statusShown = true; };
const say = (s) => { clearStatus(); process.stdout.write(`${s}\n`); drawStatus(); };
const ticker = tty ? setInterval(() => { frame++; drawStatus(); }, 100) : null;
const tally = (p, f, s) => `${green(`✔ ${p}`)} ${f ? red(`✖ ${f}`) : dim("✖ 0")} ${s ? yellow(`○ ${s}`) : dim("○ 0")}`;

for (const [gi, g] of plan.entries()) {
  const [cat, ko] = g.cat;
  const paint = catColor(g.cat);
  const t0 = Date.now();
  say(`${paint("▌")}${bold(paint(` ${cat} `))}${dim(ko)}  ${dim(`[${gi + 1}/${plan.length}] · ${g.files.length} file${g.files.length > 1 ? "s" : ""}`)}`);
  const catRes = [];
  for (const name of g.files) {
    const label = name === "rust" ? "src-tauri (cargo test)" : name.replace(".test.mjs", "");
    current = label;
    say(`  ${paint("■")} ${bold(label)}`);
    const onTest = (t) => {
      testsDone++;
      if (t.skipped) skipDone++; else if (t.ok) passDone++; else failDone++;
      if (!quiet || !t.ok) {
        const mark = t.skipped ? yellow("○") : t.ok ? green("✔") : red("✖");
        const ms = t.ms === undefined ? "" : timeColor(t.ms)(msFmt(t.ms).padStart(9));
        say(`    ${mark} ${ms} ${t.ok ? fit(t.name, 86).trimEnd() : red(fit(t.name, 86).trimEnd())}`);
        if (!t.ok && t.error) for (const l of String(t.error).split("\n")) say(`        ${red(l)}`);
      }
    };
    const r = name === "rust" ? await runRust(onTest) : await runFile(name, onTest);
    results.push(r);
    catRes.push(r);
    jobsDone++;
    const pp = r.tests.filter((t) => t.ok && !t.skipped).length, ff = r.tests.filter((t) => !t.ok).length, ss = r.tests.filter((t) => t.skipped).length;
    say(`    ${dim("└")} ${r.code !== 0 ? red("✖") : green("✔")} ${dim(`${r.tests.length} tests`)} ${tally(pp, ff, ss)} ${dim(`· ${msFmt(r.ms)}`)}`);
    if (r.code !== 0 && !r.tests.some((t) => !t.ok)) for (const l of r.stderr.split("\n").slice(-12)) say(`        ${red(l)}`);
  }
  const tests = catRes.flatMap((r) => r.tests);
  const bad = catRes.some((r) => r.code !== 0);
  say(`  ${bad ? bgRed(" FAIL ") : bgGreen(" PASS ")} ${paint(cat)} ${dim(`— ${tests.length} tests in ${msFmt(Date.now() - t0)}`)}\n`);
}
if (ticker) clearInterval(ticker);
clearStatus();

const all = results.flatMap((r) => r.tests.map((x) => ({ ...x, cat: categoryOf(r.name === "rust" ? "rust.test.mjs" : r.name) })));
const groups = plan.map((g) => ({ cat: g.cat, tests: all.filter((t) => t.cat === g.cat), files: results.filter((r) => g.files.includes(r.name)) }));

// Failures again, together, so they are not lost in the stream.
const failuresList = all.filter((t) => !t.ok);
if (failuresList.length) {
  console.log(bgRed(" Failures ") + dim("  실패한 테스트") + "\n");
  for (const t of failuresList) {
    console.log(`  ${red("✖")} ${red(t.name)} ${dim(t.file === "rust" ? "rust" : baseOf(t.file))}`);
    if (t.error) for (const l of String(t.error).split("\n")) console.log(`      ${red(l)}`);
  }
  console.log("");
}
const crashed = results.filter((r) => r.code !== 0 && !r.tests.some((t) => !t.ok));
for (const r of crashed) {
  console.log(red(`✖ ${r.name} exited with code ${r.code} before reporting:`));
  console.log(dim(r.stderr.split("\n").slice(-15).join("\n")));
}

// ---------------------------------------------------------------- summary
const passed = all.filter((t) => t.ok && !t.skipped).length;
const skipped = all.filter((t) => t.skipped).length;
const failedTests = all.filter((t) => !t.ok).length;
const failedFiles = results.filter((r) => r.code !== 0).length;
const wall = Date.now() - runStarted;
const rows = groups.map(({ cat, tests, files: fr }) => ({
  cat, files: fr.length, n: tests.length,
  pass: tests.filter((t) => t.ok && !t.skipped).length, fail: tests.filter((t) => !t.ok).length, skip: tests.filter((t) => t.skipped).length,
  ms: fr.reduce((s, r) => s + r.ms, 0), bad: fr.some((r) => r.code !== 0),
}));
const maxMs = Math.max(1, ...rows.map((r) => r.ms));
const W = { en: Math.min(30, Math.max(8, ...rows.map((r) => width(r.cat[0])))), ko: Math.min(24, Math.max(6, ...rows.map((r) => width(r.cat[1])))) };
const line = (l, m, r) => dim(`  ${l}${"─".repeat(4)}${m}${"─".repeat(W.en + 2)}${m}${"─".repeat(W.ko + 2)}${m}${"─".repeat(7)}${m}${"─".repeat(8)}${m}${"─".repeat(8)}${m}${"─".repeat(7)}${m}${"─".repeat(7)}${m}${"─".repeat(11)}${m}${"─".repeat(20)}${m}${"─".repeat(8)}${r}`);
const v = dim("│");
const cellRow = (cells) => `  ${v}${cells.join(v)}${v}`;
console.log(bgMagenta(" Summary ") + dim("  테스트 요약") + "\n");
console.log(line("┌", "┬", "┐"));
console.log(cellRow([` ${bold("#")}  `, ` ${bold(fit("Category", W.en))} `, ` ${bold(fit("분류", W.ko))} `, ` ${bold(right("Files", 5))} `, ` ${bold(right("Tests", 6))} `, ` ${bold(right("Pass", 6))} `, ` ${bold(right("Fail", 5))} `, ` ${bold(right("Skip", 5))} `, ` ${bold(right("Time", 9))} `, ` ${bold(fit("Share of time", 18))} `, ` ${bold(fit("Result", 6))} `]));
console.log(line("├", "┼", "┤"));
for (const [i, r] of rows.entries()) {
  const paint = catColor(r.cat);
  console.log(cellRow([
    ` ${dim(right(String(i + 1), 2))} `,
    ` ${r.bad ? red(fit(r.cat[0], W.en)) : paint(fit(r.cat[0], W.en))} `,
    ` ${dim(fit(r.cat[1], W.ko))} `,
    ` ${right(String(r.files), 5)} `,
    ` ${bold(right(String(r.n), 6))} `,
    ` ${green(right(String(r.pass), 6))} `,
    ` ${(r.fail ? red : dim)(right(String(r.fail), 5))} `,
    ` ${(r.skip ? yellow : dim)(right(String(r.skip), 5))} `,
    ` ${timeColor(r.ms / 20)(right(msFmt(r.ms), 9))} `,
    ` ${bar(r.ms / maxMs, 18, paint)} `,
    ` ${r.bad ? bgRed(" FAIL ") : bgGreen(" PASS ")} `,
  ]));
}
console.log(line("├", "┼", "┤"));
const ok = failedTests === 0 && failedFiles === 0;
console.log(cellRow([
  "    ", ` ${bold(fit("Total", W.en))} `, ` ${bold(fit("합계", W.ko))} `,
  ` ${bold(right(String(results.length), 5))} `, ` ${bold(right(String(all.length), 6))} `, ` ${bold(green(right(String(passed), 6)))} `,
  ` ${bold((failedTests ? red : dim)(right(String(failedTests), 5)))} `, ` ${bold((skipped ? yellow : dim)(right(String(skipped), 5)))} `,
  ` ${bold(right(msFmt(wall), 9))} `, ` ${bar(passed / Math.max(1, all.length), 18, ok ? green : red)} `, ` ${ok ? bgGreen(" PASS ") : bgRed(" FAIL ")} `,
]));
console.log(line("└", "┴", "┘"));
console.log("");
const kv = (k, val) => `  ${cyan(fit(k, 14))} ${val}`;
console.log(kv("Result", ok ? bgGreen(" ALL TESTS PASSED ") : bgRed(" TESTS FAILED ")));
console.log(kv("Tests", `${bold(String(all.length))} ${dim("=")} ${green(`${passed} passed`)} ${dim("+")} ${failedTests ? red(`${failedTests} failed`) : dim("0 failed")} ${dim("+")} ${skipped ? yellow(`${skipped} skipped`) : dim("0 skipped")}`));
console.log(kv("Files", `${results.length - failedFiles === results.length ? green(`${results.length}/${results.length}`) : red(`${results.length - failedFiles}/${results.length}`)} ${dim("passed")}`));
console.log(kv("Categories", `${rows.filter((r) => !r.bad).length}/${rows.length} ${dim("passed")}`));
console.log(kv("Time", `${msFmt(wall)}`));

// ---------------------------------------------------------------- Markdown report
const mdPath = path.resolve(root, mdOut);
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const md = [];
md.push("# MyArchitecture — Test report / 테스트 결과 보고서", "");
md.push(`- **Result / 결과**: ${ok ? "✅ ALL TESTS PASSED (모두 통과)" : "❌ TESTS FAILED (실패 있음)"}`);
md.push(`- **Run at / 실행 시각**: ${startedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`);
md.push(`- **Duration / 소요 시간**: ${msFmt(wall)}`);
md.push(`- **Tests / 테스트**: ${all.length} — ${passed} passed, ${failedTests} failed, ${skipped} skipped`);
md.push(`- **Files / 파일**: ${results.length - failedFiles}/${results.length} passed · **Categories / 분류**: ${rows.filter((r) => !r.bad).length}/${rows.length} passed`);
md.push(`- **Environment / 환경**: node ${process.version}, ${os.platform()} ${os.arch()}${filters.length ? ` · filter: \`${filters.join(" ")}\`` : ""}`, "");
md.push("## Summary / 요약", "");
md.push("| # | Category | 분류 | Files | Tests | Pass | Fail | Skip | Time | Result |");
md.push("|--:|:--|:--|--:|--:|--:|--:|--:|--:|:-:|");
for (const [i, r] of rows.entries()) md.push(`| ${i + 1} | ${esc(r.cat[0])} | ${esc(r.cat[1])} | ${r.files} | ${r.n} | ${r.pass} | ${r.fail} | ${r.skip} | ${msFmt(r.ms)} | ${r.bad ? "❌" : "✅"} |`);
md.push(`| | **Total** | **합계** | **${results.length}** | **${all.length}** | **${passed}** | **${failedTests}** | **${skipped}** | **${msFmt(wall)}** | ${ok ? "✅" : "❌"} |`, "");
const failures = all.filter((t) => !t.ok);
if (failures.length || crashed.length) {
  md.push("## Failures / 실패", "");
  for (const t of failures) { md.push(`### ❌ ${esc(t.name)}`, "", `- File / 파일: \`${t.file === "rust" ? "src-tauri (cargo test)" : `test/unit/${t.file}`}\``, ""); if (t.error) md.push("```", t.error, "```", ""); }
  for (const r of crashed) md.push(`### ❌ ${r.name} exited with code ${r.code} before reporting`, "", "```", r.stderr.split("\n").slice(-15).join("\n"), "```", "");
}
md.push("## Files / 파일별 결과", "");
md.push("| Category / 분류 | File | Tests | Pass | Fail | Skip | Time | Result |");
md.push("|:--|:--|--:|--:|--:|--:|--:|:-:|");
for (const g of groups) for (const r of g.files) md.push(`| ${esc(g.cat[0])} | \`${r.name === "rust" ? "src-tauri (cargo test)" : r.name}\` | ${r.tests.length} | ${r.tests.filter((t) => t.ok && !t.skipped).length} | ${r.tests.filter((t) => !t.ok).length} | ${r.tests.filter((t) => t.skipped).length} | ${msFmt(r.ms)} | ${r.code === 0 ? "✅" : "❌"} |`);
md.push("");
md.push("## Tests / 테스트 목록", "", "Slowest first within each category. / 분류마다 오래 걸린 순서입니다.", "");
for (const { cat, tests } of groups) {
  if (!tests.length) continue;
  md.push(`<details${tests.some((t) => !t.ok) ? " open" : ""}><summary><b>${esc(cat[0])}</b> · ${esc(cat[1])} — ${tests.length} tests, ${tests.filter((t) => !t.ok).length} failed</summary>`, "");
  md.push("| | Test | File | Time |", "|:-:|:--|:--|--:|");
  for (const t of [...tests].sort((a, b) => b.ms - a.ms)) md.push(`| ${t.skipped ? "⏭️" : t.ok ? "✅" : "❌"} | ${esc(t.name)} | ${t.file === "rust" ? "rust" : baseOf(t.file)} | ${msFmt(t.ms)} |`);
  md.push("", "</details>", "");
}
mkdirSync(path.dirname(mdPath), { recursive: true });
writeFileSync(mdPath, md.join("\n"));
console.log(kv("Report", `${path.relative(root, mdPath).replace(/\\/g, "/")}`));
console.log("");

if (jsonOut) writeFileSync(path.resolve(root, jsonOut), JSON.stringify({ files: results.map(({ stderr, ...r }) => r), passed, failed: failedTests, skipped, ms: wall }, null, 2));
process.exit(ok ? 0 : 1);
