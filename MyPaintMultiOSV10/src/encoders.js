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

  /* ── PNG (stored deflate, so no compressor is needed) ── */
  function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      a = (a + bytes[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  function zlibStored(raw) {
    const blocks = Math.ceil(raw.length / 65535) || 1;
    const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
    let at = 0;
    out[at++] = 0x78;
    out[at++] = 0x01;
    for (let start = 0; start < raw.length || start === 0; start += 65535) {
      const size = Math.min(65535, raw.length - start);
      const last = start + size >= raw.length ? 1 : 0;
      out[at++] = last;
      out[at++] = size & 255;
      out[at++] = (size >> 8) & 255;
      out[at++] = ~size & 255;
      out[at++] = (~size >> 8) & 255;
      out.set(raw.subarray(start, start + size), at);
      at += size;
      if (last) break;
    }
    const sum = adler32(raw);
    out[at++] = (sum >>> 24) & 255;
    out[at++] = (sum >>> 16) & 255;
    out[at++] = (sum >>> 8) & 255;
    out[at++] = sum & 255;
    return out.subarray(0, at);
  }

  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    u32be(out, 0, data.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const body = out.subarray(4, 8 + data.length);
    u32be(out, 8 + data.length, crc32(body));
    return out;
  }

  function u32be(buffer, at, value) {
    buffer[at] = (value >>> 24) & 255;
    buffer[at + 1] = (value >>> 16) & 255;
    buffer[at + 2] = (value >>> 8) & 255;
    buffer[at + 3] = value & 255;
  }

  function png({ width, height, rgba }) {
    const raw = new Uint8Array((width * 4 + 1) * height);
    for (let y = 0; y < height; y += 1) {
      const row = y * (width * 4 + 1);
      raw[row] = 0;
      raw.set(rgba.subarray ? rgba.subarray(y * width * 4, (y + 1) * width * 4) : rgba.slice(y * width * 4, (y + 1) * width * 4), row + 1);
    }
    const ihdr = new Uint8Array(13);
    u32be(ihdr, 0, width);
    u32be(ihdr, 4, height);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const parts = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", zlibStored(raw)),
      pngChunk("IEND", new Uint8Array(0)),
    ];
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    parts.forEach((part) => { out.set(part, at); at += part.length; });
    return out;
  }

  /* ── nearest-neighbour resize, for the sizes an icon carries ── */
  function resize({ width, height, rgba }, size) {
    const out = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const sx = Math.min(width - 1, Math.floor((x * width) / size));
        const sy = Math.min(height - 1, Math.floor((y * height) / size));
        const from = (sy * width + sx) * 4;
        const to = (y * size + x) * 4;
        out[to] = rgba[from];
        out[to + 1] = rgba[from + 1];
        out[to + 2] = rgba[from + 2];
        out[to + 3] = rgba[from + 3];
      }
    }
    return { width: size, height: size, rgba: out };
  }

  /* ── ICO holding a PNG per size ── */
  function ico(image, sizes) {
    const list = (sizes && sizes.length ? sizes : [16, 32, 48, 64, 128, 256])
      .filter((size) => size >= 8 && size <= 256)
      .map((size) => ({ size: size, png: png(resize(image, size)) }));
    const head = 6 + list.length * 16;
    const total = list.reduce((sum, item) => sum + item.png.length, head);
    const out = new Uint8Array(total);
    u16(out, 2, 1);
    u16(out, 4, list.length);
    let offset = head;
    list.forEach((item, index) => {
      const at = 6 + index * 16;
      out[at] = item.size >= 256 ? 0 : item.size;
      out[at + 1] = item.size >= 256 ? 0 : item.size;
      u16(out, at + 4, 1);
      u16(out, at + 6, 32);
      u32(out, at + 8, item.png.length);
      u32(out, at + 12, offset);
      out.set(item.png, offset);
      offset += item.png.length;
    });
    return out;
  }

  /* ── a JP2 box wrapper around a bare JPEG 2000 codestream ── */
  function jp2(codestream) {
    const box = (type, payload) => {
      const out = new Uint8Array(8 + payload.length);
      u32be(out, 0, 8 + payload.length);
      for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
      out.set(payload, 8);
      return out;
    };
    const signature = box("jP  ", new Uint8Array([0x0d, 0x0a, 0x87, 0x0a]));
    const brand = new Uint8Array(12);
    "jp2 ".split("").forEach((ch, i) => { brand[i] = ch.charCodeAt(0); });
    "jp2 ".split("").forEach((ch, i) => { brand[8 + i] = ch.charCodeAt(0); });
    const ftyp = box("ftyp", brand);
    const body = box("jp2c", codestream);
    const out = new Uint8Array(signature.length + ftyp.length + body.length);
    out.set(signature, 0);
    out.set(ftyp, signature.length);
    out.set(body, signature.length + ftyp.length);
    return out;
  }

  /* ── DICOM Secondary Capture, Explicit VR Little Endian ──
   * Enough of a file that any reader, including MyPaint's own, opens it as an image. */
  function dicomElement(group, element, vr, payload) {
    const long = ["OB", "OW", "SQ", "UN", "UT"].indexOf(vr) >= 0;
    const data = typeof payload === "string" ? textBytes(payload.length % 2 ? payload + (vr === "UI" ? "\0" : " ") : payload) : payload;
    const out = new Uint8Array((long ? 12 : 8) + data.length);
    u16(out, 0, group);
    u16(out, 2, element);
    out[4] = vr.charCodeAt(0);
    out[5] = vr.charCodeAt(1);
    if (long) u32(out, 8, data.length);
    else u16(out, 6, data.length);
    out.set(data, long ? 12 : 8);
    return out;
  }

  function textBytes(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 255;
    return out;
  }

  function join(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    parts.forEach((part) => { out.set(part, at); at += part.length; });
    return out;
  }

  function dicom({ width, height, rgba, name, stamp }) {
    const count = width * height;
    const rgb = new Uint8Array(count * 3 + (count * 3) % 2);
    for (let i = 0; i < count; i += 1) {
      rgb[i * 3] = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
    const when = stamp || new Date();
    const pad = (value, size) => String(value).padStart(size, "0");
    const date = "" + when.getFullYear() + pad(when.getMonth() + 1, 2) + pad(when.getDate(), 2);
    const time = pad(when.getHours(), 2) + pad(when.getMinutes(), 2) + pad(when.getSeconds(), 2);
    const uid = "1.2.826.0.1.3680043.9.7788." + Math.floor(Math.random() * 1e9);
    const el = dicomElement;
    const meta = join([
      el(0x0002, 0x0001, "OB", new Uint8Array([0, 1])),
      el(0x0002, 0x0002, "UI", "1.2.840.10008.5.1.4.1.1.7"),
      el(0x0002, 0x0003, "UI", uid),
      el(0x0002, 0x0010, "UI", "1.2.840.10008.1.2.1"),
      el(0x0002, 0x0012, "UI", "1.2.826.0.1.3680043.9.7788.0"),
    ]);
    const body = join([
      el(0x0008, 0x0016, "UI", "1.2.840.10008.5.1.4.1.1.7"),
      el(0x0008, 0x0018, "UI", uid),
      el(0x0008, 0x0020, "DA", date),
      el(0x0008, 0x0030, "TM", time),
      el(0x0008, 0x0060, "CS", "OT"),
      el(0x0008, 0x0070, "LO", "MyPaint"),
      el(0x0008, 0x103e, "LO", String(name || "MyPaint export").slice(0, 60)),
      el(0x0010, 0x0010, "PN", "MyPaint^Export"),
      el(0x0010, 0x0020, "LO", "MYPAINT"),
      el(0x0020, 0x000d, "UI", uid + ".1"),
      el(0x0020, 0x000e, "UI", uid + ".2"),
      el(0x0020, 0x0013, "IS", "1"),
      el(0x0028, 0x0002, "US", new Uint8Array([3, 0])),
      el(0x0028, 0x0004, "CS", "RGB"),
      el(0x0028, 0x0006, "US", new Uint8Array([0, 0])),
      el(0x0028, 0x0010, "US", new Uint8Array([height & 255, (height >> 8) & 255])),
      el(0x0028, 0x0011, "US", new Uint8Array([width & 255, (width >> 8) & 255])),
      el(0x0028, 0x0100, "US", new Uint8Array([8, 0])),
      el(0x0028, 0x0101, "US", new Uint8Array([8, 0])),
      el(0x0028, 0x0102, "US", new Uint8Array([7, 0])),
      el(0x0028, 0x0103, "US", new Uint8Array([0, 0])),
      el(0x7fe0, 0x0010, "OW", rgb),
    ]);
    const groupLength = new Uint8Array(12);
    u16(groupLength, 0, 2);
    u16(groupLength, 2, 0);
    groupLength[4] = 85;
    groupLength[5] = 76;
    u16(groupLength, 6, 4);
    u32(groupLength, 8, meta.length);
    return join([new Uint8Array(128), textBytes("DICM"), groupLength, meta, body]);
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

  return { bmp, tiff, gif, gifAnimated, quantize, zip, crc32, png, ico, jp2, dicom, resize };
});
