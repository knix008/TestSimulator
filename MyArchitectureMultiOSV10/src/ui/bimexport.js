// gbXML export: the project as an energy-analysis model (spaces with their
// walls, floors, roofs, doors and windows) for OpenStudio, DesignBuilder,
// IES VE, Revit Systems Analysis and other gbXML tools.

import { t } from "./i18n.js";
import { h, modal, toast, field, select } from "./widgets.js";
import * as platform from "./platform.js";
import { importReport } from "./dialogs.js";

const baseName = (app) => (app.store.project.meta.title || "project").replace(/[\\/:*?"<>|\s]+/g, "_");

const BUILDING_TYPES = ["Unknown", "SingleFamily", "MultiFamily", "Office", "Retail", "SchoolOrUniversity", "HospitalOrHealthcare", "Hotel", "Library", "Warehouse", "Manufacturing", "Museum", "ReligiousBuilding"];

export async function exportGbxmlFile(app) {
  const p = app.store.project;
  const opts = { schemaVersion: "7.03", ext: "xml", buildingType: p.meta.buildingType && BUILDING_TYPES.includes(p.meta.buildingType) ? p.meta.buildingType : "Unknown" };
  const body = h("div", { class: "form-grid" },
    field(t("gbXML version"), select(opts.schemaVersion, [["7.03", "gbXML 7.03"], ["6.01", t("gbXML 6.01 (older tools)")]], { onChange: (v) => { opts.schemaVersion = v; } })),
    field(t("File extension"), select(opts.ext, [["xml", ".xml"], ["gbxml", ".gbxml"]], { onChange: (v) => { opts.ext = v; } })),
    field(t("Building type"), select(opts.buildingType, BUILDING_TYPES.map((b) => [b, b]), { onChange: (v) => { opts.buildingType = v; } })),
    h("p", { class: "field-hint span2" }, t("Rooms become spaces; walls, floors, ceilings and roofs become surfaces with the spaces on either side, doors and windows openings in them, wall types constructions with their layers. Draw rooms (or detect them) first: walls without rooms have no space to bound.")));
  const ok = await modal({ title: t("Export gbXML (energy analysis)…"), width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
  if (!ok) return;
  const { exportGbxml, gbxmlModel } = await import("../io/gbxmlwrite.js");
  const text = exportGbxml(p, { schemaVersion: opts.schemaVersion, buildingType: opts.buildingType, version: app.version || "10" });
  const r = await platform.saveTextFile({ name: `${baseName(app)}.${opts.ext}`, text, filters: [{ name: "gbXML", extensions: [opts.ext, opts.ext === "xml" ? "gbxml" : "xml"] }] });
  if (!r) return;
  const m = gbxmlModel(p);
  toast(t("Saved {name}: {s} spaces, {f} surfaces, {o} openings.", { name: r.name, s: m.spaces.length, f: m.surfaces.length, o: m.surfaces.reduce((s, x) => s + x.openings.length, 0) }), "ok", 6000);
  if (!m.spaces.length && p.walls.length) importReport(app, t("Export notes"), [t("The model has no rooms, so the gbXML file has no spaces. Draw rooms or use Build → Detect rooms, then export again.")]);
}
