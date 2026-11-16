// The 3D material of a MySketchBook preset (src/lib/presetmaterials.js): a
// physically based material (sheen for fabric, clearcoat for lacquer and
// glaze, transmission for glass, emissive for lamps), its procedural pattern
// (colour + bump CanvasTextures) and its Poly Haven texture set
// (library/textures/<set>: colour tinted to the material's colour, normal,
// roughness and occlusion maps), loaded once and shared. UVs are metres.
// The textures arrive after the material is made; "myarch-texture" asks the
// views to draw again.

import { presetPattern, rememberSetImage } from "../lib/materials.js";
import { TEXTURE_SETS } from "../lib/libraryindex.js";
import { assetUrl, onLibraryChanged } from "../io/assetstore.js";
import { rankedCopies } from "./depth.js";

/** The texture sets' metadata (shipped: src/lib/libraryindex.js; the pictures are downloaded, src/io/assetlib.js). */
export function textureIndex() { return Promise.resolve(TEXTURE_SETS); }

const images = new Map(); // "set/map" → Promise<HTMLImageElement>
export function setImage(set, map, ext = "webp") {
  const key = `${set}/${map}`;
  if (!images.has(key)) {
    images.set(key, assetUrl(`textures/${set}/${map}.${ext}`).then((src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // served by the library protocol with CORS: WebGL may use it
      img.onload = () => { if (map === "diff") rememberSetImage(set, img); resolve(img); };
      img.onerror = () => { images.delete(key); reject(new Error(`${key} not found`)); };
      img.src = src;
    })));
  }
  return images.get(key);
}

/** Colour factor so a texture whose average is `avg` comes out at `target` on average (the grain stays). */
export function tintFactor(target, avg) {
  const rgb = (hex) => { const n = parseInt(String(hex || "#ffffff").slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255); };
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const t = rgb(target).map(lin), a = rgb(avg).map(lin);
  return t.map((v, i) => Math.min(4, v / Math.max(a[i], 0.01)));
}

const textureCache = new Map(); // "set/map/rx/ry" → THREE.Texture
// A library (re)installed: pictures that were missing are looked for again.
onLibraryChanged(() => { images.clear(); textureCache.clear(); });

/** Makes the material; `opacity` < 1 draws it see-through. `textures` false = plain colours (no canvas, Node). */
export function presetSurface(THREE, m, { textures = true, opacity = 1 } = {}) {
  const p = m.preset;
  const physical = p.sheen || p.clearcoat || p.transmission;
  const Kind = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Kind({ color: m.color, roughness: m.rough ?? 0.8, metalness: m.metal ?? 0, side: THREE.DoubleSide, name: m.id });
  if (p.emissive) { mat.emissive = new THREE.Color(p.emissive); mat.emissiveIntensity = p.emissiveIntensity ?? 1; }
  if (physical) {
    if (p.sheen) { mat.sheen = p.sheen; mat.sheenRoughness = 0.8; mat.sheenColor = new THREE.Color(p.sheenColor ?? m.color).lerp(new THREE.Color("#ffffff"), p.sheenColor ? 0 : 0.3); }
    if (p.clearcoat) { mat.clearcoat = p.clearcoat; mat.clearcoatRoughness = p.clearcoatRoughness ?? 0.2; }
    if (p.transmission) { mat.transmission = p.transmission; mat.ior = p.ior ?? 1.5; mat.thickness = p.thickness ?? 0.01; }
  }
  const op = Math.min(opacity, p.transparent ? (p.opacity ?? 0.5) : 1);
  if (op < 1) { mat.transparent = true; mat.opacity = op; mat.depthWrite = false; }
  mat.userData.preset = p.source;
  const canDraw = textures && typeof document !== "undefined";
  if (canDraw && p.pattern) {
    const drawn = presetPattern(p.pattern);
    if (drawn) {
      const [map, bump] = ["map", "bump"].map((name) => {
        const tx = new THREE.CanvasTexture(drawn[name]);
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(1 / drawn.layout.cover[0], 1 / drawn.layout.cover[1]);
        tx.anisotropy = 8;
        tx.colorSpace = name === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return tx;
      });
      mat.map = map; mat.bumpMap = bump; mat.bumpScale = p.pattern.bump ?? 1;
      // The pattern carries its own colours; an edited colour tints it.
      mat.color.setRGB(...(m.color === p.baseColor ? [1, 1, 1] : tintFactor(m.color, p.baseColor)));
    }
  }
  if (canDraw && p.textures) attachSet(THREE, mat, m).catch(() => {});
  return mat;
}

async function attachSet(THREE, mat, m) {
  const p = m.preset;
  const info = (await textureIndex())[p.textures];
  if (!info) return;
  const [sx, sy] = p.textureSize ? [p.textureSize, p.textureSize] : info.size || [p.repeat || 1, p.repeat || 1];
  const rx = 1 / (sx || 1), ry = 1 / (sy || sx || 1);
  const maps = info.maps || ["diff", "nor", "rough"];
  const loaded = {};
  await Promise.all(maps.map(async (map) => {
    try {
      const img = await setImage(p.textures, map, info.ext || "webp");
      const key = `${p.textures}/${map}/${rx.toFixed(4)}/${ry.toFixed(4)}`;
      let tx = textureCache.get(key);
      if (!tx) {
        tx = new THREE.Texture(img);
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(rx, ry);
        tx.anisotropy = 8;
        tx.colorSpace = map === "diff" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tx.needsUpdate = true;
        textureCache.set(key, tx);
      }
      loaded[map] = tx;
    } catch { /* a missing map: the material keeps its plain value */ }
  }));
  applySetMaps(mat, m, info, loaded);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("myarch-texture"));
}

/**
 * Puts a texture set's loaded maps ({ diff, nor, rough, ao } textures) on the material of preset material `m`
 * (`info`: the set's index entry), and on the depth-ranked copies made of it meanwhile.
 */
export function applySetMaps(mat, m, info, loaded) {
  const p = m.preset;
  // A pattern gives the colour; the set then only adds relief.
  if (loaded.diff && !p.pattern) { mat.map = loaded.diff; mat.color.setRGB(...tintFactor(m.color, info.avg)); }
  if (loaded.nor) mat.normalMap = loaded.nor;
  if (loaded.rough) { mat.roughnessMap = loaded.rough; if (info.roughAvg) mat.roughness = Math.min(2, (m.rough ?? 0.8) / Math.max(info.roughAvg, 0.05)); }
  if (loaded.ao) { mat.aoMap = loaded.ao; mat.aoMapIntensity = 0.8; }
  mat.needsUpdate = true;
  // Copies made meanwhile (floors drawn a depth rank in front, depth.js) get the maps too.
  for (const c of rankedCopies(mat)) {
    for (const k of ["map", "normalMap", "roughnessMap", "aoMap", "aoMapIntensity", "roughness"]) c[k] = mat[k];
    c.color.copy(mat.color);
    c.needsUpdate = true;
  }
}
