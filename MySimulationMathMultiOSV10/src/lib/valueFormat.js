// Display of engine values (core/value.js shapes) in the Workspace and the
// Variable Editor. Pure functions (tested in test/app-gui.test.mjs).

const TENSOR = new Set(['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'logical', 'char']);

export const dimsText = (dims) => (Array.isArray(dims) ? dims.join('×') : '');
export const isNumericValue = (v) => !!v && TENSOR.has(v.cls) && v.cls !== 'char' && !v.sparse;
export const numelOf = (v) => (v && Array.isArray(v.dims) ? v.dims.reduce((a, b) => a * b, 1) : 0);

/** One number the way a grid cell shows it (format short-like). */
export function formatNumber(x, cls = 'double', format = 'short') {
  if (x == null || Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  if (cls === 'logical') return x ? '1' : '0';
  if (cls !== 'double' && cls !== 'single') return String(Math.trunc(x));
  if (Number.isInteger(x) && Math.abs(x) < 1e10) return String(x);
  const digits = format === 'long' ? (cls === 'single' ? 7 : 15) : 4;
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e5) return x.toFixed(digits);
  return x.toExponential(digits);
}

export function formatComplex(re, im, cls, format) {
  if (!im) return formatNumber(re, cls, format);
  const sign = im < 0 || Object.is(im, -0) ? '-' : '+';
  return `${formatNumber(re, cls, format)} ${sign} ${formatNumber(Math.abs(im), cls, format)}i`;
}

/** The value column of the Workspace when the engine sent no summary. */
export function valueSummary(v, format = 'short') {
  if (!v) return '';
  const n = numelOf(v);
  const dims = dimsText(v.dims);
  if (v.cls === 'char') {
    const s = v.re ? String.fromCharCode(...Array.from(v.re).slice(0, 200)) : '';
    return v.dims && v.dims[0] <= 1 ? `'${s}'` : `${dims} char`;
  }
  if (v.cls === 'string' && n === 1) return `"${v.data[0] == null ? '<missing>' : v.data[0]}"`;
  if (isNumericValue(v)) {
    if (n === 1) return formatComplex(v.re[0], v.im ? v.im[0] : 0, v.cls, format);
    if (n === 0) return '[]';
    if (n <= 10 && v.dims.length === 2 && (v.dims[0] === 1 || v.dims[1] === 1)) {
      const sep = v.dims[0] === 1 ? ' ' : ';';
      return `[${Array.from(v.re).map((x, i) => formatComplex(x, v.im ? v.im[i] : 0, v.cls, format)).join(sep)}]`;
    }
    return `${dims} ${v.cls}`;
  }
  if (v.cls === 'function_handle') return `@${v.name || ''}`;
  return `${dims} ${v.cls}`;
}

/** Rows × columns of a 2-D view of a value (page `page` of N-D arrays). */
export function gridShape(v) {
  const d = (v && v.dims) || [0, 0];
  return { rows: d[0] || 0, cols: d.length > 2 ? d.slice(1).reduce((a, b) => a * b, 1) : d[1] || 0 };
}

/** Text of cell (r, c), 0-based, column-major. */
export function cellText(v, r, c, format = 'short') {
  const { rows } = gridShape(v);
  const k = c * rows + r;
  if (!v) return '';
  if (v.cls === 'char') return String.fromCharCode(v.re[k]);
  if (isNumericValue(v)) return formatComplex(v.re[k], v.im ? v.im[k] : 0, v.cls, format);
  if (v.cls === 'string') return v.data[k] == null ? '<missing>' : v.data[k];
  if (v.cls === 'cell') { const x = v.data[k]; return x ? valueSummary(x, format) : ''; }
  if (v.cls === 'struct') return `1×1 struct`;
  return '';
}

/** Parses a typed cell value ("3.5", "-2e3", "1+2i", "Inf", "NaN") → { re, im } or null. */
export function parseCell(text) {
  const s = String(text).trim().replace(/\s+/g, '');
  if (!s) return { re: 0, im: 0 };
  const num = (t) => {
    if (/^[+-]?inf$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
    if (/^nan$/i.test(t)) return NaN;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
    return Number(t);
  };
  const m = /^(.*?)([+-][^+-]*?)?[ij]$/i.exec(s);
  if (m && m[0].length === s.length && /[ij]$/i.test(s)) {
    // "a+bi", "bi", "-i"
    if (m[2] !== undefined && m[1] !== '') {
      const re = num(m[1]);
      const imText = m[2] === '+' || m[2] === '-' ? `${m[2]}1` : m[2];
      const im = num(imText);
      if (re != null && im != null) return { re, im };
    }
    const only = s.slice(0, -1);
    const im = only === '' || only === '+' ? 1 : only === '-' ? -1 : num(only);
    if (im != null) return { re: 0, im };
    return null;
  }
  const re = num(s);
  return re == null ? null : { re, im: 0 };
}

/**
 * A copy of numeric value v with cell (r, c) set (0-based); grows the matrix
 * when the cell is outside (new cells are 0). Returns a plain value object.
 */
export function withCell(v, r, c, { re, im }) {
  const rows0 = v.dims[0];
  const cols0 = v.dims[1];
  const rows = Math.max(rows0, r + 1);
  const cols = Math.max(cols0, c + 1);
  const ReArr = v.re instanceof Float32Array ? Float32Array : Float64Array;
  const outRe = new ReArr(rows * cols);
  const needIm = !!v.im || (im && im !== 0);
  const outIm = needIm ? new Float64Array(rows * cols) : null;
  for (let j = 0; j < cols0; j++) {
    for (let i = 0; i < rows0; i++) {
      outRe[j * rows + i] = v.re[j * rows0 + i];
      if (outIm && v.im) outIm[j * rows + i] = v.im[j * rows0 + i];
    }
  }
  outRe[c * rows + r] = v.cls === 'logical' ? (re ? 1 : 0) : re;
  if (outIm) outIm[c * rows + r] = im || 0;
  const imOut = outIm && outIm.some((x) => x !== 0) ? outIm : null;
  return { ...v, dims: [rows, cols], re: outRe, im: imOut };
}
