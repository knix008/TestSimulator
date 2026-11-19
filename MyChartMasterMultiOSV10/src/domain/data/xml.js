// A small, forgiving XML reader (no DOMParser under Node): elements with attributes, children and text.
// Enough for the spreadsheet formats (xlsx, ods), generic XML data and table markup in HTML.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'wbr', 'source']);

/**
 * Parses XML (or, with `html`, loose HTML: void tags, unclosed <td>/<tr>/<p>, case-insensitive names) into
 * `{ name: '#root', children: [...] }`. Elements: `{ name, attrs, children }`; text: `{ text }`.
 */
export function parseXml(source, { html = false } = {}) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const text = String(source).replace(/^﻿/, '');
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  let m;
  const top = () => stack[stack.length - 1];
  const norm = (name) => (html ? name.toLowerCase() : name);
  while ((m = re.exec(text))) {
    if (m[1] != null) { top().children.push({ text: m[1] }); continue; }
    if (m[2]) {
      const name = norm(m[2]);
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) { stack.length = i; break; }
      }
      continue;
    }
    if (m[3]) {
      const name = norm(m[3]);
      if (html && /^(script|style)$/.test(name)) {
        const close = text.toLowerCase().indexOf(`</${name}`, re.lastIndex);
        re.lastIndex = close < 0 ? text.length : close;
        continue;
      }
      const attrs = {};
      const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a;
      while ((a = attrRe.exec(m[4] ?? ''))) attrs[html ? a[1].toLowerCase() : a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      if (html) {
        // An open cell, row or paragraph ends where the next one of its kind (or its table part) begins.
        const closes = { td: ['td', 'th'], th: ['td', 'th'], tr: ['tr', 'td', 'th'], tbody: ['tbody', 'thead', 'tr', 'td', 'th'], thead: ['tbody', 'thead', 'tr', 'td', 'th'], li: ['li'], p: ['p'] }[name];
        if (closes) {
          for (let i = stack.length - 1; i > 0; i--) {
            if (stack[i].name === 'table') break;
            if (closes.includes(stack[i].name)) { stack.length = i; break; }
          }
        }
      }
      const element = { name, attrs, children: [] };
      top().children.push(element);
      if (!m[5] && !(html && VOID.has(name))) stack.push(element);
      continue;
    }
    if (m[6] != null && m[6].trim()) top().children.push({ text: decodeEntities(m[6]) });
  }
  return root;
}

/** Local name without a namespace prefix ("table:table-row" → "table-row"). */
export const localName = (name) => String(name ?? '').replace(/^.*:/, '');

/** Every element below `node` (depth first) whose local name is `name`. */
export function findAll(node, name, out = []) {
  for (const child of node.children ?? []) {
    if (!child.name) continue;
    if (localName(child.name) === name || child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

export const findFirst = (node, name) => findAll(node, name)[0] ?? null;
/** Direct children with that local name. */
export const childrenNamed = (node, name) => (node.children ?? []).filter((c) => c.name && (localName(c.name) === name || c.name === name));

/** All text below an element, joined; <br> and block ends become spaces. */
export function textOf(node) {
  if (!node) return '';
  if (node.text != null) return node.text;
  return (node.children ?? []).map((c) => (c.name && /^(br|p|div)$/i.test(c.name) ? ` ${textOf(c)} ` : textOf(c))).join('').replace(/\s+/g, ' ').trim();
}

export const attr = (node, name) => node?.attrs?.[name] ?? Object.entries(node?.attrs ?? {}).find(([k]) => localName(k) === name)?.[1];
