// Appearances for rendering: the physically based parameters of a body, from its engineering material
// (render.js pbrFor) with the user's overrides (a part's or a component's `appearance`), the presets of the
// appearance editor, the procedural textures, and the packing of materials into the path tracer's texture.
import { pbrFor, materialClass } from '../render.js';
import { srgbToLinear } from './env.js';

/** Procedural textures (solid, in world space, so CAD meshes need no UVs); 'image' is a picture mapped from three sides. */
export const TEXTURES = ['none', 'wood', 'brushed', 'checker', 'knurl', 'carbon', 'cast', 'image'];

/**
 * Presets of the appearance editor: a look (its values replace the material's) — the colour stays the part's
 * unless the preset has its own.
 */
export const APPEARANCE_PRESETS = {
  auto: {},
  polishedMetal: { metalness: 1, roughness: 0.06, transmission: 0, clearcoat: 0, texture: 'none' },
  brushedMetal: { metalness: 1, roughness: 0.3, transmission: 0, clearcoat: 0, texture: 'brushed', textureScale: 1 },
  satinMetal: { metalness: 1, roughness: 0.42, transmission: 0, clearcoat: 0, texture: 'none' },
  castMetal: { metalness: 1, roughness: 0.62, transmission: 0, clearcoat: 0, texture: 'cast', textureScale: 1 },
  chrome: { metalness: 1, roughness: 0.02, transmission: 0, clearcoat: 0, color: '#e8ebee', texture: 'none' },
  knurled: { metalness: 1, roughness: 0.35, transmission: 0, clearcoat: 0, texture: 'knurl', textureScale: 1 },
  glossPlastic: { metalness: 0, roughness: 0.18, transmission: 0, clearcoat: 0.5, clearcoatRoughness: 0.08, ior: 1.46, specular: 1, texture: 'none' },
  mattePlastic: { metalness: 0, roughness: 0.65, transmission: 0, clearcoat: 0, ior: 1.46, specular: 0.8, texture: 'none' },
  paint: { metalness: 0.15, roughness: 0.35, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, texture: 'none' },
  clearGlass: { metalness: 0, roughness: 0, transmission: 1, ior: 1.52, clearcoat: 0, color: '#f4fbfc', absorb: 120, texture: 'none' },
  frostedGlass: { metalness: 0, roughness: 0.3, transmission: 1, ior: 1.52, clearcoat: 0, color: '#eef6f8', absorb: 120, texture: 'none' },
  tintedGlass: { metalness: 0, roughness: 0, transmission: 1, ior: 1.52, clearcoat: 0, absorb: 25, texture: 'none' },
  clearPlastic: { metalness: 0, roughness: 0.04, transmission: 0.95, ior: 1.58, clearcoat: 0, absorb: 40, texture: 'none' },
  rubber: { metalness: 0, roughness: 0.9, transmission: 0, clearcoat: 0, specular: 0.35, ior: 1.5, texture: 'none' },
  wood: { metalness: 0, roughness: 0.6, transmission: 0, clearcoat: 0.2, clearcoatRoughness: 0.35, ior: 1.5, texture: 'wood', textureScale: 1 },
  carbonFibre: { metalness: 0, roughness: 0.3, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.5, color: '#26282c', texture: 'carbon', textureScale: 1 },
  emissive: { metalness: 0, roughness: 0.5, transmission: 0, clearcoat: 0, emissive: '#ffffff', emissiveIntensity: 6, texture: 'none' },
};
export const APPEARANCE_IDS = Object.keys(APPEARANCE_PRESETS);
/** The look class each preset gives (shown in the material list). */
const PRESET_CLASS = {
  polishedMetal: 'metal', brushedMetal: 'metal', satinMetal: 'metal', castMetal: 'metal', chrome: 'metal', knurled: 'metal',
  glossPlastic: 'plastic', mattePlastic: 'plastic', paint: 'plastic', clearGlass: 'glass', frostedGlass: 'glass', tintedGlass: 'glass',
  clearPlastic: 'clearPlastic', rubber: 'rubber', wood: 'wood', carbonFibre: 'plastic', emissive: 'emissive',
};

/** The fields an override may set and their ranges ([min, max]; strings are colours or ids). */
export const APPEARANCE_FIELDS = {
  color: 'color', metalness: [0, 1], roughness: [0, 1], transmission: [0, 1], ior: [1, 3], specular: [0, 1],
  clearcoat: [0, 1], clearcoatRoughness: [0, 1], emissive: 'color', emissiveIntensity: [0, 1000], absorb: [0, 1e6],
  texture: 'texture', textureScale: [0.01, 100], image: 'image',
};
const HEX = /^#[0-9a-f]{6}$/i;

/** An override with only valid fields (and the preset id). */
export function normalizeAppearance(o) {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  if (APPEARANCE_PRESETS[o.preset] && o.preset !== 'auto') out.preset = o.preset;
  for (const [k, kind] of Object.entries(APPEARANCE_FIELDS)) {
    const v = o[k];
    if (v == null || v === '') continue;
    if (kind === 'color') { if (HEX.test(String(v))) out[k] = String(v).toLowerCase(); }
    else if (kind === 'texture') { if (TEXTURES.includes(v)) out[k] = v; }
    else if (kind === 'image') { if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v; }
    else if (Number.isFinite(Number(v))) out[k] = Math.max(kind[0], Math.min(kind[1], Number(v)));
  }
  return Object.keys(out).length ? out : null;
}

/** Default texture and absorption of a material's look class. */
function classExtras(cls, id) {
  if (cls === 'wood') return { texture: 'wood', textureScale: 1 };
  if (id === 'cast-iron') return { texture: 'cast', textureScale: 1 };
  if (cls === 'glass') return { absorb: 120, color: '#eef8f9' };
  if (cls === 'clearPlastic') return { absorb: 40 };
  return {};
}

/**
 * The full appearance of a body: { class, color, metalness, roughness, transmission, ior, specular, clearcoat,
 * clearcoatRoughness, emissive, emissiveIntensity, absorb (mm; the distance in which light keeps `color` of its
 * strength, 0 = no absorption), texture, textureScale, image, preset }.
 * Order: material → its class extras → part colour → preset → the override's own values. `overrides` may be
 * several (a part's then a component's): later ones win.
 */
export function appearanceFor(materialId, partColor = null, ...overrides) {
  const p = pbrFor(materialId, partColor);
  const cls = materialClass(materialId);
  const extras = classExtras(cls, materialId);
  const a = {
    class: cls, color: p.color, metalness: p.metalness, roughness: p.roughness, transmission: p.transmission, ior: p.ior,
    specular: p.specularIntensity ?? 1, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness,
    emissive: '#000000', emissiveIntensity: 0, absorb: 0, texture: 'none', textureScale: 1, image: null, preset: 'auto',
    ...extras,
  };
  if (partColor) a.color = partColor;
  if (cls === 'glass' && !partColor) a.color = extras.color;
  for (const raw of overrides) {
    const o = normalizeAppearance(raw);
    if (!o) continue;
    if (o.preset) {
      const pr = APPEARANCE_PRESETS[o.preset];
      Object.assign(a, pr, { preset: o.preset });
      a.class = PRESET_CLASS[o.preset];
    }
    const { preset, ...rest } = o;
    Object.assign(a, rest);
  }
  if (a.emissiveIntensity > 0 && a.emissive !== '#000000') a.class = a.transmission > 0 ? a.class : 'emissive';
  if (a.texture === 'image' && !a.image) a.texture = 'none';
  return a;
}

/** The raster preview's parameters of an appearance (MeshPhysicalMaterial values). */
export function previewPbr(a) {
  return {
    class: a.class, color: a.color, metalness: a.metalness, roughness: Math.max(0.02, a.roughness), clearcoat: a.clearcoat, clearcoatRoughness: a.clearcoatRoughness,
    transmission: a.transmission, ior: a.ior, thickness: a.transmission > 0 ? 6 : 0, sheen: a.class === 'rubber' ? 0.4 : 0, specularIntensity: a.specular,
    emissive: a.emissive, emissiveIntensity: a.emissiveIntensity,
  };
}

/** Floats a material takes in the path tracer's material texture (5 RGBA texels). */
export const MATERIAL_FLOATS = 20;

/**
 * Packs appearances for the GPU: Float32Array (MATERIAL_FLOATS each, linear colours) and the distinct images
 * (data URLs, their layer is their index).
 *   texel 0: colour rgb, metalness        texel 1: roughness, transmission, ior, specular
 *   texel 2: emission rgb, clear coat     texel 3: texture id, texture scale, coat roughness, absorption distance
 *   texel 4: image layer (−1 none), 0, 0, 0
 */
export function packMaterials(list) {
  const out = new Float32Array(Math.max(1, list.length) * MATERIAL_FLOATS);
  const images = [];
  list.forEach((a, i) => {
    const o = i * MATERIAL_FLOATS;
    const c = srgbToLinear(a.color);
    const e = srgbToLinear(a.emissive ?? '#000000').map((v) => v * (a.emissiveIntensity ?? 0));
    let layer = -1;
    if (a.texture === 'image' && a.image) { layer = images.indexOf(a.image); if (layer < 0) { images.push(a.image); layer = images.length - 1; } }
    out.set([c[0], c[1], c[2], a.metalness, a.roughness, a.transmission, a.ior, a.specular ?? 1, e[0], e[1], e[2], a.clearcoat ?? 0,
      TEXTURES.indexOf(a.texture ?? 'none'), a.textureScale ?? 1, a.clearcoatRoughness ?? 0.1, a.transmission > 0 ? (a.absorb ?? 0) : 0, layer, 0, 0, 0], o);
  });
  return { data: out, images };
}

/** The floor's appearance (floor ground mode): the preset's colour, a dielectric of the given roughness. */
export const floorAppearance = (color, roughness = 0.35) => ({ class: 'floor', color, metalness: 0, roughness, transmission: 0, ior: 1.5, specular: 0.6, clearcoat: 0, clearcoatRoughness: 0.1, emissive: '#000000', emissiveIntensity: 0, absorb: 0, texture: 'none', textureScale: 1, image: null });
