const PALETTE = ["#fb923c", "#38bdf8", "#4ade80", "#f472b6", "#facc15", "#c084fc", "#2dd4bf", "#f87171"];

function niceStep(range, targetTicks) {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  return niceNumber(range / Math.max(2, targetTicks));
}

function niceNumber(value) {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = value / 10 ** exp;
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return nice * 10 ** exp;
}

function formatTick(value) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) < 1e-12) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e5 || abs < 1e-3) {
    return value.toExponential(0).replace("e+", "e");
  }
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return String(parseFloat(value.toFixed(digits)));
}

function themeVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function windowGradient(ctx, angle, width, height) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const cx = width / 2;
  const cy = height / 2;
  const half = Math.abs((width / 2) * dx) + Math.abs((height / 2) * dy);
  return ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
}

function fillWindowBackdrop(ctx, width, height) {
  ctx.fillStyle = themeVar("--card", "#1c1917");
  ctx.fillRect(0, 0, width, height);
  const sheen = windowGradient(ctx, 148, width, height);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  sheen.addColorStop(0.36, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
  const shade = windowGradient(ctx, 328, width, height);
  shade.addColorStop(0, "rgba(0, 0, 0, 0.16)");
  shade.addColorStop(0.42, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

const FLOOR_CELLS = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

class GraphBoard {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = engine;
    this.dimension = "2d";
    this.views = {
      "2d": { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      "3d": { xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 },
    };
    this.view = this.views["2d"];
    this.fns2d = [];
    this.fns3d = [];
    this.meshKey = "";
    this.meshes = [];
    this.zScale = 1;
    this.zAuto = false;
    this.scene = null;
    this.legendHits = [];
    this.legendBox = null;
    this.legendPos = null;
    this.selectedId = null;
    this.fastPaint = false;
    this.showGrid = true;
    this.showAxisValues = true;
    this.showLegend = true;
    this.axes = {
      x: { color: "#fb923c", visible: true },
      y: { color: "#4ade80", visible: true },
      z: { color: "#7dd3fc", visible: true },
    };
    this.camera = { yaw: -0.75, pitch: -1.05, zoom: 1.35 };
    this.light = { on: true, azimuth: -0.95, elevation: 0.9 };
    this.floorZ = null;
    this.lightHit = null;
    this.hover = null;
    this.drag = null;
    this.nextId = 1;
    this.exportTransparent = false;
    this.paintBackdrop = false;
    this.onChange = null;
    this.onView = null;
    this.onDimension = null;

    canvas.addEventListener("pointerdown", (ev) => this.onPointerDown(ev));
    canvas.addEventListener("pointermove", (ev) => this.onPointerMove(ev));
    canvas.addEventListener("pointerup", (ev) => this.onPointerUp(ev));
    canvas.addEventListener("pointerleave", (ev) => this.onPointerUp(ev));
    canvas.addEventListener("wheel", (ev) => this.onWheel(ev), { passive: false });
    window.addEventListener("resize", () => this.resize());
    if (typeof ResizeObserver === "function") {
      this.sizeWatcher = new ResizeObserver(() => this.resize());
      this.sizeWatcher.observe(canvas);
    }
  }

  get functions() {
    return this.dimension === "3d" ? this.fns3d : this.fns2d;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw();
  }

  addFunction(expression) {
    const expr = expression.trim();
    if (!expr) throw new Error(uiText("식을 입력하세요", "Enter an expression"));
    if (this.functions.length >= PALETTE.length) throw new Error(uiText("함수는 최대 8개까지 추가할 수 있습니다", "You can add at most 8 functions"));
    const ast = this.engine.parse(expr);
    const scope = this.dimension === "3d" ? { x: 1, y: 1 } : { x: 1 };
    try {
      this.engine.evalAst(ast, scope);
    } catch (err) {
      const quiet = err.message === "정의되지 않음" || err.message === "0으로 나눌 수 없습니다" || err.message === "범위 오류";
      if (!quiet) throw err;
    }
    const fn = {
      id: this.nextId++,
      expr,
      ast,
      color: PALETTE[this.functions.length % PALETTE.length],
      visible: true,
      legend: true,
      legendText: "",
    };
    this.functions.push(fn);
    this.draw();
    this.onChange?.();
    return fn;
  }

  removeFunction(id) {
    const list = this.functions;
    const index = list.findIndex((fn) => fn.id === id);
    if (index >= 0) list.splice(index, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.meshKey = "";
    this.draw();
    this.onChange?.();
  }

  toggleFunction(id) {
    const fn = this.functions.find((item) => item.id === id);
    if (!fn) return;
    fn.visible = !fn.visible;
    this.meshKey = "";
    this.draw();
    this.onChange?.();
  }

  setDimension(dim) {
    if (dim !== "2d" && dim !== "3d") return;
    if (this.dimension === dim) return;
    this.dimension = dim;
    this.view = this.views[dim];
    this.hover = null;
    this.hoverLabel = "";
    this.drag = null;
    this.canvas.classList.remove("dragging");
    this.canvas.classList.toggle("is-3d", dim === "3d");
    this.meshKey = "";
    this.draw();
    this.onChange?.();
    this.onView?.();
    this.onDimension?.();
  }

  setView(view) {
    const next = { ...this.view, ...view };
    if (!(next.xMax > next.xMin) || !(next.yMax > next.yMin)) {
      throw new Error(uiText("범위가 올바르지 않습니다", "The range is not valid"));
    }
    if (("zMin" in view) || ("zMax" in view)) {
      if (!(next.zMax > next.zMin)) throw new Error(uiText("범위가 올바르지 않습니다", "The range is not valid"));
      this.zAuto = false;
    }
    Object.assign(this.view, next);
    this.meshKey = "";
    this.draw();
    this.onView?.();
  }

  resetView() {
    this.zAuto = false;
    if (this.dimension === "3d") {
      Object.assign(this.view, { xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      this.camera = { yaw: -0.75, pitch: -1.05, zoom: 1.35 };
      this.meshKey = "";
    } else {
      Object.assign(this.view, { xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
    }
    this.draw();
    this.onView?.();
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.draw();
  }

  toggleAxisValues() {
    this.showAxisValues = !this.showAxisValues;
    this.draw();
  }

  setAxisColor(axis, color) {
    if (!this.axes[axis] || !color) return;
    this.axes[axis].color = color;
    this.draw();
  }

  toggleAxis(axis) {
    if (!this.axes[axis]) return;
    this.axes[axis].visible = !this.axes[axis].visible;
    this.draw();
  }

  setFunctionColor(id, color) {
    const fn = [...this.fns2d, ...this.fns3d].find((item) => item.id === id);
    if (!fn || !color) return;
    fn.color = color;
    this.meshKey = "";
    this.draw();
  }

  toggleLegend() {
    this.showLegend = !this.showLegend;
    this.draw();
  }

  setLegendText(id, text) {
    const fn = [...this.fns2d, ...this.fns3d].find((item) => item.id === id);
    if (!fn) return;
    fn.legendText = String(text || "").slice(0, 80);
    this.draw();
  }

  setLegendShown(id, shown) {
    const fn = [...this.fns2d, ...this.fns3d].find((item) => item.id === id);
    if (!fn) return;
    fn.legend = !!shown;
    this.draw();
  }

  zoom(factor) {
    if (this.dimension === "3d") {
      this.zoom3d(factor);
      return;
    }
    const { xMin, xMax, yMin, yMax } = this.view;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    this.zoomAt(cx, cy, factor);
  }

  zoom3d(factor, fast) {
    const next = clamp(this.camera.zoom / factor, 0.4, 6);
    if (Math.abs(next - this.camera.zoom) < 1e-6) return;
    this.camera.zoom = next;
    if (fast) {
      this.fastPaint = true;
      this.scheduleDraw();
      clearTimeout(this.fullPaintTimer);
      this.fullPaintTimer = setTimeout(() => {
        this.fastPaint = false;
        if (this.drag?.mode !== "rotate") this.draw();
      }, 140);
    } else {
      this.fastPaint = false;
      this.draw();
    }
    this.onView?.();
  }

  lightVector() {
    const cosE = Math.cos(this.light.elevation);
    return {
      x: cosE * Math.cos(this.light.azimuth),
      y: cosE * Math.sin(this.light.azimuth),
      z: Math.sin(this.light.elevation),
    };
  }

  lightReach() {
    return 1.45;
  }

  lightPoint() {
    const unit = this.lightVector();
    const reach = this.lightReach();
    const origin = this.axisAnchor();
    return {
      x: origin.x + unit.x * reach,
      y: origin.y + unit.y * reach,
      z: origin.z + unit.z * reach,
    };
  }

  lightFromScreen(px, py) {
    const proj = this.beginProjection();
    const origin = this.axisAnchor();
    const reach = this.lightReach();
    // The origin sits at this depth, so the sphere is centred there.
    const centre = this.rotateLocal(origin);
    const u = (px - proj.ox) / proj.focal;
    const v = -(py - proj.oy) / proj.focal;
    const eyeY = 3.2;
    // Ray: cam = (u * d, eyeY - d, v * d). Solve |cam - centre| = reach for d.
    const dx = -centre.x;
    const dy = eyeY - centre.y;
    const dz = -centre.z;
    const a = u * u + 1 + v * v;
    const b = 2 * (u * dx - dy + v * dz);
    const c = dx * dx + dy * dy + dz * dz - reach * reach;
    const disc = b * b - 4 * a * c;
    const depth = disc > 0 ? (-b - Math.sqrt(disc)) / (2 * a) : -b / (2 * a);
    if (!(depth > 0.2)) return null;
    const cam = { x: u * depth, y: eyeY - depth, z: v * depth };
    const local = this.unrotateLocal(cam);
    const vx = local.x - origin.x;
    const vy = local.y - origin.y;
    const vz = local.z - origin.z;
    const length = Math.hypot(vx, vy, vz) || 1;
    return {
      azimuth: Math.atan2(vy, vx),
      elevation: Math.asin(clamp(vz / length, -1, 1)),
    };
  }

  rotateLocal(p) {
    const proj = this.proj || this.beginProjection();
    const x1 = p.x * proj.cy - p.y * proj.sy;
    const y1 = p.x * proj.sy + p.y * proj.cy;
    return {
      x: x1,
      y: y1 * proj.cp - p.z * proj.sp,
      z: y1 * proj.sp + p.z * proj.cp,
    };
  }

  unrotateLocal(cam) {
    const proj = this.proj || this.beginProjection();
    const y1 = cam.y * proj.cp + cam.z * proj.sp;
    const z = -cam.y * proj.sp + cam.z * proj.cp;
    return {
      x: cam.x * proj.cy + y1 * proj.sy,
      y: -cam.x * proj.sy + y1 * proj.cy,
      z,
    };
  }

  toggleLight() {
    this.light.on = !this.light.on;
    this.draw();
    this.onChange?.();
  }

  setLight(light) {
    if (!light) return;
    if (typeof light.on === "boolean") this.light.on = light.on;
    if (Number.isFinite(light.azimuth)) this.light.azimuth = light.azimuth;
    if (Number.isFinite(light.elevation)) this.light.elevation = clamp(light.elevation, -1.35, 1.45);
    this.draw();
  }

  lightAt(px, py) {
    if (this.dimension !== "3d" || !this.light.on || !this.lightHit) return false;
    const reach = 20 * (window.devicePixelRatio || 1);
    return Math.hypot(this.lightHit.sx - px, this.lightHit.sy - py) <= reach;
  }

  toggleAxes() {
    const show = !(this.axes.x.visible || this.axes.y.visible || this.axes.z.visible);
    this.axes.x.visible = show;
    this.axes.y.visible = show;
    this.axes.z.visible = show;
    this.draw();
  }

  zoomAt(x, y, factor) {
    if (this.dimension === "3d") {
      this.zoom(factor);
      return;
    }
    const { xMin, xMax, yMin, yMax } = this.view;
    Object.assign(this.view, {
      xMin: x - (x - xMin) * factor,
      xMax: x + (xMax - x) * factor,
      yMin: y - (y - yMin) * factor,
      yMax: y + (yMax - y) * factor,
    });
    this.draw();
    this.onView?.();
  }

  redraw() {
    for (const fn of this.functions) {
      fn.ast = this.engine.parse(fn.expr);
    }
    this.draw();
  }

  pxToX(px) {
    const { xMin, xMax } = this.view;
    return xMin + (px / this.canvas.width) * (xMax - xMin);
  }

  pxToY(py) {
    const { yMin, yMax } = this.view;
    return yMax - (py / this.canvas.height) * (yMax - yMin);
  }

  xToPx(x) {
    const { xMin, xMax } = this.view;
    return ((x - xMin) / (xMax - xMin)) * this.canvas.width;
  }

  yToPx(y) {
    const { yMin, yMax } = this.view;
    return ((yMax - y) / (yMax - yMin)) * this.canvas.height;
  }

  eventPoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * this.canvas.width;
    const py = ((ev.clientY - rect.top) / rect.height) * this.canvas.height;
    return { px, py, x: this.pxToX(px), y: this.pxToY(py) };
  }

  onPointerDown(ev) {
    try {
      this.canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* Pointer capture is unavailable for some synthetic events. */
    }
    const p = this.eventPoint(ev);
    if (this.legendContains(p.px, p.py)) {
      if (ev.detail >= 2) {
        this.drag = null;
        this.canvas.classList.remove("dragging");
        return;
      }
      this.drag = { mode: "legend", px: p.px, py: p.py, x: this.legendBox.x, y: this.legendBox.y, moved: false };
      return;
    }
    if (this.lightAt(p.px, p.py)) {
      this.drag = {
        mode: "light",
        px: p.px,
        py: p.py,
        azimuth: this.light.azimuth,
        elevation: this.light.elevation,
      };
      this.canvas.classList.add("dragging");
      return;
    }
    if (this.dimension === "3d") {
      this.drag = { mode: "rotate", px: p.px, py: p.py, yaw: this.camera.yaw, pitch: this.camera.pitch };
      this.canvas.classList.add("dragging");
      return;
    }
    this.drag = { mode: "pan", px: p.px, py: p.py, view: { ...this.view } };
  }

  onPointerMove(ev) {
    const p = this.eventPoint(ev);
    if (this.drag?.mode === "legend") {
      const dx = p.px - this.drag.px;
      const dy = p.py - this.drag.py;
      const rect = this.canvas.getBoundingClientRect();
      const dist = Math.hypot(dx * rect.width / Math.max(1, this.canvas.width), dy * rect.height / Math.max(1, this.canvas.height));
      if (!this.drag.moved && dist < 6) return;
      this.drag.moved = true;
      this.canvas.classList.add("dragging");
      const box = this.legendBox;
      const width = Math.max(1, this.canvas.width);
      const height = Math.max(1, this.canvas.height);
      const maxX = Math.max(0, width - (box?.w || 0));
      const maxY = Math.max(0, height - (box?.h || 0));
      const x = clamp(this.drag.x + dx, 0, maxX);
      const y = clamp(this.drag.y + dy, 0, maxY);
      this.legendPos = { x: x / width, y: y / height };
      this.scheduleDraw();
      return;
    }
    if (this.drag?.mode === "light") {
      const aimed = this.lightFromScreen(p.px, p.py);
      if (!aimed) return;
      this.light.azimuth = aimed.azimuth;
      this.light.elevation = clamp(aimed.elevation, -1.45, 1.45);
      const azimuthDeg = Math.round((this.light.azimuth * 180) / Math.PI);
      const elevationDeg = Math.round((this.light.elevation * 180) / Math.PI);
      this.hoverLabel = uiText(`광원 ${azimuthDeg}° / ${elevationDeg}°`, `Light ${azimuthDeg}° / ${elevationDeg}°`);
      this.scheduleDraw();
      return;
    }
    if (this.drag?.mode === "rotate") {
      const dx = p.px - this.drag.px;
      const dy = p.py - this.drag.py;
      this.camera.yaw = this.drag.yaw + dx * 0.012;
      this.camera.pitch = clamp(this.drag.pitch + dy * 0.012, -1.2, 1.2);
      const yawDeg = Math.round((this.camera.yaw * 180) / Math.PI);
      const pitchDeg = Math.round((this.camera.pitch * 180) / Math.PI);
      this.hoverLabel = uiText(`좌우 ${yawDeg}°   상하 ${pitchDeg}°`, `Yaw ${yawDeg}°   Pitch ${pitchDeg}°`);
      this.scheduleDraw();
      return;
    }
    if (this.drag?.mode === "pan") {
      const dx = ((p.px - this.drag.px) / this.canvas.width) * (this.drag.view.xMax - this.drag.view.xMin);
      const dy = ((p.py - this.drag.py) / this.canvas.height) * (this.drag.view.yMax - this.drag.view.yMin);
      Object.assign(this.view, {
        xMin: this.drag.view.xMin - dx,
        xMax: this.drag.view.xMax - dx,
        yMin: this.drag.view.yMin + dy,
        yMax: this.drag.view.yMax + dy,
      });
    }
    if (this.dimension === "2d") this.hover = p;
    this.draw();
  }

  onPointerUp(ev) {
    if (ev.type === "pointerleave") {
      if (this.drag) return;
      this.hover = null;
      this.hoverLabel = "";
      this.draw();
      return;
    }
    if (this.drag && this.canvas.hasPointerCapture?.(ev.pointerId)) {
      this.canvas.releasePointerCapture(ev.pointerId);
    }
    if (this.drawFrame) {
      cancelAnimationFrame(this.drawFrame);
      this.drawFrame = 0;
    }
    const wasDrag = this.drag;
    this.drag = null;
    this.canvas.classList.remove("dragging");
    if (wasDrag?.mode === "pan") this.onView?.();
    if (wasDrag?.mode === "light") this.onChange?.();
    this.draw();
  }

  onWheel(ev) {
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 1.2 : 0.8333;
    if (this.dimension === "3d") {
      this.zoom3d(factor, true);
      return;
    }
    const p = this.eventPoint(ev);
    this.zoomAt(p.x, p.y, factor);
    this.hover = p;
  }

  evalScope(ast, scope) {
    const previous = this.engine.angleMode;
    this.engine.angleMode = "rad";
    try {
      const y = this.engine.evalAst(ast, scope);
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    } finally {
      this.engine.angleMode = previous;
    }
  }

  sample(ast, x) {
    return this.evalScope(ast, { x });
  }

  scheduleDraw() {
    if (this.drawFrame) return;
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = 0;
      this.draw();
    });
  }

  squareView() {
    if (this.dimension !== "2d") return false;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const view = this.view;
    const spanX = view.xMax - view.xMin;
    const spanY = view.yMax - view.yMin;
    if (!(width > 0) || !(height > 0) || !(spanX > 0) || !(spanY > 0)) return false;
    const scaleX = width / spanX;
    const scaleY = height / spanY;
    const scale = Math.min(scaleX, scaleY);
    let widened = false;
    if (scaleX > scale * 1.000001) {
      const middle = (view.xMin + view.xMax) / 2;
      const half = width / scale / 2;
      view.xMin = middle - half;
      view.xMax = middle + half;
      widened = true;
    }
    if (scaleY > scale * 1.000001) {
      const middle = (view.yMin + view.yMax) / 2;
      const half = height / scale / 2;
      view.yMin = middle - half;
      view.yMax = middle + half;
      widened = true;
    }
    return widened;
  }

  draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    if (!width || !height) return;
    if (this.squareView()) this.onView?.();
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, width, height);
    if (this.paintBackdrop && !this.exportTransparent) fillWindowBackdrop(ctx, width, height);

    if (this.dimension === "3d") this.draw3d(ctx, dpr);
    else {
      if (this.showGrid) this.drawGrid(ctx, dpr);
      this.drawAxes(ctx, dpr);
      for (const fn of this.functions) {
        if (fn.visible) this.drawFunction(ctx, fn, dpr);
      }
      this.drawAxisValues2d(ctx, dpr);
      this.drawHover(ctx, dpr);
    }
    this.drawLegend(ctx, dpr);
    this.onDraw?.();
  }

  legendAt(px, py) {
    return this.legendHits.find((hit) => px >= hit.x && px <= hit.x + hit.w && py >= hit.y && py <= hit.y + hit.h) || null;
  }

  legendContains(px, py) {
    const box = this.legendBox;
    if (!this.showLegend || !box) return false;
    return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
  }

  exportInk() {
    return this.exportTransparent ? "#1c1917" : themeVar("--ink", "#fafaf9");
  }

  exportEdge() {
    return this.exportTransparent ? "#57534e" : themeVar("--muted", "#a8a29e");
  }

  drawLegend(ctx, dpr) {
    this.legendHits = [];
    this.legendBox = null;
    if (!this.showLegend) return;
    const prefix = this.dimension === "3d" ? "z = " : "y = ";
    const items = this.functions.filter((fn) => fn.legend !== false);
    if (!items.length) return;
    const fontSize = Math.max(11, Math.round(12 * dpr));
    const swatch = Math.round(10 * dpr);
    const pad = Math.round(8 * dpr);
    const gap = Math.round(6 * dpr);
    const rowH = Math.round(18 * dpr);
    ctx.save();
    ctx.font = `${fontSize}px Consolas, "Malgun Gothic", sans-serif`;
    const labels = items.map((fn) => (fn.legendText && fn.legendText.trim()) || prefix + fn.expr);
    const textCap = Math.min(this.canvas.width * 0.42, Math.max(...labels.map((text) => ctx.measureText(text).width)));
    const boxW = pad * 2 + swatch + gap + textCap;
    const boxH = pad * 2 + items.length * rowH;
    const margin = Math.round(12 * dpr);
    let x = this.legendPos ? this.legendPos.x * this.canvas.width : this.canvas.width - boxW - margin;
    let y = this.legendPos ? this.legendPos.y * this.canvas.height : margin;
    x = clamp(x, 0, Math.max(0, this.canvas.width - boxW));
    y = clamp(y, 0, Math.max(0, this.canvas.height - boxH));
    this.legendBox = { x, y, w: boxW, h: boxH };
    if (!this.exportTransparent) {
      ctx.fillStyle = themeVar("--chip", "#292524");
      ctx.globalAlpha = 0.92;
    }
    const radius = Math.round(8 * dpr);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, boxW, boxH, radius);
    else ctx.rect(x, y, boxW, boxH);
    if (!this.exportTransparent) ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.exportEdge();
    ctx.lineWidth = dpr;
    ctx.stroke();
    ctx.textBaseline = "middle";
    items.forEach((fn, index) => {
      const rowTop = y + pad + index * rowH;
      const rowY = rowTop + rowH / 2;
      this.legendHits.push({ id: fn.id, x, y: rowTop, w: boxW, h: rowH });
      if (fn.id === this.selectedId) {
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, boxW, boxH, radius);
        else ctx.rect(x, y, boxW, boxH);
        ctx.clip();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = themeVar("--accent", "#ea580c");
        ctx.fillRect(x, rowTop, boxW, rowH);
        ctx.restore();
      }
      ctx.globalAlpha = fn.visible ? 1 : 0.45;
      ctx.fillStyle = fn.color;
      ctx.fillRect(x + pad, rowY - swatch / 2, swatch, swatch);
      ctx.fillStyle = this.exportInk();
      ctx.fillText(this.clipLegend(ctx, labels[index], textCap), x + pad + swatch + gap, rowY);
    });
    ctx.restore();
  }

  clipLegend(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let end = text.length;
    while (end > 1 && ctx.measureText(text.slice(0, end) + "…").width > maxWidth) end -= 1;
    return text.slice(0, Math.max(1, end)) + "…";
  }

  drawGrid(ctx, dpr) {
    const { xMin, xMax, yMin, yMax } = this.view;
    const step = this.gridStep2d();
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ink = themeVar("--muted", "#a8a29e");
    const rule = (values, vertical) => {
      for (const value of values) {
        const at = Math.round(vertical ? this.xToPx(value) : this.yToPx(value)) + 0.5;
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(at, 0);
          ctx.lineTo(at, height);
        } else {
          ctx.moveTo(0, at);
          ctx.lineTo(width, at);
        }
        ctx.stroke();
      }
    };
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = dpr;
    // Five fine cells sit between neighbouring labelled lines.
    const fine = step / 5;
    if (fine * (width / Math.max(1e-9, xMax - xMin)) > 6) {
      ctx.globalAlpha = 0.09;
      rule(this.multiples(xMin, xMax, fine), true);
      rule(this.multiples(yMin, yMax, fine), false);
    }
    ctx.globalAlpha = 0.26;
    rule(this.multiples(xMin, xMax, step), true);
    rule(this.multiples(yMin, yMax, step), false);
    ctx.restore();
  }

  drawAxes(ctx, dpr) {
    ctx.save();
    ctx.lineWidth = 1.6 * dpr;
    const y0 = this.yToPx(0);
    const x0 = this.xToPx(0);
    if (this.axes.x.visible && y0 >= 0 && y0 <= this.canvas.height) {
      ctx.strokeStyle = this.axes.x.color;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(this.canvas.width, y0);
      ctx.stroke();
    }
    if (this.axes.y.visible && x0 >= 0 && x0 <= this.canvas.width) {
      ctx.strokeStyle = this.axes.y.color;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, this.canvas.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  haloText(ctx, text, x, y, color) {
    ctx.fillStyle = color || this.exportInk();
    if (!this.exportTransparent) {
      ctx.strokeStyle = themeVar("--card", "#1c1917");
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
  }

  drawAxisValues2d(ctx, dpr) {
    const { xMin, xMax, yMin, yMax } = this.view;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const step = this.gridStep2d();
    const xTicks = this.multiples(xMin, xMax, step);
    const yTicks = this.multiples(yMin, yMax, step);
    const xAxis = clamp(this.yToPx(0), 16 * dpr, height - 16 * dpr);
    const yAxis = clamp(this.xToPx(0), 16 * dpr, width - 16 * dpr);
    const below = xAxis < height * 0.72;
    const toLeft = yAxis > width * 0.22;
    ctx.save();
    ctx.lineWidth = 1.4 * dpr;
    ctx.font = `600 ${12 * dpr}px Consolas, "Malgun Gothic", sans-serif`;
    ctx.lineJoin = "round";
    if (this.axes.x.visible) {
      ctx.strokeStyle = this.axes.x.color;
      for (const value of xTicks) {
        const px = this.xToPx(value);
        if (px < 10 * dpr || px > width - 10 * dpr) continue;
        ctx.beginPath();
        ctx.moveTo(px, xAxis - 4 * dpr);
        ctx.lineTo(px, xAxis + 4 * dpr);
        ctx.stroke();
      }
    }
    if (this.axes.y.visible) {
      ctx.strokeStyle = this.axes.y.color;
      for (const value of yTicks) {
        const py = this.yToPx(value);
        if (py < 10 * dpr || py > height - 10 * dpr) continue;
        ctx.beginPath();
        ctx.moveTo(yAxis - 4 * dpr, py);
        ctx.lineTo(yAxis + 4 * dpr, py);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 4 * dpr;
    if (this.axes.x.visible) {
      ctx.textAlign = "center";
      ctx.textBaseline = below ? "top" : "bottom";
      const labelY = below ? xAxis + 7 * dpr : xAxis - 7 * dpr;
      for (const value of xTicks) {
        const px = this.xToPx(value);
        if (px < 18 * dpr || px > width - 18 * dpr) continue;
        this.haloText(ctx, formatTick(value), px, labelY, this.axes.x.color);
      }
    }
    if (this.axes.y.visible) {
      ctx.textAlign = toLeft ? "right" : "left";
      ctx.textBaseline = "middle";
      const labelX = toLeft ? yAxis - 8 * dpr : yAxis + 8 * dpr;
      for (const value of yTicks) {
        if (Math.abs(value) < 1e-9) continue;
        const py = this.yToPx(value);
        if (py < 12 * dpr || py > height - 12 * dpr) continue;
        this.haloText(ctx, formatTick(value), labelX, py, this.axes.y.color);
      }
    }
    ctx.restore();
  }

  strokeSmooth(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }

  drawFunction(ctx, fn, dpr) {
    const jump = (this.view.yMax - this.view.yMin) * 1.5;
    const segments = [];
    let current = [];
    let prevY = NaN;
    for (let i = 0; i <= this.canvas.width; i += 1) {
      const y = this.sample(fn.ast, this.pxToX(i));
      const broken = !Number.isFinite(y) || (current.length && Math.abs(y - prevY) > jump);
      if (broken) {
        if (current.length > 1) segments.push(current);
        current = [];
        prevY = y;
        continue;
      }
      current.push({ x: i, y: this.yToPx(y) });
      prevY = y;
    }
    if (current.length > 1) segments.push(current);
    ctx.save();
    ctx.lineWidth = 2.4 * dpr;
    ctx.strokeStyle = fn.color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const points of segments) this.strokeSmooth(ctx, points);
    ctx.restore();
  }

  drawHover(ctx, dpr) {
    if (!this.hover || this.drag) return;
    const { px, py, x, y } = this.hover;
    ctx.save();
    ctx.strokeStyle = "rgba(251, 146, 60, 0.45)";
    ctx.lineWidth = dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, this.canvas.height);
    ctx.moveTo(0, py);
    ctx.lineTo(this.canvas.width, py);
    ctx.stroke();
    ctx.restore();
    this.hoverLabel = `x = ${formatTick(x)}   y = ${formatTick(y)}`;
  }

  fitFocal(w, h) {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const rx = Math.abs(this.worldToFloorX(xMax) - this.worldToFloorX(xMin)) / 2;
    const ry = Math.abs(this.worldToFloorY(yMax) - this.worldToFloorY(yMin)) / 2;
    let radius = Math.hypot(rx, ry) || 1;
    let half = Math.max(Math.abs(this.zToLocal(zMin)), Math.abs(this.zToLocal(zMax)), 0.2);
    if (this.light.on) {
      const beam = this.lightPoint();
      radius = Math.max(radius, Math.hypot(beam.x, beam.y));
      half = Math.max(half, Math.abs(beam.z));
    }
    const pitchSin = Math.abs(Math.sin(this.camera.pitch));
    const pitchCos = Math.abs(Math.cos(this.camera.pitch));
    const across = 2 * radius;
    const down = 2 * (radius * pitchSin + half * pitchCos);
    const fit = Math.min((w * 0.98) / across, (h * 0.98) / down);
    // 3.2 is the eye distance; the rest leaves room for the perspective spread.
    return fit * 3.2 * 0.9;
  }

  beginProjection() {
    const { yaw, pitch, zoom } = this.camera;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.proj = {
      yaw,
      pitch,
      zoom,
      w,
      h,
      cy: Math.cos(yaw),
      sy: Math.sin(yaw),
      cp: Math.cos(pitch),
      sp: Math.sin(pitch),
      focal: this.fitFocal(w, h) * (zoom / 1.35),
      ox: w / 2,
      oy: h / 2,
    };
    return this.proj;
  }

  projectLocal(p) {
    const camera = this.camera;
    let proj = this.proj;
    if (!proj || proj.yaw !== camera.yaw || proj.pitch !== camera.pitch || proj.zoom !== camera.zoom || proj.w !== this.canvas.width || proj.h !== this.canvas.height) {
      proj = this.beginProjection();
    }
    const x1 = p.x * proj.cy - p.y * proj.sy;
    const y1 = p.x * proj.sy + p.y * proj.cy;
    const cam = {
      x: x1,
      y: y1 * proj.cp - p.z * proj.sp,
      z: y1 * proj.sp + p.z * proj.cp,
    };
    const depth = 3.2 - cam.y;
    if (depth < 0.2) return null;
    const scale = proj.focal / depth;
    return {
      sx: proj.ox + cam.x * scale,
      sy: proj.oy - cam.z * scale,
      depth,
      cam,
    };
  }

  buildMeshes() {
    const { xMin, xMax, yMin, yMax } = this.view;
    const visible = this.functions.filter((fn) => fn.visible);
    const zPart = this.zAuto ? "auto" : `${this.view.zMin}|${this.view.zMax}`;
    const key = [xMin, xMax, yMin, yMax, zPart, visible.map((fn) => `${fn.id}:${fn.expr}`).join(",")].join("|");
    if (key === this.meshKey && this.meshes) return;
    this.meshKey = key;
    const n = 73;
    const grids = visible.map(() => new Float64Array(n * n));
    const magnitudes = [];
    for (let j = 0; j < n; j++) {
      const y = yMin + (j / (n - 1)) * (yMax - yMin);
      for (let i = 0; i < n; i++) {
        const x = xMin + (i / (n - 1)) * (xMax - xMin);
        visible.forEach((fn, index) => {
          const z = this.evalScope(fn.ast, { x, y });
          grids[index][j * n + i] = z;
          if (Number.isFinite(z)) magnitudes.push(Math.abs(z));
        });
      }
    }
    magnitudes.sort((a, b) => a - b);
    const robust = magnitudes.length ? magnitudes[Math.floor(magnitudes.length * 0.95)] : 1;
    if (this.zAuto || !(this.view.zMax > this.view.zMin)) {
      this.zScale = Math.max(robust, 1e-6);
      this.view.zMin = -this.zScale;
      this.view.zMax = this.zScale;
    } else {
      this.zScale = Math.max((this.view.zMax - this.view.zMin) / 2, 1e-6);
    }
    this.meshes = visible.map((fn, index) => ({ color: fn.color, n, z: grids[index] }));
    let tallest = 0;
    for (const grid of grids) {
      for (const value of grid) {
        if (Number.isFinite(value)) tallest = Math.max(tallest, Math.abs(this.zToLocal(value)));
      }
    }
    this.meshHalf = Math.max(tallest, 0.08);
    this.scene = null;
  }

  cacheScene() {
    const theme = themeVar("--muted", "#78716c");
    const colors = (this.meshes || []).map((mesh) => mesh.color).join(",");
    const beam = this.light.on
      ? `${this.light.azimuth.toFixed(3)},${this.light.elevation.toFixed(3)}`
      : "off";
    const key = `${this.meshKey}|${theme}|${colors}|${beam}`;
    if (this.scene && this.scene.key === key) return;
    const surfaces = [];
    for (const mesh of this.meshes || []) this.cacheSurface(mesh, surfaces);
    this.scene = { key, surfaces };
  }

  cacheSurface(mesh, surfaces) {
    const { n, z, color } = mesh;
    const base = hexToRgb(color);
    const low = [23, 37, 58];
    const high = [255, 244, 230];
    const points = new Float64Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const index = j * n + i;
        const value = z[index];
        const local = this.localGridPoint(i, j, n, Number.isFinite(value) ? value : 0);
        points[index * 3] = local.x;
        points[index * 3 + 1] = local.y;
        points[index * 3 + 2] = local.z;
      }
    }
    const corner = (index) => ({ x: points[index * 3], y: points[index * 3 + 1], z: points[index * 3 + 2] });
    const colours = new Array((n - 1) * (n - 1)).fill(null);
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const first = j * n + i;
        const samples = [z[first], z[first + 1], z[first + n + 1], z[first + n]];
        if (samples.some((value) => !Number.isFinite(value))) continue;
        const locals = [corner(first), corner(first + 1), corner(first + n + 1), corner(first + n)];
        const height = clamp(this.zUnit((samples[0] + samples[1] + samples[2] + samples[3]) / 4), -1, 1);
        const t = (height + 1) / 2;
        const rgb = t < 0.5 ? mixRgb(low, base, t * 2) : mixRgb(base, high, (t - 0.5) * 2);
        colours[j * (n - 1) + i] = this.localShade(locals, rgb);
      }
    }
    const count = n * n;
    surfaces.push({
      n,
      points,
      colors: colours,
      sx: new Float32Array(count),
      sy: new Float32Array(count),
      depth: new Float32Array(count),
    });
  }

  projectSurfaces() {
    const proj = this.beginProjection();
    const batch = [];
    for (const surface of this.scene?.surfaces || []) {
      const { n, points, sx, sy, depth } = surface;
      const count = n * n;
      for (let index = 0; index < count; index++) {
        const x = points[index * 3];
        const y = points[index * 3 + 1];
        const z = points[index * 3 + 2];
        const flatX = x * proj.cy - y * proj.sy;
        const flatY = x * proj.sy + y * proj.cy;
        const toward = flatY * proj.cp - z * proj.sp;
        const up = flatY * proj.sp + z * proj.cp;
        const away = 3.2 - toward;
        if (!(away > 0.2)) {
          depth[index] = 0;
          continue;
        }
        const scale = proj.focal / away;
        sx[index] = proj.ox + flatX * scale;
        sy[index] = proj.oy - up * scale;
        depth[index] = away;
      }
      batch.push(surface);
    }
    return batch;
  }

  // Cells ordered back to front, as indexes into the projected batch.
  sortedCells(batch) {
    let total = 0;
    for (const surface of batch) total += (surface.n - 1) * (surface.n - 1);
    if (!this.cellBuffers || this.cellBuffers.size < total) {
      this.cellBuffers = {
        size: total,
        owner: new Uint32Array(total),
        cells: new Uint32Array(total),
        far: new Float32Array(total),
        order: new Uint32Array(total),
      };
    }
    const { owner, cells, far } = this.cellBuffers;
    let count = 0;
    for (let piece = 0; piece < batch.length; piece++) {
      const { n, depth, colors } = batch[piece];
      for (let j = 0; j < n - 1; j++) {
        for (let i = 0; i < n - 1; i++) {
          const cell = j * (n - 1) + i;
          if (!colors[cell]) continue;
          const first = j * n + i;
          const a = depth[first];
          const b = depth[first + 1];
          const c = depth[first + n + 1];
          const d = depth[first + n];
          if (!(a > 0) || !(b > 0) || !(c > 0) || !(d > 0)) continue;
          owner[count] = piece;
          cells[count] = cell;
          far[count] = (a + b + c + d) / 4;
          count += 1;
        }
      }
    }
    const order = this.cellBuffers.order.subarray(0, count);
    for (let index = 0; index < count; index++) order[index] = index;
    order.sort((one, two) => far[two] - far[one]);
    return { order, owner, cells, count };
  }

  projectScene() {
    const batch = this.projectSurfaces();
    const { order, owner, cells, count } = this.sortedCells(batch);
    const faces = [];
    for (let index = 0; index < count; index++) {
      const slot = order[index];
      const surface = batch[owner[slot]];
      const n = surface.n;
      const cell = cells[slot];
      const row = Math.floor(cell / (n - 1));
      const first = row * n + (cell - row * (n - 1));
      const corners = [first, first + 1, first + n + 1, first + n];
      faces.push({
        p: corners.map((at) => ({ sx: surface.sx[at], sy: surface.sy[at], depth: surface.depth[at] })),
        depth: corners.reduce((sum, at) => sum + surface.depth[at], 0) / 4,
        color: surface.colors[cell],
      });
    }
    return faces;
  }

  localShade(locals, rgb) {
    if (!this.light.on) return this.shadeColor(rgb, 0.8);
    const e1 = { x: locals[1].x - locals[0].x, y: locals[1].y - locals[0].y, z: locals[1].z - locals[0].z };
    const e2 = { x: locals[3].x - locals[0].x, y: locals[3].y - locals[0].y, z: locals[3].z - locals[0].z };
    const normal = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
    const beam = this.lightVector();
    const facing = Math.abs((normal.x * beam.x + normal.y * beam.y + normal.z * beam.z) / length);
    return this.shadeColor(rgb, 0.3 + 0.7 * facing);
  }

  floorLevel() {
    const { zMin, zMax } = this.view;
    const level = clamp(Number.isFinite(this.floorZ) ? this.floorZ : 0, zMin, zMax);
    return this.zToLocal(level);
  }

  setFloorZ(value) {
    const { zMin, zMax } = this.view;
    this.floorZ = Number.isFinite(value) ? clamp(value, zMin, zMax) : null;
    this.draw();
    this.onChange?.();
  }

  floorLines() {
    const { xMin, xMax, yMin, yMax } = this.view;
    const z = this.floorLevel();
    const step = this.floorStep();
    const { xs, ys } = this.floorLattice();
    const lines = [];
    const push = (x0, y0, x1, y1, width, fade) => {
      lines.push({
        p: [
          { x: this.worldToFloorX(x0), y: this.worldToFloorY(y0), z },
          { x: this.worldToFloorX(x1), y: this.worldToFloorY(y1), z },
        ],
        width,
        fade,
      });
    };
    // How wide one cell lands on screen decides how finely the floor is ruled.
    const origin = this.projectLocal({ x: this.worldToFloorX(0), y: this.worldToFloorY(0), z });
    const along = this.projectLocal({ x: this.worldToFloorX(step), y: this.worldToFloorY(0), z });
    const cell = origin && along ? Math.hypot(origin.sx - along.sx, origin.sy - along.sy) : 0;
    const dpr = window.devicePixelRatio || 1;
    let split = 1;
    if (cell > 300 * dpr) split = 25;
    else if (cell > 64 * dpr) split = 5;
    if (split > 1) {
      const fine = step / split;
      const labelled = (value) => Math.abs(value / step - Math.round(value / step)) < 1e-6;
      for (const x of this.multiples(xMin, xMax, fine)) {
        if (labelled(x)) continue;
        push(x, yMin, x, yMax, 1, 0.16);
      }
      for (const y of this.multiples(yMin, yMax, fine)) {
        if (labelled(y)) continue;
        push(xMin, y, xMax, y, 1, 0.16);
      }
    }
    for (const x of xs) push(x, yMin, x, yMax, 1.2, 0.5);
    for (const y of ys) push(xMin, y, xMax, y, 1.2, 0.5);
    push(xMin, yMin, xMax, yMin, 1.8, 0.75);
    push(xMin, yMax, xMax, yMax, 1.8, 0.75);
    push(xMin, yMin, xMin, yMax, 1.8, 0.75);
    push(xMax, yMin, xMax, yMax, 1.8, 0.75);
    return lines;
  }

  draw3d(ctx, dpr) {
    this.buildMeshes();
    this.cacheScene();
    const eyeAboveFloor = Math.sin(this.camera.pitch) < 0;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (this.showGrid && eyeAboveFloor) this.drawFloor(ctx, dpr);
    this.paintSurfaces(ctx, dpr);
    if (this.showGrid && !eyeAboveFloor) this.drawFloor(ctx, dpr);
    this.draw3dAxes(ctx, dpr);
    this.drawLight(ctx, dpr);
    ctx.restore();
  }

  paintSurfaces(ctx, dpr) {
    const batch = this.projectSurfaces();
    if (!batch.length) return;
    const { order, owner, cells, count } = this.sortedCells(batch);
    const seam = Math.max(1, 0.9 * dpr);
    ctx.save();
    ctx.lineWidth = seam;
    for (let index = 0; index < count; index++) {
      const slot = order[index];
      const surface = batch[owner[slot]];
      const n = surface.n;
      const cell = cells[slot];
      const row = Math.floor(cell / (n - 1));
      const first = row * n + (cell - row * (n - 1));
      const second = first + 1;
      const third = first + n + 1;
      const fourth = first + n;
      const { sx, sy } = surface;
      ctx.beginPath();
      ctx.moveTo(sx[first], sy[first]);
      ctx.lineTo(sx[second], sy[second]);
      ctx.lineTo(sx[third], sy[third]);
      ctx.lineTo(sx[fourth], sy[fourth]);
      ctx.closePath();
      const paint = surface.colors[cell];
      ctx.fillStyle = paint;
      ctx.strokeStyle = paint;
      ctx.fill();
      // The hairline seals the seam between neighbouring cells.
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFloor(ctx, dpr) {
    const lines = this.floorLines();
    if (!lines.length) return;
    ctx.save();
    ctx.strokeStyle = themeVar("--muted", "#78716c");
    for (const line of lines) {
      const a = this.projectLocal(line.p[0]);
      const b = this.projectLocal(line.p[1]);
      if (!a || !b) continue;
      ctx.globalAlpha = line.fade;
      ctx.lineWidth = Math.max(1, (line.width || 1) * dpr);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLight(ctx, dpr) {
    this.lightHit = null;
    if (!this.light.on) return;
    const place = this.lightPoint();
    const point = this.projectLocal(place);
    if (!point) return;
    this.lightHit = point;
    const radius = 7 * dpr;
    ctx.save();
    const foot = this.projectLocal(this.axisAnchor());
    if (foot) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(point.sx, point.sy);
      ctx.lineTo(foot.sx, foot.sy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.6 * dpr;
    for (let ray = 0; ray < 8; ray++) {
      const angle = (ray * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(point.sx + Math.cos(angle) * radius * 1.5, point.sy + Math.sin(angle) * radius * 1.5);
      ctx.lineTo(point.sx + Math.cos(angle) * radius * 2.2, point.sy + Math.sin(angle) * radius * 2.2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#fde68a";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  strokeSorted(ctx, line, dpr) {
    const [a, b] = line.p;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.strokeStyle = line.color;
    ctx.lineWidth = Math.max(1, (line.width || 1) * dpr);
    ctx.stroke();
  }

  localGridPoint(i, j, n, rawZ) {
    const { xMin, xMax, yMin, yMax } = this.view;
    const x = xMin + (i / (n - 1)) * (xMax - xMin);
    const y = yMin + (j / (n - 1)) * (yMax - yMin);
    return {
      x: this.worldToFloorX(x),
      y: this.worldToFloorY(y),
      z: this.zToLocal(rawZ),
    };
  }

  zUnit(rawZ) {
    const { zMin, zMax } = this.view;
    const span = zMax - zMin || 1;
    return ((rawZ - zMin) / span) * 2 - 1;
  }

  zToLocal(rawZ) {
    const { zMin, zMax } = this.view;
    const middle = (zMin + zMax) / 2;
    return (clamp(rawZ, zMin, zMax) - middle) / this.floorScale();
  }

  shadeColor(rgb, light) {
    const lit = clamp(light, 0.22, 1);
    return `rgb(${Math.round(rgb[0] * lit)}, ${Math.round(rgb[1] * lit)}, ${Math.round(rgb[2] * lit)})`;
  }

  quadFromLocals(locals, rgb) {
    const projected = locals.map((point) => this.projectLocal(point));
    if (projected.some((point) => !point)) return null;
    const e1 = {
      x: projected[1].cam.x - projected[0].cam.x,
      y: projected[1].cam.y - projected[0].cam.y,
      z: projected[1].cam.z - projected[0].cam.z,
    };
    const e2 = {
      x: projected[3].cam.x - projected[0].cam.x,
      y: projected[3].cam.y - projected[0].cam.y,
      z: projected[3].cam.z - projected[0].cam.z,
    };
    const normal = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
    const light = Math.abs((normal.x * 0.35 + normal.y * 0.78 + normal.z * 0.52) / length);
    return {
      p: projected,
      depth: (projected[0].depth + projected[1].depth + projected[2].depth + projected[3].depth) / 4,
      color: this.shadeColor(rgb, 0.32 + 0.68 * light),
    };
  }

  axisAnchor() {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    return {
      x: this.worldToFloorX(clamp(0, xMin, xMax)),
      y: this.worldToFloorY(clamp(0, yMin, yMax)),
      z: this.zToLocal(clamp(0, zMin, zMax)),
    };
  }

  planeZ() {
    return this.axisAnchor().z;
  }

  multiples(min, max, step) {
    if (!(step > 0) || !(max > min)) return [];
    const first = Math.ceil(min / step - 1e-8);
    const last = Math.floor(max / step + 1e-8);
    const values = [];
    for (let index = first; index <= last; index++) {
      const value = index === 0 ? 0 : index * step;
      if (value < min - step * 1e-6 || value > max + step * 1e-6) continue;
      values.push(Math.abs(value) < step * 1e-8 ? 0 : value);
    }
    return values;
  }

  gridStep2d() {
    const { xMin, xMax, yMin, yMax } = this.view;
    return niceStep(Math.max(xMax - xMin, yMax - yMin), 8);
  }

  axisTicks(min, max, target = 5) {
    return this.multiples(min, max, niceStep(max - min, target));
  }

  gridStops(min, max) {
    const stops = [min];
    for (const value of this.axisTicks(min, max)) {
      if (value > min + 1e-6 && value < max - 1e-6) stops.push(value);
    }
    stops.push(max);
    return stops;
  }

  floorScale() {
    const { xMin, xMax, yMin, yMax } = this.view;
    return Math.max(xMax - xMin, yMax - yMin) / 2 || 1;
  }

  worldToFloorX(value) {
    const { xMin, xMax } = this.view;
    return (value - (xMin + xMax) / 2) / this.floorScale();
  }

  worldToFloorY(value) {
    const { yMin, yMax } = this.view;
    return (value - (yMin + yMax) / 2) / this.floorScale();
  }

  floorStep() {
    const { xMin, xMax, yMin, yMax } = this.view;
    return Math.max(xMax - xMin, yMax - yMin) / FLOOR_CELLS;
  }

  floorLattice() {
    const { xMin, xMax, yMin, yMax } = this.view;
    const step = this.floorStep();
    return { xs: this.multiples(xMin, xMax, step), ys: this.multiples(yMin, yMax, step) };
  }

  draw3dAxes(ctx, dpr) {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const origin = this.axisAnchor();
    const pad = 0.12;
    const axes = [
      {
        from: { x: this.worldToFloorX(xMin) - pad, y: origin.y, z: origin.z },
        to: { x: this.worldToFloorX(xMax) + pad, y: origin.y, z: origin.z },
        color: this.axes.x.color,
        label: "x",
        visible: this.axes.x.visible,
      },
      {
        from: { x: origin.x, y: this.worldToFloorY(yMin) - pad, z: origin.z },
        to: { x: origin.x, y: this.worldToFloorY(yMax) + pad, z: origin.z },
        color: this.axes.y.color,
        label: "y",
        visible: this.axes.y.visible,
      },
      {
        from: { x: origin.x, y: origin.y, z: this.zToLocal(zMin) - pad },
        to: { x: origin.x, y: origin.y, z: this.zToLocal(zMax) + pad },
        color: this.axes.z.color,
        label: "z",
        visible: this.axes.z.visible,
      },
    ];
    ctx.save();
    ctx.lineWidth = 2 * dpr;
    ctx.font = `700 ${13 * dpr}px Consolas, "Malgun Gothic", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const axis of axes) {
      if (!axis.visible) continue;
      const a = this.projectLocal(axis.from);
      const b = this.projectLocal(axis.to);
      if (!a || !b) continue;
      ctx.strokeStyle = axis.color;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      ctx.fillStyle = axis.color;
      ctx.fillText(axis.label, b.sx + 10 * dpr, b.sy);
    }
    if (this.showAxisValues) this.drawAxisValues(ctx, dpr);
    ctx.restore();
  }

  drawAxisValues(ctx, dpr) {
    const placed = [];
    const label = (text, point, dx, dy, color) => {
      if (!point) return;
      const x = point.sx + dx;
      const y = point.sy + dy;
      if (placed.some((item) => Math.hypot(item.x - x, item.y - y) < 18 * dpr)) return;
      placed.push({ x, y });
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    ctx.lineWidth = Math.max(1, dpr);
    ctx.font = `600 ${11 * dpr}px Consolas, "Malgun Gothic", sans-serif`;
    const origin = this.axisAnchor();
    const { xs, ys } = this.floorLattice();
    if (this.axes.x.visible) {
      for (const value of xs) {
        const local = { x: this.worldToFloorX(value), y: origin.y, z: origin.z };
        const point = this.projectLocal(local);
        const tick = this.projectLocal({ x: local.x, y: origin.y, z: origin.z + 0.05 });
        if (point && tick) {
          ctx.strokeStyle = this.axes.x.color;
          ctx.beginPath();
          ctx.moveTo(point.sx, point.sy);
          ctx.lineTo(tick.sx, tick.sy);
          ctx.stroke();
        }
        label(formatTick(value), point, 0, 14 * dpr, this.axes.x.color);
      }
    }
    if (this.axes.y.visible) {
      for (const value of ys) {
        const local = { x: origin.x, y: this.worldToFloorY(value), z: origin.z };
        const point = this.projectLocal(local);
        const tick = this.projectLocal({ x: origin.x, y: local.y, z: origin.z + 0.05 });
        if (point && tick) {
          ctx.strokeStyle = this.axes.y.color;
          ctx.beginPath();
          ctx.moveTo(point.sx, point.sy);
          ctx.lineTo(tick.sx, tick.sy);
          ctx.stroke();
        }
        label(formatTick(value), point, 14 * dpr, 0, this.axes.y.color);
      }
    }
    if (!this.axes.z.visible) return;
    const { zMin, zMax } = this.view;
    for (let cut = 0; cut <= FLOOR_CELLS; cut++) {
      const value = zMin + ((zMax - zMin) * cut) / FLOOR_CELLS;
      const local = { x: origin.x, y: origin.y, z: this.zToLocal(value) };
      const point = this.projectLocal(local);
      const tick = this.projectLocal({ x: origin.x + 0.05, y: origin.y, z: local.z });
      if (point && tick) {
        ctx.strokeStyle = this.axes.z.color;
        ctx.beginPath();
        ctx.moveTo(point.sx, point.sy);
        ctx.lineTo(tick.sx, tick.sy);
        ctx.stroke();
      }
      label(formatTick(value), point, 12 * dpr, 0, this.axes.z.color);
    }
  }
}
