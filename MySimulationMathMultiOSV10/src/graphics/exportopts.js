// Export dialog option logic (DOM-free, tested in Node): formats and what
// each supports, normalising stored options, the output size (scale or
// pixels with an aspect lock) and file names.

export const FORMATS = [
  { id: 'png', ext: 'png', mime: 'image/png', raster: true, alpha: true, quality: false, dpi: true },
  { id: 'jpg', ext: 'jpg', mime: 'image/jpeg', raster: true, alpha: false, quality: true, dpi: true },
  { id: 'gif', ext: 'gif', mime: 'image/gif', raster: true, alpha: true, quality: false, dpi: false },
  { id: 'webp', ext: 'webp', mime: 'image/webp', raster: true, alpha: true, quality: true, dpi: false },
  { id: 'bmp', ext: 'bmp', mime: 'image/bmp', raster: true, alpha: false, quality: false, dpi: false },
  { id: 'tiff', ext: 'tif', mime: 'image/tiff', raster: true, alpha: true, quality: false, dpi: false },
  { id: 'svg', ext: 'svg', mime: 'image/svg+xml', raster: false, alpha: true, quality: false, dpi: false },
  { id: 'pdf', ext: 'pdf', mime: 'application/pdf', raster: false, alpha: false, quality: false, dpi: false },
];
export const formatInfo = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

export const EXPORT_DEFAULTS = {
  format: 'png', target: 'figure', sizeMode: 'scale', scale: 2, width: 1120, height: 840, lock: true,
  dpi: 150, quality: 92, background: 'white', rulers: false, tips: true, name: 'figure', folder: '',
  orientation: null, // 'landscape' | 'portrait'; null = the figure's current shape
};

const clampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/**
 * Stored / edited options → a complete, valid set. A transparent background
 * on a format without alpha (JPG, PDF) falls back to white and `notes`
 * says why (keys of the i18n table).
 */
export function normalizeExport(o = {}) {
  const d = EXPORT_DEFAULTS;
  const f = formatInfo(o.format);
  const out = {
    format: f.id,
    target: ['figure', 'axes', 'region'].includes(o.target) ? o.target : d.target,
    sizeMode: o.sizeMode === 'pixels' ? 'pixels' : 'scale',
    scale: [1, 2, 3, 4].includes(Number(o.scale)) ? Number(o.scale) : d.scale,
    width: Math.round(clampN(o.width, 16, 16000, d.width)),
    height: Math.round(clampN(o.height, 16, 16000, d.height)),
    lock: o.lock !== false,
    dpi: Math.round(clampN(o.dpi, 36, 2400, d.dpi)),
    quality: Math.round(clampN(o.quality, 10, 100, d.quality)),
    background: ['theme', 'white', 'none'].includes(o.background) ? o.background : d.background,
    rulers: !!o.rulers,
    tips: o.tips !== false,
    name: String(o.name || d.name),
    folder: String(o.folder || ''),
    orientation: o.orientation === 'landscape' || o.orientation === 'portrait' ? o.orientation : null,
  };
  const notes = [];
  if (out.background === 'none' && !f.alpha) { out.background = 'white'; notes.push(f.id === 'jpg' ? 'noAlphaJpg' : f.id === 'bmp' ? 'noAlphaBmp' : 'noAlphaPdf'); }
  return { opts: out, notes };
}

/** Background choices a format offers (transparent only with an alpha channel). */
export function backgroundChoices(format) {
  return formatInfo(format).alpha ? ['theme', 'white', 'none'] : ['theme', 'white'];
}

/**
 * Output image size for a source of baseW × baseH px (the crop, plus the
 * rulers when they are included): { width, height, sx, sy }.
 */
export function outputSize(o, baseW, baseH) {
  let w, h;
  if (o.sizeMode === 'pixels') {
    w = o.width; h = o.height;
    if (o.lock) h = Math.max(1, Math.round((w * baseH) / baseW));
  } else { w = Math.round(baseW * o.scale); h = Math.round(baseH * o.scale); }
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  return { width: w, height: h, sx: w / baseW, sy: h / baseH };
}

/** With the aspect lock on, editing one side updates the other. */
export function lockedPair(o, changed, value, baseW, baseH) {
  const r = baseH / baseW;
  if (changed === 'width') return { width: value, height: o.lock ? Math.max(1, Math.round(value * r)) : o.height };
  return { height: value, width: o.lock ? Math.max(1, Math.round(value / r)) : o.width };
}

/** File name with the format's extension (other extensions replaced, unsafe characters removed). */
export function fileNameFor(name, format) {
  const ext = formatInfo(format).ext;
  let base = String(name || 'figure').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(png|jpe?g|gif|webp|svg|pdf|bmp|tiff?)$/i, '');
  if (!base) base = 'figure';
  return `${base}.${ext}`;
}

/** A rectangle clamped to the figure (figure px), or null when too small. */
/** 'landscape' when width ≥ height, else 'portrait'. */
export const orientationOf = (w, h) => (w >= h ? 'landscape' : 'portrait');

/**
 * The figure size an export lays the figure out at: the on-screen size, or
 * the same size turned 90° when the chosen orientation differs (a portrait
 * export is a real tall figure, not a rotated or letterboxed image).
 */
export function orientedFigure(figW, figH, orientation) {
  if (!orientation || orientationOf(figW, figH) === orientation) return { figW, figH };
  return { figW: figH, figH: figW };
}

/** Pixel width / height after switching orientation (swapped when they don't match it). */
export function orientedPixels(width, height, orientation) {
  return orientationOf(width, height) === orientation || width === height ? { width, height } : { width: height, height: width };
}

export function clampRect(r, W, H) {
  if (!r) return null;
  const x0 = Math.max(0, Math.min(r.x, r.x + r.w)), y0 = Math.max(0, Math.min(r.y, r.y + r.h));
  const x1 = Math.min(W, Math.max(r.x, r.x + r.w)), y1 = Math.min(H, Math.max(r.y, r.y + r.h));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
}
