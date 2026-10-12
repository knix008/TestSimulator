// The SketchUp-style layer of the 3D viewer (viewer.js creates it and hands
// over its internals as `ctx`):
//
//  · inference — the pointer snaps to endpoints, midpoints, edges, faces,
//    guides and the red / green / blue axes from the last point; Shift locks
//    the current direction, the arrow keys lock an axis (→ red, ← green,
//    ↑ ↓ blue); typed numbers go to the measurements box (VCB) and Enter
//    applies them (3000, 3m, 2000,1500, x5, /4, 24s …);
//  · tools — line, rectangle, circle, polygon, arc, push/pull on any face,
//    move / copy (arrays), rotate, scale, offset, follow me, eraser, tape
//    measure with guides, protractor, 3D dimensions and text, axes, section
//    planes, position camera, sandbox smoove and component placement. Every
//    tool works click-move-click (a left drag still orbits); push/pull and
//    smoove also work by dragging. The layer only previews: the edits go to
//    the 3D tab as {type: "sk", op, …} events (src/ui/skui.js);
//  · the model's guides, 3D dimensions and text, section planes with a
//    filled cut (stencil caps), custom drawing axes, profile lines (thick
//    silhouettes), colour by tag, two-point perspective and the watermark.
//
// Points handed out are plan millimetres with an absolute z: [x, y, z].

import { LineSegments2 } from "../vendor/three/addons/LineSegments2.js";
import { LineSegmentsGeometry } from "../vendor/three/addons/LineSegmentsGeometry.js";
import { LineMaterial } from "../vendor/three/addons/LineMaterial.js";
import { solidMesh, faceLoops, loopPts, planeBasis, to2, add as add3, mul as mul3, dot as dot3, faceNormal } from "../core/mesh.js";
import { offsetPolygon } from "../core/geom.js";
import { componentById } from "../core/skmodel.js";
import { instanceToWorld } from "../core/skops.js";

const M = 0.001;
const DRAW = new Set(["line", "rect", "circle", "polygon", "arc"]);
export const SK_TOOLS = new Set([...DRAW, "move", "rotate", "scale", "offset", "followme", "eraser", "protractor", "dimension", "text3d", "axes", "sectionplane", "position", "smoove", "place", "tape"]);
const COLORS = { endpoint: 0x00c853, midpoint: 0x00b8d4, edge: 0xff1744, face: 0x2979ff, guide: 0xff9100, axisX: 0xff3d3d, axisY: 0x2ecc40, axisZ: 0x2f7bff, ground: 0x9aa4b5, chain: 0x00c853, intersection: 0x111111 };
// t() only marks the strings for the translation check; the 3D tab translates.
const t = (s) => s;
const LABELS = { endpoint: t("Endpoint"), midpoint: t("Midpoint"), edge: t("On edge"), face: t("On face"), guide: t("On guide"), axisX: t("On red axis"), axisY: t("On green axis"), axisZ: t("On blue axis"), ground: "", chain: t("Endpoint"), intersection: t("Intersection") };

// Lengths typed in the measurements box: 3000 (mm), 3m, 30cm, 3,5m, 12' …
export function parseLength(s) {
  const m = String(s).trim().replace(",", ".").match(/^(-?\d*\.?\d+)\s*(mm|cm|m|'|ft|"|in)?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const u = (m[2] || "mm").toLowerCase();
  return v * ({ mm: 1, cm: 10, m: 1000, "'": 304.8, ft: 304.8, '"': 25.4, in: 25.4 }[u] || 1);
}

export function createSketchupLayer(ctx) {
  const { THREE, scene, canvas, renderer, controls, opts } = ctx;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const cam = () => ctx.camera;
  const toPlan = (v) => [v.x / M, v.z / M, v.y / M];
  const toWorld = (q) => V(q[0] * M, q[2] * M, q[1] * M);
  const dirW = (n) => V(n[0], n[2], n[1]).normalize();
  const dirP = (v) => [v.x, v.z, v.y];
  const project = () => ctx.project;
  const tr = (s) => (ctx.t && s ? ctx.t(s) : s);

  const overlay = new THREE.Group(); overlay.name = "sk-overlay"; scene.add(overlay);
  const notes = new THREE.Group(); notes.name = "sk-notes"; scene.add(notes);
  const caps = new THREE.Group(); caps.name = "sk-caps"; scene.add(caps);
  const profiles = new THREE.Group(); profiles.name = "sk-profiles"; scene.add(profiles);
  const host = canvas.parentElement || document.body;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  const tip = document.createElement("div");
  tip.className = "sk-tip";
  Object.assign(tip.style, { position: "absolute", pointerEvents: "none", padding: "2px 6px", borderRadius: "4px", font: "12px 'Segoe UI', sans-serif", background: "rgba(20,24,32,0.85)", color: "#fff", display: "none", zIndex: 5, whiteSpace: "nowrap" });
  host.append(tip);
  const mark = document.createElement("div");
  mark.className = "sk-watermark";
  Object.assign(mark.style, { position: "absolute", pointerEvents: "none", font: "600 18px 'Segoe UI', sans-serif", color: "rgba(255,255,255,0.75)", textShadow: "0 1px 3px rgba(0,0,0,0.6)", display: "none", zIndex: 4 });
  host.append(mark);

  let st = null; // the running tool's state
  let push = null; // push/pull or smoove in progress
  let downAt = null;
  let vcb = "";
  let axisLock = null; // "axisX" | "axisY" | "axisZ"
  let shiftLock = null; // {dir, kind}
  let editing = null; // {inst, def} — a component being edited in place
  let lastCopy = null; // {kind: "move" | "rotate", …} for x5 / 4x / /5 after a copy
  let lastPointer = null;
  let edgeCache = null;
  let screenCache = null;
  let lastHover = null;
  const emit = (ev) => ctx.emitTool({ type: "sk", ...ev });
  const dirty = () => ctx.markDirty();

  // ---------------------------------------------------------------- helpers
  function rectOf() { return canvas.getBoundingClientRect(); }
  function toScreen(v) {
    const q = v.clone().project(cam());
    const r = rectOf();
    return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height, z: q.z };
  }
  function axisDirs() {
    const ax = (project() && project().view && project().view.axes3d) || null;
    const a = ax ? ((ax.ang || 0) * Math.PI) / 180 : 0;
    // Plan x → world X, plan y → world Z (both turned by the custom axes), up = world Y.
    return { axisX: V(Math.cos(a), 0, Math.sin(a)), axisY: V(-Math.sin(a), 0, Math.cos(a)), axisZ: V(0, 1, 0) };
  }
  function rayAt(e) { return ctx.rayFrom(e.clientX, e.clientY).clone(); }
  function closestOnLine(ray, P, dir) {
    const w0 = P.clone().sub(ray.origin);
    const a = dir.dot(dir), b = dir.dot(ray.direction), c = ray.direction.dot(ray.direction), d = dir.dot(w0), e = ray.direction.dot(w0);
    const den = a * c - b * b;
    const t = Math.abs(den) < 1e-12 ? 0 : (b * e - c * d) / den;
    return P.clone().addScaledVector(dir, t);
  }
  function closestOnSeg(ray, A, B) {
    const dir = B.clone().sub(A);
    const L2 = dir.lengthSq();
    if (L2 < 1e-12) return A.clone();
    const p = closestOnLine(ray, A, dir);
    const t = Math.max(0, Math.min(1, p.clone().sub(A).dot(dir) / L2));
    return A.clone().addScaledVector(dir, t);
  }
  function workY() { return ((opts.workZ || 0) * M); }
  function onPlane(ray, n, p) { const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p); return ray.intersectPlane(pl, V()); }

  // A raycast hit with what the tools need: id, kind, face (index into the
  // mesh of the mass or the component definition), world normal.
  function hitInfo(hit) {
    if (!hit) return null;
    const o = hit.object, ud = o.userData || {};
    const normal = hit.face ? hit.face.normal.clone().transformDirection(o.matrixWorld).normalize() : null;
    const face = ud.faceMap && hit.faceIndex !== undefined && hit.faceIndex !== null ? ud.faceMap[hit.faceIndex] : null;
    return { id: ud.id || null, kind: ud.kind || null, level: ud.level || null, comp: ud.comp || null, face: face ?? null, point: hit.point.clone(), normal, material: ud.material || null, dist: hit.distance };
  }
  // The face a hit points at as an edit target, or null.
  function faceRef(hi) {
    if (!hi || hi.face === null) return null;
    if (hi.kind === "solids") return { kind: "solids", id: hi.id, face: hi.face };
    if (hi.comp && editing && editing.inst === hi.id) return { kind: "comp", def: hi.comp, inst: hi.id, face: hi.face };
    return null;
  }
  // World loops (plan mm abs) of the face a ref points at.
  function refLoops(ref) {
    const p = project();
    if (!p || !ref) return null;
    if (ref.kind === "solids") {
      const s = p.solids.find((x) => x.id === ref.id);
      if (!s) return null;
      const m = solidMesh(s);
      const f = m.f[ref.face];
      if (!f) return null;
      const lv = p.levels.find((l) => l.id === s.level);
      const e = lv ? lv.elevation : 0;
      return faceLoops(f).map((l) => loopPts(m, l).map((q) => [q[0], q[1], q[2] + e]));
    }
    const def = componentById(p, ref.def);
    const inst = p.furniture.find((x) => x.id === ref.inst);
    if (!def || !inst || !def.mesh.f[ref.face]) return null;
    return faceLoops(def.mesh.f[ref.face]).map((l) => loopPts(def.mesh, l).map((q) => instanceToWorld(p, inst, def, q)));
  }

  // ---------------------------------------------------------------- overlay drawing
  function clearGroup(g) {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
  }
  function line(pts, color, { dashed = false, depth = false, width = 1, opacity = 1 } = {}) {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.15, depthTest: depth, transparent: opacity < 1, opacity, toneMapped: false })
      : new THREE.LineBasicMaterial({ color, depthTest: depth, transparent: opacity < 1, opacity, linewidth: width, toneMapped: false });
    const l = new THREE.Line(g, mat);
    if (dashed) l.computeLineDistances();
    l.renderOrder = 12;
    l.raycast = () => {};
    return l;
  }
  function loopLine(pts, color, opt) { return line([...pts, pts[0]], color, opt); }
  function marker(p, color) {
    const s = Math.max(0.02, p.distanceTo(cam().position) * 0.012);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false }));
    m.position.copy(p);
    m.renderOrder = 13;
    m.raycast = () => {};
    return m;
  }
  function showTip(e, text) {
    if (!text) { tip.style.display = "none"; return; }
    const r = host.getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = `${e.clientX - r.left + 14}px`;
    tip.style.top = `${e.clientY - r.top + 16}px`;
    tip.style.display = "block";
  }
  function hint(text) { emit({ op: "hint", text }); }
  const mm = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(2)} m` : `${Math.round(v)} mm`);

  // ---------------------------------------------------------------- inference
  // Edges of everything visible (world), rebuilt after each model change.
  function edges() {
    if (edgeCache) return edgeCache;
    const segs = [];
    const b = ctx.building;
    b.updateMatrixWorld(true);
    b.traverseVisible((o) => {
      if (segs.length > 120000) return;
      if (o.isMesh && o.geometry && o.geometry.attributes.position) {
        const eg = new THREE.EdgesGeometry(o.geometry, 20);
        const pos = eg.attributes.position;
        for (let i = 0; i < pos.count; i += 2) segs.push({ a: V().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld), b: V().fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld), id: o.userData.id, kind: o.userData.kind });
        eg.dispose();
      } else if (o.isLineSegments && o.userData.looseEdges) {
        const pos = o.geometry.attributes.position;
        const owner = o.parent ? o.parent.userData.id : null;
        for (let i = 0; i < pos.count; i += 2) segs.push({ a: V().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld), b: V().fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld), id: owner, kind: "solids", loose: true });
      }
    });
    edgeCache = segs;
    screenCache = null;
    return segs;
  }
  function screenSegs() {
    const c = cam();
    const key = `${c.matrixWorld.elements.map((v) => v.toFixed(5)).join(",")}|${c.projectionMatrix.elements[0].toFixed(5)}|${rectOf().width}`;
    if (screenCache && screenCache.key === key) return screenCache.list;
    const list = edges().map((s) => ({ s, A: toScreen(s.a), B: toScreen(s.b) }));
    screenCache = { key, list };
    return list;
  }
  function guidesWorld() {
    const p = project();
    return ((p && p.guides) || []).map((g) => ({ g, a: toWorld(g.a), b: g.b ? toWorld(g.b) : null }));
  }

  // → {p (world), kind, hit, seg?, axis?}
  function infer(e, { from = null, plane = null, extra = [] } = {}) {
    const ray = rayAt(e);
    const mx = e.clientX, my = e.clientY;
    const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY));
    const camPos = cam().position;
    const occluded = (p) => hi && p.distanceTo(camPos) > hi.dist + Math.max(0.05, hi.dist * 0.01);
    const locked = axisLock ? { dir: axisDirs()[axisLock], kind: axisLock } : shiftLock;
    if (from && locked) return { p: closestOnLine(ray, from, locked.dir), kind: locked.kind || "axisX", hit: hi, locked: true };
    // Points first: endpoints (and the points of the chain being drawn), midpoints.
    let best = null;
    const consider = (p, kind, d, more = {}) => { if (d < (best ? best.d : Infinity)) best = { p: p.clone(), kind, d, ...more }; };
    for (const q of extra) { const s = toScreen(q); const d = Math.hypot(s.x - mx, s.y - my); if (d < 10 && s.z < 1) consider(q, "chain", d); }
    const S = screenSegs();
    for (const it of S) {
      for (const [P, W] of [[it.A, it.s.a], [it.B, it.s.b]]) {
        if (P.z >= 1) continue;
        const d = Math.hypot(P.x - mx, P.y - my);
        if (d < 10 && !occluded(W)) consider(W, "endpoint", d, { seg: it.s });
      }
    }
    if (!best) {
      for (const it of S) {
        if (it.A.z >= 1 || it.B.z >= 1) continue;
        const mxp = (it.A.x + it.B.x) / 2, myp = (it.A.y + it.B.y) / 2;
        const d = Math.hypot(mxp - mx, myp - my);
        const W = it.s.a.clone().add(it.s.b).multiplyScalar(0.5);
        if (d < 9 && !occluded(W)) consider(W, "midpoint", d, { seg: it.s });
      }
    }
    if (best) return { ...best, hit: hi };
    // Then lines: edges, guides.
    let edge = null;
    for (const it of S) {
      if (it.A.z >= 1 || it.B.z >= 1) continue;
      const dx = it.B.x - it.A.x, dy = it.B.y - it.A.y;
      const L2 = dx * dx + dy * dy;
      if (L2 < 4) continue;
      const t = Math.max(0, Math.min(1, ((mx - it.A.x) * dx + (my - it.A.y) * dy) / L2));
      const d = Math.hypot(it.A.x + dx * t - mx, it.A.y + dy * t - my);
      if (d < 6 && (!edge || d < edge.d)) {
        const W = closestOnSeg(ray, it.s.a, it.s.b);
        if (!occluded(W)) edge = { p: W, kind: "edge", d, seg: it.s };
      }
    }
    if (edge) return { ...edge, hit: hi };
    for (const g of guidesWorld()) {
      if (!g.b) { const s = toScreen(g.a); if (Math.hypot(s.x - mx, s.y - my) < 10) return { p: g.a.clone(), kind: "guide", hit: hi }; continue; }
      const P = closestOnLine(ray, g.a, g.b.clone().sub(g.a).normalize());
      const s = toScreen(P);
      if (s.z < 1 && Math.hypot(s.x - mx, s.y - my) < 6 && !occluded(P)) return { p: P, kind: "guide", hit: hi, guide: g.g };
    }
    // Axes from the last point.
    if (from) {
      let ax = null;
      for (const [k, dir] of Object.entries(axisDirs())) {
        const P = closestOnLine(ray, from, dir);
        const s = toScreen(P);
        const d = Math.hypot(s.x - mx, s.y - my);
        if (s.z < 1 && d < 10 && (!ax || d < ax.d)) ax = { p: P, kind: k, d, dir };
      }
      if (ax) return { ...ax, hit: hi };
    }
    if (plane) { const P = onPlane(ray, plane.n, plane.p); if (P) return { p: P, kind: hi ? "face" : "ground", hit: hi }; }
    if (hi) return { p: hi.point.clone(), kind: "face", hit: hi };
    const P = onPlane(ray, V(0, 1, 0), V(0, workY(), 0));
    if (P && P.distanceTo(camPos) < 5000) return { p: P, kind: "ground", hit: null };
    return { p: closestOnLine(ray, V(0, workY(), 0), V(1, 0, 0)), kind: "ground", hit: null };
  }

  function showInference(q, e) {
    overlay.add(marker(q.p, COLORS[q.kind] || 0xffffff));
    if (q.seg && (q.kind === "edge" || q.kind === "midpoint" || q.kind === "endpoint")) overlay.add(line([q.seg.a, q.seg.b], COLORS[q.kind], { width: 2 }));
    const label = LABELS[q.kind] || "";
    return label;
  }
  function axisLine(from, q) {
    if (!from || !/^axis/.test(q.kind)) return;
    overlay.add(line([from, q.p], COLORS[q.kind], { dashed: true }));
  }

  // ---------------------------------------------------------------- selection and previews
  const selection = () => [...(ctx.getHighlighted ? ctx.getHighlighted() : [])];
  function itemObjects(ids) {
    const set = new Set(ids);
    const out = [];
    ctx.building.traverse((o) => {
      if (o === ctx.building || !o.userData || !set.has(o.userData.id)) return;
      // Top-most object of the item.
      let top = o;
      while (top.parent && top.parent !== ctx.building && top.parent.userData && top.parent.userData.id === o.userData.id) top = top.parent;
      if (!out.some((x) => x.obj === top)) out.push({ obj: top, pos: top.position.clone(), quat: top.quaternion.clone(), scale: top.scale.clone() });
    });
    // Nested duplicates (a group and its meshes): keep the outermost.
    return out.filter((x) => !out.some((y) => y !== x && isAncestor(y.obj, x.obj)));
  }
  // Objects a tool is about to move: the viewer draws them by their own meshes
  // (not as batched instances, batch.js) so the preview follows the pointer.
  function movingObjects(ids) {
    if (ctx.unbatch) ctx.unbatch(ids);
    return itemObjects(ids);
  }
  function isAncestor(a, b) { for (let o = b.parent; o; o = o.parent) if (o === a) return true; return false; }
  function restore(objs) { for (const x of objs || []) { x.obj.position.copy(x.pos); x.obj.quaternion.copy(x.quat); x.obj.scale.copy(x.scale); x.obj.updateMatrixWorld(true); } dirty(); }
  function previewMove(objs, d) { for (const x of objs) { x.obj.position.copy(x.pos).add(d); x.obj.updateMatrixWorld(true); } dirty(); }
  function previewRotate(objs, c, axis, ang) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    for (const x of objs) {
      // Pivot in the parent's frame (the level groups sit at the origin).
      x.obj.position.copy(x.pos).sub(c).applyQuaternion(q).add(c);
      x.obj.quaternion.copy(q).multiply(x.quat);
      x.obj.updateMatrixWorld(true);
    }
    dirty();
  }
  function previewScale(objs, o, k) {
    for (const x of objs) {
      x.obj.position.set(o.x + (x.pos.x - o.x) * k.x, o.y + (x.pos.y - o.y) * k.y, o.z + (x.pos.z - o.z) * k.z);
      x.obj.scale.set(x.scale.x * k.x, x.scale.y * k.y, x.scale.z * k.z);
      x.obj.updateMatrixWorld(true);
    }
    dirty();
  }
  function pickId(e) { const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY)); return hi && hi.id ? hi : null; }

  // ---------------------------------------------------------------- face planes
  // Drawing plane from a hit (its face) or the work plane (the ground of the
  // current level); u along red (or level on walls), w = n × u.
  function planeFrom(q) {
    let n, p = q.p.clone();
    if (q.hit && q.hit.normal && (q.kind === "face" || q.kind === "edge" || q.kind === "endpoint" || q.kind === "midpoint")) n = q.hit.normal.clone();
    else n = V(0, 1, 0);
    const ax = axisDirs();
    let u = Math.abs(n.y) > 0.9 ? ax.axisX.clone() : V(0, 1, 0).cross(n).normalize();
    if (u.lengthSq() < 1e-9) u = ax.axisX.clone();
    u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
    const w = n.clone().cross(u).normalize();
    return { n, p, u, w };
  }
  const inPlane = (pl, e) => onPlane(rayAt(e), pl.n, pl.p) || pl.p.clone();

  function rectCorners(pl, a, b, dims = null) {
    let du = b.clone().sub(a).dot(pl.u), dw = b.clone().sub(a).dot(pl.w);
    if (dims) { du = Math.sign(du || 1) * dims[0] * M; dw = Math.sign(dw || 1) * dims[1] * M; }
    return [a.clone(), a.clone().addScaledVector(pl.u, du), a.clone().addScaledVector(pl.u, du).addScaledVector(pl.w, dw), a.clone().addScaledVector(pl.w, dw)];
  }
  function ngon(pl, c, edge, sides) {
    const v = edge.clone().sub(c);
    const r = v.length();
    const a0 = Math.atan2(v.dot(pl.w), v.dot(pl.u));
    return Array.from({ length: sides }, (_, i) => { const a = a0 + (i / sides) * Math.PI * 2; return c.clone().addScaledVector(pl.u, Math.cos(a) * r).addScaledVector(pl.w, Math.sin(a) * r); });
  }
  function arcPts(pl, a, b, bulgeP, n = 12) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const chord = b.clone().sub(a);
    const half = chord.length() / 2;
    if (half < 1e-6) return [a, b];
    const perp = pl.n.clone().cross(chord).normalize();
    let s = bulgeP.clone().sub(mid).dot(perp);
    if (Math.abs(s) < 1e-6) return [a, b];
    const R = (half * half + s * s) / (2 * Math.abs(s));
    const centre = mid.clone().addScaledVector(perp, Math.sign(s) * (Math.abs(s) - R));
    const va = a.clone().sub(centre), vb = b.clone().sub(centre);
    const bx = va.clone().normalize(), by = pl.n.clone().cross(bx).normalize();
    const angOf = (v) => Math.atan2(v.dot(by), v.dot(bx));
    let end = angOf(vb);
    const bulgeAng = angOf(bulgeP.clone().sub(centre));
    // Go the way that passes the bulge point.
    const norm2 = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (!(norm2(bulgeAng) < norm2(end))) end = norm2(end) - 2 * Math.PI; else end = norm2(end);
    return Array.from({ length: n + 1 }, (_, i) => { const t = (end * i) / n; return centre.clone().addScaledVector(bx, Math.cos(t) * R).addScaledVector(by, Math.sin(t) * R); });
  }

  // ---------------------------------------------------------------- tool previews
  function hover(e) {
    lastPointer = { clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey };
    clearGroup(overlay);
    const tool = opts.tool;
    let label = "";
    const ex = st && st.pts ? st.pts.map((q) => q.p) : [];
    if (tool === "pushpull" && !push) {
      const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY));
      const ref = faceRef(hi) || (hi && hi.kind === "solids" ? { kind: "solids", id: hi.id, face: hi.face } : null);
      const loops = ref && ref.face !== null ? refLoops(ref) : null;
      if (loops) for (const l of loops) overlay.add(loopLine(l.map(toWorld), 0xffd400, { width: 2 }));
      dirty();
      showTip(e, "");
      return;
    }
    if (DRAW.has(tool) || ["tape", "protractor", "dimension", "move", "rotate", "scale", "axes", "text3d", "position", "eraser", "place", "sectionplane", "offset", "followme"].includes(tool)) {
      const from = st ? st.from || (st.pts && st.pts.length ? st.pts[st.pts.length - 1].p : st.base || st.c || st.a || null) : null;
      const q = infer(e, { from, plane: st && st.plane && !["move", "tape", "dimension", "line"].includes(tool) ? st.plane : null, extra: ex });
      lastHover = q;
      label = showInference(q, e);
      axisLine(from, q);
      label = previewTool(tool, q, e) || label;
    } else if (tool === "smoove") {
      const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY));
      const s = hi && hi.kind === "solids" && project() ? project().solids.find((x) => x.id === hi.id) : null;
      if (s && s.terrain) {
        const r = (opts.smooveRadius || 5000) * M;
        const pts = Array.from({ length: 48 }, (_, i) => hi.point.clone().add(V(Math.cos((i / 48) * Math.PI * 2) * r, 0.02, Math.sin((i / 48) * Math.PI * 2) * r)));
        overlay.add(loopLine(pts, 0xffd400));
        label = t("Drag up or down");
      }
    }
    if (vcb) label = `${label ? `${label} · ` : ""}${vcb}`;
    showTip(e, tr(label));
    dirty();
  }

  function previewTool(tool, q, e) {
    const P = q.p;
    if (tool === "line" && st && st.pts.length) {
      const pts = [...st.pts.map((x) => x.p), P];
      overlay.add(line(pts, 0x111111, { depth: false, width: 2 }));
      const L = P.distanceTo(st.pts[st.pts.length - 1].p) / M;
      hint(`${mm(L)}`);
      return `${LABELS[q.kind] || ""} ${mm(L)}`.trim();
    }
    if ((tool === "rect") && st) {
      const b = projectOn(st.plane, P);
      const c = rectCorners(st.plane, st.a, b);
      overlay.add(loopLine(c, 0x111111, { width: 2 }));
      const w = Math.abs(b.clone().sub(st.a).dot(st.plane.u)) / M, d = Math.abs(b.clone().sub(st.a).dot(st.plane.w)) / M;
      hint(`${mm(w)} × ${mm(d)}`);
      return `${mm(w)} × ${mm(d)}`;
    }
    if ((tool === "circle" || tool === "polygon") && st) {
      const b = projectOn(st.plane, P);
      overlay.add(loopLine(ngon(st.plane, st.a, b, st.sides), 0x111111, { width: 2 }));
      const r = b.distanceTo(st.a) / M;
      hint(`R ${mm(r)} · ${st.sides}`);
      return `R ${mm(r)}`;
    }
    if (tool === "arc" && st) {
      if (st.b) overlay.add(line(arcPts(st.plane, st.a, st.b, projectOn(st.plane, P)), 0x111111, { width: 2 }));
      else overlay.add(line([st.a, P], 0x111111));
      return "";
    }
    if (tool === "tape" && st) {
      overlay.add(line([st.a, P], 0xffb300, { dashed: true }));
      const L = P.distanceTo(st.a) / M;
      hint(mm(L));
      return mm(L);
    }
    if (tool === "dimension" && st) {
      if (!st.b) { overlay.add(line([st.a, P], 0xffd166)); return mm(P.distanceTo(st.a) / M); }
      const off = dimOffset(st.a, st.b, e);
      overlay.add(line([st.a, st.a.clone().add(off), st.b.clone().add(off), st.b], 0xffd166));
      return mm(st.a.distanceTo(st.b) / M);
    }
    if (tool === "protractor" && st) {
      if (!st.ref) { overlay.add(line([st.c, P], 0xff9100, { dashed: true })); return ""; }
      const cur = projectOn(st.plane, P).sub(st.c);
      const ang = snapAngle(signedAngle(st.ref, cur, st.plane.n));
      const dir = st.ref.clone().applyAxisAngle(st.plane.n, ang).normalize();
      overlay.add(line([st.c, st.c.clone().addScaledVector(st.ref, 3)], 0xff9100), line([st.c.clone().addScaledVector(dir, -50), st.c.clone().addScaledVector(dir, 50)], 0xff9100, { dashed: true }));
      const deg = (ang * 180) / Math.PI;
      hint(`${deg.toFixed(1)}°`);
      return `${deg.toFixed(1)}°`;
    }
    if (tool === "move" && st) {
      const d = P.clone().sub(st.base);
      previewMove(st.objs, d);
      overlay.add(line([st.base, P], 0x111111, { dashed: true }));
      hint(`${st.copy ? t("Copy") : t("Move")} ${mm(d.length() / M)}`);
      return `${mm(d.length() / M)}`;
    }
    if (tool === "rotate" && st) {
      const pl = { n: st.axis, p: st.c };
      ring(st.c, st.axis, 0x2f7bff);
      if (!st.ref) { overlay.add(line([st.c, projectOn(pl, P)], 0x2f7bff, { dashed: true })); return ""; }
      const cur = projectOn(pl, P).sub(st.c);
      const ang = snapAngle(signedAngle(st.ref, cur, st.axis));
      st.ang = ang;
      previewRotate(st.objs, st.c, st.axis, ang);
      overlay.add(line([st.c.clone().addScaledVector(st.ref, 1), st.c, st.c.clone().addScaledVector(cur.normalize(), 1)], 0x2f7bff));
      const deg = (ang * 180) / Math.PI;
      hint(`${deg.toFixed(1)}°`);
      return `${deg.toFixed(1)}°`;
    }
    if (tool === "scale" && st && st.ref) {
      const k = scaleFactor(P);
      st.k = k;
      previewScale(st.objs, st.o, k);
      overlay.add(line([st.o, P], 0x111111, { dashed: true }));
      const txt = Math.abs(k.x - k.y) < 1e-9 && Math.abs(k.y - k.z) < 1e-9 ? `× ${k.x.toFixed(2)}` : `× ${k.x.toFixed(2)}, ${k.z.toFixed(2)}, ${k.y.toFixed(2)}`;
      hint(txt);
      return txt;
    }
    if (tool === "offset" && st) {
      const d = offsetDistance(P);
      const loop = offsetLoop(d);
      if (loop) overlay.add(loopLine(loop.map(toWorld), 0x00b8d4, { width: 2 }));
      hint(mm(d));
      return mm(d);
    }
    if (tool === "offset" && !st) { highlightFace(q.hit); return ""; }
    if (tool === "followme") {
      if (!st) { highlightFace(q.hit); return t("Pick the profile face"); }
      if (q.seg && q.seg.loose) overlay.add(line([q.seg.a, q.seg.b], 0xff1744, { width: 2 }));
      else highlightFace(q.hit, 0xff1744);
      return t("Pick the path: a face's edge or a line");
    }
    if (tool === "sectionplane") {
      if (q.hit && q.hit.normal) {
        const pl = planeFrom({ ...q, kind: "face" });
        const s = 1.5;
        overlay.add(loopLine([pl.p.clone().addScaledVector(pl.u, -s).addScaledVector(pl.w, -s), pl.p.clone().addScaledVector(pl.u, s).addScaledVector(pl.w, -s), pl.p.clone().addScaledVector(pl.u, s).addScaledVector(pl.w, s), pl.p.clone().addScaledVector(pl.u, -s).addScaledVector(pl.w, s)], 0xff9100, { width: 2 }));
      }
      return "";
    }
    if (tool === "place" && opts.placeComp) {
      const p = project();
      const def = p && componentById(p, opts.placeComp);
      if (def) {
        const wall = q.hit && q.hit.kind === "walls" && def.cut;
        const [w, d, h] = def.size.map((v) => v * M);
        const box = new THREE.Box3(V(-w / 2, 0, -d / 2), V(w / 2, h, d / 2));
        const helper = new THREE.Box3Helper(box, wall ? 0xff9100 : 0x2979ff);
        helper.position.copy(P);
        if (wall) helper.position.y = P.y - Math.min(h / 2, P.y - workY());
        overlay.add(helper);
        return wall ? t("Glue into the wall") : "";
      }
    }
    if (tool === "eraser") { highlightFace(q.hit, 0xff1744); return ""; }
    return "";
  }

  function highlightFace(hi, color = 0x2979ff) {
    if (!hi) return;
    const ref = hi.kind === "solids" ? { kind: "solids", id: hi.id, face: hi.face } : faceRef(hi);
    const loops = ref && ref.face !== null ? refLoops(ref) : null;
    if (loops) for (const l of loops) overlay.add(loopLine(l.map(toWorld), color, { width: 2 }));
  }
  function ring(c, n, color) {
    const pl = planeFrom({ p: c, hit: { normal: n }, kind: "face" });
    const r = Math.max(0.3, c.distanceTo(cam().position) * 0.06);
    overlay.add(loopLine(Array.from({ length: 48 }, (_, i) => c.clone().addScaledVector(pl.u, Math.cos((i / 48) * Math.PI * 2) * r).addScaledVector(pl.w, Math.sin((i / 48) * Math.PI * 2) * r)), color));
  }
  function projectOn(pl, P) { const n = pl.n; return P.clone().sub(n.clone().multiplyScalar(P.clone().sub(pl.p).dot(n))); }
  function signedAngle(a, b, n) { const c = a.clone().normalize(), d = b.clone().normalize(); return Math.atan2(c.clone().cross(d).dot(n), c.dot(d)); }
  function snapAngle(a) { const step = Math.PI / 12; const s = Math.round(a / step) * step; return Math.abs(s - a) < (2.5 * Math.PI) / 180 ? s : a; }
  function dimOffset(a, b, e) {
    const ab = b.clone().sub(a);
    const view = cam().getWorldDirection(V());
    const n = ab.clone().cross(view.clone().cross(ab)).normalize();
    const Q = onPlane(rayAt(e), n.lengthSq() > 0 ? n : V(0, 1, 0), a) || a.clone();
    const v = Q.sub(a);
    const t = v.dot(ab) / (ab.lengthSq() || 1);
    return v.sub(ab.multiplyScalar(t));
  }
  function scaleFactor(P) {
    const r = st.ref.clone().sub(st.o), c = P.clone().sub(st.o);
    const axis = st.axis || axisOf(r);
    if (axis) {
      const dir = axisDirs()[axis];
      const k = r.dot(dir) ? c.dot(dir) / r.dot(dir) : 1;
      return axis === "axisX" ? V(k, 1, 1) : axis === "axisY" ? V(1, 1, k) : V(1, k, 1);
    }
    const k = r.length() > 1e-9 ? c.length() / r.length() : 1;
    return V(k, k, k);
  }
  function axisOf(v) {
    const n = v.clone().normalize();
    for (const [k, d] of Object.entries(axisDirs())) if (Math.abs(n.dot(d)) > Math.cos((5 * Math.PI) / 180)) return k;
    return null;
  }
  function offsetDistance(P) {
    const cen = st.centroid;
    const d = P.distanceTo(st.p0) / M;
    return P.clone().sub(st.p0).dot(cen.clone().sub(st.p0)) >= 0 ? d : -d;
  }
  function offsetLoop(d) {
    if (!st || !st.loop || !d) return null;
    const n = st.nPlan, b = planeBasis(n);
    const h0 = dot3(st.loop[0], n);
    const inner = offsetPolygon(st.loop.map((q) => to2(q, b)), d);
    return inner.map(([x, y]) => add3(add3(mul3(b.u, x), mul3(b.w, y)), mul3(n, h0)));
  }

  // ---------------------------------------------------------------- clicks
  function click(e) {
    const tool = opts.tool;
    const q = lastHover && lastPointer && Math.hypot(lastPointer.clientX - e.clientX, lastPointer.clientY - e.clientY) < 2 ? lastHover : infer(e, { from: st ? st.from || (st.pts && st.pts.length ? st.pts[st.pts.length - 1].p : st.base || st.c || st.a || null) : null, plane: st && st.plane && !["move", "tape", "dimension", "line"].includes(tool) ? st.plane : null, extra: st && st.pts ? st.pts.map((x) => x.p) : [] });
    const P = q.p;
    switch (tool) {
      case "line": {
        if (!st) { st = { pts: [q] }; break; }
        const last = st.pts[st.pts.length - 1].p;
        if (st.pts.length >= 3 && P.distanceTo(st.pts[0].p) < 1e-5) { finishLoop(st.pts.map((x) => x.p), st.pts.map((x) => x.hit)); st = null; break; }
        if (P.distanceTo(last) < 1e-5) { finishLine(); break; }
        st.pts.push(q);
        break;
      }
      case "rect": {
        if (!st) { st = { a: P.clone(), plane: planeFrom(q), hit: q.hit }; st.plane.p = P.clone(); break; }
        finishLoop(rectCorners(st.plane, st.a, projectOn(st.plane, P)), [st.hit, q.hit]);
        st = null;
        break;
      }
      case "circle": case "polygon": {
        if (!st) { st = { a: P.clone(), plane: planeFrom(q), hit: q.hit, sides: tool === "circle" ? (opts.circleSides || 24) : (opts.polygonSides || 6) }; st.plane.p = P.clone(); break; }
        finishLoop(ngon(st.plane, st.a, projectOn(st.plane, P), st.sides), [st.hit, q.hit]);
        st = null;
        break;
      }
      case "arc": {
        if (!st) { st = { a: P.clone(), plane: planeFrom(q), hit: q.hit }; st.plane.p = P.clone(); break; }
        if (!st.b) { st.b = projectOn(st.plane, P); break; }
        emit({ op: "drawLine", pts: arcPts(st.plane, st.a, st.b, projectOn(st.plane, P)).map(toPlan), hits: hitRefs([st.hit, q.hit]) });
        st = null;
        break;
      }
      case "tape": {
        if (!st) { st = { a: P.clone() }; break; }
        const d = ctx.addMeasure(st.a, P);
        ctx.emitTool({ type: "tape", a: st.a, b: P, distance: d });
        if (e.ctrlKey || opts.tapeGuides) emit({ op: "guide", a: toPlan(st.a), b: toPlan(P) });
        st = null;
        break;
      }
      case "protractor": {
        if (!st) { const pl = planeFrom(q); pl.p = P.clone(); st = { c: P.clone(), plane: pl }; break; }
        if (!st.ref) { st.ref = projectOn(st.plane, P).sub(st.c).normalize(); break; }
        const ang = snapAngle(signedAngle(st.ref, projectOn(st.plane, P).sub(st.c), st.plane.n));
        finishProtractor(ang);
        break;
      }
      case "dimension": {
        if (!st) { st = { a: P.clone() }; break; }
        if (!st.b) { st.b = P.clone(); break; }
        const off = dimOffset(st.a, st.b, e);
        emit({ op: "dim", a: toPlan(st.a), b: toPlan(st.b), off: dirP(off).map((v) => v / M) });
        st = null;
        break;
      }
      case "text3d": emit({ op: "text", at: toPlan(P), id: q.hit ? q.hit.id : null }); break;
      case "axes": {
        if (!st) { st = { a: P.clone() }; break; }
        const v = P.clone().sub(st.a);
        emit({ op: "axes", o: toPlan(st.a), ang: (Math.atan2(v.z, v.x) * 180) / Math.PI });
        st = null;
        break;
      }
      case "sectionplane": {
        if (!q.hit || !q.hit.normal) { hint(t("Click a face to place the section plane on it.")); break; }
        emit({ op: "section", o: toPlan(q.hit.point), n: dirP(q.hit.normal.clone().negate()) });
        break;
      }
      case "position": {
        ctx.positionCamera(P);
        emit({ op: "positioned" });
        break;
      }
      case "eraser": {
        const g = noteUnder(e);
        if (g) { emit({ op: "erase", ids: [g] }); break; }
        if (q.hit && q.hit.id) emit({ op: "erase", ids: [q.hit.id] });
        break;
      }
      case "place": {
        if (!opts.placeComp) break;
        emit({ op: "place", def: opts.placeComp, at: toPlan(P), wall: q.hit && q.hit.kind === "walls" ? q.hit.id : null, level: q.hit ? q.hit.level : null });
        break;
      }
      case "move": {
        if (!st) {
          let ids = selection();
          const under = pickId(e);
          if (under && !ids.includes(under.id)) { ids = [under.id]; emit({ op: "select", ids }); }
          if (!ids.length) { hint(t("Select something first (or click on it), then the point to move it by.")); break; }
          st = { base: P.clone(), ids, copy: e.ctrlKey, objs: movingObjects(ids) };
          break;
        }
        const d = P.clone().sub(st.base);
        restore(st.objs);
        emit({ op: "move", ids: st.ids, d: dirP(d).map((v) => v / M), copy: st.copy || e.ctrlKey });
        st = null;
        break;
      }
      case "rotate": {
        if (!st) {
          let ids = selection();
          const under = pickId(e);
          if (!ids.length && under) { ids = [under.id]; emit({ op: "select", ids }); }
          if (!ids.length) { hint(t("Select something first, then click the centre of rotation.")); break; }
          let axis = axisLock ? axisDirs()[axisLock].clone() : q.hit && q.hit.normal && q.kind === "face" ? q.hit.normal.clone() : V(0, 1, 0);
          const ak = axisOf(axis);
          if (ak) axis = axisDirs()[ak].clone().multiplyScalar(Math.sign(axis.dot(axisDirs()[ak])) || 1);
          st = { c: P.clone(), axis: axis.normalize(), ids, copy: e.ctrlKey, objs: movingObjects(ids) };
          st.plane = { n: st.axis, p: st.c };
          break;
        }
        if (!st.ref) { st.ref = projectOn(st.plane, P).sub(st.c).normalize(); break; }
        finishRotate(st.ang || 0);
        break;
      }
      case "scale": {
        if (!st) {
          let ids = selection();
          const under = pickId(e);
          if (!ids.length && under) { ids = [under.id]; emit({ op: "select", ids }); }
          if (!ids.length) { hint(t("Select something first, then click the fixed point.")); break; }
          st = { o: P.clone(), ids, objs: movingObjects(ids), axis: axisLock };
          break;
        }
        if (!st.ref) { st.ref = P.clone(); if (st.ref.distanceTo(st.o) < 1e-6) st.ref = null; break; }
        finishScale(scaleFactor(P));
        break;
      }
      case "offset": {
        if (!st) {
          const ref = q.hit ? (q.hit.kind === "solids" ? { kind: "solids", id: q.hit.id, face: q.hit.face } : faceRef(q.hit)) : null;
          const loops = ref && ref.face !== null ? refLoops(ref) : null;
          if (!loops) { hint(t("Click a face of a mass to offset its edge.")); break; }
          const cen = loops[0].reduce((s, x) => add3(s, x), [0, 0, 0]).map((v) => v / loops[0].length);
          const nPlan = dirP(q.hit.normal);
          st = { ref, p0: P.clone(), loop: loops[0], centroid: toWorld(cen), nPlan, plane: { n: q.hit.normal.clone(), p: P.clone() } };
          break;
        }
        emit({ op: "offset", target: st.ref, d: offsetDistance(P) });
        st = null;
        break;
      }
      case "followme": {
        if (!st) {
          const ref = q.hit && q.hit.kind === "solids" && q.hit.face !== null ? { id: q.hit.id, face: q.hit.face } : null;
          if (!ref) { hint(t("Click the profile: a face of a mass (draw it upright at the start of the path).")); break; }
          st = { profile: ref };
          break;
        }
        let path = null;
        if (q.seg && q.seg.loose && q.seg.id) path = { kind: "edges", id: q.seg.id };
        else if (q.hit && q.hit.kind === "solids" && q.hit.face !== null) path = { kind: "face", id: q.hit.id, face: q.hit.face };
        if (!path) { hint(t("Click the path: a face (its edge is followed) or a drawn line.")); break; }
        emit({ op: "followme", profile: st.profile, path });
        st = null;
        break;
      }
      default: break;
    }
    vcb = "";
    hover(e);
  }

  function hitRefs(hits) {
    const out = [];
    for (const h of hits) {
      const r = h ? (h.kind === "solids" ? (h.face !== null ? { kind: "solids", id: h.id, face: h.face } : null) : faceRef(h)) : null;
      if (r && !out.some((x) => x.id === r.id && x.face === r.face && x.kind === r.kind)) out.push(r);
    }
    return out;
  }
  function towards() { return dirP(cam().getWorldDirection(V()).negate()); }
  function finishLoop(pts, hits) { emit({ op: "drawLoop", pts: pts.map(toPlan), hits: hitRefs(hits), towards: towards() }); }
  function finishLine() {
    if (st && st.pts && st.pts.length >= 2) emit({ op: "drawLine", pts: st.pts.map((x) => toPlan(x.p)), hits: hitRefs(st.pts.map((x) => x.hit)) });
    st = null;
  }
  function finishRotate(ang) {
    restore(st.objs);
    // A world rotation by θ is a plan rotation by −θ (the axes swap handedness).
    emit({ op: "rotate", ids: st.ids, c: toPlan(st.c), axis: dirP(st.axis), deg: (-ang * 180) / Math.PI, copy: st.copy });
    st = null;
  }
  function finishScale(k) {
    restore(st.objs);
    emit({ op: "scale", ids: st.ids, o: toPlan(st.o), k: [k.x, k.z, k.y] });
    st = null;
  }
  function finishProtractor(ang) {
    const dir = st.ref.clone().applyAxisAngle(st.plane.n, ang).normalize();
    emit({ op: "guide", a: toPlan(st.c), b: toPlan(st.c.clone().addScaledVector(dir, 1)) });
    st = null;
  }
  function noteUnder(e) {
    const p = project();
    if (!p) return null;
    const mx = e.clientX, my = e.clientY;
    for (const g of guidesWorld()) {
      if (!g.b) { const s = toScreen(g.a); if (Math.hypot(s.x - mx, s.y - my) < 8) return g.g.id; continue; }
      const P = closestOnLine(rayAt(e), g.a, g.b.clone().sub(g.a).normalize());
      const s = toScreen(P);
      if (s.z < 1 && Math.hypot(s.x - mx, s.y - my) < 6) return g.g.id;
    }
    for (const d of p.dims3d || []) { const s = toScreen(toWorld(d.a).add(toWorld(d.b)).multiplyScalar(0.5).add(toWorld(d.off))); if (Math.hypot(s.x - mx, s.y - my) < 30) return d.id; }
    for (const t of p.texts3d || []) { const s = toScreen(toWorld(t.at)); if (Math.hypot(s.x - mx, s.y - my) < 30) return t.id; }
    for (const s of p.sections || []) { const q = toScreen(toWorld(s.o)); if (Math.hypot(q.x - mx, q.y - my) < 14) return s.id; }
    return null;
  }

  // ---------------------------------------------------------------- push/pull and smoove (drag or click-move-click)
  function pushDown(e) {
    const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY));
    if (!hi || hi.face === null || !hi.normal) {
      if (hi && hi.comp && !(editing && editing.inst === hi.id)) { hint(t("Double-click the component to edit it, then push/pull its faces.")); return true; }
      return false;
    }
    let ref = faceRef(hi);
    if (!ref) return false;
    const p = project();
    const s = ref.kind === "solids" ? p.solids.find((x) => x.id === ref.id) : null;
    // A plain mass's top face keeps the parametric height push (viewer.js).
    if (s && !s.mesh && hi.normal.y > 0.99 && !e.ctrlKey && (s.taper ?? 1) >= 0.999) return false;
    push = { ref, p0: hi.point.clone(), n: hi.normal.clone(), copy: e.ctrlKey, x: e.clientX, y: e.clientY, d: 0, drag: true };
    controls.enabled = false;
    emit({ op: "pushStart", target: ref, copy: push.copy, p0: toPlan(hi.point), n: dirP(hi.normal) });
    return true;
  }
  function pushMove(e) {
    const P = closestOnLine(rayAt(e), push.p0, push.n);
    let d = P.clone().sub(push.p0).dot(push.n) / M;
    // Snap to an inferred point's height along the normal.
    const q = infer(e, { from: push.p0 });
    if (q && ["endpoint", "midpoint", "guide"].includes(q.kind)) {
      // Only a snap close to where the pointer says (not a far vertex behind).
      const ds = q.p.clone().sub(push.p0).dot(push.n) / M;
      if (Math.sign(ds) === Math.sign(d) && Math.abs(ds - d) < Math.abs(d) * 0.25 + 300) d = ds;
    }
    d = Math.round(d);
    if (d === push.d) return;
    push.d = d;
    emit({ op: "pushPreview", d });
    hint(mm(d));
    showTip(e, `${mm(d)}${vcb ? ` · ${vcb}` : ""}`);
  }
  function pushEnd(d = push.d) {
    emit({ op: "pushEnd", d });
    push = null;
    controls.enabled = opts.navMode !== "walk";
    showTip({ clientX: 0, clientY: 0 }, "");
  }
  function smooveDown(e) {
    const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY));
    const s = hi && hi.kind === "solids" && project() ? project().solids.find((x) => x.id === hi.id) : null;
    if (!s || !s.terrain) { hint(t("Smoove works on a terrain: make one from scratch or from contours first.")); return true; }
    const at = toPlan(hi.point);
    push = { smoove: true, id: s.id, at, y: e.clientY, x: e.clientX, d: 0, drag: true, scale: Math.max(5, hi.dist * 1000 * 0.0025) };
    controls.enabled = false;
    emit({ op: "smooveStart", id: s.id });
    return true;
  }
  function smooveMove(e) {
    const d = Math.round((push.y - e.clientY) * push.scale);
    if (d === push.d) return;
    push.d = d;
    emit({ op: "smoovePreview", id: push.id, x: push.at[0], y: push.at[1], r: opts.smooveRadius || 5000, d });
    hint(mm(d));
  }

  // ---------------------------------------------------------------- paint
  function paintDown(e) {
    const hi = hitInfo(ctx.raycastAt(e.clientX, e.clientY));
    if (!hi) return false;
    if (e.altKey) { emit({ op: "sample", material: hi.material || null, id: hi.id }); return true; }
    const ref = faceRef(hi);
    const p = project();
    if (ref && ref.kind === "comp") { emit({ op: "paintFace", target: ref }); return true; }
    if (ref && ref.kind === "solids") {
      const s = p.solids.find((x) => x.id === ref.id);
      if (s && s.mesh && !e.ctrlKey) { emit({ op: "paintFace", target: ref }); return true; }
      return false;
    }
    if (hi.comp && hi.kind === "furniture") { emit({ op: "paintInstance", id: hi.id }); return true; }
    return false;
  }

  // ---------------------------------------------------------------- events from the viewer
  function pointerDown(e) {
    if (e.button !== 0 || opts.navMode === "walk") return false;
    const tool = opts.tool;
    if (push && !push.drag) { // click-move-click push/pull: this click finishes
      downAt = { x: e.clientX, y: e.clientY, finishPush: true };
      return true;
    }
    if (tool === "pushpull") { const r = pushDown(e); if (r) downAt = { x: e.clientX, y: e.clientY, push: true }; return r; }
    if (tool === "smoove") { const r = smooveDown(e); downAt = { x: e.clientX, y: e.clientY, push: true }; return r; }
    if (tool === "paint") return paintDown(e);
    if (!SK_TOOLS.has(tool)) return false;
    downAt = { x: e.clientX, y: e.clientY };
    return true;
  }
  function pointerMove(e) {
    if (push) {
      if (push.smoove) smooveMove(e); else pushMove(e);
      return true;
    }
    if (e.buttons) { if (tip.style.display !== "none") tip.style.display = "none"; return false; }
    if (SK_TOOLS.has(opts.tool) || opts.tool === "pushpull") hover(e);
    else if (overlay.children.length) { clearGroup(overlay); tip.style.display = "none"; dirty(); }
    return false;
  }
  function pointerUp(e) {
    if (!downAt) return false;
    const d = downAt;
    downAt = null;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (d.finishPush) { if (push && push.smoove) { emit({ op: "smooveEnd" }); push = null; controls.enabled = true; } else if (push) pushEnd(); return true; }
    if (d.push && push) {
      if (moved > 4) { if (push.smoove) { emit({ op: "smooveEnd" }); push = null; controls.enabled = true; } else pushEnd(); }
      else { push.drag = false; controls.enabled = opts.navMode !== "walk"; } // click-move-click
      return true;
    }
    if (moved > 4) return true; // that was an orbit
    click(e);
    return true;
  }
  function dblClick(e) {
    if (opts.tool === "line" && st) { finishLine(); clearGroup(overlay); dirty(); return true; }
    if (SK_TOOLS.has(opts.tool)) return true;
    return false;
  }

  // Keys while a tool runs: the measurements box, Esc, Enter, axis locks.
  function key(e, down) {
    if (e.key === "Shift") {
      if (down && st && lastHover && !shiftLock) {
        const from = st.from || (st.pts && st.pts.length ? st.pts[st.pts.length - 1].p : st.base || st.c || st.a || null);
        if (from && lastHover.p.distanceTo(from) > 1e-6) shiftLock = { dir: lastHover.p.clone().sub(from).normalize(), kind: /^axis/.test(lastHover.kind) ? lastHover.kind : "guide" };
      }
      if (!down) shiftLock = null;
      return false;
    }
    if (!down) return false;
    const tool = opts.tool;
    const busy = !!st || !!push;
    if (e.key === "Control" && st && (tool === "move" || tool === "rotate")) { st.copy = !st.copy; if (lastPointer) hover(lastPointer); return true; }
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key) && (busy || DRAW.has(tool) || ["move", "rotate", "scale", "tape"].includes(tool))) {
      const k = e.key === "ArrowRight" ? "axisX" : e.key === "ArrowLeft" ? "axisY" : "axisZ";
      axisLock = axisLock === k ? null : k;
      if (st && tool === "scale") st.axis = axisLock;
      if (lastPointer) hover(lastPointer);
      return true;
    }
    if (e.key === "Escape") {
      if (push) { emit({ op: push.smoove ? "smooveCancel" : "pushCancel" }); push = null; controls.enabled = true; vcb = ""; return true; }
      if (st) {
        if (tool === "line" && st.pts && st.pts.length >= 2) finishLine();
        else { restore(st.objs); st = null; }
        vcb = ""; axisLock = null; clearGroup(overlay); tip.style.display = "none"; dirty();
        return true;
      }
      if (vcb) { vcb = ""; return true; }
      if (editing) { editing = null; emit({ op: "editEnd" }); updateEditBox(); return true; }
      return false;
    }
    const acceptsVcb = busy || lastCopy || ["circle", "polygon"].includes(tool);
    if (!acceptsVcb || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === "Backspace") { vcb = vcb.slice(0, -1); if (lastPointer) hover(lastPointer); return true; }
    if (e.key === "Enter") { const v = vcb; vcb = ""; applyVcb(v); return true; }
    if (/^[0-9.,\-xX*/smcfti'" ]$/.test(e.key) && !(e.key === " " && !vcb)) {
      vcb += e.key;
      emit({ op: "vcb", text: vcb });
      if (lastPointer) hover(lastPointer);
      return true;
    }
    return false;
  }

  function applyVcb(text) {
    const tool = opts.tool;
    const t = text.trim();
    if (!t) { if (tool === "line" && st) finishLine(); return; }
    // Arrays after a copy: 5x, x5, *5 (copies at the distance), /5 (between).
    const arr = t.match(/^(?:[x*](\d+)|(\d+)[x*]|\/(\d+))$/i);
    if (arr && lastCopy) { const n = +(arr[1] || arr[2] || arr[3]); emit({ op: "array", n, divide: !!arr[3], last: lastCopy }); lastCopy = null; return; }
    const sides = t.match(/^(\d+)\s*s$/i);
    if (sides && (tool === "circle" || tool === "polygon")) {
      const n = Math.max(3, Math.min(360, +sides[1]));
      if (st) st.sides = n;
      emit({ op: "sides", tool, n });
      return;
    }
    if (push) {
      const d = parseLength(t);
      if (d === null) return;
      if (push.smoove) { emit({ op: "smoovePreview", id: push.id, x: push.at[0], y: push.at[1], r: opts.smooveRadius || 5000, d }); emit({ op: "smooveEnd" }); push = null; controls.enabled = true; return; }
      emit({ op: "pushPreview", d });
      pushEnd(d);
      return;
    }
    if (!st) return;
    const P = lastHover ? lastHover.p : null;
    if (tool === "line" && st.pts.length) {
      const L = parseLength(t);
      const last = st.pts[st.pts.length - 1].p;
      if (L === null || !P || P.distanceTo(last) < 1e-9) return;
      const dir = P.clone().sub(last).normalize();
      st.pts.push({ p: last.clone().addScaledVector(dir, L * M), hit: lastHover.hit, kind: "vcb" });
      return;
    }
    if (tool === "rect") {
      const parts = t.split(/[,;]/).map(parseLength);
      if (parts.length !== 2 || parts.some((v) => v === null)) return;
      finishLoop(rectCorners(st.plane, st.a, P ? projectOn(st.plane, P) : st.a.clone().add(st.plane.u).add(st.plane.w), parts), [st.hit]);
      st = null;
      return;
    }
    if (tool === "circle" || tool === "polygon") {
      const r = parseLength(t);
      if (r === null) return;
      const edge = P ? projectOn(st.plane, P) : st.a.clone().add(st.plane.u);
      const dir = edge.clone().sub(st.a);
      if (dir.lengthSq() < 1e-12) dir.copy(st.plane.u);
      finishLoop(ngon(st.plane, st.a, st.a.clone().addScaledVector(dir.normalize(), r * M), st.sides), [st.hit]);
      st = null;
      return;
    }
    if (tool === "move") {
      const L = parseLength(t);
      if (L === null || !P) return;
      const dir = P.clone().sub(st.base);
      if (dir.lengthSq() < 1e-12) return;
      const d = dir.normalize().multiplyScalar(L * M);
      restore(st.objs);
      emit({ op: "move", ids: st.ids, d: dirP(d).map((v) => v / M), copy: st.copy });
      st = null;
      return;
    }
    if (tool === "rotate" && st.ref) { const deg = parseFloat(t.replace(",", ".")); if (Number.isFinite(deg)) finishRotate((deg * Math.PI) / 180); return; }
    if (tool === "protractor" && st.ref) { const deg = parseFloat(t.replace(",", ".")); if (Number.isFinite(deg)) finishProtractor((deg * Math.PI) / 180); return; }
    if (tool === "scale" && st.ref !== undefined) {
      const parts = t.split(/[,;]/).map((x) => parseFloat(x));
      if (parts.some((x) => !Number.isFinite(x) || x === 0)) return;
      if (!st.ref) st.ref = st.o.clone().add(V(1, 0, 0));
      if (parts.length === 1) finishScale(V(parts[0], parts[0], parts[0]));
      else if (parts.length === 3) finishScale(V(parts[0], parts[2], parts[1]));
      return;
    }
    if (tool === "offset") { const d = parseLength(t); if (d !== null) { emit({ op: "offset", target: st.ref, d }); st = null; } return; }
    if (tool === "tape" && P) {
      const L = parseLength(t);
      if (L === null) return;
      const dir = P.clone().sub(st.a);
      if (dir.lengthSq() < 1e-12) return;
      const b = st.a.clone().addScaledVector(dir.normalize(), L * M);
      ctx.addMeasure(st.a, b);
      emit({ op: "guide", a: toPlan(b) });
      st = null;
    }
  }

  // ---------------------------------------------------------------- model helpers: guides, notes, section planes, axes
  function rebuildNotes() {
    clearGroup(notes);
    const p = project();
    if (!p) return;
    if (opts.guides !== false) {
      for (const g of p.guides || []) {
        const a = toWorld(g.a);
        if (g.b) {
          const dir = toWorld(g.b).sub(a).normalize();
          const L = 400;
          notes.add(line([a.clone().addScaledVector(dir, -L), a.clone().addScaledVector(dir, L)], 0xff9100, { dashed: true, depth: true, opacity: 0.85 }));
        } else {
          const s = 0.25;
          notes.add(line([a.clone().add(V(-s, 0, 0)), a.clone().add(V(s, 0, 0))], 0xff9100, { depth: true }), line([a.clone().add(V(0, 0, -s)), a.clone().add(V(0, 0, s))], 0xff9100, { depth: true }), line([a.clone().add(V(0, -s, 0)), a.clone().add(V(0, s, 0))], 0xff9100, { depth: true }));
        }
      }
    }
    for (const d of p.dims3d || []) {
      const a = toWorld(d.a), b = toWorld(d.b), off = V(d.off[0] * M, d.off[2] * M, d.off[1] * M);
      const a2 = a.clone().add(off), b2 = b.clone().add(off);
      const g = new THREE.Group();
      g.userData.note = d.id;
      g.add(line([a, a2.clone().addScaledVector(off.clone().normalize(), 0.15)], 0x1d2128, { depth: true }), line([b, b2.clone().addScaledVector(off.clone().normalize(), 0.15)], 0x1d2128, { depth: true }), line([a2, b2], 0x1d2128, { depth: true, width: 2 }));
      const L = a.distanceTo(b);
      for (const [p0, p1] of [[a2, b2], [b2, a2]]) { const dir = p1.clone().sub(p0).normalize(); const t = Math.min(0.3, L / 6); g.add(line([p0.clone().addScaledVector(dir, t).add(off.clone().normalize().multiplyScalar(t / 3)), p0, p0.clone().addScaledVector(dir, t).sub(off.clone().normalize().multiplyScalar(t / 3))], 0x1d2128, { depth: true })); }
      const s = ctx.labelSprite(ctx.fmt(L, true), "#ffd166", Math.max(0.2, Math.min(1.2, L / 12)));
      s.position.copy(a2).add(b2).multiplyScalar(0.5);
      g.add(s);
      notes.add(g);
    }
    for (const t of p.texts3d || []) {
      const at = toWorld(t.at);
      const s = ctx.labelSprite(t.text || "…", "#ffffff", 0.45);
      s.position.copy(at);
      s.center.set(0.5, 0);
      notes.add(s);
      if (t.leader) notes.add(line([at, toWorld(t.leader)], 0xffffff, { depth: true }));
    }
    if (opts.showSections !== false) {
      const span = Math.max(4, ctx.extentSize() * 0.6);
      for (const s of p.sections || []) {
        const o = toWorld(s.o), n = dirW(s.n);
        const pl = planeFrom({ p: o, hit: { normal: n }, kind: "face" });
        const c = (du, dw) => o.clone().addScaledVector(pl.u, du * span).addScaledVector(pl.w, dw * span);
        const col = s.active ? 0xff9100 : 0x8a93a3;
        notes.add(loopLine([c(-0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5), c(-0.5, 0.5)], col, { depth: true, width: 2 }));
        // Arrows into the part that stays.
        for (const [du, dw] of [[-0.5, -0.5], [0.5, 0.5]]) { const a0 = c(du, dw); notes.add(line([a0, a0.clone().addScaledVector(n, span * 0.08)], col, { depth: true })); }
        const lab = ctx.labelSprite(s.name, s.active ? "#ffb74d" : "#cfd8dc", Math.max(0.3, Math.min(1.2, span / 60)));
        lab.position.copy(c(-0.5, 0.5));
        notes.add(lab);
      }
    }
    const ax = p.view && p.view.axes3d;
    if (ax && ax.o) {
      const o = toWorld(ax.o), dirs = axisDirs(), L = Math.max(3, ctx.extentSize() * 0.3);
      notes.add(line([o, o.clone().addScaledVector(dirs.axisX, L)], COLORS.axisX, { width: 2 }), line([o, o.clone().addScaledVector(dirs.axisY, L)], COLORS.axisY, { width: 2 }), line([o, o.clone().addScaledVector(dirs.axisZ, L)], COLORS.axisZ, { width: 2 }));
    }
    dirty();
  }

  // The active section plane as a world clipping plane (keeps distance ≥ 0).
  let activePlane = null;
  function sectionPlane() {
    const p = project();
    const s = p && opts.sectionCuts !== false ? (p.sections || []).find((x) => x.active) : null;
    if (!s) { activePlane = null; return null; }
    const n = dirW(s.n), o = toWorld(s.o);
    activePlane = new THREE.Plane(n, -n.dot(o));
    activePlane.userData = { id: s.id };
    return activePlane;
  }
  const clipPlanes = () => { const pl = sectionPlane(); return pl ? [pl] : []; };

  // Filled cut faces (SketchUp's section fill): stencil count of the back
  // faces behind the cut, then a cap where the count is odd.
  function rebuildCaps() {
    clearGroup(caps);
    const pl = activePlane || (renderer.clippingPlanes || [])[0];
    if (!pl || opts.sectionFill === false) return;
    const local = activePlane ? [activePlane] : null;
    const capColor = (project() && project().style3d && project().style3d.sectionFill) || "#3b4250";
    const mk = (side, op) => new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
    const back = mk(THREE.BackSide, THREE.IncrementWrapStencilOp), front = mk(THREE.FrontSide, THREE.DecrementWrapStencilOp);
    back.clippingPlanes = local; front.clippingPlanes = local;
    const group = new THREE.Group();
    ctx.building.updateMatrixWorld(true);
    let n = 0;
    ctx.building.traverseVisible((o) => {
      if (!o.isMesh || n > 4000) return;
      if (!o.layers.isEnabled(0)) return; // drawn by a batch: capped with it below
      const base = o.userData.baseMaterial || o.material;
      if ((base && base.transparent) || o.userData.open) return; // only closed solids have an inside to fill
      for (const m of [back, front]) {
        const s = new THREE.Mesh(o.geometry, m);
        s.matrixAutoUpdate = false;
        s.matrix.copy(o.matrixWorld);
        s.renderOrder = 20;
        s.userData.shared = true;
        s.raycast = () => {};
        group.add(s);
      }
      n++;
    });
    // Batched repeats (viewer batch.js): one stencil pass per batch, sharing its instances.
    for (const im of ctx.batches ? ctx.batches() : []) {
      for (const m of [back, front]) {
        const s = new THREE.InstancedMesh(im.geometry, m, im.count);
        s.instanceMatrix = im.instanceMatrix;
        s.boundingSphere = im.boundingSphere;
        s.renderOrder = 20;
        s.userData.shared = true;
        s.raycast = () => {};
        group.add(s);
      }
    }
    const span = Math.max(50, ctx.extentSize() * 4);
    const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.9, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp, polygonOffset: true, polygonOffsetFactor: -1 });
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(span, span), capMat);
    const coplanar = pl.coplanarPoint(V());
    cap.position.copy(coplanar).addScaledVector(pl.normal, 0.0005);
    cap.lookAt(coplanar.clone().add(pl.normal));
    cap.renderOrder = 21;
    cap.raycast = () => {};
    cap.onAfterRender = (r) => r.clearStencil();
    caps.add(group, cap);
    dirty();
  }

  // ---------------------------------------------------------------- styles: profiles, colour by tag
  let profileData = null;
  let profileKey = "";
  function buildProfileData() {
    const segs = [];
    ctx.building.updateMatrixWorld(true);
    ctx.building.traverseVisible((o) => {
      if (!o.isMesh || segs.length > 1.2e6) return;
      const base = o.userData.baseMaterial || o.material;
      if (base && base.transparent) return;
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      const idx = o.geometry.index;
      const vtx = (i) => V().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
      const count = idx ? idx.count : pos.count;
      const map = new Map();
      const key = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
      for (let i = 0; i + 2 < count; i += 3) {
        const a = vtx(i), b = vtx(i + 1), c = vtx(i + 2);
        const n = b.clone().sub(a).cross(c.clone().sub(a));
        if (n.lengthSq() < 1e-16) continue;
        n.normalize();
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
          const ka = key(p), kb = key(q);
          const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const e = map.get(k);
          if (e) e.n2 = n; else map.set(k, { a: p, b: q, n1: n, n2: null });
        }
      }
      for (const e of map.values()) {
        if (e.n2 && e.n1.dot(e.n2) > 0.9999) continue; // inside a flat face
        segs.push(e);
      }
    });
    profileData = segs;
  }
  function updateProfiles(force = false) {
    const st3 = project() && project().style3d;
    if (!opts.profiles || !st3) { if (profiles.children.length) { clearGroup(profiles); dirty(); } return; }
    if (!profileData) buildProfileData();
    const c = cam();
    const ortho = !!c.isOrthographicCamera;
    const k = `${c.position.toArray().map((v) => v.toFixed(3)).join(",")}|${ortho}|${renderer.domElement.width}`;
    if (!force && k === profileKey) return;
    profileKey = k;
    const view = c.getWorldDirection(V());
    const out = [];
    for (const e of profileData) {
      let sil;
      if (!e.n2) sil = true;
      else {
        const v = ortho ? view.clone().negate() : c.position.clone().sub(e.a);
        sil = (e.n1.dot(v) > 0) !== (e.n2.dot(v) > 0);
      }
      if (sil) out.push(e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z);
    }
    clearGroup(profiles);
    if (!out.length) return;
    const g = new LineSegmentsGeometry();
    g.setPositions(out);
    const mat = new LineMaterial({ color: new THREE.Color(st3.edgeColor || "#1d2128"), linewidth: opts.profileWidth || 3, worldUnits: false });
    mat.resolution.set(renderer.domElement.width, renderer.domElement.height);
    if (activePlane) mat.clippingPlanes = [activePlane];
    const ls = new LineSegments2(g, mat);
    ls.computeLineDistances();
    ls.raycast = () => {};
    ls.renderOrder = 8;
    profiles.add(ls);
  }

  const tagMats = new Map();
  function applyStyleExtras() {
    const p = project();
    if (opts.colorByTag && p) {
      const layers = new Map((p.layers || []).map((l) => [l.id, l.color || "#9aa4b5"]));
      const byId = new Map();
      for (const k of ["walls", "openings", "rooms", "columns", "stairs", "furniture", "roofs", "solids"]) for (const it of p[k] || []) byId.set(it.id, it.layer || "0");
      ctx.building.traverse((o) => {
        if (!o.isMesh) return;
        const col = layers.get(byId.get(o.userData.id) || "0") || "#9aa4b5";
        if (!tagMats.has(col)) tagMats.set(col, new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, side: THREE.DoubleSide, name: `tag ${col}` }));
        const base = o.userData.baseMaterial || o.material;
        if (!(base && base.transparent)) o.material = tagMats.get(col);
      });
    }
    profileData = null;
    profileKey = "";
    updateProfiles(true);
    updateWatermark();
  }

  function updateWatermark() {
    const s = project() && project().style3d;
    const text = s && s.watermark;
    if (!text) { mark.style.display = "none"; return; }
    mark.textContent = text;
    const pos = s.watermarkPos || "br";
    Object.assign(mark.style, { display: "block", left: "", right: "", top: "", bottom: "", transform: "" });
    if (pos === "c") Object.assign(mark.style, { left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontSize: "34px" });
    else Object.assign(mark.style, { [pos[0] === "t" ? "top" : "bottom"]: "14px", [pos[1] === "l" ? "left" : "right"]: "16px", fontSize: "18px" });
  }

  // Screenshot with the watermark drawn in.
  function composite(srcCanvas) {
    const s = project() && project().style3d;
    if (!s || !s.watermark) return srcCanvas.toDataURL("image/png");
    const c = document.createElement("canvas");
    c.width = srcCanvas.width; c.height = srcCanvas.height;
    const g = c.getContext("2d");
    g.drawImage(srcCanvas, 0, 0);
    const k = c.width / Math.max(1, srcCanvas.clientWidth || c.width);
    const pos = s.watermarkPos || "br";
    g.font = `600 ${Math.round((pos === "c" ? 34 : 18) * k)}px 'Segoe UI', sans-serif`;
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 3 * k;
    g.textAlign = pos === "c" ? "center" : pos[1] === "l" ? "left" : "right";
    g.textBaseline = pos === "c" ? "middle" : pos[0] === "t" ? "top" : "bottom";
    const x = pos === "c" ? c.width / 2 : pos[1] === "l" ? 16 * k : c.width - 16 * k;
    const y = pos === "c" ? c.height / 2 : pos[0] === "t" ? 14 * k : c.height - 14 * k;
    g.fillText(s.watermark, x, y);
    return c.toDataURL("image/png");
  }

  // ---------------------------------------------------------------- two-point perspective
  function twoPoint() {
    const c = cam();
    if (!opts.twoPoint || !c.isPerspectiveCamera || opts.navMode === "walk") return;
    const t = controls.target;
    const dir = t.clone().sub(c.position);
    const horiz = Math.hypot(dir.x, dir.z);
    if (horiz < 1e-6) return;
    const pitch = Math.atan2(dir.y, horiz);
    c.lookAt(c.position.x + dir.x, c.position.y, c.position.z + dir.z);
    c.updateProjectionMatrix();
    // Shift the picture so the target stays in the middle, verticals vertical.
    c.projectionMatrix.elements[9] += Math.tan(pitch) / Math.tan((c.fov * Math.PI) / 360);
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    c.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------- component editing
  let editBox = null;
  function updateEditBox() {
    if (editBox) { scene.remove(editBox); editBox.geometry.dispose(); editBox = null; }
    if (!editing) { dirty(); return; }
    const objs = itemObjects([editing.inst]);
    if (!objs.length) return;
    const box = new THREE.Box3();
    for (const x of objs) box.expandByObject(x.obj);
    editBox = new THREE.Box3Helper(box, 0x2979ff);
    editBox.raycast = () => {};
    scene.add(editBox);
    dirty();
  }
  function setEditing(e) { editing = e; updateEditBox(); }

  // ---------------------------------------------------------------- frames (animation export)
  // Put the camera exactly at a point between two saved views.
  function cameraBetween(a, b, t) {
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const pa = V(...a.pos), pb = V(...b.pos), ta = V(...a.target), tb = V(...b.target);
    const target = ta.clone().lerp(tb, e);
    const da = pa.clone().sub(ta), db = pb.clone().sub(tb);
    const len = da.length() + (db.length() - da.length()) * e;
    const dir = da.clone().normalize().lerp(db.clone().normalize(), e).normalize();
    controls.target.copy(target);
    cam().position.copy(target).addScaledVector(dir, len);
    cam().lookAt(target);
    controls.update();
    dirty();
  }

  // ---------------------------------------------------------------- lifecycle
  function afterRebuild() {
    edgeCache = null;
    screenCache = null;
    profileData = null;
    rebuildNotes();
    if (editing && !itemObjects([editing.inst]).length) editing = null;
    updateEditBox();
  }
  // The active section plane clips the model's materials only (the ground,
  // grid and notes stay whole).
  function applyLocalClip() {
    const pl = sectionPlane();
    const planes = pl ? [pl] : null;
    const set = (o) => {
      if (!o.material || o.userData.shared) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        if ((m.clippingPlanes ? m.clippingPlanes.length : 0) !== (planes ? planes.length : 0)) m.needsUpdate = true;
        m.clippingPlanes = planes;
        m.clipShadows = !!planes; // the cut-away part casts no shadow
      }
    };
    ctx.building.traverse(set);
    const edges = scene.getObjectByName("edges");
    if (edges) edges.traverse(set);
    profiles.traverse(set);
  }
  function afterClipping() { applyLocalClip(); rebuildCaps(); rebuildNotes(); }
  function setOptions(o, changed) {
    if (changed("tool")) {
      if (st) restore(st.objs);
      st = null; push = null; vcb = ""; axisLock = null; shiftLock = null; downAt = null;
      clearGroup(overlay);
      tip.style.display = "none";
      if (opts.tool === "none") lastCopy = null;
    }
    if (["guides", "showSections"].some(changed)) rebuildNotes();
    if (["profiles", "profileWidth", "edgeColor"].some(changed)) { profileKey = ""; updateProfiles(true); }
    dirty();
  }
  function beforeRender() {
    twoPoint();
    if (opts.profiles) updateProfiles();
  }
  if (typeof window !== "undefined") window.addEventListener("myarch-texture", () => dirty());

  return {
    pointerDown, pointerMove, pointerUp, dblClick, key, afterRebuild, afterClipping, setOptions, beforeRender, clipPlanes, applyStyleExtras, composite,
    api: {
      skEditing: () => (editing ? { ...editing } : null),
      skSetEditing: (e) => setEditing(e),
      skState: () => ({ tool: opts.tool, busy: !!st || !!push, vcb, axisLock, pts: st && st.pts ? st.pts.length : 0, editing: editing ? { ...editing } : null }),
      skLastCopy: (c) => { if (c !== undefined) lastCopy = c; return lastCopy; },
      skNotes: () => notes.children.length,
      skCaps: () => caps.children.length,
      skProfiles: () => (profiles.children[0] ? profiles.children[0].geometry.instanceCount || 0 : 0),
      skCameraBetween: cameraBetween,
      skRefresh: () => { rebuildNotes(); rebuildCaps(); applyStyleExtras(); },
      skScreenOf: (q) => { const s = toScreen(toWorld(q)); return [s.x, s.y]; },
    },
  };
}
