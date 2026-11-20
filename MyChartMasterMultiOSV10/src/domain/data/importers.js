// Reading data files into a table (table.js): CSV / TSV / text (delimiter found by itself), JSON (records, arrays,
// column objects, Chart.js-style datasets), Excel .xlsx, OpenDocument .ods, XML records, HTML tables, Markdown
// tables, and MyChartMaster's own .mychart (which also carries the chart). Pure (no DOM), async because ZIP
// entries are inflated by DecompressionStream.
import { moveFormula, shiftFormula } from './formula.js';
import { BUILTIN_FORMATS } from './numfmt.js';
import { columnLetter, createTable, fromMatrix, inferTypes, coerceNumbers, maxOf, minOf, uniqueNames } from './table.js';
import { isZip, readZip, zipText } from './zip.js';
import { attr, childrenNamed, findAll, findFirst, localName, parseXml, textOf } from './xml.js';

/** Data formats this program reads: id → [extensions, label]. */
export const IMPORT_FORMATS = {
  mychart: [['mychart'], 'MyChartMaster'],
  csv: [['csv'], 'CSV'],
  tsv: [['tsv', 'tab'], 'TSV'],
  text: [['txt', 'dat', 'prn'], 'Text'],
  json: [['json', 'geojson'], 'JSON'],
  xlsx: [['xlsx', 'xlsm'], 'Excel'],
  ods: [['ods'], 'OpenDocument'],
  xml: [['xml'], 'XML'],
  html: [['html', 'htm'], 'HTML'],
  markdown: [['md', 'markdown'], 'Markdown'],
};
export const IMPORT_EXTENSIONS = Object.values(IMPORT_FORMATS).flatMap(([ext]) => ext);

const extensionOf = (name) => (/\.([^.\\/]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();

/** The format of a file from its name, then its first bytes. */
export function detectFormat(name, bytes) {
  const ext = extensionOf(name);
  const byExt = Object.entries(IMPORT_FORMATS).find(([, [exts]]) => exts.includes(ext))?.[0];
  if (byExt && byExt !== 'text') return byExt;
  if (bytes && isZip(bytes)) return 'xlsx';
  const head = decodeText(bytes?.subarray?.(0, 4096) ?? new Uint8Array()).trimStart();
  if (/^[[{]/.test(head)) return head.includes('"mychart"') ? 'mychart' : 'json';
  if (/^<(!doctype html|html|table)/i.test(head)) return 'html';
  if (/^<\?xml|^</.test(head)) return 'xml';
  if (/^\|.*\|\s*\n\s*\|?\s*:?-{2,}/m.test(head)) return 'markdown';
  return byExt ?? 'csv';
}

/**
 * Text from bytes: a BOM decides (UTF-8, UTF-16 LE/BE); 'auto' tries UTF-8 and falls back to EUC-KR (Korean Excel
 * CSV) and then Windows-1252 when the bytes are not valid UTF-8.
 */
export function decodeText(bytes, encoding = 'auto') {
  if (typeof bytes === 'string') return bytes;
  if (!bytes?.length) return '';
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (encoding !== 'auto') return new TextDecoder(encoding).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    for (const fallback of ['euc-kr', 'windows-1252']) {
      try { return new TextDecoder(fallback, { fatal: fallback === 'euc-kr' }).decode(bytes); } catch { /* next */ }
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ───────────────────────── delimited text

/** The delimiter a text most likely uses: the one that splits the first lines into the same number of fields. */
export function guessDelimiter(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => splitDelimited(l, d)[0]?.length ?? 1);
    const first = counts[0] ?? 1;
    if (first < 2) continue;
    const same = counts.filter((c) => c === first).length;
    const score = same * 10 + first;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  if (bestScore < 0 && lines.some((l) => /\S\s{2,}\S|\S\s\S/.test(l))) return ' ';
  return best;
}

/** Rows of fields from delimited text, quotes ("a, b", "say ""hi""") and line breaks inside quotes kept. */
export function splitDelimited(text, delimiter = ',') {
  const rows = [];
  if (delimiter === ' ') {
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      rows.push([...line.trim().matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]));
    }
    return rows;
  }
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === '') { quoted = true; wasQuoted = true; field = ''; continue; }
    if (ch === delimiter) { row.push(wasQuoted ? field : field.trim()); field = ''; wasQuoted = false; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(wasQuoted ? field : field.trim());
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(wasQuoted ? field : field.trim()); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

export function parseDelimited(text, options = {}) {
  const body = String(text).replace(/^﻿/, '');
  // "sep=;" on the first line (Excel's hint).
  const hint = /^sep=(.)\r?\n/i.exec(body);
  const delimiter = hint ? hint[1] : options.delimiter && options.delimiter !== 'auto' ? options.delimiter : guessDelimiter(body);
  const rows = splitDelimited(hint ? body.slice(hint[0].length) : body, delimiter);
  return { table: fromMatrix(rows, options), delimiter };
}

// ───────────────────────── JSON

/** A table from JSON data in the common shapes; throws 'import.jsonShape' when it holds no table. */
export function parseJsonData(value, options = {}) {
  let data = value;
  // Wrappers: { data: [...] }, { values: [...] }, { records | rows | items | results: [...] }, GeoJSON features.
  for (let depth = 0; depth < 3 && data && !Array.isArray(data) && typeof data === 'object'; depth++) {
    if (Array.isArray(data.features)) { data = data.features.map((f) => ({ ...(f.properties ?? {}) })); break; }
    if (Array.isArray(data.columns) && Array.isArray(data.rows)) {
      const names = data.columns.map((c, i) => (typeof c === 'object' && c ? c.name ?? c.label ?? c.id ?? columnLetter(i) : c));
      const rows = data.rows.map((r) => (Array.isArray(r) ? r : names.map((n) => r?.[n])));
      return finishTable(createTable(uniqueNames(names.map(String)), rows), options);
    }
    if (Array.isArray(data.labels) && Array.isArray(data.datasets)) {
      const names = ['Label', ...data.datasets.map((d, i) => d.label ?? `Series ${i + 1}`)];
      const rows = data.labels.map((label, i) => [label, ...data.datasets.map((d) => (typeof d.data?.[i] === 'object' && d.data[i] ? d.data[i].y : d.data?.[i]))]);
      return finishTable(createTable(uniqueNames(names.map(String)), rows), options);
    }
    const key = ['data', 'values', 'records', 'rows', 'items', 'results', 'table', 'series'].find((k) => data[k] != null);
    if (key) { data = data[key]; continue; }
    // { "A": [1, 2], "B": [3, 4] } — columns as arrays.
    const entries = Object.entries(data);
    if (entries.length && entries.every(([, v]) => Array.isArray(v))) {
      const length = maxOf(entries.map(([, v]) => v.length));
      return finishTable(createTable(entries.map(([k]) => k), Array.from({ length }, (_, i) => entries.map(([, v]) => v[i]))), options);
    }
    // { "Seoul": 9.7, "Busan": 3.4 } — one value per label.
    if (entries.length && entries.every(([, v]) => v == null || typeof v !== 'object')) {
      return finishTable(createTable(['Label', 'Value'], entries), options);
    }
    break;
  }
  if (!Array.isArray(data) || !data.length) throw new Error('import.jsonShape');
  if (data.every((r) => Array.isArray(r))) return fromMatrix(data, options);
  if (data.every((r) => r == null || typeof r !== 'object')) return finishTable(createTable(['Value'], data.map((v) => [v])), options);
  const names = [];
  const flat = data.map((r) => flatten(r ?? {}));
  for (const r of flat) for (const k of Object.keys(r)) if (!names.includes(k)) names.push(k);
  return finishTable(createTable(names, flat.map((r) => names.map((n) => r[n]))), options);
}

/** {"a": {"b": 1}} → {"a.b": 1}; arrays become text. */
function flatten(object, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, name, out);
    else out[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

const finishTable = (table, options) => coerceNumbers(inferTypes(table, options), options);

// ───────────────────────── spreadsheets

/** Excel (.xlsx): every sheet's cells; strings from the shared table, dates left as numbers unless a date style. */
export async function parseXlsx(bytes, { sheet = 0, ...options } = {}) {
  const files = await readZip(bytes);
  const workbook = parseXml(zipText(files, 'xl/workbook.xml') ?? '');
  const rels = parseXml(zipText(files, 'xl/_rels/workbook.xml.rels') ?? '');
  const targets = Object.fromEntries(findAll(rels, 'Relationship').map((r) => [attr(r, 'Id'), attr(r, 'Target')]));
  const sheets = findAll(workbook, 'sheet').map((s) => {
    const target = targets[attr(s, 'id')] ?? '';
    return { name: attr(s, 'name') ?? 'Sheet', path: target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}` };
  });
  if (!sheets.length) throw new Error('import.noSheets');
  const shared = findAll(parseXml(zipText(files, 'xl/sharedStrings.xml') ?? ''), 'si').map((si) => findAll(si, 't').map(textOf).join('') || textOf(si));
  const stylesXml = parseXml(zipText(files, 'xl/styles.xml') ?? '');
  const dateStyles = xlsxDateStyles(stylesXml);
  const numberCodes = xlsxNumberFormats(stylesXml);
  const formatAt = new Map();
  const index = Math.max(0, Math.min(sheets.length - 1, Number(sheet) || 0));
  const xml = parseXml(zipText(files, sheets[index].path) ?? '');
  const matrix = [];
  // Formulas by sheet position; a shared formula's other cells take the first one's text, moved.
  const formulaAt = new Map();
  const sharedMasters = new Map();
  for (const row of findAll(xml, 'row')) {
    const r = Number(attr(row, 'r') ?? matrix.length + 1) - 1;
    const cells = [];
    let next = 0;
    for (const c of childrenNamed(row, 'c')) {
      const ref = attr(c, 'r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = attr(c, 't');
      const v = findFirst(c, 'v');
      const f = findFirst(c, 'f');
      if (f) {
        const body = textOf(f).trim();
        const si = attr(f, 'si');
        if (body) { formulaAt.set(`${r},${col}`, `=${body}`); if (attr(f, 't') === 'shared' && si != null) sharedMasters.set(si, { r, c: col, text: `=${body}` }); }
        else if (si != null && sharedMasters.has(si)) { const m = sharedMasters.get(si); formulaAt.set(`${r},${col}`, shiftFormula(m.text, r - m.r, col - m.c)); }
      }
      // The cell's number format (not dates: those are read as date text).
      const styleId = Number(attr(c, 's') ?? -1);
      if (numberCodes.has(styleId) && !dateStyles.has(styleId)) formatAt.set(`${r},${col}`, numberCodes.get(styleId));
      let value = v ? textOf(v) : null;
      if (type === 's') value = shared[Number(value)] ?? '';
      else if (type === 'inlineStr') value = findAll(c, 't').map(textOf).join('');
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') value = value ?? '';
      else if (value != null && value !== '') {
        const number = Number(value);
        value = dateStyles.has(Number(attr(c, 's') ?? -1)) ? excelDate(number) : number;
      }
      cells[col] = value;
    }
    matrix[r] = cells;
  }
  const dense = Array.from({ length: matrix.length }, (_, i) => matrix[i] ?? []);
  // Leading empty rows and columns (a table placed at C3) go.
  while (dense.length && !dense[0].some((v) => v != null && v !== '')) dense.shift();
  const left = minOf(dense.map((r) => { const i = r.findIndex((v) => v != null && v !== ''); return i < 0 ? Infinity : i; }));
  const rows = Number.isFinite(left) && left > 0 ? dense.map((r) => r.slice(left)) : dense;
  const table = fromMatrix(rows, options);
  // The formulas at their place in the data window's sheet (row 0: the column names).
  let extras = null;
  if (formulaAt.size || formatAt.size) {
    const top = matrix.length - dense.length;
    const dc = Number.isFinite(left) ? left : 0;
    let filled = rows.length;
    while (filled > 0 && !rows[filled - 1].some((x) => x != null && x !== '')) filled--;
    const headed = table.rows.length < filled;
    const formulas = {};
    for (const [key, text] of formulaAt) {
      const [r, c] = key.split(',').map(Number);
      const R = r - top + (headed ? 0 : 1);
      const C = c - dc;
      if (R >= 1 && C >= 0 && C < table.columns.length) formulas[`${R},${C}`] = moveFormula(text, (headed ? 0 : 1) - top, -dc);
    }
    const formats = {};
    for (const [key, code] of formatAt) {
      const [r, c] = key.split(',').map(Number);
      const R = r - top + (headed ? 0 : 1);
      const C = c - dc;
      if (R >= 1 && C >= 0 && C < table.columns.length) formats[`${R},${C}`] = { fmt: 'custom', code };
    }
    if (Object.keys(formulas).length || Object.keys(formats).length) extras = { formulas, formats, widths: {} };
  }
  return { table, sheets: sheets.map((s) => s.name), sheet: index, extras };
}

/** "BC12" → 54 (zero-based column). */
function columnIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Style indices (cellXfs) whose number format is a date. */
function xlsxDateStyles(styles) {
  const custom = new Map(findAll(styles, 'numFmt').map((f) => [Number(attr(f, 'numFmtId')), String(attr(f, 'formatCode') ?? '')]));
  const isDate = (id) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom.has(id) && /[ymd]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/0\.0|#/.test(custom.get(id)));
  const xfs = findFirst(styles, 'cellXfs');
  const out = new Set();
  childrenNamed(xfs ?? {}, 'xf').forEach((xf, i) => { if (isDate(Number(attr(xf, 'numFmtId') ?? 0))) out.add(i); });
  return out;
}

/** Number format codes of the cell styles that have one (not General): style index → code. */
function xlsxNumberFormats(styles) {
  const custom = new Map(findAll(styles, 'numFmt').map((f) => [Number(attr(f, 'numFmtId')), String(attr(f, 'formatCode') ?? '')]));
  const xfs = findFirst(styles, 'cellXfs');
  const out = new Map();
  childrenNamed(xfs ?? {}, 'xf').forEach((xf, i) => {
    const id = Number(attr(xf, 'numFmtId') ?? 0);
    const code = custom.get(id) ?? BUILTIN_FORMATS[id];
    if (id && code && !/^general$/i.test(code) && code !== '@') out.set(i, code);
  });
  return out;
}

/** An Excel serial date as "YYYY-MM-DD" (with the time when it has one). */
export function excelDate(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return serial;
  const iso = d.toISOString();
  return serial % 1 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

/** OpenDocument spreadsheet (.ods): the chosen sheet; repeated rows and cells expanded (capped). */
export async function parseOds(bytes, { sheet = 0, ...options } = {}) {
  const files = await readZip(bytes);
  const content = parseXml(zipText(files, 'content.xml') ?? '');
  const tables = findAll(content, 'table').filter((t) => /table/.test(t.name));
  if (!tables.length) throw new Error('import.noSheets');
  const index = Math.max(0, Math.min(tables.length - 1, Number(sheet) || 0));
  const rows = [];
  for (const row of findAll(tables[index], 'table-row')) {
    const cells = [];
    for (const cell of (row.children ?? []).filter((c) => c.name && /table-cell$/.test(localName(c.name)))) {
      const repeat = Math.min(256, Number(attr(cell, 'number-columns-repeated') ?? 1));
      const type = attr(cell, 'value-type');
      const value = type === 'float' || type === 'percentage' || type === 'currency' ? Number(attr(cell, 'value'))
        : type === 'date' ? String(attr(cell, 'date-value') ?? '').slice(0, 10)
          : findAll(cell, 'p').map(textOf).join('\n') || null;
      for (let i = 0; i < repeat; i++) cells.push(value);
    }
    while (cells.length && (cells[cells.length - 1] == null || cells[cells.length - 1] === '')) cells.pop();
    const repeat = Math.min(1000, Number(attr(row, 'number-rows-repeated') ?? 1));
    for (let i = 0; i < repeat; i++) rows.push([...cells]);
  }
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return { table: fromMatrix(rows, options), sheets: tables.map((t) => attr(t, 'name') ?? 'Sheet'), sheet: index };
}

// ───────────────────────── markup

/** The tables of an HTML page: [{ name, rows }] (caption or "Table n"). */
export function htmlTables(html) {
  const root = parseXml(html, { html: true });
  return findAll(root, 'table').map((table, i) => {
    const rows = findAll(table, 'tr').filter((tr) => {
      // Rows of nested tables belong to those.
      let owner = null;
      const find = (node, current) => { for (const c of node.children ?? []) { if (c === tr) { owner = current; return; } if (c.name) find(c, c.name === 'table' ? c : current); } };
      find(table, table);
      return owner === table;
    }).map((tr) => {
      const out = [];
      for (const cell of (tr.children ?? []).filter((c) => c.name === 'td' || c.name === 'th')) {
        const span = Math.min(50, Number(cell.attrs.colspan ?? 1) || 1);
        const text = textOf(cell);
        for (let k = 0; k < span; k++) out.push(text);
      }
      return out;
    }).filter((r) => r.length);
    const caption = findFirst(table, 'caption');
    return { name: caption ? textOf(caption) : `Table ${i + 1}`, rows };
  }).filter((t) => t.rows.length);
}

/** Markdown pipe tables: [{ name, rows }] (the heading above names each). */
export function markdownTables(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{1,6}\s+(.*)$/.exec(lines[i]);
    if (h) { heading = h[1].trim(); continue; }
    if (!/\|/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? '')) continue;
    const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|').replace(/^\*\*(.*)\*\*$/, '$1'));
    const rows = [cells(lines[i])];
    let j = i + 2;
    for (; j < lines.length && /\|/.test(lines[j]) && lines[j].trim(); j++) rows.push(cells(lines[j]));
    out.push({ name: heading || `Table ${out.length + 1}`, rows });
    i = j - 1;
  }
  return out;
}

/**
 * XML records: the element whose children repeat most (rows), each child's attributes and child elements (or
 * its text) as columns. <row><name>A</name><value>3</value></row> and <item name="A" value="3"/> both work.
 */
export function xmlRecords(text) {
  const root = parseXml(text);
  let best = null;
  const visit = (node) => {
    const kids = (node.children ?? []).filter((c) => c.name);
    const counts = new Map();
    for (const k of kids) counts.set(k.name, (counts.get(k.name) ?? 0) + 1);
    for (const [name, count] of counts) if (count >= 2 && (!best || count > best.count)) best = { node, name, count };
    kids.forEach(visit);
  };
  visit(root);
  if (!best) throw new Error('import.xmlShape');
  const records = (best.node.children ?? []).filter((c) => c.name === best.name).map((record) => {
    const out = { ...record.attrs };
    for (const child of (record.children ?? []).filter((c) => c.name)) out[localName(child.name)] = textOf(child);
    if (!Object.keys(out).length) out[localName(record.name)] = textOf(record);
    return out;
  });
  const names = [];
  for (const r of records) for (const k of Object.keys(r)) if (!names.includes(k)) names.push(k);
  return { name: best.name, rows: [names, ...records.map((r) => names.map((n) => r[n] ?? null))] };
}

// ───────────────────────── one entry point

/**
 * Reads a data file. Returns { format, table, sheets?, sheet?, delimiter?, chart? (for .mychart: the saved document) }.
 * options: { header, delimiter, encoding, decimal, sheet, maxRows }.
 */
export async function importData(bytes, name = '', options = {}) {
  const format = options.format ?? detectFormat(name, bytes);
  const opts = { header: options.header ?? 'auto', decimal: options.decimal ?? 'auto', maxRows: options.maxRows ?? Infinity };
  const text = () => decodeText(bytes, options.encoding ?? 'auto');
  switch (format) {
    case 'mychart': {
      const doc = JSON.parse(text());
      if (!doc || doc.format !== 'mychart' || !doc.data) throw new Error('import.notChart');
      return { format, document: doc, table: doc.data };
    }
    case 'json': return { format, table: parseJsonData(JSON.parse(text()), opts) };
    case 'xlsx': return { format, ...(await parseXlsx(bytes, { ...opts, sheet: options.sheet })) };
    case 'ods': return { format, ...(await parseOds(bytes, { ...opts, sheet: options.sheet })) };
    case 'html': {
      const tables = htmlTables(text());
      if (!tables.length) throw new Error('import.noTables');
      const index = Math.max(0, Math.min(tables.length - 1, Number(options.sheet) || 0));
      return { format, table: fromMatrix(tables[index].rows, opts), sheets: tables.map((t) => t.name), sheet: index };
    }
    case 'markdown': {
      const tables = markdownTables(text());
      if (!tables.length) throw new Error('import.noTables');
      const index = Math.max(0, Math.min(tables.length - 1, Number(options.sheet) || 0));
      return { format, table: fromMatrix(tables[index].rows, { ...opts, header: opts.header === 'auto' ? 'yes' : opts.header }), sheets: tables.map((t) => t.name), sheet: index };
    }
    case 'xml': {
      const records = xmlRecords(text());
      return { format, table: fromMatrix(records.rows, { ...opts, header: 'yes' }) };
    }
    case 'tsv': return { format, ...parseDelimited(text(), { ...opts, delimiter: '\t' }) };
    default: return { format: format === 'text' ? 'text' : 'csv', ...parseDelimited(text(), { ...opts, delimiter: options.delimiter ?? 'auto' }) };
  }
}

/** A table from pasted text: tab-separated (spreadsheets), else CSV / Markdown / HTML / JSON as it looks. */
export async function importPasted(text, options = {}) {
  const s = String(text ?? '').trim();
  if (!s) throw new Error('import.empty');
  if (/^[[{]/.test(s)) { try { return importData(s, 'clip.json', options); } catch { /* not JSON */ } }
  if (/<table/i.test(s)) return importData(s, 'clip.html', options);
  if (/^\|.*\|\s*\n\s*\|?\s*:?-{2,}/m.test(s)) return importData(s, 'clip.md', options);
  if (s.includes('\t')) return importData(s, 'clip.tsv', options);
  return importData(s, 'clip.csv', options);
}
