// Material picker: a button with the material's swatch and name that opens a
// panel of swatches grouped by library category (MATERIAL_CATEGORIES), with a
// search box and the recently used materials on top.
//
// It behaves like a <select> for the code around it: `.value` reads / sets the
// material id and picking one fires a "change" event, so bindField() and
// friends need no special handling.

import { h, closeMenus } from "./widgets.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { MATERIALS, MATERIAL_CATEGORIES, materialById, paintPattern, projectMaterials } from "../lib/materials.js";

const thumbs = new Map();
// A small picture of the material (its pattern, or the plain colour).
export function materialThumb(m, size = 40) {
  if (!m) return "";
  const key = `${m.id}:${m.color}:${m.pattern || ""}:${size}:${m.src ? m.src.length : ""}`;
  if (thumbs.has(key)) return thumbs.get(key);
  let url = "";
  if (m.src) url = m.src;
  else if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = size * 2; // crisp on high-density screens
    const g = c.getContext("2d");
    if (g) { paintPattern(g, m, size * 2); url = c.toDataURL(); }
  }
  thumbs.set(key, url);
  return url;
}

const RECENT_KEY = "myarch.recentMaterials";
function recent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function remember(id) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 10))); } catch { /* storage off */ }
}

// The materials offered for `uses` (["wall"], ["floor"] …; empty = all):
// the project's own first, then the library.
export function pickerMaterials(uses = []) {
  const fits = (m) => !uses.length || (m.use || []).some((u) => uses.includes(u));
  const own = projectMaterials().filter((m) => m.custom);
  return [...own.map((m) => ({ ...m, cat: "project" })), ...MATERIALS.filter(fits)];
}

const swatch = (m, cls = "mat-sw") => h("span", { class: cls, style: { backgroundImage: m ? `url("${materialThumb(m)}")` : "", backgroundColor: m ? m.color : "transparent" } });

// none: a label for the empty value ("" = from the type …), offered first.
export function materialPicker(value, { uses = [], onChange, title = "", none = null } = {}) {
  let current = value || "";
  const label = h("span", { class: "mat-name" });
  const sw = h("span", { class: "mat-sw" });
  const btn = h("button", { class: "input mat-pick", type: "button", title }, sw, label, h("span", { class: "mat-caret", html: icon("chevronDown", 12) }));
  const show = () => {
    const m = materialById(current) || (/^#[0-9a-f]{6}$/i.test(current) ? { id: current, name: current, color: current } : null);
    sw.style.backgroundImage = m ? `url("${materialThumb(m)}")` : "";
    sw.style.backgroundColor = m ? m.color : "transparent";
    label.textContent = m ? t(m.name) : !current && none ? none : current || "—";
    btn.title = title || label.textContent;
  };
  Object.defineProperty(btn, "value", { get: () => current, set: (v) => { current = v || ""; show(); }, configurable: true });
  show();
  const pick = (id) => {
    closeMenus();
    if (id === current) return;
    current = id;
    remember(id);
    show();
    btn.dispatchEvent(new Event("change"));
    if (onChange) onChange(id, btn);
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); openPanel(btn, uses, () => current, pick, none); });
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); openPanel(btn, uses, () => current, pick, none); } });
  return btn;
}

function openPanel(anchor, uses, get, pick, none) {
  closeMenus();
  const list = pickerMaterials(uses);
  const cats = [["all", t("All")], ...(list.some((m) => m.cat === "project") ? [["project", t("Project")]] : []), ...MATERIAL_CATEGORIES.filter(([c]) => list.some((m) => m.cat === c)).map(([c, n]) => [c, t(n)])];
  let cat = "all";
  const search = h("input", { class: "input mat-search", type: "search", placeholder: t("Search materials…"), spellcheck: "false" });
  const chips = h("div", { class: "mat-cats" });
  const grid = h("div", { class: "mat-grid" });
  const panel = h("div", { class: "ctx-menu mat-pop", role: "listbox" }, search, chips, grid);
  const tile = (m) => {
    const b = h("button", { class: `mat-tile ${m.id === get() ? "on" : ""}`, type: "button", title: t(m.name), "data-mat": m.id, role: "option" }, swatch(m, "mat-sw big"), h("span", { class: "mat-tile-name" }, t(m.name)));
    b.addEventListener("click", () => pick(m.id));
    return b;
  };
  const draw = () => {
    chips.innerHTML = "";
    for (const [c, name] of cats) {
      const b = h("button", { class: `mat-cat ${c === cat ? "on" : ""}`, type: "button", "data-cat": c }, name);
      b.addEventListener("click", () => { cat = c; draw(); });
      chips.append(b);
    }
    grid.innerHTML = "";
    const q = search.value.trim().toLowerCase();
    const match = (m) => !q || t(m.name).toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.id.includes(q);
    const shown = list.filter((m) => (cat === "all" || m.cat === cat) && match(m));
    if (cat === "all" && !q) {
      if (none) {
        const b = h("button", { class: `mat-tile none ${get() === "" ? "on" : ""}`, type: "button", "data-mat": "", role: "option" }, h("span", { class: "mat-sw big", html: icon("close", 16) }), h("span", { class: "mat-tile-name" }, none));
        b.addEventListener("click", () => pick(""));
        grid.append(b);
      }
      const rec = recent().map((id) => list.find((m) => m.id === id)).filter(Boolean).slice(0, 8);
      if (rec.length) { grid.append(h("div", { class: "mat-head" }, t("Recently used")), ...rec.map(tile)); }
      for (const [c, name] of cats.slice(1)) {
        const group = shown.filter((m) => m.cat === c);
        if (group.length) grid.append(h("div", { class: "mat-head" }, name), ...group.map(tile));
      }
    } else grid.append(...shown.map(tile));
    if (!grid.children.length) grid.append(h("div", { class: "empty-note" }, t("No match")));
  };
  search.addEventListener("input", draw);
  search.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") closeMenus();
    if (e.key === "Enter") { const first = grid.querySelector(".mat-tile"); if (first) pick(first.dataset.mat); }
  });
  draw();
  // In the window of the button (a dialog window or the main one).
  const doc = anchor.ownerDocument || document;
  const view = doc.defaultView || window;
  doc.body.append(panel);
  const r = anchor.getBoundingClientRect(), pr = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(6, Math.min(r.right - pr.width, view.innerWidth - pr.width - 6))}px`;
  const below = r.bottom + 4;
  panel.style.top = `${below + pr.height > view.innerHeight - 6 ? Math.max(6, r.top - pr.height - 4) : below}px`;
  const on = grid.querySelector(".mat-tile.on");
  if (on) on.scrollIntoView({ block: "nearest" });
  search.focus();
  setTimeout(() => doc.addEventListener("pointerdown", outside, true), 0);
  function outside(e) {
    if (!panel.isConnected) { doc.removeEventListener("pointerdown", outside, true); return; }
    if (!panel.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenus();
  }
  panel._outside = outside;
  panel._doc = doc;
  return panel;
}
