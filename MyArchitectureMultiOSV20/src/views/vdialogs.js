// Dialogs of the documentation features: view properties, visibility /
// graphics overrides, view templates, sheet properties (title block fields),
// revisions, publish sets, schedule fields / filters / sorting, annotation
// properties, auto-tagging and line styles. Every change is one store.edit.

import { t } from "../ui/i18n.js";
import { icon } from "../ui/icons.js";
import { h, modal, field, input, select, checkbox, toast, quickPick } from "../ui/widgets.js";
import { uid } from "../core/geom.js";
import { viewById, ensureView, sheetById, allViews, view3dList, VIEW_SCALES, DETAIL_LEVELS, MODEL_CATEGORIES, ANNOTATION_CATEGORIES, PAPERS, LINE_STYLES, TEMPLATE_FIELDS } from "./model.js";
import { SCHEDULE_CATEGORIES, categoryFields } from "./schedules.js";
import { REGION_PATTERNS } from "./hatch.js";
import { SYMBOLS, DEFAULT_TAG } from "./annot.js";
import { kindIcon } from "./viewtab.js";
import { displayName } from "./names.js";

const DETAIL_LABEL = { coarse: "Coarse", medium: "Medium", fine: "Fine" };
const PHASE_LABEL = { all: "All phases", new: "New design (no demolition)", existing: "Existing (before works)" };
const KIND_LABEL = { plan: "Floor plan", ceiling: "Ceiling plan", section: "Section", elevation: "Elevation", detail: "Detail view", drafting: "Drafting view", legend: "Legend", schedule: "Schedule", "3d": "3D view" };
export const kindLabel = (k) => t(KIND_LABEL[k] || k);
const CAT_LABEL = { walls: "Walls", doors: "Doors", windows: "Windows", openings: "Openings", rooms: "Rooms", columns: "Columns", stairs: "Stairs", furniture: "Furniture", lights: "Light fixtures", roofs: "Roofs", solids: "Mass models", dimensions: "Dimensions", texts: "Texts and labels", tags: "Tags", grids: "Structural grids", levels: "Levels", markers: "View markers", drawings: "Detail and CAD lines", regions: "Filled regions", clouds: "Revision clouds", symbols: "Symbols", slabs: "Slabs", ceilings: "Ceilings", beams: "Beams", railings: "Railings", ramps: "Ramps", shafts: "Shafts", curtainWalls: "Curtain walls" };
export const catLabel = (c) => t(CAT_LABEL[c] || c);

const num = (v, d) => (Number.isFinite(+v) && v !== "" ? +v : d);

// Model categories this project can show: the fixed list and every element
// collection another module added (slabs, beams …).
export function modelCategories(p) {
  const extra = Object.keys(p).filter((k) => Array.isArray(p[k]) && p[k].length && p[k][0] && typeof p[k][0] === "object" && "level" in p[k][0] && !["dimensions", "texts", "drawings", "underlays"].includes(k));
  return [...new Set([...MODEL_CATEGORIES, ...extra])];
}

// ---------------------------------------------------------------- view properties
export async function viewProperties(app, id) {
  const p = app.store.project;
  const v0 = viewById(p, id);
  if (!v0) return;
  if (v0.kind === "3d") { toast(t("3D views are the scenes of the 3D tab: set them up there."), "info"); return; }
  const v = JSON.parse(JSON.stringify(v0));
  const name = input(v.name, { cls: "wide" });
  const ref = input(v.ref || "", { cls: "wide" });
  const scale = select(String(v.scale || 100), VIEW_SCALES.map((s) => [String(s), `1:${s}`]));
  const detail = select(v.detail || "medium", DETAIL_LEVELS.map((d) => [d, t(DETAIL_LABEL[d])]));
  const phase = select(v.phase || "all", Object.entries(PHASE_LABEL).map(([k, l]) => [k, t(l)]));
  const tpls = (p.viewTemplates || []).filter((x) => !x.kinds || !x.kinds.length || x.kinds.includes(v.kind));
  const template = select(v.template || "", [["", t("None")], ...tpls.map((x) => [x.id, displayName(x.name)])]);
  const rows = [field(t("Name"), name), field(t("Reference"), ref), field(t("View scale"), scale), field(t("Detail level"), detail), field(t("Phase filter"), phase), field(t("View template"), template)];
  let cut = null, far = null, flip = null, legend = null;
  if (v.kind === "plan" || v.kind === "ceiling") { cut = input(v.cutHeight ?? (v.kind === "ceiling" ? 2300 : ""), { type: "number", placeholder: t("all") }); rows.push(field(t("Cut height (mm above the level)"), cut, v.kind === "plan" ? t("Windows above the cut are left out; furniture above it is drawn dashed.") : "")); }
  if (v.kind === "section" || v.kind === "elevation") { far = input(v.far && v.far < 1e6 ? v.far : "", { type: "number", placeholder: t("unlimited") }); rows.push(field(t("Far clip depth (mm)"), far)); }
  if (v.kind === "section") { flip = checkbox(!!v.flip, t("Flip the look direction")); rows.push(h("div", { class: "field" }, flip)); }
  if (v.kind === "legend") { legend = select(v.legend || "walltypes", [["walltypes", t("Wall types")], ["materials", t("Wall materials")]]); rows.push(field(t("Legend content"), legend)); }
  const cropOn = checkbox(!!v.cropOn, t("Crop the view"));
  const cropShow = checkbox(v.cropShow !== false, t("Show the crop region"));
  const resetCrop = checkbox(false, t("Reset the crop region to the content"));
  rows.push(h("div", { class: "field span2 check-col" }, cropOn, cropShow, resetCrop));
  const r = await modal({ icon: "floorplan", title: `${t("View properties")} — ${kindLabel(v.kind)}`, width: 560, body: h("div", { class: "form-grid" }, ...rows), buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  app.store.edit(t("View properties"), (pr) => {
    const sv = ensureView(pr, id);
    if (!sv) return false;
    sv.name = name.value.trim() || sv.name;
    sv.ref = ref.value.trim();
    sv.scale = +scale.value;
    sv.detail = detail.value;
    sv.phase = phase.value;
    sv.template = template.value || null;
    if (cut) { const c = parseFloat(cut.value); if (Number.isFinite(c) && c > 0) sv.cutHeight = c; else delete sv.cutHeight; }
    if (far) { const fv = parseFloat(far.value); sv.far = Number.isFinite(fv) && fv > 0 ? fv : undefined; }
    if (flip) sv.flip = flip.querySelector("input").checked;
    if (legend) sv.legend = legend.value;
    sv.cropOn = cropOn.querySelector("input").checked;
    sv.cropShow = cropShow.querySelector("input").checked;
    if (resetCrop.querySelector("input").checked) sv.crop = null;
    if (sv.cropOn && !sv.crop) sv.crop = app.views.contentExtent(sv.id);
    return true;
  });
}

// ---------------------------------------------------------------- visibility / graphics
export async function visibilityDialog(app, id) {
  const p = app.store.project;
  const v0 = viewById(p, id);
  if (!v0 || v0.kind === "3d" || v0.kind === "schedule") { toast(t("Open a plan, section, elevation or detail view first."), "warn"); return; }
  const hidden = new Set(v0.hidden || []);
  const overrides = JSON.parse(JSON.stringify(v0.overrides || {}));
  const tplNote = v0.template ? h("p", { class: "field-hint" }, t("This view uses a view template: the template's settings win. Edit the template or remove it from the view.")) : null;
  const table = (cats, colour) => {
    const tb = h("table", { class: "grid vg-table" }, h("thead", {}, h("tr", {}, h("th", {}, t("Visible")), h("th", {}, t("Category")), colour ? h("th", {}, t("Cut fill colour")) : null)));
    const body = h("tbody");
    for (const c of cats) {
      const vis = h("input", { type: "checkbox", "data-cat": c });
      vis.checked = !hidden.has(c);
      vis.addEventListener("change", () => { if (vis.checked) hidden.delete(c); else hidden.add(c); });
      const col = colour ? h("input", { type: "color", value: (overrides[c] && overrides[c].color) || "#808080" }) : null;
      const use = colour ? h("input", { type: "checkbox" }) : null;
      if (use) { use.checked = !!(overrides[c] && overrides[c].color); const upd = () => { if (use.checked) overrides[c] = { ...(overrides[c] || {}), color: col.value }; else delete overrides[c]; }; use.addEventListener("change", upd); col.addEventListener("input", () => { use.checked = true; upd(); }); }
      body.append(h("tr", {}, h("td", {}, vis), h("td", {}, catLabel(c)), colour ? h("td", {}, h("label", { class: "check" }, use, col)) : null));
    }
    tb.append(body);
    return tb;
  };
  const model = v0.kind !== "drafting" && v0.kind !== "legend";
  const body = h("div", { class: "vg-body" }, tplNote,
    model ? h("h4", {}, t("Model categories")) : null, model ? table(modelCategories(p), v0.kind !== "plan") : null,
    h("h4", {}, t("Annotation categories")), table(ANNOTATION_CATEGORIES, false));
  const r = await modal({ icon: "eye", title: `${t("Visibility / graphics")} — ${v0.name}`, width: 520, body, buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  app.store.edit(t("Visibility / graphics"), (pr) => { const sv = ensureView(pr, id); sv.hidden = [...hidden]; sv.overrides = overrides; });
}

// ---------------------------------------------------------------- view templates
export async function templatesDialog(app, selectId = null) {
  const store = app.store;
  let list = JSON.parse(JSON.stringify(store.project.viewTemplates || []));
  let cur = selectId && list.some((x) => x.id === selectId) ? selectId : (list[0] || {}).id;
  const applyTo = new Map(); // template id → Set(view ids) chosen in this dialog
  const left = h("div", { class: "vt-tpl-list" });
  const right = h("div", { class: "vt-tpl-edit" });
  const views = allViews(store.project).filter((v) => v.kind !== "schedule");
  const draw = () => {
    left.innerHTML = "";
    for (const x of list) left.append(h("div", { class: `vb-item ${x.id === cur ? "on" : ""}`, "data-tpl": x.id, onclick: () => { cur = x.id; draw(); } }, h("span", { class: "vb-ico", html: icon("options", 14) }), h("span", { class: "vb-name" }, displayName(x.name))));
    left.append(h("div", { class: "vt-tpl-btns" },
      h("button", { class: "btn small", "data-act": "tpl-new", onclick: () => { const n = { id: uid("vt"), name: t("New template"), kinds: ["plan"], scale: 100, detail: "medium", phase: "all", hidden: [] }; list.push(n); cur = n.id; draw(); } }, t("New")),
      h("button", { class: "btn small", onclick: () => { const s = list.find((x) => x.id === cur); if (!s) return; const n = { ...JSON.parse(JSON.stringify(s)), id: uid("vt"), name: `${s.name} (2)` }; list.push(n); cur = n.id; draw(); } }, t("Duplicate")),
      h("button", { class: "btn small danger", onclick: () => { list = list.filter((x) => x.id !== cur); cur = (list[0] || {}).id; draw(); } }, t("Delete"))));
    right.innerHTML = "";
    const tp = list.find((x) => x.id === cur);
    if (!tp) { right.append(h("p", { class: "field-hint" }, t("No view templates yet."))); return; }
    const nm = input(tp.name, { cls: "wide", onInput: (val) => { tp.name = val; } });
    const sc = select(String(tp.scale || 100), VIEW_SCALES.map((s) => [String(s), `1:${s}`]), { onChange: (val) => { tp.scale = +val; } });
    const dl = select(tp.detail || "medium", DETAIL_LEVELS.map((d) => [d, t(DETAIL_LABEL[d])]), { onChange: (val) => { tp.detail = val; } });
    const ph = select(tp.phase || "all", Object.entries(PHASE_LABEL).map(([k, l]) => [k, t(l)]), { onChange: (val) => { tp.phase = val; } });
    const kinds = h("div", { class: "chips" }, ...["plan", "ceiling", "section", "elevation", "detail"].map((k) => { const on = (tp.kinds || []).includes(k); return h("button", { class: `chip ${on ? "on" : ""}`, onclick: () => { tp.kinds = on ? tp.kinds.filter((x) => x !== k) : [...(tp.kinds || []), k]; draw(); } }, kindLabel(k)); }));
    const hid = h("div", { class: "vt-cats" }, ...[...modelCategories(store.project), ...ANNOTATION_CATEGORIES].map((c) => checkbox(!(tp.hidden || []).includes(c), catLabel(c), { onChange: (on) => { tp.hidden = on ? (tp.hidden || []).filter((x) => x !== c) : [...(tp.hidden || []), c]; } })));
    const chosen = applyTo.get(tp.id) || new Set(views.filter((v) => v.template === tp.id).map((v) => v.id));
    applyTo.set(tp.id, chosen);
    const vlist = h("div", { class: "vt-cats" }, ...views.filter((v) => !tp.kinds || !tp.kinds.length || tp.kinds.includes(v.kind)).map((v) => checkbox(chosen.has(v.id), `${kindLabel(v.kind)}: ${displayName(v.name)}`, { onChange: (on) => { if (on) chosen.add(v.id); else chosen.delete(v.id); } })));
    right.append(h("div", { class: "form-grid" }, field(t("Name"), nm), field(t("View scale"), sc), field(t("Detail level"), dl), field(t("Phase filter"), ph)),
      h("h4", {}, t("For view kinds")), kinds, h("h4", {}, t("Visible categories")), hid, h("h4", {}, t("Apply to views")), vlist);
  };
  draw();
  const r = await modal({ icon: "options", title: t("View templates"), width: "min(860px, calc(100vw - 40px))", body: h("div", { class: "vt-tpl" }, left, right), buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  store.edit(t("View templates"), (p) => {
    p.viewTemplates = list;
    const ids = new Set(list.map((x) => x.id));
    for (const v of p.views) if (v.template && !ids.has(v.template)) v.template = null;
    for (const [tid, set] of applyTo) {
      if (!ids.has(tid)) continue;
      for (const v of allViews(p)) {
        if (set.has(v.id)) ensureView(p, v.id).template = tid;
        else if (v.template === tid) ensureView(p, v.id).template = null;
      }
    }
  });
  void TEMPLATE_FIELDS;
}

// ---------------------------------------------------------------- sheets
export async function sheetProperties(app, id) {
  const p = app.store.project;
  const s0 = sheetById(p, id);
  if (!s0) return;
  const s = JSON.parse(JSON.stringify(s0));
  const number = input(s.number, { cls: "wide" });
  const name = input(s.name, { cls: "wide" });
  const paper = select(s.paper, [...Object.keys(PAPERS).map((k) => [k, `${k} — ${PAPERS[k][0]} × ${PAPERS[k][1]} mm`])]);
  const orient = select(s.landscape === false ? "p" : "l", [["l", t("Landscape")], ["p", t("Portrait")]]);
  const f = {};
  const flds = [["drawnBy", "Drawn by"], ["checkedBy", "Checked by"], ["approvedBy", "Approved by"], ["issueDate", "Issue date"], ["status", "Status"]];
  const fieldEls = flds.map(([k, l]) => { f[k] = input(s.fields[k] || "", { cls: "wide", placeholder: k === "drawnBy" ? p.meta.author || "" : k === "issueDate" ? p.meta.date || "" : "" }); return field(t(l), f[k]); });
  const revBoxes = (p.revisions || []).map((r) => { const c = checkbox((s.revisions || []).includes(r.id), `${r.name || r.seq} — ${r.description} (${r.date})`); c.dataset.rev = r.id; return c; });
  const body = h("div", {}, h("div", { class: "form-grid" }, field(t("Sheet number"), number), field(t("Sheet name"), name), field(t("Paper size"), paper), field(t("Orientation"), orient), ...fieldEls),
    h("h4", {}, t("Revisions on this sheet")), revBoxes.length ? h("div", { class: "check-col" }, ...revBoxes) : h("p", { class: "field-hint" }, t("No revisions yet: add them in Drawings → Revisions…")),
    h("p", { class: "field-hint" }, t("Project name, client, address and company come from File → Project properties.")));
  const r = await modal({ icon: "sheet", title: `${t("Sheet properties")} — ${s.number}`, width: 600, body, buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  app.store.edit(t("Sheet properties"), (pr) => {
    const sh = sheetById(pr, id);
    sh.number = number.value.trim() || sh.number;
    sh.name = name.value.trim();
    sh.paper = paper.value;
    sh.landscape = orient.value === "l";
    for (const [k] of flds) sh.fields[k] = f[k].value.trim();
    sh.revisions = revBoxes.filter((c) => c.querySelector("input").checked).map((c) => c.dataset.rev);
  });
}

// ---------------------------------------------------------------- revisions
export async function revisionsDialog(app) {
  let list = JSON.parse(JSON.stringify(app.store.project.revisions || []));
  const body = h("div", { class: "vt-revs" });
  const draw = () => {
    body.innerHTML = "";
    const tb = h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Seq.", "Revision", "Date", "Description", "Issued to", "Issued by", "Issued", ""].map((x) => h("th", {}, x ? t(x) : "")))));
    const tbody = h("tbody");
    list.forEach((r, i) => {
      const cell = (k, w, type = "text") => { const el = input(r[k] ?? "", { type, onInput: (v) => { r[k] = type === "number" ? +v : v; } }); el.style.width = w; return h("td", {}, el); };
      const iss = h("input", { type: "checkbox" }); iss.checked = !!r.issued; iss.addEventListener("change", () => { r.issued = iss.checked; });
      tbody.append(h("tr", {}, h("td", {}, String(i + 1)), cell("name", "50px"), cell("date", "100px", "date"), cell("description", "220px"), cell("issuedTo", "110px"), cell("issuedBy", "90px"), h("td", {}, iss),
        h("td", {}, h("button", { class: "icon-btn", title: t("Delete"), html: icon("trash", 14), onclick: () => { list.splice(i, 1); draw(); } }))));
    });
    tb.append(tbody);
    body.append(tb, h("button", { class: "btn small", "data-act": "rev-add", onclick: () => { const n = list.length + 1; list.push({ id: uid("rv"), seq: n, name: String.fromCharCode(64 + Math.min(26, n)), date: new Date().toISOString().slice(0, 10), description: "", issuedTo: "", issuedBy: app.store.project.meta.author || "", issued: false }); draw(); } }, h("span", { html: icon("plus", 13) }), t("Add revision")),
      h("p", { class: "field-hint" }, t("A revision shows on a sheet when it is ticked in the sheet's properties or when a revision cloud of it is in one of the sheet's views.")));
  };
  draw();
  const r = await modal({ icon: "annotate", title: t("Revisions"), width: "min(900px, calc(100vw - 40px))", body, buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  app.store.edit(t("Revisions"), (p) => {
    list.forEach((x, i) => { x.seq = i + 1; });
    p.revisions = list;
    const ids = new Set(list.map((x) => x.id));
    for (const s of p.sheets) s.revisions = (s.revisions || []).filter((id) => ids.has(id));
    for (const a of p.annotations) if (a.kind === "cloud" && a.rev && !ids.has(a.rev)) a.rev = null;
  });
}

// ---------------------------------------------------------------- publish
export async function publishDialog(app, setId = null) {
  const store = app.store;
  const p = store.project;
  const sheets = (p.sheets || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
  if (!sheets.length) { toast(t("There are no sheets yet: make one with Drawings → New sheet."), "warn"); return; }
  const set = (p.publishSets || []).find((x) => x.id === setId);
  const chosen = new Set(set ? set.sheets : sheets.map((s) => s.id));
  const boxes = h("div", { class: "check-col vt-pub-list" });
  const draw = () => { boxes.innerHTML = ""; for (const s of sheets) boxes.append(checkbox(chosen.has(s.id), `${s.number} — ${displayName(s.name)}  (${s.paper})`, { onChange: (on) => { if (on) chosen.add(s.id); else chosen.delete(s.id); } })); };
  draw();
  const setSel = select(setId || "", [["", t("All sheets")], ...(p.publishSets || []).map((x) => [x.id, displayName(x.name)])], { onChange: (v) => { chosen.clear(); const ps = (store.project.publishSets || []).find((x) => x.id === v); for (const s of sheets) if (!ps || ps.sheets.includes(s.id)) chosen.add(s.id); draw(); } });
  const saveName = input(set ? set.name : "", { placeholder: t("Name of a new publish set") });
  const body = h("div", {}, h("div", { class: "form-grid" }, field(t("Publish set"), setSel), field(t("Save the selection as"), saveName)), h("h4", {}, t("Sheets")), boxes,
    h("p", { class: "field-hint" }, t("Print / PDF opens the print window with these sheets; SVG and DXF write one file per sheet.")));
  const r = await modal({ icon: "export", title: t("Publish sheets"), width: 620, body, buttons: [
    { label: t("Save set"), value: "save", left: true }, { label: t("Cancel"), value: null }, { label: "DXF…", value: "dxf" }, { label: "SVG…", value: "svg" }, { label: t("Print / PDF…"), value: "print", primary: true },
  ] });
  if (!r) return;
  const ids = sheets.filter((s) => chosen.has(s.id)).map((s) => s.id);
  if (r === "save" || (saveName.value.trim() && (!set || saveName.value.trim() !== set.name))) {
    const nm = saveName.value.trim() || t("Publish set");
    store.edit(t("Save publish set"), (pr) => { const ex = pr.publishSets.find((x) => x.name === nm); if (ex) ex.sheets = ids; else pr.publishSets.push({ id: uid("ps"), name: nm, sheets: ids }); });
    if (r === "save") { toast(t("Publish set \"{name}\" saved.", { name: nm }), "ok"); return; }
  }
  if (!ids.length) { toast(t("Tick at least one sheet."), "warn"); return; }
  if (r === "print") await app.views.printSheets(ids);
  else if (r === "svg") await app.views.exportSheetsSvg(ids);
  else if (r === "dxf") await app.views.exportSheetsDxf(ids);
}

// ---------------------------------------------------------------- schedules
export function pickScheduleCategory(app, onPick) {
  quickPick({ title: t("New schedule"), placeholder: t("Category…"), items: Object.entries(SCHEDULE_CATEGORIES).map(([k, c]) => ({ label: t(c.label), icon: "schedule", value: k })), onPick: (it) => onPick(it.value) });
}

export async function scheduleProperties(app, id) {
  const v0 = viewById(app.store.project, id);
  if (!v0 || v0.kind !== "schedule") return;
  const s = JSON.parse(JSON.stringify(v0));
  const fields = categoryFields(s.category);
  s.calc = s.calc || [];
  s.filters = s.filters || [];
  s.sort = s.sort || [];
  const body = h("div", { class: "vt-sched-props" });
  const opts = () => [["", "—"], ...fields.map((f) => [f.key, t(f.label)]), ...s.calc.filter((c) => c.key).map((c) => [c.key, c.name || c.key])];
  const draw = () => {
    body.innerHTML = "";
    const fl = h("div", { class: "vt-fields" });
    const all = [...fields.map((f) => ({ key: f.key, label: t(f.label) })), ...s.calc.filter((c) => c.key).map((c) => ({ key: c.key, label: `ƒ ${c.name || c.key}` }))];
    const ordered = [...s.fields.map((k) => all.find((f) => f.key === k)).filter(Boolean), ...all.filter((f) => !s.fields.includes(f.key))];
    for (const f of ordered) {
      const on = s.fields.includes(f.key);
      const i = s.fields.indexOf(f.key);
      fl.append(h("div", { class: "vt-field-row" }, checkbox(on, f.label, { onChange: (c) => { s.fields = c ? [...s.fields, f.key] : s.fields.filter((k) => k !== f.key); draw(); } }),
        on ? h("button", { class: "icon-btn", title: t("Move up"), disabled: i <= 0, html: icon("arrowUp", 13), onclick: () => { s.fields.splice(i, 1); s.fields.splice(i - 1, 0, f.key); draw(); } }) : null,
        on ? h("button", { class: "icon-btn", title: t("Move down"), disabled: i >= s.fields.length - 1, html: icon("arrowDown", 13), onclick: () => { s.fields.splice(i, 1); s.fields.splice(i + 1, 0, f.key); draw(); } }) : null));
    }
    const filt = h("div", { class: "check-col" }, ...s.filters.map((f, i) => h("div", { class: "vt-filter-row" },
      select(f.field, opts(), { onChange: (v) => { f.field = v; } }), select(f.op || "=", ["=", "!=", ">", "<", ">=", "<=", "contains"].map((x) => [x, x === "contains" ? t("contains") : x]), { onChange: (v) => { f.op = v; } }),
      input(f.value ?? "", { onInput: (v) => { f.value = v; } }), h("button", { class: "icon-btn", html: icon("trash", 13), onclick: () => { s.filters.splice(i, 1); draw(); } }))),
      h("button", { class: "btn small", "data-act": "add-filter", onclick: () => { s.filters.push({ field: fields[0].key, op: "=", value: "" }); draw(); } }, t("Add filter")));
    const sortRows = h("div", { class: "check-col" }, ...[0, 1].map((i) => { const so = s.sort[i] || { field: "", desc: false }; return h("div", { class: "vt-filter-row" }, h("span", {}, i ? t("then by") : t("Sort by")), select(so.field, opts(), { onChange: (v) => { s.sort[i] = { ...so, field: v }; s.sort = s.sort.filter((x) => x && x.field); } }), checkbox(so.desc, t("Descending"), { onChange: (c) => { so.desc = c; s.sort[i] = so; } })); }));
    const group = select(s.group || "", opts(), { onChange: (v) => { s.group = v || null; } });
    const totals = checkbox(s.totals !== false, t("Grand totals"), { onChange: (c) => { s.totals = c; } });
    const calc = h("div", { class: "check-col" }, ...s.calc.map((c, i) => h("div", { class: "vt-filter-row" }, input(c.name || "", { placeholder: t("Name"), onInput: (v) => { c.name = v; c.key = c.key || `calc${i + 1}`; } }), input(c.expr || "", { placeholder: "area * 1.1", onInput: (v) => { c.expr = v; } }), h("button", { class: "icon-btn", html: icon("trash", 13), onclick: () => { s.calc.splice(i, 1); s.fields = s.fields.filter((k) => k !== c.key); draw(); } }))),
      h("button", { class: "btn small", onclick: () => { const k = `calc${Date.now().toString(36).slice(-4)}`; s.calc.push({ key: k, name: t("Calculated"), expr: "" }); s.fields.push(k); draw(); } }, t("Add calculated value")),
      h("p", { class: "field-hint" }, t("Formulas use the field keys ({keys}) with + − * / and brackets.", { keys: fields.filter((f) => f.type !== "text").map((f) => f.key).join(", ") })));
    body.append(h("div", { class: "vt-sched-cols" },
      h("div", {}, h("h4", {}, t("Fields")), fl),
      h("div", {}, h("h4", {}, t("Filters")), filt, h("h4", {}, t("Sorting and grouping")), sortRows, field(t("Group by (with subtotals)"), group), totals, h("h4", {}, t("Calculated values")), calc)));
  };
  draw();
  const r = await modal({ icon: "schedule", title: `${t("Schedule properties")} — ${s.name}`, width: "min(860px, calc(100vw - 40px))", body, buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  app.store.edit(t("Schedule properties"), (p) => { const sv = ensureView(p, id); Object.assign(sv, { fields: s.fields, filters: s.filters, sort: s.sort, group: s.group, totals: s.totals, calc: s.calc.filter((c) => c.key) }); });
}

// ---------------------------------------------------------------- place a view
export function pickViewToPlace(app, sheetId, onPick) {
  const p = app.store.project;
  const items = [...allViews(p), ...view3dList(p)].filter((v) => {
    if (v.kind === "schedule" || v.kind === "legend") return true;
    return !(p.sheets || []).some((s) => (s.viewports || []).some((vp) => vp.view === v.id));
  }).map((v) => ({ label: v.id === "3d-default" ? t("Default 3D") : displayName(v.name), detail: kindLabel(v.kind), icon: kindIcon(v.kind), value: v.id }));
  if (!items.length) { toast(t("Every view is already on a sheet."), "info"); return; }
  quickPick({ title: t("Place view on sheet"), placeholder: t("Type a view name…"), items, onPick: (it) => onPick(it.value) });
  void sheetId;
}

// ---------------------------------------------------------------- annotations
export async function annotationProperties(app, a0) {
  const p = app.store.project;
  const a = JSON.parse(JSON.stringify(a0));
  const rows = [];
  const set = {};
  const k = a.kind;
  if (k === "note") { set.text = h("textarea", { class: "input wide", rows: "3" }, a.text || ""); set.size = input(a.size || 2.5, { type: "number", step: "0.5" }); rows.push(field(t("Text"), set.text), field(t("Text size (paper mm)"), set.size)); }
  if (k === "keynote") { set.key = input(a.key || ""); set.text = input(a.text || "", { cls: "wide" }); set.showText = checkbox(!!a.showText, t("Show the description")); rows.push(field(t("Key"), set.key), field(t("Description"), set.text), set.showText); }
  if (k === "tag") { set.template = input(a.template || "", { cls: "wide", placeholder: "{name}\\n{area}" }); set.leader = checkbox(!!a.leader, t("Leader")); rows.push(field(t("Label (parameters in braces)"), set.template, t("Fields: {name}, {mark}, {area}, {type}, {width}, {height}, {level}, {material}, {number} and any BIM property.")), set.leader); }
  if (k === "symbol") { set.sym = select(a.sym || "north", SYMBOLS.map((s) => [s, t({ north: "North arrow", arrow: "Arrow", break: "Break line", centre: "Centre mark", cross: "Cross" }[s])])); set.size = input(a.size || 10, { type: "number" }); set.rot = input(a.rot || 0, { type: "number" }); rows.push(field(t("Symbol"), set.sym), field(t("Size (paper mm)"), set.size), field(t("Rotation (°)"), set.rot)); }
  if (k === "region") { set.pattern = select(a.pattern || "hatch", REGION_PATTERNS.map((x) => [x, t(x)])); set.color = input(a.color || "#555555", { type: "color" }); set.border = select(a.border || "thin", [["none", t("None")], ...(p.lineStyles || LINE_STYLES).map((s) => [s.id, t(s.name)])]); rows.push(field(t("Pattern"), set.pattern), field(t("Colour"), set.color), field(t("Border line"), set.border)); }
  if (k === "line") { set.style = select(a.style || "medium", (p.lineStyles || LINE_STYLES).map((s) => [s.id, t(s.name)])); rows.push(field(t("Line style"), set.style)); }
  if (k === "cloud") { set.rev = select(a.rev || "", [["", t("None")], ...(p.revisions || []).map((r) => [r.id, `${r.name || r.seq} — ${r.description}`])]); rows.push(field(t("Revision"), set.rev)); }
  if (k === "radius") { set.diameter = checkbox(!!a.diameter, t("Diameter")); rows.push(set.diameter); }
  if (["dim", "dimlin", "chain", "arclen"].includes(k)) { set.offset = input(Math.round(a.offset || 0), { type: "number" }); rows.push(field(t("Offset (mm)"), set.offset)); }
  if (!rows.length) rows.push(h("p", { class: "field-hint" }, t("Drag the annotation or its handles to change it.")));
  const r = await modal({ icon: "text", title: t("Annotation properties"), width: 480, body: h("div", { class: "form-grid" }, ...rows.map((x) => (x.classList && x.classList.contains("check") ? h("div", { class: "field span2" }, x) : x))), buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  const chk = (el) => el.querySelector("input").checked;
  app.store.edit(t("Annotation properties"), (pr) => {
    const q = pr.annotations.find((x) => x.id === a.id);
    if (!q) return false;
    if (set.text) q.text = set.text.value;
    if (set.size) q.size = Math.max(0.5, num(set.size.value, 2.5));
    if (set.key) q.key = set.key.value;
    if (set.showText) q.showText = chk(set.showText);
    if (set.template) q.template = set.template.value.replace(/\\n/g, "\n") || undefined;
    if (set.leader) { q.leader = chk(set.leader); if (q.leader && !q.dx && !q.dy) { q.dx = 1000; q.dy = -800; } }
    if (set.sym) { q.sym = set.sym.value; q.size = num(set.size.value, 10); q.rot = num(set.rot.value, 0); }
    if (set.pattern) { q.pattern = set.pattern.value; q.color = set.color.value; q.border = set.border.value; }
    if (set.style) q.style = set.style.value;
    if (set.rev) q.rev = set.rev.value || null;
    if (set.diameter) q.diameter = chk(set.diameter);
    if (set.offset) q.offset = num(set.offset.value, q.offset);
    return true;
  });
}

export async function tagAllDialog(app, viewId, run) {
  const cats = [["rooms", "Rooms"], ["openings", "Doors and windows"], ["walls", "Walls"], ["furniture", "Furniture"], ["columns", "Columns"]];
  const boxes = cats.map(([k, l]) => { const c = checkbox(k === "rooms" || k === "openings", t(l)); c.dataset.cat = k; return c; });
  const r = await modal({ icon: "label", title: t("Tag all not tagged"), width: 420, body: h("div", { class: "check-col" }, h("p", { class: "field-hint" }, t("Adds a tag to every visible element of the ticked categories that has none in this view.")), ...boxes), buttons: [{ label: t("Cancel"), value: null }, { label: t("Tag"), value: "ok", primary: true }] });
  if (r !== "ok") return;
  run(boxes.filter((b) => b.querySelector("input").checked).map((b) => b.dataset.cat));
  void DEFAULT_TAG;
}

export async function lineStylesDialog(app) {
  let list = JSON.parse(JSON.stringify(app.store.project.lineStyles || LINE_STYLES));
  const body = h("div");
  const draw = () => {
    body.innerHTML = "";
    const tb = h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Name", "Weight (mm)", "Colour", "Pattern", ""].map((x) => h("th", {}, x ? t(x) : "")))));
    const tbody = h("tbody");
    list.forEach((s, i) => tbody.append(h("tr", {},
      h("td", {}, input(s.name, { onInput: (v) => { s.name = v; } })),
      h("td", {}, input(s.weight, { type: "number", step: "0.05", onInput: (v) => { s.weight = Math.max(0.05, +v || 0.18); } })),
      h("td", {}, input(s.color, { type: "color", onInput: (v) => { s.color = v; } })),
      h("td", {}, select(s.pattern, [["solid", t("Solid")], ["dash", t("Dashed")], ["dashdot", t("Dash-dot")], ["dot", t("Dotted")]], { onChange: (v) => { s.pattern = v; } })),
      h("td", {}, LINE_STYLES.some((x) => x.id === s.id) ? "" : h("button", { class: "icon-btn", html: icon("trash", 13), onclick: () => { list.splice(i, 1); draw(); } })))));
    tb.append(tbody);
    body.append(tb, h("button", { class: "btn small", onclick: () => { list.push({ id: uid("ls"), name: t("New line style"), weight: 0.25, color: "#000000", pattern: "solid" }); draw(); } }, t("Add line style")));
  };
  draw();
  const r = await modal({ icon: "line", title: t("Line styles"), width: 620, body, buttons: [{ label: t("Cancel"), value: null }, { label: t("OK"), value: "ok", primary: true }] });
  if (r === "ok") app.store.edit(t("Line styles"), (p) => { p.lineStyles = list; });
}
