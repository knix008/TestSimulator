// A small Markdown renderer for the user guide window. It covers what UserGuide.md uses:
// headings, paragraphs, lists, tables, code blocks, rules, block quotes, images, links,
// **bold**, *italic* and `code`. Everything else is shown as text, never as HTML.

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Heading anchors the way GitHub makes them, so "#1-시작하기" links keep working. */
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function inline(text, resolveImage = (src) => src) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    `<img src="${escapeHtml(resolveImage(src))}" alt="${alt}" loading="lazy" />`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safe = /^(#|https?:|mailto:)/i.test(href) ? href : '#';
    return `<a href="${safe}"${safe.startsWith('#') ? '' : ' target="_blank" rel="noreferrer"'}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * Renders Markdown to HTML. Returns { html, headings } where headings lists every
 * level 2 and 3 heading ({ level, text, id }) for the table of contents.
 */
export function renderMarkdown(source, { resolveImage } = {}) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  const used = new Map();
  const fmt = (text) => inline(text, resolveImage);
  let i = 0;

  const uniqueId = (text) => {
    const base = slugify(text) || 'section';
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      html.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = uniqueId(text);
      if (level === 2 || level === 3) headings.push({ level, text, id });
      html.push(`<h${level} id="${escapeHtml(id)}">${fmt(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      html.push('<hr />');
      i += 1;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      html.push(
        `<table><thead><tr>${head.map((cell) => `<th>${fmt(cell)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${fmt(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${renderMarkdown(body.join('\n'), { resolveImage }).html}</blockquote>`);
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const marker = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        let item = lines[i++].replace(marker, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !marker.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(`<li>${fmt(item)}</li>`);
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{1,6}\s|```|>|\s*\||\s*[-*+]\s|\s*\d+[.)]\s|\s*(---|\*\*\*|___)\s*$)/.test(lines[i])
    ) paragraph.push(lines[i++].trim());
    const text = paragraph.join(' ');
    // A paragraph that is only a picture becomes a figure with its caption.
    const figure = text.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    html.push(figure
      ? `<figure>${fmt(text)}${figure[1] ? `<figcaption>${escapeHtml(figure[1])}</figcaption>` : ''}</figure>`
      : `<p>${fmt(text)}</p>`);
  }

  return { html: html.join('\n'), headings };
}
