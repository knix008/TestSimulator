// Plan underlays: a picture of a floor plan lying on the floor of its level, in
// the 2D plan and the 3D view, to trace walls over it. It lives in the
// viewport's helpers (not the content): never picked, styled, exported, shadowed
// or counted in the bounds, and the photo renderer leaves it out.
//
// project.underlays: [{ id, level, asset, name, width, height (pixels), position: [x, z] (centre),
//   rotation (radians about Y), scale (metres per pixel), opacity (0…1), hidden, locked }]
// The picture's bytes are a project asset (project.assets[id] = { kind: 'underlay', ext, mime }), saved in the .msk.
import * as THREE from 'three';

/** Picture pixel [px, py] → plan point [x, z] (three's rotation about Y, same as the mesh). */
export function underlayToPlan(u, [px, py]) {
  const lx = (px - u.width / 2) * u.scale;
  const lz = (py - u.height / 2) * u.scale;
  const c = Math.cos(u.rotation ?? 0); const s = Math.sin(u.rotation ?? 0);
  return [u.position[0] + lx * c + lz * s, u.position[1] - lx * s + lz * c];
}

/** Plan point → picture pixel (inverse of underlayToPlan). */
export function planToUnderlay(u, [x, z]) {
  const dx = x - u.position[0]; const dz = z - u.position[1];
  const c = Math.cos(u.rotation ?? 0); const s = Math.sin(u.rotation ?? 0);
  const lx = dx * c - dz * s; const lz = dx * s + dz * c;
  return [lx / u.scale + u.width / 2, lz / u.scale + u.height / 2];
}

export class UnderlayLayer {
  constructor(viewport) {
    this.viewport = viewport;
    this.group = new THREE.Group();
    this.group.name = 'underlays';
    this.group.userData.helper = true;
    viewport.helpers.add(this.group);
    this.items = new Map(); // id → { asset, mesh, root, texture }
    this.textures = new Map(); // asset id → { texture, bytes }
  }

  textureFor(asset, bytes, mime) {
    const known = this.textures.get(asset);
    if (known && known.bytes === bytes) return known.texture;
    known?.texture.dispose();
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'image/png' }));
    const texture = new THREE.TextureLoader().load(url, () => { URL.revokeObjectURL(url); this.viewport.requestRender(); }, undefined, () => URL.revokeObjectURL(url));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    this.textures.set(asset, { texture, bytes });
    return texture;
  }

  /** Brings the underlays in line with the project. `assets` = Map id → bytes, `levelMode` like the builder's. */
  sync(project, { assets, levelMode = 'all' } = {}) {
    const list = project.underlays ?? [];
    const active = project.levels.find((l) => l.id === project.activeLevel) ?? project.levels[0];
    const seen = new Set();
    let changed = false;
    for (const u of list) {
      const level = project.levels.find((l) => l.id === u.level);
      const bytes = assets?.get(u.asset);
      if (!level || !bytes) continue;
      seen.add(u.id);
      let item = this.items.get(u.id);
      if (!item || item.asset !== u.asset) {
        if (item) this.dispose(u.id);
        const material = new THREE.MeshBasicMaterial({ map: this.textureFor(u.asset, bytes, project.assets?.[u.asset]?.mime), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 1;
        mesh.userData.helper = true;
        mesh.userData.underlay = u.id;
        const root = new THREE.Group();
        root.userData.helper = true;
        root.add(mesh);
        this.group.add(root);
        item = { asset: u.asset, mesh, root, key: '' };
        this.items.set(u.id, item);
        changed = true;
      }
      const inView = levelMode === 'all' || level.id === active.id || (levelMode === 'below' && level.elevation <= active.elevation);
      const key = JSON.stringify([u.position, u.rotation, u.scale, u.width, u.height, u.opacity, u.hidden, level.elevation, level.visible, inView]);
      if (item.key === key) continue;
      item.key = key;
      item.mesh.scale.set(u.width * u.scale, u.height * u.scale, 1);
      item.root.position.set(u.position[0], level.elevation + 0.002, u.position[1]);
      item.root.rotation.set(0, u.rotation ?? 0, 0);
      item.mesh.material.opacity = Math.max(0.05, Math.min(1, u.opacity ?? 0.6));
      item.root.visible = !u.hidden && level.visible !== false && inView;
      item.root.updateMatrixWorld(true);
      changed = true;
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) { this.dispose(id); changed = true; }
    for (const asset of [...this.textures.keys()]) if (!list.some((u) => u.asset === asset)) { this.textures.get(asset).texture.dispose(); this.textures.delete(asset); }
    if (changed) this.viewport.requestRender();
    return changed;
  }

  dispose(id) {
    const item = this.items.get(id);
    if (!item) return;
    this.group.remove(item.root);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();
    this.items.delete(id);
  }

  clear() { for (const id of [...this.items.keys()]) this.dispose(id); }
}
