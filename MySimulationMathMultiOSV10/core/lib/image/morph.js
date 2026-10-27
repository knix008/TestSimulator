// Image processing, part 3: thresholding, morphology, connected
// components, region measurements, boundaries.
import { tensor, toTensor, isTensor, isChar, isString, toStr, isStruct, num, cell, struct, empty } from '../../value.js';
import { IE, imgOf, toUnit, makeOut, dbl, logical } from './imgutil.js';
import { correlate } from './filt.js';

const isText = (v) => v != null && ((isChar(v) && v.dims[0] <= 1) || (isString(v) && v.data.length === 1));
const txt = (v) => (isText(v) ? toStr(v).toLowerCase() : null);
const numsOf = (v) => Array.from(toTensor(v).re);
const given = (v) => v !== undefined && !(isTensor(v) && v.re.length === 0);

// ---------------------------------------------------------------- thresholds

function hist256(im) {
  const u = toUnit(im);
  const counts = new Float64Array(256);
  for (const v of u) { if (Number.isNaN(v)) continue; let k = Math.round(v * 255); if (k < 0) k = 0; if (k > 255) k = 255; counts[k]++; }
  return counts;
}
function otsu(counts) {
  const n = counts.length;
  let total = 0; for (const c of counts) total += c;
  if (!total) return [0, 0];
  let omega = 0, mu = 0, muT = 0, m2 = 0;
  for (let i = 0; i < n; i++) { const p = counts[i] / total; muT += p * (i + 1); m2 += p * (i + 1) * (i + 1); }
  let best = -1; const idxs = [];
  for (let i = 0; i < n; i++) {
    const p = counts[i] / total; omega += p; mu += p * (i + 1);
    const den = omega * (1 - omega);
    const s = den > 0 ? ((muT * omega - mu) ** 2) / den : NaN;
    if (Number.isNaN(s)) continue;
    if (s > best + 1e-15) { best = s; idxs.length = 0; idxs.push(i + 1); } else if (Math.abs(s - best) <= 1e-15) idxs.push(i + 1);
  }
  if (best < 0) return [0, 0];
  const idx = idxs.reduce((a, b) => a + b, 0) / idxs.length;
  const em = best / (m2 - muT * muT);
  return [(idx - 1) / (n - 1), em];
}
function graythresh(args, nargout) {
  const im = imgOf(args[0], 'graythresh');
  const [level, em] = otsu(hist256(im));
  return nargout > 1 ? [num(level), num(em)] : num(level);
}
function otsuthresh(args, nargout) {
  const c = numsOf(args[0]);
  for (const v of c) if (v < 0) throw IE('otsuthresh', 'badCounts', 'Counts must be nonnegative.');
  const [level, em] = otsu(c);
  return nargout > 1 ? [num(level), num(em)] : num(level);
}

function localMean(u, h, w, wh, ww) {
  const k = { kh: wh, kw: ww, re: new Float64Array(wh * ww).fill(1 / (wh * ww)) };
  return correlate(u, h, w, k, { boundary: 'replicate' }).re;
}
function adaptiveT(im, sens, polarity, sizeArg) {
  const u = toUnit(im).subarray(0, im.n);
  const wh = sizeArg ? sizeArg[0] : 2 * Math.floor(im.h / 16) + 1, ww = sizeArg ? sizeArg[sizeArg.length - 1] : 2 * Math.floor(im.w / 16) + 1;
  const m = localMean(u, im.h, im.w, wh, ww);
  const sf = 0.6 + (1 - sens);
  const T = new Float64Array(im.n);
  for (let i = 0; i < im.n; i++) T[i] = polarity === 'dark' ? 1 - Math.min(1, sf * (1 - m[i])) : Math.min(1, sf * m[i]);
  return T;
}
function adaptthresh(args) {
  const im = imgOf(args[0], 'adaptthresh');
  let sens = 0.5, i = 1, pol = 'bright', size = null;
  if (given(args[1]) && !isText(args[1])) { sens = toTensor(args[1]).re[0]; i = 2; }
  for (; i + 1 < args.length; i += 2) {
    const k = txt(args[i]);
    if (k === 'foregroundpolarity') pol = txt(args[i + 1]); else if (k === 'neighborhoodsize') size = numsOf(args[i + 1]); else if (k === 'statistic') { /* mean only */ } else throw IE('adaptthresh', 'badOption', `Unknown option '${toStr(args[i])}'.`);
  }
  return dbl([im.h, im.w], adaptiveT(im, sens, pol, size));
}
function imbinarize(args) {
  const im = imgOf(args[0], 'imbinarize');
  if (im.c !== 1) throw IE('imbinarize', 'invalidInput', 'Expected a 2-D grayscale image.');
  const u = toUnit(im);
  let T;
  const m = txt(args[1]);
  if (given(args[1]) && m === null) { const t = toTensor(args[1]); T = t.re.length === 1 ? new Float64Array(im.n).fill(t.re[0]) : t.re; } else if (m === 'adaptive') {
    let sens = 0.5, pol = 'bright';
    for (let i = 2; i + 1 < args.length; i += 2) { const k = txt(args[i]); if (k === 'sensitivity') sens = toTensor(args[i + 1]).re[0]; else if (k === 'foregroundpolarity') pol = txt(args[i + 1]); else throw IE('imbinarize', 'badOption', `Unknown option '${toStr(args[i])}'.`); }
    T = adaptiveT(im, sens, pol, null);
  } else if (m === null || m === 'global') T = new Float64Array(im.n).fill(otsu(hist256(im))[0]);
  else throw IE('imbinarize', 'badMethod', `Unknown method '${m}'.`);
  const re = new Float64Array(im.n);
  for (let i = 0; i < im.n; i++) re[i] = u[i] > T[i] ? 1 : 0;
  return logical([im.h, im.w], re);
}
function im2bw(args) {
  let u, h, w, level = 0.5;
  const a0 = imgOf(args[0], 'im2bw');
  if (args.length >= 2 && toTensor(args[1]).dims[1] === 3 && toTensor(args[1]).dims[0] > 1) {
    const mp = toTensor(args[1]); const m = mp.dims[0];
    const off = a0.cls === 'double' || a0.cls === 'single' ? 1 : 0;
    u = new Float64Array(a0.n);
    for (let i = 0; i < a0.n; i++) { let k = Math.floor(a0.re[i]) - off; k = Math.max(0, Math.min(m - 1, k)); u[i] = 0.298936021293775 * mp.re[k] + 0.587043074451121 * mp.re[k + m] + 0.114020904255103 * mp.re[k + 2 * m]; }
    if (given(args[2])) level = toTensor(args[2]).re[0];
  } else {
    const uu = toUnit(a0);
    if (a0.c === 3) { u = new Float64Array(a0.n); for (let i = 0; i < a0.n; i++) u[i] = 0.298936021293775 * uu[i] + 0.587043074451121 * uu[i + a0.n] + 0.114020904255103 * uu[i + 2 * a0.n]; } else u = uu;
    if (given(args[1])) level = toTensor(args[1]).re[0];
  }
  h = a0.h; w = a0.w;
  if (level < 0 || level > 1) throw IE('im2bw', 'badLevel', 'LEVEL must be in the range [0, 1].');
  return logical([h, w], Float64Array.from(u.subarray(0, h * w), (v) => (v > level ? 1 : 0)));
}

// ---------------------------------------------------------------- structuring elements

function seStruct(nh, type) {
  const r = Object.create(null);
  r.Neighborhood = nh; r.Dimensionality = num(2); r.Type = tensor('char', [1, type.length], Array.from(type, (c) => c.charCodeAt(0)));
  return struct([1, 1], ['Neighborhood', 'Dimensionality', 'Type'], [r]);
}
function nhood(n, m, pred) { const re = new Float64Array(n * m); for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) re[i + j * n] = pred(i, j) ? 1 : 0; return logical([n, m], re); }

function strel(args) {
  if (!args.length) throw IE('strel', 'notEnoughInputs', 'Not enough input arguments.');
  const shape = txt(args[0]);
  if (shape === null) return seStruct(makeOut('logical', toTensor(args[0]).dims, Float64Array.from(toTensor(args[0]).re)), 'arbitrary');
  const p = (k) => toTensor(args[k]).re;
  switch (shape) {
    case 'arbitrary': return seStruct(makeOut('logical', toTensor(args[1]).dims, Float64Array.from(p(1))), 'arbitrary');
    case 'square': { const w = p(1)[0]; return seStruct(nhood(w, w, () => true), 'square'); }
    case 'rectangle': { const [m, n] = p(1); return seStruct(nhood(m, n, () => true), 'rectangle'); }
    case 'disk': { const r = p(1)[0]; const n = 2 * r + 1; return seStruct(nhood(n, n, (i, j) => (i - r) ** 2 + (j - r) ** 2 <= r * r), 'disk'); }
    case 'diamond': { const r = p(1)[0]; const n = 2 * r + 1; return seStruct(nhood(n, n, (i, j) => Math.abs(i - r) + Math.abs(j - r) <= r), 'diamond'); }
    case 'octagon': {
      const r = p(1)[0];
      if (r % 3) throw IE('strel', 'badOctagon', 'The octagon radius must be a nonnegative multiple of 3.');
      const n = 2 * r + 1; return seStruct(nhood(n, n, (i, j) => Math.abs(i - r) + Math.abs(j - r) <= r + r / 3), 'octagon');
    }
    case 'line': {
      const len = p(1)[0], deg = p(2)[0];
      const t = (deg * Math.PI) / 180;
      const pts = [];
      const half = (len - 1) / 2;
      const steps = Math.max(2, Math.ceil(len * 4));
      for (let s = 0; s <= steps; s++) { const d = -half + (2 * half * s) / steps; pts.push([Math.round(-d * Math.sin(t)), Math.round(d * Math.cos(t))]); }
      const R = Math.max(...pts.map(([a, b]) => Math.max(Math.abs(a), Math.abs(b))));
      const n = 2 * R + 1;
      const re = new Float64Array(n * n);
      for (const [a, b] of pts) { re[a + R + (b + R) * n] = 1; re[-a + R + (-b + R) * n] = 1; }
      // trim empty borders symmetric
      return seStruct(trimNh(re, n), 'line');
    }
    default: throw IE('strel', 'badShape', `Unknown or unsupported structuring element shape '${shape}'.`);
  }
}
function trimNh(re, n) {
  let r0 = 0, r1 = n - 1, c0 = 0, c1 = n - 1;
  const rowZero = (i) => { for (let j = 0; j < n; j++) if (re[i + j * n]) return false; return true; };
  const colZero = (j) => { for (let i = 0; i < n; i++) if (re[i + j * n]) return false; return true; };
  while (r0 < r1 && rowZero(r0) && rowZero(r1)) { r0++; r1--; }
  while (c0 < c1 && colZero(c0) && colZero(c1)) { c0++; c1--; }
  const kh = r1 - r0 + 1, kw = c1 - c0 + 1;
  const out = new Float64Array(kh * kw);
  for (let j = 0; j < kw; j++) for (let i = 0; i < kh; i++) out[i + j * kh] = re[r0 + i + (c0 + j) * n];
  return logical([kh, kw], out);
}

function seOffsets(v) {
  let nh;
  if (isStruct(v)) { if (!v.fields.includes('Neighborhood')) throw IE('morph', 'badSE', 'Expected a structuring element.'); nh = toTensor(v.data[0].Neighborhood); } else nh = toTensor(v);
  const [kh, kw] = nh.dims;
  const cy = Math.floor((kh + 1) / 2) - 1, cx = Math.floor((kw + 1) / 2) - 1;
  const offs = [];
  for (let j = 0; j < kw; j++) for (let i = 0; i < kh; i++) if (nh.re[i + j * kh]) offs.push([i - cy, j - cx]);
  return offs;
}

function morphOp(im, offs, dilate) {
  const re = new Float64Array(im.re.length);
  const { h, w } = im;
  for (let c = 0; c < im.c; c++) {
    const o = c * im.n;
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      let v = dilate ? -Infinity : Infinity;
      for (const [dy, dx] of offs) {
        const yy = dilate ? y - dy : y + dy, xx = dilate ? x - dx : x + dx;
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const s = im.re[o + yy + xx * h];
        if (dilate ? s > v : s < v) v = s;
      }
      if (!Number.isFinite(v)) v = dilate ? (im.cls === 'logical' ? 0 : -Infinity) : (im.cls === 'logical' ? 1 : Infinity);
      re[o + y + x * h] = v;
    }
  }
  return re;
}
const morphFn = (fn, seq) => (args) => {
  if (args.length < 2) throw IE(fn, 'notEnoughInputs', 'Not enough input arguments.');
  const im0 = imgOf(args[0], fn);
  const offs = seOffsets(args[1]);
  let cur = im0;
  for (const d of seq) cur = { ...im0, re: morphOp(cur, offs, d) };
  return makeOut(im0.cls, im0.dims, cur.re);
};
const imerode = morphFn('imerode', [false]);
const imdilate = morphFn('imdilate', [true]);
const imopen = morphFn('imopen', [false, true]);
const imclose = morphFn('imclose', [true, false]);
function hat(fn, open) {
  return (args) => {
    const im = imgOf(args[0], fn);
    const offs = seOffsets(args[1]);
    const a = morphOp(im, offs, !open), b = morphOp({ ...im, re: a }, offs, open);
    const re = new Float64Array(im.re.length);
    for (let i = 0; i < re.length; i++) re[i] = open ? im.re[i] - b[i] : b[i] - im.re[i];
    if (im.cls === 'logical') for (let i = 0; i < re.length; i++) re[i] = re[i] > 0 ? 1 : 0;
    return makeOut(im.cls, im.dims, re);
  };
}
const imtophat = hat('imtophat', true);
const imbothat = hat('imbothat', false);

// ---------------------------------------------------------------- connected components

/** Labels foreground (nonzero) pixels; returns { L: Float64Array, n }. Labels follow column-major first appearance. */
export function labelJS(re, h, w, conn = 8) {
  const parent = new Int32Array(h * w).fill(-1);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  const nbr = conn === 4 ? [[-1, 0], [0, -1]] : [[-1, 0], [0, -1], [-1, -1], [1, -1]];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const p = y + x * h; if (!re[p]) continue;
    parent[p] = p;
    for (const [dy, dx] of nbr) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0) continue; const q = yy + xx * h; if (re[q]) unite(p, q); }
  }
  const L = new Float64Array(h * w); const map = new Map(); let n = 0;
  for (let p = 0; p < h * w; p++) {
    if (!re[p]) continue;
    const r = find(p); let l = map.get(r); if (l === undefined) { l = ++n; map.set(r, l); } L[p] = l;
  }
  return { L, n };
}
function connArg(v, def) { if (!given(v)) return def; const c = toTensor(v).re[0]; if (c !== 4 && c !== 8) throw IE('bwlabel', 'badConn', 'Connectivity must be 4 or 8.'); return c; }
function bwlabel(args, nargout) {
  const im = imgOf(args[0], 'bwlabel');
  if (im.c !== 1) throw IE('bwlabel', 'invalidInput', 'Expected a 2-D binary image.');
  const { L, n } = labelJS(im.re, im.h, im.w, connArg(args[1], 8));
  return nargout > 1 ? [dbl([im.h, im.w], L), num(n)] : dbl([im.h, im.w], L);
}
function pixelLists(L, n) {
  const lists = Array.from({ length: n }, () => []);
  for (let p = 0; p < L.length; p++) if (L[p] > 0 && L[p] <= n) lists[L[p] - 1].push(p);
  return lists;
}
function bwconncomp(args) {
  const im = imgOf(args[0], 'bwconncomp');
  const conn = connArg(args[1], 8);
  const { L, n } = labelJS(im.re, im.h, im.w, conn);
  const lists = pixelLists(L, n);
  const r = Object.create(null);
  r.Connectivity = num(conn); r.ImageSize = dbl([1, 2], [im.h, im.w]); r.NumObjects = num(n);
  r.PixelIdxList = cell([1, n], lists.map((l) => dbl([l.length, 1], l.map((p) => p + 1))));
  return struct([1, 1], ['Connectivity', 'ImageSize', 'NumObjects', 'PixelIdxList'], [r]);
}

const ALL_PROPS = ['Area', 'Centroid', 'BoundingBox', 'MajorAxisLength', 'MinorAxisLength', 'Eccentricity', 'Orientation', 'EquivDiameter', 'Extent', 'Perimeter', 'FilledArea', 'Image', 'PixelIdxList', 'PixelList'];
const INT_PROPS = ['MeanIntensity', 'MaxIntensity', 'MinIntensity', 'WeightedCentroid', 'PixelValues'];
function regionprops(args) {
  let k = 0;
  if (txt(args[0]) === 'table') throw IE('regionprops', 'tableOutput', 'Table output is not supported; call regionprops without \'table\' and convert with struct2table.');
  let src = args[k++];
  let L, n, h, w;
  if (isStruct(src) && src.fields.includes('PixelIdxList')) {
    const cc = src.data[0];
    [h, w] = numsOf(cc.ImageSize); L = new Float64Array(h * w);
    cc.PixelIdxList.data.forEach((v, i) => { for (const p of numsOf(v)) L[p - 1] = i + 1; });
    n = cc.PixelIdxList.data.length;
  } else {
    const im = imgOf(src, 'regionprops'); h = im.h; w = im.w;
    if (im.cls === 'logical') ({ L, n } = labelJS(im.re, h, w, 8)); else { L = Float64Array.from(im.re.subarray(0, h * w)); n = 0; for (const v of L) if (v > n) n = v; }
  }
  let I = null;
  if (args[k] && !isText(args[k])) { const t = imgOf(args[k], 'regionprops'); I = t.re; k++; }
  let props = [];
  for (; k < args.length; k++) {
    const t = args[k];
    const list = isText(t) ? [toStr(t)] : t.cls === 'cell' ? t.data.map((x) => toStr(x)) : t.cls === 'string' ? t.data : [];
    for (const s of list) {
      const l = s.toLowerCase();
      if (l === 'basic') props.push('Area', 'Centroid', 'BoundingBox');
      else if (l === 'all') props.push(...ALL_PROPS, ...(I ? INT_PROPS : []));
      else {
        const name = [...ALL_PROPS, ...INT_PROPS].find((p) => p.toLowerCase() === l);
        if (!name) throw IE('regionprops', 'badProperty', `Unknown or unsupported property '${s}'.`);
        if (INT_PROPS.includes(name) && !I) throw IE('regionprops', 'needIntensity', `Property '${name}' needs a grayscale image argument.`);
        props.push(name);
      }
    }
  }
  if (!props.length) props = ['Area', 'Centroid', 'BoundingBox'];
  props = [...new Set(props)];
  const lists = pixelLists(L, n);
  const recs = lists.map((pl) => {
    const r = Object.create(null);
    const N = pl.length;
    let sx = 0, sy = 0, minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const p of pl) { const y = p % h, x = (p - y) / h; sx += x + 1; sy += y + 1; if (y < minR) minR = y; if (y > maxR) maxR = y; if (x < minC) minC = x; if (x > maxC) maxC = x; }
    const xbar = N ? sx / N : NaN, ybar = N ? sy / N : NaN;
    let uxx = 0, uyy = 0, uxy = 0;
    for (const p of pl) { const y = p % h, x = (p - y) / h; const dx = x + 1 - xbar, dy = -(y + 1 - ybar); uxx += dx * dx; uyy += dy * dy; uxy += dx * dy; }
    if (N) { uxx = uxx / N + 1 / 12; uyy = uyy / N + 1 / 12; uxy /= N; }
    const common = Math.sqrt((uxx - uyy) ** 2 + 4 * uxy * uxy);
    const major = 2 * Math.SQRT2 * Math.sqrt(uxx + uyy + common), minor = 2 * Math.SQRT2 * Math.sqrt(Math.max(0, uxx + uyy - common));
    const bh = N ? maxR - minR + 1 : 0, bw = N ? maxC - minC + 1 : 0;
    const crop = () => { const re = new Float64Array(bh * bw); for (const p of pl) { const y = p % h, x = (p - y) / h; re[y - minR + (x - minC) * bh] = 1; } return re; };
    for (const pr of props) {
      switch (pr) {
        case 'Area': r.Area = num(N); break;
        case 'Centroid': r.Centroid = dbl([1, 2], [xbar, ybar]); break;
        case 'BoundingBox': r.BoundingBox = dbl([1, 4], N ? [minC + 0.5, minR + 0.5, bw, bh] : [0.5, 0.5, 0, 0]); break;
        case 'MajorAxisLength': r.MajorAxisLength = num(major); break;
        case 'MinorAxisLength': r.MinorAxisLength = num(minor); break;
        case 'Eccentricity': r.Eccentricity = num(major ? (2 * Math.sqrt(Math.max(0, (major / 2) ** 2 - (minor / 2) ** 2))) / major : 0); break;
        case 'Orientation': {
          let nu, de;
          if (uyy > uxx) { nu = uyy - uxx + common; de = 2 * uxy; } else { nu = 2 * uxy; de = uxx - uyy + common; }
          r.Orientation = num(nu === 0 && de === 0 ? 0 : (180 / Math.PI) * Math.atan(nu / de)); break;
        }
        case 'EquivDiameter': r.EquivDiameter = num(Math.sqrt((4 * N) / Math.PI)); break;
        case 'Extent': r.Extent = num(N ? N / (bh * bw) : 0); break;
        case 'Perimeter': {
          // boundary length: straight steps count 1, diagonal steps sqrt(2)
          const c = crop();
          const B = traceBoundary(c, bh, bw, 0);
          let per = 0;
          for (let q = 1; q < B.length; q++) per += Math.hypot(B[q][0] - B[q - 1][0], B[q][1] - B[q - 1][1]);
          r.Perimeter = num(per); break;
        }
        case 'FilledArea': { const c = crop(); const f = fillHoles(c, bh, bw); r.FilledArea = num(f.reduce((a, b) => a + b, 0)); break; }
        case 'Image': r.Image = logical([bh, bw], crop()); break;
        case 'PixelIdxList': r.PixelIdxList = dbl([N, 1], pl.map((p) => p + 1)); break;
        case 'PixelList': { const re = new Float64Array(2 * N); pl.forEach((p, q) => { const y = p % h, x = (p - y) / h; re[q] = x + 1; re[q + N] = y + 1; }); r.PixelList = dbl([N, 2], re); break; }
        case 'PixelValues': r.PixelValues = dbl([N, 1], pl.map((p) => I[p])); break;
        case 'MeanIntensity': r.MeanIntensity = num(N ? pl.reduce((a, p) => a + I[p], 0) / N : NaN); break;
        case 'MaxIntensity': r.MaxIntensity = num(pl.reduce((a, p) => Math.max(a, I[p]), -Infinity)); break;
        case 'MinIntensity': r.MinIntensity = num(pl.reduce((a, p) => Math.min(a, I[p]), Infinity)); break;
        case 'WeightedCentroid': {
          let s = 0, wx = 0, wy = 0;
          for (const p of pl) { const y = p % h, x = (p - y) / h; s += I[p]; wx += (x + 1) * I[p]; wy += (y + 1) * I[p]; }
          r.WeightedCentroid = dbl([1, 2], [wx / s, wy / s]); break;
        }
        default: break;
      }
    }
    return r;
  });
  return struct([recs.length, 1], props, recs);
}

// ---------------------------------------------------------------- fill, cleanup, boundaries

function floodBackground(re, h, w, seeds, conn = 4) {
  const seen = new Uint8Array(h * w);
  const stack = [];
  for (const p of seeds) if (!re[p] && !seen[p]) { seen[p] = 1; stack.push(p); }
  const nb = conn === 4 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  while (stack.length) {
    const p = stack.pop(); const y = p % h, x = (p - y) / h;
    for (const [dy, dx] of nb) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue; const q = yy + xx * h; if (!re[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }
  }
  return seen;
}
function fillHoles(re, h, w) {
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x * h, h - 1 + x * h); }
  for (let y = 0; y < h; y++) { border.push(y, y + (w - 1) * h); }
  const outside = floodBackground(re, h, w, border, 4);
  return Float64Array.from(re, (v, p) => (v || !outside[p] ? 1 : 0));
}
function imfill(args) {
  const im = imgOf(args[0], 'imfill');
  if (im.c !== 1) throw IE('imfill', 'invalidInput', 'Expected a 2-D image.');
  const a1 = args[1];
  if (txt(a1) === 'holes' || (given(args[2]) && txt(args[2]) === 'holes')) {
    if (im.cls !== 'logical') {
      // grayscale: fill regional minima not connected to the border (morphological reconstruction by erosion)
      return makeOut(im.cls, im.dims, grayFill(im));
    }
    return logical(im.dims, fillHoles(im.re, im.h, im.w));
  }
  if (!given(a1)) throw IE('imfill', 'interactive', 'Interactive filling is not available; pass \'holes\' or seed locations.');
  const locs = numsOf(a1);
  let seeds;
  const t = toTensor(a1);
  if (t.dims[1] === 2 && t.dims[0] >= 1 && locs.length === 2 * t.dims[0] && t.dims[0] !== 1) seeds = Array.from({ length: t.dims[0] }, (_, q) => locs[q] - 1 + (locs[q + t.dims[0]] - 1) * im.h);
  else seeds = locs.map((p) => p - 1);
  const conn = given(args[2]) ? toTensor(args[2]).re[0] : 4;
  const re = Float64Array.from(im.re, (v) => (v ? 1 : 0));
  const filled = floodBackground(re, im.h, im.w, seeds, conn);
  return logical(im.dims, Float64Array.from(re, (v, p) => (v || filled[p] ? 1 : 0)));
}
function grayFill(im) {
  const { h, w } = im; const I = im.re;
  // marker: border = I, interior = max; iterate erosion-reconstruction until stable
  let mx = -Infinity; for (const v of I) if (v > mx) mx = v;
  const J = new Float64Array(h * w).fill(mx);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) J[y + x * h] = I[y + x * h];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < h * w; k++) {
        const p = pass ? h * w - 1 - k : k; const y = p % h, x = (p - y) / h;
        let m = J[p];
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue; if (J[yy + xx * h] < m) m = J[yy + xx * h]; }
        const v = Math.max(I[p], m);
        if (v < J[p]) { J[p] = v; changed = true; }
      }
    }
  }
  return J;
}
function bwareaopen(args) {
  const im = imgOf(args[0], 'bwareaopen');
  const P = toTensor(args[1]).re[0];
  const { L, n } = labelJS(im.re, im.h, im.w, connArg(args[2], 8));
  const area = new Float64Array(n + 1); for (const l of L) if (l) area[l]++;
  return logical(im.dims, Float64Array.from(L, (l) => (l && area[l] >= P ? 1 : 0)));
}
function bwperim(args) {
  const im = imgOf(args[0], 'bwperim');
  const conn = given(args[1]) ? toTensor(args[1]).re[0] : 4;
  const nb = conn === 8 ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const { h, w } = im; const re = new Float64Array(h * w);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const p = y + x * h; if (!im.re[p]) continue;
    for (const [dy, dx] of nb) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w || !im.re[yy + xx * h]) { re[p] = 1; break; } }
  }
  return logical([h, w], re);
}
function imclearborder(args) {
  const im = imgOf(args[0], 'imclearborder');
  const { L, n } = labelJS(im.re, im.h, im.w, connArg(args[1], 8));
  const touch = new Uint8Array(n + 1);
  for (let x = 0; x < im.w; x++) for (let y = 0; y < im.h; y++) if (x === 0 || y === 0 || x === im.w - 1 || y === im.h - 1) touch[L[y + x * im.h]] = 1;
  return makeOut(im.cls, im.dims, Float64Array.from(im.re.subarray(0, im.n), (v, p) => (L[p] && touch[L[p]] ? 0 : v)));
}

const DIRS = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]]; // clockwise from north
/** Moore-neighbour tracing of the object containing the first nonzero pixel (column-major) of label `lab` (0 = any nonzero). Returns [[row, col], ...] 1-based, closed. */
function traceBoundary(re, h, w, lab, start = -1) {
  const inside = (y, x) => y >= 0 && y < h && x >= 0 && x < w && (lab ? re[y + x * h] === lab : re[y + x * h] !== 0);
  let s = start;
  if (s < 0) for (let p = 0; p < h * w; p++) if (lab ? re[p] === lab : re[p]) { s = p; break; }
  if (s < 0) return [];
  const sy = s % h, sx = (s - sy) / h;
  const pts = [[sy + 1, sx + 1]];
  let cy = sy, cx = sx, back = 6; // came from the west
  let firstMove = -1;
  for (let guard = 0; guard < 4 * h * w + 8; guard++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) { const d = (back + k) % 8; if (inside(cy + DIRS[d][0], cx + DIRS[d][1])) { found = d; break; } }
    if (found < 0) { pts.push([sy + 1, sx + 1]); break; }
    if (cy === sy && cx === sx) { if (firstMove === found && pts.length > 1) break; if (firstMove < 0) firstMove = found; }
    const py = cy + DIRS[(found + 7) % 8][0], px = cx + DIRS[(found + 7) % 8][1];
    cy += DIRS[found][0]; cx += DIRS[found][1];
    const dy = py - cy, dx = px - cx;
    back = DIRS.findIndex(([a, b]) => a === dy && b === dx);
    pts.push([cy + 1, cx + 1]);
  }
  return pts;
}
function bwboundaries(args, nargout) {
  const im = imgOf(args[0], 'bwboundaries');
  let conn = 8;
  for (const a of args.slice(1)) if (!isText(a)) conn = toTensor(a).re[0];
  const { L, n } = labelJS(im.re, im.h, im.w, conn);
  const B = [];
  for (let k = 1; k <= n; k++) {
    const pts = traceBoundary(L, im.h, im.w, k);
    const m = pts.length; const re = new Float64Array(2 * m);
    pts.forEach(([r, c], q) => { re[q] = r; re[q + m] = c; });
    B.push(dbl([m, 2], re));
  }
  const out = [cell([n, 1], B)];
  if (nargout > 1) out.push(dbl([im.h, im.w], L));
  if (nargout > 2) out.push(num(n));
  if (nargout > 3) out.push(tensor('logical', [n, n]));
  return out;
}
void empty;

export const builtins = {
  graythresh, otsuthresh, adaptthresh, imbinarize, im2bw,
  strel, imerode, imdilate, imopen, imclose, imtophat, imbothat,
  bwlabel, bwconncomp, regionprops, imfill, bwareaopen, bwperim, imclearborder, bwboundaries,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  graythresh: H('Global image threshold by Otsu\'s method (level in [0, 1]); the second output is the effectiveness metric.', '오츠 방법으로 전역 임계값을 구합니다([0, 1]); 두 번째 출력은 효과 지표.', ['level = graythresh(I)', '[level, EM] = graythresh(I)']),
  otsuthresh: H('Otsu threshold from histogram counts.', '히스토그램 개수로부터 오츠 임계값을 구합니다.', ['T = otsuthresh(counts)', '[T, EM] = otsuthresh(counts)']),
  adaptthresh: H('Locally adaptive threshold (local mean based).', '국소 평균 기반의 적응형 임계값을 구합니다.', ['T = adaptthresh(I)', 'T = adaptthresh(I, sensitivity)', 'T = adaptthresh(..., \'ForegroundPolarity\', p, \'NeighborhoodSize\', sz)']),
  imbinarize: H('Binarize a grayscale image by thresholding (global Otsu by default, adaptive, or a given threshold).', '회색조 이미지를 임계값으로 이진화합니다(기본 전역 오츠, adaptive, 지정 임계값).', ['BW = imbinarize(I)', 'BW = imbinarize(I, T)', 'BW = imbinarize(I, \'adaptive\', \'Sensitivity\', s)']),
  im2bw: H('Convert an image to binary by thresholding at a level (default 0.5).', '수준값(기본 0.5)으로 이미지를 이진 이미지로 변환합니다.', ['BW = im2bw(I, level)', 'BW = im2bw(X, map, level)', 'BW = im2bw(RGB, level)']),
  strel: H('Morphological structuring element (struct with Neighborhood): square, rectangle, disk, diamond, octagon, line, arbitrary.', '형태학 구조 요소(Neighborhood 필드를 가진 구조체): square, rectangle, disk, diamond, octagon, line, arbitrary.', ['SE = strel(nhood)', 'SE = strel(\'square\', w)', 'SE = strel(\'rectangle\', [m n])', 'SE = strel(\'disk\', r)', 'SE = strel(\'diamond\', r)', 'SE = strel(\'octagon\', r)', 'SE = strel(\'line\', len, deg)']),
  imerode: H('Morphological erosion of a binary or grayscale image.', '이진/회색조 이미지의 형태학 침식.', ['J = imerode(I, SE)']),
  imdilate: H('Morphological dilation of a binary or grayscale image.', '이진/회색조 이미지의 형태학 팽창.', ['J = imdilate(I, SE)']),
  imopen: H('Morphological opening (erosion followed by dilation).', '형태학 열기(침식 후 팽창).', ['J = imopen(I, SE)']),
  imclose: H('Morphological closing (dilation followed by erosion).', '형태학 닫기(팽창 후 침식).', ['J = imclose(I, SE)']),
  imtophat: H('Top-hat filtering: image minus its opening.', '톱햇 필터: 이미지에서 열기 결과를 뺍니다.', ['J = imtophat(I, SE)']),
  imbothat: H('Bottom-hat filtering: closing minus the image.', '보텀햇 필터: 닫기 결과에서 이미지를 뺍니다.', ['J = imbothat(I, SE)']),
  bwlabel: H('Label connected components of a 2-D binary image (4- or 8-connectivity).', '2차원 이진 이미지의 연결 성분에 레이블을 붙입니다(4/8 연결).', ['L = bwlabel(BW)', '[L, n] = bwlabel(BW, conn)']),
  bwconncomp: H('Connected components of a binary image as a struct (Connectivity, ImageSize, NumObjects, PixelIdxList).', '이진 이미지의 연결 성분을 구조체로 돌려줍니다(Connectivity, ImageSize, NumObjects, PixelIdxList).', ['CC = bwconncomp(BW)', 'CC = bwconncomp(BW, conn)']),
  regionprops: H('Measure properties of image regions: Area, Centroid, BoundingBox, MajorAxisLength, MinorAxisLength, Eccentricity, Orientation, EquivDiameter, Extent, Perimeter, FilledArea, Image, PixelIdxList, PixelList, and with an intensity image MeanIntensity, MaxIntensity, MinIntensity, WeightedCentroid, PixelValues.', '이미지 영역의 속성을 측정합니다: Area, Centroid, BoundingBox, MajorAxisLength, MinorAxisLength, Eccentricity, Orientation, EquivDiameter, Extent, Perimeter, FilledArea, Image, PixelIdxList, PixelList, 밝기 이미지가 있으면 MeanIntensity, MaxIntensity, MinIntensity, WeightedCentroid, PixelValues.', ['stats = regionprops(BW)', 'stats = regionprops(L, properties)', 'stats = regionprops(CC, I, properties)']),
  imfill: H('Fill image regions and holes (binary flood fill from seeds, or \'holes\' for binary and grayscale images).', '이미지 영역과 구멍을 채웁니다(시드에서 이진 채우기, 또는 이진/회색조 \'holes\').', ['BW2 = imfill(BW, \'holes\')', 'BW2 = imfill(BW, locations)', 'BW2 = imfill(BW, locations, conn)', 'I2 = imfill(I, \'holes\')']),
  bwareaopen: H('Remove small objects (fewer than P pixels) from a binary image.', '이진 이미지에서 P 픽셀보다 작은 객체를 제거합니다.', ['BW2 = bwareaopen(BW, P)', 'BW2 = bwareaopen(BW, P, conn)']),
  bwperim: H('Perimeter pixels of objects in a binary image.', '이진 이미지 객체의 둘레 픽셀을 구합니다.', ['BW2 = bwperim(BW)', 'BW2 = bwperim(BW, conn)']),
  imclearborder: H('Remove objects touching the image border.', '이미지 테두리에 닿은 객체를 제거합니다.', ['J = imclearborder(I)', 'J = imclearborder(I, conn)']),
  bwboundaries: H('Trace the outer boundaries of objects in a binary image (holes are not traced).', '이진 이미지 객체의 바깥 경계를 추적합니다(구멍은 추적하지 않음).', ['B = bwboundaries(BW)', '[B, L, n] = bwboundaries(BW, conn)']),
};
