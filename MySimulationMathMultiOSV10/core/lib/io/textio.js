// Text file I/O: fgetl fgets fscanf sscanf textscan fileread readlines
// writelines type. The scanners are shared with delimited.js.
import {
  E, S, N, str, num, tensor, cell, stringArray, isTextArg, isText, isChar, isString, isCell, toTensor,
  absPath, readFileBytes, writeFileBytes, bytesToText, encodeText, decodeText, utf8Encode, strList,
  findFile, nameValues, optBool,
} from './util.js';
import { getFile, parseSizeArg, shapeOutput, writeTextFid } from './files.js';
import { saturate } from '../../value.js';

// ---------------------------------------------------------------- format parsing (scanf family)

/** Interprets backslash escapes of a format text. */
export function unescapeText(s) {
  return s.replace(/\\(x[0-9a-fA-F]+|[0-7]{1,3}|.)/g, (m, c) => {
    if (c[0] === 'x' && c.length > 1) return String.fromCharCode(parseInt(c.slice(1), 16));
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return ({ n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\' })[c] ?? c;
  });
}

/**
 * Format items: {kind:'ws'} | {kind:'lit', text} |
 * {kind:'conv', type, width, skip, bits, set, negate, prec}
 */
export function parseScanFormat(fmt, forTextscan = false) {
  const s = forTextscan ? fmt : unescapeText(fmt);
  const items = [];
  let i = 0;
  let lit = '';
  const flush = () => { if (lit) { items.push({ kind: 'lit', text: lit }); lit = ''; } };
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      flush();
      while (i < s.length && /\s/.test(s[i])) i++;
      if (!items.length || items[items.length - 1].kind !== 'ws') items.push({ kind: 'ws' });
      continue;
    }
    if (ch !== '%') { lit += ch; i++; continue; }
    if (s[i + 1] === '%') { lit += '%'; i += 2; continue; }
    flush();
    i++;
    const it = { kind: 'conv', skip: false, width: 0, bits: 0, prec: -1 };
    if (s[i] === '*') { it.skip = true; i++; }
    let w = '';
    while (i < s.length && /\d/.test(s[i])) w += s[i++];
    if (w) it.width = +w;
    if (s[i] === '.') { i++; let p = ''; while (i < s.length && /\d/.test(s[i])) p += s[i++]; it.prec = +p || 0; }
    if (/[lhL]/.test(s[i])) i++;
    const t = s[i++];
    if (t === undefined) throw E('io:scan:badFormat', 'Incomplete conversion at the end of the format.');
    if (t === '[') {
      let negate = false, set = '';
      if (s[i] === '^') { negate = true; i++; }
      if (s[i] === ']') { set += ']'; i++; }
      while (i < s.length && s[i] !== ']') set += s[i++];
      i++;
      Object.assign(it, { type: '[', set: expandSet(set), negate });
    } else if ('dioux'.includes(t) || 'feEgGn'.includes(t) || 'scqDCT'.includes(t)) {
      it.type = t === 'E' ? 'e' : t === 'G' ? 'g' : t;
      if (forTextscan && 'diufn'.includes(t)) { let b = ''; while (i < s.length && /\d/.test(s[i])) b += s[i++]; if (b) it.bits = +b; }
      if (forTextscan && (t === 'D' || t === 'T') && s[i] === '{') { while (i < s.length && s[i] !== '}') i++; i++; }
    } else throw E('io:scan:badFormat', `Unsupported conversion '%${t}' in the format.`);
    items.push(it);
  }
  flush();
  return items;
}
function expandSet(set) {
  const chars = new Set();
  for (let k = 0; k < set.length; k++) {
    if (set[k + 1] === '-' && k + 2 < set.length) {
      for (let c = set.charCodeAt(k); c <= set.charCodeAt(k + 2); c++) chars.add(String.fromCharCode(c));
      k += 2;
    } else chars.add(set[k]);
  }
  return chars;
}

const NUM_RE = /[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?|inf(?:inity)?|nan)/iy;
const isWsChar = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

/** Parses a number at pos (within `limit` chars). Returns [value, newPos] or null. */
export function scanNumber(text, pos, limit = 0, radix = 10) {
  const sub = limit ? text.slice(pos, pos + limit) : null;
  const src = sub ?? text;
  const p0 = sub ? 0 : pos;
  if (radix === 16) {
    const m = /[+-]?(?:0[xX])?[0-9a-fA-F]+/y; m.lastIndex = p0; const r = m.exec(src);
    if (!r) return null;
    return [parseInt(r[0].replace(/0[xX]/, ''), 16), pos + r[0].length];
  }
  if (radix === 8) {
    const m = /[+-]?[0-7]+/y; m.lastIndex = p0; const r = m.exec(src);
    if (!r) return null;
    return [parseInt(r[0], 8), pos + r[0].length];
  }
  NUM_RE.lastIndex = p0;
  const r = NUM_RE.exec(src);
  if (!r) return null;
  const t = r[0].toLowerCase().replace(/d/, 'e');
  let v;
  if (t.includes('inf')) v = t[0] === '-' ? -Infinity : Infinity;
  else if (t.includes('nan')) v = NaN;
  else v = parseFloat(t);
  return [v, pos + r[0].length];
}

// ---------------------------------------------------------------- sscanf core

/**
 * Runs a scanf format over text. Returns { values: number[], allText, count, pos, error }.
 * Text conversions contribute their character codes.
 */
export function scanText(text, fmt, maxCount = Infinity) {
  const items = parseScanFormat(fmt);
  const convs = items.filter((x) => x.kind === 'conv' && !x.skip);
  const allText = convs.length > 0 && convs.every((c) => 'sc['.includes(c.type));
  if (!items.some((x) => x.kind === 'conv')) return { values: [], allText, count: 0, pos: 0, error: '' };
  const values = [];
  let count = 0, pos = 0, error = '';
  const skipWs = () => { while (pos < text.length && isWsChar(text[pos])) pos++; };
  outer:
  for (;;) {
    const start = pos;
    for (const it of items) {
      if (count >= maxCount) break outer;
      if (it.kind === 'ws') { skipWs(); continue; }
      if (it.kind === 'lit') {
        if (text.startsWith(it.text, pos)) { pos += it.text.length; continue; }
        if (pos < text.length) error = 'Matching failure in format.';
        break outer;
      }
      const t = it.type;
      if (t === 'c') {
        const w = it.width || 1;
        if (pos >= text.length) break outer;
        const chunk = text.slice(pos, pos + w); pos += chunk.length;
        if (!it.skip) { for (const ch of chunk) values.push(ch.charCodeAt(0)); count++; }
        continue;
      }
      if (t === '[') {
        let q = pos;
        while (q < text.length && (it.width === 0 || q - pos < it.width) && it.set.has(text[q]) !== it.negate) q++;
        if (q === pos) { if (pos < text.length) error = 'Matching failure in format.'; break outer; }
        if (!it.skip) { for (let k = pos; k < q; k++) values.push(text.charCodeAt(k)); count++; }
        pos = q;
        continue;
      }
      skipWs();
      if (pos >= text.length) break outer;
      if (t === 's') {
        let q = pos;
        while (q < text.length && !isWsChar(text[q]) && (it.width === 0 || q - pos < it.width)) q++;
        if (!it.skip) { for (let k = pos; k < q; k++) values.push(text.charCodeAt(k)); count++; }
        pos = q;
        continue;
      }
      const r = scanNumber(text, pos, it.width, t === 'x' ? 16 : t === 'o' ? 8 : 10);
      if (!r) { error = 'Matching failure in format.'; break outer; }
      let v = r[0];
      if (t === 'i' && /^[+-]?0[xX]/.test(text.slice(pos, r[1] + 2))) {
        const h = scanNumber(text, pos, it.width, 16); if (h) { v = h[0]; r[1] = h[1]; }
      }
      pos = r[1];
      if (!it.skip) { values.push(v); count++; }
    }
    if (pos === start || pos >= text.length) {
      // run the trailing literals/ws once more cannot consume anything: stop
      if (pos >= text.length || pos === start) break;
    }
  }
  return { values, allText, count, pos, error };
}

function scanResult(r, sizeArg, nargout) {
  const sz = parseSizeArg(sizeArg);
  let vals = r.values;
  if (sz.count !== Infinity && vals.length > sz.count) vals = vals.slice(0, sz.count);
  let A;
  if (r.allText) {
    if (sizeArg === undefined) A = vals.length ? tensor('char', [1, vals.length], vals) : str('');
    else A = shapeOutput(vals, sz, 'char');
  } else {
    if (sizeArg === undefined) A = tensor('double', [vals.length, vals.length ? 1 : 0], vals);
    else A = shapeOutput(vals, sz, 'double');
  }
  return A;
}

function sscanf(args, nargout) {
  if (args.length < 2) throw E('io:sscanf:notEnoughInputs', 'Not enough input arguments.');
  const text = textOfValue(args[0]);
  const fmt = S(args[1], 'Format');
  const sz = args[2];
  const maxc = sz === undefined ? Infinity : parseSizeArg(sz).count;
  const r = scanText(text, fmt, maxc);
  return [scanResult(r, sz, nargout), num(r.count), str(r.error), num(r.pos + 1)];
}
function textOfValue(v) {
  if (isChar(v)) { let s = ''; for (let k = 0; k < v.re.length; k++) s += String.fromCharCode(v.re[k]); return s; }
  return S(v);
}

// ---------------------------------------------------------------- file text helpers

/** Remaining text of an open file from its position; returns { text, byteOf(charPos) }. */
function fileRest(f) {
  const bytes = f.bytes().subarray(f.pos);
  const text = decodeText(bytes, f.encoding);
  const utf8 = /^utf-?8$/i.test(f.encoding);
  return {
    text,
    byteOf: (charPos) => (utf8 ? utf8Encode(text.slice(0, charPos)).length : encodeText(text.slice(0, charPos), f.encoding).length),
  };
}

function readLine(f, keepNewline, limit = Infinity) {
  f.checkRead();
  const b = f.bytes();
  if (f.pos >= f.len) { f.eofHit = true; return null; }
  let q = f.pos;
  while (q < f.len && b[q] !== 10) q++;
  const hasNl = q < f.len;
  const end = hasNl ? q + 1 : q;
  let line = decodeText(b.subarray(f.pos, keepNewline ? end : q), f.encoding);
  if (limit !== Infinity && line.length > limit) {
    line = line.slice(0, limit);
    f.pos += encodeText(line, f.encoding).length;
    return line;
  }
  f.pos = end;
  if (!keepNewline && line.endsWith('\r')) line = line.slice(0, -1);
  if (keepNewline && f.perm.text) line = line.replace(/\r\n$/, '\n');
  if (f.pos >= f.len && !hasNl) f.eofHit = true;
  return line;
}

function fgetl(args, nargout, ctx) {
  const f = getFile(ctx, args[0], 'fgetl');
  const line = readLine(f, false);
  if (line === null) return num(-1);
  return line.length ? str(line) : tensor('char', [1, 0]);
}
function fgets(args, nargout, ctx) {
  const f = getFile(ctx, args[0], 'fgets');
  const lim = args[1] !== undefined ? N(args[1]) : Infinity;
  const line = readLine(f, true, lim);
  if (line === null) return [num(-1), num(-1)];
  const m = /\r?\n$/.exec(line);
  return [line.length ? str(line) : tensor('char', [1, 0]), m ? tensor('double', [1, m[0].length], Array.from(m[0], (c) => c.charCodeAt(0))) : tensor('double', [0, 0])];
}

function fscanf(args, nargout, ctx) {
  if (args.length < 2) throw E('io:fscanf:notEnoughInputs', 'Not enough input arguments.');
  const f = getFile(ctx, args[0], 'fscanf');
  f.checkRead();
  const { text, byteOf } = fileRest(f);
  const sz = args[2];
  const maxc = sz === undefined ? Infinity : parseSizeArg(sz).count;
  const r = scanText(text, S(args[1], 'Format'), maxc);
  f.pos += byteOf(r.pos);
  if (f.pos >= f.len) f.eofHit = true;
  return [scanResult(r, sz, nargout), num(r.count), str(r.error)];
}

// ---------------------------------------------------------------- textscan

const TS_OPTS = ['delimiter', 'headerlines', 'endofline', 'whitespace', 'multipledelimsasone', 'collectoutput', 'commentstyle', 'returnonerror', 'emptyvalue', 'treatasempty', 'texttype', 'expchars', 'bufsize', 'readvariablenames', 'datelocale'];

/** Replaces comments with blanks (positions stay the same). */
function blankComments(text, style) {
  if (!style || !style.length) return text;
  const blank = (s) => s.replace(/[^\r\n]/g, ' ');
  if (style.length === 1) {
    const c = style[0];
    let out = '', i = 0;
    while (i < text.length) {
      const k = text.indexOf(c, i);
      if (k < 0) { out += text.slice(i); break; }
      let e = k; while (e < text.length && text[e] !== '\n' && text[e] !== '\r') e++;
      out += text.slice(i, k) + blank(text.slice(k, e)); i = e;
    }
    return out;
  }
  const [a, b] = style;
  let out = '', i = 0;
  while (i < text.length) {
    const k = text.indexOf(a, i);
    if (k < 0) { out += text.slice(i); break; }
    const e0 = text.indexOf(b, k + a.length);
    const e = e0 < 0 ? text.length : e0 + b.length;
    out += text.slice(i, k) + blank(text.slice(k, e)); i = e;
  }
  return out;
}

function tsColumnClass(it) {
  const t = it.type;
  if (t === 'f') return it.bits === 32 ? 'single' : 'double';
  if (t === 'n') return 'double';
  if (t === 'd' || t === 'i') return 'int' + (it.bits || 32);
  if (t === 'u') return 'uint' + (it.bits || 32);
  if (t === 'c') return 'char';
  return 'cell';
}

/**
 * The textscan engine. text → { cols: [{cls, values}], pos }.
 * opts: { delims: string[], ws: string, eol: string[]|null, multi, emptyValue, treatAsEmpty: string[], header, comment, repeat }
 */
export function textscanCore(text0, fmt, opts = {}) {
  const items = parseScanFormat(fmt || '%f', true);
  if (!items.some((x) => x.kind === 'conv')) throw E('io:textscan:badFormat', 'The format must contain at least one conversion.');
  const text = blankComments(text0, opts.comment);
  const delims = (opts.delims || []).slice().sort((a, b) => b.length - a.length);
  const delimMode = delims.length > 0;
  const ws = opts.ws ?? ' \b\t';
  const eols = opts.eol || ['\r\n', '\n', '\r'];
  const emptyValue = opts.emptyValue ?? NaN;
  const treat = new Set(opts.treatAsEmpty || []);
  const repeat = opts.repeat ?? Infinity;
  const isWs = (c) => ws.includes(c) && !delims.includes(c);
  const eolAt = (p) => { for (const e of eols) if (e && text.startsWith(e, p)) return e.length; return 0; };
  const delimAt = (p) => { for (const d of delims) if (text.startsWith(d, p)) return d.length; return 0; };
  const convItems = items.filter((x) => x.kind === 'conv');
  const cols = convItems.filter((x) => !x.skip).map((it) => ({ it, cls: tsColumnClass(it), values: [] }));
  const colOf = new Map(); { let k = 0; for (const it of convItems) if (!it.skip) colOf.set(it, cols[k++]); }
  let pos = 0;
  // header lines
  for (let h = 0; h < (opts.header || 0) && pos < text.length; h++) {
    while (pos < text.length && !eolAt(pos)) pos++;
    pos += eolAt(pos);
  }
  const skipWs = () => { while (pos < text.length && isWs(text[pos])) pos++; };
  const skipBlank = () => { for (;;) { skipWs(); const e = eolAt(pos); if (e) pos += e; else if (!delimMode && pos < text.length && /\s/.test(text[pos])) pos++; else break; } };
  const fieldEnd = (p) => { let q = p; while (q < text.length && !eolAt(q) && !delimAt(q)) q++; return q; };
  const readToken = () => {
    let q = pos;
    if (delimMode) q = fieldEnd(pos);
    else while (q < text.length && !isWs(text[q]) && !eolAt(q) && !/\s/.test(text[q])) q++;
    let tok = text.slice(pos, q);
    pos = q;
    if (delimMode) tok = tok.replace(new RegExp(`[${ws.replace(/[\]\\^-]/g, '\\$&')}]+$`), '');
    return tok;
  };
  let reps = 0;
  let stopped = false;
  while (reps < repeat && !stopped) {
    skipBlank();
    if (pos >= text.length) break;
    let firstField = true;
    let rowStart = pos;
    let rowEnded = false; // reached EOL / EOF in delimiter mode: the rest are empty
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.kind === 'ws') { if (!rowEnded) skipWs(); continue; }
      if (it.kind === 'lit') {
        if (rowEnded) continue;
        skipWs();
        if (text.startsWith(it.text, pos)) { pos += it.text.length; continue; }
        // a literal that is also a delimiter was consumed already
        if (delims.includes(it.text)) continue;
        stopped = true; break;
      }
      // separators
      if (!rowEnded && !firstField) {
        skipWs();
        if (delimMode) {
          const d = delimAt(pos);
          if (d) { pos += d; if (opts.multi) for (let d2; (d2 = delimAt(pos)) || isWs(text[pos] || 'x');) pos += d2 || 1; } else if (eolAt(pos) || pos >= text.length) rowEnded = true;
        }
      }
      firstField = false;
      const col = colOf.get(it);
      if (!rowEnded) {
        if (!delimMode) skipBlank(); else skipWs();
        if (pos >= text.length) { if (delimMode && pos > rowStart) rowEnded = true; else { stopped = true; break; } }
      }
      const atEmpty = rowEnded || (delimMode && (eolAt(pos) || delimAt(pos) || pos >= text.length));
      const t = it.type;
      if (t === 'c') {
        const w = it.width || 1;
        if (rowEnded) { if (col) col.values.push(' '.repeat(w)); continue; }
        const chunk = text.slice(pos, pos + w).padEnd(w, ' '); pos = Math.min(text.length, pos + w);
        if (col) col.values.push(chunk);
        continue;
      }
      if (t === 's' || t === 'q' || t === 'D' || t === 'C' || t === 'T' || t === '[') {
        let tok = '';
        if (!atEmpty) {
          if (t === 'q' && text[pos] === '"') {
            let q = pos + 1; let s = '';
            while (q < text.length) { if (text[q] === '"') { if (text[q + 1] === '"') { s += '"'; q += 2; continue; } q++; break; } s += text[q++]; }
            pos = q; tok = s;
          } else if (t === '[') {
            let q = pos; while (q < text.length && it.set.has(text[q]) !== it.negate && !eolAt(q)) q++; tok = text.slice(pos, q); pos = q;
          } else {
            tok = readToken();
            if (it.width && tok.length > it.width) { pos -= tok.length - it.width; tok = tok.slice(0, it.width); }
          }
        }
        if (col) col.values.push(tok);
        continue;
      }
      // numeric
      let v;
      if (atEmpty) v = emptyValue;
      else {
        let matched = false;
        for (const te of treat) if (te && text.startsWith(te, pos) && (delimMode ? fieldEnd(pos) === pos + te.length || /^\s*$/.test(text.slice(pos + te.length, fieldEnd(pos))) : true)) { pos += te.length; v = emptyValue; matched = true; break; }
        if (!matched) {
          const r = scanNumber(text, pos, it.width);
          if (!r) {
            if (delimMode && opts.returnOnError === false) { readToken(); v = emptyValue; } else { stopped = true; break; }
          } else {
            v = r[0]; pos = r[1];
            if (/^[ij]/.test(text[pos] || '') && delimMode) pos++;
          }
        }
      }
      if (col) col.values.push(v);
    }
    // in delimiter mode, a record ends at the line end: drop the rest of the line if the format is done
    if (!stopped && delimMode) { skipWs(); }
    reps++;
    if (pos === rowStart && !stopped) break;
  }
  return { cols, pos };
}

function tsCell(cols, collect) {
  const vals = cols.map((c) => {
    if (c.cls === 'cell') return { kind: 'cell', v: cell([c.values.length, 1], c.values.map((s) => str(s))) };
    if (c.cls === 'char') {
      const w = c.values.reduce((m, s) => Math.max(m, s.length), 0);
      const t = tensor('char', [c.values.length, w]);
      c.values.forEach((s, i) => { for (let j = 0; j < w; j++) t.re[i + j * c.values.length] = j < s.length ? s.charCodeAt(j) : 32; });
      return { kind: 'char', v: t };
    }
    const re = Float64Array.from(c.values, (x) => (c.cls === 'double' ? x : c.cls === 'single' ? Math.fround(x) : saturate(c.cls, x)));
    return { kind: c.cls, v: tensor(c.cls, [re.length, 1], re) };
  });
  if (!collect) return cell([1, vals.length], vals.map((x) => x.v));
  const groups = [];
  for (const x of vals) {
    const g = groups[groups.length - 1];
    if (g && g.kind === x.kind && x.kind !== 'char') g.items.push(x.v); else groups.push({ kind: x.kind, items: [x.v] });
  }
  return cell([1, groups.length], groups.map((g) => {
    if (g.items.length === 1) return g.items[0];
    const m = Math.max(...g.items.map((v) => v.dims[0]));
    if (g.kind === 'cell') {
      const data = [];
      for (const v of g.items) for (let i = 0; i < m; i++) data.push(v.data[i] || str(''));
      return cell([m, g.items.length], data);
    }
    const re = new Float64Array(m * g.items.length);
    g.items.forEach((v, j) => { for (let i = 0; i < m; i++) re[i + j * m] = i < v.re.length ? v.re[i] : (g.kind === 'double' || g.kind === 'single' ? NaN : 0); });
    return tensor(g.kind, [m, g.items.length], re);
  }));
}

/** Parses textscan name/value options into the engine's form. */
export function textscanOptions(o) {
  const out = {};
  if (o.delimiter !== undefined) out.delims = (isCell(o.delimiter) || isString(o.delimiter) ? strList(o.delimiter) : [S(o.delimiter)]).map(unescapeText).flatMap((d) => (d.length > 1 && !isCell(o.delimiter) && !isString(o.delimiter) ? [...d] : [d]));
  if (o.headerlines !== undefined) out.header = N(o.headerlines);
  if (o.endofline !== undefined) { const e = unescapeText(S(o.endofline)); out.eol = e ? [e] : ['\r\n', '\n', '\r']; }
  if (o.whitespace !== undefined) out.ws = unescapeText(S(o.whitespace));
  if (o.multipledelimsasone !== undefined) out.multi = optBool(o.multipledelimsasone);
  if (o.collectoutput !== undefined) out.collect = optBool(o.collectoutput);
  if (o.commentstyle !== undefined) out.comment = strList(o.commentstyle);
  if (o.returnonerror !== undefined) out.returnOnError = optBool(o.returnonerror);
  if (o.emptyvalue !== undefined) out.emptyValue = N(o.emptyvalue);
  if (o.treatasempty !== undefined) out.treatAsEmpty = strList(o.treatasempty);
  return out;
}

function textscan(args, nargout, ctx) {
  if (!args.length) throw E('io:textscan:notEnoughInputs', 'Not enough input arguments.');
  let src = args[0];
  let k = 1;
  let fmt = '%f';
  if (args[k] !== undefined && isTextArg(args[k]) && !TS_OPTS.includes(S(args[k]).toLowerCase())) fmt = S(args[k++]);
  let repeat = Infinity;
  if (args[k] !== undefined && !isTextArg(args[k])) { const r = Array.from(toTensor(args[k++]).re); repeat = r[0] < 0 ? Infinity : r[0]; }
  const o = nameValues(args, k);
  for (const key of Object.keys(o)) if (!TS_OPTS.includes(key)) throw E('io:textscan:unknownOption', `Unknown option '${key}'.`);
  const opts = textscanOptions(o);
  opts.repeat = repeat;
  let text, f = null, byteOf = null;
  if (isText(src)) text = textOfValue(src);
  else {
    f = getFile(ctx, src, 'textscan');
    f.checkRead();
    ({ text, byteOf } = fileRest(f));
  }
  const r = textscanCore(text, fmt, opts);
  let position;
  if (f) { f.pos += byteOf(r.pos); if (f.pos >= f.len) f.eofHit = true; position = f.pos; } else position = r.pos;
  return [tsCell(r.cols, !!opts.collect), num(position)];
}

// ---------------------------------------------------------------- whole files

function fileread(args, nargout, ctx) {
  if (!args.length) throw E('io:fileread:notEnoughInputs', 'Not enough input arguments.');
  const o = nameValues(args, 1);
  const bytes = readFileBytes(ctx, S(args[0], 'File name'), 'io:fileread:cannotOpenFile');
  const text = bytesToText(bytes, o.encoding ? S(o.encoding) : undefined);
  return text.length ? str(text) : tensor('char', [1, 0]);
}

export function splitLines(text, ending) {
  if (ending) return text.split(ending);
  return text.split(/\r\n|\n|\r/);
}

function readlines(args, nargout, ctx) {
  if (!args.length) throw E('io:readlines:notEnoughInputs', 'Not enough input arguments.');
  const o = nameValues(args, 1);
  const bytes = readFileBytes(ctx, S(args[0], 'File name'), 'io:readlines:cannotOpenFile');
  const text = bytesToText(bytes, o.encoding ? S(o.encoding) : undefined);
  let lines = splitLines(text, o.lineending ? unescapeText(S(o.lineending)) : null);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const wsRule = o.whitespacerule ? S(o.whitespacerule).toLowerCase() : 'preserve';
  if (wsRule === 'trim') lines = lines.map((l) => l.trim());
  else if (wsRule === 'trimleading') lines = lines.map((l) => l.trimStart());
  else if (wsRule === 'trimtrailing') lines = lines.map((l) => l.trimEnd());
  const er = o.emptylinerule ? S(o.emptylinerule).toLowerCase() : 'read';
  if (er === 'skip') lines = lines.filter((l) => l.length);
  else if (er === 'error' && lines.some((l) => !l.length)) throw E('io:readlines:emptyLine', 'The file contains an empty line.');
  return stringArray([lines.length, 1], lines);
}

function writelines(args, nargout, ctx) {
  if (args.length < 2) throw E('io:writelines:notEnoughInputs', 'Not enough input arguments.');
  const lines = strList(args[0]);
  const file = S(args[1], 'File name');
  const o = nameValues(args, 2);
  const ending = o.lineending ? unescapeText(S(o.lineending)) : '\n';
  const mode = o.writemode ? S(o.writemode).toLowerCase() : 'overwrite';
  const text = lines.map((l) => l + ending).join('');
  const bytes = encodeText(text, o.encoding ? S(o.encoding) : 'UTF-8');
  const p = absPath(ctx, file);
  if (mode === 'append') {
    let old = new Uint8Array(0);
    try { if (ctx.fs.exists(p)) old = ctx.fs.readBytes(p); } catch { /* new file */ }
    const all = new Uint8Array(old.length + bytes.length); all.set(old); all.set(bytes, old.length);
    writeFileBytes(ctx, p, all);
  } else writeFileBytes(ctx, p, bytes);
  return undefined;
}

function type(args, nargout, ctx) {
  let text = '';
  for (const a of args) {
    const name = S(a, 'File name');
    const p = findFile(ctx, name, ['.m']);
    if (!p) throw E('io:type:fileNotFound', `File '${name}' not found.`);
    const t = bytesToText(ctx.fs.readBytes(p));
    text += '\n' + t + (t.endsWith('\n') ? '' : '\n') + '\n';
  }
  if (nargout > 0) return str(text);
  ctx.out(text);
  return undefined;
}

// fprintf for files when the base library is not loaded (skipped when base defines fprintf).
function fprintfFallback(args, nargout, ctx) {
  let fid = 1, rest = args;
  if (args.length > 1 && !isText(args[0])) { fid = N(args[0]); rest = args.slice(1); }
  const fmt = unescapeText(S(rest[0], 'Format'));
  const vals = rest.slice(1).flatMap((v) => (isChar(v) ? [textOfValue(v)] : Array.from(toTensor(v).re)));
  let i = 0, out = '';
  const once = () => fmt.replace(/%(-?\d*)(?:\.(\d+))?([dfgsieuxc%])/g, (m, w, p, t) => {
    if (t === '%') return '%';
    const v = vals[i++]; if (v === undefined) return '';
    let s = typeof v === 'string' ? v : t === 'f' ? v.toFixed(p ? +p : 6) : t === 'e' ? v.toExponential(p ? +p : 6) : t === 's' || t === 'g' ? String(v) : String(Math.round(v));
    const wn = Math.abs(+w || 0); if (s.length < wn) s = w.startsWith('-') ? s.padEnd(wn) : s.padStart(wn);
    return s;
  });
  do { out += once(); } while (i < vals.length && i > 0);
  return num(writeTextFid(ctx, fid, out));
}

export const builtins = {
  fgetl, fgets, fscanf, sscanf, textscan, fileread, readlines, writelines, type,
  fprintf: fprintfFallback,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  fgetl: H('Read a line from a file, without the newline.', '파일에서 한 줄을 읽습니다 (줄바꿈 제외).', ['tline = fgetl(fileID)']),
  fgets: H('Read a line from a file, keeping the newline.', '파일에서 한 줄을 읽습니다 (줄바꿈 포함).', ['tline = fgets(fileID)', 'tline = fgets(fileID, nchar)', '[tline, ltout] = fgets(___)']),
  fscanf: H('Read formatted data from a text file.', '텍스트 파일에서 서식화된 데이터를 읽습니다.', ['A = fscanf(fileID, formatSpec)', 'A = fscanf(fileID, formatSpec, sizeA)', '[A, count, errmsg] = fscanf(___)']),
  sscanf: H('Read formatted data from text.', '텍스트에서 서식화된 데이터를 읽습니다.', ['A = sscanf(str, formatSpec)', 'A = sscanf(str, formatSpec, sizeA)', '[A, n, errmsg, nextindex] = sscanf(___)']),
  textscan: H('Read formatted data from a text file or text into a cell array.', '텍스트 파일이나 텍스트에서 서식화된 데이터를 셀형 배열로 읽습니다.', ['C = textscan(fileID, formatSpec)', 'C = textscan(fileID, formatSpec, N)', 'C = textscan(chr, formatSpec)', 'C = textscan(___, Name, Value)', '[C, position] = textscan(___)']),
  fileread: H('Read the contents of a file as text.', '파일 내용을 텍스트로 읽습니다.', ['text = fileread(filename)', "text = fileread(filename, 'Encoding', encoding)"]),
  readlines: H('Read the lines of a file as a string array.', '파일의 줄들을 string 배열로 읽습니다.', ['S = readlines(filename)', 'S = readlines(filename, Name, Value)']),
  writelines: H('Write text to a file, one line per element.', '텍스트를 원소마다 한 줄씩 파일에 씁니다.', ['writelines(lines, filename)', "writelines(lines, filename, 'WriteMode', 'append')"]),
  type: H('Display the contents of a file.', '파일 내용을 표시합니다.', ['type filename', 'type(filename)']),
  fprintf: H('Write formatted data to the Command Window or a file.', '서식화된 데이터를 명령 창이나 파일에 씁니다.', ['fprintf(formatSpec, A1, ..., An)', 'fprintf(fileID, formatSpec, A1, ..., An)']),
};
