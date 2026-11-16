// Draw-call batching for the 3D view. A building of a few hundred items has
// tens of thousands of meshes (every furniture part, frame and door leaf is
// one), and the GPU pays per mesh, not per triangle. Meshes that share a
// geometry and a material are drawn as one InstancedMesh instead.
//
// The building itself is left untouched: its batched meshes move to the
// HIDDEN layer, which the camera does not draw but the raycaster still hits,
// so picking, highlighting, export, edges and the SketchUp tools keep working
// on the real meshes. show(ids) puts an item's own meshes back on screen (and
// its instances away) while it is highlighted or being dragged.

import { simplified } from "./simplify.js";

export const HIDDEN_LAYER = 1;

// cull(): an instance under this radius on screen (device pixels) is drawn
// with its batch's coarse copy (simplify.js), when the batch has one.
export const LOD_RADIUS_PX = 10;

// cull(): an instance whose bounding sphere is under this radius on screen
// (device pixels) is not drawn — it would cover a pixel or two at most.
export const MIN_RADIUS_PX = 0.6;

// Meshes that are worth batching: plain opaque meshes whose geometry is used
// more than once. Glowing lamp parts change material on a switch, transparent
// ones need sorting (unless their material says the order does not matter:
// userData.orderFree, the x-ray style), and skinned / morphing models animate:
// they stay as they are.
function eligible(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
  if (o.userData.glow || o.userData.noBatch) return false;
  const m = o.userData.hl || o.material; // the material under a highlight
  if (!m || Array.isArray(m) || (m.transparent && !m.userData.orderFree)) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return false;
  return true;
}

export function createBatcher(THREE) {
  const group = new THREE.Group();
  group.name = "batches";
  let entries = new Map(); // item id → [{mesh, im, index}] (instanced) or [{mesh, bm, instance}] (merged)
  let shown = new Set(); // ids drawn by their own meshes
  let made = new Map(); // batch key → { objs: [its meshes in `group`], meshes, matrices }
  let stats = { batches: 0, instances: 0, merged: 0, mergedMeshes: 0, reused: 0 };
  const noStats = () => ({ batches: 0, instances: 0, merged: 0, mergedMeshes: 0, reused: 0 });

  const restore = (mesh) => { mesh.layers.set(0); mesh.matrixAutoUpdate = true; delete mesh.userData.merged; };
  function release() {
    for (const list of entries.values()) for (const e of list) restore(e.mesh);
    for (const c of group.children) c.dispose();
    group.clear();
    entries = new Map();
    made = new Map();
    shown = new Set();
    stats = noStats();
  }
  // A batched original stays in the building for picking, on the hidden layer.
  // It does not move while batched (a tool unbatches what it moves first), so
  // its matrix is not composed again every frame (17,000 of them in a tower).
  const hide = (mesh) => {
    mesh.layers.set(HIDDEN_LAYER); // its matrix is current: build() and every frame bring it up to date
    mesh.matrixAutoUpdate = false;
  };
  const addEntry = (mesh, e) => {
    const id = mesh.userData.id || "";
    if (!entries.has(id)) entries.set(id, []);
    entries.get(id).push({ mesh, ...e });
  };
  // The world matrices of `meshes`, one after another.
  const matricesOf = (meshes) => {
    const out = new Float32Array(meshes.length * 16);
    for (let i = 0; i < meshes.length; i++) out.set(meshes[i].matrixWorld.elements, i * 16);
    return out;
  };
  // The same meshes, in the same order, at the same places as when `old` was made.
  function unchanged(old, meshes) {
    if (!old || old.meshes.length !== meshes.length) return false;
    for (let i = 0; i < meshes.length; i++) {
      if (old.meshes[i] !== meshes[i]) return false;
      const e = meshes[i].matrixWorld.elements, m = old.matrices;
      for (let k = 0; k < 16; k++) if (Math.abs(m[i * 16 + k] - e[k]) > 1e-6) return false;
    }
    return true;
  }

  // Batch `root` (the building): after a rebuild or a change of materials
  // (render style, colour by tag). An edit rebuilds one level, and a batch
  // whose meshes it did not touch is kept as it is, so only the batches of
  // what changed are made again. `fresh`: the caller has just brought every
  // matrix of `root` up to date (viewer.js rebuild).
  function build(root, { fresh = false } = {}) {
    const keep = shown;
    show([]); // every item back in its batch: kept batches start clean
    if (!fresh) root.updateMatrixWorld(true);
    // One walk: how often each geometry is used, and what can be batched.
    const uses = new Map();
    const candidates = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      uses.set(o.geometry, (uses.get(o.geometry) || 0) + 1);
      if (eligible(o) && visibleUp(o)) candidates.push(o);
    });
    const buckets = new Map();
    const rest = [];
    for (const o of candidates) {
      if (uses.get(o.geometry) < 2) { rest.push(o); continue; }
      const mat = o.userData.hl || o.material;
      const key = `i|${o.geometry.uuid}|${mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { key, geometry: o.geometry, material: mat, cast: o.castShadow, receive: o.receiveShadow, meshes: [] }));
      b.meshes.push(o);
    }
    const prev = made, oldEntries = entries;
    made = new Map();
    entries = new Map();
    stats = noStats();
    for (const b of buckets.values()) {
      if (b.meshes.length < 2) { rest.push(b.meshes[0]); continue; }
      const old = prev.get(b.key);
      if (unchanged(old, b.meshes)) {
        const im = old.objs[0];
        b.meshes.forEach((mesh, i) => addEntry(mesh, { im, index: i }));
        made.set(b.key, old);
        stats.batches++;
        stats.instances += b.meshes.length;
        stats.reused++;
      } else instance(b);
    }
    mergeRest(rest, prev);
    // Batches not kept go; meshes no longer in any batch are drawn by themselves again.
    for (const [key, old] of prev) if (made.get(key) !== old) for (const o of old.objs) { group.remove(o); o.dispose(); }
    const batched = new Set();
    for (const list of entries.values()) for (const e of list) batched.add(e.mesh);
    for (const list of oldEntries.values()) for (const e of list) if (!batched.has(e.mesh)) restore(e.mesh);
    show(keep);
  }

  // Visible itself and all the way up (what traverseVisible would reach).
  const visibleUp = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

  // One InstancedMesh for meshes sharing a geometry and a material.
  function instance(b) {
    const n = b.meshes.length;
    const im = new THREE.InstancedMesh(b.geometry, b.material, n);
    im.name = `batch ${b.material.name || ""}`.trim();
    im.castShadow = b.cast;
    im.receiveShadow = b.receive;
    im.raycast = () => {}; // picking goes to the real meshes
    im.userData.batch = true;
    if (!b.geometry.boundingSphere) b.geometry.computeBoundingSphere();
    const gs = b.geometry.boundingSphere, gx = gs.center.x, gy = gs.center.y, gz = gs.center.z;
    // Every instance's matrix and bounding sphere: cull() picks the ones
    // drawn this frame out of these.
    const all = matricesOf(b.meshes), centre = new Float32Array(n * 3), radius = new Float32Array(n);
    let x1 = Infinity, y1 = Infinity, z1 = Infinity, x2 = -Infinity, y2 = -Infinity, z2 = -Infinity;
    for (let i = 0; i < n; i++) {
      const mesh = b.meshes[i], e = mesh.matrixWorld.elements;
      const cx = e[0] * gx + e[4] * gy + e[8] * gz + e[12], cy = e[1] * gx + e[5] * gy + e[9] * gz + e[13], cz = e[2] * gx + e[6] * gy + e[10] * gz + e[14];
      const s = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
      const r = gs.radius * s;
      centre[i * 3] = cx; centre[i * 3 + 1] = cy; centre[i * 3 + 2] = cz;
      radius[i] = r;
      if (cx - r < x1) x1 = cx - r; if (cy - r < y1) y1 = cy - r; if (cz - r < z1) z1 = cz - r;
      if (cx + r > x2) x2 = cx + r; if (cy + r > y2) y2 = cy + r; if (cz + r > z2) z2 = cz + r;
      hide(mesh);
      delete mesh.userData.merged; // (it may have been merged before)
      addEntry(mesh, { im, index: i });
    }
    im.instanceMatrix.array.set(all);
    im.instanceMatrix.needsUpdate = true;
    // Around every instance: the whole batch is culled as one before cull() thins it.
    im.boundingSphere = new THREE.Box3(new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)).getBoundingSphere(new THREE.Sphere());
    const c = (im.userData.cull = { all, centre, radius, own: new Uint8Array(n), kept: Uint32Array.from({ length: n }, (_, i) => i), count: n, stale: false, full: true, lod: null });
    group.add(im);
    const objs = [im];
    // Far copy (simplify.js): the same material and instances, coarse geometry.
    const coarse = simplified(THREE, b.geometry);
    if (coarse) {
      const lod = new THREE.InstancedMesh(coarse, b.material, n);
      lod.name = `${im.name} (far)`;
      lod.castShadow = b.cast;
      lod.receiveShadow = b.receive;
      lod.raycast = () => {};
      lod.userData.batchLod = true;
      lod.boundingSphere = im.boundingSphere; // the same instances
      lod.count = 0;
      lod.visible = false;
      Object.assign(c, { lod, lkept: new Uint32Array(n), lcount: 0 });
      group.add(lod);
      objs.push(lod);
    }
    made.set(b.key, { objs, meshes: b.meshes, matrices: all });
    stats.batches++;
    stats.instances += n;
  }

  // The meshes left over — walls, slabs, stairs: each its own geometry, so
  // instancing does not take them, and each was a draw call (hundreds in a
  // large building, and the CPU side of a draw call is what the frame waited
  // for). Those with the same material and attribute layout go into one
  // BatchedMesh: one multi-draw call, culled object by object by three.js.
  const layouts = new WeakMap(); // geometry → its attribute layout
  function layoutOf(g) {
    let k = layouts.get(g);
    if (k === undefined) {
      k = Object.keys(g.attributes).sort().map((n) => { const a = g.attributes[n]; return `${n}:${a.itemSize}${a.normalized ? "n" : ""}${a.array.constructor.name}`; }).join() + (g.index ? "|i" : "");
      layouts.set(g, k);
    }
    return k;
  }
  function mergeRest(meshes, prev) {
    const groups = new Map();
    for (const o of meshes) {
      const mat = o.userData.hl || o.material;
      const key = `m|${mat.uuid}|${layoutOf(o.geometry)}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let gr = groups.get(key);
      if (!gr) groups.set(key, (gr = { key, material: mat, cast: o.castShadow, receive: o.receiveShadow, meshes: [] }));
      gr.meshes.push(o);
    }
    for (const gr of groups.values()) {
      if (gr.meshes.length < 2) continue;
      const old = prev.get(gr.key);
      const m = (old && patchMerged(old, gr.meshes)) || newMerged(gr);
      for (const mesh of gr.meshes) addEntry(mesh, { bm: m.objs[0], instance: m.parts.get(mesh).instance });
      made.set(gr.key, m);
      if (m === old) stats.reused++;
      stats.merged++;
      stats.mergedMeshes += gr.meshes.length;
    }
  }

  // Room for what later edits add: a BatchedMesh cannot grow without being
  // copied, and space it has given out is only won back by making it again.
  const roomFor = (n) => Math.ceil(n * 1.25) + 64;
  const vertexCount = (g) => g.attributes.position.count;
  const indexCount = (g) => (g.index ? g.index.count : 0);

  function newMerged(gr) {
    const geos = [...new Set(gr.meshes.map((m) => m.geometry))];
    let vertices = 0, indices = 0;
    for (const g of geos) { vertices += vertexCount(g); indices += indexCount(g); }
    const bm = new THREE.BatchedMesh(roomFor(gr.meshes.length), roomFor(vertices), indices ? roomFor(indices) : 0, gr.material);
    bm.name = `merged ${gr.material.name || ""}`.trim();
    bm.castShadow = gr.cast;
    bm.receiveShadow = gr.receive;
    bm.sortObjects = false; // opaque: the CPU is the limit, not overdraw
    bm.raycast = () => {};
    bm.userData.batch = true;
    const m = { objs: [bm], geos: new Map(), parts: new Map() }; // geometry → {id, n}; mesh → {instance, matrix}
    for (const mesh of gr.meshes) addPart(m, mesh);
    group.add(bm);
    return m;
  }
  function addPart(m, mesh) {
    const bm = m.objs[0];
    let g = m.geos.get(mesh.geometry);
    if (!g) m.geos.set(mesh.geometry, (g = { id: bm.addGeometry(mesh.geometry), n: 0 }));
    g.n++;
    const instance = bm.addInstance(g.id);
    bm.setMatrixAt(instance, mesh.matrixWorld);
    hide(mesh);
    mesh.userData.merged = true; // section caps (sklayer.js) still cap it by itself
    m.parts.set(mesh, { instance, matrix: Float32Array.from(mesh.matrixWorld.elements) });
  }

  // An edit rebuilds one level: the merged batches spanning it lose that
  // level's old meshes and take its new ones in place, instead of being made
  // again (copying every wall and slab of the building). False when the room
  // left is not enough — then it is made again, and compacted.
  function patchMerged(m, meshes) {
    const bm = m.objs[0];
    const next = new Set(meshes);
    let gone = 0, added = 0, vertices = 0, indices = 0;
    const newGeos = new Set();
    for (const mesh of m.parts.keys()) if (!next.has(mesh)) gone++;
    for (const mesh of meshes) {
      if (m.parts.has(mesh)) continue;
      added++;
      const g = mesh.geometry;
      if (!m.geos.has(g) && !newGeos.has(g)) { newGeos.add(g); vertices += vertexCount(g); indices += indexCount(g); }
    }
    if (bm.instanceCount - gone + added > bm.maxInstanceCount || vertices > bm.unusedVertexCount || indices > bm.unusedIndexCount) return false;
    for (const [mesh, p] of m.parts) {
      if (next.has(mesh)) continue;
      bm.deleteInstance(p.instance);
      m.parts.delete(mesh);
      m.geos.get(mesh.geometry).n--; // its space stays given out (and kept for it) until the batch is made again
    }
    let moved = gone + added > 0;
    for (const mesh of meshes) {
      const p = m.parts.get(mesh);
      if (!p) { addPart(m, mesh); continue; }
      const e = mesh.matrixWorld.elements;
      let same = true;
      for (let k = 0; k < 16 && same; k++) same = Math.abs(p.matrix[k] - e[k]) <= 1e-6;
      if (!same) { bm.setMatrixAt(p.instance, mesh.matrixWorld); p.matrix.set(e); moved = true; }
    }
    if (moved) { bm.boundingSphere = null; bm.boundingBox = null; } // worked out again before the next frame
    return m;
  }

  // Draw these items with their own meshes (highlighted, dragged …); every
  // other batched item goes back to its instances.
  function show(ids) {
    const next = new Set(ids || []);
    const touched = new Set();
    const set = (id, own) => {
      for (const e of entries.get(id) || []) {
        if (own) { e.mesh.layers.set(0); e.mesh.matrixAutoUpdate = true; } else hide(e.mesh);
        if (e.bm) { e.bm.setVisibleAt(e.instance, !own); continue; }
        e.im.userData.cull.own[e.index] = own ? 1 : 0;
        e.im.userData.cull.stale = true; // the next cull() leaves it out / puts it back
        touched.add(e.im);
      }
    };
    for (const id of shown) if (!next.has(id)) set(id, false);
    for (const id of next) if (!shown.has(id)) set(id, true);
    shown = next;
    for (const im of touched) writeAll(im); // drawn right even before the next cull()
    return touched.size;
  }

  // Every instance (except those drawn by their own meshes) at full detail —
  // the state cull() starts from, and what a shadow pass needs (the sun sees
  // more than the camera).
  function writeAll(im) {
    const c = im.userData.cull, arr = im.instanceMatrix.array;
    let w = 0, changed = c.stale;
    for (let i = 0; i < c.radius.length; i++) {
      if (c.own[i]) continue;
      if (changed || c.kept[w] !== i || w >= c.count) { arr.set(c.all.subarray(i * 16, i * 16 + 16), w * 16); c.kept[w] = i; changed = true; }
      w++;
    }
    if (changed || w !== c.count) { im.count = c.count = w; im.instanceMatrix.needsUpdate = true; }
    im.visible = w > 0;
    if (c.lod) { c.lod.count = c.lcount = 0; c.lod.visible = false; }
    c.stale = false;
    c.full = true;
  }

  // Per-instance culling and level of detail before each frame. A batch holds
  // every chair, caster and door handle of the building, and the GPU drew
  // them all at full detail wherever the camera was. Here an instance outside
  // the view or under about a pixel is not drawn, and one under LOD_RADIUS_PX
  // is drawn with the batch's coarse copy (a tower seen whole: its furniture
  // costs a fraction; a room seen from inside: the rest of the building is
  // left out). Instance buffers are written again only when their set changes.
  // `all`: draw every instance in full (a frame that renders the shadow map).
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere(), v = new THREE.Vector3();
  function cull(camera, heightPx, { all = false } = {}) {
    if (all) { for (const im of group.children) { const c = im.userData.cull; if (c && (!c.full || c.stale)) writeAll(im); } return; }
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv, camera.coordinateSystem);
    const persp = !!camera.isPerspectiveCamera;
    // Pixels per metre: at distance 1 for a perspective, everywhere for an orthographic camera.
    const k = Math.max(1e-9, persp ? (heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360))) * (camera.zoom || 1) : (heightPx * camera.zoom) / Math.max(1e-9, camera.top - camera.bottom));
    const eye = camera.position, ex = eye.x, ey = eye.y, ez = eye.z;
    const minR = MIN_RADIUS_PX / k, lodR = LOD_RADIUS_PX / k;
    for (const im of group.children) {
      const c = im.userData.cull;
      if (!c) continue; // a far copy: filled with its batch
      const n = c.radius.length, arr = im.instanceMatrix.array;
      const lod = c.lod, larr = lod ? lod.instanceMatrix.array : null;
      let w = 0, wl = 0, changed = c.stale, lchanged = c.stale;
      for (let i = 0; i < n; i++) {
        if (c.own[i]) continue;
        const r = c.radius[i], x = c.centre[i * 3], y = c.centre[i * 3 + 1], z = c.centre[i * 3 + 2];
        // Distance in units of the camera's scale: r / s is the radius on screen over k.
        let s = 1;
        if (persp) { const dx = x - ex, dy = y - ey, dz = z - ez; const d = Math.sqrt(dx * dx + dy * dy + dz * dz); s = d > r ? d : 0; }
        if (r < minR * s) continue;
        sphere.center.set(x, y, z);
        sphere.radius = r;
        if (!frustum.intersectsSphere(sphere)) continue;
        if (lod && r < lodR * s) {
          if (lchanged || c.lkept[wl] !== i || wl >= c.lcount) { larr.set(c.all.subarray(i * 16, i * 16 + 16), wl * 16); c.lkept[wl] = i; lchanged = true; }
          wl++;
          continue;
        }
        if (changed || c.kept[w] !== i || w >= c.count) { arr.set(c.all.subarray(i * 16, i * 16 + 16), w * 16); c.kept[w] = i; changed = true; }
        w++;
      }
      if (changed || w !== c.count) { im.count = c.count = w; im.instanceMatrix.needsUpdate = true; }
      if (lod && (lchanged || wl !== c.lcount)) { lod.count = c.lcount = wl; lod.instanceMatrix.needsUpdate = true; }
      // An empty one is not even visited by the renderer.
      im.visible = w > 0;
      if (lod) lod.visible = wl > 0;
      c.stale = false;
      c.full = false;
    }
  }

  return {
    group, build, show, release, cull,
    isShown: (id) => shown.has(id),
    info: () => ({ ...stats, shown: shown.size }),
  };
}
