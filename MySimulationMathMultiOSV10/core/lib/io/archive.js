// Archives: zip/unzip, gzip/gunzip, tar/untar, plus the JS helpers zipRead /
// zipWrite (used by the XLSX reader/writer).
import {
  E, S, strList, absPath, normPath, baseName, dirName, globRegExp, isDirPath, fsExists,
  readFileBytes, writeFileBytes, cellRowOf, str, concatBytes, utf8Encode, utf8Decode,
} from './util.js';
import { inflateRaw, deflateRaw, crc32, gzip as gzipBytes, gunzipBytes } from './zlib.js';

// ---------------------------------------------------------------- ZIP

const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
const fromDos = (t, dt) => (dt ? new Date(((dt >> 9) & 127) + 1980, ((dt >> 5) & 15) - 1, dt & 31, (t >> 11) & 31, (t >> 5) & 63, (t & 31) * 2) : null);
const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);

/** Reads a ZIP archive. Returns [{ name, data, mtime, isDir }]. */
export function zipRead(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw E('io:zip:corrupt', 'Invalid ZIP data: end of central directory not found.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw E('io:zip:zip64', 'ZIP64 archives are not supported.');
  const out = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw E('io:zip:corrupt', 'Invalid ZIP data: bad central directory entry.');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const t = dv.getUint16(p + 12, true), dt = dv.getUint16(p + 14, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const nb = b.subarray(p + 46, p + 46 + nlen);
    const name = flags & 0x800 ? utf8Decode(nb) : (() => { try { return utf8Decode(nb, true); } catch { return String.fromCharCode(...nb); } })();
    p += 46 + nlen + xlen + clen;
    if (dv.getUint32(loc, true) !== 0x04034b50) throw E('io:zip:corrupt', `Invalid ZIP data: bad local header for '${name}'.`);
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const raw = b.subarray(start, start + csize);
    if (flags & 1) throw E('io:zip:encrypted', `Encrypted ZIP entries are not supported ('${name}').`);
    const isDir = name.endsWith('/');
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = inflateRaw(raw, usize);
    else throw E('io:zip:method', `Unsupported ZIP compression method ${method} ('${name}').`);
    out.push({ name, data, mtime: fromDos(t, dt), isDir });
  }
  return out;
}

/** Writes a ZIP archive from [{ name, data, mtime? }] (names ending in '/' are folders). */
export function zipWrite(entries, opts = {}) {
  const level = opts.level ?? 6;
  const parts = []; const central = []; let off = 0;
  for (const e of entries) {
    const nameB = utf8Encode(e.name);
    const data = e.data ? (e.data instanceof Uint8Array ? e.data : Uint8Array.from(e.data)) : new Uint8Array(0);
    const comp = data.length && level > 0 ? deflateRaw(data, level) : null;
    const useDeflate = comp && comp.length < data.length;
    const body = useDeflate ? comp : data;
    const crc = crc32(data);
    const d = e.mtime instanceof Date ? e.mtime : new Date(e.mtime || Date.now());
    const flags = isAscii(e.name) ? 0 : 0x800;
    const h = new Uint8Array(30); const hv = new DataView(h.buffer);
    hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, flags, true); hv.setUint16(8, useDeflate ? 8 : 0, true);
    hv.setUint16(10, dosTime(d), true); hv.setUint16(12, dosDate(d), true); hv.setUint32(14, crc, true);
    hv.setUint32(18, body.length, true); hv.setUint32(22, data.length, true); hv.setUint16(26, nameB.length, true); hv.setUint16(28, 0, true);
    parts.push(h, nameB, body);
    const c = new Uint8Array(46); const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 0x031e, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, useDeflate ? 8 : 0, true);
    cv.setUint16(12, dosTime(d), true); cv.setUint16(14, dosDate(d), true); cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameB.length, true);
    cv.setUint32(38, e.name.endsWith('/') ? ((0o40755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, true);
    cv.setUint32(42, off, true);
    central.push(c, nameB);
    off += 30 + nameB.length + body.length;
  }
  const cd = concatBytes(central);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cd.length, true); ev.setUint32(16, off, true);
  return concatBytes([...parts, cd, end]);
}

// ---------------------------------------------------------------- TAR

const octal = (b, o, n) => { const s = String.fromCharCode(...b.subarray(o, o + n)).replace(/\0.*$/s, '').trim(); return s ? parseInt(s, 8) : 0; };
const cstr = (b, o, n) => { let e = o; while (e < o + n && b[e]) e++; return utf8Decode(b.subarray(o, e)); };

/** Reads a tar archive (ustar, GNU long names, pax path). Returns [{ name, data, mtime, isDir }]. */
export function tarRead(bytes) {
  const out = []; let p = 0; let longName = null;
  while (p + 512 <= bytes.length) {
    const h = bytes.subarray(p, p + 512);
    if (h.every((x) => x === 0)) break;
    let name = cstr(h, 0, 100);
    const size = octal(h, 124, 12), mtime = octal(h, 136, 12);
    const type = String.fromCharCode(h[156] || 48);
    if (String.fromCharCode(...h.subarray(257, 262)) === 'ustar') { const pre = cstr(h, 345, 155); if (pre) name = pre + '/' + name; }
    const data = bytes.slice(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = cstr(data, 0, data.length); continue; }
    if (type === 'x') { const m = /\d+ path=([^\n]*)\n/.exec(utf8Decode(data)); if (m) longName = m[1]; continue; }
    if (type === 'g') continue;
    if (longName) { name = longName; longName = null; }
    const isDir = type === '5' || name.endsWith('/');
    if (type !== '0' && type !== '\0' && type !== '5' && type !== '7' && !isDir) continue; // links, devices
    out.push({ name, data, mtime: new Date(mtime * 1000), isDir });
  }
  return out;
}

/** Writes a ustar archive from [{ name, data, mtime?, isDir? }]. */
export function tarWrite(entries) {
  const parts = [];
  const header = (name, size, mtime, type) => {
    const h = new Uint8Array(512);
    const put = (o, n, s) => { const b = utf8Encode(s); h.set(b.subarray(0, n), o); };
    const oct = (o, n, x) => put(o, n, x.toString(8).padStart(n - 1, '0') + '\0');
    put(0, 100, name); oct(100, 8, type === '5' ? 0o755 : 0o644); oct(108, 8, 0); oct(116, 8, 0);
    oct(124, 12, size); oct(136, 12, Math.floor(mtime / 1000));
    h.fill(32, 148, 156); h[156] = type.charCodeAt(0);
    put(257, 6, 'ustar\0'); put(263, 2, '00');
    let sum = 0; for (const x of h) sum += x;
    put(148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
    return h;
  };
  for (const e of entries) {
    const isDir = e.isDir || e.name.endsWith('/');
    const data = isDir ? new Uint8Array(0) : e.data;
    const mt = e.mtime instanceof Date ? e.mtime.getTime() : e.mtime || Date.now();
    let name = isDir && !e.name.endsWith('/') ? e.name + '/' : e.name;
    if (utf8Encode(name).length > 100) {
      const nb = utf8Encode(name + '\0');
      parts.push(header('././@LongLink', nb.length, 0, 'L'), nb, new Uint8Array((512 - (nb.length % 512)) % 512));
      name = name.slice(0, 100);
    }
    parts.push(header(name, data.length, mt, isDir ? '5' : '0'), data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  return concatBytes(parts);
}

// ---------------------------------------------------------------- input file lists

const hasWild = (s) => /[*?]/.test(s);
const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:\//.test(p) || p.startsWith('~');

/**
 * Expands file/folder names (with wildcards) relative to `root`. Returns
 * [{ abs, rel, isDir }] with folders followed by their contents.
 */
function expandInputs(ctx, names, root, fn) {
  const rootAbs = root ? absPath(ctx, root) : absPath(ctx, '.');
  const seen = new Set(); const out = [];
  const add = (p, rel) => {
    if (seen.has(p)) return; seen.add(p);
    if (isDirPath(ctx, p)) {
      if (rel) out.push({ abs: p, rel: rel + '/', isDir: true });
      for (const e of ctx.fs.list(p)) add(joinP(p, e.name), rel ? rel + '/' + e.name : e.name);
    } else out.push({ abs: p, rel, isDir: false });
  };
  const relOf = (p, fallbackBase) => {
    const pre = rootAbs.endsWith('/') ? rootAbs : rootAbs + '/';
    if (p === rootAbs.replace(/\/+$/, '')) return '';
    return p.startsWith(pre) ? p.slice(pre.length) : p.slice(fallbackBase.length + (fallbackBase.endsWith('/') ? 0 : 1));
  };
  for (const n0 of names) {
    const n = String(n0).replace(/\\/g, '/');
    const full = isAbs(n) ? absPath(ctx, n) : normPath((rootAbs.endsWith('/') ? rootAbs : rootAbs + '/') + n);
    if (hasWild(baseName(full))) {
      const dir = dirName(full);
      if (hasWild(dir)) throw E(`io:${fn}:wildcard`, 'Wildcards are only allowed in the last part of a path.');
      const re = globRegExp(baseName(full));
      let list = [];
      try { list = ctx.fs.list(dir); } catch { list = []; }
      const hits = list.filter((e) => re.test(e.name));
      if (!hits.length) throw E(`io:${fn}:noFiles`, `No files match '${n0}'.`);
      for (const e of hits) { const p = (dir.endsWith('/') ? dir : dir + '/') + e.name; add(p, relOf(p, dir)); }
    } else {
      if (!fsExists(ctx, full)) throw E(`io:${fn}:fileNotFound`, `File '${n0}' does not exist.`);
      add(full.replace(/\/+$/, '') || '/', relOf(full.replace(/\/+$/, ''), dirName(full)));
    }
  }
  return out;
}

const mtimeOf = (ctx, p) => { try { const m = ctx.fs.stat(p).mtimeMs; return m ? new Date(m) : new Date(); } catch { return new Date(); } };
const outFolder = (ctx, v, fallback) => (v === undefined ? fallback : absPath(ctx, S(v, 'Output folder')));
const joinP = (d, n) => (d.endsWith('/') ? d + n : d + '/' + n);
const listCell = (names) => cellRowOf(names.map((s) => str(s)));

/** Writes archive entries below `dir` and returns the written file paths. */
function extractEntries(ctx, entries, dir, fn) {
  ctx.fs.mkdir(dir);
  const files = [];
  for (const e of entries) {
    const rel = e.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (rel.split('/').includes('..')) throw E(`io:${fn}:unsafePath`, `Archive entry '${e.name}' leaves the output folder.`);
    const p = normPath(joinP(dir, rel));
    if (e.isDir) { ctx.fs.mkdir(p.replace(/\/+$/, '')); continue; }
    ctx.fs.mkdir(dirName(p));
    writeFileBytes(ctx, p, e.data);
    files.push(p);
  }
  return files;
}

function archiveEntries(ctx, args, fn) {
  if (args.length < 2) throw E(`io:${fn}:nargin`, `${fn} requires an archive name and the files to add.`);
  const items = expandInputs(ctx, strList(args[1]), args[2] !== undefined ? S(args[2], 'Root folder') : null, fn);
  return items.map((it) => ({ name: it.rel, isDir: it.isDir, data: it.isDir ? null : readFileBytes(ctx, it.abs), mtime: mtimeOf(ctx, it.abs) }));
}
function withExt(name, exts, def) {
  const low = name.toLowerCase();
  return exts.some((e) => low.endsWith(e)) ? name : name + def;
}

export const builtins = {
  zip(args, nargout, ctx) {
    const zipName = withExt(S(args[0] ?? str(''), 'Archive name'), ['.zip'], '.zip');
    const entries = archiveEntries(ctx, args, 'zip');
    writeFileBytes(ctx, zipName, zipWrite(entries));
    return nargout > 0 ? listCell(entries.filter((e) => !e.isDir).map((e) => e.name)) : undefined;
  },
  unzip(args, nargout, ctx) {
    if (!args.length) throw E('io:unzip:nargin', 'unzip requires a ZIP file name.');
    let file = S(args[0], 'ZIP file');
    if (!fsExists(ctx, absPath(ctx, file)) && fsExists(ctx, absPath(ctx, file + '.zip'))) file += '.zip';
    const dir = outFolder(ctx, args[1], absPath(ctx, '.'));
    const files = extractEntries(ctx, zipRead(readFileBytes(ctx, file)), dir, 'unzip');
    return nargout > 0 ? listCell(files) : undefined;
  },
  tar(args, nargout, ctx) {
    let name = S(args[0] ?? str(''), 'Archive name');
    const low = name.toLowerCase();
    const gz = low.endsWith('.tgz') || low.endsWith('.tar.gz');
    if (!gz && !low.endsWith('.tar')) name += '.tar';
    const entries = archiveEntries(ctx, args, 'tar');
    let bytes = tarWrite(entries);
    if (gz) bytes = gzipBytes(bytes, { name: baseName(name).replace(/\.(tgz|gz)$/i, (m) => (m.toLowerCase() === '.tgz' ? '.tar' : '')) });
    writeFileBytes(ctx, name, bytes);
    return nargout > 0 ? listCell(entries.filter((e) => !e.isDir).map((e) => e.name)) : undefined;
  },
  untar(args, nargout, ctx) {
    if (!args.length) throw E('io:untar:nargin', 'untar requires a tar file name.');
    const file = S(args[0], 'Tar file');
    let bytes = readFileBytes(ctx, file);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = concatBytes(gunzipBytes(bytes).map((x) => x.data));
    const dir = outFolder(ctx, args[1], absPath(ctx, '.'));
    const files = extractEntries(ctx, tarRead(bytes), dir, 'untar');
    return nargout > 0 ? listCell(files) : undefined;
  },
  gzip(args, nargout, ctx) {
    if (!args.length) throw E('io:gzip:nargin', 'gzip requires the files to compress.');
    const items = expandInputs(ctx, strList(args[0]), null, 'gzip').filter((x) => !x.isDir);
    const dir = args[1] !== undefined ? absPath(ctx, S(args[1], 'Output folder')) : null;
    const outNames = [];
    for (const it of items) {
      const target = dir ? joinP(dir, baseName(it.abs) + '.gz') : it.abs + '.gz';
      if (dir) ctx.fs.mkdir(dir);
      const m = mtimeOf(ctx, it.abs);
      writeFileBytes(ctx, target, gzipBytes(readFileBytes(ctx, it.abs), { name: baseName(it.abs), mtime: m.getTime() / 1000 }));
      outNames.push(target);
    }
    return nargout > 0 ? listCell(outNames) : undefined;
  },
  gunzip(args, nargout, ctx) {
    if (!args.length) throw E('io:gunzip:nargin', 'gunzip requires the files to decompress.');
    const items = expandInputs(ctx, strList(args[0]), null, 'gunzip').filter((x) => !x.isDir);
    const dir = args[1] !== undefined ? absPath(ctx, S(args[1], 'Output folder')) : null;
    const outNames = [];
    for (const it of items) {
      const parts = gunzipBytes(readFileBytes(ctx, it.abs));
      const data = parts.length === 1 ? parts[0].data : concatBytes(parts.map((x) => x.data));
      const base = baseName(it.abs).replace(/\.gz$/i, '').replace(/\.tgz$/i, '.tar');
      const target = joinP(dir || dirName(it.abs), base === baseName(it.abs) ? base + '.out' : base);
      if (dir) ctx.fs.mkdir(dir);
      writeFileBytes(ctx, target, data);
      outNames.push(target);
    }
    return nargout > 0 ? listCell(outNames) : undefined;
  },
};

export const help = {
  zip: {
    en: 'Compress files and folders into a ZIP file. Wildcards (* ?) are allowed; folders are added with their contents. Entry names are relative to rootfolder (default: the current folder). Returns the names of the archived files.',
    ko: '파일과 폴더를 ZIP 파일로 압축합니다. 와일드카드(* ?)를 쓸 수 있고 폴더는 내용과 함께 추가됩니다. 항목 이름은 rootfolder(기본: 현재 폴더) 기준 상대 경로입니다. 압축된 파일 이름을 반환합니다.',
    syntax: ['zip(zipfilename, filenames)', 'zip(zipfilename, filenames, rootfolder)', 'entries = zip(___)'],
  },
  unzip: {
    en: 'Extract the contents of a ZIP file into outputfolder (default: the current folder). Returns the extracted file names.',
    ko: 'ZIP 파일 내용을 outputfolder(기본: 현재 폴더)에 풉니다. 풀린 파일 이름을 반환합니다.',
    syntax: ['unzip(zipfilename)', 'unzip(zipfilename, outputfolder)', 'filenames = unzip(___)'],
  },
  tar: {
    en: 'Archive files and folders into a tar file; a .tgz or .tar.gz name also gzip-compresses the archive.',
    ko: '파일과 폴더를 tar 파일로 묶습니다. 이름이 .tgz 또는 .tar.gz 이면 gzip 으로도 압축합니다.',
    syntax: ['tar(tarfilename, filenames)', 'tar(tarfilename, filenames, rootfolder)', 'entries = tar(___)'],
  },
  untar: {
    en: 'Extract the contents of a tar file (plain or gzip-compressed) into outputfolder.',
    ko: 'tar 파일(일반 또는 gzip 압축)의 내용을 outputfolder 에 풉니다.',
    syntax: ['untar(tarfilename)', 'untar(tarfilename, outputfolder)', 'filenames = untar(___)'],
  },
  gzip: {
    en: 'Compress each file into a .gz file (next to it, or in outputfolder).',
    ko: '각 파일을 .gz 파일로 압축합니다(같은 폴더 또는 outputfolder).',
    syntax: ['gzip(files)', 'gzip(files, outputfolder)', 'gzfilenames = gzip(___)'],
  },
  gunzip: {
    en: 'Decompress .gz files (next to them, or in outputfolder).',
    ko: '.gz 파일의 압축을 풉니다(같은 폴더 또는 outputfolder).',
    syntax: ['gunzip(files)', 'gunzip(files, outputfolder)', 'filenames = gunzip(___)'],
  },
};
