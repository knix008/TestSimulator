import { MAX_IMAGE_BYTES } from './formats.js';
import { decodeHdr, decodePnm, decodeQoi, decodeTga, detectFormat } from './raster.js';

const DIRECT = new Set(['heif', 'tiff', 'jxl', 'qoi', 'tga', 'hdr', 'pnm', 'svg']);

export async function loadBitmap(file) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('파일이 너무 큽니다.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
  const format = detectFormat(bytes, extension);
  if (format && DIRECT.has(format)) return decodeKnown(bytes, format);
  if (format === 'avif' || format === 'heif') {
    try {
      return await createImageBitmap(new Blob([bytes], { type: 'image/avif' }), { imageOrientation: 'from-image' });
    } catch {
      if (format === 'heif' || format === 'avif') return decodeKnown(bytes, 'heif');
    }
  }
  try {
    return await createImageBitmap(new Blob([bytes], { type: file.type || undefined }), { imageOrientation: 'from-image' });
  } catch (error) {
    if (format) return decodeKnown(bytes, format);
    throw error;
  }
}

async function decodeKnown(bytes, format) {
  if (format === 'heif' || format === 'avif') return bitmapFromRgba(await decodeHeif(bytes));
  if (format === 'tiff') return bitmapFromRgba(await decodeTiff(bytes));
  if (format === 'jxl') return decodeJxl(bytes);
  if (format === 'svg') return decodeSvg(bytes);
  if (format === 'qoi') return bitmapFromRgba(decodeQoi(bytes));
  if (format === 'tga') return bitmapFromRgba(decodeTga(bytes));
  if (format === 'hdr') return bitmapFromRgba(decodeHdr(bytes));
  if (format === 'pnm') return bitmapFromRgba(decodePnm(bytes));
  throw new Error('이미지를 읽지 못했습니다.');
}

async function bitmapFromRgba(image) {
  const rgba = image.rgba instanceof Uint8ClampedArray ? image.rgba : new Uint8ClampedArray(image.rgba);
  return createImageBitmap(new ImageData(rgba, image.width, image.height));
}

async function decodeHeif(bytes) {
  const imported = await import('libheif-js/wasm-bundle.js');
  const libheif = imported.default ?? imported;
  await libheif.ready;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  try {
    const image = images?.[0];
    const width = image?.get_width?.() || 0;
    const height = image?.get_height?.() || 0;
    if (!width || !height) throw new Error('HEIF 이미지를 읽지 못했습니다.');
    const rgba = new Uint8ClampedArray(width * height * 4);
    const displayed = await new Promise((resolve, reject) => {
      image.display({ data: rgba, width, height }, (result) => {
        if (!result) reject(new Error('HEIF 이미지를 읽지 못했습니다.'));
        else resolve(result);
      });
    });
    return { width, height, rgba: displayed.data };
  } finally {
    for (const image of images || []) image.free();
    decoder.decoder?.delete?.();
  }
}

async function decodeTiff(bytes) {
  const imported = await import('utif');
  const utif = imported.default ?? imported;
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const pages = utif.decode(buffer);
  const page = pages[0];
  if (!page) throw new Error('TIFF를 읽지 못했습니다.');
  utif.decodeImage(buffer, page);
  const width = page.width || 0;
  const height = page.height || 0;
  if (!width || !height) throw new Error('TIFF를 읽지 못했습니다.');
  return { width, height, rgba: utif.toRGBA8(page) };
}

let jxlModule;
async function decodeJxl(bytes) {
  if (!jxlModule) {
    jxlModule = Promise.all([
      import('jxl-oxide-wasm'),
      import('jxl-oxide-wasm/module.wasm?url'),
    ]).then(async ([imported, wasm]) => {
      await imported.default(wasm.default);
      return imported;
    });
  }
  const { JxlImage } = await jxlModule;
  const image = new JxlImage();
  try {
    image.feedBytes(bytes);
    if (!image.tryInit()) throw new Error('JPEG XL을 읽지 못했습니다.');
    const rendered = image.render(0);
    try {
      const png = rendered.encodeToPng().slice();
      return await createImageBitmap(new Blob([png], { type: 'image/png' }));
    } finally {
      rendered.free();
    }
  } finally {
    image.free();
  }
}

async function decodeSvg(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || 1;
    const height = image.naturalHeight || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
