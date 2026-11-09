// Printing (CONTRACT: pure, no DOM, no three): paper, margins, the title block,
// the pages a project prints (the 3D view, a floor plan per level, the saved
// scenes, a summary) and the drawing scale of the plans (1:50, 1:100 …).
//
// Sheet geometry is in millimetres; world sizes are in metres. A plan printed at
// 1:N shows (area width in mm × N / 1000) metres across, so a plan larger than one
// sheet at that scale is tiled over several sheets.
import { DIM_BAND_MM, DIM_MODES } from './dimensions.js';

/** Paper sizes in millimetres (portrait). */
export const PAPERS = {
  A4: { width: 210, height: 297 }, A3: { width: 297, height: 420 }, A2: { width: 420, height: 594 }, A5: { width: 148, height: 210 },
  B4: { width: 257, height: 364 }, B5: { width: 182, height: 257 },
  Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 }, Tabloid: { width: 279.4, height: 431.8 },
};
/** Margins in millimetres. */
export const MARGINS = { narrow: 6, normal: 10, wide: 18 };
/** Standard architectural drawing scales (1:N). */
export const PLAN_SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 5000];
/** The plan scale choices offered: auto (the largest standard scale that fits one sheet), fit (fill the sheet), or 1:N. */
export const SCALE_CHOICES = ['auto', 'fit', 20, 50, 100, 200, 500];
export const TITLE_BLOCK_MM = 16;
const AREA_PAD_MM = 4;
const MAX_TILES = 64;

export function defaultPrintSetup() {
  return {
    printer: '', copies: 1, paper: 'A4', orientation: 'landscape', margin: 'normal',
    planScale: 'auto', planStyle: 'lines', dimensions: 'detailed', viewFit: 'fit', color: 'color', dpi: 150,
    titleBlock: true, titleText: '', author: '', scaleBar: true,
    includeView: true, includePlans: true, includeScenes: true, includeSummary: true,
  };
}

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/** A stored print setup made safe (unknown values fall back to the defaults). */
export function normalizePrintSetup(raw = {}) {
  const base = defaultPrintSetup();
  const r = raw && typeof raw === 'object' ? raw : {};
  const scale = Number(r.planScale);
  return {
    printer: typeof r.printer === 'string' ? r.printer : base.printer,
    copies: Math.max(1, Math.min(99, Math.round(Number(r.copies) || 1))),
    paper: r.paper in PAPERS ? r.paper : base.paper,
    orientation: r.orientation === 'portrait' ? 'portrait' : 'landscape',
    margin: r.margin in MARGINS ? r.margin : base.margin,
    planScale: r.planScale === 'fit' || r.planScale === 'auto' ? r.planScale : Number.isFinite(scale) && scale >= 1 && scale <= 10000 ? Math.round(scale) : base.planScale,
    planStyle: r.planStyle === 'colour' ? 'colour' : 'lines',
    dimensions: DIM_MODES.includes(r.dimensions) ? r.dimensions : base.dimensions,
    viewFit: r.viewFit === 'fill' ? 'fill' : 'fit',
    color: r.color === 'grey' ? 'grey' : 'color',
    dpi: [100, 150, 200, 300].includes(Number(r.dpi)) ? Number(r.dpi) : base.dpi,
    titleBlock: bool(r.titleBlock, base.titleBlock),
    titleText: typeof r.titleText === 'string' ? r.titleText.slice(0, 120) : '',
    author: typeof r.author === 'string' ? r.author.slice(0, 80) : '',
    scaleBar: bool(r.scaleBar, base.scaleBar),
    includeView: bool(r.includeView, base.includeView),
    includePlans: bool(r.includePlans, base.includePlans),
    includeScenes: bool(r.includeScenes, base.includeScenes),
    includeSummary: bool(r.includeSummary, base.includeSummary),
  };
}

/**
 * The sheet in millimetres: { width, height, frame, area, block }. `frame` is the border inside the
 * margins, `block` the title block along its bottom (null without one), `area` where the drawing goes.
 */
export function sheetGeometry(setup) {
  const o = normalizePrintSetup(setup);
  const paper = PAPERS[o.paper];
  const landscape = o.orientation === 'landscape';
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  const m = MARGINS[o.margin];
  const frame = { x: m, y: m, w: width - 2 * m, h: height - 2 * m };
  const block = o.titleBlock ? { x: frame.x, y: frame.y + frame.h - TITLE_BLOCK_MM, w: frame.w, h: TITLE_BLOCK_MM } : null;
  const area = { x: frame.x + AREA_PAD_MM, y: frame.y + AREA_PAD_MM, w: frame.w - 2 * AREA_PAD_MM, h: frame.h - 2 * AREA_PAD_MM - (block ? block.h : 0) };
  return { width, height, frame, area, block };
}

/** Plan bounds of a level in metres (x right, z down the sheet): walls, rooms and furniture, plus a margin. Null when empty. */
export function planBounds(project, levelId, pad = 0.4) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  const add = (x, z, r = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minZ = Math.min(minZ, z - r); maxZ = Math.max(maxZ, z + r);
  };
  const first = project?.levels?.[0]?.id;
  const on = (e) => (e.level ?? first) === levelId;
  for (const w of project?.walls ?? []) if (on(w)) { const r = (Number(w.thickness) || 0.15) / 2; add(w.a[0], w.a[1], r); add(w.b[0], w.b[1], r); }
  for (const room of project?.rooms ?? []) if (on(room)) for (const [x, z] of room.points ?? []) add(x, z);
  for (const o of project?.objects ?? []) if (on(o)) add(o.position?.[0], o.position?.[2], 0.5);
  if (!Number.isFinite(minX)) return null;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

/** The scale 1:N (unrounded) at which `bounds` (m) just fills `area` (mm). */
export function fitScale(bounds, area) {
  const bw = Math.max(0.01, bounds.maxX - bounds.minX);
  const bh = Math.max(0.01, bounds.maxZ - bounds.minZ);
  return Math.max((bw * 1000) / area.w, (bh * 1000) / area.h);
}

/** The largest standard scale at which something needing 1:n still fits (the next N ≥ n). */
export function standardScale(n) {
  const hit = PLAN_SCALES.find((s) => s >= n - 1e-9);
  return hit ?? Math.ceil(n / 1000) * 1000;
}

/** The scale (N of 1:N) a plan prints at, from the setup's choice. */
export function planScaleFor(choice, bounds, area) {
  const fit = fitScale(bounds, area);
  if (choice === 'fit') return fit;
  if (choice === 'auto') return standardScale(fit);
  return Math.max(1, Number(choice) || 100);
}

/**
 * The sheets a plan needs at 1:N: [{ cx, cz, halfW, halfH, row, col, rows, cols }] in metres. One sheet is
 * centred on the plan; more are laid out in a grid centred on it (rows from the top of the plan).
 */
export function planTiles(bounds, area, scale) {
  const ew = (area.w * scale) / 1000;
  const eh = (area.h * scale) / 1000;
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxZ - bounds.minZ;
  let cols = Math.max(1, Math.ceil(bw / ew - 1e-6));
  let rows = Math.max(1, Math.ceil(bh / eh - 1e-6));
  if (cols * rows > MAX_TILES) { const k = Math.sqrt((cols * rows) / MAX_TILES); cols = Math.max(1, Math.floor(cols / k)); rows = Math.max(1, Math.floor(rows / k)); }
  const cx0 = (bounds.minX + bounds.maxX) / 2 - (cols * ew) / 2;
  const cz0 = (bounds.minZ + bounds.maxZ) / 2 - (rows * eh) / 2;
  const tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push({ cx: cx0 + (c + 0.5) * ew, cz: cz0 + (r + 0.5) * eh, halfW: ew / 2, halfH: eh / 2, row: r, col: c, rows, cols });
  return tiles;
}

/** A scale bar length in metres (1, 2, 5 × 10ⁿ) drawn at most `maxMm` long at 1:N. */
export function scaleBarLength(scale, maxMm = 50) {
  const maxM = (maxMm * scale) / 1000;
  const steps = [];
  for (let e = -2; e <= 4; e++) for (const k of [1, 2, 5]) steps.push(k * 10 ** e);
  let best = steps[0];
  for (const s of steps) if (s <= maxM + 1e-9) best = s;
  return best;
}

/** "1:100" (fit scales are rounded to a whole number). */
export const scaleLabel = (scale) => `1:${Math.round(scale)}`;

/** Pixels for a length in mm at `dpi`, at most `max`. */
export function pixelsFor(mm, dpi = 150, max = 4096) {
  return Math.max(16, Math.min(max, Math.round((mm / 25.4) * dpi)));
}

/**
 * Pixel size of a picture filling `area` (mm) at `dpi`, keeping the area's proportions even when capped.
 */
export function pictureSize(area, dpi = 150, max = 4096) {
  let w = (area.w / 25.4) * dpi;
  let h = (area.h / 25.4) * dpi;
  const k = Math.min(1, max / Math.max(w, h));
  w = Math.max(16, Math.round(w * k));
  h = Math.max(16, Math.round(h * k));
  return { w, h };
}

/**
 * Everything the project can print, in order: { key, type, id?, name }. `info` = { levels: [{ id, name }],
 * scenes: [{ id, name }], hasView }.
 */
export function printablePages(info) {
  const pages = [];
  if (info.hasView !== false) pages.push({ key: 'view', type: 'view' });
  for (const level of info.levels ?? []) pages.push({ key: `plan:${level.id}`, type: 'plan', id: level.id, name: level.name });
  for (const scene of info.scenes ?? []) pages.push({ key: `scene:${scene.id}`, type: 'scene', id: scene.id, name: scene.name });
  pages.push({ key: 'summary', type: 'summary' });
  return pages;
}

/** Whether a page is chosen: its own tick (`picked[key]`) wins over its group's setting. */
export function pageChosen(page, setup, picked = {}) {
  if (page.key in picked) return Boolean(picked[page.key]);
  return Boolean({ view: setup.includeView, plan: setup.includePlans, scene: setup.includeScenes, summary: setup.includeSummary }[page.type]);
}

/**
 * The sheets to print: [{ page, tile?, scale?, request? }]. A picture request = { key, type, id?, w, h,
 * grey, style?, camera? } (camera = { cx, cz, halfW, halfH } for plans) — the main window renders it.
 * `info.levels[i].bounds` are the plan bounds (null: an empty level prints fitted to nothing → skipped).
 */
export function layoutSheets(info, setup, picked = {}) {
  const o = normalizePrintSetup(setup);
  const geo = sheetGeometry(o);
  const size = pictureSize(geo.area, o.dpi);
  const grey = o.color === 'grey';
  const sheets = [];
  for (const page of printablePages(info)) {
    if (!pageChosen(page, o, picked)) continue;
    if (page.type === 'summary') { sheets.push({ page }); continue; }
    if (page.type === 'view' || page.type === 'scene') {
      const request = { type: page.type, id: page.id ?? null, w: size.w, h: size.h, grey, fit: o.viewFit };
      sheets.push({ page, request: { ...request, key: requestKey(request) } });
      continue;
    }
    const level = (info.levels ?? []).find((l) => l.id === page.id);
    const bounds = level?.bounds;
    if (!bounds) { sheets.push({ page, empty: true }); continue; }
    const plan = level.plan ?? null;
    const dims = plan?.walls?.length ? o.dimensions : 'none';
    // Dimension lines go outside the building: the plan is fitted inside a band kept free for them.
    const scale = planScaleFor(o.planScale, bounds, dimensionArea(geo.area, dims));
    for (const tile of planTiles(bounds, geo.area, scale)) {
      const request = { type: 'plan', id: page.id, w: size.w, h: size.h, grey, style: o.planStyle, pxPerMm: round(size.w / geo.area.w), camera: { cx: round(tile.cx), cz: round(tile.cz), halfW: round(tile.halfW), halfH: round(tile.halfH) } };
      sheets.push({ page, tile, scale, plan, dims, request: { ...request, key: requestKey(request) } });
    }
  }
  return { sheets, geometry: geo, setup: o };
}

const round = (v) => Math.round(v * 10000) / 10000;

/** The drawing area less the band its dimension lines need on every side (mm). */
export function dimensionArea(area, dims = 'none') {
  const band = DIM_BAND_MM[dims] ?? 0;
  if (!band) return area;
  const w = Math.max(area.w * 0.5, area.w - 2 * band);
  const h = Math.max(area.h * 0.5, area.h - 2 * band);
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** Widest vertical field of view (degrees) a printed perspective view gets before the camera steps back instead. */
export const MAX_PRINT_FOV = 90;

/**
 * How a view seen on screen (aspect `screenAspect`, w / h) is framed on a sheet of `sheetAspect`.
 * mode 'fit': everything visible on screen stays visible (a sheet narrower than the screen widens the
 * view — the field of view, or the parallel view's height — and steps the camera back once the field
 * of view would pass `maxFov`); 'fill': the screen's picture is cropped to fill the sheet (a sheet wider
 * than the screen narrows the view). Returns { fov (deg), orthoHalfHeight, dolly (distance factor), k }.
 */
export function frameForSheet({ fov = 50, ortho = false, orthoHalfHeight = null, screenAspect, sheetAspect, mode = 'fit', maxFov = MAX_PRINT_FOV }) {
  const same = { fov, orthoHalfHeight, dolly: 1, k: 1 };
  if (!(screenAspect > 0) || !(sheetAspect > 0)) return same;
  const k = screenAspect / sheetAspect;
  if (mode === 'fill' ? k >= 1 - 1e-9 : k <= 1 + 1e-9) return same;
  if (ortho) return { fov, orthoHalfHeight: (orthoHalfHeight ?? 5) * k, dolly: 1, k };
  const rad = Math.PI / 180;
  const need = Math.tan((fov / 2) * rad) * k;
  const cap = Math.tan((Math.max(fov, Math.min(maxFov, 170)) / 2) * rad);
  const t = Math.min(need, cap);
  return { fov: (2 * Math.atan(t)) / rad, orthoHalfHeight, dolly: need / t, k };
}

/** A stable cache key for a picture request. */
export function requestKey(request) {
  const { key, ...rest } = request;
  void key;
  return JSON.stringify(rest);
}
