// Builds real TrueType files for the tests, so they need no font from the machine: each glyph is
// one rectangle whose shape depends on `shape`, enough to see which face drew a character.
const be16 = (value) => [(value >> 8) & 255, value & 255];
const be32 = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const zeros = (count) => new Array(count).fill(0);

function glyphBytes(code, shape) {
  const width = 300 + (code % 5) * 60;
  const height = shape === 0 ? 700 : 300;
  // A rectangle: one contour of four on-curve points, each coordinate a 16-bit delta.
  const bytes = [
    ...be16(1), ...be16(0), ...be16(0), ...be16(width), ...be16(height),
    ...be16(3), ...be16(0),
    1, 1, 1, 1,
    ...be16(0), ...be16(width), ...be16(0), ...be16(-width & 0xffff),
    ...be16(0), ...be16(0), ...be16(height), ...be16(0),
  ];
  return bytes.length % 2 ? [...bytes, 0] : bytes;
}

function nameTable(names) {
  const records = [];
  const strings = [];
  for (const [id, text] of Object.entries(names)) {
    const encoded = Array.from(text).flatMap((character) => be16(character.charCodeAt(0)));
    records.push([...be16(3), ...be16(1), ...be16(0x409), ...be16(Number(id)), ...be16(encoded.length), ...be16(strings.length)]);
    strings.push(...encoded);
  }
  return [...be16(0), ...be16(records.length), ...be16(6 + records.length * 12), ...records.flat(), ...strings];
}

function tablesOf({ family, style = "Regular", characters, shape = 0 }) {
  const codes = [...new Set(Array.from(characters, (character) => character.codePointAt(0)))].sort((a, b) => a - b);
  const glyphs = [[], ...codes.map((code) => glyphBytes(code, shape))];
  const glyf = glyphs.flat();
  const loca = [];
  let at = 0;
  for (const glyph of glyphs) {
    loca.push(...be32(at));
    at += glyph.length;
  }
  loca.push(...be32(at));
  const head = [...be32(0x00010000), ...be32(0x00010000), ...be32(0), ...be32(0x5f0f3cf5), ...be16(0), ...be16(1000), ...zeros(16), ...be16(0), ...be16(0), ...be16(1000), ...be16(1000), ...be16(0), ...be16(8), ...be16(2), ...be16(1), ...be16(0)];
  const hhea = [...be32(0x00010000), ...be16(800), ...be16(-200 & 0xffff), ...be16(0), ...be16(1000), ...be16(0), ...be16(0), ...be16(1000), ...be16(1), ...be16(0), ...be16(0), ...zeros(8), ...be16(0), ...be16(glyphs.length)];
  const hmtx = glyphs.flatMap(() => [...be16(800), ...be16(0)]);
  const maxp = [...be32(0x00010000), ...be16(glyphs.length), ...zeros(26)];
  const groups = codes.flatMap((code, index) => [...be32(code), ...be32(code), ...be32(index + 1)]);
  const cmap = [...be16(0), ...be16(1), ...be16(3), ...be16(10), ...be32(12), ...be16(12), ...be16(0), ...be32(16 + groups.length), ...be32(0), ...be32(codes.length), ...groups];
  const name = nameTable({ 1: family, 2: style, 4: `${family} ${style}` });
  return { cmap, glyf, head, hhea, hmtx, loca, maxp, name };
}

function assemble(faces, prefix) {
  // Each face: a directory, then its tables. Offsets count from the start of the file.
  const out = [];
  const starts = [];
  let position = prefix;
  for (const tables of faces) {
    const tags = Object.keys(tables).sort();
    const directory = 12 + tags.length * 16;
    let offset = position + directory;
    const entries = [];
    const body = [];
    for (const tag of tags) {
      const data = tables[tag];
      entries.push(...Array.from(tag, (c) => c.charCodeAt(0)), ...be32(0), ...be32(offset), ...be32(data.length));
      const padded = [...data, ...zeros((4 - (data.length % 4)) % 4)];
      body.push(...padded);
      offset += padded.length;
    }
    starts.push(position);
    out.push(...be32(0x00010000), ...be16(tags.length), ...zeros(6), ...entries, ...body);
    position = offset;
  }
  return { out, starts };
}

/** One TrueType font: a .ttf file's bytes. */
export function buildFont(options) {
  return Uint8Array.from(assemble([tablesOf(options)], 0).out);
}

/** A collection of fonts: a .ttc file's bytes. */
export function buildCollection(faces) {
  const header = 12 + faces.length * 4;
  const { out, starts } = assemble(faces.map(tablesOf), header);
  return Uint8Array.from([...Array.from("ttcf", (c) => c.charCodeAt(0)), ...be32(0x00010000), ...be32(faces.length), ...starts.flatMap(be32), ...out]);
}
