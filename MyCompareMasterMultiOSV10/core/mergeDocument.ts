/**
 * The merge model: a file split into clean regions and conflict hunks.
 *
 * Both entry points produce the same shape — `threeWay.ts` builds it by diffing
 * BASE/LOCAL/REMOTE, `conflictMarkers.ts` builds it from a file git already left
 * conflicted — so the UI, the result builder and the save path never need to know
 * which one was used.
 *
 * The model is plain data (no classes, no cycles) because it travels over the API as
 * JSON and the renderer owns the resolution state from then on.
 */

export type ConflictResolution = "unresolved" | "base" | "local" | "remote" | "both" | "edited";

export type ConflictHunk = {
  baseLines: string[];
  localLines: string[];
  remoteLines: string[];
  /** False for a conflict file written without `merge.conflictStyle=diff3`. */
  hasBase: boolean;
  resolution: ConflictResolution;
  /** Set when the user edited the resolved text by hand; `resolution` is then `edited`. */
  editedLines: string[] | null;
};

export type MergeRegion =
  | { kind: "clean"; lines: string[] }
  | { kind: "conflict"; hunk: ConflictHunk };

export type MergeDocument = {
  regions: MergeRegion[];
  /** Line ending of the source, reused when the result is written back. */
  newline: "\n" | "\r\n";
  /** True when the source ended with a newline, so saving does not add or drop one. */
  trailingNewline: boolean;
};

export function emptyDocument(newline: "\n" | "\r\n" = "\n"): MergeDocument {
  return { regions: [], newline, trailingNewline: true };
}

export function conflictHunk(
  baseLines: string[],
  localLines: string[],
  remoteLines: string[],
  hasBase: boolean,
): ConflictHunk {
  return { baseLines, localLines, remoteLines, hasBase, resolution: "unresolved", editedLines: null };
}

export function conflicts(document: MergeDocument): ConflictHunk[] {
  const list: ConflictHunk[] = [];
  for (const region of document.regions) if (region.kind === "conflict") list.push(region.hunk);
  return list;
}

export function conflictCount(document: MergeDocument): number {
  return conflicts(document).length;
}

export function resolvedCount(document: MergeDocument): number {
  return conflicts(document).filter((hunk) => hunk.resolution !== "unresolved").length;
}

export function isFullyResolved(document: MergeDocument): boolean {
  return conflicts(document).every((hunk) => hunk.resolution !== "unresolved");
}

/** The lines a hunk contributes to the result, given its current resolution. */
export function resolvedLines(hunk: ConflictHunk): string[] {
  switch (hunk.resolution) {
    case "base": return [...hunk.baseLines];
    case "local": return [...hunk.localLines];
    case "remote": return [...hunk.remoteLines];
    case "both": return [...hunk.localLines, ...hunk.remoteLines];
    case "edited": return [...(hunk.editedLines ?? [])];
    default: return markerLines(hunk);
  }
}

/** What an unresolved hunk writes out: the familiar git conflict block. */
export function markerLines(hunk: ConflictHunk): string[] {
  const lines = ["<<<<<<< LOCAL", ...hunk.localLines];
  if (hunk.hasBase) lines.push("||||||| BASE", ...hunk.baseLines);
  lines.push("=======", ...hunk.remoteLines, ">>>>>>> REMOTE");
  return lines;
}

export function buildResultLines(document: MergeDocument): string[] {
  const result: string[] = [];
  for (const region of document.regions) {
    if (region.kind === "conflict") result.push(...resolvedLines(region.hunk));
    else result.push(...region.lines);
  }
  return result;
}

export function buildResultText(document: MergeDocument): string {
  const text = buildResultLines(document).join(document.newline);
  return document.trailingNewline && text.length > 0 ? text + document.newline : text;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

export type MergePaneKind = "base" | "local" | "remote" | "result";

export type MergeRow = {
  /** Null keeps the four panes aligned where one side has no line here. */
  text: string | null;
  /** 1-based line number within that pane's own content, or null for padding. */
  lineNo: number | null;
  /** Index into `document.regions`, so a click can find its conflict. */
  region: number;
  /** Sequential conflict number (0-based) or null inside a clean region. */
  conflict: number | null;
  kind: "clean" | "conflict" | "resolved" | "pad";
};

export type MergeRows = Record<MergePaneKind, MergeRow[]>;

/**
 * Lays the four panes out line-for-line.
 *
 * Clean regions appear identically in all four. A conflict contributes each side's own
 * lines, padded with blanks to the height of the tallest side so the panes never drift
 * apart — the same trick the two-way view uses for added and removed lines.
 */
export function layout(document: MergeDocument): MergeRows {
  const rows: MergeRows = { base: [], local: [], remote: [], result: [] };
  const counters: Record<MergePaneKind, number> = { base: 0, local: 0, remote: 0, result: 0 };
  let conflictIndex = -1;

  const push = (pane: MergePaneKind, text: string | null, region: number, conflict: number | null, kind: MergeRow["kind"]) => {
    const lineNo = text === null ? null : (counters[pane] += 1);
    rows[pane].push({ text, lineNo, region, conflict, kind });
  };

  document.regions.forEach((region, index) => {
    if (region.kind === "clean") {
      for (const line of region.lines) {
        for (const pane of ["base", "local", "remote", "result"] as const) push(pane, line, index, null, "clean");
      }
      return;
    }

    conflictIndex += 1;
    const hunk = region.hunk;
    const result = resolvedLines(hunk);
    const base = hunk.hasBase ? hunk.baseLines : [];
    const height = Math.max(base.length, hunk.localLines.length, hunk.remoteLines.length, result.length, 1);
    const kind: MergeRow["kind"] = hunk.resolution === "unresolved" ? "conflict" : "resolved";

    for (let line = 0; line < height; line++) {
      push("base", base[line] ?? null, index, conflictIndex, base[line] === undefined ? "pad" : kind);
      push("local", hunk.localLines[line] ?? null, index, conflictIndex, hunk.localLines[line] === undefined ? "pad" : kind);
      push("remote", hunk.remoteLines[line] ?? null, index, conflictIndex, hunk.remoteLines[line] === undefined ? "pad" : kind);
      push("result", result[line] ?? null, index, conflictIndex, result[line] === undefined ? "pad" : kind);
    }
  });

  return rows;
}

/** Row index of the first row of each conflict, for Previous/Next navigation. */
export function conflictRowStarts(rows: MergeRow[]): number[] {
  const starts: number[] = [];
  let current = -1;
  rows.forEach((row, index) => {
    if (row.conflict === null || row.conflict === current) return;
    current = row.conflict;
    starts.push(index);
  });
  return starts;
}

/* ------------------------------------------------------------------ *
 * Mutation (returns new documents; the caller keeps the old one for undo)
 * ------------------------------------------------------------------ */

export function withResolution(
  document: MergeDocument,
  conflictIndex: number,
  resolution: ConflictResolution,
  editedLines: string[] | null = null,
): MergeDocument {
  let seen = -1;
  return {
    ...document,
    regions: document.regions.map((region) => {
      if (region.kind !== "conflict") return region;
      seen += 1;
      if (seen !== conflictIndex) return region;
      return { kind: "conflict", hunk: { ...region.hunk, resolution, editedLines } };
    }),
  };
}

export function withAllResolutions(document: MergeDocument, resolution: ConflictResolution): MergeDocument {
  return {
    ...document,
    regions: document.regions.map((region) =>
      region.kind === "conflict"
        ? { kind: "conflict", hunk: { ...region.hunk, resolution, editedLines: null } }
        : region),
  };
}

/** Replaces one line of a clean region — the in-place edit of the result pane. */
export function withCleanLine(
  document: MergeDocument,
  regionIndex: number,
  lineIndex: number,
  text: string,
): MergeDocument {
  return {
    ...document,
    regions: document.regions.map((region, index) => {
      if (index !== regionIndex || region.kind !== "clean") return region;
      const lines = [...region.lines];
      if (lineIndex < 0 || lineIndex >= lines.length) return region;
      lines[lineIndex] = text;
      return { kind: "clean", lines };
    }),
  };
}

/** Replaces one line of a resolved conflict, switching it to the `edited` resolution. */
export function withResolvedLine(
  document: MergeDocument,
  conflictIndex: number,
  lineIndex: number,
  text: string,
): MergeDocument {
  let seen = -1;
  return {
    ...document,
    regions: document.regions.map((region) => {
      if (region.kind !== "conflict") return region;
      seen += 1;
      if (seen !== conflictIndex) return region;
      const lines = resolvedLines(region.hunk);
      if (lineIndex < 0 || lineIndex >= lines.length) return region;
      lines[lineIndex] = text;
      return { kind: "conflict", hunk: { ...region.hunk, resolution: "edited", editedLines: lines } };
    }),
  };
}
