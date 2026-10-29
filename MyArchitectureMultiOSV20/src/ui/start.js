// Start page in MyCodeChecker's layout (its src/views/StartPage.jsx, from
// MyHeatManager): a full-window moving background (startbg.js, or the live 3D
// house) behind a board of cards — the hero (icon, name, version, documents,
// tutorial), a first-run banner, 새로 시작 (tiles by kind of project),
// recent projects, help, the background controls and the sample gallery with
// 3D thumbnails. Every card is moved by its ⠿ handle and resized by its
// bottom-right corner on a 3-column grid (startlayout.js); unlike
// MyCodeChecker the cards glide: the moved or resized card follows the
// pointer continuously, the others slide to their new places and the card
// settles into its cell when it is let go. Background and layout are kept in
// settings.startBackground.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, slider } from "./widgets.js";
import { loadSampleIndex, loadSampleText } from "./dialogs.js";
import { parseProject } from "../core/project.js";
import { PLAN_THEMES, drawPlan, planBounds } from "../plan/render.js";
import { COLS, ROW, GAP, cardsOf, place, compact, autoArrange, swapVertical, layoutValue, rowsFor, boxOf, cellAt, spanFor } from "./startlayout.js";
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, ANIMATION_NAMES, DEFAULT_START_BACKGROUND, themeColors } from "./startbg.js";

const TIPS = [
  "Press Ctrl+K anywhere to search every command, room and level.",
  "While drawing a wall, type a length such as 4200 or 4.2m and press Enter.",
  "Press A and click inside closed walls: the room and its area appear by themselves.",
  "Selecting something in the plan highlights it in 3D, and clicking in 3D selects it in the plan.",
  "The 3D view has a walk-through mode: press V and use W/A/S/D.",
  "File → Import reads DXF, IFC, SVG, OBJ, FBX, GLB, STL, DAE, 3MF and images.",
  "Export DXF for CAD, IFC for BIM programs, GLB/OBJ for 3D programs and PDF sheets for printing.",
  "Right-click anything for the actions that apply to it.",
];

export const CARD_IDS = ["hero", "banner", "templates", "recent", "side", "help", "samples"];
export const DEFAULT_SPAN = { hero: 3, banner: 3, templates: 3, recent: 2, side: 1, help: 2, samples: 3 };

// 새로 시작: [group title, [[kind, id, icon, fallback name, description], …]]; kind "sample" opens
// that sample as a starting point (its name comes from sample/index.json), "cmd" runs a command.
const GROUPS = [
  ["Houses and flats", [["sample", "03-two-storey-house.myarch", "building", "Two-storey house", "Two levels, stairs, gable roof"], ["sample", "02-two-bedroom.myarch", "room", "Two-bedroom apartment", "Rooms, areas and schedules"], ["sample", "14-courtyard-house.myarch", "building", "Courtyard house", "A U-shaped house around a pool"], ["sample", "21-interior-design.myarch", "material", "Interior design apartment", "Wall finishes, skirting, scenes"]]],
  ["Large buildings", [["sample", "10-office-tower.myarch", "building", "Office tower", "Core, curtain wall, column grid"], ["sample", "29-hotel.myarch", "building", "City hotel", "Podium and guest-room floors"], ["sample", "30-university-library.myarch", "levels", "University library", "Four levels around an atrium"], ["sample", "32-residential-complex.myarch", "building", "Residential complex", "Two towers on a podium"], ["sample", "33-atrium-office.myarch", "levels", "Atrium office", "Six storeys, bridges across an atrium"], ["sample", "34-general-hospital.myarch", "building", "General hospital", "Podium and two ward wings"], ["sample", "38-museum.myarch", "curtainwall", "Museum", "A gallery wing at an angle"]]],
  ["Massing and 3D", [["sample", "07-massing-study.myarch", "massShape", "Massing study", "Push/pull masses and scenes"], ["sample", "15-sketchup-complex.myarch", "skComponent", "Cultural complex", "SketchUp-style components and tags"]]],
  ["Structures", [["cmd", "build.tower", "tower", "Lattice tower…", "A parametric steel tower"], ["cmd", "build.bridge", "bridge", "Bridge…", "Ten kinds of bridge"]]],
  ["CAD and BIM", [["cmd", "file.import", "import", "Import…", "DXF, DWG, IFC, SVG, 3D models"], ["sample", "09-cad-tracing.myarch", "dxf", "Tracing a DXF drawing", "CAD layers traced into walls"], ["sample", "06-renovation-bim.myarch", "bim", "Renovation (BIM phases)", "Wall types, phases, cost"]]],
];

// 3D thumbnails of the samples are kept between runs (per browser profile):
// drawing them takes a second, hidden 3D view — a WebGL context alone costs
// ~0.3 s of a frozen app — and they only change with the app or the sample.
const THUMBS_KEY = "myarch.thumbs3d";
const hashText = (s) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193); return (x >>> 0).toString(36); };

export function startBackgroundOf(settings) {
  return { ...DEFAULT_START_BACKGROUND, banner: true, ...((settings && settings.startBackground) || {}) };
}

export class StartPage {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.cache = new Map();
    this.hashes = new Map(); // sample file → hash of its text (the thumbnail cache key)
    this.measured = {}; // fit cards: rows their content needs
    this.burst = { at: 0, n: 0 };
  }

  get bg() { return startBackgroundOf(this.app.settings); }

  saveBg(patch) {
    this.app.settings.startBackground = { ...this.bg, ...patch };
    this.app.saveSettings();
  }

  visibleIds() { return CARD_IDS.filter((id) => id !== "banner" || this.bg.banner !== false); }

  async render() {
    const app = this.app;
    this.host.innerHTML = "";
    this.ensureBackground();
    this.host.append(this.bgCanvas, this.bgHost);
    const board = h("div", { class: "start-board", "data-tour": "start-board" });
    this.board = board;
    this.cards = new Map();
    const samplesGrid = h("div", { class: "sample-grid" });
    const defs = this.cardDefs(samplesGrid);
    for (const id of this.visibleIds()) {
      const d = defs[id];
      if (!d) continue;
      const el = this.cardElement(id, d);
      this.cards.set(id, el);
      board.append(el);
    }
    this.outline = h("div", { class: "card-drop-outline", "aria-hidden": "true" });
    board.append(this.outline);
    const tools = h("div", { class: "start-tools" },
      h("button", { class: "btn small", "data-start-arrange": "1", title: t("Pack the cards in three columns again"), onclick: () => this.arrange() }, h("span", { html: icon("grid", 14) }), t("Auto arrange")));
    const showStart = (app.settings.startup || "start") === "start";
    const foot = h("footer", { class: "start-foot" },
      h("label", { class: "start-check" }, h("input", { type: "checkbox", checked: showStart, onchange: (e) => app.setSetting("startup", e.target.checked ? "start" : "last") }), h("span", {}, t("Show the start page at start-up"))),
      h("span", { class: "grow" }),
      h("span", { class: "muted" }, "© SHKWON (knix008@naver.com)"));
    this.scroll = h("div", { class: "start-scroll" }, h("div", { class: "start-inner" }, tools, board, foot));
    this.host.append(this.scroll);
    // The page settles without animation (the sample list arrives a moment
    // later and the cards take their real heights); afterwards every change glides.
    board.classList.add("no-anim");
    this.relayout();
    this.measure();
    this.watch();
    this.startAnimation();
    this.fillSamples(samplesGrid).catch(() => {}).finally(() => {
      this.measure();
      requestAnimationFrame(() => requestAnimationFrame(() => { if (this.board === board) board.classList.toggle("no-anim", app.settings.animations === false); }));
    });
  }

  // ---------------------------------------------------------------- cards
  cardDefs(samplesGrid) {
    const app = this.app;
    const ko = getLanguage() === "ko";
    const recent = (app.settings.recent || []).slice(0, +app.settings.recentLimit || 10);
    const btn = (ic, label, fn, cls = "") => h("button", { class: `btn ${cls}`, onclick: fn }, h("span", { html: icon(ic, 15) }), label);
    const link = (ic, label, fn, attrs = {}) => h("button", { class: "start-link", onclick: fn, ...attrs }, h("span", { class: "si", html: icon(ic, 15) }), h("span", { class: "name" }, label));
    const version = "10.0";
    const sampleTitle = (file, fallback) => {
      const s = (this.sampleIndex || []).find((x) => x.file === file);
      return s ? (ko ? s.titleKo || s.title : s.title) : t(fallback);
    };
    const tile = ([kind, id, ic, name, desc]) => {
      const label = kind === "sample" ? sampleTitle(id, name) : t(name);
      return h("button", { class: "template-tile", title: t(desc), "data-tile": id, onclick: () => (kind === "sample" ? app.openSample(id) : app.run(id)) },
        h("span", { class: "si", html: icon(ic, 18) }), h("b", {}, label), h("small", {}, t(desc)));
    };
    const bg = this.bg;
    const kinds = h("div", { class: "bg-kinds", role: "radiogroup", "aria-label": t("Background") },
      ...ANIMATION_KINDS.map((k) => h("button", { class: `bg-kind ${bg.kind === k ? "on" : ""}`, role: "radio", "aria-checked": String(bg.kind === k), "data-bg-kind": k, title: `${t(ANIMATION_NAMES[k][0])} — ${t(ANIMATION_NAMES[k][1])}`, onclick: () => this.setKind(k) },
        h("span", { html: icon(ANIMATION_ICONS[k], 14) }), h("span", {}, t(ANIMATION_NAMES[k][0])))),
      h("button", { class: `bg-kind shuffle ${(+bg.shuffleSec || 0) > 0 ? "on" : ""}`, role: "switch", "aria-checked": String((+bg.shuffleSec || 0) > 0), title: t("A different background every {n} seconds", { n: bg.shuffleSec || 20 }),
        onclick: () => { this.saveBg({ shuffleSec: (+this.bg.shuffleSec || 0) > 0 ? 0 : 20 }); this.applyBackground(); this.refreshSide(); } }, h("span", { html: icon("refresh", 14) }), h("span", {}, t("Shuffle"))));
    // A label line, the bar with − / + under it (the card may be one column narrow).
    // The background follows the bar as it moves; the setting is saved once it settles.
    const row = (ic, label, control, unit = "") => h("div", { class: "start-setting" }, h("div", { class: "start-speed" }, h("span", { class: "si", html: icon(ic, 14) }), h("span", {}, label)), h("div", { class: "start-ctl" }, control, unit ? h("span", { class: "unit" }, unit) : null));
    const step = (key, min, max, stp, fmt) => {
      const el = slider(+bg[key] || 0, { min, max, step: stp, format: fmt,
        onInput: (v) => { this.app.settings.startBackground = { ...this.bg, [key]: v }; this.applyBackground(); },
        onChange: (v) => { this.saveBg({ [key]: v }); this.applyBackground(); } });
      el.dataset.bgSetting = key;
      return el;
    };
    return {
      hero: { cls: "start-hero", bare: true, body: [
        h("img", { class: "start-icon", src: "assets/icon.png", alt: "" }),
        h("div", { class: "hero-text" }, h("h1", {}, "MyArchitecture ", h("small", {}, `V${version}`)), h("p", {}, t("Floor plan → 3D → drawings, BIM and CAD exchange, in one window."))),
        h("div", { class: "start-hero-actions" },
          h("div", { class: "start-docs" }, btn("help", t("User manual"), () => app.run("help.manual")), btn("keyboard", t("Keyboard shortcuts"), () => app.run("help.keys"))),
          btn("sample", t("Start the tutorial"), () => app.run("help.tutorial"), "primary big"))] },
      banner: { cls: "start-banner", bare: true, body: [
        h("span", { class: "si", html: icon("bulb", 16) }),
        h("span", { class: "banner-text" }, t("New to MyArchitecture? The tutorial draws a house with you step by step and ends with a three-storey building of your own.")),
        h("button", { class: "btn small primary", onclick: () => app.run("help.tutorial") }, h("span", { html: icon("play", 11) }), t("Start the tutorial")),
        h("button", { class: "icon-btn", title: t("Hide"), "aria-label": t("Hide"), "data-banner-hide": "1", html: icon("close", 14), onclick: () => { this.saveBg({ banner: false }); this.render(); } })] },
      templates: { icon: "plus", title: t("Start something new"), body: [
        h("div", { class: "start-actions" }, btn("new", t("New project"), () => app.run("file.new"), "primary"), btn("open", t("Open project…"), () => app.run("file.open")), btn("import", t("Import…"), () => app.run("file.import")), btn("sample", t("Browse samples"), () => app.run("file.samples"))),
        h("div", { class: "template-groups" }, ...GROUPS.map(([g, items]) => h("div", { class: "template-group" }, h("p", { class: "template-group-title" }, t(g)), ...items.map(tile))))] },
      recent: { icon: "history", title: t("Recent"), extra: recent.length ? h("button", { class: "btn small", "data-clear-recent": "1", onclick: () => app.run("file.clearRecent") }, h("span", { html: icon("trash", 12) }), t("Clear list")) : null,
        body: [recent.length ? h("div", { class: "recent-list" }, ...recent.map((r, i) => h("div", { class: "recent-item", title: r.path, onclick: () => app.openPath(r.path) },
          h("span", { html: icon("file", 15) }), h("span", { class: "name" }, `${i + 1}. ${r.title || r.path.split(/[\\/]/).pop()}`), h("small", {}, new Date(r.at).toLocaleDateString()),
          h("span", { class: "ri-del", title: t("Remove from the list"), "data-remove": r.path, html: icon("close", 13), onclick: (e) => { e.stopPropagation(); app.removeRecent(r.path); } }))))
          : h("div", { class: "start-empty" }, h("span", { html: icon("info", 13) }), h("span", {}, t("No recent projects yet. Open a sample or start a new project.")))] },
      side: { icon: "palette", title: t("Background"), body: [kinds,
        row("zoomIn", t("Speed"), step("speed", 0, 300, 10, (v) => `${v}`), "%"),
        row("eye", t("Transparency"), step("transparency", 0, 100, 5, (v) => `${v}`), "%"),
        row("refresh", t("Shuffle every"), step("shuffleSec", 0, 600, 5, (v) => `${v}`), t("s")),
        h("label", { class: "start-check" }, h("input", { type: "checkbox", checked: !!bg.random, onchange: (e) => this.saveBg({ random: e.target.checked }) }), h("span", {}, t("A random background at each start")))] },
      help: { icon: "help", title: t("Help"), body: [
        h("div", { class: "start-help" },
          link("sample", t("Interactive tutorial"), () => app.run("help.tutorial")), link("help", t("User manual"), () => app.run("help.manual")),
          link("keyboard", t("Keyboard shortcuts"), () => app.run("help.keys")), link("info", t("Quick tour"), () => app.run("help.tour")),
          link("file", t("Supported file formats"), () => app.run("help.formats")), link("info", t("About MyArchitecture"), () => app.run("help.about"))),
        h("div", { class: "tip" }, h("b", {}, t("Tip")), " — ", t(TIPS[Math.floor(Date.now() / 86400000) % TIPS.length]))] },
      samples: { icon: "sample", title: t("Samples"), titleCount: true, extra: btn("sample", t("Browse samples"), () => app.run("file.samples")), body: [samplesGrid] },
    };
  }

  cardElement(id, d) {
    const handle = h("button", { class: "card-handle", type: "button", title: `${t("Move the card")} (Alt+←↑↓→ · Alt+Shift: ${t("Resize the card")})`, "aria-label": t("Move the card"), "data-handle": id }, "⠿");
    handle.addEventListener("pointerdown", (e) => this.startMove(e, id));
    handle.addEventListener("keydown", (e) => this.keyMove(e, id));
    const head = d.bare ? h("span", { class: "card-handle-float" }, handle)
      : h("h2", { class: "card-head" }, handle, h("span", { class: "si", html: icon(d.icon, 15) }), h("span", { class: "card-title" }, d.title), h("span", { class: "grow" }), d.extra || null);
    const body = h("div", { class: "card-body" }, ...d.body);
    const grip = h("span", { class: "card-resize", title: `${t("Resize the card")} (${t("double-click: fit the contents")})`, "data-resize": id });
    grip.addEventListener("pointerdown", (e) => this.startResize(e, id));
    grip.addEventListener("dblclick", () => this.fitCard(id));
    return h("section", { class: `start-card ${d.cls || id} ${d.bare ? "bare" : ""}`, "data-card": id }, head, body, grip);
  }

  // ---------------------------------------------------------------- layout
  saved() { return cardsOf(this.bg.layout, this.visibleIds(), DEFAULT_SPAN, this.measured); }

  // Puts every card (but `skip`, the one under the pointer) at its cell.
  // The CSS transitions turn each change into a glide.
  apply(cards, skip = null) {
    const board = this.board;
    if (!board) return;
    const width = board.clientWidth || 1000;
    let bottom = 0;
    for (const [id, el] of this.cards) {
      const c = cards[id];
      if (!c) continue;
      bottom = Math.max(bottom, c.row + c.h);
      el.classList.toggle("fit", !!c.fit);
      el.classList.toggle("fixed-height", !c.fit);
      if (id === skip) continue;
      const b = boxOf(c, width);
      el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
    board.style.height = `${bottom * ROW}px`;
    this.shown = cards;
  }

  relayout() { this.apply(this.saved()); }

  showOutline(c) {
    if (!c) { this.outline.classList.remove("on"); return; }
    const b = boxOf(c, this.board.clientWidth || 1000);
    this.outline.style.transform = `translate(${b.x}px, ${b.y}px)`;
    this.outline.style.width = `${b.w}px`;
    this.outline.style.height = `${b.h}px`;
    this.outline.classList.add("on");
  }

  saveLayout(cards) {
    this.saveBg({ layout: layoutValue(compact(cards)) });
    this.relayout();
  }

  arrange() { this.saveLayout(autoArrange(this.visibleIds(), DEFAULT_SPAN, this.measured)); }

  fitCard(id) { this.saveLayout(place(this.saved(), id, { fit: true })); }

  // Fit cards: the height follows the content (in rows). Growing always
  // applies; shrinking by a single row is ignored, so a card whose height
  // depends on its own width cannot flip between two heights forever.
  measure() {
    if (!this.board || this.drag) return;
    const now = performance.now();
    if (now - this.burst.at > 1000) this.burst = { at: now, n: 0 };
    if (this.burst.n > 12) return;
    let changed = false;
    for (const [id, el] of this.cards) {
      const head = el.querySelector(":scope > .card-head, :scope > .card-handle-float");
      const body = el.querySelector(":scope > .card-body");
      const cs = getComputedStyle(el);
      // A fit card's body is not stretched (CSS), so its height is the content's.
      const content = el.classList.contains("fit") ? body.offsetHeight : body.scrollHeight;
      const need = (head && !head.classList.contains("card-handle-float") ? head.offsetHeight + parseFloat(getComputedStyle(head).marginBottom || 0) : 0) + content + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2;
      const rows = rowsFor(need);
      const m = this.measured[id];
      if (m === undefined || rows > m || m - rows > 1) { this.measured[id] = rows; changed = true; }
    }
    if (changed) { this.burst.n++; this.relayout(); }
  }

  watch() {
    if (this.ro) this.ro.disconnect();
    if (typeof ResizeObserver === "undefined") return;
    let width = 0;
    this.ro = new ResizeObserver(() => {
      // A new board width: the cards follow at once (no glide while the window is resized).
      const w = this.board ? this.board.clientWidth : 0;
      if (w && w !== width) {
        const first = !width;
        width = w;
        if (!first) { this.board.classList.add("no-anim"); this.apply(this.shown || this.saved(), this.drag && this.drag.id); clearTimeout(this.noAnimTimer); this.noAnimTimer = setTimeout(() => this.board && this.board.classList.toggle("no-anim", this.app.settings.animations === false), 120); }
      }
      this.measure();
    });
    this.ro.observe(this.board);
    for (const el of this.cards.values()) { const body = el.querySelector(".card-body"); if (body.firstElementChild) this.ro.observe(body.firstElementChild); this.ro.observe(body); }
  }

  autoScroll(ev) {
    const sc = this.scroll;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (ev.clientY > r.bottom - 40) sc.scrollTop += 14;
    else if (ev.clientY < r.top + 40) sc.scrollTop -= 14;
  }

  // ⠿ handle: the card follows the pointer, the others make room as it goes.
  startMove(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = this.cards.get(id);
    const saved = this.saved();
    const c = saved[id];
    const width = this.board.clientWidth;
    const start = boxOf(c, width);
    const sx = e.clientX, sy = e.clientY, st0 = this.scroll.scrollTop;
    let target = { col: c.col, row: c.row };
    let pending = saved;
    this.drag = { id, mode: "move" };
    el.classList.add("dragging");
    this.showOutline(c);
    const move = (ev) => {
      this.autoScroll(ev);
      const x = Math.max(0, Math.min(width - start.w, start.x + ev.clientX - sx));
      const y = Math.max(0, start.y + ev.clientY - sy + this.scroll.scrollTop - st0);
      el.style.transform = `translate(${x}px, ${y}px) scale(1.01)`;
      const next = cellAt(x, y, c.w, width);
      if (next.col !== target.col || next.row !== target.row) {
        target = next;
        pending = place(saved, id, target);
        this.apply(pending, id);
        this.showOutline(pending[id]);
      }
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.drag = null;
      el.classList.remove("dragging");
      this.showOutline(null);
      // Settles into its cell (the transition is back on).
      if (ev.type === "pointerup" && (target.col !== c.col || target.row !== c.row)) this.saveLayout(pending);
      else this.relayout();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // Bottom-right corner: the card's size follows the pointer, it snaps to whole cells when let go.
  startResize(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = this.cards.get(id);
    const saved = this.saved();
    const c = saved[id];
    const width = this.board.clientWidth;
    const b0 = boxOf(c, width);
    const colW = (width - GAP * (COLS - 1)) / COLS;
    const maxW = boxOf({ col: c.col, row: 0, w: COLS - c.col, h: 1 }, width).w;
    const sx = e.clientX, sy = e.clientY, st0 = this.scroll.scrollTop;
    let target = { w: c.w, h: c.h };
    let pending = saved;
    this.drag = { id, mode: "resize" };
    el.classList.add("resizing");
    this.showOutline(c);
    const move = (ev) => {
      this.autoScroll(ev);
      const pw = Math.max(colW, Math.min(maxW, b0.w + ev.clientX - sx));
      const ph = Math.max(4 * ROW - GAP, b0.h + ev.clientY - sy + this.scroll.scrollTop - st0);
      el.style.width = `${pw}px`;
      el.style.height = `${ph}px`;
      const next = spanFor(pw, ph, c.col, width);
      if (next.w !== target.w || next.h !== target.h) {
        target = next;
        pending = place(saved, id, { ...target, fit: false });
        this.apply(pending, id);
        this.showOutline(pending[id]);
      }
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.drag = null;
      el.classList.remove("resizing");
      this.showOutline(null);
      if (ev.type === "pointerup" && (target.w !== c.w || target.h !== c.h)) this.saveLayout(pending);
      else this.relayout();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // Keyboard on a card's ⠿ handle: Alt+arrows move it a cell, Alt+Shift+arrows resize it.
  keyMove(e, id) {
    if (!e.altKey || !e.key.startsWith("Arrow")) return;
    e.preventDefault();
    e.stopPropagation();
    const saved = this.saved();
    const c = { ...saved[id] };
    const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (e.shiftKey) {
      c.w = Math.max(1, Math.min(COLS - c.col, c.w + dx));
      if (dy) { c.h = Math.max(4, c.h + dy); c.fit = false; }
      this.saveLayout(place(saved, id, c));
    } else if (dy) {
      this.saveLayout(swapVertical(saved, id, dy)); // a plain move up / down would compact back
    } else {
      c.col = Math.max(0, Math.min(COLS - c.w, c.col + dx));
      this.saveLayout(place(saved, id, c));
    }
  }

  // ---------------------------------------------------------------- background
  ensureBackground() {
    if (!this.bgCanvas) {
      this.bgCanvas = h("canvas", { class: "start-anim", "aria-hidden": "true" });
      // The live 3D house (kind "model3d"); kept when the page is drawn again.
      this.bgHost = h("div", { class: "start-bg" }, h("img", { class: "start-bg-img", src: "assets/art/hero.png", alt: "" }));
    }
  }

  startAnimation() {
    const bg = this.bg;
    if (!this.anim) {
      const first = bg.random ? ANIMATION_KINDS.filter((k) => k !== "model3d")[Math.floor(Math.random() * (ANIMATION_KINDS.length - 1))] : bg.kind;
      this.anim = new AnimatedBackground(this.bgCanvas, { kind: first, speed: () => (+this.bg.speed || 0) / 100, colors: themeColors });
      new MutationObserver(() => this.anim && this.anim.refreshColors()).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    }
    this.applyBackground();
  }

  setKind(k) {
    this.saveBg({ kind: k });
    this.anim.setKind(k);
    this.applyBackground();
    this.refreshSide();
  }

  // Kind, speed, transparency and shuffle as saved; the animations setting stops it all.
  applyBackground() {
    const bg = this.bg;
    const a = this.anim;
    if (!a) return;
    const still = this.app.settings.animations === false;
    const kind = a.kind;
    this.host.classList.toggle("bg-model3d", kind === "model3d");
    this.bgCanvas.style.opacity = String(1 - (+bg.transparency || 0) / 100);
    this.bgHost.style.opacity = String(1 - (+bg.transparency || 0) / 100);
    if (this.app.tab === "start" && !still) a.start(); else { a.stop(); a.draw(0); }
    if (kind === "model3d") (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(() => this.startBackground(), { timeout: 1500 });
    else this.stopBackground();
    clearInterval(this.shuffleTimer);
    const sec = +bg.shuffleSec || 0;
    if (sec > 0 && !still) this.shuffleTimer = setInterval(() => { if (this.app.tab !== "start") return; this.anim.shuffle(); this.applyBackground(); this.refreshSide(); }, sec * 1000);
  }

  // The background card shows the kind now on screen.
  refreshSide() {
    const el = this.cards && this.cards.get("side");
    if (!el || !this.anim) return;
    for (const b of el.querySelectorAll("[data-bg-kind]")) { const on = b.dataset.bgKind === this.anim.kind; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
    const sh = el.querySelector(".bg-kind.shuffle");
    if (sh) sh.classList.toggle("on", (+this.bg.shuffleSec || 0) > 0);
  }

  // ---------------------------------------------------------------- samples
  async fillSamples(grid) {
    const ko = getLanguage() === "ko";
    const samples = await loadSampleIndex();
    this.sampleIndex = samples;
    // Tile names come from the sample index once it is known.
    if (this.cards) for (const tl of this.board.querySelectorAll("[data-tile]")) {
      const s = samples.find((x) => x.file === tl.dataset.tile);
      if (s) tl.querySelector("b").textContent = ko ? s.titleKo || s.title : s.title;
    }
    const title = this.cards && this.cards.get("samples") && this.cards.get("samples").querySelector(".card-title");
    if (title) title.textContent = `${t("Samples")} (${samples.length})`;
    if (!samples.length) grid.append(h("div", { class: "empty-note" }, t("No samples found.")));
    for (const s of samples) {
      const canvas = h("canvas", { width: 460, height: 260 });
      grid.append(h("button", { class: "sample-card", onclick: () => this.app.openSample(s.file) }, canvas,
        h("div", { class: "sc-body" }, h("b", {}, ko ? s.titleKo || s.title : s.title), h("small", {}, ko ? s.descriptionKo || s.description : s.description),
          h("div", { class: "tags" }, ...(s.tags || []).slice(0, 5).map((tg) => h("span", {}, tg))))));
      this.thumb(s.file, canvas).then(() => this.queue3d(s.file, canvas));
    }
    this.measure();
  }

  async load(file) {
    if (!this.cache.has(file)) {
      const text = await loadSampleText(file);
      this.hashes.set(file, hashText(text));
      this.cache.set(file, parseProject(text));
    }
    return this.cache.get(file);
  }

  async thumb(file, canvas) {
    try {
      const p = await this.load(file);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f6f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const level = p.levels[0].id;
      const b = planBounds(p, level);
      if (!b) return;
      const pad = 800;
      const s = Math.min(canvas.width / (b.x2 - b.x1 + pad * 2), canvas.height / (b.y2 - b.y1 + pad * 2));
      ctx.setTransform(s, 0, 0, s, canvas.width / 2 - ((b.x1 + b.x2) / 2) * s, canvas.height / 2 - ((b.y1 + b.y2) / 2) * s);
      drawPlan(ctx, p, { ...PLAN_THEMES.light, bg: "#f6f5f0" }, { level, lw: 1 / s, px: 1 / s, print: true, show: { dims: false, tags: false, roofs: false, ghost: false } });
    } catch { /* a broken sample just shows an empty card */ }
  }

  // ---------------------------------------------------------------- 3D
  bgColors() {
    const th = this.app.currentTheme();
    return th.mode === "light" ? { top: "#c9dbee", bottom: "#eef1f4" } : { top: th.panel, bottom: th.bg };
  }

  // The live 3D house behind the cards (background kind "model3d").
  async startBackground() {
    if (this.app.settings.animations === false || !this.anim || this.anim.kind !== "model3d") { this.stopBackground(); return; }
    if (this.bgViewer) { this.bgViewer.setOptions({ background: this.bgColors() }); return; } // the theme may have changed
    if (this.bgStarting) return;
    this.bgStarting = true;
    try {
      const samples = await loadSampleIndex();
      const first = samples.find((s) => s.hero) || samples[0];
      if (!first) return;
      const { createViewer } = await import("../view3d/viewer.js");
      const project = await this.load(first.file);
      if (!this.bgHost || !this.bgHost.isConnected || this.app.tab !== "start" || this.anim.kind !== "model3d") return;
      this.stopBackground();
      this.bgViewer = createViewer(this.bgHost, { grid: false, gizmo: false, shadows: true, background: this.bgColors() });
      this.bgViewer.setProject(project);
      this.bgViewer.setView("bird");
      const v = this.bgViewer;
      const { controls } = v.three;
      controls.autoRotate = true;
      controls.enableZoom = false;
      // The still picture stays until the view has drawn its first frame.
      v.ready().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const img = this.bgViewer === v && this.bgHost.querySelector(".start-bg-img");
        if (img) img.style.opacity = "0";
      })));
      const loop = () => {
        if (this.bgViewer !== v) return; // stopped, or another view took over
        if (!this.bgHost.isConnected || this.app.tab !== "start") { this.stopBackground(); return; }
        controls.autoRotateSpeed = 0.5 * ((+this.bg.speed || 0) / 100);
        controls.update();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      console.warn("start background", e);
    } finally {
      this.bgStarting = false;
    }
  }

  stopBackground() {
    if (this.bgViewer) { try { this.bgViewer.dispose(); } catch { /* gone */ } }
    this.bgViewer = null;
    const img = this.bgHost && this.bgHost.querySelector(".start-bg-img");
    if (img) img.style.opacity = ""; // the still picture until a view runs again
  }

  // Leaving the start page: the background stops and the 3D thumbnails wait
  // (render() queues the missing ones again on the way back), so a hidden
  // second 3D view does not compete with the model being worked on.
  leave() {
    if (this.anim) this.anim.stop();
    clearInterval(this.shuffleTimer);
    this.stopBackground();
    this.q = [];
    if (!this.qBusy) this.stopThumbs();
  }

  stopThumbs() {
    if (this.thumbViewer) { try { this.thumbViewer.dispose(); } catch { /* gone */ } }
    if (this.thumbHost) this.thumbHost.remove();
    this.thumbViewer = this.thumbHost = null;
  }

  // What a saved thumbnail must match: this build and the sample's text.
  async thumbSig(file) {
    if (!this.stamp) this.stamp = import("../buildinfo.js").then((m) => `${m.BUILD.version}+${m.BUILD.commit}`, () => "dev");
    return `${await this.stamp}:${this.hashes.get(file) || ""}`;
  }

  savedThumbs() {
    if (!this.savedT) {
      try { this.savedT = JSON.parse(localStorage.getItem(THUMBS_KEY) || "{}") || {}; } catch { this.savedT = {}; }
    }
    return this.savedT;
  }

  saveThumb(file, sig, url) {
    const all = this.savedThumbs();
    all[file] = { sig, url };
    try { localStorage.setItem(THUMBS_KEY, JSON.stringify(all)); } catch { /* full or blocked: drawn again next run */ }
  }

  async queue3d(file, canvas) {
    this.renders = this.renders || new Map();
    if (this.renders.has(file)) { this.paint3d(canvas, this.renders.get(file)); return; }
    const sig = await this.thumbSig(file);
    const saved = this.savedThumbs()[file];
    if (saved && saved.sig === sig && saved.url) { this.renders.set(file, saved.url); this.paint3d(canvas, saved.url); return; }
    this.q = this.q || [];
    this.q.push([file, canvas]);
    if (!this.qBusy && this.app.tab === "start") this.drain3d();
  }

  async drain3d() {
    this.qBusy = true;
    try {
      const { createViewer } = await import("../view3d/viewer.js");
      if (!this.thumbHost) {
        this.thumbHost = h("div", { class: "thumb3d-host" });
        document.body.append(this.thumbHost);
        this.thumbViewer = createViewer(this.thumbHost, { grid: false, gizmo: false, shadows: true, background: { top: "#9cc0e3", bottom: "#eef2f4" } });
      }
      while (this.q.length && this.app.tab === "start") {
        const [file, canvas] = this.q.shift();
        if (!canvas.isConnected) continue; // a card of an earlier render of the page
        if (this.renders.has(file)) { this.paint3d(canvas, this.renders.get(file)); continue; }
        const project = await this.load(file);
        this.thumbViewer.setProject(project);
        this.thumbViewer.setView("iso");
        await new Promise((r) => setTimeout(r, 650));
        await this.thumbViewer.ready(); // shaders compiled off the main thread: the app does not freeze
        if (this.app.tab !== "start" || !this.thumbViewer) break;
        const url = this.thumbViewer.screenshot();
        const sig = await this.thumbSig(file);
        // Kept at card size, as WebP: a fraction of the full-size PNG.
        this.paint3d(canvas, url, () => {
          const small = canvas.toDataURL("image/webp", 0.85);
          this.renders.set(file, small);
          this.saveThumb(file, sig, small);
        });
      }
    } catch (e) {
      console.warn("3D thumbnails", e);
    }
    this.qBusy = false;
    if (this.app.tab !== "start" || !this.q.length) this.stopThumbs(); // all done, or paused: free its GPU context
  }

  paint3d(canvas, url, then = null) {
    const img = new Image();
    img.onload = () => {
      const g = canvas.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0);
      const k = Math.max(canvas.width / img.width, canvas.height / img.height);
      g.drawImage(img, (canvas.width - img.width * k) / 2, (canvas.height - img.height * k) / 2, img.width * k, img.height * k);
      canvas.classList.add("is3d");
      if (then) then();
    };
    img.src = url;
  }
}
