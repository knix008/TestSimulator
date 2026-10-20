import { describe, it, expect } from 'vitest';
import { encodeIco, encodeIcns } from '../src/lib/ico.mjs';

function fakePng(size, fill = 7) {
  return { size, png: Uint8Array.from({ length: 16 }, () => fill) };
}

describe('encodeIco', () => {
  it('writes ICONDIR + one ICONDIRENTRY per image', () => {
    const png = Uint8Array.from({ length: 8 }, (_, i) => i + 1);
    const ico = encodeIco([{ size: 16, png }]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(1);
    expect(ico[6]).toBe(16);
    expect(ico[7]).toBe(16);
    expect(view.getUint16(10, true)).toBe(1);
    expect(view.getUint16(12, true)).toBe(32);
    expect(view.getUint32(14, true)).toBe(8);
    expect(view.getUint32(18, true)).toBe(22);
    expect([...ico.subarray(22)]).toEqual([...png]);
  });

  it('encodes 256 as a zero dimension byte and sorts by size', () => {
    const ico = encodeIco([fakePng(256, 2), fakePng(16, 1)]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(4, true)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(ico[22]).toBe(0);
    expect(ico[23]).toBe(0);
  });

  it('drops entries larger than 256', () => {
    const ico = encodeIco([fakePng(512), fakePng(32)]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(4, true)).toBe(1);
    expect(ico[6]).toBe(32);
  });

  it('throws when nothing usable remains', () => {
    expect(() => encodeIco([])).toThrow(/at least one image/);
    expect(() => encodeIco([fakePng(512)])).toThrow(/at least one image/);
  });
});

describe('encodeIcns', () => {
  it('writes the icns magic and a big-endian total length', () => {
    const png = Uint8Array.from({ length: 4 }, () => 9);
    const icns = encodeIcns([{ size: 16, png }]);
    expect(String.fromCharCode(...icns.subarray(0, 4))).toBe('icns');
    const view = new DataView(icns.buffer);
    expect(view.getUint32(4, false)).toBe(icns.length);
    expect(String.fromCharCode(...icns.subarray(8, 12))).toBe('icp4');
    expect(view.getUint32(12, false)).toBe(8 + png.length);
    expect([...icns.subarray(16)]).toEqual([...png]);
  });

  it('uses the OSType for each supported size', () => {
    const types = {
      16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07',
      256: 'ic08', 512: 'ic09', 1024: 'ic10',
    };
    const entries = Object.keys(types).map((s) => fakePng(Number(s)));
    const icns = encodeIcns(entries);
    const body = String.fromCharCode(...icns);
    for (const t of Object.values(types)) expect(body).toContain(t);
  });

  it('ignores unsupported sizes and throws when none remain', () => {
    expect(() => encodeIcns([fakePng(24)])).toThrow(/16\/32\/64/);
    expect(() => encodeIcns([])).toThrow(/16\/32\/64/);
  });
});
