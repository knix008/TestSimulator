// Import of other architecture programs' building models: Sweet Home 3D
// (.sh3d, or a bare Home.xml), gbXML (.gbxml / .xml from Revit, ArchiCAD,
// Vectorworks, OpenStudio…) and IFC packed in a ZIP (.ifczip). Like IFC, each
// becomes a new project of levels, walls, doors/windows, rooms and the rest,
// replacing the open one after the usual unsaved-changes question.

import { t } from "./i18n.js";
import { toast } from "./widgets.js";
import { importReport, closedFormat } from "./dialogs.js";
import { bimKind, readBimFile } from "../io/bimformats.js";

const fileBase = (name) => name.replace(/\.[^.]+$/, "");

const MESSAGES = {
  "sh3d-old": () => t("This Sweet Home 3D file was saved by a version older than 5.3 and has no Home.xml. Open it in Sweet Home 3D 5.3 or later and save it again, then import it."),
  "sh3d-not": () => t("This is not a Sweet Home 3D file."),
  "gbxml-not": () => t("This is not a gbXML file."),
  "ifczip-empty": () => t("This ZIP archive holds no .ifc file."),
};

export async function importBimFile(app, f, confirmed = false) {
  const kind = bimKind(f.name, f.bytes);
  if (kind === "ifcxml") { closedFormat(app, "ifcxml"); return; }
  if (kind === "xml" || !kind) { toast(t("This XML file is neither gbXML nor a Sweet Home 3D Home.xml."), "warn", 6000); return; }
  if (!confirmed && !(await app.confirmDiscard())) return;
  const label = { sh3d: t("Reading Sweet Home 3D home…"), gbxml: t("Reading gbXML model…"), ifczip: t("Reading IFC model…") }[kind];
  const note = toast(label, "info", 60000);
  await new Promise((r) => setTimeout(r, 30));
  let res;
  try {
    res = await readBimFile(f);
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
