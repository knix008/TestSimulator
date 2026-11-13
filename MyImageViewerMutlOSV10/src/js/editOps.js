/* Pixel operations for the image editor: plain functions over { data, width, height }
 * (ImageData in the page, plain objects in the tests). Nothing here touches the DOM.
 *
 *   Tone      toneLUTs, curveLUT, applyTone (incl. vibrance), histogram, autoLevels, suggestEnhance, wbFromSample
 *   Noise     denoise (edge-preserving)
 *   Masks     invertMask, growMask, shrinkMask, featherMask, maskBounds
 *   Pixels    boxBlur, pixelate, blendByMask, inpaint, redEye
 *   Geometry  rotatedFit, ratioRect
 *
 * Shared by the renderer (window.EditOps) and the tests (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EditOps = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  /** A blank image of the same kind as the page uses (ImageData there, a plain object in Node). */
  function make(w, h) {
    if (typeof ImageData === 'function') return new ImageData(w, h);
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  function copy(img) {
    const out = make(img.width, img.height);
    out.data.set(img.data);
    return out;
  }

  /* ════════════════ Tone ════════════════ */

  /**
   * Monotone cubic (Fritsch–Carlson) through the points [[x, y], …] (0–255), as a 256-entry
   * table. Fewer than two points, or the identity diagonal, gives the identity.
   */
  function curveLUT(points) {
    const lut = new Uint8Array(256);
    const pts = (Array.isArray(points) ? points : [])
      .map(([x, y]) => [Math.max(0, Math.min(255, +x)), Math.max(0, Math.min(255, +y))])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .sort((a, b) => a[0] - b[0])
      .filter((p, i, arr) => i === 0 || p[0] > arr[i - 1][0]);
    if (pts.length < 2) {
      for (let i = 0; i < 256; i++) lut[i] = i;
      return lut;
    }
    const n = pts.length;
    const dx = [], dy = [], m = [];
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1][0] - pts[i][0]);
      dy.push(pts[i + 1][1] - pts[i][1]);
      m.push(dy[i] / dx[i]);
    }
    const t = new Array(n);
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let seg = 0;
    for (let x = 0; x < 256; x++) {
      if (x <= pts[0][0]) { lut[x] = clamp255(Math.round(pts[0][1])); continue; }
      if (x >= pts[n - 1][0]) { lut[x] = clamp255(Math.round(pts[n - 1][1])); continue; }
      while (seg < n - 2 && x > pts[seg + 1][0]) seg++;
      const h = dx[seg];
      const u = (x - pts[seg][0]) / h;
      const u2 = u * u, u3 = u2 * u;
      const y = (2 * u3 - 3 * u2 + 1) * pts[seg][1] + (u3 - 2 * u2 + u) * h * t[seg]
        + (-2 * u3 + 3 * u2) * pts[seg + 1][1] + (u3 - u2) * h * t[seg + 1];
      lut[x] = clamp255(Math.round(y));
    }
    return lut;
  }

  function isIdentityCurve(points) {
    if (!Array.isArray(points) || points.length < 2) return true;
    return points.every(([x, y]) => Math.abs(x - y) < 0.5);
  }

  /** Levels { black, white, gamma, outBlack, outWhite } as a value map (0–255). */
  function levelsValue(v, lv) {
    const black = lv.black ?? 0, white = lv.white ?? 255;
    const gamma = lv.gamma > 0 ? lv.gamma : 1;
    const ob = lv.outBlack ?? 0, ow = lv.outWhite ?? 255;
    const span = Math.max(1, white - black);
    let x = (v - black) / span;
    x = x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(x, 1 / gamma);
    return ob + x * (ow - ob);
  }

  function isIdentityLevels(lv) {
    if (!lv) return true;
    return (lv.black ?? 0) === 0 && (lv.white ?? 255) === 255 && (lv.gamma ?? 1) === 1
      && (lv.outBlack ?? 0) === 0 && (lv.outWhite ?? 255) === 255;
  }

  /**
   * Per-channel tables for the colour part of the tone pass, in this order:
   * white balance gains → exposure (−100…100 = −2…+2 stops) → levels → master curve → channel curve.
   */
  function toneLUTs(p = {}) {
    const wb = Array.isArray(p.wb) && p.wb.length === 3 ? p.wb : [1, 1, 1];
    const expo = Math.pow(2, (Number(p.exposure) || 0) / 50);
    const lv = p.levels && !isIdentityLevels(p.levels) ? p.levels : null;
    const curve = p.curve || {};
    const master = isIdentityCurve(curve.rgb) ? null : curveLUT(curve.rgb);
    const out = {};
    ['r', 'g', 'b'].forEach((ch, ci) => {
      const own = isIdentityCurve(curve[ch]) ? null : curveLUT(curve[ch]);
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        let v = i * wb[ci] * expo;
        if (lv) v = levelsValue(clamp255(v), lv);
        v = clamp255(Math.round(v));
        if (master) v = master[v];
        if (own) v = own[v];
        lut[i] = v;
      }
      out[ch] = lut;
    });
    return out;
  }

  /** True when the tone settings change nothing (the render skips the pass). */
  function toneIsIdentity(p = {}) {
    const wb = p.wb;
    const wbOff = !Array.isArray(wb) || wb.every((g) => Math.abs(g - 1) < 1e-3);
    const curve = p.curve || {};
    return wbOff && !(Number(p.exposure) || 0) && !(Number(p.highlights) || 0) && !(Number(p.shadows) || 0)
      && !(Number(p.vibrance) || 0)
      && isIdentityLevels(p.levels)
      && ['rgb', 'r', 'g', 'b'].every((k) => isIdentityCurve(curve[k]));
  }

  /**
   * Highlights / shadows (−100…100) as a luma → luma table (1024 steps): shadows lift or
   * deepen the dark end, highlights recover or brighten the light end, the middle stays.
   */
  function hsTable(highlights, shadows) {
    const hs = (Number(highlights) || 0) / 100, ss = (Number(shadows) || 0) / 100;
    const N = 1024;
    const tab = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const L = i / N;
      const ws = Math.pow(1 - L, 3);
      const wh = Math.pow(L, 3);
      let out = L;
      out += ss * 0.5 * ws * (ss > 0 ? (1 - L) : L);
      out += hs * 0.5 * wh * (hs > 0 ? (1 - L) : L);
      tab[i] = out < 0 ? 0 : out > 1 ? 1 : out;
    }
    return tab;
  }

  /** The whole tone pass into a new image. `p` = { exposure, highlights, shadows, levels, curve, wb }. */
  function applyTone(src, p = {}) {
    const out = make(src.width, src.height);
    const s = src.data, d = out.data;
    const { r: lr, g: lg, b: lb } = toneLUTs(p);
    const hsOn = (Number(p.highlights) || 0) !== 0 || (Number(p.shadows) || 0) !== 0;
    const tab = hsOn ? hsTable(p.highlights, p.shadows) : null;
    // Vibrance: saturation that mostly lifts the dull colours (skin and the already vivid stay)
    const vib = Math.max(-1, Math.min(1, (Number(p.vibrance) || 0) / 100));
    for (let i = 0; i < s.length; i += 4) {
      let r = lr[s[i]], g = lg[s[i + 1]], b = lb[s[i + 2]];
      if (tab) {
        const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const T = tab[Math.round(L * 1024)];
        if (L > 0.002) {
          const k = T / L;
          r *= k; g *= k; b *= k;
        } else {
          const add = T * 255;
          r += add; g += add; b += add;
        }
      }
      if (vib) {
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const sat = mx > 0 ? (mx - mn) / mx : 0;
        const k = 1 + (vib > 0 ? vib * (1 - sat) * 1.2 : vib);
        const avg = (r + g + b) / 3;
        r = avg + (r - avg) * k; g = avg + (g - avg) * k; b = avg + (b - avg) * k;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = s[i + 3];
    }
    return out;
  }

  /** Counts per value for red, green, blue and luma (transparent pixels are left out). */
  function _histBins() {
    return { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
  }
  function _histPixel(bins, d, i) {
    if (d[i + 3] < 8) return;
    bins.r[d[i]]++; bins.g[d[i + 1]]++; bins.b[d[i + 2]]++;
    bins.l[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
  }
  function histogram(img) {
    const bins = _histBins();
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) _histPixel(bins, d, i);
    return bins;
  }

  /** Same counts, but yields every few rows so a progress popup can paint. */
  async function histogramAsync(img, onProgress) {
    const bins = _histBins();
    const d = img.data;
    const w = img.width || 0, h = img.height || 0;
    const stride = w * 4;
    const step = Math.max(8, Math.floor(h / 40) || 8);
    const report = async (frac) => {
      if (typeof onProgress === 'function') await onProgress(frac);
    };
    if (!h || !stride) { await report(1); return bins; }
    for (let y = 0; y < h; y++) {
      const row = y * stride;
      for (let i = row; i < row + stride; i += 4) _histPixel(bins, d, i);
      if (y % step === step - 1 || y === h - 1) await report((y + 1) / h);
    }
    return bins;
  }

  function percentile(hist, frac) {
    let total = 0;
    for (let i = 0; i < 256; i++) total += hist[i];
    if (!total) return frac < 0.5 ? 0 : 255;
    const target = total * frac;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  }

  /**
   * Auto enhance: stretch the tones between the 0.5 % darkest and brightest pixels (the
   * same for all channels, so colours keep their balance) and pull the middle grey
   * toward 50 % with a gentle gamma. Returns levels for toneLUTs.
   */
  function levelsFromHist(h, clip = 0.005) {
    let black = Math.min(percentile(h.r, clip), percentile(h.g, clip), percentile(h.b, clip));
    let white = Math.max(percentile(h.r, 1 - clip), percentile(h.g, 1 - clip), percentile(h.b, 1 - clip));
    if (white - black < 16) { black = 0; white = 255; }
    const mid = percentile(h.l, 0.5);
    const x = Math.max(0.02, Math.min(0.98, (mid - black) / Math.max(1, white - black)));
    // x^(1/gamma) = 0.5  →  gamma = ln(x) / ln(0.5)
    let gamma = Math.log(x) / Math.log(0.5);
    gamma = Math.max(0.7, Math.min(1.45, gamma));
    return { black, white, gamma: Math.round(gamma * 100) / 100, outBlack: 0, outWhite: 255 };
  }

  function autoLevels(img, clip = 0.005) {
    return levelsFromHist(histogram(img), clip);
  }

  const ENHANCE_TUNES = {
    portrait:  { contrast: 104, shadows: 16, highlights: -14, vibrance: 10, warmth: 8, sharpen: 16, exposure: 0 },
    landscape: { contrast: 112, shadows: 14, highlights: -22, vibrance: 26, warmth: 0, sharpen: 20, exposure: 0 },
    night:     { contrast: 108, shadows: 30, highlights: -8, vibrance: 8, warmth: 0, sharpen: 6, exposure: 10 },
    sunset:    { contrast: 108, shadows: 8, highlights: -16, vibrance: 16, warmth: 16, sharpen: 10, exposure: 0 },
    snow:      { contrast: 108, shadows: 6, highlights: -10, vibrance: 8, warmth: 0, sharpen: 12, exposure: 0 },
    flat:      { contrast: 118, shadows: 8, highlights: -6, vibrance: 8, warmth: 0, sharpen: 18, exposure: 0 },
    general:   { contrast: 108, shadows: 10, highlights: -8, vibrance: 14, warmth: 0, sharpen: 12, exposure: 0 },
  };

  /**
   * Look at a picture and choose a gentle correction for what it seems to be
   * (a face, a landscape, a night shot, and so on). `effects` is ready for
   * Editor.setEffects: stylized looks are cleared, borders are left alone.
   */
  function suggestEnhance(img, hist) {
    const w = img.width, h = img.height, data = img.data;
    const empty = {
      kind: 'general',
      effects: {
        brightness: 100, contrast: 108, saturation: 100, hue: 0,
        blur: 0, grayscale: 0, sepia: 0, invert: 0, sharpen: 12,
        emboss: false, edge: false, vignette: 0, warmth: 0, grain: 0,
        posterize: 0, solarize: 0, tiltShift: 0, tintAmount: 0,
        exposure: 0, highlights: -8, shadows: 10, vibrance: 14,
        levels: null, curve: null, wb: null,
      },
    };
    if (!w || !h || !data) return empty;
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 24000)));
    let n = 0, skin = 0, skinC = 0, nC = 0, sky = 0, nTop = 0, green = 0;
    let sumR = 0, sumG = 0, sumB = 0, sumL = 0, sumSat = 0;
    const lumas = [];
    const x0 = w * 0.28, x1 = w * 0.72, y0 = h * 0.18, y1 = h * 0.82, top = h * 0.34;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 16) continue;
        n++;
        sumR += r; sumG += g; sumB += b;
        const l = (r * 54 + g * 183 + b * 19) >> 8;
        sumL += l;
        lumas.push(l);
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        sumSat += max === 0 ? 0 : (max - min) / max;
        const isSkin = r > 95 && g > 40 && b > 20 && r > g && r > b && (r - g) > 15 && (max - min) > 15;
        if (isSkin) skin++;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) { nC++; if (isSkin) skinC++; }
        if (y < top) {
          nTop++;
          if (b > r + 12 && b > g && l > 70) sky++;
        }
        if (g > r + 8 && g > b + 8 && l > 30 && l < 210) green++;
      }
    }
    if (!n) return empty;
    lumas.sort((a, b) => a - b);
    const at = (p) => lumas[Math.min(lumas.length - 1, Math.max(0, Math.floor(p * (lumas.length - 1))))];
    const p50 = at(0.5), p95 = at(0.95);
    const meanL = sumL / n;
    const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;
    const warm = meanR - meanB;
    const sat = sumSat / n;
    const skinFrac = skin / n;
    const skinCenter = nC ? skinC / nC : 0;
    const skyFrac = nTop ? sky / nTop : 0;
    const greenFrac = green / n;
    const spread = at(0.95) - at(0.05);

    let kind = 'general';
    if (meanL < 58 && p95 < 155) kind = 'night';
    else if (skinFrac > 0.06 && skinCenter > 0.16 && skinCenter > skinFrac * 1.35) kind = 'portrait';
    else if (p50 > 185 && sat < 0.16) kind = 'snow';
    else if (warm > 28 && meanL > 55 && meanL < 180 && sat > 0.2 && skyFrac < 0.35) kind = 'sunset';
    else if ((skyFrac > 0.2 && (greenFrac > 0.06 || w >= h * 1.15)) || (greenFrac > 0.2 && skyFrac > 0.08)) kind = 'landscape';
    else if (spread < 72) kind = 'flat';

    const tune = ENHANCE_TUNES[kind];

    let wb = null;
    if (kind === 'general' || kind === 'flat') {
      const cast = Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB);
      if (cast > 22) {
        wb = wbFromSample(meanR, meanG, meanB).map((v) => Math.round((1 + (v - 1) * 0.45) * 1000) / 1000);
      }
    }
    const levels = hist ? levelsFromHist(hist) : autoLevels(img);
    return {
      kind,
      effects: {
        brightness: 100, saturation: 100, hue: 0,
        blur: 0, grayscale: 0, sepia: 0, invert: 0,
        emboss: false, edge: false, vignette: 0, grain: 0,
        posterize: 0, solarize: 0, tiltShift: 0, tintAmount: 0,
        curve: null,
        ...tune,
        levels,
        wb,
      },
    };
  }

  /**
   * suggestEnhance, but the full-frame histogram yields so the caller can paint
   * a progress percent. onProgress receives 0..1.
   */
  async function suggestEnhanceAsync(img, onProgress) {
    const report = async (frac) => {
      if (typeof onProgress === 'function') await onProgress(Math.max(0, Math.min(1, frac)));
    };
    await report(0.02);
    const hist = await histogramAsync(img, (f) => report(0.02 + f * 0.96));
    const plan = suggestEnhance(img, hist);
    await report(1);
    return plan;
  }

  /**
   * The auto-improve look on a (usually small) image, for the settings preview.
   * `fx` uses the same knobs as the dialog: exposure, contrast, highlights, shadows,
   * vibrance, warmth, sharpen, and optional levels / wb. Returns a new image.
   */
  function previewEnhance(img, fx = {}) {
    const out = applyTone(img, {
      exposure: fx.exposure || 0,
      highlights: fx.highlights || 0,
      shadows: fx.shadows || 0,
      vibrance: fx.vibrance || 0,
      levels: fx.levels || null,
      wb: fx.wb || null,
    });
    const d = out.data;
    const warm = (Number(fx.warmth) || 0) / 100;
    const contrast = (fx.contrast == null || fx.contrast === '' ? 100 : Number(fx.contrast)) / 100;
    if (warm || contrast !== 1) {
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (warm) { r += warm * 30; b -= warm * 20; }
        if (contrast !== 1) {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
    const sharp = Math.max(0, Math.min(1, (Number(fx.sharpen) || 0) / 100));
    if (sharp < 0.01) return out;
    const w = out.width, h = out.height, s = d;
    const sharpOut = make(w, h);
    const o = sharpOut.data;
    const a = sharp * 1.7;
    for (let y = 0; y < h; y++) {
      const ym = y > 0 ? y - 1 : y, yp = y + 1 < h ? y + 1 : y;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x + 1 < w ? x + 1 : x;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const v = s[i + c];
          const n = (s[(y * w + xm) * 4 + c] + s[(y * w + xp) * 4 + c] + s[(ym * w + x) * 4 + c] + s[(yp * w + x) * 4 + c]) * 0.25;
          const z = v + (v - n) * a;
          o[i + c] = z < 0 ? 0 : z > 255 ? 255 : z;
        }
        o[i + 3] = s[i + 3];
      }
    }
    return sharpOut;
  }

  /** Channel gains that turn the sampled colour neutral grey (each 0.5–2). */
  function wbFromSample(r, g, b) {
    const avg = (r + g + b) / 3;
    const gain = (c) => Math.max(0.5, Math.min(2, c > 1 ? avg / c : 1));
    return [gain(r), gain(g), gain(b)].map((v) => Math.round(v * 1000) / 1000);
  }

  /**
   * Noise reduction that keeps edges: each pixel becomes a weighted mean of its 5×5
   * neighbourhood where neighbours of a clearly different brightness count for little
   * (a bilateral filter on luma). `strength` 1–100. New image.
   */
  function denoise(img, strength = 40) {
    const w = img.width, h = img.height, s = img.data;
    const out = make(w, h), d = out.data;
    const st = Math.max(1, Math.min(100, strength));
    const sigR = 4 + st * 0.5;                  // brightness difference still averaged
    const range = new Float32Array(256);
    for (let i = 0; i < 256; i++) range[i] = Math.exp(-(i * i) / (2 * sigR * sigR));
    const R = 2, spatial = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) spatial.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * 1.6 * 1.6))]);
    const luma = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < w * h; p++, i += 4) luma[p] = (s[i] * 54 + s[i + 1] * 183 + s[i + 2] * 19) >> 8;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x, L = luma[p];
        let r = 0, g = 0, b = 0, ws = 0;
        for (let k = 0; k < spatial.length; k++) {
          const xx = x + spatial[k][0], yy = y + spatial[k][1];
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          const diff = L > luma[q] ? L - luma[q] : luma[q] - L;
          const wt = spatial[k][2] * range[diff];
          const j = q * 4;
          r += s[j] * wt; g += s[j + 1] * wt; b += s[j + 2] * wt; ws += wt;
        }
        const i = p * 4;
        d[i] = r / ws; d[i + 1] = g / ws; d[i + 2] = b / ws; d[i + 3] = s[i + 3];
      }
    }
    return out;
  }

  /* ════════════════ Masks (Uint8 per pixel, 255 = selected) ════════════════ */

  function invertMask(mask) {
    const out = new Uint8ClampedArray(mask.length);
    for (let i = 0; i < mask.length; i++) out[i] = 255 - mask[i];
    return out;
  }

  // Running max / min over a window of 2r+1 (van Herk / Gil-Werman: O(n) whatever r is)
  function _runExtreme(src, len, r, isMax, get, set) {
    const k = 2 * r + 1;
    const g = new Uint8Array(len + k), h = new Uint8Array(len + k);
    const pad = isMax ? 0 : 255;
    const at = (i) => (i < r || i >= len + r ? pad : get(i - r));
    const pick = isMax ? (a, b) => (a > b ? a : b) : (a, b) => (a < b ? a : b);
    const total = len + 2 * r;
    for (let i = 0; i < total; i++) g[i] = i % k === 0 ? at(i) : pick(g[i - 1], at(i));
    for (let i = total - 1; i >= 0; i--) h[i] = (i % k === k - 1 || i === total - 1) ? at(i) : pick(h[i + 1], at(i));
    for (let i = 0; i < len; i++) set(i, pick(h[i], g[i + k - 1]));
  }

  function _morph(mask, w, h, r, isMax) {
    r = Math.max(0, Math.round(r));
    if (!r) return new Uint8ClampedArray(mask);
    const tmp = new Uint8ClampedArray(mask.length);
    const out = new Uint8ClampedArray(mask.length);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      _runExtreme(mask, w, r, isMax, (i) => mask[o + i], (i, v) => { tmp[o + i] = v; });
    }
    for (let x = 0; x < w; x++) {
      _runExtreme(tmp, h, r, isMax, (i) => tmp[i * w + x], (i, v) => { out[i * w + x] = v; });
    }
    return out;
  }

  const growMask = (mask, w, h, r) => _morph(mask, w, h, r, true);
  const shrinkMask = (mask, w, h, r) => _morph(mask, w, h, r, false);

  // Sliding-window mean over one line, edges clamped; three passes ≈ a Gaussian
  function _boxLine(get, set, len, r) {
    const n = 2 * r + 1;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += get(Math.min(len - 1, Math.max(0, i)));
    for (let i = 0; i < len; i++) {
      set(i, sum / n);
      sum += get(Math.min(len - 1, i + r + 1)) - get(Math.max(0, i - r));
    }
  }

  /** Soft edge of `r` px around the selection. */
  function featherMask(mask, w, h, r) {
    r = Math.max(0, Math.round(r));
    let cur = Float32Array.from(mask);
    if (!r) return new Uint8ClampedArray(mask);
    const rr = Math.max(1, Math.round(r / 2));
    const tmp = new Float32Array(cur.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {
        const o = y * w;
        _boxLine((i) => cur[o + i], (i, v) => { tmp[o + i] = v; }, w, rr);
      }
      for (let x = 0; x < w; x++) {
        _boxLine((i) => tmp[i * w + x], (i, v) => { cur[i * w + x] = v; }, h, rr);
      }
    }
    const out = new Uint8ClampedArray(cur.length);
    for (let i = 0; i < cur.length; i++) out[i] = cur[i];
    return out;
  }

  /** The mask moved by (dx, dy); what slides off the edge is dropped. */
  function shiftMask(mask, w, h, dx, dy) {
    dx = Math.round(dx); dy = Math.round(dy);
    const out = new Uint8ClampedArray(mask.length);
    for (let y = 0; y < h; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= h) continue;
      for (let x = 0; x < w; x++) {
        const sx = x - dx;
        if (sx >= 0 && sx < w) out[y * w + x] = mask[sy * w + sx];
      }
    }
    return out;
  }

  /** Two selections into one: 'add' (either) or 'sub' (the first without the second). */
  function combineMasks(a, b, mode) {
    const out = new Uint8ClampedArray(a.length);
    if (mode === 'add') for (let i = 0; i < a.length; i++) out[i] = a[i] > b[i] ? a[i] : b[i];
    else for (let i = 0; i < a.length; i++) out[i] = a[i] * (255 - b[i]) / 255;
    return out;
  }

  /** Bounding box of mask values above `min`, or null. */
  function maskBounds(mask, w, h, min = 0) {
    let x1 = w, y1 = h, x2 = -1, y2 = -1;
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[o + x] > min) {
          if (x < x1) x1 = x;
          if (x > x2) x2 = x;
          if (y < y1) y1 = y;
          y2 = y;
        }
      }
    }
    return x2 < 0 ? null : { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
  }

  /* ════════════════ Pixels ════════════════ */

  /** Blur of radius `r` (three box passes, alpha included) into a new image. */
  function boxBlur(img, r) {
    const w = img.width, h = img.height;
    const out = copy(img);
    r = Math.max(0, Math.round(r));
    if (!r) return out;
    const rr = Math.max(1, Math.round(r / 2));
    const a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < w * h; i++) a[i] = img.data[i * 4 + c];
      for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < h; y++) {
          const o = y * w;
          _boxLine((i) => a[o + i], (i, v) => { b[o + i] = v; }, w, rr);
        }
        for (let x = 0; x < w; x++) {
          _boxLine((i) => b[i * w + x], (i, v) => { a[i * w + x] = v; }, h, rr);
        }
      }
      for (let i = 0; i < w * h; i++) out.data[i * 4 + c] = a[i];
    }
    return out;
  }

  /** Mosaic: every `block`×`block` cell becomes its average colour. */
  function pixelate(img, block) {
    const w = img.width, h = img.height;
    const out = make(w, h);
    const s = img.data, d = out.data;
    block = Math.max(2, Math.round(block));
    for (let by = 0; by < h; by += block) {
      for (let bx = 0; bx < w; bx += block) {
        const ex = Math.min(w, bx + block), ey = Math.min(h, by + block);
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            r += s[i]; g += s[i + 1]; b += s[i + 2]; a += s[i + 3]; n++;
          }
        }
        r /= n; g /= n; b /= n; a /= n;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
          }
        }
      }
    }
    return out;
  }

  /** dst ← dst + (src − dst) × mask/255, in place (mask: one byte per pixel). */
  function blendByMask(dst, src, mask) {
    const d = dst.data, s = src.data;
    for (let p = 0; p < mask.length; p++) {
      const m = mask[p];
      if (!m) continue;
      const i = p * 4;
      if (m === 255) {
        d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = s[i + 3];
      } else {
        const k = m / 255;
        d[i] += (s[i] - d[i]) * k;
        d[i + 1] += (s[i + 1] - d[i + 1]) * k;
        d[i + 2] += (s[i + 2] - d[i + 2]) * k;
        d[i + 3] += (s[i + 3] - d[i + 3]) * k;
      }
    }
    return dst;
  }

  /**
   * Spot healing: fill the masked pixels from their surroundings, ring by ring from the
   * edge inward (each takes the mean of its known neighbours), then smooth the patch and
   * add back the fine grain of the area around it so it does not look painted. In place.
   * Returns the number of pixels filled.
   */
  function inpaint(img, mask) {
    const w = img.width, h = img.height, d = img.data;
    const todo = new Uint8Array(w * h);
    let left = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] > 127) { todo[i] = 1; left++; }
    const filled = left;
    if (!left) return 0;
    const box = maskBounds(todo, w, h, 0);
    const x0 = Math.max(0, box.x - 1), x1 = Math.min(w - 1, box.x + box.w);
    const y0 = Math.max(0, box.y - 1), y1 = Math.min(h - 1, box.y + box.h);
    const ring = [];
    while (left > 0) {
      ring.length = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = y * w + x;
          if (!todo[p]) continue;
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if ((!dx && !dy) || xx < 0 || xx >= w) continue;
              const q = yy * w + xx;
              if (todo[q]) continue;
              const k = (dx && dy) ? 0.7 : 1;
              r += d[q * 4] * k; g += d[q * 4 + 1] * k; b += d[q * 4 + 2] * k; a += d[q * 4 + 3] * k; n += k;
            }
          }
          if (n) ring.push(p, r / n, g / n, b / n, a / n);
        }
      }
      if (!ring.length) break;   // nothing known around (whole image selected)
      for (let i = 0; i < ring.length; i += 5) {
        const p = ring[i];
        d[p * 4] = ring[i + 1]; d[p * 4 + 1] = ring[i + 2]; d[p * 4 + 2] = ring[i + 3]; d[p * 4 + 3] = ring[i + 4];
        todo[p] = 0;
        left--;
      }
    }
    // Grain: the high-frequency detail of a neighbouring strip, laid over the smooth fill
    const offX = box.w + 2 <= x0 ? -(box.w + 2) : (x1 + box.w + 2 < w ? box.w + 2 : 0);
    if (offX) {
      for (let y = box.y; y < box.y + box.h; y++) {
        for (let x = box.x; x < box.x + box.w; x++) {
          const p = y * w + x;
          if (mask[p] <= 127) continue;
          const sx = x + offX;
          if (sx < 1 || sx >= w - 1) continue;
          const q = y * w + sx;
          for (let c = 0; c < 3; c++) {
            const here = d[q * 4 + c];
            const around = (d[(q - 1) * 4 + c] + d[(q + 1) * 4 + c]) / 2;
            d[p * 4 + c] = clamp255(d[p * 4 + c] + (here - around) * 0.6);
          }
        }
      }
    }
    return filled;
  }

  /**
   * Red-eye: inside the circle, pixels that are clearly red lose the red (it becomes the
   * mean of green and blue, slightly darkened). In place; returns how many changed.
   */
  function redEye(img, cx, cy, radius) {
    const w = img.width, h = img.height, d = img.data;
    const r2 = radius * radius;
    let n = 0;
    const xa = Math.max(0, Math.floor(cx - radius)), xb = Math.min(w - 1, Math.ceil(cx + radius));
    const ya = Math.max(0, Math.floor(cy - radius)), yb = Math.min(h - 1, Math.ceil(cy + radius));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const other = Math.max(g, b);
        if (r > 60 && r > other * 1.5) {
          const v = (g + b) / 2 * 0.85;
          // Feather toward the rim so the pupil edge stays soft
          const edge = Math.min(1, (1 - Math.sqrt(dx * dx + dy * dy) / radius) * 3);
          d[i] = r + (v - r) * edge;
          d[i + 1] = g * (1 - 0.15 * edge);
          d[i + 2] = b * (1 - 0.15 * edge);
          n++;
        }
      }
    }
    return n;
  }

  /* ════════════════ Geometry ════════════════ */

  /**
   * Turning a w×h picture by `angle` (radians): `expand` is the canvas that holds all of it,
   * `crop` the largest upright rectangle that is all picture (no empty corners).
   */
  function rotatedFit(w, h, angle) {
    const sin = Math.abs(Math.sin(angle)), cos = Math.abs(Math.cos(angle));
    const expand = { w: Math.ceil(w * cos + h * sin - 1e-6), h: Math.ceil(w * sin + h * cos - 1e-6) };
    let cw, ch;
    const longIsW = w >= h;
    const long = longIsW ? w : h, short = longIsW ? h : w;
    if (short <= 2 * sin * cos * long || Math.abs(sin - cos) < 1e-10) {
      const x = 0.5 * short;
      [cw, ch] = longIsW ? [x / sin, x / cos] : [x / cos, x / sin];
    } else {
      const cos2 = cos * cos - sin * sin;
      cw = (w * cos - h * sin) / cos2;
      ch = (h * cos - w * sin) / cos2;
    }
    return { expand, crop: { w: Math.max(1, Math.floor(cw + 1e-6)), h: Math.max(1, Math.floor(ch + 1e-6)) } };
  }

  /** The largest rectangle of aspect `ratio` (w/h; 0 = any) centred in w×h. */
  function ratioRect(w, h, ratio) {
    if (!(ratio > 0)) return { x: 0, y: 0, w, h };
    let rw = w, rh = Math.round(w / ratio);
    if (rh > h) { rh = h; rw = Math.round(h * ratio); }
    return { x: Math.round((w - rw) / 2), y: Math.round((h - rh) / 2), w: rw, h: rh };
  }

  return {
    make, copy,
    curveLUT, levelsValue, toneLUTs, toneIsIdentity, hsTable, applyTone, histogram, histogramAsync, autoLevels, suggestEnhance, suggestEnhanceAsync, previewEnhance, ENHANCE_TUNES, wbFromSample,
    invertMask, growMask, shrinkMask, featherMask, maskBounds, shiftMask, combineMasks,
    boxBlur, pixelate, blendByMask, inpaint, redEye, denoise,
    rotatedFit, ratioRect,
  };
}));
