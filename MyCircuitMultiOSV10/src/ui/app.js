// Application controller: wires the store, editors, panels, menus, toolbar,
// commands, keyboard shortcuts, files and settings together.

import { Store } from "./store.js";
import { t, setLanguage, getLanguage, onLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, confirmDialog, toast, contextMenu, closeMenus, quickPick, anyModalOpen } from "./widgets.js";
import * as platform from "./platform.js";
import { SchematicEditor, SCH_TOOLS } from "../sch/editor.js";
import { PcbEditor, PCB_TOOLS } from "../pcb/editor.js";
import { setStrokeFont } from "../pcb/render.js";
import { buildNetlist, annotate, runERC, boardNetlist } from "../core/netlist.js";
import { newProject, parseProject, copperLayers } from "../core/project.js";
import { updateBoardFromSchematic, routingStats, boardNets } from "../pcb/board.js";
import { getSymbol } from "../lib/symbols.js";
import { THEMES, DEFAULT_THEME, themeById, uiTokens, canvasColors, randomTheme, setCustomThemes } from "./themes.js";
import { UK_FLAG, KR_FLAG } from "./flags.js";
import { SCH_THEMES } from "../sch/render.js";
import { PCB_THEMES } from "../pcb/render.js";
import * as panels from "./panels.js";
import * as dialogs from "./dialogs.js";
import { SETTING_DEFAULTS } from "./dialogs.js";
import { StartPage } from "./start.js";
import { SimView } from "./simview.js";
import { View3DTab } from "./view3dtab.js";

const VERSION = "10.0.0";

const DEFAULT_SETTINGS = {
  theme: "midnight", lang: "ko", systemDark: "midnight", systemLight: "daylight", showWelcome: false, schGrid: 50, pcbGrid: 0.635, gridStyle: "lines", showGrid: true,
  autosave: true, showRatsnest: true, liveErc: true, liveDrc: true, showSimOverlay: true, showCourtyards: true,
  units: "mm", recent: [], recentSymbols: [], ...SETTING_DEFAULTS, leftW: 280, rightW: 300, showLeft: true, showRight: true,
  outlineRadius: 0, onboarded: false,
};

class App {
  constructor() {
    this.store = new Store();
    this.settings = { ...DEFAULT_SETTINGS };
    this.tab = "start";
    this.clipboard = null;
    this.highlightNet = null;
    this.ercIssues = [];
    this.drcIssues = [];
    this.simOverlay = null;
    this.simResult = null;
    this.commands = new Map();
    this.t = t;
    this.$ = (id) => document.getElementById(id);
  }

  async init() {
    const saved = await platform.loadSettings();
    if (saved) this.settings = { ...DEFAULT_SETTINGS, ...saved };
    // v2 grid: 5×5 lines by default (older settings stored the dot grid).
    if (saved && (saved.gridVersion || 1) < 2) { this.settings.gridStyle = "lines"; this.settings.gridVersion = 2; }
    // v3 navigation: dragging empty canvas moves the drawing (Shift+drag boxes).
    if (saved && (saved.navVersion || 1) < 3) { this.settings.emptyDrag = "pan"; this.settings.navVersion = 3; }
    setCustomThemes(this.settings.customThemes);
    if (!saved) this.settings.lang = (navigator.language || "ko").startsWith("ko") ? "ko" : "en";
    setLanguage(this.settings.lang);
    this.applyTheme();
    if (/mac/i.test(platform.platformName)) document.body.classList.add("mac");
    if (platform.isDesktop) document.body.classList.add("desktop");

    // The vector font lives in the fabrication module; load it lazily so a
    // missing file never blocks start-up.
    import("../fab/strokefont.js").then((m) => { if (m.strokeText) { setStrokeFont(m.strokeText); this.pcb && this.pcb.request(); } }).catch(() => {});

    this.sch = new SchematicEditor(this, this.$("view-sch"));
    this.pcb = new PcbEditor(this, this.$("view-pcb"));
    this.start = new StartPage(this, this.$("view-start"));
    this.simView = new SimView(this, this.$("view-sim"));
    this.v3d = new View3DTab(this, this.$("view-3d"));

    this.registerCommands();
    this.buildMenus();
    this.buildTitleRight();
    this.bindKeys();
    this.bindSplitters();
    this.store.on("change", (info) => this.onDocChange(info));
    this.store.on("preview", () => { this.sch.request(); this.pcb.request(); });
    this.store.on("saved", () => this.updateTitle());
    onLanguage(() => this.refreshAll());

    platform.onOpenPath((p) => this.openPath(p));
    platform.onRequestClose(async () => platform.confirmClose(await this.confirmDiscard()));
    window.addEventListener("beforeunload", (e) => {
      if (this.store.dirty && !platform.isDesktop) { e.preventDefault(); e.returnValue = ""; }
    });
    window.addEventListener("resize", () => this.layout());

    this.applyPanels();
    this.setTab("start");
    this.refreshAll();
    this.checkAutosave();
    this.applySettings();
    if (!this.settings.onboarded || this.settings.showWelcome) setTimeout(() => dialogs.showWelcome(this), 400);
    else if (this.settings.startup === "last" && platform.isDesktop && this.settings.recent && this.settings.recent[0]) setTimeout(() => this.openPath(this.settings.recent[0].path), 300);
  }

  // ---------------------------------------------------------------- theme & settings
  // The active theme object. "system" follows the OS light/dark preference.
  currentTheme() {
    let id = this.settings.theme;
    if (id === "system") {
      const light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      id = light ? (this.settings.systemLight || DEFAULT_THEME.light) : (this.settings.systemDark || DEFAULT_THEME.dark);
    }
    return themeById(id) || themeById(DEFAULT_THEME.dark);
  }

  themeName() {
    return this.currentTheme().mode;
  }

  themeLabel() {
    const th = this.currentTheme();
    return `${th.name[getLanguage()] || th.name.en}${this.settings.theme === "system" ? ` (${t("System")})` : ""}`;
  }

  randomTheme() {
    const th = randomTheme(this.currentTheme().id);
    this.setSetting("theme", th.id);
    toast(t("Theme: {name}", { name: th.name[getLanguage()] || th.name.en }), "info", 1500);
  }

  // Canvas palettes: the editor's light/dark base with the theme's tints.
  schPalette() {
    const th = this.currentTheme();
    return { ...SCH_THEMES[th.mode], ...canvasColors(th).sch };
  }

  pcbPalette() {
    const th = this.currentTheme();
    return { ...PCB_THEMES[th.mode], ...canvasColors(th).pcb };
  }

  applyTheme() {
    const th = this.currentTheme();
    const root = document.documentElement;
    root.dataset.theme = th.mode;
    root.dataset.themeId = th.id;
    for (const [k, v] of Object.entries(uiTokens(th))) root.style.setProperty(k, v);
    platform.setTitleBarTheme({ color: th.panel, symbolColor: th.text });
    if (this.sch) { this.sch.request(); this.pcb.request(); this.v3d.applyTheme(); this.simView.render(); this.buildTitleRight(); }
  }

  // Push every setting into the running program.
  applySettings() {
    this.saveSettings();
    this.applyTheme();
    const root = document.documentElement;
    root.classList.toggle("no-anim", this.settings.animations === false);
    const z = +this.settings.uiScale || 1;
    if (platform.isDesktop && window.mycircuit.setZoom) window.mycircuit.setZoom(z);
    else root.style.zoom = z === 1 ? "" : String(z);
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = setInterval(() => this.autosave(), Math.max(10, +this.settings.autosaveSeconds || 30) * 1000);
    if (this.v3d && this.v3d.viewer) this.v3d.viewer.setOptions({ shadows: this.settings.shadows !== false, background: this.v3d.background(), units3d: this.settings.units3d || "cm", fov: this.settings.fov3d || 35, rotateSpeed: this.settings.rotateSpeed3d || 1 });
    for (const ed of [this.sch, this.pcb]) if (ed && ed.vp) ed.vp.zoomSpeed = this.settings.zoomSpeed || 1;
    this.applyPanels();
    this.refreshAll();
    this.sch.request();
    this.pcb.request();
  }

  saveSettings() {
    platform.saveSettings(this.settings);
  }

  setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    if (key === "theme") this.applyTheme();
    if (key === "customThemes") { setCustomThemes(value); this.applyTheme(); }
    if (key === "lang") setLanguage(value);
    if (key === "units3d" && this.v3d && this.v3d.viewer) this.v3d.viewer.setOptions({ units3d: value });
    this.sch.request();
    this.pcb.request();
    this.renderToolbar();
    this.updateStatus();
  }

  // ---------------------------------------------------------------- tabs
  setTab(tab) {
    if (this.tab === "sch" && tab !== "sch" && this.sch.wire) this.sch.finishWire();
    if (this.tab === "pcb" && tab !== "pcb" && this.pcb.route) this.pcb.finishRoute();
    this.tab = tab;
    for (const id of ["start", "sch", "pcb", "3d", "sim"]) this.$(`view-${id}`).classList.toggle("on", id === tab);
    if (tab === "sch") this.sch.activate();
    if (tab === "pcb") this.pcb.activate();
    if (tab === "3d") this.v3d.activate();
    if (tab === "sim") this.simView.activate();
    if (tab === "start") { this.start.render(); this.setHint(""); }
    this.applyPanels();
    this.renderTabs();
    this.renderToolbar();
    this.renderLeft();
    this.refreshInspector();
    this.updateStatus();
  }

  renderTabs() {
    const bar = this.$("tabbar");
    bar.innerHTML = "";
    const erc = this.ercIssues.filter((i) => i.severity === "error").length;
    const ercW = this.ercIssues.length - erc;
    const drc = this.drcIssues.filter((i) => i.severity === "error").length;
    const st = this.pcb ? this.pcb.stats() : null;
    const defs = [
      ["start", "home", t("Start")],
      ["sch", "resistor", t("Schematic"), erc ? [erc, ""] : ercW ? [ercW, "warn"] : null],
      ["pcb", "chip", t("PCB"), drc ? [drc, ""] : st && st.unrouted ? [st.unrouted, "warn"] : st && st.total ? ["✓", "ok"] : null],
      ["3d", "cube", t("3D View")],
      ["sim", "sim", t("Simulation")],
    ];
    for (const [id, ic, label, badge] of defs) {
      const keyHint = { sch: "F2", pcb: "F3", "3d": "F4", sim: "F6" }[id];
      const b = h("button", { class: `doc-tab ${this.tab === id ? "on" : ""}`, title: keyHint ? `${label} (${keyHint})` : label, onclick: () => this.setTab(id) }, h("span", { html: icon(ic, 16) }), label,
        badge ? h("span", { class: `badge ${badge[1]}` }, String(badge[0])) : null);
      bar.append(b);
    }
    bar.append(h("div", { class: "tab-spacer" }));
    bar.append(h("button", { class: "palette-btn", onclick: () => this.openPalette() }, h("span", { html: icon("search", 14) }), t("Search commands, parts, nets…"), h("kbd", {}, "Ctrl+K")));
  }

  // ---------------------------------------------------------------- panels
  applyPanels() {
    const ws = this.$("workspace");
    const leftOn = this.settings.showLeft && this.tab !== "start";
    const rightOn = this.settings.showRight && this.tab !== "start" && this.tab !== "sim";
    document.documentElement.style.setProperty("--left-w", `${this.settings.leftW}px`);
    document.documentElement.style.setProperty("--right-w", `${this.settings.rightW}px`);
    ws.classList.toggle("no-left", !leftOn);
    ws.classList.toggle("no-right", !rightOn);
    requestAnimationFrame(() => this.layout());
  }

  layout() {
    if (this.tab === "sch") this.sch.vp.resize();
    if (this.tab === "pcb") this.pcb.vp.resize();
    if (this.tab === "3d") this.v3d.resize();
    if (this.tab === "sim") this.simView.render();
  }

  bindSplitters() {
    for (const sp of document.querySelectorAll(".splitter")) {
      sp.addEventListener("pointerdown", (e) => {
        sp.setPointerCapture(e.pointerId);
        sp.classList.add("drag");
        const side = sp.dataset.side;
        const startX = e.clientX;
        const start = side === "left" ? this.settings.leftW : this.settings.rightW;
        const move = (ev) => {
          const d = ev.clientX - startX;
          const w = Math.max(200, Math.min(520, side === "left" ? start + d : start - d));
          if (side === "left") this.settings.leftW = w; else this.settings.rightW = w;
          this.applyPanels();
        };
        const up = () => {
          sp.classList.remove("drag");
          sp.removeEventListener("pointermove", move);
          sp.removeEventListener("pointerup", up);
          this.saveSettings();
        };
        sp.addEventListener("pointermove", move);
        sp.addEventListener("pointerup", up);
      });
    }
  }

  renderLeft() {
    panels.renderLeft(this, this.$("left-panel"));
  }

  refreshInspector() {
    panels.renderRight(this, this.$("right-panel"));
  }

  // ---------------------------------------------------------------- doc changes
  onDocChange(info) {
    if (this.sch && this.sch.syncSheets) this.sch.syncSheets();
    if (info && (info.load || info.restore)) {
      this.sch.selectionChanged();
      this.pcb.selectionChanged();
    }
    if (info && info.load) {
      this.sch.fitted = false;
      this.pcb.fitted = false;
      this.simOverlay = null;
      this.simResult = null;
      this.highlightNet = null;
      this.drcIssues = [];
      this.drcRan = false;
      this.pcb.drcIssues = [];
      if (this.tab === "sch") this.sch.activate();
      if (this.tab === "pcb") this.pcb.activate();
    }
    this.sch.request();
    this.sch.renderPageBar();
    this.pcb.request();
    this.v3d.markDirty();
    this.updateTitle();
    this.scheduleChecks();
    clearTimeout(this.inspectorTimer);
    this.inspectorTimer = setTimeout(() => { this.refreshInspector(); this.renderLeft(); this.renderTabs(); this.updateStatus(); }, 60);
  }

  scheduleChecks() {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      if (this.settings.liveErc) this.runErc(false);
      if (this.settings.liveDrc && this.drcRan) this.runDrc(false);
      this.renderTabs();
    }, 350);
  }

  updateTitle() {
    const name = this.store.fileName || t("Untitled");
    const el = this.$("doc-title");
    el.innerHTML = "";
    el.append(h("span", {}, `${this.store.project.meta.title || name}`), h("span", { class: "dirty" }, this.store.dirty ? " ●" : ""), h("span", {}, `  —  ${name}`));
    platform.setWindowTitle(`${this.store.dirty ? "● " : ""}${name} — MyCircuit 10.0`);
  }

  // ---------------------------------------------------------------- hint & status
  setHint(text) {
    this.hintText = text;
    const el = this.$("hint");
    el.textContent = text || "";
    el.classList.toggle("show", !!text && this.settings.showHints !== false);
    // The hint stays in the status bar; the floating copy fades so it never hides work.
    clearTimeout(this.hintTimer);
    const secs = this.settings.hintSeconds ?? 7;
    if (secs > 0) this.hintTimer = setTimeout(() => el.classList.remove("show"), secs * 1000);
    this.updateStatus();
  }

  updateStatus() {
    panels.renderStatus(this, this.$("statusbar"));
  }

  onToolChanged() {
    this.renderToolbar();
  }

  onLayerChanged() {
    this.renderToolbar();
    this.renderLeft();
    this.updateStatus();
  }

  onSelection(kind, refs) {
    // Cross-probing: what is selected in one view is selected in the others.
    if (this.crossLock || this.settings.crossProbe === false) return;
    this.crossLock = true;
    try {
      if (kind === "sch") { this.pcb.selectRefs(refs); this.v3d.highlight(refs); }
      if (kind === "pcb") { this.sch.selectRefs(refs); this.v3d.highlight(refs); }
      if (kind === "3d") { this.sch.selectRefs(refs); this.pcb.selectRefs(refs); }
    } finally { this.crossLock = false; }
    clearTimeout(this.selTimer);
    this.selTimer = setTimeout(() => this.refreshInspector(), 30);
  }

  crossProbe(refs, target) {
    this.setTab(target);
    if (target === "sch") this.sch.selectRefs(refs, { center: true });
    if (target === "pcb") this.pcb.selectRefs(refs, { center: true });
    if (target === "3d") this.v3d.highlight(refs);
  }

  // ---------------------------------------------------------------- checks
  runErc(show = true) {
    const sch = this.store.project.schematic;
    this.ercIssues = sch.parts.length ? runERC(sch) : [];
    this.sch.request();
    this.refreshInspector();
    this.renderTabs();
    if (show) {
      const e = this.ercIssues.filter((i) => i.severity === "error").length;
      const w = this.ercIssues.length - e;
      toast(e || w ? t("ERC: {e} errors, {w} warnings", { e, w }) : t("ERC passed — no problems found."), e ? "error" : w ? "warn" : "ok");
      this.settings.showRight = true;
      this.applyPanels();
    }
    return this.ercIssues;
  }

  async runDrc(show = true) {
    try {
      const { runDRC } = await import("../pcb/drc.js");
      this.drcIssues = runDRC(this.store.project);
    } catch (e) {
      console.error(e);
      this.drcIssues = [];
      if (show) toast(t("DRC module failed: {m}", { m: e.message }), "error");
      return [];
    }
    this.pcb.drcIssues = this.drcIssues;
    this.drcRan = true;
    this.pcb.request();
    this.refreshInspector();
    this.renderTabs();
    if (show) {
      const e = this.drcIssues.filter((i) => i.severity === "error").length;
      const w = this.drcIssues.length - e;
      toast(e || w ? t("DRC: {e} errors, {w} warnings", { e, w }) : t("DRC passed — the board is clean."), e ? "error" : w ? "warn" : "ok");
      this.settings.showRight = true;
      this.applyPanels();
    }
    return this.drcIssues;
  }

  // ---------------------------------------------------------------- schematic ↔ board
  annotateAll(all = false) {
    let changes = [];
    this.store.edit(t("Annotate"), (p) => {
      changes = annotate(p.schematic, { all });
      if (!changes.length && !all) return false;
      return true;
    });
    toast(changes.length ? t("Annotated {n} parts", { n: changes.length }) : t("All parts are already annotated."), "ok");
  }

  updatePcb() {
    const sch = this.store.project.schematic;
    if (!sch.parts.length) { toast(t("The schematic is empty."), "warn"); return; }
    const unannotated = sch.parts.filter((p) => { const s = getSymbol(p.lib); return s && !s.power && !s.flag && /\?$/.test(p.ref); });
    let summary;
    this.store.edit(t("Update PCB from schematic"), (p) => {
      if (unannotated.length) annotate(p.schematic);
      summary = updateBoardFromSchematic(p.pcb, boardNetlist(p.schematic, buildNetlist(p.schematic)));
    });
    const parts = [];
    if (summary.added.length) parts.push(t("{n} added", { n: summary.added.length }));
    if (summary.updated.length) parts.push(t("{n} updated", { n: summary.updated.length }));
    if (summary.removed.length) parts.push(t("{n} removed", { n: summary.removed.length }));
    if (summary.missingFootprint.length) parts.push(t("no footprint: {refs}", { refs: summary.missingFootprint.join(", ") }));
    toast(parts.length ? t("PCB updated — {s}", { s: parts.join(", ") }) : t("PCB is already up to date."), summary.missingFootprint.length ? "warn" : "ok", 4500);
    this.setTab("pcb");
    this.pcb.zoomFit();
  }

  async autoroute(nets) {
    const { autoroute } = await import("../pcb/autoroute.js");
    const st = routingStats(this.store.project.pcb);
    if (!st.unrouted) { toast(t("Every connection is already routed."), "ok"); return; }
    const note = toast(t("Autorouting {n} connections…", { n: st.unrouted }), "info", 60000);
    await new Promise((r) => setTimeout(r, 30));
    let res;
    try {
      res = autoroute(this.store.project, { nets: nets || undefined, grid: +this.settings.autorouteGrid || 0.25, layers: this.settings.autorouteLayers === "all" ? copperLayers(this.store.project.pcb) : ["F.Cu", "B.Cu"] });
    } catch (e) {
      note.remove();
      toast(t("Autorouter failed: {m}", { m: e.message }), "error");
      return;
    }
    note.remove();
    this.store.edit(t("Autoroute"), (p) => {
      p.pcb.tracks.push(...res.tracks);
      p.pcb.vias.push(...res.vias);
    });
    const after = routingStats(this.store.project.pcb);
    toast(after.unrouted ? t("Routed {r} connections, {f} could not be routed.", { r: res.routed, f: after.unrouted }) : t("All connections routed ({n} tracks, {v} vias) in {ms} ms.", { n: res.tracks.length, v: res.vias.length, ms: Math.round(res.stats ? res.stats.ms : 0) }), after.unrouted ? "warn" : "ok", 5000);
  }

  defaultZoneNet() {
    const nets = boardNets(this.store.project.pcb);
    return nets.find((n) => /^(GND|AGND|DGND|VSS)$/i.test(n)) || nets[0] || "";
  }

  addProbe(net) {
    const sim = this.store.project.sim;
    if (!sim.probes.includes(net)) this.store.edit(t("Add probe"), () => { sim.probes.push(net); });
    this.setTab("sim");
  }

  recordRecentSymbol(lib) {
    const list = [lib, ...this.settings.recentSymbols.filter((x) => x !== lib)].slice(0, 12);
    this.settings.recentSymbols = list;
    this.saveSettings();
  }

  // The guided tour drives the real program; it replaces the open project, so
  // unsaved work is offered for saving first.
  async openTutorial(opts = {}) {
    if (!opts.skipConfirm && !(await this.confirmDiscard())) return null;
    this.store.dirty = false;
    if (!this.tutorial) {
      const { TutorialPlayer } = await import("./tutorial.js");
      this.tutorial = new TutorialPlayer(this);
    }
    await this.tutorial.open(opts);
    return this.tutorial;
  }

  // ---------------------------------------------------------------- dialogs (delegated)
  openPartPicker(opts) { dialogs.partPicker(this, opts); }
  pickPower(cb) { dialogs.powerPicker(this, cb); }
  editPartProperties(part) { dialogs.partProperties(this, part); }
  editFootprintProperties(fp) { dialogs.footprintProperties(this, fp); }
  editZone(zone, isNew) { dialogs.zoneProperties(this, zone, isNew); }

  // ---------------------------------------------------------------- files
  async confirmDiscard() {
    if (!this.store.dirty) return true;
    const r = await modal({
      title: t("Unsaved changes"), width: 460,
      body: h("p", { class: "confirm-text" }, t("Save changes to \"{name}\" before closing?", { name: this.store.fileName || t("Untitled") })),
      buttons: [{ label: t("Cancel"), value: "cancel" }, { label: t("Don't save"), value: "discard", danger: true }, { label: t("Save"), value: "save", primary: true }],
    });
    if (r === "save") return !!(await this.save());
    return r === "discard";
  }

  async newProject() {
    if (!(await this.confirmDiscard())) return;
    this.store.load(newProject(t("Untitled")));
    platform.clearAutosave();
    this.setTab("sch");
    toast(t("New project created. Press A to add a part."), "ok");
  }

  loadText(text, { fileName, filePath } = {}) {
    try {
      const project = parseProject(text);
      this.store.load(project, { fileName, filePath });
      if (filePath) this.addRecent(filePath, project.meta.title);
      return true;
    } catch (e) {
      toast(t("Could not open the file: {m}", { m: e.message }), "error", 6000);
      return false;
    }
  }

  async open() {
    if (!(await this.confirmDiscard())) return;
    const f = await platform.openTextFile({ title: t("Open project") });
    if (!f) return;
    if (this.loadText(f.text, { fileName: f.name, filePath: f.path })) {
      this.setTab(this.store.project.schematic.parts.length ? "sch" : "pcb");
      toast(t("Opened {name}", { name: f.name }), "ok");
    }
  }

  // Hand mode for both 2D editors.
  applyPanMode() {
    for (const ed of [this.sch, this.pcb]) if (ed && ed.vp) ed.vp.setPanMode(this.panMode);
    this.renderToolbar();
    if (this.editor()) this.setHint(this.panMode ? t("Pan mode: left-drag moves the view. Press Esc or the hand button to leave it.") : "");
  }

  // KiCad import: pick the .kicad_sch and/or .kicad_pcb (and sub-sheet files).
  // On the desktop the partner board/schematic and the sub-sheets next to the
  // chosen file are found automatically.
  async importKicad() {
    if (!(await this.confirmDiscard())) return;
    const files = await platform.openTextFiles({ title: t("Import KiCad project"), filters: [{ name: "KiCad", extensions: ["kicad_sch", "kicad_pcb"] }] });
    if (!files.length) return;
    try {
      const kicad = await import("../io/kicad.js");
      const byName = new Map(files.map((f) => [f.name, f]));
      const schs = files.filter((f) => kicad.detectKicadFile(f.text) === "schematic");
      const pcbs = files.filter((f) => kicad.detectKicadFile(f.text) === "pcb");
      if (!schs.length && !pcbs.length) throw new Error(t("These are not KiCad schematic or board files."));
      const dirOf = (f) => (f.path ? f.path.replace(/[^\\/]+$/, "") : null);
      const tryRead = async (dir, name) => {
        if (byName.has(name)) return byName.get(name);
        if (!dir || !platform.isDesktop) return null;
        try { const f = await platform.readPath(dir + name); if (f) byName.set(name, f); return f; } catch { return null; }
      };
      // The root schematic is the one no other schematic references as a sheet.
      const sheetFile = /\(property\s+"Sheet ?file"\s+"([^"]+)"/g;
      const referenced = new Set();
      for (const f of schs) for (const m of f.text.matchAll(sheetFile)) referenced.add(m[1].split(/[\\/]/).pop());
      const anchor = pcbs[0] || schs[0];
      const base = anchor.name.replace(/\.kicad_(sch|pcb)$/, "");
      let root = schs.find((f) => f.name === `${base}.kicad_sch`) || schs.find((f) => !referenced.has(f.name)) || schs[0];
      if (!root) root = await tryRead(dirOf(anchor), `${base}.kicad_sch`);
      const pcb = pcbs[0] || (await tryRead(dirOf(anchor), `${base}.kicad_pcb`));
      // Gather sub-sheets (recursively) from the picked files or the folder.
      const sheetTexts = {};
      const queue = root ? [root] : [];
      while (queue.length) {
        const f = queue.shift();
        for (const m of f.text.matchAll(sheetFile)) {
          const name = m[1].split(/[\\/]/).pop();
          if (sheetTexts[name] !== undefined) continue;
          const sub = await tryRead(dirOf(root), name);
          if (sub) { sheetTexts[name] = sub.text; queue.push(sub); } else sheetTexts[name] = null;
        }
      }
      for (const k of Object.keys(sheetTexts)) if (sheetTexts[k] == null) delete sheetTexts[k];
      const project = kicad.importKicadProject({ schText: root && root.text, pcbText: pcb && pcb.text, name: base, sheetTexts });
      const warnings = project.importWarnings || [];
      this.store.load(project, { fileName: `${base}.mycircuit` });
      this.store.filePath = null;
      this.store.dirty = true;
      this.updateTitle();
      this.setTab(project.schematic.parts.length ? "sch" : "pcb");
      const pages = project.schematic.pages.length;
      toast(t("Imported {name}: {parts} parts, {fps} footprints, {pages} page(s), {w} note(s).", { name: base, parts: project.schematic.parts.length, fps: project.pcb.footprints.length, pages, w: warnings.length }), "ok", 6000);
      if (warnings.length) dialogs.importReport(this, warnings);
    } catch (e) {
      toast(t("KiCad import failed: {m}", { m: e.message }), "error", 7000);
    }
  }

  async openPath(path) {
    if (!(await this.confirmDiscard())) return;
    try {
      const f = await platform.readPath(path);
      if (f && this.loadText(f.text, { fileName: f.name, filePath: f.path })) this.setTab("sch");
    } catch (e) {
      toast(t("Could not open the file: {m}", { m: e.message }), "error");
      this.settings.recent = this.settings.recent.filter((r) => r.path !== path);
      this.saveSettings();
    }
  }

  async openSample(file) {
    if (!(await this.confirmDiscard())) return;
    try {
      const text = await dialogs.loadSampleText(file);
      if (this.loadText(text, { fileName: file })) {
        this.store.filePath = null;
        this.setTab(this.store.project.schematic.parts.length ? "sch" : "pcb");
        toast(t("Sample \"{name}\" opened. Save it under a new name to keep changes.", { name: this.store.project.meta.title }), "ok", 4500);
      }
    } catch (e) {
      toast(t("Could not open the sample: {m}", { m: e.message }), "error");
    }
  }

  async save(saveAs = false) {
    const text = this.store.serialize();
    const base = (this.store.project.meta.title || "untitled").replace(/[\\/:*?"<>|]/g, "_");
    try {
      const r = await platform.saveTextFile({ name: this.store.fileName && this.store.fileName.endsWith(".mycircuit") ? this.store.fileName : `${base}.mycircuit`, text, path: saveAs ? null : this.store.filePath, title: t("Save project") });
      if (!r) return null;
      this.store.markSaved({ fileName: r.name, filePath: r.path || null });
      if (r.path) this.addRecent(r.path, this.store.project.meta.title);
      platform.clearAutosave();
      toast(t("Saved {name}", { name: r.name }), "ok", 1800);
      return r;
    } catch (e) {
      toast(t("Save failed: {m}", { m: e.message }), "error");
      return null;
    }
  }

  addRecent(path, title) {
    this.settings.recent = [{ path, title: title || "", at: Date.now() }, ...this.settings.recent.filter((r) => r.path !== path)].slice(0, +this.settings.recentLimit || 10);
    this.saveSettings();
  }

  autosave() {
    if (!this.settings.autosave || !this.store.dirty) return;
    platform.storeAutosave(JSON.stringify({ fileName: this.store.fileName, filePath: this.store.filePath, project: this.store.project }));
  }

  async checkAutosave() {
    const a = platform.readAutosave();
    if (!a) return;
    const when = new Date(a.at).toLocaleString();
    const ok = await confirmDialog(t("An unsaved project from {when} was recovered. Restore it?", { when }), { title: t("Recover work"), ok: t("Restore"), cancel: t("Discard") });
    if (ok) {
      try {
        const data = JSON.parse(a.text);
        this.store.load(data.project, { fileName: data.fileName, filePath: data.filePath });
        this.store.dirty = true;
        this.updateTitle();
        this.setTab("sch");
      } catch (e) { toast(e.message, "error"); }
    }
    platform.clearAutosave();
  }

  // ---------------------------------------------------------------- commands
  cmd(id, spec) {
    this.commands.set(id, { id, ...spec });
  }

  run(id, ...args) {
    const c = this.commands.get(id);
    if (!c) return;
    if (c.enabled && !c.enabled()) return;
    closeMenus();
    try {
      const r = c.run(...args);
      if (r && r.catch) r.catch((e) => { console.error(e); toast(e.message, "error"); });
    } catch (e) {
      console.error(e);
      toast(e.message, "error");
    }
  }

  editor() {
    return this.tab === "sch" ? this.sch : this.tab === "pcb" ? this.pcb : null;
  }

  registerCommands() {
    const C = (id, label, ic, key, run, extra = {}) => this.cmd(id, { label, icon: ic, key, run, ...extra });
    const inSch = () => this.tab === "sch";
    const inPcb = () => this.tab === "pcb";
    const inEditor = () => inSch() || inPcb();
    // File
    C("file.new", "New project", "new", "Ctrl+N", () => this.newProject());
    C("file.open", "Open…", "open", "Ctrl+O", () => this.open());
    C("file.importKicad", "Import KiCad project…", "import", "", () => this.importKicad());
    C("file.save", "Save", "save", "Ctrl+S", () => this.save());
    C("file.saveAs", "Save as…", "saveAs", "Ctrl+Shift+S", () => this.save(true));
    C("file.samples", "Open sample…", "sample", "", () => dialogs.samplePicker(this));
    C("file.print", "Print…", "print", "Ctrl+P", () => dialogs.printDialog(this));
    C("file.props", "Project properties…", "info", "", () => dialogs.projectProperties(this));
    C("file.exportSchSvg", "Export schematic as SVG", "image", "", () => dialogs.exportSchematicSvg(this));
    C("file.exportSchPng", "Export schematic as PNG", "image", "", () => dialogs.exportSchematicPng(this));
    C("file.exportPcbSvg", "Export PCB as SVG", "image", "", () => dialogs.exportPcbSvg(this));
    C("file.exportNetlist", "Export netlist (KiCad)", "netlist", "", () => dialogs.exportNetlist(this));
    C("file.exportSpice", "Export SPICE netlist", "sim", "", () => dialogs.exportSpice(this));
    C("file.exportBom", "Export BOM (CSV)", "bom", "", () => dialogs.bomDialog(this));
    C("file.exportPnp", "Export pick & place (CSV)", "export", "", () => dialogs.exportPnp(this));
    C("file.fab", "Fabrication outputs (Gerber, drill)…", "factory", "", () => dialogs.fabricationDialog(this));
    C("file.export3d", "Export 3D model (STL / GLB)…", "cube", "", () => this.v3d.exportDialog());
    C("file.exit", "Exit", "close", "Alt+F4", () => window.close(), { enabled: () => platform.isDesktop });
    // Edit
    C("edit.undo", "Undo", "undo", "Ctrl+Z", () => { const l = this.store.undo(); if (l) toast(t("Undo: {l}", { l: t(l) }), "info", 1200); }, { enabled: () => this.store.canUndo() });
    C("edit.redo", "Redo", "redo", "Ctrl+Y", () => { const l = this.store.redo(); if (l) toast(t("Redo: {l}", { l: t(l) }), "info", 1200); }, { enabled: () => this.store.canRedo() });
    C("edit.cut", "Cut", "cut", "Ctrl+X", () => this.sch.cut(), { enabled: inSch });
    C("edit.copy", "Copy", "copy", "Ctrl+C", () => this.sch.copy(), { enabled: inSch });
    C("edit.paste", "Paste", "paste", "Ctrl+V", () => this.sch.paste(), { enabled: inSch });
    C("edit.duplicate", "Duplicate", "copy", "Ctrl+D", () => this.editor() && this.editor().duplicate(), { enabled: inEditor });
    C("edit.delete", "Delete", "trash", "Del", () => this.editor() && this.editor().deleteSelection(), { enabled: inEditor });
    C("edit.selectAll", "Select all", "select", "Ctrl+A", () => this.editor() && this.editor().selectAll(), { enabled: inEditor });
    C("edit.rotate", "Rotate", "rotate", "R", () => this.editor() && this.editor().rotate(), { enabled: inEditor });
    C("edit.mirror", "Mirror horizontally", "mirror", "Y", () => this.sch.mirror("x"), { enabled: inSch });
    C("edit.mirrorV", "Mirror vertically", "flip", "X", () => this.sch.mirror("y"), { enabled: inSch });
    C("edit.flip", "Flip to other side", "flip", "F", () => this.pcb.flip(), { enabled: inPcb });
    C("edit.find", "Find…", "search", "Ctrl+F", () => dialogs.findDialog(this));
    C("edit.history", "Undo history…", "history", "", () => dialogs.historyDialog(this));
    // View
    C("view.start", "Start page", "home", "", () => this.setTab("start"));
    C("view.sch", "Schematic editor", "resistor", "F2", () => this.setTab("sch"));
    C("view.pcb", "PCB editor", "chip", "F3", () => this.setTab("pcb"));
    C("view.3d", "3D viewer", "cube", "F4", () => this.setTab("3d"));
    C("view.sim", "Simulation", "sim", "F6", () => this.setTab("sim"));
    C("view.zoomIn", "Zoom in", "zoomIn", "Ctrl+=", () => this.editor() && this.editor().vp.zoomBy(1.25), { enabled: inEditor });
    C("view.zoomOut", "Zoom out", "zoomOut", "Ctrl+-", () => this.editor() && this.editor().vp.zoomBy(0.8), { enabled: inEditor });
    C("view.fit", "Zoom to fit", "zoomFit", "Home", () => { if (this.editor()) this.editor().zoomFit(); else if (this.tab === "3d") this.v3d.zoomToFit(); });
    C("view.grid", "Show grid", "grid", "", () => this.setSetting("showGrid", this.settings.showGrid === false), { checked: () => this.settings.showGrid !== false });
    C("view.rulers", "Show rulers", "ruler", "", () => this.setSetting("showRulers", this.settings.showRulers === false), { checked: () => this.settings.showRulers !== false });
    C("view.boardSize", "Show board size", "dimension", "", () => this.setSetting("showBoardSize", this.settings.showBoardSize === false), { checked: () => this.settings.showBoardSize !== false });
    C("view.pan", "Pan (hand): left-drag moves the view", "hand", "", () => { this.panMode = !this.panMode; this.applyPanMode(); }, { checked: () => !!this.panMode, enabled: inEditor });
    C("view.left", "Show library / layers panel", "library", "Ctrl+1", () => { this.settings.showLeft = !this.settings.showLeft; this.saveSettings(); this.applyPanels(); }, { checked: () => this.settings.showLeft });
    C("view.right", "Show inspector panel", "list", "Ctrl+2", () => { this.settings.showRight = !this.settings.showRight; this.saveSettings(); this.applyPanels(); }, { checked: () => this.settings.showRight });
    C("view.ratsnest", "Show ratsnest", "netlist", "", () => this.setSetting("showRatsnest", !this.settings.showRatsnest), { checked: () => this.settings.showRatsnest });
    C("view.contrast", "High-contrast layers", "layers", "H", () => { this.pcb.highContrast = !this.pcb.highContrast; this.pcb.request(); this.renderToolbar(); }, { checked: () => this.pcb.highContrast, enabled: inPcb });
    C("view.simOverlay", "Show simulation voltages on schematic", "probe", "", () => this.setSetting("showSimOverlay", !this.settings.showSimOverlay), { checked: () => this.settings.showSimOverlay });
    C("view.themeDark", "Dark theme", "moon", "", () => this.setSetting("theme", DEFAULT_THEME.dark), { checked: () => this.settings.theme !== "system" && this.themeName() === "dark" });
    C("view.themeLight", "Light theme", "sun", "", () => this.setSetting("theme", DEFAULT_THEME.light), { checked: () => this.settings.theme !== "system" && this.themeName() === "light" });
    C("view.themes", "Themes…", "sun", "", () => dialogs.themeGallery(this));
    C("view.themeSystem", "System theme", "monitor", "", () => this.setSetting("theme", "system"), { checked: () => this.settings.theme === "system" });
    C("view.langKo", "한국어", "globe", "", () => this.setSetting("lang", "ko"), { checked: () => getLanguage() === "ko" });
    C("view.langEn", "English", "globe", "", () => this.setSetting("lang", "en"), { checked: () => getLanguage() === "en" });
    // Place (schematic)
    for (const [id, def] of Object.entries(SCH_TOOLS)) {
      C(`sch.${id}`, def.label, def.icon, def.key, () => {
        this.setTab("sch");
        if (id === "place") this.openPartPicker();
        else if (id === "power") this.pickPower((lib) => this.sch.setTool("place", { lib }));
        else this.sch.setTool(id);
      }, { checked: () => this.tab === "sch" && (this.sch.tool === id || (id === "place" && this.sch.tool === "place")), tool: true });
    }
    // Route (PCB)
    for (const [id, def] of Object.entries(PCB_TOOLS)) {
      C(`pcb.${id}`, def.label, def.icon, def.key, () => { this.setTab("pcb"); this.pcb.setTool(id); }, { checked: () => this.tab === "pcb" && this.pcb.tool === id, tool: true });
    }
    C("pcb.autoroute", "Autoroute all", "autoroute", "Ctrl+Shift+A", () => this.autoroute());
    C("pcb.autorouteNet", "Autoroute highlighted net", "wand", "", () => { const n = this.pcb.highlightNet; if (n) this.autoroute([n]); else toast(t("Click a pad or track first to pick a net."), "warn"); });
    C("pcb.unroute", "Remove all tracks and vias", "trash", "", async () => {
      if (await confirmDialog(t("Delete every track and via on the board?"), { danger: true, ok: t("Delete") })) this.store.edit(t("Remove all tracks"), (p) => { p.pcb.tracks = []; p.pcb.vias = []; });
    });
    C("pcb.groundPour", "Fill board with ground zone", "zone", "", () => dialogs.groundPour(this));
    C("pcb.cleanup", "Clean up tracks", "refresh", "", () => dialogs.cleanupTracks(this));
    C("pcb.arrange", "Arrange footprints on board", "grid", "", () => dialogs.arrange(this));
    C("pcb.layerUp", "Previous copper layer", "arrowUp", "PgUp", () => this.pcb.cycleLayer(-1), { enabled: inPcb });
    C("pcb.layerDown", "Next copper layer", "arrowDown", "PgDn", () => this.pcb.cycleLayer(1), { enabled: inPcb });
    // Inspect
    C("inspect.erc", "Electrical rules check (ERC)", "erc", "", () => { this.setTab("sch"); this.runErc(true); });
    C("inspect.drc", "Design rules check (DRC)", "drc", "", () => { this.setTab("pcb"); this.runDrc(true); });
    C("inspect.nets", "Net list…", "netlist", "", () => dialogs.netlistDialog(this));
    C("inspect.lengths", "Net length report…", "measure", "", () => dialogs.lengthReport(this));
    C("pcb.tuneLengths", "Length tuning…", "measure", "", () => dialogs.lengthTuning(this), { enabled: inPcb });
    C("pcb.diffPair", "Route differential pair…", "route", "", () => dialogs.diffPairs(this), { enabled: inPcb });
    C("pcb.modeHighlight", "Routing: highlight collisions", "eye", "", () => this.setSetting("routeMode", "highlight"), { checked: () => (this.settings.routeMode || "highlight") === "highlight" });
    C("pcb.modeShove", "Routing: push and shove", "route", "", () => this.setSetting("routeMode", "shove"), { checked: () => this.settings.routeMode === "shove" });
    C("pcb.modeBlock", "Routing: stop at obstacles", "lock", "", () => this.setSetting("routeMode", "block"), { checked: () => this.settings.routeMode === "block" });
    // Tools
    C("tools.annotate", "Annotate schematic", "annotate", "", () => this.annotateAll(false));
    C("tools.reannotate", "Re-annotate all parts", "annotate", "", () => this.annotateAll(true));
    C("tools.footprints", "Assign footprints…", "chip", "", () => dialogs.assignFootprints(this));
    C("tools.updatePcb", "Update PCB from schematic", "updatePcb", "F8", () => this.updatePcb());
    C("tools.boardSetup", "Board setup…", "settings", "", () => dialogs.boardSetup(this));
    C("tools.symbolEditor", "Symbol editor…", "symbolEdit", "", () => dialogs.symbolEditor(this));
    C("tools.footprintWizard", "Footprint wizard…", "footprintEdit", "", () => dialogs.footprintWizard(this));
    C("tools.calculators", "Calculators…", "calculator", "", () => dialogs.calculators(this));
    C("tools.gerberViewer", "Gerber viewer…", "gerber", "", () => dialogs.gerberViewer(this));
    C("tools.bom", "Bill of materials…", "bom", "", () => dialogs.bomDialog(this));
    C("tools.settings", "Settings…", "settings", "Ctrl+,", () => dialogs.settingsDialog(this));
    // Simulate
    C("sim.run", "Run simulation", "play", "F5", () => { this.setTab("sim"); this.simView.run(); });
    C("sim.op", "Operating point (DC)", "sim", "", () => { this.store.project.sim.mode = "op"; this.setTab("sim"); this.simView.run(); });
    C("sim.tran", "Transient analysis", "graph", "", () => { this.store.project.sim.mode = "tran"; this.setTab("sim"); this.simView.run(); });
    C("sim.ac", "AC analysis (Bode)", "graph", "", () => { this.store.project.sim.mode = "ac"; this.setTab("sim"); this.simView.run(); });
    C("sim.dc", "DC sweep", "graph", "", () => { this.store.project.sim.mode = "dc"; this.setTab("sim"); this.simView.run(); });
    C("sim.spice", "Show SPICE netlist…", "list", "", () => dialogs.showSpice(this));
    C("sim.clear", "Clear simulation overlay", "close", "", () => { this.simOverlay = null; this.sch.request(); });
    // Help
    C("help.tutorial", "Interactive tutorial", "sample", "", () => this.openTutorial());
    C("help.manual", "User manual", "help", "F1", () => dialogs.manual(this));
    C("help.keys", "Keyboard shortcuts", "keyboard", "Ctrl+/", () => dialogs.shortcuts(this));
    C("help.tour", "Quick tour", "info", "", () => dialogs.showWelcome(this));
    C("help.about", "About MyCircuit", "info", "", () => dialogs.about(this, VERSION));
    C("palette", "Command palette", "command", "Ctrl+K", () => this.openPalette());
  }

  buildMenus() {
    const M = {
      File: ["file.new", "file.open", "file.samples", "@recent", "file.importKicad", "-", "file.save", "file.saveAs", "-", "@export", "file.fab", "-", "file.print", "file.props", "-", "file.exit"],
      Edit: ["edit.undo", "edit.redo", "edit.history", "-", "edit.cut", "edit.copy", "edit.paste", "edit.duplicate", "edit.delete", "-", "edit.selectAll", "edit.find", "-", "edit.rotate", "edit.mirror", "edit.mirrorV", "edit.flip"],
      View: ["view.start", "view.sch", "view.pcb", "view.3d", "view.sim", "-", "view.zoomIn", "view.zoomOut", "view.fit", "view.pan", "-", "view.grid", "view.rulers", "view.boardSize", "view.left", "view.right", "view.ratsnest", "view.contrast", "view.simOverlay"],
      Place: ["sch.place", "sch.power", "sch.wire", "sch.bus", "sch.label", "sch.global", "sch.hlabel", "sch.sheet", "sch.noconnect", "sch.junction", "sch.text", "-", "sch.measure", "sch.dimension"],
      Route: ["pcb.route", "pcb.via", "pcb.zone", "pcb.outline", "pcb.text", "pcb.line", "pcb.dimension", "pcb.measure", "-", "pcb.autoroute", "pcb.autorouteNet", "pcb.diffPair", "pcb.tuneLengths", "-", "pcb.modeHighlight", "pcb.modeShove", "pcb.modeBlock", "-", "pcb.groundPour", "pcb.arrange", "pcb.cleanup", "pcb.unroute"],
      Inspect: ["inspect.erc", "inspect.drc", "-", "inspect.nets", "inspect.lengths"],
      Tools: ["tools.annotate", "tools.reannotate", "tools.footprints", "tools.updatePcb", "-", "tools.boardSetup", "tools.symbolEditor", "tools.footprintWizard", "-", "tools.bom", "tools.gerberViewer", "tools.calculators", "-", "tools.settings"],
      Simulate: ["sim.run", "-", "sim.op", "sim.tran", "sim.ac", "sim.dc", "-", "sim.spice", "sim.clear"],
      Help: ["help.tutorial", "help.manual", "help.keys", "help.tour", "-", "help.about"],
    };
    this.menuMap = M;
    const bar = this.$("menubar");
    bar.innerHTML = "";
    for (const [name, ids] of Object.entries(M)) {
      const btn = h("button", { class: "menu-root", "data-menu": name }, t(name));
      const open = () => {
        document.querySelectorAll(".menu-root.open").forEach((b) => b.classList.remove("open"));
        btn.classList.add("open");
        const r = btn.getBoundingClientRect();
        const menu = contextMenu(this.menuItems(ids), r.left, r.bottom + 2);
        menu.dataset.root = name;
        const obs = new MutationObserver(() => { if (!menu.isConnected) { btn.classList.remove("open"); obs.disconnect(); } });
        obs.observe(document.body, { childList: true });
      };
      btn.addEventListener("click", open);
      btn.addEventListener("pointerenter", () => { if (document.querySelector(".ctx-menu[data-root]") && !btn.classList.contains("open")) open(); });
      bar.append(btn);
    }
  }

  menuRootOf(id) {
    for (const [name, ids] of Object.entries(this.menuMap || {})) if (ids.includes(id)) return name;
    return null;
  }

  menuItems(ids) {
    const out = [];
    for (const id of ids) {
      if (id === "-") { out.push("-"); continue; }
      if (id === "@recent") {
        const rec = this.settings.recent || [];
        if (rec.length) out.push({ label: t("Open recent ▸"), icon: "history", action: () => dialogs.recentPicker(this) });
        continue;
      }
      if (id === "@export") {
        out.push({ label: t("Export ▸"), icon: "export", action: () => dialogs.exportPicker(this) });
        continue;
      }
      const c = this.commands.get(id);
      if (!c) continue;
      out.push({ label: t(c.label), icon: c.checked ? null : c.icon, shortcut: c.key, checked: c.checked ? c.checked() : false, disabled: c.enabled ? !c.enabled() : false, action: () => this.run(id) });
    }
    return out;
  }

  buildTitleRight() {
    const host = this.$("title-right");
    host.innerHTML = "";
    const ko = getLanguage() === "ko";
    // Theme: the palette applies a random theme, the caret opens the list.
    const themeSplit = h("div", { class: "split-btn" },
      h("button", { class: "icon-btn", title: `${t("Random theme")} — ${this.themeLabel()}`, html: icon("palette", 17), onclick: () => this.randomTheme() }),
      h("button", { class: "icon-btn caret", title: t("Choose a theme"), html: icon("chevronDown", 13), onclick: (e) => dialogs.themeMenu(this, e.currentTarget.parentElement.getBoundingClientRect()) }));
    host.append(
      themeSplit,
      // Language toggle: shows the flag of the language it switches to.
      h("button", { class: "icon-btn lang-toggle", title: ko ? "Switch to English" : "한국어로 바꾸기", html: ko ? UK_FLAG : KR_FLAG, onclick: () => this.setSetting("lang", ko ? "en" : "ko") }),
      h("button", { class: "icon-btn", title: t("Settings…"), html: icon("settings", 16), onclick: () => this.run("tools.settings") }),
      h("button", { class: "icon-btn", title: t("About MyCircuit"), html: icon("info", 16), onclick: () => this.run("help.about") }),
    );
  }

  // ---------------------------------------------------------------- toolbar
  // Every toolbar button must stay visible: the window may not become
  // narrower than the widest toolbar seen so far.
  fitToolbar(bar) {
    requestAnimationFrame(() => {
      const measure = () => {
        const cs = getComputedStyle(bar);
        const kids = [...bar.children];
        let need = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1) + 12;
        for (const k of kids) {
          if (k.classList.contains("grow")) continue;
          const st = getComputedStyle(k);
          need += k.getBoundingClientRect().width + parseFloat(st.marginLeft) + parseFloat(st.marginRight);
        }
        return Math.ceil(need);
      };
      const z = platform.isDesktop ? +this.settings.uiScale || 1 : 1;
      // On a narrow screen the labelled buttons drop their text (icons and
      // tooltips stay) so the whole toolbar still fits.
      const screenW = Math.floor(((window.screen && window.screen.availWidth) || 1920) / z) - 16;
      bar.classList.remove("compact", "wrap");
      document.documentElement.classList.remove("toolbar-wrap");
      let need = measure();
      if (need > screenW || need > bar.clientWidth + 1 && !platform.isDesktop) { bar.classList.add("compact"); need = measure(); }
      // Still too wide for the screen: let the toolbar take a second row.
      if (need > screenW) { bar.classList.add("wrap"); document.documentElement.classList.add("toolbar-wrap"); need = Math.min(need, screenW); }
      bar.dataset.need = String(need);
      const w = Math.ceil(need * z);
      if (w > (this.toolbarMinWidth || 0)) { this.toolbarMinWidth = w; platform.setMinSize(w, 700); }
    });
  }

  renderToolbar() {
    const bar = this.$("toolbar");
    bar.innerHTML = "";
    const btn = (id, { label = false } = {}) => {
      const c = this.commands.get(id);
      if (!c) return null;
      const on = c.checked ? c.checked() : false;
      const b = h("button", { class: `icon-btn ${on ? "on" : ""}`, "data-cmd": id, title: `${t(c.label)}${c.key ? `  (${c.key})` : ""}`, disabled: c.enabled ? !c.enabled() : false, onclick: () => this.run(id) },
        h("span", { html: icon(c.icon, 18) }), label ? h("span", { class: "lbl" }, t(c.label)) : null);
      return b;
    };
    const sep = () => h("div", { class: "sep" });
    const add = (...els) => bar.append(...els.filter(Boolean));
    add(btn("file.new"), btn("file.open"), btn("file.save"), sep(), btn("edit.undo"), btn("edit.redo"), sep());
    if (this.tab === "start") {
      add(btn("file.samples", { label: true }), btn("view.sch", { label: true }), btn("view.pcb", { label: true }), btn("help.manual", { label: true }));
    } else if (this.tab === "sch") {
      add(btn("sch.select"), btn("sch.place"), btn("sch.power"), btn("sch.wire"), btn("sch.bus"), btn("sch.label"), btn("sch.global"), btn("sch.noconnect"), btn("sch.junction"), btn("sch.text"), btn("sch.hlabel"), btn("sch.sheet"), btn("sch.measure"), btn("sch.dimension"), sep(),
        btn("edit.rotate"), btn("edit.mirror"), btn("edit.mirrorV"), btn("edit.delete"), sep(),
        btn("tools.annotate"), btn("inspect.erc"), btn("tools.footprints"), btn("tools.updatePcb", { label: true }), sep(), btn("sim.run"),
        h("div", { class: "grow" }), btn("view.pan"), btn("view.grid"), btn("view.rulers"), sep(), btn("view.zoomOut"), btn("view.zoomIn"), btn("view.fit"));
    } else if (this.tab === "pcb") {
      const cu = copperLayers(this.store.project.pcb);
      const layerSel = h("select", { class: "input", title: t("Active layer (PgUp / PgDn)"), onchange: (e) => this.pcb.setActiveLayer(e.target.value) });
      for (const l of [...cu, "F.SilkS", "B.SilkS", "Edge.Cuts", "Dwgs.User"]) {
        const o = h("option", { value: l }, l);
        if (l === this.pcb.activeLayer) o.selected = true;
        layerSel.append(o);
      }
      add(btn("pcb.select"), btn("pcb.route"), btn("pcb.via"), btn("pcb.zone"), btn("pcb.outline"), btn("pcb.text"), btn("pcb.line"), btn("pcb.dimension"), btn("pcb.measure"), sep(),
        h("span", { class: "group-label" }, t("Layer")), layerSel, sep(),
        btn("edit.rotate"), btn("edit.flip"), btn("edit.delete"), sep(),
        btn("inspect.drc"), btn("pcb.autoroute", { label: true }), btn("pcb.groundPour"), btn("tools.boardSetup"), btn("file.fab"), sep(), btn("view.contrast"), btn("view.ratsnest"),
        h("div", { class: "grow" }), btn("view.pan"), btn("view.grid"), btn("view.rulers"), btn("view.boardSize"), sep(), btn("view.zoomOut"), btn("view.zoomIn"), btn("view.fit"));
    } else if (this.tab === "3d") {
      this.v3d.renderToolbar(bar, btn, sep);
    } else if (this.tab === "sim") {
      this.simView.renderToolbar(bar, btn, sep);
    }
    add(h("div", { class: "grow" }), btn("help.tutorial"), btn("help.keys"), btn("help.about"));
    this.fitToolbar(bar);
  }

  // ---------------------------------------------------------------- keyboard
  bindKeys() {
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable);
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (anyModalOpen()) return;
      // Global shortcuts that work even while a text field has focus.
      if (ctrl && !e.altKey) {
        const lk = k.toLowerCase();
        const map = { s: e.shiftKey ? "file.saveAs" : "file.save", o: "file.open", n: "file.new", p: "file.print", k: "palette", f: "edit.find", ",": "tools.settings", "/": "help.keys", "1": "view.left", "2": "view.right" };
        if (map[lk]) { e.preventDefault(); this.run(map[lk]); return; }
        if (lk === "a" && e.shiftKey) { e.preventDefault(); this.run("pcb.autoroute"); return; }
        if (!typing && (lk === "z" && !e.shiftKey)) { e.preventDefault(); this.run("edit.undo"); return; }
        if (!typing && (lk === "y" || (lk === "z" && e.shiftKey))) { e.preventDefault(); this.run("edit.redo"); return; }
        if (!typing && (lk === "=" || lk === "+")) { e.preventDefault(); this.run("view.zoomIn"); return; }
        if (!typing && lk === "-") { e.preventDefault(); this.run("view.zoomOut"); return; }
      }
      const fkeys = { F1: "help.manual", F2: "view.sch", F3: "view.pcb", F4: "view.3d", F5: "sim.run", F6: "view.sim", F8: "tools.updatePcb" };
      if (fkeys[k]) { e.preventDefault(); this.run(fkeys[k]); return; }
      if (typing) return;
      const ed = this.editor();
      if (ed && ed.onKey(e)) { e.preventDefault(); return; }
      if (this.tab === "3d" && this.v3d.onKey(e)) { e.preventDefault(); return; }
      if (k === "Escape") closeMenus();
      if (k === " " && ed) { ed.vp.spaceDown = true; e.preventDefault(); }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === " ") { this.sch.vp.spaceDown = false; this.pcb.vp.spaceDown = false; }
    });
  }

  openPalette() {
    const items = [];
    for (const c of this.commands.values()) {
      if (c.id === "palette") continue;
      items.push({ label: t(c.label), detail: c.id.split(".")[0], hint: c.key, icon: c.icon, keywords: c.label, value: () => this.run(c.id) });
    }
    // Parts by reference / value and nets — jump straight to them.
    for (const p of this.store.project.schematic.parts) {
      const sym = getSymbol(p.lib);
      if (!sym || sym.power || sym.flag) continue;
      items.push({ label: `${p.ref}  ${p.value}`, detail: `${t("Part")} · ${sym.title} · ${p.footprint || "—"}`, icon: "resistor", keywords: `${p.lib} ${p.footprint}`, value: () => this.crossProbe([p.ref], this.tab === "pcb" ? "pcb" : "sch") });
    }
    const nl = this.sch.netlist();
    for (const n of nl.nets) items.push({ label: n.name, detail: `${t("Net")} · ${n.pins.length} ${t("pins")}`, icon: "netlist", value: () => { this.highlightNet = n.name; this.sch.highlightNet = n.name; this.pcb.highlightNet = n.name; this.sch.request(); this.pcb.request(); toast(t("Highlighting net {net}", { net: n.name }), "info", 1500); } });
    quickPick({ items, title: t("Command palette"), placeholder: t("Type a command, part reference or net name…"), onPick: (it) => it.value() });
  }

  refreshAll() {
    this.buildMenus();
    this.buildTitleRight();
    this.renderTabs();
    this.renderToolbar();
    this.renderLeft();
    this.refreshInspector();
    this.updateStatus();
    this.updateTitle();
    if (this.tab === "start") this.start.render();
    if (this.tab === "sim") this.simView.activate();
    const def = this.tab === "sch" ? SCH_TOOLS[this.sch.tool] : this.tab === "pcb" ? PCB_TOOLS[this.pcb.tool] : null;
    this.setHint(def ? t(def.hint) : "");
  }
}

const app = new App();
window.mycircuitApp = app; // handy for debugging and the smoke test harness
app.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:20px;background:#300;color:#fff;padding:20px;z-index:9999;white-space:pre-wrap">${String(e && e.stack || e)}</pre>`);
});
export default app;
