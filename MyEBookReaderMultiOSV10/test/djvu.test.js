import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectFormat, openBook } from '../src/lib/book.js';
import { coverPageOf } from '../src/lib/coverpage.js';
import { looksLikeDjvu, paintDjvuPage, setDjvuWasmBytes } from '../src/lib/djvu.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

// The same probe the decoder uses to choose simd128 or scalar. The bytes have
// to be the matching build, and they have to be handed in before the first
// open: a failed fetch of the wasm file locks the loader onto that failure.
const SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

function wasmFile() {
  const root = path.dirname(require.resolve('djvu-rs'));
  const variant = WebAssembly.validate(SIMD_PROBE) ? 'simd128' : 'scalar';
  return readFileSync(path.join(root, variant, 'djvu_rs_bg.wasm'));
}

const boy = readFileSync(path.join(here, 'fixtures', 'boy.djvu'));

beforeAll(() => {
  setDjvuWasmBytes(wasmFile());
});

describe('DjVu', () => {
  it('recognises the file from its own header', () => {
    expect(looksLikeDjvu(boy)).toBe(true);
    expect(looksLikeDjvu(new Uint8Array(8))).toBe(false);
    expect(detectFormat(boy, 'notes.txt')).toBe('djvu');
    expect(detectFormat(boy, 'scan.djv')).toBe('djvu');
  });

  it('opens as a fixed-layout book of pages', async () => {
    const book = await openBook({ data: boy, name: 'boy.djvu', path: '/books/boy.djvu' });
    try {
      expect(book.format).toBe('djvu');
      expect(book.formatLabel).toBe('DjVu');
      expect(book.reflowable).toBe(false);
      expect(book.sectionCount).toBeGreaterThan(0);
      expect(book.djvu).toBeTruthy();
      const page = book.loadSection(0);
      expect(page.kind).toBe('djvu');
      expect(page.page).toBe(1);
      expect(page.html).toBe('');
      const text = await book.readSectionText(0);
      expect(typeof text).toBe('string');
      expect(book.sectionText(0)).toBe(text);
      expect(coverPageOf(book)).toEqual({ source: 'first', kind: 'djvu', page: 1 });
    } finally {
      book.destroy();
    }
  });

  it('paints a page into a canvas the size of the decoded picture', async () => {
    const book = await openBook({ data: boy, name: 'boy.djvu' });
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => ({
      putImageData() {},
      fillRect() {},
      drawImage() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillStyle: '',
    });
    try {
      const canvas = document.createElement('canvas');
      const painted = await paintDjvuPage({
        doc: book.djvu, pageNumber: 1, canvas, scale: 1, rotation: 0, dpr: 1,
      });
      expect(painted.width).toBeGreaterThan(0);
      expect(painted.height).toBeGreaterThan(0);
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
      expect(Array.isArray(painted.zones)).toBe(true);
    } finally {
      HTMLCanvasElement.prototype.getContext = real;
      book.destroy();
    }
  });
});
