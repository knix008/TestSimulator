// The gallery: every PDF the user has opened, plus any they add by hand.
//
// Opening a document from disk registers it automatically; the user can also
// add files without opening them, remove entries, and star favorites.
// Removing an entry only takes it off the list — the file is never touched.
//
// Entries (kept in settings): { path, name, dir, size, addedAt, openedAt?, favorite? }
// Pictures of the first page live in ./thumb-store.js, not in settings — a few
// hundred of them would not fit in localStorage.

export const GALLERY_MAX = 300;
export const GALLERY_VIEWS = ['tiles', 'details'];
export const TILE_MIN = 96;
export const TILE_MAX = 320;
export const TILE_DEFAULT = 168;
export const THUMB_WIDTH = 320;   // rendered once, shown at any tile size
export const RECENT_IN_HISTORY = 15;

export function galleryKey(entry) {
  return typeof entry?.path === 'string' ? entry.path : '';
}

// Windows paths are case-insensitive; one entry per file however it was typed.
export function samePath(a, b) {
  return String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
}

function baseName(p) {
  return String(p || '').split(/[\\/]/).pop();
}

function dirOf(p) {
  const parts = String(p || '').split(/[\\/]/);
  parts.pop();
  return parts.join(/\\/.test(String(p)) ? '\\' : '/');
}

function cleanEntry(raw, now = Date.now()) {
  if (!raw || typeof raw.path !== 'string' || !raw.path.trim()) return null;
  const path = raw.path;
  const out = {
    path,
    name: typeof raw.name === 'string' && raw.name ? raw.name : baseName(path),
    dir: typeof raw.dir === 'string' && raw.dir ? raw.dir : dirOf(path),
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
    addedAt: Number.isFinite(Number(raw.addedAt)) && raw.addedAt != null ? Number(raw.addedAt) : now,
  };
  if (raw.openedAt != null && Number.isFinite(Number(raw.openedAt))) out.openedAt = Number(raw.openedAt);
  if (raw.favorite === true) out.favorite = true;
  return out;
}

// Settings-file input → a clean list: paths only, one per file, capped.
export function normalizeGallery(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = cleanEntry(raw);
    if (!e || out.some((x) => samePath(x.path, e.path))) continue;
    out.push(e);
    if (out.length >= GALLERY_MAX) break;
  }
  return out;
}

// A settings file from before the gallery existed starts it from the recent files.
export function seedGallery(recentFiles) {
  return normalizeGallery((recentFiles || []).map((f) => ({
    ...f,
    addedAt: f?.openedAt,
    openedAt: f?.openedAt,
  })));
}

// Registers a document that was just opened: new ones go to the front, a known
// one moves to the front and keeps its star and the date it was added.
export function registerOpened(list, entry, now = Date.now()) {
  const e = cleanEntry({ ...entry, openedAt: now, addedAt: now }, now);
  if (!e) return list || [];
  const prev = (list || []).find((x) => samePath(x.path, e.path));
  const merged = prev ? { ...prev, ...e, addedAt: prev.addedAt } : e;
  if (prev?.favorite) merged.favorite = true;
  const rest = (list || []).filter((x) => !samePath(x.path, e.path));
  return [merged, ...rest].slice(0, GALLERY_MAX);
}

// Files the user added by hand (not opened). Ones already listed stay put.
export function addPaths(list, paths, now = Date.now()) {
  const cur = [...(list || [])];
  const added = [];
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p !== 'string' || !p.trim()) continue;
    if (cur.some((x) => samePath(x.path, p)) || added.some((x) => samePath(x.path, p))) continue;
    added.push(cleanEntry({ path: p, addedAt: now }, now));
  }
  return { list: [...added, ...cur].slice(0, GALLERY_MAX), added: added.length };
}

export function removeFromGallery(list, path) {
  return (list || []).filter((x) => !samePath(x.path, path));
}

// Starring a file that is not in the gallery yet (the open document, say) adds it.
export function setFavorite(list, entry, on, now = Date.now()) {
  const path = galleryKey(entry);
  if (!path) return list || [];
  const cur = list || [];
  if (!cur.some((x) => samePath(x.path, path))) {
    if (!on) return cur;
    const e = cleanEntry({ ...entry, addedAt: now }, now);
    return e ? [{ ...e, favorite: true }, ...cur].slice(0, GALLERY_MAX) : cur;
  }
  return cur.map((x) => {
    if (!samePath(x.path, path)) return x;
    const next = { ...x };
    if (on) next.favorite = true;
    else delete next.favorite;
    return next;
  });
}

export function inGallery(list, path) {
  return !!path && (list || []).some((x) => samePath(x.path, path));
}

export function isFavorite(list, path) {
  return !!path && (list || []).some((x) => x.favorite && samePath(x.path, path));
}

export function favoritesOf(list) {
  return (list || []).filter((x) => x.favorite);
}

export function isCurrent(entry, currentPath) {
  return !!currentPath && samePath(galleryKey(entry), currentPath);
}

// Most recently opened first — what the History panel lists.
export function recentlyOpened(list, n = RECENT_IN_HISTORY) {
  return (list || [])
    .filter((x) => x.openedAt != null)
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, n);
}

// Takes an entry out of the History panel's "recently opened" list; its
// gallery card stays.
export function forgetOpened(list, path) {
  let changed = false;
  const next = (list || []).map((x) => {
    if (x.openedAt == null || !samePath(x.path, path)) return x;
    changed = true;
    const { openedAt, ...rest } = x;
    return rest;
  });
  return changed ? next : (list || []);
}

export function forgetAllOpened(list) {
  return (list || []).map((x) => {
    if (x.openedAt == null) return x;
    const { openedAt, ...rest } = x;
    return rest;
  });
}

export const GALLERY_SORTS = ['opened', 'name', 'added', 'size'];

export function sortGallery(list, sort = 'opened', dir = 'desc') {
  const k = GALLERY_SORTS.includes(sort) ? sort : 'opened';
  const val = (x) => {
    if (k === 'name') return String(x.name || '').toLowerCase();
    if (k === 'added') return x.addedAt || 0;
    if (k === 'size') return x.size || 0;
    return x.openedAt ?? x.addedAt ?? 0;
  };
  const out = [...(list || [])].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return dir === 'asc' ? out : out.reverse();
}

// Filter by "all" / "favorites" and by a name or folder fragment.
export function filterGallery(list, { only = 'all', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return (list || []).filter((x) => {
    if (only === 'favorites' && !x.favorite) return false;
    if (!q) return true;
    return String(x.name).toLowerCase().includes(q) || String(x.dir).toLowerCase().includes(q);
  });
}

export function normalizeGalleryView(view) {
  return GALLERY_VIEWS.includes(view) ? view : 'tiles';
}

// ── The library: favorites as books on shelves ──────────
export const BOOK_MIN = 140;
export const BOOK_MAX = 360;
export const BOOK_DEFAULT = 220;
export const SHELF_GAP = 28;      // px between books on a shelf
export const SHELF_PAD = 32;      // px of shelf on each side of the books
// shelf: books on boards · covers: a wall of covers · list: rows · details: a table
export const LIBRARY_VIEWS = ['shelf', 'covers', 'list', 'details'];

export function normalizeLibraryView(view) {
  return LIBRARY_VIEWS.includes(view) ? view : 'shelf';
}

export function clampBookSize(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return BOOK_DEFAULT;
  return Math.min(BOOK_MAX, Math.max(BOOK_MIN, v));
}

// How many books of `bookWidth` stand on one shelf of `shelfWidth` (at least one).
export function booksPerShelf(shelfWidth, bookWidth, { gap = SHELF_GAP, pad = SHELF_PAD } = {}) {
  const room = Math.max(0, Number(shelfWidth) - 2 * pad);
  const w = Math.max(1, Number(bookWidth) || BOOK_DEFAULT);
  return Math.max(1, Math.floor((room + gap) / (w + gap)));
}

// The books, shelf by shelf.
export function shelvesOf(items, perShelf) {
  const n = Math.max(1, Math.floor(Number(perShelf) || 1));
  const out = [];
  for (let i = 0; i < (items || []).length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function clampTileSize(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return TILE_DEFAULT;
  return Math.min(TILE_MAX, Math.max(TILE_MIN, v));
}

// First page as a small JPEG data URL.
export async function renderThumb(doc, { width = THUMB_WIDTH, quality = 0.75 } = {}) {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const view = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(view.width));
  canvas.height = Math.max(1, Math.floor(view.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: view, background: '#ffffff' }).promise;
  const url = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0;
  canvas.height = 0;
  return /^data:image\//.test(url) ? url : '';
}
