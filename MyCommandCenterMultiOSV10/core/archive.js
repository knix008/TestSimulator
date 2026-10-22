// Archives: create / extract tar.gz, tar.bz2 and zip, with split volumes.
//
// Split naming follows the GTK version of Command Center so the two can read
// each other's output:
//   zip      →  name.zip, name.z01, name.z02, …
//   tar.gz   →  name.tgz, name.tgz.001, name.tgz.002, …
//   tar.bz2  →  name.tbz2, name.tbz2.001, …
// Extraction also accepts GNU `split` output (name.tar.gz.aa, .ab, …).
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Worker } = require('worker_threads');
const yazl = require('yazl');
const yauzl = require('yauzl');

const tar = require('./tar');
const { cancelledError } = tar;

const FORMATS = ['tar.gz', 'tar.bz2', 'zip'];

function formatExt(format) {
  return format === 'zip' ? '.zip' : format === 'tar.bz2' ? '.tar.bz2' : '.tar.gz';
}

function splitExt(format) {
  return format === 'zip' ? '.zip' : format === 'tar.bz2' ? '.tbz2' : '.tgz';
}

function extFor({ format, split, splitSize }) {
  return split && splitSize > 0 ? splitExt(format) : formatExt(format);
}

const KNOWN_EXTS = ['.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.tar', '.zip', '.gz', '.bz2'];

function hasArchiveExt(p) {
  const lower = p.toLowerCase();
  return KNOWN_EXTS.some((e) => lower.endsWith(e));
}

function isArchive(p) { return hasArchiveExt(p); }

// Strips one archive extension (".tar.gz" before ".gz") from a file name.
function stripArchiveExt(name) {
  const lower = name.toLowerCase();
  for (const e of KNOWN_EXTS) if (lower.endsWith(e)) return name.slice(0, name.length - e.length);
  return name;
}

function isZipVolumeSuffix(s) { return /^z\d+$/.test(s); }
function isNumericSuffix(s) { return /^\d{3}$/.test(s); }
function isGnuSuffix(s) { return /^[a-z]{2}$/.test(s); }

// A later volume: name.z01 / name.tgz.001 / name.tar.gz.aa → base path.
function splitPartBase(p) {
  const dot = p.lastIndexOf('.');
  if (dot <= 0) return null;
  const suffix = p.slice(dot + 1);
  const base = p.slice(0, dot);
  if (isZipVolumeSuffix(suffix)) return base;
  if (isNumericSuffix(suffix) && hasArchiveExt(base)) return base;
  // Two lowercase letters could be GNU split output (.aa, .ab, …) — but also
  // a plain ".gz" / ".xz"; only a set that really starts with ".aa" counts.
  if (isGnuSuffix(suffix) && hasArchiveExt(base) && existsSync(`${base}.aa`)) return base;
  return null;
}

function existsSync(p) { try { fs.accessSync(p); return true; } catch { return false; } }

// First segment or a later volume of a split set → { base, scheme }.
function splitDetect(p) {
  const partBase = splitPartBase(p);
  if (partBase) {
    const scheme = isZipVolumeSuffix(p.slice(p.lastIndexOf('.') + 1)) ? 'zip' : isGnuSuffix(p.slice(p.lastIndexOf('.') + 1)) ? 'gnu' : 'num';
    return { base: partBase, scheme };
  }
  if (p.toLowerCase().endsWith('.zip')) {
    const base = p.slice(0, -4);
    if (existsSync(`${base}.z01`)) return { base, scheme: 'zip' };
  }
  if (hasArchiveExt(p)) {
    if (existsSync(`${p}.001`)) return { base: p, scheme: 'num' };
    if (existsSync(`${p}.aa`)) return { base: p, scheme: 'gnu' };
  }
  return null;
}

function partPath(base, scheme, index) {
  if (scheme === 'zip') return index === 0 ? `${base}.zip` : `${base}.z${String(index).padStart(2, '0')}`;
  if (scheme === 'gnu') {
    const a = String.fromCharCode(97 + Math.floor(index / 26));
    const b = String.fromCharCode(97 + (index % 26));
    return `${base}.${a}${b}`;
  }
  return index === 0 ? base : `${base}.${String(index).padStart(3, '0')}`;
}

function describe(p) {
  const split = splitDetect(p);
  return { isArchive: isArchive(p) || !!split, isSplit: !!split, base: split ? split.base : null };
}

// ── Split / join ──────────────────────────────────────────

async function splitFile(src, base, scheme, partSize, job) {
  const fh = await fsp.open(src, 'r');
  const buf = Buffer.alloc(1 << 20);
  const parts = [];
  try {
    let index = 0;
    let out = null;
    let written = 0;
    for (;;) {
      if (job && job.isCancelled()) throw cancelledError();
      const { bytesRead } = await fh.read(buf, 0, buf.length, null);
      if (!bytesRead) break;
      let off = 0;
      while (off < bytesRead) {
        if (!out || written >= partSize) {
          if (out) await out.close();
          const p = partPath(base, scheme, index++);
          parts.push(p);
          out = await fsp.open(p, 'w');
          written = 0;
          if (job) job.progress(path.basename(p), false);
        }
        const n = Math.min(bytesRead - off, partSize - written);
        await out.write(buf, off, n);
        off += n;
        written += n;
      }
    }
    if (out) await out.close();
  } finally {
    await fh.close();
  }
  return parts;
}

async function joinParts(base, scheme, job) {
  const tmp = path.join(os.tmpdir(), `cc-join-${process.pid}-${Date.now()}${scheme === 'zip' ? '.zip' : path.extname(base)}`);
  const out = await fsp.open(tmp, 'w');
  let any = false;
  try {
    for (let i = 0; ; i++) {
      const p = partPath(base, scheme, i);
      if (!existsSync(p)) break;
      any = true;
      if (job) job.progress(path.basename(p), false);
      const rs = fs.createReadStream(p, { highWaterMark: 1 << 20 });
      for await (const chunk of rs) {
        if (job && job.isCancelled()) { rs.destroy(); throw cancelledError(); }
        await out.write(chunk);
      }
    }
  } finally {
    await out.close();
  }
  if (!any) {
    await fsp.unlink(tmp).catch(() => {});
    throw new Error(`SPLIT_PARTS_MISSING:${base}`);
  }
  return tmp;
}

// ── bzip2 via worker ──────────────────────────────────────

function workerScript() {
  // Inside a packaged Electron app the worker must run from the unpacked copy
  // (worker threads cannot load scripts out of app.asar).
  return path.join(__dirname, 'bzip2-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function bzip2(mode, input, output, job) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScript(), { workerData: { mode, input, output } });
    let finished = false;
    const poll = setInterval(() => {
      if (job && job.isCancelled() && !finished) {
        finished = true;
        clearInterval(poll);
        worker.terminate().catch(() => {});
        reject(cancelledError());
      }
    }, 100);
    worker.on('message', (m) => {
      if (m.type === 'progress' && job) {
        const pct = m.total ? Math.round((m.bytes / m.total) * 100) : 0;
        job.progress(`bzip2 ${pct}%`, false);
      } else if (m.type === 'done') { finished = true; clearInterval(poll); resolve(); }
      else if (m.type === 'error') { finished = true; clearInterval(poll); reject(new Error(m.message)); }
    });
    worker.on('error', (err) => { if (!finished) { finished = true; clearInterval(poll); reject(err); } });
    worker.on('exit', (code) => { if (!finished) { finished = true; clearInterval(poll); reject(new Error(`bzip2 worker exited (${code})`)); } });
  });
}

// ── Create ────────────────────────────────────────────────

function tmpFile(suffix) {
  return path.join(os.tmpdir(), `cc-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
}

async function writeTarTo(dest, entries, job, compress) {
  const source = tar.readableFromEntries(entries, {
    isCancelled: () => job.isCancelled(),
    onEntry: (name) => job.progress(name),
  });
  const ws = fs.createWriteStream(dest);
  if (compress === 'gz') await pipeline(source, zlib.createGzip({ level: 6 }), ws);
  else await pipeline(source, ws);
}

async function createZip(dest, entries, job) {
  const zip = new yazl.ZipFile();
  const ws = fs.createWriteStream(dest);
  const done = new Promise((resolve, reject) => {
    ws.on('close', resolve);
    ws.on('error', reject);
    zip.outputStream.on('error', reject);
  });
  zip.outputStream.pipe(ws);
  const poll = setInterval(() => {
    if (job.isCancelled()) { clearInterval(poll); zip.outputStream.unpipe(ws); ws.destroy(cancelledError()); }
  }, 100);
  try {
    for (const e of entries) {
      if (job.isCancelled()) throw cancelledError();
      job.progress(e.name);
      const opts = { mtime: new Date((e.mtime || 0) * 1000), mode: e.mode };
      if (e.isDir) zip.addEmptyDirectory(e.name, opts);
      else if (e.isSymlink) zip.addBuffer(Buffer.from(e.target || '', 'utf8'), e.name, { ...opts, mode: 0o120777 });
      else zip.addFile(e.realPath, e.name, opts);
    }
    zip.end();
    await done;
  } finally {
    clearInterval(poll);
  }
}

// opts: { sources, destBase (path without extension), format, split, splitSize }
// Result: { archivePath, parts }
async function create(opts, job) {
  const { sources, destBase } = opts;
  const format = FORMATS.includes(opts.format) ? opts.format : 'tar.gz';
  const split = !!opts.split && opts.splitSize > 0;
  const ext = extFor({ format, split, splitSize: opts.splitSize });
  const dest = `${destBase}${ext}`;

  const entries = await tar.collectEntries(sources, { isCancelled: () => job.isCancelled() });
  job.setTotal(entries.length);

  const cleanup = [];
  try {
    if (format === 'zip') {
      await createZip(dest, entries, job);
    } else if (format === 'tar.gz') {
      await writeTarTo(dest, entries, job, 'gz');
    } else {
      const rawTar = tmpFile('.tar');
      cleanup.push(rawTar);
      await writeTarTo(rawTar, entries, job, null);
      await bzip2('compress', rawTar, dest, job);
    }

    if (!split) return { archivePath: dest, parts: [dest] };

    // Split: the first volume keeps the archive's own name, so read from a
    // temporary copy and write the volumes over it.
    const whole = tmpFile('.whole');
    cleanup.push(whole);
    await fsp.rename(dest, whole);
    const scheme = format === 'zip' ? 'zip' : 'num';
    const base = format === 'zip' ? destBase : dest;
    const parts = await splitFile(whole, base, scheme, opts.splitSize, job);
    return { archivePath: dest, parts };
  } catch (err) {
    await fsp.unlink(dest).catch(() => {});
    if (split) {
      const scheme = format === 'zip' ? 'zip' : 'num';
      const base = format === 'zip' ? destBase : dest;
      for (let i = 0; i < 10000; i++) {
        const p = partPath(base, scheme, i);
        if (!existsSync(p)) break;
        await fsp.unlink(p).catch(() => {});
      }
    }
    throw err;
  } finally {
    for (const f of cleanup) await fsp.unlink(f).catch(() => {});
  }
}

// ── Extract ───────────────────────────────────────────────

function safeJoin(destDir, entryName) {
  const cleaned = entryName.replace(/\\/g, '/').replace(/^(\.\.\/|\/)+/, '');
  const full = path.resolve(destDir, cleaned);
  const rel = path.relative(path.resolve(destDir), full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Unsafe path in archive: ${entryName}`);
  return full;
}

async function writeBody(full, body, mode, mtime) {
  await fsp.mkdir(path.dirname(full), { recursive: true });
  const ws = fs.createWriteStream(full);
  await pipeline(body, ws);
  try {
    if (mtime) await fsp.utimes(full, new Date(mtime * 1000), new Date(mtime * 1000));
    if (process.platform !== 'win32' && mode) await fsp.chmod(full, mode & 0o777);
  } catch { /* best effort */ }
}

async function extractTarStream(source, destDir, job) {
  let count = 0;
  await tar.readTar(source, async (entry, body) => {
    const full = safeJoin(destDir, entry.name);
    job.progress(entry.name);
    count++;
    if (entry.type === '5') {
      await fsp.mkdir(full, { recursive: true });
    } else if (entry.type === '2' && process.platform !== 'win32') {
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.unlink(full).catch(() => {});
      await fsp.symlink(entry.linkname, full);
    } else if (entry.type === '0' || entry.type === '2') {
      await writeBody(full, body, entry.mode, entry.mtime);
    }
  }, { isCancelled: () => job.isCancelled() });
  return count;
}

function decodeZipName(entry) {
  const raw = entry.fileNameRaw || entry.fileName;
  if (typeof raw === 'string') return raw;
  const utf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
  if (utf8) return raw.toString('utf8');
  // Info-ZIP unicode path extra field
  for (const f of entry.extraFields || []) {
    if (f.id === 0x7075 && f.data.length > 5 && f.data[0] === 1) return f.data.subarray(5).toString('utf8');
  }
  // No flag: try UTF-8, then the Korean Windows code page, then CP437-ish.
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { /* not utf8 */ }
  try { return new TextDecoder('euc-kr', { fatal: true }).decode(raw); } catch { /* not euc-kr */ }
  return raw.toString('latin1');
}

async function extractZip(archivePath, destDir, job) {
  const zipfile = await yauzl.openPromise(archivePath, { lazyEntries: true, decodeStrings: false, autoClose: true });
  let count = 0;
  try {
    await new Promise((resolve, reject) => {
      zipfile.on('error', reject);
      zipfile.on('end', resolve);
      zipfile.on('entry', async (entry) => {
        try {
          if (job.isCancelled()) throw cancelledError();
          const name = decodeZipName(entry).replace(/\\/g, '/');
          job.progress(name);
          count++;
          const full = safeJoin(destDir, name);
          const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
          if (name.endsWith('/')) {
            await fsp.mkdir(full, { recursive: true });
          } else if ((mode & 0o170000) === 0o120000 && process.platform !== 'win32') {
            const rs = await zipfile.openReadStreamPromise(entry);
            const chunks = [];
            for await (const c of rs) chunks.push(c);
            await fsp.mkdir(path.dirname(full), { recursive: true });
            await fsp.unlink(full).catch(() => {});
            await fsp.symlink(Buffer.concat(chunks).toString('utf8'), full);
          } else {
            const rs = await zipfile.openReadStreamPromise(entry);
            const mtime = entry.getLastModDate ? entry.getLastModDate().getTime() / 1000 : 0;
            await writeBody(full, rs, mode & 0o777, mtime);
          }
          zipfile.readEntry();
        } catch (err) {
          zipfile.close();
          reject(err);
        }
      });
      zipfile.readEntry();
    });
  } finally {
    try { zipfile.close(); } catch { /* already closed */ }
  }
  return count;
}

function kindOf(p) {
  const lower = p.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'tar.bz2';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.gz')) return 'gz';
  if (lower.endsWith('.bz2')) return 'bz2';
  if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'xz';
  return 'unknown';
}

// Sniff the real container: a split set's base may be named ".zip" while the
// bytes are a tar, and vice versa. Falls back to the extension.
async function sniffKind(p, byExt) {
  const fh = await fsp.open(p, 'r');
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    if (bytesRead >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
    if (bytesRead >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return byExt === 'gz' ? 'gz' : 'tar.gz';
    if (bytesRead >= 3 && buf[0] === 0x42 && buf[1] === 0x5a && buf[2] === 0x68) return byExt === 'bz2' ? 'bz2' : 'tar.bz2';
    if (bytesRead >= 4 && buf[0] === 0xfd && buf[1] === 0x37) return 'xz';
  } finally {
    await fh.close();
  }
  return byExt;
}

// Result: { entries, destDir }
async function extract({ archivePath, destDir }, job) {
  const split = splitDetect(archivePath);
  let actual = archivePath;
  let joined = null;
  const cleanup = [];
  try {
    if (split) {
      joined = await joinParts(split.base, split.scheme, job);
      cleanup.push(joined);
      actual = joined;
    }
    const nameForKind = split ? (split.scheme === 'zip' ? `${split.base}.zip` : split.base) : archivePath;
    const kind = await sniffKind(actual, kindOf(nameForKind));
    await fsp.mkdir(destDir, { recursive: true });

    let count = 0;
    if (kind === 'zip') {
      count = await extractZip(actual, destDir, job);
    } else if (kind === 'tar.gz') {
      count = await extractTarStream(fs.createReadStream(actual).pipe(zlib.createGunzip()), destDir, job);
    } else if (kind === 'tar') {
      count = await extractTarStream(fs.createReadStream(actual), destDir, job);
    } else if (kind === 'tar.bz2') {
      const rawTar = tmpFile('.tar');
      cleanup.push(rawTar);
      await bzip2('decompress', actual, rawTar, job);
      count = await extractTarStream(fs.createReadStream(rawTar), destDir, job);
    } else if (kind === 'gz') {
      const out = path.join(destDir, stripArchiveExt(path.basename(nameForKind)));
      job.progress(path.basename(out));
      await pipeline(fs.createReadStream(actual), zlib.createGunzip(), fs.createWriteStream(out));
      count = 1;
    } else if (kind === 'bz2') {
      const out = path.join(destDir, stripArchiveExt(path.basename(nameForKind)));
      job.progress(path.basename(out));
      await bzip2('decompress', actual, out, job);
      count = 1;
    } else {
      throw new Error(`UNSUPPORTED_FORMAT:${path.basename(archivePath)}`);
    }
    return { entries: count, destDir };
  } finally {
    for (const f of cleanup) await fsp.unlink(f).catch(() => {});
  }
}

module.exports = {
  FORMATS,
  formatExt,
  splitExt,
  extFor,
  isArchive,
  stripArchiveExt,
  splitDetect,
  describe,
  create,
  extract,
  partPath,
};
