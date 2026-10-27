// Minimal XLSX (Office Open XML spreadsheet) reader and writer, and the
// builtins xlsread / xlswrite / xlsfinfo / sheetnames.
//
// Cell values in JS: null | number | string | boolean | { date: serial }
// (serial = days since 1899-12-30, the 1900 date system). The writer also
// accepts JS Date objects. Writing into an existing workbook keeps the cell
// values of every sheet (formatting and formulas are not preserved; formula
// cells keep their cached values).
import {
  E, S, str, num, tensor, cell, stringArray, isText, isCell, isTensor, isString, isChar, isLogical,
  toTensor, absPath, fsExists, readFileBytes, writeFileBytes, utf8Encode, utf8Decode, isTextArg, strList, bool,
} from './util.js';
import { zipRead, zipWrite } from './archive.js';
import { parseXml, nodeText, escapeText, escapeAttr } from './xml.js';

// ---------------------------------------------------------------- cell references

export function colName(c) { let s = ''; c += 1; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; }
export function colIndex(letters) { let c = 0; for (const ch of letters.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }
/** 'B3' → { r: 2, c: 1 } (0-based). */
export function parseRef(ref) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(ref).trim());
  if (!m) throw E('io:xlsx:badRange', `Invalid cell reference '${ref}'.`);
  return { r: Number(m[2]) - 1, c: colIndex(m[1]) };
}
/** 'A1:C5' or 'B2' → { r0, c0, r1, c1 } (r1/c1 Infinity when open). */
export function parseRange(range) {
  const s = String(range).trim();
  if (s.includes(':')) {
    const [a, b] = s.split(':');
    const p = parseRef(a), q = parseRef(b);
    return { r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c), r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c) };
  }
  const p = parseRef(s);
  return { r0: p.r, c0: p.c, r1: Infinity, c1: Infinity };
}
export const isRangeText = (s) => /^\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/.test(String(s).trim());

// ---------------------------------------------------------------- reading

const elems = (n, name) => (n.children || []).filter((c) => c.type === 'element' && localName(c.name) === name);
const localName = (n) => n.slice(n.indexOf(':') + 1);
const attr = (n, name) => { for (const [k, v] of n.attrs) if (k === name || localName(k) === name) return v; return null; };
const first = (n, name) => elems(n, name)[0] || null;
function findDeep(n, name, out = []) { for (const c of n.children || []) if (c.type === 'element') { if (localName(c.name) === name) out.push(c); else findDeep(c, name, out); } return out; }

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFormat(code) {
  const s = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(s) && !/^General$/i.test(s);
}

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}

function workbookInfo(files) {
  const xml = (p) => { const f = files.get(p); return f ? parseXml(utf8Decode(f)) : null; };
  const rels = xml('_rels/.rels');
  let wbPath = 'xl/workbook.xml';
  if (rels) for (const r of findDeep(rels, 'Relationship')) if (/officeDocument$/.test(attr(r, 'Type') || '')) wbPath = resolvePath('', attr(r, 'Target'));
  const wb = xml(wbPath);
  if (!wb) throw E('io:xlsx:corrupt', 'Invalid XLSX file: workbook part not found.');
  const relPath = wbPath.replace(/[^/]*$/, (m) => '_rels/' + m + '.rels');
  const wbRels = xml(relPath);
  const relMap = new Map(); const relTypes = new Map();
  if (wbRels) for (const r of findDeep(wbRels, 'Relationship')) { relMap.set(attr(r, 'Id'), resolvePath(wbPath, attr(r, 'Target'))); relTypes.set(attr(r, 'Type') || '', resolvePath(wbPath, attr(r, 'Target'))); }
  const sheets = findDeep(wb, 'sheet').map((s, i) => ({ name: attr(s, 'name'), path: relMap.get(attr(s, 'id')) || `xl/worksheets/sheet${i + 1}.xml` }));
  const date1904 = findDeep(wb, 'workbookPr').some((n) => /^(1|true)$/.test(attr(n, 'date1904') || ''));
  const findRel = (suffix, def) => { for (const [t, p] of relTypes) if (t.endsWith(suffix)) return p; return def; };
  return { wbPath, sheets, date1904, sstPath: findRel('/sharedStrings', 'xl/sharedStrings.xml'), stylesPath: findRel('/styles', 'xl/styles.xml'), xml };
}

/** Sheet names of a workbook. */
export function xlsxSheetNames(bytes) {
  const files = new Map(zipRead(bytes).map((e) => [e.name, e.data]));
  return workbookInfo(files).sheets.map((s) => s.name);
}

/**
 * Reads a workbook. Returns { sheetNames, rows(sheet = 1) } where rows()
 * gives a dense 2-D array from A1 (trailing empty rows/columns trimmed).
 */
export function readXlsx(bytes) {
  const files = new Map(zipRead(bytes).map((e) => [e.name, e.data]));
  const info = workbookInfo(files);
  const sst = [];
  const sx = info.xml(info.sstPath);
  if (sx) for (const si of findDeep(sx, 'si')) sst.push(findDeep(si, 't').filter((t) => !isInPhonetic(si, t)).map(nodeText).join(''));
  const dateStyles = new Set();
  const st = info.xml(info.stylesPath);
  if (st) {
    const custom = new Map();
    for (const nf of findDeep(st, 'numFmt')) custom.set(Number(attr(nf, 'numFmtId')), attr(nf, 'formatCode') || '');
    const xfs = first(findDeep(st, 'cellXfs')[0] || { children: [] }, 'xf') ? elems(findDeep(st, 'cellXfs')[0], 'xf') : [];
    xfs.forEach((xf, i) => {
      const id = Number(attr(xf, 'numFmtId') || 0);
      if (BUILTIN_DATE_FMTS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)))) dateStyles.add(i);
    });
  }
  const cache = new Map();
  const sheetIndex = (sheet) => {
    if (sheet === undefined || sheet === null) return 0;
    if (typeof sheet === 'number') {
      if (!(sheet >= 1 && sheet <= info.sheets.length)) throw E('io:xlsx:badSheet', `Sheet ${sheet} does not exist; the workbook has ${info.sheets.length} sheet(s).`);
      return sheet - 1;
    }
    const i = info.sheets.findIndex((s) => s.name.toLowerCase() === String(sheet).toLowerCase());
    if (i < 0) throw E('io:xlsx:badSheet', `Sheet '${sheet}' does not exist.`);
    return i;
  };
  const rows = (sheet) => {
    const i = sheetIndex(sheet);
    if (cache.has(i)) return cache.get(i).map((r) => r.slice());
    const sxml = info.xml(info.sheets[i].path);
    if (!sxml) throw E('io:xlsx:corrupt', `Invalid XLSX file: worksheet '${info.sheets[i].name}' not found.`);
    const grid = [];
    let nextRow = 0;
    for (const row of findDeep(sxml, 'row')) {
      const r = attr(row, 'r') ? Number(attr(row, 'r')) - 1 : nextRow;
      nextRow = r + 1;
      let nextCol = 0;
      for (const c of elems(row, 'c')) {
        const ref = attr(c, 'r');
        const pos = ref ? parseRef(ref) : { r, c: nextCol };
        nextCol = pos.c + 1;
        const t = attr(c, 't') || 'n';
        const vNode = first(c, 'v');
        const v = vNode ? nodeText(vNode) : null;
        let val = null;
        if (t === 's') val = v === null ? null : sst[Number(v)] ?? '';
        else if (t === 'inlineStr') { const is = first(c, 'is'); val = is ? findDeep(is, 't').map(nodeText).join('') : ''; }
        else if (t === 'str') val = v ?? '';
        else if (t === 'b') val = v === null ? null : v.trim() === '1';
        else if (t === 'e') val = null;
        else if (t === 'd') { val = v ? { date: Date.parse(v) / 86400000 + 25569 } : null; }
        else if (v !== null && v.trim() !== '') {
          const x = Number(v);
          val = dateStyles.has(Number(attr(c, 's') || 0)) ? { date: info.date1904 ? x + 1462 : x } : x;
        }
        if (val === null) continue;
        while (grid.length <= pos.r) grid.push([]);
        grid[pos.r][pos.c] = val;
      }
    }
    const out = trimGrid(grid);
    cache.set(i, out);
    return out.map((r) => r.slice());
  };
  return { sheetNames: info.sheets.map((s) => s.name), rows };
}
function isInPhonetic(si, t) { for (const rph of findDeep(si, 'rPh')) if (findDeep(rph, 't').includes(t)) return true; return false; }

function trimGrid(grid) {
  let nr = grid.length;
  const empty = (x) => x === null || x === undefined;
  while (nr > 0 && (grid[nr - 1] || []).every(empty)) nr--;
  let nc = 0;
  for (let r = 0; r < nr; r++) { const row = grid[r] || []; for (let c = row.length - 1; c >= nc; c--) if (!empty(row[c])) { nc = c + 1; break; } }
  const out = [];
  for (let r = 0; r < nr; r++) { const row = grid[r] || []; const o = new Array(nc); for (let c = 0; c < nc; c++) o[c] = empty(row[c]) ? null : row[c]; out.push(o); }
  return out;
}

// ---------------------------------------------------------------- writing

const toSerial = (d) => d.getTime() / 86400000 + 25569; // UTC
const sheetXmlName = (s) => s.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';

function buildWorkbook(sheets /* [{name, rows}] */) {
  const sst = []; const sstIdx = new Map();
  const si = (s) => { if (!sstIdx.has(s)) { sstIdx.set(s, sst.length); sst.push(s); } return sstIdx.get(s); };
  let sstCount = 0;
  const sheetXml = (rows) => {
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    let maxC = 0; rows.forEach((r) => { maxC = Math.max(maxC, r.length); });
    if (rows.length && maxC) out.push(`<dimension ref="A1:${colName(maxC - 1)}${rows.length}"/>`);
    out.push('<sheetData>');
    rows.forEach((row, r) => {
      const cells = [];
      row.forEach((v, c) => {
        if (v === null || v === undefined) return;
        const ref = colName(c) + (r + 1);
        if (typeof v === 'number') { if (Number.isFinite(v)) cells.push(`<c r="${ref}"><v>${v}</v></c>`); else if (!Number.isNaN(v)) cells.push(`<c r="${ref}" t="e"><v>#NUM!</v></c>`); }
        else if (typeof v === 'boolean') cells.push(`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`);
        else if (typeof v === 'string') { sstCount++; cells.push(`<c r="${ref}" t="s"><v>${si(v)}</v></c>`); }
        else if (v instanceof Date || (typeof v === 'object' && 'date' in v)) {
          const x = v instanceof Date ? toSerial(v) : v.date;
          if (Number.isFinite(x)) cells.push(`<c r="${ref}" s="${Number.isInteger(x) ? 1 : 2}"><v>${x}</v></c>`);
        }
      });
      if (cells.length) out.push(`<row r="${r + 1}">${cells.join('')}</row>`);
    });
    out.push('</sheetData></worksheet>');
    return out.join('');
  };
  const entries = [];
  const sheetFiles = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8Encode(sheetXml(s.rows)) }));
  const ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '</Types>'].join('');
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MySimulationMath</Application></Properties>';
  const wb = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>',
    ...sheets.map((s, i) => `<sheet name="${escapeAttr(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`), '</sheets></workbook>'].join('');
  const n = sheets.length;
  const wbRels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`),
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`,
    '</Relationships>'].join('');
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/></numFmts>'
    + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sstCount}" uniqueCount="${sst.length}">`
    + sst.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${escapeText(s)}</t></si>`).join('') + '</sst>';
  const now = new Date();
  entries.push({ name: '[Content_Types].xml', data: utf8Encode(ct) }, { name: '_rels/.rels', data: utf8Encode(rels) },
    { name: 'docProps/app.xml', data: utf8Encode(app) }, { name: 'xl/workbook.xml', data: utf8Encode(wb) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8Encode(wbRels) }, { name: 'xl/styles.xml', data: utf8Encode(styles) },
    ...sheetFiles, { name: 'xl/sharedStrings.xml', data: utf8Encode(sstXml) });
  for (const e of entries) e.mtime = now;
  return zipWrite(entries);
}

/**
 * Writes `rows` into `sheet` (name or 1-based index) starting at `start`.
 * existingBytes: an existing workbook to merge into (its other sheets are kept), or null.
 */
export function writeXlsx(existingBytes, sheet, rows, start = 'A1') {
  const sheets = [];
  if (existingBytes && existingBytes.length) {
    const wb = readXlsx(existingBytes);
    wb.sheetNames.forEach((name, i) => sheets.push({ name, rows: wb.rows(i + 1) }));
  }
  let idx;
  if (sheet === undefined || sheet === null) idx = 0;
  else if (typeof sheet === 'number') {
    if (!(sheet >= 1)) throw E('io:xlsx:badSheet', 'Sheet index must be a positive integer.');
    idx = sheet - 1;
    while (sheets.length <= idx) sheets.push({ name: `Sheet${sheets.length + 1}`, rows: [] });
  } else {
    idx = sheets.findIndex((s) => s.name.toLowerCase() === String(sheet).toLowerCase());
    if (idx < 0) { sheets.push({ name: sheetXmlName(String(sheet)), rows: [] }); idx = sheets.length - 1; }
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', rows: [] });
  const target = sheets[idx].rows;
  const p = parseRef(String(start || 'A1').split(':')[0]);
  rows.forEach((row, r) => {
    const rr = p.r + r;
    while (target.length <= rr) target.push([]);
    const tr = target[rr];
    row.forEach((v, c) => { tr[p.c + c] = v === undefined ? null : v; });
  });
  return buildWorkbook(sheets);
}

// ---------------------------------------------------------------- builtins

/** JS cell → raw cell Value (numbers double, text char, bool logical, empty NaN). */
const rawValue = (v) => (v === null ? num(NaN) : typeof v === 'number' ? num(v) : typeof v === 'boolean' ? bool(v) : typeof v === 'string' ? str(v) : num(v.date));

function sliceRange(rows, range) {
  if (!range) {
    // used range: from the first non-empty row/column
    let r0 = rows.length, c0 = Infinity;
    rows.forEach((row, r) => row.forEach((v, c) => { if (v !== null) { r0 = Math.min(r0, r); c0 = Math.min(c0, c); } }));
    if (r0 >= rows.length) return [];
    return rows.slice(r0).map((row) => row.slice(c0));
  }
  const g = parseRange(range);
  const r1 = g.r1 === Infinity ? rows.length - 1 : g.r1;
  const nc = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c1 = g.c1 === Infinity ? nc - 1 : g.c1;
  const out = [];
  for (let r = g.r0; r <= r1; r++) { const row = rows[r] || []; const o = []; for (let c = g.c0; c <= c1; c++) o.push(row[c] ?? null); out.push(o); }
  return out;
}

function sheetArgs(args, from) {
  let sheet = null, range = null;
  const a = args[from], b = args[from + 1];
  if (a !== undefined) {
    if (isTextArg(a)) { const s = S(a); if (b === undefined && isRangeText(s)) range = s; else sheet = s; } else sheet = toTensor(a).re[0];
  }
  if (b !== undefined && isTextArg(b)) range = S(b) || null;
  return { sheet, range };
}

function xlsxBytes(ctx, file) {
  const bytes = readFileBytes(ctx, file);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw E('io:xlsx:format', `'${file}' is not an XLSX workbook (only .xlsx files are supported).`);
  return bytes;
}

/** Value (numeric matrix, cell, string, char) → rows of JS cells. */
export function valueToRows(v) {
  if (isCell(v)) {
    const [m, n] = v.dims; const rows = [];
    for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(scalarCell(v.data[i + j * m])); rows.push(r); }
    return rows;
  }
  if (isString(v)) { const [m, n] = v.dims; const rows = []; for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(v.data[i + j * m]); rows.push(r); } return rows; }
  if (isChar(v)) return [[S(v)]];
  const t = toTensor(v); const [m, n] = t.dims; const rows = [];
  for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) { const x = t.re[i + j * m]; r.push(isLogical(t) ? !!x : x); } rows.push(r); }
  return rows;
}
function scalarCell(x) {
  if (isChar(x)) return S(x);
  if (isString(x)) return x.data[0] ?? null;
  if (isTensor(x)) { if (x.re.length === 0) return null; return isLogical(x) ? !!x.re[0] : x.re[0]; }
  if (x && x.isObject && x.cls === 'datetime' && x.props && x.props.ms !== undefined) return new Date(x.props.ms);
  throw E('io:xlswrite:badCell', `Cells of class ${x.cls} cannot be written to a spreadsheet.`);
}

export const builtins = {
  xlsread(args, nargout, ctx) {
    if (!args.length) throw E('io:xlsread:nargin', 'xlsread requires a file name.');
    const file = S(args[0], 'File name');
    const { sheet, range } = sheetArgs(args, 1);
    const wb = readXlsx(xlsxBytes(ctx, file));
    const raw = sliceRange(wb.rows(sheet ?? 1), range);
    const m = raw.length, n = m ? raw[0].length : 0;
    // numeric part, trimmed of all-NaN outer rows/columns
    const isNum = (v) => typeof v === 'number' || typeof v === 'boolean' || (v && typeof v === 'object');
    const numOf = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : v && typeof v === 'object' ? v.date : NaN);
    let r0 = 0, r1 = m - 1, c0 = 0, c1 = n - 1;
    const rowHas = (r) => raw[r].some((v, c) => c >= c0 && c <= c1 && isNum(v));
    const colHas = (c) => raw.some((row, r) => r >= r0 && r <= r1 && isNum(row[c]));
    while (r0 <= r1 && !rowHas(r0)) r0++;
    while (r1 >= r0 && !rowHas(r1)) r1--;
    while (c0 <= c1 && !colHas(c0)) c0++;
    while (c1 >= c0 && !colHas(c1)) c1--;
    const nm = Math.max(0, r1 - r0 + 1), nn = Math.max(0, c1 - c0 + 1);
    const numT = tensor('double', nm && nn ? [nm, nn] : [0, 0]);
    for (let i = 0; i < nm; i++) for (let j = 0; j < nn; j++) numT.re[i + j * nm] = numOf(raw[r0 + i][c0 + j]);
    if (nargout <= 1) return numT;
    // text part, trimmed of trailing empty rows/columns
    let tm = m, tn = n;
    while (tm > 0 && !raw[tm - 1].some((v) => typeof v === 'string')) tm--;
    while (tn > 0 && !raw.some((row, r) => r < tm && typeof row[tn - 1] === 'string')) tn--;
    const txt = cell(tm && tn ? [tm, tn] : [0, 0], null);
    txt.data = new Array(tm * tn);
    for (let i = 0; i < tm; i++) for (let j = 0; j < tn; j++) txt.data[i + j * tm] = str(typeof raw[i][j] === 'string' ? raw[i][j] : '');
    const rawC = cell(m && n ? [m, n] : [0, 0], null);
    rawC.data = new Array(m * n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) rawC.data[i + j * m] = rawValue(raw[i][j]);
    return [numT, txt, rawC];
  },
  xlswrite(args, nargout, ctx) {
    if (args.length < 2) throw E('io:xlswrite:nargin', 'xlswrite requires a file name and data.');
    let file = S(args[0], 'File name');
    if (!/\.xls[xm]?$/i.test(file)) file += '.xlsx';
    const { sheet, range } = sheetArgs(args, 2);
    const p = absPath(ctx, file);
    const existing = fsExists(ctx, p) ? xlsxBytes(ctx, file) : null;
    const start = range ? range.split(':')[0] : 'A1';
    let rows = valueToRows(args[1]);
    if (range && range.includes(':')) { const g = parseRange(range); rows = rows.slice(0, g.r1 - g.r0 + 1).map((r) => r.slice(0, g.c1 - g.c0 + 1)); }
    writeFileBytes(ctx, file, writeXlsx(existing, sheet ?? 1, rows, start));
    return nargout > 0 ? [bool(true), stringArray([1, 1], [''])] : undefined;
  },
  xlsfinfo(args, nargout, ctx) {
    if (!args.length) throw E('io:xlsfinfo:nargin', 'xlsfinfo requires a file name.');
    const file = S(args[0], 'File name');
    let names;
    try { names = xlsxSheetNames(xlsxBytes(ctx, file)); } catch (e) { if (nargout <= 1) return str(''); throw e; }
    const desc = str('Microsoft Excel Spreadsheet');
    const sheets = cell([1, names.length], names.map((s) => str(s)));
    return nargout <= 1 ? desc : [desc, sheets, str('xlOpenXMLWorkbook')];
  },
  sheetnames(args, nargout, ctx) {
    if (!args.length) throw E('io:sheetnames:nargin', 'sheetnames requires a file name.');
    const names = xlsxSheetNames(xlsxBytes(ctx, S(args[0], 'File name')));
    return stringArray([names.length, 1], names);
  },
};

export const help = {
  xlsread: {
    en: 'Read a spreadsheet (.xlsx). num holds the numeric data (text cells NaN, all-NaN outer rows and columns removed), txt the text cells and raw every cell (empty cells NaN). Dates are returned as serial day numbers.',
    ko: '스프레드시트(.xlsx)를 읽습니다. num 은 숫자 데이터(텍스트 셀은 NaN, 바깥쪽의 NaN 만 있는 행·열 제거), txt 는 텍스트 셀, raw 는 모든 셀(빈 셀은 NaN)입니다. 날짜는 일련 번호로 반환합니다.',
    syntax: ['num = xlsread(filename)', 'num = xlsread(filename, sheet)', 'num = xlsread(filename, sheet, range)', '[num, txt, raw] = xlsread(___)'],
  },
  xlswrite: {
    en: 'Write a numeric matrix or cell array to a spreadsheet (.xlsx), optionally into a given sheet and starting cell/range. Other sheets of an existing workbook are kept.',
    ko: '숫자 행렬이나 셀형 배열을 스프레드시트(.xlsx)에 씁니다. 시트와 시작 셀/범위를 지정할 수 있습니다. 기존 통합 문서의 다른 시트는 유지됩니다.',
    syntax: ['xlswrite(filename, A)', 'xlswrite(filename, A, sheet)', 'xlswrite(filename, A, sheet, range)', '[status, message] = xlswrite(___)'],
  },
  xlsfinfo: {
    en: 'Check whether a file is a readable spreadsheet and list its sheets.',
    ko: '파일이 읽을 수 있는 스프레드시트인지 확인하고 시트 목록을 반환합니다.',
    syntax: ['status = xlsfinfo(filename)', '[status, sheets] = xlsfinfo(filename)', '[status, sheets, format] = xlsfinfo(filename)'],
  },
  sheetnames: {
    en: 'Names of the sheets in a spreadsheet file, as a string column.',
    ko: '스프레드시트 파일의 시트 이름을 문자열 열로 반환합니다.',
    syntax: ['sheets = sheetnames(filename)'],
  },
};

void isText; void strList;
