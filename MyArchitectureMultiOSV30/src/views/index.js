// Project documentation (views, sheets, schedules, annotation) wired into the
// application: commands, the Project Browser, the "Views & sheets" tab, the
// plan editor extension, tool bar buttons, the inspector and status bar, and
// printing / publishing through the print window.
//
// app.views = install(app) — called once from App.init after the built-in
// commands are registered.

import { t } from "../ui/i18n.js";
import { icon } from "../ui/icons.js";
import { h, contextMenu, toast, confirmDialog, promptDialog } from "../ui/widgets.js";
import * as platform from "../ui/platform.js";
import { uid } from "../core/geom.js";
import { findItem, levelById } from "../core/project.js";
import { roomLabelPoint } from "../core/rooms.js";
import { bounds as ptsBounds } from "../core/geom.js";
import { modelExtent } from "../view3d/build.js";
import * as ops from "../plan/ops.js";
import { viewById, sheetById, ensureView, allViews, newView, newSheet, planViewId, ceilingViewId, annotationsOf, newAnnotation, sheetLayout, DEFAULT_3D, effectiveView } from "./model.js";
import { viewSpec, viewExtent, ensureGen, cachedGen } from "./viewdraw.js";
import { sheetSvg, prepareSheet, placeFree, viewportRects } from "./sheets.js";
import { defaultSchedule, scheduleCSV, tableSize } from "./schedules.js";
import { ViewsTab, kindIcon } from "./viewtab.js";
import { PlanExt, VIEW_TOOLS, makeSection, makeElevation } from "./planext.js";
import { TOOL_DEFS, TOOL_IDS } from "./tools.js";
import { renderBrowser } from "./browser.js";
import * as D from "./vdialogs.js";
import { viewDxf, sheetDxf } from "./dxfview.js";
import { sheetPlanTheme } from "./sheets.js";
import { displayName } from "./names.js";

const DIM_GROUP = ["dim", "dimlin", "chain", "angle", "radius", "arclen", "spot"];
const TEXT_GROUP = ["note", "tag", "keynote"];
const DETAIL_GROUP = ["line", "region", "mask", "cloud", "symbol"];
const base = (app) => (app.store.project.meta.title || "project").replace(/[\\/:*?"<>|\s]+/g, "_");

// Every command label, for the Korean check (test/unit/views.test.mjs).
export const COMMAND_LABELS = [];

export function install(app) {
  const viewsTab = new ViewsTab(app, document.getElementById("view-views"));
  const ext = new PlanExt(app);
  app.plan.ext = ext;
  const lastTool = { dim: "dim", text: "note", detail: "line" };
  const api = {
    tab: viewsTab, ext, displayName,
    currentId: () => (app.tab === "views" ? viewsTab.current : app.tab === "plan" ? ext.viewId() : DEFAULT_3D),

    // ---------------------------------------------------------------- open
    open(id) {
      const p = app.store.project;
      if (sheetById(p, id)) { app.setTab("views"); viewsTab.show(id); afterOpen(); return true; }
      const v = viewById(p, id);
      if (!v) return false;
      if (v.kind === "plan") {
        app.setTab("plan");
        if (app.plan.level !== v.level) app.plan.setLevel(v.level);
        ext.viewOverride = id;
        app.plan.request();
        afterOpen();
        return true;
      }
      if (v.kind === "3d") {
        app.setTab("3d");
        const sc = (p.scenes || []).find((s) => s.id === id);
        if (sc) app.v3d.ensure().then(() => app.v3d.goScene(sc));
        afterOpen();
        return true;
      }
      app.setTab("views");
      viewsTab.show(id);
      afterOpen();
      return true;
    },

    // ---------------------------------------------------------------- menus
    viewMenuItems(v) {
      const p = app.store.project;
      const items = [{ label: t("Open"), icon: kindIcon(v.kind), action: () => api.open(v.id) }];
      if (v.kind !== "3d") items.push({ label: t("View properties…"), icon: "settings", action: () => api.viewProperties(v.id) });
      if (v.kind !== "3d" && v.kind !== "schedule") items.push({ label: t("Visibility / graphics…"), icon: "layers", action: () => D.visibilityDialog(app, v.id) });
      if (v.kind === "section") items.push({ label: t("Flip the look direction"), icon: "flip", action: () => app.store.edit(t("Flip section"), (pr) => { const sv = ensureView(pr, v.id); sv.flip = !sv.flip; }) });
      const sheet = viewsTab.isSheet() ? sheetById(p, viewsTab.current) : null;
      if (sheet) items.push({ label: t("Place on sheet {n}", { n: sheet.number }), icon: "sheet", action: () => api.placeOnSheet(sheet.id, v.id) });
      items.push({ label: t("Place on a new sheet"), icon: "sheet", action: () => api.newSheetWith(v.id) });
      if (v.kind !== "3d") {
        items.push({ label: t("Rename…"), icon: "text", action: async () => { const n = await promptDialog(t("View name"), v.name, { title: t("Rename view") }); if (n && n.trim()) app.store.edit(t("Rename view"), (pr) => { ensureView(pr, v.id).name = n.trim(); }); } });
        items.push({ label: t("Duplicate view"), icon: "copy", action: () => api.duplicateView(v.id) });
        if (v.kind !== "plan" && v.kind !== "ceiling") items.push({ label: t("Export DXF of the view…"), icon: "dxf", action: () => api.exportDxf(v.id) });
        if (!v.implicit && !(v.kind === "plan" && v.id === planViewId(v.level)) && !(v.kind === "ceiling" && v.id === ceilingViewId(v.level))) items.push("-", { label: t("Delete view"), icon: "trash", danger: true, action: () => api.deleteView(v.id) });
      }
      return items;
    },
    sheetMenuItems(s) {
      return [
        { label: t("Open"), icon: "sheet", action: () => api.open(s.id) },
        { label: t("Sheet properties…"), icon: "settings", action: () => api.sheetProperties(s.id) },
        { label: t("Place view…"), icon: "plus", action: () => { api.open(s.id); app.run("views.placeView"); } },
        { label: t("Print / publish…"), icon: "print", action: () => D.publishDialog(app) },
        { label: t("Export DXF of the sheet…"), icon: "dxf", action: () => api.exportDxf(s.id) },
        { label: t("Duplicate sheet"), icon: "copy", action: () => app.store.edit(t("Duplicate sheet"), (p) => { const n = { ...JSON.parse(JSON.stringify(s)), id: uid("sh"), number: newSheet(p).number, name: `${s.name} (2)`, viewports: (s.viewports || []).filter((vp) => { const v = viewById(p, vp.view); return v && (v.kind === "schedule" || v.kind === "legend"); }).map((vp) => ({ ...vp, id: uid("vp") })) }; p.sheets.push(n); }) },
        "-", { label: t("Delete sheet"), icon: "trash", danger: true, action: async () => { if (await confirmDialog(t("Delete sheet {n}? The views stay in the project.", { n: s.number }), { danger: true, ok: t("Delete") })) app.store.edit(t("Delete sheet"), (p) => { p.sheets = p.sheets.filter((x) => x.id !== s.id); p.annotations = p.annotations.filter((a) => a.view !== s.id); for (const ps of p.publishSets) ps.sheets = ps.sheets.filter((x) => x !== s.id); }); } },
      ];
    },

    // ---------------------------------------------------------------- dialogs
    viewProperties: (id) => (viewById(app.store.project, id) || {}).kind === "schedule" ? D.scheduleProperties(app, id) : D.viewProperties(app, id),
    sheetProperties: (id) => D.sheetProperties(app, id),
    annotationProperties: (a) => D.annotationProperties(app, a),
    scheduleProperties: (id) => D.scheduleProperties(app, id),
    templatesDialog: (id) => D.templatesDialog(app, id),
    revisionsDialog: () => D.revisionsDialog(app),
    publishDialog: (id) => D.publishDialog(app, id),

    contentExtent: (id) => viewExtent(app.store.project, viewById(app.store.project, id), null, app.store.revision),

    // ---------------------------------------------------------------- editing
    deleteIds(ids, contextId = null) {
      const p = app.store.project;
      const sheet = contextId ? sheetById(p, contextId) : null;
      app.store.edit(t("Delete"), (pr) => {
        pr.annotations = pr.annotations.filter((a) => !ids.has(a.id));
        if (sheet) { const s = sheetById(pr, sheet.id); s.viewports = s.viewports.filter((vp) => !ids.has(vp.id)); }
        const views = [...ids].filter((id) => (pr.views || []).some((v) => v.id === id));
        if (views.length) removeViews(pr, new Set(views));
      });
      app.renderLeft();
    },
    deleteView(id) { app.store.edit(t("Delete view"), (p) => { removeViews(p, new Set([id])); }); viewsTab.close(id); app.renderLeft(); },
    duplicateView(id) {
      const p = app.store.project;
      const v = viewById(p, id);
      if (!v) return;
      const n = { ...JSON.parse(JSON.stringify(v)), id: uid("v"), name: `${v.name} (copy)` };
      delete n.implicit;
      app.store.edit(t("Duplicate view"), (pr) => {
        pr.views.push(n);
        for (const a of annotationsOf(pr, id).filter((x) => x.kind !== "tag")) pr.annotations.push({ ...JSON.parse(JSON.stringify(a)), id: uid("an"), view: n.id });
      });
      app.renderLeft();
      api.open(n.id);
    },
    placeOnSheet(sheetId, viewId, at = null) {
      const p = app.store.project;
      const s = sheetById(p, sheetId);
      const v = viewById(p, viewId);
      if (!s || !v) return;
      if (v.kind !== "schedule" && v.kind !== "legend") {
        const other = (p.sheets || []).find((x) => (x.viewports || []).some((vp) => vp.view === viewId));
        if (other) { toast(t("{name} is already on sheet {n}. A view goes on one sheet only (duplicate it for another).", { name: displayName(v.name), n: other.number }), "warn", 5000); return; }
      }
      const spec = v.kind !== "schedule" ? viewSpec(p, v) : null;
      const doPlace = () => {
        let w = 100, hgt = 70;
        if (v.kind === "schedule") { const sz = tableSize(p, v, t); w = sz.w; hgt = sz.h; }
        else if (spec) { const e = viewExtent(app.store.project, v, null, app.store.revision); w = (e.x2 - e.x1) / spec.scale; hgt = (e.y2 - e.y1) / spec.scale; }
        const c = at || placeFree(app.store.project, sheetById(app.store.project, sheetId), w, hgt, app.store.revision);
        const id = uid("vp");
        app.store.edit(t("Place view on sheet"), (pr) => { sheetById(pr, sheetId).viewports.push({ id, view: viewId, x: Math.round(c[0]), y: Math.round(c[1]) }); });
        if (app.tab === "views" && viewsTab.current === sheetId) { viewsTab.sel = new Set([id]); viewsTab.vp.request(); }
        app.renderLeft();
        toast(t("{name} placed on sheet {n}.", { name: displayName(v.name), n: s.number }), "ok", 2500);
      };
      if (spec && spec.type === "model") ensureGen(p, spec, app.store.revision).then(doPlace).catch((e) => toast(e.message, "error"));
      else doPlace();
    },
    newSheetWith(viewId) {
      const id = api.newSheet();
      if (id) api.placeOnSheet(id, viewId);
    },
    newSheet(props = {}) {
      let sid = null;
      app.store.edit(t("New sheet"), (p) => { const s = newSheet(p, { name: "New sheet", paper: app.settings.defaultSheetPaper || "A1", ...props }); sid = s.id; p.sheets.push(s); });
      app.renderLeft();
      api.open(sid);
      return sid;
    },
    addCallout(parentId, rect) {
      const p = app.store.project;
      const n = allViews(p).filter((v) => v.kind === "detail").length + 1;
      const v = newView("detail", { name: `Detail ${n}`, ref: `D${n}`, parent: parentId, crop: rect, cropOn: true, scale: 20, detail: "fine" });
      app.store.edit(t("Add callout"), (pr) => { pr.views.push(v); });
      app.renderLeft();
      toast(t("{name} created. Double-click its marker (or the Project Browser entry) to open it.", { name: displayName(v.name) }), "ok", 4000);
      return v.id;
    },
    tagAll(viewId, cats) {
      const p = app.store.project;
      const v = viewById(p, viewId);
      if (!v) return 0;
      const have = new Set(annotationsOf(p, viewId).filter((a) => a.kind === "tag").map((a) => a.target));
      const targets = [];
      const want = (kind) => cats.includes(kind);
      if (v.kind === "plan" || v.kind === "ceiling") {
        const lvl = v.level;
        for (const k of ["rooms", "walls", "furniture", "columns"]) if (want(k)) for (const it of p[k]) if (it.level === lvl && !have.has(it.id)) targets.push(it.id);
        if (want("openings")) for (const o of p.openings) { const w = p.walls.find((x) => x.id === o.wall); if (w && w.level === lvl && !have.has(o.id)) targets.push(o.id); }
      } else {
        const spec = viewSpec(p, v);
        const gen = spec && cachedGen(p, spec, app.store.revision);
        if (gen) for (const id of gen.items.keys()) { const it = findItem(p, id); if (it && want(it.kind) && !have.has(id)) targets.push(id); }
      }
      if (!targets.length) { toast(t("Everything is tagged already."), "info"); return 0; }
      const S = (effectiveView(p, v) || {}).scale || 100;
      app.store.edit(t("Tag all"), (pr) => {
        for (const id of targets) {
          const it = findItem(pr, id);
          const off = it && it.kind === "openings" ? [0, 0] : it && it.kind === "walls" ? [0, -5 * S] : [0, 0];
          pr.annotations.push(newAnnotation(viewId, "tag", { target: id, dx: off[0], dy: off[1], leader: false }));
        }
      });
      toast(t("{n} tags added.", { n: targets.length }), "ok");
      return targets.length;
    },

    // ---------------------------------------------------------------- output
    async printSheets(ids) {
      const p = app.store.project;
      for (const id of ids) { const s = sheetById(p, id); if (s) await prepareSheet(p, s, app.store.revision); }
      const { printWindow } = await import("../ui/printwin.js");
      return printWindow(app, { sheets: ids });
    },
    async exportSheetsSvg(ids) {
      const p = app.store.project;
      let n = 0;
      for (const id of ids) {
        const s = sheetById(p, id);
        if (!s) continue;
        await prepareSheet(p, s, app.store.revision);
        const { svg } = sheetSvg(p, s, { rev: app.store.revision, t, units: app.settings.units });
        const out = svg.replace(/width="([\d.]+)" height="([\d.]+)"/, 'width="$1mm" height="$2mm"');
        const r = await platform.saveTextFile({ name: `${base(app)}-${s.number}.svg`, text: `<?xml version="1.0" encoding="UTF-8"?>\n${out}`, filters: [{ name: "SVG", extensions: ["svg"] }] });
        if (!r) return n;
        n++;
      }
      toast(t("Saved {name}", { name: `${n} SVG` }), "ok");
      return n;
    },
    async exportSheetsDxf(ids) {
      const p = app.store.project;
      let n = 0;
      for (const id of ids) {
        const s = sheetById(p, id);
        if (!s) continue;
        const { dxf } = await sheetDxf(p, s, app.store.revision, { t, units: app.settings.units });
        const r = await platform.saveTextFile({ name: `${base(app)}-${s.number}.dxf`, text: dxf, filters: [{ name: "DXF", extensions: ["dxf"] }] });
        if (!r) return n;
        n++;
      }
      toast(t("Saved {name}", { name: `${n} DXF` }), "ok");
      return n;
    },
    async exportDxf(id = api.currentId()) {
      const p = app.store.project;
      const s = sheetById(p, id);
      if (s) return api.exportSheetsDxf([s.id]);
      const v = viewById(p, id);
      if (!v || v.kind === "schedule") { toast(t("Open a view or a sheet first."), "warn"); return null; }
      const { dxf } = await viewDxf(p, v, app.store.revision, { planTheme: sheetPlanTheme(), units: app.settings.units });
      const r = await platform.saveTextFile({ name: `${base(app)}-${(v.name || "view").replace(/[\\/:*?"<>|\s]+/g, "_")}.dxf`, text: dxf, filters: [{ name: "DXF", extensions: ["dxf"] }] });
      if (r) toast(t("Saved {name}", { name: r.name }), "ok");
      return r;
    },
    async exportScheduleCsv(id) {
      const v = viewById(app.store.project, id);
      if (!v) return null;
      const r = await platform.saveTextFile({ name: `${base(app)}-${v.name.replace(/[\\/:*?"<>|\s]+/g, "_")}.csv`, text: scheduleCSV(app.store.project, v), filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (r) toast(t("Saved {name}", { name: r.name }), "ok");
      return r;
    },

    // ---------------------------------------------------------------- shell hooks
    renderLeft(host) {
      if (!app.settings.showLeft) return false;
      renderBrowser(app, host, { grow: app.tab === "views" });
      return true;
    },
    renderRight(host) { return renderInspector(host); },
    renderStatus(bar, cell) {
      const it = viewsTab.item();
      if (!it) { bar.append(cell(t("No view open"))); return; }
      if (viewsTab.isSheet()) bar.append(cell(`${t("Sheet")} ${it.number} · ${it.paper}`));
      else {
        const spec = viewsTab.spec();
        bar.append(cell(`${D.kindLabel(it.kind)} · 1:${spec ? spec.scale : it.scale}`));
        if (spec && spec.type === "model") { const g = cachedGen(app.store.project, spec, app.store.revision); bar.append(cell(g ? t("{n} lines, {c} cut", { n: g.lines.length, c: g.cut.length }) : t("Generating…"), "mono")); }
      }
      const c = viewsTab.cursor;
      if (c) bar.append(cell(viewsTab.isSheet() ? `X ${c[0].toFixed(1)}  Y ${c[1].toFixed(1)} mm` : `X ${Math.round(c[0])}  Y ${Math.round(-c[1])}`, "mono"));
      if (viewsTab.sel.size) bar.append(cell(t("{n} selected", { n: viewsTab.sel.size })));
    },
    renderToolbar(bar, btn, sep) {
      const add = (...els) => bar.append(...els.filter(Boolean));
      const it = viewsTab.item();
      const sheet = viewsTab.isSheet();
      add(btn("views.select"));
      if (it && !sheet && it.kind !== "schedule") add(split("dim", DIM_GROUP, btn), split("text", TEXT_GROUP, btn), split("detail", DETAIL_GROUP, btn), btn("views.callout"), btn("views.tagAll"));
      if (sheet) add(btn("views.placeView"), split("text", ["note"], btn), split("detail", DETAIL_GROUP, btn));
      add(sep(), btn("views.section"), btn("views.extElevations"), btn("views.ceilingPlan"), btn("views.schedule"), btn("views.sheet"), sep(),
        btn("views.properties"), btn("views.visibility"), btn("views.templates"), btn("views.revisions"), sep(), btn("views.publish"), btn("views.exportDxf"),
        sep(), btn("view.fit"));
    },
    // Two split buttons on the floor-plan tool bar: views and annotation.
    // One split button: the last used view or annotation tool, the caret lists them all.
    planButtons(btn) {
      return [splitPlan(btn)];
    },
    onKey(e) { return viewsTab.onKey(e); },
    onDocChange(info) {
      if (info && info.load) { viewsTab.restoreState(null); ext.clear(); ext.viewOverride = null; }
      viewsTab.onDocChange();
    },
    activate() { viewsTab.activate(); },
    deactivate() { viewsTab.deactivate(); },
    resize() { viewsTab.resize(); },
    saveState: () => ({ ...viewsTab.saveState(), planView: ext.viewOverride }),
    restoreState(s) { viewsTab.restoreState(s); ext.clear(); ext.viewOverride = (s && s.planView) || null; },
    hint() { return ""; },
  };

  function afterOpen() { app.renderLeft(); app.refreshInspector(); app.renderToolbar(); app.updateStatus(); }

  function removeViews(p, ids) {
    // Details of removed views go too.
    let grew = true;
    while (grew) { grew = false; for (const v of p.views) if (v.kind === "detail" && ids.has(v.parent) && !ids.has(v.id)) { ids.add(v.id); grew = true; } }
    p.views = p.views.filter((v) => !ids.has(v.id));
    p.annotations = p.annotations.filter((a) => !ids.has(a.view));
    for (const s of p.sheets) s.viewports = s.viewports.filter((vp) => !ids.has(vp.view));
  }

  // ---------------------------------------------------------------- tool bar helpers
  // A split button: the main part runs the last used tool of the group, the
  // caret lists the whole group.
  function split(group, kinds, btn) {
    const cur = kinds.includes(lastTool[group]) ? lastTool[group] : kinds[0];
    const main = btn(`ann.${cur}`);
    if (!main || kinds.length < 2) return main;
    const caret = h("button", { class: "icon-btn caret", title: t("More tools"), "data-split": group, html: icon("chevronDown", 12), onclick: (e) => {
      const r = e.currentTarget.parentElement.getBoundingClientRect();
      contextMenu(kinds.map((k) => ({ label: t(TOOL_DEFS[k].label), icon: TOOL_DEFS[k].icon, checked: false, action: () => { lastTool[group] = k; app.run(`ann.${k}`); app.renderToolbar(); } })), r.left, r.bottom + 2);
    } });
    return h("div", { class: "split-btn", "data-group": group }, main, caret);
  }
  function splitPlan(btn) {
    const viewIds = ["views.section", "views.elevation", "views.callout", "views.extElevations", "views.intElevations", "views.ceilingPlan"];
    const annIds = [...DIM_GROUP, ...TEXT_GROUP, ...DETAIL_GROUP].map((k) => `ann.${k}`);
    const cur = [...viewIds, ...annIds].includes(lastTool.plan) ? lastTool.plan : "views.section";
    const main = btn(cur);
    const pick = (id) => { lastTool.plan = id; app.run(id); app.renderToolbar(); };
    const caret = h("button", { class: "icon-btn caret", title: t("Views and annotation"), "data-split": "docs", html: icon("chevronDown", 12), onclick: (e) => {
      const r = e.currentTarget.parentElement.getBoundingClientRect();
      const item = (id) => { const c = app.commands.get(id); return { label: t(c.label), icon: c.icon, action: () => pick(id) }; };
      const items = [...viewIds.map(item), "-"];
      for (const [i, g] of [DIM_GROUP, TEXT_GROUP, DETAIL_GROUP].entries()) { if (i) items.push("-"); for (const k of g) items.push(item(`ann.${k}`)); }
      items.push("-", { label: t("Tag all not tagged…"), icon: "label", action: () => app.run("views.tagAll") });
      contextMenu(items, r.left, r.bottom + 2);
    } });
    return h("div", { class: "split-btn", "data-group": "docs" }, main, caret);
  }

  // ---------------------------------------------------------------- inspector
  function renderInspector(host) {
    const p = app.store.project;
    if (app.tab === "plan") {
      if (!ext.sel.size) return false;
      host.append(selectionPanel([...ext.sel]));
      return true;
    }
    if (app.tab !== "views") return false;
    const panel = h("div", { class: "panel grow" });
    const it = viewsTab.item();
    if (!it) { panel.append(h("div", { class: "panel-head" }, t("Properties")), h("div", { class: "panel-body" }, h("p", { class: "empty-note" }, t("Open a view or a sheet from the Project Browser.")))); host.append(panel); return true; }
    if (viewsTab.sel.size) { host.append(selectionPanel([...viewsTab.sel])); return true; }
    const body = h("div", { class: "panel-body vt-insp" });
    const row = (k, v) => h("div", { class: "vt-kv" }, h("span", {}, k), h("b", {}, v));
    if (viewsTab.isSheet()) {
      body.append(row(t("Sheet number"), it.number), row(t("Sheet name"), displayName(it.name)), row(t("Paper size"), `${it.paper} ${it.landscape === false ? t("Portrait") : t("Landscape")}`), row(t("Views"), String((it.viewports || []).length)));
      for (const r of viewportRects(p, it, app.store.revision, t)) body.append(h("div", { class: "vt-kv vt-click", onclick: () => api.open(r.view.id) }, h("span", { html: icon(kindIcon(r.view.kind), 13) }), h("span", {}, displayName(r.view.name)), h("small", {}, r.schedule ? "" : `1:${r.scale}`)));
      body.append(h("button", { class: "btn small", "data-act": "sheet-props", onclick: () => api.sheetProperties(it.id) }, h("span", { html: icon("settings", 13) }), t("Sheet properties…")));
    } else {
      const v = effectiveView(p, it);
      const tpl = (p.viewTemplates || []).find((x) => x.id === v.template);
      body.append(row(t("Kind"), D.kindLabel(v.kind)), row(t("Name"), displayName(v.name)));
      if (v.kind !== "schedule") body.append(row(t("View scale"), `1:${v.scale}`), row(t("Detail level"), t({ coarse: "Coarse", medium: "Medium", fine: "Fine" }[v.detail] || v.detail)), row(t("Phase filter"), t({ all: "All phases", new: "New design (no demolition)", existing: "Existing (before works)" }[v.phase] || v.phase)), row(t("View template"), tpl ? tpl.name : t("None")));
      if (v.kind === "detail") { const par = viewById(p, v.parent); body.append(row(t("Callout of"), par ? displayName(par.name) : "—")); }
      const pl = (p.sheets || []).find((s) => (s.viewports || []).some((vp) => vp.view === v.id));
      body.append(row(t("Sheet"), pl ? `${pl.number} — ${displayName(pl.name)}` : "—"));
      if (v.hidden && v.hidden.length) body.append(row(t("Hidden"), v.hidden.map((c) => D.catLabel(c)).join(", ")));
      body.append(h("div", { class: "vt-btns" },
        h("button", { class: "btn small", "data-act": "view-props", onclick: () => api.viewProperties(v.id) }, h("span", { html: icon("settings", 13) }), t("View properties…")),
        v.kind !== "schedule" ? h("button", { class: "btn small", onclick: () => D.visibilityDialog(app, v.id) }, h("span", { html: icon("layers", 13) }), t("Visibility / graphics…")) : null));
    }
    panel.append(h("div", { class: "panel-head" }, h("span", { class: "ph-ico", html: icon(viewsTab.isSheet() ? "sheet" : kindIcon(it.kind), 14) }), h("span", { class: "ph-title" }, t("Properties"))), body);
    host.append(panel);
    return true;
  }

  function selectionPanel(ids) {
    const p = app.store.project;
    const panel = h("div", { class: "panel grow" }, h("div", { class: "panel-head" }, h("span", { class: "ph-title" }, t("Properties"))));
    const body = h("div", { class: "panel-body vt-insp" });
    for (const id of ids.slice(0, 8)) {
      const a = (p.annotations || []).find((x) => x.id === id);
      const v = viewById(p, id);
      const vp = viewsTab.viewportById(id);
      if (a) {
        body.append(h("div", { class: "vt-kv" }, h("span", {}, t("Annotation")), h("b", {}, t(TOOL_DEFS[a.kind] ? TOOL_DEFS[a.kind].label : a.kind))));
        body.append(h("button", { class: "btn small", "data-act": "ann-props", onclick: () => api.annotationProperties(a) }, h("span", { html: icon("settings", 13) }), t("Properties…")));
      } else if (v) {
        body.append(h("div", { class: "vt-kv" }, h("span", {}, D.kindLabel(v.kind)), h("b", {}, displayName(v.name))));
        body.append(h("div", { class: "vt-btns" }, h("button", { class: "btn small", onclick: () => api.open(v.id) }, h("span", { html: icon(kindIcon(v.kind), 13) }), t("Open")), h("button", { class: "btn small", onclick: () => api.viewProperties(v.id) }, h("span", { html: icon("settings", 13) }), t("View properties…"))));
      } else if (vp) {
        const vv = viewById(p, vp.view);
        body.append(h("div", { class: "vt-kv" }, h("span", {}, t("Viewport")), h("b", {}, vv ? displayName(vv.name) : "—")));
        body.append(h("div", { class: "vt-btns" }, h("button", { class: "btn small", onclick: () => api.open(vp.view) }, t("Open view")), h("button", { class: "btn small", onclick: () => api.viewProperties(vp.view) }, t("View properties…")), h("button", { class: "btn small danger", onclick: () => viewsTab.deleteSelected() }, t("Remove from sheet"))));
      }
    }
    panel.append(body);
    return panel;
  }

  // ---------------------------------------------------------------- commands
  const C = (id, label, ic, key, run, extra = {}) => { COMMAND_LABELS.push(label); app.cmd(id, { label, icon: ic, key, run, ...extra }); };
  const toPlan = () => { if (app.tab !== "plan") app.setTab("plan"); };
  const level = () => app.plan.level;
  C("views.tab", "Views & sheets", "sheet", "F6", () => app.setTab("views"));
  C("views.browser", "Project Browser", "tree", "", () => { app.settings.showLeft = true; app.saveSettings(); if (app.tab === "start") app.setTab("plan"); app.applyPanels(); app.renderLeft(); });
  C("views.select", "Select", "select", "", () => viewsTab.setTool("select"), { checked: () => app.tab === "views" && viewsTab.tool === "select" });
  for (const [id, def] of Object.entries(VIEW_TOOLS)) {
    const short = id.slice(2);
    C(`views.${short}`, def.label, def.icon, "", () => {
      if (short === "callout" && app.tab === "views" && viewsTab.item() && !viewsTab.isSheet() && ["section", "elevation", "ceiling"].includes(viewsTab.item().kind)) { viewsTab.setTool("v:callout"); return; }
      toPlan(); ext.setTool(id);
    }, { checked: () => (app.tab === "plan" && app.plan.tool === id) || (app.tab === "views" && viewsTab.tool === id) });
  }
  C("views.extElevations", "Exterior elevations (N, S, E, W)", "elevation", "", () => {
    const p = app.store.project;
    const e = modelExtent(p);
    if (!p.walls.length && !(p.solids || []).length) { toast(t("Draw the building first: the elevations look at its walls."), "warn"); return; }
    const cx = (e.x1 + e.x2) / 2, cy = (e.y1 + e.y2) / 2, m = 8000;
    const list = [makeElevation(p, cx, e.y1 - m), makeElevation(p, cx, e.y2 + m), makeElevation(p, e.x2 + m, cy), makeElevation(p, e.x1 - m, cy)];
    app.store.edit(t("Exterior elevations"), (pr) => { for (const v of list) { const dup = pr.views.find((x) => x.kind === "elevation" && x.name === v.name); if (dup) Object.assign(dup, { x: v.x, y: v.y, angle: v.angle, crop: v.crop }); else pr.views.push(v); } });
    app.renderLeft();
    toast(t("Four exterior elevations are in the Project Browser."), "ok");
    const first = app.store.project.views.find((x) => x.kind === "elevation" && x.name === list[1].name);
    if (first) api.open(first.id);
  });
  C("views.intElevations", "Interior elevations of a room", "elevation", "", () => {
    const p = app.store.project;
    const sel = app.plan.selectedItems().find((x) => x.kind === "rooms");
    const room = sel ? sel.obj : p.rooms.find((r) => r.level === level());
    if (!room) { toast(t("Select a room first (or detect rooms)."), "warn"); return; }
    const lv = levelById(p, room.level);
    const c = room.label || roomLabelPoint(room);
    const b = ptsBounds(room.pts);
    const top = lv.elevation + lv.height + 300, bot = lv.elevation - 300;
    const names = ["A", "B", "C", "D"];
    const dirs = [-90, 0, 90, 180];
    const list = dirs.map((ang, i) => {
      const r = (ang * Math.PI) / 180;
      const R = [-Math.sin(r), Math.cos(r)];
      const xs = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map(([x, y]) => (x - c[0]) * R[0] + (y - c[1]) * R[1]);
      const ds = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map(([x, y]) => (x - c[0]) * Math.cos(r) + (y - c[1]) * Math.sin(r));
      return newView("elevation", { name: `${room.name || t("Room")} — ${names[i]}`, ref: `I${names[i]}`, x: c[0], y: c[1], angle: ang, level: room.level, interior: true, allLevels: false, scale: 50, detail: "medium", far: Math.max(...ds) + 600, cropOn: true, crop: { x1: Math.min(...xs) - 100, y1: -top, x2: Math.max(...xs) + 100, y2: -bot } });
    });
    app.store.edit(t("Interior elevations"), (pr) => { pr.views.push(...list); });
    app.renderLeft();
    toast(t("Four interior elevations of {name} are in the Project Browser.", { name: room.name || t("Room") }), "ok");
  });
  C("views.ceilingPlan", "Ceiling plan of the current level", "ceiling", "", () => api.open(ceilingViewId(level())));
  C("views.drafting", "New drafting view", "line", "", () => { const v = newView("drafting", { name: `Drafting view ${allViews(app.store.project).filter((x) => x.kind === "drafting").length + 1}`, scale: 20, cropOn: false }); app.store.edit(t("New drafting view"), (p) => { p.views.push(v); }); api.open(v.id); });
  C("views.legend", "New legend", "list", "", () => { const v = newView("legend", { name: "Wall types legend", legend: "walltypes", scale: 20, cropOn: false }); app.store.edit(t("New legend"), (p) => { p.views.push(v); }); api.open(v.id); });
  C("views.schedule", "New schedule…", "schedule", "", () => D.pickScheduleCategory(app, (cat) => api.newSchedule(cat)));
  api.newSchedule = (cat, props = {}) => {
    const def = defaultSchedule(cat);
    const v = newView("schedule", { name: `${((Object.entries({ rooms: "Room schedule", doors: "Door schedule", windows: "Window schedule", walls: "Wall schedule", furniture: "Furniture schedule", columns: "Column schedule", levels: "Level schedule", sheets: "Sheet list", views: "View list" }).find(([k]) => k === cat) || [0, "Schedule"])[1])}`, ...def, cropOn: false, ...props });
    app.store.edit(t("New schedule"), (p) => { p.views.push(v); });
    api.open(v.id);
    return v.id;
  };
  C("views.sheet", "New sheet", "sheet", "", () => api.newSheet());
  C("views.sheetList", "Sheet list (drawing list)", "list", "", () => {
    const p = app.store.project;
    const ex = (p.views || []).find((v) => v.kind === "schedule" && v.category === "sheets");
    if (ex) api.open(ex.id); else api.newSchedule("sheets");
  });
  C("views.placeView", "Place view on sheet…", "plus", "", () => {
    if (!(app.tab === "views" && viewsTab.isSheet())) { toast(t("Open a sheet first (Project Browser → Sheets)."), "warn"); return; }
    const sid = viewsTab.current;
    D.pickViewToPlace(app, sid, (vid) => api.placeOnSheet(sid, vid));
  });
  C("views.revisions", "Revisions…", "history", "", () => D.revisionsDialog(app));
  C("views.templates", "View templates…", "options", "", () => D.templatesDialog(app));
  C("views.lineStyles", "Line styles…", "line", "", () => D.lineStylesDialog(app));
  C("views.visibility", "Visibility / graphics…", "layers", "", () => D.visibilityDialog(app, api.currentId()));
  C("views.properties", "View properties…", "settings", "", () => { const id = api.currentId(); if (sheetById(app.store.project, id)) api.sheetProperties(id); else api.viewProperties(id); });
  C("views.publish", "Publish sheets (print, PDF, SVG, DXF)…", "print", "", () => D.publishDialog(app));
  C("views.exportDxf", "Export DXF of the view or sheet…", "dxf", "", () => api.exportDxf());
  C("views.tagAll", "Tag all not tagged…", "label", "", () => {
    const id = api.currentId();
    const v = viewById(app.store.project, id);
    if (!v || v.kind === "3d" || v.kind === "schedule" || sheetById(app.store.project, id)) { toast(t("Open a plan, section or elevation first."), "warn"); return; }
    D.tagAllDialog(app, id, (cats) => api.tagAll(id, cats));
  });
  C("views.duplicate", "Duplicate view", "copy", "", () => { const id = api.currentId(); if (viewById(app.store.project, id) && viewById(app.store.project, id).kind !== "3d") api.duplicateView(id); });
  for (const k of TOOL_IDS) {
    C(`ann.${k}`, TOOL_DEFS[k].label, TOOL_DEFS[k].icon, "", () => {
      if (app.tab === "views" && viewsTab.item()) {
        const v = viewById(app.store.project, viewsTab.current);
        if (v && v.kind === "schedule") { toast(t("Schedules take no annotation."), "info"); return; }
        if (viewsTab.isSheet() && !["note", "line", "region", "mask", "cloud", "symbol"].includes(k)) { toast(t("Open a view to dimension or tag it."), "info"); return; }
        viewsTab.setTool(`a:${k}`);
        return;
      }
      toPlan();
      ext.setTool(`a:${k}`);
    }, { checked: () => (app.tab === "plan" && app.plan.tool === `a:${k}`) || (app.tab === "views" && viewsTab.tool === `a:${k}`) });
  }
  return api;
}
