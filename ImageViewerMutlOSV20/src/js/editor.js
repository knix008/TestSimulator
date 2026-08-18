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
    solarize: 0,
    borderWidth: 0, borderColor: '#ffffff', borderShadow: 0,
    borderShadowStyle: 'soft', borderShadowDir: 'br',
    borderCaption: false, borderCaptionPos: 'bl', borderCaptionText: '',
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

  function _drawCaption(frame) {
    const text = _resolveCaptionText();
    if (!text) return;
    const { pad, photoW, photoH, color, captionPos } = frame;
    const fontSize = Math.max(6, Math.min(12, pad > 0 ? Math.floor(pad * 0.36) : 8));
    const lineH = fontSize + 3;
    const matW = photoW + pad * 2;
    const matH = photoH + pad * 2;
    const edge = Math.max(4, Math.round((pad || 12) * 0.16));
    const pos = captionPos || 'bl';
    const side = pos === 'l' || pos === 'r';
    const maxH = Math.max(fontSize, pad - 4);
    const maxLines = Math.max(1, Math.floor(maxH / lineH));
    const maxW = side
      ? Math.max(20, photoH + pad - edge * 2)
      : Math.max(20, matW - edge * 2);

    displayCtx.save();
    displayCtx.beginPath();
    if (side) displayCtx.rect(pos === 'l' ? 0 : matW - pad, 0, pad, matH);
    else displayCtx.rect(0, (pos === 'tl' || pos === 'tc' || pos === 'tr') ? 0 : matH - pad, matW, pad);
    displayCtx.clip();

    displayCtx.font = `${fontSize}px "Segoe UI", "Noto Sans KR", sans-serif`;
    displayCtx.fillStyle = _contrastText(color);
    displayCtx.textBaseline = 'middle';
    const lines = _wrapCaptionLines(displayCtx, text, maxW, maxLines);

    if (side) {
      const x = pos === 'l' ? pad / 2 : matW - pad / 2;
      const y = matH / 2;
      displayCtx.translate(x, y);
      displayCtx.rotate(pos === 'l' ? -Math.PI / 2 : Math.PI / 2);
      displayCtx.textAlign = 'center';
      lines.forEach((line, i) => {
        displayCtx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineH, maxW);
      });
    } else {
      let x = edge;
      let align = 'left';
      if (pos === 'tc' || pos === 'bc') { x = matW / 2; align = 'center'; }
      if (pos === 'tr' || pos === 'br') { x = matW - edge; align = 'right'; }
      const bandY = (pos === 'tl' || pos === 'tc' || pos === 'tr') ? pad / 2 : matH - pad / 2;
      displayCtx.textAlign = align;
      lines.forEach((line, i) => {
        displayCtx.fillText(line, x, bandY + (i - (lines.length - 1) / 2) * lineH, maxW);
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

  function _isHeavyEffectRender() {
    if (!workingPixels) return false;
    const px = workingPixels.width * workingPixels.height;
    const kernel =
      effects.sharpen > 0 || effects.emboss || effects.edge
      || effects.grain > 0 || effects.posterize > 1 || effects.warmth !== 0
      || effects.solarize > 0;
    const cssHeavy = effects.blur > 0 || _buildFilterString() !== 'none' || effects.vignette > 0;
    if (kernel) return px >= 250000;           // ~0.25MP+
    if (cssHeavy) return px >= 800000;         // ~0.8MP+
    return px >= 2000000;                     // plain redraw ~2MP+
  }

  function _progressDialog() {
    return window._ProgressDialog || null;
  }

  async function _runEffectRenderPass(wantProgress) {
    const gen = ++_effectRenderGen;
    const dlg = _progressDialog();
    const show = !!(wantProgress && dlg && _isHeavyEffectRender());

    if (show) {
      _effectProgressOwner = gen;
      dlg.show({
        title: _tProgress('progress.effectTitle', _tProgress('progress.title', 'Progress')),
        message: _tProgress('progress.effectApplying', 'Applying effects…'),
        percent: 4,
      });
      dlg.startCreep(90);
    }

    try {
      if (show) {
        await dlg.yieldFrame();
        if (gen !== _effectRenderGen) return false;
        dlg.set(18, _tProgress('progress.effectApplying', 'Applying effects…'));
        await dlg.yieldFrame();
        if (gen !== _effectRenderGen) return false;
      }

      if (gen !== _effectRenderGen) return false;
      _render();

      if (show && gen === _effectRenderGen && _effectProgressOwner === gen) {
        dlg.stopCreep();
        dlg.set(100, _tProgress('progress.done', 'Done'));
        await dlg.yieldFrame(70);
      }
      return gen === _effectRenderGen;
    } finally {
      if (show && _effectProgressOwner === gen) {
        dlg.hide();
        if (_effectProgressOwner === gen) _effectProgressOwner = 0;
      }
    }
  }

  function _requestEffectRender(wantProgress, saveHist) {
    const prev = _effectRenderQueued;
    _effectRenderQueued = {
      wantProgress: !!(wantProgress || (prev && prev.wantProgress)),
      saveHist: !!(saveHist || (prev && prev.saveHist)),
    };
    if (_effectRenderBusy) {
      // Abort in-flight pass after its next yield; latest effects win.
      _effectRenderGen++;
      return;
    }
    _effectRenderBusy = true;
    (async () => {
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
          _requestEffectRender(again.wantProgress, again.saveHist);
        }
      }
    })();
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

    // Live caption typing: sync draw, no modal
    if (!saveHist && (key === 'borderCaptionText' || key === 'borderCaption'
      || key === 'borderCaptionPos' || key === 'borderColor'
      || key === 'borderShadowStyle' || key === 'borderShadowDir')) {
      if (changed) _render();
      return;
    }

    // Value already applied via live input — just commit history
    if (!changed && saveHist) {
      _saveHistory();
      return;
    }

    // Interactive slider/select: redraw the image only (never full-window progress)
    _requestEffectRender(false, !!saveHist);
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
    effects.solarize = 0;
    effects.borderWidth = 0; effects.borderColor = '#ffffff'; effects.borderShadow = 0;
    effects.borderShadowStyle = 'soft';
    effects.borderShadowDir = 'br';
    effects.borderCaption = false; effects.borderCaptionPos = 'bl'; effects.borderCaptionText = '';
  }

  function _effectsChangedFromDefault() {
    return effects.brightness !== 100 || effects.contrast !== 100 || effects.saturation !== 100
      || effects.hue !== 0 || effects.blur !== 0 || effects.grayscale !== 0
      || effects.sepia !== 0 || effects.invert !== 0 || effects.sharpen !== 0
      || effects.emboss || effects.edge || effects.vignette !== 0 || effects.warmth !== 0
      || effects.grain !== 0 || effects.posterize !== 0 || effects.solarize !== 0
      || effects.borderWidth !== 0 || effects.borderShadow !== 0
      || (effects.borderShadowStyle && effects.borderShadowStyle !== 'soft')
      || (effects.borderShadowDir && effects.borderShadowDir !== 'br')
      || effects.borderCaption || !!(effects.borderCaptionText)
      || (effects.borderColor && effects.borderColor !== '#ffffff');
  }

  function resetEffects() {
    if (!_effectsChangedFromDefault()) return;
    _resetEffects();
    _requestEffectRender(true, true);
  }

  const PRESETS = {
    grayscale:  { grayscale: 100 },
    sepia:      { sepia: 100, saturation: 60 },
    invert:     { invert: 100 },
    vivid:      { saturation: 160, contrast: 115 },
    fade:       { brightness: 120, saturation: 60, contrast: 85 },
    cool:       { hue: -20, saturation: 90 },
    warm:       { warmth: 60, saturation: 110 },
    vintage:    { sepia: 40, saturation: 70, contrast: 90, vignette: 50 },
    dramatic:   { contrast: 150, grayscale: 30, vignette: 40 },
    emboss:     { emboss: true, grayscale: 100 },
    edge:       { edge: true, grayscale: 100, contrast: 130 },
    noir:       { grayscale: 100, contrast: 145, brightness: 90, vignette: 55 },
    soft:       { blur: 1.5, brightness: 112, contrast: 90, saturation: 85 },
    crisp:      { sharpen: 55, contrast: 118, saturation: 110 },
    sunset:     { warmth: 80, hue: 12, saturation: 130, contrast: 110, vignette: 25 },
    arctic:     { hue: -35, warmth: -50, saturation: 85, brightness: 108, contrast: 105 },
    pastel:     { brightness: 118, contrast: 80, saturation: 70, warmth: 15 },
    matte:      { brightness: 112, contrast: 78, saturation: 88, vignette: 15 },
    neon:       { saturation: 180, contrast: 125, hue: 25, sharpen: 20 },
    moonlight:  { hue: -40, warmth: -40, saturation: 55, brightness: 85, contrast: 120, vignette: 45 },
    golden:     { warmth: 90, saturation: 120, brightness: 108, contrast: 105 },
    bleach:     { brightness: 135, saturation: 25, contrast: 95 },
    pop:        { saturation: 175, contrast: 130, sharpen: 25 },
    crossprocess: { hue: -15, saturation: 140, contrast: 125, warmth: -20 },
    documentary:{ saturation: 55, contrast: 120, brightness: 98, vignette: 20 },
    highkey:    { brightness: 140, contrast: 75, saturation: 90 },
    lowkey:     { brightness: 72, contrast: 140, saturation: 80, vignette: 60 },
    silver:     { grayscale: 100, contrast: 115, brightness: 105 },
    polaroid:   { sepia: 25, brightness: 115, contrast: 88, saturation: 75, vignette: 35 },
    lomo:       { saturation: 140, contrast: 130, vignette: 70, warmth: 25 },
    filmcamera: { warmth: 40, sepia: 16, contrast: 92, brightness: 106, saturation: 90, hue: 6, vignette: 34, grain: 42, sharpen: 10 },
    disposable: { brightness: 118, contrast: 108, saturation: 85, warmth: 22, hue: 8, vignette: 48, grain: 55, sharpen: 6 },
    kodachrome: { saturation: 145, contrast: 128, warmth: 28, hue: 8, sharpen: 22, vignette: 16 },
    velvia:     { saturation: 170, contrast: 138, warmth: 12, hue: -8, sharpen: 28, vignette: 14 },
    portra:     { warmth: 30, saturation: 96, contrast: 88, brightness: 108, hue: 4, grain: 22, vignette: 16 },
    trix:       { grayscale: 100, contrast: 138, brightness: 98, grain: 64, vignette: 28, sharpen: 18 },
    expired:    { hue: 22, saturation: 68, contrast: 76, brightness: 114, warmth: 18, grain: 52, vignette: 24, sepia: 12 },
    cinestill:  { warmth: 58, saturation: 118, contrast: 110, brightness: 102, blur: 0.7, grain: 26, vignette: 18, hue: 8 },
    redscale:   { hue: 30, warmth: 92, saturation: 132, contrast: 118, brightness: 94, vignette: 32 },
    holga:      { contrast: 122, saturation: 78, brightness: 112, vignette: 80, grain: 42, blur: 0.8, warmth: 22 },
    slide:      { saturation: 152, contrast: 130, brightness: 96, warmth: 12, sharpen: 20, vignette: 12 },
    autumn:     { warmth: 72, hue: 18, saturation: 128, contrast: 110, brightness: 102 },
    spring:     { hue: -18, saturation: 122, brightness: 112, contrast: 94, warmth: -12 },
    dusk:       { hue: -6, warmth: 48, saturation: 88, brightness: 80, contrast: 122, vignette: 42 },
    fog:        { brightness: 128, contrast: 60, saturation: 52, blur: 1.3, warmth: -10 },
    dream:      { blur: 2.2, brightness: 120, contrast: 80, saturation: 78, warmth: 22, vignette: 22 },
    hdr:        { contrast: 158, saturation: 142, sharpen: 48, brightness: 106, vignette: 14 },
    infrared:   { hue: -82, saturation: 145, brightness: 122, contrast: 112, grayscale: 12 },
    nightvision:{ hue: -72, grayscale: 38, saturation: 165, brightness: 96, contrast: 132, grain: 22 },
    newspaper:  { grayscale: 100, contrast: 142, grain: 48, sharpen: 32, brightness: 110 },
    sketch:     { edge: true, grayscale: 100, invert: 100, contrast: 118 },
    retro70:    { sepia: 32, hue: 12, saturation: 82, contrast: 94, warmth: 42, vignette: 32, grain: 28 },
    retro80:    { saturation: 158, contrast: 122, hue: -28, warmth: -18, vignette: 18 },
    tungsten:   { warmth: 88, hue: 10, saturation: 108, brightness: 102 },
    fluorescent:{ hue: -32, warmth: -38, saturation: 112, contrast: 110 },
    chrome:     { saturation: 138, contrast: 142, sharpen: 32, brightness: 102, vignette: 12 },
    orton:      { blur: 2.6, brightness: 126, contrast: 84, saturation: 112, warmth: 16 },
    comic:      { posterize: 4, saturation: 155, contrast: 142, sharpen: 18 },
    xray:       { invert: 100, grayscale: 85, contrast: 122, hue: -48, brightness: 108 },
    clarity:    { sharpen: 70, contrast: 112, saturation: 105 },
    haze:       { brightness: 122, contrast: 70, saturation: 70, blur: 0.8 },
    cyanotype:  { grayscale: 70, hue: -50, warmth: -60, contrast: 115, saturation: 80 },
    tealorange: { hue: -12, warmth: 35, saturation: 135, contrast: 118 },
    /* ── additional distinct looks ── */
    underwater: { hue: -48, warmth: -55, saturation: 95, brightness: 88, contrast: 118, blur: 0.4 },
    desert:     { warmth: 78, hue: 22, saturation: 72, contrast: 108, brightness: 112, vignette: 22 },
    forest:     { hue: -28, warmth: -18, saturation: 118, contrast: 122, brightness: 94, vignette: 18 },
    lavender:   { hue: -62, warmth: -8, saturation: 88, brightness: 116, contrast: 86, blur: 0.5 },
    candy:      { hue: 42, saturation: 155, brightness: 118, contrast: 92, warmth: 28 },
    midnight:   { hue: -55, warmth: -45, brightness: 62, contrast: 138, saturation: 70, vignette: 58 },
    thermal:    { posterize: 5, hue: 48, saturation: 170, contrast: 135, brightness: 105 },
    blueprint:  { grayscale: 100, hue: -70, warmth: -80, contrast: 132, brightness: 98, invert: 0 },
    selenium:   { grayscale: 100, hue: -18, warmth: -25, contrast: 120, brightness: 102, vignette: 12 },
    platinum:   { grayscale: 100, brightness: 118, contrast: 88, vignette: 8, sharpen: 8 },
    lith:       { grayscale: 100, contrast: 175, brightness: 92, grain: 58, vignette: 35, sharpen: 28 },
    washout:    { brightness: 148, contrast: 68, saturation: 55, warmth: 35, vignette: 10 },
    muted:      { saturation: 42, contrast: 95, brightness: 104, warmth: -8, vignette: 10 },
    cyberpunk:  { hue: -55, saturation: 168, contrast: 145, brightness: 96, warmth: -30, vignette: 28, sharpen: 22 },
    vaporwave:  { hue: -75, saturation: 150, contrast: 110, brightness: 112, warmth: -15, vignette: 20 },
    charcoal:   { grayscale: 100, contrast: 108, brightness: 96, grain: 72, blur: 0.4, vignette: 20 },
    ink:        { grayscale: 100, contrast: 160, brightness: 88, vignette: 30, sharpen: 40 },
    dayfornight:{ hue: -42, warmth: -50, brightness: 70, contrast: 128, saturation: 65, vignette: 40 },
    bloom:      { blur: 1.8, brightness: 128, contrast: 82, saturation: 105, warmth: 18 },
    punch:      { contrast: 135, saturation: 148, sharpen: 35, brightness: 102 },
    flat:       { contrast: 72, saturation: 88, brightness: 108, vignette: 0 },
    winter:     { hue: -30, warmth: -42, brightness: 110, contrast: 112, saturation: 78, sharpen: 15 },
    summer:     { warmth: 45, hue: 8, saturation: 132, brightness: 114, contrast: 108 },
    rainy:      { hue: -22, warmth: -28, saturation: 58, contrast: 95, brightness: 98, blur: 0.6, grain: 18 },
    peach:      { warmth: 55, hue: 18, saturation: 95, brightness: 116, contrast: 88 },
    coral:      { hue: 28, warmth: 62, saturation: 140, contrast: 112, brightness: 108 },
    emerald:    { hue: -40, warmth: -20, saturation: 145, contrast: 125, brightness: 98 },
    amethyst:   { hue: -70, saturation: 130, contrast: 115, brightness: 105, warmth: -10 },
    copper:     { warmth: 85, hue: 16, saturation: 110, contrast: 120, brightness: 100, vignette: 18 },
    denim:      { hue: -38, warmth: -35, saturation: 70, contrast: 118, brightness: 100 },
    olive:      { hue: -8, warmth: 12, saturation: 55, contrast: 110, brightness: 98, vignette: 14 },
    gothic:     { brightness: 68, contrast: 145, saturation: 45, vignette: 65, hue: -8, warmth: -15 },
    romance:    { warmth: 48, hue: 14, saturation: 92, brightness: 118, contrast: 86, blur: 0.7, vignette: 18 },
    solarize:   { solarize: 62, contrast: 125, saturation: 110 },
    duotone:    { grayscale: 55, hue: -85, saturation: 140, contrast: 128, brightness: 102 },
    glitch:     { posterize: 3, hue: 55, saturation: 160, contrast: 150, invert: 15, sharpen: 20 },
    watercolor: { blur: 1.4, contrast: 78, saturation: 85, brightness: 114, warmth: 12, vignette: 12 },
    anime:      { saturation: 148, contrast: 118, brightness: 112, sharpen: 25, warmth: 10 },
    silhouette: { brightness: 48, contrast: 170, saturation: 30, vignette: 70 },
    amber:      { warmth: 95, hue: 20, saturation: 105, contrast: 115, brightness: 104, vignette: 16 },
    mint:       { hue: -55, warmth: -25, saturation: 100, brightness: 118, contrast: 95 },
    mustard:    { hue: 32, warmth: 40, saturation: 90, contrast: 108, brightness: 106 },
    steel:      { grayscale: 70, hue: -25, warmth: -40, contrast: 130, saturation: 40, sharpen: 30 },
    push:       { contrast: 145, saturation: 125, grain: 38, brightness: 96, vignette: 22 },
    pull:       { contrast: 82, saturation: 78, brightness: 112, grain: 16 },
    midcentury: { sepia: 22, warmth: 35, saturation: 75, contrast: 105, brightness: 108, vignette: 28 },
    horror:     { hue: -15, warmth: -20, brightness: 78, contrast: 155, saturation: 50, vignette: 55, grain: 30 },
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
    };
    _resetEffects();
    Object.assign(effects, border);
    const preset = PRESETS[name];
    if (preset) Object.assign(effects, preset);
    if (JSON.stringify(effects) === before) return;
    _requestEffectRender(true, true);
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
    _saveHistory();
  }

  function flip(axis) {
    if (axis === 'h') flipH = !flipH;
    else              flipV = !flipV;
    clearSelection();
    _drawOriginalToWorking();
    _render();
    _saveHistory();
  }

  function resetTransform() {
    if (rotation === 0 && !flipH && !flipV) return;
    rotation = 0; flipH = false; flipV = false;
    clearSelection();
    _resizeCanvases();
    _drawOriginalToWorking();
    _render();
    _saveHistory();
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

  function cropToSelection() {
    if (!selMask || !workingPixels) return false;
    const bounds = getSelectionBounds(0);
    if (!bounds) return false;
    const ok = cropToRect(bounds.x, bounds.y, bounds.w, bounds.h, { clearOutsideMask: true });
    if (ok) _saveHistory();
    return ok;
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

  function undo() {
    if (histIndex <= 0) return false;
    histIndex--;
    _restoreHistoryFrame(history[histIndex]);
    if (onHistoryChange) onHistoryChange();
    return true;
  }

  function redo() {
    if (histIndex >= history.length - 1) return false;
    histIndex++;
    _restoreHistoryFrame(history[histIndex]);
    if (onHistoryChange) onHistoryChange();
    return true;
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

  function beginEditSession() {
    _editSession = {
      frame: _snapshot(),
      history: history.slice(),
      histIndex,
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
    return histIndex !== _editSession.histIndex;
  }

  /* ═══════════════════════════════════════════
     Export / Save
  ═══════════════════════════════════════════ */
  function exportAsDataUrl(format = 'image/png', quality = 0.95) {
    return displayCanvas ? displayCanvas.toDataURL(format, quality) : null;
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
    init, setCallbacks, loadImage,
    setEffect, getEffects, setCaptionLines, setCaptionValues, resetEffects, applyPreset,
    rotate, flip, resetTransform,
    setTool, getTool, clearSelection, hasSelection,
    removeBackground, removeBackgroundAuto, listBgAlgorithms, isRembgAlgorithm, applyFromDataUrl,
    fillSelection, cropToSelection, cropAfterBackgroundRemove, getSelectionBounds,
    cut, copySelection,
    setMagicTolerance,
    undo, redo, canUndo, canRedo, saveHistory: _saveHistory,
    beginEditSession, revertEditSession, commitEditSession, hasEditSessionChanges,
    exportAsDataUrl, getCanvasElement, isLoaded, clear,
    getDimensions, getPhotoDimensions, getRotation, getFlipState,
    _applyEdgeDetect,
  };
})();
