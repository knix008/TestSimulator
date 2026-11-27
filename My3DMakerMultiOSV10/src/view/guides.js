// View guides of the 3D graphics area: a ground grid (3D views) whose minor cell keeps 10–50 px on screen
// — spacing 1 mm × 5ⁿ, a major line every 5 cells, so a 5 × 5 pattern at any zoom — and rulers along the
// top and left edges. In a 2D view (orthographic, looking along an axis) the rulers read the model's
// coordinates and the mouse position; in 3D they read lengths at the orbit centre. Both mark the mouse
// position with red lines on the rulers.
import * as THREE from 'three';

export const RULER = 22;
const GRID_MIN_PX = 10;
const GRID_MAX_PX = 50;

/** Grid spacing (model units): base × 5ⁿ with a minor cell 10–50 px at `pxPerUnit`. */
export function gridStepFor(pxPerUnit, base = 1) {
  let step = base;
  for (let i = 0; i < 60 && step * pxPerUnit < GRID_MIN_PX; i++) step *= 5;
  for (let i = 0; i < 60 && step * pxPerUnit >= GRID_MAX_PX; i++) step /= 5;
  return step;
}

/** A "nice" spacing (1, 2 or 5 × 10ⁿ) at least `min` long. */
export function niceStep(min) {
  const power = 10 ** Math.floor(Math.log10(Math.max(min, 1e-12)));
  for (const f of [1, 2, 5, 10]) if (f * power >= min) return f * power;
  return 10 * power;
}

const AXIS_NAMES = ['X', 'Y', 'Z'];
const label = (v) => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? '0' : String(r); };

/**
 * The 2D frame of a camera, or null in 3D: orthographic and looking along a model axis. Returns the axes
 * (index, sign) shown to the right and upwards on the screen.
 */
export function viewFrame(camera, target) {
  if (!camera.isOrthographicCamera) return null;
  const dir = target.clone().sub(camera.position).normalize();
  const ax = [0, 1, 2].find((k) => Math.abs(dir.getComponent(k)) > 0.9995);
  if (ax === undefined) return null;
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const pick = (v) => { const k = [0, 1, 2].reduce((b, i) => (Math.abs(v.getComponent(i)) > Math.abs(v.getComponent(b)) ? i : b), 0); return { axis: k, sign: Math.sign(v.getComponent(k)) }; };
  return { normal: ax, right: pick(right), up: pick(up) };
}

/** Model length per screen pixel at the orbit centre. */
export function worldPerPx(camera, target, height) {
  if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / Math.max(1, height);
  const d = camera.position.distanceTo(target);
  return (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, height);
}

export class Guides {
  constructor(view) {
    this.view = view;
    this.group = new THREE.Group();
    this.group.name = 'guides';
    view.scene.add(this.group);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sv-rulers';
    view.host.append(this.canvas);
    this.coords = document.createElement('div');
    this.coords.className = 'sv-coords';
    this.coords.hidden = true;
    view.host.append(this.coords);
    this.showGrid = true;
    this.showRulers = true;
    this.colors = { minor: '#8b95a3', major: '#5d6775', ruler: '#eef1f5', rulerLine: '#c5ccd6', text: '#505a66', mark: '#e5484d' };
    this.cursor = null;
    this.gridKey = '';
    this.lines = null;
    this.info = null;
  }

  setColors(c) { this.colors = { ...this.colors, ...c }; this.gridKey = ''; }
  set(opts) { if ('grid' in opts) this.showGrid = opts.grid; if ('rulers' in opts) this.showRulers = opts.rulers; this.gridKey = ''; }

  /** Called on every render: the grid follows the zoom; the rulers are redrawn. */
  update() {
    const v = this.view;
    const h = v.host.clientHeight || 600;
    const w = v.host.clientWidth || 800;
    const target = v.controls.target;
    const wpp = worldPerPx(v.camera, target, h);
    const frame = viewFrame(v.camera, target);
    this.frame = frame;
    this.updateGrid(frame, wpp, w, h);
    this.drawRulers(frame, wpp, w, h);
    v.host.classList.toggle('with-rulers', this.showRulers);
  }

  updateGrid(frame, wpp, w, h) {
    const v = this.view;
    const on = this.showGrid && !frame;
    this.group.visible = on;
    if (!on) return;
    const step = gridStepFor(1 / wpp);
    const major = step * 5;
    const target = v.controls.target;
    const z = v.box ? v.box.min.z : 0;
    const reach = Math.max(wpp * Math.max(w, h) * 1.5, major * 3);
    const half = Math.ceil(reach / major) * major;
    const cx = Math.round(target.x / major) * major;
    const cy = Math.round(target.y / major) * major;
    const key = `${step}|${half}|${cx}|${cy}|${z}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (this.lines) { this.group.remove(this.lines); this.lines.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const minor = [];
    const majors = [];
    const n = Math.round(half / step);
    for (let i = -n; i <= n; i++) {
      const list = i % 5 === 0 ? majors : minor;
      const x = cx + i * step;
      const y = cy + i * step;
      list.push(x, cy - half, z, x, cy + half, z, cx - half, y, z, cx + half, y, z);
    }
    const make = (pts, color, opacity) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    };
    this.lines = new THREE.Group();
    this.lines.add(make(minor, this.colors.minor, 0.22), make(majors, this.colors.major, 0.5));
    this.lines.userData = { step, major, pxPerCell: step / wpp, minorLines: minor.length / 6, majorLines: majors.length / 6 };
    this.lines.renderOrder = -1;
    this.group.add(this.lines);
    this.info = this.lines.userData;
  }

  /** Screen position (px) of a model point. */
  toScreen(p, w, h) {
    const q = new THREE.Vector3(...p).project(this.view.camera);
    return [((q.x + 1) / 2) * w, ((1 - q.y) / 2) * h];
  }

  drawRulers(frame, wpp, w, h) {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.coords.hidden = !(this.showRulers && frame && this.cursor);
    if (!this.showRulers) return;
    const c = this.colors;
    const target = this.view.controls.target;
    // Screen position of a value along the horizontal / vertical ruler.
    let sx; let sy; let names;
    if (frame) {
      const at = (axis, val) => { const p = [target.x, target.y, target.z]; p[axis] = val; return this.toScreen(p, w, h); };
      const x0 = at(frame.right.axis, 0)[0]; const x1 = at(frame.right.axis, 1)[0];
      const y0 = at(frame.up.axis, 0)[1]; const y1 = at(frame.up.axis, 1)[1];
      sx = (val) => x0 + val * (x1 - x0);
      sy = (val) => y0 + val * (y1 - y0);
      this.toModel = (px, py) => [(px - x0) / (x1 - x0), (py - y0) / (y1 - y0)];
      names = [AXIS_NAMES[frame.right.axis], AXIS_NAMES[frame.up.axis]];
    } else {
      // 3D: lengths at the orbit centre, zero at its screen position.
      const [ox, oy] = this.toScreen([target.x, target.y, target.z], w, h);
      sx = (val) => ox + val / wpp;
      sy = (val) => oy - val / wpp;
      this.toModel = null;
      names = null;
    }
    const valAtX = (px) => (px - sx(0)) / (sx(1) - sx(0));
    const valAtY = (py) => (py - sy(0)) / (sy(1) - sy(0));
    const major = niceStep(70 * wpp);
    const minor = major / (String(major).replace(/^0\.0*/, '').startsWith('2') ? 4 : 5);
    ctx.fillStyle = c.ruler;
    ctx.fillRect(0, 0, w, RULER);
    ctx.fillRect(0, 0, RULER, h);
    ctx.strokeStyle = c.rulerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER + 0.5); ctx.lineTo(w, RULER + 0.5);
    ctx.moveTo(RULER + 0.5, 0); ctx.lineTo(RULER + 0.5, h);
    ctx.stroke();
    ctx.fillStyle = c.text;
    ctx.strokeStyle = c.text;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    const [xa, xb] = [valAtX(RULER), valAtX(w)].sort((a, b) => a - b);
    for (let v = Math.floor(xa / minor) * minor; v <= xb; v += minor) {
      const px = Math.round(sx(v)) + 0.5;
      if (px < RULER) continue;
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      ctx.moveTo(px, RULER); ctx.lineTo(px, RULER - (isMajor ? 12 : 5));
      if (isMajor) ctx.fillText(label(Math.round(v / major) * major), px + 3, 2);
    }
    const [ya, yb] = [valAtY(RULER), valAtY(h)].sort((a, b) => a - b);
    for (let v = Math.floor(ya / minor) * minor; v <= yb; v += minor) {
      const py = Math.round(sy(v)) + 0.5;
      if (py < RULER) continue;
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      ctx.moveTo(RULER, py); ctx.lineTo(RULER - (isMajor ? 12 : 5), py);
      if (isMajor) { ctx.save(); ctx.translate(2, py - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(label(Math.round(v / major) * major), 0, 0); ctx.restore(); }
    }
    ctx.stroke();
    // The mouse position: red marks on both rulers (2D and 3D); in 2D views also its coordinates.
    if (this.cursor) {
      const [px, py] = this.cursor;
      ctx.strokeStyle = c.mark;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, RULER);
      ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(RULER, Math.round(py) + 0.5);
      ctx.stroke();
      this.cursorMarks = [Math.round(px), Math.round(py)];
    }
    if (frame && this.cursor) {
      const [px, py] = this.cursor;
      const [mx, my] = this.toModel(px, py);
      const digits = Math.max(0, Math.min(4, -Math.floor(Math.log10(minor)) + 1));
      this.coords.textContent = `${names[0]} ${mx.toFixed(digits)}   ${names[1]} ${my.toFixed(digits)}  mm`;
      this.cursorModel = { [names[0]]: mx, [names[1]]: my };
    }
    // The unit in the corner.
    ctx.fillStyle = c.ruler;
    ctx.fillRect(0, 0, RULER, RULER);
    ctx.fillStyle = c.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.fillText('mm', RULER / 2, RULER / 2);
    ctx.textAlign = 'start';
    this.rulerInfo = { major, minor, wpp, frame: Boolean(frame) };
  }

  dispose() { this.canvas.remove(); this.coords.remove(); }
}
