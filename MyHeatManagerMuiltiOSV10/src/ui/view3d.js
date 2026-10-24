// The 3D view (three.js): the model's bodies as solids before a study, and
// afterwards the result painted on the outer faces of the simulated cells
// (3D models) or as a carpet plot — the field as colour and height — for 2D
// models. Orbit with the left button, pan with the right, zoom with the wheel.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { field, viewField, range, slice as sliceField } from '../core/result.js';
import { marchingCubes } from '../core/isosurface.js';
import { lut } from '../core/colormap.js';
import { materialColor } from './editor2d.js';
import { SceneGuides } from './scene-guides.js';

export class View3D {
  constructor(host) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'view3d-host';
    this.el.dataset.testid = 'view3d';
    host.append(this.el);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.el.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, -1.5, 2);
    this.scene.add(sun);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.guides = new SceneGuides(this.scene);
    this.guideOptions = { showGrid: true, showAxes: true, unit: 'mm' };
    this.controls.addEventListener('change', () => {
      this.updateGuides();
      // The toolbar's zoom value follows the wheel.
      const value = document.querySelector('[data-testid=zoom-value]');
      if (value) value.textContent = `${this.zoomPercent()}%`;
    });
    this.key = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      if (this.controls.update()) this.render();
    };
    tick();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearGroup();
    this.renderer.dispose();
    this.el.remove();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    this.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  updateGuides() {
    this.guides.update(this.camera, this.controls.target, this.guideOptions);
  }

  /** The toolbar's zoom: moves the camera along its line of sight (factor > 1 comes closer). */
  zoomBy(factor) {
    const target = this.controls.target;
    const offset = this.camera.position.clone().sub(target).divideScalar(factor);
    this.camera.position.copy(target.clone().add(offset));
    this.controls.update();
    this.updateGuides();
    this.render();
  }

  /** Zoom in % relative to the fitted view (the toolbar's value). */
  zoomPercent() {
    return this.fitDistance ? Math.round((this.fitDistance / this.camera.position.distanceTo(this.controls.target)) * 100) : 100;
  }

  clearGroup() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }
  }

  /** state: { model, result, showResult, fieldKind, frame, settings, range } */
  setState(state) {
    const { model, result, showResult, fieldKind, frame, settings } = state;
    if (!model) return;
    const css = (name, fallback) => getComputedStyle(this.host).getPropertyValue(name).trim() || fallback;
    this.guideOptions = { showGrid: state.showGrid !== false, showAxes: state.showAxes !== false, unit: state.lengthUnit ?? 'mm', colors: { minor: css('--grid-minor', '#3a4656'), major: css('--grid-major', '#5d6d82'), text: css('--text', '#cfd8e3') } };
    this.updateGuides();
    this.render();
    const post = `${JSON.stringify(state.slice ?? null)}:${JSON.stringify(state.iso ?? null)}`;
    const key = `${model.bodies.length}:${JSON.stringify(model.domain)}:${showResult ? `${result?.id}:${fieldKind}:${frame}:${settings.colormap}:${settings.colorSteps}:${state.range?.lo}:${state.range?.hi}:${post}` : JSON.stringify(model.bodies)}`;
    if (key === this.key) return;
    const first = this.key === null || this.domainKey !== JSON.stringify(model.domain);
    this.key = key;
    this.domainKey = JSON.stringify(model.domain);
    this.clearGroup();
    const d = model.domain;
    const thickness = d.dim === 3 ? d.depth : Math.min(d.depth, Math.max(d.width, d.height) * 0.08);
    if (showResult && result) {
      if (result.header.grid.dim === 3) {
        // With a slice or an isosurface the outer surface turns see-through so they show inside it.
        const post3d = state.slice?.axis || state.iso?.on;
        this.buildVoxelSurface(result, fieldKind, frame, settings, state.range, post3d ? 0.18 : 1);
        if (state.slice?.axis) this.buildSlice(result, fieldKind, frame, settings, state.range, state.slice);
        if (state.iso?.on) this.buildIsosurface(result, fieldKind, frame, settings, state.range, state.iso.value);
      }
      else this.buildCarpet(result, fieldKind, frame, settings, state.range, Math.max(d.width, d.height) * 0.25);
    } else {
      this.buildBodies(model, thickness);
    }
    this.buildFrame(d, thickness);
    if (first) this.fit(d, thickness);
    this.updateGuides();
    this.render();
  }

  fit(d, thickness) {
    const size = Math.max(d.width, d.height, thickness);
    const center = new THREE.Vector3(d.width / 2, d.height / 2, thickness / 2);
    this.controls.target.copy(center);
    this.camera.position.set(center.x + size * 0.9, center.y - size * 1.3, center.z + size * 0.9);
    this.camera.near = size / 1000;
    this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.fitDistance = this.camera.position.distanceTo(center);
  }

  buildFrame(d, thickness) {
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(d.width, d.height, thickness));
    const helper = new THREE.Box3Helper(box, 0x888888);
    this.group.add(helper);
  }

  buildBodies(model, thickness) {
    const materials = new Map(model.materials.map((m) => [m.id, m]));
    const is3d = model.domain.dim === 3;
    for (const body of model.bodies) {
      if (body.hidden) continue;
      const z0 = is3d ? body.z0 : 0;
      const z1 = is3d ? body.z1 : thickness;
      const height = Math.max(1e-6, z1 - z0);
      let geometry;
      if (body.shape === 'circle') {
        geometry = new THREE.CylinderGeometry(body.r, body.r, height, 48);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(body.cx, body.cy, z0 + height / 2);
      } else if (body.shape === 'polygon' && body.points.length >= 3) {
        const shape = new THREE.Shape(body.points.map(([x, y]) => new THREE.Vector2(x, y)));
        geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        geometry.translate(0, 0, z0);
      } else {
        geometry = new THREE.BoxGeometry(Math.max(1e-6, body.w), Math.max(1e-6, body.h), height);
        geometry.translate(body.x + body.w / 2, body.y + body.h / 2, z0 + height / 2);
      }
      const color = new THREE.Color(materialColor(materials.get(body.material)));
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      this.group.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 }));
      this.group.add(edges);
    }
  }

  colorizer(result, fieldKind, frame, settings, fixedRange) {
    const vf = viewField(result, fieldKind, frame);
    if (!vf) return null;
    const mat = field(result, 'mat');
    const { lo, hi } = fixedRange ?? range(vf.values, mat);
    const table = lut(settings.colormap, settings.colorSteps);
    return {
      values: vf.values, mat, lo, hi,
      color(value, out, offset) {
        const n = Math.max(0, Math.min(255, Math.round(((value - lo) / (hi - lo || 1)) * 255)));
        out[offset] = table[n * 3] / 255;
        out[offset + 1] = table[n * 3 + 1] / 255;
        out[offset + 2] = table[n * 3 + 2] / 255;
      },
    };
  }

  /** The exposed faces of the simulated cells (neighbour void or outside), coloured per cell. */
  buildVoxelSurface(result, fieldKind, frame, settings, fixedRange, opacity = 1) {
    const c = this.colorizer(result, fieldKind, frame, settings, fixedRange);
    if (!c) return;
    const { nx, ny, nz, dx, dy, dz } = result.header.grid;
    const solid = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && c.mat[i + nx * (j + ny * k)] < 255;
    const positions = [];
    const colors = [];
    const normals = [];
    const rgb = [0, 0, 0];
    const faces = [
      [1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
      [-1, 0, 0, [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
      [0, 1, 0, [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
      [0, -1, 0, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
      [0, 0, 1, [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
      [0, 0, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
    ];
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!solid(i, j, k)) continue;
          const index = i + nx * (j + ny * k);
          c.color(c.values[index], rgb, 0);
          for (const [fx, fy, fz, corners] of faces) {
            if (solid(i + fx, j + fy, k + fz)) continue;
            const quad = corners.map(([a, b, e]) => [(i + a) * dx, (j + b) * dy, (k + e) * dz]);
            for (const n of [0, 1, 2, 0, 2, 3]) {
              positions.push(...quad[n]);
              colors.push(...rgb);
              normals.push(fx, fy, fz);
            }
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const see = opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {};
    this.group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...see })));
  }

  /** A plane through the 3D result (x, y or z at a cell index), coloured cell by cell (ParaView's Slice). */
  buildSlice(result, fieldKind, frame, settings, fixedRange, { axis, index }) {
    const c = this.colorizer(result, fieldKind, frame, settings, fixedRange);
    if (!c) return;
    const g = result.header.grid;
    const counts = { x: g.nx, y: g.ny, z: g.nz };
    const k = Math.max(0, Math.min(counts[axis] - 1, Math.round(index)));
    const plane = sliceField(g, c.values, axis, k, c.mat);
    const { width, height } = plane;
    const pixels = new Uint8Array(width * height * 4);
    const rgb = [0, 0, 0];
    for (let n = 0; n < width * height; n++) {
      const v = plane.values[n];
      if (!Number.isFinite(v)) continue;
      c.color(v, rgb, 0);
      pixels.set([rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, 255], n * 4);
    }
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const W = g.nx * g.dx; const H = g.ny * g.dy; const D = g.nz * g.dz;
    const at = (k + 0.5) * { x: g.dx, y: g.dy, z: g.dz }[axis];
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
    // slice(): 'z' → x across, y up; 'y' → x across, z up; 'x' → z across, y up.
    if (axis === 'z') { mesh.scale.set(W, H, 1); mesh.position.set(W / 2, H / 2, at); }
    if (axis === 'y') { mesh.scale.set(W, D, 1); mesh.rotation.x = Math.PI / 2; mesh.position.set(W / 2, at, D / 2); }
    if (axis === 'x') { mesh.scale.set(D, H, 1); mesh.rotation.y = -Math.PI / 2; mesh.position.set(at, H / 2, D / 2); }
    this.group.add(mesh);
  }

  /** The surface where the field equals value (ParaView's Contour), in the colour of that value. */
  buildIsosurface(result, fieldKind, frame, settings, fixedRange, value) {
    const c = this.colorizer(result, fieldKind, frame, settings, fixedRange);
    if (!c || !Number.isFinite(value)) return;
    const { positions, indices } = marchingCubes(result.header.grid, c.values, c.mat, value);
    if (!indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const rgb = [0, 0, 0];
    c.color(value, rgb, 0);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(rgb[0], rgb[1], rgb[2]), roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }));
    mesh.userData.testid = 'isosurface';
    this.group.add(mesh);
    this.isoTriangles = indices.length / 3;
  }

  /** 2D result as a surface: colour and height both show the value (void cells left out). */
  buildCarpet(result, fieldKind, frame, settings, fixedRange, height) {
    const c = this.colorizer(result, fieldKind, frame, settings, fixedRange);
    if (!c) return;
    const { nx, ny, dx, dy } = result.header.grid;
    const positions = new Float32Array(nx * ny * 3);
    const colors = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n = i + nx * j;
        const v = c.mat[n] < 255 ? c.values[n] : c.lo;
        positions[n * 3] = (i + 0.5) * dx;
        positions[n * 3 + 1] = (j + 0.5) * dy;
        positions[n * 3 + 2] = Math.max(0, Math.min(1, (v - c.lo) / (c.hi - c.lo || 1))) * height;
        c.color(v, colors, n * 3);
      }
    }
    const indices = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = i + nx * j; const b = a + 1; const e = a + nx; const f = e + 1;
        if (c.mat[a] >= 255 || c.mat[b] >= 255 || c.mat[e] >= 255 || c.mat[f] >= 255) continue;
        indices.push(a, b, f, a, f, e);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  toBlob() {
    this.render();
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }
}
