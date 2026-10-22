'use strict';

// Minimal XML reader for pom.xml, *.csproj, packages.config, *.nuspec,
// Directory.Packages.props and CycloneDX XML. Produces a tree of
// { name, local, attrs, children, text, line }. Namespace prefixes are kept in
// `name` and stripped in `local`. DTDs and processing instructions are skipped.

function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
  });
}

function parseXml(text) {
  const s = String(text).replace(/^﻿/, '');
  let i = 0;
  let line = 1;
  const root = { name: '#document', local: '#document', attrs: {}, children: [], text: '', line: 1 };
  const stack = [root];
  const advance = (to) => {
    for (let k = i; k < to && k < s.length; k++) if (s.charCodeAt(k) === 10) line++;
    i = to;
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { stack[stack.length - 1].text += decode(s.slice(i)); break; }
    if (lt > i) stack[stack.length - 1].text += decode(s.slice(i, lt));
    advance(lt);
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i); advance(e < 0 ? s.length : e + 3); continue; }
    if (s.startsWith('<![CDATA[', i)) {
      const e = s.indexOf(']]>', i);
      stack[stack.length - 1].text += s.slice(i + 9, e < 0 ? s.length : e);
      advance(e < 0 ? s.length : e + 3);
      continue;
    }
    if (s.startsWith('<?', i)) { const e = s.indexOf('?>', i); advance(e < 0 ? s.length : e + 2); continue; }
    if (s.startsWith('<!', i)) {
      let depth = 0;
      let k = i;
      for (; k < s.length; k++) {
        if (s[k] === '[') depth++;
        else if (s[k] === ']') depth--;
        else if (s[k] === '>' && depth <= 0) break;
      }
      advance(k + 1);
      continue;
    }
    if (s[i + 1] === '/') {
      const e = s.indexOf('>', i);
      const name = s.slice(i + 2, e).trim();
      advance(e < 0 ? s.length : e + 1);
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      continue;
    }
    // Start tag: find the closing '>' outside quotes.
    let k = i + 1;
    let q = null;
    for (; k < s.length; k++) {
      const c = s[k];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
    }
    const body = s.slice(i + 1, k);
    const startLine = line;
    advance(k + 1);
    const selfClose = body.endsWith('/');
    const inner = selfClose ? body.slice(0, -1) : body;
    const m = /^([^\s/>]+)/.exec(inner);
    if (!m) continue;
    const name = m[1];
    const attrs = {};
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    const rest = inner.slice(name.length);
    while ((a = re.exec(rest))) attrs[a[1]] = decode(a[3] !== undefined ? a[3] : a[4]);
    const el = { name, local: name.includes(':') ? name.split(':').pop() : name, attrs, children: [], text: '', line: startLine };
    stack[stack.length - 1].children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}

function child(el, name) {
  if (!el) return null;
  return el.children.find((c) => c.local === name) || null;
}

function children(el, name) {
  if (!el) return [];
  return el.children.filter((c) => c.local === name);
}

function text(el) {
  return el ? el.text.trim() : '';
}

function childText(el, name) {
  return text(child(el, name));
}

function walk(el, fn) {
  fn(el);
  for (const c of el.children) walk(c, fn);
}

// Attribute lookup that ignores case (MSBuild is case-insensitive).
function attr(el, name) {
  if (!el) return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(el.attrs)) if (k.toLowerCase() === want) return v;
  return undefined;
}

module.exports = { parseXml, child, children, text, childText, walk, attr };
