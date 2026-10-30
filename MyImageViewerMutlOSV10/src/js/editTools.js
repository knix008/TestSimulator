/* Edit window: drawing, retouching, crop / straighten and the tone, canvas, watermark and
 * selection dialogs. The pixel work goes through Editor's pixel API (commitPixels makes
 * every finished stroke, shape or retouch one undo step); the maths is in EditOps.
 *
 * Tools (second toolbar row, #ew-tools-row): each one gets the pointer from Editor while it
 * is active (Editor.setToolHandler) and follows a drag on `window`, so a stroke can leave
 * the canvas. The row's right part shows the active tool's options, remembered per tool.
 *
 * app.js calls init(ctx) once, select(id) / deactivate() to switch, handleKey(e) first in
 * its keydown, imageMenuItems() / selectMenuItems() for the edit window's menu bar.
 */
window.EditTools = (() => {
  const STORE_KEY = 'editToolsV1';
  const FONTS = ['Segoe UI', 'Malgun Gothic', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS', 'Verdana', 'Trebuchet MS'];
  const RATIOS = [
    { id: 'free', r: 0 }, { id: 'original', r: -1 }, { id: '1:1', r: 1 }, { id: '4:3', r: 4 / 3 }, { id: '3:4', r: 3 / 4 },
    { id: '3:2', r: 3 / 2 }, { id: '2:3', r: 2 / 3 }, { id: '16:9', r: 16 / 9 }, { id: '9:16', r: 9 / 16 }, { id: '5:4', r: 5 / 4 }, { id: '4:5', r: 4 / 5 },
  ];
  // Every tool: icon, shortcut key, the options shown for it
  const TOOLS = [
    { id: 'brush', icon: 'brush', key: 'b', opts: ['color', 'size', 'opacity'] },
    { id: 'highlighter', icon: 'highlighter', key: 'h', opts: ['color', 'size', 'opacity'] },
    { id: 'eraser', icon: 'eraser', key: 'e', opts: ['size', 'opacity'] },
    { sep: true },
    { id: 'line', icon: 'drawLine', key: 'l', opts: ['color', 'size', 'opacity'] },
    { id: 'arrow', icon: 'drawArrow', key: 'a', opts: ['color', 'size', 'opacity'] },
    { id: 'rect', icon: 'drawRect', key: 'r', opts: ['color', 'size', 'opacity', 'fill'] },
    { id: 'ellipse', icon: 'drawEllipse', key: 'o', opts: ['color', 'size', 'opacity', 'fill'] },
    { id: 'text', icon: 'drawText', key: 't', opts: ['color', 'font', 'fontSize', 'textStyle', 'textBg'] },
    { sep: true },
    { id: 'mosaic', icon: 'mosaic', key: 'm', opts: ['size', 'block'] },
    { id: 'blurBrush', icon: 'blurBrush', key: 'u', opts: ['size', 'strength'] },
    { sep: true },
    { id: 'clone', icon: 'cloneStamp', key: 's', opts: ['size', 'opacity', 'hint'] },
    { id: 'heal', icon: 'heal', key: 'j', opts: ['size', 'hint'] },
    { id: 'redeye', icon: 'redEye', key: 'y', opts: ['size', 'hint'] },
    { sep: true },
    { id: 'crop', icon: 'cropTool', key: 'c', opts: ['ratio', 'apply', 'cancel', 'hint'] },
    { id: 'straighten', icon: 'straighten', key: 'k', opts: ['angle', 'cropFill', 'apply', 'cancel', 'hint'] },
    { id: 'wb', icon: 'eyedropper', key: 'w', opts: ['wbReset', 'hint'] },
  ];
  const BY_ID = Object.fromEntries(TOOLS.filter((t) => t.id).map((t) => [t.id, t]));
  const SIZE_DEFAULT = { brush: 12, highlighter: 28, eraser: 30, line: 20, arrow: 20, rect: 20, ellipse: 20, mosaic: 60, blurBrush: 60, clone: 40, heal: 24, redeye: 30 };
  const SHAPES = ['line', 'arrow', 'rect', 'ellipse'];
  const SHAPE_WIDTH_V = 2;   // v1 saved 4–5 px for the shapes; v2 starts them at 20
  const OPACITY_DEFAULT = { brush: 100, highlighter: 40, eraser: 100, line: 100, arrow: 100, rect: 100, ellipse: 100, clone: 100 };

  let ctx = null;          // from app.js: { t, status, dialogOpen, showDialog, hideDialog, onToolChange, onPixelsChanged }
  let active = null;       // active tool id
  let spaceHeld = false;
  let drag = null;         // the drag in progress (tool-specific state)
  let hoverPt = null;
  const prefs = _loadPrefs();

  const t = (k, fb) => {
    try { const s = ctx?.t ? ctx.t(k) : I18n.t(k); return s && s !== k ? s : (fb ?? k); } catch { return fb ?? k; }
  };

  function _loadPrefs() {
    const base = {
      color: '#ff3b30', fillColor: '#ffd60a', fill: false, size: { ...SIZE_DEFAULT }, opacity: { ...OPACITY_DEFAULT },
      font: 'Segoe UI', fontSize: 48, bold: true, italic: false, textBg: false,
      textOutline: false, outlineColor: '#000000', textShadow: false,
      block: 16, strength: 12, ratio: 'free', cropFill: true, shapeWidthV: SHAPE_WIDTH_V,
    };
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      if (o.size && o.shapeWidthV !== SHAPE_WIDTH_V) for (const k of SHAPES) delete o.size[k];
      return { ...base, ...o, shapeWidthV: SHAPE_WIDTH_V, size: { ...base.size, ...(o.size || {}) }, opacity: { ...base.opacity, ...(o.opacity || {}) } };
    } catch { return base; }
  }

  function _savePrefs() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* no storage */ }
  }

  const size = () => prefs.size[active] ?? 20;
  const opacity = () => (prefs.opacity[active] ?? 100) / 100;

  /* ════════════════ Toolbar row ════════════════ */

  function init(appCtx) {
    ctx = appCtx || {};
    const host = document.getElementById('ew-tool-buttons');
    if (host && !host.childElementCount) {
      for (const tool of TOOLS) {
        if (tool.sep) {
          const sep = document.createElement('div');
          sep.className = 'ew-sep ew-sep-thin';
          host.appendChild(sep);
          continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ew-btn ew-draw-tool';
        btn.id = `ew-dt-${tool.id}`;
        btn.dataset.tool = tool.id;
        btn.innerHTML = Icons[tool.icon] || '';
        btn.addEventListener('click', () => (active === tool.id ? deactivate() : select(tool.id)));
        if (window.Tooltip?.attach) Tooltip.attach(btn, () => `${t(`et.tool.${tool.id}`)} (${tool.key.toUpperCase()})`);
        else btn.title = t(`et.tool.${tool.id}`);
        host.appendChild(btn);
      }
    }
    _initDialogs();
    _renderOptions();
    // Any other edit, save or export first draws the live object in; Undo drops it instead
    Editor.setPendingHook?.({ flush: () => { if (textBox) _textCommit(); return commitLive(); }, discard: () => { _textCancel(); return discardLive(); } });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && spaceHeld) { spaceHeld = false; _setCursor(); }
    });
    window.addEventListener('blur', () => { spaceHeld = false; });
  }

  /** The tool with this id takes the pointer (the selection tools let go of it). */
  function select(id) {
    if (!BY_ID[id] || !Editor.isLoaded()) return;
    _finishPending();
    if (active && active !== id) _leave();
    active = id;
    Editor.setToolHandler({ down: _down, hover: _hover, dblclick: _dblclick, leave: _leave, cursor: _cursorFor(id) });
    if (id === 'crop') _cropStart();
    if (id === 'straighten') _straightenStart();
    _syncButtons();
    _renderOptions();
    _redraw();
    ctx.onToolChange?.(id);
    const hint = _hintFor(id);
    if (hint) ctx.status?.(hint);
  }

  /** Back to the pointer / selection tools. */
  function deactivate() {
    if (!active) return;
    _finishPending();
    _leave();
    active = null;
    Editor.setToolHandler(null);
    _syncButtons();
    _renderOptions();
    ctx.onToolChange?.(null);
  }

  function getActive() { return active; }

  // Called by Editor when another tool takes over (setTool / setToolHandler)
  function _leave() {
    _textCommit();
    commitLive();
    _straightenPreview(0);
    drag = null;
    hoverPt = null;
  }

  // A text box still open or a crop not applied is finished before switching
  function _finishPending() {
    if (textBox) _textCommit();
    commitLive();
  }

  function _syncButtons() {
    document.querySelectorAll('#ew-tool-buttons .ew-draw-tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === active);
      b.setAttribute('aria-pressed', b.dataset.tool === active ? 'true' : 'false');
    });
  }

  function _cursorFor(id) {
    if (id === 'text') return 'text';
    // "+" where a shape starts; crop, straighten and the click tools point the same way
    if (SHAPES.includes(id) || id === 'crop' || id === 'straighten' || id === 'wb' || id === 'redeye') return 'crosshair';
    return 'none';   // brushes: their outline (drawn on the overlay) is the cursor
  }

  function _setCursor() {
    const overlay = document.getElementById('sel-canvas');
    if (!overlay || !active) return;
    overlay.style.cursor = spaceHeld ? 'grab' : _cursorFor(active);
  }

  function _hintFor(id) {
    const key = { clone: 'et.hint.clone', heal: 'et.hint.heal', redeye: 'et.hint.redeye', crop: 'et.hint.crop', straighten: 'et.hint.straighten', wb: 'et.hint.wb', text: 'et.hint.text' }[id];
    return key ? t(key) : '';
  }

  /* ── Options (right part of the row) ── */
  function _renderOptions() {
    const host = document.getElementById('ew-tool-options');
    if (!host) return;
    host.innerHTML = '';
    if (!active) {
      const hint = document.createElement('span');
      hint.className = 'et-hint';
      hint.textContent = t('et.pickTool');
      host.appendChild(hint);
      return;
    }
    const tool = BY_ID[active];
    const name = document.createElement('span');
    name.className = 'et-name';
    name.textContent = t(`et.tool.${active}`);
    host.appendChild(name);
    for (const opt of tool.opts) {
      const el = _option(opt);
      if (el) host.appendChild(el);
    }
  }

  function _labelled(labelKey, control, extra) {
    const wrap = document.createElement('label');
    wrap.className = 'et-opt';
    const s = document.createElement('span');
    s.textContent = t(labelKey);
    wrap.append(s, control);
    if (extra) wrap.appendChild(extra);
    return wrap;
  }

  // − value + stepper with a slider (the app's convention for numbers)
  function _stepper(labelKey, value, min, max, step, unit, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'et-opt et-stepper';
    const s = document.createElement('span');
    s.textContent = t(labelKey);
    const range = document.createElement('input');
    range.type = 'range'; range.min = min; range.max = max; range.step = step; range.value = value;
    const out = document.createElement('output');
    const show = (v) => { out.textContent = `${v}${unit}`; };
    show(value);
    const minus = document.createElement('button');
    minus.type = 'button'; minus.className = 'et-step'; minus.textContent = '−';
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'et-step'; plus.textContent = '+';
    const set = (v) => {
      v = Math.max(min, Math.min(max, Math.round(v / step) * step));
      v = Math.round(v * 100) / 100;
      range.value = v; show(v); onChange(v);
    };
    range.addEventListener('input', () => set(+range.value));
    minus.addEventListener('click', () => set(+range.value - step));
    plus.addEventListener('click', () => set(+range.value + step));
    wrap.append(s, minus, range, plus, out);
    wrap._set = set;
    return wrap;
  }

  function _check(labelKey, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'et-opt et-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!checked;
    box.addEventListener('change', () => onChange(box.checked));
    const s = document.createElement('span');
    s.textContent = t(labelKey);
    wrap.append(box, s);
    return wrap;
  }

  function _button(labelKey, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `et-btn ${cls || ''}`;
    b.textContent = t(labelKey);
    b.addEventListener('click', onClick);
    return b;
  }

  function _option(opt) {
    switch (opt) {
      case 'color': {
        const c = document.createElement('input');
        c.type = 'color'; c.value = prefs.color;
        c.addEventListener('input', () => { prefs.color = c.value; _savePrefs(); _restyle(); });
        return _labelled('et.color', c);
      }
      case 'size': {
        const max = active === 'redeye' ? 200 : 400;
        return _stepper(active === 'line' || active === 'arrow' || active === 'rect' || active === 'ellipse' ? 'et.width' : 'et.size',
          size(), 1, max, 1, 'px', (v) => { prefs.size[active] = v; _savePrefs(); _restyle(); });
      }
      case 'opacity':
        return _stepper('et.opacity', Math.round(opacity() * 100), 5, 100, 5, '%', (v) => { prefs.opacity[active] = v; _savePrefs(); _restyle(); });
      case 'fill': {
        const wrap = _check('et.fill', prefs.fill, (v) => { prefs.fill = v; _savePrefs(); _restyle(); });
        const c = document.createElement('input');
        c.type = 'color'; c.value = prefs.fillColor;
        c.addEventListener('input', () => { prefs.fillColor = c.value; _savePrefs(); _restyle(); });
        wrap.appendChild(c);
        return wrap;
      }
      case 'font': {
        const sel = document.createElement('select');
        for (const f of FONTS) {
          const o = document.createElement('option');
          o.value = f; o.textContent = f; o.style.fontFamily = f;
          sel.appendChild(o);
        }
        sel.value = FONTS.includes(prefs.font) ? prefs.font : FONTS[0];
        sel.addEventListener('change', () => { prefs.font = sel.value; _savePrefs(); _restyle(); });
        return _labelled('et.font', sel);
      }
      case 'fontSize':
        return _stepper('et.fontSize', prefs.fontSize, 6, 600, 2, 'px', (v) => { prefs.fontSize = v; _savePrefs(); _restyle(); });
      case 'textStyle': {
        // Compact toggles: B · I · outlined A (+ its colour) · shadowed A
        const wrap = document.createElement('div');
        wrap.className = 'et-opt et-toggles';
        const toggle = (key, glyph, cls, titleKey) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `et-toggle ${cls}`;
          b.textContent = glyph;
          b.title = t(titleKey);
          b.setAttribute('aria-pressed', prefs[key] ? 'true' : 'false');
          b.addEventListener('click', () => {
            prefs[key] = !prefs[key];
            b.setAttribute('aria-pressed', prefs[key] ? 'true' : 'false');
            _savePrefs();
            _restyle();
          });
          return b;
        };
        const oc = document.createElement('input');
        oc.type = 'color'; oc.value = prefs.outlineColor; oc.title = t('et.outlineColor');
        oc.addEventListener('input', () => { prefs.outlineColor = oc.value; _savePrefs(); _restyle(); });
        wrap.append(
          toggle('bold', 'B', 'is-bold', 'et.bold'),
          toggle('italic', 'I', 'is-italic', 'et.italic'),
          toggle('textOutline', 'A', 'is-outline', 'et.outline'), oc,
          toggle('textShadow', 'A', 'is-shadow', 'et.shadow'),
        );
        return wrap;
      }
      case 'textBg': {
        const wrap = _check('et.textBg', prefs.textBg, (v) => { prefs.textBg = v; _savePrefs(); _restyle(); });
        const c = document.createElement('input');
        c.type = 'color'; c.value = prefs.fillColor;
        c.addEventListener('input', () => { prefs.fillColor = c.value; _savePrefs(); _restyle(); });
        wrap.appendChild(c);
        return wrap;
      }
      case 'block':
        return _stepper('et.block', prefs.block, 4, 80, 2, 'px', (v) => { prefs.block = v; _savePrefs(); });
      case 'strength':
        return _stepper('et.strength', prefs.strength, 2, 60, 1, 'px', (v) => { prefs.strength = v; _savePrefs(); });
      case 'ratio': {
        const sel = document.createElement('select');
        for (const r of RATIOS) {
          const o = document.createElement('option');
          o.value = r.id; o.textContent = r.id === 'free' ? t('et.ratio.free') : r.id === 'original' ? t('et.ratio.original') : r.id;
          sel.appendChild(o);
        }
        sel.value = prefs.ratio;
        sel.addEventListener('change', () => { prefs.ratio = sel.value; _savePrefs(); _cropStart(); _redraw(); });
        return _labelled('et.ratio', sel);
      }
      case 'angle': {
        const st = _stepper('et.angle', straightenAngle, -45, 45, 0.1, '°', (v) => { straightenAngle = v; _straightenPreview(v); _redraw(); });
        angleControl = st;
        return st;
      }
      case 'cropFill':
        return _check('et.cropFill', prefs.cropFill, (v) => { prefs.cropFill = v; _savePrefs(); _redraw(); });
      case 'apply':
        return _button('et.apply', 'primary', () => _applyPending());
      case 'cancel':
        return _button('et.cancel', '', () => _cancelPending());
      case 'wbReset':
        return _button('et.wbReset', '', () => { Editor.setEffect('wb', null, true); ctx.onPixelsChanged?.(); });
      case 'hint': {
        const s = document.createElement('span');
        s.className = 'et-hint';
        s.textContent = _hintFor(active);
        return s;
      }
      default: return null;
    }
  }

  /* ════════════════ Pointer ════════════════ */

  function _down(p, e) {
    if (spaceHeld || !active) return;   // Space + drag pans the canvas (app.js)
    e.preventDefault();
    const tool = active;
    if (tool === 'text' && !(live && _liveHit(p))) { _textDown(p, e); return; }
    if (tool === 'wb') { _pickWhiteBalance(p); return; }
    if (tool === 'redeye') { _redEye(p); return; }
    if (tool === 'clone' && e.altKey) {
      cloneSrc = { x: p.x, y: p.y };
      cloneOffset = null;
      ctx.status?.(t('et.cloneSourceSet'));
      _redraw();
      return;
    }
    if (tool === 'clone' && !cloneSrc) { ctx.status?.(t('et.hint.clone')); return; }

    drag = { tool, start: p, last: p, shift: e.shiftKey };
    const hit = live ? _liveHit(p) : null;
    if (hit) drag.live = { hit, orig: JSON.parse(JSON.stringify(live)) };
    else if (live) commitLive();
    if (tool === 'brush' || tool === 'highlighter' || tool === 'eraser') _strokeBegin(p);
    else if (tool === 'mosaic' || tool === 'blurBrush') _stampBegin(p);
    else if (tool === 'clone') _cloneBegin(p);
    else if (tool === 'heal') _healBegin(p);
    else if (tool === 'crop') _cropDown(p);
    // shapes and straighten only need start / end

    const move = (ev) => _move(Editor.clientToImage(ev.clientX, ev.clientY), ev);
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      _up(Editor.clientToImage(ev.clientX, ev.clientY), ev);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    _move(p, e);
  }

  // Double-click inside the crop frame applies it; on live text, edits it again
  function _dblclick(p) {
    if (active === 'crop' && _cropHit(p) === 'move') _cropApply();
    if (live && live.kind === 'text' && _liveHit(p)) _textEdit();
  }

  function _hover(p) {
    hoverPt = p;
    if (!drag) {
      _hoverCursor(p);
      _redraw();
    }
  }

  // Over a live shape / text or the crop frame: show what a drag there does
  const HANDLE_CURSOR = {
    tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize',
    t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize',
    a: 'crosshair', scale: 'nwse-resize', move: 'move',
  };
  function _hoverCursor(p) {
    const overlay = document.getElementById('sel-canvas');
    if (!overlay || spaceHeld) return;
    let hit = live ? _liveHit(p) : null;
    if (!hit && active === 'crop') hit = _cropHit(p);
    // A line's end points: the resize arrow that runs along the line
    if ((hit === 'a' || hit === 'b') && live && live.kind === 'shape' && (live.tool === 'line' || live.tool === 'arrow')) {
      const deg = ((Math.atan2(live.b.y - live.a.y, live.b.x - live.a.x) * 180 / Math.PI) + 180) % 180;
      overlay.style.cursor = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(deg / 45) % 4];
      return;
    }
    overlay.style.cursor = hit ? HANDLE_CURSOR[hit] : _cursorFor(active);
  }

  function _move(p, e) {
    if (!drag) return;
    hoverPt = p;
    const tool = drag.tool;
    if (drag.live) { _liveDrag(p, e); drag.last = p; _redraw(); return; }
    if (tool === 'brush' || tool === 'highlighter' || tool === 'eraser') _strokeTo(p, e);
    else if (tool === 'mosaic' || tool === 'blurBrush' || tool === 'clone') _stampTo(p);
    else if (tool === 'heal') _healTo(p);
    else if (tool === 'crop') _cropMove(p, e);
    else drag.end = _constrain(drag.start, p, e.shiftKey, tool);
    drag.last = p;
    _redraw();
  }

  function _up(p, e) {
    const d = drag;
    if (!d) return;
    const tool = d.tool;
    if (d.live) { drag = null; _redraw(); return; }
    if (tool === 'brush' || tool === 'highlighter' || tool === 'eraser') _strokeEnd();
    else if (tool === 'mosaic' || tool === 'blurBrush' || tool === 'clone') _stampEnd();
    else if (tool === 'heal') _healEnd();
    else if (tool === 'crop') { drag = null; _redraw(); return; }
    else if (tool === 'straighten') _straightenFromLine(d.start, _constrain(d.start, p, false, tool));
    else _shapeCommit(d.start, _constrain(d.start, p, e.shiftKey, tool));
    drag = null;
    _redraw();
  }

  // Shift: lines snap to 45°, rectangles / ellipses become squares / circles
  function _constrain(a, b, shift, tool) {
    if (!shift) return b;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (tool === 'line' || tool === 'arrow') {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    }
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m };
  }

  /* ── Overlay: the tool's preview over the picture ── */
  function _redraw() {
    if (!active) { Editor.redrawOverlay(); return; }
    Editor.redrawOverlay((oc, scale) => {
      const tool = active;
      if (drag && strokeCanvas && (tool === 'brush' || tool === 'highlighter' || tool === 'eraser')) {
        oc.save();
        oc.globalAlpha = tool === 'eraser' ? 0.55 : opacity();
        oc.drawImage(strokeCanvas, 0, 0);
        oc.restore();
      }
      if (drag && healMask && tool === 'heal') {
        oc.save();
        oc.globalAlpha = 0.45;
        oc.drawImage(healCanvas, 0, 0);
        oc.restore();
      }
      if (drag && drag.end && ['line', 'arrow', 'rect', 'ellipse'].includes(tool)) {
        _drawShape(oc, tool, drag.start, drag.end);
      }
      if (live) {
        _drawLive(oc, live);
        _drawLiveFrame(oc, live, scale);
      }
      if (tool === 'straighten') _drawStraighten(oc, scale);
      if (tool === 'crop') _drawCrop(oc, scale);
      if (tool === 'clone' && cloneSrc) {
        const at = cloneOffset && hoverPt ? { x: hoverPt.x + cloneOffset.x, y: hoverPt.y + cloneOffset.y } : cloneSrc;
        _crosshair(oc, at, scale);
      }
      // Brush outline as the cursor
      if (hoverPt && !spaceHeld && ['brush', 'highlighter', 'eraser', 'mosaic', 'blurBrush', 'clone', 'heal', 'redeye'].includes(tool)) {
        const r = Math.max(1, size() / 2);
        oc.save();
        oc.lineWidth = 1.5 * scale;
        oc.strokeStyle = 'rgba(0,0,0,0.75)';
        oc.beginPath(); oc.arc(hoverPt.x, hoverPt.y, r, 0, Math.PI * 2); oc.stroke();
        oc.strokeStyle = 'rgba(255,255,255,0.9)';
        oc.lineWidth = 0.75 * scale;
        oc.beginPath(); oc.arc(hoverPt.x, hoverPt.y, r, 0, Math.PI * 2); oc.stroke();
        oc.restore();
      }
      if (tool === 'straighten' && drag && drag.end) {
        oc.save();
        oc.strokeStyle = '#ffd60a';
        oc.lineWidth = 2 * scale;
        oc.setLineDash([8 * scale, 5 * scale]);
        oc.beginPath(); oc.moveTo(drag.start.x, drag.start.y); oc.lineTo(drag.end.x, drag.end.y); oc.stroke();
        oc.restore();
      }
    });
  }

  function _crosshair(oc, p, scale) {
    const r = 9 * scale;
    oc.save();
    for (const [col, w] of [['rgba(0,0,0,0.8)', 3], ['#fff', 1.2]]) {
      oc.strokeStyle = col;
      oc.lineWidth = w * scale;
      oc.beginPath();
      oc.moveTo(p.x - r, p.y); oc.lineTo(p.x + r, p.y);
      oc.moveTo(p.x, p.y - r); oc.lineTo(p.x, p.y + r);
      oc.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
      oc.stroke();
    }
    oc.restore();
  }

  /* ════════════════ Brush / highlighter / eraser ════════════════ */
  let strokeCanvas = null;
  let strokeCtx = null;

  function _strokeBegin(p) {
    const px = Editor.getPixels();
    strokeCanvas = document.createElement('canvas');
    strokeCanvas.width = px.width;
    strokeCanvas.height = px.height;
    strokeCtx = strokeCanvas.getContext('2d');
    strokeCtx.lineCap = active === 'highlighter' ? 'square' : 'round';
    strokeCtx.lineJoin = 'round';
    strokeCtx.lineWidth = size();
    strokeCtx.strokeStyle = active === 'eraser' ? '#ffffff' : prefs.color;
    strokeCtx.fillStyle = strokeCtx.strokeStyle;
    if (active !== 'highlighter') {
      strokeCtx.beginPath();
      strokeCtx.arc(p.x, p.y, size() / 2, 0, Math.PI * 2);
      strokeCtx.fill();
    }
  }

  function _strokeTo(p) {
    if (!strokeCtx || !drag) return;
    strokeCtx.beginPath();
    strokeCtx.moveTo(drag.last.x, drag.last.y);
    strokeCtx.lineTo(p.x, p.y);
    strokeCtx.stroke();
  }

  function _strokeEnd() {
    if (!strokeCanvas) return;
    const stroke = strokeCanvas;
    const mode = active === 'eraser' ? 'destination-out' : active === 'highlighter' ? 'multiply' : 'source-over';
    const alpha = opacity();
    Editor.paintPixels((c) => {
      c.globalAlpha = alpha;
      c.globalCompositeOperation = mode;
      c.drawImage(stroke, 0, 0);
    });
    strokeCanvas = null;
    strokeCtx = null;
    ctx.onPixelsChanged?.();
  }

  /* ════════════════ Shapes ════════════════ */

  // What a shape / text is drawn with: the options now, and again whenever they change while it is live
  function _shapeStyle(tool) {
    return { color: prefs.color, size: prefs.size[tool] ?? 20, opacity: (prefs.opacity[tool] ?? 100) / 100, fill: prefs.fill, fillColor: prefs.fillColor };
  }

  function _textStyle() {
    return {
      font: prefs.font, fontSize: prefs.fontSize, bold: prefs.bold, italic: prefs.italic, color: prefs.color,
      textBg: prefs.textBg, fillColor: prefs.fillColor, outline: prefs.textOutline, outlineColor: prefs.outlineColor, shadow: prefs.textShadow,
    };
  }

  function _drawShape(c, tool, a, b, st = _shapeStyle(tool)) {
    c.save();
    c.globalAlpha = st.opacity;
    c.lineWidth = st.size;
    c.strokeStyle = st.color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (tool === 'line' || tool === 'arrow') {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(10, st.size * 3.5);
      const end = tool === 'arrow' && Math.hypot(b.x - a.x, b.y - a.y) > head
        ? { x: b.x - Math.cos(ang) * head * 0.8, y: b.y - Math.sin(ang) * head * 0.8 } : b;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(end.x, end.y); c.stroke();
      if (tool === 'arrow') {
        c.fillStyle = st.color;
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.x - Math.cos(ang - 0.42) * head, b.y - Math.sin(ang - 0.42) * head);
        c.lineTo(b.x - Math.cos(ang + 0.42) * head, b.y - Math.sin(ang + 0.42) * head);
        c.closePath();
        c.fill();
      }
    } else {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      c.beginPath();
      if (tool === 'rect') c.rect(x, y, w, h);
      else c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (st.fill) { c.fillStyle = st.fillColor; c.fill(); }
      c.stroke();
    }
    c.restore();
  }

  // A finished drag places the shape live: it can still be moved, resized and restyled
  function _shapeCommit(a, b) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
    live = { kind: 'shape', tool: active, a, b, st: _shapeStyle(active) };
    ctx.status?.(t('et.hint.live'));
  }

  /* ════════════════ Live object (the last shape / text, still editable) ════════════════ */
  let live = null;   // { kind: 'shape', tool, a, b, st } | { kind: 'text', at, text, st }

  function _restyle() {
    _textRestyle();
    if (live) {
      live.st = live.kind === 'shape' ? _shapeStyle(live.tool) : _textStyle();
      _redraw();
    } else _redraw();
  }

  /** Into the picture (one undo step). True when there was one. */
  function commitLive() {
    if (!live) return false;
    const obj = live;
    live = null;
    Editor.paintPixels((c) => _drawLive(c, obj));
    ctx.onPixelsChanged?.();
    _redraw();
    return true;
  }

  /** Dropped without drawing (Delete, or Undo while it is live). */
  function discardLive() {
    if (!live) return false;
    live = null;
    _redraw();
    return true;
  }

  function _drawLive(c, obj) {
    if (obj.kind === 'shape') _drawShape(c, obj.tool, obj.a, obj.b, obj.st);
    else _drawText(c, obj);
  }

  let measureCtx = null;
  function _textMetrics(obj) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = _fontOf(obj.st, 1);
    const lines = obj.text.split('\n');
    const fs = obj.st.fontSize, lh = fs * 1.25;
    const w = Math.max(1, ...lines.map((l) => measureCtx.measureText(l).width));
    return { lines, fs, lh, w, h: lines.length * lh };
  }

  function _drawText(c, obj) {
    const { lines, fs, lh, w, h } = _textMetrics(obj);
    const st = obj.st, at = obj.at;
    c.save();
    c.font = _fontOf(st, 1);
    c.textBaseline = 'top';
    if (st.textBg) {
      const pad = fs * 0.2;
      c.fillStyle = st.fillColor;
      c.fillRect(at.x - pad, at.y - pad, w + pad * 2, h + pad * 2);
    }
    if (st.shadow) {
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowBlur = fs * 0.12;
      c.shadowOffsetX = c.shadowOffsetY = Math.max(1, fs * 0.05);
    }
    lines.forEach((ln, i) => {
      const y = at.y + i * lh + (lh - fs) / 2;
      if (st.outline) {
        c.lineJoin = 'round';
        c.lineWidth = Math.max(1, fs * 0.12);
        c.strokeStyle = st.outlineColor;
        c.strokeText(ln, at.x, y);
        c.shadowColor = 'transparent';   // one shadow, under the outline
      }
      c.fillStyle = st.color;
      c.fillText(ln, at.x, y);
    });
    c.restore();
  }

  function _liveBox(obj) {
    if (obj.kind === 'text') {
      const m = _textMetrics(obj);
      return { x: obj.at.x, y: obj.at.y, w: m.w, h: m.h };
    }
    const x = Math.min(obj.a.x, obj.b.x), y = Math.min(obj.a.y, obj.b.y);
    return { x, y, w: Math.abs(obj.b.x - obj.a.x), h: Math.abs(obj.b.y - obj.a.y) };
  }

  function _liveHandles(obj) {
    if (obj.kind === 'text') {
      const b = _liveBox(obj);
      return [{ id: 'scale', x: b.x + b.w, y: b.y + b.h }];
    }
    if (obj.tool === 'line' || obj.tool === 'arrow') return [{ id: 'a', ...obj.a }, { id: 'b', ...obj.b }];
    const b = _liveBox(obj);
    return [['tl', b.x, b.y], ['tr', b.x + b.w, b.y], ['bl', b.x, b.y + b.h], ['br', b.x + b.w, b.y + b.h],
      ['t', b.x + b.w / 2, b.y], ['b', b.x + b.w / 2, b.y + b.h], ['l', b.x, b.y + b.h / 2], ['r', b.x + b.w, b.y + b.h / 2]]
      .map(([id, x, y]) => ({ id, x, y }));
  }

  /** 'move', a handle id, or null. */
  function _liveHit(p) {
    if (!live) return null;
    const tol = 9 * Editor.imageScale();
    for (const hd of _liveHandles(live)) if (Math.abs(p.x - hd.x) <= tol && Math.abs(p.y - hd.y) <= tol) return hd.id;
    if (live.kind === 'shape' && (live.tool === 'line' || live.tool === 'arrow')) {
      const { a, b } = live;
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t0 = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L)));
      const d = Math.hypot(p.x - (a.x + (b.x - a.x) * t0), p.y - (a.y + (b.y - a.y) * t0));
      return d <= Math.max(tol, live.st.size / 2 + tol / 2) ? 'move' : null;
    }
    const bx = _liveBox(live), pad = live.kind === 'shape' ? live.st.size / 2 : 0;
    return p.x >= bx.x - pad && p.x <= bx.x + bx.w + pad && p.y >= bx.y - pad && p.y <= bx.y + bx.h + pad ? 'move' : null;
  }

  function _liveDrag(p, e) {
    const { hit, orig } = drag.live;
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (hit === 'move') {
      if (live.kind === 'text') live.at = { x: orig.at.x + dx, y: orig.at.y + dy };
      else { live.a = { x: orig.a.x + dx, y: orig.a.y + dy }; live.b = { x: orig.b.x + dx, y: orig.b.y + dy }; }
      return;
    }
    if (live.kind === 'text') {
      // Corner: the text grows / shrinks with the drag
      const ob = _liveBox(orig);
      const k = Math.max(0.1, (ob.w + dx) / Math.max(1, ob.w));
      live.st = { ...live.st, fontSize: Math.max(6, Math.round(orig.st.fontSize * k)) };
      prefs.fontSize = live.st.fontSize;
      return;
    }
    if (hit === 'a' || hit === 'b') {
      const other = hit === 'a' ? orig.b : orig.a;
      live[hit] = _constrain(other, { x: orig[hit].x + dx, y: orig[hit].y + dy }, e.shiftKey, live.tool);
      return;
    }
    let x1 = Math.min(orig.a.x, orig.b.x), y1 = Math.min(orig.a.y, orig.b.y);
    let x2 = Math.max(orig.a.x, orig.b.x), y2 = Math.max(orig.a.y, orig.b.y);
    if (hit.includes('l')) x1 += dx;
    if (hit.includes('r')) x2 += dx;
    if (hit.includes('t')) y1 += dy;
    if (hit.includes('b')) y2 += dy;
    live.a = { x: Math.min(x1, x2), y: Math.min(y1, y2) };
    live.b = { x: Math.max(x1, x2), y: Math.max(y1, y2) };
  }

  function _drawLiveFrame(oc, obj, scale) {
    const b = _liveBox(obj);
    const pad = obj.kind === 'shape' ? obj.st.size / 2 : obj.st.fontSize * 0.2;
    oc.save();
    if (!(obj.kind === 'shape' && (obj.tool === 'line' || obj.tool === 'arrow'))) {
      oc.lineWidth = 1 * scale;
      oc.setLineDash([5 * scale, 4 * scale]);
      oc.strokeStyle = 'rgba(0,0,0,0.7)';
      oc.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
      oc.lineDashOffset = 5 * scale;
      oc.strokeStyle = '#fff';
      oc.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
      oc.setLineDash([]);
    }
    const hs = 8 * scale;
    for (const hd of _liveHandles(obj)) {
      oc.fillStyle = '#fff';
      oc.strokeStyle = '#0a84ff';
      oc.lineWidth = 1.5 * scale;
      oc.fillRect(hd.x - hs / 2, hd.y - hs / 2, hs, hs);
      oc.strokeRect(hd.x - hs / 2, hd.y - hs / 2, hs, hs);
    }
    oc.restore();
  }

  /* ════════════════ Text ════════════════ */
  let textBox = null;   // { el, at: {x, y} }

  function _fontOf(st, scale = 1) {
    return `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${st.fontSize / scale}px "${st.font}"`;
  }

  function _textFont(scale = 1) {
    return _fontOf(prefs, scale);
  }

  function _textDown(p, e, text = '') {
    if (textBox) { _textCommit(); return; }
    const el = document.createElement('textarea');
    el.className = 'et-textbox';
    el.spellcheck = false;
    el.rows = 1;
    el.value = text;
    // The box sits in a frame with a move grip, so it can be dragged while typing
    const wrap = document.createElement('div');
    wrap.className = 'et-textwrap';
    wrap.style.left = `${e.clientX}px`;
    wrap.style.top = `${e.clientY}px`;
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'et-text-grip';
    grip.title = t('et.textMove');
    grip.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>';
    wrap.append(grip, el);
    textBox = { el, wrap, at: { x: p.x, y: p.y } };
    grip.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      grip.setPointerCapture(ev.pointerId);
      const sx = ev.clientX, sy = ev.clientY;
      const ox = parseFloat(wrap.style.left), oy = parseFloat(wrap.style.top);
      const move = (mv) => {
        wrap.style.left = `${ox + mv.clientX - sx}px`;
        wrap.style.top = `${oy + mv.clientY - sy}px`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        // Where the text starts = the box's top-left, in picture pixels
        const r = el.getBoundingClientRect();
        if (textBox) textBox.at = Editor.clientToImage(r.left + 1, r.top + 1);
        el.focus();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    _textRestyle();
    el.addEventListener('input', _textFit);
    el.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); _textCancel(); }
      else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); _textCommit(); }
    });
    document.body.appendChild(wrap);
    setTimeout(() => el.focus(), 0);
    _textFit();
  }

  function _textRestyle() {
    if (!textBox) return;
    const el = textBox.el;
    const scale = Editor.imageScale();
    el.style.font = _textFont(scale);
    el.style.lineHeight = '1.25';
    el.style.color = prefs.color;
    el.style.background = prefs.textBg ? prefs.fillColor : 'transparent';
    _textFit();
  }

  function _textFit() {
    if (!textBox) return;
    const el = textBox.el;
    el.style.height = 'auto';
    el.style.width = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
    el.style.width = `${Math.max(40, el.scrollWidth + 8)}px`;
  }

  // The typed text becomes the live object (movable, restylable) until the next one
  function _textCommit() {
    if (!textBox) return;
    const { el, wrap, at } = textBox;
    const text = el.value.replace(/\s+$/, '');
    wrap.remove();
    textBox = null;
    if (!text) { _redraw(); return; }
    commitLive();
    live = { kind: 'text', at, text, st: _textStyle() };
    ctx.status?.(t('et.hint.live'));
    _redraw();
  }

  /** Double-click on live text: type in it again (in its own style). */
  function _textEdit() {
    if (!live || live.kind !== 'text') return;
    const obj = live;
    live = null;
    Object.assign(prefs, {
      font: obj.st.font, fontSize: obj.st.fontSize, bold: obj.st.bold, italic: obj.st.italic, color: obj.st.color,
      textBg: obj.st.textBg, fillColor: obj.st.fillColor, textOutline: obj.st.outline, outlineColor: obj.st.outlineColor, textShadow: obj.st.shadow,
    });
    _renderOptions();
    const scr = Editor.imageToClient(obj.at.x, obj.at.y);
    _textDown(obj.at, { clientX: scr.x, clientY: scr.y }, obj.text);
    _redraw();
  }

  function _textCancel() {
    if (!textBox) return;
    textBox.wrap.remove();
    textBox = null;
  }

  /* ════════════════ Mosaic / blur / clone brushes ════════════════ */
  let stampSrc = null;     // ImageData the brush copies from
  let stampDirty = null;
  let cloneSrc = null;     // source point (Alt+click)
  let cloneOffset = null;  // source − destination, fixed from the first stroke (aligned)

  // Mosaic and blur of the whole picture, drawn by the GPU, as the brush's source
  function _filtered(kind) {
    const px = Editor.getPixels();
    const w = px.width, h = px.height;
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    src.getContext('2d').putImageData(px, 0, 0);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const oc = out.getContext('2d', { willReadFrequently: true });
    if (kind === 'mosaic') {
      const b = Math.max(2, prefs.block);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.ceil(w / b));
      small.height = Math.max(1, Math.ceil(h / b));
      const sc = small.getContext('2d');
      sc.imageSmoothingQuality = 'high';
      sc.drawImage(src, 0, 0, small.width, small.height);
      oc.imageSmoothingEnabled = false;
      oc.drawImage(small, 0, 0, small.width * b, small.height * b);
    } else {
      oc.filter = `blur(${prefs.strength}px)`;
      oc.drawImage(src, 0, 0);
    }
    return oc.getImageData(0, 0, w, h);
  }

  function _stampBegin(p) {
    stampSrc = _filtered(active === 'mosaic' ? 'mosaic' : 'blur');
    stampDirty = null;
    _stampAt(p);
    _flushStamp();
  }

  function _cloneBegin(p) {
    const px = Editor.getPixels();
    stampSrc = EditOps.copy(px);
    if (!cloneOffset) cloneOffset = { x: cloneSrc.x - p.x, y: cloneSrc.y - p.y };
    stampDirty = null;
    _stampAt(p);
    _flushStamp();
  }

  function _stampTo(p) {
    const a = drag.last;
    const step = Math.max(1, size() * 0.2);
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / step));
    for (let i = 1; i <= n; i++) _stampAt({ x: a.x + (p.x - a.x) * i / n, y: a.y + (p.y - a.y) * i / n });
    _flushStamp();
  }

  // Copy the source into the working pixels inside the brush circle (soft rim)
  function _stampAt(p) {
    const px = Editor.getPixels();
    if (!px || !stampSrc) return;
    const w = px.width, h = px.height, d = px.data, s = stampSrc.data;
    const r = Math.max(1, size() / 2);
    const soft = active === 'mosaic' ? 0.02 : 0.35;
    const alpha = active === 'clone' ? opacity() : 1;
    const off = active === 'clone' ? cloneOffset : { x: 0, y: 0 };
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dist = Math.hypot(x - p.x, y - p.y);
        if (dist > r) continue;
        const k = alpha * Math.min(1, (r - dist) / (r * soft + 0.0001));
        const sx = Math.round(x + off.x), sy = Math.round(y + off.y);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
        d[i] += (s[j] - d[i]) * k;
        d[i + 1] += (s[j + 1] - d[i + 1]) * k;
        d[i + 2] += (s[j + 2] - d[i + 2]) * k;
        d[i + 3] += (s[j + 3] - d[i + 3]) * k;
      }
    }
    stampDirty = _union(stampDirty, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }

  function _flushStamp() {
    if (stampDirty) Editor.previewPixels(stampDirty);
    stampDirty = null;
  }

  function _stampEnd() {
    stampSrc = null;
    Editor.commitPixels();
    ctx.onPixelsChanged?.();
  }

  const _union = (a, b) => {
    if (!a) return b;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };

  /* ════════════════ Spot heal ════════════════ */
  let healMask = null;
  let healCanvas = null;
  let healCtx = null;

  function _healBegin(p) {
    const px = Editor.getPixels();
    healCanvas = document.createElement('canvas');
    healCanvas.width = px.width;
    healCanvas.height = px.height;
    healCtx = healCanvas.getContext('2d', { willReadFrequently: true });
    healCtx.fillStyle = healCtx.strokeStyle = '#ff2d55';
    healCtx.lineCap = 'round';
    healCtx.lineJoin = 'round';
    healCtx.lineWidth = size();
    healCtx.beginPath();
    healCtx.arc(p.x, p.y, size() / 2, 0, Math.PI * 2);
    healCtx.fill();
    healMask = true;
  }

  function _healTo(p) {
    if (!healCtx) return;
    healCtx.beginPath();
    healCtx.moveTo(drag.last.x, drag.last.y);
    healCtx.lineTo(p.x, p.y);
    healCtx.stroke();
  }

  function _healEnd() {
    if (!healCtx) return;
    const px = Editor.getPixels();
    const a = healCtx.getImageData(0, 0, px.width, px.height).data;
    const mask = new Uint8ClampedArray(px.width * px.height);
    for (let i = 0; i < mask.length; i++) mask[i] = a[i * 4 + 3];
    healMask = null; healCanvas = null; healCtx = null;
    if (EditOps.inpaint(px, mask)) {
      Editor.commitPixels();
      ctx.onPixelsChanged?.();
    }
  }

  /* ════════════════ Red-eye, white balance ════════════════ */

  function _redEye(p) {
    const px = Editor.getPixels();
    const n = EditOps.redEye(px, p.x, p.y, Math.max(2, size() / 2));
    if (!n) { ctx.status?.(t('et.noRedEye')); return; }
    Editor.commitPixels();
    ctx.onPixelsChanged?.();
  }

  function _pickWhiteBalance(p) {
    const px = Editor.getPixels();
    const w = px.width, h = px.height, d = px.data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.max(0, p.y - 2); y <= Math.min(h - 1, p.y + 2); y++) {
      for (let x = Math.max(0, p.x - 2); x <= Math.min(w - 1, p.x + 2); x++) {
        const i = (y * w + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    if (!n) return;
    Editor.setEffect('wb', EditOps.wbFromSample(r / n, g / n, b / n), true);
    ctx.onPixelsChanged?.();
  }

  /* ════════════════ Crop ════════════════ */
  let cropRect = null;

  function _ratioValue() {
    const r = RATIOS.find((x) => x.id === prefs.ratio)?.r ?? 0;
    if (r !== -1) return r;
    const px = Editor.getPixels();
    return px ? px.width / px.height : 0;
  }

  function _cropStart() {
    const px = Editor.getPixels();
    if (!px) return;
    const r = EditOps.ratioRect(px.width, px.height, _ratioValue());
    // Start a little inside the edges so the handles are easy to grab
    const inset = prefs.ratio === 'free' ? Math.round(Math.min(px.width, px.height) * 0.05) : 0;
    cropRect = { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2 };
    if (prefs.ratio !== 'free') {
      const shrink = 0.9;
      const nw = Math.round(r.w * shrink), nh = Math.round(r.h * shrink);
      cropRect = { x: Math.round((px.width - nw) / 2), y: Math.round((px.height - nh) / 2), w: nw, h: nh };
    }
  }

  function _cropHit(p) {
    if (!cropRect) return null;
    const tol = 10 * Editor.imageScale();
    const { x, y, w, h } = cropRect;
    const xs = { l: x, c: x + w / 2, r: x + w }, ys = { t: y, m: y + h / 2, b: y + h };
    for (const [id, hx, hy] of [['tl', xs.l, ys.t], ['tr', xs.r, ys.t], ['bl', xs.l, ys.b], ['br', xs.r, ys.b],
      ['t', xs.c, ys.t], ['b', xs.c, ys.b], ['l', xs.l, ys.m], ['r', xs.r, ys.m]]) {
      if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) return id;
    }
    if (p.x > x && p.x < x + w && p.y > y && p.y < y + h) return 'move';
    return null;
  }

  function _cropDown(p) {
    const hit = _cropHit(p);
    drag.crop = { mode: hit || 'new', orig: { ...(cropRect || { x: p.x, y: p.y, w: 0, h: 0 }) } };
  }

  function _cropMove(p) {
    const px = Editor.getPixels();
    const W = px.width, H = px.height;
    const ratio = _ratioValue();
    const { mode, orig } = drag.crop;
    const s = drag.start;
    let { x, y, w, h } = orig;
    if (mode === 'move') {
      x = Math.max(0, Math.min(W - w, orig.x + p.x - s.x));
      y = Math.max(0, Math.min(H - h, orig.y + p.y - s.y));
      cropRect = { x: Math.round(x), y: Math.round(y), w, h };
      return;
    }
    // Anchor = the side / corner that stays put
    let ax, ay, bx, by;
    if (mode === 'new') { ax = s.x; ay = s.y; bx = p.x; by = p.y; }
    else {
      ax = mode.includes('l') ? orig.x + orig.w : orig.x;
      ay = mode.includes('t') ? orig.y + orig.h : orig.y;
      bx = mode.includes('l') ? p.x : mode.includes('r') ? p.x : orig.x + orig.w;
      by = mode.includes('t') ? p.y : mode.includes('b') ? p.y : orig.y + orig.h;
      if (mode === 't' || mode === 'b') { ax = orig.x; bx = orig.x + orig.w; }
      if (mode === 'l' || mode === 'r') { ay = orig.y; by = orig.y + orig.h; }
    }
    bx = Math.max(0, Math.min(W, bx));
    by = Math.max(0, Math.min(H, by));
    w = Math.abs(bx - ax); h = Math.abs(by - ay);
    if (ratio > 0) {
      if (mode === 't' || mode === 'b') w = h * ratio;
      else if (mode === 'l' || mode === 'r') h = w / ratio;
      else if (w / Math.max(1, h) > ratio) h = w / ratio; else w = h * ratio;
      // Keep inside the picture
      const maxW = bx >= ax ? W - ax : ax, maxH = by >= ay ? H - ay : ay;
      if (w > maxW) { w = maxW; h = w / ratio; }
      if (h > maxH) { h = maxH; w = h * ratio; }
    }
    x = bx >= ax ? ax : ax - w;
    y = by >= ay ? ay : ay - h;
    if (mode === 't' || mode === 'b') x = orig.x + (orig.w - w) / 2;
    if (mode === 'l' || mode === 'r') y = orig.y + (orig.h - h) / 2;
    x = Math.max(0, Math.min(W - w, x));
    y = Math.max(0, Math.min(H - h, y));
    cropRect = { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  }

  function _drawCrop(oc, scale) {
    if (!cropRect) return;
    const px = Editor.getPixels();
    const { x, y, w, h } = cropRect;
    oc.save();
    oc.fillStyle = 'rgba(0,0,0,0.5)';
    oc.beginPath();
    oc.rect(0, 0, px.width, px.height);
    oc.rect(x, y, w, h);
    oc.fill('evenodd');
    // Rule of thirds
    oc.strokeStyle = 'rgba(255,255,255,0.45)';
    oc.lineWidth = 1 * scale;
    oc.beginPath();
    for (const k of [1 / 3, 2 / 3]) {
      oc.moveTo(x + w * k, y); oc.lineTo(x + w * k, y + h);
      oc.moveTo(x, y + h * k); oc.lineTo(x + w, y + h * k);
    }
    oc.stroke();
    oc.strokeStyle = '#fff';
    oc.lineWidth = 1.5 * scale;
    oc.strokeRect(x, y, w, h);
    const hs = 7 * scale;
    oc.fillStyle = '#fff';
    oc.strokeStyle = 'rgba(0,0,0,0.6)';
    for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2]]) {
      oc.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      oc.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
    // Size label
    const label = `${w} × ${h}`;
    oc.font = `${12 * scale}px "Segoe UI", sans-serif`;
    const tw = oc.measureText(label).width + 10 * scale;
    oc.fillStyle = 'rgba(0,0,0,0.7)';
    oc.fillRect(x, Math.max(0, y - 20 * scale), tw, 18 * scale);
    oc.fillStyle = '#fff';
    oc.textBaseline = 'middle';
    oc.fillText(label, x + 5 * scale, Math.max(0, y - 20 * scale) + 9 * scale);
    oc.restore();
  }

  async function _cropApply() {
    if (!cropRect || cropRect.w < 2 || cropRect.h < 2) return;
    const ok = await Editor.cropTo(cropRect);
    if (ok) ctx.onPixelsChanged?.();
    _cropStart();
    _redraw();
  }

  /* ════════════════ Straighten ════════════════ */
  let straightenAngle = 0;
  let angleControl = null;

  function _straightenStart() {
    straightenAngle = 0;
    _straightenPreview(0);
  }

  // Preview: the picture turns under the overlay (CSS), the grid and the crop frame stay level
  function _straightenPreview(deg) {
    const c = Editor.getCanvasElement?.();
    if (!c) return;
    c.style.transform = deg ? `rotate(${deg}deg)` : '';
    c.style.transformOrigin = deg ? '50% 50%' : '';
  }

  function _drawStraighten(oc, scale) {
    const px = Editor.getPixels();
    if (!px) return;
    const W = px.width, H = px.height;
    oc.save();
    if (straightenAngle && prefs.cropFill) {
      const fit = EditOps.rotatedFit(W, H, straightenAngle * Math.PI / 180).crop;
      const x = (W - fit.w) / 2, y = (H - fit.h) / 2;
      oc.fillStyle = 'rgba(0,0,0,0.45)';
      oc.beginPath();
      oc.rect(-W, -H, W * 3, H * 3);
      oc.rect(x, y, fit.w, fit.h);
      oc.fill('evenodd');
      oc.strokeStyle = '#fff';
      oc.lineWidth = 1.5 * scale;
      oc.strokeRect(x, y, fit.w, fit.h);
    }
    // Level grid
    oc.strokeStyle = 'rgba(255,255,255,0.5)';
    oc.lineWidth = 1 * scale;
    const step = Math.max(W, H) / 12;
    oc.beginPath();
    for (let x = step; x < W; x += step) { oc.moveTo(x, 0); oc.lineTo(x, H); }
    for (let y = step; y < H; y += step) { oc.moveTo(0, y); oc.lineTo(W, y); }
    oc.stroke();
    oc.restore();
  }

  // A line dragged along something that should be level (or upright) sets the angle
  function _straightenFromLine(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 8) return;
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    while (deg > 45) deg -= 90;
    while (deg < -45) deg += 90;
    const v = Math.round(-deg * 10) / 10;
    straightenAngle = Math.max(-45, Math.min(45, v));
    angleControl?._set?.(straightenAngle);
    _straightenPreview(straightenAngle);
  }

  async function _straightenApply() {
    const deg = straightenAngle;
    _straightenPreview(0);
    if (!deg) return;
    const ok = await Editor.rotateFree(deg, { crop: prefs.cropFill });
    straightenAngle = 0;
    angleControl?._set?.(0);
    if (ok) ctx.onPixelsChanged?.();
    _redraw();
  }

  function _applyPending() {
    if (active === 'crop') return _cropApply();
    if (active === 'straighten') return _straightenApply();
    return null;
  }

  function _cancelPending() {
    if (active === 'crop') { _cropStart(); _redraw(); return; }
    if (active === 'straighten') { straightenAngle = 0; angleControl?._set?.(0); _straightenPreview(0); _redraw(); }
  }

  /* ════════════════ Keys ════════════════ */

  /** Edit-mode keys; true = handled (app.js stops). */
  function handleKey(e) {
    if (!Editor.isLoaded()) return false;
    if (textBox && e.target === textBox.el) return true;   // typing: the box handles it
    if (ctx.dialogOpen?.()) return false;
    const tag = e.target?.tagName || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
    if (typing) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.code === 'Space' && active) {
      if (!spaceHeld) { spaceHeld = true; _setCursor(); _redraw(); }
      e.preventDefault();
      return true;
    }
    if (ctrl && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'a' && !e.shiftKey) { e.preventDefault(); Editor.selectAll(); ctx.onSelectionChanged?.(); return true; }
      if (k === 'd' && !e.shiftKey) { e.preventDefault(); Editor.clearSelection(); ctx.onSelectionChanged?.(); return true; }
      if (k === 'i' && e.shiftKey) { e.preventDefault(); Editor.editSelection('invert'); ctx.onSelectionChanged?.(); return true; }
      return false;
    }
    if (live) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); discardLive(); return true; }
      if (e.key === 'Enter') { e.preventDefault(); commitLive(); return true; }
      const step = e.shiftKey ? 10 : 1;
      const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (nudge) {
        e.preventDefault();
        if (live.kind === 'text') live.at = { x: live.at.x + nudge[0], y: live.at.y + nudge[1] };
        else {
          live.a = { x: live.a.x + nudge[0], y: live.a.y + nudge[1] };
          live.b = { x: live.b.x + nudge[0], y: live.b.y + nudge[1] };
        }
        _redraw();
        return true;
      }
    }
    if (e.key === 'Escape') {
      if (active === 'crop' || (active === 'straighten' && straightenAngle)) { e.preventDefault(); _cancelPending(); if (active === 'crop') deactivate(); return true; }
      if (active) { e.preventDefault(); deactivate(); return true; }
      return false;
    }
    if (e.key === 'Enter' && (active === 'crop' || active === 'straighten')) { e.preventDefault(); _applyPending(); return true; }
    if (!active && e.altKey) return false;
    if ((e.key === '[' || e.key === ']') && active && prefs.size[active] != null) {
      e.preventDefault();
      const cur = size();
      const stepBy = cur < 10 ? 1 : cur < 50 ? 4 : 10;
      prefs.size[active] = Math.max(1, Math.min(400, cur + (e.key === ']' ? stepBy : -stepBy)));
      _savePrefs();
      _renderOptions();
      _redraw();
      return true;
    }
    if (!e.altKey && !e.shiftKey && e.key.length === 1) {
      const tool = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tool) { e.preventDefault(); select(tool.id); return true; }
    }
    return false;
  }

  function isSpaceHeld() { return spaceHeld; }

  /* ════════════════ Menus ════════════════ */

  function imageMenuItems() {
    const has = Editor.isLoaded();
    const ic = (k) => Icons[k] || '';
    return [
      { icon: ic('cropTool'), label: t('et.tool.crop'), shortcut: 'C', disabled: !has, action: () => select('crop') },
      { icon: ic('straighten'), label: `${t('et.tool.straighten')}…`, shortcut: 'K', disabled: !has, action: () => select('straighten') },
      { icon: ic('canvasSize'), label: `${t('canvasSize.title')}…`, disabled: !has, action: () => openCanvasSize() },
      { separator: true },
      { icon: ic('autoFix'), label: t('tone.autoEnhance'), disabled: !has, action: () => autoEnhance() },
      { icon: ic('toneCurve'), label: `${t('tone.title')}…`, disabled: !has, action: () => openTone() },
      { icon: ic('eyedropper'), label: t('et.tool.wb'), shortcut: 'W', disabled: !has, action: () => select('wb') },
      { icon: ic('reset'), label: t('tone.resetAll'), disabled: !has, action: () => resetTone() },
      { separator: true },
      { icon: ic('denoise'), label: `${t('et.denoise')}…`, disabled: !has, action: () => _askDenoise() },
      { icon: ic('watermark'), label: `${t('watermark.title')}…`, disabled: !has, action: () => openWatermark() },
    ];
  }

  function selectMenuItems() {
    const has = Editor.isLoaded();
    const sel = has && Editor.hasSelection();
    const ic = (k) => Icons[k] || '';
    const after = () => ctx.onSelectionChanged?.();
    return [
      { icon: ic('selectAll'), label: t('sel.all'), shortcut: 'Ctrl+A', disabled: !has, action: () => { Editor.selectAll(); after(); } },
      { icon: ic('selectInvert'), label: t('sel.invert'), shortcut: 'Ctrl+Shift+I', disabled: !sel, action: () => { Editor.editSelection('invert'); after(); } },
      { icon: ic('close'), label: t('editWindow.clearSel'), shortcut: 'Ctrl+D', disabled: !sel, action: () => { Editor.clearSelection(); after(); } },
      { separator: true },
      { icon: ic('feather'), label: `${t('sel.feather')}…`, disabled: !sel, action: () => _askSelection('feather', 'sel.feather', 1, 100, 8) },
      { icon: ic('selectGrow'), label: `${t('sel.grow')}…`, disabled: !sel, action: () => _askSelection('grow', 'sel.grow', 1, 200, 5) },
      { icon: ic('selectShrink'), label: `${t('sel.shrink')}…`, disabled: !sel, action: () => _askSelection('shrink', 'sel.shrink', 1, 200, 5) },
      { separator: true },
      { icon: ic('blurBrush'), label: `${t('sel.blur')}…`, disabled: !sel, action: () => _askFilter('blur', 'sel.blur', 1, 80, 12) },
      { icon: ic('mosaic'), label: `${t('sel.mosaic')}…`, disabled: !sel, action: () => _askFilter('mosaic', 'sel.mosaic', 4, 100, 16) },
    ];
  }

  async function _askSelection(kind, titleKey, min, max, value) {
    const v = await askAmount({ title: t(titleKey), label: t('sel.radius'), min, max, value });
    if (v == null) return;
    Editor.editSelection(kind, v);
    ctx.onSelectionChanged?.();
  }

  async function _askFilter(kind, titleKey, min, max, value) {
    const v = await askAmount({ title: t(titleKey), label: t(kind === 'mosaic' ? 'et.block' : 'et.strength'), min, max, value });
    if (v == null) return;
    const ok = await Editor.filterSelection(kind, v);
    if (ok) ctx.onPixelsChanged?.();
  }

  async function _askDenoise() {
    const v = await askAmount({ title: t('et.denoise'), label: t('et.strength'), min: 1, max: 100, value: 40 });
    if (v == null) return;
    const ok = await Editor.denoise(v);
    if (ok) ctx.onPixelsChanged?.();
  }

  /* ════════════════ Tone ════════════════ */

  function autoEnhance() {
    const px = Editor.getPixels();
    if (!px) return;
    Editor.setEffect('levels', EditOps.autoLevels(px), true);
    ctx.onPixelsChanged?.();
    ctx.status?.(t('tone.autoDone'));
  }

  function resetTone() {
    Editor.setEffects({ exposure: 0, highlights: 0, shadows: 0, vibrance: 0, levels: null, curve: null, wb: null });
    ctx.onEffectsChanged?.();
  }

  const IDENTITY = () => [[0, 0], [255, 255]];
  let tone = null;   // dialog state { saved, levels, curve, channel, drag }
  const el = {};     // dialog elements, looked up once (dialogs move to their own windows)

  function _initDialogs() {
    for (const id of ['tone-overlay', 'tone-curve', 'tone-levels-hist', 'tone-in-black', 'tone-gamma', 'tone-in-white', 'tone-out-black', 'tone-out-white',
      'tone-auto', 'tone-reset', 'tone-cancel', 'tone-ok', 'tone-close',
      'canvas-size-overlay', 'canvas-size-current', 'canvas-size-w', 'canvas-size-h', 'canvas-size-margin', 'canvas-anchor', 'canvas-size-color',
      'canvas-size-ok', 'canvas-size-cancel', 'canvas-size-close',
      'watermark-overlay', 'wm-text', 'wm-font', 'wm-color', 'wm-size', 'wm-size-val', 'wm-opacity', 'wm-opacity-val', 'wm-angle', 'wm-angle-val',
      'wm-anchor', 'wm-tile', 'wm-shadow', 'watermark-ok', 'watermark-cancel', 'watermark-close',
      'amount-overlay', 'amount-title', 'amount-label', 'amount-range', 'amount-number', 'amount-ok', 'amount-cancel', 'amount-close']) {
      el[id] = document.getElementById(id);
    }
    if (!el['tone-overlay'] || el['tone-overlay']._etBound) return;
    el['tone-overlay']._etBound = true;
    _bindTone();
    _bindCanvasSize();
    _bindWatermark();
    _bindAmount();
  }

  const _show = (id) => (ctx.showDialog ? ctx.showDialog(id) : (el[id].style.display = 'flex', el[id].classList.add('visible')));
  const _hide = (id) => { el[id].style.display = 'none'; el[id].classList.remove('visible'); };

  function openTone() {
    if (!Editor.isLoaded()) return;
    const fx = Editor.getEffects();
    const curve = fx.curve || {};
    tone = {
      saved: { levels: fx.levels, curve: fx.curve },
      levels: { black: 0, white: 255, gamma: 1, outBlack: 0, outWhite: 255, ...(fx.levels || {}) },
      curve: { rgb: curve.rgb || IDENTITY(), r: curve.r || IDENTITY(), g: curve.g || IDENTITY(), b: curve.b || IDENTITY() },
      channel: 'rgb',
      hist: EditOps.histogram(Editor.getPixels()),
      drag: null,
    };
    el['tone-overlay'].querySelectorAll('input[name="tone-channel"]').forEach((r) => { r.checked = r.value === 'rgb'; });
    _toneSyncLevels();
    _toneDrawCurve();
    _toneDrawHist();
    _show('tone-overlay');
  }

  function _bindTone() {
    const ov = el['tone-overlay'];
    ov.querySelectorAll('.tone-tab').forEach((tab) => tab.addEventListener('click', () => {
      ov.querySelectorAll('.tone-tab').forEach((x) => x.classList.toggle('active', x === tab));
      ov.querySelectorAll('.tone-panel').forEach((p) => p.classList.toggle('active', p.dataset.tonePanel === tab.dataset.toneTab));
    }));
    ov.querySelectorAll('input[name="tone-channel"]').forEach((r) => r.addEventListener('change', () => {
      if (!tone || !r.checked) return;
      tone.channel = r.value;
      _toneDrawCurve();
    }));
    // Levels
    const lv = [['tone-in-black', 'black'], ['tone-in-white', 'white'], ['tone-out-black', 'outBlack'], ['tone-out-white', 'outWhite']];
    for (const [id, key] of lv) {
      el[id].addEventListener('input', () => {
        if (!tone) return;
        let v = +el[id].value;
        if (key === 'black') v = Math.min(v, tone.levels.white - 1);
        if (key === 'white') v = Math.max(v, tone.levels.black + 1);
        tone.levels[key] = v;
        _toneSyncLevels();
        _tonePreview();
      });
    }
    el['tone-gamma'].addEventListener('input', () => {
      if (!tone) return;
      // Slider −100…100 ↔ gamma 0.25…4 (log scale, 0 = 1.00)
      tone.levels.gamma = Math.round(Math.pow(4, +el['tone-gamma'].value / 100) * 100) / 100;
      _toneSyncLevels();
      _tonePreview();
    });
    // Curve editor (pointer capture: works in the dialog's own window too)
    const cv = el['tone-curve'];
    const toCurve = (ev) => {
      const r = cv.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(255, Math.round((ev.clientX - r.left) / r.width * 255))),
        y: Math.max(0, Math.min(255, Math.round((1 - (ev.clientY - r.top) / r.height) * 255))),
      };
    };
    cv.addEventListener('pointerdown', (ev) => {
      if (!tone) return;
      const p = toCurve(ev);
      const pts = tone.curve[tone.channel];
      let i = pts.findIndex(([x, y]) => Math.abs(x - p.x) <= 8 && Math.abs(y - p.y) <= 12);
      if (i < 0) {
        pts.push([p.x, p.y]);
        pts.sort((a, b) => a[0] - b[0]);
        i = pts.findIndex(([x, y]) => x === p.x && y === p.y);
      }
      tone.drag = i;
      cv.setPointerCapture(ev.pointerId);
      _toneDrawCurve();
      _tonePreview();
    });
    cv.addEventListener('pointermove', (ev) => {
      if (!tone || tone.drag == null) return;
      const pts = tone.curve[tone.channel];
      const i = tone.drag;
      const p = toCurve(ev);
      const lo = i > 0 ? pts[i - 1][0] + 1 : 0;
      const hi = i < pts.length - 1 ? pts[i + 1][0] - 1 : 255;
      pts[i] = [i === 0 ? Math.min(p.x, hi) : i === pts.length - 1 ? Math.max(p.x, lo) : Math.max(lo, Math.min(hi, p.x)), p.y];
      _toneDrawCurve();
      _tonePreview();
    });
    const endDrag = () => { if (tone) tone.drag = null; };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('dblclick', (ev) => {
      if (!tone) return;
      const p = toCurve(ev);
      const pts = tone.curve[tone.channel];
      const i = pts.findIndex(([x, y]) => Math.abs(x - p.x) <= 8 && Math.abs(y - p.y) <= 12);
      if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); _toneDrawCurve(); _tonePreview(); }
    });
    el['tone-auto'].addEventListener('click', () => {
      if (!tone) return;
      tone.levels = EditOps.autoLevels(Editor.getPixels());
      _toneSyncLevels();
      _tonePreview();
    });
    el['tone-reset'].addEventListener('click', () => {
      if (!tone) return;
      tone.levels = { black: 0, white: 255, gamma: 1, outBlack: 0, outWhite: 255 };
      tone.curve = { rgb: IDENTITY(), r: IDENTITY(), g: IDENTITY(), b: IDENTITY() };
      _toneSyncLevels();
      _toneDrawCurve();
      _tonePreview();
    });
    const cancel = () => {
      if (tone) Editor.setEffects(tone.saved, false);
      tone = null;
      _hide('tone-overlay');
    };
    el['tone-cancel'].addEventListener('click', cancel);
    el['tone-close'].addEventListener('click', cancel);
    el['tone-ok'].addEventListener('click', () => {
      if (!tone) return;
      const next = _toneValue();
      Editor.setEffects(next, false);
      if (JSON.stringify(next) !== JSON.stringify(tone.saved)) Editor.commitEffects();
      tone = null;
      _hide('tone-overlay');
      ctx.onEffectsChanged?.();
    });
    // Esc / closing the window from app.js counts as cancel
    new MutationObserver(() => {
      const shown = el['tone-overlay'].style.display === 'flex';
      if (!shown && tone) { Editor.setEffects(tone.saved, false); tone = null; }
    }).observe(el['tone-overlay'], { attributes: true, attributeFilter: ['style'] });
  }

  function _toneValue() {
    const lv = tone.levels;
    const identityLv = lv.black === 0 && lv.white === 255 && lv.gamma === 1 && lv.outBlack === 0 && lv.outWhite === 255;
    const c = tone.curve;
    const ident = (pts) => pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255;
    const curveOff = ['rgb', 'r', 'g', 'b'].every((k) => ident(c[k]));
    return {
      levels: identityLv ? null : { ...lv },
      curve: curveOff ? null : { rgb: c.rgb.map((p) => [...p]), r: c.r.map((p) => [...p]), g: c.g.map((p) => [...p]), b: c.b.map((p) => [...p]) },
    };
  }

  let toneFrame = 0;
  function _tonePreview() {
    if (toneFrame) return;
    toneFrame = requestAnimationFrame(() => {
      toneFrame = 0;
      if (tone) Editor.setEffects(_toneValue(), false);
    });
  }

  function _toneSyncLevels() {
    const lv = tone.levels;
    const set = (id, v, text) => { el[id].value = v; const o = el[id].parentElement.querySelector('output'); if (o) o.textContent = text ?? v; };
    set('tone-in-black', lv.black);
    set('tone-in-white', lv.white);
    set('tone-out-black', lv.outBlack);
    set('tone-out-white', lv.outWhite);
    set('tone-gamma', Math.round(Math.log(lv.gamma) / Math.log(4) * 100), lv.gamma.toFixed(2));
    _toneDrawHist();
  }

  function _drawHistogram(c2, hist, color) {
    const w = c2.canvas.width, h = c2.canvas.height;
    let max = 1;
    for (let i = 1; i < 255; i++) max = Math.max(max, hist[i]);
    c2.fillStyle = color;
    c2.beginPath();
    c2.moveTo(0, h);
    for (let i = 0; i < 256; i++) c2.lineTo(i / 255 * w, h - Math.min(1, hist[i] / max) * h * 0.95);
    c2.lineTo(w, h);
    c2.closePath();
    c2.fill();
  }

  function _toneDrawHist() {
    const cv = el['tone-levels-hist'];
    if (!cv || !tone) return;
    const c2 = cv.getContext('2d');
    c2.clearRect(0, 0, cv.width, cv.height);
    _drawHistogram(c2, tone.hist.l, 'rgba(160,160,160,0.6)');
    const lv = tone.levels;
    c2.strokeStyle = '#ffd60a';
    c2.lineWidth = 1.5;
    for (const v of [lv.black, lv.white]) {
      c2.beginPath(); c2.moveTo(v / 255 * cv.width, 0); c2.lineTo(v / 255 * cv.width, cv.height); c2.stroke();
    }
  }

  function _toneDrawCurve() {
    const cv = el['tone-curve'];
    if (!cv || !tone) return;
    const c2 = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    c2.clearRect(0, 0, W, H);
    const histKey = tone.channel === 'rgb' ? 'l' : tone.channel;
    _drawHistogram(c2, tone.hist[histKey], 'rgba(150,150,150,0.25)');
    c2.strokeStyle = 'rgba(128,128,128,0.35)';
    c2.lineWidth = 1;
    c2.beginPath();
    for (let k = 1; k < 4; k++) {
      c2.moveTo(k * W / 4, 0); c2.lineTo(k * W / 4, H);
      c2.moveTo(0, k * H / 4); c2.lineTo(W, k * H / 4);
    }
    c2.moveTo(0, H); c2.lineTo(W, 0);
    c2.stroke();
    const color = { rgb: '#e8e8e8', r: '#ff5a5a', g: '#4cd964', b: '#4a9dff' }[tone.channel];
    const lut = EditOps.curveLUT(tone.curve[tone.channel]);
    c2.strokeStyle = color;
    c2.lineWidth = 2;
    c2.beginPath();
    for (let x = 0; x < 256; x++) {
      const px = x / 255 * W, py = H - lut[x] / 255 * H;
      if (x) c2.lineTo(px, py); else c2.moveTo(px, py);
    }
    c2.stroke();
    c2.fillStyle = color;
    for (const [x, y] of tone.curve[tone.channel]) {
      c2.fillRect(x / 255 * W - 4, H - y / 255 * H - 4, 8, 8);
    }
  }

  /* ════════════════ Canvas size ════════════════ */
  let canvasAnchor = { x: 0.5, y: 0.5 };

  function _anchorGrid(host, onPick, getCur) {
    host.innerHTML = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'anchor-cell';
        b.dataset.ax = String(c / 2);
        b.dataset.ay = String(r / 2);
        b.addEventListener('click', () => { onPick(c / 2, r / 2); sync(); });
        host.appendChild(b);
      }
    }
    const sync = () => {
      const cur = getCur();
      host.querySelectorAll('.anchor-cell').forEach((b) => b.classList.toggle('on', +b.dataset.ax === cur.x && +b.dataset.ay === cur.y));
    };
    sync();
    return sync;
  }

  let canvasSync = null;
  function _bindCanvasSize() {
    canvasSync = _anchorGrid(el['canvas-anchor'], (x, y) => { canvasAnchor = { x, y }; }, () => canvasAnchor);
    el['canvas-size-margin'].addEventListener('input', () => {
      const px = Editor.getPixels();
      const m = Math.round(+el['canvas-size-margin'].value || 0);
      el['canvas-size-w'].value = Math.max(1, px.width + m * 2);
      el['canvas-size-h'].value = Math.max(1, px.height + m * 2);
    });
    const close = () => _hide('canvas-size-overlay');
    el['canvas-size-cancel'].addEventListener('click', close);
    el['canvas-size-close'].addEventListener('click', close);
    el['canvas-size-ok'].addEventListener('click', async () => {
      const w = Math.round(+el['canvas-size-w'].value), h = Math.round(+el['canvas-size-h'].value);
      const fillColor = el['canvas-size-overlay'].querySelector('input[name="canvas-fill"]:checked')?.value === 'color' ? el['canvas-size-color'].value : '';
      close();
      if (!(w > 0 && h > 0)) return;
      const px = Editor.getPixels();
      if (w === px.width && h === px.height) return;
      const ok = await Editor.resizeCanvas(w, h, canvasAnchor.x, canvasAnchor.y, fillColor);
      if (ok) ctx.onPixelsChanged?.();
    });
  }

  function openCanvasSize() {
    const px = Editor.getPixels();
    if (!px) return;
    el['canvas-size-current'].textContent = `${t('canvasSize.current')}: ${px.width} × ${px.height} px`;
    el['canvas-size-w'].value = px.width;
    el['canvas-size-h'].value = px.height;
    el['canvas-size-margin'].value = 0;
    canvasAnchor = { x: 0.5, y: 0.5 };
    canvasSync?.();
    _show('canvas-size-overlay');
  }

  /* ════════════════ Watermark ════════════════ */
  let wmAnchor = { x: 1, y: 1 };
  let wmSync = null;

  function _wmOptions() {
    return {
      text: el['wm-text'].value.trim(),
      font: el['wm-font'].value || 'Segoe UI',
      color: el['wm-color'].value,
      size: +el['wm-size'].value,
      opacity: +el['wm-opacity'].value / 100,
      angle: +el['wm-angle'].value,
      tile: el['wm-tile'].checked,
      shadow: el['wm-shadow'].checked,
      anchor: { ...wmAnchor },
    };
  }

  // Also used for the live preview on the overlay (same coordinates)
  function _drawWatermark(c, W, H, o) {
    if (!o.text) return;
    const fs = Math.max(8, Math.round(Math.min(W, H) * o.size / 100));
    c.save();
    c.globalAlpha = o.opacity;
    c.font = `bold ${fs}px "${o.font}"`;
    c.fillStyle = o.color;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    if (o.shadow) {
      c.shadowColor = 'rgba(0,0,0,0.55)';
      c.shadowBlur = fs * 0.12;
      c.shadowOffsetX = c.shadowOffsetY = Math.max(1, fs * 0.04);
    }
    const tw = c.measureText(o.text).width;
    const rad = o.angle * Math.PI / 180;
    if (o.tile) {
      const gapX = tw + fs * 2.5, gapY = fs * 3.2;
      const diag = Math.hypot(W, H);
      c.translate(W / 2, H / 2);
      c.rotate(rad);
      for (let y = -diag / 2, row = 0; y < diag / 2; y += gapY, row++) {
        for (let x = -diag / 2 + (row % 2) * gapX / 2; x < diag / 2; x += gapX) c.fillText(o.text, x, y);
      }
    } else {
      const margin = fs * 0.9;
      const x = margin + tw / 2 + (W - margin * 2 - tw) * o.anchor.x;
      const y = margin + fs / 2 + (H - margin * 2 - fs) * o.anchor.y;
      c.translate(x, y);
      c.rotate(rad);
      c.fillText(o.text, 0, 0);
    }
    c.restore();
  }

  function _wmPreview() {
    const px = Editor.getPixels();
    if (!px) return;
    const o = _wmOptions();
    el['wm-size-val'].textContent = `${o.size}%`;
    el['wm-opacity-val'].textContent = `${Math.round(o.opacity * 100)}%`;
    el['wm-angle-val'].textContent = `${o.angle}°`;
    Editor.redrawOverlay((oc) => _drawWatermark(oc, px.width, px.height, o));
  }

  function _bindWatermark() {
    for (const f of FONTS) {
      const op = document.createElement('option');
      op.value = f; op.textContent = f;
      el['wm-font'].appendChild(op);
    }
    wmSync = _anchorGrid(el['wm-anchor'], (x, y) => { wmAnchor = { x, y }; _wmPreview(); }, () => wmAnchor);
    for (const id of ['wm-text', 'wm-font', 'wm-color', 'wm-size', 'wm-opacity', 'wm-angle', 'wm-tile', 'wm-shadow']) {
      el[id].addEventListener('input', _wmPreview);
      el[id].addEventListener('change', _wmPreview);
    }
    const close = () => { _hide('watermark-overlay'); _redraw(); };
    el['watermark-cancel'].addEventListener('click', close);
    el['watermark-close'].addEventListener('click', close);
    el['watermark-ok'].addEventListener('click', () => {
      const o = _wmOptions();
      try { localStorage.setItem('watermarkV1', JSON.stringify({ ...o, anchor: wmAnchor })); } catch { /* no storage */ }
      _hide('watermark-overlay');
      if (o.text) {
        const px = Editor.getPixels();
        Editor.paintPixels((c) => _drawWatermark(c, px.width, px.height, o));
        ctx.onPixelsChanged?.();
      }
      _redraw();
    });
    new MutationObserver(() => {
      if (el['watermark-overlay'].style.display !== 'flex') _redraw();
    }).observe(el['watermark-overlay'], { attributes: true, attributeFilter: ['style'] });
  }

  function openWatermark() {
    if (!Editor.isLoaded()) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('watermarkV1') || '{}') || {}; } catch { saved = {}; }
    el['wm-text'].value = saved.text || '© ';
    el['wm-font'].value = FONTS.includes(saved.font) ? saved.font : FONTS[0];
    el['wm-color'].value = saved.color || '#ffffff';
    el['wm-size'].value = saved.size || 6;
    el['wm-opacity'].value = Math.round((saved.opacity ?? 0.45) * 100);
    el['wm-angle'].value = saved.angle || 0;
    el['wm-tile'].checked = !!saved.tile;
    el['wm-shadow'].checked = saved.shadow !== false;
    wmAnchor = saved.anchor && Number.isFinite(saved.anchor.x) ? saved.anchor : { x: 1, y: 1 };
    wmSync?.();
    _show('watermark-overlay');
    _wmPreview();
    setTimeout(() => { el['wm-text'].focus(); el['wm-text'].select?.(); }, 50);
  }

  /* ════════════════ One-number prompt ════════════════ */
  let amountDone = null;

  function _bindAmount() {
    const r = el['amount-range'], n = el['amount-number'];
    r.addEventListener('input', () => { n.value = r.value; });
    n.addEventListener('input', () => { r.value = n.value; });
    const finish = (v) => {
      _hide('amount-overlay');
      const done = amountDone;
      amountDone = null;
      done?.(v);
    };
    el['amount-ok'].addEventListener('click', () => {
      const v = Math.max(+n.min, Math.min(+n.max, Math.round(+n.value)));
      finish(Number.isFinite(v) ? v : null);
    });
    el['amount-cancel'].addEventListener('click', () => finish(null));
    el['amount-close'].addEventListener('click', () => finish(null));
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el['amount-ok'].click(); } });
    new MutationObserver(() => {
      if (el['amount-overlay'].style.display !== 'flex' && amountDone) { const d = amountDone; amountDone = null; d(null); }
    }).observe(el['amount-overlay'], { attributes: true, attributeFilter: ['style'] });
  }

  /** Ask for one number; resolves to it, or null when cancelled. */
  function askAmount({ title, label, min = 1, max = 100, value = 10 }) {
    if (amountDone) amountDone(null);
    el['amount-title'].textContent = title;
    el['amount-label'].textContent = label;
    for (const id of ['amount-range', 'amount-number']) {
      el[id].min = min; el[id].max = max; el[id].value = value;
    }
    return new Promise((resolve) => {
      amountDone = resolve;
      _show('amount-overlay');
      setTimeout(() => { el['amount-number'].focus(); el['amount-number'].select(); }, 50);
    });
  }

  /** The picture changed under the tool (undo / redo, a new image): start its frame again. */
  function refresh() {
    if (!active) return;
    if (active === 'crop') _cropStart();
    if (active === 'straighten') { straightenAngle = 0; angleControl?._set?.(0); _straightenPreview(0); }
    _redraw();
  }

  /** Language changed: rebuild the labels this module made. */
  function applyI18n() {
    _renderOptions();
  }

  return {
    init, select, deactivate, getActive, handleKey, isSpaceHeld, applyI18n, refresh, commitLive, discardLive,
    imageMenuItems, selectMenuItems, openTone, openCanvasSize, openWatermark, autoEnhance, resetTone, askAmount,
    drawWatermark: (c, W, H, o) => _drawWatermark(c, W, H, o),
    TOOLS,
  };
})();
