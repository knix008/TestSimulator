// Paint tools for the main window: they edit the selected caricature shown there.
// The original photo stays in the left panel and is not a paint target.
// Undo and redo live on the main toolbar.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';

const TOOLS = [
  ['select', 'paintSelect'],
  ['selectCircle', 'paintSelectCircle'],
  ['pencil', 'pencil'],
  ['brush', 'paintBrush'],
  ['marker', 'paintMarker'],
  ['crayon', 'paintCrayon'],
  ['spray', 'paintSpray'],
  ['eraser', 'clear'],
  ['fill', 'paintFill'],
  ['line', 'lineTool'],
  ['dash', 'paintDash'],
  ['curve', 'paintCurve'],
  ['arrow', 'paintArrow'],
  ['doubleArrow', 'paintDoubleArrow'],
  ['rect', 'rectTool'],
  ['roundRect', 'paintRoundRect'],
  ['ellipse', 'ellipseTool'],
  ['circle', 'paintCircle'],
  ['triangle', 'paintTriangle'],
  ['diamond', 'paintDiamond'],
  ['pentagon', 'paintPentagon'],
  ['star', 'paintStar'],
  ['heart', 'paintHeart'],
  ['fillRect', 'paintFillRect'],
  ['fillEllipse', 'paintFillEllipse'],
  ['fillCircle', 'paintFillCircle'],
  ['fillDiamond', 'paintFillDiamond'],
  ['fillPentagon', 'paintFillPentagon'],
  ['fillStar', 'paintFillStar'],
  ['fillHeart', 'paintFillHeart'],
  ['text', 'textTool'],
  ['picker', 'paintPicker'],
];
const COLORS = ['#111111', '#ffffff', '#8a8a8a', '#e23b4a', '#f08a24', '#f2c14e', '#3aa655', '#2f6fed', '#7a3ff2', '#e85aad', '#8d5a32', '#00a6a6', '#c2185b', '#c0ca33', '#9ad0f5', '#ffd1dc', '#b5f5c8', '#ffab91', '#4dd0e1', '#546e7a', '#37474f'];
const SHAPES = new Set(['line', 'dash', 'curve', 'arrow', 'doubleArrow', 'rect', 'roundRect', 'ellipse', 'circle', 'triangle', 'diamond', 'pentagon', 'star', 'heart', 'fillRect', 'fillEllipse', 'fillCircle', 'fillDiamond', 'fillPentagon', 'fillStar', 'fillHeart']);
const FILLED = new Set(['fillRect', 'fillEllipse', 'fillCircle', 'fillDiamond', 'fillPentagon', 'fillStar', 'fillHeart']);
const FREEHAND = new Set(['pencil', 'brush', 'marker', 'crayon', 'eraser', 'spray']);

const paint = { tool: 'brush', color: '#e23b4a', size: 12, text: '' };
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 12;
let boundId = null;
/** Rectangle or circle in picture pixels. Cutting uses it and leaves the picture the same size. */
let selection = null;

const toolButton = (id, glyph) => {
  const label = t(`paint.${id}`);
  return `<button type="button" class="paint-tool ${paint.tool === id ? 'active' : ''}" data-paint-tool="${id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${paint.tool === id}">${icon(glyph)}</button>`;
};

const cutButton = (mode, glyph) => {
  const label = t(mode === 'in' ? 'paint.cutIn' : 'paint.cutOut');
  return `<button type="button" class="paint-tool" data-paint-cut="${mode}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" disabled>${icon(glyph)}</button>`;
};

/** Tools, size and colour for the selected caricature in the main window. */
export function paintToolsHtml() {
  const swatches = COLORS.map((color) => `<button type="button" class="paint-swatch ${paint.color.toLowerCase() === color ? 'active' : ''}" data-paint-color="${color}" style="background:${color}" title="${color}" aria-label="${color}"></button>`).join('');
  return `<div class="paint-bar">
    <div class="paint-tools" role="toolbar">${TOOLS.map(([id, glyph]) => toolButton(id, glyph)).join('')}${cutButton('in', 'paintCutIn')}${cutButton('out', 'paintCutOut')}</div>
    <div class="paint-row">
      <span class="paint-label">${escapeHtml(t('paint.size'))}</span>
      <input id="paint-size" type="range" min="1" max="64" step="1" value="${paint.size}" aria-label="${escapeHtml(t('paint.size'))}" />
      <output id="paint-size-value" for="paint-size">${paint.size} px</output>
    </div>
    <div class="paint-colors">
      <span class="paint-swatches">${swatches}</span>
      <label class="paint-choose" title="${escapeHtml(t('paint.pickColor'))}">
        <input id="paint-color" type="color" value="${paint.color}" aria-label="${escapeHtml(t('paint.pickColor'))}" />
        <input id="paint-hex" class="text-field" type="text" value="${paint.color}" maxlength="7" spellcheck="false" aria-label="${escapeHtml(t('paint.pickColor'))}" />
      </label>
    </div>
    <label class="paint-text ${paint.tool === 'text' ? '' : 'hidden'}"><span>${escapeHtml(t('paint.text'))}</span><input id="paint-text" class="text-field" type="text" value="${escapeHtml(paint.text)}" maxlength="80" placeholder="${escapeHtml(t('paint.textPlaceholder'))}" /></label>
  </div>`;
}

/** Drops the paint undo stack (another caricature, or another photo). */
export function resetPaint() {
  undoStack.length = 0;
  redoStack.length = 0;
  boundId = null;
  selection = null;
}

export const canUndoPaint = () => undoStack.length > 0;
export const canRedoPaint = () => redoStack.length > 0;

const paintBar = () => document.querySelector('.paint-bar');
let controlsAbort = null;
/** The open paint canvas. Tool clicks in the left tab call into it. */
let paintSession = null;

function setPaintColor(color) {
  const hex = normalizeHex(color);
  if (!hex) return;
  paint.color = hex;
  const bar = paintBar();
  if (!bar) return;
  const input = bar.querySelector('#paint-color');
  const typed = bar.querySelector('#paint-hex');
  if (input) input.value = hex;
  if (typed && document.activeElement !== typed) typed.value = hex;
  for (const button of bar.querySelectorAll('[data-paint-color]')) button.classList.toggle('active', button.dataset.paintColor === hex);
}

/** Wires the tool buttons. The bar can be rebuilt without redrawing the picture. */
export function attachPaintControls() {
  controlsAbort?.abort();
  const bar = paintBar();
  if (!bar) return;
  controlsAbort = new AbortController();
  const { signal } = controlsAbort;
  bar.addEventListener('click', (event) => {
    const tool = event.target.closest('[data-paint-tool]');
    if (tool) {
      event.stopPropagation();
      paint.tool = tool.dataset.paintTool;
      const stage = document.querySelector('.paint-stage');
      if (stage) stage.dataset.tool = paint.tool;
      bar.querySelector('.paint-text')?.classList.toggle('hidden', paint.tool !== 'text');
      for (const button of bar.querySelectorAll('[data-paint-tool]')) {
        const on = button === tool;
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
      }
    }
    const swatch = event.target.closest('[data-paint-color]');
    if (swatch) { event.stopPropagation(); setPaintColor(swatch.dataset.paintColor); }
    const cut = event.target.closest('[data-paint-cut]');
    if (cut && !cut.disabled) { event.stopPropagation(); paintSession?.applyCut(cut.dataset.paintCut); }
  }, { signal });
  bar.querySelector('#paint-size')?.addEventListener('input', (event) => {
    paint.size = Number(event.target.value);
    const out = bar.querySelector('#paint-size-value');
    if (out) out.textContent = `${paint.size} px`;
  }, { signal });
  bar.querySelector('#paint-color')?.addEventListener('input', (event) => setPaintColor(event.target.value), { signal });
  bar.querySelector('#paint-hex')?.addEventListener('change', (event) => setPaintColor(event.target.value), { signal });
  bar.querySelector('#paint-text')?.addEventListener('input', (event) => { paint.text = event.target.value; }, { signal });
  paintSession?.syncSelection?.();
}

/**
 * Wires the paint canvas. `api.item()` is the selected caricature, `api.picture()` its canvas,
 * `api.commit(canvas)` stores the edited pixels, `api.onHistory()` refreshes the toolbar.
 */
export function mountPaint(host, api) {
  host._paintAbort?.abort();
  const item = api.item();
  const picture = api.picture();
  const canvas = host.querySelector('.paint-canvas');
  const overlay = host.querySelector('.paint-overlay');
  const frame = host.querySelector('.paint-frame');
  const stage = host.querySelector('.paint-stage');
  if (!item || !picture || !canvas || !stage || !frame) {
    host.dataset.paintLive = '';
    host.undoPaint = null;
    host.redoPaint = null;
    paintSession = null;
    attachPaintControls();
    return;
  }
  if (boundId !== item.id) resetPaint();
  boundId = item.id;
  canvas.width = picture.width;
  canvas.height = picture.height;
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const over = overlay.getContext('2d');
  ctx.drawImage(picture, 0, 0);
  stage.dataset.tool = paint.tool;

  const abort = new AbortController();
  host._paintAbort = abort;
  const { signal } = abort;
  host.dataset.paintLive = '1';

  let stroke = null;

  const pointOf = (event) => {
    const rect = frame.getBoundingClientRect();
    const x = rect.width ? ((event.clientX - rect.left) / rect.width) * canvas.width : 0;
    const y = rect.height ? ((event.clientY - rect.top) / rect.height) * canvas.height : 0;
    return {
      x: Math.max(0, Math.min(canvas.width - 1, x)),
      y: Math.max(0, Math.min(canvas.height - 1, y)),
    };
  };

  const brushWidth = () => {
    const rect = frame.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    return Math.max(1, paint.size * scale);
  };

  /** A point that can sit on the picture's edge, so a selection can cover the last pixel. */
  const edgePoint = (event) => {
    const rect = frame.getBoundingClientRect();
    const x = rect.width ? ((event.clientX - rect.left) / rect.width) * canvas.width : 0;
    const y = rect.height ? ((event.clientY - rect.top) / rect.height) * canvas.height : 0;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  };

  const boundsOf = (a, b) => {
    const x = Math.floor(Math.max(0, Math.min(a.x, b.x)));
    const y = Math.floor(Math.max(0, Math.min(a.y, b.y)));
    const right = Math.ceil(Math.min(canvas.width, Math.max(a.x, b.x)));
    const bottom = Math.ceil(Math.min(canvas.height, Math.max(a.y, b.y)));
    return { shape: 'rect', x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
  };

  /** The drag is the diameter, so the result is a circle. */
  const circleOf = (a, b) => ({
    shape: 'circle',
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    r: Math.hypot(b.x - a.x, b.y - a.y) / 2,
  });

  const areaOf = (tool, a, b) => (tool === 'selectCircle' ? circleOf(a, b) : boundsOf(a, b));
  const usable = (area) => Boolean(area) && (area.shape === 'circle' ? area.r >= 1 : area.w >= 2 && area.h >= 2);

  const traceSelection = (context, area) => {
    context.beginPath();
    if (area.shape === 'circle') context.arc(area.cx, area.cy, area.r, 0, Math.PI * 2);
    else context.rect(area.x, area.y, area.w, area.h);
  };

  const drawSelection = (area) => {
    over.clearRect(0, 0, overlay.width, overlay.height);
    if (!usable(area)) return;
    const weight = Math.max(1, canvas.width / Math.max(1, frame.getBoundingClientRect().width));
    over.save();
    over.lineWidth = weight;
    over.setLineDash([weight * 4, weight * 3]);
    over.strokeStyle = '#ffffff';
    traceSelection(over, area);
    over.stroke();
    over.strokeStyle = '#111111';
    over.lineDashOffset = weight * 4;
    traceSelection(over, area);
    over.stroke();
    over.restore();
  };

  const syncSelection = () => {
    const on = usable(selection);
    for (const button of paintBar()?.querySelectorAll('[data-paint-cut]') ?? []) button.disabled = !on;
    drawSelection(on ? selection : null);
  };

  /** `in` clears the shape. `out` clears every pixel outside it. The picture keeps its size. */
  const applyCut = (mode) => {
    if (!usable(selection)) return;
    remember();
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.globalCompositeOperation = mode === 'in' ? 'destination-out' : 'destination-in';
    traceSelection(ctx, selection);
    ctx.fill();
    ctx.restore();
    publish();
    drawSelection(selection);
    notifyHistory();
  };

  const publish = () => api.commit(canvas);
  const notifyHistory = () => api.onHistory?.();

  const remember = () => {
    undoStack.push(canvas.toDataURL('image/png'));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    notifyHistory();
  };

  paintSession = { applyCut, syncSelection };
  attachPaintControls();

  const restoreUrl = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawSelection(selection);
      resolve();
    };
    img.onerror = () => reject(new Error('paint.restore'));
    img.src = url;
  });

  const ink = () => paint.color;

  const trace = (context, from, to, width) => {
    if (paint.tool === 'spray') { spray(context, to, width); return; }
    context.save();
    const wide = paint.tool === 'marker';
    const blocky = paint.tool === 'pencil' || wide || paint.tool === 'crayon';
    if (wide) context.globalAlpha = 0.35;
    else if (paint.tool === 'crayon') context.globalAlpha = 0.85;
    if (paint.tool === 'eraser') context.globalCompositeOperation = 'destination-out';
    const strokeWidth = wide ? width * 2.6 : width;
    context.lineCap = blocky ? 'square' : 'round';
    context.lineJoin = 'round';
    context.strokeStyle = ink();
    context.fillStyle = paint.tool === 'eraser' ? 'rgba(0,0,0,1)' : ink();
    context.lineWidth = strokeWidth;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.beginPath();
    context.rect(to.x - strokeWidth / 2, to.y - strokeWidth / 2, strokeWidth, strokeWidth);
    if (!blocky) { context.beginPath(); context.arc(to.x, to.y, strokeWidth / 2, 0, Math.PI * 2); }
    context.fill();
    context.restore();
  };

  const drawShape = (context, tool, a, b, width) => {
    context.save();
    context.strokeStyle = ink();
    context.fillStyle = ink();
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = b.x - a.x;
    const h = b.y - a.y;
    const paintPath = () => { if (FILLED.has(tool)) context.fill(); else context.stroke(); };
    const polygon = (sides) => {
      const cx = x + Math.abs(w) / 2;
      const cy = y + Math.abs(h) / 2;
      const rx = Math.max(0.5, Math.abs(w) / 2);
      const ry = Math.max(0.5, Math.abs(h) / 2);
      for (let i = 0; i < sides; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / sides;
        const px = cx + Math.cos(angle) * rx;
        const py = cy + Math.sin(angle) * ry;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
    };
    context.beginPath();
    if (tool === 'line' || tool === 'dash') {
      if (tool === 'dash') context.setLineDash([Math.max(4, width * 2), Math.max(3, width * 1.4)]);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    } else if (tool === 'curve') {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      context.moveTo(a.x, a.y);
      context.quadraticCurveTo((a.x + b.x) / 2 - (dy / len) * len * 0.35, (a.y + b.y) / 2 + (dx / len) * len * 0.35, b.x, b.y);
      context.stroke();
    } else if (tool === 'arrow' || tool === 'doubleArrow') {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(width * 3, 8);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      const headAt = (tipX, tipY, dir) => {
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(tipX - head * Math.cos(dir - 0.4), tipY - head * Math.sin(dir - 0.4));
        context.lineTo(tipX - head * Math.cos(dir + 0.4), tipY - head * Math.sin(dir + 0.4));
        context.closePath();
        context.fill();
      };
      headAt(b.x, b.y, angle);
      if (tool === 'doubleArrow') headAt(a.x, a.y, angle + Math.PI);
    } else if (tool === 'rect' || tool === 'fillRect') {
      context.rect(x, y, Math.abs(w), Math.abs(h));
      if (FILLED.has(tool)) context.fill();
      else context.stroke();
    } else if (tool === 'roundRect') {
      const radius = Math.min(Math.abs(w), Math.abs(h), width * 3) / 2;
      if (typeof context.roundRect === 'function') context.roundRect(x, y, Math.abs(w), Math.abs(h), radius);
      else context.rect(x, y, Math.abs(w), Math.abs(h));
      context.stroke();
    } else if (tool === 'ellipse' || tool === 'fillEllipse') {
      context.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(0.5, Math.abs(w) / 2), Math.max(0.5, Math.abs(h) / 2), 0, 0, Math.PI * 2);
      paintPath();
    } else if (tool === 'circle' || tool === 'fillCircle') {
      context.arc((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(0.5, Math.hypot(w, h) / 2), 0, Math.PI * 2);
      paintPath();
    } else if (tool === 'triangle') {
      context.moveTo((a.x + b.x) / 2, y);
      context.lineTo(x + Math.abs(w), y + Math.abs(h));
      context.lineTo(x, y + Math.abs(h));
      context.closePath();
      context.stroke();
    } else if (tool === 'diamond' || tool === 'fillDiamond') {
      context.moveTo(x + Math.abs(w) / 2, y);
      context.lineTo(x + Math.abs(w), y + Math.abs(h) / 2);
      context.lineTo(x + Math.abs(w) / 2, y + Math.abs(h));
      context.lineTo(x, y + Math.abs(h) / 2);
      context.closePath();
      paintPath();
    } else if (tool === 'pentagon' || tool === 'fillPentagon') {
      polygon(5);
      paintPath();
    } else if (tool === 'star' || tool === 'fillStar') {
      const cx = x + Math.abs(w) / 2;
      const cy = y + Math.abs(h) / 2;
      const outerX = Math.max(0.5, Math.abs(w) / 2);
      const outerY = Math.max(0.5, Math.abs(h) / 2);
      for (let i = 0; i < 10; i += 1) {
        const outer = i % 2 === 0;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(angle) * outerX * (outer ? 1 : 0.42);
        const py = cy + Math.sin(angle) * outerY * (outer ? 1 : 0.42);
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      paintPath();
    } else if (tool === 'heart' || tool === 'fillHeart') {
      const left = x;
      const top = y;
      const bw = Math.abs(w);
      const bh = Math.abs(h);
      const cx = left + bw / 2;
      context.moveTo(cx, top + bh * 0.32);
      context.bezierCurveTo(left + bw * 0.15, top - bh * 0.05, left - bw * 0.05, top + bh * 0.45, cx, top + bh);
      context.bezierCurveTo(left + bw * 1.05, top + bh * 0.45, left + bw * 0.85, top - bh * 0.05, cx, top + bh * 0.32);
      context.closePath();
      paintPath();
    }
    context.restore();
  };

  const stampText = (at) => {
    const text = (paintBar()?.querySelector('#paint-text')?.value ?? paint.text).trim();
    if (!text) return false;
    paint.text = text;
    ctx.save();
    ctx.fillStyle = ink();
    ctx.font = `700 ${Math.max(14, brushWidth() * 2)}px "Segoe UI", "Malgun Gothic", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(text, at.x, at.y);
    ctx.restore();
    return true;
  };

  stage.addEventListener('dblclick', (event) => { event.stopPropagation(); }, { signal });

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const at = pointOf(event);
    if (paint.tool === 'picker') {
      const pixel = ctx.getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data;
      if (pixel[3] === 0) return;
      setPaintColor(`#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
      return;
    }
    if (paint.tool === 'text') {
      remember();
      if (!stampText(at)) undoStack.pop();
      else publish();
      notifyHistory();
      return;
    }
    if (paint.tool === 'select' || paint.tool === 'selectCircle') {
      try { stage.setPointerCapture(event.pointerId); } catch { /* the pointer can end before capture */ }
      const edge = edgePoint(event);
      stroke = { tool: paint.tool, from: edge, last: edge, width: 1 };
      selection = null;
      syncSelection();
      return;
    }
    try { stage.setPointerCapture(event.pointerId); } catch { /* the pointer can end before capture */ }
    remember();
    const width = brushWidth();
    if (paint.tool === 'fill') {
      const changed = floodFill(ctx, Math.round(at.x), Math.round(at.y), paint.color);
      if (!changed) undoStack.pop();
      else publish();
      notifyHistory();
      return;
    }
    stroke = { tool: paint.tool, from: at, last: at, width };
    if (FREEHAND.has(paint.tool)) trace(ctx, at, at, width);
    else {
      over.clearRect(0, 0, overlay.width, overlay.height);
      drawShape(over, paint.tool, at, at, width);
    }
  }, { signal });

  stage.addEventListener('pointermove', (event) => {
    if (!stroke) return;
    if (stroke.tool === 'select' || stroke.tool === 'selectCircle') {
      const edge = edgePoint(event);
      stroke.last = edge;
      drawSelection(areaOf(stroke.tool, stroke.from, edge));
      return;
    }
    const at = pointOf(event);
    if (FREEHAND.has(stroke.tool)) {
      trace(ctx, stroke.last, at, stroke.width);
      stroke.last = at;
      return;
    }
    over.clearRect(0, 0, overlay.width, overlay.height);
    drawShape(over, stroke.tool, stroke.from, at, stroke.width);
    stroke.last = at;
  }, { signal });

  const finish = (event) => {
    if (!stroke) return;
    if (stroke.tool === 'select' || stroke.tool === 'selectCircle') {
      const edge = event ? edgePoint(event) : stroke.last;
      const area = areaOf(stroke.tool, stroke.from, edge);
      selection = usable(area) ? area : null;
      stroke = null;
      syncSelection();
      return;
    }
    const at = event ? pointOf(event) : stroke.last;
    if (SHAPES.has(stroke.tool)) {
      over.clearRect(0, 0, overlay.width, overlay.height);
      drawShape(ctx, stroke.tool, stroke.from, at, stroke.width);
    }
    stroke = null;
    publish();
    drawSelection(selection);
  };
  stage.addEventListener('pointerup', finish, { signal });
  stage.addEventListener('pointercancel', finish, { signal });

  async function stepHistory(from, to) {
    const url = from.pop();
    if (!url) return false;
    to.push(canvas.toDataURL('image/png'));
    await restoreUrl(url);
    publish();
    notifyHistory();
    return true;
  }

  host.undoPaint = () => stepHistory(undoStack, redoStack);
  host.redoPaint = () => stepHistory(redoStack, undoStack);
  syncSelection();
}

/** Ctrl+Z / the toolbar Undo while the selected picture is open in the main window. */
export function undoPaint() {
  const host = document.querySelector('.paint-host[data-paint-live="1"]');
  return host?.undoPaint ? host.undoPaint() : false;
}

export function redoPaint() {
  const host = document.querySelector('.paint-host[data-paint-live="1"]');
  return host?.redoPaint ? host.redoPaint() : false;
}

function normalizeHex(color) {
  const text = String(color).trim().toLowerCase();
  const match = text.match(/^#?([0-9a-f]{6})$/);
  return match ? `#${match[1]}` : null;
}

function spray(context, at, width) {
  context.save();
  context.fillStyle = paint.color;
  const dots = 16;
  for (let i = 0; i < dots; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * width;
    context.fillRect(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius, Math.max(1, width / 8), Math.max(1, width / 8));
  }
  context.restore();
}

/** Flood fill. Returns false when the colour is already the target. */
function floodFill(ctx, x, y, hex, tolerance = 36) {
  const { width, height } = ctx.canvas;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const start = (y * width + x) * 4;
  const sr = data[start];
  const sg = data[start + 1];
  const sb = data[start + 2];
  const sa = data[start + 3];
  const tr = parseInt(hex.slice(1, 3), 16);
  const tg = parseInt(hex.slice(3, 5), 16);
  const tb = parseInt(hex.slice(5, 7), 16);
  if (sa > 0 && Math.abs(sr - tr) + Math.abs(sg - tg) + Math.abs(sb - tb) <= tolerance) return false;
  const match = (i) => Math.abs(data[i + 3] - sa) <= tolerance && Math.abs(data[i] - sr) + Math.abs(data[i + 1] - sg) + Math.abs(data[i + 2] - sb) <= tolerance;
  const stack = new Int32Array(width * height * 2);
  const seen = new Uint8Array(width * height);
  let n = 0;
  stack[n++] = x;
  stack[n++] = y;
  seen[y * width + x] = 1;
  while (n) {
    const py = stack[--n];
    const px = stack[--n];
    const i = (py * width + px) * 4;
    data[i] = tr;
    data[i + 1] = tg;
    data[i + 2] = tb;
    data[i + 3] = 255;
    const push = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const id = ny * width + nx;
      if (seen[id] || !match(id * 4)) return;
      seen[id] = 1;
      stack[n++] = nx;
      stack[n++] = ny;
    };
    push(px + 1, py);
    push(px - 1, py);
    push(px, py + 1);
    push(px, py - 1);
  }
  ctx.putImageData(image, 0, 0);
  return true;
}
