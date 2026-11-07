// A TrueType and OpenType reader, for text in any font, Hangul included: character map, advance widths and glyph outlines. TrueType
// outlines (glyf) are read directly, and CFF outlines (most .otf files) through their Type 2 charstrings. Collections (.ttc) pick a face.
// No DOM here.
const fonts = new Map();

/** Fonts available to text objects, by family name. The UI loads them; files do not hold them. */
export const registerFont = (family, font) => { fonts.set(family, font); };
export const getFont = (family) => fonts.get(family) ?? null;
export const loadedFonts = () => [...fonts.keys()];

class Reader {
  constructor(bytes) { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.bytes = bytes; }
  u8(at) { return this.view.getUint8(at); }
  u16(at) { return this.view.getUint16(at); }
  i16(at) { return this.view.getInt16(at); }
  u32(at) { return this.view.getUint32(at); }
  tag(at) { return String.fromCharCode(this.u8(at), this.u8(at + 1), this.u8(at + 2), this.u8(at + 3)); }
}

function readCmap(r, at) {
  const count = r.u16(at + 2);
  // The widest Unicode table: format 12 reaches past the basic plane; format 4 is the usual one.
  let best = null;
  for (let i = 0; i < count; i++) {
    const [platform, encoding, offset] = [r.u16(at + 4 + i * 8), r.u16(at + 6 + i * 8), r.u32(at + 8 + i * 8)];
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const format = r.u16(at + offset);
    if (format === 12 || (format === 4 && best?.format !== 12)) best = { format, table: at + offset };
  }
  if (!best) throw new Error('This font has no Unicode character map');
  const { format, table } = best;
  if (format === 12) {
    const groups = r.u32(table + 12);
    return (code) => {
      let [lo, hi] = [0, groups - 1];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = table + 16 + mid * 12;
        if (code < r.u32(g)) hi = mid - 1;
        else if (code > r.u32(g + 4)) lo = mid + 1;
        else return r.u32(g + 8) + code - r.u32(g);
      }
      return 0;
    };
  }
  const segments = r.u16(table + 6) / 2;
  const ends = table + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (code) => {
    if (code > 0xffff) return 0;
    for (let i = 0; i < segments; i++) {
      if (code > r.u16(ends + i * 2)) continue;
      const start = r.u16(starts + i * 2);
      if (code < start) return 0;
      const offset = r.u16(ranges + i * 2);
      if (!offset) return (code + r.i16(deltas + i * 2)) & 0xffff;
      const glyph = r.u16(ranges + i * 2 + offset + (code - start) * 2);
      return glyph ? (glyph + r.i16(deltas + i * 2)) & 0xffff : 0;
    }
    return 0;
  };
}

/** A glyph's contours as lists of commands: M, L, Q (and C for CFF). */
function readGlyf(r, tables, numGlyphs, longLoca) {
  const { loca, glyf } = tables;
  const locate = (g) => (longLoca ? r.u32(loca + g * 4) : r.u16(loca + g * 2) * 2);
  const points = (g, depth = 0) => {
    if (g >= numGlyphs || depth > 6) return [];
    const [start, end] = [locate(g), locate(g + 1)];
    if (start === end) return [];
    let at = glyf + start;
    const contours = r.i16(at);
    at += 10;
    if (contours < 0) {
      // Composite: parts with their own offsets and scales.
      const out = [];
      for (;;) {
        const flags = r.u16(at);
        const part = r.u16(at + 2);
        at += 4;
        let [dx, dy] = [0, 0];
        if (flags & 1) { dx = r.i16(at); dy = r.i16(at + 2); at += 4; } else { dx = r.view.getInt8(at); dy = r.view.getInt8(at + 1); at += 2; }
        let [a, b, c, d] = [1, 0, 0, 1];
        const f2 = (o) => r.i16(o) / 16384;
        if (flags & 8) { a = d = f2(at); at += 2; } else if (flags & 0x40) { a = f2(at); d = f2(at + 2); at += 4; } else if (flags & 0x80) { a = f2(at); b = f2(at + 2); c = f2(at + 4); d = f2(at + 6); at += 8; }
        for (const contour of points(part, depth + 1)) out.push(contour.map((p) => ({ x: p.x * a + p.y * c + dx, y: p.x * b + p.y * d + dy, on: p.on })));
        if (!(flags & 0x20)) break;
      }
      return out;
    }
    const ends = [];
    for (let i = 0; i < contours; i++) { ends.push(r.u16(at)); at += 2; }
    at += 2 + r.u16(at);
    const count = contours ? ends.at(-1) + 1 : 0;
    const flags = [];
    while (flags.length < count) {
      const flag = r.u8(at++);
      flags.push(flag);
      if (flag & 8) { let repeat = r.u8(at++); while (repeat-- > 0) flags.push(flag); }
    }
    const axis = (shortBit, sameBit) => {
      const out = [];
      let v = 0;
      for (const flag of flags) {
        if (flag & shortBit) { const d = r.u8(at++); v += flag & sameBit ? d : -d; } else if (!(flag & sameBit)) { v += r.i16(at); at += 2; }
        out.push(v);
      }
      return out;
    };
    const xs = axis(2, 16);
    const ys = axis(4, 32);
    const out = [];
    let first = 0;
    for (const last of ends) {
      const list = [];
      for (let i = first; i <= last; i++) list.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) !== 0 });
      out.push(list);
      first = last + 1;
    }
    return out;
  };
  // Two control points in a row imply an on-curve point midway.
  return (g) => {
    const commands = [];
    for (const contour of points(g)) {
      if (contour.length < 2) continue;
      const expanded = [];
      contour.forEach((p, i) => {
        const n = contour[(i + 1) % contour.length];
        expanded.push(p);
        if (!p.on && !n.on) expanded.push({ x: (p.x + n.x) / 2, y: (p.y + n.y) / 2, on: true });
      });
      const startAt = expanded.findIndex((p) => p.on);
      if (startAt < 0) continue;
      const ring = [...expanded.slice(startAt), ...expanded.slice(0, startAt)];
      commands.push({ t: 'M', x: ring[0].x, y: ring[0].y });
      for (let i = 1; i <= ring.length;) {
        const p = ring[i % ring.length];
        if (p.on) { commands.push({ t: 'L', x: p.x, y: p.y }); i += 1; } else {
          const q = ring[(i + 1) % ring.length];
          commands.push({ t: 'Q', cx: p.x, cy: p.y, x: q.x, y: q.y });
          i += 2;
        }
      }
      commands.push({ t: 'Z' });
    }
    return commands;
  };
}

// ─────────────── CFF

function cffIndex(r, at) {
  const count = r.u16(at);
  if (!count) return { items: [], end: at + 2 };
  const size = r.u8(at + 2);
  const offset = (i) => { let v = 0; for (let k = 0; k < size; k++) v = v * 256 + r.u8(at + 3 + i * size + k); return v; };
  const base = at + 3 + (count + 1) * size - 1;
  const items = [];
  for (let i = 0; i < count; i++) items.push([base + offset(i), base + offset(i + 1)]);
  return { items, end: base + offset(count) };
}

function cffDict(r, start, end) {
  const out = {};
  let stack = [];
  for (let at = start; at < end;) {
    const b = r.u8(at++);
    if (b <= 21) {
      const key = b === 12 ? 1200 + r.u8(at++) : b;
      out[key] = stack;
      stack = [];
    } else if (b === 28) { stack.push(r.i16(at)); at += 2; } else if (b === 29) { stack.push(r.view.getInt32(at)); at += 4; } else if (b === 30) {
      let text = '';
      for (let done = false; !done;) {
        const byte = r.u8(at++);
        for (const n of [byte >> 4, byte & 15]) {
          if (n === 15) { done = true; break; }
          text += ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'E', 'E-', '', '-'][n];
        }
      }
      stack.push(Number(text));
    } else if (b >= 32 && b <= 246) stack.push(b - 139);
    else if (b >= 247 && b <= 250) stack.push((b - 247) * 256 + r.u8(at++) + 108);
    else if (b >= 251 && b <= 254) stack.push(-(b - 251) * 256 - r.u8(at++) - 108);
  }
  return out;
}

function readCFF(r, cff) {
  const headerSize = r.u8(cff + 2);
  const names = cffIndex(r, cff + headerSize);
  const topIndex = cffIndex(r, names.end);
  const strings = cffIndex(r, topIndex.end);
  const globals = cffIndex(r, strings.end);
  const top = cffDict(r, topIndex.items[0][0], topIndex.items[0][1]);
  const charStrings = cffIndex(r, cff + top[17][0]);
  const localSubrs = (dict) => {
    if (!dict?.[18]) return { items: [] };
    const [size, offset] = dict[18];
    const priv = cffDict(r, cff + offset, cff + offset + size);
    return priv[19] ? cffIndex(r, cff + offset + priv[19][0]) : { items: [] };
  };
  // CID fonts choose private data per glyph.
  let selector = () => 0;
  let locals = [localSubrs(top)];
  if (top[1236]) {
    const fds = cffIndex(r, cff + top[1236][0]);
    locals = fds.items.map(([s, e]) => localSubrs(cffDict(r, s, e)));
    const at = cff + top[1237][0];
    const format = r.u8(at);
    if (format === 0) selector = (g) => r.u8(at + 1 + g);
    else {
      const ranges = r.u16(at + 1);
      selector = (g) => {
        for (let i = 0; i < ranges; i++) if (g >= r.u16(at + 3 + i * 3) && g < r.u16(at + 6 + i * 3)) return r.u8(at + 5 + i * 3);
        return 0;
      };
    }
  }
  const bias = (n) => (n < 1240 ? 107 : n < 33900 ? 1131 : 32768);
  return (g) => {
    const commands = [];
    const item = charStrings.items[g];
    if (!item) return commands;
    const local = locals[selector(g)] ?? { items: [] };
    let [x, y, hints, open, widthDone] = [0, 0, 0, false, false];
    let stack = [];
    const move = (dx, dy) => { if (open) commands.push({ t: 'Z' }); open = true; x += dx; y += dy; commands.push({ t: 'M', x, y }); };
    const line = (dx, dy) => { x += dx; y += dy; commands.push({ t: 'L', x, y }); };
    const curve = (a, b, c, d, e, f) => {
      const [c1x, c1y] = [x + a, y + b];
      const [c2x, c2y] = [c1x + c, c1y + d];
      x = c2x + e;
      y = c2y + f;
      commands.push({ t: 'C', c1x, c1y, c2x, c2y, x, y });
    };
    const takeWidth = (odd) => { if (!widthDone) { if (odd) stack.shift(); widthDone = true; } };
    const run = (start, end, depth) => {
      for (let at = start; at < end;) {
        const b = r.u8(at++);
        if (b >= 32 || b === 28) {
          if (b === 28) { stack.push(r.i16(at)); at += 2; } else if (b <= 246) stack.push(b - 139);
          else if (b <= 250) stack.push((b - 247) * 256 + r.u8(at++) + 108);
          else if (b <= 254) stack.push(-(b - 251) * 256 - r.u8(at++) - 108);
          else { stack.push(r.view.getInt32(at) / 65536); at += 4; }
          continue;
        }
        switch (b) {
          case 1: case 3: case 18: case 23: takeWidth(stack.length % 2 === 1); hints += stack.length >> 1; stack = []; break;
          case 19: case 20: takeWidth(stack.length % 2 === 1); hints += stack.length >> 1; stack = []; at += (hints + 7) >> 3; break;
          case 21: takeWidth(stack.length > 2); move(stack[0], stack[1]); stack = []; break;
          case 22: takeWidth(stack.length > 1); move(stack[0], 0); stack = []; break;
          case 4: takeWidth(stack.length > 1); move(0, stack[0]); stack = []; break;
          case 5: for (let i = 0; i + 1 < stack.length; i += 2) line(stack[i], stack[i + 1]); stack = []; break;
          case 6: case 7: { let horizontal = b === 6; for (const d of stack) { if (horizontal) line(d, 0); else line(0, d); horizontal = !horizontal; } stack = []; break; }
          case 8: for (let i = 0; i + 5 < stack.length; i += 6) curve(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]); stack = []; break;
          case 24: { let i = 0; for (; i + 7 < stack.length; i += 6) curve(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]); line(stack[i], stack[i + 1]); stack = []; break; }
          case 25: { let i = 0; for (; i + 7 < stack.length; i += 2) line(stack[i], stack[i + 1]); curve(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]); stack = []; break; }
          case 26: { let i = 0; let d = 0; if (stack.length % 2) d = stack[i++]; for (; i + 3 < stack.length; i += 4) { curve(d, stack[i], stack[i + 1], stack[i + 2], 0, stack[i + 3]); d = 0; } stack = []; break; }
          case 27: { let i = 0; let d = 0; if (stack.length % 2) d = stack[i++]; for (; i + 3 < stack.length; i += 4) { curve(stack[i], d, stack[i + 1], stack[i + 2], stack[i + 3], 0); d = 0; } stack = []; break; }
          case 30: case 31: {
            let horizontal = b === 31;
            let i = 0;
            while (i + 3 < stack.length) {
              const last = stack.length - i === 5 ? stack[i + 4] : 0;
              if (horizontal) curve(stack[i], 0, stack[i + 1], stack[i + 2], last, stack[i + 3]);
              else curve(0, stack[i], stack[i + 1], stack[i + 2], stack[i + 3], last);
              horizontal = !horizontal;
              i += 4;
            }
            stack = [];
            break;
          }
          case 10: case 29: {
            const list = b === 10 ? local.items : globals.items;
            const sub = list[stack.pop() + bias(list.length)];
            if (sub && depth < 12) { if (run(sub[0], sub[1], depth + 1)) return true; }
            break;
          }
          case 11: return false;
          case 14: takeWidth(stack.length === 1 || stack.length === 5); return true;
          case 12: {
            const op = r.u8(at++);
            if (op === 35) { curve(stack[0], stack[1], stack[2], stack[3], stack[4], stack[5]); curve(stack[6], stack[7], stack[8], stack[9], stack[10], stack[11]); } else if (op === 34) { curve(stack[0], 0, stack[1], stack[2], stack[3], 0); curve(stack[4], 0, stack[5], -stack[2], stack[6], 0); } else if (op === 36) { curve(stack[0], stack[1], stack[2], stack[3], stack[4], 0); curve(stack[5], 0, stack[6], stack[7], stack[8], -(stack[1] + stack[3] + stack[7])); } else if (op === 37) {
              const dx = stack[0] + stack[2] + stack[4] + stack[6] + stack[8];
              const dy = stack[1] + stack[3] + stack[5] + stack[7] + stack[9];
              curve(stack[0], stack[1], stack[2], stack[3], stack[4], stack[5]);
              if (Math.abs(dx) > Math.abs(dy)) curve(stack[6], stack[7], stack[8], stack[9], stack[10], -dy);
              else curve(stack[6], stack[7], stack[8], stack[9], -dx, stack[10]);
            }
            stack = [];
            break;
          }
          default: stack = [];
        }
      }
      return false;
    };
    run(item[0], item[1], 0);
    if (open) commands.push({ t: 'Z' });
    return commands;
  };
}

/** Reads a font file. `index` picks a face of a collection. */
export function parseFont(input, index = 0) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const r = new Reader(bytes);
  let start = 0;
  if (r.tag(0) === 'ttcf') {
    const faces = r.u32(8);
    if (index >= faces) throw new Error('This font collection has no such face');
    start = r.u32(12 + index * 4);
  }
  const tag = r.tag(start);
  if (tag !== 'OTTO' && tag !== 'true' && r.u32(start) !== 0x00010000) throw new Error('This is not a TrueType or OpenType font');
  const count = r.u16(start + 4);
  const tables = {};
  for (let i = 0; i < count; i++) {
    const entry = start + 12 + i * 16;
    tables[r.tag(entry).trim().replace('/', '_')] = r.u32(entry + 8);
  }
  for (const needed of ['head', 'hhea', 'hmtx', 'maxp', 'cmap']) if (tables[needed] == null) throw new Error(`This font has no ${needed} table`);
  const unitsPerEm = r.u16(tables.head + 18);
  const longLoca = r.i16(tables.head + 50) !== 0;
  const numGlyphs = r.u16(tables.maxp + 4);
  const ascent = r.i16(tables.hhea + 4);
  const descent = r.i16(tables.hhea + 6);
  const lineGap = r.i16(tables.hhea + 8);
  const metrics = r.u16(tables.hhea + 34);
  const glyphIndex = readCmap(r, tables.cmap);
  const advance = (g) => r.u16(tables.hmtx + Math.min(g, metrics - 1) * 4);
  let outline;
  if (tables.glyf != null && tables.loca != null) outline = readGlyf(r, tables, numGlyphs, longLoca);
  else if (tables.CFF != null) outline = readCFF(r, tables.CFF);
  else throw new Error('This font has no outlines that can be read');
  const cache = new Map();
  return {
    unitsPerEm, ascent, descent, lineGap,
    glyphIndex,
    advance,
    outline: (g) => { if (!cache.has(g)) cache.set(g, outline(g)); return cache.get(g); },
    hasGlyph: (code) => glyphIndex(code) !== 0,
    // PostScript outlines run the other way round to TrueType ones.
    postScript: tables.glyf == null,
  };
}
