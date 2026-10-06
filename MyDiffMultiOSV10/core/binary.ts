import type { DiffLineKind } from "./lineDiff.js";

/** Bytes shown per hex dump row, on both sides. */
export const BYTES_PER_ROW = 16;

const SAMPLE_SIZE = 8192;

/** Heuristic binary detection: UTF-8/UTF-16 text passes, NUL bytes and noise do not. */
export function isBinary(data: Uint8Array): boolean {
  if (data.length === 0) return false;
  const length = Math.min(data.length, SAMPLE_SIZE);
  const sample = data.subarray(0, length);

  if (length >= 2) {
    if (sample[0] === 0xff && sample[1] === 0xfe) return !looksLikeUtf16(sample.subarray(2), true);
    if (sample[0] === 0xfe && sample[1] === 0xff) return !looksLikeUtf16(sample.subarray(2), false);
  }

  const utf8 = length >= 3 && sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf
    ? sample.subarray(3)
    : sample;
  if (isValidUtf8(utf8)) return false;

  let nonText = 0;
  for (let index = 0; index < length; index++) {
    const byte = sample[index];
    if (byte === 0) return true;
    if (!isAsciiTextByte(byte)) nonText += 1;
  }
  return nonText * 10 > length * 3;
}

function isValidUtf8(data: Uint8Array): boolean {
  let index = 0;
  while (index < data.length) {
    const byte = data[index];
    if (byte <= 0x7f) {
      index += 1;
      continue;
    }
    if (byte < 0xc2) return false;
    let trailing: number;
    if (byte < 0xe0) trailing = 1;
    else if (byte < 0xf0) trailing = 2;
    else if (byte < 0xf5) trailing = 3;
    else return false;

    // A sequence cut off by the sample boundary is not evidence of binary content.
    if (index + trailing >= data.length) return true;
    for (let offset = 1; offset <= trailing; offset++) {
      if ((data[index + offset] & 0xc0) !== 0x80) return false;
    }
    index += trailing + 1;
  }
  return true;
}

function looksLikeUtf16(data: Uint8Array, littleEndian: boolean): boolean {
  if (data.length < 2) return data.length === 0;
  const units = Math.floor(data.length / 2);
  let nonText = 0;
  for (let index = 0; index < units; index++) {
    const offset = index * 2;
    const code = littleEndian
      ? data[offset] | (data[offset + 1] << 8)
      : (data[offset] << 8) | data[offset + 1];
    if (code === 0) return false;
    if (!isPrintableCode(code)) nonText += 1;
  }
  return nonText * 10 <= units * 3;
}

const isAsciiTextByte = (byte: number): boolean =>
  byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126);

const isPrintableCode = (code: number): boolean =>
  code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);

export type HexSide = {
  /** 16 entries; null past the end of that side's data. */
  bytes: (number | null)[];
  ascii: string;
};

export type HexRow = {
  offset: number;
  left: HexSide;
  right: HexSide;
  /** One bit per byte column (0-15) that differs between the two sides. */
  mask: number;
  kind: DiffLineKind;
};

export type BinaryStats = {
  rowCount: number;
  kinds: DiffLineKind[];
  differentBytes: number;
  added: number;
  removed: number;
  modified: number;
};

export function binaryStats(left: Uint8Array, right: Uint8Array): BinaryStats {
  const longest = Math.max(left.length, right.length);
  const rowCount = longest === 0 ? 1 : Math.ceil(longest / BYTES_PER_ROW);
  const kinds: DiffLineKind[] = new Array(rowCount);
  let differentBytes = 0;
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (let row = 0; row < rowCount; row++) {
    const { mask, kind } = rowMetadata(left, right, row * BYTES_PER_ROW);
    kinds[row] = kind;
    differentBytes += popCount(mask);
    if (kind === "modified") modified += 1;
    else if (kind === "added") added += 1;
    else if (kind === "removed") removed += 1;
  }
  return { rowCount, kinds, differentBytes, added, removed, modified };
}

export function hexRows(left: Uint8Array, right: Uint8Array, start: number, count: number): HexRow[] {
  const rows: HexRow[] = [];
  for (let row = start; row < start + count; row++) {
    const offset = row * BYTES_PER_ROW;
    const { mask, kind } = rowMetadata(left, right, offset);
    rows.push({ offset, left: side(left, offset), right: side(right, offset), mask, kind });
  }
  return rows;
}

/** The classic 77-column hex dump line, used when rows are copied to the clipboard. */
export function hexRowText(offset: number, data: HexSide): string {
  const columns: string[] = [];
  for (let index = 0; index < BYTES_PER_ROW; index++) {
    const byte = data.bytes[index];
    columns.push(byte === null ? ".." : byte.toString(16).toUpperCase().padStart(2, "0"));
    if (index === 7) columns.push("");
  }
  return `${offset.toString(16).toUpperCase().padStart(8, "0")}  ${columns.join(" ")}  ${data.ascii}`;
}

function side(data: Uint8Array, offset: number): HexSide {
  const bytes: (number | null)[] = [];
  let ascii = "";
  for (let index = 0; index < BYTES_PER_ROW; index++) {
    const position = offset + index;
    if (position < data.length) {
      const byte = data[position];
      bytes.push(byte);
      ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
    } else {
      bytes.push(null);
      ascii += ".";
    }
  }
  return { bytes, ascii };
}

function rowMetadata(left: Uint8Array, right: Uint8Array, offset: number): { mask: number; kind: DiffLineKind } {
  let mask = 0;
  let anyLeft = false;
  let anyRight = false;
  for (let index = 0; index < BYTES_PER_ROW; index++) {
    const position = offset + index;
    const hasLeft = position < left.length;
    const hasRight = position < right.length;
    if (hasLeft) anyLeft = true;
    if (hasRight) anyRight = true;
    if (hasLeft !== hasRight || (hasLeft && left[position] !== right[position])) {
      mask |= 1 << index;
    }
  }
  return { mask, kind: classify(mask, anyLeft, anyRight) };
}

function classify(mask: number, anyLeft: boolean, anyRight: boolean): DiffLineKind {
  if (mask === 0) return "same";
  if (anyLeft && !anyRight) return "removed";
  if (anyRight && !anyLeft) return "added";
  return "modified";
}

export function popCount(value: number): number {
  let count = 0;
  let bits = value;
  while (bits !== 0) {
    count += bits & 1;
    bits >>>= 1;
  }
  return count;
}
