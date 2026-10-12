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

export const HIDDEN_LAYER = 1;

// Meshes that are worth batching: plain opaque meshes whose geometry is used
// more than once. Glowing lamp parts change material on a switch, transparent
// ones need sorting, and skinned / morphing models animate: they stay as they are.
function eligible(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
  if (o.userData.glow || o.userData.noBatch) return false;
  const m = o.userData.hl || o.material; // the material under a highlight
  if (!m || Array.isArray(m) || m.transparent) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return false;
  return true;
}

export function createBatcher(THREE) {
  const group = new THREE.Group();
  group.name = "batches";
  let entries = new Map(); // item id → [{mesh, im, index, matrix}]
  let shown = new Set(); // ids drawn by their own meshes
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let stats = { batches: 0, instances: 0 };

  function release() {
    for (const list of entries.values()) for (const e of list) e.mesh.layers.set(0);
    for (const c of group.children) c.dispose();
    group.clear();
    entries = new Map();
    stats = { batches: 0, instances: 0 };
  }

  // Batch `root` (the building) again from scratch: after a rebuild or a
  // change of materials (render style, colour by tag).
  function build(root) {
    release();
    root.updateMatrixWorld(true);
    const uses = new Map();
    root.traverse((o) => { if (o.isMesh) uses.set(o.geometry, (uses.get(o.geometry) || 0) + 1); });
    const buckets = new Map();
    root.traverseVisible((o) => {
      if (!eligible(o) || uses.get(o.geometry) < 2) return;
      const mat = o.userData.hl || o.material;
      const key = `${o.geometry.uuid}|${mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { geometry: o.geometry, material: mat, cast: o.castShadow, receive: o.receiveShadow, meshes: [] }));
      b.meshes.push(o);
    });
    for (const b of buckets.values()) {
      if (b.meshes.length < 2) continue;
      const im = new THREE.InstancedMesh(b.geometry, b.material, b.meshes.length);
      im.name = `batch ${b.material.name || ""}`.trim();
      im.castShadow = b.cast;
      im.receiveShadow = b.receive;
      im.raycast = () => {}; // picking goes to the real meshes
      im.userData.batch = true;
      b.meshes.forEach((mesh, i) => {
        const matrix = mesh.matrixWorld.clone();
        im.setMatrixAt(i, matrix);
        mesh.layers.set(HIDDEN_LAYER);
        const id = mesh.userData.id || "";
        if (!entries.has(id)) entries.set(id, []);
        entries.get(id).push({ mesh, im, index: i, matrix });
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
      stats.batches++;
      stats.instances += b.meshes.length;
    }
    const keep = shown;
    shown = new Set();
    show(keep);
  }

  // Draw these items with their own meshes (highlighted, dragged …); every
  // other batched item goes back to its instances.
  function show(ids) {
    const next = new Set(ids || []);
    const touched = new Set();
    const set = (id, own) => {
      for (const e of entries.get(id) || []) {
        e.mesh.layers.set(own ? 0 : HIDDEN_LAYER);
        e.im.setMatrixAt(e.index, own ? zero : e.matrix);
        touched.add(e.im);
      }
    };
    for (const id of shown) if (!next.has(id)) set(id, false);
    for (const id of next) if (!shown.has(id)) set(id, true);
    for (const im of touched) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    shown = next;
    return touched.size;
  }

  return {
    group, build, show, release,
    isShown: (id) => shown.has(id),
    info: () => ({ ...stats, shown: shown.size }),
  };
}
