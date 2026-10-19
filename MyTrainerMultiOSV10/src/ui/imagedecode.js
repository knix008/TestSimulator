// Picture files of every common format → something a canvas can draw. The browser decodes PNG,
// JPEG, GIF, WebP, BMP, AVIF, ICO and SVG itself; TIFF (utif) and TGA are decoded here.
import * as UTIF from 'utif';

/** Every extension the picture inputs accept (folders, "Run on files", the image folder import). */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'gif', 'webp', 'bmp', 'dib', 'avif', 'ico', 'cur', 'svg', 'tif', 'tiff', 'tga'];
export const IMAGE_ACCEPT = `image/*,${IMAGE_EXTENSIONS.map((e) => `.${e}`).join(',')}`;
export const isImageName = (name) => new RegExp(`\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i').test(String(name ?? ''));

const extension = (name) => String(name ?? '').toLowerCase().split('.').pop();

function fromRgba(rgba, width, height) {
  return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, width * height * 4), width, height));
}

function decodeTiff(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error('TIFF: no image');
  UTIF.decodeImage(buffer, ifds[0]);
  return fromRgba(UTIF.toRGBA8(ifds[0]), ifds[0].width, ifds[0].height);
}

/** TGA: true colour / grey / colour-mapped, uncompressed or RLE. */
function decodeTga(bytes) {
  const d = new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength);
  const idLength = d[0]; const mapType = d[1]; const type = d[2];
  const mapStart = d[3] | (d[4] << 8); const mapLength = d[5] | (d[6] << 8); const mapBits = d[7];
  const width = d[12] | (d[13] << 8); const height = d[14] | (d[15] << 8);
  const bits = d[16]; const descriptor = d[17];
  if (![1, 2, 3, 9, 10, 11].includes(type) || !width || !height) throw new Error('TGA: unsupported');
  let at = 18 + idLength;
  const mapBytes = Math.ceil(mapBits / 8);
  const palette = mapType ? d.subarray(at, at + mapLength * mapBytes) : null;
  at += mapType ? mapLength * mapBytes : 0;
  const pixelBytes = Math.ceil(bits / 8);
  const count = width * height;
  // Unpack (RLE or not) into raw pixel bytes.
  let raw = d.subarray(at, at + count * pixelBytes);
  if (type >= 9) {
    raw = new Uint8Array(count * pixelBytes);
    let out = 0;
    while (out < raw.length && at < d.length) {
      const header = d[at++];
      const n = (header & 0x7f) + 1;
      if (header & 0x80) { const px = d.subarray(at, at + pixelBytes); at += pixelBytes; for (let i = 0; i < n; i++) { raw.set(px, out); out += pixelBytes; } }
      else { raw.set(d.subarray(at, at + n * pixelBytes), out); at += n * pixelBytes; out += n * pixelBytes; }
    }
  }
  const rgba = new Uint8ClampedArray(count * 4);
  const colour = (src, o, size, target) => {
    if (size === 1) { target[0] = target[1] = target[2] = src[o]; target[3] = 255; }
    else if (size === 2) { const v = src[o] | (src[o + 1] << 8); target[0] = ((v >> 10) & 31) * 8.226; target[1] = ((v >> 5) & 31) * 8.226; target[2] = (v & 31) * 8.226; target[3] = 255; }
    else { target[0] = src[o + 2]; target[1] = src[o + 1]; target[2] = src[o]; target[3] = size === 4 ? src[o + 3] : 255; }
  };
  const px = [0, 0, 0, 255];
  const fromTop = (descriptor & 0x20) !== 0;
  for (let i = 0; i < count; i++) {
    const kind = type & 7;
    if (kind === 1 && palette) colour(palette, ((raw[i * pixelBytes] | (pixelBytes > 1 ? raw[i * pixelBytes + 1] << 8 : 0)) - mapStart) * mapBytes, mapBytes, px);
    else colour(raw, i * pixelBytes, kind === 3 ? 1 : pixelBytes, px);
    const x = i % width; const y = Math.floor(i / width);
    const o = ((fromTop ? y : height - 1 - y) * width + x) * 4;
    rgba[o] = px[0]; rgba[o + 1] = px[1]; rgba[o + 2] = px[2]; rgba[o + 3] = px[3];
  }
  return createImageBitmap(new ImageData(rgba, width, height));
}

/** A picture file's bytes → ImageBitmap (any supported format). */
export async function decodePicture(bytes, name = '') {
  const ext = extension(name);
  if (ext === 'tif' || ext === 'tiff') return decodeTiff(bytes);
  if (ext === 'tga') return decodeTga(bytes);
  try {
    return await createImageBitmap(new Blob([bytes], ext === 'svg' ? { type: 'image/svg+xml' } : {}));
  } catch (error) {
    // Unknown extension or a misnamed file: try the formats decoded here.
    const head = new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer, bytes.byteOffset ?? 0, Math.min(4, bytes.byteLength));
    if ((head[0] === 0x49 && head[1] === 0x49) || (head[0] === 0x4d && head[1] === 0x4d)) return decodeTiff(bytes);
    if (ext === 'svg' || /<svg/i.test(new TextDecoder().decode(new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer).subarray(0, 512)))) {
      // An SVG without a size: draw it through an <img>.
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return await createImageBitmap(img, { resizeWidth: img.naturalWidth || 512, resizeHeight: img.naturalHeight || 512 });
      } finally { URL.revokeObjectURL(url); }
    }
    throw error;
  }
}
