// A small XML reader (no DOM, so it also runs in Node): elements with their local
// names, attributes and text. Used to read Visio files (.vsdx) and SVG.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][\w.-]*);/g, (all, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[ref] ?? all;
  });
}

const localName = (qname) => qname.slice(qname.indexOf(':') + 1);

/**
 * Parses XML text into { name (local name, prefix dropped), qname, attrs, children, text }.
 * Handles the XML declaration, comments, processing instructions, DOCTYPE,
 * CDATA and character / predefined entities. Throws on malformed input.
 */
export function parseXml(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const doc = { name: '#document', qname: '#document', attrs: {}, children: [], text: '' };
  const stack = [doc];
  let i = 0;
  const fail = (why) => { throw new Error(`XML: ${why} at ${i}`); };
  const addText = (raw, decode = true) => {
    const top = stack[stack.length - 1];
    if (stack.length === 1) {
      if (raw.trim()) fail('text outside the root element');
      return;
    }
    top.text += decode ? decodeEntities(raw) : raw;
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(src.slice(i)); break; }
    if (lt > i) addText(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) fail('unclosed comment');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end < 0) fail('unclosed CDATA');
      addText(src.slice(lt + 9, end), false);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end < 0) fail('unclosed declaration');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE (with an optional [internal subset]).
      let j = lt + 2;
      let depth = 0;
      for (; j < src.length; j++) {
        if (src[j] === '[') depth += 1;
        else if (src[j] === ']') depth -= 1;
        else if (src[j] === '>' && depth <= 0) break;
      }
      if (j >= src.length) fail('unclosed DOCTYPE');
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end < 0) fail('unclosed end tag');
      const qname = src.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (stack.length === 0 || top.qname !== qname) fail(`mismatched </${qname}>`);
      i = end + 1;
    } else {
      // Start tag: name, attributes (quoted values may contain '>'), '/>' or '>'.
      let j = lt + 1;
      const nameMatch = /^[^\s/>=<"']+/.exec(src.slice(j, j + 256));
      if (!nameMatch) fail('bad tag');
      const qname = nameMatch[0];
      j += qname.length;
      const attrs = {};
      let selfClosing = false;
      for (;;) {
        while (j < src.length && /\s/.test(src[j])) j++;
        if (j >= src.length) fail('unclosed tag');
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { selfClosing = true; j += 2; break; }
        const attrMatch = /^[^\s/>=<"']+/.exec(src.slice(j, j + 256));
        if (!attrMatch) fail('bad attribute');
        j += attrMatch[0].length;
        while (/\s/.test(src[j] ?? '')) j++;
        if (src[j] !== '=') fail('attribute without value');
        j++;
        while (/\s/.test(src[j] ?? '')) j++;
        const quote = src[j];
        if (quote !== '"' && quote !== "'") fail('unquoted attribute');
        const close = src.indexOf(quote, j + 1);
        if (close < 0) fail('unclosed attribute');
        attrs[localName(attrMatch[0])] = decodeEntities(src.slice(j + 1, close));
        j = close + 1;
      }
      const node = { name: localName(qname), qname, attrs, children: [], text: '' };
      const parent = stack[stack.length - 1];
      if (parent === doc && doc.children.length) fail('more than one root element');
      parent.children.push(node);
      if (!selfClosing) stack.push(node);
      i = j;
    }
  }
  if (stack.length !== 1) fail('unclosed element');
  if (doc.children.length !== 1) fail('no root element');
  return doc.children[0];
}

/** Child elements named `name`. */
export const childrenNamed = (node, name) => (node?.children ?? []).filter((child) => child.name === name);
/** The first child element named `name`. */
export const childNamed = (node, name) => (node?.children ?? []).find((child) => child.name === name) ?? null;
/** Every descendant element named `name` (depth first). */
export function descendants(node, name, out = []) {
  for (const child of node?.children ?? []) { if (child.name === name) out.push(child); descendants(child, name, out); }
  return out;
}
/** All text inside an element (its own and its children's). */
export const allText = (node) => (node ? node.text + (node.children ?? []).map(allText).join('') : '');
