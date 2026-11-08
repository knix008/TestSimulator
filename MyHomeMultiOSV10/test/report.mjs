// One look for every test category: a coloured header, one aligned line per test
//   0012  PASS  blocks       every block kind inserts, edits and deletes          1 234 ms
// grouped by section, a section summary, and the counts written to test-results/<category>.json
// for the final summary of scripts/test.mjs. NO_COLOR turns the colours off.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plain = Boolean(process.env.NO_COLOR) || process.env.TERM === 'dumb';
const code = (n) => (text) => (plain ? String(text) : `\x1b[${n}m${text}\x1b[0m`);
export const color = {
  bold: code(1), dim: code(2), red: code(31), green: code(32), yellow: code(33), blue: code(34), magenta: code(35), cyan: code(36), gray: code(90),
  redBg: code('41;97;1'), greenBg: code('42;30;1'), yellowBg: code('43;30;1'), blueBg: code('44;97;1'), magentaBg: code('45;97;1'), cyanBg: code('46;30;1'),
};

export const NAME_WIDTH = 60;
export const SECTION_WIDTH = 14;
const clip = (text, width) => (text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width));
export const ms = (value) => (value == null ? '     -   ' : `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',').padStart(7)} ms`);

/** The header of a category. */
export function header(title, subtitle = '') {
  const line = '━'.repeat(Math.max(4, 96 - title.length - subtitle.length - 4));
  console.log(`\n${color.bold(color.cyan(`━━ ${title}`))} ${color.gray(subtitle)} ${color.cyan(line)}`);
}

/** One result line. status: pass | fail | skip. */
export function line(index, status, section, name, duration, detail = '') {
  const badge = status === 'pass' ? color.greenBg(' PASS ') : status === 'fail' ? color.redBg(' FAIL ') : color.yellowBg(' SKIP ');
  const text = status === 'fail' ? color.red(clip(name, NAME_WIDTH)) : clip(name, NAME_WIDTH);
  const time = duration != null && duration > 3000 ? color.yellow(ms(duration)) : color.gray(ms(duration));
  console.log(`  ${color.gray(String(index).padStart(4, '0'))}  ${badge}  ${color.magenta(clip(section, SECTION_WIDTH))}  ${text}  ${time}`);
  if (detail) for (const row of String(detail).split('\n').slice(0, 6)) console.log(`${' '.repeat(16)}${color.red('│')} ${color.red(row)}`);
}

/** Section and category summaries: counts on one aligned row. */
export function tally({ passed, failed, skipped = 0, duration }, label = 'total') {
  const total = passed + failed + skipped;
  const width = 30;
  const greenPart = total ? Math.round((passed / total) * width) : 0;
  const redPart = total ? Math.round((failed / total) * width) : 0;
  const bar = color.green('█'.repeat(greenPart)) + color.red('█'.repeat(redPart)) + color.gray('░'.repeat(Math.max(0, width - greenPart - redPart)));
  const state = failed ? color.redBg(' FAIL ') : color.greenBg('  OK  ');
  console.log(`  ${state}  ${color.bold(clip(label, SECTION_WIDTH + 8))} ${bar}  ${color.green(`${String(passed).padStart(4)} passed`)}  ${failed ? color.red(`${String(failed).padStart(3)} failed`) : color.gray('  0 failed')}  ${color.gray(`${String(total).padStart(4)} tests`)}  ${color.gray(ms(duration))}`);
}

/** Writes the counts of a category for the final summary. */
export function saveResult(category, result) {
  const dir = path.join(root, 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${category}.json`), JSON.stringify(result, null, 1));
}

/** A category of checks run in this process (web, desktop). */
export class Report {
  constructor(category, title, subtitle = '') {
    this.category = category;
    this.results = [];
    this.section = 'general';
    this.started = Date.now();
    header(title, subtitle);
  }

  /** Starts a section (a group of related checks). */
  group(name) {
    this.section = name;
  }

  /** TEST_GROUPS=problems,menus runs only those groups (to repeat one part quickly). */
  skipped() {
    const only = process.env.TEST_GROUPS?.split(',').map((g) => g.trim()).filter(Boolean);
    return Boolean(only?.length && !only.includes(this.section));
  }

  async check(name, fn, { attempts = 1 } = {}) {
    if (this.skipped()) return;
    const started = Date.now();
    let error = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try { await fn(); error = null; break; } catch (caught) { error = caught; if (attempt < attempts) await new Promise((r) => setTimeout(r, 500)); }
    }
    const duration = Date.now() - started;
    this.results.push({ section: this.section, name, ok: !error, duration, error: error ? String(error?.message ?? error) : null });
    line(this.results.length, error ? 'fail' : 'pass', this.section, name, duration, error ? String(error?.message ?? error).split('\n')[0] : '');
    return !error;
  }

  /** Prints the summary per section and in total; saves it; returns whether everything passed. */
  finish() {
    const sections = [...new Set(this.results.map((r) => r.section))];
    console.log(`\n  ${color.bold('Sections')}`);
    for (const section of sections) {
      const rows = this.results.filter((r) => r.section === section);
      tally({ passed: rows.filter((r) => r.ok).length, failed: rows.filter((r) => !r.ok).length, duration: rows.reduce((s, r) => s + r.duration, 0) }, section);
    }
    const passed = this.results.filter((r) => r.ok).length;
    const failed = this.results.length - passed;
    const duration = Date.now() - this.started;
    console.log('');
    tally({ passed, failed, duration }, `${this.category} total`);
    saveResult(this.category, { category: this.category, passed, failed, skipped: 0, duration, sections: sections.map((s) => ({ name: s, passed: this.results.filter((r) => r.section === s && r.ok).length, failed: this.results.filter((r) => r.section === s && !r.ok).length })), failures: this.results.filter((r) => !r.ok) });
    return failed === 0;
  }
}
