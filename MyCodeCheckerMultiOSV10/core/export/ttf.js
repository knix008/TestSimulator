'use strict';

// TrueType (glyf-outline) font reader and subsetter for PDF embedding.
//
// Reads .ttf and .ttc (one face), cmap format 4 / 12, hmtx, loca / glyf,
// head / hhea / maxp / OS/2 / post / name. subset(gids) rebuilds a minimal
// TrueType file that holds only the listed glyphs (plus components of
// composite glyphs), renumbered 0..n-1 in list order, with a matching cmap.
//
// CFF-based OpenType ('OTTO', .otf with a CFF table) is not supported:
// load() throws an Error with code 'CFF_UNSUPPORTED'.

function fail(code, message) { const e = new Error(message); e.code = code; return e; }

class TrueTypeFont {
  /**
   * @param {Buffer} buf  whole font file
   * @param {number} [faceIndex] face of a TrueType collection
   */
  constructor(buf, faceIndex = 0) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) throw fail('BAD_FONT', 'Not a font file');
    this.buf = buf;
    let base = 0;
    this.faceCount = 1;
    if (buf.toString('latin1', 0, 4) === 'ttcf') {
      this.faceCount = buf.readUInt32BE(8);
      const face = faceIndex >= 0 && faceIndex < this.faceCount ? faceIndex : 0;
      base = buf.readUInt32BE(12 + 4 * face);
      this.faceIndex = face;
    } else this.faceIndex = 0;
    const version = buf.readUInt32BE(base);
    if (version === 0x4f54544f) throw fail('CFF_UNSUPPORTED', 'CFF-based OpenType fonts are not supported');
    if (version !== 0x00010000 && version !== 0x74727565) throw fail('BAD_FONT', 'Unknown sfnt version');
    const numTables = buf.readUInt16BE(base + 4);
    this.tables = {};
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + 16 * i;
      const tag = buf.toString('latin1', rec, rec + 4);
      const offset = buf.readUInt32BE(rec + 8);
      const length = buf.readUInt32BE(rec + 12);
      if (offset + length > buf.length) throw fail('BAD_FONT', `Table ${tag} is out of range`);
      this.tables[tag] = { offset, length };
    }
    if (this.tables.CFF || this.tables.CFF2) throw fail('CFF_UNSUPPORTED', 'CFF-based OpenType fonts are not supported');
    for (const t of ['head', 'hhea', 'maxp', 'hmtx', 'cmap', 'loca', 'glyf']) if (!this.tables[t]) throw fail(t === 'glyf' || t === 'loca' ? 'CFF_UNSUPPORTED' : 'BAD_FONT', `Missing ${t} table`);

    const head = this.tables.head.offset;
    this.unitsPerEm = buf.readUInt16BE(head + 18) || 1000;
    this.bbox = [buf.readInt16BE(head + 36), buf.readInt16BE(head + 38), buf.readInt16BE(head + 40), buf.readInt16BE(head + 42)];
    this.macStyle = buf.readUInt16BE(head + 44);
    this.indexToLocFormat = buf.readInt16BE(head + 50);
    const hhea = this.tables.hhea.offset;
    this.ascender = buf.readInt16BE(hhea + 4);
    this.descender = buf.readInt16BE(hhea + 6);
    this.lineGap = buf.readInt16BE(hhea + 8);
    this.numberOfHMetrics = buf.readUInt16BE(hhea + 34);
    this.numGlyphs = buf.readUInt16BE(this.tables.maxp.offset + 4);
    this.capHeight = Math.round(this.ascender * 0.7);
    this.weight = 400;
    this.fsType = 0;
    const os2 = this.tables['OS/2'];
    if (os2 && os2.length >= 78) {
      this.weight = buf.readUInt16BE(os2.offset + 4);
      this.fsType = buf.readUInt16BE(os2.offset + 8);
      this.typoAscender = buf.readInt16BE(os2.offset + 68);
      this.typoDescender = buf.readInt16BE(os2.offset + 70);
      if (buf.readUInt16BE(os2.offset) >= 2 && os2.length >= 90) this.capHeight = buf.readInt16BE(os2.offset + 88) || this.capHeight;
    }
    this.italicAngle = 0;
    this.isFixedPitch = false;
    const post = this.tables.post;
    if (post && post.length >= 16) {
      this.italicAngle = buf.readInt32BE(post.offset + 4) / 65536;
      this.underlinePosition = buf.readInt16BE(post.offset + 8);
      this.underlineThickness = buf.readInt16BE(post.offset + 10);
      this.isFixedPitch = buf.readUInt32BE(post.offset + 12) !== 0;
    }
    this.names = this.readNames();
    this.postscriptName = (this.names[6] || this.names[4] || 'Font').replace(/[^A-Za-z0-9-]/g, '') || 'Font';
    this.familyName = this.names[1] || this.postscriptName;
    this.subfamilyName = this.names[2] || '';
    this.cmapLookup = this.readCmap();
    this.gidCache = new Map();
  }

  /** Embedding allowed by OS/2 fsType (restricted-license and bitmap-only fonts are not). */
  get embeddable() {
    if ((this.fsType & 0x000f) === 0x0002) return false;
    if (this.fsType & 0x0200) return false;
    return true;
  }

  readNames() {
    const out = {};
    const t = this.tables.name;
    if (!t) return out;
    const b = this.buf;
    const count = b.readUInt16BE(t.offset + 2);
    const strOff = t.offset + b.readUInt16BE(t.offset + 4);
    const score = {};
    for (let i = 0; i < count; i++) {
      const r = t.offset + 6 + 12 * i;
      const platform = b.readUInt16BE(r);
      const encoding = b.readUInt16BE(r + 2);
      const language = b.readUInt16BE(r + 4);
      const id = b.readUInt16BE(r + 6);
      const len = b.readUInt16BE(r + 8);
      const off = strOff + b.readUInt16BE(r + 10);
      if (off + len > b.length || ![1, 2, 4, 6].includes(id)) continue;
      let s = null; let sc = 0;
      if (platform === 3 && (encoding === 1 || encoding === 10 || encoding === 0)) {
        const u = Buffer.alloc(len);
        for (let k = 0; k + 1 < len; k += 2) { u[k] = b[off + k + 1]; u[k + 1] = b[off + k]; }
        s = u.toString('utf16le');
        sc = language === 0x409 ? 3 : 2;
      } else if (platform === 1 && encoding === 0) { s = b.toString('latin1', off, off + len); sc = 1; } else if (platform === 0) {
        const u = Buffer.alloc(len);
        for (let k = 0; k + 1 < len; k += 2) { u[k] = b[off + k + 1]; u[k + 1] = b[off + k]; }
        s = u.toString('utf16le'); sc = 1;
      }
      if (s != null && sc > (score[id] || 0)) { out[id] = s.replace(/\u0000/g, ''); score[id] = sc; }
    }
    return out;
  }

  readCmap() {
    const b = this.buf;
    const cmap = this.tables.cmap.offset;
    const n = b.readUInt16BE(cmap + 2);
    const subs = [];
    for (let i = 0; i < n; i++) {
      const r = cmap + 4 + 8 * i;
      const platform = b.readUInt16BE(r);
      const encoding = b.readUInt16BE(r + 2);
      const off = cmap + b.readUInt32BE(r + 4);
      if (off + 4 > b.length) continue;
      subs.push({ platform, encoding, off, format: b.readUInt16BE(off) });
    }
    const rank = (s) => {
      if (s.format === 12 && ((s.platform === 3 && s.encoding === 10) || s.platform === 0)) return 4;
      if (s.format === 4 && s.platform === 3 && s.encoding === 1) return 3;
      if (s.format === 4 && s.platform === 0) return 2;
      if (s.format === 4 && s.platform === 3 && s.encoding === 0) return 1;
      return 0;
    };
    subs.sort((a, c) => rank(c) - rank(a));
    const best = subs[0];
    if (!best || rank(best) === 0) throw fail('BAD_FONT', 'No Unicode cmap (format 4 or 12)');
    this.symbolCmap = best.platform === 3 && best.encoding === 0;
    if (best.format === 12) {
      const nGroups = b.readUInt32BE(best.off + 12);
      const g = best.off + 16;
      return (cp) => {
        let lo = 0; let hi = nGroups - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const r = g + mid * 12;
          const start = b.readUInt32BE(r);
          const end = b.readUInt32BE(r + 4);
          if (cp < start) hi = mid - 1;
          else if (cp > end) lo = mid + 1;
          else return b.readUInt32BE(r + 8) + (cp - start);
        }
        return 0;
      };
    }
    const off = best.off;
    const segX2 = b.readUInt16BE(off + 6);
    const seg = segX2 / 2;
    const ends = off + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      let lo = 0; let hi = seg - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (b.readUInt16BE(ends + mid * 2) < cp) lo = mid + 1; else hi = mid;
      }
      const start = b.readUInt16BE(starts + lo * 2);
      if (cp < start || cp > b.readUInt16BE(ends + lo * 2)) return 0;
      const delta = b.readInt16BE(deltas + lo * 2);
      const ro = b.readUInt16BE(ranges + lo * 2);
      if (ro === 0) return (cp + delta) & 0xffff;
      const addr = ranges + lo * 2 + ro + (cp - start) * 2;
      if (addr + 2 > b.length) return 0;
      const gid = b.readUInt16BE(addr);
      return gid === 0 ? 0 : (gid + delta) & 0xffff;
    };
  }

  /** Glyph id for a Unicode code point (0 = .notdef). */
  glyphId(cp) {
    let g = this.gidCache.get(cp);
    if (g == null) {
      g = this.cmapLookup(cp);
      if (!g && this.symbolCmap && cp < 0x100) g = this.cmapLookup(0xf000 + cp);
      if (g >= this.numGlyphs) g = 0;
      this.gidCache.set(cp, g);
    }
    return g;
  }

  /** Advance width in font units. */
  advance(gid) {
    const h = this.tables.hmtx.offset;
    const i = gid < this.numberOfHMetrics ? gid : this.numberOfHMetrics - 1;
    return this.buf.readUInt16BE(h + i * 4);
  }

  lsb(gid) {
    const h = this.tables.hmtx.offset;
    if (gid < this.numberOfHMetrics) return this.buf.readInt16BE(h + gid * 4 + 2);
    const at = h + this.numberOfHMetrics * 4 + (gid - this.numberOfHMetrics) * 2;
    return at + 2 <= this.tables.hmtx.offset + this.tables.hmtx.length ? this.buf.readInt16BE(at) : 0;
  }

  /** [start, end) byte range of a glyph inside the file. */
  glyphRange(gid) {
    const loca = this.tables.loca.offset;
    const glyf = this.tables.glyf.offset;
    let a; let z;
    if (this.indexToLocFormat === 0) { a = this.buf.readUInt16BE(loca + gid * 2) * 2; z = this.buf.readUInt16BE(loca + gid * 2 + 2) * 2; } else { a = this.buf.readUInt32BE(loca + gid * 4); z = this.buf.readUInt32BE(loca + gid * 4 + 4); }
    if (z < a || glyf + z > this.buf.length) return [glyf, glyf];
    return [glyf + a, glyf + z];
  }

  /** Component glyph ids of a composite glyph and the byte offsets of their index fields. */
  componentRefs(gid) {
    const [a, z] = this.glyphRange(gid);
    if (z - a < 10 || this.buf.readInt16BE(a) >= 0) return [];
    const refs = [];
    let p = a + 10;
    for (let guard = 0; guard < 1000 && p + 4 <= z; guard++) {
      const flags = this.buf.readUInt16BE(p);
      refs.push({ gid: this.buf.readUInt16BE(p + 2), at: p + 2 - a });
      p += 4;
      p += flags & 0x0001 ? 4 : 2; // ARG_1_AND_2_ARE_WORDS
      if (flags & 0x0008) p += 2; // WE_HAVE_A_SCALE
      else if (flags & 0x0040) p += 4; // WE_HAVE_AN_X_AND_Y_SCALE
      else if (flags & 0x0080) p += 8; // WE_HAVE_A_TWO_BY_TWO
      if (!(flags & 0x0020)) break; // MORE_COMPONENTS
    }
    return refs;
  }

  /**
   * Build a subset font.
   * @param {number[]} gids  old glyph ids; new id = index. gids[0] should be 0 (.notdef).
   *                         Components of composite glyphs are appended to the array in place.
   * @param {Map<number, number>} [unicodes]  old gid -> code point, for the subset cmap
   * @returns {Buffer}
   */
  subset(gids, unicodes = new Map()) {
    const map = new Map();
    gids.forEach((g, i) => { if (!map.has(g)) map.set(g, i); });
    for (let i = 0; i < gids.length; i++) {
      for (const r of this.componentRefs(gids[i])) if (!map.has(r.gid) && r.gid < this.numGlyphs) { map.set(r.gid, gids.length); gids.push(r.gid); }
    }
    const n = gids.length;
    const glyphParts = [];
    const loca = Buffer.alloc((n + 1) * 4);
    let pos = 0;
    for (let i = 0; i < n; i++) {
      loca.writeUInt32BE(pos, i * 4);
      const [a, z] = this.glyphRange(gids[i]);
      if (z > a) {
        let g = Buffer.from(this.buf.subarray(a, z));
        for (const r of this.componentRefs(gids[i])) g.writeUInt16BE(map.has(r.gid) ? map.get(r.gid) : 0, r.at);
        const pad = (4 - (g.length % 4)) % 4;
        if (pad) g = Buffer.concat([g, Buffer.alloc(pad)]);
        glyphParts.push(g);
        pos += g.length;
      }
    }
    loca.writeUInt32BE(pos, n * 4);
    const glyf = Buffer.concat(glyphParts);
    const hmtx = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) { hmtx.writeUInt16BE(this.advance(gids[i]), i * 4); hmtx.writeInt16BE(this.lsb(gids[i]), i * 4 + 2); }
    const copy = (tag) => Buffer.from(this.buf.subarray(this.tables[tag].offset, this.tables[tag].offset + this.tables[tag].length));
    const head = copy('head');
    head.writeUInt32BE(0, 8); // checkSumAdjustment, set below
    head.writeInt16BE(1, 50); // long loca
    const hhea = copy('hhea');
    hhea.writeUInt16BE(n, 34);
    const maxp = copy('maxp');
    maxp.writeUInt16BE(n, 4);
    const post = Buffer.alloc(32);
    post.writeUInt32BE(0x00030000, 0);
    post.writeInt32BE(Math.round(this.italicAngle * 65536), 4);
    post.writeInt16BE(this.underlinePosition || 0, 8);
    post.writeInt16BE(this.underlineThickness || 0, 10);
    post.writeUInt32BE(this.isFixedPitch ? 1 : 0, 12);
    const pairs = [];
    for (const [old, cp] of unicodes) if (map.has(old) && cp <= 0xffff) pairs.push([cp, map.get(old)]);
    const tables = { head, hhea, maxp, hmtx, loca, glyf, post, cmap: buildCmap(pairs), name: buildName(this.familyName, this.subfamilyName || 'Regular', this.postscriptName) };
    if (this.tables['OS/2']) tables['OS/2'] = copy('OS/2');
    for (const t of ['cvt ', 'fpgm', 'prep', 'gasp']) if (this.tables[t]) tables[t] = copy(t);
    return buildSfnt(tables);
  }
}

function checksum(buf) {
  let sum = 0;
  const n = buf.length;
  for (let i = 0; i < n; i += 4) {
    const v = ((buf[i] << 24) | ((i + 1 < n ? buf[i + 1] : 0) << 16) | ((i + 2 < n ? buf[i + 2] : 0) << 8) | (i + 3 < n ? buf[i + 3] : 0)) >>> 0;
    sum = (sum + v) >>> 0;
  }
  return sum;
}

function buildSfnt(tables) {
  const tags = Object.keys(tables).sort();
  const num = tags.length;
  let pow = 1; let sel = 0;
  while (pow * 2 <= num) { pow *= 2; sel++; }
  const header = Buffer.alloc(12 + 16 * num);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(num, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(sel, 8);
  header.writeUInt16BE(num * 16 - pow * 16, 10);
  const parts = [header];
  let offset = header.length;
  let headAt = 0;
  tags.forEach((tag, i) => {
    const data = tables[tag];
    const rec = 12 + 16 * i;
    header.write(tag, rec, 4, 'latin1');
    header.writeUInt32BE(checksum(data), rec + 4);
    header.writeUInt32BE(offset, rec + 8);
    header.writeUInt32BE(data.length, rec + 12);
    if (tag === 'head') headAt = offset;
    const pad = (4 - (data.length % 4)) % 4;
    parts.push(data);
    if (pad) parts.push(Buffer.alloc(pad));
    offset += data.length + pad;
  });
  const out = Buffer.concat(parts);
  out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headAt + 8);
  return out;
}

/** cmap with one (3,1) format 4 subtable for [codePoint, glyphId] pairs (BMP only). */
function buildCmap(pairs) {
  const sorted = [...new Map(pairs.filter(([c]) => c < 0xffff)).entries()].sort((a, b) => a[0] - b[0]);
  const segs = [];
  for (const [c, g] of sorted) {
    const last = segs[segs.length - 1];
    if (last && c === last.end + 1 && g === last.gid + (c - last.start)) last.end = c;
    else segs.push({ start: c, end: c, gid: g });
  }
  segs.push({ start: 0xffff, end: 0xffff, gid: 0, last: true });
  const seg = segs.length;
  let pow = 1; let sel = 0;
  while (pow * 2 <= seg) { pow *= 2; sel++; }
  const len = 16 + seg * 8;
  const sub = Buffer.alloc(len);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(len, 2);
  sub.writeUInt16BE(0, 4);
  sub.writeUInt16BE(seg * 2, 6);
  sub.writeUInt16BE(pow * 2, 8);
  sub.writeUInt16BE(sel, 10);
  sub.writeUInt16BE(seg * 2 - pow * 2, 12);
  segs.forEach((s, i) => {
    sub.writeUInt16BE(s.end, 14 + i * 2);
    sub.writeUInt16BE(s.start, 16 + seg * 2 + i * 2);
    sub.writeUInt16BE(s.last ? 1 : (s.gid - s.start) & 0xffff, 16 + seg * 4 + i * 2);
    sub.writeUInt16BE(0, 16 + seg * 6 + i * 2);
  });
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(1, 2);
  head.writeUInt16BE(3, 4);
  head.writeUInt16BE(1, 6);
  head.writeUInt32BE(12, 8);
  return Buffer.concat([head, sub]);
}

/** Minimal name table (Windows Unicode English) with family, subfamily, full and PostScript names. */
function buildName(family, sub, ps) {
  const recs = [[1, family], [2, sub], [3, `${ps};subset`], [4, `${family} ${sub}`.trim()], [6, ps]];
  const strings = recs.map(([, s]) => { const le = Buffer.from(String(s), 'utf16le'); for (let i = 0; i + 1 < le.length; i += 2) { const t = le[i]; le[i] = le[i + 1]; le[i + 1] = t; } return le; });
  const head = Buffer.alloc(6 + 12 * recs.length);
  head.writeUInt16BE(0, 0);
  head.writeUInt16BE(recs.length, 2);
  head.writeUInt16BE(head.length, 4);
  let off = 0;
  recs.forEach(([id], i) => {
    const r = 6 + 12 * i;
    head.writeUInt16BE(3, r); head.writeUInt16BE(1, r + 2); head.writeUInt16BE(0x409, r + 4); head.writeUInt16BE(id, r + 6);
    head.writeUInt16BE(strings[i].length, r + 8); head.writeUInt16BE(off, r + 10);
    off += strings[i].length;
  });
  return Buffer.concat([head, ...strings]);
}

/** Number of faces in a font file buffer (1 for a plain .ttf). */
function faceCount(buf) { return buf.length >= 12 && buf.toString('latin1', 0, 4) === 'ttcf' ? buf.readUInt32BE(8) : 1; }

module.exports = { TrueTypeFont, faceCount, buildSfnt, checksum };
