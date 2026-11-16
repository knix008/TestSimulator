// Import of other architecture programs' building models: Sweet Home 3D
// (.sh3d, or a bare Home.xml), gbXML (.gbxml / .xml from Revit, ArchiCAD,
// Vectorworks, OpenStudio…), ifcXML (.ifcxml) and IFC packed in a ZIP
// (.ifczip). Like IFC, each
// becomes a new project of levels, walls, doors/windows, rooms and the rest,
// replacing the open one after the usual unsaved-changes question.

import { t } from "./i18n.js";
import { h, toast, modal, field, select } from "./widgets.js";
import { importReport } from "./dialogs.js";
import { bimKind, readBimFile } from "../io/bimformats.js";

const fileBase = (name) => name.replace(/\.[^.]+$/, "");

const MESSAGES = {
  "sh3d-old": () => t("This Sweet Home 3D file was saved before version 5.3 and its home could not be read. Open it in Sweet Home 3D 5.3 or later and save it again, then import it."),
  "sh3d-not": () => t("This is not a Sweet Home 3D file."),
  "gbxml-not": () => t("This is not a gbXML file."),
  "ifczip-empty": () => t("This ZIP archive holds no .ifc or .ifcxml file."),
  "ifcxml-not": () => t("This is not an ifcXML file."),
};

// Sweet Home 3D: bring furniture in as the 3D models packed in the file
// (default) or as our own catalog shapes. Asked only when the archive holds
// models; a bare Home.xml has none, so its furniture always maps to the catalog.
let sh3dModels = "file";
async function sh3dOptions(f) {
  let packed = false;
  try {
    const { isZip, zipEntries } = await import("../io/unzip.js");
    packed = isZip(f.bytes) && zipEntries(f.bytes).some((e) => !/^(Home|Home\.xml|ContentDigests)$/.test(e.name));
  } catch { packed = false; }
  if (!packed) return { models: "catalog" };
  const opts = { models: sh3dModels };
  const body = h("div", { class: "form-grid" },
    field(t("Furniture, lights and roofs"), select(opts.models, [["file", t("Use the file's 3D models")], ["catalog", t("Use MyArchitecture furniture shapes")]], { onChange: (v) => { opts.models = v; } })),
    h("p", { class: "field-hint span2" }, t("The file's 3D models look like they do in Sweet Home 3D and are stored inside the project. Our furniture shapes are lighter and can be changed with the furniture tools; roofs then become roofs of ours.")));
  const ok = await modal({ icon: "import", title: t("Import Sweet Home 3D home — {name}", { name: f.name }), width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Import"), value: true, primary: true }] });
  if (!ok) return null;
  sh3dModels = opts.models;
  return opts;
}

export async function importBimFile(app, f, confirmed = false) {
  const kind = bimKind(f.name, f.bytes);
  if (kind === "xml" || !kind) { toast(t("This XML file is neither gbXML, ifcXML nor a Sweet Home 3D Home.xml."), "warn", 6000); return; }
  if (!confirmed && !(await app.confirmDiscard())) return;
  const opts = {};
  if (kind === "sh3d") {
    const sh3d = await sh3dOptions(f);
    if (!sh3d) return;
    opts.sh3d = sh3d;
  }
  const label = { sh3d: opts.sh3d && opts.sh3d.models === "file" ? t("Reading Sweet Home 3D home and its 3D models…") : t("Reading Sweet Home 3D home…"), gbxml: t("Reading gbXML model…"), ifczip: t("Reading IFC model…"), ifcxml: t("Reading IFC model…") }[kind];
  const note = toast(label, "info", 60000);
  await new Promise((r) => setTimeout(r, 30));
  let res;
  try {
    res = await readBimFile(f, opts);
  } catch (e) {
    if (e && MESSAGES[e.code]) { toast(MESSAGES[e.code](), "error", 9000); return; }
    throw e;
  } finally { note.remove(); }
  const project = res.project;
  if (!project.meta.title) project.meta.title = fileBase(f.name);
  app.store.load(project, { fileName: `${fileBase(f.name)}.myarch` });
  app.store.filePath = null;
  app.store.dirty = true;
  app.updateTitle();
  app.setTab("plan");
  if (app.plan.zoomFit) app.plan.zoomFit();
  toast(t("Imported {name}: {l} levels, {w} walls, {o} doors/windows, {r} rooms, {f} furniture.", { name: f.name, l: project.levels.length, w: project.walls.length, o: project.openings.length, r: project.rooms.length, f: project.furniture.length }), "ok", 6000);
  if (res.warnings && res.warnings.length) importReport(app, t("Import notes"), res.warnings);
}
