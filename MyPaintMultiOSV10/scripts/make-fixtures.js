/* Writes the generated test pictures into test/fixtures: a TIFF in colour, a 16-bit grey
 * TIFF, and a synthetic multi-frame CT in DICOM. The real DICOM files next to them come
 * from the pydicom test set (see test/fixtures/README.md) and are not generated here. */
const fs = require("fs");
const path = require("path");
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
  const long = ["OB", "OW", "SQ", "UN", "UT"].indexOf(vr) >= 0;
  const head = Buffer.alloc(long ? 12 : 8);
  head.writeUInt16LE(group, 0);
  head.writeUInt16LE(el, 2);
  head.write(vr, 4, "latin1");
  if (long) head.writeUInt32LE(data.length, 8);
  else head.writeUInt16LE(data.length, 6);
  return Buffer.concat([head, data]);
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
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM", "latin1"), groupLength, meta, body]);
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

console.log("fixtures ready in test/fixtures");
