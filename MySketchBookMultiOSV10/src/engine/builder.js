// Document → three.js objects, incrementally. Every entity remembers the JSON it
// was built from; sync() rebuilds only what changed, so moving one chair in a
// furnished house touches one object. Walls of a level are rebuilt together
// (their joins depend on each other), still only when a wall or opening changed.
//
// Library items are built once per (item, params, quality) as a template; every
// placed copy is a clone that shares geometry, BVH and materials with it.
//
// Draw calls: a template's opaque parts of one material are merged into one mesh (after its
// edges are taken), a wall draws one group per material (not per side), and placed objects
// and template parts keep fixed matrices (no per-frame matrix work; placeTransform updates them).
import * as THREE from 'three';
import { ShapeUtils } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMaterial } from './materials.js';
import { wallCorners, wallFootprints, wallMesh, wallDir, wallNormal, wallLength, floorTriangles } from './walls.js';
import { levelOf } from './document.js';
import { swingMeta, doorSwingLines } from './doorswing.js';
import { columnFootprint, columnsOf, isColumn } from './planedit.js';
import { catalogItem, itemParams, assetApi } from '../library/catalog.js';
import { holePolygons } from './stairs.js';

const modelingModules = import.meta.glob('../modeling/mesh.js', { eager: true });
const GeoMesh = () => Object.values(modelingModules)[0]?.GeoMesh ?? null;

const EDGE_COLOR = '#1d232b';
const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.55 });
/** Flat plan-cut fills by colour (unlit, kept through the display styles). */
const CUT_MATERIALS = new Map();
function cutColorMaterial(color) {
  let m = CUT_MATERIALS.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
    m.userData.keepStyle = true;
    CUT_MATERIALS.set(color, m);
  }
  return m;
}

/** A plan cut face: the footprint [[x, z], …] as a horizontal face at height y, facing up (lit like a wall top). */
function planCutGeometry(footprint, y) {
  const tris = ShapeUtils.triangulateShape(footprint.map(([x, z]) => new THREE.Vector2(x, z)), []);
  // Wound counter-clockwise seen from above, so the face (and its lighting) points up.
  const index = tris.flatMap(([i, j, k]) => {
    const [ax, az] = footprint[i]; const [bx, bz] = footprint[j]; const [cx, cz] = footprint[k];
    return (bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0 ? [i, j, k] : [i, k, j];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(footprint.flatMap(([x, z]) => [x, y, z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(footprint.flatMap(() => [0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(footprint.flatMap(([x, z]) => [x, z]), 2));
  g.setIndex(index);
  return g;
}

export class SceneBuilder {
  constructor(viewport, { settings, onAsync } = {}) {
    this.viewport = viewport;
    this.settings = settings ?? (() => ({}));
    this.onAsync = onAsync ?? (() => {});
    this.root = viewport.content;
    this.groups = {};
    for (const name of ['walls', 'rooms', 'openings', 'objects', 'models', 'cuts', 'lights']) {
      const g = new THREE.Group();
      g.name = name;
      this.groups[name] = g;
      this.root.add(g);
    }
    this.groups.cuts.visible = false;
    this.built = new Map(); // id → { key, object }
    this.wallKeys = new Map(); // level → key
    this.templates = new Map();
    this.pendingAssets = new Map();
    this.edgeCache = new WeakMap();
    // The live GeoMesh of a model (tools/modeling.js keeps them, so drawing does not parse JSON again).
    this.meshOf = null;
  }

  /** Brings the three.js scene in line with the project. Returns true when anything changed. */
  sync(project) {
    let changed = false;
    const seen = new Set();
    const hiddenTags = new Set(project.tags.filter((t) => t.visible === false).map((t) => t.id));
    // Levels shown: every level, the active one only, or the active one and those below (Level view);
    // a level switched off in the Levels panel stays hidden in every view.
    const mode = this.levelMode?.(project) ?? 'all';
    const active = levelOf(project, project.activeLevel);
    const inView = (l) => mode === 'all' || l.id === active.id || (mode === 'below' && l.elevation <= active.elevation);
    const hiddenLevels = new Set(project.levels.filter((l) => l.visible === false || !inView(l)).map((l) => l.id));
    for (const cut of this.groups.cuts.children) cut.visible = cut.userData.level === active.id;

    // Walls per level (with their openings' holes).
    for (const level of project.levels) {
      const walls = project.walls.filter((w) => w.level === level.id);
      const ids = new Set(walls.map((w) => w.id));
      const openings = project.openings.filter((o) => ids.has(o.wall));
      const columns = columnsOf(project, level.id).filter((o) => !o.hidden);
      // Walls go up through the floor slab to the level above when that level is shown (else the slab
      // band between the storeys would be an open gap and the floors would look as if they floated).
      const above = project.levels.filter((l) => l.elevation > level.elevation + 0.01 && !hiddenLevels.has(l.id)).sort((a, b) => a.elevation - b.elevation)[0];
      const gap = above && !hiddenLevels.has(level.id) ? above.elevation - (level.elevation + level.height) : 0;
      const slabUp = gap > 0.005 && gap <= 1 ? Math.round(gap * 1000) / 1000 : 0;
      const key = JSON.stringify([level.elevation, level.height, slabUp, walls, openings.map((o) => [o.wall, o.offset, o.width, o.height, o.sill]), columns.map((o) => [o.position, o.rotation, o.scale, o.params])]);
      const prev = this.wallKeys.get(level.id);
      if (prev !== key) {
        this.removeWhere(this.groups.walls, (o) => o.userData.level === level.id);
        this.removeWhere(this.groups.cuts, (o) => o.userData.level === level.id);
        this.buildWalls(project, level, walls, openings, slabUp);
        this.buildColumnCuts(level, columns);
        this.wallKeys.set(level.id, key);
        changed = true;
      }
    }
    for (const id of [...this.wallKeys.keys()]) {
      if (!project.levels.some((l) => l.id === id)) { this.removeWhere(this.groups.walls, (o) => o.userData.level === id); this.removeWhere(this.groups.cuts, (o) => o.userData.level === id); this.wallKeys.delete(id); changed = true; }
    }
    for (const mesh of this.groups.walls.children) mesh.visible = !hiddenLevels.has(mesh.userData.level) && !hiddenTags.has(mesh.userData.tag ?? 'untagged');

    const walls = new Map(project.walls.map((w) => [w.id, w]));
    const each = (list, kind, group, keyOf, build, place = null) => {
      for (const entity of list) {
        seen.add(entity.id);
        const key = keyOf(entity);
        const old = this.built.get(entity.id);
        if (old && old.key === key) {
          old.object.visible = !entity.hidden && !hiddenTags.has(entity.tag ?? 'untagged') && !hiddenLevels.has(entity.level ?? levelOfWall(entity));
          // Same content, maybe a new place: move the existing object (dragging stays smooth, nothing is rebuilt).
          if (place && place(entity, old.object)) { moved = true; }
          continue;
        }
        if (old) this.disposeObject(old.object, group);
        const object = build(entity);
        if (!object) continue;
        object.userData.entityId = entity.id;
        object.userData.entityKind = kind;
        // Placed objects only move through placeTransform (which updates the matrix): no per-frame matrix work.
        object.updateMatrix();
        object.matrixAutoUpdate = false;
        object.visible = !entity.hidden && !hiddenTags.has(entity.tag ?? 'untagged') && !hiddenLevels.has(entity.level ?? levelOfWall(entity));
        group.add(object);
        this.viewport.applyStyle(object);
        this.built.set(entity.id, { key, object, kind });
        changed = true;
      }
    };
    const levelOfWall = (opening) => walls.get(opening.wall)?.level;
    let moved = false;
    const placeTransform = (e, object) => this.placeTransform(project, e, object);

    each(project.rooms, 'room', this.groups.rooms, (r) => JSON.stringify([r, levelOf(project, r.level).elevation, levelOf(project, r.level).height]), (r) => this.buildRoom(project, r));
    each(project.openings, 'opening', this.groups.openings, (o) => JSON.stringify([o, walls.get(o.wall), levelOf(project, walls.get(o.wall)?.level).elevation]), (o) => this.buildOpening(project, o, walls.get(o.wall)));
    each(project.objects, 'object', this.groups.objects, (o) => JSON.stringify([o.item, o.params, o.materials, this.settings().quality ?? 'high', o.params?.fitLevel ? levelOf(project, o.level).height : 0]), (o) => this.buildObject(project, o), placeTransform);
    each(project.models, 'model', this.groups.models, (m) => JSON.stringify([m.rev ?? 0, m.rev == null ? m.mesh : null]), (m) => this.buildModel(project, m), placeTransform);

    for (const [id, entry] of [...this.built]) {
      if (seen.has(id)) continue;
      this.disposeObject(entry.object, entry.object.parent);
      this.built.delete(id);
      changed = true;
    }
    if (changed) this.lampCache = null;
    // Lights and lamp markers follow moves, visibility and per-lamp settings (cheap: only when their key changes).
    this.updateLights(project);
    if (moved && !changed) this.viewport.contentMoved();
    if (changed) this.viewport.contentChanged();
    return changed;
  }

  /** Puts a built object where its entity says (position, rotation, scale). Returns whether it moved. */
  placeTransform(project, e, object) {
    const y = levelOf(project, e.level).elevation + e.position[1];
    const p = object.position; const r = object.rotation; const s = object.scale;
    if (p.x === e.position[0] && p.y === y && p.z === e.position[2] && r.x === e.rotation[0] && r.y === e.rotation[1] && r.z === e.rotation[2] && s.x === e.scale[0] && s.y === e.scale[1] && s.z === e.scale[2]) return false;
    p.set(e.position[0], y, e.position[2]);
    r.set(e.rotation[0], e.rotation[1], e.rotation[2], 'YXZ');
    s.set(e.scale[0], e.scale[1], e.scale[2]);
    object.updateMatrix();
    object.updateMatrixWorld(true);
    return true;
  }

  /**
   * Dragging furniture or models: only their transforms (and the lamps that move with them) are brought up to
   * date — none of the content keys of the whole project are compared on every pointer move. False when one of
   * them is not built (yet): the caller then runs a full sync().
   */
  moveOnly(project, entities) {
    const entries = entities.map((e) => [e, this.built.get(e.id)]);
    if (entries.some(([, entry]) => !entry || (entry.kind !== 'object' && entry.kind !== 'model'))) return false;
    let moved = false;
    for (const [e, entry] of entries) if (this.placeTransform(project, e, entry.object)) moved = true;
    if (moved) {
      this.updateLights(project);
      this.viewport.contentMoved();
    }
    return true;
  }

  objectOf(id) { return this.built.get(id)?.object ?? this.groups.walls.children.find((o) => o.userData.entityId === id) ?? null; }

  /** Oriented bounding box corners (world) of an entity, for the selection look. */
  orientedBox(id) {
    const object = this.objectOf(id);
    if (!object) return null;
    object.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const local = new THREE.Box3();
    object.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      local.union(o.geometry.boundingBox.clone().applyMatrix4(m));
    });
    if (local.isEmpty()) return null;
    const { min, max } = local;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(object.matrixWorld));
    return { corners, local, matrix: object.matrixWorld.clone() };
  }

  worldBox(id) {
    const object = this.objectOf(id);
    return object ? new THREE.Box3().setFromObject(object) : null;
  }

  removeWhere(group, test) {
    for (const child of [...group.children]) if (test(child)) this.disposeObject(child, group);
  }

  disposeObject(object, parent) {
    parent?.remove(object);
    object.traverse((o) => {
      // Shared (template) geometry stays: only geometry this object owns is freed.
      if (o.userData.ownsGeometry) { o.geometry?.disposeBoundsTree?.(); o.geometry?.dispose(); }
    });
  }

  // ───────────────────────── walls

  /** slabUp: metres the walls of default height continue up through the floor slab of the level above. */
  buildWalls(project, level, walls, openings, slabUp = 0) {
    if (!walls.length) return;
    const corners = wallCorners(walls);
    const footprints = wallFootprints(walls, corners);
    for (const wall of walls) {
      if (wallLength(wall) < 1e-4) continue;
      const height = wall.height ?? level.height + slabUp;
      const data = wallMesh(wall, { corners, openings, height, base: level.elevation });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      const slotMaterial = { left: wall.material?.left ?? 'wall-paint-white', right: wall.material?.right ?? 'wall-paint-white', top: wall.material?.top ?? 'wall-paint-white', reveal: wall.material?.left ?? 'wall-paint-white', end: wall.material?.left ?? 'wall-paint-white' };
      // One draw call per material, not per side: the triangles are ordered by material (a wall painted
      // one colour is a single group); `wallSlotOf` still tells which side each triangle belongs to (paint bucket).
      const { indices, groups, slotRanges, presets } = groupByMaterial(data.indices, data.groups, slotMaterial);
      g.setIndex(new THREE.BufferAttribute(indices, 1));
      for (const grp of groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      // The BVH reorders triangles inside each group, so the sides are looked up per triangle afterwards.
      const sideOf = triangleKeys(indices, slotRanges);
      g.computeBoundsTree();
      WALL_SIDES.set(g, slotsAfterReorder(g.index.array, sideOf));
      const mesh = new THREE.Mesh(g, presets.map((p) => getMaterial(p)));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { entityId: wall.id, entityKind: 'wall', level: level.id, ownsGeometry: true, tag: wall.tag };
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMaterial);
      edges.userData = { edges: true, ownsGeometry: true, noPick: true };
      edges.matrixAutoUpdate = false;
      mesh.add(edges);
      this.groups.walls.add(mesh);
      this.viewport.applyStyle(mesh);

      // The cut face for plan views: the footprint at the cut height, filled as Settings say (planCutMaterial).
      const cut = new THREE.Mesh(planCutGeometry(footprints.get(wall.id), level.elevation + Math.min(height, 1.2) - 0.002));
      cut.userData = { level: level.id, ownsGeometry: true, noPick: true, helper: true, alwaysVisible: true, finish: slotMaterial.top };
      this.groups.cuts.add(cut);
      this.fillCut(cut);
    }
  }

  /**
   * The fill of a plan cut face (walls and columns in the 2D plan), from settings().planWall:
   * { mode: 'color', color } — one flat colour (default black, as drawings are) — or { mode: 'material' } — the
   * wall's own finish, as it looks in 3D.
   */
  fillCut(cut) {
    const fill = this.settings().planWall ?? { mode: 'color', color: '#000000' };
    if (fill.mode === 'material') { cut.material = getMaterial(cut.userData.finish ?? 'wall-paint-white'); this.viewport.applyStyle(cut); return; }
    cut.material = cutColorMaterial(fill.color ?? '#000000');
  }

  /** Settings changed: every plan cut face is filled again (no wall is rebuilt). */
  refillCuts() {
    for (const cut of this.groups.cuts.children) this.fillCut(cut);
    this.viewport.requestRender();
  }

  /** Plan cut faces of the level's structural columns (filled like the walls' cut). */
  buildColumnCuts(level, columns) {
    for (const o of columns) {
      const y = level.elevation + Math.min(level.height, 1.2) - 0.001;
      const cut = new THREE.Mesh(planCutGeometry(columnFootprint(o), y));
      cut.userData = { level: level.id, ownsGeometry: true, noPick: true, helper: true, alwaysVisible: true, column: o.id, finish: Object.values(o.materials ?? {})[0] ?? 'concrete' };
      this.groups.cuts.add(cut);
      this.fillCut(cut);
    }
  }

  // ───────────────────────── rooms

  buildRoom(project, room) {
    const level = levelOf(project, room.level);
    const group = new THREE.Group();
    const floor = polygonMesh(room.points, level.elevation + 0.0005, getMaterial(room.floor ?? 'floor-oak'), true, room.holes);
    floor.userData.part = 'floor';
    group.add(floor);
    // Stairwells: the slab's edge round each hole in the floor (down to the ceiling of the level below).
    const below = project.levels.filter((l) => l.elevation < level.elevation - 0.01).sort((a, b) => b.elevation - a.elevation)[0];
    const slab = below ? level.elevation - (below.elevation + below.height) : 0;
    if (slab > 0.01) for (const hole of holePolygons(room.holes)) group.add(holeEdgeMesh(hole, level.elevation - slab, level.elevation + 0.0005, getMaterial(room.ceiling ?? 'wall-paint-white')));
    if (room.showCeiling) {
      const ceiling = polygonMesh(room.points, level.elevation + level.height - 0.0005, getMaterial(room.ceiling ?? 'wall-paint-white'), false, room.ceilingHoles);
      ceiling.userData.part = 'ceiling';
      ceiling.castShadow = true;
      group.add(ceiling);
    }
    return group;
  }

  // ───────────────────────── doors and windows

  buildOpening(project, opening, wall) {
    if (!wall) return null;
    const item = catalogItem(opening.item);
    const level = levelOf(project, wall.level);
    const d = wallDir(wall);
    const n = wallNormal(wall);
    const group = new THREE.Group();
    const params = { ...itemParams(item, opening.params), width: opening.width, height: opening.height };
    const content = item ? this.instance(item, params, { wallThickness: wall.thickness ?? 0.15 }) : placeholderBox(opening.width, opening.height, wall.thickness ?? 0.15);
    if (opening.flip) content.scale.x = -1;
    group.add(content);
    const x = wall.a[0] + d[0] * opening.offset;
    const z = wall.a[1] + d[1] * opening.offset;
    group.position.set(x, level.elevation + (opening.sill ?? 0), z);
    // The item's front (+Z) faces the wall's left side (+n); a flipped opening faces the other way.
    group.rotation.y = Math.atan2(n[0], n[1]) + (opening.side === 'right' ? Math.PI : 0);
    // How the door opens, drawn on the floor for the 2D plan (arc + open leaf; arrows for sliding doors).
    const swing = item?.category === 'doors' ? doorSwingLines(swingMeta(item, params, wall.thickness ?? 0.15), { width: opening.width, thickness: wall.thickness ?? 0.15, flip: opening.flip, y: 0.012 - (opening.sill ?? 0) }) : null;
    if (swing) { swing.visible = Boolean(this.viewport.planMode); group.add(swing); }
    group.updateMatrix();
    return group;
  }

  // ───────────────────────── furniture and props

  buildObject(project, object) {
    const item = catalogItem(object.item);
    const level = levelOf(project, object.level);
    const group = new THREE.Group();
    const params = itemParams(item, object.params);
    // Structural columns can follow the storey height (planedit.js).
    if (isColumn(object) && params.fitLevel) params.height = level.height;
    let content;
    if (!item) content = placeholderBox(0.5, 0.5, 0.5);
    else if (item.kind === 'asset' || item.kind === 'user') content = this.assetInstance(item, object.id);
    else content = this.instance(item, params, {});
    applyMaterialOverrides(content, object.materials);
    group.add(content);
    group.position.set(object.position[0], level.elevation + object.position[1], object.position[2]);
    group.rotation.set(object.rotation[0], object.rotation[1], object.rotation[2], 'YXZ');
    group.scale.set(...object.scale);
    return group;
  }

  /** A clone of the cached template for an item and its params (shared geometry, BVH, materials). */
  instance(item, params, extra) {
    const quality = this.settings().quality ?? 'high';
    const key = `${item.id}|${JSON.stringify(params)}|${quality}|${extra.wallThickness ?? ''}`;
    let template = this.templates.get(key);
    if (!template) {
      try {
        template = item.build(params, { material: getMaterial, quality, wallThickness: extra.wallThickness ?? 0.15, THREE });
      } catch (error) {
        console.error('build failed', item.id, error);
        template = placeholderBox(item.size?.[0] ?? 0.5, item.size?.[1] ?? 0.5, item.size?.[2] ?? 0.5);
      }
      template.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = o.userData.part !== 'glass';
          o.receiveShadow = true;
        }
      });
      // Edges first (from the parts as built), then the parts of one material are merged.
      addEdges(template, this.edgeCache);
      mergeByMaterial(template);
      template.traverse((o) => {
        if (o.isMesh) {
          if (!o.geometry.boundsTree) o.geometry.computeBoundsTree();
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        }
      });
      freezeMatrices(template);
      this.templates.set(key, template);
      // Keep the cache bounded: drop the oldest templates (their clones keep the geometry alive).
      if (this.templates.size > 600) this.templates.delete(this.templates.keys().next().value);
    }
    return cloneShared(template);
  }

  /** Downloaded or imported models load asynchronously: a light box first, the model when it arrives. */
  assetInstance(item, entityId) {
    const holder = new THREE.Group();
    const cached = this.templates.get(`asset|${item.id}`);
    if (cached) { holder.add(cloneShared(cached)); return holder; }
    const size = item.size ?? [0.5, 0.5, 0.5];
    const box = placeholderBox(size[0], size[1], size[2]);
    box.userData.placeholder = true;
    holder.add(box);
    const load = item.load ?? ((id) => assetApi()?.loadAssetModel?.(id));
    let pending = this.pendingAssets.get(item.id);
    if (!pending) {
      pending = Promise.resolve(load(item.asset ?? item.id)).then((model) => {
        if (!model) throw new Error(`no model ${item.id}`);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        addEdges(model, this.edgeCache, 40);
        mergeByMaterial(model);
        model.traverse((o) => { if (o.isMesh && !o.geometry.boundsTree) o.geometry.computeBoundsTree(); });
        freezeMatrices(model);
        this.templates.set(`asset|${item.id}`, model);
        return model;
      });
      this.pendingAssets.set(item.id, pending);
    }
    pending.then((model) => {
      holder.clear();
      holder.add(cloneShared(model));
      this.viewport.applyStyle(holder);
      const entry = this.built.get(entityId);
      if (entry) applyMaterialOverrides(holder, entry.materials);
      this.viewport.contentChanged();
      this.onAsync(entityId);
    }).catch((error) => {
      console.warn('asset load failed', item.id, error);
      box.material = getMaterial('back-face');
      this.viewport.requestRender();
    });
    return holder;
  }

  // ───────────────────────── modelled geometry (SketchUp faces and edges)

  buildModel(project, model) {
    const Kind = GeoMesh();
    const level = levelOf(project, model.level);
    const group = new THREE.Group();
    if (Kind) {
      const geo = this.meshOf ? this.meshOf(model) : Kind.fromJSON(model.mesh);
      const tri = geo.triangulate({ materialGroups: true });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(tri.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(tri.normals, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(tri.uvs, 2));
      if (tri.indices) g.setIndex(new THREE.BufferAttribute(tri.indices, 1));
      const materials = [];
      for (const grp of tri.groups ?? []) {
        let i = materials.findIndex((m) => m.userData.preset === (grp.material ?? 'default'));
        if (i < 0) { materials.push(getMaterial(grp.material ?? 'default')); i = materials.length - 1; }
        g.addGroup(grp.start, grp.count, i);
      }
      if (!materials.length) materials.push(getMaterial('default'));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      if (tri.positions.length) g.computeBoundsTree();
      const mesh = new THREE.Mesh(g, materials.map((m) => { const c = m.clone(); c.side = THREE.DoubleSide; c.userData = { ...m.userData }; c.polygonOffset = true; c.polygonOffsetFactor = -1; c.polygonOffsetUnits = -2; return c; }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { ownsGeometry: true, faceOfTriangle: tri.faceOfTriangle, part: 'faces' };
      group.add(mesh);
      if (tri.edgePositions?.length) {
        const eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.BufferAttribute(tri.edgePositions, 3));
        const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: EDGE_COLOR }));
        edges.userData = { edges: true, ownsGeometry: true, part: 'edges' };
        group.add(edges);
      }
    }
    group.position.set(model.position[0], level.elevation + model.position[1], model.position[2]);
    group.rotation.set(model.rotation[0], model.rotation[1], model.rotation[2], 'YXZ');
    group.scale.set(...model.scale);
    return group;
  }

  // ───────────────────────── lamps: real lights (Style › lights on) and their markers (2D/3D handles)

  /** Every light marker of the library lamps in the scene, with the object (entity) it belongs to. */
  lampSources() {
    if (!this.lampCache) {
      const list = [];
      this.groups.objects.traverse((o) => {
        if (!o.userData.light) return;
        let owner = o.parent;
        while (owner && !owner.userData.entityId) owner = owner.parent;
        if (owner) list.push({ marker: o, owner, id: owner.userData.entityId });
      });
      this.lampCache = list;
    }
    return this.lampCache;
  }

  /** The light settings of a lamp object (template + its own), or null when the object has no light. */
  lampInfo(object) {
    const src = this.lampSources().find((x) => x.id === object.id);
    return src ? lampSpec(src.marker.userData.light, object.light) : null;
  }

  /**
   * Real lights for the lamps that are switched on (a fixed pool, so switching lamps never recompiles
   * shaders; the lamps nearest the view centre get them) and a marker per lamp in the viewport.
   */
  updateLights(project, { force = false } = {}) {
    const lightsOn = Boolean(project.style?.lightsOn);
    const byId = new Map(project.objects.map((o) => [o.id, o]));
    const seenIds = new Set();
    const lamps = [];
    for (const src of this.lampSources()) {
      const e = byId.get(src.id);
      if (!e || !src.marker.parent) continue;
      src.marker.updateWorldMatrix(true, false);
      const position = new THREE.Vector3().setFromMatrixPosition(src.marker.matrixWorld);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(src.marker.getWorldQuaternion(new THREE.Quaternion()));
      // One marker per lamp object (a lamp with several bulbs is switched and moved as one).
      const first = !seenIds.has(src.id);
      seenIds.add(src.id);
      lamps.push({ id: src.id, owner: src.owner, position, down, spec: lampSpec(src.marker.userData.light, e.light), visible: visibleUp(src.owner), first });
    }
    const shadowsOn = this.viewport.settings?.().shadows !== false;
    const key = JSON.stringify([lightsOn, shadowsOn, lamps.map((l) => [l.id, l.owner.uuid, l.visible, l.spec, l.position.toArray().map((v) => Math.round(v * 1000))])]);
    if (key === this.lightsKey && !force) return;
    this.lightsKey = key;
    // Bulbs and glowing shades glow only while the lamp is on and the view's lights are on.
    for (const l of lamps) if (l.first) setLampGlow(l.owner, l.spec.on && lightsOn, this.viewport);
    this.viewport.setLampMarkers?.(lamps.filter((l) => l.visible && l.first).map((l) => ({ id: l.id, position: l.position, on: l.spec.on, lit: l.spec.on && lightsOn })));
    const group = this.groups.lights;
    if (!lightsOn) {
      // The pool stays (switching the lights off and on again does not allocate shadow maps or recompile).
      if (this.lampPool) for (const l of [...this.lampPool.point, ...this.lampPool.spot]) { l.intensity = 0; l.castShadow = false; }
      this.viewport.setLampFill?.(0);
      this.viewport.invalidateShadows();
      return;
    }
    if (!this.lampPool) {
      this.lampPool = { point: [], spot: [] };
      // The first few of each kind cast shadows (fixed, so the shader never recompiles); they go to the lamps nearest the view.
      // The shadow camera starts beyond the lamp's own shade and socket (35 cm, spots 25 cm): a fixture never shadows its own light.
      const shadowed = (l, i, n, size) => { if (i >= n) return; l.userData.shadowCaster = true; l.shadow.mapSize.set(size, size); l.shadow.bias = -0.002; l.shadow.normalBias = 0.03; l.shadow.radius = 3; l.shadow.camera.near = l.isSpotLight ? 0.25 : 0.35; };
      for (let i = 0; i < LAMP_POOL.point; i++) { const l = new THREE.PointLight('#ffffff', 0, 6, 2); shadowed(l, i, LAMP_POOL.pointShadows, 512); this.lampPool.point.push(l); group.add(l); }
      for (let i = 0; i < LAMP_POOL.spot; i++) { const l = new THREE.SpotLight('#ffffff', 0, 6, 0.6, 0.35, 2); shadowed(l, i, LAMP_POOL.spotShadows, 1024); this.lampPool.spot.push(l); group.add(l, l.target); }
    }
    const centre = this.viewport.target ?? new THREE.Vector3();
    const active = lamps.filter((l) => l.visible && l.spec.on).sort((a, b) => a.position.distanceToSquared(centre) - b.position.distanceToSquared(centre));
    let pi = 0; let si = 0;
    for (const l of active) {
      const spot = l.spec.type === 'spot';
      const light = spot ? this.lampPool.spot[si++] : this.lampPool.point[pi++];
      if (!light) continue;
      const half = THREE.MathUtils.degToRad(l.spec.beam / 2);
      light.position.copy(l.position);
      light.color.set(l.spec.color);
      light.distance = l.spec.distance;
      // Lumens → candela: a point lamp spreads over the whole sphere, a spot over its cone.
      light.intensity = spot ? l.spec.lumens / (2 * Math.PI * (1 - Math.cos(half))) : l.spec.lumens / (4 * Math.PI);
      if (spot) { light.angle = Math.min(Math.PI / 2 - 0.01, half); light.target.position.copy(l.position).add(l.down); light.target.updateMatrixWorld(); }
    }
    for (; pi < this.lampPool.point.length; pi++) this.lampPool.point[pi].intensity = 0;
    for (; si < this.lampPool.spot.length; si++) this.lampPool.spot[si].intensity = 0;
    // Light bounced off walls and ceiling: a little fill per lit lamp (strongest at night, when nothing else lights the room).
    this.viewport.setLampFill?.(Math.min(0.32, 0.08 * active.length));
    // Lamp shadows follow the Shadows switch like the sun's.
    for (const l of [...this.lampPool.point, ...this.lampPool.spot]) l.castShadow = Boolean(l.userData.shadowCaster && shadowsOn);
    for (const l of [...this.lampPool.point, ...this.lampPool.spot]) if (l.castShadow) { l.shadow.camera.far = Math.max(1, l.distance || 10); l.shadow.camera.updateProjectionMatrix(); }
    this.viewport.invalidateShadows();
  }

  /** Materials and textures changed (e.g. textures finished loading): templates rebuild lazily. */
  clearTemplates() {
    this.templates.clear();
    this.built.clear();
    // Geometry the scene's own objects made (walls, floors, cuts, models) is freed on the GPU, not only dropped.
    for (const g of Object.values(this.groups)) { for (const child of [...g.children]) this.disposeObject(child, null); g.clear(); }
    this.wallKeys.clear();
  }
}

// ───────────────────────── helpers

/**
 * Reorders a wall's triangles so each material is one contiguous group (one draw call). Returns the new
 * index array, the groups ({ start, count, materialIndex } into `presets`) and which side (slot) each
 * index range came from: [{ start, count, slot }] in the new order.
 */
function groupByMaterial(source, sourceGroups, slotMaterial) {
  const presets = [];
  const byPreset = new Map();
  for (const grp of sourceGroups) {
    const preset = slotMaterial[grp.slot] ?? 'wall-paint-white';
    if (!byPreset.has(preset)) { byPreset.set(preset, []); presets.push(preset); }
    byPreset.get(preset).push(grp);
  }
  const indices = new source.constructor(source.length);
  const groups = [];
  const slotRanges = [];
  let at = 0;
  presets.forEach((preset, materialIndex) => {
    const start = at;
    for (const grp of byPreset.get(preset)) {
      indices.set(source.subarray(grp.start, grp.start + grp.count), at);
      slotRanges.push({ start: at, count: grp.count, slot: grp.slot });
      at += grp.count;
    }
    groups.push({ start, count: at - start, materialIndex });
  });
  return { indices, groups, slotRanges, presets };
}

const WALL_SLOTS = ['left', 'right', 'top', 'reveal', 'end'];
/** Wall geometry → side code per triangle (kept out of userData, which the exporters write out). */
const WALL_SIDES = new WeakMap();
const triKey = (a, b, c) => { const lo = Math.min(a, b, c); const hi = Math.max(a, b, c); return `${lo},${a + b + c - lo - hi},${hi}`; };

/** Triangle (its three vertex indices) → side, before the BVH reorders the index. */
function triangleKeys(indices, slotRanges) {
  const map = new Map();
  for (const r of slotRanges) {
    const code = Math.max(0, WALL_SLOTS.indexOf(r.slot));
    for (let i = r.start; i < r.start + r.count; i += 3) map.set(triKey(indices[i], indices[i + 1], indices[i + 2]), code);
  }
  return map;
}

/** Side code per triangle of the (reordered) index: Uint8Array indexed by faceIndex. */
function slotsAfterReorder(indices, sideOf) {
  const out = new Uint8Array(indices.length / 3);
  for (let t = 0; t < out.length; t++) out[t] = sideOf.get(triKey(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2])) ?? 0;
  return out;
}

/** The wall side ('left', 'right', 'top', 'reveal', 'end') of the triangle a pick hit. */
export function wallSlotOf(hit) {
  const codes = WALL_SIDES.get(hit?.object?.geometry);
  if (!codes || hit.faceIndex == null) return null;
  return WALL_SLOTS[codes[hit.faceIndex]] ?? null;
}

/**
 * Meshes of a template that share one material (and the same shadow flags) under the same parent are
 * merged into one mesh, in the parent's space: every placed copy then costs fewer draw calls (in the
 * main pass, the ambient-occlusion pass and the shadow maps). Transparent and transmissive materials stay
 * separate (their sorting must not change), as do mirrored, multi-material, instanced or parent meshes.
 */
function mergeByMaterial(root) {
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.children.length || !o.parent) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.transparent || m.transmission > 0 || o.userData.placeholder) return;
    const g = o.geometry;
    if (!g?.attributes?.position || Object.keys(g.morphAttributes ?? {}).length) return;
    o.updateMatrix();
    if (o.matrix.determinant() <= 0) return;
    const attrs = Object.entries(g.attributes).map(([k, a]) => `${k}${a.itemSize}${a.normalized ? 'n' : ''}${a.isInterleavedBufferAttribute ? 'i' : ''}`).sort().join(',');
    const key = [o.parent.uuid, m.uuid, o.castShadow, o.receiveShadow, o.visible, o.renderOrder, o.frustumCulled, o.layers.mask, o.userData.part ?? '', g.index ? 'i' : 'n', attrs].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    if (list.some((o) => o.geometry.attributes.position.isInterleavedBufferAttribute)) continue;
    const geos = list.map((o) => o.geometry.clone().applyMatrix4(o.matrix));
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch { merged = null; }
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const first = list[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = first.name;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.userData = { ...first.userData, roles: list.map((o) => o.name), merged: true };
    const parent = first.parent;
    const at = parent.children.indexOf(first);
    for (const o of list) parent.remove(o);
    parent.add(mesh);
    parent.children.pop();
    parent.children.splice(Math.min(at, parent.children.length), 0, mesh);
  }
}

/** Objects inside a template never move against their item: their matrices are computed once, not every frame. */
function freezeMatrices(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o === root) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}

/** Real lights the scene keeps for lamps (fixed, so the shader light count never changes). */
export const LAMP_POOL = { point: 12, spot: 6, pointShadows: 2, spotShadows: 4 };

/**
 * A lamp's light: the template's marker (Kit.light: relative intensity, spot angle in radians)
 * with the object's own settings (`object.light`: on, lumens, color, distance, beam in degrees) over it.
 */
export function lampSpec(marker = {}, own = {}) {
  const type = marker.type === 'spot' ? 'spot' : 'point';
  return {
    type,
    on: own?.on !== false,
    lumens: Number.isFinite(own?.lumens) ? own.lumens : Math.round((marker.intensity ?? 1) * 800),
    color: own?.color ?? marker.color ?? '#ffe2b0',
    distance: Number.isFinite(own?.distance) ? own.distance : (marker.distance ?? 6),
    beam: Number.isFinite(own?.beam) ? own.beam : Math.round(THREE.MathUtils.radToDeg((marker.angle ?? 0.6) * 2)),
  };
}

/** A switched-off copy of a glowing material (cached): no emission, the colour a little greyer. */
const UNLIT = new WeakMap();
function unlitMaterial(material) {
  let off = UNLIT.get(material);
  if (!off) {
    off = material.clone();
    off.emissiveIntensity = 0;
    off.color?.multiplyScalar?.(0.86);
    off.name = `${material.name || 'light'} (off)`;
    UNLIT.set(material, off);
  }
  return off;
}

/** Swaps a lamp's glowing parts between their lit and switched-off materials (the view style is applied on top). */
function setLampGlow(owner, glow, viewport) {
  let changed = false;
  owner.traverse((o) => {
    if (!o.isMesh) return;
    const lit = o.userData.litMaterial ?? o.userData.baseMaterial ?? o.material;
    if (!lit || Array.isArray(lit) || !(lit.emissiveIntensity > 0) || !lit.emissive || lit.emissive.getHex() === 0) return;
    o.userData.litMaterial = lit;
    const want = glow ? lit : unlitMaterial(lit);
    if ((o.userData.baseMaterial ?? o.material) !== want) { o.userData.baseMaterial = want; o.material = want; changed = true; }
  });
  if (changed) viewport.applyStyle?.(owner);
}

function visibleUp(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function polygonMesh(outline, y, material, up, holes = null) {
  // Holes (stairwells, engine/stairs.js) are cut out; their points follow the outline's.
  const { points, triangles: tris } = floorTriangles(outline, holes);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, y, z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(points.flatMap(() => [0, up ? 1 : -1, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, -z]), 2));
  // A triangle faces +y when it is clockwise in (x, z) maths coordinates (cross.y = −cross2D); order each one explicitly.
  const index = [];
  for (const [a, b, c] of tris) {
    const [ax, az] = points[a]; const [bx, bz] = points[b]; const [cx, cz] = points[c];
    const cross2 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if ((cross2 < 0) === up) index.push(a, b, c); else index.push(a, c, b);
  }
  g.setIndex(index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.computeBoundsTree();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  return mesh;
}

/** Vertical faces round a floor hole from y0 to y1 (both sides, so they show from the stairwell and from above). */
function holeEdgeMesh(hole, y0, y1, material) {
  const pos = []; const nor = [];
  for (let i = 0; i < hole.length; i++) {
    const [ax, az] = hole[i]; const [bx, bz] = hole[(i + 1) % hole.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const nx = -(bz - az) / L; const nz = (bx - ax) / L;
    for (const s of [1, -1]) {
      const quad = s > 0 ? [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y0, az], [bx, y1, bz], [ax, y1, az]] : [[ax, y0, az], [bx, y1, bz], [bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz]];
      for (const q of quad) { pos.push(...q); nor.push(nx * s, 0, nz * s); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.length ? Array.from({ length: pos.length / 3 * 2 }, () => 0) : [], 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  if (pos.length) g.computeBoundsTree();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  mesh.userData.part = 'slabEdge';
  return mesh;
}

function placeholderBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  g.computeBoundsTree();
  const mesh = new THREE.Mesh(g, getMaterial('default', { color: '#c9d3df' }));
  mesh.castShadow = true;
  mesh.userData.ownsGeometry = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Clone that shares geometry and materials (Object3D.clone already does; userData is shallow-copied). */
function cloneShared(template) {
  const copy = template.clone(true);
  copy.traverse((o) => { o.userData = { ...o.userData, ownsGeometry: false }; });
  return copy;
}

/** Feature edges (SketchUp's black lines) for library items, computed once per geometry. */
function addEdges(root, cache, angle = 30) {
  // One LineSegments per item (all its meshes' feature edges merged in the item's space): a furnished
  // room draws one extra call per item instead of one per mesh.
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.part?.startsWith?.('glass')) return;
    let eg = cache.get(o.geometry);
    if (!eg) {
      const tris = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
      if (tris > 60000) return; // very dense scans: edges would be noise and cost a lot
      eg = new THREE.EdgesGeometry(o.geometry, angle);
      cache.set(o.geometry, eg);
    }
    const piece = new THREE.BufferGeometry().setAttribute('position', eg.getAttribute('position').clone());
    piece.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    parts.push(piece);
  });
  if (!parts.length) return;
  const count = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const positions = new Float32Array(count * 3);
  let offset = 0;
  for (const g of parts) { positions.set(g.getAttribute('position').array, offset); offset += g.getAttribute('position').array.length; g.dispose(); }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(merged, edgeMaterial);
  lines.userData = { edges: true, noPick: true };
  lines.raycast = () => {};
  lines.matrixAutoUpdate = false;
  root.add(lines);
}

/** Per-object material choices: { meshNameOrMaterialPreset: presetId } → the meshes get the chosen presets. */
function applyMaterialOverrides(root, overrides) {
  if (!overrides || !Object.keys(overrides).length) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      const want = overrides[o.name] ?? overrides[m?.userData?.preset] ?? overrides[m?.name];
      return want ? getMaterial(want) : m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    delete o.userData.baseMaterial;
  });
}
