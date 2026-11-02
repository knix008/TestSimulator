// The GNU Octave text data format (`save -text`, the format of files that
// start with "# Created by Octave" or "# name:") and the save settings
// save_default_options / save_header_format_string / save_precision.
//
// Supported value types: real/complex double scalars and N-d matrices,
// logical ("bool"), char ("string" / "sq_string"), integer classes,
// single ("float" types are written as double text), sparse, cell arrays,
// scalar structs and struct arrays. Other values are skipped with a warning.
import { E, S, N, str, num, tensor, cell, isTextArg, isTensor, isCell, isStruct, isString, isSparse } from './util.js';
import { struct, sparseMatrix, stringArray } from '../../value.js';

// ---------------------------------------------------------------- settings

export function saveSettings(ctx) {
  if (!ctx.state.saveSettings) {
    ctx.state.saveSettings = {
      options: '-mat',
      header: '# Created by MySimulationMath, %a %b %d %H:%M:%S %Y %Z',
      precision: 17,
    };
  }
  return ctx.state.saveSettings;
}

function setting(key, check) {
  return (args, nargout, ctx) => {
    const s = saveSettings(ctx);
    const old = s[key];
    if (args.length) {
      if (args.length > 1 && !(isTextArg(args[1]) && S(args[1]).toLowerCase() === 'local')) throw E(`io:${key}:badOption`, "The second argument can only be 'local'.");
      s[key] = check(args[0]);
    }
    if (args.length && nargout === 0) return undefined;
    return typeof old === 'number' ? num(old) : str(old);
  };
}

const save_default_options = setting('options', (v) => {
  const t = S(v).trim();
  for (const w of t.split(/\s+/).filter(Boolean)) {
    if (!/^-(mat|v7|v6|v4|text|ascii|double|tabs|nocompression|zip|z|binary|mat-binary|mat7-binary|v7\.3|append)$/i.test(w)) throw E('io:save_default_options:badOption', `Unknown save option '${w}'.`);
  }
  return t;
});
const save_header_format_string = setting('header', (v) => S(v));
const save_precision = setting('precision', (v) => {
  const n = N(v);
  if (!(Number.isInteger(n) && n >= 1 && n <= 17)) throw E('io:save_precision:badValue', 'save_precision must be an integer between 1 and 17.');
  return n;
});

/** strftime subset used by the header format (%a %b %d %e %H %M %S %Y %y %m %j %Z %p %I %%). */
export function strftime(fmt, d = new Date()) {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (x) => String(x).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const zone = `UTC${off >= 0 ? '+' : '-'}${p2(Math.floor(Math.abs(off) / 60))}${p2(Math.abs(off) % 60)}`;
  const start = new Date(d.getFullYear(), 0, 1);
  return fmt.replace(/%([aAbBdeHMSYymjZpI%])/g, (m, c) => {
    switch (c) {
      case 'a': return DAYS[d.getDay()];
      case 'A': return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
      case 'b': return MON[d.getMonth()];
      case 'B': return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
      case 'd': return p2(d.getDate());
      case 'e': return String(d.getDate()).padStart(2, ' ');
      case 'H': return p2(d.getHours());
      case 'I': return p2(((d.getHours() + 11) % 12) + 1);
      case 'p': return d.getHours() < 12 ? 'AM' : 'PM';
      case 'M': return p2(d.getMinutes());
      case 'S': return p2(d.getSeconds());
      case 'Y': return String(d.getFullYear());
      case 'y': return p2(d.getFullYear() % 100);
      case 'm': return p2(d.getMonth() + 1);
      case 'j': return String(Math.floor((d - start) / 86400000) + 1).padStart(3, '0');
      case 'Z': return zone;
      default: return '%';
    }
  });
}

// ---------------------------------------------------------------- writer

function fmtNum(x, prec) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
  let s = x.toPrecision(prec);
  if (s.includes('e')) { s = s.replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2'); } else if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}
const fmtCx = (re, im, prec) => `(${fmtNum(re, prec)},${fmtNum(im, prec)})`;

const INT_CLASSES = ['int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64'];

function writeValue(name, v, prec, out, warn) {
  const head = (type) => out.push(`# name: ${name}`, `# type: ${type}`);
  if (isSparse(v)) {
    const [m, n] = v.dims;
    const nnz = v.colPtr[n];
    const cx = !!v.im;
    head(v.cls === 'logical' ? 'sparse bool matrix' : cx ? 'sparse complex matrix' : 'sparse matrix');
    out.push(`# nnz: ${nnz}`, `# rows: ${m}`, `# columns: ${n}`);
    for (let j = 0; j < n; j++) for (let k = v.colPtr[j]; k < v.colPtr[j + 1]; k++) {
      out.push(`${v.rowIdx[k] + 1} ${j + 1} ${cx ? fmtCx(v.re[k], v.im[k], prec) : fmtNum(v.re[k], prec)}`);
    }
  } else if (isTensor(v) && v.cls === 'char') {
    const [m, n] = v.dims;
    if (v.dims.length > 2) { warn(`'${name}': N-d character arrays are not saved in text format.`); return false; }
    head('string');
    out.push(`# elements: ${m}`);
    for (let i = 0; i < m; i++) {
      let s = '';
      for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]);
      out.push(`# length: ${n}`, s);
    }
  } else if (isTensor(v)) {
    const nd = v.dims.length;
    const scalar = v.re.length === 1 && nd === 2;
    const cx = !!v.im;
    if (INT_CLASSES.includes(v.cls)) {
      if (scalar) { head(`${v.cls} scalar`); out.push(String(v.re[0])); } else {
        head(`${v.cls} matrix`); out.push(`# ndims: ${nd}`, ' ' + v.dims.join(' '));
        for (const x of v.re) out.push(' ' + String(x));
      }
    } else {
      const base = v.cls === 'logical' ? 'bool' : cx ? 'complex ' : '';
      const one = (k) => (cx ? fmtCx(v.re[k], v.im[k], prec) : v.cls === 'logical' ? String(v.re[k] ? 1 : 0) : fmtNum(v.re[k], prec));
      if (scalar) { head(v.cls === 'logical' ? 'bool' : `${base}scalar`); out.push(one(0)); } else if (nd === 2) {
        head(v.cls === 'logical' ? 'bool matrix' : `${base}matrix`);
        const [m, n] = v.dims;
        out.push(`# rows: ${m}`, `# columns: ${n}`);
        for (let i = 0; i < m; i++) { let line = ''; for (let j = 0; j < n; j++) line += ' ' + one(i + j * m); out.push(line); }
      } else {
        head(v.cls === 'logical' ? 'bool matrix' : `${base}matrix`);
        out.push(`# ndims: ${nd}`, ' ' + v.dims.join(' '));
        for (let k = 0; k < v.re.length; k++) out.push(' ' + one(k));
      }
    }
  } else if (isString(v)) {
    // the text format has no string type: one string is char text (what Octave writes for "…"),
    // a string array a cell array of char
    if (v.data.length === 1) return writeValue(name, str(v.data[0] ?? ''), prec, out, warn);
    const c = cell(v.dims, v.data.map((s) => str(s ?? '')));
    return writeValue(name, c, prec, out, warn);
  } else if (isCell(v)) {
    head('cell');
    if (v.dims.length === 2) out.push(`# rows: ${v.dims[0]}`, `# columns: ${v.dims[1]}`);
    else out.push(`# ndims: ${v.dims.length}`, ' ' + v.dims.join(' '));
    for (const e of v.data) { if (!writeValue('<cell-element>', e, prec, out, warn)) writeValue('<cell-element>', tensor('double', [0, 0]), prec, out, warn); out.push('', ''); }
    out.push('');
  } else if (isStruct(v)) {
    if (v.data.length === 1 && v.dims.length === 2) {
      head('scalar struct');
      out.push('# ndims: 2', ' 1 1', `# length: ${v.fields.length}`);
      for (const f of v.fields) { if (!writeValue(f, v.data[0][f], prec, out, warn)) writeValue(f, tensor('double', [0, 0]), prec, out, warn); out.push('', ''); }
      out.push('');
    } else {
      head('struct');
      out.push(`# ndims: ${v.dims.length}`, ' ' + v.dims.join(' '), `# length: ${v.fields.length}`);
      for (const f of v.fields) {
        writeValue(f, cell(v.dims, v.data.map((r) => r[f])), prec, out, warn);
        out.push('', '');
      }
      out.push('');
    }
  } else {
    warn(`'${name}': values of class '${v.cls}' are not saved in text format.`);
    return false;
  }
  return true;
}

/** Text of an Octave text-format file. vars: [{ name, value, global }]. */
export function writeOctaveText(vars, { header, precision = 17, warn = () => {} } = {}) {
  const out = [];
  if (header) out.push(strftime(header));
  for (const { name, value, global } of vars) {
    const part = [];
    if (!writeValue(name, value, precision, part, warn)) continue;
    if (global) part[1] = part[1].replace('# type: ', '# type: global ');
    out.push(...part, '', '');
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- reader

export const isOctaveText = (text) => /^(\s*#[^\n]*\n)*\s*# name:/.test(text.slice(0, 4096)) || /^# Created by Octave/.test(text);

function parseNum(s) {
  const t = s.trim();
  if (/^\(.*\)$/.test(t)) { const [a, b] = t.slice(1, -1).split(','); return [parseNum(a)[0], parseNum(b)[0]]; }
  const l = t.toLowerCase();
  if (l === 'inf' || l === '+inf') return [Infinity, 0];
  if (l === '-inf') return [-Infinity, 0];
  if (l === 'nan' || l === 'na' || l === '-nan') return [NaN, 0];
  const x = Number(t);
  if (Number.isNaN(x)) throw E('io:load:badTextFile', `Invalid number '${s}' in the text data file.`);
  return [x, 0];
}
const splitNums = (line) => (line.match(/\([^)]*\)|[^\s]+/g) || []);

class Lines {
  constructor(text) { this.l = text.split(/\r?\n/); this.i = 0; }
  peek() { return this.l[this.i]; }
  next() { if (this.i >= this.l.length) throw E('io:load:badTextFile', 'Unexpected end of the text data file.'); return this.l[this.i++]; }
  done() { while (this.i < this.l.length && this.l[this.i].trim() === '') this.i++; return this.i >= this.l.length; }
  /** Reads a "# key: value" header line. */
  key(k) {
    while (this.i < this.l.length && this.l[this.i].trim() === '') this.i++;
    const line = this.next();
    const m = /^#\s*([a-z]+):\s?(.*)$/.exec(line);
    if (!m || m[1] !== k) throw E('io:load:badTextFile', `Expected '# ${k}:' in the text data file, found '${line}'.`);
    return m[2];
  }
  skipBlank() { while (this.i < this.l.length && this.l[this.i].trim() === '') this.i++; }
}

function readValue(L, type) {
  type = type.replace(/^global /, '');
  const cplx = /complex/.test(type);
  const mk = (cls, dims, vals) => {
    const n = vals.length;
    const re = new Float64Array(n), im = cplx ? new Float64Array(n) : null;
    vals.forEach(([a, b], k) => { re[k] = a; if (im) im[k] = b; });
    return tensor(cls, dims, re, im);
  };
  if (type === 'scalar' || type === 'complex scalar') { L.skipBlank(); return mk('double', [1, 1], [parseNum(L.next())]); }
  if (type === 'bool') { L.skipBlank(); return tensor('logical', [1, 1], [parseNum(L.next())[0] ? 1 : 0]); }
  const intm = /^(u?int(?:8|16|32|64)) (scalar|matrix)$/.exec(type);
  if (intm) {
    if (intm[2] === 'scalar') { L.skipBlank(); return tensor(intm[1], [1, 1], [Number(L.next().trim())]); }
    const nd = +L.key('ndims'); const dims = splitNums(L.next()).map(Number); void nd;
    const n = dims.reduce((a, b) => a * b, 1);
    const vals = [];
    while (vals.length < n) vals.push(...splitNums(L.next()).map(Number));
    return tensor(intm[1], dims, vals);
  }
  if (type === 'matrix' || type === 'complex matrix' || type === 'bool matrix') {
    const cls = type === 'bool matrix' ? 'logical' : 'double';
    const first = L.peek() || '';
    if (/^#\s*ndims:/.test(first)) {
      L.key('ndims'); const dims = splitNums(L.next()).map(Number);
      const n = dims.reduce((a, b) => a * b, 1);
      const vals = [];
      while (vals.length < n) vals.push(...splitNums(L.next()).map(parseNum));
      return mk(cls, dims, vals);
    }
    const m = +L.key('rows'), n = +L.key('columns');
    const vals = new Array(m * n);
    for (let i = 0; i < m; i++) {
      const row = splitNums(L.next()).map(parseNum);
      for (let j = 0; j < n; j++) vals[i + j * m] = row[j] || [0, 0];
    }
    return mk(cls, [m, n], vals);
  }
  if (type === 'string' || type === 'sq_string') {
    const rows = +L.key('elements');
    const lines = [];
    for (let i = 0; i < rows; i++) {
      const len = +L.key('length');
      let s = L.next();
      while (s.length < len && L.i < L.l.length) s += '\n' + L.next();
      lines.push(s.slice(0, len));
    }
    const w = lines.reduce((a, s) => Math.max(a, s.length), 0);
    const t = tensor('char', [rows, rows ? w : 0]);
    lines.forEach((s, i) => { for (let j = 0; j < w; j++) t.re[i + j * rows] = j < s.length ? s.charCodeAt(j) : 32; });
    if (rows === 1) return str(lines[0]);
    return t;
  }
  if (/^sparse/.test(type)) {
    const nnz = +L.key('nnz'), m = +L.key('rows'), n = +L.key('columns');
    const trip = [];
    for (let k = 0; k < nnz; k++) { const p = splitNums(L.next()); trip.push([+p[0] - 1, +p[1] - 1, parseNum(p[2])]); }
    trip.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const colPtr = new Int32Array(n + 1), rowIdx = new Int32Array(nnz), re = new Float64Array(nnz), im = /complex/.test(type) ? new Float64Array(nnz) : null;
    trip.forEach(([i, j, [a, b]], k) => { colPtr[j + 1]++; rowIdx[k] = i; re[k] = a; if (im) im[k] = b; });
    for (let j = 0; j < n; j++) colPtr[j + 1] += colPtr[j];
    return sparseMatrix(m, n, colPtr, rowIdx, re, im, /bool/.test(type) ? 'logical' : 'double');
  }
  if (type === 'cell') {
    let dims;
    if (/^#\s*ndims:/.test(L.peek() || '')) { L.key('ndims'); dims = splitNums(L.next()).map(Number); } else dims = [+L.key('rows'), +L.key('columns')];
    const n = dims.reduce((a, b) => a * b, 1);
    const data = [];
    for (let k = 0; k < n; k++) { L.key('name'); data.push(readValue(L, L.key('type'))); }
    return cell(dims, data);
  }
  if (type === 'scalar struct' || type === 'struct') {
    L.key('ndims'); const dims = splitNums(L.next()).map(Number);
    const nf = +L.key('length');
    const fields = [], vals = [];
    for (let k = 0; k < nf; k++) { fields.push(L.key('name')); vals.push(readValue(L, L.key('type'))); }
    if (type === 'scalar struct') {
      const r = Object.create(null); fields.forEach((f, k) => { r[f] = vals[k]; });
      return struct([1, 1], fields, [r]);
    }
    const n = dims.reduce((a, b) => a * b, 1);
    const data = Array.from({ length: n }, (_, i) => { const r = Object.create(null); fields.forEach((f, k) => { r[f] = vals[k].data[i]; }); return r; });
    return struct(dims, fields, data);
  }
  if (type === 'null_matrix' || type === 'null_string' || type === 'null_sq_string') return type === 'null_matrix' ? tensor('double', [0, 0]) : tensor('char', [0, 0]);
  throw E('io:load:unsupportedTextType', `Values of type '${type}' in the text data file are not supported.`);
}

/** Parses an Octave text-format file → [{ name, value, global }]. */
export function readOctaveText(text, only = () => true) {
  const L = new Lines(text);
  const vars = [];
  while (!L.done()) {
    const line = L.peek();
    if (/^#/.test(line) && !/^#\s*name:/.test(line)) { L.next(); continue; }
    const name = L.key('name');
    const type = L.key('type');
    const value = readValue(L, type);
    if (only(name)) vars.push({ name, value, global: /^global /.test(type) });
  }
  return vars;
}
void stringArray;

export const builtins = { save_default_options, save_header_format_string, save_precision };

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  save_default_options: H("Query or set the options save uses when none are given (default '-mat'; '-text' writes the Octave text format).", "옵션 없이 save를 부를 때 쓰는 기본 옵션을 조회하거나 바꿉니다 (기본 '-mat'; '-text'는 Octave 텍스트 형식).", ['val = save_default_options()', 'old_val = save_default_options(new_val)', 'save_default_options(new_val, "local")']),
  save_header_format_string: H('Query or set the header line of text data files written by save -text (strftime % codes are expanded).', 'save -text로 쓰는 텍스트 데이터 파일의 머리 줄을 조회하거나 바꿉니다 (strftime % 코드가 펼쳐짐).', ['val = save_header_format_string()', 'old_val = save_header_format_string(new_val)', 'save_header_format_string(new_val, "local")']),
  save_precision: H('Query or set the number of significant digits save -text writes (1..17, default 17).', 'save -text가 쓰는 유효 숫자 개수를 조회하거나 바꿉니다 (1..17, 기본 17).', ['val = save_precision()', 'old_val = save_precision(new_val)', 'save_precision(new_val, "local")']),
};
