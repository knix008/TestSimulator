// The face of a photo as the caricature engine sees it ("features"), in source pixels:
//   face     { cx, cy, rx, ry, angle }  the head ellipse (angle: radians, 0 = upright)
//   eyes     [{ x, y, r }, { x, y, r }] the left and right eye in the picture
//   brows    [{ x, y }, { x, y }]
//   nose     { x, y, r }                the tip and half its width
//   mouth    { x, y, w, h }             centre, half width and half height
//   chin     { x, y }, forehead { x, y }
//   method   'landmarks' (MediaPipe face mesh), 'skin' (own finder), 'default' or 'manual'
// The features come from the face mesh when its model is there (ui/facefinder.js maps the 478
// points with fromLandmarks), else from detectFace: skin colour, the largest face-like region,
// and dark spots for the eyes. The user can move every point afterwards (left panel).
import { clamp, createRaster, resize, toGray, blurChannel } from './raster.js';

export const FEATURE_POINTS = ['face', 'eyeL', 'eyeR', 'nose', 'mouth', 'chin', 'forehead'];

/** Canonical places in the head ellipse (x right, y down, the ellipse is the unit circle). */
const CANON = {
  // Measured averages of the face mesh on the sample portraits (MEAN_FACE), so a face found
  // without the mesh starts out "average" and gets no false distinctive features.
  eyes: [[-0.44, -0.1], [0.44, -0.1]],
  eyeR: 0.206,
  brows: [[-0.44, -0.32], [0.44, -0.32]],
  nose: [0, 0.42],
  noseR: 0.303,
  mouth: [0, 0.54],
  mouthW: 0.339,
  mouthH: 0.1,
  chin: [0, 0.971],
  forehead: [0, -0.619],
};

/** Ellipse point: unit-circle coordinates (u, v) → pixels. */
export function ellipsePoint(face, u, v) {
  const c = Math.cos(face.angle ?? 0);
  const s = Math.sin(face.angle ?? 0);
  const x = u * face.rx;
  const y = v * face.ry;
  return { x: face.cx + x * c - y * s, y: face.cy + x * s + y * c };
}

/** Pixels → unit-circle coordinates of the head ellipse. */
export function ellipseCoords(face, x, y) {
  const c = Math.cos(face.angle ?? 0);
  const s = Math.sin(face.angle ?? 0);
  const dx = x - face.cx;
  const dy = y - face.cy;
  return { u: (dx * c + dy * s) / face.rx, v: (-dx * s + dy * c) / face.ry };
}

/** Every feature at its canonical place in a head ellipse. */
export function featuresFromEllipse(face, method = 'default') {
  const r = Math.min(face.rx, face.ry);
  const at = ([u, v]) => ellipsePoint(face, u, v);
  const mouth = at(CANON.mouth);
  return {
    face: { ...face },
    eyes: CANON.eyes.map((p) => ({ ...at(p), r: CANON.eyeR * r * 1.15 })),
    brows: CANON.brows.map(at),
    nose: { ...at(CANON.nose), r: CANON.noseR * face.rx },
    mouth: { ...mouth, w: CANON.mouthW * face.rx, h: CANON.mouthH * face.ry },
    chin: at(CANON.chin),
    forehead: at(CANON.forehead),
    method,
  };
}

/** A sensible face when nothing was found: upright, centred a little above the middle. */
export function defaultFeatures(width, height) {
  const rx = Math.min(width * 0.24, height * 0.2);
  return featuresFromEllipse({ cx: width / 2, cy: height * 0.42, rx, ry: rx * 1.3, angle: 0 }, 'default');
}

/** Features scaled to another size of the same picture. */
export function scaleFeatures(f, scale) {
  if (!f) return f;
  const p = (q) => ({ ...q, x: q.x * scale, y: q.y * scale });
  return {
    ...f,
    face: { ...f.face, cx: f.face.cx * scale, cy: f.face.cy * scale, rx: f.face.rx * scale, ry: f.face.ry * scale },
    eyes: f.eyes.map((e) => ({ ...p(e), r: e.r * scale })),
    brows: (f.brows ?? []).map(p),
    nose: { ...p(f.nose), r: f.nose.r * scale },
    mouth: { ...p(f.mouth), w: f.mouth.w * scale, h: f.mouth.h * scale },
    chin: p(f.chin),
    forehead: p(f.forehead),
  };
}

/** True when the object looks like a complete feature set (files, undo history). */
export function validFeatures(f) {
  const num = (v) => Number.isFinite(v);
  const pt = (q) => q && num(q.x) && num(q.y);
  return Boolean(f && f.face && num(f.face.cx) && num(f.face.cy) && f.face.rx > 0 && f.face.ry > 0
    && Array.isArray(f.eyes) && f.eyes.length === 2 && f.eyes.every((e) => pt(e) && e.r > 0)
    && pt(f.nose) && pt(f.mouth) && pt(f.chin) && pt(f.forehead));
}

/**
 * Moves one feature point (left panel drag) and keeps the rest consistent: moving the face centre
 * moves everything; the chin and forehead stretch the head ellipse.
 */
export function moveFeature(f, which, x, y) {
  const next = structuredClone(f);
  next.method = 'manual';
  if (which === 'face') {
    const dx = x - f.face.cx;
    const dy = y - f.face.cy;
    const shift = (q) => { q.x += dx; q.y += dy; };
    next.face.cx = x; next.face.cy = y;
    next.eyes.forEach(shift); (next.brows ?? []).forEach(shift);
    shift(next.nose); shift(next.mouth); shift(next.chin); shift(next.forehead);
    return next;
  }
  if (which === 'eyeL' || which === 'eyeR') {
    const e = next.eyes[which === 'eyeL' ? 0 : 1];
    const b = next.brows?.[which === 'eyeL' ? 0 : 1];
    if (b) { b.x += x - e.x; b.y += y - e.y; }
    e.x = x; e.y = y;
    return next;
  }
  if (which === 'nose' || which === 'mouth') { next[which].x = x; next[which].y = y; return next; }
  if (which === 'chin' || which === 'forehead') {
    next[which].x = x; next[which].y = y;
    // The head ellipse spans forehead → chin: its centre, height and tilt follow them.
    const top = next.forehead;
    const bottom = next.chin;
    const len = Math.hypot(bottom.x - top.x, bottom.y - top.y);
    next.face.cx = (top.x + bottom.x) / 2 + (f.face.cx - (f.forehead.x + f.chin.x) / 2);
    next.face.cy = (top.y + bottom.y) / 2 + (f.face.cy - (f.forehead.y + f.chin.y) / 2);
    next.face.ry = Math.max(8, len / (CANON.chin[1] - CANON.forehead[1]));
    next.face.angle = Math.atan2(-(bottom.x - top.x), bottom.y - top.y);
    return next;
  }
  return next;
}

/** The draggable handles of the left panel: [{ id, x, y }]. */
export function featureHandles(f) {
  return [
    { id: 'face', x: f.face.cx, y: f.face.cy },
    { id: 'eyeL', x: f.eyes[0].x, y: f.eyes[0].y },
    { id: 'eyeR', x: f.eyes[1].x, y: f.eyes[1].y },
    { id: 'nose', x: f.nose.x, y: f.nose.y },
    { id: 'mouth', x: f.mouth.x, y: f.mouth.y },
    { id: 'chin', x: f.chin.x, y: f.chin.y },
    { id: 'forehead', x: f.forehead.x, y: f.forehead.y },
  ];
}

// ───────────────────────── from MediaPipe face mesh landmarks

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_L = [33, 133, 159, 145, 160, 144, 158, 153];
const EYE_R = [362, 263, 386, 374, 385, 380, 387, 373];

/**
 * Features from the 478 face mesh points (normalised 0…1 as MediaPipe gives them) of a picture
 * of `width`×`height`. "Left eye" is the one on the left of the picture.
 */
export function fromLandmarks(points, width, height) {
  if (!Array.isArray(points) || points.length < 468) return null;
  const P = (i) => ({ x: points[i].x * width, y: points[i].y * height });
  const mean = (list) => { const s = list.map(P).reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 }); return { x: s.x / list.length, y: s.y / list.length }; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = P(10);
  const chin = P(152);
  const leftCheek = P(234);
  const rightCheek = P(454);
  const angle = Math.atan2(-(chin.x - top.x), chin.y - top.y);
  // The mesh stops at the hairline: the head goes on above it (~18 % of the face height).
  const faceHeight = dist(top, chin);
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  const crown = { x: top.x + up.x * faceHeight * 0.18, y: top.y + up.y * faceHeight * 0.18 };
  const oval = mean(OVAL);
  const face = {
    cx: (crown.x + chin.x) / 2 * 0.5 + oval.x * 0.5,
    cy: (crown.y + chin.y) / 2 * 0.5 + oval.y * 0.5,
    rx: dist(leftCheek, rightCheek) / 2 * 1.04,
    ry: dist(crown, chin) / 2,
    angle,
  };
  const eye = (ids, iris) => {
    const c = points.length > iris ? P(iris) : mean(ids);
    const corners = dist(P(ids[0]), P(ids[1]));
    return { x: c.x, y: c.y, r: corners * 0.62 };
  };
  let eyes = [eye(EYE_L, 468), eye(EYE_R, 473)];
  if (eyes[0].x > eyes[1].x) eyes = [eyes[1], eyes[0]];
  const brows = [mean([70, 63, 105, 66, 107]), mean([300, 293, 334, 296, 336])].sort((a, b) => a.x - b.x);
  const nose = { ...P(1), r: dist(P(129), P(358)) / 2 * 1.1 };
  const mouthCentre = mean([13, 14, 61, 291]);
  const mouth = { ...mouthCentre, w: dist(P(61), P(291)) / 2 * 1.08, h: Math.max(dist(P(0), P(17)) / 2, 4) };
  return { face, eyes, brows, nose, mouth, chin, forehead: top, method: 'landmarks' };
}

// ───────────────────────── own finder (no model)

/** Skin probability 0…1 of a colour (YCbCr box with soft edges, tolerant of warm and pale skin). */
export function skinScore(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (y < 45 || y > 250) return 0;
  const soft = (v, lo, hi, edge) => clamp(Math.min(v - lo, hi - v) / edge + 0.5, 0, 1);
  return soft(cr, 133, 178, 8) * soft(cb, 77, 128, 8) * (r > b ? 1 : 0.3);
}

/**
 * Finds the face of a raster without a model: the skin region that is largest, most central and
 * most face-shaped; its upper part is fitted with an ellipse, the eyes are the darkest spots of
 * its upper half. Returns features in the raster's pixels (method 'skin'), or the default face.
 */
export function detectFace(raster) {
  const W = raster.width;
  const H = raster.height;
  const scale = Math.min(1, 160 / Math.max(W, H));
  const small = scale < 1 ? resize(raster, W * scale, H * scale) : raster;
  const w = small.width;
  const h = small.height;
  const d = small.data;
  const skin = new Float32Array(w * h);
  for (let i = 0, j = 0; i < skin.length; i++, j += 4) skin[i] = skinScore(d[j], d[j + 1], d[j + 2]);
  const smooth = blurChannel(skin, w, h, 1.2);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = smooth[i] > 0.45 ? 1 : 0;

  // Connected regions (4-neighbours).
  const label = new Int32Array(w * h).fill(-1);
  const regions = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = regions.length;
    const stack = [start];
    label[start] = id;
    let n = 0; let sx = 0; let sy = 0; let minX = w; let maxX = 0; let minY = h; let maxY = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      n++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= mask.length || label[q] >= 0 || !mask[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    regions.push({ id, n, cx: sx / n, cy: sy / n, minX, maxX, minY, maxY });
  }
  const scored = regions
    .filter((r) => r.n >= w * h * 0.006)
    .map((r) => {
      const bw = r.maxX - r.minX + 1;
      const bh = r.maxY - r.minY + 1;
      const fill = r.n / (bw * bh);
      const aspect = bh / bw;
      const central = 1 - Math.min(1, Math.hypot((r.cx / w) - 0.5, (r.cy / h) - 0.42) * 1.4);
      const shape = aspect > 0.7 && aspect < 2.6 ? 1 : 0.45;
      return { ...r, score: r.n * (0.4 + fill) * (0.35 + central) * shape };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return defaultFeatures(W, H);

  // The face is the top of the region (neck and shoulders below are cut at ~1.35 × its width).
  const bw = best.maxX - best.minX + 1;
  const limit = Math.min(best.maxY, best.minY + bw * 1.4);
  let n = 0; let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
  for (let y = best.minY; y <= limit; y++) {
    for (let x = best.minX; x <= best.maxX; x++) {
      if (label[y * w + x] !== best.id) continue;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
  }
  if (n < 10) return defaultFeatures(W, H);
  const mx = sx / n;
  const my = sy / n;
  const cxx = sxx / n - mx * mx;
  const cyy = syy / n - my * my;
  const cxy = sxy / n - mx * my;
  // Ellipse of the same second moments (a filled ellipse has variance r²/4 along each axis).
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy) - Math.PI / 2;
  if (angle < -Math.PI / 2) angle += Math.PI;
  if (angle > Math.PI / 2) angle -= Math.PI;
  angle = clamp(angle, -0.5, 0.5);
  let ry = 2 * Math.sqrt(Math.max(l1, 1));
  let rx = 2 * Math.sqrt(Math.max(l2, 1));
  // Hair hides the top of the head: the skin ellipse is the face, the head is a little taller.
  ry = Math.max(ry, rx * 1.15) * 1.08;
  rx *= 1.04;
  const face = { cx: mx / scale, cy: (my - ry * 0.06) / scale, rx: rx / scale, ry: ry / scale, angle };
  const features = featuresFromEllipse(face, 'skin');
  refineEyes(raster, features);
  return features;
}

/** Moves each eye to the darkest small spot near its canonical place (pupils and lashes are dark). */
function refineEyes(raster, f) {
  const r = Math.max(4, Math.round(f.face.rx * 0.3));
  const box = Math.max(2, Math.round(f.face.rx * 0.06));
  const x0 = Math.max(0, Math.round(f.face.cx - f.face.rx * 1.1));
  const y0 = Math.max(0, Math.round(f.face.cy - f.face.ry * 0.6));
  const x1 = Math.min(raster.width, Math.round(f.face.cx + f.face.rx * 1.1));
  const y1 = Math.min(raster.height, Math.round(f.face.cy + f.face.ry * 0.25));
  if (x1 - x0 < 8 || y1 - y0 < 8) return;
  const crop = createRaster(x1 - x0, y1 - y0);
  for (let y = y0; y < y1; y++) crop.data.set(raster.data.subarray((y * raster.width + x0) * 4, (y * raster.width + x1) * 4), (y - y0) * crop.width * 4);
  const gray = blurChannel(toGray(crop), crop.width, crop.height, box);
  const moved = f.eyes.map((eye) => {
    let best = Infinity;
    let at = null;
    for (let y = Math.round(eye.y - r * 0.7); y <= Math.round(eye.y + r * 0.7); y++) {
      for (let x = Math.round(eye.x - r); x <= Math.round(eye.x + r); x++) {
        const lx = x - x0;
        const ly = y - y0;
        if (lx < 0 || ly < 0 || lx >= crop.width || ly >= crop.height) continue;
        // Darkness, a little pull towards the canonical place.
        const v = gray[ly * crop.width + lx] + 18 * Math.hypot((x - eye.x) / r, (y - eye.y) / r);
        if (v < best) { best = v; at = { x, y }; }
      }
    }
    return at ? { ...eye, x: at.x, y: at.y } : eye;
  });
  // The two eyes stay roughly level and apart; otherwise keep the canonical places.
  const dy = Math.abs(moved[0].y - moved[1].y);
  const dx = moved[1].x - moved[0].x;
  if (dx > f.face.rx * 0.45 && dy < f.face.ry * 0.25) {
    f.eyes = moved;
    f.brows = moved.map((e) => ({ x: e.x, y: e.y - f.face.ry * 0.2 }));
  }
}

// ───────────────────────── what makes this face this face

/**
 * Average proportions of a face (measured on the ten sample portraits with the face mesh):
 * eye radius, nose half width and mouth half width per head half width; chin, nose and forehead
 * distances per head half height; head height per width.
 */
export const MEAN_FACE = { eyes: 0.237, nose: 0.303, mouth: 0.339, chin: 0.431, noseLength: 0.52, forehead: 0.519, aspect: 1.39 };

/** This face's proportions, comparable with MEAN_FACE. */
export function faceProportions(f) {
  const rx = f.face.rx;
  const ry = f.face.ry;
  const mid = { x: (f.eyes[0].x + f.eyes[1].x) / 2, y: (f.eyes[0].y + f.eyes[1].y) / 2 };
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    eyes: (f.eyes[0].r + f.eyes[1].r) / 2 / rx,
    nose: f.nose.r / rx,
    mouth: f.mouth.w / rx,
    chin: d(f.chin, f.mouth) / ry,
    noseLength: d(f.nose, mid) / ry,
    forehead: d(f.forehead, mid) / ry,
    aspect: ry / rx,
  };
}

/**
 * How much more (or less) than average each feature stands out: multipliers around 1 for the
 * exaggeration (a nose 10 % wider than average → about 1.25 with gain 2.5). This is what a
 * caricaturist does: exaggerate what differs from the average face.
 */
export function distinctiveness(f, gain = 2.5) {
  if (!validFeatures(f)) return null;
  const p = faceProportions(f);
  const dev = (key) => p[key] / MEAN_FACE[key] - 1;
  const factor = (d) => Math.min(1.45, Math.max(0.75, 1 + d * gain));
  const long = dev('aspect');
  return {
    eyes: factor(dev('eyes')),
    nose: factor(dev('nose') * 0.6 + dev('noseLength') * 0.4),
    mouth: factor(dev('mouth')),
    chin: factor(dev('chin') + long * 0.5),
    forehead: factor(dev('forehead') + long * 0.3),
    jaw: factor(-long * 0.8),
    ears: factor(-long * 0.5),
  };
}

/** The two or three features that stand out most: [{ key, percent }] (percent above/below average). */
export function standoutFeatures(f, count = 3) {
  if (!validFeatures(f)) return [];
  const p = faceProportions(f);
  return ['eyes', 'nose', 'mouth', 'chin', 'forehead']
    .map((key) => ({ key, percent: Math.round((p[key] / MEAN_FACE[key] - 1) * 100) }))
    .filter((x) => Math.abs(x.percent) >= 3)
    .sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))
    .slice(0, count);
}

/** Features moved by (dx, dy) pixels (a crop of the photo). */
export function translateFeatures(f, dx, dy) {
  if (!f) return f;
  const p = (q) => ({ ...q, x: q.x + dx, y: q.y + dy });
  return {
    ...f,
    face: { ...f.face, cx: f.face.cx + dx, cy: f.face.cy + dy },
    eyes: f.eyes.map(p),
    brows: (f.brows ?? []).map(p),
    nose: p(f.nose),
    mouth: p(f.mouth),
    chin: p(f.chin),
    forehead: p(f.forehead),
  };
}

/**
 * Head-and-shoulders framing of a photo around its face ({ x, y, w, h } in photo pixels), or null
 * when the face already fills the picture (no crop needed). The frame is 3:4 (portrait), the head
 * in its upper part with room above for the bigger caricature head.
 */
export function faceCrop(f, width, height) {
  if (!f) return null;
  const headW = f.face.rx * 2;
  if (headW >= width * 0.42) return null;
  // Room above the head for a bigger caricature head (and a crown), shoulders below.
  let w = Math.min(width, headW * 3.4);
  let h = Math.min(height, w * 4 / 3);
  w = Math.min(w, h * 3 / 4) || w;
  const x = Math.max(0, Math.min(width - w, f.face.cx - w / 2));
  const y = Math.max(0, Math.min(height - h, f.face.cy - f.face.ry * 2.3));
  if (w >= width * 0.95 && h >= height * 0.95) return null;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
