/**
 * The page already painted, kept as the lines and pictures sitting where
 * they are.
 *
 * Pouring the chapter out again — into the turning leaf — breaks the lines
 * again, so the page the reader is looking at changes the moment a turn
 * starts. What is taken here is that paint: each line where it already
 * stands, and nothing laid out a second time. The page being landed on is
 * drawn separately, underneath, and uncovered as the leaf moves.
 */

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** The scale a transform has put on the pane. Positions from the screen have to come back by this. */
export function elementScale(el) {
  if (!el) return 1;
  let transform = 'none';
  try { transform = getComputedStyle(el).transform; } catch { return 1; }
  if (!transform || transform === 'none') return 1;
  const matched = /matrix\(\s*([-0-9.]+)/.exec(transform);
  const scale = matched ? parseFloat(matched[1]) : 1;
  return scale > 0 ? scale : 1;
}

/**
 * The part of the pane that is actually on screen, in screen pixels, plus
 * the page's own width and height. A layer laid over the page uses those.
 */
export function visibleClip(el) {
  if (!el?.getBoundingClientRect) return null;
  const rect = el.getBoundingClientRect();
  const scale = elementScale(el);
  let padL = 0;
  let padT = 0;
  let padR = 0;
  let padB = 0;
  let borderL = 0;
  let borderT = 0;
  try {
    const cs = getComputedStyle(el);
    padL = num(cs.paddingLeft);
    padT = num(cs.paddingTop);
    padR = num(cs.paddingRight);
    padB = num(cs.paddingBottom);
    borderL = num(cs.borderLeftWidth);
    borderT = num(cs.borderTopWidth);
  } catch { /* the border box is the page */ }
  const left = rect.left + (borderL + padL) * scale;
  const top = rect.top + (borderT + padT) * scale;
  const width = Math.max(0, (el.clientWidth || 0) - padL - padR);
  const height = Math.max(0, (el.clientHeight || 0) - padT - padB);
  if (width < 2 || height < 2) return null;
  return {
    left,
    top,
    right: left + width * scale,
    bottom: top + height * scale,
    width,
    height,
    scale,
  };
}

/** The column box the chapter was poured into, so the page underneath breaks the same way. */
export function chapterFrame(el) {
  if (!el) return null;
  const width = el.offsetWidth || 0;
  const height = el.offsetHeight || 0;
  if (width < 2 || height < 2) return null;
  let columnWidth = '';
  let columnGap = '';
  let columnFill = '';
  try {
    const cs = getComputedStyle(el);
    columnWidth = cs.columnWidth || '';
    columnGap = cs.columnGap || '';
    columnFill = cs.columnFill || '';
  } catch { /* the size alone still holds the lines */ }
  return { width, height, columnWidth, columnGap, columnFill };
}

function overlaps(rect, clip) {
  return rect
    && rect.width > 0.5
    && rect.height > 0.5
    && rect.right > clip.left + 0.5
    && rect.left < clip.right - 0.5
    && rect.bottom > clip.top + 0.5
    && rect.top < clip.bottom - 0.5;
}

function clientRects(range) {
  try {
    if (typeof range?.getClientRects !== 'function') return [];
    return range.getClientRects() || [];
  } catch {
    return [];
  }
}

function clientBox(range) {
  try {
    if (typeof range?.getBoundingClientRect !== 'function') return null;
    return range.getBoundingClientRect();
  } catch {
    return null;
  }
}

function firstRect(list) {
  if (!list || !list.length) return null;
  for (let i = 0; i < list.length; i += 1) {
    const rect = list[i];
    if (rect && rect.width > 0.5 && rect.height > 0.5) return rect;
  }
  return null;
}

function toLocal(rect, clip) {
  const scale = clip.scale > 0 ? clip.scale : 1;
  return {
    left: (rect.left - clip.left) / scale,
    top: (rect.top - clip.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

function inkOf(el) {
  let cs;
  try { cs = getComputedStyle(el); } catch { return {}; }
  const background = cs.backgroundColor;
  const clear = !background || background === 'transparent' || background === 'rgba(0, 0, 0, 0)';
  return {
    color: cs.color || undefined,
    font: cs.font || undefined,
    letterSpacing: cs.letterSpacing || undefined,
    background: clear ? undefined : background,
  };
}

/**
 * One text node's lines, split where the browser already wrapped them.
 * A line that is not on the page on screen is left out: the leaf is that
 * page, not the rest of the chapter.
 */
function lineBoxes(node, clip) {
  const text = node.textContent || '';
  const n = text.length;
  if (!n) return [];
  const range = node.ownerDocument.createRange();
  const lines = [];
  let i = 0;
  while (i < n) {
    let top = null;
    try {
      range.setStart(node, i);
      range.setEnd(node, Math.min(n, i + 1));
      const first = firstRect(clientRects(range));
      top = first ? first.top : null;
    } catch {
      i += 1;
      continue;
    }
    if (top == null) {
      i += 1;
      continue;
    }
    let best = i + 1;
    let lo = i + 1;
    let hi = n;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      let same = false;
      try {
        range.setStart(node, i);
        range.setEnd(node, mid);
        const rects = clientRects(range);
        same = rects.length === 1 && Math.abs(rects[0].top - top) < 1.5;
      } catch { same = false; }
      if (same) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    let box = null;
    try {
      range.setStart(node, i);
      range.setEnd(node, best);
      box = clientBox(range);
    } catch { box = null; }
    if (box && overlaps(box, clip)) {
      lines.push({ text: text.slice(i, best), ...toLocal(box, clip) });
    }
    i = best > i ? best : i + 1;
  }
  return lines;
}

/**
 * The paint of `root` that falls inside `clip`.
 *
 * Returns null when nothing measurable is there — a page that has not been
 * laid out — so the caller can fall back to holding the chapter itself.
 */
export function freezePage(root, clip) {
  if (!root || !clip || clip.width < 2 || clip.height < 2) return null;
  const pieces = [];
  const doc = root.ownerDocument;
  if (!doc) return null;

  root.querySelectorAll?.('img').forEach((img) => {
    const rects = img.getClientRects?.() || [];
    const ink = inkOf(img);
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i];
      if (!overlaps(rect, clip)) continue;
      const src = img.currentSrc || img.src || '';
      if (!src) continue;
      pieces.push({ kind: 'img', src, ...toLocal(rect, clip), ...ink });
    }
  });

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && node.textContent && node.textContent.trim()) {
      // A paragraph that is not on this page is one measurement, not a walk
      // of every line in the rest of the chapter.
      const whole = node.ownerDocument.createRange();
      whole.selectNodeContents(node);
      const blocks = clientRects(whole);
      let onPage = false;
      for (let i = 0; i < blocks.length; i += 1) {
        if (overlaps(blocks[i], clip)) { onPage = true; break; }
      }
      if (!onPage) {
        node = walker.nextNode();
        continue;
      }
      const ink = inkOf(parent);
      for (const line of lineBoxes(node, clip)) {
        pieces.push({ kind: 'text', ...line, ...ink });
      }
    }
    node = walker.nextNode();
  }

  if (!pieces.length) return null;
  return { width: clip.width, height: clip.height, pieces };
}
