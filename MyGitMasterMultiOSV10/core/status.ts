export type PathStatus = {
  staged: string | null;
  workTree: string | null;
  unpushed: boolean;
};

export const EMPTY_STATUS: PathStatus = { staged: null, workTree: null, unpushed: false };

const IGNORED = "Ignored";

const UNMERGED = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

export function statusFromPorcelain(xy: string): PathStatus {
  if (xy === "??") return { staged: null, workTree: "Untracked", unpushed: false };
  if (xy === "!!") return { staged: null, workTree: IGNORED, unpushed: false };
  if (UNMERGED.has(xy)) return { staged: "Conflicted", workTree: "Conflicted", unpushed: false };
  const index = xy[0] === " " ? null : label(xy[0]);
  const work = xy[1] === " " ? null : label(xy[1]);
  return { staged: index, workTree: work, unpushed: false };
}

export function mergeStatus(current: PathStatus | undefined, incoming: PathStatus): PathStatus {
  if (!hasChanges(incoming)) return current ?? EMPTY_STATUS;
  if (!current || !hasChanges(current)) return incoming;
  return {
    staged: pick(current.staged, incoming.staged),
    workTree: pick(current.workTree, incoming.workTree),
    unpushed: current.unpushed || incoming.unpushed,
  };
}

export function hasChanges(status: PathStatus): boolean {
  return Boolean(status.staged || status.workTree || status.unpushed);
}

export function badgeOf(status: PathStatus): string {
  if (isIgnoredOnly(status)) return "X";
  if (status.workTree) {
    switch (status.workTree) {
      case "Untracked": return "U";
      case "Deleted": return "D";
      case "Renamed": return "R";
      case "Type Changed": return "T";
      case "Conflicted": return "!";
      default: return "±";
    }
  }
  if (status.staged) {
    switch (status.staged) {
      case "Deleted": return "D";
      case "Renamed": return "R";
      case "Type Changed": return "T";
      default: return "±";
    }
  }
  if (status.unpushed) return "P";
  return "";
}

export function colorOf(status: PathStatus): string {
  if (isIgnoredOnly(status)) return "#64748b";
  if (status.workTree) {
    switch (status.workTree) {
      case "Untracked": return "#059669";
      case "Deleted":
      case "Conflicted": return "#dc2626";
      case "Mixed": return "#d97706";
      default: return "#2563eb";
    }
  }
  if (status.staged) return "#7c3aed";
  if (status.unpushed) return "#dc2626";
  return "#64748b";
}

export function isIgnoredOnly(status: PathStatus): boolean {
  return status.workTree === IGNORED && !status.staged;
}

export type WorkCounts = {
  staged: number;
  modified: number;
  deleted: number;
  untracked: number;
  conflicted: number;
  unpushed: number;
};

export function countWork(files: Iterable<PathStatus>): WorkCounts {
  const counts: WorkCounts = { staged: 0, modified: 0, deleted: 0, untracked: 0, conflicted: 0, unpushed: 0 };
  for (const status of files) {
    if (status.staged && status.staged !== "Conflicted") counts.staged += 1;
    if (status.staged === "Conflicted" || status.workTree === "Conflicted") counts.conflicted += 1;
    else if (status.workTree === "Untracked") counts.untracked += 1;
    else if (status.workTree === "Deleted") counts.deleted += 1;
    else if (status.workTree && status.workTree !== IGNORED) counts.modified += 1;
    if (status.unpushed) counts.unpushed += 1;
  }
  return counts;
}

export function parseAheadBehind(text: string): { ahead: number; behind: number } {
  const [ahead, behind] = text.trim().split(/\s+/).map((item) => Number(item));
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

function label(code: string): string | null {
  switch (code) {
    case "M": return "Modified";
    case "A": return "Added";
    case "D": return "Deleted";
    case "R": return "Renamed";
    case "C": return "Renamed";
    case "T": return "Type Changed";
    case "U": return "Conflicted";
    case "?": return "Untracked";
    case "!": return IGNORED;
    default: return code.trim() ? "Modified" : null;
  }
}

function pick(current: string | null, incoming: string | null): string | null {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current.toLowerCase() === incoming.toLowerCase()) return current;
  return "Mixed";
}
