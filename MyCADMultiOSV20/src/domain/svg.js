// Drawing → SVG. Used for SVG export, the print preview pages and the part
// previews. Drawing coordinates (mm, y up) are mapped onto the SVG (y down)
// with a scale `k` (SVG units per mm).
import { AUTO, isVisible, styleOf } from './drawing.js';
import { boxOfEntities, DASHES, firstBaseline, LINE_GAP, primitives } from './entities.js';
import { boxHeight, boxWidth, polar, sweep } from './geometry.js';

export const escapeXml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const n = (value) => (Math.round(value * 1000) / 1000).toString();

/**
 * SVG elements for a list of primitives.
 * map: drawing point → SVG point; k: SVG units per mm (for sizes);
 * stroke/width/dash: resolved style; fonts: { family, weight, style } for texts without their own font.
 */
export function primitivesSvg(prims, { map, k, stroke, width, dash = [], fonts = {}, dashScale = k }) {
  const out = [];
  const dashFor = (lineType) => {
    const pattern = lineType ? DASHES[lineType] ?? [] : dash;
    return pattern.length ? ` stroke-dasharray="${pattern.map((d) => n(d * dashScale)).join(' ')}"` : '';
  };
  for (const prim of prims) {
    const strokeWidth = prim.thin ? Math.min(width, 0.18) : width;
    const common = `fill="none" stroke="${stroke}" stroke-width="${n(strokeWidth)}"${dashFor(prim.lineType)}`;
    switch (prim.kind) {
      case 'line': {
        const a = map(prim.a);
        const b = map(prim.b);
        out.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" ${common}/>`);
        break;
      }
      case 'poly': {
        const points = prim.points.map(map).map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
        out.push(`<${prim.closed ? 'polygon' : 'polyline'} points="${points}" ${common} stroke-linejoin="round"/>`);
        break;
      }
      case 'fill': {
        if (prim.holes?.length) {
          const d = [prim.points, ...prim.holes].map((loop) => `M${loop.map(map).map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z`).join('');
          out.push(`<path d="${d}" fill="${stroke}" fill-rule="evenodd" stroke="none"/>`);
          break;
        }
        const points = prim.points.map(map).map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
        out.push(`<polygon points="${points}" fill="${stroke}" stroke="none"/>`);
        break;
      }
      case 'circle': {
        const c = map(prim.c);
        out.push(`<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(prim.r * k)}" ${common}/>`);
        break;
      }
      case 'arc': {
        const total = sweep(prim.start, prim.end);
        if (total >= 359.999) {
          const c = map(prim.c);
          out.push(`<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(prim.r * k)}" ${common}/>`);
          break;
        }
        const a = map(polar(prim.c, prim.r, prim.start));
        const b = map(polar(prim.c, prim.r, prim.end));
        out.push(`<path d="M${n(a.x)} ${n(a.y)}A${n(prim.r * k)} ${n(prim.r * k)} 0 ${total > 180 ? 1 : 0} 0 ${n(b.x)} ${n(b.y)}" ${common}/>`);
        break;
      }
      case 'text': {
        const p = map(prim.p);
        const size = prim.size * k;
        const lines = String(prim.text).split('\n');
        const anchor = prim.align === 'center' ? 'middle' : prim.align === 'right' ? 'end' : 'start';
        const baseline = -firstBaseline(prim) * k;
        const family = prim.font || fonts.family || 'sans-serif';
        const weight = prim.bold ? 700 : fonts.weight ?? 400;
        const style = prim.italic ? 'italic' : fonts.style ?? 'normal';
        const tspans = lines.map((line, i) => `<tspan x="${n(p.x)}" y="${n(p.y + baseline + i * size * LINE_GAP)}">${escapeXml(line) || ' '}</tspan>`).join('');
        out.push(`<text font-family="${escapeXml(family)}" font-size="${n(size)}" font-weight="${weight}" font-style="${style}" fill="${stroke}" text-anchor="${anchor}"${prim.angle ? ` transform="rotate(${n(-prim.angle)} ${n(p.x)} ${n(p.y)})"` : ''} xml:space="preserve">${tspans}</text>`);
        break;
      }
      default:
        break;
    }
  }
  return out.join('');
}

/**
 * SVG for entities of a drawing, placed so that drawing point (box.minX, box.maxY)
 * lands at (x0, y0) with scale k.
 * options: { entities, box, k, x0, y0, ink, monochrome, fonts, widthScale }
 */
export function entitiesSvg(drawing, { entities, box, k, x0 = 0, y0 = 0, ink = '#000000', monochrome = false, fonts = {}, widthScale = 1 }) {
  const map = (p) => ({ x: x0 + (p.x - box.minX) * k, y: y0 + (box.maxY - p.y) * k });
  return entities.map((entity) => {
    const style = styleOf(drawing, entity);
    const stroke = monochrome || style.color === AUTO ? ink : style.color;
    return primitivesSvg(primitives(entity), { map, k, stroke, width: style.lineWidth * widthScale, dash: DASHES[style.lineType] ?? [], fonts });
  }).join('');
}

/** A complete SVG document of the drawing at true size (mm). */
export function exportSvg(drawing, { fonts = {}, ink = '#000000', margin = 10, entities = null, background = null } = {}) {
  const list = (entities ?? drawing.entities).filter((entity) => isVisible(drawing, entity));
  const box = boxOfEntities(list) ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const width = Math.max(1, boxWidth(box)) + margin * 2;
  const height = Math.max(1, boxHeight(box)) + margin * 2;
  const body = entitiesSvg(drawing, { entities: list, box, k: 1, x0: margin, y0: margin, ink, fonts });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}">
<title>${escapeXml(drawing.title)}</title>
<desc>MyCAD — ${escapeXml(drawing.description || drawing.title)}</desc>
${background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''}<g stroke-linecap="round">${body}</g>
</svg>
`;
}

/** Small preview of primitives fitted into width × height pixels (part window). */
export function previewSvg(prims, { width = 300, height = 220, stroke = '#1d2433', padding = 12, fonts = {} } = {}) {
  const box = prims.reduce((acc, prim) => {
    const points = prim.kind === 'circle' || prim.kind === 'arc' ? [{ x: prim.c.x - prim.r, y: prim.c.y - prim.r }, { x: prim.c.x + prim.r, y: prim.c.y + prim.r }]
      : prim.kind === 'line' ? [prim.a, prim.b] : prim.points ?? [];
    for (const p of points) {
      acc.minX = Math.min(acc.minX, p.x); acc.minY = Math.min(acc.minY, p.y);
      acc.maxX = Math.max(acc.maxX, p.x); acc.maxY = Math.max(acc.maxY, p.y);
    }
    return acc;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  if (!Number.isFinite(box.minX)) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  const k = Math.min((width - padding * 2) / Math.max(1e-6, boxWidth(box)), (height - padding * 2) / Math.max(1e-6, boxHeight(box)));
  const x0 = (width - boxWidth(box) * k) / 2;
  const y0 = (height - boxHeight(box) * k) / 2;
  const map = (p) => ({ x: x0 + (p.x - box.minX) * k, y: y0 + (box.maxY - p.y) * k });
  const body = primitivesSvg(prims, { map, k, stroke, width: 1.4, dashScale: Math.max(0.6, k * 0.6), fonts });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g stroke-linecap="round">${body}</g></svg>`;
}
