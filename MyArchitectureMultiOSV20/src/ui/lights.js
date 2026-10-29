// Light fixtures in the UI: switching lamps on and off (one, the selection or
// all of them), the 3D night view and the light settings in the properties.
// Every switch is an undoable edit; the 3D view applies it without rebuilding
// the model (viewer.setProject sees that only lamps changed).

import { t } from "./i18n.js";
import { toast } from "./widgets.js";
import { isLight, lightOf, normalizeLight, LIGHT_TEMPERATURES } from "../lib/furniture.js";
export { isLight, isLightKind } from "../lib/furniture.js";

export const lamps = (p) => p.furniture.filter(isLight);
export const anyLampOn = (p) => lamps(p).some((f) => f.light && f.light.on !== false);

// Push a lamp change to the 3D view straight away (no 200 ms debounce).
function sync3d(app) {
  if (app.v3d && app.v3d.viewer) { app.v3d.dirty = true; app.v3d.syncModel(); }
  if (app.renderToolbar) app.renderToolbar(); // the "all lights" button shows the state
}

// Switch the lamps `ids` (on = true/false, or undefined to flip each one).
export function switchLamps(app, ids, on) {
  const set = new Set(ids);
  let n = 0;
  app.store.edit(on === undefined ? t("Switch light") : on ? t("Lights on") : t("Lights off"), (p) => {
    for (const f of p.furniture) {
      if (!set.has(f.id) || !isLight(f)) continue;
      if (!f.light) normalizeLight(f);
      const next = on === undefined ? f.light.on === false : !!on;
      if ((f.light.on !== false) === next) continue;
      f.light.on = next;
      n++;
    }
    return n > 0;
  });
  if (n) sync3d(app);
  return n;
}

// The selected lamps in the plan (or the lamp picked in 3D).
export function selectedLamps(app) {
  const p = app.store.project;
  const ids = new Set(app.plan.sel);
  if (app.tab === "3d" && app.v3d.picked && app.v3d.picked.id) ids.add(app.v3d.picked.id);
  return p.furniture.filter((f) => ids.has(f.id) && isLight(f)).map((f) => f.id);
}

export function toggleSelected(app) {
  const ids = selectedLamps(app);
  if (!ids.length) { toast(t("Select a light fixture first."), "info"); return 0; }
  return switchLamps(app, ids);
}

// Every lamp on, or every lamp off (on undefined: off if any is on).
export function switchAll(app, on) {
  const p = app.store.project;
  const list = lamps(p);
  if (!list.length) { toast(t("This project has no light fixtures. Place one from the Lighting category of the library."), "info", 4000); return 0; }
  const target = on === undefined ? !anyLampOn(p) : on;
  const n = switchLamps(app, list.map((f) => f.id), target);
  toast(target ? t("{n} lights on", { n: list.length }) : t("{n} lights off", { n: list.length }), "info", 1800);
  return n;
}

// Colour-temperature choices for the properties panel.
export function temperatureOptions() {
  const names = { 2700: t("Warm white 2700 K"), 3000: t("Warm white 3000 K"), 4000: t("Neutral white 4000 K"), 5000: t("Cool white 5000 K"), 6500: t("Daylight 6500 K") };
  return [...LIGHT_TEMPERATURES.map(([k, hex]) => [hex, names[k]]), ["", t("Custom colour")]];
}
export const temperatureOf = (hex) => (LIGHT_TEMPERATURES.find(([, c]) => c.toLowerCase() === String(hex || "").toLowerCase()) ? hex : "");

// Short status of a lamp for the properties title.
export function lampSummary(f) {
  const l = lightOf(f);
  if (!l) return "";
  return `${l.on ? t("On") : t("Off")} · ${Math.round(l.lumens)} lm${l.type === "spot" ? ` · ${Math.round(l.beam)}°` : ""}`;
}
