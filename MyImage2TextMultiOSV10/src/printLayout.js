// Print window layout. Everything is in millimetres on one sheet; the preview and the printed
// page are built from the same plan, so what the print window shows is what comes out.

/** Paper sizes in millimetres, portrait. */
export const PAPERS = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  B4: [257, 364],
  B5: [182, 257],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
};

/** Margin presets: the same distance on every side, in millimetres. */
export const MARGIN_PRESETS = { none: 0, narrow: 8, normal: 15, wide: 25 };
export const MARGIN_LIMIT = { min: 0, max: 50, step: 1 };
export const SIDES = ['top', 'right', 'bottom', 'left'];

/** Ink: black on white, the result's own colours on white, or the screen's dark look. */
export const INKS = ['mono', 'color', 'screen'];
export const H_ALIGN = ['left', 'center', 'right'];
export const V_ALIGN = ['top', 'middle', 'bottom'];

export const TITLE_MM = 9;
export const FOOTER_MM = 7;
export const GAP_MM = 6;
export const SCALE = { min: 20, max: 100, step: 5 };
export const COPIES = { min: 1, max: 99 };

export const DEFAULT_PRINT = {
  printer: '',
  copies: 1,
  paper: 'A4',
  orientation: 'auto',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  hAlign: 'center',
  vAlign: 'middle',
  ink: 'mono',
  title: true,
  source: false,
  footer: false,
  scale: 100,
};

const clampInt = (value, low, high, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
};

export function normalizeMargins(raw) {
  // Older settings kept a preset name; turn it into four sides.
  if (typeof raw === 'string') {
    const mm = MARGIN_PRESETS[raw] ?? MARGIN_PRESETS.normal;
    return { top: mm, right: mm, bottom: mm, left: mm };
  }
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const side of SIDES) out[side] = clampInt(source[side], MARGIN_LIMIT.min, MARGIN_LIMIT.max, DEFAULT_PRINT.margins[side]);
  return out;
}

/** The preset the four margins match, or '' when they were set one by one. */
export function marginPreset(margins) {
  const m = normalizeMargins(margins);
  const same = SIDES.every((side) => m[side] === m.top);
  if (!same) return '';
  return Object.keys(MARGIN_PRESETS).find((key) => MARGIN_PRESETS[key] === m.top) ?? '';
}

export function normalizePrint(raw) {
  const p = { ...DEFAULT_PRINT, ...(raw && typeof raw === 'object' ? raw : {}) };
  p.printer = typeof p.printer === 'string' ? p.printer.slice(0, 260) : '';
  p.copies = clampInt(p.copies, COPIES.min, COPIES.max, 1);
  if (!PAPERS[p.paper]) p.paper = DEFAULT_PRINT.paper;
  if (!['auto', 'portrait', 'landscape'].includes(p.orientation)) p.orientation = DEFAULT_PRINT.orientation;
  p.margins = normalizeMargins(p.margins);
  if (!H_ALIGN.includes(p.hAlign)) p.hAlign = DEFAULT_PRINT.hAlign;
  if (!V_ALIGN.includes(p.vAlign)) p.vAlign = DEFAULT_PRINT.vAlign;
  if (!INKS.includes(p.ink)) p.ink = DEFAULT_PRINT.ink;
  p.title = Boolean(p.title);
  p.source = Boolean(p.source);
  p.footer = Boolean(p.footer);
  const scale = Math.round(Number(p.scale) / SCALE.step) * SCALE.step;
  p.scale = Number.isFinite(scale) ? Math.min(SCALE.max, Math.max(SCALE.min, scale)) : DEFAULT_PRINT.scale;
  return p;
}

/**
 * "auto" turns the sheet so the content fills it best: landscape for wide content
 * (or for a wide pair shown side by side), portrait otherwise.
 */
export function resolveOrientation(options, textAspect, sourceAspect) {
  if (options.orientation !== 'auto') return options.orientation;
  const aspect = options.source ? Math.max(textAspect, sourceAspect ?? textAspect) : textAspect;
  return aspect > 1.05 ? 'landscape' : 'portrait';
}

export function sheetSize(paper, orientation) {
  const [w, h] = PAPERS[paper] ?? PAPERS.A4;
  return orientation === 'landscape' ? [h, w] : [w, h];
}

/** The largest box with the given aspect (width / height) inside w × h. */
export function fitBox(w, h, aspect) {
  if (!(aspect > 0) || !(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  return w / h > aspect ? { w: h * aspect, h } : { w, h: w / aspect };
}

const round = (value) => Math.round(value * 100) / 100;
const share = { left: 0, top: 0, center: 0.5, middle: 0.5, right: 1, bottom: 1 };

/**
 * Plans one sheet. Returns the sheet size, the title and footer bands and a box for every
 * picture ({ kind: 'text' | 'source', x, y, w, h }), with the top-left corner at the paper's corner.
 */
export function planSheet(raw, textAspect, sourceAspect = null) {
  const options = normalizePrint(raw);
  const orientation = resolveOrientation(options, textAspect, sourceAspect);
  const [pageW, pageH] = sheetSize(options.paper, orientation);
  const m = options.margins;
  const left = m.left;
  let top = m.top;
  const width = Math.max(10, pageW - m.left - m.right);
  let height = Math.max(10, pageH - m.top - m.bottom);
  let title = null;
  let footer = null;
  if (options.title) {
    title = { x: left, y: top, w: width, h: TITLE_MM };
    top += TITLE_MM;
    height -= TITLE_MM;
  }
  if (options.footer) {
    height -= FOOTER_MM;
    footer = { x: left, y: top + height, w: width, h: FOOTER_MM };
  }

  const kinds = options.source && sourceAspect > 0 ? ['source', 'text'] : ['text'];
  const aspects = { text: textAspect, source: sourceAspect };
  let slots;
  let sideBySide = false;
  if (kinds.length === 1) {
    slots = [{ kind: 'text', x: left, y: top, w: width, h: height }];
  } else {
    // Side by side when that gives the pictures more room than one above the other.
    const sideW = (width - GAP_MM) / 2;
    const stackH = (height - GAP_MM) / 2;
    const side = kinds.reduce((sum, kind) => sum + area(fitBox(sideW, height, aspects[kind])), 0);
    const stack = kinds.reduce((sum, kind) => sum + area(fitBox(width, stackH, aspects[kind])), 0);
    sideBySide = side >= stack;
    slots = sideBySide
      ? kinds.map((kind, i) => ({ kind, x: left + i * (sideW + GAP_MM), y: top, w: sideW, h: height }))
      : kinds.map((kind, i) => ({ kind, x: left, y: top + i * (stackH + GAP_MM), w: width, h: stackH }));
  }

  const factor = options.scale / 100;
  const boxes = slots.map((slot) => {
    const fitted = fitBox(slot.w, slot.h, aspects[slot.kind]);
    const w = fitted.w * factor;
    const h = fitted.h * factor;
    return {
      kind: slot.kind,
      x: round(slot.x + (slot.w - w) * share[options.hAlign]),
      y: round(slot.y + (slot.h - h) * share[options.vAlign]),
      w: round(w),
      h: round(h),
    };
  });

  return { options, orientation, page: { w: pageW, h: pageH }, margins: m, title, footer, boxes, sideBySide };
}

function area(box) {
  return box.w * box.h;
}

/** CSS for the printed page: the exact sheet size, no browser margin (the plan has its own). */
export function pageCss(plan) {
  return `@page { size: ${plan.page.w}mm ${plan.page.h}mm; margin: 0; }`;
}

/** What the desktop app's printer needs: the sheet in millimetres, the printer and the copies. */
export function printJob(plan) {
  return {
    printer: plan.options.printer,
    copies: plan.options.copies,
    widthMm: plan.page.w,
    heightMm: plan.page.h,
  };
}
