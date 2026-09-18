// DICOM (.dcm / .dicom) preview: parse, decode a frame, apply a window,
// and list the other images of the same series in the folder.
'use strict';

const fsp = require('fs/promises');
const path = require('path');
const dicomParser = require('dicom-parser');
const jpegJs = require('jpeg-js');
const png = require('./png');

const TS = {
  implicit: '1.2.840.10008.1.2',
  explicit: '1.2.840.10008.1.2.1',
  bigEndian: '1.2.840.10008.1.2.2',
  rle: '1.2.840.10008.1.2.5',
  jpegBase: '1.2.840.10008.1.2.4.50',
  jpegExt: '1.2.840.10008.1.2.4.51',
  jpegLoss57: '1.2.840.10008.1.2.4.57',
  jpegLoss70: '1.2.840.10008.1.2.4.70',
};

const WINDOW_PRESETS = {
  abdomen: { ww: 400, wl: 40 },
  bone: { ww: 1800, wl: 400 },
  brain: { ww: 80, wl: 40 },
  lung: { ww: 1500, wl: -600 },
  soft: { ww: 350, wl: 50 },
  liver: { ww: 150, wl: 30 },
};

function str(ds, tag) {
  try {
    const v = ds.string(tag);
    return v == null ? '' : String(v).replace(/\0/g, '').trim();
  } catch { return ''; }
}

function num(ds, tag, fallback = 0) {
  const s = str(ds, tag);
  if (!s) return fallback;
  const n = parseFloat(s.split('\\')[0]);
  return Number.isFinite(n) ? n : fallback;
}

function u16(ds, tag, fallback = 0) {
  try {
    const v = ds.uint16(tag);
    return v == null ? fallback : v;
  } catch { return fallback; }
}

function person(s) {
  return String(s || '').replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim();
}

function samePath(a, b) {
  try { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); } catch { return a === b; }
}

function decodeRle(bytes, rows, cols, samples, bytesPerSample) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nseg = view.getUint32(0, true);
  const offsets = [];
  for (let i = 0; i < nseg && i < 15; i++) offsets.push(view.getUint32(4 + i * 4, true));
  const planes = [];
  for (let s = 0; s < nseg; s++) {
    const start = offsets[s];
    const end = s + 1 < nseg ? offsets[s + 1] : bytes.length;
    const out = new Uint8Array(rows * cols);
    let i = start, o = 0;
    while (i < end && o < out.length) {
      const n = (bytes[i++] << 24) >> 24;
      if (n >= 0 && n <= 127) {
        const c = n + 1;
        for (let k = 0; k < c && i < end && o < out.length; k++) out[o++] = bytes[i++];
      } else if (n <= -1 && n >= -127) {
        const c = -n + 1;
        const v = i < end ? bytes[i++] : 0;
        for (let k = 0; k < c && o < out.length; k++) out[o++] = v;
      }
    }
    planes.push(out);
  }
  const pixels = bytesPerSample === 2 ? new Uint16Array(rows * cols * samples) : new Uint8Array(rows * cols * samples);
  if (bytesPerSample === 1) {
    if (samples === 1) return planes[0] || pixels;
    const n = rows * cols;
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < samples; s++) pixels[i * samples + s] = (planes[s] || [])[i] || 0;
    }
    return pixels;
  }
  const n = rows * cols;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < samples; s++) {
      const hi = (planes[s * 2] || [])[i] || 0;
      const lo = (planes[s * 2 + 1] || [])[i] || 0;
      pixels[i * samples + s] = (hi << 8) | lo;
    }
  }
  return pixels;
}

function decodeJpegLossy(bytes) {
  const raw = jpegJs.decode(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { useTArray: true, formatAsRGBA: false });
  return { width: raw.width, height: raw.height, samples: (raw.data.length / (raw.width * raw.height)) | 0, pixels: raw.data };
}

function decodeJpegLossless(bytes) {
  const { Decoder } = require('jpeg-lossless-decoder-js');
  const dec = new Decoder();
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const pixels = dec.decode(copy);
  return { width: dec.xDim, height: dec.yDim, samples: dec.numComp || 1, pixels };
}

function frameBytes(dataSet, frame, rows, cols, samples, bitsAlloc) {
  const el = dataSet.elements.x7fe00010;
  if (!el) throw Object.assign(new Error('No pixel data'), { code: 'ENOPIXELS' });
  if (el.encapsulatedPixelData) {
    try { return dicomParser.readEncapsulatedImageFrame(dataSet, el, frame); } catch { /* fall through */ }
    return dicomParser.readEncapsulatedPixelData(dataSet, el, frame);
  }
  const bpp = Math.ceil(bitsAlloc / 8);
  const size = rows * cols * samples * bpp;
  const start = el.dataOffset + frame * size;
  if (start + size > dataSet.byteArray.length) throw Object.assign(new Error('Pixel data is truncated'), { code: 'ETRUNC' });
  return dataSet.byteArray.subarray(start, start + size);
}

function toTyped(bytes, bitsAlloc, signed, little) {
  if (bitsAlloc <= 8) return Uint8Array.from(bytes);
  const n = (bytes.length / 2) | 0;
  const out = signed ? new Int16Array(n) : new Uint16Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) out[i] = signed ? view.getInt16(i * 2, little) : view.getUint16(i * 2, little);
  return out;
}

function pixelTypeOf(typed) {
  if (typed instanceof Int16Array) return 'i16';
  if (typed instanceof Uint16Array) return 'u16';
  return 'u8';
}

function statsOf(pixels) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  if (min === max) max = min + 1;
  return { min, max };
}

function applyWindow(pixels, { width, height, samples = 1, photometric = 'MONOCHROME2', slope = 1, intercept = 0, ww, wl, invert = false } = {}) {
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  if (samples >= 3) {
    for (let i = 0; i < n; i++) {
      let r = pixels[i * samples], g = pixels[i * samples + 1], b = pixels[i * samples + 2];
      if (pixels instanceof Uint16Array || pixels instanceof Int16Array) {
        r = r >> 8; g = g >> 8; b = b >> 8;
      }
      if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
      const o = i * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
    return rgba;
  }
  const span = ww > 0 ? ww : 1;
  const lo = wl - span / 2;
  const mono1 = /MONOCHROME1/i.test(photometric);
  for (let i = 0; i < n; i++) {
    let v = pixels[i] * slope + intercept;
    let g = Math.round(255 * (v - lo) / span);
    if (g < 0) g = 0; else if (g > 255) g = 255;
    if (mono1) g = 255 - g;
    if (invert) g = 255 - g;
    const o = i * 4;
    rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
  }
  return rgba;
}

function infoOf(ds) {
  return {
    patientName: person(str(ds, 'x00100010')),
    patientId: str(ds, 'x00100020'),
    studyDate: str(ds, 'x00080020'),
    studyDesc: str(ds, 'x00081030'),
    seriesDesc: str(ds, 'x0008103e'),
    seriesNumber: str(ds, 'x00200011'),
    seriesUid: str(ds, 'x0020000e'),
    instance: num(ds, 'x00200013', 0),
    modality: str(ds, 'x00080060'),
    manufacturer: str(ds, 'x00080070'),
    institution: str(ds, 'x00080080'),
    transferSyntax: str(ds, 'x00020010'),
  };
}

async function listSeries(filePath, seriesUid) {
  const dir = path.dirname(filePath);
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!/\.(dcm|dicom)$/i.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fsp.stat(full);
      const n = Math.min(st.size, 512 * 1024);
      const buf = Buffer.alloc(n);
      const fh = await fsp.open(full, 'r');
      try { await fh.read(buf, 0, n, 0); } finally { await fh.close(); }
      const ds = dicomParser.parseDicom(new Uint8Array(buf), { untilTag: 'x7fe00010' });
      const uid = str(ds, 'x0020000e');
      if (seriesUid && uid && uid !== seriesUid) continue;
      out.push({ path: full, name, instance: num(ds, 'x00200013', 0), frames: Math.max(1, num(ds, 'x00280008', 1) || u16(ds, 'x00280008', 1)) });
    } catch { /* not a readable DICOM */ }
  }
  out.sort((a, b) => (a.instance - b.instance) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
}

function decodeFrame(dataSet, frame) {
  const rows = u16(dataSet, 'x00280010');
  const cols = u16(dataSet, 'x00280011');
  if (!rows || !cols) throw Object.assign(new Error('DICOM has no image size'), { code: 'ENOSIZE' });
  const samples = u16(dataSet, 'x00280002', 1) || 1;
  const bitsAlloc = u16(dataSet, 'x00280100', 16) || 16;
  const signed = u16(dataSet, 'x00280103', 0) === 1;
  const photometric = str(dataSet, 'x00280004') || 'MONOCHROME2';
  const ts = str(dataSet, 'x00020010') || TS.implicit;
  const little = ts !== TS.bigEndian;
  const frames = Math.max(1, num(dataSet, 'x00280008', 1) || u16(dataSet, 'x00280008', 1));
  const idx = Math.max(0, Math.min(frames - 1, frame | 0));
  const bytes = frameBytes(dataSet, idx, rows, cols, samples, bitsAlloc);

  let pixels, width = cols, height = rows, samp = samples;
  if (ts === TS.rle) {
    pixels = decodeRle(bytes, rows, cols, samples, bitsAlloc > 8 ? 2 : 1);
    if (signed && pixels instanceof Uint16Array) pixels = new Int16Array(pixels.buffer, pixels.byteOffset, pixels.length);
  } else if (ts === TS.jpegBase || ts === TS.jpegExt) {
    const j = decodeJpegLossy(bytes);
    width = j.width; height = j.height; samp = j.samples; pixels = j.pixels;
  } else if (ts === TS.jpegLoss57 || ts === TS.jpegLoss70) {
    const j = decodeJpegLossless(bytes);
    width = j.width; height = j.height; samp = j.samples; pixels = j.pixels;
  } else if (ts.startsWith('1.2.840.10008.1.2.4.')) {
    throw Object.assign(new Error('This DICOM compression is not supported (' + ts + ')'), { code: 'EUNSUPPORTED' });
  } else {
    pixels = toTyped(bytes, bitsAlloc, signed, little);
  }
  return { width, height, samples: samp, photometric, pixels, frames, index: idx, bitsAlloc, signed, transferSyntax: ts };
}

function windowOf(ds, pixels, slope, intercept) {
  let ww = num(ds, 'x00281051', 0);
  let wl = num(ds, 'x00281050', 0);
  const { min, max } = statsOf(pixels);
  const vmin = min * slope + intercept, vmax = max * slope + intercept;
  if (!(ww > 0)) { ww = vmax - vmin || 1; wl = (vmin + vmax) / 2; }
  return { ww, wl, min: vmin, max: vmax };
}

async function readDataset(p) {
  const buf = await fsp.readFile(p);
  try {
    return { buf, dataSet: dicomParser.parseDicom(new Uint8Array(buf)) };
  } catch (e) {
    throw Object.assign(new Error('Not a readable DICOM file: ' + (e.message || e)), { code: 'ENOTDICOM' });
  }
}

async function preview(filePath, { index = null } = {}) {
  let target = filePath;
  const first = await readDataset(target);
  const meta = infoOf(first.dataSet);
  const fileFrames = Math.max(1, num(first.dataSet, 'x00280008', 1) || u16(first.dataSet, 'x00280008', 1));
  const series = await listSeries(filePath, meta.seriesUid);
  const filePos = Math.max(0, series.findIndex((s) => samePath(s.path, filePath)));

  let mode = 'frames';
  let count = fileFrames;
  let frame = 0;
  let dataSet = first.dataSet;
  if (fileFrames > 1) {
    frame = index == null ? 0 : Math.max(0, Math.min(count - 1, index | 0));
  } else if (series.length > 1) {
    mode = 'series';
    count = series.length;
    const pick = index == null ? filePos : Math.max(0, Math.min(count - 1, index | 0));
    target = series[pick].path;
    if (!samePath(target, filePath)) dataSet = (await readDataset(target)).dataSet;
    frame = 0;
    index = pick;
  } else {
    frame = 0;
    index = 0;
    count = 1;
  }
  if (mode === 'frames') index = frame;

  const dec = decodeFrame(dataSet, frame);
  const slope = num(dataSet, 'x00281053', 1) || 1;
  const intercept = num(dataSet, 'x00281052', 0);
  const win = windowOf(dataSet, dec.pixels, slope, intercept);
  const rgba = applyWindow(dec.pixels, {
    width: dec.width, height: dec.height, samples: dec.samples,
    photometric: dec.photometric, slope, intercept, ww: win.ww, wl: win.wl,
  });
  const src = png.dataUrl(dec.width, dec.height, rgba);
  const pixelsB64 = Buffer.from(dec.pixels.buffer, dec.pixels.byteOffset, dec.pixels.byteLength).toString('base64');
  return {
    kind: 'dicom',
    mode,
    index,
    count,
    width: dec.width,
    height: dec.height,
    src,
    pixels: pixelsB64,
    pixelType: pixelTypeOf(dec.pixels),
    samples: dec.samples,
    photometric: dec.photometric,
    slope,
    intercept,
    windowCenter: win.wl,
    windowWidth: win.ww,
    valueMin: win.min,
    valueMax: win.max,
    bitsAllocated: dec.bitsAlloc,
    signed: dec.signed,
    invert: false,
    meta: { ...infoOf(dataSet), frames: dec.frames, transferSyntax: dec.transferSyntax },
    series,
    presets: WINDOW_PRESETS,
    path: target,
  };
}

// A tiny uncompressed Secondary Capture, for samples and tests.
function encodeUncompressed({
  width, height, pixels, frames = 1,
  patientName = 'Sample^Patient', patientId = 'S1',
  studyDesc = 'My Editor', seriesDesc = 'Test',
  seriesUid = '1.2.826.0.1.3680043.8.498.1',
  instance = 1, modality = 'OT', ww = 255, wl = 127,
  photometric = 'MONOCHROME2',
} = {}) {
  const cols = width | 0, rows = height | 0;
  const n = cols * rows;
  const nframes = Math.max(1, frames | 0);
  const src = pixels || (() => {
    const p = new Uint8Array(n * nframes);
    for (let f = 0; f < nframes; f++) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) p[f * n + y * cols + x] = Math.round((x / Math.max(1, cols - 1)) * 200 + f * 10);
      }
    }
    return p;
  })();

  const uid = (s) => { const t = String(s); return t.length % 2 ? t + '\0' : t; };
  const even = (s, pad = ' ') => { const t = String(s); return t.length % 2 ? t + pad : t; };

  const meta = [];
  const pushE = (group, element, vr, value) => {
    const v = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const long = vr === 'OB' || vr === 'OW' || vr === 'UN' || vr === 'UT';
    const buf = Buffer.alloc(8 + (long ? 4 : 0) + v.length);
    buf.writeUInt16LE(group, 0);
    buf.writeUInt16LE(element, 2);
    buf.write(vr, 4, 2, 'ascii');
    if (long) { buf.writeUInt16LE(0, 6); buf.writeUInt32LE(v.length, 8); v.copy(buf, 12); }
    else { buf.writeUInt16LE(v.length, 6); v.copy(buf, 8); }
    meta.push(buf);
  };
  const sop = uid(`1.2.826.0.1.3680043.8.498.${Date.now()}${instance}`);
  pushE(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01]));
  pushE(0x0002, 0x0002, 'UI', uid('1.2.840.10008.5.1.4.1.1.7'));
  pushE(0x0002, 0x0003, 'UI', sop);
  pushE(0x0002, 0x0010, 'UI', uid(TS.implicit));
  pushE(0x0002, 0x0012, 'UI', uid('1.2.826.0.1.3680043.8.498.99'));
  pushE(0x0002, 0x0013, 'SH', even('MYEDITOR'));
  const metaBody = Buffer.concat(meta);
  const glen = Buffer.alloc(12);
  glen.writeUInt16LE(0x0002, 0);
  glen.writeUInt16LE(0x0000, 2);
  glen.write('UL', 4, 2, 'ascii');
  glen.writeUInt16LE(4, 6);
  glen.writeUInt32LE(metaBody.length, 8);

  const ds = [];
  const pushI = (group, element, value) => {
    const v = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const buf = Buffer.alloc(8 + v.length);
    buf.writeUInt16LE(group, 0);
    buf.writeUInt16LE(element, 2);
    buf.writeUInt32LE(v.length, 4);
    v.copy(buf, 8);
    ds.push(buf);
  };
  const pushUS = (g, e, n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); pushI(g, e, b); };
  const pushIS = (g, e, n) => pushI(g, e, even(String(n)));
  const pushDS = (g, e, n) => pushI(g, e, even(String(n)));

  pushI(0x0008, 0x0016, uid('1.2.840.10008.5.1.4.1.1.7'));
  pushI(0x0008, 0x0018, sop);
  pushI(0x0008, 0x0020, even('20260101'));
  pushI(0x0008, 0x0060, even(modality));
  pushI(0x0008, 0x1030, even(studyDesc));
  pushI(0x0008, 0x103e, even(seriesDesc));
  pushI(0x0010, 0x0010, even(patientName));
  pushI(0x0010, 0x0020, even(patientId));
  pushI(0x0020, 0x000d, uid('1.2.826.0.1.3680043.8.498.2'));
  pushI(0x0020, 0x000e, uid(seriesUid));
  pushIS(0x0020, 0x0011, 1);
  pushIS(0x0020, 0x0013, instance);
  if (nframes > 1) pushIS(0x0028, 0x0008, nframes);
  pushUS(0x0028, 0x0002, 1);
  pushI(0x0028, 0x0004, even(photometric));
  pushUS(0x0028, 0x0010, rows);
  pushUS(0x0028, 0x0011, cols);
  pushUS(0x0028, 0x0100, 8);
  pushUS(0x0028, 0x0101, 8);
  pushUS(0x0028, 0x0102, 7);
  pushUS(0x0028, 0x0103, 0);
  pushDS(0x0028, 0x1050, wl);
  pushDS(0x0028, 0x1051, ww);
  pushDS(0x0028, 0x1052, 0);
  pushDS(0x0028, 0x1053, 1);
  const pix = Buffer.from(src.buffer, src.byteOffset, src.byteLength);
  const pixEl = Buffer.alloc(8 + pix.length);
  pixEl.writeUInt16LE(0x7fe0, 0);
  pixEl.writeUInt16LE(0x0010, 2);
  pixEl.writeUInt32LE(pix.length, 4);
  pix.copy(pixEl, 8);
  ds.push(pixEl);

  const pre = Buffer.alloc(128);
  const magic = Buffer.from('DICM', 'ascii');
  return Buffer.concat([pre, magic, glen, metaBody, ...ds]);
}

module.exports = { preview, applyWindow, encodeUncompressed, WINDOW_PRESETS, infoOf };
