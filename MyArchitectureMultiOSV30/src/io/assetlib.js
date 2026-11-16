// The asset library (material textures and HDRI skies) is not shipped with the
// program: it is downloaded from Poly Haven (CC0) the first time the program
// starts, in the background, and kept on this computer (desktop: the settings
// folder's library/, served as mylib://; web: the browser's Cache Storage).
// Settings → Asset library shows it and reinstalls it.
//
// This module is pure: the network (`fetch`) and the store ({ list, write }) are
// passed in, so the tests run it without either. Poly Haven's API names every
// file: /files/<id> → { Diffuse: { "1k": { jpg: { url, size, md5 } } }, … } for
// textures, { hdri: { "1k": { hdr: { url, size } } } } for HDRIs.

import { TEXTURE_SETS } from "../lib/libraryindex.js";
import { ENVIRONMENTS } from "../view3d/environments.js";

export const API = "https://api.polyhaven.com";
/** Map name in this app → Poly Haven's key. */
export const MAP_KEYS = { diff: "Diffuse", nor: "nor_gl", rough: "Rough", ao: "AO" };

/** Every file the library is made of: [{ rel, id, kind: "texture" | "hdri", key, res, ext }]. */
export function wantedFiles() {
  const out = [];
  for (const [set, info] of Object.entries(TEXTURE_SETS)) {
    for (const map of info.maps || []) out.push({ rel: `textures/${set}/${map}.${info.ext || "jpg"}`, id: set, kind: "texture", key: MAP_KEYS[map], res: "1k", ext: "jpg" });
  }
  for (const env of ENVIRONMENTS) {
    out.push({ rel: env.file, id: env.id, kind: "hdri", key: "hdri", res: "1k", ext: "hdr" });
    if (env.file2k) out.push({ rel: env.file2k, id: env.id, kind: "hdri", key: "hdri", res: "2k", ext: "hdr" });
  }
  return out;
}

/** What is installed of the library: { total, installed, missing: [rel], complete }. */
export function libraryStatus(files) {
  const have = new Set(files || []);
  const wanted = wantedFiles();
  const missing = wanted.filter((w) => !have.has(w.rel)).map((w) => w.rel);
  return { total: wanted.length, installed: wanted.length - missing.length, missing, complete: missing.length === 0 };
}

/** The download URL and size of each wanted file (one API request per asset): { plan: [{ rel, url, size }], failed: [{ rel, error }] }. */
export async function planDownloads(fetchJson, files) {
  const byId = new Map();
  for (const f of files) { if (!byId.has(f.id)) byId.set(f.id, []); byId.get(f.id).push(f); }
  const plan = [], failed = [];
  for (const [id, list] of byId) {
    let meta;
    try { meta = await fetchJson(`${API}/files/${id}`); } catch (e) { for (const f of list) failed.push({ rel: f.rel, error: `Poly Haven: ${e.message || e}` }); continue; }
    for (const f of list) {
      const entry = meta && meta[f.key] && meta[f.key][f.res] && meta[f.key][f.res][f.ext];
      if (entry && entry.url) plan.push({ rel: f.rel, url: entry.url, size: entry.size || 0 });
      else failed.push({ rel: f.rel, error: `Poly Haven has no ${f.res} ${f.key} for ${id}` });
    }
  }
  return { plan, failed };
}

/**
 * Downloads what is missing (everything when `force`), a few files at a time. onProgress({ done, total, bytes,
 * totalBytes, file }) after each file. Returns { ok, downloaded, failed: [{ rel, error }], bytes }. A failed file
 * is reported, not retried: the caller asks the user (a popup with Retry).
 */
export async function installLibrary({ store, fetch, onProgress = () => {}, force = false, concurrency = 4, signal = null }) {
  const have = force ? new Set() : new Set(await store.list());
  const todo = wantedFiles().filter((w) => !have.has(w.rel));
  if (!todo.length) return { ok: true, downloaded: 0, failed: [], bytes: 0 };
  const fetchJson = async (url) => { const r = await fetch(url, { signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const { plan, failed } = await planDownloads(fetchJson, todo);
  const totalBytes = plan.reduce((s, x) => s + (x.size || 0), 0);
  let done = 0, bytes = 0, next = 0, downloaded = 0;
  onProgress({ done, total: plan.length, bytes, totalBytes, file: "" });
  const worker = async () => {
    while (next < plan.length) {
      if (signal && signal.aborted) return;
      const item = plan[next++];
      try {
        const r = await fetch(item.url, { signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = new Uint8Array(await r.arrayBuffer());
        if (item.size && data.length !== item.size) throw new Error(`incomplete (${data.length} of ${item.size} bytes)`);
        await store.write(item.rel, data);
        bytes += data.length;
        downloaded++;
      } catch (e) {
        failed.push({ rel: item.rel, error: signal && signal.aborted ? "cancelled" : e.message || String(e) });
        bytes += item.size || 0; // the bar still moves on
      }
      done++;
      onProgress({ done, total: plan.length, bytes, totalBytes, file: item.rel });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, plan.length)) }, worker));
  return { ok: failed.length === 0, downloaded, failed, bytes };
}

/** "12.3 MB" */
export const megabytes = (n) => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
