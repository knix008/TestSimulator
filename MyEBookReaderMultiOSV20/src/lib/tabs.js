// Helpers for the document tab strip. A tab is identified by the PDF path
// when we have one, otherwise by name + size (web / URL downloads).

export function documentKey(file) {
  if (!file) return '';
  if (file.path) return `path:${file.path}`;
  return `name:${file.name || ''}::${file.size || 0}`;
}

export function tabLabel(file) {
  return file?.name || '';
}

export function findTabByFile(tabs, file) {
  const key = documentKey(file);
  if (!key) return null;
  return (tabs || []).find((t) => t.key === key) || null;
}

export function neighborTabId(tabs, id) {
  const list = tabs || [];
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return list[0]?.id || null;
  return list[i + 1]?.id || list[i - 1]?.id || null;
}

export function nextTabId(tabs, id, dir = 1) {
  const list = tabs || [];
  if (!list.length) return null;
  const i = list.findIndex((t) => t.id === id);
  const start = i < 0 ? 0 : i;
  const n = list.length;
  return list[(start + dir + n * 8) % n].id;
}

export function anyTabDirty(tabs, currentDirty, currentId) {
  if (currentDirty) return true;
  return (tabs || []).some((t) => t.id !== currentId && t.dirty);
}

export function tabScrollOverflow(el) {
  if (!el) return { overflowing: false, left: false, right: false };
  const max = Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
  const left = el.scrollLeft || 0;
  return {
    overflowing: max > 1,
    left: left > 1,
    right: left < max - 1,
  };
}

export function tabScrollStep(el, dir = 1) {
  const width = Number(el?.clientWidth) || 0;
  const step = Math.max(120, Math.round(width * 0.7));
  return (dir < 0 ? -1 : 1) * step;
}

// Where to scroll so `tab` sits inside the strip. null = already visible.
export function tabRevealScroll(scroller, tab) {
  if (!scroller || !tab) return null;
  const left = Number(tab.offsetLeft) || 0;
  const width = Number(tab.offsetWidth) || 0;
  const right = left + width;
  const viewLeft = Number(scroller.scrollLeft) || 0;
  const viewWidth = Number(scroller.clientWidth) || 0;
  const viewRight = viewLeft + viewWidth;
  if (width <= 0) return null;
  if (left < viewLeft) return Math.max(0, left - 8);
  if (right > viewRight) return Math.max(0, right - viewWidth + 8);
  return null;
}
