// Document tabs: one tab per open drawing in a strip under the tool bar.
//
//   [ tab ][ tab ][ tab ] …  (scrolls sideways)       [+] [<] [>] [▾]
//
// The tab model lives in docs.js (DocumentSet); this file draws the strip and
// does what the app must around a switch: park the leaving tab's view (view tab,
// plan level / zoom / pan, 3D camera, model-check results) and bring back the
// arriving tab's, then refresh panels, tool bars and the 3D model (the one 3D
// viewer is reused — only its model is resynced).
//
// The strip never pushes the window wider: the tabs scroll inside it, and the
// "<" / ">" buttons at its right end scroll them a tab at a time (disabled at
// either end); "▾" lists every open drawing.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, contextMenu, toast } from "./widgets.js";
import { DocumentSet } from "./docs.js";

export class DocTabs {
  constructor(app, host) {
    this.app = app;
    this.docs = new DocumentSet(app.store);
    this.host = host;
    this.els = new Map(); // doc id → tab element
    this.build();
  }

  // ---------------------------------------------------------------- strip
  build() {
    const host = this.host;
    host.innerHTML = "";
    this.scroller = h("div", { class: "doctabs-scroll", role: "tablist" });
    this.btnNew = h("button", { class: "icon-btn doctabs-btn", "data-act": "new", html: icon("plus", 15), onclick: () => this.app.run("file.new") });
    this.btnPrev = h("button", { class: "icon-btn doctabs-btn", "data-act": "prev", html: icon("chevronLeft", 15), onclick: () => this.scrollStep(-1) });
    this.btnNext = h("button", { class: "icon-btn doctabs-btn", "data-act": "next", html: icon("chevronRight", 15), onclick: () => this.scrollStep(1) });
    this.btnList = h("button", { class: "icon-btn doctabs-btn", "data-act": "list", html: icon("chevronDown", 15), onclick: (e) => this.showList(e.currentTarget) });
    host.append(this.scroller, h("div", { class: "doctabs-nav" }, this.btnNew, this.btnPrev, this.btnNext, this.btnList));
    this.scroller.addEventListener("scroll", () => this.updateNav());
    // A mouse wheel over the strip scrolls it sideways.
    this.scroller.addEventListener("wheel", (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      this.scroller.scrollLeft += d;
    }, { passive: false });
    // When the centre column changes width (panels shown or hidden, window
    // resized) the active tab stays in view.
    if (window.ResizeObserver) new ResizeObserver(() => this.reveal()).observe(this.scroller);
  }

  label(info) { return info.fileName || info.title || t("Untitled"); }

  tooltip(info) {
    const lines = [];
    if (info.title && info.title !== info.fileName) lines.push(info.title);
    lines.push(info.filePath || info.fileName || t("Untitled"));
    if (!info.filePath) lines.push(t("Not saved to a file yet"));
    if (info.dirty) lines.push(t("Unsaved changes"));
    return lines.join("\n");
  }

  // Keyed update: tabs are reused, so the strip keeps its scroll position.
  render() {
    const list = this.docs.list();
    const seen = new Set();
    let prev = null, activeRenamed = false;
    for (const info of list) {
      seen.add(info.id);
      let el = this.els.get(info.id);
      if (!el) { el = this.makeTab(info.id); this.els.set(info.id, el); }
      const name = this.label(info);
      el.classList.toggle("on", info.active);
      el.classList.toggle("dirty", info.dirty);
      el.setAttribute("aria-selected", info.active ? "true" : "false");
      el.title = this.tooltip(info);
      if (el._name.textContent !== name) { el._name.textContent = name; if (info.active) activeRenamed = true; }
      el._close.title = `${t("Close tab")}  (Ctrl+W)`;
      const want = prev ? prev.nextSibling : this.scroller.firstChild;
      if (want !== el) this.scroller.insertBefore(el, want);
      prev = el;
    }
    for (const [id, el] of this.els) if (!seen.has(id)) { el.remove(); this.els.delete(id); }
    this.btnNew.title = `${t("New project")}  (Ctrl+N)`;
    this.btnPrev.title = t("Scroll the tabs left");
    this.btnNext.title = t("Scroll the tabs right");
    this.btnList.title = t("All open drawings");
    // A newly active tab (opened, switched to, renamed — so wider) is scrolled into view.
    if (this.shownActive !== this.docs.activeId || activeRenamed) { this.shownActive = this.docs.activeId; this.reveal(); }
    else this.updateNav();
  }

  makeTab(id) {
    const name = h("span", { class: "doctab-name" });
    const close = h("button", { class: "doctab-close", tabindex: "-1", html: icon("close", 12) });
    const el = h("div", { class: "doctab", role: "tab", "data-doc": id },
      h("span", { class: "doctab-ico", html: icon("floorplan", 14) }), name, h("span", { class: "doctab-dirty", "aria-hidden": "true" }, "●"), close);
    el._name = name;
    el._close = close;
    close.addEventListener("pointerdown", (e) => e.stopPropagation());
    close.addEventListener("click", (e) => { e.stopPropagation(); this.close(id); });
    el.addEventListener("pointerdown", (e) => this.pointerDown(e, id, el));
    // Middle click closes (and must not start the browser's auto-scroll).
    el.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); this.close(id); } });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); this.tabMenu(id, e.clientX, e.clientY); });
    return el;
  }

  // Press activates; dragging sideways reorders.
  pointerDown(e, id, el) {
    if (e.button !== 0) return;
    this.activate(id);
    const x0 = e.clientX;
    let dragging = false;
    const move = (ev) => {
      if (!dragging && Math.abs(ev.clientX - x0) < 6) return;
      if (!dragging) { dragging = true; el.classList.add("dragging"); try { el.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      const tabs = [...this.scroller.children];
      let to = tabs.length; // past the last tab
      for (let i = 0; i < tabs.length; i++) {
        const r = tabs[i].getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) { to = i; break; }
      }
      const from = this.docs.indexOf(id);
      if (to > from) to--; // the dragged tab leaves its old place first
      if (to !== from) { this.docs.move(id, to); this.render(); }
      // Keep the strip following the pointer near its ends.
      const sr = this.scroller.getBoundingClientRect();
      if (ev.clientX < sr.left + 20) this.scroller.scrollLeft -= 12;
      else if (ev.clientX > sr.right - 20) this.scroller.scrollLeft += 12;
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("blur", up);
      el.classList.remove("dragging");
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("blur", up);
  }

  tabMenu(id, x, y) {
    const i = this.docs.indexOf(id);
    contextMenu([
      { label: t("Close tab"), icon: "close", shortcut: "Ctrl+W", action: () => this.close(id) },
      { label: t("Close other tabs"), disabled: this.docs.count < 2, action: () => this.closeMany(this.docs.docs.filter((d) => d.id !== id).map((d) => d.id)) },
      { label: t("Close tabs to the right"), disabled: i >= this.docs.count - 1, action: () => this.closeMany(this.docs.docs.slice(i + 1).map((d) => d.id)) },
    ], x, y);
  }

  showList(anchor) {
    const r = anchor.getBoundingClientRect();
    const items = this.docs.list().map((info) => ({ label: `${this.label(info)}${info.dirty ? "  ●" : ""}`, checked: info.active, action: () => this.activate(info.id) }));
    const menu = contextMenu(items, r.right - 240, r.bottom + 2);
    menu.classList.add("doctabs-list");
    const mr = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(6, Math.min(r.right - mr.width, window.innerWidth - mr.width - 6))}px`;
  }

  // ---------------------------------------------------------------- scrolling
  canScroll() {
    const s = this.scroller;
    return { left: s.scrollLeft > 0.5, right: s.scrollLeft + s.clientWidth < s.scrollWidth - 0.5 };
  }

  updateNav() {
    const c = this.canScroll();
    this.btnPrev.disabled = !c.left;
    this.btnNext.disabled = !c.right;
    this.host.classList.toggle("overflow", c.left || c.right);
  }

  // Bring the next tab that is (partly) hidden on that side fully into view.
  scrollStep(dir) {
    const s = this.scroller;
    const tabs = [...s.children];
    const left = s.scrollLeft, right = left + s.clientWidth;
    let target = null;
    if (dir < 0) {
      for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].offsetLeft < left - 0.5) { target = tabs[i].offsetLeft; break; }
      if (target === null) target = 0;
    } else {
      for (const el of tabs) if (el.offsetLeft + el.offsetWidth > right + 0.5) { target = el.offsetLeft + el.offsetWidth - s.clientWidth; break; }
      if (target === null) target = s.scrollWidth;
    }
    s.scrollLeft = Math.max(0, Math.min(s.scrollWidth - s.clientWidth, target));
    this.updateNav();
  }

  reveal(id = this.docs.activeId) {
    const el = this.els.get(id);
    if (!el) return;
    const s = this.scroller;
    if (el.offsetLeft < s.scrollLeft) s.scrollLeft = el.offsetLeft;
    else if (el.offsetLeft + el.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollLeft = el.offsetLeft + el.offsetWidth - s.clientWidth;
    this.updateNav();
  }

  // ---------------------------------------------------------------- view state
  saveView(doc = this.docs.active) {
    const app = this.app, plan = app.plan, v3d = app.v3d;
    doc.view = {
      tab: app.tab,
      levelId: plan.levelId, fitted: plan.fitted, scale: plan.vp.scale, ox: plan.vp.ox, oy: plan.vp.oy,
      framed: !!v3d.framed, camera: v3d.viewer && v3d.framed ? v3d.viewer.getCamera() : null,
      hiddenLevels: new Set(v3d.hiddenLevels),
      checkIssues: app.checkIssues,
    };
  }

  // Fresh view for a document about to be loaded into a new tab.
  resetView() {
    const app = this.app, plan = app.plan, v3d = app.v3d;
    plan.sel = new Set(); plan.hover = null; plan.measure = null; plan.box = null;
    plan.fitted = false; plan.levelId = null;
    v3d.framed = false; v3d.pendingCamera = null; v3d.highlighted = []; v3d.hiddenLevels.clear();
    if (v3d.viewer && v3d.viewer.clearMeasures) v3d.viewer.clearMeasures();
    app.checkIssues = [];
  }

  restoreView(doc) {
    const app = this.app, plan = app.plan, v3d = app.v3d, v = doc.view || {};
    this.resetView();
    plan.levelId = v.levelId || null;
    if (v.fitted) { plan.fitted = true; plan.vp.scale = v.scale; plan.vp.ox = v.ox; plan.vp.oy = v.oy; }
    for (const id of v.hiddenLevels || []) v3d.hiddenLevels.add(id);
    v3d.framed = !!v.framed;
    v3d.pendingCamera = v.camera || null;
    app.checkIssues = v.checkIssues || [];
    if (v3d.viewer) v3d.viewer.setOptions({ levels: v3d.levelSet() });
    v3d.markDirty();
  }

  // ---------------------------------------------------------------- switching
  // Leave nothing half-done in the tab being left (a wall chain, a drag).
  settle() {
    const app = this.app;
    if (app.tab === "plan") app.plan.finishChain();
    if (app.store.pending) app.store.commit();
    if (app.v3d && app.tab === "3d") app.v3d.deactivate();
  }

  activate(id) {
    const app = this.app;
    if (id === this.docs.activeId || !this.docs.byId(id)) { this.reveal(id); return; }
    this.settle();
    this.saveView();
    const doc = this.docs.switchTo(id);
    this.restoreView(doc);
    app.plan.selectionChanged();
    app.plan.renderLevelBar();
    // The plan / 3D view stays as it is; from the start page the tab returns
    // to the view it was left in.
    const tab = app.tab === "plan" || app.tab === "3d" ? app.tab : (doc.view && doc.view.tab) || (this.docs.isUntouched(doc) ? "start" : "plan");
    app.tab = null; // re-enter the view so it re-fits / re-syncs for this document
    app.setTab(tab);
    app.updateTitle();
    app.updateUndoButtons();
    app.scheduleChecks();
    this.render();
    this.reveal(id);
  }

  step(dir) { if (this.docs.count > 1) this.activate(this.docs.neighbour(dir).id); }

  // Before a drawing is opened: reuse the active tab when it is an untouched
  // "Untitled" (or the tutorial's own tab while the tutorial runs), otherwise
  // open a new tab. The caller then loads the project into the store.
  prepareNew() {
    const app = this.app, doc = this.docs.active;
    const tutorial = doc.tutorial && app.tutorial && app.tutorial.panel && app.tutorial.panel.style.display !== "none";
    if (this.docs.isUntouched(doc) || tutorial) { this.settle(); this.resetView(); return doc; }
    this.settle();
    this.saveView();
    const fresh = this.docs.add();
    this.resetView();
    this.render();
    return fresh;
  }

  // The tutorial works in a tab of its own: the one it used before, the
  // active tab when that is an untouched "Untitled", or a new one.
  tutorialTab() {
    const own = this.docs.docs.find((d) => d.tutorial);
    if (own) { this.activate(own.id); return own; }
    const doc = this.docs.isUntouched() ? this.docs.active : this.prepareNew();
    doc.tutorial = true;
    this.app.store.load(this.app.store.project); // let every view pick up the blank tab
    return doc;
  }

  // A drawing that is already open in a tab (same file path) is switched to.
  focusPath(path) {
    const doc = this.docs.findByPath(path);
    if (!doc) return false;
    this.activate(doc.id);
    return true;
  }

  // ---------------------------------------------------------------- closing
  async close(id = this.docs.activeId) {
    const app = this.app;
    const doc = this.docs.byId(id);
    if (!doc) return false;
    if (this.docs.stateOf(doc).dirty) {
      this.activate(id);
      if (!(await app.confirmDiscard())) return false;
    }
    if (id === this.docs.activeId) {
      this.settle();
      const wasLast = this.docs.count === 1;
      const i = this.docs.indexOf(id);
      if (wasLast) {
        this.docs.remove(id);
        this.resetView();
        app.store.load(app.store.project); // fresh blank tab: let every view pick it up
        app.store.fileName = null;
        app.setTab("start");
      } else {
        const next = this.docs.docs[i + 1] || this.docs.docs[i - 1];
        this.activate(next.id);
        this.docs.docs.splice(this.docs.indexOf(id), 1);
      }
    } else this.docs.docs.splice(this.docs.indexOf(id), 1);
    this.render();
    this.reveal();
    return true;
  }

  async closeMany(ids) {
    for (const id of ids) if (!(await this.close(id))) return false;
    return true;
  }

  // Window close: every tab with unsaved changes is shown and asked about.
  async confirmAll() {
    const app = this.app;
    for (const doc of this.docs.dirtyDocs()) {
      if (!this.docs.byId(doc.id) || !this.docs.stateOf(doc).dirty) continue;
      this.activate(doc.id);
      if (!(await app.confirmDiscard())) return false;
    }
    return true;
  }

  anyDirty() { return this.docs.dirtyDocs().length > 0; }

  // ---------------------------------------------------------------- autosave
  // Every tab with unsaved changes, for crash recovery.
  autosaveData() {
    const app = this.app;
    const docs = this.docs.dirtyDocs().map((d) => {
      const s = this.docs.stateOf(d);
      return { fileName: s.fileName, filePath: s.filePath, project: s.project, active: d.id === this.docs.activeId };
    });
    if (!docs.length) return null;
    void app;
    return { docs };
  }

  // Restore recovered documents (new format {docs:[…]} or the old single one).
  restore(data) {
    const app = this.app;
    const list = Array.isArray(data.docs) ? data.docs : [data];
    let n = 0;
    for (const d of list) {
      if (!d || !d.project) continue;
      this.prepareNew();
      app.store.load(d.project, { fileName: d.fileName || null, filePath: d.filePath || null });
      app.store.dirty = true;
      n++;
    }
    if (n) { app.updateTitle(); app.setTab("plan"); if (n > 1) toast(t("{n} drawings were recovered, each in its own tab.", { n }), "ok", 4000); }
    this.render();
    return n;
  }
}
