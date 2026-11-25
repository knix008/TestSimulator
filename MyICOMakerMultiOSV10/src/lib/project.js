// The design document and its file form (.myico — JSON).
import { DEFAULT_FX, DEFAULT_SIZES, uid } from './iconCanvas.js';

export const FILE_EXTENSION = 'myico';
export const FORMAT = 'MyICOMaker';
export const FORMAT_VERSION = 1;

export function emptyDesign() {
  return {
    objects: [],
    background: 'transparent',
    background2: '#1e3a8a',
    bgGradient: false,
    bgShape: 'square',
    bgPad: 0,
    bgRadius: 22,
    exportOpacity: 100,
    sizes: [...DEFAULT_SIZES],
    perSize: false,
  };
}

/** The design as the text of a .myico file. */
export function serializeDesign(design, name = '') {
  const { objects, background, background2, bgGradient, bgShape, bgPad, bgRadius, exportOpacity, sizes, perSize } = design;
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, name, design: { objects, background, background2, bgGradient, bgShape, bgPad, bgRadius, exportOpacity, sizes, perSize } }, null, 1);
}

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const KNOWN_TYPES = ['rect', 'ellipse', 'line', 'pen', 'poly', 'text', 'image', 'shape', 'emoji'];

/** A design read from file text. Throws Error('BAD_FILE') for anything that is not one. */
export function parseDesign(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('BAD_FILE'); }
  if (!isObject(data) || data.format !== FORMAT || !isObject(data.design) || !Array.isArray(data.design.objects)) throw new Error('BAD_FILE');
  if (Number(data.version) > FORMAT_VERSION) throw new Error('NEWER_FILE');
  const base = emptyDesign();
  const d = data.design;
  const ids = new Set();
  const objects = d.objects.filter((o) => isObject(o) && KNOWN_TYPES.includes(o.type)).map((o) => {
    const copy = { ...o, fx: { ...DEFAULT_FX, ...(isObject(o.fx) ? o.fx : {}) } };
    // Every object needs its own id (filters and gradients are found by it).
    if (typeof copy.id !== 'string' || ids.has(copy.id)) copy.id = uid();
    ids.add(copy.id);
    return copy;
  });
  return {
    ...base,
    objects,
    background: typeof d.background === 'string' ? d.background : base.background,
    background2: typeof d.background2 === 'string' ? d.background2 : base.background2,
    bgGradient: !!d.bgGradient,
    bgShape: d.bgShape === 'circle' ? 'circle' : 'square',
    bgPad: Number.isFinite(d.bgPad) ? d.bgPad : base.bgPad,
    bgRadius: Number.isFinite(d.bgRadius) ? d.bgRadius : base.bgRadius,
    exportOpacity: Number.isFinite(d.exportOpacity) ? d.exportOpacity : 100,
    sizes: Array.isArray(d.sizes) && d.sizes.length ? d.sizes.filter(Number.isFinite) : base.sizes,
    perSize: !!d.perSize,
  };
}

/** "C:\a\b\logo.myico" → "logo". */
export function baseName(path) {
  const file = String(path ?? '').split(/[\\/]/).pop() ?? '';
  return file.replace(/\.[^.]+$/, '');
}

/** The recent-files list with `entry` in front (no duplicates, at most `limit`). */
export function addRecent(list, entry, limit = 12) {
  const key = (item) => String(item.path).toLowerCase();
  return [entry, ...(list ?? []).filter((item) => key(item) !== key(entry))].slice(0, limit);
}
