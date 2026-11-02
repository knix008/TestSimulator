/**
 * System font discovery.
 *
 * The browser's `queryLocalFonts()` is behind a permission prompt and is missing
 * outside Chromium, so the list the Settings dialog shows is built here instead: walk
 * the platform's font directories and read the family name out of each file's `name`
 * table. Reading the table rather than the file name matters for the fonts people
 * actually pick — `malgun.ttf` is "맑은 고딕", not "malgun".
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FontFamily = {
  family: string;
  /** True when the family has a monospaced face; the pane font list leads with these. */
  monospace: boolean;
};

const EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".otc"]);

function fontDirectories(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    const windows = process.env.SystemRoot || "C:\\Windows";
    return [
      path.join(windows, "Fonts"),
      path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Microsoft", "Windows", "Fonts"),
    ];
  }
  if (process.platform === "darwin") {
    return ["/System/Library/Fonts", "/Library/Fonts", path.join(home, "Library", "Fonts")];
  }
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "fonts"),
    path.join(home, ".fonts"),
  ];
}

/** Families whose glyphs are fixed-width; used to sort the monospaced ones first. */
const MONOSPACE_HINTS = /mono|consol|courier|code|터미널|고딕\s*코딩|coding|dejavu sans mono|menlo|hack|fira|iosevka|typewriter/i;

let cache: FontFamily[] | null = null;

export function systemFonts(refresh = false): FontFamily[] {
  if (cache && !refresh) return cache;
  const families = new Map<string, boolean>();

  for (const directory of fontDirectories()) {
    for (const file of walk(directory, 0)) {
      const family = readFamily(file);
      if (!family) continue;
      const monospace = MONOSPACE_HINTS.test(family) || MONOSPACE_HINTS.test(path.basename(file));
      families.set(family, (families.get(family) ?? false) || monospace);
    }
  }

  const list = [...families.entries()]
    .map(([family, monospace]) => ({ family, monospace }))
    .sort((a, b) => {
      if (a.monospace !== b.monospace) return a.monospace ? -1 : 1;
      return a.family.localeCompare(b.family, undefined, { sensitivity: "accent" });
    });

  cache = list.length > 0 ? list : FALLBACK;
  return cache;
}

/** Used when the font directories cannot be read (a locked-down container, say). */
const FALLBACK: FontFamily[] = [
  { family: "Consolas", monospace: true },
  { family: "Courier New", monospace: true },
  { family: "D2Coding", monospace: true },
  { family: "DejaVu Sans Mono", monospace: true },
  { family: "Menlo", monospace: true },
  { family: "Monaco", monospace: true },
  { family: "Arial", monospace: false },
  { family: "Malgun Gothic", monospace: false },
  { family: "Segoe UI", monospace: false },
  { family: "Noto Sans", monospace: false },
];

function* walk(root: string, depth: number): Generator<string> {
  if (depth > 3) return;
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    const full = path.join(root, item.name);
    if (item.isDirectory()) {
      yield* walk(full, depth + 1);
      continue;
    }
    if (EXTENSIONS.has(path.extname(item.name).toLowerCase())) yield full;
  }
}

/* ------------------------------------------------------------------ *
 * The slice of OpenType needed to get at one string
 * ------------------------------------------------------------------ */

/** Reads nameID 1 (font family) out of a TrueType/OpenType file, or null. */
export function readFamily(file: string): string | null {
  let handle: number | undefined;
  try {
    handle = fs.openSync(file, "r");
    const head = Buffer.alloc(12);
    if (fs.readSync(handle, head, 0, 12, 0) < 12) return null;

    // A collection (.ttc) points at several fonts; the first one names the file well enough.
    let offset = 0;
    if (head.toString("ascii", 0, 4) === "ttcf") {
      const directory = Buffer.alloc(16);
      fs.readSync(handle, directory, 0, 16, 0);
      offset = directory.readUInt32BE(12);
      if (fs.readSync(handle, head, 0, 12, offset) < 12) return null;
    }

    const tableCount = head.readUInt16BE(4);
    const tables = Buffer.alloc(16 * tableCount);
    fs.readSync(handle, tables, 0, tables.length, offset + 12);

    let nameOffset = 0;
    let nameLength = 0;
    for (let index = 0; index < tableCount; index++) {
      const at = index * 16;
      if (tables.toString("ascii", at, at + 4) !== "name") continue;
      nameOffset = tables.readUInt32BE(at + 8);
      nameLength = tables.readUInt32BE(at + 12);
      break;
    }
    if (nameLength === 0 || nameLength > 1 << 20) return null;

    const table = Buffer.alloc(nameLength);
    fs.readSync(handle, table, 0, nameLength, nameOffset);
    return familyFromNameTable(table);
  } catch {
    return null;
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        /* already closed */
      }
    }
  }
}

export function familyFromNameTable(table: Buffer): string | null {
  if (table.length < 6) return null;
  const count = table.readUInt16BE(2);
  const stringOffset = table.readUInt16BE(4);

  let best: { score: number; value: string } | null = null;
  for (let index = 0; index < count; index++) {
    const at = 6 + index * 12;
    if (at + 12 > table.length) break;
    const platformId = table.readUInt16BE(at);
    const languageId = table.readUInt16BE(at + 4);
    const nameId = table.readUInt16BE(at + 6);
    if (nameId !== 1) continue;

    const length = table.readUInt16BE(at + 8);
    const offset = stringOffset + table.readUInt16BE(at + 10);
    if (offset + length > table.length) continue;
    const bytes = table.subarray(offset, offset + length);
    // Windows and modern Unicode records store UTF-16BE; the old Mac ones are 8-bit.
    const unicode = platformId === 3 || platformId === 0;
    const value = unicode ? decodeUtf16Be(bytes) : bytes.toString("latin1");
    const clean = value.replace(/\0/g, "").trim();
    if (!clean) continue;

    // Prefer the English Windows record, then anything Windows, then whatever is left.
    const score = platformId === 3 && languageId === 0x0409 ? 3 : platformId === 3 ? 2 : 1;
    if (!best || score > best.score) best = { score, value: clean };
  }
  return best ? best.value : null;
}

function decodeUtf16Be(bytes: Buffer): string {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return text;
}
