// Numeric / logical / char conversions and class predicates: double single
// int8..uint64 logical char cast typecast swapbytes, is* type tests.
import {
  INT_RANGE, tensor, normDims, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject,
  isFuncHandle, toTensor, num, bool, str, charMatrix, cast as vcast, MError,
} from '../../value.js';
import { E, finalize, textArg, optArg, isCellstr } from './util.js';

const isIntC = (c) => c in INT_RANGE;

/** Parses a text number like str2double ("1e3", "-Inf", "1,000", "3+4i"); NaN when invalid. Returns [re, im]. */
export function parseNumberText(s0) {
  if (s0 == null) return [NaN, 0];
  let s = String(s0).trim().replace(/,(?=\d{3}(\D|$))/g, '');
  if (!s) return [NaN, 0];
  const realRe = '[+-]?\\s*(?:(?:\\d+\\.?\\d*|\\.\\d+)(?:[eEdD][+-]?\\d+)?|inf|infinity|nan)';
  const low = s.toLowerCase();
  const toNum = (t) => {
    t = t.replace(/\s+/g, '').replace(/[dD]/, 'e');
    const tl = t.toLowerCase();
    const sign = tl.startsWith('-') ? -1 : 1;
    const body = tl.replace(/^[+-]/, '');
    if (body === 'inf' || body === 'infinity') return sign * Infinity;
    if (body === 'nan') return NaN;
    return Number(t);
  };
  let m = new RegExp(`^(${realRe})$`, 'i').exec(low);
  if (m) return [toNum(m[1]), 0];
  m = new RegExp(`^(${realRe})?\\s*([+-])?\\s*((?:(?:\\d+\\.?\\d*|\\.\\d+)(?:[eEdD][+-]?\\d+)?|inf|nan)?)\\s*\\*?\\s*[ij]$`, 'i').exec(low);
  if (m && (m[2] || !m[1])) {
    const re = m[1] ? toNum(m[1]) : 0;
    let imTxt = m[3] || '1';
    const im = (m[2] === '-' ? -1 : 1) * toNum(imTxt);
    if (!m[1] && !m[2] && m[3] === '') return [0, 1];
    return [re, im];
  }
  m = new RegExp(`^([ij])\\s*\\*?\\s*$`, 'i').exec(low);
  if (m) return [0, 1];
  return [NaN, 0];
}

/** Converts a value to a numeric/char/logical class (constructor functions). */
export function convertClass(v, cls, fname = cls) {
  if (v === undefined) return cls === 'logical' ? bool(false) : cls === 'char' ? str('') : tensor(cls, [0, 0]);
  if (isSparse(v)) v = toTensor(v);
  if (isTensor(v)) {
    if (v.cls === cls) return v;
    if (cls === 'logical') {
      if (v.cls === 'char') throw E('base:logical:char', 'Conversion to logical from char is not possible.');
      return vcast(v, 'logical');
    }
    if (cls === 'char') {
      if (v.im) throw E('base:char:complex', 'Conversion to char from complex is not possible.');
      const re = Float64Array.from(v.re, (x) => {
        if (x !== x) return 0;
        const r = x < 0 ? -Math.round(-x) : Math.round(x);
        return r < 0 ? 0 : r > 65535 ? 65535 : r;
      });
      return { cls: 'char', dims: v.dims, re, im: null };
    }
    if (isIntC(cls) && v.im) {
      return finalize(cls, v.dims, Float64Array.from(v.re), Float64Array.from(v.im));
    }
    return finalize(cls, v.dims, Float64Array.from(v.re), v.im ? Float64Array.from(v.im) : null);
  }
  if (isString(v)) {
    if (cls === 'double' || cls === 'single') {
      const re = new Float64Array(v.data.length), im = new Float64Array(v.data.length);
      v.data.forEach((s, i) => { const [a, b] = parseNumberText(s); re[i] = a; im[i] = b; });
      return finalize(cls, v.dims, re, im);
    }
    if (cls === 'char') {
      if (v.data.length === 1) return str(v.data[0] == null ? '' : v.data[0]);
      return charMatrix(v.data.map((s) => (s == null ? '' : s)));
    }
    throw E(`base:${fname}:invalidConversion`, `Conversion to ${cls} from string is not possible.`);
  }
  if (isCell(v)) {
    if (cls === 'char') {
      if (!isCellstr(v) && !v.data.every((x) => isString(x) && x.data.length === 1)) throw E('base:char:cellNotCellstr', 'Cell elements must be character arrays.');
      return charMatrix(v.data.map((x) => (isString(x) ? x.data[0] : String.fromCharCode(...x.re))));
    }
    throw E(`base:${fname}:invalidConversion`, `Conversion to ${cls} from cell is not possible.`);
  }
  if (isObject(v)) throw E(`base:${fname}:invalidConversion`, `Conversion to ${cls} from ${v.cls} is not possible.`);
  throw E(`base:${fname}:invalidConversion`, `Conversion to ${cls} from ${v.cls} is not possible.`);
}

function charFn(args) {
  if (args.length === 0) return str('');
  if (args.length === 1) return convertClass(args[0], 'char');
  // char(A, B, ...) → rows padded with blanks
  const lines = [];
  for (const a of args) {
    if (isCell(a)) { for (const x of a.data) lines.push(isString(x) ? x.data[0] : String.fromCharCode(...x.re)); continue; }
    if (isString(a)) { for (const s of a.data) lines.push(s == null ? '' : s); continue; }
    const c = convertClass(a, 'char');
    if (c.dims[0] <= 1) lines.push(String.fromCharCode(...c.re));
    else { const [m, n] = c.dims; for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(c.re[i + j * m]); lines.push(s); } }
  }
  return charMatrix(lines);
}

const BYTES = { double: 8, single: 4, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, int64: 8, uint64: 8 };
function writeEl(dv, off, cls, x) {
  switch (cls) {
    case 'double': dv.setFloat64(off, x, true); break;
    case 'single': dv.setFloat32(off, x, true); break;
    case 'int8': dv.setInt8(off, x); break;
    case 'uint8': dv.setUint8(off, x); break;
    case 'int16': dv.setInt16(off, x, true); break;
    case 'uint16': dv.setUint16(off, x, true); break;
    case 'int32': dv.setInt32(off, x, true); break;
    case 'uint32': dv.setUint32(off, x, true); break;
    case 'int64': dv.setBigInt64(off, BigInt(Math.round(x)), true); break;
    case 'uint64': dv.setBigUint64(off, BigInt(Math.round(x)), true); break;
    default: break;
  }
}
function readEl(dv, off, cls) {
  switch (cls) {
    case 'double': return dv.getFloat64(off, true);
    case 'single': return dv.getFloat32(off, true);
    case 'int8': return dv.getInt8(off);
    case 'uint8': return dv.getUint8(off);
    case 'int16': return dv.getInt16(off, true);
    case 'uint16': return dv.getUint16(off, true);
    case 'int32': return dv.getInt32(off, true);
    case 'uint32': return dv.getUint32(off, true);
    case 'int64': return Number(dv.getBigInt64(off, true));
    case 'uint64': return Number(dv.getBigUint64(off, true));
    default: return 0;
  }
}

function typecastFn(args) {
  if (args.length < 2) throw E('base:typecast:notEnoughInputs', 'Not enough input arguments.');
  const x = args[0];
  const cls = textArg(args[1]);
  if (!isTensor(x) || !(x.cls in BYTES)) throw E('base:typecast:wrongType', 'The first input argument must be a full, non-complex numeric value.');
  if (x.im) throw E('base:typecast:complex', 'The first input argument must be a full, non-complex numeric value.');
  if (!(cls in BYTES)) throw E('base:typecast:badClass', `Unsupported data type '${cls}'.`);
  const d = x.dims;
  if (!(d.length === 2 && (d[0] === 1 || d[1] === 1)) && x.re.length > 0) throw E('base:typecast:notVector', 'The first input argument must be a vector.');
  const nb = x.re.length * BYTES[x.cls];
  if (nb % BYTES[cls]) throw E('base:typecast:notEnoughInputElements', 'Too few input values to make output type.');
  const dv = new DataView(new ArrayBuffer(nb));
  for (let i = 0; i < x.re.length; i++) writeEl(dv, i * BYTES[x.cls], x.cls, x.re[i]);
  const n = nb / BYTES[cls];
  const re = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = readEl(dv, i * BYTES[cls], cls);
  return tensor(cls, d[0] === 1 || x.re.length === 0 ? [1, n] : [n, 1], re);
}

function swapbytesFn(args) {
  const x = args[0];
  if (!isTensor(x) || !(x.cls in BYTES)) throw E('base:swapbytes:invalidType', 'Input must be numeric.');
  const b = BYTES[x.cls];
  const dv = new DataView(new ArrayBuffer(b));
  const re = Float64Array.from(x.re, (v) => {
    writeEl(dv, 0, x.cls, v);
    const bytes = []; for (let i = 0; i < b; i++) bytes.push(dv.getUint8(i));
    bytes.reverse(); bytes.forEach((y, i) => dv.setUint8(i, y));
    return readEl(dv, 0, x.cls);
  });
  return tensor(x.cls, x.dims, re);
}

function castFn(args) {
  if (args.length < 2) throw E('base:cast:notEnoughInputs', 'Not enough input arguments.');
  let cls;
  if (args.length >= 3 && optArg(args[1]) === 'like') cls = args[2].cls;
  else cls = textArg(args[1]);
  if (cls === null) throw E('base:cast:invalidClass', 'The second input must be a class name.');
  if (!['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'logical', 'char'].includes(cls)) throw E('base:cast:unsupportedClass', `Unsupported data type '${cls}'.`);
  const r = convertClass(args[0], cls, 'cast');
  if (args.length >= 3 && args[2].im && !r.im && isTensor(r)) return { ...r, im: new Float64Array(r.re.length) };
  return r;
}

const ctor = (cls) => (args) => {
  if (args.length > 1) throw E(`base:${cls}:tooManyInputs`, 'Too many input arguments.');
  return convertClass(args[0], cls);
};

const pred = (f) => (args) => {
  if (args.length < 1) throw E('base:is:notEnoughInputs', 'Not enough input arguments.');
  return bool(!!f(args[0], args));
};

export const builtins = {
  double: ctor('double'),
  single: ctor('single'),
  int8: ctor('int8'), uint8: ctor('uint8'), int16: ctor('int16'), uint16: ctor('uint16'),
  int32: ctor('int32'), uint32: ctor('uint32'), int64: ctor('int64'), uint64: ctor('uint64'),
  logical(args) {
    if (args.length < 1) throw E('base:logical:notEnoughInputs', 'Not enough input arguments.');
    const v = args[0];
    if (isString(v) || isCell(v) || isStruct(v)) throw E('base:logical:invalidConversion', `Conversion to logical from ${v.cls} is not possible.`);
    return convertClass(v, 'logical');
  },
  char: charFn,
  cast: castFn,
  typecast: typecastFn,
  swapbytes: swapbytesFn,
  isnumeric: pred((v) => (isTensor(v) || isSparse(v)) && v.cls !== 'logical' && v.cls !== 'char'),
  isfloat: pred((v) => (isTensor(v) || isSparse(v)) && (v.cls === 'double' || v.cls === 'single')),
  isinteger: pred((v) => isTensor(v) && isIntC(v.cls)),
  islogical: pred((v) => (isTensor(v) || isSparse(v)) && v.cls === 'logical'),
  ischar: pred((v) => isChar(v)),
  iscell: pred((v) => isCell(v)),
  isstruct: pred((v) => isStruct(v)),
  isstring: pred((v) => isString(v)),
  isStringScalar: pred((v) => isString(v) && v.data.length === 1),
  iscellstr: pred((v) => isCellstr(v)),
  isfunction_handle: pred((v) => isFuncHandle(v)),
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
const conv = (c) => H(`Convert to ${c}.`, `${c} 형으로 변환.`, [`Y = ${c}(X)`]);
export const help = {
  double: H('Convert to double precision (text numbers in strings are parsed).', '배정밀도로 변환 (string의 숫자 텍스트는 해석).', ['Y = double(X)']),
  single: conv('single'),
  int8: conv('int8'), uint8: conv('uint8'), int16: conv('int16'), uint16: conv('uint16'),
  int32: conv('int32'), uint32: conv('uint32'), int64: conv('int64'), uint64: conv('uint64'),
  logical: H('Convert numeric values to logicals.', '숫자 값을 논리값으로 변환.', ['L = logical(A)']),
  char: H('Character array (from codes, strings, cell arrays or rows).', '문자형 배열 (코드, 문자열, 셀형 배열 또는 여러 행에서).', ['C = char(A)', 'C = char(A1, ..., An)']),
  cast: H('Convert variable to a different data type.', '변수를 다른 데이터형으로 변환.', ["B = cast(A, newclass)", "B = cast(A, 'like', p)"]),
  typecast: H('Convert data type without changing underlying bytes.', '내부 바이트를 바꾸지 않고 데이터형 변환.', ['Y = typecast(X, type)']),
  swapbytes: H('Swap byte ordering.', '바이트 순서 바꾸기.', ['Y = swapbytes(X)']),
  isnumeric: H('True for numeric arrays.', '숫자형 배열이면 참.', ['TF = isnumeric(A)']),
  isfloat: H('True for floating-point arrays.', '부동소수점 배열이면 참.', ['TF = isfloat(A)']),
  isinteger: H('True for integer-class arrays.', '정수형 배열이면 참.', ['TF = isinteger(A)']),
  islogical: H('True for logical arrays.', '논리형 배열이면 참.', ['TF = islogical(A)']),
  ischar: H('True for character arrays.', '문자형 배열이면 참.', ['TF = ischar(A)']),
  iscell: H('True for cell arrays.', '셀형 배열이면 참.', ['TF = iscell(A)']),
  isstruct: H('True for structure arrays.', '구조체 배열이면 참.', ['TF = isstruct(A)']),
  isstring: H('True for string arrays.', 'string 배열이면 참.', ['TF = isstring(A)']),
  isStringScalar: H('True for a string scalar.', 'string 스칼라이면 참.', ['TF = isStringScalar(A)']),
  iscellstr: H('True for cell arrays of character vectors.', '문자형 벡터로 된 셀형 배열이면 참.', ['TF = iscellstr(A)']),
  isfunction_handle: H('True for function handles.', '함수 핸들이면 참.', ['TF = isfunction_handle(A)']),
};
