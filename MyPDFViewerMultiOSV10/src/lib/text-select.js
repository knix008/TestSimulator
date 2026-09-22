// Stream-order text selection: a drag starts at one column and ends at
// another, taking whole lines in between. Helpers also recover a caret when
// the pointer lands in a gap between pdf.js spans.

export const MIN_TEXT_DRAG = 4;

export function normalizeClientBox(x0, y0, x1, y1) {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

// A swipe along a line is still a box-select — only a click-sized twitch
// should be ignored. Either edge of the rectangle is enough.
export function isTextDrag(box, min = MIN_TEXT_DRAG) {
  return !!box && (box.width >= min || box.height >= min);
}

export function dragPageRect(x0, y0, x1, y1) {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

// Widen only the thin side of a drag so a hairline swipe still hits glyphs,
// without growing a deliberate 2-D rectangle into neighbouring columns.
export function inflateBox(box, padX = 0, padY = 0) {
  if (!box) return null;
  return {
    left: box.left - padX,
    top: box.top - padY,
    right: box.right + padX,
    bottom: box.bottom + padY,
    width: box.width + padX * 2,
    height: box.height + padY * 2,
  };
}

export function hitBoxForDrag(box, min = 12) {
  if (!box) return null;
  return inflateBox(box, box.width < min ? 10 : 0, box.height < min ? 10 : 0);
}

// A span counts as selected when its centre is inside the box, or when at
// least a third of its area overlaps — tight enough not to grab a neighbour
// line, loose enough that a slightly sloppy box still catches the word.
export function spanHitsBox(spanRect, box) {
  if (!spanRect || !box) return false;
  const cx = (spanRect.left + spanRect.right) / 2;
  const cy = (spanRect.top + spanRect.bottom) / 2;
  if (cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom) return true;
  const ix = Math.min(spanRect.right, box.right) - Math.max(spanRect.left, box.left);
  const iy = Math.min(spanRect.bottom, box.bottom) - Math.max(spanRect.top, box.top);
  if (ix <= 0 || iy <= 0) return false;
  const area = Math.max(1, spanRect.width * spanRect.height);
  return (ix * iy) / area >= 0.35;
}

export function caretRangeFromPoint(x, y) {
  if (typeof document === 'undefined') return null;
  if (typeof document.caretRangeFromPoint === 'function') {
    try { return document.caretRangeFromPoint(x, y); } catch { return null; }
  }
  if (typeof document.caretPositionFromPoint === 'function') {
    try {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    } catch { return null; }
  }
  return null;
}

function spanDistance(rect, x, y) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return dx * dx + dy * dy;
}

// Nearest selectable span in a text layer — used when the click lands in a
// margin or between two lines, where caretRangeFromPoint often returns nothing.
export function nearestSpanRange(layer, x, y) {
  if (!layer) return null;
  const onLine = [];
  const others = [];
  for (const span of layer.querySelectorAll('span')) {
    if (span.getAttribute('role') === 'img') continue;
    if (!span.firstChild) continue;
    const r = span.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) continue;
    const hit = { span, r };
    if (y >= r.top && y <= r.bottom) onLine.push(hit);
    else others.push(hit);
  }
  const pool = onLine.length ? onLine : others;
  let best = null;
  let bestDist = Infinity;
  for (const hit of pool) {
    const d = onLine.length
      ? (x < hit.r.left ? hit.r.left - x : x > hit.r.right ? x - hit.r.right : 0)
      : spanDistance(hit.r, x, y);
    if (d < bestDist) { bestDist = d; best = hit; }
  }
  if (!best) return null;
  const range = document.createRange();
  const node = best.span.firstChild;
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, caretOffsetAtX(best.span, x));
  } else {
    range.setStart(best.span, 0);
  }
  range.collapse(true);
  return range;
}

// Column inside a span: the caret offset whose glyph edge is closest to x.
export function caretOffsetAtX(span, x) {
  const node = span?.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return 0;
  const n = node.textContent.length;
  if (!n) return 0;
  const range = document.createRange();
  if (typeof range.getBoundingClientRect !== 'function') {
    const box = span.getBoundingClientRect?.();
    if (!box) return 0;
    return x >= (box.left + box.right) / 2 ? n : 0;
  }
  const xAt = (i) => {
    range.setStart(node, i);
    range.collapse(true);
    return range.getBoundingClientRect().left;
  };
  const x0 = xAt(0);
  const xn = xAt(n);
  if (x <= x0) return 0;
  if (x >= xn) return n;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xAt(mid) < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xAt(lo - 1) - x) <= Math.abs(xAt(lo) - x)) return lo - 1;
  return lo;
}

export function rangeAtPoint(layer, x, y) {
  const direct = caretRangeFromPoint(x, y);
  if (direct) {
    const node = direct.startContainer;
    const host = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (host && layer.contains(host) && host.closest?.('span')) return direct;
  }
  return nearestSpanRange(layer, x, y);
}

export function caretAtPoint(layer, x, y) {
  const range = rangeAtPoint(layer, x, y);
  if (!range) return null;
  return { node: range.startContainer, offset: range.startOffset };
}

// Stream-order selection: from one column to another, wrapping through
// whole lines in between — not a rectangle.
export function applyStreamSelection(from, to) {
  if (!from?.node || !to?.node) return false;
  const sel = typeof window === 'undefined' ? null : window.getSelection();
  if (!sel) return false;
  const range = document.createRange();
  const a = document.createRange();
  const b = document.createRange();
  try {
    a.setStart(from.node, from.offset);
    b.setStart(to.node, to.offset);
    if (a.compareBoundaryPoints(Range.START_TO_START, b) <= 0) {
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
    } else {
      range.setStart(to.node, to.offset);
      range.setEnd(from.node, from.offset);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

export function collectSpansInBox(layer, box) {
  if (!layer || !box) return [];
  const hits = [];
  for (const span of layer.querySelectorAll('span')) {
    if (span.classList.contains('endOfContent')) continue;
    if (span.getAttribute('role') === 'img') continue;
    const r = span.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) continue;
    if (!spanHitsBox(r, box)) continue;
    const text = span.textContent || '';
    if (!text) continue;
    hits.push({ span, text, r });
  }
  return hits;
}

function isCjk(ch) {
  return /[\u3000-\u9fff\uac00-\ud7af]/.test(ch);
}

export function joinSpanText(hits) {
  if (!hits.length) return '';
  let out = hits[0].text;
  for (let i = 1; i < hits.length; i++) {
    const prev = hits[i - 1];
    const cur = hits[i];
    const lineH = Math.max(prev.r.height, cur.r.height, 1);
    const sameLine = Math.abs(prev.r.top - cur.r.top) < lineH * 0.6;
    if (!sameLine) {
      out += '\n';
    } else {
      const gap = cur.r.left - prev.r.right;
      const a = prev.text;
      const b = cur.text;
      const alreadySpaced = /\s$/.test(a) || /^\s/.test(b);
      const tight = gap <= lineH * 0.12;
      const cjk = isCjk(a.slice(-1)) && isCjk(b[0] || '');
      if (!alreadySpaced && !tight && !cjk && gap > lineH * 0.28) out += ' ';
    }
    out += cur.text;
  }
  return out;
}

export function hitsToLines(hits, layerBox) {
  const rects = hits.map((h) => ({
    left: h.r.left,
    top: h.r.top,
    right: h.r.right,
    bottom: h.r.bottom,
    width: h.r.width,
    height: h.r.height,
  }));
  return rects;
}

export function linesRelativeTo(layerBox, merged) {
  return merged.map((l) => ({
    left: l.left - layerBox.left,
    top: l.top - layerBox.top,
    width: l.right - l.left,
    height: l.bottom - l.top,
  }));
}

// The drag rectangle, in the text layer's own pixels — one block, not a
// scatter of line fragments.
export function boxToLayerRect(box, layerBox) {
  if (!box || !layerBox) return null;
  return {
    left: box.left - layerBox.left,
    top: box.top - layerBox.top,
    width: box.width,
    height: box.height,
  };
}

export function applyDomSelection(hits) {
  if (!hits.length) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  const range = document.createRange();
  const first = hits[0].span;
  const last = hits[hits.length - 1].span;
  try {
    range.setStartBefore(first);
    range.setEndAfter(last);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}
