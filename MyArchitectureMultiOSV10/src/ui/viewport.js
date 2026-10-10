// A pan/zoom canvas shared by the schematic and PCB editors.
//
// World units are whatever the editor uses (mils or mm). screen = world *
// scale + offset. The viewport owns device-pixel-ratio handling, the grid,
// wheel zoom about the cursor, middle/right-drag panning and touch pinch.
// Editors hook in through callbacks and draw in world space.

export class Viewport {
  constructor(canvas, { unitLabel = "", minScale = 0.001, maxScale = 2000, onRender, onPointer, onViewChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.unitLabel = unitLabel;
    this.onRender = onRender;
    this.onPointer = onPointer;
    this.onViewChange = onViewChange;
    this.dpr = 1;
    this.pending = false;
    this.mouse = { x: 0, y: 0, wx: 0, wy: 0, inside: false };
    this.panning = null;
    this.touches = new Map();
    this.spaceDown = false;
    // Hand mode: a plain left-drag pans (toolbar "Pan" button).
    this.panMode = false;
    this.zoomSpeed = 1;
    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
    this.resize();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (e.ctrlKey || !e.shiftKey) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas.
        const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (this.zoomSpeed || 1));
        this.zoomAt(sx, sy, k);
      } else {
        this.ox -= e.deltaY;
        this.request();
      }
    }, { passive: false });
    c.addEventListener("pointerdown", (e) => {
      // Synthetic events (the tutorial player, tests) have no active pointer to capture.
      try { c.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
      if (e.pointerType === "touch") {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) { this.pinch = this.pinchState(); return; }
      }
      if (e.button === 1 || e.button === 2 && e.altKey || (e.button === 0 && (this.spaceDown || this.panMode))) {
        this.startPan(e);
        e.preventDefault();
        return;
      }
      if (e.button === 2) {
        // Right drag pans; a right click without movement is a context menu.
        this.panning = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: false, right: true, event: e };
        return;
      }
      this.emit("down", e);
    });
    c.addEventListener("pointermove", (e) => {
      if (this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch && this.touches.size === 2) {
          const now = this.pinchState();
          const r = c.getBoundingClientRect();
          this.zoomAt(now.cx - r.left, now.cy - r.top, now.d / this.pinch.d);
          this.ox += now.cx - this.pinch.cx;
          this.oy += now.cy - this.pinch.cy;
          this.pinch = now;
          this.request();
          return;
        }
      }
      if (this.panning) {
        const dx = e.clientX - this.panning.x;
        const dy = e.clientY - this.panning.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.panning.moved = true;
        if (this.panning.moved) {
          c.style.cursor = "grabbing";
          this.ox = this.panning.ox + dx;
          this.oy = this.panning.oy + dy;
          this.request();
        }
        this.updateMouse(e);
        return;
      }
      this.updateMouse(e);
      this.emit("move", e);
    });
    const up = (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      if (this.panning) {
        const p = this.panning;
        this.panning = null;
        c.style.cursor = this.panMode ? "grab" : "";
        if (p.right && !p.moved) this.emit("context", p.event);
        this.notifyView();
        return;
      }
      this.emit("up", e);
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("dblclick", (e) => this.emit("dblclick", e));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerenter", () => { this.mouse.inside = true; });
    c.addEventListener("pointerleave", () => { this.mouse.inside = false; this.emit("leave", null); });
  }

  // Begin a pan drag from a pointer event (editors call this for a left-drag
  // on empty canvas when that is set to pan).
  startPan(e) {
    this.panning = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: false };
    this.canvas.style.cursor = "grabbing";
  }

  setPanMode(on) {
    this.panMode = !!on;
    this.canvas.style.cursor = this.panMode ? "grab" : "";
  }

  pinchState() {
    const [a, b] = [...this.touches.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  updateMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    const [wx, wy] = this.toWorld(this.mouse.x, this.mouse.y);
    this.mouse.wx = wx;
    this.mouse.wy = wy;
  }

  emit(type, e) {
    if (!this.onPointer) return;
    if (e) this.updateMouse(e);
    this.onPointer(type, e, this.mouse);
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.dpr = window.devicePixelRatio || 1;
    // Keep whatever was in the middle of the view in the middle after a resize
    // (panels opening/closing, window resize).
    if (this.width && this.height && (this.width !== w || this.height !== h)) {
      this.ox += (w - this.width) / 2;
      this.oy += (h - this.height) / 2;
    }
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.renderNow();
  }

  toWorld(sx, sy) {
    return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale];
  }

  toScreen(wx, wy) {
    return [wx * this.scale + this.ox, wy * this.scale + this.oy];
  }

  zoomAt(sx, sy, k) {
    const ns = Math.min(this.maxScale, Math.max(this.minScale, this.scale * k));
    const kk = ns / this.scale;
    this.ox = sx - (sx - this.ox) * kk;
    this.oy = sy - (sy - this.oy) * kk;
    this.scale = ns;
    this.request();
    this.notifyView();
  }

  zoomBy(k) {
    this.zoomAt(this.width / 2, this.height / 2, k);
  }

  // Frame a world rectangle with a margin (fraction of the view).
  fit(b, margin = 0.08) {
    if (!b || !Number.isFinite(b.x1)) return;
    // The layout may have changed since the last ResizeObserver callback.
    const parent = this.canvas.parentElement || this.canvas;
    if (parent.clientWidth && (parent.clientWidth !== this.width || parent.clientHeight !== this.height)) this.resize();
    const bw = Math.max(1e-6, b.x2 - b.x1);
    const bh = Math.max(1e-6, b.y2 - b.y1);
    const s = Math.min((this.width * (1 - margin * 2)) / bw, (this.height * (1 - margin * 2)) / bh);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, s));
    this.ox = this.width / 2 - ((b.x1 + b.x2) / 2) * this.scale;
    this.oy = this.height / 2 - ((b.y1 + b.y2) / 2) * this.scale;
    this.request();
    this.notifyView();
  }

  centerOn(wx, wy) {
    this.ox = this.width / 2 - wx * this.scale;
    this.oy = this.height / 2 - wy * this.scale;
    this.request();
    this.notifyView();
  }

  visibleWorld() {
    const [x1, y1] = this.toWorld(0, 0);
    const [x2, y2] = this.toWorld(this.width, this.height);
    return { x1, y1, x2, y2 };
  }

  notifyView() {
    if (this.onViewChange) this.onViewChange(this);
  }

  request() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.renderNow();
    });
  }

  renderNow() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.onRender) this.onRender(ctx, this);
  }

  // Put the context into world space.
  worldTransform(ctx = this.ctx) {
    ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.ox * this.dpr, this.oy * this.dpr);
  }

  screenTransform(ctx = this.ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // The displayed grid cell: the snap grid times a power of 5, chosen so a
  // cell is always 10–50 px on screen. Zooming steps by ×5, so the 5×5 block
  // pattern keeps an even spacing at every zoom level.
  gridCell(step, { min = 10 } = {}) {
    let s = step;
    let guard = 0;
    while (s * this.scale < min && guard++ < 40) s *= 5;
    while (s * this.scale >= min * 5 && guard++ < 80) s /= 5;
    return s;
  }

  // Grid of lines (a bold line every `major` cells) or dots. step in world units.
  drawGrid(ctx, step, color, { style = "lines", major = 5, majorColor } = {}) {
    const s = this.gridCell(step);
    const v = this.visibleWorld();
    this.screenTransform(ctx);
    const x0 = Math.floor(v.x1 / s) * s;
    const y0 = Math.floor(v.y1 / s) * s;
    const isMajor = (w) => Math.abs(Math.round(w / s)) % major === 0;
    if (style === "lines") {
      ctx.lineWidth = 1;
      for (const pass of [false, true]) {
        ctx.beginPath();
        for (let x = x0; x <= v.x2; x += s) {
          if (isMajor(x) !== pass) continue;
          const sx = Math.round(x * this.scale + this.ox) + 0.5;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, this.height);
        }
        for (let y = y0; y <= v.y2; y += s) {
          if (isMajor(y) !== pass) continue;
          const sy = Math.round(y * this.scale + this.oy) + 0.5;
          ctx.moveTo(0, sy);
          ctx.lineTo(this.width, sy);
        }
        ctx.strokeStyle = pass ? majorColor || color : color;
        ctx.globalAlpha = pass ? 1 : 0.55;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = color;
      for (let x = x0; x <= v.x2; x += s) {
        const sx = Math.round(x * this.scale + this.ox);
        for (let y = y0; y <= v.y2; y += s) {
          const sy = Math.round(y * this.scale + this.oy);
          if (isMajor(x) && isMajor(y)) {
            ctx.fillStyle = majorColor;
            ctx.fillRect(sx - 1, sy - 1, 2, 2);
            ctx.fillStyle = color;
          } else ctx.fillRect(sx, sy, 1, 1);
        }
      }
    }
    return s;
  }

  // Rulers along the top and left edges, in display units.
  // toDisplay converts a world length to display units; unit is its label.
  drawRulers(ctx, { toDisplay = (v) => v, unit = "", bg = "#202430", fg = "#c8ccd4", accent = "#ff9f43" } = {}) {
    const R = 20;
    this.screenTransform(ctx);
    const per = toDisplay(1); // display units per world unit
    const pxPerDisp = this.scale / per;
    // Nice label step: 1-2-5 sequence, about 70 px apart.
    let step = 1;
    const want = 70 / pxPerDisp;
    const p10 = Math.pow(10, Math.floor(Math.log10(want)));
    for (const m of [1, 2, 5, 10]) { step = m * p10; if (step >= want) break; }
    const minor = step / 5;
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, R);
    ctx.fillRect(0, 0, R, this.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 1;
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const v = this.visibleWorld();
    ctx.beginPath();
    // Top ruler (x)
    const xd0 = Math.floor((v.x1 * per) / minor) * minor;
    for (let d = xd0; d <= v.x2 * per; d += minor) {
      const sx = Math.round((d / per) * this.scale + this.ox) + 0.5;
      if (sx < R) continue;
      const major = Math.abs(Math.round(d / step) * step - d) < minor / 2;
      ctx.moveTo(sx, R);
      ctx.lineTo(sx, major ? 4 : R - 5);
      if (major) ctx.fillText((Math.round(d / step) * step).toFixed(dec), sx + 2, 2);
    }
    // Left ruler (y)
    const yd0 = Math.floor((v.y1 * per) / minor) * minor;
    for (let d = yd0; d <= v.y2 * per; d += minor) {
      const sy = Math.round((d / per) * this.scale + this.oy) + 0.5;
      if (sy < R) continue;
      const major = Math.abs(Math.round(d / step) * step - d) < minor / 2;
      ctx.moveTo(R, sy);
      ctx.lineTo(major ? 4 : R - 5, sy);
      if (major) {
        ctx.save();
        ctx.translate(2, sy - 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText((Math.round(d / step) * step).toFixed(dec), 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, R + 0.5); ctx.lineTo(this.width, R + 0.5);
    ctx.moveTo(R + 0.5, 0); ctx.lineTo(R + 0.5, this.height);
    ctx.stroke();
    // Cursor markers
    if (this.mouse.inside) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.mouse.x, 0); ctx.lineTo(this.mouse.x, R);
      ctx.moveTo(0, this.mouse.y); ctx.lineTo(R, this.mouse.y);
      ctx.stroke();
    }
    // Corner: unit
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, R, R);
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 9px 'Segoe UI', sans-serif";
    ctx.fillText(unit, R / 2, R / 2);
    ctx.restore();
  }

  dispose() {
    this.ro.disconnect();
  }
}
