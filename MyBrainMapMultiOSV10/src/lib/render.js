// Draws a laid-out map as SVG markup.
//
// The canvas (components/MapCanvas.jsx) puts this markup in its <svg> and
// finds what was clicked through the data-* attributes (data-id on a topic,
// data-fold on a collapse handle, data-badge on a note / link / attachment
// badge, data-rel on a relationship). Exported pictures (SVG, PNG, PDF,
// print) are the same markup in a standalone document, so the map looks the
// same everywhere.
import { markerSvg } from './markers.js';
import { relationshipGeometry, FOLD_R } from './layout.js';
import { mix } from './mapstyles.js';
import { shapeOutline, cloudPath } from './shapes.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (v) => Math.round(v * 10) / 10;

function shapePath(shape, w, h, role) {
  return `<path d="${shapeOutline(shape, w, h, role)}"/>`;
}

const BADGES = {
  notes: (c) => `<rect x="4" y="2.5" width="16" height="19" rx="2" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  link: (c) => `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
  comments: (c) => `<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M8 9h8M8 12.5h5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  attachments: (c) => `<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
};

function topicMarkup(n, ms, opts) {
  const { st, m, w, h, topic } = n;
  const parts = [];
  const cls = ['tm-topic', `tm-${st.role}`];
  if (opts.dim && opts.dim.has(n.id)) cls.push('tm-dim');
  if (opts.hit && opts.hit.has(n.id)) cls.push('tm-hit-match');
  parts.push(`<g class="${cls.join(' ')}" data-id="${esc(n.id)}" transform="translate(${r(n.x)} ${r(n.y)})">`);
  parts.push(`<rect class="tm-area" width="${w}" height="${h}" fill="none"/>`);
  const shape = st.shape;
  if (shape === 'underline') {
    if (st.borderWidth > 0) parts.push(`<path d="M0 ${r(h - st.borderWidth / 2)} H${w}" stroke="${esc(st.border)}" stroke-width="${st.borderWidth}" stroke-linecap="round" fill="none"/>`);
  } else if (shape !== 'none') {
    const stroke = st.borderWidth > 0 ? ` stroke="${esc(st.border)}" stroke-width="${st.borderWidth}"` : '';
    const sh = shapePath(shape, w, h, st.role);
    parts.push(sh.replace(/\/>$/, ` class="tm-shape" fill="${esc(st.fill === 'none' ? 'none' : st.fill)}"${stroke}/>`));
  }
  if (m.image && topic.image) {
    parts.push(`<image href="${esc(topic.image.src)}" x="${r(m.image.x)}" y="${r(m.image.y)}" width="${r(m.image.w)}" height="${r(m.image.h)}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  m.icons.forEach((id, i) => {
    const x = m.iconsX + i * (m.iconSize + 3);
    parts.push(`<g class="tm-icon" data-icon="${esc(id)}" transform="translate(${r(x)} ${r(m.iconsY)}) scale(${r(m.iconSize / 24 * 1000) / 1000})">${markerSvg(id)}</g>`);
  });
  // text
  const deco = [st.underline ? 'underline' : '', st.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  const anchor = m.align === 'left' ? 'start' : m.align === 'right' ? 'end' : 'middle';
  const tx = m.align === 'left' ? m.textX : m.align === 'right' ? m.textX + m.textW : m.textX + m.textW / 2;
  const asc = m.fontSize * 0.98;
  const lines = m.lines.map((ln, i) => `<tspan x="${r(tx)}" y="${r(m.textY + i * m.lineH + (m.lineH - m.fontSize * 1.32) / 2 + asc)}">${esc(ln.text) || ''}</tspan>`).join('');
  if (m.lines.some((l) => l.text)) {
    parts.push(`<text class="tm-text" font-family="${esc(fontFamily(st))}" font-size="${m.fontSize}" font-weight="${st.bold ? 700 : 400}"${st.italic ? ' font-style="italic"' : ''}${deco ? ` text-decoration="${deco}"` : ''} fill="${esc(st.color)}" text-anchor="${anchor}">${lines}</text>`);
  }
  m.badges.forEach((b, i) => {
    const x = m.badgesX + i * (m.badgeSize + 2);
    parts.push(`<g class="tm-badge" data-badge="${b}" data-id="${esc(n.id)}" transform="translate(${r(x)} ${r(m.badgesY)}) scale(${r(m.badgeSize / 24 * 1000) / 1000})"><rect width="24" height="24" fill="none" class="tm-area"/><g opacity="0.8">${BADGES[b](esc(st.color))}</g></g>`);
  });
  if (m.tags.length) {
    let x = m.tagsX;
    const bg = mix(st.branch || ms.line.color, ms.bg, ms.dark ? 0.55 : 0.78);
    const fg = ms.dark ? '#f2f5f9' : '#1f2933';
    for (const g of m.tags) {
      parts.push(`<rect x="${r(x)}" y="${r(m.tagsY)}" width="${r(g.w)}" height="${m.tagH}" rx="${r(m.tagH / 2)}" fill="${esc(bg)}"/>`);
      parts.push(`<text x="${r(x + g.w / 2)}" y="${r(m.tagsY + m.tagH * 0.7)}" font-family="${esc(fontFamily(st))}" font-size="${m.tagFs}" font-weight="500" fill="${fg}" text-anchor="middle">${esc(g.text)}</text>`);
      x += g.w + 4;
    }
  }
  if (m.task) {
    parts.push(`<text class="tm-task" x="${r(m.taskX)}" y="${r(m.taskY + m.taskFs * 1.05)}" font-family="${esc(fontFamily(st))}" font-size="${m.taskFs}" fill="${esc(st.color)}" opacity="0.75">${esc(m.task)}</text>`);
  }
  if (n.fold && (n.fold.collapsed || !opts.static)) {
    const f = n.fold;
    const c = st.branch || ms.line.color;
    parts.push(`<g class="tm-fold ${f.collapsed ? 'collapsed' : 'open'}" data-fold="${esc(n.id)}" transform="translate(${r(f.x)} ${r(f.y)})">`);
    if (f.collapsed) {
      const label = f.count > 99 ? '99+' : String(f.count);
      const fw = Math.max(FOLD_R * 2, label.length * 6.5 + 6);
      parts.push(`<rect x="${r(-fw / 2)}" y="${-FOLD_R}" width="${r(fw)}" height="${FOLD_R * 2}" rx="${FOLD_R}" fill="${esc(ms.bg)}" stroke="${esc(c)}" stroke-width="1.5"/><text y="3.6" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${esc(c)}" text-anchor="middle">${label}</text>`);
    } else {
      parts.push(`<circle r="${FOLD_R}" fill="${esc(ms.bg)}" stroke="${esc(c)}" stroke-width="1.5"/><path d="M-3.5 0H3.5" stroke="${esc(c)}" stroke-width="1.6" stroke-linecap="round"/>`);
    }
    parts.push('</g>');
  }
  parts.push('</g>');
  return parts.join('');
}

export function fontFamily(st) {
  return st.font || "-apple-system, 'Segoe UI', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', Roboto, sans-serif";
}

function boundaryMarkup(b, ms, opts) {
  const { x0, y0, x1, y1 } = b.rect;
  const c = esc(b.color);
  const dim = opts.dim && opts.dim.has(b.id) ? ' tm-dim' : '';
  const dash = b.dash ? ' stroke-dasharray="6 4"' : '';
  let shape;
  if (b.shape === 'cloud') shape = `<path d="${cloudPath(x0 + 6, y0 + 6, x1 - 6, y1 - 6)}" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-width="1.6"${dash}/>`;
  else shape = `<rect x="${r(x0)}" y="${r(y0)}" width="${r(x1 - x0)}" height="${r(y1 - y0)}" rx="${b.shape === 'rect' ? 2 : 16}" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-width="1.6"${dash}/>`;
  const label = b.label ? `<text x="${r(x0 + 12)}" y="${r(y0 + 15)}" font-family="${esc(fontFamily({}))}" font-size="12" font-weight="700" fill="${c}">${esc(b.label)}</text>` : '';
  return `<g class="tm-boundary${dim}" data-boundary="${esc(b.id)}">${shape}${label}</g>`;
}

// A summary: a curly brace beside a topic's subtopics and its label (data-summary = the topic id).
export function summaryMarkup(s, ms, opts = {}) {
  const c = esc(s.color);
  const k = s.right ? 1 : -1, x = s.x, ym = (s.y0 + s.y1) / 2, d = 7;
  const path = `M${r(x)} ${r(s.y0)} Q${r(x + k * d)} ${r(s.y0)} ${r(x + k * d)} ${r(s.y0 + d)} L${r(x + k * d)} ${r(ym - d)} Q${r(x + k * d)} ${r(ym)} ${r(x + k * 2 * d)} ${r(ym)} Q${r(x + k * d)} ${r(ym)} ${r(x + k * d)} ${r(ym + d)} L${r(x + k * d)} ${r(s.y1 - d)} Q${r(x + k * d)} ${r(s.y1)} ${r(x)} ${r(s.y1)}`;
  const dim = opts.dim && opts.dim.has(s.id) ? ' tm-dim' : '';
  return `<g class="tm-summary${dim}" data-summary="${esc(s.id)}"><path d="${path}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<rect x="${r(s.lx)}" y="${r(s.ly)}" width="${r(s.w)}" height="${r(s.h)}" rx="${r(s.h / 2)}" fill="${esc(ms.bg)}" stroke="${c}" stroke-width="1.6"/>`
    + `<text x="${r(s.lx + s.w / 2)}" y="${r(s.ly + s.h / 2 + s.fs * 0.36)}" font-family="${esc(fontFamily({}))}" font-size="${s.fs}" font-weight="700" fill="${c}" text-anchor="middle">${esc(s.text)}</text></g>`;
}

function arrowHead(p, angle, size, color) {
  const a1 = angle + Math.PI - 0.42, a2 = angle + Math.PI + 0.42;
  return `<path d="M${r(p.x)} ${r(p.y)} L${r(p.x + Math.cos(a1) * size)} ${r(p.y + Math.sin(a1) * size)} L${r(p.x + Math.cos(a2) * size)} ${r(p.y + Math.sin(a2) * size)} Z" fill="${color}"/>`;
}

export function relationshipMarkup(rel, L, ms, opts = {}) {
  const a = L.nodes.get(rel.from), b = L.nodes.get(rel.to);
  if (!a || !b) return '';
  const g = relationshipGeometry(rel, a, b, L.relBends);
  const color = esc(rel.color || ms.rel || ms.line.color);
  const width = Number(rel.width) || 1.8;
  const dash = rel.dash === false ? '' : ` stroke-dasharray="${rel.dash === 'dot' ? '2 4' : '7 5'}"`;
  const dim = opts.dim && (opts.dim.has(rel.from) || opts.dim.has(rel.to)) ? ' tm-dim' : '';
  const out = [`<g class="tm-rel${dim}" data-rel="${esc(rel.id)}">`];
  out.push(`<path class="tm-rel-hit" d="${g.d}" fill="none" stroke="transparent" stroke-width="12"/>`);
  out.push(`<path d="${g.d}" fill="none" stroke="${color}" stroke-width="${width}"${dash} stroke-linecap="round"/>`);
  const size = 7 + width * 1.5;
  if (rel.arrowEnd !== false) out.push(arrowHead(g.p3, g.endDir, size, color));
  if (rel.arrowStart) out.push(arrowHead(g.p0, g.startDir, size, color));
  if (rel.label) {
    const fs = 12;
    const tw = (opts.measure ? opts.measure(rel.label, `600 ${fs}px ${fontFamily({})}`) : rel.label.length * 7) + 12;
    out.push(`<rect x="${r(g.mid.x - tw / 2)}" y="${r(g.mid.y - 10)}" width="${r(tw)}" height="20" rx="10" fill="${esc(ms.bg)}" stroke="${color}" stroke-width="1"/>`);
    out.push(`<text x="${r(g.mid.x)}" y="${r(g.mid.y + 4.2)}" font-family="${esc(fontFamily({}))}" font-size="${fs}" font-weight="600" fill="${color}" text-anchor="middle">${esc(rel.label)}</text>`);
  }
  out.push('</g>');
  return out.join('');
}

/**
 * The map drawing (no <svg> wrapper): boundaries, axis / spine, lines, topics, relationships.
 * opts: { dim: Set (filtered out, drawn faint), hit: Set (search matches), static (export: no open fold handles), measure }
 */
export function renderMapBody(map, L, ms, opts = {}) {
  const out = [];
  for (const b of L.boundaries) out.push(boundaryMarkup(b, ms, opts));
  for (const s of L.summaries || []) out.push(summaryMarkup(s, ms, opts));
  for (const e of L.extras) {
    out.push(`<path class="tm-extra" d="${e.d}" stroke="${esc(e.stroke)}" stroke-width="${r(e.width)}" stroke-linecap="round" fill="none"/>`);
    if (e.arrow) {
      const m = /L(-?[\d.]+) (-?[\d.]+)$/.exec(e.d);
      if (m) out.push(arrowHead({ x: +m[1] + 8, y: +m[2] }, 0, 12, esc(e.stroke)));
    }
  }
  for (const l of L.lines) {
    const dim = opts.dim && opts.dim.has(l.id) ? ' tm-dim' : '';
    if (l.kind === 'callout') out.push(`<path class="tm-line${dim}" data-line="${esc(l.id)}" d="${l.d}" fill="${esc(l.fill)}" stroke="${esc(l.stroke)}" stroke-width="1" stroke-linejoin="round"/>`);
    else if (l.fill && l.fill !== 'none') out.push(`<path class="tm-line${dim}" data-line="${esc(l.id)}" d="${l.d}" fill="${esc(l.fill)}"/>`);
    else out.push(`<path class="tm-line${dim}" data-line="${esc(l.id)}" d="${l.d}" fill="none" stroke="${esc(l.stroke)}" stroke-width="${r(l.width)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  // callouts above their topic's subtree lines, main branches over sub ones
  for (const n of L.order) out.push(topicMarkup(n, ms, opts));
  for (const rel of map.relationships || []) out.push(relationshipMarkup(rel, L, ms, opts));
  return out.join('');
}

// A standalone SVG document of the whole map (export / print).
export function renderMapSvg(map, L, ms, { padding = 40, transparent = false, measure, title = '' } = {}) {
  const b = L.bounds;
  const x = Math.floor(b.x0 - padding), y = Math.floor(b.y0 - padding);
  const w = Math.ceil(b.x1 - b.x0 + padding * 2), h = Math.ceil(b.y1 - b.y0 + padding * 2);
  const bg = transparent ? '' : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(ms.bg)}"/>`;
  const t = title ? `<title>${esc(title)}</title>` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${t}${bg}${renderMapBody(map, L, ms, { static: true, measure })}</svg>`,
    width: w,
    height: h,
    viewBox: { x, y, w, h },
  };
}
