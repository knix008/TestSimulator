// Shared table for checker (and other) test results. East-Asian letters
// count as two columns so the grid stays aligned in a Korean console.
// Status is coloured when the terminal allows it (NO_COLOR / FORCE_COLOR).
export const STATUS = { ok: '통과', fail: '실패', skip: '건너뜀' };
const MARK = { ok: '✓', fail: '✗', skip: '–' };
const ANSI = /\u001b\[[0-9;]*m/g;

export function useColor(opts = {}) {
  if (opts.color === true) return true;
  if (opts.color === false) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === '0') return false;
  return true;
}

const wrap = (code) => (s) => `\u001b[${code}m${s}\u001b[0m`;
export function palette(on) {
  if (!on) {
    const id = (s) => String(s);
    return { bold: id, dim: id, red: id, green: id, yellow: id, blue: id, magenta: id, cyan: id, white: id, bg: id };
  }
  return {
    bold: wrap('1'),
    dim: wrap('2'),
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33'),
    blue: wrap('34'),
    magenta: wrap('35'),
    cyan: wrap('36'),
    white: wrap('37'),
    bg: (s) => `\u001b[44;97;1m ${s} \u001b[0m`,
  };
}

export function visible(s) { return String(s ?? '').replace(ANSI, ''); }

export function displayWidth(s) {
  let w = 0;
  for (const ch of visible(s)) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/.test(ch) ? 2 : 1;
  return w;
}

export function pad(s, n) {
  s = String(s ?? '');
  const w = displayWidth(s);
  if (w > n) return clip(s, n);
  return s + ' '.repeat(n - w);
}

export function clip(s, n) {
  s = visible(s).replace(/\s+/g, ' ').trim();
  if (displayWidth(s) <= n) return s;
  let out = '', w = 0;
  for (const ch of s) {
    const cw = displayWidth(ch);
    if (w + cw > n - 1) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
}

function paintStatus(status, c) {
  const label = `${MARK[status] || '·'} ${STATUS[status] || status}`;
  if (status === 'ok') return c.green(label);
  if (status === 'fail') return c.red(c.bold(label));
  return c.yellow(label);
}

function counts(rows) {
  let ok = 0, fail = 0, skip = 0;
  for (const r of rows) {
    if (r.status === 'fail') fail++;
    else if (r.status === 'ok') ok++;
    else skip++;
  }
  return { ok, fail, skip, total: rows.length };
}

export function formatTotals(rows, c) {
  const { ok, fail, skip, total } = counts(rows);
  return [
    c.green(`${MARK.ok} 통과 ${ok}`),
    (fail ? c.red : c.dim)(`${MARK.fail} 실패 ${fail}`),
    c.yellow(`${MARK.skip} 건너뜀 ${skip}`),
    c.dim(`전체 ${total}`),
  ].join(c.dim('    '));
}

export function formatLintReport(rows, opts = {}) {
  const c = palette(useColor(opts));
  const title = opts.title || '검사기 테스트 결과';
  const langW = 14, toolW = 16, stW = 10, detW = 52;
  const rule = c.dim(`${'─'.repeat(langW)}  ${'─'.repeat(toolW)}  ${'─'.repeat(stW)}  ${'─'.repeat(detW)}`);
  const lines = [
    '',
    `  ${c.bg(title)}`,
    '',
    c.bold(`  ${pad('언어', langW)}  ${pad('검사기', toolW)}  ${pad('결과', stW)}  설명`),
    `  ${rule}`,
  ];
  let lastLang = '';
  for (const r of rows) {
    const lang = r.language === lastLang ? '' : r.language;
    lastLang = r.language;
    const langCell = lang ? c.cyan(c.bold(pad(lang, langW))) : pad('', langW);
    const toolCell = r.status === 'fail' ? c.red(pad(r.tool, toolW)) : pad(r.tool, toolW);
    const st = paintStatus(r.status, c);
    const det = r.status === 'fail' ? c.red(clip(r.detail, detW)) : r.status === 'skip' ? c.dim(clip(r.detail, detW)) : c.dim(clip(r.detail, detW));
    lines.push(`  ${langCell}  ${toolCell}  ${pad(st, stW)}  ${det}`);
  }
  lines.push(`  ${rule}`);
  lines.push(`  ${c.bold('합계')}    ${formatTotals(rows, c)}`);
  const skipped = rows.filter((x) => x.status === 'skip');
  const failed = rows.filter((x) => x.status === 'fail');
  if (skipped.length) {
    lines.push('', `  ${c.yellow(c.bold('건너뛴 이유'))}`);
    for (const r of skipped) lines.push(`  ${c.yellow('·')} ${c.cyan(r.language)} ${c.dim('/')} ${r.tool}  ${c.dim('—')}  ${c.dim(r.detail)}`);
  }
  if (failed.length) {
    lines.push('', `  ${c.red(c.bold('실패한 항목'))}`);
    for (const r of failed) lines.push(`  ${c.red('·')} ${c.cyan(r.language)} ${c.dim('/')} ${r.tool}  ${c.dim('—')}  ${c.red(r.detail)}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatOtherTests(rows, opts = {}) {
  if (!rows.length) return '';
  const c = palette(useColor(opts));
  const lines = ['', `  ${c.bg('기타 테스트')}`, '', `  ${c.dim('─'.repeat(72))}`];
  for (const r of rows) {
    const st = paintStatus(r.status, c);
    const name = r.status === 'fail' ? c.red(r.name) : r.status === 'skip' ? c.dim(r.name) : r.name;
    const extra = r.detail && r.status !== 'ok' ? `  ${c.dim('—')}  ${r.status === 'fail' ? c.red(clip(r.detail, 70)) : c.dim(clip(r.detail, 70))}` : '';
    lines.push(`  ${pad(st, 10)}  ${name}${extra}`);
  }
  lines.push(`  ${c.dim('─'.repeat(72))}`);
  lines.push(`  ${c.bold('합계')}    ${formatTotals(rows, c)}`);
  lines.push('');
  return lines.join('\n');
}

export function formatGrandTotal(lint, other, opts = {}) {
  const c = palette(useColor(opts));
  const all = [...lint, ...other];
  if (!all.length) return '';
  const { ok, fail, skip, total } = counts(all);
  const banner = fail
    ? c.red(c.bold(`  ✗  테스트 실패  ·  ${fail}개 실패  /  ${ok} 통과  /  ${skip} 건너뜀  /  전체 ${total}`))
    : c.green(c.bold(`  ✓  테스트 통과  ·  ${ok} 통과  /  ${skip} 건너뜀  /  전체 ${total}`));
  return `\n${banner}\n`;
}
