// Build → "Clean up walls…" (core/wallcleanup.js): the tolerances, a live
// preview of what will change on the current level and what will still be
// wrong, then one undo step. After a plan read from a picture or a DXF, or
// any hand-drawn plan with small gaps and crooked corners.

import { t } from "./i18n.js";
import { h, modal, toast, field, stepper, checkbox } from "./widgets.js";
import { cleanupLevel, applyCleanup, CLEANUP_DEFAULTS } from "../core/wallcleanup.js";
import { levelById } from "../core/project.js";

export function previewText(res) {
  const r = res.report;
  if (!res.changed) return t("Nothing to clean up on this level.");
  const parts = [];
  if (r.removed) parts.push(t("{n} short walls removed", { n: r.removed }));
  if (r.joined) parts.push(t("{n} gaps joined", { n: r.joined }));
  if (r.squared) parts.push(t("{n} corners squared", { n: r.squared }));
  if (r.merged) parts.push(t("{n} straight runs merged", { n: r.merged }));
  return `${parts.join(" · ")}. ${t("Places to check: {a} → {b}.", { a: res.before, b: res.after })}`;
}

export async function wallCleanupDialog(app, { ask = true, options = {} } = {}) {
  const p = app.store.project;
  const level = app.plan.level;
  if (!p.walls.some((w) => w.level === level)) { toast(t("There are no walls on this level."), "info"); return null; }
  const st = app.settings;
  const o = { ...CLEANUP_DEFAULTS, ...(st.wallCleanup || {}), ...options };
  let res = cleanupLevel(p, level, o);
  if (ask) {
    const preview = h("p", { class: "field-hint span2", "data-cleanup-preview": "1" }, previewText(res));
    const redo = () => { res = cleanupLevel(p, level, o); preview.textContent = previewText(res); };
    const mm = (v) => `${Math.round(v)} mm`;
    const body = h("div", { class: "form-grid" },
      field(t("Remove walls shorter than"), stepper(o.minWall, { min: 0, max: 1000, step: 10, editable: true, format: mm, onChange: (v) => { o.minWall = v; redo(); } })),
      field(t("Join wall ends closer than"), stepper(o.joinGap, { min: 0, max: 2000, step: 50, editable: true, format: mm, onChange: (v) => { o.joinGap = v; redo(); } })),
      field(t("Square corners within"), stepper(o.squareDeg, { min: 0, max: 20, step: 1, format: (v) => (v ? `${v}°` : t("Off")), onChange: (v) => { o.squareDeg = v; redo(); } })),
      h("div", {}, checkbox(o.merge, t("Merge straight runs into one wall (same settings only)"), { onChange: (v) => { o.merge = v; redo(); } })),
      h("div", {}, checkbox(o.rooms, t("Find the rooms again (names and finishes are kept)"), { onChange: (v) => { o.rooms = v; redo(); } })),
      preview);
    const ok = await modal({ icon: "wall", title: t("Clean up walls — {level}", { level: (levelById(p, level) || {}).name || "" }), width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Clean up"), value: true, primary: true }] });
    if (!ok) return null;
    st.wallCleanup = { minWall: o.minWall, joinGap: o.joinGap, squareDeg: o.squareDeg, merge: o.merge, rooms: o.rooms };
    app.saveSettings();
  }
  if (!res.changed && !(o.rooms && res.rooms)) { toast(t("Nothing to clean up on this level."), "info"); return res; }
  app.store.edit(t("Clean up walls"), (pr) => applyCleanup(pr, level, res));
  toast(previewText(res), res.after ? "warn" : "ok", 6000);
  return res;
}
