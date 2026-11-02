/**
 * Comparing a folder on disk with one on a server.
 *
 * The same result shape as a local comparison, so every view, filter, print and
 * status line already knows how to show it — but arrived at differently, because
 * what a server will tell you cheaply is not what a disk will.
 *
 * A local comparison reads both files when their sizes match. A remote one cannot:
 * reading means downloading, and downloading every file to find out that none of
 * them changed is the opposite of useful. So files are matched on size and, when
 * the server reported one, modification time — with the same tolerance the folder
 * sync uses, because a server's clock and a filesystem's rarely agree to the
 * second. Asking for the contents to be compared is a deliberate, slower choice.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_EXCLUDES,
  foldKey,
  maskFilter,
  walkFolder,
  type DirectoryCompareResult,
  type DirectoryEntry,
  type FileCompareStatus,
} from "./dirCompare.js";
import { ApiError } from "./errors.js";
import { formatRemotePath, type RemoteSession } from "./remote.js";
import { DEFAULT_TOLERANCE, DST_TOLERANCE } from "./sync.js";

export type RemoteCompareOptions = {
  excludes?: readonly string[];
  includeMasks?: readonly string[];
  excludeMasks?: readonly string[];
  /** Download both sides and compare the bytes. Correct, and slow. */
  compareContents?: boolean;
  /** Timestamps closer together than this are the same time. */
  toleranceMs?: number;
};

const MAX_ENTRIES = 50_000;

/**
 * Which side is local is not symmetric: the local folder is always the left, so
 * "copy to the right" means "upload", which is the direction people expect from a
 * window with their own machine on the left.
 */
export async function compareWithRemote(
  localRoot: string,
  remote: RemoteSession,
  options: RemoteCompareOptions = {},
): Promise<DirectoryCompareResult> {
  const left = path.resolve(localRoot);
  if (!fs.existsSync(left) || !fs.statSync(left).isDirectory()) {
    throw new ApiError(`Not a folder: ${left}`, "NO_DIR", 400);
  }

  const skip = new Set((options.excludes ?? DEFAULT_EXCLUDES)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean));
  const keep = maskFilter(options.includeMasks, options.excludeMasks);

  const locals = walkFolder(left, skip, keep);
  const remotes = await remote.walk(skip, keep);

  const keys = [...new Set([...locals.keys(), ...remotes.keys()])]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }));

  const entries: DirectoryEntry[] = [];
  let same = 0;
  let different = 0;
  let leftOnly = 0;
  let rightOnly = 0;
  const truncated = keys.length > MAX_ENTRIES;

  for (const key of keys.slice(0, MAX_ENTRIES)) {
    const local = locals.get(key);
    const there = remotes.get(foldKey(key));
    const rel = (local ?? there)?.rel ?? key;

    let status: FileCompareStatus;
    if (local && there) {
      status = await equal(left, local.rel, remote, there.rel, local.size, there.size, options)
        ? "same"
        : "different";
      if (status === "same") same += 1;
      else different += 1;
    } else if (local) {
      status = "leftOnly";
      leftOnly += 1;
    } else {
      status = "rightOnly";
      rightOnly += 1;
    }

    entries.push({
      rel,
      status,
      leftSize: local?.size ?? null,
      rightSize: there?.size ?? null,
      leftModified: local?.modified ?? null,
      rightModified: there?.modified ?? null,
    });
  }

  return {
    left,
    right: formatRemotePath(remote.root),
    entries,
    same,
    different,
    leftOnly,
    rightOnly,
    renamed: 0,
    truncated,
  };
}

async function equal(
  localRoot: string,
  localRel: string,
  remote: RemoteSession,
  remoteRel: string,
  localSize: number,
  remoteSize: number,
  options: RemoteCompareOptions,
): Promise<boolean> {
  if (localSize !== remoteSize) return false;
  if (localSize === 0) return true;

  if (options.compareContents) {
    try {
      const [here, there] = await Promise.all([
        Promise.resolve(fs.readFileSync(path.join(localRoot, localRel))),
        remote.read(remoteRel),
      ]);
      if (here.length !== there.length) return false;
      for (let at = 0; at < here.length; at++) if (here[at] !== there[at]) return false;
      return true;
    } catch {
      // Unreadable on one side: say they differ rather than claim they match.
      return false;
    }
  }

  // Sizes agree, so it comes down to the clock — and the clock is approximate.
  return true;
}

/**
 * Whether two timestamps are near enough to be the same moment.
 *
 * Exported because the same question comes up wherever a remote time is compared,
 * and because getting it wrong in one place and right in another would be worse
 * than getting it consistently wrong.
 */
export function sameTime(a: number | null, b: number | null, toleranceMs = DEFAULT_TOLERANCE): boolean {
  if (a === null || b === null) return true;
  const difference = Math.abs(a - b);
  if (difference <= toleranceMs) return true;
  // And a whole hour is a time zone, not an edit.
  const hours = difference / DST_TOLERANCE;
  const nearest = Math.round(hours);
  return nearest >= 1 && nearest <= 2 && Math.abs(hours - nearest) * DST_TOLERANCE <= toleranceMs;
}
