// HTML from the page editor → the Markdown subset renderMarkdown() reads (markdown.js):
// headings 1-3, paragraphs (line breaks kept), bullet and numbered lists, quotes, code blocks,
// horizontal rules, tables, **bold**, *italic*, ~~struck~~, `code`, links and images.
// It runs the same in the browser and in Node: a small tag parser builds the tree, so the editor's HTML
// never goes through the live DOM, and anything outside the subset is kept as its text.

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'col', 'wbr']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'section', 'article', 'header', 'footer', 'figure']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code === 160 ? 32 : code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

function attrs(source) {
  const out = {};
  for (const match of source.matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return out;
}

/** A forgiving parser: unknown or unclosed tags never throw; text outside tags becomes text nodes. */
export function parseHtml(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const pattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|[^<]+|</g;
  for (const match of String(html || '').matchAll(pattern)) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    if (!match[1]) {
      top().children.push({ tag: '#text', text: decode(token) });
      continue;
    }
    const tag = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const at = stack.map((node) => node.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const node = { tag, attrs: attrs(match[2] || ''), children: [] };
    // A new block inside a paragraph closes the paragraph, as browsers do.
    if (BLOCK.has(tag) && top().tag === 'p') stack.pop();
    top().children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(match[2] || '')) stack.push(node);
  }
  return root;
}

function textOf(node) {
  if (node.tag === '#text') return node.text;
  if (node.tag === 'br') return '\n';
  return (node.children || []).map(textOf).join('');
}

function href(node) {
  if (node.attrs?.['data-file']) return `attachment:${node.attrs['data-file']}`;
  return node.attrs?.href || '';
}

function wrap(mark, inner) {
  const text = inner.replace(/\n+/g, ' ');
  if (!text.trim()) return text;
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  return `${lead}${mark}${text.trim()}${mark}${tail}`;
}

function inline(nodes) {
  let out = '';
  for (const node of nodes || []) {
    if (node.tag === '#text') { out += node.text.replace(/[ \t\r\n]+/g, ' '); continue; }
    const inner = () => inline(node.children);
    switch (node.tag) {
      case 'br': out += '\n'; break;
      case 'strong': case 'b': out += wrap('**', inner()); break;
      case 'em': case 'i': out += wrap('*', inner()); break;
      case 'del': case 's': case 'strike': out += wrap('~~', inner()); break;
      case 'code': out += `\`${textOf(node).replace(/`/g, "'")}\``; break;
      case 'a': {
        const label = inner().trim() || node.attrs?.['data-name'] || href(node);
        const target = href(node);
        out += target ? `[${label}](${target})` : label;
        break;
      }
      case 'img': {
        const alt = String(node.attrs?.alt || node.attrs?.['data-name'] || 'image').replace(/[[\]]/g, ' ');
        const src = node.attrs?.['data-file'] ? `attachment:${node.attrs['data-file']}` : (node.attrs?.src || '');
        if (src) out += `![${alt}](${src})`;
        break;
      }
      case 'script': case 'style': break;
      default:
        if (BLOCK.has(node.tag)) out += `\n${inline(node.children)}\n`;
        else out += inner();
    }
  }
  return out;
}

function lines(text) {
  return text.split('\n').map((line) => line.replace(/\s+$/, '').replace(/^ +/, '')).filter((line, at, all) => line || (at > 0 && all[at - 1]));
}

function hasBlocks(node) {
  return (node.children || []).some((child) => BLOCK.has(child.tag) && child.tag !== 'br');
}

function listItems(node, ordered) {
  const out = [];
  let n = 1;
  for (const item of node.children || []) {
    if (item.tag === 'ul' || item.tag === 'ol') { out.push(...listItems(item, item.tag === 'ol')); continue; }
    if (item.tag !== 'li') {
      const text = inline([item]).trim();
      if (text) out.push(`${ordered ? `${n++}.` : '-'} ${text.replace(/\n+/g, ' ')}`);
      continue;
    }
    const own = (item.children || []).filter((child) => child.tag !== 'ul' && child.tag !== 'ol');
    const text = inline(own).trim().replace(/\n+/g, ' ');
    if (text) out.push(`${ordered ? `${n++}.` : '-'} ${text}`);
    // The renderer has one list level: nested items follow their parent on the same level.
    for (const child of item.children || []) if (child.tag === 'ul' || child.tag === 'ol') out.push(...listItems(child, child.tag === 'ol'));
  }
  return out;
}

function cell(node) {
  return inline(node.children).replace(/\n+/g, ' ').replace(/\|/g, '/').trim() || ' ';
}

function tableRows(node) {
  const rows = [];
  const walk = (current) => {
    for (const child of current.children || []) {
      if (child.tag === 'tr') rows.push(child);
      else if (['thead', 'tbody', 'tfoot'].includes(child.tag)) walk(child);
    }
  };
  walk(node);
  if (!rows.length) return [];
  const cells = rows.map((row) => (row.children || []).filter((child) => child.tag === 'td' || child.tag === 'th'));
  const width = Math.max(1, ...cells.map((row) => row.length));
  const line = (row) => `| ${Array.from({ length: width }, (_, at) => (row[at] ? cell(row[at]) : ' ')).join(' | ')} |`;
  return [line(cells[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...cells.slice(1).map(line)];
}

function blocks(nodes, out) {
  let loose = [];
  const flushLoose = () => {
    const text = inline(loose);
    loose = [];
    const body = lines(text);
    if (body.some((line) => line.trim())) out.push(body.join('\n'));
  };
  for (const node of nodes || []) {
    if (node.tag === '#text' || !BLOCK.has(node.tag)) { loose.push(node); continue; }
    flushLoose();
    const tag = node.tag;
    if (/^h[1-6]$/.test(tag)) {
      const text = inline(node.children).replace(/\n+/g, ' ').trim();
      if (text) out.push(`${'#'.repeat(Math.min(3, Number(tag[1])))} ${text}`);
    } else if (tag === 'ul' || tag === 'ol') {
      const items = listItems(node, tag === 'ol');
      if (items.length) out.push(items.join('\n'));
    } else if (tag === 'blockquote') {
      const inner = [];
      blocks(node.children, inner);
      const text = inner.join('\n').split('\n').filter((line) => line.trim());
      if (text.length) out.push(text.map((line) => `> ${line.replace(/^>\s?/, '')}`).join('\n'));
    } else if (tag === 'pre') {
      out.push(`\`\`\`\n${textOf(node).replace(/\n$/, '')}\n\`\`\``);
    } else if (tag === 'hr') {
      out.push('---');
    } else if (tag === 'table') {
      const rows = tableRows(node);
      if (rows.length) out.push(rows.join('\n'));
    } else if (hasBlocks(node)) {
      blocks(node.children, out);
    } else {
      const body = lines(inline(node.children));
      if (body.some((line) => line.trim())) out.push(body.join('\n'));
    }
  }
  flushLoose();
}

/** The editor's HTML as Markdown. Blocks are separated by one blank line. */
export function htmlToMarkdown(html) {
  const out = [];
  blocks(parseHtml(html).children, out);
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
