export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(source) {
  return source
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
      const url = href.trim();
      if (!/^(https?:|mailto:)/i.test(url)) return label;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
}

function isRule(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function table(rows) {
  const split = rows.map((row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  const head = split.length > 1 && isRule(split[1]) ? split[0] : null;
  const body = head ? split.slice(2) : split;
  const header = head ? `<thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>` : '';
  const rendered = body.filter((row) => !isRule(row)).map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('');
  return `<table>${header}<tbody>${rendered}</tbody></table>`;
}

/** A small Markdown subset for descriptions, comments and the guides: headings, lists, tables, quotes, code, links. */
export function renderMarkdown(source) {
  const lines = escapeHtml(source).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let list = null;
  let paragraph = [];
  let code = null;
  let grid = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${paragraph.map(inline).join('<br>')}</p>`;
    paragraph = [];
  };
  const closeList = () => {
    if (!list) return;
    html += list.type === 'ol' ? `<ol>${list.items.join('')}</ol>` : `<ul>${list.items.join('')}</ul>`;
    list = null;
  };
  const closeTable = () => {
    if (!grid) return;
    html += table(grid);
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
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
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
      list.items.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (!list || list.type !== 'ol') { closeList(); list = { type: 'ol', items: [] }; }
      list.items.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }
    const quote = /^&gt;\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      html += `<blockquote>${inline(quote[1])}</blockquote>`;
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  if (code) html += `<pre><code>${code.join('\n')}</code></pre>`;
  flush();
  return html;
}
