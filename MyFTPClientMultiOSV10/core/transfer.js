// Download / upload of files and whole folders, driven by a Job:
//
//   1. plan   — walk the source tree, count files and bytes (progress total)
//   2. move   — one file at a time; a destination that already exists asks
//               the user (overwrite / skip / cancel, "apply to all")
//
// The same code serves FTP, FTPS and SFTP because core/remote.js hides the
// protocol. Remote paths are POSIX; local paths use the host's separator.
'use strict';

const path = require('path');
const local = require('./local');
const { posixJoin, posixBase } = require('./remote');
const { cancelledError } = require('./jobs');

function abortSignalFor(job) {
  const ac = new AbortController();
  job.onCancel(() => ac.abort());
  if (job.isCancelled()) ac.abort();
  return ac.signal;
}

// ── Download (server → local) ─────────────────────────────

// items: [{ path, isDir }] on the server; localDir: where they land.
async function download(client, items, localDir, job) {
  const signal = abortSignalFor(job);

  // Plan: every file with its size, every folder to create.
  const files = [];   // { remote, local, size }
  const dirs = [];    // local folders to create (in order)
  async function planDir(remoteDir, localTarget) {
    dirs.push(localTarget);
    const entries = await client.list(remoteDir);
    job.throwIfCancelled();
    for (const e of entries) {
      const dest = path.join(localTarget, e.name);
      if (e.isDir) await planDir(e.path, dest);
      else files.push({ remote: e.path, local: dest, size: e.size });
    }
  }
  for (const it of items) {
    const name = posixBase(it.path);
    const dest = path.join(localDir, name);
    if (it.isDir) await planDir(it.path, dest);
    else files.push({ remote: it.path, local: dest, size: it.size || 0 });
  }
  job.setTotal(files.length, files.reduce((s, f) => s + f.size, 0));

  for (const d of dirs) await require('fs').promises.mkdir(d, { recursive: true });

  let done = 0, skipped = 0;
  for (const f of files) {
    job.throwIfCancelled();
    job.begin(path.basename(f.local));
    const ex = await local.exists(f.local);
    if (ex.exists) {
      const answer = await job.askConflict({ name: path.basename(f.local), destPath: f.local, destIsDir: ex.isDir, kind: 'download' });
      if (answer === 'cancel') throw cancelledError();
      if (answer === 'skip') { skipped++; job.addBytes(f.size); job.advance(); job.note({ type: 'file', dir: 'download', src: f.remote, dest: f.local, size: f.size, ms: 0, skipped: true }); continue; }
      if (ex.isDir) { const e = new Error(`A folder named '${path.basename(f.local)}' is in the way`); e.code = 'EISDIR'; e.path = f.local; throw e; }
    }
    const t0 = Date.now();
    await client.download(f.remote, f.local, (n) => job.addBytes(n), signal);
    done++;
    job.advance();
    job.note({ type: 'file', dir: 'download', src: f.remote, dest: f.local, size: f.size, ms: Date.now() - t0, skipped: false });
  }
  return { done, skipped, files: files.length, localDir };
}

// ── Upload (local → server) ───────────────────────────────

// items: [{ path, isDir }] on this machine; remoteDir: the server folder.
async function upload(client, items, remoteDir, job) {
  const signal = abortSignalFor(job);

  const files = [];   // { local, remote, size }
  const dirs = [];    // remote folders to create (parents first)
  for (const it of items) {
    const name = path.basename(it.path);
    const dest = posixJoin(remoteDir, name);
    if (it.isDir) {
      dirs.push(dest);
      const tree = await local.walk(it.path);
      job.throwIfCancelled();
      for (const d of tree.dirs) dirs.push(posixJoin(dest, d.rel));
      for (const f of tree.files) files.push({ local: f.path, remote: posixJoin(dest, f.rel), size: f.size });
    } else {
      const st = await local.statPath(it.path);
      files.push({ local: it.path, remote: dest, size: st.size });
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
    return hit ? { exists: true, isDir: hit.isDir } : { exists: false, isDir: false };
  }

  let done = 0, skipped = 0;
  for (const f of files) {
    job.throwIfCancelled();
    job.begin(path.basename(f.local));
    const ex = await remoteExists(f.remote);
    if (ex.exists) {
      const answer = await job.askConflict({ name: posixBase(f.remote), destPath: f.remote, destIsDir: ex.isDir, kind: 'upload' });
      if (answer === 'cancel') throw cancelledError();
      if (answer === 'skip') { skipped++; job.addBytes(f.size); job.advance(); job.note({ type: 'file', dir: 'upload', src: f.local, dest: f.remote, size: f.size, ms: 0, skipped: true }); continue; }
      if (ex.isDir) { const e = new Error(`A folder named '${posixBase(f.remote)}' is in the way`); e.code = 'EISDIR'; e.path = f.remote; throw e; }
    }
    const t0 = Date.now();
    await client.upload(f.local, f.remote, (n) => job.addBytes(n), signal);
    done++;
    job.advance();
    job.note({ type: 'file', dir: 'upload', src: f.local, dest: f.remote, size: f.size, ms: Date.now() - t0, skipped: false });
  }
  return { done, skipped, files: files.length, remoteDir };
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

module.exports = { download, upload, removeRemote };
