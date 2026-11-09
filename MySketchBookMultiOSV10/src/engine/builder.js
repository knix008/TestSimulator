// Document → three.js objects, incrementally. Every entity remembers the JSON it
// was built from; sync() rebuilds only what changed, so moving one chair in a
// furnished house touches one object. Walls of a level are rebuilt together
// (their joins depend on each other), still only when a wall or opening changed.
//
// Library items are built once per (item, params, quality) as a template; every
// placed copy is a clone that shares geometry, BVH and materials with it.
import * as THREE from 'three';
import { ShapeUtils } from 'three';
import { getMaterial } from './materials.js';
import { wallCorners, wallFootprints, wallMesh, wallDir, wallNormal, wallLength } from './walls.js';
import { levelOf } from './document.js';
import { catalogItem, itemParams, assetApi } from '../library/catalog.js';

const modelingModules = import.meta.glob('../modeling/mesh.js', { eager: true });
const GeoMesh = () => Object.values(modelingModules)[0]?.GeoMesh ?? null;

const EDGE_COLOR = '#1d232b';
const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.55 });
const cutMaterial = new THREE.MeshBasicMaterial({ color: '#2b2f36', side: THREE.DoubleSide });
cutMaterial.userData.keepStyle = true;

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
      const key = JSON.stringify([level.elevation, level.height, walls, openings.map((o) => [o.wall, o.offset, o.width, o.height, o.sill])]);
      const prev = this.wallKeys.get(level.id);
      if (prev !== key) {
        this.removeWhere(this.groups.walls, (o) => o.userData.level === level.id);
        this.removeWhere(this.groups.cuts, (o) => o.userData.level === level.id);
        this.buildWalls(project, level, walls, openings);
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
        object.visible = !entity.hidden && !hiddenTags.has(entity.tag ?? 'untagged') && !hiddenLevels.has(entity.level ?? levelOfWall(entity));
        group.add(object);
        this.viewport.applyStyle(object);
        this.built.set(entity.id, { key, object, kind });
        changed = true;
      }
    };
    const levelOfWall = (opening) => walls.get(opening.wall)?.level;
    let moved = false;
    const placeTransform = (e, object) => {
      const y = levelOf(project, e.level).elevation + e.position[1];
      const p = object.position; const r = object.rotation; const s = object.scale;
      if (p.x === e.position[0] && p.y === y && p.z === e.position[2] && r.x === e.rotation[0] && r.y === e.rotation[1] && r.z === e.rotation[2] && s.x === e.scale[0] && s.y === e.scale[1] && s.z === e.scale[2]) return false;
      p.set(e.position[0], y, e.position[2]);
      r.set(e.rotation[0], e.rotation[1], e.rotation[2], 'YXZ');
      s.set(e.scale[0], e.scale[1], e.scale[2]);
      object.updateMatrixWorld(true);
      return true;
    };

    each(project.rooms, 'room', this.groups.rooms, (r) => JSON.stringify([r, levelOf(project, r.level).elevation, levelOf(project, r.level).height]), (r) => this.buildRoom(project, r));
    each(project.openings, 'opening', this.groups.openings, (o) => JSON.stringify([o, walls.get(o.wall), levelOf(project, walls.get(o.wall)?.level).elevation]), (o) => this.buildOpening(project, o, walls.get(o.wall)));
    each(project.objects, 'object', this.groups.objects, (o) => JSON.stringify([o.item, o.params, o.materials, this.settings().quality ?? 'high']), (o) => this.buildObject(project, o), placeTransform);
    each(project.models, 'model', this.groups.models, (m) => JSON.stringify([m.rev ?? 0, m.rev == null ? m.mesh : null]), (m) => this.buildModel(project, m), placeTransform);

    for (const [id, entry] of [...this.built]) {
      if (seen.has(id)) continue;
      this.disposeObject(entry.object, entry.object.parent);
      this.built.delete(id);
      changed = true;
    }
    if (moved && !changed) { this.updateLights(project); this.viewport.contentMoved(); }
    if (changed) {
      this.updateLights(project);
      this.viewport.contentChanged();
    }
    return changed;
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

  buildWalls(project, level, walls, openings) {
    if (!walls.length) return;
    const corners = wallCorners(walls);
    const footprints = wallFootprints(walls, corners);
    for (const wall of walls) {
      if (wallLength(wall) < 1e-4) continue;
      const height = wall.height ?? level.height;
      const data = wallMesh(wall, { corners, openings, height, base: level.elevation });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const slotMaterial = { left: wall.material?.left ?? 'wall-paint-white', right: wall.material?.right ?? 'wall-paint-white', top: wall.material?.top ?? 'wall-paint-white', reveal: wall.material?.left ?? 'wall-paint-white', end: wall.material?.left ?? 'wall-paint-white' };
      const slots = Object.keys(slotMaterial);
      for (const grp of data.groups) g.addGroup(grp.start, grp.count, slots.indexOf(grp.slot));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      g.computeBoundsTree();
      const mesh = new THREE.Mesh(g, slots.map((s) => getMaterial(slotMaterial[s])));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { entityId: wall.id, entityKind: 'wall', level: level.id, ownsGeometry: true, tag: wall.tag, slots };
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), edgeMaterial);
      edges.userData = { edges: true, ownsGeometry: true, noPick: true };
      edges.matrixAutoUpdate = false;
      mesh.add(edges);
      this.groups.walls.add(mesh);
      this.viewport.applyStyle(mesh);

      // The cut face for plan views: the footprint at the cut height, dark.
      const fp = footprints.get(wall.id);
      const shape = fp.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = ShapeUtils.triangulateShape(shape, []);
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(fp.flatMap(([x, z]) => [x, level.elevation + Math.min(height, 1.2) - 0.002, z]), 3));
      cg.setIndex(tris.flat());
      const cut = new THREE.Mesh(cg, cutMaterial);
      cut.userData = { level: level.id, ownsGeometry: true, noPick: true, helper: true, alwaysVisible: true };
      this.groups.cuts.add(cut);
    }
  }

  // ───────────────────────── rooms

  buildRoom(project, room) {
    const level = levelOf(project, room.level);
    const group = new THREE.Group();
    const floor = polygonMesh(room.points, level.elevation + 0.0005, getMaterial(room.floor ?? 'floor-oak'), true);
    floor.userData.part = 'floor';
    group.add(floor);
    if (room.showCeiling) {
      const ceiling = polygonMesh(room.points, level.elevation + level.height - 0.0005, getMaterial(room.ceiling ?? 'wall-paint-white'), false);
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
    group.updateMatrix();
    return group;
  }

  // ───────────────────────── furniture and props

  buildObject(project, object) {
    const item = catalogItem(object.item);
    const level = levelOf(project, object.level);
    const group = new THREE.Group();
    const params = itemParams(item, object.params);
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
          if (!o.geometry.boundsTree) o.geometry.computeBoundsTree();
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        }
      });
      addEdges(template, this.edgeCache);
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
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (!o.geometry.boundsTree) o.geometry.computeBoundsTree(); } });
        addEdges(model, this.edgeCache, 40);
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

  // ───────────────────────── lights of lamps (Style › lights on)

  updateLights(project) {
    const group = this.groups.lights;
    for (const child of [...group.children]) { group.remove(child); child.dispose?.(); }
    if (!project.style?.lightsOn) return;
    const found = [];
    this.groups.objects.traverse((o) => { if (o.userData.light && o.parent) found.push(o); });
    // Point lights are expensive per pixel: the nearest few to the scene centre, no shadows.
    for (const o of found.slice(0, 12)) {
      const spec = o.userData.light;
      const light = new THREE.PointLight(spec.color ?? '#ffd9a0', spec.intensity ?? 6, spec.distance ?? 6, 2);
      o.updateWorldMatrix(true, false);
      light.position.setFromMatrixPosition(o.matrixWorld);
      group.add(light);
    }
  }

  /** Materials and textures changed (e.g. textures finished loading): templates rebuild lazily. */
  clearTemplates() { this.templates.clear(); this.built.clear(); for (const g of Object.values(this.groups)) g.clear(); this.wallKeys.clear(); }
}

// ───────────────────────── helpers

function polygonMesh(points, y, material, up) {
  const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = ShapeUtils.triangulateShape(contour, []);
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
