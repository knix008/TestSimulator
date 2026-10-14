// Panel sheets (FreeCAD Arch Panel sheet / nesting): outlines packed onto
// stock sheets in shelves, each turned 90° when that fits better. No DOM.

import { polygonArea } from './geometry.js';

const box = (loop) => {
  const xs = loop.map((p) => p.x);
  const ys = loop.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/**
 * items: [{ id, name, outer, holes }]. Returns { sheets: [{ index, parts: [{ id, name, outer, holes, turned }] , used }],
 * left: items that fit no sheet }. Parts are placed with their bounding box at the sheet's
 * lower-left (sheet coordinates), `gap` apart and from the edges.
 */
export function nestPanels(items, { width = 2440, height = 1220, gap = 10 } = {}) {
  const parts = items.map((item) => {
    const b = box(item.outer);
    return { ...item, b, area: Math.abs(polygonArea(item.outer)) - (item.holes ?? []).reduce((s, h) => s + Math.abs(polygonArea(h)), 0) };
  });
  // Tallest first (after turning the long side along the sheet).
  const sized = parts.map((p) => {
    const fitsFlat = p.b.w + 2 * gap <= width && p.b.h + 2 * gap <= height;
    const fitsTurned = p.b.h + 2 * gap <= width && p.b.w + 2 * gap <= height;
    // Prefer the long side along the sheet's long side.
    const turned = fitsTurned && (!fitsFlat || (p.b.h > p.b.w) === (width >= height));
    return { ...p, turned, w: turned ? p.b.h : p.b.w, h: turned ? p.b.w : p.b.h, fits: fitsFlat || fitsTurned };
  }).sort((a, b) => b.h - a.h || b.w - a.w);
  const sheets = [];
  const left = [];
  for (const part of sized) {
    if (!part.fits) { left.push(part); continue; }
    let placed = false;
    for (const sheet of sheets) {
      // Same shelf, or a new shelf above.
      const shelf = sheet.shelves[sheet.shelves.length - 1];
      if (shelf.x + part.w + gap <= width && shelf.y + part.h + gap <= height && part.h <= shelf.h) {
        place(sheet, part, shelf.x, shelf.y); shelf.x += part.w + gap; placed = true; break;
      }
      const top = shelf.y + shelf.h + gap;
      if (top + part.h + gap <= height) {
        sheet.shelves.push({ x: gap + part.w + gap, y: top, h: part.h });
        place(sheet, part, gap, top); placed = true; break;
      }
    }
    if (!placed) {
      const sheet = { index: sheets.length, parts: [], shelves: [{ x: gap + part.w + gap, y: gap, h: part.h }] };
      sheets.push(sheet);
      place(sheet, part, gap, gap);
    }
  }
  return {
    sheets: sheets.map((s) => ({ index: s.index, parts: s.parts, used: s.parts.reduce((sum, p) => sum + p.area, 0) / (width * height) })),
    left,
    size: { width, height },
  };
}

/** Moves a part's outline so its bounding box sits at (x, y) on the sheet (turned 90° when chosen). */
function place(sheet, part, x, y) {
  const map = (q) => {
    const u = q.x - part.b.minX;
    const v = q.y - part.b.minY;
    return part.turned ? { x: x + (part.b.h - v), y: y + u } : { x: x + u, y: y + v };
  };
  sheet.parts.push({ id: part.id, name: part.name, area: part.area, turned: part.turned, outer: part.outer.map(map), holes: (part.holes ?? []).map((h) => h.map(map)) });
}
