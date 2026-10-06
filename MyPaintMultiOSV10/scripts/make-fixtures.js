/* Writes the generated test pictures into test/fixtures: a TIFF in colour, a 16-bit grey
 * TIFF, and a synthetic multi-frame CT in DICOM. The real DICOM files next to them come
 * from the pydicom test set (see test/fixtures/README.md) and are not generated here. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Encoders = require("../src/encoders");

const dest = path.join(__dirname, "..", "test", "fixtures");
fs.mkdirSync(dest, { recursive: true });

function gradient(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      rgba[at] = Math.round((x * 255) / Math.max(1, width - 1));
      rgba[at + 1] = Math.round((y * 255) / Math.max(1, height - 1));
      rgba[at + 2] = 77;
      rgba[at + 3] = 255;
    }
  }
  return rgba;
}

/* ── a very small DICOM writer (Explicit VR Little Endian, Part 10) ── */

function element(tag, vr, value) {
  const group = tag >>> 16;
  const el = tag & 0xffff;
  let data;
  if (vr === "US") {
    data = Buffer.alloc(2 * value.length);
    value.forEach((item, index) => data.writeUInt16LE(item, index * 2));
  } else if (vr === "OB" || vr === "OW") {
    data = Buffer.from(value);
  } else {
    let text = Array.isArray(value) ? value.join("\\") : String(value);
    if (text.length % 2) text += vr === "UI" ? "\0" : " ";
    data = Buffer.from(text, "latin1");
  }
  const long = LONG_VR.indexOf(vr) >= 0;
  const head = Buffer.alloc(long ? 12 : 8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(el, 2);
  head.write(vr, 4, "latin1");
  if (long) head.writeUInt32LE(data.length, 8);
  else head.writeUInt16LE(data.length, 6);
  return Buffer.concat([head, data]);
}

const LONG_VR = ["OB", "OW", "OF", "OD", "SQ", "UN", "UT"];

/* The same element, written the way Explicit VR Big Endian asks for it. */
function elementBE(tag, vr, value) {
  const group = tag >>> 16;
  const el = tag & 0xffff;
  let data;
  if (vr === "US") {
    data = Buffer.alloc(2 * value.length);
    value.forEach((item, index) => data.writeUInt16BE(item, index * 2));
  } else if (vr === "OB" || vr === "OW") {
    data = Buffer.from(value);
  } else {
    let text = Array.isArray(value) ? value.join("\\") : String(value);
    if (text.length % 2) text += vr === "UI" ? "\0" : " ";
    data = Buffer.from(text, "latin1");
  }
  const long = LONG_VR.indexOf(vr) >= 0;
  const head = Buffer.alloc(long ? 12 : 8);
  head.writeUInt16BE(group, 0);
  head.writeUInt16BE(el, 2);
  head.write(vr, 4, "latin1");
  if (long) head.writeUInt32BE(data.length, 8);
  else head.writeUInt16BE(data.length, 6);
  return Buffer.concat([head, data]);
}

/* Group 0002 and its length, for a file that carries a file meta group. */
function fileMeta(ts, instance) {
  const meta = Buffer.concat([
    element(0x00020001, "OB", [0, 1]),
    element(0x00020002, "UI", "1.2.840.10008.5.1.4.1.1.7"),
    element(0x00020003, "UI", "1.2.826.0.1.3680043.9.7777." + instance),
    element(0x00020010, "UI", ts),
    element(0x00020012, "UI", "1.2.826.0.1.3680043.9.7777.0"),
  ]);
  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(2, 0);
  groupLength.writeUInt16LE(0, 2);
  groupLength.write("UL", 4, "latin1");
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(meta.length, 8);
  return Buffer.concat([groupLength, meta]);
}

function part10(ts, instance, body) {
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM", "latin1"), fileMeta(ts, instance), body]);
}

/* Pixel data split into one encapsulated item per frame, with the offset table readers use. */
function encapsulated(frames) {
  const items = frames.map((frame) => {
    const even = frame.length % 2 ? Buffer.concat([frame, Buffer.alloc(1)]) : frame;
    const head = Buffer.alloc(8);
    head.writeUInt16LE(0xfffe, 0);
    head.writeUInt16LE(0xe000, 2);
    head.writeUInt32LE(even.length, 4);
    return Buffer.concat([head, even]);
  });
  const table = Buffer.alloc(4 * items.length);
  let at = 0;
  items.forEach((item, index) => { table.writeUInt32LE(at, index * 4); at += item.length; });
  const tableHead = Buffer.alloc(8);
  tableHead.writeUInt16LE(0xfffe, 0);
  tableHead.writeUInt16LE(0xe000, 2);
  tableHead.writeUInt32LE(table.length, 4);
  const pxHead = Buffer.alloc(12);
  pxHead.writeUInt16LE(0x7fe0, 0);
  pxHead.writeUInt16LE(0x0010, 2);
  pxHead.write("OB", 4, "latin1");
  pxHead.writeUInt32LE(0xffffffff, 8);
  const end = Buffer.alloc(8);
  end.writeUInt16LE(0xfffe, 0);
  end.writeUInt16LE(0xe0dd, 2);
  end.writeUInt32LE(0, 4);
  return Buffer.concat([pxHead, tableHead, table, ...items, end]);
}

function spherePixels(rows, cols, frames) {
  const out = new Uint16Array(rows * cols * frames);
  const radius = Math.min(rows, cols) * 0.35;
  for (let f = 0; f < frames; f += 1) {
    const slice = (f - (frames - 1) / 2) * (radius / Math.max(1, frames));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const dx = x - cols / 2;
        const dy = y - rows / 2;
        const distance = Math.sqrt(dx * dx + dy * dy + slice * slice);
        const value = distance < radius ? 1200 - Math.round((distance / radius) * 200) : 100 + ((x + y) % 40);
        out[f * rows * cols + y * cols + x] = value;
      }
    }
  }
  return out;
}

function makeDicom(options) {
  const rows = options.rows;
  const cols = options.cols;
  const frames = options.frames || 1;
  const pixels = spherePixels(rows, cols, frames);
  const meta = Buffer.concat([
    element(0x00020001, "OB", [0, 1]),
    element(0x00020002, "UI", "1.2.840.10008.5.1.4.1.1.2"),
    element(0x00020003, "UI", "1.2.826.0.1.3680043.9.7777." + options.instance),
    element(0x00020010, "UI", "1.2.840.10008.1.2.1"),
    element(0x00020012, "UI", "1.2.826.0.1.3680043.9.7777.0"),
  ]);
  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(2, 0);
  groupLength.writeUInt16LE(0, 2);
  groupLength.write("UL", 4, "latin1");
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(meta.length, 8);
  const body = Buffer.concat([
    element(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.2"),
    element(0x00080018, "UI", "1.2.826.0.1.3680043.9.7777." + options.instance),
    element(0x00080020, "DA", "20261005"),
    element(0x00080030, "TM", "101500"),
    element(0x00080060, "CS", "CT"),
    element(0x00080070, "LO", "MyPaint tests"),
    element(0x00081030, "LO", "Synthetic study"),
    element(0x0008103e, "LO", "Synthetic sphere"),
    element(0x00100010, "PN", "Test^Phantom"),
    element(0x00100020, "LO", "PH-001"),
    element(0x00100040, "CS", "O"),
    element(0x00180050, "DS", "2"),
    element(0x00181063, "DS", "100"),
    element(0x0020000d, "UI", "1.2.826.0.1.3680043.9.7777"),
    element(0x0020000e, "UI", "1.2.826.0.1.3680043.9.7777.1"),
    element(0x00200011, "IS", "1"),
    element(0x00200013, "IS", String(options.instance)),
    element(0x00200032, "DS", ["-32", "-32", "0"]),
    element(0x00200037, "DS", ["1", "0", "0", "0", "1", "0"]),
    element(0x00280002, "US", [1]),
    element(0x00280004, "CS", "MONOCHROME2"),
  ].concat(frames > 1 ? [element(0x00280008, "IS", String(frames))] : []).concat([
    element(0x00280010, "US", [rows]),
    element(0x00280011, "US", [cols]),
    element(0x00280030, "DS", ["0.5", "0.5"]),
    element(0x00280100, "US", [16]),
    element(0x00280101, "US", [16]),
    element(0x00280102, "US", [15]),
    element(0x00280103, "US", [0]),
    element(0x00281050, "DS", "600"),
    element(0x00281051, "DS", "1600"),
    element(0x00281052, "DS", "-1024"),
    element(0x00281053, "DS", "1"),
    element(0x00281054, "LO", "HU"),
    element(0x7fe00010, "OW", Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)),
  ]));
  const file = Buffer.concat([groupLength, meta, body]);
  if (options.skip === "preamble") return file;   // the file meta group is there, the preamble is not
  if (options.skip === "meta") return body;       // a bare data set: no preamble, no file meta
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM", "latin1"), file]);
}

/* ── 3x3 RGB: an odd number of bytes written as OW, in both byte orders ── */

const ODD_RGB = [
  [166, 141, 52], [12, 200, 90], [240, 30, 30],
  [63, 87, 176], [255, 255, 0], [0, 128, 255],
  [158, 158, 158], [20, 20, 20], [250, 120, 200],
];

function oddRgbFile(bigEndian) {
  const write = bigEndian ? elementBE : element;
  const px = Buffer.alloc(28);                      // 27 bytes of pixels, padded to a whole word
  ODD_RGB.forEach((rgb, index) => { px[index * 3] = rgb[0]; px[index * 3 + 1] = rgb[1]; px[index * 3 + 2] = rgb[2]; });
  if (bigEndian) for (let at = 0; at < px.length; at += 2) { const b = px[at]; px[at] = px[at + 1]; px[at + 1] = b; }
  const body = Buffer.concat([
    write(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.7"),
    write(0x00080060, "CS", "OT"),
    write(0x00100010, "PN", "Test^Colour"),
    write(0x00280002, "US", [3]),
    write(0x00280004, "CS", "RGB"),
    write(0x00280006, "US", [0]),
    write(0x00280010, "US", [3]),
    write(0x00280011, "US", [3]),
    write(0x00280100, "US", [8]),
    write(0x00280101, "US", [8]),
    write(0x00280102, "US", [7]),
    write(0x00280103, "US", [0]),
    write(0x7fe00010, "OW", px),
  ]);
  return part10(bigEndian ? "1.2.840.10008.1.2.2" : "1.2.840.10008.1.2.1", bigEndian ? 11 : 10, body);
}

/* ── the same YBR picture with full chroma and with 4:2:2 subsampling ── */

function ybrPlanes(cols, rows) {
  const y = [];
  const cb = [];
  const cr = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      y.push(30 + ((r * cols + c) * 13) % 200);
      const pair = r * cols + (c - (c % 2));    // both pixels of a pair carry the same chroma
      cb.push(60 + (pair * 7) % 150);
      cr.push(90 + (pair * 11) % 140);
    }
  }
  return { y, cb, cr };
}

function ybrFile(subsampled) {
  const cols = 4;
  const rows = 4;
  const { y, cb, cr } = ybrPlanes(cols, rows);
  const n = cols * rows;
  const px = Buffer.alloc(subsampled ? n * 2 : n * 3);
  if (subsampled) {
    for (let p = 0; p < n; p += 2) {
      const at = (p >> 1) * 4;
      px[at] = y[p]; px[at + 1] = y[p + 1]; px[at + 2] = cb[p]; px[at + 3] = cr[p];
    }
  } else {
    for (let p = 0; p < n; p += 1) { px[p * 3] = y[p]; px[p * 3 + 1] = cb[p]; px[p * 3 + 2] = cr[p]; }
  }
  const body = Buffer.concat([
    element(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.7"),
    element(0x00080060, "CS", "OT"),
    element(0x00280002, "US", [3]),
    element(0x00280004, "CS", subsampled ? "YBR_FULL_422" : "YBR_FULL"),
    element(0x00280006, "US", [0]),
    element(0x00280010, "US", [rows]),
    element(0x00280011, "US", [cols]),
    element(0x00280100, "US", [8]),
    element(0x00280101, "US", [8]),
    element(0x00280102, "US", [7]),
    element(0x00280103, "US", [0]),
    element(0x7fe00010, "OB", px),
  ]);
  return part10("1.2.840.10008.1.2.1", subsampled ? 13 : 12, body);
}

/* ── Float Pixel Data with the narrow window such files carry ── */

function floatFile() {
  const cols = 16;
  const rows = 16;
  const values = new Float32Array(rows * cols);
  for (let i = 0; i < values.length; i += 1) values[i] = i / (values.length - 1);
  const body = Buffer.concat([
    element(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.30"),
    element(0x00080060, "CS", "OT"),
    element(0x00280002, "US", [1]),
    element(0x00280004, "CS", "MONOCHROME2"),
    element(0x00280010, "US", [rows]),
    element(0x00280011, "US", [cols]),
    element(0x00280100, "US", [32]),
    element(0x00280101, "US", [32]),
    element(0x00280103, "US", [0]),
    element(0x00281050, "DS", "0.5"),
    element(0x00281051, "DS", "1"),
    element(0x7fe00008, "OF", Buffer.from(values.buffer, values.byteOffset, values.byteLength)),
  ]);
  return part10("1.2.840.10008.1.2.1", 14, body);
}

/* ── two frames, plain and with each frame deflated on its own ── */

function framePixels(cols, rows, frames) {
  const out = [];
  for (let f = 0; f < frames; f += 1) {
    const frame = Buffer.alloc(rows * cols);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) frame[y * cols + x] = (x * 11 + y * 5 + f * 97) % 256;
    }
    out.push(frame);
  }
  return out;
}

function framesFile(deflateFrames) {
  const cols = 16;
  const rows = 16;
  const frames = framePixels(cols, rows, 2);
  const head = Buffer.concat([
    element(0x00080016, "UI", "1.2.840.10008.5.1.4.1.1.7"),
    element(0x00080060, "CS", "OT"),
    element(0x00280002, "US", [1]),
    element(0x00280004, "CS", "MONOCHROME2"),
    element(0x00280008, "IS", String(frames.length)),
    element(0x00280010, "US", [rows]),
    element(0x00280011, "US", [cols]),
    element(0x00280100, "US", [8]),
    element(0x00280101, "US", [8]),
    element(0x00280102, "US", [7]),
    element(0x00280103, "US", [0]),
  ]);
  const px = deflateFrames
    ? encapsulated(frames.map((frame) => zlib.deflateRawSync(frame)))
    : element(0x7fe00010, "OB", Buffer.concat(frames));
  return part10(deflateFrames ? "1.2.840.10008.1.2.8.1" : "1.2.840.10008.1.2.1", deflateFrames ? 16 : 15, Buffer.concat([head, px]));
}

const rgba = gradient(64, 48);
fs.writeFileSync(path.join(dest, "gradient.tif"), Buffer.from(Encoders.tiff({ width: 64, height: 48, rgba: rgba, dpi: 300 })));

const gray16 = new Uint16Array(32 * 16);
for (let i = 0; i < gray16.length; i += 1) gray16[i] = Math.round((i / gray16.length) * 65535);
fs.writeFileSync(path.join(dest, "gray16.tif"), Buffer.from(Encoders.tiff({ width: 32, height: 16, gray16: gray16 })));

fs.writeFileSync(path.join(dest, "gradient.bmp"), Buffer.from(Encoders.bmp({ width: 64, height: 48, rgba: rgba })));
fs.writeFileSync(path.join(dest, "gradient.gif"), Buffer.from(Encoders.gif({ width: 64, height: 48, rgba: rgba })));

fs.writeFileSync(path.join(dest, "ct-sphere.dcm"), makeDicom({ rows: 64, cols: 64, frames: 1, instance: 1 }));
fs.writeFileSync(path.join(dest, "ct-multiframe.dcm"), makeDicom({ rows: 48, cols: 48, frames: 8, instance: 2 }));

/* The same scan saved the way tools that leave out the Part 10 wrapper write it. */
fs.writeFileSync(path.join(dest, "ct-no-preamble.dcm"), makeDicom({ rows: 64, cols: 64, frames: 1, instance: 3, skip: "preamble" }));
fs.writeFileSync(path.join(dest, "ct-no-meta.dcm"), makeDicom({ rows: 64, cols: 64, frames: 1, instance: 4, skip: "meta" }));

fs.writeFileSync(path.join(dest, "rgb-odd.dcm"), oddRgbFile(false));
fs.writeFileSync(path.join(dest, "rgb-odd-be.dcm"), oddRgbFile(true));
fs.writeFileSync(path.join(dest, "ybr-full.dcm"), ybrFile(false));
fs.writeFileSync(path.join(dest, "ybr-422.dcm"), ybrFile(true));
fs.writeFileSync(path.join(dest, "float-map.dcm"), floatFile());
fs.writeFileSync(path.join(dest, "frames-plain.dcm"), framesFile(false));
fs.writeFileSync(path.join(dest, "frames-deflated.dcm"), framesFile(true));

console.log("fixtures ready in test/fixtures");
