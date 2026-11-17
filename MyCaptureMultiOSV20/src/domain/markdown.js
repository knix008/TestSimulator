// A small Markdown renderer for the user's guide window (doc/UsersGuide*.md).
// It covers what the guide uses: headings, paragraphs, lists (nested by
// indentation), tables, fenced code, block quotes, rules, and inline code,
// bold, italic and links. Everything is escaped first, so the result is safe.

const escape = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Heading id: lower case, letters (any script) and digits joined by dashes. */
export function slug(text) {
  return String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
}

/** Inline markup on one line of (unescaped) text. `image(path)` turns a picture path into a URL (null = leave it out). */
export function inline(text, image = currentImage) {
  const codes = [];
  let out = escape(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
      const url = /^(javascript|data):/i.test(src) ? null : image(src);
      return url ? `<img src="${url}" alt="${alt}" decoding="async" />` : '';
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      // Links to other documents (Tutorial.md) are handled by the window showing them.
      if (!/^(https?:|#|mailto:)/i.test(href)) return `<a href="#" data-link="${href}">${label}</a>`;
      return `<a href="${href}" ${href.startsWith('#') ? '' : 'target="_blank" rel="noreferrer"'}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

/** Turns a picture path into a URL while a document is rendered (renderMarkdown's `image` option). */
let currentImage = (src) => src;

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
/** Cells of a table row; `\|` is a pipe inside a cell. */
const cells = (line) => line.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
const listMatch = (line) => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
const indentOf = (line) => /^\s*/.exec(line)[0].replace(/\t/g, '  ').length;

/** Renders a list starting at `start`; returns [html, next index]. */
function renderList(lines, start) {
  const first = listMatch(lines[start]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const match = listMatch(lines[i]);
    if (!match || match[1].length !== indent) break;
    const parts = [match[3]];
    let nested = '';
    i += 1;
    while (i < lines.length && lines[i].trim() !== '') {
      const sub = listMatch(lines[i]);
      if (sub && sub[1].length > indent) {
        const [html, next] = renderList(lines, i);
        nested += html;
        i = next;
      } else if (!sub && indentOf(lines[i]) > indent) {
        parts.push(lines[i].trim());
        i += 1;
      } else {
        break;
      }
    }
    items.push(`<li>${inline(parts.join(' '))}${nested}</li>`);
    // A blank line between items of the same list keeps the list going.
    const after = listMatch(lines[i + 1] ?? '');
    if (lines[i]?.trim() === '' && after?.[1].length === indent && /\d/.test(after[2]) === ordered) i += 1;
    // A numbered list right after a bulleted one (or the reverse) is a new list.
    const following = listMatch(lines[i] ?? '');
    if (following && following[1].length === indent && /\d/.test(following[2]) !== ordered) break;
  }
  const tag = ordered ? 'ol' : 'ul';
  // A numbered list split by a picture or a table goes on counting ("4." after a figure).
  const number = ordered ? parseInt(lines[start].trim(), 10) : 1;
  return [`<${tag}${number > 1 ? ` start="${number}"` : ''}>${items.join('')}</${tag}>`, i];
}

/**
 * Markdown → { html, headings }. `headings` lists [{ level, text, id }] for
 * levels 1–3, for the table of contents. Ids are unique within the document.
 */
export function renderMarkdown(source, { image = (src) => src } = {}) {
  const before = currentImage;
  currentImage = image;
  try {
    return renderBlocks(source);
  } finally {
    currentImage = before;
  }
}

function renderBlocks(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  const used = new Map();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = /^\s*(```|~~~)\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i += 1;
      // Code inside a list item is indented; drop the common indentation.
      const cut = Math.min(...body.filter((text) => text.trim()).map(indentOf), Infinity);
      const text = body.map((text) => text.slice(Number.isFinite(cut) ? cut : 0)).join('\n');
      html.push(`<pre><code${fence[2] ? ` class="language-${escape(fence[2])}"` : ''}>${escape(text)}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const base = slug(text);
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      const id = count ? `${base}-${count + 1}` : base;
      if (level <= 3) headings.push({ level, text: text.replace(/[*`]/g, ''), id });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      html.push('<hr />');
      i += 1;
      continue;
    }

    if (isTableRow(line) && isTableRule(lines[i + 1] ?? '')) {
      const head = cells(line);
      const aligns = cells(lines[i + 1]).map((cell) => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : ''));
      const style = (index) => (aligns[index] ? ` style="text-align:${aligns[index]}"` : '');
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      html.push(`<table><thead><tr>${head.map((cell, index) => `<th${style(index)}>${inline(cell)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td${style(index)}>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${renderBlocks(body.join('\n')).html}</blockquote>`);
      continue;
    }

    if (listMatch(line)) {
      const [list, next] = renderList(lines, i);
      html.push(list);
      i = next;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>)/.test(lines[i]) && !listMatch(lines[i])
      && !(isTableRow(lines[i]) && isTableRule(lines[i + 1] ?? ''))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    // A line no rule above took (say "```js extra") is plain text: never stall on it.
    if (!paragraph.length) paragraph.push(lines[i++].trim());
    // A picture on its own line is a figure, with its description underneath.
    const figure = paragraph.length === 1 && /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(paragraph[0]);
    if (figure) {
      const picture = inline(paragraph[0]);
      if (picture) html.push(`<figure>${picture}${figure[1] ? `<figcaption>${escape(figure[1])}</figcaption>` : ''}</figure>`);
    } else {
      html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
  }
  return { html: html.join('\n'), headings };
}
