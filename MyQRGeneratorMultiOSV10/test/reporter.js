// Reporter for `node --test` (used by test/run-all.js): results grouped by category as they
// arrive — a test with steps (t.test) becomes a heading over its steps — then a summary
// table per category and the details of every failure. With QRGEN_REPORT_JSON set, the
// same results are written there for the overall report.
import fs from "node:fs";
import path from "node:path";

const tty = process.stdout.isTTY || process.env.FORCE_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const dim = paint(2);
const bold = paint(1);
const cyan = paint(36);

/** Category shown for each test file, in run order. */
export const CATEGORIES = {
  "encoder.test.js": ["인코더", "Rust qrcore(WebAssembly) 출력 → 독립 디코더 jsQR로 판독"],
  "payload.test.js": ["내용 형식", "Wi-Fi · vCard · mailto · SMS · tel · geo 문자열과 이스케이프"],
  "render.test.js": ["렌더러", "모듈·눈 모양 경로, SVG, 로고 판독성, 스캔 경고"],
  "export.test.js": ["내보내기", "PDF·EPS → Ghostscript 렌더링 후 판독, 래스터 형식 서명"],
  "logo.test.js": ["로고 입력", "파일 선택과 끌어다 놓기가 받는 그림 형식. AVIF 포함"],
  "history.test.js": ["실행 취소", "Undo/Redo 기록과 합치기"],
  "layout.test.js": ["카드 배치", "저장된 배치 검증"],
  "web.test.js": ["브라우저 판", "헤드리스 Edge에서 실제 페이지 조작 (WebAssembly 인코더)"],
  "desktop.test.js": ["데스크톱 앱", "실제 exe를 DevTools로 조작 (네이티브 Rust)"],
};

export const fmtMs = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n || 0)} ms`);

export default async function* reporter(source) {
  const categories = new Map(); // file → { label, about, tests: [] }
  const stacks = new Map(); // file → names open per nesting level
  const withSteps = new Set(); // "file|name" of tests that had steps
  let lastFile = null;
  let lastGroup = null;

  const category = (file) => {
    const base = path.basename(file || "");
    if (!categories.has(base)) {
      const [label, about] = CATEGORIES[base] || [base, ""];
      categories.set(base, { file: base, label, about, tests: [] });
    }
    return categories.get(base);
  };
  const heading = (file, group) => {
    let out = "";
    const cat = category(file);
    if (cat.file !== lastFile) {
      out += `\n${bold(cyan(`■ ${cat.label}`))}  ${dim(cat.about)}\n`;
      lastFile = cat.file;
      lastGroup = null;
    }
    if (group && group !== lastGroup) {
      out += `  ${bold(group)}\n`;
      lastGroup = group;
    }
    return out;
  };

  for await (const event of source) {
    const d = event.data || {};
    switch (event.type) {
      case "test:start": {
        const stack = stacks.get(d.file) || [];
        stack.length = d.nesting || 0;
        stack.push(d.name);
        stacks.set(d.file, stack);
        if (d.nesting > 0) withSteps.add(`${d.file}|${stack[d.nesting - 1]}`);
        break;
      }
      case "test:pass":
      case "test:fail": {
        if (d.details?.type === "suite") break;
        const cat = category(d.file);
        const stack = stacks.get(d.file) || [];
        const ms = d.details?.duration_ms || 0;
        const failed = event.type === "test:fail";
        const status = d.skip ? "skip" : d.todo ? "todo" : failed ? "fail" : "pass";
        const parentOfSteps = d.nesting === 0 && withSteps.has(`${d.file}|${d.name}`);
        if (parentOfSteps) {
          // The heading was printed with its steps; only a failure outside the steps (setup) is new.
          const stepFailed = cat.tests.some((t) => t.group === d.name && t.status === "fail");
          if (failed && !stepFailed) {
            cat.tests.push({ group: d.name, name: "(setup)", status, ms, error: d.details?.error });
            yield `${heading(d.file, d.name)}    ${red("✘")} (setup) ${dim(`(${fmtMs(ms)})`)}\n`;
          }
          cat.time = (cat.time || 0) + ms;
          break;
        }
        const group = d.nesting > 0 ? stack.slice(0, d.nesting).join(" › ") : null;
        cat.tests.push({ group, name: d.name, status, ms, error: failed ? d.details?.error : undefined });
        if (d.nesting === 0) cat.time = (cat.time || 0) + ms;
        const mark = { pass: green("✔"), fail: red("✘"), skip: yellow("- skip"), todo: yellow("~ todo") }[status];
        const reason = d.skip && typeof d.skip === "string" ? dim(` — ${d.skip}`) : "";
        yield `${heading(d.file, group)}${group ? "    " : "  "}${mark} ${d.name}${reason} ${dim(`(${fmtMs(ms)})`)}\n`;
        break;
      }
      case "test:stdout":
      case "test:stderr":
        yield dim(d.message);
        break;
      case "test:diagnostic":
        // The runner's totals are replaced by the tables below; its errors are not.
        if (d.level === "error") yield red(`  ! ${d.message}\n`);
        break;
      default:
        break;
    }
  }

  // ---- Summary per category ----
  const ordered = [...categories.values()].sort((a, b) => Object.keys(CATEGORIES).indexOf(a.file) - Object.keys(CATEGORIES).indexOf(b.file));
  const count = (cat, s) => cat.tests.filter((t) => t.status === s).length;
  const rows = ordered.map((cat) => ({ label: cat.label, pass: count(cat, "pass"), fail: count(cat, "fail"), skip: count(cat, "skip") + count(cat, "todo"), ms: cat.time || 0 }));
  const total = rows.reduce((t, r) => ({ pass: t.pass + r.pass, fail: t.fail + r.fail, skip: t.skip + r.skip, ms: t.ms + r.ms }), { pass: 0, fail: 0, skip: 0, ms: 0 });
  const width = Math.max(14, ...rows.map((r) => r.label.length * 2)) + 2; // Hangul is double width
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
  const num = (n, w = 6) => String(n).padStart(w);
  const line = (r, style = (s) => s) => `  ${style(pad(r.label, width))}${r.fail ? red(" 실패 ") : green(" 통과 ")} ${num(r.pass)}${num(r.fail)}${num(r.skip)}  ${num(fmtMs(r.ms), 9)}\n`;
  let out = `\n${bold("JavaScript 요약")}\n`;
  out += `  ${dim(pad("분류", width))}${dim(" 결과 ")} ${dim(num("통과"))}${dim(num("실패"))}${dim(num("건너뜀"))}  ${dim(num("시간", 9))}\n`;
  for (const r of rows) out += line(r);
  out += `  ${"─".repeat(width + 37)}\n`;
  out += line({ label: "합계", ...total }, bold);

  const failures = ordered.flatMap((cat) => cat.tests.filter((t) => t.status === "fail").map((t) => ({ ...t, cat: cat.label })));
  if (failures.length) {
    out += `\n${bold(red("실패 내용"))}\n`;
    failures.forEach((f, i) => {
      out += `\n${red(`${i + 1}) ${f.cat} › ${f.group ? `${f.group} › ` : ""}${f.name}`)}\n`;
      const e = f.error?.cause || f.error;
      // A whole file failing (crash, non-zero exit) has no stack; say how it ended.
      const how = [f.error?.failureType && `failureType=${f.error.failureType}`, f.error?.exitCode != null && `exit code ${f.error.exitCode}`, f.error?.signal && `signal ${f.error.signal}`]
        .filter(Boolean)
        .join(", ");
      if (how) out += `   ${dim(how)}\n`;
      out +=`${String(e?.stack || e?.message || e).split("\n").slice(0, 12).map((l) => `   ${l}`).join("\n")}\n`;
    });
  }
  yield out;

  if (process.env.QRGEN_REPORT_JSON) {
    const data = ordered.map((cat) => ({
      ...cat,
      tests: cat.tests.map((t) => ({ ...t, error: t.error ? String(t.error.cause?.message || t.error.message || t.error) : undefined })),
    }));
    fs.writeFileSync(process.env.QRGEN_REPORT_JSON, JSON.stringify(data, null, 2));
  }
}
