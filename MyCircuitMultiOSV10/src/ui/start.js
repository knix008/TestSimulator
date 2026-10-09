// Start page: quick actions, recent projects and sample cards with live
// schematic thumbnails.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h } from "./widgets.js";
import { loadSampleIndex, loadSampleText } from "./dialogs.js";
import { parseProject } from "../core/project.js";
import { SCH_THEMES, drawSchematic } from "../sch/render.js";
import { schematicBounds } from "../sch/ops.js";
import { registerProjectLibrary } from "../core/project.js";
import { pageView } from "../core/netlist.js";

const TIPS = [
  "Press Ctrl+K anywhere to search every command, part, net and reference.",
  "Drag a part from the library onto the sheet, or press A and type its name.",
  "Wires end automatically when they reach a pin; junction dots are added for you.",
  "Selecting a part in the schematic selects its footprint on the board and in 3D.",
  "In the PCB editor the routing preview turns red before you break a clearance rule.",
  "File → Fabrication outputs writes every Gerber, drill file, BOM and placement file into one ZIP.",
  "Simulation voltages appear right on the schematic wires after an operating-point run.",
  "Right-click anything for the actions that apply to it.",
];

export class StartPage {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.thumbs = new Map();
  }

  async render() {
    const app = this.app;
    const ko = getLanguage() === "ko";
    this.host.innerHTML = "";
    const action = (ic, title, desc, fn) => h("button", { class: "action-card", onclick: fn }, h("span", { class: "ai", html: icon(ic, 18) }), h("div", {}, h("b", {}, title), h("small", {}, desc)));
    const recent = (app.settings.recent || []).slice(0, 8);
    const left = h("div", {},
      h("h2", {}, t("Start")),
      h("div", { class: "start-actions" },
        action("sample", t("Interactive tutorial"), t("Watch every feature being used, step by step"), () => app.run("help.tutorial")),
        action("new", t("New project"), t("Empty schematic and board"), () => app.run("file.new")),
        action("open", t("Open project…"), t("A .mycircuit file from disk"), () => app.run("file.open")),
        action("sample", t("Browse samples"), t("Ready-made circuits to learn from"), () => app.run("file.samples")),
        action("help", t("User manual"), t("Step-by-step guide (F1)"), () => app.run("help.manual")),
        action("keyboard", t("Keyboard shortcuts"), t("Work faster (Ctrl+/)"), () => app.run("help.keys"))),
      recent.length ? h("h2", {}, t("Recent")) : null,
      recent.length ? h("div", { class: "recent-list" }, ...recent.map((r) => h("button", { class: "recent-item", title: r.path, onclick: () => app.openPath(r.path) }, h("span", { html: icon("file", 15) }), h("span", {}, r.title || r.path.split(/[\\/]/).pop()), h("small", {}, new Date(r.at).toLocaleDateString())))) : null,
      h("div", { class: "tip" }, h("b", {}, t("Tip")), " — ", t(TIPS[Math.floor(Date.now() / 86400000) % TIPS.length])));
    const grid = h("div", { class: "sample-grid" });
    const right = h("div", {}, h("h2", {}, t("Samples")), grid);
    // Live 3D board slowly turning behind the start page.
    this.bgHost = h("div", { class: "start-bg" }, h("img", { class: "start-bg-img", src: "assets/art/hero.png", alt: "" }));
    this.host.append(this.bgHost);
    this.startBackground();
    this.host.append(h("div", { class: "start" },
      h("h1", {}, "MyCircuit 10.0"),
      h("p", { class: "lead" }, t("Schematic → PCB → 3D → simulation → manufacturing, in one window.")),
      h("div", { class: "start-grid" }, left, right)));

    const samples = await loadSampleIndex();
    if (!samples.length) grid.append(h("div", { class: "empty-note" }, t("No samples found.")));
    for (const s of samples) {
      const canvas = h("canvas", { width: 460, height: 260 });
      const card = h("button", { class: "sample-card", onclick: () => app.openSample(s.file) }, canvas,
        h("div", { class: "sc-body" }, h("b", {}, ko ? s.titleKo || s.title : s.title), h("small", {}, ko ? s.descriptionKo || s.description : s.description),
          h("div", { class: "tags" }, ...(s.tags || []).slice(0, 5).map((tg) => h("span", {}, tg)))));
      grid.append(card);
      this.thumb(s.file, canvas).then(() => this.queue3d(s.file, canvas));
    }
  }

  // ---------------------------------------------------------------- 3D
  async loadSample(file) {
    let project = this.thumbs.get(file);
    if (!project) {
      project = parseProject(await loadSampleText(file));
      this.thumbs.set(file, project);
      registerProjectLibrary(this.app.store.project);
    }
    return project;
  }

  async startBackground() {
    if (this.app.settings.animations === false) return;
    try {
      const { createViewer } = await import("../view3d/viewer.js");
      const project = await this.loadSample("08-arduino-minimal.mycircuit");
      if (!this.bgHost || !this.bgHost.isConnected) return;
      if (this.bgViewer) { try { this.bgViewer.dispose(); } catch { /* gone */ } }
      registerProjectLibrary(project);
      const th = this.app.currentTheme();
      this.bgViewer = createViewer(this.bgHost, { grid: false, axes: false, shadows: true, background: th.mode === "light" ? { top: "#eef3fa", bottom: "#cfd8e6" } : { top: th.panel, bottom: th.bg } });
      this.bgViewer.setProject(project);
      registerProjectLibrary(this.app.store.project);
      this.bgViewer.setView("iso");
      const { controls } = this.bgViewer.three;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
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

  // Sample cards get a 3D render of their board (one off-screen viewer, one
  // sample at a time, cached for the session).
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
        this.thumbViewer = createViewer(this.thumbHost, { grid: false, axes: false, shadows: true, background: { top: "#2a3446", bottom: "#121722" } });
      }
      while (this.q.length) {
        const [file, canvas] = this.q.shift();
        const project = await this.loadSample(file);
        registerProjectLibrary(project);
        this.thumbViewer.setProject(project);
        registerProjectLibrary(this.app.store.project);
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
      g.setTransform(1, 0, 0, 1, 0, 0); // the schematic thumbnail left its own transform behind
      const k = Math.max(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * k;
      const hh = img.height * k;
      g.drawImage(img, (canvas.width - w) / 2, (canvas.height - hh) / 2, w, hh);
      canvas.classList.add("is3d");
    };
    img.src = url;
  }

  async thumb(file, canvas) {
    try {
      let project = this.thumbs.get(file);
      if (!project) {
        project = parseProject(await loadSampleText(file));
        this.thumbs.set(file, project);
        // parseProject registers the sample's own library; put the open project's back.
        registerProjectLibrary(this.app.store.project);
      }
      registerProjectLibrary(project);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f6f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const b = schematicBounds(pageView(project.schematic));
      if (b) {
        const pad = 200;
        const s = Math.min(canvas.width / (b.x2 - b.x1 + pad * 2), canvas.height / (b.y2 - b.y1 + pad * 2));
        ctx.setTransform(s, 0, 0, s, canvas.width / 2 - ((b.x1 + b.x2) / 2) * s, canvas.height / 2 - ((b.y1 + b.y2) / 2) * s);
        drawSchematic(ctx, project, SCH_THEMES.light, s, { sheet: false });
      }
      registerProjectLibrary(this.app.store.project);
    } catch {
      /* a broken sample just shows an empty card */
    }
  }
}
