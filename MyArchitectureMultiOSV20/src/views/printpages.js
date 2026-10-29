// Sheets as pages of the print window (src/ui/printwin.js): the print window
// prints either the level plans (one page per level, as before) or the
// project's sheets, each on its own paper size with its title block.

import { t } from "../ui/i18n.js";
import { sheetById } from "./model.js";
import { sheetSvg, prepareSheet, sheetPlanTheme } from "./sheets.js";
import { displayName } from "./names.js";

export const sheetLabel = (s) => `${s.number} — ${displayName(s.name)}`;

export function printableSheets(p) {
  return (p.sheets || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
}

export async function prepareSheets(app, ids) {
  const p = app.store.project;
  for (const id of ids) { const s = sheetById(p, id); if (s) await prepareSheet(p, s, app.store.revision); }
}

// → {svg, W, H, scale, fits, title, paper, paperName, landscape}
export function sheetPrintPage(app, id, cfg = {}) {
  const p = app.store.project;
  const s = sheetById(p, id);
  if (!s) return { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 297 210\" width=\"297\" height=\"210\"></svg>", W: 297, H: 210, scale: 1, fits: true, title: "?", paper: "A4" };
  const r = sheetSvg(p, s, { rev: app.store.revision, t, mono: !!cfg.mono, planTheme: sheetPlanTheme(!!cfg.mono), units: app.settings.units, labels: { up: t("UP") } });
  return { ...r, scale: null, fits: true, title: `${s.number} — ${displayName(s.name)}`, paper: s.paper, paperName: `${s.paper} (${Math.round(r.W)} × ${Math.round(r.H)} mm)`, landscape: r.W > r.H };
}
