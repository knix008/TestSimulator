// Application controller: wires the store, the plan editor, the 3D view,
// panels, menus, toolbar, commands, keyboard shortcuts, files (open, import
// of every supported format, save) and settings together.

import { Store } from "./store.js";
import { t, setLanguage, getLanguage, onLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, confirmDialog, promptDialog, toast, contextMenu, closeMenus, quickPick, anyModalOpen } from "./widgets.js";
import * as platform from "./platform.js";
import { PlanEditor, PLAN_TOOLS } from "../plan/editor.js";
import { PLAN_THEMES } from "../plan/render.js";
import { newProject, parseProject, levelById, findItem } from "../core/project.js";
import { runCheck } from "../core/check.js";
import { buildingOutlines } from "../core/rooms.js";
import { uid } from "../core/geom.js";
import { DEFAULT_THEME, themeById, uiTokens, canvasColors, randomTheme, setCustomThemes } from "./themes.js";
import { UK_FLAG, KR_FLAG } from "./flags.js";
import * as panels from "./panels.js";
import * as dialogs from "./dialogs.js";
import * as exports from "./exports.js";
import { SETTING_DEFAULTS } from "./dialogs.js";
import { StartPage } from "./start.js";
import { View3DTab } from "./view3dtab.js";

const VERSION = "10.0.0";

const DEFAULT_SETTINGS = {
  theme: "midnight", lang: "ko", systemDark: "midnight", systemLight: "daylight", showWelcome: false,
  recent: [], recentFurniture: [], ...SETTING_DEFAULTS, leftW: 280, rightW: 300, showLeft: true, showRight: true, onboarded: false,
};

// File types the Import command understands (extension → handler group).
export const IMPORT_TYPES = {
  myarch: "project", json: "project", dxf: "dxf", svg: "svg", ifc: "ifc",
  obj: "model", stl: "model", ply: "model", glb: "model", gltf: "model", fbx: "model", dae: "model", "3mf": "model", "3ds": "model", wrl: "model", amf: "model",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", bmp: "image",
  dwg: "closed", skp: "closed", rvt: "closed", pln: "closed", "3dm": "closed",
};

class App {
  constructor() {
    this.store = new Store();
    this.settings = { ...DEFAULT_SETTINGS };
    this.tab = "start";
    this.clipboard = null;
    this.checkIssues = [];
    this.commands = new Map();
    this.t = t;
    this.$ = (id) => document.getElementById(id);
  }

  async init() {
    const saved = await platform.loadSettings();
    if (saved) this.settings = { ...DEFAULT_SETTINGS, ...saved };
    setCustomThemes(this.settings.customThemes);
    if (!saved) this.settings.lang = (navigator.language || "ko").startsWith("ko") ? "ko" : "en";
    setLanguage(this.settings.lang);
    this.applyTheme();
    if (/mac/i.test(platform.platformName)) document.body.classList.add("mac");
    if (platform.isDesktop) document.body.classList.add("desktop");

    this.plan = new PlanEditor(this, this.$("view-plan"));
    this.start = new StartPage(this, this.$("view-start"));
    this.v3d = new View3DTab(this, this.$("view-3d"));

    this.registerCommands();
    this.buildMenus();
    this.buildTitleRight();
    this.bindKeys();
    this.bindSplitters();
    this.bindDrop();
    this.store.on("change", (info) => this.onDocChange(info));
    this.store.on("preview", () => { this.plan.request(); });
    this.store.on("saved", () => this.updateTitle());
    onLanguage(() => this.refreshAll());

    platform.onOpenPath((p) => this.openPath(p));
    platform.onRequestClose(async () => platform.confirmClose(await this.confirmDiscard()));
    window.addEventListener("beforeunload", (e) => {
      if (this.store.dirty && !platform.isDesktop) { e.preventDefault(); e.returnValue = ""; }
    });
    window.addEventListener("resize", () => this.layout());

    this.applyPanels();
    this.initSizeGrip();
    this.setTab("start");
    this.refreshAll();
    this.checkAutosave();
    this.applySettings();
    if (!this.settings.onboarded || this.settings.showWelcome) setTimeout(() => dialogs.showWelcome(this), 400);
    else if (this.settings.startup === "last" && platform.isDesktop && this.settings.recent && this.settings.recent[0]) setTimeout(() => this.openPath(this.settings.recent[0].path), 300);
  }

  // ---------------------------------------------------------------- theme & settings
  currentTheme() {
    let id = this.settings.theme;
    if (id === "system") {
      const light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      id = light ? (this.settings.systemLight || DEFAULT_THEME.light) : (this.settings.systemDark || DEFAULT_THEME.dark);
    }
    return themeById(id) || themeById(DEFAULT_THEME.dark);
  }

  themeName() { return this.currentTheme().mode; }

  themeLabel() {
    const th = this.currentTheme();
    return `${th.name[getLanguage()] || th.name.en}${this.settings.theme === "system" ? ` (${t("System")})` : ""}`;
  }

  randomTheme() {
    const th = randomTheme(this.currentTheme().id);
    this.setSetting("theme", th.id);
    toast(t("Theme: {name}", { name: th.name[getLanguage()] || th.name.en }), "info", 1500);
  }

  // Plan canvas palette: the light/dark base with the theme's tints.
  planPalette() {
    const th = this.currentTheme();
    return { ...PLAN_THEMES[th.mode], ...canvasColors(th).plan };
  }

  applyTheme() {
    const th = this.currentTheme();
    const root = document.documentElement;
    root.dataset.theme = th.mode;
    root.dataset.themeId = th.id;
    for (const [k, v] of Object.entries(uiTokens(th))) root.style.setProperty(k, v);
    platform.setTitleBarTheme({ color: th.panel, symbolColor: th.text });
    if (this.plan) { this.plan.request(); this.v3d.applyTheme(); this.buildTitleRight(); }
  }

  applySettings() {
    this.saveSettings();
    this.applyTheme();
    const root = document.documentElement;
    root.classList.toggle("no-anim", this.settings.animations === false);
    const z = +this.settings.uiScale || 1;
    if (platform.isDesktop && window.myarch.setZoom) window.myarch.setZoom(z);
    else root.style.zoom = z === 1 ? "" : String(z);
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = setInterval(() => this.autosave(), Math.max(10, +this.settings.autosaveSeconds || 30) * 1000);
    this.v3d.applySettings();
    if (this.plan && this.plan.vp) this.plan.vp.zoomSpeed = this.settings.zoomSpeed || 1;
    this.applyPanels();
    this.refreshAll();
    this.plan.request();
  }

  saveSettings() { platform.saveSettings(this.settings); }

  setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    if (key === "theme") this.applyTheme();
    if (key === "customThemes") { setCustomThemes(value); this.applyTheme(); }
    if (key === "lang") setLanguage(value);
    if (key === "units3d") this.v3d.applySettings();
    if (key === "liveCheck" && value) this.runCheck(false);
    this.plan.request();
    this.renderToolbar();
    this.updateStatus();
  }

  // ---------------------------------------------------------------- tabs
  setTab(tab) {
    if (this.tab === "plan" && tab !== "plan") this.plan.finishChain();
    if (this.tab === "3d" && tab !== "3d") this.v3d.deactivate();
    this.tab = tab;
    for (const id of ["start", "plan", "3d"]) this.$(`view-${id}`).classList.toggle("on", id === tab);
    if (tab === "plan") this.plan.activate();
    if (tab === "3d") this.v3d.activate();
    if (tab === "start") { this.start.render(); this.setHint(""); }
    else this.start.stopBackground();
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
    const err = this.checkIssues.filter((i) => i.severity === "error").length;
    const warn = this.checkIssues.length - err;
    const defs = [
      ["start", "home", t("Start")],
      ["plan", "floorplan", t("Floor plan"), err ? [err, ""] : warn ? [warn, "warn"] : null],
      ["3d", "cube", t("3D View")],
    ];
    for (const [id, ic, label, badge] of defs) {
      const keyHint = { plan: "F2", "3d": "F3" }[id];
      bar.append(h("button", { class: `doc-tab ${this.tab === id ? "on" : ""}`, "data-tab": id, title: keyHint ? `${label} (${keyHint})` : label, role: "tab", onclick: () => this.setTab(id) }, h("span", { html: icon(ic, 16) }), h("span", { class: "tab-label" }, label),
        badge ? h("span", { class: `badge ${badge[1]}` }, String(badge[0])) : null));
    }
    // Search (command palette) is a magnifier button in the title bar; Ctrl+K opens it too.
    const search = this.$("title-search");
    search.innerHTML = "";
    search.append(h("button", { class: "icon-btn search-btn", title: `${t("Search commands, rooms, furniture…")}  (Ctrl+K)`, "aria-label": t("Search"), onclick: () => this.openPalette() }, h("span", { html: icon("search", 17) })));
  }

  // ---------------------------------------------------------------- panels
  applyPanels() {
    const ws = this.$("workspace");
    // A hidden side panel leaves a narrow rail with its icon and title.
    const docTab = this.tab !== "start";
    const leftOn = this.settings.showLeft && docTab;
    const rightOn = this.settings.showRight && docTab;
    document.documentElement.style.setProperty("--left-w", `${this.settings.leftW}px`);
    document.documentElement.style.setProperty("--right-w", `${this.settings.rightW}px`);
    const was = [ws.classList.contains("left-rail"), ws.classList.contains("right-rail")];
    ws.classList.toggle("no-left", !docTab);
    ws.classList.toggle("no-right", !docTab);
    ws.classList.toggle("left-rail", docTab && !leftOn);
    ws.classList.toggle("right-rail", docTab && !rightOn);
    if (this.plan && (was[0] !== ws.classList.contains("left-rail") || was[1] !== ws.classList.contains("right-rail"))) { this.renderLeft(); this.refreshInspector(); }
    requestAnimationFrame(() => this.layout());
  }

  layout() {
    if (this.tab === "plan") this.plan.vp.resize();
    if (this.tab === "3d") this.v3d.resize();
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

  renderLeft() { panels.renderLeft(this, this.$("left-panel")); }
  refreshInspector() { panels.renderRight(this, this.$("right-panel")); }

  // ---------------------------------------------------------------- doc changes
  onDocChange(info) {
    if (info && (info.load || info.restore)) this.plan.selectionChanged();
    if (info && info.load) {
      this.plan.fitted = false;
      this.plan.levelId = null;
      this.checkIssues = [];
      this.v3d.framed = false;
      if (this.tab === "plan") this.plan.activate();
    }
    this.plan.request();
    this.plan.renderLevelBar();
    this.v3d.markDirty();
    this.updateTitle();
    this.updateUndoButtons();
    this.scheduleChecks();
    clearTimeout(this.inspectorTimer);
    this.inspectorTimer = setTimeout(() => { this.refreshInspector(); this.renderLeft(); this.renderTabs(); this.updateStatus(); }, 60);
  }

  scheduleChecks() {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      if (this.settings.liveCheck !== false) this.runCheck(false);
      this.renderTabs();
    }, 350);
  }

  runCheck(show = true) {
    try {
      this.checkIssues = runCheck(this.store.project);
    } catch (e) {
      console.error(e);
      this.checkIssues = [];
    }
    this.plan.request();
    this.refreshInspector();
    this.renderTabs();
    if (show) {
      const e = this.checkIssues.filter((i) => i.severity === "error").length;
      const w = this.checkIssues.length - e;
      toast(e || w ? t("Model check: {e} errors, {w} warnings", { e, w }) : t("Model check passed — no problems found."), e ? "error" : w ? "warn" : "ok");
      this.settings.showRight = true;
      this.applyPanels();
    }
    return this.checkIssues;
  }

  updateTitle() {
    const name = this.store.fileName || t("Untitled");
    const el = this.$("doc-title");
    el.innerHTML = "";
    el.append(h("span", {}, `${this.store.project.meta.title || name}`), h("span", { class: "dirty" }, this.store.dirty ? " ●" : ""), h("span", {}, `  —  ${name}`));
    platform.setWindowTitle(`${this.store.dirty ? "● " : ""}${name} — MyArchitecture 10.0`);
  }

  // ---------------------------------------------------------------- hint & status
  setHint(text) {
    this.hintText = text;
    const el = this.$("hint");
    el.textContent = text || "";
    el.classList.toggle("show", !!text && this.settings.showHints !== false);
    clearTimeout(this.hintTimer);
    const secs = this.settings.hintSeconds ?? 7;
    if (secs > 0) this.hintTimer = setTimeout(() => el.classList.remove("show"), secs * 1000);
    this.updateStatus();
  }

  updateStatus() { panels.renderStatus(this, this.$("status-cells")); }

  // Resize grip at the right end of the status bar (desktop window). Hidden in
  // the browser and while the window is maximized or full screen.
  initSizeGrip() {
    const grip = this.$("size-grip");
    const root = document.documentElement;
    root.classList.toggle("can-resize", platform.canResizeWindow);
    if (!platform.canResizeWindow) return;
    grip.title = t("Drag to resize the window");
    const setMax = (m) => root.classList.toggle("win-maximized", !!m);
    platform.windowSize().then((s) => s && setMax(s.maximized));
    platform.onWindowState((s) => setMax(s && s.maximized));
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add("dragging");
      const z = +this.settings.uiScale || 1; // page pixels → window pixels
      const sx = e.screenX, sy = e.screenY;
      // Listen at once (a quick flick may end before the size arrives).
      let start = null, pos = null, raf = 0;
      const sizeReady = platform.windowSize().then((s) => { start = s; });
      const apply = () => {
        if (!start || start.maximized || !pos) return;
        platform.resizeWindow(start.width + (pos[0] - sx) * z, start.height + (pos[1] - sy) * z);
      };
      const move = (ev) => {
        if (ev.buttons === 0) { up(ev); return; } // button released outside the window
        pos = [ev.screenX, ev.screenY];
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(); });
      };
      // Resizing the window cancels pointer capture, so follow the pointer on
      // the whole window and stop only when the button is released.
      const up = (ev) => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("blur", up);
        grip.classList.remove("dragging");
        if (ev && ev.type === "pointerup") pos = [ev.screenX, ev.screenY];
        sizeReady.then(apply);
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("blur", up);
    });
  }
  onToolChanged() { this.renderToolbar(); }

  onLevelChanged() {
    this.renderToolbar();
    this.renderLeft();
    this.refreshInspector();
    this.updateStatus();
  }

  onSelection(kind, ids) {
    // Cross-selection: what is selected in the plan is highlighted in 3D and back.
    if (this.crossLock || this.settings.crossProbe === false) { this.queueInspector(); return; }
    this.crossLock = true;
    try {
      if (kind === "plan") this.v3d.highlight(ids);
      if (kind === "3d") this.plan.selectIds(ids);
    } finally { this.crossLock = false; }
    this.queueInspector();
  }

  queueInspector() {
    clearTimeout(this.selTimer);
    this.selTimer = setTimeout(() => this.refreshInspector(), 30);
  }

  crossProbe(ids, target) {
    this.setTab(target);
    if (target === "plan") this.plan.selectIds(ids, { center: true });
    if (target === "3d") this.v3d.highlight(ids);
  }

  recordRecentFurniture(kind) {
    this.settings.recentFurniture = [kind, ...(this.settings.recentFurniture || []).filter((x) => x !== kind)].slice(0, 10);
    this.saveSettings();
  }

  editProperties(kind, obj) { dialogs.itemProperties(this, kind, obj); }
  levelProperties(lv) { dialogs.levelProperties(this, lv); }

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
    this.setTab("plan");
    toast(t("New project. Press W to draw walls."), "ok");
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
    const f = await platform.openFile({ title: t("Open project"), filters: [platform.PROJECT_FILTER, ...this.importFilters()] });
    if (!f) return;
    await this.openFileObject(f, { confirmed: true });
  }

  importFilters() {
    return [
      { name: t("All supported files"), extensions: Object.keys(IMPORT_TYPES).filter((e) => IMPORT_TYPES[e] !== "closed") },
      { name: "AutoCAD DXF", extensions: ["dxf"] },
      { name: "IFC (BIM)", extensions: ["ifc"] },
      { name: t("3D models"), extensions: ["obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds", "wrl", "amf"] },
      { name: "SVG", extensions: ["svg"] },
      { name: t("Images (tracing underlay)"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
    ];
  }

  async importAny(group = null) {
    const filters = this.importFilters();
    const pick = group ? filters.filter((f) => f.extensions.some((e) => IMPORT_TYPES[e] === group)).concat(filters[0]) : filters;
    const f = await platform.openFile({ title: t("Import"), filters: pick });
    if (!f) return;
    await this.openFileObject(f);
  }

  // Route any file (picked, dropped or passed by the OS) to the right importer.
  async openFileObject(f, { confirmed = false } = {}) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const kind = IMPORT_TYPES[ext];
    try {
      if (f.path && kind && kind !== "closed" && kind !== "project") this.addRecent(f.path, f.name);
      if (kind === "project") {
        if (!confirmed && !(await this.confirmDiscard())) return;
        if (this.loadText(f.text, { fileName: f.name, filePath: f.path })) { this.setTab("plan"); toast(t("Opened {name}", { name: f.name }), "ok"); }
      } else if (kind === "dxf" || kind === "svg") await exports.importDrawing(this, f, kind);
      else if (kind === "ifc") await exports.importIfcFile(this, f, confirmed);
      else if (kind === "model") await exports.importModel(this, f);
      else if (kind === "image") await exports.importUnderlay(this, f);
      else if (kind === "closed") dialogs.closedFormat(this, ext);
      else toast(t("This file type is not supported: .{ext}", { ext }), "warn", 5000);
    } catch (e) {
      console.error(e);
      toast(t("Import failed: {m}", { m: e.message }), "error", 7000);
    }
  }

  async openPath(path) {
    try {
      const f = await platform.readPath(path);
      if (!f) return;
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (IMPORT_TYPES[ext] === "project" && !(await this.confirmDiscard())) return;
      await this.openFileObject(f, { confirmed: true });
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
        this.setTab("plan");
        toast(t("Sample \"{name}\" opened. Save it under a new name to keep changes.", { name: this.store.project.meta.title }), "ok", 4500);
      }
    } catch (e) {
      toast(t("Could not open the sample: {m}", { m: e.message }), "error");
    }
  }

  bindDrop() {
    document.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
    document.addEventListener("drop", async (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      const f = await platform.fromDroppedFile(file);
      // Dropped where? Imported models land under the cursor in the plan.
      if (this.tab === "plan") {
        const r = this.plan.canvas.getBoundingClientRect();
        this.dropAt = this.plan.vp.toWorld(e.clientX - r.left, e.clientY - r.top);
      }
      await this.openFileObject(f);
      this.dropAt = null;
    });
  }

  async save(saveAs = false) {
    this.store.project.view.level = this.plan.level;
    const text = this.store.serialize();
    const base = (this.store.project.meta.title || "untitled").replace(/[\\/:*?"<>|]/g, "_");
    try {
      const r = await platform.saveTextFile({ name: this.store.fileName && this.store.fileName.endsWith(".myarch") ? this.store.fileName : `${base}.myarch`, text, path: saveAs ? null : this.store.filePath, title: t("Save project") });
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

  // The last ten (Settings → General) files opened or saved, newest first.
  addRecent(path, title) {
    this.settings.recent = [{ path, title: title || "", at: Date.now() }, ...(this.settings.recent || []).filter((r) => r.path !== path)].slice(0, +this.settings.recentLimit || 10);
    this.saveSettings();
    if (this.tab === "start") this.start.render();
  }

  removeRecent(path) {
    this.settings.recent = (this.settings.recent || []).filter((r) => r.path !== path);
    this.saveSettings();
    if (this.tab === "start") this.start.render();
  }

  clearRecent() {
    this.settings.recent = [];
    this.saveSettings();
    if (this.tab === "start") this.start.render();
  }

  setPhaseView(v) {
    this.setSetting("phaseView", v);
    this.v3d.applySettings();
    this.plan.request();
    toast(t("Phase view: {p}", { p: t(v === "new" ? "New design (no demolition)" : v === "existing" ? "Existing (before works)" : "All phases") }), "info", 1500);
  }

  // The guided tour drives the real program; it replaces the open project,
  // so unsaved work is offered for saving first.
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
        this.setTab("plan");
      } catch (e) { toast(e.message, "error"); }
    }
    platform.clearAutosave();
  }

  // ---------------------------------------------------------------- building helpers
  autoRoof() {
    const p = this.store.project;
    const top = p.levels[p.levels.length - 1];
    const walls = p.walls.filter((w) => w.level === top.id);
    const outlines = buildingOutlines(walls);
    if (!outlines.length) { toast(t("The top level has no closed outline of walls."), "warn", 4000); return; }
    const ids = [];
    this.store.edit(t("Add roof"), (pr) => {
      pr.roofs = pr.roofs.filter((r) => !(r.level === top.id && r.auto));
      for (const pts of outlines) {
        const id = uid("f");
        ids.push(id);
        pr.roofs.push({ id, level: top.id, pts, kind: this.settings.roofKind || "gable", pitch: 30, overhang: 500, thickness: 200, material: "roof-tiles", auto: true });
      }
    });
    if (this.tab === "plan") { this.plan.setLevel(top.id); this.plan.select(ids); }
    toast(t("Roof created over level {name}.", { name: top.name }), "ok");
  }

  // ---------------------------------------------------------------- commands
  cmd(id, spec) { this.commands.set(id, { id, ...spec }); }

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

  editor() { return this.tab === "plan" ? this.plan : null; }

  applyPanMode() {
    this.plan.vp.setPanMode(this.panMode);
    this.renderToolbar();
    if (this.editor()) this.setHint(this.panMode ? t("Pan mode: left-drag moves the view. Press Esc or the hand button to leave it.") : "");
  }

  registerCommands() {
    const C = (id, label, ic, key, run, extra = {}) => this.cmd(id, { label, icon: ic, key, run, ...extra });
    const inPlan = () => this.tab === "plan";
    const in3d = () => this.tab === "3d";
    const toPlan = () => { if (this.tab !== "plan") this.setTab("plan"); };
    // File
    C("file.new", "New project", "new", "Ctrl+N", () => this.newProject());
    C("file.open", "Open…", "open", "Ctrl+O", () => this.open());
    C("file.import", "Import (DXF, IFC, 3D models, images…)…", "import", "Ctrl+I", () => this.importAny());
    C("file.importDxf", "Import DXF drawing…", "dxf", "", () => this.importAny("dxf"));
    C("file.importIfc", "Import IFC (BIM)…", "bim", "", () => this.importAny("ifc"));
    C("file.importModel", "Import 3D model (OBJ, FBX, GLB, STL…)…", "model3d", "", () => this.importAny("model"));
    C("file.importImage", "Import image as tracing underlay…", "underlay", "", () => this.importAny("image"));
    C("file.importSvg", "Import SVG drawing…", "image", "", () => this.importAny("svg"));
    C("file.save", "Save", "save", "Ctrl+S", () => this.save());
    C("file.saveAs", "Save as…", "saveAs", "Ctrl+Shift+S", () => this.save(true));
    C("file.samples", "Open sample…", "sample", "", () => dialogs.samplePicker(this));
    C("file.print", "Print / PDF…", "print", "Ctrl+P", () => exports.printDialog(this));
    C("file.props", "Project properties…", "info", "", () => dialogs.projectProperties(this));
    C("file.exportSvg", "Export plan as SVG", "image", "", () => exports.exportPlanSvg(this));
    C("file.exportPng", "Export plan as PNG image", "image", "", () => exports.exportPlanPng(this));
    C("file.exportPdf", "Export plan as PDF…", "print", "", () => exports.printDialog(this, { pdf: true }));
    C("file.exportDxf", "Export DXF (AutoCAD)…", "dxf", "", () => exports.exportDxfFile(this));
    C("file.exportIfc", "Export IFC (BIM)…", "bim", "", () => exports.exportIfcFile(this));
    C("file.export3d", "Export 3D model (GLB, glTF, OBJ, STL, DAE, 3MF, USDZ, PLY)…", "model3d", "", () => exports.export3dDialog(this));
    C("file.exportCsv", "Export schedules (CSV)…", "schedule", "", () => dialogs.schedulesDialog(this));
    C("file.exit", "Exit", "close", "Alt+F4", () => window.close(), { enabled: () => platform.isDesktop });
    // Edit
    C("edit.undo", "Undo", "undo", "Ctrl+Z", () => { const l = this.store.undo(); if (l) toast(t("Undo: {l}", { l: t(l) }), "info", 1200); }, { enabled: () => this.store.canUndo() });
    C("edit.redo", "Redo", "redo", "Ctrl+Y", () => { const l = this.store.redo(); if (l) toast(t("Redo: {l}", { l: t(l) }), "info", 1200); }, { enabled: () => this.store.canRedo() });
    C("edit.cut", "Cut", "cut", "Ctrl+X", () => this.plan.cut(), { enabled: inPlan });
    C("edit.copy", "Copy", "copy", "Ctrl+C", () => this.plan.copy(), { enabled: inPlan });
    C("edit.paste", "Paste", "paste", "Ctrl+V", () => this.plan.paste(), { enabled: inPlan });
    C("edit.duplicate", "Duplicate", "copy", "Ctrl+D", () => this.plan.duplicate(), { enabled: inPlan });
    C("edit.delete", "Delete", "trash", "Del", () => this.plan.deleteSelection(), { enabled: inPlan });
    C("edit.selectAll", "Select all", "select", "Ctrl+A", () => this.plan.selectAll(), { enabled: inPlan });
    C("edit.rotate", "Rotate 90°", "rotate", "R", () => this.plan.rotate(90), { enabled: inPlan });
    C("edit.mirror", "Mirror horizontally / flip door", "mirror", "X", () => this.plan.mirror("x"), { enabled: inPlan });
    C("edit.mirrorV", "Mirror vertically", "flip", "Y", () => this.plan.mirror("y"), { enabled: inPlan });
    C("edit.properties", "Properties…", "settings", "E", () => { const it = this.plan.selectedItems()[0]; if (it) this.editProperties(it.kind, it.obj); else dialogs.projectProperties(this); });
    C("edit.group", "Group", "group", "Ctrl+G", () => this.plan.groupSelection(), { enabled: inPlan });
    C("edit.ungroup", "Ungroup", "group", "Ctrl+Shift+G", () => this.plan.ungroupSelection(), { enabled: inPlan });
    C("edit.offset", "Offset…", "offset", "", async () => { const v = await promptDialog(t("Offset distance in mm (negative = inwards)"), "300", { title: t("Offset") }); if (v !== null) this.plan.offsetSelection(parseFloat(v) || 0); }, { enabled: inPlan });
    C("edit.scale", "Scale…", "scale", "", async () => { const v = await promptDialog(t("Scale factor (e.g. 1.5 or 50%)"), "1.25", { title: t("Scale") }); if (v !== null) this.plan.scaleSelection(/%$/.test(v.trim()) ? parseFloat(v) / 100 : parseFloat(v)); }, { enabled: inPlan });
    C("edit.find", "Find…", "search", "Ctrl+F", () => dialogs.findDialog(this));
    C("edit.history", "Undo history…", "history", "", () => dialogs.historyDialog(this));
    // View
    C("view.start", "Start page", "home", "", () => this.setTab("start"));
    C("view.plan", "Floor plan", "floorplan", "F2", () => this.setTab("plan"));
    C("view.3d", "3D view", "cube", "F3", () => this.setTab("3d"));
    C("view.zoomIn", "Zoom in", "zoomIn", "Ctrl+=", () => this.plan.vp.zoomBy(1.25), { enabled: inPlan });
    C("view.zoomOut", "Zoom out", "zoomOut", "Ctrl+-", () => this.plan.vp.zoomBy(0.8), { enabled: inPlan });
    C("view.fit", "Zoom to fit", "zoomFit", "Home", () => { if (this.tab === "plan") this.plan.zoomFit(); else if (this.tab === "3d") this.v3d.zoomToFit(); });
    C("view.grid", "Show grid", "grid", "", () => this.setSetting("showGrid", this.settings.showGrid === false), { checked: () => this.settings.showGrid !== false });
    C("view.rulers", "Show rulers", "ruler", "", () => this.setSetting("showRulers", this.settings.showRulers === false), { checked: () => this.settings.showRulers !== false });
    C("view.snap", "Snap to grid and walls", "snap", "F9", () => this.setSetting("snap", this.settings.snap === false), { checked: () => this.settings.snap !== false });
    C("view.ortho", "Orthogonal drawing (45° steps)", "orthomode", "F8", () => this.setSetting("ortho", this.settings.ortho === false), { checked: () => this.settings.ortho !== false });
    C("view.dims", "Show dimensions", "dimension", "", () => this.setSetting("showDims", this.settings.showDims === false), { checked: () => this.settings.showDims !== false });
    C("view.furniture", "Show furniture", "sofa", "", () => this.setSetting("showFurniture", this.settings.showFurniture === false), { checked: () => this.settings.showFurniture !== false });
    C("view.areas", "Show room areas", "room", "", () => this.setSetting("showAreas", this.settings.showAreas === false), { checked: () => this.settings.showAreas !== false });
    C("view.ghost", "Show the level below", "levels", "", () => this.setSetting("showGhost", this.settings.showGhost === false), { checked: () => this.settings.showGhost !== false });
    C("view.underlays", "Show underlays and CAD layers", "underlay", "", () => { const on = this.settings.showUnderlays === false; this.setSetting("showUnderlays", on); this.setSetting("showDrawings", on); }, { checked: () => this.settings.showUnderlays !== false });
    C("view.pan", "Pan (hand): left-drag moves the view", "hand", "", () => { this.panMode = !this.panMode; this.applyPanMode(); }, { checked: () => !!this.panMode, enabled: inPlan });
    C("view.left", "Show library panel", "library", "Ctrl+1", () => { this.settings.showLeft = !this.settings.showLeft; this.saveSettings(); this.applyPanels(); }, { checked: () => this.settings.showLeft });
    C("view.right", "Show properties panel", "list", "Ctrl+2", () => { this.settings.showRight = !this.settings.showRight; this.saveSettings(); this.applyPanels(); }, { checked: () => this.settings.showRight });
    C("view.themeDark", "Dark theme", "moon", "", () => this.setSetting("theme", DEFAULT_THEME.dark), { checked: () => this.settings.theme !== "system" && this.themeName() === "dark" });
    C("view.themeLight", "Light theme", "sun", "", () => this.setSetting("theme", DEFAULT_THEME.light), { checked: () => this.settings.theme !== "system" && this.themeName() === "light" });
    C("view.themes", "Themes…", "palette", "", () => dialogs.themeGallery(this));
    C("view.themeSystem", "System theme", "monitor", "", () => this.setSetting("theme", "system"), { checked: () => this.settings.theme === "system" });
    C("view.langKo", "한국어", "globe", "", () => this.setSetting("lang", "ko"), { checked: () => getLanguage() === "ko" });
    C("view.langEn", "English", "globe", "", () => this.setSetting("lang", "en"), { checked: () => getLanguage() === "en" });
    // Draw (plan tools)
    for (const [id, def] of Object.entries(PLAN_TOOLS)) {
      C(`plan.${id}`, def.label, def.icon, def.key, () => {
        toPlan();
        if (id === "furniture") dialogs.furniturePicker(this);
        else this.plan.setTool(id);
      }, { checked: () => this.tab === "plan" && this.plan.tool === id, tool: true });
    }
    // Build
    C("build.detectRooms", "Detect rooms from walls", "room", "", () => { toPlan(); this.plan.detectRooms(); });
    C("build.autoRoof", "Roof over the top level", "roof", "", () => this.autoRoof());
    C("build.autoDims", "Dimension the outside walls", "dimension", "", () => { toPlan(); this.plan.autoDimensions(); });
    C("build.addLevel", "Add level on top", "levels", "", () => { toPlan(); this.plan.addLevel({ copyFrom: this.store.project.levels[this.store.project.levels.length - 1].id, wallsOnly: true }); });
    C("build.levelProps", "Level properties…", "levels", "", () => this.levelProperties(levelById(this.store.project, this.plan.level)));
    C("build.check", "Model check", "modelcheck", "F5", () => { toPlan(); this.runCheck(true); });
    C("build.schedules", "Schedules and quantities…", "schedule", "", () => dialogs.schedulesDialog(this));
    C("build.defaults", "Default sizes (walls, doors, windows)…", "settings", "", () => dialogs.defaultsDialog(this));
    C("build.layers", "CAD layers…", "layers", "", () => dialogs.layersDialog(this));
    C("build.wallTypes", "Wall types…", "wall", "", () => dialogs.wallTypesDialog(this));
    C("build.bimProps", "BIM properties of the selection…", "bim", "", () => dialogs.bimPropertiesDialog(this));
    C("build.selectSimilar", "Select similar", "select", "", () => { toPlan(); this.plan.selectSimilar(); }, { enabled: () => this.tab === "plan" && this.plan.sel.size > 0 });
    C("build.costs", "Cost estimate…", "schedule", "", () => dialogs.schedulesDialog(this, { tab: "c" }));
    C("build.site", "Site location (sun study)…", "sunlight", "", () => dialogs.projectProperties(this));
    C("view.phaseAll", "Phases: show all", "levels", "", () => this.setPhaseView("all"), { checked: () => (this.settings.phaseView || "all") === "all" });
    C("view.phaseNew", "Phases: new design", "building", "", () => this.setPhaseView("new"), { checked: () => this.settings.phaseView === "new" });
    C("view.phaseExisting", "Phases: existing building", "elevation", "", () => this.setPhaseView("existing"), { checked: () => this.settings.phaseView === "existing" });
    C("help.tutorial", "Interactive tutorial", "sample", "", () => this.openTutorial());
    C("file.recent", "Recent files…", "history", "", () => dialogs.recentPicker(this));
    C("file.clearRecent", "Clear recent files", "trash", "", () => { this.clearRecent(); toast(t("The recent files list was cleared."), "ok"); }, { enabled: () => (this.settings.recent || []).length > 0 });
    // 3D
    C("v3d.iso", "Isometric view", "cube", "", () => { this.setTab("3d"); this.v3d.setView("iso"); });
    C("v3d.top", "Top view", "floorplan", "", () => { this.setTab("3d"); this.v3d.setView("top"); });
    C("v3d.front", "Front elevation", "elevation", "", () => { this.setTab("3d"); this.v3d.elevation("front"); });
    C("v3d.walk", "Walk through (first person)", "walk", "", () => { this.setTab("3d"); this.v3d.setNav(this.v3d.opts.navMode === "walk" ? "orbit" : "walk"); }, { checked: () => this.v3d.opts.navMode === "walk" });
    C("v3d.section", "Section cut at the current level", "section", "", () => { this.setTab("3d"); this.v3d.toggleSection(); }, { checked: () => this.v3d.opts.section !== null });
    C("v3d.ortho", "Orthographic projection", "ortho", "", () => { this.setTab("3d"); this.v3d.setOpt("ortho", !this.v3d.opts.ortho); }, { checked: () => !!this.v3d.opts.ortho });
    C("v3d.openDoors", "Open doors", "door", "", () => { this.setTab("3d"); this.v3d.setOpt("openDoors", !this.v3d.opts.openDoors); }, { checked: () => !!this.v3d.opts.openDoors });
    C("v3d.screenshot", "Save 3D image (PNG)…", "camera", "", () => { this.setTab("3d"); this.v3d.screenshot(); });
    C("v3d.pushpull", "Push/Pull", "pushpull", "", () => { this.setTab("3d"); this.v3d.setTool("pushpull"); }, { checked: () => this.v3d.opts.tool === "pushpull" });
    C("v3d.paint", "Paint bucket", "bucket", "", () => { this.setTab("3d"); this.v3d.setTool("paint"); }, { checked: () => this.v3d.opts.tool === "paint" });
    C("v3d.tape", "Tape measure", "tape", "", () => { this.setTab("3d"); this.v3d.setTool("tape"); }, { checked: () => this.v3d.opts.tool === "tape" });
    C("v3d.addScene", "Add scene", "scenes", "", () => { this.setTab("3d"); this.v3d.ensure().then(() => this.v3d.addScene()); });
    C("v3d.playScenes", "Play scene animation", "play", "", () => { this.setTab("3d"); this.v3d.playScenes(); });
    C("v3d.fog", "Fog", "eye", "", () => { this.setTab("3d"); this.v3d.setOpt("fog", !this.v3d.opts.fog); }, { checked: () => !!this.v3d.opts.fog });
    // Settings / help
    C("tools.settings", "Settings…", "settings", "Ctrl+,", () => dialogs.settingsDialog(this));
    C("help.manual", "User manual", "help", "F1", () => dialogs.manual(this));
    C("help.keys", "Keyboard shortcuts", "keyboard", "Ctrl+/", () => dialogs.shortcuts(this));
    C("help.formats", "Supported file formats…", "file", "", () => dialogs.formatsDialog(this));
    C("help.tour", "Quick tour", "info", "", () => dialogs.showWelcome(this));
    C("help.about", "About MyArchitecture", "info", "", () => dialogs.about(this, VERSION));
    C("palette", "Command palette", "command", "Ctrl+K", () => this.openPalette());
    void in3d;
  }

  buildMenus() {
    const M = {
      File: ["file.new", "file.open", "file.samples", "file.recent", "file.clearRecent", "-", "file.save", "file.saveAs", "-", "file.import", "@import", "@export", "-", "file.print", "file.props", "-", "file.exit"],
      Edit: ["edit.undo", "edit.redo", "edit.history", "-", "edit.cut", "edit.copy", "edit.paste", "edit.duplicate", "edit.delete", "-", "edit.selectAll", "edit.find", "-", "edit.rotate", "edit.mirror", "edit.mirrorV", "edit.scale", "edit.offset", "-", "edit.group", "edit.ungroup", "edit.properties"],
      View: ["view.start", "view.plan", "view.3d", "-", "view.zoomIn", "view.zoomOut", "view.fit", "view.pan", "-", "view.grid", "view.rulers", "view.snap", "view.ortho", "-", "view.dims", "view.furniture", "view.areas", "view.ghost", "view.underlays", "-", "view.phaseAll", "view.phaseNew", "view.phaseExisting", "-", "view.left", "view.right", "-", "view.themes", "view.themeDark", "view.themeLight", "view.themeSystem", "-", "view.langKo", "view.langEn"],
      Draw: ["plan.select", "plan.wall", "plan.room", "plan.door", "plan.window", "plan.column", "plan.stair", "plan.furniture", "plan.roof", "-", "plan.massRect", "plan.massCircle", "plan.massPoly", "-", "plan.grid", "plan.dimension", "plan.text", "plan.line", "plan.measure"],
      Build: ["build.detectRooms", "build.autoRoof", "build.autoDims", "-", "build.addLevel", "build.levelProps", "build.defaults", "build.layers", "-", "build.check", "build.schedules"],
      BIM: ["build.wallTypes", "build.bimProps", "build.selectSimilar", "-", "build.costs", "build.site", "-", "file.exportIfc", "file.importIfc"],
      "3D": ["view.3d", "-", "v3d.iso", "v3d.top", "v3d.front", "-", "v3d.walk", "v3d.section", "v3d.ortho", "v3d.openDoors", "v3d.fog", "-", "v3d.pushpull", "v3d.paint", "v3d.tape", "-", "v3d.addScene", "v3d.playScenes", "-", "v3d.screenshot", "file.export3d"],
      Help: ["help.tutorial", "help.manual", "help.keys", "help.formats", "help.tour", "-", "tools.settings", "help.about"],
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

  menuItems(ids) {
    const out = [];
    for (const id of ids) {
      if (id === "-") { out.push("-"); continue; }
      if (id === "@recent") {
        if ((this.settings.recent || []).length) out.push({ label: t("Open recent ▸"), icon: "history", action: () => dialogs.recentPicker(this) });
        continue;
      }
      if (id === "@import") { out.push({ label: t("Import ▸"), icon: "import", action: () => dialogs.importPicker(this) }); continue; }
      if (id === "@export") { out.push({ label: t("Export ▸"), icon: "export", action: () => dialogs.exportPicker(this) }); continue; }
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
    const themeSplit = h("div", { class: "split-btn" },
      h("button", { class: "icon-btn", title: `${t("Random theme")} — ${this.themeLabel()}`, html: icon("palette", 17), onclick: () => this.randomTheme() }),
      h("button", { class: "icon-btn caret", title: t("Choose a theme"), html: icon("chevronDown", 13), onclick: (e) => dialogs.themeMenu(this, e.currentTarget.parentElement.getBoundingClientRect()) }));
    host.append(
      themeSplit,
      h("button", { class: "icon-btn lang-toggle", title: ko ? "Switch to English" : "한국어로 바꾸기", html: ko ? UK_FLAG : KR_FLAG, onclick: () => this.setSetting("lang", ko ? "en" : "ko") }),
      h("button", { class: "icon-btn", title: t("Settings…"), html: icon("settings", 16), onclick: () => this.run("tools.settings") }),
      h("button", { class: "icon-btn", title: t("About MyArchitecture"), html: icon("info", 16), onclick: () => this.run("help.about") }),
    );
  }

  // ---------------------------------------------------------------- toolbar
  // Every toolbar button stays visible: the window may not become narrower
  // than the widest toolbar seen so far (same rule as MyCircuit).
  // Undo / redo buttons follow every edit without rebuilding the toolbar; the
  // tooltip names the step that would be undone or redone.
  updateUndoButtons() {
    for (const [id, can, label] of [["edit.undo", this.store.canUndo(), this.store.undoLabel()], ["edit.redo", this.store.canRedo(), this.store.redoLabel()]]) {
      const b = document.querySelector(`#toolbar [data-cmd="${id}"]`);
      if (!b) continue;
      const c = this.commands.get(id);
      b.disabled = !can;
      b.title = `${t(c.label)}${label ? `: ${t(label)}` : ""}  (${c.key})`;
    }
  }

  // Undo / redo entries shared by the plan and 3D context menus.
  undoMenuItems() {
    return [
      { label: t("Undo"), icon: "undo", shortcut: "Ctrl+Z", disabled: !this.store.canUndo(), action: () => this.run("edit.undo") },
      { label: t("Redo"), icon: "redo", shortcut: "Ctrl+Y", disabled: !this.store.canRedo(), action: () => this.run("edit.redo") },
    ];
  }

  // Width the title bar needs to show every item in full: each child at its
  // natural width (the document title up to 360 px), the gaps, and the padding
  // that keeps clear of the window buttons the OS draws over the bar.
  titleBarNeed() {
    const bar = this.$("titlebar");
    if (!bar) return 0;
    const cs = getComputedStyle(bar);
    const kids = [...bar.children];
    let need = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1) + 8;
    for (const k of kids) {
      const st = getComputedStyle(k);
      let w;
      if (k.id === "doc-title") { const r = document.createRange(); r.selectNodeContents(k); w = Math.min(360, Math.max(40, r.getBoundingClientRect().width + 8)); }
      else w = Math.max(k.scrollWidth, k.getBoundingClientRect().width);
      need += w + parseFloat(st.marginLeft) + parseFloat(st.marginRight);
    }
    return Math.ceil(need);
  }

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
      const screenW = Math.floor(((window.screen && window.screen.availWidth) || 1920) / z) - 16;
      bar.classList.remove("compact", "wrap");
      document.documentElement.classList.remove("toolbar-wrap");
      let need = measure();
      if (need > screenW || (need > bar.clientWidth + 1 && !platform.isDesktop)) { bar.classList.add("compact"); need = measure(); }
      if (need > screenW) { bar.classList.add("wrap"); document.documentElement.classList.add("toolbar-wrap"); need = Math.min(need, screenW); }
      bar.dataset.need = String(need);
      // The title bar (menus, view tabs, search, buttons) must fit too; on a
      // screen too narrow for one row it wraps onto two — nothing is hidden.
      const tneed = this.titleBarNeed();
      document.documentElement.classList.toggle("titlebar-wrap", tneed > screenW);
      need = Math.max(need, Math.min(screenW, tneed));
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
      return h("button", { class: `icon-btn ${on ? "on" : ""}`, "data-cmd": id, title: `${t(c.label)}${c.key ? `  (${c.key})` : ""}`, disabled: c.enabled ? !c.enabled() : false, onclick: () => this.run(id) },
        h("span", { html: icon(c.icon, 18) }), label ? h("span", { class: "lbl" }, t(c.label)) : null);
    };
    const sep = () => h("div", { class: "sep" });
    const add = (...els) => bar.append(...els.filter(Boolean));
    add(btn("file.new"), btn("file.open"), btn("file.save"), sep(), btn("edit.undo"), btn("edit.redo"), sep());
    if (this.tab === "start") {
      add(btn("help.tutorial", { label: true }), btn("file.samples", { label: true }), btn("file.import", { label: true }), btn("view.plan", { label: true }), btn("view.3d", { label: true }), btn("help.manual", { label: true }));
    } else if (this.tab === "plan") {
      add(btn("plan.select"), btn("plan.wall"), btn("plan.room"), btn("plan.door"), btn("plan.window"), btn("plan.column"), btn("plan.stair"), btn("plan.furniture"), btn("plan.roof"), sep(),
        btn("plan.massRect"), btn("plan.massCircle"), btn("plan.massPoly"), sep(),
        btn("plan.grid"), btn("plan.dimension"), btn("plan.text"), btn("plan.line"), btn("plan.measure"), sep(),
        btn("edit.rotate"), btn("edit.mirror"), btn("edit.delete"), sep(),
        btn("build.detectRooms"), btn("build.wallTypes"), btn("build.bimProps"), btn("build.check"), btn("build.schedules"), btn("view.3d", { label: true }),
        h("div", { class: "grow" }), btn("view.snap"), btn("view.ortho"), btn("view.pan"), btn("view.grid"), btn("view.rulers"), sep(), btn("view.zoomOut"), btn("view.zoomIn"), btn("view.fit"));
    } else if (this.tab === "3d") {
      this.v3d.renderToolbar(bar, btn, sep);
    }
    add(h("div", { class: "grow" }), btn("help.tutorial"), btn("help.keys"), btn("help.about"));
    this.updateUndoButtons();
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
      if (ctrl && !e.altKey) {
        const lk = k.toLowerCase();
        const map = { s: e.shiftKey ? "file.saveAs" : "file.save", o: "file.open", n: "file.new", p: "file.print", i: "file.import", k: "palette", f: "edit.find", ",": "tools.settings", "/": "help.keys", "1": "view.left", "2": "view.right", g: e.shiftKey ? "edit.ungroup" : "edit.group" };
        if (map[lk]) { e.preventDefault(); this.run(map[lk]); return; }
        if (!typing && lk === "z" && !e.shiftKey) { e.preventDefault(); this.run("edit.undo"); return; }
        if (!typing && (lk === "y" || (lk === "z" && e.shiftKey))) { e.preventDefault(); this.run("edit.redo"); return; }
        if (!typing && (lk === "=" || lk === "+")) { e.preventDefault(); this.run("view.zoomIn"); return; }
        if (!typing && lk === "-") { e.preventDefault(); this.run("view.zoomOut"); return; }
      }
      const fkeys = { F1: "help.manual", F2: "view.plan", F3: "view.3d", F4: "view.3d", F5: "build.check", F8: "view.ortho", F9: "view.snap" };
      if (fkeys[k]) { e.preventDefault(); this.run(fkeys[k]); return; }
      if (typing) return;
      if (k === "Home") { e.preventDefault(); this.run("view.fit"); return; }
      if (this.tab === "plan" && this.plan.onKey(e)) { e.preventDefault(); return; }
      if (this.tab === "3d" && this.v3d.onKey(e, true)) { e.preventDefault(); return; }
      if (k === "Escape") closeMenus();
      if (k === " " && this.tab === "plan") { this.plan.vp.spaceDown = true; e.preventDefault(); }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === " ") this.plan.vp.spaceDown = false;
      if (this.tab === "3d") this.v3d.onKey(e, false);
    });
  }

  openPalette() {
    const items = [];
    for (const c of this.commands.values()) {
      if (c.id === "palette") continue;
      items.push({ label: t(c.label), detail: c.id.split(".")[0], hint: c.key, icon: c.icon, keywords: c.label, value: () => this.run(c.id) });
    }
    const p = this.store.project;
    for (const r of p.rooms) {
      const lv = levelById(p, r.level);
      items.push({ label: r.name || t("Room"), detail: `${t("Room")} · ${lv ? lv.name : ""}`, icon: "room", value: () => this.crossProbe([r.id], "plan") });
    }
    for (const lv of p.levels) items.push({ label: `${t("Level")} ${lv.name}`, detail: `${(lv.elevation / 1000).toFixed(2)} m`, icon: "levels", value: () => { this.setTab("plan"); this.plan.setLevel(lv.id); } });
    quickPick({ items, title: t("Command palette"), placeholder: t("Type a command, room or level…"), onPick: (it) => it.value() });
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
    if (this.tab === "plan") this.plan.renderLevelBar();
    const def = this.tab === "plan" ? PLAN_TOOLS[this.plan.tool] : null;
    this.setHint(def ? t(def.hint) : this.tab === "3d" ? this.v3d.hintText() : "");
  }

  // Selected items (for panels): [{kind, obj}]
  selection() {
    return this.plan.selectedItems();
  }

  findItem(id) { return findItem(this.store.project, id); }
}

const app = new App();
window.myarchApp = app; // handy for debugging and the smoke test harness
app.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:20px;background:#300;color:#fff;padding:20px;z-index:9999;white-space:pre-wrap">${String(e && e.stack || e)}</pre>`);
});
export default app;
