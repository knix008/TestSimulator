// The page that carries the rendered sheets to the printer. Kept apart from
// print.js (which renders the pages) so the desktop bridge, loaded before
// everything else, can import it on its own.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// One image per sheet, each on its own piece of paper.
export function buildPrintHtml(sources, title) {
  const body = sources.map((s) => (
    `<div class="sheet"><img src="${s.src}" alt=""></div>`
  )).join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Print')}</title>
<style>
  @page { size: auto; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet {
    page-break-after: always; break-after: page;
    display: flex; align-items: center; justify-content: center;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet img { max-width: 100%; display: block; }
  @media screen { .sheet img { max-height: 100vh; } }
</style></head>
<body>${body}</body></html>`;
}
