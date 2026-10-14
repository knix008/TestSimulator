// Edit mode (ACDSee Develop + Edit). The photo is decoded once at full size
// (camera RAW files are developed with LibRaw); a smaller copy drives the live
// preview through the same pipeline that renders the saved file.
//
// Edits are a settings object (see pipeline.js): saving in place keeps the
// original aside and remembers the settings, so the photo can be re-edited
// later from the original without losing quality.
import { joinPath, parentOf } from '../catalog/catalog.js';
import { autoLevels, curveTable, DEFAULT_ADJUST, histogram } from '../edit/adjust.js';
import { BLEND_MODES, COLOR_BANDS, EFFECTS, effectParams, whiteBalanceFromPixel } from '../edit/advanced.js';
import { apply, cropForAspect, invert, layout } from '../edit/geometry.js';
import { applyPreset, DEFAULT_CANVAS, DEFAULT_DETAIL, DEFAULT_FX, DEFAULT_LENS, DEFAULT_OVERLAY, defaultEdit, isEmptyEdit, normalizeEdit, presetOf, render } from '../edit/pipeline.js';
import { context2d, scaledCanvas } from '../formats/canvas.js';
import { decodeImage } from '../formats/decode.js';
import { encodeCanvas } from '../formats/encode.js';
import { canWriteBack, extensionOf, isRaw, OUTPUT_FORMATS, outputFormatFor, stemOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { chooseFiles, chooseSavePath, errorText, isDesktop } from '../platform/native.js';
import { app, reload, saveCatalogSoon } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { confirmDialog, field, openDialog, promptDialog, selectEl, toast } from './dialog.js';
import { colorSwatches } from './colorswatch.js';
import { button, clear, h, rafThrottle } from './dom.js';
import { drawHistogram } from './histogram.js';
import { icon } from './icons.js';

const PREVIEW_MAX = 1800;
const ASPECTS = [['free', null], ['original', 'original'], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['5:4', 5 / 4], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]];
const ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const clone = (value) => JSON.parse(JSON.stringify(value));
/** Tools that work in source-pixel coordinates (the preview is drawn without border/layers/text). */
const SOURCE_TOOLS = ['redeye', 'heal', 'clone', 'wbpick', 'gradient', 'radial', 'brush'];

/** Edit settings copied with "Copy settings", shared with the batch "Paste settings". */
export const editClipboard = { preset: null };

export function createEditor({ onDone }) {
  const panel = h('div.editor-panel');
  const canvasHolder = h('div.editor-canvas');
  const overlay = h('div.editor-overlay');
  const bar = h('div.editor-toolbar');
  const histCanvas = h('canvas.editor-histogram', { width: 256, height: 80 });
  const info = h('div.editor-info');
  const el = h('div.editor', bar, h('div.editor-body', h('div.editor-side', histCanvas, panel), h('div.editor-stage', canvasHolder, overlay)), info);

  let item = null;
  let original = null;
  let full = null;
  let preview = null;
  let scale = 1;
  let edit = defaultEdit();
  let undo = []; // [{ edit, label }]
  let redo = [];
  let tool = null;
  let cropDraft = null;
  let cropAspect = null;
  const brush = { size: 40, hardness: 0.6, erase: false };
  let cloneSource = null;
  let before = false;
  let shown = null;
  let section = 'light';
  let busy = false;
  let rawMode = null; // null | 'camera' | 'auto' | 'daylight' — developing a RAW file
  let fromOriginal = false;
  let selectedLocal = -1;
  let selectedLayer = -1;
  let band = 'red';
  const drawStyle = { type: 'arrow', color: '#ff3b30', width: 0.6, fill: false };
  const layerImages = new Map();

  // ───────── state

  function commit(label = t(`edit.${section ?? 'light'}`)) {
    undo.push({ edit: clone(edit), label });
    if (undo.length > 150) undo.shift();
    redo = [];
    updateBar();
  }

  function change(mutator, label) {
    commit(label);
    mutator(edit);
    draw();
    updateBar();
    if (section === 'history') buildPanel();
  }

  function doUndo() {
    if (!undo.length) return;
    const entry = undo.pop();
    redo.push({ edit: clone(edit), label: entry.label });
    edit = normalizeEdit(entry.edit);
    buildPanel();
    draw();
    updateBar();
  }

  function doRedo() {
    if (!redo.length) return;
    const entry = redo.pop();
    undo.push({ edit: clone(edit), label: entry.label });
    edit = normalizeEdit(entry.edit);
    buildPanel();
    draw();
    updateBar();
  }

  /** History panel: back to the state after step `index` (0 = as opened). */
  function goToHistory(index) {
    while (undo.length > index) doUndo();
  }

  // ───────── drawing

  const draw = rafThrottle(() => {
    if (!preview) return;
    const output = before ? preview : render(preview, edit, { scale, skipCrop: tool === 'crop', skipOverlay: SOURCE_TOOLS.includes(tool) || tool === 'crop' || tool === 'line', layerImages });
    let canvas = output;
    if (!(canvas instanceof HTMLCanvasElement)) {
      canvas = document.createElement('canvas');
      canvas.width = output.width;
      canvas.height = output.height;
      canvas.getContext('2d').drawImage(output, 0, 0);
    }
    canvas.className = 'editor-preview';
    clear(canvasHolder);
    canvasHolder.append(canvas);
    shown = canvas;
    fitCanvas();
    try {
      drawHistogram(histCanvas, histogram(context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height), 3));
    } catch { /* never break the preview */ }
    drawOverlay();
    const out = layout(full.width, full.height, edit.geometry);
    info.textContent = `${item.name}${rawMode ? ' · RAW (LibRaw)' : ''}${fromOriginal ? ` · ${t('edit.fromOriginal')}` : ''} · ${full.width} × ${full.height} → ${out.width} × ${out.height}${before ? ` · ${t('edit.before')}` : ''}`;
  });

  function fitCanvas() {
    if (!shown) return;
    const box = canvasHolder.getBoundingClientRect();
    const k = Math.min((box.width - 24) / shown.width, (box.height - 24) / shown.height, 2);
    shown.style.width = `${Math.max(1, shown.width * k)}px`;
    shown.style.height = `${Math.max(1, shown.height * k)}px`;
  }

  function displayRect() {
    const c = shown.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    return { x: c.left - o.left, y: c.top - o.top, w: c.width, h: c.height };
  }

  function fractionAt(event) {
    const r = displayRect();
    const o = overlay.getBoundingClientRect();
    return { fx: (event.clientX - o.left - r.x) / r.w, fy: (event.clientY - o.top - r.y) / r.h };
  }

  /** Display point → original-picture pixels (for tools that work on the source). */
  function sourcePoint(event) {
    const { fx, fy } = fractionAt(event);
    const plan = layout(preview.width, preview.height, edit.geometry, { sourceScale: scale });
    const [sx, sy] = apply(invert(plan.matrix), fx * plan.width, fy * plan.height);
    return { x: sx / scale, y: sy / scale, fx, fy, displayPerSource: (displayRect().w / plan.width) * scale };
  }

  function sourceToDisplay(x, y) {
    const r = displayRect();
    const plan = layout(preview.width, preview.height, edit.geometry, { sourceScale: scale });
    const [px, py] = apply(plan.matrix, x * scale, y * scale);
    const k = r.w / plan.width;
    return { x: r.x + px * k, y: r.y + py * k, k: k * scale };
  }

  function drawOverlay() {
    clear(overlay);
    overlay.className = `editor-overlay${tool ? ` tool-${tool}` : ''}`;
    if (!shown || before) return;
    if (tool === 'crop' && cropDraft) {
      const r = displayRect();
      const box = h('div.crop-box', { style: { left: `${r.x + cropDraft.x * r.w}px`, top: `${r.y + cropDraft.y * r.h}px`, width: `${cropDraft.w * r.w}px`, height: `${cropDraft.h * r.h}px` } },
        h('div.crop-grid'), ...['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((dir) => h(`div.crop-handle.${dir}`, { dataset: { dir } })));
      const shade = h('div.crop-shade', { style: { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cropDraft.x * 100}% ${cropDraft.y * 100}%, ${cropDraft.x * 100}% ${(cropDraft.y + cropDraft.h) * 100}%, ${(cropDraft.x + cropDraft.w) * 100}% ${(cropDraft.y + cropDraft.h) * 100}%, ${(cropDraft.x + cropDraft.w) * 100}% ${cropDraft.y * 100}%, ${cropDraft.x * 100}% ${cropDraft.y * 100}%)` } });
      overlay.append(shade, box);
      box.addEventListener('pointerdown', cropPointer);
    }
    if (['redeye', 'heal', 'clone'].includes(tool)) {
      for (const spot of edit.spots.filter((s) => s.type === tool)) {
        const p = sourceToDisplay(spot.x, spot.y);
        overlay.append(h(`div.spot-mark.${tool}`, { style: { left: `${p.x}px`, top: `${p.y}px`, width: `${spot.r * p.k * 2}px`, height: `${spot.r * p.k * 2}px` } }));
      }
      if (tool === 'clone' && cloneSource) {
        const p = sourceToDisplay(cloneSource.x, cloneSource.y);
        overlay.append(h('div.spot-mark.source', { style: { left: `${p.x}px`, top: `${p.y}px`, width: '14px', height: '14px' } }));
      }
    }
    const local = edit.local[selectedLocal];
    if (local && ['gradient', 'radial', 'brush'].includes(tool)) {
      const s = local.shape;
      if (local.kind === 'gradient' && s.x1 != null) {
        const a = sourceToDisplay(s.x1, s.y1);
        const b = sourceToDisplay(s.x2, s.y2);
        overlay.append(h('div.gradient-line', { style: { left: `${a.x}px`, top: `${a.y}px`, width: `${Math.hypot(b.x - a.x, b.y - a.y)}px`, transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)` } }));
      }
      if (local.kind === 'radial' && s.cx != null) {
        const c = sourceToDisplay(s.cx, s.cy);
        overlay.append(h('div.radial-ring', { style: { left: `${c.x}px`, top: `${c.y}px`, width: `${s.rx * c.k * 2}px`, height: `${s.ry * c.k * 2}px` } }));
      }
    }
  }

  // ───────── pointer tools

  overlay.addEventListener('pointerdown', (event) => {
    if (!shown || before || !tool || tool === 'crop') return;
    const { fx, fy } = fractionAt(event);
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
    event.preventDefault();
    const radiusFor = (displayPerSource) => Math.max(2, brush.size / 2 / displayPerSource);
    if (tool === 'text') {
      const index = edit.overlay.texts.length - 1;
      if (index >= 0) change((e) => { e.overlay.texts[index].x = fx; e.overlay.texts[index].y = fy; }, t('edit.text'));
      return;
    }
    if (tool === 'layer') {
      if (selectedLayer >= 0) change((e) => { e.layers[selectedLayer].x = fx; e.layers[selectedLayer].y = fy; }, t('edit.moveLayer'));
      return;
    }
    const point = sourcePoint(event);
    if (tool === 'wbpick') {
      const px = Math.round(point.x * scale);
      const py = Math.round(point.y * scale);
      const sample = context2d(preview, { willReadFrequently: true }).getImageData(Math.max(0, px - 2), Math.max(0, py - 2), 5, 5).data;
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let i = 0; i < sample.length; i += 4) { r += sample[i]; g += sample[i + 1]; b += sample[i + 2]; n++; }
      const wb = whiteBalanceFromPixel(r / n, g / n, b / n);
      change((e) => { e.adjust.temperature = wb.temperature; e.adjust.tint = wb.tint; }, t('edit.wbPick'));
      tool = null;
      buildPanel();
      return;
    }
    if (tool === 'redeye' || tool === 'heal') {
      change((e) => { e.spots.push({ type: tool, x: Math.round(point.x), y: Math.round(point.y), r: Math.round(radiusFor(point.displayPerSource)) }); }, t(`edit.${tool}`));
      return;
    }
    if (tool === 'clone') {
      if (event.altKey || !cloneSource) { cloneSource = { x: point.x, y: point.y }; drawOverlay(); toast(t('edit.cloneSourceSet'), 'info', 1200); return; }
      const { x: sx, y: sy } = cloneSource;
      change((e) => { e.spots.push({ type: 'clone', x: Math.round(point.x), y: Math.round(point.y), sx: Math.round(sx), sy: Math.round(sy), r: Math.round(radiusFor(point.displayPerSource)), hardness: brush.hardness }); }, t('edit.clone'));
      return;
    }
    // Drags: gradient, radial, brush, straighten line, drawings.
    const start = point;
    const startFraction = { fx, fy };
    let created = false;
    const ensureLocal = (kind) => {
      if (created) return;
      created = true;
      commit(t(`edit.local.${kind}`));
      if (kind === 'brush' && edit.local[selectedLocal]?.kind === 'brush') return;
      edit.local.push({ kind, shape: kind === 'brush' ? { strokes: [] } : {}, adjust: { exposure: 0.5 }, detail: {} });
      selectedLocal = edit.local.length - 1;
    };
    let stroke = null;
    if (tool === 'brush') {
      ensureLocal('brush');
      stroke = { points: [[start.x, start.y]], radius: radiusFor(start.displayPerSource), hardness: brush.hardness, erase: brush.erase };
      edit.local[selectedLocal].shape.strokes.push(stroke);
    }
    let drawing = null;
    if (tool === 'draw') {
      commit(t('edit.drawTools'));
      drawing = { ...drawStyle, points: [[fx, fy], [fx, fy]] };
      edit.drawings.push(drawing);
    }
    overlay.setPointerCapture(event.pointerId);
    const move = (e) => {
      const p = sourcePoint(e);
      if (tool === 'gradient') { ensureLocal('gradient'); edit.local[selectedLocal].shape = { x1: start.x, y1: start.y, x2: p.x, y2: p.y }; }
      if (tool === 'radial') {
        ensureLocal('radial');
        const rx = Math.max(4, Math.abs(p.x - start.x));
        const ry = Math.max(4, Math.abs(p.y - start.y));
        edit.local[selectedLocal].shape = { cx: start.x, cy: start.y, rx, ry: e.shiftKey ? rx : ry, feather: 50 };
      }
      if (tool === 'brush') stroke.points.push([p.x, p.y]);
      if (tool === 'draw') { const f = fractionAt(e); if (drawing.type === 'free') drawing.points.push([f.fx, f.fy]); else drawing.points[1] = [f.fx, f.fy]; }
      if (tool === 'line') {
        const f = fractionAt(e);
        const r = displayRect();
        overlay.querySelector('.level-line')?.remove();
        const x1 = r.x + startFraction.fx * r.w; const y1 = r.y + startFraction.fy * r.h; const x2 = r.x + f.fx * r.w; const y2 = r.y + f.fy * r.h;
        overlay.append(h('div.level-line', { style: { left: `${x1}px`, top: `${y1}px`, width: `${Math.hypot(x2 - x1, y2 - y1)}px`, transform: `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)` } }));
        return;
      }
      draw();
    };
    const up = (e) => {
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerup', up);
      if (tool === 'line') {
        const f = fractionAt(e);
        const r = displayRect();
        const dx = (f.fx - startFraction.fx) * r.w;
        const dy = (f.fy - startFraction.fy) * r.h;
        if (Math.hypot(dx, dy) > 10) {
          let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (angle > 45) angle -= 90; else if (angle < -45) angle += 90; // a near-vertical line straightens verticals
          change((ed) => { ed.geometry.straighten = Math.max(-45, Math.min(45, Math.round((ed.geometry.straighten - angle) * 10) / 10)); }, t('edit.straighten'));
        }
        tool = null;
      }
      updateBar();
      buildPanel();
      draw();
    };
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', up);
  });

  // ───────── crop

  function startCrop() {
    tool = 'crop';
    cropDraft = edit.geometry.crop ? { ...edit.geometry.crop } : { x: 0, y: 0, w: 1, h: 1 };
    buildPanel();
    draw();
  }

  const aspectValue = () => (cropAspect === 'original' ? full.width / full.height : cropAspect);

  function setAspect(value) {
    cropAspect = value;
    const plan = layout(full.width, full.height, edit.geometry, { skipCrop: true });
    const a = aspectValue();
    if (a) cropDraft = cropForAspect(plan.width, plan.height, a);
    drawOverlay();
  }

  function cropPointer(event) {
    event.preventDefault();
    event.stopPropagation();
    const dir = event.target.dataset.dir ?? 'move';
    const r = displayRect();
    const start = { ...cropDraft };
    const sx = event.clientX;
    const sy = event.clientY;
    const plan = layout(full.width, full.height, edit.geometry, { skipCrop: true });
    const pixelAspect = plan.width / plan.height;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e) => {
      const dx = (e.clientX - sx) / r.w;
      const dy = (e.clientY - sy) / r.h;
      let { x, y, w, h: hh } = start;
      if (dir === 'move') {
        x = Math.max(0, Math.min(1 - w, x + dx));
        y = Math.max(0, Math.min(1 - hh, y + dy));
      } else {
        if (dir.includes('w')) { x = Math.min(start.x + start.w - 0.02, Math.max(0, start.x + dx)); w = start.x + start.w - x; }
        if (dir.includes('e')) w = Math.max(0.02, Math.min(1 - start.x, start.w + dx));
        if (dir.includes('n')) { y = Math.min(start.y + start.h - 0.02, Math.max(0, start.y + dy)); hh = start.y + start.h - y; }
        if (dir.includes('s')) hh = Math.max(0.02, Math.min(1 - start.y, start.h + dy));
        const a = aspectValue();
        if (a) {
          const wantH = (w * pixelAspect) / a;
          if (dir === 'n' || dir === 's') w = (hh * a) / pixelAspect; else hh = wantH;
          if (y + hh > 1) { hh = 1 - y; w = (hh * a) / pixelAspect; }
          if (x + w > 1) { w = 1 - x; hh = (w * pixelAspect) / a; }
          if (dir.includes('n')) y = start.y + start.h - hh;
          if (dir.includes('w')) x = start.x + start.w - w;
        }
      }
      cropDraft = { x, y, w, h: hh };
      drawOverlay();
    };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }

  function applyCrop() {
    const whole = cropDraft && cropDraft.w > 0.999 && cropDraft.h > 0.999;
    change((e) => { e.geometry.crop = whole ? null : { ...cropDraft }; }, t('edit.crop'));
    tool = null;
    cropDraft = null;
    buildPanel();
    draw();
  }

  function setTool(next) {
    tool = tool === next ? null : next;
    cropDraft = null;
    buildPanel();
    draw();
  }

  function cancelTool() {
    tool = null;
    cropDraft = null;
    buildPanel();
    draw();
  }

  // ───────── panel helpers

  function sliderRow(label, min, max, stepValue, get, set, format = (v) => v, key = '') {
    const value = get() ?? 0;
    const output = h('span.slider-value', String(format(value)));
    const input = h('input.slider', { type: 'range', min, max, step: stepValue, value, dataset: { key } });
    let committed = false;
    input.addEventListener('input', () => {
      if (!committed) { commit(label); committed = true; }
      set(Number(input.value));
      output.textContent = String(format(Number(input.value)));
      draw();
    });
    input.addEventListener('change', () => { committed = false; updateBar(); });
    const row = h('div.slider-row', h('div.slider-head', h('span', label), output), input);
    row.addEventListener('dblclick', () => { change(() => set(0), label); buildPanel(); });
    return row;
  }

  const slider = (group, key, label, min, max, stepValue = 1, format) => sliderRow(label, min, max, stepValue, () => edit[group][key], (v) => { edit[group][key] = v; }, format, `${group}.${key}`);
  const toolButton = (id, label, iconName) => h(`button.btn.small${tool === id ? '.primary' : ''}`, { type: 'button', id: `tool-${id}`, onclick: () => setTool(id) }, iconName ? h('span', { html: icon(iconName) }) : '', label);
  const resetButton = (label, mutator) => h('button.btn.small', { type: 'button', onclick: () => { change(mutator, label); buildPanel(); } }, t('edit.reset'));

  /**
   * What "reset" does for each section: its values back to the original
   * picture's (no change). The ↺ on a section's title is shown while the
   * section changes something.
   */
  const RESETS = {
    light: (e) => { for (const key of ['exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']) e.adjust[key] = DEFAULT_ADJUST[key]; e.tone.dehaze = 0; },
    color: (e) => { for (const key of ['temperature', 'tint', 'saturation', 'vibrance', 'hue']) e.adjust[key] = DEFAULT_ADJUST[key]; },
    colorEq: (e) => { e.tone.colorEq = null; },
    lightEq: (e) => { e.tone.lightEq = null; },
    splitTone: (e) => { e.tone.splitTone = null; },
    levels: (e) => { e.adjust.levels = null; },
    curves: (e) => { e.adjust.curves = null; },
    detail: (e) => { e.detail = { ...DEFAULT_DETAIL }; },
    lens: (e) => { e.lens = { ...DEFAULT_LENS }; },
    geometry: (e) => { e.geometry = { ...defaultEdit().geometry }; e.canvas = { ...DEFAULT_CANVAS }; },
    local: (e) => { e.local = []; },
    repair: (e) => { e.spots = []; e.tone.skin = 0; },
    effects: (e) => { e.adjust.effect = 'none'; e.adjust.effectAmount = 100; e.fx = { ...DEFAULT_FX }; e.effects = []; e.tilt = null; },
    draw: (e) => { e.drawings = []; },
    add: (e) => { e.overlay = { ...DEFAULT_OVERLAY, texts: [] }; },
    layers: (e) => { e.layers = []; },
  };
  /** Does the section change anything now (compared with the original picture)? */
  function sectionChanged(id) {
    if (!RESETS[id]) return false;
    const probe = normalizeEdit(JSON.parse(JSON.stringify(edit)));
    RESETS[id](probe);
    return JSON.stringify(probe) !== JSON.stringify(normalizeEdit(edit));
  }
  function resetSection(id) {
    change((e) => RESETS[id](e), `${t('edit.reset')}: ${t(`edit.${id}`)}`);
    if (id === 'local') selectedLocal = -1;
    if (id === 'layers') selectedLayer = -1;
    buildPanel();
  }

  function sectionHead(id, title, iconName) {
    const reset = RESETS[id] && sectionChanged(id)
      ? h('span.edit-section-reset', { role: 'button', title: `${t('edit.resetSection')} — ${title}`, dataset: { reset: id }, html: icon('undo'), onclick: (event) => { event.stopPropagation(); resetSection(id); } })
      : null;
    const head = h(`button.edit-section-head${section === id ? '.open' : ''}`, { type: 'button', dataset: { section: id } }, h('span', { html: icon(iconName) }), h('span', title), reset, h('span.arrow', { html: icon(section === id ? 'chevronDown' : 'chevronRight') }));
    head.addEventListener('click', () => { section = section === id ? null : id; if (tool) cancelTool(); else buildPanel(); });
    return head;
  }

  const SECTIONS = [
    ['light', 'sun'], ['color', 'droplet'], ['colorEq', 'palette'], ['lightEq', 'histogram'], ['splitTone', 'contrast'], ['levels', 'histogram'],
    ['curves', 'contrast'], ['detail', 'sharpen'], ['lens', 'camera'], ['geometry', 'crop'], ['local', 'sliders'], ['repair', 'bandage'],
    ['effects', 'wand'], ['draw', 'pencil'], ['add', 'text'], ['layers', 'layers'], ['presets', 'bookmark'], ['history', 'clock'],
  ];

  function buildPanel() {
    clear(panel);
    const bodies = { light: lightPanel, color: colorPanel, colorEq: colorEqPanel, lightEq: lightEqPanel, splitTone: splitTonePanel, levels: levelsPanel, curves: curvesPanel, detail: detailPanel, lens: lensPanel, geometry: geometryPanel, local: localPanel, repair: repairPanel, effects: effectsPanel, draw: drawPanel, add: addPanel, layers: layersPanel, presets: presetsPanel, history: historyPanel };
    for (const [id, iconName] of SECTIONS) {
      panel.append(sectionHead(id, t(`edit.${id}`), iconName));
      if (section === id) panel.append(h('div.edit-section', bodies[id]()));
    }
  }

  // ───────── panels

  function lightPanel() {
    return h('div',
      h('div.row-buttons', h('button.btn.small', { type: 'button', id: 'edit-auto', onclick: autoFix }, h('span', { html: icon('wand') }), t('edit.auto'))),
      rawMode ? field(t('edit.rawWb'), selectEl([['camera', t('edit.rawCamera')], ['auto', t('edit.rawAuto')], ['daylight', t('edit.rawDaylight')]], rawMode, (v) => redevelop(v))) : '',
      slider('adjust', 'exposure', t('edit.exposure'), -3, 3, 0.05, (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)} EV`),
      slider('adjust', 'brightness', t('edit.brightness'), -100, 100),
      slider('adjust', 'contrast', t('edit.contrast'), -100, 100),
      slider('adjust', 'highlights', t('edit.highlights'), -100, 100),
      slider('adjust', 'shadows', t('edit.shadows'), -100, 100),
      slider('adjust', 'whites', t('edit.whites'), -100, 100),
      slider('adjust', 'blacks', t('edit.blacks'), -100, 100),
      slider('tone', 'dehaze', t('edit.dehaze'), -100, 100));
  }

  function colorPanel() {
    return h('div',
      h('div.row-buttons', toolButton('wbpick', t('edit.wbPick'), 'droplet')),
      tool === 'wbpick' ? h('div.hint', t('edit.wbPickHint')) : '',
      slider('adjust', 'temperature', t('edit.temperature'), -100, 100),
      slider('adjust', 'tint', t('edit.tint'), -100, 100),
      slider('adjust', 'saturation', t('edit.saturation'), -100, 100),
      slider('adjust', 'vibrance', t('edit.vibrance'), -100, 100),
      slider('adjust', 'hue', t('edit.hue'), -180, 180, 1, (v) => `${v}°`));
  }

  function colorEqPanel() {
    const chips = h('div.chip-row', COLOR_BANDS.map((b) => h(`button.chip${b === band ? '.on' : ''}`, { type: 'button', dataset: { band: b }, onclick: () => { band = b; buildPanel(); } }, t(`band.${b}`))));
    const get = (key) => edit.tone.colorEq?.[band]?.[key] ?? 0;
    const set = (key) => (v) => {
      edit.tone.colorEq = edit.tone.colorEq ?? {};
      edit.tone.colorEq[band] = { hue: 0, saturation: 0, lightness: 0, ...(edit.tone.colorEq[band] ?? {}), [key]: v };
    };
    return h('div', chips,
      sliderRow(t('edit.eqHue'), -180, 180, 1, () => get('hue'), set('hue'), (v) => `${v}°`, 'colorEq.hue'),
      sliderRow(t('edit.saturation'), -100, 100, 1, () => get('saturation'), set('saturation'), undefined, 'colorEq.saturation'),
      sliderRow(t('edit.eqLightness'), -100, 100, 1, () => get('lightness'), set('lightness'), undefined, 'colorEq.lightness'),
      resetButton(t('edit.colorEq'), (e) => { e.tone.colorEq = null; }));
  }

  function lightEqPanel() {
    const names = [t('edit.eqBlacks'), '', t('edit.eqShadows'), '', t('edit.eqMidtones'), '', t('edit.eqHighlights'), '', t('edit.eqWhites')];
    return h('div', Array.from({ length: 9 }, (_, i) => sliderRow(`${i + 1}${names[i] ? ` · ${names[i]}` : ''}`, -100, 100, 1, () => edit.tone.lightEq?.[i] ?? 0, (v) => { edit.tone.lightEq = edit.tone.lightEq ?? new Array(9).fill(0); edit.tone.lightEq[i] = v; }, undefined, `lightEq.${i}`)),
      resetButton(t('edit.lightEq'), (e) => { e.tone.lightEq = null; }));
  }

  function splitTonePanel() {
    const get = (key, d = 0) => edit.tone.splitTone?.[key] ?? d;
    const set = (key) => (v) => { edit.tone.splitTone = { highlightHue: 45, highlightSat: 0, shadowHue: 220, shadowSat: 0, balance: 0, ...(edit.tone.splitTone ?? {}), [key]: v }; };
    return h('div',
      sliderRow(t('edit.stHighlightHue'), 0, 360, 1, () => get('highlightHue', 45), set('highlightHue'), (v) => `${v}°`, 'splitTone.highlightHue'),
      sliderRow(t('edit.stHighlightSat'), 0, 100, 1, () => get('highlightSat'), set('highlightSat'), undefined, 'splitTone.highlightSat'),
      sliderRow(t('edit.stShadowHue'), 0, 360, 1, () => get('shadowHue', 220), set('shadowHue'), (v) => `${v}°`, 'splitTone.shadowHue'),
      sliderRow(t('edit.stShadowSat'), 0, 100, 1, () => get('shadowSat'), set('shadowSat'), undefined, 'splitTone.shadowSat'),
      sliderRow(t('edit.stBalance'), -100, 100, 1, () => get('balance'), set('balance'), undefined, 'splitTone.balance'));
  }

  function levelsPanel() {
    const levels = edit.adjust.levels ?? { black: 0, white: 255, gamma: 1 };
    const set = (key) => (v) => { edit.adjust.levels = { black: 0, white: 255, gamma: 1, ...(edit.adjust.levels ?? {}), [key]: v }; };
    return h('div',
      h('button.btn.small', { type: 'button', onclick: () => { change((e) => { e.adjust.levels = autoLevels(context2d(preview, { willReadFrequently: true }).getImageData(0, 0, preview.width, preview.height)); }, t('edit.autoLevels')); buildPanel(); } }, h('span', { html: icon('wand') }), t('edit.autoLevels')),
      sliderRow(t('edit.levelBlack'), 0, 250, 1, () => levels.black, set('black'), undefined, 'levels.black'),
      sliderRow(t('edit.levelGamma'), 0.2, 3, 0.01, () => levels.gamma, set('gamma'), undefined, 'levels.gamma'),
      sliderRow(t('edit.levelWhite'), 5, 255, 1, () => levels.white, set('white'), undefined, 'levels.white'),
      resetButton(t('edit.levels'), (e) => { e.adjust.levels = null; }));
  }

  function curvesPanel() {
    let channel = 'rgb';
    const size = 220;
    const canvas = h('canvas.curve-canvas', { width: size, height: size });
    const pointsOf = () => edit.adjust.curves?.[channel] ?? [[0, 0], [255, 255]];
    const paint = () => {
      const c = canvas.getContext('2d');
      c.clearRect(0, 0, size, size);
      c.strokeStyle = 'rgba(128,128,128,0.35)';
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo((i * size) / 4, 0); c.lineTo((i * size) / 4, size); c.moveTo(0, (i * size) / 4); c.lineTo(size, (i * size) / 4); c.stroke(); }
      const pts = [...pointsOf()].sort((a, b) => a[0] - b[0]);
      const table = curveTable(pts);
      c.strokeStyle = { rgb: '#ddd', r: '#e55', g: '#4c4', b: '#58f' }[channel];
      c.lineWidth = 2;
      c.beginPath();
      for (let x = 0; x < 256; x++) { const px = (x / 255) * size; const py = size - (table[x] / 255) * size; if (x) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
      c.fillStyle = '#fff';
      for (const [x, y] of pts) { c.beginPath(); c.arc((x / 255) * size, size - (y / 255) * size, 4, 0, Math.PI * 2); c.fill(); }
    };
    const setPoints = (pts) => { edit.adjust.curves = { ...(edit.adjust.curves ?? {}), [channel]: pts }; draw(); paint(); };
    canvas.addEventListener('pointerdown', (event) => {
      const rect = canvas.getBoundingClientRect();
      const toValue = (e) => [Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 255), Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)) * 255)];
      const [vx, vy] = toValue(event);
      commit(t('edit.curves'));
      const pts = pointsOf().map((p) => [...p]);
      let index = pts.findIndex(([x, y]) => Math.abs(x - vx) < 10 && Math.abs(y - vy) < 14);
      if (index < 0) { pts.push([vx, vy]); index = pts.length - 1; }
      if (event.detail === 2) {
        if (pts.length > 2 && pts[index][0] !== 0 && pts[index][0] !== 255) pts.splice(index, 1);
        setPoints(pts);
        return;
      }
      setPoints(pts);
      canvas.setPointerCapture(event.pointerId);
      const move = (e) => {
        const [x, y] = toValue(e);
        const next = pointsOf().map((p) => [...p]);
        const isEnd = next[index][0] === 0 || next[index][0] === 255;
        next[index] = [isEnd ? next[index][0] : Math.max(1, Math.min(254, x)), y];
        setPoints(next);
      };
      const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
    });
    const channels = h('div.chip-row', ['rgb', 'r', 'g', 'b'].map((c) => {
      const b = h(`button.chip${c === channel ? '.on' : ''}`, { type: 'button' }, c.toUpperCase());
      b.addEventListener('click', () => { channel = c; for (const x of channels.children) x.classList.toggle('on', x === b); paint(); });
      return b;
    }));
    paint();
    return h('div', channels, canvas, h('div.hint', t('edit.curveHint')), resetButton(t('edit.curves'), (e) => { e.adjust.curves = null; }));
  }

  function detailPanel() {
    return h('div',
      slider('detail', 'sharpen', t('edit.sharpen'), 0, 200),
      slider('detail', 'sharpenRadius', t('edit.sharpenRadius'), 0.5, 4, 0.1, (v) => Number(v).toFixed(1)),
      slider('detail', 'clarity', t('edit.clarity'), 0, 100),
      slider('detail', 'denoise', t('edit.denoise'), 0, 100),
      slider('detail', 'blur', t('edit.blur'), 0, 50));
  }

  function lensPanel() {
    return h('div',
      slider('lens', 'distortion', t('edit.distortion'), -100, 100),
      slider('lens', 'chromatic', t('edit.chromatic'), -100, 100),
      slider('lens', 'vignette', t('edit.lensVignette'), -100, 100),
      h('div.field-label', t('edit.perspective')),
      slider('lens', 'vertical', t('edit.keystoneV'), -100, 100),
      slider('lens', 'horizontal', t('edit.keystoneH'), -100, 100),
      slider('lens', 'rotate', t('edit.perspectiveRotate'), -20, 20, 0.1, (v) => `${Number(v).toFixed(1)}°`));
  }

  function geometryPanel() {
    const g = edit.geometry;
    const out = layout(full.width, full.height, { ...g, resize: null });
    const resizeW = h('input.input', { type: 'number', min: 1, max: 30000, value: g.resize?.width ?? out.width, dataset: { key: 'resize.width' } });
    const resizeH = h('input.input', { type: 'number', min: 1, max: 30000, value: g.resize?.height ?? out.height, dataset: { key: 'resize.height' } });
    const lock = h('input', { type: 'checkbox', checked: true });
    resizeW.addEventListener('input', () => { if (lock.checked) resizeH.value = Math.max(1, Math.round((Number(resizeW.value) * out.height) / out.width)); });
    resizeH.addEventListener('input', () => { if (lock.checked) resizeW.value = Math.max(1, Math.round((Number(resizeH.value) * out.width) / out.height)); });
    const final = layout(full.width, full.height, g);
    const canvasW = h('input.input', { type: 'number', min: 0, max: 40000, value: edit.canvas.width || final.width, dataset: { key: 'canvas.width' } });
    const canvasH = h('input.input', { type: 'number', min: 0, max: 40000, value: edit.canvas.height || final.height, dataset: { key: 'canvas.height' } });
    const canvasColor = colorSwatches(edit.canvas.color, { key: 'canvas-color' });
    const anchor = selectEl(ANCHORS.map((a) => [a, t(`anchor.${a}`)]), edit.canvas.anchor);
    const cropUi = tool === 'crop'
      ? h('div.crop-tools',
        h('div.chip-row', ASPECTS.map(([label, value]) => h(`button.chip${cropAspect === value ? '.on' : ''}`, { type: 'button', onclick: () => { setAspect(value); buildPanel(); } }, label === 'free' ? t('edit.aspectFree') : label === 'original' ? t('edit.aspectOriginal') : label))),
        h('div.row-buttons', h('button.btn.primary.small', { type: 'button', onclick: applyCrop, id: 'crop-apply' }, t('edit.applyCrop')), h('button.btn.small', { type: 'button', onclick: cancelTool }, t('common.cancel'))))
      : h('div.row-buttons',
        h('button.btn.small', { type: 'button', onclick: startCrop, id: 'crop-start' }, h('span', { html: icon('crop') }), t('edit.crop')),
        g.crop ? h('button.btn.small', { type: 'button', onclick: () => { change((e) => { e.geometry.crop = null; }, t('edit.crop')); buildPanel(); } }, t('edit.clearCrop')) : '');
    return h('div',
      h('div.row-buttons',
        button('rotateLeft', t('view.rotateLeft'), () => { change((e) => { e.geometry.rotate = (e.geometry.rotate + 270) % 360; e.geometry.crop = null; }, t('view.rotateLeft')); buildPanel(); }),
        button('rotateRight', t('view.rotateRight'), () => { change((e) => { e.geometry.rotate = (e.geometry.rotate + 90) % 360; e.geometry.crop = null; }, t('view.rotateRight')); buildPanel(); }),
        button('flipH', t('edit.flipH'), () => change((e) => { e.geometry.flipH = !e.geometry.flipH; }, t('edit.flipH'))),
        button('flipV', t('edit.flipV'), () => change((e) => { e.geometry.flipV = !e.geometry.flipV; }, t('edit.flipV')))),
      slider('geometry', 'straighten', t('edit.straighten'), -45, 45, 0.1, (v) => `${Number(v).toFixed(1)}°`),
      h('div.row-buttons', toolButton('line', t('edit.straightenLine'), 'straighten')),
      tool === 'line' ? h('div.hint', t('edit.straightenLineHint')) : '',
      cropUi,
      h('div.field-label', t('edit.resize')),
      h('div.field-row', field(t('edit.width'), resizeW), field(t('edit.height'), resizeH)),
      h('label.check', lock, t('edit.keepRatio')),
      h('div.row-buttons',
        h('button.btn.small', { type: 'button', id: 'resize-apply', onclick: () => { change((e) => { e.geometry.resize = { width: Number(resizeW.value), height: Number(resizeH.value) }; }, t('edit.resize')); } }, t('edit.applyResize')),
        g.resize ? h('button.btn.small', { type: 'button', onclick: () => { change((e) => { e.geometry.resize = null; }, t('edit.resize')); buildPanel(); } }, t('edit.clearResize')) : ''),
      h('div.field-label', t('edit.canvasSize')),
      h('div.field-row', field(t('edit.width'), canvasW), field(t('edit.height'), canvasH)),
      h('div.field-row', field(t('edit.anchor'), anchor), field(t('edit.canvasColor'), canvasColor)),
      h('div.row-buttons',
        h('button.btn.small', { type: 'button', id: 'canvas-apply', onclick: () => { change((e) => { e.canvas = { width: Number(canvasW.value), height: Number(canvasH.value), color: canvasColor.value, anchor: anchor.value }; }, t('edit.canvasSize')); buildPanel(); } }, t('edit.applyCanvas')),
        edit.canvas.width || edit.canvas.height ? resetButton(t('edit.canvasSize'), (e) => { e.canvas = { width: 0, height: 0, color: '#ffffff', anchor: 'center' }; }) : ''));
  }

  function localPanel() {
    const rows = edit.local.map((local, i) => {
      const row = h(`div.cat-row${i === selectedLocal ? '.active' : ''}`, { role: 'button', dataset: { local: String(i) } }, h('span.cat-icon', { html: icon(local.kind === 'brush' ? 'pencil' : local.kind === 'radial' ? 'circle' : 'contrast') }), h('span.cat-label', `${t(`edit.local.${local.kind}`)} ${i + 1}`),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: (e) => { e.stopPropagation(); change((ed) => { ed.local.splice(i, 1); }, t('edit.local')); selectedLocal = -1; buildPanel(); } }));
      row.addEventListener('click', () => { selectedLocal = i; tool = local.kind; buildPanel(); draw(); });
      return row;
    });
    const selected = edit.local[selectedLocal];
    const adjustRow = (key, label, min, max, stepValue = 1, format) => sliderRow(label, min, max, stepValue, () => selected.adjust?.[key] ?? 0, (v) => { selected.adjust = { ...(selected.adjust ?? {}), [key]: v }; }, format, `local.${key}`);
    const detailRow = (key, label, min, max) => sliderRow(label, min, max, 1, () => selected.detail?.[key] ?? 0, (v) => { selected.detail = { ...(selected.detail ?? {}), [key]: v }; }, undefined, `local.${key}`);
    return h('div',
      h('div.row-buttons', toolButton('gradient', t('edit.local.gradient'), 'contrast'), toolButton('radial', t('edit.local.radial'), 'circle'), toolButton('brush', t('edit.local.brush'), 'pencil')),
      h('div.hint', tool && ['gradient', 'radial', 'brush'].includes(tool) ? t(`edit.local.${tool}Hint`) : t('edit.local.hint')),
      tool === 'brush' ? h('div',
        sliderRow(t('edit.brushSize'), 4, 300, 1, () => brush.size, (v) => { brush.size = v; }),
        sliderRow(t('edit.hardness'), 0, 100, 1, () => brush.hardness * 100, (v) => { brush.hardness = v / 100; }),
        h('label.check', h('input', { type: 'checkbox', checked: brush.erase, onchange: (e) => { brush.erase = e.target.checked; } }), t('edit.erase'))) : '',
      ...rows,
      selected ? h('div.local-settings',
        adjustRow('exposure', t('edit.exposure'), -3, 3, 0.05, (v) => `${Number(v).toFixed(2)} EV`),
        adjustRow('contrast', t('edit.contrast'), -100, 100),
        adjustRow('highlights', t('edit.highlights'), -100, 100),
        adjustRow('shadows', t('edit.shadows'), -100, 100),
        adjustRow('saturation', t('edit.saturation'), -100, 100),
        adjustRow('temperature', t('edit.temperature'), -100, 100),
        detailRow('sharpen', t('edit.sharpen'), 0, 200),
        detailRow('blur', t('edit.blur'), 0, 50),
        selected.kind === 'radial' ? h('label.check', h('input', { type: 'checkbox', checked: Boolean(selected.shape.invert), onchange: (e) => change(() => { selected.shape.invert = e.target.checked; }, t('edit.local')) }), t('edit.invertMask')) : '') : '');
  }

  function repairPanel() {
    return h('div',
      h('div.row-buttons', toolButton('redeye', t('edit.redeye'), 'redeye'), toolButton('heal', t('edit.heal'), 'bandage'), toolButton('clone', t('edit.clone'), 'copy')),
      sliderRow(t('edit.brushSize'), 4, 200, 1, () => brush.size, (v) => { brush.size = v; }),
      h('div.hint', tool ? t(`edit.${tool}Hint`) : t('edit.repairHint')),
      edit.spots.length ? h('div.row-buttons',
        h('button.btn.small', { type: 'button', onclick: () => { change((e) => { e.spots.pop(); }, t('edit.repair')); } }, t('edit.undoSpot')),
        resetButton(t('edit.repair'), (e) => { e.spots = []; })) : '',
      slider('tone', 'skin', t('edit.skin'), 0, 100));
  }

  function effectsPanel() {
    const basic = ['none', 'grayscale', 'sepia', 'invert', 'posterize', 'solarize', 'threshold', 'cool', 'warm', 'vintage'];
    const select = selectEl(basic.map((e) => [e, t(`effect.${e}`)]), edit.adjust.effect, (value) => { change((e) => { e.adjust.effect = value; }, t('edit.effect')); });
    const check = (key, label) => h('label.check', h('input', { type: 'checkbox', checked: Boolean(edit.fx[key]), onchange: (ev) => change((e) => { e.fx[key] = ev.target.checked; }, label) }), label);
    const add = selectEl([['', t('edit.addEffect')], ...Object.keys(EFFECTS).map((id) => [id, t(`fx.${id}`)])], '', (id) => {
      if (!id) return;
      change((e) => { e.effects.push({ id, params: effectParams(id) }); }, t(`fx.${id}`));
      buildPanel();
    });
    add.dataset.key = 'add-effect';
    const stack = edit.effects.map((effect, i) => h('div.effect-card', { dataset: { effect: effect.id } },
      h('div.effect-head', h('span', t(`fx.${effect.id}`)),
        h('button.tool.small', { type: 'button', title: t('edit.resetEffect'), dataset: { resetEffect: String(i) }, html: icon('undo'), onclick: () => { change((e) => { e.effects[i].params = effectParams(effect.id); }, t(`fx.${effect.id}`)); buildPanel(); } }),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: () => { change((e) => { e.effects.splice(i, 1); }, t(`fx.${effect.id}`)); buildPanel(); } })),
      Object.entries(EFFECTS[effect.id]?.params ?? {}).filter(([, spec]) => typeof spec.min === 'number').map(([key, spec]) => sliderRow(t(`fxParam.${key}`), spec.min, spec.max, spec.max - spec.min <= 2 ? 0.01 : 1, () => effect.params?.[key] ?? spec.default, (v) => { effect.params = { ...(effect.params ?? {}), [key]: v }; }))));
    const tilt = edit.tilt;
    return h('div',
      field(t('edit.effect'), select),
      slider('adjust', 'effectAmount', t('edit.effectAmount'), 0, 100),
      slider('fx', 'vignette', t('edit.vignette'), -100, 100),
      slider('fx', 'vignetteMidpoint', t('edit.vignetteMidpoint'), 0, 100),
      slider('fx', 'grain', t('edit.grain'), 0, 100),
      slider('fx', 'pixelate', t('edit.pixelate'), 0, 100),
      check('emboss', t('edit.emboss')), check('edges', t('edit.edges')),
      h('div.field-label', t('edit.specialEffects')), add, ...stack,
      h('label.check', h('input', { type: 'checkbox', checked: Boolean(tilt), dataset: { key: 'tilt' }, onchange: (e) => { change((ed) => { ed.tilt = e.target.checked ? { position: 0.5, width: 0.2, blur: 50, angle: 0, feather: 0.25 } : null; }, t('edit.tiltShift')); buildPanel(); } }), t('edit.tiltShift')),
      tilt ? h('div',
        sliderRow(t('edit.tiltPosition'), 0, 1, 0.01, () => tilt.position, (v) => { tilt.position = v; }),
        sliderRow(t('edit.tiltWidth'), 0.02, 1, 0.01, () => tilt.width, (v) => { tilt.width = v; }),
        sliderRow(t('edit.blur'), 0, 100, 1, () => tilt.blur, (v) => { tilt.blur = v; }),
        sliderRow(t('edit.tiltAngle'), -90, 90, 1, () => tilt.angle, (v) => { tilt.angle = v; }, (v) => `${v}°`)) : '');
  }

  function drawPanel() {
    const types = ['line', 'arrow', 'rect', 'ellipse', 'free'];
    const color = colorSwatches(drawStyle.color, { key: 'draw-color' });
    color.addEventListener('input', () => { drawStyle.color = color.value; });
    return h('div',
      h('div.chip-row', types.map((type) => h(`button.chip${drawStyle.type === type ? '.on' : ''}`, { type: 'button', dataset: { shape: type }, onclick: () => { drawStyle.type = type; tool = 'draw'; buildPanel(); draw(); } }, t(`edit.shape.${type}`)))),
      h('div.row-buttons', toolButton('draw', t('edit.drawOn'), 'pencil')),
      field(t('edit.textColor'), color),
      sliderRow(t('edit.lineWidth'), 0.1, 5, 0.1, () => drawStyle.width, (v) => { drawStyle.width = v; }),
      h('label.check', h('input', { type: 'checkbox', checked: drawStyle.fill, onchange: (e) => { drawStyle.fill = e.target.checked; } }), t('edit.fill')),
      edit.drawings.length ? h('div.row-buttons',
        h('button.btn.small', { type: 'button', onclick: () => change((e) => { e.drawings.pop(); }, t('edit.draw')) }, t('edit.removeLast')),
        resetButton(t('edit.draw'), (e) => { e.drawings = []; })) : '');
  }

  function addPanel() {
    const texts = edit.overlay.texts;
    const current = texts[texts.length - 1];
    const box = h('div');
    box.append(h('div.row-buttons',
      h('button.btn.small', { type: 'button', id: 'add-text', onclick: () => { change((e) => { e.overlay.texts.push({ text: t('edit.sampleText'), x: 0.5, y: 0.88, size: 6, color: '#ffffff', font: 'sans-serif', bold: true, italic: false, opacity: 90, shadow: true, align: 'center' }); }, t('edit.addText')); tool = 'text'; buildPanel(); } }, h('span', { html: icon('plus') }), t('edit.addText')),
      current ? h('button.btn.small', { type: 'button', onclick: () => { change((e) => { e.overlay.texts.pop(); }, t('edit.removeText')); buildPanel(); } }, t('edit.removeText')) : ''));
    if (current) {
      const textArea = h('textarea.input', { rows: 2, dataset: { key: 'text' } });
      textArea.value = current.text;
      let committed = false;
      textArea.addEventListener('input', () => { if (!committed) { commit(t('edit.text')); committed = true; } current.text = textArea.value; draw(); });
      const color = colorSwatches(current.color, { key: 'text-color' });
      color.addEventListener('input', () => { current.color = color.value; draw(); });
      color.addEventListener('change', () => commit(t('edit.text')));
      const font = selectEl([['sans-serif', 'Sans-serif'], ['serif', 'Serif'], ['monospace', 'Monospace'], ['cursive', 'Script']], current.font, (v) => change((e) => { e.overlay.texts[texts.length - 1].font = v; }, t('edit.text')));
      const flag = (key, label) => h('label.check', h('input', { type: 'checkbox', checked: Boolean(current[key]), onchange: (ev) => change((e) => { e.overlay.texts[texts.length - 1][key] = ev.target.checked; }, t('edit.text')) }), label);
      box.append(field(t('edit.text'), textArea), h('div.field-row', field(t('edit.textColor'), color), field(t('edit.font'), font)),
        sliderRow(t('edit.textSize'), 1, 30, 1, () => current.size, (v) => { current.size = v; }),
        sliderRow(t('edit.opacity'), 5, 100, 1, () => current.opacity, (v) => { current.opacity = v; }),
        flag('bold', t('edit.bold')), flag('italic', t('edit.italic')), flag('shadow', t('edit.shadow')),
        h('div.hint', t('edit.textHint')));
      tool = 'text';
    }
    const borderColor = colorSwatches(edit.overlay.borderColor, { key: 'border-color' });
    borderColor.addEventListener('change', () => change((e) => { e.overlay.borderColor = borderColor.value; }, t('edit.border')));
    box.append(slider('overlay', 'border', t('edit.border'), 0, 20, 0.5, (v) => `${v}%`), field(t('edit.borderColor'), borderColor));
    return box;
  }

  async function loadLayerImage(path) {
    if (layerImages.has(path)) return;
    const decoded = await decodeImage(await fs.read(path), path.split(/[\\/]/).pop(), { maxSize: 4000 });
    const canvas = document.createElement('canvas');
    canvas.width = decoded.source.width;
    canvas.height = decoded.source.height;
    canvas.getContext('2d').drawImage(decoded.source, 0, 0);
    layerImages.set(path, canvas);
  }

  /** Adds `path` as an image layer (the E2E tests call this directly). */
  async function addLayerPath(path) {
    await loadLayerImage(path);
    change((e) => { e.layers.push({ path, name: path.split(/[\\/]/).pop(), mode: 'normal', opacity: 100, x: 0.5, y: 0.5, scale: 0.4, visible: true }); }, t('edit.addLayer'));
    selectedLayer = edit.layers.length - 1;
    buildPanel();
  }

  async function addLayer() {
    let paths = [];
    if (isDesktop()) paths = await chooseFiles([{ name: t('file.mediaFiles'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'psd'] }], parentOf(item.path));
    else {
      const list = app.state.list.filter((i) => !i.isDir && i.path !== item.path);
      const select = selectEl(list.map((i) => [i.path, i.name]), list[0]?.path);
      const ok = await openDialog({ title: t('edit.addLayer'), body: field(t('edit.layerImage'), select), buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.ok'), value: true, primary: true }] });
      if (ok && select.value) paths = [select.value];
    }
    for (const path of paths) await addLayerPath(path).catch((error) => toast(errorText(error), 'error'));
  }

  function layersPanel() {
    const rows = edit.layers.map((layer, i) => {
      const row = h(`div.cat-row${i === selectedLayer ? '.active' : ''}`, { role: 'button' },
        h('input', { type: 'checkbox', checked: layer.visible !== false, title: t('edit.visible'), onclick: (e) => e.stopPropagation(), onchange: (e) => change(() => { layer.visible = e.target.checked; }, t('edit.layers')) }),
        h('span.cat-label', layer.name),
        h('button.tool.small', { type: 'button', title: t('edit.layerUp'), html: icon('up'), disabled: i === edit.layers.length - 1, onclick: (e) => { e.stopPropagation(); change((ed) => { [ed.layers[i], ed.layers[i + 1]] = [ed.layers[i + 1], ed.layers[i]]; }, t('edit.layers')); selectedLayer = i + 1; buildPanel(); } }),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: (e) => { e.stopPropagation(); change((ed) => { ed.layers.splice(i, 1); }, t('edit.layers')); selectedLayer = -1; buildPanel(); } }));
      row.addEventListener('click', () => { selectedLayer = i; tool = 'layer'; buildPanel(); });
      return row;
    });
    const layer = edit.layers[selectedLayer];
    return h('div',
      h('div.row-buttons', h('button.btn.small', { type: 'button', id: 'add-layer', onclick: addLayer }, h('span', { html: icon('plus') }), t('edit.addLayer')), edit.layers.length ? toolButton('layer', t('edit.moveLayer'), 'move') : ''),
      h('div.hint', t('edit.layersHint')),
      ...rows,
      layer ? h('div.local-settings',
        field(t('edit.blendMode'), selectEl(BLEND_MODES.map((m) => [m, t(`blend.${m}`)]), layer.mode, (v) => change(() => { layer.mode = v; }, t('edit.blendMode')))),
        sliderRow(t('edit.opacity'), 0, 100, 1, () => layer.opacity, (v) => { layer.opacity = v; }),
        sliderRow(t('edit.layerSize'), 0.02, 2, 0.01, () => layer.scale, (v) => { layer.scale = v; }, (v) => `${Math.round(v * 100)}%`)) : '');
  }

  function presetsPanel() {
    const list = app.catalog.presets;
    return h('div',
      h('div.row-buttons',
        h('button.btn.small', { type: 'button', id: 'preset-save', onclick: async () => {
          const name = await promptDialog(t('edit.presetName'), '', { title: t('edit.savePreset') });
          if (name?.trim()) { app.catalog.savePreset(name.trim(), presetOf(edit)); saveCatalogSoon(); buildPanel(); }
        } }, t('edit.savePreset')),
        h('button.btn.small', { type: 'button', onclick: () => { editClipboard.preset = presetOf(edit); toast(t('edit.settingsCopied'), 'info'); buildPanel(); } }, t('edit.copySettings')),
        h('button.btn.small', { type: 'button', disabled: !editClipboard.preset, onclick: () => { change((e) => Object.assign(e, applyPreset(e, editClipboard.preset)), t('edit.pasteSettings')); buildPanel(); } }, t('edit.pasteSettings'))),
      list.length ? '' : h('div.cat-empty', t('edit.noPresets')),
      ...list.map((preset) => h('div.cat-row', { role: 'button', dataset: { preset: preset.name }, onclick: () => { change((e) => Object.assign(e, applyPreset(e, preset.edit)), preset.name); buildPanel(); } },
        h('span.cat-icon', { html: icon('bookmark') }), h('span.cat-label', preset.name),
        h('button.tool.small', { type: 'button', title: t('common.delete'), html: icon('close'), onclick: (e) => { e.stopPropagation(); app.catalog.deletePreset(preset.name); saveCatalogSoon(); buildPanel(); } }))));
  }

  function historyPanel() {
    const rows = [h('div.cat-row', { role: 'button', dataset: { history: '0' }, onclick: () => goToHistory(0) }, h('span.cat-icon', { html: icon('image') }), h('span.cat-label', t('edit.historyOpen')))];
    undo.forEach((entry, i) => rows.push(h(`div.cat-row${i === undo.length - 1 ? '.active' : ''}`, { role: 'button', dataset: { history: String(i + 1) }, onclick: () => goToHistory(i + 1) }, h('span.cat-count', String(i + 1)), h('span.cat-label', entry.label))));
    return h('div', h('div.hint', t('edit.historyHint')), ...rows);
  }

  function autoFix() {
    change((e) => {
      e.adjust.levels = autoLevels(context2d(preview, { willReadFrequently: true }).getImageData(0, 0, preview.width, preview.height));
      e.adjust.vibrance = Math.max(e.adjust.vibrance, 15);
      e.adjust.contrast = Math.max(e.adjust.contrast, 8);
    }, t('edit.auto'));
    buildPanel();
  }

  // ───────── toolbar

  function updateBar() {
    clear(bar);
    const dirty = !isEmptyEdit(edit) || fromOriginal;
    bar.append(
      h('div.tool-group',
        h('button.btn.primary', { type: 'button', id: 'edit-save', disabled: !dirty || busy, onclick: () => save(false) }, h('span', { html: icon('save') }), t('edit.save')),
        h('button.btn', { type: 'button', id: 'edit-save-as', disabled: busy, onclick: () => save(true) }, t('edit.saveAs')),
        h('button.btn', { type: 'button', id: 'edit-cancel', onclick: cancel }, t('edit.done'))),
      h('div.tool-group',
        button('undo', t('edit.undo'), doUndo, { title: `${t('edit.undo')} (Ctrl+Z)`, disabled: !undo.length }),
        button('redo', t('edit.redo'), doRedo, { title: `${t('edit.redo')} (Ctrl+Y)`, disabled: !redo.length })),
      h('div.tool-group',
        h(`button.btn${before ? '.on' : ''}`, { type: 'button', id: 'edit-before', title: `${t('edit.beforeAfter')} (B)`, onclick: () => { before = !before; updateBar(); draw(); } }, t('edit.beforeAfter')),
        h('button.btn', { type: 'button', disabled: isEmptyEdit(edit), onclick: resetAll }, t('edit.resetAll'))),
      h('div.tool-spacer'),
      busy ? h('span.busy', t('edit.saving')) : '');
  }

  function resetAll() {
    commit(t('edit.resetAll'));
    edit = defaultEdit();
    tool = null;
    buildPanel();
    draw();
    updateBar();
  }

  async function cancel() {
    if (!isEmptyEdit(edit) && undo.length && !(await confirmDialog(t('edit.discard'), { ok: t('edit.discardOk'), danger: true }))) return;
    close();
  }

  function close() {
    item = null;
    full = null;
    preview = null;
    shown = null;
    layerImages.clear();
    clear(canvasHolder);
    onDone?.();
  }

  // ───────── save

  async function save(asNew) {
    if (busy) return;
    const ext = extensionOf(item.name);
    let target = item.path;
    let format = outputFormatFor(item.name)?.id ?? 'jpeg';
    let quality = app.settings.jpegQuality / 100;
    const inPlace = !asNew && canWriteBack(item.name) && fs.caps.write && !fs.isReadOnly?.(item.path);
    if (!inPlace) {
      const choice = await saveAsDialog(rawMode ? 'jpeg' : format);
      if (!choice) return;
      ({ format, quality } = choice);
      const spec = OUTPUT_FORMATS.find((f) => f.id === format);
      const suggested = `${stemOf(item.name)}${asNew ? '_edited' : ''}.${spec.ext}`;
      if (isDesktop() && !fs.isReadOnly?.(item.path)) {
        target = await chooseSavePath(joinPath(parentOf(item.path), suggested), [{ name: spec.label, extensions: [spec.ext] }]);
        if (!target) return;
      } else {
        target = joinPath(parentOf(item.path), choice.name || suggested);
      }
    }
    busy = true;
    updateBar();
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const output = render(full, edit, { scale: 1, layerImages });
      const sourceIsJpeg = ['jpg', 'jpeg', 'jpe', 'jfif'].includes(ext);
      const bytes = await encodeCanvas(output, format, { quality, original: sourceIsJpeg ? original : null });
      let backedUp = false;
      if (target === item.path && fs.caps.originals) { await fs.backupOriginal(item.path); backedUp = true; }
      const how = await fs.write(target, bytes);
      thumbs.invalidate(target);
      fs.releaseUrl?.(target);
      if (target !== item.path) app.catalog.copyPath(item.path, target);
      app.catalog.markEdited(target, true);
      if (backedUp) app.catalog.setEditState(target, edit);
      saveCatalogSoon();
      toast(how === 'downloaded' ? t('edit.downloaded') : t('edit.saved', { name: target.split(/[\\/]/).pop() }), 'success');
      busy = false;
      close();
      await reload();
      app.emit('edited', target);
    } catch (error) {
      busy = false;
      updateBar();
      toast(t('edit.saveFailed', { error: errorText(error) }), 'error', 7000);
    }
  }

  async function saveAsDialog(defaultFormat) {
    const format = selectEl(OUTPUT_FORMATS.map((f) => [f.id, f.label]), defaultFormat);
    const quality = h('input.slider', { type: 'range', min: 10, max: 100, value: app.settings.jpegQuality });
    const qualityValue = h('span.slider-value', String(app.settings.jpegQuality));
    quality.addEventListener('input', () => { qualityValue.textContent = quality.value; });
    const name = h('input.input', { type: 'text', value: `${stemOf(item.name)}_edited` });
    const body = h('div', field(t('edit.format'), format), h('div.slider-row', h('div.slider-head', h('span', t('edit.quality')), qualityValue), quality), isDesktop() ? '' : field(t('edit.fileName'), name));
    const ok = await openDialog({ title: t('edit.saveAs'), body, buttons: [{ label: t('common.cancel'), value: false }, { label: t('edit.save'), value: true, primary: true }] });
    if (!ok) return null;
    const spec = OUTPUT_FORMATS.find((f) => f.id === format.value);
    return { format: format.value, quality: Number(quality.value) / 100, name: `${name.value.trim() || stemOf(item.name)}.${spec.ext}` };
  }

  // ───────── open

  async function loadSource(bytes, name) {
    if (isRaw(name) && rawMode) {
      try {
        const { developRaw } = await import('../formats/rawdevelop.js');
        return (await developRaw(bytes, { whiteBalance: rawMode })).source;
      } catch (error) {
        toast(t('edit.rawFallback', { error: errorText(error) }), 'info', 6000);
        rawMode = null;
      }
    }
    return (await decodeImage(bytes, name)).source;
  }

  async function redevelop(mode) {
    rawMode = mode;
    canvasHolder.append(h('div.viewer-spinner', t('edit.developing')));
    full = await loadSource(original, item.name);
    preview = scaledCanvas(full, full.width, full.height, PREVIEW_MAX);
    scale = preview.width / full.width;
    draw();
  }

  async function open(target) {
    item = target;
    edit = defaultEdit();
    undo = [];
    redo = [];
    tool = null;
    before = false;
    section = 'light';
    selectedLocal = -1;
    selectedLayer = -1;
    fromOriginal = false;
    layerImages.clear();
    clear(canvasHolder);
    canvasHolder.append(h('div.viewer-spinner', isRaw(item.name) ? t('edit.developing') : t('list.loading')));
    updateBar();
    clear(panel);
    try {
      const record = app.catalog.get(item.path);
      original = await fs.read(item.path);
      // Re-edit from the kept original with the saved settings.
      const originalPath = record?.editState ? await Promise.resolve(fs.originalPath?.(item.path)).catch(() => null) : null;
      if (originalPath && (await confirmDialog(t('edit.reopenAsk'), { ok: t('edit.reopenYes'), cancel: t('edit.reopenNo') }))) {
        original = await fs.read(originalPath);
        edit = normalizeEdit(record.editState);
        fromOriginal = true;
        for (const layer of edit.layers) await loadLayerImage(layer.path).catch(() => {});
      }
      rawMode = isRaw(item.name) ? 'camera' : null;
      full = await loadSource(original, item.name);
      preview = scaledCanvas(full, full.width, full.height, PREVIEW_MAX);
      scale = preview.width / full.width;
      buildPanel();
      updateBar();
      draw();
    } catch (error) {
      clear(canvasHolder);
      canvasHolder.append(h('div.viewer-error', h('span', { html: icon('warning') }), t('edit.cannotOpen', { error: errorText(error) })));
    }
  }

  function onKey(event) {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (ctrl && event.shiftKey && key === 'c') { editClipboard.preset = presetOf(edit); toast(t('edit.settingsCopied'), 'info'); return true; }
    if (ctrl && event.shiftKey && key === 'v') { if (editClipboard.preset) { change((e) => Object.assign(e, applyPreset(e, editClipboard.preset)), t('edit.pasteSettings')); buildPanel(); } return true; }
    if (ctrl && key === 'z') { if (event.shiftKey) doRedo(); else doUndo(); return true; }
    if (ctrl && key === 'y') { doRedo(); return true; }
    if (ctrl && key === 's') { save(event.shiftKey); return true; }
    if (event.key === 'Escape') { if (tool) cancelTool(); else cancel(); return true; }
    if (event.key === 'Enter' && tool === 'crop') { applyCrop(); return true; }
    if (!ctrl && key === 'b') { before = !before; updateBar(); draw(); return true; }
    return false;
  }

  new ResizeObserver(() => { fitCanvas(); drawOverlay(); }).observe(canvasHolder);

  return {
    el, open, onKey,
    get dirty() { return !isEmptyEdit(edit) && undo.length > 0; },
    get path() { return item?.path ?? null; },
    /** Test hooks: state and a few direct actions. */
    debug: () => ({ edit, scale, rawMode, fromOriginal, tool, history: undo.map((u) => u.label), preview: preview && { w: preview.width, h: preview.height }, full: full && { w: full.width, h: full.height } }),
    testing: {
      change: (fn, label = 'test') => change(fn, label),
      setSection: (id) => { section = id; buildPanel(); },
      setTool: (id) => setTool(id),
      addLayerPath,
      goToHistory,
      shown: () => shown,
    },
  };
}
