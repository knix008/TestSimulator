import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBmp, encodeTga, encodeTiff, pdfWithJpeg } from '../../src/io/imageformats.js';
import { isNight, sunAngles, sunDirection } from '../../src/engine/sun.js';
import { buildTemplate } from '../../src/engine/templates.js';

// 3 × 2 RGBA picture with distinct pixels (alpha alternates).
const W = 3; const H = 2;
const PX = new Uint8ClampedArray(W * H * 4).map((_, i) => (i % 4 === 3 ? (i % 8 === 3 ? 255 : 128) : (i * 17) % 256));
const pixel = (x, y) => Array.from(PX.slice((y * W + x) * 4, (y * W + x) * 4 + 4));

test('BMP: 24-bit header, rows bottom-up and padded to 4 bytes', () => {
  const b = encodeBmp(PX, W, H);
  const v = new DataView(b.buffer);
  assert.equal(String.fromCharCode(b[0], b[1]), 'BM');
  assert.equal(v.getUint32(2, true), b.length);
  assert.equal(v.getInt32(18, true), W);
  assert.equal(v.getInt32(22, true), H);
  assert.equal(v.getUint16(28, true), 24);
  const row = Math.ceil((W * 3) / 4) * 4;
  assert.equal(b.length, 54 + row * H);
  // First stored row is the bottom row of the picture, in BGR order.
  const [r, g, bl] = pixel(0, H - 1);
  assert.deepEqual(Array.from(b.slice(54, 57)), [bl, g, r]);
});

test('TGA: 32-bit BGRA with top-left origin, or 24-bit without alpha', () => {
  const t = encodeTga(PX, W, H, true);
  assert.equal(t[2], 2);
  assert.equal(t[16], 32);
  assert.equal(t[17] & 0x20, 0x20);
  const [r, g, bl, a] = pixel(1, 0);
  assert.deepEqual(Array.from(t.slice(18 + 4, 18 + 8)), [bl, g, r, a]);
  assert.equal(encodeTga(PX, W, H, false).length, 18 + W * H * 3);
});

test('TIFF: little-endian baseline, one uncompressed strip holding RGBA in order', () => {
  const t = encodeTiff(PX, W, H, true);
  const v = new DataView(t.buffer);
  assert.equal(String.fromCharCode(t[0], t[1]), 'II');
  assert.equal(v.getUint16(2, true), 42);
  const ifd = v.getUint32(4, true);
  const entries = v.getUint16(ifd, true);
  const tags = new Map();
  for (let i = 0; i < entries; i++) { const p = ifd + 2 + i * 12; tags.set(v.getUint16(p, true), { type: v.getUint16(p + 2, true), count: v.getUint32(p + 4, true), value: v.getUint16(p + 2, true) === 3 ? v.getUint16(p + 8, true) : v.getUint32(p + 8, true) }); }
  assert.equal(tags.get(256).value, W);
  assert.equal(tags.get(257).value, H);
  assert.equal(tags.get(277).value, 4);
  assert.equal(tags.get(338).value, 2); // unassociated alpha
  const offset = tags.get(273).value;
  assert.equal(tags.get(279).value, W * H * 4);
  assert.deepEqual(Array.from(t.slice(offset, offset + W * H * 4)), Array.from(PX));
  assert.equal(encodeTiff(PX, W, H, false).at(-1), PX[PX.length - 2]); // RGB only: last byte is the last blue
});

test('PDF: one page the size of the picture, xref offsets point at their objects', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfWithJpeg(jpeg, 400, 300);
  const s = Buffer.from(pdf).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.includes('/MediaBox [0 0 300 225]'));
  assert.ok(s.includes('/Filter /DCTDecode /Length 9'));
  const xref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(xref, xref + 4), 'xref');
  const offsets = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  assert.equal(offsets.length, 5);
  offsets.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});

test('sun: set by hand overrides date and time; below the horizon is night', () => {
  const base = { date: '06-21', time: '14:00', latitude: 37.57, longitude: 126.98, utcOffset: 9, north: 0 };
  assert.equal(isNight(base), false);
  assert.equal(isNight({ ...base, time: '23:00' }), true);
  const manual = { ...base, mode: 'manual', azimuth: 90, altitude: 30 };
  assert.deepEqual(sunAngles(manual), { azimuth: 90, altitude: 30 });
  const d = sunDirection(manual);
  // Azimuth 90° = east = +X; altitude 30° → y = 0.5.
  assert.ok(Math.abs(d.x - Math.cos(Math.PI / 6)) < 1e-9 && Math.abs(d.y - 0.5) < 1e-9 && Math.abs(d.z) < 1e-9, JSON.stringify(d));
  assert.equal(isNight({ ...manual, altitude: -10 }), true);
});

test('templates: three-storey house and office building have stacked levels and stairs', () => {
  const house = buildTemplate('house3');
  assert.equal(house.levels.length, 3);
  assert.equal(house.objects.filter((o) => o.item === 'stairs').length, 2);
  // Switchback (U) stairs with a half landing, stacked: the same place on both floors; the halls above keep a floor round the opening.
  const hs = house.objects.filter((o) => o.item === 'stairs');
  assert.ok(hs.every((o) => o.params.type === 'u' && Math.abs(o.rotation[1] - hs[0].rotation[1]) < 1e-9 && Math.hypot(o.position[0] - hs[0].position[0], o.position[2] - hs[0].position[2]) < 1e-9));
  assert.equal(house.rooms.filter((r) => r.holes?.length).length, 2);
  const building = buildTemplate('building');
  assert.equal(building.levels.length, 5);
  assert.ok(building.levels.every((l) => l.height === 3.3));
  for (let i = 1; i < 5; i++) assert.ok(Math.abs(building.levels[i].elevation - building.levels[i - 1].elevation - 3.6) < 1e-9);
  assert.equal(building.objects.filter((o) => o.item === 'stairs').length, 4);
});
