// Import and export: DXF / SVG drawings, IFC, 3D models, image underlays,
// plan SVG / PNG, DXF, IFC, every 3D format, and printing / PDF of drawing
// sheets with a title block. The format engines live in src/io; this module
// asks for options, calls them and puts the results into the project.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, toast, field, select, checkbox, tabs, stepper } from "./widgets.js";
import * as platform from "./platform.js";
import { SvgContext } from "./svgctx.js";
import { importReport } from "./dialogs.js";
import { drawPlan, planBounds, PLAN_THEMES } from "../plan/render.js";
import { levelById } from "../core/project.js";
import { uid, bounds as ptsBounds } from "../core/geom.js";

const baseName = (app) => (app.store.project.meta.title || "project").replace(/[\\/:*?"<>|\s]+/g, "_");
const fileBase = (name) => name.replace(/\.[^.]+$/, "");

// ---------------------------------------------------------------- import: DXF / SVG
export async function importDrawing(app, f, kind) {
  if (kind === "dwg") {
    const { detectDwgVersion } = await import("../io/dwg.js");
    const v = detectDwgVersion(f.bytes);
    if (!v) { toast(t("{name} is not an AutoCAD DWG drawing.", { name: f.name }), "warn", 6000); return; }
    if (!v.supported) { toast(t("DWG {release} files are too old to read. Save the drawing as DXF, or as DWG R13 or newer.", { release: v.release }), "warn", 8000); return; }
  }
  const p = app.store.project;
  const opts = { units: "auto", level: app.plan.level, origin: false };
  const levelOpts = p.levels.map((l) => [l.id, l.name]);
  const body = h("div", { class: "form-grid" },
    field(t("Units in the file"), select(opts.units, [["auto", t("Detect automatically")], ["mm", "mm"], ["cm", "cm"], ["m", "m"], ["in", t("inches")], ["ft", t("feet")]], { onChange: (v) => { opts.units = v; } })),
    field(t("Level"), select(opts.level, levelOpts, { onChange: (v) => { opts.level = v; } })),
    h("div", { class: "span2" }, checkbox(false, t("Move the drawing to the plan origin"), { onChange: (v) => { opts.origin = v; } })),
    h("p", { class: "field-hint span2" }, kind === "dxf" || kind === "dwg"
      ? t("Lines, polylines, arcs, circles, splines, texts, blocks and hatch outlines come in on their own CAD layers. Trace walls over them with W, then hide the layers.")
      : t("Paths, shapes and texts come in on the layer SVG.")));
  const title = { dxf: t("Import DXF drawing"), dwg: t("Import DWG drawing") }[kind] || t("Import SVG drawing");
  const ok = await modal({ title, width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Import"), value: true, primary: true }] });
  if (!ok) return;
  let res;
  if (kind === "dxf") {
    const { importDxf } = await import("../io/dxf.js");
    res = importDxf(f.text, { level: opts.level, units: opts.units });
  } else if (kind === "dwg") {
    const { importDwg } = await import("../io/dwg.js");
    res = importDwg(f.bytes, { level: opts.level, units: opts.units });
  } else {
    const { importSvg } = await import("../io/svgimport.js");
    res = importSvg(f.text, { level: opts.level, mmPerUnit: opts.units === "auto" ? "auto" : { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }[opts.units] });
  }
  const drawings = res.drawings || [];
  const texts = res.texts || [];
  if (!drawings.length && !texts.length) { toast(t("Nothing to import was found in {name}.", { name: f.name }), "warn", 5000); return; }
  let dx = 0, dy = 0;
  if (opts.origin && res.bounds) { dx = -res.bounds.x1; dy = -res.bounds.y1; }
  app.store.edit(t("Import drawing"), (pr) => {
    for (const l of res.layers || []) if (!pr.layers.some((x) => x.id === l.id)) pr.layers.push(l);
    for (const d of drawings) {
      if (dx || dy) { if (d.pts) d.pts = d.pts.map(([x, y]) => [x + dx, y + dy]); if (d.cx !== undefined) { d.cx += dx; d.cy += dy; } }
      pr.drawings.push({ ...d, level: opts.level });
    }
    for (const tx of texts) pr.texts.push({ ...tx, x: tx.x + dx, y: tx.y + dy, level: opts.level });
  });
  app.setTab("plan");
  if (opts.level !== app.plan.level) app.plan.setLevel(opts.level);
  app.plan.zoomFit();
  toast(t("Imported {name}: {d} drawing items, {t} texts ({u}).", { name: f.name, d: drawings.length, t: texts.length, u: res.units || opts.units }), "ok", 6000);
  if (res.warnings && res.warnings.length) importReport(app, t("Import notes"), res.warnings);
}

// ---------------------------------------------------------------- import: IFC
export async function importIfcFile(app, f, confirmed = false) {
  if (!confirmed && !(await app.confirmDiscard())) return;
  const note = toast(t("Reading IFC model…"), "info", 60000);
  await new Promise((r) => setTimeout(r, 30));
  let res;
  try {
    const { importIfc } = await import("../io/ifc.js");
    res = importIfc(f.text);
  } finally { note.remove(); }
  const project = res.project;
  if (!project.meta.title) project.meta.title = fileBase(f.name);
  app.store.load(project, { fileName: `${fileBase(f.name)}.myarch` });
  app.store.filePath = null;
  app.store.dirty = true;
  app.updateTitle();
  app.setTab("plan");
  toast(t("Imported {name}: {l} levels, {w} walls, {o} doors/windows, {r} rooms.", { name: f.name, l: project.levels.length, w: project.walls.length, o: project.openings.length, r: project.rooms.length }), "ok", 6000);
  if (res.warnings && res.warnings.length) importReport(app, t("Import notes"), res.warnings);
}

// ---------------------------------------------------------------- import: 3D models
export async function importModel(app, f) {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const opts = { units: "auto", upAxis: "auto" };
  const body = h("div", { class: "form-grid" },
    field(t("Units in the file"), select(opts.units, [["auto", t("Detect automatically")], ["mm", "mm"], ["cm", "cm"], ["m", "m"], ["in", t("inches")], ["ft", t("feet")]], { onChange: (v) => { opts.units = v; } })),
    field(t("Up axis"), select(opts.upAxis, [["auto", t("Automatic")], ["y", t("Y is up")], ["z", t("Z is up")]], { onChange: (v) => { opts.upAxis = v; } })),
    h("p", { class: "field-hint span2" }, t("The model becomes a piece of furniture: place it, move it, rotate it and scale it like the others. It is stored inside the project file.")));
  const ok = await modal({ title: t("Import 3D model — {name}", { name: f.name }), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Import"), value: true, primary: true }] });
  if (!ok) return;
  let mtlText = null;
  if (ext === "obj" && f.path) {
    try { const m = await platform.readPath(f.path.replace(/\.obj$/i, ".mtl")); if (m) mtlText = m.text; } catch { /* no material library next to it */ }
  }
  const note = toast(t("Reading 3D model…"), "info", 60000);
  await new Promise((r) => setTimeout(r, 30));
  let res;
  try {
    const { loadModelFile } = await import("../io/models3d.js");
    res = await loadModelFile({ name: f.name, bytes: f.bytes }, { units: opts.units, upAxis: opts.upAxis, mtlText });
  } finally { note.remove(); }
  const asset = { id: uid("m"), name: res.name || fileBase(f.name), format: res.format || ext, size: res.size, outline: res.outline, data: res.data };
  const at = app.dropAt || centreOfView(app);
  const item = { id: uid("u"), level: app.plan.level, kind: "model", model: asset.id, name: asset.name, x: at[0], y: at[1], rot: 0, w: Math.round(asset.size[0]), d: Math.round(asset.size[1]), h: Math.round(asset.size[2]), elevation: 0 };
  app.store.edit(t("Import 3D model"), (pr) => { pr.models.push(asset); pr.furniture.push(item); });
  app.setTab("plan");
  app.plan.select([item.id]);
  toast(t("{name} imported: {w} × {d} × {h} mm ({u}).", { name: asset.name, w: item.w, d: item.d, h: item.h, u: res.units || opts.units }), "ok", 6000);
  if (res.warnings && res.warnings.length) importReport(app, t("Import notes"), res.warnings);
}

function centreOfView(app) {
  const vp = app.plan.vp;
  return vp.width ? vp.toWorld(vp.width / 2, vp.height / 2) : [0, 0];
}

// ---------------------------------------------------------------- import: image underlay
export async function importUnderlay(app, f) {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" }[ext] || "image/png";
  const src = `data:${mime};base64,${platform.bytesToBase64(f.bytes)}`;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(t("The image could not be decoded."))); img.src = src; });
  const opts = { width: Math.round(img.naturalWidth * 10), opacity: 50 };
  const body = h("div", { class: "form-grid" },
    field(t("Width of the image in the plan"), stepper(opts.width, { min: 100, max: 1e6, step: 100, editable: true, format: (v) => `${Math.round(v)} mm`, onChange: (v) => { opts.width = v; } })),
    field(t("Opacity"), stepper(opts.opacity, { min: 10, max: 100, step: 10, format: (v) => `${v}%`, onChange: (v) => { opts.opacity = v; } })),
    h("p", { class: "field-hint span2" }, t("{w} × {h} pixels. The underlay is for tracing: draw walls over it, then hide it (View → Show underlays).", { w: img.naturalWidth, h: img.naturalHeight })));
  const ok = await modal({ title: t("Import image as tracing underlay"), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Import"), value: true, primary: true }] });
  if (!ok) return;
  const w = opts.width;
  const hh = (w * img.naturalHeight) / img.naturalWidth;
  const [cx, cy] = app.dropAt || centreOfView(app);
  const u = { id: uid("i"), level: app.plan.level, src, x: Math.round(cx - w / 2), y: Math.round(cy - hh / 2), w, h: hh, rot: 0, opacity: opts.opacity / 100, name: f.name };
  app.store.edit(t("Import underlay"), (pr) => { pr.underlays.push(u); });
  app.setTab("plan");
  app.plan.select([u.id]);
  app.plan.zoomFit();
}

// ---------------------------------------------------------------- plan rendering for output
export function printTheme(mono = false) {
  const th = { ...PLAN_THEMES.light, bg: "#ffffff", paper: "#ffffff", furnitureFill: "#ffffff", wallFill: "#2a2e35" };
  if (!mono) return th;
  const out = {};
  for (const [k, v] of Object.entries(th)) out[k] = typeof v === "string" && v.startsWith("#") ? (/^#f/i.test(v) ? "#ffffff" : "#000000") : v;
  out.wallFill = "#3a3a3a";
  out.furnitureFill = "#ffffff";
  return out;
}

// SVG of one level at real size (1 SVG unit = 1 mm of the building).
export function planSvg(app, level, { mono = false, margin = 1000, show = {} } = {}) {
  const p = app.store.project;
  const b = planBounds(p, level) || { x1: 0, y1: 0, x2: 10000, y2: 8000 };
  const W = b.x2 - b.x1 + margin * 2, H = b.y2 - b.y1 + margin * 2;
  const ctx = new SvgContext(W, H);
  ctx.setTransform(1, 0, 0, 1, margin - b.x1, margin - b.y1);
  const scale = p.meta.scale || 100;
  drawPlan(ctx, p, printTheme(mono), { level, lw: 0.18 * scale, px: 0.18 * scale / 3, print: true, units: app.settings.units, models: new Map(p.models.map((m) => [m.id, m])), labels: { up: t("UP") }, show: { ghost: false, underlays: false, ...show } });
  return { svg: ctx.toString("#ffffff"), W, H, origin: [b.x1 - margin, b.y1 - margin] };
}

export async function exportPlanSvg(app) {
  const p = app.store.project;
  const level = app.plan.level;
  const scale = p.meta.scale || 100;
  const { svg, W, H } = planSvg(app, level);
  // Width and height in paper millimetres at the drawing scale.
  const out = svg.replace(`width="${+W.toFixed(3)}" height="${+H.toFixed(3)}"`, `width="${(W / scale).toFixed(2)}mm" height="${(H / scale).toFixed(2)}mm"`);
  const lv = levelById(p, level);
  const r = await platform.saveTextFile({ name: `${baseName(app)}-${lv.name}.svg`, text: `<?xml version="1.0" encoding="UTF-8"?>\n${out}`, filters: [{ name: "SVG", extensions: ["svg"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

export async function exportPlanPng(app) {
  const p = app.store.project;
  const opts = { width: 3000, mono: false };
  const body = h("div", { class: "form-grid" },
    field(t("Image width"), stepper(opts.width, { values: [1000, 2000, 3000, 4000, 6000, 8000], format: (v) => `${v} px`, onChange: (v) => { opts.width = v; } })),
    field(t("Colour"), checkbox(false, t("Black and white"), { onChange: (v) => { opts.mono = v; } })));
  const ok = await modal({ title: t("Export plan as PNG image"), width: 460, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
  if (!ok) return;
  const level = app.plan.level;
  const b = planBounds(p, level) || { x1: 0, y1: 0, x2: 10000, y2: 8000 };
  const margin = 1000;
  const W = b.x2 - b.x1 + margin * 2, H = b.y2 - b.y1 + margin * 2;
  const k = opts.width / W;
  const c = document.createElement("canvas");
  c.width = Math.round(W * k);
  c.height = Math.round(H * k);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, (margin - b.x1) * k, (margin - b.y1) * k);
  const images = app.plan.underlayImages();
  drawPlan(ctx, p, printTheme(opts.mono), { level, lw: 1.6 / k, px: 1 / k, print: true, units: app.settings.units, images, models: new Map(p.models.map((m) => [m.id, m])), labels: { up: t("UP") }, show: { ghost: false } });
  const lv = levelById(p, level);
  const r = await platform.saveDataUrl({ name: `${baseName(app)}-${lv.name}.png`, dataUrl: c.toDataURL("image/png"), filters: [{ name: "PNG", extensions: ["png"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

// ---------------------------------------------------------------- DXF / IFC export
export async function exportDxfFile(app) {
  const p = app.store.project;
  const opts = { level: app.plan.level, all: false };
  const body = h("div", { class: "form-grid" },
    field(t("Level"), select(opts.level, p.levels.map((l) => [l.id, l.name]), { onChange: (v) => { opts.level = v; } })),
    field(t("Levels"), checkbox(false, t("One file per level"), { onChange: (v) => { opts.all = v; } })),
    h("p", { class: "field-hint span2" }, t("AutoCAD R12 DXF in millimetres with standard layers (A-WALL, A-DOOR, A-GLAZ, A-AREA, A-FURN, A-ANNO-DIMS …). Every CAD program opens it.")));
  const ok = await modal({ title: t("Export DXF (AutoCAD)…"), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
  if (!ok) return;
  const { exportDxf } = await import("../io/dxf.js");
  const levels = opts.all ? p.levels : [levelById(p, opts.level)];
  for (const lv of levels) {
    const text = exportDxf(p, { level: lv.id });
    const r = await platform.saveTextFile({ name: `${baseName(app)}-${lv.name}.dxf`, text, filters: [{ name: "DXF", extensions: ["dxf"] }] });
    if (!r) return;
    toast(t("Saved {name}", { name: r.name }), "ok");
  }
}

export async function exportIfcFile(app) {
  const opts = { schema: "IFC4" };
  const body = h("div", { class: "form-grid" },
    field(t("IFC version"), select(opts.schema, [["IFC4", "IFC4 (Reference View)"], ["IFC2X3", "IFC2X3 (Coordination View 2.0)"]], { onChange: (v) => { opts.schema = v; } })),
    h("p", { class: "field-hint span2" }, t("Storeys, walls with openings, doors, windows, spaces, floor slabs, roofs, stairs, columns and furniture, for Revit, ArchiCAD, BIMcollab, Solibri and any IFC viewer.")));
  const ok = await modal({ title: t("Export IFC (BIM)…"), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
  if (!ok) return;
  const { exportIfc } = await import("../io/ifc.js");
  const p = app.store.project;
  const text = exportIfc(p, { schema: opts.schema, author: p.meta.author, organization: p.meta.company });
  const r = await platform.saveTextFile({ name: `${baseName(app)}.ifc`, text, filters: [{ name: "IFC", extensions: ["ifc"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

// ---------------------------------------------------------------- 3D export
export const EXPORT_3D = [
  ["glb", "GLB (glTF binary)", "Blender, Unity, Unreal, web viewers, Windows 3D Viewer — colours and textures"],
  ["gltf", "glTF (JSON)", "Same as GLB as a text file with embedded data"],
  ["obj", "OBJ + MTL (ZIP)", "Almost every 3D program; materials in the MTL file"],
  ["dae", "Collada (DAE)", "SketchUp, 3ds Max, Blender"],
  ["fbx-hint", "FBX", "Not written directly: import the GLB or DAE into Blender and export FBX"],
  ["stl", "STL", "3D printing, mechanical CAD — geometry only"],
  ["3mf", "3MF", "3D printing with colours (Windows 3D Builder, PrusaSlicer, Cura)"],
  ["ply", "PLY", "Mesh exchange (MeshLab, CloudCompare)"],
  ["usdz", "USDZ", "Apple AR Quick Look (iPhone, iPad, Mac)"],
];

export async function export3dDialog(app) {
  const opts = { format: "glb", unit: "m" };
  const list = h("div", { class: "format-list" });
  const draw = () => {
    list.innerHTML = "";
    for (const [id, name, use] of EXPORT_3D) {
      if (id === "fbx-hint") { list.append(h("div", { class: "format-row disabled" }, h("b", {}, name), h("small", {}, t(use)))); continue; }
      const row = h("label", { class: `format-row ${opts.format === id ? "on" : ""}` }, h("input", { type: "radio", name: "fmt3d", value: id, checked: opts.format === id, onchange: () => { opts.format = id; draw(); } }), h("b", {}, name), h("small", {}, t(use)));
      list.append(row);
    }
  };
  draw();
  const body = h("div", {}, list, h("div", { class: "form-grid", style: { marginTop: "10px" } },
    field(t("Units"), select(opts.unit, [["m", t("Metres (glTF standard)")], ["mm", t("Millimetres (3D printing, CAD)")]], { onChange: (v) => { opts.unit = v; } })),
    h("p", { class: "field-hint" }, t("Only what is visible in the 3D view is exported (hidden levels, furniture or roofs are left out)."))));
  const ok = await modal({ title: t("Export 3D model"), width: 640, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
  if (!ok) return;
  await export3d(app, opts.format, opts.unit);
}

export async function export3d(app, format, unit = "m") {
  const v = await app.v3d.ensure();
  if (!v) { toast(t("3D view is not available."), "error"); return null; }
  app.v3d.syncModel();
  const scale = unit === "mm" ? 1000 : 1;
  const base = baseName(app);
  const save = async (name, data, filterName, ext) => {
    const r = typeof data === "string"
      ? await platform.saveTextFile({ name, text: data, filters: [{ name: filterName, extensions: [ext] }] })
      : await platform.saveBinaryFile({ name, bytes: data, filters: [{ name: filterName, extensions: [ext] }] });
    if (r) toast(t("Saved {name}", { name: r.name }), "ok");
    return r;
  };
  const bytesOf = (x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x instanceof DataView ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : x);
  if (format === "glb") return save(`${base}.glb`, bytesOf(await v.exportFile("glb", { scale })), "glTF binary", "glb");
  if (format === "gltf") return save(`${base}.gltf`, JSON.stringify(await v.exportFile("gltf", { scale })), "glTF", "gltf");
  if (format === "stl") return save(`${base}.stl`, bytesOf(await v.exportFile("stl", { scale, binary: true })), "STL", "stl");
  if (format === "ply") return save(`${base}.ply`, bytesOf(await v.exportFile("ply", { scale, binary: true })), "PLY", "ply");
  if (format === "usdz") return save(`${base}.usdz`, bytesOf(await v.exportFile("usdz", { scale })), "USDZ", "usdz");
  const root = v.exportRoot({ scale });
  root.updateMatrixWorld(true);
  if (format === "obj") {
    const { exportObjMtl } = await import("../io/objmtl.js");
    const { makeZip } = await import("../io/zip.js");
    const { obj, mtl } = exportObjMtl(root, { name: base });
    return save(`${base}-obj.zip`, makeZip([{ name: `${base}.obj`, data: obj }, { name: `${base}.mtl`, data: mtl }]), "ZIP", "zip");
  }
  if (format === "dae") {
    const { exportCollada } = await import("../io/collada.js");
    return save(`${base}.dae`, exportCollada(root, { title: app.store.project.meta.title, author: app.store.project.meta.author }), "Collada", "dae");
  }
  if (format === "3mf") {
    const { export3MF } = await import("../io/threemf.js");
    // 3MF wants millimetres: always write the real size.
    const r3 = v.exportRoot({ scale: 1 });
    r3.updateMatrixWorld(true);
    return save(`${base}.3mf`, export3MF(r3, { unit: "millimeter", title: app.store.project.meta.title }), "3MF", "3mf");
  }
  throw new Error(`unknown format ${format}`);
}

// ---------------------------------------------------------------- print / PDF
// The print window (settings on the left, live sheet preview on the right,
// Print sends straight to the printer) lives in printwin.js.
export async function printDialog(app, opts = {}) {
  const { printWindow } = await import("./printwin.js");
  return printWindow(app, opts);
}

export { ptsBounds, getLanguage };
