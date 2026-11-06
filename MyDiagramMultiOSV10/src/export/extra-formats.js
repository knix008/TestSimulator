/* Pure readers and writers for the picture formats the browser does not know.
 * No DOM — they run in the browser and in Node (tests) alike.
 *
 *   X.decodeTga(bytes)            → { width, height, rgba }   uncompressed + RLE; grey, 15/16/24/32-bit, colour-mapped
 *   X.encodeTga(image, { rle })   → Uint8Array                32-bit, top-left origin, RLE unless rle === false
 *   X.decodeNetpbm(bytes)         → { width, height, rgba }   P1–P6 (ASCII and binary), P7 PAM
 *   X.encodePpm(image)            → Uint8Array                P6, alpha composited on white
 *   X.encodePam(image)            → Uint8Array                P7 RGB_ALPHA
 *   X.decodeQoi(bytes)            → { width, height, rgba, channels, colorspace }
 *   X.encodeQoi(image)            → Uint8Array
 *   X.decodePcx(bytes)            → { width, height, rgba }   1/2/4-bit, EGA 4-plane, 8-bit palette, 24/32-bit planes
 *   X.encodePcx(image)            → Uint8Array                24-bit, 3 planes, RLE
 *   X.familyOf(ext) / X.magic(bytes) → 'tga' | 'netpbm' | 'qoi' | 'pcx' | 'svg' | ''
 *   X.decode(bytes, family)       → { width, height, rgba }
 *   X.isSvg(bytes) / X.svgSize(text) / X.svgWrapPng(width, height, pngBytes)
 *
 * Every image is { width, height, rgba } with rgba a Uint8ClampedArray or Uint8Array of
 * width * height * 4 bytes, rows top to bottom. Broken files throw an Error saying what is wrong.
 */
// Taken from MyPaint (src/extra-formats.js).
const api = (function () {
  const MAX_SIDE = 65535;
  const MAX_PIXELS = 400 * 1000 * 1000;

  function bytesOf(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    return new Uint8Array(input || 0);
  }

  function checkSize(format, width, height) {
    if (!(width > 0) || !(height > 0)) throw new Error("The " + format + " file has an empty image size (" + width + " × " + height + ").");
    if (width > MAX_SIDE * 4 || height > MAX_SIDE * 4 || width * height > MAX_PIXELS) {
      throw new Error("The " + format + " image is too large (" + width + " × " + height + ").");
    }
  }

  function checkImage(image) {
    if (!image || !(image.width > 0) || !(image.height > 0) || !image.rgba) throw new Error("There is no picture to write.");
    if (image.rgba.length < image.width * image.height * 4) throw new Error("The picture holds fewer pixels than its size says.");
  }

  function ascii(text) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 255;
    return out;
  }

  function concat(parts) {
    let total = 0;
    parts.forEach((part) => { total += part.length; });
    const out = new Uint8Array(total);
    let at = 0;
    parts.forEach((part) => { out.set(part, at); at += part.length; });
    return out;
  }

  /* A growable byte buffer for the encoders. */
  function Writer(size) {
    let buf = new Uint8Array(Math.max(64, size || 0));
    let len = 0;
    return {
      push(value) {
        if (len >= buf.length) { const next = new Uint8Array(buf.length * 2); next.set(buf); buf = next; }
        buf[len++] = value;
      },
      bytes(list) { for (let i = 0; i < list.length; i += 1) this.push(list[i]); },
      done() { return buf.slice(0, len); },
    };
  }

  /* Composite one channel over white. */
  const onWhite = (c, a) => Math.round((c * a + 255 * (255 - a)) / 255);

  /* ── TGA ── */

  const TGA_TYPES = { 1: "colour-mapped", 2: "truecolor", 3: "greyscale", 9: "colour-mapped", 10: "truecolor", 11: "greyscale" };

  function tgaColour(src, at, depth, alphaBits, out, o) {
    if (depth === 8) {
      out[o] = out[o + 1] = out[o + 2] = src[at]; out[o + 3] = 255;
    } else if (depth === 15 || depth === 16) {
      const v = src[at] | (src[at + 1] << 8);
      const r = (v >> 10) & 31; const g = (v >> 5) & 31; const b = v & 31;
      out[o] = (r << 3) | (r >> 2); out[o + 1] = (g << 3) | (g >> 2); out[o + 2] = (b << 3) | (b >> 2);
      out[o + 3] = depth === 16 && alphaBits > 0 ? ((v & 0x8000) ? 255 : 0) : 255;
    } else if (depth === 24) {
      out[o] = src[at + 2]; out[o + 1] = src[at + 1]; out[o + 2] = src[at]; out[o + 3] = 255;
    } else {
      out[o] = src[at + 2]; out[o + 1] = src[at + 1]; out[o + 2] = src[at]; out[o + 3] = src[at + 3];
    }
  }

  function decodeTga(input) {
    const b = bytesOf(input);
    if (b.length < 18) throw new Error("The TGA file is too short to hold a header.");
    const idLength = b[0];
    const mapType = b[1];
    const type = b[2];
    const mapFirst = b[3] | (b[4] << 8);
    const mapLength = b[5] | (b[6] << 8);
    const mapDepth = b[7];
    const width = b[12] | (b[13] << 8);
    const height = b[14] | (b[15] << 8);
    const depth = b[16];
    const descriptor = b[17];
    const alphaBits = descriptor & 15;
    if (!TGA_TYPES[type]) throw new Error("The TGA file has an unknown image type (" + type + ").");
    if (mapType > 1) throw new Error("The TGA file has an unknown colour map type (" + mapType + ").");
    checkSize("TGA", width, height);
    const mapped = type === 1 || type === 9;
    const grey = type === 3 || type === 11;
    if (mapped && (depth !== 8 && depth !== 16)) throw new Error("The colour-mapped TGA file has an unsupported index depth (" + depth + "-bit).");
    if (grey && depth !== 8 && depth !== 16) throw new Error("The greyscale TGA file has an unsupported depth (" + depth + "-bit).");
    if (!mapped && !grey && [15, 16, 24, 32].indexOf(depth) < 0) throw new Error("The truecolor TGA file has an unsupported depth (" + depth + "-bit).");
    if (mapped && mapType !== 1) throw new Error("The colour-mapped TGA file has no colour map.");
    let at = 18 + idLength;
    let palette = null;
    if (mapType === 1) {
      if ([15, 16, 24, 32].indexOf(mapDepth) < 0) throw new Error("The TGA colour map has an unsupported depth (" + mapDepth + "-bit).");
      const entry = Math.ceil(mapDepth / 8);
      if (at + mapLength * entry > b.length) throw new Error("The TGA file is truncated inside its colour map.");
      palette = new Uint8Array(mapLength * 4);
      for (let i = 0; i < mapLength; i += 1) tgaColour(b, at + i * entry, mapDepth, mapDepth === 16 ? 1 : (mapDepth === 32 ? 8 : 0), palette, i * 4);
      at += mapLength * entry;
    }
    const bpp = Math.ceil(depth / 8);
    const count = width * height;
    // Gather the pixels in file order, raw bytes per pixel.
    let pixels;
    if (type >= 9) {
      pixels = new Uint8Array(count * bpp);
      let n = 0;
      while (n < count) {
        if (at >= b.length) throw new Error("The TGA file is truncated inside its RLE pixel data.");
        const head = b[at++];
        const run = (head & 127) + 1;
        if (n + run > count) throw new Error("A TGA RLE packet runs past the end of the image.");
        if (head & 128) {
          if (at + bpp > b.length) throw new Error("The TGA file is truncated inside its RLE pixel data.");
          for (let k = 0; k < run; k += 1) for (let c = 0; c < bpp; c += 1) pixels[(n + k) * bpp + c] = b[at + c];
          at += bpp;
        } else {
          if (at + run * bpp > b.length) throw new Error("The TGA file is truncated inside its RLE pixel data.");
          pixels.set(b.subarray(at, at + run * bpp), n * bpp);
          at += run * bpp;
        }
        n += run;
      }
    } else {
      if (at + count * bpp > b.length) throw new Error("The TGA file is truncated: it holds fewer pixels than its size says.");
      pixels = b.subarray(at, at + count * bpp);
    }
    const rgba = new Uint8ClampedArray(count * 4);
    const top = (descriptor & 0x20) !== 0;
    const right = (descriptor & 0x10) !== 0;
    let sawAlpha = false;
    for (let y = 0; y < height; y += 1) {
      const row = top ? y : height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const col = right ? width - 1 - x : x;
        const s = (y * width + x) * bpp;
        const o = (row * width + col) * 4;
        if (mapped) {
          const index = (depth === 16 ? pixels[s] | (pixels[s + 1] << 8) : pixels[s]) - mapFirst;
          if (index < 0 || index >= mapLength) throw new Error("A TGA pixel points outside the colour map (" + (index + mapFirst) + ").");
          rgba[o] = palette[index * 4]; rgba[o + 1] = palette[index * 4 + 1]; rgba[o + 2] = palette[index * 4 + 2]; rgba[o + 3] = palette[index * 4 + 3];
        } else if (grey) {
          rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[s];
          rgba[o + 3] = depth === 16 ? pixels[s + 1] : 255;
        } else {
          tgaColour(pixels, s, depth, alphaBits, rgba, o);
        }
        if (rgba[o + 3] !== 0) sawAlpha = true;
      }
    }
    // A file whose header claims no alpha bits but whose alpha bytes are all zero was written
    // without alpha — show it opaque.
    if (!sawAlpha && alphaBits === 0) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    return { width: width, height: height, rgba: rgba };
  }

  function encodeTga(image, options) {
    checkImage(image);
    const rle = !(options && options.rle === false);
    const { width, height, rgba } = image;
    if (width > 65535 || height > 65535) throw new Error("A TGA file cannot be wider or taller than 65535 pixels.");
    const out = Writer(18 + width * height * 4 + 64);
    const head = new Uint8Array(18);
    head[2] = rle ? 10 : 2;
    head[12] = width & 255; head[13] = width >> 8;
    head[14] = height & 255; head[15] = height >> 8;
    head[16] = 32;
    head[17] = 0x28; // 8 alpha bits, top-left origin
    out.bytes(head);
    const px = (i) => [rgba[i * 4 + 2], rgba[i * 4 + 1], rgba[i * 4], rgba[i * 4 + 3]];
    const same = (i, j) => rgba[i * 4] === rgba[j * 4] && rgba[i * 4 + 1] === rgba[j * 4 + 1] && rgba[i * 4 + 2] === rgba[j * 4 + 2] && rgba[i * 4 + 3] === rgba[j * 4 + 3];
    for (let y = 0; y < height; y += 1) {
      const start = y * width;
      if (!rle) { for (let x = 0; x < width; x += 1) out.bytes(px(start + x)); continue; }
      // Packets never cross a scanline.
      let x = 0;
      while (x < width) {
        let run = 1;
        while (x + run < width && run < 128 && same(start + x, start + x + run)) run += 1;
        if (run > 1) {
          out.push(0x80 | (run - 1));
          out.bytes(px(start + x));
          x += run;
          continue;
        }
        let raw = 1;
        while (x + raw < width && raw < 128 && !(x + raw + 1 < width && same(start + x + raw, start + x + raw + 1))) raw += 1;
        out.push(raw - 1);
        for (let k = 0; k < raw; k += 1) out.bytes(px(start + x + k));
        x += raw;
      }
    }
    // TGA 2.0 footer: no extension or developer area.
    out.bytes([0, 0, 0, 0, 0, 0, 0, 0]);
    out.bytes(ascii("TRUEVISION-XFILE.\0"));
    return out.done();
  }

  function isTgaFooter(b) {
    if (b.length < 44) return false;
    const tail = "TRUEVISION-XFILE.";
    for (let i = 0; i < tail.length; i += 1) if (b[b.length - 18 + i] !== tail.charCodeAt(i)) return false;
    return true;
  }

  /* ── Netpbm (PBM / PGM / PPM / PAM) ── */

  const isSpace = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0b || c === 0x0c;

  function decodeNetpbm(input) {
    const b = bytesOf(input);
    if (b.length < 3 || b[0] !== 0x50 || b[1] < 0x31 || b[1] > 0x37) throw new Error("This is not a Netpbm file: it does not start with P1 to P7.");
    const kind = b[1] - 0x30;
    let at = 2;
    const fmt = kind === 7 ? "PAM" : (kind === 1 || kind === 4 ? "PBM" : (kind === 2 || kind === 5 ? "PGM" : "PPM"));
    const truncated = () => new Error("The " + fmt + " file is truncated.");
    // Header token reader: skips whitespace and '#' comments.
    const token = () => {
      for (;;) {
        while (at < b.length && isSpace(b[at])) at += 1;
        if (at < b.length && b[at] === 0x23) { while (at < b.length && b[at] !== 0x0a && b[at] !== 0x0d) at += 1; continue; }
        break;
      }
      if (at >= b.length) throw truncated();
      let text = "";
      while (at < b.length && !isSpace(b[at]) && b[at] !== 0x23) text += String.fromCharCode(b[at++]);
      return text;
    };
    const number = (what) => {
      const text = token();
      if (!/^\d+$/.test(text)) throw new Error("The " + fmt + " header has a bad " + what + " (\"" + text.slice(0, 20) + "\").");
      return parseInt(text, 10);
    };
    let width;
    let height;
    let depth;
    let maxval = 1;
    let tuple = "";
    if (kind === 7) {
      if (!isSpace(b[at] === undefined ? 0 : b[at])) throw new Error("The PAM header is malformed after P7.");
      const fields = {};
      for (;;) {
        // PAM headers are line based: "KEY value", '#' comments, ENDHDR.
        while (at < b.length && isSpace(b[at])) at += 1;
        if (at >= b.length) throw new Error("The PAM header has no ENDHDR line.");
        let line = "";
        while (at < b.length && b[at] !== 0x0a) line += String.fromCharCode(b[at++]);
        at += 1;
        line = line.trim();
        if (!line || line[0] === "#") continue;
        const parts = line.split(/\s+/);
        const key = parts[0].toUpperCase();
        if (key === "ENDHDR") break;
        if (key === "TUPLTYPE") fields.TUPLTYPE = (fields.TUPLTYPE ? fields.TUPLTYPE + " " : "") + parts.slice(1).join(" ");
        else fields[key] = parts[1];
      }
      at = Math.min(at, b.length);
      ["WIDTH", "HEIGHT", "DEPTH", "MAXVAL"].forEach((key) => {
        if (fields[key] === undefined) throw new Error("The PAM header has no " + key + " line.");
        if (!/^\d+$/.test(fields[key])) throw new Error("The PAM header has a bad " + key + " (\"" + String(fields[key]).slice(0, 20) + "\").");
      });
      width = parseInt(fields.WIDTH, 10);
      height = parseInt(fields.HEIGHT, 10);
      depth = parseInt(fields.DEPTH, 10);
      maxval = parseInt(fields.MAXVAL, 10);
      tuple = (fields.TUPLTYPE || "").toUpperCase();
      const expected = { BLACKANDWHITE: 1, GRAYSCALE: 1, RGB: 3, BLACKANDWHITE_ALPHA: 2, GRAYSCALE_ALPHA: 2, RGB_ALPHA: 4 }[tuple];
      if (expected !== undefined && expected !== depth) throw new Error("The PAM tuple type " + tuple + " needs depth " + expected + ", not " + depth + ".");
      if (expected === undefined && (depth < 1 || depth > 4)) throw new Error("The PAM file has an unsupported tuple type (" + (tuple || "none") + ") with depth " + depth + ".");
      if (!tuple) tuple = ["", "GRAYSCALE", "GRAYSCALE_ALPHA", "RGB", "RGB_ALPHA"][depth];
    } else {
      width = number("width");
      height = number("height");
      if (kind !== 1 && kind !== 4) maxval = number("maximum value");
      depth = kind === 3 || kind === 6 ? 3 : 1;
      // Exactly one whitespace byte separates the header from binary data.
      if (kind >= 4) {
        if (at >= b.length) throw truncated();
        at += 1;
      }
    }
    if (maxval < 1 || maxval > 65535) throw new Error("The " + fmt + " file has a maximum value out of range (" + maxval + ").");
    checkSize(fmt, width, height);
    const count = width * height;
    const rgba = new Uint8ClampedArray(count * 4);
    const scale = (v) => {
      if (v > maxval) v = maxval;
      return maxval === 255 ? v : Math.round((v * 255) / maxval);
    };
    const put = (p, values) => {
      const o = p * 4;
      if (depth === 1) { rgba[o] = rgba[o + 1] = rgba[o + 2] = scale(values[0]); rgba[o + 3] = 255; } else if (depth === 2) { rgba[o] = rgba[o + 1] = rgba[o + 2] = scale(values[0]); rgba[o + 3] = scale(values[1]); } else { rgba[o] = scale(values[0]); rgba[o + 1] = scale(values[1]); rgba[o + 2] = scale(values[2]); rgba[o + 3] = depth === 4 ? scale(values[3]) : 255; }
    };
    if (kind === 1) {
      // ASCII bits, 1 = black; digits need not be separated.
      for (let p = 0; p < count; p += 1) {
        for (;;) {
          if (at >= b.length) throw truncated();
          const c = b[at];
          if (c === 0x23) { while (at < b.length && b[at] !== 0x0a) at += 1; continue; }
          if (c === 0x30 || c === 0x31) break;
          if (!isSpace(c)) throw new Error("The PBM file holds a character other than 0 or 1 in its pixels.");
          at += 1;
        }
        const v = b[at++] === 0x31 ? 0 : 255;
        const o = p * 4;
        rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255;
      }
    } else if (kind === 2 || kind === 3) {
      const values = new Array(depth);
      for (let p = 0; p < count; p += 1) {
        for (let c = 0; c < depth; c += 1) {
          for (;;) {
            while (at < b.length && isSpace(b[at])) at += 1;
            if (at < b.length && b[at] === 0x23) { while (at < b.length && b[at] !== 0x0a) at += 1; continue; }
            break;
          }
          if (at >= b.length) throw truncated();
          let v = 0;
          let digits = 0;
          while (at < b.length && b[at] >= 0x30 && b[at] <= 0x39) { v = v * 10 + b[at++] - 0x30; digits += 1; }
          if (!digits) throw new Error("The " + fmt + " file holds a character that is not a number in its pixels.");
          values[c] = v;
        }
        put(p, values);
      }
    } else if (kind === 4) {
      const rowBytes = (width + 7) >> 3;
      if (at + rowBytes * height > b.length) throw truncated();
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const bit = (b[at + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
          const o = (y * width + x) * 4;
          rgba[o] = rgba[o + 1] = rgba[o + 2] = bit ? 0 : 255; rgba[o + 3] = 255;
        }
      }
    } else {
      const wide = maxval > 255;
      const size = wide ? 2 : 1;
      if (at + count * depth * size > b.length) throw truncated();
      const values = new Array(depth);
      for (let p = 0; p < count; p += 1) {
        for (let c = 0; c < depth; c += 1) {
          values[c] = wide ? (b[at] << 8) | b[at + 1] : b[at];
          at += size;
        }
        put(p, values);
      }
    }
    return { width: width, height: height, rgba: rgba, maxval: maxval, tuple: kind === 7 ? tuple : "" };
  }

  function encodePpm(image) {
    checkImage(image);
    const { width, height, rgba } = image;
    const head = ascii("P6\n" + width + " " + height + "\n255\n");
    const body = new Uint8Array(width * height * 3);
    for (let p = 0; p < width * height; p += 1) {
      const a = rgba[p * 4 + 3];
      body[p * 3] = onWhite(rgba[p * 4], a);
      body[p * 3 + 1] = onWhite(rgba[p * 4 + 1], a);
      body[p * 3 + 2] = onWhite(rgba[p * 4 + 2], a);
    }
    return concat([head, body]);
  }

  function encodePam(image) {
    checkImage(image);
    const { width, height, rgba } = image;
    const head = ascii("P7\nWIDTH " + width + "\nHEIGHT " + height + "\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n");
    const body = new Uint8Array(width * height * 4);
    body.set(rgba.subarray ? rgba.subarray(0, body.length) : rgba.slice(0, body.length));
    return concat([head, body]);
  }

  /* ── QOI (qoiformat.org, specification 1.0) ── */

  const QOI_OP_INDEX = 0x00;
  const QOI_OP_DIFF = 0x40;
  const QOI_OP_LUMA = 0x80;
  const QOI_OP_RUN = 0xc0;
  const QOI_OP_RGB = 0xfe;
  const QOI_OP_RGBA = 0xff;
  const QOI_END = [0, 0, 0, 0, 0, 0, 0, 1];
  const qoiHash = (r, g, b, a) => (r * 3 + g * 5 + b * 7 + a * 11) % 64;

  function decodeQoi(input) {
    const b = bytesOf(input);
    if (b.length < 14) throw new Error("The QOI file is too short to hold a header.");
    if (b[0] !== 0x71 || b[1] !== 0x6f || b[2] !== 0x69 || b[3] !== 0x66) throw new Error("This is not a QOI file: it does not start with \"qoif\".");
    const width = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0;
    const height = ((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) >>> 0;
    const channels = b[12];
    const colorspace = b[13];
    if (channels !== 3 && channels !== 4) throw new Error("The QOI file has a bad channel count (" + channels + ").");
    if (colorspace > 1) throw new Error("The QOI file has a bad colour space (" + colorspace + ").");
    checkSize("QOI", width, height);
    const count = width * height;
    const rgba = new Uint8ClampedArray(count * 4);
    const index = new Uint8Array(256);
    let r = 0; let g = 0; let bl = 0; let a = 255;
    let at = 14;
    const end = b.length;
    let run = 0;
    for (let p = 0; p < count; p += 1) {
      if (run > 0) {
        run -= 1;
      } else {
        if (at >= end) throw new Error("The QOI file is truncated: it ends before every pixel is decoded.");
        const op = b[at++];
        if (op === QOI_OP_RGB) {
          if (at + 3 > end) throw new Error("The QOI file is truncated inside an RGB chunk.");
          r = b[at]; g = b[at + 1]; bl = b[at + 2]; at += 3;
        } else if (op === QOI_OP_RGBA) {
          if (at + 4 > end) throw new Error("The QOI file is truncated inside an RGBA chunk.");
          r = b[at]; g = b[at + 1]; bl = b[at + 2]; a = b[at + 3]; at += 4;
        } else if ((op & 0xc0) === QOI_OP_INDEX) {
          const i = (op & 63) * 4;
          r = index[i]; g = index[i + 1]; bl = index[i + 2]; a = index[i + 3];
        } else if ((op & 0xc0) === QOI_OP_DIFF) {
          r = (r + ((op >> 4) & 3) - 2) & 255;
          g = (g + ((op >> 2) & 3) - 2) & 255;
          bl = (bl + (op & 3) - 2) & 255;
        } else if ((op & 0xc0) === QOI_OP_LUMA) {
          if (at >= end) throw new Error("The QOI file is truncated inside a LUMA chunk.");
          const next = b[at++];
          const dg = (op & 63) - 32;
          r = (r + dg - 8 + ((next >> 4) & 15)) & 255;
          g = (g + dg) & 255;
          bl = (bl + dg - 8 + (next & 15)) & 255;
        } else {
          run = op & 63;
        }
        const h = qoiHash(r, g, bl, a) * 4;
        index[h] = r; index[h + 1] = g; index[h + 2] = bl; index[h + 3] = a;
      }
      const o = p * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = a;
    }
    return { width: width, height: height, rgba: rgba, channels: channels, colorspace: colorspace };
  }

  function encodeQoi(image, options) {
    checkImage(image);
    const { width, height, rgba } = image;
    const count = width * height;
    let channels = options && (options.channels === 3 || options.channels === 4) ? options.channels : 3;
    if (!(options && options.channels)) for (let i = 3; i < count * 4; i += 4) if (rgba[i] !== 255) { channels = 4; break; }
    const out = Writer(14 + count * 2 + 8);
    out.bytes([0x71, 0x6f, 0x69, 0x66,
      (width >>> 24) & 255, (width >> 16) & 255, (width >> 8) & 255, width & 255,
      (height >>> 24) & 255, (height >> 16) & 255, (height >> 8) & 255, height & 255,
      channels, options && options.colorspace === 1 ? 1 : 0]);
    const index = new Uint8Array(256);
    let pr = 0; let pg = 0; let pb = 0; let pa = 255;
    let run = 0;
    const signed = (v) => ((v + 128) & 255) - 128;
    for (let p = 0; p < count; p += 1) {
      const o = p * 4;
      const r = rgba[o]; const g = rgba[o + 1]; const bl = rgba[o + 2]; const a = channels === 4 ? rgba[o + 3] : 255;
      if (r === pr && g === pg && bl === pb && a === pa) {
        run += 1;
        if (run === 62 || p === count - 1) { out.push(QOI_OP_RUN | (run - 1)); run = 0; }
        continue;
      }
      if (run > 0) { out.push(QOI_OP_RUN | (run - 1)); run = 0; }
      const h = qoiHash(r, g, bl, a);
      if (index[h * 4] === r && index[h * 4 + 1] === g && index[h * 4 + 2] === bl && index[h * 4 + 3] === a) {
        out.push(QOI_OP_INDEX | h);
      } else {
        index[h * 4] = r; index[h * 4 + 1] = g; index[h * 4 + 2] = bl; index[h * 4 + 3] = a;
        if (a === pa) {
          const vr = signed(r - pr); const vg = signed(g - pg); const vb = signed(bl - pb);
          const vgr = vr - vg; const vgb = vb - vg;
          if (vr > -3 && vr < 2 && vg > -3 && vg < 2 && vb > -3 && vb < 2) {
            out.push(QOI_OP_DIFF | ((vr + 2) << 4) | ((vg + 2) << 2) | (vb + 2));
          } else if (vgr > -9 && vgr < 8 && vg > -33 && vg < 32 && vgb > -9 && vgb < 8) {
            out.push(QOI_OP_LUMA | (vg + 32));
            out.push(((vgr + 8) << 4) | (vgb + 8));
          } else {
            out.bytes([QOI_OP_RGB, r, g, bl]);
          }
        } else {
          out.bytes([QOI_OP_RGBA, r, g, bl, a]);
        }
      }
      pr = r; pg = g; pb = bl; pa = a;
    }
    out.bytes(QOI_END);
    return out.done();
  }

  /* ── PCX (ZSoft) ── */

  const EGA_DEFAULT = [
    0, 0, 0, 0, 0, 170, 0, 170, 0, 0, 170, 170, 170, 0, 0, 170, 0, 170, 170, 85, 0, 170, 170, 170,
    85, 85, 85, 85, 85, 255, 85, 255, 85, 85, 255, 255, 255, 85, 85, 255, 85, 255, 255, 255, 85, 255, 255, 255,
  ];

  function decodePcx(input) {
    const b = bytesOf(input);
    if (b.length < 128) throw new Error("The PCX file is too short to hold a header.");
    if (b[0] !== 0x0a) throw new Error("This is not a PCX file: the first byte is not 0x0A.");
    const version = b[1];
    const encoding = b[2];
    const bits = b[3];
    if ([0, 2, 3, 4, 5].indexOf(version) < 0) throw new Error("The PCX file has an unknown version (" + version + ").");
    if (encoding > 1) throw new Error("The PCX file has an unknown encoding (" + encoding + ").");
    const u16 = (at) => b[at] | (b[at + 1] << 8);
    const width = u16(8) - u16(4) + 1;
    const height = u16(10) - u16(6) + 1;
    const planes = b[65];
    const bpl = u16(66);
    const paletteInfo = u16(68);
    checkSize("PCX", width, height);
    const layout = bits + "x" + planes;
    if (["1x1", "2x1", "4x1", "8x1", "1x3", "1x4", "8x3", "8x4"].indexOf(layout) < 0) {
      throw new Error("The PCX file has an unsupported layout (" + bits + "-bit, " + planes + " planes).");
    }
    if (bpl * 8 < width * bits) throw new Error("The PCX header says each line holds " + bpl + " bytes, too few for " + width + " pixels.");
    const lineBytes = bpl * planes;
    const total = lineBytes * height;
    const data = new Uint8Array(total);
    let at = 128;
    // A 256-colour file ends with 0x0C and a 768-byte palette; keep it out of the pixel stream.
    const hasVga = bits === 8 && planes === 1 && b.length >= 128 + 769 && b[b.length - 769] === 0x0c;
    const end = hasVga ? b.length - 769 : b.length;
    if (encoding === 1) {
      let n = 0;
      while (n < total) {
        if (at >= end) throw new Error("The PCX file is truncated inside its RLE pixel data.");
        const v = b[at++];
        if ((v & 0xc0) === 0xc0) {
          if (at >= end) throw new Error("The PCX file is truncated inside its RLE pixel data.");
          const run = v & 0x3f;
          const value = b[at++];
          for (let k = 0; k < run && n < total; k += 1) data[n++] = value;
        } else {
          data[n++] = v;
        }
      }
    } else {
      if (at + total > end) throw new Error("The PCX file is truncated: it holds fewer pixels than its size says.");
      data.set(b.subarray(at, at + total));
    }
    let palette = null;
    if (bits === 8 && planes === 1) {
      palette = new Uint8Array(768);
      if (hasVga) palette.set(b.subarray(b.length - 768));
      else if (paletteInfo === 2) for (let i = 0; i < 256; i += 1) palette[i * 3] = palette[i * 3 + 1] = palette[i * 3 + 2] = i;
      else throw new Error("The 256-colour PCX file has no palette at its end.");
    } else if ((bits === 2 || bits === 4) && planes === 1 || (bits === 1 && planes > 1)) {
      palette = new Uint8Array(48);
      let empty = true;
      for (let i = 0; i < 48; i += 1) { palette[i] = b[16 + i]; if (b[16 + i]) empty = false; }
      if (empty) palette.set(EGA_DEFAULT);
    }
    const count = width * height;
    const rgba = new Uint8ClampedArray(count * 4);
    for (let y = 0; y < height; y += 1) {
      const line = y * lineBytes;
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        rgba[o + 3] = 255;
        if (bits === 8 && planes >= 3) {
          rgba[o] = data[line + x]; rgba[o + 1] = data[line + bpl + x]; rgba[o + 2] = data[line + 2 * bpl + x];
          if (planes === 4) rgba[o + 3] = data[line + 3 * bpl + x];
        } else if (bits === 8) {
          const i = data[line + x] * 3;
          rgba[o] = palette[i]; rgba[o + 1] = palette[i + 1]; rgba[o + 2] = palette[i + 2];
        } else if (bits === 1 && planes === 1) {
          const v = (data[line + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
          rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
        } else if (bits === 1) {
          let i = 0;
          for (let pl = 0; pl < planes; pl += 1) i |= ((data[line + pl * bpl + (x >> 3)] >> (7 - (x & 7))) & 1) << pl;
          if (planes === 3) { rgba[o] = i & 1 ? 255 : 0; rgba[o + 1] = i & 2 ? 255 : 0; rgba[o + 2] = i & 4 ? 255 : 0; } else { rgba[o] = palette[i * 3]; rgba[o + 1] = palette[i * 3 + 1]; rgba[o + 2] = palette[i * 3 + 2]; }
        } else {
          const perByte = 8 / bits;
          const shift = 8 - bits * (1 + (x % perByte));
          const i = (data[line + Math.floor(x / perByte)] >> shift) & ((1 << bits) - 1);
          rgba[o] = palette[i * 3]; rgba[o + 1] = palette[i * 3 + 1]; rgba[o + 2] = palette[i * 3 + 2];
        }
      }
    }
    return { width: width, height: height, rgba: rgba };
  }

  function encodePcx(image) {
    checkImage(image);
    const { width, height, rgba } = image;
    if (width > 65535 || height > 65535) throw new Error("A PCX file cannot be wider or taller than 65535 pixels.");
    const bpl = width + (width & 1);
    const head = new Uint8Array(128);
    head[0] = 0x0a; head[1] = 5; head[2] = 1; head[3] = 8;
    const put16 = (at, v) => { head[at] = v & 255; head[at + 1] = (v >> 8) & 255; };
    put16(8, width - 1); put16(10, height - 1); put16(12, 72); put16(14, 72);
    head[65] = 3; put16(66, bpl); put16(68, 1);
    const out = Writer(128 + bpl * 3 * height + 64);
    out.bytes(head);
    const line = new Uint8Array(bpl * 3);
    for (let y = 0; y < height; y += 1) {
      line.fill(0);
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        const a = rgba[o + 3];
        line[x] = onWhite(rgba[o], a);
        line[bpl + x] = onWhite(rgba[o + 1], a);
        line[2 * bpl + x] = onWhite(rgba[o + 2], a);
      }
      let i = 0;
      while (i < line.length) {
        const v = line[i];
        let run = 1;
        while (i + run < line.length && run < 63 && line[i + run] === v) run += 1;
        if (run > 1 || (v & 0xc0) === 0xc0) out.push(0xc0 | run);
        out.push(v);
        i += run;
      }
    }
    return out.done();
  }

  /* ── SVG text ── */

  function utf8(bytes) {
    let b = bytesOf(bytes);
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
    return Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("utf8");
  }

  /* SVG: optional BOM and whitespace, then an XML prolog / comments / doctype, then <svg. */
  function isSvg(input) {
    const b = bytesOf(input);
    const head = utf8(b.subarray(0, Math.min(b.length, 4096)));
    let s = head.replace(/^\uFEFF/, "").replace(/^\s+/, "");
    if (!s.length || s[0] !== "<") return false;
    for (let guard = 0; guard < 64; guard += 1) {
      s = s.replace(/^\s+/, "");
      if (/^<svg[\s>/:]/i.test(s)) return true;
      if (s.indexOf("<?") === 0) { const end = s.indexOf("?>"); if (end < 0) return false; s = s.slice(end + 2); continue; }
      if (s.indexOf("<!--") === 0) { const end = s.indexOf("-->"); if (end < 0) return false; s = s.slice(end + 3); continue; }
      if (/^<!DOCTYPE/i.test(s)) {
        const bracket = s.indexOf("[");
        const close = s.indexOf(">");
        if (bracket >= 0 && bracket < close) { const end = s.indexOf("]>"); if (end < 0) return false; s = s.slice(end + 2); } else { if (close < 0) return false; s = s.slice(close + 1); }
        continue;
      }
      return false;
    }
    return false;
  }

  const UNIT = { "": 1, px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, em: 16, ex: 8 };

  function svgLength(value) {
    const m = /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(String(value || ""));
    if (!m) return 0;
    const unit = UNIT[m[2].toLowerCase()];
    return unit ? parseFloat(m[1]) * unit : 0;
  }

  /* The size an SVG asks for: width/height attributes, else the viewBox, else 300 × 150;
   * never more than `cap` (8192) on its longer side. */
  function svgSize(text, cap) {
    const limit = cap || 8192;
    const src = String(text || "");
    const tag = /<svg\b([^>]*)>/i.exec(src.replace(/<!--[\s\S]*?-->/g, ""));
    const attrs = tag ? tag[1] : "";
    const attr = (name) => {
      const m = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i").exec(attrs);
      return m ? (m[2] !== undefined ? m[2] : m[3]) : null;
    };
    let width = svgLength(attr("width"));
    let height = svgLength(attr("height"));
    const box = (attr("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    const boxOk = box.length === 4 && box[2] > 0 && box[3] > 0 && box.every(isFinite);
    if (!width && !height && boxOk) { width = box[2]; height = box[3]; } else if (width && !height) {
      height = boxOk ? width * box[3] / box[2] : 150;
    } else if (!width && height) {
      width = boxOk ? height * box[2] / box[3] : 300;
    }
    if (!width || !height) { width = 300; height = 150; }
    const longer = Math.max(width, height);
    if (longer > limit) { width = width * limit / longer; height = height * limit / longer; }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  function base64(bytes) {
    const b = bytesOf(bytes);
    if (typeof btoa === "function") {
      let s = "";
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return btoa(s);
    }
    return Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("base64");
  }

  /* An SVG of the picture's size holding the picture as a PNG <image>. */
  function svgWrapPng(width, height, pngBytes) {
    const text = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"" + width + "\" height=\"" + height +
      "\" viewBox=\"0 0 " + width + " " + height + "\">\n" +
      "  <image width=\"" + width + "\" height=\"" + height + "\" href=\"data:image/png;base64," + base64(pngBytes) + "\"/>\n" +
      "</svg>\n";
    return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text) : new Uint8Array(Buffer.from(text, "utf8"));
  }

  /* ── recognising a file ── */

  const FAMILIES = {
    tga: ["tga", "icb", "vda", "vst"],
    netpbm: ["pbm", "pgm", "ppm", "pnm", "pam"],
    qoi: ["qoi"],
    pcx: ["pcx"],
  };
  const EXTENSIONS = new Set([].concat(FAMILIES.tga, FAMILIES.netpbm, FAMILIES.qoi, FAMILIES.pcx));

  function familyOf(ext) {
    const e = String(ext || "").toLowerCase().replace(/^.*\./, "");
    for (const name in FAMILIES) if (FAMILIES[name].indexOf(e) >= 0) return name;
    if (e === "svg") return "svg";
    return "";
  }

  /* The family a file's first bytes point to. TGA has no signature at the front, so only a
   * TGA 2.0 footer identifies it. */
  function magic(input) {
    const b = bytesOf(input);
    if (b.length >= 4 && b[0] === 0x71 && b[1] === 0x6f && b[2] === 0x69 && b[3] === 0x66) return "qoi";
    if (b.length >= 3 && b[0] === 0x50 && b[1] >= 0x31 && b[1] <= 0x37 && isSpace(b[2])) return "netpbm";
    if (b.length >= 128 && b[0] === 0x0a && [0, 2, 3, 4, 5].indexOf(b[1]) >= 0 && b[2] <= 1 && [1, 2, 4, 8].indexOf(b[3]) >= 0 &&
      [1, 3, 4].indexOf(b[65]) >= 0 && b[64] === 0) return "pcx";
    if (isTgaFooter(b)) return "tga";
    if (b.length && isSvg(b)) return "svg";
    return "";
  }

  function decode(input, family) {
    const f = family || magic(input);
    if (f === "tga") return decodeTga(input);
    if (f === "netpbm") return decodeNetpbm(input);
    if (f === "qoi") return decodeQoi(input);
    if (f === "pcx") return decodePcx(input);
    throw new Error("Unknown picture format" + (f ? " (" + f + ")" : "") + ".");
  }

  return {
    FAMILIES: FAMILIES,
    EXTENSIONS: EXTENSIONS,
    familyOf: familyOf,
    magic: magic,
    decode: decode,
    decodeTga: decodeTga,
    encodeTga: encodeTga,
    decodeNetpbm: decodeNetpbm,
    encodePpm: encodePpm,
    encodePam: encodePam,
    decodeQoi: decodeQoi,
    encodeQoi: encodeQoi,
    decodePcx: decodePcx,
    encodePcx: encodePcx,
    isSvg: isSvg,
    svgSize: svgSize,
    svgWrapPng: svgWrapPng,
    utf8: utf8,
  };
})();

export default api;
