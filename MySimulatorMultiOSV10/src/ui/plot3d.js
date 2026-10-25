// The 3D view: three columns of a result as a curve (a trajectory such as the
// Lorenz attractor) or as points (clusters, Monte Carlo samples), coloured along
// the row order or by a fourth column, inside a labelled box. Orbit with the
// left button, pan with the right, zoom with the wheel.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { lut, formatValue } from '../core/colormap.js';

export class Plot3D {
  constructor(host) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'view3d-host';
    this.el.dataset.testid = 'view3d';
    host.prepend(this.el);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.el.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(3.3, 2.4, 3.3);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => {
      this.updateGrid();
      this.render();
    });
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.gridGroup = new THREE.Group();
    this.scene.add(this.gridGroup);
    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(this.el);
    this.key = null;
    this.animate = () => {
      this.frame = requestAnimationFrame(this.animate);
      const moved = this.controls.update();
      // Physics playback.
      const a = this.anim;
      if (a?.playing) {
        const now = performance.now();
        let t = a.t + ((now - a.last) / 1000) * a.speed;
        a.last = now;
        const end = a.times[a.times.length - 1];
        if (t >= end) {
          t = end;
          a.playing = false;
          this.onSceneEnd?.();
        }
        this.seekScene(t);
      } else if (moved) this.render();
    };
    this.animate();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.clear();
    this.renderer.dispose();
    this.el.remove();
  }

  layout() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  clear(group = this.group) {
    if (group === this.group) this.clear(this.gridGroup);
    for (const child of [...group.children]) {
      group.remove(child);
      child.geometry?.dispose();
      if (child.material) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
  }

  fit() {
    this.camera.position.set(3.3, 2.4, 3.3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.updateGrid();
    this.render();
  }

  zoomBy(f) {
    this.camera.position.sub(this.controls.target).multiplyScalar(1 / f).add(this.controls.target);
    this.updateGrid();
    this.render();
  }

  zoomPercent() {
    return Math.round((5.3 / this.camera.position.distanceTo(this.controls.target)) * 100);
  }

  /** data: { x, y, z, names: [x, y, z], color: values | null, mode: 'line' | 'points', equal (same scale on all axes), colormap, text } */
  /** Grid and axes on or off: { grid, axes }. */
  setOptions(options) {
    const changed = JSON.stringify(options) !== JSON.stringify(this.options);
    this.options = options;
    if (changed && this.lastData) this.setData(this.lastData, null);
  }

  setData(data, key = null) {
    this.lastData = data;
    this.anim = null;
    this.sceneKey = null;
    if (key && key === this.key) {
      this.render();
      return;
    }
    this.key = key;
    this.clear();
    const css = getComputedStyle(this.el);
    const textColor = css.getPropertyValue('--text').trim() || '#ddd';
    const lineColor = css.getPropertyValue('--muted').trim() || '#888';
    if (!data) {
      this.space = null;
      this.render();
      return;
    }
    const n = Math.min(data.x.length, data.y.length, data.z.length);
    const range = (v) => {
      let lo = Infinity; let hi = -Infinity;
      for (let i = 0; i < n; i++) if (Number.isFinite(v[i])) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); }
      if (!Number.isFinite(lo)) return [0, 1];
      return hi > lo ? [lo, hi] : [lo - 0.5, hi + 0.5];
    };
    let rx = range(data.x); let ry = range(data.y); let rz = range(data.z);
    if (data.equal) {
      // True proportions: one cube for all three axes, as long as the largest span.
      const half = Math.max(rx[1] - rx[0], ry[1] - ry[0], rz[1] - rz[0]) / 2;
      const around = (r) => [(r[0] + r[1]) / 2 - half, (r[0] + r[1]) / 2 + half];
      rx = around(rx); ry = around(ry); rz = around(rz);
    }
    // Normalised into a cube −1 … 1; three's y is up, so the data z goes up.
    const nx = (v) => ((v - rx[0]) / (rx[1] - rx[0])) * 2 - 1;
    const ny = (v) => ((v - ry[0]) / (ry[1] - ry[0])) * 2 - 1;
    const nz = (v) => ((v - rz[0]) / (rz[1] - rz[0])) * 2 - 1;
    const step = Math.max(1, Math.floor(n / 200000));
    const pos = [];
    const col = [];
    const table = lut(data.colormap ?? 'turbo', 0);
    const cvals = data.color;
    const cr = cvals ? range(cvals) : null;
    // Lines are drawn as segments between neighbouring points, so a missing value (NaN) breaks the line.
    const points = data.mode === 'points';
    let last = null;
    for (let i = 0; i < n; i += step) {
      const x = data.x[i]; const y = data.y[i]; const z = data.z[i];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { last = null; continue; }
      const t = cvals ? (cvals[i] - cr[0]) / (cr[1] - cr[0]) : i / Math.max(1, n - 1);
      const k = Math.max(0, Math.min(255, Math.round((Number.isFinite(t) ? t : 0) * 255)));
      const p = [nx(x), nz(z), -ny(y)];
      const c = [table[k * 3] / 255, table[k * 3 + 1] / 255, table[k * 3 + 2] / 255];
      if (points) {
        pos.push(...p);
        col.push(...c);
      } else {
        if (last) {
          pos.push(...last.p, ...p);
          col.push(...last.c, ...c);
        }
        last = { p, c };
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const obj = points
      ? new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.025, vertexColors: true }))
      : new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.group.add(obj);
    // The box and the axes.
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.45 }));
    this.group.add(box);
    const label = (text, x, y, z, size = 0.075, color = textColor) => {
      const sprite = textSprite(text, color, size);
      sprite.position.set(x, y, z);
      this.group.add(sprite);
    };
    const [an, bn, cn] = data.names ?? ['x', 'y', 'z'];
    const options = this.options ?? { grid: true, axes: true };
    if (options.axes) {
      // Axes from the (min, min, min) corner: x red, y green, z blue, with arrows and names.
      const origin = new THREE.Vector3(-1, -1, 1);
      const axis = (dir, color, name, at) => {
        this.group.add(new THREE.ArrowHelper(dir, origin, 2.3, color, 0.09, 0.05));
        label(name, at[0], at[1], at[2], 0.1, `#${new THREE.Color(color).getHexString()}`);
      };
      axis(new THREE.Vector3(1, 0, 0), 0xe5534b, an, [1.42, -1, 1]);
      axis(new THREE.Vector3(0, 0, -1), 0x57ab5a, bn, [-1, -1, -1.42]);
      axis(new THREE.Vector3(0, 1, 0), 0x539bf5, cn, [-1, 1.42, 1]);
    } else {
      label(an, 0, -1.22, 1.15, 0.1);
      label(bn, 1.25, -1.22, 0, 0.1);
      label(cn, -1.28, 0, 1.12, 0.1);
    }
    // The floor grid and the tick values follow the zoom (rebuilt in updateGrid).
    this.space = { rx, ry, rz, nx, ny, nz, textColor, lineColor, options };
    this.gridKey = null;
    this.updateGrid();
    this.layout();
  }

  /**
   * The grid on the floor (the plane of the first two axes) and the tick values. Major lines sit at
   * round data values about a fifth of the visible width apart, each cell split 5 × 5 by minor lines;
   * zooming in or out picks a finer or coarser step, so the spacing on screen stays even.
   */
  updateGrid() {
    const f = this.space;
    if (!f) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const view = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const major = view / 5; // in the normalised cube (−1 … 1)
    const span = (r) => (r[1] - r[0]) / 2; // data units per normalised unit
    const sx = niceStep(major * span(f.rx));
    const sy = niceStep(major * span(f.ry));
    const sz = niceStep(major * span(f.rz));
    // The grid covers the box and the view around the target (pan moves it along).
    const tgt = this.controls.target;
    const half = Math.min(8, Math.max(1.2, view * 0.9));
    const win = [Math.max(-8, Math.min(-1, tgt.x - half)), Math.min(8, Math.max(1, tgt.x + half)), Math.max(-8, Math.min(-1, -tgt.z - half)), Math.min(8, Math.max(1, -tgt.z + half))];
    const key = [sx, sy, sz, ...win.map((v) => Math.round(v * 4))].join('|');
    if (key === this.gridKey) return;
    this.gridKey = key;
    this.clear(this.gridGroup);
    const { rx, ry, rz, nx, ny, nz, textColor, lineColor, options } = f;
    // Data values of normalised positions.
    const dx = (u) => rx[0] + ((u + 1) / 2) * (rx[1] - rx[0]);
    const dy = (u) => ry[0] + ((u + 1) / 2) * (ry[1] - ry[0]);
    const values = (lo, hi, step) => {
      const out = [];
      const k0 = Math.ceil(lo / step - 1e-9);
      const k1 = Math.floor(hi / step + 1e-9);
      if (k1 - k0 > 4000) return out;
      for (let k = k0; k <= k1; k++) out.push(k * step);
      return out;
    };
    if (options.grid) {
      const x0 = win[0]; const x1 = win[1]; const y0 = win[2]; const y1 = win[3];
      for (const [div, alpha] of [[5, 0.13], [1, 0.36]]) {
        const lines = [];
        const isMajor = div === 1;
        for (const v of values(dx(x0), dx(x1), sx / div)) {
          if (!isMajor && Math.abs(v / sx - Math.round(v / sx)) < 1e-6) continue;
          lines.push(nx(v), -1, -y0, nx(v), -1, -y1);
        }
        for (const v of values(dy(y0), dy(y1), sy / div)) {
          if (!isMajor && Math.abs(v / sy - Math.round(v / sy)) < 1e-6) continue;
          lines.push(x0, -1, -ny(v), x1, -1, -ny(v));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        this.gridGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: alpha, depthWrite: false })));
      }
    }
    if (options.axes) {
      // Tick values and marks along the box edges, at the grid's major step.
      const size = Math.min(0.075, Math.max(0.02, view * 0.018));
      const marks = [];
      const inBox = (v, r) => v >= r[0] - 1e-9 && v <= r[1] + 1e-9;
      const tick = (step, r, place) => {
        const list = values(r[0], r[1], step).filter((v) => inBox(v, r));
        if (list.length > 60) return;
        for (const v of list) place(v);
      };
      const off = size * 1.4;
      tick(sx, rx, (v) => { label(this, formatValue(v, 4), nx(v), -1 - off, 1 + off, size, textColor); marks.push(nx(v), -1, 1, nx(v), -1 - off * 0.5, 1 + off * 0.5); });
      tick(sy, ry, (v) => { label(this, formatValue(v, 4), 1 + off * 1.3, -1 - off, -ny(v), size, textColor); marks.push(1, -1, -ny(v), 1 + off * 0.5, -1 - off * 0.5, -ny(v)); });
      tick(sz, rz, (v) => { label(this, formatValue(v, 4), -1 - off * 1.3, nz(v), 1 + off, size, textColor); marks.push(-1, nz(v), 1, -1 - off * 0.5, nz(v), 1 + off * 0.5); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
      this.gridGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: textColor, transparent: true, opacity: 0.7 })));
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * A physics scene: the bodies' shapes moved by `frames` (t, <body>.x/.y/.z/.qw/.qx/.qy/.qz), with
   * the ground, each body's trail and the joints. The engine's z is up; three's y is up, so a
   * point (x, y, z) is drawn at (x, z, −y) and a rotation (w, x, y, z) as (w, x, z, −y).
   */
  setScene(scene, frames, key) {
    if (key && key === this.sceneKey) {
      this.render();
      return;
    }
    this.sceneKey = key;
    this.key = null;
    this.lastData = null;
    this.space = null;
    this.clear();
    if (!this.lights) {
      this.lights = [new THREE.HemisphereLight(0xffffff, 0x404050, 1.6), new THREE.DirectionalLight(0xffffff, 1.4)];
      this.lights[1].position.set(4, 8, 6);
      for (const l of this.lights) this.scene.add(l);
    }
    const css = getComputedStyle(this.el);
    const lineColor = css.getPropertyValue('--muted').trim() || '#888';
    const col = (name) => frames.columns.find((c) => c.name === name)?.values ?? null;
    const times = frames.columns[frames.x ?? 0].values;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const bodies = [];
    for (const b of scene.bodies) {
      const p = ['x', 'y', 'z', 'qw', 'qx', 'qy', 'qz'].map((k) => col(`${b.name}.${k}`));
      if (p.some((c) => !c)) continue;
      let geo;
      if (b.shape === 'sphere') geo = new THREE.SphereGeometry(b.size[0], 28, 18);
      else if (b.shape === 'box') geo = new THREE.BoxGeometry(b.size[0], b.size[2], b.size[1]);
      else geo = new THREE.CapsuleGeometry(b.size[0], b.size[1], 8, 20);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.55, metalness: 0.08, transparent: b.static, opacity: b.static ? 0.55 : 1 }));
      this.group.add(mesh);
      if (b.shape === 'box') {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
        mesh.add(edges);
      }
      const r = b.shape === 'box' ? Math.hypot(...b.size) / 2 : b.shape === 'capsule' ? b.size[0] + b.size[1] / 2 : b.size[0];
      for (let k = 0; k < times.length; k++) {
        for (const [i, c] of [[0, p[0]], [1, p[1]], [2, p[2]]]) {
          lo[i] = Math.min(lo[i], c[k] - r);
          hi[i] = Math.max(hi[i], c[k] + r);
        }
      }
      // The path the body's centre takes (moving bodies).
      if (!b.static) {
        const pts = [];
        const stride = Math.max(1, Math.floor(times.length / 2000));
        for (let k = 0; k < times.length; k += stride) pts.push(p[0][k], p[2][k], -p[1][k]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0.45 })));
      }
      bodies.push({ mesh, p, name: b.name });
    }
    // Joints as lines between their anchors.
    const joints = [];
    for (const j of scene.joints ?? []) {
      const a = bodies.find((x) => x.name === j.a);
      if (!a) continue;
      const b = j.b ? bodies.find((x) => x.name === j.b) : null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: lineColor }));
      this.group.add(line);
      joints.push({ line, a, b, la: new THREE.Vector3(j.la[0], j.la[2], -j.la[1]), lb: new THREE.Vector3(j.lb[0], j.lb[2], -j.lb[1]) });
    }
    // The ground and a grid on it.
    const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.5);
    const cx = (lo[0] + hi[0]) / 2;
    const cy = (lo[1] + hi[1]) / 2;
    if (scene.ground != null) {
      lo[2] = Math.min(lo[2], scene.ground);
      const span = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * 1.6 + 1;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshStandardMaterial({ color: 0x8b949e, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, scene.ground, -cy);
      this.group.add(plane);
      if (this.options?.grid !== false) {
        const step = niceStep(span / 10);
        const grid = new THREE.GridHelper(Math.ceil(span / step) * step, Math.ceil(span / step) * 5, lineColor, lineColor);
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
        grid.position.set(cx, scene.ground + 1e-4, -cy);
        this.group.add(grid);
      }
    }
    // Camera on the whole motion.
    const center = new THREE.Vector3(cx, (lo[2] + hi[2]) / 2, -cy);
    this.controls.target.copy(center);
    this.camera.near = size / 1000;
    this.camera.far = size * 200;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(center.clone().add(new THREE.Vector3(1.1, 0.75, 1.3).multiplyScalar(size * 0.8)));
    this.controls.update();
    this.anim = { times, bodies, joints, playing: false, t: 0, speed: this.anim?.speed ?? 1, last: performance.now() };
    this.seekScene(0);
    this.layout();
  }

  /** Shows the scene at time t (interpolated between frames). */
  seekScene(t) {
    const a = this.anim;
    if (!a) return;
    const n = a.times.length;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (a.times[mid] <= t) lo = mid;
      else hi = mid;
    }
    const f = a.times[hi] > a.times[lo] ? Math.min(1, Math.max(0, (t - a.times[lo]) / (a.times[hi] - a.times[lo]))) : 0;
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    for (const b of a.bodies) {
      const at = (c, k) => b.p[c][k];
      const x = at(0, lo) + (at(0, hi) - at(0, lo)) * f;
      const y = at(1, lo) + (at(1, hi) - at(1, lo)) * f;
      const z = at(2, lo) + (at(2, hi) - at(2, lo)) * f;
      b.mesh.position.set(x, z, -y);
      qa.set(at(4, lo), at(6, lo), -at(5, lo), at(3, lo));
      qb.set(at(4, hi), at(6, hi), -at(5, hi), at(3, hi));
      b.mesh.quaternion.copy(qa.slerp(qb, f));
    }
    for (const j of a.joints) {
      const pa = j.la.clone().applyQuaternion(j.a.mesh.quaternion).add(j.a.mesh.position);
      const pb = j.b ? j.lb.clone().applyQuaternion(j.b.mesh.quaternion).add(j.b.mesh.position) : j.lb;
      const pos = j.line.geometry.attributes.position;
      pos.setXYZ(0, pa.x, pa.y, pa.z);
      pos.setXYZ(1, pb.x, pb.y, pb.z);
      pos.needsUpdate = true;
    }
    a.t = t;
    this.render();
    this.onSceneTime?.(t);
  }

  /** Starts or stops the playback (from the start when it had reached the end). */
  playScene(on) {
    const a = this.anim;
    if (!a) return;
    if (on && a.t >= a.times[a.times.length - 1]) this.seekScene(0);
    a.playing = on;
    a.last = performance.now();
  }

  toBlob() {
    this.render();
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }
}

/** A round step (1, 2 or 5 × 10^k) near `raw`. */
function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function label(plot, text, x, y, z, size, color) {
  const sprite = textSprite(text, color, size);
  sprite.position.set(x, y, z);
  plot.gridGroup.add(sprite);
}

function textSprite(text, color, size) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 44px "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.width = w;
  canvas.height = 60;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 30);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((size * w) / 60, size, 1);
  return sprite;
}
