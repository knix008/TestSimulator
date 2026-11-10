// Picture formats the app reads as material textures and as environments (sky /
// image-based lighting). Pure table and name tests, no three.js: the import
// routing (io/routing.js), the file dialogs and the user's guide read it, the
// decoding is in io/textures.js.

/**
 * `decoder`: 'image' = the browser decodes it (<img>), otherwise a three.js loader of that name.
 * `compressed`: GPU block-compressed (DDS, KTX2) — used as is, no preview picture.
 * `hdr`: floating-point data (linear light), the natural choice for environments.
 */
export const TEXTURE_FORMATS = [
  { id: 'png', label: 'PNG', ext: ['png'], decoder: 'image', mime: 'image/png' },
  { id: 'jpeg', label: 'JPEG', ext: ['jpg', 'jpeg'], decoder: 'image', mime: 'image/jpeg' },
  { id: 'webp', label: 'WebP', ext: ['webp'], decoder: 'image', mime: 'image/webp' },
  { id: 'avif', label: 'AVIF', ext: ['avif'], decoder: 'image', mime: 'image/avif' },
  { id: 'gif', label: 'GIF', ext: ['gif'], decoder: 'image', mime: 'image/gif' },
  { id: 'bmp', label: 'BMP', ext: ['bmp'], decoder: 'image', mime: 'image/bmp' },
  { id: 'tga', label: 'TGA (Targa)', ext: ['tga'], decoder: 'tga', mime: 'image/x-tga' },
  { id: 'tiff', label: 'TIFF', ext: ['tif', 'tiff'], decoder: 'tiff', mime: 'image/tiff' },
  { id: 'dds', label: 'DDS (DirectDraw Surface)', ext: ['dds'], decoder: 'dds', mime: 'image/vnd-ms.dds', compressed: true },
  { id: 'ktx2', label: 'KTX2 (Basis Universal)', ext: ['ktx2'], decoder: 'ktx2', mime: 'image/ktx2', compressed: true },
  { id: 'exr', label: 'OpenEXR', ext: ['exr'], decoder: 'exr', mime: 'image/x-exr', hdr: true },
  { id: 'hdr', label: 'Radiance HDR', ext: ['hdr'], decoder: 'hdr', mime: 'image/vnd.radiance', hdr: true },
];

/** Environments: HDR panoramas, or an ordinary picture in equirectangular (2:1) projection. */
export const ENVIRONMENT_FORMATS = ['hdr', 'exr', 'png', 'jpeg', 'webp', 'avif'].map((id) => TEXTURE_FORMATS.find((f) => f.id === id));

const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name ?? '')); return m ? m[1].toLowerCase() : ''; };

export const textureFormatOf = (name) => TEXTURE_FORMATS.find((f) => f.ext.includes(extOf(name))) ?? null;
export const environmentFormatOf = (name) => ENVIRONMENT_FORMATS.find((f) => f.ext.includes(extOf(name))) ?? null;
export const isTextureName = (name) => Boolean(textureFormatOf(name));
export const isEnvironmentName = (name) => Boolean(environmentFormatOf(name));
/** HDR data (.hdr, .exr): an environment first of all (it can still be a texture). */
export const isHdrName = (name) => Boolean(textureFormatOf(name)?.hdr);

export const TEXTURE_EXTENSIONS = TEXTURE_FORMATS.flatMap((f) => f.ext);
export const ENVIRONMENT_EXTENSIONS = ENVIRONMENT_FORMATS.flatMap((f) => f.ext);

/** MIME type for a texture file name (for Blob / <img> decoding). */
export const textureMime = (name) => textureFormatOf(name)?.mime ?? 'application/octet-stream';

/**
 * Map slot a texture file is for, from the usual suffixes of texture sets (Poly Haven, ambientCG,
 * Substance exports): 'normal' | 'roughness' | 'color'.
 */
export function textureSlotOf(name) {
  const stem = String(name ?? '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').toLowerCase();
  if (/[_\-. ](nor|nrm|norm|normal|normalgl|normal_?gl|normal_?dx|nor_?gl|nor_?dx)([_\-. ]|$)/.test(stem)) return 'normal';
  if (/[_\-. ](rough|roughness|rgh)([_\-. ]|$)/.test(stem)) return 'roughness';
  return 'color';
}

/** The set a texture file belongs to: its name without the slot word and the resolution tag (brick_nor_gl_1k → brick). */
export const textureSetKey = (name) => setStem(name).toLowerCase();
const setStem = (name) => String(name ?? '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  // Longest words first: brick_nor_gl loses "_nor_gl", not just "_nor".
  .replace(/([_\-. ])(normal_?gl|normal_?dx|normalgl|nor_?gl|nor_?dx|normal|norm|nor|nrm|roughness|rough|rgh|diffuse|diff|albedo|base_?color|basecolor|colour|color|col)(?=[_\-. ]|$)/gi, '')
  .replace(/([_\-. ])\d+k(?=[_\-. ]|$)/gi, '')
  .replace(/[_\-. ]+$/, '');

/**
 * Texture files → material sets: [{ key, name, color, normal, roughness }] (each a file name or null).
 * Files of one set (brick_diff.png + brick_nor_gl.png + brick_rough.png) make one material; a set
 * without a colour map uses its first map as colour.
 */
export function groupTextureSets(names) {
  const sets = new Map();
  for (const name of names) {
    const key = textureSetKey(name) || String(name);
    let set = sets.get(key);
    if (!set) sets.set(key, set = { key, name: null, color: null, normal: null, roughness: null });
    const slot = textureSlotOf(name);
    if (!set[slot]) set[slot] = name;
    else if (!set.color) set.color = name;
  }
  return [...sets.values()].map((set) => {
    if (!set.color) {
      const first = set.normal ?? set.roughness;
      if (first === set.normal) set.normal = null; else set.roughness = null;
      set.color = first;
    }
    const base = String(set.color).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    set.name = set.normal || set.roughness ? (setStem(set.color) || base) : base;
    return set;
  });
}
