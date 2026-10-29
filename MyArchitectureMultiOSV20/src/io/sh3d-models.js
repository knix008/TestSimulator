// The 3D models packed inside a Sweet Home 3D file, turned into our project
// model assets (src/io/models3d.js: metres, Y up, baked to a GLB).
//
// A .sh3d archive stores each piece's model under a numbered entry: either a
// single file ("12" — an OBJ, COLLADA, 3DS or glTF file, sometimes a ZIP) or a
// folder ("12/chair.obj" with its .mtl and texture images next to it). The
// piece in Home.xml names the entry (model='12/chair.obj') and how to show it:
// modelRotation (a 3×3 matrix applied before the model is fitted to the
// piece's box), modelMirrored (flipped along its width), and colour /
// texture / per-material overrides (color, texture, <material>, shininess).
// Sweet Home 3D fits the turned model's bounding box to width × depth ×
// height centred on the piece, exactly like our model furniture, so the asset
// is baked at the first piece's size and every other piece scales it.
// Mirroring and colour overrides stay on the furniture item (`mirrored`,
// `modelColors`), so pieces differing only by those share one asset; textures
// and the model rotation are baked.
//
// OBJ files often use the Java 3D default material names (flyellow, bone2…)
// without any .mtl; those colours are filled in from the table below.
// Textures are decoded only where there is a DOM (the app); in Node the
// models come in untextured.

import * as THREE from "../vendor/three/three.module.js";
import { isZip, zipEntries, zipEntryData } from "./unzip.js";
import { loadModelFile } from "./models3d.js";
import { kids, numAttr, argbToHex } from "./bimkit.js";
import { uid } from "../core/geom.js";

// Java 3D's default OBJ materials (com.sun.j3d.loaders.objectfile.DefaultMaterials,
// BSD licence), which Sweet Home 3D also accepts: name, diffuse colour,
// specular colour (- = none), shininess and, for a few, the transparency.
const DEFAULT_MATERIAL_TABLE = `
  amber 934400 4d4d4d 60 | amber_trans 934400 4d4d4d 60 0.84 | charcoal 010101 4d4d4d 60 | lavendar 381758 4d4d4d 60 | navy_blue 00000e 303030 91 | pale_green 12610c 303030 91
  pale_pink a7346a 303030 91 | pale_yellow b09e33 303030 91 | peach a22f04 303030 91 | periwinkle 000ad3 303030 91 | redwood 420800 303030 91 | smoked_glass 010101 303030 91 0.98
  aqua_filter 5fab94 303030 91 0.98 | yellow_green 306800 303030 91 | bluetint 0cb5f4 515151 60 0.57 | plasma ff1472 4d4d4d 60 0.75 | emerald 0cff00 333333 60 0.75 | ruby ff0000 333333 60 0.75
  sapphire 0600ff 333333 60 0.75 | white ffffff 4d4d4d 60 | red c50000 e20000 136 | blue_pure 0000ff 000080 66 | lime 00ff00 008000 66 | green 004000 004000 66
  yellow ffaa00 ffaa00 66 | purple 8000ff 8000ff 66 | orange ff2b00 ff2b00 66 | grey 2f2f2f 808080 66 | rubber 030303 1a1a1a 66 | flaqua 008080 - 0
  flblack 010101 - 0 | flblue_pure 0000b5 - 0 | flgrey 808080 - 0 | fllime 00ff00 - 0 | florange ff2b00 - 0 | flpurple 6000c0 - 0
  flred ff0000 - 0 | flyellow ffaa00 - 0 | pink fc2bab bd4c4c 106 | flbrown 1c0300 - 0 | brown 160400 2a0600 66 | glass 7c7d87 a3b1e6 200
  flesh 866956 4d4d4d 60 | aqua 008080 919191 60 | black 010101 848484 157 | silver 9d9d9d 4d4d4d 60 | dkblue_pure 000022 000091 66 | fldkblue_pure 000022 - 0
  dkgreen 010600 000c00 60 | dkgrey 0c0c0c 4d4d4d 60 | ltbrown 471d0e 4d1f0f 60 | fldkgreen 010600 - 0 | flltbrown 471d0e - 0 | tan a98538 806937 60
  fltan a97421 - 0 | brzskin 614a36 4d4d4d 25 | lips ec434a 4d4d4d 25 | redorange c10500 78522b 133 | blutan 144234 252519 25 | bluteal 144234 252519 25
  pinktan af4237 252519 25 | brnhair 170803 211509 60 | blondhair 92540b c67517 5 | flblonde 92540b - 0 | yelloworng e23f00 4d4d4d 60 | bone e6c26d e4c28c 200
  teeth fbcb78 - 0 | brass 7a3200 949494 135 | dkred 3a0000 3f0000 60 | taupe 341f1b 4d4d4d 85 | dkteal 00110b 4d4d4d 55 | dkdkgrey 030303 4d4d4d 60
  dkblue 00010f 4d4d4d 60 | gold ff7d00 b75e5e 123 | redbrick 540a02 - 0 | flmustard e35a02 - 0 | flpinegreen 1b3716 - 0 | fldkred 3a0202 - 0
  fldkgreen2 061201 - 0 | flmintgreen 214a2b - 0 | olivegreen 060900 3a471e 98 | skin 1c0804 4d4d4d 18 | redbrown 480200 5f5f5f 141 | deepgreen 000501 4d4d4d 113
  flltolivegreen 0a0e03 - 0 | jetflame f37e19 da8500 133 | brownskn 050200 130d08 20 | greenskn 001300 0c1f17 47 | ltgrey 626262 808080 66 | bronze 110903 140a00 137
  bone1 fbcb78 - 0 | flwhite1 ffffff - 0 | flwhite fbedd6 ceba92 200 | shadow 090605 - 0 0.75 | fldkolivegreen 040501 - 0 | fldkdkgrey 030303 - 0
  lcdgreen 96ff81 4d4d4d 60 | brownlips 24110a 4d4d4d 25 | muscle 6b1216 1e1e1e 26 | flltgrey d2d2d2 - 0 | offwhite.warm d5b072 4d4d4d 60 | offwhite.cool d5ae91 4d4d4d 60
  yellowbrt ffc800 4d4d4d 60 | chappie 952e09 4d4d4d 60 | archwhite fefefe - 0 | archwhite2 d6d6d6 - 0 | lighttan b36b38 d3cd95 178 | lighttan2 503019 d3cd95 178
  lighttan3 2e1504 d3cd95 178 | lightyellow fff356 ffe700 178 | lighttannew c99b52 d3cd95 178 | default b5b3a7 4d4d4d 128 | ship2 ffffff 1d1d1d 60 | dkpurple 06000c 200041 66
  dkorange b60900 b51600 66 | mintgrn 067a15 067a15 66 | fgreen 000b00 021200 106 | glassblutint 8eccc5 cbf8eb 60 0.33 | bflesh 060201 0e0c04 20 | meh 8eccc5 cbf8eb 184 0.75
  violet 070722 3a74a9 97 | iris 000f51 cdad26 188 | blugrn 15a347 252519 25 | glasstransparent 787878 9b9b9b 200 0.75 | fleshtransparent b04b21 bc7676 6 0.75 | fldkgrey 181818 - 0
  sky_blue 2097cc 0c0c0c 14 | fldkpurple 290055 - 14 | dkbrown 020100 3c372e 60 | bone2 fbdca6 - 0 | bluegrey 30474a 4d4d4d 15 | metal e6c26d e4e1dd 200
  sand_stone 201d19 3c372e 60 | hair 000000 - 60`;

const DEFAULT_MATERIALS = new Map(DEFAULT_MATERIAL_TABLE.split("|").map((s) => s.trim().split(/\s+/)).filter((a) => a.length >= 4).map(([name, kd, ks, ns, tr]) => [name, { kd, ks: ks === "-" ? null : ks, ns: +ns, transparency: tr ? +tr : 0 }]));

const rgb01 = (hex) => [0, 2, 4].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4)).join(" ");

// MTL text for those of `names` that are Java 3D default materials.
export function defaultMtl(names) {
  const out = [];
  for (const n of names) {
    const m = DEFAULT_MATERIALS.get(n);
    if (!m) continue;
    out.push(`newmtl ${n}`, `Kd ${rgb01(m.kd)}`, `Ka ${rgb01(m.kd)}`);
    if (m.ks) out.push(`Ks ${rgb01(m.ks)}`, `Ns ${m.ns}`);
    if (m.transparency) out.push(`d ${+(1 - m.transparency).toFixed(3)}`);
    out.push("");
  }
  return out.join("\n");
}

export const isDefaultMaterial = (name) => DEFAULT_MATERIALS.has(name);

// ---------------------------------------------------------------- archive lookups
const decodeName = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const normPath = (s) => String(s || "").replace(/\\/g, "/").replace(/^\.?\//, "");

export class Sh3dArchive {
  constructor(bytes) {
    this.bytes = bytes;
    this.entries = zipEntries(bytes);
    this.byName = new Map();
    this.byLower = new Map();
    for (const e of this.entries) { this.byName.set(e.name, e); this.byLower.set(e.name.toLowerCase(), e); }
    this.cache = new Map();
  }

  // The entry for a path as Home.xml writes it (URL-encoded or not).
  find(path) {
    const p = normPath(path);
    for (const k of [p, decodeName(p), normPath(decodeName(p))]) {
      if (this.byName.has(k)) return this.byName.get(k);
      if (this.byLower.has(k.toLowerCase())) return this.byLower.get(k.toLowerCase());
    }
    return null;
  }

  has(path) { return !!this.find(path); }

  async read(path) {
    const e = this.find(path);
    if (!e) return null;
    if (!this.cache.has(e.name)) this.cache.set(e.name, zipEntryData(this.bytes, e));
    return this.cache.get(e.name);
  }
}

const dirOf = (p) => { const i = p.lastIndexOf("/"); return i >= 0 ? p.slice(0, i + 1) : ""; };
const extOf = (p) => { const m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ""; };
const latin1 = new TextDecoder("latin1");
function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return latin1.decode(bytes); }
}

// What kind of model a single-file entry holds, from its first bytes.
export function sniffModel(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) return "glb";
  if (isZip(bytes)) return "zip";
  if (bytes[0] === 0x4d && bytes[1] === 0x4d) return "3ds";
  const head = latin1.decode(bytes.subarray(0, 4096));
  if (/<COLLADA[\s>]/.test(head)) return "dae";
  if (/^\s*\{/.test(head) && /"asset"/.test(head)) return "gltf";
  if (/^\s*(?:v|vn|vt|f|g|o|usemtl|mtllib)\s/m.test(head) || /^\s*#/.test(head)) return "obj";
  return null;
}

const MODEL_EXTS = ["obj", "dae", "3ds", "glb", "gltf"];

// → { archive, path, ext, bytes } of the model file a piece names, or null.
async function locateModel(archive, path, depth = 0) {
  const e = archive.find(path);
  if (!e) return null;
  const bytes = await archive.read(e.name);
  const ext = MODEL_EXTS.includes(extOf(e.name)) ? extOf(e.name) : sniffModel(bytes);
  if (ext === "zip" && depth < 2) {
    // A model packed as a ZIP of its own (KMZ, or a model folder zipped).
    const inner = new Sh3dArchive(bytes);
    const main = inner.entries.find((x) => /\.(obj|dae|3ds|glb|gltf)$/i.test(x.name) && !x.name.startsWith("__MACOSX"));
    return main ? locateModel(inner, main.name, depth + 1) : null;
  }
  if (!ext || ext === "zip") return null;
  return { archive, path: e.name, ext, bytes };
}

// ---------------------------------------------------------------- textures
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
}

const canDecodeImages = () => typeof document !== "undefined" && typeof Image !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";

// ---------------------------------------------------------------- the loader
export class Sh3dModels {
  // textures: decode texture images (only possible with a DOM);
  // glb: bake each asset to a GLB (false in tests).
  constructor(archive, { textures = canDecodeImages(), glb = true, maxTextureSize = 1024 } = {}) {
    this.archive = archive;
    this.textures = textures && canDecodeImages();
    this.glb = glb;
    this.maxTextureSize = maxTextureSize;
    this.assets = new Map(); // key → Promise<asset>
    this.images = new Map(); // archive path → Promise<HTMLImageElement|null>
    this.stats = { assets: 0, failed: 0, textures: 0 };
    this.warnings = new Set();
  }

  // Asset for a piece element (Home.xml pieceOfFurniture / light …), shared
  // between pieces showing the same model the same way; throws when the
  // model is missing or unreadable.
  async assetFor(el, { name = "" } = {}) {
    const key = pieceModelKey(el);
    if (!this.assets.has(key)) {
      const pr = this.load(el, name).then((asset) => { this.stats.assets++; return asset; });
      pr.catch(() => { this.stats.failed++; });
      this.assets.set(key, pr);
    }
    return this.assets.get(key);
  }

  async load(el, name) {
    const a = el.attrs;
    const src = await locateModel(this.archive, a.model);
    if (!src) throw new Error(`model entry "${a.model}" is missing or of an unknown kind`);
    const opts = { glb: this.glb, maxTextureSize: this.maxTextureSize, weld: true };
    // Model rotation (row-major 3×3).
    const pre = new THREE.Matrix4();
    const r = String(a.modelRotation || "").trim().split(/[\s,]+/).map(Number);
    if (r.length === 9 && r.every(Number.isFinite)) pre.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
    // Mirroring is not baked: the furniture item carries `mirrored` (build.js flips the instance).
    opts.pre = pre;
    const w = numAttr(el, "width", 50) * 10, d = numAttr(el, "depth", 50) * 10, h = numAttr(el, "height", 50) * 10;
    opts.fit = [Math.max(1, w), Math.max(1, d), Math.max(1, h)];
    const file = { name: `${baseName(name || a.name || "model")}.${src.ext}`, bytes: src.bytes };
    const maps = new Map(); // material name → texture
    if (src.ext === "obj") {
      const obj = await this.prepareObj(src);
      opts.mtlText = obj.mtlText;
      for (const [mat, path] of obj.maps) { const tex = await this.texture(src.archive, path); if (tex) maps.set(mat, tex); }
    }
    opts.materialHook = await this.hookFor(el, maps);
    const res = await loadModelFile(file, opts);
    return { id: uid("m"), name: res.name || baseName(a.name || "model"), format: src.ext, size: res.size, outline: res.outline, data: res.data, source: "sh3d" };
  }

  // The OBJ's material libraries (next to it in the archive) plus the Java 3D
  // defaults it uses; texture maps are taken out and applied by the hook.
  async prepareObj(src) {
    const text = decodeText(src.bytes);
    const dir = dirOf(src.path);
    let mtl = "";
    for (const m of text.matchAll(/^[ \t]*mtllib[ \t]+(.+?)[ \t]*$/gm)) {
      const whole = m[1];
      const names = src.archive.has(dir + whole) ? [whole] : whole.split(/\s+/);
      for (const n of names) {
        const bytes = await src.archive.read(dir + n);
        if (bytes) mtl += `${decodeText(bytes)}\n`;
      }
    }
    const defined = new Set([...mtl.matchAll(/^[ \t]*newmtl[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]));
    const used = new Set([...text.matchAll(/^[ \t]*usemtl[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]));
    mtl += defaultMtl([...used].filter((n) => !defined.has(n)));
    const maps = new Map();
    let current = null;
    for (const line of mtl.split(/\r?\n/)) {
      const t = line.trim();
      const nm = /^newmtl\s+(.+)$/.exec(t);
      if (nm) { current = nm[1]; continue; }
      const mk = /^map_Kd\s+(.+)$/i.exec(t);
      if (mk && current) {
        // Options (-s 1 1 1, -o …) come before the file name, which may hold spaces.
        const parts = mk[1].split(/\s+/);
        let i = 0;
        while (i < parts.length && parts[i].startsWith("-")) i += /^-(?:s|o|t)$/.test(parts[i]) ? 4 : /^-(?:mm)$/.test(parts[i]) ? 3 : 2;
        const file = parts.slice(i).join(" ");
        if (file) maps.set(current, src.archive.has(dir + file) ? dir + file : src.archive.has(file) ? file : dir + file.split(/[\\/]/).pop());
      }
    }
    const mtlText = mtl.replace(/^[ \t]*(?:map_\w+|bump|disp|decal|refl)\b.*$/gim, "") || "# no materials\n";
    return { mtlText, maps };
  }

  // A texture of an archive image, or null (no DOM, missing or undecodable).
  async texture(archive, path) {
    if (!this.textures || !path) return null;
    const k = `${archive === this.archive ? "" : "inner:"}${path}`;
    if (!this.images.has(k)) {
      this.images.set(k, (async () => {
        const bytes = await archive.read(path);
        if (!bytes) return null;
        const type = sniffImage(bytes) || MIME[extOf(path)] || "image/png";
        const url = URL.createObjectURL(new Blob([bytes], { type }));
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          img.userData = { mimeType: type === "image/jpeg" ? "image/jpeg" : "image/png" };
          return img;
        } catch {
          this.warnings.add("Some textures of the 3D models could not be decoded and were left out.");
          return null;
        } finally { URL.revokeObjectURL(url); }
      })());
    }
    const img = await this.images.get(k);
    if (!img) return null;
    this.stats.textures++;
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.userData.mimeType = img.userData.mimeType;
    tex.needsUpdate = true;
    return tex;
  }

  // "#rrggbb" average of an image (where images decode), else null.
  async averageColor(bytes, type) {
    if (!this.textures) return null;
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 8;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data;
      let r = 0, gr = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return `#${[r, gr, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("")}`;
    } catch { return null; } finally { URL.revokeObjectURL(url); }
  }

  // materialHook for loadModelFile: two-sided like Sweet Home 3D, MTL
  // textures, and the piece's texture / per-material texture overrides.
  // Colour overrides are not baked: they go on the furniture item
  // (modelColors) so pieces that differ only in colour share one asset.
  async hookFor(el, maps) {
    const a = el.attrs;
    const pieceTex = kids(el, "texture").find((t) => !t.attrs.attribute || t.attrs.attribute === "texture");
    const texture = pieceTex && !argbToHex(a.color) ? await this.texture(this.archive, pieceTex.attrs.image) : null;
    const overrides = [];
    for (const m of kids(el, "material")) {
      const tx = kids(m, "texture")[0];
      overrides.push({ name: m.attrs.name, key: m.attrs.key, color: argbToHex(m.attrs.color), shininess: numAttr(m, "shininess"), texture: tx ? await this.texture(this.archive, tx.attrs.image) : null, textured: !!tx });
    }
    const shininess = numAttr(el, "shininess");
    return (mat) => {
      const m = mat.clone();
      m.side = THREE.DoubleSide;
      const own = maps.get(mat.name);
      if (own) { m.map = own; m.needsUpdate = true; }
      const setTexture = (tex) => { m.map = tex; if (m.color) m.color.set(0xffffff); m.needsUpdate = true; };
      if (texture) setTexture(texture);
      else {
        const o = overrides.find((x) => x.name === mat.name || (x.key && x.key === mat.name));
        if (o) {
          if (o.texture && !o.color) setTexture(o.texture);
          if (o.shininess !== null && "shininess" in m) m.shininess = o.shininess * 128;
        }
      }
      if (shininess !== null && "shininess" in m) m.shininess = shininess * 128;
      return m;
    };
  }
}

const baseName = (s) => String(s || "model").split(/[\\/]/).pop().replace(/\.[^.]+$/, "").trim() || "model";

// What makes two pieces show the same baked model.
export function pieceModelKey(el) {
  const a = el.attrs;
  const mats = kids(el, "material").filter((m) => !m.attrs.color).map((m) => [m.attrs.name, m.attrs.key || "", m.attrs.shininess || "", (kids(m, "texture")[0] || { attrs: {} }).attrs.image || ""]).filter((m) => m[2] || m[3]);
  const tex = kids(el, "texture").find((t) => !t.attrs.attribute || t.attrs.attribute === "texture");
  return JSON.stringify([a.model, a.modelRotation || "", tex && !a.color ? tex.attrs.image : "", a.shininess || "", mats]);
}

// The piece's colour overrides for the furniture item (see recolorModel in
// src/view3d/build.js): {"": colour of the whole piece} or {material: colour}.
export function pieceModelColors(el) {
  const all = argbToHex(el.attrs.color);
  if (all) return { "": all };
  const out = {};
  for (const m of kids(el, "material")) { const c = argbToHex(m.attrs.color); if (c && m.attrs.name) out[m.attrs.name] = c; }
  return Object.keys(out).length ? out : null;
}
