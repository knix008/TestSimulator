/* Image formats MyPaint can open and write.
 *
 *   Formats.kindOf(name, bytes)        → 'native' | 'tiff' | 'heif' | 'j2k' | 'dicom' | 'raw' | ''
 *   Formats.decode(bytes, name, opts)  → Promise<{ width, height, rgba, pages, page, kind, meta }>
 *   Formats.toDataUrl(result)          → a PNG data URL for the decoded pixels
 *   Formats.encode(format, image, opts)→ Promise<{ bytes, mime, ext }>
 *   Formats.exif(bytes)                → camera metadata read from a TIFF/EXIF header
 *
 * Browser decoders: PNG / JPEG / GIF / WebP / BMP / ICO / AVIF go through createImageBitmap.
 * TIFF (every page, LZW / PackBits / Deflate / JPEG, 8-16 bit) uses UTIF, HEIC / HEIF uses
 * libheif (the file's primary image first, every other image it holds as a further page),
 * JPEG 2000 uses OpenJPEG, DICOM uses the full decoder in dicom.js, and camera RAW files are
 * shown from the full-size JPEG the camera embeds in them.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./dicom"), require("./encoders"));
  else root.MyPaintFormats = factory(root.DicomDecoder, root.Encoders);
})(typeof self !== "undefined" ? self : this, function (D, Encoders) {
  const NATIVE = new Set(["png", "jpg", "jpeg", "jpe", "jfif", "gif", "webp", "bmp", "dib", "ico", "avif", "apng"]);
  const TIFF = new Set(["tif", "tiff", "btf", "tf8"]);
  const HEIF = new Set(["heic", "heif", "hif", "heics", "avci"]);
  const J2K = new Set(["jp2", "j2k", "jpc", "jpx", "j2c", "jpf"]);
  const DICOM = new Set(["dcm", "dicm", "dicom", "ima"]);
  /* Camera RAW, by maker: Hasselblad, Canon, Sony, Phase One, Adobe, Epson, Kodak,
   * Leaf, Mamiya, Minolta, Nikon, Olympus, Pentax, Panasonic, Samsung, Sigma, Fujifilm. */
  const RAW = new Set([
    "3fr", "ari", "arw", "bay", "cap", "cr2", "cr3", "crw", "dcr", "dcs", "dng", "drf",
    "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef", "mos", "mrw", "nef",
    "nrw", "obm", "orf", "ori", "pef", "ptx", "pxn", "raf", "raw", "rw2", "rwl", "rwz",
    "sr2", "srf", "srw", "x3f",
  ]);

  const ALL = new Set([...NATIVE, ...TIFF, ...HEIF, ...J2K, ...DICOM, ...RAW]);

  const SAVE_FORMATS = [
    { id: "png", ext: "png", mime: "image/png" },
    { id: "jpeg", ext: "jpg", mime: "image/jpeg" },
    { id: "webp", ext: "webp", mime: "image/webp" },
    { id: "bmp", ext: "bmp", mime: "image/bmp" },
    { id: "tiff", ext: "tif", mime: "image/tiff" },
    { id: "gif", ext: "gif", mime: "image/gif" },
    { id: "ico", ext: "ico", mime: "image/x-icon" },
    { id: "jp2", ext: "jp2", mime: "image/jp2" },
    { id: "j2k", ext: "j2k", mime: "image/x-jp2-codestream" },
    { id: "dicom", ext: "dcm", mime: "application/dicom" },
  ];

  function extensionOf(name) {
    const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ""));
    return match ? match[1].toLowerCase() : "";
  }

  function bytesOf(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    return new Uint8Array(input || 0);
  }

  function magicKind(bytes) {
    const b = bytes;
    if (!b || b.length < 12) return "";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "native";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "native";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "native";
    if (b[0] === 0x42 && b[1] === 0x4d) return "native";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) return "native";
    if (b[128] === 0x44 && b[129] === 0x49 && b[130] === 0x43 && b[131] === 0x4d) return "dicom";
    if (b[0] === 0xff && b[1] === 0x4f && b[2] === 0xff && b[3] === 0x51) return "j2k";
    if (b[4] === 0x6a && b[5] === 0x50 && b[6] === 0x20 && b[7] === 0x20) return "j2k";
    const brand = String.fromCharCode(b[4], b[5], b[6], b[7]);
    if (brand === "ftyp") {
      const kind = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (kind.indexOf("hei") === 0 || kind.indexOf("mif") === 0 || kind === "msf1" || kind === "avci") return "heif";
      if (kind === "avif" || kind === "avis") return "native";
      if (kind === "crx ") return "raw";
    }
    if ((b[0] === 0x49 && b[1] === 0x49 && (b[2] === 42 || b[2] === 43)) || (b[0] === 0x4d && b[1] === 0x4d)) return "tiff";
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) === "FUJI") return "raw";
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) === "FOVb") return "raw";
    return "";
  }

  function kindOf(name, bytes) {
    const ext = extensionOf(name);
    if (DICOM.has(ext)) return "dicom";
    if (RAW.has(ext)) return "raw";
    if (TIFF.has(ext)) return "tiff";
    if (HEIF.has(ext)) return "heif";
    if (J2K.has(ext)) return "j2k";
    if (NATIVE.has(ext)) return "native";
    const magic = bytes ? magicKind(bytesOf(bytes)) : "";
    return magic;
  }

  function isSupported(name) {
    return ALL.has(extensionOf(name));
  }

  function listExtensions() {
    return Array.from(ALL).sort();
  }

  /* ── pixels in, pixels out ── */

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function rgbaFromDrawable(drawable, width, height) {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, rgba: data.data };
  }

  function toCanvas(result) {
    const canvas = makeCanvas(result.width, result.height);
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(canvas.width, canvas.height);
    image.data.set(result.rgba.subarray ? result.rgba.subarray(0, image.data.length) : result.rgba);
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function toDataUrl(result, mime, quality) {
    return toCanvas(result).toDataURL(mime || "image/png", quality);
  }

  async function decodeNative(bytes, mime) {
    const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    const bitmap = await createImageBitmap(blob);
    const out = rgbaFromDrawable(bitmap, bitmap.width, bitmap.height);
    if (bitmap.close) bitmap.close();
    return out;
  }

  const MIME = {
    png: "image/png", apng: "image/apng", jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg",
    jfif: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", dib: "image/bmp",
    ico: "image/x-icon", avif: "image/avif",
  };

  /* ── TIFF ── */

  async function decodeTiff(bytes, page) {
    await D.vendor("pako");
    const UTIF = await D.vendor("utif");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error("The TIFF file holds no image.");
    const pages = ifds.filter((item) => item.t256 && item.t257);
    const list = pages.length ? pages : ifds;
    const index = Math.max(0, Math.min(list.length - 1, Number(page) || 0));
    const ifd = list[index];
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    return {
      width: ifd.width,
      height: ifd.height,
      rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
      pages: list.length,
      page: index,
    };
  }

  /* ── HEIF / HEIC ── */

  /* The brands in the ftyp box at the front of the file. "msf1" marks an image sequence, which
   * lives in a movie track rather than in image items — libheif reads the items only. */
  function heifBrands(bytes) {
    if (bytes.length < 16) return [];
    if (String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) !== "ftyp") return [];
    const size = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const end = Math.min(size || bytes.length, bytes.length);
    const brands = [];
    for (let at = 8; at + 4 <= end; at += 4) brands.push(String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]));
    return brands;
  }

  async function decodeHeif(bytes, page) {
    try {
      const native = await decodeNative(bytes, "image/heic");
      if (native.width > 0) return Object.assign(native, { pages: 1, page: 0 });
    } catch (error) { /* the platform cannot decode HEVC, use libheif below */ }
    const lib = await D.vendor("libheif");
    const decoder = new lib.HeifDecoder();
    const images = decoder.decode(bytes);
    if (!images || !images.length) {
      throw new Error(heifBrands(bytes).indexOf("msf1") >= 0
        ? "This HEIF file holds an image sequence, which MyPaint cannot read."
        : "The HEIF file holds no image.");
    }
    // A HEIF file names one of its images the primary item: the grid a phone writes a large
    // photo as, or the turned or cropped version of a picture. The rest are its tiles and
    // alternates, so the primary one comes first and the others follow as further pages.
    const order = images.slice();
    const primary = order.findIndex((item) => { try { return item.is_primary(); } catch (error) { return false; } });
    if (primary > 0) order.unshift(order.splice(primary, 1)[0]);
    const index = Math.max(0, Math.min(order.length - 1, Math.round(Number(page) || 0)));
    const image = order[index];
    const width = image.get_width();
    const height = image.get_height();
    const out = new Uint8ClampedArray(width * height * 4);
    await new Promise((resolve, reject) => {
      image.display({ data: out, width: width, height: height }, (done) => (done ? resolve(done) : reject(new Error("The HEIF image could not be decoded."))));
    });
    images.forEach((item) => { try { item.free(); } catch (error) { /* already freed */ } });
    return { width: width, height: height, rgba: out, pages: images.length, page: index };
  }

  /* ── JPEG 2000 ── */

  function j2kCodestream(bytes) {
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0x4f && bytes[2] === 0xff && bytes[3] === 0x51) return bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;
    while (pos + 8 <= bytes.length) {
      let len = view.getUint32(pos);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      let head = 8;
      if (len === 1) { len = Number(view.getBigUint64(pos + 8)); head = 16; }
      if (len === 0) len = bytes.length - pos;
      if (type === "jp2c") return bytes.subarray(pos + head, pos + len);
      if (len < head) break;
      pos += len;
    }
    throw new Error("The JPEG 2000 file holds no codestream.");
  }

  async function decodeJ2k(bytes) {
    const module = await D.vendor("j2k");
    const stream = j2kCodestream(bytes);
    const decoder = new module.J2KDecoder();
    try {
      const target = decoder.getEncodedBuffer(stream.length);
      target.set(stream);
      decoder.decode();
      const info = decoder.getFrameInfo();
      const out = decoder.getDecodedBuffer();
      const width = info.width;
      const height = info.height;
      const spp = info.componentCount;
      const shift = info.bitsPerSample > 8 ? info.bitsPerSample - 8 : 0;
      const samples = info.bitsPerSample > 8 ? new Uint16Array(out.buffer, out.byteOffset, out.byteLength >> 1) : out;
      const count = width * height;
      const rgba = new Uint8ClampedArray(count * 4);
      for (let p = 0; p < count; p += 1) {
        const o = p * 4;
        if (spp >= 3) {
          rgba[o] = samples[p * spp] >> shift;
          rgba[o + 1] = samples[p * spp + 1] >> shift;
          rgba[o + 2] = samples[p * spp + 2] >> shift;
          rgba[o + 3] = spp > 3 ? samples[p * spp + 3] >> shift : 255;
        } else {
          const grey = samples[p * spp] >> shift;
          rgba[o] = grey;
          rgba[o + 1] = grey;
          rgba[o + 2] = grey;
          rgba[o + 3] = 255;
        }
      }
      return { width: width, height: height, rgba: rgba, pages: 1, page: 0 };
    } finally {
      decoder.delete();
    }
  }

  /* ── camera RAW ──
   * A RAW file keeps the sensor data in a maker-specific layout, but every camera also
   * writes a full-size JPEG rendering of the shot into the same file. That preview is
   * what MyPaint shows and converts, so one reader covers every maker. */

  function readJpegCandidates(bytes) {
    const found = [];
    const limit = bytes.length - 3;
    for (let i = 0; i < limit; i += 1) {
      if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
      let end = -1;
      for (let j = i + 2; j < bytes.length - 1; j += 1) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) { end = j + 2; break; }
      }
      if (end < 0) break;
      if (end - i > 512) found.push({ start: i, length: end - i });
      i = end - 1;
    }
    return found;
  }

  function tiffPreviews(bytes) {
    if (bytes.length < 8) return [];
    const little = bytes[0] === 0x49 && bytes[1] === 0x49;
    const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
    if (!little && !big) return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (at) => view.getUint16(at, little);
    const u32 = (at) => view.getUint32(at, little);
    const out = [];
    const seen = new Set();
    const walk = (offset, depth) => {
      if (depth > 4 || offset <= 0 || offset + 2 > bytes.length || seen.has(offset)) return;
      seen.add(offset);
      const count = u16(offset);
      if (count > 512) return;
      let jpegAt = 0;
      let jpegLen = 0;
      let compression = 0;
      let strips = [];
      let sizes = [];
      for (let i = 0; i < count; i += 1) {
        const entry = offset + 2 + i * 12;
        if (entry + 12 > bytes.length) return;
        const tag = u16(entry);
        const type = u16(entry + 2);
        const num = u32(entry + 4);
        const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 }[type] || 1;
        const total = size * num;
        const valueAt = total <= 4 ? entry + 8 : u32(entry + 8);
        const scalar = () => {
          if (valueAt + size > bytes.length) return 0;
          return type === 3 ? u16(valueAt) : u32(valueAt);
        };
        const array = () => {
          const values = [];
          for (let k = 0; k < num && valueAt + k * size + size <= bytes.length; k += 1) {
            values.push(type === 3 ? u16(valueAt + k * size) : u32(valueAt + k * size));
          }
          return values;
        };
        if (tag === 0x0201) jpegAt = scalar();
        else if (tag === 0x0202) jpegLen = scalar();
        else if (tag === 0x0103) compression = scalar();
        else if (tag === 0x0111) strips = array();
        else if (tag === 0x0117) sizes = array();
        else if (tag === 0x014a || tag === 0x8769) array().forEach((sub) => walk(sub, depth + 1));
      }
      if (jpegAt > 0 && jpegLen > 0 && jpegAt + jpegLen <= bytes.length) out.push({ start: jpegAt, length: jpegLen });
      if ((compression === 6 || compression === 7) && strips.length && sizes.length) {
        for (let i = 0; i < strips.length && i < sizes.length; i += 1) {
          if (strips[i] > 0 && strips[i] + sizes[i] <= bytes.length) out.push({ start: strips[i], length: sizes[i] });
        }
      }
      const next = offset + 2 + count * 12;
      if (next + 4 <= bytes.length) {
        const after = u32(next);
        if (after > 0) walk(after, depth);
      }
    };
    walk(u32(4), 0);
    return out;
  }

  function fujiPreview(bytes) {
    if (bytes.length < 96) return [];
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "FUJI") return [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = view.getUint32(84);
    const length = view.getUint32(88);
    if (start > 0 && length > 0 && start + length <= bytes.length) return [{ start: start, length: length }];
    return [];
  }

  function rawPreviews(bytes) {
    const list = fujiPreview(bytes).concat(tiffPreviews(bytes));
    const clean = list.filter((item) => bytes[item.start] === 0xff && bytes[item.start + 1] === 0xd8);
    if (clean.length) return clean.sort((a, b) => b.length - a.length);
    return readJpegCandidates(bytes).sort((a, b) => b.length - a.length);
  }

  async function decodeRaw(bytes) {
    const previews = rawPreviews(bytes);
    if (!previews.length) throw new Error("This camera file carries no picture MyPaint can read.");
    let last = null;
    for (const preview of previews.slice(0, 6)) {
      try {
        const slice = bytes.subarray(preview.start, preview.start + preview.length);
        const out = await decodeNative(slice, "image/jpeg");
        return Object.assign(out, { pages: 1, page: 0, previewBytes: preview.length, previews: previews.length });
      } catch (error) {
        last = error;
      }
    }
    throw last || new Error("The picture inside this camera file could not be read.");
  }

  /* ── EXIF ── */

  const EXIF_TAGS = {
    0x010f: "make", 0x0110: "model", 0x0112: "orientation", 0x0131: "software",
    0x0132: "dateTime", 0x829a: "exposureTime", 0x829d: "fNumber", 0x8827: "iso",
    0x8832: "isoSpeed", 0x9003: "dateTaken", 0x920a: "focalLength", 0xa402: "exposureMode",
    0xa403: "whiteBalance", 0x9204: "exposureBias", 0xa434: "lens",
  };

  function exifFrom(bytes, base, little) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (at) => view.getUint16(at, little);
    const u32 = (at) => view.getUint32(at, little);
    const out = {};
    const seen = new Set();
    const walk = (offset, depth) => {
      if (depth > 3 || offset <= 0 || base + offset + 2 > bytes.length || seen.has(offset)) return;
      seen.add(offset);
      const count = u16(base + offset);
      if (count > 512) return;
      for (let i = 0; i < count; i += 1) {
        const entry = base + offset + 2 + i * 12;
        if (entry + 12 > bytes.length) return;
        const tag = u16(entry);
        const type = u16(entry + 2);
        const num = u32(entry + 4);
        const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
        const total = size * num;
        const at = total <= 4 ? entry + 8 : base + u32(entry + 8);
        if (tag === 0x8769 || tag === 0x8825) { walk(u32(total <= 4 ? entry + 8 : at), depth + 1); continue; }
        const name = EXIF_TAGS[tag];
        if (!name || at + total > bytes.length || at < 0) continue;
        if (type === 2) {
          let value = "";
          for (let k = 0; k < num && bytes[at + k]; k += 1) value += String.fromCharCode(bytes[at + k]);
          if (value.trim()) out[name] = value.trim();
        } else if (type === 3) out[name] = u16(at);
        else if (type === 4) out[name] = u32(at);
        else if (type === 5 || type === 10) {
          const top = type === 5 ? u32(at) : view.getInt32(at, little);
          const bottom = type === 5 ? u32(at + 4) : view.getInt32(at + 4, little);
          if (bottom) out[name] = top / bottom;
        }
      }
      const next = base + offset + 2 + count * 12;
      if (next + 4 <= bytes.length) {
        const after = u32(next);
        if (after > 0) walk(after, depth);
      }
    };
    walk(u32(base + 4), 0);
    return out;
  }

  function exif(input) {
    const bytes = bytesOf(input);
    try {
      if (bytes.length > 8 && ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d))) {
        return exifFrom(bytes, 0, bytes[0] === 0x49);
      }
      if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        let pos = 2;
        while (pos + 4 < bytes.length) {
          if (bytes[pos] !== 0xff) break;
          const marker = bytes[pos + 1];
          const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
          if (marker === 0xe1 && String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]) === "Exif") {
            const base = pos + 10;
            return exifFrom(bytes, base, bytes[base] === 0x49);
          }
          if (marker === 0xda) break;
          pos += 2 + length;
        }
      }
    } catch (error) { /* metadata is optional */ }
    return {};
  }

  function describeExif(info) {
    if (!info) return "";
    const parts = [];
    if (info.make || info.model) parts.push([info.make, info.model].filter(Boolean).join(" "));
    if (info.lens) parts.push(info.lens);
    if (info.focalLength) parts.push(Math.round(info.focalLength) + "mm");
    if (info.fNumber) parts.push("f/" + (Math.round(info.fNumber * 10) / 10));
    if (info.exposureTime) {
      parts.push(info.exposureTime >= 1 ? info.exposureTime + "s" : "1/" + Math.round(1 / info.exposureTime) + "s");
    }
    const iso = info.iso || info.isoSpeed;
    if (iso) parts.push("ISO " + iso);
    if (info.dateTaken || info.dateTime) parts.push(info.dateTaken || info.dateTime);
    return parts.join(" · ");
  }

  /* ── one entry point ── */

  async function decode(input, name, options) {
    const opts = options || {};
    const bytes = bytesOf(input);
    const kind = opts.kind || kindOf(name, bytes);
    if (!kind) throw new Error("MyPaint does not know the format of " + (name || "this file") + ".");
    let result;
    if (kind === "tiff") result = await decodeTiff(bytes, opts.page);
    else if (kind === "heif") result = await decodeHeif(bytes, opts.page);
    else if (kind === "j2k") result = await decodeJ2k(bytes);
    else if (kind === "raw") result = await decodeRaw(bytes);
    else if (kind === "dicom") result = await decodeDicom(bytes, opts);
    else result = Object.assign(await decodeNative(bytes, MIME[extensionOf(name)] || ""), { pages: 1, page: 0 });
    const camera = kind === "raw" || kind === "tiff" || kind === "native" ? exif(bytes) : {};
    return Object.assign({ kind: kind, name: name || "", exif: camera, exifText: describeExif(camera) }, result);
  }

  async function decodeDicom(bytes, options) {
    const image = await D.load(bytes);
    const render = await image.render(options || {});
    return {
      width: render.width,
      height: render.height,
      rgba: render.rgba,
      pages: image.frames,
      page: render.state ? render.state.frame : 0,
      dicom: image,
    };
  }

  /* ── writing ── */

  async function canvasBlob(canvas, mime, quality) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error("This system cannot write " + mime + " files.");
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* JPEG 2000 goes through OpenJPEG, which writes a bare codestream; a .jp2 is that
   * codestream inside the box structure the format expects. */
  async function encodeJ2k(image, options) {
    const opts = options || {};
    const module = await D.vendor("j2k");
    if (!module.J2KEncoder) throw new Error("This build of the JPEG 2000 codec cannot write files.");
    const encoder = new module.J2KEncoder();
    try {
      const input = encoder.getDecodedBuffer({
        width: image.width,
        height: image.height,
        bitsPerSample: 8,
        componentCount: 3,
        isSigned: false,
      });
      const count = image.width * image.height;
      for (let i = 0; i < count; i += 1) {
        input[i * 3] = image.rgba[i * 4];
        input[i * 3 + 1] = image.rgba[i * 4 + 1];
        input[i * 3 + 2] = image.rgba[i * 4 + 2];
      }
      encoder.setDecompositions(4);
      const quality = opts.quality == null ? 0.92 : opts.quality;
      encoder.setCompressionRatio(Math.max(1, Math.round((1 - quality) * 40) + 1));
      encoder.encode();
      return new Uint8Array(encoder.getEncodedBuffer());
    } finally {
      encoder.delete();
    }
  }

  async function encode(format, image, options) {
    const opts = options || {};
    const spec = SAVE_FORMATS.find((item) => item.id === format) || SAVE_FORMATS[0];
    if (spec.id === "bmp") return { bytes: Encoders.bmp(image), mime: spec.mime, ext: spec.ext };
    if (spec.id === "tiff") return { bytes: Encoders.tiff({ width: image.width, height: image.height, rgba: image.rgba, dpi: opts.dpi || 72 }), mime: spec.mime, ext: spec.ext };
    if (spec.id === "gif") return { bytes: Encoders.gif(image), mime: spec.mime, ext: spec.ext };
    if (spec.id === "ico") return { bytes: Encoders.ico(image, opts.sizes), mime: spec.mime, ext: spec.ext };
    if (spec.id === "dicom") return { bytes: Encoders.dicom({ width: image.width, height: image.height, rgba: image.rgba, name: opts.name }), mime: spec.mime, ext: spec.ext };
    if (spec.id === "j2k") return { bytes: await encodeJ2k(image, opts), mime: spec.mime, ext: spec.ext };
    if (spec.id === "jp2") return { bytes: Encoders.jp2(await encodeJ2k(image, opts)), mime: spec.mime, ext: spec.ext };
    const canvas = image.canvas || toCanvas(image);
    const bytes = await canvasBlob(canvas, spec.mime, opts.quality == null ? 0.92 : opts.quality);
    return { bytes: bytes, mime: spec.mime, ext: spec.ext };
  }

  return {
    NATIVE: NATIVE,
    TIFF: TIFF,
    HEIF: HEIF,
    J2K: J2K,
    DICOM: DICOM,
    RAW: RAW,
    ALL: ALL,
    SAVE_FORMATS: SAVE_FORMATS,
    MIME: MIME,
    extensionOf: extensionOf,
    magicKind: magicKind,
    kindOf: kindOf,
    isSupported: isSupported,
    listExtensions: listExtensions,
    decode: decode,
    decodeTiff: decodeTiff,
    decodeHeif: decodeHeif,
    decodeJ2k: decodeJ2k,
    decodeRaw: decodeRaw,
    decodeDicom: decodeDicom,
    decodeNative: decodeNative,
    rawPreviews: rawPreviews,
    readJpegCandidates: readJpegCandidates,
    tiffPreviews: tiffPreviews,
    exif: exif,
    describeExif: describeExif,
    toCanvas: toCanvas,
    toDataUrl: toDataUrl,
    encode: encode,
    encodeJ2k: encodeJ2k,
  };
});
