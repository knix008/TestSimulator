// The report laid out on paper pages, drawn on canvases (one per page). The print window shows these pages as
// its preview and prints exactly them; the PDF is the same pages as JPEG pictures. So what is seen is printed.
//
// Units: millimetres for the paper, pixels at `dpi` for drawing. Text wraps by words and, inside a long word
// (Korean has few spaces), by characters. Tables wrap their cells. A picture moves to the next page when it does
// not fit and is shrunk to at most the page's content area.

export const PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
export const MARGINS = { narrow: 10, normal: 15, wide: 25 };

const loadImage = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });

/** The paper's size in mm for a setup ({ paper, orientation }). */
export function paperMm({ paper = 'A4', orientation = 'portrait' } = {}) {
  const [w, h] = PAPERS[paper] ?? PAPERS.A4;
  return orientation === 'landscape' ? [h, w] : [w, h];
}

/**
 * doc: the report model (content.js). setup: { paper, orientation, margin ('narrow'|'normal'|'wide'), header (bool),
 * footer (bool), grayscale (bool), scale (0.5…1.5 text size) }. Returns { pages: [canvas], widthMm, heightMm }.
 */
export async function paginate(doc, setup = {}, { dpi = 150, font = 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif' } = {}) {
  const [wMm, hMm] = paperMm(setup);
  const px = dpi / 25.4;
  const W = Math.round(wMm * px); const H = Math.round(hMm * px);
  const M = (MARGINS[setup.margin] ?? MARGINS.normal) * px;
  const raw = Number(setup.scale) || 1; // a factor (1 = 100 %) or a percent
  const scale = Math.max(0.6, Math.min(1.6, raw > 3 ? raw / 100 : raw));
  const pt = (size) => (size * scale * dpi) / 72;
  const headerH = setup.header === false ? 0 : pt(9) * 2.2;
  const footerH = setup.footer === false ? 0 : pt(9) * 2.2;
  const top = M + headerH; const bottom = H - M - footerH; const left = M; const right = W - M; const width = right - left;
  const images = new Map();
  for (const b of doc.blocks) if (b.t === 'image' && b.src && !images.has(b.src)) images.set(b.src, await loadImage(b.src));

  const pages = [];
  let ctx; let y;
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'alphabetic';
    pages.push(c); y = top;
  };
  const setFont = (size, weight = 400) => { ctx.font = `${weight} ${pt(size)}px ${font}`; };
  /** Lines of `text` that fit `max` pixels with the current font. */
  const wrap = (text, max) => {
    const out = [];
    for (const para of String(text ?? '').split('\n')) {
      let line = '';
      const byChars = (word) => { for (const ch of word) { if (line && ctx.measureText(line + ch).width > max) { out.push(line.trimEnd()); line = ch.trimStart(); } else line += ch; } };
      for (const tok of para.split(/(\s+)/).filter(Boolean)) {
        if (ctx.measureText(line + tok).width <= max) { line += tok; continue; }
        if (/^\s+$/.test(tok)) { out.push(line.trimEnd()); line = ''; continue; }
        if (line.trim()) { out.push(line.trimEnd()); line = ''; }
        if (ctx.measureText(tok).width <= max) line = tok; else byChars(tok);
      }
      out.push(line.trimEnd());
    }
    return out;
  };
  const room = (h) => { if (y + h > bottom && y > top + 1) newPage(); };
  const text = (str, size, { weight = 400, color = '#1f2937', gap = 0.5, indent = 0, bullet = '' } = {}) => {
    setFont(size, weight);
    const lh = pt(size) * 1.45;
    const lines = wrap(str, width - indent);
    lines.forEach((ln, i) => {
      room(lh);
      ctx.fillStyle = color;
      if (bullet && i === 0) ctx.fillText(bullet, left + indent - pt(size) * 1.1, y + pt(size));
      ctx.fillText(ln, left + indent, y + pt(size));
      y += lh;
    });
    y += pt(size) * gap;
  };

  newPage();
  // Title block on the first page.
  text(doc.title, 20, { weight: 700, color: '#111827', gap: 0.2 });
  if (doc.subtitle) text(doc.subtitle, 9, { color: '#6b7280', gap: 0.8 });
  ctx.strokeStyle = '#2563eb'; ctx.lineWidth = pt(1.2); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); y += pt(10);

  /** Height the start of a block needs on the same page as the heading before it. */
  const startOf = (b) => {
    if (!b) return 0;
    if (b.t === 'image') { const img = images.get(b.src); if (!img) return 0; const h = Math.min((img.height / img.width) * width, (bottom - top) * 0.92); return h + pt(20); }
    if (b.t === 'table') return pt(8.5) * 1.4 * 3 + pt(12);
    if (b.t === 'kpis') return pt(42);
    return pt(10) * 1.45 * 2;
  };
  doc.blocks.forEach((b, i) => {
    if (/^h[123]$/.test(b.t)) room(pt(b.t === 'h2' ? 40 : 28) + startOf(doc.blocks[i + 1]));
    drawBlock(b);
  });
  function drawBlock(b) {
    switch (b.t) {
      case 'h1': room(pt(30)); text(b.text, 16, { weight: 700, gap: 0.3 }); break;
      case 'h2': room(pt(40)); y += pt(6); text(b.text, 13.5, { weight: 700, color: '#1e3a8a', gap: 0.15 }); ctx.strokeStyle = '#dbe3f4'; ctx.lineWidth = pt(0.8); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); y += pt(6); break;
      case 'h3': room(pt(28)); y += pt(3); text(b.text, 11, { weight: 700, color: '#111827', gap: 0.2 }); break;
      case 'p': text(b.text, 10, { gap: 0.6 }); break;
      case 'note': text(b.text, 9.5, { color: '#6b7280', gap: 0.6 }); break;
      case 'bullets': for (const it of b.items) text(it, 9.5, { indent: pt(12), bullet: '•', gap: 0.1 }); y += pt(4); break;
      case 'kpis': {
        const cols = width > pt(400) ? 4 : 3; const cw = width / cols; const ch = pt(36);
        b.items.forEach(([label, value], i) => {
          if (i % cols === 0) room(ch + pt(6));
          const x = left + (i % cols) * cw;
          ctx.fillStyle = '#f1f5fb'; ctx.strokeStyle = '#d6def0'; ctx.lineWidth = pt(0.6);
          ctx.beginPath(); ctx.roundRect?.(x + pt(2), y, cw - pt(4), ch, pt(4)) ?? ctx.rect(x + pt(2), y, cw - pt(4), ch); ctx.fill(); ctx.stroke();
          setFont(8); ctx.fillStyle = '#6b7280'; ctx.fillText(fit(ctx, label, cw - pt(12)), x + pt(8), y + pt(12));
          setFont(12, 700); ctx.fillStyle = '#111827'; ctx.fillText(fit(ctx, value, cw - pt(12)), x + pt(8), y + pt(28));
          if (i % cols === cols - 1 || i === b.items.length - 1) y += ch + pt(6);
        });
        y += pt(4);
        break;
      }
      case 'table': {
        setFont(8.5);
        const n = b.head.length;
        // Column widths from the longest text in each column (the first, the names, gets more room).
        const want = b.head.map((h, c) => Math.max(ctx.measureText(h).width, ...b.rows.map((r) => ctx.measureText(String(r[c] ?? '')).width)) + pt(10));
        const total = want.reduce((a, v) => a + v, 0);
        const widths = total <= width ? want.map((v) => v + (width - total) / n) : want.map((v) => (v / total) * width);
        const rowLines = (cells, weight) => { setFont(8.5, weight); return cells.map((c, i) => wrap(String(c ?? ''), widths[i] - pt(8))); };
        const lh = pt(8.5) * 1.4;
        const drawRow = (cells, head) => {
          const lines = rowLines(cells, head ? 700 : 400);
          const h = Math.max(...lines.map((l) => l.length)) * lh + pt(6);
          if (y + h > bottom) { newPage(); if (!head) drawRow(b.head, true); }
          let x = left;
          if (head) { ctx.fillStyle = '#e8eefb'; ctx.fillRect(left, y, width, h); }
          lines.forEach((ls, i) => {
            setFont(8.5, head ? 700 : 400); ctx.fillStyle = '#111827';
            const right = (b.align?.[i] ?? 'l') === 'r';
            ls.forEach((ln, k) => ctx.fillText(ln, right ? x + widths[i] - pt(4) - ctx.measureText(ln).width : x + pt(4), y + pt(3) + pt(8.5) + k * lh));
            x += widths[i];
          });
          ctx.strokeStyle = '#d1d9e6'; ctx.lineWidth = pt(0.5); ctx.beginPath(); ctx.moveTo(left, y + h); ctx.lineTo(right, y + h); ctx.stroke();
          y += h;
        };
        room(lh * 3);
        drawRow(b.head, true);
        for (const r of b.rows) drawRow(r, false);
        y += pt(8);
        break;
      }
      case 'image': {
        const img = images.get(b.src);
        if (!img) break;
        const capH = b.caption ? pt(9) * 1.8 : 0;
        let w = width; let h = (img.height / img.width) * w;
        const maxH = (bottom - top) * 0.92 - capH;
        if (h > maxH) { h = maxH; w = (img.width / img.height) * h; }
        room(h + capH + pt(6));
        const x = left + (width - w) / 2;
        ctx.drawImage(img, x, y, w, h);
        ctx.strokeStyle = '#d1d9e6'; ctx.lineWidth = pt(0.5); ctx.strokeRect(x, y, w, h);
        y += h + pt(3);
        if (b.caption) { setFont(8.5); ctx.fillStyle = '#6b7280'; const cw = ctx.measureText(b.caption).width; ctx.fillText(b.caption, left + (width - cw) / 2, y + pt(8.5)); y += capH; }
        y += pt(6);
        break;
      }
      default: break;
    }
  }

  // Header and footer on every page, now that the number of pages is known.
  pages.forEach((c, i) => {
    const g = c.getContext('2d');
    g.font = `400 ${pt(8)}px ${font}`; g.fillStyle = '#6b7280';
    if (headerH) { g.fillText(fit(g, doc.title, width * 0.7), left, M + pt(8)); const app = 'MyProductionFlow'; g.fillText(app, right - g.measureText(app).width, M + pt(8)); g.strokeStyle = '#e5e7eb'; g.lineWidth = pt(0.5); g.beginPath(); g.moveTo(left, M + headerH - pt(4)); g.lineTo(right, M + headerH - pt(4)); g.stroke(); }
    if (footerH) { const label = `${i + 1} / ${pages.length}`; g.fillText(label, (W - g.measureText(label).width) / 2, H - M - pt(2)); }
    if (setup.grayscale) {
      const data = g.getImageData(0, 0, W, H); const d = data.data;
      for (let k = 0; k < d.length; k += 4) { const v = Math.round(d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114); d[k] = v; d[k + 1] = v; d[k + 2] = v; }
      g.putImageData(data, 0, 0);
    }
  });
  return { pages, widthMm: wMm, heightMm: hMm };
}

/** `str` shortened with … to fit `max` pixels. */
function fit(g, str, max) {
  let s = String(str ?? '');
  if (g.measureText(s).width <= max) return s;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}
