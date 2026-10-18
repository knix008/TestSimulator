// The axes are orange, green and sky blue, so no curve takes those hues.
const AXIS_COLORS = { x: "#fb923c", y: "#4ade80", z: "#7dd3fc" };
const PALETTE = ["#ef4444", "#a855f7", "#eab308", "#6366f1", "#ec4899", "#84cc16", "#d946ef", "#14b8a6"];
// The 3D floor is a hint of a surface, not a drawing of its own, so its lines
// stay well under the ink of the curves above them.
const FLOOR_INK = 0.4;

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
// A new curve is left where the reader put the window, unless the window has
// almost nothing of it in view. Below this share of the curve the picture is
// empty enough to be worth re-framing around the values.
const FIT_SHOWN = 0.15;
const FIT_SAMPLES = 401;
// The outermost values are dropped before framing, so one pole cannot press
// the whole curve into a hairline across the middle of the window.
const FIT_TRIM = 0.01;
// How far an axis carries on past the face of the box, as a share of its own
// half-length. The diagonal of the box reaches about 1.41, so this keeps the
// ends of the axes clear of the drawing without racing away from it.
const AXIS_OVERHANG = 1.2;
// How far an axis line is followed, in the units of the box. The length on
// the panel sizes the graph; the line itself runs on and fades out of view.
const AXIS_RAY = 240;
// How finely a 3D axis is cut to be sorted in among the surface cells, and how
// light it is drawn.
const AXIS_PIECES = 64;
const AXIS_LINE_WIDTH = 1.5;
const AXIS_LINE_ALPHA = 0.55;
const AXIS_TEXT_ALPHA = 0.8;
// An axis lying in a surface ties with it cell by cell and comes out dashed;
// pulling it toward the eye by this share of the floor's width (about two mesh
// cells) lets it win the tie, while a sheet clearly in front still covers it.
const AXIS_DEPTH_BIAS = 0.02;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cssRgb(color) {
  const text = String(color || "").trim();
  if (text.startsWith("#")) return hexToRgb(text);
  const parts = text.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return [120, 113, 108];
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
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
      x: { color: AXIS_COLORS.x, visible: true },
      y: { color: AXIS_COLORS.y, visible: true },
      z: { color: AXIS_COLORS.z, visible: true },
    };
    this.camera = { yaw: -0.75, pitch: -1.05, zoom: 1.35 };
    this.light = { on: true, azimuth: -0.95, elevation: 0.9, reach: 1.3 };
    // Set when a window was framed around the values rather than measured in
    // equal units. It is cleared the moment the reader sets a range by hand.
    this.stretched = false;
    this.floorZ = null;
    this.lightHit = null;
    this.hover = null;
    this.drag = null;
    this.nextId = 1;
    this.autoSquare = true;
    this.drawn = this.view;
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
    this.fitIfHidden();
    this.draw();
    this.onChange?.();
    return fn;
  }

  // The values a curve takes right across the window, for deciding what the
  // window ought to be. 3D is read off the mesh, which is already worked out.
  sampleValues() {
    const values = [];
    if (this.dimension === "3d") {
      this.buildMeshes();
      for (const mesh of this.meshes || []) {
        for (const value of mesh.z) if (Number.isFinite(value)) values.push(value);
      }
      return values;
    }
    // The range on the axes, not the slice the canvas widened it to: the
    // window is framed around the stretch of curve the reader asked for.
    const { xMin, xMax } = this.view;
    for (const fn of this.functions) {
      if (!fn.visible) continue;
      for (let step = 0; step < FIT_SAMPLES; step++) {
        const x = xMin + ((xMax - xMin) * step) / (FIT_SAMPLES - 1);
        const value = this.evalScope(fn.ast, { x });
        if (Number.isFinite(value)) values.push(value);
      }
    }
    return values;
  }

  // A window around the middle of the values, with the extremes left out and
  // a margin added, so a curve meets the window rather than its edges.
  fitBounds(values) {
    if (values.length < 2) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const edge = Math.floor(sorted.length * FIT_TRIM);
    let low = sorted[edge];
    let high = sorted[sorted.length - 1 - edge];
    // The trim is there to throw away a pole, not the top of an honest climb,
    // so an end that sits near the rest of the curve is taken back.
    const span = high - low;
    if (span > 0) {
      if (sorted[0] > low - span * 2) low = sorted[0];
      if (sorted[sorted.length - 1] < high + span * 2) high = sorted[sorted.length - 1];
    }
    if (!(high > low)) {
      // One value from end to end: give it room to be a line, not an edge.
      const middle = Number.isFinite(low) ? low : 0;
      const room = Math.max(Math.abs(middle) * 0.2, 1);
      low = middle - room;
      high = middle + room;
    }
    const margin = (high - low) * 0.08;
    low -= margin;
    high += margin;
    if (!Number.isFinite(low) || !Number.isFinite(high) || !(high > low)) return null;
    return { low, high };
  }

  // Re-frame only when the window has almost nothing of the drawing in it.
  // A curve that is already readable is left exactly where the reader put it.
  fitIfHidden() {
    const values = this.sampleValues();
    if (values.length < 2) return false;
    const low = this.dimension === "3d" ? this.view.zMin : this.view.yMin;
    const high = this.dimension === "3d" ? this.view.zMax : this.view.yMax;
    const inside = values.filter((value) => value >= low && value <= high).length;
    if (inside / values.length >= FIT_SHOWN) return false;
    const bounds = this.fitBounds(values);
    if (!bounds) return false;
    if (this.dimension === "3d") {
      this.view.zMin = bounds.low;
      this.view.zMax = bounds.high;
      this.zAuto = false;
    } else {
      this.view.yMin = bounds.low;
      this.view.yMax = bounds.high;
      // Equal units across both axes would widen x until the curve became a
      // hairline again, which is the very thing this is undoing.
      this.stretched = true;
    }
    this.meshKey = "";
    this.scene = null;
    this.onView?.();
    return true;
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
    // A range set by hand goes back to units of the same length on both axes,
    // which may show more than was asked for but never less.
    this.stretched = false;
    Object.assign(this.view, next);
    this.meshKey = "";
    this.draw();
    this.onView?.();
  }

  // One axis grows or shrinks about its own middle. The other two stay put,
  // and the drawn box remains a cube: a longer axis only spreads its ticks.
  stepAxis(axis, factor) {
    if (axis !== "x" && axis !== "y" && axis !== "z") return;
    const lowKey = `${axis}Min`;
    const highKey = `${axis}Max`;
    const low = this.view[lowKey];
    const high = this.view[highKey];
    const middle = (low + high) / 2;
    let half = ((high - low) / 2) * factor;
    if (!Number.isFinite(half)) return;
    half = Math.min(1e9, Math.max(1e-6, half));
    const nextLow = middle - half;
    const nextHigh = middle + half;
    if (Math.abs(nextHigh - nextLow - (high - low)) <= Math.max(1e-9, Math.abs(high - low) * 1e-9)) return;
    this.setView({ [lowKey]: nextLow, [highKey]: nextHigh });
  }

  resetView() {
    this.zAuto = false;
    this.stretched = false;
    if (this.dimension === "3d") {
      Object.assign(this.view, { xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: -10, zMax: 10 });
      this.camera = { yaw: -0.75, pitch: -1.05, zoom: 1.35 };
      // The lamp is placed in these numbers, so it comes back with them. Its
      // on and off stays where the reader left it: that is a separate button.
      Object.assign(this.light, { azimuth: -0.95, elevation: 0.9, reach: 1.3 });
      this.floorZ = null;
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

  zoomCamera(factor, fast) {
    const next = clamp(this.camera.zoom / factor, 0.12, 24);
    if (Math.abs(next - this.camera.zoom) < 1e-6) return;
    this.camera.zoom = next;
    if (fast) {
      // One frame per refresh, and that frame is the finished picture.
      // A second draw after the wheel stops used to fill in what the
      // quick pass had left out.
      this.fastPaint = true;
      this.scheduleDraw();
      clearTimeout(this.fullPaintTimer);
      this.fullPaintTimer = setTimeout(() => {
        this.fastPaint = false;
      }, 140);
    } else {
      this.fastPaint = false;
      this.draw();
    }
    this.onChange?.();
  }

  zoom3d(factor, fast) {
    const pairs = [["xMin", "xMax"], ["yMin", "yMax"], ["zMin", "zMax"]];
    const next = {};
    for (const [low, high] of pairs) {
      const middle = (this.view[low] + this.view[high]) / 2;
      const half = ((this.view[high] - this.view[low]) / 2) * factor;
      if (!Number.isFinite(half) || half < 1e-6 || half > 1e9) return;
      next[low] = middle - half;
      next[high] = middle + half;
    }
    Object.assign(this.view, next);
    // The camera keeps filling the window; only the span of the axes changes.
    this.zAuto = false;
    this.meshKey = "";
    this.scene = null;
    if (fast) {
      this.fastPaint = true;
      this.scheduleDraw();
      clearTimeout(this.fullPaintTimer);
      this.fullPaintTimer = setTimeout(() => {
        this.fastPaint = false;
      }, 140);
    } else {
      this.fastPaint = false;
      this.draw();
    }
    this.onView?.();
    this.onChange?.();
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
    return clamp(this.light.reach || 1.3, 0.3, 6);
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
    // Past the sphere the light simply moves further out, so the drag never stops.
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
      reach: clamp(length, 0.3, 6),
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

  // Where the lamp hangs, in the numbers on the axes. The light itself is kept
  // as a turn, a rise and a distance, so a place is read and written as both.
  lightPlace() {
    const point = this.lightPoint();
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const scale = this.floorScale();
    return {
      x: point.x * scale + (xMin + xMax) / 2,
      y: point.y * scale + (yMin + yMax) / 2,
      z: point.z * this.heightScale() + (zMin + zMax) / 2,
    };
  }

  setLightPlace(place) {
    if (!place) return;
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const scale = this.floorScale();
    const here = this.lightPlace();
    const origin = this.axisAnchor();
    const at = {
      x: Number.isFinite(place.x) ? place.x : here.x,
      y: Number.isFinite(place.y) ? place.y : here.y,
      z: Number.isFinite(place.z) ? place.z : here.z,
    };
    const arm = {
      x: (at.x - (xMin + xMax) / 2) / scale - origin.x,
      y: (at.y - (yMin + yMax) / 2) / scale - origin.y,
      z: (at.z - (zMin + zMax) / 2) / this.heightScale() - origin.z,
    };
    const span = Math.hypot(arm.x, arm.y, arm.z);
    // A lamp dropped onto the origin has no direction to keep; leave it be.
    if (!(span > 1e-9)) return;
    this.light.reach = clamp(span, 0.3, 6);
    this.light.azimuth = Math.atan2(arm.y, arm.x);
    this.light.elevation = clamp(Math.asin(clamp(arm.z / span, -1, 1)), -1.55, 1.55);
    this.draw();
    this.onChange?.();
  }

  setLight(light) {
    if (!light) return;
    if (typeof light.on === "boolean") this.light.on = light.on;
    if (Number.isFinite(light.azimuth)) this.light.azimuth = light.azimuth;
    if (Number.isFinite(light.elevation)) this.light.elevation = clamp(light.elevation, -1.55, 1.55);
    if (Number.isFinite(light.reach)) this.light.reach = clamp(light.reach, 0.3, 6);
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
    const { xMin, xMax } = this.drawn;
    return xMin + (px / this.canvas.width) * (xMax - xMin);
  }

  pxToY(py) {
    const { yMin, yMax } = this.drawn;
    return yMax - (py / this.canvas.height) * (yMax - yMin);
  }

  xToPx(x) {
    const { xMin, xMax } = this.drawn;
    return ((x - xMin) / (xMax - xMin)) * this.canvas.width;
  }

  yToPx(y) {
    const { yMin, yMax } = this.drawn;
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
    this.drag = { mode: "pan", px: p.px, py: p.py, view: { ...this.view }, frame: { ...this.drawn } };
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
      this.light.elevation = clamp(aimed.elevation, -1.55, 1.55);
      this.light.reach = aimed.reach;
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
      const seen = this.drag.frame || this.drag.view;
      const dx = ((p.px - this.drag.px) / this.canvas.width) * (seen.xMax - seen.xMin);
      const dy = ((p.py - this.drag.py) / this.canvas.height) * (seen.yMax - seen.yMin);
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
      if (ev.ctrlKey) this.zoomCamera(factor, true);
      else this.zoom3d(factor, true);
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

  // What the canvas actually shows: the range, widened so one unit is the
  // same length on both axes. The range itself is left alone, so two windows
  // with different canvases never argue about it.
  syncFrame() {
    const view = this.view;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const spanX = view.xMax - view.xMin;
    const spanY = view.yMax - view.yMin;
    if (this.stretched || this.dimension !== "2d" || !this.autoSquare || !(width > 0) || !(height > 0) || !(spanX > 0) || !(spanY > 0)) {
      this.drawn = view;
      return;
    }
    const scale = Math.min(width / spanX, height / spanY);
    const middleX = (view.xMin + view.xMax) / 2;
    const middleY = (view.yMin + view.yMax) / 2;
    const halfX = width / scale / 2;
    const halfY = height / scale / 2;
    this.drawn = {
      ...view,
      xMin: middleX - halfX,
      xMax: middleX + halfX,
      yMin: middleY - halfY,
      yMax: middleY + halfY,
    };
  }

  draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    if (!width || !height) return;
    this.syncFrame();
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

  legendChipAt(px, py) {
    return this.legendHits.find((hit) => {
      const chip = hit.chip;
      if (!chip) return false;
      const reach = 4 * (window.devicePixelRatio || 1);
      return (
        px >= chip.x - reach &&
        px <= chip.x + chip.w + reach &&
        py >= chip.y - reach &&
        py <= chip.y + chip.h + reach
      );
    }) || null;
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
      this.legendHits.push({
        id: fn.id,
        x,
        y: rowTop,
        w: boxW,
        h: rowH,
        chip: { x: x + pad, y: rowY - swatch / 2, w: swatch, h: swatch },
      });
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
    const { xMin, xMax, yMin, yMax } = this.drawn;
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
    const { xMin, xMax, yMin, yMax } = this.drawn;
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
    const jump = (this.drawn.yMax - this.drawn.yMin) * 1.5;
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

  // The cylinder around the box. The lamp is left out: folding it in makes the
  // whole picture zoom and shift every time the lamp moves.
  sceneBounds() {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const rx = Math.abs(this.worldToFloorX(xMax) - this.worldToFloorX(xMin)) / 2;
    const ry = Math.abs(this.worldToFloorY(yMax) - this.worldToFloorY(yMin)) / 2;
    let radius = Math.hypot(rx, ry) || 1;
    let half = Math.max(Math.abs(this.zToLocal(zMin)), Math.abs(this.zToLocal(zMax)), 0.2);
    // The axes run past the box, and their ends have to stay in the window.
    const reaches = this.axes.x.visible || this.axes.y.visible;
    if (reaches) radius = Math.max(radius, Math.max(rx, ry) * AXIS_OVERHANG);
    if (this.axes.z.visible) half *= AXIS_OVERHANG;
    return { radius, half };
  }

  // How far that cylinder reaches from the middle of the screen, at focal 1.
  fitFocal(w, h) {
    const { radius, half } = this.sceneBounds();
    const pitchCos = Math.cos(this.camera.pitch);
    const pitchSin = Math.sin(this.camera.pitch);
    let across = 1e-6;
    let down = 1e-6;
    const rim = 32;
    for (let step = 0; step < rim; step++) {
      const angle = (step / rim) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      for (const z of [-half, 0, half]) {
        const toward = y * pitchCos - z * pitchSin;
        const up = y * pitchSin + z * pitchCos;
        const away = 3.2 - toward;
        if (!(away > 0.3)) continue;
        across = Math.max(across, Math.abs(x / away));
        down = Math.max(down, Math.abs(up / away));
      }
    }
    return Math.min((w * 0.98) / (2 * across), (h * 0.98) / (2 * down));
  }

  beginProjection() {
    const { yaw, pitch, zoom } = this.camera;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const focal = this.fitFocal(w, h) * (zoom / 1.35);
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
      focal,
      // The middle of the box holds the middle of the canvas while the camera turns.
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

  // The drawn ground is exactly the range the axes measure. Carrying the
  // surface past it only gave a ragged rim of cells cut at the height limit,
  // and left the axes looking like a small cross in the middle of it.
  meshDomain() {
    const { xMin, xMax, yMin, yMax } = this.view;
    return { x0: xMin, x1: xMax, y0: yMin, y1: yMax };
  }

  buildMeshes() {
    const { x0, x1, y0, y1 } = this.meshDomain();
    const visible = this.functions.filter((fn) => fn.visible);
    const zPart = this.zAuto ? "auto" : `${this.view.zMin}|${this.view.zMax}`;
    const key = [x0, x1, y0, y1, zPart, visible.map((fn) => `${fn.id}:${fn.expr}`).join(",")].join("|");
    if (key === this.meshKey && this.meshes) return;
    this.meshKey = key;
    const n = 109;
    const grids = visible.map(() => new Float64Array(n * n));
    const trackHeight = this.zAuto || !(this.view.zMax > this.view.zMin);
    const magnitudes = trackHeight ? [] : null;
    const previousAngle = this.engine.angleMode;
    this.engine.angleMode = "rad";
    try {
      for (let j = 0; j < n; j++) {
        const y = y0 + (j / (n - 1)) * (y1 - y0);
        for (let i = 0; i < n; i++) {
          const x = x0 + (i / (n - 1)) * (x1 - x0);
          for (let index = 0; index < visible.length; index++) {
            let z = NaN;
            try {
              const value = this.engine.evalAst(visible[index].ast, { x, y });
              z = Number.isFinite(value) ? value : NaN;
            } catch {
              z = NaN;
            }
            grids[index][j * n + i] = z;
            if (trackHeight && Number.isFinite(z)) magnitudes.push(Math.abs(z));
          }
        }
      }
    } finally {
      this.engine.angleMode = previousAngle;
    }
    if (trackHeight) {
      magnitudes.sort((a, b) => a - b);
      const robust = magnitudes.length ? magnitudes[Math.floor(magnitudes.length * 0.95)] : 1;
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
      ? `${this.light.azimuth.toFixed(3)},${this.light.elevation.toFixed(3)},${this.lightReach().toFixed(3)}`
      : "off";
    const geomKey = `${this.meshKey}|${theme}|${colors}`;
    const key = `${geomKey}|${beam}`;
    if (this.scene && this.scene.key === key) return;
    // Moving the lamp only changes how bright each face is. The shape stays.
    if (this.scene && this.scene.geomKey === geomKey) {
      this.recolorScene();
      this.scene.key = key;
      return;
    }
    const surfaces = [];
    for (const mesh of this.meshes || []) this.cacheSurface(mesh, surfaces);
    this.scene = { key, geomKey, surfaces };
  }

  recolorScene() {
    const beam = this.light.on ? this.lightVector() : null;
    for (const surface of this.scene.surfaces) {
      const { colors, shades, normals, edges, base } = surface;
      for (let index = 0; index < colors.length; index++) {
        if (!colors[index]) continue;
        const at = index * 3;
        const lit = this.paintLit(normals[at], normals[at + 1], normals[at + 2], base, beam);
        colors[index] = lit.color;
        shades[index] = lit.shade;
      }
      for (const edge of edges) {
        const lit = this.paintLit(edge.nx, edge.ny, edge.nz, base, beam);
        edge.color = lit.color;
        edge.shade = lit.shade;
      }
    }
  }

  cacheSurface(mesh, surfaces) {
    const { n, z, color } = mesh;
    const base = hexToRgb(color);
    const { x0, x1, y0, y1 } = this.meshDomain();
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
    const zFloor = this.view.zMin;
    const zCeiling = this.view.zMax;
    const cellCount = (n - 1) * (n - 1);
    const colours = new Array(cellCount).fill(null);
    const shades = new Uint8Array(cellCount);
    const normals = new Float32Array(cellCount * 3);
    const edges = [];
    const scratch = this.normalScratch || (this.normalScratch = new Float64Array(3));
    const beam = this.light.on ? this.lightVector() : null;
    // One function, one colour: height does not tint the surface.
    const remember = (locals, cell) => {
      this.unitNormal(locals, scratch);
      const lit = this.paintLit(scratch[0], scratch[1], scratch[2], base, beam);
      if (cell >= 0) {
        const at = cell * 3;
        normals[at] = scratch[0];
        normals[at + 1] = scratch[1];
        normals[at + 2] = scratch[2];
        colours[cell] = lit.color;
        shades[cell] = lit.shade;
      }
      return lit;
    };
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const first = j * n + i;
        const samples = [z[first], z[first + 1], z[first + n + 1], z[first + n]];
        if (samples.some((value) => !Number.isFinite(value))) continue;
        const locals = [corner(first), corner(first + 1), corner(first + n + 1), corner(first + n)];
        const over = samples.filter((value) => value > zCeiling).length;
        const under = samples.filter((value) => value < zFloor).length;
        if (over === 4 || under === 4) continue;
        if (!over && !under) {
          remember(locals, j * (n - 1) + i);
          continue;
        }
        // The cell meets the height limit: cut it there rather than fold it flat.
        const world = [
          { x: x0 + (i / (n - 1)) * (x1 - x0), y: y0 + (j / (n - 1)) * (y1 - y0), z: samples[0] },
          { x: x0 + ((i + 1) / (n - 1)) * (x1 - x0), y: y0 + (j / (n - 1)) * (y1 - y0), z: samples[1] },
          { x: x0 + ((i + 1) / (n - 1)) * (x1 - x0), y: y0 + ((j + 1) / (n - 1)) * (y1 - y0), z: samples[2] },
          { x: x0 + (i / (n - 1)) * (x1 - x0), y: y0 + ((j + 1) / (n - 1)) * (y1 - y0), z: samples[3] },
        ];
        const piece = this.clipToHeight(this.clipToHeight(world, zCeiling, false), zFloor, true);
        if (piece.length < 3) continue;
        const shape = new Float64Array(piece.length * 3);
        piece.forEach((point, at) => {
          shape[at * 3] = this.worldToFloorX(point.x);
          shape[at * 3 + 1] = this.worldToFloorY(point.y);
          shape[at * 3 + 2] = this.zToLocal(point.z);
        });
        // Shade the cut cell by the slope it really has. Reading it off the
        // corners the ceiling flattened would light the rim like a lid and
        // leave a row of bright teeth along the cut.
        const slope = world.map((point) => ({
          x: this.worldToFloorX(point.x),
          y: this.worldToFloorY(point.y),
          z: this.zToLocalFree(point.z),
        }));
        const lit = remember(slope, -1);
        edges.push({ shape, count: piece.length, nx: scratch[0], ny: scratch[1], nz: scratch[2], color: lit.color, shade: lit.shade });
      }
    }
    const count = n * n;
    let rim = 0;
    for (const edge of edges) {
      edge.at = rim;
      rim += edge.count;
    }
    surfaces.push({
      n,
      base,
      points,
      colors: colours,
      shades,
      normals,
      edges,
      sx: new Float32Array(count),
      sy: new Float32Array(count),
      depth: new Float32Array(count),
      rimSx: new Float32Array(rim),
      rimSy: new Float32Array(rim),
      rimDepth: new Float32Array(edges.length),
    });
  }

  // Sutherland and Hodgman against one height plane, in world units.
  clipToHeight(shape, limit, keepAbove) {
    const inside = (point) => (keepAbove ? point.z >= limit - 1e-9 : point.z <= limit + 1e-9);
    const out = [];
    for (let index = 0; index < shape.length; index++) {
      const current = shape[index];
      const previous = shape[(index + shape.length - 1) % shape.length];
      const here = inside(current);
      const there = inside(previous);
      if (here !== there) {
        const gap = current.z - previous.z;
        const t = gap === 0 ? 0 : (limit - previous.z) / gap;
        out.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
          z: limit,
        });
      }
      if (here) out.push(current);
    }
    return out;
  }

  projectSurfaces() {
    const proj = this.beginProjection();
    const { cy, sy, cp, sp, focal, ox, oy } = proj;
    const batch = [];
    const spot = this.projectSpot || (this.projectSpot = { sx: 0, sy: 0, away: 0 });
    const place = (x, y, z) => {
      const flatX = x * cy - y * sy;
      const flatY = x * sy + y * cy;
      const toward = flatY * cp - z * sp;
      const up = flatY * sp + z * cp;
      const away = 3.2 - toward;
      if (!(away > 0.2)) return false;
      const scale = focal / away;
      spot.sx = ox + flatX * scale;
      spot.sy = oy - up * scale;
      spot.away = away;
      return true;
    };
    for (const surface of this.scene?.surfaces || []) {
      const { n, points, sx, sy, depth } = surface;
      const count = n * n;
      for (let index = 0; index < count; index++) {
        if (!place(points[index * 3], points[index * 3 + 1], points[index * 3 + 2])) {
          depth[index] = 0;
          continue;
        }
        sx[index] = spot.sx;
        sy[index] = spot.sy;
        depth[index] = spot.away;
      }
      let at = 0;
      const { edges, rimSx, rimSy, rimDepth } = surface;
      for (let piece = 0; piece < edges.length; piece++) {
        const edge = edges[piece];
        let sum = 0;
        let good = true;
        for (let vertex = 0; vertex < edge.count; vertex++) {
          const o = vertex * 3;
          if (!place(edge.shape[o], edge.shape[o + 1], edge.shape[o + 2])) {
            good = false;
            break;
          }
          rimSx[at + vertex] = spot.sx;
          rimSy[at + vertex] = spot.sy;
          sum += spot.away;
        }
        rimDepth[piece] = good ? sum / edge.count : 0;
        at += edge.count;
      }
      batch.push(surface);
    }
    return batch;
  }

  // Faces ordered back to front: whole cells and the clipped rim pieces.
  sortedCells(batch) {
    let total = 0;
    for (const surface of batch) total += (surface.n - 1) * (surface.n - 1) + surface.edges.length;
    if (!this.cellBuffers || this.cellBuffers.size < total) {
      this.cellBuffers = {
        size: total,
        owner: new Uint32Array(total),
        cells: new Uint32Array(total),
        kind: new Uint8Array(total),
        far: new Float32Array(total),
        order: new Uint32Array(total),
      };
    }
    const { owner, cells, kind, far } = this.cellBuffers;
    let count = 0;
    for (let piece = 0; piece < batch.length; piece++) {
      const { n, depth, colors, edges, rimDepth } = batch[piece];
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
          kind[count] = 0;
          far[count] = (a + b + c + d) / 4;
          count += 1;
        }
      }
      for (let edge = 0; edge < edges.length; edge++) {
        const away = rimDepth[edge];
        if (!(away > 0)) continue;
        owner[count] = piece;
        cells[count] = edge;
        kind[count] = 1;
        far[count] = away;
        count += 1;
      }
    }
    const order = this.cellBuffers.order.subarray(0, count);
    for (let index = 0; index < count; index++) order[index] = index;
    order.sort((one, two) => far[two] - far[one]);
    return { order, owner, cells, kind, far, count };
  }

  projectScene() {
    const batch = this.projectSurfaces();
    const { order, owner, cells, kind, count } = this.sortedCells(batch);
    const faces = [];
    for (let index = 0; index < count; index++) {
      const slot = order[index];
      const surface = batch[owner[slot]];
      if (kind[slot] === 1) {
        const edge = surface.edges[cells[slot]];
        const p = [];
        for (let vertex = 0; vertex < edge.count; vertex++) {
          p.push({ sx: surface.rimSx[edge.at + vertex], sy: surface.rimSy[edge.at + vertex] });
        }
        faces.push({ p, depth: surface.rimDepth[cells[slot]], color: edge.color });
        continue;
      }
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

  unitNormal(locals, out) {
    const e1x = locals[1].x - locals[0].x;
    const e1y = locals[1].y - locals[0].y;
    const e1z = locals[1].z - locals[0].z;
    const e2x = locals[3].x - locals[0].x;
    const e2y = locals[3].y - locals[0].y;
    const e2z = locals[3].z - locals[0].z;
    let x = e1y * e2z - e1z * e2y;
    let y = e1z * e2x - e1x * e2z;
    let z = e1x * e2y - e1y * e2x;
    const length = Math.hypot(x, y, z) || 1;
    out[0] = x / length;
    out[1] = y / length;
    out[2] = z / length;
    return out;
  }

  paintLit(nx, ny, nz, rgb, beam) {
    const lit = beam ? clamp(0.62 + 0.38 * Math.abs(nx * beam.x + ny * beam.y + nz * beam.z), 0.45, 1) : 0.92;
    const box = this.litBox || (this.litBox = { color: "", shade: 0 });
    box.color = this.shadeColor(rgb, lit);
    box.shade = Math.round(lit * 255);
    return box;
  }

  localShade(locals, rgb) {
    const scratch = this.normalScratch || (this.normalScratch = new Float64Array(3));
    this.unitNormal(locals, scratch);
    const beam = this.light.on ? this.lightVector() : null;
    return this.paintLit(scratch[0], scratch[1], scratch[2], rgb, beam).color;
  }

  // How far each axis runs from the middle, in the units of the box. The box
  // itself reaches 1, so anything above that is the overhang.
  axisSpan() {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const reach = (low, high) => Math.max(Math.abs(low), Math.abs(high)) * AXIS_OVERHANG;
    return {
      x: reach(this.worldToFloorX(xMin), this.worldToFloorX(xMax)),
      y: reach(this.worldToFloorY(yMin), this.worldToFloorY(yMax)),
      z: reach(this.zToLocal(zMin), this.zToLocal(zMax)),
    };
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

  // Where a screen pixel meets the floor, or null when the ray misses it,
  // runs behind the eye, or only hits past the distance we still draw.
  screenToFloor(px, py, z, maxDepth) {
    const proj = this.proj || this.beginProjection();
    const u = (px - proj.ox) / proj.focal;
    const v = -(py - proj.oy) / proj.focal;
    const eye = 3.2;
    const denom = proj.sp + v * proj.cp;
    if (!(Math.abs(denom) > 1e-6)) return null;
    const depth = (z + eye * proj.sp) / denom;
    if (!(depth > 0.35) || depth > maxDepth) return null;
    const cam = { x: u * depth, y: eye - depth, z: v * depth };
    return this.unrotateLocal(cam);
  }

  // Where lines of this spacing have closed up to a few pixels. Drawing any
  // further only piles them into a dark band with a hard edge.
  floorVanish(stepWorld) {
    const proj = this.proj || this.beginProjection();
    const z = this.floorLevel();
    const anchor = this.projectLocal({ x: 0, y: 0, z });
    const horizon = proj.oy + proj.focal * Math.tan(this.camera.pitch);
    const fallback = { depth: 24, sy: Number.isFinite(horizon) ? horizon : proj.oy };
    if (!anchor || !Number.isFinite(horizon) || Math.abs(horizon - anchor.sy) < 24) return fallback;
    const step = stepWorld / this.floorScale();
    const minPx = 6 * (window.devicePixelRatio || 1);
    const spacingAt = (py) => {
      const hit = this.screenToFloor(proj.ox, py, z, 500);
      if (!hit) return 0;
      const here = this.projectLocal({ x: hit.x, y: hit.y, z });
      if (!here) return 0;
      let gap = Infinity;
      for (const [dx, dy] of [[step, 0], [0, step]]) {
        const over = this.projectLocal({ x: hit.x + dx, y: hit.y + dy, z });
        if (!over) continue;
        gap = Math.min(gap, Math.hypot(over.sx - here.sx, over.sy - here.sy));
      }
      return Number.isFinite(gap) ? gap : 0;
    };
    let nearY = anchor.sy;
    let farY = nearY + (horizon - nearY) * 0.97;
    if (spacingAt(farY) >= minPx) nearY = farY;
    else if (!(spacingAt(nearY) >= minPx)) nearY = nearY + (farY - nearY) * 0.25;
    else {
      for (let i = 0; i < 18; i++) {
        const mid = (nearY + farY) / 2;
        if (spacingAt(mid) >= minPx) nearY = mid;
        else farY = mid;
      }
    }
    const hit = this.screenToFloor(proj.ox, nearY, z, 500);
    if (!hit) return { depth: fallback.depth, sy: nearY };
    const depth = 3.2 - this.rotateLocal({ x: hit.x, y: hit.y, z }).y;
    if (!(depth > 2)) return fallback;
    return { depth: clamp(depth, 4, 140), sy: nearY };
  }

  // The screen row where the range's far side sits, so the ink can stay solid
  // over the axes and thin out only past them.
  floorSolidSy(z) {
    const proj = this.proj || this.beginProjection();
    const horizon = proj.oy + proj.focal * Math.tan(this.camera.pitch);
    const { xMin, xMax, yMin, yMax } = this.view;
    let best = null;
    for (const x of [xMin, xMax]) {
      for (const y of [yMin, yMax]) {
        const point = this.projectLocal({ x: this.worldToFloorX(x), y: this.worldToFloorY(y), z });
        if (!point) continue;
        if (best == null || Math.abs(point.sy - horizon) < Math.abs(best - horizon)) best = point.sy;
      }
    }
    if (best == null) {
      const anchor = this.projectLocal({ x: 0, y: 0, z });
      return anchor ? anchor.sy : proj.oy;
    }
    return best;
  }

  // The bit of the floor the window can see, always at least the range the
  // axes measure, so the grid never shrinks inside the box.
  floorSpan(z, vanish) {
    const proj = this.proj || this.beginProjection();
    const { xMin, xMax, yMin, yMax } = this.view;
    let minX = this.worldToFloorX(xMin);
    let maxX = this.worldToFloorX(xMax);
    let minY = this.worldToFloorY(yMin);
    let maxY = this.worldToFloorY(yMax);
    const maxDepth = vanish.depth + 1;
    const consider = (px, py) => {
      const hit = this.screenToFloor(px, py, z, maxDepth);
      if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return;
      minX = Math.min(minX, hit.x);
      maxX = Math.max(maxX, hit.x);
      minY = Math.min(minY, hit.y);
      maxY = Math.max(maxY, hit.y);
    };
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const across = (i / steps) * proj.w;
      const down = (i / steps) * proj.h;
      consider(across, 0);
      consider(across, proj.h);
      consider(0, down);
      consider(proj.w, down);
      consider(across, vanish.sy);
    }
    const pad = this.floorStep() / this.floorScale();
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }

  // Keep the part of a floor line that is inside the window and in front of
  // the eye. A straight line stays straight in perspective, so the two ends
  // are enough.
  clipFloorSegment(a, b, maxDepth) {
    const proj = this.proj || this.beginProjection();
    const ca = this.rotateLocal(a);
    const cb = this.rotateLocal(b);
    const eye = 3.2;
    const near = 0.35;
    const focal = proj.focal;
    const margin = 8;
    const left = -margin;
    const top = -margin;
    const right = proj.w + margin;
    const bottom = proj.h + margin;
    let t0 = 0;
    let t1 = 1;
    const keep = (f0, df) => {
      if (Math.abs(df) < 1e-9) return f0 >= -1e-6;
      const bound = -f0 / df;
      if (df > 0) {
        if (bound > t1) return false;
        if (bound > t0) t0 = bound;
      } else {
        if (bound < t0) return false;
        if (bound < t1) t1 = bound;
      }
      return t0 <= t1 + 1e-8;
    };
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    const dz = cb.z - ca.z;
    if (!keep(eye - ca.y - near, -dy)) return null;
    if (!keep(maxDepth - (eye - ca.y), dy)) return null;
    const leftK = proj.ox - left;
    if (!keep(leftK * (eye - ca.y) + focal * ca.x, -leftK * dy + focal * dx)) return null;
    const rightK = right - proj.ox;
    if (!keep(rightK * (eye - ca.y) - focal * ca.x, -rightK * dy - focal * dx)) return null;
    const topK = proj.oy - top;
    if (!keep(topK * (eye - ca.y) - focal * ca.z, -topK * dy - focal * dz)) return null;
    const bottomK = bottom - proj.oy;
    if (!keep(bottomK * (eye - ca.y) + focal * ca.z, -bottomK * dy + focal * dz)) return null;
    if (!(t1 > t0 + 1e-5)) return null;
    const at = (t) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    });
    return [at(t0), at(t1)];
  }

  floorLines() {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const camera = this.camera;
    const stamp = [
      xMin, xMax, yMin, yMax, zMin, zMax, this.floorZ,
      camera.yaw, camera.pitch, camera.zoom,
      this.canvas.width, this.canvas.height,
      this.axes.x.visible, this.axes.y.visible, this.axes.z.visible,
      window.devicePixelRatio || 1,
    ].join("|");
    if (this.floorStamp === stamp && this.floorCache) return this.floorCache;
    const lines = this.makeFloorLines();
    this.floorStamp = stamp;
    this.floorCache = lines;
    return lines;
  }

  makeFloorLines() {
    const { xMin, xMax, yMin, yMax } = this.view;
    const z = this.floorLevel();
    const step = this.floorStep();
    const scale = this.floorScale();
    const proj = this.beginProjection();
    const vanish = this.floorVanish(step);
    const span = this.floorSpan(z, vanish);
    // Full ink through the far side of the range. The five by five lives on
    // this side of that row; only the ground past it is allowed to thin.
    const solid = this.floorSolidSy(z);
    const midX = (xMin + xMax) / 2;
    const midY = (yMin + yMax) / 2;
    // A zoomed-out window can see a long way. Cap the count so a flat view
    // cannot ask for tens of thousands of lines that would only merge anyway.
    // The measured range is kept either way: the cap used to centre on the
    // horizon and drop the five by five out of the picture.
    const capRange = (lo, hi, gap, keepLo, keepHi) => {
      const cap = 400;
      if (!(hi > lo) || !((hi - lo) / gap > cap)) return [lo, hi];
      const keepA = Math.min(keepLo, keepHi);
      const keepB = Math.max(keepLo, keepHi);
      const half = Math.max(0, cap * gap - (keepB - keepA)) / 2;
      let a = keepA - half;
      let b = keepB + half;
      if (a < lo) {
        b = Math.min(hi, b + (lo - a));
        a = lo;
      }
      if (b > hi) {
        a = Math.max(lo, a - (b - hi));
        b = hi;
      }
      return [a, b];
    };
    const [worldX0, worldX1] = capRange(span.minX * scale + midX, span.maxX * scale + midX, step, xMin, xMax);
    const [worldY0, worldY1] = capRange(span.minY * scale + midY, span.maxY * scale + midY, step, yMin, yMax);
    const lines = [];
    const push = (x0, y0, x1, y1, width, fade, limit, flat) => {
      const clipped = this.clipFloorSegment(
        { x: this.worldToFloorX(x0), y: this.worldToFloorY(y0), z },
        { x: this.worldToFloorX(x1), y: this.worldToFloorY(y1), z },
        limit.depth
      );
      if (!clipped) return;
      lines.push(flat ? { p: clipped, width, fade, flat: true } : { p: clipped, width, fade, vanish: limit.sy, solid });
    };
    // How wide one cell is on screen, measured the same way from every angle.
    const cell = (step / scale) * (proj.focal / 3.2);
    const dpr = window.devicePixelRatio || 1;
    let split = 1;
    if (cell > 300 * dpr) split = 25;
    else if (cell > 64 * dpr) split = 5;
    if (split > 1) {
      const fine = step / split;
      const fineVanish = this.floorVanish(fine);
      const [fineX0, fineX1] = capRange(worldX0, worldX1, fine, xMin, xMax);
      const [fineY0, fineY1] = capRange(worldY0, worldY1, fine, yMin, yMax);
      const labelled = (value) => Math.abs(value / step - Math.round(value / step)) < 1e-6;
      for (const x of this.multiples(fineX0, fineX1, fine)) {
        if (labelled(x)) continue;
        push(x, worldY0, x, worldY1, 1, 0.14, fineVanish);
      }
      for (const y of this.multiples(fineY0, fineY1, fine)) {
        if (labelled(y)) continue;
        push(worldX0, y, worldX1, y, 1, 0.14, fineVanish);
      }
    }
    // The extension thins toward the horizon. Where a line crosses the range
    // it is left out here and drawn again, solid, just below: a foreshortened
    // angle used to fade that crossing away with the distance, and the five
    // by five disappeared.
    const inside = (value, lo, hi) => value >= lo - step * 1e-6 && value <= hi + step * 1e-6;
    for (const x of this.multiples(worldX0, worldX1, step)) {
      if (!inside(x, xMin, xMax)) push(x, worldY0, x, worldY1, 1.2, 0.58, vanish);
      else {
        if (worldY0 < yMin - step * 1e-4) push(x, worldY0, x, yMin, 1.2, 0.58, vanish);
        if (worldY1 > yMax + step * 1e-4) push(x, yMax, x, worldY1, 1.2, 0.58, vanish);
      }
    }
    for (const y of this.multiples(worldY0, worldY1, step)) {
      if (!inside(y, yMin, yMax)) push(worldX0, y, worldX1, y, 1.2, 0.58, vanish);
      else {
        if (worldX0 < xMin - step * 1e-4) push(worldX0, y, xMin, y, 1.2, 0.58, vanish);
        if (worldX1 > xMax + step * 1e-4) push(xMax, y, worldX1, y, 1.2, 0.58, vanish);
      }
    }
    const across = { depth: 120, sy: vanish.sy };
    for (const x of this.multiples(xMin, xMax, step)) push(x, yMin, x, yMax, 1.2, 0.58, across, true);
    for (const y of this.multiples(yMin, yMax, step)) push(xMin, y, xMax, y, 1.2, 0.58, across, true);
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
    const { pieces, letters } = this.axisPieces(dpr);
    this.paintSurfaces(ctx, dpr, pieces);
    if (this.showGrid && !eyeAboveFloor) this.drawFloor(ctx, dpr);
    if (this.showGrid) this.drawFloor(ctx, dpr, true);
    this.drawAxisRays(ctx, dpr);
    this.drawAxisLetters(ctx, dpr, letters);
    this.drawLight(ctx, dpr);
    ctx.restore();
  }

  // The axis pieces come sorted far to near and are slipped in between the
  // cells, each just before the first cell that is nearer than it.
  paintSurfaces(ctx, dpr, pieces = []) {
    let next = 0;
    // Pieces that share a colour and meet end to end go down as one stroke.
    // Separate strokes of the same translucent ink leave a dark bead at the join.
    const drawFartherThan = (away) => {
      while (next < pieces.length && pieces[next].depth >= away) {
        const piece = pieces[next];
        if (piece.text) {
          this.drawAxisPiece(ctx, piece);
          next += 1;
          continue;
        }
        ctx.save();
        ctx.globalAlpha = AXIS_LINE_ALPHA;
        ctx.lineCap = "butt";
        ctx.lineWidth = piece.width;
        ctx.strokeStyle = piece.color;
        ctx.beginPath();
        const width = piece.width;
        const color = piece.color;
        while (
          next < pieces.length &&
          pieces[next].depth >= away &&
          !pieces[next].text &&
          pieces[next].width === width &&
          pieces[next].color === color
        ) {
          const line = pieces[next].line;
          ctx.moveTo(line[0], line[1]);
          ctx.lineTo(line[2], line[3]);
          next += 1;
        }
        ctx.stroke();
        ctx.restore();
      }
    };
    const batch = this.projectSurfaces();
    if (!batch.length) {
      drawFartherThan(-Infinity);
      return;
    }
    const { order, owner, cells, kind, far, count } = this.sortedCells(batch);
    ctx.save();
    ctx.lineWidth = Math.max(1, 0.9 * dpr);
    let pathOpen = false;
    let runColor = "";
    let runWind = 0;
    const flush = () => {
      if (!pathOpen) return;
      ctx.fillStyle = runColor;
      ctx.strokeStyle = runColor;
      ctx.fill();
      // The hairline seals the seam between neighbouring cells.
      ctx.stroke();
      pathOpen = false;
    };
    // Opposite windings in one path would cut a hole where two cells overlap.
    const begin = (paint, wind) => {
      const opposite = pathOpen && wind !== 0 && runWind !== 0 && (wind < 0) !== (runWind < 0);
      if (!pathOpen || paint !== runColor || opposite) {
        flush();
        ctx.beginPath();
        pathOpen = true;
        runColor = paint;
        runWind = wind || runWind;
      }
    };
    for (let index = 0; index < count; index++) {
      const slot = order[index];
      const away = far[slot];
      if (next < pieces.length && pieces[next].depth >= away) {
        flush();
        drawFartherThan(away);
      }
      const surface = batch[owner[slot]];
      if (kind[slot] === 1) {
        const edge = surface.edges[cells[slot]];
        const paint = edge.color;
        const origin = edge.at;
        const x0 = surface.rimSx[origin];
        const y0 = surface.rimSy[origin];
        const second = Math.min(2, edge.count - 1);
        const wind = (surface.rimSx[origin + 1] - x0) * (surface.rimSy[origin + second] - y0) - (surface.rimSx[origin + second] - x0) * (surface.rimSy[origin + 1] - y0);
        begin(paint, wind);
        ctx.moveTo(x0, y0);
        for (let vertex = 1; vertex < edge.count; vertex++) ctx.lineTo(surface.rimSx[origin + vertex], surface.rimSy[origin + vertex]);
      } else {
        const n = surface.n;
        const cell = cells[slot];
        const row = Math.floor(cell / (n - 1));
        const first = row * n + (cell - row * (n - 1));
        const { sx, sy, depth } = surface;
        const i1 = first + 1;
        const i2 = first + n + 1;
        const i3 = first + n;
        if (!(depth[first] > 0) || !(depth[i1] > 0) || !(depth[i2] > 0) || !(depth[i3] > 0)) continue;
        const paint = surface.colors[cell];
        const x0 = sx[first];
        const y0 = sy[first];
        const x1 = sx[i1];
        const y1 = sy[i1];
        const x2 = sx[i2];
        const y2 = sy[i2];
        const wind = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        begin(paint, wind);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(sx[i3], sy[i3]);
      }
      ctx.closePath();
    }
    flush();
    ctx.restore();
    // Whatever is nearer than every cell goes on last.
    drawFartherThan(-Infinity);
  }

  // Nothing where the cells have closed up, full ink by the far side of the
  // range. Past either end the gradient keeps that colour, so the near ground
  // stays solid and the far tips stay blank.
  floorFadeStyle(ctx, red, green, blue, alpha, vanishSy, solidSy) {
    const ink = (amount) => `rgba(${red}, ${green}, ${blue}, ${amount})`;
    if (typeof vanishSy !== "number" || typeof solidSy !== "number" || Math.abs(vanishSy - solidSy) < 12) {
      return ink(alpha);
    }
    const gradient = ctx.createLinearGradient(0, vanishSy, 0, solidSy);
    gradient.addColorStop(0, ink(0));
    gradient.addColorStop(0.22, ink(alpha * 0.12));
    gradient.addColorStop(0.62, ink(alpha * 0.72));
    gradient.addColorStop(1, ink(alpha));
    return gradient;
  }

  drawFloor(ctx, dpr, ghost) {
    const lines = this.floorLines();
    if (!lines.length) return;
    ctx.save();
    // The pass over the surface is a whisper: enough to read the floor
    // through it, never enough to wash the colour out.
    const [red, green, blue] = cssRgb(themeVar("--muted", "#78716c"));
    // Pieces of the same shade go down in one path: translucent strokes that
    // cross inside a single path do not darken each other, so a crossing keeps
    // the colour of the lines that meet there. Butt ends let the pieces of one
    // line meet without a bead where the shade changes.
    ctx.lineCap = "butt";
    const shades = new Map();
    for (const line of lines) {
      if (ghost && (line.width || 1) < 1.2) continue;
      const a = this.projectLocal(line.p[0]);
      const b = this.projectLocal(line.p[1]);
      if (!a || !b) continue;
      const raw = ghost ? Math.min(0.12, line.fade * 0.2) : line.fade * FLOOR_INK;
      const alpha = Math.max(0.01, Math.round(raw * 100) / 100);
      const width = Math.max(1, (ghost ? 1 : line.width || 1) * dpr);
      const vanish = line.flat ? "flat" : Math.round(line.vanish);
      const solid = line.flat ? "flat" : Math.round(line.solid);
      const key = `${alpha}|${width}|${vanish}|${solid}`;
      let shade = shades.get(key);
      if (!shade) shades.set(key, (shade = { alpha, width, vanish, solid, path: new Path2D() }));
      shade.path.moveTo(a.sx, a.sy);
      shade.path.lineTo(b.sx, b.sy);
    }
    for (const shade of shades.values()) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = shade.width;
      ctx.strokeStyle = this.floorFadeStyle(ctx, red, green, blue, shade.alpha, shade.vanish, shade.solid);
      ctx.stroke(shade.path);
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
    const { x0, x1, y0, y1 } = this.meshDomain();
    const x = x0 + (i / (n - 1)) * (x1 - x0);
    const y = y0 + (j / (n - 1)) * (y1 - y0);
    return {
      x: this.worldToFloorX(x),
      y: this.worldToFloorY(y),
      z: this.zToLocal(rawZ),
    };
  }

  // Half the height of the box in its own units: what floorScale is to the
  // ground. The drawn box is a cube whatever numbers the axes carry, so asking
  // for a taller z range spreads the height ticks instead of raising a spike.
  heightScale() {
    const { zMin, zMax } = this.view;
    return Math.max((zMax - zMin) / 2, 1e-9);
  }

  // One cell of height, the match to floorStep on the ground.
  heightStep() {
    const { zMin, zMax } = this.view;
    return (zMax - zMin) / FLOOR_CELLS;
  }

  zToLocal(rawZ) {
    const { zMin, zMax } = this.view;
    const middle = (zMin + zMax) / 2;
    return (clamp(rawZ, zMin, zMax) - middle) / this.heightScale();
  }

  // The same mapping without the limits, for working out how a cell leans
  // even where the drawing of it stops at the ceiling.
  zToLocalFree(rawZ) {
    const { zMin, zMax } = this.view;
    return (rawZ - (zMin + zMax) / 2) / this.heightScale();
  }

  shadeColor(rgb, light) {
    // The surface keeps the colour it was given; light only shapes it.
    const lit = clamp(light, 0.45, 1);
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
      color: this.shadeColor(rgb, 0.62 + 0.38 * light),
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
    const { xMin, xMax, yMin, yMax } = this.drawn;
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

  // The axes are cut into short pieces, each with its own depth, so they can
  // go into the surface's back-to-front order: a sheet that passes in front of
  // an axis covers it, and an axis that runs through a bowl disappears inside.
  // Only the X, Y and Z letters, which sit past the drawing, stay on top.
  axisPieces(dpr) {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const origin = this.axisAnchor();
    // An axis that stops dead on the face of the box reads as a short stub,
    // because the corners of the box reach half again as far. Each one carries
    // on past the drawing by the same share of its own half-length, which is
    // measured in the units of the box, so it grows and shrinks with it.
    const xLow = this.worldToFloorX(xMin) * AXIS_OVERHANG;
    const xHigh = this.worldToFloorX(xMax) * AXIS_OVERHANG;
    const yLow = this.worldToFloorY(yMin) * AXIS_OVERHANG;
    const yHigh = this.worldToFloorY(yMax) * AXIS_OVERHANG;
    const zLow = this.zToLocal(zMin) * AXIS_OVERHANG;
    const zHigh = this.zToLocal(zMax) * AXIS_OVERHANG;
    const axes = [
      {
        key: "x",
        from: { x: xLow, y: origin.y, z: origin.z },
        to: { x: xHigh, y: origin.y, z: origin.z },
        color: this.axes.x.color,
        label: "X",
        visible: this.axes.x.visible,
      },
      {
        key: "y",
        from: { x: origin.x, y: yLow, z: origin.z },
        to: { x: origin.x, y: yHigh, z: origin.z },
        color: this.axes.y.color,
        label: "Y",
        visible: this.axes.y.visible,
      },
      {
        key: "z",
        from: { x: origin.x, y: origin.y, z: zLow },
        to: { x: origin.x, y: origin.y, z: zHigh },
        color: this.axes.z.color,
        label: "Z",
        visible: this.axes.z.visible,
      },
    ];
    const pieces = [];
    const letters = [];
    const margin = 14 * dpr;
    const width = AXIS_LINE_WIDTH * dpr;
    for (const axis of axes) {
      if (!axis.visible) continue;
      const a = this.projectLocal(axis.from);
      const b = this.projectLocal(axis.to);
      if (!a || !b) continue;
      const along = (t) =>
        this.projectLocal({
          x: axis.from.x + (axis.to.x - axis.from.x) * t,
          y: axis.from.y + (axis.to.y - axis.from.y) * t,
          z: axis.from.z + (axis.to.z - axis.from.z) * t,
        });
      let previous = a;
      for (let step = 1; step <= AXIS_PIECES; step++) {
        const next = step === AXIS_PIECES ? b : along(step / AXIS_PIECES);
        if (previous && next) {
          pieces.push({ depth: (previous.depth + next.depth) / 2, line: [previous.sx, previous.sy, next.sx, next.sy], color: axis.color, width });
        }
        previous = next;
      }
      // The line runs on past this end, so the letter stands beside it
      // rather than further along, where it would sit on the stroke.
      const half = 8 * dpr;
      const spot = this.settleAxisLetter(b.sx, b.sy, this.axisLabelNormal(axis.key), half, dpr, margin);
      letters.push({ text: axis.label, color: axis.color, x: spot.x, y: spot.y });
    }
    // The numbers give way to the letters, never the other way round.
    if (this.showAxisValues) this.axisValuePieces(dpr, letters, pieces);
    const bias = AXIS_DEPTH_BIAS * (xHigh - xLow + yHigh - yLow) / (2 * AXIS_OVERHANG);
    for (const piece of pieces) piece.depth -= bias;
    pieces.sort((one, two) => two.depth - one.depth);
    return { pieces, letters };
  }

  // A unit screen normal that leaves the axis. The side is the one that still
  // reads as "beside" when the camera looks along the axis: up off the floor
  // for X and Y, out to the side for Z, with a second choice when that
  // direction is edge-on.
  axisLabelNormal(axis) {
    const origin = this.axisAnchor();
    const along = axis === "x"
      ? { x: origin.x + 1, y: origin.y, z: origin.z }
      : axis === "y"
        ? { x: origin.x, y: origin.y + 1, z: origin.z }
        : { x: origin.x, y: origin.y, z: origin.z + 1 };
    const here = this.projectLocal(origin);
    const there = this.projectLocal(along);
    const dx = here && there ? there.sx - here.sx : 1;
    const dy = here && there ? there.sy - here.sy : 0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    let nx = -uy;
    let ny = ux;
    if (!here) return { nx, ny };
    const lift = 0.45;
    const preferences = axis === "x"
      ? [
          { x: origin.x, y: origin.y, z: origin.z + lift },
          { x: origin.x, y: origin.y - lift, z: origin.z },
        ]
      : axis === "y"
        ? [
            { x: origin.x, y: origin.y, z: origin.z + lift },
            { x: origin.x - lift, y: origin.y, z: origin.z },
          ]
        : [
            { x: origin.x + lift, y: origin.y, z: origin.z },
            { x: origin.x, y: origin.y - lift, z: origin.z },
          ];
    let best = 0;
    for (const pref of preferences) {
      const side = this.projectLocal(pref);
      if (!side) continue;
      let px = side.sx - here.sx;
      let py = side.sy - here.sy;
      const alongPx = px * ux + py * uy;
      px -= alongPx * ux;
      py -= alongPx * uy;
      const plen = Math.hypot(px, py);
      if (plen > best) {
        best = plen;
        nx = px / plen;
        ny = py / plen;
      }
    }
    return { nx, ny };
  }

  // Centre of a label whose glyphs clear the stroke. wide and tall are the
  // half-size of the text. The other side is used when the first one leaves
  // the window, so the clamp never has to pull the text back onto the line.
  placeAxisLabel(sx, sy, normal, wide, tall, dpr) {
    const pad = 8 * dpr;
    const gap = wide * Math.abs(normal.nx) + tall * Math.abs(normal.ny) + pad;
    const margin = 4;
    const maxX = this.canvas.width - margin;
    const maxY = this.canvas.height - margin;
    const fits = (x, y) => x >= margin && x <= maxX && y >= margin && y <= maxY;
    const spot = (sign) => ({ x: sx + sign * normal.nx * gap, y: sy + sign * normal.ny * gap });
    const first = spot(1);
    if (fits(first.x, first.y)) return first;
    const second = spot(-1);
    if (fits(second.x, second.y)) return second;
    return first;
  }

  // The three axis lines on the screen, or whichever of them still shows.
  axisScreenLines() {
    const origin = this.axisAnchor();
    const here = this.projectLocal(origin);
    if (!here) return [];
    const lines = [];
    const axes = [
      ["x", { x: origin.x + 1, y: origin.y, z: origin.z }],
      ["y", { x: origin.x, y: origin.y + 1, z: origin.z }],
      ["z", { x: origin.x, y: origin.y, z: origin.z + 1 }],
    ];
    for (const [key, there] of axes) {
      if (!this.axes[key].visible) continue;
      const tip = this.projectLocal(there);
      if (!tip) continue;
      const dx = tip.sx - here.sx;
      const dy = tip.sy - here.sy;
      if (Math.hypot(dx, dy) < 1) continue;
      lines.push({ x: here.sx, y: here.sy, dx, dy });
    }
    return lines;
  }

  distanceToAxis(x, y, line) {
    const len = Math.hypot(line.dx, line.dy) || 1;
    return Math.abs((x - line.x) * line.dy - (y - line.y) * line.dx) / len;
  }

  // True when the glyph box around (x, y) misses every axis stroke.
  labelClearsAxes(x, y, wide, tall, dpr, lines) {
    const pad = 3 * dpr;
    for (const line of lines) {
      const len = Math.hypot(line.dx, line.dy) || 1;
      const nx = -line.dy / len;
      const ny = line.dx / len;
      const need = wide * Math.abs(nx) + tall * Math.abs(ny) + pad;
      const dist = this.distanceToAxis(x, y, line);
      if (dist + 0.75 < need) return false;
    }
    return true;
  }

  // Keep the letter off the stroke even when the window edge pushes it back.
  settleAxisLetter(sx, sy, normal, half, dpr, margin) {
    const lines = this.axisScreenLines();
    const clamp = (spot) => ({
      x: Math.min(this.canvas.width - margin, Math.max(margin, spot.x)),
      y: Math.min(this.canvas.height - margin, Math.max(margin, spot.y)),
    });
    const sides = [normal, { nx: -normal.nx, ny: -normal.ny }];
    let fallback = null;
    for (const side of sides) {
      const spot = clamp(this.placeAxisLabel(sx, sy, side, half, half, dpr));
      if (!fallback) fallback = spot;
      if (this.labelClearsAxes(spot.x, spot.y, half, half, dpr, lines)) return spot;
    }
    return fallback;
  }

  // The part of each axis past the graph. The length sets where the graph
  // stops; these lines do not, and they fade as they leave the window.
  axisRays() {
    const origin = this.axisAnchor();
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const far = AXIS_RAY;
    const rays = [];
    const push = (color, from, to) => {
      const clipped = this.clipFloorSegment(from, to, 400);
      if (!clipped) return;
      const span = Math.hypot(
        clipped[1].x - clipped[0].x,
        clipped[1].y - clipped[0].y,
        clipped[1].z - clipped[0].z
      );
      if (!(span > 0.04)) return;
      rays.push({ color, from: clipped[0], to: clipped[1] });
    };
    if (this.axes.x.visible) {
      const xLow = this.worldToFloorX(xMin) * AXIS_OVERHANG;
      const xHigh = this.worldToFloorX(xMax) * AXIS_OVERHANG;
      push(this.axes.x.color, { x: xHigh, y: origin.y, z: origin.z }, { x: far, y: origin.y, z: origin.z });
      push(this.axes.x.color, { x: xLow, y: origin.y, z: origin.z }, { x: -far, y: origin.y, z: origin.z });
    }
    if (this.axes.y.visible) {
      const yLow = this.worldToFloorY(yMin) * AXIS_OVERHANG;
      const yHigh = this.worldToFloorY(yMax) * AXIS_OVERHANG;
      push(this.axes.y.color, { x: origin.x, y: yHigh, z: origin.z }, { x: origin.x, y: far, z: origin.z });
      push(this.axes.y.color, { x: origin.x, y: yLow, z: origin.z }, { x: origin.x, y: -far, z: origin.z });
    }
    if (this.axes.z.visible) {
      const zLow = this.zToLocal(zMin) * AXIS_OVERHANG;
      const zHigh = this.zToLocal(zMax) * AXIS_OVERHANG;
      push(this.axes.z.color, { x: origin.x, y: origin.y, z: zHigh }, { x: origin.x, y: origin.y, z: far });
      push(this.axes.z.color, { x: origin.x, y: origin.y, z: zLow }, { x: origin.x, y: origin.y, z: -far });
    }
    return rays;
  }

  drawAxisRays(ctx, dpr) {
    const rays = this.axisRays();
    if (!rays.length) return;
    ctx.save();
    ctx.lineCap = "butt";
    ctx.lineWidth = Math.max(1, AXIS_LINE_WIDTH * dpr);
    for (const ray of rays) {
      const a = this.projectLocal(ray.from);
      const b = this.projectLocal(ray.to);
      if (!a || !b) continue;
      if (Math.hypot(a.sx - b.sx, a.sy - b.sy) < 2) continue;
      const [red, green, blue] = hexToRgb(ray.color);
      const ink = (alpha) => `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      const shade = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
      const solid = AXIS_LINE_ALPHA;
      shade.addColorStop(0, ink(solid));
      shade.addColorStop(0.62, ink(solid * 0.9));
      shade.addColorStop(1, ink(0));
      ctx.strokeStyle = shade;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Axis lines and numbers are drawn lighter than the curves: they are the
  // ruler, not the subject, and a full-strength line reads as part of the shape.
  drawAxisPiece(ctx, piece) {
    ctx.save();
    ctx.globalAlpha = piece.text ? AXIS_TEXT_ALPHA : AXIS_LINE_ALPHA;
    if (piece.text) {
      ctx.font = piece.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = piece.color;
      ctx.fillText(piece.text, piece.x, piece.y);
    } else {
      // Butt ends, so neighbouring pieces of one axis meet without a darker bead.
      ctx.lineCap = "butt";
      ctx.lineWidth = piece.width;
      ctx.strokeStyle = piece.color;
      ctx.beginPath();
      ctx.moveTo(piece.line[0], piece.line[1]);
      ctx.lineTo(piece.line[2], piece.line[3]);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAxisLetters(ctx, dpr, letters) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // One size for the letters however far the camera stands.
    ctx.font = `700 ${13 * dpr}px Consolas, "Malgun Gothic", sans-serif`;
    for (const letter of letters) {
      ctx.fillStyle = letter.color;
      ctx.fillText(letter.text, letter.x, letter.y);
    }
    ctx.restore();
  }

  axisValuePieces(dpr, reserved, pieces) {
    const placed = reserved.map((spot) => ({ x: spot.x, y: spot.y }));
    const width = this.canvas.width;
    const height = this.canvas.height;
    const font = `600 ${11 * dpr}px Consolas, "Malgun Gothic", sans-serif`;
    const tickWidth = Math.max(1, dpr);
    const lines = this.axisScreenLines();
    const label = (text, point, normal, color) => {
      if (!point) return;
      // Half the width of the text, so a wider number still clears the stroke.
      const wide = Math.max(7 * dpr, text.length * 3.4 * dpr);
      const tall = 6 * dpr;
      const pad = 8 * dpr;
      const gap = wide * Math.abs(normal.nx) + tall * Math.abs(normal.ny) + pad;
      // The preferred side first. The other side is used when that one sits on
      // a crossing axis or on a letter.
      for (const sign of [1, -1]) {
        const x = point.sx + sign * normal.nx * gap;
        const y = point.sy + sign * normal.ny * gap;
        if (x < 4 || x > width - 4 || y < 4 || y > height - 4) continue;
        if (lines.some((line) => this.distanceToAxis(x, y, line) < 8 * dpr)) continue;
        if (placed.some((item) => Math.hypot(item.x - x, item.y - y) < 18 * dpr)) continue;
        placed.push({ x, y });
        pieces.push({ depth: point.depth, text, x, y, color, font });
        return;
      }
    };
    const tick = (point, end, color) => {
      if (point && end) pieces.push({ depth: (point.depth + end.depth) / 2, line: [point.sx, point.sy, end.sx, end.sy], color, width: tickWidth });
    };
    const origin = this.axisAnchor();
    const step = this.floorStep();
    const { xMin, xMax, yMin, yMax, zMin, zMax } = this.view;
    const xNormal = this.axisLabelNormal("x");
    const yNormal = this.axisLabelNormal("y");
    const zNormal = this.axisLabelNormal("z");
    if (this.axes.x.visible) {
      for (const value of this.multiples(xMin, xMax, step)) {
        const local = { x: this.worldToFloorX(value), y: origin.y, z: origin.z };
        const point = this.projectLocal(local);
        tick(point, this.projectLocal({ x: local.x, y: origin.y, z: origin.z + 0.05 }), this.axes.x.color);
        label(formatTick(value), point, xNormal, this.axes.x.color);
      }
    }
    if (this.axes.y.visible) {
      for (const value of this.multiples(yMin, yMax, step)) {
        const local = { x: origin.x, y: this.worldToFloorY(value), z: origin.z };
        const point = this.projectLocal(local);
        tick(point, this.projectLocal({ x: origin.x, y: local.y, z: origin.z + 0.05 }), this.axes.y.color);
        label(formatTick(value), point, yNormal, this.axes.y.color);
      }
    }
    if (!this.axes.z.visible) return;
    const middleZ = (zMin + zMax) / 2;
    // Height ticks stop at the limits, because the drawing stops there too,
    // and they are counted off the height, not off the width of the ground.
    for (const value of this.multiples(zMin, zMax, this.heightStep())) {
      const local = { x: origin.x, y: origin.y, z: (value - middleZ) / this.heightScale() };
      const point = this.projectLocal(local);
      tick(point, this.projectLocal({ x: origin.x + 0.05, y: origin.y, z: local.z }), this.axes.z.color);
      label(formatTick(value), point, zNormal, this.axes.z.color);
    }
  }
}
