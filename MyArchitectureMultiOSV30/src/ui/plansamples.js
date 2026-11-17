// 2D → 3D examples (sample/plans, from MySketchBook): floor plan pictures as they
// really arrive (listing plans, brochures, CAD prints, blueprints, sketches, phone
// photos, faxes, scans, interior plans) in many picture formats, and CAD / BIM
// drawings (DXF, SVG, IFC, Sweet Home 3D). Opening one makes a new project,
// turns the drawing into walls, doors, windows and rooms (planpicture.js for
// pictures, io/plandrawing.js for DXF / SVG, the BIM importers for IFC / SH3D),
// puts a roof on and shows it in 3D. The start page card and File › 2D → 3D examples.
import { t, getLanguage } from "./i18n.js";
import { h, modal, toast, withBusy } from "./widgets.js";
import { icon } from "./icons.js";
import * as platform from "./platform.js";
import { uid } from "../core/geom.js";
import { settlePieces } from "../core/placement.js";

const DIR = "sample/plans";
let index = null;

/** The examples: { pictures: [...], drawings: [...] } (each { id, file, format, title: [ko, en], note: [ko, en], widthMetres? }). */
export async function loadPlanSamples() {
  if (index) return index;
  try { index = await (await fetch(`${DIR}/index.json`, { cache: "no-store" })).json(); } catch { index = { pictures: [], drawings: [] }; }
  return index;
}

export const planSampleList = (ix) => [...(ix.pictures || []), ...(ix.drawings || [])];
const ko = () => getLanguage() === "ko";
export const planTitle = (s) => s.title[ko() ? 0 : 1] || s.title[1];
export const planNote = (s) => (s.note ? s.note[ko() ? 0 : 1] || s.note[1] : "");
const PICTURE = /^(png|jpe?g|webp|gif|bmp|avif)$/i;
export const planKind = (s) => (PICTURE.test(s.format) ? "picture" : s.format === "dxf" || s.format === "svg" ? "drawing" : "bim");

const bytesOf = async (file) => { const r = await fetch(`${DIR}/${encodeURIComponent(file)}`); if (!r.ok) throw new Error(`${file}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", avif: "image/avif" };

/** A card for an example (a thumbnail, its title and how it was drawn). */
export function planSampleCard(app, s) {
  const kind = planKind(s);
  return h("button", { class: "sample-card plan-sample", "data-plan-sample": s.id, title: `${planTitle(s)} — ${planNote(s)}`, onclick: () => openPlanSample(app, s) },
    h("img", { class: "plan-thumb", src: `${DIR}/thumbs/${s.id}.webp`, alt: "", loading: "lazy", draggable: "false" }),
    h("div", { class: "sc-body" }, h("b", {}, planTitle(s)), h("small", {}, planNote(s)),
      h("div", { class: "tags" }, h("span", {}, s.format.toUpperCase()), h("span", {}, kind === "picture" ? t("Picture") : kind === "drawing" ? t("CAD drawing") : "BIM"), s.style ? h("span", {}, s.style) : null)));
}

/** The examples in groups (pictures, then CAD / BIM drawings) into `host`. */
export async function fillPlanSamples(app, host) {
  const ix = await loadPlanSamples();
  host.innerHTML = "";
  for (const [title, list, ic] of [[t("Plan pictures"), ix.pictures || [], "image"], [t("CAD and BIM drawings"), ix.drawings || [], "dxf"]]) {
    if (!list.length) continue;
    host.append(h("h3", { class: "plan-sample-group" }, h("span", { class: "si", html: icon(ic, 15) }), h("span", {}, title), h("span", { class: "start-count" }, String(list.length))),
      h("div", { class: "sample-grid plan-sample-grid" }, ...list.map((s) => planSampleCard(app, s))));
  }
  if (!host.children.length) host.append(h("div", { class: "empty-note" }, t("No samples found.")));
  return planSampleList(ix).length;
}

/** File › 2D → 3D examples…: the gallery in a window. */
export async function planSamplesDialog(app) {
  const body = h("div", { class: "plan-sample-dialog" });
  const n = await fillPlanSamples(app, body);
  body.addEventListener("click", (e) => { if (e.target.closest(".plan-sample")) body.closest(".modal")?.querySelector(".popup-close")?.click(); });
  return modal({ icon: "underlay", title: `${t("2D → 3D examples")} (${n})`, width: 980, className: "plan-samples-modal", body, buttons: [{ label: t("Close"), value: null }] });
}

/** Opens an example: a new project, the plan turned into walls, doors, windows and rooms, a roof, the 3D view. */
export async function openPlanSample(app, s) {
  const kind = planKind(s);
  try {
    await app.newProject();
    const p = app.store.project;
    p.meta.title = planTitle(s);
    const level = p.levels[0].id;
    if (kind === "bim") {
      const bytes = await bytesOf(s.file);
      const f = { name: s.file, bytes, noAsk: true, ...(s.format === "ifc" ? { text: new TextDecoder().decode(bytes) } : {}) };
      await app.openFileObject(f, { confirmed: true });
      if (!app.store.project.walls.length) return; // the import said why
    } else if (kind === "drawing") {
      const placed = await withBusy("plan-sample", { title: planTitle(s), icon: "dxf", now: true, what: t("Finding walls…") }, async () => {
        const text = new TextDecoder().decode(await bytesOf(s.file));
        const { readPlanDrawing, placePlanDrawing } = await import("../io/plandrawing.js");
        return placePlanDrawing(readPlanDrawing(s.file, text), { level, roomName: (area, i) => `${t("Room")} ${i + 1}` });
      });
      if (!placed.walls.length) { toast(t("No walls found in the picture. Try another way of reading it, or check that the underlay is at the real size."), "warn", 6000); return; }
      const floor = app.settings.floorMaterial || "oak";
      app.store.edit(t("2D → 3D examples"), (pr) => { pr.walls.push(...placed.walls); pr.openings.push(...placed.openings); pr.rooms.push(...placed.rooms.map((r) => ({ ...r, floor }))); pr.furniture.push(...(placed.furniture || [])); settlePieces(pr, (placed.furniture || []).map((f) => f.id)); });
    } else {
      // A picture: an underlay at the plan's real width, then the walls read from it (with its own progress window).
      const bytes = await bytesOf(s.file);
      const src = `data:${MIME[s.format.toLowerCase()] || "image/png"};base64,${platform.bytesToBase64(bytes)}`;
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(t("The image could not be decoded."))); img.src = src; });
      const w = Math.round((s.widthMetres || img.naturalWidth / 70) * 1000);
      const u = { id: uid("i"), level, src, x: 0, y: 0, w, h: (w * img.naturalHeight) / img.naturalWidth, rot: 0, opacity: 0.45, name: s.file };
      app.store.edit(t("Import underlay"), (pr) => { pr.underlays.push(u); });
      const { wallsFromPicture } = await import("./planpicture.js");
      const out = await wallsFromPicture(app, { underlay: u, ask: false });
      if (!out) return;
    }
    if (kind !== "bim") app.autoRoof();
    app.store.dirty = false;
    app.setTab("3d");
    if (app.v3d && app.v3d.ensure) { await app.v3d.ensure(); app.v3d.syncModel(); app.v3d.setView && app.v3d.setView("iso"); }
    toast(t("{name}: turned into walls, doors, windows and rooms. Fix what is missing in the plan.", { name: planTitle(s) }), "ok", 6000);
  } catch (e) {
    console.error(e);
    toast(`${t("The example could not be opened.")} ${e.message || e}`, "error", 7000);
  }
}
