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
    sharpen: 0, emboss: false, edge: false, vignette: 0, warmth: 0, grain: 0, posterize: 0,
    solarize: 0, tiltShift: 0,
    borderWidth: 0, borderColor: '#ffffff', borderShadow: 0,
    borderShadowStyle: 'soft', borderShadowDir: 'br',
    borderCaption: false, borderCaptionPos: 'bl', borderCaptionText: '',
    borderCaptionFont: 'Segoe UI',
    borderCaptionFontSize: 16,
    borderCaptionColor: '',
    borderCaptionBold: false,
    borderCaptionItalic: false,
    borderCaptionUnderline: false,
    borderCaptionStrike: false,
  };

  let captionLines = [];
  let captionValues = {};

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
  let onHistoryChange   = null;
  let _restoringHistory = false;

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

  function setCallbacks(dirty, selChange, histChange) {
    onDirtyCallback   = dirty;
    onSelectionChange = selChange;
    onHistoryChange   = histChange;
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
    _saveHistory();
  }

  /**
   * Swap the source picture (same size) while keeping rotation / flip / effects —
   * used when a DICOM is re-rendered with another window or frame. Pixel edits
   * (crop, background removal …) belong to the previous rendering and are dropped.
   */
  function replaceSource(img) {
    if (!img) return false;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return false;
    const sameSize = w === naturalW && h === naturalH;
    originalImg = img;
    naturalW = w;
    naturalH = h;
    originalPixels = null;
    if (!sameSize) clearSelection();
    history.length = 0; histIndex = -1;
    _resizeCanvases();
    _drawOriginalToWorking();
    _render();
    _saveHistory();
    return true;
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
  function _frameLayout() {
    const photoW = workingPixels ? workingPixels.width : 0;
    const photoH = workingPixels ? workingPixels.height : 0;
    let pad = Math.max(0, Math.round(Number(effects.borderWidth) || 0));
    const shadow = Math.max(0, Math.round(Number(effects.borderShadow) || 0));
    const captionOn = !!effects.borderCaption;
    const style = effects.borderShadowStyle || 'soft';
    return {
      photoW, photoH, pad, shadow, shadowPad: 0, inset: pad, captionOn,
      outW: Math.max(1, photoW + pad * 2),
      outH: Math.max(1, photoH + pad * 2),
      color: effects.borderColor || '#ffffff',
      captionPos: effects.borderCaptionPos || 'bl',
      shadowStyle: style,
      shadowDir: effects.borderShadowDir || 'br',
    };
  }

  function _contrastText(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#222222';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.55 ? '#222222' : '#f4f4f4';
  }

  function _composePhoto() {
    const w = workingPixels.width;
    const h = workingPixels.height;
    const photo = document.createElement('canvas');
    photo.width = w;
    photo.height = h;
    const pc = photo.getContext('2d');

    let pixData = workingPixels;
    if (effects.sharpen > 0) pixData = _applySharpen(pixData, effects.sharpen / 100);
    if (effects.emboss)      pixData = _applyEmboss(pixData);
    if (effects.edge)        pixData = _applyEdgeDetect(pixData);
    if (effects.warmth !== 0) pixData = _applyWarmth(pixData, effects.warmth);
    pc.putImageData(pixData, 0, 0);

    const filterStr = _buildFilterString();
    if (filterStr !== 'none') {
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const tc = tmp.getContext('2d');
      tc.filter = filterStr;
      tc.drawImage(photo, 0, 0);
      pc.clearRect(0, 0, w, h);
      pc.drawImage(tmp, 0, 0);
    }
    if (effects.tiltShift > 0) _applyMiniatureDof(pc, w, h, effects.tiltShift);
    if (effects.vignette > 0) _applyVignetteOverlay(pc, w, h, effects.vignette);
    if (effects.posterize > 1) {
      const p = _applyPosterize(pc.getImageData(0, 0, w, h), effects.posterize);
      pc.putImageData(p, 0, 0);
    }
    if (effects.solarize > 0) {
      const s = _applySolarize(pc.getImageData(0, 0, w, h), effects.solarize);
      pc.putImageData(s, 0, 0);
    }
    if (effects.grain > 0) {
      const g = _applyGrain(pc.getImageData(0, 0, w, h), effects.grain);
      pc.putImageData(g, 0, 0);
    }
    return photo;
  }

  function _smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x < edge0 ? 0 : 1;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Miniature / diorama (tilt-shift style).
   * Dual-plane DOF (medium + heavy blur) + crisp focus band + toy-model grade.
   */
  function _applyMiniatureDof(pc, w, h, amount) {
    const a = Math.max(0, Math.min(100, Number(amount) || 0));
    if (a <= 0 || w < 2 || h < 2) return;

    const t = a / 100;
    // Slightly below center — typical looking-down city / tabletop
    const focusY = 0.54;
    // Focus island: readable at low amount, selective at high
    const sharpHalf = 0.08 + (1 - t) * 0.10;  // ~8–18% each side
    const feather = 0.14 + (1 - t) * 0.12;    // soft lens-like falloff

    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sc = src.getContext('2d');
    sc.drawImage(pc.canvas, 0, 0);

    // Crisp in-focus plate (toy-detail punch)
    const sharp = document.createElement('canvas');
    sharp.width = w;
    sharp.height = h;
    const shc = sharp.getContext('2d');
    const crisp = 1 + t * 0.35;
    shc.filter = `contrast(${(1.04 + t * 0.08).toFixed(2)}) saturate(${(1.05 + t * 0.12).toFixed(2)})`;
    shc.drawImage(src, 0, 0);
    shc.filter = 'none';
    // Subtle unsharp via overlay of a lightened copy
    if (t > 0.15) {
      shc.save();
      shc.globalCompositeOperation = 'overlay';
      shc.globalAlpha = 0.08 + t * 0.12;
      shc.filter = `contrast(${crisp.toFixed(2)})`;
      shc.drawImage(src, 0, 0);
      shc.filter = 'none';
      shc.restore();
    }

    const makeBlurPlate = (scale, cssBlur) => {
      const dw = Math.max(8, Math.round(w * scale));
      const dh = Math.max(8, Math.round(h * scale));
      const small = document.createElement('canvas');
      small.width = dw;
      small.height = dh;
      const smc = small.getContext('2d');
      smc.imageSmoothingEnabled = true;
      smc.imageSmoothingQuality = 'high';
      smc.drawImage(src, 0, 0, dw, dh);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const oc = out.getContext('2d');
      oc.imageSmoothingEnabled = true;
      oc.imageSmoothingQuality = 'high';
      oc.drawImage(small, 0, 0, w, h);
      if (cssBlur > 0.8) {
        const cream = document.createElement('canvas');
        cream.width = w;
        cream.height = h;
        const crc = cream.getContext('2d');
        crc.filter = `blur(${cssBlur.toFixed(1)}px)`;
        crc.drawImage(out, 0, 0);
        crc.filter = 'none';
        return cream;
      }
      return out;
    };

    // Medium blur (transition zone) + heavy blur (far/near extremes)
    const midScale = Math.max(0.18, 0.38 - t * 0.14);   // 0.38 → 0.24
    const farScale = Math.max(0.10, 0.24 - t * 0.10);   // 0.24 → 0.14
    const midPx = Math.max(1.2, Math.min(h * 0.012, 1.5 + t * 6));
    const farPx = Math.max(2.5, Math.min(h * 0.028, 4 + t * 14));
    const blurMid = makeBlurPlate(midScale, midPx);
    const blurFar = makeBlurPlate(farScale, farPx);

    // Distance masks: mid starts sooner; far ramps harder (power curve)
    const maskMid = document.createElement('canvas');
    maskMid.width = 1;
    maskMid.height = h;
    const mmc = maskMid.getContext('2d');
    const maskFar = document.createElement('canvas');
    maskFar.width = 1;
    maskFar.height = h;
    const mfc = maskFar.getContext('2d');

    for (let y = 0; y < h; y++) {
      const ny = y / (h - 1 || 1);
      const dist = Math.abs(ny - focusY);
      // Stronger blur toward camera (bottom) — tabletop / aerial cue
      const bias = ny > focusY ? 1.12 : 0.92;
      const d = dist * bias;
      const midAmt = _smoothstep(sharpHalf * 0.85, sharpHalf + feather, d);
      // Far blur engages later and reaches full sooner at high amounts
      const farAmt = Math.pow(_smoothstep(sharpHalf + feather * 0.35, sharpHalf + feather * 1.35, d), 0.85);
      if (midAmt > 0.002) {
        mmc.fillStyle = `rgba(0,0,0,${Math.min(1, midAmt)})`;
        mmc.fillRect(0, y, 1, 1);
      }
      if (farAmt > 0.002) {
        mfc.fillStyle = `rgba(0,0,0,${Math.min(1, farAmt)})`;
        mfc.fillRect(0, y, 1, 1);
      }
    }

    const stretchMask = (col) => {
      const full = document.createElement('canvas');
      full.width = w;
      full.height = h;
      const c = full.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(col, 0, 0, w, h);
      return full;
    };
    const midMaskFull = stretchMask(maskMid);
    const farMaskFull = stretchMask(maskFar);

    const applyMasked = (blurPlate, maskFull) => {
      const layer = document.createElement('canvas');
      layer.width = w;
      layer.height = h;
      const lc = layer.getContext('2d');
      lc.drawImage(blurPlate, 0, 0);
      lc.globalCompositeOperation = 'destination-in';
      lc.drawImage(maskFull, 0, 0);
      return layer;
    };

    pc.clearRect(0, 0, w, h);
    pc.drawImage(sharp, 0, 0);
    pc.drawImage(applyMasked(blurMid, midMaskFull), 0, 0);
    pc.drawImage(applyMasked(blurFar, farMaskFull), 0, 0);

    // Toy / model-paint grade
    const sat = 1.22 + t * 0.48;  // 1.22–1.70
    const con = 1.12 + t * 0.26;  // 1.12–1.38
    const bri = 1.04 + t * 0.05;
    const graded = document.createElement('canvas');
    graded.width = w;
    graded.height = h;
    const gc = graded.getContext('2d');
    gc.filter = `saturate(${sat.toFixed(2)}) contrast(${con.toFixed(2)}) brightness(${bri.toFixed(2)})`;
    gc.drawImage(pc.canvas, 0, 0);
    gc.filter = 'none';
    pc.clearRect(0, 0, w, h);
    pc.drawImage(graded, 0, 0);

    // Warm plastic wash + slight midtone pop (model lighting)
    pc.save();
    pc.globalCompositeOperation = 'soft-light';
    pc.globalAlpha = 0.16 + t * 0.22;
    pc.fillStyle = '#ffb060';
    pc.fillRect(0, 0, w, h);
    pc.restore();

    pc.save();
    pc.globalCompositeOperation = 'overlay';
    pc.globalAlpha = 0.06 + t * 0.10;
    pc.fillStyle = '#ffe2b8';
    pc.fillRect(0, 0, w, h);
    pc.restore();

    // Soft edge darkening helps the diorama “stage” read
    if (t > 0.12) {
      const vg = pc.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.28, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(20,10,0,${(0.10 + t * 0.18).toFixed(3)})`);
      pc.fillStyle = vg;
      pc.fillRect(0, 0, w, h);
    }
  }

  function _clipToMat(ctx, frame) {
    ctx.beginPath();
    ctx.rect(0, 0, frame.outW, frame.outH);
    ctx.rect(frame.inset, frame.inset, frame.photoW, frame.photoH);
    ctx.clip('evenodd');
  }

  function _mixHex(hex, other, t) {
    const parse = (h) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
      if (!m) return [255, 255, 255];
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const a = parse(hex), b = parse(other);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  function _shadowDirVec(dir) {
    const map = {
      t: [0, -1], tr: [1, -1], r: [1, 0], br: [1, 1],
      b: [0, 1], bl: [-1, 1], l: [-1, 0], tl: [-1, -1],
      c: [0, 0],
    };
    const v = map[dir] || map.br;
    const len = Math.hypot(v[0], v[1]) || 1;
    return { x: v[0] / len, y: v[1] / len };
  }

  function _shadowOffset(dir, strength) {
    const v = _shadowDirVec(dir);
    const d = Math.max(0, strength * 0.42);
    return { ox: Math.round(v.x * d), oy: Math.round(v.y * d) };
  }

  function _rgbaWithAlpha(rgba, scale) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/.exec(String(rgba || ''));
    if (!m) return rgba;
    const a = (m[4] != null ? Number(m[4]) : 1) * scale;
    return `rgba(${m[1]},${m[2]},${m[3]},${Math.max(0, Math.min(1, a))})`;
  }

  function _matEdgeBands(ctx, x, y, w, h, depth, innerRgba, dir) {
    const d = Math.max(3, Math.round(depth));
    const v = _shadowDirVec(dir || 'c');
    const even = v.x === 0 && v.y === 0;
    // Shadow-facing edges get a stronger band (light comes from the opposite side)
    const weights = even
      ? [1, 1, 1, 1]
      : [
          Math.max(0.15, 0.35 - v.y),
          Math.max(0.15, 0.35 + v.y),
          Math.max(0.15, 0.35 - v.x),
          Math.max(0.15, 0.35 + v.x),
        ];
    const bands = [
      [x - d, y - d, w + d * 2, d, x, y, x, y - d, weights[0]],
      [x - d, y + h, w + d * 2, d, x, y + h, x, y + h + d, weights[1]],
      [x - d, y - d, d, h + d * 2, x, y, x - d, y, weights[2]],
      [x + w, y - d, d, h + d * 2, x + w, y, x + w + d, y, weights[3]],
    ];
    for (const [rx, ry, rw, rh, x0, y0, x1, y1, wt] of bands) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, _rgbaWithAlpha(innerRgba, wt));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    }
  }

  function _drawFrameBevel(ctx, frame, strength) {
    const { outW, outH, pad, color, shadowDir } = frame;
    const d = Math.max(4, Math.min(pad, Math.round(4 + strength * 0.45)));
    const light = _mixHex(color, '#ffffff', 0.45);
    const dark = _mixHex(color, '#000000', 0.38);
    const v = _shadowDirVec(shadowDir || 'br');
    const even = v.x === 0 && v.y === 0;
    // Light comes from the opposite of the shadow direction
    const sides = [
      [0, 0, outW, d, 0, 0, 0, d, even ? light : (v.y < 0 ? dark : light)],
      [0, outH - d, outW, d, 0, outH, 0, outH - d, even ? dark : (v.y > 0 ? dark : light)],
      [0, 0, d, outH, 0, 0, d, 0, even ? light : (v.x < 0 ? dark : light)],
      [outW - d, 0, d, outH, outW, 0, outW - d, 0, even ? dark : (v.x > 0 ? dark : light)],
    ];
    for (const [rx, ry, rw, rh, x0, y0, x1, y1, col] of sides) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, col);
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    }
  }

  function _drawDropOnMat(ctx, frame, blur, ox, oy, rgba) {
    const { inset, photoW, photoH } = frame;
    ctx.save();
    ctx.shadowColor = rgba;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = ox;
    ctx.shadowOffsetY = oy;
    ctx.fillStyle = '#000';
    ctx.fillRect(inset, inset, photoW, photoH);
    ctx.restore();
  }

  function _drawMatShadow(ctx, frame) {
    const { pad, shadow, inset, photoW, photoH, color, shadowStyle, shadowDir } = frame;
    if (pad <= 0) return;
    const style = shadowStyle || 'soft';
    const dir = shadowDir || 'br';
    const s = shadow;
    if (s <= 0 && style !== 'line' && style !== 'double' && style !== 'groove') return;

    const x = inset, y = inset, w = photoW, h = photoH;
    const a = Math.min(0.52, 0.14 + s / 78);
    const off = _shadowOffset(dir, s);

    switch (style) {
      case 'inset':
        ctx.save();
        _clipToMat(ctx, frame);
        _matEdgeBands(ctx, x, y, w, h, Math.max(4, s * 0.9), `rgba(0,0,0,${a})`, dir);
        ctx.restore();
        break;
      case 'raised':
        ctx.save();
        _clipToMat(ctx, frame);
        _matEdgeBands(ctx, x, y, w, h, Math.max(3, s * 0.45), `rgba(255,255,255,${Math.min(0.5, a + 0.08)})`, ({
          t: 'b', tr: 'bl', r: 'l', br: 'tl', b: 't', bl: 'tr', l: 'r', tl: 'br', c: 'c',
        })[dir] || 'tl');
        ctx.restore();
        _drawDropOnMat(ctx, frame, s * 1.1, off.ox, off.oy, `rgba(0,0,0,${a})`);
        break;
      case 'bevel':
        ctx.save();
        _clipToMat(ctx, frame);
        _drawFrameBevel(ctx, frame, s || 12);
        _matEdgeBands(ctx, x, y, w, h, Math.max(3, (s || 12) * 0.35), `rgba(0,0,0,${Math.min(0.35, a)})`, dir);
        ctx.restore();
        break;
      case 'groove': {
        ctx.save();
        _clipToMat(ctx, frame);
        const gap = Math.max(2, Math.min(pad - 4, 3 + Math.round(s * 0.08)));
        const t = Math.max(1, Math.round(1 + s / 18));
        ctx.strokeStyle = _mixHex(color, '#000000', 0.35);
        ctx.lineWidth = t;
        ctx.strokeRect(x - gap + t / 2, y - gap + t / 2, w + gap * 2 - t, h + gap * 2 - t);
        ctx.strokeStyle = _mixHex(color, '#ffffff', 0.35);
        ctx.strokeRect(x - gap - t / 2, y - gap - t / 2, w + gap * 2 + t, h + gap * 2 + t);
        ctx.restore();
        break;
      }
      case 'line': {
        ctx.save();
        _clipToMat(ctx, frame);
        const gap = Math.max(2, Math.min(pad - 3, 3 + Math.round(s * 0.06)));
        ctx.strokeStyle = _contrastText(color);
        ctx.globalAlpha = Math.min(0.85, 0.35 + s / 60);
        ctx.lineWidth = Math.max(1, Math.round(1 + s / 20));
        ctx.strokeRect(x - gap, y - gap, w + gap * 2, h + gap * 2);
        ctx.restore();
        break;
      }
      case 'glow': {
        const lightMat = _contrastText(color) === '#222222';
        const glow = lightMat
          ? `rgba(0,0,0,${a})`
          : `rgba(255,255,255,${Math.min(0.65, a + 0.12)})`;
        _drawDropOnMat(ctx, frame, Math.max(6, s * 1.7), off.ox, off.oy, glow);
        break;
      }
      case 'double': {
        ctx.save();
        _clipToMat(ctx, frame);
        const band = Math.max(3, Math.min(pad - 2, 4 + Math.round(s * 0.35)));
        ctx.fillStyle = _mixHex(color, '#000000', 0.16);
        ctx.fillRect(x - band, y - band, w + band * 2, h + band * 2);
        ctx.strokeStyle = _mixHex(color, '#ffffff', 0.2);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
        ctx.restore();
        break;
      }
      default:
        _drawDropOnMat(
          ctx, frame,
          Math.max(4, s * 1.15),
          off.ox,
          off.oy,
          `rgba(0,0,0,${a})`
        );
        break;
    }
  }

  function _drawFrame(photo, frame) {
    const { pad, inset, color, outW, outH } = frame;
    displayCtx.clearRect(0, 0, outW, outH);
    if (pad > 0) {
      displayCtx.fillStyle = color;
      displayCtx.fillRect(0, 0, outW, outH);
      _drawMatShadow(displayCtx, frame);
    }
    displayCtx.drawImage(photo, inset, inset);
    if (frame.captionOn) _drawCaption(frame);
  }

  function _resolveCaptionText() {
    let tpl = String(effects.borderCaptionText || '').trim();
    if (!tpl) tpl = (captionLines || []).map((s) => String(s).trim()).filter(Boolean).join('  ·  ');
    const resolved = tpl.replace(/\{([a-z0-9]+)\}/gi, (_, k) => {
      const v = captionValues[String(k).toLowerCase()];
      return v == null || v === '' ? '' : String(v);
    });
    return resolved
      .replace(/(?:\s*·\s*){2,}/g, '  ·  ')
      .replace(/^\s*·\s*|\s*·\s*$/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function _wrapCaptionLines(ctx, text, maxW, maxLines) {
    const raw = String(text || '').split(/\n/);
    const lines = [];
    for (const para of raw) {
      if (lines.length >= maxLines) break;
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        if (lines.length) lines.push('');
        continue;
      }
      let cur = '';
      for (const word of words) {
        const trial = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
        else {
          lines.push(cur);
          cur = word;
          if (lines.length >= maxLines) break;
        }
      }
      if (cur && lines.length < maxLines) lines.push(cur);
    }
    if (!lines.length) return [];
    const last = lines[lines.length - 1];
    if (ctx.measureText(last).width > maxW) {
      let cut = last;
      while (cut.length && ctx.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1);
      lines[lines.length - 1] = cut ? `${cut}…` : '…';
    } else if (raw.join(' ').length > last.length && lines.length >= maxLines) {
      let cut = last;
      while (cut.length && ctx.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1);
      lines[lines.length - 1] = cut ? `${cut}…` : '…';
    }
    return lines.slice(0, maxLines);
  }

  /** Caption font catalog — id used as effects.borderCaptionFont */
  const CAPTION_FONTS = [
    // Korean
    { id: 'Malgun Gothic', label: '맑은 고딕', group: 'kr',
      css: '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif' },
    { id: 'Malgun Gothic Semilight', label: '맑은 고딕 Semilight', group: 'kr',
      css: '"Malgun Gothic Semilight", "Malgun Gothic", "Noto Sans KR", sans-serif' },
    { id: 'Gulim', label: '굴림', group: 'kr',
      css: 'Gulim, "AppleGothic", "Noto Sans KR", sans-serif' },
    { id: 'Dotum', label: '돋움', group: 'kr',
      css: 'Dotum, "AppleGothic", "Noto Sans KR", sans-serif' },
    { id: 'Batang', label: '바탕', group: 'kr',
      css: 'Batang, "AppleMyungjo", "Noto Serif KR", serif' },
    { id: 'Gungsuh', label: '궁서', group: 'kr',
      css: 'Gungsuh, "AppleMyungjo", "Noto Serif KR", serif' },
    { id: 'Noto Sans KR', label: 'Noto Sans KR', group: 'kr',
      css: '"Noto Sans KR", "Malgun Gothic", "Segoe UI", sans-serif' },
    { id: 'Noto Serif KR', label: 'Noto Serif KR', group: 'kr',
      css: '"Noto Serif KR", Batang, "Times New Roman", serif' },
    { id: 'NanumGothic', label: '나눔고딕', group: 'kr',
      css: '"NanumGothic", "Nanum Gothic", "Malgun Gothic", sans-serif' },
    { id: 'NanumMyeongjo', label: '나눔명조', group: 'kr',
      css: '"NanumMyeongjo", "Nanum Myeongjo", Batang, serif' },
    { id: 'NanumBarunGothic', label: '나눔바른고딕', group: 'kr',
      css: '"NanumBarunGothic", "Nanum Barun Gothic", "Malgun Gothic", sans-serif' },
    { id: 'NanumPen', label: '나눔손글씨 펜', group: 'kr',
      css: '"NanumPen", "Nanum Pen Script", "Segoe Print", cursive' },
    { id: 'NanumBrush', label: '나눔손글씨 붓', group: 'kr',
      css: '"NanumBrush", "Nanum Brush Script", "Segoe Script", cursive' },
    { id: 'Pretendard', label: 'Pretendard', group: 'kr',
      css: 'Pretendard, "Malgun Gothic", "Segoe UI", sans-serif' },
    { id: 'IBM Plex Sans KR', label: 'IBM Plex Sans KR', group: 'kr',
      css: '"IBM Plex Sans KR", "Malgun Gothic", sans-serif' },
    // Sans
    { id: 'Segoe UI', label: 'Segoe UI', group: 'sans',
      css: '"Segoe UI", "Malgun Gothic", "Noto Sans KR", sans-serif' },
    { id: 'Segoe UI Light', label: 'Segoe UI Light', group: 'sans',
      css: '"Segoe UI Light", "Segoe UI", "Malgun Gothic", sans-serif' },
    { id: 'Segoe UI Semibold', label: 'Segoe UI Semibold', group: 'sans',
      css: '"Segoe UI Semibold", "Segoe UI", "Malgun Gothic", sans-serif' },
    { id: 'Segoe UI Black', label: 'Segoe UI Black', group: 'sans',
      css: '"Segoe UI Black", "Segoe UI", Impact, sans-serif' },
    { id: 'Arial', label: 'Arial', group: 'sans',
      css: 'Arial, Helvetica, "Malgun Gothic", sans-serif' },
    { id: 'Arial Black', label: 'Arial Black', group: 'sans',
      css: '"Arial Black", Arial, Impact, sans-serif' },
    { id: 'Arial Narrow', label: 'Arial Narrow', group: 'sans',
      css: '"Arial Narrow", Arial, sans-serif' },
    { id: 'Helvetica', label: 'Helvetica', group: 'sans',
      css: 'Helvetica, Arial, "Malgun Gothic", sans-serif' },
    { id: 'Verdana', label: 'Verdana', group: 'sans',
      css: 'Verdana, Geneva, "Malgun Gothic", sans-serif' },
    { id: 'Tahoma', label: 'Tahoma', group: 'sans',
      css: 'Tahoma, Geneva, "Malgun Gothic", sans-serif' },
    { id: 'Trebuchet MS', label: 'Trebuchet MS', group: 'sans',
      css: '"Trebuchet MS", Tahoma, sans-serif' },
    { id: 'Calibri', label: 'Calibri', group: 'sans',
      css: 'Calibri, "Segoe UI", "Malgun Gothic", sans-serif' },
    { id: 'Calibri Light', label: 'Calibri Light', group: 'sans',
      css: '"Calibri Light", Calibri, "Segoe UI", sans-serif' },
    { id: 'Candara', label: 'Candara', group: 'sans',
      css: 'Candara, Calibri, "Segoe UI", sans-serif' },
    { id: 'Corbel', label: 'Corbel', group: 'sans',
      css: 'Corbel, Calibri, "Segoe UI", sans-serif' },
    { id: 'Franklin Gothic Medium', label: 'Franklin Gothic', group: 'sans',
      css: '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif' },
    { id: 'Century Gothic', label: 'Century Gothic', group: 'sans',
      css: '"Century Gothic", CenturyGothic, AppleGothic, sans-serif' },
    { id: 'Gill Sans MT', label: 'Gill Sans MT', group: 'sans',
      css: '"Gill Sans MT", "Gill Sans", Calibri, sans-serif' },
    { id: 'Microsoft Sans Serif', label: 'Microsoft Sans Serif', group: 'sans',
      css: '"Microsoft Sans Serif", Tahoma, sans-serif' },
    { id: 'Yu Gothic', label: 'Yu Gothic', group: 'sans',
      css: '"Yu Gothic", "Malgun Gothic", "Segoe UI", sans-serif' },
    { id: 'Yu Gothic UI', label: 'Yu Gothic UI', group: 'sans',
      css: '"Yu Gothic UI", "Yu Gothic", "Malgun Gothic", sans-serif' },
    { id: 'Microsoft YaHei', label: 'Microsoft YaHei', group: 'sans',
      css: '"Microsoft YaHei", "Malgun Gothic", sans-serif' },
    { id: 'Microsoft JhengHei', label: 'Microsoft JhengHei', group: 'sans',
      css: '"Microsoft JhengHei", "Malgun Gothic", sans-serif' },
    { id: 'Roboto', label: 'Roboto', group: 'sans',
      css: 'Roboto, "Segoe UI", "Malgun Gothic", sans-serif' },
    { id: 'Bahnschrift', label: 'Bahnschrift', group: 'sans',
      css: 'Bahnschrift, "Segoe UI", sans-serif' },
    // Serif
    { id: 'Times New Roman', label: 'Times New Roman', group: 'serif',
      css: '"Times New Roman", Times, Batang, serif' },
    { id: 'Georgia', label: 'Georgia', group: 'serif',
      css: 'Georgia, "Times New Roman", Batang, serif' },
    { id: 'Garamond', label: 'Garamond', group: 'serif',
      css: 'Garamond, "Times New Roman", serif' },
    { id: 'Palatino Linotype', label: 'Palatino Linotype', group: 'serif',
      css: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
    { id: 'Book Antiqua', label: 'Book Antiqua', group: 'serif',
      css: '"Book Antiqua", Palatino, serif' },
    { id: 'Bookman Old Style', label: 'Bookman Old Style', group: 'serif',
      css: '"Bookman Old Style", "Bookman", Georgia, serif' },
    { id: 'Cambria', label: 'Cambria', group: 'serif',
      css: 'Cambria, Georgia, "Times New Roman", serif' },
    { id: 'Constantia', label: 'Constantia', group: 'serif',
      css: 'Constantia, Georgia, serif' },
    { id: 'Century Schoolbook', label: 'Century Schoolbook', group: 'serif',
      css: '"Century Schoolbook", Century, Georgia, serif' },
    { id: 'Century', label: 'Century', group: 'serif',
      css: 'Century, "Century Schoolbook", Georgia, serif' },
    { id: 'Bodoni MT', label: 'Bodoni MT', group: 'serif',
      css: '"Bodoni MT", Didot, Georgia, serif' },
    { id: 'Goudy Old Style', label: 'Goudy Old Style', group: 'serif',
      css: '"Goudy Old Style", Garamond, serif' },
    { id: 'Sitka Text', label: 'Sitka Text', group: 'serif',
      css: '"Sitka Text", Georgia, serif' },
    { id: 'Rockwell', label: 'Rockwell', group: 'serif',
      css: 'Rockwell, "Courier New", serif' },
    // Mono
    { id: 'Courier New', label: 'Courier New', group: 'mono',
      css: '"Courier New", Courier, monospace' },
    { id: 'Consolas', label: 'Consolas', group: 'mono',
      css: 'Consolas, "Courier New", monospace' },
    { id: 'Lucida Console', label: 'Lucida Console', group: 'mono',
      css: '"Lucida Console", Monaco, monospace' },
    { id: 'Cascadia Code', label: 'Cascadia Code', group: 'mono',
      css: '"Cascadia Code", Consolas, monospace' },
    { id: 'Cascadia Mono', label: 'Cascadia Mono', group: 'mono',
      css: '"Cascadia Mono", Consolas, monospace' },
    { id: 'MS Gothic', label: 'MS Gothic', group: 'mono',
      css: '"MS Gothic", "MS PGothic", monospace' },
    // Display / decorative
    { id: 'Impact', label: 'Impact', group: 'display',
      css: 'Impact, Haettenschweiler, "Arial Black", sans-serif' },
    { id: 'Haettenschweiler', label: 'Haettenschweiler', group: 'display',
      css: 'Haettenschweiler, Impact, sans-serif' },
    { id: 'Copperplate Gothic Bold', label: 'Copperplate Gothic', group: 'display',
      css: '"Copperplate Gothic Bold", "Copperplate Gothic Light", fantasy' },
    { id: 'Showcard Gothic', label: 'Showcard Gothic', group: 'display',
      css: '"Showcard Gothic", Impact, fantasy' },
    { id: 'Stencil', label: 'Stencil', group: 'display',
      css: 'Stencil, Impact, fantasy' },
    { id: 'Broadway', label: 'Broadway', group: 'display',
      css: 'Broadway, Impact, fantasy' },
    { id: 'Playbill', label: 'Playbill', group: 'display',
      css: 'Playbill, Impact, fantasy' },
    { id: 'Wide Latin', label: 'Wide Latin', group: 'display',
      css: '"Wide Latin", Impact, fantasy' },
    { id: 'Algerian', label: 'Algerian', group: 'display',
      css: 'Algerian, "Times New Roman", fantasy' },
    { id: 'Castellar', label: 'Castellar', group: 'display',
      css: 'Castellar, "Times New Roman", fantasy' },
    { id: 'Engravers MT', label: 'Engravers MT', group: 'display',
      css: '"Engravers MT", "Times New Roman", fantasy' },
    { id: 'Cooper Black', label: 'Cooper Black', group: 'display',
      css: '"Cooper Black", Georgia, fantasy' },
    { id: 'Bauhaus 93', label: 'Bauhaus 93', group: 'display',
      css: '"Bauhaus 93", Impact, fantasy' },
    { id: 'Tw Cen MT', label: 'Tw Cen MT', group: 'display',
      css: '"Tw Cen MT", CenturyGothic, sans-serif' },
    // Script / handwriting
    { id: 'Comic Sans MS', label: 'Comic Sans MS', group: 'script',
      css: '"Comic Sans MS", "Comic Sans", cursive' },
    { id: 'Segoe Print', label: 'Segoe Print', group: 'script',
      css: '"Segoe Print", "Comic Sans MS", cursive' },
    { id: 'Segoe Script', label: 'Segoe Script', group: 'script',
      css: '"Segoe Script", "Segoe Print", cursive' },
    { id: 'Brush Script MT', label: 'Brush Script MT', group: 'script',
      css: '"Brush Script MT", cursive' },
    { id: 'Lucida Handwriting', label: 'Lucida Handwriting', group: 'script',
      css: '"Lucida Handwriting", "Segoe Script", cursive' },
    { id: 'Lucida Calligraphy', label: 'Lucida Calligraphy', group: 'script',
      css: '"Lucida Calligraphy", "Segoe Script", cursive' },
    { id: 'Ink Free', label: 'Ink Free', group: 'script',
      css: '"Ink Free", "Segoe Print", cursive' },
    { id: 'Freestyle Script', label: 'Freestyle Script', group: 'script',
      css: '"Freestyle Script", "Segoe Script", cursive' },
    { id: 'French Script MT', label: 'French Script MT', group: 'script',
      css: '"French Script MT", "Segoe Script", cursive' },
    { id: 'Edwardian Script ITC', label: 'Edwardian Script', group: 'script',
      css: '"Edwardian Script ITC", "Segoe Script", cursive' },
    { id: 'Vivaldi', label: 'Vivaldi', group: 'script',
      css: 'Vivaldi, "Segoe Script", cursive' },
    { id: 'Monotype Corsiva', label: 'Monotype Corsiva', group: 'script',
      css: '"Monotype Corsiva", "Segoe Script", cursive' },
    { id: 'Kristen ITC', label: 'Kristen ITC', group: 'script',
      css: '"Kristen ITC", "Comic Sans MS", cursive' },
    { id: 'Papyrus', label: 'Papyrus', group: 'script',
      css: 'Papyrus, fantasy' },
    { id: 'Gabriola', label: 'Gabriola', group: 'script',
      css: 'Gabriola, "Segoe Script", cursive' },
  ];

  const CAPTION_FONT_GROUPS = {
    kr: 'Korean',
    sans: 'Sans',
    serif: 'Serif',
    mono: 'Mono',
    display: 'Display',
    script: 'Script',
    system: 'System',
  };

  function getCaptionFonts() {
    // Deduplicate by id (keep first)
    const seen = new Set();
    return CAPTION_FONTS.filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }

  function _captionFontCss() {
    const key = String(effects.borderCaptionFont || 'Segoe UI');
    const hit = CAPTION_FONTS.find((f) => f.id === key);
    if (hit) return hit.css;
    // Unknown / system-detected family — quote safely + KR fallback
    const safe = key.replace(/\\/g, '').replace(/"/g, '');
    return `"${safe}", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif`;
  }

  function _captionFillColor(matColor) {
    const c = String(effects.borderCaptionColor || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    return _contrastText(matColor);
  }

  function _drawCaptionDecorations(ctx, text, x, y, align, maxW) {
    const metrics = ctx.measureText(text);
    let w = Math.min(metrics.width, maxW || metrics.width);
    let left = x;
    if (align === 'center') left = x - w / 2;
    else if (align === 'right') left = x - w;
    const size = Math.max(6, Number(effects.borderCaptionFontSize) || 16);
    const underline = !!effects.borderCaptionUnderline;
    const strike = !!effects.borderCaptionStrike;
    if (!underline && !strike) return;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, Math.round(size / 12));
    if (underline) {
      const uy = y + size * 0.42;
      ctx.beginPath();
      ctx.moveTo(left, uy);
      ctx.lineTo(left + w, uy);
      ctx.stroke();
    }
    if (strike) {
      const sy = y + size * 0.08;
      ctx.beginPath();
      ctx.moveTo(left, sy);
      ctx.lineTo(left + w, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function _drawCaption(frame) {
    const text = _resolveCaptionText();
    if (!text) return;
    const { pad, photoW, photoH, color, captionPos } = frame;
    const userSize = Math.round(Number(effects.borderCaptionFontSize) || 0);
    const fontSize = userSize > 0
      ? Math.max(6, Math.min(200, userSize))
      : Math.max(6, Math.min(12, pad > 0 ? Math.floor(pad * 0.36) : 8));
    const lineH = Math.round(fontSize * 1.28);
    const matW = photoW + pad * 2;
    const matH = photoH + pad * 2;
    const edge = Math.max(4, Math.round((pad || 12) * 0.16));
    const pos = captionPos || 'bl';
    const side = pos === 'l' || pos === 'r';
    const maxH = Math.max(fontSize, pad > 0 ? pad - 4 : fontSize * 3);
    const maxLines = Math.max(1, Math.floor(maxH / lineH));
    const maxW = side
      ? Math.max(20, photoH + pad - edge * 2)
      : Math.max(20, matW - edge * 2);

    const weight = effects.borderCaptionBold ? '700' : '400';
    const style = effects.borderCaptionItalic ? 'italic' : 'normal';

    displayCtx.save();
    displayCtx.beginPath();
    if (side) displayCtx.rect(pos === 'l' ? 0 : matW - pad, 0, pad, matH);
    else displayCtx.rect(0, (pos === 'tl' || pos === 'tc' || pos === 'tr') ? 0 : matH - pad, matW, pad);
    displayCtx.clip();

    displayCtx.font = `${style} ${weight} ${fontSize}px ${_captionFontCss()}`;
    displayCtx.fillStyle = _captionFillColor(color);
    displayCtx.textBaseline = 'middle';
    const lines = _wrapCaptionLines(displayCtx, text, maxW, maxLines);

    if (side) {
      const x = pos === 'l' ? pad / 2 : matW - pad / 2;
      const y = matH / 2;
      displayCtx.translate(x, y);
      displayCtx.rotate(pos === 'l' ? -Math.PI / 2 : Math.PI / 2);
      displayCtx.textAlign = 'center';
      lines.forEach((line, i) => {
        const ly = (i - (lines.length - 1) / 2) * lineH;
        displayCtx.fillText(line, 0, ly, maxW);
        _drawCaptionDecorations(displayCtx, line, 0, ly, 'center', maxW);
      });
    } else {
      let x = edge;
      let align = 'left';
      if (pos === 'tc' || pos === 'bc') { x = matW / 2; align = 'center'; }
      if (pos === 'tr' || pos === 'br') { x = matW - edge; align = 'right'; }
      const bandY = (pos === 'tl' || pos === 'tc' || pos === 'tr') ? pad / 2 : matH - pad / 2;
      displayCtx.textAlign = align;
      lines.forEach((line, i) => {
        const ly = bandY + (i - (lines.length - 1) / 2) * lineH;
        displayCtx.fillText(line, x, ly, maxW);
        _drawCaptionDecorations(displayCtx, line, x, ly, align, maxW);
      });
    }
    displayCtx.restore();
  }

  function _render() {
    if (!displayCanvas || !workingPixels) return;

    const photo = _composePhoto();
    const frame = _frameLayout();
    if (displayCanvas.width !== frame.outW) displayCanvas.width = frame.outW;
    if (displayCanvas.height !== frame.outH) displayCanvas.height = frame.outH;
    if (selCanvas) {
      if (selCanvas.width !== frame.outW) selCanvas.width = frame.outW;
      if (selCanvas.height !== frame.outH) selCanvas.height = frame.outH;
    }

    displayCtx.clearRect(0, 0, frame.outW, frame.outH);
    if (frame.pad === 0 && frame.shadow === 0 && !frame.captionOn) {
      displayCtx.drawImage(photo, 0, 0);
    } else {
      _drawFrame(photo, frame);
    }
    if (selMask) _drawSelectionMarching();

    if (onDirtyCallback) onDirtyCallback();
  }

  /* ── Progress-aware effect render (large images / pixel kernels) ── */
  let _effectRenderBusy = false;
  let _effectRenderQueued = null; // { wantProgress, saveHist }
  let _effectProgressOwner = 0;
  let _effectRenderGen = 0;

  function _tProgress(key, fallback) {
    try {
      if (window.I18n && typeof I18n.t === 'function') {
        const s = I18n.t(key);
        if (s && s !== key) return s;
      }
    } catch {}
    return fallback;
  }

  function _pixelCount() {
    if (workingPixels) return workingPixels.width * workingPixels.height;
    if (displayCanvas) return displayCanvas.width * displayCanvas.height;
    return 0;
  }

  function _isHeavyEffectRender() {
    if (!workingPixels) return false;
    const px = workingPixels.width * workingPixels.height;
    const kernel =
      effects.sharpen > 0 || effects.emboss || effects.edge
      || effects.grain > 0 || effects.posterize > 1 || effects.warmth !== 0
      || effects.solarize > 0;
    const cssHeavy = effects.blur > 0 || effects.tiltShift > 0
      || _buildFilterString() !== 'none' || effects.vignette > 0;
    if (kernel) return px >= 250000;           // ~0.25MP+
    if (cssHeavy) return px >= 800000;         // ~0.8MP+
    return px >= 2000000;                     // plain redraw ~2MP+
  }

  function shouldShowOpProgress(kind = 'render') {
    const px = _pixelCount();
    if (px <= 0) return false;
    if (kind === 'encode' || kind === 'clipboard') return px >= 350000;
    if (kind === 'history') return px >= 400000 || _isHeavyEffectRender();
    if (_isHeavyEffectRender()) return true;
    return px >= 500000;
  }

  function _progressDialog() {
    return window._ProgressDialog || null;
  }

  function _editWindowOpen() {
    return !!document.getElementById('edit-window')?.classList.contains('visible');
  }

  async function _runSyncWithProgress(work, { messageKey = 'progress.applying', kind = 'render' } = {}) {
    const dlg = _progressDialog();
    const nested = !!(dlg && typeof dlg.isVisible === 'function' && dlg.isVisible());
    const show = !nested && !!(dlg && shouldShowOpProgress(kind));
    const gen = show ? ++_effectRenderGen : _effectRenderGen;

    if (show) {
      _effectProgressOwner = gen;
      dlg.show({
        title: _tProgress('progress.title', 'Progress'),
        message: _tProgress(messageKey, 'Working…'),
        percent: 6,
        modal: _editWindowOpen(),
      });
      dlg.startCreep(90);
    }

    try {
      const result = work();
      return result;
    } finally {
      if (show && _effectProgressOwner === gen) {
        dlg.hide();
        if (_effectProgressOwner === gen) _effectProgressOwner = 0;
      }
    }
  }

  async function _runEffectRenderPass(wantProgress) {
    const gen = ++_effectRenderGen;
    const dlg = _progressDialog();
    const nested = !!(dlg && typeof dlg.isVisible === 'function' && dlg.isVisible());
    const show = !!(wantProgress && dlg && _isHeavyEffectRender() && !nested);

    if (show) {
      _effectProgressOwner = gen;
      dlg.show({
        title: _tProgress('progress.effectTitle', _tProgress('progress.title', 'Progress')),
        message: _tProgress('progress.effectApplying', 'Applying effects…'),
        percent: 4,
        modal: _editWindowOpen(),
      });
      dlg.startCreep(90);
    }

    try {
      if (gen !== _effectRenderGen) return false;
      _render();

      return gen === _effectRenderGen;
    } finally {
      if (show && _effectProgressOwner === gen) {
        dlg.hide();
        if (_effectProgressOwner === gen) _effectProgressOwner = 0;
      }
    }
  }

  let _effectRenderTail = Promise.resolve();

  function _requestEffectRender(wantProgress, saveHist) {
    const prev = _effectRenderQueued;
    _effectRenderQueued = {
      wantProgress: !!(wantProgress || (prev && prev.wantProgress)),
      saveHist: !!(saveHist || (prev && prev.saveHist)),
    };
    if (_effectRenderBusy) {
      // Abort in-flight pass after its next yield; latest effects win.
      _effectRenderGen++;
      return _effectRenderTail;
    }
    _effectRenderBusy = true;
    _effectRenderTail = (async () => {
      try {
        while (_effectRenderQueued) {
          const job = _effectRenderQueued;
          _effectRenderQueued = null;
          const done = await _runEffectRenderPass(job.wantProgress);
          if (done && job.saveHist) _saveHistory();
        }
      } finally {
        _effectRenderBusy = false;
        if (_effectRenderQueued) {
          const again = _effectRenderQueued;
          _effectRenderQueued = null;
          await _requestEffectRender(again.wantProgress, again.saveHist);
        }
      }
    })();
    return _effectRenderTail;
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

  function _applyVignetteOverlay(ctx, w, h, amount) {
    const cx = w / 2, cy = h / 2;
    const r  = Math.sqrt(cx * cx + cy * cy);
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${amount / 100})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  /** Stable luminance film grain (does not flicker between renders). */
  function _grainHash(x, y) {
    let n = Math.imul(x * 374761393 + y * 668265263, 1);
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function _applyGrain(imageData, amount) {
    const src = imageData.data;
    const dst = new Uint8ClampedArray(src);
    const w = imageData.width;
    const h = imageData.height;
    const strength = Math.max(0, Number(amount) || 0) * 0.58;
    if (strength <= 0) return imageData;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        if (src[i + 3] === 0) continue;
        const n = (_grainHash(x, y) + _grainHash(x * 3 + 17, y * 7 + 31) - 1) * strength;
        dst[i]     = src[i] + n;
        dst[i + 1] = src[i + 1] + n;
        dst[i + 2] = src[i + 2] + n;
      }
    }
    return new ImageData(dst, w, h);
  }

  function _applyPosterize(imageData, levels) {
    const n = Math.max(2, Math.min(8, Math.round(Number(levels) || 0)));
    const src = imageData.data;
    const dst = new Uint8ClampedArray(src);
    const step = 255 / (n - 1);
    for (let i = 0; i < src.length; i += 4) {
      dst[i]     = Math.round(src[i] / step) * step;
      dst[i + 1] = Math.round(src[i + 1] / step) * step;
      dst[i + 2] = Math.round(src[i + 2] / step) * step;
    }
    return new ImageData(dst, imageData.width, imageData.height);
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

  /** Partial solarize: invert channels above a luminance threshold. */
  function _applySolarize(imgData, amount) {
    const data = new Uint8ClampedArray(imgData.data);
    const t = 255 - Math.round((Math.max(0, Math.min(100, amount)) / 100) * 180);
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (y >= t) {
        data[i]     = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }
    return new ImageData(data, imgData.width, imgData.height);
  }

  /* ═══════════════════════════════════════════
     Effects API
  ═══════════════════════════════════════════ */
  function setEffect(key, value, saveHist = true) {
    if (!(key in effects)) return;
    const prev = effects[key];
    const changed = prev !== value;
    // Same value + no history → nothing to do
    if (!changed && !saveHist) return;
    if (changed) effects[key] = value;

    // Live caption typing / style: sync draw, no modal
    if (!saveHist && (key === 'borderCaptionText' || key === 'borderCaption'
      || key === 'borderCaptionPos' || key === 'borderColor'
      || key === 'borderShadowStyle' || key === 'borderShadowDir'
      || key === 'borderCaptionFont' || key === 'borderCaptionFontSize'
      || key === 'borderCaptionColor' || key === 'borderCaptionBold'
      || key === 'borderCaptionItalic' || key === 'borderCaptionUnderline'
      || key === 'borderCaptionStrike')) {
      if (changed) _render();
      return;
    }

    if (!changed) return;

    // Committed slider / control: show progress when the render is heavy
    _requestEffectRender(true, true);
  }

  function getEffects() { return { ...effects }; }

  function setCaptionLines(lines) {
    captionLines = Array.isArray(lines) ? lines.map((s) => String(s).trim()).filter(Boolean) : [];
    if (effects.borderCaption) _requestEffectRender(false, false);
  }

  function setCaptionValues(map) {
    captionValues = map && typeof map === 'object' ? { ...map } : {};
    if (effects.borderCaption) _requestEffectRender(false, false);
  }

  function _resetEffects() {
    effects.brightness = 100; effects.contrast  = 100; effects.saturation = 100;
    effects.hue = 0;   effects.blur = 0;   effects.grayscale  = 0;
    effects.sepia = 0; effects.invert = 0; effects.sharpen = 0;
    effects.emboss = false; effects.edge = false;
    effects.vignette = 0; effects.warmth = 0; effects.grain = 0; effects.posterize = 0;
    effects.solarize = 0; effects.tiltShift = 0;
    effects.borderWidth = 0; effects.borderColor = '#ffffff'; effects.borderShadow = 0;
    effects.borderShadowStyle = 'soft';
    effects.borderShadowDir = 'br';
    effects.borderCaption = false; effects.borderCaptionPos = 'bl'; effects.borderCaptionText = '';
    effects.borderCaptionFont = 'Segoe UI';
    effects.borderCaptionFontSize = 16;
    effects.borderCaptionColor = '';
    effects.borderCaptionBold = false;
    effects.borderCaptionItalic = false;
    effects.borderCaptionUnderline = false;
    effects.borderCaptionStrike = false;
  }

  function _effectsChangedFromDefault() {
    return effects.brightness !== 100 || effects.contrast !== 100 || effects.saturation !== 100
      || effects.hue !== 0 || effects.blur !== 0 || effects.grayscale !== 0
      || effects.sepia !== 0 || effects.invert !== 0 || effects.sharpen !== 0
      || effects.emboss || effects.edge || effects.vignette !== 0 || effects.warmth !== 0
      || effects.grain !== 0 || effects.posterize !== 0 || effects.solarize !== 0
      || effects.tiltShift !== 0
      || effects.borderWidth !== 0 || effects.borderShadow !== 0
      || (effects.borderShadowStyle && effects.borderShadowStyle !== 'soft')
      || (effects.borderShadowDir && effects.borderShadowDir !== 'br')
      || effects.borderCaption || !!(effects.borderCaptionText)
      || (effects.borderColor && effects.borderColor !== '#ffffff')
      || (effects.borderCaptionFont && effects.borderCaptionFont !== 'Segoe UI')
      || (effects.borderCaptionFontSize && effects.borderCaptionFontSize !== 16)
      || !!(effects.borderCaptionColor)
      || effects.borderCaptionBold || effects.borderCaptionItalic
      || effects.borderCaptionUnderline || effects.borderCaptionStrike;
  }

  function resetEffects() {
    if (!_effectsChangedFromDefault()) return;
    _resetEffects();
    _requestEffectRender(true, true);
  }

  const PRESETS = {
    grayscale:  { grayscale: 100 },
    sepia:      { sepia: 100, saturation: 55 },
    invert:     { invert: 100 },
    vivid:      { saturation: 168, contrast: 118, sharpen: 12 },
    fade:       { brightness: 125, saturation: 45, contrast: 78, warmth: -8 },
    cool:       { hue: -28, warmth: -35, saturation: 88 },
    warm:       { warmth: 72, saturation: 118, hue: 8 },
    vintage:    { sepia: 48, saturation: 62, contrast: 88, vignette: 55, grain: 28 },
    dramatic:   { contrast: 160, grayscale: 35, vignette: 48, brightness: 92 },
    emboss:     { emboss: true, grayscale: 100 },
    edge:       { edge: true, grayscale: 100, contrast: 140 },
    noir:       { grayscale: 100, contrast: 155, brightness: 82, vignette: 62 },
    soft:       { blur: 2.0, brightness: 115, contrast: 88, saturation: 80 },
    crisp:      { sharpen: 52, contrast: 132, saturation: 122, brightness: 104, vignette: 0 },
    sunset:     { warmth: 92, hue: 20, saturation: 125, contrast: 108, vignette: 35, brightness: 95, sepia: 10 },
    arctic:     { hue: -48, warmth: -62, saturation: 70, brightness: 118, contrast: 108 },
    pastel:     { brightness: 122, contrast: 72, saturation: 78, warmth: 28, hue: 12, blur: 0.4 },
    matte:      { brightness: 108, contrast: 70, saturation: 72, vignette: 28, warmth: -6 },
    neon:       { saturation: 190, contrast: 132, hue: 48, sharpen: 28, brightness: 96 },
    moonlight:  { hue: -58, warmth: -30, saturation: 42, brightness: 92, contrast: 118, vignette: 38, blur: 0.5 },
    golden:     { warmth: 88, saturation: 140, brightness: 118, contrast: 112, hue: 8, sharpen: 14 },
    bleach:     { brightness: 142, saturation: 18, contrast: 92 },
    pop:        { saturation: 162, contrast: 142, sharpen: 38, brightness: 108, warmth: 5 },
    crossprocess: { hue: 22, saturation: 148, contrast: 132, warmth: -35, vignette: 16 },
    documentary:{ saturation: 48, contrast: 125, brightness: 96, vignette: 22, grain: 20, warmth: -12 },
    highkey:    { brightness: 155, contrast: 68, saturation: 85, warmth: 10 },
    lowkey:     { brightness: 58, contrast: 148, saturation: 70, vignette: 68 },
    silver:     { grayscale: 100, contrast: 112, brightness: 110, sharpen: 6 },
    polaroid:   { sepia: 28, brightness: 118, contrast: 85, saturation: 70, vignette: 40, warmth: 20 },
    lomo:       { saturation: 148, contrast: 135, vignette: 78, warmth: 32, hue: 6 },
    filmcamera: { warmth: 40, sepia: 16, contrast: 92, brightness: 106, saturation: 90, hue: 6, vignette: 34, grain: 42, sharpen: 10 },
    disposable: { brightness: 118, contrast: 108, saturation: 85, warmth: 22, hue: 8, vignette: 48, grain: 55, sharpen: 6 },
    /* Color negative */
    portra:     { warmth: 30, saturation: 96, contrast: 88, brightness: 108, hue: 4, grain: 22, vignette: 16 },
    ektar:      { saturation: 155, contrast: 128, warmth: 18, hue: -6, sharpen: 28, brightness: 104, vignette: 8, grain: 14 },
    fuji400h:   { warmth: 12, hue: -8, saturation: 90, contrast: 86, brightness: 112, grain: 20, vignette: 12 },
    superia:    { warmth: 28, hue: 4, saturation: 125, contrast: 112, brightness: 106, grain: 30, vignette: 14 },
    lomochrome: { hue: 18, saturation: 158, contrast: 122, warmth: 40, vignette: 55, grain: 38, brightness: 100 },
    /* Slide / reversal */
    kodachrome: { saturation: 145, contrast: 128, warmth: 28, hue: 8, sharpen: 22, vignette: 16 },
    velvia:     { saturation: 178, contrast: 145, warmth: 6, hue: -14, sharpen: 34, vignette: 10, brightness: 108 },
    provia:     { saturation: 128, contrast: 118, warmth: -4, hue: -10, sharpen: 24, brightness: 106, vignette: 8, grain: 8 },
    slide:      { saturation: 145, contrast: 148, brightness: 88, warmth: -5, sharpen: 34, vignette: 4, hue: -16 },
    /* Black & white film */
    trix:       { grayscale: 100, contrast: 138, brightness: 98, grain: 64, vignette: 28, sharpen: 18 },
    delta3200:  { grayscale: 100, contrast: 135, brightness: 94, grain: 92, vignette: 32, sharpen: 8, blur: 0.3 },
    tmax100:    { grayscale: 100, contrast: 122, brightness: 106, grain: 14, vignette: 8, sharpen: 26 },
    /* Instant / toy */
    sx70:       { warmth: 45, sepia: 22, saturation: 78, contrast: 82, brightness: 116, vignette: 48, grain: 28, hue: 8, blur: 0.4 },
    instax:     { warmth: 28, saturation: 112, contrast: 95, brightness: 118, vignette: 35, grain: 16, hue: 4 },
    sprocket:   { saturation: 135, contrast: 118, warmth: 25, vignette: 62, grain: 40, hue: 12, brightness: 108, blur: 0.5 },
    holga:      { contrast: 122, saturation: 78, brightness: 112, vignette: 80, grain: 42, blur: 0.8, warmth: 22 },
    /* Cinema */
    cinestill:  { warmth: 58, saturation: 118, contrast: 110, brightness: 102, blur: 0.7, grain: 26, vignette: 18, hue: 8 },
    vision3500t: { warmth: -8, hue: -22, saturation: 108, contrast: 122, brightness: 98, grain: 28, vignette: 16 },
    /* Process / experimental */
    expired:    { hue: 22, saturation: 68, contrast: 76, brightness: 114, warmth: 18, grain: 52, vignette: 24, sepia: 12 },
    expiredcool: { hue: -28, saturation: 55, contrast: 72, brightness: 118, warmth: -25, grain: 58, vignette: 28 },
    redscale:   { hue: 42, warmth: 100, saturation: 145, contrast: 125, brightness: 88, vignette: 38, sepia: 20 },
    bleachbypass: { saturation: 35, contrast: 155, brightness: 92, grayscale: 25, vignette: 30, sharpen: 24, grain: 20 },
    crossfuji:  { hue: -35, saturation: 155, contrast: 138, warmth: 25, vignette: 20, grain: 18 },
    nightflash: { brightness: 88, contrast: 135, saturation: 95, warmth: 55, vignette: 58, grain: 40, hue: 12, sharpen: 10 },
    halfFrame:  { contrast: 118, saturation: 105, warmth: 20, vignette: 45, grain: 38, brightness: 104, hue: 6, sepia: 6 },
    doubleExp:  { brightness: 128, contrast: 70, saturation: 85, blur: 1.6, warmth: 25, vignette: 30, hue: 8, grain: 22 },
    autumn:     { warmth: 78, hue: 28, saturation: 118, contrast: 115, brightness: 96, vignette: 18 },
    spring:     { hue: -22, saturation: 132, brightness: 116, contrast: 90, warmth: -18 },
    dusk:       { hue: -10, warmth: 55, saturation: 78, brightness: 72, contrast: 128, vignette: 48 },
    fog:        { brightness: 132, contrast: 52, saturation: 40, blur: 1.8, warmth: -18 },
    dream:      { blur: 3.0, brightness: 124, contrast: 74, saturation: 70, warmth: 30, vignette: 28, hue: 8 },
    hdr:        { contrast: 175, saturation: 155, sharpen: 60, brightness: 110, vignette: 4 },
    infrared:   { hue: -82, saturation: 145, brightness: 122, contrast: 112, grayscale: 12 },
    nightvision:{ hue: -72, grayscale: 38, saturation: 165, brightness: 96, contrast: 132, grain: 22 },
    newspaper:  { grayscale: 100, contrast: 142, grain: 48, sharpen: 32, brightness: 110 },
    sketch:     { edge: true, grayscale: 100, invert: 100, contrast: 118 },
    retro70:    { sepia: 32, hue: 12, saturation: 82, contrast: 94, warmth: 42, vignette: 32, grain: 28 },
    retro80:    { saturation: 168, contrast: 118, hue: -42, warmth: -28, vignette: 12, sharpen: 10 },
    tungsten:   { warmth: 98, hue: 18, saturation: 92, brightness: 96, contrast: 112, sepia: 12 },
    fluorescent:{ hue: -38, warmth: -48, saturation: 120, contrast: 118, brightness: 108 },
    chrome:     { saturation: 118, contrast: 155, sharpen: 48, brightness: 98, vignette: 4, hue: -10, grayscale: 12 },
    orton:      { blur: 3.4, brightness: 132, contrast: 76, saturation: 120, warmth: 22, hue: 6 },
    comic:      { posterize: 4, saturation: 155, contrast: 142, sharpen: 18 },
    xray:       { invert: 100, grayscale: 85, contrast: 122, hue: -48, brightness: 108 },
    clarity:    { sharpen: 78, contrast: 105, saturation: 98, brightness: 102 },
    cyanotype:  { grayscale: 70, hue: -50, warmth: -60, contrast: 115, saturation: 80 },
    tealorange: { hue: -18, warmth: 48, saturation: 145, contrast: 125, brightness: 100 },
    /* ── additional distinct looks ── */
    underwater: { hue: -55, warmth: -68, saturation: 88, brightness: 82, contrast: 122, blur: 0.8 },
    desert:     { warmth: 88, hue: 26, saturation: 58, contrast: 112, brightness: 118, vignette: 26, grain: 12 },
    forest:     { hue: -32, warmth: -22, saturation: 128, contrast: 128, brightness: 90, vignette: 22 },
    lavender:   { hue: -72, warmth: 5, saturation: 95, brightness: 120, contrast: 80, blur: 0.8, vignette: 12 },
    candy:      { hue: 48, saturation: 168, brightness: 122, contrast: 88, warmth: 35 },
    midnight:   { hue: -62, warmth: -55, brightness: 52, contrast: 148, saturation: 58, vignette: 70 },
    thermal:    { posterize: 5, hue: 48, saturation: 170, contrast: 135, brightness: 105 },
    blueprint:  { grayscale: 100, hue: -70, warmth: -80, contrast: 132, brightness: 98, invert: 0 },
    selenium:   { grayscale: 100, hue: -32, warmth: -40, contrast: 128, brightness: 98, vignette: 20, saturation: 35 },
    platinum:   { grayscale: 100, brightness: 125, contrast: 78, vignette: 4, sharpen: 2, warmth: 12 },
    lith:       { grayscale: 100, contrast: 175, brightness: 92, grain: 58, vignette: 35, sharpen: 28 },
    muted:      { saturation: 32, contrast: 92, brightness: 102, warmth: -15, vignette: 14, hue: -6 },
    cyberpunk:  { hue: -55, saturation: 168, contrast: 145, brightness: 96, warmth: -30, vignette: 28, sharpen: 22 },
    vaporwave:  { hue: -78, saturation: 158, contrast: 105, brightness: 118, warmth: -8, vignette: 16 },
    charcoal:   { grayscale: 100, contrast: 105, brightness: 94, grain: 80, blur: 0.6, vignette: 24 },
    ink:        { grayscale: 100, contrast: 168, brightness: 82, vignette: 35, sharpen: 48 },
    dayfornight:{ hue: -35, warmth: -65, brightness: 60, contrast: 138, saturation: 78, vignette: 45, grain: 14 },
    bloom:      { blur: 1.2, brightness: 138, contrast: 88, saturation: 95, warmth: 12, vignette: 6 },
    punch:      { contrast: 152, saturation: 170, sharpen: 12, brightness: 106, warmth: 20, hue: 10 },
    flat:       { contrast: 55, saturation: 100, brightness: 110, vignette: 0, warmth: 0 },
    winter:     { hue: -22, warmth: -50, brightness: 115, contrast: 118, saturation: 62, sharpen: 20, vignette: 12 },
    summer:     { warmth: 32, hue: 2, saturation: 145, brightness: 120, contrast: 102 },
    rainy:      { hue: -22, warmth: -28, saturation: 58, contrast: 95, brightness: 98, blur: 0.6, grain: 18 },
    peach:      { warmth: 62, hue: 22, saturation: 88, brightness: 120, contrast: 82 },
    coral:      { hue: 36, warmth: 55, saturation: 155, contrast: 118, brightness: 110, vignette: 10 },
    amethyst:   { hue: -70, saturation: 130, contrast: 115, brightness: 105, warmth: -10 },
    copper:     { warmth: 70, hue: 8, saturation: 95, contrast: 132, brightness: 92, vignette: 28, sepia: 18, grain: 16 },
    denim:      { hue: -45, warmth: -42, saturation: 55, contrast: 125, brightness: 96, vignette: 16 },
    gothic:     { brightness: 68, contrast: 145, saturation: 45, vignette: 65, hue: -8, warmth: -15 },
    romance:    { warmth: 40, hue: 10, saturation: 100, brightness: 122, contrast: 78, blur: 1.4, vignette: 24, sepia: 8 },
    duotone:    { grayscale: 55, hue: -85, saturation: 140, contrast: 128, brightness: 102 },
    glitch:     { posterize: 3, hue: 55, saturation: 160, contrast: 150, invert: 15, sharpen: 20 },
    watercolor: { blur: 2.2, contrast: 68, saturation: 92, brightness: 118, warmth: 25, vignette: 20, hue: 14, grain: 10 },
    anime:      { saturation: 160, contrast: 108, brightness: 120, sharpen: 35, warmth: 0, hue: -8 },
    silhouette: { brightness: 48, contrast: 170, saturation: 30, vignette: 70 },
    amber:      { warmth: 118, hue: 36, saturation: 108, contrast: 100, brightness: 108, vignette: 14, sepia: 22 },
    steel:      { grayscale: 70, hue: -25, warmth: -40, contrast: 130, saturation: 40, sharpen: 30 },
    push:       { contrast: 152, saturation: 132, grain: 48, brightness: 90, vignette: 28 },
    pull:       { contrast: 88, saturation: 68, brightness: 118, grain: 10, warmth: 12, blur: 0.3 },
    midcentury: { sepia: 34, warmth: 45, saturation: 60, contrast: 98, brightness: 112, vignette: 36 },
    horror:     { hue: -15, warmth: -20, brightness: 78, contrast: 155, saturation: 50, vignette: 55, grain: 30 },
    // Miniature diorama: dual-plane DOF + toy color (grade also inside tiltShift)
    miniature:  {
      tiltShift: 48,
      saturation: 142,
      contrast: 130,
      brightness: 108,
      warmth: 24,
      hue: 4,
      sharpen: 32,
      vignette: 22,
    },
  };

  function applyPreset(name) {
    const before = JSON.stringify(effects);
    const border = {
      borderWidth: effects.borderWidth,
      borderColor: effects.borderColor,
      borderShadow: effects.borderShadow,
      borderShadowStyle: effects.borderShadowStyle,
      borderShadowDir: effects.borderShadowDir,
      borderCaption: effects.borderCaption,
      borderCaptionPos: effects.borderCaptionPos,
      borderCaptionText: effects.borderCaptionText,
      borderCaptionFont: effects.borderCaptionFont,
      borderCaptionFontSize: effects.borderCaptionFontSize,
      borderCaptionColor: effects.borderCaptionColor,
      borderCaptionBold: effects.borderCaptionBold,
      borderCaptionItalic: effects.borderCaptionItalic,
      borderCaptionUnderline: effects.borderCaptionUnderline,
      borderCaptionStrike: effects.borderCaptionStrike,
    };
    _resetEffects();
    Object.assign(effects, border);
    const preset = PRESETS[name];
    if (preset) Object.assign(effects, preset);
    if (JSON.stringify(effects) === before) return Promise.resolve();
    return _requestEffectRender(true, true);
  }

  /* ═══════════════════════════════════════════
     Transform
  ═══════════════════════════════════════════ */
  async function rotate(deg) {
    return _runSyncWithProgress(() => {
      rotation = ((rotation + deg) % 360 + 360) % 360;
      clearSelection();
      _resizeCanvases();
      _drawOriginalToWorking();
      _render();
      _saveHistory();
    }, { kind: 'transform', messageKey: 'progress.applying' });
  }

  async function flip(axis) {
    return _runSyncWithProgress(() => {
      if (axis === 'h') flipH = !flipH;
      else              flipV = !flipV;
      clearSelection();
      _drawOriginalToWorking();
      _render();
      _saveHistory();
    }, { kind: 'transform', messageKey: 'progress.applying' });
  }

  async function resetTransform() {
    if (rotation === 0 && !flipH && !flipV) return;
    return _runSyncWithProgress(() => {
      rotation = 0; flipH = false; flipV = false;
      clearSelection();
      _resizeCanvases();
      _drawOriginalToWorking();
      _render();
      _saveHistory();
    }, { kind: 'transform', messageKey: 'progress.applying' });
  }

  async function resetAll() {
    const needT = !(rotation === 0 && !flipH && !flipV);
    const needE = _effectsChangedFromDefault();
    if (!needT && !needE) return;
    return _runSyncWithProgress(() => {
      rotation = 0; flipH = false; flipV = false;
      _resetEffects();
      clearSelection();
      _resizeCanvases();
      _drawOriginalToWorking();
      _render();
      _saveHistory();
    }, { kind: 'transform', messageKey: 'progress.applying' });
  }

  /* ═══════════════════════════════════════════
     Selection Tools
  ═══════════════════════════════════════════ */
  function setTool(tool) {
    currentTool = tool;
    if (selCanvas) {
      selCanvas.style.cursor =
        tool === 'pointer'   ? 'default' :
        tool === 'magic-wand'? 'crosshair' : 'crosshair';
    }
    if (tool === 'pointer') clearSelection();
  }

  function getTool() { return currentTool; }

  /* ── Mouse events ── */
  function _canvasPoint(e) {
    const rect = selCanvas.getBoundingClientRect();
    const scaleX = selCanvas.width  / rect.width;
    const scaleY = selCanvas.height / rect.height;
    const inset = _frameLayout().inset;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX) - inset,
      y: Math.round((e.clientY - rect.top)  * scaleY) - inset,
    };
  }

  function _withSelOffset(draw) {
    const inset = _frameLayout().inset;
    selCtx.save();
    if (inset) selCtx.translate(inset, inset);
    draw();
    selCtx.restore();
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
  const SEL_LINE_CSS     = 2;   // desired on-screen line thickness (CSS px)
  const SEL_HANDLE_CSS   = 4;   // desired on-screen polygon handle radius (CSS px)

  // Buffer px per displayed CSS px. The selection canvas buffer is sized to the
  // image's native pixel dimensions, so a large image shown scaled-down makes
  // fixed-width strokes render sub-pixel. Divide desired CSS sizes by this to
  // keep selection outlines a constant visual thickness regardless of zoom.
  function _selScale() {
    const disp = selCanvas.getBoundingClientRect().width || selCanvas.width;
    return disp ? selCanvas.width / disp : 1;
  }

  function _selStroke(ctx, color, offset) {
    const s = _selScale();
    ctx.strokeStyle  = color;
    ctx.lineWidth    = Math.max(1, SEL_LINE_CSS * s);
    ctx.setLineDash([SEL_DASH[0] * s, SEL_DASH[1] * s]);
    ctx.lineDashOffset = (offset || 0) * s;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  function _drawRectPreview(x1, y1, x2, y2) {
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    const rx = Math.min(x1,x2), ry = Math.min(y1,y2);
    const rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
    _withSelOffset(() => {
      selCtx.beginPath();
      selCtx.rect(rx, ry, rw, rh);
      selCtx.fillStyle = 'rgba(255,215,0,0.08)';
      selCtx.fill();
      _selStroke(selCtx, SEL_COLOR_BRIGHT, 0);
      selCtx.beginPath();
      selCtx.rect(rx, ry, rw, rh);
      _selStroke(selCtx, SEL_COLOR_DARK, SEL_DASH[0]);
    });
  }

  function _drawLassoInProgress() {
    if (!selectionPath.length) return;
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    _withSelOffset(() => {
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
    });
  }

  function _drawPolygonInProgress(cursor) {
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    if (!polygonPoints.length) return;
    _withSelOffset(() => {
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

      const s = _selScale();
      const r = Math.max(2, SEL_HANDLE_CSS * s);
      polygonPoints.forEach(pt => {
        selCtx.beginPath();
        selCtx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        selCtx.fillStyle = SEL_COLOR_BRIGHT;
        selCtx.fill();
        selCtx.strokeStyle = '#333';
        selCtx.lineWidth = Math.max(1, s);
        selCtx.setLineDash([]);
        selCtx.stroke();
      });
    });
  }

  function _drawSelectionMarching() {
    if (!selMask) return;
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    if (!selectionPath || !selectionPath.length) return;
    _withSelOffset(() => {
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
    });
  }

  /* ── Build pixel mask from polygon path ── */
  function _buildMaskFromPath(path) {
    const w = workingPixels ? workingPixels.width : displayCanvas.width;
    const h = workingPixels ? workingPixels.height : displayCanvas.height;
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
    if (!selMask || !workingPixels) return;
    const w = workingPixels.width, h = workingPixels.height;
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);

    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d');
    const imgData = tc.createImageData(w, h);
    for (let i = 0; i < selMask.length; i++) {
      if (selMask[i]) {
        imgData.data[i*4]   = 255;
        imgData.data[i*4+1] = 215;
        imgData.data[i*4+2] = 0;
        imgData.data[i*4+3] = 50;
      }
    }
    tc.putImageData(imgData, 0, 0);
    const inset = _frameLayout().inset;
    selCtx.drawImage(tmp, inset, inset);
    _withSelOffset(() => {
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
    });
  }

  function setMagicTolerance(val) { magicTolerance = val; }

  /* ═══════════════════════════════════════════
     Background Removal
  ═══════════════════════════════════════════ */
  const BG_ALGOS = [
    { id: 'rembg1' }, // AI — u2net
    { id: 'rembg2' }, // AI — RMBG-2.0 / bria-rmbg
    { id: 'rembg3' }, // AI — isnet-general-use
    { id: 'flood' },
    { id: 'border' },
    { id: 'chroma' },
    { id: 'white' },
    { id: 'black' },
    { id: 'green' },
    { id: 'blue' },
    { id: 'selection' },
  ];

  function isRembgAlgorithm(id) {
    return /^(rembg[123]|u2net|bria-rmbg|isnet-general-use)$/i.test(id || '');
  }

  /** Clear pixels outside (or inside) the current selection mask. */
  function removeBackground(removeInside = false) {
    if (!selMask || !workingPixels) return false;

    const data = workingPixels.data;
    for (let i = 0; i < selMask.length; i++) {
      const inside = selMask[i] > 0;
      if (inside !== removeInside) {
        data[i * 4 + 3] = 0;
      }
    }
    // Keep only the smallest rectangle covering the selection
    cropAfterBackgroundRemove();
    _render();
    _saveHistory();
    return true;
  }

  function listBgAlgorithms() {
    return BG_ALGOS.map((a) => a.id);
  }

  /** Replace working image from a PNG/JPEG data URL (used after AI rembg). */
  function applyFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      if (!dataUrl || !displayCanvas) {
        reject(new Error('Editor not ready'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        naturalW = img.naturalWidth || img.width;
        naturalH = img.naturalHeight || img.height;
        displayCanvas.width = naturalW;
        displayCanvas.height = naturalH;
        if (selCanvas) {
          selCanvas.width = naturalW;
          selCanvas.height = naturalH;
        }
        displayCtx.clearRect(0, 0, naturalW, naturalH);
        displayCtx.drawImage(img, 0, 0);
        workingPixels = displayCtx.getImageData(0, 0, naturalW, naturalH);
        originalPixels = displayCtx.getImageData(0, 0, naturalW, naturalH);
        clearSelection();
        _render();
        resolve(true);
      };
      img.onerror = () => reject(new Error('Failed to load rembg result'));
      img.src = dataUrl;
    });
  }

  function _colorDist(data, idx, r, g, b) {
    return Math.abs(data[idx] - r) + Math.abs(data[idx + 1] - g) + Math.abs(data[idx + 2] - b);
  }

  function _floodFromSeeds(data, w, h, seeds, tol, isBg) {
    const limit = tol * 3;
    for (const seed of seeds) {
      if (seed < 0 || seed >= w * h || isBg[seed]) continue;
      const sr = data[seed * 4];
      const sg = data[seed * 4 + 1];
      const sb = data[seed * 4 + 2];
      if (data[seed * 4 + 3] < 8) {
        isBg[seed] = 1;
        continue;
      }

      const visited = new Uint8Array(w * h);
      const queue = [seed];
      visited[seed] = 1;

      while (queue.length) {
        const pos = queue.pop();
        const idx = pos * 4;
        if (_colorDist(data, idx, sr, sg, sb) > limit) continue;
        if (data[idx + 3] < 8) { isBg[pos] = 1; continue; }

        isBg[pos] = 1;
        const px = pos % w;
        const py = (pos / w) | 0;
        const neighbors = [px - 1 + py * w, px + 1 + py * w, px + (py - 1) * w, px + (py + 1) * w];
        for (const n of neighbors) {
          const nx = n % w;
          const ny = (n / w) | 0;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (!visited[n]) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    }
  }

  function _rgbToHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d < 1e-6) return { h: 0, s: 0, v: max };
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: max === 0 ? 0 : d / max, v: max };
  }

  /**
   * Auto background removal with selectable algorithm.
   * @param {string} [algorithm='flood']
   * @param {number} [tolerance]
   */
  function removeBackgroundAuto(algorithm, tolerance) {
    if (!workingPixels) return false;

    const algo = (typeof algorithm === 'string' ? algorithm : 'flood') || 'flood';
    // Back-compat: removeBackgroundAuto(toleranceNumber)
    let tolArg = tolerance;
    if (typeof algorithm === 'number') {
      tolArg = algorithm;
    }

    if (algo === 'selection') {
      if (!selMask) return false;
      return removeBackground(false);
    }

    if (isRembgAlgorithm(algo)) {
      // AI rembg runs in main process via IPC — use app.js async path
      return false;
    }

    const w = workingPixels.width;
    const h = workingPixels.height;
    if (w < 2 || h < 2) return false;

    const tol = Math.max(1, tolArg != null ? tolArg : magicTolerance);
    const data = workingPixels.data;
    const isBg = new Uint8Array(w * h);
    const n = w * h;

    if (algo === 'flood') {
      const seeds = [
        0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1),
        ((w / 2) | 0), ((w / 2) | 0) + (h - 1) * w,
        ((h / 2) | 0) * w, ((h / 2) | 0) * w + (w - 1),
      ];
      _floodFromSeeds(data, w, h, seeds, tol, isBg);
    } else if (algo === 'border') {
      const seeds = [];
      for (let x = 0; x < w; x++) {
        seeds.push(x);
        seeds.push((h - 1) * w + x);
      }
      for (let y = 1; y < h - 1; y++) {
        seeds.push(y * w);
        seeds.push(y * w + (w - 1));
      }
      _floodFromSeeds(data, w, h, seeds, tol, isBg);
    } else if (algo === 'chroma') {
      // Average opaque corner colors as key
      const corners = [0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1)];
      let r = 0, g = 0, b = 0, c = 0;
      for (const s of corners) {
        if (data[s * 4 + 3] < 8) continue;
        r += data[s * 4]; g += data[s * 4 + 1]; b += data[s * 4 + 2];
        c++;
      }
      if (!c) return false;
      r = (r / c) | 0; g = (g / c) | 0; b = (b / c) | 0;
      const limit = tol * 3;
      for (let i = 0; i < n; i++) {
        if (data[i * 4 + 3] < 8) { isBg[i] = 1; continue; }
        if (_colorDist(data, i * 4, r, g, b) <= limit) isBg[i] = 1;
      }
    } else if (algo === 'white') {
      // Bright / near-white: high luminance within tolerance of 255
      const minL = Math.max(0, 255 - tol * 2);
      for (let i = 0; i < n; i++) {
        const idx = i * 4;
        if (data[idx + 3] < 8) { isBg[i] = 1; continue; }
        const y = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
        if (y >= minL) isBg[i] = 1;
      }
    } else if (algo === 'black') {
      const maxL = Math.min(255, tol * 2);
      for (let i = 0; i < n; i++) {
        const idx = i * 4;
        if (data[idx + 3] < 8) { isBg[i] = 1; continue; }
        const y = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
        if (y <= maxL) isBg[i] = 1;
      }
    } else if (algo === 'green' || algo === 'blue') {
      // Chroma-key in HSV. tol scales saturation/value thresholds and hue width.
      const hueCenter = algo === 'green' ? 120 : 210;
      const hueSpan = 25 + tol * 0.35;
      const minS = Math.max(0.15, 0.55 - tol / 200);
      const minV = Math.max(0.12, 0.35 - tol / 300);
      for (let i = 0; i < n; i++) {
        const idx = i * 4;
        if (data[idx + 3] < 8) { isBg[i] = 1; continue; }
        const { h: hue, s, v } = _rgbToHue(data[idx], data[idx + 1], data[idx + 2]);
        let dh = Math.abs(hue - hueCenter);
        if (dh > 180) dh = 360 - dh;
        if (dh <= hueSpan && s >= minS && v >= minV) isBg[i] = 1;
      }
    } else {
      return false;
    }

    let cleared = 0;
    for (let i = 0; i < n; i++) {
      if (isBg[i] && data[i * 4 + 3] !== 0) cleared++;
    }
    if (!cleared) return false;

    // Don't erase everything
    if (cleared >= n * 0.98) return false;

    for (let i = 0; i < n; i++) {
      if (isBg[i]) data[i * 4 + 3] = 0;
    }
    // Shrink to selection bbox (or opaque content) so save size matches content
    cropAfterBackgroundRemove();
    _render();
    _saveHistory();
    return true;
  }

  function fillSelection(r, g, b, a = 255) {
    if (!selMask || !workingPixels) return false;
    const data = workingPixels.data;
    for (let i = 0; i < selMask.length; i++) {
      if (selMask[i]) {
        data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a;
      }
    }
    _render();
    _saveHistory();
    return true;
  }

  /** Bounding box of selection mask, or null. */
  function getSelectionBounds(padding = 0) {
    if (!selMask || !workingPixels) return null;
    const w = workingPixels.width;
    const h = workingPixels.height;
    let x1 = w, y1 = h, x2 = -1, y2 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (selMask[y * w + x]) {
          if (x < x1) x1 = x;
          if (y < y1) y1 = y;
          if (x > x2) x2 = x;
          if (y > y2) y2 = y;
        }
      }
    }
    if (x2 < x1 || y2 < y1) return null;
    const pad = Math.max(0, padding | 0);
    x1 = Math.max(0, x1 - pad);
    y1 = Math.max(0, y1 - pad);
    x2 = Math.min(w - 1, x2 + pad);
    y2 = Math.min(h - 1, y2 + pad);
    return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
  }

  /** Bounding box of opaque (non-transparent) pixels. */
  function getOpaqueBounds(alphaThreshold = 8, padding = 0) {
    if (!workingPixels) return null;
    const w = workingPixels.width;
    const h = workingPixels.height;
    const data = workingPixels.data;
    let x1 = w, y1 = h, x2 = -1, y2 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > alphaThreshold) {
          if (x < x1) x1 = x;
          if (y < y1) y1 = y;
          if (x > x2) x2 = x;
          if (y > y2) y2 = y;
        }
      }
    }
    if (x2 < x1 || y2 < y1) return null;
    const pad = Math.max(0, padding | 0);
    x1 = Math.max(0, x1 - pad);
    y1 = Math.max(0, y1 - pad);
    x2 = Math.min(w - 1, x2 + pad);
    y2 = Math.min(h - 1, y2 + pad);
    return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
  }

  /**
   * Crop working image to a rectangle. Does not push history by itself
   * (caller should save history after a successful crop).
   */
  function cropToRect(x, y, cw, ch, { clearOutsideMask = false } = {}) {
    if (!workingPixels || !displayCanvas) return false;
    const w = workingPixels.width;
    const h = workingPixels.height;
    const x0 = Math.max(0, Math.min(w - 1, x | 0));
    const y0 = Math.max(0, Math.min(h - 1, y | 0));
    const width = Math.max(1, Math.min(w - x0, cw | 0));
    const height = Math.max(1, Math.min(h - y0, ch | 0));
    if (width >= w && height >= h && x0 === 0 && y0 === 0 && !clearOutsideMask) {
      return false; // already full size
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const oc = offscreen.getContext('2d');
    oc.putImageData(workingPixels, -x0, -y0);
    const cropped = oc.getImageData(0, 0, width, height);

    if (clearOutsideMask && selMask) {
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const globalI = (row + y0) * w + (col + x0);
          if (!selMask[globalI]) cropped.data[(row * width + col) * 4 + 3] = 0;
        }
      }
    }

    displayCanvas.width = width;
    displayCanvas.height = height;
    if (selCanvas) {
      selCanvas.width = width;
      selCanvas.height = height;
    }
    workingPixels = cropped;
    naturalW = width;
    naturalH = height;
    // Keep originalPixels aligned with new canvas so reset/effects stay consistent
    originalPixels = new ImageData(
      new Uint8ClampedArray(cropped.data),
      width,
      height
    );
    clearSelection();
    _render();
    return true;
  }

  /**
   * After background removal: shrink canvas to the smallest rectangle that
   * contains the selection (preferred), or remaining opaque pixels.
   * @param {{x:number,y:number,w:number,h:number}|null} [presetBounds]
   *        Bounds captured before an async rembg that clears selection.
   */
  function cropAfterBackgroundRemove(presetBounds = null) {
    if (!workingPixels) return false;
    const bounds = presetBounds
      || getSelectionBounds(1)
      || getOpaqueBounds(8, 1);
    if (!bounds) return false;
    if (bounds.w >= workingPixels.width && bounds.h >= workingPixels.height
        && bounds.x === 0 && bounds.y === 0) {
      clearSelection();
      return false;
    }
    return cropToRect(bounds.x, bounds.y, bounds.w, bounds.h, {
      clearOutsideMask: !presetBounds && !!selMask,
    });
  }

  async function cropToSelection() {
    if (!selMask || !workingPixels) return false;
    const bounds = getSelectionBounds(0);
    if (!bounds) return false;
    return _runSyncWithProgress(() => {
      const ok = cropToRect(bounds.x, bounds.y, bounds.w, bounds.h, { clearOutsideMask: true });
      if (ok) _saveHistory();
      return ok;
    }, { kind: 'transform', messageKey: 'progress.applying' });
  }

  function clearSelection() {
    selMask = null; selectionPath = null; selectionType = null;
    isDrawingSelection = false; polygonPoints = [];
    if (selCtx && selCanvas) selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    if (onSelectionChange) onSelectionChange(false);
  }

  function hasSelection() { return selMask !== null; }

  /* ─── Cut: copy selection → clipboard data URL, then erase pixels ─── */
  async function cut() {
    if (!selMask || !workingPixels) return null;

    return _runSyncWithProgress(() => {
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
      _saveHistory();
      return dataUrl;
    }, { kind: 'clipboard', messageKey: 'progress.copying' });
  }

  /* ─── Copy selection to data URL ─── */
  async function copySelection() {
    if (!selMask || !workingPixels) return null;
    return _runSyncWithProgress(() => {
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
    }, { kind: 'clipboard', messageKey: 'progress.copying' });
  }

  /* ═══════════════════════════════════════════
     History (Undo / Redo)
  ═══════════════════════════════════════════ */
  function _cloneImageData(src) {
    if (!src) return null;
    return new ImageData(
      new Uint8ClampedArray(src.data),
      src.width,
      src.height
    );
  }

  function _snapshot() {
    return {
      working:  _cloneImageData(workingPixels),
      original: _cloneImageData(originalPixels),
      effects:  { ...effects },
      rotation,
      flipH,
      flipV,
      naturalW,
      naturalH,
    };
  }

  function _saveHistory() {
    if (!workingPixels || _restoringHistory) return;
    if (histIndex < history.length - 1) history.splice(histIndex + 1);
    history.push(_snapshot());
    if (history.length > MAX_HISTORY) history.shift();
    histIndex = history.length - 1;
    if (onHistoryChange) onHistoryChange();
  }

  async function undo() {
    if (histIndex <= 0) return false;
    return _runSyncWithProgress(() => {
      histIndex--;
      _restoreHistoryFrame(history[histIndex]);
      if (onHistoryChange) onHistoryChange();
      return true;
    }, { kind: 'history', messageKey: 'progress.applying' });
  }

  async function redo() {
    if (histIndex >= history.length - 1) return false;
    return _runSyncWithProgress(() => {
      histIndex++;
      _restoreHistoryFrame(history[histIndex]);
      if (onHistoryChange) onHistoryChange();
      return true;
    }, { kind: 'history', messageKey: 'progress.applying' });
  }

  function _restoreHistoryFrame(frame) {
    _restoringHistory = true;
    try {
      workingPixels  = _cloneImageData(frame.working);
      originalPixels = _cloneImageData(frame.original);
      _resetEffects();
      Object.assign(effects, frame.effects);
      rotation = frame.rotation;
      flipH    = frame.flipH;
      flipV    = frame.flipV;
      naturalW = frame.naturalW;
      naturalH = frame.naturalH;

      const w = workingPixels.width;
      const h = workingPixels.height;
      if (displayCanvas) {
        displayCanvas.width  = w;
        displayCanvas.height = h;
      }
      if (selCanvas) {
        selCanvas.width  = w;
        selCanvas.height = h;
      }
      clearSelection();
      _render();
    } finally {
      _restoringHistory = false;
    }
  }

  function canUndo() { return histIndex > 0; }
  function canRedo() { return histIndex < history.length - 1; }

  let _editSession = null;

  function _editFingerprint() {
    return JSON.stringify({
      histIndex,
      rotation,
      flipH,
      flipV,
      nw: naturalW,
      nh: naturalH,
      ww: workingPixels ? workingPixels.width : 0,
      wh: workingPixels ? workingPixels.height : 0,
      effects,
    });
  }

  function beginEditSession() {
    _editSession = {
      frame: _snapshot(),
      history: history.slice(),
      histIndex,
      fingerprint: _editFingerprint(),
    };
  }

  function revertEditSession() {
    if (!_editSession) return false;
    history.length = 0;
    _editSession.history.forEach((f) => history.push(f));
    histIndex = _editSession.histIndex;
    _restoreHistoryFrame(_editSession.frame);
    _editSession = null;
    if (onHistoryChange) onHistoryChange();
    return true;
  }

  function commitEditSession() {
    _editSession = null;
  }

  function hasEditSessionChanges() {
    if (!_editSession) return false;
    return _editFingerprint() !== _editSession.fingerprint;
  }

  /* ═══════════════════════════════════════════
     Export / Save / Resize
  ═══════════════════════════════════════════ */
  function exportAsDataUrl(format = 'image/png', quality = 0.95) {
    return displayCanvas ? displayCanvas.toDataURL(format, quality) : null;
  }

  function _applySmoothing(ctx, quality) {
    if (quality === 'nearest') {
      ctx.imageSmoothingEnabled = false;
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = quality === 'medium' ? 'medium' : 'high';
  }

  function _drawScaled(srcCanvas, dw, dh, quality = 'high') {
    const outW = Math.max(1, Math.round(dw));
    const outH = Math.max(1, Math.round(dh));
    let canvas = srcCanvas;
    let sw = srcCanvas.width;
    let sh = srcCanvas.height;
    if (quality === 'high') {
      while (sw / 2 >= outW && sh / 2 >= outH && (sw > outW * 1.5 || sh > outH * 1.5)) {
        const tw = Math.max(outW, Math.round(sw / 2));
        const th = Math.max(outH, Math.round(sh / 2));
        const tmp = document.createElement('canvas');
        tmp.width = tw;
        tmp.height = th;
        const tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(canvas, 0, 0, tw, th);
        canvas = tmp;
        sw = tw;
        sh = th;
      }
    }
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    _applySmoothing(ctx, quality);
    ctx.drawImage(canvas, 0, 0, outW, outH);
    return out;
  }

  function exportResizedDataUrl(width, height, format = 'image/png', fileQuality = 0.92, interp = 'high') {
    if (!displayCanvas) return null;
    const scaled = _drawScaled(displayCanvas, width, height, interp);
    return scaled.toDataURL(format, fileQuality);
  }

  async function resizeTo(width, height, { quality = 'high' } = {}) {
    if (!displayCanvas || !workingPixels) return false;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === displayCanvas.width && h === displayCanvas.height) return true;
    return _runSyncWithProgress(() => {
      const scaled = _drawScaled(displayCanvas, w, h, quality);
      rotation = 0;
      flipH = false;
      flipV = false;
      _resetEffects();
      naturalW = w;
      naturalH = h;
      displayCanvas.width = w;
      displayCanvas.height = h;
      if (selCanvas) {
        selCanvas.width = w;
        selCanvas.height = h;
      }
      displayCtx.clearRect(0, 0, w, h);
      displayCtx.drawImage(scaled, 0, 0);
      workingPixels = displayCtx.getImageData(0, 0, w, h);
      originalPixels = displayCtx.getImageData(0, 0, w, h);
      clearSelection();
      _render();
      _saveHistory();
      return true;
    }, { kind: 'transform', messageKey: 'progress.resizing' });
  }

  function getCanvasElement() { return displayCanvas; }

  function isLoaded() { return !!workingPixels; }

  function clear() {
    originalImg = null;
    originalPixels = null;
    workingPixels = null;
    naturalW = 0;
    naturalH = 0;
    rotation = 0;
    flipH = false;
    flipV = false;
    _resetEffects();
    clearSelection();
    history.length = 0;
    histIndex = -1;
    if (displayCanvas) {
      displayCanvas.width = 0;
      displayCanvas.height = 0;
    }
    if (selCanvas) {
      selCanvas.width = 0;
      selCanvas.height = 0;
    }
    if (onHistoryChange) onHistoryChange();
  }

  function getDimensions() {
    if (!displayCanvas) return { w: 0, h: 0 };
    return { w: displayCanvas.width, h: displayCanvas.height };
  }

  function getPhotoDimensions() {
    if (workingPixels) return { w: workingPixels.width, h: workingPixels.height };
    return getDimensions();
  }

  function getRotation()   { return rotation; }
  function getFlipState()  { return { flipH, flipV }; }

  return {
    init, setCallbacks, loadImage, replaceSource,
    setEffect, getEffects, getCaptionFonts, setCaptionLines, setCaptionValues, resetEffects, applyPreset,
    rotate, flip, resetTransform, resetAll, shouldShowOpProgress,
    setTool, getTool, clearSelection, hasSelection,
    removeBackground, removeBackgroundAuto, listBgAlgorithms, isRembgAlgorithm, applyFromDataUrl,
    fillSelection, cropToSelection, cropAfterBackgroundRemove, getSelectionBounds,
    cut, copySelection,
    setMagicTolerance,
    undo, redo, canUndo, canRedo, saveHistory: _saveHistory,
    beginEditSession, revertEditSession, commitEditSession, hasEditSessionChanges,
    exportAsDataUrl, exportResizedDataUrl, resizeTo, getCanvasElement, isLoaded, clear,
    getDimensions, getPhotoDimensions, getRotation, getFlipState,
    _applyEdgeDetect,
  };
})();
