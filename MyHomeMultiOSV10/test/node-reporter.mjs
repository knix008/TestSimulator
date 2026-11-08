// node --test reporter in the common look (test/report.mjs): sections are the test files.
//   node --test --test-reporter=./test/node-reporter.mjs test/unit/*.test.js
import path from 'node:path';
import { color, line, saveResult, tally } from './report.mjs';

const section = (file) => path.basename(String(file ?? 'unit')).replace(/\.test\.(m?js)$/, '');

export default async function* reporter(source) {
  const results = [];
  const started = Date.now();
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data;
    if (data.nesting !== 0 || data.details?.type === 'suite') continue;
    // The file itself is reported as a test when it fails to load.
    if (data.file && path.resolve(String(data.name)) === path.resolve(String(data.file))) {
      if (event.type === 'test:fail') { results.push({ section: section(data.file), name: 'file loads', ok: false, duration: 0 }); line(results.length, 'fail', section(data.file), 'file loads', 0, String(data.details?.error?.cause ?? data.details?.error ?? '')); }
      continue;
    }
    const ok = event.type === 'test:pass';
    const duration = data.details?.duration_ms ?? null;
    const error = ok ? '' : String(data.details?.error?.cause?.message ?? data.details?.error?.message ?? data.details?.error ?? '').split('\n').slice(0, 4).join('\n');
    results.push({ section: section(data.file), name: data.name, ok, duration, error: ok ? null : error });
    line(results.length, ok ? 'pass' : 'fail', section(data.file), data.name, duration, error);
  }
  const sections = [...new Set(results.map((r) => r.section))];
  yield '';
  console.log(`\n  ${color.bold('Sections')}`);
  for (const name of sections) {
    const rows = results.filter((r) => r.section === name);
    tally({ passed: rows.filter((r) => r.ok).length, failed: rows.filter((r) => !r.ok).length, duration: rows.reduce((s, r) => s + (r.duration ?? 0), 0) }, name);
  }
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('');
  tally({ passed, failed, duration: Date.now() - started }, 'js total');
  saveResult('js', { category: 'js', passed, failed, skipped: 0, duration: Date.now() - started, sections: sections.map((s) => ({ name: s, passed: results.filter((r) => r.section === s && r.ok).length, failed: results.filter((r) => r.section === s && !r.ok).length })), failures: results.filter((r) => !r.ok) });
}
