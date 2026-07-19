var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { app, Menu, BrowserWindow, ipcMain, dialog, shell, nativeImage } from "electron";
import fs, { openAsBlob } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn, execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
const SECTOR = 2048;
async function readBytes(blob, offset, length) {
  if (length <= 0) return new Uint8Array(0);
  const end = Math.min(blob.size, offset + length);
  if (offset >= blob.size) {
    throw new Error(
      `ISO 읽기 범위 초과 (요청 offset ${offset}, ISO 크기 ${blob.size}). 파일이 잘렸거나 손상되었을 수 있습니다.`
    );
  }
  const buf = await blob.slice(offset, end).arrayBuffer();
  return new Uint8Array(buf);
}
async function readSector(blob, lba) {
  return readBytes(blob, lba * SECTOR, SECTOR);
}
function readU8(view, offset) {
  return view.getUint8(offset);
}
function readBothU32Pick(view, offset, isValid) {
  const le = view.getUint32(offset, true);
  const be = view.getUint32(offset + 4, false);
  if (le === be) return le;
  const leOk = isValid(le);
  const beOk = isValid(be);
  if (leOk && !beOk) return le;
  if (beOk && !leOk) return be;
  return le;
}
function decodeAscii(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out.trimEnd();
}
function decodeJoliet(bytes) {
  const len = bytes.length - bytes.length % 2;
  const units = [];
  for (let i = 0; i < len; i += 2) {
    const code = bytes[i] << 8 | bytes[i + 1];
    if (code === 0) break;
    units.push(code);
  }
  return String.fromCharCode(...units).replace(/\0+$/g, "");
}
function stripVersion(name) {
  const cut = name.indexOf(";");
  return cut >= 0 ? name.slice(0, cut) : name;
}
function writeU8(buf, offset, value) {
  buf[offset] = value & 255;
}
function writeU16LE(buf, offset, value) {
  buf[offset] = value & 255;
  buf[offset + 1] = value >>> 8 & 255;
}
function writeU16BE(buf, offset, value) {
  buf[offset] = value >>> 8 & 255;
  buf[offset + 1] = value & 255;
}
function writeBothU16(buf, offset, value) {
  writeU16LE(buf, offset, value);
  writeU16BE(buf, offset + 2, value);
}
function writeU32LE(buf, offset, value) {
  buf[offset] = value & 255;
  buf[offset + 1] = value >>> 8 & 255;
  buf[offset + 2] = value >>> 16 & 255;
  buf[offset + 3] = value >>> 24 & 255;
}
function writeU32BE(buf, offset, value) {
  buf[offset] = value >>> 24 & 255;
  buf[offset + 1] = value >>> 16 & 255;
  buf[offset + 2] = value >>> 8 & 255;
  buf[offset + 3] = value & 255;
}
function writeBothU32(buf, offset, value) {
  writeU32LE(buf, offset, value);
  writeU32BE(buf, offset + 4, value);
}
function encodeAsciiPadded(text, length, pad = 32) {
  const out = new Uint8Array(length);
  out.fill(pad);
  const upper = text.toUpperCase();
  for (let i = 0; i < Math.min(upper.length, length); i++) {
    out[i] = upper.charCodeAt(i) & 127;
  }
  return out;
}
function encodeJolietName(name) {
  const out = new Uint8Array(name.length * 2);
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    out[i * 2] = code >>> 8 & 255;
    out[i * 2 + 1] = code & 255;
  }
  return out;
}
function iso9660FileId(name, isDir) {
  if (isDir) {
    const upper = name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 31);
    return encodeAsciiPadded(upper, upper.length, 0);
  }
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9_.]/g, "_");
  const dot = cleaned.lastIndexOf(".");
  let base = cleaned;
  let ext = "";
  if (dot > 0) {
    base = cleaned.slice(0, dot);
    ext = cleaned.slice(dot + 1);
  }
  base = base.slice(0, 8);
  ext = ext.slice(0, 3);
  const id = ext ? `${base}.${ext};1` : `${base}.;1`;
  const bytes = new Uint8Array(id.length);
  for (let i = 0; i < id.length; i++) bytes[i] = id.charCodeAt(i);
  return bytes;
}
const FLAG_ASSOCIATED = 4;
const FLAG_DIRECTORY = 2;
const FLAG_MULTI_EXTENT = 128;
async function openIso(iso) {
  if (iso.size < SECTOR * 17) {
    throw new Error("파일이 디스크 이미지로 보기에는 너무 작습니다.");
  }
  const baseOffset = await findIsoFilesystemOffset(iso);
  const image = baseOffset > 0 ? iso.slice(baseOffset) : iso;
  const volume = await findBestVolume(image);
  const root = { kind: "dir", name: "", children: /* @__PURE__ */ new Map() };
  const entries = [];
  let totalBytes = 0;
  await walkDirectory(image, volume, root, "", volume.rootLba, volume.rootSize, entries, (n) => {
    totalBytes += n;
  });
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    volumeLabel: volume.label || "ISO",
    root,
    entries,
    totalBytes
  };
}
async function findIsoFilesystemOffset(iso) {
  const pvdAt = 16 * SECTOR;
  if (iso.size >= pvdAt + SECTOR) {
    const probe = await readBytes(iso, pvdAt, SECTOR);
    if (probe[0] === 1 && decodeAscii(probe.subarray(1, 6)) === "CD001") {
      return 0;
    }
  }
  const scanLimit = Math.min(iso.size, 64 * 1024 * 1024);
  const chunkSize = 1024 * 1024;
  for (let start = 0; start < scanLimit; start += chunkSize) {
    const len = Math.min(chunkSize + SECTOR, scanLimit - start);
    if (len < SECTOR) break;
    const buf = await readBytes(iso, start, len);
    const last = buf.length - SECTOR;
    for (let off = 0; off <= last; off += SECTOR) {
      if (buf[off] !== 1) continue;
      if (decodeAscii(buf.subarray(off + 1, off + 6)) !== "CD001") continue;
      const absPvd = start + off;
      const base = absPvd - 16 * SECTOR;
      if (base >= 0) return base;
    }
  }
  return 0;
}
async function readIsoFile(iso, extents, blockSize = SECTOR) {
  if (!extents.length) return new Blob([]);
  if (extents.length === 1) {
    const e = extents[0];
    const data = await readBytes(iso, e.lba * blockSize, e.size);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer]);
  }
  const parts = [];
  for (const e of extents) {
    const data = await readBytes(iso, e.lba * blockSize, e.size);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    parts.push(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength));
  }
  return new Blob(parts);
}
async function findBestVolume(iso) {
  let primary = null;
  let joliet = null;
  for (let lba = 16; lba < 32; lba++) {
    const sector = await readSector(iso, lba);
    const type = sector[0];
    const id = decodeAscii(sector.subarray(1, 6));
    if (id !== "CD001") continue;
    if (type === 255) break;
    const view = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
    const maxBlocksByFile = Math.max(1, Math.floor(iso.size / SECTOR));
    const volumeBlocks = readBothU32Pick(view, 80, (n) => n > 16 && n <= maxBlocksByFile * 4);
    const blockSize = readBothU16Pick(view, 128, (n) => n === 512 || n === 1024 || n === 2048) || SECTOR;
    const label = decodeAscii(sector.subarray(40, 72));
    const rootOffset = 156;
    const maxDataBlocks = Math.max(1, Math.floor(iso.size / blockSize));
    const rootLba = readBothU32Pick(
      view,
      rootOffset + 2,
      (n) => n > 0 && n < Math.max(volumeBlocks, maxDataBlocks)
    );
    const maxRootSize = Math.max(blockSize, iso.size - rootLba * blockSize);
    const rootSize = readBothU32Pick(
      view,
      rootOffset + 10,
      (n) => n > 0 && n <= maxRootSize
    );
    const choice = {
      label,
      rootLba,
      rootSize,
      joliet: false,
      blockSize,
      volumeBlocks: Math.max(volumeBlocks, maxDataBlocks)
    };
    if (type === 1) {
      primary = choice;
    } else if (type === 2) {
      const esc = sector.subarray(88, 91);
      const isJoliet = esc[0] === 37 && esc[1] === 47 && (esc[2] === 64 || esc[2] === 67 || esc[2] === 69);
      if (isJoliet) {
        joliet = {
          ...choice,
          label: decodeJolietLabel(sector.subarray(40, 72)) || label,
          joliet: true
        };
      }
    }
  }
  const chosen = joliet ?? primary;
  if (!chosen) {
    throw new Error("ISO9660 볼륨 디스크립터를 찾지 못했습니다. (ISO/IMG 형식이 아니거나 손상되었을 수 있습니다.)");
  }
  return chosen;
}
function readBothU16Pick(view, offset, isValid) {
  const le = view.getUint16(offset, true);
  const be = view.getUint16(offset + 2, false);
  if (le === be) return le;
  const leOk = isValid(le);
  const beOk = isValid(be);
  if (leOk && !beOk) return le;
  if (beOk && !leOk) return be;
  return le;
}
function decodeJolietLabel(bytes) {
  return decodeJoliet(bytes).trim();
}
function extentFits(lba, size, isoSize, blockSize, volumeBlocks) {
  if (size < 0) return false;
  if (size === 0) return lba >= 0;
  if (lba <= 0 || lba >= volumeBlocks) return false;
  const start = lba * blockSize;
  if (start >= isoSize) return false;
  return start + size <= isoSize;
}
async function walkDirectory(iso, volume, parent, parentPath, lba, size, entries, onFileBytes) {
  const { blockSize, volumeBlocks } = volume;
  if (!extentFits(lba, Math.min(size, blockSize), iso.size, blockSize, volumeBlocks) && size > 0) {
    return;
  }
  const maxBytes = Math.max(0, iso.size - lba * blockSize);
  const readSize = Math.min(size, maxBytes);
  if (readSize <= 0) return;
  const data = await readBytes(iso, lba * blockSize, readSize);
  let offset = 0;
  let pending = null;
  const flushPending = () => {
    if (!pending) return;
    commitFile(parent, parentPath, pending.name, pending.extents, iso, volume, entries, onFileBytes);
    pending = null;
  };
  while (offset < data.length) {
    const recLen = data[offset] ?? 0;
    if (recLen === 0) {
      const next = Math.ceil((offset + 1) / blockSize) * blockSize;
      if (next <= offset || next >= data.length) break;
      offset = next;
      continue;
    }
    if (offset + recLen > data.length) break;
    const record = parseDirRecord(
      data.subarray(offset, offset + recLen),
      volume.joliet,
      iso.size,
      blockSize,
      volumeBlocks
    );
    offset += recLen;
    if (!record || record.name === "." || record.name === "..") continue;
    if (record.associated) continue;
    if (record.isDir) {
      flushPending();
      if (!extentFits(record.lba, Math.min(record.size, blockSize), iso.size, blockSize, volumeBlocks)) {
        continue;
      }
      const path2 = parentPath ? `${parentPath}/${record.name}` : record.name;
      const child = { kind: "dir", name: record.name, children: /* @__PURE__ */ new Map() };
      parent.children.set(normalizeKey(record.name), child);
      entries.push({ path: path2, name: record.name, isDir: true, size: 0 });
      await walkDirectory(iso, volume, child, path2, record.lba, record.size, entries, onFileBytes);
      continue;
    }
    if (pending && pending.name === record.name) {
      pending.extents.push({ lba: record.lba, size: record.size });
      if (!record.multiExtent) flushPending();
      continue;
    }
    flushPending();
    if (record.multiExtent) {
      pending = { name: record.name, extents: [{ lba: record.lba, size: record.size }] };
    } else {
      commitFile(
        parent,
        parentPath,
        record.name,
        [{ lba: record.lba, size: record.size }],
        iso,
        volume,
        entries,
        onFileBytes
      );
    }
  }
  flushPending();
}
function commitFile(parent, parentPath, name, extents, iso, volume, entries, onFileBytes) {
  const path2 = parentPath ? `${parentPath}/${name}` : name;
  const totalSize = extents.reduce((sum, e) => sum + e.size, 0);
  const readable = extents.every(
    (e) => extentFits(e.lba, e.size, iso.size, volume.blockSize, volume.volumeBlocks)
  );
  const child = readable ? {
    kind: "file",
    name,
    size: totalSize,
    source: {
      type: "iso",
      iso,
      extents,
      blockSize: volume.blockSize
    }
  } : {
    kind: "file",
    name,
    size: totalSize,
    source: {
      type: "unavailable",
      reason: `ISO 데이터가 잘렸거나 손상되어 읽을 수 없습니다: ${path2}`
    }
  };
  parent.children.set(normalizeKey(name), child);
  entries.push({ path: path2, name, isDir: false, size: totalSize });
  if (readable) onFileBytes(totalSize);
}
function parseDirRecord(bytes, joliet, isoSize, blockSize, volumeBlocks) {
  if (bytes.length < 34) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = readU8(view, 0);
  if (length < 34) return null;
  const maxLba = Math.max(1, Math.min(volumeBlocks, Math.floor(isoSize / blockSize) + 1));
  const lba = readBothU32Pick(view, 2, (n) => n < maxLba);
  const maxSize = Math.max(0, isoSize);
  const size = readBothU32Pick(view, 10, (n) => n <= maxSize);
  const flags = readU8(view, 25);
  const nameLen = readU8(view, 32);
  if (33 + nameLen > bytes.length) return null;
  const nameBytes = bytes.subarray(33, 33 + nameLen);
  let name;
  if (nameLen === 1 && nameBytes[0] === 0) name = ".";
  else if (nameLen === 1 && nameBytes[0] === 1) name = "..";
  else name = stripVersion(joliet ? decodeJoliet(nameBytes) : decodeAscii(nameBytes));
  if (!name) return null;
  return {
    length,
    lba,
    size,
    flags,
    name,
    isDir: (flags & FLAG_DIRECTORY) !== 0,
    multiExtent: (flags & FLAG_MULTI_EXTENT) !== 0,
    associated: (flags & FLAG_ASSOCIATED) !== 0
  };
}
function normalizeKey(name) {
  return name.toLowerCase();
}
function getNodeAtPath(root, path2) {
  if (!path2 || path2 === "/") return root;
  const parts = path2.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (current.kind !== "dir") return null;
    const next = current.children.get(normalizeKey(part));
    if (!next) return null;
    current = next;
  }
  return current;
}
function listChildren(root, dirPath) {
  const node = getNodeAtPath(root, dirPath);
  if (!node || node.kind !== "dir") return [];
  return [...node.children.values()].map((child) => ({
    path: dirPath ? `${dirPath}/${child.name}` : child.name,
    name: child.name,
    isDir: child.kind === "dir",
    size: child.kind === "file" ? child.size : 0
  })).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}
const SQUASHFS_MAGIC = Buffer.from("hsqs", "ascii");
const ELF_MAGIC = Buffer.from([127, 69, 76, 70]);
async function detectOpenKind(filePath, hinted) {
  if (hinted === "iso" || hinted === "img" || hinted === "appimage" || hinted === "docker") {
    return hinted;
  }
  if (await isAppImageFile(filePath)) return "appimage";
  if (await looksLikeTarArchive(filePath)) return "docker";
  return "unknown";
}
async function isAppImageFile(filePath) {
  try {
    const fh = await fs.promises.open(filePath, "r");
    try {
      const head = Buffer.alloc(4);
      const { bytesRead } = await fh.read(head, 0, 4, 0);
      if (bytesRead < 4 || !head.equals(ELF_MAGIC)) return false;
    } finally {
      await fh.close();
    }
    const offset = await findSquashfsOffset(filePath);
    return offset >= 0;
  } catch {
    return false;
  }
}
async function looksLikeTarArchive(filePath) {
  try {
    const fh = await fs.promises.open(filePath, "r");
    try {
      const head = Buffer.alloc(512);
      const { bytesRead } = await fh.read(head, 0, 512, 0);
      if (bytesRead < 265) return false;
      if (head[0] === 31 && head[1] === 139) return true;
      const ustar = head.subarray(257, 262).toString("ascii");
      return ustar === "ustar";
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}
async function extractArchiveToTemp(filePath, kind) {
  const extractRoot2 = await fs.promises.mkdtemp(path.join(os.tmpdir(), "isomaker-extract-"));
  try {
    if (kind === "appimage") {
      const { treeRoot, squashfsOffset } = await extractAppImage(filePath, extractRoot2);
      return { extractRoot: extractRoot2, treeRoot, squashfsOffset };
    }
    await extractTarArchive(filePath, extractRoot2);
    return { extractRoot: extractRoot2, treeRoot: extractRoot2, squashfsOffset: null };
  } catch (err) {
    try {
      fs.rmSync(extractRoot2, { recursive: true, force: true });
    } catch {
    }
    throw err;
  }
}
async function buildTreeFromDirectory(dirPath) {
  const root = { kind: "dir", name: "", children: /* @__PURE__ */ new Map() };
  await walkDir(dirPath, root);
  return root;
}
function volumeLabelFromPath(filePath) {
  const base = path.basename(filePath);
  const stem = base.replace(/\.tar\.gz$/i, "").replace(/\.(appimage|tar|tgz|docker|iso|img)$/i, "");
  const cleaned = stem.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "IMAGE").slice(0, 32).toUpperCase();
}
async function walkDir(absDir, parent) {
  let names;
  try {
    names = await fs.promises.readdir(absDir);
  } catch {
    return;
  }
  names.sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    if (name === "." || name === "..") continue;
    const abs = path.join(absDir, name);
    let st;
    try {
      st = await fs.promises.lstat(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      const dirNode = { kind: "dir", name, children: /* @__PURE__ */ new Map() };
      parent.children.set(normalizeKey(name), dirNode);
      await walkDir(abs, dirNode);
      continue;
    }
    if (!st.isFile()) continue;
    const fileNode = {
      kind: "file",
      name,
      size: st.size,
      source: { type: "path", absolutePath: abs }
    };
    parent.children.set(normalizeKey(name), fileNode);
  }
}
async function extractAppImage(filePath, destDir) {
  const offset = await findSquashfsOffset(filePath);
  if (offset < 0) {
    throw new Error("AppImage에서 squashfs(hsqs) 시그니처를 찾지 못했습니다.");
  }
  const unsquashfs = resolveSquashfsTool("unsquashfs");
  if (unsquashfs) {
    const outDir = path.join(destDir, "root");
    await fs.promises.mkdir(outDir, { recursive: true });
    await runCommand(
      unsquashfs,
      ["-f", "-o", String(offset), "-d", outDir, filePath],
      path.dirname(unsquashfs)
    );
    return { treeRoot: outDir, squashfsOffset: offset };
  }
  if (process.platform === "linux") {
    try {
      await fs.promises.chmod(filePath, 493);
    } catch {
    }
    await runCommand(filePath, ["--appimage-extract"], destDir);
    const squashRoot = path.join(destDir, "squashfs-root");
    if (fs.existsSync(squashRoot)) {
      return { treeRoot: squashRoot, squashfsOffset: offset };
    }
  }
  throw new Error(
    "AppImage를 풀 수 없습니다. squashfs-tools(unsquashfs)를 설치한 뒤 다시 시도하세요.\nWindows: MSYS2에서 `pacman -S squashfs-tools`\nmacOS: `brew install squashfs`\nLinux: `sudo apt install squashfs-tools` (또는 AppImage 실행 권한)"
  );
}
async function extractTarArchive(filePath, destDir) {
  const tar = resolveTar();
  if (!tar) {
    throw new Error("tar 명령을 찾을 수 없습니다. Docker 저장본(.tar)을 열려면 OS tar가 필요합니다.");
  }
  const gzip = isGzipFile(filePath) || /\.(tgz|tar\.gz)$/i.test(filePath);
  const args = gzip ? ["-xzf", filePath, "-C", destDir] : ["-xf", filePath, "-C", destDir];
  await runCommand(tar, args, destDir);
}
function isGzipFile(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(2);
    const n = fs.readSync(fd, buf, 0, 2, 0);
    return n === 2 && buf[0] === 31 && buf[1] === 139;
  } finally {
    fs.closeSync(fd);
  }
}
async function findSquashfsOffset(filePath) {
  const size = (await fs.promises.stat(filePath)).size;
  const chunkSize = 1024 * 1024;
  const overlap = SQUASHFS_MAGIC.length - 1;
  const buf = Buffer.alloc(chunkSize);
  const fh = await fs.promises.open(filePath, "r");
  try {
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await fh.read(buf, 0, chunkSize, offset);
      if (bytesRead <= 0) break;
      const idx = buf.subarray(0, bytesRead).indexOf(SQUASHFS_MAGIC);
      if (idx >= 0) return offset + idx;
      if (bytesRead <= overlap) break;
      offset += bytesRead - overlap;
    }
  } finally {
    await fh.close();
  }
  return -1;
}
function resolveMksquashfs() {
  return resolveSquashfsTool("mksquashfs");
}
function resolveTar() {
  if (process.platform === "win32") {
    const systemTar = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "tar.exe"
    );
    if (fs.existsSync(systemTar)) return systemTar;
    return whichSync("tar.exe") ?? whichSync("tar");
  }
  return whichSync("tar");
}
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    var _a;
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    (_a = child.stderr) == null ? void 0 : _a.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim() || `exit ${code}`;
      reject(new Error(`${path.basename(command)} 실패: ${detail}`));
    });
  });
}
function resolveSquashfsTool(baseName) {
  const names = process.platform === "win32" ? [`${baseName}.exe`, baseName] : [baseName];
  const extras = [];
  if (process.platform === "win32") {
    for (const root of [
      process.env.MSYS2_ROOT,
      "C:\\msys64",
      "C:\\msys32",
      process.env.CYGWIN_ROOT,
      "C:\\cygwin64"
    ].filter((v) => Boolean(v))) {
      extras.push(path.join(root, "usr", "bin", `${baseName}.exe`));
      extras.push(path.join(root, "bin", `${baseName}.exe`));
    }
  }
  for (const candidate of extras) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const name of names) {
    const found = whichSync(name);
    if (found) return found;
  }
  return null;
}
function whichSync(command) {
  try {
    const result = process.platform === "win32" ? execFileSync("where", [command], { encoding: "utf8", windowsHide: true }) : execFileSync("which", [command], { encoding: "utf8" });
    const line = String(result).split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return line && fs.existsSync(line) ? line : null;
  } catch {
    return null;
  }
}
async function materializeTree(root, destDir, onProgress, signal) {
  throwIfAborted$2(signal);
  await fs.promises.mkdir(destDir, { recursive: true });
  const files = [];
  collectFilePaths(root, "", files);
  let done = 0;
  await walkMaterialize(root, "", destDir, async (entryPath, absOut) => {
    throwIfAborted$2(signal);
    const node = getNodeAtPath(root, entryPath);
    if (!node || node.kind !== "file") return;
    if (node.source.type === "path") {
      await fs.promises.copyFile(node.source.absolutePath, absOut);
    } else if (node.source.type === "blob") {
      await writeBlobToFile$1(node.source.blob, absOut, signal);
    } else if (node.source.type === "iso") {
      const blob = await openIsoBlobFromExtents(node.source);
      await writeBlobToFile$1(blob, absOut, signal);
    } else {
      throw new Error(node.source.reason);
    }
    done += 1;
    const percent = files.length ? Math.min(90, Math.round(done / files.length * 90)) : 90;
    onProgress == null ? void 0 : onProgress({
      phase: "save",
      percent,
      message: `파일 준비 중… (${done}/${files.length})`
    });
  });
}
async function packDirectoryAsTar(sourceDir, outputPath, gzip, onProgress, signal) {
  throwIfAborted$2(signal);
  const tar = resolveTar();
  if (!tar) {
    throw new Error("tar 명령을 찾을 수 없습니다. Docker/tar로 저장하려면 OS tar가 필요합니다.");
  }
  onProgress == null ? void 0 : onProgress({ phase: "save", percent: 92, message: gzip ? "tar.gz 작성 중…" : "tar 작성 중…" });
  const args = gzip ? ["-czf", outputPath, "-C", sourceDir, "."] : ["-cf", outputPath, "-C", sourceDir, "."];
  await runCommand(tar, args, path.dirname(outputPath));
  throwIfAborted$2(signal);
}
async function packDirectoryAsAppImage(sourceDir, outputPath, runtime, onProgress, signal) {
  throwIfAborted$2(signal);
  if (!fs.existsSync(runtime.runtimePath)) {
    throw new Error(
      `AppImage 런타임을 찾을 수 없습니다: ${runtime.runtimePath}
AppImage로 저장하려면 원본 AppImage를 연 뒤 저장하세요.`
    );
  }
  let offset = runtime.squashfsOffset;
  if (offset <= 0) {
    offset = await findSquashfsOffset(runtime.runtimePath);
  }
  if (offset <= 0) {
    throw new Error("AppImage 런타임(squashfs 오프셋)을 확인할 수 없습니다.");
  }
  const mksquashfs = resolveMksquashfs();
  if (!mksquashfs) {
    throw new Error(
      "AppImage로 저장하려면 squashfs-tools(mksquashfs)가 필요합니다.\nWindows: MSYS2 `pacman -S squashfs-tools`\nmacOS: `brew install squashfs`\nLinux: `sudo apt install squashfs-tools`"
    );
  }
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), "isomaker-appimage-"));
  const squashPath = path.join(work, "payload.squashfs");
  try {
    onProgress == null ? void 0 : onProgress({ phase: "save", percent: 92, message: "squashfs 작성 중…" });
    await runCommand(
      mksquashfs,
      [sourceDir, squashPath, "-comp", "gzip", "-noappend", "-all-root"],
      work
    );
    throwIfAborted$2(signal);
    onProgress == null ? void 0 : onProgress({ phase: "save", percent: 96, message: "AppImage 결합 중…" });
    await concatRuntimeAndSquash(runtime.runtimePath, offset, squashPath, outputPath, signal);
    if (process.platform !== "win32") {
      try {
        await fs.promises.chmod(outputPath, 493);
      } catch {
      }
    }
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
    }
  }
}
async function concatRuntimeAndSquash(runtimePath, offset, squashPath, outputPath, signal) {
  throwIfAborted$2(signal);
  const out = await fs.promises.open(outputPath, "w");
  try {
    const runtime = await fs.promises.open(runtimePath, "r");
    try {
      await copyFdRange(runtime, out, 0, offset, signal);
    } finally {
      await runtime.close();
    }
    const squash = await fs.promises.open(squashPath, "r");
    try {
      const size = (await squash.stat()).size;
      await copyFdRange(squash, out, 0, size, signal);
    } finally {
      await squash.close();
    }
  } finally {
    await out.close();
  }
}
async function copyFdRange(src, dest, start, length, signal) {
  const CHUNK = 8 * 1024 * 1024;
  const buf = Buffer.allocUnsafe(Math.min(CHUNK, Math.max(length, 1)));
  let pos = start;
  let left = length;
  while (left > 0) {
    throwIfAborted$2(signal);
    const n = Math.min(buf.length, left);
    const { bytesRead } = await src.read(buf, 0, n, pos);
    if (bytesRead <= 0) break;
    await dest.write(buf, 0, bytesRead);
    pos += bytesRead;
    left -= bytesRead;
  }
}
function collectFilePaths(node, prefix, out) {
  for (const child of node.children.values()) {
    const p = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.kind === "dir") collectFilePaths(child, p, out);
    else out.push(p);
  }
}
async function walkMaterialize(node, prefix, destDir, writeFile) {
  for (const child of node.children.values()) {
    const entryPath = prefix ? `${prefix}/${child.name}` : child.name;
    const abs = path.join(destDir, child.name);
    if (child.kind === "dir") {
      await fs.promises.mkdir(abs, { recursive: true });
      await walkMaterialize(child, entryPath, abs, writeFile);
    } else {
      await writeFile(entryPath, abs);
    }
  }
}
async function openIsoBlobFromExtents(source) {
  const block = source.blockSize || 2048;
  if (source.extents.length === 1) {
    const e = source.extents[0];
    return source.iso.slice(e.lba * block, e.lba * block + e.size);
  }
  const parts = [];
  for (const e of source.extents) {
    parts.push(source.iso.slice(e.lba * block, e.lba * block + e.size));
  }
  return new Blob(parts);
}
async function writeBlobToFile$1(blob, filePath, signal) {
  throwIfAborted$2(signal);
  if (blob.size < 8 * 1024 * 1024) {
    const buf = Buffer.from(await blob.arrayBuffer());
    throwIfAborted$2(signal);
    await fs.promises.writeFile(filePath, buf, { signal });
    return;
  }
  const stream = blob.stream();
  await pipeline(Readable.fromWeb(stream), fs.createWriteStream(filePath), { signal });
}
function throwIfAborted$2(signal) {
  if (signal == null ? void 0 : signal.aborted) throw new Error("JOB_CANCELED");
}
async function writeIso(root, volumeLabel, onProgress, signal, readPathFile) {
  var _a;
  throwIfAborted$1(signal);
  const label = sanitizeLabel(volumeLabel);
  const dirs = [];
  const files = [];
  collect(root, "", dirs, files);
  throwIfAborted$1(signal);
  let nextLba = 19;
  for (const dir of dirs) {
    dir.lba = nextLba;
    dir.size = estimateDirSize(dir, false);
    nextLba += sectorsFor(dir.size);
  }
  const pathTableSize = 10;
  const pathTableLba = nextLba;
  nextLba += 1;
  const pathTableMLba = nextLba;
  nextLba += 1;
  const jolietDirs = dirs.map((d) => ({
    path: d.path,
    node: d.node,
    lba: 0,
    size: estimateDirSize(d, true)
  }));
  for (const dir of jolietDirs) {
    dir.lba = nextLba;
    nextLba += sectorsFor(dir.size);
  }
  const jolietPathLba = nextLba;
  nextLba += 1;
  const jolietPathMLba = nextLba;
  nextLba += 1;
  for (const file of files) {
    file.lba = nextLba;
    nextLba += sectorsFor(Math.max(file.size, 1));
  }
  const volumeSectors = nextLba;
  const parts = [];
  onProgress == null ? void 0 : onProgress({ phase: "write", percent: 5, message: "볼륨 헤더 작성…" });
  throwIfAborted$1(signal);
  parts.push(toBlob(new Uint8Array(16 * SECTOR)));
  const pvd = blankSector();
  writePrimaryVolume(pvd, label, dirs[0], pathTableLba, pathTableMLba, pathTableSize, volumeSectors);
  parts.push(toBlob(pvd));
  const svd = blankSector();
  writeJolietVolume(svd, label, jolietDirs[0], jolietPathLba, jolietPathMLba, pathTableSize, volumeSectors);
  parts.push(toBlob(svd));
  const term = blankSector();
  term[0] = 255;
  writeAscii(term, 1, "CD001");
  term[6] = 1;
  parts.push(toBlob(term));
  const metaStart = 19;
  const filesStart = ((_a = files[0]) == null ? void 0 : _a.lba) ?? volumeSectors;
  const metaSectors = filesStart - metaStart;
  const meta = new Uint8Array(metaSectors * SECTOR);
  writePathTableInto(meta, pathTableLba - metaStart, dirs[0].lba, false);
  writePathTableInto(meta, pathTableMLba - metaStart, dirs[0].lba, true);
  writePathTableInto(meta, jolietPathLba - metaStart, jolietDirs[0].lba, false);
  writePathTableInto(meta, jolietPathMLba - metaStart, jolietDirs[0].lba, true);
  writeDirectoryRecordsInto(meta, metaStart, dirs, files, false);
  writeDirectoryRecordsInto(meta, metaStart, jolietDirs, files, true);
  parts.push(toBlob(meta));
  onProgress == null ? void 0 : onProgress({ phase: "write", percent: 20, message: "파일 데이터 연결…" });
  throwIfAborted$1(signal);
  const totalFiles = Math.max(files.length, 1);
  for (let i = 0; i < files.length; i++) {
    throwIfAborted$1(signal);
    const file = files[i];
    onProgress == null ? void 0 : onProgress({
      phase: "write",
      percent: 20 + Math.round(i / totalFiles * 75),
      message: `파일 포함: ${file.path}`
    });
    parts.push(await filePayload(file, readPathFile));
    throwIfAborted$1(signal);
    const padded = sectorsFor(Math.max(file.size, 1)) * SECTOR - Math.max(file.size, 1);
    if (file.size === 0) {
      parts.push(toBlob(new Uint8Array(SECTOR)));
    } else if (padded > 0) {
      parts.push(toBlob(new Uint8Array(padded)));
    }
  }
  onProgress == null ? void 0 : onProgress({ phase: "write", percent: 100, message: "ISO 작성 완료" });
  return new Blob(parts, { type: "application/x-iso9660-image" });
}
function throwIfAborted$1(signal) {
  if (signal == null ? void 0 : signal.aborted) throw new Error("JOB_CANCELED");
}
async function filePayload(file, readPathFile) {
  if (file.size === 0) return new Blob([]);
  const src = file.node.source;
  if (src.type === "blob") {
    return src.blob.slice(0, file.size);
  }
  if (src.type === "unavailable") {
    throw new Error(src.reason);
  }
  if (src.type === "path") {
    if (!readPathFile) {
      throw new Error(`경로 소스는 데스크톱에서만 저장할 수 있습니다: ${src.absolutePath}`);
    }
    const blob = await readPathFile(src.absolutePath);
    return blob.slice(0, file.size);
  }
  if (src.extents.length === 1) {
    const e = src.extents[0];
    const block2 = src.blockSize || SECTOR;
    return src.iso.slice(e.lba * block2, e.lba * block2 + e.size);
  }
  const parts = [];
  const block = src.blockSize || SECTOR;
  for (const e of src.extents) {
    parts.push(src.iso.slice(e.lba * block, e.lba * block + e.size));
  }
  return new Blob(parts);
}
function toBlob(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer]);
}
function collect(node, path2, dirs, files) {
  dirs.push({ path: path2, node, lba: 0, size: 0 });
  for (const child of sortedChildren(node)) {
    const childPath = path2 ? `${path2}/${child.name}` : child.name;
    if (child.kind === "dir") collect(child, childPath, dirs, files);
    else files.push({ path: childPath, node: child, lba: 0, size: child.size });
  }
}
function sortedChildren(node) {
  return [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function estimateDirSize(dir, joliet) {
  let size = 34 + 34;
  for (const child of sortedChildren(dir.node)) {
    const id = joliet ? encodeJolietName(child.name) : iso9660FileId(child.name, child.kind === "dir");
    let rec = 33 + id.length;
    if (rec % 2 === 1) rec += 1;
    size += rec;
  }
  return Math.max(SECTOR, Math.ceil(size / SECTOR) * SECTOR);
}
function sectorsFor(bytes) {
  return Math.max(1, Math.ceil(bytes / SECTOR));
}
function writePrimaryVolume(sector, label, root, pathL, pathM, pathSize, volumeSectors) {
  sector[0] = 1;
  writeAscii(sector, 1, "CD001");
  sector[6] = 1;
  writeAscii(sector, 8, "ISOMAKER");
  writeAscii(sector, 40, label.padEnd(32).slice(0, 32));
  writeBothU32(sector, 80, volumeSectors);
  writeBothU16(sector, 120, 1);
  writeBothU16(sector, 124, 1);
  writeBothU16(sector, 128, SECTOR);
  writeBothU32(sector, 132, pathSize);
  writeU32LEOnly(sector, 140, pathL);
  writeU32LEOnly(sector, 148, pathM);
  writeDirectoryRecord(sector, 156, root.lba, root.size, 2, new Uint8Array([0]));
  writeAscii(sector, 881, "ISOMAKER");
}
function writeJolietVolume(sector, label, root, pathL, pathM, pathSize, volumeSectors) {
  sector[0] = 2;
  writeAscii(sector, 1, "CD001");
  sector[6] = 1;
  writeAscii(sector, 8, "ISOMAKER");
  const jolietLabel = encodeJolietName(label.slice(0, 16));
  sector.set(jolietLabel.subarray(0, Math.min(32, jolietLabel.length)), 40);
  writeBothU32(sector, 80, volumeSectors);
  sector[88] = 37;
  sector[89] = 47;
  sector[90] = 64;
  writeBothU16(sector, 120, 1);
  writeBothU16(sector, 124, 1);
  writeBothU16(sector, 128, SECTOR);
  writeBothU32(sector, 132, pathSize);
  writeU32LEOnly(sector, 140, pathL);
  writeU32LEOnly(sector, 148, pathM);
  writeDirectoryRecord(sector, 156, root.lba, root.size, 2, new Uint8Array([0]));
}
function writePathTableInto(meta, sectorIndex, rootDirLba, msb) {
  const buf = meta.subarray(sectorIndex * SECTOR, sectorIndex * SECTOR + SECTOR);
  buf[0] = 1;
  buf[1] = 0;
  if (msb) {
    buf[2] = rootDirLba >>> 24 & 255;
    buf[3] = rootDirLba >>> 16 & 255;
    buf[4] = rootDirLba >>> 8 & 255;
    buf[5] = rootDirLba & 255;
    buf[6] = 0;
    buf[7] = 1;
  } else {
    writeU32LEOnly(buf, 2, rootDirLba);
    writeU16LE(buf, 6, 1);
  }
  buf[8] = 0;
}
function writeDirectoryRecordsInto(meta, metaStartLba, dirs, files, joliet) {
  const byPath = new Map(dirs.map((d) => [d.path, d]));
  for (const dir of dirs) {
    const local = (dir.lba - metaStartLba) * SECTOR;
    const buf = meta.subarray(local, local + dir.size);
    let offset = 0;
    const parentPath = parentOf(dir.path);
    const parent = parentPath === null ? dir : byPath.get(parentPath) ?? dir;
    offset = putDirRecord(buf, offset, dir.lba, dir.size, 2, new Uint8Array([0]));
    offset = putDirRecord(buf, offset, parent.lba, parent.size, 2, new Uint8Array([1]));
    for (const child of sortedChildren(dir.node)) {
      const childPath = dir.path ? `${dir.path}/${child.name}` : child.name;
      if (child.kind === "dir") {
        const planned = byPath.get(childPath);
        if (!planned) continue;
        const id = joliet ? encodeJolietName(child.name) : iso9660FileId(child.name, true);
        offset = putDirRecord(buf, offset, planned.lba, planned.size, 2, id);
      } else {
        const planned = files.find((f) => f.path === childPath);
        if (!planned) continue;
        const id = joliet ? encodeJolietName(child.name) : iso9660FileId(child.name, false);
        offset = putDirRecord(buf, offset, planned.lba, planned.size, 0, id);
      }
    }
  }
}
function putDirRecord(buf, offset, lba, size, flags, id) {
  let recLen = 33 + id.length;
  if (recLen % 2 === 1) recLen += 1;
  if (offset + recLen > buf.length) return offset;
  writeDirectoryRecord(buf, offset, lba, size, flags, id);
  return offset + recLen;
}
function writeDirectoryRecord(buf, offset, lba, size, flags, id) {
  let recLen = 33 + id.length;
  if (recLen % 2 === 1) recLen += 1;
  writeU8(buf, offset, recLen);
  writeU8(buf, offset + 1, 0);
  writeBothU32(buf, offset + 2, lba);
  writeBothU32(buf, offset + 10, size);
  writeU8(buf, offset + 25, flags);
  writeBothU16(buf, offset + 28, 1);
  writeU8(buf, offset + 32, id.length);
  buf.set(id, offset + 33);
}
function blankSector() {
  return new Uint8Array(SECTOR);
}
function writeAscii(buf, offset, text) {
  buf.set(encodeAsciiPadded(text, text.length, 0), offset);
}
function writeU32LEOnly(buf, offset, value) {
  buf[offset] = value & 255;
  buf[offset + 1] = value >>> 8 & 255;
  buf[offset + 2] = value >>> 16 & 255;
  buf[offset + 3] = value >>> 24 & 255;
}
function sanitizeLabel(label) {
  return (label || "ISOMAKER").replace(/[^\w.-]+/g, "_").slice(0, 32);
}
function parentOf(path2) {
  if (!path2) return null;
  const idx = path2.lastIndexOf("/");
  if (idx < 0) return "";
  return path2.slice(0, idx);
}
class IsoEditSession {
  constructor(original, opened) {
    __publicField(this, "original");
    __publicField(this, "volumeLabel");
    __publicField(this, "root");
    __publicField(this, "dirty", false);
    __publicField(this, "entriesCache", []);
    this.original = original;
    this.volumeLabel = opened.volumeLabel;
    this.root = cloneTree(opened.root);
    this.entriesCache = opened.entries;
  }
  static async open(file) {
    const opened = await openIso(file);
    return new IsoEditSession(file, opened);
  }
  /** Build a session from an already-materialized directory tree (AppImage / Docker extract). */
  static fromDirectoryTree(root, volumeLabel, original = new Blob([])) {
    const opened = {
      volumeLabel,
      root,
      entries: [],
      totalBytes: 0
    };
    const session2 = new IsoEditSession(original, opened);
    session2.refreshEntries();
    return session2;
  }
  get entries() {
    return this.entriesCache;
  }
  list(dirPath) {
    return listChildren(this.root, dirPath);
  }
  async readFile(path2) {
    const node = getNodeAtPath(this.root, path2);
    if (!node || node.kind !== "file") {
      throw new Error(`파일이 없습니다: ${path2}`);
    }
    if (node.source.type === "blob") return node.source.blob;
    if (node.source.type === "unavailable") {
      throw new Error(node.source.reason);
    }
    if (node.source.type === "path") {
      throw new Error(
        `경로 소스는 데스크톱에서만 읽을 수 있습니다: ${node.source.absolutePath}`
      );
    }
    return readIsoFile(node.source.iso, node.source.extents, node.source.blockSize);
  }
  remove(path2) {
    const parts = path2.split("/").filter(Boolean);
    if (parts.length === 0) throw new Error("루트는 삭제할 수 없습니다.");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = getNodeAtPath(this.root, parentPath);
    if (!parent || parent.kind !== "dir") throw new Error(`경로가 없습니다: ${path2}`);
    if (!parent.children.delete(normalizeKey(name))) {
      throw new Error(`항목이 없습니다: ${path2}`);
    }
    this.dirty = true;
    this.refreshEntries();
  }
  async addFiles(dirPath, files) {
    const parent = getNodeAtPath(this.root, dirPath);
    if (!parent || parent.kind !== "dir") throw new Error(`폴더가 없습니다: ${dirPath || "/"}`);
    for (const file of Array.from(files)) {
      const name = file.name;
      parent.children.set(normalizeKey(name), {
        kind: "file",
        name,
        size: file.size,
        source: { type: "blob", blob: file }
      });
    }
    this.dirty = true;
    this.refreshEntries();
  }
  /** Add a file by absolute disk path (desktop) without loading it into memory. */
  addFileFromPath(dirPath, name, absolutePath, size) {
    const parent = getNodeAtPath(this.root, dirPath);
    if (!parent || parent.kind !== "dir") throw new Error(`폴더가 없습니다: ${dirPath || "/"}`);
    parent.children.set(normalizeKey(name), {
      kind: "file",
      name,
      size,
      source: { type: "path", absolutePath }
    });
    this.dirty = true;
    this.refreshEntries();
  }
  mkdir(dirPath, name) {
    const parent = getNodeAtPath(this.root, dirPath);
    if (!parent || parent.kind !== "dir") throw new Error(`폴더가 없습니다: ${dirPath || "/"}`);
    if (parent.children.has(normalizeKey(name))) {
      throw new Error(`이미 존재합니다: ${name}`);
    }
    parent.children.set(normalizeKey(name), {
      kind: "dir",
      name,
      children: /* @__PURE__ */ new Map()
    });
    this.dirty = true;
    this.refreshEntries();
  }
  rename(path2, newName) {
    const parts = path2.split("/").filter(Boolean);
    if (parts.length === 0) throw new Error("루트 이름은 변경할 수 없습니다.");
    const oldName = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = getNodeAtPath(this.root, parentPath);
    if (!parent || parent.kind !== "dir") throw new Error(`경로가 없습니다: ${path2}`);
    const node = parent.children.get(normalizeKey(oldName));
    if (!node) throw new Error(`항목이 없습니다: ${path2}`);
    if (parent.children.has(normalizeKey(newName))) {
      throw new Error(`이미 존재합니다: ${newName}`);
    }
    parent.children.delete(normalizeKey(oldName));
    node.name = newName;
    parent.children.set(normalizeKey(newName), node);
    this.dirty = true;
    this.refreshEntries();
  }
  async exportIso(onProgress, signal, readPathFile) {
    return writeIso(this.root, this.volumeLabel, onProgress, signal, readPathFile);
  }
  refreshEntries() {
    const entries = [];
    walk(this.root, "", entries);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    this.entriesCache = entries;
  }
}
function walk(node, path2, entries) {
  for (const child of node.children.values()) {
    const childPath = path2 ? `${path2}/${child.name}` : child.name;
    if (child.kind === "dir") {
      entries.push({ path: childPath, name: child.name, isDir: true, size: 0 });
      walk(child, childPath, entries);
    } else {
      entries.push({ path: childPath, name: child.name, isDir: false, size: child.size });
    }
  }
}
function cloneTree(node) {
  const copy = { kind: "dir", name: node.name, children: /* @__PURE__ */ new Map() };
  for (const [key, child] of node.children) {
    copy.children.set(key, cloneNode(child));
  }
  return copy;
}
function cloneNode(node) {
  if (node.kind === "dir") return cloneTree(node);
  return {
    kind: "file",
    name: node.name,
    size: node.size,
    source: node.source
  };
}
const DISC_IMAGE_EXTENSIONS = ["iso", "img"];
function discImageFileFilters(lang = "ko") {
  return [
    {
      name: lang === "en" ? "Supported images (*.iso, *.img, *.AppImage, *.tar)" : "지원 이미지 (*.iso, *.img, *.AppImage, *.tar)",
      extensions: ["iso", "img", "AppImage", "appimage", "tar", "tgz", "docker"]
    },
    {
      name: "ISO / IMG",
      extensions: [...DISC_IMAGE_EXTENSIONS]
    },
    {
      name: "AppImage",
      extensions: ["AppImage", "appimage"]
    },
    {
      name: lang === "en" ? "Docker save / tar" : "Docker 저장본 / tar",
      extensions: ["tar", "tgz", "docker"]
    },
    {
      name: lang === "en" ? "All files" : "모든 파일",
      extensions: ["*"]
    }
  ];
}
function saveImageFileFilters(lang = "ko", preferred) {
  const iso = { name: "ISO", extensions: ["iso"] };
  const img = { name: "IMG", extensions: ["img"] };
  const app2 = {
    name: "AppImage",
    extensions: ["AppImage", "appimage"]
  };
  const docker = {
    name: lang === "en" ? "Docker save / tar" : "Docker 저장본 / tar",
    extensions: ["tar", "tgz", "docker"]
  };
  const tgz = {
    name: lang === "en" ? "Compressed tar (.tgz)" : "압축 tar (.tgz)",
    extensions: ["tgz"]
  };
  const all = {
    name: lang === "en" ? "All files" : "모든 파일",
    extensions: ["*"]
  };
  const byKind = {
    iso: [iso, img, app2, docker, tgz],
    img: [img, iso, app2, docker, tgz],
    appimage: [app2, iso, img, docker, tgz],
    docker: [docker, tgz, iso, img, app2]
  };
  const ordered = preferred && preferred !== "unknown" ? byKind[preferred] : [iso, img, app2, docker, tgz];
  return [...ordered, all];
}
function guessImageKindByName(filePath) {
  const base = filePath.replace(/^.*[/\\]/, "").toLowerCase();
  if (base.endsWith(".appimage")) return "appimage";
  if (base.endsWith(".iso")) return "iso";
  if (base.endsWith(".img")) return "img";
  if (base.endsWith(".tar.gz") || base.endsWith(".tgz") || base.endsWith(".tar") || base.endsWith(".docker")) {
    return "docker";
  }
  return "unknown";
}
function isArchiveImageKind(kind) {
  return kind === "appimage" || kind === "docker";
}
function editedImageName(sourcePathOrName) {
  const base = sourcePathOrName.replace(/^.*[/\\]/, "");
  if (/\.tar\.gz$/i.test(base)) {
    const stem = base.replace(/\.tar\.gz$/i, "") || "image";
    return `${stem}-edited.tar.gz`;
  }
  const m = base.match(/^(.*)\.(iso|img|appimage|tar|tgz|docker)$/i);
  if (m) {
    const rawExt = m[2];
    const ext = rawExt.toLowerCase() === "appimage" ? "AppImage" : rawExt.toLowerCase();
    return `${m[1]}-edited.${ext}`;
  }
  return `${base || "image"}-edited.iso`;
}
function isGzipTarPath(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".tgz") || lower.endsWith(".tar.gz");
}
const READ_CHUNK = 64 * 1024 * 1024;
async function openIsoBlob(filePath) {
  const size = fs.statSync(filePath).size;
  try {
    const blob = await openAsBlob(filePath);
    if (blob.size === size) return blob;
  } catch {
  }
  return createPathBlob(filePath, 0, size);
}
function createPathBlob(filePath, absStart, absEnd) {
  const size = Math.max(0, absEnd - absStart);
  const blob = {
    get size() {
      return size;
    },
    get type() {
      return "application/x-iso9660-image";
    },
    slice(start = 0, end = size, _contentType) {
      const from = absStart + clampIndex(start, size);
      const to = absStart + clampIndex(end, size);
      return createPathBlob(filePath, from, Math.max(from, to));
    },
    async arrayBuffer() {
      return readRange(filePath, absStart, size);
    },
    async bytes() {
      return new Uint8Array(await blob.arrayBuffer());
    },
    async text() {
      return new TextDecoder().decode(await blob.arrayBuffer());
    },
    stream() {
      const nodeStream = fs.createReadStream(filePath, {
        start: absStart,
        end: Math.max(absStart, absEnd - 1)
      });
      return Readable.toWeb(nodeStream);
    }
  };
  return blob;
}
function clampIndex(index, size) {
  if (!Number.isFinite(index)) return 0;
  let i = Math.trunc(index);
  if (i < 0) i = Math.max(0, size + i);
  return Math.min(size, Math.max(0, i));
}
async function readRange(filePath, offset, length) {
  if (length <= 0) return new ArrayBuffer(0);
  const fh = await fs.promises.open(filePath, "r");
  try {
    const out = Buffer.allocUnsafe(length);
    let done = 0;
    while (done < length) {
      const toRead = Math.min(READ_CHUNK, length - done);
      const { bytesRead } = await fh.read(out, done, toRead, offset + done);
      if (bytesRead <= 0) break;
      done += bytesRead;
    }
    const slice = out.subarray(0, done);
    return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
  } finally {
    await fh.close();
  }
}
function serializeChildren(dir, parentPath) {
  return [...dir.children.values()].map((child) => serializeNode(child, parentPath)).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}
function serializeNode(node, parentPath) {
  const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
  if (node.kind === "dir") {
    return {
      name: node.name,
      path: nodePath,
      isDir: true,
      size: 0,
      children: serializeChildren(node, nodePath)
    };
  }
  return {
    name: node.name,
    path: nodePath,
    isDir: false,
    size: node.size
  };
}
let session = null;
let sourcePath = null;
let sourceKind = "unknown";
let appImageRuntime = null;
let extractRoot = null;
const dragTempFiles = /* @__PURE__ */ new Set();
const dragCache = /* @__PURE__ */ new Map();
const dragInflight = /* @__PURE__ */ new Map();
function isEditDirty() {
  return Boolean(session == null ? void 0 : session.dirty);
}
function getEditSourcePath() {
  return sourcePath;
}
async function openEditSession(isoPath) {
  const resolved = path.resolve(isoPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`파일을 찾을 수 없습니다: ${resolved}`);
  }
  clearDragTemps();
  clearExtractRoot();
  appImageRuntime = null;
  sourceKind = "unknown";
  const hinted = guessImageKindByName(resolved);
  const kind = await detectOpenKind(resolved, hinted);
  if (isArchiveImageKind(kind)) {
    return openArchiveSession(resolved, kind);
  }
  try {
    const blob = await openIsoBlob(resolved);
    session = await IsoEditSession.open(blob);
    sourcePath = resolved;
    sourceKind = kind === "img" ? "img" : "iso";
    return snapshot();
  } catch (isoErr) {
    if (await isAppImageFile(resolved)) {
      return openArchiveSession(resolved, "appimage");
    }
    if (await looksLikeTarArchive(resolved)) {
      return openArchiveSession(resolved, "docker");
    }
    throw isoErr;
  }
}
async function openArchiveSession(resolved, kind) {
  const { extractRoot: root, treeRoot, squashfsOffset } = await extractArchiveToTemp(
    resolved,
    kind
  );
  extractRoot = root;
  const tree = await buildTreeFromDirectory(treeRoot);
  const label = volumeLabelFromPath(resolved);
  session = IsoEditSession.fromDirectoryTree(tree, label);
  sourcePath = resolved;
  sourceKind = kind;
  if (kind === "appimage" && squashfsOffset != null && squashfsOffset > 0) {
    appImageRuntime = { runtimePath: resolved, squashfsOffset };
  }
  return snapshot();
}
function closeEditSession() {
  session = null;
  sourcePath = null;
  sourceKind = "unknown";
  appImageRuntime = null;
  clearDragTemps();
  clearExtractRoot();
}
function getEditSnapshot() {
  if (!session || !sourcePath) return null;
  return snapshot();
}
async function addPathsToSession(destDir, filePaths) {
  const s = requireSession();
  const parent = getNodeAtPath(s.root, destDir);
  if (!parent || parent.kind !== "dir") {
    throw new Error(`폴더가 없습니다: ${destDir || "/"}`);
  }
  for (const filePath of filePaths) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    await addPathRecursive(s, destDir, resolved, path.basename(resolved));
  }
  invalidateDragCachePrefix(destDir);
  return snapshot();
}
function removeFromSession(entryPath) {
  requireSession().remove(entryPath);
  invalidateDragCachePrefix(entryPath);
  return snapshot();
}
function removeManyFromSession(entryPaths) {
  const s = requireSession();
  const sorted = [...new Set(entryPaths)].sort(
    (a, b) => b.split("/").filter(Boolean).length - a.split("/").filter(Boolean).length
  );
  for (const entryPath of sorted) {
    try {
      s.remove(entryPath);
      invalidateDragCachePrefix(entryPath);
    } catch {
    }
  }
  return snapshot();
}
function mkdirInSession(dirPath, name) {
  requireSession().mkdir(dirPath, name);
  return snapshot();
}
function renameInSession(entryPath, newName) {
  requireSession().rename(entryPath, newName);
  invalidateDragCachePrefix(entryPath);
  return snapshot();
}
async function exportFileFromSession(entryPath, outputPath) {
  const s = requireSession();
  const node = getNodeAtPath(s.root, entryPath);
  if (!node || node.kind !== "file") {
    throw new Error(`파일이 없습니다: ${entryPath}`);
  }
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  if (node.source.type === "path") {
    await fs.promises.copyFile(node.source.absolutePath, resolved);
  } else {
    const blob = await readSessionFile(s, entryPath);
    await writeBlobToFile(blob, resolved);
  }
  return { ok: true, outputPath: resolved };
}
async function exportFilesToDirectory(entryPaths, outputDir) {
  const dir = path.resolve(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const entryPath of entryPaths) {
    const s = requireSession();
    const node = getNodeAtPath(s.root, entryPath);
    if (!node || node.kind !== "file") continue;
    const dest = uniqueDestPath(dir, node.name);
    await exportFileFromSession(entryPath, dest);
    count += 1;
  }
  return { ok: true, count, outputDir: dir };
}
async function prepareDragOutFiles(entryPaths) {
  const tempPaths = [];
  const names = [];
  for (const entryPath of entryPaths) {
    const prepared = await prepareDragOutFile(entryPath);
    tempPaths.push(prepared.tempPath);
    names.push(prepared.name);
  }
  return { tempPaths, names };
}
async function prepareDragOutFile(entryPath) {
  const cached = dragCache.get(entryPath);
  if (cached && fs.existsSync(cached.tempPath)) {
    return { tempPath: cached.tempPath, name: cached.name };
  }
  const inflight = dragInflight.get(entryPath);
  if (inflight) return inflight;
  const job = (async () => {
    const s = requireSession();
    const node = getNodeAtPath(s.root, entryPath);
    if (!node || node.kind !== "file") {
      throw new Error(`파일이 없습니다: ${entryPath}`);
    }
    const name = node.name;
    if (node.source.type === "path" && fs.existsSync(node.source.absolutePath)) {
      const result2 = { tempPath: node.source.absolutePath, name, owned: false };
      dragCache.set(entryPath, result2);
      return { tempPath: result2.tempPath, name: result2.name };
    }
    const blob = await readSessionFile(s, entryPath);
    const tempPath = path.join(
      os.tmpdir(),
      `isomaker-drag-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`
    );
    await writeBlobToFile(blob, tempPath);
    if (!fs.existsSync(tempPath)) {
      throw new Error(`임시 파일 생성 실패: ${name}`);
    }
    const result = { tempPath, name, owned: true };
    dragTempFiles.add(tempPath);
    dragCache.set(entryPath, result);
    return { tempPath, name };
  })();
  dragInflight.set(entryPath, job);
  try {
    return await job;
  } finally {
    dragInflight.delete(entryPath);
  }
}
async function saveEditSession(outputPath, onProgress, signal) {
  const s = requireSession();
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  throwIfAborted(signal);
  const outKind = guessImageKindByName(resolved);
  const kind = outKind === "unknown" ? "iso" : outKind;
  if (kind === "iso" || kind === "img") {
    onProgress == null ? void 0 : onProgress({ phase: "save", percent: 0, message: "ISO/IMG 작성 중…" });
    const blob = await s.exportIso(
      (p) => {
        onProgress == null ? void 0 : onProgress({ phase: "save", percent: p.percent, message: p.message });
      },
      signal,
      openIsoBlob
    );
    throwIfAborted(signal);
    await writeBlobToFile(blob, resolved, signal);
  } else if (kind === "docker") {
    await saveAsTarArchive(s, resolved, isGzipTarPath(resolved), onProgress, signal);
  } else if (kind === "appimage") {
    await saveAsAppImage(s, resolved, onProgress, signal);
  } else {
    throw new Error(`지원하지 않는 저장 형식: ${path.basename(resolved)}`);
  }
  throwIfAborted(signal);
  s.dirty = false;
  onProgress == null ? void 0 : onProgress({ phase: "save", percent: 100, message: "저장 완료" });
  return snapshot();
}
async function saveAsTarArchive(s, outputPath, gzip, onProgress, signal) {
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), "isomaker-save-tar-"));
  try {
    onProgress == null ? void 0 : onProgress({ phase: "save", percent: 0, message: "트리 준비 중…" });
    await materializeTree(s.root, work, onProgress, signal);
    await packDirectoryAsTar(work, outputPath, gzip, onProgress, signal);
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
    }
  }
}
async function saveAsAppImage(s, outputPath, onProgress, signal) {
  if (!appImageRuntime) {
    throw new Error(
      "AppImage로 저장하려면 원본 AppImage를 연 상태에서 저장해야 합니다.\n(런타임 ELF가 필요하며, ISO/IMG/tar에서 AppImage로 변환은 지원하지 않습니다.)\n대신 .iso / .img / .tar 로 저장할 수 있습니다."
    );
  }
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), "isomaker-save-app-"));
  try {
    onProgress == null ? void 0 : onProgress({ phase: "save", percent: 0, message: "트리 준비 중…" });
    await materializeTree(s.root, work, onProgress, signal);
    await packDirectoryAsAppImage(work, outputPath, appImageRuntime, onProgress, signal);
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
    }
  }
}
function throwIfAborted(signal) {
  if (signal == null ? void 0 : signal.aborted) throw new Error("JOB_CANCELED");
}
async function readSessionFile(s, entryPath) {
  const node = getNodeAtPath(s.root, entryPath);
  if ((node == null ? void 0 : node.kind) === "file" && node.source.type === "path") {
    return openIsoBlob(node.source.absolutePath);
  }
  return s.readFile(entryPath);
}
function snapshot() {
  const s = requireSession();
  if (!sourcePath) throw new Error("No ISO session");
  let totalBytes = 0;
  for (const e of s.entries) {
    if (!e.isDir) totalBytes += e.size;
  }
  return {
    sourcePath,
    sourceKind,
    dirty: s.dirty,
    canSaveAppImage: Boolean(appImageRuntime),
    volumeLabel: s.volumeLabel,
    totalBytes,
    entryCount: s.entries.length,
    root: serializeChildren(s.root, "")
  };
}
function requireSession() {
  if (!session) throw new Error("열린 ISO가 없습니다.");
  return session;
}
async function addPathRecursive(s, destDir, srcPath, name) {
  const st = await fs.promises.stat(srcPath);
  if (st.isDirectory()) {
    ensureDir(s, destDir, name);
    const nextDir = destDir ? `${destDir}/${name}` : name;
    const children = await fs.promises.readdir(srcPath);
    for (const child of children) {
      await addPathRecursive(s, nextDir, path.join(srcPath, child), child);
    }
    return;
  }
  s.addFileFromPath(destDir, name, srcPath, st.size);
}
function ensureDir(s, parentPath, name) {
  const parent = getNodeAtPath(s.root, parentPath);
  if (!parent || parent.kind !== "dir") {
    throw new Error(`폴더가 없습니다: ${parentPath || "/"}`);
  }
  if (parent.children.has(normalizeKey(name))) {
    const existing = parent.children.get(normalizeKey(name));
    if ((existing == null ? void 0 : existing.kind) === "dir") return;
    throw new Error(`이미 파일이 있습니다: ${name}`);
  }
  s.mkdir(parentPath, name);
}
async function writeBlobToFile(blob, filePath, signal) {
  throwIfAborted(signal);
  if (blob.size < 8 * 1024 * 1024) {
    const buf = Buffer.from(await blob.arrayBuffer());
    throwIfAborted(signal);
    await fs.promises.writeFile(filePath, buf, { signal });
    return;
  }
  const stream = blob.stream();
  await pipeline(Readable.fromWeb(stream), fs.createWriteStream(filePath), { signal });
}
function safeName(name) {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\.+$/g, "");
  return cleaned || "file.bin";
}
function uniqueDestPath(dir, fileName) {
  let dest = path.join(dir, fileName);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let i = 2;
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
  }
  return dest;
}
function invalidateDragCachePrefix(prefix) {
  const keys = [...dragCache.keys()];
  for (const key of keys) {
    if (!prefix || key === prefix || key.startsWith(prefix + "/")) {
      const cached = dragCache.get(key);
      dragCache.delete(key);
      if (cached == null ? void 0 : cached.owned) {
        try {
          fs.unlinkSync(cached.tempPath);
        } catch {
        }
        dragTempFiles.delete(cached.tempPath);
      }
    }
  }
}
function clearDragTemps() {
  dragInflight.clear();
  for (const [key, cached] of dragCache) {
    dragCache.delete(key);
    if (!cached.owned) continue;
    try {
      fs.unlinkSync(cached.tempPath);
    } catch {
    }
    dragTempFiles.delete(cached.tempPath);
  }
  dragCache.clear();
  for (const file of dragTempFiles) {
    try {
      fs.unlinkSync(file);
    } catch {
    }
  }
  dragTempFiles.clear();
}
function clearExtractRoot() {
  if (!extractRoot) return;
  const dir = extractRoot;
  extractRoot = null;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
  }
}
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
function resourceRoots() {
  var _a;
  const roots = [];
  if (((_a = app) == null ? void 0 : _a.isPackaged) && process.resourcesPath) {
    roots.push(process.resourcesPath);
  }
  roots.push(process.cwd());
  roots.push(path.join(moduleDir, ".."));
  roots.push(path.join(moduleDir, "..", ".."));
  return [...new Set(roots)];
}
function resolveResource(...parts) {
  for (const root of resourceRoots()) {
    const candidate = path.join(root, ...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
const __dirname$2 = path.dirname(fileURLToPath(import.meta.url));
function vendorBinaryName() {
  if (process.platform === "win32") return "xorriso.exe";
  return "xorriso";
}
function windowsExtraCandidates() {
  if (process.platform !== "win32") return [];
  const roots = [
    process.env.MSYS2_ROOT,
    "C:\\msys64",
    "C:\\msys32",
    process.env.CYGWIN_ROOT,
    "C:\\cygwin64",
    "C:\\cygwin"
  ].filter((v) => Boolean(v));
  const out = [];
  for (const root of roots) {
    out.push(path.join(root, "usr", "bin", "xorriso.exe"));
    out.push(path.join(root, "bin", "xorriso.exe"));
    out.push(path.join(root, "mingw64", "bin", "xorriso.exe"));
  }
  return out;
}
function resolveXorrisoPath() {
  const vendorRel = ["vendor", "xorriso", process.platform, vendorBinaryName()];
  const candidates = [
    // Prefer full installs (DLL path is next to the exe / on PATH)
    ...windowsExtraCandidates(),
    ...resourceRoots().map((root) => path.join(root, ...vendorRel)),
    resolveResource(...vendorRel) ?? "",
    path.join(__dirname$2, "..", "..", ...vendorRel),
    path.join(__dirname$2, "..", "..", "..", ...vendorRel)
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "xorriso.exe" : "xorriso";
}
function usesPosixPaths(binary) {
  if (process.platform !== "win32") return false;
  if (!path.isAbsolute(binary)) return false;
  const n = binary.replace(/\\/g, "/").toLowerCase();
  if (n.includes("/msys") || n.includes("/cygwin") || n.includes("/usr/bin/")) return true;
  const dir = path.dirname(binary);
  return fs.existsSync(path.join(dir, "msys-2.0.dll")) || fs.existsSync(path.join(dir, "cygwin1.dll"));
}
function toXorrisoPath(filePath) {
  if (process.platform !== "win32") return filePath;
  let p = filePath;
  if (p.startsWith("\\\\?\\")) p = p.slice(4);
  const resolved = path.resolve(p);
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(resolved);
  if (!match) return resolved.replace(/\\/g, "/");
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return rest ? `/${drive}/${rest}` : `/${drive}`;
}
function adaptArgsForXorriso(binary, args) {
  if (!usesPosixPaths(binary)) return args;
  return args.map((arg) => {
    if (/^[a-zA-Z]:[\\/]/.test(arg) || arg.startsWith("\\\\?\\")) {
      return toXorrisoPath(arg);
    }
    return arg;
  });
}
function runXorriso(args, onProgress, signal) {
  const binary = resolveXorrisoPath();
  if (!binary) {
    return Promise.reject(new Error("xorriso binary not found"));
  }
  if (signal == null ? void 0 : signal.aborted) {
    return Promise.reject(createAbortError());
  }
  const env = { ...process.env };
  if (process.platform === "win32" && path.isAbsolute(binary)) {
    const binDir = path.dirname(binary);
    env.PATH = `${binDir};${env.PATH ?? ""}`;
    env.MSYS2_ARG_CONV_EXCL = "*";
    env.MSYS_NO_PATHCONV = "1";
  }
  const adaptedArgs = adaptArgsForXorriso(binary, args);
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(binary, adaptedArgs, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env
    });
    const abort = () => {
      if (settled) return;
      child.kill();
    };
    signal == null ? void 0 : signal.addEventListener("abort", abort, { once: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onProgress == null ? void 0 : onProgress({
        phase: "running",
        percent: null,
        message: text.trim()
      });
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onProgress == null ? void 0 : onProgress({
        phase: "running",
        percent: parsePercent(text),
        message: text.trim()
      });
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      signal == null ? void 0 : signal.removeEventListener("abort", abort);
      if (signal == null ? void 0 : signal.aborted) {
        reject(createAbortError());
        return;
      }
      reject(
        new Error(
          `Failed to start xorriso (${binary}): ${err.message}. Install xorriso or place a binary under vendor/xorriso/${process.platform}/`
        )
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      signal == null ? void 0 : signal.removeEventListener("abort", abort);
      if (signal == null ? void 0 : signal.aborted) {
        reject(createAbortError());
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
function createAbortError() {
  return new Error("JOB_CANCELED");
}
function parsePercent(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return Math.min(100, Math.max(0, Number(match[1])));
}
async function getEngineInfo() {
  const binaryPath = resolveXorrisoPath();
  const hint = process.platform === "win32" ? "MSYS2: pacman -S xorriso  (또는 vendor/xorriso/win32/xorriso.exe 에 복사)" : process.platform === "darwin" ? "Install with: brew install xorriso — or copy binary to vendor/xorriso/darwin/" : "Install with: sudo apt install xorriso — or copy binary to vendor/xorriso/linux/";
  if (!binaryPath) {
    return {
      available: false,
      binaryPath: null,
      version: null,
      platform: process.platform,
      hint
    };
  }
  const looksAbsolute = path.isAbsolute(binaryPath);
  try {
    const result = await runXorriso(["-version"]);
    const combined = `${result.stdout}
${result.stderr}`;
    const versionMatch = combined.match(/xorriso\s+version\s+([\d.]+)/i) || combined.match(/GNU xorriso\s+([\d.]+)/i);
    const available = result.code === 0 || /xorriso/i.test(combined);
    return {
      available,
      binaryPath,
      version: (versionMatch == null ? void 0 : versionMatch[1]) ?? (available ? "unknown" : null),
      platform: process.platform,
      hint: available ? "xorriso ready" : hint
    };
  } catch {
    return {
      available: false,
      binaryPath: looksAbsolute ? binaryPath : null,
      version: null,
      platform: process.platform,
      hint
    };
  }
}
async function extractIso(options, onProgress, signal) {
  const isoPath = path.resolve(options.isoPath);
  const outputDir = path.resolve(options.outputDir);
  assertFile(isoPath, "ISO file");
  fs.mkdirSync(outputDir, { recursive: true });
  onProgress == null ? void 0 : onProgress({ phase: "extract", percent: 0, message: "Extracting ISO…" });
  const winExtractFlags = process.platform === "win32" ? [
    "-abort_on",
    "NEVER",
    "-return_with",
    "FATAL",
    "32",
    "-error_behavior",
    "file_extraction",
    "best_effort",
    "-hardlinks",
    "discard_extract"
  ] : [];
  const result = await runXorriso(
    [
      ...winExtractFlags,
      "-osirrox",
      "on",
      "-indev",
      isoPath,
      "-extract",
      "/",
      outputDir
    ],
    onProgress,
    signal
  );
  if (result.code !== 0) {
    throw new Error(formatXorrisoError("extract", result.stderr || result.stdout));
  }
  const skippedLinks = countSkippedSymlinks(result.stderr || result.stdout);
  onProgress == null ? void 0 : onProgress({
    phase: "extract",
    percent: 100,
    message: skippedLinks > 0 ? `Extraction complete (${skippedLinks} symlink(s) skipped on Windows)` : "Extraction complete"
  });
}
function countSkippedSymlinks(log) {
  const matches = log.match(/Cannot restore symbolic link/gi);
  return (matches == null ? void 0 : matches.length) ?? 0;
}
async function createIso(options, onProgress, signal) {
  const sourceDir = path.resolve(options.sourceDir);
  const outputIso = path.resolve(options.outputIso);
  assertDir(sourceDir, "Source directory");
  fs.mkdirSync(path.dirname(outputIso), { recursive: true });
  const volumeLabel = sanitizeVolumeLabel(options.volumeLabel ?? "ISOMAKER");
  onProgress == null ? void 0 : onProgress({ phase: "create", percent: 0, message: "Creating ISO…" });
  const result = await runXorriso(
    [
      "-as",
      "mkisofs",
      "-r",
      "-J",
      "-joliet-long",
      "-V",
      volumeLabel,
      "-o",
      outputIso,
      sourceDir
    ],
    onProgress,
    signal
  );
  if (result.code !== 0) {
    throw new Error(formatXorrisoError("create", result.stderr || result.stdout));
  }
  onProgress == null ? void 0 : onProgress({ phase: "create", percent: 100, message: "ISO created" });
}
async function createBootableIso(options, onProgress, signal) {
  const sourceDir = path.resolve(options.sourceDir);
  const outputIso = path.resolve(options.outputIso);
  assertDir(sourceDir, "Source directory");
  fs.mkdirSync(path.dirname(outputIso), { recursive: true });
  if (!options.biosBootImage && !options.efiBootImage) {
    throw new Error("At least one of biosBootImage or efiBootImage is required for a bootable ISO");
  }
  const volumeLabel = sanitizeVolumeLabel(options.volumeLabel ?? "BOOTISO");
  const args = ["-as", "mkisofs", "-r", "-J", "-joliet-long", "-V", volumeLabel];
  if (options.isohybridMbr) {
    const mbr = path.join(sourceDir, options.isohybridMbr);
    assertFile(mbr, "isohybrid MBR");
    args.push("-isohybrid-mbr", mbr);
  }
  if (options.biosBootImage) {
    const bios = path.join(sourceDir, options.biosBootImage);
    assertFile(bios, "BIOS boot image");
    args.push(
      "-b",
      options.biosBootImage,
      "-c",
      "boot.catalog",
      "-no-emul-boot",
      "-boot-load-size",
      "4",
      "-boot-info-table"
    );
  }
  if (options.efiBootImage) {
    const efi = path.join(sourceDir, options.efiBootImage);
    assertFile(efi, "EFI boot image");
    args.push("-eltorito-alt-boot", "-e", options.efiBootImage, "-no-emul-boot");
    if (!options.isohybridMbr) {
      args.push("-isohybrid-gpt-basdat");
    }
  }
  args.push("-o", outputIso, sourceDir);
  onProgress == null ? void 0 : onProgress({ phase: "bootable", percent: 0, message: "Creating bootable ISO…" });
  const result = await runXorriso(args, onProgress, signal);
  if (result.code !== 0) {
    throw new Error(formatXorrisoError("bootable create", result.stderr || result.stdout));
  }
  onProgress == null ? void 0 : onProgress({ phase: "bootable", percent: 100, message: "Bootable ISO created" });
}
function assertFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}
function assertDir(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} not found: ${dirPath}`);
  }
}
function sanitizeVolumeLabel(label) {
  return label.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 32) || "ISOMAKER";
}
function formatXorrisoError(action, detail) {
  const trimmed = detail.trim().slice(-2e3);
  return `xorriso ${action} failed:
${trimmed || "Unknown error"}`;
}
async function listIsoTree(isoPath) {
  const resolved = path.resolve(isoPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`ISO file not found: ${resolved}`);
  }
  const blob = await openAsBlob(resolved);
  const opened = await openIso(blob);
  const root = serializeChildren(opened.root, "");
  return {
    volumeLabel: opened.volumeLabel,
    totalBytes: opened.totalBytes,
    entryCount: opened.entries.length,
    root
  };
}
function storePath() {
  return path.join(app.getPath("userData"), "isomaker-paths.json");
}
function readStore() {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      lastDirectory: typeof parsed.lastDirectory === "string" && parsed.lastDirectory ? parsed.lastDirectory : null
    };
  } catch {
    return { lastDirectory: null };
  }
}
function writeStore(store) {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf8");
  } catch {
  }
}
function getLastDirectory() {
  const dir = readStore().lastDirectory;
  if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  return null;
}
function rememberPath(selectedPath) {
  try {
    const stat = fs.statSync(selectedPath);
    const dir = stat.isDirectory() ? selectedPath : path.dirname(selectedPath);
    if (dir && fs.existsSync(dir)) {
      writeStore({ lastDirectory: dir });
    }
  } catch {
  }
}
function dialogDefaultPath(hintPath, fileName) {
  const fromHint = directoryFromHint(hintPath);
  const last = getLastDirectory();
  const base = fromHint ?? last;
  if (fileName) {
    if (base) return path.join(base, path.basename(fileName));
    return fileName;
  }
  return base ?? void 0;
}
function directoryFromHint(hintPath) {
  if (!hintPath) return null;
  try {
    if (fs.existsSync(hintPath)) {
      const stat = fs.statSync(hintPath);
      const dir = stat.isDirectory() ? hintPath : path.dirname(hintPath);
      return fs.existsSync(dir) ? dir : null;
    }
    const parent = path.dirname(hintPath);
    if (parent && parent !== hintPath && fs.existsSync(parent)) return parent;
  } catch {
  }
  return null;
}
const execFileAsync = promisify(execFile);
async function mountIso(isoPath) {
  if (!fs.existsSync(isoPath)) {
    return { mounted: false, message: `Image not found: ${isoPath}` };
  }
  switch (process.platform) {
    case "win32":
      return mountWindows(isoPath);
    case "darwin":
      return mountMac(isoPath);
    case "linux":
      return mountLinux(isoPath);
    default:
      return { mounted: false, message: `Mount not supported on ${process.platform}` };
  }
}
async function unmountIso(mountPointOrIso) {
  switch (process.platform) {
    case "win32":
      return unmountWindows(mountPointOrIso);
    case "darwin":
      return unmountMac(mountPointOrIso);
    case "linux":
      return unmountLinux(mountPointOrIso);
    default:
      return { mounted: false, message: `Unmount not supported on ${process.platform}` };
  }
}
async function mountWindows(isoPath) {
  const script = `
$ErrorActionPreference = 'Stop'
$img = Mount-DiskImage -ImagePath '${escapePs(isoPath)}' -PassThru
$vol = $img | Get-Volume
if (-not $vol.DriveLetter) { throw 'No drive letter assigned' }
Write-Output ($vol.DriveLetter + ':\\')
`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { windowsHide: true }
    );
    const mountPoint = stdout.trim();
    return { mounted: true, mountPoint, message: `Mounted at ${mountPoint}` };
  } catch (err) {
    return { mounted: false, message: errorMessage(err) };
  }
}
async function unmountWindows(isoPath) {
  const script = `
$ErrorActionPreference = 'Stop'
Dismount-DiskImage -ImagePath '${escapePs(isoPath)}'
`;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true
    });
    return { mounted: false, message: "Unmounted" };
  } catch (err) {
    return { mounted: true, message: errorMessage(err) };
  }
}
async function mountMac(isoPath) {
  try {
    const { stdout } = await execFileAsync("hdiutil", ["attach", "-readonly", isoPath]);
    const lines = stdout.trim().split("\n");
    const last = lines[lines.length - 1] ?? "";
    const parts = last.split(/\s{2,}|\t+/).filter(Boolean);
    const mountPoint = parts.find((p) => p.startsWith("/Volumes/")) ?? parts[parts.length - 1];
    return {
      mounted: true,
      mountPoint,
      message: mountPoint ? `Mounted at ${mountPoint}` : "Mounted"
    };
  } catch (err) {
    return { mounted: false, message: errorMessage(err) };
  }
}
async function unmountMac(mountPoint) {
  try {
    await execFileAsync("hdiutil", ["detach", mountPoint]);
    return { mounted: false, message: "Unmounted" };
  } catch (err) {
    return { mounted: true, message: errorMessage(err) };
  }
}
async function mountLinux(isoPath) {
  const mountPoint = path.join(os.tmpdir(), `isomaker-mnt-${Date.now()}`);
  fs.mkdirSync(mountPoint, { recursive: true });
  try {
    await execFileAsync("mount", ["-o", "loop,ro", isoPath, mountPoint]);
    return { mounted: true, mountPoint, message: `Mounted at ${mountPoint}` };
  } catch (err) {
    try {
      await execFileAsync("fuseiso", [isoPath, mountPoint]);
      return { mounted: true, mountPoint, message: `Mounted via fuseiso at ${mountPoint}` };
    } catch {
      try {
        fs.rmdirSync(mountPoint);
      } catch {
      }
      return {
        mounted: false,
        message: `${errorMessage(err)} (tip: run with privileges or install fuseiso)`
      };
    }
  }
}
async function unmountLinux(mountPoint) {
  try {
    await execFileAsync("umount", [mountPoint]);
    try {
      fs.rmdirSync(mountPoint);
    } catch {
    }
    return { mounted: false, message: "Unmounted" };
  } catch (err) {
    try {
      await execFileAsync("fusermount", ["-u", mountPoint]);
      return { mounted: false, message: "Unmounted (fuse)" };
    } catch {
      return { mounted: true, message: errorMessage(err) };
    }
  }
}
function escapePs(value) {
  return value.replace(/'/g, "''");
}
function errorMessage(err) {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = String(err.stderr ?? "");
    if (stderr.trim()) return stderr.trim();
  }
  return err instanceof Error ? err.message : String(err);
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
app.setAppUserModelId("com.shkwon.isomaker");
let mainWindow = null;
let allowClose = false;
let closePromptOpen = false;
let closeFallbackTimer = null;
let currentJobAbort = null;
let appLocale = "ko";
function isKo() {
  return appLocale === "ko";
}
function resolvePreloadPath() {
  const candidates = [
    // Dev: source file next to this repo (most reliable with "type": "module")
    path.join(process.cwd(), "electron", "preload.cjs"),
    // Packaged / built next to main or project electron/
    path.join(__dirname$1, "preload.cjs"),
    path.join(__dirname$1, "..", "electron", "preload.cjs"),
    path.join(__dirname$1, "preload.js")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}
function resolveAppIcon() {
  const file = process.platform === "win32" ? "icon.ico" : process.platform === "darwin" ? "icon.png" : "icon.png";
  return resolveResource("assets", file) ?? void 0;
}
function createWindow() {
  const preloadPath = resolvePreloadPath();
  const icon = resolveAppIcon();
  allowClose = false;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1480,
    minHeight: 700,
    title: "ISO Maker",
    autoHideMenuBar: true,
    ...icon ? { icon } : {},
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });
  mainWindow.webContents.closeDevTools();
  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.closeDevTools();
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[iso-maker] did-fail-load", { code, desc, url });
  });
  mainWindow.webContents.on("preload-error", (_e, preload, error) => {
    console.error("[iso-maker] preload-error", preload, error);
  });
  mainWindow.on("close", (event) => {
    if (allowClose || !isEditDirty()) {
      clearClosePrompt();
      closeEditSession();
      return;
    }
    event.preventDefault();
    requestCloseConfirmation();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
}
function clearClosePrompt() {
  closePromptOpen = false;
  if (closeFallbackTimer) {
    clearTimeout(closeFallbackTimer);
    closeFallbackTimer = null;
  }
}
function requestCloseConfirmation() {
  if (!mainWindow || closePromptOpen) return;
  closePromptOpen = true;
  mainWindow.webContents.send("app:close-request");
  closeFallbackTimer = setTimeout(() => {
    if (!closePromptOpen) return;
    void confirmCloseWithNativeDialog();
  }, 1500);
}
function forceCloseWindow() {
  clearClosePrompt();
  allowClose = true;
  closeEditSession();
  mainWindow == null ? void 0 : mainWindow.close();
}
async function confirmCloseWithNativeDialog() {
  if (!mainWindow) {
    clearClosePrompt();
    return;
  }
  const ko = isKo();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ko ? ["저장 후 종료", "저장 안 함", "취소"] : ["Save & quit", "Don't save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: ko ? "저장하지 않은 변경" : "Unsaved changes",
    message: ko ? "내용이 변경되었습니다. 종료하기 전에 저장할까요?" : "Contents have been modified. Save before quitting?",
    detail: ko ? "저장 형식(ISO/IMG/AppImage/tar)을 선택할 수 있습니다." : "You can choose the save format (ISO/IMG/AppImage/tar)."
  });
  if (result.response === 2) {
    clearClosePrompt();
    return;
  }
  if (result.response === 0) {
    const src = getEditSourcePath();
    const base = src ? editedImageName(src) : "edited.iso";
    const preferred = src ? guessImageKindByName(src) : "iso";
    const save = await dialog.showSaveDialog(mainWindow, {
      title: ko ? "변경 내용 저장" : "Save changes",
      defaultPath: dialogDefaultPath(src ?? void 0, base),
      filters: saveImageFileFilters(ko ? "ko" : "en", preferred)
    });
    if (save.canceled || !save.filePath) {
      clearClosePrompt();
      return;
    }
    try {
      await saveEditSession(save.filePath, sendProgress);
      rememberPath(save.filePath);
      mainWindow.webContents.send("session:updated", getEditSnapshot());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await dialog.showMessageBox(mainWindow, {
        type: "error",
        message: ko ? "저장 실패" : "Save failed",
        detail: message
      });
      clearClosePrompt();
      return;
    }
  }
  forceCloseWindow();
}
function sendProgress(progress) {
  mainWindow == null ? void 0 : mainWindow.webContents.send("job:progress", progress);
}
async function runCancelableJob(fn) {
  if (currentJobAbort) throw new Error("A job is already running");
  const controller = new AbortController();
  currentJobAbort = controller;
  try {
    return await fn(controller.signal);
  } finally {
    if (currentJobAbort === controller) currentJobAbort = null;
  }
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("before-quit", (event) => {
  if (allowClose || !isEditDirty()) return;
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  } else {
    requestCloseConfirmation();
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("app:close-ack", async () => {
  if (closeFallbackTimer) {
    clearTimeout(closeFallbackTimer);
    closeFallbackTimer = null;
  }
  return { ok: true };
});
ipcMain.handle("app:close-decision", async (_event, decision) => {
  if (decision === "cancel") {
    clearClosePrompt();
    return { ok: true };
  }
  forceCloseWindow();
  return { ok: true };
});
ipcMain.handle("engine:info", async () => getEngineInfo());
ipcMain.handle(
  "dialog:openFile",
  async (_event, filters, hintPath, title) => {
    const result = await dialog.showOpenDialog({
      title: title || (isKo() ? "이미지 열기" : "Open image"),
      properties: ["openFile"],
      filters: filters ?? discImageFileFilters(appLocale),
      defaultPath: dialogDefaultPath(hintPath)
    });
    const selected = result.canceled ? null : result.filePaths[0] ?? null;
    if (selected) rememberPath(selected);
    return selected;
  }
);
ipcMain.handle(
  "dialog:openFiles",
  async (_event, filters, hintPath, title) => {
    const result = await dialog.showOpenDialog({
      title: title || (isKo() ? "파일 선택" : "Select files"),
      properties: ["openFile", "multiSelections"],
      ...(filters == null ? void 0 : filters.length) ? { filters } : {},
      defaultPath: dialogDefaultPath(hintPath)
    });
    if (result.canceled || !result.filePaths.length) return [];
    rememberPath(result.filePaths[0]);
    return result.filePaths;
  }
);
ipcMain.handle(
  "dialog:openDirectory",
  async (_event, hintPath, title) => {
    const result = await dialog.showOpenDialog({
      title: title || (isKo() ? "디렉터리 선택" : "Select directory"),
      properties: ["openDirectory", "createDirectory"],
      defaultPath: dialogDefaultPath(hintPath)
    });
    const selected = result.canceled ? null : result.filePaths[0] ?? null;
    if (selected) rememberPath(selected);
    return selected;
  }
);
ipcMain.handle(
  "dialog:saveFile",
  async (_event, defaultPath, hintPath, title, filters) => {
    const fileName = defaultPath || "output.iso";
    const preferred = guessImageKindByName(fileName);
    const result = await dialog.showSaveDialog({
      title: title || (isKo() ? "이미지 저장" : "Save image"),
      defaultPath: dialogDefaultPath(hintPath ?? defaultPath, fileName),
      filters: (filters == null ? void 0 : filters.length) ? filters : saveImageFileFilters(appLocale, preferred)
    });
    const selected = result.canceled ? null : result.filePath ?? null;
    if (selected) rememberPath(selected);
    return selected;
  }
);
ipcMain.handle("shell:openPath", async (_event, targetPath) => {
  return shell.openPath(targetPath);
});
ipcMain.handle("iso:extract", async (_event, options) => {
  await runCancelableJob((signal) => extractIso(options, sendProgress, signal));
  return { ok: true };
});
ipcMain.handle("iso:create", async (_event, options) => {
  await runCancelableJob((signal) => createIso(options, sendProgress, signal));
  return { ok: true };
});
ipcMain.handle("iso:createBootable", async (_event, options) => {
  await runCancelableJob((signal) => createBootableIso(options, sendProgress, signal));
  return { ok: true };
});
ipcMain.handle("iso:cancel", async () => {
  if (!currentJobAbort) return { ok: true, canceled: false };
  currentJobAbort.abort();
  sendProgress({ phase: "cancel", percent: null, message: "Canceling job…" });
  return { ok: true, canceled: true };
});
ipcMain.handle("iso:mount", async (_event, isoPath) => mountIso(isoPath));
ipcMain.handle("iso:unmount", async (_event, target) => unmountIso(target));
ipcMain.handle("iso:listTree", async (_event, isoPath) => listIsoTree(isoPath));
ipcMain.handle("session:open", async (_event, isoPath) => {
  const snap = await openEditSession(isoPath);
  return snap;
});
ipcMain.handle("session:get", async () => getEditSnapshot());
ipcMain.handle("session:close", async () => {
  closeEditSession();
  return { ok: true };
});
ipcMain.handle("session:addPaths", async (_event, destDir, filePaths) => {
  return addPathsToSession(destDir, filePaths);
});
ipcMain.handle("session:remove", async (_event, entryPath) => removeFromSession(entryPath));
ipcMain.handle("session:removeMany", async (_event, entryPaths) => {
  return removeManyFromSession(entryPaths);
});
ipcMain.handle("session:mkdir", async (_event, dirPath, name) => {
  return mkdirInSession(dirPath, name);
});
ipcMain.handle("session:rename", async (_event, entryPath, newName) => {
  return renameInSession(entryPath, newName);
});
ipcMain.handle(
  "session:exportFile",
  async (_event, entryPath, outputPath) => {
    return exportFileFromSession(entryPath, outputPath);
  }
);
ipcMain.handle(
  "session:exportFilesToDir",
  async (_event, entryPaths, outputDir) => {
    return exportFilesToDirectory(entryPaths, outputDir);
  }
);
ipcMain.handle("session:prepareDragOut", async (_event, entryPath) => {
  return prepareDragOutFile(entryPath);
});
ipcMain.handle("session:prepareDragOutMany", async (_event, entryPaths) => {
  return prepareDragOutFiles(entryPaths);
});
ipcMain.handle("session:save", async (_event, outputPath) => {
  const snap = await runCancelableJob((signal) => saveEditSession(outputPath, sendProgress, signal));
  rememberPath(outputPath);
  return snap;
});
ipcMain.handle("session:isDirty", async () => ({ dirty: isEditDirty() }));
ipcMain.on("ondragstart", (event, filePathOrPaths) => {
  const list = (Array.isArray(filePathOrPaths) ? filePathOrPaths : [filePathOrPaths]).filter(
    (p) => typeof p === "string" && fs.existsSync(p)
  );
  if (!list.length) return;
  const iconPath = resolveResource("assets", "icon-32.png");
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBBkYGBgYGRkZGRgYGBgYGBgYGAAB/QAGH0b6bUQAAAABJRU5ErkJggg=="
    );
  }
  try {
    event.sender.startDrag({
      file: list[0],
      files: list.length > 1 ? list : void 0,
      icon
    });
  } catch (err) {
    console.error("[iso-maker] startDrag failed", list, err);
  }
});
ipcMain.handle("prefs:setLocale", async (_event, locale) => {
  if (locale === "ko" || locale === "en") appLocale = locale;
  return { ok: true };
});
