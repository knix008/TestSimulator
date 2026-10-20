// Coloured output for the GUI test scripts (smoke.mjs, gui-menus.mjs), in the
// same style as `npm test` (test/lint-report.mjs): a title banner, a live line
// per check (✓ green / ✗ red / – yellow) under section headings, then a table of
// the sections with their counts, the failures again, and a pass / fail banner.
// NO_COLOR or FORCE_COLOR=0 turns the colours off.
import { palette, useColor, pad, clip, formatTotals } from '../test/lint-report.mjs';

export function createReport(title) {
  const c = palette(useColor());
  const rows = [];          // { section, name, status: 'ok' | 'fail' | 'skip', detail }
  let section = '';
  const started = Date.now();
  console.log(`\n  ${c.bg(title)}\n`);

  const mark = (status) => (status === 'ok' ? c.green('✓') : status === 'fail' ? c.red(c.bold('✗')) : c.yellow('–'));
  return {
    c,
    rows,
    section(name) {
      section = name;
      console.log(`\n  ${c.cyan(c.bold(`▸ ${name}`))}`);
    },
    add(name, status, detail = '') {
      rows.push({ section, name, status, detail });
      const d = detail ? `  ${c.dim('—')}  ${status === 'fail' ? c.red(clip(detail, 110)) : c.dim(clip(detail, 90))}` : '';
      console.log(`    ${mark(status)} ${status === 'fail' ? c.red(name) : name}${d}`);
    },
    pass(name, detail) { this.add(name, 'ok', detail); },
    fail(name, detail) { this.add(name, 'fail', detail); },
    skip(name, detail) { this.add(name, 'skip', detail); },
    get failed() { return rows.filter((r) => r.status === 'fail').length; },
    // the summary; returns the exit code
    finish(errors = []) {
      const sections = [...new Set(rows.map((r) => r.section))];
      const w = Math.max(24, ...sections.map((s) => s.length + 2));
      const rule = c.dim(`  ${'─'.repeat(w)}  ${'─'.repeat(8)}  ${'─'.repeat(8)}  ${'─'.repeat(8)}`);
      const lines = ['', `  ${c.bg('Summary')}`, '', c.bold(`  ${pad('Section', w)}  ${pad('Passed', 8)}  ${pad('Failed', 8)}  ${pad('Skipped', 8)}`), rule];
      for (const s of sections) {
        const of = rows.filter((r) => r.section === s);
        const ok = of.filter((r) => r.status === 'ok').length, fail = of.filter((r) => r.status === 'fail').length, skip = of.filter((r) => r.status === 'skip').length;
        lines.push(`  ${fail ? c.red(pad(s, w)) : pad(s, w)}  ${c.green(pad(ok, 8))}  ${(fail ? c.red : c.dim)(pad(fail, 8))}  ${(skip ? c.yellow : c.dim)(pad(skip, 8))}`);
      }
      lines.push(rule, `  ${c.bold('Total')}    ${formatTotals(rows, c)}    ${c.dim(`${((Date.now() - started) / 1000).toFixed(0)} s`)}`);
      const skipped = rows.filter((r) => r.status === 'skip');
      const failed = rows.filter((r) => r.status === 'fail');
      if (skipped.length) {
        lines.push('', `  ${c.yellow(c.bold('Skipped'))}`);
        for (const r of skipped) lines.push(`  ${c.yellow('·')} ${c.cyan(r.section)} ${c.dim('/')} ${r.name}  ${c.dim('—')}  ${c.dim(r.detail)}`);
      }
      if (failed.length) {
        lines.push('', `  ${c.red(c.bold('Failed'))}`);
        for (const r of failed) lines.push(`  ${c.red('·')} ${c.cyan(r.section)} ${c.dim('/')} ${r.name}  ${c.dim('—')}  ${c.red(r.detail)}`);
      }
      if (errors.length) {
        lines.push('', `  ${c.red(c.bold('Page errors'))}`);
        for (const e of errors) lines.push(`  ${c.red('·')} ${c.red(clip(e, 160))}`);
      }
      const ok = rows.filter((r) => r.status === 'ok').length;
      const bad = failed.length + errors.length;
      lines.push('', bad
        ? c.red(c.bold(`  ✗  GUI tests failed  ·  ${failed.length} failed  /  ${ok} passed  /  ${skipped.length} skipped  /  ${rows.length} total${errors.length ? `  /  ${errors.length} page errors` : ''}`))
        : c.green(c.bold(`  ✓  GUI tests passed  ·  ${ok} passed  /  ${skipped.length} skipped  /  ${rows.length} total`)), '');
      console.log(lines.join('\n'));
      return bad ? 1 : 0;
    },
  };
}
