// Image processing, part 1: class conversions, colour spaces, image
// arithmetic, geometry (resize, rotate, crop, pad), intensity adjustment and
// histograms, noise, quality metrics.
import { tensor, toTensor, isTensor, isChar, isString, toStr, num, INT_RANGE, saturate } from '../../value.js';
import { IE, imgOf, toUnit, fromUnit, makeOut, dbl, classRange, isIntCls, quantize, mapToPalette } from './imgutil.js';

const isText = (v) => v != null && ((isChar(v) && v.dims[0] <= 1) || (isString(v) && v.data.length === 1));
const txt = (v) => (isText(v) ? toStr(v).toLowerCase() : null);
const numsOf = (v) => Array.from(toTensor(v).re);
const scalar = (v, d) => (v === undefined || (isTensor(v) && v.re.length === 0) ? d : toTensor(v).re[0]);
const isFloatCls = (c) => c === 'double' || c === 'single';

// ---------------------------------------------------------------- class conversion

function im2double(args) {
  const im = imgOf(args[0], 'im2double');
  if (txt(args[1]) === 'indexed') { const re = Float64Array.from(im.re); if (isIntCls(im.cls)) for (let i = 0; i < re.length; i++) re[i] += 1; return dbl(im.dims, re); }
  return dbl(im.dims, toUnit(im));
}
function im2single(args) {
  const im = imgOf(args[0], 'im2single');
  const re = txt(args[1]) === 'indexed' ? Float64Array.from(im.re, (x) => (isIntCls(im.cls) ? x + 1 : x)) : toUnit(im);
  return makeOut('single', im.dims, re);
}
function convTo(cls, fn) {
  return (args) => {
    const im = imgOf(args[0], fn);
    if (txt(args[1]) === 'indexed') {
      const re = Float64Array.from(im.re, (x) => (isFloatCls(im.cls) ? x - 1 : x));
      const [lo, hi] = INT_RANGE[cls];
      for (const x of re) if (x < lo || x > hi) throw IE(fn, 'tooManyColors', `Too many colors for an indexed ${cls} image.`);
      return makeOut(cls, im.dims, re);
    }
    if (im.cls === cls) return args[0];
    if (cls === 'uint16' && im.cls === 'uint8') return makeOut(cls, im.dims, Float64Array.from(im.re, (x) => x * 257));
    if (cls === 'uint8' && im.cls === 'uint16') return makeOut(cls, im.dims, Float64Array.from(im.re, (x) => x / 257));
    return fromUnit(toUnit(im), im.dims, cls);
  };
}
const im2uint8 = convTo('uint8', 'im2uint8');
const im2uint16 = convTo('uint16', 'im2uint16');
const im2int16 = convTo('int16', 'im2int16');

function mat2gray(args) {
  const im = imgOf(args[0], 'mat2gray');
  let lo, hi;
  if (args[1] && toTensor(args[1]).re.length >= 2) [lo, hi] = numsOf(args[1]);
  else { lo = Infinity; hi = -Infinity; for (const x of im.re) { if (x < lo) lo = x; if (x > hi) hi = x; } }
  const re = new Float64Array(im.re.length);
  for (let i = 0; i < re.length; i++) {
    const x = im.re[i];
    re[i] = hi === lo ? Math.min(1, Math.max(0, x)) : Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  }
  return dbl(im.dims, re);
}

function imcomplement(args) {
  const im = imgOf(args[0], 'imcomplement');
  const re = new Float64Array(im.re.length);
  if (im.cls === 'logical') for (let i = 0; i < re.length; i++) re[i] = im.re[i] ? 0 : 1;
  else if (isFloatCls(im.cls)) for (let i = 0; i < re.length; i++) re[i] = 1 - im.re[i];
  else { const [lo, hi] = classRange(im.cls); for (let i = 0; i < re.length; i++) re[i] = hi + lo - im.re[i]; }
  return makeOut(im.cls, im.dims, re);
}

// ---------------------------------------------------------------- arithmetic

function binaryOp(fn, op) {
  return (args) => {
    if (args.length < 2) throw IE(fn, 'notEnoughInputs', 'Not enough input arguments.');
    const a = toTensor(args[0]), b = toTensor(args[1]);
    const n = Math.max(a.re.length, b.re.length);
    if (a.re.length !== 1 && b.re.length !== 1 && a.re.length !== b.re.length) throw IE(fn, 'sizeMismatch', 'The images must have the same size, or one must be a scalar.');
    const dims = a.re.length >= b.re.length ? a.dims : b.dims;
    let cls = a.re.length === 1 && b.re.length > 1 && a.cls === 'double' ? b.cls : a.cls;
    if (cls === 'logical') cls = 'double';
    if (args[2] && isText(args[2])) cls = toStr(args[2]);
    const re = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = op(a.re[a.re.length === 1 ? 0 : i], b.re[b.re.length === 1 ? 0 : i]);
    return makeOut(cls, dims, re);
  };
}
const imadd = binaryOp('imadd', (x, y) => x + y);
const imsubtract = binaryOp('imsubtract', (x, y) => x - y);
const immultiply = binaryOp('immultiply', (x, y) => x * y);
const imdivide = binaryOp('imdivide', (x, y) => x / y);
const imabsdiff = binaryOp('imabsdiff', (x, y) => Math.abs(x - y));

function imlincomb(args) {
  let k = args.length;
  let cls = null;
  if (isText(args[k - 1])) { cls = toStr(args[k - 1]); k--; }
  const terms = [];
  let i = 0;
  for (; i + 1 < k; i += 2) terms.push([toTensor(args[i]).re[0], toTensor(args[i + 1])]);
  const off = i < k ? toTensor(args[i]).re[0] : 0;
  if (!terms.length) throw IE('imlincomb', 'notEnoughInputs', 'Expected scalar/image pairs.');
  const A0 = terms[0][1];
  const re = new Float64Array(A0.re.length).fill(off);
  for (const [s, A] of terms) { if (A.re.length !== re.length) throw IE('imlincomb', 'sizeMismatch', 'All images must have the same size.'); for (let q = 0; q < re.length; q++) re[q] += s * A.re[q]; }
  return makeOut(cls || (A0.cls === 'logical' ? 'double' : A0.cls), A0.dims, re);
}

// ---------------------------------------------------------------- colour

const GRAY_W = [0.298936021293775, 0.587043074451121, 0.114020904255103];

function rgb2gray(args) {
  const im = imgOf(args[0], 'rgb2gray');
  if (im.dims.length === 2 && im.w === 3 && isFloatCls(im.cls)) {
    // colormap
    const m = im.h; const re = new Float64Array(m * 3);
    for (let i = 0; i < m; i++) { const y = GRAY_W[0] * im.re[i] + GRAY_W[1] * im.re[i + m] + GRAY_W[2] * im.re[i + 2 * m]; re[i] = re[i + m] = re[i + 2 * m] = Math.min(1, Math.max(0, y)); }
    return dbl([m, 3], re);
  }
  if (im.dims.length !== 3 || im.dims[2] !== 3) throw IE('rgb2gray', 'invalidInput', 'Expected an M-by-N-by-3 truecolor image or an M-by-3 colormap.');
  const n = im.n; const re = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = GRAY_W[0] * im.re[i] + GRAY_W[1] * im.re[i + n] + GRAY_W[2] * im.re[i + 2 * n];
  return makeOut(im.cls, [im.h, im.w], re);
}
function im2gray(args) {
  const im = imgOf(args[0], 'im2gray');
  if (im.dims.length === 3 && im.dims[2] === 3) return rgb2gray(args);
  if (im.dims.length > 2) throw IE('im2gray', 'invalidInput', 'Expected a grayscale or truecolor image.');
  return args[0];
}

function splitRgb(v, fn) {
  const im = imgOf(v, fn);
  if (im.dims.length === 2 && im.w === 3) return { im, n: im.h, isMap: true, dims: [im.h, 3] };
  if (im.dims.length !== 3 || im.dims[2] !== 3) throw IE(fn, 'invalidInput', 'Expected an M-by-N-by-3 image or an M-by-3 colormap.');
  return { im, n: im.n, isMap: false, dims: im.dims };
}

function rgb2hsv(args) {
  const { im, n, dims } = splitRgb(args[0], 'rgb2hsv');
  const u = toUnit(im);
  const re = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const r = u[i], g = u[i + n], b = u[i + 2 * n];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = (g - b) / d; else if (mx === g) h = 2 + (b - r) / d; else h = 4 + (r - g) / d;
      h /= 6; if (h < 0) h += 1;
    }
    re[i] = h; re[i + n] = mx === 0 ? 0 : d / mx; re[i + 2 * n] = mx;
  }
  return makeOut(im.cls === 'single' ? 'single' : 'double', dims, re);
}
function hsv2rgb(args) {
  const { im, n, dims } = splitRgb(args[0], 'hsv2rgb');
  const re = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    let h = im.re[i], s = im.re[i + n]; const v = im.re[i + 2 * n];
    h = (h - Math.floor(h)) * 6; s = Math.min(1, Math.max(0, s));
    const k = Math.floor(h) % 6, f = h - Math.floor(h);
    const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][k];
    re[i] = r; re[i + n] = g; re[i + 2 * n] = b;
  }
  return makeOut(im.cls === 'single' ? 'single' : 'double', dims, re);
}

const YCC_T = [[65.481, 128.553, 24.966], [-37.797, -74.203, 112], [112, -93.786, -18.214]];
const YCC_OFF = [16, 128, 128];
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
const YCC_TI = inv3(YCC_T);
function rgb2ycbcr(args) {
  const { im, n, dims } = splitRgb(args[0], 'rgb2ycbcr');
  const u = toUnit(im);
  const re = new Float64Array(3 * n);
  const scale = im.cls === 'uint16' ? 257 : 1;
  for (let i = 0; i < n; i++) {
    const r = u[i], g = u[i + n], b = u[i + 2 * n];
    for (let k = 0; k < 3; k++) {
      const v = YCC_T[k][0] * r + YCC_T[k][1] * g + YCC_T[k][2] * b + YCC_OFF[k];
      re[i + k * n] = isFloatCls(im.cls) ? v / 255 : v * scale;
    }
  }
  return makeOut(im.cls === 'logical' ? 'double' : im.cls, dims, re);
}
function ycbcr2rgb(args) {
  const { im, n, dims } = splitRgb(args[0], 'ycbcr2rgb');
  const re = new Float64Array(3 * n);
  const div = im.cls === 'uint16' ? 257 : 1;
  for (let i = 0; i < n; i++) {
    const y = [0, 1, 2].map((k) => (isFloatCls(im.cls) ? im.re[i + k * n] * 255 : im.re[i + k * n] / div) - YCC_OFF[k]);
    for (let k = 0; k < 3; k++) {
      const v = YCC_TI[k][0] * y[0] + YCC_TI[k][1] * y[1] + YCC_TI[k][2] * y[2];
      re[i + k * n] = isFloatCls(im.cls) ? Math.min(1, Math.max(0, v)) : v * (im.cls === 'uint16' ? 65535 : 255);
    }
  }
  return makeOut(im.cls, dims, re);
}

function mapOf(v, fn) {
  const t = toTensor(v);
  if (t.dims.length !== 2 || t.dims[1] !== 3) throw IE(fn, 'badMap', 'The colormap must be an M-by-3 array.');
  return { m: t.dims[0], re: t.re };
}
function ind2rgb(args) {
  const im = imgOf(args[0], 'ind2rgb');
  const { m, re: mp } = mapOf(args[1], 'ind2rgb');
  const off = isFloatCls(im.cls) ? 1 : 0;
  const n = im.re.length;
  const re = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    let k = Math.floor(im.re[i]) - off; if (k < 0) k = 0; if (k >= m) k = m - 1;
    for (let c = 0; c < 3; c++) re[i + c * n] = mp[k + c * m];
  }
  return dbl([...im.dims.slice(0, 2), 3], re);
}
function ind2gray(args) {
  const im = imgOf(args[0], 'ind2gray');
  const { m, re: mp } = mapOf(args[1], 'ind2gray');
  const off = isFloatCls(im.cls) ? 1 : 0;
  const re = new Float64Array(im.re.length);
  for (let i = 0; i < re.length; i++) {
    let k = Math.floor(im.re[i]) - off; if (k < 0) k = 0; if (k >= m) k = m - 1;
    re[i] = GRAY_W[0] * mp[k] + GRAY_W[1] * mp[k + m] + GRAY_W[2] * mp[k + 2 * m];
  }
  return isFloatCls(im.cls) ? dbl(im.dims, re) : fromUnit(re, im.dims, im.cls);
}
function grayMap(n) { const re = new Float64Array(n * 3); for (let i = 0; i < n; i++) re[i] = re[i + n] = re[i + 2 * n] = n === 1 ? 0 : i / (n - 1); return dbl([n, 3], re); }
function gray2ind(args, nargout) {
  const im = imgOf(args[0], 'gray2ind');
  const n = Math.round(scalar(args[1], im.cls === 'logical' ? 2 : 64));
  if (n < 1 || n > 65536) throw IE('gray2ind', 'badN', 'N must be between 1 and 65536.');
  const u = toUnit(im);
  const re = Float64Array.from(u, (x) => Math.round(Math.min(1, Math.max(0, x)) * (n - 1)));
  return [makeOut(n <= 256 ? 'uint8' : 'uint16', im.dims, re), grayMap(n)];
}
function rgb2ind(args, nargout) {
  const im = imgOf(args[0], 'rgb2ind');
  if (im.dims.length !== 3 || im.dims[2] !== 3) throw IE('rgb2ind', 'invalidInput', 'Expected an M-by-N-by-3 truecolor image.');
  const n = im.n;
  const u = toUnit(im);
  const rgb = new Uint8Array(3 * n);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const s = y + x * im.h, d = (y * im.w + x) * 3; for (let k = 0; k < 3; k++) rgb[d + k] = Math.round(Math.min(1, Math.max(0, u[s + k * n])) * 255); }
  let palette, idx;
  const a1 = args[1];
  if (a1 === undefined || isText(a1)) { const q = quantize(rgb, n, 65536); palette = q.palette; idx = q.indices; } else {
    const t = toTensor(a1);
    if (t.dims.length === 2 && t.dims[1] === 3 && t.dims[0] > 0) {
      const m = t.dims[0]; palette = new Uint8Array(m * 3);
      for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) palette[3 * i + k] = Math.round(Math.min(1, Math.max(0, t.re[i + k * m])) * 255);
      idx = mapToPalette(rgb, n, palette);
    } else {
      const v = t.re[0];
      if (v < 1) {
        // uniform quantization with tolerance v
        const q = Math.max(2, Math.round(1 / v) + 1);
        palette = new Uint8Array(q * q * q * 3);
        let p = 0;
        for (let b = 0; b < q; b++) for (let g = 0; g < q; g++) for (let r = 0; r < q; r++) { palette[p++] = Math.round((r * 255) / (q - 1)); palette[p++] = Math.round((g * 255) / (q - 1)); palette[p++] = Math.round((b * 255) / (q - 1)); }
        idx = new Uint16Array(n);
        for (let i = 0; i < n; i++) { const r = Math.round((rgb[3 * i] * (q - 1)) / 255), g = Math.round((rgb[3 * i + 1] * (q - 1)) / 255), b = Math.round((rgb[3 * i + 2] * (q - 1)) / 255); idx[i] = r + g * q + b * q * q; }
      } else { const q = quantize(rgb, n, Math.max(1, Math.round(v))); palette = q.palette; idx = q.indices; }
    }
  }
  const m = palette.length / 3;
  const X = new Float64Array(n);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) X[y + x * im.h] = idx[y * im.w + x];
  const mapRe = new Float64Array(m * 3);
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) mapRe[i + k * m] = palette[3 * i + k] / 255;
  return [makeOut(m <= 256 ? 'uint8' : 'uint16', [im.h, im.w], X), dbl([m, 3], mapRe)];
}

// ---------------------------------------------------------------- geometry

const KERNELS = {
  nearest: { f: (x) => (x >= -0.5 && x < 0.5 ? 1 : 0), w: 1 },
  box: { f: (x) => (x >= -0.5 && x < 0.5 ? 1 : 0), w: 1 },
  bilinear: { f: (x) => { const a = Math.abs(x); return a <= 1 ? 1 - a : 0; }, w: 2 },
  triangle: { f: (x) => { const a = Math.abs(x); return a <= 1 ? 1 - a : 0; }, w: 2 },
  bicubic: { f: cubic, w: 4 },
  cubic: { f: cubic, w: 4 },
  lanczos2: { f: (x) => lanczos(x, 2), w: 4 },
  lanczos3: { f: (x) => lanczos(x, 3), w: 6 },
};
function cubic(x) {
  const a = Math.abs(x), a2 = a * a, a3 = a2 * a;
  return a <= 1 ? 1.5 * a3 - 2.5 * a2 + 1 : a <= 2 ? -0.5 * a3 + 2.5 * a2 - 4 * a + 2 : 0;
}
function sinc(x) { if (x === 0) return 1; const p = Math.PI * x; return Math.sin(p) / p; }
function lanczos(x, a) { return Math.abs(x) < a ? sinc(x) * sinc(x / a) : 0; }

function contributions(inLen, outLen, scale, K, antialias) {
  let h = K.f, kw = K.w;
  if (scale < 1 && antialias) { h = (x) => scale * K.f(scale * x); kw = K.w / scale; }
  const P = Math.ceil(kw) + 2;
  const idx = new Int32Array(outLen * P), wts = new Float64Array(outLen * P);
  for (let u = 1; u <= outLen; u++) {
    const x = u / scale + 0.5 * (1 - 1 / scale);
    const left = Math.floor(x - kw / 2);
    let sum = 0;
    for (let j = 0; j < P; j++) { const w = h(x - (left + j)); wts[(u - 1) * P + j] = w; sum += w; }
    for (let j = 0; j < P; j++) {
      wts[(u - 1) * P + j] = sum ? wts[(u - 1) * P + j] / sum : 0;
      let k = left + j - 1; // 0-based
      const L = 2 * inLen; k = ((k % L) + L) % L; if (k >= inLen) k = L - 1 - k;
      idx[(u - 1) * P + j] = k;
    }
  }
  return { idx, wts, P };
}

function resizeDim(re, dims, dim, outLen, scale, K, antialias) {
  const inLen = dims[dim];
  const { idx, wts, P } = contributions(inLen, outLen, scale, K, antialias);
  const nd = dims.slice(); nd[dim] = outLen;
  let stride = 1; for (let i = 0; i < dim; i++) stride *= dims[i];
  let outer = 1; for (let i = dim + 1; i < dims.length; i++) outer *= dims[i];
  const out = new Float64Array(stride * outLen * outer);
  for (let o = 0; o < outer; o++) {
    for (let u = 0; u < outLen; u++) {
      for (let s = 0; s < stride; s++) {
        let acc = 0;
        for (let j = 0; j < P; j++) { const w = wts[u * P + j]; if (w) acc += w * re[s + idx[u * P + j] * stride + o * stride * inLen]; }
        out[s + u * stride + o * stride * outLen] = acc;
      }
    }
  }
  return { re: out, dims: nd };
}

function imresize(args) {
  if (args.length < 2) throw IE('imresize', 'notEnoughInputs', 'Not enough input arguments.');
  const im = imgOf(args[0], 'imresize');
  let i = 1, scaleArg = null, method = 'bicubic', antialias = true;
  if (!isText(args[1])) { scaleArg = numsOf(args[1]); i = 2; }
  if (args[i] && isText(args[i]) && KERNELS[txt(args[i])]) { method = txt(args[i]); i++; }
  for (; i + 1 < args.length; i += 2) {
    const k = txt(args[i]);
    if (k === 'method') method = txt(args[i + 1]);
    else if (k === 'antialiasing') antialias = toTensor(args[i + 1]).re[0] !== 0;
    else if (k === 'scale') scaleArg = numsOf(args[i + 1]);
    else if (k === 'outputsize') scaleArg = { size: numsOf(args[i + 1]) };
    else throw IE('imresize', 'unknownOption', `Unknown option '${toStr(args[i])}'.`);
  }
  if (i < args.length) throw IE('imresize', 'badOption', 'Unknown option or interpolation method.');
  if (!KERNELS[method]) throw IE('imresize', 'badMethod', `Unknown interpolation method '${method}'.`);
  if (method === 'nearest') antialias = false;
  const [h, w] = [im.h, im.w];
  let oh, ow, sh, sw;
  const size = scaleArg && !Array.isArray(scaleArg) ? scaleArg.size : scaleArg && scaleArg.length === 2 ? scaleArg : null;
  if (size) {
    [oh, ow] = size;
    if (Number.isNaN(oh) && Number.isNaN(ow)) throw IE('imresize', 'badSize', 'Only one output size element may be NaN.');
    if (Number.isNaN(oh)) { sw = ow / w; sh = sw; oh = Math.ceil(h * sh); } else if (Number.isNaN(ow)) { sh = oh / h; sw = sh; ow = Math.ceil(w * sw); } else { sh = oh / h; sw = ow / w; }
  } else {
    const s = scaleArg[0];
    if (!(s > 0)) throw IE('imresize', 'badScale', 'The scale must be positive.');
    sh = sw = s; oh = Math.ceil(h * s); ow = Math.ceil(w * s);
  }
  const K = KERNELS[method];
  let cur = { re: toUnitOrRaw(im), dims: im.dims.length > 2 ? [h, w, im.c] : [h, w] };
  const order = sh <= sw ? [0, 1] : [1, 0];
  for (const d of order) cur = resizeDim(cur.re, cur.dims, d, d === 0 ? oh : ow, d === 0 ? sh : sw, K, antialias);
  if (im.cls === 'logical') return makeOut('logical', cur.dims, Float64Array.from(cur.re, (x) => (x > 0.5 ? 1 : 0)));
  return makeOut(im.cls, cur.dims, cur.re);
}
const toUnitOrRaw = (im) => (im.cls === 'logical' ? Float64Array.from(im.re) : Float64Array.from(im.re));

function sampler(im, method) {
  const { h, w, re } = im;
  const at = (c, y, x) => (y < 0 || y >= h || x < 0 || x >= w ? null : re[y + x * h + c * h * w]);
  if (method === 'nearest') return (c, y, x) => { const v = at(c, Math.round(y), Math.round(x)); return v === null ? 0 : v; };
  if (method === 'bilinear') {
    return (c, y, x) => {
      if (y < -0.5 || y > h - 0.5 || x < -0.5 || x > w - 0.5) return 0;
      const y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
      let s = 0, ws = 0;
      for (const [yy, wy] of [[y0, 1 - fy], [y0 + 1, fy]]) for (const [xx, wx] of [[x0, 1 - fx], [x0 + 1, fx]]) { const v = at(c, yy, xx); const ww = wy * wx; if (v !== null) { s += v * ww; } ws += ww; }
      return ws ? s : 0;
    };
  }
  return (c, y, x) => {
    if (y < -0.5 || y > h - 0.5 || x < -0.5 || x > w - 0.5) return 0;
    const y0 = Math.floor(y), x0 = Math.floor(x);
    let s = 0;
    for (let j = -1; j <= 2; j++) { const wy = cubic(y - (y0 + j)); if (!wy) continue; for (let i = -1; i <= 2; i++) { const wx = cubic(x - (x0 + i)); if (!wx) continue; const yy = Math.min(h - 1, Math.max(0, y0 + j)), xx = Math.min(w - 1, Math.max(0, x0 + i)); s += wy * wx * re[yy + xx * h + c * h * w]; } }
    return s;
  };
}

function imrotate(args) {
  if (args.length < 2) throw IE('imrotate', 'notEnoughInputs', 'Not enough input arguments.');
  const im = imgOf(args[0], 'imrotate');
  const ang = toTensor(args[1]).re[0];
  let method = 'nearest', bbox = 'loose';
  for (const a of args.slice(2)) { const s = txt(a); if (['nearest', 'bilinear', 'bicubic'].includes(s)) method = s; else if (s === 'crop' || s === 'loose') bbox = s; else throw IE('imrotate', 'badOption', `Unknown option '${s}'.`); }
  const { h, w, c } = im;
  const k = ((Math.round(ang / 90) % 4) + 4) % 4;
  const extra = im.dims.length > 2 ? [c] : [];
  if (Math.abs(ang / 90 - Math.round(ang / 90)) < 1e-12 && (bbox === 'loose' || k % 2 === 0 || h === w)) {
    const oh = k % 2 ? w : h, ow = k % 2 ? h : w;
    const re = new Float64Array(im.re.length);
    for (let ch = 0; ch < c; ch++) for (let x = 0; x < ow; x++) for (let y = 0; y < oh; y++) {
      let sy, sx;
      if (k === 0) { sy = y; sx = x; } else if (k === 1) { sy = x; sx = w - 1 - y; } else if (k === 2) { sy = h - 1 - y; sx = w - 1 - x; } else { sy = h - 1 - x; sx = y; }
      re[y + x * oh + ch * oh * ow] = im.re[sy + sx * h + ch * h * w];
    }
    return makeOut(im.cls, [oh, ow, ...extra], re);
  }
  const t = (ang * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  let oh = h, ow = w;
  if (bbox === 'loose') { oh = Math.ceil(Math.abs(h * cs) + Math.abs(w * sn) - 1e-9); ow = Math.ceil(Math.abs(w * cs) + Math.abs(h * sn) - 1e-9); }
  const S = sampler(im, method);
  const icy = (h - 1) / 2, icx = (w - 1) / 2, ocy = (oh - 1) / 2, ocx = (ow - 1) / 2;
  const re = new Float64Array(oh * ow * c);
  for (let ch = 0; ch < c; ch++) for (let x = 0; x < ow; x++) for (let y = 0; y < oh; y++) {
    const dx = x - ocx, dy = y - ocy;
    const sx = icx + dx * cs - dy * sn, sy = icy + dx * sn + dy * cs;
    re[y + x * oh + ch * oh * ow] = S(ch, sy, sx);
  }
  return makeOut(im.cls, [oh, ow, ...extra], re);
}

function imcrop(args, nargout) {
  let A = args[0], i = 1, map = null;
  if (args.length >= 3) { map = args[1]; i = 2; }
  if (args[i] === undefined) throw IE('imcrop', 'noRect', 'Interactive cropping is not available; pass a rectangle [xmin ymin width height].');
  const rect = numsOf(args[i]);
  if (rect.length !== 4) throw IE('imcrop', 'badRect', 'The rectangle must be [xmin ymin width height].');
  const im = imgOf(A, 'imcrop');
  const [xmin, ymin, wd, ht] = rect;
  const r1 = Math.max(1, Math.round(ymin)), r2 = Math.min(im.h, Math.round(ymin + ht));
  const c1 = Math.max(1, Math.round(xmin)), c2 = Math.min(im.w, Math.round(xmin + wd));
  const oh = Math.max(0, r2 - r1 + 1), ow = Math.max(0, c2 - c1 + 1);
  const re = new Float64Array(oh * ow * im.c);
  for (let ch = 0; ch < im.c; ch++) for (let x = 0; x < ow; x++) for (let y = 0; y < oh; y++) re[y + x * oh + ch * oh * ow] = im.re[(r1 - 1 + y) + (c1 - 1 + x) * im.h + ch * im.n];
  const out = tensor(im.cls, im.dims.length > 2 ? [oh, ow, ...im.dims.slice(2)] : [oh, ow], re);
  void map;
  return nargout > 1 ? [out, tensor('double', [1, 4], rect)] : out;
}

/** padarray(A, padsize, padval|method, direction) for N-D arrays. */
function padarray(args) {
  if (args.length < 2) throw IE('padarray', 'notEnoughInputs', 'Not enough input arguments.');
  const t = toTensor(args[0]);
  const pad = numsOf(args[1]);
  let method = 'constant', val = 0, dir = 'both';
  for (const a of args.slice(2)) {
    const s = txt(a);
    if (s === null) { val = toTensor(a).re[0]; method = 'constant'; } else if (['circular', 'replicate', 'symmetric'].includes(s)) method = s;
    else if (['both', 'pre', 'post'].includes(s)) dir = s;
    else throw IE('padarray', 'badOption', `Unknown option '${toStr(a)}'.`);
  }
  for (const p of pad) if (!(p >= 0) || !Number.isInteger(p)) throw IE('padarray', 'badPadSize', 'PADSIZE must contain nonnegative integers.');
  const nd = Math.max(t.dims.length, pad.length);
  const din = Array.from({ length: nd }, (_, k) => t.dims[k] ?? 1);
  const pre = din.map((_, k) => (dir === 'post' ? 0 : pad[k] || 0));
  const post = din.map((_, k) => (dir === 'pre' ? 0 : pad[k] || 0));
  const dout = din.map((d, k) => d + pre[k] + post[k]);
  const total = dout.reduce((a, b) => a * b, 1);
  const re = new Float64Array(total);
  const im = t.im ? new Float64Array(total) : null;
  const sub = new Array(nd).fill(0);
  for (let li = 0; li < total; li++) {
    let rem = li, src = 0, mul = 1, inside = true;
    for (let k = 0; k < nd; k++) {
      sub[k] = rem % dout[k]; rem = Math.floor(rem / dout[k]);
      let s = sub[k] - pre[k];
      const n = din[k];
      if (s < 0 || s >= n) {
        if (method === 'constant' || n === 0) { inside = false; } else if (method === 'replicate') s = s < 0 ? 0 : n - 1;
        else if (method === 'circular') s = ((s % n) + n) % n;
        else { const L = 2 * n; s = ((s % L) + L) % L; if (s >= n) s = L - 1 - s; }
      }
      src += s * mul; mul *= n;
    }
    if (inside) { re[li] = t.re[src]; if (im) im[li] = t.im[src]; } else re[li] = val;
  }
  return makeOut(t.cls, dout, re);
}

// ---------------------------------------------------------------- intensity

function binsFor(cls, n) {
  const [lo, hi] = isFloatCls(cls) ? [0, 1] : cls === 'logical' ? [0, 1] : classRange(cls);
  return { lo, hi, n };
}

function histCounts(im, n) {
  const { lo, hi } = binsFor(im.cls, n);
  const counts = new Float64Array(n);
  const sc = (n - 1) / (hi - lo);
  for (const v of im.re) {
    if (Number.isNaN(v)) continue;
    let k = Math.round((v - lo) * sc); if (k < 0) k = 0; if (k >= n) k = n - 1;
    counts[k]++;
  }
  return { counts, lo, hi };
}

function imhist(args, nargout) {
  const im = imgOf(args[0], 'imhist');
  const n = Math.round(scalar(args[1], im.cls === 'logical' ? 2 : 256));
  const { counts, lo, hi } = histCounts(im, n);
  const x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = n === 1 ? lo : lo + ((hi - lo) * i) / (n - 1);
  return [dbl([n, 1], counts), dbl([n, 1], x)];
}

function stretchlimJS(im, tol) {
  const nb = im.cls === 'uint8' || im.cls === 'logical' ? 256 : 65536;
  const lims = [];
  for (let c = 0; c < im.c; c++) {
    const ch = { cls: im.cls, re: im.re.subarray(c * im.n, (c + 1) * im.n) };
    const { counts } = histCounts(ch, nb);
    let cum = 0; const total = im.n;
    let lowI = -1, highI = -1;
    for (let k = 0; k < nb; k++) { cum += counts[k] / total; if (lowI < 0 && cum > tol[0]) lowI = k; if (highI < 0 && cum >= tol[1]) highI = k; }
    let lo = lowI / (nb - 1), hi = highI / (nb - 1);
    if (lo >= hi) { lo = 0; hi = 1; }
    lims.push([lo, hi]);
  }
  return lims;
}
function stretchlim(args) {
  const im = imgOf(args[0], 'stretchlim');
  let tol = [0.01, 0.99];
  if (args[1]) { const t = numsOf(args[1]); tol = t.length === 1 ? [t[0], 1 - t[0]] : [t[0], t[1]]; }
  const L = stretchlimJS(im, tol);
  const re = new Float64Array(2 * L.length);
  L.forEach(([a, b], c) => { re[2 * c] = a; re[2 * c + 1] = b; });
  return dbl([2, L.length], re);
}

function imadjust(args) {
  const im = imgOf(args[0], 'imadjust');
  const C = im.c;
  const lim = (v, def) => {
    if (v === undefined || (isTensor(v) && v.re.length === 0)) return def;
    const t = toTensor(v);
    if (t.re.length === 2) return Array.from({ length: C }, () => [t.re[0], t.re[1]]);
    if (t.re.length === 2 * C) return Array.from({ length: C }, (_, c) => [t.re[2 * c], t.re[2 * c + 1]]);
    throw IE('imadjust', 'badLimits', 'Limits must be a 2-element vector or a 2-by-3 matrix.');
  };
  const inL = lim(args[1], stretchlimJS(im, [0.01, 0.99]));
  const outL = lim(args[2], Array.from({ length: C }, () => [0, 1]));
  const gam = args[3] ? numsOf(args[3]) : [1];
  const u = toUnit(im);
  const re = new Float64Array(u.length);
  for (let c = 0; c < C; c++) {
    const [li, hi] = inL[c], [lo, ho] = outL[c], g = gam[Math.min(c, gam.length - 1)];
    for (let i = c * im.n; i < (c + 1) * im.n; i++) {
      let x = (Math.min(hi, Math.max(li, u[i])) - li) / (hi - li || 1);
      re[i] = lo + (ho - lo) * Math.pow(x, g);
    }
  }
  return fromUnit(re, im.dims, im.cls);
}

function histeq(args, nargout) {
  const im = imgOf(args[0], 'histeq');
  let target;
  if (args[1] && toTensor(args[1]).re.length > 1) target = numsOf(args[1]);
  else { const n = Math.round(scalar(args[1], 64)); target = new Array(n).fill(1); }
  const n = target.length;
  const nin = 256;
  const { counts } = histCounts({ cls: im.cls, re: im.re }, nin);
  const total = im.re.length;
  const tsum = target.reduce((a, b) => a + b, 0);
  const cumT = []; let s = 0; for (const t of target) { s += (t * total) / tsum; cumT.push(s); }
  const T = new Float64Array(nin);
  let cum = 0;
  for (let k = 0; k < nin; k++) {
    cum += counts[k];
    let best = 0, bd = Infinity;
    for (let j = 0; j < n; j++) { const d = Math.abs(cumT[j] - cum); if (d < bd - 1e-9) { bd = d; best = j; } }
    T[k] = n === 1 ? 0 : best / (n - 1);
  }
  const { lo, hi } = binsFor(im.cls, nin);
  const u = new Float64Array(im.re.length);
  for (let i = 0; i < u.length; i++) { let k = Math.round(((im.re[i] - lo) * (nin - 1)) / (hi - lo)); if (k < 0) k = 0; if (k > nin - 1) k = nin - 1; u[i] = T[k]; }
  const J = fromUnit(u, im.dims, im.cls);
  return nargout > 1 ? [J, dbl([1, nin], T)] : J;
}

// ---------------------------------------------------------------- noise and metrics

function randn() { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
function poisson(lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 50) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * randn()));
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function imnoise(args) {
  const im = imgOf(args[0], 'imnoise');
  const type = txt(args[1]) || 'gaussian';
  const u = toUnit(im);
  const re = new Float64Array(u.length);
  if (type === 'gaussian') {
    const m = scalar(args[2], 0), v = scalar(args[3], 0.01);
    for (let i = 0; i < u.length; i++) re[i] = u[i] + m + Math.sqrt(v) * randn();
  } else if (type === 'salt & pepper' || type === 'salt and pepper') {
    const d = scalar(args[2], 0.05);
    for (let i = 0; i < u.length; i++) { const r = Math.random(); re[i] = r < d / 2 ? 0 : r < d ? 1 : u[i]; }
  } else if (type === 'speckle') {
    const v = scalar(args[2], 0.05);
    for (let i = 0; i < u.length; i++) re[i] = u[i] + Math.sqrt(12 * v) * u[i] * (Math.random() - 0.5);
  } else if (type === 'poisson') {
    const scale = im.cls === 'uint8' ? 255 : im.cls === 'uint16' ? 65535 : 1e12;
    for (let i = 0; i < u.length; i++) re[i] = poisson(u[i] * scale) / scale;
  } else if (type === 'localvar') {
    const V = toTensor(args[2]).re;
    for (let i = 0; i < u.length; i++) re[i] = u[i] + Math.sqrt(V[V.length === 1 ? 0 : i % V.length]) * randn();
  } else throw IE('imnoise', 'badType', `Unknown noise type '${type}'.`);
  for (let i = 0; i < re.length; i++) re[i] = Math.min(1, Math.max(0, re[i]));
  return fromUnit(re, im.dims, im.cls === 'logical' ? 'double' : im.cls);
}

function immse(args) {
  const a = toTensor(args[0]), b = toTensor(args[1]);
  if (a.re.length !== b.re.length) throw IE('immse', 'sizeMismatch', 'The images must have the same size.');
  let s = 0; for (let i = 0; i < a.re.length; i++) { const d = a.re[i] - b.re[i]; s += d * d; }
  return num(s / a.re.length);
}
function psnr(args, nargout) {
  const a = toTensor(args[0]), b = toTensor(args[1]);
  if (a.re.length !== b.re.length) throw IE('psnr', 'sizeMismatch', 'The images must have the same size.');
  const peak = args[2] ? toTensor(args[2]).re[0] : isFloatCls(a.cls) || a.cls === 'logical' ? 1 : classRange(a.cls)[1] - classRange(a.cls)[0];
  let s = 0; for (let i = 0; i < a.re.length; i++) { const d = a.re[i] - b.re[i]; s += d * d; }
  const mse = s / a.re.length;
  const p = 10 * Math.log10((peak * peak) / mse);
  let r2 = 0; for (const v of b.re) r2 += v * v;
  return nargout > 1 ? [num(p), num(10 * Math.log10(r2 / s))] : num(p);
}
function entropy(args) {
  const im = imgOf(args[0], 'entropy');
  const u8 = im.cls === 'logical' ? { cls: 'logical', re: im.re } : { cls: 'uint8', re: fromUnit(toUnit(im), im.dims, 'uint8').re };
  const n = im.cls === 'logical' ? 2 : 256;
  const { counts } = histCounts(u8, n);
  let e = 0; const total = im.re.length;
  for (const c of counts) if (c) { const p = c / total; e -= p * Math.log2(p); }
  return num(e);
}

// ---------------------------------------------------------------- exports

export const builtins = {
  im2double, im2single, im2uint8, im2uint16, im2int16, mat2gray, imcomplement,
  imadd, imsubtract, immultiply, imdivide, imabsdiff, imlincomb,
  rgb2gray, im2gray, rgb2hsv, hsv2rgb, rgb2ycbcr, ycbcr2rgb, ind2rgb, ind2gray, gray2ind, rgb2ind,
  imresize, imrotate, imcrop, padarray,
  imhist, stretchlim, imadjust, histeq,
  imnoise, immse, psnr, entropy,
};
void saturate;

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  im2double: H('Convert an image to double precision (values scaled to [0, 1]).', '이미지를 double 형으로 변환합니다(값을 [0, 1] 로 조정).', ['I2 = im2double(I)', 'I2 = im2double(X, \'indexed\')']),
  im2single: H('Convert an image to single precision (values scaled to [0, 1]).', '이미지를 single 형으로 변환합니다(값을 [0, 1] 로 조정).', ['I2 = im2single(I)', 'I2 = im2single(X, \'indexed\')']),
  im2uint8: H('Convert an image to 8-bit unsigned integers, rescaling as needed.', '이미지를 8비트 부호 없는 정수로 변환하고 값 범위를 맞춥니다.', ['J = im2uint8(I)', 'J = im2uint8(X, \'indexed\')']),
  im2uint16: H('Convert an image to 16-bit unsigned integers, rescaling as needed.', '이미지를 16비트 부호 없는 정수로 변환하고 값 범위를 맞춥니다.', ['J = im2uint16(I)', 'J = im2uint16(X, \'indexed\')']),
  im2int16: H('Convert an image to 16-bit signed integers, rescaling as needed.', '이미지를 16비트 부호 있는 정수로 변환하고 값 범위를 맞춥니다.', ['J = im2int16(I)']),
  mat2gray: H('Scale a matrix to the intensity range [0, 1].', '행렬을 밝기 범위 [0, 1] 로 조정합니다.', ['I = mat2gray(A)', 'I = mat2gray(A, [amin amax])']),
  imcomplement: H('Complement (negative) of an image.', '이미지의 보수(반전)를 구합니다.', ['J = imcomplement(I)']),
  imadd: H('Add two images or an image and a constant, saturating to the class range.', '두 이미지(또는 이미지와 상수)를 더하고 형 범위로 포화시킵니다.', ['Z = imadd(X, Y)', 'Z = imadd(X, Y, outputClass)']),
  imsubtract: H('Subtract an image or a constant from an image, saturating to the class range.', '이미지에서 이미지 또는 상수를 빼고 형 범위로 포화시킵니다.', ['Z = imsubtract(X, Y)']),
  immultiply: H('Multiply two images or an image by a constant, saturating to the class range.', '두 이미지(또는 이미지와 상수)를 곱하고 형 범위로 포화시킵니다.', ['Z = immultiply(X, Y)']),
  imdivide: H('Divide an image by an image or a constant, rounding and saturating.', '이미지를 이미지 또는 상수로 나누고 반올림·포화시킵니다.', ['Z = imdivide(X, Y)']),
  imabsdiff: H('Absolute difference of two images.', '두 이미지의 차의 절댓값을 구합니다.', ['Z = imabsdiff(X, Y)']),
  imlincomb: H('Linear combination of images: K1*A1 + K2*A2 + ... + K.', '이미지의 선형 결합 K1*A1 + K2*A2 + ... + K 를 구합니다.', ['Z = imlincomb(K1, A1, K2, A2, ...)', 'Z = imlincomb(..., K)', 'Z = imlincomb(..., outputClass)']),
  rgb2gray: H('Convert a truecolor image or a colormap to grayscale.', '트루컬러 이미지나 컬러맵을 회색조로 변환합니다.', ['I = rgb2gray(RGB)', 'newmap = rgb2gray(map)']),
  im2gray: H('Convert an image to grayscale; grayscale input is returned unchanged.', '이미지를 회색조로 변환합니다. 이미 회색조이면 그대로 돌려줍니다.', ['I = im2gray(A)']),
  rgb2hsv: H('Convert RGB colours to HSV (hue, saturation, value).', 'RGB 색을 HSV(색상, 채도, 명도)로 변환합니다.', ['HSV = rgb2hsv(RGB)', 'hsvmap = rgb2hsv(rgbmap)']),
  hsv2rgb: H('Convert HSV colours to RGB.', 'HSV 색을 RGB 로 변환합니다.', ['RGB = hsv2rgb(HSV)', 'rgbmap = hsv2rgb(hsvmap)']),
  rgb2ycbcr: H('Convert RGB colours to the YCbCr colour space.', 'RGB 색을 YCbCr 색 공간으로 변환합니다.', ['YCBCR = rgb2ycbcr(RGB)', 'ycbcrmap = rgb2ycbcr(rgbmap)']),
  ycbcr2rgb: H('Convert YCbCr colours to RGB.', 'YCbCr 색을 RGB 로 변환합니다.', ['RGB = ycbcr2rgb(YCBCR)']),
  ind2rgb: H('Convert an indexed image to a truecolor image.', '인덱스 이미지를 트루컬러 이미지로 변환합니다.', ['RGB = ind2rgb(X, map)']),
  ind2gray: H('Convert an indexed image to a grayscale image.', '인덱스 이미지를 회색조 이미지로 변환합니다.', ['I = ind2gray(X, map)']),
  gray2ind: H('Convert a grayscale or binary image to an indexed image with a gray colormap.', '회색조/이진 이미지를 회색 컬러맵의 인덱스 이미지로 변환합니다.', ['[X, map] = gray2ind(I)', '[X, map] = gray2ind(I, n)']),
  rgb2ind: H('Convert a truecolor image to an indexed image (minimum-variance quantization, a given colormap, or uniform quantization with a tolerance).', '트루컬러 이미지를 인덱스 이미지로 변환합니다(색 수 지정 양자화, 주어진 컬러맵, 허용오차 균일 양자화).', ['[X, map] = rgb2ind(RGB, n)', 'X = rgb2ind(RGB, map)', '[X, map] = rgb2ind(RGB, tol)']),
  imresize: H('Resize an image by a scale factor or to a size; methods nearest, bilinear, bicubic (default), box, triangle, lanczos2, lanczos3, with antialiasing when shrinking.', '배율이나 크기를 지정해 이미지 크기를 바꿉니다. 방법: nearest, bilinear, bicubic(기본), box, triangle, lanczos2, lanczos3; 축소 시 앤티에일리어싱.', ['B = imresize(A, scale)', 'B = imresize(A, [numrows numcols])', 'B = imresize(..., method)', 'B = imresize(..., \'Antialiasing\', tf)']),
  imrotate: H('Rotate an image counterclockwise by an angle in degrees.', '이미지를 각도(도)만큼 반시계 방향으로 회전합니다.', ['B = imrotate(A, angle)', 'B = imrotate(A, angle, method)', 'B = imrotate(A, angle, method, bbox)']),
  imcrop: H('Crop an image to a rectangle [xmin ymin width height].', '이미지를 사각형 [xmin ymin width height] 으로 잘라냅니다.', ['I2 = imcrop(I, rect)', 'X2 = imcrop(X, map, rect)', '[I2, rect] = imcrop(...)']),
  padarray: H('Pad an array with a constant or by circular, replicate or symmetric extension.', '배열을 상수 또는 circular, replicate, symmetric 확장으로 채웁니다.', ['B = padarray(A, padsize)', 'B = padarray(A, padsize, padval)', 'B = padarray(A, padsize, padval, direction)']),
  imhist: H('Histogram of image data.', '이미지 데이터의 히스토그램을 구합니다.', ['[counts, binLocations] = imhist(I)', '[counts, binLocations] = imhist(I, n)']),
  stretchlim: H('Contrast-stretching limits (by default 1% of the data saturated at each end).', '대비 늘이기 한계를 구합니다(기본: 양 끝 1% 포화).', ['lowhigh = stretchlim(I)', 'lowhigh = stretchlim(I, tol)']),
  imadjust: H('Adjust image intensity values (contrast stretching with optional gamma).', '이미지 밝기 값을 조정합니다(대비 늘이기, 감마 선택).', ['J = imadjust(I)', 'J = imadjust(I, [low_in high_in])', 'J = imadjust(I, [low_in high_in], [low_out high_out], gamma)']),
  histeq: H('Enhance contrast using histogram equalization.', '히스토그램 평활화로 대비를 높입니다.', ['J = histeq(I)', 'J = histeq(I, n)', 'J = histeq(I, hgram)', '[J, T] = histeq(...)']),
  imnoise: H('Add noise to an image: gaussian, salt & pepper, speckle, poisson, localvar.', '이미지에 잡음을 추가합니다: gaussian, salt & pepper, speckle, poisson, localvar.', ['J = imnoise(I, \'gaussian\', m, var)', 'J = imnoise(I, \'salt & pepper\', d)', 'J = imnoise(I, \'speckle\', var)', 'J = imnoise(I, \'poisson\')']),
  immse: H('Mean-squared error between two images.', '두 이미지 사이의 평균 제곱 오차를 구합니다.', ['err = immse(X, Y)']),
  psnr: H('Peak signal-to-noise ratio in decibels.', '최대 신호 대 잡음비(dB)를 구합니다.', ['peaksnr = psnr(A, ref)', 'peaksnr = psnr(A, ref, peakval)']),
  entropy: H('Entropy of a grayscale image (randomness measure).', '회색조 이미지의 엔트로피(무작위성 척도)를 구합니다.', ['e = entropy(I)']),
};
