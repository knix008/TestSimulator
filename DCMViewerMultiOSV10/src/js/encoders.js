/* Image / archive encoders with no dependencies — run in the browser and in Node (tests).
 *
 *   Encoders.bmp({ width, height, rgba })                        → Uint8Array (24-bit BMP)
 *   Encoders.tiff({ width, height, rgba | gray16, dpi })          → Uint8Array (uncompressed TIFF, 8-bit RGB or 16-bit grey)
 *   Encoders.gif({ width, height, rgba })                         → Uint8Array (GIF89a, ≤256 colours)
 *   Encoders.gifAnimated({ width, height, frames: [rgba…], delayMs, loop })
 *   Encoders.zip([{ name, data }])                                → Uint8Array (stored, no compression)
 *   Encoders.quantize(rgba, maxColors)                            → { palette: Uint8Array(n*3), indices: Uint8Array }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Encoders = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const u16 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
  const u32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >>> 24) & 255; };

  /* ── BMP (BITMAPINFOHEADER, 24 bpp, bottom-up) ── */
  function bmp({ width, height, rgba }) {
    const rowBytes = (width * 3 + 3) & ~3;
    const dataSize = rowBytes * height;
    const out = new Uint8Array(54 + dataSize);
    out[0] = 0x42; out[1] = 0x4D;
    u32(out, 2, out.length); u32(out, 10, 54);
    u32(out, 14, 40); u32(out, 18, width); u32(out, 22, height);
    u16(out, 26, 1); u16(out, 28, 24); u32(out, 30, 0); u32(out, 34, dataSize);
    u32(out, 38, 2835); u32(out, 42, 2835);
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4;
      let o = 54 + y * rowBytes;
      for (let x = 0; x < width; x++) {
        const s = src + x * 4;
        out[o++] = rgba[s + 2]; out[o++] = rgba[s + 1]; out[o++] = rgba[s];
      }
    }
    return out;
  }

  /* ── TIFF (little-endian, uncompressed, one strip) ── */
  function tiff({ width, height, rgba, gray16, dpi }) {
    const gray = !!gray16;
    const spp = gray ? 1 : 3;
    const bytesPerSample = gray ? 2 : 1;
    const dataSize = width * height * spp * bytesPerSample;
    const entries = [];
    const add = (tag, type, count, value) => entries.push({ tag, type, count, value });
    // Layout: header(8) + data + [bits-per-sample array] + [resolution rationals] + IFD
    let extraOff = 8 + dataSize;
    const bpsOff = extraOff; if (!gray) extraOff += 6;
    const resOff = extraOff; extraOff += 16;
    const ifdOff = extraOff + (extraOff & 1);
    add(256, 4, 1, width);                 // ImageWidth
    add(257, 4, 1, height);                // ImageLength
    add(258, 3, spp, gray ? 16 : bpsOff);  // BitsPerSample
    add(259, 3, 1, 1);                     // Compression = none
    add(262, 3, 1, gray ? 1 : 2);          // Photometric: BlackIsZero / RGB
    add(273, 4, 1, 8);                     // StripOffsets
    add(277, 3, 1, spp);                   // SamplesPerPixel
    add(278, 4, 1, height);                // RowsPerStrip
    add(279, 4, 1, dataSize);              // StripByteCounts
    add(282, 5, 1, resOff);                // XResolution
    add(283, 5, 1, resOff + 8);            // YResolution
    add(284, 3, 1, 1);                     // PlanarConfiguration = chunky
    add(296, 3, 1, 2);                     // ResolutionUnit = inch
    if (gray) add(339, 3, 1, 1);           // SampleFormat = unsigned int
    const ifdSize = 2 + entries.length * 12 + 4;
    const out = new Uint8Array(ifdOff + ifdSize);
    out[0] = 0x49; out[1] = 0x49; u16(out, 2, 42); u32(out, 4, ifdOff);
    if (gray) {
      for (let i = 0, o = 8; i < width * height; i++, o += 2) u16(out, o, gray16[i]);
    } else {
      for (let i = 0, o = 8, s = 0; i < width * height; i++, s += 4) { out[o++] = rgba[s]; out[o++] = rgba[s + 1]; out[o++] = rgba[s + 2]; }
      u16(out, bpsOff, 8); u16(out, bpsOff + 2, 8); u16(out, bpsOff + 4, 8);
    }
    const res = Math.round(dpi > 0 ? dpi : 72);
    u32(out, resOff, res); u32(out, resOff + 4, 1); u32(out, resOff + 8, res); u32(out, resOff + 12, 1);
    u16(out, ifdOff, entries.length);
    entries.forEach((e, i) => {
      const o = ifdOff + 2 + i * 12;
      u16(out, o, e.tag); u16(out, o + 2, e.type); u32(out, o + 4, e.count);
      if (e.type === 3 && e.count === 1) u16(out, o + 8, e.value); else u32(out, o + 8, e.value);
    });
    u32(out, ifdOff + 2 + entries.length * 12, 0);
    return out;
  }

  /* ── Colour quantisation (exact when ≤ maxColors distinct colours, median cut otherwise) ── */
  function quantize(rgba, maxColors = 256) {
    const n = rgba.length >> 2;
    const seen = new Map();
    const indices = new Uint8Array(n);
    let exact = true;
    for (let i = 0; i < n; i++) {
      const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
      let idx = seen.get(key);
      if (idx === undefined) {
        if (seen.size >= maxColors) { exact = false; break; }
        idx = seen.size;
        seen.set(key, idx);
      }
      indices[i] = idx;
    }
    if (exact) {
      const palette = new Uint8Array(Math.max(1, seen.size) * 3);
      for (const [key, idx] of seen) { palette[idx * 3] = key >> 16; palette[idx * 3 + 1] = (key >> 8) & 255; palette[idx * 3 + 2] = key & 255; }
      return { palette, indices, count: Math.max(1, seen.size) };
    }
    // Median cut over a 5-bit-per-channel histogram.
    const hist = new Map();
    for (let i = 0; i < n; i++) {
      const key = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    let boxes = [[...hist.keys()]];
    const ch = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);
    while (boxes.length < maxColors) {
      let bi = -1, bestRange = -1, bestC = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        for (let c = 0; c < 3; c++) {
          let lo = 31, hi = 0;
          for (const k of box) { const v = ch(k, c); if (v < lo) lo = v; if (v > hi) hi = v; }
          if (hi - lo > bestRange) { bestRange = hi - lo; bi = i; bestC = c; }
        }
      });
      if (bi < 0) break;
      const box = boxes[bi].sort((a, b) => ch(a, bestC) - ch(b, bestC));
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    const palette = new Uint8Array(boxes.length * 3);
    boxes.forEach((box, i) => {
      let r = 0, g = 0, b = 0, w = 0;
      for (const k of box) { const c = hist.get(k); r += (ch(k, 0) * 8 + 4) * c; g += (ch(k, 1) * 8 + 4) * c; b += (ch(k, 2) * 8 + 4) * c; w += c; }
      palette[i * 3] = Math.round(r / w); palette[i * 3 + 1] = Math.round(g / w); palette[i * 3 + 2] = Math.round(b / w);
    });
    const lookup = new Map();
    for (let i = 0; i < n; i++) {
      const key = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
      let idx = lookup.get(key);
      if (idx === undefined) {
        let best = 0, bestD = Infinity;
        const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
        for (let p = 0; p < boxes.length; p++) {
          const dr = palette[p * 3] - r, dg = palette[p * 3 + 1] - g, db = palette[p * 3 + 2] - b;
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; best = p; }
        }
        idx = best;
        lookup.set(key, idx);
      }
      indices[i] = idx;
    }
    return { palette, indices, count: boxes.length };
  }

  /* ── GIF (LZW) ── */
  function lzwEncode(indices, minCodeSize, push) {
    const clearCode = 1 << minCodeSize, eoi = clearCode + 1;
    let codeSize = minCodeSize + 1, next = eoi + 1;
    let dict = new Map();
    let bitBuf = 0, bitCnt = 0;
    const emit = (code) => {
      bitBuf |= code << bitCnt; bitCnt += codeSize;
      while (bitCnt >= 8) { push(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8; }
    };
    emit(clearCode);
    let prefix = indices.length ? indices[0] : 0;
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const code = dict.get(key);
      if (code !== undefined) { prefix = code; continue; }
      emit(prefix);
      if (next < 4096) {
        dict.set(key, next++);
        if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        dict = new Map(); next = eoi + 1; codeSize = minCodeSize + 1;
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bitCnt > 0) push(bitBuf & 255);
  }

  function gifImageBlock(bytes, width, height, palette, count, indices, delayMs, localPalette) {
    let bits = 1;
    while ((1 << bits) < count) bits++;
    const palSize = 1 << bits;
    if (delayMs != null) {   // Graphic Control Extension
      bytes.push(0x21, 0xF9, 4, 0, Math.round(delayMs / 10) & 255, (Math.round(delayMs / 10) >> 8) & 255, 0, 0);
    }
    bytes.push(0x2C, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8);
    if (localPalette) {
      bytes.push(0x80 | (bits - 1));
      for (let i = 0; i < palSize; i++) { bytes.push(palette[i * 3] || 0, palette[i * 3 + 1] || 0, palette[i * 3 + 2] || 0); }
    } else {
      bytes.push(0);
    }
    const minCode = Math.max(2, bits);
    bytes.push(minCode);
    const chunk = [];
    const flush = () => { if (chunk.length) { bytes.push(chunk.length, ...chunk); chunk.length = 0; } };
    lzwEncode(indices, minCode, (b) => { chunk.push(b); if (chunk.length === 255) flush(); });
    flush();
    bytes.push(0);
  }

  function gifHeader(bytes, width, height, palette, count) {
    let bits = 1;
    while ((1 << bits) < count) bits++;
    const palSize = 1 << bits;
    bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >> 8, height & 255, height >> 8, 0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
    for (let i = 0; i < palSize; i++) bytes.push(palette[i * 3] || 0, palette[i * 3 + 1] || 0, palette[i * 3 + 2] || 0);
  }

  function gif({ width, height, rgba }) {
    const { palette, indices, count } = quantize(rgba, 256);
    const bytes = [];
    gifHeader(bytes, width, height, palette, count);
    gifImageBlock(bytes, width, height, palette, count, indices, null, false);
    bytes.push(0x3B);
    return Uint8Array.from(bytes);
  }

  function gifAnimated({ width, height, frames, delayMs = 100, loop = true }) {
    const bytes = [];
    const first = quantize(frames[0], 256);
    gifHeader(bytes, width, height, first.palette, first.count);
    if (loop) bytes.push(0x21, 0xFF, 11, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, 3, 1, 0, 0, 0);
    frames.forEach((rgba, i) => {
      const q = i === 0 ? first : quantize(rgba, 256);
      gifImageBlock(bytes, width, height, q.palette, q.count, q.indices, delayMs, i !== 0);
    });
    bytes.push(0x3B);
    return Uint8Array.from(bytes);
  }

  /* ── ZIP (store) ── */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(data) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosDateTime(d = new Date()) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }
  function zip(files) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime();
    const locals = [], centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name.replace(/\\/g, '/'));
      const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const crc = crc32(data);
      const lh = new Uint8Array(30 + name.length);
      u32(lh, 0, 0x04034B50); u16(lh, 4, 20); u16(lh, 6, 0x0800); u16(lh, 8, 0); u16(lh, 10, time); u16(lh, 12, date);
      u32(lh, 14, crc); u32(lh, 18, data.length); u32(lh, 22, data.length); u16(lh, 26, name.length); u16(lh, 28, 0);
      lh.set(name, 30);
      const ch = new Uint8Array(46 + name.length);
      u32(ch, 0, 0x02014B50); u16(ch, 4, 20); u16(ch, 6, 20); u16(ch, 8, 0x0800); u16(ch, 10, 0); u16(ch, 12, time); u16(ch, 14, date);
      u32(ch, 16, crc); u32(ch, 20, data.length); u32(ch, 24, data.length); u16(ch, 28, name.length);
      u16(ch, 30, 0); u16(ch, 32, 0); u16(ch, 34, 0); u16(ch, 36, 0); u32(ch, 38, 0); u32(ch, 42, offset);
      ch.set(name, 46);
      locals.push(lh, data); centrals.push(ch);
      offset += lh.length + data.length;
    }
    const cdSize = centrals.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    u32(eocd, 0, 0x06054B50); u16(eocd, 8, files.length); u16(eocd, 10, files.length); u32(eocd, 12, cdSize); u32(eocd, 16, offset);
    const total = offset + cdSize + 22;
    const out = new Uint8Array(total);
    let o = 0;
    for (const part of [...locals, ...centrals, eocd]) { out.set(part, o); o += part.length; }
    return out;
  }

  return { bmp, tiff, gif, gifAnimated, quantize, zip, crc32 };
});
