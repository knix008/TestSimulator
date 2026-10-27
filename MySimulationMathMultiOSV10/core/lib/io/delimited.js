// Delimited text and spreadsheets: csvread csvwrite dlmread dlmwrite
// readmatrix writematrix readcell writecell readtable writetable readvars
// detectImportOptions importdata. Spreadsheet files (.xlsx) go through
// xlsx.js; tables are built and taken apart through the base library's
// `table` / `table2struct` at run time.
import {
  E, S, N, str, num, bool, tensor, cell, stringArray, isTextArg, isText, isCell, isString, isChar, isStruct, isTensor,
  toTensor, absPath, extName, baseName, fsExists, readFileBytes, writeFileBytes, bytesToText, encodeText, nameValues,
  strList, structScalar, cellRowOf, isLogical, optBool,
} from './util.js';
import { readXlsx, writeXlsx, parseRange, isRangeText, colName } from './xlsx.js';
import { makeValidName } from './json.js';
import { unescapeText } from './textio.js';
import { isObject, saturate } from '../../value.js';

const SHEET_EXT = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm', '.xls', '.xlsb', '.ods']);
const isSheetFile = (file, ft) => (ft ? ft === 'spreadsheet' : SHEET_EXT.has(extName(file)));

// ---------------------------------------------------------------- number text

const NUM_TEXT = /^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?|inf|infinity|nan)$/i;
/** Number from field text, or null when it is not a number. Thousands separators are not accepted. */
export function parseNumberText(s) {
  const t = s.trim();
  if (!t) return null;
  if (NUM_TEXT.test(t)) {
    const l = t.toLowerCase();
    if (l.endsWith('inf') || l.endsWith('infinity')) return l[0] === '-' ? -Infinity : Infinity;
    if (l.endsWith('nan')) return NaN;
    return parseFloat(t.replace(/[dD]/, 'e'));
  }
  return null;
}

/** printf-style text of one number for a single conversion (%g %f %e %d %i %u %x), or %.Ng with a digit count. */
export function formatNumberSpec(x, spec) {
  if (typeof spec === 'number') return gText(x, spec);
  const m = /%([-+ 0#]*)(\d*)(?:\.(\d+))?([dfFeEgGiuxXs])/.exec(spec);
  if (!m) return String(x);
  const [, flags, w, p, t] = m;
  let s;
  if (!Number.isFinite(x)) s = Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf';
  else if (t === 'f' || t === 'F') s = x.toFixed(p === undefined ? 6 : +p);
  else if (t === 'e' || t === 'E') { s = x.toExponential(p === undefined ? 6 : +p).replace(/e([+-])(\d)$/, 'e$10$2'); if (t === 'E') s = s.toUpperCase(); }
  else if (t === 'g' || t === 'G') { s = gText(x, p === undefined ? 6 : Math.max(1, +p)); if (t === 'G') s = s.toUpperCase(); }
  else if (t === 'x' || t === 'X') { s = Math.round(x).toString(16); if (t === 'X') s = s.toUpperCase(); }
  else if (Number.isInteger(x)) s = String(x);
  else s = gText(x, 15);
  if (flags.includes('+') && x >= 0) s = '+' + s;
  else if (flags.includes(' ') && x >= 0) s = ' ' + s;
  const wn = +w || 0;
  if (s.length < wn) s = flags.includes('-') ? s.padEnd(wn) : flags.includes('0') ? s.replace(/^([+ -]?)/, (q) => q + '0'.repeat(wn - s.length)) : s.padStart(wn);
  return spec.slice(0, m.index) + s + spec.slice(m.index + m[0].length);
}
/** %.Ng text. */
export function gText(x, n = 15) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  let s;
  const ex = Number(x.toExponential(n - 1).split('e')[1]);
  if (ex < -4 || ex >= n) {
    s = x.toExponential(n - 1);
    let [mant, exp] = s.split('e');
    if (mant.includes('.')) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
    const sign = exp[0] === '-' ? '-' : '+';
    exp = exp.replace(/^[+-]/, '').padStart(2, '0');
    s = `${mant}e${sign}${exp}`;
  } else {
    s = x.toFixed(Math.max(0, n - 1 - ex));
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  void e;
  return s;
}

// ---------------------------------------------------------------- text parsing

/** Splits a line into fields with quotes ("" escapes), for a delimiter list; null delimiter = whitespace. */
function splitFields(line, delims, multi) {
  const out = [];
  if (!delims) {
    // whitespace separated, quotes respected
    let i = 0;
    while (i < line.length) {
      while (i < line.length && /[ \t]/.test(line[i])) i++;
      if (i >= line.length) break;
      if (line[i] === '"') {
        let s = ''; i++;
        while (i < line.length) { if (line[i] === '"') { if (line[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; } s += line[i++]; }
        out.push({ t: s, q: true });
      } else { let s = ''; while (i < line.length && !/[ \t]/.test(line[i])) s += line[i++]; out.push({ t: s, q: false }); }
    }
    return out;
  }
  let i = 0;
  let field = '', quoted = false, started = false;
  const delimAt = (p) => { for (const d of delims) if (d && line.startsWith(d, p)) return d.length; return 0; };
  while (i <= line.length) {
    if (i === line.length) { out.push({ t: field, q: quoted }); break; }
    const ch = line[i];
    if (ch === '"' && !started) {
      quoted = true; started = true; i++;
      while (i < line.length) { if (line[i] === '"') { if (line[i + 1] === '"') { field += '"'; i += 2; continue; } i++; break; } field += line[i++]; }
      continue;
    }
    const d = delimAt(i);
    if (d) {
      out.push({ t: field, q: quoted }); field = ''; quoted = false; started = false; i += d;
      if (multi) while (delimAt(i)) i += delimAt(i);
      continue;
    }
    if (!(ch === ' ' || ch === '\t') || started) started = true;
    field += ch; i++;
  }
  return out;
}

/** Splits text into records, keeping newlines that are inside quotes. */
function splitRecords(text) {
  const lines = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQ = !inQ;
    if (!inQ && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(cur); cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Guesses the delimiter from the first lines: ',', '\t', ';', '|' or null (whitespace). */
export function detectDelimiter(lines) {
  const sample = lines.filter((l) => l.trim()).slice(0, 30);
  if (!sample.length) return null;
  let best = null, bestScore = 0;
  for (const d of [',', '\t', ';', '|']) {
    const counts = sample.map((l) => splitFields(l, [d], false).length - 1);
    const nz = counts.filter((c) => c > 0);
    if (!nz.length) continue;
    // consistency: share of lines with the most common count
    const freq = new Map(); for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);
    const [mode, f] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    const score = (f / counts.length) * (mode > 0 ? 1 : 0) + nz.length / counts.length;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function delimList(v) {
  if (v === undefined) return undefined;
  const list = isCell(v) || isString(v) ? strList(v) : [S(v)];
  return list.map((d) => {
    const t = d.toLowerCase();
    if (t === 'tab') return '\t';
    if (t === 'space') return ' ';
    if (t === 'comma') return ',';
    if (t === 'semi') return ';';
    if (t === 'bar') return '|';
    return unescapeText(d);
  });
}

// ---------------------------------------------------------------- sources

/**
 * Reads a file into rows of cells (null | number | string | boolean | {date}).
 * o: { fileType, sheet, delimiter (string[]), encoding, multi, rawText }
 */
export function loadRows(ctx, file, o = {}) {
  const p = absPath(ctx, file);
  if (!fsExists(ctx, p)) throw E('io:read:fileNotFound', `Unable to find or open '${file}'. Check the path and filename or file permissions.`);
  if (isSheetFile(p, o.fileType)) {
    const bytes = readFileBytes(ctx, p);
    const wb = readXlsx(bytes);
    return { rows: wb.rows(o.sheet ?? 1), sheet: true, delimiter: null, sheetNames: wb.sheetNames };
  }
  const text = bytesToText(readFileBytes(ctx, p), o.encoding);
  let lines = splitRecords(text);
  const delims = o.delimiter ?? (() => { const d = detectDelimiter(lines.slice(o.headerLines || 0)); return d ? [d] : null; })();
  const ws = delims && delims.every((d) => d === ' ') ? null : delims;
  const rows = [];
  const comment = o.commentStyle;
  for (let line of lines) {
    if (comment && line.trimStart().startsWith(comment)) continue;
    const fields = splitFields(line, ws, o.multi || (delims && delims.every((d) => d === ' ')));
    rows.push(fields.map(({ t, q }) => {
      if (o.rawText) return t;
      if (!q) { const v = parseNumberText(t); if (v !== null) return v; }
      const tt = q ? t : t.trim();
      return tt === '' ? null : tt;
    }));
  }
  // drop trailing empty records
  while (rows.length && rows[rows.length - 1].every((c) => c === null || c === '')) rows.pop();
  return { rows, sheet: false, delimiter: delims ? delims[0] : ' ' };
}

/** Applies a range ('A2:C5', 'B3', [r1 c1 r2 c2] 1-based) to rows. */
function applyRange(rows, range) {
  if (range === undefined) return rows;
  let r0, c0, r1, c1;
  if (isText(range)) {
    const s = S(range);
    if (/^\d+:\d+$/.test(s)) { const [a, b] = s.split(':').map(Number); r0 = a - 1; r1 = b - 1; c0 = 0; c1 = Infinity; }
    else ({ r0, c0, r1, c1 } = parseRange(s));
  } else {
    const a = Array.from(toTensor(range).re);
    if (a.length === 2) { r0 = a[0] - 1; c0 = a[1] - 1; r1 = Infinity; c1 = Infinity; } else { [r0, c0, r1, c1] = [a[0] - 1, a[1] - 1, a[2] - 1, a[3] - 1]; }
  }
  const out = [];
  for (let i = r0; i <= Math.min(r1, rows.length - 1); i++) {
    const r = rows[i] || [];
    const width = c1 === Infinity ? r.length : c1 + 1;
    const row = [];
    for (let j = c0; j < width; j++) row.push(j < r.length ? r[j] : null);
    out.push(row);
  }
  if (r1 !== Infinity && c1 !== Infinity) {
    while (out.length < r1 - r0 + 1) out.push(new Array(c1 - c0 + 1).fill(null));
  }
  return out;
}

const isNumCell = (c) => typeof c === 'number' || typeof c === 'boolean';
const rowWidth = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 0);

/** Number of leading header rows: rows before the first row with mostly numeric content. */
function guessHeaderRows(rows) {
  let k = 0;
  while (k < rows.length) {
    const r = rows[k].filter((c) => c !== null);
    if (!r.length) { k++; continue; }
    const numeric = r.filter(isNumCell).length;
    if (numeric > 0 && numeric >= r.length / 2) break;
    k++;
  }
  return k >= rows.length ? 0 : k;
}

// ---------------------------------------------------------------- numeric readers

function rowsToMatrix(rows, emptyValue, textValue, cls = 'double') {
  const m = rows.length, n = rowWidth(rows);
  const t = tensor(cls === 'double' || cls === 'single' ? cls : cls, [m, n]);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    const c = rows[i][j];
    let v;
    if (c === null || c === undefined || c === '') v = emptyValue;
    else if (typeof c === 'number') v = c;
    else if (typeof c === 'boolean') v = c ? 1 : 0;
    else if (typeof c === 'object' && c.date !== undefined) v = c.date;
    else v = textValue(c, i, j);
    t.re[i + j * m] = cls === 'double' ? v : cls === 'single' ? Math.fround(v) : saturate(cls, v);
  }
  return t;
}

function dlmreadCore(ctx, file, delim, r, c, range) {
  const o = {};
  if (delim !== undefined && delim !== null) o.delimiter = [delim];
  let { rows } = loadRows(ctx, file, o);
  if (range !== undefined) {
    if (isText(range)) {
      const s = S(range).replace('..', ':');
      const q = parseRange(s);
      rows = applyRange(rows, tensor('double', [1, 4], [q.r0 + 1, q.c0 + 1, q.r1 + 1, q.c1 + 1]));
    } else {
      const a = Array.from(toTensor(range).re);
      rows = applyRange(rows, tensor('double', [1, 4], [a[0] + 1, a[1] + 1, a[2] + 1, a[3] + 1]));
    }
  } else if (r || c) rows = applyRange(rows, tensor('double', [1, 2], [r + 1, c + 1]));
  return rowsToMatrix(rows, 0, (s) => { throw E('io:dlmread:textInData', `Mismatch between file and format: the field '${s}' is not numeric.`); });
}

function csvread(args, nargout, ctx) {
  if (!args.length) throw E('io:csvread:notEnoughInputs', 'Not enough input arguments.');
  const r = args[1] !== undefined ? N(args[1]) : 0, c = args[2] !== undefined ? N(args[2]) : 0;
  return dlmreadCore(ctx, S(args[0]), ',', r, c, args[3]);
}
function dlmread(args, nargout, ctx) {
  if (!args.length) throw E('io:dlmread:notEnoughInputs', 'Not enough input arguments.');
  let k = 1, delim;
  if (args[k] !== undefined && isTextArg(args[k]) && !isRangeText(S(args[k]).replace('..', ':'))) { delim = unescapeText(S(args[k])); k++; }
  if (delim === '') delim = undefined;
  if (args.length - k === 1) return dlmreadCore(ctx, S(args[0]), delim, 0, 0, args[k]);
  const r = args[k] !== undefined ? N(args[k]) : 0, c = args[k + 1] !== undefined ? N(args[k + 1]) : 0;
  return dlmreadCore(ctx, S(args[0]), delim, r, c, args[k + 2]);
}

const READ_OPTS = ['range', 'numheaderlines', 'delimiter', 'filetype', 'sheet', 'outputtype', 'treatasmissing', 'readvariablenames', 'variablenames', 'readrownames', 'texttype', 'variablenamingrule', 'encoding', 'commentstyle', 'consecutivedelimitersrule', 'datetimetype', 'emptyvalue', 'whitespace', 'expectednumvariables', 'selectedvariablenames', 'datalines', 'variablenamesline', 'variabletypes', 'leadingdelimitersrule', 'trailingdelimitersrule', 'emptylinerule', 'missingrule', 'importerrorrule'];

/** Parses reader arguments: (file, [importOptions], name/value...). */
function readerArgs(args, fname) {
  if (!args.length) throw E(`io:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  let k = 1, imp = null;
  if (args[k] && isStruct(args[k]) && args[k].fields.includes('VariableNames')) imp = args[k++];
  const o = nameValues(args, k);
  for (const key of Object.keys(o)) if (!READ_OPTS.includes(key)) throw E(`io:${fname}:unknownOption`, `Unknown option '${key}'.`);
  const ro = {
    fileType: o.filetype ? S(o.filetype).toLowerCase() : undefined,
    sheet: o.sheet !== undefined ? (isText(o.sheet) ? S(o.sheet) : N(o.sheet)) : undefined,
    delimiter: delimList(o.delimiter),
    encoding: o.encoding ? S(o.encoding) : undefined,
    multi: o.consecutivedelimitersrule ? S(o.consecutivedelimitersrule).toLowerCase() === 'join' : false,
    commentStyle: o.commentstyle ? S(o.commentstyle) : undefined,
    headerLines: o.numheaderlines !== undefined ? N(o.numheaderlines) : undefined,
  };
  if (ro.fileType === 'text' || ro.fileType === 'delimitedtext') ro.fileType = 'text';
  if (imp) {
    const g = (f) => (imp.fields.includes(f) ? imp.data[0][f] : undefined);
    if (g('Delimiter') && !ro.delimiter) ro.delimiter = delimList(g('Delimiter'));
    if (g('Sheet') && ro.sheet === undefined && isText(g('Sheet')) && S(g('Sheet'))) ro.sheet = S(g('Sheet'));
    if (g('FileType') && !ro.fileType) ro.fileType = S(g('FileType'));
    if (ro.fileType === 'delimitedtext') ro.fileType = 'text';
  }
  return { file, o, ro, imp };
}

function readmatrix(args, nargout, ctx) {
  const { file, o, ro, imp } = readerArgs(args, 'readmatrix');
  let { rows } = loadRows(ctx, file, ro);
  if (o.range !== undefined) rows = applyRange(rows, o.range);
  let h = ro.headerLines;
  if (imp && h === undefined) { const dl = imp.data[0].DataLines; if (dl) h = toTensor(dl).re[0] - 1; }
  if (h === undefined) h = o.range !== undefined ? 0 : guessHeaderRows(rows);
  rows = rows.slice(h);
  const missing = o.treatasmissing ? new Set(strList(o.treatasmissing)) : null;
  const cls = o.outputtype ? S(o.outputtype).toLowerCase() : 'double';
  if (cls === 'string' || cls === 'char') {
    const m = rows.length, n = rowWidth(rows);
    const data = new Array(m * n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const c = rows[i][j]; data[i + j * m] = c === null || c === undefined ? null : typeof c === 'number' ? gText(c) : typeof c === 'object' ? String(c.date) : String(c); }
    return stringArray([m, n], data);
  }
  const empty = o.emptyvalue !== undefined ? N(o.emptyvalue) : NaN;
  const fill = cls === 'single' || cls === 'double' ? empty : 0;
  return rowsToMatrix(rows, fill, (s) => (missing && missing.has(s) ? fill : cls === 'single' || cls === 'double' ? NaN : 0), cls);
}

// ---------------------------------------------------------------- cells

function missingValue(ctx) {
  try { const r = ctx.call('missing', [], 1); if (r && r[0]) return r[0]; } catch { /* fall back */ }
  return tensor('double', [0, 0]);
}

function cellValue(ctx, c, missing) {
  if (c === null || c === undefined) return missing;
  if (typeof c === 'number') return num(c);
  if (typeof c === 'boolean') return bool(c);
  if (typeof c === 'object' && c.date !== undefined) return dateValue(ctx, [c.date]) || num(c.date);
  return str(String(c));
}

function readcell(args, nargout, ctx) {
  const { file, o, ro } = readerArgs(args, 'readcell');
  let { rows } = loadRows(ctx, file, ro);
  if (o.range !== undefined) rows = applyRange(rows, o.range);
  if (ro.headerLines) rows = rows.slice(ro.headerLines);
  const m = rows.length, n = rowWidth(rows);
  const miss = missingValue(ctx);
  const data = new Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) data[i + j * m] = cellValue(ctx, rows[i][j], miss);
  return cell([m, n], data);
}

// ---------------------------------------------------------------- tables

function dateValue(ctx, serials) {
  try {
    const r = ctx.call('datetime', [tensor('double', [serials.length, 1], serials), str('ConvertFrom'), str('excel')], 1);
    return r[0];
  } catch { return null; }
}

/** Table data model from rows: { names, columns: [{type, values}] }. */
function tableModel(ctx, rows0, o, ro, imp) {
  let rows = rows0;
  if (o.range !== undefined) rows = applyRange(rows, o.range);
  // names line and data lines
  let namesLine = null, dataStart;
  const impGet = (f) => (imp && imp.fields.includes(f) ? imp.data[0][f] : undefined);
  const readNames = o.readvariablenames !== undefined ? optBool(o.readvariablenames) : undefined;
  const header = ro.headerLines;
  if (impGet('VariableNamesLine') !== undefined) namesLine = N(impGet('VariableNamesLine')) - 1;
  if (impGet('DataLines') !== undefined) dataStart = toTensor(impGet('DataLines')).re[0] - 1;
  if (namesLine === null || namesLine < 0) {
    if (readNames === false) namesLine = -1;
    else {
      const first = header || 0;
      // skip leading blank rows
      let r = first; while (r < rows.length && rows[r].every((c) => c === null)) r++;
      const row = rows[r] || [];
      const textOnly = row.length > 0 && row.every((c) => c === null || typeof c === 'string');
      const nextHasNum = rows.slice(r + 1).some((x) => x.some(isNumCell));
      const allText = rows.slice(r + 1).every((x) => x.every((c) => c === null || typeof c === 'string'));
      namesLine = readNames === true || (textOnly && (nextHasNum || (allText && rows.length > r + 1 && !ro.sheetNoHeader))) ? r : -1;
      if (dataStart === undefined) dataStart = namesLine >= 0 ? namesLine + 1 : r;
    }
  }
  if (dataStart === undefined) dataStart = namesLine >= 0 ? namesLine + 1 : header || 0;
  const data = rows.slice(dataStart).filter((r) => r.some((c) => c !== null));
  let n = Math.max(rowWidth(data), namesLine >= 0 ? (rows[namesLine] || []).length : 0);
  const rule = o.variablenamingrule ? S(o.variablenamingrule).toLowerCase() : 'modify';
  let names;
  if (o.variablenames !== undefined) names = strList(o.variablenames);
  else if (impGet('VariableNames') !== undefined && namesLine < 0) names = strList(impGet('VariableNames'));
  else if (namesLine >= 0) names = (rows[namesLine] || []).map((c, j) => (c === null ? `Var${j + 1}` : typeof c === 'number' ? gText(c) : String(c)));
  else names = [];
  for (let j = names.length; j < n; j++) names.push(`Var${j + 1}`);
  if (names.length > n) n = names.length;
  if (rule !== 'preserve') names = names.map((s) => makeValidName(s));
  // unique names
  const seen = new Map();
  names = names.map((s) => { if (!seen.has(s)) { seen.set(s, 1); return s; } let k = seen.get(s); let t; do { t = `${s}_${k++}`; } while (seen.has(t)); seen.set(s, k); seen.set(t, 1); return t; });
  const types = impGet('VariableTypes') !== undefined ? strList(impGet('VariableTypes')) : null;
  const missing = o.treatasmissing ? new Set(strList(o.treatasmissing)) : null;
  const columns = [];
  for (let j = 0; j < n; j++) {
    const vals = data.map((r) => { const c = r[j] === undefined ? null : r[j]; return missing && typeof c === 'string' && missing.has(c) ? null : c; });
    let type = types && types[j] ? types[j] : null;
    if (!type) {
      const ne = vals.filter((c) => c !== null);
      if (ne.length && ne.every((c) => typeof c === 'object')) type = 'datetime';
      else if (ne.every((c) => isNumCell(c))) type = 'double';
      else type = o.texttype && S(o.texttype).toLowerCase() === 'string' ? 'string' : 'char';
    }
    columns.push({ type, values: vals });
  }
  return { names, columns };
}

function columnValue(ctx, col) {
  const vals = col.values; const m = vals.length;
  const t = col.type;
  if (t === 'double' || t === 'single' || /^u?int\d+$/.test(t) || t === 'logical') {
    const re = new Float64Array(m);
    vals.forEach((c, i) => { re[i] = c === null ? (t === 'double' || t === 'single' ? NaN : 0) : typeof c === 'number' ? c : typeof c === 'boolean' ? +c : typeof c === 'object' ? c.date : (parseNumberText(String(c)) ?? NaN); });
    if (t === 'double') return tensor('double', [m, 1], re);
    if (t === 'logical') return tensor('logical', [m, 1], re.map((x) => (x ? 1 : 0)));
    return tensor(t, [m, 1], re.map((x) => (t === 'single' ? Math.fround(x) : saturate(t, x))));
  }
  if (t === 'datetime') {
    const d = dateValue(ctx, vals.map((c) => (c && typeof c === 'object' ? c.date : NaN)));
    if (d) return d;
    return tensor('double', [m, 1], vals.map((c) => (c && typeof c === 'object' ? c.date : NaN)));
  }
  const text = vals.map((c) => (c === null ? null : typeof c === 'number' ? gText(c) : typeof c === 'object' ? String(c.date) : String(c)));
  if (t === 'string') return stringArray([m, 1], text);
  if (t === 'categorical') { try { return ctx.call('categorical', [cell([m, 1], text.map((s) => str(s ?? '')))], 1)[0]; } catch { /* fall back */ } }
  return cell([m, 1], text.map((s) => (s === null || s === '' ? tensor('char', [0, 0]) : str(s))));
}

export function makeTable(ctx, columns, names, rowNames) {
  const args = [...columns, str('VariableNames'), cellRowOf(names.map((s) => str(s)))];
  if (rowNames) args.push(str('RowNames'), cell([rowNames.length, 1], rowNames.map((s) => str(s))));
  try {
    return ctx.call('table', args, 1)[0];
  } catch (e) {
    if (e && /undefined|not available|Undefined/i.test(e.message)) throw E('io:readtable:noTable', 'Tables are not available in this session.');
    throw e;
  }
}

function readtable(args, nargout, ctx) {
  const { file, o, ro, imp } = readerArgs(args, 'readtable');
  const { rows } = loadRows(ctx, file, ro);
  const model = tableModel(ctx, rows, o, ro, imp);
  let { names, columns } = model;
  let rowNames = null;
  if (o.readrownames !== undefined && optBool(o.readrownames) && columns.length) {
    rowNames = columns[0].values.map((c) => (c === null ? '' : typeof c === 'number' ? gText(c) : String(c)));
    names = names.slice(1); columns = columns.slice(1);
  }
  const sel = o.selectedvariablenames !== undefined ? strList(o.selectedvariablenames) : imp && imp.fields.includes('SelectedVariableNames') ? strList(imp.data[0].SelectedVariableNames) : null;
  if (sel) {
    const idx = sel.map((s) => { const k = names.indexOf(s); if (k < 0) throw E('io:readtable:badVariable', `Unknown variable name '${s}'.`); return k; });
    names = idx.map((k) => names[k]); columns = idx.map((k) => columns[k]);
  }
  return makeTable(ctx, columns.map((c) => columnValue(ctx, c)), names, rowNames);
}

function readvars(args, nargout, ctx) {
  const { file, o, ro, imp } = readerArgs(args, 'readvars');
  const { rows } = loadRows(ctx, file, ro);
  const { columns } = tableModel(ctx, rows, o, ro, imp);
  const n = Math.max(1, nargout);
  return columns.slice(0, n).map((c) => columnValue(ctx, c));
}

function detectImportOptions(args, nargout, ctx) {
  const { file, o, ro } = readerArgs(args, 'detectImportOptions');
  const src = loadRows(ctx, file, ro);
  const { names, columns } = tableModel(ctx, src.rows, o, ro, null);
  // locate the names line and first data line again for the report
  const rows = src.rows;
  let nl = 0; while (nl < rows.length && rows[nl].every((c) => c === null)) nl++;
  const hasNames = rows[nl] && rows[nl].every((c) => c === null || typeof c === 'string') && rows.slice(nl + 1).some((r) => r.some(isNumCell));
  const fields = {
    VariableNames: cellRowOf(names.map((s) => str(s))),
    VariableTypes: cellRowOf(columns.map((c) => str(c.type))),
    SelectedVariableNames: cellRowOf(names.map((s) => str(s))),
    DataLines: tensor('double', [1, 2], [hasNames ? nl + 2 : nl + 1, Infinity]),
    VariableNamesLine: num(hasNames ? nl + 1 : 0),
    FileType: str(src.sheet ? 'spreadsheet' : 'delimitedtext'),
    Delimiter: src.sheet ? cell([1, 0], []) : cellRowOf([str(src.delimiter || ' ')]),
    Sheet: str(src.sheet && ro.sheet !== undefined ? String(ro.sheet) : ''),
    MissingRule: str('fill'),
    ImportErrorRule: str('fill'),
    ExtraColumnsRule: str('addvars'),
    EmptyLineRule: str('skip'),
  };
  return structScalar(fields);
}

// ---------------------------------------------------------------- writers

/** CSV field text with quoting. */
function quoteField(s, delim, force) {
  if (force || s.includes(delim) || /["\r\n]/.test(s) || (delim === ' ' && /\s/.test(s))) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
const numText = (x) => gText(x, 15);

function cellText(c, delim, quote) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return numText(c);
  if (typeof c === 'boolean') return c ? '1' : '0';
  if (c instanceof Date) return c.toISOString().replace('T', ' ').replace(/\.000Z$|Z$/, '');
  return quoteField(String(c), delim, quote);
}

function writeTextRows(ctx, file, rows, o) {
  const delim = o.delimiter ?? ',';
  const eol = o.eol ?? '\n';
  const text = rows.map((r) => r.map((c) => cellText(c, delim, o.quote)).join(delim)).join(eol) + (rows.length ? eol : '');
  const p = absPath(ctx, file);
  const bytes = encodeText(text, o.encoding || 'UTF-8');
  if (o.append && fsExists(ctx, p)) {
    const old = ctx.fs.readBytes(p);
    const sepNeeded = old.length && old[old.length - 1] !== 10;
    const add = sepNeeded ? encodeText(eol + text, o.encoding || 'UTF-8') : bytes;
    const all = new Uint8Array(old.length + add.length); all.set(old); all.set(add, old.length);
    writeFileBytes(ctx, p, all);
  } else writeFileBytes(ctx, p, bytes);
}

function writeSheetRows(ctx, file, rows, o) {
  const p = absPath(ctx, file);
  let existing = null;
  if (fsExists(ctx, p) && o.mode !== 'replacefile') existing = ctx.fs.readBytes(p);
  let start = 'A1';
  if (o.range) start = S(o.range).split(':')[0];
  if (o.append && existing) {
    try { const prev = readXlsx(existing).rows(o.sheet ?? 1); start = `A${prev.length + 1}`; } catch { /* new sheet */ }
  }
  const bytes = writeXlsx(existing, o.sheet ?? 1, rows, start);
  writeFileBytes(ctx, p, bytes);
}

const WRITE_OPTS = ['delimiter', 'writemode', 'filetype', 'sheet', 'range', 'quotestrings', 'writevariablenames', 'writerownames', 'encoding', 'linebreak', 'datelocale', 'autofitwidth', 'precision', 'usexcel', 'preservedformat', 'preserveformat'];

function writerOptions(args, start, fname, file) {
  const o = nameValues(args, start);
  for (const key of Object.keys(o)) if (!WRITE_OPTS.includes(key)) throw E(`io:${fname}:unknownOption`, `Unknown option '${key}'.`);
  const ft = o.filetype ? S(o.filetype).toLowerCase() : undefined;
  const mode = o.writemode ? S(o.writemode).toLowerCase() : 'overwrite';
  return {
    o,
    sheet: isSheetFile(file, ft === 'text' ? 'text' : ft),
    w: {
      delimiter: o.delimiter !== undefined ? delimList(o.delimiter)[0] : extName(file) === '.tsv' ? '\t' : ',',
      append: mode === 'append',
      mode,
      quote: o.quotestrings !== undefined ? optBool(o.quotestrings) : false,
      sheet: o.sheet !== undefined ? (isText(o.sheet) ? S(o.sheet) : N(o.sheet)) : undefined,
      range: o.range,
      encoding: o.encoding ? S(o.encoding) : undefined,
      eol: o.linebreak ? ({ unix: '\n', pc: '\r\n', windows: '\r\n', mac: '\r', '\\n': '\n', '\\r\\n': '\r\n' })[S(o.linebreak).toLowerCase()] ?? unescapeText(S(o.linebreak)) : '\n',
    },
  };
}

/** Rows of JS cells from an array value (numeric, logical, char, string, cell). */
function valueRows(ctx, v) {
  if (isCell(v)) {
    const [m, n] = v.dims; const rows = [];
    for (let i = 0; i < m; i++) {
      const r = [];
      for (let j = 0; j < n; j++) {
        const x = v.data[i + j * m];
        if (isChar(x)) r.push(S(x));
        else if (isString(x)) r.push(x.data[0]);
        else if (isTensor(x)) r.push(x.re.length === 0 ? null : isLogical(x) ? !!x.re[0] : x.re[0]);
        else if (isObject(x)) r.push(objectText(ctx, x)[0] ?? null);
        else throw E('io:writecell:badCell', `Cells of class ${x.cls} cannot be written.`);
      }
      rows.push(r);
    }
    return rows;
  }
  if (isString(v)) { const [m, n] = v.dims; const rows = []; for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(v.data[i + j * m]); rows.push(r); } return rows; }
  if (isChar(v)) { const s = S(v); return s.split('\n').map((l) => [l]); }
  if (isObject(v)) { return objectText(ctx, v).map((s) => [s]); }
  const t = toTensor(v);
  if (t.dims.length > 2) throw E('io:write:ndData', 'Only 2-D data can be written.');
  const [m, n] = t.dims; const rows = [];
  for (let i = 0; i < m; i++) {
    const r = [];
    for (let j = 0; j < n; j++) {
      const x = t.re[i + j * m];
      if (t.im && t.im[i + j * m]) { const y = t.im[i + j * m]; r.push(`${numText(x)}${y < 0 ? '-' : '+'}${numText(Math.abs(y))}i`); } else r.push(isLogical(t) ? !!x : x);
    }
    rows.push(r);
  }
  return rows;
}

/** Text of an object column (datetime, categorical, ...) through string() / cellstr(). */
function objectText(ctx, v) {
  for (const fn of ['string', 'cellstr']) {
    try {
      const r = ctx.call(fn, [v], 1)[0];
      if (isString(r)) return r.data.map((s) => s ?? '');
      if (isCell(r)) return r.data.map((x) => S(x));
    } catch { /* try next */ }
  }
  throw E('io:write:badObject', `Values of class ${v.cls} cannot be written.`);
}

function writematrix(args, nargout, ctx) {
  if (!args.length) throw E('io:writematrix:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  const hasFile = args[1] !== undefined && isTextArg(args[1]) && !WRITE_OPTS.includes(S(args[1]).toLowerCase());
  const file = hasFile ? S(args[1]) : 'matrix.txt';
  const start = hasFile ? 2 : 1;
  const { sheet, w } = writerOptions(args, start, 'writematrix', file);
  const rows = valueRows(ctx, A);
  if (sheet) writeSheetRows(ctx, file, rows, w);
  else writeTextRows(ctx, file, rows, w);
  return undefined;
}

function writecell(args, nargout, ctx) {
  if (!args.length) throw E('io:writecell:notEnoughInputs', 'Not enough input arguments.');
  const C = args[0];
  if (!isCell(C)) throw E('io:writecell:notCell', 'Input must be a cell array.');
  const file = args[1] !== undefined && isTextArg(args[1]) && !WRITE_OPTS.includes(S(args[1]).toLowerCase()) ? S(args[1]) : 'cell.txt';
  const start = args[1] !== undefined && isTextArg(args[1]) && !WRITE_OPTS.includes(S(args[1]).toLowerCase()) ? 2 : 1;
  const { sheet, w } = writerOptions(args, start, 'writecell', file);
  const rows = valueRows(ctx, C);
  if (sheet) writeSheetRows(ctx, file, rows, w); else writeTextRows(ctx, file, rows, w);
  return undefined;
}

/** Variable names, columns and row names of a table value. */
export function tableParts(ctx, T) {
  let s;
  try { s = ctx.call('table2struct', [T, str('ToScalar'), bool(true)], 1)[0]; } catch (e) {
    throw E('io:writetable:notTable', `Input must be a table (${e.message}).`);
  }
  if (!isStruct(s)) throw E('io:writetable:notTable', 'Input must be a table.');
  const names = s.fields.slice();
  const cols = names.map((f) => s.data[0][f]);
  let rowNames = null;
  const P = T.props || {};
  const rn = P.RowNames ?? P.rowNames ?? (P.Properties && P.Properties.RowNames);
  if (Array.isArray(rn) && rn.length) rowNames = rn.map(String);
  else if (rn && (isCell(rn) || isString(rn)) && rn.data.length) rowNames = strList(rn);
  return { names, cols, rowNames };
}

function writetable(args, nargout, ctx) {
  if (!args.length) throw E('io:writetable:notEnoughInputs', 'Not enough input arguments.');
  const T = args[0];
  const hasFile = args[1] !== undefined && isTextArg(args[1]) && !WRITE_OPTS.includes(S(args[1]).toLowerCase());
  const file = hasFile ? S(args[1]) : 'table.txt';
  const { o, sheet, w } = writerOptions(args, hasFile ? 2 : 1, 'writetable', file);
  const { names, cols, rowNames } = tableParts(ctx, T);
  const writeNames = o.writevariablenames !== undefined ? optBool(o.writevariablenames) : true;
  const writeRows = o.writerownames !== undefined ? optBool(o.writerownames) : false;
  const header = [];
  const colRows = []; // per variable: array (per row) of arrays of cells
  let m = 0;
  cols.forEach((v, k) => {
    const rows = valueRows(ctx, v);
    m = Math.max(m, rows.length);
    const width = rows.reduce((mm, r) => Math.max(mm, r.length), 1);
    if (width === 1) header.push(names[k]); else for (let j = 1; j <= width; j++) header.push(`${names[k]}_${j}`);
    colRows.push({ rows, width });
  });
  const out = [];
  const append = w.append && fsExists(ctx, absPath(ctx, file));
  if (writeNames && !append) out.push([...(writeRows && rowNames ? ['Row'] : []), ...header]);
  for (let i = 0; i < m; i++) {
    const r = [];
    if (writeRows && rowNames) r.push(rowNames[i] ?? '');
    for (const c of colRows) for (let j = 0; j < c.width; j++) { const x = c.rows[i] ? c.rows[i][j] : null; r.push(typeof x === 'number' && Number.isNaN(x) ? null : x); }
    out.push(r);
  }
  if (sheet) writeSheetRows(ctx, file, out, w); else writeTextRows(ctx, file, out, w);
  return undefined;
}

// csvwrite / dlmwrite (numeric with row/column offsets and precision)
function dlmwriteCore(ctx, file, M, o) {
  const t = isCell(M) ? null : toTensor(M);
  const rows = [];
  for (let i = 0; i < o.roff; i++) rows.push('');
  const fmtCell = (x) => (typeof o.precision === 'string' ? formatNumberSpec(x, o.precision) : gText(x, o.precision));
  const pad = o.coff ? o.delimiter.repeat(o.coff) : '';
  if (t) {
    const [m, n] = t.dims;
    for (let i = 0; i < m; i++) {
      const r = [];
      for (let j = 0; j < n; j++) {
        const x = t.re[i + j * m];
        if (t.cls === 'char') r.push(String.fromCharCode(x));
        else if (t.im && t.im[i + j * m]) { const y = t.im[i + j * m]; r.push(`${fmtCell(x)}${y < 0 ? '-' : '+'}${fmtCell(Math.abs(y))}i`); } else r.push(fmtCell(x));
      }
      rows.push(pad + r.join(t.cls === 'char' ? '' : o.delimiter));
    }
  }
  const text = rows.map((r) => r + o.eol).join('');
  const p = absPath(ctx, file);
  if (o.append && fsExists(ctx, p)) {
    const old = ctx.fs.readBytes(p); const add = encodeText(text);
    const all = new Uint8Array(old.length + add.length); all.set(old); all.set(add, old.length);
    writeFileBytes(ctx, p, all);
  } else writeFileBytes(ctx, p, encodeText(text));
}

function csvwrite(args, nargout, ctx) {
  if (args.length < 2) throw E('io:csvwrite:notEnoughInputs', 'Not enough input arguments.');
  dlmwriteCore(ctx, S(args[0]), args[1], { delimiter: ',', roff: args[2] !== undefined ? N(args[2]) : 0, coff: args[3] !== undefined ? N(args[3]) : 0, precision: 5, eol: '\n', append: false });
  return undefined;
}

function dlmwrite(args, nargout, ctx) {
  if (args.length < 2) throw E('io:dlmwrite:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0]);
  const M = args[1];
  const o = { delimiter: ',', roff: 0, coff: 0, precision: 5, eol: '\n', append: false };
  let k = 2;
  const names = ['delimiter', 'newline', 'roffset', 'coffset', 'precision'];
  let positional = 0;
  while (k < args.length) {
    const a = args[k];
    if (isTextArg(a) && S(a).toLowerCase() === '-append') { o.append = true; k++; continue; }
    if (isTextArg(a) && names.includes(S(a).toLowerCase()) && k + 1 < args.length) {
      const key = S(a).toLowerCase(); const v = args[k + 1];
      if (key === 'delimiter') o.delimiter = unescapeText(S(v));
      else if (key === 'newline') o.eol = /^pc$/i.test(S(v)) ? '\r\n' : '\n';
      else if (key === 'roffset') o.roff = N(v);
      else if (key === 'coffset') o.coff = N(v);
      else o.precision = isText(v) ? S(v) : N(v);
      k += 2; continue;
    }
    // positional: delimiter, r, c
    if (positional === 0 && isTextArg(a)) { o.delimiter = unescapeText(S(a)); positional++; k++; continue; }
    if (!isTextArg(a)) { if (positional <= 1) { o.roff = N(a); positional = 2; } else { o.coff = N(a); positional = 3; } k++; continue; }
    throw E('io:dlmwrite:badArgument', `Invalid argument '${S(a)}'.`);
  }
  dlmwriteCore(ctx, file, M, o);
  return undefined;
}

// ---------------------------------------------------------------- importdata

function importdata(args, nargout, ctx) {
  if (!args.length) throw E('io:importdata:notEnoughInputs', 'Not enough input arguments.');
  const file = S(args[0], 'File name');
  const ext = extName(file);
  if (['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff', '.ppm', '.pgm', '.pbm'].includes(ext)) return ctx.call('imread', [str(file)], 2);
  if (ext === '.mat') return ctx.call('load', [str(file)], 1);
  if (ext === '.wav') { const [y, fs] = ctx.call('audioread', [str(file)], 2); return structScalar({ data: y, fs }); }
  const ro = {};
  if (args[1] !== undefined) ro.delimiter = [unescapeText(S(args[1]))];
  const { rows, sheet, delimiter } = loadRows(ctx, file, ro);
  const h = args[2] !== undefined ? N(args[2]) : guessHeaderRows(rows);
  const head = rows.slice(0, h);
  const data = rows.slice(h);
  const A = rowsToMatrix(data, NaN, () => NaN);
  if (!h && nargout <= 1) return [A, str(delimiter || ' '), num(0)];
  const textdata = cell([head.length, 1], head.map((r) => str(r.map((c) => (c === null ? '' : String(c))).join(delimiter || ' '))));
  const fields = { data: A, textdata };
  const last = head[head.length - 1];
  if (last && last.length === A.dims[1] && last.every((c) => typeof c === 'string')) fields.colheaders = cellRowOf(last.map((s) => str(s)));
  void sheet;
  return [structScalar(fields), str(delimiter || ' '), num(h)];
}

export const builtins = {
  csvread, csvwrite, dlmread, dlmwrite, readmatrix, writematrix, readcell, writecell, readtable, writetable,
  readvars, detectImportOptions, importdata,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  csvread: H('Read a comma-separated numeric file (prefer readmatrix).', '쉼표로 구분된 숫자 파일을 읽습니다 (readmatrix 권장).', ['M = csvread(filename)', 'M = csvread(filename, R1, C1)', 'M = csvread(filename, R1, C1, [R1 C1 R2 C2])']),
  csvwrite: H('Write a matrix to a comma-separated file (prefer writematrix).', '행렬을 쉼표 구분 파일로 씁니다 (writematrix 권장).', ['csvwrite(filename, M)', 'csvwrite(filename, M, row, col)']),
  dlmread: H('Read a delimited numeric file (prefer readmatrix).', '구분자로 나뉜 숫자 파일을 읽습니다 (readmatrix 권장).', ['M = dlmread(filename)', 'M = dlmread(filename, delimiter)', 'M = dlmread(filename, delimiter, R1, C1)', 'M = dlmread(filename, delimiter, [R1 C1 R2 C2])']),
  dlmwrite: H('Write a matrix to a delimited file (prefer writematrix).', '행렬을 구분자 파일로 씁니다 (writematrix 권장).', ['dlmwrite(filename, M)', "dlmwrite(filename, M, '-append')", 'dlmwrite(filename, M, delimiter, r, c)', "dlmwrite(filename, M, 'delimiter', d, 'precision', p, 'newline', 'pc')"]),
  readmatrix: H('Read a matrix from a text or spreadsheet file.', '텍스트나 스프레드시트 파일에서 행렬을 읽습니다.', ['A = readmatrix(filename)', 'A = readmatrix(filename, opts)', 'A = readmatrix(___, Name, Value)']),
  writematrix: H('Write a matrix to a text or spreadsheet file.', '행렬을 텍스트나 스프레드시트 파일로 씁니다.', ['writematrix(A)', 'writematrix(A, filename)', 'writematrix(___, Name, Value)']),
  readcell: H('Read a cell array from a text or spreadsheet file.', '텍스트나 스프레드시트 파일에서 셀형 배열을 읽습니다.', ['C = readcell(filename)', 'C = readcell(filename, Name, Value)']),
  writecell: H('Write a cell array to a text or spreadsheet file.', '셀형 배열을 텍스트나 스프레드시트 파일로 씁니다.', ['writecell(C)', 'writecell(C, filename)', 'writecell(___, Name, Value)']),
  readtable: H('Create a table from a text or spreadsheet file.', '텍스트나 스프레드시트 파일로 테이블을 만듭니다.', ['T = readtable(filename)', 'T = readtable(filename, opts)', 'T = readtable(___, Name, Value)']),
  writetable: H('Write a table to a text or spreadsheet file.', '테이블을 텍스트나 스프레드시트 파일로 씁니다.', ['writetable(T)', 'writetable(T, filename)', 'writetable(___, Name, Value)']),
  readvars: H('Read the variables (columns) of a file into separate outputs.', '파일의 변수(열)를 각각의 출력으로 읽습니다.', ['[Var1, Var2, ..., VarN] = readvars(filename)', '[___] = readvars(filename, Name, Value)']),
  detectImportOptions: H('Detect how to import a text or spreadsheet file.', '텍스트나 스프레드시트 파일을 가져오는 방법을 감지합니다.', ['opts = detectImportOptions(filename)', 'opts = detectImportOptions(filename, Name, Value)']),
  importdata: H('Load data from a file (text, spreadsheet, image, MAT, WAV).', '파일에서 데이터를 불러옵니다 (텍스트, 스프레드시트, 이미지, MAT, WAV).', ['A = importdata(filename)', 'A = importdata(filename, delimiterIn)', 'A = importdata(filename, delimiterIn, headerlinesIn)', '[A, delimiterOut, headerlinesOut] = importdata(___)']),
};

void baseName; void colName;
