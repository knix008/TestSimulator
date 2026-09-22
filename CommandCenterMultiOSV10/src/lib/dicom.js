// DICOM (.dcm): the tags through dicom-parser, the pixels through the codec
// the transfer syntax asks for, and a picture through a window (centre /
// width) that the viewer can change without decoding again.
//
//   decodeDicom(bytes) → { canvas, note, details, dicom }
//     dicom.frames                how many frames the file holds
//     dicom.frame                 the one shown (0-based)
//     dicom.gray                  true for MONOCHROME1/2 (the window applies)
//     dicom.wc / dicom.ww         the window in use (modality-rescaled units)
//     dicom.fileWindows           [{ wc, ww, label }] from the file, may be empty
//     dicom.range                 { min, max } of the frame's rescaled values
//     dicom.invert                MONOCHROME1 shows dark for high values
//     dicom.presets               window presets that make sense (CT: lung, bone …)
//     dicom.show({ frame, wc, ww, invert }) → canvas   re-render (decodes the frame once, then cached)
//
// Transfer syntaxes: implicit / explicit little endian, explicit big endian,
// RLE lossless (decoded here), JPEG baseline / extended 12-bit
// (libjpeg-turbo), JPEG lossless (jpeg-lossless-decoder-js), JPEG-LS
// (CharLS), JPEG 2000 (OpenJPEG). The codecs are loaded on first use.
// Photometric interpretations: MONOCHROME1/2, RGB, YBR_FULL / YBR_FULL_422
// (uncompressed: converted here; JPEG: the codec converts), PALETTE COLOR.

const TS = {
  IMPLICIT_LE: '1.2.840.10008.1.2', EXPLICIT_LE: '1.2.840.10008.1.2.1', EXPLICIT_BE: '1.2.840.10008.1.2.2', DEFLATED_LE: '1.2.840.10008.1.2.1.99',
  RLE: '1.2.840.10008.1.2.5', JPEG_BASELINE: '1.2.840.10008.1.2.4.50', JPEG_EXTENDED: '1.2.840.10008.1.2.4.51',
  JPEG_LOSSLESS: '1.2.840.10008.1.2.4.57', JPEG_LOSSLESS_SV1: '1.2.840.10008.1.2.4.70', JPEG_LS_LOSSLESS: '1.2.840.10008.1.2.4.80', JPEG_LS: '1.2.840.10008.1.2.4.81',
  J2K_LOSSLESS: '1.2.840.10008.1.2.4.90', J2K: '1.2.840.10008.1.2.4.91', HTJ2K_LOSSLESS: '1.2.840.10008.1.2.4.201', HTJ2K_LOSSLESS_RPCL: '1.2.840.10008.1.2.4.202', HTJ2K: '1.2.840.10008.1.2.4.203',
};
const TS_NAME = {
  [TS.IMPLICIT_LE]: 'Implicit VR little endian', [TS.EXPLICIT_LE]: 'Explicit VR little endian', [TS.EXPLICIT_BE]: 'Explicit VR big endian', [TS.DEFLATED_LE]: 'Deflated explicit VR little endian',
  [TS.RLE]: 'RLE lossless', [TS.JPEG_BASELINE]: 'JPEG baseline (8 bit)', [TS.JPEG_EXTENDED]: 'JPEG extended (12 bit)', [TS.JPEG_LOSSLESS]: 'JPEG lossless', [TS.JPEG_LOSSLESS_SV1]: 'JPEG lossless (SV1)',
  [TS.JPEG_LS_LOSSLESS]: 'JPEG-LS lossless', [TS.JPEG_LS]: 'JPEG-LS near-lossless', [TS.J2K_LOSSLESS]: 'JPEG 2000 lossless', [TS.J2K]: 'JPEG 2000', [TS.HTJ2K_LOSSLESS]: 'HTJ2K lossless', [TS.HTJ2K_LOSSLESS_RPCL]: 'HTJ2K lossless (RPCL)', [TS.HTJ2K]: 'HTJ2K',
};
const JPEG_FAMILY = new Set([TS.JPEG_BASELINE, TS.JPEG_EXTENDED, TS.JPEG_LOSSLESS, TS.JPEG_LOSSLESS_SV1, TS.JPEG_LS_LOSSLESS, TS.JPEG_LS, TS.J2K_LOSSLESS, TS.J2K, TS.HTJ2K_LOSSLESS, TS.HTJ2K_LOSSLESS_RPCL, TS.HTJ2K]);

// CT window presets (Hounsfield units). Other modalities get "file" and "auto" only.
export const CT_PRESETS = [
  { id: 'brain', wc: 40, ww: 80 }, { id: 'subdural', wc: 75, ww: 215 }, { id: 'stroke', wc: 32, ww: 8 }, { id: 'soft', wc: 50, ww: 400 },
  { id: 'liver', wc: 60, ww: 150 }, { id: 'mediastinum', wc: 50, ww: 350 }, { id: 'lung', wc: -600, ww: 1500 }, { id: 'bone', wc: 400, ww: 1800 },
];

let parserMod = null;
async function parser() {
  if (!parserMod) { const m = await import('dicom-parser'); parserMod = m.default || m; }
  return parserMod;
}
// Each codec is an Emscripten module: a factory that resolves to the module. Loaded once, silenced.
const codecs = {};
async function codec(kind) {
  if (!codecs[kind]) {
    codecs[kind] = (async () => {
      const quiet = { print() {}, printErr() {} };
      if (kind === 'j2k') { const m = await import('@cornerstonejs/codec-openjpeg/decode'); return (m.default || m)(quiet); }
      if (kind === 'jpegls') { const m = await import('@cornerstonejs/codec-charls/decode'); return (m.default || m)(quiet); }
      if (kind === 'jpeg8') { const m = await import('@cornerstonejs/codec-libjpeg-turbo-8bit/decode'); return (m.default || m)(quiet); }
      if (kind === 'jpeg12') { const m = await import('@cornerstonejs/codec-libjpeg-turbo-12bit'); return (m.default || m)(quiet); }
      if (kind === 'lossless') { const m = await import('jpeg-lossless-decoder-js'); return m.default && m.default.Decoder ? m.default : m; }
      throw new Error(`no codec ${kind}`);
    })().catch((err) => { delete codecs[kind]; throw err; });
  }
  return codecs[kind];
}

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

export async function decodeDicom(bytes) {
  const dicomParser = await parser();
  let ds;
  try { ds = dicomParser.parseDicom(bytes); } catch (err) { throw new Error(`DICOM: ${err && err.message ? err.message : err}`); }
  const str = (tag) => (ds.string(tag) || '').trim();
  const rows = ds.uint16('x00280010'), cols = ds.uint16('x00280011');
  const spp = ds.uint16('x00280002') || 1;
  const photometric = str('x00280004') || 'MONOCHROME2';
  const bitsAllocated = ds.uint16('x00280100') || 8;
  const bitsStored = ds.uint16('x00280101') || bitsAllocated;
  const signed = ds.uint16('x00280103') === 1;
  const planar = ds.uint16('x00280006') === 1;
  const frames = Math.max(1, ds.intString('x00280008') || 1);
  const slope = num(str('x00281053')) ?? 1, intercept = num(str('x00281052')) ?? 0;
  const ts = str('x00020010') || TS.IMPLICIT_LE;
  const px = ds.elements.x7fe00010;
  if (!rows || !cols || !px) throw new Error('DICOM: no image');
  const modality = str('x00080060');
  const gray = photometric.startsWith('MONOCHROME') || photometric === 'PALETTE COLOR';
  const palette = photometric === 'PALETTE COLOR' ? readPalette(ds) : null;

  // The file's own windows (several allowed, each may carry a label).
  const wcs = str('x00281050').split('\\').map(num), wws = str('x00281051').split('\\').map(num), labels = str('x00281055').split('\\');
  const fileWindows = wcs.map((wc, i) => ({ wc, ww: wws[i], label: (labels[i] || '').trim() })).filter((w) => Number.isFinite(w.wc) && Number.isFinite(w.ww) && w.ww > 0);

  // ── Frame access (decoded once, then cached as typed samples) ──
  const encapsulated = !!(px.encapsulatedPixelData || px.fragments);
  const frameBytes = rows * cols * spp * (bitsAllocated / 8);
  const cache = new Map();
  const frameSamples = async (i) => {
    if (cache.has(i)) return cache.get(i);
    let s;
    if (!encapsulated) {
      const off = px.dataOffset + i * frameBytes;
      const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + off, Math.min(frameBytes, Math.max(0, px.length - i * frameBytes)));
      s = { samples: unpack(raw, { n: rows * cols, spp, bitsAllocated, signed, bigEndian: ts === TS.EXPLICIT_BE }), planar };
    } else {
      const frag = encapsulatedFrame(dicomParser, ds, px, i, frames, ts);
      s = await decodeFragment(frag, ts, { rows, cols, spp, bitsAllocated, signed });
    }
    if (s.samples.length < rows * cols * spp) throw new Error(`DICOM: frame ${i + 1} is short (${s.samples.length} of ${rows * cols * spp} samples)`);
    cache.set(i, s);
    return s;
  };

  // ── Rendering ──
  const state = { frame: 0, wc: undefined, ww: undefined, invert: photometric === 'MONOCHROME1', gray, frames, modality, fileWindows, slope, intercept, range: null, presets: modality === 'CT' ? CT_PRESETS : [],
    // cine playback interval in ms: Frame Time (0018,1063), else Cine Rate (0018,0040) / Recommended Display Frame Rate (0008,2144) in fps, else 10 fps
    frameTime: num(str('x00181063')) > 0 ? num(str('x00181063')) : num(str('x00180040')) > 0 ? 1000 / num(str('x00180040')) : num(str('x00082144')) > 0 ? 1000 / num(str('x00082144')) : 100 };
  const show = async (opts = {}) => {
    if (Number.isFinite(opts.frame)) state.frame = Math.max(0, Math.min(frames - 1, opts.frame));
    if (Number.isFinite(opts.wc)) state.wc = opts.wc;
    if (Number.isFinite(opts.ww)) state.ww = Math.max(1e-6, opts.ww);
    if (typeof opts.invert === 'boolean') state.invert = opts.invert;
    const { samples, planar: pl } = await frameSamples(state.frame);
    const n = rows * cols;
    const canvas = canvasOf(cols, rows);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    const out = img.data;
    if (!gray) {
      const ybr = photometric.startsWith('YBR') && !JPEG_FAMILY.has(ts);   // a JPEG codec already gave RGB
      const shift = bitsAllocated > 8 ? bitsAllocated - 8 : 0;
      for (let p = 0; p < n; p++) {
        let r = samples[pl ? p : p * spp] >> shift, g = samples[pl ? n + p : p * spp + 1] >> shift, b = samples[pl ? 2 * n + p : p * spp + 2] >> shift;
        if (ybr) { const y = r, cb = g - 128, cr = b - 128; r = y + 1.402 * cr; g = y - 0.344136 * cb - 0.714136 * cr; b = y + 1.772 * cb; }
        out[p * 4] = r < 0 ? 0 : r > 255 ? 255 : r; out[p * 4 + 1] = g < 0 ? 0 : g > 255 ? 255 : g; out[p * 4 + 2] = b < 0 ? 0 : b > 255 ? 255 : b; out[p * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    if (palette) {
      for (let p = 0; p < n; p++) {
        const i = Math.max(0, Math.min(palette.n - 1, samples[p] - palette.first));
        out[p * 4] = palette.r[i]; out[p * 4 + 1] = palette.g[i]; out[p * 4 + 2] = palette.b[i]; out[p * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    // Grey: modality rescale → window → 0..255 (inverted for MONOCHROME1 or on request).
    let min = Infinity, max = -Infinity;
    for (let p = 0; p < n; p++) { const v = samples[p] * slope + intercept; if (v < min) min = v; if (v > max) max = v; }
    state.range = { min, max };
    if (!Number.isFinite(state.wc) || !Number.isFinite(state.ww)) {
      if (fileWindows.length) { state.wc = fileWindows[0].wc; state.ww = fileWindows[0].ww; }
      else { state.wc = (min + max) / 2; state.ww = Math.max(1, max - min); }
    }
    const lo = state.wc - state.ww / 2, scale = 255 / state.ww;
    for (let p = 0; p < n; p++) {
      let g = Math.round((samples[p] * slope + intercept - lo) * scale);
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      if (state.invert) g = 255 - g;
      out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = g; out[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  const canvas = await show({});
  const noteBits = [modality, photometric, `${bitsStored} bit`, frames > 1 ? `1 / ${frames}` : '', TS_NAME[ts] ? TS_NAME[ts].split(' (')[0] : ''].filter(Boolean);
  const details = [
    ['info_modality', [modality, str('x00080070'), str('x00081090')].filter(Boolean).join('  ·  ')],
    ['info_series', [str('x00081030'), str('x0008103e'), str('x00180015')].filter(Boolean).join('  ·  ')],
    ['info_study_date', [str('x00080020'), str('x00080030')].filter(Boolean).join(' ')],
    ['info_photometric', `${photometric}  ·  ${spp} ${spp > 1 ? 'samples' : 'sample'}  ·  ${bitsStored} / ${bitsAllocated} bit${signed ? ' signed' : ''}${planar ? '  ·  planar' : ''}`],
    ['info_frames', frames > 1 ? String(frames) : ''],
    ['info_transfer_syntax', `${TS_NAME[ts] || ''} (${ts})`],
    ['info_pixel_spacing', [str('x00280030') ? `${str('x00280030').replace('\\', ' × ')} mm` : '', str('x00180050') ? `${str('x00180050')} mm` : ''].filter(Boolean).join('  ·  ')],
    ['info_window', fileWindows.map((w) => `C ${w.wc}  W ${w.ww}${w.label ? ` (${w.label})` : ''}`).join('  ·  ')],
    ['info_rescale', str('x00281053') || str('x00281052') ? `× ${slope}  + ${intercept}` : ''],
  ].filter(([, v]) => v);
  return { canvas, note: noteBits.join(' · '), details, dicom: { ...state, show: (o) => show(o).then((c) => ({ canvas: c, state: { ...state } })) } };
}

// ── Pixel data ────────────────────────────────────────────

// Raw bytes → one typed array of samples (little-endian per pixel unless told otherwise).
function unpack(raw, { n, spp, bitsAllocated, signed, bigEndian }) {
  const count = n * spp;
  if (bitsAllocated === 8) return signed ? new Int8Array(raw.buffer, raw.byteOffset, Math.min(count, raw.length)) : new Uint8Array(raw.buffer, raw.byteOffset, Math.min(count, raw.length));
  if (bitsAllocated === 16) {
    const out = signed ? new Int16Array(count) : new Uint16Array(count);
    const m = Math.min(count, raw.length >> 1);
    for (let i = 0; i < m; i++) out[i] = bigEndian ? (raw[i * 2] << 8) | raw[i * 2 + 1] : raw[i * 2] | (raw[i * 2 + 1] << 8);
    return out;
  }
  if (bitsAllocated === 32) {
    const out = signed ? new Int32Array(count) : new Float64Array(count);   // unsigned 32-bit does not fit Int32
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const m = Math.min(count, raw.length >> 2);
    for (let i = 0; i < m; i++) out[i] = signed ? dv.getInt32(i * 4, !bigEndian) : dv.getUint32(i * 4, !bigEndian);
    return out;
  }
  if (bitsAllocated === 1) {   // packed bits (overlays, some masks)
    const out = new Uint8Array(count);
    for (let i = 0; i < count && (i >> 3) < raw.length; i++) out[i] = (raw[i >> 3] >> (i & 7)) & 1;
    return out;
  }
  throw new Error(`DICOM: ${bitsAllocated} bits allocated is not supported`);
}

// The encoded bytes of one frame of encapsulated pixel data.
function encapsulatedFrame(dicomParser, ds, px, i, frames, ts) {
  const bot = px.basicOffsetTable || [];
  if (bot.length) { try { return dicomParser.readEncapsulatedImageFrame(ds, px, i, bot); } catch { /* fall through */ } }
  if (frames === 1) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, px, 0, px.fragments.length);
  if (px.fragments.length === frames) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, px, i, 1);
  // Several fragments per frame and no offset table: JPEG streams can be told apart by their start marker.
  if (JPEG_FAMILY.has(ts)) {
    const built = dicomParser.createJPEGBasicOffsetTable(ds, px);
    if (built && built.length) return dicomParser.readEncapsulatedImageFrame(ds, px, i, built);
  }
  throw new Error('DICOM: cannot locate the frame in the pixel data (no offset table)');
}

async function decodeFragment(frag, ts, { rows, cols, spp, bitsAllocated, signed }) {
  const n = rows * cols;
  if (ts === TS.RLE) return { samples: unpack(rleDecode(frag, n, spp, bitsAllocated), { n, spp, bitsAllocated, signed, bigEndian: false }), planar: true };
  if (ts === TS.JPEG_BASELINE || ts === TS.JPEG_EXTENDED) {
    // 8-bit streams through the 8-bit build, 12-bit ones through the 12-bit build; a stream that the
    // first cannot read is tried with the other.
    const order = bitsAllocated > 8 ? ['jpeg12', 'jpeg8'] : ['jpeg8', 'jpeg12'];
    let lastErr;
    for (const k of order) {
      try {
        const m = await codec(k);
        const d = new m.JPEGDecoder();
        try {
          const eb = d.getEncodedBuffer(frag.length); eb.set(frag); d.decode();
          const fi = d.getFrameInfo(); const out = d.getDecodedBuffer();
          return { samples: typed(out, fi, signed), planar: false, width: fi.width, height: fi.height };
        } finally { d.delete(); }
      } catch (err) { lastErr = err; }
    }
    throw new Error(`DICOM JPEG: ${lastErr && lastErr.message ? lastErr.message : lastErr}`);
  }
  if (ts === TS.JPEG_LOSSLESS || ts === TS.JPEG_LOSSLESS_SV1) {
    const m = await codec('lossless');
    const d = new m.Decoder();
    const out = d.decode(frag.buffer.slice(frag.byteOffset, frag.byteOffset + frag.byteLength));
    const samples = d.numBytes === 2 ? (signed ? new Int16Array(out) : new Uint16Array(out)) : (signed ? new Int8Array(out) : new Uint8Array(out));
    return { samples, planar: false };
  }
  if (ts === TS.JPEG_LS_LOSSLESS || ts === TS.JPEG_LS) {
    const m = await codec('jpegls');
    const d = new m.JpegLSDecoder();
    try {
      const eb = d.getEncodedBuffer(frag.length); eb.set(frag); d.decode();
      const fi = d.getFrameInfo(); const out = d.getDecodedBuffer();
      return { samples: typed(out, fi, signed), planar: fi.componentCount > 1 && d.getInterleaveMode() === 0 };
    } finally { d.delete(); }
  }
  if (ts === TS.J2K_LOSSLESS || ts === TS.J2K || ts === TS.HTJ2K_LOSSLESS || ts === TS.HTJ2K_LOSSLESS_RPCL || ts === TS.HTJ2K) {
    const m = await codec('j2k');
    const d = new m.J2KDecoder();
    try {
      const eb = d.getEncodedBuffer(frag.length); eb.set(frag); d.decode();
      const fi = d.getFrameInfo(); const out = d.getDecodedBuffer();
      return { samples: typed(out, fi, signed || fi.isSigned), planar: false };
    } finally { d.delete(); }
  }
  throw new Error(`DICOM: unsupported transfer syntax ${ts}${TS_NAME[ts] ? ` (${TS_NAME[ts]})` : ''}`);
}

// A codec's output buffer as the typed array the frame info says it is.
function typed(out, fi, signed) {
  if (out instanceof Uint16Array || out instanceof Int16Array) return signed && out instanceof Uint16Array ? new Int16Array(out.buffer, out.byteOffset, out.length) : out;
  const bytes = out instanceof Uint8Array || out instanceof Uint8ClampedArray ? out : new Uint8Array(out.buffer || out);
  if (fi.bitsPerSample > 8) {
    const len = bytes.byteLength >> 1;
    const copy = new Uint8Array(len * 2); copy.set(bytes.subarray(0, len * 2));   // aligned copy
    return signed ? new Int16Array(copy.buffer) : new Uint16Array(copy.buffer);
  }
  return signed ? new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// DICOM RLE (PackBits per segment; segments are planes: one for 8-bit gray, two for 16-bit, three for RGB).
function rleDecode(frame, pixels, samples, bitsAllocated) {
  const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const nSeg = dv.getUint32(0, true);
  const bytesPer = bitsAllocated / 8;
  const out = new Uint8Array(pixels * samples * bytesPer);
  for (let s = 0; s < nSeg && s < 15; s++) {
    const start = dv.getUint32(4 + s * 4, true);
    const end = s + 1 < nSeg ? dv.getUint32(8 + s * 4, true) : frame.byteLength;
    // Segment s holds byte s of every sample (most significant first for 16-bit). Output is planar per
    // sample, little-endian per pixel.
    const sample = Math.floor(s / bytesPer), byte = bytesPer - 1 - (s % bytesPer);
    let i = start, o = 0;
    while (i < end && o < pixels) {
      let n = frame[i++];
      if (n > 128) { n = 257 - n; const v = frame[i++]; for (let k = 0; k < n && o < pixels; k++, o++) out[(sample * pixels + o) * bytesPer + byte] = v; }
      else if (n < 128) { n += 1; for (let k = 0; k < n && o < pixels; k++, o++) out[(sample * pixels + o) * bytesPer + byte] = frame[i++]; }
    }
  }
  return out;
}

// PALETTE COLOR: the three lookup tables (descriptor: entries, first value, bits).
function readPalette(ds) {
  const desc = ds.elements.x00281101;
  if (!desc) return null;
  const n0 = ds.uint16('x00281101', 0), first = ds.uint16('x00281101', 1), bits = ds.uint16('x00281101', 2);
  const n = n0 === 0 ? 65536 : n0;
  const table = (tag) => {
    const el = ds.elements[tag];
    if (!el) return null;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (bits === 8 && el.length === n) out[i] = ds.byteArray[el.dataOffset + i];
      else { const v = ds.uint16(tag, i); out[i] = bits > 8 ? v >> (bits - 8) : v; }
    }
    return out;
  };
  const r = table('x00281201'), g = table('x00281202'), b = table('x00281203');
  return r && g && b ? { n, first, r, g, b } : null;
}
