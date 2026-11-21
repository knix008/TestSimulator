// The AI singing voice: DiffSinger voice banks (OpenUtau layout) sung with onnxruntime-web.
//
//   listBanks() · bankInfo(id) · acceptLicence(id) · isAccepted(id)
//   downloadBank(id, { onProgress, signal }) · redownload(id, …) · importBank(input, …) · removeBank(id)
//   cancelDownload(id) · downloadStatus() · onVoiceEvent(cb) · initVoiceService()
//   ensureVoiceReady(bankId, { onProgress, signal })  — fetches whatever is missing (bank + vocoder)
//   renderVocal(song, track, bankId, { onProgress, signal, speaker, steps, backend }) → { sampleRate, channelData, startBeat, key }
//   vocalCacheKey(song, track, bankId, opts) · testVoice(bankId, opts) · backendInfo() · disposeVoice()
//
// Windows: on the desktop every window talks to Rust directly and downloads run in Rust (they keep
// going when a popup closes; progress reaches every window as an event). In the web build popups
// are frames: long jobs (download, import) are sent to the main window (initVoiceService) over a
// BroadcastChannel, and progress comes back the same way.
import { CATALOG, DEFAULT_BANK, externalVocoder } from './catalog.js';
import { readBankLayout, readVocoderLayout } from './bank.js';
import { makeReader } from './reader.js';
import { sha256Hex } from './sha256.js';
import { splitPhrases } from './timing.js';
import { isDesktop, isFramed, store, VoiceError, webDownload, webInstall } from './storage.js';

export { CATALOG, DEFAULT_BANK, TIGER_ID, PC_NSF_ID, IMPORT_HINTS } from './catalog.js';
export { VoiceError } from './storage.js';

/** Bumped when the singing code changes what it renders (old cached phrases are not reused). */
export const ENGINE_VERSION = 1;
export const STEPS = [10, 20, 50];
export const BACKENDS = ['auto', 'webgpu', 'wasm'];

// ───────────────────────── licences (accepted once per bank, kept on this computer)

const ACCEPT_KEY = 'myaudiomaker.voiceLicences.v1';
const VERDICT_KEY = 'myaudiomaker.voiceBackend.v1';
const lsGet = (key, fallback) => { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const lsSet = (key, value) => { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

export const isAccepted = (id) => Boolean(lsGet(ACCEPT_KEY, {})[id]);

/** Records that the user read and accepted a bank's (or vocoder's) licence. */
export function acceptLicence(id, accepted = true) { return viaHost('acceptLicence', [id, accepted], () => acceptHere(id, accepted)); }
async function acceptHere(id, accepted) {
  const all = lsGet(ACCEPT_KEY, {});
  if (accepted) all[id] = new Date().toISOString(); else delete all[id];
  lsSet(ACCEPT_KEY, all);
  const entry = (await installed()).find((e) => e.id === id);
  if (entry) await store().writeMeta(entry, { ...(entry.meta ?? {}), accepted: accepted ? all[id] : null }).catch(() => {});
  changed();
  return accepted;
}

// ───────────────────────── events (this window, other windows)

const listeners = new Set();
const jobs = new Map(); // id → last progress
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('myaudiomaker-voice') : null;
channel?.unref?.(); // Node (tests): do not keep the process alive.
let host = false;
let desktopUnlisten = null;

function emit(event, { broadcast = true } = {}) {
  if (event.type === 'progress') jobs.set(event.progress.id, event.progress);
  for (const cb of [...listeners]) { try { cb(event); } catch { /* a listener failed */ } }
  if (broadcast && channel) channel.postMessage({ type: 'event', event });
}
const changed = () => { cachedList = null; emit({ type: 'changed' }); };

/** Subscribes to { type: 'progress', progress } and { type: 'changed' } events; returns unsubscribe. */
export function onVoiceEvent(cb) {
  listeners.add(cb);
  ensureDesktopListener();
  return () => listeners.delete(cb);
}

function ensureDesktopListener() {
  if (!isDesktop() || desktopUnlisten) return;
  desktopUnlisten = store().listen((progress) => {
    const p = withFraction(progress);
    jobs.set(p.id, p);
    if (p.phase === 'ready') cachedList = null;
    for (const cb of [...listeners]) { try { cb({ type: 'progress', progress: p }); } catch { /* ignore */ } }
    if (p.phase === 'ready') for (const cb of [...listeners]) { try { cb({ type: 'changed' }); } catch { /* ignore */ } }
  });
}

const withFraction = (p) => ({ ...p, fraction: p.phase === 'ready' ? 1 : p.total > 0 ? Math.min(1, p.done / p.total) : 0 });

// Messages from other windows: events, and (main window only) requests from popup frames.
channel?.addEventListener('message', async ({ data }) => {
  if (data?.type === 'event') {
    if (data.event.type === 'progress') jobs.set(data.event.progress.id, data.event.progress);
    if (data.event.type === 'changed') cachedList = null;
    for (const cb of [...listeners]) { try { cb(data.event); } catch { /* ignore */ } }
    return;
  }
  if (data?.type === 'rpc' && host) {
    channel.postMessage({ type: 'rpc-ack', id: data.id });
    const reply = (msg) => channel.postMessage({ type: 'rpc-result', id: data.id, ...msg });
    try {
      const fn = { downloadBank, redownload, importBank, removeBank, cancelDownload, listBanks, bankInfo, acceptLicence, jobs: async () => [...jobs.values()] }[data.method];
      if (!fn) throw new VoiceError('rpc', `Unknown request ${data.method}`);
      reply({ ok: true, value: await fn(...(data.args ?? [])) });
    } catch (error) { reply({ ok: false, error: { code: error.code ?? 'error', message: String(error.message ?? error) } }); }
  }
});

/** Call in the main window once: it then runs downloads and imports for popup frames (web build). */
export function initVoiceService() {
  host = true;
  ensureDesktopListener();
  if (isDesktop()) store().jobs().then((list) => { for (const p of list) jobs.set(p.id, withFraction(p)); }).catch(() => {});
}

let rpcSeq = 0;
/** Runs `method` in the main window (web popups); falls back to this window when nobody answers. */
function viaHost(method, args, local, { jobId = null, onProgress = null } = {}) {
  if (host || isDesktop() || !isFramed() || !channel) return local();
  return new Promise((resolve, reject) => {
    const id = `${Date.now().toString(36)}-${++rpcSeq}`;
    let acked = false;
    // The caller's progress comes from the host's broadcast events.
    const off = onProgress ? onVoiceEvent((e) => { if (e.type === 'progress' && (!jobId || e.progress.id === jobId)) onProgress(e.progress); }) : () => {};
    const onMessage = ({ data }) => {
      if (data?.id !== id) return;
      if (data.type === 'rpc-ack') { acked = true; return; }
      if (data.type !== 'rpc-result') return;
      channel.removeEventListener('message', onMessage);
      off();
      if (data.ok) resolve(data.value); else reject(new VoiceError(data.error.code, data.error.message));
    };
    channel.addEventListener('message', onMessage);
    channel.postMessage({ type: 'rpc', id, method, args });
    // No main window answered (a popup opened on its own): do it here.
    setTimeout(() => { if (!acked) { channel.removeEventListener('message', onMessage); off(); local().then(resolve, reject); } }, 1500);
  });
}

// ───────────────────────── installed banks

let cachedList = null;
async function installed() {
  if (!cachedList) cachedList = store().list().catch((error) => { cachedList = null; throw error; });
  return cachedList;
}

const layoutCache = new Map();
async function layoutOf(entry) {
  const key = `${entry.id}|${entry.files.length}|${entry.files.reduce((a, f) => a + f.size, 0)}`;
  if (!layoutCache.has(key)) {
    const read = (path, kind) => store().read(entry, path, kind);
    const kind = entry.meta?.kind ?? (CATALOG[entry.id]?.kind) ?? (entry.files.some((f) => f.path.toLowerCase() === 'dsconfig.yaml') ? 'bank' : 'vocoder');
    layoutCache.set(key, (kind === 'vocoder' ? readVocoderLayout(entry.files, read).then((l) => ({ ...l, kind })) : readBankLayout(entry.files, read).then((l) => ({ ...l, kind })))
      .catch((error) => ({ kind, error: error.message, code: error.code ?? 'broken', problems: [error.message] })));
  }
  return layoutCache.get(key);
}

/** Every bank and vocoder: installed ones and the downloadable ones. */
export function listBanks() { return viaHost('listBanks', [], listHere); }
async function listHere() {
  const list = await refreshSync();
  const out = [];
  for (const entry of list) {
    const layout = await layoutOf(entry);
    const cat = CATALOG[entry.id];
    out.push({
      id: entry.id, kind: layout.kind, installed: true, catalog: Boolean(cat),
      name: entry.meta?.name ?? layout.name ?? cat?.name ?? entry.id, version: layout.version || cat?.version || '',
      languages: layout.languages ?? cat?.languages ?? [], size: entry.files.reduce((a, f) => a + f.size, 0),
      speakers: layout.speakers ?? [], licence: cat?.licence ?? entry.meta?.licence ?? '', accepted: isAccepted(entry.id),
      status: layout.problems?.length ? 'broken' : 'installed', problems: layout.problems ?? [],
      vocoder: layout.kind === 'bank' && !layout.error ? vocoderNeed(entry.id, layout, entry.meta) : null,
    });
  }
  for (const cat of Object.values(CATALOG)) {
    if (out.some((b) => b.id === cat.id)) continue;
    out.push({ id: cat.id, kind: cat.kind, installed: false, catalog: true, name: cat.name, version: cat.version, languages: cat.languages ?? [], size: cat.installedSize ?? cat.size, speakers: [], licence: cat.licence, accepted: isAccepted(cat.id), status: 'missing', problems: [], vocoder: null });
  }
  for (const b of out) {
    const job = jobs.get(b.id);
    if (job && ['queued', 'download', 'verify', 'unzip'].includes(job.phase)) { b.status = 'downloading'; b.progress = job; }
    else if (job && job.phase === 'error') b.lastError = job;
  }
  return out;
}

/** What vocoder a bank needs: { bundled } or { id, installed }. */
function vocoderNeed(bankId, layout, meta) {
  const id = externalVocoder(bankId, layout, meta);
  if (!id) return { bundled: true };
  return { bundled: false, id, named: layout.vocoder?.dependency ?? null, installed: Boolean(cachedListSync?.some((e) => e.id === id)) };
}
let cachedListSync = null;
const refreshSync = async () => { cachedListSync = await installed().catch(() => []); return cachedListSync; };

/** Download / install state of every catalog item and installed bank: { [id]: { state, progress, version, size } }. */
export async function downloadStatus() {
  if (isFramed() && !isDesktop() && channel) {
    try { for (const p of await viaHost('jobs', [], async () => [...jobs.values()])) jobs.set(p.id, p); } catch { /* none */ }
  }
  if (isDesktop()) { try { for (const p of await store().jobs()) jobs.set(p.id, withFraction(p)); } catch { /* none */ } }
  await refreshSync();
  const out = {};
  for (const b of await listBanks()) out[b.id] = { state: b.status, progress: b.progress ?? null, version: b.version, size: b.size, error: b.lastError ?? null };
  return out;
}

const readText = async (entry, path) => {
  try {
    const text = await store().read(entry, path, 'text');
    if (/\.url$/i.test(path)) return (/^URL=(.*)$/m.exec(text)?.[1] ?? '').trim();
    return text.length > 40000 ? `${text.slice(0, 40000)}\n…` : text;
  } catch { return ''; }
};

/** Everything the settings show about a bank, including its licence and credit texts. */
export function bankInfo(id) { return viaHost('bankInfo', [id], () => infoHere(id)); }
async function infoHere(id) {
  await refreshSync();
  const entry = (await installed()).find((e) => e.id === id);
  const cat = CATALOG[id] ?? null;
  if (!entry) {
    if (!cat) throw new VoiceError('notInstalled', `No voice bank ${id}`);
    return { id, kind: cat.kind, installed: false, catalog: true, name: cat.name, author: cat.author, version: cat.version, languages: cat.languages ?? [], size: cat.installedSize ?? cat.size, download: cat.size, speakers: [], accepted: isAccepted(id), status: jobs.get(id)?.phase && !['ready', 'error', 'cancelled'].includes(jobs.get(id).phase) ? 'downloading' : 'missing', problems: [], licence: { name: cat.licence, url: cat.licenceUrl, page: cat.page, terms: cat.terms, files: [] }, credits: { author: cat.author, web: cat.page } };
  }
  const layout = await layoutOf(entry);
  const files = [];
  for (const path of layout.licenceFiles ?? []) files.push({ path, text: await readText(entry, path), link: /\.url$/i.test(path) });
  const character = layout.config ? { author: layout.author, voice: layout.voice, web: layout.web } : {};
  return {
    id, kind: layout.kind, installed: true, catalog: Boolean(cat), name: entry.meta?.name ?? layout.name ?? cat?.name ?? id, author: layout.author || cat?.author || '', version: layout.version || cat?.version || layout.id || '',
    languages: layout.languages ?? [], size: entry.files.reduce((a, f) => a + f.size, 0), speakers: layout.speakers ?? [], accepted: isAccepted(id),
    status: layout.problems?.length ? 'broken' : 'installed', problems: layout.problems ?? [], error: layout.error ?? null,
    licence: { name: cat?.licence ?? '', url: cat?.licenceUrl ?? '', page: cat?.page ?? layout.web ?? '', terms: cat?.terms ?? null, files },
    credits: { ...character, author: character.author || cat?.author || '' },
    vocoder: layout.kind === 'bank' && !layout.error ? vocoderNeed(id, layout, entry.meta) : null,
  };
}

// ───────────────────────── installing

/** Waits for a desktop job's end, passing its progress on. */
function followDesktopJob(id, onProgress, signal) {
  return new Promise((resolve, reject) => {
    let un = null;
    const stop = () => { un?.then?.((f) => f()); };
    const abort = () => { store().cancel(id).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    un = store().listen((p) => {
      if (p.id !== id) return;
      const q = withFraction(p);
      onProgress?.(q);
      if (p.phase === 'ready') { stop(); signal?.removeEventListener('abort', abort); resolve(q); }
      else if (p.phase === 'error' || p.phase === 'cancelled') { stop(); signal?.removeEventListener('abort', abort); reject(new VoiceError(p.code || p.phase, p.error || p.phase)); }
    });
  });
}

/** After an install: check the layout, keep the metadata, tell every window. */
async function afterInstall(id, extra) {
  cachedList = null;
  layoutCache.clear();
  const entry = (await installed()).find((e) => e.id === id);
  if (!entry) throw new VoiceError('broken', 'The bank was not installed.');
  const layout = await layoutOf(entry);
  const meta = { ...(entry.meta ?? {}), kind: layout.kind, name: layout.name ?? layout.id ?? id, version: layout.version ?? '', installedAt: new Date().toISOString(), accepted: lsGet(ACCEPT_KEY, {})[id] ?? null, ...extra };
  await store().writeMeta(entry, meta).catch(() => {});
  changed();
  if (layout.problems?.length) throw new VoiceError(layout.code === 'isVocoder' ? 'isVocoder' : 'broken', layout.problems.join(', '));
  return bankInfo(id);
}

/** Downloads a catalog bank or vocoder (TIGER by default). The licence must have been accepted. */
export function downloadBank(id = DEFAULT_BANK, { onProgress = null, signal = null, fresh = false } = {}) {
  return viaHost(fresh ? 'redownload' : 'downloadBank', [id], async () => {
    const item = CATALOG[id];
    if (!item) throw new VoiceError('notInstalled', `Nothing to download for ${id}`);
    if (!isAccepted(id)) { const e = new VoiceError('licence', 'The licence has not been accepted.'); e.id = id; throw e; }
    const report = (p) => { const q = withFraction({ id, kind: item.kind, ...p }); emit({ type: 'progress', progress: q }, { broadcast: !isDesktop() }); onProgress?.(q); };
    if (isDesktop()) {
      ensureDesktopListener();
      const follow = followDesktopJob(id, onProgress, signal);
      await store().download(item, { fresh });
      await follow;
    } else {
      if (webAborts.has(id)) throw new VoiceError('busy', 'It is already downloading.');
      const ac = new AbortController();
      webAborts.set(id, ac);
      signal?.addEventListener('abort', () => ac.abort(), { once: true });
      try {
        if (fresh) await store().remove(id).catch(() => {});
        await webDownload(item, { fresh, signal: ac.signal, onProgress: report });
      } catch (error) {
        report({ phase: error.code === 'cancelled' ? 'cancelled' : 'error', code: error.code ?? 'network', error: error.message, done: 0, total: item.size });
        throw error;
      } finally { webAborts.delete(id); }
    }
    return afterInstall(id, { catalog: id, source: item.url });
  }, { jobId: id, onProgress });
}

/** Deletes a catalog item and fetches it again (repair). */
export const redownload = (id, opts = {}) => downloadBank(id, { ...opts, fresh: true });

/** Stops a running download (desktop: the part fetched is kept and resumed next time). */
export function cancelDownload(id) {
  return viaHost('cancelDownload', [id], async () => {
    if (isDesktop()) return store().cancel(id);
    webAborts.get(id)?.abort();
    return undefined;
  });
}
const webAborts = new Map();

const importId = () => `bank-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Installs an OpenUtau DiffSinger voice bank (or a vocoder package) from a .zip: a File / Blob /
 * Uint8Array / ArrayBuffer, or on the desktop a file path. Returns bankInfo of the new bank. The bank
 * must still be accepted (acceptLicence) before it sings.
 */
export function importBank(input, { onProgress = null, signal = null, kind = 'auto' } = {}) {
  return viaHost('importBank', [input], async () => {
    const id = importId();
    const guess = kind === 'auto' ? (/\.oudep$/i.test(input?.name ?? String(input ?? '')) ? 'vocoder' : 'bank') : kind;
    const report = (p) => { const q = withFraction({ id, kind: guess, ...p }); emit({ type: 'progress', progress: q }, { broadcast: !isDesktop() }); onProgress?.(q); };
    const run = async (k) => {
      if (isDesktop()) {
        if (typeof input !== 'string') throw new VoiceError('unsupported', 'Choose the zip file with the file dialog on the desktop.');
        ensureDesktopListener();
        const follow = followDesktopJob(id, onProgress, signal);
        await store().importPath(id, k, input);
        await follow;
      } else {
        const blob = input instanceof Blob ? input : new Blob([input]);
        await webInstall(blob.stream(), { id, kind: k, size: blob.size, signal, onProgress: report });
        report({ phase: 'ready', done: blob.size, total: blob.size });
      }
    };
    try { await run(guess); } catch (error) {
      // A vocoder package picked as a bank (or the other way round): try the other kind.
      if (error.code === 'isVocoder' || error.code === 'isBank') await run(error.code === 'isVocoder' ? 'vocoder' : 'bank'); else throw error;
    }
    const info = await afterInstall(id, { importedFrom: typeof input === 'string' ? input.split(/[\\/]/).pop() : input?.name ?? '' });
    // The same bank imported again replaces the older copy.
    for (const e of await installed()) {
      if (e.id === id || CATALOG[e.id]) continue;
      if (e.meta?.name === info.name && (e.meta?.version ?? '') === (info.version ?? '')) await removeBank(e.id).catch(() => {});
    }
    return info;
  }, { onProgress });
}

/** Removes an installed bank or vocoder. */
export function removeBank(id) {
  return viaHost('removeBank', [id], async () => {
    await store().remove(id);
    layoutCache.clear();
    jobs.delete(id);
    changed();
    return true;
  });
}

/**
 * Makes a bank ready to sing: downloads the bank (catalog banks) and the vocoder it needs when they
 * are missing. Throws VoiceError 'licence' (with .id) when a licence still has to be accepted —
 * show it, call acceptLicence(id), then call this again. Progress: { step: 'bank' | 'vocoder', … }.
 */
export async function ensureVoiceReady(bankId = DEFAULT_BANK, { onProgress = null, signal = null } = {}) {
  const need = (id) => { const e = new VoiceError('licence', 'The licence has not been accepted.'); e.id = id; return e; };
  let entry = (await installed()).find((e) => e.id === bankId);
  if (!entry) {
    if (!CATALOG[bankId]) throw new VoiceError('notInstalled', `The voice bank ${bankId} is not installed.`);
    if (!isAccepted(bankId)) throw need(bankId);
    await downloadBank(bankId, { signal, onProgress: (p) => onProgress?.({ step: 'bank', ...p }) });
    entry = (await installed()).find((e) => e.id === bankId);
  }
  if (!isAccepted(bankId)) throw need(bankId);
  const layout = await layoutOf(entry);
  if (layout.error || layout.problems?.length) throw new VoiceError('broken', (layout.problems ?? [layout.error]).join(', '));
  if (layout.kind !== 'bank') throw new VoiceError('notBank', `${bankId} is not a voice bank.`);
  const vid = externalVocoder(bankId, layout, entry.meta);
  if (vid) {
    if (!(await installed()).some((e) => e.id === vid)) {
      if (!isAccepted(vid)) throw need(vid);
      await downloadBank(vid, { signal, onProgress: (p) => onProgress?.({ step: 'vocoder', ...p }) });
    }
  }
  onProgress?.({ step: 'ready', phase: 'ready', fraction: 1 });
  return bankInfo(bankId);
}

// ───────────────────────── rendering

let worker = null;
let workerInfo = null;
let jobSeq = 0;
const pending = new Map();

const ortBase = () => new URL('ort/', globalThis.location?.href ?? 'http://localhost/').href;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'singer' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'info') { workerInfo = data.info; pending.get('info')?.(data.info); pending.delete('info'); return; }
    pending.get(data.job)?.(data);
  };
  worker.onerror = (event) => { for (const fn of pending.values()) fn({ type: 'error', message: event.message || 'The voice worker failed', code: 'worker' }); };
  return worker;
}

/** onnxruntime and the device: { ort, webgpu, adapter, isolated, threads, ep?, check? }. */
export function backendInfo() {
  if (workerInfo) return Promise.resolve(workerInfo);
  return new Promise((resolve) => { pending.set('info', resolve); getWorker().postMessage({ type: 'info', ort: { base: ortBase() } }); });
}

/** Releases the worker (and the gigabyte of models it holds). */
export function disposeVoice() {
  worker?.terminate();
  worker = null;
  workerInfo = null;
  phraseCache.clear();
}

const phraseCache = new Map(); // key → { startMs (relative), samples }
let cacheBytes = 0;
const CACHE_LIMIT = 320 * 1024 * 1024;
function remember(key, value) {
  if (phraseCache.has(key)) return;
  phraseCache.set(key, value);
  cacheBytes += value.samples.byteLength;
  for (const [k, v] of phraseCache) { if (cacheBytes <= CACHE_LIMIT) break; phraseCache.delete(k); cacheBytes -= v.samples.byteLength; }
}

const vocalNotes = (track) => (track?.notes ?? []).map((n) => ({ t: n.t, d: n.d, p: n.p, v: n.v, syl: n.syl ?? '' }));

/** A key for the sung result: the vocal notes and syllables, tempo, swing, bank, speaker, quality. */
export function vocalCacheKey(song, track, bankId, { speaker = '', steps = 20 } = {}) {
  return sha256Hex(new TextEncoder().encode(JSON.stringify([ENGINE_VERSION, bankId, String(speaker ?? ''), Number(steps), Number(song?.bpm), Number(song?.swing ?? 0), song?.language ?? 'ko', vocalNotes(track)])));
}

/** A phrase's key: its notes relative to its first note (a phrase that only moved is reused). */
export function phraseKey(phrase, bankId, speaker, steps, language) {
  const t0 = phrase.notes[0].startMs;
  const notes = phrase.notes.map((n) => [Math.round((n.startMs - t0) * 10) / 10, Math.round((n.endMs - t0) * 10) / 10, n.midi, n.syl]);
  return sha256Hex(new TextEncoder().encode(JSON.stringify([ENGINE_VERSION, bankId, String(speaker ?? ''), Number(steps), language, notes])));
}

async function sourceAndFiles(entry) {
  return { source: await store().source(entry), files: entry.files };
}

const lastSong = new Map(); // song key → result

/**
 * Sings a song's vocal track with a voice bank. Time 0 of the result is beat 0 of the song (tempo
 * and swing as the player plays them). Unchanged phrases come from the cache. Call ensureVoiceReady
 * first. Progress: { stage: 'check' | 'load' | 'render', fraction, phrase, phrases }.
 */
export async function renderVocal(song, track, bankId = DEFAULT_BANK, { onProgress = null, signal = null, speaker = '', steps = 20, backend = 'auto' } = {}) {
  const key = vocalCacheKey(song, track, bankId, { speaker, steps });
  if (lastSong.has(key)) return lastSong.get(key);
  const list = await installed();
  const entry = list.find((e) => e.id === bankId);
  if (!entry) throw new VoiceError('notInstalled', `The voice bank ${bankId} is not installed.`);
  if (!isAccepted(bankId)) { const e = new VoiceError('licence', 'The licence has not been accepted.'); e.id = bankId; throw e; }
  const layout = await layoutOf(entry);
  if (layout.error || layout.problems?.length) throw new VoiceError('broken', (layout.problems ?? [layout.error]).join(', '));
  let vocEntry = null;
  const vocId = externalVocoder(bankId, layout, entry.meta);
  if (vocId) {
    vocEntry = list.find((e) => e.id === vocId);
    if (!vocEntry) { const e = new VoiceError('vocoderMissing', 'The vocoder is not installed.'); e.id = vocId; throw e; }
  }
  const spk = speaker || layout.speakers[0]?.id || '';
  const language = song?.language === 'en' ? 'en' : 'ko';
  const phrases = splitPhrases(track?.notes ?? [], { bpm: song.bpm, swing: song.swing ?? 0 });
  const results = new Array(phrases.length);
  const todo = [];
  phrases.forEach((p, i) => {
    p.key = phraseKey(p, `${bankId}@${layout.version}`, spk, steps, language);
    const hit = phraseCache.get(p.key);
    if (hit) results[i] = { startMs: p.notes[0].startMs + hit.startMs, samples: hit.samples };
    else todo.push({ phrase: p, index: i });
  });
  let info = workerInfo;
  const unknown = new Set();
  if (todo.length) {
    const { source, files } = await sourceAndFiles(entry);
    const voc = vocEntry ? await sourceAndFiles(vocEntry) : null;
    const job = ++jobSeq;
    const w = getWorker();
    const verdicts = lsGet(VERDICT_KEY, {});
    await new Promise((resolve, reject) => {
      const onAbort = () => w.postMessage({ type: 'cancel', job });
      signal?.addEventListener('abort', onAbort, { once: true });
      pending.set(job, (msg) => {
        if (msg.type === 'progress') {
          const fraction = msg.stage === 'render' ? (msg.total ? msg.done / msg.total : 0) : 0;
          onProgress?.({ stage: msg.stage, model: msg.model, fraction, phrase: msg.phrase, phrases: msg.phrases ?? todo.length, cached: phrases.length - todo.length, loaded: msg.stage === 'load' ? msg.done / Math.max(1, msg.total) : 1 });
        } else if (msg.type === 'phrase') {
          const item = todo[msg.index];
          results[item.index] = { startMs: msg.startMs, samples: msg.samples };
          remember(item.phrase.key, { startMs: msg.startMs - item.phrase.notes[0].startMs, samples: msg.samples });
          for (const u of msg.unknown ?? []) unknown.add(u);
        } else if (msg.type === 'done') {
          info = msg.info; workerInfo = { ...workerInfo, ...msg.info };
          if (msg.info?.check && msg.info.adapter) { verdicts[`${msg.info.ort}|${msg.info.adapter}|${bankId}`] = msg.info.check; lsSet(VERDICT_KEY, verdicts); }
          pending.delete(job); signal?.removeEventListener('abort', onAbort); resolve();
        } else if (msg.type === 'error') {
          pending.delete(job); signal?.removeEventListener('abort', onAbort);
          reject(new VoiceError(msg.code ?? 'render', msg.message));
        }
      });
      backendInfo().then((bi) => {
        const verdict = verdicts[`${bi.ort}|${bi.adapter}|${bankId}`] ?? null;
        w.postMessage({
          type: 'render', job, bankKey: `${bankId}@${layout.version}|${entry.files.length}|${vocId ?? ''}`, source, files, vocoderSource: voc?.source ?? null, vocoderFiles: voc?.files ?? null,
          speaker: spk, phrases: todo.map((x) => x.phrase), opts: { steps, backend, verdict, fallbackLang: language }, ort: { base: ortBase() },
        });
      });
    }).catch(async (error) => {
      // The bank's own vocoder does not run here: remember it; it sings through PC-NSF-HiFiGAN.
      if (error.code !== 'vocoderLoad' || vocEntry) throw error;
      await store().writeMeta(entry, { ...(entry.meta ?? {}), vocoderUnsupported: true }).catch(() => {});
      cachedList = null;
      layoutCache.clear();
      changed();
      const e = new VoiceError('vocoderMissing', "This bank's own vocoder cannot run here; it needs PC-NSF-HiFiGAN.");
      e.id = externalVocoder(bankId, layout, { vocoderUnsupported: true });
      throw e;
    });
  }
  // Mix the phrases into one track from beat 0.
  const rate = 44100;
  let end = 0;
  for (const r of results) if (r) end = Math.max(end, Math.round((r.startMs / 1000) * rate) + r.samples.length);
  const out = new Float32Array(Math.max(1, end));
  const fade = Math.round(rate * 0.005);
  for (const r of results) {
    if (!r) continue;
    const at = Math.round((r.startMs / 1000) * rate);
    const n = r.samples.length;
    for (let i = 0; i < n; i++) {
      const j = at + i;
      if (j < 0) continue;
      const g = i < fade ? i / fade : i > n - fade ? (n - i) / fade : 1;
      out[j] += r.samples[i] * g;
    }
  }
  const result = { sampleRate: rate, channelData: out, startBeat: 0, key, phrases: phrases.length, rendered: todo.length, unknown: [...unknown], backend: info ?? null };
  lastSong.set(key, result);
  if (lastSong.size > 3) lastSong.delete(lastSong.keys().next().value);
  return result;
}

/** Sings a short test phrase ("사 랑 해 요" or "la la la la") with a bank. */
export async function testVoice(bankId = DEFAULT_BANK, { language = 'ko', speaker = '', steps = 10, backend = 'auto', onProgress = null, signal = null } = {}) {
  const syl = language === 'en' ? ['sing', 'a', 'song', 'now'] : ['사', '랑', '해', '요'];
  const song = { bpm: 96, swing: 0, language };
  const track = { notes: syl.map((s, i) => ({ t: i, d: i === 3 ? 1.8 : 0.95, p: [64, 67, 69, 67][i], v: 0.8, syl: s })) };
  return renderVocal(song, track, bankId, { speaker, steps, backend, onProgress, signal });
}

/** Plays a rendered result in an AudioContext (for the test button); returns the source node. */
export function playRendered(ac, result, destination = ac.destination) {
  const buffer = ac.createBuffer(1, result.channelData.length, result.sampleRate);
  buffer.copyToChannel(result.channelData, 0);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(destination);
  src.start();
  return src;
}

export { makeReader };
