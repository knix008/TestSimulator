// Image file builtins: imread, imwrite, imfinfo, imformats.
// Formats: PNG, JPEG, BMP, GIF (frames), TIFF (pages), PBM/PGM/PPM/PNM.
import { tensor, str, cell, struct, num, empty, isTensor, toStr, isChar, isString, toTensor, isSparse } from '../../value.js';
import { absPath, nameValues, isTextArg, extName, fsExists, isDirPath } from '../io/util.js';
import { sniff } from './codecs/common.js';
import { decodePng, encodePng, pngInfo } from './codecs/png.js';
import { decodeJpeg, encodeJpeg, jpegInfo } from './codecs/jpeg.js';
import { decodeBmp, encodeBmp, bmpInfo } from './codecs/bmp.js';
import { decodeGif, encodeGif, appendGif } from './codecs/gif.js';
import { decodeTiff, encodeTiff, tiffIfds, tiffPageInfo } from './codecs/tiff.js';
import { decodePnm, encodePnm, isPnm, pnmHeader } from './codecs/pnm.js';
import { IE, imgOf, rasterToArray, arrayToRaster, indexedToRaster, quantize, mapToPalette } from './imgutil.js';

const FMT_ALIAS = { png: 'png', jpg: 'jpg', jpeg: 'jpg', bmp: 'bmp', gif: 'gif', tif: 'tif', tiff: 'tif', pbm: 'pbm', pgm: 'pgm', ppm: 'ppm', pnm: 'pnm' };
const FORMAT_LIST = [
  { ext: ['bmp'], desc: 'Windows Bitmap', alpha: false, multipage: false },
  { ext: ['gif'], desc: 'Graphics Interchange Format', alpha: false, multipage: true },
  { ext: ['jpg', 'jpeg'], desc: 'Joint Photographic Experts Group', alpha: false, multipage: false },
  { ext: ['pbm'], desc: 'Portable Bitmap', alpha: false, multipage: false },
  { ext: ['pgm'], desc: 'Portable Graymap', alpha: false, multipage: false },
  { ext: ['png'], desc: 'Portable Network Graphics', alpha: true, multipage: false },
  { ext: ['pnm'], desc: 'Portable Any Map', alpha: false, multipage: false },
  { ext: ['ppm'], desc: 'Portable Pixmap', alpha: false, multipage: false },
  { ext: ['tif', 'tiff'], desc: 'Tagged Image File Format', alpha: true, multipage: true },
];
const READ_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff', '.pgm', '.ppm', '.pbm', '.pnm'];

const fmtOf = (s) => FMT_ALIAS[String(s).toLowerCase().replace(/^\./, '')] || null;
const isNumArg = (v) => v != null && (isTensor(v) || isSparse(v)) && !isChar(v);
const textOf = (v) => (isTextArg(v) ? toStr(v) : null);

function locate(ctx, file, fmt) {
  const p = absPath(ctx, file);
  if (fsExists(ctx, p) && !isDirPath(ctx, p)) return p;
  const exts = fmt ? FORMAT_LIST.find((f) => f.ext.includes(fmt) || fmtOf(f.ext[0]) === fmt)?.ext.map((e) => '.' + e) || ['.' + fmt] : READ_EXTS;
  for (const e of exts) if (fsExists(ctx, p + e)) return p + e;
  throw IE('imread', 'fileNotFound', `File "${file}" does not exist.`);
}

function detect(bytes, path, fmt) {
  const s = sniff(bytes);
  if (s) return s;
  if (isPnm(bytes)) return 'pnm';
  if (fmt) return fmt;
  const e = fmtOf(extName(path));
  if (e) return e;
  throw IE('imread', 'unknownFormat', 'Unable to determine the file format.');
}

function readBytes(ctx, path) {
  try { return ctx.fs.readBytes(path); } catch (e) { throw IE('imread', 'cannotRead', `Unable to read file "${path}": ${e.message}`); }
}

// ---------------------------------------------------------------- imread

function imread(args, nargout, ctx) {
  if (!args.length) throw IE('imread', 'notEnoughInputs', 'Not enough input arguments.');
  const file = toStr(args[0], 'Filename');
  let i = 1, fmt = null, index = null, frames = null;
  if (args[i] && isTextArg(args[i]) && fmtOf(toStr(args[i])) && (args.length - i) % 2 === 1) { fmt = fmtOf(toStr(args[i])); i++; }
  if (args[i] && isNumArg(args[i])) { index = Array.from(toTensor(args[i]).re); i++; }
  const opts = nameValues(args, i);
  if (opts.index) index = Array.from(toTensor(opts.index).re);
  if (opts.frames) frames = textOf(opts.frames)?.toLowerCase() === 'all' ? 'all' : Array.from(toTensor(opts.frames).re);
  const path = locate(ctx, file, fmt);
  const bytes = readBytes(ctx, path);
  const kind = detect(bytes, path, fmt);
  let res;
  if (kind === 'png') res = rasterToArray(decodePng(bytes));
  else if (kind === 'jpg') res = rasterToArray(decodeJpeg(bytes));
  else if (kind === 'bmp') res = rasterToArray(decodeBmp(bytes));
  else if (kind === 'tif') res = rasterToArray(decodeTiff(bytes, index ? index[0] - 1 : 0));
  else if (kind === 'pnm' || kind === 'pbm' || kind === 'pgm' || kind === 'ppm') {
    const r = decodePnm(bytes);
    if (r.bitDepth === 1) for (let k = 0; k < r.data.length; k++) r.data[k] = r.data[k] ? 0 : 1; // PBM 1 = black
    res = rasterToArray(r);
  } else if (kind === 'gif') {
    const sel = frames || index || [1];
    const g = decodeGif(bytes, { firstOnly: sel !== 'all' && sel.length === 1 && sel[0] === 1 });
    const list = sel === 'all' ? g.frames.map((_, k) => k) : sel.map((k) => k - 1);
    for (const k of list) if (k < 0 || k >= g.frames.length) throw IE('imread', 'badFrame', `Frame ${k + 1} does not exist; the file has ${g.frames.length} frame(s).`);
    const h = g.height, w = g.width, n = h * w;
    const re = new Float64Array(n * list.length);
    list.forEach((k, f) => { const d = g.frames[k].data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) re[f * n + y + x * h] = d[y * w + x]; });
    const A = tensor('uint8', list.length > 1 ? [h, w, 1, list.length] : [h, w], re);
    const pal = g.frames[list[0]].palette; const m = pal.length / 3;
    const mr = new Float64Array(m * 3);
    for (let q = 0; q < m; q++) for (let c = 0; c < 3; c++) mr[q + c * m] = pal[3 * q + c] / 255;
    res = { A, map: tensor('double', [m, 3], mr), alpha: tensor('double', [0, 0]) };
  } else throw IE('imread', 'unknownFormat', `Unsupported image format '${kind}'.`);
  const out = [res.A];
  if (nargout > 1) out.push(res.map);
  if (nargout > 2) out.push(res.alpha);
  return out;
}

// ---------------------------------------------------------------- imwrite

const PNG_TEXT = { author: 'Author', description: 'Description', title: 'Title', comment: 'Comment', software: 'Software', copyright: 'Copyright', creationtime: 'Creation Time', source: 'Source', disclaimer: 'Disclaimer', warning: 'Warning' };
const KNOWN_OPTS = new Set(['alpha', 'quality', 'writemode', 'delaytime', 'loopcount', 'transparentcolor', 'compression', 'bitdepth', 'comment', 'description',
  'encoding', 'maxvalue', 'mode', 'resolution', 'backgroundcolor', 'disposalmethod', 'colorspace', 'transparency', 'location', 'screensize', 'rowsperstrip', ...Object.keys(PNG_TEXT)]);

function imwrite(args, nargout, ctx) {
  if (args.length < 2) throw IE('imwrite', 'notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  let i = 1, map = null;
  if (isNumArg(args[1])) { map = args[1]; i = 2; }
  if (!args[i] || !isTextArg(args[i])) throw IE('imwrite', 'noFilename', 'Expected a file name.');
  const file = toStr(args[i]); i++;
  let fmt = null;
  if (args[i] && isTextArg(args[i]) && fmtOf(toStr(args[i])) && (args.length - i) % 2 === 1) { fmt = fmtOf(toStr(args[i])); i++; }
  const opts = nameValues(args, i);
  if ((args.length - i) % 2) throw IE('imwrite', 'badOptions', 'Options must be name/value pairs.');
  for (const k of Object.keys(opts)) if (!KNOWN_OPTS.has(k)) throw IE('imwrite', 'unknownOption', `Unknown option '${k}'.`);
  let path = absPath(ctx, file);
  if (!fmt) fmt = fmtOf(extName(path));
  else if (!extName(path)) path += '.' + (fmt === 'jpg' ? 'jpg' : fmt);
  if (!fmt) throw IE('imwrite', 'unknownFormat', 'Unable to determine the file format from the file name.');
  if (map && isTensor(map) && map.re.length === 0) map = null;
  const append = (textOf(opts.writemode) || 'overwrite').toLowerCase() === 'append';
  let bytes;
  const exists = fsExists(ctx, path);
  switch (fmt) {
    case 'png': bytes = writePng(A, map, opts); break;
    case 'jpg': bytes = writeJpeg(A, map, opts); break;
    case 'bmp': bytes = writeBmp(A, map, opts); break;
    case 'gif': bytes = writeGif(A, map, opts, append && exists ? readBytes(ctx, path) : null, append); break;
    case 'tif': bytes = writeTiff(A, map, opts, append && exists ? readBytes(ctx, path) : null); break;
    default: bytes = writePnm(A, map, opts, fmt);
  }
  try { ctx.fs.writeBytes(path, bytes); } catch (e) { throw IE('imwrite', 'cannotWrite', `Unable to write file "${file}": ${e.message}`); }
  return undefined;
}

function rgbBytesOf(A, map) {
  // any image (indexed with map, gray, logical, RGB) → interleaved 8-bit RGB raster
  if (map) {
    const r = indexedToRaster(A, map, 65536);
    const out = new Uint8Array(r.width * r.height * 3);
    for (let p = 0; p < r.width * r.height; p++) for (let k = 0; k < 3; k++) out[3 * p + k] = r.palette[3 * r.data[p] + k];
    return { width: r.width, height: r.height, channels: 3, bitDepth: 8, data: out };
  }
  const r = arrayToRaster(A, { depth: 8 });
  if (r.channels === 3) return r;
  if (r.channels === 1) {
    const out = new Uint8Array(r.width * r.height * 3);
    for (let p = 0; p < r.width * r.height; p++) out[3 * p] = out[3 * p + 1] = out[3 * p + 2] = r.data[p];
    return { width: r.width, height: r.height, channels: 3, bitDepth: 8, data: out };
  }
  throw IE('imwrite', 'badChannels', 'Expected a grayscale, truecolor or indexed image.');
}

function writePng(A, map, opts) {
  let img;
  const depth = opts.bitdepth ? toTensor(opts.bitdepth).re[0] : 0;
  if (map) {
    img = indexedToRaster(A, map, 256);
    img.bitDepth = depth && depth <= 8 ? depth : 8;
  } else {
    const cls = imgOf(A, 'imwrite').cls;
    const d = depth || (cls === 'logical' ? 1 : cls === 'uint16' ? 16 : 8);
    if (opts.alpha && d < 8) throw IE('imwrite', 'badBitDepth', 'Images with alpha must be 8 or 16 bits deep.');
    img = arrayToRaster(A, { depth: d, alpha: opts.alpha || null });
    if (img.channels === 1 && opts.transparency) img.transparent = [Math.round(toTensor(opts.transparency).re[0] * ((1 << d) - 1))];
    if (img.channels === 3 && opts.transparency) img.transparent = Array.from(toTensor(opts.transparency).re, (v) => Math.round(v * ((2 ** d) - 1)));
  }
  const text = {};
  for (const [k, name] of Object.entries(PNG_TEXT)) if (opts[k]) text[name] = toStr(opts[k]);
  img.text = text;
  return encodePng(img);
}

function writeJpeg(A, map, opts) {
  const quality = opts.quality ? toTensor(opts.quality).re[0] : 75;
  if (quality < 0 || quality > 100) throw IE('imwrite', 'badQuality', 'Quality must be between 0 and 100.');
  if (opts.mode && textOf(opts.mode).toLowerCase() === 'lossless') throw IE('imwrite', 'losslessJpeg', 'Lossless JPEG writing is not supported; use PNG instead.');
  let img;
  if (map) img = rgbBytesOf(A, map);
  else {
    img = arrayToRaster(A, { depth: 8 });
    if (img.channels !== 1 && img.channels !== 3) throw IE('imwrite', 'badChannels', 'JPEG images must be grayscale or truecolor.');
  }
  return encodeJpeg(img, { quality: Math.max(1, quality), comment: opts.comment ? toStr(opts.comment) : null });
}

function writeBmp(A, map) {
  let img;
  if (map) img = indexedToRaster(A, map, 256);
  else {
    const cls = imgOf(A, 'imwrite').cls;
    img = arrayToRaster(A, { depth: cls === 'logical' ? 1 : 8 });
    if (img.channels !== 1 && img.channels !== 3) throw IE('imwrite', 'badChannels', 'BMP images must be grayscale, truecolor or indexed.');
  }
  return encodeBmp(img);
}

const DISPOSAL = { donotspecify: 0, leaveinplace: 1, restorebg: 2, restoreprevious: 3 };

function writeGif(A, map, opts, existing, append) {
  if (append && !existing) throw IE('imwrite', 'noFileToAppend', 'The file to append to does not exist.');
  const t = toTensor(A);
  const d = t.dims;
  const h = d[0], w = d[1];
  const nf = d.length >= 4 ? d[3] : 1;
  const cc = d.length >= 3 ? d[2] : 1;
  const frames = [];
  const n = h * w;
  const isFloat = t.cls === 'double' || t.cls === 'single';
  let palette;
  for (let f = 0; f < nf; f++) {
    const sub = tensor(t.cls, cc > 1 ? [h, w, cc] : [h, w], t.re.subarray(f * n * cc, (f + 1) * n * cc));
    let data;
    if (map) {
      const r = indexedToRaster(sub, map, 256); data = r.data; palette = r.palette;
    } else if (cc === 3) {
      const r = rgbBytesOf(sub, null);
      if (!palette) { const q = quantize(r.data, n, 256); palette = q.palette; data = Uint8Array.from(q.indices); } else data = Uint8Array.from(mapToPalette(r.data, n, palette));
    } else if (t.cls === 'logical') {
      palette = Uint8Array.from([0, 0, 0, 255, 255, 255]);
      data = new Uint8Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = sub.re[y + x * h] ? 1 : 0;
    } else {
      palette = new Uint8Array(768); for (let k = 0; k < 256; k++) palette[3 * k] = palette[3 * k + 1] = palette[3 * k + 2] = k;
      const r = arrayToRaster(sub, { depth: 8 }); data = r.data;
    }
    const tc = opts.transparentcolor ? toTensor(opts.transparentcolor).re[0] - (map && isFloat ? 1 : 0) : null;
    frames.push({
      width: w, height: h, data, palette,
      delay: opts.delaytime ? Math.round(toTensor(opts.delaytime).re[0] * 100) : (nf > 1 || append ? 50 : null),
      transparentIndex: tc, disposal: opts.disposalmethod ? DISPOSAL[textOf(opts.disposalmethod).toLowerCase()] ?? 0 : 0,
      left: opts.location ? toTensor(opts.location).re[0] : 0, top: opts.location ? toTensor(opts.location).re[1] : 0,
    });
  }
  if (append) return appendGif(existing, frames);
  let loop = null;
  if (opts.loopcount) { const v = toTensor(opts.loopcount).re[0]; loop = Number.isFinite(v) ? Math.min(65535, Math.max(0, Math.round(v))) : 0; }
  return encodeGif(frames, { loopCount: loop, comment: opts.comment ? toStr(opts.comment) : null, backgroundIndex: opts.backgroundcolor ? toTensor(opts.backgroundcolor).re[0] : 0 });
}

function writeTiff(A, map, opts, existing) {
  let img;
  const cmyk = (textOf(opts.colorspace) || '').toLowerCase() === 'cmyk';
  if (map) img = indexedToRaster(A, map, 65536);
  else {
    const cls = imgOf(A, 'imwrite').cls;
    img = arrayToRaster(A, { depth: cls === 'logical' ? 1 : cls === 'uint16' || cls === 'int16' ? 16 : 8, alpha: opts.alpha || null, float: cls === 'single' });
  }
  if (img.indexed && img.palette16.length / 3 < 1 << img.bitDepth) {
    const full = 1 << img.bitDepth;
    const p = new Uint16Array(3 * full); const m = img.palette16.length / 3;
    for (let k = 0; k < 3; k++) p.set(img.palette16.subarray(k * m, (k + 1) * m), k * full);
    img.palette16 = p;
  }
  const comp = textOf(opts.compression) || 'packbits';
  return encodeTiff(img, { compression: comp, description: opts.description ? toStr(opts.description) : null, resolution: opts.resolution ? toTensor(opts.resolution).re[0] : 72, cmyk }, existing);
}

function writePnm(A, map, opts, fmt) {
  let img = map ? rgbBytesOf(A, map) : arrayToRaster(A, { depth: (() => { const c = imgOf(A, 'imwrite').cls; return c === 'uint16' ? 16 : c === 'logical' ? 1 : 8; })() });
  let kind = fmt;
  if (kind === 'pnm') kind = img.bitDepth === 1 ? 'pbm' : img.channels === 1 ? 'pgm' : 'ppm';
  const n = img.width * img.height;
  if (kind === 'pbm') {
    const thr = img.bitDepth === 1 ? 1 : img.bitDepth === 16 ? 32768 : 128;
    const d = new Uint8Array(n);
    for (let p = 0; p < n; p++) { let v = img.data[p * img.channels]; if (img.channels >= 3) v = (img.data[p * img.channels] + img.data[p * img.channels + 1] + img.data[p * img.channels + 2]) / 3; d[p] = v >= thr ? 0 : 1; }
    img = { width: img.width, height: img.height, channels: 1, bitDepth: 1, data: d };
  } else {
    if (img.bitDepth === 1) { const d = new Uint8Array(n); for (let p = 0; p < n; p++) d[p] = img.data[p] ? 255 : 0; img = { ...img, bitDepth: 8, data: d }; }
    if (kind === 'pgm' && img.channels === 3) {
      const d = img.bitDepth > 8 ? new Uint16Array(n) : new Uint8Array(n);
      for (let p = 0; p < n; p++) d[p] = Math.round(0.298936021293775 * img.data[3 * p] + 0.587043074451121 * img.data[3 * p + 1] + 0.114020904255103 * img.data[3 * p + 2]);
      img = { ...img, channels: 1, data: d };
    } else if (kind === 'ppm' && img.channels === 1) {
      const d = img.bitDepth > 8 ? new Uint16Array(n * 3) : new Uint8Array(n * 3);
      for (let p = 0; p < n; p++) d[3 * p] = d[3 * p + 1] = d[3 * p + 2] = img.data[p];
      img = { ...img, channels: 3, data: d };
    }
    if (img.channels !== 1 && img.channels !== 3) throw IE('imwrite', 'badChannels', 'PNM images must be grayscale or truecolor.');
    if (opts.maxvalue) {
      const mv = toTensor(opts.maxvalue).re[0], cur = img.bitDepth > 8 ? 65535 : 255;
      const d = mv > 255 ? new Uint16Array(img.data.length) : new Uint8Array(img.data.length);
      for (let p = 0; p < d.length; p++) d[p] = Math.round((img.data[p] * mv) / cur);
      img = { ...img, data: d, bitDepth: mv > 255 ? 16 : 8 };
      return encodePnm(img, { encoding: textOf(opts.encoding) || 'rawbits', maxval: mv });
    }
  }
  return encodePnm(img, { encoding: textOf(opts.encoding) || 'rawbits' });
}

// ---------------------------------------------------------------- imfinfo

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (x) => String(x).padStart(2, '0');
function modDate(ms) {
  const d = new Date(ms || 0);
  return `${p2(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
const cmap = (pal, n) => { const m = n ?? pal.length / 3; const r = new Float64Array(m * 3); for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) r[i + k * m] = pal[3 * i + k] / 255; return tensor('double', [m, 3], r); };
const cellStr = (list) => cell([list.length, list.length ? 1 : 0], list.map((s) => str(s)));

function infoRecords(bytes, path, fmt, stat) {
  const kind = detect(bytes, path, fmt);
  const common = (format, ver, w, h, bd, ct) => ({ Filename: str(path), FileModDate: str(modDate(stat.mtimeMs)), FileSize: num(bytes.length), Format: str(format), FormatVersion: ver == null ? empty() : str(String(ver)), Width: num(w), Height: num(h), BitDepth: num(bd), ColorType: str(ct) });
  if (kind === 'png') {
    const i = pngInfo(bytes);
    const ct = i.colorType === 3 ? 'indexed' : i.colorType === 0 || i.colorType === 4 ? 'grayscale' : 'truecolor';
    return [{
      ...common('png', null, i.width, i.height, i.colorType === 3 ? i.bitDepth : i.bitDepth * i.channels, ct),
      Colormap: i.palette ? cmap(i.palette) : empty(), InterlaceType: str(i.interlace ? 'adam7' : 'none'),
      Transparency: str(i.colorType === 4 || i.colorType === 6 ? 'alpha' : i.hasTrns ? 'simple' : 'none'),
    }];
  }
  if (kind === 'jpg') {
    const i = jpegInfo(bytes);
    return [{
      ...common('jpg', null, i.width, i.height, 8 * i.components, i.components === 1 ? 'grayscale' : i.components === 4 ? 'CMYK' : 'truecolor'),
      NumberOfSamples: num(i.components), CodingMethod: str('Huffman'), CodingProcess: str(i.coding === 'progressive' ? 'Progressive' : 'Sequential'), Comment: cellStr(i.comments),
    }];
  }
  if (kind === 'bmp') {
    const i = bmpInfo(bytes);
    const r = i.bpp <= 8 ? decodeBmp(bytes) : null;
    return [{
      ...common('bmp', i.version, i.width, i.height, i.bpp, i.bpp <= 8 ? 'indexed' : 'truecolor'),
      CompressionType: str(['none', '8-bit RLE', '4-bit RLE', 'bitfields'][i.compression] || 'other'),
      NumColormapEntries: num(r ? r.palette.length / 3 : 0), Colormap: r ? cmap(r.palette) : empty(),
    }];
  }
  if (kind === 'gif') {
    const g = decodeGif(bytes);
    const dn = ['doNotSpecify', 'leaveInPlace', 'restoreBG', 'restorePrevious'];
    return g.frames.map((f) => {
      let bits = 1; while ((1 << bits) < f.palette.length / 3) bits++;
      return {
        ...common('gif', g.version, g.width, g.height, bits, 'indexed'),
        Colormap: cmap(f.palette), Left: num(f.left + 1), Top: num(f.top + 1), DelayTime: num(f.delay),
        DisposalMethod: str(dn[f.disposal] || 'doNotSpecify'), TransparentColor: f.transparentIndex == null ? empty() : num(f.transparentIndex + 1),
        LoopCount: g.loopCount == null ? empty() : num(g.loopCount === 0 ? Infinity : g.loopCount), Interlaced: str(f.interlaced ? 'yes' : 'no'),
        Comment: cellStr(g.comments),
      };
    });
  }
  if (kind === 'tif') {
    const { ifds, le } = tiffIfds(bytes);
    return ifds.map((ifd) => {
      const i = tiffPageInfo(ifd.tags);
      const bd = i.bitsPerSample.reduce((a, b) => a + b, 0);
      const ct = i.photometricCode === 3 ? 'indexed' : i.photometricCode === 5 ? 'CMYK' : i.samplesPerPixel >= 3 ? 'truecolor' : 'grayscale';
      let colormap = empty();
      if (ifd.tags[320]) { const c = ifd.tags[320]; const m = c.length / 3; const r = new Float64Array(m * 3); for (let q = 0; q < m; q++) for (let k = 0; k < 3; k++) r[q + k * m] = c[k * m + q] / 65535; colormap = tensor('double', [m, 3], r); }
      return {
        ...common('tif', null, i.width, i.height, bd, ct),
        ByteOrder: str(le ? 'little-endian' : 'big-endian'), BitsPerSample: tensor('double', [1, i.bitsPerSample.length], i.bitsPerSample),
        SamplesPerPixel: num(i.samplesPerPixel), Compression: str(i.compression), PhotometricInterpretation: str(i.photometric),
        PlanarConfiguration: str(i.planar === 2 ? 'Planar' : 'Chunky'), ImageDescription: str(i.description), Software: str(i.software),
        XResolution: i.xres == null ? empty() : num(i.xres), YResolution: i.yres == null ? empty() : num(i.yres),
        ResolutionUnit: str(i.resUnit === 3 ? 'Centimeter' : i.resUnit === 1 ? 'None' : 'Inch'), RowsPerStrip: num(i.rowsPerStrip),
        Colormap: colormap, SampleFormat: str(i.sampleFormat === 3 ? 'IEEE floating point' : i.sampleFormat === 2 ? 'Two\'s complement signed integer' : 'Unsigned integer'),
      };
    });
  }
  const h = pnmHeader(bytes);
  return [{
    ...common(h.format, null, h.width, h.height, h.format === 'pbm' ? 1 : (h.maxval > 255 ? 16 : 8) * h.channels, h.format === 'pbm' ? 'grayscale' : h.channels === 3 ? 'truecolor' : 'grayscale'),
    FormatSignature: str('P' + h.kind), Encoding: str(h.encoding), MaxValue: num(h.maxval), ImageDataOffset: num(h.kind <= 3 ? 0 : h.dataStart),
  }];
}

function imfinfo(args, nargout, ctx) {
  if (!args.length) throw IE('imfinfo', 'notEnoughInputs', 'Not enough input arguments.');
  const file = toStr(args[0], 'Filename');
  const fmt = args[1] ? fmtOf(toStr(args[1])) : null;
  const path = locate(ctx, file, fmt);
  const bytes = readBytes(ctx, path);
  let st = { mtimeMs: 0 }; try { st = ctx.fs.stat(path); } catch { /* keep */ }
  const recs = infoRecords(bytes, path, fmt, st);
  const fields = [];
  for (const r of recs) for (const k of Object.keys(r)) if (!fields.includes(k)) fields.push(k);
  const data = recs.map((r) => { const o = Object.create(null); for (const f of fields) o[f] = r[f] === undefined ? empty() : r[f]; return o; });
  return struct([recs.length, 1], fields, data);
}

function imformats(args, nargout, ctx) {
  const fields = ['ext', 'isa', 'info', 'read', 'write', 'alpha', 'description', 'multipage'];
  let list = FORMAT_LIST;
  if (args.length) { const f = fmtOf(toStr(args[0])); list = FORMAT_LIST.filter((x) => x.ext.some((e) => fmtOf(e) === f)); }
  if (nargout === 0 && !args.length) {
    const lines = ['EXT          DESCRIPTION                        ALPHA  MULTIPAGE'];
    for (const f of list) lines.push(`${f.ext.join(' ').padEnd(12)} ${f.desc.padEnd(34)} ${f.alpha ? 'yes' : 'no '}    ${f.multipage ? 'yes' : 'no'}`);
    ctx.out(lines.join('\n') + '\n');
    return undefined;
  }
  const data = list.map((f) => {
    const o = Object.create(null);
    o.ext = cell([1, f.ext.length], f.ext.map((e) => str(e)));
    o.isa = str('builtin'); o.info = str('imfinfo'); o.read = str('imread'); o.write = str('imwrite');
    o.alpha = num(f.alpha ? 1 : 0); o.description = str(f.desc); o.multipage = num(f.multipage ? 1 : 0);
    return o;
  });
  return struct([1, data.length], fields, data);
}

export const builtins = { imread, imwrite, imfinfo, imformats };
void isString;

export const help = {
  imread: {
    en: 'Read an image file (PNG, JPEG, BMP, GIF, TIFF, PBM/PGM/PPM). Indexed images return the colormap as the second output; images with transparency return the alpha channel as the third output.',
    ko: '이미지 파일(PNG, JPEG, BMP, GIF, TIFF, PBM/PGM/PPM)을 읽습니다. 인덱스 이미지는 두 번째 출력으로 컬러맵을, 투명도가 있으면 세 번째 출력으로 알파 채널을 돌려줍니다.',
    syntax: ['A = imread(filename)', 'A = imread(filename, fmt)', '[X, map] = imread(filename)', '[A, map, alpha] = imread(filename)', 'A = imread(filename, idx)', 'A = imread(filename, \'Frames\', \'all\')', 'A = imread(filename, \'Index\', idx)'],
  },
  imwrite: {
    en: 'Write an image to a file. The format comes from the extension or the fmt argument. Options: Alpha, BitDepth, Transparency (PNG), Quality, Comment (JPEG), DelayTime, LoopCount, TransparentColor, DisposalMethod, WriteMode (GIF), Compression, Description, Resolution, WriteMode, ColorSpace (TIFF), Encoding, MaxValue (PNM).',
    ko: '이미지를 파일로 저장합니다. 형식은 확장자나 fmt 인수로 정합니다. 옵션: Alpha, BitDepth, Transparency(PNG), Quality, Comment(JPEG), DelayTime, LoopCount, TransparentColor, DisposalMethod, WriteMode(GIF), Compression, Description, Resolution, WriteMode, ColorSpace(TIFF), Encoding, MaxValue(PNM).',
    syntax: ['imwrite(A, filename)', 'imwrite(X, map, filename)', 'imwrite(..., fmt)', 'imwrite(..., Name, Value)'],
  },
  imfinfo: {
    en: 'Information about an image file as a struct (one element per frame or page): Filename, FileModDate, FileSize, Format, Width, Height, BitDepth, ColorType and format-specific fields.',
    ko: '이미지 파일 정보를 구조체로 돌려줍니다(프레임/페이지마다 한 원소): Filename, FileModDate, FileSize, Format, Width, Height, BitDepth, ColorType 및 형식별 필드.',
    syntax: ['info = imfinfo(filename)', 'info = imfinfo(filename, fmt)'],
  },
  imformats: {
    en: 'List the supported image file formats.',
    ko: '지원하는 이미지 파일 형식 목록을 보여 줍니다.',
    syntax: ['imformats', 'formats = imformats', 'fmt = imformats(ext)'],
  },
};
