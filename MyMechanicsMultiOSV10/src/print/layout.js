// The print window's page setup and geometry (pure: no DOM, tested in Node).
//
// Everything is in millimetres. A drawing sheet (drawingSvg) is already drawn at its real size, so on
// its own paper size with no margins at 1:1 it prints to scale; "fit" scales it into the printable area.
// A part or assembly is a picture of the 3D view under a title line.
import { PRINT_KEY } from '../domain/settings.js';

/** Paper sizes, portrait (width < height), mm. */
export const PAPERS = {
  A4: { width: 210, height: 297 }, A3: { width: 297, height: 420 }, A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 }, A0: { width: 841, height: 1189 },
  Letter: { width: 215.9, height: 279.4 }, Tabloid: { width: 279.4, height: 431.8 },
  'ANSI C': { width: 431.8, height: 558.8 }, 'ANSI D': { width: 558.8, height: 863.6 }, 'ANSI E': { width: 863.6, height: 1117.6 },
};
/** Margins, mm. */
export const MARGINS = { none: 0, narrow: 5, normal: 10, wide: 20 };
/** Height of the title line above a model picture, and the gap under it, mm. */
export const TITLE_MM = 9;
export const TITLE_GAP_MM = 3;
/** Long side of a model picture at most this many pixels (WebGL and memory), at most this many dpi. */
export const MAX_CAPTURE_PX = 4096;
export const CAPTURE_DPI = 200;

const COMMON = { printer: '', copies: 1, color: 'color', framing: 'screen' };
const MODEL = { paper: 'A4', orientation: 'landscape', margin: 'normal' };

/** A setup with every field valid. */
export function normalizeSetup(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const copies = Math.round(Number(r.copies));
  return {
    printer: typeof r.printer === 'string' ? r.printer : '',
    copies: Number.isFinite(copies) ? Math.max(1, Math.min(99, copies)) : 1,
    color: r.color === 'mono' ? 'mono' : 'color',
    paper: r.paper in PAPERS ? r.paper : MODEL.paper,
    orientation: r.orientation === 'portrait' ? 'portrait' : 'landscape',
    margin: r.margin in MARGINS ? r.margin : MODEL.margin,
    scale: r.scale === 'fit' ? 'fit' : 'actual',
    framing: r.framing === 'model' ? 'model' : 'screen',
  };
}

/** The stored choices: printer, copies and colour for everything, paper / orientation / margins for models. */
export function loadStored(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(PRINT_KEY) ?? '{}') ?? {};
    return { ...COMMON, ...MODEL, ...raw };
  } catch {
    return { ...COMMON, ...MODEL };
  }
}

export function storeSetup(storage, setup, mode) {
  try {
    const s = normalizeSetup(setup);
    const old = loadStored(storage);
    const keep = { printer: s.printer, copies: s.copies, color: s.color, framing: s.framing };
    const model = mode === 'model' ? { paper: s.paper, orientation: s.orientation, margin: s.margin } : { paper: old.paper, orientation: old.orientation, margin: old.margin };
    storage?.setItem(PRINT_KEY, JSON.stringify({ ...keep, ...model }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The paper a document opens with. A drawing: its own sheet size, landscape, no margins, 1:1 — the sheet
 * prints to scale. A model: the stored paper. Printer, copies and colour are always the stored ones.
 */
export function initialSetup(stored, { mode, sheet } = {}) {
  const base = normalizeSetup(stored);
  if (mode !== 'drawing') return base;
  return { ...base, paper: sheet in PAPERS ? sheet : 'A3', orientation: 'landscape', margin: 'none', scale: 'actual' };
}

/** The page: { width, height } of the paper as it lies, and the printable area { x, y, w, h }. */
export function pageGeometry(setup) {
  const s = normalizeSetup(setup);
  const paper = PAPERS[s.paper];
  const landscape = s.orientation === 'landscape';
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  const m = MARGINS[s.margin];
  return { width, height, margin: m, area: { x: m, y: m, w: width - 2 * m, h: height - 2 * m } };
}

/**
 * Where a drawing sheet of sheetW × sheetH mm goes: centred in the printable area, at 1:1 ('actual') or
 * as large as fits ('fit'). `clipped`: at 1:1 the sheet is larger than the area and is cut off.
 */
export function drawingPlacement(sheetW, sheetH, geometry, scaleMode) {
  const { area } = geometry;
  const scale = scaleMode === 'fit' ? Math.min(area.w / sheetW, area.h / sheetH) : 1;
  const w = sheetW * scale;
  const h = sheetH * scale;
  const clipped = scaleMode !== 'fit' && (w > area.w + 0.05 || h > area.h + 0.05);
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h, scale, clipped };
}

/** The model page: the title line and the picture's box under it, mm. */
export function modelBoxes(geometry) {
  const { area } = geometry;
  const title = { x: area.x, y: area.y, w: area.w, h: TITLE_MM };
  const top = area.y + TITLE_MM + TITLE_GAP_MM;
  return { title, picture: { x: area.x, y: top, w: area.w, h: Math.max(10, area.y + area.h - top) } };
}

/** The pixel size of the 3D picture for a box of w × h mm (CAPTURE_DPI, long side at most MAX_CAPTURE_PX). */
export function captureSize(box) {
  let w = (box.w / 25.4) * CAPTURE_DPI;
  let h = (box.h / 25.4) * CAPTURE_DPI;
  const k = Math.min(1, MAX_CAPTURE_PX / Math.max(w, h));
  w = Math.max(64, Math.round(w * k));
  h = Math.max(64, Math.round(h * k));
  return { w, h, key: `${w}x${h}` };
}
