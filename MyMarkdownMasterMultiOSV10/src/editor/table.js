// GFM pipe tables as plain text (no CodeMirror): find the table around a line, parse it into a model,
// add / delete rows and columns, and format it with aligned columns (Typora / MarkText style; wide
// Korean / CJK characters count as two columns). The editor (commands.js) replaces the table's lines.
import { displayWidth } from './mdtext.js';

/** Cells of a table row; pipes inside `code` and escaped pipes (\|) stay in the cell. */
export function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells = [];
  let cell = '';
  let tick = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') { cell += '\\|'; i++; continue; }
    if (ch === '`') {
      let n = 1;
      while (text[i + n] === '`') n++;
      if (tick === 0) tick = n; else if (tick === n) tick = 0;
      cell += '`'.repeat(n);
      i += n - 1;
      continue;
    }
    if (ch === '|' && tick === 0) { cells.push(cell.trim()); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

export const isTableLine = (line) => /\|/.test(line) && line.trim() !== '';
export const isSeparatorLine = (line) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('-');

/** [first, last] 0-based line indices of the table containing line `index`, or null. */
export function tableRangeAt(lines, index) {
  if (!isTableLine(lines[index] ?? '')) return null;
  let a = index;
  let b = index;
  while (a > 0 && isTableLine(lines[a - 1])) a--;
  while (b < lines.length - 1 && isTableLine(lines[b + 1])) b++;
  // The header is the line just above the separator.
  for (let i = a; i < b; i++) {
    if (isSeparatorLine(lines[i + 1]) && !isSeparatorLine(lines[i])) {
      if (index < i) return null;
      return [i, b];
    }
  }
  return null;
}

const alignOf = (cell) => {
  const c = cell.trim();
  const left = c.startsWith(':');
  const right = c.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none';
};

/** { indent, aligns: ['none'|'left'|'center'|'right'], rows: [[cell]] } (rows[0] is the header). */
export function parseTable(lines) {
  const indent = /^\s*/.exec(lines[0] ?? '')[0];
  const header = splitRow(lines[0] ?? '');
  const aligns = splitRow(lines[1] ?? '').map(alignOf);
  const rows = [header, ...lines.slice(2).map(splitRow)];
  const cols = Math.max(...rows.map((row) => row.length), aligns.length, 1);
  return { indent, aligns: Array.from({ length: cols }, (_, i) => aligns[i] ?? 'none'), rows: rows.map((row) => Array.from({ length: cols }, (_, i) => row[i] ?? '')) };
}

function pad(text, width, align) {
  const gap = Math.max(0, width - displayWidth(text));
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(gap - Math.floor(gap / 2));
  return text + ' '.repeat(gap);
}

/** The model as aligned lines. */
export function formatTable(model) {
  const { indent = '', aligns, rows } = model;
  const cols = aligns.length;
  const widths = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((row) => displayWidth(row[c] ?? ''))));
  const line = (cells) => `${indent}| ${cells.join(' | ')} |`;
  const out = [line(rows[0].map((cell, c) => pad(cell, widths[c], aligns[c])))];
  out.push(line(aligns.map((align, c) => {
    const w = widths[c];
    if (align === 'center') return `:${'-'.repeat(w - 2)}:`;
    if (align === 'right') return `${'-'.repeat(w - 1)}:`;
    if (align === 'left') return `:${'-'.repeat(w - 1)}`;
    return '-'.repeat(w);
  })));
  for (const row of rows.slice(1)) out.push(line(row.map((cell, c) => pad(cell, widths[c], aligns[c]))));
  return out;
}

/** Formats table lines as text lines (parse + format). */
export const formatTableLines = (lines) => formatTable(parseTable(lines));

/** The 0-based cell index the character offset `ch` of a row line is in. */
export function cellIndexAt(line, ch) {
  let text = line;
  let col = -1;
  let tick = 0;
  const lead = /^\s*\|?/.exec(text)[0].length;
  if (ch < lead) return 0;
  col = 0;
  for (let i = lead; i < Math.min(ch, text.length); i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') tick = tick ? 0 : 1;
    else if (c === '|' && !tick) col++;
  }
  const cells = splitRow(line).length;
  return Math.max(0, Math.min(col, cells - 1));
}

/** Character offset of the start of cell `col`'s content in a formatted row line. */
export function cellStart(line, col) {
  let i = /^\s*/.exec(line)[0].length;
  if (line[i] === "|") i++;
  if (col <= 0) return i + (line[i] === " " ? 1 : 0);
  let count = 0;
  let tick = 0;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") { i++; continue; }
    if (c === "`") tick = tick ? 0 : 1;
    else if (c === "|" && !tick) {
      count++;
      if (count === col) return i + 1 + (line[i + 1] === " " ? 1 : 0);
    }
  }
  return line.length;
}

/** Row index in the model of a table line index (0 header, -1 separator, 1… body). */
export const modelRow = (lineIndex) => (lineIndex === 0 ? 0 : lineIndex === 1 ? -1 : lineIndex - 1);
/** Table line index of a model row. */
export const lineOfRow = (row) => (row === 0 ? 0 : row + 1);

const copy = (model) => ({ indent: model.indent, aligns: model.aligns.slice(), rows: model.rows.map((row) => row.slice()) });

/** Adds an empty body row after model row `row` (the header or separator: as the first body row). */
export function addRow(model, row) {
  const next = copy(model);
  const at = Math.max(1, row + 1);
  next.rows.splice(at, 0, next.aligns.map(() => ''));
  return { model: next, row: at };
}

/** Adds an empty column after column `col`; the header gets `title`. */
export function addColumn(model, col, title = '') {
  const next = copy(model);
  const at = col + 1;
  next.aligns.splice(at, 0, 'none');
  next.rows.forEach((cells, r) => cells.splice(at, 0, r === 0 ? title : ''));
  return { model: next, col: at };
}

/** Deletes body row `row` (the header row cannot be deleted: its cells are emptied instead). */
export function deleteRow(model, row) {
  const next = copy(model);
  if (row <= 0) { next.rows[0] = next.rows[0].map(() => ''); return { model: next, row: 0 }; }
  next.rows.splice(row, 1);
  return { model: next, row: Math.min(row, next.rows.length - 1) };
}

/** Deletes column `col`; null when it is the last one (delete the table instead). */
export function deleteColumn(model, col) {
  if (model.aligns.length <= 1) return null;
  const next = copy(model);
  next.aligns.splice(col, 1);
  next.rows.forEach((cells) => cells.splice(col, 1));
  return { model: next, col: Math.min(col, next.aligns.length - 1) };
}

/** A new empty table: `rows` body rows × `cols` columns, header cells named by `headerOf(i)`. */
export function newTable(rows, cols, headerOf = (i) => `Column ${i + 1}`) {
  const c = Math.max(1, cols | 0);
  const model = {
    indent: '',
    aligns: Array.from({ length: c }, () => 'none'),
    rows: [Array.from({ length: c }, (_, i) => headerOf(i)), ...Array.from({ length: Math.max(0, rows | 0) }, () => Array.from({ length: c }, () => ''))],
  };
  return formatTable(model);
}
