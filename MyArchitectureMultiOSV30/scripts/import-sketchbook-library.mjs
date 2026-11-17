// Brings MySketchBook's parametric furniture library (src/library/parametric:
// ~2,100 items built in code with three.js) into this app:
//
//   node scripts/import-sketchbook-library.mjs [path/to/MySketchBookMultiOSV10]
//
//   src/lib/sketchbook/*.js            the builders, copied as they are (imports pointed at src/vendor/three)
//   src/lib/sketchbook/index.js        SB_ITEMS (doors, windows and structure left out: this app has its own)
//   src/vendor/three/addons/RoundedBoxGeometry.js
//   src/lib/catalog/sketchbook.js      the catalogue data: kind "sb-<id>", category, name, size (mm), mount
//   src/ui/i18n-ko-sketchbook.js       the Korean names
//
// The catalogue needs no three.js: the 3D view loads the builders when an item
// is shown (src/view3d/sbitems.js). Run again after the library changes there.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sb = path.resolve(process.argv[2] || path.join(root, "..", "MySketchBookMultiOSV10"));
const srcDir = path.join(sb, "src", "library", "parametric");
const dst = path.join(root, "src", "lib", "sketchbook");
if (!fs.existsSync(srcDir)) { console.error(`no MySketchBook library at ${srcDir}`); process.exit(1); }

// Doors, windows and stairs / structure are building elements here (walls' openings, stairs), not furniture.
const SKIP_FILES = new Set(["index.js"]);
const SKIP_CATS = new Set(["doors", "windows", "structure"]);
// MySketchBook category → this app's.
const CAT = {
  living: "Living", dining: "Dining", bedroom: "Bedroom", kitchen: "Kitchen", appliances: "Electronics", bathroom: "Bathroom",
  office: "Office", workplace: "Office", officeprops: "Office", computer: "Electronics", serverroom: "Office", security: "Building",
  kids: "Kids", storage: "Storage", lighting: "Lighting", decor: "Decor", accessories: "Decor", plants: "Plants", outdoor: "Outdoor", landscape: "Outdoor",
};

// ---------------------------------------------------------------- 1. the builders
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
const rewrite = (text) => text
  .replace(/from ['"]three['"]/g, "from '../../vendor/three/three.module.js'")
  .replace(/['"]three\/examples\/jsm\/utils\/BufferGeometryUtils\.js['"]/g, "'../../vendor/three/addons/BufferGeometryUtils.js'")
  .replace(/['"]three\/examples\/jsm\/geometries\/RoundedBoxGeometry\.js['"]/g, "'../../vendor/three/addons/RoundedBoxGeometry.js'")
  .replace(/['"]\.\.\/\.\.\/engine\//g, "'./engine/"); // structure.js: MySketchBook's stairs.js (copied below)
const modules = [];
for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith(".js")).sort()) {
  if (SKIP_FILES.has(f)) continue;
  const text = fs.readFileSync(path.join(srcDir, f), "utf8");
  fs.writeFileSync(path.join(dst, f), `// Copied from MySketchBook (src/library/parametric/${f}) by scripts/import-sketchbook-library.mjs: change it there.\n${rewrite(text)}`);
  if (/export const ITEMS\b/.test(text)) modules.push(f);
}
// structure.js (stairs among the parametric items) needs MySketchBook's stairs.js, and that its document.js (pure).
fs.mkdirSync(path.join(dst, "engine"), { recursive: true });
for (const f of ["stairs.js", "document.js"]) {
  fs.writeFileSync(path.join(dst, "engine", f), `// Copied from MySketchBook (src/engine/${f}) by scripts/import-sketchbook-library.mjs: change it there.\n${fs.readFileSync(path.join(sb, "src", "engine", f), "utf8")}`);
}
const rb = fs.readFileSync(path.join(sb, "node_modules", "three", "examples", "jsm", "geometries", "RoundedBoxGeometry.js"), "utf8");
fs.writeFileSync(path.join(root, "src", "vendor", "three", "addons", "RoundedBoxGeometry.js"), rb.replace(/from ['"]three['"]/g, "from '../three.module.js'"));
const ident = (f) => `m_${f.replace(/\.js$/, "").replace(/[^a-z0-9]/gi, "_")}`;
fs.writeFileSync(path.join(dst, "index.js"), `// MySketchBook's parametric items (written by scripts/import-sketchbook-library.mjs).
// SB_ITEMS: every item but doors, windows and structure; sbItem(id) finds one.
${modules.map((f) => `import { ITEMS as ${ident(f)} } from './${f}';`).join("\n")}

const SKIP = new Set(${JSON.stringify([...SKIP_CATS])});
const seen = new Set();
export const SB_ITEMS = [${modules.map(ident).map((x) => `...${x}`).join(", ")}].filter((it) => !SKIP.has(it.category) && !seen.has(it.id) && seen.add(it.id));
const byId = new Map(SB_ITEMS.map((it) => [it.id, it]));
export const sbItem = (id) => byId.get(id) || null;
`);

// ---------------------------------------------------------------- 2. the catalogue data (sizes measured from a default build)
const { SB_ITEMS } = await import(pathToFileURL(path.join(dst, "index.js")).href);
const mm = (v) => Math.max(10, Math.round(v * 1000));
const out = [], ko = {};
const t0 = Date.now();
for (const it of SB_ITEMS) {
  const cat = CAT[it.category];
  if (!cat) { console.warn(`no category for ${it.id} (${it.category})`); continue; }
  const [x, y, z] = it.size;
  const e = { kind: `sb-${it.id}`, cat, name: it.en, w: mm(x), d: mm(z), h: mm(y) };
  if (it.placement === "wall") { e.mount = "wall"; e.elev = Math.round((it.elevation || 0) * 1000); }
  else if (it.placement === "ceiling") e.mount = "ceiling";
  else if (it.placement === "surface") e.mount = "surface";
  if (it.tags && it.tags.length) e.tags = it.tags.join(" ");
  out.push(e);
  if (it.ko && it.en && !(it.en in ko)) ko[it.en] = it.ko;
}
console.log(`${out.length} items measured in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
fs.writeFileSync(path.join(root, "src", "lib", "catalog", "sketchbook.js"), crlf(`// MySketchBook's parametric items as catalogue entries (written by
// scripts/import-sketchbook-library.mjs): kind "sb-<id>", size in mm from a
// default build. The plan draws their outline; the 3D view builds them with
// MySketchBook's own code (src/lib/sketchbook, src/view3d/sbitems.js).
export const SB_ENTRIES = [
${out.map((e) => `  ${JSON.stringify(e)},`).join("\n")}
];
`));
ko.Storage = "수납";
fs.writeFileSync(path.join(root, "src", "ui", "i18n-ko-sketchbook.js"), crlf(`// Korean names of MySketchBook's items (written by scripts/import-sketchbook-library.mjs).
export const KO_SKETCHBOOK = ${JSON.stringify(ko, null, 0).replace(/","/g, "\",\n  \"").replace(/^\{"/, "{\n  \"").replace(/"\}$/, "\",\n}")};
`));
const cats = {};
for (const e of out) cats[e.cat] = (cats[e.cat] || 0) + 1;
console.log(JSON.stringify(cats));
