// Small built-in formatter used when the library's `display` builtin is not
// available, so the language works on its own. Output follows the Command
// Window conventions closely (name =, blank lines unless format compact).
import { isTensor, isCell, isStruct, isString, isSparse, toTensor, prod, isObject, INT_RANGE } from '../value.js';

const TIMES = '×';
const isInt = (c) => c in INT_RANGE;
const sizeStr = (d) => d.join(TIMES);

function fmtReal(x, fmt, isIntCls) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  if (isIntCls || Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
  const long = fmt && fmt.numeric && fmt.numeric.startsWith('long');
  const g = fmt && fmt.numeric && /g$/i.test(fmt.numeric);
  const digits = long ? 15 : 4;
  const ax = Math.abs(x);
  if (g) return String(Number(x.toPrecision(long ? 15 : 5)));
  if (ax >= 1e5 || ax < 1e-3) return expo(x, digits);
  return x.toFixed(digits);
}
function expo(x, digits) {
  const s = x.toExponential(digits);
  return s.replace(/e([+-])(\d)$/, 'e$10$2');
}

function fmtComplex(re, im, fmt, isIntCls) {
  const r = fmtReal(re, fmt, isIntCls && Number.isInteger(re));
  const a = fmtReal(Math.abs(im), fmt, isIntCls && Number.isInteger(im));
  const sign = im < 0 || Object.is(im, -0) ? '-' : '+';
  return `${r} ${sign} ${a}i`;
}

/** Formats the numbers of a real/complex numeric matrix (2-D page) as aligned columns. */
function numericRows(t, fmt) {
  const [m, n] = t.dims;
  const intCls = isInt(t.cls) || t.cls === 'logical' || t.cls === 'char';
  let allInt = true;
  for (let i = 0; i < t.re.length; i++) if (!Number.isInteger(t.re[i]) && Number.isFinite(t.re[i])) { allInt = false; break; }
  if (t.im) for (let i = 0; i < t.im.length; i++) if (!Number.isInteger(t.im[i]) && Number.isFinite(t.im[i])) { allInt = false; break; }
  const cells = [];
  let w = 0;
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      const k = i + j * m;
      let s;
      if (t.im) s = fmtComplex(t.re[k], t.im[k], fmt, intCls || allInt);
      else if (intCls || allInt) s = fmtReal(t.re[k], fmt, true);
      else {
        const x = t.re[k];
        const long = fmt && fmt.numeric && fmt.numeric.startsWith('long');
        s = Number.isFinite(x) ? (Number.isInteger(x) && false ? String(x) : maxAbs(t) >= 1e5 || maxAbs(t) < 1e-3 ? expo(x, long ? 15 : 4) : x.toFixed(long ? 15 : 4)) : fmtReal(x, fmt);
      }
      row.push(s);
      if (s.length > w) w = s.length;
    }
    cells.push(row);
  }
  const width = t.cls === 'logical' ? Math.max(w + 3, 4) : intCls ? w + 2 + (isInt(t.cls) ? 0 : 1) : allInt ? Math.max(w + 3, 6) : w + 3;
  return cells.map((row) => row.map((s) => s.padStart(width)).join(''));
}
function maxAbs(t) { let m = 0; for (const x of t.re) if (Number.isFinite(x) && Math.abs(x) > m) m = Math.abs(x); return m === 0 ? 1 : m; }

function charRows(t) {
  const [m, n] = t.dims;
  const out = [];
  for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(t.re[i + j * m]); out.push(s); }
  return out;
}

/** Short one-line summary of a value (used in cells, structs and the workspace). */
export function brief(v, fmt) {
  if (v === undefined || v === null) return '[]';
  if (isSparse(v)) return `${sizeStr(v.dims)} sparse ${v.cls}`;
  if (isTensor(v)) {
    const n = prod(v.dims);
    if (v.cls === 'char' && v.dims.length === 2 && v.dims[0] <= 1) return `'${charRows(v)[0] || ''}'`;
    if (n === 0) return v.cls === 'double' && v.dims[0] === 0 && v.dims[1] === 0 ? '[]' : `${sizeStr(v.dims)} ${v.cls}`;
    if (n === 1) {
      if (v.cls === 'logical') return v.re[0] ? 'true' : 'false';
      const s = v.im ? fmtComplex(v.re[0], v.im[0], fmt, isInt(v.cls)) : fmtReal(v.re[0], fmt, isInt(v.cls));
      return s;
    }
    if (v.dims.length === 2 && v.dims[0] === 1 && n <= 10 && !v.im) {
      return `[${Array.from(v.re, (x) => (v.cls === 'logical' ? String(x) : fmtReal(x, fmt, isInt(v.cls)))).join(' ')}]`;
    }
    return `${sizeStr(v.dims)} ${v.cls}`;
  }
  if (isString(v)) {
    if (v.data.length === 1) return v.data[0] == null ? '<missing>' : `"${v.data[0]}"`;
    return `${sizeStr(v.dims)} string`;
  }
  if (isCell(v)) return `${sizeStr(v.dims)} cell`;
  if (isStruct(v)) return `${sizeStr(v.dims)} struct`;
  if (v.cls === 'function_handle') return handleText(v);
  if (isObject(v)) return `${sizeStr(v.dims || [1, 1])} ${v.cls}`;
  return v.cls;
}

export function handleText(v) {
  if (v.text) return v.text;
  return '@' + (v.name || '');
}

function cellItem(v, fmt) {
  if (isTensor(v) && v.cls === 'char' && v.dims[0] <= 1) return `{'${charRows(v)[0] || ''}'}`;
  if (isTensor(v) && prod(v.dims) === 1) return `{[${brief(v, fmt)}]}`;
  if (isTensor(v) && prod(v.dims) === 0 && v.cls === 'double') return '{0' + TIMES + '0 double}';
  if (isString(v) && v.data.length === 1) return `{[${brief(v, fmt)}]}`;
  if (v.cls === 'function_handle') return `{${brief(v, fmt)}}`;
  return `{${sizeStr(v.dims || [1, 1])} ${v.cls}}`;
}

/** Text shown for `name = value` (without the trailing blank line logic). */
export function formatDisplay(name, v, fmt = {}, ctxObjDisplay) {
  const compact = fmt.spacing === 'compact';
  const nl = compact ? '\n' : '\n\n';
  const body = formatBody(v, fmt, ctxObjDisplay);
  if (body.inline !== undefined) return `${name} = ${body.inline}\n`;
  const lines = body.lines.join('\n');
  return `${name} =${nl}${lines}\n${compact ? '' : '\n'}`;
}

/** Text shown by disp(value). */
export function formatDisp(v, fmt = {}) {
  const body = formatBody(v, fmt);
  if (body.inline !== undefined) {
    if (isTensor(v) && v.cls === 'char') return body.raw + '\n';
    if (isString(v)) return (v.data[0] ?? '<missing>') + '\n';
    return '   ' + body.inline.replace(/^'|'$/g, '') + '\n';
  }
  return body.lines.map((l) => l.replace(/^ {2}/, '')).join('\n') + '\n';
}

function formatBody(v, fmt, objDisplay) {
  if (isSparse(v)) {
    const t = toTensor(v);
    const [m, n] = v.dims;
    const lines = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) { const x = t.re[i + j * m]; if (x !== 0) lines.push(`   (${i + 1},${j + 1})${' '.repeat(6)}${fmtReal(x, fmt)}`); }
    if (!lines.length) return { lines: [`   All zero sparse: ${sizeStr(v.dims)}`] };
    return { lines };
  }
  if (isTensor(v)) {
    const n = prod(v.dims);
    if (v.cls === 'char') {
      if (v.dims.length === 2 && v.dims[0] === 1) { const s = charRows(v)[0]; return { inline: `'${s}'`, raw: s }; }
      if (n === 0) return { inline: `0${TIMES}0 empty char array`.replace(/^0×0/, sizeStr(v.dims)), raw: '' };
      return { lines: [`  ${sizeStr(v.dims)} char array`, '', ...charRows(v).map((s) => `    '${s}'`)] };
    }
    if (n === 0) {
      if (v.cls === 'double' && v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0) return { inline: '[]' };
      return { inline: `${sizeStr(v.dims)} empty ${v.cls} ${v.dims.length === 2 && v.dims[0] === 1 ? 'row vector' : v.dims.length === 2 && v.dims[1] === 1 ? 'column vector' : 'array'}` };
    }
    if (n === 1 && v.cls !== 'logical' && !isInt(v.cls)) return { inline: v.im ? fmtComplex(v.re[0], v.im[0], fmt) : fmtReal(v.re[0], fmt) };
    const head = v.cls === 'logical' || isInt(v.cls) ? [`  ${v.cls}`, ''] : [];
    if (v.dims.length > 2) {
      const [m, nn] = v.dims;
      const pages = n / (m * nn);
      const lines = [];
      for (let p = 0; p < pages; p++) {
        const sub = { cls: v.cls, dims: [m, nn], re: v.re.subarray(p * m * nn, (p + 1) * m * nn), im: v.im ? v.im.subarray(p * m * nn, (p + 1) * m * nn) : null };
        const idx = []; let r = p; for (let k = 2; k < v.dims.length; k++) { idx.push(r % v.dims[k] + 1); r = Math.floor(r / v.dims[k]); }
        lines.push(`(:,:,${idx.join(',')}) =`, '', ...numericRows(sub, fmt), '');
      }
      lines.pop();
      return { lines: head.concat(lines) };
    }
    return { lines: head.concat(numericRows(v, fmt)) };
  }
  if (isString(v)) {
    if (v.data.length === 1) return { inline: v.data[0] == null ? '<missing>' : `"${v.data[0]}"` };
    const [m, n] = v.dims;
    const lines = [`  ${sizeStr(v.dims)} string array`, ''];
    if (v.dims.length === 2) for (let i = 0; i < m; i++) { const row = []; for (let j = 0; j < n; j++) { const s = v.data[i + j * m]; row.push(s == null ? '<missing>' : `"${s}"`); } lines.push('    ' + row.join('    ')); }
    return { lines };
  }
  if (isCell(v)) {
    const n = prod(v.dims);
    if (n === 0) return { inline: `{}`.replace('{}', v.dims[0] === 0 && v.dims[1] === 0 ? '{}' : `${sizeStr(v.dims)} empty cell array`) };
    const lines = [`  ${sizeStr(v.dims)} cell array`, ''];
    if (v.dims.length === 2) {
      const [m, nn] = v.dims;
      const items = [];
      let w = 0;
      for (let i = 0; i < m; i++) { const row = []; for (let j = 0; j < nn; j++) { const s = cellItem(v.data[i + j * m], fmt); row.push(s); w = Math.max(w, s.length); } items.push(row); }
      for (const row of items) lines.push('    ' + row.map((s) => s.padEnd(w)).join('    ').trimEnd());
    }
    return { lines };
  }
  if (isStruct(v)) {
    if (v.data.length === 1) {
      const rec = v.data[0];
      const w = Math.max(0, ...v.fields.map((f) => f.length));
      const lines = ['  struct with fields:', ''];
      for (const f of v.fields) lines.push(`    ${f.padStart(w)}: ${brief(rec[f], fmt)}`);
      if (!v.fields.length) lines.splice(0, 2, '  struct with no fields.');
      return { lines };
    }
    const lines = [`  ${sizeStr(v.dims)} struct array ${v.fields.length ? 'with fields:' : 'with no fields.'}`, ''];
    for (const f of v.fields) lines.push(`    ${f}`);
    return { lines };
  }
  if (v.cls === 'function_handle') return { lines: ['  function_handle with value:', '', '    ' + handleText(v)] };
  if (isObject(v)) {
    if (objDisplay) { const t = objDisplay(v); if (t != null) return { lines: t.replace(/\n$/, '').split('\n') }; }
    const props = v.props || {};
    const names = Object.keys(props).filter((k) => !k.startsWith('$'));
    const w = Math.max(0, ...names.map((f) => f.length));
    const lines = [`  ${v.cls} with properties:`, ''];
    for (const f of names) lines.push(`    ${f.padStart(w)}: ${brief(props[f], fmt)}`);
    if (!names.length) lines.splice(0, 2, `  ${v.cls} with no properties.`);
    return { lines };
  }
  return { inline: `<${v.cls}>` };
}
