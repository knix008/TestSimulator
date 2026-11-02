/**
 * Reads a file git already left conflicted.
 *
 *   <<<<<<< HEAD          local
 *   ...local lines...
 *   ||||||| merged common ancestors   (only with merge.conflictStyle=diff3)
 *   ...base lines...
 *   =======
 *   ...remote lines...
 *   >>>>>>> feature       remote
 *
 * Ported from the WinForms build's `Core/ConflictMarkerParser.cs`.
 */
import { conflictHunk, type MergeDocument, type MergeRegion } from "./mergeDocument.js";

const LOCAL = "<<<<<<<";
const BASE = "|||||||";
const SPLIT = "=======";
const REMOTE = ">>>>>>>";

export function containsConflictMarkers(lines: readonly string[]): boolean {
  return lines.some((line) => isMarker(line, LOCAL));
}

export function parse(
  lines: readonly string[],
  options?: { newline?: "\n" | "\r\n"; trailingNewline?: boolean },
): MergeDocument {
  const regions: MergeRegion[] = [];
  let clean: string[] = [];
  let index = 0;

  const flush = () => {
    if (clean.length === 0) return;
    regions.push({ kind: "clean", lines: clean });
    clean = [];
  };

  while (index < lines.length) {
    if (!isMarker(lines[index], LOCAL)) {
      clean.push(lines[index]);
      index += 1;
      continue;
    }
    flush();

    index += 1;
    const localBlock = readUntil(lines, index, [BASE, SPLIT, REMOTE]);
    const local = localBlock.lines;
    index = localBlock.next;

    let baseLines: string[] = [];
    const hasBase = index < lines.length && isMarker(lines[index], BASE);
    if (hasBase) {
      const baseBlock = readUntil(lines, index + 1, [SPLIT, REMOTE]);
      baseLines = baseBlock.lines;
      index = baseBlock.next;
    }
    if (index < lines.length && isMarker(lines[index], SPLIT)) index += 1;

    const remoteBlock = readUntil(lines, index, [REMOTE, LOCAL]);
    const remote = remoteBlock.lines;
    index = remoteBlock.next;
    if (index < lines.length && isMarker(lines[index], REMOTE)) index += 1;

    regions.push({ kind: "conflict", hunk: conflictHunk(baseLines, local, remote, hasBase) });
  }
  flush();

  return {
    regions,
    newline: options?.newline ?? "\n",
    trailingNewline: options?.trailingNewline ?? true,
  };
}

function readUntil(lines: readonly string[], start: number, stops: string[]): { lines: string[]; next: number } {
  const result: string[] = [];
  let index = start;
  while (index < lines.length && !stops.some((marker) => isMarker(lines[index], marker))) {
    result.push(lines[index]);
    index += 1;
  }
  return { lines: result, next: index };
}

/** A marker line is the token alone, or the token followed by a label. */
function isMarker(line: string, marker: string): boolean {
  return line === marker || line.startsWith(`${marker} `);
}
