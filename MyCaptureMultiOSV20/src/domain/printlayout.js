// Print layout: where a captured image goes on the paper, in millimetres. Used by the
// print window for both the on-screen preview and the printed page, so what you see
// is what prints. No DOM here (unit tested).

export const PAPERS = Object.freeze({
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
});
export const ORIENTATIONS = ['auto', 'portrait', 'landscape'];
export const SCALES = ['fit', 'fill', 'actual', 'percent'];
export const MARGINS = [0, 5, 10, 15, 20];
export const PERCENT = { min: 10, max: 400, step: 5 };
/** Room for the file name above the image and the date / page footer below it. */
export const HEADER_MM = 8;
export const FOOTER_MM = 7;
/** Screen pixels per inch: a capture "at actual size" prints as big as it looked. */
export const SCREEN_DPI = 96;
export const PRINT_KEY = 'mycapture.print.v1';

export const defaultPrintOptions = Object.freeze({
  paper: 'A4', orientation: 'auto', margin: 10, scale: 'fit', percent: 100, header: true, footer: true, border: false,
});

/** Accepts anything (old or hand-edited storage) and returns valid options. */
export function sanitizePrintOptions(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const d = defaultPrintOptions;
  const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
  const percent = Number(value.percent);
  return {
    paper: Object.hasOwn(PAPERS, value.paper) ? value.paper : d.paper,
    orientation: pick(value.orientation, ORIENTATIONS, d.orientation),
    margin: pick(Number(value.margin), MARGINS, d.margin),
    scale: pick(value.scale, SCALES, d.scale),
    percent: Number.isFinite(percent) ? Math.min(PERCENT.max, Math.max(PERCENT.min, Math.round(percent / PERCENT.step) * PERCENT.step)) : d.percent,
    header: typeof value.header === 'boolean' ? value.header : d.header,
    footer: typeof value.footer === 'boolean' ? value.footer : d.footer,
    border: typeof value.border === 'boolean' ? value.border : d.border,
  };
}

/** Pixels on screen → millimetres on paper at SCREEN_DPI. */
export const pxToMm = (px) => (px * 25.4) / SCREEN_DPI;

/**
 * The page for an image of imageW × imageH pixels:
 * - page: paper size in mm, turned for landscape ("auto" follows the image's shape);
 * - area: the printable box inside the margins and the header / footer rows;
 * - image: its box in mm (may extend past `area` for "fill" or a large percent — the
 *   page clips it, `clipped` says so); `zoom` is its size relative to actual size.
 */
export function printLayout(rawOptions, imageW, imageH) {
  const options = sanitizePrintOptions(rawOptions);
  const paper = PAPERS[options.paper];
  const wide = imageW > imageH;
  const landscape = options.orientation === 'landscape' || (options.orientation === 'auto' && wide);
  const page = landscape ? { width: paper.height, height: paper.width } : { width: paper.width, height: paper.height };
  const top = options.margin + (options.header ? HEADER_MM : 0);
  const bottom = options.margin + (options.footer ? FOOTER_MM : 0);
  const area = { x: options.margin, y: top, width: page.width - options.margin * 2, height: page.height - top - bottom };
  const actualW = pxToMm(Math.max(1, imageW));
  const actualH = pxToMm(Math.max(1, imageH));
  const fit = Math.min(area.width / actualW, area.height / actualH);
  const fill = Math.max(area.width / actualW, area.height / actualH);
  const zoom = options.scale === 'fit' ? fit
    : options.scale === 'fill' ? fill
      : options.scale === 'actual' ? 1
        : options.percent / 100;
  const width = actualW * zoom;
  const height = actualH * zoom;
  // Centred in the printable area.
  const image = { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
  const clipped = width > area.width + 0.01 || height > area.height + 0.01;
  return { options, landscape, page, area, image, zoom, clipped };
}

/** The CSS @page rule for a layout (paper size and orientation, no browser margins). */
export const pageRule = (layout) => `@page { size: ${layout.page.width}mm ${layout.page.height}mm; margin: 0; }`;
