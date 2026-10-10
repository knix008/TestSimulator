// Lists every string the UI translates — t("...") calls in src/ plus command
// labels, menu names, tool labels/hints, shortcut table, tips, furniture and
// material names, model-check messages and format tables — and reports the
// ones missing from src/ui/i18n-ko.js.
//   node scripts/i18n-keys.mjs            → missing keys
//   node scripts/i18n-keys.mjs --all      → all keys (JSON)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "vendor" ? [] : walk(p);
    return p.endsWith(".js") ? [p] : [];
  });
}

const unq = (s) => JSON.parse(`"${s}"`);

export async function collectKeys() {
  const keys = new Set();
  const re = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of walk(path.join(root, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) keys.add(unq(m[1]));
  }
  const app = read("src/ui/app.js");
  for (const m of app.matchAll(/C\("[\w.]+",\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  const menus = app.slice(app.indexOf("const M = {"), app.indexOf("this.menuMap"));
  for (const m of menus.matchAll(/^\s{6}"?([\w ]+)"?: \[/gm)) keys.add(m[1]);
  const editor = read("src/plan/editor.js");
  const tools = editor.slice(editor.indexOf("PLAN_TOOLS"), editor.indexOf("export function parseLength"));
  for (const m of tools.matchAll(/(?:label|hint): "((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  const dialogs = read("src/ui/dialogs.js");
  const sc = dialogs.slice(dialogs.indexOf("const SHORTCUTS"), dialogs.indexOf("export function shortcuts"));
  for (const m of sc.matchAll(/\["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\]/g)) keys.add(unq(m[2]));
  for (const m of sc.matchAll(/\["([\w ]+)", \[\[/g)) keys.add(m[1]);
  // Arrays translated with .map((x) => …t(x)) — room names, table headers.
  for (const file of walk(path.join(root, "src/ui"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\[((?:"[^"]*",\s*)+"[^"]*")\]\.map\(\((\w+)\) => [^)]*t\(\2\)/g)) for (const s of m[1].matchAll(/"([^"]*)"/g)) if (s[1]) keys.add(s[1]);
    for (const m of text.matchAll(/\[((?:"[^"]*",\s*)+"[^"]*")\]\.map\(\((\w+)\) => h\("th", \{\}, (?:\2 \? )?t\(\2\)/g)) for (const s of m[1].matchAll(/"([^"]*)"/g)) if (s[1]) keys.add(s[1]);
  }
  const fm = dialogs.slice(dialogs.indexOf("export const FORMATS"), dialogs.indexOf("export function formatsDialog"));
  for (const m of fm.matchAll(/\["([^"]+)", "[^"]*", "[^"]*", "[^"]*", "([^"]+)"\]/g)) { keys.add(m[1]); keys.add(m[2]); }
  const start = read("src/ui/start.js");
  for (const m of start.slice(start.indexOf("const TIPS"), start.indexOf("];")).matchAll(/"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  const v3d = read("src/ui/view3dtab.js");
  for (const m of v3d.matchAll(/\["\w+", "([^"]+)", "\d"\]/g)) keys.add(m[1]);
  for (const m of v3d.slice(v3d.indexOf("const STYLES"), v3d.indexOf("export class")).matchAll(/\["\w+", "([^"]+)"\]/g)) keys.add(m[1]);
  for (const m of v3d.matchAll(/(?:tog|nav)\("\w+", "\w+", "([^"]+)"\)/g)) keys.add(m[1]);
  for (const m of v3d.matchAll(/\["\w+", "([A-Z][^"]+)"\](?=[,\]])/g)) keys.add(m[1]);
  const ex = read("src/ui/exports.js");
  for (const m of ex.slice(ex.indexOf("EXPORT_3D"), ex.indexOf("export async function export3dDialog")).matchAll(/\["[\w-]+", "[^"]+", "([^"]+)"\]/g)) keys.add(m[1]);
  const check = read("src/core/check.js");
  for (const m of check.matchAll(/add\("\w+", "[\w-]+", "((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  for (const m of check.slice(check.indexOf("CHECKS"), check.indexOf("];")).matchAll(/\["[\w-]+", "([^"]+)"\]/g)) keys.add(m[1]);
  const { allFurniture, FURNITURE_CATEGORIES } = await import(pathToFileURL(path.join(root, "src/lib/furniture.js")).href);
  for (const f of allFurniture()) keys.add(f.name);
  for (const c of FURNITURE_CATEGORIES) keys.add(c);
  const { MATERIALS } = await import(pathToFileURL(path.join(root, "src/lib/materials.js")).href);
  for (const m of MATERIALS) keys.add(m.name);
  for (const k of ["walls", "openings", "rooms", "columns", "stairs", "furniture", "roofs", "dimensions", "texts", "drawings", "underlays"]) keys.add(k);
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
