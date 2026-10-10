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

export class StartPage {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.cache = new Map();
  }

  async render() {
    const app = this.app;
    const ko = getLanguage() === "ko";
    this.host.innerHTML = "";
    const action = (ic, title, desc, fn) => h("button", { class: "action-card", onclick: fn }, h("span", { class: "ai", html: icon(ic, 18) }), h("div", {}, h("b", {}, title), h("small", {}, desc)));
    const recent = (app.settings.recent || []).slice(0, 10);
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
    this.bgHost = h("div", { class: "start-bg" }, h("img", { class: "start-bg-img", src: "assets/art/hero.png", alt: "" }));
    this.host.append(this.bgHost);
    this.startBackground();
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
    if (!this.cache.has(file)) this.cache.set(file, parseProject(await loadSampleText(file)));
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
  async startBackground() {
    if (this.app.settings.animations === false) return;
    try {
      const samples = await loadSampleIndex();
      const first = samples.find((s) => s.hero) || samples[0];
      if (!first) return;
      const { createViewer } = await import("../view3d/viewer.js");
      const project = await this.load(first.file);
      if (!this.bgHost || !this.bgHost.isConnected) return;
      this.stopBackground();
      const th = this.app.currentTheme();
      this.bgViewer = createViewer(this.bgHost, { grid: false, gizmo: false, shadows: true, background: th.mode === "light" ? { top: "#c9dbee", bottom: "#eef1f4" } : { top: th.panel, bottom: th.bg } });
      this.bgViewer.setProject(project);
      this.bgViewer.setView("bird");
      const { controls } = this.bgViewer.three;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.enableZoom = false;
      const img = this.bgHost.querySelector(".start-bg-img");
      if (img) img.style.opacity = "0";
      const loop = () => {
        if (!this.bgViewer || !this.bgHost.isConnected || this.app.tab !== "start") { this.stopBackground(); return; }
        controls.update();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      console.warn("start background", e);
    }
  }

  stopBackground() {
    if (this.bgViewer) { try { this.bgViewer.dispose(); } catch { /* gone */ } }
    this.bgViewer = null;
  }

  queue3d(file, canvas) {
    this.renders = this.renders || new Map();
    if (this.renders.has(file)) { this.paint3d(canvas, this.renders.get(file)); return; }
    this.q = this.q || [];
    this.q.push([file, canvas]);
    if (!this.qBusy) this.drain3d();
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
      while (this.q.length) {
        const [file, canvas] = this.q.shift();
        const project = await this.load(file);
        this.thumbViewer.setProject(project);
        this.thumbViewer.setView("iso");
        await new Promise((r) => setTimeout(r, 650));
        const url = this.thumbViewer.screenshot();
        this.renders.set(file, url);
        this.paint3d(canvas, url);
      }
    } catch (e) {
      console.warn("3D thumbnails", e);
    }
    this.qBusy = false;
  }

  paint3d(canvas, url) {
    const img = new Image();
    img.onload = () => {
      const g = canvas.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0);
      const k = Math.max(canvas.width / img.width, canvas.height / img.height);
      g.drawImage(img, (canvas.width - img.width * k) / 2, (canvas.height - img.height * k) / 2, img.width * k, img.height * k);
      canvas.classList.add("is3d");
    };
    img.src = url;
  }
}
