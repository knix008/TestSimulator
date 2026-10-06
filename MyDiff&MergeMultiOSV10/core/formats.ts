/**
 * File formats that are worth comparing as something other than their bytes.
 *
 * A table, an MP3, an executable and a registry export have nothing in common except
 * this: compared literally they are all noise, and compared as the thing they
 * represent they are all clear. So each one has a reader that turns the file into
 * lines, and the ordinary text comparison runs over those lines.
 *
 * That is the whole mechanism. A new format is a reader and an entry in the table —
 * the comparison, the highlighting, the printing and the saving all keep working,
 * because by the time they see it, it is lines.
 */
import { isBinary } from "./binary.js";
import { tableLines, type TableOptions } from "./csv.js";
import { isMp3, tagLines } from "./mp3.js";
import { isRegistryFile, registryLines } from "./registryFile.js";
import { decode, splitBody, stripBom } from "./textFile.js";
import { isPortableExecutable, versionLines } from "./versionInfo.js";

export type FormatId = "text" | "table" | "audio" | "version" | "registry";

export type FormatOptions = {
  /** Forced instead of detected — this is what a session type selects. */
  format?: FormatId;
  table?: TableOptions;
};

export type FormatName = { id: FormatId; ko: string; en: string };

export const FORMATS: FormatName[] = [
  { id: "text", ko: "텍스트", en: "Text" },
  { id: "table", ko: "표", en: "Table" },
  { id: "audio", ko: "오디오 태그", en: "Audio tags" },
  { id: "version", ko: "버전 정보", en: "Version info" },
  { id: "registry", ko: "레지스트리", en: "Registry" },
];

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === "string" && FORMATS.some((format) => format.id === value);
}

const TABLE_EXTENSIONS = new Set(["csv", "tsv", "tab", "psv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "mp2"]);
const VERSION_EXTENSIONS = new Set(["exe", "dll", "sys", "ocx", "scr", "plist"]);

/**
 * What this file is, from its name and its first bytes.
 *
 * The name is tried first because it is what the user named it, and the bytes are
 * the tie-breaker: a `.csv` that turns out to be an MP3 is an MP3.
 */
export function detectFormat(file: string | null, data: Uint8Array): FormatId {
  const name = (file ?? "").split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const extension = name.includes(".") ? name.split(".").pop()! : "";

  if (extension === "reg") {
    return isRegistryFile(decodeHead(data)) ? "registry" : "text";
  }
  if (AUDIO_EXTENSIONS.has(extension) && isMp3(data)) return "audio";
  if (name === "package.json") return "version";
  if (VERSION_EXTENSIONS.has(extension)) return "version";
  if (isPortableExecutable(data)) return "version";
  if (isMp3(data) && extension === "") return "audio";
  if (TABLE_EXTENSIONS.has(extension)) return "table";
  return "text";
}

/**
 * The two sides as the lines to compare, or null when the format has nothing to add.
 *
 * Both sides are rendered together, because two of these formats — the table above
 * all — only line up when each side knows about the other: a column's width has to
 * be the wider of the two, or every row after it reads as changed.
 */
export function formatLines(
  left: { file: string | null; data: Uint8Array },
  right: { file: string | null; data: Uint8Array },
  options: FormatOptions = {},
): { format: FormatId; left: string[]; right: string[] } | null {
  const format = options.format ?? agreedFormat(left, right);
  if (format === "text") return null;

  if (format === "table") {
    const lines = tableLines(text(left.data), text(right.data), options.table ?? {});
    return { format, left: lines.left, right: lines.right };
  }
  if (format === "audio") {
    return { format, left: tagLines(left.data), right: tagLines(right.data) };
  }
  if (format === "registry") {
    return { format, left: registryLines(text(left.data)), right: registryLines(text(right.data)) };
  }

  // Version info: if neither side has any, fall back rather than show two blanks.
  const leftLines = versionLines(left.file ?? "", left.data);
  const rightLines = versionLines(right.file ?? "", right.data);
  if (leftLines.length === 0 && rightLines.length === 0) return null;
  return { format, left: leftLines, right: rightLines };
}

/**
 * The format both sides agree on.
 *
 * A comparison has one format, not two: a CSV against a text file is a text
 * comparison, because rendering only one side as a table would line up with
 * nothing. The exception is a file that is missing, which agrees with anything.
 */
function agreedFormat(
  left: { file: string | null; data: Uint8Array },
  right: { file: string | null; data: Uint8Array },
): FormatId {
  const a = left.data.length === 0 ? null : detectFormat(left.file, left.data);
  const b = right.data.length === 0 ? null : detectFormat(right.file, right.data);
  if (a === null) return b ?? "text";
  if (b === null) return a;
  return a === b ? a : "text";
}

function text(data: Uint8Array): string {
  return stripBom(decode(data));
}

function decodeHead(data: Uint8Array): string {
  return stripBom(decode(data.subarray(0, 256)));
}

/** True when a format reader would make more of this pair than a hex dump would. */
export function prefersFormat(file: string | null, data: Uint8Array): boolean {
  const format = detectFormat(file, data);
  if (format === "text") return false;
  // A binary that has a reader is still worth reading — that is the whole point of
  // the audio and version readers.
  void isBinary;
  void splitBody;
  return true;
}
