// The editor's rendering. Stages, in order:
//   1. repairs at source size (red-eye, healing, clone stamp)
//   2. colour and tone (exposure … curves, Color EQ, Light EQ, split toning,
//      dehaze, skin smoothing)
//   3. local adjustments (graduated, radial and brush masks)
//   4. lens correction and perspective
//   5. geometry (rotate, flip, straighten, crop, resize)
//   6. detail (sharpen, clarity, noise, blur) and effects (vignette, grain,
//      special effects stack, tilt-shift)
//   7. canvas size, border, layers (images with blend modes), drawings, text
// The same code draws the live preview (a smaller copy, `scale` < 1) and the
// full-size result that is saved; everything positional is stored in original
// pixels or as fractions, so both look the same.
import { context2d, makeCanvas } from '../formats/canvas.js';
import { applyAdjustments, clarity, convolve, DEFAULT_ADJUST, denoise, EDGES, EMBOSS, gaussianBlur, grain, heal, isNeutral, pixelate, redEye, unsharpMask, vignette } from './adjust.js';
import { applyEffect, applyMasked, blendLayer, brushMask, cloneStamp, colorEq, dehaze, gradientMask, lensCorrect, lightEq, perspective, radialMask, skinSmooth, splitTone, tiltShift } from './advanced.js';
import { DEFAULT_GEOMETRY, layout } from './geometry.js';

export const DEFAULT_DETAIL = Object.freeze({ sharpen: 0, sharpenRadius: 1, clarity: 0, denoise: 0, blur: 0 });
export const DEFAULT_FX = Object.freeze({ vignette: 0, vignetteMidpoint: 50, grain: 0, emboss: false, edges: false, pixelate: 0 });
export const DEFAULT_OVERLAY = Object.freeze({ border: 0, borderColor: '#ffffff', texts: [] });
export const DEFAULT_TONE = Object.freeze({ colorEq: null, lightEq: null, splitTone: null, dehaze: 0, skin: 0 });
export const DEFAULT_LENS = Object.freeze({ distortion: 0, chromatic: 0, vignette: 0, vertical: 0, horizontal: 0, rotate: 0 });
export const DEFAULT_CANVAS = Object.freeze({ width: 0, height: 0, color: '#ffffff', anchor: 'center' });

export function defaultEdit() {
  return {
    adjust: { ...DEFAULT_ADJUST },
    tone: { ...DEFAULT_TONE },
    lens: { ...DEFAULT_LENS },
    geometry: { ...DEFAULT_GEOMETRY },
    detail: { ...DEFAULT_DETAIL },
    fx: { ...DEFAULT_FX },
    effects: [], // [{ id, params }] — special effects, applied in order
    tilt: null, // { position, width, blur, angle, feather }
    spots: [], // red-eye / heal / clone, in original pixels
    local: [], // [{ kind: 'gradient' | 'radial' | 'brush', shape: {…}, adjust: {…}, detail: { sharpen, blur } }]
    canvas: { ...DEFAULT_CANVAS },
    overlay: { ...DEFAULT_OVERLAY, texts: [] },
    layers: [], // [{ path, name, mode, opacity, x, y, scale, visible }]
    drawings: [], // [{ type, points: [[x, y] fractions], color, width (% of short side), fill }]
  };
}

/** Fills in fields an older saved edit or preset did not have. */
export function normalizeEdit(edit) {
  const base = defaultEdit();
  const out = { ...base, ...(edit ?? {}) };
  for (const key of ['adjust', 'tone', 'lens', 'geometry', 'detail', 'fx', 'canvas', 'overlay']) out[key] = { ...base[key], ...(edit?.[key] ?? {}) };
  for (const key of ['effects', 'spots', 'local', 'layers', 'drawings']) out[key] = Array.isArray(edit?.[key]) ? edit[key] : [];
  if (!Array.isArray(out.overlay.texts)) out.overlay.texts = [];
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const toneIsNeutral = (tone) => !tone || (!tone.colorEq && !tone.lightEq?.some((v) => v) && !(tone.splitTone && (tone.splitTone.highlightSat || tone.splitTone.shadowSat)) && !tone.dehaze && !tone.skin);
const lensIsNeutral = (lens) => !lens || Object.keys(DEFAULT_LENS).every((key) => !lens[key]);

/** True when the edit changes nothing. */
export function isEmptyEdit(edit) {
  const e = normalizeEdit(edit);
  const base = defaultEdit();
  return isNeutral(e.adjust) && toneIsNeutral(e.tone) && lensIsNeutral(e.lens) && same(e.geometry, base.geometry) && same(e.detail, base.detail)
    && same(e.fx, base.fx) && !e.effects.length && !e.tilt && !e.spots.length && !e.local.length && !e.canvas.width && !e.canvas.height
    && !e.overlay.border && !e.overlay.texts.length && !e.layers.length && !e.drawings.length;
}

/** The parts a preset carries (no crop, spots, layers or text — those belong to one photo). */
export function presetOf(edit) {
  const e = normalizeEdit(edit);
  return { adjust: e.adjust, tone: e.tone, lens: e.lens, detail: e.detail, fx: e.fx, effects: e.effects, tilt: e.tilt, overlay: { border: e.overlay.border, borderColor: e.overlay.borderColor, texts: e.overlay.texts } };
}

/** `edit` with a preset applied on top. */
export function applyPreset(edit, preset) {
  const e = normalizeEdit(edit);
  return normalizeEdit({ ...e, ...JSON.parse(JSON.stringify(preset)), geometry: e.geometry, spots: e.spots, local: e.local, layers: e.layers, drawings: e.drawings, canvas: e.canvas });
}

const getPixels = (canvas) => context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
const putPixels = (canvas, image) => context2d(canvas).putImageData(image instanceof ImageData ? image : new ImageData(image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

function maskFor(local, width, height, scale) {
  const s = local.shape ?? {};
  if (local.kind === 'gradient') return gradientMask(width, height, { x1: s.x1 * scale, y1: s.y1 * scale, x2: s.x2 * scale, y2: s.y2 * scale });
  if (local.kind === 'radial') return radialMask(width, height, { cx: s.cx * scale, cy: s.cy * scale, rx: s.rx * scale, ry: s.ry * scale, angle: s.angle ?? 0, feather: s.feather ?? 50, invert: Boolean(s.invert) });
  return brushMask(width, height, (s.strokes ?? []).map((stroke) => ({ ...stroke, radius: stroke.radius * scale, points: stroke.points.map(([x, y]) => [x * scale, y * scale]) })));
}

/**
 * Renders `edit` for `source` (an upright canvas / ImageBitmap). `scale` is the
 * size of the source relative to the original photo. `skipCrop` shows the whole
 * picture (crop tool), `skipOverlay` leaves out border, layers, drawings and text.
 * `layerImages`: Map(path → canvas) of the image layers (loaded beforehand).
 */
export function render(source, edit, { scale = 1, skipCrop = false, skipOverlay = false, layerImages = null } = {}) {
  const e = normalizeEdit(edit);
  const sw = source.width;
  const sh = source.height;
  const k = Math.max(0.05, scale);

  // 1–3. Repairs, colour, local adjustments at source size.
  let stage = makeCanvas(sw, sh);
  context2d(stage).drawImage(source, 0, 0, sw, sh);
  const colour = !isNeutral(e.adjust);
  if (e.spots.length || colour || !toneIsNeutral(e.tone) || e.local.length) {
    let pixels = getPixels(stage);
    for (const spot of e.spots) {
      const x = spot.x * scale;
      const y = spot.y * scale;
      const r = Math.max(1, spot.r * scale);
      if (spot.type === 'redeye') redEye(pixels, x, y, r);
      if (spot.type === 'heal') heal(pixels, x, y, r, spot.sx != null ? { x: spot.sx * scale, y: spot.sy * scale } : null);
      if (spot.type === 'clone') cloneStamp(pixels, { x, y, sx: spot.sx * scale, sy: spot.sy * scale, radius: r, hardness: spot.hardness ?? 0.6, opacity: spot.opacity ?? 1 });
    }
    if (colour) applyAdjustments(pixels, e.adjust);
    const tone = e.tone;
    if (tone.colorEq) colorEq(pixels, tone.colorEq);
    if (tone.lightEq?.some((v) => v)) lightEq(pixels, tone.lightEq);
    if (tone.splitTone && (tone.splitTone.highlightSat || tone.splitTone.shadowSat)) splitTone(pixels, tone.splitTone);
    if (tone.dehaze) dehaze(pixels, tone.dehaze);
    if (tone.skin) skinSmooth(pixels, tone.skin);
    for (const local of e.local) {
      const mask = maskFor(local, sw, sh, scale);
      pixels = applyMasked(pixels, mask, (copy) => {
        if (local.adjust && !isNeutral({ ...DEFAULT_ADJUST, ...local.adjust })) applyAdjustments(copy, local.adjust);
        if (local.detail?.blur) gaussianBlur(copy, local.detail.blur * 0.3 * k);
        if (local.detail?.sharpen) unsharpMask(copy, { amount: local.detail.sharpen, radius: Math.max(0.5, k), threshold: 2 });
        return copy;
      }) ?? pixels;
    }
    putPixels(stage, pixels);
  }

  // 4. Lens and perspective.
  if (!lensIsNeutral(e.lens)) {
    let pixels = getPixels(stage);
    const { distortion, chromatic, vignette: lensVignette, vertical, horizontal, rotate } = e.lens;
    if (distortion || chromatic || lensVignette) pixels = lensCorrect(pixels, { distortion, chromatic, vignette: lensVignette });
    if (vertical || horizontal || rotate) pixels = perspective(pixels, { vertical, horizontal, rotate, autoCrop: true });
    putPixels(stage, pixels);
  }

  // 5. Geometry.
  const plan = layout(sw, sh, e.geometry, { skipCrop, sourceScale: scale });
  const m = plan.matrix;
  const identity = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0 && plan.width === sw && plan.height === sh;
  if (!identity) {
    const next = makeCanvas(plan.width, plan.height);
    const context = context2d(next);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    context.drawImage(stage, 0, 0);
    stage = next;
  }

  // 6. Detail and effects on the output pixels.
  const d = e.detail;
  const fx = e.fx;
  const pixelWork = d.sharpen || d.clarity || d.denoise || d.blur || fx.vignette || fx.grain || fx.emboss || fx.edges || fx.pixelate || e.effects.length || e.tilt;
  if (pixelWork) {
    const pixels = getPixels(stage);
    if (d.denoise) denoise(pixels, d.denoise, k);
    if (d.blur) gaussianBlur(pixels, d.blur * 0.3 * k);
    if (d.clarity) clarity(pixels, d.clarity, k);
    if (d.sharpen) unsharpMask(pixels, { amount: d.sharpen, radius: Math.max(0.5, d.sharpenRadius * k), threshold: 2 });
    if (fx.emboss) convolve(pixels, EMBOSS, 0);
    if (fx.edges) convolve(pixels, EDGES, 0);
    if (fx.pixelate) pixelate(pixels, Math.max(2, (fx.pixelate / 100) * Math.min(pixels.width, pixels.height) * 0.05));
    let current = pixels;
    for (const effect of e.effects) {
      const result = applyEffect(current, effect.id, effect.params ?? {}, k);
      if (result && result.data) current = result;
    }
    if (e.tilt) tiltShift(current, e.tilt);
    if (fx.vignette) vignette(current, fx.vignette, fx.vignetteMidpoint);
    if (fx.grain) grain(current, fx.grain, 7);
    if (current.width !== stage.width || current.height !== stage.height) stage = makeCanvas(current.width, current.height);
    putPixels(stage, current);
  }

  if (skipOverlay || skipCrop) return stage;

  // 7. Canvas size, border, layers, drawings, text.
  if (e.canvas.width || e.canvas.height) {
    const cw = Math.max(stage.width, Math.round((e.canvas.width || 0) * scale) || stage.width);
    const ch = Math.max(stage.height, Math.round((e.canvas.height || 0) * scale) || stage.height);
    const expanded = makeCanvas(cw, ch);
    const context = context2d(expanded);
    context.fillStyle = e.canvas.color || '#ffffff';
    context.fillRect(0, 0, cw, ch);
    const anchor = e.canvas.anchor ?? 'center';
    const x = anchor.includes('left') ? 0 : anchor.includes('right') ? cw - stage.width : (cw - stage.width) / 2;
    const y = anchor.includes('top') ? 0 : anchor.includes('bottom') ? ch - stage.height : (ch - stage.height) / 2;
    context.drawImage(stage, Math.round(x), Math.round(y));
    stage = expanded;
  }
  const overlay = e.overlay;
  const visibleLayers = e.layers.filter((layer) => layer.visible !== false && layerImages?.get(layer.path));
  if (overlay.border || overlay.texts.length || visibleLayers.length || e.drawings.length) {
    const b = overlay.border ? Math.round((overlay.border / 100) * Math.min(stage.width, stage.height)) : 0;
    let framed = makeCanvas(stage.width + b * 2, stage.height + b * 2);
    let context = context2d(framed);
    if (b) {
      context.fillStyle = overlay.borderColor || '#ffffff';
      context.fillRect(0, 0, framed.width, framed.height);
    }
    context.drawImage(stage, b, b);
    if (visibleLayers.length) {
      const base = getPixels(framed);
      for (const layer of visibleLayers) {
        const image = layerImages.get(layer.path);
        const layerPixels = context2d(image, { willReadFrequently: true }).getImageData(0, 0, image.width, image.height);
        // Layer size: `scale` = fraction of the picture's width.
        const s = ((layer.scale ?? 0.5) * framed.width) / image.width;
        blendLayer(base, layerPixels, { mode: layer.mode ?? 'normal', opacity: (layer.opacity ?? 100) / 100, x: Math.round((layer.x ?? 0.5) * framed.width - (image.width * s) / 2), y: Math.round((layer.y ?? 0.5) * framed.height - (image.height * s) / 2), scale: s });
      }
      putPixels(framed, base);
      context = context2d(framed);
    }
    for (const drawing of e.drawings) drawShape(context, drawing, framed.width, framed.height);
    for (const text of overlay.texts) drawText(context, text, framed.width, framed.height);
    stage = framed;
    framed = null;
  }
  return stage;
}

/** Shapes of the drawing tools; points are fractions of the picture. */
export function drawShape(context, shape, width, height) {
  const points = (shape.points ?? []).map(([x, y]) => [x * width, y * height]);
  if (points.length < 2) return;
  const lineWidth = Math.max(1, ((shape.width ?? 0.5) / 100) * Math.min(width, height));
  context.save();
  context.strokeStyle = shape.color ?? '#ff3b30';
  context.fillStyle = shape.color ?? '#ff3b30';
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalAlpha = (shape.opacity ?? 100) / 100;
  const [[x1, y1]] = points;
  const [x2, y2] = points[points.length - 1];
  context.beginPath();
  switch (shape.type) {
    case 'rect': context.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); break;
    case 'ellipse': context.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2); break;
    case 'free': points.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y))); break;
    default: context.moveTo(x1, y1); context.lineTo(x2, y2);
  }
  if (shape.fill && (shape.type === 'rect' || shape.type === 'ellipse')) context.fill(); else context.stroke();
  if (shape.type === 'arrow') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = lineWidth * 4;
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
    context.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
    context.closePath();
    context.fill();
  }
  context.restore();
}

/** Text / watermark: position and size are fractions of the picture. */
export function drawText(context, text, width, height) {
  if (!text?.text) return;
  const size = Math.max(4, ((text.size ?? 5) / 100) * height);
  context.save();
  context.globalAlpha = (text.opacity ?? 100) / 100;
  context.font = `${text.italic ? 'italic ' : ''}${text.bold ? 'bold ' : ''}${size}px ${text.font || 'sans-serif'}`;
  context.textAlign = text.align ?? 'center';
  context.textBaseline = 'middle';
  if (text.shadow) {
    context.shadowColor = 'rgba(0,0,0,0.6)';
    context.shadowBlur = size * 0.15;
    context.shadowOffsetX = size * 0.04;
    context.shadowOffsetY = size * 0.04;
  }
  context.fillStyle = text.color ?? '#ffffff';
  const lines = String(text.text).split('\n');
  lines.forEach((line, i) => context.fillText(line, (text.x ?? 0.5) * width, (text.y ?? 0.5) * height + (i - (lines.length - 1) / 2) * size * 1.2));
  context.restore();
}
