/* Pixel operations for the image editor: plain functions over { data, width, height }
 * (ImageData in the page, plain objects in the tests). Nothing here touches the DOM.
 *
 *   Tone      toneLUTs, curveLUT, applyTone (incl. vibrance), histogram, autoLevels, wbFromSample
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
  function histogram(img) {
    const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++;
      l[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
    }
    return { r, g, b, l };
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
  function autoLevels(img, clip = 0.005) {
    const h = histogram(img);
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
    curveLUT, levelsValue, toneLUTs, toneIsIdentity, hsTable, applyTone, histogram, autoLevels, wbFromSample,
    invertMask, growMask, shrinkMask, featherMask, maskBounds, shiftMask, combineMasks,
    boxBlur, pixelate, blendByMask, inpaint, redEye, denoise,
    rotatedFit, ratioRect,
  };
}));
