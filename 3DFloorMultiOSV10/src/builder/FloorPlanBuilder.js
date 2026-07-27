import * as THREE from 'three';

/**
 * Ports Unity Builder.cs + WallMesh.cs logic into Three.js meshes.
 * API boxes (x1,y1,x2,y2) become extruded wall/door/window volumes.
 */
export class FloorPlanBuilder {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'FloorPlan';
    this._materials = {
      wall: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85, metalness: 0.05 }),
      door: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7, metalness: 0.05 }),
      window: new THREE.MeshStandardMaterial({
        color: 0x8ecae6,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
      }),
      floor: new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.95, metalness: 0 }),
    };
    this.options = {
      scale: 1,
      wallHeight: 2.5,
      wallThickness: 0.15,
      metersPerPixel: null,
    };
  }

  setColors({ wall, floor }) {
    if (wall) this._materials.wall.color.set(wall);
    if (floor) this._materials.floor.color.set(floor);
  }

  clear() {
    while (this.group.children.length) {
      const child = this.group.children.pop();
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      this.group.remove(child);
    }
  }

  build(detection, options = {}) {
    this.options = { ...this.options, ...options };
    this.clear();

    const { points, classes, Width, Height, averageDoor } = detection;
    const doorRef = averageDoor > 0 ? averageDoor : 36;
    // Map pixels → meters (typical interior door ~ 0.9m)
    const metersPerPixel =
      this.options.metersPerPixel ?? 0.9 / doorRef;
    const s = metersPerPixel * this.options.scale;
    const wallH = this.options.wallHeight;
    const wallT = Math.max(0.02, this.options.wallThickness ?? 0.15);

    const cx = ((Width || 0) * s) / 2;
    const cz = ((Height || 0) * s) / 2;

    /** @type {{ x: number, z: number, horiz: boolean }[]} */
    const wallSegs = [];

    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const className = (classes[i]?.name || 'wall').toLowerCase();
      const mesh = this._createSegmentMesh(p, className, s, wallH, wallT, cx, cz);
      if (mesh) this.group.add(mesh);
      if (className === 'wall') {
        const x1 = p.x1 * s;
        const x2 = p.x2 * s;
        const z1 = p.y1 * s;
        const z2 = p.y2 * s;
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);
        wallSegs.push({
          minX,
          maxX,
          minZ,
          maxZ,
          horiz: maxX - minX >= maxZ - minZ,
        });
      }
    }

    // Fill corner gaps with a single post (avoids overlapping wall boxes)
    for (const post of this._cornerPosts(wallSegs, wallT)) {
      const geometry = new THREE.BoxGeometry(wallT, wallH, wallT);
      const mesh = new THREE.Mesh(geometry, this._materials.wall);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(post.x - cx, wallH / 2, post.z - cz);
      mesh.name = 'wallCorner';
      this.group.add(mesh);
    }

    const floor = this._createFloor(Width || 1, Height || 1, s, cx, cz, options.floorTexture || null);
    this.group.add(floor);

    return this.group;
  }

  /**
   * Find L/T junctions where a horizontal and vertical wall endpoint meet,
   * and return one post center per unique corner (in plan meters).
   */
  _cornerPosts(segs, wallT) {
    const tol = Math.max(wallT * 1.25, 0.04);
    const posts = [];
    const seen = new Set();

    const keyOf = (x, z) => `${(Math.round(x / (tol * 0.5)) * (tol * 0.5)).toFixed(3)},${(Math.round(z / (tol * 0.5)) * (tol * 0.5)).toFixed(3)}`;

    const ends = (seg) => {
      if (seg.horiz) {
        const z = (seg.minZ + seg.maxZ) / 2;
        return [
          { x: seg.minX, z, horiz: true },
          { x: seg.maxX, z, horiz: true },
        ];
      }
      const x = (seg.minX + seg.maxX) / 2;
      return [
        { x, z: seg.minZ, horiz: false },
        { x, z: seg.maxZ, horiz: false },
      ];
    };

    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const a = segs[i];
        const b = segs[j];
        if (a.horiz === b.horiz) continue;
        const h = a.horiz ? a : b;
        const v = a.horiz ? b : a;
        for (const he of ends(h)) {
          for (const ve of ends(v)) {
            if (Math.abs(he.x - ve.x) > tol || Math.abs(he.z - ve.z) > tol) continue;
            const x = (he.x + ve.x) / 2;
            const z = (he.z + ve.z) / 2;
            const key = keyOf(x, z);
            if (seen.has(key)) continue;
            seen.add(key);
            posts.push({ x, z });
          }
        }
      }
    }
    return posts;
  }

  /**
   * Unity WallMesh placed vertices as (y, height, x) with bbox corners.
   * Here we build a BoxGeometry aligned to the bbox in XZ, Y = height.
   */
  _createSegmentMesh(point, className, s, wallH, wallT, cx, cz) {
    const x1 = point.x1 * s;
    const x2 = point.x2 * s;
    const y1 = point.y1 * s;
    const y2 = point.y2 * s;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(y1, y2);
    const maxZ = Math.max(y1, y2);

    let width = Math.max(0.05, maxX - minX);
    let depth = Math.max(0.05, maxZ - minZ);
    let height = wallH;
    let yCenter = wallH / 2;
    let material = this._materials.wall;

    // Apply user thickness to the thin axis of the segment bbox
    const applyThickness = (thickness) => {
      if (width >= depth) depth = thickness;
      else width = thickness;
    };

    if (className === 'window') {
      height = wallH * 0.45;
      yCenter = wallH * 0.55;
      material = this._materials.window;
      applyThickness(Math.max(0.02, wallT * 0.7));
    } else if (className === 'door') {
      height = wallH * 0.85;
      yCenter = height / 2;
      material = this._materials.door;
      applyThickness(Math.max(0.02, wallT * 0.85));
    } else {
      applyThickness(wallT);
      // Leave half-thickness at each end for a dedicated corner post (no box overlap)
      const trim = wallT * 0.5;
      if (width >= depth) width = Math.max(wallT * 0.25, width - 2 * trim);
      else depth = Math.max(wallT * 0.25, depth - 2 * trim);
    }

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      (minX + maxX) / 2 - cx,
      yCenter,
      (minZ + maxZ) / 2 - cz,
    );
    mesh.name = className;
    mesh.userData.className = className;
    return mesh;
  }

  _createFloor(widthPx, heightPx, s, cx, cz, floorTexture = null) {
    const w = Math.max(1, widthPx * s);
    const d = Math.max(1, heightPx * s);
    const geometry = new THREE.PlaneGeometry(w, d);
    let material = this._materials.floor;
    if (floorTexture) {
      material = this._materials.floor.clone();
      material.map = floorTexture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, 0);
    mesh.receiveShadow = true;
    mesh.name = 'floor';
    // cx/cz already centered via segment positions; plane is centered at origin
    void cx;
    void cz;
    return mesh;
  }

  /**
   * Show only the selected 2D floor-plan image (before 3D conversion).
   * @param {THREE.Texture} texture
   * @param {{ maxSize?: number }} [opts]
   */
  showPlanImage(texture, opts = {}) {
    this.clear();
    const img = texture?.image;
    const iw = Math.max(1, img?.width || img?.videoWidth || 1);
    const ih = Math.max(1, img?.height || img?.videoHeight || 1);
    const maxSize = opts.maxSize ?? 12;
    const aspect = iw / ih;
    const w = aspect >= 1 ? maxSize : maxSize * aspect;
    const d = aspect >= 1 ? maxSize / aspect : maxSize;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.001, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'planImage';
    this.group.add(mesh);
    return mesh;
  }

  getBounds() {
    return new THREE.Box3().setFromObject(this.group);
  }
}
