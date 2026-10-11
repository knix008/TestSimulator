// Capture history shown as a strip at the bottom of the window.
// Newest first, persisted (with small thumbnails) across runs.

export const GALLERY_KEY = 'mycapture.gallery.v1';
export const GALLERY_LIMIT = 60;

let nextId = 0;

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const kind = item.kind === 'video' ? 'video' : item.kind === 'image' ? 'image' : null;
  if (!kind || typeof item.path !== 'string' || !item.path) return null;
  const number = (value) => (Number.isFinite(value) && value >= 0 ? value : null);
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `g${Date.now().toString(36)}${(nextId++).toString(36)}`,
    kind,
    path: item.path,
    thumbnail: typeof item.thumbnail === 'string' && item.thumbnail.startsWith('data:image/') ? item.thumbnail : null,
    width: number(item.width),
    height: number(item.height),
    bytes: number(item.bytes),
    durationMs: kind === 'video' ? number(item.durationMs) : null,
    createdAt: number(item.createdAt) ?? Date.now(),
  };
}

export function sanitizeGallery(raw) {
  const list = Array.isArray(raw) ? raw.map(sanitizeItem).filter(Boolean) : [];
  const seen = new Set();
  return list.filter((item) => !seen.has(item.path) && seen.add(item.path)).slice(0, GALLERY_LIMIT);
}

/** Adds `item` in front; a capture saved again to the same path replaces the old entry. */
export function addToGallery(items, item) {
  const entry = sanitizeItem({ ...item, createdAt: item.createdAt ?? Date.now() });
  if (!entry) return items;
  return [entry, ...items.filter((existing) => existing.path !== entry.path)].slice(0, GALLERY_LIMIT);
}

export function removeFromGallery(items, ids) {
  const remove = new Set(ids);
  return items.filter((item) => !remove.has(item.id));
}

export function loadGallery(storage) {
  try {
    return sanitizeGallery(JSON.parse(storage?.getItem(GALLERY_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function storeGallery(storage, items) {
  try {
    storage?.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch {
    // Quota full: keep the newest half rather than nothing.
    try { storage?.setItem(GALLERY_KEY, JSON.stringify(items.slice(0, Math.ceil(items.length / 2)))); } catch { /* give up */ }
  }
}
