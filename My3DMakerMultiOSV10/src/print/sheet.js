// One printed page as an SVG (pure). Its viewBox is the paper in millimetres; width / height are CSS pixels
// for the preview (the print styles stretch it over the @page box, which is the paper).
//
// A drawing: the sheet from drawingSvg() as a nested <svg> at its place (1:1 or fitted). Its size goes
// in an inline style as well — styles.css stretches every svg of a printed page to 100 %.
// A model: a title line (name, kind · material, date) and the 3D picture fitted into the box under it.
import { drawingPlacement, modelBoxes } from './layout.js';

const PX_PER_MM = 96 / 25.4;
const n = (v) => +Number(v).toFixed(3);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The drawing's own <svg …> tag placed at x, y with w × h (mm); its viewBox keeps the sheet's coordinates. */
export function placeDrawingSvg(svg, place) {
  const text = String(svg ?? '');
  const open = text.match(/<svg\b[^>]*>/);
  if (!open) return '';
  const tag = open[0]
    .replace(/\s(width|height|x|y|style|preserveAspectRatio)="[^"]*"/g, '')
    .replace(/<svg\b/, `<svg x="${n(place.x)}" y="${n(place.y)}" width="${n(place.w)}" height="${n(place.h)}" style="width:${n(place.w)}px;height:${n(place.h)}px" preserveAspectRatio="xMidYMid meet" overflow="hidden"`);
  return tag + text.slice(open.index + open[0].length);
}

/**
 * page: { mode: 'drawing' | 'model', geometry, setup, content, info, t, date }
 *   content: drawing → { svg, sheetW, sheetH }; model → { url } (null while the picture is on its way)
 */
export function pageSvg({ mode, geometry, setup, content, info = {}, t = (k) => k, date = '' }) {
  const { width: W, height: H } = geometry;
  const mono = setup.color === 'mono';
  let body = '';
  if (mode === 'drawing') {
    if (content?.svg) {
      const place = drawingPlacement(content.sheetW, content.sheetH, geometry, setup.scale);
      const a = geometry.area;
      body = `<clipPath id="print-area"><rect x="${n(a.x)}" y="${n(a.y)}" width="${n(a.w)}" height="${n(a.h)}"/></clipPath>
        <g clip-path="url(#print-area)">${placeDrawingSvg(content.svg, place)}</g>`;
    }
  } else {
    const { title, picture } = modelBoxes(geometry);
    const fs = 4.2;
    const base = title.y + title.h - 2.4;
    const right = [info.kindLabel, info.material, date].filter(Boolean).join('  ·  ');
    body = `<g class="print-title">
        <text x="${n(title.x)}" y="${n(base)}" font-family="sans-serif" font-size="${fs}" font-weight="bold" fill="#000">${esc(info.name ?? '')}</text>
        <text x="${n(title.x + title.w)}" y="${n(base)}" font-family="sans-serif" font-size="${n(fs * 0.72)}" fill="#333" text-anchor="end">${esc(right)}</text>
        <line x1="${n(title.x)}" y1="${n(title.y + title.h)}" x2="${n(title.x + title.w)}" y2="${n(title.y + title.h)}" stroke="#000" stroke-width="0.35"/>
      </g>
      ${content?.url ? `<image href="${esc(content.url)}" x="${n(picture.x)}" y="${n(picture.y)}" width="${n(picture.w)}" height="${n(picture.h)}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${n(picture.x + picture.w / 2)}" y="${n(picture.y + picture.h / 2)}" font-family="sans-serif" font-size="5" fill="#888" text-anchor="middle">${esc(t('mprint.preparing'))}</text>`}
      <rect x="${n(picture.x)}" y="${n(picture.y)}" width="${n(picture.w)}" height="${n(picture.h)}" fill="none" stroke="#000" stroke-width="0.25"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="print-page-svg" viewBox="0 0 ${n(W)} ${n(H)}" width="${Math.round(W * PX_PER_MM)}" height="${Math.round(H * PX_PER_MM)}">
  <filter id="print-mono" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter>
  <rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#fff"/>
  <g${mono ? ' filter="url(#print-mono)"' : ''}>${body}</g>
</svg>`;
}
