/* Canvas viewer: zoom / pan / rotate / flip of one rendered frame, mouse tools and measurements.
 *
 *   const v = Viewer.create({ viewport, canvas, overlay, on(event, payload) });
 *   v.setSource({ canvas, width, height, spacing: [row, col] | null, aspect })   // a rendered frame
 *   v.setTool('pan' | 'wl' | 'zoom' | 'stack' | 'probe' | 'length' | 'angle' | 'rect' | 'ellipse' | 'text')
 *   v.fit() · v.actual() · v.zoomBy(f, client?) · v.rotate(±90) · v.flip('h' | 'v') · v.reset()
 *   v.annotations (image-space) · v.deleteLast() · v.clear() · v.redraw()
 *   v.imageToClient(x, y) · v.clientToImage(cx, cy) · v.exportCanvas(burnAnnotations) → canvas
 *
 * Events: view { scale, rotation, flipH, flipV } · wl { dx, dy } (drag deltas in px) · stack { delta } ·
 *         hover { x, y } | null · measure { annotation, done } · text { x, y } · context { clientX, clientY } ·
 *         zoomdrag { dy }
 */
window.Viewer = (function () {
  const HANDLE_R = 6;
  const DEFAULT_COLORS = { line: '#ffd400', active: '#4ade80', text: '#ffffff', shadow: 'rgba(0,0,0,0.75)' };

  function create(opts) {
    const { viewport, canvas, overlay } = opts;
    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    const emit = (ev, payload) => opts.on && opts.on(ev, payload);

    const view = { scale: 1, tx: 0, ty: 0, rotation: 0, flipH: false, flipV: false };
    let source = null;      // { canvas, width, height, spacing, aspect }
    let tool = 'pan';
    let interpolate = false;
    let showAnnotations = true;
    let dpr = window.devicePixelRatio || 1;
    let annotations = [];
    let drawing = null;     // annotation in progress
    let drag = null;        // { kind, start, last, ann, pointIndex, moved }
    let hoverPt = null;
    let fitScale = 1;
    let vw = 0, vh = 0;
    let wheelMode = 'zoom';   // 'zoom' | 'stack' — what a plain wheel does (Ctrl inverts it)
    let showRuler = false, showGrid = false;
    const COLORS = { ...DEFAULT_COLORS };

    /* ── Geometry ── */
    function matrix() {
      const m = new DOMMatrix();
      if (!source) return m;
      m.translateSelf(vw / 2 + view.tx, vh / 2 + view.ty);
      m.rotateSelf(view.rotation);
      m.scaleSelf(view.flipH ? -1 : 1, view.flipV ? -1 : 1);
      m.scaleSelf(view.scale, view.scale * (source.aspect || 1));
      m.translateSelf(-source.width / 2, -source.height / 2);
      return m;
    }
    function imageToClient(x, y) { const p = matrix().transformPoint(new DOMPoint(x, y)); return { x: p.x, y: p.y }; }
    function clientToImage(cx, cy) { const p = matrix().inverse().transformPoint(new DOMPoint(cx, cy)); return { x: p.x, y: p.y }; }
    function localPoint(e) { const r = viewport.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function inside(p) { return source && p.x >= 0 && p.y >= 0 && p.x < source.width && p.y < source.height; }

    function computeFit() {
      if (!source || !vw || !vh) return 1;
      const rot = ((view.rotation % 180) + 180) % 180 !== 0;
      const w = rot ? source.height * (source.aspect || 1) : source.width;
      const h = rot ? source.width : source.height * (source.aspect || 1);
      return Math.min((vw - 16) / w, (vh - 16) / h, 8) || 1;
    }

    /* ── Size ── */
    function resize() {
      const r = viewport.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      vw = Math.max(1, Math.round(r.width));
      vh = Math.max(1, Math.round(r.height));
      for (const c of [canvas, overlay]) {
        c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr);
        c.style.width = `${vw}px`; c.style.height = `${vh}px`;
      }
      const wasFit = Math.abs(view.scale - fitScale) < 1e-6;
      const prevScale = view.scale;
      fitScale = computeFit();
      if (wasFit) view.scale = fitScale;
      redraw();
      if (view.scale !== prevScale) emit('view', viewState());
    }
    const ro = new ResizeObserver(() => resize());
    ro.observe(viewport);

    /* ── Drawing ── */
    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (source) {
        const m = matrix();
        ctx.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, m.e * dpr, m.f * dpr);
        ctx.imageSmoothingEnabled = interpolate || view.scale < 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source.canvas, 0, 0);
      }
      drawOverlay();
    }

    function drawOverlay(target = octx, scaleOverride) {
      const c = target;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, vw, vh);
      if (!source) return;
      if (showAnnotations) {
        for (const a of annotations) drawAnnotation(c, a, false);
        if (drawing) drawAnnotation(c, drawing, true);
      }
      if (showGrid) drawGrid(c);
      if (showRuler) drawRuler(c);
      if (hoverPt && (tool === 'probe') && inside(hoverPt)) {
        const p = imageToClient(Math.floor(hoverPt.x) + 0.5, Math.floor(hoverPt.y) + 0.5);
        c.strokeStyle = COLORS.active; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x - 12, p.y); c.lineTo(p.x - 4, p.y); c.moveTo(p.x + 4, p.y); c.lineTo(p.x + 12, p.y);
        c.moveTo(p.x, p.y - 12); c.lineTo(p.x, p.y - 4); c.moveTo(p.x, p.y + 4); c.lineTo(p.x, p.y + 12); c.stroke();
      }
      void scaleOverride;
    }

    /* Grid in image space (10 mm cells when the pixel spacing is known, else 50 px), so it follows rotation / flip. */
    function drawGrid(c) {
      const sp = source.spacing;
      let stepX = sp ? 10 / sp[1] : 50, stepY = sp ? 10 / sp[0] : 50;
      const screenStep = () => Math.min(stepX, stepY) * view.scale;
      while (screenStep() < 12) { stepX *= 2; stepY *= 2; }   // never denser than 12 px on screen
      c.save();
      c.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= source.width + 1e-6; x += stepX) { const a = imageToClient(x, 0), b = imageToClient(x, source.height); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      for (let y = 0; y <= source.height + 1e-6; y += stepY) { const a = imageToClient(0, y), b = imageToClient(source.width, y); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      c.stroke();
      c.restore();
    }

    /* Scale ruler (bottom centre + left centre): a round length in mm (or px) that spans 80–220 screen px. */
    function drawRuler(c) {
      const sp = source.spacing;
      const draw = (horizontal) => {
        const pxPerUnit = sp ? view.scale / (horizontal ? sp[1] : sp[0]) : view.scale;   // screen px per mm (or per image px)
        const steps = sp ? [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500] : [5, 10, 20, 50, 100, 200, 500, 1000];
        let len = steps[0];
        for (const s of steps) { if (s * pxPerUnit <= 220) len = s; }
        const px = len * pxPerUnit;
        const text = sp ? `${len} mm` : `${len} px`;
        c.save();
        c.strokeStyle = '#facc15'; c.fillStyle = '#facc15'; c.lineWidth = 2; c.font = '12px "Segoe UI", system-ui, sans-serif';
        c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 3;
        if (horizontal) {
          const x0 = (vw - px) / 2, y = vh - 34;
          c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + px, y); c.moveTo(x0, y - 6); c.lineTo(x0, y + 6); c.moveTo(x0 + px, y - 6); c.lineTo(x0 + px, y + 6);
          const ticks = len >= 10 ? 10 : len >= 2 ? len * 2 : 5;
          for (let i = 1; i < ticks; i++) { const tx = x0 + px * i / ticks; c.moveTo(tx, y - 3); c.lineTo(tx, y + 3); }
          c.stroke();
          c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(text, x0 + px / 2, y - 8);
        } else {
          const y0 = (vh - px) / 2, x = 36;
          c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + px); c.moveTo(x - 6, y0); c.lineTo(x + 6, y0); c.moveTo(x - 6, y0 + px); c.lineTo(x + 6, y0 + px);
          const ticks = len >= 10 ? 10 : len >= 2 ? len * 2 : 5;
          for (let i = 1; i < ticks; i++) { const ty = y0 + px * i / ticks; c.moveTo(x - 3, ty); c.lineTo(x + 3, ty); }
          c.stroke();
          c.save(); c.translate(x + 10, y0 + px / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(text, 0, 0); c.restore();
        }
        c.restore();
      };
      draw(true);
      draw(false);
    }

    function label(c, text, x, y, align = 'left') {
      if (!text) return;
      const lines = String(text).split('\n');
      c.font = '12px "Segoe UI", system-ui, sans-serif';
      c.textBaseline = 'top';
      c.textAlign = align;
      const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 8;
      const h = lines.length * 15 + 4;
      const bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      c.fillStyle = COLORS.shadow;
      c.fillRect(bx, y, w, h);
      c.fillStyle = COLORS.text;
      lines.forEach((l, i) => c.fillText(l, align === 'right' ? x - 4 : align === 'center' ? x : x + 4, y + 2 + i * 15));
    }

    function handle(c, p, active) {
      c.fillStyle = active ? COLORS.active : COLORS.line;
      c.beginPath(); c.arc(p.x, p.y, 3.5, 0, Math.PI * 2); c.fill();
    }

    function drawAnnotation(c, a, active) {
      const pts = a.points.map((p) => imageToClient(p.x, p.y));
      c.strokeStyle = active ? COLORS.active : (a.selected ? COLORS.active : COLORS.line);
      c.lineWidth = 1.5;
      c.setLineDash([]);
      if (a.type === 'length' && pts.length >= 2) {
        c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y); c.stroke();
        pts.forEach((p) => handle(c, p, active));
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        label(c, a.label, mid.x + 8, mid.y + 8);
      } else if (a.type === 'angle' && pts.length >= 2) {
        c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y);
        if (pts[2]) c.lineTo(pts[2].x, pts[2].y);
        c.stroke();
        pts.forEach((p) => handle(c, p, active));
        if (pts[2]) {
          const a1 = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x), a2 = Math.atan2(pts[2].y - pts[1].y, pts[2].x - pts[1].x);
          c.beginPath(); c.arc(pts[1].x, pts[1].y, 18, Math.min(a1, a2), Math.max(a1, a2), Math.abs(a1 - a2) > Math.PI); c.stroke();
          label(c, a.label, pts[1].x + 10, pts[1].y + 10);
        }
      } else if ((a.type === 'rect' || a.type === 'ellipse') && pts.length >= 2) {
        const p0 = a.points[0], p1 = a.points[1];
        const corners = [{ x: p0.x, y: p0.y }, { x: p1.x, y: p0.y }, { x: p1.x, y: p1.y }, { x: p0.x, y: p1.y }].map((p) => imageToClient(p.x, p.y));
        if (a.type === 'rect') {
          c.beginPath(); corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.stroke();
        } else {
          const m = matrix();
          c.save();
          c.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, m.e * dpr, m.f * dpr);
          c.beginPath();
          c.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2);
          c.restore();
          c.stroke();
        }
        [pts[0], pts[1]].forEach((p) => handle(c, p, active));
        const top = corners.reduce((m, p) => (p.y > m.y ? p : m), corners[0]);
        label(c, a.label, Math.min(...corners.map((p) => p.x)), top.y + 6);
      } else if (a.type === 'text' && pts.length >= 1) {
        handle(c, pts[0], active);
        label(c, a.text, pts[0].x + 8, pts[0].y - 8);
      }
    }

    /* ── Hit testing (annotation handles) ── */
    function hitHandle(local) {
      if (!showAnnotations) return null;
      for (let i = annotations.length - 1; i >= 0; i--) {
        const a = annotations[i];
        for (let k = 0; k < a.points.length; k++) {
          const p = imageToClient(a.points[k].x, a.points[k].y);
          if (Math.hypot(p.x - local.x, p.y - local.y) <= HANDLE_R + 2) return { ann: a, pointIndex: k };
        }
      }
      return null;
    }

    /* ── Mouse ── */
    function onDown(e) {
      if (!source) return;
      viewport.focus({ preventScroll: true });
      const local = localPoint(e);
      const img = clientToImage(local.x, local.y);
      if (e.button === 1) { e.preventDefault(); drag = { kind: 'pan', last: local }; return; }
      if (e.button === 2) { drag = { kind: 'wl-maybe', start: local, last: local, moved: false }; return; }
      if (e.button !== 0) return;
      const hit = hitHandle(local);
      if (hit) { drag = { kind: 'handle', ...hit, last: local }; annotations.forEach((a) => { a.selected = a === hit.ann; }); redraw(); return; }
      annotations.forEach((a) => { a.selected = false; });
      switch (tool) {
        case 'pan': drag = { kind: 'pan', last: local }; break;
        case 'wl': drag = { kind: 'wl', last: local }; break;
        case 'zoom': drag = { kind: 'zoom', last: local, anchor: local }; break;
        case 'stack': drag = { kind: 'stack', last: local, acc: 0 }; break;
        case 'probe': drag = { kind: 'probe' }; hoverPt = img; emit('hover', inside(img) ? img : null); redraw(); break;
        case 'length': case 'rect': case 'ellipse':
          drawing = { type: tool, points: [img, { ...img }], label: '' };
          drag = { kind: 'draw', last: local };
          break;
        case 'angle':
          if (drawing && drawing.type === 'angle') {
            drawing.points.push(img);
            if (drawing.points.length === 3) { const a = drawing; drawing = null; annotations.push(a); emit('measure', { annotation: a, done: true }); }
            else emit('measure', { annotation: drawing, done: false });
          } else {
            drawing = { type: 'angle', points: [img, { ...img }], label: '' };
            drag = { kind: 'draw-angle', last: local };
          }
          break;
        case 'text': emit('text', { x: img.x, y: img.y }); break;
        default: break;
      }
      redraw();
    }

    function onMove(e) {
      if (!source) return;
      const local = localPoint(e);
      const img = clientToImage(local.x, local.y);
      hoverPt = img;
      emit('hover', inside(img) ? img : null);
      if (!drag) {
        if (drawing && drawing.type === 'angle' && drawing.points.length === 2) { drawing.points[1] = img; drawOverlay(); }
        else if (tool === 'probe') drawOverlay();
        const hit = hitHandle(local);
        viewport.style.cursor = hit ? 'move' : cursorFor(tool);
        return;
      }
      const dx = local.x - drag.last.x, dy = local.y - drag.last.y;
      switch (drag.kind) {
        case 'pan': view.tx += dx; view.ty += dy; drag.last = local; redraw(); emit('view', viewState()); break;
        case 'wl-maybe':
          if (!drag.moved && Math.hypot(local.x - drag.start.x, local.y - drag.start.y) > 4) drag.moved = true;
          if (drag.moved) { emit('wl', { dx, dy }); drag.last = local; }
          break;
        case 'wl': emit('wl', { dx, dy }); drag.last = local; break;
        case 'zoom': { const f = Math.exp(-dy * 0.01); zoomBy(f, drag.anchor); drag.last = local; break; }
        case 'stack': {
          drag.acc += dy;
          const steps = Math.trunc(drag.acc / 6);
          if (steps) { emit('stack', { delta: steps }); drag.acc -= steps * 6; }
          drag.last = local;
          break;
        }
        case 'probe': drawOverlay(); break;
        case 'draw': drawing.points[1] = img; emit('measure', { annotation: drawing, done: false }); drawOverlay(); break;
        case 'draw-angle': drawing.points[1] = img; drawOverlay(); break;
        case 'handle': drag.ann.points[drag.pointIndex] = img; emit('measure', { annotation: drag.ann, done: false }); drawOverlay(); break;
        default: break;
      }
    }

    function onUp(e) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === 'wl-maybe' && !d.moved) { emit('context', { clientX: e.clientX, clientY: e.clientY }); return; }
      if (d.kind === 'draw') {
        const a = drawing; drawing = null;
        const p0 = a.points[0], p1 = a.points[1];
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) >= 1) { annotations.push(a); emit('measure', { annotation: a, done: true }); }
        redraw();
      } else if (d.kind === 'draw-angle') {
        // the second point is fixed on mouse up; the third arrives with the next click
        emit('measure', { annotation: drawing, done: false });
      } else if (d.kind === 'handle') {
        emit('measure', { annotation: d.ann, done: true });
        redraw();
      }
    }

    function onWheel(e) {
      if (!source) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const stackWheel = tool === 'stack' ? !e.ctrlKey : (wheelMode === 'stack') !== e.ctrlKey;
      if (stackWheel) { emit('stack', { delta: dir }); return; }
      zoomBy(dir > 0 ? 1 / 1.1 : 1.1, localPoint(e));
    }

    function cursorFor(t) {
      return { pan: 'grab', wl: 'ns-resize', zoom: 'zoom-in', stack: 'row-resize', probe: 'crosshair', text: 'text' }[t] || 'crosshair';
    }

    viewport.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());
    viewport.addEventListener('mouseleave', () => { hoverPt = null; emit('hover', null); if (tool === 'probe') drawOverlay(); });
    viewport.addEventListener('dblclick', (e) => { if (e.button === 0 && source && tool === 'pan') fit(); });

    /* ── Public view operations ── */
    function viewState() { return { scale: view.scale, rotation: view.rotation, flipH: view.flipH, flipV: view.flipV, fitScale }; }
    function fit() { fitScale = computeFit(); view.scale = fitScale; view.tx = 0; view.ty = 0; redraw(); emit('view', viewState()); }
    function actual() { view.scale = 1; redraw(); emit('view', viewState()); }
    function zoomBy(f, at) {
      if (!source) return;
      const next = Math.max(0.02, Math.min(64, view.scale * f));
      f = next / view.scale;
      if (at) {
        // keep the image point under the cursor fixed
        const cx = vw / 2 + view.tx, cy = vh / 2 + view.ty;
        view.tx += (at.x - cx) * (1 - f);
        view.ty += (at.y - cy) * (1 - f);
      }
      view.scale = next;
      redraw();
      emit('view', viewState());
    }
    function rotate(deg) { view.rotation = ((view.rotation + deg) % 360 + 360) % 360; fitScale = computeFit(); redraw(); emit('view', viewState()); }
    function flip(axis) { if (axis === 'h') view.flipH = !view.flipH; else view.flipV = !view.flipV; redraw(); emit('view', viewState()); }
    function reset() { view.rotation = 0; view.flipH = false; view.flipV = false; fit(); }

    function setSource(src, { keepView = false } = {}) {
      const prev = source;
      source = src;
      if (!src) { annotations = []; drawing = null; drag = null; redraw(); return; }
      const same = prev && prev.width === src.width && prev.height === src.height;
      if (!keepView || !same) { annotations = []; drawing = null; drag = null; reset(); }
      else redraw();   // a re-rendered frame of the same geometry: keep view, annotations and any drag in progress
    }

    function setTool(t) { tool = t; drawing = null; viewport.style.cursor = cursorFor(t); drawOverlay(); }
    function deleteLast() { if (drawing) { drawing = null; } else annotations.pop(); redraw(); }
    function clear() { annotations = []; drawing = null; redraw(); }

    /** The frame as displayed (rotation / flip applied, at native resolution), optionally with annotations burned in. */
    function exportCanvas(burn) {
      if (!source) return null;
      const rot = ((view.rotation % 180) + 180) % 180 !== 0;
      const w = rot ? source.height : source.width, h = rot ? source.width : source.height;
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const c = out.getContext('2d');
      c.translate(w / 2, h / 2);
      c.rotate(view.rotation * Math.PI / 180);
      c.scale(view.flipH ? -1 : 1, view.flipV ? -1 : 1);
      c.drawImage(source.canvas, -source.width / 2, -source.height / 2);
      if (burn && annotations.length) {
        // Re-project the annotations through the same rotation / flip (no zoom / pan).
        const saved = { ...view }, savedVw = vw, savedVh = vh, savedDpr = dpr;
        view.scale = 1; view.tx = 0; view.ty = 0; vw = w; vh = h; dpr = 1;
        const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
        const tctx = tmp.getContext('2d');
        const aspectSaved = source.aspect; source.aspect = 1;
        for (const a of annotations) drawAnnotation(tctx, a, false);
        source.aspect = aspectSaved;
        Object.assign(view, saved); vw = savedVw; vh = savedVh; dpr = savedDpr;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(tmp, 0, 0);
      }
      return out;
    }

    return {
      get view() { return view; }, get tool() { return tool; }, get source() { return source; },
      get annotations() { return annotations; }, set annotations(v) { annotations = v || []; redraw(); },
      set interpolate(v) { interpolate = !!v; redraw(); }, get interpolate() { return interpolate; },
      set showAnnotations(v) { showAnnotations = !!v; redraw(); }, get showAnnotations() { return showAnnotations; },
      set wheelMode(v) { wheelMode = v === 'stack' ? 'stack' : 'zoom'; }, get wheelMode() { return wheelMode; },
      set colors(v) { Object.assign(COLORS, v || {}); redraw(); }, get colors() { return { ...COLORS }; },
      set showRuler(v) { showRuler = !!v; drawOverlay(); }, get showRuler() { return showRuler; },
      set showGrid(v) { showGrid = !!v; drawOverlay(); }, get showGrid() { return showGrid; },
      setSource, setTool, fit, actual, zoomBy, rotate, flip, reset, redraw, resize, deleteLast, clear,
      imageToClient, clientToImage, exportCanvas, viewState,
      destroy() { ro.disconnect(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); },
    };
  }

  return { create };
})();
