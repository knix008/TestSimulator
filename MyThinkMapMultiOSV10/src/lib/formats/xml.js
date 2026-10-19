// A small XML parser and writer for the map formats (OPML, FreeMind,
// XMind 8, MindManager). Elements, attributes, text, CDATA, comments and the
// standard / numeric entities — enough for those files, and it runs the same
// in the browser and in Node (the tests).
//
// parseXml(text) → { name, attrs, children: [node | string] } (the root element)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseXml(text) {
  const src = String(text).replace(/^﻿/, '');
  let i = 0;
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { const t = src.slice(i); if (t.trim()) top().children.push(decodeEntities(t)); break; }
    if (lt > i) { const t = src.slice(i, lt); if (t.trim() || stack.length > 1) top().children.push(decodeEntities(t)); }
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); top().children.push(src.slice(lt + 9, e < 0 ? src.length : e)); i = e < 0 ? src.length : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE (possibly with an internal subset)
      let depth = 0, j = lt + 2;
      for (; j < src.length; j++) { if (src[j] === '[') depth++; else if (src[j] === ']') depth--; else if (src[j] === '>' && depth <= 0) break; }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt);
      const name = src.slice(lt + 2, e).trim();
      // close up to the matching element (tolerates unclosed children)
      for (let k = stack.length - 1; k > 0; k--) { if (stack[k].name === name) { stack.length = k; break; } }
      i = e + 1;
      continue;
    }
    // start tag
    let j = lt + 1;
    while (j < src.length && !/[\s/>]/.test(src[j])) j++;
    const name = src.slice(lt + 1, j);
    const attrs = {};
    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '>' || src[j] === '/' || j >= src.length) break;
      let k = j;
      while (k < src.length && !/[\s=/>]/.test(src[k])) k++;
      const an = src.slice(j, k);
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] === '=') {
        k++;
        while (k < src.length && /\s/.test(src[k])) k++;
        const q = src[k];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, k + 1);
          attrs[an] = decodeEntities(src.slice(k + 1, e < 0 ? src.length : e));
          j = e < 0 ? src.length : e + 1;
        } else {
          let e = k;
          while (e < src.length && !/[\s>]/.test(src[e])) e++;
          attrs[an] = decodeEntities(src.slice(k, e));
          j = e;
        }
      } else { attrs[an] = ''; j = k; }
    }
    const node = { name, attrs, children: [] };
    top().children.push(node);
    if (src[j] === '/') { i = src.indexOf('>', j) + 1; continue; }
    stack.push(node);
    i = j + 1;
  }
  const el = root.children.find((c) => typeof c === 'object');
  if (!el) throw new Error('Not an XML document');
  return el;
}

// helpers
export const localName = (n) => String(n.name || '').replace(/^.*:/, '');
export const elements = (n, name) => (n && n.children ? n.children.filter((c) => typeof c === 'object' && (!name || localName(c) === name)) : []);
export const element = (n, name) => elements(n, name)[0] || null;
export const textOf = (n) => (n ? n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('') : '');
export function find(n, path) {
  let cur = n;
  for (const p of path.split('/')) { cur = element(cur, p); if (!cur) return null; }
  return cur;
}
// An attribute by its local name (ignores the namespace prefix).
export function attr(n, name) {
  if (!n) return undefined;
  if (name in n.attrs) return n.attrs[name];
  for (const [k, v] of Object.entries(n.attrs)) if (k.replace(/^.*:/, '') === name) return v;
  return undefined;
}

// HTML (a FreeMind / MindManager rich note) → plain text with line breaks.
export function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
