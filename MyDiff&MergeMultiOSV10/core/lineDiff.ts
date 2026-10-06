/**
 * Two-way line diff: align the left and right line lists on matching (unchanged) lines,
 * then classify each gap between anchors as removed-only (left has lines, right does not),
 * added-only (right has lines, left does not), or modified (both sides have lines in the
 * gap, paired index-for-index so the two panes stay line-for-line aligned).
 */
import type { TableOptions } from "./csv.js";
import type { FormatId } from "./formats.js";

export type DiffLineKind = "same" | "added" | "removed" | "modified";

/** One aligned row across the two panes. A `null` side keeps the panes vertically aligned. */
export type DiffRow = {
  left: string | null;
  right: string | null;
  /** 1-based source line numbers, or null on a blank side. */
  leftNo: number | null;
  rightNo: number | null;
  kind: DiffLineKind;
};

export type DiffDocument = {
  rows: DiffRow[];
  added: number;
  removed: number;
  modified: number;
  /** Row indexes where a run of differences starts — what Prev/Next difference walks. */
  diffBlocks: number[];
};

/** Alignment is exact up to this many cells; larger blocks fall back to anchor pairing. */
const LCS_BUDGET = 4_000_000;

/** How strictly two lines have to match to count as unchanged. */
export type CompareOptions = {
  /** Collapse runs of whitespace and trim the ends before comparing. */
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  /** Read both sides as bytes even if they are perfectly good text. */
  forceHex?: boolean;
  /** A line that differs only in its comments is not a difference. */
  ignoreComments?: boolean;
  /** `'a'` and `"a"` are the same string. */
  ignoreQuoteStyle?: boolean;
  /** `0x10` and `16` are the same number. */
  ignoreNumberFormat?: boolean;
  /** Read the pair through a format reader instead of as plain text. */
  format?: FormatId;
  /** How a table is read, when the format is `table`. */
  table?: TableOptions;
};

/**
 * The text actually compared for a line. The row keeps the original text — only the
 * alignment keys go through here, so "ignore whitespace" changes what counts as equal
 * without changing what is displayed.
 */
export function normalizeLine(line: string, options: CompareOptions | undefined): string {
  let value = line;
  if (options?.ignoreWhitespace) value = value.replace(/\s+/g, " ").trim();
  if (options?.ignoreCase) value = value.toLowerCase();
  return value;
}

export function linesEqual(a: string, b: string, options?: CompareOptions): boolean {
  return a === b || (Boolean(options?.ignoreWhitespace || options?.ignoreCase)
    && normalizeLine(a, options) === normalizeLine(b, options));
}

export function computeRows(
  left: readonly string[],
  right: readonly string[],
  options?: CompareOptions,
  /**
   * The text each line is *aligned* by, when it is not the line itself. The grammar
   * rules need the whole file to work out — a block comment runs across lines — so
   * they are applied by the caller and handed in here, while the rows still carry
   * the original text. Nothing displayed is ever changed by an ignore rule.
   */
  keys?: { left: readonly string[]; right: readonly string[] },
): DiffRow[] {
  const loose = Boolean(options?.ignoreWhitespace || options?.ignoreCase);
  const leftKeys = keys?.left
    ?? (loose ? left.map((line) => normalizeLine(line, options)) : left);
  const rightKeys = keys?.right
    ?? (loose ? right.map((line) => normalizeLine(line, options)) : right);
  const leftIds = intern(leftKeys);
  const rightIds = intern(rightKeys, leftIds.table);
  const pairs: number[] = [];
  align(leftIds.ids, rightIds.ids, 0, left.length, 0, right.length, pairs);

  const rows: DiffRow[] = [];
  let li = 0;
  let ri = 0;
  for (let index = 0; index < pairs.length; index += 2) {
    const leftIndex = pairs[index];
    const rightIndex = pairs[index + 1];
    appendGap(rows, left, right, li, leftIndex, ri, rightIndex);
    rows.push({
      left: left[leftIndex],
      right: right[rightIndex],
      leftNo: leftIndex + 1,
      rightNo: rightIndex + 1,
      kind: "same",
    });
    li = leftIndex + 1;
    ri = rightIndex + 1;
  }
  appendGap(rows, left, right, li, left.length, ri, right.length);
  return rows;
}

export function documentFromLines(
  left: readonly string[],
  right: readonly string[],
  options?: CompareOptions,
): DiffDocument {
  return documentFromRows(computeRows(left, right, options));
}

export function documentFromRows(rows: DiffRow[]): DiffDocument {
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const row of rows) {
    if (row.kind === "added") added += 1;
    else if (row.kind === "removed") removed += 1;
    else if (row.kind === "modified") modified += 1;
  }
  return { rows, added, removed, modified, diffBlocks: blockStarts(rows.map((row) => row.kind)) };
}

export function hasDifferences(document: DiffDocument): boolean {
  return document.added > 0 || document.removed > 0 || document.modified > 0;
}

/** First row index of every run of differing rows, in order. */
export function blockStarts(kinds: readonly DiffLineKind[]): number[] {
  const starts: number[] = [];
  let inBlock = false;
  for (let index = 0; index < kinds.length; index++) {
    const differs = kinds[index] !== "same";
    if (differs && !inBlock) starts.push(index);
    inBlock = differs;
  }
  return starts;
}

export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n");
}

function appendGap(
  rows: DiffRow[],
  left: readonly string[],
  right: readonly string[],
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): void {
  const leftCount = leftEnd - leftStart;
  const rightCount = rightEnd - rightStart;
  const pairCount = Math.min(leftCount, rightCount);

  for (let index = 0; index < pairCount; index++) {
    rows.push({
      left: left[leftStart + index],
      right: right[rightStart + index],
      leftNo: leftStart + index + 1,
      rightNo: rightStart + index + 1,
      kind: "modified",
    });
  }
  for (let index = pairCount; index < leftCount; index++) {
    rows.push({
      left: left[leftStart + index],
      right: null,
      leftNo: leftStart + index + 1,
      rightNo: null,
      kind: "removed",
    });
  }
  for (let index = pairCount; index < rightCount; index++) {
    rows.push({
      left: null,
      right: right[rightStart + index],
      leftNo: null,
      rightNo: rightStart + index + 1,
      kind: "added",
    });
  }
}

/**
 * Patience-style alignment: trim the common prefix/suffix, anchor on lines that appear
 * exactly once on both sides, and recurse between anchors. Blocks with no unique anchor
 * fall back to an exact LCS while they fit the budget.
 */
function align(
  a: Int32Array,
  b: Int32Array,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  out: number[],
): void {
  let head = aStart;
  let bHead = bStart;
  while (head < aEnd && bHead < bEnd && a[head] === b[bHead]) {
    out.push(head, bHead);
    head += 1;
    bHead += 1;
  }

  let tail = aEnd;
  let bTail = bEnd;
  const suffix: number[] = [];
  while (tail > head && bTail > bHead && a[tail - 1] === b[bTail - 1]) {
    tail -= 1;
    bTail -= 1;
    suffix.push(tail, bTail);
  }

  if (head < tail && bHead < bTail) {
    const anchors = uniqueAnchors(a, b, head, tail, bHead, bTail);
    if (anchors.length === 0) {
      lcsMatch(a, b, head, tail, bHead, bTail, out);
    } else {
      let aCursor = head;
      let bCursor = bHead;
      for (let index = 0; index < anchors.length; index += 2) {
        const ai = anchors[index];
        const bi = anchors[index + 1];
        align(a, b, aCursor, ai, bCursor, bi, out);
        out.push(ai, bi);
        aCursor = ai + 1;
        bCursor = bi + 1;
      }
      align(a, b, aCursor, tail, bCursor, bTail, out);
    }
  }

  for (let index = suffix.length - 2; index >= 0; index -= 2) {
    out.push(suffix[index], suffix[index + 1]);
  }
}

/** Longest increasing subsequence of the lines that occur exactly once in both ranges. */
function uniqueAnchors(
  a: Int32Array,
  b: Int32Array,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number[] {
  const inA = new Map<number, number>();
  for (let index = aStart; index < aEnd; index++) {
    const id = a[index];
    inA.set(id, inA.has(id) ? -1 : index);
  }
  const candidates: number[] = [];
  const inB = new Map<number, number>();
  for (let index = bStart; index < bEnd; index++) {
    const id = b[index];
    inB.set(id, inB.has(id) ? -1 : index);
  }
  for (const [id, aIndex] of inA) {
    if (aIndex < 0) continue;
    const bIndex = inB.get(id);
    if (bIndex === undefined || bIndex < 0) continue;
    candidates.push(aIndex, bIndex);
  }
  if (candidates.length === 0) return [];

  const order: number[] = [];
  for (let index = 0; index < candidates.length; index += 2) order.push(index);
  order.sort((left, right) => candidates[left] - candidates[right]);

  // Patience sorting over the b-indexes gives the longest increasing subsequence.
  const piles: number[] = [];
  const back: number[] = new Array(order.length).fill(-1);
  for (let position = 0; position < order.length; position++) {
    const bIndex = candidates[order[position] + 1];
    let low = 0;
    let high = piles.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (candidates[order[piles[middle]] + 1] < bIndex) low = middle + 1;
      else high = middle;
    }
    back[position] = low > 0 ? piles[low - 1] : -1;
    piles[low] = position;
  }

  const chain: number[] = [];
  for (let position = piles.length > 0 ? piles[piles.length - 1] : -1; position >= 0; position = back[position]) {
    chain.push(order[position]);
  }
  chain.reverse();

  const anchors: number[] = [];
  for (const index of chain) anchors.push(candidates[index], candidates[index + 1]);
  return anchors;
}

/** Exact LCS alignment, used for blocks without unique anchors. */
function lcsMatch(
  a: Int32Array,
  b: Int32Array,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  out: number[],
): void {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  if (n === 0 || m === 0) return;
  if (n * m > LCS_BUDGET) return;

  const width = m + 1;
  const lengths = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] = a[aStart + i] === b[bStart + j]
        ? lengths[(i + 1) * width + j + 1] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[aStart + i] === b[bStart + j]) {
      out.push(aStart + i, bStart + j);
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
}

/** Maps each distinct line to an integer so alignment compares numbers, not strings. */
function intern(lines: readonly string[], table = new Map<string, number>()): { ids: Int32Array; table: Map<string, number> } {
  const ids = new Int32Array(lines.length);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let id = table.get(line);
    if (id === undefined) {
      id = table.size + 1;
      table.set(line, id);
    }
    ids[index] = id;
  }
  return { ids, table };
}

export type CharSpan = { start: number; end: number };

/**
 * Character ranges that actually changed inside a modified row, so the panes can highlight
 * the edited words instead of the whole line.
 */
export function wordSpans(left: string, right: string): { left: CharSpan[]; right: CharSpan[] } {
  if (left === right) return { left: [], right: [] };
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0) return { left: [], right: right.length ? [{ start: 0, end: right.length }] : [] };
  if (rightTokens.length === 0) return { left: left.length ? [{ start: 0, end: left.length }] : [], right: [] };

  const table = new Map<string, number>();
  const leftIds = intern(leftTokens.map((token) => token.text), table);
  const rightIds = intern(rightTokens.map((token) => token.text), table);
  const pairs: number[] = [];
  align(leftIds.ids, rightIds.ids, 0, leftTokens.length, 0, rightTokens.length, pairs);

  const leftMatched = new Uint8Array(leftTokens.length);
  const rightMatched = new Uint8Array(rightTokens.length);
  for (let index = 0; index < pairs.length; index += 2) {
    leftMatched[pairs[index]] = 1;
    rightMatched[pairs[index + 1]] = 1;
  }
  return {
    left: changedSpans(leftTokens, leftMatched),
    right: changedSpans(rightTokens, rightMatched),
  };
}

type Token = { text: string; start: number; end: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    tokens.push({ text: match[0], start, end: start + match[0].length });
  }
  return tokens;
}

function changedSpans(tokens: Token[], matched: Uint8Array): CharSpan[] {
  const spans: CharSpan[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (matched[index]) continue;
    const start = tokens[index].start;
    let end = tokens[index].end;
    while (index + 1 < tokens.length && !matched[index + 1]) {
      index += 1;
      end = tokens[index].end;
    }
    spans.push({ start, end });
  }
  return spans;
}
