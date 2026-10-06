import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.js";

export type FileCompareStatus = "same" | "different" | "leftOnly" | "rightOnly";

export type DirectoryEntry = {
  /** Path relative to both roots, always with forward slashes. */
  rel: string;
  status: FileCompareStatus;
  leftSize: number | null;
  rightSize: number | null;
  leftModified: number | null;
  rightModified: number | null;
};

export type DirectoryCompareResult = {
  left: string;
  right: string;
  entries: DirectoryEntry[];
  same: number;
  different: number;
  leftOnly: number;
  rightOnly: number;
  /** True when the walk stopped at the entry limit. */
  truncated: boolean;
};

export const DEFAULT_EXCLUDES = [".git", "node_modules", "dist", "bin", "obj"];

const MAX_ENTRIES = 50_000;
const CHUNK = 1 << 16;

export function compareDirectories(
  leftRoot: string,
  rightRoot: string,
  excludes: readonly string[] = DEFAULT_EXCLUDES,
): DirectoryCompareResult {
  const left = requireDirectory(leftRoot);
  const right = requireDirectory(rightRoot);
  const skip = new Set(excludes.map((item) => item.trim().toLowerCase()).filter(Boolean));

  const leftFiles = walk(left, skip);
  const rightFiles = walk(right, skip);
  const keys = [...new Set([...leftFiles.keys(), ...rightFiles.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "accent" }));

  const entries: DirectoryEntry[] = [];
  let same = 0;
  let different = 0;
  let leftOnly = 0;
  let rightOnly = 0;
  const truncated = keys.length > MAX_ENTRIES;

  for (const rel of keys.slice(0, MAX_ENTRIES)) {
    const leftFile = leftFiles.get(rel);
    const rightFile = rightFiles.get(rel);
    let status: FileCompareStatus;
    if (leftFile && rightFile) {
      status = filesEqual(path.join(left, leftFile.rel), path.join(right, rightFile.rel), leftFile.size, rightFile.size)
        ? "same"
        : "different";
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

  return { left, right, entries, same, different, leftOnly, rightOnly, truncated };
}

type WalkedFile = { rel: string; size: number; modified: number };

function walk(root: string, skip: Set<string>): Map<string, WalkedFile> {
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
      try {
        const stat = fs.statSync(path.join(root, rel));
        files.set(key(rel), { rel, size: stat.size, modified: stat.mtimeMs });
      } catch {
        /* the file disappeared mid-walk */
      }
      if (files.size >= MAX_ENTRIES * 2) return files;
    }
  }
  return files;
}

/** Windows and macOS compare paths case-insensitively, so the map key does too. */
function key(rel: string): string {
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
