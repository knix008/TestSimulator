// The furniture library in the left panel of the plan: search, category chips
// (each with its icon), favourites, recently used, my library (items people
// register, src/ui/userlib.js), the project's own library items and imported
// models, and the built-in catalogue. Items show as tiles with their 3D
// picture (assets/furniture/thumbs.webp, made by npm run build:furniture) or
// as rows. Click: place (built-in items follow the pointer), drag onto the
// plan: place there, right-click: more. Every row of chips and tiles is
// filled to the panel's edge (the last ones in a row stretch).

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, panelHead, contextMenu, toast } from "./widgets.js";
import { allFurniture, furnitureDef, FURNITURE_CATEGORIES } from "../lib/furniture.js";
import * as userlib from "./userlib.js";

export const CATEGORY_ICONS = {
  all: "catAll", fav: "star", mine: "userLib", recent: "history", project: "folder", models: "model3d",
  Living: "sofa", Dining: "catDining", Kitchen: "catKitchen", Bedroom: "catBed", Kids: "catKids", Bathroom: "catBath",
  Office: "catOffice", Electronics: "catTv", Lighting: "bulb", Decor: "catDecor", Plants: "catPlant", Outdoor: "catOutdoor",
  Vehicles: "catCar", People: "catPerson", Commercial: "catShop", Restaurant: "catRestaurant", Healthcare: "catHealth",
  School: "catSchool", Fitness: "catFitness", Building: "building", Other: "catOther",
};
export const categoryIcon = (key) => CATEGORY_ICONS[key] || "furniture";

const state = { query: "", category: "" };

// ---------------------------------------------------------------- 3D thumbnails (one sprite)
const SPRITE = "assets/furniture/thumbs.webp";
let sprite = null; // {cols, w, h, index}
let spriteLoading = null;
function loadSprite(app) {
  if (sprite || spriteLoading || typeof fetch !== "function") return;
  spriteLoading = fetch("assets/furniture/thumbs.json").then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.index) return;
    sprite = j;
    if (app.tab === "plan" && app.renderLeft) app.renderLeft();
  }).catch(() => {});
}
// A thumbnail element of a built-in kind (sprite cell scaled to w × h), or
// the plan symbol when the sprite does not have it.
export function kindThumb(app, kind, w, hh, fallback) {
  const i = sprite ? sprite.index[kind] : undefined;
  if (i === undefined) return fallback(kind, w, hh, app.themeName());
  const k = w / sprite.w;
  const col = i % sprite.cols, row = Math.floor(i / sprite.cols);
  return h("span", { class: "lib-thumb", style: { width: `${w}px`, height: `${hh}px`, backgroundImage: `url(${SPRITE})`, backgroundSize: `${sprite.cols * sprite.w * k}px auto`, backgroundPosition: `${-col * sprite.w * k}px ${-row * sprite.h * k}px` } });
}

// ---------------------------------------------------------------- chips
// The natural width of the widest chip (they stretch to fill their rows).
export function chipNaturalWidth(chips) {
  let w = 0;
  for (const c of chips.children) {
    const flex = c.style.flex;
    c.style.flex = "none";
    w = Math.max(w, c.getBoundingClientRect().width);
    c.style.flex = flex;
  }
  return Math.ceil(w);
}

// ---------------------------------------------------------------- the panel
// renderLibrary(app, host, {groupBox, thumb, rerender}) — groupBox(list, key, title, count, unfold) → box (panels.js)
export function renderLibrary(app, host, { groupBox, thumb, rerender }) {
  loadSprite(app);
  const p = app.store.project;
  const st = app.settings;
  const tiles = st.libView !== "rows";
  const fav = new Set(st.favFurniture || []);
  const btn = (ic, title, onclick, attrs = {}) => h("button", { class: "icon-btn", title, html: icon(ic, 15), onclick, ...attrs });
  const panel = h("div", { class: "panel grow" });
  panel.append(panelHead("sofa", t("Furniture library"), h("div", { class: "grow" }),
    btn("libraryAdd", t("Register the selection in my library…"), () => userlib.registerSelection(app), { "data-lib": "register" }),
    btn(tiles ? "viewRows" : "viewTiles", tiles ? t("Show as a list") : t("Show as pictures"), () => { app.setSetting("libView", tiles ? "rows" : "tiles"); rerender(); }, { "data-lib": "view" }),
    btn("dots", t("Library menu"), (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      contextMenu([
        { label: t("Register the selection in my library…"), icon: "libraryAdd", action: () => userlib.registerSelection(app) },
        { label: t("Register a 3D model file in my library…"), icon: "model3d", action: () => userlib.registerModelFile(app) },
        "-",
        { label: t("Import 3D model (OBJ, FBX, GLB, STL…)…"), icon: "import", action: () => app.run("file.importModel") },
        "-",
        { label: t("Export my library…"), icon: "export", action: () => userlib.exportLibrary(app), disabled: !userlib.userEntries(app).length },
        { label: t("Import a library…"), icon: "import", action: () => userlib.importLibrary(app) },
      ], r.left, r.bottom + 2);
    }, { "data-lib": "menu" })));
  const search = h("input", { placeholder: t("Search (sofa, bed, toilet…)"), value: state.query });
  panel.append(h("div", { class: "search" }, h("span", { html: icon("search", 15) }), search));
  const chips = h("div", { class: "chips" });
  const mine = userlib.userEntries(app);
  const cats = [["", t("All"), "all"], ["fav", t("Favourites"), "fav"], ["mine", t("My library"), "mine"], ...FURNITURE_CATEGORIES.map((c) => [c, t(c), c])];
  for (const [key, label, ic] of cats) {
    chips.append(h("button", { class: `chip ${state.category === key ? "on" : ""}`, "data-chip": key || "all", title: label, onclick: () => { state.category = key; rerender(); } },
      h("span", { class: "chip-ico", html: icon(categoryIcon(ic), 13) }), h("span", { class: "chip-label" }, label)));
  }
  panel.append(chips);
  requestAnimationFrame(() => { const w = chipNaturalWidth(chips); if (w) chips.style.setProperty("--chip-w", `${w + 2}px`); });
  const list = h("div", { class: `lib-list ${tiles ? "tiles" : "rows"}` });
  panel.append(list);
  host.append(panel);

  // One library item: a built-in kind, a user / project entry, or a project model.
  const tile = (o) => {
    const el = h("div", { class: tiles ? "lib-item lib-tile" : "lib-item", draggable: "true", "data-kind": o.key, title: o.tip });
    const pic = o.thumbUrl ? h("img", { class: "lib-thumb", src: o.thumbUrl, alt: "", draggable: "false", style: tiles ? { width: "80px", height: "64px" } : { width: "44px", height: "35px" } })
      : o.kind ? kindThumb(app, o.kind, tiles ? 80 : 44, tiles ? 64 : 35, thumb)
        : h("span", { class: "lib-thumb lib-ico", html: icon(o.icon || "model3d", tiles ? 34 : 24) });
    const star = h("button", { class: `lib-fav ${fav.has(o.key) ? "on" : ""}`, title: fav.has(o.key) ? t("Remove from favourites") : t("Add to favourites"), html: icon(fav.has(o.key) ? "starFill" : "star", 13), "data-fav": o.key });
    star.addEventListener("click", (e) => { e.stopPropagation(); toggleFav(o.key); });
    if (tiles) el.append(pic, h("div", { class: "nm" }, o.name), star);
    else el.append(pic, h("div", {}, h("div", { class: "nm" }, o.name), h("div", { class: "ds" }, o.sub)), star);
    el.addEventListener("click", () => o.place());
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/x-myarch-furniture", o.key); e.dataTransfer.effectAllowed = "copy"; });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); contextMenu(o.menu(), e.clientX, e.clientY); });
    return el;
  };
  const toggleFav = (key) => {
    const s = new Set(st.favFurniture || []);
    if (s.has(key)) s.delete(key); else s.add(key);
    app.setSetting("favFurniture", [...s]);
    rerender();
  };
  const favItem = (key) => ({ label: fav.has(key) ? t("Remove from favourites") : t("Add to favourites"), icon: fav.has(key) ? "starFill" : "star", action: () => toggleFav(key) });
  const builtIn = (d) => ({
    key: d.kind, kind: d.kind, name: t(d.name), sub: `${d.w} × ${d.d} × ${d.h}`, tip: `${t(d.name)} — ${d.w} × ${d.d} × ${d.h} mm`,
    place: () => { app.setTab("plan"); app.plan.setTool("furniture", { kind: d.kind }); app.plan.canvas.focus(); },
    menu: () => [{ label: t("Place"), icon: "plus", action: () => { app.setTab("plan"); app.plan.setTool("furniture", { kind: d.kind }); } }, favItem(d.kind)],
  });
  const entryItem = (e, own) => ({
    key: `user:${e.id}`, thumbUrl: e.thumb, icon: "userLib", name: e.name, sub: `${t(e.cat)} · ${e.w} × ${e.d} × ${e.h}`, tip: `${e.name} — ${t(e.cat)} · ${e.w} × ${e.d} × ${e.h} mm${e.items.length > 1 ? ` · ${t("{n} items", { n: e.items.length })}` : ""}`,
    place: () => userlib.placeEntry(app, e),
    menu: () => own
      ? [{ label: t("Place"), icon: "plus", action: () => userlib.placeEntry(app, e) }, favItem(`user:${e.id}`), "-",
        { label: t("Name and category…"), icon: "text", action: () => userlib.editEntry(app, e) },
        { label: t("Draw the picture again"), icon: "refresh", action: () => userlib.refreshThumb(app, e) }, "-",
        { label: t("Delete from my library"), icon: "trash", danger: true, action: () => userlib.deleteEntry(app, e) }]
      : [{ label: t("Place"), icon: "plus", action: () => userlib.placeEntry(app, e) }, { label: t("Save to my library"), icon: "libraryAdd", action: () => userlib.adoptEntry(app, e) }],
  });
  const modelItem = (m) => ({
    key: `model:${m.id}`, icon: "model3d", name: m.name, sub: `${(m.format || "").toUpperCase()} · ${m.size.map((v) => Math.round(v)).join(" × ")}`, tip: `${m.name} — ${m.size.map(Math.round).join(" × ")} mm`,
    place: () => { app.setTab("plan"); app.plan.setTool("furniture", { kind: "model", model: m.id }); },
    menu: () => [{ label: t("Place"), icon: "plus", action: () => { app.setTab("plan"); app.plan.setTool("furniture", { kind: "model", model: m.id }); } },
      { label: t("Register in my library…"), icon: "libraryAdd", action: () => registerProjectModel(app, m) }],
  });
  const byKey = (key) => {
    if (key.startsWith("user:")) { const e = userlib.findEntry(app, key.slice(5)); return e ? entryItem(e, mine.some((x) => x.id === e.id)) : null; }
    const d = furnitureDef(key);
    return d ? builtIn(d) : null;
  };

  const fill = () => {
    list.innerHTML = "";
    const q = state.query.trim().toLowerCase();
    const match = (s) => !q || s.toLowerCase().includes(q);
    const cat = state.category;
    const groups = []; // [key, title, items]
    if (!q && !cat) {
      const favs = [...fav].map(byKey).filter(Boolean);
      if (favs.length) groups.push(["fav", t("Favourites"), favs]);
      const recent = (st.recentFurniture || []).map(byKey).filter(Boolean);
      if (recent.length) groups.push(["recent", t("Recently used"), recent]);
    }
    if (cat === "fav") groups.push(["fav", t("Favourites"), [...fav].map(byKey).filter(Boolean).filter((o) => match(`${o.name} ${o.key}`))]);
    // My library (grouped by their categories when it is the chosen chip).
    const mineHit = mine.filter((e) => match(`${e.name} ${e.cat} ${t(e.cat)}`) && (!cat || cat === "mine" || cat === e.cat));
    if (cat === "mine") {
      const byCat = new Map();
      for (const e of mineHit) { if (!byCat.has(e.cat)) byCat.set(e.cat, []); byCat.get(e.cat).push(entryItem(e, true)); }
      for (const [c, items] of byCat) groups.push([`mine:${c}`, `${t("My library")} · ${t(c)}`, items]);
    } else if (mineHit.length && cat !== "fav") groups.push(["mine", t("My library"), mineHit.map((e) => entryItem(e, true))]);
    // This project's library items that are not in mine (made on another computer).
    const proj = userlib.projectEntries(p).filter((e) => !mine.some((m) => m.id === e.id) && match(`${e.name} ${e.cat}`) && (!cat || cat === e.cat || cat === "mine"));
    if (proj.length && cat !== "fav") groups.push(["project", t("This project's library items"), proj.map((e) => entryItem({ ...e, models: p.models }, false))]);
    if (cat !== "fav" && cat !== "mine") {
      const byCat = new Map();
      for (const d of allFurniture()) {
        if (cat && d.cat !== cat) continue;
        if (q && !`${d.kind} ${d.name} ${t(d.name)} ${d.cat} ${t(d.cat)} ${d.tags || ""}`.toLowerCase().includes(q)) continue;
        if (!byCat.has(d.cat)) byCat.set(d.cat, []);
        byCat.get(d.cat).push(builtIn(d));
      }
      for (const [c, items] of byCat) groups.push([c, t(c), items]);
      const models = p.models.filter((m) => match(m.name));
      if (models.length && !cat) groups.push(["models", t("Imported 3D models"), models.map(modelItem)]);
    }
    const unfold = !!q || !!cat;
    for (const [key, title, items] of groups) {
      if (!items.length) continue;
      const box = groupBox(list, key, title, items.length, unfold, categoryIcon(key.split(":")[0]));
      const wrap = tiles ? h("div", { class: "lib-tiles" }) : box;
      if (tiles) box.append(wrap);
      for (const o of items) wrap.append(tile(o));
    }
    if (!list.children.length) list.append(h("div", { class: "empty-note" }, t("Nothing matches. Try another word, or import a 3D model.")));
  };
  search.addEventListener("input", () => { state.query = search.value; fill(); });
  search.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { const first = list.querySelector(".lib-item"); if (first) first.click(); } });
  fill();
  bindCanvasDrop(app);
}

// An imported model of this project → my library (at the size it is placed at, if it is).
function registerProjectModel(app, m) {
  const f = app.store.project.furniture.find((x) => x.kind === "model" && x.model === m.id) || { kind: "model", model: m.id, name: m.name, x: 0, y: 0, rot: 0, w: Math.round(m.size[0]), d: Math.round(m.size[1]), h: Math.round(m.size[2]), elevation: 0 };
  return userlib.registerItems(app, [f], [m]);
}

// Drops from the library onto the plan: built-in kinds follow the furniture
// tool's placing (snap, mounting); library entries land where they are dropped.
let dropBound = false;
function bindCanvasDrop(app) {
  if (dropBound) return;
  dropBound = true;
  const canvas = app.plan.canvas;
  canvas.addEventListener("dragover", (e) => {
    if ([...e.dataTransfer.types].includes("text/x-myarch-furniture")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  });
  canvas.addEventListener("drop", (e) => {
    const key = e.dataTransfer.getData("text/x-myarch-furniture");
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    const r = canvas.getBoundingClientRect();
    const [wx, wy] = app.plan.vp.toWorld(e.clientX - r.left, e.clientY - r.top);
    if (key.startsWith("user:")) {
      const entry = userlib.findEntry(app, key.slice(5));
      if (entry) userlib.placeEntry(app, entry.models && entry.models.length ? entry : { ...entry, models: app.store.project.models.filter((m) => entry.items.some((f) => f.model === m.id)) }, [wx, wy]);
      else toast(t("This library item is gone."), "warn");
      return;
    }
    if (key.startsWith("model:")) { app.plan.setTool("furniture", { kind: "model", model: key.slice(6) }); app.plan.pointerPlace("down", { button: 0, shiftKey: false }, wx, wy); return; }
    app.plan.setTool("furniture", { kind: key });
    app.plan.pointerPlace("down", { button: 0, shiftKey: false }, wx, wy);
  });
}
