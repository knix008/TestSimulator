// Download / upload of files and whole folders, driven by a Job:
//
//   1. plan   — walk the source tree, count files and bytes (progress total)
//   2. decide — destination that already exists: skip if unchanged, else ask
//               the user (overwrite / skip / cancel, "apply to all")
//   3. move   — approved files on a pool of connections (FTP needs one
//               control connection per in-flight file)
//
// The same code serves FTP, FTPS and SFTP because core/remote.js hides the
// protocol. Remote paths are POSIX; local paths use the host's separator.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const local = require('./local');
const { posixJoin, posixBase, posixParent } = require('./remote');
const { cancelledError } = require('./jobs');

const MAX_CONCURRENCY = 4;

function abortSignalFor(job) {
  const ac = new AbortController();
  job.onCancel(() => ac.abort());
  if (job.isCancelled()) ac.abort();
  return ac.signal;
}

function clampConcurrency(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(1, Math.min(MAX_CONCURRENCY, v)) : 3;
}

// Same size and the destination is not older than the source (2 s slack for
// FAT/FTP second-resolution timestamps). After a successful transfer the
// dest mtime is "now", so a second pass of the same files skips them.
function isUnchanged(src, dest) {
  if (!dest || !dest.exists || dest.isDir) return false;
  if (Number(src.size) !== Number(dest.size)) return false;
  const sm = Number(src.mtime) || 0;
  const dm = Number(dest.mtime) || 0;
  if (!sm || !dm) return false;
  return dm + 2000 >= sm;
}

async function runPool(files, clients, job, workerFn) {
  if (!files.length) return;
  let next = 0;
  let failed = null;
  const n = Math.max(1, Math.min(clients.length, files.length));
  async function worker(client) {
    while (next < files.length && !failed) {
      job.throwIfCancelled();
      const f = files[next++];
      try {
        await workerFn(client, f);
      } catch (err) {
        failed = failed || err;
      }
    }
  }
  await Promise.all(clients.slice(0, n).map((c) => worker(c)));
  if (failed) throw failed;
}

async function takePool(client, files, opts, signal) {
  const concurrency = clampConcurrency(opts.concurrency);
  const acquire = opts.acquirePool;
  if (!acquire || files.length <= 1 || concurrency <= 1) {
    return { clients: [client], release: async () => {} };
  }
  return acquire(Math.min(concurrency, files.length), signal);
}

function skipFile(job, rec) {
  job.addBytes(rec.size);
  job.advance();
  job.note(rec);
}

// "a.txt" → "a (2).txt", "dir" → "dir (2)": a copy pasted into its own folder.
// `taken` holds the names already in the folder (compared case-insensitively).
function uniqueName(name, taken, isDir = false) {
  const lower = new Set(Array.from(taken, (n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = isDir ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const n = `${stem} (${i})${ext}`;
    if (!lower.has(n.toLowerCase())) return n;
  }
}

function intoItselfError(p) {
  const e = new Error(`Cannot copy or move a folder into itself: ${p}`);
  e.code = 'EINVAL';
  e.path = p;
  return e;
}

const isRemoteInside = (dir, folder) => dir === folder || dir.startsWith(folder.endsWith('/') ? folder : `${folder}/`);

function isLocalInside(dir, folder) {
  const rel = path.relative(folder, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Deepest first, so a folder is empty by the time its turn comes. A folder
// that still holds something (a skipped file) stays.
async function removeEmptyDirs(dirs, rmdir) {
  const sorted = Array.from(new Set(dirs)).sort((a, b) => b.length - a.length);
  for (const d of sorted) { try { await rmdir(d); } catch { /* not empty */ } }
}

// ── Download (server → local) ─────────────────────────────

// items: [{ path, isDir, name? }] on the server; localDir: where they land
// (`name` renames the top item at the destination). `opts.move` removes each
// server file once it is downloaded, then the emptied server folders.
async function download(client, items, localDir, job, opts = {}) {
  const signal = abortSignalFor(job);
  const skipUnchanged = opts.skipUnchanged !== false;
  const note = (rec) => { if (!opts.quiet) job.note(rec); };

  // Plan: every file with its size, every folder to create.
  const files = [];   // { remote, local, size, mtime }
  const dirs = [];    // local folders to create (in order)
  const remoteDirs = [];
  async function planDir(remoteDir, localTarget) {
    dirs.push(localTarget);
    remoteDirs.push(remoteDir);
    const entries = await client.list(remoteDir);
    job.throwIfCancelled();
    for (const e of entries) {
      const dest = path.join(localTarget, e.name);
      if (e.isDir) await planDir(e.path, dest);
      else files.push({ remote: e.path, local: dest, size: e.size, mtime: e.mtime || 0 });
    }
  }
  for (const it of items) {
    const name = it.name || posixBase(it.path);
    const dest = path.join(localDir, name);
    if (it.isDir) await planDir(it.path, dest);
    else files.push({ remote: it.path, local: dest, size: it.size || 0, mtime: it.mtime || 0 });
  }
  job.setTotal(files.length, files.reduce((s, f) => s + f.size, 0));

  for (const d of dirs) await fs.promises.mkdir(d, { recursive: true });

  let done = 0, skipped = 0;
  const toSend = [];
  for (const f of files) {
    job.throwIfCancelled();
    const ex = await local.exists(f.local);
    if (ex.exists) {
      if (skipUnchanged && isUnchanged(f, ex)) {
        skipped++;
        skipFile(job, { type: 'file', dir: 'download', src: f.remote, dest: f.local, size: f.size, ms: 0, skipped: true });
        continue;
      }
      const answer = await job.askConflict({ name: path.basename(f.local), destPath: f.local, destIsDir: ex.isDir, kind: 'download' });
      if (answer === 'cancel') throw cancelledError();
      if (answer === 'skip') { skipped++; skipFile(job, { type: 'file', dir: 'download', src: f.remote, dest: f.local, size: f.size, ms: 0, skipped: true }); continue; }
      if (ex.isDir) { const e = new Error(`A folder named '${path.basename(f.local)}' is in the way`); e.code = 'EISDIR'; e.path = f.local; throw e; }
    }
    toSend.push(f);
  }

  const pool = await takePool(client, toSend, opts, signal);
  try {
    await runPool(toSend, pool.clients, job, async (c, f) => {
      job.throwIfCancelled();
      job.begin(path.basename(f.local));
      const t0 = Date.now();
      await c.download(f.remote, f.local, (n) => job.addBytes(n), signal);
      if (opts.move) await c.removeFile(f.remote);
      done++;
      job.advance();
      note({ type: 'file', dir: 'download', src: f.remote, dest: f.local, size: f.size, ms: Date.now() - t0, skipped: false });
    });
  } finally {
    await pool.release();
  }
  if (opts.move) await removeEmptyDirs(remoteDirs, (d) => client.removeEmptyDir(d));
  return { done, skipped, files: files.length, localDir };
}

// ── Upload (local → server) ───────────────────────────────

// items: [{ path, isDir, name? }] on this machine; remoteDir: the server
// folder. `opts.move` deletes each local file once it is on the server.
async function upload(client, items, remoteDir, job, opts = {}) {
  const signal = abortSignalFor(job);
  const skipUnchanged = opts.skipUnchanged !== false;

  const files = [];   // { local, remote, size, mtime }
  const dirs = [];    // remote folders to create (parents first)
  const localDirs = [];
  for (const it of items) {
    const name = it.name || path.basename(it.path);
    const dest = posixJoin(remoteDir, name);
    if (it.isDir) {
      dirs.push(dest);
      localDirs.push(it.path);
      const tree = await local.walk(it.path);
      job.throwIfCancelled();
      for (const d of tree.dirs) { dirs.push(posixJoin(dest, d.rel)); localDirs.push(d.path); }
      for (const f of tree.files) files.push({ local: f.path, remote: posixJoin(dest, f.rel), size: f.size, mtime: f.mtime || 0 });
    } else {
      const st = await local.statPath(it.path);
      files.push({ local: it.path, remote: dest, size: st.size, mtime: st.mtime || 0 });
    }
  }
  job.setTotal(files.length, files.reduce((s, f) => s + f.size, 0));

  for (const d of dirs) { job.throwIfCancelled(); await client.ensureDir(d); }

  // One listing per remote folder answers "does it exist?" for all its files
  // (an FTP LIST per file would double the time of a big upload).
  const listings = new Map();
  async function remoteExists(p) {
    const dir = p.slice(0, p.lastIndexOf('/')) || '/';
    if (!listings.has(dir)) {
      let entries = [];
      try { entries = await client.list(dir); } catch { /* the folder was just created */ }
      listings.set(dir, new Map(entries.map((e) => [e.name, e])));
    }
    const hit = listings.get(dir).get(posixBase(p));
    return hit ? { exists: true, isDir: hit.isDir, size: hit.size, mtime: hit.mtime || 0 } : { exists: false, isDir: false, size: 0, mtime: 0 };
  }

  let done = 0, skipped = 0;
  const toSend = [];
  for (const f of files) {
    job.throwIfCancelled();
    const ex = await remoteExists(f.remote);
    if (ex.exists) {
      if (skipUnchanged && isUnchanged(f, ex)) {
        skipped++;
        skipFile(job, { type: 'file', dir: 'upload', src: f.local, dest: f.remote, size: f.size, ms: 0, skipped: true });
        continue;
      }
      const answer = await job.askConflict({ name: posixBase(f.remote), destPath: f.remote, destIsDir: ex.isDir, kind: 'upload' });
      if (answer === 'cancel') throw cancelledError();
      if (answer === 'skip') { skipped++; skipFile(job, { type: 'file', dir: 'upload', src: f.local, dest: f.remote, size: f.size, ms: 0, skipped: true }); continue; }
      if (ex.isDir) { const e = new Error(`A folder named '${posixBase(f.remote)}' is in the way`); e.code = 'EISDIR'; e.path = f.remote; throw e; }
    }
    toSend.push(f);
  }

  const pool = await takePool(client, toSend, opts, signal);
  try {
    await runPool(toSend, pool.clients, job, async (c, f) => {
      job.throwIfCancelled();
      job.begin(path.basename(f.local));
      const t0 = Date.now();
      await c.upload(f.local, f.remote, (n) => job.addBytes(n), signal);
      if (opts.move) await fs.promises.unlink(f.local);
      done++;
      job.advance();
      if (!opts.quiet) job.note({ type: 'file', dir: 'upload', src: f.local, dest: f.remote, size: f.size, ms: Date.now() - t0, skipped: false });
    });
  } finally {
    await pool.release();
  }
  if (opts.move) await removeEmptyDirs(localDirs, (d) => fs.promises.rmdir(d));
  return { done, skipped, files: files.length, remoteDir };
}

// ── Server → server ───────────────────────────────────────

// Move (cut & paste, drag inside the listing): a rename per item. A folder
// that meets a folder of the same name is merged item by item; a file that
// meets a file asks overwrite / skip.
async function moveRemote(client, items, destDir, job) {
  let done = 0, skipped = 0;
  async function moveInto(src, isDir, dir) {
    const name = posixBase(src);
    const dest = posixJoin(dir, name);
    if (dest === src) return;
    if (isDir && isRemoteInside(dir, src)) throw intoItselfError(src);
    const there = (await client.list(dir)).find((e) => e.name === name);
    job.throwIfCancelled();
    job.begin(name);
    if (!there) { await client.rename(src, dest); done++; return; }
    if (isDir && there.isDir) {
      for (const e of await client.list(src)) { job.throwIfCancelled(); await moveInto(e.path, e.isDir, dest); }
      try { await client.removeEmptyDir(src); } catch { /* a skipped file is still inside */ }
      return;
    }
    const answer = await job.askConflict({ name, destPath: dest, destIsDir: there.isDir, kind: 'move' });
    if (answer === 'cancel') throw cancelledError();
    if (answer === 'skip') { skipped++; return; }
    if (there.isDir || isDir) { const e = new Error(`A ${there.isDir ? 'folder' : 'file'} named '${name}' is in the way`); e.code = 'EISDIR'; e.path = dest; throw e; }
    await client.removeFile(dest);
    await client.rename(src, dest);
    done++;
  }
  job.setTotal(items.length, 0);
  for (const it of items) {
    job.throwIfCancelled();
    await moveInto(it.path, it.isDir, destDir);
    job.advance();
  }
  return { done, skipped, destDir };
}

// Copy on the server: FTP and SFTP have no copy command, so the items come
// down to a temporary folder and go back up under the destination. Pasted
// into their own folder they get a free name ("a (2).txt").
async function copyRemote(client, items, destDir, job, opts = {}) {
  let taken = null;
  const plan = [];
  for (const it of items) {
    if (it.isDir && isRemoteInside(destDir, it.path)) throw intoItselfError(it.path);
    let name = posixBase(it.path);
    if (posixParent(it.path) === destDir) {
      taken = taken || new Set((await client.list(destDir)).map((e) => e.name));
      name = uniqueName(name, taken, it.isDir);
      taken.add(name);
    }
    plan.push({ ...it, name });
  }
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'myftpclient-copy-'));
  try {
    await download(client, plan, tmp, job, { ...opts, skipUnchanged: false, move: false, quiet: true });
    job.resetProgress();
    return await upload(client, plan.map((p) => ({ path: path.join(tmp, p.name), isDir: p.isDir })), destDir, job, { ...opts, move: false });
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Local → local ─────────────────────────────────────────

// Copy or move (`opts.move`) files and folders into `destDir` on this
// machine. A move whose destination is free is a rename; otherwise (another
// drive, or a folder to merge) every file is copied, then the source removed.
async function copyLocal(items, destDir, job, opts = {}) {
  const fsp = fs.promises;
  const move = !!opts.move;
  const files = [];   // { src, dest, size, mtime }
  const dirs = [];    // destination folders to create
  const srcDirs = []; // source folders to remove after a move
  let done = 0, skipped = 0, renamed = 0;
  let taken = null;

  for (const it of items) {
    job.throwIfCancelled();
    let name = path.basename(it.path);
    const sameFolder = local.samePath(path.dirname(it.path), destDir);
    if (sameFolder && move) continue;   // already there
    if (it.isDir && isLocalInside(destDir, it.path)) throw intoItselfError(it.path);
    if (sameFolder) {
      taken = taken || new Set(await fsp.readdir(destDir));
      name = uniqueName(name, taken, it.isDir);
      taken.add(name);
    }
    const dest = path.join(destDir, name);
    if (move && !(await local.exists(dest)).exists) {
      try { job.begin(name); await fsp.rename(it.path, dest); renamed++; continue; } catch (err) { if (err.code !== 'EXDEV') throw err; }
    }
    if (it.isDir) {
      dirs.push(dest);
      srcDirs.push(it.path);
      const tree = await local.walk(it.path);
      for (const d of tree.dirs) { dirs.push(path.join(dest, ...d.rel.split('/'))); srcDirs.push(d.path); }
      for (const f of tree.files) files.push({ src: f.path, dest: path.join(dest, ...f.rel.split('/')), size: f.size, mtime: f.mtime });
    } else {
      const st = await local.statPath(it.path);
      files.push({ src: it.path, dest, size: st.size, mtime: st.mtime });
    }
  }
  job.setTotal(files.length + renamed, files.reduce((s, f) => s + f.size, 0));
  for (let i = 0; i < renamed; i++) job.advance();
  for (const d of dirs) await fsp.mkdir(d, { recursive: true });

  for (const f of files) {
    job.throwIfCancelled();
    const ex = await local.exists(f.dest);
    if (ex.exists) {
      const answer = await job.askConflict({ name: path.basename(f.dest), destPath: f.dest, destIsDir: ex.isDir, kind: move ? 'move' : 'copy' });
      if (answer === 'cancel') throw cancelledError();
      if (answer === 'skip') { skipped++; job.addBytes(f.size); job.advance(); continue; }
      if (ex.isDir) { const e = new Error(`A folder named '${path.basename(f.dest)}' is in the way`); e.code = 'EISDIR'; e.path = f.dest; throw e; }
    }
    job.begin(path.basename(f.dest));
    await fsp.copyFile(f.src, f.dest);
    if (f.mtime) { const t = new Date(f.mtime); await fsp.utimes(f.dest, t, t).catch(() => {}); }
    if (move) await fsp.unlink(f.src);
    done++;
    job.addBytes(f.size);
    job.advance();
  }
  if (move) await removeEmptyDirs(srcDirs, (d) => fsp.rmdir(d));
  return { done: done + renamed, skipped, destDir };
}

// ── Remote delete (files and folders, recursively) ───────

async function removeRemote(client, items, job) {
  let count = 0;
  async function rmDir(p) {
    const entries = await client.list(p);
    for (const e of entries) {
      job.throwIfCancelled();
      if (e.isDir) await rmDir(e.path);
      else { job.begin(e.name); await client.removeFile(e.path); count++; }
    }
    job.begin(posixBase(p));
    await client.removeEmptyDir(p);
    count++;
  }
  job.setTotal(items.length, 0);
  for (const it of items) {
    job.throwIfCancelled();
    if (it.isDir) await rmDir(it.path);
    else { job.begin(posixBase(it.path)); await client.removeFile(it.path); count++; }
    job.advance();
  }
  return { count };
}

module.exports = { download, upload, removeRemote, moveRemote, copyRemote, copyLocal, uniqueName, clampConcurrency, isUnchanged, MAX_CONCURRENCY };
