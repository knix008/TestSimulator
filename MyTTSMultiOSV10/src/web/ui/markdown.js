// A small Markdown renderer for the user guide window (doc/*.md): headings (with ids for the
// table of contents), paragraphs, images (loaded eagerly: lazy images grew the page and moved
// the target of a contents jump while it scrolled), **bold**, *italic*, `code`, links, images, lists (nested by
// indentation), tables, code blocks, quotes and rules. Pure: no DOM (tests run it in Node).

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** GitHub's heading ids: "9. 저장 (WAV · MP3)" → "9-저장-wav--mp3" (each space one dash), so links work there too. */
export function slug(text) {
  return String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/[*`]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
}

/** Inline markup; `base` prefixes relative image and link paths. */
export function inline(text, base = '') {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
  const url = (href) => (/^(?:[a-z]+:|#|\/)/i.test(href) ? href : base + href);
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${url(src)}" alt="${alt}" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (/^[^/:]*\.md(#|$)/.test(href) || href.startsWith('#')
      ? `<a href="${href}" data-doc-link="${href}">${label}</a>`
      : `<a href="${url(href)}" target="_blank" rel="noopener">${label}</a>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

const isTableRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Markdown → { html, headings: [{ level, text, id }] }. */
export function render(markdown, { base = '' } = {}) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  const used = new Map();
  let i = 0;
  const uniqueId = (text) => {
    const id = slug(text) || 'section';
    const n = used.get(id) || 0;
    used.set(id, n + 1);
    return n ? `${id}-${n}` : id;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const body = [];
      for (i += 1; i < lines.length && !lines[i].startsWith('```'); i += 1) body.push(lines[i]);
      i += 1;
      html.push(`<pre class="md-code"><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = uniqueId(text);
      headings.push({ level, text: text.replace(/[*`]/g, ''), id });
      html.push(`<h${level} id="${id}">${inline(text, base)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { html.push('<hr />'); i += 1; continue; }

    if (line.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i += 1) rows.push(cells(lines[i]));
      html.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c, base)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, base)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i += 1) body.push(lines[i].replace(/^>\s?/, ''));
      html.push(`<blockquote>${render(body.join('\n'), { base }).html}</blockquote>`);
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      // A list, nested by indentation (2 or more spaces per level).
      const items = [];
      for (; i < lines.length; i += 1) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); continue; }
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += ` ${lines[i].trim()}`; continue; }
        break;
      }
      const build = (start, indent) => {
        const ordered = items[start].ordered;
        let out = ordered ? '<ol>' : '<ul>';
        let k = start;
        while (k < items.length && items[k].indent >= indent) {
          if (items[k].indent === indent && items[k].ordered !== ordered) break; // "- a" then "1. b": a new list
          if (items[k].indent > indent) { const [inner, next] = build(k, items[k].indent); out = out.replace(/<\/li>$/, `${inner}</li>`); k = next; continue; }
          out += `<li>${inline(items[k].text, base)}</li>`;
          k += 1;
        }
        return [`${out}${ordered ? '</ol>' : '</ul>'}`, k];
      };
      for (let start = 0; start < items.length;) {
        const [list, next] = build(start, items[start].indent);
        html.push(list);
        start = next > start ? next : start + 1;
      }
      continue;
    }

    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s|\s*(---|\*\*\*)\s*$)/.test(lines[i]); i += 1) {
      if (lines[i].includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1])) break;
      para.push(lines[i].replace(/\s{2,}$/, '\u0001').trim());
    }
    if (!para.length) { html.push(`<p>${inline(lines[i], base)}</p>`); i += 1; continue; }
    html.push(`<p>${para.map((p) => inline(p.replace(/\u0001$/, ''), base) + (p.endsWith('\u0001') ? '<br />' : '')).join(' ')}</p>`);
  }
  return { html: html.join('\n'), headings };
}
