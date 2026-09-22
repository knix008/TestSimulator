import { describe, it, expect } from 'vitest';
import {
  IMAGE_FORMATS, DEFAULT_FORMAT, formatById, formatByExtension, saveFilters,
  encodeBmp, encodeGif,
} from '../src/lib/image.js';

function rgbaSolid(width, height, r, g, b, a = 255) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return data;
}

function rgbaGradient(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / (width - 1 || 1)) * 255);
      data[i + 1] = Math.round((y / (height - 1 || 1)) * 255);
      data[i + 2] = 80;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('IMAGE_FORMATS', () => {
  it('lists PNG, JPEG, WebP, GIF and BMP', () => {
    expect(IMAGE_FORMATS.map((f) => f.id)).toEqual(['png', 'jpeg', 'webp', 'gif', 'bmp']);
    expect(DEFAULT_FORMAT).toBe('png');
  });

  it('marks lossy and alpha support correctly', () => {
    const by = Object.fromEntries(IMAGE_FORMATS.map((f) => [f.id, f]));
    expect(by.png.lossy).toBe(false);
    expect(by.png.alpha).toBe(true);
    expect(by.jpeg.lossy).toBe(true);
    expect(by.jpeg.alpha).toBe(false);
    expect(by.jpeg.ext).toBe('jpg');
    expect(by.webp.lossy).toBe(true);
    expect(by.gif.alpha).toBe(false);
    expect(by.bmp.lossy).toBe(false);
    expect(by.bmp.mime).toBe('image/bmp');
  });
});

describe('formatById / formatByExtension', () => {
  it('finds a format by id and falls back to PNG', () => {
    expect(formatById('webp').label).toBe('WebP');
    expect(formatById('nope').id).toBe('png');
    expect(formatById(undefined).id).toBe('png');
  });

  it('maps extensions, including jpeg aliases and a leading dot', () => {
    expect(formatByExtension('png').id).toBe('png');
    expect(formatByExtension('.PNG').id).toBe('png');
    expect(formatByExtension('jpg').id).toBe('jpeg');
    expect(formatByExtension('jpeg').id).toBe('jpeg');
    expect(formatByExtension('webp').id).toBe('webp');
    expect(formatByExtension('gif').id).toBe('gif');
    expect(formatByExtension('bmp').id).toBe('bmp');
  });

  it('returns null for an unknown extension', () => {
    expect(formatByExtension('tiff')).toBe(null);
    expect(formatByExtension('')).toBe(null);
    expect(formatByExtension(null)).toBe(null);
  });
});

describe('saveFilters', () => {
  it('puts the preferred format first and keeps every format', () => {
    const filters = saveFilters('gif');
    expect(filters[0]).toEqual({ name: 'GIF Image', extensions: ['gif'] });
    expect(filters).toHaveLength(IMAGE_FORMATS.length);
    expect(filters.find((f) => f.name.startsWith('JPEG')).extensions).toEqual(['jpg', 'jpeg']);
  });

  it('falls back to PNG when the preferred id is unknown', () => {
    expect(saveFilters('xyz')[0].extensions).toEqual(['png']);
  });
});

describe('encodeBmp', () => {
  it('writes a BM header, 24-bit DIB, and bottom-up BGR pixels', () => {
    const width = 2;
    const height = 2;
    // top-left red, top-right green, bottom-left blue, bottom-right white
    const rgba = Uint8Array.from([
      255, 0, 0, 255,   0, 255, 0, 255,
      0, 0, 255, 255,   255, 255, 255, 255,
    ]);
    const bmp = encodeBmp(rgba, width, height);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    expect(view.getUint32(2, true)).toBe(bmp.length);
    expect(view.getUint32(10, true)).toBe(54);
    expect(view.getUint32(14, true)).toBe(40);
    expect(view.getInt32(18, true)).toBe(2);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(26, true)).toBe(1);
    expect(view.getUint16(28, true)).toBe(24);

    // First pixel row in the file is the *bottom* image row (blue, white), BGR.
    const rowSize = (width * 3 + 3) & ~3;
    expect(rowSize).toBe(8);
    expect([...bmp.subarray(54, 54 + 3)]).toEqual([255, 0, 0]);       // blue → B,G,R
    expect([...bmp.subarray(57, 57 + 3)]).toEqual([255, 255, 255]);   // white
    // Second stored row is the top image row (red, green).
    expect([...bmp.subarray(54 + rowSize, 54 + rowSize + 3)]).toEqual([0, 0, 255]);
    expect([...bmp.subarray(54 + rowSize + 3, 54 + rowSize + 6)]).toEqual([0, 255, 0]);
  });

  it('pads each row to a 4-byte boundary', () => {
    const bmp = encodeBmp(rgbaSolid(1, 1, 10, 20, 30), 1, 1);
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    expect(view.getUint32(34, true)).toBe(4); // 3 pixel bytes + 1 pad
    expect(bmp.length).toBe(54 + 4);
    expect(bmp[54]).toBe(30);
    expect(bmp[55]).toBe(20);
    expect(bmp[56]).toBe(10);
  });

  it('round-trips a solid colour losslessly', () => {
    const w = 8;
    const h = 5;
    const src = rgbaSolid(w, h, 12, 34, 56);
    const bmp = encodeBmp(src, w, h);
    const rowSize = (w * 3 + 3) & ~3;
    for (let y = 0; y < h; y++) {
      const dst = 54 + (h - 1 - y) * rowSize;
      for (let x = 0; x < w; x++) {
        expect(bmp[dst + x * 3]).toBe(56);
        expect(bmp[dst + x * 3 + 1]).toBe(34);
        expect(bmp[dst + x * 3 + 2]).toBe(12);
      }
    }
  });
});

describe('encodeGif', () => {
  it('writes a GIF89a header, logical screen, and trailer', () => {
    const gif = encodeGif(rgbaSolid(4, 3, 255, 0, 0), 4, 3);
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe('GIF89a');
    const view = new DataView(gif.buffer, gif.byteOffset, gif.byteLength);
    expect(view.getUint16(6, true)).toBe(4);
    expect(view.getUint16(8, true)).toBe(3);
    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it('encodes a single-colour image with a tiny palette', () => {
    const gif = encodeGif(rgbaSolid(2, 2, 0, 0, 255), 2, 2);
    expect(gif.length).toBeGreaterThan(20);
    expect(gif[10] & 0x80).toBe(0x80); // global colour table flag
  });

  it('encodes a many-colour gradient without throwing', () => {
    const gif = encodeGif(rgbaGradient(32, 24), 32, 24);
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe('GIF89a');
    expect(gif[gif.length - 1]).toBe(0x3b);
    const view = new DataView(gif.buffer, gif.byteOffset, gif.byteLength);
    expect(view.getUint16(6, true)).toBe(32);
    expect(view.getUint16(8, true)).toBe(24);
  });

  it('handles a 1×1 pixel', () => {
    const gif = encodeGif(rgbaSolid(1, 1, 1, 2, 3), 1, 1);
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe('GIF89a');
    const view = new DataView(gif.buffer, gif.byteOffset, gif.byteLength);
    expect(view.getUint16(6, true)).toBe(1);
    expect(view.getUint16(8, true)).toBe(1);
  });
});
