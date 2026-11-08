// My library: furniture people register themselves, next to the built-in
// catalogue. An entry is made from
//   - a selected item (with its own size, colour, light…),
//   - a selection of several items or a group (kept as one group when placed),
//   - an imported 3D model file (OBJ, GLB, FBX, STL…),
// and has a name, a category (a built-in one or the user's own) and a 3D
// thumbnail. Entries live in the settings (they survive a restart), can be
// renamed, moved to another category, deleted, exported to a .myarchlib file
// and imported again. A project that uses an entry keeps a copy of it
// (p.libraryItems, with the 3D model data it needs), so it opens anywhere and
// the entry can be saved into another person's library from there.
//
// Entry: {id, name, cat, w, d, h, thumb (data URL), items: [furniture objects
// relative to the entry's centre], models: [model assets they use], created}

import { t } from "./i18n.js";
import { h, modal, toast, field, input, select, confirmDialog, promptDialog, progressPopup } from "./widgets.js";
import { itemsThumb } from "./thumbclient.js";
import * as platform from "./platform.js";
import { uid } from "../core/geom.js";
import { furnitureCorners, FURNITURE_CATEGORIES, furnitureDef } from "../lib/furniture.js";

export const LIBRARY_FILTER = { name: "MyArchitecture library", extensions: ["myarchlib"] };
const MODEL_EXTS = ["obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds", "wrl", "amf", "3dm"];
const KEEP = ["kind", "x", "y", "rot", "w", "d", "h", "elevation", "color", "light", "model", "modelColors", "mirrored", "name", "material", "comp"];

export const userEntries = (app) => (Array.isArray(app.settings.userLibrary) ? app.settings.userLibrary : []);
export const projectEntries = (p) => (Array.isArray(p.libraryItems) ? p.libraryItems : []);
export const userCategories = (app) => [...new Set(userEntries(app).map((e) => e.cat).filter((c) => c && !FURNITURE_CATEGORIES.includes(c)))];

// A clean copy of an entry (also what a library file or a project holds).
export function normalizeEntry(e) {
  if (!e || typeof e !== "object" || !Array.isArray(e.items) || !e.items.length) return null;
  const n = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  const items = e.items.filter((f) => f && typeof f === "object" && (furnitureDef(f.kind) || f.kind === "model")).map((f) => {
    const o = {};
    for (const k of KEEP) if (f[k] !== undefined) o[k] = f[k];
    o.x = +o.x || 0; o.y = +o.y || 0; o.rot = +o.rot || 0; o.w = n(o.w, 1000); o.d = n(o.d, 1000); o.h = n(o.h, 1000); o.elevation = +o.elevation || 0;
    return o;
  });
  if (!items.length) return null;
  const models = (Array.isArray(e.models) ? e.models : []).filter((m) => m && m.id && typeof m.data === "string");
  if (items.some((f) => f.kind === "model" && !models.some((m) => m.id === f.model))) return null;
  return { id: String(e.id || uid("lib")), name: String(e.name || "Item").slice(0, 120), cat: String(e.cat || "Other").slice(0, 60), w: n(e.w, 1000), d: n(e.d, 1000), h: n(e.h, 1000), thumb: typeof e.thumb === "string" && e.thumb.startsWith("data:image/") ? e.thumb : "", items, models, created: e.created || new Date().toISOString() };
}

// An entry drawn from furniture objects (world coordinates): centred on their
// footprint, the first item's rotation kept as it is.
export function entryFromItems(items, models = [], meta = {}) {
  const pts = items.flatMap((f) => furnitureCorners(f));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const z0 = Math.min(...items.map((f) => f.elevation || 0));
  const rel = items.map((f) => ({ ...f, x: Math.round(f.x - cx), y: Math.round(f.y - cy), elevation: (f.elevation || 0) - (items.length > 1 ? z0 : 0) }));
  const w = Math.round(Math.max(...xs) - Math.min(...xs)), d = Math.round(Math.max(...ys) - Math.min(...ys));
  const hh = Math.round(Math.max(...items.map((f) => (f.elevation || 0) - (items.length > 1 ? z0 : 0) + (f.h || 0))));
  const used = new Set(items.filter((f) => f.kind === "model").map((f) => f.model));
  return normalizeEntry({ id: uid("lib"), ...meta, w: Math.max(1, w), d: Math.max(1, d), h: Math.max(1, hh), items: rel, models: models.filter((m) => used.has(m.id)) });
}

// The furniture objects an entry places at (x, y) on a level: new ids, one
// group when there are several.
export function entryInstances(entry, x, y, level) {
  const group = entry.items.length > 1 ? uid("g") : null;
  return entry.items.map((f) => ({ ...JSON.parse(JSON.stringify(f)), id: uid("u"), level, x: f.x + x, y: f.y + y, libItem: entry.id, ...(group ? { group } : {}) }));
}

// Put an entry into a project: its instances, the models they need and a copy
// of the entry (so the project opens on any machine).
export function insertEntry(p, entry, x, y, level) {
  const items = entryInstances(entry, x, y, level);
  for (const m of entry.models) if (!p.models.some((q) => q.id === m.id)) p.models.push(JSON.parse(JSON.stringify(m)));
  if (!Array.isArray(p.libraryItems)) p.libraryItems = [];
  if (!p.libraryItems.some((e) => e.id === entry.id)) p.libraryItems.push({ ...entry, models: [] });
  p.furniture.push(...items);
  return items;
}

// Library file text, and entries read back from one.
export const libraryFileText = (entries) => JSON.stringify({ format: "myarchitecture-library", version: 1, items: entries }, null, 1);
export function parseLibraryFile(text) {
  const j = JSON.parse(text);
  if (!j || j.format !== "myarchitecture-library" || !Array.isArray(j.items)) throw new Error(t("This is not a MyArchitecture library file."));
  return j.items.map(normalizeEntry).filter(Boolean);
}
// Entries added to a list: same id → replaced, so importing twice does not duplicate.
export function mergeEntries(list, add) {
  const out = list.slice();
  for (const e of add) {
    const i = out.findIndex((x) => x.id === e.id);
    if (i >= 0) out[i] = e; else out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------- app side
function saveEntries(app, list) {
  app.settings.userLibrary = list;
  app.saveSettings();
  if (app.renderLeft) app.renderLeft();
}

// The entry's picture: drawn in the background worker (src/ui/thumbclient.js),
// else on the page as before.
async function thumbOf(entry) {
  try {
    const url = await itemsThumb(entry.items, entry.models);
    if (url) return url;
  } catch { /* no worker: on the page */ }
  try {
    const THREE = await import("../vendor/three/three.module.js");
    const { createThumbRenderer } = await import("../view3d/thumbs.js");
    const r = createThumbRenderer(THREE, { width: 160, height: 128 });
    try { return await r.render(entry.items, entry.models); } finally { r.dispose(); }
  } catch (e) {
    console.warn("library thumbnail", e);
    return "";
  }
}

// The name / category dialog. → {name, cat} or null
async function nameDialog(app, entry, { title, ok }) {
  const cats = [...FURNITURE_CATEGORIES, ...userCategories(app)];
  const st = { name: entry.name, cat: cats.includes(entry.cat) ? entry.cat : "__new", newCat: cats.includes(entry.cat) ? "" : entry.cat };
  const nameIn = input(st.name, { onInput: (v) => { st.name = v; } });
  const newIn = input(st.newCat, { placeholder: t("Name of the new category"), onInput: (v) => { st.newCat = v; } });
  const newRow = field(t("New category"), newIn);
  newRow.hidden = st.cat !== "__new";
  const catSel = select(st.cat, [...cats.map((c) => [c, t(c)]), ["__new", t("New category…")]], { onChange: (v) => { st.cat = v; newRow.hidden = v !== "__new"; } });
  const preview = h("div", { class: "lib-reg-preview" }, entry.thumb ? h("img", { src: entry.thumb, alt: "" }) : h("span", { class: "lib-reg-wait" }, t("Drawing the picture…")));
  const body = h("div", { class: "lib-reg" }, preview, h("div", { class: "form-grid" },
    field(t("Name"), nameIn), field(t("Category"), catSel), newRow,
    h("p", { class: "field-hint span2" }, t("{n} items · {w} × {d} × {h} mm", { n: entry.items.length, w: entry.w, d: entry.d, h: entry.h }))));
  const res = await modal({ icon: "libraryAdd", title, width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: ok, value: true, primary: true }],
    onOpen: () => { setTimeout(() => nameIn.focus(), 30); if (!entry.thumb) thumbOf(entry).then((u) => { entry.thumb = u; preview.innerHTML = ""; if (u) preview.append(h("img", { src: u, alt: "" })); }); },
    validate: () => (!st.name.trim() ? t("Give the item a name.") : st.cat === "__new" && !st.newCat.trim() ? t("Name the new category.") : null) });
  if (!res) return null;
  return { name: st.name.trim(), cat: st.cat === "__new" ? st.newCat.trim() : st.cat };
}

async function finishRegister(app, entry) {
  const meta = await nameDialog(app, entry, { title: t("Register in my library"), ok: t("Register") });
  if (!meta) return null;
  if (!entry.thumb) entry.thumb = await thumbOf(entry);
  const e = { ...entry, ...meta };
  saveEntries(app, [...userEntries(app), e]);
  toast(t("{name} is in your library ({cat}).", { name: e.name, cat: t(e.cat) }), "ok", 5000);
  return e;
}

// The selected furniture (one item, several, or a group) → a library entry.
export async function registerSelection(app) {
  const p = app.store.project;
  const ids = new Set(app.plan ? [...app.plan.sel] : []);
  return registerItems(app, p.furniture.filter((f) => ids.has(f.id) && f.kind !== "component"), p.models);
}

// Furniture objects (world coordinates) and the models they use → a library entry.
export async function registerItems(app, items, models = []) {
  const p = { models };
  if (!items.length) { toast(t("Select one or more pieces of furniture first (a group registers as one item)."), "warn", 5000); return null; }
  const first = items[0];
  const def = furnitureDef(first.kind);
  const name = items.length > 1 ? t("Group of {n} items", { n: items.length }) : first.name || (def ? t(def.name) : first.kind === "model" ? (p.models.find((m) => m.id === first.model) || {}).name || t("3D model") : first.kind);
  const entry = entryFromItems(items, p.models, { name, cat: items.length === 1 && def ? def.cat : "Other" });
  if (!entry) { toast(t("These items cannot be registered."), "warn"); return null; }
  return finishRegister(app, entry);
}

// An imported 3D model file → a library entry.
export async function registerModelFile(app, file = null) {
  const f = file || await platform.openFile({ title: t("Register a 3D model in my library"), filters: [{ name: t("3D models"), extensions: MODEL_EXTS }] });
  if (!f) return null;
  const note = toast(t("Reading 3D model…"), "info", 60000);
  let res;
  try {
    const { loadModelFile } = await import("../io/models3d.js");
    res = await loadModelFile({ name: f.name, bytes: f.bytes }, { units: "auto", upAxis: "auto" });
  } catch (e) {
    toast(t("Could not read {name}: {err}", { name: f.name, err: e.message || e }), "error", 8000);
    return null;
  } finally { note.remove(); }
  const name = res.name || f.name.replace(/\.[^.]+$/, "");
  const asset = { id: uid("m"), name, format: res.format || "", size: res.size, outline: res.outline, data: res.data };
  const item = { kind: "model", model: asset.id, name, x: 0, y: 0, rot: 0, w: Math.round(res.size[0]), d: Math.round(res.size[1]), h: Math.round(res.size[2]), elevation: 0 };
  return finishRegister(app, entryFromItems([item], [asset], { name, cat: "Other" }));
}

// Place an entry: at a point (a drop) or in the middle of the plan view.
export function placeEntry(app, entry, at = null) {
  const vp = app.plan.vp;
  const [x, y] = at || (vp.width ? vp.toWorld(vp.width / 2, vp.height / 2) : [0, 0]);
  let placed = [];
  app.setTab("plan");
  app.store.edit(t("Add furniture"), (p) => { placed = insertEntry(p, entry, Math.round(x), Math.round(y), app.plan.level); });
  app.plan.select(placed.map((f) => f.id));
  const recent = [`user:${entry.id}`, ...(app.settings.recentFurniture || []).filter((k) => k !== `user:${entry.id}`)].slice(0, 10);
  app.settings.recentFurniture = recent;
  app.saveSettings();
  return placed;
}

export const findEntry = (app, id) => userEntries(app).find((e) => e.id === id) || projectEntries(app.store.project).find((e) => e.id === id) || null;

// A project's copy of an entry → the user's own library.
export function adoptEntry(app, entry) {
  const models = app.store.project.models;
  const used = new Set(entry.items.filter((f) => f.kind === "model").map((f) => f.model));
  const e = normalizeEntry({ ...entry, models: models.filter((m) => used.has(m.id)) });
  if (!e) { toast(t("This item's 3D model is missing from the project."), "warn"); return; }
  saveEntries(app, mergeEntries(userEntries(app), [e]));
  toast(t("{name} is in your library ({cat}).", { name: e.name, cat: t(e.cat) }), "ok", 5000);
}

export async function editEntry(app, entry) {
  const meta = await nameDialog(app, { ...entry }, { title: t("Library item"), ok: t("Save") });
  if (!meta) return;
  saveEntries(app, userEntries(app).map((e) => (e.id === entry.id ? { ...e, ...meta } : e)));
}

export async function renameEntry(app, entry) {
  const name = await promptDialog(t("New name"), entry.name, { title: t("Rename"), icon: "text" });
  if (!name || !name.trim()) return;
  saveEntries(app, userEntries(app).map((e) => (e.id === entry.id ? { ...e, name: name.trim() } : e)));
}

export async function deleteEntry(app, entry) {
  if (!(await confirmDialog(t("Remove {name} from your library? Projects that use it keep their copy.", { name: entry.name }), { title: t("Delete"), ok: t("Delete"), danger: true, icon: "trash" }))) return;
  saveEntries(app, userEntries(app).filter((e) => e.id !== entry.id));
  app.settings.favFurniture = (app.settings.favFurniture || []).filter((k) => k !== `user:${entry.id}`);
  app.saveSettings();
}

export async function refreshThumb(app, entry) {
  const thumb = await thumbOf(entry);
  if (thumb) saveEntries(app, userEntries(app).map((e) => (e.id === entry.id ? { ...e, thumb } : e)));
}

export async function exportLibrary(app) {
  const list = userEntries(app);
  if (!list.length) { toast(t("Your library is empty: register items first."), "warn"); return; }
  await platform.saveTextFile({ name: "my-furniture.myarchlib", text: libraryFileText(list), title: t("Export my library"), filters: [LIBRARY_FILTER] });
}

export async function importLibrary(app) {
  const f = await platform.openTextFile({ title: t("Import a library"), filters: [LIBRARY_FILTER] });
  if (!f) return;
  let add;
  try { add = parseLibraryFile(f.text); } catch (e) { toast(e.message || String(e), "error", 6000); return; }
  saveEntries(app, mergeEntries(userEntries(app), add));
  toast(t("{n} items added to your library.", { n: add.length }), "ok", 5000);
  drawMissingPictures(app);
}

// Entries without a picture (e.g. from a library file) get one in the
// background, one after another, with a progress popup; the app stays usable.
export async function drawMissingPictures(app) {
  const todo = userEntries(app).filter((x) => !x.thumb);
  if (!todo.length) return;
  const pp = progressPopup("library-pictures", { title: t("Drawing the library pictures"), icon: "image" });
  let n = 0;
  for (const entry of todo) {
    pp.set(n, todo.length, t("Drawing {name}…", { name: entry.name }));
    const thumb = await thumbOf(entry);
    if (thumb) saveEntries(app, userEntries(app).map((x) => (x.id === entry.id ? { ...x, thumb } : x)));
    n++;
  }
  pp.set(n, todo.length);
  pp.finish(t("Library pictures are ready ({n})", { n: todo.length }));
}
