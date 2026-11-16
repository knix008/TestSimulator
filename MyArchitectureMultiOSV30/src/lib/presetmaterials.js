// MySketchBook's 1787 material presets (src/lib/presets) as this app's library
// materials: { id, name (English, translated by t()), color, cat, use, rough,
// metal, preset }. `preset` keeps what the 3D view needs beyond a colour: the
// Poly Haven texture set (library/textures/<set>, tinted to the colour), the
// procedural pattern (presets/patterns.js), sheen, clearcoat, transmission,
// emissive light. Ids already taken by this app's own materials get "p-".

import { MATERIAL_PRESETS } from "./presets/index.js";

/** Library groups the presets add (the others exist already: wood, stone, tile, metal …). */
export const PRESET_CATEGORIES = [
  ["flooring", "Flooring"], ["wallfinish", "Wall finishes"], ["leather", "Leather"], ["plastic", "Plastic"],
  ["ceramic", "Ceramic"], ["plant", "Plants"], ["other", "Other"],
];

// MySketchBook category → this app's group and what the material may be used on.
const CAT = { wood: "wood", floor: "flooring", fabric: "fabric", leather: "leather", stone: "stone", tile: "tile", wall: "wallfinish", metal: "metal", glass: "glass", paint: "paint", plastic: "plastic", ceramic: "ceramic", carpet: "resilient", plant: "plant", other: "other" };
const USE = {
  wood: ["wall", "floor", "ceiling", "furniture"], floor: ["floor"], fabric: ["wall", "furniture"], leather: ["furniture"],
  stone: ["wall", "floor"], tile: ["wall", "floor"], wall: ["wall", "ceiling"], metal: ["wall", "roof", "frame", "furniture"],
  glass: ["wall", "frame", "furniture"], paint: ["wall", "ceiling"], plastic: ["wall", "furniture"], ceramic: ["wall", "floor", "furniture"],
  carpet: ["floor"], plant: ["furniture"], other: ["furniture"],
};
const SKIP = new Set(["default", "back-face"]);
const KEEP = ["textures", "textureSize", "repeat", "pattern", "sheen", "sheenColor", "clearcoat", "clearcoatRoughness", "transmission", "ior", "thickness", "transparent", "opacity", "emissive", "emissiveIntensity", "side"];

/** The presets as library materials; `taken`: ids in use already (they get a "p-" prefix). */
export function presetMaterials(taken = new Set()) {
  const out = [];
  for (const p of MATERIAL_PRESETS) {
    if (SKIP.has(p.id)) continue;
    const preset = { source: p.id, baseColor: p.color };
    for (const k of KEEP) if (p[k] !== undefined) preset[k] = p[k];
    const m = { id: taken.has(p.id) ? `p-${p.id}` : p.id, name: p.en, ko: p.ko, color: p.color, pattern: null, cat: CAT[p.category] || "other", use: USE[p.category] || ["furniture"], rough: p.roughness, metal: p.metalness, preset };
    // See-through presets (glass, water, sheer fabric): the 3D view draws them transparent.
    if (p.transparent && Number.isFinite(p.opacity)) m.opacity = p.opacity;
    out.push(m);
  }
  return out;
}

/** English name → Korean, for the translation table (src/ui/i18n-ko.js). */
export function presetNamesKo() {
  const out = {};
  for (const p of MATERIAL_PRESETS) if (!SKIP.has(p.id) && p.en && p.ko && !(p.en in out)) out[p.en] = p.ko;
  return out;
}
