/* Canvas-based image editor with selection tools and effects */
window.Editor = (() => {

  /* ─── State ─── */
  let displayCanvas   = null; // shown to user
  let selCanvas       = null; // selection overlay
  let displayCtx      = null;
  let selCtx          = null;
  let originalImg     = null; // HTMLImageElement
  let originalPixels  = null; // ImageData snapshot of original
  let workingPixels   = null; // ImageData after canvas-based edits

  let naturalW = 0, naturalH = 0;

  const effects = {
    brightness: 100, contrast: 100, saturation: 100,
    hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0,
    sharpen: 0, emboss: false, vignette: 0, warmth: 0,
  };

  let rotation = 0; // degrees: 0|90|180|270
  let flipH    = false;
  let flipV    = false;

  /* ─── Zoom / Pan (owned by viewer, mirrored here for canvas sizing) ─── */
  let zoom   = 1;
  let panX   = 0;
  let panY   = 0;

  /* ─── Selection ─── */
  let currentTool = 'pointer'; // 'pointer'|'rect-select'|'lasso'|'polygon'|'magic-wand'
  let selectionPath = null;    // [{x,y}, …]
  let selectionType = null;    // 'rect'|'lasso'|'polygon'|'magic'
  let selMask = null;          // Uint8ClampedArray (1 byte per pixel, 255 = selected)
  let isDrawingSelection = false;
  let selStartX = 0, selStartY = 0;
  let polygonPoints = [];
  let magicTolerance = 32;

  /* ─── History ─── */
  const history = [];
  let histIndex = -1;
  const MAX_HISTORY = 20;

  /* ─── Listeners ─── */
  let onDirtyCallback   = null;
  let onSelectionChange = null;

  /* ═══════════════════════════════════════════
     Init / Setup
  ═══════════════════════════════════════════ */
  function init(dispCanvas, selOverlayCanvas) {
    displayCanvas = dispCanvas;
    selCanvas     = selOverlayCanvas;
    displayCtx    = displayCanvas.getContext('2d', { willReadFrequently: true });
    selCtx        = selCanvas.getContext('2d');

    selCanvas.addEventListener('mousedown', _onSelMouseDown);
    selCanvas.addEventListener('mousemove', _onSelMouseMove);
    selCanvas.addEventListener('mouseup',   _onSelMouseUp);
    selCanvas.addEventListener('dblclick',  _onSelDblClick);
  }

  function setCallbacks(dirty, selChange) {
    onDirtyCallback   = dirty;
    onSelectionChange = selChange;
  }

  /* ═══════════════════════════════════════════
     Load Image
  ═══════════════════════════════════════════ */
  function loadImage(img) {
    originalImg     = img;
    naturalW        = img.naturalWidth  || img.width;
    naturalH        = img.naturalHeight || img.height;

    rotation = 0; flipH = false; flipV = false;
    _resetEffects();
    clearSelection();
    history.length = 0; histIndex = -1;

    _resizeCanvases();
    _drawOriginalToWorking();
    _render();
  }

  function _resizeCanvases() {
    // Canvas size accounts for 90/270 rotation swap
    const isRotated90 = rotation === 90 || rotation === 270;
    const cw = isRotated90 ? naturalH : naturalW;
    const ch = isRotated90 ? naturalW : naturalH;
    if (displayCanvas.width  !== cw) displayCanvas.width  = cw;
    if (displayCanvas.height !== ch) displayCanvas.height = ch;
    if (selCanvas.width      !== cw) selCanvas.width      = cw;
    if (selCanvas.height     !== ch) selCanvas.height     = ch;
  }

  function _drawOriginalToWorking() {
    if (!originalImg) return;
    const isRotated90 = rotation === 90 || rotation === 270;
    const cw = isRotated90 ? naturalH : naturalW;
    const ch = isRotated90 ? naturalW : naturalH;

    const offscreen = document.createElement('canvas');
    offscreen.width  = cw;
    offscreen.height = ch;
    const oc = offscreen.getContext('2d');

    oc.save();
    oc.translate(cw / 2, ch / 2);
    oc.rotate((rotation * Math.PI) / 180);
    if (flipH) oc.scale(-1, 1);
    if (flipV) oc.scale(1, -1);
    oc.drawImage(originalImg, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
    oc.restore();

    workingPixels = oc.getImageData(0, 0, cw, ch);
    if (!originalPixels) {
      originalPixels = oc.getImageData(0, 0, cw, ch);
    }
  }

  /* ═══════════════════════════════════════════
     Render
  ═══════════════════════════════════════════ */
  function _render() {
    if (!displayCanvas || !workingPixels) return;

    const w = displayCanvas.width;
    const h = displayCanvas.height;
    displayCtx.clearRect(0, 0, w, h);

    // Apply pixel-level effects (sharpen, emboss, etc.)
    let pixData = workingPixels;
    if (effects.sharpen > 0) pixData = _applySharpen(pixData, effects.sharpen / 100);
    if (effects.emboss)      pixData = _applyEmboss(pixData);
    if (effects.warmth !== 0) pixData = _applyWarmth(pixData, effects.warmth);

    displayCtx.putImageData(pixData, 0, 0);

    // Apply CSS-filter-level effects via off-screen composite
    const filterStr = _buildFilterString();
    if (filterStr !== 'none') {
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const tc = tmp.getContext('2d');
      tc.filter = filterStr;
      tc.drawImage(displayCanvas, 0, 0);
      displayCtx.clearRect(0, 0, w, h);
      displayCtx.drawImage(tmp, 0, 0);
    }

    // Vignette overlay
    if (effects.vignette > 0) _applyVignetteOverlay(effects.vignette);

    if (onDirtyCallback) onDirtyCallback();
  }

  function _buildFilterString() {
    const parts = [];
    if (effects.brightness !== 100) parts.push(`brightness(${effects.brightness / 100})`);
    if (effects.contrast   !== 100) parts.push(`contrast(${effects.contrast / 100})`);
    if (effects.saturation !== 100) parts.push(`saturate(${effects.saturation / 100})`);
    if (effects.hue        !== 0)   parts.push(`hue-rotate(${effects.hue}deg)`);
    if (effects.blur       !== 0)   parts.push(`blur(${effects.blur}px)`);
    if (effects.grayscale  !== 0)   parts.push(`grayscale(${effects.grayscale / 100})`);
    if (effects.sepia      !== 0)   parts.push(`sepia(${effects.sepia / 100})`);
    if (effects.invert     !== 0)   parts.push(`invert(${effects.invert / 100})`);
    return parts.length ? parts.join(' ') : 'none';
  }

  function _applyVignetteOverlay(amount) {
    const w = displayCanvas.width, h = displayCanvas.height;
    const cx = w / 2, cy = h / 2;
    const r  = Math.sqrt(cx * cx + cy * cy);
    const gradient = displayCtx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${amount / 100})`);
    displayCtx.fillStyle = gradient;
    displayCtx.fillRect(0, 0, w, h);
  }

  /* ═══════════════════════════════════════════
     Convolution Effects
  ═══════════════════════════════════════════ */
  function _applyKernel(imageData, kernel, divisor, offset) {
    const src  = new Uint8ClampedArray(imageData.data);
    const dst  = new Uint8ClampedArray(imageData.data.length);
    const w    = imageData.width, h = imageData.height;
    const kSize = Math.sqrt(kernel.length) | 0;
    const half  = (kSize - 1) / 2 | 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let ky = 0; ky < kSize; ky++) {
          for (let kx = 0; kx < kSize; kx++) {
            const px = Math.min(Math.max(x + kx - half, 0), w - 1);
            const py = Math.min(Math.max(y + ky - half, 0), h - 1);
            const idx = (py * w + px) * 4;
            const k   = kernel[ky * kSize + kx];
            r += src[idx]     * k;
            g += src[idx + 1] * k;
            b += src[idx + 2] * k;
          }
        }
        const i = (y * w + x) * 4;
        dst[i]     = Math.min(255, Math.max(0, r / divisor + offset));
        dst[i + 1] = Math.min(255, Math.max(0, g / divisor + offset));
        dst[i + 2] = Math.min(255, Math.max(0, b / divisor + offset));
        dst[i + 3] = src[i + 3];
      }
    }
    return new ImageData(dst, w, h);
  }

  function _applySharpen(imgData, strength) {
    // Unsharp mask – blend sharpened with original
    const k = strength;
    const kernel = [
      0,    -k,     0,
      -k,  1 + 4*k, -k,
      0,    -k,     0,
    ];
    return _applyKernel(imgData, kernel, 1, 0);
  }

  function _applyEmboss(imgData) {
    const kernel = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
    return _applyKernel(imgData, kernel, 1, 128);
  }

  function _applyEdgeDetect(imgData) {
    const kernel = [-1,-1,-1, -1, 8,-1, -1,-1,-1];
    return _applyKernel(imgData, kernel, 1, 0);
  }

  function _applyWarmth(imgData, amount) {
    const data = new Uint8ClampedArray(imgData.data);
    const warm = amount / 100;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.min(255, data[i]     + warm * 30);
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] - warm * 20));
    }
    return new ImageData(data, imgData.width, imgData.height);
  }

  /* ═══════════════════════════════════════════
     Effects API
  ═══════════════════════════════════════════ */
  function setEffect(key, value) {
    if (!(key in effects)) return;
    effects[key] = value;
    _render();
  }

  function getEffects() { return { ...effects }; }

  function _resetEffects() {
    effects.brightness = 100; effects.contrast  = 100; effects.saturation = 100;
    effects.hue = 0;   effects.blur = 0;   effects.grayscale  = 0;
    effects.sepia = 0; effects.invert = 0; effects.sharpen = 0;
    effects.emboss = false; effects.vignette = 0; effects.warmth = 0;
  }

  function resetEffects() { _resetEffects(); _render(); }

  function applyPreset(name) {
    _resetEffects();
    if (name === 'grayscale')  { effects.grayscale  = 100; }
    if (name === 'sepia')      { effects.sepia       = 100; effects.saturation = 60; }
    if (name === 'invert')     { effects.invert      = 100; }
    if (name === 'vivid')      { effects.saturation  = 160; effects.contrast   = 115; }
    if (name === 'fade')       { effects.brightness  = 120; effects.saturation = 60; effects.contrast = 85; }
    if (name === 'cool')       { effects.hue = -20; effects.saturation = 90; }
    if (name === 'warm')       { effects.warmth = 60; effects.saturation = 110; }
    if (name === 'vintage')    { effects.sepia = 40; effects.saturation = 70; effects.contrast = 90; effects.vignette = 50; }
    if (name === 'dramatic')   { effects.contrast = 150; effects.grayscale = 30; effects.vignette = 40; }
    if (name === 'emboss')     { effects.emboss = true; effects.grayscale = 100; }
    _render();
  }

  /* ═══════════════════════════════════════════
     Transform
  ═══════════════════════════════════════════ */
  function rotate(deg) {
    rotation = ((rotation + deg) % 360 + 360) % 360;
    clearSelection();
    _resizeCanvases();
    _drawOriginalToWorking();
    _render();
  }

  function flip(axis) {
    if (axis === 'h') flipH = !flipH;
    else              flipV = !flipV;
    clearSelection();
    _drawOriginalToWorking();
    _render();
  }

  function resetTransform() {
    rotation = 0; flipH = false; flipV = false;
    clearSelection();
    _resizeCanvases();
    _drawOriginalToWorking();
    _render();
  }

  /* ═══════════════════════════════════════════
     Selection Tools
  ═══════════════════════════════════════════ */
  function setTool(tool) {
    currentTool = tool;
    selCanvas.style.cursor =
      tool === 'pointer'   ? 'default' :
      tool === 'magic-wand'? 'crosshair' : 'crosshair';
    if (tool === 'pointer') clearSelection();
  }

  function getTool() { return currentTool; }

  /* ── Mouse events ── */
  function _canvasPoint(e) {
    const rect = selCanvas.getBoundingClientRect();
    // Account for CSS scaling (canvas is CSS-scaled to viewport)
    const scaleX = selCanvas.width  / rect.width;
    const scaleY = selCanvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top)  * scaleY),
    };
  }

  function _onSelMouseDown(e) {
    if (currentTool === 'pointer') return;
    e.preventDefault();
    const p = _canvasPoint(e);

    if (currentTool === 'rect-select') {
      isDrawingSelection = true;
      selStartX = p.x; selStartY = p.y;
      selectionPath = [p];
    } else if (currentTool === 'lasso') {
      isDrawingSelection = true;
      selectionPath = [p];
    } else if (currentTool === 'polygon') {
      if (!isDrawingSelection) {
        isDrawingSelection = true;
        polygonPoints = [p];
      } else {
        polygonPoints.push(p);
      }
      _drawPolygonInProgress(null);
    } else if (currentTool === 'magic-wand') {
      _doMagicWand(p.x, p.y);
    }
  }

  function _onSelMouseMove(e) {
    const p = _canvasPoint(e);

    if (currentTool === 'polygon' && isDrawingSelection) {
      _drawPolygonInProgress(p);
      return;
    }
    if (!isDrawingSelection) return;

    if (currentTool === 'rect-select') {
      _drawRectPreview(selStartX, selStartY, p.x, p.y);
    } else if (currentTool === 'lasso') {
      selectionPath.push(p);
      _drawLassoInProgress();
    }
  }

  function _onSelMouseUp(e) {
    if (!isDrawingSelection && currentTool !== 'polygon') return;
    const p = _canvasPoint(e);

    if (currentTool === 'rect-select') {
      isDrawingSelection = false;
      const x1 = Math.min(selStartX, p.x), y1 = Math.min(selStartY, p.y);
      const x2 = Math.max(selStartX, p.x), y2 = Math.max(selStartY, p.y);
      if (x2 - x1 > 2 && y2 - y1 > 2) {
        selectionPath = [
          {x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}
        ];
        selectionType = 'rect';
        _buildMaskFromPath(selectionPath);
        _drawSelectionMarching();
      } else {
        clearSelection();
      }
    } else if (currentTool === 'lasso') {
      isDrawingSelection = false;
      if (selectionPath.length > 4) {
        selectionType = 'lasso';
        _buildMaskFromPath(selectionPath);
        _drawSelectionMarching();
      } else {
        clearSelection();
      }
    }

    if (onSelectionChange) onSelectionChange(!!selMask);
  }

  function _onSelDblClick(e) {
    if (currentTool !== 'polygon') return;
    isDrawingSelection = false;
    if (polygonPoints.length >= 3) {
      selectionPath = polygonPoints.slice();
      selectionType = 'polygon';
      _buildMaskFromPath(selectionPath);
      _drawSelectionMarching();
    } else {
      clearSelection();
    }
    polygonPoints = [];
    if (onSelectionChange) onSelectionChange(!!selMask);
  }

  /* ── Draw selection visuals ── */
  const SEL_COLOR_BRIGHT = '#FFD700';
  const SEL_COLOR_DARK   = 'rgba(0,0,0,0.6)';
  const SEL_DASH         = [6, 4];

  function _selStroke(ctx, color, offset) {
    ctx.strokeStyle  = color;
    ctx.lineWidth    = 1.5;
    ctx.setLineDash(SEL_DASH);
    ctx.lineDashOffset = offset || 0;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  function _drawRectPreview(x1, y1, x2, y2) {
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    const rx = Math.min(x1,x2), ry = Math.min(y1,y2);
    const rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
    selCtx.beginPath();
    selCtx.rect(rx, ry, rw, rh);
    selCtx.fillStyle = 'rgba(255,215,0,0.08)';
    selCtx.fill();
    _selStroke(selCtx, SEL_COLOR_BRIGHT, 0);
    selCtx.beginPath();
    selCtx.rect(rx, ry, rw, rh);
    _selStroke(selCtx, SEL_COLOR_DARK, SEL_DASH[0]);
  }

  function _drawLassoInProgress() {
    if (!selectionPath.length) return;
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    selCtx.beginPath();
    selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
    for (let i = 1; i < selectionPath.length; i++) {
      selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
    }
    _selStroke(selCtx, SEL_COLOR_BRIGHT, 0);
    selCtx.beginPath();
    selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
    for (let i = 1; i < selectionPath.length; i++) {
      selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
    }
    _selStroke(selCtx, SEL_COLOR_DARK, SEL_DASH[0]);
  }

  function _drawPolygonInProgress(cursor) {
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    if (!polygonPoints.length) return;

    selCtx.beginPath();
    selCtx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      selCtx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (cursor) selCtx.lineTo(cursor.x, cursor.y);
    _selStroke(selCtx, SEL_COLOR_BRIGHT, 0);

    selCtx.beginPath();
    selCtx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      selCtx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (cursor) selCtx.lineTo(cursor.x, cursor.y);
    _selStroke(selCtx, SEL_COLOR_DARK, SEL_DASH[0]);

    // Draw vertex dots
    polygonPoints.forEach(pt => {
      selCtx.beginPath();
      selCtx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      selCtx.fillStyle = SEL_COLOR_BRIGHT;
      selCtx.fill();
      selCtx.strokeStyle = '#333';
      selCtx.lineWidth = 1;
      selCtx.setLineDash([]);
      selCtx.stroke();
    });
  }

  function _drawSelectionMarching() {
    if (!selMask) return;
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    if (!selectionPath || !selectionPath.length) return;

    selCtx.beginPath();
    selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
    for (let i = 1; i < selectionPath.length; i++) {
      selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
    }
    selCtx.closePath();

    selCtx.fillStyle = 'rgba(255,215,0,0.1)';
    selCtx.fill();

    selCtx.beginPath();
    selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
    for (let i = 1; i < selectionPath.length; i++) {
      selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
    }
    selCtx.closePath();
    _selStroke(selCtx, SEL_COLOR_BRIGHT, 0);

    selCtx.beginPath();
    selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
    for (let i = 1; i < selectionPath.length; i++) {
      selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
    }
    selCtx.closePath();
    _selStroke(selCtx, SEL_COLOR_DARK, SEL_DASH[0]);
  }

  /* ── Build pixel mask from polygon path ── */
  function _buildMaskFromPath(path) {
    const w = displayCanvas.width, h = displayCanvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w; offscreen.height = h;
    const oc = offscreen.getContext('2d');

    oc.beginPath();
    oc.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) oc.lineTo(path[i].x, path[i].y);
    oc.closePath();
    oc.fillStyle = '#fff';
    oc.fill();

    const imgData = oc.getImageData(0, 0, w, h);
    selMask = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
      selMask[i] = imgData.data[i * 4 + 3] > 128 ? 255 : 0;
    }
  }

  /* ── Magic Wand ── */
  function _doMagicWand(seedX, seedY) {
    if (!workingPixels) return;
    const w    = workingPixels.width, h = workingPixels.height;
    if (seedX < 0 || seedX >= w || seedY < 0 || seedY >= h) return;

    const data = workingPixels.data;
    const idx0 = (seedY * w + seedX) * 4;
    const sr = data[idx0], sg = data[idx0+1], sb = data[idx0+2];
    const tol = magicTolerance;

    selMask = new Uint8ClampedArray(w * h);
    const visited = new Uint8Array(w * h);
    const queue = [seedX + seedY * w];
    visited[seedX + seedY * w] = 1;

    while (queue.length) {
      const pos = queue.pop();
      const px = pos % w, py = (pos / w) | 0;
      const idx = pos * 4;
      const dr = Math.abs(data[idx] - sr);
      const dg = Math.abs(data[idx+1] - sg);
      const db = Math.abs(data[idx+2] - sb);
      if (dr + dg + db > tol * 3) continue;
      selMask[pos] = 255;

      const neighbors = [
        px-1+py*w, px+1+py*w, px+(py-1)*w, px+(py+1)*w
      ];
      for (const n of neighbors) {
        const nx = n % w, ny = (n / w)|0;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (!visited[n]) { visited[n] = 1; queue.push(n); }
      }
    }

    // Build visual path from mask border (simplified – use bounding box outline)
    let x1=w,y1=h,x2=0,y2=0;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (selMask[y*w+x]) { x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y); }
    }
    selectionPath = [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
    selectionType = 'magic';
    _drawMagicWandOverlay();
    if (onSelectionChange) onSelectionChange(true);
  }

  function _drawMagicWandOverlay() {
    if (!selMask) return;
    const w = displayCanvas.width, h = displayCanvas.height;
    selCtx.clearRect(0, 0, w, h);

    const imgData = selCtx.createImageData(w, h);
    for (let i = 0; i < selMask.length; i++) {
      if (selMask[i]) {
        imgData.data[i*4]   = 255;
        imgData.data[i*4+1] = 215;
        imgData.data[i*4+2] = 0;
        imgData.data[i*4+3] = 50;
      }
    }
    selCtx.putImageData(imgData, 0, 0);
    // Draw bounding box outline
    if (selectionPath && selectionPath.length) {
      selCtx.beginPath();
      selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
      for (let i = 1; i < selectionPath.length; i++) selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
      selCtx.closePath();
      _selStroke(selCtx, SEL_COLOR_BRIGHT, 0);
      selCtx.beginPath();
      selCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
      for (let i = 1; i < selectionPath.length; i++) selCtx.lineTo(selectionPath[i].x, selectionPath[i].y);
      selCtx.closePath();
      _selStroke(selCtx, SEL_COLOR_DARK, SEL_DASH[0]);
    }
  }

  function setMagicTolerance(val) { magicTolerance = val; }

  /* ═══════════════════════════════════════════
     Background Removal
  ═══════════════════════════════════════════ */
  function removeBackground(removeInside = false) {
    if (!selMask || !workingPixels) return false;

    _saveHistory();

    const data = workingPixels.data;
    for (let i = 0; i < selMask.length; i++) {
      const inside = selMask[i] > 0;
      // removeInside=true → clear selected area; false → clear outside (background)
      if (inside !== removeInside) {
        data[i * 4 + 3] = 0; // transparent
      }
    }
    _render();
    return true;
  }

  function fillSelection(r, g, b, a = 255) {
    if (!selMask || !workingPixels) return false;
    _saveHistory();
    const data = workingPixels.data;
    for (let i = 0; i < selMask.length; i++) {
      if (selMask[i]) {
        data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a;
      }
    }
    _render();
    return true;
  }

  function cropToSelection() {
    if (!selMask || !selectionPath || !workingPixels) return false;
    _saveHistory();

    const w = workingPixels.width, h = workingPixels.height;
    let x1=w,y1=h,x2=0,y2=0;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (selMask[y*w+x]) { x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y); }
    }
    if (x2<=x1||y2<=y1) return false;

    const cw=x2-x1, ch=y2-y1;
    const offscreen = document.createElement('canvas');
    offscreen.width=cw; offscreen.height=ch;
    const oc=offscreen.getContext('2d');
    oc.putImageData(workingPixels, -x1, -y1);

    // Re-apply mask to crop canvas
    const cropped = oc.getImageData(0,0,cw,ch);
    for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) {
      const globalI=(y+y1)*w+(x+x1);
      if (!selMask[globalI]) cropped.data[(y*cw+x)*4+3]=0;
    }

    displayCanvas.width = cw; displayCanvas.height = ch;
    selCanvas.width = cw; selCanvas.height = ch;
    workingPixels = cropped;
    naturalW = cw; naturalH = ch;
    clearSelection();
    _render();
    return true;
  }

  function clearSelection() {
    selMask = null; selectionPath = null; selectionType = null;
    isDrawingSelection = false; polygonPoints = [];
    if (selCtx && selCanvas) selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    if (onSelectionChange) onSelectionChange(false);
  }

  function hasSelection() { return selMask !== null; }

  /* ─── Cut: copy selection → clipboard data URL, then erase pixels ─── */
  function cut() {
    if (!selMask || !workingPixels) return null;
    _saveHistory();

    const w = workingPixels.width, h = workingPixels.height;
    let x1=w, y1=h, x2=0, y2=0;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (selMask[y*w+x]) { x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y); }
    }
    if (x2<=x1 || y2<=y1) return null;

    const cw=x2-x1, ch=y2-y1;
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width=cw; cutCanvas.height=ch;
    const cc = cutCanvas.getContext('2d');
    const region = new ImageData(
      new Uint8ClampedArray(workingPixels.data.buffer, 0, workingPixels.data.length),
      w, h
    );
    cc.putImageData(workingPixels, -x1, -y1);
    // Mask out non-selected area in cut canvas
    const cutData = cc.getImageData(0,0,cw,ch);
    for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) {
      if (!selMask[(y+y1)*w+(x+x1)]) cutData.data[(y*cw+x)*4+3]=0;
    }
    cc.putImageData(cutData,0,0);
    const dataUrl = cutCanvas.toDataURL('image/png');

    // Erase selection from working pixels
    for (let i=0;i<selMask.length;i++) {
      if (selMask[i]) workingPixels.data[i*4+3]=0;
    }

    clearSelection();
    _render();
    return dataUrl;
  }

  /* ─── Copy selection to data URL ─── */
  function copySelection() {
    if (!selMask || !workingPixels) return null;
    const w = workingPixels.width, h = workingPixels.height;
    let x1=w, y1=h, x2=0, y2=0;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (selMask[y*w+x]) { x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y); }
    }
    if (x2<=x1 || y2<=y1) return null;
    const cw=x2-x1, ch=y2-y1;
    const c = document.createElement('canvas'); c.width=cw; c.height=ch;
    const ctx2 = c.getContext('2d');
    ctx2.putImageData(workingPixels, -x1, -y1);
    const d = ctx2.getImageData(0,0,cw,ch);
    for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) {
      if (!selMask[(y+y1)*w+(x+x1)]) d.data[(y*cw+x)*4+3]=0;
    }
    ctx2.putImageData(d,0,0);
    return c.toDataURL('image/png');
  }

  /* ═══════════════════════════════════════════
     History (Undo / Redo)
  ═══════════════════════════════════════════ */
  function _saveHistory() {
    if (!workingPixels) return;
    if (histIndex < history.length - 1) history.splice(histIndex + 1);
    history.push(new ImageData(
      new Uint8ClampedArray(workingPixels.data),
      workingPixels.width, workingPixels.height
    ));
    if (history.length > MAX_HISTORY) history.shift();
    histIndex = history.length - 1;
  }

  function undo() {
    if (histIndex <= 0) return false;
    histIndex--;
    workingPixels = new ImageData(
      new Uint8ClampedArray(history[histIndex].data),
      history[histIndex].width, history[histIndex].height
    );
    clearSelection();
    _render();
    return true;
  }

  function redo() {
    if (histIndex >= history.length - 1) return false;
    histIndex++;
    workingPixels = new ImageData(
      new Uint8ClampedArray(history[histIndex].data),
      history[histIndex].width, history[histIndex].height
    );
    clearSelection();
    _render();
    return true;
  }

  function canUndo() { return histIndex > 0; }
  function canRedo() { return histIndex < history.length - 1; }

  /* ═══════════════════════════════════════════
     Export / Save
  ═══════════════════════════════════════════ */
  function exportAsDataUrl(format = 'image/png', quality = 0.95) {
    return displayCanvas ? displayCanvas.toDataURL(format, quality) : null;
  }

  function getCanvasElement() { return displayCanvas; }

  function isLoaded() { return !!workingPixels; }

  function getDimensions() {
    if (!displayCanvas) return { w: 0, h: 0 };
    return { w: displayCanvas.width, h: displayCanvas.height };
  }

  function getRotation()   { return rotation; }
  function getFlipState()  { return { flipH, flipV }; }

  return {
    init, setCallbacks, loadImage,
    setEffect, getEffects, resetEffects, applyPreset,
    rotate, flip, resetTransform,
    setTool, getTool, clearSelection, hasSelection,
    removeBackground, fillSelection, cropToSelection, cut, copySelection,
    setMagicTolerance,
    undo, redo, canUndo, canRedo,
    exportAsDataUrl, getCanvasElement, isLoaded,
    getDimensions, getRotation, getFlipState,
    _applyEdgeDetect,
  };
})();
