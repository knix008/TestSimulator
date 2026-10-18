// The controls for a diagram's own background, shared by the editor panel
// (diagram options › Background) and the "Diagram background…" popup: the
// kind (default · colour · picture · pattern), the background colour with its
// opacity, the picture (choose / clear, fit, opacity) and the pattern (tiles
// with a preview, ink colour, opacity, size). Controls carry data-bg (a click
// sets key = data-value), data-bg-input (an input / select: its value) and
// data-bg-action (pick / clear the picture); the panel commits them through
// app.js, the popup keeps them in its draft. Pure strings (no DOM).
import { BACKGROUND_FIELDS, DIAGRAM_BG_FITS, DIAGRAM_BG_KINDS, DIAGRAM_BG_PATTERNS } from '../domain/meta.js';
import { BG_PATTERN_TILES, diagramBackground, DIAGRAM_THEMES } from '../render/notation.js';
import { icon } from '../icons.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Swatches for the background colour and for the pattern ink. */
export const BG_COLORS = ['#ffffff', '#f5f7fa', '#fff8e1', '#e8f5e9', '#e3f2fd', '#f3e5f5', '#fde2e4', '#fff3e0', '#263238', '#1e1f24', '#0f3057', '#000000'];
export const BG_INK_COLORS = ['#a9b2bf', '#cfd8e3', '#90caf9', '#a5d6a7', '#ffcc80', '#ef9a9a', '#b39ddb', '#80cbc4', '#607d8b', '#37474f', '#ffffff', '#000000'];
/** Every background field name (meta.js). */
export const BG_KEYS = BACKGROUND_FIELDS.map((f) => f.key);
const NUMBER_KEYS = new Set(BACKGROUND_FIELDS.filter((f) => f.type === 'int').map((f) => f.key));

/** The background fields of a diagram (only those set). */
export function backgroundFieldsOf(diagram) {
  const out = {};
  for (const key of BG_KEYS) if (diagram?.[key] !== undefined) out[key] = diagram[key];
  return out;
}

/** A control's raw value as the field's value (numbers clamped, '' for "default"). */
export function backgroundValue(key, raw) {
  if (!NUMBER_KEYS.has(key)) return String(raw ?? '');
  const field = BACKGROUND_FIELDS.find((f) => f.key === key);
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return field.def ?? 0;
  return Math.min(field.max ?? 100000, Math.max(field.min ?? 0, value));
}

/** A pattern tile as a small SVG (the pattern picker). */
export function patternSwatchSvg(pattern, color = '#5b6676', background = '#ffffff', size = 34) {
  const tile = BG_PATTERN_TILES[pattern] ?? BG_PATTERN_TILES.dots;
  const id = `sw-${pattern}`;
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${tile.w}" height="${tile.h}">${tile.svg(esc(color))}</pattern></defs><rect width="40" height="40" fill="${esc(background)}"/><rect width="40" height="40" fill="url(#${id})"/></svg>`;
}

/**
 * The background controls. values: the diagram's background fields (the draft in the popup);
 * theme: the diagram colour scheme id; t: translations; row(label, control, cls, glyph): the caller's row
 * layout (the panel's property rows; by default the popup's).
 */
export function backgroundControlsHtml(values, { t, theme = 'classic', row } = {}) {
  const palette = DIAGRAM_THEMES[theme] ?? DIAGRAM_THEMES.classic;
  const bg = diagramBackground(values, palette);
  const kind = bg?.kind ?? '';
  const line = row ?? ((label, control, cls = '', glyph = '') => `<div class="bg-row ${cls}"><span class="bg-label">${glyph ? icon(glyph) : ''}${esc(label)}</span><span class="bg-control">${control}</span></div>`);
  const segment = (key, options, current) => `<span class="segmented small bg-segments" role="radiogroup">${options.map(([value, label, glyph]) => `<button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-bg="${key}" data-value="${esc(value)}" title="${esc(label)}">${glyph ? icon(glyph) : ''}<span>${esc(label)}</span></button>`).join('')}</span>`;
  const colors = (key, list, current, fallback) => `<span class="bg-swatches">${list.map((c) => `<button class="swatch bg-swatch ${String(current).toLowerCase() === c ? 'active' : ''}" data-bg="${key}" data-value="${c}" style="--swatch:${c}" title="${c}" aria-label="${c}"></button>`).join('')}<label class="bg-custom" title="${esc(t('bg.custom'))}"><input type="color" data-bg-input="${key}" value="${esc(/^#[0-9a-f]{6}$/i.test(current) ? current : fallback)}" aria-label="${esc(t('bg.custom'))}" /></label><button class="button small bg-default ${current ? '' : 'active'}" data-bg="${key}" data-value="" title="${esc(t('bg.defaultHint'))}">${esc(t('bg.default'))}</button></span>`;
  const slider = (key, value, min, max, step, label) => `<span class="bg-slider"><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-bg-input="${key}" aria-label="${esc(label)}" title="${esc(label)}" /><input type="number" min="${min}" max="${max}" step="${step}" value="${value}" data-bg-input="${key}" aria-label="${esc(label)}" /><span class="bg-unit">%</span></span>`;
  let out = line(t('bg.kind'), segment('backgroundKind', DIAGRAM_BG_KINDS.map((k) => [k, t(`bg.kind.${k || 'default'}`), { '': 'diagramBackground', color: 'fillColor', image: 'picture', pattern: 'grid' }[k]]), kind), 'bg-kind-row', 'diagramBackground');
  if (!bg) return `${out}<p class="bg-hint">${esc(t('bg.hintDefault'))}</p>`;
  out += line(t('bg.color'), colors('backgroundColor', BG_COLORS, values.backgroundColor ?? '', palette.background), '', 'fillColor');
  out += line(t('bg.colorOpacity'), slider('backgroundColorOpacity', bg.colorOpacity, 0, 100, 5, t('bg.colorOpacity')), '', 'eye');
  if (kind === 'image') {
    const name = bg.image ? `${bg.imageWidth || '?'} × ${bg.imageHeight || '?'} px` : t('bg.noImage');
    out += line(t('bg.image'), `<span class="bg-image-row"><button class="button small" data-bg-action="pick" title="${esc(t('action.chooseImage'))}">${icon('picture')}<span>${esc(t('action.chooseImage'))}</span></button><button class="button small" data-bg-action="clear" ${bg.image ? '' : 'disabled'} title="${esc(t('bg.clearImage'))}">${icon('close')}<span>${esc(t('bg.clearImage'))}</span></button><span class="bg-image-size">${esc(name)}</span></span>`, '', 'picture');
    out += line(t('bg.fit'), `<select data-bg-input="backgroundFit" aria-label="${esc(t('bg.fit'))}" title="${esc(t('bg.fit'))}">${DIAGRAM_BG_FITS.map((f) => `<option value="${f}" ${bg.fit === f ? 'selected' : ''}>${esc(t(`bg.fit.${f}`))}</option>`).join('')}</select>`, '', 'fitPage');
    out += line(t('bg.opacity'), slider('backgroundOpacity', bg.opacity, 0, 100, 5, t('bg.opacity')), '', 'eye');
  }
  if (kind === 'pattern') {
    out += line(t('bg.pattern'), `<span class="bg-patterns" role="radiogroup">${DIAGRAM_BG_PATTERNS.map((p) => `<button class="bg-pattern ${bg.pattern === p ? 'active' : ''}" role="radio" aria-checked="${bg.pattern === p}" data-bg="backgroundPattern" data-value="${p}" title="${esc(t(`bg.pattern.${p}`))}" aria-label="${esc(t(`bg.pattern.${p}`))}">${patternSwatchSvg(p, bg.patternColor, bg.color, 30)}</button>`).join('')}</span>`, 'tall', 'grid');
    out += line(t('bg.patternColor'), colors('backgroundPatternColor', BG_INK_COLORS, values.backgroundPatternColor ?? '', palette.gridMajor ?? '#a9b2bf'), '', 'lineColor');
    out += line(t('bg.patternOpacity'), slider('backgroundPatternOpacity', bg.patternOpacity, 0, 100, 5, t('bg.patternOpacity')), '', 'eye');
    out += line(t('bg.patternScale'), slider('backgroundPatternScale', bg.patternScale, 50, 300, 10, t('bg.patternScale')), '', 'zoomIn');
  }
  return `${out}<p class="bg-hint">${esc(t('bg.hint'))}</p>`;
}
