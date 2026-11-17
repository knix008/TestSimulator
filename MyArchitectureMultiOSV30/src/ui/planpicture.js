// Build → "Walls from plan image…": the image underlay of the level (the
// selected one, else the first shown) is read by the recogniser (io/planpicture.js)
// and its walls, doors, windows and rooms are added to the level — or replace
// what the level has — in one undoable step. The underlay is turned with the
// plan when a slightly tilted picture is straightened.

import { settlePieces } from "../core/placement.js";
import { t } from "./i18n.js";
import { h, modal, toast, field, select, checkbox } from "./widgets.js";
import { suggestRoomName } from "../core/rooms.js";
import { pointInPolygon } from "../core/geom.js";

const METHODS = () => [
  ["auto", t("Automatic (best of four ways)")],
  ["walls", t("Walls only (leaves out furniture and colours)")],
  ["outline", t("Ink outlines (clean drawings)")],
  ["edges", t("Edges (scans, photos, sketches)")],
];

/** The underlay to read: the selected one on the level, else the first shown one there. */
export function pictureUnderlay(app) {
  const p = app.store.project;
  const level = app.plan.level;
  const on = p.underlays.filter((u) => u.level === level && u.src);
  return on.find((u) => app.plan.sel.has(u.id)) || on.find((u) => !u.hidden) || on[0] || null;
}

/** The underlay's picture as RGBA pixels at the size it is read at (≤ MAX_DETECT_SIZE, on white). */
async function pixelsOf(u, maxSize) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(t("The image could not be decoded."))); img.src = u.src; });
  const k = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)); const hh = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = hh;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, hh);
  ctx.drawImage(img, 0, 0, w, hh);
  const d = ctx.getImageData(0, 0, w, hh);
  return { image: { data: d.data, width: w, height: hh }, natural: [img.naturalWidth, img.naturalHeight] };
}

export async function wallsFromPicture(app, { underlay = null, ask = true, options = {} } = {}) {
  const u = underlay || pictureUnderlay(app);
  if (!u) { toast(t("Import a plan image first (File → Import image as tracing underlay), then set its width to the real size."), "info", 5000); return null; }
  const p = app.store.project;
  const level = u.level;
  const hasWalls = p.walls.some((w) => w.level === level);
  const st = app.settings;
  const opts = { method: st.pictureMethod || "auto", target: hasWalls ? "add" : "replace", straighten: st.pictureStraighten !== false, ...options };
  if (ask) {
    const body = h("div", { class: "form-grid" },
      field(t("Image"), h("span", {}, `${u.name || t("Image underlay")} · ${(u.w / 1000).toFixed(2)} × ${(u.h / 1000).toFixed(2)} m`),
        t("Walls are as big as the underlay: set its width to the real width first (measure a known length with M).")),
      field(t("How to read it"), select(opts.method, METHODS(), { onChange: (v) => { opts.method = v; } })),
      field(t("Result"), select(opts.target, [["add", t("Add to the level")], ["replace", t("Replace the level's walls and rooms")]], { onChange: (v) => { opts.target = v; } })),
      h("div", { class: "span2" }, checkbox(opts.straighten, t("Straighten a tilted picture (the underlay turns with it)"), { onChange: (v) => { opts.straighten = v; } })),
      h("p", { class: "field-hint span2" }, t("Gaps in the walls become doors (up to 1.2 m) or windows; drawn door swings give the side a door opens to. Check the result and fix what is missing — it is one step to undo.")));
    const ok = await modal({ icon: "underlay", title: t("Walls from plan image"), width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Read walls"), value: true, primary: true }] });
    if (!ok) return null;
    st.pictureMethod = opts.method; st.pictureStraighten = opts.straighten;
    if (app.saveSettings) app.saveSettings();
  }

  const { readPlanPicture, placePicturePlan, MAX_DETECT_SIZE } = await import("../io/planpicture.js");
  // A small window with the progress (the reading takes a second or a few).
  const status = h("div", { class: "field-hint", "data-picture-status": "1" }, t("Reading the picture…"));
  const fill = h("div", { class: "pp-fill" });
  const pct = h("span", { class: "pp-pct" }, "0%");
  const bar = (f) => { fill.style.width = `${Math.round(f * 100)}%`; pct.textContent = `${Math.round(f * 100)}%`; };
  let cancelled = false; let closeProgress = () => {};
  const progress = modal({ icon: "underlay", title: t("Walls from plan image"), width: 420, closeOnBackdrop: false,
    body: h("div", { class: "picture-progress" }, status, h("div", { class: "pp-bar" }, fill), h("div", { class: "pp-foot" }, pct)),
    buttons: [{ label: t("Cancel"), value: "cancel" }], onOpen: (_box, close) => { closeProgress = close; } });
  progress.then((v) => { if (v !== "done") cancelled = true; });
  const breathe = () => new Promise((r) => setTimeout(r, 16));
  let out;
  try {
    await breathe();
    const { image } = await pixelsOf(u, MAX_DETECT_SIZE);
    bar(0.1);
    const metresPerPixel = u.w / 1000 / image.width;
    const result = await readPlanPicture(image, {
      metresPerPixel, method: opts.method,
      step: async (i, n) => { status.textContent = n > 1 ? t("Finding walls ({i} of {n})…", { i: i + 1, n }) : t("Finding walls…"); bar(0.1 + (0.8 * i) / Math.max(1, n)); await breathe(); if (cancelled) throw new Error("cancelled"); },
      furnitureStep: async () => { status.textContent = t("Finding furniture…"); bar(0.86); await breathe(); if (cancelled) throw new Error("cancelled"); },
    });
    if (cancelled) return null;
    status.textContent = t("Placing walls, doors and rooms…"); bar(0.92); await breathe();
    out = placePicturePlan(result, u, { level, pictureWidth: image.width, metresPerPixel, straighten: opts.straighten, roomName: (area, i) => suggestRoomName(area, i, t) });
  } catch (e) {
    if (cancelled) return null;
    closeProgress("done");
    toast(`${t("The picture could not be read.")} ${e.message || e}`, "error", 6000);
    return null;
  }
  closeProgress("done");
  if (cancelled) return null;
  if (!out.walls.length) { toast(t("No walls found in the picture. Try another way of reading it, or check that the underlay is at the real size."), "warn", 6000); return null; }

  app.store.edit(t("Walls from plan image"), (pr) => {
    if (opts.target === "replace") {
      const gone = new Set(pr.walls.filter((w) => w.level === level).map((w) => w.id));
      pr.walls = pr.walls.filter((w) => !gone.has(w.id));
      pr.openings = pr.openings.filter((o) => !gone.has(o.wall));
      pr.rooms = pr.rooms.filter((r) => r.level !== level);
    }
    const floor = st.floorMaterial || "oak";
    pr.walls.push(...out.walls);
    pr.openings.push(...out.openings);
    pr.furniture.push(...(out.furniture || []).map((f) => ({ ...f, level }))); // sofas, beds, tables, plants … read from the picture
    settlePieces(pr, (out.furniture || []).map((f) => f.id)); // a little apart where they overlap
    // Added to a level that has rooms: only the new enclosed spaces.
    const existing = pr.rooms.filter((r) => r.level === level);
    const centre = (pts) => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    for (const r of out.rooms) if (!existing.some((e) => pointInPolygon(...centre(r.pts), e.pts))) pr.rooms.push({ ...r, floor });
    if (out.underlay) { const v = pr.underlays.find((x) => x.id === u.id); if (v) Object.assign(v, out.underlay); }
  });
  app.setTab("plan");
  app.plan.select(out.walls.map((w) => w.id));
  const doors = out.openings.filter((o) => o.kind !== "window").length;
  const windows = out.openings.length - doors;
  toast(t("Read from the picture: {w} walls, {d} doors, {n} windows, {r} rooms.", { w: out.walls.length, d: doors, n: windows, r: out.rooms.length }) + (out.furniture && out.furniture.length ? ` ${t("{n} pieces of furniture and plants.", { n: out.furniture.length })}` : "") + (out.problems ? ` ${t("{n} places to check (open wall ends, overlaps).", { n: out.problems })}` : ""), "ok", 6000);
  return out;
}
