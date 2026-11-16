// Automatic walk-through (자동 둘러보기), the controls: a bar at the bottom of
// the 3D view while it runs — the room it is in (n / total), previous / pause /
// next room, slower / speed / faster, full screen, stop.
//   F full screen (Esc leaves it first), Esc stops, Space pauses, ← / → previous
//   / next room; a press or wheel in the view pauses (look round by hand), the
//   play button goes on from where the tour was.
// src/core/tour.js plans the route, src/view3d/tourplayer.js walks the camera.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { toast } from "./widgets.js";
import * as platform from "./platform.js";
import { planTour } from "../core/tour.js";

export const TOUR_SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** tab: the View3DTab (src/ui/view3dtab.js). */
export function createTour(tab) {
  const app = tab.app;
  let player = null;
  let bar = null;
  let last = null;
  let full = false;
  let saved = null; // the view options the tour changed
  let unbind = null;
  let pausingClick = false; // the press that paused the tour is not also a click on the model

  const speedIndex = () => { const i = TOUR_SPEEDS.indexOf(app.settings.tourSpeed ?? 1); return i < 0 ? 2 : i; };

  /** Full screen: the 3D view alone over the whole screen (menus, toolbar and panels out of the way). */
  function setFull(on) {
    if (full === on) return;
    full = on;
    document.body.classList.toggle("tour-full", on);
    platform.setFullscreen(on);
    requestAnimationFrame(() => tab.resize());
    render();
  }

  async function start() {
    const v = await tab.ensure();
    if (!v || player) return false;
    const p = app.store.project;
    // Only the levels shown in 3D are walked (hide upper floors to tour one floor).
    const levels = [...tab.levelSet()];
    const cam = v.three.camera.position;
    const t0 = performance.now();
    const moves = planTour(p, { levels, start: [cam.x, cam.z] });
    if (!moves.some((m) => m.type === "look")) { toast(t("There are no rooms to walk through. Draw walls and rooms (Build › Detect rooms from walls) first."), "info", 5000); return false; }
    // Inside at eye height: perspective, no section cut, doors open, no tool.
    saved = { ortho: tab.opts.ortho, section: tab.opts.section, openDoors: tab.opts.openDoors, tool: tab.opts.tool, navMode: tab.opts.navMode };
    if (tab.opts.tool !== "none") tab.setTool(tab.opts.tool);
    if (tab.opts.navMode !== "orbit") tab.setNav("orbit");
    for (const [k, val] of [["ortho", false], ["section", null], ["openDoors", true]]) if (tab.opts[k] !== val) tab.setOpt(k, val);
    if (tab.viewer) tab.viewer.setOptions({ forceOpenDoors: true }); // doors closed on their own open for the walk too
    const { TourPlayer } = await import("../view3d/tourplayer.js");
    player = new TourPlayer(v, p, moves, { speed: TOUR_SPEEDS[speedIndex()], onChange: (s) => { last = s; render(); if (s.done) finished(); } });
    player.planMs = performance.now() - t0;
    showBar();
    // A press or the wheel in the view: the tour pauses so the view can be turned by hand.
    const canvas = v.canvas;
    const pause = () => { if (player && !player.paused) setPaused(true); };
    const press = () => { pausingClick = !!player && !player.paused; pause(); };
    canvas.addEventListener("pointerdown", press);
    canvas.addEventListener("wheel", pause, { passive: true });
    const fsLeft = () => { if (full && !document.fullscreenElement && !platform.isDesktop) setFull(false); };
    document.addEventListener("fullscreenchange", fsLeft);
    unbind = () => { canvas.removeEventListener("pointerdown", press); canvas.removeEventListener("wheel", pause); document.removeEventListener("fullscreenchange", fsLeft); };
    player.start();
    document.body.classList.add("tour-on"); // the floating hint moves above the bar
    app.setHint(t("Walk-through: Space pauses, ← / → previous / next room, F full screen, Esc stops. Drag in the view to look round (the tour pauses)."));
    app.renderToolbar();
    return true;
  }

  function finished() {
    toast(t("The walk-through is finished."), "ok");
    stop();
  }

  function stop({ restore = true } = {}) {
    if (!player) return;
    const p = player;
    player = null;
    setFull(false);
    p.stop({ restore });
    if (unbind) unbind();
    unbind = null;
    bar?.remove();
    bar = null;
    last = null;
    pausingClick = false;
    document.body.classList.remove("tour-on");
    if (saved) {
      for (const k of ["ortho", "section", "openDoors"]) if (tab.opts[k] !== saved[k]) tab.setOpt(k, saved[k]);
      if (tab.viewer) tab.viewer.setOptions({ forceOpenDoors: false });
      if (saved.navMode !== "orbit") tab.setNav(saved.navMode);
      saved = null;
    }
    app.setHint(tab.hintText());
    app.renderToolbar();
  }

  function toggle() { if (player) stop(); else start(); }

  function setPaused(paused) {
    if (!player || player.paused === paused) return;
    if (!paused) player.resume(); else player.setPaused(true);
  }

  function setSpeedIndex(i) {
    const k = Math.max(0, Math.min(TOUR_SPEEDS.length - 1, i));
    app.settings.tourSpeed = TOUR_SPEEDS[k];
    app.saveSettings();
    player?.setSpeed(TOUR_SPEEDS[k]);
    render();
  }

  function showBar() {
    bar?.remove();
    bar = document.createElement("div");
    bar.className = "tour-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", t("Walk-through"));
    bar.addEventListener("pointerdown", (e) => e.stopPropagation());
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tour]");
      if (!b || !player) return;
      const what = b.dataset.tour;
      if (what === "stop") stop();
      else if (what === "pause") setPaused(!player.paused);
      else if (what === "prev") player.skip(-1);
      else if (what === "next") player.skip(1);
      else if (what === "slower") setSpeedIndex(speedIndex() - 1);
      else if (what === "faster") setSpeedIndex(speedIndex() + 1);
      else if (what === "full") setFull(!full);
    });
    tab.host.append(bar);
    render();
  }

  function render() {
    if (!bar || !player) return;
    const s = last ?? {};
    const room = s.room;
    const where = s.climbing ? t("Up the stairs…") : room ? (room.name || t("Room")) : t("Starting…");
    const count = room?.total ? `<span class="tour-count">${room.index} / ${room.total}</span>` : "";
    const btn = (id, glyph, label, extra = "") => `<button class="tour-button" data-tour="${id}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(glyph, 18)}</button>`;
    const sp = TOUR_SPEEDS[speedIndex()];
    bar.innerHTML = `<span class="tour-title">${icon("tour", 18)}<b>${esc(where)}</b>${count}</span>
      <span class="tour-sep"></span>
      ${btn("prev", "skipPrev", t("Previous room (←)"))}${btn("pause", player.paused ? "play" : "pause", player.paused ? t("Go on (Space)") : t("Pause (Space)"))}${btn("next", "skipNext", t("Next room (→)"))}
      <span class="tour-sep"></span>
      ${btn("slower", "minus", t("Slower"), sp <= TOUR_SPEEDS[0] ? "disabled" : "")}<span class="tour-speed" title="${esc(t("Speed"))}">×${sp}</span>${btn("faster", "plus", t("Faster"), sp >= TOUR_SPEEDS.at(-1) ? "disabled" : "")}
      <span class="tour-sep"></span>
      ${btn("full", full ? "exitFullscreen" : "fullscreen", full ? t("Leave full screen (F)") : t("Full screen (F)"), `aria-pressed="${full}"`)}${btn("stop", "close", t("Stop the walk-through (Esc)"))}`;
  }

  /** Keys while the tour runs; true when used. */
  function key(e) {
    if (!player) return false;
    const k = e.key.toLowerCase();
    if (k === "escape") { if (full) setFull(false); else stop(); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === "f") { setFull(!full); return true; }
    if (k === " " || k === "spacebar") { setPaused(!player.paused); return true; }
    if (k === "arrowright") { player.skip(1); return true; }
    if (k === "arrowleft") { player.skip(-1); return true; }
    // The other 3D keys (views, walk, tools) would fight the tour: swallowed while it runs.
    return /^[a-z0-9]$/.test(k) || k.startsWith("arrow");
  }

  return {
    start, stop, toggle, key, setFull,
    /** True (once) when the click the viewer reports was the press that paused the tour: no selection. */
    takePausingClick() { const was = pausingClick; pausingClick = false; return was; },
    get full() { return full; },
    get active() { return !!player; },
    get state() { return player ? { ...last, paused: player.paused, speed: player.speed, moves: player.moves, index: player.index, planMs: player.planMs } : null; },
    debug: () => player,
  };
}
