// The data behind a chart: a table of named columns and rows of cells. Cells are numbers, strings
// or null (empty). Each column has a type the chart uses: 'number', 'date' (text that reads as a
// date) or 'text'. Pure functions, no DOM: they run in the page and under Node (tests).

/** The largest of `values` (any length; Math.max(...values) overflows the call stack on big tables), or `start`. */
export function maxOf(values, start = -Infinity) {
  let m = start;
  for (const v of values) if (v > m) m = v;
  return m;
}

/** The smallest of `values` (any length), or `start`. */
export function minOf(values, start = Infinity) {
  let m = start;
  for (const v of values) if (v < m) m = v;
  return m;
}

/** A table: `{ columns: [{ name, type }], rows: any[][] }` (every row as long as the columns). */
export function createTable(names = [], rows = []) {
  const columns = names.map((name, i) => (typeof name === 'object' && name ? { name: String(name.name ?? `Column ${i + 1}`), type: name.type ?? 'text' } : { name: String(name ?? `Column ${i + 1}`), type: 'text' }));
  const width = maxOf(rows.map((r) => r.length), Math.max(columns.length, 0));
  while (columns.length < width) columns.push({ name: columnLetter(columns.length), type: 'text' });
  const table = { columns, rows: rows.map((r) => Array.from({ length: width }, (_, i) => normalizeCell(r[i]))) };
  return inferTypes(table);
}

/** A, B, …, Z, AA, AB … (spreadsheet column names). */
export function columnLetter(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

export function normalizeCell(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return text === '' ? null : text;
}

const NUMBER_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

/**
 * A number from a cell as people write it: "1,234.5", "1 234,5" (decimal comma), "12%", "$3.20", "₩1,000",
 * "(42)" (negative), "1.2k", "−5" (minus sign). `decimal` ',' reads "1.234,5" as 1234.5. null when not a number.
 */
export function parseNumber(value, { decimal = 'auto' } = {}) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim().replace(/−/g, '-').replace(/[  \s]/g, '');
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  let percent = false;
  if (text.endsWith('%')) { percent = true; text = text.slice(0, -1); }
  text = text.replace(/^[+-]?[$€£¥₩₹]|[$€£¥₩₹]$/g, (m) => (m.startsWith('-') ? '-' : m.startsWith('+') ? '' : ''));
  text = text.replace(/(원|달러|개|명|건|USD|KRW|EUR)$/i, '');
  let scale = 1;
  const suffix = /^(.*\d)([kKmMbB])$/.exec(text);
  if (suffix) { text = suffix[1]; scale = { k: 1e3, m: 1e6, b: 1e9 }[suffix[2].toLowerCase()]; }
  if (!/^[+-]?[\d.,]+([eE][+-]?\d+)?$/.test(text)) return null;
  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;
  let dec = decimal;
  if (dec === 'auto') {
    if (commas && dots) dec = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    else if (commas === 1 && !dots && !/,\d{3}$/.test(text)) dec = ',';
    else dec = '.';
  }
  if (dec === ',') text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  if (!NUMBER_RE.test(text) && !/^[+-]?\d+\.?\d*$/.test(text)) return null;
  let number = Number(text);
  if (!Number.isFinite(number)) return null;
  number *= scale;
  if (percent) number /= 100;
  return negative ? -number : number;
}

const DATE_RE = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const KO_DATE_RE = /^(\d{4})년\s*(\d{1,2})월(?:\s*(\d{1,2})일)?$/;

/** A time stamp (ms) when a cell reads as a date ("2024-03-01", "2024/3", "2024년 3월 1일"); else null. */
export function parseDate(value) {
  if (value == null || typeof value === 'number') return null;
  const text = String(value).trim();
  const m = DATE_RE.exec(text) ?? KO_DATE_RE.exec(text);
  if (!m) return null;
  const [y, mo, d = 1, h = 0, mi = 0, s = 0] = m.slice(1).map((x) => (x == null ? undefined : Number(x)));
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0);
}

/** Sets each column's type from its cells: number when most non-empty cells are numbers, date, else text. */
export function inferTypes(table, { decimal = 'auto' } = {}) {
  table.columns.forEach((column, c) => {
    let numbers = 0;
    let dates = 0;
    let filled = 0;
    for (const row of table.rows) {
      const v = row[c];
      if (v == null || v === '') continue;
      filled++;
      if (parseNumber(v, { decimal }) != null) numbers++;
      else if (parseDate(v) != null) dates++;
    }
    column.type = !filled ? (column.type === 'number' ? 'number' : 'text') : numbers / filled >= 0.8 ? 'number' : dates / filled >= 0.8 ? 'date' : 'text';
  });
  return table;
}

/** Turns number-like text in number columns into numbers (after an import). */
export function coerceNumbers(table, { decimal = 'auto' } = {}) {
  table.columns.forEach((column, c) => {
    if (column.type !== 'number') return;
    for (const row of table.rows) {
      const n = parseNumber(row[c], { decimal });
      if (n != null) row[c] = n;
    }
  });
  return table;
}

export const cloneTable = (table) => ({ columns: table.columns.map((c) => ({ ...c })), rows: table.rows.map((r) => [...r]) });

/** The cells of one column as numbers (null where a cell is not a number). */
export const numbersOf = (table, c) => table.rows.map((row) => parseNumber(row[c]));
/** The cells of one column as label text. */
export const labelsOf = (table, c) => table.rows.map((row, i) => (c == null || c < 0 ? String(i + 1) : row[c] == null ? '' : String(row[c])));

export const numberColumns = (table) => table.columns.map((c, i) => (c.type === 'number' ? i : -1)).filter((i) => i >= 0);
export const textColumns = (table) => table.columns.map((c, i) => (c.type !== 'number' ? i : -1)).filter((i) => i >= 0);

/** Drops empty rows at the end and columns with neither a name nor a value (pasted ranges, ragged CSV). */
export function trimTable(table) {
  while (table.rows.length && table.rows[table.rows.length - 1].every((v) => v == null || v === '')) table.rows.pop();
  for (let c = table.columns.length - 1; c >= 0; c--) {
    const empty = table.rows.every((r) => r[c] == null || r[c] === '');
    if (empty && /^(Column \d+|[A-Z]{1,3}|)$/.test(table.columns[c].name) && table.columns.length > 1) {
      table.columns.splice(c, 1);
      for (const r of table.rows) r.splice(c, 1);
    } else break;
  }
  return table;
}

/**
 * A table from rows of raw cells. `header`: 'yes' (the first row names the columns), 'no', or 'auto' — the first
 * row is a header when it is all text and some column below it holds numbers (or all of row 1 differs in kind).
 */
export function fromMatrix(matrix, { header = 'auto', decimal = 'auto', maxRows = Infinity } = {}) {
  const rows = matrix.filter((r) => Array.isArray(r));
  const width = maxOf(rows.map((r) => r.length), 0);
  let hasHeader = header === 'yes';
  if (header === 'auto' && rows.length > 1) {
    const first = rows[0];
    const allText = first.every((v) => v == null || v === '' || (parseNumber(v, { decimal }) == null));
    const filled = first.filter((v) => v != null && v !== '').length;
    const belowNumbers = Array.from({ length: width }, (_, c) => rows.slice(1, 30).some((r) => parseNumber(r[c], { decimal }) != null)).some(Boolean);
    const unique = new Set(first.map((v) => String(v ?? '').trim())).size === first.length;
    hasHeader = allText && filled > 0 && (belowNumbers || (unique && rows.length > 2 && rows.slice(1).some((r) => r.some((v, c) => String(v ?? '') !== String(first[c] ?? '')))));
  }
  const names = hasHeader ? rows[0].map((v, i) => (v == null || String(v).trim() === '' ? columnLetter(i) : String(v).trim())) : Array.from({ length: width }, (_, i) => columnLetter(i));
  const body = (hasHeader ? rows.slice(1) : rows).slice(0, maxRows);
  const table = createTable(uniqueNames(names), body);
  inferTypes(table, { decimal });
  coerceNumbers(table, { decimal });
  return trimTable(table);
}

/** Names made unique ("Sales", "Sales (2)"). */
export function uniqueNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const base = String(name ?? '').trim() || 'Column';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });
}

// ───────────────────────── edits (the data grid and the Data menu use these; each returns a new table)

export function setCell(table, r, c, value) {
  const t = cloneTable(table);
  while (t.rows.length <= r) t.rows.push(Array(t.columns.length).fill(null));
  const type = t.columns[c]?.type;
  const n = parseNumber(value);
  t.rows[r][c] = value === '' || value == null ? null : type === 'number' && n != null ? n : n != null && typeof value === 'string' && /^[+-]?\d+(\.\d+)?$/.test(value.trim()) ? n : normalizeCell(value);
  return inferTypes(t);
}

export function renameColumn(table, c, name) {
  const t = cloneTable(table);
  t.columns[c].name = String(name ?? '').trim() || columnLetter(c);
  return t;
}

export function insertRow(table, at = table.rows.length, values = null) {
  const t = cloneTable(table);
  t.rows.splice(at, 0, values ? t.columns.map((_, i) => normalizeCell(values[i])) : Array(t.columns.length).fill(null));
  return t;
}

export function deleteRows(table, indices) {
  const drop = new Set(indices);
  const t = cloneTable(table);
  t.rows = t.rows.filter((_, i) => !drop.has(i));
  return t;
}

export function insertColumn(table, at = table.columns.length, name = null, type = 'number') {
  const t = cloneTable(table);
  const names = new Set(t.columns.map((c) => c.name));
  let label = name ?? columnLetter(at);
  for (let n = 2; names.has(label); n++) label = `${name ?? columnLetter(at)} (${n})`;
  t.columns.splice(at, 0, { name: label, type });
  for (const row of t.rows) row.splice(at, 0, null);
  return t;
}

export function deleteColumns(table, indices) {
  const drop = new Set(indices);
  if (drop.size >= table.columns.length) return table;
  const t = cloneTable(table);
  t.columns = t.columns.filter((_, i) => !drop.has(i));
  t.rows = t.rows.map((r) => r.filter((_, i) => !drop.has(i)));
  return t;
}

export function moveColumn(table, from, to) {
  const t = cloneTable(table);
  const [col] = t.columns.splice(from, 1);
  t.columns.splice(to, 0, col);
  for (const row of t.rows) { const [v] = row.splice(from, 1); row.splice(to, 0, v); }
  return t;
}

/** Sorts rows by a column: numbers by value, dates by time, text in the language's order. */
export function sortRows(table, c, direction = 1, locale = 'ko') {
  const t = cloneTable(table);
  const type = t.columns[c]?.type;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const key = (v) => (type === 'number' ? parseNumber(v) : type === 'date' ? parseDate(v) : v);
  t.rows.sort((a, b) => {
    const x = key(a[c]);
    const y = key(b[c]);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return direction * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y)));
  });
  return t;
}

/** Rows become columns: the first column's labels name the new columns, the old names become the first column. */
export function transpose(table) {
  const label = table.columns[0];
  const names = [label?.name ?? '', ...table.rows.map((r, i) => (r[0] == null ? String(i + 1) : String(r[0])))];
  const rows = table.columns.slice(1).map((col, c) => [col.name, ...table.rows.map((r) => r[c + 1])]);
  return createTable(uniqueNames(names), rows);
}

/** Keeps rows whose cell in column `c` contains `text` (case-insensitive) — the grid's quick filter. */
export function matchingRows(table, text) {
  const needle = String(text ?? '').trim().toLowerCase();
  if (!needle) return table.rows.map((_, i) => i);
  return table.rows.map((r, i) => (r.some((v) => v != null && String(v).toLowerCase().includes(needle)) ? i : -1)).filter((i) => i >= 0);
}

/** Summary statistics of a number column (Data › Statistics). */
export function columnStats(table, c) {
  const values = numbersOf(table, c).filter((v) => v != null);
  const n = values.length;
  const filled = table.rows.filter((r) => r[c] != null && r[c] !== '').length;
  if (!n) return { count: filled, numbers: 0, empty: table.rows.length - filled, distinct: new Set(table.rows.map((r) => r[c]).filter((v) => v != null)).size };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
  return {
    count: filled, numbers: n, empty: table.rows.length - filled, distinct: new Set(values).size, sum, mean, min: sorted[0], max: sorted[n - 1],
    median: quantile(sorted, 0.5), q1: quantile(sorted, 0.25), q3: quantile(sorted, 0.75), stdev: Math.sqrt(variance),
  };
}

/** Linear-interpolated quantile of sorted numbers. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** A cell as text for the grid and the text exports. */
export function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e10) / 1e10);
  return String(value);
}
