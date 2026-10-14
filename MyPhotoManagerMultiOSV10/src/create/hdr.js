// Exposure fusion (Mertens, Kautz & Van Reeth 2007) and exposure alignment.
//  - fuseExposures: per-pixel weights from contrast (|Laplacian|), saturation
//    (RGB standard deviation) and well-exposedness (Gaussian around mid-gray),
//    blended with Laplacian pyramids so seams between exposures do not show
//  - alignExposures: translation-only alignment with median threshold bitmaps
//    (Ward 2003): exposure-invariant bitmaps compared on an image pyramid
// No HDR radiance map or tone mapping is needed; the result is a normal 8-bit image.

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Downsample a float plane: 5-tap binomial blur, then every other pixel. */
function reduce(src, w, h) {
  const nw = Math.max(1, (w + 1) >> 1);
  const nh = Math.max(1, (h + 1) >> 1);
  const k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
  const tmp = new Float32Array(nw * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < nw; x++) {
      const cx = 2 * x;
      let s = 0;
      for (let t = -2; t <= 2; t++) {
        let xx = cx + t;
        if (xx < 0) xx = -xx; else if (xx >= w) xx = Math.max(0, 2 * w - 2 - xx);
        s += k[t + 2] * src[row + xx];
      }
      tmp[y * nw + x] = s;
    }
  }
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const cy = 2 * y;
    for (let x = 0; x < nw; x++) {
      let s = 0;
      for (let t = -2; t <= 2; t++) {
        let yy = cy + t;
        if (yy < 0) yy = -yy; else if (yy >= h) yy = Math.max(0, 2 * h - 2 - yy);
        s += k[t + 2] * tmp[yy * nw + x];
      }
      out[y * nw + x] = s;
    }
  }
  return { data: out, width: nw, height: nh };
}

/** Upsample a coarse plane to w×h with bilinear interpolation. */
function expand(src, sw, sh, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let fy = (y + 0.5) / 2 - 0.5;
    if (fy < 0) fy = 0; if (fy > sh - 1) fy = sh - 1;
    const y0 = Math.floor(fy); const y1 = Math.min(sh - 1, y0 + 1); const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      let fx = (x + 0.5) / 2 - 0.5;
      if (fx < 0) fx = 0; if (fx > sw - 1) fx = sw - 1;
      const x0 = Math.floor(fx); const x1 = Math.min(sw - 1, x0 + 1); const tx = fx - x0;
      const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * w + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

function gaussianPyramid(plane, w, h, levels) {
  const out = [{ data: plane, width: w, height: h }];
  for (let i = 1; i < levels; i++) {
    const prev = out[i - 1];
    out.push(reduce(prev.data, prev.width, prev.height));
  }
  return out;
}

function laplacianPyramid(plane, w, h, levels) {
  const g = gaussianPyramid(plane, w, h, levels);
  for (let i = 0; i < levels - 1; i++) {
    const up = expand(g[i + 1].data, g[i + 1].width, g[i + 1].height, g[i].width, g[i].height);
    const d = g[i].data;
    const lap = new Float32Array(d.length);
    for (let p = 0; p < d.length; p++) lap[p] = d[p] - up[p];
    g[i] = { data: lap, width: g[i].width, height: g[i].height };
  }
  return g;
}

function collapse(pyr) {
  let cur = pyr[pyr.length - 1].data;
  for (let i = pyr.length - 2; i >= 0; i--) {
    const { width, height } = pyr[i];
    const up = expand(cur, pyr[i + 1].width, pyr[i + 1].height, width, height);
    const lap = pyr[i].data;
    for (let p = 0; p < up.length; p++) up[p] += lap[p];
    cur = up;
  }
  return cur;
}

/** Pyramid depth so the coarsest level is a few pixels across. */
const pyramidLevels = (w, h) => Math.max(1, Math.floor(Math.log2(Math.min(w, h))) - 1);

/** Mertens quality weight per pixel (unnormalized). */
function qualityWeights(image, { contrast, saturation, exposedness }) {
  const { width: w, height: h, data } = image;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) gray[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  const weights = new Float32Array(n);
  const sigma2 = 2 * 0.2 * 0.2;
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : Math.min(1, h - 1);
    const yp = y < h - 1 ? y + 1 : Math.max(0, h - 2);
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const xm = x > 0 ? x - 1 : Math.min(1, w - 1);
      const xp = x < w - 1 ? x + 1 : Math.max(0, w - 2);
      let weight = 1;
      if (contrast) {
        const lap = Math.abs(gray[y * w + xm] + gray[y * w + xp] + gray[ym * w + x] + gray[yp * w + x] - 4 * gray[p]);
        weight *= contrast === 1 ? lap : lap ** contrast;
      }
      const i = p * 4;
      const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
      if (saturation) {
        const mu = (r + g + b) / 3;
        const sd = Math.sqrt(((r - mu) ** 2 + (g - mu) ** 2 + (b - mu) ** 2) / 3);
        weight *= saturation === 1 ? sd : sd ** saturation;
      }
      if (exposedness) {
        const e = Math.exp(-((r - 0.5) ** 2 + (g - 0.5) ** 2 + (b - 0.5) ** 2) / sigma2);
        weight *= exposedness === 1 ? e : e ** exposedness;
      }
      weights[p] = weight + 1e-12;
    }
  }
  return weights;
}

/**
 * Fuse a bracketed exposure series (same size, aligned) into one image.
 *   contrast, saturation, exposedness: exponents of the three quality
 *   measures (0 disables a measure; 1 = paper defaults)
 * Returns an ImageData-like { width, height, data }.
 */
export function fuseExposures(images, { contrast = 1, saturation = 1, exposedness = 1 } = {}) {
  if (!images?.length) throw new Error('fuseExposures: no images');
  const { width: w, height: h } = images[0];
  for (const img of images) if (img.width !== w || img.height !== h) throw new Error('fuseExposures: images differ in size');
  const n = w * h;
  const weights = images.map((img) => qualityWeights(img, { contrast, saturation, exposedness }));
  // Normalize so the weights of every pixel sum to 1.
  for (let p = 0; p < n; p++) {
    let s = 0;
    for (const wt of weights) s += wt[p];
    if (s <= 0) { for (const wt of weights) wt[p] = 1 / weights.length; continue; }
    for (const wt of weights) wt[p] /= s;
  }
  const levels = pyramidLevels(w, h);
  const result = [null, null, null];
  for (let k = 0; k < images.length; k++) {
    const gw = gaussianPyramid(weights[k], w, h, levels);
    weights[k] = null;
    const { data } = images[k];
    for (let c = 0; c < 3; c++) {
      const plane = new Float32Array(n);
      for (let p = 0, i = c; p < n; p++, i += 4) plane[p] = data[i] / 255;
      const lp = laplacianPyramid(plane, w, h, levels);
      if (!result[c]) result[c] = lp.map((l) => ({ data: new Float32Array(l.data.length), width: l.width, height: l.height }));
      for (let l = 0; l < levels; l++) {
        const dst = result[c][l].data; const src = lp[l].data; const wt = gw[l].data;
        for (let p = 0; p < dst.length; p++) dst[p] += src[p] * wt[p];
      }
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let c = 0; c < 3; c++) {
    const plane = collapse(result[c]);
    for (let p = 0, i = c; p < n; p++, i += 4) out[i] = clamp255(Math.round(plane[p] * 255));
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { width: w, height: h, data: out };
}

// ---- Median threshold bitmap alignment -------------------------------------

/** Ward's gray: (54 R + 183 G + 19 B) / 256 as a Uint8Array plane. */
function mtbGray(image) {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = (54 * data[i] + 183 * data[i + 1] + 19 * data[i + 2]) >> 8;
  return { width, height, data: out };
}

function halveGray(plane) {
  const w = Math.max(1, plane.width >> 1);
  const h = Math.max(1, plane.height >> 1);
  const out = new Uint8Array(w * h);
  const sw = plane.width; const src = plane.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * sw + 2 * x;
      out[y * w + x] = (src[i] + src[i + 1] + src[i + sw] + src[i + sw + 1] + 2) >> 2;
    }
  }
  return { width: w, height: h, data: out };
}

/** Threshold bitmap (pixel > median) and exclusion bitmap (pixel far from median). */
function bitmaps(plane, noise = 4) {
  const hist = new Uint32Array(256);
  for (const v of plane.data) hist[v] += 1;
  let acc = 0; let median = 0;
  const half = plane.data.length / 2;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= half) { median = v; break; } }
  const tb = new Uint8Array(plane.data.length);
  const eb = new Uint8Array(plane.data.length);
  for (let p = 0; p < tb.length; p++) {
    const v = plane.data[p];
    tb[p] = v > median ? 1 : 0;
    eb[p] = Math.abs(v - median) > noise ? 1 : 0;
  }
  return { tb, eb, width: plane.width, height: plane.height };
}

/** Count of differing, non-excluded bits when b is sampled at (x + dx, y + dy). */
function bitmapError(a, b, dx, dy) {
  const { width: w, height: h } = a;
  const x0 = Math.max(0, -dx); const x1 = Math.min(w, w - dx);
  const y0 = Math.max(0, -dy); const y1 = Math.min(h, h - dy);
  let err = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    let ia = y * w + x0;
    let ib = (y + dy) * w + x0 + dx;
    for (let x = x0; x < x1; x++, ia++, ib++) {
      err += (a.tb[ia] ^ b.tb[ib]) & a.eb[ia] & b.eb[ib];
    }
    n += x1 - x0;
  }
  // Normalize by the compared area so large shifts are not favoured for touching fewer pixels.
  return n > 0 ? err / n : Infinity;
}

/**
 * Offset of `image` relative to `reference` by MTB: image(x + dx, y + dy) ≈ reference(x, y).
 * Searches up to ±maxShift pixels.
 */
export function mtbShift(reference, image, { maxShift = 32, noise = 4 } = {}) {
  const levels = Math.max(1, Math.ceil(Math.log2(maxShift + 1)));
  let ga = mtbGray(reference);
  let gb = mtbGray(image);
  const pa = [ga]; const pb = [gb];
  for (let i = 1; i < levels; i++) {
    if (Math.min(ga.width, ga.height) < 16) break;
    ga = halveGray(ga); gb = halveGray(gb);
    pa.push(ga); pb.push(gb);
  }
  let dx = 0; let dy = 0;
  for (let level = pa.length - 1; level >= 0; level--) {
    const a = bitmaps(pa[level], noise);
    const b = bitmaps(pb[level], noise);
    const r = 1;
    let best = Infinity; let bx = dx; let by = dy;
    for (let ty = dy - r; ty <= dy + r; ty++) {
      for (let tx = dx - r; tx <= dx + r; tx++) {
        const e = bitmapError(a, b, tx, ty);
        if (e < best) { best = e; bx = tx; by = ty; }
      }
    }
    dx = bx; dy = by;
    if (level > 0) { dx *= 2; dy *= 2; }
  }
  return { dx: Math.max(-maxShift, Math.min(maxShift, dx)), dy: Math.max(-maxShift, Math.min(maxShift, dy)) };
}

/** Image resampled at an integer offset: out(x, y) = image(x + dx, y + dy), edges clamped. */
export function shiftImage(image, dx, dy) {
  const { width: w, height: h, data } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h - 1, Math.max(0, y + dy));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, x + dx));
      const si = (sy * w + sx) * 4; const di = (y * w + x) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Align a series of differently exposed (or focused) shots of one scene by
 * translation. Image `reference` (default 0) stays put; each other image is
 * resampled so it lines up with it.
 * Returns { images, offsets: [{ dx, dy }] } with image(x + dx, y + dy) ≈ reference(x, y).
 */
export function alignExposures(images, { maxShift = 32, reference = 0, noise = 4 } = {}) {
  const ref = images[reference];
  const offsets = images.map((img, i) => (i === reference ? { dx: 0, dy: 0 } : mtbShift(ref, img, { maxShift, noise })));
  return {
    images: images.map((img, i) => (offsets[i].dx || offsets[i].dy ? shiftImage(img, offsets[i].dx, offsets[i].dy) : img)),
    offsets,
  };
}
