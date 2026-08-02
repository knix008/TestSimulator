import { captureViewportPng } from './viewportCapture';

export type ImageExportFormat =
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'avif'
  | 'gif'
  | 'tiff'
  | 'tif'
  | 'ico'
  | 'bmp';

export const IMAGE_EXPORT_FORMATS: {
  id: ImageExportFormat;
  label: string;
  ext: string;
  supportsAlpha: boolean;
  lossy?: boolean;
}[] = [
  { id: 'png', label: 'PNG', ext: 'png', supportsAlpha: true },
  { id: 'jpg', label: 'JPG', ext: 'jpg', supportsAlpha: false, lossy: true },
  { id: 'jpeg', label: 'JPEG', ext: 'jpeg', supportsAlpha: false, lossy: true },
  { id: 'webp', label: 'WEBP', ext: 'webp', supportsAlpha: true, lossy: true },
  { id: 'avif', label: 'AVIF', ext: 'avif', supportsAlpha: true, lossy: true },
  { id: 'gif', label: 'GIF', ext: 'gif', supportsAlpha: true },
  { id: 'tiff', label: 'TIFF', ext: 'tiff', supportsAlpha: true },
  { id: 'ico', label: 'ICO', ext: 'ico', supportsAlpha: true },
  { id: 'bmp', label: 'BMP', ext: 'bmp', supportsAlpha: false },
];

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function canvasFromPngBlob(png: Blob, flattenColor?: string): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  if (flattenColor) {
    ctx.fillStyle = flattenColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to encode ${type}`))),
      type,
      quality
    );
  });
}

async function supportsMime(type: string): Promise<boolean> {
  if (type === 'image/png' || type === 'image/jpeg') return true;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 2, 2);
  try {
    const blob = await canvasToBlob(canvas, type, 0.85);
    return blob.size > 0 && (blob.type === type || blob.type === '' || type.startsWith('image/'));
  } catch {
    return false;
  }
}

function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const headerSize = 54;
  const buffer = new ArrayBuffer(headerSize + pixelSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint16(0, 0x4d42, true);
  view.setUint32(2, headerSize + pixelSize, true);
  view.setUint32(10, headerSize, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);

  let offset = headerSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      bytes[offset++] = img.data[i + 2];
      bytes[offset++] = img.data[i + 1];
      bytes[offset++] = img.data[i];
    }
    offset += rowSize - width * 3;
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

async function encodeIcoFromPng(png: Blob): Promise<Blob> {
  const pngBytes = new Uint8Array(await png.arrayBuffer());
  const headerSize = 6;
  const entrySize = 16;
  const buffer = new ArrayBuffer(headerSize + entrySize + pngBytes.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  bytes[6] = 0;
  bytes[7] = 0;
  bytes[8] = 0;
  bytes[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, headerSize + entrySize, true);
  bytes.set(pngBytes, headerSize + entrySize);
  return new Blob([buffer], { type: 'image/x-icon' });
}

function encodeTiff(canvas: HTMLCanvasElement, keepAlpha: boolean): Blob {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const spp = keepAlpha ? 4 : 3;
  const pixels = new Uint8Array(width * height * spp);

  for (let i = 0, p = 0; i < img.data.length; i += 4) {
    if (keepAlpha) {
      pixels[p++] = img.data[i];
      pixels[p++] = img.data[i + 1];
      pixels[p++] = img.data[i + 2];
      pixels[p++] = img.data[i + 3];
    } else {
      const a = img.data[i + 3] / 255;
      pixels[p++] = Math.round(img.data[i] * a + 255 * (1 - a));
      pixels[p++] = Math.round(img.data[i + 1] * a + 255 * (1 - a));
      pixels[p++] = Math.round(img.data[i + 2] * a + 255 * (1 - a));
    }
  }

  const bits = new Uint16Array(spp);
  bits.fill(8);
  const ifdCount = 10;
  const ifdSize = 2 + ifdCount * 12 + 4;
  const bitsOffset = 8 + ifdSize;
  const stripOffset = bitsOffset + spp * 2;
  const buffer = new ArrayBuffer(stripOffset + pixels.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  let o = 8;
  view.setUint16(o, ifdCount, true);
  o += 2;

  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(o, tag, true);
    view.setUint16(o + 2, type, true);
    view.setUint32(o + 4, count, true);
    view.setUint32(o + 8, value, true);
    o += 12;
  };

  entry(256, 3, 1, width);
  entry(257, 3, 1, height);
  entry(258, 3, spp, bitsOffset);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 2);
  entry(273, 4, 1, stripOffset);
  entry(277, 3, 1, spp);
  entry(278, 3, 1, height);
  entry(279, 4, 1, pixels.length);
  entry(284, 3, 1, 1);
  view.setUint32(o, 0, true);

  for (let i = 0; i < spp; i++) view.setUint16(bitsOffset + i * 2, 8, true);
  bytes.set(pixels, stripOffset);
  return new Blob([buffer], { type: 'image/tiff' });
}

/** NeuQuant-free GIF89a with 256-color cube + optional transparency. */
function encodeGif(canvas: HTMLCanvasElement, keepAlpha: boolean): Blob {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);

  const palette: number[] = [];
  const colorMap = new Map<number, number>();
  const indexes = new Uint8Array(width * height);
  let transparentIndex = -1;

  const keyOf = (r: number, g: number, b: number) =>
    ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);

  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    if (keepAlpha && img.data[i + 3] < 128) {
      if (transparentIndex < 0) {
        transparentIndex = 0;
        palette.push(0, 0, 0);
        colorMap.set(-1, 0);
      }
      indexes[p] = transparentIndex;
      continue;
    }
    const key = keyOf(img.data[i], img.data[i + 1], img.data[i + 2]);
    let idx = colorMap.get(key);
    if (idx === undefined) {
      if (palette.length / 3 >= 255) {
        idx = transparentIndex >= 0 ? 1 : 0;
      } else {
        idx = palette.length / 3;
        colorMap.set(key, idx);
        palette.push(img.data[i], img.data[i + 1], img.data[i + 2]);
      }
    }
    indexes[p] = idx!;
  }

  let gctSize = 1;
  while (1 << gctSize < Math.max(2, palette.length / 3)) gctSize++;
  const gctCount = 1 << gctSize;
  while (palette.length / 3 < gctCount) palette.push(0, 0, 0);

  const out: number[] = [];
  const u16 = (n: number) => {
    out.push(n & 0xff, (n >> 8) & 0xff);
  };

  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  u16(width);
  u16(height);
  out.push(0x80 | (gctSize - 1), 0x00, 0x00);
  out.push(...palette);

  if (transparentIndex >= 0) {
    out.push(0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, transparentIndex & 0xff, 0x00);
  }

  out.push(0x2c);
  u16(0);
  u16(0);
  u16(width);
  u16(height);
  out.push(0x00);

  const minCodeSize = Math.max(2, gctSize);
  out.push(minCodeSize);

  // Pack as "clear + symbol" stream (valid GIF LZW with frequent clears)
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const codeSize = minCodeSize + 1;
  const bits: number[] = [];
  let bitLen = 0;
  const put = (code: number, size: number) => {
    for (let i = 0; i < size; i++) {
      const byteIndex = bitLen >> 3;
      bits[byteIndex] = bits[byteIndex] || 0;
      if ((code >> i) & 1) bits[byteIndex] |= 1 << (bitLen & 7);
      bitLen++;
    }
  };

  put(clear, codeSize);
  for (let i = 0; i < indexes.length; i++) {
    put(indexes[i], codeSize);
    if ((i + 1) % 64 === 0) put(clear, codeSize);
  }
  put(eoi, codeSize);

  const stream = new Uint8Array(Math.ceil(bitLen / 8));
  for (let i = 0; i < stream.length; i++) stream[i] = bits[i] || 0;
  for (let i = 0; i < stream.length; i += 255) {
    const end = Math.min(i + 255, stream.length);
    out.push(end - i);
    for (let j = i; j < end; j++) out.push(stream[j]);
  }
  out.push(0x00, 0x3b);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

async function encodeInBrowser(
  png: Blob,
  format: ImageExportFormat,
  quality: number,
  includeBackground: boolean
): Promise<{ blob: Blob; ext: string }> {
  const norm = format === 'jpeg' ? 'jpg' : format === 'tif' ? 'tiff' : format;
  const q = Math.min(1, Math.max(0.05, quality / 100));

  if (norm === 'png') return { blob: png, ext: 'png' };
  if (norm === 'ico') return { blob: await encodeIcoFromPng(png), ext: 'ico' };

  const needsFlatten = !includeBackground && (norm === 'jpg' || norm === 'bmp');
  const canvas = await canvasFromPngBlob(png, needsFlatten ? '#ffffff' : undefined);

  if (norm === 'bmp') return { blob: encodeBmp(canvas), ext: 'bmp' };
  if (norm === 'gif') return { blob: encodeGif(canvas, !includeBackground), ext: 'gif' };
  if (norm === 'tiff') return { blob: encodeTiff(canvas, !includeBackground), ext: 'tiff' };

  const mime = MIME[norm];
  if (mime && (await supportsMime(mime))) {
    try {
      const blob = await canvasToBlob(canvas, mime, q);
      return { blob, ext: norm === 'jpg' ? 'jpg' : norm };
    } catch {
      /* fall through */
    }
  }

  // Browser cannot encode this format — keep PNG bytes with .png name
  return { blob: png, ext: 'png' };
}

export async function exportViewportImage(options: {
  format: ImageExportFormat;
  includeBackground: boolean;
  backgroundColor: string;
  quality: number;
  fileBaseName: string;
}): Promise<{ canceled?: boolean; filePath?: string; method: 'electron' | 'browser'; warning?: string }> {
  const png = await captureViewportPng({
    includeBackground: options.includeBackground,
    backgroundColor: options.backgroundColor,
  });

  const meta = IMAGE_EXPORT_FORMATS.find((f) => f.id === options.format) || IMAGE_EXPORT_FORMATS[0];
  const filename = `${options.fileBaseName || 'viewport'}.${meta.ext}`;

  if (window.electronAPI?.exportImage) {
    const pngBase64 = await blobToBase64(png);
    const result = await window.electronAPI.exportImage({
      pngBase64,
      format: meta.ext,
      fileName: filename,
      quality: options.quality,
      includeBackground: options.includeBackground,
      backgroundColor: options.backgroundColor,
    });
    return { ...result, method: 'electron' };
  }

  const { blob, ext } = await encodeInBrowser(
    png,
    options.format,
    options.quality,
    options.includeBackground
  );
  const outName = `${options.fileBaseName || 'viewport'}.${ext}`;
  downloadBlob(blob, outName);

  const warning =
    ext !== meta.ext
      ? `This browser cannot encode ${meta.label}; saved as PNG instead.`
      : undefined;

  return { method: 'browser', warning };
}
