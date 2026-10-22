'use strict';

// A small TOML 1.0 parser, enough for Cargo.toml / Cargo.lock, pyproject.toml,
// poetry.lock and Pipfile. Supports tables, arrays of tables, dotted and quoted
// keys, basic / literal / multi-line strings, arrays (multi-line, trailing
// commas, comments), inline tables, booleans, integers and floats. Dates and
// times are returned as strings. Every key's line is recorded via util.LINES.

const { setLine } = require('./util');

function parseToml(text) {
  const s = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let i = 0;
  let line = 1;
  const root = {};
  let cur = root;

  const fail = (msg) => {
    const e = new Error(`TOML parse error at line ${line}: ${msg}`);
    e.line = line;
    throw e;
  };
  const skipInline = () => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    if (s[i] === '#') while (i < s.length && s[i] !== '\n') i++;
  };
  const skipAll = () => {
    for (;;) {
      skipInline();
      if (s[i] === '\n') { line++; i++; continue; }
      break;
    }
  };

  function basicString() {
    // s[i] === '"'
    if (s.startsWith('"""', i)) {
      i += 3;
      if (s[i] === '\n') { line++; i++; }
      let out = '';
      for (;;) {
        if (i >= s.length) fail('unterminated string');
        if (s.startsWith('"""', i)) {
          i += 3;
          while (s[i] === '"') { out += '"'; i++; }
          return out;
        }
        const c = s[i++];
        if (c === '\\') {
          if (s[i] === '\n' || /^[ \t]*\n/.test(s.slice(i, i + 40))) {
            while (i < s.length && /[ \t\n]/.test(s[i])) { if (s[i] === '\n') line++; i++; }
            continue;
          }
          out += escape();
        } else {
          if (c === '\n') line++;
          out += c;
        }
      }
    }
    i++;
    let out = '';
    for (;;) {
      if (i >= s.length || s[i] === '\n') fail('unterminated string');
      const c = s[i++];
      if (c === '"') return out;
      out += c === '\\' ? escape() : c;
    }
  }
  function escape() {
    const e = s[i++];
    if (e === 'u') { const h = s.slice(i, i + 4); i += 4; return String.fromCodePoint(parseInt(h, 16)); }
    if (e === 'U') { const h = s.slice(i, i + 8); i += 8; return String.fromCodePoint(parseInt(h, 16)); }
    return ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', e: '\x1b', '"': '"', '\\': '\\' })[e] ?? e;
  }
  function literalString() {
    if (s.startsWith("'''", i)) {
      i += 3;
      if (s[i] === '\n') { line++; i++; }
      const end = s.indexOf("'''", i);
      if (end < 0) fail('unterminated string');
      let stop = end;
      while (s[stop + 3] === "'") stop++;
      const out = s.slice(i, stop);
      for (const ch of out) if (ch === '\n') line++;
      i = stop + 3;
      return out;
    }
    i++;
    const end = s.indexOf("'", i);
    if (end < 0) fail('unterminated string');
    const out = s.slice(i, end);
    i = end + 1;
    return out;
  }

  function key() {
    const parts = [];
    for (;;) {
      skipInline();
      if (s[i] === '"') parts.push(basicString());
      else if (s[i] === "'") parts.push(literalString());
      else {
        const m = /^[A-Za-z0-9_-]+/.exec(s.slice(i, i + 256));
        if (!m) fail('expected key');
        parts.push(m[0]);
        i += m[0].length;
      }
      skipInline();
      if (s[i] === '.') { i++; continue; }
      return parts;
    }
  }

  function value() {
    skipInline();
    const c = s[i];
    if (c === '"') return basicString();
    if (c === "'") return literalString();
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        skipAll();
        if (s[i] === ']') { i++; return arr; }
        const l = line;
        arr.push(value());
        setLine(arr, arr.length - 1, l);
        skipAll();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return arr; }
        fail('expected , or ] in array');
      }
    }
    if (c === '{') {
      i++;
      const obj = {};
      skipInline();
      if (s[i] === '}') { i++; return obj; }
      for (;;) {
        skipAll();
        const l = line;
        const k = key();
        if (s[i] !== '=') fail('expected = in inline table');
        i++;
        assign(obj, k, value(), l);
        skipAll();
        if (s[i] === ',') { i++; skipAll(); if (s[i] === '}') { i++; return obj; } continue; }
        if (s[i] === '}') { i++; return obj; }
        fail('expected , or } in inline table');
      }
    }
    const m = /^[^\s,\]}#]+(?: [0-9]{2}:[0-9]{2}[^\s,\]}#]*)?/.exec(s.slice(i, i + 128));
    if (!m) fail('expected value');
    i += m[0].length;
    const raw = m[0];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^[+-]?(?:0|[1-9][0-9_]*)$/.test(raw)) return Number(raw.replace(/_/g, ''));
    if (/^0x[0-9a-fA-F_]+$/.test(raw)) return parseInt(raw.slice(2).replace(/_/g, ''), 16);
    if (/^[+-]?[0-9_]+(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?$/.test(raw)) return Number(raw.replace(/_/g, ''));
    if (/^[+-]?(inf|nan)$/.test(raw)) return raw.includes('nan') ? NaN : raw.startsWith('-') ? -Infinity : Infinity;
    return raw;
  }

  function descend(obj, k, l, forTable) {
    let next = obj[k];
    if (Array.isArray(next) && forTable) return next[next.length - 1];
    if (next === undefined) {
      next = {};
      obj[k] = next;
      setLine(obj, k, l);
    }
    if (typeof next !== 'object' || next === null) fail(`key ${k} is not a table`);
    return Array.isArray(next) ? next[next.length - 1] : next;
  }

  function assign(obj, parts, v, l) {
    let o = obj;
    for (let n = 0; n < parts.length - 1; n++) o = descend(o, parts[n], l, true);
    const last = parts[parts.length - 1];
    o[last] = v;
    setLine(o, last, l);
  }

  while (i < s.length) {
    skipAll();
    if (i >= s.length) break;
    const l = line;
    if (s[i] === '[') {
      const arrayTable = s[i + 1] === '[';
      i += arrayTable ? 2 : 1;
      const parts = key();
      if (arrayTable) {
        if (s[i] !== ']' || s[i + 1] !== ']') fail('expected ]]');
        i += 2;
        let o = root;
        for (let n = 0; n < parts.length - 1; n++) o = descend(o, parts[n], l, true);
        const last = parts[parts.length - 1];
        if (!Array.isArray(o[last])) { o[last] = []; setLine(o, last, l); }
        const table = {};
        setLine(table, '__line', l);
        o[last].push(table);
        setLine(o[last], o[last].length - 1, l);
        cur = table;
      } else {
        if (s[i] !== ']') fail('expected ]');
        i++;
        let o = root;
        for (const p of parts) o = descend(o, p, l, true);
        setLine(o, '__line', l);
        cur = o;
      }
      skipInline();
      continue;
    }
    const k = key();
    if (s[i] !== '=') fail('expected =');
    i++;
    assign(cur, k, value(), l);
    skipInline();
    if (i < s.length && s[i] !== '\n') fail('expected end of line');
  }
  return root;
}

module.exports = { parseToml };
