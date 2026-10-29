// The bottom panel under the drawing (plan, 3D, views), between the side
// panels: tabs for the model
// check's problems, a log of what happened (edits, files, notices, errors)
// and a summary of the project. Collapsed it keeps its tab strip; the toolbar
// button, Ctrl+3 and the strip's ▾/▴ fold and unfold it, and its top edge
// drags its height. State in settings: showBottom, bottomH, bottomTab.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, toastListeners } from "./widgets.js";
import { levelById } from "../core/project.js";
import { roomArea } from "../core/rooms.js";

export const BOTTOM_HEAD_H = 30; // the tab strip, all that shows while folded
export const BOTTOM_MIN_H = 90, BOTTOM_DEFAULT_H = 170;
const CENTER_KEEP_H = 240; // the drawing never gets shorter than this
const LOG_MAX = 500;

const _t = (s) => s; // marks a key for the translation check; t() runs when drawn
const TABS = [
  ["problems", "modelcheck", _t("Problems")],
  ["log", "history", _t("Log")],
  ["summary", "schedule", _t("Project summary")],
];

export class BottomPanel {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.entries = [];
    this.unread = 0;
    this.lastCheck = null;
    this.summaryTimer = 0;
    toastListeners.add((message, kind) => this.log(kind === "ok" ? "info" : kind, message));
    window.addEventListener("error", (e) => this.log("error", e.message || String(e.error || e)));
    window.addEventListener("unhandledrejection", (e) => this.log("error", (e.reason && e.reason.message) || String(e.reason)));
    app.store.on("saved", () => this.log("info", t("Saved {name}", { name: app.store.fileName || t("Untitled") })));
    app.store.on("load", () => this.log("info", t("Opened {name}", { name: app.store.fileName || t("Untitled") })));
    app.store.on("change", (c) => {
      if (c && c.label && !c.load && c.label !== "cancel" && c.label !== "load") this.log("edit", t(c.label));
      clearTimeout(this.summaryTimer);
      this.summaryTimer = setTimeout(() => { if (this.tab() === "summary") this.renderBody(); }, 300);
    });
  }

  get settings() { return this.app.settings; }
  tab() { return TABS.some(([id]) => id === this.settings.bottomTab) ? this.settings.bottomTab : "problems"; }
  open() { return this.settings.showBottom !== false; }
  // Shown on the drawing tabs only, like the side panels.
  shown() { return this.app.tab !== "start"; }

  // ---------------------------------------------------------------- size
  // The centre column holds the document tabs, the drawing and this panel.
  maxHeight() {
    const center = this.host.parentElement;
    const tabs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--doctabs-h")) || 0;
    const room = ((center && center.clientHeight) || window.innerHeight) - tabs - CENTER_KEEP_H;
    return Math.max(BOTTOM_MIN_H, room);
  }
  height() { return Math.round(Math.min(this.maxHeight(), Math.max(BOTTOM_MIN_H, +this.settings.bottomH || BOTTOM_DEFAULT_H))); }

  // Sets the grid row, the classes and the contents.
  apply() {
    const shown = this.shown(), open = this.open();
    const hgt = !shown ? 0 : open ? this.height() : BOTTOM_HEAD_H;
    document.documentElement.style.setProperty("--bottom-h", `${hgt}px`);
    this.host.classList.toggle("hidden", !shown);
    this.host.classList.toggle("folded", shown && !open);
    if (shown) this.render();
  }

  // Window resized: only the height may have to give way.
  fit() {
    if (this.shown() && this.open()) document.documentElement.style.setProperty("--bottom-h", `${this.height()}px`);
  }

  toggle(on = !this.open()) {
    this.settings.showBottom = on;
    if (on) this.unread = 0;
    this.app.saveSettings();
    this.app.applyPanels();
  }

  setTab(id) {
    this.settings.bottomTab = id;
    if (id === "log") this.unread = 0;
    if (!this.open()) { this.toggle(true); return; }
    this.app.saveSettings();
    this.render();
  }

  // ---------------------------------------------------------------- log
  log(kind, text) {
    if (!text) return;
    this.entries.push({ at: new Date(), kind, text: String(text) });
    if (this.entries.length > LOG_MAX) this.entries.splice(0, this.entries.length - LOG_MAX);
    if (!(this.open() && this.tab() === "log")) this.unread++;
    if (!this.shown()) return;
    if (this.tab() === "log" && this.open() && this.list) { this.list.append(this.logRow(this.entries.at(-1))); this.trimLog(); this.list.scrollTop = this.list.scrollHeight; }
    this.renderHead();
  }
  trimLog() { while (this.list && this.list.children.length > LOG_MAX) this.list.firstChild.remove(); }

  // After a model check: the problems tab and the log follow.
  checked(issues) {
    const e = issues.filter((i) => i.severity === "error").length, w = issues.length - e;
    const key = `${e}/${w}`;
    if (this.lastCheck !== null && this.lastCheck !== key) this.log(e ? "error" : w ? "warn" : "info", e || w ? t("Model check: {e} errors, {w} warnings", { e, w }) : t("Model check passed — no problems found."));
    this.lastCheck = key;
    if (this.shown()) { this.renderHead(); if (this.tab() === "problems" && this.open()) this.renderBody(); }
  }

  // ---------------------------------------------------------------- drawing
  render() {
    if (!this.head) {
      this.grip = h("div", { class: "bottom-resize", title: t("Drag to change the height") });
      this.grip.addEventListener("pointerdown", (e) => this.startResize(e));
      this.head = h("div", { class: "bottom-head", role: "tablist" });
      this.body = h("div", { class: "bottom-body" });
      this.host.append(this.grip, this.head, this.body);
    }
    this.renderHead();
    this.renderBody();
  }

  renderHead() {
    if (!this.head) return;
    const issues = this.app.checkIssues || [];
    const errs = issues.filter((i) => i.severity === "error").length;
    const badge = { problems: issues.length ? [issues.length, errs ? "err" : "warn"] : null, log: this.unread ? [this.unread, ""] : null };
    const cur = this.tab(), open = this.open();
    this.head.innerHTML = "";
    for (const [id, ic, label] of TABS) {
      const b = badge[id];
      this.head.append(h("button", { class: `bottom-tab ${open && cur === id ? "on" : ""}`, role: "tab", "aria-selected": String(open && cur === id), "data-bottom-tab": id, onclick: () => (open && cur === id ? this.toggle(false) : this.setTab(id)) },
        h("span", { html: icon(ic, 14) }), h("span", {}, t(label)), b ? h("span", { class: `badge ${b[1]}` }, String(b[0])) : null));
    }
    this.head.append(h("span", { class: "grow" }));
    if (open && cur === "problems") this.head.append(h("button", { class: "icon-btn", title: t("Run the model check again"), "data-bottom-action": "check", html: icon("refresh", 14), onclick: () => this.app.runCheck(false) }));
    if (open && cur === "log") {
      this.head.append(
        h("button", { class: "icon-btn", title: t("Copy the log"), "data-bottom-action": "copy", html: icon("copy", 14), onclick: () => this.copyLog() }),
        h("button", { class: "icon-btn", title: t("Clear the log"), "data-bottom-action": "clear", html: icon("trash", 14), onclick: () => { this.entries = []; this.unread = 0; this.render(); } }));
    }
    this.head.append(h("button", { class: "icon-btn", title: `${open ? t("Hide the bottom panel") : t("Show the bottom panel")}  (Ctrl+3)`, "data-bottom-action": "fold", html: icon(open ? "chevronDown" : "arrowUp", 14), onclick: () => this.toggle() }));
  }

  renderBody() {
    if (!this.body) return;
    this.body.innerHTML = "";
    this.list = null;
    if (!this.open()) return;
    const tab = this.tab();
    if (tab === "problems") this.body.append(this.problems());
    else if (tab === "log") this.body.append(this.logList());
    else this.body.append(this.summary());
  }

  problems() {
    const app = this.app, issues = app.checkIssues || [];
    if (!issues.length) return h("div", { class: "bottom-empty" }, h("span", { html: icon("check", 14) }), t("No problems. The model check runs as you draw: overlapping walls, openings, blocked doors, rooms without doors…"));
    const levelName = (id) => (levelById(app.store.project, id) || {}).name || "";
    const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
    const table = h("div", { class: "bottom-list problems" });
    for (const is of sorted.slice(0, 500)) {
      const row = h("button", { class: `bottom-row ${is.severity}`, title: t("Click to zoom to the problem"), "data-issue": is.code },
        h("span", { class: "ic", html: icon(is.severity === "error" ? "error" : "warning", 14) }),
        h("span", { class: "msg" }, t(is.key, is.vars)),
        h("span", { class: "code" }, is.code), h("span", { class: "lvl" }, levelName(is.level)));
      row.addEventListener("click", () => { if (app.tab !== "plan") app.setTab("plan"); app.plan.focusPoint(is.x, is.y, is.ids || [], is.level); });
      table.append(row);
    }
    return table;
  }

  logRow(e) {
    const ic = { error: "error", warn: "warning", edit: "history" }[e.kind] || "info";
    return h("div", { class: `bottom-row log ${e.kind}` }, h("span", { class: "time" }, e.at.toLocaleTimeString()), h("span", { class: "ic", html: icon(ic, 13) }), h("span", { class: "msg" }, e.text));
  }

  logList() {
    const list = h("div", { class: "bottom-list log" });
    if (!this.entries.length) list.append(h("div", { class: "bottom-empty" }, h("span", { html: icon("info", 14) }), t("Edits, opened files, notices and errors appear here.")));
    for (const e of this.entries) list.append(this.logRow(e));
    this.list = list;
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    return list;
  }

  copyLog() {
    const text = this.entries.map((e) => `${e.at.toLocaleTimeString()}\t${e.kind}\t${e.text}`).join("\n");
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  }

  summary() {
    const p = this.app.store.project;
    const n = (k) => (p[k] || []).length;
    const area = (p.rooms || []).reduce((s, r) => s + roomArea(r), 0) / 1e6;
    const doors = (p.openings || []).filter((o) => o.kind === "door").length;
    const windows = (p.openings || []).filter((o) => o.kind === "window").length;
    const issues = this.app.checkIssues || [];
    const errs = issues.filter((i) => i.severity === "error").length;
    const cells = [
      ["levels", t("Levels"), n("levels")], ["wall", t("Walls"), n("walls")], ["room", t("Rooms"), n("rooms")],
      ["floorplan", t("Floor area"), `${area.toFixed(1)} m²`], ["door", t("Doors"), doors], ["window", t("Windows"), windows],
      ["stairs", t("Stairs"), n("stairs")], ["slab", t("Slabs"), n("slabs")], ["roof", t("Roofs"), n("roofs")],
      ["sofa", t("Furniture"), n("furniture")], ["massShape", t("Masses"), n("solids")],
      ["modelcheck", t("Model check"), issues.length ? `${errs} / ${issues.length - errs}` : "✓"],
    ];
    const grid = h("div", { class: "bottom-summary" });
    for (const [ic, label, v] of cells) grid.append(h("div", { class: "sum-cell" }, h("span", { class: "ic", html: icon(ic, 15) }), h("span", { class: "lbl" }, label), h("b", {}, String(v))));
    return grid;
  }

  // ---------------------------------------------------------------- resize
  startResize(e) {
    if (e.button !== 0 || !this.open()) return;
    e.preventDefault();
    const g = this.grip;
    g.setPointerCapture(e.pointerId);
    g.classList.add("drag");
    const y0 = e.clientY, h0 = this.height();
    const move = (ev) => {
      this.settings.bottomH = Math.round(Math.min(this.maxHeight(), Math.max(BOTTOM_MIN_H, h0 + (y0 - ev.clientY))));
      document.documentElement.style.setProperty("--bottom-h", `${this.settings.bottomH}px`);
      this.app.layout();
    };
    const up = () => {
      g.classList.remove("drag");
      g.removeEventListener("pointermove", move);
      g.removeEventListener("pointerup", up);
      this.app.saveSettings();
      this.app.layout();
    };
    g.addEventListener("pointermove", move);
    g.addEventListener("pointerup", up);
  }
}
