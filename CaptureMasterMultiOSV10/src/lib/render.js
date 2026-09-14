// Drawing the document: base image + annotations onto a canvas.
//
// One renderer serves the editor view, the clipboard, the exported files and
// the print pages, so what the user sees is exactly what is written out.
//
// Annotation shapes (all coordinates in image pixels):
//   rect / ellipse / highlight / pixelate : { x, y, w, h, color, strokeWidth, fill }
//   line / arrow                          : { x1, y1, x2, y2, color, strokeWidth }
//   pen                                   : { points: [{x,y}], color, strokeWidth }
//   text                                  : { x, y, text, color, font: {family,size,bold,italic}, bg }
//   number                                : { x, y, n, color, size }

export const BOX_TYPES = new Set(['rect', 'ellipse', 'highlight', 'pixelate']);
export const LINE_TYPES = new Set(['line', 'arrow']);

export function normRect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function fontString(font) {
  const f = font || {};
  const family = f.family ? `"${String(f.family).replace(/"/g, '')}", ` : '';
  return `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${Math.max(6, Number(f.size) || 24)}px ${family}"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
}

let measureCtx = null;
function measurer() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/** Measured box of a text annotation (line height = 1.25 × size). */
export function measureText(a) {
  const ctx = measurer();
  ctx.font = fontString(a.font);
  const size = Math.max(6, Number(a.font && a.font.size) || 24);
  const lines = String(a.text || '').split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line || ' ').width);
  const lineH = size * 1.25;
  const pad = Math.round(size * 0.25);
  return { w: Math.ceil(w) + pad * 2, h: Math.ceil(lineH * Math.max(1, lines.length)) + pad * 2, lineH, pad, size };
}

export function boundsOf(a) {
  switch (a.type) {
    case 'rect': case 'ellipse': case 'highlight': case 'pixelate':
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    case 'line': case 'arrow':
      return normRect(a.x1, a.y1, a.x2, a.y2);
    case 'pen': {
      if (!a.points || !a.points.length) return { x: 0, y: 0, w: 0, h: 0 };
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const p of a.points) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    case 'text': {
      const m = measureText(a);
      return { x: a.x, y: a.y, w: m.w, h: m.h };
    }
    case 'number': {
      const r = (a.size || 28) / 2;
      return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 };
    }
    default:
      return { x: a.x || 0, y: a.y || 0, w: a.w || 0, h: a.h || 0 };
  }
}

function drawArrowHead(ctx, x1, y1, x2, y2, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(12, width * 3.5);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return `rgba(255,61,61,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

/** Draws one annotation. `baseImg` is needed by pixelate (it samples the picture). */
export function drawAnnotation(ctx, a, baseImg) {
  const color = a.color || '#ff3d3d';
  const width = Math.max(1, Number(a.strokeWidth) || 4);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  switch (a.type) {
    case 'rect':
      if (a.fill) { ctx.fillStyle = hexToRgba(color, 0.25); ctx.fillRect(a.x, a.y, a.w, a.h); }
      ctx.strokeRect(a.x, a.y, a.w, a.h);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.max(0.5, a.w / 2), Math.max(0.5, a.h / 2), 0, 0, Math.PI * 2);
      if (a.fill) { ctx.fillStyle = hexToRgba(color, 0.25); ctx.fill(); }
      ctx.stroke();
      break;
    case 'highlight':
      ctx.fillStyle = hexToRgba(color, 0.35);
      ctx.fillRect(a.x, a.y, a.w, a.h);
      break;
    case 'pixelate': {
      if (!baseImg || a.w < 1 || a.h < 1) break;
      const block = Math.max(4, Number(a.block) || Math.round(Math.max(a.w, a.h) / 18));
      const sw = Math.max(1, Math.round(a.w / block));
      const sh = Math.max(1, Math.round(a.h / block));
      const tmp = document.createElement('canvas');
      tmp.width = sw;
      tmp.height = sh;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(baseImg, a.x, a.y, a.w, a.h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, a.x, a.y, a.w, a.h);
      ctx.imageSmoothingEnabled = true;
      break;
    }
    case 'line':
      ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
      break;
    case 'arrow': {
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const len = Math.max(12, width * 3.5);
      // Stop the shaft short of the tip so the head stays crisp.
      const ex = a.x2 - Math.cos(angle) * len * 0.6;
      const ey = a.y2 - Math.sin(angle) * len * 0.6;
      ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(ex, ey); ctx.stroke();
      drawArrowHead(ctx, a.x1, a.y1, a.x2, a.y2, width);
      break;
    }
    case 'pen': {
      const pts = a.points || [];
      if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2); ctx.fill(); break; }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      break;
    }
    case 'text': {
      const m = measureText(a);
      ctx.font = fontString(a.font);
      ctx.textBaseline = 'top';
      if (a.bg) { ctx.fillStyle = hexToRgba(a.bg === true ? '#ffffff' : a.bg, 0.85); ctx.fillRect(a.x, a.y, m.w, m.h); }
      ctx.fillStyle = color;
      const lines = String(a.text || '').split('\n');
      lines.forEach((line, i) => ctx.fillText(line, a.x + m.pad, a.y + m.pad + i * m.lineH));
      break;
    }
    case 'number': {
      const r = (a.size || 28) / 2;
      ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r / 8); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(r * 1.15)}px "Segoe UI", "Malgun Gothic", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(a.n), a.x, a.y + r * 0.05);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/**
 * Renders `state` ({ image, annotations }) with `baseImg` decoded, optionally
 * cropped to `region` and scaled, into a fresh canvas.
 */
export function renderToCanvas(state, baseImg, { region = null, scale = 1, skipIds = null } = {}) {
  const r = region || { x: 0, y: 0, w: state.image.width, h: state.image.height };
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w * scale));
  c.height = Math.max(1, Math.round(r.h * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(-r.x, -r.y);
  if (baseImg) ctx.drawImage(baseImg, 0, 0);
  for (const a of state.annotations) {
    if (skipIds && skipIds.has(a.id)) continue;
    drawAnnotation(ctx, a, baseImg);
  }
  return c;
}

// ── Hit testing and editing geometry ──────────────────────

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Topmost annotation under (x, y), with `tol` image pixels of slack. */
export function hitTest(annotations, x, y, tol = 6) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (LINE_TYPES.has(a.type)) {
      if (distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= tol + (a.strokeWidth || 4) / 2) return a;
      continue;
    }
    if (a.type === 'pen') {
      const pts = a.points || [];
      const slack = tol + (a.strokeWidth || 4) / 2;
      for (let k = 0; k < pts.length - 1; k++) if (distToSegment(x, y, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y) <= slack) return a;
      if (pts.length === 1 && Math.hypot(x - pts[0].x, y - pts[0].y) <= slack) return a;
      continue;
    }
    const b = boundsOf(a);
    if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) {
      // Unfilled boxes are only hit on their outline so the picture underneath stays clickable.
      if ((a.type === 'rect' || a.type === 'ellipse') && !a.fill) {
        const inner = x > b.x + tol + (a.strokeWidth || 4) && x < b.x + b.w - tol - (a.strokeWidth || 4) &&
          y > b.y + tol + (a.strokeWidth || 4) && y < b.y + b.h - tol - (a.strokeWidth || 4);
        if (inner && b.w > 4 * tol && b.h > 4 * tol) continue;
      }
      return a;
    }
  }
  return null;
}

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handle positions for an annotation, in image pixels. */
export function handlesOf(a) {
  if (LINE_TYPES.has(a.type)) return [{ id: 'p1', x: a.x1, y: a.y1 }, { id: 'p2', x: a.x2, y: a.y2 }];
  if (a.type === 'pen' || a.type === 'number' || a.type === 'text') return [];
  const b = boundsOf(a);
  return [
    { id: 'nw', x: b.x, y: b.y }, { id: 'n', x: b.x + b.w / 2, y: b.y }, { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'e', x: b.x + b.w, y: b.y + b.h / 2 }, { id: 'se', x: b.x + b.w, y: b.y + b.h },
    { id: 's', x: b.x + b.w / 2, y: b.y + b.h }, { id: 'sw', x: b.x, y: b.y + b.h }, { id: 'w', x: b.x, y: b.y + b.h / 2 },
  ];
}

export function moveAnnotation(a, dx, dy) {
  if (LINE_TYPES.has(a.type)) return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  if (a.type === 'pen') return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  return { ...a, x: a.x + dx, y: a.y + dy };
}

/** Applies a handle drag. `orig` is the annotation as it was when the drag began. */
export function resizeAnnotation(orig, handle, dx, dy) {
  if (LINE_TYPES.has(orig.type)) {
    if (handle === 'p1') return { ...orig, x1: orig.x1 + dx, y1: orig.y1 + dy };
    if (handle === 'p2') return { ...orig, x2: orig.x2 + dx, y2: orig.y2 + dy };
    return orig;
  }
  if (!BOX_TYPES.has(orig.type)) return orig;
  let { x, y, w, h } = orig;
  if (handle.includes('w')) { x += dx; w -= dx; }
  if (handle.includes('e')) { w += dx; }
  if (handle.includes('n')) { y += dy; h -= dy; }
  if (handle.includes('s')) { h += dy; }
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { ...orig, x, y, w, h };
}

export function cursorForHandle(id) {
  return { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', p1: 'move', p2: 'move' }[id] || 'default';
}
