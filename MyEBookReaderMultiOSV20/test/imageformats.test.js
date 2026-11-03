// Decoders for the picture formats the browser cannot show by itself.
//
// Every file here is built byte by byte in the test, a few pixels in size,
// with colours chosen so that a wrong channel order, a flipped row or a broken
// run-length packet shows up as a different number.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  decodeExtraImage, sniffExtraImage, rawPreviewJpeg,
  EXTRA_IMAGE_EXTENSIONS, RAW_IMAGE_EXTENSIONS, EXTRA_DECODERS,
} from '../src/lib/ebook/imageformats.js';
import {
  IMAGE_EXTENSIONS, pictureResource, looksLikeImage, isImageName, imageMime, openImageBook,
} from '../src/lib/ebook/imagebook.js';

// ── helpers ──

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const cat = (...parts) => {
  const arrays = parts.map((p) => (typeof p === 'string' ? enc(p) : p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
};
const u16le = (v) => [v & 0xff, (v >> 8) & 0xff];
const u16be = (v) => [(v >> 8) & 0xff, v & 0xff];
const u32le = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const u32be = (v) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

/** The RGBA of every pixel, as [[r,g,b,a], …] in reading order. */
const pixels = (image) => {
  const out = [];
  for (let i = 0; i < image.width * image.height; i++) out.push(Array.from(image.data.subarray(i * 4, i * 4 + 4)));
  return out;
};

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];

// ── TGA ──

function tgaHeader({ type, depth, width, height, descriptor = 0, mapType = 0, mapLength = 0, mapDepth = 0 }) {
  return [0, mapType, type, ...u16le(0), ...u16le(mapLength), mapDepth, ...u16le(0), ...u16le(0),
    ...u16le(width), ...u16le(height), depth, descriptor];
}

describe('TGA', () => {
  it('decodes uncompressed 24-bit, bottom-up', () => {
    const file = cat(tgaHeader({ type: 2, depth: 24, width: 2, height: 2 }),
      [255, 0, 0, 255, 255, 255], // bottom row: blue, white (BGR)
      [0, 0, 255, 0, 255, 0]);    // top row: red, green
    const img = decodeExtraImage(file, 'tga');
    expect([img.width, img.height]).toEqual([2, 2]);
    expect(pixels(img)).toEqual([RED, GREEN, BLUE, WHITE]);
  });

  it('decodes RLE 32-bit with alpha, top-down', () => {
    const file = cat(tgaHeader({ type: 10, depth: 32, width: 2, height: 2, descriptor: 0x28 }),
      [0x82, 0, 0, 255, 200],     // run of 3 red, alpha 200
      [0x00, 0, 255, 0, 255]);    // one raw green
    const img = decodeExtraImage(file, 'tga');
    expect(pixels(img)).toEqual([[255, 0, 0, 200], [255, 0, 0, 200], [255, 0, 0, 200], GREEN]);
  });

  it('decodes colour-mapped and greyscale pictures', () => {
    const mapped = cat(tgaHeader({ type: 1, depth: 8, width: 2, height: 1, descriptor: 0x20, mapType: 1, mapLength: 2, mapDepth: 24 }),
      [0, 0, 255, 255, 0, 0], // palette: red, blue (BGR)
      [1, 0]);
    expect(pixels(decodeExtraImage(mapped, 'tga'))).toEqual([BLUE, RED]);
    const grey = cat(tgaHeader({ type: 11, depth: 8, width: 3, height: 1, descriptor: 0x20 }), [0x82, 77]);
    expect(pixels(decodeExtraImage(grey, 'tga'))).toEqual([[77, 77, 77, 255], [77, 77, 77, 255], [77, 77, 77, 255]]);
  });

  it('decodes 16-bit 1-5-5-5', () => {
    const v = (31 << 10) | 0x8000; // red, opaque
    const file = cat(tgaHeader({ type: 2, depth: 16, width: 1, height: 1, descriptor: 0x21 }), u16le(v));
    expect(pixels(decodeExtraImage(file, 'tga'))).toEqual([RED]);
  });

  it('rejects truncated data', () => {
    const file = cat(tgaHeader({ type: 2, depth: 24, width: 2, height: 2 }), [1, 2, 3]);
    expect(() => decodeExtraImage(file, 'tga')).toThrow(/TGA/);
  });
});

// ── PNM ──

describe('PNM family', () => {
  it('decodes ASCII and binary PBM (1 is black)', () => {
    const ascii = decodeExtraImage(enc('P1\n# comment\n2 2\n1 0\n01\n'), 'pbm');
    expect(pixels(ascii)).toEqual([BLACK, WHITE, WHITE, BLACK]);
    const binary = decodeExtraImage(cat('P4\n3 2\n', [0b10100000, 0b01000000]), 'pbm');
    expect(pixels(binary)).toEqual([BLACK, WHITE, BLACK, WHITE, BLACK, WHITE]);
  });

  it('scales PGM by maxval, ASCII and 16-bit binary', () => {
    expect(pixels(decodeExtraImage(enc('P2 2 1 15 15 0'), 'pgm'))).toEqual([WHITE, BLACK]);
    const wide = decodeExtraImage(cat('P5\n2 1\n65535\n', [0xff, 0xff, 0x80, 0x00]), 'pgm');
    expect(pixels(wide)).toEqual([WHITE, [128, 128, 128, 255]]);
  });

  it('decodes ASCII and binary PPM', () => {
    expect(pixels(decodeExtraImage(enc('P3\n2 1\n255\n255 0 0  0 0 255\n'), 'ppm'))).toEqual([RED, BLUE]);
    expect(pixels(decodeExtraImage(cat('P6\n2 1\n255\n', [0, 255, 0, 255, 255, 255]), 'pnm'))).toEqual([GREEN, WHITE]);
  });

  it('decodes PAM RGB_ALPHA', () => {
    const file = cat('P7\nWIDTH 2\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n',
      [255, 0, 0, 128, 0, 0, 255, 255]);
    expect(pixels(decodeExtraImage(file, 'pam'))).toEqual([[255, 0, 0, 128], BLUE]);
  });

  it('decodes PFM (little-endian, bottom-up) with clamping', () => {
    const floats = new Float32Array([0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 1]); // bottom row, then top row
    const file = cat('PF\n2 2\n-1.0\n', new Uint8Array(floats.buffer));
    const img = decodeExtraImage(file, 'pfm', { tonemap: 'clamp' });
    expect(pixels(img)).toEqual([[255, 255, 0, 255], BLUE, BLACK, BLACK]);
  });
});

// ── PCX ──

function pcxHeader({ bits, planes, width, height, bpl, encoding = 1, palette16 = [] }) {
  const h = new Uint8Array(128);
  h.set([0x0a, 5, encoding, bits, ...u16le(0), ...u16le(0), ...u16le(width - 1), ...u16le(height - 1)]);
  h.set(palette16, 16);
  h[65] = planes;
  h.set(u16le(bpl), 66);
  return h;
}

describe('PCX', () => {
  it('decodes 24-bit RLE (three planes per line)', () => {
    const file = cat(pcxHeader({ bits: 8, planes: 3, width: 2, height: 1, bpl: 2 }),
      [0xc1, 0xff, 0x00], // R: 255, 0
      [0x00, 0xc1, 0xff], // G: 0, 255
      [0xc2, 0x00]);      // B: 0, 0 (a run of two)
    expect(pixels(decodeExtraImage(file, 'pcx'))).toEqual([RED, GREEN]);
  });

  it('decodes 8-bit with the VGA palette at the end', () => {
    const palette = new Uint8Array(768);
    palette.set([10, 20, 30], 0); palette.set([200, 100, 50], 3 * 7);
    const file = cat(pcxHeader({ bits: 8, planes: 1, width: 2, height: 2, bpl: 2 }),
      [7, 0, 0xc2, 7], [0x0c], palette);
    expect(pixels(decodeExtraImage(file, 'pcx'))).toEqual([[200, 100, 50, 255], [10, 20, 30, 255], [200, 100, 50, 255], [200, 100, 50, 255]]);
  });

  it('decodes 1-bit monochrome and 4-plane EGA', () => {
    const mono = cat(pcxHeader({ bits: 1, planes: 1, width: 3, height: 1, bpl: 2 }), [0b10100000, 0]);
    expect(pixels(decodeExtraImage(mono, 'pcx'))).toEqual([WHITE, BLACK, WHITE]);
    const ega = new Uint8Array(48); ega.set([0, 0, 255], 3 * 5); // index 5 = blue
    // index 5 = planes 0 and 2 set for pixel 0; pixel 1 index 0.
    const file = cat(pcxHeader({ bits: 1, planes: 4, width: 2, height: 1, bpl: 2, palette16: ega }),
      [0x80, 0, 0, 0, 0x80, 0, 0, 0]);
    expect(pixels(decodeExtraImage(file, 'pcx'))).toEqual([BLUE, BLACK]);
  });
});

// ── QOI ──

describe('QOI', () => {
  it('decodes every op (RGBA, RGB, DIFF, LUMA, INDEX, RUN)', () => {
    const file = cat('qoif', u32be(3), u32be(2), [4, 0],
      [0xff, 255, 0, 0, 128],   // RGBA
      [0xfe, 0, 255, 0],        // RGB
      [0x76],                   // DIFF +1 −1 0
      [0xaa, 0xa5],             // LUMA dg +10, dr−dg +2, db−dg −3
      [0x3d],                   // INDEX 61 → first pixel
      [0xc0],                   // RUN 1
      [0, 0, 0, 0, 0, 0, 0, 1]);
    const img = decodeExtraImage(file, 'qoi');
    expect([img.width, img.height]).toEqual([3, 2]);
    expect(pixels(img)).toEqual([
      [255, 0, 0, 128], [0, 255, 0, 128], [1, 254, 0, 128],
      [13, 8, 7, 128], [255, 0, 0, 128], [255, 0, 0, 128],
    ]);
  });

  it('throws on truncated data', () => {
    expect(() => decodeExtraImage(cat('qoif', u32be(4), u32be(4), [4, 0], [0xfe, 1]), 'qoi')).toThrow(/QOI/);
  });
});

// ── Radiance HDR ──

describe('Radiance HDR', () => {
  const display = (v) => Math.round(Math.pow(v, 1 / 2.2) * 255);

  it('decodes flat RGBE pixels', () => {
    const file = cat('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n',
      [128, 128, 128, 129, 0, 0, 0, 0],
      [64, 0, 0, 129, 0, 128, 0, 129]);
    const img = decodeExtraImage(file, 'hdr', { tonemap: 'clamp' });
    expect(pixels(img)).toEqual([WHITE, BLACK, [display(0.5), 0, 0, 255], GREEN]);
  });

  it('decodes run-length scanlines and flips +Y files', () => {
    const line = (r, g, b, e) => [2, 2, 0, 8, 0x88, r, 0x88, g, 0x88, b, 0x88, e];
    const file = cat('#?RGBE\n\n+Y 2 +X 8\n', line(128, 0, 0, 129), line(0, 0, 128, 129));
    const img = decodeExtraImage(file, 'hdr', { tonemap: 'clamp' });
    const px = pixels(img);
    expect(px[0]).toEqual(BLUE);  // stored last, shown first
    expect(px[15]).toEqual(RED);
  });

  it('tone maps very bright pictures instead of clipping them all', () => {
    const file = cat('#?RADIANCE\n\n-Y 1 +X 2\n', [128, 128, 128, 133, 128, 128, 128, 131]); // 16 and 4
    const img = decodeExtraImage(file, 'hdr');
    const [a, b] = pixels(img);
    expect(a[0]).toBeLessThan(255);
    expect(a[0]).toBeGreaterThan(b[0]);
  });
});

// ── farbfeld ──

describe('farbfeld', () => {
  it('decodes 16-bit big-endian RGBA', () => {
    const file = cat('farbfeld', u32be(1), u32be(2),
      [0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff],
      [0, 0, 0, 0, 0xff, 0xff, 0x80, 0x80]);
    expect(pixels(decodeExtraImage(file, 'ff'))).toEqual([RED, [0, 0, 255, 128]]);
  });
});

// ── DDS ──

function ddsHeader({ width, height, flags, fourCC = '\0\0\0\0', bits = 0, masks = [0, 0, 0, 0] }) {
  const h = new Uint8Array(128);
  h.set(enc('DDS '), 0);
  h.set(u32le(124), 4);
  h.set(u32le(0x1007), 8);
  h.set(u32le(height), 12);
  h.set(u32le(width), 16);
  h.set(u32le(32), 76);
  h.set(u32le(flags), 80);
  h.set(enc(fourCC), 84);
  h.set(u32le(bits), 88);
  masks.forEach((m, i) => h.set(u32le(m), 92 + i * 4));
  return h;
}

describe('DDS', () => {
  it('decodes uncompressed 32-bit BGRA by its masks', () => {
    const file = cat(ddsHeader({ width: 2, height: 1, flags: 0x41, bits: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000] }),
      [0, 0, 255, 255, 255, 0, 0, 100]);
    expect(pixels(decodeExtraImage(file, 'dds'))).toEqual([RED, [0, 0, 255, 100]]);
  });

  it('decodes 16-bit 5-6-5 without alpha', () => {
    const file = cat(ddsHeader({ width: 1, height: 1, flags: 0x40, bits: 16, masks: [0xf800, 0x07e0, 0x1f, 0] }), u16le(0x07e0));
    expect(pixels(decodeExtraImage(file, 'dds'))).toEqual([GREEN]);
  });

  const colorBlock = [...u16le(0xf800), ...u16le(0x001f), 0xe4, 0x00, 0x00, 0x00];

  it('decodes DXT1 (a 2×2 picture inside one 4×4 block)', () => {
    const file = cat(ddsHeader({ width: 2, height: 2, flags: 4, fourCC: 'DXT1' }), colorBlock);
    expect(pixels(decodeExtraImage(file, 'dds'))).toEqual([RED, BLUE, RED, RED]);
    const four = decodeExtraImage(cat(ddsHeader({ width: 4, height: 1, flags: 4, fourCC: 'DXT1' }), colorBlock), 'dds');
    expect(pixels(four)).toEqual([RED, BLUE, [170, 0, 85, 255], [85, 0, 170, 255]]);
  });

  it('decodes DXT1 one-bit transparency', () => {
    // c0 <= c1: index 3 is transparent black.
    const block = [...u16le(0x001f), ...u16le(0xf800), 0xc0, 0, 0, 0];
    const img = decodeExtraImage(cat(ddsHeader({ width: 4, height: 1, flags: 4, fourCC: 'DXT1' }), block), 'dds');
    expect(pixels(img)[3]).toEqual([0, 0, 0, 0]);
  });

  it('decodes DXT3 and DXT5 alpha', () => {
    const dxt3Alpha = [0xf0, 0x0f, 0, 0, 0, 0, 0, 0]; // pixels 0..3 → 0, 255, 255, 0
    const dxt3 = decodeExtraImage(cat(ddsHeader({ width: 4, height: 1, flags: 4, fourCC: 'DXT3' }), dxt3Alpha, colorBlock), 'dds');
    expect(pixels(dxt3).map((p) => p[3])).toEqual([0, 255, 255, 0]);
    const dxt5Alpha = [255, 0, 0x08, 0, 0, 0, 0, 0]; // pixel 1 uses index 1 (= a1 = 0)
    const dxt5 = decodeExtraImage(cat(ddsHeader({ width: 4, height: 1, flags: 4, fourCC: 'DXT5' }), dxt5Alpha, colorBlock), 'dds');
    expect(pixels(dxt5).map((p) => p[3])).toEqual([255, 0, 255, 255]);
    expect(pixels(dxt5)[0].slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('decodes BC4 as grey', () => {
    const block = [200, 100, 0, 0, 0, 0, 0, 0];
    const img = decodeExtraImage(cat(ddsHeader({ width: 1, height: 1, flags: 4, fourCC: 'ATI1' }), block), 'dds');
    expect(pixels(img)).toEqual([[200, 200, 200, 255]]);
  });

  it('rejects an unknown compression', () => {
    expect(() => decodeExtraImage(cat(ddsHeader({ width: 4, height: 4, flags: 4, fourCC: 'ZZZZ' }), new Uint8Array(16)), 'dds')).toThrow(/DDS/);
  });
});

// ── XBM / XPM ──

describe('XBM and XPM', () => {
  it('decodes XBM (least significant bit first, 1 is black)', () => {
    const file = enc('#define t_width 3\n#define t_height 2\nstatic unsigned char t_bits[] = {\n  0x05, 0x02 };\n');
    expect(pixels(decodeExtraImage(file, 'xbm'))).toEqual([BLACK, WHITE, BLACK, WHITE, BLACK, WHITE]);
  });

  it('decodes XPM with None, #RGB, #RRGGBB and colour names', () => {
    const file = enc([
      '/* XPM */',
      'static char *x[] = {',
      '"3 2 4 1",',
      '"  c None",',
      '". c #FF0000",',
      '"X c #00f",',
      '"o c white m black",',
      '"..X",',
      '" oX"',
      '};',
    ].join('\n'));
    expect(pixels(decodeExtraImage(file, 'xpm'))).toEqual([RED, RED, BLUE, [0, 0, 0, 0], WHITE, BLUE]);
  });
});

// ── PSD ──

/** A minimal PSD: header, empty sections (or a layer count), then channel planes. */
function psd({ width, height, mode = 3, depth = 8, planes, compression = 0, layerCount = null, version = 1 }) {
  const channels = planes.length;
  const head = ['8BPS', u16be(version), [0, 0, 0, 0, 0, 0], u16be(channels), u32be(height), u32be(width), u16be(depth), u16be(mode)];
  const sections = [u32be(0), u32be(0)];
  if (layerCount === null) sections.push(version === 2 ? [0, 0, 0, 0, 0, 0, 0, 0] : u32be(0));
  else if (version === 2) sections.push([0, 0, 0, 0, ...u32be(10), 0, 0, 0, 0, ...u32be(2), ...u16be(layerCount & 0xffff)]);
  else sections.push(u32be(6), u32be(2), u16be(layerCount & 0xffff));
  const rowBytes = (width * depth) / 8;
  let data;
  if (compression === 0) {
    data = [u16be(0), ...planes];
  } else {
    // PackBits, one literal packet per row.
    const counts = []; const rows = [];
    for (const plane of planes) {
      for (let y = 0; y < height; y++) {
        const row = plane.slice(y * rowBytes, (y + 1) * rowBytes);
        rows.push([row.length - 1, ...row]);
        counts.push(...(version === 2 ? u32be(row.length + 1) : u16be(row.length + 1)));
      }
    }
    data = [u16be(1), counts, ...rows];
  }
  return cat(...head, ...sections, ...data);
}

describe('PSD / PSB', () => {
  it('decodes a raw 8-bit RGB composite', () => {
    const file = psd({ width: 2, height: 1, planes: [[255, 0], [0, 0], [0, 255]] });
    expect(sniffExtraImage(file)).toBe('psd');
    expect(pixels(decodeExtraImage(file, 'psd'))).toEqual([RED, BLUE]);
  });

  it('uses the extra channel as transparency only when the layer count is negative', () => {
    const planes = [[255, 0], [0, 255], [0, 0], [128, 255]];
    const withAlpha = decodeExtraImage(psd({ width: 2, height: 1, planes, compression: 1, layerCount: -1 }), 'psd');
    expect(pixels(withAlpha)).toEqual([[255, 0, 0, 128], GREEN]);
    const saved = decodeExtraImage(psd({ width: 2, height: 1, planes, compression: 1, layerCount: 1 }), 'psd');
    expect(pixels(saved)).toEqual([RED, GREEN]);
  });

  it('decodes 16-bit greyscale with RLE and a PSB header', () => {
    const file = psd({ width: 2, height: 2, mode: 1, depth: 16, planes: [[0xff, 0xff, 0, 0, 0x80, 0, 0x40, 0]], compression: 1, version: 2 });
    expect(sniffExtraImage(file)).toBe('psb');
    expect(pixels(decodeExtraImage(file, 'psb'))).toEqual([WHITE, BLACK, [128, 128, 128, 255], [64, 64, 64, 255]]);
  });

  it('converts inverted CMYK to RGB', () => {
    const file = psd({ width: 1, height: 1, mode: 4, planes: [[255], [0], [0], [255]] });
    expect(pixels(decodeExtraImage(file, 'psd'))).toEqual([RED]);
  });

  it('rejects an unknown version', () => {
    const file = psd({ width: 1, height: 1, planes: [[1], [2], [3]] });
    file[5] = 9;
    expect(() => decodeExtraImage(file, 'psd')).toThrow(/PSD/);
  });
});

// ── SGI ──

function sgiHeader({ storage, bpc = 1, dimension, width, height, zsize }) {
  const h = new Uint8Array(512);
  h.set([0x01, 0xda, storage, bpc, ...u16be(dimension), ...u16be(width), ...u16be(height), ...u16be(zsize)]);
  return h;
}

describe('SGI', () => {
  it('decodes verbatim RGB, bottom-up', () => {
    const file = cat(sgiHeader({ storage: 0, dimension: 3, width: 1, height: 2, zsize: 3 }),
      [0, 255], [0, 0], [255, 0]); // R plane, G plane, B plane; row 0 is the bottom
    expect(sniffExtraImage(file)).toBe('sgi');
    expect(pixels(decodeExtraImage(file, 'sgi'))).toEqual([RED, BLUE]);
  });

  it('decodes RLE greyscale', () => {
    const header = sgiHeader({ storage: 1, dimension: 2, width: 3, height: 2, zsize: 1 });
    const row0 = [0x83, 10, 20, 30, 0];   // literal three
    const row1 = [0x03, 99, 0];           // run of three
    const start = 512 + 2 * 4 * 2;
    const tables = [...u32be(start), ...u32be(start + row0.length), ...u32be(row0.length), ...u32be(row1.length)];
    const file = cat(header, tables, row0, row1);
    const g = (v) => [v, v, v, 255];
    expect(pixels(decodeExtraImage(file, 'bw'))).toEqual([g(99), g(99), g(99), g(10), g(20), g(30)]);
  });
});

// ── WBMP ──

describe('WBMP', () => {
  it('decodes type 0 (1 is white)', () => {
    const file = Uint8Array.from([0, 0, 2, 2, 0b10000000, 0b01000000]);
    expect(pixels(decodeExtraImage(file, 'wbmp'))).toEqual([WHITE, BLACK, BLACK, WHITE]);
  });

  it('reads multi-byte sizes', () => {
    const file = cat([0, 0, 0x81, 0x00, 1], new Uint8Array(16)); // 128 × 1
    expect(decodeExtraImage(file, 'wbmp').width).toBe(128);
  });
});

// ── dispatch and sniffing ──

describe('decodeExtraImage / sniffExtraImage', () => {
  it('returns null for extensions it does not handle', () => {
    expect(decodeExtraImage(new Uint8Array(10), 'png')).toBeNull();
    expect(decodeExtraImage(new Uint8Array(10), 'nef')).toBeNull();
  });

  it('has a decoder for every listed extension', () => {
    for (const ext of EXTRA_IMAGE_EXTENSIONS) expect(typeof EXTRA_DECODERS[ext]).toBe('function');
  });

  it('accepts a leading dot and any case', () => {
    const file = cat('farbfeld', u32be(1), u32be(1), [0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff]);
    expect(decodeExtraImage(file, '.FF').width).toBe(1);
  });

  it('sniffs formats with a signature', () => {
    expect(sniffExtraImage(cat('qoif', u32be(1), u32be(1), [4, 0]))).toBe('qoi');
    expect(sniffExtraImage(cat('farbfeld', u32be(1), u32be(1)))).toBe('ff');
    expect(sniffExtraImage(ddsHeader({ width: 4, height: 4, flags: 4, fourCC: 'DXT1' }))).toBe('dds');
    expect(sniffExtraImage(enc('#?RADIANCE\n\n-Y 1 +X 1\n'))).toBe('hdr');
    expect(sniffExtraImage(pcxHeader({ bits: 8, planes: 3, width: 2, height: 1, bpl: 2 }))).toBe('pcx');
    expect(sniffExtraImage(enc('P6\n2 1\n255\n'))).toBe('ppm');
    expect(sniffExtraImage(enc('P1\n# c\n2 2\n'))).toBe('pbm');
    expect(sniffExtraImage(enc('P5 4 4 255 '))).toBe('pgm');
    expect(sniffExtraImage(enc('P7\nWIDTH 1\nHEIGHT 1\nENDHDR\n'))).toBe('pam');
    expect(sniffExtraImage(enc('Pf\n1 1\n-1.0\n'))).toBe('pfm');
  });

  it('does not mistake text or TGA for a picture', () => {
    expect(sniffExtraImage(enc('Plain text that starts with P.'))).toBe('');
    expect(sniffExtraImage(enc('P1 is a paragraph label\n'))).toBe('');
    expect(sniffExtraImage(Uint8Array.from(tgaHeader({ type: 2, depth: 24, width: 1, height: 1 })))).toBe('');
    expect(sniffExtraImage(enc('\nhello world, a newline first'))).toBe('');
    expect(sniffExtraImage(new Uint8Array(0))).toBe('');
  });
});

// ── Camera RAW preview ──

function fakeJpeg(width, height, sof = 0xc0) {
  return [0xff, 0xd8,
    0xff, sof, 0x00, 0x11, 0x08, ...u16be(height), ...u16be(width), 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, 0x00, 0x0c, 0x03, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0,
    0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56,
    0xff, 0xd9];
}

describe('rawPreviewJpeg', () => {
  const small = fakeJpeg(160, 120);
  const large = fakeJpeg(1620, 1080);
  const lossless = fakeJpeg(6000, 4000, 0xc3); // CR2/DNG sensor data — not a preview
  const raw = cat('II*\0', new Uint8Array(37).fill(0x55), small, [1, 2, 3, 0xff, 0xd8, 0xff, 0x00], large, [9, 9], lossless, [0xff, 0xd8]);

  it('picks the largest embedded JPEG a browser can draw', () => {
    expect(Array.from(rawPreviewJpeg(raw))).toEqual(large);
  });

  it('returns the rest of the file when the EOI is missing', () => {
    const cut = cat([0, 0], large.slice(0, -2));
    expect(Array.from(rawPreviewJpeg(cut))).toEqual(large.slice(0, -2));
  });

  it('returns null when there is no JPEG', () => {
    expect(rawPreviewJpeg(new Uint8Array(100))).toBeNull();
    expect(rawPreviewJpeg(Uint8Array.from(lossless))).toBeNull();
  });

  it('lists the common camera extensions', () => {
    for (const ext of ['dng', 'cr2', 'cr3', 'nef', 'arw', 'orf', 'rw2', 'raf', 'pef', 'srw']) {
      expect(RAW_IMAGE_EXTENSIONS).toContain(ext);
    }
  });
});

// ── imagebook integration ──

describe('imagebook with the extra formats', () => {
  afterEach(() => vi.restoreAllMocks());

  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

  it('lists the browser aliases, the decoded formats and RAW', () => {
    for (const ext of ['jfif', 'pjpeg', 'pjp', 'apng', 'dib', 'cur', 'tga', 'psd', 'qoi', 'dds', 'hdr', 'nef', 'cr3', 'dng']) {
      expect(IMAGE_EXTENSIONS).toContain(ext);
    }
    expect(isImageName('Scan.PCX')).toBe(true);
    expect(imageMime('a.jfif')).toBe('image/jpeg');
    expect(imageMime('a.dib')).toBe('image/bmp');
    expect(imageMime('a.cur')).toBe('image/x-icon');
  });

  it('passes browser-native pictures through unchanged', () => {
    const res = pictureResource(png, 'photo.png');
    expect(res.bytes).toBe(png);
    expect(res.mime).toBe('image/png');
    // The bytes decide when the name is wrong.
    expect(pictureResource(png, 'photo.dat').mime).toBe('image/png');
  });

  it('shows a camera RAW file through its preview', () => {
    const raw = cat('II*\0', new Uint8Array(8), fakeJpeg(800, 600), new Uint8Array(20));
    const res = pictureResource(raw, 'IMG_0001.NEF');
    expect(res.mime).toBe('image/jpeg');
    expect(Array.from(res.bytes)).toEqual(fakeJpeg(800, 600));
    expect(() => pictureResource(new Uint8Array(64), 'empty.cr3')).toThrow(/preview/);
  });

  it('refuses something that is not a picture', () => {
    expect(() => pictureResource(enc('hello, this is not a picture'), 'notes.xyz')).toThrow(/not a picture/);
  });

  it('decodes an extra format and encodes it through a canvas', () => {
    let painted = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return realCreate(tag);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (img) => { painted = img; },
        }),
        toDataURL: () => 'data:image/png;base64,AQID',
      };
    });
    // A QOI named .tga: the signature wins over the name.
    const file = cat('qoif', u32be(1), u32be(1), [4, 0], [0xfe, 1, 2, 3], [0, 0, 0, 0, 0, 0, 0, 1]);
    const res = pictureResource(file, 'mislabelled.tga');
    expect(res.mime).toBe('image/png');
    expect(Array.from(res.bytes)).toEqual([1, 2, 3]);
    expect([res.width, res.height]).toEqual([1, 1]);
    expect(Array.from(painted.data)).toEqual([1, 2, 3, 255]);

    const book = openImageBook(file, { name: 'mislabelled.tga' });
    expect(book.meta.format).toBe('QOI');
    expect(book.resource('image:0').mime).toBe('image/png');
    expect(book.imageInfo()).toEqual({ width: 1, height: 1 });
  });

  it('recognises the new signatures without a name', () => {
    expect(looksLikeImage(cat('qoif', u32be(1), u32be(1), [4, 0]))).toBe(true);
    expect(looksLikeImage(psd({ width: 1, height: 1, planes: [[1], [2], [3]] }))).toBe(true);
    expect(looksLikeImage(enc('just some plain text here'))).toBe(false);
  });

  it('opens a RAW file as a one-page book', () => {
    const raw = cat('II*\0', new Uint8Array(8), fakeJpeg(64, 48));
    const book = openImageBook(raw, { name: 'shot.arw' });
    expect(book.meta.format).toBe('ARW');
    expect(book.resource('image:0').mime).toBe('image/jpeg');
  });
});
