'use strict';

// A YAML subset parser for lockfiles (pnpm-lock.yaml, pubspec.lock, yarn berry
// lock, pubspec.yaml). Handles block mappings, block sequences ("- x",
// "- key: value"), plain / single / double quoted scalars, flow mappings and
// sequences (possibly spanning lines), literal and folded block scalars and
// comments. Anchors, aliases, tags and multi-document streams are not
// supported (lockfiles do not use them). Plain scalars stay strings except
// null / true / false, so versions like 1.10 are never turned into numbers.

const { setLine } = require('./util');

function stripComment(raw) {
  let q = null;
  for (let k = 0; k < raw.length; k++) {
    const c = raw[k];
    if (q) {
      if (c === q) {
        if (q === "'" && raw[k + 1] === "'") { k++; continue; }
        q = null;
      } else if (c === '\\' && q === '"') k++;
      continue;
    }
    if ((c === '"' || c === "'") && (k === 0 || /[\s:[{,\-?]/.test(raw[k - 1]))) { q = c; continue; }
    if (c === '#' && (k === 0 || raw[k - 1] === ' ' || raw[k - 1] === '\t')) return raw.slice(0, k).replace(/\s+$/, '');
  }
  return raw.replace(/\s+$/, '');
}

function scalar(raw) {
  const v = raw.trim();
  if (v === '' || v === '~' || v === 'null' || v === 'Null' || v === 'NULL') return null;
  if (v === 'true' || v === 'True' || v === 'TRUE') return true;
  if (v === 'false' || v === 'False' || v === 'FALSE') return false;
  if (v[0] === '"' && v.endsWith('"') && v.length >= 2) return unDouble(v.slice(1, -1));
  if (v[0] === "'" && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function unDouble(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e) => {
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/' })[e] ?? e;
  });
}

// Flow collections: {a: b, c: [d, e]} and [x, "y"].
function parseFlow(src, lineNo) {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  function item(stop) {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const obj = {};
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return obj; }
        const k = atom(':,}');
        ws();
        let v = null;
        if (src[i] === ':') { i++; v = item(',}'); }
        obj[k] = v;
        setLine(obj, k, lineNo);
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return obj; }
        return obj;
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return arr; }
        arr.push(item(',]'));
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return arr; }
        return arr;
      }
    }
    return scalar(atomRaw(stop));
  }
  function atomRaw(stop) {
    ws();
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      let k = i + 1;
      while (k < src.length) {
        if (src[k] === '\\' && q === '"') { k += 2; continue; }
        if (src[k] === q) { if (q === "'" && src[k + 1] === "'") { k += 2; continue; } break; }
        k++;
      }
      const out = src.slice(i, k + 1);
      i = k + 1;
      return out;
    }
    let k = i;
    while (k < src.length) {
      const ch = src[k];
      if (stop.includes(ch)) {
        if (ch !== ':' || k + 1 >= src.length || /[\s,}\]]/.test(src[k + 1])) break;
      }
      k++;
    }
    const out = src.slice(i, k);
    i = k;
    return out;
  }
  function atom(stop) {
    const v = scalar(atomRaw(stop));
    return v === null ? '' : String(v);
  }
  return item('');
}

function flowBalanced(s) {
  let depth = 0;
  let q = null;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') k++; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return depth <= 0;
}

// Find the "key: value" split of a mapping line; returns null if not a pair.
function splitPair(content) {
  let k = 0;
  if (content[0] === '"' || content[0] === "'") {
    const q = content[0];
    k = 1;
    while (k < content.length) {
      if (content[k] === '\\' && q === '"') { k += 2; continue; }
      if (content[k] === q) { if (q === "'" && content[k + 1] === "'") { k += 2; continue; } break; }
      k++;
    }
    k++;
    while (content[k] === ' ') k++;
    if (content[k] !== ':') return null;
    return { key: String(scalar(content.slice(0, k).trim())), rest: content.slice(k + 1) };
  }
  if (content[0] === '?' && content[1] === ' ') return { key: content.slice(2).trim(), rest: '', complex: true };
  for (; k < content.length; k++) {
    if (content[k] === ':' && (k + 1 === content.length || content[k + 1] === ' ' || content[k + 1] === '\t')) {
      return { key: content.slice(0, k).trim(), rest: content.slice(k + 1) };
    }
  }
  return null;
}

function parseYaml(text) {
  const rawLines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (let n = 0; n < rawLines.length; n++) {
    const raw = rawLines[n];
    if (/^(---|\.\.\.)\s*$/.test(raw) || /^%/.test(raw)) continue;
    const content = stripComment(raw);
    if (!content.trim()) { lines.push({ blank: true, raw, line: n + 1 }); continue; }
    const indent = content.length - content.replace(/^ +/, '').length;
    lines.push({ indent, content: content.slice(indent), raw, line: n + 1 });
  }
  let p = 0;
  const nextReal = () => { while (p < lines.length && lines[p].blank) p++; return lines[p]; };

  function blockScalar(indicator, parentIndent) {
    const folded = indicator[0] === '>';
    const keep = indicator.includes('+');
    const strip = indicator.includes('-');
    const collected = [];
    let ind = -1;
    while (p < lines.length) {
      const l = lines[p];
      if (l.blank) { collected.push(''); p++; continue; }
      if (l.indent <= parentIndent) break;
      if (ind < 0) ind = l.indent;
      collected.push(l.raw.slice(Math.min(ind, l.indent)));
      p++;
    }
    while (!keep && collected.length && collected[collected.length - 1] === '') collected.pop();
    let out = folded ? collected.join(' ').replace(/ ?\n ?/g, '\n') : collected.join('\n');
    if (!strip) out += '\n';
    return out;
  }

  function inlineValue(rest, lineNo, parentIndent) {
    const v = rest.trim();
    if (v === '') return undefined;
    if (/^[|>][+-]?\d*$/.test(v)) return blockScalar(v, parentIndent);
    if (v[0] === '{' || v[0] === '[') {
      let src = v;
      while (!flowBalanced(src) && p < lines.length) {
        const l = lines[p++];
        if (!l.blank) src += ' ' + l.content;
      }
      return parseFlow(src, lineNo);
    }
    // Multi-line plain or quoted scalar continuation.
    let src = v;
    if ((v[0] === '"' && !/[^\\]"$|^""$/.test(v)) || (v[0] === "'" && !/'$/.test(v.slice(1)))) {
      while (p < lines.length) {
        const l = lines[p++];
        if (l.blank) { src += '\n'; continue; }
        src += ' ' + l.content;
        if (/["']$/.test(l.content)) break;
      }
    }
    return scalar(src);
  }

  function parseNode(indent) {
    const first = nextReal();
    if (!first || first.indent < indent) return null;
    if (first.content === '-' || first.content.startsWith('- ')) return parseSeq(first.indent);
    return parseMap(first.indent);
  }

  function parseSeq(indent) {
    const arr = [];
    for (;;) {
      const l = nextReal();
      if (!l || l.indent !== indent || !(l.content === '-' || l.content.startsWith('- '))) break;
      p++;
      const rest = l.content === '-' ? '' : l.content.slice(2);
      const itemIndent = indent + 2 + (rest.length - rest.replace(/^ +/, '').length);
      const restT = rest.trim();
      let val;
      if (restT === '') val = parseNode(indent + 1);
      else if (restT[0] !== '{' && restT[0] !== '[' && splitPair(restT)) {
        // "- key: value" opens a mapping whose indent is the item content column.
        lines.splice(p, 0, { indent: itemIndent, content: restT, raw: ' '.repeat(itemIndent) + restT, line: l.line });
        val = parseMap(itemIndent);
      } else if (restT.startsWith('- ')) {
        lines.splice(p, 0, { indent: itemIndent, content: restT, raw: ' '.repeat(itemIndent) + restT, line: l.line });
        val = parseSeq(itemIndent);
      } else val = inlineValue(restT, l.line, indent);
      arr.push(val === undefined ? null : val);
      setLine(arr, arr.length - 1, l.line);
    }
    return arr;
  }

  function parseMap(indent) {
    const obj = {};
    for (;;) {
      const l = nextReal();
      if (!l || l.indent !== indent) break;
      if (l.content === '-' || l.content.startsWith('- ')) break;
      const pair = splitPair(l.content);
      if (!pair) { p++; continue; }
      p++;
      let val = inlineValue(pair.rest, l.line, indent);
      if (val === undefined) {
        const nxt = nextReal();
        if (nxt && nxt.indent > indent) val = parseNode(indent + 1);
        else if (nxt && nxt.indent === indent && (nxt.content === '-' || nxt.content.startsWith('- '))) val = parseSeq(indent);
        else val = null;
      }
      obj[pair.key] = val;
      setLine(obj, pair.key, l.line);
    }
    return obj;
  }

  const result = parseNode(0);
  return result === null ? {} : result;
}

module.exports = { parseYaml, parseFlow };
