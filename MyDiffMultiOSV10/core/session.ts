import { BYTES_PER_ROW, binaryStats, hexRows, isBinary, type HexRow } from "./binary.js";
import {
  blockStarts,
  computeRows,
  splitLines,
  wordSpans,
  type CharSpan,
  type DiffLineKind,
  type DiffRow,
} from "./lineDiff.js";

/** Where one side of a comparison came from — a file on disk, a git blob, or nothing. */
export type SideSource = {
  /** Shown in the pane header. */
  label: string;
  /**
   * Which version of the file this side holds, shown as a badge in the pane title:
   * a short commit sha, `HEAD`, `index`, `working tree`, or a file's timestamp.
   */
  version?: string | null;
  /** Absolute path when the side is a file on disk. */
  path?: string | null;
  /** Git revision when the side is a blob (`HEAD`, a sha, `:0` for the index, ...). */
  revision?: string | null;
  /** True when the side does not exist (added or deleted file). */
  missing?: boolean;
  data: Uint8Array;
};

export type SessionOrigin = {
  kind: "files" | "git";
  /** One line describing the comparison, e.g. `HEAD -> working tree`. */
  detail: string;
  /** Repository-relative path for git sessions. */
  file?: string;
};

export type OverviewBucket = { kind: DiffLineKind; row: number };

export type TextRow = {
  index: number;
  kind: DiffLineKind;
  left: string | null;
  right: string | null;
  leftNo: number | null;
  rightNo: number | null;
  leftSpans?: CharSpan[];
  rightSpans?: CharSpan[];
};

export type SessionSummary = {
  id: number;
  mode: "text" | "binary";
  rowCount: number;
  added: number;
  removed: number;
  modified: number;
  differentBytes: number;
  identical: boolean;
  blocks: number[];
  overview: OverviewBucket[];
  left: SideSummary;
  right: SideSummary;
  origin: SessionOrigin;
};

export type SideSummary = {
  label: string;
  /** Version badge for the pane title (short sha, `HEAD`, `index`, timestamp, ...). */
  version: string | null;
  path: string | null;
  revision: string | null;
  missing: boolean;
  bytes: number;
  lines: number;
};

/** Overview bar resolution — one bucket per strip pixel is plenty. */
const OVERVIEW_BUCKETS = 1600;
const MAX_BLOCKS = 20_000;
const MAX_WINDOW = 2000;

let nextId = 1;

/**
 * One loaded comparison. Rows are handed out in windows so a multi-million-line file
 * costs one scan on load instead of a giant payload per request.
 */
export class DiffSession {
  readonly id = nextId++;
  readonly mode: "text" | "binary";
  readonly origin: SessionOrigin;

  private readonly left: SideSource;
  private readonly right: SideSource;
  private readonly textRows: DiffRow[];
  private readonly kinds: DiffLineKind[];
  private readonly counts: { added: number; removed: number; modified: number; differentBytes: number };
  private readonly leftLines: number;
  private readonly rightLines: number;

  constructor(left: SideSource, right: SideSource, origin: SessionOrigin) {
    this.left = left;
    this.right = right;
    this.origin = origin;
    this.mode = isBinary(left.data) || isBinary(right.data) ? "binary" : "text";

    if (this.mode === "binary") {
      const stats = binaryStats(left.data, right.data);
      this.textRows = [];
      this.kinds = stats.kinds;
      this.counts = {
        added: stats.added,
        removed: stats.removed,
        modified: stats.modified,
        differentBytes: stats.differentBytes,
      };
      this.leftLines = Math.ceil(left.data.length / BYTES_PER_ROW);
      this.rightLines = Math.ceil(right.data.length / BYTES_PER_ROW);
    } else {
      const leftLines = splitLines(decode(left.data));
      const rightLines = splitLines(decode(right.data));
      this.textRows = computeRows(leftLines, rightLines);
      this.kinds = this.textRows.map((row) => row.kind);
      let added = 0;
      let removed = 0;
      let modified = 0;
      for (const kind of this.kinds) {
        if (kind === "added") added += 1;
        else if (kind === "removed") removed += 1;
        else if (kind === "modified") modified += 1;
      }
      this.counts = { added, removed, modified, differentBytes: 0 };
      this.leftLines = leftLines.length;
      this.rightLines = rightLines.length;
    }
  }

  get rowCount(): number {
    return this.kinds.length;
  }

  summary(): SessionSummary {
    const blocks = blockStarts(this.kinds);
    return {
      id: this.id,
      mode: this.mode,
      rowCount: this.rowCount,
      added: this.counts.added,
      removed: this.counts.removed,
      modified: this.counts.modified,
      differentBytes: this.counts.differentBytes,
      identical: blocks.length === 0,
      blocks: blocks.slice(0, MAX_BLOCKS),
      overview: this.overview(),
      left: this.side(this.left, this.leftLines),
      right: this.side(this.right, this.rightLines),
      origin: this.origin,
    };
  }

  /** Text rows for `[start, start + count)`, with word-level spans on modified rows. */
  rows(start: number, count: number): TextRow[] {
    if (this.mode !== "text") return [];
    const from = clamp(start, 0, this.rowCount);
    const to = clamp(from + clamp(count, 0, MAX_WINDOW), 0, this.rowCount);
    const rows: TextRow[] = [];
    for (let index = from; index < to; index++) {
      const row = this.textRows[index];
      const item: TextRow = {
        index,
        kind: row.kind,
        left: row.left,
        right: row.right,
        leftNo: row.leftNo,
        rightNo: row.rightNo,
      };
      if (row.kind === "modified" && row.left !== null && row.right !== null) {
        const spans = wordSpans(row.left, row.right);
        if (spans.left.length > 0 || spans.right.length > 0) {
          item.leftSpans = spans.left;
          item.rightSpans = spans.right;
        }
      }
      rows.push(item);
    }
    return rows;
  }

  /** Hex dump rows for `[start, start + count)`. */
  hex(start: number, count: number): HexRow[] {
    if (this.mode !== "binary") return [];
    const from = clamp(start, 0, this.rowCount);
    const to = clamp(from + clamp(count, 0, MAX_WINDOW), 0, this.rowCount);
    return hexRows(this.left.data, this.right.data, from, to - from);
  }

  /** Plain text of a row range, for clipboard copies. */
  text(side: "left" | "right", start: number, count: number): string {
    const from = clamp(start, 0, this.rowCount);
    const to = clamp(from + clamp(count, 0, MAX_WINDOW), 0, this.rowCount);
    if (this.mode === "text") {
      const lines: string[] = [];
      for (let index = from; index < to; index++) {
        lines.push((side === "left" ? this.textRows[index].left : this.textRows[index].right) ?? "");
      }
      return lines.join("\n");
    }
    const rows = hexRows(this.left.data, this.right.data, from, to - from);
    return rows.map((row) => hexLine(row, side)).join("\n");
  }

  private side(source: SideSource, lines: number): SideSummary {
    return {
      label: source.label,
      version: source.version ?? null,
      path: source.path ?? null,
      revision: source.revision ?? null,
      missing: Boolean(source.missing),
      bytes: source.data.length,
      lines,
    };
  }

  private overview(): OverviewBucket[] {
    const total = this.rowCount;
    if (total === 0) return [];
    const buckets = Math.min(total, OVERVIEW_BUCKETS);
    const result: OverviewBucket[] = [];
    for (let bucket = 0; bucket < buckets; bucket++) {
      const from = Math.floor((bucket * total) / buckets);
      const to = Math.max(from + 1, Math.floor(((bucket + 1) * total) / buckets));
      let kind: DiffLineKind = "same";
      for (let index = from; index < to && index < total; index++) {
        const current = this.kinds[index];
        if (current === "same") continue;
        if (current === "removed" || kind === "same") kind = current;
        else if (current === "added" && kind === "modified") kind = current;
        if (kind === "removed") break;
      }
      if (kind !== "same") result.push({ kind, row: from });
    }
    return result;
  }
}

function hexLine(row: HexRow, side: "left" | "right"): string {
  const data = side === "left" ? row.left : row.right;
  const columns = data.bytes.map((byte) => (byte === null ? ".." : byte.toString(16).toUpperCase().padStart(2, "0")));
  return `${row.offset.toString(16).toUpperCase().padStart(8, "0")}  ${columns.join(" ")}  ${data.ascii}`;
}

function decode(data: Uint8Array): string {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(data.subarray(2));
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(data.subarray(2));
  }
  const text = new TextDecoder("utf-8").decode(data);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
