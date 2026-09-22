// In-page navigation helpers: outline-title matching for TOC pages that
// were built as plain text (no Link annotations), and named-action mapping.

export function normalizeOutlineTitle(s) {
  return String(s || '')
    .replace(/[\u00ad]/g, '')
    .replace(/[.\u00b7\u2022\u2024\u2026\u2219\uff0e]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function stripTrailingPageNumber(s) {
  return String(s || '').replace(/\s+\d{1,4}\s*$/, '').trim();
}

export function flattenOutline(nodes, out = []) {
  for (const n of nodes || []) {
    out.push(n);
    if (n.items?.length) flattenOutline(n.items, out);
  }
  return out;
}

// One outline row for the current page: the deepest entry on that page.
// Several headings often share a page; only one of them should be painted.
export function outlineActiveId(nodes, page) {
  if (!page) return null;
  let best = null;
  for (const n of flattenOutline(nodes)) {
    if (n.page !== page) continue;
    if (!best || (n.level ?? 0) >= (best.level ?? 0)) best = n;
  }
  return best?.id || null;
}

// Best outline entry whose title matches a clicked TOC line.
// Returns null when nothing is confident enough to navigate.
export function matchOutlineTitle(line, outline) {
  const raw = normalizeOutlineTitle(line);
  const needle = stripTrailingPageNumber(raw);
  if (needle.length < 2) return null;

  let best = null;
  let bestScore = 0;
  for (const node of flattenOutline(outline)) {
    const title = normalizeOutlineTitle(node.title);
    if (title.length < 2) continue;
    let score = 0;
    if (title === needle || title === raw) score = 100 + title.length;
    else if (needle.startsWith(title) && title.length >= 4) score = 70 + title.length;
    else if (raw.includes(title) && title.length >= 4 && /\d{1,4}\s*$/.test(raw)) score = 60 + title.length;
    if (score > bestScore && node.page) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

export function lineTextNearPoint(layer, x, y) {
  if (!layer) return '';
  const parts = [];
  for (const span of layer.querySelectorAll('span')) {
    if (span.getAttribute('role') === 'img') continue;
    const r = span.getBoundingClientRect();
    if (r.height < 0.5) continue;
    if (y < r.top - 3 || y > r.bottom + 3) continue;
    const t = span.textContent || '';
    if (t) parts.push({ t, left: r.left });
  }
  parts.sort((a, b) => a.left - b.left);
  return parts.map((p) => p.t).join('');
}

export function namedActionPage(action, pageNumber, numPages) {
  switch (String(action || '')) {
    case 'FirstPage': return 1;
    case 'LastPage': return numPages;
    case 'NextPage': return Math.min(numPages, pageNumber + 1);
    case 'PrevPage':
    case 'PreviousPage': return Math.max(1, pageNumber - 1);
    default: return null;
  }
}
