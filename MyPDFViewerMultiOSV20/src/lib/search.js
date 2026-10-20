// Find a query in page text and map it back onto the rendered text layer
// so a search hit can be painted on the page it belongs to.

export function collapseSearchText(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ');
}

export function normalizeNeedle(query) {
  return collapseSearchText(query).trim().toLowerCase();
}

// Walk the original string the same way collapseSearchText does, remembering
// which original index produced each haystack character.
export function mapCollapsedToOriginal(raw) {
  const src = String(raw ?? '');
  let hay = '';
  const map = [];
  let inSpace = false;
  for (let i = 0; i < src.length; i++) {
    if (/\s/.test(src[i])) {
      if (!inSpace && hay.length > 0) {
        hay += ' ';
        map.push(i);
        inSpace = true;
      }
    } else {
      hay += src[i];
      map.push(i);
      inSpace = false;
    }
  }
  return { hay, map };
}

export function findNeedleOffsets(hay, needle) {
  const h = String(hay ?? '').toLowerCase();
  const n = normalizeNeedle(needle);
  if (!n) return [];
  const out = [];
  let from = 0;
  while (from <= h.length) {
    const at = h.indexOf(n, from);
    if (at === -1) break;
    out.push({ index: at, length: n.length });
    from = at + n.length;
  }
  return out;
}

// Hits in `raw` as original-string [start, end) ranges, using the same
// whitespace collapsing as searchDocument.
export function locateQuery(raw, query) {
  const needle = normalizeNeedle(query);
  if (!needle) return [];
  const { hay, map } = mapCollapsedToOriginal(raw);
  return findNeedleOffsets(hay, needle).map((hit) => {
    const start = map[hit.index];
    const last = map[hit.index + hit.length - 1];
    if (start == null || last == null) return null;
    return { start, end: last + 1, index: hit.index, length: hit.length };
  }).filter(Boolean);
}

export function pageOccurrence(results, hit) {
  if (!hit) return -1;
  if (Number.isInteger(hit.pageHit)) return hit.pageHit;
  return (results || []).filter((r) => r.page === hit.page && r.index < hit.index).length;
}

export function isSameSearchHit(active, hit) {
  return !!(active && hit && active.page === hit.page && active.index === hit.index);
}

export function scrollOffsetForHit({
  rootTop, wrapTop, rootScroll, rootHeight, hitTop, hitHeight, margin = 48,
}) {
  const absTop = wrapTop - rootTop + rootScroll + hitTop;
  const absBottom = absTop + (hitHeight || 0);
  const viewTop = rootScroll + margin;
  const viewBottom = rootScroll + rootHeight - margin;
  if (absTop >= viewTop && absBottom <= viewBottom) return null;
  return Math.max(0, absTop - margin);
}

function isEndGuard(el) {
  return el?.classList?.contains('endOfContent');
}

function spanTop(el) {
  if (!el?.getBoundingClientRect) return null;
  try {
    const box = el.getBoundingClientRect();
    return Number.isFinite(box.top) ? box.top : null;
  } catch {
    return null;
  }
}

// Characters of the text layer in stream order. A newline is inserted between
// spans that sit on different visual lines so collapsed search matches
// getPageText() + whitespace folding. Text nodes are visited once so nested
// markedContent spans are not counted twice.
export function collectLayerChars(layer) {
  if (!layer) return [];
  const chars = [];
  let lastTop = null;

  const visit = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE && isEndGuard(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const top = spanTop(node.parentElement);
      if (lastTop != null && top != null && top - lastTop > 4) {
        chars.push({ node: null, offset: 0, ch: '\n', synthetic: true });
      }
      if (top != null) lastTop = top;
      const t = node.textContent || '';
      for (let i = 0; i < t.length; i++) chars.push({ node, offset: i, ch: t[i] });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const child of node.childNodes) visit(child);
  };
  visit(layer);
  return chars;
}

function realChar(chars, index, dir) {
  let i = index;
  while (chars[i] && chars[i].synthetic) i += dir;
  return chars[i]?.node ? chars[i] : null;
}

export function rectsForCharRange(chars, start, end, layerBox) {
  const a = realChar(chars, start, 1);
  const b = realChar(chars, end - 1, -1);
  if (!a || !b || typeof document === 'undefined') return [];
  try {
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset + 1);
    if (typeof range.getClientRects !== 'function') return [];
    const raw = [...range.getClientRects()];
    const left = layerBox?.left || 0;
    const top = layerBox?.top || 0;
    return raw
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        left: r.left - left,
        top: r.top - top,
        width: r.width,
        height: r.height,
      }));
  } catch {
    return [];
  }
}

export function collectLayerSearchHits(layer, query) {
  if (!layer || !normalizeNeedle(query)) return [];
  const chars = collectLayerChars(layer);
  const raw = chars.map((c) => c.ch).join('');
  const box = layer.getBoundingClientRect?.() || { left: 0, top: 0 };
  return locateQuery(raw, query).map((loc) => ({
    start: loc.start,
    end: loc.end,
    index: loc.index,
    rects: rectsForCharRange(chars, loc.start, loc.end, box),
  }));
}
