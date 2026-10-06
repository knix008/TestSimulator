/**
 * Classic diff3-style 3-way merge.
 *
 * Lines of BASE that align unchanged with both LOCAL and REMOTE (by LCS against each)
 * are sync anchors. Every slice between two anchors is then decided on its own:
 *
 *   - neither side touched it            → keep base
 *   - exactly one side touched it        → keep that side (a clean, automatic merge)
 *   - both sides made the same change    → keep it once
 *   - both sides changed it differently  → a conflict hunk for the user to resolve
 *
 * Ported from the WinForms build's `Core/ThreeWayDiff.cs`, so the two produce the same
 * hunks for the same inputs.
 */
import { conflictHunk, type MergeDocument, type MergeRegion } from "./mergeDocument.js";
import { normalizeLine, type CompareOptions } from "./lineDiff.js";

export function merge(
  baseLines: readonly string[],
  localLines: readonly string[],
  remoteLines: readonly string[],
  options?: CompareOptions & { newline?: "\n" | "\r\n"; trailingNewline?: boolean },
): MergeDocument {
  const key = (line: string) => normalizeLine(line, options);
  const localMatches = lcsMatch(baseLines, localLines, key);
  const remoteMatches = lcsMatch(baseLines, remoteLines, key);

  const anchors: number[] = [-1];
  for (const index of [...localMatches.keys()].sort((a, b) => a - b)) {
    if (remoteMatches.has(index)) anchors.push(index);
  }
  anchors.push(baseLines.length);

  const regions: MergeRegion[] = [];

  for (let position = 0; position < anchors.length - 1; position++) {
    const previousBase = anchors[position];
    const currentBase = anchors[position + 1];
    const isRealAnchor = currentBase < baseLines.length;

    const previousLocal = previousBase === -1 ? -1 : (localMatches.get(previousBase) as number);
    const previousRemote = previousBase === -1 ? -1 : (remoteMatches.get(previousBase) as number);
    const currentLocal = isRealAnchor ? (localMatches.get(currentBase) as number) : localLines.length;
    const currentRemote = isRealAnchor ? (remoteMatches.get(currentBase) as number) : remoteLines.length;

    appendSlice(
      regions,
      baseLines.slice(previousBase + 1, currentBase),
      localLines.slice(previousLocal + 1, currentLocal),
      remoteLines.slice(previousRemote + 1, currentRemote),
      key,
    );

    if (isRealAnchor) appendClean(regions, [baseLines[currentBase]]);
  }

  return {
    regions,
    newline: options?.newline ?? "\n",
    trailingNewline: options?.trailingNewline ?? true,
  };
}

function appendSlice(
  regions: MergeRegion[],
  base: string[],
  local: string[],
  remote: string[],
  key: (line: string) => string,
): void {
  if (base.length === 0 && local.length === 0 && remote.length === 0) return;

  const localUnchanged = sameLines(base, local, key);
  const remoteUnchanged = sameLines(base, remote, key);

  if (localUnchanged && remoteUnchanged) {
    appendClean(regions, base);
    return;
  }
  if (remoteUnchanged) {
    appendClean(regions, local);
    return;
  }
  if (localUnchanged) {
    appendClean(regions, remote);
    return;
  }
  if (sameLines(local, remote, key)) {
    appendClean(regions, local);
    return;
  }
  regions.push({ kind: "conflict", hunk: conflictHunk(base, local, remote, true) });
}

/** Clean lines merge into the previous clean region, so the model stays compact. */
function appendClean(regions: MergeRegion[], lines: string[]): void {
  if (lines.length === 0) return;
  const last = regions[regions.length - 1];
  if (last && last.kind === "clean") last.lines.push(...lines);
  else regions.push({ kind: "clean", lines: [...lines] });
}

function sameLines(a: readonly string[], b: readonly string[], key: (line: string) => string): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index] && key(a[index]) !== key(b[index])) return false;
  }
  return true;
}

/**
 * Longest common subsequence alignment between base and one side: a map of
 * baseIndex → otherIndex for the matched lines.
 *
 * The exact DP is quadratic, which is fine for the conflicted files this tool is
 * pointed at but not for a 100k-line pair, so past the budget the two sides are
 * aligned on lines that occur exactly once on both — the same patience anchoring the
 * two-way view uses.
 */
const LCS_BUDGET = 16_000_000;

export function lcsMatch(
  baseLines: readonly string[],
  otherLines: readonly string[],
  key: (line: string) => string = (line) => line,
): Map<number, number> {
  const n = baseLines.length;
  const m = otherLines.length;
  const matches = new Map<number, number>();
  if (n === 0 || m === 0) return matches;

  const a = baseLines.map(key);
  const b = otherLines.map(key);
  if (n * m > LCS_BUDGET) return uniqueMatch(a, b);

  const width = m + 1;
  const lengths = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] = a[i] === b[j]
        ? lengths[(i + 1) * width + j + 1] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matches.set(i, j);
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

/** Fallback for very large inputs: increasing run of lines unique to both sides. */
function uniqueMatch(a: readonly string[], b: readonly string[]): Map<number, number> {
  const firstA = new Map<string, number>();
  for (let index = 0; index < a.length; index++) firstA.set(a[index], firstA.has(a[index]) ? -1 : index);
  const firstB = new Map<string, number>();
  for (let index = 0; index < b.length; index++) firstB.set(b[index], firstB.has(b[index]) ? -1 : index);

  const matches = new Map<number, number>();
  let lastB = -1;
  for (let index = 0; index < a.length; index++) {
    if (firstA.get(a[index]) !== index) continue;
    const other = firstB.get(a[index]);
    if (other === undefined || other < 0 || other <= lastB) continue;
    matches.set(index, other);
    lastB = other;
  }
  return matches;
}
