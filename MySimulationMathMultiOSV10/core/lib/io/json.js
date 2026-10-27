// JSON: jsonencode / jsondecode and the JS helpers valueToJson / jsonToValue
// (also used by readstruct / writestruct).
import {
  E, S, str, num, bool, tensor, cell, struct, empty, stringArray, isStruct, isString, isChar, isCell,
  isTensor, isLogical, isSparse, toTensor, isTextArg, nameValues,
} from './util.js';

// ---------------------------------------------------------------- parser (keeps key order, accepts NaN/Infinity)

/** Parsed JSON object: an ordered list of [key, value] pairs. */
export class JsonObject { constructor(entries) { this.entries = entries; } }

export function parseJsonText(text) {
  const s = text; let p = 0;
  const fail = (msg) => { throw E('io:jsondecode:parseError', `JSON syntax error at character ${p + 1}: ${msg}`); };
  const ws = () => { while (p < s.length) { const c = s.charCodeAt(p); if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff) p++; else break; } };
  const value = () => {
    ws();
    const c = s[p];
    if (c === '{') {
      p++; const entries = []; ws();
      if (s[p] === '}') { p++; return new JsonObject(entries); }
      for (;;) {
        ws(); if (s[p] !== '"') fail('expected a string key');
        const k = string(); ws(); if (s[p] !== ':') fail("expected ':'"); p++;
        entries.push([k, value()]); ws();
        if (s[p] === ',') { p++; continue; }
        if (s[p] === '}') { p++; return new JsonObject(entries); }
        fail("expected ',' or '}'");
      }
    }
    if (c === '[') {
      p++; const arr = []; ws();
      if (s[p] === ']') { p++; return arr; }
      for (;;) {
        arr.push(value()); ws();
        if (s[p] === ',') { p++; continue; }
        if (s[p] === ']') { p++; return arr; }
        fail("expected ',' or ']'");
      }
    }
    if (c === '"') return string();
    for (const [w, v] of [['true', true], ['false', false], ['null', null], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity]]) {
      if (s.startsWith(w, p)) { p += w.length; return v; }
    }
    const m = /-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/y; m.lastIndex = p;
    const r = m.exec(s); if (!r || !r[0]) fail('unexpected character');
    p = m.lastIndex; return Number(r[0]);
  };
  const string = () => {
    p++; let out = '';
    for (;;) {
      const q = s.indexOf('"', p); const b = s.indexOf('\\', p);
      if (q < 0) fail('unterminated string');
      if (b < 0 || q < b) { out += s.slice(p, q); p = q + 1; return out; }
      out += s.slice(p, b); p = b + 1;
      const e = s[p++];
      if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(p, p + 4), 16)); p += 4; } else out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"' })[e] ?? fail('bad escape');
    }
  };
  const v = value(); ws();
  if (p < s.length) fail('unexpected text after the JSON value');
  return v;
}

// ---------------------------------------------------------------- field names

const KEYWORDS = new Set(['break', 'case', 'catch', 'classdef', 'continue', 'else', 'elseif', 'end', 'for', 'function', 'global', 'if', 'otherwise', 'parfor', 'persistent', 'return', 'spmd', 'switch', 'try', 'while']);
/** Valid variable/field name with the usual rules (whitespace → capitalize next, invalid → '_', 'x' prefix). */
export function makeValidName(name) {
  let s = String(name);
  if (/^[A-Za-z]\w*$/.test(s) && !KEYWORDS.has(s)) return s.slice(0, 63);
  if (KEYWORDS.has(s)) return ('x' + s[0].toUpperCase() + s.slice(1)).slice(0, 63);
  s = s.replace(/\s+(\S)/g, (m, c) => c.toUpperCase()).replace(/\s+/g, '');
  s = s.replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z]/.test(s)) s = 'x' + s;
  return s.slice(0, 63);
}
function uniqueNames(names) {
  const seen = new Set(); const out = [];
  for (const n of names) {
    let x = n; let k = 1;
    while (seen.has(x)) x = `${n}_${k++}`;
    seen.add(x); out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------- JSON → Value

const isObj = (x) => x instanceof JsonObject || (x !== null && typeof x === 'object' && !Array.isArray(x) && !x.cls);
const entriesOf = (x) => (x instanceof JsonObject ? x.entries : Object.entries(x));

function objToStruct(o, opts) {
  const ents = entriesOf(o);
  const names = opts.makeValid ? uniqueNames(ents.map(([k]) => makeValidName(k))) : ents.map(([k]) => k);
  const r = Object.create(null);
  ents.forEach(([, v], i) => { r[names[i]] = toValue(v, opts); });
  return { fields: names, rec: r };
}

function toValue(x, opts) {
  if (x === null || x === undefined) return empty();
  if (typeof x === 'number') return num(x);
  if (typeof x === 'boolean') return bool(x);
  if (typeof x === 'string') return str(x);
  if (Array.isArray(x)) return arrayValue(x, opts);
  if (isObj(x)) { const { fields, rec } = objToStruct(x, opts); return struct([1, 1], fields, [rec]); }
  throw E('io:jsondecode:badValue', 'Unsupported JSON value.');
}

function arrayValue(a, opts) {
  const n = a.length;
  if (n === 0) return empty();
  if (a.every((x) => typeof x === 'number' || x === null) && a.some((x) => typeof x === 'number')) return tensor('double', [n, 1], a.map((x) => (x === null ? NaN : x)));
  if (a.every((x) => typeof x === 'boolean')) return tensor('logical', [n, 1], a.map(Number));
  if (a.every((x) => Array.isArray(x) && x.length > 0)) {
    const kids = a.map((x) => arrayValue(x, opts));
    const k0 = kids[0];
    if (isTensor(k0) && kids.every((k) => k.cls === k0.cls && k.dims.length === k0.dims.length && k.dims.every((d, i) => d === k0.dims[i]))) {
      const cd = k0.dims.length === 2 && k0.dims[1] === 1 ? [k0.dims[0]] : k0.dims;
      const m = k0.re.length;
      const re = new Float64Array(n * m);
      kids.forEach((k, i) => { for (let j = 0; j < m; j++) re[i + n * j] = k.re[j]; });
      return tensor(k0.cls, [n, ...cd], re);
    }
    return cell([n, 1], kids);
  }
  if (a.every(isObj)) {
    const conv = a.map((o) => objToStruct(o, opts));
    const f0 = conv[0].fields;
    if (conv.every((c) => c.fields.length === f0.length && c.fields.every((f, i) => f === f0[i]))) return struct([n, 1], f0, conv.map((c) => c.rec));
    return cell([n, 1], conv.map((c) => struct([1, 1], c.fields, [c.rec])));
  }
  return cell([n, 1], a.map((x) => toValue(x, opts)));
}

/** Value from a parsed JSON value (JsonObject or plain JS objects). */
export const jsonToValue = (obj, opts = {}) => toValue(obj, { makeValid: opts.makeValidName !== false });

// ---------------------------------------------------------------- Value → JSON

const fmtNum = (x, opts) => {
  if (!Number.isFinite(x)) {
    if (opts.convertInfAndNaN) return 'null';
    return Number.isNaN(x) ? 'NaN' : x > 0 ? 'Infinity' : '-Infinity';
  }
  if (Number.isInteger(x)) return String(x);
  return String(Number(x.toPrecision(15)));
};
const quote = (s) => JSON.stringify(s);

/** Builds a JSON-like tree: {k:'arr', items} | {k:'obj', entries} | {k:'lit', text}. */
function enc(v, opts) {
  if (v == null) return { k: 'lit', text: 'null' };
  if (isSparse(v)) v = toTensor(v);
  if (isChar(v)) {
    const [m, nn] = v.dims;
    if (v.dims.length === 2 && m <= 1) return { k: 'lit', text: quote(S(v)) };
    const rows = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < nn; j++) s += String.fromCharCode(v.re[i + j * m]); rows.push({ k: 'lit', text: quote(s) }); }
    return { k: 'arr', items: rows };
  }
  if (isString(v)) {
    const items = v.data.map((s) => ({ k: 'lit', text: s == null ? 'null' : quote(s) }));
    return v.data.length === 1 ? items[0] : shape(v.dims, items);
  }
  if (isTensor(v)) {
    if (v.im) throw E('io:jsonencode:complex', 'Complex numbers cannot be encoded as JSON.');
    const lit = isLogical(v) ? (x) => (x ? 'true' : 'false') : (x) => fmtNum(x, opts);
    const items = Array.from(v.re, (x) => ({ k: 'lit', text: lit(x) }));
    if (items.length === 1) return items[0];
    return shape(v.dims, items);
  }
  if (isCell(v)) return { k: 'arr', items: v.data.map((x) => enc(x, opts)) };
  if (isStruct(v)) {
    const objs = v.data.map((r) => ({ k: 'obj', entries: v.fields.map((f) => [f, enc(r[f], opts)]) }));
    if (objs.length === 1) return objs[0];
    return shape(v.dims, objs);
  }
  if (v.cls === 'function_handle') throw E('io:jsonencode:unsupported', 'Function handles cannot be encoded as JSON.');
  if (v.isObject && v.props && typeof v.props === 'object') {
    const entries = Object.entries(v.props).filter(([, x]) => x && x.cls).map(([k, x]) => [k, enc(x, opts)]);
    return { k: 'obj', entries };
  }
  throw E('io:jsonencode:unsupported', `Values of class ${v.cls} cannot be encoded as JSON.`);
}
/** Vectors → flat array; matrices/N-d → nested arrays with the first dimension outermost. */
function shape(dims, items) {
  const n = items.length;
  if (n === 0) return { k: 'arr', items: [] };
  const nonSingle = dims.filter((d) => d !== 1).length;
  if (dims.length === 2 && nonSingle <= 1) return { k: 'arr', items };
  const rec = (level, offset, stride) => {
    if (level === dims.length) return items[offset];
    const out = [];
    for (let i = 0; i < dims[level]; i++) out.push(rec(level + 1, offset + i * stride, stride * dims[level]));
    return { k: 'arr', items: out };
  };
  return rec(0, 0, 1);
}

function render(t, pretty, depth = 0) {
  if (t.k === 'lit') return t.text;
  const pad = pretty ? '\n' + '  '.repeat(depth + 1) : '';
  const end = pretty ? '\n' + '  '.repeat(depth) : '';
  if (t.k === 'arr') {
    if (!t.items.length) return '[]';
    return '[' + t.items.map((x) => pad + render(x, pretty, depth + 1)).join(',') + end + ']';
  }
  if (!t.entries.length) return '{}';
  return '{' + t.entries.map(([k, x]) => pad + quote(k) + (pretty ? ': ' : ':') + render(x, pretty, depth + 1)).join(',') + end + '}';
}

/** JSON text of a Value. opts: { pretty, convertInfAndNaN = true } */
export function valueToJson(v, opts = {}) {
  const o = { convertInfAndNaN: opts.convertInfAndNaN !== false };
  if (isTensor(v) && v.re.length === 0 && !isChar(v)) return '[]';
  if (isStruct(v) && v.data.length === 0) return '[]';
  return render(enc(v, o), !!opts.pretty);
}

const truthy = (v) => (isTextArg(v) ? ['true', 'on', 'yes', '1'].includes(S(v).toLowerCase()) : !!toTensor(v).re[0]);

export const builtins = {
  jsonencode(args) {
    if (!args.length) throw E('io:jsonencode:nargin', 'jsonencode requires an input value.');
    const o = nameValues(args, 1);
    for (const k of Object.keys(o)) if (k !== 'prettyprint' && k !== 'convertinfandnan') throw E('io:unknownOption', `Unknown option '${k}'.`);
    return str(valueToJson(args[0], { pretty: o.prettyprint ? truthy(o.prettyprint) : false, convertInfAndNaN: o.convertinfandnan ? truthy(o.convertinfandnan) : true }));
  },
  jsondecode(args) {
    if (!args.length) throw E('io:jsondecode:nargin', 'jsondecode requires JSON text.');
    if (!isTextArg(args[0])) throw E('io:jsondecode:notText', 'The input must be a character vector or string scalar.');
    const o = nameValues(args, 1);
    const mvn = o.makevalidname ? truthy(o.makevalidname) : true;
    return jsonToValue(parseJsonText(S(args[0])), { makeValidName: mvn });
  },
};

export const help = {
  jsonencode: {
    en: "Encode a value as JSON text. Numeric arrays become (nested) arrays, structs objects, cells arrays; NaN and Inf become null unless 'ConvertInfAndNaN' is false. 'PrettyPrint', true indents the text.",
    ko: "값을 JSON 텍스트로 인코딩합니다. 숫자 배열은 (중첩) 배열, 구조체는 객체, 셀은 배열이 됩니다. 'ConvertInfAndNaN' 이 false 가 아니면 NaN·Inf 는 null 이 됩니다. 'PrettyPrint', true 는 들여쓰기합니다.",
    syntax: ['txt = jsonencode(data)', "txt = jsonencode(data, 'PrettyPrint', true)", "txt = jsonencode(data, 'ConvertInfAndNaN', false)"],
  },
  jsondecode: {
    en: "Decode JSON text. Numeric arrays become column vectors or matrices, objects become structs (field names made valid), arrays of objects with the same fields become struct arrays, mixed arrays become cell arrays, null becomes [].",
    ko: 'JSON 텍스트를 디코딩합니다. 숫자 배열은 열 벡터나 행렬, 객체는 구조체(유효한 필드 이름으로 변환), 필드가 같은 객체 배열은 구조체 배열, 섞인 배열은 셀형 배열, null 은 [] 이 됩니다.',
    syntax: ['val = jsondecode(txt)', "val = jsondecode(txt, 'MakeValidName', false)"],
  },
};

void stringArray;
