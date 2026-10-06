/**
 * Folder synchronisation: turning a comparison into a list of file operations.
 *
 * Planning is separated from doing, and planning is pure. Given the entries a
 * directory comparison produced and a mode, `planSync` says exactly what it would do
 * and why — which is what the preview shows, and what the confirmation is about. The
 * same plan is then handed back to be applied, so nothing is decided twice and what
 * runs is what was shown.
 *
 * The five modes are the ones that are actually distinct:
 *
 *   mirrorToRight   make the right side identical to the left, deletions included
 *   updateToRight   copy left over right where left is newer or missing; delete nothing
 *   mirrorToLeft    the same, the other way round
 *   updateToLeft
 *   twoWay          copy whichever side is newer, each way; delete nothing
 *
 * "Newer" needs a tolerance. A FAT filesystem stores timestamps to two seconds, and
 * an archive restored across a DST boundary can be a whole hour out, so two files
 * within the tolerance are treated as the same age and left alone rather than copied
 * back and forth forever.
 */
import type { DirectoryEntry } from "./dirCompare.js";
import type { FileOperation } from "./fileOps.js";

export type SyncMode = "mirrorToRight" | "updateToRight" | "mirrorToLeft" | "updateToLeft" | "twoWay";

export const SYNC_MODES: SyncMode[] = [
  "mirrorToRight",
  "updateToRight",
  "mirrorToLeft",
  "updateToLeft",
  "twoWay",
];

export function isSyncMode(value: unknown): value is SyncMode {
  return typeof value === "string" && (SYNC_MODES as string[]).includes(value);
}

/** Why an action is in the plan — shown in the preview, and worth knowing. */
export type SyncReason = "missing" | "newer" | "different" | "orphan";

export type SyncAction = {
  rel: string;
  operation: FileOperation;
  reason: SyncReason;
};

export type SyncPlan = {
  mode: SyncMode;
  actions: SyncAction[];
  /** Entries deliberately left alone, so the preview can say "and 412 unchanged". */
  skipped: number;
};

/** Two seconds for FAT, plus an hour for a daylight-saving shift, in milliseconds. */
export const DEFAULT_TOLERANCE = 2000;
export const DST_TOLERANCE = 60 * 60 * 1000;

export type SyncOptions = {
  /** Timestamps closer together than this count as the same age. */
  toleranceMs?: number;
  /** Also forgive a whole-hour difference, for archives moved across a DST change. */
  allowDaylightShift?: boolean;
};

export function planSync(
  entries: readonly DirectoryEntry[],
  mode: SyncMode,
  options: SyncOptions = {},
): SyncPlan {
  const actions: SyncAction[] = [];
  let skipped = 0;

  for (const entry of entries) {
    const action = planEntry(entry, mode, options);
    if (action) actions.push(action);
    else skipped += 1;
  }

  // Deletions last: copying first means a failure part-way through leaves the target
  // with too much rather than too little, which is the safer half to be wrong on.
  actions.sort((a, b) => rank(a.operation) - rank(b.operation) || a.rel.localeCompare(b.rel));
  return { mode, actions, skipped };
}

function rank(operation: FileOperation): number {
  return operation === "deleteLeft" || operation === "deleteRight" ? 1 : 0;
}

function planEntry(
  entry: DirectoryEntry,
  mode: SyncMode,
  options: SyncOptions,
): SyncAction | null {
  const { rel, status } = entry;

  if (status === "same") return null;

  if (status === "leftOnly") {
    if (mode === "mirrorToRight" || mode === "updateToRight" || mode === "twoWay") {
      return { rel, operation: "copyToRight", reason: "missing" };
    }
    // Mirroring the other way means the left side should not have it either.
    if (mode === "mirrorToLeft") return { rel, operation: "deleteLeft", reason: "orphan" };
    return null;
  }

  if (status === "rightOnly") {
    if (mode === "mirrorToLeft" || mode === "updateToLeft" || mode === "twoWay") {
      return { rel, operation: "copyToLeft", reason: "missing" };
    }
    if (mode === "mirrorToRight") return { rel, operation: "deleteRight", reason: "orphan" };
    return null;
  }

  // Different on both sides: which way, and is either actually newer?
  if (mode === "mirrorToRight") return { rel, operation: "copyToRight", reason: "different" };
  if (mode === "mirrorToLeft") return { rel, operation: "copyToLeft", reason: "different" };

  const side = newerSide(entry, options);
  if (mode === "updateToRight") {
    return side === "left" ? { rel, operation: "copyToRight", reason: "newer" } : null;
  }
  if (mode === "updateToLeft") {
    return side === "right" ? { rel, operation: "copyToLeft", reason: "newer" } : null;
  }

  // Two-way: whichever side is newer wins. Neither being newer is a genuine
  // conflict — the contents differ but the clocks agree — and is left for a person.
  if (side === "left") return { rel, operation: "copyToRight", reason: "newer" };
  if (side === "right") return { rel, operation: "copyToLeft", reason: "newer" };
  return null;
}

/** Which side is newer, or null when they are the same age within the tolerance. */
export function newerSide(
  entry: Pick<DirectoryEntry, "leftModified" | "rightModified">,
  options: SyncOptions = {},
): "left" | "right" | null {
  const left = entry.leftModified;
  const right = entry.rightModified;
  if (left === null || right === null) return null;

  const difference = left - right;
  const magnitude = Math.abs(difference);
  const tolerance = options.toleranceMs ?? DEFAULT_TOLERANCE;
  if (magnitude <= tolerance) return null;

  // A difference of almost exactly an hour (or two) is a clock shift, not an edit.
  if (options.allowDaylightShift) {
    const hours = magnitude / DST_TOLERANCE;
    const nearest = Math.round(hours);
    if (nearest >= 1 && nearest <= 2 && Math.abs(hours - nearest) * DST_TOLERANCE <= tolerance) {
      return null;
    }
  }

  return difference > 0 ? "left" : "right";
}

/** The plan grouped by operation, which is how it is applied and how it is counted. */
export function groupByOperation(plan: SyncPlan): { operation: FileOperation; relatives: string[] }[] {
  const groups = new Map<FileOperation, string[]>();
  for (const action of plan.actions) {
    const list = groups.get(action.operation);
    if (list) list.push(action.rel);
    else groups.set(action.operation, [action.rel]);
  }
  // In the order they must run: copies before deletions.
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([operation, relatives]) => ({ operation, relatives }));
}
