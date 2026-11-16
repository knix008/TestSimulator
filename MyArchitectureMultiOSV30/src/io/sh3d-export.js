// Sweet Home 3D writer (.sh3d): a ZIP holding Home.xml — which Sweet Home 3D
// reads by itself since version 5.3 (no Java-serialized "Home" entry is
// needed) — and one folder per 3D model ("3/model.obj" + .mtl + textures)
// and texture image the home uses. The elements follow the Home.xml DTD of
// Sweet Home 3D (com.eteks.sweethome3d.io.HomeXMLHandler), in its order:
// compass, levels, furniture, walls, rooms, polylines, dimension lines, labels.
//
// Units: our millimetres → centimetres, plan y down in both, angles degrees
// clockwise → radians clockwise. Every piece needs a 3D model there, so:
//   catalog furniture (and SketchUp components) → OBJ of the shape our 3D
//     view builds for it (src/view3d/build.js),
//   imported model furniture → OBJ (+ its textures) from the stored GLB,
//   doors / windows → simple frame + leaf / glass OBJ models,
//   stairs, columns, roofs and mass models → OBJ models of their geometry
//     (Sweet Home 3D roofs are furniture too).
// Walls take their material's colour (or texture image), rooms their floor's.

import * as THREE from "../vendor/three/three.module.js";
import { crc32, dosDateTime } from "./zip.js";
import { base64ToBytes, collectMeshes, materialColor as meshColor, materialOpacity } from "./models3d.js";
import { normalizeProject, newProject, levelById, levelAbove } from "../core/project.js";
import { materialColor, materialById, setProjectMaterials } from "../lib/materials.js";
import { isLight } from "../lib/furniture.js";
import { roofModel, roofBase } from "../core/roof.js";
import { triangulate, polygonArea } from "../core/geom.js";

const CM = 10;
const RAD = Math.PI / 180;
const cm = (mm) => fmt(mm / CM);
const fmt = (v) => String(Math.round(v * 1000) / 1000 || 0);
const ang = (v) => String(+(+v || 0).toFixed(7)); // radians
const escXml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const argb = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || "") ? `FF${hex.slice(1).toUpperCase()}` : null);
const enc = new TextEncoder();

function tag(name, attrs, children = null) {
  const a = Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => ` ${k}='${escXml(v)}'`).join("");
  if (!children || !children.length) return `<${name}${a}/>`;
  return `<${name}${a}>\n${children.map((c) => `  ${c.replace(/\n/g, "\n  ")}`).join("\n")}\n</${name}>`;
}

// ---------------------------------------------------------------- meshes → OBJ
// meshes: [{ positions (cm, x right, y up, z = plan y), normals?, uvs?, index, material: {name, color: [r,g,b] sRGB 0..1, opacity, image?: {bytes, ext}} }]
export function meshesToObj(meshes, { name = "model" } = {}) {
  const obj = [`# ${name} — MyArchitecture export for Sweet Home 3D`, `mtllib ${name}.mtl`];
  const mtl = [`# ${name} materials`];
  const images = [];
  const matNames = new Map();
  const used = new Set();
  const matName = (m) => {
    if (matNames.has(m)) return matNames.get(m);
    const base = String(m.name || "material").replace(/\s+/g, "_").replace(/[^\w.-]/g, "") || "material";
    let n = base;
    for (let k = 2; used.has(n); k++) n = `${base}_${k}`;
    used.add(n);
    matNames.set(m, n);
    const c = (m.color || [0.8, 0.8, 0.8]).map((v) => Math.max(0, Math.min(1, v)).toFixed(4)).join(" ");
    mtl.push("", `newmtl ${n}`, `Ka ${c}`, `Kd ${c}`, "Ks 0.1 0.1 0.1", "Ns 20", `d ${fmt(m.opacity ?? 1)}`, "illum 2");
    if (m.image) {
      let img = images.find((x) => x.bytes === m.image.bytes);
      if (!img) { img = { bytes: m.image.bytes, name: `texture${images.length}.${m.image.ext || "png"}` }; images.push(img); }
      mtl.push(`map_Kd ${img.name}`);
    }
    return n;
  };
  let vb = 1, tb = 1, nb = 1;
  meshes.forEach((m, mi) => {
    const n = m.positions.length / 3;
    obj.push(`g part${mi}`);
    for (let i = 0; i < n; i++) obj.push(`v ${fmt(m.positions[i * 3])} ${fmt(m.positions[i * 3 + 1])} ${fmt(m.positions[i * 3 + 2])}`);
    const uv = m.uvs && m.material.image ? m.uvs : null;
    if (uv) for (let i = 0; i < n; i++) obj.push(`vt ${+uv[i * 2].toFixed(5)} ${+uv[i * 2 + 1].toFixed(5)}`);
    if (m.normals) for (let i = 0; i < n; i++) obj.push(`vn ${+m.normals[i * 3].toFixed(4)} ${+m.normals[i * 3 + 1].toFixed(4)} ${+m.normals[i * 3 + 2].toFixed(4)}`);
    const v = (i) => (uv && m.normals ? `${vb + i}/${tb + i}/${nb + i}` : m.normals ? `${vb + i}//${nb + i}` : uv ? `${vb + i}/${tb + i}` : `${vb + i}`);
    obj.push(`usemtl ${matName(m.material)}`);
    for (let t = 0; t + 2 < m.index.length; t += 3) obj.push(`f ${v(m.index[t])} ${v(m.index[t + 1])} ${v(m.index[t + 2])}`);
    vb += n;
    if (uv) tb += n;
    if (m.normals) nb += n;
  });
  return { obj: `${obj.join("\n")}\n`, mtl: `${mtl.join("\n")}\n`, images };
}

// Boxes [x0, x1, y0, y1, z0, z1] (cm, y up) with a material each → meshes.
function boxMeshes(boxes) {
  return boxes.map(([x0, x1, y0, y1, z0, z1, material]) => {
    const positions = [], normals = [], index = [];
    const quad = (p, nrm) => { const b = positions.length / 3; for (const q of p) { positions.push(...q); normals.push(...nrm); } index.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    return { positions, normals, uvs: null, index, material };
  });
}

const srgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const MAT = {
  frame: { name: "frame", color: srgb("#f4f4f2") },
  leaf: { name: "door", color: srgb("#b0835a") },
  glass: { name: "glass", color: srgb("#a9d4e8"), opacity: 0.3 },
  wood: { name: "wood", color: srgb("#c49a6c") },
  concrete: { name: "concrete", color: srgb("#a7a7a2") },
};

// A door / window / opening model of w × h × d cm (x width, y up, z depth).
function openingMeshes(o, w, h, d) {
  const f = Math.min(6, w / 6, h / 6);
  const hw = w / 2, hd = d / 2;
  const boxes = [];
  if (o.kind !== "opening") {
    boxes.push([-hw, -hw + f, 0, h, -hd, hd, MAT.frame], [hw - f, hw, 0, h, -hd, hd, MAT.frame], [-hw + f, hw - f, h - f, h, -hd, hd, MAT.frame]);
    if (o.kind === "window") {
      boxes.push([-hw + f, hw - f, 0, f, -hd, hd, MAT.frame], [-hw + f, hw - f, f, h - f, -0.5, 0.5, MAT.glass]);
      if (o.type !== "fixed" && w > 80) boxes.push([-f / 2, f / 2, f, h - f, -hd / 2, hd / 2, MAT.frame]);
    } else {
      const leaves = o.type === "double" ? 2 : 1;
      const lw = (w - 2 * f) / leaves;
      for (let i = 0; i < leaves; i++) boxes.push([-hw + f + i * lw + 0.3, -hw + f + (i + 1) * lw - 0.3, 0, h - f, -2, 2, o.type === "garage" ? MAT.frame : MAT.leaf]);
    }
  } else {
    // A plain opening still needs a model: a thin invisible-ish frame line.
    boxes.push([-hw, hw, h - 0.5, h, -hd, hd, MAT.frame]);
  }
  return boxMeshes(boxes);
}

function stairMeshes(s, rise) {
  const n = s.steps, L = s.length / CM, W = s.width / CM, H = rise / CM;
  const boxes = [];
  // Climbs from the front (+z) to the back, as Sweet Home 3D staircases do.
  for (let i = 0; i < n; i++) boxes.push([-W / 2, W / 2, 0, ((i + 1) * H) / n, L / 2 - ((i + 1) * L) / n, L / 2 - (i * L) / n, MAT.wood]);
  return boxMeshes(boxes);
}

// Prism of a plan polygon (mm) from z0 to z1 (mm), centred on (cx, cy).
function prismMesh(pts, z0, z1, cx, cy, material) {
  const positions = [], index = [];
  const ring = polygonArea(pts) < 0 ? pts.slice().reverse() : pts;
  const P = (x, y, z) => { positions.push((x - cx) / CM, z / CM, (y - cy) / CM); return positions.length / 3 - 1; };
  const tris = triangulate(ring);
  const top = ring.map(([x, y]) => P(x, y, z1)), bot = ring.map(([x, y]) => P(x, y, z0));
  for (const [a, b, c] of tris) { index.push(top[a], top[c], top[b]); index.push(bot[a], bot[b], bot[c]); }
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const a = P(ring[i][0], ring[i][1], z0), b = P(ring[j][0], ring[j][1], z0), c = P(ring[j][0], ring[j][1], z1), d = P(ring[i][0], ring[i][1], z1);
    index.push(a, c, b, a, d, c);
  }
  return { positions, normals: null, uvs: null, index, material };
}

// Planar faces [[x, y, z] mm] (z up) → one mesh centred on (cx, cy), z from z0.
function facesMesh(faces, cx, cy, z0, material) {
  const positions = [], index = [];
  for (const f of faces) {
    const b = positions.length / 3;
    for (const [x, y, z] of f) positions.push((x - cx) / CM, (z - z0) / CM, (y - cy) / CM);
    for (let i = 1; i + 1 < f.length; i++) index.push(b, b + i, b + i + 1);
  }
  return { positions, normals: null, uvs: null, index, material };
}

// ---------------------------------------------------------------- GLB → meshes
const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// Meshes of a GLB (as GLTFExporter writes it), baked to world space, in cm.
export function glbMeshes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  let p = 12, json = null, bin = null;
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p, true), type = dv.getUint32(p + 4, true);
    const chunk = bytes.subarray(p + 8, p + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    p += 8 + len;
  }
  if (!json) throw new Error("GLB without JSON");
  const view = (i) => { const bv = json.bufferViews[i]; return { bytes: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), stride: bv.byteStride || 0 }; };
  const accessor = (i) => {
    const a = json.accessors[i];
    const size = SIZES[a.type] || 1;
    const C = COMPONENTS[a.componentType];
    const out = new Float64Array(a.count * size);
    if (a.bufferView === undefined) return out;
    const v = view(a.bufferView);
    const stride = v.stride || C.BYTES_PER_ELEMENT * size;
    const base = a.byteOffset || 0;
    const vdv = new DataView(v.bytes.buffer, v.bytes.byteOffset, v.bytes.byteLength);
    const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < size; c++) out[k * size + c] = vdv[get](base + k * stride + c * C.BYTES_PER_ELEMENT, true);
    return out;
  };
  const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const mats = (json.materials || []).map((m, i) => {
    const pbr = m.pbrMetallicRoughness || {};
    const f = pbr.baseColorFactor || [1, 1, 1, 1];
    const out = { name: m.name || `material${i}`, color: f.slice(0, 3).map(toSrgb), opacity: m.alphaMode === "BLEND" ? f[3] : 1 };
    const ti = pbr.baseColorTexture ? json.textures[pbr.baseColorTexture.index] : null;
    const img = ti && json.images ? json.images[ti.source] : null;
    if (img && img.bufferView !== undefined) out.image = { bytes: view(img.bufferView).bytes.slice(), ext: img.mimeType === "image/jpeg" ? "jpg" : "png" };
    return out;
  });
  const meshes = [];
  const m4 = new THREE.Matrix4();
  const visit = (ni, parent) => {
    const n = json.nodes[ni];
    const local = new THREE.Matrix4();
    if (n.matrix) local.fromArray(n.matrix);
    else local.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (n.mesh !== undefined) {
      const nm = new THREE.Matrix3().getNormalMatrix(world);
      const flip = world.determinant() < 0;
      for (const pr of json.meshes[n.mesh].primitives) {
        if (pr.mode !== undefined && pr.mode !== 4) continue;
        const pos = accessor(pr.attributes.POSITION);
        const count = pos.length / 3;
        const positions = new Float32Array(pos.length);
        const v = new THREE.Vector3();
        for (let i = 0; i < count; i++) { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(world); positions[i * 3] = v.x * 100; positions[i * 3 + 1] = v.y * 100; positions[i * 3 + 2] = v.z * 100; }
        let normals = null;
        if (pr.attributes.NORMAL !== undefined) {
          const nr = accessor(pr.attributes.NORMAL);
          normals = new Float32Array(nr.length);
          for (let i = 0; i < count; i++) { v.set(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]).applyMatrix3(nm).normalize(); normals[i * 3] = v.x; normals[i * 3 + 1] = v.y; normals[i * 3 + 2] = v.z; }
        }
        let uvs = null;
        if (pr.attributes.TEXCOORD_0 !== undefined) {
          const t = accessor(pr.attributes.TEXCOORD_0);
          uvs = new Float32Array(t.length);
          for (let i = 0; i < t.length; i += 2) { uvs[i] = t[i]; uvs[i + 1] = 1 - t[i + 1]; } // glTF v runs down the image, OBJ up
        }
        let index = pr.indices !== undefined ? Uint32Array.from(accessor(pr.indices)) : Uint32Array.from({ length: count }, (_, i) => i);
        if (flip) { index = index.slice(); for (let i = 0; i + 2 < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; } }
        meshes.push({ positions, normals, uvs, index, material: mats[pr.material] || { name: "default", color: [0.8, 0.8, 0.8], opacity: 1 } });
      }
    }
    for (const c of n.children || []) visit(c, world);
  };
  const scene = json.scenes ? json.scenes[json.scene || 0] : { nodes: json.nodes.map((_, i) => i) };
  for (const ni of scene.nodes || []) visit(ni, m4);
  return meshes;
}

// ---------------------------------------------------------------- our furniture → meshes
async function furnitureMeshes(p, f) {
  const { buildBuilding, makeMaterials } = await import("../view3d/build.js");
  const mini = normalizeProject(newProject("piece"));
  mini.levels = [{ id: "lv", name: "1F", elevation: 0, height: 2800, slab: 0 }];
  mini.view.level = "lv";
  mini.materials = p.materials || [];
  mini.components = p.components || [];
  mini.furniture = [{ ...f, id: "f", level: "lv", x: 0, y: 0, rot: 0, elevation: 0, light: f.light ? { ...f.light, on: false } : f.light }];
  const root = buildBuilding(THREE, mini, makeMaterials(THREE, { textures: false }), { furniture: true, roofs: false, solids: false });
  const out = [];
  for (const m of collectMeshes(root, { scale: 100 })) {
    for (const g of m.groups) {
      const index = m.index.subarray(g.start, g.start + g.count);
      out.push({ positions: m.positions, normals: m.normals, uvs: null, index, material: { name: (g.material && g.material.name) || "material", color: meshColor(g.material), opacity: materialOpacity(g.material) } });
    }
  }
  setProjectMaterials(p.materials || []);
  return out;
}

// ---------------------------------------------------------------- ZIP (deflate where the platform can)
async function deflate(data) {
  if (typeof CompressionStream !== "function") return null;
  try {
    const s = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  } catch { return null; }
}

export async function zipDeflated(files, { date = new Date() } = {}) {
  const dt = dosDateTime(date);
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const packed = data.length > 64 ? await deflate(data) : null;
    const useDeflate = packed && packed.length < data.length;
    const body = useDeflate ? packed : data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x800, true); dv.setUint16(8, useDeflate ? 8 : 0, true);
    dv.setUint16(10, dt.time, true); dv.setUint16(12, dt.date, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, body.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(10, useDeflate ? 8 : 0, true);
    cv.setUint16(12, dt.time, true); cv.setUint16(14, dt.date, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
    if (f.name.endsWith("/")) cv.setUint32(38, 0x10, true); // directory attribute
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let q = 0;
  for (const b of [...parts, ...central, end]) { out.set(b, q); q += b.length; }
  return out;
}

// ---------------------------------------------------------------- the home
// project → { bytes (the .sh3d), xml (Home.xml text), stats, warnings }.
export async function exportSh3d(project, { name = "", onProgress = null } = {}) {
  const p = project;
  const files = [];
  const warnings = [];
  const stats = { levels: p.levels.length, walls: 0, rooms: 0, furniture: 0, doorsWindows: 0, models: 0, dimensions: 0, labels: 0, polylines: 0 };
  let entry = 0;
  const modelCache = new Map();
  // A model folder for meshes (once per key) → "N/name.obj".
  const addModel = async (key, make) => {
    if (modelCache.has(key)) return modelCache.get(key);
    const pr = (async () => {
      const meshes = await make();
      if (!meshes || !meshes.length) return null;
      const dir = `${entry++}/`;
      const base = "model";
      const { obj, mtl, images } = meshesToObj(meshes, { name: base });
      files.push({ name: dir, data: new Uint8Array(0) }, { name: `${dir}${base}.obj`, data: obj }, { name: `${dir}${base}.mtl`, data: mtl });
      for (const img of images) files.push({ name: `${dir}${img.name}`, data: img.bytes });
      stats.models++;
      return `${dir}${base}.obj`;
    })();
    modelCache.set(key, pr);
    return pr;
  };
  const texCache = new Map();
  // A texture element for a project material with an image, else null.
  const texture = (matId, attribute) => {
    const m = materialById(matId);
    if (!m || typeof m.src !== "string" || !m.src.startsWith("data:image/")) return null;
    if (!texCache.has(m.id)) {
      const nm = `${entry++}`;
      files.push({ name: nm, data: base64ToBytes(m.src) });
      texCache.set(m.id, nm);
    }
    const size = cm(m.tile || 1000);
    return tag("texture", { attribute, name: m.name || m.id, width: size, height: size, image: texCache.get(m.id) });
  };

  const levelIds = new Map(p.levels.map((l, i) => [l.id, `level${i}`]));
  const lvAttr = (id) => (p.levels.length > 1 ? levelIds.get(id) : null);
  const lvOf = (id) => levelById(p, id) || p.levels[0];
  const items = [];
  const defaultHeight = p.levels[0] ? p.levels[0].height : 2800;

  // ---- compass and levels
  const meta = p.meta || {};
  // Sweet Home 3D's own default ground, sky and lights.
  items.push(tag("environment", { groundColor: "FF6F9A4F", skyColor: "FFCCE4FC", lightColor: "FFCACACA", ceillingLightColor: "FFD0D0D0" }));
  items.push(tag("compass", { x: -100, y: 50, diameter: 100, northDirection: ang((meta.north || 0) * RAD), longitude: ang((meta.longitude || 0) * RAD), latitude: ang((meta.latitude || 0) * RAD), visible: "true" }));
  if (p.levels.length > 1) {
    p.levels.forEach((l, i) => items.push(tag("level", { id: levelIds.get(l.id), name: l.name || `Level ${i}`, elevation: cm(l.elevation), floorThickness: cm(l.slab ?? 120), height: cm(l.height), elevationIndex: 0 })));
  }

  // ---- furniture (and the other things Sweet Home 3D knows as furniture)
  const total = p.furniture.length + p.openings.length + p.stairs.length + (p.columns || []).length + (p.roofs || []).length + (p.solids || []).length;
  let done = 0;
  const step = async () => { done++; if (onProgress && done % 10 === 0) { onProgress(done / Math.max(1, total)); await new Promise((r) => setTimeout(r, 0)); } };
  const piece = (tagName, attrs, children = []) => { items.push(tag(tagName, attrs, children)); stats.furniture++; };

  for (const f of p.furniture) {
    await step();
    let model = null;
    const children = [];
    const attrs = { level: lvAttr(f.level), catalogId: f.kind === "model" ? null : `MyArchitecture#${f.kind}`, name: f.name || f.kind, x: cm(f.x), y: cm(f.y), elevation: cm(f.elevation || 0), angle: ang((f.rot || 0) * RAD), width: cm(f.w), depth: cm(f.d), height: cm(f.h) };
    try {
      if (f.kind === "model") {
        const asset = (p.models || []).find((m) => m.id === f.model);
        if (asset && asset.data) model = await addModel(`m:${asset.id}`, () => glbMeshes(base64ToBytes(asset.data)));
        if (f.mirrored) attrs.modelMirrored = "true";
        if (f.modelColors) {
          if (f.modelColors[""]) attrs.color = argb(f.modelColors[""]);
          else for (const [mn, c] of Object.entries(f.modelColors)) children.push(tag("material", { name: mn, color: argb(c) }));
        }
      } else {
        const key = JSON.stringify([f.kind, f.comp || "", f.color || "", Math.round(f.w), Math.round(f.d), Math.round(f.h)]);
        model = await addModel(key, () => furnitureMeshes(p, f));
      }
    } catch (e) {
      warnings.push(`${f.name || f.kind}: its 3D shape could not be written (${e && e.message ? e.message : e})`);
    }
    if (!model) model = await addModel("box", () => boxMeshes([[-50, 50, 0, 100, -50, 50, MAT.wood]]));
    attrs.model = model;
    if (isLight(f)) {
      piece("light", { ...attrs, power: "0.5" }, [tag("lightSource", { x: "0.5", y: "0.5", z: "0.9", color: "FFFFFFFF" }), ...children]);
    } else piece("pieceOfFurniture", attrs, children);
  }

  // ---- doors and windows
  const wallById = new Map(p.walls.map((w) => [w.id, w]));
  for (const o of p.openings) {
    await step();
    const w = wallById.get(o.wall);
    if (!w) continue;
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const dx = (w.x2 - w.x1) / L, dy = (w.y2 - w.y1) / L;
    const x = w.x1 + dx * o.at, y = w.y1 + dy * o.at;
    let angle = Math.atan2(dy, dx);
    if ((o.side ?? 1) < 0) angle += Math.PI;
    angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const W = o.width / CM, H = o.height / CM, D = w.thickness / CM;
    const kindWord = o.kind === "door" ? (o.type === "garage" ? "garage door" : o.type === "sliding" ? "sliding door" : o.type === "double" ? "double door" : "door") : o.kind === "window" ? (o.type === "fixed" ? "fixed window" : o.type === "sliding" ? "sliding window" : "window") : "door opening";
    const model = await addModel(JSON.stringify(["o", o.kind, o.type || "", Math.round(W), Math.round(H), Math.round(D)]), () => openingMeshes(o, W, H, D));
    piece("doorOrWindow", {
      level: lvAttr(w.level), catalogId: `MyArchitecture#${kindWord.replace(/ /g, "-")}`, name: o.name || kindWord.replace(/^\w/, (c) => c.toUpperCase()),
      x: cm(x), y: cm(y), elevation: cm(o.sill || 0), angle: ang(angle), width: fmt(W), depth: fmt(D), height: fmt(H),
      modelMirrored: o.hinge === "end" ? "true" : null, model, wallThickness: "1", wallDistance: "0",
    }, []);
    stats.doorsWindows++;
  }

  // ---- stairs, columns, roofs, mass models: models of their geometry
  for (const s of p.stairs) {
    await step();
    const lv = lvOf(s.level), above = levelAbove(p, s.level);
    const rise = above ? above.elevation - lv.elevation : lv.height;
    const model = await addModel(JSON.stringify(["s", s.steps, Math.round(s.length), Math.round(s.width), Math.round(rise)]), () => stairMeshes(s, rise));
    piece("pieceOfFurniture", { level: lvAttr(s.level), catalogId: "MyArchitecture#staircase", name: s.name || "Staircase", x: cm(s.x), y: cm(s.y), angle: ang(((s.rot || 0) + 90) * RAD), width: cm(s.width), depth: cm(s.length), height: cm(rise), model, movable: "false" });
  }
  for (const c of p.columns || []) {
    await step();
    const lv = lvOf(c.level);
    const H = c.height || lv.height;
    const model = await addModel("column", () => boxMeshes([[-50, 50, 0, 100, -50, 50, MAT.concrete]]));
    piece("pieceOfFurniture", { level: lvAttr(c.level), catalogId: "MyArchitecture#column", name: c.name || "Column", x: cm(c.x), y: cm(c.y), angle: ang((c.rot || 0) * RAD), width: cm(c.w), depth: cm(c.d), height: cm(H), model, movable: "false" });
  }
  for (const r of p.roofs || []) {
    await step();
    const lv = lvOf(r.level);
    let m;
    try { m = roofModel(r, roofBase(p, r)); } catch { continue; }
    const faces = [...m.faces.map((f) => f.pts), ...(m.gables || []).map((g) => g.pts)];
    const all = faces.flat();
    if (!all.length) continue;
    const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]), zs = all.map((q) => q[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    let z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (z1 - z0 < 1) { z1 += (r.thickness || 200) / 2; z0 -= (r.thickness || 200) / 2; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const color = srgb(materialColor(r.material || "roof-tiles", "#9b4a3a"));
    const model = await addModel(`roof:${r.id}`, () => [facesMesh(faces, cx, cy, z0, { name: "roof", color })]);
    piece("pieceOfFurniture", { level: lvAttr(r.level), catalogId: "MyArchitecture#roof", name: r.name || "Roof", x: cm(cx), y: cm(cy), elevation: cm(z0 - lv.elevation), width: cm(x1 - x0), depth: cm(y1 - y0), height: cm(z1 - z0), model, movable: "false" });
  }
  for (const s of p.solids || []) {
    await step();
    if (!s.pts || s.pts.length < 3) continue;
    const xs = s.pts.map((q) => q[0]), ys = s.pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const model = await addModel(`solid:${s.id}`, () => [prismMesh(s.pts, 0, s.height, cx, cy, { name: "mass", color: srgb(materialColor(s.material || "concrete", "#a7a7a2")) })]);
    piece("pieceOfFurniture", { level: lvAttr(s.level), catalogId: "MyArchitecture#mass", name: s.name || "Mass model", x: cm(cx), y: cm(cy), elevation: cm(s.z0 || 0), width: cm(Math.max(1, x1 - x0)), depth: cm(Math.max(1, y1 - y0)), height: cm(s.height), model, movable: "false" });
  }

  // ---- walls (with the joins at their ends)
  const ends = [];
  p.walls.forEach((w, i) => { ends.push({ i, end: "start", x: w.x1, y: w.y1, level: w.level }, { i, end: "end", x: w.x2, y: w.y2, level: w.level }); });
  const join = new Map();
  for (const a of ends) {
    if (join.has(`${a.i}:${a.end}`)) continue;
    const b = ends.find((e) => e.i !== a.i && e.level === a.level && !join.has(`${e.i}:${e.end}`) && Math.hypot(e.x - a.x, e.y - a.y) < 1);
    if (b) { join.set(`${a.i}:${a.end}`, b.i); join.set(`${b.i}:${b.end}`, a.i); }
  }
  p.walls.forEach((w, i) => {
    const lv = lvOf(w.level);
    const wt = w.type ? (p.wallTypes || []).find((x) => x.id === w.type) : null;
    const mat = w.material || (wt ? wt.layers[0].material : "plaster");
    const color = argb(materialColor(mat, "#ece8e1"));
    const children = [texture(mat, "leftSideTexture"), texture(mat, "rightSideTexture")].filter(Boolean);
    items.push(tag("wall", {
      id: `wall${i}`, level: lvAttr(w.level), wallAtStart: join.has(`${i}:start`) ? `wall${join.get(`${i}:start`)}` : null, wallAtEnd: join.has(`${i}:end`) ? `wall${join.get(`${i}:end`)}` : null,
      xStart: cm(w.x1), yStart: cm(w.y1), xEnd: cm(w.x2), yEnd: cm(w.y2), height: cm(w.height || lv.height), thickness: cm(w.thickness),
      leftSideColor: children.length ? null : color, rightSideColor: children.length ? null : color,
    }, children));
    stats.walls++;
  });

  // ---- rooms
  for (const r of p.rooms) {
    if (!r.pts || r.pts.length < 3) continue;
    const floor = r.floor || "oak";
    const tex = texture(floor, "floorTexture");
    const children = [...(tex ? [tex] : []), ...r.pts.map(([x, y]) => tag("point", { x: cm(x), y: cm(y) }))];
    items.push(tag("room", { level: lvAttr(r.level), name: r.name || null, areaVisible: "true", floorColor: tex ? null : argb(materialColor(floor, "#c49a6c")) }, children));
    stats.rooms++;
  }

  // ---- polylines (plan drawings)
  let skipped = 0;
  for (const d of p.drawings || []) {
    let pts = Array.isArray(d.pts) ? d.pts : null;
    if (!pts && (d.kind === "circle" || d.kind === "arc") && d.r > 0) {
      const a1 = d.kind === "circle" ? 0 : (d.a1 || 0) * RAD, a2 = d.kind === "circle" ? 2 * Math.PI : (d.a2 || 360) * RAD;
      const n = Math.max(8, Math.ceil(((a2 - a1 + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI) / (Math.PI / 18)));
      const span = ((a2 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      pts = Array.from({ length: n + 1 }, (_, k) => [d.cx + d.r * Math.cos(a1 + (span * k) / n), d.cy + d.r * Math.sin(a1 + (span * k) / n)]);
    }
    if (!pts || pts.length < 2) { skipped++; continue; }
    items.push(tag("polyline", { level: lvAttr(d.level), color: argb(d.color) || "FF000000", closedPath: d.closed || d.kind === "circle" ? "true" : null }, pts.map(([x, y]) => tag("point", { x: cm(x), y: cm(y) }))));
    stats.polylines++;
  }
  if (skipped) warnings.push(`${skipped} drawing items without points (hatches, images…) were left out`);

  // ---- dimension lines and labels
  for (const d of p.dimensions || []) {
    if (![d.x1, d.y1, d.x2, d.y2].every(Number.isFinite)) continue;
    items.push(tag("dimensionLine", { level: lvAttr(d.level), xStart: cm(d.x1), yStart: cm(d.y1), xEnd: cm(d.x2), yEnd: cm(d.y2), offset: cm(d.offset || 0) }));
    stats.dimensions++;
  }
  for (const tx of p.texts || []) {
    if (!String(tx.text || "").trim()) continue;
    items.push(`<label${lvAttr(tx.level) ? ` level='${lvAttr(tx.level)}'` : ""} x='${cm(tx.x)}' y='${cm(tx.y)}'${tx.rot ? ` angle='${ang(tx.rot * RAD)}'` : ""}>\n  ${tag("textStyle", { fontSize: cm(tx.size || 300) })}\n  <text>${escXml(tx.text)}</text>\n</label>`);
    stats.labels++;
  }

  const title = name || (meta.title || "Home");
  const xml = `<?xml version='1.0'?>\n<home version='6000' name='${escXml(/\.sh3d$/i.test(title) ? title : `${title}.sh3d`)}' camera='topCamera' wallHeight='${cm(defaultHeight)}'>\n${items.map((s) => `  ${s.replace(/\n/g, "\n  ")}`).join("\n")}\n</home>\n`;
  const zipFiles = [{ name: "Home.xml", data: xml }, ...files];
  const bytes = await zipDeflated(zipFiles);
  return { bytes, xml, stats, warnings };
}
