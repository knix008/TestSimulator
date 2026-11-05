// The project's TrueType and OpenType fonts. Like images, the document only names them
// (project.fonts); the file's bytes stay out of it. Reads what the app must know about a file:
// the faces in it, their names, and which characters they have.
const store = new Map();

export const fontData = (name) => store.get(String(name)) ?? null;
export const clearFonts = () => store.clear();

/** The languages a CJK font can be set to. `sample` is what a face must have to serve it. */
export const FONT_LANGUAGES = [
  { id: "ko", sample: "가나다한글", tag: /\b(KR|Korean)\b/i },
  { id: "ja", sample: "あいカタ日本", tag: /\b(JP|Japanese)\b/i },
  { id: "zh-Hans", sample: "汉语简体", tag: /\b(SC|Simplified)\b/i },
  { id: "zh-Hant", sample: "漢語繁體", tag: /\b(TC|Traditional)\b/i },
  { id: "zh-HK", sample: "漢語繁體", tag: /\b(HK|HongKong)\b/i },
  { id: "latin", sample: "AaZz09", tag: null },
];

const tagOf = (reader, offset) => String.fromCharCode(reader.getUint8(offset), reader.getUint8(offset + 1), reader.getUint8(offset + 2), reader.getUint8(offset + 3));

function decodeName(bytes, offset, length, wide) {
  let text = "";
  if (wide) for (let i = 0; i + 1 < length; i += 2) text += String.fromCharCode((bytes[offset + i] << 8) | bytes[offset + i + 1]);
  else for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[offset + i]);
  return text;
}

function readNames(reader, bytes, table) {
  if (!table) return {};
  const count = reader.getUint16(table + 2);
  const strings = table + reader.getUint16(table + 4);
  const found = {};
  const rank = {};
  for (let i = 0; i < count; i++) {
    const at = table + 6 + i * 12;
    const platform = reader.getUint16(at);
    const language = reader.getUint16(at + 4);
    const id = reader.getUint16(at + 6);
    if (![1, 2, 4, 16, 17].includes(id)) continue;
    // English from Windows first; others only when nothing better is there.
    const score = platform === 3 ? (language === 0x409 ? 3 : 2) : platform === 0 ? 2 : platform === 1 ? 1 : 0;
    if (!score || (rank[id] ?? 0) >= score) continue;
    const length = reader.getUint16(at + 8);
    const offset = strings + reader.getUint16(at + 10);
    if (offset + length > bytes.length) continue;
    found[id] = decodeName(bytes, offset, length, platform !== 1);
    rank[id] = score;
  }
  return found;
}

/** A test for "does the face have this character", from the cmap table. */
function readCharacters(reader, table) {
  if (!table) return () => false;
  const count = reader.getUint16(table + 2);
  let format4 = 0;
  let format12 = 0;
  for (let i = 0; i < count; i++) {
    const at = table + 4 + i * 8;
    const platform = reader.getUint16(at);
    const encoding = reader.getUint16(at + 2);
    const sub = table + reader.getUint32(at + 4);
    const format = reader.getUint16(sub);
    if (format === 12 && (platform === 0 || (platform === 3 && encoding === 10))) format12 = sub;
    if (format === 4 && (platform === 0 || (platform === 3 && encoding === 1))) format4 = sub;
  }
  if (format12) {
    const groups = reader.getUint32(format12 + 12);
    return (code) => {
      let low = 0;
      let high = groups - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const at = format12 + 16 + middle * 12;
        if (code < reader.getUint32(at)) high = middle - 1;
        else if (code > reader.getUint32(at + 4)) low = middle + 1;
        else return reader.getUint32(at + 8) + (code - reader.getUint32(at)) !== 0;
      }
      return false;
    };
  }
  if (format4) {
    const segments = reader.getUint16(format4 + 6) / 2;
    const ends = format4 + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const offsets = deltas + segments * 2;
    return (code) => {
      if (code > 0xffff) return false;
      for (let i = 0; i < segments; i++) {
        if (code > reader.getUint16(ends + i * 2)) continue;
        const start = reader.getUint16(starts + i * 2);
        if (code < start) return false;
        const offset = reader.getUint16(offsets + i * 2);
        if (offset === 0) return ((code + reader.getUint16(deltas + i * 2)) & 0xffff) !== 0;
        const glyph = reader.getUint16(offsets + i * 2 + offset + (code - start) * 2);
        return glyph !== 0;
      }
      return false;
    };
  }
  return () => false;
}

function readFace(reader, bytes, offset, index) {
  const version = reader.getUint32(offset);
  const kind = tagOf(reader, offset);
  if (version !== 0x00010000 && kind !== "OTTO" && kind !== "true") throw new Error("not a font");
  const tables = {};
  const count = reader.getUint16(offset + 4);
  for (let i = 0; i < count; i++) {
    const at = offset + 12 + i * 16;
    tables[tagOf(reader, at)] = reader.getUint32(at + 8);
  }
  if (!tables.head || !tables.cmap || (!tables.glyf && !tables["CFF "])) throw new Error("a table the font needs is missing");
  const names = readNames(reader, bytes, tables.name);
  const family = names[16] ?? names[1] ?? `Face ${index}`;
  const style = names[17] ?? names[2] ?? "";
  const has = readCharacters(reader, tables.cmap);
  return {
    index,
    family,
    style,
    full: names[4] ?? `${family} ${style}`.trim(),
    languages: FONT_LANGUAGES.filter((language) => Array.from(language.sample).every((character) => has(character.codePointAt(0)))).map((language) => language.id),
    tagged: FONT_LANGUAGES.find((language) => language.tag?.test(`${family} ${names[4] ?? ""}`))?.id ?? null,
    has,
  };
}

/** Reads a .ttf, .otf, .ttc or .otc. Throws when the file is not a font this app can use. */
export function readFontFile(bytes) {
  if (bytes.length < 16) throw new Error("not a font");
  const reader = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (tagOf(reader, 0) === "ttcf") {
      const count = reader.getUint32(8);
      if (!count || count > 256) throw new Error("not a font");
      return { faces: Array.from({ length: count }, (_, index) => readFace(reader, bytes, reader.getUint32(12 + index * 4), index)) };
    }
    return { faces: [readFace(reader, bytes, 0, 0)] };
  } catch (error) {
    throw new Error(`not a usable font file: ${error.message}`);
  }
}

/** Registers a font's file. Its faces are read here once. */
export function addFont(name, { bytes, base64 = "" }) {
  store.set(String(name), { bytes, base64, info: readFontFile(bytes), writtenTo: new Set() });
}

export function base64ToBytes(base64) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** The face a language wants: the one named for it, else one that has its characters. */
export function faceForLanguage(info, language, current = 0) {
  const named = info.faces.find((face) => face.tagged === language);
  if (named) return named.index;
  if (info.faces[current]?.languages.includes(language)) return current;
  return info.faces.find((face) => face.languages.includes(language))?.index ?? current;
}

/**
 * The file as the LVGL decoder should see it. The decoder always opens the first face of a
 * collection, so for another face the collection's first entry is pointed at that face.
 */
export function fontBytesForFace(bytes, face) {
  if (!face || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "ttcf") return bytes;
  const copy = bytes.slice();
  copy.copyWithin(12, 12 + face * 4, 16 + face * 4);
  return copy;
}

/** A name for a font file, usable in C and unique in the project. */
export function fontNameFor(project, file) {
  const base = String(file).split(/[\\/]/).pop().replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "_") || "font";
  const clean = /^[0-9]/.test(base) ? `_${base}` : base;
  const taken = new Set((project.fonts ?? []).map((font) => font.name));
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n++) if (!taken.has(`${clean}_${n}`)) return `${clean}_${n}`;
}

/** The files to write to a folder: only those not yet written there. */
export function fontFiles(project, folder) {
  const files = {};
  for (const font of project.fonts ?? []) {
    const data = fontData(font.name);
    if (data?.base64 && !data.writtenTo.has(folder)) files[font.file] = data.base64;
  }
  return files;
}

export function markFontsWritten(project, folder) {
  for (const font of project.fonts ?? []) fontData(font.name)?.writtenTo.add(folder);
}

/** Takes a font out of a project: widgets using it go back to the built-in font. */
export function removeFontFromProject(project, name, builtinSizes) {
  project.fonts = (project.fonts ?? []).filter((font) => font.name !== name);
  if (!project.fonts.length) delete project.fonts;
  if (project.defaultFont?.font === name) delete project.defaultFont;
  const step = (node) => {
    if (node.props.fontFamily === name) {
      delete node.props.fontFamily;
      if (!builtinSizes.includes(Number(node.props.font))) delete node.props.font;
    }
    node.children.forEach(step);
  };
  project.screens.forEach(step);
}
