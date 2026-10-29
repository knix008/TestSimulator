// Export to Sweet Home 3D (.sh3d): the project as a home Sweet Home 3D 5.3
// and later opens — levels, walls, rooms, doors and windows, furniture with
// 3D models, stairs, roofs, dimensions, labels and the compass
// (src/io/sh3d-export.js does the work).

import { t } from "./i18n.js";
import { toast } from "./widgets.js";
import * as platform from "./platform.js";
import { importReport } from "./dialogs.js";

const baseName = (app) => (app.store.project.meta.title || "home").replace(/[\\/:*?"<>|\s]+/g, "_");

export async function exportSh3dFile(app) {
  const p = app.store.project;
  const note = toast(t("Writing Sweet Home 3D home…"), "info", 120000);
  await new Promise((r) => setTimeout(r, 30));
  let res;
  try {
    const { exportSh3d } = await import("../io/sh3d-export.js");
    res = await exportSh3d(p, { name: baseName(app) });
  } finally { note.remove(); }
  const r = await platform.saveBinaryFile({ name: `${baseName(app)}.sh3d`, bytes: res.bytes, filters: [{ name: "Sweet Home 3D", extensions: ["sh3d"] }] });
  if (!r) return;
  const s = res.stats;
  toast(t("Saved {name}: {w} walls, {r} rooms, {o} doors/windows, {f} pieces with {m} 3D models.", { name: r.name || `${baseName(app)}.sh3d`, w: s.walls, r: s.rooms, o: s.doorsWindows, f: s.furniture, m: s.models }), "ok", 6000);
  if (res.warnings.length) importReport(app, t("Export notes"), res.warnings);
}
