// Where the downloaded asset library lives (src/io/assetlib.js): on the desktop
// the settings folder's library/ (written through the host, read through the
// mylib protocol — src-tauri/src/library.rs); in a browser the Cache Storage
// (read back as blob URLs). assetUrl(rel) gives the URL a loader (an image,
// three's HDRLoader) can open; a file that is not there fails to load and the
// material keeps its plain colour.

const desktop = typeof window !== "undefined" ? window.myarch : null;
const CACHE = "myarch-library-v1";
const KEY = (rel) => `https://myarch.library/${rel}`;

function desktopStore() {
  return {
    kind: "desktop",
    async list() { const i = await desktop.libraryInfo(); return i.files || []; },
    async info() { return desktop.libraryInfo(); },
    write: (rel, bytes) => desktop.libraryWrite(rel, bytes),
    clear: () => desktop.libraryClear(),
    openFolder: () => desktop.libraryOpenFolder(),
    url: (rel) => `${desktop.libraryBase}${rel}`,
  };
}

function webStore() {
  const blobs = new Map(); // rel → object URL (made once)
  const open = () => caches.open(CACHE);
  return {
    kind: "web",
    async list() { if (typeof caches === "undefined") return []; const c = await open(); return (await c.keys()).map((r) => r.url.replace("https://myarch.library/", "")); },
    async info() { const files = await this.list(); let bytes = 0; if (typeof caches !== "undefined") { const c = await open(); for (const f of files) { const r = await c.match(KEY(f)); if (r) bytes += (await r.clone().arrayBuffer()).byteLength; } } return { dir: "", files, bytes }; },
    async write(rel, bytes) { const c = await open(); await c.put(KEY(rel), new Response(bytes, { headers: { "content-length": String(bytes.length) } })); blobs.delete(rel); },
    async clear() { blobs.clear(); if (typeof caches !== "undefined") await caches.delete(CACHE); },
    openFolder: null,
    async url(rel) {
      if (blobs.has(rel)) return blobs.get(rel);
      if (typeof caches === "undefined") return `about:blank#${rel}`;
      const r = await (await open()).match(KEY(rel));
      if (!r) return `about:blank#missing-${rel}`;
      const u = URL.createObjectURL(await r.blob());
      blobs.set(rel, u);
      return u;
    },
  };
}

let store = null;
/** The store of this run (desktop host or browser cache); a test may put its own (setAssetStore). */
export function assetStore() {
  if (!store) store = desktop && desktop.libraryInfo ? desktopStore() : webStore();
  return store;
}
export function setAssetStore(s) { store = s; }

/** The URL of a library file (textures/<set>/<map>.jpg, hdri/<id>.hdr) for a loader. */
export async function assetUrl(rel) { return assetStore().url(rel); }

// Listeners told when the library changed (installed, reinstalled): the views load their textures again.
const listeners = new Set();
export function onLibraryChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function libraryChanged() { for (const fn of listeners) { try { fn(); } catch (e) { console.warn(e); } } }
