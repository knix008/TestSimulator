// Console layout shared by npm test (scripts/test.mjs) and the E2E suites: one aligned, coloured line per test
// (status · name · time), failure reasons indented under it, and English only — any Hangul that reaches the
// output (e.g. text read off the page) is removed. Colours when stdout is a terminal or FORCE_COLOR is set.

export const color = process.env.NO_COLOR ? false : Boolean((process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') || process.stdout.isTTY);
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const c = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'), blue: paint('34'), magenta: paint('35'), cyan: paint('36'),
  white: paint('97'), onGreen: paint('30;42'), onRed: paint('97;41'), onBlue: paint('97;44'), onCyan: paint('30;46'),
};

export const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const wide = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff);
/** Columns a string takes in a terminal (colour codes take none, CJK and emoji two). */
export const width = (s) => [...stripAnsi(s)].reduce((w, ch) => w + (wide(ch.codePointAt(0)) ? 2 : 1), 0);
export const padEnd = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
export const padStart = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + s;
/** Cuts to n columns with an ellipsis. */
export function fit(s, n) {
  if (width(s) <= n) return s;
  let out = '';
  for (const ch of s) { if (width(out + ch) > n - 1) break; out += ch; }
  return `${out}…`;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]+/g;
/** English only: Hangul runs are replaced by "…" and the line says so. */
export function english(text) {
  const s = String(text ?? '');
  if (!HANGUL.test(s)) return s;
  HANGUL.lastIndex = 0;
  return `${s.replace(HANGUL, '…')} [non-English text removed]`;
}

export const NAME_WIDTH = 74;
export const formatTime = (ms) => (!Number.isFinite(ms) ? '' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} m ${Math.round((ms % 60000) / 1000)} s`);

/** One result line: "  ✔ PASS  name ……  12 ms"; a failure gets its reason on the next line. */
export function resultLine({ status, name, ms, error, indent = 2 }) {
  const badge = status === 'pass' ? c.green('✔ PASS') : status === 'fail' ? c.red('✖ FAIL') : c.dim('○ SKIP');
  const room = NAME_WIDTH - (indent - 2);
  const label = status === 'fail' ? c.bold(fit(english(name), room)) : fit(english(name), room);
  const time = ms == null ? '' : c.dim(padStart(formatTime(ms), 9));
  let line = `${' '.repeat(indent)}${badge}  ${padEnd(label, room)} ${time}`;
  if (status === 'fail' && error) {
    for (const part of english(error).split('\n').filter(Boolean).slice(0, 6)) line += `\n${' '.repeat(indent + 8)}${c.red(`↳ ${part}`)}`;
  }
  return line;
}

/** "  E2E  ✔ 53 passed  ✖ 0 failed" in colour (the runner also parses the plain "E2E: n passed, m failed"). */
export function totalsLine(label, passed, failed) {
  const plain = `${label}: ${passed} passed, ${failed} failed`;
  if (!color) return plain;
  return `${c.bold(label)}  ${c.green(`✔ ${passed} passed`)}  ${failed ? c.red(`✖ ${failed} failed`) : c.dim('✖ 0 failed')}${c.dim(`   (${plain})`)}`;
}

/** A section heading: "━━ [2/6] Title  (id) ━━━━━━━━━━". */
/** The area of an E2E case id ("filter.presets" → "Filters"), shown as a "▶" heading above its cases. */
const GROUP_TITLES = {
  start: 'Start page', chrome: 'Window and toolbar', files: 'Files', list: 'Packet list and panes', filter: 'Filters',
  analyze: 'Analysis', stats: 'Statistics', map: 'Network map', panels: 'Panels and report', print: 'Printing',
  export: 'Print and export', capture: 'Live capture', look: 'Look and settings', help: 'Help and tutorial', time: 'Time',
  i18n: 'Languages', errors: 'Page errors', app: 'Program', popups: 'Popup windows', docs: 'Documents',
};
export const groupOf = (id) => String(id).split('.')[0];
export const groupLine = (id) => `\n  ${c.bold(c.blue(`▶ ${GROUP_TITLES[groupOf(id)] ?? groupOf(id)}`))}`;
/** Cases in groups (each area where it first appears), the order inside a group kept. */
export function grouped(cases) {
  const first = new Map();
  cases.forEach((item, i) => { if (!first.has(groupOf(item.id))) first.set(groupOf(item.id), i); });
  return cases.map((item, i) => ({ item, i })).sort((a, b) => first.get(groupOf(a.item.id)) - first.get(groupOf(b.item.id)) || a.i - b.i).map(({ item }) => item);
}

export function heading(text, tag = '') {
  const head = ` ${text}${tag ? `  ${tag}` : ''} `;
  const line = `━━${head}${'━'.repeat(Math.max(4, NAME_WIDTH + 20 - width(head)))}`;
  return c.bold(c.cyan(line));
}
