// A compressed file, opened only for as long as the reader is looking inside it.
//
// Nothing is written to disk. The archive stays in memory, and a book or a
// picture is inflated when the reader opens that one entry. ZIP (stored and
// deflate), tar, and gzip are read. RAR and 7-Zip are not.
import { looksLikeEpub } from './epub.js';
import { isArchiveFileName, isBookFileName, isHiddenName, sortFolderEntries } from './folders.js';
import { inflateRaw } from './inflate.js';
import { looksLikeZip, readEntry, readZip } from './zip.js';

const MARK = '\u0001';
const sessions = new Map();
const recent = [];
const KEEP = 8;
let memSeq = 0;

function touch(id) {
  const at = recent.indexOf(id);
  if (at >= 0) recent.splice(at, 1);
  recent.push(id);
  while (recent.length > KEEP) {
    const old = recent.shift();
    if (old !== id) sessions.delete(old);
  }
}

function baseName(name) {
  const parts = String(name || '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

/** A directory inside an archive the library is showing. */
export function archiveDirPath(id, inner = '') {
  return `${MARK}d${MARK}${id}${MARK}${inner}`;
}

/** One file inside an archive. */
export function archiveFilePath(id, inner) {
  return `${MARK}f${MARK}${id}${MARK}${inner}`;
}

export function parseArchivePath(filePath) {
  const text = String(filePath || '');
  if (!text.startsWith(`${MARK}d${MARK}`) && !text.startsWith(`${MARK}f${MARK}`)) return null;
  const role = text[1] === 'd' ? 'dir' : 'file';
  const rest = text.slice(3);
  const cut = rest.indexOf(MARK);
  if (cut < 0) return null;
  return { role, id: rest.slice(0, cut), inner: rest.slice(cut + 1) };
}

export function isArchiveDirPath(filePath) {
  return parseArchivePath(filePath)?.role === 'dir';
}

export function isArchiveMemberPath(filePath) {
  return parseArchivePath(filePath)?.role === 'file';
}

/** The archive's own name, for the heading of the folder it is shown as. */
export function archiveFolderTitle(filePath) {
  const parsed = parseArchivePath(filePath);
  if (!parsed) return '';
  const session = sessions.get(parsed.id);
  if (!session) return baseName(parsed.id);
  const nested = parsed.inner ? baseName(parsed.inner) : '';
  return nested || session.name || baseName(session.path);
}

function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

export function looksLikeGzip(data) {
  return !!data && data.length > 18 && data[0] === 0x1f && data[1] === 0x8b;
}

/** True for a ustar archive, or any header whose checksum matches. */
export function looksLikeTar(data) {
  if (!data || data.length < 512 || data[0] === 0) return false;
  const magic = latin1(data.subarray(257, 262));
  if (magic === 'ustar') return true;
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += (i >= 148 && i < 156) ? 32 : data[i];
  const field = latin1(data.subarray(148, 156)).replace(/\0/g, '').trim();
  const recorded = parseInt(field, 8);
  return Number.isFinite(recorded) && recorded === sum;
}

export function gunzip(data) {
  if (!looksLikeGzip(data)) throw new Error('This file is not a gzip archive.');
  if (data[2] !== 8) throw new Error('This gzip file uses a compression this reader does not support.');
  const flags = data[3];
  let off = 10;
  if (flags & 4) {
    const extra = data[off] | (data[off + 1] << 8);
    off += 2 + extra;
  }
  if (flags & 8) { while (off < data.length && data[off] !== 0) off += 1; off += 1; }
  if (flags & 16) { while (off < data.length && data[off] !== 0) off += 1; off += 1; }
  if (flags & 2) off += 2;
  if (off >= data.length - 8) throw new Error('This gzip file is truncated.');
  return inflateRaw(data.subarray(off, data.length - 8));
}

function readTar(data) {
  const files = [];
  let off = 0;
  while (off + 512 <= data.length) {
    if (data[off] === 0) break;
    const nameRaw = latin1(data.subarray(off, off + 100)).replace(/\0.*$/, '');
    let prefix = '';
    if (latin1(data.subarray(off + 257, off + 262)) === 'ustar') {
      prefix = latin1(data.subarray(off + 345, off + 500)).replace(/\0.*$/, '');
    }
    const name = (prefix ? `${prefix}/${nameRaw}` : nameRaw).replace(/\\/g, '/');
    const sizeField = latin1(data.subarray(off + 124, off + 136)).replace(/\0/g, '').trim();
    const size = parseInt(sizeField || '0', 8);
    const type = data[off + 156];
    const start = off + 512;
    const length = Number.isFinite(size) && size > 0 ? size : 0;
    if (type !== 53 && name && !name.endsWith('/')) {
      files.push({ name, data: data.subarray(start, start + length) });
    }
    off = start + Math.ceil(length / 512) * 512;
  }
  return files;
}

function skipped(name) {
  const parts = String(name || '').split('/');
  return parts.some((part) => !part || isHiddenName(part) || part === '__MACOSX');
}

function fromZip(data) {
  const zip = readZip(data);
  return {
    files: zip.entries
      .filter((entry) => !entry.directory && !skipped(entry.name))
      .map((entry) => ({
        name: entry.name.replace(/\\/g, '/'),
        size: entry.uncompressedSize || 0,
        read: () => readEntry(zip, entry),
      })),
  };
}

function fromFiles(list) {
  return {
    files: list
      .filter((file) => file?.name && !skipped(file.name))
      .map((file) => ({
        name: file.name.replace(/\\/g, '/'),
        size: file.data?.length || 0,
        read: () => file.data,
      })),
  };
}

function parseContainer(data, name) {
  const lower = String(name || '').toLowerCase();
  const gzip = lower.endsWith('.gz') || lower.endsWith('.gzip') || lower.endsWith('.tgz');
  const bytes = gzip ? gunzip(data) : data;
  const asTar = lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || looksLikeTar(bytes);
  if (asTar && looksLikeTar(bytes)) return fromFiles(readTar(bytes));
  if (gzip) {
    const inner = lower.endsWith('.tgz')
      ? String(name).replace(/\.tgz$/i, '.tar')
      : String(name).replace(/\.gz(ip)?$/i, '');
    return fromFiles([{ name: baseName(inner) || 'file', data: bytes }]);
  }
  if (looksLikeZip(data)) return fromZip(data);
  throw new Error('This archive could not be opened. ZIP, tar and gzip are read. RAR and 7-Zip are not.');
}

/**
 * True when this file should be shown as a folder of the books and pictures
 * inside it, rather than opened as one book. An EPUB that happens to be a ZIP
 * stays an EPUB.
 */
export function shouldBrowseArchive(data, name = '') {
  if (!isArchiveFileName(name) || looksLikeEpub(data, '')) return false;
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.tar')) return looksLikeTar(data);
  if (lower.endsWith('.gz') || lower.endsWith('.gzip') || lower.endsWith('.tgz')) return looksLikeGzip(data);
  if (lower.endsWith('.zip')) return looksLikeZip(data);
  return false;
}

/** Keeps an archive in memory and returns the id the library addresses it by. */
export function adoptArchive({ data, name = '', path = '', id = '' } = {}) {
  const key = id || path || `mem:${++memSeq}:${name}`;
  const existing = sessions.get(key);
  if (existing) { touch(key); return key; }
  const opened = parseContainer(data, name || baseName(path));
  sessions.set(key, { name: name || baseName(path), path: path || '', opened });
  touch(key);
  return key;
}

function sessionOf(id) {
  const session = sessions.get(id);
  if (!session) throw new Error('This archive is no longer open. Open it again.');
  touch(id);
  return session;
}

function worth(name) {
  return isBookFileName(name) || isArchiveFileName(name);
}

/** The folders, books and pictures directly inside one directory of an archive. */
export function listArchive(id, inner = '') {
  const session = sessionOf(id);
  const prefix = inner ? `${String(inner).replace(/\/+$/, '')}/` : '';
  const openableDirs = new Set();
  const files = [];
  for (const file of session.opened.files) {
    if (!file.name.startsWith(prefix) || !worth(baseName(file.name))) continue;
    const rest = file.name.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash > 0) openableDirs.add(rest.slice(0, slash));
    else files.push(file);
  }
  const rows = [...openableDirs].map((folder) => ({
    name: folder,
    path: archiveDirPath(id, `${prefix}${folder}`),
    kind: 'dir',
  }));
  for (const file of files) {
    const name = baseName(file.name);
    rows.push({
      name,
      path: archiveFilePath(id, file.name),
      kind: isArchiveFileName(name) ? 'archive' : 'book',
      size: file.size || 0,
      format: name.includes('.') ? name.split('.').pop().toLowerCase() : '',
    });
  }
  return sortFolderEntries(rows);
}

/** The bytes of one file inside an archive. Inflated now, and not saved. */
export function readArchiveFile(filePath) {
  const parsed = parseArchivePath(filePath);
  if (!parsed || parsed.role !== 'file') throw new Error('This is not a file inside an archive.');
  const session = sessionOf(parsed.id);
  const file = session.opened.files.find((entry) => entry.name === parsed.inner);
  if (!file) throw new Error(`The archive has no file named "${parsed.inner}".`);
  const data = file.read();
  return { data, name: baseName(file.name), size: data?.length || 0 };
}

/**
 * Lists a library path when it points into an archive already in memory.
 * A compressed file on disk is read by the caller, then adopted.
 * @returns {Array|null} entries, or null when this path is an ordinary folder
 */
export function listOpenArchive(dirPath) {
  const parsed = parseArchivePath(dirPath);
  if (!parsed) return null;
  if (parsed.role === 'dir') return listArchive(parsed.id, parsed.inner);
  const member = readArchiveFile(dirPath);
  const id = adoptArchive({
    data: member.data,
    name: member.name,
    id: `${parsed.id}>${parsed.inner}`,
  });
  return listArchive(id, '');
}
