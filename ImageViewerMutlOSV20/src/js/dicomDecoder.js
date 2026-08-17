/* DICOM decoder — works in Electron (CommonJS) and the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DicomDecoder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const LONG_VR = new Set([
    'OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV',
  ]);

  function toU8(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return new Uint8Array(input);
  }

  function ascii(bytes, start, len) {
    let s = '';
    const end = Math.min(bytes.length, start + len);
    for (let i = start; i < end; i++) {
      const c = bytes[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.replace(/\s+$/g, '');
  }

  function findStart(bytes) {
    if (bytes.length >= 132 && ascii(bytes, 128, 4) === 'DICM') return 132;
    const limit = Math.min(bytes.length - 4, 2048);
    for (let i = 0; i < limit; i++) {
      if (bytes[i] === 0x44 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x43 && bytes[i + 3] === 0x4D) {
        return i + 4;
      }
    }
    if (bytes.length >= 8) {
      const g = bytes[0] | (bytes[1] << 8);
      if (g === 0x0002 || g === 0x0004 || g === 0x0008) return 0;
    }
    return -1;
  }

  function decode(input) {
    const bytes = toU8(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = findStart(bytes);
    if (start < 0) return { error: 'Not a DICOM file (no DICM header)' };

    const u16 = (off, le) => view.getUint16(off, le !== false);
    const u32 = (off, le) => view.getUint32(off, le !== false);

    let offset = start;
    let explicit = true;
    let little = true;
    let inFileMeta = true;

    const tags = {
      rows: 0,
      cols: 0,
      bitsAllocated: 8,
      bitsStored: 8,
      samplesPerPixel: 1,
      pixelRepresentation: 0,
      planarConfig: 0,
      photometric: 'MONOCHROME2',
      transferSyntax: '',
      patientName: '',
      studyDate: '',
      modality: '',
    };

    let pixelBytes = null;
    let jpegBytes = null;

    function skipUndefinedSeq(off) {
      while (off + 8 <= bytes.length) {
        const g = u16(off, true);
        const e = u16(off + 2, true);
        if (g === 0xFFFE && e === 0xE0DD) return off + 8;
        if (g === 0xFFFE && (e === 0xE000 || e === 0xE00D)) {
          const itemLen = u32(off + 4, true);
          off += 8;
          if (itemLen === 0xFFFFFFFF) off = skipUndefinedSeq(off);
          else off += itemLen;
          continue;
        }
        const parsed = readElement(off, explicit, little);
        if (!parsed) break;
        if (parsed.length === 0xFFFFFFFF) off = skipUndefinedSeq(parsed.valueOff);
        else off = parsed.next;
      }
      return off;
    }

    function readEncapsulatedPixel(off) {
      const fragments = [];
      while (off + 8 <= bytes.length) {
        const g = u16(off, true);
        const e = u16(off + 2, true);
        const itemLen = u32(off + 4, true);
        off += 8;
        if (g === 0xFFFE && e === 0xE0DD) break;
        if (g === 0xFFFE && e === 0xE000) {
          if (itemLen === 0xFFFFFFFF) break;
          if (itemLen > 0 && off + itemLen <= bytes.length) {
            fragments.push(bytes.subarray(off, off + itemLen));
          }
          off += itemLen;
          continue;
        }
        break;
      }
      // First item is the basic offset table; remaining items are the frame
      const parts = fragments.length > 1 ? fragments.slice(1) : fragments;
      if (!parts.length) return { next: off };
      let total = 0;
      for (const p of parts) total += p.length;
      const out = new Uint8Array(total);
      let w = 0;
      for (const p of parts) {
        out.set(p, w);
        w += p.length;
      }
      return { bytes: out, next: off };
    }

    function readElement(off, expl, le) {
      if (off + 6 > bytes.length) return null;
      const group = u16(off, le);
      const element = u16(off + 2, le);
      off += 4;
      let vr = '';
      let length = 0;

      if (expl) {
        if (off + 2 > bytes.length) return null;
        vr = String.fromCharCode(bytes[off], bytes[off + 1]);
        if (/^[A-Z]{2}$/.test(vr)) {
          off += 2;
          if (LONG_VR.has(vr)) {
            off += 2;
            if (off + 4 > bytes.length) return null;
            length = u32(off, le);
            off += 4;
          } else {
            if (off + 2 > bytes.length) return null;
            length = u16(off, le);
            off += 2;
          }
        } else {
          off -= 2;
          if (off + 4 > bytes.length) return null;
          length = u32(off, le);
          off += 4;
          expl = false;
        }
      } else {
        if (off + 4 > bytes.length) return null;
        length = u32(off, le);
        off += 4;
      }

      return { group, element, vr, length, valueOff: off, explicit: expl, next: off + (length === 0xFFFFFFFF ? 0 : length) };
    }

    while (offset + 8 < bytes.length) {
      const parsed = readElement(offset, explicit, little);
      if (!parsed) break;

      if (inFileMeta && parsed.group !== 0x0002) {
        inFileMeta = false;
        if (tags.transferSyntax === '1.2.840.10008.1.2') explicit = false;
        if (tags.transferSyntax === '1.2.840.10008.1.2.2') little = false;
        continue;
      }

      explicit = parsed.explicit;
      const { group, element, vr, length, valueOff } = parsed;

      if (length === 0xFFFFFFFF) {
        if (group === 0x7FE0 && element === 0x0010) {
          const cap = readEncapsulatedPixel(valueOff);
          if (cap.bytes && cap.bytes.length >= 2 && cap.bytes[0] === 0xFF && cap.bytes[1] === 0xD8) {
            jpegBytes = cap.bytes;
          } else if (cap.bytes) {
            pixelBytes = cap.bytes;
          }
          break;
        }
        offset = skipUndefinedSeq(valueOff);
        continue;
      }

      if (valueOff + length > bytes.length) break;

      if (group === 0x0002 && element === 0x0010) {
        tags.transferSyntax = ascii(bytes, valueOff, length).replace(/\0/g, '');
      } else if (group === 0x0010 && element === 0x0010) {
        tags.patientName = ascii(bytes, valueOff, length);
      } else if (group === 0x0008 && element === 0x0020) {
        tags.studyDate = ascii(bytes, valueOff, length);
      } else if (group === 0x0008 && element === 0x0060) {
        tags.modality = ascii(bytes, valueOff, length);
      } else if (group === 0x0028) {
        if (element === 0x0010) tags.rows = u16(valueOff, little);
        else if (element === 0x0011) tags.cols = u16(valueOff, little);
        else if (element === 0x0100) tags.bitsAllocated = u16(valueOff, little);
        else if (element === 0x0101) tags.bitsStored = u16(valueOff, little);
        else if (element === 0x0103) tags.pixelRepresentation = u16(valueOff, little);
        else if (element === 0x0002) tags.samplesPerPixel = u16(valueOff, little);
        else if (element === 0x0006) tags.planarConfig = u16(valueOff, little);
        else if (element === 0x0004) tags.photometric = ascii(bytes, valueOff, length);
      } else if (group === 0x7FE0 && element === 0x0010) {
        const slice = bytes.subarray(valueOff, valueOff + length);
        if (slice.length >= 2 && slice[0] === 0xFF && slice[1] === 0xD8) jpegBytes = slice;
        else pixelBytes = slice;
        break;
      }

      offset = valueOff + length;
      if (offset % 2 !== 0) offset++;
    }

    if (jpegBytes) {
      return { jpegBytes, width: tags.cols, height: tags.rows, meta: tags };
    }

    if (!pixelBytes || !tags.rows || !tags.cols) {
      return { error: `Could not read DICOM pixels (rows=${tags.rows} cols=${tags.cols})` };
    }

    const rgba = renderRgba(pixelBytes, tags);
    if (!rgba) return { error: 'Unsupported DICOM pixel format' };
    return { rgba, width: tags.cols, height: tags.rows, meta: tags };
  }

  function renderRgba(px, tags) {
    const w = tags.cols;
    const h = tags.rows;
    const n = w * h;
    const bits = tags.bitsAllocated || 8;
    const spp = tags.samplesPerPixel || 1;
    const isSigned = tags.pixelRepresentation === 1;
    const photo = (tags.photometric || 'MONOCHROME2').toUpperCase();
    const isRgb = photo.includes('RGB') || spp === 3;
    const rgba = new Uint8ClampedArray(n * 4);

    if (isRgb && bits <= 8) {
      if (tags.planarConfig === 1) {
        for (let i = 0; i < n; i++) {
          rgba[i * 4]     = px[i];
          rgba[i * 4 + 1] = px[n + i];
          rgba[i * 4 + 2] = px[n * 2 + i];
          rgba[i * 4 + 3] = 255;
        }
      } else {
        for (let i = 0; i < n; i++) {
          rgba[i * 4]     = px[i * 3];
          rgba[i * 4 + 1] = px[i * 3 + 1];
          rgba[i * 4 + 2] = px[i * 3 + 2];
          rgba[i * 4 + 3] = 255;
        }
      }
      return rgba;
    }

    if (px.length < n) return null;

    let minVal = Infinity;
    let maxVal = -Infinity;
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let val;
      if (bits <= 8) {
        val = px[i];
        if (isSigned && val > 127) val -= 256;
      } else {
        const lo = px[i * 2];
        const hi = px[i * 2 + 1];
        const u = lo | (hi << 8);
        val = isSigned && u > 32767 ? u - 65536 : u;
      }
      raw[i] = val;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
    const range = maxVal - minVal || 1;
    const invert = photo === 'MONOCHROME1';
    for (let i = 0; i < n; i++) {
      let gray = Math.round(((raw[i] - minVal) / range) * 255);
      if (invert) gray = 255 - gray;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }

  function toJpegDataUrl(jpegBytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < jpegBytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, jpegBytes.subarray(i, i + chunk));
    }
    const b64 = (typeof btoa === 'function')
      ? btoa(binary)
      : Buffer.from(jpegBytes).toString('base64');
    return `data:image/jpeg;base64,${b64}`;
  }

  function toPngDataUrlFromRgba(rgba, width, height) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function decodeToDisplay(input) {
    const result = decode(input);
    if (result.error) return result;
    const meta = {
      patientName: result.meta.patientName,
      studyDate: result.meta.studyDate,
      modality: result.meta.modality,
      rows: result.height,
      cols: result.width,
    };
    if (result.jpegBytes) {
      return { dataUrl: toJpegDataUrl(result.jpegBytes), meta };
    }
    const dataUrl = toPngDataUrlFromRgba(result.rgba, result.width, result.height);
    if (!dataUrl) return { ...result, meta };
    return { dataUrl, meta };
  }

  return { decode, decodeToDisplay };
});
