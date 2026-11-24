// ANSI styling for the test reporter.
//
// Colour is on when the output is a terminal, off when it is piped into a file
// or a CI log. `NO_COLOR` (https://no-color.org) always wins; `FORCE_COLOR=1`
// turns it back on for the cases where the TTY check guesses wrong, such as
// piping into `less -R`.
const ESC = '[';
const forced = process.env.FORCE_COLOR;

export const colorEnabled = forced
  ? forced !== '0' && forced !== 'false'
  : !process.env.NO_COLOR && Boolean(process.stdout.isTTY);

function wrap(open, close) {
  return (text) => (colorEnabled ? `${ESC}${open}m${text}${ESC}${close}m` : String(text));
}

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),

  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  grey: wrap(90, 39),

  // Inverted chips used for the PASS / FAIL badges.
  onGreen: wrap('42;30', 49),
  onRed: wrap('41;97', 49),
  onYellow: wrap('43;30', 49),
  onBlue: wrap('44;97', 49),
};

/**
 * Printable width, ignoring escape sequences and counting CJK/emoji as two
 * columns so the aligned columns stay aligned when a suite name is Korean.
 */
export function width(text) {
  const plain = String(text).replace(/\[[0-9;]*m/g, '');
  let n = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f9ff);
    n += wide ? 2 : 1;
  }
  return n;
}

/** Pad to `target` printable columns, ignoring any escape sequences. */
export function pad(text, target) {
  return String(text) + ' '.repeat(Math.max(0, target - width(text)));
}

export function padStart(text, target) {
  return ' '.repeat(Math.max(0, target - width(text))) + String(text);
}

/** Human-readable duration: 4ms, 812ms, 1.24s. */
export function duration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** A proportional bar, used for the pass/fail ratio in the summary. */
export function bar(ratio, cells = 28) {
  const clamped = Math.min(1, Math.max(0, ratio));
  // Never show a full bar unless it really is 100% — a single failure out of
  // 200 rounds to full otherwise and the bar silently lies.
  let filled = Math.round(clamped * cells);
  if (clamped < 1 && filled === cells) filled = cells - 1;
  if (clamped > 0 && filled === 0) filled = 1;
  return { filled: '█'.repeat(filled), empty: '░'.repeat(cells - filled) };
}
