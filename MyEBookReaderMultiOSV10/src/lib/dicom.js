// DICOM (.dcm) reader — enough of it to show the picture.
//
// A DICOM file is a list of tagged elements: the metadata (patient, study,
// modality) and, at the end, the pixels. This parses the elements, reads the
// image description (size, bit depth, colour meaning, window level) and turns
// the pixels into RGBA.
//
// Uncompressed transfer syntaxes are decoded here. For the encapsulated ones
// the frame is handed back as a JPEG the browser can decode itself; anything
// else (JPEG 2000, RLE) is reported rather than guessed at.

const TRANSFER = {
  IMPLICIT_LE: '1.2.840.10008.1.2',
  EXPLICIT_LE: '1.2.840.10008.1.2.1',
  EXPLICIT_BE: '1.2.840.10008.1.2.2',
  JPEG_BASELINE: '1.2.840.10008.1.2.4.50',
  JPEG_EXTENDED: '1.2.840.10008.1.2.4.51',
  JPEG_LOSSLESS_14: '1.2.840.10008.1.2.4.70',
  JPEG_LS: '1.2.840.10008.1.2.4.80',
  JPEG2000_LOSSLESS: '1.2.840.10008.1.2.4.90',
  JPEG2000: '1.2.840.10008.1.2.4.91',
  RLE: '1.2.840.10008.1.2.5',
};

const VR_WITH_LONG_LENGTH = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN']);

export function looksLikeDicom(data, name = '') {
  if (/\.(dcm|dicom)$/i.test(name)) return true;
  if (!data || data.length < 133) return false;
  return data[128] === 0x44 && data[129] === 0x49 && data[130] === 0x43 && data[131] === 0x4d; // "DICM"
}

function tagKey(group, element) {
  return `${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')}`;
}

function decodeString(bytes) {
  return new TextDecoder('latin1').decode(bytes).replace(/\0+$/, '').trim();
}

/**
 * Walks the elements of a DICOM file.
 * @returns {{ elements: Map<string, {vr: string, bytes: Uint8Array}>, transferSyntax: string }}
 */
export function parseDicom(data) {
  if (!data || data.length < 140) throw new Error('This file is too small to be a DICOM image.');
  const hasPreamble = data[128] === 0x44 && data[129] === 0x49 && data[130] === 0x43 && data[131] === 0x4d;
  let at = hasPreamble ? 132 : 0;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const elements = new Map();
  // The file meta group (0002,xxxx) is always explicit little endian; the rest
  // follows whatever transfer syntax it names.
  let explicit = true;
  let little = true;
  let transferSyntax = TRANSFER.EXPLICIT_LE;
  let metaEnd = Infinity;

  while (at + 8 <= data.length) {
    const group = view.getUint16(at, little);
    const element = view.getUint16(at + 2, little);
    let vr = '';
    let length = 0;
    let headerSize = 8;

    if (explicit) {
      vr = decodeString(data.subarray(at + 4, at + 6));
      if (VR_WITH_LONG_LENGTH.has(vr)) {
        length = view.getUint32(at + 8, little);
        headerSize = 12;
      } else {
        length = view.getUint16(at + 6, little);
      }
    } else {
      length = view.getUint32(at + 4, little);
    }

    const start = at + headerSize;
    const key = tagKey(group, element);

    if (key === '7fe0,0010') {
      // Pixel data: undefined length means encapsulated (compressed) frames.
      const rest = length === 0xffffffff ? data.subarray(start) : data.subarray(start, start + length);
      elements.set(key, { vr: vr || 'OW', bytes: rest, encapsulated: length === 0xffffffff });
      break;
    }

    if (length === 0xffffffff) {
      // A sequence of undefined length: skip to its delimiter.
      let scan = start;
      while (scan + 8 <= data.length) {
        if (view.getUint16(scan, little) === 0xfffe && view.getUint16(scan + 2, little) === 0xe0dd) {
          scan += 8;
          break;
        }
        scan += 2;
      }
      at = scan;
      continue;
    }

    if (start + length > data.length) break;
    elements.set(key, { vr, bytes: data.subarray(start, start + length) });
    at = start + length;

    if (key === '0002,0000') {
      // Group length: where the (explicit little endian) meta group ends.
      metaEnd = at + new DataView(data.buffer, data.byteOffset + start, 4).getUint32(0, true);
    }
    if (key === '0002,0010') {
      transferSyntax = decodeString(elements.get(key).bytes);
    }
    if (at >= metaEnd && metaEnd !== Infinity) {
      explicit = transferSyntax !== TRANSFER.IMPLICIT_LE;
      little = transferSyntax !== TRANSFER.EXPLICIT_BE;
      metaEnd = Infinity;
    }
  }

  return { elements, transferSyntax };
}

function numberOf(elements, key, fallback = 0) {
  const element = elements.get(key);
  if (!element || !element.bytes.length) return fallback;
  const { vr, bytes } = element;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (vr === 'US') return view.getUint16(0, true);
  if (vr === 'SS') return view.getInt16(0, true);
  if (vr === 'UL') return view.getUint32(0, true);
  if (vr === 'SL') return view.getInt32(0, true);
  const text = decodeString(bytes).split('\\')[0];
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}

function textOf(elements, key) {
  const element = elements.get(key);
  return element ? decodeString(element.bytes) : '';
}

/** The frames of an encapsulated (compressed) pixel-data element. */
function encapsulatedFrames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = [];
  let at = 0;
  while (at + 8 <= bytes.length) {
    const group = view.getUint16(at, true);
    const element = view.getUint16(at + 2, true);
    const length = view.getUint32(at + 4, true);
    if (group !== 0xfffe) break;
    if (element === 0xe0dd) break;                     // sequence delimiter
    const start = at + 8;
    if (length && start + length <= bytes.length) {
      // The first item is the basic offset table, which we do not need.
      if (frames.length || at !== 0 || length > 64) frames.push(bytes.subarray(start, start + length));
    }
    at = start + (length === 0xffffffff ? 0 : length);
  }
  return frames;
}

/**
 * Decodes a DICOM image.
 * @returns for an uncompressed image `{ kind: 'rgba', width, height, data, meta }`,
 *          for an encapsulated JPEG `{ kind: 'jpeg', bytes, meta }`.
 */
export function decodeDicom(data) {
  const { elements, transferSyntax } = parseDicom(data);

  const width = numberOf(elements, '0028,0011');       // columns
  const height = numberOf(elements, '0028,0010');      // rows
  const meta = {
    patient: textOf(elements, '0010,0010'),
    patientId: textOf(elements, '0010,0020'),
    study: textOf(elements, '0008,1030'),
    series: textOf(elements, '0008,103e'),
    modality: textOf(elements, '0008,0060'),
    date: textOf(elements, '0008,0020'),
    manufacturer: textOf(elements, '0008,0070'),
    institution: textOf(elements, '0008,0080'),
    transferSyntax,
    width,
    height,
  };

  const pixels = elements.get('7fe0,0010');
  if (!pixels) throw new Error('This DICOM file has no image data (it may hold only a report or a structured record).');

  if (pixels.encapsulated) {
    const frames = encapsulatedFrames(pixels.bytes);
    const jpegish = [TRANSFER.JPEG_BASELINE, TRANSFER.JPEG_EXTENDED].includes(transferSyntax);
    if (!frames.length) throw new Error('This DICOM file has no readable image frame.');
    if (!jpegish) {
      throw new Error(`This DICOM image uses transfer syntax ${transferSyntax}, which this reader cannot decode (JPEG 2000, JPEG-LS and RLE are not supported).`);
    }
    return { kind: 'jpeg', bytes: frames[0], meta };
  }

  if (!width || !height) throw new Error('This DICOM file does not say how large its image is.');

  const bitsAllocated = numberOf(elements, '0028,0100', 16);
  const samples = numberOf(elements, '0028,0002', 1);
  const signed = numberOf(elements, '0028,0103', 0) === 1;
  const photometric = textOf(elements, '0028,0004') || 'MONOCHROME2';
  const slope = numberOf(elements, '0028,1053', 1) || 1;
  const intercept = numberOf(elements, '0028,1052', 0);
  let center = numberOf(elements, '0028,1050', 0);
  let windowWidth = numberOf(elements, '0028,1051', 0);

  const raw = pixels.bytes;
  const little = transferSyntax !== TRANSFER.EXPLICIT_BE;
  const count = width * height;
  const out = new Uint8ClampedArray(count * 4);

  if (samples >= 3) {
    // RGB, already display-ready.
    for (let p = 0; p < count; p++) {
      out[p * 4] = raw[p * 3] ?? 0;
      out[p * 4 + 1] = raw[p * 3 + 1] ?? 0;
      out[p * 4 + 2] = raw[p * 3 + 2] ?? 0;
      out[p * 4 + 3] = 255;
    }
    return { kind: 'rgba', width, height, data: out, meta: { ...meta, photometric } };
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const value = (i) => {
    if (bitsAllocated <= 8) return signed ? (raw[i] << 24 >> 24) : raw[i];
    const at = i * 2;
    if (at + 1 >= raw.length) return 0;
    return signed ? view.getInt16(at, little) : view.getUint16(at, little);
  };

  // Without a window in the file, take the range the image actually uses —
  // otherwise a 16-bit scan shows as an almost black rectangle.
  if (!windowWidth) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < count; i++) {
      const v = value(i);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || min === max) { min = 0; max = bitsAllocated <= 8 ? 255 : 4095; }
    center = (min + max) / 2 * slope + intercept;
    windowWidth = Math.max(1, (max - min) * slope);
  }

  const low = center - windowWidth / 2;
  const invert = photometric === 'MONOCHROME1';

  for (let p = 0; p < count; p++) {
    const stored = value(p) * slope + intercept;
    let grey = ((stored - low) / windowWidth) * 255;
    grey = grey < 0 ? 0 : (grey > 255 ? 255 : grey);
    if (invert) grey = 255 - grey;
    out[p * 4] = grey;
    out[p * 4 + 1] = grey;
    out[p * 4 + 2] = grey;
    out[p * 4 + 3] = 255;
  }

  return {
    kind: 'rgba',
    width,
    height,
    data: out,
    meta: { ...meta, photometric, bitsAllocated, windowCenter: center, windowWidth },
  };
}

export { TRANSFER };
