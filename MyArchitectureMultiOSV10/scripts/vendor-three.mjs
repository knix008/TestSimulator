// Copies three.js and the addons MyArchitecture uses from node_modules into
// src/vendor/three, rewriting the bare 'three' and '../folder/X.js' imports so
// the files load as plain browser ES modules (there is no bundler).
//
//   npm run vendor            (after changing the three version in package.json)
//
// Layout: src/vendor/three/three.module.js + three.core.js, addons/*.js flat,
// addons/libs/* (fflate, chevrotain) and addons/collada/*.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = path.join(root, "node_modules", "three");
const out = path.join(root, "src", "vendor", "three");
const jsm = path.join(pkg, "examples", "jsm");

const ADDONS = [
  "controls/OrbitControls.js",
  "exporters/GLTFExporter.js", "exporters/STLExporter.js", "exporters/OBJExporter.js", "exporters/PLYExporter.js", "exporters/USDZExporter.js",
  "loaders/GLTFLoader.js", "loaders/OBJLoader.js", "loaders/MTLLoader.js", "loaders/STLLoader.js", "loaders/PLYLoader.js",
  "loaders/ColladaLoader.js", "loaders/FBXLoader.js", "loaders/3MFLoader.js", "loaders/TDSLoader.js", "loaders/VRMLLoader.js",
  "loaders/AMFLoader.js", "loaders/TGALoader.js",
  "curves/NURBSCurve.js", "curves/NURBSUtils.js",
  "utils/BufferGeometryUtils.js", "utils/SkeletonUtils.js",
];
const SUBDIRS = { "loaders/collada": "collada" };
const LIBS = ["libs/fflate.module.js", "libs/chevrotain.module.min.js"];

function rewrite(text, depth) {
  const up = "../".repeat(depth);
  return text
    .replace(/from\s+'three'/g, `from '${up}three.module.js'`)
    .replace(/from\s+"three"/g, `from "${up}three.module.js"`)
    // ../libs/x.js → (addons)/libs/x.js
    .replace(/from\s+'\.\.\/libs\/([^']+)'/g, (_, f) => `from '${depth === 1 ? "./" : "../"}libs/${f}'`)
    // ../loaders/X.js, ../utils/X.js, ../curves/X.js → flat addons folder
    .replace(/from\s+'\.\.\/(?:loaders|utils|curves|exporters|controls)\/([^'/]+)'/g, (_, f) => `from '${depth === 1 ? "./" : "../"}${f}'`)
    .replace(/from\s+'\.\/collada\/([^']+)'/g, (_, f) => `from './collada/${f}'`);
}

fs.mkdirSync(path.join(out, "addons", "libs"), { recursive: true });
for (const f of ["three.module.js", "three.core.js"]) fs.copyFileSync(path.join(pkg, "build", f), path.join(out, f));
fs.copyFileSync(path.join(pkg, "LICENSE"), path.join(out, "LICENSE"));
for (const f of ADDONS) {
  const text = fs.readFileSync(path.join(jsm, f), "utf8");
  fs.writeFileSync(path.join(out, "addons", path.basename(f)), rewrite(text, 1));
}
for (const [from, to] of Object.entries(SUBDIRS)) {
  fs.mkdirSync(path.join(out, "addons", to), { recursive: true });
  for (const f of fs.readdirSync(path.join(jsm, from))) {
    const text = fs.readFileSync(path.join(jsm, from, f), "utf8");
    fs.writeFileSync(path.join(out, "addons", to, f), rewrite(text, 2));
  }
}
for (const f of LIBS) fs.copyFileSync(path.join(jsm, f), path.join(out, "addons", "libs", path.basename(f)));

// Every relative import must now resolve inside src/vendor/three.
let bad = 0;
for (const dir of [path.join(out, "addons"), path.join(out, "addons", "collada")]) {
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of text.matchAll(/^\s*(?:import|export)[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (!spec.startsWith(".")) { console.error(`vendor: bare import ${spec} in ${f}`); bad++; continue; }
      if (!fs.existsSync(path.resolve(dir, spec))) { console.error(`vendor: missing ${spec} from ${f}`); bad++; }
    }
  }
}
const version = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8")).version;
console.log(`vendor: three ${version}, ${ADDONS.length} addons, collada, ${LIBS.length} libs -> src/vendor/three${bad ? ` (${bad} unresolved imports)` : ""}`);
process.exit(bad ? 1 : 0);
