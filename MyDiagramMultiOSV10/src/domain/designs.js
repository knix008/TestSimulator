// Diagram designs (Visio "Themes" and "Variants") and quick styles. A design
// gives the drawing its colours, font, line weight, corner rounding, shadow and
// connector style. Shapes keep only what the user changed by hand: anything
// left unset comes from the design (through the shape's quick style), so
// choosing another design restyles every untouched shape at once.
// Pure — the renderer, export and tests use it.
import { masterById } from './stencils.js';

/** Quick-style variants: how the accent colour is used. */
export const QUICK_VARIANTS = ['fill', 'subtle', 'outline', 'intense', 'gradient', 'none'];
/** Six accent colours per design (1…6). */
export const ACCENTS = [1, 2, 3, 4, 5, 6];

const design = (id, ko, en, colors, extra = {}) => ({
  id, name: { ko, en }, colors, font: '', lineWidth: 1.25, rounding: 0, shadow: false, gradient: false, dark: false, page: '#ffffff', text: '#1f2937', connector: '#4b5563', connectorWidth: 1.5, ...extra,
});

export const DESIGNS = [
  design('office', '오피스', 'Office', ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47']),
  design('linear', '선형', 'Linear', ['#2f6fde', '#0fa3b1', '#7c5cff', '#f25f5c', '#ffb400', '#43aa8b'], { lineWidth: 1.5, connector: '#334155' }),
  design('facet', '패싯', 'Facet', ['#6aa84f', '#3c78d8', '#e69138', '#a64d79', '#45818e', '#cc4125'], { rounding: 4 }),
  design('integral', '통합', 'Integral', ['#1f6f8b', '#99a8b2', '#e6d5b8', '#d96c75', '#3f4e4f', '#a27b5c'], { lineWidth: 2 }),
  design('ion', '이온', 'Ion', ['#0b8a83', '#5f4b8b', '#f2a65a', '#e65f5c', '#3d9970', '#2e86ab'], { rounding: 8, shadow: true }),
  design('retrospect', '회고', 'Retrospect', ['#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646', '#2c4d75'], { gradient: true }),
  design('slice', '조각', 'Slice', ['#05668d', '#028090', '#00a896', '#02c39a', '#f0a202', '#e76f51'], { rounding: 2 }),
  design('whisp', '위스프', 'Whisp', ['#8e7cc3', '#76a5af', '#f6b26b', '#e06666', '#93c47d', '#6fa8dc'], { rounding: 10, lineWidth: 1 }),
  design('organic', '유기적', 'Organic', ['#588157', '#a3b18a', '#dda15e', '#bc6c25', '#606c38', '#283618'], { rounding: 12, shadow: true }),
  design('bubble', '버블', 'Bubble', ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#fb5607'], { rounding: 14, gradient: true }),
  design('sequence', '시퀀스', 'Sequence', ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#8ab17d'], { lineWidth: 1.75 }),
  design('radiance', '광채', 'Radiance', ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd', '#ff9ff3'], { gradient: true, shadow: true, rounding: 6 }),
  design('monochrome', '단색', 'Monochrome', ['#374151', '#6b7280', '#9ca3af', '#4b5563', '#1f2937', '#d1d5db'], { connector: '#111827' }),
  design('blueprint', '청사진', 'Blueprint', ['#4fc3f7', '#81d4fa', '#b3e5fc', '#29b6f6', '#e1f5fe', '#0288d1'], { dark: true, page: '#0d2b4e', text: '#e3f2fd', connector: '#b3e5fc', lineWidth: 1.5 }),
  design('midnight', '자정', 'Midnight', ['#7aa2f7', '#bb9af7', '#9ece6a', '#e0af68', '#f7768e', '#2ac3de'], { dark: true, page: '#1a1b26', text: '#c0caf5', connector: '#a9b1d6', rounding: 6 }),
  design('chalkboard', '칠판', 'Chalkboard', ['#e8eddf', '#cfdbd5', '#f5cb5c', '#9bc1bc', '#ed6a5a', '#f4f1bb'], { dark: true, page: '#24312b', text: '#f4f1de', connector: '#e8eddf', lineWidth: 2 }),
];
export const DESIGN_VARIANTS = 4;

export const designById = (id) => DESIGNS.find((d) => d.id === id) ?? DESIGNS[0];

/** The design's six accents after its variant (0–3): rotated, and lighter / darker for 2 and 3. */
export function variantColors(designId, variant = 0) {
  const d = designById(designId);
  const v = ((Number(variant) || 0) % DESIGN_VARIANTS + DESIGN_VARIANTS) % DESIGN_VARIANTS;
  const rotated = [...d.colors.slice(v % 2 ? 1 : 0), ...d.colors.slice(0, v % 2 ? 1 : 0)];
  if (v === 2) return rotated.map((c) => mix(c, '#ffffff', 0.18));
  if (v === 3) return rotated.map((c) => mix(c, '#000000', 0.18));
  return rotated;
}

// ───────────────────────── colours

export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export const isColor = (value) => hexRgb(value) != null;

export function mix(a, b, amount) {
  const x = hexRgb(a) ?? [128, 128, 128];
  const y = hexRgb(b) ?? [128, 128, 128];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function luminance(hex) {
  const rgb = (hexRgb(hex) ?? [0, 0, 0]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Black or white, whichever reads better on `bg`. */
export const readableOn = (bg, dark = '#1f2937', light = '#ffffff') => (luminance(bg) > 0.42 ? dark : light);

/** Colours offered in the colour pickers: the design's accents plus standard colours. */
export const STANDARD_COLORS = ['#000000', '#404040', '#7f7f7f', '#bfbfbf', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];

// ───────────────────────── style resolution

/** Every style property a shape or connector can carry, with what it means. */
export const STYLE_KEYS = [
  'fill', 'fill2', 'fillPattern', 'gradientAngle', 'fillOpacity', 'line', 'lineWidth', 'dash', 'lineOpacity', 'rounding', 'shadow', 'shadowColor',
  'font', 'fontSize', 'textColor', 'bold', 'italic', 'underline', 'strike', 'align', 'valign', 'textAngle', 'lineSpacing', 'textBg', 'margin',
  'startArrow', 'endArrow', 'arrowSize', 'opacity',
];
export const FILL_PATTERNS = ['solid', 'linear', 'radial', 'hatch', 'cross', 'dots', 'none'];
export const DASHES = ['solid', 'dash', 'dot', 'dashDot', 'longDash', 'dashDotDot'];
export const ARROWS = ['none', 'arrow', 'open', 'stealth', 'triangleOpen', 'diamond', 'diamondOpen', 'circle', 'circleOpen', 'bar', 'one', 'many', 'oneMany', 'zeroMany', 'zeroOne', 'oneOnly'];
export const ALIGNS = ['left', 'center', 'right'];
export const VALIGNS = ['top', 'middle', 'bottom'];
export const FONTS = ['', 'Segoe UI', 'Malgun Gothic', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Consolas', 'Courier New', 'Noto Sans KR', 'Nanum Gothic', 'Comic Sans MS'];

const baseText = (d) => ({ font: d.font, fontSize: 13, bold: false, italic: false, underline: false, strike: false, align: 'center', valign: 'middle', textAngle: 0, lineSpacing: 1.2, textBg: 'none', margin: 4 });

/**
 * The complete style of a 2-D shape: design → quick style → master defaults →
 * the shape's own values. `doc` gives the design (doc.design, doc.variant).
 */
export function resolveShapeStyle(doc, shape) {
  const master = masterById(shape.master);
  const d = designById(doc?.design);
  const accents = variantColors(d.id, doc?.variant);
  const qs = shape.qs ?? {};
  const accent = accents[((qs.color ?? 1) - 1 + 6) % 6] ?? accents[0];
  const variant = qs.variant ?? master.qs ?? (master.kind === 'text' ? 'none' : 'fill');
  const pageText = d.dark ? d.text : '#1f2937';
  let style;
  switch (variant) {
    case 'subtle': style = { fill: mix(accent, d.page, d.dark ? 0.7 : 0.82), line: accent, textColor: d.dark ? mix(accent, '#ffffff', 0.6) : mix(accent, '#000000', 0.55) }; break;
    case 'outline': style = { fill: d.page, line: accent, textColor: pageText }; break;
    case 'intense': style = { fill: mix(accent, '#000000', 0.22), line: 'none', textColor: '#ffffff' }; break;
    case 'gradient': style = { fill: mix(accent, '#ffffff', 0.35), fill2: mix(accent, '#000000', 0.12), fillPattern: 'linear', line: mix(accent, '#000000', 0.25), textColor: readableOn(accent) }; break;
    case 'none': style = { fill: 'none', line: 'none', textColor: pageText }; break;
    default: style = { fill: accent, line: mix(accent, '#000000', 0.28), textColor: readableOn(accent) };
  }
  const out = {
    fillPattern: d.gradient && variant === 'fill' ? 'linear' : 'solid', fill2: d.gradient && variant === 'fill' ? mix(accent, '#000000', 0.18) : '#ffffff', gradientAngle: 90, fillOpacity: 100,
    lineWidth: d.lineWidth, dash: 'solid', lineOpacity: 100, rounding: d.rounding, shadow: d.shadow, shadowColor: 'rgba(0,0,0,0.25)', opacity: 100,
    ...baseText(d), startArrow: 'none', endArrow: 'none', arrowSize: 1,
    ...style,
    ...(master.style ?? {}),
  };
  if (master.style?.fill && master.style.fill !== 'none' && !master.style.textColor && !qs.variant) out.textColor = readableOn(master.style.fill);
  for (const key of STYLE_KEYS) if (shape.style?.[key] !== undefined && shape.style[key] !== null) out[key] = shape.style[key];
  if (out.fillPattern === 'none') out.fill = 'none';
  return out;
}

/** The complete style of a connector. */
export function resolveConnectorStyle(doc, connector) {
  const d = designById(doc?.design);
  const out = {
    line: d.connector, lineWidth: d.connectorWidth, dash: 'solid', lineOpacity: 100, startArrow: 'none', endArrow: 'arrow', arrowSize: 1, shadow: false,
    ...baseText(d), fontSize: 12, textColor: d.dark ? d.text : '#1f2937', textBg: 'page', fill: 'none', opacity: 100, rounding: 0,
  };
  for (const key of STYLE_KEYS) if (connector.style?.[key] !== undefined && connector.style[key] !== null) out[key] = connector.style[key];
  return out;
}

/** The page colour: the page's own, else the design's. */
export const pageColor = (doc, page) => page?.color || designById(doc?.design).page;

/** SVG stroke-dasharray for a dash name at a line width. */
export function dashArray(dash, width = 1) {
  const w = Math.max(1, width);
  switch (dash) {
    case 'dash': return `${4 * w} ${3 * w}`;
    case 'dot': return `${w} ${2 * w}`;
    case 'dashDot': return `${5 * w} ${2.5 * w} ${w} ${2.5 * w}`;
    case 'longDash': return `${9 * w} ${4 * w}`;
    case 'dashDotDot': return `${5 * w} ${2 * w} ${w} ${2 * w} ${w} ${2 * w}`;
    default: return '';
  }
}
