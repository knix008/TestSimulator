// Writers for the extra formats: RGBA pixels ({ width, height, data }) → file
// bytes. Each output is read back by our own decoders (extra.js, dicomDecoder.js)
// in the unit tests. Pure functions: they run in the page, workers and Node.

const u8 = (n) => new Uint8Array(n);
const ascii = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
function concat(parts) {
  const out = u8(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
const flatten = (image, background = 255) => {
  // RGB with transparency composited on white.
  const { width, height, data } = image;
  const rgb = u8(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(data[i * 4 + c] * a + background * (1 - a));
  }
  return rgb;
};

/** Truevision TGA, 32-bit with alpha, top-down. */
export function encodeTga({ width, height, data }) {
  const out = u8(18 + width * height * 4);
  out[2] = 2;
  out[12] = width & 0xff; out[13] = width >> 8; out[14] = height & 0xff; out[15] = height >> 8;
  out[16] = 32; out[17] = 0x28; // 8 alpha bits, top-left origin
  for (let i = 0; i < width * height; i++) {
    out[18 + i * 4] = data[i * 4 + 2]; out[19 + i * 4] = data[i * 4 + 1]; out[20 + i * 4] = data[i * 4]; out[21 + i * 4] = data[i * 4 + 3];
  }
  return out;
}

/** Netpbm P6 (binary RGB). */
export function encodePpm(image) {
  return concat([ascii(`P6\n${image.width} ${image.height}\n255\n`), flatten(image)]);
}

/** QOI with RGBA, run and index operations. */
export function encodeQoi({ width, height, data }) {
  const out = [];
  const header = u8(14);
  header.set(ascii('qoif'));
  new DataView(header.buffer).setUint32(4, width);
  new DataView(header.buffer).setUint32(8, height);
  header[12] = 4; header[13] = 0;
  const seen = new Uint32Array(64);
  let prev = 0xff000000 >>> 0; // r g b a packed as a<<24|b<<16|g<<8|r
  let [pr, pg, pb, pa] = [0, 0, 0, 255];
  let run = 0;
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2]; const a = data[i * 4 + 3];
    const packed = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    if (packed === prev) {
      run += 1;
      if (run === 62 || i === total - 1) { out.push(0xc0 | (run - 1)); run = 0; }
      continue;
    }
    if (run) { out.push(0xc0 | (run - 1)); run = 0; }
    const hash = (r * 3 + g * 5 + b * 7 + a * 11) % 64;
    if (seen[hash] === packed) out.push(hash);
    else {
      seen[hash] = packed;
      if (a === pa) {
        const dr = (r - pr) << 24 >> 24; const dg = (g - pg) << 24 >> 24; const db = (b - pb) << 24 >> 24;
        const drg = dr - dg; const dbg = db - dg;
        if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2) out.push(0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2));
        else if (dg > -33 && dg < 32 && drg > -9 && drg < 8 && dbg > -9 && dbg < 8) out.push(0x80 | (dg + 32), ((drg + 8) << 4) | (dbg + 8));
        else out.push(0xfe, r, g, b);
      } else out.push(0xff, r, g, b, a);
    }
    prev = packed; pr = r; pg = g; pb = b; pa = a;
  }
  return concat([header, Uint8Array.from(out), Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 1)]);
}

/** ZSoft PCX, 24-bit (three planes per line), RLE. */
export function encodePcx(image) {
  const { width, height } = image;
  const rgb = flatten(image);
  const bytesPerLine = width + (width % 2);
  const header = u8(128);
  const view = new DataView(header.buffer);
  header[0] = 10; header[1] = 5; header[2] = 1; header[3] = 8;
  view.setUint16(8, width - 1, true); view.setUint16(10, height - 1, true);
  view.setUint16(12, 72, true); view.setUint16(14, 72, true);
  header[65] = 3;
  view.setUint16(66, bytesPerLine, true); view.setUint16(68, 1, true);
  const out = [];
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      for (let x = 0; x < bytesPerLine;) {
        const value = x < width ? rgb[(y * width + x) * 3 + c] : 0;
        let run = 1;
        while (x + run < bytesPerLine && run < 63 && (x + run < width ? rgb[(y * width + x + run) * 3 + c] : 0) === value) run++;
        if (run > 1 || value >= 0xc0) out.push(0xc0 | run, value); else out.push(value);
        x += run;
      }
    }
  }
  return concat([header, Uint8Array.from(out)]);
}

/** SGI image, verbatim RGBA, rows bottom to top. */
export function encodeSgi({ width, height, data }) {
  const header = u8(512);
  const view = new DataView(header.buffer);
  view.setUint16(0, 474); header[2] = 0; header[3] = 1;
  view.setUint16(4, 3); view.setUint16(6, width); view.setUint16(8, height); view.setUint16(10, 4);
  view.setUint32(16, 255);
  const body = u8(width * height * 4);
  for (let c = 0; c < 4; c++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) body[c * width * height + y * width + x] = data[((height - 1 - y) * width + x) * 4 + c];
  return concat([header, body]);
}

/** Sun raster, 24-bit BGR, rows padded to 16 bits. */
export function encodeRas(image) {
  const { width, height } = image;
  const rgb = flatten(image);
  const rowBytes = Math.ceil((width * 3) / 2) * 2;
  const header = u8(32);
  const view = new DataView(header.buffer);
  [0x59a66a95, width, height, 24, rowBytes * height, 1, 0, 0].forEach((v, i) => view.setUint32(i * 4, v));
  const body = u8(rowBytes * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = (y * width + x) * 3;
    body.set([rgb[s + 2], rgb[s + 1], rgb[s]], y * rowBytes + x * 3);
  }
  return concat([header, body]);
}

/** DirectDraw Surface, uncompressed A8R8G8B8. */
export function encodeDds({ width, height, data }) {
  const header = u8(128);
  const view = new DataView(header.buffer);
  header.set(ascii('DDS '));
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x8, true);
  view.setUint32(12, height, true); view.setUint32(16, width, true); view.setUint32(20, width * 4, true);
  view.setUint32(76, 32, true); view.setUint32(80, 0x41, true); view.setUint32(88, 32, true);
  view.setUint32(92, 0x00ff0000, true); view.setUint32(96, 0x0000ff00, true); view.setUint32(100, 0x000000ff, true); view.setUint32(104, 0xff000000, true);
  view.setUint32(108, 0x1000, true);
  const body = u8(width * height * 4);
  for (let i = 0; i < width * height; i++) body.set([data[i * 4 + 2], data[i * 4 + 1], data[i * 4], data[i * 4 + 3]], i * 4);
  return concat([header, body]);
}

/** Radiance HDR (flat RGBE), from sRGB values. */
export function encodeHdr({ width, height, data }) {
  const head = ascii(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const body = u8(width * height * 4);
  const linear = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  for (let i = 0; i < width * height; i++) {
    const rgb = [0, 1, 2].map((c) => linear(data[i * 4 + c]));
    const max = Math.max(...rgb);
    if (max < 1e-32) continue;
    const e = Math.ceil(Math.log2(max));
    const k = 256 / 2 ** e;
    body.set([...rgb.map((v) => Math.min(255, Math.floor(v * k))), e + 128], i * 4);
  }
  return concat([head, body]);
}

/** X11 bitmap (black where the picture is dark). */
export function encodeXbm({ width, height, data }, name = 'image') {
  const bytesPerRow = Math.ceil(width / 8);
  const values = [];
  for (let y = 0; y < height; y++) for (let b = 0; b < bytesPerRow; b++) {
    let v = 0;
    for (let bit = 0; bit < 8; bit++) {
      const x = b * 8 + bit;
      if (x >= width) continue;
      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (data[i + 3] > 127 && luma < 128) v |= 1 << bit;
    }
    values.push(`0x${v.toString(16).padStart(2, '0')}`);
  }
  const id = name.replace(/[^A-Za-z0-9_]/g, '_') || 'image';
  return ascii(`#define ${id}_width ${width}\n#define ${id}_height ${height}\nstatic unsigned char ${id}_bits[] = {\n${values.join(', ')}\n};\n`);
}

/** Windows icon holding one PNG (any size up to 256 × 256). */
export function encodeIco(png, width, height) {
  const dir = u8(22);
  const view = new DataView(dir.buffer);
  view.setUint16(2, 1, true); view.setUint16(4, 1, true);
  dir[6] = width >= 256 ? 0 : width; dir[7] = height >= 256 ? 0 : height;
  view.setUint16(10, 1, true); view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true); view.setUint32(18, 22, true);
  return concat([dir, png]);
}

/** DICOM secondary capture (explicit VR little endian, 8-bit RGB). */
export function encodeDicom(image, { patientName = 'Anonymous', description = 'MyPhotoManager' } = {}) {
  const { width, height } = image;
  const rgb = flatten(image);
  const parts = [];
  const pad = (bytes, filler = 0x20) => (bytes.length % 2 ? concat([bytes, Uint8Array.of(filler)]) : bytes);
  const element = (group, elem, vr, value) => {
    let bytes;
    if (vr === 'US') { bytes = u8(2); new DataView(bytes.buffer).setUint16(0, value, true); } else if (value instanceof Uint8Array) bytes = pad(value, 0); else bytes = pad(ascii(String(value)), vr === 'UI' ? 0 : 0x20);
    const long = ['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr);
    const head = u8(long ? 12 : 8);
    const view = new DataView(head.buffer);
    view.setUint16(0, group, true); view.setUint16(2, elem, true);
    head.set(ascii(vr), 4);
    if (long) view.setUint32(8, bytes.length, true); else view.setUint16(6, bytes.length, true);
    parts.push(head, bytes);
  };
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const uid = `2.25.${BigInt(Date.now()) * 1000003n + BigInt(Math.floor(Math.random() * 1e6))}`;
  // File meta group (0002) with its length.
  element(0x0002, 0x0001, 'OB', Uint8Array.of(0, 1));
  element(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.7');
  element(0x0002, 0x0003, 'UI', uid);
  element(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');
  element(0x0002, 0x0012, 'UI', '2.25.1');
  const meta = concat(parts.splice(0));
  const groupLength = u8(12);
  const gv = new DataView(groupLength.buffer);
  gv.setUint16(0, 2, true); gv.setUint16(2, 0, true); groupLength.set(ascii('UL'), 4); gv.setUint16(6, 4, true); gv.setUint32(8, meta.length, true);
  element(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.7');
  element(0x0008, 0x0018, 'UI', uid);
  element(0x0008, 0x0020, 'DA', date);
  element(0x0008, 0x0060, 'CS', 'OT');
  element(0x0008, 0x0064, 'CS', 'WSD');
  element(0x0008, 0x1030, 'LO', description);
  element(0x0010, 0x0010, 'PN', patientName);
  element(0x0028, 0x0002, 'US', 3);
  element(0x0028, 0x0004, 'CS', 'RGB');
  element(0x0028, 0x0006, 'US', 0);
  element(0x0028, 0x0010, 'US', height);
  element(0x0028, 0x0011, 'US', width);
  element(0x0028, 0x0100, 'US', 8);
  element(0x0028, 0x0101, 'US', 8);
  element(0x0028, 0x0102, 'US', 7);
  element(0x0028, 0x0103, 'US', 0);
  element(0x7fe0, 0x0010, 'OB', rgb);
  return concat([u8(128), ascii('DICM'), groupLength, meta, ...parts]);
}
