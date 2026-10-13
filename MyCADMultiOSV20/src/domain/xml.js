// A small XML reader (elements, attributes, text) for AMF, 3MF and FreeCAD
// documents — the same in Node and in the browser. Not validating.
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export const unescapeXml = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, code) => {
  if (code[0] === '#') return String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  return ENTITIES[code.toLowerCase()];
});

export const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Parses XML text into { name, attrs, children, text } (the document element). */
export function parseXml(source) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const attr = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = tag.exec(source))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      if (stack.length > 1) stack.pop();
    } else if (m[3]) {
      const node = { name: m[3], attrs: {}, children: [], text: '' };
      let a;
      attr.lastIndex = 0;
      while ((a = attr.exec(m[4] ?? ''))) node.attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? '');
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.text += unescapeXml(m[6]);
  }
  const element = root.children[0];
  if (!element) throw new Error('empty XML document');
  return element;
}

/** Local name (without namespace prefix). */
export const localName = (node) => node.name.replace(/^.*:/, '');

/** All descendants with a local name. */
export function findAll(node, name, out = []) {
  for (const child of node.children) {
    if (localName(child) === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

export const child = (node, name) => node?.children.find((c) => localName(c) === name) ?? null;
export const childrenNamed = (node, name) => node?.children.filter((c) => localName(c) === name) ?? [];
