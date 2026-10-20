// `npm test`: every stage in order, each with what it checks and its results, then one
// summary table for the whole run. The same report is saved as test/.out/test-report.md.
//
//   1. WebAssembly build (qrcore, qrimage)
//   2. Rust unit tests: qrcore, qrimage, desktop shell
//   3. JavaScript: unit tests, the browser build (headless Edge) and the real desktop exe
//
// All stages run even when one fails, so the report is always complete; the exit code is 1
// when anything failed.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CATEGORIES, fmtMs } from "./reporter.js";
import { root } from "./support.js";

const tty = process.stdout.isTTY || process.env.FORCE_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint(32);
const red = paint(31);
const dim = paint(2);
const bold = paint(1);
const cyan = paint(36);

const outDir = path.join(root, "test", ".out");
fs.mkdirSync(outDir, { recursive: true });
const started = Date.now();
const rows = []; // { stage, label, pass, fail, skip, ms, tests: [{ group?, name, status, ms, error? }] }

function stageHeader(n, title, about) {
  console.log(`\n${bold(`━━ ${n}. ${title} ━━`)}  ${dim(about)}`);
}

// ---- 1. WebAssembly ----
stageHeader(1, "WebAssembly 빌드", "Rust 크레이트를 브라우저용으로 컴파일");
{
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join("scripts", "build-wasm.js")], { cwd: root, encoding: "utf8" });
  const ok = r.status === 0;
  const tests = [];
  for (const m of (r.stdout || "").matchAll(/(\w+)\.wasm → .*\((\d+) bytes\)/g)) {
    tests.push({ name: `${m[1]}.wasm (${(Number(m[2]) / 1024).toFixed(0)} KB)`, status: "pass", ms: 0 });
    console.log(`  ${green("✔")} ${m[1]}.wasm ${dim(`${(Number(m[2]) / 1024).toFixed(0)} KB`)}`);
  }
  if (!ok) {
    tests.push({ name: "build", status: "fail", ms: Date.now() - t0, error: (r.stderr || r.stdout || "").slice(-2000) });
    console.log(`  ${red("✘")} build failed\n${dim((r.stderr || "").slice(-2000))}`);
  }
  rows.push({ stage: "빌드", label: "WebAssembly", pass: ok ? tests.length : 0, fail: ok ? 0 : 1, skip: 0, ms: Date.now() - t0, tests });
}

// ---- 2. Rust ----
const RUST = [
  ["qrcore", "qrcore/Cargo.toml", [], "QR 인코더: 표준 용량표, 형식 정보 BCH, 모드·버전·마스크"],
  ["qrimage", "qrimage/Cargo.toml", [], "래스터 내보내기: 무손실 왕복, 투명도, JPEG 배경, GIF, ICO"],
  ["데스크톱 셸", "src-tauri/Cargo.toml", ["--lib"], "파일 이름 정리, 창 위치 복원 규칙"],
];
const human = (name) => name.replace(/^(tests|placement::tests|menu::tests)::/, "").replace(/^\w+::tests::/, "").replace(/_/g, " ");
RUST.forEach(([label, manifest, extra, about], i) => {
  stageHeader(`2.${i + 1}`, `Rust · ${label}`, about);
  const t0 = Date.now();
  const r = spawnSync("cargo", ["test", "--manifest-path", manifest, ...extra], { cwd: root, encoding: "utf8" });
  const tests = [];
  for (const m of (r.stdout || "").matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)/gm)) {
    const status = m[2] === "ok" ? "pass" : m[2] === "ignored" ? "skip" : "fail";
    tests.push({ name: human(m[1]), status, ms: 0 });
  }
  tests.sort((a, b) => a.name.localeCompare(b.name));
  for (const t of tests) console.log(`  ${t.status === "pass" ? green("✔") : red("✘")} ${t.name}`);
  const failed = r.status !== 0;
  if (failed) {
    const detail = /failures:\n([\s\S]*?)\ntest result/.exec(r.stdout || "")?.[1] || (r.stderr || "").slice(-3000);
    for (const t of tests) if (t.status === "fail") t.error = detail;
    if (!tests.some((t) => t.status === "fail")) tests.push({ name: "build", status: "fail", ms: 0, error: (r.stderr || "").slice(-3000) });
    console.log(red(detail.split("\n").map((l) => `   ${l}`).join("\n")));
  }
  const count = (s) => tests.filter((t) => t.status === s).length;
  const ms = Date.now() - t0;
  console.log(dim(`  ${count("pass")}개 통과${count("fail") ? `, ${count("fail")}개 실패` : ""} · 빌드 포함 ${fmtMs(ms)}`));
  rows.push({ stage: "Rust", label, pass: count("pass"), fail: count("fail"), skip: count("skip"), ms, tests });
});

// ---- 3. JavaScript ----
stageHeader(3, "JavaScript", "단위 테스트 → 브라우저 판(헤드리스 Edge) → 데스크톱 앱(실제 exe)");
{
  const json = path.join(outDir, "js-results.json");
  fs.rmSync(json, { force: true });
  const order = Object.keys(CATEGORIES);
  const files = fs
    .readdirSync(path.join(root, "test"))
    .filter((f) => f.endsWith(".test.js"))
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const t0 = Date.now();
  const r = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", "--test-reporter=./test/reporter.js", "--test-reporter-destination=stdout", ...files.map((f) => path.join("test", f))],
    { cwd: root, stdio: "inherit", env: { ...process.env, QRGEN_REPORT_JSON: json, ...(tty ? { FORCE_COLOR: "1" } : {}) } },
  );
  const cats = fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, "utf8")) : [];
  for (const cat of cats) {
    const count = (s) => cat.tests.filter((t) => t.status === s).length;
    rows.push({ stage: "JavaScript", label: cat.label, about: cat.about, pass: count("pass"), fail: count("fail"), skip: count("skip") + count("todo"), ms: cat.time || 0, tests: cat.tests });
  }
  if (r.status !== 0 && !rows.some((row) => row.stage === "JavaScript" && row.fail)) {
    rows.push({ stage: "JavaScript", label: "(실행 오류)", pass: 0, fail: 1, skip: 0, ms: Date.now() - t0, tests: [{ name: "node --test", status: "fail", ms: 0, error: `exit ${r.status}` }] });
  }
}

// ---- Summary ----
const total = rows.reduce((t, r) => ({ pass: t.pass + r.pass, fail: t.fail + r.fail, skip: t.skip + r.skip }), { pass: 0, fail: 0, skip: 0 });
const elapsed = Date.now() - started;
const width = (s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, w) => s + " ".repeat(Math.max(0, w - width(s)));
const num = (n, w = 6) => String(n).padStart(w);
const labelW = Math.max(...rows.map((r) => width(`${r.stage} · ${r.label}`))) + 2;

let table = `\n${bold("━━ 전체 결과 ━━")}\n`;
table += `  ${dim(pad("단계 · 분류", labelW))}${dim(" 결과 ")} ${dim(num("통과"))}${dim(num("실패"))}${dim(num("건너뜀"))}  ${dim(num("시간", 9))}\n`;
for (const r of rows) {
  table += `  ${pad(`${r.stage} · ${r.label}`, labelW)}${r.fail ? red(" 실패 ") : green(" 통과 ")} ${num(r.pass)}${num(r.fail)}${num(r.skip)}  ${num(fmtMs(r.ms), 9)}\n`;
}
table += `  ${"─".repeat(labelW + 37)}\n`;
table += `  ${bold(pad("합계", labelW))}${total.fail ? red(" 실패 ") : green(" 통과 ")} ${bold(num(total.pass))}${bold(num(total.fail))}${num(total.skip)}  ${num(fmtMs(elapsed), 9)}\n`;
console.log(table);

const screenshots = fs.readdirSync(outDir).filter((f) => f.endsWith(".png") && !f.startsWith("measure") && !f.startsWith("dbg"));

// ---- Markdown report ----
const version = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
};
const icon = (s) => ({ pass: "✅", fail: "❌", skip: "⏭️", todo: "⏭️" })[s] || s;
const md = [];
md.push("# 테스트 결과", "");
md.push(`- 실행: ${new Date(started).toLocaleString("ko-KR")} · 소요 ${fmtMs(elapsed)}`);
md.push(`- 환경: ${os.type()} ${os.release()} · Node ${process.version} · ${version("rustc", ["--version"])}`);
md.push(`- 결과: **${total.fail ? `실패 ${total.fail}개` : "모두 통과"}** (통과 ${total.pass}, 실패 ${total.fail}, 건너뜀 ${total.skip})`, "");
md.push("## 요약", "", "| 단계 | 분류 | 결과 | 통과 | 실패 | 건너뜀 | 시간 |", "| --- | --- | --- | ---: | ---: | ---: | ---: |");
for (const r of rows) md.push(`| ${r.stage} | ${r.label} | ${r.fail ? "❌" : "✅"} | ${r.pass} | ${r.fail} | ${r.skip} | ${fmtMs(r.ms)} |`);
md.push(`| **합계** | | ${total.fail ? "❌" : "✅"} | **${total.pass}** | **${total.fail}** | ${total.skip} | ${fmtMs(elapsed)} |`, "");
md.push("## 상세", "");
for (const r of rows) {
  md.push(`### ${r.stage} · ${r.label}`, "");
  if (r.about) md.push(`${r.about}`, "");
  let group = null;
  for (const t of r.tests) {
    if (t.group && t.group !== group) {
      group = t.group;
      md.push(`- **${group}**`);
    }
    md.push(`${t.group ? "  " : ""}- ${icon(t.status)} ${t.name}${t.ms ? ` _(${fmtMs(t.ms)})_` : ""}`);
    if (t.error) md.push("", "```", String(t.error).slice(0, 1500), "```", "");
  }
  md.push("");
}
if (screenshots.length) {
  md.push("## 스크린샷", "");
  for (const s of screenshots) md.push(`- [${s}](${s})`);
  md.push("");
}
const reportFile = path.join(outDir, "test-report.md");
fs.writeFileSync(reportFile, md.join("\n"));

console.log(`  ${dim("보고서")}  ${path.relative(root, reportFile)}`);
if (screenshots.length) console.log(`  ${dim("스크린샷")}  ${screenshots.map((s) => path.join("test", ".out", s)).join(", ")}`);
console.log(total.fail ? `\n${red(bold(`✘ ${total.fail}개 실패`))}` : `\n${green(bold(`✔ 모두 통과 (${total.pass}개)`))}`);
process.exit(total.fail ? 1 : 0);
