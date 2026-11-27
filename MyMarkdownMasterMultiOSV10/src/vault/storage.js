// The vault: a folder of notes and attachments. On the desktop the Rust backend owns it (src-tauri/src/
// vault.rs: scanning, reading into the core, watching for outside changes, every file operation, link
// updates on rename, file-recovery snapshots, exports). In a browser the folder is a File System Access
// handle — a real folder the user picked (Chromium) or a vault inside the browser's private storage (OPFS:
// every modern browser) — and the same Rust core runs as WebAssembly (core/core.js); this file does the
// browser's file work and feeds the core.
import { convertFileSrc } from '@tauri-apps/api/core';
import { call } from '../core/core.js';
import { invoke, isDesktop, listen } from '../platform/native.js';
import { idbGet, idbSet } from '../platform/idb.js';
import { extOf, isNote, normalizePath } from './index.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', ogv: 'video/ogg', mkv: 'video/x-matroska', pdf: 'application/pdf', '3gp': 'audio/3gpp' };
export const mimeOf = (path) => MIME[extOf(path)] ?? 'application/octet-stream';

const toBase64 = (bytes) => { let s = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk)); return btoa(s); };
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const joinAbs = (root, rel) => `${root.replace(/[\\/]+$/, '')}${root.includes('\\') ? '\\' : '/'}${rel.split('/').join(root.includes('\\') ? '\\' : '/')}`;

/** Whether this browser can keep a vault: a picked real folder (Chromium) or private browser storage. */
export const webSupport = () => ({ folder: typeof globalThis.showDirectoryPicker === 'function', browser: Boolean(globalThis.navigator?.storage?.getDirectory) });

export class Vault {
  constructor(kind, name, { root = '', handle = null, id = '' } = {}) {
    this.kind = kind; // 'desktop' | 'folder' | 'browser'
    this.name = name;
    this.root = root;
    this.handle = handle;
    this.id = id || root || name;
    this.listeners = new Set();
    this.urls = new Map();
    this.unlisten = null;
  }

  // ───────── opening

  /** Desktop: opens a folder; the backend scans it and loads every note into the core. */
  static async openDesktop(path) {
    const opened = await invoke('vault_open', { path });
    const vault = new Vault('desktop', opened.name, { root: opened.root });
    vault.snapshot = opened.snapshot;
    vault.unlisten = await listen('vault-changed', (change) => vault.emit(change));
    return vault;
  }

  /** Web: a directory handle (a picked folder or an OPFS folder). Reads every note into the WebAssembly core. */
  static async openWeb(handle, kind, onProgress) {
    const vault = new Vault(kind, handle.name, { handle, id: `${kind}:${handle.name}` });
    await vault.rescan(onProgress);
    return vault;
  }

  /** Web: the vaults kept in this browser's private storage. */
  static async browserVaults() {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('vaults', { create: true });
    const names = [];
    for await (const [name, entry] of dir.entries()) if (entry.kind === 'directory') names.push(name);
    return names.sort((a, b) => a.localeCompare(b));
  }

  static async browserVaultHandle(name, create = false) {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('vaults', { create: true });
    return dir.getDirectoryHandle(name, { create });
  }

  static async deleteBrowserVault(name) {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('vaults', { create: true });
    await dir.removeEntry(name, { recursive: true });
  }

  /** Desktop: makes a new vault folder with a first note. */
  static createDesktop(parent, name, welcome) { return invoke('vault_create', { parent, name, welcome }); }

  /** Stops listening and frees URLs. `backend: false` when another vault already took the backend's place. */
  close({ backend = true } = {}) {
    this.unlisten?.();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    if (this.kind === 'desktop' && backend) invoke('vault_close').catch(() => {});
  }

  // ───────── changes from outside (desktop watcher)

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(change) { for (const fn of this.listeners) fn(change); }

  // ───────── web file helpers

  async dir(path, create = false) {
    let dir = this.handle;
    for (const part of normalizePath(path).split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }
  async fileHandle(path, create = false) {
    const p = normalizePath(path);
    const at = p.lastIndexOf('/');
    const dir = await this.dir(at < 0 ? '' : p.slice(0, at), create);
    return dir.getFileHandle(at < 0 ? p : p.slice(at + 1), { create });
  }
  async walk(dir = this.handle, prefix = '', out = []) {
    for await (const [name, entry] of dir.entries()) {
      if (name.startsWith('.')) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') { out.push({ path, kind: 'folder' }); await this.walk(entry, path, out); } else {
        const file = await entry.getFile();
        out.push({ path, kind: 'file', size: file.size, mtime: file.lastModified, ctime: file.lastModified });
      }
    }
    return out;
  }

  /** Web: reads the whole vault again into the core (also after outside changes to a picked folder). */
  async rescan(onProgress) {
    if (this.kind === 'desktop') { this.snapshot = await call('snapshot'); return this.snapshot; }
    const entries = await this.walk();
    await call('reset');
    await call('setFiles', { files: entries });
    const notes = entries.filter((e) => e.kind === 'file' && isNote(e.path));
    const batch = [];
    for (const [i, e] of notes.entries()) {
      batch.push([e.path, await this.read(e.path)]);
      if (batch.length >= 50) { await call('setTexts', { items: batch.splice(0) }); onProgress?.((i + 1) / notes.length); }
    }
    if (batch.length) await call('setTexts', { items: batch });
    this.snapshot = await call('snapshot');
    return this.snapshot;
  }

  // ───────── reading and writing

  async read(path) {
    if (this.kind === 'desktop') return invoke('vault_read', { path });
    const file = await (await this.fileHandle(path)).getFile();
    return (await file.text()).replace(/^﻿/, '');
  }
  async readBinary(path) {
    if (this.kind === 'desktop') return fromBase64(await invoke('vault_read_base64', { path }));
    return new Uint8Array(await (await (await this.fileHandle(path)).getFile()).arrayBuffer());
  }
  async exists(path) {
    if (this.kind === 'desktop') { const [ok] = await invoke('paths_exist', { paths: [joinAbs(this.root, normalizePath(path))] }); return ok; }
    try { await this.fileHandle(path); return true; } catch { try { await this.dir(path); return true; } catch { return false; } }
  }
  async write(path, text) {
    const p = normalizePath(path);
    if (this.kind === 'desktop') return invoke('vault_write', { path: p, text });
    const handle = await this.fileHandle(p, true);
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    await call('setFile', { path: p, kind: 'file', size: text.length, mtime: Date.now(), ctime: Date.now() });
    if (isNote(p)) await call('setText', { path: p, text });
    return null;
  }
  async writeBinary(path, bytes) {
    const p = normalizePath(path);
    this.forgetUrl(p);
    if (this.kind === 'desktop') return invoke('vault_write_base64', { path: p, data: toBase64(bytes) });
    const handle = await this.fileHandle(p, true);
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    await call('setFile', { path: p, kind: 'file', size: bytes.length, mtime: Date.now(), ctime: Date.now() });
    return null;
  }
  /** A new file; fails when the name is taken. */
  async create(path, text = '') {
    const p = normalizePath(path);
    if (this.kind === 'desktop') return invoke('vault_new_file', { path: p, text });
    if (await this.exists(p)) throw new Error(`exists: ${p}`);
    return this.write(p, text);
  }
  async mkdir(path) {
    const p = normalizePath(path);
    if (this.kind === 'desktop') return invoke('vault_mkdir', { path: p });
    await this.dir(p, true);
    await call('setFile', { path: p, kind: 'folder' });
    return null;
  }

  /** Renames / moves; with updateLinks every link to it is rewritten. Returns { edits: [{ path, text }] }. */
  async rename(from, to, updateLinks = true) {
    const a = normalizePath(from);
    const b = normalizePath(to);
    this.forgetUrl(a);
    if (this.kind === 'desktop') return invoke('vault_rename', { from: a, to: b, updateLinks });
    if (await this.exists(b) && a.toLowerCase() !== b.toLowerCase()) throw new Error(`exists: ${b}`);
    await this.moveWeb(a, b);
    const edits = updateLinks ? await call('rename', { from: a, to: b }) : (await call('rename', { from: a, to: b }), []);
    for (const e of edits ?? []) await this.writeRaw(e.path, e.text);
    return { edits: updateLinks ? edits : [] };
  }
  async writeRaw(path, text) {
    const handle = await this.fileHandle(path, true);
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }
  async moveWeb(a, b) {
    let isDir = false;
    try { await this.dir(a); isDir = true; } catch { /* a file */ }
    if (!isDir) {
      const src = await this.fileHandle(a);
      const at = b.lastIndexOf('/');
      const targetDir = await this.dir(at < 0 ? '' : b.slice(0, at), true);
      const name = at < 0 ? b : b.slice(at + 1);
      if (typeof src.move === 'function') { await src.move(targetDir, name); return; }
      const bytes = await (await src.getFile()).arrayBuffer();
      const dst = await targetDir.getFileHandle(name, { create: true });
      const w = await dst.createWritable(); await w.write(bytes); await w.close();
      await this.removeWeb(a);
      return;
    }
    await this.dir(b, true);
    for (const entry of (await this.walk(await this.dir(a), a)).filter((e) => e.kind === 'file')) await this.moveWeb(entry.path, `${b}${entry.path.slice(a.length)}`);
    await this.removeWeb(a);
  }
  async removeWeb(path) {
    const p = normalizePath(path);
    const at = p.lastIndexOf('/');
    const dir = await this.dir(at < 0 ? '' : p.slice(0, at));
    await dir.removeEntry(at < 0 ? p : p.slice(at + 1), { recursive: true });
  }

  /** mode: 'system' (OS trash; desktop), 'vault' (the vault's .trash folder) or 'permanent'. */
  async remove(path, mode = 'system') {
    const p = normalizePath(path);
    this.forgetUrl(p);
    if (this.kind === 'desktop') return invoke('vault_delete', { path: p, mode });
    if (mode !== 'permanent') {
      const name = p.split('/').pop();
      await this.dir('.trash', true);
      let target = `.trash/${name}`;
      for (let n = 2; await this.exists(target); n += 1) target = `.trash/${name.replace(/(\.[^.]*)?$/, ` ${n}$1`)}`;
      await this.moveWeb(p, target);
    } else await this.removeWeb(p);
    await call('remove', { path: p });
    return null;
  }

  async copy(from, to) {
    if (this.kind === 'desktop') return invoke('vault_copy', { from: normalizePath(from), to: normalizePath(to) });
    if (await this.exists(to)) throw new Error(`exists: ${to}`);
    const bytes = await this.readBinary(from);
    await this.writeBinary(to, bytes);
    if (isNote(to)) await call('setText', { path: normalizePath(to), text: new TextDecoder().decode(bytes) });
    return null;
  }

  // ───────── URLs for pictures, audio, video, PDF

  forgetUrl(path) { const url = this.urls.get(path); if (url) { URL.revokeObjectURL(url); this.urls.delete(path); } }
  /** The prefix the core puts in front of vault paths (desktop: the asset protocol URL of the vault folder). */
  resourcePrefix() { return this.kind === 'desktop' ? convertFileSrc(`${this.root.replace(/[\\/]+$/, '')}/`).replace(/%2F$/i, '/') : ''; }
  async resourceUrl(path) {
    const p = normalizePath(path);
    if (this.kind === 'desktop') return convertFileSrc(joinAbs(this.root, p));
    if (!this.urls.has(p)) {
      const file = await (await this.fileHandle(p)).getFile();
      this.urls.set(p, URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: mimeOf(p) })));
    }
    return this.urls.get(p);
  }

  absPath(path) { return this.kind === 'desktop' ? invoke('vault_abs_path', { path: normalizePath(path) }) : Promise.resolve(normalizePath(path)); }
  reveal(path = '') { return this.kind === 'desktop' ? invoke('vault_reveal', { path: normalizePath(path) }) : Promise.resolve(); }

  // ───────── file recovery

  async saveSnapshot(path, text, { interval = 5, keep = 50, force = false } = {}) {
    if (this.kind === 'desktop') return invoke('vault_snapshot', { path, text, intervalMin: interval, keep, force });
    const key = `snap:${this.id}:${path}`;
    const list = (await idbGet(key).catch(() => null)) ?? [];
    const last = list.at(-1);
    if (last && (last.text === text || (!force && Date.now() - last.time < interval * 60000))) return false;
    list.push({ time: Date.now(), text });
    while (list.length > keep) list.shift();
    await idbSet(key, list).catch(() => {});
    return true;
  }
  async snapshots(path) {
    if (this.kind === 'desktop') return invoke('vault_snapshots', { path });
    const list = (await idbGet(`snap:${this.id}:${path}`).catch(() => null)) ?? [];
    return list.map((s) => ({ time: s.time, size: s.text.length })).reverse();
  }
  async snapshotText(path, time) {
    if (this.kind === 'desktop') return invoke('vault_snapshot_read', { path, time });
    const list = (await idbGet(`snap:${this.id}:${path}`).catch(() => null)) ?? [];
    return list.find((s) => s.time === time)?.text ?? '';
  }
}

export { isDesktop };
