// MySketchBook's parametric items in this app's 3D view: the builders
// (src/lib/sketchbook, ~2,100 items) load once, when the first such item is
// shown; each item is built once at its default size and shared (clone) by
// every copy, scaled to the copy's width / depth / height. Materials are
// MySketchBook's presets, which this app has too (makeMaterials().surface).
// Item frame here: x across, y up, z = front (+) — the same as MySketchBook's.

let lib = null; // { sbItem }
let loading = null;

/** Loads the builders (once). */
export function loadSb() {
  if (lib) return Promise.resolve(lib);
  if (!loading) loading = import("../lib/sketchbook/index.js").then((m) => { lib = m; return m; });
  return loading;
}
export const sbLoaded = () => !!lib;
export const sbIdOf = (kind) => (typeof kind === "string" && kind.startsWith("sb-") ? kind.slice(3) : null);

// Per material set (a viewer's or the thumbnail renderer's makeMaterials(): they are disposed with it):
// item id → Object3D at the default size, centred, floor at y 0.
const templatesOf = new WeakMap();

// What MySketchBook's builders get: materials from this app's set (cached per build).
function buildCtx(THREE, mats, wallThickness = 0.2) {
  const cache = new Map();
  return {
    quality: "high", wallThickness,
    material: (mid, overrides) => {
      const k = overrides ? `${mid}|${JSON.stringify(overrides)}` : mid;
      if (cache.has(k)) return cache.get(k);
      let m = mats.surface(mid, "#b8b0a4");
      if (overrides && overrides.color !== undefined) { m = m.clone(); m.color = new THREE.Color(overrides.color); }
      cache.set(k, m);
      return m;
    },
  };
}

function template(THREE, mats, id) {
  let templates = templatesOf.get(mats);
  if (!templates) templatesOf.set(mats, (templates = new Map()));
  const key = id;
  if (templates.has(key)) return templates.get(key);
  const it = lib && lib.sbItem(id);
  if (!it) return null;
  const ctx = buildCtx(THREE, mats);
  let obj;
  try { obj = it.build({}, ctx); } catch (e) { console.warn(`sketchbook item ${id}:`, e); obj = null; }
  if (obj) {
    // Centred on x / z, standing on y 0 (as this app's own furniture).
    const box = new THREE.Box3().setFromObject(obj);
    const holder = new THREE.Group();
    obj.position.x -= (box.min.x + box.max.x) / 2;
    obj.position.z -= (box.min.z + box.max.z) / 2;
    obj.position.y -= box.min.y;
    holder.add(obj);
    holder.userData.size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
    // "lamp" is this app's lamp marker (build.js, viewer.js): a MySketchBook part of that name is renamed.
    holder.traverse((c) => { if (c.name === "lamp") c.name = "sb-lamp"; if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.sharedGeometry = true; } });
    obj = holder;
  }
  // A full cache is emptied with its geometry freed (the thumbnails build ~2,100 items in one page: without this
  // their buffers pile up until the page stalls). Copies in a model share it: a model is built again after this.
  if (templates.size > 200) { for (const tp of templates.values()) if (tp) tp.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); templates.clear(); }
  templates.set(key, obj);
  return obj;
}

/**
 * The 3D model of furniture item `f` (an "sb-" kind) at its width / depth / height (mm), or null while the
 * builders are not loaded yet (loadSb() then build again) or the item is unknown.
 */
export function sbGroup(THREE, mats, f) {
  const id = sbIdOf(f.kind);
  if (!id || !lib) return null;
  const tpl = template(THREE, mats, id);
  if (!tpl) return null;
  const g = tpl.clone();
  const [sx, sy, sz] = tpl.userData.size;
  g.scale.set((f.w / 1000) / (sx || 1) * (f.mirrored ? -1 : 1), (f.h / 1000) / (sy || 1), (f.d / 1000) / (sz || 1));
  const out = new THREE.Group();
  out.add(g);
  return out;
}

// Doors and windows built for their opening (per material set): key → Object3D, a few hundred at most.
const openingsOf = new WeakMap();

/**
 * A MySketchBook door or window (opening.item "sb-<id>") built for its hole: width × height (mm), the wall's
 * thickness, how far it is open (`angle`, degrees 0…90: a hinged leaf turns that far, a sliding or folding one
 * opens that share) and the hinge side (`right`). Item frame: x along the wall, y up from the sill, +z the side it
 * opens to. Null while the builders are not loaded (loadSb()) or the item is unknown.
 */
export function sbOpening(THREE, mats, kind, { width, height, wallThickness, angle = 0, right = false }) {
  const id = sbIdOf(kind);
  if (!id || !lib) return null;
  const it = lib.sbItem(id);
  if (!it) return null;
  const has = (k) => (it.params || []).find((q) => q.key === k);
  const params = { width: width / 1000, height: height / 1000 };
  const op = has("open");
  if (op) params.open = (op.max ?? 1) > 2 ? Math.min(op.max ?? 90, angle) : (op.max ?? 1) * Math.min(1, angle / 90);
  if (has("hinge")) params.hinge = right ? "right" : "left";
  let made = openingsOf.get(mats);
  if (!made) openingsOf.set(mats, (made = new Map()));
  const key = `${id}|${Math.round(width)}|${Math.round(height)}|${Math.round(wallThickness)}|${params.open ?? ""}|${params.hinge ?? ""}`;
  if (!made.has(key)) {
    let obj = null;
    try { obj = it.build(params, buildCtx(THREE, mats, wallThickness / 1000)); } catch (e) { console.warn(`sketchbook opening ${id}:`, e); }
    if (obj) obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.sharedGeometry = true; } });
    if (made.size > 300) { for (const o of made.values()) if (o) o.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); made.clear(); }
    made.set(key, obj);
  }
  const tpl = made.get(key);
  return tpl ? tpl.clone() : null;
}
