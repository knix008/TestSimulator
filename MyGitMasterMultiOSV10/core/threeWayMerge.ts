import { computeRows } from "./lineDiff.js";

export type Resolution = "unresolved" | "base" | "local" | "remote" | "both";

export type MergeConflict = {
  base: string[];
  local: string[];
  remote: string[];
};

export type MergeRegion =
  | { kind: "clean"; lines: string[] }
  | { kind: "conflict"; conflict: MergeConflict };

export type MergeDocument = {
  regions: MergeRegion[];
  trailingNewline: boolean;
};

export function mergeTexts(baseText: string, localText: string, remoteText: string): MergeDocument {
  const base = fileLines(baseText);
  const local = fileLines(localText);
  const remote = fileLines(remoteText);
  return {
    regions: mergeLines(base.lines, local.lines, remote.lines),
    trailingNewline: base.newline || local.newline || remote.newline,
  };
}

export function conflictCount(document: MergeDocument): number {
  return document.regions.filter((region) => region.kind === "conflict").length;
}

export function buildResult(document: MergeDocument, choices: readonly Resolution[]): string {
  const lines: string[] = [];
  let conflict = 0;
  for (const region of document.regions) {
    if (region.kind === "clean") {
      lines.push(...region.lines);
      continue;
    }
    lines.push(...resolvedLines(region.conflict, choices[conflict] ?? "unresolved"));
    conflict += 1;
  }
  const text = lines.join("\n");
  if (!text) return document.trailingNewline ? "\n" : "";
  return document.trailingNewline ? `${text}\n` : text;
}

function resolvedLines(conflict: MergeConflict, choice: Resolution): string[] {
  if (choice === "base") return conflict.base;
  if (choice === "local") return conflict.local;
  if (choice === "remote") return conflict.remote;
  if (choice === "both") return [...conflict.local, ...conflict.remote];
  return [
    "<<<<<<< LOCAL",
    ...conflict.local,
    "||||||| BASE",
    ...conflict.base,
    "=======",
    ...conflict.remote,
    ">>>>>>> REMOTE",
  ];
}

function mergeLines(base: string[], local: string[], remote: string[]): MergeRegion[] {
  const localMatches = matchMap(base, local);
  const remoteMatches = matchMap(base, remote);
  const anchors = [-1, ...[...localMatches.keys()].filter((index) => remoteMatches.has(index)).sort((a, b) => a - b), base.length];
  const regions: MergeRegion[] = [];
  for (let index = 0; index < anchors.length - 1; index++) {
    const previousBase = anchors[index];
    const currentBase = anchors[index + 1];
    const currentIsAnchor = currentBase < base.length;
    const previousLocal = previousBase < 0 ? -1 : localMatches.get(previousBase) ?? -1;
    const previousRemote = previousBase < 0 ? -1 : remoteMatches.get(previousBase) ?? -1;
    const currentLocal = currentIsAnchor ? localMatches.get(currentBase) ?? local.length : local.length;
    const currentRemote = currentIsAnchor ? remoteMatches.get(currentBase) ?? remote.length : remote.length;
    appendSlice(
      regions,
      slice(base, previousBase + 1, currentBase),
      slice(local, previousLocal + 1, currentLocal),
      slice(remote, previousRemote + 1, currentRemote),
    );
    if (currentIsAnchor) regions.push({ kind: "clean", lines: [base[currentBase]] });
  }
  return regions.filter((region) => region.kind === "conflict" || region.lines.length > 0);
}

function appendSlice(regions: MergeRegion[], base: string[], local: string[], remote: string[]): void {
  if (!base.length && !local.length && !remote.length) return;
  const localUnchanged = sameLines(base, local);
  const remoteUnchanged = sameLines(base, remote);
  if (localUnchanged && remoteUnchanged) {
    if (base.length) regions.push({ kind: "clean", lines: base });
    return;
  }
  if (remoteUnchanged) {
    if (local.length) regions.push({ kind: "clean", lines: local });
    return;
  }
  if (localUnchanged) {
    if (remote.length) regions.push({ kind: "clean", lines: remote });
    return;
  }
  if (sameLines(local, remote)) {
    if (local.length) regions.push({ kind: "clean", lines: local });
    return;
  }
  regions.push({ kind: "conflict", conflict: { base, local, remote } });
}

function matchMap(base: string[], other: string[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of computeRows(base, other)) {
    if (row.kind === "same" && row.leftNo && row.rightNo) map.set(row.leftNo - 1, row.rightNo - 1);
  }
  return map;
}

function slice(lines: string[], start: number, end: number): string[] {
  const from = Math.max(0, start);
  const to = Math.min(lines.length, end);
  return from >= to ? [] : lines.slice(from, to);
}

function sameLines(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => line === right[index]);
}

function fileLines(text: string): { lines: string[]; newline: boolean } {
  if (!text) return { lines: [], newline: false };
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newline = normalized.endsWith("\n");
  const body = newline ? normalized.slice(0, -1) : normalized;
  return { lines: body.length ? body.split("\n") : [], newline };
}

export function displayLines(text: string): string[] {
  return fileLines(text).lines;
}
