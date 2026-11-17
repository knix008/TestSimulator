export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(value) {
  return escapeHtml(value);
}

function safeUrl(href) {
  const url = String(href || '').trim();
  if (!/^(https?:|mailto:)/i.test(url)) return '';
  if (/[\s"'<>]/.test(url)) return '';
  return url;
}

function fileByRef(href, files) {
  const match = /^attachment:([A-Za-z0-9_-]+)$/.exec(String(href || '').trim());
  if (!match) return null;
  return (files || []).find((file) => file.id === match[1]) || null;
}

function imageTag(src, alt, file) {
  const name = file?.name || alt || 'image';
  const id = file?.id ? ` data-file="${attr(file.id)}"` : '';
  return `<img class="md-image" src="${attr(src)}" alt="${attr(alt || name)}" data-name="${attr(name)}"${id}>`;
}

function fileLink(href, label, file) {
  const name = file?.name || label || 'file';
  const id = file?.id ? ` data-file="${attr(file.id)}"` : '';
  return `<a class="file-link" href="${attr(href)}" data-name="${attr(name)}"${id} download="${attr(name)}">${label || escapeHtml(name)}</a>`;
}

function inline(source, files) {
  return source
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt, href) => {
      const file = fileByRef(href, files);
      if (file && /^data:image\//i.test(file.data || '')) return imageTag(file.data, alt, file);
      if (file) return fileLink(file.data || '', alt || escapeHtml(file.name), file);
      if (/^data:image\//i.test(href)) return imageTag(href, alt, null);
      const url = safeUrl(href);
      if (url && /^https?:/i.test(url)) return imageTag(url, alt, null);
      return alt;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
      const file = fileByRef(href, files);
      if (file) return fileLink(file.data || '', label, file);
      if (/^data:(image|text|application)\//i.test(href)) return fileLink(href, label, null);
      const url = safeUrl(href);
      if (!url) return label;
      if (/^mailto:/i.test(url)) return `<a href="${attr(url)}">${label}</a>`;
      return `<a href="${attr(url)}" data-external="${attr(url)}">${label}</a>`;
    });
}

/** Markdown label for a file that was just added to a page or a document. */
export function writingEmbed(file) {
  const name = String(file?.name || 'file').replace(/[[\]()\n\r]/g, ' ').trim().slice(0, 80) || 'file';
  const image = /^image\//i.test(file?.mime || '') || /^data:image\//i.test(file?.data || '');
  return image ? `![${name}](attachment:${file.id})` : `[${name}](attachment:${file.id})`;
}

function isRule(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function table(rows, files) {
  const split = rows.map((row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  const head = split.length > 1 && isRule(split[1]) ? split[0] : null;
  const body = head ? split.slice(2) : split;
  const header = head ? `<thead><tr>${head.map((cell) => `<th>${inline(cell, files)}</th>`).join('')}</tr></thead>` : '';
  const rendered = body.filter((row) => !isRule(row)).map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, files)}</td>`).join('')}</tr>`).join('');
  return `<table>${header}<tbody>${rendered}</tbody></table>`;
}

/** A small Markdown subset for descriptions, comments and the guides: headings, lists, tables, quotes, code, links, images. */
export function renderMarkdown(source, files = []) {
  const lines = escapeHtml(source).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let list = null;
  let paragraph = [];
  let code = null;
  let grid = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${paragraph.map((line) => inline(line, files)).join('<br>')}</p>`;
    paragraph = [];
  };
  const closeList = () => {
    if (!list) return;
    html += list.type === 'ol' ? `<ol>${list.items.join('')}</ol>` : `<ul>${list.items.join('')}</ul>`;
    list = null;
  };
  const closeTable = () => {
    if (!grid) return;
    html += table(grid, files);
    grid = null;
  };
  const flush = () => { flushParagraph(); closeList(); closeTable(); };
  for (const line of lines) {
    if (code) {
      if (line.trim() === '```') {
        html += `<pre><code>${code.join('\n')}</code></pre>`;
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.trim().startsWith('```')) {
      flush();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.trim().startsWith('|')) {
      flushParagraph();
      closeList();
      grid = grid || [];
      grid.push(line.trim());
      continue;
    }
    closeTable();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${inline(heading[2], files)}</h${level}>`;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      html += '<hr>';
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list || list.type !== 'ul') { closeList(); list = { type: 'ul', items: [] }; }
      list.items.push(`<li>${inline(bullet[1], files)}</li>`);
      continue;
    }
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (!list || list.type !== 'ol') { closeList(); list = { type: 'ol', items: [] }; }
      list.items.push(`<li>${inline(numbered[1], files)}</li>`);
      continue;
    }
    const quote = /^&gt;\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      html += `<blockquote>${inline(quote[1], files)}</blockquote>`;
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  if (code) html += `<pre><code>${code.join('\n')}</code></pre>`;
  flush();
  return html;
}

/** HTML, Word, and Markdown for one page or document. Images stay inside the file. */
export function writingExport(title, body, files = []) {
  const safeTitle = escapeHtml(title || 'Page');
  const htmlBody = renderMarkdown(body || '', files);
  const style = 'body{font-family:sans-serif;max-width:760px;margin:32px auto;line-height:1.5}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>${style}</style></head><body><h1>${safeTitle}</h1>${htmlBody}</body></html>`;
  const markdown = String(body || '').replace(/\(attachment:([A-Za-z0-9_-]+)\)/g, (match, id) => {
    const file = (files || []).find((item) => item.id === id);
    return file?.data ? `(${file.data})` : match;
  });
  const filename = String(title || 'page').replace(/[^\w가-힣.-]+/g, '_').replace(/^_|_$/g, '') || 'page';
  return { html, markdown, filename };
}
