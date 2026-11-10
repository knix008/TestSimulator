// Decoding the pictures users import as material textures and environments.
// Browser pictures (PNG, JPEG, WebP, AVIF, GIF, BMP) go through <img>; TGA,
// TIFF, DDS, EXR and HDR through three.js loaders' parse() (pure, also in
// Node: unit tests); KTX2 needs the renderer and the Basis transcoder
// (io/ktx2.js, bundled — works offline).
import * as THREE from 'three';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { TIFFLoader } from 'three/examples/jsm/loaders/TIFFLoader.js';
import { DDSLoader } from 'three/examples/jsm/loaders/DDSLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { textureFormatOf, textureMime } from './texformats.js';

const arrayBufferOf = (bytes) => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
};

const failed = (name, why) => Object.assign(new Error(`${name}: ${why}`), { code: 'texture-unreadable' });

/**
 * Raw texture data of a TGA / TIFF / DDS / EXR / HDR file, as the three loaders give it:
 * { decoder, width, height, data, format?, type?, flipY?, mipmaps? (DDS) }. Throws for other kinds.
 */
export function parseTextureData(name, bytes) {
  const format = textureFormatOf(name);
  if (!format) throw failed(name, 'not a texture format');
  const buffer = arrayBufferOf(bytes);
  let data;
  try {
    switch (format.decoder) {
      case 'tga': data = new TGALoader().parse(buffer); break;
      case 'tiff': data = new TIFFLoader().parse(buffer); break;
      case 'exr': data = new EXRLoader().parse(buffer); break;
      case 'hdr': data = new HDRLoader().parse(buffer); break;
      case 'dds': data = new DDSLoader().parse(buffer, true); break;
      default: throw failed(name, `${format.decoder} pictures are decoded by the browser`);
    }
  } catch (error) {
    if (error.code === 'texture-unreadable') throw error;
    throw failed(name, error?.message ?? String(error));
  }
  if (!data || !(data.width > 0) || !(data.height > 0)) throw failed(name, 'no picture data');
  if (format.decoder === 'dds' && data.isCubemap) throw failed(name, 'cube maps are not supported');
  return { decoder: format.decoder, ...data };
}

/** texData (DataTextureLoader shape) → DataTexture, as DataTextureLoader.load would make it. */
function dataTexture(texData) {
  const texture = new THREE.DataTexture(texData.data, texData.width, texData.height, texData.format ?? THREE.RGBAFormat, texData.type ?? THREE.UnsignedByteType);
  texture.flipY = texData.flipY ?? false;
  texture.generateMipmaps = texData.generateMipmaps ?? true;
  texture.minFilter = texData.minFilter ?? THREE.LinearMipmapLinearFilter;
  texture.magFilter = texData.magFilter ?? THREE.LinearFilter;
  if (texData.colorSpace) texture.colorSpace = texData.colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function compressedTexture(texData) {
  const texture = new THREE.CompressedTexture(texData.mipmaps, texData.width, texData.height, texData.format);
  texture.minFilter = texData.mipmapCount === 1 ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Bytes → a decoded <img> (browser only). */
export function decodeImageElement(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: textureMime(name) }));
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image.decode().then(() => image, () => { throw failed(name, 'the picture could not be decoded'); }).finally(() => URL.revokeObjectURL(url));
}

/**
 * Bytes of any texture format → THREE.Texture (not yet tiled; colour space unset — the material slot decides).
 * userData: { hdr, compressed, width, height }. `renderer` is needed for KTX2 (supported GPU formats).
 */
export async function decodeTexture(name, bytes, { renderer = null } = {}) {
  const format = textureFormatOf(name);
  if (!format) throw failed(name, 'not a texture format');
  let texture;
  if (format.decoder === 'image') {
    const image = await decodeImageElement(name, bytes);
    texture = new THREE.Texture(image);
    texture.needsUpdate = true;
  } else if (format.decoder === 'ktx2') {
    const { decodeKtx2 } = await import('./ktx2.js');
    // A copy: the Basis transcoder worker takes the buffer over (the project keeps its bytes).
    texture = await decodeKtx2(new Uint8Array(bytes).slice().buffer, renderer);
  } else {
    const texData = parseTextureData(name, bytes);
    texture = format.decoder === 'dds' ? compressedTexture(texData) : dataTexture(texData);
  }
  texture.name = name;
  texture.userData = { ...texture.userData, hdr: Boolean(format.hdr), compressed: Boolean(format.compressed), width: texture.image?.width ?? 0, height: texture.image?.height ?? 0, format: format.id };
  return texture;
}

/** sRGB 0..255 → linear light. */
const LINEAR = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

/** 8-bit sRGB RGBA pixels → linear half-float RGBA (Uint16Array), for an equirect environment made from a picture. */
export function ldrToLinearHalf(rgba) {
  const out = new Uint16Array(rgba.length);
  const half = new Uint16Array(256).map((_, i) => THREE.DataUtils.toHalfFloat(LINEAR[i]));
  const one = THREE.DataUtils.toHalfFloat(1);
  for (let i = 0; i < rgba.length; i += 4) { out[i] = half[rgba[i]]; out[i + 1] = half[rgba[i + 1]]; out[i + 2] = half[rgba[i + 2]]; out[i + 3] = one; }
  return out;
}

/**
 * Equirectangular data → environment texture (linear, equirect mapping). `flipY` as the loaders give it:
 * true = the first row is the top (HDRLoader, pictures), false = the first row is the bottom (EXRLoader).
 */
export function environmentTexture({ data, width, height, type = THREE.HalfFloatType, flipY = true }) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, type);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = flipY;
  texture.needsUpdate = true;
  return texture;
}

/** .hdr / .exr bytes → environment texture (pure: Node tests). */
export function hdrEnvironment(name, bytes) {
  const texData = parseTextureData(name, bytes);
  if (texData.decoder !== 'hdr' && texData.decoder !== 'exr') throw failed(name, 'not an HDR picture');
  if ((texData.format ?? THREE.RGBAFormat) !== THREE.RGBAFormat) throw failed(name, 'only RGB(A) panoramas can light the scene');
  return environmentTexture({ ...texData, flipY: texData.flipY ?? false });
}

/** Largest panorama width kept for a picture environment (PMREM and the path tracer's light map). */
export const MAX_ENVIRONMENT_WIDTH = 4096;

/**
 * Environment (sky) bytes → { texture (equirect DataTexture, linear), width, height, aspect }.
 * .hdr/.exr are used as they are; a picture (JPEG, PNG …) is read as an equirectangular panorama,
 * converted to linear half floats (the path tracer needs data it can sample).
 */
export async function decodeEnvironment(name, bytes, { maxWidth = MAX_ENVIRONMENT_WIDTH } = {}) {
  const format = textureFormatOf(name);
  if (format?.hdr) { const texture = hdrEnvironment(name, bytes); return { texture, width: texture.image.width, height: texture.image.height }; }
  if (format?.decoder !== 'image') throw failed(name, 'not an environment picture');
  const image = await decodeImageElement(name, bytes);
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const texture = environmentTexture({ data: ldrToLinearHalf(rgba), width, height, flipY: true });
  return { texture, width, height };
}

/** Linear float → 0..255 for previews (Reinhard, then sRGB). */
const previewByte = (v) => Math.round(255 * Math.min(1, Math.max(0, (v / (1 + v)) ** (1 / 2.2))));

/**
 * A small preview (data URL) of a decoded texture: pictures, TGA/TIFF and HDR data. Compressed textures
 * (DDS, KTX2) have no CPU pixels: null.
 */
export function texturePreview(texture, size = 96) {
  const image = texture?.image;
  if (!image || texture.isCompressedTexture || !image.width) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, size / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!image.data) { ctx.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/png'); }
  const { width, height, data } = image;
  const out = ctx.createImageData(canvas.width, canvas.height);
  const half = texture.type === THREE.HalfFloatType;
  const float = half || texture.type === THREE.FloatType;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const sy = Math.min(height - 1, Math.floor(y / scale));
      const row = texture.flipY ? sy : height - 1 - sy; // flipY: the first row is the top
      const i = (row * width + Math.min(width - 1, Math.floor(x / scale))) * 4;
      const o = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c];
        out.data[o + c] = float ? previewByte(half ? THREE.DataUtils.fromHalfFloat(v) : v) : v;
      }
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}
