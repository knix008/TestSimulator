import * as THREE from 'three';
import {
  createFloorPatternCanvas,
  getFloorPattern,
  normalizeFloorPatternId,
} from '../data/floorPatterns.js';

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
    /** @type {Map<string, THREE.CanvasTexture>} */
    this._floorPatternTextures = new Map();
    this.options = {
      scale: 1,
      wallHeight: 2.5,
      wallThickness: 0.15,
      metersPerPixel: null,
      floorMode: 'image',
      floorPattern: 'wood',
    };
  }

  setColors({ wall, floor }) {
    if (wall) this._materials.wall.color.set(wall);
    if (floor) {
      this._materials.floor.color.set(floor);
      this.group.traverse((obj) => {
        if (obj.name !== 'floor' || !obj.material) return;
        // Plan-image floors stay white so the texture colors show through
        if (obj.userData.floorMode === 'image' && obj.material.map) {
          obj.material.color.set(0xffffff);
        } else {
          obj.material.color.set(floor);
        }
      });
    }
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

    const { Width, Height, averageDoor } = detection;
    const unity = detection.unityParams || this.options.unityParams || {};
    const doorWidthM = Number(unity.doorWidthM) > 0 ? Number(unity.doorWidthM) : 0.9;
    const doorFallbackRatio = Number(unity.doorFallbackRatio) > 0
      ? Number(unity.doorFallbackRatio)
      : 0.045;
    // Collapse double-line walls and cut wall boxes under doors/windows
    const { points, classes } = this._prepareSegments(
      detection.points || [],
      detection.classes || [],
      Width || 0,
      Height || 0,
      {
        mergeParallel: unity.mergeParallel !== false,
        carveOpenings: unity.carveOpenings !== false,
        carveBandScale: Number(unity.carveBandScale) || 1.35,
        parallelGapRatio: Number(unity.parallelGapRatio) || 0.015,
      },
    );
    // Prefer API/heuristic averageDoor; if missing, use image-span fallback.
    const span = Math.max(1, Math.min(Number(Width) || 1, Number(Height) || 1));
    const doorRef = averageDoor > 0 ? averageDoor : Math.max(24, span * doorFallbackRatio);
    // Map pixels → meters (typical interior door ~ doorWidthM)
    const metersPerPixel =
      this.options.metersPerPixel ?? doorWidthM / doorRef;
    const s = metersPerPixel * this.options.scale;
    const wallH = Math.max(0, Number(this.options.wallHeight) || 0);
    const wallT = Math.max(0.02, this.options.wallThickness ?? 0.15);

    const cx = ((Width || 0) * s) / 2;
    const cz = ((Height || 0) * s) / 2;

    /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number, horiz: boolean }[]} */
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
    if (wallH > 0) {
      for (const post of this._cornerPosts(wallSegs, wallT)) {
        const geometry = new THREE.BoxGeometry(wallT, wallH, wallT);
        const mesh = new THREE.Mesh(geometry, this._materials.wall);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(post.x - cx, wallH / 2, post.z - cz);
        mesh.name = 'wallCorner';
        this.group.add(mesh);
      }
    }

    const floor = this._createFloor(Width || 1, Height || 1, s, cx, cz, {
      floorTexture: options.floorTexture || null,
      floorMode: options.floorMode || 'image',
      floorPattern: options.floorPattern || 'wood',
    });
    this.group.add(floor);

    return this.group;
  }

  /**
   * Normalize detection boxes before meshing:
   * 1) merge parallel double-line walls into one
   * 2) carve door/window intervals out of walls (avoid stacked double thickness)
   */
  _prepareSegments(points, classes, widthPx = 0, heightPx = 0, prep = {}) {
    /** @type {{ x1: number, y1: number, x2: number, y2: number, className: string }[]} */
    const segs = points.map((p, i) => ({
      x1: Number(p.x1) || 0,
      y1: Number(p.y1) || 0,
      x2: Number(p.x2) || 0,
      y2: Number(p.y2) || 0,
      className: (classes[i]?.name || 'wall').toLowerCase(),
    }));

    let walls = segs.filter((s) => s.className === 'wall');
    const openings = segs.filter((s) => s.className === 'door' || s.className === 'window');
    const other = segs.filter(
      (s) => s.className !== 'wall' && s.className !== 'door' && s.className !== 'window',
    );

    if (prep.mergeParallel !== false) {
      walls = this._mergeParallelWalls(walls, widthPx, heightPx, prep.parallelGapRatio);
    }
    if (prep.carveOpenings !== false) {
      walls = this._carveOpenings(walls, openings, prep.carveBandScale);
    }

    const outPoints = [];
    const outClasses = [];
    for (const s of [...walls, ...openings, ...other]) {
      outPoints.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
      outClasses.push({ name: s.className });
    }
    return { points: outPoints, classes: outClasses };
  }

  /** Merge near-parallel overlapping wall boxes (common double-stroke drawings). */
  _mergeParallelWalls(walls, widthPx = 0, heightPx = 0, parallelGapRatio = 0.015) {
    const items = walls.map((w) => {
      const width = Math.abs(w.x2 - w.x1);
      const height = Math.abs(w.y2 - w.y1);
      return { ...w, horiz: width >= height };
    });
    const gapRatio = Number(parallelGapRatio) > 0 ? Number(parallelGapRatio) : 0.015;
    // Allow only a small clear gap between strokes, not room-scale spacing
    const absGap = Math.max(
      8,
      Math.min(widthPx || 512, heightPx || 512) * gapRatio,
    );

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i];
          const b = items[j];
          if (a.horiz !== b.horiz) continue;

          if (a.horiz) {
            const ay = (a.y1 + a.y2) / 2;
            const by = (b.y1 + b.y2) / 2;
            const ta = Math.max(1, Math.abs(a.y2 - a.y1));
            const tb = Math.max(1, Math.abs(b.y2 - b.y1));
            const a0 = Math.min(a.y1, a.y2);
            const a1 = Math.max(a.y1, a.y2);
            const b0 = Math.min(b.y1, b.y2);
            const b1 = Math.max(b.y1, b.y2);
            const edgeGap = Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
            const maxEdgeGap = Math.max(absGap, Math.max(ta, tb) * 1.8);
            const overlap = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2))
              - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
            const minLen = Math.min(Math.abs(a.x2 - a.x1), Math.abs(b.x2 - b.x1));
            if (edgeGap > maxEdgeGap || overlap < minLen * 0.4) continue;

            const nx1 = Math.min(a.x1, a.x2, b.x1, b.x2);
            const nx2 = Math.max(a.x1, a.x2, b.x1, b.x2);
            const cy = (ay + by) / 2;
            const t = Math.max(ta, tb);
            items[i] = {
              x1: nx1,
              y1: cy - t / 2,
              x2: nx2,
              y2: cy + t / 2,
              className: 'wall',
              horiz: true,
            };
          } else {
            const ax = (a.x1 + a.x2) / 2;
            const bx = (b.x1 + b.x2) / 2;
            const ta = Math.max(1, Math.abs(a.x2 - a.x1));
            const tb = Math.max(1, Math.abs(b.x2 - b.x1));
            const a0 = Math.min(a.x1, a.x2);
            const a1 = Math.max(a.x1, a.x2);
            const b0 = Math.min(b.x1, b.x2);
            const b1 = Math.max(b.x1, b.x2);
            const edgeGap = Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
            const maxEdgeGap = Math.max(absGap, Math.max(ta, tb) * 1.8);
            const overlap = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2))
              - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
            const minLen = Math.min(Math.abs(a.y2 - a.y1), Math.abs(b.y2 - b.y1));
            if (edgeGap > maxEdgeGap || overlap < minLen * 0.4) continue;

            const ny1 = Math.min(a.y1, a.y2, b.y1, b.y2);
            const ny2 = Math.max(a.y1, a.y2, b.y1, b.y2);
            const cx = (ax + bx) / 2;
            const t = Math.max(ta, tb);
            items[i] = {
              x1: cx - t / 2,
              y1: ny1,
              x2: cx + t / 2,
              y2: ny2,
              className: 'wall',
              horiz: false,
            };
          }

          items.splice(j, 1);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }

    return items.map(({ x1, y1, x2, y2, className }) => ({ x1, y1, x2, y2, className }));
  }

  /** Remove wall intervals covered by doors/windows so meshes don't stack. */
  _carveOpenings(walls, openings, carveBandScale = 1.35) {
    if (!openings.length) return walls;
    const bandScale = Number(carveBandScale) > 0 ? Number(carveBandScale) : 1.35;

    const result = [];
    for (const wall of walls) {
      const horiz = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
      /** @type {[number, number][]} */
      const cuts = [];

      for (const op of openings) {
        if (horiz) {
          const wy = (wall.y1 + wall.y2) / 2;
          const oy = (op.y1 + op.y2) / 2;
          const band = Math.max(Math.abs(wall.y2 - wall.y1), Math.abs(op.y2 - op.y1), 2) * bandScale;
          if (Math.abs(wy - oy) > band) continue;
          const wx1 = Math.min(wall.x1, wall.x2);
          const wx2 = Math.max(wall.x1, wall.x2);
          const ox1 = Math.min(op.x1, op.x2);
          const ox2 = Math.max(op.x1, op.x2);
          const c1 = Math.max(wx1, ox1);
          const c2 = Math.min(wx2, ox2);
          if (c2 - c1 > 1) cuts.push([c1, c2]);
        } else {
          const wx = (wall.x1 + wall.x2) / 2;
          const ox = (op.x1 + op.x2) / 2;
          const band = Math.max(Math.abs(wall.x2 - wall.x1), Math.abs(op.x2 - op.x1), 2) * bandScale;
          if (Math.abs(wx - ox) > band) continue;
          const wy1 = Math.min(wall.y1, wall.y2);
          const wy2 = Math.max(wall.y1, wall.y2);
          const oy1 = Math.min(op.y1, op.y2);
          const oy2 = Math.max(op.y1, op.y2);
          const c1 = Math.max(wy1, oy1);
          const c2 = Math.min(wy2, oy2);
          if (c2 - c1 > 1) cuts.push([c1, c2]);
        }
      }

      if (!cuts.length) {
        result.push(wall);
        continue;
      }

      cuts.sort((a, b) => a[0] - b[0]);
      const merged = [cuts[0]];
      for (let i = 1; i < cuts.length; i += 1) {
        const prev = merged[merged.length - 1];
        const cur = cuts[i];
        if (cur[0] <= prev[1] + 1) prev[1] = Math.max(prev[1], cur[1]);
        else merged.push(cur);
      }

      if (horiz) {
        const y1 = Math.min(wall.y1, wall.y2);
        const y2 = Math.max(wall.y1, wall.y2);
        let cursor = Math.min(wall.x1, wall.x2);
        const end = Math.max(wall.x1, wall.x2);
        const minStub = Math.max(2, Math.abs(y2 - y1) * 0.5);
        for (const [c1, c2] of merged) {
          if (c1 - cursor >= minStub) {
            result.push({ x1: cursor, y1, x2: c1, y2, className: 'wall' });
          }
          cursor = Math.max(cursor, c2);
        }
        if (end - cursor >= minStub) {
          result.push({ x1: cursor, y1, x2: end, y2, className: 'wall' });
        }
      } else {
        const x1 = Math.min(wall.x1, wall.x2);
        const x2 = Math.max(wall.x1, wall.x2);
        let cursor = Math.min(wall.y1, wall.y2);
        const end = Math.max(wall.y1, wall.y2);
        const minStub = Math.max(2, Math.abs(x2 - x1) * 0.5);
        for (const [c1, c2] of merged) {
          if (c1 - cursor >= minStub) {
            result.push({ x1, y1: cursor, x2, y2: c1, className: 'wall' });
          }
          cursor = Math.max(cursor, c2);
        }
        if (end - cursor >= minStub) {
          result.push({ x1, y1: cursor, x2, y2: end, className: 'wall' });
        }
      }
    }
    return result;
  }

  /** Cached CanvasTexture for a pattern id (null for solid). */
  _getFloorPatternTexture(patternId) {
    const id = normalizeFloorPatternId(patternId);
    const def = getFloorPattern(id);
    if (def.solid) return null;
    const cached = this._floorPatternTextures.get(id);
    if (cached) return cached;

    const canvas = createFloorPatternCanvas(id);
    if (!canvas) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this._floorPatternTextures.set(id, texture);
    return texture;
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
    if (!(wallH > 0)) return null;

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

  _createFloor(
    widthPx,
    heightPx,
    s,
    cx,
    cz,
    { floorTexture = null, floorMode = 'image', floorPattern = 'wood' } = {},
  ) {
    const w = Math.max(1, widthPx * s);
    const d = Math.max(1, heightPx * s);
    const geometry = new THREE.PlaneGeometry(w, d);
    const mode = floorMode === 'pattern' ? 'pattern' : 'image';
    const patternId = normalizeFloorPatternId(floorPattern);
    const patternDef = getFloorPattern(patternId);
    let material = this._materials.floor;

    if (mode === 'pattern') {
      material = this._materials.floor.clone();
      const baseMap = this._getFloorPatternTexture(patternId);
      if (baseMap) {
        const map = baseMap.clone();
        map.needsUpdate = true;
        const tile = Math.max(0.2, patternDef.tileMeters || 0.6);
        map.repeat.set(Math.max(1, w / tile), Math.max(1, d / tile));
        material.map = map;
      } else {
        material.map = null;
      }
      material.needsUpdate = true;
    } else if (floorTexture) {
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
    mesh.userData.floorMode = mode;
    mesh.userData.floorPattern = patternId;
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
