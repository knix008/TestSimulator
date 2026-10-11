// Project Browser (Revit) / Navigator (ArchiCAD): a tree of every view by
// kind, the schedules, the sheets with the views placed on them, view
// templates, revisions and publish sets. Click opens, right-click gives the
// actions, views drag onto an open sheet to place them.

import { t } from "../ui/i18n.js";
import { icon } from "../ui/icons.js";
import { h, panelHead, contextMenu } from "../ui/widgets.js";
import { allViews, view3dList, placementOf } from "./model.js";
import { kindIcon } from "./viewtab.js";
import { displayName } from "./names.js";

const GROUPS = [
  ["plan", "Floor plans"], ["ceiling", "Ceiling plans"], ["section", "Sections"], ["elevation", "Elevations"],
  ["detail", "Detail views"], ["drafting", "Drafting views"], ["legend", "Legends"], ["3d", "3D views"], ["schedule", "Schedules"],
];

const state = { closed: new Set(["Ceiling plans", "View templates", "Revisions", "Publish sets"]), query: "" };

export function renderBrowser(app, host, { grow = false } = {}) {
  const p = app.store.project;
  const views = app.views;
  const panel = h("div", { class: `panel vb-panel ${grow ? "grow" : ""}`, "data-panel": "browser" });
  const add = h("button", { class: "icon-btn", title: t("New view or sheet"), "data-act": "browser-add", html: icon("plus", 15), onclick: (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    contextMenu(app.menuItems(["views.section", "views.extElevations", "views.intElevations", "views.ceilingPlan", "views.callout", "views.drafting", "views.legend", "views.schedule", "-", "views.sheet", "views.sheetList", "-", "views.templates", "views.revisions", "views.publish"]), r.left, r.bottom + 2);
  } });
  panel.append(panelHead("tree", t("Project Browser"), h("div", { class: "grow" }), add));
  const search = h("input", { placeholder: t("Filter views and sheets…"), value: state.query });
  search.addEventListener("input", () => { state.query = search.value; fill(); });
  search.addEventListener("keydown", (e) => e.stopPropagation());
  panel.append(h("div", { class: "search" }, h("span", { html: icon("search", 14) }), search));
  const tree = h("div", { class: "vb-tree", role: "tree" });
  panel.append(tree);
  host.append(panel);
  const cur = views.currentId();

  const groupEl = (title, count, children) => {
    const open = !state.closed.has(title) || !!state.query;
    const head = h("div", { class: `vb-group ${open ? "open" : ""}`, role: "treeitem", "data-group": title },
      h("span", { class: "vb-caret", html: icon(open ? "chevronDown" : "chevronRight", 12) }), h("span", { class: "vb-gname" }, t(title)), h("small", {}, String(count)));
    head.addEventListener("click", () => { if (state.closed.has(title)) state.closed.delete(title); else state.closed.add(title); fill(); });
    const box = h("div", { class: "vb-children" });
    if (open) box.append(...children);
    return [head, box];
  };
  const row = (id, ic, label, { sub = "", menu, open, drag = true, depth = 1 } = {}) => {
    const el = h("div", { class: `vb-item ${id === cur ? "on" : ""}`, role: "treeitem", "data-id": id, draggable: drag ? "true" : "false", style: { paddingLeft: `${8 + depth * 14}px` }, title: label },
      h("span", { class: "vb-ico", html: icon(ic, 14) }), h("span", { class: "vb-name" }, label), sub ? h("small", {}, sub) : null);
    el.addEventListener("click", () => open());
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); contextMenu(menu(), e.clientX, e.clientY); });
    if (drag) el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/x-myarch-view", id); e.dataTransfer.effectAllowed = "copy"; });
    return el;
  };
  const q = () => state.query.trim().toLowerCase();
  const match = (s) => !q() || String(s).toLowerCase().includes(q());

  function fill() {
    tree.innerHTML = "";
    const all = [...allViews(p), ...view3dList(p)];
    const lvName = new Map(p.levels.map((l) => [l.id, l.name]));
    for (const [kind, title] of GROUPS) {
      const list = all.filter((v) => v.kind === kind && (match(v.name) || match(displayName(v.name))));
      if (!list.length && kind !== "plan" && kind !== "section" && kind !== "schedule") continue;
      const kids = list.map((v) => {
        const pl = placementOf(p, v.id);
        const name = v.kind === "3d" && v.id === "3d-default" ? t("Default 3D") : displayName(v.name);
        return row(v.id, kindIcon(v.kind), name, { sub: pl ? pl.sheet.number : v.kind === "plan" || v.kind === "ceiling" ? "" : `1:${v.scale || 100}`, open: () => views.open(v.id), menu: () => views.viewMenuItems(v) });
      });
      void lvName;
      tree.append(...groupEl(title, list.length, kids));
    }
    // Sheets with their viewports.
    const sheets = (p.sheets || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
    const sheetKids = [];
    for (const s of sheets) {
      if (!match(`${s.number} ${s.name} ${displayName(s.name)}`) && !(s.viewports || []).some((vp) => match((all.find((v) => v.id === vp.view) || {}).name || ""))) continue;
      sheetKids.push(row(s.id, "sheet", `${s.number} — ${displayName(s.name)}`, { open: () => views.open(s.id), menu: () => views.sheetMenuItems(s), drag: false }));
      for (const vp of s.viewports || []) {
        const v = all.find((x) => x.id === vp.view);
        if (!v) continue;
        sheetKids.push(row(v.id, kindIcon(v.kind), v.id === "3d-default" ? t("Default 3D") : displayName(v.name), { depth: 2, open: () => views.open(v.id), menu: () => views.viewMenuItems(v), drag: false }));
      }
    }
    tree.append(...groupEl("Sheets", sheets.length, sheetKids));
    const tpls = (p.viewTemplates || []).filter((x) => match(x.name));
    tree.append(...groupEl("View templates", tpls.length, tpls.map((x) => row(x.id, "options", displayName(x.name), { drag: false, open: () => views.templatesDialog(x.id), menu: () => [{ label: t("Edit view templates…"), icon: "settings", action: () => views.templatesDialog(x.id) }] }))));
    const revs = (p.revisions || []).filter((r) => match(`${r.name} ${r.description}`));
    tree.append(...groupEl("Revisions", revs.length, revs.map((r) => row(r.id, "history", `${r.name || r.seq} — ${r.description || ""}`, { sub: r.date || "", drag: false, open: () => views.revisionsDialog(), menu: () => [{ label: t("Revisions…"), icon: "history", action: () => views.revisionsDialog() }] }))));
    const sets = (p.publishSets || []).filter((x) => match(x.name));
    tree.append(...groupEl("Publish sets", sets.length, sets.map((x) => row(x.id, "print", displayName(x.name), { sub: String(x.sheets.length), drag: false, open: () => views.publishDialog(x.id), menu: () => [{ label: t("Publish…"), icon: "print", action: () => views.publishDialog(x.id) }] }))));
  }
  fill();
  return panel;
}
