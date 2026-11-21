// Where the bundled sound library (sounds/: manifest.json + Ogg Opus samples, built by scripts/fetch-sounds.mjs)
// lives, and checking / repairing it.
//
//   web build   — served next to the page (dist/sounds/, the Vite dev server serves the project's sounds/).
//   desktop     — installed with the program as a resource (<resources>/sounds/), read through the asset protocol.
//                 Files fixed by `repairSounds` are kept in <app local data>/sounds/ and are used instead.
//
// Repair: the web build fetches missing or damaged files again from its own server (bypassing the browser's cache).
// The desktop program has no server of its own: it downloads from `baseUrl` (the `soundsBaseUrl` setting: a folder
// URL that holds the same sounds/ files, e.g. a public copy of this repository's sounds/ folder); without one it can
// only report the damage (reinstalling the program restores the files).
import { instrument, INSTRUMENTS } from '../music/instruments.js';

const framed = () => Boolean(new URLSearchParams(globalThis.location?.search ?? '').get('popup'));
const desktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__) && !framed();

let location = null;      // { kind, base, override }
let manifestPromise = null;
let manifest = null;
let repaired = {};        // desktop: file → sha256 of the copy in the override folder

const tauri = async () => {
  const [core, path] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/path')]);
  return { ...core, ...path };
};
const joinPath = (dir, rel) => `${dir.replace(/[\\/]+$/, '')}/${rel}`;
const isCancelled = (signal) => Boolean(signal?.aborted || signal?.cancelled);
const cancelledError = () => Object.assign(new Error('cancelled'), { code: 'cancelled' });

/** Where the library is: { kind: 'web' | 'desktop', base (URL of the sounds/ folder), override (desktop: folder path) }. */
export async function soundLocation() {
  if (location) return location;
  if (desktop()) {
    try {
      const t = await tauri();
      const resources = await t.resolveResource('sounds');
      const override = joinPath(await t.appLocalDataDir(), 'sounds');
      location = { kind: 'desktop', base: t.convertFileSrc(resources).replace(/\/?$/, '/'), override, resources, convert: t.convertFileSrc, invoke: t.invoke };
      try {
        const r = await fetch(location.convert(joinPath(override, 'repaired.json')), { cache: 'no-store' });
        if (r.ok) repaired = (await r.json())?.files ?? {};
      } catch { /* none repaired */ }
      // `tauri dev`: the resources may not be copied yet; the dev server has the project's sounds/.
      const probe = await fetch(`${location.base}manifest.json`, { method: 'GET', cache: 'no-store' }).then((r) => r.ok).catch(() => false);
      if (!probe && !repaired['manifest.json']) location.base = new URL('sounds/', globalThis.document?.baseURI ?? globalThis.location?.href).href;
      return location;
    } catch { /* fall through to the page's folder */ }
  }
  const page = globalThis.document?.baseURI ?? globalThis.location?.href ?? 'http://localhost/';
  location = { kind: 'web', base: new URL('sounds/', page).href };
  return location;
}

/** The URL of a library file ('manifest.json', 'grandPiano/C4-v1.ogg'). */
export async function soundUrl(rel) {
  const loc = await soundLocation();
  if (loc.kind === 'desktop' && repaired[rel]) return loc.convert(joinPath(loc.override, rel));
  return loc.base + rel.split('/').map(encodeURIComponent).join('/');
}

/** A library file's bytes. `reload`: past the browser's cache (repair). */
export async function fetchSoundFile(rel, { reload = false } = {}) {
  const response = await fetch(await soundUrl(rel), reload ? { cache: 'reload' } : {});
  if (!response.ok) throw Object.assign(new Error(`${rel}: HTTP ${response.status}`), { code: 'missing' });
  return new Uint8Array(await response.arrayBuffer());
}

/** The manifest (null when the library is not there). `fresh` reads it again. */
export function loadManifest({ fresh = false } = {}) {
  if (fresh) manifestPromise = null;
  manifestPromise ??= (async () => {
    try {
      const bytes = await fetchSoundFile('manifest.json', { reload: fresh });
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (parsed?.format !== 'myaudiomaker-sounds' || !parsed.sets) throw new Error('not a sound library manifest');
      manifest = parsed;
    } catch { manifest = null; }
    return manifest;
  })();
  return manifestPromise;
}

/** The manifest if it has been read (synchronous; null before). */
export const currentManifest = () => manifest;

/** Every file of a set (unique). */
export function setFiles(set) {
  const zones = set.kind === 'drums' ? Object.values(set.notes).flatMap((n) => n.layers) : set.layers.flatMap((l) => l.zones);
  return [...new Map(zones.map((z) => [z.file, z])).values()];
}

/** The sets an instrument plays (with a drum kit's shared percussion). */
export function setsOfInstrument(id, m = manifest) {
  const inst = instrument(id);
  const ids = [].concat(inst.samples ?? []);
  const out = [];
  for (const s of ids) { out.push(s); const also = m?.sets?.[s]?.also; if (also) out.push(also); }
  return [...new Set(out)];
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether bytes are the file the manifest describes: 'ok' | 'broken'. */
async function verify(bytes, entry) {
  if (entry.bytes != null && bytes.length !== entry.bytes) return 'broken';
  if (entry.sha256) { const h = await sha256Hex(bytes); if (h && h !== entry.sha256) return 'broken'; }
  return 'ok';
}

const worst = (list) => (list.includes('broken') ? 'broken' : list.every((s) => s === 'missing') && list.length ? 'missing' : list.includes('missing') || list.includes('partial') ? 'partial' : 'installed');

/**
 * Checks the library. Returns {
 *   available (the manifest was read), kind ('web' | 'desktop'), totalBytes, files, ok, missing, broken,
 *   summary: 'installed' | 'partial' | 'missing' | 'broken' | 'unavailable',
 *   sets: { [setId]: { status, files, missing, broken, bytes, instruments: [ids], categories: [ids] } },
 *   categories: { [categoryId]: { status, sets: [ids], instruments: [ids], missing, broken } },
 *   repair: { possible, how: 'server' | 'download' | 'reinstall', baseUrl } }
 * Options: { decode (also decode every file: slower, finds damage the size and hash miss), baseUrl, onProgress, signal }.
 * onProgress({ phase: 'check', fraction, done, total, bytes, totalBytes, set }).
 */
export async function soundLibraryStatus({ decode = false, baseUrl = '', onProgress = null, signal = null } = {}) {
  const loc = await soundLocation();
  const m = await loadManifest({ fresh: true });
  const repair = repairPlan(loc, baseUrl);
  if (!m) return { available: false, kind: loc.kind, totalBytes: 0, files: 0, ok: 0, missing: 0, broken: 0, summary: 'unavailable', sets: {}, categories: {}, repair };
  const decoder = decode ? (await import('./ogg-opus.js')).decodeOggOpus : null;
  const entries = Object.entries(m.sets).flatMap(([setId, set]) => setFiles(set).map((z) => ({ setId, z })));
  const totalBytes = entries.reduce((s, e) => s + (e.z.bytes ?? 0), 0);
  const result = new Map();
  let done = 0; let bytes = 0;
  const step = async ({ setId, z }) => {
    if (isCancelled(signal)) throw cancelledError();
    let status = 'missing';
    try {
      const data = await fetchSoundFile(z.file, { reload: true });
      status = await verify(data, z);
      if (status === 'ok' && decoder) { try { await decoder(data); } catch { status = 'broken'; } }
    } catch (error) { status = error?.code === 'missing' || error instanceof TypeError ? 'missing' : 'broken'; }
    result.set(z.file, status);
    done += 1; bytes += z.bytes ?? 0;
    onProgress?.({ phase: 'check', fraction: totalBytes ? bytes / totalBytes : done / entries.length, done, total: entries.length, bytes, totalBytes, set: setId });
  };
  await runPool(entries, 4, step);
  const byInstrumentSet = {};
  for (const inst of INSTRUMENTS) for (const s of setsOfInstrument(inst.id, m)) (byInstrumentSet[s] ??= []).push(inst);
  const sets = {};
  for (const [setId, set] of Object.entries(m.sets)) {
    const files = setFiles(set).map((z) => result.get(z.file));
    const missing = files.filter((s) => s === 'missing').length;
    const broken = files.filter((s) => s === 'broken').length;
    const insts = byInstrumentSet[setId] ?? [];
    sets[setId] = { status: broken ? 'broken' : missing === files.length ? 'missing' : missing ? 'partial' : 'installed', files: files.length, missing, broken, bytes: set.bytes ?? 0, instruments: insts.map((i) => i.id), categories: [...new Set(insts.map((i) => i.category))] };
  }
  const categories = {};
  for (const [setId, s] of Object.entries(sets)) for (const c of s.categories) {
    const cat = (categories[c] ??= { statuses: [], sets: [], instruments: new Set(), missing: 0, broken: 0 });
    cat.statuses.push(s.status); cat.sets.push(setId); s.instruments.forEach((i) => cat.instruments.add(i)); cat.missing += s.missing; cat.broken += s.broken;
  }
  for (const c of Object.values(categories)) { c.status = worst(c.statuses); c.instruments = [...c.instruments]; delete c.statuses; }
  const all = [...result.values()];
  const counts = { ok: all.filter((s) => s === 'ok').length, missing: all.filter((s) => s === 'missing').length, broken: all.filter((s) => s === 'broken').length };
  const problems = [...result].filter(([, s]) => s !== 'ok').map(([file, s]) => ({ file, status: s }));
  return { available: true, kind: loc.kind, version: m.version, totalBytes, files: all.length, ...counts, summary: counts.broken ? 'broken' : counts.missing === all.length ? 'missing' : counts.missing ? 'partial' : 'installed', sets, categories, problems, repair };
}

function repairPlan(loc, baseUrl) {
  if (loc.kind === 'web') return { possible: true, how: 'server', baseUrl: loc.base };
  const url = String(baseUrl ?? '').trim();
  return url ? { possible: true, how: 'download', baseUrl: url.replace(/\/?$/, '/') } : { possible: false, how: 'reinstall', baseUrl: '' };
}

async function runPool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await fn(items[next++]); }));
}

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * Fetches missing or damaged files again. Web: from the page's own server (past the browser cache). Desktop: from
 * `baseUrl` (required: { ok: false, reason: 'noBaseUrl' } without it) into <app local data>/sounds/.
 * Afterwards the sampler forgets what it had decoded, so the next play loads the fixed files.
 * Returns { ok, fixed, failed: [files], reason?, status } — `status` is soundLibraryStatus() afterwards.
 * onProgress({ phase: 'check' | 'download', fraction, done, total, bytes, totalBytes, file }).
 */
export async function repairSounds({ baseUrl = '', onProgress = null, signal = null } = {}) {
  const loc = await soundLocation();
  const plan = repairPlan(loc, baseUrl);
  if (!plan.possible) return { ok: false, reason: 'noBaseUrl', fixed: 0, failed: [], status: await soundLibraryStatus({ onProgress, signal }) };
  let m = await loadManifest({ fresh: true });
  // Desktop without an installed manifest: take the remote one.
  if (!m && loc.kind === 'desktop') {
    try {
      const r = await fetch(`${plan.baseUrl}manifest.json`, { cache: 'reload' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const parsed = JSON.parse(text);
      if (parsed?.format !== 'myaudiomaker-sounds') throw new Error('not a sound library');
      await loc.invoke('write_text_file', { path: joinPath(loc.override, 'manifest.json'), content: text, op: '' });
      repaired['manifest.json'] = 'remote';
      m = await loadManifest({ fresh: true });
    } catch (error) { return { ok: false, reason: 'download', error: String(error?.message ?? error), fixed: 0, failed: ['manifest.json'], status: await soundLibraryStatus({ baseUrl, signal }) }; }
  }
  if (!m) return { ok: false, reason: 'unavailable', fixed: 0, failed: ['manifest.json'], status: await soundLibraryStatus({ baseUrl, signal }) };
  const before = await soundLibraryStatus({ baseUrl, signal, onProgress: (p) => onProgress?.({ ...p, phase: 'check', fraction: p.fraction * 0.3 }) });
  const badFiles = new Set((before.problems ?? []).map((p) => p.file));
  const bad = [...new Map(Object.values(m.sets).flatMap((set) => setFiles(set)).filter((z) => badFiles.has(z.file)).map((z) => [z.file, z])).values()];
  const totalBytes = bad.reduce((s, z) => s + (z.bytes ?? 0), 0);
  const failed = [];
  let done = 0; let bytes = 0;
  await runPool(bad, 3, async (z) => {
    if (isCancelled(signal)) throw cancelledError();
    try {
      let data;
      if (loc.kind === 'web') data = await fetchSoundFile(z.file, { reload: true });
      else {
        const r = await fetch(plan.baseUrl + z.file.split('/').map(encodeURIComponent).join('/'), { cache: 'reload' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = new Uint8Array(await r.arrayBuffer());
      }
      if (await verify(data, z) !== 'ok') throw new Error('the downloaded file does not match the library');
      if (loc.kind === 'desktop') {
        await loc.invoke('write_base64_file', { path: joinPath(loc.override, z.file), data: toBase64(data), op: '' });
        repaired[z.file] = z.sha256 ?? 'ok';
      }
    } catch { failed.push(z.file); }
    done += 1; bytes += z.bytes ?? 0;
    onProgress?.({ phase: 'download', fraction: 0.3 + 0.7 * (totalBytes ? bytes / totalBytes : done / Math.max(1, bad.length)), done, total: bad.length, bytes, totalBytes, file: z.file });
  });
  if (loc.kind === 'desktop' && bad.length) {
    await loc.invoke('write_text_file', { path: joinPath(loc.override, 'repaired.json'), content: JSON.stringify({ files: repaired }), op: '' }).catch(() => {});
  }
  const { forgetSamples } = await import('./sampler.js');
  forgetSamples();
  const status = await soundLibraryStatus({ baseUrl, signal });
  return { ok: !failed.length, fixed: bad.length - failed.length, failed, status };
}
