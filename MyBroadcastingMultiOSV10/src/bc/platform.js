// The broadcasting engine's link to the platform: where files come from (desktop paths, files the web
// build keeps in IndexedDB, the app's own sample pictures, URLs), where recordings go, how the stream
// leaves (the desktop app's FFmpeg, the web build's relay server), FFmpeg tools, system numbers, global
// hotkeys and projector windows. Desktop and web share one interface; tests replace it with fakes.
import { convertFileSrc } from '@tauri-apps/api/core';
import * as native from '../platform/native.js';
import { idbDelete, idbGet, idbSet } from '../platform/idb.js';
import { sampleUrl, sampleText } from './samples.js';

const desktop = () => native.isDesktop();
const urls = new Map();

export const isAbsolutePath = (v) => /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(String(v));
export const baseName = (p) => String(p ?? '').split(/[\\/]/).pop();
export const joinPath = (dir, name) => (dir ? `${String(dir).replace(/[\\/]+$/, '')}${String(dir).includes('\\') ? '\\' : '/'}${name}` : name);

// ───────────────────────── files the web build keeps (asset:<id>)

export async function storeAsset(file) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await idbSet(`asset:${id}`, { name: file.name, type: file.type, size: file.size, blob: file });
  return `asset:${id}`;
}
export async function assetInfo(value) { const v = await idbGet(value).catch(() => null); return v ? { name: v.name, type: v.type, size: v.size } : null; }
export const removeAsset = (value) => idbDelete(value).catch(() => {});

/** A setting's file value → a URL the page can load. */
export async function resolve(value) {
  const v = String(value ?? '');
  if (!v) throw new Error('no file');
  if (urls.has(v)) return urls.get(v);
  let url;
  if (v.startsWith('asset:')) {
    const entry = await idbGet(v);
    if (!entry?.blob) throw new Error(`missing file ${v}`);
    url = URL.createObjectURL(entry.blob);
  } else if (v.startsWith('sample:')) url = await sampleUrl(v.slice(7));
  else if (/^(https?|blob|data):/i.test(v)) return v;
  else if (desktop() && isAbsolutePath(v)) { await native.invoke('allow_media', { path: v }).catch(() => false); url = convertFileSrc(v); }
  else url = v;
  urls.set(v, url);
  return url;
}

/** A setting's file value as text (text sources reading a file, LUTs, browser sources' local pages). */
export async function readText(value) {
  const v = String(value ?? '');
  if (v.startsWith('asset:')) { const e = await idbGet(v); return e?.blob ? e.blob.text() : ''; }
  if (v.startsWith('sample:')) return sampleText(v.slice(7));
  if (desktop() && isAbsolutePath(v)) return native.readTextFile(v, '');
  const r = await fetch(await resolve(v));
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

/** A web page's HTML (a browser source in URL mode); most sites refuse a page from another origin. */
export async function fetchPage(url) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

/** Desktop: the user's file → a path; web: a stored copy. `accept` like ".png,.jpg". */
export async function pickFiles(accept, { multiple = false, lastDir = null } = {}) {
  if (desktop()) {
    const exts = String(accept).split(',').map((x) => x.trim().replace(/^\./, '')).filter(Boolean);
    const paths = await native.chooseFiles(lastDir, [{ name: exts.join(', ').toUpperCase(), extensions: exts }], multiple);
    return paths;
  }
  const files = await native.pickWithInput(accept, multiple);
  const out = [];
  for (const f of files) out.push(await storeAsset(f));
  return out;
}

// ───────────────────────── recording files

/** Where recordings go on the desktop (Videos), remembered folder handle on the web. */
export async function defaultRecordingFolder() {
  if (desktop()) return native.invoke('videos_dir').catch(() => '');
  return '';
}

export async function listNames(dir) { return desktop() && dir ? native.invoke('list_names', { dir }).catch(() => []) : []; }

/** Web: lets the user pick the recording folder once (kept in IndexedDB). */
export async function chooseWebFolder() {
  if (typeof globalThis.showDirectoryPicker !== 'function') return null;
  const handle = await globalThis.showDirectoryPicker({ id: 'mybroadcasting-recordings', mode: 'readwrite' });
  await native.storeWebHandle('recordings', handle);
  return handle.name;
}

/**
 * File sinks for the recording: open(name) → { write(data, position), close(), path }.
 * Desktop: files in `folder`; web: the chosen folder, else the file is downloaded when it is closed.
 */
export function fileSinks(folder, { onDownload } = {}) {
  if (desktop()) {
    return {
      async open(name) {
        const path = joinPath(folder, name);
        const id = await native.invoke('rec_open', { path });
        return {
          path,
          write: (data, position) => native.invoke('rec_write', data, { headers: { 'x-id': String(id), 'x-pos': String(position) } }),
          close: () => native.invoke('rec_close', { id }),
        };
      },
      writeText: (path, text) => native.writeTextFile(path, text, ''),
    };
  }
  return {
    async open(name) {
      const dir = await native.loadWebHandle('recordings');
      if (dir && (await dir.queryPermission?.({ mode: 'readwrite' })) === 'granted') {
        const fh = await dir.getFileHandle(name, { create: true });
        const writable = await fh.createWritable();
        return { path: `${dir.name}/${name}`, write: (data, position) => writable.write({ type: 'write', position, data }), close: () => writable.close() };
      }
      // In memory, downloaded when finished.
      const parts = [];
      return {
        path: name,
        write: (data, position) => { parts.push({ position, data: data.slice() }); },
        close: () => {
          const size = parts.reduce((n, p) => Math.max(n, p.position + p.data.byteLength), 0);
          const all = new Uint8Array(size);
          for (const p of parts) all.set(p.data, p.position);
          const blob = new Blob([all], { type: /\.webm$/i.test(name) ? 'video/webm' : /\.mkv$/i.test(name) ? 'video/x-matroska' : /\.mov$/i.test(name) ? 'video/quicktime' : 'video/mp4' });
          onDownload?.(name, blob);
          downloadBlob(blob, name);
        },
      };
    },
    writeText: async (path, text) => downloadBlob(new Blob([text], { type: 'text/plain' }), baseName(path)),
  };
}

export function downloadBlob(blob, name) {
  // E2E tests collect what the web build downloads (normal use never sets this).
  if (Array.isArray(globalThis.__mybroadcastingDownloads)) globalThis.__mybroadcastingDownloads.push({ name, blob });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/** Bytes to a file (replay buffer, screenshots): desktop path, web download. */
export async function saveBytes(pathOrName, bytes, mime = 'application/octet-stream') {
  if (desktop()) {
    const id = await native.invoke('rec_open', { path: pathOrName });
    const CHUNK = 8 * 1024 * 1024;
    for (let i = 0; i < bytes.byteLength; i += CHUNK) await native.invoke('rec_write', bytes.subarray(i, i + CHUNK), { headers: { 'x-id': String(id), 'x-pos': String(i) } });
    await native.invoke('rec_close', { id });
    return pathOrName;
  }
  downloadBlob(new Blob([bytes], { type: mime }), baseName(pathOrName));
  return baseName(pathOrName);
}

// ───────────────────────── FFmpeg and the stream transport

export async function findFfmpeg(custom = '') {
  if (!desktop()) return null;
  return native.invoke('ffmpeg_find', { custom: custom || null }).catch(() => null);
}

/**
 * The stream's transport: open({ url }) → { write(bytes), close(), onClose }.
 * Desktop: FFmpeg reads Matroska on stdin. Web: the relay server (npm run relay) does the same.
 */
export function streamTransport({ ffmpeg = '', relay = 'ws://127.0.0.1:8765', audioCodec = 'aac', onLog = () => {} } = {}) {
  if (desktop()) {
    return {
      async open({ url }) {
        const ff = await findFfmpeg(ffmpeg);
        if (!ff) throw new Error('ffmpeg-missing');
        const id = await native.invoke('stream_open', { ffmpeg: ff.path, url, audioCodec });
        let last = '';
        const conn = { onClose: null, dropped: 0 };
        const offLog = await native.listen('ffmpeg-log', (e) => { if (e.id === id) { if (!/^(frame|fps|stream_|bitrate|total_size|out_time|dup_frames|drop_frames|speed|progress)=/.test(e.line)) last = e.line; onLog(e.line); } });
        const offExit = await native.listen('ffmpeg-exit', (e) => { if (e.id === id) { offLog(); offExit(); conn.closed = true; conn.onClose?.(new Error(last || `FFmpeg exited (${e.code})`)); } });
        conn.write = async (bytes) => {
          if (conn.closed) throw new Error(last || 'stream ended');
          try { await native.invoke('stream_write', bytes, { headers: { 'x-id': String(id) } }); } catch (error) { if (String(error).includes('backpressure')) conn.dropped++; else throw error; }
        };
        conn.close = async () => { conn.closed = true; offLog(); offExit(); await native.invoke('stream_close', { id }).catch(() => {}); };
        return conn;
      },
    };
  }
  return {
    open({ url }) {
      return new Promise((resolveOpen, reject) => {
        const ws = new WebSocket(`${relay.replace(/\/$/, '')}/ingest?url=${encodeURIComponent(url)}&audio=${audioCodec}`);
        ws.binaryType = 'arraybuffer';
        const conn = { onClose: null, write: (bytes) => { if (ws.readyState !== 1) throw new Error('relay closed'); if (ws.bufferedAmount > 16 * 1024 * 1024) { conn.dropped = (conn.dropped ?? 0) + 1; return; } ws.send(bytes); }, close: () => ws.close() };
        ws.onopen = () => resolveOpen(conn);
        ws.onerror = () => reject(new Error('relay-unreachable'));
        ws.onmessage = (e) => onLog(String(e.data));
        ws.onclose = (e) => conn.onClose?.(new Error(e.reason || 'relay closed'));
      });
    },
  };
}

/**
 * Direct viewing's signalling (bc/engine/viewers.js): desktop — the app's own server (viewer_start, events
 * viewer-open / viewer-message / viewer-close); web — the /host link of "npm run viewers" (server/viewers.mjs).
 * On the desktop, a taken port is not an error: when "npm run viewers" already runs there, the app joins it
 * (the address viewers were given stays right); when another program has it, the next free port is used.
 */
export function viewerTransport({ port = 8790, server = 'ws://127.0.0.1:8790', log = () => {} } = {}) {
  if (!desktop()) return hostLink(server);
  let offs = [];
  let link = null;
  const own = {
    async start(h) {
      offs = [
        await native.listen('viewer-open', (e) => h.open(e.id, e.text)),
        await native.listen('viewer-message', (e) => h.message(e.id, e.text)),
        await native.listen('viewer-close', (e) => h.close(e.id)),
      ];
      const off = () => { offs.forEach((x) => x()); offs = []; };
      try { return await native.invoke('viewer_start', { port }); } catch (error) {
        if (!/port-in-use/.test(String(error?.message ?? error))) { off(); throw error; }
      }
      // The port is taken. Our own viewer server there? Then work through it.
      try {
        link = hostLink(`ws://127.0.0.1:${port}`, { timeout: 1500 });
        const started = await link.start(h);
        off();
        log(`direct viewing: port ${port} is held by a running viewer server; using it`);
        return started;
      } catch { link = null; }
      // Another program: the next free port.
      for (let p = port + 1; p <= Math.min(65535, port + 20); p++) {
        try {
          const started = await native.invoke('viewer_start', { port: p });
          log(`direct viewing: port ${port} is in use by another program; using ${p}`);
          return started;
        } catch (error) { if (!/port-in-use/.test(String(error?.message ?? error))) { off(); throw error; } }
      }
      off();
      throw Object.assign(new Error(`port-in-use:${port}`), { code: 'port-in-use' });
    },
    send: (id, text) => { if (link) link.send(id, text); else native.invoke('viewer_send', { id, text }).catch(() => {}); },
    drop: (id) => { if (link) link.drop(id); else native.invoke('viewer_send', { id, text: '{"op":-1,"close":4003}' }).catch(() => {}); },
    async stop() {
      offs.forEach((x) => x()); offs = [];
      if (link) { await link.stop(); link = null; return; }
      await native.invoke('viewer_stop').catch(() => {});
    },
  };
  return own;
}

/** The /host link of a viewer server (server/viewers.mjs): rejects when nothing answers "ready" in time. */
function hostLink(server, { timeout = 5000 } = {}) {
  let ws = null;
  return {
    start(h) {
      return new Promise((resolve, reject) => {
        let ready = false;
        const fail = () => { if (!ready) { ready = true; try { ws?.close(); } catch { /* closed */ } reject(Object.assign(new Error('viewers-unreachable'), { code: 'viewers-unreachable' })); } };
        const timer = setTimeout(fail, timeout);
        try { ws = new WebSocket(`${String(server).replace(/\/+$/, '')}/host`); } catch { clearTimeout(timer); fail(); return; }
        ws.onmessage = (e) => {
          let m; try { m = JSON.parse(e.data); } catch { return; }
          if (m.ev === 'ready' && !ready) { ready = true; clearTimeout(timer); resolve({ port: m.port, addresses: m.addresses ?? [] }); }
          else if (m.ev === 'open') h.open(m.id, m.addr);
          else if (m.ev === 'message') h.message(m.id, m.text);
          else if (m.ev === 'close') h.close(m.id);
        };
        ws.onerror = () => { clearTimeout(timer); fail(); };
        ws.onclose = () => { clearTimeout(timer); fail(); };
      });
    },
    send: (id, text) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ to: id, text })); },
    drop: (id) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ to: id, drop: true })); },
    async stop() { const w = ws; ws = null; try { w?.close(); } catch { /* closed */ } },
  };
}

/**
 * Browser sources as real pages (desktop on Windows: src-tauri/src/browser_source.rs). Frames come as the
 * "browser-frame" event { id, data: base64 PNG }; null where pages cannot run (the page draws them itself).
 */
export const browserPages = {
  supported: async () => desktop() && Boolean(await native.invoke('browser_supported').catch(() => false)),
  open: (page) => native.invoke('browser_open', { page }),
  close: (id) => native.invoke('browser_close', { id }).catch(() => {}),
  reload: (id) => native.invoke('browser_reload', { id }),
  input: (id, method, params) => native.invoke('browser_input', { id, method, params: JSON.stringify(params) }).catch(() => {}),
  onFrame: (fn) => native.listen('browser-frame', fn),
};

/** Account connection's calls (studio/accounts.js): HTTPS through the desktop app (no CORS), the browser's
 *  default browser for signing in, a 127.0.0.1 redirect listener (desktop only). */
export function accountIo() {
  return {
    http: async (method, url, { headers = {}, form = null } = {}) => {
      if (desktop()) return native.invoke('account_request', { method, url, headers: Object.entries(headers), form: form ? Object.entries(form) : null, json: null });
      const r = await fetch(url, { method, headers: form ? { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } : headers, body: form ? new URLSearchParams(form) : undefined });
      return { status: r.status, body: await r.text() };
    },
    openUrl: (url) => native.openExternal(url),
    loopback: async () => {
      if (!desktop()) throw Object.assign(new Error('desktop-only'), { code: 'desktop-only' });
      return native.invoke('account_loopback', { seconds: 300 });
    },
    waitRedirect: (port, signal = {}) => new Promise((resolve, reject) => {
      let off = null;
      const timer = setInterval(() => { if (signal.cancelled) { clearInterval(timer); off?.(); reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })); } }, 300);
      native.listen('oauth-redirect', (e) => { if (e.port === port) { clearInterval(timer); off?.(); resolve(e.query); } }).then((fn) => { off = fn; });
    }),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    random: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (text) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  };
}

/** The virtual camera device (Windows desktop: src-tauri/src/vcam.rs); null elsewhere. */
export const vcamDevice = {
  status: async () => (desktop() ? native.invoke('vcam_status').catch(() => ({ supported: false })) : { supported: false }),
  register: (remove = false) => native.invoke('vcam_register', { remove }),
  start: (width, height) => native.invoke('vcam_start', { width, height }),
  frame: (bytes) => native.invoke('vcam_frame', bytes),
  stop: () => native.invoke('vcam_stop').catch(() => {}),
};

export async function remux(input, output, { ffmpeg = '', metadata = null } = {}) {
  const ff = await findFfmpeg(ffmpeg);
  if (!ff) throw new Error('ffmpeg-missing');
  return native.invoke('remux_file', { ffmpeg: ff.path, input, output, metadata });
}

// ───────────────────────── system, windows, hotkeys

export async function systemStats(path = null) {
  if (desktop()) return native.invoke('system_stats', { path }).catch(() => null);
  const mem = performance.memory;
  const est = await navigator.storage?.estimate?.().catch(() => null);
  return { cpu: null, appCpu: null, memoryUsed: mem?.usedJSHeapSize ?? 0, memoryTotal: mem?.jsHeapSizeLimit ?? 0, appMemory: mem?.usedJSHeapSize ?? 0, diskFree: est ? est.quota - est.usage : 0, diskTotal: est?.quota ?? 0 };
}

export const foregroundTitle = () => (desktop() ? native.invoke('foreground_title').catch(() => '') : Promise.resolve(document.hasFocus() ? document.title : ''));
export const listMonitors = () => (desktop() ? native.invoke('list_monitors').catch(() => []) : Promise.resolve([]));

let shortcutApi = null;
const shortcuts = () => (shortcutApi ??= import('@tauri-apps/plugin-global-shortcut'));
/** Global hotkeys (desktop): register them all again from `bindings` = [{ accelerator, down, up }]. */
export async function setGlobalHotkeys(bindings) {
  if (!desktop()) return { ok: false, registered: 0 };
  const api = await shortcuts();
  await api.unregisterAll().catch(() => {});
  let registered = 0;
  const failed = [];
  for (const b of bindings) {
    try {
      await api.register(b.accelerator, (event) => { if (event.state === 'Pressed') b.down?.(); else b.up?.(); });
      registered++;
    } catch { failed.push(b.accelerator); }
  }
  return { ok: !failed.length, registered, failed };
}

/** Opens a projector (its own window on the desktop, a browser window on the web). */
export async function openProjector({ label, query, title, monitor = null }) {
  if (desktop()) return native.invoke('open_projector', { label, query, title, monitor, width: 960, height: 540 });
  const w = globalThis.open(`${location.pathname}?projector=${query}`, label, 'width=960,height=540');
  return Boolean(w);
}
