// The 2D viewport: draws the model (domain, bodies, boundaries, probes) and
// the results (field image, isotherms, vectors, deformed shape) on a canvas,
// and turns pointer input into edits through callbacks. 3D models are shown
// one z layer at a time here; the 3D view lives in view3d.js.
import { bodyBounds, bodyContains, cellSize, snap } from '../core/model.js';
import { field, viewField, range } from '../core/result.js';
import { lut, niceTicks, formatValue } from '../core/colormap.js';
import { LENGTH_UNITS } from '../core/settings.js';

const RULER = 26;
const HANDLE = 5;

const BC_COLORS = {
  temperature: '#ff5a5a', flux: '#ff9f40', convection: '#3ec1ff', radiation: '#ffd23f', adiabatic: '#9aa3ad',
  inlet: '#3fe08a', outlet: '#c77dff', open: '#7fd0ff', wall: '#888', slip: '#aaa', fixed: '#e0e0e0', rollerX: '#e0e0e0', rollerY: '#e0e0e0',
};

export function bcColor(type) {
  return BC_COLORS[type] ?? '#ccc';
}

/** A stable colour for a material without one. */
export function materialColor(material) {
  if (material?.color) return material.color;
  let hash = 0;
  for (const ch of String(material?.id ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 45%, 60%)`;
}

export class Editor2D {
  constructor(host, callbacks) {
    this.host = host;
    this.cb = callbacks;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view-canvas';
    this.canvas.dataset.testid = 'view2d';
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.scale = 5; // px per mm
    this.ox = 60; // screen x of model x = 0
    this.oy = 400; // screen y of model y = 0 (y grows upwards in the model)
    this.state = {};
    this.drag = null;
    this.polygon = null; // points while drawing a polygon
    this.lineStart = null;
    this.hover = null;
    this.fieldCache = { key: null, canvas: null };
    this.fitted = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.bind();
    this.resize();
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }

  /** state: { model, selection, tool, result, fieldKind, frame, layer, settings, theme, show… } */
  setState(state) {
    const modelChanged = state.model !== this.state.model;
    this.state = state;
    if (modelChanged && !this.fitted && state.model) {
      this.fit();
      this.fitted = true;
    }
    this.draw();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.fittedSize && this.width > 50 && this.state.model) {
      this.fittedSize = true;
      this.fit();
    }
    this.draw();
  }

  // ───── coordinates
  toScreen(x, y) {
    return [this.ox + x * this.scale, this.oy - y * this.scale];
  }

  toModel(sx, sy) {
    return [(sx - this.ox) / this.scale, (this.oy - sy) / this.scale];
  }

  fit() {
    const d = this.state.model?.domain;
    if (!d || this.width < 50) return;
    const left = RULER + 24;
    const right = 110; // room for the colour bar
    const top = 44;
    const bottom = RULER + 56;
    const sx = (this.width - left - right) / d.width;
    const sy = (this.height - top - bottom) / d.height;
    this.scale = Math.max(0.01, Math.min(sx, sy));
    this.ox = left + (this.width - left - right - d.width * this.scale) / 2;
    this.oy = top + (this.height - top - bottom + d.height * this.scale) / 2;
    this.draw();
  }

  /** Original scale (5 px per mm, shown as 100%) with the domain centred in the view. */
  resetView() {
    const d = this.state.model?.domain;
    if (!d || this.width < 50) return;
    this.scale = 5;
    this.ox = this.width / 2 - (d.width * this.scale) / 2;
    this.oy = this.height / 2 + (d.height * this.scale) / 2;
    this.draw();
    this.cb.onZoom?.(this.scale);
  }

  zoomAt(factor, sx = this.width / 2, sy = this.height / 2) {
    const [mx, my] = this.toModel(sx, sy);
    this.scale = Math.max(0.01, Math.min(20000, this.scale * factor));
    this.ox = sx - mx * this.scale;
    this.oy = sy + my * this.scale;
    this.draw();
    this.cb.onZoom?.(this.scale);
  }

  // ───── drawing
  draw() {
    if (!this.ctx) return;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  css(name) {
    return getComputedStyle(this.host).getPropertyValue(name).trim() || '#888';
  }

  paint() {
    const { ctx } = this;
    const { model } = this.state;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!model) return;
    const d = model.domain;
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(d.width, d.height);
    const showResult = this.state.result && this.state.showResult;

    // The drawing grid lies under everything, across the whole view.
    if (this.state.showGrid) this.paintDrawingGrid();
    // Domain area
    ctx.save();
    ctx.fillStyle = d.background ? this.withAlpha(materialColor(model.materials.find((m) => m.id === d.background)), 0.18) : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x0, y1, x1 - x0, y0 - y1);
    ctx.restore();

    if (showResult) this.paintField();
    else this.paintBodies(false);
    if (this.state.showMesh) this.paintMesh();
    if (showResult) {
      if (this.state.isotherms) this.paintIsotherms();
      if (this.state.vectors) this.paintVectors();
      if (this.state.streamlines) this.paintStreamlines();
      this.paintBodies(true);
    }
    // Domain outline
    ctx.strokeStyle = this.css('--muted');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x0 + 0.5, y1 + 0.5, x1 - x0, y0 - y1);
    ctx.setLineDash([]);
    this.paintBoundaries();
    this.paintProbes();
    this.paintSelection();
    this.paintDrafts();
    if (this.state.showRulers) this.paintRulers();
  }

  withAlpha(color, alpha) {
    if (color.startsWith('#') && color.length === 7) {
      const n = parseInt(color.slice(1), 16);
      return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
    return color;
  }

  layerZ() {
    const d = this.state.model.domain;
    if (d.dim !== 3) return null;
    const dz = d.depth / d.nz;
    return ((this.state.layer ?? d.nz - 1) + 0.5) * dz;
  }

  visibleBodies() {
    const { model } = this.state;
    const z = this.layerZ();
    return model.bodies.filter((b) => !b.hidden && (z == null || (z >= b.z0 && z <= b.z1)));
  }

  bodyPath(body) {
    const { ctx } = this;
    ctx.beginPath();
    if (body.shape === 'circle') {
      const [cx, cy] = this.toScreen(body.cx, body.cy);
      ctx.arc(cx, cy, body.r * this.scale, 0, Math.PI * 2);
    } else if (body.shape === 'polygon') {
      body.points.forEach(([x, y], i) => {
        const [sx, sy] = this.toScreen(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
    } else {
      const [sx, sy] = this.toScreen(body.x, body.y + body.h);
      ctx.rect(sx, sy, body.w * this.scale, body.h * this.scale);
    }
  }

  paintBodies(outlineOnly) {
    const { ctx } = this;
    const { model } = this.state;
    const materials = new Map(model.materials.map((m) => [m.id, m]));
    for (const body of this.visibleBodies()) {
      const color = materialColor(materials.get(body.material));
      this.bodyPath(body);
      if (!outlineOnly) {
        ctx.fillStyle = this.withAlpha(color, 0.82);
        ctx.fill();
      }
      ctx.strokeStyle = outlineOnly ? 'rgba(0,0,0,0.55)' : this.withAlpha('#000000', 0.45);
      ctx.lineWidth = outlineOnly ? 0.8 : 1;
      ctx.stroke();
      if (!outlineOnly && (body.power > 0 || body.powerProfile || body.current)) {
        // Heat sources carry a small flame mark.
        const b = bodyBounds(body);
        const [sx, sy] = this.toScreen(b.x1, b.y1);
        ctx.fillStyle = '#ff7043';
        ctx.font = '11px "Segoe UI Emoji", sans-serif';
        ctx.fillText('🔥', sx - 14, sy + 12);
      }
    }
    // On a result the names would cover the field and the probe values.
    if (this.state.showLabels && !outlineOnly) {
      ctx.font = `${Math.max(10, Math.min(13, this.state.fontSize ?? 12))}px ${this.state.fontFamily ?? 'Segoe UI'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const body of this.visibleBodies()) {
        const b = bodyBounds(body);
        const w = (b.x1 - b.x0) * this.scale;
        const hgt = (b.y1 - b.y0) * this.scale;
        const label = body.name || body.id;
        if (w < ctx.measureText(label).width + 6 || hgt < 14) continue;
        const [cx, cy] = this.toScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(label, cx, cy);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, cx, cy);
      }
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  /** Grid spacing in mm: minor lines about 14 px or more apart, a major line every fifth. */
  gridSteps() {
    // Nice steps in the display unit (mm, cm, m or in), returned in mm.
    const factor = LENGTH_UNITS[this.state.lengthUnit] ?? 1;
    const raw = 14 / this.scale / factor;
    const power = 10 ** Math.floor(Math.log10(raw));
    const minor = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw * 0.999) * factor;
    return { minor, major: minor * 5, factor };
  }

  themeColor(name, fallback) {
    const value = this.css(name);
    return value.startsWith('#') ? value : fallback;
  }

  /** The millimetre drawing grid across the whole view, with the x and y axes through the origin. */
  paintDrawingGrid() {
    const { ctx } = this;
    const { minor, major } = this.gridSteps();
    const [x0, y1] = this.toModel(0, 0);
    const [x1, y0] = this.toModel(this.width, this.height);
    const isMajor = (v) => Math.abs(Math.round(v / major) * major - v) < minor * 1e-6;
    for (const [majorPass, color, alpha] of [[false, this.themeColor('--grid-minor', '#34404c'), 0.6], [true, this.themeColor('--grid-major', '#56657a'), 0.8]]) {
      ctx.strokeStyle = this.withAlpha(color, alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / minor) * minor; x <= x1; x += minor) {
        if (isMajor(x) !== majorPass) continue;
        const sx = Math.round(this.toScreen(x, 0)[0]) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      for (let y = Math.ceil(y0 / minor) * minor; y <= y1; y += minor) {
        if (isMajor(y) !== majorPass) continue;
        const sy = Math.round(this.toScreen(0, y)[1]) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();
    }
    const [ox, oy] = this.toScreen(0, 0);
    ctx.strokeStyle = this.withAlpha(this.themeColor('--accent', '#3ec1ff'), 0.45);
    ctx.beginPath();
    ctx.moveTo(Math.round(ox) + 0.5, 0);
    ctx.lineTo(Math.round(ox) + 0.5, this.height);
    ctx.moveTo(0, Math.round(oy) + 0.5);
    ctx.lineTo(this.width, Math.round(oy) + 0.5);
    ctx.stroke();
  }

  /** The computational cells; when they are under 4 px, every k-th boundary so the mesh stays readable. */
  paintMesh() {
    const { ctx } = this;
    const d = this.state.model.domain;
    const { dx, dy } = cellSize(d);
    const kx = Math.max(1, Math.ceil(4 / (dx * this.scale)));
    const ky = Math.max(1, Math.ceil(4 / (dy * this.scale)));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i <= d.nx; i += kx) {
      const [sx, sy0] = this.toScreen(i * dx, 0);
      const [, sy1] = this.toScreen(i * dx, d.height);
      ctx.moveTo(Math.round(sx) + 0.5, sy0);
      ctx.lineTo(Math.round(sx) + 0.5, sy1);
    }
    for (let j = 0; j <= d.ny; j += ky) {
      const [sx0, sy] = this.toScreen(0, j * dy);
      const [sx1] = this.toScreen(d.width, j * dy);
      ctx.moveTo(sx0, Math.round(sy) + 0.5);
      ctx.lineTo(sx1, Math.round(sy) + 0.5);
    }
    ctx.stroke();
  }

  /** The shown field of the current layer as an offscreen canvas of nx × ny pixels. */
  fieldImage() {
    const { result, fieldKind, frame, settings } = this.state;
    const grid = result.header.grid;
    const layer = grid.dim === 3 ? Math.min(grid.nz - 1, this.state.layer ?? grid.nz - 1) : 0;
    const vf = viewField(result, fieldKind, frame);
    if (!vf) return null;
    const scaleRange = this.state.range;
    const key = `${result.id}:${fieldKind}:${frame}:${layer}:${settings.colormap}:${settings.colorSteps}:${scaleRange?.lo}:${scaleRange?.hi}`;
    if (this.fieldCache.key === key) return this.fieldCache;
    const mat = field(result, 'mat');
    const { lo, hi } = scaleRange ?? range(vf.values, mat);
    const table = lut(settings.colormap, settings.colorSteps);
    const canvas = this.fieldCache.canvas ?? document.createElement('canvas');
    canvas.width = grid.nx;
    canvas.height = grid.ny;
    const c = canvas.getContext('2d');
    const image = c.createImageData(grid.nx, grid.ny);
    const span = hi - lo || 1;
    const base = grid.nx * grid.ny * layer;
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        const index = base + i + grid.nx * j;
        const p = (i + grid.nx * (grid.ny - 1 - j)) * 4;
        if (mat[index] >= 255 || !Number.isFinite(vf.values[index])) {
          image.data[p + 3] = 0;
          continue;
        }
        const n = Math.max(0, Math.min(255, Math.round(((vf.values[index] - lo) / span) * 255)));
        image.data[p] = table[n * 3];
        image.data[p + 1] = table[n * 3 + 1];
        image.data[p + 2] = table[n * 3 + 2];
        image.data[p + 3] = 255;
      }
    }
    c.putImageData(image, 0, 0);
    this.fieldCache = { key, canvas, lo, hi, values: vf.values, layer, unit: vf.unit, scale: vf.scale ?? 1 };
    return this.fieldCache;
  }

  paintField() {
    const image = this.fieldImage();
    if (!image) {
      this.paintBodies(false);
      return;
    }
    const { ctx } = this;
    const d = this.state.model.domain;
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(d.width, d.height);
    if (this.state.deformed && this.state.result.header.fields.dispX) {
      this.paintDeformed(image);
      return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = this.state.settings.colorSteps === 0 && (x1 - x0) / d.nx > 3;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.canvas, x0, y1, x1 - x0, y0 - y1);
    ctx.restore();
  }

  /** Cells drawn at their displaced position, the displacement exaggerated so it is visible. */
  paintDeformed(image) {
    const { ctx } = this;
    const { result } = this.state;
    const grid = result.header.grid;
    const ux = field(result, 'dispX');
    const uy = field(result, 'dispY');
    const mat = field(result, 'mat');
    let max = 0;
    for (let i = 0; i < ux.length; i++) if (mat[i] < 255) max = Math.max(max, Math.hypot(ux[i], uy[i]));
    // Biggest displacement shown as 8 % of the domain's larger side (mm), unless the user set a factor.
    const span = Math.max(grid.nx * grid.dx, grid.ny * grid.dy);
    const factor = this.state.deformScale > 0 ? this.state.deformScale : max > 0 ? (0.08 * span) / (max * 1000) : 1;
    this.deformFactor = factor;
    const table = lut(this.state.settings.colormap, this.state.settings.colorSteps);
    const base = grid.nx * grid.ny * image.layer;
    const w = grid.dx * this.scale + 0.6;
    const hgt = grid.dy * this.scale + 0.6;
    for (let j = 0; j < grid.ny; j++) {
      for (let i = 0; i < grid.nx; i++) {
        const index = base + i + grid.nx * j;
        if (mat[index] >= 255) continue;
        const v = image.values[index];
        const n = Math.max(0, Math.min(255, Math.round(((v - image.lo) / (image.hi - image.lo || 1)) * 255)));
        ctx.fillStyle = `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]})`;
        const x = i * grid.dx + ux[index] * 1000 * factor;
        const y = (j + 1) * grid.dy + uy[index] * 1000 * factor;
        const [sx, sy] = this.toScreen(x, y);
        ctx.fillRect(sx, sy, w, hgt);
      }
    }
  }

  /** Marching squares over cell centres for evenly spaced levels. */
  paintIsotherms() {
    const image = this.fieldImage();
    if (!image) return;
    const { ctx } = this;
    const grid = this.state.result.header.grid;
    const mat = field(this.state.result, 'mat');
    const count = this.state.settings.isoCount ?? 12;
    const levels = niceTicks(image.lo, image.hi, count).filter((v) => v > image.lo && v < image.hi);
    const base = grid.nx * grid.ny * image.layer;
    const value = (i, j) => {
      const index = base + i + grid.nx * j;
      return mat[index] >= 255 ? NaN : image.values[index];
    };
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    const point = (i, j) => this.toScreen((i + 0.5) * grid.dx, (j + 0.5) * grid.dy);
    for (const level of levels) {
      for (let j = 0; j < grid.ny - 1; j++) {
        for (let i = 0; i < grid.nx - 1; i++) {
          const a = value(i, j); const b = value(i + 1, j); const c = value(i + 1, j + 1); const e = value(i, j + 1);
          if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(e))) continue;
          const crossings = [];
          const edge = (va, vb, ia, ja, ib, jb) => {
            if ((va < level) === (vb < level)) return;
            const t = (level - va) / (vb - va);
            crossings.push(point(ia + (ib - ia) * t, ja + (jb - ja) * t));
          };
          edge(a, b, i, j, i + 1, j);
          edge(b, c, i + 1, j, i + 1, j + 1);
          edge(c, e, i + 1, j + 1, i, j + 1);
          edge(e, a, i, j + 1, i, j);
          for (let n = 0; n + 1 < crossings.length; n += 2) {
            ctx.moveTo(crossings[n][0], crossings[n][1]);
            ctx.lineTo(crossings[n + 1][0], crossings[n + 1][1]);
          }
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Arrows of heat flux (or velocity when a flow field is shown) on a coarse sample grid. */
  paintVectors() {
    const { result, fieldKind } = this.state;
    const grid = result.header.grid;
    const useFlow = (fieldKind === 'velocity' || fieldKind === 'pressure') && result.header.fields.u;
    const fx = field(result, useFlow ? 'u' : 'qx');
    const fy = field(result, useFlow ? 'v' : 'qy');
    if (!fx || !fy) return;
    const mat = field(result, 'mat');
    const layer = grid.dim === 3 ? Math.min(grid.nz - 1, this.state.layer ?? grid.nz - 1) : 0;
    const base = grid.nx * grid.ny * layer;
    const spacingPx = 22;
    const step = Math.max(1, Math.round(spacingPx / (grid.dx * this.scale)));
    const stepY = Math.max(1, Math.round(spacingPx / (grid.dy * this.scale)));
    let max = 0;
    for (let n = base; n < base + grid.nx * grid.ny; n++) if (mat[n] < 255) max = Math.max(max, Math.hypot(fx[n], fy[n]));
    if (!(max > 0)) return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.1;
    for (let j = Math.floor(stepY / 2); j < grid.ny; j += stepY) {
      for (let i = Math.floor(step / 2); i < grid.nx; i += step) {
        const index = base + i + grid.nx * j;
        if (mat[index] >= 255) continue;
        const mag = Math.hypot(fx[index], fy[index]);
        if (mag < max * 0.02) continue;
        const len = spacingPx * 0.9 * Math.sqrt(mag / max);
        const [sx, sy] = this.toScreen((i + 0.5) * grid.dx, (j + 0.5) * grid.dy);
        const ax = (fx[index] / mag) * len;
        const ay = (-fy[index] / mag) * len;
        ctx.beginPath();
        ctx.moveTo(sx - ax / 2, sy - ay / 2);
        ctx.lineTo(sx + ax / 2, sy + ay / 2);
        ctx.stroke();
        const angle = Math.atan2(ay, ax);
        ctx.beginPath();
        ctx.moveTo(sx + ax / 2, sy + ay / 2);
        ctx.lineTo(sx + ax / 2 - 5 * Math.cos(angle - 0.45), sy + ay / 2 - 5 * Math.sin(angle - 0.45));
        ctx.lineTo(sx + ax / 2 - 5 * Math.cos(angle + 0.45), sy + ay / 2 - 5 * Math.sin(angle + 0.45));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Streamlines of the flow: seeds on an even grid of the fluid cells, traced both ways with RK2
   * through the bilinearly interpolated cell-centred velocity until they stall, leave the fluid or
   * get too long. An arrowhead in the middle of each line shows the direction.
   */
  paintStreamlines() {
    const { result } = this.state;
    const u = field(result, 'u');
    const v = field(result, 'v');
    if (!u || !v) return;
    const grid = result.header.grid;
    const mat = field(result, 'mat');
    const { nx, ny, dx, dy } = grid;
    let umax = 0;
    for (let n = 0; n < u.length; n++) umax = Math.max(umax, Math.hypot(u[n], v[n]));
    if (!(umax > 0)) return;
    const sample = (x, y) => {
      const fx = x / dx - 0.5;
      const fy = y / dy - 0.5;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      if (i < -1 || j < -1 || i >= nx || j >= ny) return null;
      const at = (a, b) => {
        const ii = Math.min(nx - 1, Math.max(0, a));
        const jj = Math.min(ny - 1, Math.max(0, b));
        const n = ii + nx * jj;
        return mat[n] >= 255 ? null : [u[n], v[n]];
      };
      const c00 = at(i, j); const c10 = at(i + 1, j); const c01 = at(i, j + 1); const c11 = at(i + 1, j + 1);
      if (!c00 || !c10 || !c01 || !c11) return at(Math.round(fx), Math.round(fy));
      const tx = fx - i;
      const ty = fy - j;
      const lerp = (k) => (c00[k] * (1 - tx) + c10[k] * tx) * (1 - ty) + (c01[k] * (1 - tx) + c11[k] * tx) * ty;
      return [lerp(0), lerp(1)];
    };
    const step = Math.min(dx, dy) * 0.6;
    const spacingPx = 42;
    const sx = Math.max(1, Math.round(spacingPx / (dx * this.scale)));
    const sy = Math.max(1, Math.round(spacingPx / (dy * this.scale)));
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    const trace = (x0, y0, dir) => {
      const pts = [[x0, y0]];
      let x = x0;
      let y = y0;
      for (let n = 0; n < 500; n++) {
        const a = sample(x, y);
        if (!a) break;
        const m1 = Math.hypot(a[0], a[1]);
        if (m1 < umax * 0.004) break;
        const mx = x + (dir * a[0] / m1) * step * 0.5;
        const my = y + (dir * a[1] / m1) * step * 0.5;
        const b = sample(mx, my);
        if (!b) break;
        const m2 = Math.hypot(b[0], b[1]) || 1;
        x += (dir * b[0] / m2) * step;
        y += (dir * b[1] / m2) * step;
        if (x < 0 || y < 0 || x > nx * dx || y > ny * dy) break;
        pts.push([x, y]);
      }
      return pts;
    };
    for (let j = Math.floor(sy / 2); j < ny; j += sy) {
      for (let i = Math.floor(sx / 2); i < nx; i += sx) {
        const n = i + nx * j;
        if (mat[n] >= 255 || Math.hypot(u[n], v[n]) < umax * 0.01) continue;
        const x0 = (i + 0.5) * dx;
        const y0 = (j + 0.5) * dy;
        const line = [...trace(x0, y0, -1).reverse(), ...trace(x0, y0, 1).slice(1)];
        if (line.length < 4) continue;
        ctx.beginPath();
        line.forEach(([x, y], k) => { const [px, py] = this.toScreen(x, y); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
        const mid = Math.floor(line.length / 2);
        const [ax, ay] = this.toScreen(...line[mid - 1]);
        const [bx, by] = this.toScreen(...line[mid]);
        const ang = Math.atan2(by - ay, bx - ax);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - 6 * Math.cos(ang - 0.45), by - 6 * Math.sin(ang - 0.45));
        ctx.lineTo(bx - 6 * Math.cos(ang + 0.45), by - 6 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  paintBoundaries() {
    const { ctx } = this;
    const { model, selection } = this.state;
    const d = model.domain;
    for (const bc of model.boundaries) {
      const selected = selection?.kind === 'boundary' && selection.ids.includes(bc.id);
      ctx.strokeStyle = bcColor(bc.type);
      ctx.lineWidth = selected ? 6 : 4;
      ctx.setLineDash(bc.type === 'adiabatic' ? [3, 3] : []);
      const lo = bc.range?.[0];
      const hi = bc.range?.[1];
      const seg = (xa, ya, xb, yb) => {
        const [sa, ta] = this.toScreen(xa, ya);
        const [sb, tb] = this.toScreen(xb, yb);
        ctx.beginPath();
        ctx.moveTo(sa, ta);
        ctx.lineTo(sb, tb);
        ctx.stroke();
      };
      const inset = 2 / this.scale;
      if (bc.target === 'left') seg(-inset, lo ?? 0, -inset, hi ?? d.height);
      else if (bc.target === 'right') seg(d.width + inset, lo ?? 0, d.width + inset, hi ?? d.height);
      else if (bc.target === 'bottom') seg(lo ?? 0, -inset, hi ?? d.width, -inset);
      else if (bc.target === 'top') seg(lo ?? 0, d.height + inset, hi ?? d.width, d.height + inset);
      else if (bc.target === 'exterior' || bc.target.startsWith('body:')) {
        // Outline the body (or every visible body for "exterior") in the condition's colour.
        const bodies = bc.target === 'exterior' ? (d.background ? [] : this.visibleBodies()) : this.visibleBodies().filter((b) => `body:${b.id}` === bc.target);
        ctx.save();
        if (bc.region) {
          // Only the part of the outline inside the condition's region.
          const [rx0, ry0] = this.toScreen(bc.region[0], bc.region[3]);
          const [rx1, ry1] = this.toScreen(bc.region[2], bc.region[1]);
          ctx.beginPath();
          ctx.rect(rx0, ry0, rx1 - rx0, ry1 - ry0);
          ctx.clip();
        }
        ctx.lineWidth = selected ? 3.5 : 2;
        ctx.setLineDash(bc.type === 'adiabatic' ? [3, 3] : [6, 3]);
        if (bc.target === 'exterior' && d.background) {
          const [x0, y0] = this.toScreen(0, 0);
          const [x1, y1] = this.toScreen(d.width, d.height);
          ctx.strokeRect(x0 - 3, y1 - 3, x1 - x0 + 6, y0 - y1 + 6);
        }
        for (const body of bodies) {
          this.bodyPath(body);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.setLineDash([]);
    }
  }

  paintProbes() {
    const { ctx } = this;
    const { model, selection, result, probeValues } = this.state;
    ctx.font = `11px ${this.state.fontFamily ?? 'Segoe UI'}`;
    for (const probe of model.probes) {
      const [sx, sy] = this.toScreen(probe.x, probe.y);
      const selected = selection?.kind === 'probe' && selection.ids.includes(probe.id);
      ctx.strokeStyle = selected ? this.css('--accent') : '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.moveTo(sx - 9, sy); ctx.lineTo(sx + 9, sy);
      ctx.moveTo(sx, sy - 9); ctx.lineTo(sx, sy + 9);
      ctx.stroke();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
      if (this.state.showLabels || result) {
        const value = probeValues?.[probe.id];
        const text = `${probe.name || probe.id}${value != null ? `  ${value}` : ''}`;
        const w = ctx.measureText(text).width + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx + 8, sy - 20, w, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, sx + 12, sy - 8);
      }
    }
  }

  paintSelection() {
    const { ctx } = this;
    const { model, selection } = this.state;
    if (selection?.kind !== 'body') return;
    ctx.strokeStyle = this.css('--accent');
    for (const body of model.bodies.filter((b) => selection.ids.includes(b.id) && !b.hidden)) {
      ctx.lineWidth = 2;
      this.bodyPath(body);
      ctx.stroke();
      if (selection.ids.length === 1) {
        for (const [hx, hy] of this.handles(body)) {
          ctx.fillStyle = this.css('--panel');
          ctx.fillRect(hx - HANDLE, hy - HANDLE, HANDLE * 2, HANDLE * 2);
          ctx.strokeRect(hx - HANDLE + 0.5, hy - HANDLE + 0.5, HANDLE * 2 - 1, HANDLE * 2 - 1);
        }
      }
    }
  }

  handles(body) {
    const b = bodyBounds(body);
    const xs = [b.x0, (b.x0 + b.x1) / 2, b.x1];
    const ys = [b.y0, (b.y0 + b.y1) / 2, b.y1];
    const out = [];
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) if (!(a === 1 && c === 1)) out.push([...this.toScreen(xs[a], ys[c]), a, c]);
    return out;
  }

  paintDrafts() {
    const { ctx } = this;
    ctx.strokeStyle = this.css('--accent');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    if (this.drag?.mode === 'draw-rect' || this.drag?.mode === 'draw-circle') {
      const { start, current } = this.drag;
      ctx.beginPath();
      if (this.drag.mode === 'draw-rect') {
        const [ax, ay] = this.toScreen(start[0], start[1]);
        const [bx, by] = this.toScreen(current[0], current[1]);
        ctx.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      } else {
        const [cx, cy] = this.toScreen(start[0], start[1]);
        ctx.arc(cx, cy, Math.hypot(current[0] - start[0], current[1] - start[1]) * this.scale, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    if (this.polygon?.length) {
      ctx.beginPath();
      this.polygon.forEach(([x, y], i) => {
        const [sx, sy] = this.toScreen(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (this.hover) {
        const [sx, sy] = this.toScreen(this.hover[0], this.hover[1]);
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    const line = this.state.lineCut;
    if (line?.a && (line.b || this.lineStart)) {
      const b = line.b ?? this.hover;
      if (b) {
        const [ax, ay] = this.toScreen(line.a.x, line.a.y);
        const [bx, by] = this.toScreen(b.x ?? b[0], b.y ?? b[1]);
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const [px, py, label] of [[ax, ay, 'A'], [bx, by, 'B']]) {
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(label, px + 6, py - 6);
        }
      }
    }
    ctx.setLineDash([]);
  }

  paintRulers() {
    const { ctx } = this;
    const d = this.state.model.domain;
    ctx.save();
    ctx.fillStyle = this.withAlpha(this.css('--panel').startsWith('#') ? this.css('--panel') : '#202830', 0.85);
    ctx.fillRect(0, this.height - RULER, this.width, RULER);
    ctx.fillRect(0, 0, RULER, this.height - RULER);
    ctx.strokeStyle = this.css('--line');
    ctx.beginPath();
    ctx.moveTo(RULER + 0.5, 0);
    ctx.lineTo(RULER + 0.5, this.height - RULER);
    ctx.lineTo(this.width, this.height - RULER + 0.5);
    ctx.stroke();
    ctx.font = '10px "Segoe UI", sans-serif';
    // Every grid step along the whole visible axis: minor ticks, longer major ticks with their
    // value (labels thinned to stay at least ~60 px apart), and the origin marked in the accent.
    const { minor, major, factor } = this.gridSteps();
    const labelEvery = major * Math.max(1, Math.ceil(60 / (major * this.scale)));
    const near = (v, step) => Math.abs(Math.round(v / step) * step - v) < minor * 1e-6;
    const tickColor = this.css('--muted');
    const textColor = this.css('--text');
    const accent = this.css('--accent');
    const [mx0] = this.toModel(RULER, 0);
    const [mx1] = this.toModel(this.width, 0);
    for (let v = Math.ceil(mx0 / minor) * minor; v <= mx1; v += minor) {
      const sx = Math.round(this.toScreen(v, 0)[0]) + 0.5;
      const big = near(v, major);
      const zero = Math.abs(v) < minor * 1e-6;
      ctx.strokeStyle = zero ? accent : tickColor;
      ctx.beginPath();
      ctx.moveTo(sx, this.height - RULER);
      ctx.lineTo(sx, this.height - RULER + (zero ? RULER : big ? 10 : 5));
      ctx.stroke();
      if (near(v, labelEvery)) {
        ctx.fillStyle = zero ? accent : textColor;
        ctx.fillText(formatValue(zero ? 0 : v / factor), sx + 2, this.height - 5);
      }
    }
    const [, my0] = this.toModel(0, this.height - RULER);
    const [, my1] = this.toModel(0, 0);
    for (let v = Math.ceil(my0 / minor) * minor; v <= my1; v += minor) {
      const sy = Math.round(this.toScreen(0, v)[1]) + 0.5;
      const big = near(v, major);
      const zero = Math.abs(v) < minor * 1e-6;
      ctx.strokeStyle = zero ? accent : tickColor;
      ctx.beginPath();
      ctx.moveTo(RULER, sy);
      ctx.lineTo(RULER - (zero ? RULER : big ? 10 : 5), sy);
      ctx.stroke();
      if (near(v, labelEvery)) {
        ctx.fillStyle = zero ? accent : textColor;
        ctx.save();
        ctx.translate(11, sy - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatValue(zero ? 0 : v / factor), 0, 0);
        ctx.restore();
      }
    }
    // The cursor's position on both rulers.
    if (this.hover) {
      const [hx, hy] = this.toScreen(this.hover[0], this.hover[1]);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hx, this.height - RULER); ctx.lineTo(hx - 4, this.height - RULER + 6); ctx.lineTo(hx + 4, this.height - RULER + 6);
      ctx.moveTo(RULER, hy); ctx.lineTo(RULER - 6, hy - 4); ctx.lineTo(RULER - 6, hy + 4);
      ctx.fill();
    }
    ctx.fillStyle = this.css('--panel').startsWith('#') ? this.css('--panel') : '#202830';
    ctx.fillRect(0, this.height - RULER, RULER, RULER);
    ctx.fillStyle = this.css('--muted');
    ctx.fillText(this.state.lengthUnit ?? 'mm', 4, this.height - 8);
    ctx.restore();
    // The domain extent marks on the rulers
    const [dx0] = this.toScreen(0, 0);
    const [dx1, dy1] = this.toScreen(d.width, d.height);
    ctx.fillStyle = this.css('--accent');
    ctx.fillRect(dx0, this.height - 3, dx1 - dx0, 2);
    ctx.fillRect(RULER - 3, dy1, 2, this.toScreen(0, 0)[1] - dy1);
  }

  // ───── picking
  pickBody(mx, my) {
    const bodies = this.visibleBodies();
    for (let i = bodies.length - 1; i >= 0; i--) if (bodyContains(bodies[i], mx, my)) return bodies[i];
    return null;
  }

  pickProbe(sx, sy) {
    for (const probe of this.state.model.probes) {
      const [px, py] = this.toScreen(probe.x, probe.y);
      if (Math.hypot(px - sx, py - sy) <= 8) return probe;
    }
    return null;
  }

  pickBoundary(sx, sy) {
    const d = this.state.model.domain;
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(d.width, d.height);
    const near = 6;
    const edges = [];
    if (Math.abs(sx - x0) < near && sy >= y1 && sy <= y0) edges.push('left');
    if (Math.abs(sx - x1) < near && sy >= y1 && sy <= y0) edges.push('right');
    if (Math.abs(sy - y0) < near && sx >= x0 && sx <= x1) edges.push('bottom');
    if (Math.abs(sy - y1) < near && sx >= x0 && sx <= x1) edges.push('top');
    if (!edges.length) return null;
    const list = this.state.model.boundaries.filter((bc) => edges.includes(bc.target));
    return list[list.length - 1] ?? { edge: edges[0] };
  }

  pickHandle(sx, sy) {
    const { selection, model } = this.state;
    if (selection?.kind !== 'body' || selection.ids.length !== 1) return null;
    const body = model.bodies.find((b) => b.id === selection.ids[0]);
    if (!body || body.hidden) return null;
    for (const [hx, hy, a, c] of this.handles(body)) if (Math.abs(hx - sx) <= HANDLE + 2 && Math.abs(hy - sy) <= HANDLE + 2) return { body, a, c };
    return null;
  }

  snapPoint(mx, my) {
    const step = this.state.settings?.snap ?? 0;
    return [snap(mx, step), snap(my, step)];
  }

  // ───── input
  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (event) => event.preventDefault());
    c.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = c.getBoundingClientRect();
      this.zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    c.addEventListener('pointerdown', (event) => this.onDown(event));
    c.addEventListener('pointermove', (event) => this.onMove(event));
    c.addEventListener('pointerup', (event) => this.onUp(event));
    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.cb.onCursor?.(null);
    });
    c.addEventListener('dblclick', () => this.finishPolygon());
  }

  local(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  onDown(event) {
    const [sx, sy] = this.local(event);
    const [mx, my] = this.toModel(sx, sy);
    this.canvas.focus();
    if (event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey)) {
      this.drag = { mode: 'pan', sx, sy, ox: this.ox, oy: this.oy, moved: false, button: event.button };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const tool = this.state.tool;
    const [px, py] = this.snapPoint(mx, my);
    if (tool === 'rect' || tool === 'circle') {
      this.drag = { mode: tool === 'rect' ? 'draw-rect' : 'draw-circle', start: [px, py], current: [px, py] };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'polygon') {
      if (this.polygon?.length >= 3) {
        const [fx, fy] = this.toScreen(...this.polygon[0]);
        if (Math.hypot(fx - sx, fy - sy) < 8) {
          this.finishPolygon();
          return;
        }
      }
      this.polygon = [...(this.polygon ?? []), [px, py]];
      this.draw();
      return;
    }
    if (tool === 'probe') {
      this.cb.onAddProbe?.(px, py);
      return;
    }
    if (tool === 'lineCut') {
      if (!this.lineStart) {
        this.lineStart = { x: mx, y: my };
        this.cb.onLineCut?.({ a: this.lineStart, b: null });
      } else {
        const a = this.lineStart;
        this.lineStart = null;
        this.cb.onLineCut?.({ a, b: { x: mx, y: my } });
      }
      return;
    }
    // Select tool
    const handle = this.pickHandle(sx, sy);
    if (handle) {
      this.drag = { mode: 'resize', handle, start: [mx, my], original: bodyBounds(handle.body), moved: false };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    const probe = this.pickProbe(sx, sy);
    if (probe) {
      this.cb.onSelect?.({ kind: 'probe', ids: [probe.id] }, event.shiftKey || event.ctrlKey);
      this.drag = { mode: 'move-probe', id: probe.id, start: [mx, my], last: [px, py], moved: false };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    const body = this.pickBody(mx, my);
    if (body) {
      const additive = event.shiftKey || event.ctrlKey;
      const already = this.state.selection?.kind === 'body' && this.state.selection.ids.includes(body.id);
      if (!already || additive) this.cb.onSelect?.({ kind: 'body', ids: [body.id] }, additive);
      this.drag = { mode: 'move', start: [mx, my], snapped: [px, py], moved: false };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    const boundary = this.pickBoundary(sx, sy);
    if (boundary?.id) {
      this.cb.onSelect?.({ kind: 'boundary', ids: [boundary.id] }, false);
      return;
    }
    this.cb.onSelect?.(null, false);
    this.drag = { mode: 'pan', sx, sy, ox: this.ox, oy: this.oy, moved: false, button: 0 };
    this.canvas.setPointerCapture(event.pointerId);
  }

  onMove(event) {
    const [sx, sy] = this.local(event);
    const [mx, my] = this.toModel(sx, sy);
    this.hover = this.snapPoint(mx, my);
    this.cb.onCursor?.({ x: mx, y: my, value: this.valueAt(mx, my) });
    const drag = this.drag;
    if (!drag) {
      // Drafts follow the pointer, and so do the cursor marks on the rulers.
      if (this.polygon || this.lineStart || this.state.showRulers) this.draw();
      this.updateCursor(sx, sy);
      return;
    }
    if (drag.mode === 'pan') {
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 2) drag.moved = true;
      this.ox = drag.ox + (sx - drag.sx);
      this.oy = drag.oy + (sy - drag.sy);
      this.draw();
    } else if (drag.mode === 'draw-rect' || drag.mode === 'draw-circle') {
      drag.current = this.snapPoint(mx, my);
      this.draw();
    } else if (drag.mode === 'move') {
      const [px, py] = this.snapPoint(mx, my);
      const dx = px - drag.snapped[0];
      const dy = py - drag.snapped[1];
      if (dx || dy) {
        drag.moved = true;
        drag.snapped = [px, py];
        this.cb.onMoveSelection?.(dx, dy, false);
      }
    } else if (drag.mode === 'move-probe') {
      const [px, py] = this.snapPoint(mx, my);
      if (px !== drag.last[0] || py !== drag.last[1]) {
        drag.moved = true;
        drag.last = [px, py];
        this.cb.onMoveProbe?.(drag.id, px, py, false);
      }
    } else if (drag.mode === 'resize') {
      const { handle, original } = drag;
      const [px, py] = this.snapPoint(mx, my);
      const b = { ...original };
      if (handle.a === 0) b.x0 = px;
      if (handle.a === 2) b.x1 = px;
      if (handle.c === 0) b.y0 = py;
      if (handle.c === 2) b.y1 = py;
      drag.moved = true;
      this.cb.onResizeBody?.(handle.body.id, b, false);
    }
  }

  onUp(event) {
    const drag = this.drag;
    this.drag = null;
    try { this.canvas.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
    if (!drag) return;
    if (drag.mode === 'pan' && !drag.moved && drag.button === 2) {
      this.cb.onContext?.(event.clientX, event.clientY);
    } else if (drag.mode === 'draw-rect') {
      const [ax, ay] = drag.start;
      const [bx, by] = drag.current;
      if (Math.abs(bx - ax) * this.scale > 3 && Math.abs(by - ay) * this.scale > 3) {
        this.cb.onAddBody?.({ shape: 'rect', x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
      }
    } else if (drag.mode === 'draw-circle') {
      const r = Math.hypot(drag.current[0] - drag.start[0], drag.current[1] - drag.start[1]);
      if (r * this.scale > 3) this.cb.onAddBody?.({ shape: 'circle', cx: drag.start[0], cy: drag.start[1], r });
    } else if (drag.mode === 'move' && drag.moved) {
      this.cb.onMoveSelection?.(0, 0, true);
    } else if (drag.mode === 'move-probe' && drag.moved) {
      this.cb.onMoveProbe?.(drag.id, drag.last[0], drag.last[1], true);
    } else if (drag.mode === 'resize' && drag.moved) {
      this.cb.onResizeBody?.(drag.handle.body.id, null, true);
    }
    this.draw();
  }

  updateCursor(sx, sy) {
    const tool = this.state.tool;
    let cursor = 'default';
    if (['rect', 'circle', 'polygon', 'probe', 'lineCut'].includes(tool)) cursor = 'crosshair';
    else {
      const handle = this.pickHandle(sx, sy);
      if (handle) cursor = handle.a === 1 ? 'ns-resize' : handle.c === 1 ? 'ew-resize' : (handle.a === handle.c ? 'nesw-resize' : 'nwse-resize');
      else if (this.pickProbe(sx, sy) || this.pickBody(...this.toModel(sx, sy))) cursor = 'move';
    }
    this.canvas.style.cursor = cursor;
  }

  finishPolygon() {
    if (this.polygon?.length >= 3) this.cb.onAddBody?.({ shape: 'polygon', points: this.polygon });
    this.polygon = null;
    this.draw();
  }

  cancelDraft() {
    this.polygon = null;
    this.lineStart = null;
    this.drag = null;
    this.draw();
  }

  /** The shown field's value at a model point (for the status bar), or null. */
  valueAt(mx, my) {
    if (!this.state.result || !this.state.showResult) return null;
    const image = this.fieldCache.key ? this.fieldCache : null;
    if (!image?.values) return null;
    const grid = this.state.result.header.grid;
    const i = Math.floor(mx / grid.dx);
    const j = Math.floor(my / grid.dy);
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return null;
    const index = i + grid.nx * (j + grid.ny * image.layer);
    const mat = field(this.state.result, 'mat');
    if (mat[index] >= 255) return null;
    return { value: image.values[index] * (image.scale ?? 1), unit: image.unit };
  }

  /** The canvas as a PNG Blob (export). */
  toBlob() {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
  }
}
