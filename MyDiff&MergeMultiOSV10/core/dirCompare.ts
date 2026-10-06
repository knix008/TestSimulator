import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.js";
import { applyRenames, detectRenames } from "./renames.js";
import { isArchivePath, joinArchivePath, listZip } from "./zip.js";
import { DEFAULT_EXCLUDES } from "./settings.js";

export { DEFAULT_EXCLUDES };

export type FileCompareStatus = "same" | "different" | "leftOnly" | "rightOnly" | "renamed";

export type DirectoryEntry = {
  /** Path relative to both roots, always with forward slashes. */
  rel: string;
  status: FileCompareStatus;
  leftSize: number | null;
  rightSize: number | null;
  leftModified: number | null;
  rightModified: number | null;
  /** Where the file went, when it was matched as a rename rather than a pair of orphans. */
  renamedTo?: string;
};

export type DirectoryCompareResult = {
  left: string;
  right: string;
  entries: DirectoryEntry[];
  same: number;
  different: number;
  leftOnly: number;
  rightOnly: number;
  renamed: number;
  /** True when the walk stopped at the entry limit. */
  truncated: boolean;
};

const MAX_ENTRIES = 50_000;
const CHUNK = 1 << 16;

export type CompareDirectoriesOptions = {
  /** Folder names never walked into. */
  excludes?: readonly string[];
  /** Only these file-name masks are compared; empty means everything. */
  includeMasks?: readonly string[];
  /** File-name masks never compared, applied after the include masks. */
  excludeMasks?: readonly string[];
  /** Pair a file missing on one side with an identical one that appeared on the other. */
  detectRenames?: boolean;
  /** Walk into zip-format archives and compare what is inside them. */
  archives?: boolean;
};

export function compareDirectories(
  leftRoot: string,
  rightRoot: string,
  options: CompareDirectoriesOptions | readonly string[] = {},
): DirectoryCompareResult {
  // A plain array is still accepted as "just the folder exclusions", which is how
  // the older call sites and the tests read.
  const settings: CompareDirectoriesOptions = Array.isArray(options)
    ? { excludes: options as readonly string[] }
    : (options as CompareDirectoriesOptions);
  const excludes = settings.excludes ?? DEFAULT_EXCLUDES;
  const left = requireDirectory(leftRoot);
  const right = requireDirectory(rightRoot);
  const skip = new Set(excludes.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const keep = maskFilter(settings.includeMasks, settings.excludeMasks);

  const leftFiles = walkFolder(left, skip, keep, settings.archives === true);
  const rightFiles = walkFolder(right, skip, keep, settings.archives === true);
  const keys = [...new Set([...leftFiles.keys(), ...rightFiles.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "accent" }));

  const entries: DirectoryEntry[] = [];
  let same = 0;
  let different = 0;
  let leftOnly = 0;
  let rightOnly = 0;
  const truncated = keys.length > MAX_ENTRIES;

  for (const key of keys.slice(0, MAX_ENTRIES)) {
    const leftFile = leftFiles.get(key);
    const rightFile = rightFiles.get(key);
    // The map key is case-folded on Windows and macOS so the two sides pair up;
    // what gets reported is the path as it is actually spelled on disk.
    const rel = (leftFile ?? rightFile)?.rel ?? key;
    let status: FileCompareStatus;
    if (leftFile && rightFile) {
      status = entriesEqual(left, leftFile, right, rightFile) ? "same" : "different";
      if (status === "same") same += 1;
      else different += 1;
    } else if (leftFile) {
      status = "leftOnly";
      leftOnly += 1;
    } else {
      status = "rightOnly";
      rightOnly += 1;
    }
    entries.push({
      rel,
      status,
      leftSize: leftFile?.size ?? null,
      rightSize: rightFile?.size ?? null,
      leftModified: leftFile?.modified ?? null,
      rightModified: rightFile?.modified ?? null,
    });
  }

  // Renames are worked out last, from the orphans the walk produced, so the
  // expensive part only ever looks at files that are missing on one side.
  let finalEntries = entries;
  let renamed = 0;
  if (settings.detectRenames) {
    const pairs = detectRenames(entries, left, right);
    if (pairs.length > 0) {
      finalEntries = applyRenames(entries, pairs);
      renamed = pairs.length;
      leftOnly -= pairs.length;
      rightOnly -= pairs.length;
    }
  }

  return {
    left,
    right,
    entries: finalEntries,
    same,
    different,
    leftOnly,
    rightOnly,
    renamed,
    truncated,
  };
}

export type WalkedFile = {
  rel: string;
  size: number;
  modified: number;
  /**
   * Set for a file inside an archive: the CRC the archive's index already holds.
   * Two entries with the same size and CRC are the same bytes, so an archive can be
   * compared without any of it being decompressed.
   */
  crc?: number;
  /** The archive this came from, when it did. */
  archive?: string;
};

export function walkFolder(
  root: string,
  skip: Set<string>,
  keep: (name: string) => boolean,
  archives = false,
): Map<string, WalkedFile> {
  const files = new Map<string, WalkedFile>();
  const stack: string[] = [""];
  while (stack.length > 0) {
    const relativeDir = stack.pop() as string;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      if (skip.has(item.name.toLowerCase())) continue;
      const rel = relativeDir ? `${relativeDir}/${item.name}` : item.name;
      if (item.isDirectory()) {
        stack.push(rel);
        continue;
      }
      if (!item.isFile()) continue;

      // An archive is walked into rather than compared as one opaque blob, so a
      // build whose only change is one file inside a jar says so.
      if (archives && isArchivePath(item.name)) {
        addArchive(files, root, rel, keep);
        if (files.size >= MAX_ENTRIES * 2) return files;
        continue;
      }

      if (!keep(item.name)) continue;
      try {
        const stat = fs.statSync(path.join(root, rel));
        files.set(foldKey(rel), { rel, size: stat.size, modified: stat.mtimeMs });
      } catch {
        /* the file disappeared mid-walk */
      }
      if (files.size >= MAX_ENTRIES * 2) return files;
    }
  }
  return files;
}

/**
 * Turns the user's file masks into one predicate.
 *
 * Masks are the familiar shell kind — `*.ts`, `README.*`, `?.txt` — rather than full
 * globs, because that is what the box in the toolbar invites and what every other
 * comparison tool accepts there. Include masks are an allow-list when present;
 * exclude masks always win.
 */
export function maskFilter(
  includeMasks: readonly string[] | undefined,
  excludeMasks: readonly string[] | undefined,
): (name: string) => boolean {
  const include = compileMasks(includeMasks);
  const exclude = compileMasks(excludeMasks);
  if (include.length === 0 && exclude.length === 0) return () => true;
  return (name: string) => {
    if (exclude.some((pattern) => pattern.test(name))) return false;
    return include.length === 0 || include.some((pattern) => pattern.test(name));
  };
}

function compileMasks(masks: readonly string[] | undefined): RegExp[] {
  if (!masks) return [];
  return masks
    .map((mask) => mask.trim())
    .filter(Boolean)
    .map((mask) => {
      // Escape everything the regular expression engine would read specially, then
      // put the two wildcards back as their regular-expression equivalents.
      const source = mask
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${source}$`, "i");
    });
}

/** Windows and macOS compare paths case-insensitively, so the map key does too. */
export function foldKey(rel: string): string {
  return process.platform === "linux" ? rel : rel.toLowerCase();
}

function filesEqual(leftPath: string, rightPath: string, leftSize: number, rightSize: number): boolean {
  if (leftSize !== rightSize) return false;
  if (leftSize === 0) return true;

  let leftHandle: number | undefined;
  let rightHandle: number | undefined;
  try {
    leftHandle = fs.openSync(leftPath, "r");
    rightHandle = fs.openSync(rightPath, "r");
    const leftBuffer = Buffer.allocUnsafe(CHUNK);
    const rightBuffer = Buffer.allocUnsafe(CHUNK);
    for (;;) {
      const leftRead = fs.readSync(leftHandle, leftBuffer, 0, CHUNK, null);
      const rightRead = fs.readSync(rightHandle, rightBuffer, 0, CHUNK, null);
      if (leftRead !== rightRead) return false;
      if (leftRead === 0) return true;
      if (!leftBuffer.subarray(0, leftRead).equals(rightBuffer.subarray(0, rightRead))) return false;
    }
  } catch {
    return false;
  } finally {
    if (leftHandle !== undefined) fs.closeSync(leftHandle);
    if (rightHandle !== undefined) fs.closeSync(rightHandle);
  }
}

function requireDirectory(target: string): string {
  const resolved = path.resolve(target || "");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new ApiError(`Directory not found: ${resolved}`, "NO_DIR", 400);
  }
  if (!stat.isDirectory()) throw new ApiError(`Not a directory: ${resolved}`, "NO_DIR", 400);
  return resolved;
}

/**
 * Every file inside one archive, as entries named `archive.zip!inner/path`.
 *
 * Only the index is read. The CRC it carries is enough to say whether two entries
 * are the same bytes, so nothing is decompressed unless the user opens one.
 */
function addArchive(
  files: Map<string, WalkedFile>,
  root: string,
  archiveRel: string,
  keep: (name: string) => boolean,
): void {
  let entries;
  try {
    entries = listZip(path.join(root, archiveRel));
  } catch {
    // Not a readable archive after all: fall back to treating it as a file.
    try {
      const stat = fs.statSync(path.join(root, archiveRel));
      files.set(foldKey(archiveRel), { rel: archiveRel, size: stat.size, modified: stat.mtimeMs });
    } catch {
      /* gone */
    }
    return;
  }

  for (const entry of entries) {
    if (entry.directory) continue;
    const name = entry.name.split("/").pop() ?? entry.name;
    if (!keep(name)) continue;
    const rel = joinArchivePath(archiveRel, entry.name);
    files.set(foldKey(rel), {
      rel,
      size: entry.size,
      modified: entry.modified,
      crc: entry.crc,
      archive: archiveRel,
    });
  }
}

/**
 * Whether two walked files hold the same bytes.
 *
 * Inside an archive the answer is already written down: same size and same CRC
 * means the same content, which is why comparing two large archives costs almost
 * nothing. On disk it still comes down to reading them.
 */
function entriesEqual(
  leftRoot: string,
  leftFile: WalkedFile,
  rightRoot: string,
  rightFile: WalkedFile,
): boolean {
  if (leftFile.size !== rightFile.size) return false;
  if (leftFile.crc !== undefined || rightFile.crc !== undefined) {
    return leftFile.crc === rightFile.crc;
  }
  return filesEqual(
    path.join(leftRoot, leftFile.rel),
    path.join(rightRoot, rightFile.rel),
    leftFile.size,
    rightFile.size,
  );
}
