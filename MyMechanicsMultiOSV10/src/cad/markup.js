// Markup (collaboration): notes drawn over a view of the model — freehand pen, highlighter, line, arrow, rectangle,
// ellipse and text — kept in the document as named markups, each with the camera it was drawn on, its author and
// date, a review status and a comment thread. Points are stored as fractions of the view (x of the width, y of the
// height, 0..1) so a markup lands on the same place of the model at any window size; line widths and text sizes are
// pixels of the view height the markup was drawn at (`size[1]`) and scale with the height.

export const KINDS = ['pen', 'highlight', 'line', 'arrow', 'rect', 'ellipse', 'text', 'cloud'];
export const COLOURS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#212121', '#ffffff'];

/** The markups of a document (a part, assembly or drawing); created when asked. */
export function markupsOf(doc, { create = false } = {}) {
  if (!doc) return null;
  if (!Array.isArray(doc.markups) && create) doc.markups = [];
  return doc.markups ?? null;
}

/** The width of a line of text in em: wide scripts (Hangul, CJK, full-width forms) one em a character, others about 0.6. */
export const textEm = (line) => { let w = 0; for (const ch of line) { const c = ch.codePointAt(0); w += (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 1 : 0.6; } return w; };

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const pt = (p) => [clamp01(p?.[0]), clamp01(p?.[1])];

/** A clean item: a known kind, points in 0..1, a colour, width and (for text) the text. Null when unusable. */
export function normaliseItem(it) {
  if (!it || !KINDS.includes(it.kind)) return null;
  const pts = (it.pts ?? []).map(pt);
  const need = it.kind === 'text' ? 1 : 2;
  if (pts.length < need) return null;
  const out = { id: String(it.id ?? ''), kind: it.kind, pts: it.kind === 'pen' || it.kind === 'highlight' ? pts : pts.slice(0, need), color: /^#[0-9a-f]{6}$/i.test(it.color ?? '') ? it.color.toLowerCase() : COLOURS[0], width: Math.min(40, Math.max(1, Number(it.width) || 3)) };
  if (it.kind === 'highlight') out.width = Math.max(out.width, 8);
  if (it.kind === 'text') { out.text = String(it.text ?? '').slice(0, 2000); if (!out.text.trim()) return null; out.size = Math.min(96, Math.max(8, Number(it.size) || 16)); }
  return out;
}

/** A new markup: name, author, ISO date, the camera, the view size [w, h] it was drawn at, no items yet. */
export function createMarkup({ id, name, author = '', date = new Date().toISOString(), camera = null, size = [1000, 1000] }) {
  return { id, name, author, date, camera, size: [Math.max(1, size[0] | 0), Math.max(1, size[1] | 0)], status: 'open', items: [], comments: [] };
}

/** Adds a comment to a markup (author, ISO date, text); returns it, or null for an empty text. */
export function addComment(markup, { id, author = '', text, date = new Date().toISOString() }) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const c = { id, author, date, text: s };
  markup.comments.push(c);
  return c;
}

// ───────────────────────── strokes

const distSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const s = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - (a[0] + s * dx), p[1] - (a[1] + s * dy));
};

/** Ramer–Douglas–Peucker: the stroke with the points closer than `tol` to the simplified line dropped (ends kept). */
export function simplifyStroke(points, tol = 0.002) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1, d = tol;
    for (let k = i + 1; k < j; k++) { const e = distSeg(points[k], points[i], points[j]); if (e > d) { d = e; far = k; } }
    if (far >= 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return points.filter((_, k) => keep[k]);
}

/** The bounding box of an item in view fractions [x0, y0, x1, y1] (text: an estimate from its size and length). */
export function itemBounds(it, aspect = 1, refH = 1000) {
  const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]);
  let x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  if (it.kind === 'text') {
    const lines = it.text.split('\n');
    const h = (it.size * 1.25 * lines.length) / refH;
    const w = (Math.max(...lines.map(textEm)) * it.size) / refH / aspect;
    x1 = x0 + w; y1 = y0 + h;
  }
  return [x0, y0, x1, y1];
}

/**
 * Whether a view point (fractions) touches an item within `tol` (fractions of the height): the stroke or outline
 * for lines and shapes (inside too for text), so the eraser and the selection hit what is drawn.
 */
export function hitItem(it, p, tol = 0.01, aspect = 1, refH = 1000) {
  // Distances measured in height fractions: x is scaled by the aspect (w / h).
  const S = (q) => [q[0] * aspect, q[1]];
  const P = S(p);
  const pad = tol + it.width / refH / 2;
  if (it.kind === 'text') { const [x0, y0, x1, y1] = itemBounds(it, aspect, refH); return p[0] >= x0 - tol / aspect && p[0] <= x1 + tol / aspect && p[1] >= y0 - tol && p[1] <= y1 + tol; }
  if (it.kind === 'rect' || it.kind === 'cloud') {
    const [a, b] = it.pts.map(S); const c = [a[0], b[1]], d = [b[0], a[1]];
    return Math.min(distSeg(P, a, d), distSeg(P, d, b), distSeg(P, b, c), distSeg(P, c, a)) <= pad + (it.kind === 'cloud' ? 0.012 : 0);
  }
  if (it.kind === 'ellipse') {
    const [a, b] = it.pts.map(S); const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
    if (rx < 1e-9 || ry < 1e-9) return distSeg(P, a, b) <= pad;
    // Distance to the ellipse, sampled (fine enough for picking).
    let best = Infinity, prev = null;
    for (let k = 0; k <= 64; k++) { const t = (k / 64) * 2 * Math.PI; const q = [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]; if (prev) best = Math.min(best, distSeg(P, prev, q)); prev = q; }
    return best <= pad;
  }
  const pts = it.pts.map(S);
  for (let k = 1; k < pts.length; k++) if (distSeg(P, pts[k - 1], pts[k]) <= pad) return true;
  return pts.length === 1 && Math.hypot(P[0] - pts[0][0], P[1] - pts[0][1]) <= pad;
}

/** The item moved by (dx, dy) view fractions (kept inside the view). */
export function moveItem(it, dx, dy) {
  return { ...it, pts: it.pts.map((p) => [clamp01(p[0] + dx), clamp01(p[1] + dy)]) };
}

// ───────────────────────── drawing

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f2 = (v) => (Math.round(v * 100) / 100).toString();

/** A revision cloud along the rectangle a–b: arcs bulging outward, about `r` px each. */
function cloudPath(a, b, r) {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  let d = `M${f2(x0)} ${f2(y0)}`;
  for (let k = 0; k < 4; k++) {
    const [p, q] = [corners[k], corners[k + 1]];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.max(1, Math.round(L / (2 * r)));
    for (let i = 1; i <= n; i++) { const x = p[0] + ((q[0] - p[0]) * i) / n, y = p[1] + ((q[1] - p[1]) * i) / n; const rr = L / n / 2; d += ` A${f2(rr)} ${f2(rr)} 0 0 1 ${f2(x)} ${f2(y)}`; }
  }
  return `${d} Z`;
}

/** One item as SVG elements for a view w × h px (the markup drawn at height refH). */
export function itemSvg(it, w, h, refH = h) {
  const k = h / refH;
  const P = (p) => [p[0] * w, p[1] * h];
  const sw = f2(it.width * k);
  const stroke = `stroke="${it.color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const data = `data-mk-item="${esc(it.id)}"`;
  switch (it.kind) {
    case 'pen': case 'highlight': {
      const pts = it.pts.map(P).map((p) => `${f2(p[0])},${f2(p[1])}`).join(' ');
      return `<polyline ${data} points="${pts}" ${stroke}${it.kind === 'highlight' ? ' stroke-opacity="0.4" style="mix-blend-mode:multiply"' : ''}/>`;
    }
    case 'line': { const [a, b] = it.pts.map(P); return `<line ${data} x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" ${stroke}/>`; }
    case 'arrow': {
      const [a, b] = it.pts.map(P); const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; const head = Math.min(L * 0.6, 6 + it.width * k * 3);
      const bx = b[0] - ux * head, by = b[1] - uy * head, nx = -uy * head * 0.5, ny = ux * head * 0.5;
      return `<g ${data}><line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(bx)}" y2="${f2(by)}" ${stroke}/><polygon points="${f2(b[0])},${f2(b[1])} ${f2(bx + nx)},${f2(by + ny)} ${f2(bx - nx)},${f2(by - ny)}" fill="${it.color}" stroke="${it.color}" stroke-width="${f2(Math.max(1, it.width * k * 0.5))}" stroke-linejoin="round"/></g>`;
    }
    case 'rect': { const [a, b] = it.pts.map(P); return `<rect ${data} x="${f2(Math.min(a[0], b[0]))}" y="${f2(Math.min(a[1], b[1]))}" width="${f2(Math.abs(b[0] - a[0]))}" height="${f2(Math.abs(b[1] - a[1]))}" ${stroke}/>`; }
    case 'ellipse': { const [a, b] = it.pts.map(P); return `<ellipse ${data} cx="${f2((a[0] + b[0]) / 2)}" cy="${f2((a[1] + b[1]) / 2)}" rx="${f2(Math.abs(b[0] - a[0]) / 2)}" ry="${f2(Math.abs(b[1] - a[1]) / 2)}" ${stroke}/>`; }
    case 'cloud': { const [a, b] = it.pts.map(P); return `<path ${data} d="${cloudPath(a, b, Math.max(6, 10 * k))}" ${stroke}/>`; }
    case 'text': {
      const [a] = it.pts.map(P); const fs = it.size * k; const lines = it.text.split('\n');
      const tw = Math.max(...lines.map(textEm)) * fs, th = fs * 1.25 * lines.length;
      const spans = lines.map((l, i) => `<tspan x="${f2(a[0] + fs * 0.3)}" y="${f2(a[1] + fs * (1 + 1.25 * i))}">${esc(l)}</tspan>`).join('');
      return `<g ${data}><rect x="${f2(a[0])}" y="${f2(a[1])}" width="${f2(tw + fs * 0.6)}" height="${f2(th + fs * 0.3)}" rx="${f2(fs * 0.2)}" fill="#fffde7" fill-opacity="0.92" stroke="${it.color}" stroke-width="${f2(Math.max(1, k))}"/><text font-family="Segoe UI, Arial, sans-serif" font-size="${f2(fs)}" fill="${it.color === '#ffffff' || it.color === '#fdd835' ? '#212121' : it.color}">${spans}</text></g>`;
    }
    default: return '';
  }
}

/** The whole markup as one SVG document w × h px (transparent background; laid over a picture of the view). */
export function markupSvg(markup, w, h, { selected = null } = {}) {
  const refH = markup.size?.[1] ?? h;
  const body = markup.items.map((it) => itemSvg(it, w, h, refH)).join('');
  let sel = '';
  const it = markup.items.find((x) => x.id === selected);
  if (it) { const [x0, y0, x1, y1] = itemBounds(it, w / h, refH); const pad = 4 + (it.width * h) / refH / 2; sel = `<rect class="mk-sel" x="${f2(x0 * w - pad)}" y="${f2(y0 * h - pad)}" width="${f2((x1 - x0) * w + 2 * pad)}" height="${f2((y1 - y0) * h + 2 * pad)}" fill="none" stroke="#1e88e5" stroke-width="1" stroke-dasharray="4 3"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}${sel}</svg>`;
}

/**
 * One HTML review document of markups: per markup its picture (a PNG data URL of the view with the markup on it),
 * author, date, status and comments. `labels` gives the words (the app passes them in the user's language).
 */
export function markupReportHtml(title, entries, labels = {}) {
  const L = { author: 'Author', date: 'Date', status: 'Status', open: 'Open', resolved: 'Resolved', comments: 'Comments', none: 'No comments', ...labels };
  const day = (d) => (d ? String(d).replace('T', ' ').slice(0, 16) : '');
  const sections = entries.map((e, i) => `<section><h2>${i + 1}. ${esc(e.name)}</h2><p class="meta">${esc(L.author)}: ${esc(e.author || '—')} · ${esc(L.date)}: ${esc(day(e.date))} · ${esc(L.status)}: <b class="${e.status === 'resolved' ? 'ok' : 'open'}">${esc(e.status === 'resolved' ? L.resolved : L.open)}</b></p>${e.png ? `<img src="${e.png}" alt="${esc(e.name)}"/>` : ''}<h3>${esc(L.comments)}</h3>${e.comments?.length ? `<ul>${e.comments.map((c) => `<li><b>${esc(c.author || '—')}</b> <span class="meta">${esc(day(c.date))}</span><br/>${esc(c.text).replace(/\n/g, '<br/>')}</li>`).join('')}</ul>` : `<p class="meta">${esc(L.none)}</p>`}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222;background:#fff}h1{font-size:22px}h2{font-size:17px;margin:28px 0 4px}h3{font-size:14px;margin:12px 0 4px}.meta{color:#666;font-size:12px}img{max-width:100%;border:1px solid #ccc}ul{padding-left:18px}li{margin:6px 0}.ok{color:#2e7d32}.open{color:#c62828}section{page-break-inside:avoid}</style></head><body><h1>${esc(title)}</h1>${sections}</body></html>`;
}
