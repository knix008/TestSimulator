// Diagram image export: the GIF encoder, the format table, and the printable
// page used for PDF.
//
// serializeSvg() needs a live DOM (getBBox, XMLSerializer) so it is exercised
// by the Electron smoke test instead; everything reachable without a browser
// is tested here — including a full decode of the GIF bytes we emit, because
// "it produced some bytes" is not the same as "a viewer can read it".

import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeGif } from '../src/lib/gif.js';
import { IMAGE_FORMATS, getFormat, svgToPrintableHtml } from '../src/report/diagramExport.js';

/* ------------------------------------------------------------ decoder ---- */

/** Reads back a GIF89a produced by encodeGif. Mirrors the writer, nothing more. */
function decodeGif(bytes) {
  let at = 0;
  const u8 = () => bytes[at++];
  const u16 = () => {
    const value = bytes[at] | (bytes[at + 1] << 8);
    at += 2;
    return value;
  };

  const signature = String.fromCharCode(...bytes.slice(0, 6));
  at = 6;

  const width = u16();
  const height = u16();
  const packed = u8();
  const backgroundIndex = u8();
  u8(); // aspect ratio

  const hasGlobalTable = (packed & 0x80) !== 0;
  const tableSize = 1 << ((packed & 0x07) + 1);
  const palette = [];
  if (hasGlobalTable) {
    for (let i = 0; i < tableSize; i++) palette.push([u8(), u8(), u8()]);
  }

  let transparentIndex = -1;
  // Extension blocks precede the image descriptor.
  while (bytes[at] === 0x21) {
    at++; // 0x21
    const label = u8();
    if (label === 0xf9) {
      const size = u8();
      const flags = u8();
      u16(); // delay
      const index = u8();
      if (flags & 0x01) transparentIndex = index;
      assert.equal(size, 4, 'graphic control extension is 4 bytes');
      u8(); // block terminator
    } else {
      let size = u8();
      while (size !== 0) {
        at += size;
        size = u8();
      }
    }
  }

  assert.equal(u8(), 0x2c, 'image descriptor follows');
  u16(); // left
  u16(); // top
  const imageWidth = u16();
  const imageHeight = u16();
  u8(); // local table flags

  const minCodeSize = u8();

  // Gather the sub-blocks back into one stream.
  const data = [];
  let blockSize = u8();
  while (blockSize !== 0) {
    for (let i = 0; i < blockSize; i++) data.push(bytes[at + i]);
    at += blockSize;
    blockSize = u8();
  }

  assert.equal(bytes[at], 0x3b, 'trailer closes the file');

  // Variable-width LZW, least-significant-bit first.
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeWidth = minCodeSize + 1;
  let dictionary = [];
  const resetDictionary = () => {
    dictionary = [];
    for (let i = 0; i < clearCode; i++) dictionary.push([i]);
    dictionary.push(null, null); // clear, end
    codeWidth = minCodeSize + 1;
  };
  resetDictionary();

  const indices = [];
  let bitPos = 0;
  let previous = null;

  const readCode = () => {
    let value = 0;
    for (let i = 0; i < codeWidth; i++) {
      const byte = data[bitPos >> 3];
      if (byte === undefined) return endCode;
      value |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return value;
  };

  for (;;) {
    const code = readCode();
    if (code === endCode) break;
    if (code === clearCode) {
      resetDictionary();
      previous = null;
      continue;
    }

    let entry;
    if (code < dictionary.length && dictionary[code]) entry = dictionary[code];
    else if (previous) entry = [...previous, previous[0]];
    else throw new Error('corrupt LZW stream at code ' + code);

    indices.push(...entry);
    if (previous) dictionary.push([...previous, entry[0]]);
    // The writer widens after appending, so the reader must match exactly.
    if (dictionary.length === 1 << codeWidth && codeWidth < 12) codeWidth++;
    previous = entry;
  }

  return { signature, width, height, palette, backgroundIndex, transparentIndex, imageWidth, imageHeight, indices };
}

/** width*height RGBA from a callback, so tests can describe pictures compactly. */
function makePixels(width, height, at) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  return pixels;
}

/* ---------------------------------------------------------------- GIF ---- */

test('encodeGif writes a GIF89a with the right dimensions', () => {
  const bytes = encodeGif(makePixels(12, 7, () => [200, 30, 30, 255]), 12, 7);
  const gif = decodeGif(bytes);

  assert.equal(gif.signature, 'GIF89a');
  assert.equal(gif.width, 12);
  assert.equal(gif.height, 7);
  assert.equal(gif.imageWidth, 12);
  assert.equal(gif.imageHeight, 7);
});

test('encodeGif round-trips a flat colour exactly', () => {
  const bytes = encodeGif(makePixels(16, 9, () => [17, 34, 51, 255]), 16, 9);
  const gif = decodeGif(bytes);

  assert.equal(gif.indices.length, 16 * 9);
  const unique = new Set(gif.indices);
  assert.equal(unique.size, 1, 'a single-colour image needs a single palette index');
  assert.deepEqual(gif.palette[gif.indices[0]], [17, 34, 51]);
});

test('encodeGif keeps distinct flat regions distinct', () => {
  // Two halves: a diagram is mostly large flat areas, which is the case that
  // matters and also the one median cut could most easily collapse.
  const left = [10, 20, 30];
  const right = [240, 200, 60];
  const pixels = makePixels(20, 10, (x) => (x < 10 ? [...left, 255] : [...right, 255]));

  const gif = decodeGif(encodeGif(pixels, 20, 10));

  const colourAt = (x, y) => gif.palette[gif.indices[y * 20 + x]];
  assert.deepEqual(colourAt(0, 0), left);
  assert.deepEqual(colourAt(19, 9), right);
  assert.notDeepEqual(colourAt(0, 0), colourAt(19, 9));
});

test('encodeGif preserves the position of every pixel', () => {
  // A gradient plus a marker pixel: catches an encoder that reverses rows or
  // drops a byte, which a flat image cannot.
  const pixels = makePixels(8, 8, (x, y) => (x === 6 && y === 1 ? [255, 0, 0, 255] : [x * 30, y * 30, 0, 255]));
  const gif = decodeGif(encodeGif(pixels, 8, 8));

  const marker = gif.palette[gif.indices[1 * 8 + 6]];
  assert.ok(marker[0] > 200 && marker[1] < 60 && marker[2] < 60, 'the red marker stayed at (6,1), got ' + marker);
});

test('encodeGif declares a transparent index only when asked', () => {
  const pixels = makePixels(6, 6, (x) => (x < 3 ? [0, 0, 0, 0] : [90, 90, 90, 255]));

  const opaque = decodeGif(encodeGif(pixels, 6, 6));
  assert.equal(opaque.transparentIndex, -1, 'no graphic control extension without transparency');

  const clear = decodeGif(encodeGif(pixels, 6, 6, { transparent: true }));
  assert.ok(clear.transparentIndex >= 0, 'a transparent export declares its index');
  assert.equal(clear.indices[0], clear.transparentIndex, 'the transparent half uses that index');
  assert.notEqual(clear.indices[5], clear.transparentIndex, 'the painted half does not');
});

test('encodeGif stays inside 256 palette entries on a busy image', () => {
  // More distinct colours than a GIF can hold: median cut has to reduce them.
  const pixels = makePixels(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2, 255]);
  const bytes = encodeGif(pixels, 64, 64, { transparent: true });
  const gif = decodeGif(bytes);

  assert.ok(gif.palette.length <= 256, 'palette is ' + gif.palette.length + ' entries');
  assert.equal(gif.indices.length, 64 * 64);
  assert.ok(Math.max(...gif.indices) < gif.palette.length, 'every index is inside the table');
});

test('encodeGif emits sub-blocks no larger than 255 bytes', () => {
  const pixels = makePixels(96, 96, (x, y) => [(x * 7) % 256, (y * 11) % 256, (x * y) % 256, 255]);
  const bytes = encodeGif(pixels, 96, 96);

  // Walk to the image data and check each block length byte.
  let at = bytes.indexOf(0x2c);
  at += 10; // descriptor + min code size
  let size = bytes[at++];
  let blocks = 0;
  while (size !== 0) {
    assert.ok(size <= 255, 'sub-block length ' + size);
    at += size;
    blocks++;
    size = bytes[at++];
  }
  assert.ok(blocks > 1, 'a large image should span several sub-blocks, got ' + blocks);
});

/* ------------------------------------------------------------- formats --- */

test('every offered format declares what it can do', () => {
  const ids = IMAGE_FORMATS.map((format) => format.id);
  for (const expected of ['png', 'webp', 'jpg', 'gif', 'svg', 'pdf']) {
    assert.ok(ids.includes(expected), 'format "' + expected + '" is not offered');
  }

  for (const format of IMAGE_FORMATS) {
    assert.ok(format.label && format.extension && format.mime, format.id + ' is missing a label/extension/mime');
    assert.equal(typeof format.transparency, 'boolean');
    assert.ok(['canvas', 'gif', 'vector', 'print'].includes(format.kind), format.id + ' has kind ' + format.kind);
  }
});

test('formats without an alpha channel do not claim transparency', () => {
  assert.equal(getFormat('jpg').transparency, false);
  assert.equal(getFormat('pdf').transparency, false);
  assert.equal(getFormat('png').transparency, true);
  assert.equal(getFormat('webp').transparency, true);
  assert.equal(getFormat('gif').transparency, true);
  assert.equal(getFormat('svg').transparency, true);
});

test('getFormat falls back to PNG rather than returning undefined', () => {
  assert.equal(getFormat('tiff').id, 'png');
  assert.equal(getFormat(undefined).id, 'png');
});

/* --------------------------------------------------------------- print --- */

test('svgToPrintableHtml chooses the page orientation from the diagram shape', () => {
  const wide = svgToPrintableHtml({ markup: '<svg/>', width: 900, height: 300 }, 'Call graph', 'midnight');
  const tall = svgToPrintableHtml({ markup: '<svg/>', width: 300, height: 900 }, 'Call graph', 'midnight');

  assert.match(wide, /size:A4 landscape/);
  assert.match(tall, /size:A4 portrait/);
});

test('svgToPrintableHtml drops the XML prolog and escapes the title', () => {
  const html = svgToPrintableHtml(
    { markup: '<?xml version="1.0" encoding="UTF-8"?>\n<svg id="d"/>', width: 100, height: 100 },
    'A <b> & B',
    'midnight',
  );

  assert.ok(!html.includes('<?xml'), 'an XML prolog inside <body> would break the page');
  assert.ok(html.includes('<svg id="d"/>'), 'the diagram itself survives');
  assert.ok(html.includes('A &lt;b&gt; &amp; B'), 'the title is escaped');
});
