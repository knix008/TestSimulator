// node:test reporter for npm test (scripts/test.mjs re-lays its lines out in aligned columns): one "▶ group" line
// per test file (analysis.export.test.mjs → "analysis › export"), then "✔ name (12.3ms)" / "✖ …" / "﹣ … # SKIP"
// per test, the reason of a failure on "↳" lines, and the totals as "ℹ pass N" lines. English only.
//
//   node --test --test-reporter=./test/reporter.mjs --test-concurrency=1 test/unit/*.test.mjs
import path from 'node:path';

const group = (file) => path.basename(String(file ?? 'tests')).replace(/\.test\.m?js$/, '').split(/[.-]/).filter(Boolean).join(' › ');
const reason = (error) => {
  const e = error?.cause ?? error;
  const text = String(e?.message ?? e ?? 'failed');
  return text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).slice(0, 6);
};

export default async function* reporter(source) {
  let file = null;
  const n = { pass: 0, fail: 0, skip: 0 };
  let started = 0;
  for await (const event of source) {
    if (event.type === 'test:start' && !started) started = performance.now();
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data;
    if (d.details?.type === 'suite') continue;
    if (d.file && d.file !== file) {
      file = d.file;
      yield `▶ ${group(file)}\n`;
    }
    const indent = '  '.repeat(d.nesting ?? 0);
    const ms = Number(d.details?.duration_ms ?? 0).toFixed(3);
    if (event.type === 'test:pass' && (d.skip !== undefined || d.todo !== undefined)) {
      n.skip++;
      yield `${indent}﹣ ${d.name} (${ms}ms) # SKIP\n`;
    } else if (event.type === 'test:pass') {
      n.pass++;
      yield `${indent}✔ ${d.name} (${ms}ms)\n`;
    } else {
      n.fail++;
      yield `${indent}✖ ${d.name} (${ms}ms)\n`;
      for (const line of reason(d.details?.error)) yield `${indent}  ↳ ${line}\n`;
    }
  }
  yield `ℹ tests ${n.pass + n.fail + n.skip}\nℹ pass ${n.pass}\nℹ fail ${n.fail}\nℹ skipped ${n.skip}\nℹ duration_ms ${(performance.now() - started).toFixed(1)}\n`;
}
