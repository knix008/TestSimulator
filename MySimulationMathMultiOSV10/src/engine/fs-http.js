// The engine's file system in the Web Worker (core/CONTRACT.md §6): every call
// is a synchronous XMLHttpRequest to the host API (server/fs-api.js on the web,
// src-tauri/src/host.rs on the desktop). cwd() / chdir() are kept here; the
// host only sees absolute paths.
//
//   const fs = createHttpFs({ base: 'http://127.0.0.1:5231/api/', token, cwd: '/' });
//
// `transport(name, args) → data` can replace the XHR (tests call the API
// in-process).

function fsErr(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Posix-style join / normalise; keeps a Windows drive ("C:/") as the root. */
export function resolvePath(base, p) {
  const s = String(p == null ? '' : p).replace(/\\/g, '/');
  const isAbs = s.startsWith('/') || /^[A-Za-z]:(\/|$)/.test(s);
  const full = isAbs ? s : `${String(base || '/').replace(/\\/g, '/').replace(/\/+$/, '')}/${s}`;
  const drive = /^([A-Za-z]:)(\/|$)/.exec(full);
  const rest = drive ? full.slice(2) : full;
  const parts = [];
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return `${drive ? drive[1].toUpperCase() : ''}/${parts.join('/')}`;
}

/** The default transport: synchronous XHR (allowed in workers), JSON in and out. */
export function xhrTransport(base, token) {
  const root = String(base).endsWith('/') ? String(base) : `${base}/`;
  return (name, args) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${root}${name}`, false);
    xhr.setRequestHeader('content-type', 'application/json');
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    try {
      xhr.send(JSON.stringify(args || {}));
    } catch (e) {
      throw fsErr('EIO', `The file service did not answer (${(e && e.message) || e}).`);
    }
    let body;
    try { body = JSON.parse(xhr.responseText); } catch {
      throw fsErr('EIO', `The file service sent an unreadable answer (HTTP ${xhr.status}).`);
    }
    if (!body || !body.ok) {
      const e = (body && body.error) || {};
      throw fsErr(e.code || 'EIO', e.message || `HTTP ${xhr.status}`);
    }
    return body.data;
  };
}

function b64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

export function createHttpFs({ base = '/api/', token = '', cwd = '/', transport = null, systemAllowed = true } = {}) {
  const send = transport || xhrTransport(base, token);
  let current = resolvePath('/', cwd || '/');
  const abs = (p) => {
    if (p == null || String(p) === '') throw fsErr('EINVAL', 'Empty path.');
    return resolvePath(current, p);
  };
  const fs = {
    kind: 'http',
    abs,
    readText: (p) => send('fs/readText', { path: abs(p) }),
    writeText: (p, text) => { send('fs/writeText', { path: abs(p), text: String(text == null ? '' : text) }); },
    appendText: (p, text) => { send('fs/appendText', { path: abs(p), text: String(text == null ? '' : text) }); },
    readBytes: (p) => b64ToBytes((send('fs/readBytes', { path: abs(p) }) || {}).base64),
    writeBytes: (p, bytes) => { send('fs/writeBytes', { path: abs(p), base64: bytesToB64(bytes) }); },
    exists: (p) => { try { return !!send('fs/exists', { path: abs(p) }); } catch { return false; } },
    stat: (p) => send('fs/stat', { path: abs(p) }),
    list: (d) => send('fs/list', { path: abs(d) }),
    mkdir: (p) => { send('fs/mkdir', { path: abs(p) }); },
    remove: (p, opts = {}) => { send('fs/remove', { path: abs(p), recursive: !!(opts && opts.recursive) }); },
    rename: (from, to) => { send('fs/rename', { from: abs(from), to: abs(to) }); },
    copy: (from, to) => { send('fs/copy', { from: abs(from), to: abs(to) }); },
    cwd: () => current,
    chdir: (p) => {
      const a = abs(p);
      let st;
      try { st = send('fs/stat', { path: a }); } catch { throw fsErr('ENOENT', `Folder not found: ${p}`); }
      if (!st || !st.isDir) throw fsErr('ENOTDIR', `Not a folder: ${p}`);
      current = a;
    },
    tempDir: () => send('fs/tempDir', {}),
    homeDir: () => send('fs/homeDir', {}),
    system: (command) => {
      if (!systemAllowed) throw fsErr('ENOSYS', 'system() is not available in the web version.');
      return send('fs/system', { command: String(command), cwd: current });
    },
  };
  return fs;
}

export const _internal = { b64ToBytes, bytesToB64 };
