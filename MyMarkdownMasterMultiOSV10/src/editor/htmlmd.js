// Pasted HTML → Markdown (pure: its own small HTML reader, so it runs in node --test too). Handles what
// browsers, Word and Google Docs put on the clipboard: headings, paragraphs, line breaks, bold / italic
// / strike / highlight (tags or inline styles), links, images, inline code and <pre> blocks, nested
// lists and task lists, quotes, rules and tables. Everything else becomes its text.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['head', 'style', 'script', 'meta', 'title', 'noscript', 'template', 'link', 'xml', 'svg', 'button', 'select', 'option']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'address', 'center', 'dl', 'dt', 'dd', 'details', 'summary', 'body', 'html', 'form', 'fieldset']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', times: '×', trade: '™', laquo: '«', raquo: '»', deg: '°', euro: '€' };
// Elements a new start tag of the same kind (or one of these) closes implicitly.
const AUTO_CLOSE = { p: ['p', 'div', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'hr'], li: ['li'], tr: ['tr'], td: ['td', 'th', 'tr'], th: ['td', 'th', 'tr'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], option: ['option'] };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(/([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

/** A tree of { tag, attrs, children } and text strings. */
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
  let skipDepth = 0;
  let skipTag = '';
  for (const m of html.matchAll(re)) {
    const token = m[0];
    if (skipDepth) {
      if (m[1] && m[1].toLowerCase() === skipTag) skipDepth--;
      else if (m[2] && m[2].toLowerCase() === skipTag && !m[4]) skipDepth++;
      continue;
    }
    if (token.startsWith('<!') || token.startsWith('<?')) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    if (m[2]) {
      const tag = m[2].toLowerCase();
      if (SKIP.has(tag)) { if (!m[4] && !VOID.has(tag)) { skipDepth = 1; skipTag = tag; } continue; }
      // Implicit end tags (<p>…<p>, <li>…<li>).
      for (;;) {
        const open = top().tag;
        if (AUTO_CLOSE[open]?.includes(tag) && stack.length > 1) stack.pop(); else break;
      }
      const node = { tag, attrs: parseAttrs(m[3] ?? ''), children: [] };
      top().children.push(node);
      if (!VOID.has(tag) && !m[4]) stack.push(node);
      continue;
    }
    top().children.push(decodeEntities(token));
  }
  return root;
}

const styleOf = (node) => (node.attrs?.style ?? '').toLowerCase().replace(/\s+/g, '');
const isBoldStyle = (s) => /font-weight:(bold|[6-9]00)/.test(s);
const isNotBoldStyle = (s) => /font-weight:(normal|[1-4]00)/.test(s);
const isItalicStyle = (s) => /font-style:italic/.test(s);
const isStrikeStyle = (s) => /text-decoration[^;]*line-through/.test(s);

/** Does the HTML carry formatting worth converting (else the plain text is pasted)? */
export function hasFormatting(html) {
  const s = String(html ?? '');
  if (/<(h[1-6]|ul|ol|li|table|pre|code|img|blockquote|del|s|strike|mark|hr|em|i)\b/i.test(s)) return true;
  if (/<a\s[^>]*href=/i.test(s)) return true;
  if (/<(b|strong)\b(?![^>]*font-weight:\s*(normal|[1-4]00))/i.test(s)) return true;
  return /font-weight:\s*(bold|[6-9]00)|font-style:\s*italic|line-through/i.test(s);
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (node.tag === 'br') return '\n';
  return node.children.map(textOf).join('');
}

const wrapMark = (text, mark) => {
  if (!text.trim()) return text;
  const lead = /^\s*/.exec(text)[0];
  const trail = /\s*$/.exec(text)[0];
  return `${lead}${mark}${text.trim()}${mark}${trail}`;
};

function codeSpan(text) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

/** Inline content of a node as Markdown (whitespace collapsed). */
function inline(node, ctx = {}) {
  if (typeof node === 'string') return ctx.pre ? node : node.replace(/[ \t\r\n\f]+/g, ' ');
  const tag = node.tag;
  const inner = () => node.children.map((child) => inline(child, ctx)).join('');
  const style = styleOf(node);
  switch (tag) {
    case 'br': return '\n';
    case 'img': {
      const src = node.attrs.src ?? '';
      if (!src) return '';
      return `![${(node.attrs.alt ?? '').replace(/[[\]]/g, '')}](${src.replace(/ /g, '%20')})`;
    }
    case 'a': {
      const href = node.attrs.href ?? '';
      const text = inner();
      if (!href || href.startsWith('javascript:')) return text;
      if (!text.trim()) return '';
      if (text.trim() === href) return href;
      return `[${text.trim().replace(/\n+/g, ' ')}](${href.replace(/ /g, '%20').replace(/\)/g, '%29')})`;
    }
    case 'code': case 'kbd': case 'samp': case 'tt':
      return ctx.pre ? textOf(node) : codeSpan(textOf(node).replace(/\n/g, ' '));
    case 'input':
      return '';
    case 'b': case 'strong': {
      const text = inner();
      return isNotBoldStyle(style) || ctx.bold ? text : wrapMark(node.children.map((c) => inline(c, { ...ctx, bold: true })).join(''), '**');
    }
    case 'em': case 'i': case 'cite': case 'dfn':
      return ctx.italic ? inner() : wrapMark(node.children.map((c) => inline(c, { ...ctx, italic: true })).join(''), '*');
    case 'del': case 's': case 'strike':
      return wrapMark(inner(), '~~');
    case 'mark':
      return wrapMark(inner(), '==');
    case 'sup': case 'sub': case 'u': case 'small': case 'abbr': case 'q':
      return inner();
    default: {
      let text;
      if (BLOCK_LIKE(tag)) text = block(node, ctx).trim();
      else text = inner();
      if (tag === 'span' || tag === 'font') {
        if (isBoldStyle(style) && !ctx.bold) text = wrapMark(node.children.map((c) => inline(c, { ...ctx, bold: true })).join(''), '**');
        if (isItalicStyle(style) && !ctx.italic) text = wrapMark(text, '*');
        if (isStrikeStyle(style)) text = wrapMark(text, '~~');
      }
      return text;
    }
  }
}

const BLOCK_LIKE = (tag) => BLOCK.has(tag) || /^(h[1-6]|ul|ol|li|pre|blockquote|table|hr)$/.test(tag);

function hasBlockChildren(node) {
  return node.children.some((child) => typeof child !== 'string' && (BLOCK_LIKE(child.tag) || hasBlockChildren(child)) && child.tag !== 'a');
}

const cleanInline = (text) => text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

function listBlock(node, ctx) {
  const ordered = node.tag === 'ol';
  let n = Number(node.attrs.start) || 1;
  const items = [];
  for (const child of node.children) {
    if (typeof child === 'string') { if (child.trim()) items.push(`- ${child.trim()}`); continue; }
    if (child.tag !== 'li') {
      if (child.tag === 'ul' || child.tag === 'ol') {
        const nested = listBlock(child, ctx);
        items.push(nested.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n'));
      }
      continue;
    }
    const box = findCheckbox(child);
    const marker = ordered ? `${n++}. ` : '- ';
    const task = box ? `[${box.attrs.checked != null ? 'x' : ' '}] ` : '';
    // A nested list follows its item's text directly (a tight list).
    const body = block(child, ctx).trim().replace(/\n\n(?=(?:[-*+]|\d+[.)]) )/g, '\n');
    const pad = ' '.repeat(marker.length);
    const lines = body.split('\n');
    items.push([`${marker}${task}${lines[0] ?? ''}`, ...lines.slice(1).map((line) => (line ? pad + line : line))].join('\n'));
  }
  return items.join('\n');
}

function findCheckbox(node) {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag === 'input' && (child.attrs.type ?? '').toLowerCase() === 'checkbox') return child;
    if (child.tag === 'ul' || child.tag === 'ol') continue;
    const inner = findCheckbox(child);
    if (inner) return inner;
  }
  return null;
}

function tableBlock(node, ctx) {
  const rows = [];
  let headerRow = -1;
  const walk = (n) => {
    for (const child of n.children) {
      if (typeof child === 'string') continue;
      if (child.tag === 'tr') {
        const cells = child.children.filter((c) => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th'));
        if (headerRow < 0 && cells.some((c) => c.tag === 'th')) headerRow = rows.length;
        rows.push(cells.map((c) => cleanInline(inline({ ...c, tag: 'span' }, ctx)).replace(/\n+/g, '<br>').replace(/\|/g, '\\|')));
      } else if (child.tag !== 'table') walk(child);
    }
  };
  walk(node);
  if (!rows.length) return '';
  if (headerRow > 0) rows.unshift(...rows.splice(headerRow, 1));
  const cols = Math.max(...rows.map((r) => r.length));
  const fill = (r) => Array.from({ length: cols }, (_, i) => r[i] ?? '');
  const out = [`| ${fill(rows[0]).join(' | ')} |`, `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`];
  for (const r of rows.slice(1)) out.push(`| ${fill(r).join(' | ')} |`);
  return out.join('\n');
}

/** Block content of a node as Markdown blocks joined by blank lines. */
function block(node, ctx = {}) {
  const parts = [];
  let run = [];
  const flush = () => {
    const text = cleanInline(run.join(''));
    if (text) parts.push(text);
    run = [];
  };
  for (const child of node.children) {
    if (typeof child === 'string' || !BLOCK_LIKE(child.tag)) {
      run.push(inline(child, ctx));
      continue;
    }
    flush();
    const tag = child.tag;
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      const text = cleanInline(inline({ ...child, tag: 'span' }, { ...ctx, bold: true })).replace(/\n+/g, ' ');
      if (text) parts.push(`${'#'.repeat(Number(h[1]))} ${text}`);
    } else if (tag === 'ul' || tag === 'ol') {
      const text = listBlock(child, ctx);
      if (text) parts.push(text);
    } else if (tag === 'pre') {
      const codeNode = child.children.find((c) => typeof c !== 'string' && c.tag === 'code');
      const cls = `${codeNode?.attrs.class ?? ''} ${child.attrs.class ?? ''}`;
      const lang = /(?:language|lang)-([\w+#-]+)/.exec(cls)?.[1] ?? '';
      const code = textOf(child).replace(/\n$/, '');
      const longest = Math.max(2, ...[...code.matchAll(/^`{3,}/gm)].map((m) => m[0].length));
      const fence = '`'.repeat(longest + 1);
      parts.push(`${fence}${lang}\n${code}\n${fence}`);
    } else if (tag === 'blockquote') {
      const text = block(child, ctx).trim();
      if (text) parts.push(text.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n'));
    } else if (tag === 'table') {
      const text = tableBlock(child, ctx);
      if (text) parts.push(text);
    } else if (tag === 'hr') {
      parts.push('---');
    } else if (tag === 'li') {
      const text = block(child, ctx).trim();
      if (text) parts.push(`- ${text}`);
    } else {
      const text = hasBlockChildren(child) ? block(child, ctx) : cleanInline(inline({ ...child, tag: 'span' }, ctx));
      if (text.trim()) parts.push(text.trim());
    }
  }
  flush();
  return parts.join('\n\n');
}

/** HTML (a clipboard fragment or a whole page) → Markdown. */
export function htmlToMarkdown(html) {
  const tree = parseHtml(String(html ?? ''));
  const body = findTag(tree, 'body') ?? tree;
  return block(body).replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function findTag(node, tag) {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag === tag) return child;
    const found = findTag(child, tag);
    if (found) return found;
  }
  return null;
}
