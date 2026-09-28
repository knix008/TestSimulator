import { describe, it, expect } from 'vitest';
import { decodeTiff, looksLikeTiff, unpackBits, lzwDecode } from '../src/lib/tiff.js';
import { decodeDicom, parseDicom, looksLikeDicom } from '../src/lib/dicom.js';
import {
  openImageBook, looksLikeImage, isImageName, imageMime, imageExtension, IMAGE_EXTENSIONS,
} from '../src/lib/imagebook.js';
import { detectFormat, openBook } from '../src/lib/book.js';
import { makeTiff, makeDicom, TINY_PNG, packBits } from './helpers/images.mjs';

// ── TIFF ──────────────────────────────────────────────────
describe('decodeTiff', () => {
  const grey = new Uint8Array([0, 64, 128, 255]);                // 2×2, 8-bit grey
  const rgb = new Uint8Array([
    255, 0, 0, 0, 255, 0,
    0, 0, 255, 255, 255, 0,
  ]);                                                             // 2×2 RGB

  it('reads an uncompressed greyscale image', () => {
    const image = decodeTiff(makeTiff({ width: 2, height: 2, pixels: grey }));
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect([...image.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...image.data.slice(12, 16)]).toEqual([255, 255, 255, 255]);
  });

  it('reads RGB samples', () => {
    const image = decodeTiff(makeTiff({ width: 2, height: 2, pixels: rgb, samples: 3 }));
    expect([...image.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...image.data.slice(4, 8)]).toEqual([0, 255, 0, 255]);
  });

  it('reads big-endian files', () => {
    const image = decodeTiff(makeTiff({ width: 2, height: 2, pixels: grey, little: false }));
    expect([...image.data.slice(4, 8)]).toEqual([64, 64, 64, 255]);
  });

  it('reads PackBits compression', () => {
    const pixels = new Uint8Array(64).fill(200);
    const image = decodeTiff(makeTiff({ width: 8, height: 8, pixels, compression: 32773 }));
    expect(image.data[0]).toBe(200);
    expect(image.data[image.data.length - 2]).toBe(200);
  });

  it('reads Deflate compression, through the app’s own inflate', () => {
    const pixels = new Uint8Array(64).map((_, i) => i * 4);
    const image = decodeTiff(makeTiff({ width: 8, height: 8, pixels, compression: 32946 }));
    expect(image.data[0]).toBe(0);
    expect(image.data[4]).toBe(4);
  });

  it('inverts a "white is zero" scan so the page is white', () => {
    const image = decodeTiff(makeTiff({ width: 2, height: 2, pixels: grey, photometric: 0 }));
    expect(image.data[0]).toBe(255);
  });

  it('refuses something that is not a TIFF', () => {
    expect(() => decodeTiff(TINY_PNG)).toThrow(/not a TIFF/i);
  });

  it('reports a compression it cannot read rather than showing noise', () => {
    const tiff = makeTiff({ width: 2, height: 2, pixels: grey });
    // Compression 7 is JPEG-in-TIFF.
    const view = new DataView(tiff.buffer);
    const entryAt = 8 + 2 + 3 * 12;      // the fourth entry is Compression
    view.setUint16(entryAt + 8, 7, true);
    expect(() => decodeTiff(tiff)).toThrow(/compression 7/i);
  });

  it('recognises both byte orders by their magic', () => {
    expect(looksLikeTiff(makeTiff({ width: 1, height: 1, pixels: new Uint8Array([1]) }))).toBe(true);
    expect(looksLikeTiff(makeTiff({ width: 1, height: 1, pixels: new Uint8Array([1]), little: false }))).toBe(true);
    expect(looksLikeTiff(TINY_PNG)).toBe(false);
  });
});

describe('the TIFF compressions', () => {
  it('unpacks PackBits runs and literals', () => {
    const raw = new Uint8Array([1, 1, 1, 1, 2, 3, 4]);
    expect([...unpackBits(packBits(raw), raw.length)]).toEqual([...raw]);
  });

  it('decodes an LZW stream that is only literals', () => {
    // Clear code, 'A', 'B', end — the smallest interesting stream.
    const bits = [256, 65, 66, 257];
    let buffer = '';
    for (const code of bits) buffer += code.toString(2).padStart(9, '0');
    const bytes = new Uint8Array(Math.ceil(buffer.length / 8));
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === '1') bytes[i >> 3] |= 1 << (7 - (i & 7));
    }
    expect([...lzwDecode(bytes, 2)]).toEqual([65, 66]);
  });
});

// ── DICOM ─────────────────────────────────────────────────
describe('DICOM', () => {
  const pixels8 = new Uint8Array([0, 85, 170, 255]);

  it('recognises a DICOM file by its DICM marker', () => {
    expect(looksLikeDicom(makeDicom({ width: 2, height: 2, pixels: pixels8 }))).toBe(true);
    expect(looksLikeDicom(TINY_PNG)).toBe(false);
    expect(looksLikeDicom(new Uint8Array(0), 'scan.dcm')).toBe(true);
  });

  it('parses the elements and the transfer syntax', () => {
    const { elements, transferSyntax } = parseDicom(makeDicom({ width: 4, height: 3, pixels: new Uint8Array(12) }));
    expect(transferSyntax).toBe('1.2.840.10008.1.2.1');
    expect(elements.has('0028,0010')).toBe(true);
    expect(elements.has('7fe0,0010')).toBe(true);
  });

  it('decodes an 8-bit greyscale image', () => {
    const image = decodeDicom(makeDicom({ width: 2, height: 2, pixels: pixels8 }));
    expect(image.kind).toBe('rgba');
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.data[0]).toBe(0);
    expect(image.data[12]).toBe(255);
  });

  it('decodes 16-bit pixels with the window in the file', () => {
    const pixels16 = new Uint8Array(8);
    new DataView(pixels16.buffer).setUint16(0, 0, true);
    new DataView(pixels16.buffer).setUint16(2, 1000, true);
    new DataView(pixels16.buffer).setUint16(4, 2000, true);
    new DataView(pixels16.buffer).setUint16(6, 4000, true);
    const image = decodeDicom(makeDicom({
      width: 2, height: 2, pixels: pixels16, bits: 16, windowCenter: 2000, windowWidth: 4000,
    }));
    expect(image.data[0]).toBe(0);
    expect(image.data[4]).toBeGreaterThan(50);
    expect(image.data[12]).toBe(255);
  });

  it('works out a window when the file has none', () => {
    const pixels16 = new Uint8Array(8);
    const view = new DataView(pixels16.buffer);
    view.setUint16(0, 100, true);
    view.setUint16(2, 200, true);
    view.setUint16(4, 300, true);
    view.setUint16(6, 400, true);
    const image = decodeDicom(makeDicom({ width: 2, height: 2, pixels: pixels16, bits: 16 }));
    // The darkest pixel becomes black and the brightest white, rather than
    // every pixel coming out nearly black.
    expect(image.data[0]).toBe(0);
    expect(image.data[12]).toBe(255);
  });

  it('inverts MONOCHROME1, where zero means white', () => {
    const image = decodeDicom(makeDicom({
      width: 2, height: 2, pixels: pixels8, photometric: 'MONOCHROME1',
    }));
    expect(image.data[0]).toBe(255);
  });

  it('keeps the patient and study details for the properties panel', () => {
    const image = decodeDicom(makeDicom({
      width: 2,
      height: 2,
      pixels: pixels8,
      extra: [[0x0010, 0x0010, 'PN', 'HONG^GILDONG'], [0x0008, 0x1030, 'LO', 'CHEST']],
    }));
    expect(image.meta.patient).toBe('HONG^GILDONG');
    expect(image.meta.study).toBe('CHEST');
  });

  it('reports a file with no image data', () => {
    const noPixels = makeDicom({ width: 0, height: 0, pixels: new Uint8Array(0) });
    expect(() => decodeDicom(noPixels)).toThrow(/no image data|how large/i);
  });

  it('refuses something that is not DICOM', () => {
    expect(() => parseDicom(TINY_PNG)).toThrow();
  });
});

// ── Pictures as books ─────────────────────────────────────
describe('openImageBook', () => {
  it('makes a one-page book out of a picture', () => {
    const book = openImageBook(TINY_PNG, { name: 'photo.png' });
    expect(book.format).toBe('image');
    expect(book.sections).toHaveLength(1);
    expect(book.sections[0].kind).toBe('image');
    expect(book.meta.title).toBe('photo');
  });

  it('hands the picture to the view through the resolver', () => {
    const book = openImageBook(TINY_PNG, { name: 'photo.png' });
    const loaded = book.loadSection(0, { resolveSrc: (p) => `blob:${p}` });
    expect(loaded.kind).toBe('image');
    expect(loaded.src).toBe('blob:image:0');
  });

  it('gives the bytes back as a resource, with the right media type', () => {
    const book = openImageBook(TINY_PNG, { name: 'photo.png' });
    const resource = book.resource('image:0');
    expect(resource.mime).toBe('image/png');
    expect(resource.bytes.length).toBe(TINY_PNG.length);
  });

  it('has only one page', () => {
    const book = openImageBook(TINY_PNG, { name: 'photo.png' });
    expect(() => book.loadSection(1)).toThrow(/one page/i);
  });

  it('labels a DICOM as DICOM and keeps its details', () => {
    const dicom = makeDicom({
      width: 2, height: 2, pixels: new Uint8Array([0, 85, 170, 255]),
      extra: [[0x0008, 0x0060, 'CS', 'CT']],
    });
    const book = openImageBook(dicom, { name: 'scan.dcm' });
    expect(book.meta.format).toBe('DICOM');
    // Decoding needs a canvas; the metadata comes out of the same pass.
    try {
      book.resource('image:0');
      expect(book.meta.modality).toBe('CT');
    } catch (err) {
      expect(String(err.message)).toMatch(/canvas/i);
    }
  });

  it('knows which names and bytes are pictures', () => {
    expect(isImageName('a.JPG')).toBe(true);
    expect(isImageName('a.epub')).toBe(false);
    expect(looksLikeImage(TINY_PNG)).toBe(true);
    expect(looksLikeImage(new TextEncoder().encode('plain text'))).toBe(false);
    expect(imageMime('a.webp')).toBe('image/webp');
    expect(imageExtension('a/b/c.TIFF')).toBe('tiff');
    expect(IMAGE_EXTENSIONS).toContain('heic');
  });
});

describe('pictures in the format catalogue', () => {
  it('detects a picture from its bytes and from its name', () => {
    expect(detectFormat(TINY_PNG, 'photo.png')).toBe('image');
    expect(detectFormat(TINY_PNG, 'mislabelled.txt')).toBe('image');
    expect(detectFormat(makeTiff({ width: 1, height: 1, pixels: new Uint8Array([1]) }), 'scan.tif')).toBe('image');
    expect(detectFormat(makeDicom({ width: 1, height: 1, pixels: new Uint8Array([1]) }), 'scan.dcm')).toBe('image');
    expect(detectFormat(new Uint8Array(0), 'drawing.svg')).toBe('image');
  });

  it('opens a picture through the same door as a book', async () => {
    const book = await openBook({ data: TINY_PNG, name: 'photo.png' });
    expect(book.format).toBe('image');
    expect(book.reflowable).toBe(false);
    expect(book.sectionCount).toBe(1);
    expect(book.loadSection(0).kind).toBe('image');
    expect(book.cover()).toMatch(/^(blob:|data:)/);
  });
});
