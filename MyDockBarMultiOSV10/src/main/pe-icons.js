'use strict';

/**
 * Enumerates every icon stored in a Windows PE file (.exe, .dll, .ocx, .cpl).
 *
 * `app.getFileIcon` only ever returns the one icon the shell picks, but a
 * program file usually carries several. RocketDock lets you choose among them,
 * so this walks the PE resource tree itself and rebuilds each RT_GROUP_ICON
 * into a standalone .ico that Chromium can display directly.
 *
 * Pure parsing, no native dependency. Returns [] for anything that is not a
 * readable PE file rather than throwing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RT_ICON = 3;
const RT_GROUP_ICON = 14;

/* ------------------------------ PE structure ----------------------------- */

function readHeaders(buf) {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return null; // 'MZ'

  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 24 > buf.length || buf.readUInt32LE(peOffset) !== 0x00004550) return null; // 'PE\0\0'

  const coff = peOffset + 4;
  const sectionCount = buf.readUInt16LE(coff + 2);
  const optionalSize = buf.readUInt16LE(coff + 16);
  const optional = coff + 20;
  if (optional + optionalSize > buf.length) return null;

  const magic = buf.readUInt16LE(optional);
  // The data directory sits after the optional header's fixed part, which
  // differs between PE32 (0x10b) and PE32+ (0x20b).
  const dataDirOffset = magic === 0x20b ? optional + 112 : optional + 96;
  if (dataDirOffset + 8 * 3 > buf.length) return null;

  const resourceRva = buf.readUInt32LE(dataDirOffset + 8 * 2);
  if (!resourceRva) return null;

  const sections = [];
  let cursor = optional + optionalSize;
  for (let i = 0; i < sectionCount; i += 1) {
    if (cursor + 40 > buf.length) break;
    sections.push({
      virtualAddress: buf.readUInt32LE(cursor + 12),
      sizeOfRawData: buf.readUInt32LE(cursor + 16),
      pointerToRawData: buf.readUInt32LE(cursor + 20),
    });
    cursor += 40;
  }

  return { resourceRva, sections };
}

function rvaToOffset(rva, sections) {
  for (const section of sections) {
    const start = section.virtualAddress;
    const end = start + Math.max(section.sizeOfRawData, 1);
    if (rva >= start && rva < end) return section.pointerToRawData + (rva - start);
  }
  return -1;
}

/** Walk one IMAGE_RESOURCE_DIRECTORY and yield {id, offset, isDirectory}. */
function readDirectory(buf, base, offset) {
  const at = base + offset;
  if (at + 16 > buf.length) return [];

  const named = buf.readUInt16LE(at + 12);
  const ids = buf.readUInt16LE(at + 14);
  const entries = [];

  for (let i = 0; i < named + ids; i += 1) {
    const entryAt = at + 16 + i * 8;
    if (entryAt + 8 > buf.length) break;
    const nameField = buf.readUInt32LE(entryAt);
    const dataField = buf.readUInt32LE(entryAt + 4);
    entries.push({
      id: nameField & 0x80000000 ? null : nameField, // named entries are not icons
      offset: dataField & 0x7fffffff,
      isDirectory: !!(dataField & 0x80000000),
    });
  }
  return entries;
}

/** Resolve a leaf IMAGE_RESOURCE_DATA_ENTRY to its bytes. */
function readLeaf(buf, base, offset, sections) {
  const at = base + offset;
  if (at + 16 > buf.length) return null;
  const dataRva = buf.readUInt32LE(at);
  const size = buf.readUInt32LE(at + 4);
  const fileOffset = rvaToOffset(dataRva, sections);
  if (fileOffset < 0 || fileOffset + size > buf.length) return null;
  return buf.subarray(fileOffset, fileOffset + size);
}

/** Descend through the language level to the first data leaf. */
function firstLeaf(buf, base, entry, sections) {
  if (!entry.isDirectory) return readLeaf(buf, base, entry.offset, sections);
  const children = readDirectory(buf, base, entry.offset);
  if (!children.length) return null;
  return firstLeaf(buf, base, children[0], sections);
}

/** Collect every resource of one type, keyed by resource id. */
function collect(buf, base, rootEntries, type, sections) {
  const out = new Map();
  const typeEntry = rootEntries.find((e) => e.id === type && e.isDirectory);
  if (!typeEntry) return out;

  for (const nameEntry of readDirectory(buf, base, typeEntry.offset)) {
    if (nameEntry.id === null) continue;
    const data = firstLeaf(buf, base, nameEntry, sections);
    if (data) out.set(nameEntry.id, data);
  }
  return out;
}

/* ------------------------------- ICO output ------------------------------ */

/**
 * Rebuild a GRPICONDIR (the directory stored in the PE) plus its RT_ICON
 * images into the .ico layout a file on disk uses. They differ only in the
 * last field: the resource id becomes a file offset.
 */
function buildIco(group, icons) {
  if (group.length < 6) return null;
  const count = group.readUInt16LE(4);
  if (!count || group.length < 6 + count * 14) return null;

  const entries = [];
  let dataSize = 0;
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 14;
    const id = group.readUInt16LE(at + 12);
    const image = icons.get(id);
    if (!image) continue;
    entries.push({
      width: group.readUInt8(at),
      height: group.readUInt8(at + 1),
      colorCount: group.readUInt8(at + 2),
      reserved: group.readUInt8(at + 3),
      planes: group.readUInt16LE(at + 4),
      bitCount: group.readUInt16LE(at + 6),
      image,
    });
    dataSize += image.length;
  }
  if (!entries.length) return null;

  const headerSize = 6 + entries.length * 16;
  const out = Buffer.alloc(headerSize + dataSize);
  out.writeUInt16LE(0, 0);              // reserved
  out.writeUInt16LE(1, 2);              // type: icon
  out.writeUInt16LE(entries.length, 4);

  let dirAt = 6;
  let dataAt = headerSize;
  for (const entry of entries) {
    out.writeUInt8(entry.width, dirAt);
    out.writeUInt8(entry.height, dirAt + 1);
    out.writeUInt8(entry.colorCount, dirAt + 2);
    out.writeUInt8(entry.reserved, dirAt + 3);
    out.writeUInt16LE(entry.planes, dirAt + 4);
    out.writeUInt16LE(entry.bitCount, dirAt + 6);
    out.writeUInt32LE(entry.image.length, dirAt + 8);
    out.writeUInt32LE(dataAt, dirAt + 12);
    entry.image.copy(out, dataAt);
    dirAt += 16;
    dataAt += entry.image.length;
  }
  return { buffer: out, entries };
}

/** The largest square size the group advertises (0 in the header means 256). */
function largestSize(entries) {
  return entries.reduce((best, e) => Math.max(best, e.width === 0 ? 256 : e.width), 0);
}

/* -------------------------------- public --------------------------------- */

/**
 * Windows 10+ moves the resources of many system binaries into a parallel
 * `.mun` file, leaving the DLL itself a stub. If the requested file has no
 * icons, look there before giving up.
 */
function munFallback(file) {
  const root = process.env.SystemRoot || 'C:\\Windows';
  const candidates = [
    path.join(root, 'SystemResources', `${path.basename(file)}.mun`),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
}

/**
 * @param {string} file      a .exe / .dll / .ico path
 * @param {string} outDir    where the extracted .ico files are written
 * @returns {Array<{index:number, file:string, size:number, count:number}>}
 */
function extractAll(file, outDir, _followedMun) {
  const ext = path.extname(file).toLowerCase();

  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (err) {
    console.warn(`[pe-icons] cannot read ${file}: ${err.message}`);
    return [];
  }

  // An .ico file is already what we would produce.
  if (ext === '.ico') {
    return [{ index: 0, file, size: 0, count: 1 }];
  }

  const retryInMun = () => {
    if (_followedMun || process.platform !== 'win32') return [];
    const mun = munFallback(file);
    return mun ? extractAll(mun, outDir, true) : [];
  };

  const headers = readHeaders(buf);
  if (!headers) return retryInMun();

  const base = rvaToOffset(headers.resourceRva, headers.sections);
  if (base < 0) return retryInMun();

  const root = readDirectory(buf, base, 0);
  const groups = collect(buf, base, root, RT_GROUP_ICON, headers.sections);
  const icons = collect(buf, base, root, RT_ICON, headers.sections);
  if (!groups.size || !icons.size) return retryInMun();

  fs.mkdirSync(outDir, { recursive: true });
  const stem = crypto.createHash('sha1').update(file).digest('hex').slice(0, 12);

  const results = [];
  let index = 0;
  for (const [groupId, group] of groups) {
    const built = buildIco(group, icons);
    if (!built) { index += 1; continue; }

    const target = path.join(outDir, `${stem}-${groupId}.ico`);
    try {
      fs.writeFileSync(target, built.buffer);
      results.push({
        index,
        file: target,
        size: largestSize(built.entries),
        count: built.entries.length,
      });
    } catch (err) {
      console.warn(`[pe-icons] cannot write ${target}: ${err.message}`);
    }
    index += 1;
  }

  // Show the most detailed icons first - those are the ones worth picking.
  results.sort((a, b) => b.size - a.size || a.index - b.index);
  return results;
}

module.exports = { extractAll, readHeaders, buildIco, munFallback };
