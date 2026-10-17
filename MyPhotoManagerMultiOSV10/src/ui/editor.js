// Edit mode. The photo is decoded once at full size
// (camera RAW files are developed with LibRaw); a smaller copy drives the live
// preview through the same pipeline that renders the saved file.
//
// Edits are a settings object (see pipeline.js): saving in place keeps the
// original aside and remembers the settings, so the photo can be re-edited
// later from the original without losing quality.
import { joinPath, parentOf } from '../catalog/catalog.js';
import { applyAdjustments, autoLevels, curveTable, DEFAULT_ADJUST, histogram } from '../edit/adjust.js';
import { BLEND_MODES, COLOR_BANDS, EFFECTS, effectParams, whiteBalanceFromPixel } from '../edit/advanced.js';
import { alphaBounds, BG_ALGORITHMS, cropToObject, hasNeuralAlpha, isNeuralAlgorithm, neuralKey, normalizeAlgorithm, normalizeBackground, prepareBuiltinRemoval, selectionLine, selectionToPixels } from '../edit/background.js';
import { downloadFailedText, installModel, isInstalled, prepareNeuralMask } from '../edit/bgmodels.js';
import { apply, cropForAspect, invert, layout } from '../edit/geometry.js';
import { applyLook, lookCategories, lookTouches } from '../edit/looks.js';
import { BUILTIN_LUTS, getLut, importLut, prepareEdit } from '../edit/lut.js';
import { applyPreset, DEFAULT_CANVAS, DEFAULT_DETAIL, DEFAULT_FX, DEFAULT_LENS, DEFAULT_OVERLAY, defaultEdit, isEmptyEdit, normalizeEdit, presetOf, render } from '../edit/pipeline.js';
import { saveNamePrefix } from '../edit/savename.js';
import { extractSnip, normalizeSnip, normalizeSnips } from '../edit/snip.js';
import { canvasFromImageData, canvasToBlob, context2d, scaledCanvas } from '../formats/canvas.js';
import { decodeImage } from '../formats/decode.js';
import { encodeCanvas } from '../formats/encode.js';
import { editMetadataField, metadataFieldEditable } from '../formats/exif-edit.js';
import { formatExposure, readMetadata } from '../formats/exif.js';
import { isJpeg } from '../formats/jpeg-meta.js';
import { badgeOf, extensionOf, isRaw, OUTPUT_FORMATS, outputFormatFor, stemOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { chooseFiles, chooseSavePath, errorText, isDesktop } from '../platform/native.js';
import { app, reload, saveCatalogSoon } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatBytes, formatDateTime, formatDims, formatDuration } from '../util/format.js';
import { confirmDialog, field, openDialog, progressDialog, promptDialog, selectEl, toast } from './dialog.js';
import { closeMenus, contextMenu } from './menu.js';
import { colorSwatches } from './colorswatch.js';
import { button, clear, h, rafThrottle, typing } from './dom.js';
import { drawHistogram } from './histogram.js';
import { icon } from './icons.js';
import { commandFor, keyOf, registerCommands } from './keymap.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PREVIEW_MAX = 1800;

/** Freehand outline while the pointer is down: a dashed stroke, not a filled shape. */
function bgLasso(points) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bg-lasso');
  const halo = document.createElementNS(SVG_NS, 'polyline');
  halo.setAttribute('class', 'bg-lasso-halo');
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('class', 'bg-lasso-line');
  svg.append(halo, line);
  const paint = () => {
    const text = points.map((point) => `${point[0]},${point[1]}`).join(' ');
    halo.setAttribute('points', text);
    line.setAttribute('points', text);
  };
  paint();
  return { svg, paint };
}

/** Finished freehand selection: the enclosed area is filled and the outline is closed. */
function bgSelection(points) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bg-lasso');
  const text = points.map((point) => `${point[0]},${point[1]}`).join(' ');
  for (const [name, cls] of [['polygon', 'bg-lasso-fill'], ['polygon', 'bg-lasso-halo'], ['polygon', 'bg-lasso-line']]) {
    const shape = document.createElementNS(SVG_NS, name);
    shape.setAttribute('class', cls);
    shape.setAttribute('points', text);
    svg.append(shape);
  }
  return svg;
}

/** Ellipse or circle marquee. `box` is in overlay pixels. */
function snipEllipse(box) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bg-lasso');
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = Math.max(0, box.w / 2);
  const ry = Math.max(0, box.h / 2);
  for (const cls of ['bg-lasso-fill', 'bg-lasso-halo', 'bg-lasso-line']) {
    const shape = document.createElementNS(SVG_NS, 'ellipse');
    shape.setAttribute('class', cls);
    shape.setAttribute('cx', String(cx));
    shape.setAttribute('cy', String(cy));
    shape.setAttribute('rx', String(rx));
    shape.setAttribute('ry', String(ry));
    svg.append(shape);
  }
  return svg;
}

const ASPECTS = [['free', null], ['original', 'original'], ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:9', 16 / 9], ['5:4', 5 / 4], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16]];
const ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const clone = (value) => JSON.parse(JSON.stringify(value));
/** Tools that work in source-pixel coordinates (the preview is drawn without border/layers/text). */
const SOURCE_TOOLS = ['redeye', 'heal', 'clone', 'erase', 'wbpick', 'gradient', 'radial', 'brush', 'lasso', 'wand', 'color'];
const SNIP_TOOLS = ['sniprect', 'snipellipse', 'snipcircle', 'snipfree'];
/** Older entry points named the rectangle and freehand tools after background removal. */
const SNIP_TOOL_ALIAS = { bgrect: 'sniprect', bgfree: 'snipfree' };
const SELECTION_TOOLS = ['lasso', 'wand', 'color'];
const hueOf = (r, g, b) => { const max = Math.max(r, g, b); const d = max - Math.min(r, g, b); if (!d) return 0; const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return h < 0 ? h + 360 : h; };

/** Edit settings copied with "Copy settings", shared with the batch "Paste settings". */
export const editClipboard = { preset: null };

export function createEditor({ onDone }) {
  const panel = h('div.editor-panel');
  const canvasHolder = h('div.editor-canvas');
  const overlay = h('div.editor-overlay');
  const bar = h('div.editor-toolbar');
  const histCanvas = h('canvas.editor-histogram', { width: 256, height: 80 });
  const wheelsBox = h('div.color-wheels');
  const sideHead = h('div.pane-head');
  const sideBody = h('div.editor-side-body', histCanvas, wheelsBox, panel);
  const side = h('div.editor-side', sideHead, sideBody);
  const infoHead = h('div.pane-head');
  const infoBody = h('div.editor-info-body');
  const infoPane = h('aside.editor-info-pane', infoHead, infoBody);
  const info = h('div.editor-info');
  const stage = h('div.editor-stage', canvasHolder, overlay);
  const el = h('div.editor', bar, h('div.editor-body', side, stage, infoPane), info);

  let item = null;
  let original = null;
  let full = null;
  let fullHigh = null; // 16-bit source: its precise copy (formats/highbit.js)
  let colorProfile = '';
  let infoToken = 0;
  let infoScroll = 0;
  let preview = null;
  let scale = 1;
  let edit = defaultEdit();
  let undo = []; // [{ edit, label }]
  let redo = [];
  let tool = null;
  let cropDraft = null;
  let cropAspect = null;
  let bgDraft = null;
  let snipDraft = null;
  let lastSnip = null;
  let bgChoice = null;
  let removing = false;
  let cutoutNeedsSave = false;
  const brush = { size: 40, hardness: 0.6, erase: false };
  let cloneSource = null;
  let before = false;
  let shown = null;
  // How the preview sits in the stage. `scale` above is preview-vs-original;
  // this is the on-screen zoom (wheel, +/−, fit).
  const VIEW_ZOOMS = [0.05, 0.08, 0.1, 0.125, 0.167, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  let viewFit = true;
  let viewZoom = 1;
  let viewOffset = { x: 0, y: 0 };
  let spaceDown = false;
  let section = 'light';
  let look = null; // { id, amount } — the effect preset applied last (its strength and fine-tuning show under the looks)
  let lookOpen = 'catBasic'; // the looks category shown
  let lookFineOpen = false; // the look's fine-tuning stays folded until the user opens it
  let lookQuery = '';
  const lookThumbs = { source: null, done: new Map(), queue: [], timer: null }; // small previews of each look on this photo
  let busy = false;
  let rawMode = null; // null | 'camera' | 'auto' | 'daylight' — developing a RAW file
  let fromOriginal = false;
  let selectedLocal = -1;
  let selectedLayer = -1;
  let band = 'red';
  const drawStyle = { type: 'arrow', color: '#ff3b30', width: 0.6, fill: false };
  const layerImages = new Map();

  // ───────── state

  function lookSnap() {
    return look ? { id: look.id, amount: look.amount } : null;
  }

  function applySnap(entry) {
    edit = normalizeEdit(entry.edit);
    look = entry.look ? { id: entry.look.id, amount: entry.look.amount } : null;
  }

  function commit(label = t(`edit.${section ?? 'light'}`)) {
    revision += 1;
    undo.push({ edit: clone(edit), label, look: lookSnap() });
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
    else refreshResets();
  }

  function doUndo() {
    if (!undo.length) return;
    const entry = undo.pop();
    redo.push({ edit: clone(edit), label: entry.label, look: lookSnap() });
    applySnap(entry);
    revision += 1;
    buildPanel();
    draw();
    updateBar();
  }

  function doRedo() {
    if (!redo.length) return;
    const entry = redo.pop();
    undo.push({ edit: clone(edit), label: entry.label, look: lookSnap() });
    applySnap(entry);
    revision += 1;
    buildPanel();
    draw();
    updateBar();
  }

  /** History panel: back to the state after step `index` (0 = as opened). */
  function goToHistory(index) {
    while (undo.length > index) doUndo();
  }

  // ───────── drawing

  function paint() {
    if (!preview) return;
    if (edit.lut && !getLut(edit.lut.id)) { prepareEdit(edit).then(() => draw()).catch(() => {}); }
    const output = before ? preview : render(preview, edit, { scale, skipCrop: tool === 'crop', skipOverlay: SOURCE_TOOLS.includes(tool) || tool === 'crop' || tool === 'line', layerImages, high: fullHigh });
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
    let pixels = null;
    try {
      pixels = context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
      drawHistogram(histCanvas, histogram(pixels, 3));
      scheduleNeural(pixels);
    } catch { /* never break the preview */ }
    drawOverlay();
    const out = layout(full.width, full.height, edit.geometry);
    let outW = out.width;
    let outH = out.height;
    if (!before && edit.background?.selection && pixels) {
      const box = alphaBounds(pixels);
      if (box && scale) {
        outW = Math.max(1, Math.round(box.w / scale));
        outH = Math.max(1, Math.round(box.h / scale));
      }
    }
    info.textContent = `${item.name}${rawMode ? ' · RAW (LibRaw)' : ''}${fromOriginal ? ` · ${t('edit.fromOriginal')}` : ''}${fullHigh ? ` · ${t('edit.highBit')}` : ''} · ${full.width} × ${full.height} → ${outW} × ${outH}${before ? ` · ${t('edit.before')}` : ''}`;
    const dimsCell = infoBody.querySelector('[data-info="dims"]');
    if (dimsCell) {
      const dims = formatDims(full.width, full.height);
      const sizeText = outW !== full.width || outH !== full.height ? `${dims} → ${formatDims(outW, outH)}` : dims;
      if (dimsCell.textContent !== sizeText) { dimsCell.textContent = sizeText; dimsCell.title = sizeText; }
    }
  }
  const draw = rafThrottle(paint);

  /** Scale that fits the preview in the stage, at most 2× (same as before zoom existed). */
  function fitFactor() {
    if (!shown) return 1;
    const box = canvasHolder.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return 1;
    return Math.min((box.width - 24) / shown.width, (box.height - 24) / shown.height, 2);
  }

  function zoomText() {
    const k = !shown || viewFit ? fitFactor() : viewZoom;
    return `${Math.round(k * 100)}%`;
  }

  function updateZoomLabel() {
    const value = bar.querySelector('.zoom-value');
    if (value) value.textContent = zoomText();
  }

  function fitCanvas() {
    if (!shown) return;
    const box = canvasHolder.getBoundingClientRect();
    const k = viewFit ? fitFactor() : viewZoom;
    if (viewFit) viewZoom = k;
    const w = Math.max(1, shown.width * k);
    const hgt = Math.max(1, shown.height * k);
    const maxX = Math.max(0, (w - box.width) / 2);
    const maxY = Math.max(0, (hgt - box.height) / 2);
    viewOffset.x = Math.max(-maxX, Math.min(maxX, viewOffset.x));
    viewOffset.y = Math.max(-maxY, Math.min(maxY, viewOffset.y));
    shown.style.width = `${w}px`;
    shown.style.height = `${hgt}px`;
    shown.style.transform = `translate(-50%, -50%) translate(${viewOffset.x}px, ${viewOffset.y}px)`;
    shown.style.imageRendering = k > 2 ? 'pixelated' : 'auto';
    canvasHolder.classList.toggle('pannable', w > box.width + 1 || hgt > box.height + 1);
    updateZoomLabel();
  }

  function setViewZoom(value, at = null) {
    if (!shown) return;
    const beforeK = viewFit ? fitFactor() : viewZoom;
    const next = Math.max(VIEW_ZOOMS[0], Math.min(VIEW_ZOOMS[VIEW_ZOOMS.length - 1], value));
    if (at) {
      const rect = canvasHolder.getBoundingClientRect();
      const px = at.x - rect.left - rect.width / 2 - viewOffset.x;
      const py = at.y - rect.top - rect.height / 2 - viewOffset.y;
      viewOffset.x -= px * (next / beforeK - 1);
      viewOffset.y -= py * (next / beforeK - 1);
    } else if (viewFit) viewOffset = { x: 0, y: 0 };
    viewFit = false;
    viewZoom = next;
    fitCanvas();
    drawOverlay();
  }

  function zoomStep(direction, at) {
    const currentZoom = viewFit ? fitFactor() : viewZoom;
    const next = direction > 0
      ? VIEW_ZOOMS.find((z) => z > currentZoom + 1e-6)
      : [...VIEW_ZOOMS].reverse().find((z) => z < currentZoom - 1e-6);
    if (next) setViewZoom(next, at);
  }

  function setFit() {
    viewFit = true;
    viewOffset = { x: 0, y: 0 };
    fitCanvas();
    drawOverlay();
  }

  function panFrom(event) {
    if (!shown) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, ox: viewOffset.x, oy: viewOffset.y };
    let moved = false;
    const root = event.currentTarget;
    root.classList.add('panning');
    try { root.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 3) return;
      if (!moved) {
        moved = true;
        if (viewFit) viewZoom = fitFactor();
        viewFit = false;
      }
      viewOffset.x = start.ox + e.clientX - start.x;
      viewOffset.y = start.oy + e.clientY - start.y;
      fitCanvas();
      drawOverlay();
    };
    const up = () => {
      root.classList.remove('panning');
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
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

  function paintSelectionLine() {
    const line = selectionLine(app.settings?.background);
    overlay.style.setProperty('--bg-line-color', line.color);
    overlay.style.setProperty('--bg-line-width', `${line.width}px`);
    overlay.style.setProperty('--bg-line-halo', `${line.width + 2}px`);
    overlay.style.setProperty('--bg-line-style', line.style);
    overlay.style.setProperty('--bg-line-dash', line.dash ? line.dash.join(' ') : 'none');
  }

  function drawOverlay() {
    paintSelectionLine();
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
    if (SNIP_TOOLS.includes(tool) && snipDraft && (snipDraft.kind === 'rect' || snipDraft.kind === 'ellipse' || snipDraft.kind === 'circle')) {
      const r = displayRect();
      const box = { x: r.x + snipDraft.x * r.w, y: r.y + snipDraft.y * r.h, w: snipDraft.w * r.w, h: snipDraft.h * r.h };
      if (snipDraft.kind === 'rect') overlay.append(h('div.crop-box.bg-marquee', { style: { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` } }, h('div.bg-marquee-fill')));
      else overlay.append(snipEllipse(box));
    }
    if (SNIP_TOOLS.includes(tool) && snipDraft?.kind === 'free' && snipDraft.points?.length > 1) {
      const r = displayRect();
      const points = snipDraft.points.map(([x, y]) => [r.x + x * r.w, r.y + y * r.h]);
      overlay.append(snipDraft.ready ? bgSelection(points) : bgLasso(points).svg);
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

  // Middle button, or Space held down, moves the picture even while a tool is active.
  overlay.addEventListener('pointerdown', (event) => {
    if (event.button === 1 || spaceDown) { event.stopPropagation(); panFrom(event); }
  }, true);

  canvasHolder.addEventListener('pointerdown', (event) => {
    if (!shown || (event.button !== 0 && event.button !== 1)) return;
    if (tool && event.button === 0 && !spaceDown) return;
    panFrom(event);
  });

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomStep(event.deltaY < 0 ? 1 : -1, { x: event.clientX, y: event.clientY });
  }, { passive: false });

  stage.addEventListener('dblclick', (event) => {
    if (tool || !shown) return;
    if (viewFit) setViewZoom(1, { x: event.clientX, y: event.clientY });
    else setFit();
  });

  const neuralFailed = new Set();

  function currentBgAlgorithm() {
    return normalizeAlgorithm(bgChoice ?? edit.background?.algorithm ?? app.settings.background?.algorithm);
  }

  function scheduleNeural(pixels) {
    if (before || !pixels) return;
    const background = normalizeBackground(edit.background);
    if (!background?.selection || !isNeuralAlgorithm(background.algorithm)) return;
    const selection = selectionToPixels(background.selection, pixels.width, pixels.height);
    const key = neuralKey(background.algorithm, selection, pixels.width, pixels.height);
    if (hasNeuralAlpha(key) || neuralFailed.has(key)) return;
    neuralFailed.add(key);
    const image = { width: pixels.width, height: pixels.height, data: pixels.data };
    prepareNeuralMask(image, selection, background.algorithm).then(() => {
      neuralFailed.delete(key);
      draw();
    }).catch((error) => {
      if (String(error?.message || error) === 'cancelled') return;
      if (error?.downloadFailed) toast(downloadFailedText(background.algorithm, error), 'error', 7000);
      else toast(t('edit.bgModelFailed', { error: errorText(error) }), 'error', 7000);
    });
  }

  let busyNote = 0;
  function setRemoving(on) {
    removing = on;
    document.body.classList.toggle('bg-removing', on);
    if (on) closeMenus();
    updateBar();
  }
  document.addEventListener('pointerdown', (event) => {
    if (!removing) return;
    if (event.target.closest?.('.dialog, .dialog-overlay, .dialog-shield')) return;
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - busyNote < 1500) return;
    busyNote = now;
    toast(t('edit.bgBusy'), 'info');
  }, true);

  function commitBackground(selection) {
    neuralFailed.clear();
    const normalized = normalizeBackground({ algorithm: currentBgAlgorithm(), selection });
    if (!normalized) return;
    tool = null;
    bgDraft = null;
    snipDraft = null;
    section = 'background';
    panelReveal = 'background';
    change((ed) => { ed.background = normalized; }, t('edit.background'));
    cutoutNeedsSave = true;
    paint();
    buildPanel();
  }

  function unsavedCutout() {
    return cutoutNeedsSave && Boolean(edit.background?.selection);
  }

  let askingSave = false;
  let revision = 0;
  let savedRevision = 0;

  function needsSave() {
    return revision !== savedRevision && !isEmptyEdit(edit) && undo.length > 0;
  }

  /** 'save' writes the file and stays in the editor. 'discard' continues. 'cancel' stays put. */
  async function askSaveEdits(message) {
    if (askingSave) return 'cancel';
    askingSave = true;
    try {
      const choice = await openDialog({
        title: t('edit.save'),
        body: h('p.dialog-message', message),
        width: 420,
        buttons: [
          { label: t('common.cancel'), value: 'cancel' },
          { label: t('edit.bgSaveNo'), value: 'discard' },
          { label: t('edit.save'), value: 'save', primary: true },
        ],
      });
      if (choice === 'save') {
        const saved = await save(false, { stay: true });
        return saved ? 'save' : 'cancel';
      }
      if (choice === 'discard') return 'discard';
      return 'cancel';
    } finally { askingSave = false; }
  }

  async function askSaveCutout() {
    const choice = await askSaveEdits(t('edit.bgSaveAsk'));
    if (choice === 'discard') cutoutNeedsSave = false;
    return choice;
  }

  async function confirmLeave() {
    if (removing) return false;
    if (!needsSave()) return true;
    return (await askSaveEdits(t('edit.saveAsk'))) !== 'cancel';
  }

  function removalLabel(algorithm, percent) {
    return t('edit.bgRemoving', { name: t(`edit.bg.${algorithm}`), percent });
  }

  /** Shows a progress popup, then prepares the matte the next draw will apply. */
  async function showRemoval(selection, algorithm) {
    // The preview looks up the matte with the clamped selection. Preparing the
    // raw stroke (it often runs outside the photo) stores a different key, so
    // REMBG reports success and the picture stays unchanged.
    const normalized = normalizeBackground({ algorithm, selection });
    if (!preview || !normalized) return false;
    selection = normalized.selection;
    algorithm = normalized.algorithm;
    if (isNeuralAlgorithm(algorithm) && !(await isInstalled(algorithm))) {
      try { await installModel(algorithm); } catch (error) {
        if (String(error?.message || error) === 'cancelled') return false;
        toast(error?.downloadFailed ? downloadFailedText(algorithm, error) : t('edit.bgModelFailed', { error: errorText(error) }), 'error', 7000);
        return false;
      }
    }
    const progress = progressDialog(removalLabel(algorithm, 0), { immediate: true });
    progress.update(0, 100, removalLabel(algorithm, 0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      if (progress.cancelled) throw new Error('cancelled');
      const output = render(preview, edit, { scale, skipBackground: true, layerImages, high: fullHigh });
      let canvas = output;
      if (!(canvas instanceof HTMLCanvasElement)) {
        canvas = document.createElement('canvas');
        canvas.width = output.width;
        canvas.height = output.height;
        canvas.getContext('2d').drawImage(output, 0, 0);
      }
      const pixels = context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
      const image = { width: pixels.width, height: pixels.height, data: pixels.data };
      const sel = selectionToPixels(selection, image.width, image.height);
      const report = (done, total) => progress.update(done, total, removalLabel(algorithm, total ? Math.round((done / total) * 100) : 0));
      if (isNeuralAlgorithm(algorithm)) await prepareNeuralMask(image, sel, algorithm, report);
      else await prepareBuiltinRemoval(image, sel, algorithm, report, () => progress.cancelled);
      if (progress.cancelled) throw new Error('cancelled');
      progress.update(100, 100, removalLabel(algorithm, 100));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return true;
    } catch (error) {
      if (String(error?.message || error) === 'cancelled') return false;
      if (error?.downloadFailed) toast(downloadFailedText(algorithm, error), 'error', 7000);
      else if (isNeuralAlgorithm(algorithm)) toast(t('edit.bgModelFailed', { error: errorText(error) }), 'error', 7000);
      else toast(errorText(error), 'error', 7000);
      return false;
    } finally {
      progress.close();
    }
  }

  /** Background removal uses whichever selection is ready: rectangle, ellipse, circle or freehand. */
  function backgroundSelection() {
    return snipSelection();
  }

  async function applyBackground() {
    const selection = backgroundSelection();
    if (!selection || removing) return;
    setRemoving(true);
    try {
      if (await showRemoval(selection, currentBgAlgorithm())) commitBackground(selection);
    } finally { setRemoving(false); }
  }

  function pictureAspect() {
    if (!preview) return 1;
    const plan = layout(preview.width, preview.height, edit.geometry);
    return plan.height > 0 ? plan.width / plan.height : 1;
  }

  /** Drag box for a rectangle, ellipse, or a circle that is round on the picture. */
  function snipBox(kind, start, current) {
    const x0 = start.fx;
    const y0 = start.fy;
    const x1 = current.fx;
    const y1 = current.fy;
    if (kind !== 'circle') return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    const aspect = pictureAspect();
    const side = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0) / (aspect || 1));
    const wf = side;
    const hf = side * aspect;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return { x: cx - wf / 2, y: cy - hf / 2, w: wf, h: hf };
  }

  function holdSnip(draft) {
    snipDraft = draft;
    updateBar();
    drawOverlay();
  }

  function snipSelection(draft = snipDraft) {
    if (!draft?.ready) return null;
    if (draft.kind === 'free') return { kind: 'free', points: draft.points.map((point) => [...point]) };
    return { kind: draft.kind, x: draft.x, y: draft.y, w: draft.w, h: draft.h };
  }

  function startSnipSelect(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    paintSelectionLine();
    try { overlay.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
    const start = fractionAt(event);
    const kind = tool === 'sniprect' ? 'rect' : tool === 'snipellipse' ? 'ellipse' : tool === 'snipcircle' ? 'circle' : 'free';
    if (kind !== 'free') {
      snipDraft = { kind, ...snipBox(kind, start, start) };
      drawOverlay();
      const move = (e) => {
        snipDraft = { kind, ...snipBox(kind, start, fractionAt(e)) };
        drawOverlay();
      };
      const up = () => {
        overlay.removeEventListener('pointermove', move);
        overlay.removeEventListener('pointerup', up);
        const draft = snipDraft;
        if (!draft || draft.w < 0.01 || draft.h < 0.01) { snipDraft = null; drawOverlay(); updateBar(); return; }
        holdSnip({ kind, x: draft.x, y: draft.y, w: draft.w, h: draft.h, ready: true });
      };
      overlay.addEventListener('pointermove', move);
      overlay.addEventListener('pointerup', up);
      return;
    }
    const points = [[start.fx, start.fy]];
    const box = overlay.getBoundingClientRect();
    const shownPoints = [[event.clientX - box.left, event.clientY - box.top]];
    const lasso = bgLasso(shownPoints);
    overlay.append(lasso.svg);
    const move = (e) => {
      const p = fractionAt(e);
      const last = points[points.length - 1];
      if (Math.hypot(p.fx - last[0], p.fy - last[1]) < 0.004) return;
      points.push([p.fx, p.fy]);
      shownPoints.push([e.clientX - box.left, e.clientY - box.top]);
      lasso.paint();
    };
    const up = () => {
      overlay.removeEventListener('pointermove', move);
      overlay.removeEventListener('pointerup', up);
      lasso.svg.remove();
      if (points.length < 3) { snipDraft = null; drawOverlay(); updateBar(); return; }
      holdSnip({ kind: 'free', points: points.map((point) => [...point]), ready: true });
    };
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', up);
  }

  // Copy and cut must call clipboard.write in the gesture, before any await,
  // or the browser drops the permission to put an image on the clipboard.
  function copySnip(cut) {
    const selection = snipSelection();
    if (!selection || !full) { toast(t('edit.snipNeed'), 'info'); return; }
    let piece;
    let blobPromise;
    try {
      const output = render(full, edit, { scale: 1, layerImages, high: fullHigh });
      const pixels = context2d(output, { willReadFrequently: true }).getImageData(0, 0, output.width, output.height);
      piece = extractSnip(pixels, selection);
      if (!piece) { toast(t('edit.snipNeed'), 'info'); return; }
      lastSnip = piece;
      blobPromise = canvasToBlob(canvasFromImageData(piece), 'image/png');
    } catch (error) {
      toast(t('edit.snipCopyFailed', { error: errorText(error) }), 'error');
      return;
    }
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      toast(t('edit.snipCopyFailed', { error: 'clipboard' }), 'error');
      return;
    }
    window.focus();
    const stored = normalizeSnip(selection);
    const draft = snipDraft;
    const editing = item;
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]).then(() => {
      if (!shown || item !== editing) return;
      if (cut && stored) {
        if (snipDraft === draft) snipDraft = null;
        change((ed) => { ed.cuts = [...normalizeSnips(ed.cuts), stored]; }, t('edit.snipCut'));
      }
      toast(t(cut ? 'edit.snipCutDone' : 'edit.snipCopied'), 'info');
    }).catch((error) => {
      toast(t('edit.snipCopyFailed', { error: errorText(error) }), 'error');
    });
  }

  function snipShortcut(id) {
    return keyOf(SNIP_COMMANDS.find((command) => command.id === id) ?? {});
  }

  function snipMenu(event) {
    const ready = Boolean(snipDraft?.ready);
    contextMenu(event, [
      { id: 'snip-menu-rect', icon: 'square', label: t('edit.snipRect'), shortcut: snipShortcut('edit:snipRect'), action: () => setTool('sniprect') },
      { id: 'snip-menu-ellipse', icon: 'ellipse', label: t('edit.snipEllipse'), shortcut: snipShortcut('edit:snipEllipse'), action: () => setTool('snipellipse') },
      { id: 'snip-menu-circle', icon: 'circle', label: t('edit.snipCircle'), shortcut: snipShortcut('edit:snipCircle'), action: () => setTool('snipcircle') },
      { id: 'snip-menu-free', icon: 'lasso', label: t('edit.snipFree'), shortcut: snipShortcut('edit:snipFree'), action: () => setTool('snipfree') },
      'separator',
      { id: 'snip-menu-copy', icon: 'copy', label: t('edit.snipCopy'), shortcut: snipShortcut('edit:snipCopy'), disabled: !ready, action: () => copySnip(false) },
      { id: 'snip-menu-cut', icon: 'scissors', label: t('edit.snipCut'), shortcut: snipShortcut('edit:snipCut'), disabled: !ready, action: () => copySnip(true) },
      { id: 'snip-menu-bg', icon: 'removeBg', label: t('edit.background'), disabled: !backgroundSelection(), action: () => applyBackground() },
      { id: 'snip-menu-clear', icon: 'close', label: t('edit.snipClear'), shortcut: 'Esc', disabled: !snipDraft && !SNIP_TOOLS.includes(tool), action: () => cancelTool() },
    ]);
  }

  stage.addEventListener('contextmenu', (event) => {
    if (!shown) return;
    snipMenu(event);
  });

  overlay.addEventListener('pointerdown', (event) => {
    if (!shown || before || !tool || tool === 'crop') return;
    if (SNIP_TOOLS.includes(tool)) { startSnipSelect(event); return; }
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
    if (tool === 'wand' || tool === 'color') {
      // One click: a magic-wand selection from this point, or the colour range of this pixel.
      let shape;
      if (tool === 'wand') shape = { x: Math.round(point.x), y: Math.round(point.y), tolerance: 32, feather: 3 };
      else {
        const px = Math.round(point.x * scale);
        const py = Math.round(point.y * scale);
        const [r, g, b] = context2d(preview, { willReadFrequently: true }).getImageData(Math.max(0, px), Math.max(0, py), 1, 1).data;
        shape = { hue: Math.round(hueOf(r, g, b)), range: 25, satMin: 15, lumMin: 0, lumMax: 100, soft: 12 };
      }
      change((ed) => { ed.local.push({ kind: tool, shape, adjust: { exposure: 0.5 }, detail: {} }); }, t(`edit.local.${tool}`));
      selectedLocal = edit.local.length - 1;
      buildPanel();
      return;
    }
    if (tool === 'lasso') {
      const points = [[Math.round(point.x), Math.round(point.y)]];
      const box = overlay.getBoundingClientRect();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'lasso-path');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      svg.append(line);
      overlay.append(svg);
      const shown = [[event.clientX - box.left, event.clientY - box.top]];
      const paint = () => line.setAttribute('points', shown.map((p) => p.join(',')).join(' '));
      try { overlay.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      const moveLasso = (e) => {
        const p = sourcePoint(e);
        const last = points[points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 2) return;
        points.push([Math.round(p.x), Math.round(p.y)]);
        shown.push([e.clientX - box.left, e.clientY - box.top]);
        paint();
      };
      const upLasso = () => {
        overlay.removeEventListener('pointermove', moveLasso);
        overlay.removeEventListener('pointerup', upLasso);
        svg.remove();
        if (points.length < 3) return;
        change((ed) => { ed.local.push({ kind: 'lasso', shape: { points, feather: 8 }, adjust: { exposure: 0.5 }, detail: {} }); }, t('edit.local.lasso'));
        selectedLocal = edit.local.length - 1;
        buildPanel();
      };
      overlay.addEventListener('pointermove', moveLasso);
      overlay.addEventListener('pointerup', upLasso);
      return;
    }
    if (tool === 'layermask') {
      const layer = edit.layers[selectedLayer];
      if (!layer?.mask || layer.mask.kind !== 'brush') return;
      commit(t('edit.layerMask'));
      const r = displayRect();
      const stroke = { points: [[fx, fy]], radius: brush.size / 2 / Math.min(r.w, r.h), hardness: brush.hardness, erase: brush.erase };
      layer.mask.strokes.push(stroke);
      draw();
      try { overlay.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      const moveMask = (e) => { const f = fractionAt(e); stroke.points.push([f.fx, f.fy]); draw(); };
      const upMask = () => { overlay.removeEventListener('pointermove', moveMask); overlay.removeEventListener('pointerup', upMask); updateBar(); };
      overlay.addEventListener('pointermove', moveMask);
      overlay.addEventListener('pointerup', upMask);
      return;
    }
    if (tool === 'erase') {
      // Paint over what should go; on release the area is rebuilt from its surroundings.
      const stroke = { points: [[Math.round(point.x), Math.round(point.y)]], radius: Math.round(radiusFor(point.displayPerSource)) };
      const box = overlay.getBoundingClientRect();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'erase-path');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('stroke-width', String(stroke.radius * 2 * point.displayPerSource));
      svg.append(line);
      overlay.append(svg);
      const shown = [[event.clientX - box.left, event.clientY - box.top]];
      const paint = () => line.setAttribute('points', shown.map((p) => p.join(',')).join(' '));
      paint();
      try { overlay.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      const moveErase = (e) => {
        const p = sourcePoint(e);
        stroke.points.push([Math.round(p.x), Math.round(p.y)]);
        shown.push([e.clientX - box.left, e.clientY - box.top]);
        paint();
      };
      const upErase = () => {
        overlay.removeEventListener('pointermove', moveErase);
        overlay.removeEventListener('pointerup', upErase);
        svg.remove();
        change((ed) => { ed.spots.push({ type: 'erase', strokes: [stroke] }); }, t('edit.contentErase'));
        buildPanel();
      };
      overlay.addEventListener('pointermove', moveErase);
      overlay.addEventListener('pointerup', upErase);
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
    // A chosen aspect must win over a full-frame draft left from before the
    // picture's real size was known. A free crop of the whole picture is still
    // "no crop".
    const fullFrame = cropDraft && cropDraft.w > 0.999 && cropDraft.h > 0.999;
    if (fullFrame && cropAspect && full?.width > 0 && full?.height > 0) {
      const plan = layout(full.width, full.height, edit.geometry, { skipCrop: true });
      const a = aspectValue();
      if (a && plan.width > 0 && plan.height > 0) cropDraft = cropForAspect(plan.width, plan.height, a);
    }
    const whole = cropDraft && cropDraft.w > 0.999 && cropDraft.h > 0.999;
    change((e) => { e.geometry.crop = whole ? null : { ...cropDraft }; }, t('edit.crop'));
    tool = null;
    cropDraft = null;
    buildPanel();
    draw();
  }

  async function setTool(next) {
    next = SNIP_TOOL_ALIAS[next] ?? next;
    if (SNIP_TOOLS.includes(next) && tool !== next && unsavedCutout()) {
      if ((await askSaveCutout()) === 'cancel') return;
    }
    const on = tool !== next;
    tool = on ? next : null;
    cropDraft = null;
    bgDraft = null;
    snipDraft = null;
    buildPanel();
    updateBar();
    draw();
  }

  function cancelTool() {
    tool = null;
    cropDraft = null;
    bgDraft = null;
    snipDraft = null;
    buildPanel();
    updateBar();
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
    input.addEventListener('change', () => { committed = false; updateBar(); refreshResets(); });
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
    color: (e) => { for (const key of ['temperature', 'tint', 'saturation', 'vibrance', 'hue']) e.adjust[key] = DEFAULT_ADJUST[key]; e.tone.colorBalance = null; },
    colorEq: (e) => { e.tone.colorEq = null; },
    lightEq: (e) => { e.tone.lightEq = null; },
    splitTone: (e) => { e.tone.splitTone = null; },
    levels: (e) => { e.adjust.levels = null; },
    curves: (e) => { e.adjust.curves = null; },
    lut: (e) => { e.lut = null; },
    detail: (e) => { e.detail = { ...DEFAULT_DETAIL }; },
    lens: (e) => { e.lens = { ...DEFAULT_LENS }; },
    geometry: (e) => { e.geometry = { ...defaultEdit().geometry }; e.canvas = { ...DEFAULT_CANVAS }; },
    background: (e) => { e.background = null; },
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
    if (id === 'background') bgDraft = null;
    change((e) => RESETS[id](e), `${t('edit.reset')}: ${t(`edit.${id}`)}`);
    if (id === 'local') selectedLocal = -1;
    if (id === 'layers') selectedLayer = -1;
    buildPanel();
  }

  const resetMark = (id, title) => h('span.edit-section-reset', { role: 'button', title: `${t('edit.resetSection')} — ${title}`, dataset: { reset: id }, html: icon('undo'), onclick: (event) => { event.stopPropagation(); resetSection(id); } });
  /** Shows or hides the ↺ on every section title after a change (sliders do not rebuild the panel). */
  function refreshResets() {
    for (const head of panel.querySelectorAll('.edit-section-head[data-section]')) {
      const id = head.dataset.section;
      if (!RESETS[id]) continue;
      const mark = head.querySelector('.edit-section-reset');
      const changed = sectionChanged(id);
      if (changed && !mark) head.querySelector('.arrow').before(resetMark(id, head.children[1].textContent));
      else if (!changed && mark) mark.remove();
    }
  }

  function sectionHead(id, title, iconName) {
    const reset = id !== 'background' && RESETS[id] && sectionChanged(id) ? resetMark(id, title) : null;
    const head = h(`button.edit-section-head${section === id ? '.open' : ''}`, { type: 'button', dataset: { section: id } }, h('span', { html: icon(iconName) }), h('span', title), reset, h('span.arrow', { html: icon(section === id ? 'chevronDown' : 'chevronRight') }));
    head.addEventListener('click', () => {
      const open = section !== id;
      section = open ? id : null;
      panelReveal = open ? id : null;
      if (tool) cancelTool(); else buildPanel();
    });
    return head;
  }

  const SECTIONS = [
    ['light', 'sun'], ['color', 'droplet'], ['colorEq', 'palette'], ['lightEq', 'histogram'], ['splitTone', 'contrast'], ['levels', 'histogram'],
    ['curves', 'contrast'], ['lut', 'cube'], ['detail', 'sharpen'], ['lens', 'camera'], ['geometry', 'crop'], ['background', 'cutout'], ['local', 'sliders'], ['repair', 'bandage'],
    ['effects', 'wand'], ['draw', 'pencil'], ['add', 'text'], ['layers', 'layers'], ['presets', 'bookmark'], ['history', 'clock'],
  ];

  // ───────── colour balance wheels (under the histogram, always visible)

  const WHEEL = 64;
  function drawWheels() {
    clear(wheelsBox);
    for (const key of ['shadows', 'midtones', 'highlights']) {
      const valueOf = () => edit.tone.colorBalance?.[key] ?? { hue: 0, amount: 0 };
      const canvas = h('canvas.color-wheel', { width: WHEEL * 2, height: WHEEL * 2, dataset: { wheel: key }, title: `${t(`edit.wheel.${key}`)} — ${t('edit.wheelHint')}` });
      const label = h('span.color-wheel-value');
      // Repaints this wheel only (the canvas stays the same element while it is dragged).
      const paint = () => {
        const value = valueOf();
        const g = canvas.getContext('2d');
        const c = WHEEL;
        const r = WHEEL - 3;
        g.clearRect(0, 0, canvas.width, canvas.height);
        const hue = g.createConicGradient ? g.createConicGradient(0, c, c) : null;
        if (hue) { for (let k = 0; k <= 12; k++) hue.addColorStop(k / 12, `hsl(${k * 30}, 85%, 55%)`); g.fillStyle = hue; } else g.fillStyle = '#888';
        g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
        const fade = g.createRadialGradient(c, c, 0, c, c, r);
        fade.addColorStop(0, 'rgba(128,128,128,1)'); fade.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = fade; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
        const a = (value.hue * Math.PI) / 180;
        const d = (value.amount / 100) * r;
        g.lineWidth = 3; g.strokeStyle = '#fff'; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 7, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
        label.textContent = value.amount ? `${value.hue}° · ${value.amount}` : '–';
      };
      const set = (event) => {
        const box = canvas.getBoundingClientRect();
        const x = ((event.clientX - box.left) / box.width) * 2 - 1;
        const y = ((event.clientY - box.top) / box.height) * 2 - 1;
        const amount = Math.round(Math.min(1, Math.hypot(x, y) / ((WHEEL - 3) / WHEEL)) * 100);
        const angle = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
        edit.tone.colorBalance = { ...(edit.tone.colorBalance ?? {}), [key]: { hue: angle, amount } };
        paint();
        draw();
      };
      canvas.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        commit(t(`edit.wheel.${key}`));
        try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
        set(event);
        const move = (e) => set(e);
        const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); updateBar(); refreshResets(); };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
      });
      canvas.addEventListener('dblclick', () => { change((e) => { if (e.tone.colorBalance) e.tone.colorBalance = { ...e.tone.colorBalance, [key]: { hue: 0, amount: 0 } }; }, t('edit.wheelReset')); paint(); });
      paint();
      wheelsBox.append(h('div.color-wheel-box', canvas, h('div.color-wheel-label', t(`edit.wheel.${key}`), label)));
    }
  }

  let panelReveal = null;

  /** Keeps the opened section on screen. Rebuilding the panel would otherwise jump back to the top. */
  function showOpened(id) {
    const head = panel.querySelector(`.edit-section-head[data-section="${id}"]`);
    if (!head) return;
    const body = head.nextElementSibling?.classList?.contains('edit-section') ? head.nextElementSibling : null;
    const panelTop = panel.getBoundingClientRect().top;
    const headTop = head.getBoundingClientRect().top - panelTop + panel.scrollTop;
    const bottom = (body ?? head).getBoundingClientRect().bottom - panelTop + panel.scrollTop;
    const view = panel.clientHeight;
    if (bottom - headTop > view - 8) panel.scrollTop = Math.max(0, headTop - 4);
    else if (headTop < panel.scrollTop) panel.scrollTop = Math.max(0, headTop - 4);
    else if (bottom > panel.scrollTop + view) panel.scrollTop = bottom - view + 4;
  }

  function buildPanel() {
    const reveal = panelReveal;
    panelReveal = null;
    const kept = panel.scrollTop;
    drawWheels();
    clear(panel);
    const bodies = { light: lightPanel, color: colorPanel, colorEq: colorEqPanel, lightEq: lightEqPanel, lut: lutPanel, splitTone: splitTonePanel, levels: levelsPanel, curves: curvesPanel, detail: detailPanel, lens: lensPanel, geometry: geometryPanel, background: backgroundPanel, local: localPanel, repair: repairPanel, effects: effectsPanel, looks: looksPanel, draw: drawPanel, add: addPanel, layers: layersPanel, presets: presetsPanel, history: historyPanel };
    for (const [id, iconName] of SECTIONS) {
      panel.append(sectionHead(id, t(`edit.${id}`), iconName));
      if (section === id) panel.append(h('div.edit-section', bodies[id]()));
    }
    panel.append(h('div.edit-looks-pin',
      h('div.edit-section-head.pin', { dataset: { section: 'looks' } }, h('span', { html: icon('star') }), h('span', t('edit.looks'))),
      h('div.edit-section', looksPanel())));
    if (reveal) showOpened(reveal);
    else panel.scrollTop = kept;
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
    return h('div', ...splitToneRows());
  }
  /** Split-toning sliders (the split tone section, and a look's fine-tuning). */
  function splitToneRows() {
    const get = (key, d = 0) => edit.tone.splitTone?.[key] ?? d;
    const set = (key) => (v) => { edit.tone.splitTone = { highlightHue: 45, highlightSat: 0, shadowHue: 220, shadowSat: 0, balance: 0, ...(edit.tone.splitTone ?? {}), [key]: v }; };
    return [
      sliderRow(t('edit.stHighlightHue'), 0, 360, 1, () => get('highlightHue', 45), set('highlightHue'), (v) => `${v}°`, 'splitTone.highlightHue'),
      sliderRow(t('edit.stHighlightSat'), 0, 100, 1, () => get('highlightSat'), set('highlightSat'), undefined, 'splitTone.highlightSat'),
      sliderRow(t('edit.stShadowHue'), 0, 360, 1, () => get('shadowHue', 220), set('shadowHue'), (v) => `${v}°`, 'splitTone.shadowHue'),
      sliderRow(t('edit.stShadowSat'), 0, 100, 1, () => get('shadowSat'), set('shadowSat'), undefined, 'splitTone.shadowSat'),
      sliderRow(t('edit.stBalance'), -100, 100, 1, () => get('balance'), set('balance'), undefined, 'splitTone.balance')];
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
    resizeW.addEventListener('input', () => { if (lock.checked && !resizeW.disabled) resizeH.value = Math.max(1, Math.round((Number(resizeW.value) * out.height) / out.width)); });
    resizeH.addEventListener('input', () => { if (lock.checked && !resizeH.disabled) resizeW.value = Math.max(1, Math.round((Number(resizeH.value) * out.width) / out.height)); });
    const RATIOS = [25, 50, 75, 100, 150, 200];
    const resizeMode = selectEl([['px', t('resize.pixels')], ['percent', t('resize.percent')]], 'px');
    resizeMode.dataset.key = 'resize.mode';
    const percent = h('input.input', { type: 'number', min: 1, max: 1000, step: 1, value: 100, dataset: { key: 'resize.percent' } });
    const ratioRow = h('div.chip-row.resize-ratios');
    const percentBox = h('div', { hidden: true }, ratioRow, field(t('resize.percentValue'), percent));
    const markRatios = () => { for (const chip of ratioRow.children) chip.classList.toggle('on', Number(chip.dataset.ratio) === Number(percent.value)); };
    const fromPercent = () => {
      const n = Math.min(1000, Math.max(1, Math.round(Number(percent.value) || 100)));
      percent.value = String(n);
      resizeW.value = Math.max(1, Math.round((out.width * n) / 100));
      resizeH.value = Math.max(1, Math.round((out.height * n) / 100));
      markRatios();
    };
    for (const n of RATIOS) ratioRow.append(h('button.chip', { type: 'button', dataset: { ratio: String(n) }, onclick: () => { percent.value = String(n); fromPercent(); } }, `${n}%`));
    percent.addEventListener('input', fromPercent);
    const syncResizeMode = () => {
      const byRatio = resizeMode.value === 'percent';
      percentBox.hidden = !byRatio;
      resizeW.disabled = byRatio;
      resizeH.disabled = byRatio;
      lock.disabled = byRatio;
      if (byRatio) {
        percent.value = String(out.width ? Math.max(1, Math.round((Number(resizeW.value) / out.width) * 100)) : 100);
        fromPercent();
      }
    };
    resizeMode.addEventListener('change', syncResizeMode);
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
      field(t('resize.how'), resizeMode),
      percentBox,
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

  function backgroundPanel() {
    const chosen = currentBgAlgorithm();
    bgChoice = chosen;
    const pick = (algorithmId) => {
      if (algorithmId === chosen || removing) return;
      bgChoice = algorithmId;
      neuralFailed.clear();
      app.settings.background = { ...(app.settings.background ?? {}), algorithm: algorithmId };
      app.saveSettings();
      const go = async () => {
        if (unsavedCutout() && edit.background?.algorithm !== algorithmId) {
          if ((await askSaveCutout()) === 'cancel') { bgChoice = chosen; buildPanel(); return; }
        }
        if (edit.background?.selection && edit.background.algorithm !== algorithmId) {
          setRemoving(true);
          let ok = false;
          try {
            ok = await showRemoval(edit.background.selection, algorithmId);
            if (ok) {
              const normalized = normalizeBackground({ algorithm: algorithmId, selection: edit.background.selection });
              change((ed) => { ed.background = normalized ?? { ...ed.background, algorithm: algorithmId }; }, t('edit.bgAlgorithm'));
              cutoutNeedsSave = true;
              paint();
            }
          } finally { setRemoving(false); }
          if (!ok) { bgChoice = chosen; cutoutNeedsSave = Boolean(edit.background?.selection); buildPanel(); return; }
        }
        buildPanel();
      };
      go();
    };
    return h('div.bg-algorithms', { id: 'bg-algorithm' }, BG_ALGORITHMS.map((id) => h(`button.btn.small${id === chosen ? '.primary' : ''}`, {
      type: 'button', dataset: { algorithm: id }, onclick: () => pick(id),
    }, t(`edit.bg.${id}`))));
  }

  function localPanel() {
    const rows = edit.local.map((local, i) => {
      const row = h(`div.cat-row${i === selectedLocal ? '.active' : ''}`, { role: 'button', dataset: { local: String(i) } }, h('span.cat-icon', { html: icon({ brush: 'pencil', radial: 'circle', lasso: 'lasso', wand: 'wand', color: 'palette' }[local.kind] ?? 'contrast') }), h('span.cat-label', `${t(`edit.local.${local.kind}`)} ${i + 1}`),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: (e) => { e.stopPropagation(); change((ed) => { ed.local.splice(i, 1); }, t('edit.local')); selectedLocal = -1; buildPanel(); } }));
      row.addEventListener('click', () => { selectedLocal = i; tool = local.kind; buildPanel(); draw(); });
      return row;
    });
    const selected = edit.local[selectedLocal];
    const adjustRow = (key, label, min, max, stepValue = 1, format) => sliderRow(label, min, max, stepValue, () => selected.adjust?.[key] ?? 0, (v) => { selected.adjust = { ...(selected.adjust ?? {}), [key]: v }; }, format, `local.${key}`);
    const detailRow = (key, label, min, max) => sliderRow(label, min, max, 1, () => selected.detail?.[key] ?? 0, (v) => { selected.detail = { ...(selected.detail ?? {}), [key]: v }; }, undefined, `local.${key}`);
    return h('div',
      h('div.row-buttons', toolButton('gradient', t('edit.local.gradient'), 'contrast'), toolButton('radial', t('edit.local.radial'), 'circle'), toolButton('brush', t('edit.local.brush'), 'pencil')),
      h('div.row-buttons', toolButton('lasso', t('edit.local.lasso'), 'lasso'), toolButton('wand', t('edit.local.wand'), 'wand'), toolButton('color', t('edit.local.color'), 'palette')),
      h('div.hint', tool && ['gradient', 'radial', 'brush', ...SELECTION_TOOLS].includes(tool) ? t(`edit.local.${tool}Hint`) : t('edit.local.hint')),
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
        selectionSettings(selected),
        h('label.check', h('input', { type: 'checkbox', dataset: { key: 'local-invert' }, checked: Boolean(selected.shape.invert), onchange: (e) => change(() => { selected.shape.invert = e.target.checked; }, t('edit.local')) }), t('edit.invertMask'))) : '');
  }

  /** Settings of a selection mask: wand tolerance, colour range, lasso feather. */
  function selectionSettings(local) {
    const shapeRow = (key, label, min, max, format) => sliderRow(label, min, max, 1, () => local.shape[key] ?? 0, (v) => { local.shape[key] = v; }, format, `shape.${key}`);
    if (local.kind === 'wand') return h('div', shapeRow('tolerance', t('edit.local.tolerance'), 1, 128), shapeRow('feather', t('edit.local.feather'), 0, 40));
    if (local.kind === 'lasso') return shapeRow('feather', t('edit.local.feather'), 0, 80);
    if (local.kind === 'color') {
      const swatch = h('span.hue-swatch', { style: { background: `hsl(${local.shape.hue ?? 0}, 80%, 50%)` } });
      return h('div', h('div.field-label', t('edit.local.targetHue'), swatch),
        shapeRow('hue', t('edit.hue'), 0, 359, (v) => `${v}°`), shapeRow('range', t('edit.local.hueRange'), 2, 180, (v) => `±${v}°`),
        shapeRow('satMin', t('edit.local.satMin'), 0, 100), shapeRow('lumMin', t('edit.local.lumMin'), 0, 100), shapeRow('lumMax', t('edit.local.lumMax'), 0, 100));
    }
    return '';
  }

  function repairPanel() {
    return h('div',
      h('div.row-buttons', toolButton('redeye', t('edit.redeye'), 'redeye'), toolButton('heal', t('edit.heal'), 'bandage'), toolButton('clone', t('edit.clone'), 'copy'), toolButton('erase', t('edit.contentErase'), 'eraser')),
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
        layer.type === 'adjust' ? h('span.cat-icon', { html: icon('sliders') }) : '',
        h('span.cat-label', layer.name),
        layer.mask ? h('span.layer-mask-badge', { title: t('edit.layerMask') }, '◐') : '',
        h('button.tool.small', { type: 'button', title: t('edit.layerUp'), html: icon('up'), disabled: i === edit.layers.length - 1, onclick: (e) => { e.stopPropagation(); change((ed) => { [ed.layers[i], ed.layers[i + 1]] = [ed.layers[i + 1], ed.layers[i]]; }, t('edit.layers')); selectedLayer = i + 1; buildPanel(); } }),
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: (e) => { e.stopPropagation(); change((ed) => { ed.layers.splice(i, 1); }, t('edit.layers')); selectedLayer = -1; buildPanel(); } }));
      row.addEventListener('click', () => { selectedLayer = i; tool = 'layer'; buildPanel(); });
      return row;
    });
    const layer = edit.layers[selectedLayer];
    const adjustRow = (key, label, min, max, stepValue = 1, format) => sliderRow(label, min, max, stepValue, () => layer.adjust?.[key] ?? 0, (v) => { layer.adjust = { ...(layer.adjust ?? {}), [key]: v }; }, format, `layer.${key}`);
    return h('div',
      h('div.row-buttons', h('button.btn.small', { type: 'button', id: 'add-layer', onclick: addLayer }, h('span', { html: icon('plus') }), t('edit.addLayer')),
        h('button.btn.small', { type: 'button', id: 'add-adjust-layer', onclick: addAdjustLayer }, h('span', { html: icon('sliders') }), t('edit.addAdjustLayer')),
        edit.layers.some((l) => l.type !== 'adjust') ? toolButton('layer', t('edit.moveLayer'), 'move') : ''),
      h('div.hint', t('edit.layersHint')),
      ...rows,
      layer ? h('div.local-settings',
        layer.type === 'adjust' ? h('div',
          adjustRow('exposure', t('edit.exposure'), -3, 3, 0.05, (v) => `${Number(v).toFixed(2)} EV`),
          adjustRow('contrast', t('edit.contrast'), -100, 100),
          adjustRow('highlights', t('edit.highlights'), -100, 100),
          adjustRow('shadows', t('edit.shadows'), -100, 100),
          adjustRow('saturation', t('edit.saturation'), -100, 100),
          adjustRow('temperature', t('edit.temperature'), -100, 100))
          : field(t('edit.blendMode'), selectEl(BLEND_MODES.map((m) => [m, t(`blend.${m}`)]), layer.mode, (v) => change(() => { layer.mode = v; }, t('edit.blendMode')))),
        sliderRow(t('edit.opacity'), 0, 100, 1, () => layer.opacity, (v) => { layer.opacity = v; }, undefined, 'layer.opacity'),
        layer.type === 'adjust' ? '' : sliderRow(t('edit.layerSize'), 0.02, 2, 0.01, () => layer.scale, (v) => { layer.scale = v; }, (v) => `${Math.round(v * 100)}%`),
        layerMaskSettings(layer)) : '');
  }

  // ───────── layer masks: presets (gradients, ellipse) or painted with the mask brush

  const MASK_PRESETS = {
    none: () => null,
    top: () => ({ kind: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 0.6 }),
    bottom: () => ({ kind: 'linear', x1: 0.5, y1: 1, x2: 0.5, y2: 0.4 }),
    left: () => ({ kind: 'linear', x1: 0, y1: 0.5, x2: 0.6, y2: 0.5 }),
    right: () => ({ kind: 'linear', x1: 1, y1: 0.5, x2: 0.4, y2: 0.5 }),
    center: () => ({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.35, feather: 60 }),
    brush: () => ({ kind: 'brush', strokes: [], base: 0 }),
  };
  const maskPresetOf = (mask) => {
    if (!mask) return 'none';
    if (mask.kind === 'brush') return 'brush';
    return Object.keys(MASK_PRESETS).find((k) => k !== 'none' && k !== 'brush' && JSON.stringify({ ...MASK_PRESETS[k](), invert: mask.invert }) === JSON.stringify({ ...mask, invert: mask.invert })) ?? 'custom';
  };
  function layerMaskSettings(layer) {
    const preset = maskPresetOf(layer.mask);
    const choose = selectEl([...Object.keys(MASK_PRESETS).map((k) => [k, t(`edit.mask.${k}`)]), ...(preset === 'custom' ? [['custom', t('edit.mask.custom')]] : [])], preset, (v) => {
      change(() => { const next = MASK_PRESETS[v]?.(); layer.mask = next ? { ...next, invert: Boolean(layer.mask?.invert) } : null; }, t('edit.layerMask'));
      if (v === 'brush') tool = 'layermask';
      buildPanel();
    });
    choose.dataset.key = 'layer-mask';
    return h('div.layer-mask', h('div.edit-subhead', t('edit.layerMask')), field(t('edit.layerMaskShape'), choose),
      layer.mask ? h('label.check', h('input', { type: 'checkbox', dataset: { key: 'layer-mask-invert' }, checked: Boolean(layer.mask.invert), onchange: (e) => change(() => { layer.mask.invert = e.target.checked; }, t('edit.layerMask')) }), t('edit.invertMask')) : '',
      layer.mask?.kind === 'brush' ? h('div',
        h('div.row-buttons', toolButton('layermask', t('edit.maskBrush'), 'pencil')),
        sliderRow(t('edit.brushSize'), 4, 300, 1, () => brush.size, (v) => { brush.size = v; }),
        h('label.check', h('input', { type: 'checkbox', checked: brush.erase, onchange: (e) => { brush.erase = e.target.checked; } }), t('edit.maskErase')),
        h('div.hint', t('edit.maskBrushHint'))) : '');
  }

  function addAdjustLayer() {
    const n = edit.layers.filter((l) => l.type === 'adjust').length + 1;
    change((e) => { e.layers.push({ type: 'adjust', name: `${t('edit.adjustLayer')} ${n}`, adjust: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, temperature: 0 }, opacity: 100, visible: true, mask: null }); }, t('edit.addAdjustLayer'));
    selectedLayer = edit.layers.length - 1;
    buildPanel();
  }

  // ───────── effect presets (looks): one click for a whole style, then fine-tune

  function chooseLook(id) {
    const previous = look?.id ?? null;
    change((e) => Object.assign(e, applyLook(e, id, 100, previous)), t(`look.${id}`));
    look = { id, amount: 100 };
    buildPanel();
  }

  /** Strength, the sliders of everything the look set, and the looks by category with a preview of each. */
  function looksPanel() {
    const tune = look ? lookTunePanel() : '';
    const search = h('input.input.look-search', { type: 'search', placeholder: t('edit.lookSearch'), value: lookQuery, dataset: { key: 'look-search' } });
    search.addEventListener('input', () => { lookQuery = search.value; fillLooks(); });
    const list = h('div.look-list');
    const fillLooks = () => {
      clear(list);
      const q = lookQuery.trim().toLowerCase();
      for (const category of lookCategories()) {
        const ids = q ? category.ids.filter((id) => `${id} ${t(`look.${id}`)}`.toLowerCase().includes(q)) : category.ids;
        if (!ids.length) continue;
        const open = Boolean(q) || lookOpen === category.key;
        list.append(h(`button.look-cat${open ? '.open' : ''}`, { type: 'button', dataset: { lookCat: category.key }, onclick: () => { lookOpen = lookOpen === category.key ? null : category.key; fillLooks(); } },
          h('span.arrow', { html: icon(open ? 'chevronDown' : 'chevronRight') }), h('span', t(`lookCat.${category.key}`)), h('span.look-count', String(ids.length))));
        if (open) list.append(h('div.look-grid', ids.map((id) => lookTile(id))));
      }
      queueLookThumbs();
    };
    fillLooks();
    return h('div', h('div.hint', t('edit.looksHint')), tune, search, list);
  }

  function lookTile(id) {
    const thumb = h('canvas.look-thumb', { width: 1, height: 1 });
    const tile = h(`button.look-tile${look?.id === id ? '.on' : ''}`, { type: 'button', title: t(`look.${id}`), dataset: { look: id }, onclick: () => chooseLook(id) }, thumb, h('span.look-name', t(`look.${id}`)));
    paintLookThumb(id, thumb);
    return tile;
  }

  /** Strength 0…150 % (re-applies the look) and fine-tuning sliders for every value the look set. */
  function lookTunePanel() {
    const { id } = look;
    const amount = sliderRow(t('edit.lookAmount'), 0, 150, 1, () => look.amount, (v) => { look.amount = v; Object.assign(edit, applyLook(edit, id, v, id)); }, (v) => `${v}%`, 'look.amount');
    amount.title = t('edit.lookAmountHint');
    amount.addEventListener('change', () => buildPanel()); // the fine-tuning sliders show the new values
    const SPECS = {
      'adjust.brightness': () => slider('adjust', 'brightness', t('edit.brightness'), -100, 100),
      'adjust.contrast': () => slider('adjust', 'contrast', t('edit.contrast'), -100, 100),
      'adjust.saturation': () => slider('adjust', 'saturation', t('edit.saturation'), -100, 100),
      'adjust.hue': () => slider('adjust', 'hue', t('edit.hue'), -180, 180, 1, (v) => `${v}°`),
      'adjust.temperature': () => slider('adjust', 'temperature', t('edit.temperature'), -100, 100),
      'adjust.effectAmount': () => slider('adjust', 'effectAmount', `${t(`effect.${edit.adjust.effect}`)} — ${t('edit.effectAmount')}`, 0, 100),
      'detail.blur': () => slider('detail', 'blur', t('edit.blur'), 0, 50),
      'detail.sharpen': () => slider('detail', 'sharpen', t('edit.sharpen'), 0, 200),
      'fx.vignette': () => slider('fx', 'vignette', t('edit.vignette'), -100, 100),
      'fx.grain': () => slider('fx', 'grain', t('edit.grain'), 0, 100),
      'fx.emboss': () => h('label.check', h('input', { type: 'checkbox', checked: Boolean(edit.fx.emboss), onchange: (ev) => change((e) => { e.fx.emboss = ev.target.checked; }, t('edit.emboss')) }), t('edit.emboss')),
      'adjust.highlights': () => slider('adjust', 'highlights', t('edit.highlights'), -100, 100),
      'adjust.shadows': () => slider('adjust', 'shadows', t('edit.shadows'), -100, 100),
      'adjust.whites': () => slider('adjust', 'whites', t('edit.whites'), -100, 100),
      'adjust.blacks': () => slider('adjust', 'blacks', t('edit.blacks'), -100, 100),
      'adjust.tint': () => slider('adjust', 'tint', t('edit.tint'), -100, 100),
      'adjust.vibrance': () => slider('adjust', 'vibrance', t('edit.vibrance'), -100, 100),
      'detail.clarity': () => slider('detail', 'clarity', t('edit.clarity'), 0, 100),
      'tone.dehaze': () => slider('tone', 'dehaze', t('edit.dehaze'), -100, 100),
      'tone.splitTone': () => h('div', ...splitToneRows()),
      'lut': () => sliderRow(`${t(`lut.${edit.lut?.id}`)} — ${t('lut.amount')}`, 0, 100, 1, () => edit.lut?.amount ?? 0, (v) => { if (edit.lut) edit.lut.amount = v; }, undefined, 'lut.amount'),
      'fx.edges': () => h('label.check', h('input', { type: 'checkbox', checked: Boolean(edit.fx.edges), onchange: (ev) => change((e) => { e.fx.edges = ev.target.checked; }, t('edit.edges')) }), t('edit.edges')),
    };
    const rows = lookTouches(id).map((key) => SPECS[key]?.()).filter(Boolean);
    // The look's special effects and miniature blur, with their own parameters.
    for (const effect of edit.effects) {
      for (const [key, spec] of Object.entries(EFFECTS[effect.id]?.params ?? {})) {
        if (typeof spec.min !== 'number' || key === 'seed') continue;
        rows.push(sliderRow(`${t(`fx.${effect.id}`)} — ${t(`fxParam.${key}`)}`, spec.min, spec.max, spec.max - spec.min <= 2 ? 0.01 : 1, () => effect.params?.[key] ?? spec.default, (v) => { effect.params = { ...(effect.params ?? {}), [key]: v }; }, undefined, `look.fx.${effect.id}.${key}`));
      }
    }
    if (edit.tilt) rows.push(sliderRow(t('edit.tiltShift'), 0, 100, 1, () => edit.tilt.blur, (v) => { edit.tilt.blur = v; }, undefined, 'look.tilt'));
    const fine = h('div.look-fine', { hidden: !lookFineOpen }, amount, ...rows);
    const toggle = h('button.look-fine-toggle', {
      type: 'button', id: 'look-fine-toggle', title: t(lookFineOpen ? 'catalog.collapse' : 'catalog.expand'),
      'aria-expanded': lookFineOpen ? 'true' : 'false',
      onclick: () => { lookFineOpen = !lookFineOpen; buildPanel(); },
    }, h('span.arrow', { html: icon(lookFineOpen ? 'chevronDown' : 'chevronRight') }), t('edit.lookFineTune'));
    return h(`div.look-tune${lookFineOpen ? '.open' : ''}`, { dataset: { lookActive: id } },
      h('div.look-tune-head', h('span.look-current', t('edit.lookCurrent', { name: t(`look.${id}`) }))),
      toggle,
      fine);
  }

  /** A small copy of the photo with look `id`, drawn into `canvas` (rendered in the background, a few at a time). */
  function paintLookThumb(id, canvas) {
    if (lookThumbs.source !== preview) { lookThumbs.source = preview; lookThumbs.done.clear(); lookThumbs.queue = []; }
    const done = lookThumbs.done.get(id);
    if (done) { canvas.width = done.width; canvas.height = done.height; context2d(canvas).drawImage(done, 0, 0); return; }
    lookThumbs.queue.push([id, canvas]);
  }
  function queueLookThumbs() {
    if (lookThumbs.timer || !lookThumbs.queue.length) return;
    const step = () => {
      lookThumbs.timer = null;
      if (!preview) { lookThumbs.queue = []; return; }
      const small = lookThumbs.small?.from === preview ? lookThumbs.small.canvas : scaledCanvas(preview, preview.width, preview.height, 112);
      lookThumbs.small = { from: preview, canvas: small };
      const until = performance.now() + 24;
      while (lookThumbs.queue.length && performance.now() < until) {
        const [id, canvas] = lookThumbs.queue.shift();
        if (!canvas.isConnected) continue;
        let done = lookThumbs.done.get(id);
        if (!done) {
          try { done = render(small, applyLook(defaultEdit(), id, 100), { scale: scale * (small.width / preview.width), skipOverlay: true }); } catch { continue; }
          lookThumbs.done.set(id, done);
        }
        canvas.width = done.width;
        canvas.height = done.height;
        context2d(canvas).drawImage(done, 0, 0);
      }
      if (lookThumbs.queue.length) lookThumbs.timer = setTimeout(step, 0);
    };
    lookThumbs.timer = setTimeout(step, 0);
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
        h('button.btn.small', { type: 'button', disabled: !editClipboard.preset, onclick: () => { change((e) => Object.assign(e, applyPreset(e, editClipboard.preset)), t('edit.pasteSettings')); buildPanel(); } }, t('edit.pasteSettings')),
        h('button.btn.small', { type: 'button', id: 'record-action-step', title: t('actions.recordHint'), onclick: async () => { const { recordEditStep } = await import('./actions.js'); await recordEditStep(edit); } }, h('span', { html: icon('play') }), t('actions.record'))),
      list.length ? '' : h('div.cat-empty', t('edit.noPresets')),
      ...list.map((preset) => h('div.cat-row', { role: 'button', dataset: { preset: preset.name }, onclick: () => { change((e) => Object.assign(e, applyPreset(e, preset.edit)), preset.name); buildPanel(); } },
        h('span.cat-icon', { html: icon('bookmark') }), h('span.cat-label', preset.name),
        h('button.tool.small', { type: 'button', title: t('common.delete'), html: icon('close'), onclick: (e) => { e.stopPropagation(); app.catalog.deletePreset(preset.name); saveCatalogSoon(); buildPanel(); } }))));
  }

  function historyPanel() {
    const rows = [h('div.cat-row', { role: 'button', dataset: { history: '0' }, onclick: () => goToHistory(0) }, h('span.cat-icon', { html: icon('image') }), h('span.cat-label', t('edit.historyOpen')))];
    undo.forEach((entry, i) => rows.push(h(`div.cat-row${i === undo.length - 1 ? '.active' : ''}`, { role: 'button', dataset: { history: String(i + 1) }, onclick: () => goToHistory(i + 1) }, h('span.cat-count', String(i + 1)), h('span.cat-label', entry.label))));
    return h('div', h('div.hint', t('edit.historyHint')), ...rows, snapshotsBox());
  }

  // ───────── snapshots: named states of this photo's edit, kept in the catalog

  const snapshots = () => app.catalog.get(item.path)?.snapshots ?? [];
  function snapshotsBox() {
    const list = snapshots();
    const rows = list.map((snap, i) => h('div.cat-row', { role: 'button', dataset: { snapshot: String(i) }, title: t('edit.snapshotRestore'), onclick: () => restoreSnapshot(i) },
      h('span.cat-icon', { html: icon('camera') }), h('span.cat-label', snap.name), h('span.cat-count', formatDateTime(snap.time)),
      h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), dataset: { deleteSnapshot: String(i) }, onclick: (event) => { event.stopPropagation(); app.catalog.setSnapshots(item.path, list.filter((_, j) => j !== i)); buildPanel(); } })));
    return h('div.snapshots', h('div.edit-subhead', t('edit.snapshots')),
      h('div.hint', t('edit.snapshotsHint')),
      ...rows,
      h('div.row-buttons', h('button.btn.small', { type: 'button', id: 'take-snapshot', onclick: takeSnapshot }, h('span', { html: icon('camera') }), t('edit.snapshotTake'))));
  }
  async function takeSnapshot() {
    const name = await promptDialog(t('edit.snapshotName'), t('edit.snapshotDefault', { n: snapshots().length + 1 }), { title: t('edit.snapshotTake') });
    if (!name?.trim()) return;
    app.catalog.setSnapshots(item.path, [...snapshots(), { name: name.trim(), time: Date.now(), edit: clone(edit) }]);
    toast(t('edit.snapshotTaken', { name: name.trim() }), 'success');
    buildPanel();
  }
  function restoreSnapshot(i) {
    const snap = snapshots()[i];
    if (!snap) return;
    change((e) => { const next = normalizeEdit(clone(snap.edit)); for (const key of Object.keys(e)) delete e[key]; Object.assign(e, next); }, `${t('edit.snapshotRestore')}: ${snap.name}`);
    buildPanel();
  }

  // ───────── LUT: a .cube file or a built-in look, with an amount

  function lutPanel() {
    const library = app.settings.luts ?? [];
    const options = [['', t('lut.none')], ...BUILTIN_LUTS.map((id) => [id, t(`lut.${id}`)]), ...library.map((x) => [x.id, x.name])];
    const choose = selectEl(options, edit.lut?.id ?? '', async (id) => {
      if (!id) { change((e) => { e.lut = null; }, t('edit.lut')); buildPanel(); return; }
      const name = options.find((o) => o[0] === id)?.[1] ?? id;
      const next = { id, name, amount: edit.lut?.amount ?? 100 };
      try { await prepareEdit({ lut: next }); } catch (error) { toast(errorText(error), 'error'); return; }
      change((e) => { e.lut = next; }, t('edit.lut'));
      buildPanel();
    });
    choose.dataset.key = 'lut';
    const amount = edit.lut ? sliderRow(t('lut.amount'), 0, 100, 1, () => edit.lut?.amount ?? 100, (v) => { if (edit.lut) edit.lut.amount = v; }, (v) => `${v}%`, 'lut.amount') : '';
    return h('div', field(t('lut.choose'), choose), amount,
      h('div.row-buttons', h('button.btn.small', { type: 'button', id: 'import-lut', onclick: importLutFile }, h('span', { html: icon('download') }), t('lut.import'))),
      h('div.hint', t('lut.hint')));
  }
  async function importLutFile() {
    let files = [];
    if (isDesktop()) {
      const paths = await chooseFiles([{ name: 'LUT (.cube)', extensions: ['cube'] }], parentOf(item.path));
      for (const path of paths) files.push({ name: path.split(/[\\/]/).pop(), text: new TextDecoder().decode(await fs.read(path)) });
    } else {
      files = await new Promise((resolve) => {
        const input = h('input', { type: 'file', accept: '.cube', multiple: true, style: { display: 'none' } });
        input.addEventListener('change', async () => { const out = []; for (const f of input.files) out.push({ name: f.name, text: await f.text() }); input.remove(); resolve(out); });
        document.body.append(input);
        input.click();
      });
    }
    let last = null;
    for (const file of files) {
      try {
        const name = file.name.replace(/\.cube$/i, '');
        const entry = await importLut(name, file.text);
        app.settings.luts = [...(app.settings.luts ?? []).filter((x) => x.id !== entry.id), { id: entry.id, name }];
        app.saveSettings();
        last = entry;
      } catch (error) {
        toast(`${file.name}: ${errorText(error)}`, 'error', 6000);
      }
    }
    if (!last) return;
    change((e) => { e.lut = { id: last.id, name: last.name, amount: 100 }; }, t('edit.lut'));
    toast(t('lut.imported', { name: last.name }), 'success');
    buildPanel();
  }

  function autoFix() {
    change((e) => {
      e.adjust.levels = autoLevels(context2d(preview, { willReadFrequently: true }).getImageData(0, 0, preview.width, preview.height));
      e.adjust.vibrance = Math.max(e.adjust.vibrance, 15);
      e.adjust.contrast = Math.max(e.adjust.contrast, 8);
    }, t('edit.auto'));
    buildPanel();
  }

  // ───────── left panel: title, icon, and a right-aligned "<" / ">" fold

  function editorPane() {
    if (!app.settings.editor) app.settings.editor = { panel: true, panelCollapsed: false, info: true, infoCollapsed: false };
    return app.settings.editor;
  }

  /** Fold to a strip ("<") or open it (">"). The toolbar button shows the open panel. */
  function setEditorPane(change) {
    Object.assign(editorPane(), change);
    app.saveSettings();
    layoutSide();
    layoutInfo();
    updateBar();
    requestAnimationFrame(() => { fitCanvas(); drawOverlay(); });
  }

  function showEditorPane() {
    setEditorPane({ panel: true, panelCollapsed: false });
  }

  function layoutSide() {
    const pane = editorPane();
    const collapsed = pane.panel && pane.panelCollapsed;
    side.hidden = !pane.panel;
    side.classList.toggle('collapsed', collapsed);
    sideBody.hidden = !pane.panel || collapsed;
    clear(sideHead);
    if (!pane.panel) return;
    const title = t('mode.edit');
    if (collapsed) {
      sideHead.append(
        h('button.pane-fold', { type: 'button', title: t('pane.expand'), dataset: { fold: 'edit' }, onclick: showEditorPane }, '>'),
        h('div.pane-strip-title', { title }, h('span', { html: icon('sliders') }), h('span.pane-strip-text', title)));
      return;
    }
    sideHead.append(
      h('span.pane-head-icon', { html: icon('sliders') }),
      h('span.pane-head-title', title),
      h('button.pane-fold', { type: 'button', title: t('pane.collapse'), dataset: { fold: 'edit' }, onclick: () => setEditorPane({ panelCollapsed: true }) }, '<'));
  }

  function showInfoPane() {
    setEditorPane({ info: true, infoCollapsed: false });
  }

  /** Right panel. The fold button stays on the right: ">" folds, "<" opens. */
  function layoutInfo() {
    const pane = editorPane();
    const collapsed = pane.info && pane.infoCollapsed;
    infoPane.hidden = !pane.info;
    infoPane.classList.toggle('collapsed', collapsed);
    infoBody.hidden = !pane.info || collapsed;
    clear(infoHead);
    if (!pane.info) return;
    const title = t('view.info');
    if (collapsed) {
      infoHead.append(
        h('button.pane-fold', { type: 'button', title: t('pane.expand'), dataset: { fold: 'info' }, onclick: showInfoPane }, '<'),
        h('div.pane-strip-title', { title }, h('span', { html: icon('info') }), h('span.pane-strip-text', title)));
      return;
    }
    infoHead.append(
      h('span.pane-head-icon', { html: icon('info') }),
      h('span.pane-head-title', title),
      h('button.pane-fold', { type: 'button', title: t('pane.collapse'), dataset: { fold: 'info' }, onclick: () => setEditorPane({ infoCollapsed: true }) }, '>'));
  }

  function infoTable(rows) {
    const kept = rows.filter(([, value]) => value != null && value !== '');
    if (!kept.length) return null;
    return h('table.prop-table', kept.map(([key, value, id]) => h('tr',
      h('th', key),
      value instanceof Node ? h('td', value) : h('td', { title: String(value), ...(id ? { dataset: { info: id } } : {}) }, String(value)))));
  }

  function infoSection(title, body) {
    return body ? h('section.viewer-info-section', h('div.viewer-info-head', title), body) : null;
  }

  function metaWritable() {
    return Boolean(original && isJpeg(original) && fs.caps.write && !fs.isReadOnly?.(item.path));
  }

  function stamp(ms) {
    const date = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  /** One metadata value. Commits when the field loses focus or Enter is pressed. */
  function metaInput(group, name, value) {
    const text = value == null ? '' : String(value);
    const input = h('input.input.meta-input', { type: 'text', value: text, spellcheck: false, title: name, dataset: { saved: text, group, name } });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); input.value = input.dataset.saved; input.blur(); }
    });
    input.addEventListener('change', () => saveMetaField(input));
    return input;
  }

  async function saveMetaField(input) {
    const next = input.value.trim();
    if (next === input.dataset.saved) return;
    infoScroll = infoBody.scrollTop;
    try {
      const bytes = editMetadataField(original, input.dataset.group, input.dataset.name, next);
      await fs.write(item.path, bytes);
      original = bytes;
      thumbs.invalidate(item.path);
      const summary = (await readMetadata(bytes)).summary;
      const [stat] = await fs.stat([item.path]).catch(() => [null]);
      app.catalog.setInfo(item.path, { size: stat?.size ?? item.size, modified: stat?.modified ?? item.modified, meta: summary });
      if (stat?.size) item.size = stat.size;
      if (stat?.modified) item.modified = stat.modified;
      saveCatalogSoon();
      fillInfo();
      infoBody.scrollTop = infoScroll;
    } catch (error) {
      input.value = input.dataset.saved;
      toast(/^(number|date|gps|readonly)$/.test(error.message) ? t('exifEdit.badValue') : errorText(error), 'error', 5000);
    }
  }

  function fillGroups(box, groups) {
    clear(box);
    if (!groups?.length) { box.textContent = t('exif.none'); return; }
    const writable = metaWritable();
    for (const group of groups) {
      const name = t(`metaGroup.${group.id}`);
      box.append(h('div.prop-group', name === `metaGroup.${group.id}` ? String(group.id).toUpperCase() : name),
        h('table.prop-table.small', group.tags.map(([k, v, raw]) => {
          const editable = writable && metadataFieldEditable(group.id, k);
          return h('tr', h('th', { title: k }, k), editable
            ? h('td', metaInput(group.id, k, raw ?? v))
            : h('td', { title: String(v) }, String(v)));
        })));
    }
  }

  /** File, shooting data, and every metadata group read from the open picture. */
  function fillInfo() {
    const token = ++infoToken;
    clear(infoBody);
    if (!item) { infoBody.append(h('div.prop-empty', t('prop.nothingSelected'))); return; }
    const record = app.catalog.get(item.path) ?? {};
    const m = record.meta ?? {};
    const folder = item.path.slice(0, Math.max(0, item.path.length - item.name.length - 1));
    const out = full ? layout(full.width, full.height, edit.geometry) : null;
    const dims = full ? formatDims(full.width, full.height) : formatDims(record.width, record.height);
    const output = out && full && (out.width !== full.width || out.height !== full.height) ? `${dims} → ${formatDims(out.width, out.height)}` : dims;
    infoBody.append(h('div.info-name', item.name));
    if (fs.isReadOnly?.(item.path)) infoBody.append(h('div.meta-readonly', t('exifEdit.readOnly')));
    infoBody.append(infoSection(t('prop.file'), infoTable([
      [t('prop.type'), fullHigh ? `${badgeOf(item.name)} · ${t('edit.highBit')}` : badgeOf(item.name)],
      [t('prop.folder'), folder],
      [t('prop.size'), formatBytes(item.size)],
      [t('prop.dimensions'), output, 'dims'],
      [t('prop.duration'), formatDuration(m.duration)],
      [t('prop.modified'), formatDateTime(item.modified)],
      [t('prop.created'), item.created && item.created !== item.modified ? formatDateTime(item.created) : ''],
      ['ICC', colorProfile],
    ])));
    const exposure = [m.exposure ? formatExposure(m.exposure) : '', m.fNumber ? `f/${m.fNumber}` : '', m.iso ? `ISO ${m.iso}` : '', m.bias ? `${m.bias > 0 ? '+' : ''}${m.bias} EV` : ''].filter(Boolean).join('   ');
    const writable = metaWritable();
    const exposureFields = writable && (m.exposure || m.fNumber || m.iso)
      ? h('div.meta-fields',
        m.exposure ? metaInput('exif', 'ExposureTime', m.exposure < 1 ? `1/${Math.round(1 / m.exposure)}` : String(m.exposure)) : null,
        m.fNumber ? metaInput('exif', 'FNumber', String(m.fNumber)) : null,
        m.iso ? metaInput('exif', 'ISO', String(m.iso)) : null,
        m.bias ? metaInput('exif', 'ExposureCompensation', String(m.bias)) : null)
      : exposure;
    const cameraFields = writable && (m.make || m.model) ? h('div.meta-fields', metaInput('image', 'Make', m.make ?? ''), metaInput('image', 'Model', m.model ?? '')) : m.camera;
    const gpsFields = writable && m.lat != null
      ? h('div.meta-fields', metaInput('gps', 'latitude', String(m.lat)), metaInput('gps', 'longitude', String(m.lon)), m.alt != null ? metaInput('gps', 'GPSAltitude', String(m.alt)) : null)
      : (m.lat != null ? `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}${m.alt != null ? ` · ${m.alt} m` : ''}` : '');
    const shooting = infoTable([
      [t('exif.taken'), writable && m.taken ? metaInput('exif', 'DateTimeOriginal', stamp(m.taken)) : formatDateTime(m.taken)],
      [t('exif.camera'), cameraFields],
      [t('exif.lens'), writable && m.lens ? metaInput('exif', 'LensModel', m.lens) : m.lens],
      [t('exif.exposure'), exposureFields],
      [t('exif.focal'), writable && m.focal ? metaInput('exif', 'FocalLength', String(m.focal)) : (m.focal ? `${m.focal} mm${m.focal35 ? ` (35mm: ${m.focal35} mm)` : ''}` : '')],
      [t('exif.flash'), m.flash == null ? '' : m.flash ? t('exif.flashOn') : t('exif.flashOff')],
      [t('exif.gps'), gpsFields],
      [t('exif.location'), [m.city, m.country].filter(Boolean).join(', ')],
      [t('exif.software'), writable && m.software ? metaInput('image', 'Software', m.software) : m.software],
      [t('exif.artist'), writable && m.artist ? metaInput('image', 'Artist', m.artist) : m.artist],
      [t('exif.copyright'), writable && m.copyright ? metaInput('image', 'Copyright', m.copyright) : m.copyright],
      [t('exif.description'), writable && m.caption ? metaInput('image', 'ImageDescription', m.caption) : m.caption],
    ]);
    if (shooting) infoBody.append(infoSection(t('prop.exif'), shooting));
    const notes = [];
    if (record.title) notes.push([t('organize.title'), record.title]);
    if (record.caption) notes.push([t('organize.caption'), record.caption]);
    if (record.keywords?.length) notes.push([t('organize.keywords'), record.keywords.join(', ')]);
    if (notes.length) infoBody.append(infoSection(t('prop.organize'), infoTable(notes)));
    if (!original) return;
    const metaBox = h('div.prop-all', t('list.loading'));
    infoBody.append(infoSection(t('prop.allMetadata'), metaBox));
    const bytes = original;
    readMetadata(bytes, { groups: true }).then(({ groups }) => {
      if (token !== infoToken || !metaBox.isConnected) return;
      fillGroups(metaBox, groups);
      infoBody.scrollTop = infoScroll;
    }).catch(() => { if (token === infoToken && metaBox.isConnected) metaBox.textContent = t('exif.none'); });
  }

  // ───────── toolbar

  function updateBar() {
    clear(bar);
    const dirty = !isEmptyEdit(edit) || fromOriginal;
    const paneOpen = editorPane().panel && !editorPane().panelCollapsed;
    const infoShown = editorPane().info && !editorPane().infoCollapsed;
    bar.append(
      h('div.editor-bar-side',
        h('div.tool-group',
          button('panelLeft', t('toolbar.leftPane'), () => (paneOpen ? setEditorPane({ panelCollapsed: true }) : showEditorPane()), { title: paneOpen ? t('pane.collapse') : t('pane.expand'), className: paneOpen ? 'on' : '', id: 'edit-panel-toggle' }),
          button('panelRight', t('toolbar.rightPane'), () => (infoShown ? setEditorPane({ infoCollapsed: true }) : showInfoPane()), { title: infoShown ? t('pane.collapse') : t('pane.expand'), className: infoShown ? 'on' : '', id: 'edit-info-toggle' })),
        h('div.tool-group',
          h('button.btn.primary', { type: 'button', id: 'edit-save', disabled: !dirty || busy, onclick: () => save(false) }, h('span', { html: icon('save') }), t('edit.save')),
          button('saveAs', t('edit.saveAs'), () => save(true), { id: 'edit-save-as', title: `${t('edit.saveAs')} (${keyOf({ id: 'edit:saveAs', key: 'Ctrl+Shift+S' })})`, disabled: busy }),
          h('button.btn', { type: 'button', id: 'edit-cancel', onclick: cancel }, t('edit.done'))),
        h('div.tool-group',
          button('undo', t('edit.undo'), doUndo, { title: `${t('edit.undo')} (Ctrl+Z)`, disabled: !undo.length }),
          button('redo', t('edit.redo'), doRedo, { title: `${t('edit.redo')} (Ctrl+Y)`, disabled: !redo.length })),
        h('div.tool-group',
          button('beforeAfter', t('edit.beforeAfter'), () => { before = !before; updateBar(); draw(); }, { className: before ? 'on' : '', id: 'edit-before', title: `${t('edit.beforeAfter')} (B)` }),
          button('resetAll', t('edit.resetAll'), resetAll, { id: 'edit-reset', title: t('edit.resetAll'), disabled: isEmptyEdit(edit) })),
        h('div.tool-group',
          button('square', t('edit.snipRect'), () => setTool('sniprect'), { className: tool === 'sniprect' ? 'on' : '', id: 'tool-sniprect', title: `${t('edit.snipRect')} (${snipShortcut('edit:snipRect')})` }),
          button('ellipse', t('edit.snipEllipse'), () => setTool('snipellipse'), { className: tool === 'snipellipse' ? 'on' : '', id: 'tool-snipellipse', title: `${t('edit.snipEllipse')} (${snipShortcut('edit:snipEllipse')})` }),
          button('circle', t('edit.snipCircle'), () => setTool('snipcircle'), { className: tool === 'snipcircle' ? 'on' : '', id: 'tool-snipcircle', title: `${t('edit.snipCircle')} (${snipShortcut('edit:snipCircle')})` }),
          button('lasso', t('edit.snipFree'), () => setTool('snipfree'), { className: tool === 'snipfree' ? 'on' : '', id: 'tool-snipfree', title: `${t('edit.snipFree')} (${snipShortcut('edit:snipFree')})` }),
          button('copy', t('edit.snipCopy'), () => copySnip(false), { id: 'snip-copy', title: `${t('edit.snipCopy')} (${snipShortcut('edit:snipCopy')})`, disabled: !snipDraft?.ready || removing }),
          button('scissors', t('edit.snipCut'), () => copySnip(true), { id: 'snip-cut', title: `${t('edit.snipCut')} (${snipShortcut('edit:snipCut')})`, disabled: !snipDraft?.ready || removing }),
          button('removeBg', t('edit.background'), applyBackground, { id: 'bg-apply-bar', title: backgroundSelection() ? t('edit.bgPending') : t('edit.bgDraw'), disabled: removing || !backgroundSelection() })),
        h('div.tool-group',
          button('fit', t('view.fit'), () => setFit(), { title: `${t('view.fit')} (/)`, id: 'edit-zoom-fit' })),
        h('div.editor-zoom',
          button('zoomOut', t('view.zoomOut'), () => zoomStep(-1), { title: `${t('view.zoomOut')} (-)`, id: 'edit-zoom-out' }),
          h('span.zoom-value', { id: 'edit-zoom', title: t('view.zoomLevel') }, zoomText()),
          button('zoomIn', t('view.zoomIn'), () => zoomStep(1), { title: `${t('view.zoomIn')} (+)`, id: 'edit-zoom-in' })),
        busy ? h('span.busy', t('edit.saving')) : null));
    layoutSide();
    layoutInfo();
  }

  function resetAll() {
    commit(t('edit.resetAll'));
    edit = defaultEdit();
    look = null;
    tool = null;
    bgDraft = null;
    snipDraft = null;
    buildPanel();
    draw();
    updateBar();
  }

  async function cancel() {
    if (!(await confirmLeave())) return;
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

  const changePrefix = () => saveNamePrefix(undo.map((entry) => entry.label), t('edit.savePrefix'));

  async function save(_asNew, { stay = false } = {}) {
    if (busy) return false;
    const ext = extensionOf(item.name);
    let target = item.path;
    const cutout = Boolean(edit.background?.selection);
    const transparent = cutout || Boolean(edit.cuts?.length);
    const originalFormat = outputFormatFor(item.name)?.id ?? 'jpeg';
    let format = originalFormat;
    // JPEG cannot keep a transparent hole. PNG and WebP can.
    if (transparent && format !== 'png' && format !== 'webp') format = 'png';
    if (!transparent && fullHigh && (format === 'png' || format === 'tiff')) format = `${format}16`; // a 16-bit file stays 16-bit
    let quality = app.settings.jpegQuality / 100;
    // An edit is saved under a new name. The dialog suggests a prefix from the changes, and the name can be edited.
    const choice = await saveAsDialog(transparent ? format : (rawMode ? 'jpeg' : format), { transparent });
    if (!choice) return false;
    ({ format, quality } = choice);
    const spec = OUTPUT_FORMATS.find((f) => f.id === format);
    const suggested = choice.name;
    if (isDesktop() && !fs.isReadOnly?.(item.path)) {
      target = await chooseSavePath(joinPath(parentOf(item.path), suggested), [{ name: spec.label, extensions: [spec.ext] }]);
      if (!target) return false;
    } else {
      target = joinPath(parentOf(item.path), suggested);
    }
    busy = true;
    updateBar();
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      await prepareEdit(edit);
      if (cutout && isNeuralAlgorithm(edit.background.algorithm)) {
        const bare = render(full, edit, { scale: 1, skipBackground: true, layerImages, high: fullHigh });
        const base = context2d(bare, { willReadFrequently: true }).getImageData(0, 0, bare.width, bare.height);
        const normalized = normalizeBackground(edit.background);
        await prepareNeuralMask({ width: base.width, height: base.height, data: base.data }, selectionToPixels(normalized.selection, base.width, base.height), normalized.algorithm);
      }
      let output = render(full, edit, { scale: 1, layerImages, high: fullHigh });
      if (cutout) {
        const pixels = context2d(output, { willReadFrequently: true }).getImageData(0, 0, output.width, output.height);
        output = canvasFromImageData(cropToObject(pixels));
      }
      // 16-bit output: the precise result when the edit is tone / colour only, else the 8-bit one widened.
      let precise = null;
      if (OUTPUT_FORMATS.find((x) => x.id === format)?.deep && fullHigh && isEmptyEdit({ ...edit, adjust: DEFAULT_ADJUST }) && fullHigh.width === output.width && fullHigh.height === output.height) {
        precise = { width: fullHigh.width, height: fullHigh.height, data: new Float32Array(fullHigh.data) };
        applyAdjustments(precise, edit.adjust);
      }
      const sourceIsJpeg = ['jpg', 'jpeg', 'jpe', 'jfif'].includes(ext);
      const bytes = await encodeCanvas(output, format, { quality, original: sourceIsJpeg ? original : null, high: precise });
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
      cutoutNeedsSave = false;
      savedRevision = revision;
      app.emit('edited', target);
      if (stay) { updateBar(); return true; }
      close();
      await reload();
      return true;
    } catch (error) {
      busy = false;
      updateBar();
      if (String(error?.message || error) === 'cancelled') return false;
      toast(t('edit.saveFailed', { error: errorText(error) }), 'error', 7000);
      return false;
    }
  }

  async function saveAsDialog(defaultFormat, { transparent = false } = {}) {
    const formats = transparent ? OUTPUT_FORMATS.filter((f) => f.id === 'png' || f.id === 'webp') : OUTPUT_FORMATS;
    const specOf = (id) => formats.find((f) => f.id === id) ?? formats[0];
    const knownExt = (ext) => formats.some((f) => f.ext === ext || f.id === ext || f.aliases?.includes(ext));
    const suggestedStem = `${changePrefix()}_${stemOf(item.name)}`;
    const withExtension = (value, spec) => {
      const trimmed = String(value ?? '').trim();
      const ext = extensionOf(trimmed);
      const stem = knownExt(ext) ? trimmed.slice(0, -(ext.length + 1)) : trimmed;
      return `${stem || suggestedStem}.${spec.ext}`;
    };
    const name = h('input.input', {
      type: 'text', id: 'edit-save-name', autofocus: true, spellcheck: 'false', autocomplete: 'off',
      value: withExtension(suggestedStem, specOf(defaultFormat)),
    });
    name.addEventListener('focus', () => name.select());
    const format = selectEl(formats.map((f) => [f.id, f.label]), specOf(defaultFormat).id, (id) => { name.value = withExtension(name.value, specOf(id)); });
    const quality = h('input.slider', { type: 'range', min: 10, max: 100, value: app.settings.jpegQuality });
    const qualityValue = h('span.slider-value', String(app.settings.jpegQuality));
    quality.addEventListener('input', () => { qualityValue.textContent = quality.value; });
    const body = h('div',
      field(t('edit.fileName'), name),
      field(t('edit.format'), format),
      h('div.slider-row', h('div.slider-head', h('span', t('edit.quality')), qualityValue), quality));
    const ok = await openDialog({ title: t('edit.saveAs'), body, width: 480, buttons: [{ label: t('common.cancel'), value: false }, { label: t('edit.save'), value: true, primary: true }] });
    if (!ok) return null;
    const spec = specOf(format.value);
    const cleaned = name.value.trim().replace(/[\\/:*?"<>|]/g, '');
    return { format: format.value, quality: Number(quality.value) / 100, name: withExtension(cleaned, spec) };
  }

  // ───────── open

  async function loadSource(bytes, name) {
    fullHigh = null;
    colorProfile = '';
    if (isRaw(name) && rawMode) {
      try {
        const { developRaw } = await import('../formats/rawdevelop.js');
        return (await developRaw(bytes, { whiteBalance: rawMode })).source;
      } catch (error) {
        toast(t('edit.rawFallback', { error: errorText(error) }), 'info', 6000);
        rawMode = null;
      }
    }
    const decoded = await decodeImage(bytes, name, { high: true });
    fullHigh = decoded.high ?? null;
    colorProfile = decoded.profile || '';
    return decoded.source;
  }

  async function redevelop(mode) {
    rawMode = mode;
    canvasHolder.append(h('div.viewer-spinner', t('edit.developing')));
    full = await loadSource(original, item.name);
    preview = scaledCanvas(full, full.width, full.height, PREVIEW_MAX);
    scale = preview.width / full.width;
    draw();
  }

  async function open(target, intent) {
    item = target;
    edit = defaultEdit();
    look = null;
    lookFineOpen = false;
    undo = [];
    redo = [];
    tool = SNIP_TOOL_ALIAS[intent?.tool] ?? intent?.tool ?? null;
    bgDraft = null;
    bgChoice = null;
    snipDraft = null;
    lastSnip = null;
    cutoutNeedsSave = false;
    revision = 0;
    savedRevision = 0;
    before = false;
    viewFit = true;
    viewOffset = { x: 0, y: 0 };
    section = intent?.section ?? 'light';
    selectedLocal = -1;
    selectedLayer = -1;
    fromOriginal = false;
    colorProfile = '';
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
        for (const layer of edit.layers) if (layer.path) await loadLayerImage(layer.path).catch(() => {});
      }
      rawMode = isRaw(item.name) ? 'camera' : null;
      full = await loadSource(original, item.name);
      preview = scaledCanvas(full, full.width, full.height, PREVIEW_MAX);
      scale = preview.width / full.width;
      if (intent?.section) panelReveal = intent.section;
      buildPanel();
      updateBar();
      draw();
      fillInfo();
    } catch (error) {
      clear(canvasHolder);
      canvasHolder.append(h('div.viewer-error', h('span', { html: icon('warning') }), t('edit.cannotOpen', { error: errorText(error) })));
      fillInfo();
    }
  }

  const SNIP_COMMANDS = [
    { id: 'edit:snipRect', label: 'keys.edit.snipRect', key: 'R', run: () => setTool('sniprect') },
    { id: 'edit:snipEllipse', label: 'keys.edit.snipEllipse', key: 'E', run: () => setTool('snipellipse') },
    { id: 'edit:snipCircle', label: 'keys.edit.snipCircle', key: 'O', run: () => setTool('snipcircle') },
    { id: 'edit:snipFree', label: 'keys.edit.snipFree', key: 'L', run: () => setTool('snipfree') },
    { id: 'edit:snipCopy', label: 'keys.edit.snipCopy', key: 'Ctrl+C', run: () => copySnip(false) },
    { id: 'edit:snipCut', label: 'keys.edit.snipCut', key: 'Ctrl+X', run: () => copySnip(true) },
  ];

  // The editor's keys, as commands the user can reassign. Esc (cancel) and
  // Enter (apply the crop) stay fixed.
  registerCommands([
    { id: 'edit:save', label: 'keys.edit.save', key: 'Ctrl+S', run: () => save(false) },
    { id: 'edit:saveAs', label: 'keys.edit.saveAs', key: 'Ctrl+Shift+S', run: () => save(true) },
    { id: 'edit:undo', label: 'keys.edit.undo', key: 'Ctrl+Z', run: () => doUndo() },
    { id: 'edit:redo', label: 'keys.edit.redo', key: ['Ctrl+Y', 'Ctrl+Shift+Z'], run: () => doRedo() },
    { id: 'edit:copySettings', label: 'keys.edit.copySettings', key: 'Ctrl+Shift+C', run: () => { editClipboard.preset = presetOf(edit); toast(t('edit.settingsCopied'), 'info'); } },
    { id: 'edit:pasteSettings', label: 'keys.edit.pasteSettings', key: 'Ctrl+Shift+V', run: () => { if (editClipboard.preset) { change((e) => Object.assign(e, applyPreset(e, editClipboard.preset)), t('edit.pasteSettings')); buildPanel(); } } },
    { id: 'edit:before', label: 'keys.edit.before', key: 'B', run: () => { before = !before; updateBar(); draw(); } },
    { id: 'edit:zoomIn', label: 'keys.view.zoomIn', key: ['+', '='], run: () => zoomStep(1) },
    { id: 'edit:zoomOut', label: 'keys.view.zoomOut', key: '-', run: () => zoomStep(-1) },
    { id: 'edit:fit', label: 'keys.view.fit', key: '/', run: () => setFit() },
    { id: 'edit:actual', label: 'keys.view.actual', key: '*', run: () => setViewZoom(1) },
    { id: 'edit:snapshot', label: 'keys.edit.snapshot', key: 'Ctrl+Shift+N', run: () => takeSnapshot() },
    ...SNIP_COMMANDS,
  ], 'edit');

  function onKey(event) {
    if (removing) return true;
    if (typing(event) && !event.ctrlKey && !event.metaKey && !event.altKey) return false;
    if (typing(event) && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && ['a', 'c', 'x', 'v'].includes(event.key.toLowerCase())) return false;
    if (event.code === 'Space' && event.target?.tagName !== 'BUTTON') { spaceDown = true; return true; }
    if (event.key === 'Escape') { if (tool) cancelTool(); else cancel(); return true; }
    if (event.key === 'Enter' && tool === 'crop') { applyCrop(); return true; }
    const command = commandFor(event, 'edit');
    if (!command) return false;
    command.run();
    return true;
  }

  document.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });

  new ResizeObserver(() => { fitCanvas(); drawOverlay(); }).observe(canvasHolder);
  app.on('settings', () => { if (shown && SNIP_TOOLS.includes(tool)) drawOverlay(); });

  return {
    el, open, onKey,
    get dirty() { return needsSave(); },
    get removing() { return removing; },
    confirmLeave,
    get path() { return item?.path ?? null; },
    /** Test hooks: state and a few direct actions. */
    debug: () => ({ edit, scale, rawMode, fromOriginal, tool, snip: snipDraft, lastSnip, highBit: Boolean(fullHigh), history: undo.map((u) => u.label), preview: preview && { w: preview.width, h: preview.height }, full: full && { w: full.width, h: full.height } }),
    testing: {
      change: (fn, label = 'test') => change(fn, label),
      setSection: (id) => { section = id; buildPanel(); },
      setTool: (id) => setTool(id),
      copySelection: (cut = false) => copySnip(cut),
      addLayerPath,
      goToHistory,
      shown: () => shown,
    },
  };
}
