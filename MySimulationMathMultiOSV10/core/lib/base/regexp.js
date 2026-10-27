// Regular expressions: regexp / regexpi / regexprep / regexptranslate.
// M-language patterns are translated to JS RegExp: '.' matches newlines by
// default (dotall), \< and \> word anchors, (?#comments), inline (?i) flags,
// \o{..} / \x{..} escapes, 'lineanchors', 'freespacing', 'emptymatch'.
import { tensor, prod, isString, isCell, isChar, struct, cell, stringArray, str, num, MError } from '../../value.js';
import { E, textArg, optArg, textList, dense } from './util.js';
import { unescapeFormat } from './fmt.js';

const charRow = (s) => (s.length === 0 ? tensor('char', [0, 0]) : str(s));
const charRowKeep = (s) => (s.length === 0 ? tensor('char', [1, 0]) : str(s));

/** Translates an M-language pattern into {source, flags, names}. */
export function translatePattern(pat, opts = {}) {
  let flags = 'gd';
  let ignoreCase = !!opts.ignoreCase, dotAll = opts.dotAll !== false, multiline = !!opts.lineAnchors, freeSpacing = !!opts.freeSpacing;
  let s = pat;
  // leading inline flags (?i) (?-i) (?s) (?-s) (?m) (?x)
  for (;;) {
    const m = /^\(\?([imsx-]+)\)/.exec(s);
    if (!m) break;
    let on = true;
    for (const c of m[1]) {
      if (c === '-') { on = false; continue; }
      if (c === 'i') ignoreCase = on;
      else if (c === 's') dotAll = on;
      else if (c === 'm') multiline = on;
      else if (c === 'x') freeSpacing = on;
    }
    s = s.slice(m[0].length);
  }
  let out = '';
  const names = [];
  let inClass = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === undefined) { out += '\\\\'; break; }
      if (!inClass && n === '<') { out += '\\b(?=\\w)'; i++; continue; }
      if (!inClass && n === '>') { out += '\\b(?<=\\w)'; i++; continue; }
      if (n === 'o') {
        let j = i + 2, digits = '';
        if (s[j] === '{') { const k = s.indexOf('}', j); digits = s.slice(j + 1, k); j = k + 1; } else { while (/[0-7]/.test(s[j] || '') && digits.length < 3) digits += s[j++]; }
        out += '\\u' + parseInt(digits || '0', 8).toString(16).padStart(4, '0');
        i = j - 1; continue;
      }
      if (n === 'x' && s[i + 2] === '{') {
        const k = s.indexOf('}', i + 2);
        const code = parseInt(s.slice(i + 3, k), 16);
        out += code > 0xffff ? String.fromCodePoint(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\u' + code.toString(16).padStart(4, '0');
        i = k; continue;
      }
      if (n === 'a') { out += '\\x07'; i++; continue; }
      if (n === 'e') { out += '\\x1b'; i++; continue; }
      out += c + n; i++; continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      out += c; continue;
    }
    if (c === '[') {
      inClass = true; out += c;
      if (s[i + 1] === '^') { out += '^'; i++; }
      if (s[i + 1] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (c === '(' && s[i + 1] === '?' && s[i + 2] === '#') { const k = s.indexOf(')', i); i = k < 0 ? s.length : k; continue; }
    if (c === '(' && s[i + 1] === '?' && s[i + 2] === '<' && s[i + 3] !== '=' && s[i + 3] !== '!') {
      const k = s.indexOf('>', i);
      names.push(s.slice(i + 3, k));
    }
    if (freeSpacing && /\s/.test(c)) continue;
    if (freeSpacing && c === '#') { while (i < s.length && s[i] !== '\n') i++; continue; }
    out += c;
  }
  if (ignoreCase) flags += 'i';
  if (dotAll) flags += 's';
  if (multiline) flags += 'm';
  return { source: out, flags, names };
}

function compile(pat, opts, fname) {
  const t = translatePattern(pat, opts);
  try { return { re: new RegExp(t.source, t.flags), names: t.names }; } catch (e) {
    throw E(`base:${fname}:invalidPattern`, `Invalid regular expression: ${e.message.replace(/^Invalid regular expression: /, '')}`);
  }
}

const OUTPUT_KEYS = ['start', 'end', 'tokenextents', 'match', 'tokens', 'names', 'split'];

function parseOptions(args, start, fname) {
  const o = { order: [], once: false, ignoreCase: fname === 'regexpi', emptyMatch: false, dotAll: true, lineAnchors: false, freeSpacing: false, forceCell: false };
  for (let i = start; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === null) throw E(`base:${fname}:invalidOption`, 'Options must be character vectors or strings.');
    if (OUTPUT_KEYS.includes(s)) o.order.push(s);
    else if (s === 'once') o.once = true;
    else if (s === 'ignorecase') o.ignoreCase = true;
    else if (s === 'matchcase') o.ignoreCase = false;
    else if (s === 'emptymatch') o.emptyMatch = true;
    else if (s === 'noemptymatch') o.emptyMatch = false;
    else if (s === 'dotall') o.dotAll = true;
    else if (s === 'dotexceptnewline') o.dotAll = false;
    else if (s === 'lineanchors') o.lineAnchors = true;
    else if (s === 'stringanchors') o.lineAnchors = false;
    else if (s === 'freespacing') o.freeSpacing = true;
    else if (s === 'literalspacing') o.freeSpacing = false;
    else if (s === 'forcecelloutput') o.forceCell = true;
    else if (s === 'warnings') { /* ignored */ } else throw E(`base:${fname}:invalidOption`, `Invalid option '${textArg(args[i])}'.`);
  }
  return o;
}

/** All matches of a compiled pattern in s. */
function allMatches(re, s, emptyMatch, once) {
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[0].length === 0) {
      if (emptyMatch) out.push(m);
      re.lastIndex = m.index + 1;
      if (re.lastIndex > s.length) break;
    } else out.push(m);
    if (once && out.length) break;
  }
  return out;
}

function regexpOne(s, pat, o, asString, fname) {
  const { re, names } = compile(pat, o, fname);
  const ms = allMatches(re, s, o.emptyMatch, o.once);
  const txt = (x) => (asString ? stringArray([1, 1], [x]) : charRowKeep(x));
  const txtList = (list) => (asString ? stringArray([1, list.length], list) : cell([1, list.length], list.map(charRowKeep)));
  const ngroups = ms.length ? ms[0].length - 1 : new RegExp(re.source + '|', re.flags.replace('g', '')).exec('').length - 1;
  const tokenOf = (m) => {
    if (ngroups === 0) return [m[0]];
    const t = [];
    for (let g = 1; g <= ngroups; g++) t.push(m[g] === undefined ? '' : m[g]);
    return t;
  };
  const extOf = (m) => {
    if (ngroups === 0) return [[m.index + 1, m.index + m[0].length]];
    const e = [];
    for (let g = 1; g <= ngroups; g++) { const ix = m.indices[g]; e.push(ix ? [ix[0] + 1, ix[1]] : [m.index + 1, m.index]); }
    return e;
  };
  const res = {};
  const starts = ms.map((m) => m.index + 1), ends = ms.map((m) => m.index + m[0].length);
  if (o.once) {
    const m = ms[0];
    res.start = m ? num(starts[0]) : tensor('double', [1, 0]);
    res.end = m ? num(ends[0]) : tensor('double', [1, 0]);
    res.match = m ? txt(m[0]) : (asString ? stringArray([0, 0], []) : tensor('char', [0, 0]));
    if (m) { const tk = tokenOf(m); res.tokens = txtList(tk); } else res.tokens = cell([0, 0], []);
    if (m) { const ex = extOf(m); res.tokenextents = tensor('double', [ex.length, 2], [...ex.map((e) => e[0]), ...ex.map((e) => e[1])]); } else res.tokenextents = tensor('double', [0, 0]);
  } else {
    res.start = tensor('double', [1, ms.length], starts);
    res.end = tensor('double', [1, ms.length], ends);
    res.match = asString ? stringArray([1, ms.length], ms.map((m) => m[0])) : cell([1, ms.length], ms.map((m) => charRowKeep(m[0])));
    res.tokens = cell([1, ms.length], ms.map((m) => txtList(tokenOf(m))));
    res.tokenextents = cell([1, ms.length], ms.map((m) => { const ex = extOf(m); return tensor('double', [ex.length, 2], [...ex.map((e) => e[0]), ...ex.map((e) => e[1])]); }));
  }
  // names
  if (names.length === 0) res.names = struct([1, 1], [], [Object.create(null)]);
  else {
    const recs = (o.once ? ms.slice(0, 1) : ms).map((m) => { const r = Object.create(null); for (const n of names) r[n] = txt(m.groups && m.groups[n] !== undefined ? m.groups[n] : ''); return r; });
    res.names = recs.length === 0 ? struct([0, 0], names, []) : struct([1, recs.length], names, recs);
  }
  // split
  const pieces = []; let last = 0;
  for (const m of ms) { pieces.push(s.slice(last, m.index)); last = m.index + m[0].length; }
  pieces.push(s.slice(last));
  res.split = asString ? stringArray([1, pieces.length], pieces) : cell([1, pieces.length], pieces.map(charRowKeep));
  return res;
}

function regexpFn(fname) {
  return (args, nargout) => {
    if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    const o = parseOptions(args, 2, fname);
    const order = o.order.length ? o.order.concat(OUTPUT_KEYS.filter((k) => !o.order.includes(k))) : OUTPUT_KEYS;
    const nout = Math.max(1, nargout);
    const S = args[0], P = args[1];
    const sScalar = (isChar(S) && S.dims[0] <= 1) || (isString(S) && S.data.length === 1);
    const pScalar = (isChar(P) && P.dims[0] <= 1) || (isString(P) && P.data.length === 1);
    const asString = isString(S);
    if (sScalar && pScalar && !o.forceCell) {
      const r = regexpOne(textArg(S) ?? '', textArg(P), o, asString, fname);
      const out = order.slice(0, nout).map((k) => r[k]);
      return nout === 1 ? out[0] : out;
    }
    const SL = textList(S, fname), PL = textList(P, fname);
    const n = Math.max(SL.list.length, PL.list.length);
    if (SL.list.length !== 1 && PL.list.length !== 1 && SL.list.length !== PL.list.length) throw E(`base:${fname}:sizeMismatch`, 'Cell arrays must be the same size or one must be scalar.');
    const dims = SL.list.length !== 1 ? SL.dims : PL.dims;
    const results = [];
    for (let i = 0; i < n; i++) results.push(regexpOne(SL.list[SL.list.length === 1 ? 0 : i] || '', PL.list[PL.list.length === 1 ? 0 : i] || '', o, asString, fname));
    const out = order.slice(0, nout).map((k) => cell(sScalar && pScalar ? [1, 1] : dims, results.map((r) => r[k])));
    return nout === 1 ? out[0] : out;
  };
}

/** Converts an M replacement text to a JS replacement function. */
function replacer(rep, names, preserveCase) {
  const parts = [];
  let lit = '';
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c === '\\' && i + 1 < rep.length) {
      const n = rep[++i];
      const map = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', $: '$' };
      lit += map[n] !== undefined ? map[n] : n;
      continue;
    }
    if (c === '$' && i + 1 < rep.length) {
      const n = rep[i + 1];
      if (/\d/.test(n)) { if (lit) { parts.push(lit); lit = ''; } parts.push({ group: +n }); i++; continue; }
      if (n === '<') { const k = rep.indexOf('>', i); if (lit) { parts.push(lit); lit = ''; } parts.push({ name: rep.slice(i + 2, k) }); i = k; continue; }
    }
    lit += c;
  }
  if (lit) parts.push(lit);
  return (m) => {
    let s = '';
    for (const p of parts) {
      if (typeof p === 'string') s += p;
      else if (p.group !== undefined) s += p.group === 0 ? m[0] : m[p.group] === undefined ? '' : m[p.group];
      else s += m.groups && m.groups[p.name] !== undefined ? m.groups[p.name] : '';
    }
    if (preserveCase) {
      const src = m[0];
      if (src.length && src === src.toUpperCase() && src !== src.toLowerCase()) s = s.toUpperCase();
      else if (src.length && src === src.toLowerCase() && src !== src.toUpperCase()) s = s.toLowerCase();
      else if (src.length && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase()) s = s.charAt(0).toUpperCase() + s.slice(1);
    }
    return s;
  };
}

function regexprepOne(s, pats, reps, o, nth, preserveCase) {
  let cur = s;
  pats.forEach((p, k) => {
    const rep = reps.length === 1 ? reps[0] : reps[k];
    const { re, names } = compile(p, o, 'regexprep');
    const f = replacer(rep, names, preserveCase);
    const ms = allMatches(re, cur, o.emptyMatch, false);
    let out = '', last = 0, count = 0;
    for (const m of ms) {
      count++;
      if (o.once && count > 1) break;
      if (nth && count !== nth) continue;
      out += cur.slice(last, m.index) + f(m);
      last = m.index + m[0].length;
    }
    cur = out + cur.slice(last);
  });
  return cur;
}

function regexprepFn(args) {
  if (args.length < 3) throw E('base:regexprep:notEnoughInputs', 'Not enough input arguments.');
  const pats = textList(args[1], 'regexprep').list;
  const reps = textList(args[2], 'regexprep').list;
  if (reps.length !== 1 && reps.length !== pats.length) throw E('base:regexprep:sizeMismatch', 'The number of replacements must be one or match the number of expressions.');
  let nth = 0, preserveCase = false;
  const rest = [];
  for (let i = 3; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === null) { nth = dense(args[i], 'regexprep').re[0]; continue; }
    if (s === 'preservecase') { preserveCase = true; continue; }
    rest.push(args[i]);
  }
  const o = parseOptions(rest, 0, 'regexprep');
  const S = args[0];
  if (isChar(S) && S.dims[0] <= 1) return charRow(regexprepOne(textArg(S) ?? '', pats, reps, o, nth, preserveCase));
  if (isString(S)) return stringArray(S.dims, S.data.map((x) => (x == null ? null : regexprepOne(x, pats, reps, o, nth, preserveCase))));
  if (isCell(S)) return cell(S.dims, S.data.map((x) => { const t = textArg(x); if (t === null) throw E('base:regexprep:cellNotText', 'All cells must contain character vectors.'); return charRow(regexprepOne(t, pats, reps, o, nth, preserveCase)); }));
  throw E('base:regexprep:invalidInput', 'First input must be a character vector, string array, or cell array of character vectors.');
}

function regexptranslateFn(args) {
  if (args.length < 2) throw E('base:regexptranslate:notEnoughInputs', 'Not enough input arguments.');
  const op = optArg(args[0]);
  const f = (s) => {
    if (op === 'escape') return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (op === 'wildcard') return s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    if (op === 'flexible') return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    throw E('base:regexptranslate:invalidOperation', `Unknown translation type '${textArg(args[0])}'.`);
  };
  const v = args[1];
  if (isString(v)) return stringArray(v.dims, v.data.map((x) => (x == null ? null : f(x))));
  if (isCell(v)) return cell(v.dims, v.data.map((x) => charRowKeep(f(textArg(x)))));
  return charRowKeep(f(textArg(v) ?? ''));
}

export const builtins = {
  regexp: regexpFn('regexp'),
  regexpi: regexpFn('regexpi'),
  regexprep: regexprepFn,
  regexptranslate: regexptranslateFn,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  regexp: H('Match a regular expression (case sensitive).', '정규식 일치 (대소문자 구분).', ['startIndex = regexp(str, expression)', '[tokens, matches] = regexp(str, expression, \'tokens\', \'match\')', "out = regexp(str, expression, 'names')", "out = regexp(..., 'once')", "parts = regexp(str, expression, 'split')"]),
  regexpi: H('Match a regular expression (case insensitive).', '정규식 일치 (대소문자 무시).', ['startIndex = regexpi(str, expression)', "out = regexpi(str, expression, 'match')"]),
  regexprep: H('Replace text using a regular expression ($1, $<name> tokens).', '정규식으로 텍스트 바꾸기 ($1, $<name> 토큰).', ['newStr = regexprep(str, expression, replace)', "newStr = regexprep(..., 'once')", "newStr = regexprep(..., 'ignorecase')"]),
  regexptranslate: H('Translate text into a regular expression.', '텍스트를 정규식으로 변환.', ["s2 = regexptranslate('escape', s1)", "s2 = regexptranslate('wildcard', s1)"]),
};
void unescapeFormat; void prod;
