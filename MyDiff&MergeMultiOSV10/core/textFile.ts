/**
 * Reading and writing text files.
 *
 * The pure half — splitting lines, detecting the line ending, formatting a size —
 * lives in `text.ts` and is re-exported here, so server code has one import and the
 * browser bundle can take the pure half without pulling `node:fs` in behind it.
 */
import fs from "node:fs";
import { ApiError } from "./errors.js";
import { detectNewline, MAX_TEXT_BYTES, splitBody, stripBom } from "./text.js";

export * from "./text.js";

export type TextFile = {
  path: string;
  lines: string[];
  newline: "\n" | "\r\n";
  /** True when the file ended with a line break, so a save does not add or drop one. */
  trailingNewline: boolean;
  bytes: number;
  modified: number | null;
};

export function readTextFile(target: string): TextFile {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new ApiError(`File not found: ${target}`, "NO_FILE", 400);
  }
  if (!stat.isFile()) throw new ApiError(`Not a file: ${target}`, "NO_FILE", 400);
  if (stat.size > MAX_TEXT_BYTES) {
    throw new ApiError(`The file is too large to open as text: ${target}`, "TOO_LARGE", 400);
  }

  const text = stripBom(fs.readFileSync(target, "utf8"));
  const body = splitBody(text);
  return {
    path: target,
    lines: body.lines,
    newline: detectNewline(text),
    trailingNewline: body.trailingNewline,
    bytes: stat.size,
    modified: stat.mtimeMs,
  };
}

export function writeTextFile(
  target: string,
  lines: readonly string[],
  newline: string,
  trailingNewline: boolean,
): void {
  const text = lines.join(newline) + (trailingNewline && lines.length > 0 ? newline : "");
  try {
    fs.writeFileSync(target, text, "utf8");
  } catch (error) {
    throw new ApiError(`Could not write ${target}`, "WRITE", 500, String(error));
  }
}

export function readBytes(target: string): Uint8Array {
  try {
    return fs.readFileSync(target);
  } catch {
    throw new ApiError(`File not found: ${target}`, "NO_FILE", 400);
  }
}

/**
 * Bytes as text, never throwing.
 *
 * Decoding is lenient on purpose: a file with one bad byte in it is still a file a
 * person wants to look at, and a replacement character in the middle of a line is a
 * better answer than an error instead of the whole comparison.
 */
export function decode(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data);
}
