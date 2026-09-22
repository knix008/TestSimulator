// The print document itself (no host code, so test/print.test.mjs can load
// it in plain Node): the page setup, page ranges and buildPrintHtml — see
// print.js for how it reaches the paper.

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// True when the app can put this fs.readFile result on paper itself.
export function canPrintData(data) {
  if (!data) return false;
  if (data.kind === 'text') return !data.truncated;
  if (data.kind === 'image') return !data.truncated && !!data.base64;
  return false;
}

// ── Page setup ──
// Paper sizes in mm (portrait). The names are what electron/main.js maps to printer paper sizes.
export const PAPERS = {
  A4: [210, 297], A3: [297, 420], A5: [148, 210], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
};
export const MARGIN_PRESETS = { normal: 15, none: 0, narrow: 6, wide: 25 };   // mm
export const PRINT_SETUP_DEFAULTS = { paper: 'A4', landscape: false, margin: 'normal', marginMm: 15, scale: 100, header: true, color: true };

// The page setup as it is used: margins in mm, scale within 25–200 %.
export function normalizeSetup(setup) {
  const s = { ...PRINT_SETUP_DEFAULTS, ...(setup || {}) };
  if (!PAPERS[s.paper]) s.paper = 'A4';
  const mm = s.margin === 'custom' ? Number(s.marginMm) : MARGIN_PRESETS[s.margin];
  s.marginMm = Math.max(0, Math.min(50, Number.isFinite(mm) ? mm : 15));
  s.scale = Math.max(25, Math.min(200, Math.round(Number(s.scale) || 100)));
  s.landscape = !!s.landscape;
  s.header = s.header !== false;
  s.color = s.color !== false;
  return s;
}

// The printable area of the setup in mm: [width, height] of the paper minus the margins.
export function contentSizeMm(setup) {
  const s = normalizeSetup(setup);
  const [w, h] = PAPERS[s.paper];
  const pw = s.landscape ? h : w, ph = s.landscape ? w : h;
  return [pw - 2 * s.marginMm, ph - 2 * s.marginMm, pw, ph];
}

// "1-3, 5, 8-" → [{ from, to }] (0-based, inclusive) for webContents.print; null = every page or an unusable string.
export function parsePageRanges(text, pages) {
  const out = [];
  for (const part of String(text || '').split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)?(-)?(\d+)?$/.exec(part);
    if (!m || (!m[1] && !m[3])) return null;
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : (pages || from)) : from;
    if (from < 1 || to < from) return null;
    out.push({ from: from - 1, to: to - 1 });
  }
  return out.length ? out : null;
}

// spec: { title, name, kind: 'text' | 'image', text, mime, base64, wrap, fontSize, tabSize, meta, setup }
// `setup` (see PRINT_SETUP_DEFAULTS) becomes the document's @page rule and zoom, so every renderer
// — the preview PDF, the printer, the browser — lays the pages out the same way.
export function buildPrintHtml(spec) {
  const title = esc(spec.title || spec.name || '');
  const fontSize = Math.max(6, Math.min(24, Number(spec.fontSize) || 10));
  const setup = normalizeSetup(spec.setup);
  const [cw, ch] = contentSizeMm(setup);
  const body = spec.kind === 'image'
    ? `<div class="image"><img src="data:${esc(spec.mime || 'image/png')};base64,${spec.base64}" alt="${title}"></div>`
    : `<pre class="${spec.wrap === false ? 'nowrap' : 'wrap'}">${esc(spec.text)}</pre>`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: ${setup.paper} ${setup.landscape ? 'landscape' : 'portrait'}; margin: ${setup.marginMm}mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", Roboto, Helvetica, Arial, sans-serif; font-size: ${fontSize}pt; zoom: ${setup.scale / 100}; }
  header { font-size: 8pt; color: #444; border-bottom: 1px solid #999; padding-bottom: 3px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 12px; }
  header .name { overflow-wrap: anywhere; }
  header .meta { white-space: nowrap; }
  pre { margin: 0; font-family: "Cascadia Mono", Consolas, "D2Coding", "Menlo", "DejaVu Sans Mono", monospace; font-size: ${fontSize}pt; line-height: 1.35; tab-size: ${Number(spec.tabSize) || 4}; }
  pre.wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
  pre.nowrap { white-space: pre; }
  .image { text-align: center; }
  .image img { max-width: 100%; max-height: ${Math.max(20, Math.floor((ch - (setup.header ? 10 : 0)) / (setup.scale / 100)))}mm; object-fit: contain; }
  ${setup.color ? '' : 'html { filter: grayscale(1); -webkit-print-color-adjust: exact; }'}
  @media screen { body { padding: 0; } }
</style>
</head>
<body data-content-mm="${cw}x${ch}">
${setup.header ? `<header><span class="name">${title}</span><span class="meta">${esc(spec.meta || '')}</span></header>` : ''}
${body}
</body>
</html>`;
}
