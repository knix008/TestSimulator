import * as THREE from 'three';
import {
  createFloorPatternCanvas,
  getFloorPattern,
  normalizeFloorPatternId,
} from '../data/floorPatterns.js';

/**
 * Build extruded wall/door/window volumes from detection boxes.
 *
 * Coordinate convention (image pixel space → Three.js):
 *   - Image origin: top-left, x right, y down (API / heuristic / DreamSpace)
 *   - worldX = x * s − Width*s/2
 *   - worldZ = y * s − Height*s/2   (image +y → world +Z)
 *   - Floor: PlaneGeometry(W*s, H*s) + rotation.x = −π/2 + texture.flipY
 *     so image top lands on world −Z, matching walls at y≈0.
 *
 * Note: Unity WallMesh uses (worldX, worldZ) = (imageY, imageX). We intentionally
 * do NOT swap axes so walls stay registered to the plan floor texture.
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

    const aligned = this._alignDetectionToFloorTexture(
      detection,
      options.floorTexture || null,
    );
    const { Width, Height, averageDoor } = aligned;
    const unity = aligned.unityParams || this.options.unityParams || {};
    const doorWidthM = Number(unity.doorWidthM) > 0 ? Number(unity.doorWidthM) : 0.9;
    const doorFallbackRatio = Number(unity.doorFallbackRatio) > 0
      ? Number(unity.doorFallbackRatio)
      : 0.045;
    // Collapse double-line walls and cut wall boxes under doors/windows
    const { points, classes } = this._prepareSegments(
      aligned.points || [],
      aligned.classes || [],
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
      // Treat window/door plates as wall footprint for junction filling
      if (className === 'wall' || className === 'window' || className === 'door') {
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
      const mesh = this._createSegmentMesh(p, className, s, wallH, wallT, cx, cz);
      if (mesh) this.group.add(mesh);
    }

    // Bridge small collinear gaps + fill L/T junctions so walls read as continuous
    if (wallH > 0) {
      for (const bridge of this._collinearBridges(wallSegs, wallT)) {
        const geometry = new THREE.BoxGeometry(bridge.w, wallH, bridge.d);
        const mesh = new THREE.Mesh(geometry, this._materials.wall);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(bridge.x - cx, wallH / 2, bridge.z - cz);
        mesh.name = 'wallBridge';
        this.group.add(mesh);
      }
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
   * Map detection pixel space onto the floor texture pixel space when they differ
   * (e.g. API EXIF-rotated dims vs client texture). Prefer texture size for the floor.
   */
  _alignDetectionToFloorTexture(detection, floorTexture) {
    if (!detection || !floorTexture?.image) return detection;
    const img = floorTexture.image;
    const tw = Math.max(0, Number(img.width || img.videoWidth) || 0);
    const th = Math.max(0, Number(img.height || img.videoHeight) || 0);
    const dw = Math.max(0, Number(detection.Width) || 0);
    const dh = Math.max(0, Number(detection.Height) || 0);
    if (!(tw > 0 && th > 0 && dw > 0 && dh > 0)) return detection;
    if (Math.abs(tw - dw) < 0.5 && Math.abs(th - dh) < 0.5) return detection;

    const sx = tw / dw;
    const sy = th / dh;
    return {
      ...detection,
      Width: tw,
      Height: th,
      points: (detection.points || []).map((p) => ({
        x1: (Number(p.x1) || 0) * sx,
        y1: (Number(p.y1) || 0) * sy,
        x2: (Number(p.x2) || 0) * sx,
        y2: (Number(p.y2) || 0) * sy,
      })),
    };
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
    // Cap hard — never scale with bbox thickness (that slid walls into room centers)
    const maxFaceGap = Math.max(
      4,
      Math.min(14, Math.min(widthPx || 512, heightPx || 512) * gapRatio),
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
            // Only true double-lines: faces nearly touch
            const faceGap = Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
            if (faceGap > maxFaceGap) continue;
            const overlap = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2))
              - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
            const minLen = Math.min(Math.abs(a.x2 - a.x1), Math.abs(b.x2 - b.x1));
            if (overlap < minLen * 0.45) continue;

            const nx1 = Math.min(a.x1, a.x2, b.x1, b.x2);
            const nx2 = Math.max(a.x1, a.x2, b.x1, b.x2);
            const y1 = Math.min(a0, b0);
            const y2 = Math.max(a1, b1);
            const t = Math.min(Math.max(y2 - y1, Math.max(ta, tb)), Math.max(ta, tb) * 1.35 + faceGap);
            const cy = (y1 + y2) / 2;
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
            const faceGap = Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
            if (faceGap > maxFaceGap) continue;
            const overlap = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2))
              - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
            const minLen = Math.min(Math.abs(a.y2 - a.y1), Math.abs(b.y2 - b.y1));
            if (overlap < minLen * 0.45) continue;

            const ny1 = Math.min(a.y1, a.y2, b.y1, b.y2);
            const ny2 = Math.max(a.y1, a.y2, b.y1, b.y2);
            const x1 = Math.min(a0, b0);
            const x2 = Math.max(a1, b1);
            const t = Math.min(Math.max(x2 - x1, Math.max(ta, tb)), Math.max(ta, tb) * 1.35 + faceGap);
            const cx = (x1 + x2) / 2;
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
      const wallThin = horiz
        ? Math.max(2, Math.abs(wall.y2 - wall.y1))
        : Math.max(2, Math.abs(wall.x2 - wall.x1));
      /** @type {[number, number][]} */
      const cuts = [];

      for (const op of openings) {
        if (horiz) {
          const wy = (wall.y1 + wall.y2) / 2;
          const oy = (op.y1 + op.y2) / 2;
          // Band from wall thickness only — fat door/window boxes must not steal neighboring walls
          const band = wallThin * bandScale;
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
          const band = wallThin * bandScale;
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
        const minStub = Math.max(2, Math.min(8, wallThin * 0.25));
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
        const minStub = Math.max(2, Math.min(8, wallThin * 0.25));
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
   * Fill small gaps between nearly-collinear wall segments (plan meters).
   * @returns {{ x: number, z: number, w: number, d: number }[]}
   */
  _collinearBridges(segs, wallT) {
    const maxGap = Math.max(wallT * 2.5, 0.08);
    const alignTol = Math.max(wallT * 0.85, 0.05);
    /** @type {{ x: number, z: number, w: number, d: number }[]} */
    const bridges = [];
    const seen = new Set();
    const keyOf = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;

    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const a = segs[i];
        const b = segs[j];
        if (a.horiz !== b.horiz) continue;

        if (a.horiz) {
          const za = (a.minZ + a.maxZ) / 2;
          const zb = (b.minZ + b.maxZ) / 2;
          if (Math.abs(za - zb) > alignTol) continue;
          const gap = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
          if (gap <= 0.001 || gap > maxGap) continue;
          const x1 = Math.min(a.maxX, b.maxX);
          const x2 = Math.max(a.minX, b.minX);
          const x = (x1 + x2) / 2;
          const z = (za + zb) / 2;
          const key = keyOf(x, z);
          if (seen.has(key)) continue;
          seen.add(key);
          bridges.push({
            x,
            z,
            w: Math.max(wallT * 0.5, gap + wallT * 0.15),
            d: wallT,
          });
        } else {
          const xa = (a.minX + a.maxX) / 2;
          const xb = (b.minX + b.maxX) / 2;
          if (Math.abs(xa - xb) > alignTol) continue;
          const gap = Math.max(0, Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ));
          if (gap <= 0.001 || gap > maxGap) continue;
          const z1 = Math.min(a.maxZ, b.maxZ);
          const z2 = Math.max(a.minZ, b.minZ);
          const x = (xa + xb) / 2;
          const z = (z1 + z2) / 2;
          const key = keyOf(x, z);
          if (seen.has(key)) continue;
          seen.add(key);
          bridges.push({
            x,
            z,
            w: wallT,
            d: Math.max(wallT * 0.5, gap + wallT * 0.15),
          });
        }
      }
    }
    return bridges;
  }

  /**
   * L / T junctions: endpoint↔endpoint and endpoint↔body of a perpendicular wall.
   * @returns {{ x: number, z: number }[]}
   */
  _cornerPosts(segs, wallT) {
    const tol = Math.max(wallT * 2.25, 0.08);
    const posts = [];
    const seen = new Set();

    const keyOf = (x, z) => `${(Math.round(x / (tol * 0.4)) * (tol * 0.4)).toFixed(3)},${(Math.round(z / (tol * 0.4)) * (tol * 0.4)).toFixed(3)}`;

    const add = (x, z) => {
      const key = keyOf(x, z);
      if (seen.has(key)) return;
      seen.add(key);
      posts.push({ x, z });
    };

    const ends = (seg) => {
      if (seg.horiz) {
        const z = (seg.minZ + seg.maxZ) / 2;
        return [
          { x: seg.minX, z },
          { x: seg.maxX, z },
        ];
      }
      const x = (seg.minX + seg.maxX) / 2;
      return [
        { x, z: seg.minZ },
        { x, z: seg.maxZ },
      ];
    };

    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const a = segs[i];
        const b = segs[j];
        if (a.horiz === b.horiz) continue;
        const h = a.horiz ? a : b;
        const v = a.horiz ? b : a;
        const hz = (h.minZ + h.maxZ) / 2;
        const vx = (v.minX + v.maxX) / 2;

        // Classic L: both endpoints near each other
        for (const he of ends(h)) {
          for (const ve of ends(v)) {
            if (Math.abs(he.x - ve.x) <= tol && Math.abs(he.z - ve.z) <= tol) {
              add((he.x + ve.x) / 2, (he.z + ve.z) / 2);
            }
          }
        }

        // T: horizontal end meets vertical body
        for (const he of ends(h)) {
          if (Math.abs(he.x - vx) > tol) continue;
          if (he.z < v.minZ - tol || he.z > v.maxZ + tol) continue;
          add(vx, Math.min(v.maxZ, Math.max(v.minZ, he.z)));
        }
        // T: vertical end meets horizontal body
        for (const ve of ends(v)) {
          if (Math.abs(ve.z - hz) > tol) continue;
          if (ve.x < h.minX - tol || ve.x > h.maxX + tol) continue;
          add(Math.min(h.maxX, Math.max(h.minX, ve.x)), hz);
        }
      }
    }
    return posts;
  }

  /**
   * BoxGeometry in XZ from image bbox; Y = height.
   * Pixel (x,y) → world (x*s − cx, …, y*s − cz).
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

    const px = (minX + maxX) / 2 - cx;
    const pz = (minZ + maxZ) / 2 - cz;

    if (className === 'window') {
      // Glass mid-wall; sill + lintel use full wall thickness and extend to meet
      // adjacent wall stubs (those are end-trimmed by wallT/2 for corner posts).
      const horiz = width >= depth;
      const wallThick = Math.max(0.02, wallT);
      const glassThick = Math.max(0.02, wallT * 0.55);
      const join = wallThick; // cover half-trim on each side of the opening
      let plateW = width;
      let plateD = depth;
      let glassW = width;
      let glassD = depth;
      if (horiz) {
        plateD = wallThick;
        plateW = width + join;
        glassD = glassThick;
      } else {
        plateW = wallThick;
        plateD = depth + join;
        glassW = glassThick;
      }

      const winH = wallH * 0.45;
      const winY = wallH * 0.55;
      const winBottom = winY - winH / 2;
      const winTop = winY + winH / 2;
      const sillH = Math.max(0.02, winBottom);
      const lintelH = Math.max(0.02, wallH - winTop);

      const group = new THREE.Group();
      group.name = 'window';
      group.userData.className = 'window';

      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(plateW, sillH, plateD),
        this._materials.wall,
      );
      sill.castShadow = true;
      sill.receiveShadow = true;
      sill.position.set(px, sillH / 2, pz);
      sill.name = 'windowSill';
      group.add(sill);

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(glassW, winH, glassD),
        this._materials.window,
      );
      glass.castShadow = true;
      glass.receiveShadow = true;
      glass.position.set(px, winY, pz);
      glass.name = 'window';
      group.add(glass);

      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(plateW, lintelH, plateD),
        this._materials.wall,
      );
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      lintel.position.set(px, winTop + lintelH / 2, pz);
      lintel.name = 'windowLintel';
      group.add(lintel);

      return group;
    }

    if (className === 'door') {
      height = wallH * 0.85;
      yCenter = height / 2;
      material = this._materials.door;
      const horiz = width >= depth;
      const wallThick = Math.max(0.02, wallT);
      const doorThick = Math.max(0.02, wallT * 0.85);
      const join = wallThick;
      let doorW = width;
      let doorD = depth;
      let plateW = width;
      let plateD = depth;
      if (horiz) {
        doorD = doorThick;
        plateD = wallThick;
        plateW = width + join;
      } else {
        doorW = doorThick;
        plateW = wallThick;
        plateD = depth + join;
      }
      const lintelH = Math.max(0.02, wallH - height);
      const group = new THREE.Group();
      group.name = 'door';
      group.userData.className = 'door';

      const door = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, height, doorD),
        material,
      );
      door.castShadow = true;
      door.receiveShadow = true;
      door.position.set(px, yCenter, pz);
      door.name = 'door';
      group.add(door);

      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(plateW, lintelH, plateD),
        this._materials.wall,
      );
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      lintel.position.set(px, height + lintelH / 2, pz);
      lintel.name = 'doorLintel';
      group.add(lintel);

      return group;
    }

    applyThickness(wallT);
    // Slight end overlap so corners meet even when detection boxes don't touch
    const pad = wallT * 0.35;
    if (width >= depth) width = Math.max(wallT, width + pad);
    else depth = Math.max(wallT, depth + pad);

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(px, yCenter, pz);
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
