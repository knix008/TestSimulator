/**
 * The file operations a folder comparison offers: copy an entry to the other side,
 * move it there, rename it, and delete one.
 *
 * Every path is resolved and checked to be inside the root it claims to belong to
 * before anything is written or removed. A directory comparison deals in relative
 * paths that came from a client, and `../../` in one of them must not be able to
 * reach outside the two folders the user opened.
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.js";

export type FileOperation =
  | "copyToRight" | "copyToLeft"
  /** Copy across and then remove the original — one undoable step from outside. */
  | "moveToRight" | "moveToLeft"
  | "deleteLeft" | "deleteRight";

export const FILE_OPERATIONS: FileOperation[] = [
  "copyToRight", "copyToLeft", "moveToRight", "moveToLeft", "deleteLeft", "deleteRight",
];

export function isFileOperation(value: unknown): value is FileOperation {
  return typeof value === "string" && (FILE_OPERATIONS as string[]).includes(value);
}

export type OperationResult = {
  operation: FileOperation;
  /** Relative paths that were copied or removed. */
  done: string[];
  /** Relative path → why it could not be done. */
  failed: { rel: string; reason: string }[];
};

/** Resolves `rel` inside `root`, refusing anything that escapes it. */
export function resolveInside(root: string, rel: string): string {
  const base = path.resolve(root);
  const target = path.resolve(base, rel);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (target !== base && !target.startsWith(prefix)) {
    throw new ApiError(`That path is outside the compared folder: ${rel}`, "OUTSIDE_ROOT", 400);
  }
  return target;
}

export function applyOperation(
  operation: FileOperation,
  leftRoot: string,
  rightRoot: string,
  relatives: readonly string[],
): OperationResult {
  const result: OperationResult = { operation, done: [], failed: [] };

  for (const rel of relatives) {
    try {
      if (operation === "copyToRight") copyEntry(leftRoot, rightRoot, rel);
      else if (operation === "copyToLeft") copyEntry(rightRoot, leftRoot, rel);
      else if (operation === "moveToRight") {
        // Copy first: if the copy fails the original is still there, which is the
        // safer half of a move to get wrong.
        copyEntry(leftRoot, rightRoot, rel);
        deleteEntry(leftRoot, rel);
      } else if (operation === "moveToLeft") {
        copyEntry(rightRoot, leftRoot, rel);
        deleteEntry(rightRoot, rel);
      } else if (operation === "deleteLeft") deleteEntry(leftRoot, rel);
      else deleteEntry(rightRoot, rel);
      result.done.push(rel);
    } catch (error) {
      result.failed.push({ rel, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}

/** Copies one file or whole folder from `fromRoot` to the same place under `toRoot`. */
export function copyEntry(fromRoot: string, toRoot: string, rel: string): void {
  const source = resolveInside(fromRoot, rel);
  const target = resolveInside(toRoot, rel);
  if (source === target) throw new ApiError("The two sides are the same file.", "SAME_FILE", 400);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(source);
  } catch {
    throw new ApiError(`Not found: ${rel}`, "NO_FILE", 400);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(source, target);
  // Carry the timestamps across, so the copy compares as identical afterwards.
  try {
    fs.utimesSync(target, stat.atime, stat.mtime);
  } catch {
    /* some file systems refuse; the content still matches */
  }
}

export function deleteEntry(root: string, rel: string): void {
  const target = resolveInside(root, rel);
  if (target === path.resolve(root)) {
    throw new ApiError("The compared folder itself cannot be deleted.", "IS_ROOT", 400);
  }
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * Renames one entry in place, inside the root it belongs to.
 *
 * The new name is treated as a relative path so a file can be moved into another
 * folder of the same tree, and it goes through `resolveInside` like everything else:
 * a rename is the obvious way to try to write outside the compared folder.
 */
export function renameEntry(root: string, rel: string, nextRel: string): void {
  const source = resolveInside(root, rel);
  const target = resolveInside(root, nextRel);
  if (source === target) return;
  if (!fs.existsSync(source)) {
    throw new ApiError(`There is nothing at ${rel} to rename.`, "NO_FILE", 400);
  }
  if (fs.existsSync(target)) {
    throw new ApiError(`${nextRel} already exists.`, "EXISTS", 400);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
}
