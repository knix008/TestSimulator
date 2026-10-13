// Start page: quick actions, recent projects and sample cards with live plan
// thumbnails (later replaced by a 3D render of each sample).

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h } from "./widgets.js";
import { loadSampleIndex, loadSampleText } from "./dialogs.js";
import { parseProject } from "../core/project.js";
import { PLAN_THEMES, drawPlan, planBounds } from "../plan/render.js";

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

// 3D thumbnails of the samples are kept between runs (per browser profile):
// drawing them takes a second, hidden 3D view — a WebGL context alone costs
// ~0.3 s of a frozen app — and they only change with the app or the sample.
const THUMBS_KEY = "myarch.thumbs3d";
const hashText = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0).toString(36); };

export class StartPage {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.cache = new Map();
    this.hashes = new Map(); // sample file → hash of its text (the thumbnail cache key)
  }

  async render() {
    const app = this.app;
    const ko = getLanguage() === "ko";
    this.host.innerHTML = "";
    const action = (ic, title, desc, fn) => h("button", { class: "action-card", onclick: fn }, h("span", { class: "ai", html: icon(ic, 18) }), h("div", {}, h("b", {}, title), h("small", {}, desc)));
    const recent = (app.settings.recent || []).slice(0, +app.settings.recentLimit || 10);
    const left = h("div", {},
      h("h2", {}, t("Start")),
      h("div", { class: "start-actions" },
        action("sample", t("Interactive tutorial"), t("Every feature shown step by step, or practise it yourself"), () => app.run("help.tutorial")),
        action("new", t("New project"), t("An empty floor plan"), () => app.run("file.new")),
        action("open", t("Open project…"), t("A .myarch file from disk"), () => app.run("file.open")),
        action("import", t("Import…"), t("DXF, IFC, SVG, 3D models, images"), () => app.run("file.import")),
        action("sample", t("Browse samples"), t("Ready-made houses and apartments"), () => app.run("file.samples")),
        action("help", t("User manual"), t("Step-by-step guide (F1)"), () => app.run("help.manual")),
        action("keyboard", t("Keyboard shortcuts"), t("Work faster (Ctrl+/)"), () => app.run("help.keys"))),
      recent.length ? h("h2", { class: "recent-head" }, t("Recent"), h("button", { class: "btn small", "data-clear-recent": "1", onclick: () => app.run("file.clearRecent") }, t("Clear list"))) : null,
      recent.length ? h("div", { class: "recent-list" }, ...recent.map((r) => h("div", { class: "recent-item", title: r.path, onclick: () => app.openPath(r.path) }, h("span", { html: icon("file", 15) }), h("span", {}, r.title || r.path.split(/[\\/]/).pop()), h("small", {}, new Date(r.at).toLocaleDateString()),
        h("span", { class: "ri-del", title: t("Remove from the list"), "data-remove": r.path, html: icon("close", 13), onclick: (e) => { e.stopPropagation(); app.removeRecent(r.path); } })))) : null,
      h("div", { class: "tip" }, h("b", {}, t("Tip")), " — ", t(TIPS[Math.floor(Date.now() / 86400000) % TIPS.length])));
    const grid = h("div", { class: "sample-grid" });
    const right = h("div", {}, h("h2", {}, t("Samples")), grid);
    // The background view is kept when the page is drawn again (theme,
    // language, recent list …): a new one costs a WebGL context and a sky.
    if (!this.bgHost) this.bgHost = h("div", { class: "start-bg" }, h("img", { class: "start-bg-img", src: "assets/art/hero.png", alt: "" }));
    this.host.append(this.bgHost);
    // After the page is on screen: a WebGL context and a model build would hold it up.
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(() => this.startBackground(), { timeout: 1500 });
    this.host.append(h("div", { class: "start" },
      h("h1", {}, "MyArchitecture 10.0"),
      h("p", { class: "lead" }, t("Floor plan → 3D → drawings, BIM and CAD exchange, in one window.")),
      h("div", { class: "start-grid" }, left, right)));
    const samples = await loadSampleIndex();
    if (!samples.length) grid.append(h("div", { class: "empty-note" }, t("No samples found.")));
    for (const s of samples) {
      const canvas = h("canvas", { width: 460, height: 260 });
      grid.append(h("button", { class: "sample-card", onclick: () => app.openSample(s.file) }, canvas,
        h("div", { class: "sc-body" }, h("b", {}, ko ? s.titleKo || s.title : s.title), h("small", {}, ko ? s.descriptionKo || s.description : s.description),
          h("div", { class: "tags" }, ...(s.tags || []).slice(0, 5).map((tg) => h("span", {}, tg))))));
      this.thumb(s.file, canvas).then(() => this.queue3d(s.file, canvas));
    }
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

  async startBackground() {
    if (this.app.settings.animations === false) { this.stopBackground(); return; }
    if (this.bgViewer) { this.bgViewer.setOptions({ background: this.bgColors() }); return; } // the theme may have changed
    if (this.bgStarting) return;
    this.bgStarting = true;
    try {
      const samples = await loadSampleIndex();
      const first = samples.find((s) => s.hero) || samples[0];
      if (!first) return;
      const { createViewer } = await import("../view3d/viewer.js");
      const project = await this.load(first.file);
      if (!this.bgHost || !this.bgHost.isConnected || this.app.tab !== "start") return;
      this.stopBackground();
      this.bgViewer = createViewer(this.bgHost, { grid: false, gizmo: false, shadows: true, background: this.bgColors() });
      this.bgViewer.setProject(project);
      this.bgViewer.setView("bird");
      const v = this.bgViewer;
      const { controls } = v.three;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.enableZoom = false;
      // The still picture stays until the view has drawn its first frame.
      v.ready().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const img = this.bgViewer === v && this.bgHost.querySelector(".start-bg-img");
        if (img) img.style.opacity = "0";
      })));
      const loop = () => {
        if (this.bgViewer !== v) return; // stopped, or another view took over
        if (!this.bgHost.isConnected || this.app.tab !== "start") { this.stopBackground(); return; }
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
    if (!this.saved) {
      try { this.saved = JSON.parse(localStorage.getItem(THUMBS_KEY) || "{}") || {}; } catch { this.saved = {}; }
    }
    return this.saved;
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
