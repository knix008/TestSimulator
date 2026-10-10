// 3D model import: OBJ (+MTL), STL, PLY, glTF/GLB, FBX, COLLADA, 3MF, 3DS,
// VRML and AMF through the vendored three.js loaders, normalised into a
// project model asset — metres, Y up, centred on X/Z, standing on Y = 0 —
// with its size (mm), a top-view outline and the asset baked to a GLB.
//
// Also the shared helpers the 3D exporters use (objmtl.js, collada.js,
// threemf.js): meshes baked to world space, material colours and names.
//
// Units ("auto"): formats that declare a unit use it — glTF/GLB are metres by
// spec, COLLADA's <unit meter> and AMF's unit are applied by their loaders,
// 3MF's model@unit is read from the package, FBX uses its UnitScaleFactor
// (centimetres when absent). Everything else (OBJ, STL, PLY, 3DS, VRML) is
// guessed from the largest bounding-box extent L of the raw numbers:
// L > 300 → mm, L > 30 → cm, otherwise m. Furniture and fixtures are 0.3…30 m,
// so a chair (≈ 0.9 m) reads as 900 mm or 90 cm or 0.9 m in the respective
// unit and lands in the right bucket. Inches and feet are never guessed.
// An explicit unit always means "the numbers in the file are in this unit"
// and overrides any declaration.
//
// Up axis ("auto"): STL, PLY, 3MF, AMF and 3DS are Z-up by convention and are
// turned −90° about X (x, y, z) → (x, z, −y); OBJ, VRML are Y-up; the glTF,
// COLLADA and FBX loaders already deliver Y-up.

import * as THREE from "../vendor/three/three.module.js";
import { convexHull } from "../core/geom.js";

export const MODEL_FORMATS = [
  { ext: "obj", name: "Wavefront OBJ", binary: false, upAxis: "y" },
  { ext: "stl", name: "STL (stereolithography)", binary: true, upAxis: "z" },
  { ext: "ply", name: "Stanford PLY", binary: true, upAxis: "z" },
  { ext: "glb", name: "glTF binary (GLB)", binary: true, upAxis: "y" },
  { ext: "gltf", name: "glTF (embedded buffers / data URIs only)", binary: false, upAxis: "y" },
  { ext: "fbx", name: "Autodesk FBX", binary: true, upAxis: "y" },
  { ext: "dae", name: "COLLADA", binary: false, upAxis: "y" },
  { ext: "3mf", name: "3D Manufacturing Format", binary: true, upAxis: "z" },
  { ext: "3ds", name: "3D Studio", binary: true, upAxis: "z" },
  { ext: "wrl", name: "VRML 2.0", binary: false, upAxis: "y" },
  { ext: "amf", name: "Additive Manufacturing Format", binary: true, upAxis: "z" },
];

// For <input type="file" accept="...">.
export const MODEL_ACCEPT = MODEL_FORMATS.map((f) => `.${f.ext}`).join(",");

export const UNIT_METRES = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

const MAX_OUTLINE_SAMPLES = 20000;

// ---------------------------------------------------------------- base64

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t["-".charCodeAt(0)] = 62; // base64url
  t["_".charCodeAt(0)] = 63;
  return t;
})();

export function bytesToBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parts = [];
  const CHUNK = 0x6000; // multiple of 3
  for (let start = 0; start < b.length; start += CHUNK) {
    const end = Math.min(b.length, start + CHUNK);
    let s = "";
    let i = start;
    for (; i + 2 < end; i += 3) {
      const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    if (i < end) {
      const n = (b[i] << 16) | (i + 1 < end ? b[i + 1] << 8 : 0);
      s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < end ? B64[(n >> 6) & 63] : "=") + "=";
    }
    parts.push(s);
  }
  return parts.join("");
}

export function base64ToBytes(b64) {
  let s = String(b64 || "");
  const comma = s.startsWith("data:") ? s.indexOf(",") : -1;
  if (comma >= 0) s = s.slice(comma + 1);
  s = s.replace(/[\s=]+/g, "");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_INDEX[c] : -1;
    if (v < 0) throw new Error("invalid base64 data");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}

// ---------------------------------------------------------------- shared export helpers

// Material colour as sRGB components 0..1 (three keeps colours linear).
export function materialColor(material) {
  const c = material && material.color ? material.color.clone() : new THREE.Color(1, 1, 1);
  THREE.ColorManagement.workingToColorSpace(c, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

export function materialOpacity(material) {
  if (!material) return 1;
  const o = Number.isFinite(material.opacity) ? material.opacity : 1;
  return material.transparent || o < 1 ? Math.max(0, Math.min(1, o)) : 1;
}

// Unique, file-safe names for a list of materials: Map(material → name).
export function uniqueMaterialNames(materials, fallback = "material") {
  const names = new Map();
  const used = new Set();
  for (const m of materials) {
    if (names.has(m)) continue;
    let base = String((m && m.name) || "").trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || `${fallback}_${names.size + 1}`;
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base}_${k}`;
    used.add(name.toLowerCase());
    names.set(m, name);
  }
  return names;
}

// Visible meshes of root baked to world space (× scale) as flat arrays:
// [{ object, name, positions, normals|null, uvs|null, index (triangles,
//    counter-clockwise from outside even under mirroring transforms),
//    groups: [{ start, count, material }] }]
export function collectMeshes(root, { scale = 1 } = {}) {
  root.updateMatrixWorld(true);
  const out = [];
  const inst = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, inst);
        const baked = bakeMesh(o, world.multiplyMatrices(o.matrixWorld, inst), scale);
        if (baked) out.push(baked);
      }
    } else {
      const baked = bakeMesh(o, o.matrixWorld, scale);
      if (baked) out.push(baked);
    }
  });
  return out;
}

function bakeMesh(o, matrix, scale) {
  const geo = o.geometry;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const n = pos.count;
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix).multiplyScalar(scale);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  let normals = null;
  if (nrm && nrm.count === n) {
    normals = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix);
      if (v.lengthSq() > 0) v.normalize();
      normals[i * 3] = v.x;
      normals[i * 3 + 1] = v.y;
      normals[i * 3 + 2] = v.z;
    }
  }
  let uvs = null;
  if (uv && uv.count === n) {
    uvs = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      uvs[i * 2] = uv.getX(i);
      uvs[i * 2 + 1] = uv.getY(i);
    }
  }
  let index;
  if (geo.index) {
    index = Uint32Array.from(geo.index.array.subarray ? geo.index.array.subarray(0, geo.index.count) : geo.index.array);
  } else {
    index = new Uint32Array(n - (n % 3));
    for (let i = 0; i < index.length; i++) index[i] = i;
  }
  index = index.subarray(0, index.length - (index.length % 3));
  if (!index.length) return null;
  if (matrix.determinant() < 0) {
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
  }
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const groups = [];
  if (geo.groups && geo.groups.length && Array.isArray(o.material)) {
    for (const g of geo.groups) {
      const start = Math.min(index.length, g.start - (g.start % 3));
      const end = Math.min(index.length, g.start + (Number.isFinite(g.count) ? g.count : index.length));
      const count = end - start - ((end - start) % 3);
      if (count > 0) groups.push({ start, count, material: mats[g.materialIndex || 0] || mats[0] });
    }
  } else {
    groups.push({ start: 0, count: index.length, material: mats[0] });
  }
  if (!groups.length) return null;
  return { object: o, name: o.name || (o.parent && o.parent.name) || "", positions, normals, uvs, index, groups };
}

// ---------------------------------------------------------------- import

const fileExt = (name) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
};
const baseName = (name) => String(name || "model").split(/[\\/]/).pop().replace(/\.[^.]+$/, "") || "model";
const decodeText = (bytes) => new TextDecoder().decode(bytes);
// A standalone ArrayBuffer holding exactly the file (bytes may be a view).
const ownBuffer = (bytes) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer);

function unitName(metresPerUnit) {
  for (const [k, f] of Object.entries(UNIT_METRES)) if (Math.abs(f - metresPerUnit) <= f * 1e-6) return k;
  return `${+metresPerUnit.toPrecision(6)} m`;
}

function guessUnit(extent) {
  if (extent > 300) return "mm";
  if (extent > 30) return "cm";
  return "m";
}

const THREEMF_UNITS = { micron: 1e-6, millimeter: 0.001, centimeter: 0.01, inch: 0.0254, foot: 0.3048, meter: 1 };
const AMF_UNITS = { micron: 1e-6, millimeter: 0.001, inch: 0.0254, feet: 0.3048, meter: 1 };

async function zipXmlText(bytes, test) {
  const { unzipSync } = await import("../vendor/three/addons/libs/fflate.module.js");
  const files = unzipSync(bytes, { filter: (f) => test(f.name) });
  const first = Object.values(files)[0];
  return first ? decodeText(first) : "";
}

// An error whose message is already meant for the user (not wrapped again).
function importError(message) {
  const err = new Error(message);
  err.importError = true;
  return err;
}

const isZip = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

// Each parser returns { root, declared: metres per unit of the loader's output
// (null = unknown, guess), rawPerLoaded: file units per loader unit }.
const PARSERS = {
  async obj(bytes, opts, warnings) {
    const { OBJLoader } = await import("../vendor/three/addons/OBJLoader.js");
    const text = decodeText(bytes);
    const loader = new OBJLoader();
    if (opts.mtlText) {
      const { MTLLoader } = await import("../vendor/three/addons/MTLLoader.js");
      const creator = new MTLLoader().parse(String(opts.mtlText), "");
      creator.preload();
      loader.setMaterials(creator);
    } else if (/^\s*mtllib\s+\S/m.test(text)) {
      const lib = /^\s*mtllib\s+(.+)$/m.exec(text)[1].trim();
      warnings.push(`Materials from "${lib}" were not loaded; add the .mtl file to keep the colours.`);
    }
    return { root: loader.parse(text), declared: null };
  },

  async stl(bytes) {
    const { STLLoader } = await import("../vendor/three/addons/STLLoader.js");
    const geo = new STLLoader().parse(ownBuffer(bytes));
    const mat = new THREE.MeshStandardMaterial({ name: "stl", color: 0xb8bcc4, roughness: 0.6, metalness: 0.05 });
    if (geo.hasColors && geo.attributes.color) {
      mat.vertexColors = true;
      mat.color.set(0xffffff);
      if (Number.isFinite(geo.alpha) && geo.alpha < 1) { mat.opacity = geo.alpha; mat.transparent = true; }
    }
    return { root: new THREE.Mesh(geo, mat), declared: null };
  },

  async ply(bytes) {
    const { PLYLoader } = await import("../vendor/three/addons/PLYLoader.js");
    const geo = new PLYLoader().parse(ownBuffer(bytes));
    if (!geo.index) throw importError("The PLY file is a point cloud (no faces); only surface models can be imported.");
    const mat = new THREE.MeshStandardMaterial({ name: "ply", color: 0xb8bcc4, roughness: 0.6, metalness: 0.05 });
    if (geo.attributes.color) { mat.vertexColors = true; mat.color.set(0xffffff); }
    return { root: new THREE.Mesh(geo, mat), declared: null };
  },

  async glb(bytes) {
    const { GLTFLoader } = await import("../vendor/three/addons/GLTFLoader.js");
    const gltf = await new GLTFLoader().parseAsync(ownBuffer(bytes), "");
    return { root: gltf.scene, declared: 1 };
  },

  async gltf(bytes, opts, warnings) {
    let json;
    try {
      json = JSON.parse(decodeText(bytes));
    } catch {
      throw importError("The .gltf file is not valid JSON.");
    }
    const external = (list) => (list || []).filter((x) => x && typeof x.uri === "string" && !x.uri.startsWith("data:")).map((x) => x.uri);
    const bins = external(json.buffers);
    if (bins.length) {
      throw importError(`The .gltf file references external buffers (${bins.join(", ")}); only .gltf files with embedded data URIs can be imported — export it as .glb instead.`);
    }
    const images = external(json.images);
    if (images.length) warnings.push(`External textures were skipped (${images.join(", ")}); export the model as .glb to keep them.`);
    return PARSERS.glb(bytes, opts, warnings);
  },

  async fbx(bytes) {
    const { FBXLoader } = await import("../vendor/three/addons/FBXLoader.js");
    const root = new FBXLoader().parse(ownBuffer(bytes), "");
    const usf = Number(root.userData && root.userData.unitScaleFactor);
    return { root, declared: (Number.isFinite(usf) && usf > 0 ? usf : 1) * 0.01 };
  },

  async dae(bytes) {
    const { ColladaLoader } = await import("../vendor/three/addons/ColladaLoader.js");
    const text = decodeText(bytes);
    const res = new ColladaLoader().parse(text, "");
    if (!res || !res.scene) throw importError("The COLLADA file could not be parsed.");
    const m = /<unit\b[^>]*\bmeter\s*=\s*["']([^"']+)["']/i.exec(text);
    const meter = m && +m[1] > 0 ? +m[1] : 1;
    return { root: res.scene, declared: 1, rawPerLoaded: 1 / meter };
  },

  async "3mf"(bytes) {
    const { ThreeMFLoader } = await import("../vendor/three/addons/3MFLoader.js");
    const root = new ThreeMFLoader().parse(ownBuffer(bytes));
    const xml = await zipXmlText(bytes, (n) => /\.model$/i.test(n));
    const m = /<model\b[^>]*\bunit\s*=\s*["'](\w+)["']/i.exec(xml);
    return { root, declared: THREEMF_UNITS[m ? m[1].toLowerCase() : "millimeter"] || 0.001 };
  },

  async "3ds"(bytes) {
    const { TDSLoader } = await import("../vendor/three/addons/TDSLoader.js");
    return { root: new TDSLoader().parse(ownBuffer(bytes), ""), declared: null };
  },

  async wrl(bytes) {
    const { VRMLLoader } = await import("../vendor/three/addons/VRMLLoader.js");
    return { root: new VRMLLoader().parse(decodeText(bytes), ""), declared: null };
  },

  async amf(bytes) {
    const { AMFLoader } = await import("../vendor/three/addons/AMFLoader.js");
    const root = new AMFLoader().parse(ownBuffer(bytes));
    const xml = isZip(bytes) ? await zipXmlText(bytes, () => true) : decodeText(bytes);
    const m = /<amf\b[^>]*\bunit\s*=\s*["'](\w+)["']/i.exec(xml);
    const fileUnit = AMF_UNITS[m ? m[1].toLowerCase() : "millimeter"] || 0.001;
    // The loader scales everything to millimetres.
    return { root, declared: 0.001, rawPerLoaded: 0.001 / fileUnit };
  },
};

// Wait (bounded) for textures whose images are still decoding in the browser.
async function settleTextures(materials, ms = 5000) {
  const waits = [];
  for (const m of materials) {
    for (const key of ["map", "emissiveMap"]) {
      const img = m && m[key] && m[key].image;
      if (img && typeof img.complete === "boolean" && !img.complete && img.addEventListener) {
        waits.push(new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        }));
      }
    }
  }
  if (!waits.length) return;
  await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, ms))]);
}

function usableTexture(t) {
  const img = t && t.image;
  if (!img) return null;
  const w = img.width || img.naturalWidth || 0, h = img.height || img.naturalHeight || 0;
  return w > 0 && h > 0 ? t : null;
}

// GLTFExporter writes MeshStandardMaterial / MeshPhysicalMaterial / MeshBasicMaterial;
// everything else (Phong, Lambert, Toon, …) becomes a standard material.
function exportableMaterial(m, cache, warnings) {
  if (!m) m = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  if (cache.has(m)) return cache.get(m);
  let out;
  if (m.isMeshStandardMaterial || m.isMeshBasicMaterial) {
    out = m;
    for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap"]) {
      if (out[key] && !usableTexture(out[key])) {
        if (out === m) out = m.clone();
        out[key] = null;
        out.needsUpdate = true;
      }
    }
  } else {
    const shininess = Number.isFinite(m.shininess) ? m.shininess : 30;
    out = new THREE.MeshStandardMaterial({
      name: m.name || "",
      color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
      map: usableTexture(m.map),
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0),
      emissiveMap: usableTexture(m.emissiveMap),
      opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
      transparent: !!m.transparent || m.opacity < 1,
      alphaTest: m.alphaTest || 0,
      side: m.side,
      vertexColors: !!m.vertexColors,
      roughness: Math.min(1, Math.max(0.05, Math.sqrt(2 / (shininess + 2)))),
      metalness: 0,
    });
    if (m.map && !out.map) warnings.add("Some textures could not be loaded and were left out.");
  }
  cache.set(m, out);
  return out;
}

function sanitizeGeometry(src, flat) {
  const geo = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv", "color"]) {
    const a = src.attributes[name];
    if (!a) continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (src.index) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array.subarray(0, src.index.count)), 1));
  for (const g of src.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  if (flat && geo.index) {
    const ni = geo.toNonIndexed();
    geo.dispose();
    ni.deleteAttribute("normal");
    return ni;
  }
  if (flat) geo.deleteAttribute("normal");
  return geo;
}

function flipWinding(geo) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new Uint32Array(n - (n % 3));
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const a = geo.index.array;
  for (let i = 0; i + 2 < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  geo.index.needsUpdate = true;
}

const triangleCount = (geo) => Math.floor((geo.index ? geo.index.count : geo.attributes.position.count) / 3);

// loadModelFile({ name, bytes }, { units, upAxis, mtlText, glb }) →
// { object, name, format, size: [w, d, h] mm, outline, data (base64 GLB | null), units, warnings }
export async function loadModelFile({ name, bytes }, { units = "auto", upAxis = "auto", mtlText = null, glb = true } = {}) {
  const ext = fileExt(name);
  const format = MODEL_FORMATS.find((f) => f.ext === ext);
  if (!format) {
    throw new Error(`Unsupported 3D model format "${ext ? `.${ext}` : name}". Supported: ${MODEL_FORMATS.map((f) => f.ext.toUpperCase()).join(", ")}.`);
  }
  if (units !== "auto" && !(units in UNIT_METRES)) throw new Error(`Unknown unit "${units}" (use auto, mm, cm, m, in or ft).`);
  if (!["auto", "y", "z"].includes(upAxis)) throw new Error(`Unknown up axis "${upAxis}" (use auto, y or z).`);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (!data.length) throw new Error(`"${name}" is empty.`);

  const warnings = [];
  let parsed;
  try {
    parsed = await PARSERS[ext](data, { mtlText }, warnings);
  } catch (err) {
    if (err && err.importError) throw err;
    throw new Error(`Could not read ${format.name} file "${name}": ${err && err.message ? err.message : String(err)}`);
  }
  const loaded = parsed.root;
  loaded.updateMatrixWorld(true);

  // Up axis rotation, applied before everything else.
  const zUp = upAxis === "auto" ? format.upAxis === "z" : upAxis === "z";
  const pre = new THREE.Matrix4();
  if (zUp) pre.makeRotationX(-Math.PI / 2);

  // Bake every visible triangle mesh into world space.
  const softWarnings = new Set();
  const matCache = new Map();
  const srcMaterials = [];
  loaded.traverseVisible((o) => { if (o.isMesh) srcMaterials.push(...(Array.isArray(o.material) ? o.material : [o.material])); });
  await settleTextures(srcMaterials);

  const baked = [];
  let skipped = 0;
  const m4 = new THREE.Matrix4(), inst = new THREE.Matrix4();
  loaded.traverseVisible((o) => {
    if (o.isLine || o.isPoints) { skipped++; return; }
    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Sky / ground backdrops (VRML Background) are not part of the model.
    if (mats.every((mm) => mm && mm.depthTest === false && mm.side === THREE.BackSide)) return;
    const flat = mats.some((mm) => mm && mm.flatShading);
    const count = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < count; i++) {
      const geo = sanitizeGeometry(o.geometry, flat);
      if (!triangleCount(geo)) { geo.dispose(); continue; }
      m4.multiplyMatrices(pre, o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(i, inst); m4.multiply(inst); }
      geo.applyMatrix4(m4);
      if (m4.determinant() < 0) flipWinding(geo);
      const out = mats.map((mm) => exportableMaterial(mm, matCache, softWarnings));
      if (!geo.attributes.color) for (let k = 0; k < out.length; k++) if (out[k].vertexColors) { out[k] = out[k].clone(); out[k].vertexColors = false; }
      const mesh = new THREE.Mesh(geo, Array.isArray(o.material) ? out : out[0]);
      mesh.name = o.name || (o.parent && o.parent.name) || "";
      baked.push(mesh);
    }
  });
  if (skipped) warnings.push(`${skipped} line or point object(s) were ignored; only surfaces are imported.`);
  if (!baked.length) throw new Error(`"${name}" contains no surfaces (triangles) to import.`);

  // Units.
  const box = new THREE.Box3();
  for (const m of baked) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  const ext3 = box.getSize(new THREE.Vector3());
  const extent = Math.max(ext3.x, ext3.y, ext3.z);
  if (!(extent > 0) || !Number.isFinite(extent)) throw new Error(`"${name}" has no extent (all vertices coincide).`);
  let factor, unitLabel;
  if (units !== "auto") {
    factor = UNIT_METRES[units] * (parsed.rawPerLoaded || 1);
    unitLabel = units;
  } else if (parsed.declared) {
    factor = parsed.declared;
    unitLabel = unitName(parsed.declared / (parsed.rawPerLoaded || 1));
  } else {
    unitLabel = guessUnit(extent);
    factor = UNIT_METRES[unitLabel];
    warnings.push(`Units guessed as ${unitLabel} from the largest dimension (${+extent.toPrecision(4)}); choose the unit explicitly if the size is wrong.`);
  }

  // Scale to metres, centre on X/Z, stand on Y = 0.
  const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(factor);
  const norm = new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y * factor, -centre.z).multiply(new THREE.Matrix4().makeScale(factor, factor, factor));
  const object = new THREE.Group();
  object.name = baseName(name);
  for (const m of baked) {
    m.geometry.applyMatrix4(norm);
    if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
    object.add(m);
  }
  object.updateMatrixWorld(true);

  const wM = ext3.x * factor, hM = ext3.y * factor, dM = ext3.z * factor;
  const mm = (v) => Math.max(1, Math.round(v * 10000) / 10);
  const size = [mm(wM), mm(dM), mm(hM)];
  const outline = footprintOutline(baked, wM, dM);
  for (const w of softWarnings) warnings.push(w);

  let glbData = null;
  if (glb) {
    const { GLTFExporter } = await import("../vendor/three/addons/GLTFExporter.js");
    const ab = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
    glbData = bytesToBase64(new Uint8Array(ab));
  }
  return { object, name: object.name, format: ext, size, outline, data: glbData, units: unitLabel, warnings };
}

// Convex hull of the top view, normalised to the −0.5…0.5 footprint square.
function footprintOutline(meshes, wM, dM) {
  let total = 0;
  for (const m of meshes) total += m.geometry.attributes.position.count;
  const stride = Math.max(1, Math.ceil(total / MAX_OUTLINE_SAMPLES));
  const sx = wM > 1e-9 ? 1 / wM : 0, sz = dM > 1e-9 ? 1 / dM : 0;
  const pts = [];
  const ext = { minX: null, maxX: null, minZ: null, maxZ: null };
  let k = 0;
  for (const m of meshes) {
    const a = m.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3, k++) {
      const x = a[i], z = a[i + 2];
      if (k % stride === 0) pts.push([x, z]);
      if (ext.minX === null || x < ext.minX[0]) ext.minX = [x, z];
      if (ext.maxX === null || x > ext.maxX[0]) ext.maxX = [x, z];
      if (ext.minZ === null || z < ext.minZ[1]) ext.minZ = [x, z];
      if (ext.maxZ === null || z > ext.maxZ[1]) ext.maxZ = [x, z];
    }
  }
  pts.push(ext.minX, ext.maxX, ext.minZ, ext.maxZ);
  const clamp = (v) => Math.max(-0.5, Math.min(0.5, Math.round(v * 10000) / 10000));
  const hull = convexHull(pts.map(([x, z]) => [clamp(x * sx), clamp(z * sz)]));
  if (hull.length < 3) return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  return hull;
}
