/* Tiny DICOM writer (Explicit VR Little Endian, Part 10) for test fixtures: a synthetic CT series /
 * multi-frame file with a bright sphere. Enough for the decoder, series sorting and MPR to work on. */
const fs = require('fs');
const path = require('path');

function element(tag, vr, value) {
  const group = tag >>> 16, el = tag & 0xffff;
  let data;
  if (vr === 'US') { data = Buffer.alloc(2 * value.length); value.forEach((v, i) => data.writeUInt16LE(v, i * 2)); }
  else if (vr === 'OW' || vr === 'OB') data = Buffer.from(value);
  else { let s = Array.isArray(value) ? value.join('\\') : String(value); if (s.length % 2) s += vr === 'UI' ? '\0' : ' '; data = Buffer.from(s, 'latin1'); }
  const long = ['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr);
  const head = Buffer.alloc(long ? 12 : 8);
  head.writeUInt16LE(group, 0); head.writeUInt16LE(el, 2); head.write(vr, 4, 'latin1');
  if (long) head.writeUInt32LE(data.length, 8); else head.writeUInt16LE(data.length, 6);
  return Buffer.concat([head, data]);
}

function makeDicom({ rows = 64, cols = 64, frames = 1, sliceIndex = 0, nSlices = 1, seriesUid = '1.2.826.0.1.3680043.9.9999.1', studyUid = '1.2.826.0.1.3680043.9.9999', instance = 1, spacing = [1, 1], thickness = 2, pixels }) {
  const meta = Buffer.concat([
    element(0x00020001, 'OB', [0, 1]), element(0x00020002, 'UI', '1.2.840.10008.5.1.4.1.1.2'), element(0x00020003, 'UI', `${seriesUid}.${instance}`),
    element(0x00020010, 'UI', '1.2.840.10008.1.2.1'), element(0x00020012, 'UI', '1.2.826.0.1.3680043.9.9999.0'),
  ]);
  const metaLen = element(0x00020000, 'UL', 0); // placeholder, rewritten below
  const groupLen = Buffer.alloc(12); groupLen.writeUInt16LE(2, 0); groupLen.writeUInt16LE(0, 2); groupLen.write('UL', 4, 'latin1'); groupLen.writeUInt16LE(4, 6); groupLen.writeUInt32LE(meta.length, 8);
  void metaLen;
  const z = (sliceIndex - (nSlices - 1) / 2) * thickness;
  const body = Buffer.concat([
    element(0x00080016, 'UI', '1.2.840.10008.5.1.4.1.1.2'), element(0x00080018, 'UI', `${seriesUid}.${instance}`), element(0x00080020, 'DA', '20260101'), element(0x00080060, 'CS', 'CT'),
    element(0x00080070, 'LO', 'DCM Viewer tests'), element(0x0008103E, 'LO', 'Synthetic sphere'),
    element(0x00100010, 'PN', 'Test^Phantom'), element(0x00100020, 'LO', 'PH-001'),
    element(0x00180050, 'DS', String(thickness)), element(0x00180088, 'DS', String(thickness)),
    element(0x0020000D, 'UI', studyUid), element(0x0020000E, 'UI', seriesUid), element(0x00200011, 'IS', '1'), element(0x00200013, 'IS', String(instance)),
    element(0x00200032, 'DS', ['-32', '-32', z.toFixed(1)]), element(0x00200037, 'DS', ['1', '0', '0', '0', '1', '0']), element(0x00201041, 'DS', z.toFixed(1)),
    element(0x00280002, 'US', [1]), element(0x00280004, 'CS', 'MONOCHROME2'), ...(frames > 1 ? [element(0x00280008, 'IS', String(frames))] : []),
    element(0x00280010, 'US', [rows]), element(0x00280011, 'US', [cols]), element(0x00280030, 'DS', spacing.map(String)),
    element(0x00280100, 'US', [16]), element(0x00280101, 'US', [16]), element(0x00280102, 'US', [15]), element(0x00280103, 'US', [1]),
    element(0x00281050, 'DS', '40'), element(0x00281051, 'DS', '400'), element(0x00281052, 'DS', '-1024'), element(0x00281053, 'DS', '1'),
    element(0x7FE00010, 'OW', pixels),
  ]);
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM', 'latin1'), groupLen, meta, body]);
}

/** Stored values (unsigned 16-bit; HU = v − 1024) of one slice of a sphere phantom. */
function spherePixels(rows, cols, zNorm) {
  const buf = Buffer.alloc(rows * cols * 2);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const dx = (x - cols / 2) / (cols / 2), dy = (y - rows / 2) / (rows / 2);
    const r = Math.sqrt(dx * dx + dy * dy + zNorm * zNorm);
    let hu = -1000;                       // air
    if (r < 0.9) hu = 40;                 // soft tissue
    if (r < 0.35) hu = 700;               // bone core
    if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.5 && r < 0.9 && r > 0.4) hu = -600;   // a "vessel" of lung density
    buf.writeUInt16LE(Math.max(0, Math.min(65535, hu + 1024)), (y * cols + x) * 2);
  }
  return buf;
}

function writeSeries(dir, { slices = 32, rows = 64, cols = 64 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 0; i < slices; i++) {
    const zNorm = (i - (slices - 1) / 2) / (slices / 2);
    const buf = makeDicom({ rows, cols, sliceIndex: i, nSlices: slices, instance: i + 1, pixels: spherePixels(rows, cols, zNorm) });
    // shuffled names to prove sorting works
    const name = `slice_${String((i * 7) % slices).padStart(3, '0')}.dcm`;
    fs.writeFileSync(path.join(dir, name), buf);
    files.push(name);
  }
  return files;
}

function writeMultiframe(file, { frames = 24, rows = 64, cols = 64 } = {}) {
  const parts = [];
  for (let i = 0; i < frames; i++) parts.push(spherePixels(rows, cols, (i - (frames - 1) / 2) / (frames / 2)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeDicom({ rows, cols, frames, pixels: Buffer.concat(parts) }));
  return file;
}

module.exports = { makeDicom, spherePixels, writeSeries, writeMultiframe };
