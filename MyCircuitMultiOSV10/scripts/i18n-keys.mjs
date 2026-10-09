// Lists every string passed to t("...") in src/ (plus symbol titles and
// categories, which the UI translates too) and reports the ones missing from
// src/ui/i18n-ko.js.
//   node scripts/i18n-keys.mjs            → missing keys
//   node scripts/i18n-keys.mjs --all      → all keys (JSON)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "vendor" ? [] : walk(p);
    return p.endsWith(".js") ? [p] : [];
  });
}

export async function collectKeys() {
  const keys = new Set();
  const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of walk(path.join(root, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  // Tool, command and menu labels are passed through t(c.label) etc.
  const app = fs.readFileSync(path.join(root, "src/ui/app.js"), "utf8");
  for (const m of app.matchAll(/C\("[\w.]+",\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  for (const m of app.matchAll(/^\s{6}(\w+): \[/gm)) keys.add(m[1]);
  for (const f of ["src/sch/editor.js", "src/pcb/editor.js"]) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of text.matchAll(/(?:label|hint): "((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  const dialogs = fs.readFileSync(path.join(root, "src/ui/dialogs.js"), "utf8");
  const sc = dialogs.slice(dialogs.indexOf("const SHORTCUTS"), dialogs.indexOf("export function shortcuts"));
  for (const m of sc.matchAll(/\["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\]/g)) keys.add(m[2]);
  for (const m of sc.matchAll(/\["(\w+)", \[\[/g)) keys.add(m[1]);
  const start = fs.readFileSync(path.join(root, "src/ui/start.js"), "utf8");
  for (const m of start.slice(start.indexOf("const TIPS"), start.indexOf("];")).matchAll(/"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
  const v3d = fs.readFileSync(path.join(root, "src/ui/view3dtab.js"), "utf8");
  for (const m of v3d.matchAll(/\["\w+", "(\w+)", "\d"\]/g)) keys.add(m[1]);
  // Column headers translated as [..].map((x) => h("th", {}, t(x))) and 3D toggles.
  for (const file of walk(path.join(root, "src/ui"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\[((?:"[^"]*",\s*)+"[^"]*")\]\.map\(\(\w+\) => h\("th", \{\}, t\(\w+\)\)\)/g)) {
      for (const s of m[1].matchAll(/"([^"]*)"/g)) keys.add(s[1]);
    }
    for (const m of text.matchAll(/tog\("\w+", "\w+", "([^"]+)"\)/g)) keys.add(m[1]);
    if (file.endsWith("view3dtab.js")) for (const m of text.matchAll(/\["\w+", "([A-Z][^"]+)"\](?=[,\]])/g)) keys.add(m[1]);
  }
  const { allSymbols } = await import(pathToFileURL(path.join(root, "src/lib/symbols.js")).href);
  for (const s of allSymbols()) { keys.add(s.title); keys.add(s.category); }
  for (const k of ["parts", "wires", "buses", "junctions", "labels", "noconnects", "texts"]) keys.add(k);
  return [...keys].filter(Boolean).sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = await collectKeys();
  const { KO } = await import(pathToFileURL(path.join(root, "src/ui/i18n-ko.js")).href);
  if (process.argv.includes("--all")) console.log(JSON.stringify(keys, null, 1));
  else {
    const missing = keys.filter((k) => !(k in KO));
    console.log(JSON.stringify(missing, null, 1));
    console.error(`${keys.length} keys, ${missing.length} missing`);
  }
}
