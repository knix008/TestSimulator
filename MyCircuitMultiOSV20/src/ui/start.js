// Start page: quick actions, recent projects, sample cards with live
// schematic / 3D thumbnails and a choice of moving backgrounds.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, stepper } from "./widgets.js";
import { START_SCENES, START_SCREEN_DEFAULTS, startScene, startScreenOf, sceneMotion, motionRate } from "./startscenes.js";
import { start2D, preview2D } from "./startbg2d.js";
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

// Off-screen viewer for sample cards and 3D scene tiles.
const THUMB_OPTS = {
  grid: false, axes: false, dimensions: true, gizmo: false, lightMarker: false, shadows: true,
  components: true, silkscreen: true, soldermask: true, copper: true, zones: true, boardBody: true, transparentBoard: false,
  background: { top: "#2a3446", bottom: "#121722" },
};

// Move the camera toward (zoom < 1) or away from its target.
function zoomCamera(viewer, zoom) {
  const { camera, controls } = viewer.three;
  camera.position.sub(controls.target).multiplyScalar(zoom).add(controls.target);
  camera.lookAt(controls.target);
}

export class StartPage {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.thumbs = new Map();
  }

  screen() {
    return startScreenOf(this.app.settings);
  }

  // Background settings: kept in settings.startScreen.
  setScreen(patch) {
    const prev = this.screen();
    const next = { ...prev, ...patch };
    this.app.settings.startScreen = next;
    this.app.saveSettings();
    this.applyVeil();
    if (next.scene !== prev.scene) this.startBackground();
    this.renderScenePanel();
  }

  // Transparency: how much of the moving background shows through the veil.
  applyVeil() {
    if (this.host) this.host.style.setProperty("--start-veil", String(1 - this.screen().transparency / 100));
  }

  // Same layout as MyDCMViewer's start page: a header with the logo, the ways
  // to begin and recent projects on the left, the samples and the background
  // controls on the right.
  async render() {
    const app = this.app;
    const ko = getLanguage() === "ko";
    this.host.innerHTML = "";
    const heading = (ic, text, extra) => h("h2", {}, h("span", { class: "sh-ico", html: icon(ic, 16) }), h("span", {}, text), extra || null);
    const action = (ic, title, desc, fn, primary) => h("button", { class: "action-card", "data-primary": primary ? "" : null, title, onclick: fn },
      h("span", { class: "action-icon", html: icon(ic, 18) }), h("span", { class: "action-text" }, h("b", {}, title), h("small", {}, desc)));
    const recent = (app.settings.recent || []).slice(0, 8);
    const always = h("input", { type: "checkbox", id: "start-always", checked: app.settings.showStartOnLaunch !== false, onchange: (e) => app.setSetting("showStartOnLaunch", e.target.checked) });
    const begin = h("section", { class: "start-group", "data-group": "begin" },
      heading("play", t("Get started")),
      h("div", { class: "start-actions" },
        action("sample", t("Interactive tutorial"), t("Watch every feature being used, step by step"), () => app.run("help.tutorial")),
        action("new", t("New project"), t("Empty schematic and board"), () => app.run("file.new"), true),
        action("open", t("Open project…"), t("A .mycircuit file from disk"), () => app.run("file.open")),
        action("import", t("Import KiCad project…"), t("Schematic and board from KiCad files"), () => app.run("file.importKicad")),
        action("folder", t("Browse samples"), t("Ready-made circuits to learn from"), () => app.run("file.samples")),
        action("help", t("User manual"), t("Step-by-step guide (F1)"), () => app.run("help.manual")),
        action("settings", t("Settings…"), t("Theme, language, units and start-up"), () => app.run("tools.settings")),
        action("keyboard", t("Keyboard shortcuts"), t("Work faster (Ctrl+/)"), () => app.run("help.keys"))),
      h("label", { class: "start-always" }, always, h("span", {}, t("Always show the start page on launch"))));
    const recentGroup = h("section", { class: "start-group", "data-group": "recent" },
      heading("history", t("Recent")),
      recent.length
        ? h("div", { class: "recent-list" }, ...recent.map((r) => h("button", { class: "recent-item", title: r.path, onclick: () => app.openPath(r.path) },
          h("span", { html: icon("file", 15) }), h("span", { class: "recent-name" }, r.title || r.path.split(/[\\/]/).pop()), h("small", {}, new Date(r.at).toLocaleDateString()))))
        : h("p", { class: "start-muted" }, t("No recent projects yet.")),
      h("div", { class: "tip" }, h("span", { class: "tip-ico", html: icon("info", 16) }), h("span", {}, h("b", {}, `${t("Tip")} `), t(TIPS[Math.floor(Date.now() / 86400000) % TIPS.length]))));
    const grid = h("div", { class: "sample-grid" });
    const count = h("small", {});
    const samplesGroup = h("section", { class: "start-group", "data-group": "tasks" }, heading("sample", t("Samples"), count), grid);
    this.sceneHost = h("section", { class: "start-group", "data-group": "scenes" });
    // The moving background behind the page.
    this.bgHost = h("div", { class: "start-bg" }, h("img", { class: "start-bg-img", src: "assets/art/hero.png", alt: "" }));
    this.host.append(this.bgHost);
    this.applyVeil();
    this.startBackground();
    this.host.append(h("div", { class: "start" },
      h("header", { class: "start-head" },
        h("span", { class: "start-logo" }, h("img", { src: "assets/icon.png", alt: "", width: 42, height: 42 })),
        h("div", {}, h("h1", {}, "MyCircuit V1.0"), h("p", {}, t("Schematic → PCB → 3D → simulation → manufacturing, in one window.")))),
      h("div", { class: "start-board" }, h("div", { class: "start-col" }, begin, this.sceneHost, recentGroup), samplesGroup)));
    this.renderScenePanel();

    const samples = await loadSampleIndex();
    count.textContent = samples.length ? t("{n} circuits — click one to open it", { n: samples.length }) : "";
    if (!samples.length) grid.append(h("div", { class: "empty-note" }, t("No samples found.")));
    for (const s of samples) {
      const canvas = h("canvas", { width: 460, height: 260 });
      const title = ko ? s.titleKo || s.title : s.title;
      const desc = ko ? s.descriptionKo || s.description : s.description;
      const card = h("button", { class: "sample-card", title: `${title}\n${desc}`, onclick: () => app.openSample(s.file) }, canvas,
        h("div", { class: "sc-body" }, h("b", {}, title), h("small", {}, desc),
          h("div", { class: "tags" }, ...(s.tags || []).slice(0, 4).map((tg) => h("span", {}, tg)))));
      grid.append(card);
      this.thumb(s.file, canvas).then(() => this.queue3d(s.file, canvas));
    }
  }

  // Background: 20+ scenes, transparency and motion speed (−/+ steppers).
  renderScenePanel() {
    const host = this.sceneHost;
    if (!host || !host.isConnected) return;
    const ko = getLanguage() === "ko";
    const sc = this.screen();
    host.innerHTML = "";
    const pct = (key, label, max, step) => {
      const el = stepper(sc[key], { min: 0, max, step, format: (v) => `${v}%`, onChange: (v) => this.setScreen({ [key]: v }) });
      el.dataset.startSetting = key;
      return h("div", { class: "start-speed" }, h("span", { class: "start-speed-label" }, label), el);
    };
    host.append(
      h("h2", {}, h("span", { class: "sh-ico", html: icon("image", 16) }), h("span", {}, t("Background")), h("small", {}, t("{n} scenes", { n: START_SCENES.length }))),
      h("div", { class: "start-scenes" }, ...START_SCENES.map((s) => h("button", {
        class: `start-scene${s.id === sc.scene ? " on" : ""}`, type: "button", "data-scene": s.id, "aria-pressed": String(s.id === sc.scene), title: s.name[ko ? 0 : 1],
        onclick: () => this.setScreen({ scene: s.id }),
      }, this.sceneTile(s), h("span", {}, s.name[ko ? 0 : 1])))),
      h("div", { class: "start-speeds" },
        pct("transparency", t("Transparency"), 100, 5),
        pct("motion", t("Motion speed"), 100, 10),
        h("button", { class: "start-speed-reset", type: "button", onclick: () => this.setScreen({ ...START_SCREEN_DEFAULTS }) }, t("Reset"))));
  }

  // A tile shows the scene itself: one frame of a 2D scene, an off-screen
  // render of a 3D one (sky colours until it is ready), the picture, or the
  // page colour.
  sceneTile(s) {
    const sw = h("span", { class: "scene-swatch" });
    sw.style.background = s.sky ? `linear-gradient(180deg, ${s.sky[0]}, ${s.sky[1]})` : s.swatch ? s.swatch[0] : s.picture ? "url(assets/art/hero.png) center/cover" : "var(--bg)";
    if (s.picture || s.plain) return sw;
    this.tileCache = this.tileCache || new Map();
    const canvas = h("canvas", { width: 192, height: 108 });
    sw.append(canvas);
    const cached = this.tileCache.get(s.id);
    if (cached) { canvas.getContext("2d").drawImage(cached, 0, 0); return sw; }
    const keep = () => { const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; c.getContext("2d").drawImage(canvas, 0, 0); this.tileCache.set(s.id, c); };
    if (s.kind) {
      (async () => {
        try {
          const project = s.file ? await this.loadSample(s.file) : null;
          if (project) registerProjectLibrary(project);
          preview2D(canvas, s.kind, project);
          keep();
        } catch (e) { console.warn("scene tile", s.id, e); }
        registerProjectLibrary(this.app.store.project);
      })();
    } else {
      this.queue3d(s.file, canvas, s, keep);
    }
    return sw;
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
    const token = (this.bgToken = (this.bgToken || 0) + 1);
    this.stopBackground();
    const host = this.bgHost;
    if (!host) return;
    const scene = startScene(this.screen().scene);
    host.dataset.scene = scene.id;
    const img = host.querySelector(".start-bg-img");
    if (img) { img.style.opacity = scene.picture ? "1" : "0"; img.classList.toggle("full", !!scene.picture); }
    host.classList.toggle("plain", !!scene.plain);
    host.querySelector(".start-bg-glow")?.remove();
    if (img) img.style.transform = "";
    if (this.app.settings.animations === false) return;
    // The picture pans and zooms slowly; the plain backdrop gets a soft glow
    // drifting across it. Both follow the motion speed (still at 0 %).
    if (scene.picture || scene.plain) {
      const glow = scene.plain ? h("div", { class: "start-bg-glow" }) : null;
      if (glow) host.append(glow);
      let last = performance.now();
      let time = 0;
      const loop = (now) => {
        if (token !== this.bgToken || !host.isConnected || this.app.tab !== "start") return;
        time += Math.min(0.1, (now - last) / 1000) * motionRate(this.screen());
        last = now;
        if (img && scene.picture) img.style.transform = `scale(${1.08 + 0.05 * Math.sin(time * 0.13)}) translate(${Math.sin(time * 0.09) * 2.2}%, ${Math.cos(time * 0.07) * 1.6}%)`;
        if (glow) glow.style.transform = `translate(${50 + Math.sin(time * 0.11) * 35}vw, ${40 + Math.cos(time * 0.08) * 28}vh) translate(-50%, -50%)`;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return;
    }
    if (scene.kind) {
      try {
        const project = scene.file ? await this.loadSample(scene.file) : null;
        if (token !== this.bgToken || !host.isConnected) return;
        const bg2d = start2D(host, scene.kind, { project, speed: () => motionRate(this.screen()) });
        this.bg2d = bg2d;
        const watch = () => {
          if (this.bg2d !== bg2d) return;
          if (!host.isConnected || this.app.tab !== "start") { this.stopBackground(); return; }
          setTimeout(watch, 500);
        };
        watch();
      } catch (e) {
        console.warn("start background", e);
      }
      return;
    }
    try {
      const { createViewer } = await import("../view3d/viewer.js");
      const project = await this.loadSample(scene.file);
      if (token !== this.bgToken || !host.isConnected) return;
      registerProjectLibrary(project);
      this.bgViewer = createViewer(host, { grid: false, axes: false, dimensions: false, gizmo: false, lightMarker: false, shadows: true, ...(scene.opts || {}), background: { top: scene.sky[0], bottom: scene.sky[1] } });
      this.bgViewer.setProject(project);
      registerProjectLibrary(this.app.store.project);
      this.bgViewer.setView(scene.view || "iso");
      const { controls } = this.bgViewer.three;
      controls.enableZoom = false;
      controls.enableDamping = false;
      // The camera move starts once the opening view has settled.
      const viewer = this.bgViewer;
      let last = performance.now();
      let time = 0;
      let applied = [0, 0];
      const begin = last + 600;
      let zoomed = !scene.zoom;
      const loop = (now) => {
        if (viewer !== this.bgViewer || !host.isConnected || this.app.tab !== "start") { if (viewer === this.bgViewer) this.stopBackground(); return; }
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (now > begin && !zoomed) { zoomCamera(viewer, scene.zoom); zoomed = true; }
        if (now > begin) {
          const speed = motionRate(this.screen());
          time += dt * speed;
          const m = sceneMotion(scene.motion, time);
          if (m.rate) viewer.orbit(m.rate[0] * dt * speed, m.rate[1] * dt * speed);
          else { viewer.orbit(m.at[0] - applied[0], m.at[1] - applied[1]); applied = m.at; }
        }
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
    if (this.bg2d) { this.bg2d.dispose(); this.bg2d = null; }
  }

  // Sample cards get a 3D render of their board (one off-screen viewer, one
  // sample at a time, cached for the session).
  // A background scene (with its viewer options, sky, view and zoom) can be
  // queued too, for the chooser tiles; done(canvas) runs once it is painted.
  queue3d(file, canvas, scene = null, done = null) {
    this.renders = this.renders || new Map();
    const key = scene ? `scene:${scene.id}` : file;
    if (this.renders.has(key)) { this.paint3d(canvas, this.renders.get(key), done); return; }
    this.q = this.q || [];
    this.q.push([file, canvas, scene, done]);
    if (!this.qBusy) this.drain3d();
  }

  async drain3d() {
    this.qBusy = true;
    try {
      const { createViewer } = await import("../view3d/viewer.js");
      if (!this.thumbHost) {
        this.thumbHost = h("div", { class: "thumb3d-host" });
        document.body.append(this.thumbHost);
        this.thumbViewer = createViewer(this.thumbHost, { ...THUMB_OPTS });
      }
      while (this.q.length) {
        const [file, canvas, scene, done] = this.q.shift();
        const project = await this.loadSample(file);
        // Scene tiles get the look of their scene; sample cards the plain board.
        this.thumbViewer.setOptions({ ...THUMB_OPTS, ...(scene ? scene.opts || {} : {}), background: scene ? { top: scene.sky[0], bottom: scene.sky[1] } : THUMB_OPTS.background });
        registerProjectLibrary(project);
        this.thumbViewer.setProject(project);
        registerProjectLibrary(this.app.store.project);
        this.thumbViewer.setView(scene ? scene.view || "iso" : "iso");
        await new Promise((r) => setTimeout(r, 650));
        if (scene && scene.zoom) { zoomCamera(this.thumbViewer, scene.zoom); await new Promise((r) => setTimeout(r, 120)); }
        const url = this.thumbViewer.screenshot();
        this.renders.set(scene ? `scene:${scene.id}` : file, url);
        this.paint3d(canvas, url, done);
      }
    } catch (e) {
      console.warn("3D thumbnails", e);
    }
    this.qBusy = false;
  }

  paint3d(canvas, url, done = null) {
    const img = new Image();
    img.onload = () => {
      const g = canvas.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); // the schematic thumbnail left its own transform behind
      const k = Math.max(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * k;
      const hh = img.height * k;
      g.drawImage(img, (canvas.width - w) / 2, (canvas.height - hh) / 2, w, hh);
      canvas.classList.add("is3d");
      if (done) done(canvas);
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
