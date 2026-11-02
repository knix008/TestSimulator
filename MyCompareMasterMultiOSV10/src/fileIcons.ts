/**
 * Which icon stands for a file.
 *
 * A directory comparison is read by scanning names, and a name is easier to find
 * when its kind is drawn beside it: a picture, a sound, an archive and a source file
 * are told apart before a single name is read. The status of the row — same,
 * different, on one side only — is a separate matter, carried by the row's colour
 * and by its own small glyph, so the two are never competing for one icon.
 *
 * The buckets are by extension because that is all a comparison knows about an
 * entry: the two trees are built from names, sizes and timestamps, never from the
 * bytes of every file in them. `languageFor` is reused for source code so that a
 * file highlighted as code here is a file highlighted as code in the diff.
 */
import { ARCHIVE_EXTENSIONS } from "../core/archives.js";
import { isPlain, languageFor } from "../core/grammar.js";
import { IMAGE_EXTENSIONS } from "../core/images.js";

const AUDIO = new Set([
  "mp3", "mp2", "wav", "flac", "ogg", "oga", "m4a", "aac", "wma", "aiff", "aif", "opus", "mid", "midi",
]);

const VIDEO = new Set([
  "mp4", "m4v", "mkv", "avi", "mov", "wmv", "webm", "flv", "mpg", "mpeg", "3gp",
]);

const FONT = new Set(["ttf", "otf", "ttc", "otc", "woff", "woff2", "eot"]);

/** Spreadsheets and delimited text — anything the table comparison can open. */
const TABLE = new Set(["csv", "tsv", "tab", "psv", "xls", "xlsx", "xlsm", "xlsb", "ods", "numbers"]);

const SLIDES = new Set(["ppt", "pptx", "pps", "ppsx", "odp"]);

/** Prose rather than data: something written to be read. */
const DOCUMENT = new Set([
  "txt", "md", "markdown", "rst", "adoc", "asciidoc", "tex", "log", "nfo",
  "doc", "docx", "odt", "rtf", "pdf", "pages", "epub", "chm",
]);

/** Compiled or otherwise unreadable output. */
const BINARY = new Set([
  "exe", "dll", "sys", "ocx", "scr", "msi", "msix", "com", "so", "dylib", "o", "a",
  "lib", "obj", "pdb", "node", "wasm", "class", "pyc", "bin", "dat", "db", "sqlite",
]);

/** Archives the comparison cannot open, but which are still archives to the eye. */
const ARCHIVE_LOOSE = new Set([
  "7z", "rar", "tar", "gz", "tgz", "bz2", "tbz", "xz", "txz", "zst", "lz4", "lzma",
  "cab", "iso", "dmg", "arj", "lzh", "z",
]);

const SECRET = new Set(["pem", "key", "crt", "cer", "pfx", "p12", "der", "asc", "gpg", "sig", "jks", "keystore"]);

/** Settings a program reads, as opposed to source a program runs. */
const CONFIG = new Set([
  "json", "jsonc", "yml", "yaml", "toml", "ini", "cfg", "conf", "config", "properties",
  "env", "plist", "reg", "manifest", "editorconfig", "lock",
]);

/** Names with no useful extension, where the whole name is the type. */
const BY_NAME: Record<string, string> = {
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
  ".gitkeep": "git",
  ".dockerignore": "settings",
  dockerfile: "settings",
  makefile: "code",
  license: "page",
  readme: "page",
};

/**
 * The icon for one entry.
 *
 * `name` may be a whole relative path — the flat view shows paths rather than names —
 * so the last segment is taken first.
 */
export function fileIcon(name: string, directory: boolean): string {
  if (directory) return "folder";

  const base = (name.split(/[\\/]/).pop() ?? name).toLowerCase();
  const byName = BY_NAME[base] ?? BY_NAME[base.replace(/\.[^.]*$/, "")];
  if (byName) return byName;

  const extension = base.includes(".") ? base.split(".").pop()! : "";
  if (!extension) return "file";

  // Pictures before code, so an SVG is a picture; tables and slides before
  // archives, because an .xlsx is a spreadsheet to everyone but the unzipper.
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (AUDIO.has(extension)) return "music";
  if (VIDEO.has(extension)) return "video";
  if (FONT.has(extension)) return "font";
  if (TABLE.has(extension)) return "grid";
  if (SLIDES.has(extension)) return "monitor";
  if (DOCUMENT.has(extension)) return "page";
  if (ARCHIVE_EXTENSIONS.has(extension) || ARCHIVE_LOOSE.has(extension)) return "archive";
  if (SECRET.has(extension)) return "lock";
  if (BINARY.has(extension)) return "binary";
  if (CONFIG.has(extension)) return "settings";
  if (!isPlain(languageFor(base))) return "code";
  return "file";
}
