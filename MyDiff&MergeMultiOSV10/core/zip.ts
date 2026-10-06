/**
 * Reading ZIP archives, so a folder comparison can see inside one.
 *
 * An archive in a folder comparison is a wall: two builds whose only difference is
 * one file inside a jar report as "one file differs" and tell you nothing. Walking
 * into it turns that back into the answer you wanted.
 *
 * Only reading, and only the two methods that actually occur: stored, and deflate —
 * which Node inflates for us. The central directory is the whole index of an
 * archive and sits at the end of the file, so listing one costs a few kilobytes
 * rather than a decompression of the lot. That matters: a folder comparison may
 * list hundreds of archives and read none of them.
 *
 * The CRC in the directory is what makes comparison cheap. Two entries with the
 * same size and the same CRC are the same bytes, so a folder comparison never has
 * to decompress anything to know whether a file changed.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { ApiError } from "./errors.js";

export type ZipEntry = {
  /** The path inside the archive, forward slashes, no leading one. */
  name: string;
  /** Uncompressed size in bytes. */
  size: number;
  compressedSize: number;
  /** 0 stored, 8 deflate; anything else cannot be read here. */
  method: number;
  crc: number;
  /** Modification time in milliseconds, from the DOS stamp. */
  modified: number;
  directory: boolean;
  /** Where the local header begins — where extraction starts from. */
  offset: number;
};

/** Extensions read as archives. The format is the same for all of them. */
export const ARCHIVE_EXTENSIONS = new Set([
  "zip", "jar", "war", "ear", "apk", "aar", "xpi", "whl", "nupkg", "vsix", "docx",
  "xlsx", "pptx", "odt", "ods", "odp", "epub", "crx", "ipa",
]);

export function isArchivePath(file: string): boolean {
  const name = file.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const extension = name.includes(".") ? name.split(".").pop()! : "";
  return ARCHIVE_EXTENSIONS.has(extension);
}

/** The separator between an archive's path and a path inside it. */
export const ARCHIVE_SEPARATOR = "!";

/** `C:\\x\\a.zip!inner/file.txt` split into the two halves, or null if there is no `!`. */
export function splitArchivePath(target: string): { archive: string; entry: string } | null {
  const at = target.indexOf(ARCHIVE_SEPARATOR);
  if (at <= 0) return null;
  return {
    archive: target.slice(0, at),
    // Always forward slashes: the path has usually been through `path.join`, which
    // turns the separators inside the archive into backslashes on Windows, and an
    // archive's own names are forward-slashed whatever wrote it.
    entry: target.slice(at + 1).replace(/\\/g, "/"),
  };
}

export function joinArchivePath(archive: string, entry: string): string {
  return `${archive}${ARCHIVE_SEPARATOR}${entry}`;
}

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const ZIP64_END = 0x06064b50;
/** The end record is at most 22 bytes plus a 64 KB comment. */
const END_SEARCH = 22 + 0xffff;

/**
 * Everything in the archive, from its central directory.
 *
 * Nothing is decompressed: this reads the index only, which is what lets a folder
 * comparison list the contents of a hundred archives without unpacking any of them.
 */
export function listZip(file: string): ZipEntry[] {
  const handle = fs.openSync(file, "r");
  try {
    const total = fs.fstatSync(handle).size;
    const end = findEnd(handle, total);
    if (!end) throw new ApiError(`${file} is not a readable archive.`, "BAD_ARCHIVE", 400);

    const directory = Buffer.alloc(end.size);
    fs.readSync(handle, directory, 0, end.size, end.offset);

    const entries: ZipEntry[] = [];
    let at = 0;
    while (at + 46 <= directory.length) {
      if (directory.readUInt32LE(at) !== CENTRAL_SIGNATURE) break;

      const method = directory.readUInt16LE(at + 10);
      const time = directory.readUInt16LE(at + 12);
      const date = directory.readUInt16LE(at + 14);
      const crc = directory.readUInt32LE(at + 16);
      let compressedSize = directory.readUInt32LE(at + 20);
      let size = directory.readUInt32LE(at + 24);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      let offset = directory.readUInt32LE(at + 42);

      const name = directory.toString("utf8", at + 46, at + 46 + nameLength);
      const extra = directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength);

      // Zip64: the 32-bit fields are all ones and the real values are in an extra
      // field. Without this, any archive over 4 GB reads as nonsense.
      if (size === 0xffffffff || compressedSize === 0xffffffff || offset === 0xffffffff) {
        const zip64 = findExtra(extra, 0x0001);
        if (zip64) {
          let cursor = 0;
          if (size === 0xffffffff) {
            size = Number(zip64.readBigUInt64LE(cursor));
            cursor += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(zip64.readBigUInt64LE(cursor));
            cursor += 8;
          }
          if (offset === 0xffffffff) offset = Number(zip64.readBigUInt64LE(cursor));
        }
      }

      entries.push({
        name: name.replace(/\\/g, "/").replace(/^\/+/, ""),
        size,
        compressedSize,
        method,
        crc,
        modified: dosTime(date, time),
        directory: name.endsWith("/") || name.endsWith("\\"),
        offset,
      });

      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    fs.closeSync(handle);
  }
}

/** One entry's bytes. */
export function readZipEntry(file: string, name: string): Uint8Array {
  const entry = listZip(file).find((item) => item.name === name);
  if (!entry) throw new ApiError(`${name} is not in ${file}.`, "NO_FILE", 404);
  if (entry.directory) return new Uint8Array(0);
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ApiError(
      `${name} uses compression method ${entry.method}, which is not supported.`,
      "BAD_ARCHIVE",
      400,
    );
  }

  const handle = fs.openSync(file, "r");
  try {
    // The local header repeats the name and extra field, and its lengths are the
    // ones that count — the central directory's extra field is often a different
    // size, and trusting it puts the read at the wrong offset.
    const header = Buffer.alloc(30);
    fs.readSync(handle, header, 0, 30, entry.offset);
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);

    const from = entry.offset + 30 + nameLength + extraLength;
    const raw = Buffer.alloc(entry.compressedSize);
    fs.readSync(handle, raw, 0, entry.compressedSize, from);

    return entry.method === 0 ? new Uint8Array(raw) : new Uint8Array(zlib.inflateRawSync(raw));
  } finally {
    fs.closeSync(handle);
  }
}

/* ------------------------------------------------------------------ *
 * Finding the index
 * ------------------------------------------------------------------ */

function findEnd(handle: number, total: number): { offset: number; size: number } | null {
  const length = Math.min(total, END_SEARCH);
  const tail = Buffer.alloc(length);
  fs.readSync(handle, tail, 0, length, total - length);

  for (let at = tail.length - 22; at >= 0; at--) {
    if (tail.readUInt32LE(at) !== END_SIGNATURE) continue;

    const size = tail.readUInt32LE(at + 12);
    const offset = tail.readUInt32LE(at + 16);
    if (size !== 0xffffffff && offset !== 0xffffffff) return { offset, size };

    // Zip64 again: the real end record is pointed to by a locator just before this.
    const locatorAt = at - 20;
    if (locatorAt < 0 || tail.readUInt32LE(locatorAt) !== ZIP64_END_LOCATOR) return { offset, size };
    const endAt = Number(tail.readBigUInt64LE(locatorAt + 8));

    const record = Buffer.alloc(56);
    fs.readSync(handle, record, 0, 56, endAt);
    if (record.readUInt32LE(0) !== ZIP64_END) return { offset, size };
    return {
      size: Number(record.readBigUInt64LE(40)),
      offset: Number(record.readBigUInt64LE(48)),
    };
  }
  return null;
}

/** One extra field by its id, from the blob of them. */
function findExtra(extra: Buffer, id: number): Buffer | null {
  let at = 0;
  while (at + 4 <= extra.length) {
    const kind = extra.readUInt16LE(at);
    const size = extra.readUInt16LE(at + 2);
    if (kind === id) return extra.subarray(at + 4, at + 4 + size);
    at += 4 + size;
  }
  return null;
}

/** The DOS date and time fields as a timestamp. */
function dosTime(date: number, time: number): number {
  const year = 1980 + ((date >> 9) & 0x7f);
  const month = ((date >> 5) & 0x0f) - 1;
  const day = date & 0x1f;
  const hour = (time >> 11) & 0x1f;
  const minute = (time >> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  const stamp = new Date(year, month, day, hour, minute, second).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}
