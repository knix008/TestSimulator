// Built-in looks: one click sets a whole style (film stocks, black & white,
// warm / cool grades, portrait, landscape, colour grading …), and every value
// it set can then be fine-tuned with the ordinary sliders.
//
// Three kinds:
//  - LOOKS come from ImageViewer V20's effect presets and keep its notation
//    (CSS-filter like: brightness / contrast / saturation 100 = unchanged, hue
//    in degrees, warmth −100…100, blur in pixels, sharpen / vignette / grain /
//    grayscale / sepia / invert 0…100, posterize = levels, emboss / edge on-off,
//    tiltShift = miniature depth). lookSettings() converts them.
//  - PRO_LOOKS are written in this editor's own values (0 = unchanged, the
//    sliders' ranges) and also use what ImageViewer does not have: highlights /
//    shadows / whites / blacks, tint, vibrance, clarity, dehaze, split toning
//    and the built-in LUTs.
//  - ART_LOOKS use this editor's special effects (edit/advanced.js).
//
// What a look owns: the LOOK_FIELDS (reset by every look), plus the EXTRA_FIELDS
// that look itself sets. Applying a look resets the LOOK_FIELDS and the extra
// fields of the look applied before it, so looks replace each other instead of
// piling up; exposure, curves, lens correction, crop, text … are never touched.
import { DEFAULT_ADJUST } from './adjust.js';
import { effectParams } from './advanced.js';
import { DEFAULT_DETAIL, DEFAULT_FX, DEFAULT_TONE, normalizeEdit } from './pipeline.js';

/** The settings every look sets: [group, key]. Applying a look resets these first. */
export const LOOK_FIELDS = Object.freeze([
  ['adjust', 'brightness'], ['adjust', 'contrast'], ['adjust', 'saturation'], ['adjust', 'hue'], ['adjust', 'temperature'],
  ['adjust', 'effect'], ['adjust', 'effectAmount'],
  ['detail', 'blur'], ['detail', 'sharpen'],
  ['fx', 'vignette'], ['fx', 'grain'], ['fx', 'emboss'], ['fx', 'edges'],
]);
/** Settings only some (PRO) looks set; a look owns them only when it sets them. */
export const EXTRA_FIELDS = Object.freeze([
  ['adjust', 'highlights'], ['adjust', 'shadows'], ['adjust', 'whites'], ['adjust', 'blacks'], ['adjust', 'tint'], ['adjust', 'vibrance'],
  ['detail', 'clarity'], ['tone', 'dehaze'], ['tone', 'splitTone'], ['lut', null],
]);
const DEFAULTS = { adjust: DEFAULT_ADJUST, detail: DEFAULT_DETAIL, fx: DEFAULT_FX, tone: DEFAULT_TONE };
const fieldName = ([group, key]) => (key ? `${group}.${key}` : group);

/** Artistic looks built on the editor's special effects, plus a light grade. */
export const ART_LOOKS = Object.freeze({
  artOilPaint: { effect: ['oilPaint', {}], saturation: 112 },
  artPencil: { effect: ['pencilSketch', {}] },
  artColorSketch: { effect: ['colorSketch', {}] },
  artCartoon: { effect: ['cartoon', {}], saturation: 120 },
  artWatercolor: { effect: ['watercolor', {}], brightness: 106 },
  artOrton: { effect: ['orton', {}] },
  artGlow: { effect: ['glow', {}] },
  artHalftone: { effect: ['halftone', {}] },
  artOldPhoto: { effect: ['oldPhoto', {}] },
  artCrossProcess: { effect: ['crossProcess', {}] },
  artDuotone: { effect: ['duotone', {}] },
  artInfrared: { effect: ['infrared', {}] },
  artTechnicolor: { effect: ['technicolor', {}] },
  artFrosted: { effect: ['frostedGlass', {}] },
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, digits = 0) => { const f = 10 ** digits; return Math.round(v * f) / f || 0; };

/** The look's definition, or null. */
export const lookValues = (id) => LOOKS[id] ?? PRO_LOOKS[id] ?? ART_LOOKS[id] ?? null;
export const isLook = (id) => Boolean(lookValues(id));

/** Every look id, category by category (ImageViewer's, then this editor's own, art last). */
export const lookCategories = () => [...LOOK_CATEGORIES, ...PRO_CATEGORIES, { key: 'catArt', ids: Object.keys(ART_LOOKS) }];

/**
 * The look's settings at `amount` % (100 = as designed, 0 = nothing, up to 150):
 * { adjust, detail, fx, tone, effects, tilt, lut, extra } — `extra` lists the EXTRA_FIELDS it sets.
 */
export function lookSettings(id, amount = 100) {
  const v = lookValues(id);
  if (!v) throw new Error(`Unknown look: ${id}`);
  const a = clamp(amount, 0, 150) / 100;
  return PRO_LOOKS[id] ? proSettings(v, a) : viewerSettings(v, a);
}

/** ImageViewer notation → settings. */
function viewerSettings(v, a) {
  const mix = (key, neutral) => neutral + ((v[key] ?? neutral) - neutral) * a;
  const contrast = mix('contrast', 100) - 100;
  // Grayscale is a loss of saturation, so it folds into the saturation slider.
  const saturation = (mix('saturation', 100) / 100) * (1 - clamp(mix('grayscale', 0), 0, 100) / 100);
  const invert = mix('invert', 0);
  const sepia = mix('sepia', 0);
  const solarize = mix('solarize', 0);
  const effect = invert > 0 ? ['invert', invert] : sepia > 0 ? ['sepia', sepia] : solarize > 0 ? ['solarize', solarize] : ['none', 100];
  const adjust = {
    // A multiplier there; here an offset that moves mid grey by the same amount. Exposure stays the user's.
    brightness: round(clamp(mix('brightness', 100) - 100, -100, 100)),
    // Positive contrast here is an S-curve that bites harder than a CSS slope.
    contrast: round(clamp(contrast >= 0 ? contrast * 0.45 : contrast, -100, 100)),
    saturation: round(clamp(saturation * 100 - 100, -100, 100)),
    hue: round(clamp(mix('hue', 0), -180, 180)),
    temperature: round(clamp(mix('warmth', 0) * 0.7, -100, 100)),
    effect: effect[0],
    effectAmount: round(clamp(effect[1], 0, 100)),
  };
  const detail = {
    blur: round(clamp(mix('blur', 0) / 0.3, 0, 50), 1), // px → this blur's units (σ = 0.3 × value)
    sharpen: round(clamp(mix('sharpen', 0), 0, 200)),
  };
  const fx = {
    vignette: round(clamp(-mix('vignette', 0), -100, 100)), // negative darkens the corners here
    grain: round(clamp(mix('grain', 0), 0, 100)),
    emboss: Boolean(v.emboss) && a > 0,
    edges: Boolean(v.edge) && a > 0,
  };
  const effects = [];
  if (v.posterize && a > 0) effects.push({ id: 'posterize', params: effectParams('posterize', { levels: Math.max(2, v.posterize) }) });
  if (v.effect && a > 0) {
    const [fxId, params] = v.effect;
    const p = effectParams(fxId, params);
    // Effects with an amount / glow / colour strength follow the look's amount too.
    for (const key of ['amount', 'glow', 'color', 'texture']) if (key in p && a !== 1) p[key] = round(clamp(p[key] * a, 0, key === 'color' && p[key] <= 1 ? 1 : 100), 2);
    effects.push({ id: fxId, params: p });
  }
  const depth = mix('tiltShift', 0);
  const tilt = depth > 0 ? { position: 0.55, width: 0.22, blur: round(clamp(depth, 0, 100)), angle: 0, feather: 0.25 } : null;
  return { adjust, detail, fx, tone: {}, effects, tilt, lut: undefined, extra: [] };
}

/** Editor notation (0 = unchanged) → settings: every value scaled by the strength. */
function proSettings(v, a) {
  const s = (key, lo, hi) => round(clamp((v[key] ?? 0) * a, lo, hi));
  const adjust = {
    brightness: s('brightness', -100, 100), contrast: s('contrast', -100, 100),
    saturation: v.mono ? round(clamp(-100 * a, -100, 0)) : s('saturation', -100, 100),
    hue: s('hue', -180, 180), temperature: s('temperature', -100, 100), effect: 'none', effectAmount: 100,
  };
  if (v.sepia) { adjust.effect = 'sepia'; adjust.effectAmount = s('sepia', 0, 100); }
  const detail = { blur: round(clamp((v.blur ?? 0) * a, 0, 50), 1), sharpen: s('sharpen', 0, 200) };
  const fx = { vignette: s('vignette', -100, 100), grain: s('grain', 0, 100), emboss: false, edges: false };
  const tone = {};
  const extra = [];
  for (const key of ['highlights', 'shadows', 'whites', 'blacks', 'tint', 'vibrance']) if (key in v) { adjust[key] = s(key, -100, 100); extra.push(['adjust', key]); }
  if ('clarity' in v) { detail.clarity = s('clarity', 0, 100); extra.push(['detail', 'clarity']); }
  if ('dehaze' in v) { tone.dehaze = s('dehaze', -100, 100); extra.push(['tone', 'dehaze']); }
  if (v.split) {
    const [highlightHue, highlightSat, shadowHue, shadowSat, balance = 0] = v.split;
    tone.splitTone = { highlightHue, highlightSat: round(clamp(highlightSat * a, 0, 100)), shadowHue, shadowSat: round(clamp(shadowSat * a, 0, 100)), balance };
    extra.push(['tone', 'splitTone']);
  }
  let lut;
  if (v.lut) { lut = { id: v.lut[0], name: v.lut[0], amount: round(clamp(v.lut[1] * a, 0, 100)) }; extra.push(['lut', null]); }
  return { adjust, detail, fx, tone, effects: [], tilt: null, lut, extra };
}

/** Puts every field `look` (an id) owns back to neutral in `e` (in place). */
function resetOwned(e, look) {
  for (const [group, key] of LOOK_FIELDS) e[group][key] = DEFAULTS[group][key];
  e.effects = [];
  e.tilt = null;
  if (!look || !isLook(look)) return;
  for (const [group, key] of lookSettings(look, 100).extra) {
    if (group === 'lut') e.lut = null;
    else e[group][key] = group === 'tone' && key === 'splitTone' ? null : DEFAULTS[group][key];
  }
}

/**
 * `edit` with look `id` at `amount` %: the look's fields replaced, everything else kept.
 * `previous` (the look applied before, if any) has its own extra fields reset too.
 */
export function applyLook(edit, id, amount = 100, previous = null) {
  const e = normalizeEdit(JSON.parse(JSON.stringify(edit)));
  resetOwned(e, previous);
  const s = lookSettings(id, amount);
  Object.assign(e.adjust, s.adjust);
  Object.assign(e.detail, s.detail);
  Object.assign(e.fx, s.fx);
  Object.assign(e.tone, s.tone);
  e.effects = s.effects;
  e.tilt = s.tilt;
  if (s.extra.some(([group]) => group === 'lut')) e.lut = s.lut;
  return e;
}

/** `edit` with the look removed: every look field (and `look`'s own extra fields) back to neutral, other edits kept. */
export function clearLook(edit, look = null) {
  const e = normalizeEdit(JSON.parse(JSON.stringify(edit)));
  resetOwned(e, look);
  return e;
}

/** Which fields `id` actually changes (for its fine-tuning sliders): ['adjust.contrast', 'tone.splitTone', 'lut', …]. */
export function lookTouches(id) {
  const s = lookSettings(id, 100);
  const out = [];
  for (const [group, key] of LOOK_FIELDS) {
    if (key === 'effectAmount' ? s.adjust.effect !== 'none' : s[group][key] !== DEFAULTS[group][key]) out.push(`${group}.${key}`);
  }
  for (const field of s.extra) out.push(fieldName(field));
  return out;
}

// ───────────────────────── this editor's own looks (editor values: 0 = unchanged; vignette < 0 darkens;
// split = [highlight hue, highlight saturation, shadow hue, shadow saturation, balance]; lut = [built-in id, amount])

export const PRO_CATEGORIES = Object.freeze([
  { key: 'catPortrait', ids: ['skinGlow', 'softPortrait', 'warmPortrait', 'coolPortrait', 'studioClean', 'goldenSkin', 'mattePortrait', 'bwPortrait', 'highKeyPortrait', 'editorial'] },
  { key: 'catLandscape', ids: ['landVivid', 'blueSky', 'lushGreen', 'clearHaze', 'seaside', 'autumnLeaves', 'desertHeat', 'stormy', 'sunrise', 'nightSky'] },
  { key: 'catCity', ids: ['urbanGrit', 'neonNight', 'cityTealOrange', 'moodyStreet', 'streetBW', 'rainyCity', 'tokyoNight', 'industrial'] },
  { key: 'catFood', ids: ['foodWarm', 'foodFresh', 'productClean', 'cafe', 'dessert', 'rustic'] },
  { key: 'catGrade', ids: ['blockbuster', 'warmFilmLut', 'coolFadeLut', 'punchLut', 'bleachTeal', 'sepiaSplit', 'mintCream', 'roseGold', 'emerald', 'magentaDream', 'cineGreen', 'nordic'] },
  { key: 'catBWPro', ids: ['bwSoft', 'bwHigh', 'bwSelenium', 'bwWarmTone', 'bwMatte', 'bwClarity', 'bwFilmLut', 'bwLowKey'] },
]);

export const PRO_LOOKS = Object.freeze({
  // Portrait: gentle contrast, warm skin, little clarity (no harsh texture).
  skinGlow: { brightness: 6, contrast: -6, highlights: -15, shadows: 15, temperature: 8, vibrance: 12, saturation: -6, clarity: 0, blur: 1.2, vignette: -12 },
  softPortrait: { contrast: -14, highlights: -20, shadows: 20, blacks: 10, vibrance: 8, saturation: -10, temperature: 5, vignette: -10 },
  warmPortrait: { temperature: 22, tint: 4, vibrance: 15, highlights: -10, shadows: 12, contrast: 6, split: [40, 18, 25, 10] },
  coolPortrait: { temperature: -14, tint: -3, vibrance: 6, saturation: -8, highlights: -12, shadows: 10, split: [200, 8, 220, 14] },
  studioClean: { contrast: 10, whites: 12, blacks: -6, vibrance: 6, sharpen: 25, clarity: 8 },
  goldenSkin: { temperature: 30, tint: 6, vibrance: 18, saturation: 4, highlights: -15, shadows: 10, split: [45, 25, 30, 12], vignette: -15 },
  mattePortrait: { contrast: -10, blacks: 25, highlights: -10, saturation: -15, temperature: 6, split: [40, 10, 210, 10], grain: 10 },
  bwPortrait: { mono: true, contrast: 12, highlights: -15, shadows: 15, clarity: 5, vignette: -20, grain: 8 },
  highKeyPortrait: { brightness: 18, contrast: -12, highlights: -5, shadows: 30, whites: 15, saturation: -12, vibrance: 6 },
  editorial: { contrast: 18, highlights: -25, shadows: 18, blacks: -10, saturation: -18, vibrance: 10, clarity: 12, split: [35, 12, 200, 16] },
  // Landscape: depth, haze removal, rich but not neon colour.
  landVivid: { vibrance: 35, saturation: 10, contrast: 14, clarity: 25, dehaze: 15, highlights: -20, shadows: 15, sharpen: 30 },
  blueSky: { vibrance: 25, temperature: -8, highlights: -35, dehaze: 20, contrast: 10, clarity: 15 },
  lushGreen: { vibrance: 30, hue: -6, tint: -10, contrast: 12, shadows: 15, clarity: 18 },
  clearHaze: { dehaze: 45, contrast: 10, vibrance: 15, highlights: -15, clarity: 20 },
  seaside: { temperature: -10, vibrance: 28, highlights: -25, whites: 10, dehaze: 12, split: [50, 10, 195, 18] },
  autumnLeaves: { temperature: 25, vibrance: 30, saturation: 8, hue: 6, contrast: 14, clarity: 15, split: [35, 20, 20, 10] },
  desertHeat: { temperature: 35, tint: 6, saturation: -10, contrast: 16, highlights: -20, dehaze: 10, split: [40, 22, 25, 18], vignette: -18 },
  stormy: { temperature: -18, saturation: -30, contrast: 28, highlights: -40, shadows: 10, clarity: 35, dehaze: 25, vignette: -30 },
  sunrise: { temperature: 28, tint: 10, vibrance: 25, highlights: -30, shadows: 20, split: [30, 30, 260, 15], vignette: -12 },
  nightSky: { temperature: -22, tint: 5, contrast: 18, blacks: -15, highlights: -10, clarity: 20, dehaze: 20, vibrance: 15, sharpen: 20 },
  // City and night.
  urbanGrit: { contrast: 25, saturation: -35, clarity: 45, blacks: -15, highlights: -20, sharpen: 35, grain: 15, vignette: -25 },
  neonNight: { vibrance: 40, saturation: 15, contrast: 18, blacks: -20, temperature: -10, tint: 15, clarity: 15, split: [320, 20, 220, 30] },
  cityTealOrange: { lut: ['teal-orange', 85], contrast: 12, vibrance: 10, clarity: 15 },
  moodyStreet: { contrast: 15, saturation: -25, highlights: -30, shadows: -10, blacks: -12, temperature: -6, split: [40, 8, 210, 20], vignette: -35, grain: 12 },
  streetBW: { mono: true, contrast: 30, clarity: 35, blacks: -18, grain: 22, vignette: -25, sharpen: 25 },
  rainyCity: { temperature: -15, saturation: -25, contrast: 8, highlights: -20, shadows: 12, dehaze: -10, split: [200, 8, 210, 20], grain: 10 },
  tokyoNight: { tint: 18, temperature: -15, vibrance: 30, contrast: 14, blacks: -15, split: [300, 22, 190, 28] },
  industrial: { saturation: -45, contrast: 22, clarity: 40, temperature: -8, tint: -5, split: [45, 12, 200, 15], vignette: -20, grain: 18 },
  // Food and products: appetising warmth, clean whites.
  foodWarm: { temperature: 18, vibrance: 25, contrast: 10, shadows: 15, clarity: 10, highlights: -10, vignette: -10 },
  foodFresh: { vibrance: 30, saturation: 8, brightness: 8, contrast: 8, whites: 10, clarity: 12, sharpen: 25 },
  productClean: { whites: 22, blacks: -8, contrast: 12, saturation: -6, clarity: 15, sharpen: 35, temperature: -4 },
  cafe: { temperature: 22, tint: 5, saturation: -12, contrast: -6, blacks: 18, split: [40, 18, 30, 12], grain: 12, vignette: -18 },
  dessert: { brightness: 12, temperature: 10, tint: 8, vibrance: 20, contrast: -8, highlights: -10, split: [340, 12, 30, 8] },
  rustic: { temperature: 20, saturation: -20, contrast: 18, clarity: 25, blacks: -10, split: [38, 20, 25, 15], vignette: -30, grain: 15 },
  // Colour grading: split toning and the built-in LUTs.
  blockbuster: { lut: ['teal-orange', 100], contrast: 18, blacks: -10, vibrance: 8, vignette: -20 },
  warmFilmLut: { lut: ['warm-film', 100], grain: 15, vignette: -15 },
  coolFadeLut: { lut: ['cool-fade', 100], contrast: -6, grain: 10 },
  punchLut: { lut: ['high-contrast', 80], vibrance: 20, clarity: 10 },
  bleachTeal: { saturation: -40, contrast: 30, clarity: 20, split: [45, 10, 185, 35, -20], vignette: -20 },
  sepiaSplit: { saturation: -60, split: [38, 40, 28, 30], contrast: 8, grain: 15, vignette: -15 },
  mintCream: { temperature: -4, tint: -10, contrast: -10, blacks: 15, saturation: -10, split: [60, 15, 160, 20] },
  roseGold: { temperature: 12, tint: 12, vibrance: 10, contrast: -5, split: [20, 25, 330, 15], highlights: -10 },
  emerald: { tint: -15, hue: -8, saturation: 6, contrast: 14, split: [80, 12, 150, 28], vignette: -18 },
  magentaDream: { tint: 25, temperature: 4, saturation: -6, contrast: -8, blacks: 12, split: [320, 25, 270, 22], blur: 1 },
  cineGreen: { tint: -12, saturation: -15, contrast: 16, blacks: -8, split: [55, 15, 140, 25], grain: 12, vignette: -22 },
  nordic: { temperature: -18, saturation: -28, contrast: -8, highlights: -15, blacks: 20, split: [200, 10, 215, 18] },
  // Black and white, the editor's way: tone-range control, split-toned paper, film LUT.
  bwSoft: { mono: true, contrast: -12, highlights: -20, shadows: 20, blacks: 10 },
  bwHigh: { mono: true, contrast: 40, whites: 15, blacks: -20, clarity: 20 },
  bwSelenium: { mono: true, contrast: 18, split: [210, 10, 230, 22], vignette: -15 },
  bwWarmTone: { mono: true, contrast: 10, split: [40, 22, 30, 15], grain: 12 },
  bwMatte: { mono: true, contrast: -8, blacks: 30, highlights: -15, grain: 18 },
  bwClarity: { mono: true, contrast: 20, clarity: 60, dehaze: 15, sharpen: 30, vignette: -20 },
  bwFilmLut: { lut: ['mono-film', 100], contrast: 8, grain: 25, vignette: -15 },
  bwLowKey: { mono: true, brightness: -20, contrast: 35, shadows: -20, blacks: -25, vignette: -45 },
});

// ───────────────────────── data (from ImageViewer V20, src/js/editor.js PRESETS and app.js PRESET_CATS)

export const LOOK_CATEGORIES = Object.freeze([
  { key: 'catFilmColor', ids: ['filmcamera', 'disposable', 'portra', 'ektar', 'fuji400h', 'superia', 'lomochrome'] },
  { key: 'catSlide', ids: ['kodachrome', 'velvia', 'provia', 'slide'] },
  { key: 'catBW', ids: ['silver', 'noir', 'trix', 'delta3200', 'tmax100', 'newspaper', 'charcoal', 'ink', 'selenium', 'platinum', 'lith', 'silhouette', 'steel', 'sketch'] },
  { key: 'catInstant', ids: ['vintage', 'polaroid', 'sx70', 'instax', 'holga', 'lomo', 'sprocket'] },
  { key: 'catCinema', ids: ['cinestill', 'vision3500t', 'tealorange', 'dayfornight', 'horror'] },
  { key: 'catProcess', ids: ['expired', 'expiredcool', 'redscale', 'crossprocess', 'crossfuji', 'bleachbypass', 'nightflash', 'halfFrame', 'doubleExp', 'dramatic', 'glitch', 'push', 'pull'] },
  { key: 'catWarm', ids: ['warm', 'golden', 'sunset', 'autumn', 'dusk', 'tungsten', 'retro70', 'desert', 'candy', 'summer', 'peach', 'coral', 'copper', 'amber', 'romance', 'midcentury'] },
  { key: 'catCool', ids: ['cool', 'arctic', 'moonlight', 'fog', 'spring', 'fluorescent', 'retro80', 'underwater', 'forest', 'lavender', 'midnight', 'winter', 'rainy', 'denim', 'amethyst', 'gothic', 'cyberpunk', 'vaporwave'] },
  { key: 'catBasic', ids: ['grayscale', 'sepia', 'invert', 'vivid', 'pop', 'fade', 'pastel', 'matte', 'soft', 'crisp', 'clarity', 'bleach', 'highkey', 'lowkey', 'muted', 'flat', 'bloom', 'punch', 'documentary'] },
  { key: 'catCreative', ids: ['neon', 'chrome', 'hdr', 'infrared', 'nightvision', 'thermal', 'dream', 'orton', 'cyanotype', 'watercolor', 'anime', 'comic', 'xray', 'emboss', 'edge', 'duotone', 'blueprint', 'miniature'] },
]);

export const LOOKS = Object.freeze({
  grayscale: { grayscale: 100 },
  sepia: { sepia: 100, saturation: 55 },
  invert: { invert: 100 },
  vivid: { saturation: 168, contrast: 118, sharpen: 12 },
  fade: { brightness: 125, saturation: 45, contrast: 78, warmth: -8 },
  cool: { hue: -28, warmth: -35, saturation: 88 },
  warm: { warmth: 72, saturation: 118, hue: 8 },
  vintage: { sepia: 48, saturation: 62, contrast: 88, vignette: 55, grain: 28 },
  dramatic: { contrast: 160, grayscale: 35, vignette: 48, brightness: 92 },
  emboss: { emboss: true, grayscale: 100 },
  edge: { edge: true, grayscale: 100, contrast: 140 },
  noir: { grayscale: 100, contrast: 155, brightness: 82, vignette: 62 },
  soft: { blur: 2, brightness: 115, contrast: 88, saturation: 80 },
  crisp: { sharpen: 52, contrast: 132, saturation: 122, brightness: 104, vignette: 0 },
  sunset: { warmth: 92, hue: 20, saturation: 125, contrast: 108, vignette: 35, brightness: 95, sepia: 10 },
  arctic: { hue: -48, warmth: -62, saturation: 70, brightness: 118, contrast: 108 },
  pastel: { brightness: 122, contrast: 72, saturation: 78, warmth: 28, hue: 12, blur: 0.4 },
  matte: { brightness: 108, contrast: 70, saturation: 72, vignette: 28, warmth: -6 },
  neon: { saturation: 190, contrast: 132, hue: 48, sharpen: 28, brightness: 96 },
  moonlight: { hue: -58, warmth: -30, saturation: 42, brightness: 92, contrast: 118, vignette: 38, blur: 0.5 },
  golden: { warmth: 88, saturation: 140, brightness: 118, contrast: 112, hue: 8, sharpen: 14 },
  bleach: { brightness: 142, saturation: 18, contrast: 92 },
  pop: { saturation: 162, contrast: 142, sharpen: 38, brightness: 108, warmth: 5 },
  crossprocess: { hue: 22, saturation: 148, contrast: 132, warmth: -35, vignette: 16 },
  documentary: { saturation: 48, contrast: 125, brightness: 96, vignette: 22, grain: 20, warmth: -12 },
  highkey: { brightness: 155, contrast: 68, saturation: 85, warmth: 10 },
  lowkey: { brightness: 58, contrast: 148, saturation: 70, vignette: 68 },
  silver: { grayscale: 100, contrast: 112, brightness: 110, sharpen: 6 },
  polaroid: { sepia: 28, brightness: 118, contrast: 85, saturation: 70, vignette: 40, warmth: 20 },
  lomo: { saturation: 148, contrast: 135, vignette: 78, warmth: 32, hue: 6 },
  filmcamera: { warmth: 40, sepia: 16, contrast: 92, brightness: 106, saturation: 90, hue: 6, vignette: 34, grain: 42, sharpen: 10 },
  disposable: { brightness: 118, contrast: 108, saturation: 85, warmth: 22, hue: 8, vignette: 48, grain: 55, sharpen: 6 },
  portra: { warmth: 30, saturation: 96, contrast: 88, brightness: 108, hue: 4, grain: 22, vignette: 16 },
  ektar: { saturation: 155, contrast: 128, warmth: 18, hue: -6, sharpen: 28, brightness: 104, vignette: 8, grain: 14 },
  fuji400h: { warmth: 12, hue: -8, saturation: 90, contrast: 86, brightness: 112, grain: 20, vignette: 12 },
  superia: { warmth: 28, hue: 4, saturation: 125, contrast: 112, brightness: 106, grain: 30, vignette: 14 },
  lomochrome: { hue: 18, saturation: 158, contrast: 122, warmth: 40, vignette: 55, grain: 38, brightness: 100 },
  kodachrome: { saturation: 145, contrast: 128, warmth: 28, hue: 8, sharpen: 22, vignette: 16 },
  velvia: { saturation: 178, contrast: 145, warmth: 6, hue: -14, sharpen: 34, vignette: 10, brightness: 108 },
  provia: { saturation: 128, contrast: 118, warmth: -4, hue: -10, sharpen: 24, brightness: 106, vignette: 8, grain: 8 },
  slide: { saturation: 145, contrast: 148, brightness: 88, warmth: -5, sharpen: 34, vignette: 4, hue: -16 },
  trix: { grayscale: 100, contrast: 138, brightness: 98, grain: 64, vignette: 28, sharpen: 18 },
  delta3200: { grayscale: 100, contrast: 135, brightness: 94, grain: 92, vignette: 32, sharpen: 8, blur: 0.3 },
  tmax100: { grayscale: 100, contrast: 122, brightness: 106, grain: 14, vignette: 8, sharpen: 26 },
  sx70: { warmth: 45, sepia: 22, saturation: 78, contrast: 82, brightness: 116, vignette: 48, grain: 28, hue: 8, blur: 0.4 },
  instax: { warmth: 28, saturation: 112, contrast: 95, brightness: 118, vignette: 35, grain: 16, hue: 4 },
  sprocket: { saturation: 135, contrast: 118, warmth: 25, vignette: 62, grain: 40, hue: 12, brightness: 108, blur: 0.5 },
  holga: { contrast: 122, saturation: 78, brightness: 112, vignette: 80, grain: 42, blur: 0.8, warmth: 22 },
  cinestill: { warmth: 58, saturation: 118, contrast: 110, brightness: 102, blur: 0.7, grain: 26, vignette: 18, hue: 8 },
  vision3500t: { warmth: -8, hue: -22, saturation: 108, contrast: 122, brightness: 98, grain: 28, vignette: 16 },
  expired: { hue: 22, saturation: 68, contrast: 76, brightness: 114, warmth: 18, grain: 52, vignette: 24, sepia: 12 },
  expiredcool: { hue: -28, saturation: 55, contrast: 72, brightness: 118, warmth: -25, grain: 58, vignette: 28 },
  redscale: { hue: 42, warmth: 100, saturation: 145, contrast: 125, brightness: 88, vignette: 38, sepia: 20 },
  bleachbypass: { saturation: 35, contrast: 155, brightness: 92, grayscale: 25, vignette: 30, sharpen: 24, grain: 20 },
  crossfuji: { hue: -35, saturation: 155, contrast: 138, warmth: 25, vignette: 20, grain: 18 },
  nightflash: { brightness: 88, contrast: 135, saturation: 95, warmth: 55, vignette: 58, grain: 40, hue: 12, sharpen: 10 },
  halfFrame: { contrast: 118, saturation: 105, warmth: 20, vignette: 45, grain: 38, brightness: 104, hue: 6, sepia: 6 },
  doubleExp: { brightness: 128, contrast: 70, saturation: 85, blur: 1.6, warmth: 25, vignette: 30, hue: 8, grain: 22 },
  autumn: { warmth: 78, hue: 28, saturation: 118, contrast: 115, brightness: 96, vignette: 18 },
  spring: { hue: -22, saturation: 132, brightness: 116, contrast: 90, warmth: -18 },
  dusk: { hue: -10, warmth: 55, saturation: 78, brightness: 72, contrast: 128, vignette: 48 },
  fog: { brightness: 132, contrast: 52, saturation: 40, blur: 1.8, warmth: -18 },
  dream: { blur: 3, brightness: 124, contrast: 74, saturation: 70, warmth: 30, vignette: 28, hue: 8 },
  hdr: { contrast: 175, saturation: 155, sharpen: 60, brightness: 110, vignette: 4 },
  infrared: { hue: -82, saturation: 145, brightness: 122, contrast: 112, grayscale: 12 },
  nightvision: { hue: -72, grayscale: 38, saturation: 165, brightness: 96, contrast: 132, grain: 22 },
  newspaper: { grayscale: 100, contrast: 142, grain: 48, sharpen: 32, brightness: 110 },
  sketch: { edge: true, grayscale: 100, invert: 100, contrast: 118 },
  retro70: { sepia: 32, hue: 12, saturation: 82, contrast: 94, warmth: 42, vignette: 32, grain: 28 },
  retro80: { saturation: 168, contrast: 118, hue: -42, warmth: -28, vignette: 12, sharpen: 10 },
  tungsten: { warmth: 98, hue: 18, saturation: 92, brightness: 96, contrast: 112, sepia: 12 },
  fluorescent: { hue: -38, warmth: -48, saturation: 120, contrast: 118, brightness: 108 },
  chrome: { saturation: 118, contrast: 155, sharpen: 48, brightness: 98, vignette: 4, hue: -10, grayscale: 12 },
  orton: { blur: 3.4, brightness: 132, contrast: 76, saturation: 120, warmth: 22, hue: 6 },
  comic: { posterize: 4, saturation: 155, contrast: 142, sharpen: 18 },
  xray: { invert: 100, grayscale: 85, contrast: 122, hue: -48, brightness: 108 },
  clarity: { sharpen: 78, contrast: 105, saturation: 98, brightness: 102 },
  cyanotype: { grayscale: 70, hue: -50, warmth: -60, contrast: 115, saturation: 80 },
  tealorange: { hue: -18, warmth: 48, saturation: 145, contrast: 125, brightness: 100 },
  underwater: { hue: -55, warmth: -68, saturation: 88, brightness: 82, contrast: 122, blur: 0.8 },
  desert: { warmth: 88, hue: 26, saturation: 58, contrast: 112, brightness: 118, vignette: 26, grain: 12 },
  forest: { hue: -32, warmth: -22, saturation: 128, contrast: 128, brightness: 90, vignette: 22 },
  lavender: { hue: -72, warmth: 5, saturation: 95, brightness: 120, contrast: 80, blur: 0.8, vignette: 12 },
  candy: { hue: 48, saturation: 168, brightness: 122, contrast: 88, warmth: 35 },
  midnight: { hue: -62, warmth: -55, brightness: 52, contrast: 148, saturation: 58, vignette: 70 },
  thermal: { posterize: 5, hue: 48, saturation: 170, contrast: 135, brightness: 105 },
  blueprint: { grayscale: 100, hue: -70, warmth: -80, contrast: 132, brightness: 98, invert: 0 },
  selenium: { grayscale: 100, hue: -32, warmth: -40, contrast: 128, brightness: 98, vignette: 20, saturation: 35 },
  platinum: { grayscale: 100, brightness: 125, contrast: 78, vignette: 4, sharpen: 2, warmth: 12 },
  lith: { grayscale: 100, contrast: 175, brightness: 92, grain: 58, vignette: 35, sharpen: 28 },
  muted: { saturation: 32, contrast: 92, brightness: 102, warmth: -15, vignette: 14, hue: -6 },
  cyberpunk: { hue: -55, saturation: 168, contrast: 145, brightness: 96, warmth: -30, vignette: 28, sharpen: 22 },
  vaporwave: { hue: -78, saturation: 158, contrast: 105, brightness: 118, warmth: -8, vignette: 16 },
  charcoal: { grayscale: 100, contrast: 105, brightness: 94, grain: 80, blur: 0.6, vignette: 24 },
  ink: { grayscale: 100, contrast: 168, brightness: 82, vignette: 35, sharpen: 48 },
  dayfornight: { hue: -35, warmth: -65, brightness: 60, contrast: 138, saturation: 78, vignette: 45, grain: 14 },
  bloom: { blur: 1.2, brightness: 138, contrast: 88, saturation: 95, warmth: 12, vignette: 6 },
  punch: { contrast: 152, saturation: 170, sharpen: 12, brightness: 106, warmth: 20, hue: 10 },
  flat: { contrast: 55, saturation: 100, brightness: 110, vignette: 0, warmth: 0 },
  winter: { hue: -22, warmth: -50, brightness: 115, contrast: 118, saturation: 62, sharpen: 20, vignette: 12 },
  summer: { warmth: 32, hue: 2, saturation: 145, brightness: 120, contrast: 102 },
  rainy: { hue: -22, warmth: -28, saturation: 58, contrast: 95, brightness: 98, blur: 0.6, grain: 18 },
  peach: { warmth: 62, hue: 22, saturation: 88, brightness: 120, contrast: 82 },
  coral: { hue: 36, warmth: 55, saturation: 155, contrast: 118, brightness: 110, vignette: 10 },
  amethyst: { hue: -70, saturation: 130, contrast: 115, brightness: 105, warmth: -10 },
  copper: { warmth: 70, hue: 8, saturation: 95, contrast: 132, brightness: 92, vignette: 28, sepia: 18, grain: 16 },
  denim: { hue: -45, warmth: -42, saturation: 55, contrast: 125, brightness: 96, vignette: 16 },
  gothic: { brightness: 68, contrast: 145, saturation: 45, vignette: 65, hue: -8, warmth: -15 },
  romance: { warmth: 40, hue: 10, saturation: 100, brightness: 122, contrast: 78, blur: 1.4, vignette: 24, sepia: 8 },
  duotone: { grayscale: 55, hue: -85, saturation: 140, contrast: 128, brightness: 102 },
  glitch: { posterize: 3, hue: 55, saturation: 160, contrast: 150, invert: 15, sharpen: 20 },
  watercolor: { blur: 2.2, contrast: 68, saturation: 92, brightness: 118, warmth: 25, vignette: 20, hue: 14, grain: 10 },
  anime: { saturation: 160, contrast: 108, brightness: 120, sharpen: 35, warmth: 0, hue: -8 },
  silhouette: { brightness: 48, contrast: 170, saturation: 30, vignette: 70 },
  amber: { warmth: 118, hue: 36, saturation: 108, contrast: 100, brightness: 108, vignette: 14, sepia: 22 },
  steel: { grayscale: 70, hue: -25, warmth: -40, contrast: 130, saturation: 40, sharpen: 30 },
  push: { contrast: 152, saturation: 132, grain: 48, brightness: 90, vignette: 28 },
  pull: { contrast: 88, saturation: 68, brightness: 118, grain: 10, warmth: 12, blur: 0.3 },
  midcentury: { sepia: 34, warmth: 45, saturation: 60, contrast: 98, brightness: 112, vignette: 36 },
  horror: { hue: -15, warmth: -20, brightness: 78, contrast: 155, saturation: 50, vignette: 55, grain: 30 },
  miniature: { tiltShift: 48, saturation: 142, contrast: 130, brightness: 108, warmth: 24, hue: 4, sharpen: 32, vignette: 22 },
});
