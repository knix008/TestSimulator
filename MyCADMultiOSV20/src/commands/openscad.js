// FreeCAD's OpenSCAD workbench commands MyCAD did not have yet: hull and
// Minkowski sum, mesh boolean, mirror / scale / resize of meshes, colour
// coding shapes by what they are, expanding group placements, exploding
// groups, removing objects with what they contain, and replacing an object.
import './openscad-icons.js';
import { addEntity } from '../domain/drawing.js';
import { solidMesh, meshVolume } from '../domain/solids.js';
import { analyzeMesh } from '../domain/meshcheck.js';
import { pathPoints } from '../domain/draft.js';
import { boundingBox, convexHull2d, convexHull3d, minkowskiHull } from '../domain/meshops.js';
import { apply as apply3, rotationOf } from '../domain/transform3d.js';


export function openscadCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const solids = () => app.selectedSolids();
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const ask = async (titleKey, icon, fields) => { const a = await app.form({ title: t(titleKey), icon, width: 460, fields, actions: ok() }); return a?.action === 'ok' ? a.values : null; };
  const newMesh = (d, name, tris, layer) => addEntity(d, 'solid', { kind: 'mesh', name, params: {}, shape: { tris: tris.flat(2) }, ...(layer ? { layer } : {}) });

  /** OpenSCAD_Hull: of the selected solids (3D), or of the selected 2D geometry (a closed outline). */
  function hull() {
    const list = solids();
    if (list.length) {
      const tris = convexHull3d(list.flatMap((e) => solidMesh(e).flat()));
      if (!tris.length) { app.notify('info', t('scad.flat')); return null; }
      const made = app.change('scad.op.hull', (d) => newMesh(d, t('scad.hull'), tris, list[0].layer));
      app.select([made.id]);
      return made;
    }
    const pts = app.selectedEntities().flatMap((e) => (e.type === 'point' ? [{ x: e.x, y: e.y }] : pathPoints(e)?.points ?? []));
    const outline = convexHull2d(pts);
    if (outline.length < 3) { app.notify('info', t('scad.pickForHull')); return null; }
    const made = app.change('scad.op.hull', (d) => addEntity(d, 'polyline', { points: outline, closed: true }));
    app.select([made.id]);
    return made;
  }

  function minkowski() {
    const [a, b] = solids();
    const tris = minkowskiHull(solidMesh(a), solidMesh(b));
    const made = app.change('scad.op.minkowski', (d) => newMesh(d, `${t('scad.minkowski')} (${app.labelOf(a)} ⊕ ${app.labelOf(b)})`, tris, a.layer));
    app.select([made.id]);
    return made;
  }

  async function meshBoolean() {
    const v = await ask('scad.meshBoolean', 'scadMeshBoolean', [{ key: 'op', type: 'select', label: t('scad.operation'), icon: 'scadMeshBoolean', value: 'union', options: ['union', 'cut', 'common'].map((op) => [op, t(`bool.${op}`)]) }]);
    if (v) app.run(`bool:${v.op}`);
  }

  /** Mesh copies of the selected solids changed by f(tris). */
  function meshCopies(label, nameKey, f) {
    const list = solids();
    const made = app.change(label, (d) => list.map((e) => newMesh(d, `${t(nameKey)} (${app.labelOf(e)})`, f(solidMesh(e)), e.layer)));
    app.select(made.map((e) => e.id));
    return made;
  }

  async function mirrorMesh() {
    const v = await ask('scad.mirrorMesh', 'scadMirrorMesh', [
      { key: 'nx', type: 'number', label: t('scad.normalX'), icon: 'axes', value: 1, step: 1 },
      { key: 'ny', type: 'number', label: t('scad.normalY'), icon: 'axes', value: 0, step: 1 },
      { key: 'nz', type: 'number', label: t('scad.normalZ'), icon: 'axes', value: 0, step: 1 },
    ]);
    if (!v) return;
    const l = Math.hypot(v.nx, v.ny, v.nz) || 1;
    const n = [v.nx / l, v.ny / l, v.nz / l];
    // Mirror through the plane at the origin with that normal (as OpenSCAD's mirror()); triangles turned to stay outward.
    const m = (p) => { const s = 2 * (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]); return [p[0] - s * n[0], p[1] - s * n[1], p[2] - s * n[2]]; };
    meshCopies('scad.op.mirror', 'scad.mirrored', (tris) => tris.map(([a, b, c]) => [m(a), m(c), m(b)]));
  }

  async function scaleMesh() {
    const v = await ask('scad.scaleMesh', 'scadScaleMesh', ['x', 'y', 'z'].map((k) => ({ key: k, type: 'number', label: t(`scad.factor${k.toUpperCase()}`), icon: 'scadScaleMesh', value: 2, step: 0.1 })));
    if (!v) return;
    const s = [v.x, v.y, v.z];
    const flip = s[0] * s[1] * s[2] < 0;
    meshCopies('scad.op.scale', 'scad.scaled', (tris) => tris.map((tri) => { const out = tri.map((p) => p.map((x, k) => x * s[k])); return flip ? [out[0], out[2], out[1]] : out; }));
  }

  async function resizeMesh() {
    const box = boundingBox(solidMesh(solids()[0]));
    const v = await ask('scad.resizeMesh', 'scadResizeMesh', ['x', 'y', 'z'].map((k, i) => ({ key: k, type: 'number', label: t(`scad.size${k.toUpperCase()}`), icon: 'scadResizeMesh', value: Math.round(box.size[i] * 1000) / 1000, min: 0, step: 1, unit: 'mm' })));
    if (!v) return;
    // OpenSCAD's resize(): each axis to its new size about the box's corner (0 keeps that axis).
    meshCopies('scad.op.resize', 'scad.resized', (tris) => {
      const b = boundingBox(tris);
      const f = [v.x, v.y, v.z].map((size, k) => (size > 0 && b.size[k] > 1e-12 ? size / b.size[k] : 1));
      return tris.map((tri) => tri.map((p) => p.map((x, k) => b.min[k] + (x - b.min[k]) * f[k])));
    });
  }

  /** OpenSCAD_ColorCodeShape: green — a closed solid; yellow — an open shell; red — broken (self-crossing, bad faces). */
  function colorCode() {
    const list = solids().length ? solids() : drawing().entities.filter((e) => e.type === 'solid' && e.kind !== 'datum' && e.kind !== 'wire3d' && e.kind !== 'points');
    const verdict = (e) => {
      const tris = solidMesh(e);
      const r = analyzeMesh(tris, { selfCheck: tris.length < 4000 });
      const broken = (r.counts?.selfIntersections ?? r.selfIntersections ?? 0) > 0 || (r.counts?.degenerate ?? r.degenerate ?? 0) > 0;
      if (broken) return '#ef4444';
      const open = (r.counts?.openEdges ?? r.openEdges ?? 0) > 0 || Math.abs(meshVolume(tris)) < 1e-9;
      return open ? '#f59e0b' : '#22c55e';
    };
    app.change('scad.op.color', (d) => { for (const e of list) app.D.updateEntity(d, e.id, { color: verdict(e) }); });
    app.notify('success', t('scad.colored', { count: list.length }));
  }

  /** OpenSCAD_ExpandPlacements: a Part group's placement moved into its solids (the group's becomes zero). */
  function expandPlacements() {
    const parts = (drawing().groups ?? []).filter((g) => g.part && g.placement && (g.placement.x || g.placement.y || g.placement.z || g.placement.rz));
    if (!parts.length) { app.notify('info', t('scad.noPlacements')); return; }
    app.change('scad.op.expand', (d) => {
      for (const g of parts) {
        const R = rotationOf({ rz: g.placement.rz });
        for (const e of d.entities.filter((x) => x.group === g.id && x.type === 'solid')) {
          const p = apply3(R, [e.x ?? 0, e.y ?? 0, e.z ?? 0]);
          app.D.updateEntity(d, e.id, { x: p[0] + g.placement.x, y: p[1] + g.placement.y, z: p[2] + g.placement.z, rz: (e.rz ?? 0) + g.placement.rz });
        }
      }
      d.groups = d.groups.map((g) => (parts.some((p) => p.id === g.id) ? { ...g, placement: { x: 0, y: 0, z: 0, rz: 0 } } : g));
    });
    app.notify('success', t('scad.expanded', { count: parts.length }));
  }

  const pickedGroup = () => (drawing().groups ?? []).find((g) => g.id === state.treeGroup) ?? (drawing().groups ?? []).find((g) => g.id === app.selectedEntities()[0]?.group) ?? null;

  /** OpenSCAD_ExplodeGroup: the group's contents move up to its parent and the group goes. */
  function explodeGroup() {
    const g = pickedGroup();
    if (!g) { app.notify('info', t('scad.pickGroup')); return; }
    app.change('scad.op.explodeGroup', (d) => {
      for (const e of d.entities) if (e.group === g.id) { if (g.parent) e.group = g.parent; else delete e.group; }
      d.groups = d.groups.filter((x) => x.id !== g.id).map((x) => (x.parent === g.id ? { ...x, parent: g.parent ?? null } : x));
    });
    state.treeGroup = null;
    app.showTree();
  }

  /** OpenSCAD_RemoveSubtree: the selection and what it contains (a group with all its groups and objects). */
  function removeSubtree() {
    const g = pickedGroup();
    const ids = new Set(app.selectedIds());
    const groupIds = new Set();
    if (g && state.treeGroup === g.id) {
      groupIds.add(g.id);
      let grew = true;
      while (grew) { grew = false; for (const x of drawing().groups ?? []) if (x.parent && groupIds.has(x.parent) && !groupIds.has(x.id)) { groupIds.add(x.id); grew = true; } }
    }
    const before = drawing().entities.length;
    app.change('scad.op.remove', (d) => {
      d.entities = d.entities.filter((e) => !ids.has(e.id) && !(e.group && groupIds.has(e.group)));
      if (groupIds.size) d.groups = d.groups.filter((x) => !groupIds.has(x.id));
    });
    state.treeGroup = null;
    app.notify('success', t('scad.removed', { count: before - drawing().entities.length }));
  }

  /** OpenSCAD_ReplaceObject: the second selected object takes the first's place (group, joints, links, attachments). */
  function replaceObject() {
    const [oldOne, newOne] = app.selectedIds().map((id) => drawing().entities.find((e) => e.id === id));
    app.change('scad.op.replace', (d) => {
      const swap = (id) => (id === oldOne.id ? newOne.id : id);
      d.entities = d.entities.map((e) => {
        if (e.id === newOne.id) return { ...e, ...(oldOne.group ? { group: oldOne.group } : {}) };
        let out = e;
        if (e.clone?.of === oldOne.id) out = { ...out, clone: { ...out.clone, of: newOne.id } };
        if (e.attach?.refs?.some?.((r) => r.id === oldOne.id)) out = { ...out, attach: { ...out.attach, refs: out.attach.refs.map((r) => ({ ...r, id: swap(r.id) })) } };
        return out;
      });
      if (d.joints) d.joints = d.joints.map((j) => ({ ...j, base: swap(j.base), part: swap(j.part) }));
      if (d.constraints) d.constraints = d.constraints.map((c) => ({ ...c, refs: c.refs.map((r) => ({ ...r, id: swap(r.id) })) }));
    });
    app.notify('success', t('scad.replaced', { from: app.labelOf(oldOne), to: app.labelOf(newOne) }));
  }

  const hasSolid = () => solids().length > 0;
  return {
    'scad:hull': { icon: 'scadHull', label: 'scad.hull', enabled: () => app.selectedEntities().length > 0, run: () => hull() },
    'scad:minkowski': { icon: 'scadMinkowski', label: 'scad.minkowski', enabled: () => solids().length === 2, run: () => minkowski() },
    'scad:meshBoolean': { icon: 'scadMeshBoolean', label: 'scad.meshBoolean', enabled: () => solids().length >= 2, run: () => meshBoolean() },
    'scad:mirrorMesh': { icon: 'scadMirrorMesh', label: 'scad.mirrorMesh', enabled: hasSolid, run: () => mirrorMesh() },
    'scad:scaleMesh': { icon: 'scadScaleMesh', label: 'scad.scaleMesh', enabled: hasSolid, run: () => scaleMesh() },
    'scad:resizeMesh': { icon: 'scadResizeMesh', label: 'scad.resizeMesh', enabled: hasSolid, run: () => resizeMesh() },
    'scad:colorCode': { icon: 'scadColorCode', label: 'scad.colorCode', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: () => colorCode() },
    'scad:expandPlacements': { icon: 'scadExpandPlacements', label: 'scad.expandPlacements', enabled: () => Boolean(drawing()?.groups?.some((g) => g.part)), run: () => expandPlacements() },
    'scad:explodeGroup': { icon: 'scadExplodeGroup', label: 'scad.explodeGroup', enabled: () => Boolean(drawing()?.groups?.length), run: () => explodeGroup() },
    'scad:removeSubtree': { icon: 'scadRemoveSubtree', label: 'scad.removeSubtree', enabled: () => app.selectedIds().length > 0 || Boolean(state.treeGroup), run: () => removeSubtree() },
    'scad:replace': { icon: 'scadReplace', label: 'scad.replace', enabled: () => app.selectedIds().length === 2, run: () => replaceObject() },
  };
}

export const OPENSCAD_MENU = ['scad:hull', 'scad:minkowski', 'scad:meshBoolean', '-', 'scad:mirrorMesh', 'scad:scaleMesh', 'scad:resizeMesh', '-', 'scad:colorCode', 'scad:expandPlacements', 'scad:explodeGroup', 'scad:removeSubtree', 'scad:replace'];

export const OPENSCAD_FREECAD = {
  OpenSCAD_ColorCodeShape: 'scad:colorCode', OpenSCAD_Edgestofaces: 'part:makeFace', OpenSCAD_ExpandPlacements: 'scad:expandPlacements', OpenSCAD_ExplodeGroup: 'scad:explodeGroup',
  OpenSCAD_Hull: 'scad:hull', OpenSCAD_IncreaseToleranceFeature: 'part:tolerance', OpenSCAD_MeshBoolean: 'scad:meshBoolean', OpenSCAD_Minkowski: 'scad:minkowski',
  OpenSCAD_MirrorMeshFeature: 'scad:mirrorMesh', OpenSCAD_RefineShapeFeature: 'part:refine', OpenSCAD_RemoveSubtree: 'scad:removeSubtree', OpenSCAD_ReplaceObject: 'scad:replace',
  OpenSCAD_ResizeMeshFeature: 'scad:resizeMesh', OpenSCAD_ScaleMeshFeature: 'scad:scaleMesh',
};
