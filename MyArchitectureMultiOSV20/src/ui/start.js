// Start page in MyUMLMaker's style (its src/ui/startpage.js + startboard.js):
// a full-window moving background (startbg.js, or the live 3D house) behind a
// board of translucent cards — the hero (icon, name, version, documents,
// tutorial), a first-run banner, 바로 가기 (launcher tiles), recent projects,
// 새로 시작 (tiles by kind of building, starttemplates.js), themes, the
// background controls and the sample gallery with 3D thumbnails. Icons are
// coloured by meaning (icontones.js). Every card is moved by its four-arrow
// handle and resized by the dotted corner on a 3-column grid (startlayout.js):
// the moved or resized card follows the pointer continuously, the others
// slide to their new places and the card settles into its cell when it is
// let go. Background and layout are kept in settings.startBackground.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { toned } from "./icontones.js";
import { h, slider } from "./widgets.js";
import { loadSampleIndex, loadSampleText } from "./dialogs.js";
import { parseProject } from "../core/project.js";
import { PLAN_THEMES, drawPlan, planBounds } from "../plan/render.js";
import { COLS, ROW, GAP, cardsOf, place, compact, autoArrange, swapVertical, layoutValue, rowsFor, boxOf, cellAt, spanFor, fullColumns } from "./startlayout.js";
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, ANIMATION_NAMES, DEFAULT_START_BACKGROUND, themeColors } from "./startbg.js";
import { START_GROUPS, START_TILE_COUNT } from "./starttemplates.js";
import { allThemes, uiTokens } from "./themes.js";
import { UK_FLAG, KR_FLAG } from "./flags.js";
import { isDesktop } from "./platform.js";

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

// Cards in reading order (MyUMLMaker's start board): the hero, the tutorial
// banner, 바로 가기 and recent projects side by side, 새로 시작, themes and
// the background side by side, then the sample gallery.
export const CARD_IDS = ["hero", "banner", "actions", "recent", "templates", "theme", "side", "samples"];
export const DEFAULT_SPAN = { hero: 3, banner: 3, actions: 2, recent: 1, templates: 3, theme: 2, side: 1, samples: 3 };

// The card handle (moves the card): three horizontal rows of dots.
const MOVE_ICON = '<svg class="ico" data-tone="pink" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="5" cy="7" r="1.6"/><circle cx="9.67" cy="7" r="1.6"/><circle cx="14.33" cy="7" r="1.6"/><circle cx="19" cy="7" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="9.67" cy="12" r="1.6"/><circle cx="14.33" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="17" r="1.6"/><circle cx="9.67" cy="17" r="1.6"/><circle cx="14.33" cy="17" r="1.6"/><circle cx="19" cy="17" r="1.6"/></svg>';

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
    // Top right: the two start-up switches (the same settings as Settings ›
    // General) and Auto arrange.
    const check = (key, label, tip, on, set) => h("label", { class: "start-btn start-startup", title: tip },
      h("input", { type: "checkbox", checked: on, "data-start-check": key, onchange: (e) => set(e.target.checked) }), h("span", {}, label));
    const tools = h("div", { class: "start-tools" },
      check("startup", t("Show the start page at start-up"), t("Otherwise the last project opens at start-up"), (app.settings.startup || "start") === "start", (v) => app.setSetting("startup", v ? "start" : "last")),
      check("tutorial", t("Ask to start the tutorial at start-up"), t("The start-up popup that offers the tutorial"), app.settings.tutorialAtStart !== false, (v) => app.setSetting("tutorialAtStart", v)),
      h("button", { class: "start-btn", "data-start-arrange": "1", title: t("Pack the cards in three columns again"), onclick: () => this.arrange() }, h("span", { class: "si", html: toned("grid", 15) }), h("span", {}, t("Auto arrange"))));
    const tip = TIPS[Math.floor(Date.now() / 86400000) % TIPS.length];
    const foot = h("footer", { class: "start-foot" },
      h("span", { class: "si", html: toned("info", 15) }), h("span", {}, `MyArchitecture v${app.version || ""}`),
      h("span", { class: "start-tip", title: t(tip) }, h("span", { class: "si", html: toned("bulb", 14) }), h("b", {}, t("Tip")), h("span", {}, t(tip))),
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
    fullRows(samplesGrid, 210, 10);
    this.fillSamples(samplesGrid).catch(() => {}).finally(() => {
      this.measure();
      requestAnimationFrame(() => requestAnimationFrame(() => { if (this.board === board) board.classList.toggle("no-anim", app.settings.animations === false); }));
    });
  }

  // The start-up switches follow the setting when it changes elsewhere (the popup, Settings).
  syncChecks() {
    if (!this.scroll) return;
    const s = this.app.settings;
    for (const box of this.scroll.querySelectorAll("[data-start-check]")) box.checked = box.dataset.startCheck === "startup" ? (s.startup || "start") === "start" : s.tutorialAtStart !== false;
  }

  // ---------------------------------------------------------------- cards
  cardDefs(samplesGrid) {
    const app = this.app;
    const ko = getLanguage() === "ko";
    const recent = (app.settings.recent || []).slice(0, +app.settings.recentLimit || 10);
    const btn = (ic, label, fn, cls = "") => h("button", { class: `btn ${cls}`, onclick: fn }, h("span", { class: "si", html: toned(ic, 15) }), label);
    const sampleTitle = (file, fallback) => {
      const s = (this.sampleIndex || []).find((x) => x.file === file);
      return s ? (ko ? s.titleKo || s.title : s.title) : t(fallback);
    };
    // One launcher tile: coloured icon (or a flag), name and a line under it.
    const tile = (cls, ic, label, desc, fn, attrs = {}) => h("button", { class: `start-tile ${cls}`, title: desc ? `${label} — ${desc}` : label, onclick: fn, ...attrs },
      h("span", { class: "si", html: ic.startsWith("<svg") ? ic : toned(ic, 20) }), h("b", {}, label), h("small", {}, desc));
    const template = ([kind, id, ic, name, desc]) => tile("template-tile", ic, kind === "sample" ? sampleTitle(id, name) : t(name), t(desc),
      () => (kind === "sample" ? app.openSample(id) : kind === "preset" ? app.newProject(id) : app.run(id)), { "data-tile": id, "data-kind": kind });
    const bg = this.bg;
    const kinds = h("div", { class: "bg-kinds", role: "radiogroup", "aria-label": t("Background") },
      ...ANIMATION_KINDS.map((k) => h("button", { class: `bg-kind ${bg.kind === k ? "on" : ""}`, role: "radio", "aria-checked": String(bg.kind === k), "data-bg-kind": k, title: `${t(ANIMATION_NAMES[k][0])} — ${t(ANIMATION_NAMES[k][1])}`, onclick: () => this.setKind(k) },
        h("span", { class: "si", html: toned(ANIMATION_ICONS[k], 15) }), h("span", {}, t(ANIMATION_NAMES[k][0])))),
      h("button", { class: `bg-kind shuffle ${(+bg.shuffleSec || 0) > 0 ? "on" : ""}`, role: "switch", "aria-checked": String((+bg.shuffleSec || 0) > 0), title: t("A different background every {n} seconds", { n: bg.shuffleSec || 20 }),
        onclick: () => { this.saveBg({ shuffleSec: (+this.bg.shuffleSec || 0) > 0 ? 0 : 20 }); this.applyBackground(); this.refreshSide(); } }, h("span", { class: "si", html: toned("refresh", 15) }), h("span", {}, t("Shuffle"))));
    // A label line, the bar with − / + under it (the card may be one column narrow).
    // The background follows the bar as it moves; the setting is saved once it settles.
    const row = (ic, label, control, unit = "") => h("div", { class: "start-setting" }, h("div", { class: "start-speed" }, h("span", { class: "si", html: toned(ic, 14) }), h("span", {}, label)), h("div", { class: "start-ctl" }, control, unit ? h("span", { class: "unit" }, unit) : null));
    const step = (key, min, max, stp, fmt) => {
      const el = slider(+bg[key] || 0, { min, max, step: stp, format: fmt,
        onInput: (v) => { this.app.settings.startBackground = { ...this.bg, [key]: v }; this.applyBackground(); },
        onChange: (v) => { this.saveBg({ [key]: v }); this.applyBackground(); } });
      el.dataset.bgSetting = key;
      return el;
    };
    // 바로 가기: what to do next, as tiles.
    const actions = [
      ["new", t("New project"), t("A blank project: start with the walls"), () => app.run("file.new")],
      ["open", t("Open project…"), t("A .myarch project you saved"), () => app.run("file.open")],
      ["import", t("Import…"), t("DXF, DWG, IFC, SVG, 3D models, images"), () => app.run("file.import")],
      ["sample", t("Browse samples"), t("Preview the samples and open one"), () => app.run("file.samples")],
      ["history", t("Recent files…"), t("Every project you opened lately"), () => app.run("file.recent")],
      ["play", t("Interactive tutorial"), t("Draw a house with the tutorial, step by step"), () => app.run("help.tutorial")],
      ["palette", t("Themes…"), t("Forty colour themes, dark and light"), () => app.run("view.themes")],
      [ko ? UK_FLAG : KR_FLAG, ko ? "English" : "한국어", t("Change the language of the screen"), () => app.setSetting("lang", ko ? "en" : "ko")],
      ["settings", t("Settings…"), t("Units, grid, autosave, start-up"), () => app.run("tools.settings")],
      ["file", t("Supported file formats"), t("What opens and what can be exported"), () => app.run("help.formats")],
      ["info", t("About MyArchitecture"), t("Version, build and author"), () => app.run("help.about")],
      ...(isDesktop ? [["close", t("Exit"), t("Close MyArchitecture"), () => app.run("file.exit")]] : []),
    ];
    // Themes: every dark and light theme as a tile; the current one is marked.
    const themeTile = (th) => {
      const tok = uiTokens(th);
      const on = this.app.settings.theme === th.id;
      return h("button", { class: `bg-kind theme-tile ${on ? "on" : ""}`, role: "radio", "aria-checked": String(on), "data-theme-pick": th.id, title: th.name[getLanguage()] || th.name.en,
        onclick: () => { this.app.setSetting("theme", th.id); this.refreshThemes(); } },
        h("span", { class: "theme-chip", style: { background: th.bg } }, h("i", { style: { background: th.panel } }), h("i", { style: { background: tok["--line2"] } }), h("i", { style: { background: th.accent } })),
        h("span", {}, th.name[getLanguage()] || th.name.en));
    };
    const themes = allThemes();
    const themeGroup = (mode, ic, label) => {
      const list = themes.filter((x) => x.mode === mode);
      return h("section", { class: "start-group" }, h("h3", {}, h("span", { class: "si", html: toned(ic, 15) }), h("span", {}, label), h("span", { class: "start-count" }, String(list.length))),
        h("div", { class: "theme-tiles", role: "radiogroup", "aria-label": label }, ...list.map(themeTile)));
    };
    return {
      hero: { cls: "start-hero", bare: true, body: [
        h("img", { class: "start-icon", src: "assets/icon.png", alt: "" }),
        h("div", { class: "hero-text" }, h("h1", {}, h("span", {}, "MyArchitecture"), h("small", {}, `v${app.version || ""}`)), h("p", {}, t("Floor plan → 3D → drawings, BIM and CAD exchange, in one window."))),
        h("div", { class: "start-hero-actions" },
          h("div", { class: "start-docs" }, btn("help", t("User manual"), () => app.run("help.manual"), "big"), btn("keyboard", t("Keyboard shortcuts"), () => app.run("help.keys"), "big"), btn("info", t("Quick tour"), () => app.run("help.tour"), "big")),
          h("button", { class: "btn primary big", onclick: () => app.run("help.tutorial") }, h("span", { class: "si", html: icon("play", 15) }), t("Start the tutorial")))] },
      banner: { cls: "start-banner", bare: true, body: [
        h("span", { class: "si", html: toned("bulb", 17) }),
        h("span", { class: "banner-text" }, t("New to MyArchitecture? The tutorial draws a house with you step by step and ends with a three-storey building of your own.")),
        h("button", { class: "start-btn small", onclick: () => app.run("help.tutorial") }, h("span", { class: "si", html: toned("play", 12) }), h("span", {}, t("Start the tutorial"))),
        h("button", { class: "icon-btn popup-close", title: t("Hide"), "aria-label": t("Hide"), "data-banner-hide": "1", html: icon("close", 14), onclick: () => { this.saveBg({ banner: false }); this.render(); } })] },
      actions: { icon: "command", title: t("Quick start"), body: [
        h("div", { class: "start-actions" }, ...actions.map(([ic, label, desc, fn]) => tile("action-tile", ic, label, desc, fn)))] },
      recent: { icon: "history", title: t("Recent"), extra: recent.length ? h("button", { class: "start-btn small danger", "data-clear-recent": "1", title: t("Clear list"), onclick: () => app.run("file.clearRecent") }, h("span", { class: "si", html: toned("trash", 13) }), h("span", {}, t("Clear list"))) : null,
        body: [recent.length ? h("div", { class: "recent-list" }, ...recent.map((r) => h("div", { class: "recent-item", title: r.path, onclick: () => app.openPath(r.path) },
          h("span", { class: "si", html: toned("file", 16) }), h("span", { class: "rt" }, h("span", { class: "name" }, r.title || r.path.split(/[\\/]/).pop()), h("small", {}, `${r.path.split(/[\\/]/).pop()} · ${new Date(r.at).toLocaleDateString()}`)),
          h("span", { class: "ri-del", title: t("Remove from the list"), "data-remove": r.path, html: icon("close", 13), onclick: (e) => { e.stopPropagation(); app.removeRecent(r.path); } }))))
          : h("div", { class: "start-empty" }, h("span", { class: "si", html: toned("info", 14) }), h("span", {}, t("No recent projects yet. Open a sample or start a new project.")))] },
      templates: { icon: "new", title: t("Start something new"), note: String(START_TILE_COUNT), body: [
        h("div", { class: "template-groups" }, ...START_GROUPS.map((g) => h("section", { class: "template-group start-group", "data-group": g.id },
          h("h3", {}, h("span", { class: "si", html: toned(g.icon, 15) }), h("span", { class: "gt" }, t(g.title)), h("span", { class: "start-count" }, String(g.items.length))),
          h("div", { class: "template-list" }, ...g.items.map(template)))))] },
      theme: { icon: "palette", title: t("Theme"), extra: h("button", { class: "start-btn small", title: t("Themes…"), onclick: () => app.run("view.themes") }, h("span", { class: "si", html: toned("settings", 13) }), h("span", {}, t("Themes…"))),
        body: [h("div", { class: "theme-groups" }, themeGroup("dark", "moon", t("Dark themes")), themeGroup("light", "sun", t("Light themes")))] },
      side: { icon: "image", title: t("Background"), body: [kinds,
        row("zoomIn", t("Speed"), step("speed", 0, 300, 10, (v) => `${v}`), "%"),
        row("eye", t("Transparency"), step("transparency", 0, 100, 5, (v) => `${v}`), "%"),
        row("refresh", t("Shuffle every"), step("shuffleSec", 0, 600, 5, (v) => `${v}`), t("s")),
        h("label", { class: "start-check" }, h("input", { type: "checkbox", checked: !!bg.random, onchange: (e) => this.saveBg({ random: e.target.checked }) }), h("span", {}, t("A random background at each start")))] },
      samples: { icon: "sample", title: t("Samples"), titleCount: true, extra: h("button", { class: "start-btn small", title: t("Browse samples"), onclick: () => app.run("file.samples") }, h("span", { class: "si", html: toned("sample", 13) }), h("span", {}, t("Browse samples"))), body: [samplesGrid] },
    };
  }

  // The theme card follows the current theme (picked here, in the title bar or in Settings).
  refreshThemes() {
    if (!this.board) return;
    const cur = this.app.settings.theme;
    for (const b of this.board.querySelectorAll("[data-theme-pick]")) { const on = b.dataset.themePick === cur; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
  }

  cardElement(id, d) {
    const handle = h("button", { class: "card-handle", type: "button", title: `${t("Move the card")} (Alt+←↑↓→ · Alt+Shift: ${t("Resize the card")})`, "aria-label": t("Move the card"), "data-handle": id, html: MOVE_ICON });
    handle.addEventListener("pointerdown", (e) => this.startMove(e, id));
    handle.addEventListener("keydown", (e) => this.keyMove(e, id));
    const head = d.bare ? h("span", { class: "card-handle-float" }, handle)
      : h("h2", { class: "card-head" }, handle, h("span", { class: "si", html: toned(d.icon, 17) }), h("span", { class: "card-title" }, d.title), h("span", { class: "grow" }), d.note ? h("span", { class: "card-note" }, d.note) : null, d.extra || null);
    const body = h("div", { class: "card-body" }, ...d.body);
    const grip = h("span", { class: "card-resize", title: `${t("Resize the card")} (${t("double-click: fit the contents")})`, "data-resize": id });
    grip.addEventListener("pointerdown", (e) => this.startResize(e, id));
    grip.addEventListener("dblclick", () => this.fitCard(id));
    return h("section", { class: `start-card ${d.cls || id} ${d.bare ? "bare" : ""}`, "data-card": id }, head, body, grip);
  }

  // ---------------------------------------------------------------- layout
  // A layout saved before 바로 가기 and the theme card existed is packed afresh.
  saved() {
    const l = this.bg.layout;
    return cardsOf(l && l.cards && l.cards.actions ? l : null, this.visibleIds(), DEFAULT_SPAN, this.measured);
  }

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
      if (!s) continue;
      const name = ko ? s.titleKo || s.title : s.title;
      tl.querySelector("b").textContent = name;
      tl.title = `${name} — ${tl.querySelector("small").textContent}`;
    }
    // The count sits at the right of the samples card's title, as on 새로 시작.
    const head = this.cards && this.cards.get("samples") && this.cards.get("samples").querySelector(".card-head");
    if (head && !head.querySelector(".card-note")) head.insertBefore(h("span", { class: "card-note" }, String(samples.length)), head.querySelector(".grow").nextSibling);
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

// Every row of a grid full: the column count is the largest one that fits
// the width (at least minW per cell) and divides the number of cells, so the
// last row never has empty cells. Followed on resize and when cells change.
function fullRows(grid, minW, gap) {
  const apply = () => {
    const n = [...grid.children].filter((c) => c.classList.contains("sample-card")).length;
    const w = grid.clientWidth;
    if (!n || !w) return;
    const cols = fullColumns(n, w, minW, gap);
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.dataset.cols = String(cols);
  };
  new ResizeObserver(apply).observe(grid);
  new MutationObserver(apply).observe(grid, { childList: true });
}
