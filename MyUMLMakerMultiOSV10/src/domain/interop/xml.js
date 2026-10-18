// A small XML reader and writer for the interchange formats (XMI). Pure JS, no
// DOM, so it runs in node tests too. The reader is forgiving: it never throws;
// what it cannot make sense of (a stray closing tag, an unclosed element, a bad
// entity) becomes a warning and reading goes on.
//
// A node: { name, attrs: { name: value }, children: [node], text, parent }.
// `text` is the element's own character data (CDATA included), trimmed only by
// callers that want that.

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** "&lt;a&gt;" → "<a>" (numeric references too; unknown entities stay as written). */
export function decodeEntities(text, warn = null) {
  if (!text || text.indexOf('&') < 0) return text ?? '';
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][\w.-]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { warn?.(`bad character reference ${whole}`); return whole; }
    }
    if (Object.hasOwn(ENTITIES, body)) return ENTITIES[body];
    warn?.(`unknown entity ${whole}`);
    return whole;
  });
}

/** Escapes text for an attribute value or character data. */
export const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;')
  // Characters XML 1.0 does not allow at all are dropped.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

const NAME_START = /[A-Za-z_:À-￿]/;

/**
 * Parses XML text. Returns { root, warnings } — root is the document element
 * (null when there is none). Never throws.
 */
export function parseXml(source) {
  const warnings = [];
  const warn = (message) => { if (warnings.length < 200) warnings.push(message); };
  const text = String(source ?? '').replace(/^﻿/, '');
  const top = { name: '#document', attrs: {}, children: [], text: '', parent: null };
  let current = top;
  let i = 0;
  const n = text.length;
  const lineAt = (pos) => text.slice(0, pos).split('\n').length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { current.text += decodeEntities(text.slice(i), warn); break; }
    if (lt > i) current.text += decodeEntities(text.slice(i, lt), warn);
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) { warn(`unclosed comment at line ${lineAt(i)}`); break; }
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) { warn(`unclosed CDATA at line ${lineAt(i)}`); current.text += text.slice(i + 9); break; }
      current.text += text.slice(i + 9, end);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) { warn(`unclosed processing instruction at line ${lineAt(i)}`); break; }
      i = end + 2;
      continue;
    }
    if (text.startsWith('<!', i)) {
      // DOCTYPE (with an internal subset in brackets) or another declaration: skipped.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j += 1) {
        const c = text[j];
        if (c === '[') depth += 1;
        else if (c === ']') depth -= 1;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (text[i + 1] === '/') {
      const end = text.indexOf('>', i + 2);
      const name = text.slice(i + 2, end < 0 ? n : end).trim();
      i = end < 0 ? n : end + 1;
      // Close up to the matching open element; a closing tag nobody opened is ignored.
      let open = current;
      while (open && open !== top && open.name !== name) open = open.parent;
      if (!open || open === top) { warn(`unexpected </${name}> at line ${lineAt(lt)}`); continue; }
      for (let node = current; node !== open; node = node.parent) warn(`<${node.name}> not closed before </${name}>`);
      current = open.parent;
      continue;
    }
    if (!NAME_START.test(text[i + 1] ?? '')) { current.text += '<'; i += 1; warn(`stray "<" at line ${lineAt(lt)}`); continue; }
    // A start tag.
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(text[j])) j += 1;
    const node = { name: text.slice(i + 1, j), attrs: {}, children: [], text: '', parent: current };
    let selfClosing = false;
    for (;;) {
      while (j < n && /\s/.test(text[j])) j += 1;
      if (j >= n) { warn(`unfinished tag <${node.name}> at line ${lineAt(lt)}`); break; }
      if (text[j] === '>') { j += 1; break; }
      if (text[j] === '/' && text[j + 1] === '>') { selfClosing = true; j += 2; break; }
      if (text[j] === '/') { j += 1; continue; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(text[k])) k += 1;
      const key = text.slice(j, k);
      j = k;
      while (j < n && /\s/.test(text[j])) j += 1;
      if (text[j] !== '=') { if (key) node.attrs[key] = key; if (!key) j += 1; continue; }
      j += 1;
      while (j < n && /\s/.test(text[j])) j += 1;
      let value;
      const quote = text[j];
      if (quote === '"' || quote === "'") {
        const close = text.indexOf(quote, j + 1);
        if (close < 0) { warn(`unclosed attribute ${key} at line ${lineAt(j)}`); value = text.slice(j + 1); j = n; } else { value = text.slice(j + 1, close); j = close + 1; }
      } else {
        let k2 = j;
        while (k2 < n && !/[\s>]/.test(text[k2])) k2 += 1;
        value = text.slice(j, k2);
        j = k2;
        warn(`unquoted attribute ${key}`);
      }
      // Attribute value normalization: whitespace characters become spaces, references are kept.
      node.attrs[key] = decodeEntities(value.replace(/[\t\n\r]/g, ' '), warn);
    }
    i = j;
    current.children.push(node);
    if (!selfClosing) current = node;
  }
  if (current !== top) {
    for (let node = current; node && node !== top; node = node.parent) warn(`<${node.name}> not closed at the end`);
  }
  const elements = top.children;
  if (!elements.length) warn('no XML element found');
  else if (elements.length > 1) warn('more than one document element');
  return { root: elements[0] ?? null, warnings };
}

// ───────────────────────── reading helpers

/** "uml:Class" → "Class". */
export const localName = (name) => { const text = String(name ?? ''); const at = text.indexOf(':'); return at < 0 ? text : text.slice(at + 1); };
export const prefixOf = (name) => { const text = String(name ?? ''); const at = text.indexOf(':'); return at < 0 ? '' : text.slice(0, at); };
/** Child elements (with a local name, when given). */
export const childrenNamed = (node, name) => (node?.children ?? []).filter((c) => localName(c.name) === name);
export const firstChild = (node, name) => (node?.children ?? []).find((c) => localName(c.name) === name) ?? null;
/** Every element below node (depth first, node excluded). */
export function* descendants(node) {
  for (const child of node?.children ?? []) { yield child; yield* descendants(child); }
}

// ───────────────────────── writing

/** An element for the writer: x('uml:Class', { name }, ...children). Attributes that are undefined, null or false are left out. */
export const x = (name, attrs = {}, ...children) => ({ name, attrs, children: children.flat(Infinity).filter(Boolean) });

/** Writes a node tree as indented XML text (no declaration). */
export function writeXml(node, indent = '') {
  const attrs = Object.entries(node.attrs ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
  const children = node.children ?? [];
  if (node.text !== undefined && node.text !== null && node.text !== '') return `${indent}<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`;
  if (!children.length) return `${indent}<${node.name}${attrs}/>`;
  return `${indent}<${node.name}${attrs}>\n${children.map((c) => writeXml(c, `${indent}\t`)).join('\n')}\n${indent}</${node.name}>`;
}
