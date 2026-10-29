// DXF writer for AutoCAD 2000 and newer (AC1015 … AC1032), used by
// exportDxf() in dxf.js when a version other than R12 is chosen.
//
// It has the same drawing interface as the R12 writer there (line, poly,
// circle, arc, text, track, ext) and adds what the newer format can carry:
// LWPOLYLINE, MTEXT, blocks with INSERTs, true colour (2004+), lineweights,
// layer descriptions and plot flags, and UTF-8 text (2007+). document()
// wraps the entities in a complete drawing database: handles and owner
// links on every object, the nine symbol tables with their BLOCK_RECORDs,
// *Model_Space / *Paper_Space, and an OBJECTS section with the root
// dictionary, groups, layouts, the Standard multiline style and the plot
// style placeholder — what AutoCAD, BricsCAD, ODA-based programs and ezdxf
// expect to find.

export const DXF_VERSIONS = [
  { id: "R12", acadver: "AC1009", label: "AutoCAD R12" },
  { id: "2000", acadver: "AC1015", label: "AutoCAD 2000" },
  { id: "2004", acadver: "AC1018", label: "AutoCAD 2004" },
  { id: "2007", acadver: "AC1021", label: "AutoCAD 2007" },
  { id: "2010", acadver: "AC1024", label: "AutoCAD 2010" },
  { id: "2013", acadver: "AC1027", label: "AutoCAD 2013" },
  { id: "2018", acadver: "AC1032", label: "AutoCAD 2018" },
];

const DEG = Math.PI / 180;
const norm360 = (a) => ((a % 360) + 360) % 360;
const fmt = (v) => {
  const n = Math.round((+v || 0) * 1e6) / 1e6;
  return Object.is(n, -0) || Math.abs(n) < 1e-9 ? "0" : String(n);
};

// Lineweights in 1/100 mm (DXF code 370); -3 = default.
export const LAYER_LINEWEIGHTS = {
  "A-WALL": 50, "A-WALL-EXST": 35, "A-WALL-DEMO": 25, "A-WALL-PATT": 13, "A-DOOR": 25, "A-DOOR-DEMO": 18, "A-GLAZ": 25, "A-GLAZ-DEMO": 18,
  "A-MASS": 25, "S-GRID": 18, "S-GRID-IDEN": 18, "A-AREA": 13, "A-AREA-IDEN": 18, "A-FURN": 18, "A-FLOR-STRS": 25, "A-COLS": 50,
  "A-ROOF": 25, "A-ANNO-DIMS": 18, "A-ANNO-TEXT": 18,
};

const hexToInt = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  return m ? parseInt(m[1], 16) : null;
};

export class ModernDxfWriter {
  constructor(version = "2018", { encodeText } = {}) {
    const v = DXF_VERSIONS.find((x) => x.id === String(version)) || DXF_VERSIONS[DXF_VERSIONS.length - 1];
    if (v.id === "R12") throw new Error("ModernDxfWriter writes AutoCAD 2000 and newer");
    this.version = v;
    this.utf8 = v.acadver >= "AC1021";
    this.trueColor = v.acadver >= "AC1018";
    this.encodeText = encodeText || ((s) => String(s));
    // The fixed objects get the handles AutoCAD gives them in a new drawing
    // (1 = block table, 1F = *Model_Space …): some readers rely on those.
    const fixed = {
      brTable: 0x1, layerTable: 0x2, styleTable: 0x3, ltypeTable: 0x5, viewTable: 0x6, ucsTable: 0x7, vportTable: 0x8, appidTable: 0x9, dimstyleTable: 0xa,
      root: 0xc, groups: 0xd, mlstyles: 0xe, plotstyles: 0xf, normal: 0x10, style: 0x11, mlStandard: 0x18, plotsettings: 0x19, layouts: 0x1a,
      brPaper: 0x1b, blkPaper: 0x1c, endPaper: 0x1d, layoutPaper: 0x1e, brModel: 0x1f, blkModel: 0x20, endModel: 0x21, layoutModel: 0x22, dimstyle: 0x27, vport: 0x29,
    };
    this.H = {};
    for (const [k, v] of Object.entries(fixed)) this.H[k] = v.toString(16).toUpperCase();
    this.next = 0x30;
    this.out = []; // model space entities
    this.target = this.out;
    this.owner = this.H.brModel;
    this.ext = null;
    this.blocks = new Map(); // key → {name, br, begin, end, out, base}
    this.mtext = true; // multi-line notes as one MTEXT
  }

  handle() { return (this.next++).toString(16).toUpperCase(); }
  g(code, value) { this.target.push(String(code).padStart(3, " "), String(value)); }
  n(code, v) { this.g(code, fmt(v)); }
  str(s) {
    // 2007+ is UTF-8; older files carry non-ASCII as \U+XXXX (encodeText).
    if (this.utf8) {
      let out = "";
      for (const ch of String(s).replace(/%%/g, "%%%%%%")) if (ch.charCodeAt(0) >= 32) out += ch;
      return out;
    }
    return this.encodeText(s);
  }

  track(x, y) {
    if (this.target !== this.out) return; // block contents count where they are inserted
    const X = x, Y = -y;
    if (!this.ext) this.ext = { x1: X, y1: Y, x2: X, y2: Y };
    else { this.ext.x1 = Math.min(this.ext.x1, X); this.ext.y1 = Math.min(this.ext.y1, Y); this.ext.x2 = Math.max(this.ext.x2, X); this.ext.y2 = Math.max(this.ext.y2, Y); }
  }
  p(code, x, y) {
    this.track(x, y);
    this.n(code, x);
    this.n(code + 10, -y);
    this.n(code + 20, 0);
  }
  head(type, layer, o = {}, sub = null) {
    this.g(0, type);
    this.g(5, this.handle());
    this.g(330, this.owner);
    this.g(100, "AcDbEntity");
    this.g(8, layer);
    if (o.linetype) this.g(6, o.linetype);
    if (o.color !== undefined && o.color !== null) this.g(62, o.color);
    const tc = this.trueColor && o.trueColor ? hexToInt(o.trueColor) : null;
    if (tc !== null) this.g(420, tc);
    if (sub) this.g(100, sub);
  }
  line(layer, a, b, o) {
    this.head("LINE", layer, o, "AcDbLine");
    this.p(10, a[0], a[1]);
    this.p(11, b[0], b[1]);
  }
  poly(layer, pts, closed = true, o) {
    if (pts.length < 2) return;
    this.head("LWPOLYLINE", layer, o, "AcDbPolyline");
    this.g(90, pts.length);
    this.g(70, closed ? 1 : 0);
    this.n(43, 0);
    for (const [x, y] of pts) {
      this.track(x, y);
      this.n(10, x);
      this.n(20, -y);
    }
  }
  circle(layer, cx, cy, r, o) {
    this.head("CIRCLE", layer, o, "AcDbCircle");
    this.p(10, cx, cy);
    this.n(40, r);
    this.track(cx - r, cy - r);
    this.track(cx + r, cy + r);
  }
  arc(layer, cx, cy, r, a1, a2, ccw, o) {
    if (Math.abs(a2 - a1) >= 360 - 1e-9) return this.circle(layer, cx, cy, r, o);
    const s = norm360(ccw ? -a1 : -a2), e = norm360(ccw ? -a2 : -a1);
    this.head("ARC", layer, o, "AcDbCircle");
    this.p(10, cx, cy);
    this.n(40, r);
    this.g(100, "AcDbArc");
    this.n(50, s);
    this.n(51, e);
    for (const a of [s, e, ...[0, 90, 180, 270].filter((q) => norm360(q - s) <= norm360(e - s))]) this.track(cx + r * Math.cos(a * DEG), cy - r * Math.sin(a * DEG));
  }
  text(layer, str, x, y, size, { rot = 0, align = "left", valign = "top", ...o } = {}) {
    const s = this.str(str);
    if (!s.trim()) return;
    const hj = { left: 0, center: 1, right: 2 }[align] ?? 0;
    const vj = { baseline: 0, bottom: 1, middle: 2, top: 3 }[valign] ?? 0;
    this.head("TEXT", layer, o, "AcDbText");
    this.p(10, x, y);
    this.n(40, size);
    this.g(1, s);
    if (rot) this.n(50, norm360(-rot));
    this.g(7, "Standard");
    if (hj) this.g(72, hj);
    if (hj || vj) this.p(11, x, y);
    this.g(100, "AcDbText");
    if (vj) this.g(73, vj);
  }
  // Several lines of text as one MTEXT, anchored at its top (plan x, y).
  mtextBlock(layer, lines, x, y, size, { rot = 0, align = "left", ...o } = {}) {
    const body = lines.map((l) => this.str(String(l).replace(/\\/g, "\\\\").replace(/[{}]/g, (c) => `\\${c}`))).join("\\P");
    if (!body.replace(/\\P/g, "").trim()) return;
    this.head("MTEXT", layer, o, "AcDbMText");
    this.p(10, x, y);
    this.n(40, size);
    this.n(41, 0);
    this.g(71, { left: 1, center: 2, right: 3 }[align] ?? 1);
    this.g(72, 1);
    // Text longer than 250 characters goes in 3-groups first.
    let rest = body;
    while (rest.length > 250) { this.g(3, rest.slice(0, 250)); rest = rest.slice(250); }
    this.g(1, rest);
    this.g(7, "Standard");
    this.n(11, Math.cos(-rot * DEG)); this.n(21, Math.sin(-rot * DEG)); this.n(31, 0);
    this.n(44, 1); // line spacing factor
    // The block of lines spans this much downwards (for the extents).
    this.track(x, y + size * 1.25 * lines.length);
  }

  // A block definition, drawn once by `draw(W)` in its own frame (plan
  // coordinates around 0, 0); returns its name. Same key → same block.
  defineBlock(key, name, draw) {
    const have = this.blocks.get(key);
    if (have) return have.name;
    let unique = name, k = 2;
    const names = new Set([...this.blocks.values()].map((b) => b.name.toUpperCase()));
    while (names.has(unique.toUpperCase())) unique = `${name}_${k++}`;
    const b = { name: unique, br: this.handle(), begin: this.handle(), end: this.handle(), out: [] };
    this.blocks.set(key, b);
    const saved = [this.target, this.owner];
    this.target = b.out; this.owner = b.br;
    try { draw(this); } finally { [this.target, this.owner] = saved; }
    return unique;
  }
  // Plan point, plan rotation (degrees, as rotPt) → INSERT.
  insert(layer, name, x, y, rot = 0, o, extentPts = []) {
    this.head("INSERT", layer, o, "AcDbBlockReference");
    this.g(2, name);
    this.p(10, x, y);
    if (norm360(-rot) > 1e-9) this.n(50, norm360(-rot));
    for (const [px, py] of extentPts) this.track(px, py);
  }

  // ---------------------------------------------------------------- document
  // layers: [{name, color (ACI), trueColor?, linetype, visible, description?, lineweight?, plot?}]
  // linetypes: [{name, desc, dashes}]
  document({ layers, linetypes, ltscale = 20, title = "" }) {
    const H = this.H;
    const out = [];
    this.target = out;
    const g = (c, v) => this.g(c, v), n = (c, v) => this.n(c, v);
    const ext = this.ext || { x1: 0, y1: 0, x2: 0, y2: 0 };
    const tableHead = (name, h, count, extra) => { g(0, "TABLE"); g(2, name); g(5, h); g(330, 0); g(100, "AcDbSymbolTable"); g(70, count); if (extra) g(100, extra); };
    const record = (type, h, owner, sub) => { g(0, type); g(type === "DIMSTYLE" ? 105 : 5, h); g(330, owner); g(100, "AcDbSymbolTableRecord"); g(100, sub); };
    const ltNames = new Map(linetypes.map((lt) => [lt.name.toUpperCase(), lt.name === "CONTINUOUS" ? "Continuous" : lt.name]));
    const ltName = (s) => ltNames.get(String(s || "CONTINUOUS").toUpperCase()) || "Continuous";
    // Linetypes named in entities (6) must match the table's spelling.
    const fixLinetypes = (buf) => { for (let i = 0; i + 1 < buf.length; i += 2) if (buf[i] === "  6") buf[i + 1] = ltName(buf[i + 1]); };
    fixLinetypes(this.out);
    for (const b of this.blocks.values()) fixLinetypes(b.out);

    // HEADER
    g(0, "SECTION"); g(2, "HEADER");
    g(9, "$ACADVER"); g(1, this.version.acadver);
    g(9, "$ACADMAINTVER"); g(70, this.version.acadver >= "AC1032" ? 105 : 6);
    g(9, "$DWGCODEPAGE"); g(3, "ANSI_1252");
    g(9, "$INSBASE"); n(10, 0); n(20, 0); n(30, 0);
    g(9, "$EXTMIN"); n(10, ext.x1); n(20, ext.y1); n(30, 0);
    g(9, "$EXTMAX"); n(10, ext.x2); n(20, ext.y2); n(30, 0);
    g(9, "$LIMMIN"); n(10, ext.x1); n(20, ext.y1);
    g(9, "$LIMMAX"); n(10, ext.x2); n(20, ext.y2);
    g(9, "$LTSCALE"); n(40, ltscale);
    g(9, "$TEXTSTYLE"); g(7, "Standard");
    g(9, "$CLAYER"); g(8, "0");
    g(9, "$CELTYPE"); g(6, "ByLayer");
    g(9, "$CECOLOR"); g(62, 256);
    g(9, "$DIMSTYLE"); g(2, "Standard");
    g(9, "$LUNITS"); g(70, 2);
    g(9, "$LUPREC"); g(70, 0);
    g(9, "$HANDSEED"); g(5, "0"); const seedAt = out.length - 1;
    g(9, "$MEASUREMENT"); g(70, 1);
    g(9, "$LWDISPLAY"); g(290, 1);
    g(9, "$INSUNITS"); g(70, 4);
    g(9, "$PSTYLEMODE"); g(290, 1);
    if (title) { g(9, "$PROJECTNAME"); g(1, this.str(title).slice(0, 250)); }
    g(0, "ENDSEC");

    // CLASSES
    g(0, "SECTION"); g(2, "CLASSES");
    for (const [dxf, cpp] of [["ACDBDICTIONARYWDFLT", "AcDbDictionaryWithDefault"], ["ACDBPLACEHOLDER", "AcDbPlaceHolder"], ["LAYOUT", "AcDbLayout"]]) {
      g(0, "CLASS"); g(1, dxf); g(2, cpp); g(3, "ObjectDBX Classes"); g(90, 0); if (this.version.acadver >= "AC1018") g(91, 0); g(280, 0); g(281, 0);
    }
    g(0, "ENDSEC");

    // TABLES
    g(0, "SECTION"); g(2, "TABLES");
    tableHead("VPORT", H.vportTable, 1);
    record("VPORT", H.vport, H.vportTable, "AcDbViewportTableRecord");
    const vw = Math.max(1, ext.x2 - ext.x1), vh = Math.max(1, ext.y2 - ext.y1);
    g(2, "*Active"); g(70, 0); n(10, 0); n(20, 0); n(11, 1); n(21, 1);
    n(12, (ext.x1 + ext.x2) / 2); n(22, (ext.y1 + ext.y2) / 2); n(13, 0); n(23, 0); n(14, 10); n(24, 10); n(15, 10); n(25, 10);
    n(16, 0); n(26, 0); n(36, 1); n(17, 0); n(27, 0); n(37, 0);
    n(40, Math.max(vh, vw / 1.6) * 1.1); n(41, 1.6); n(42, 50); n(43, 0); n(44, 0); n(50, 0); n(51, 0);
    g(71, 0); g(72, 1000); g(73, 1); g(74, 3); g(75, 0); g(76, 0); g(77, 0); g(78, 0); g(281, 0); g(65, 1); n(110, 0); n(120, 0); n(130, 0); n(111, 1); n(121, 0); n(131, 0); n(112, 0); n(122, 1); n(132, 0); g(79, 0); n(146, 0);
    g(0, "ENDTAB");

    const lts = [{ name: "ByBlock", desc: "", dashes: [] }, { name: "ByLayer", desc: "", dashes: [] }, ...linetypes.map((lt) => ({ ...lt, name: ltName(lt.name) }))];
    tableHead("LTYPE", H.ltypeTable, lts.length);
    for (const lt of lts) {
      record("LTYPE", this.handle(), H.ltypeTable, "AcDbLinetypeTableRecord");
      g(2, lt.name); g(70, 0); g(3, lt.desc); g(72, 65); g(73, lt.dashes.length); n(40, lt.dashes.reduce((s, v) => s + Math.abs(v), 0));
      for (const d of lt.dashes) { n(49, d); g(74, 0); }
    }
    g(0, "ENDTAB");

    tableHead("LAYER", H.layerTable, layers.length);
    for (const l of layers) {
      record("LAYER", this.handle(), H.layerTable, "AcDbLayerTableRecord");
      g(2, l.name); g(70, 0); g(62, l.visible === false ? -Math.abs(l.color || 7) : Math.abs(l.color || 7));
      const tc = this.trueColor && l.trueColor ? hexToInt(l.trueColor) : null;
      if (tc !== null) g(420, tc);
      g(6, ltName(l.linetype));
      if (l.plot === false || /^defpoints$/i.test(l.name)) g(290, 0);
      g(370, l.lineweight ?? -3);
      g(390, H.normal);
      if (l.description) { g(1001, "AcAecLayerStandard"); g(1000, ""); g(1000, this.str(l.description).slice(0, 250)); }
    }
    g(0, "ENDTAB");

    tableHead("STYLE", H.styleTable, 1);
    record("STYLE", H.style, H.styleTable, "AcDbTextStyleTableRecord");
    g(2, "Standard"); g(70, 0); n(40, 0); n(41, 1); n(50, 0); g(71, 0); n(42, 250); g(3, "txt"); g(4, "");
    g(0, "ENDTAB");

    tableHead("VIEW", H.viewTable, 0); g(0, "ENDTAB");
    tableHead("UCS", H.ucsTable, 0); g(0, "ENDTAB");

    const apps = ["ACAD", "AcAecLayerStandard", "MYARCHITECTURE"];
    tableHead("APPID", H.appidTable, apps.length);
    for (const a of apps) { record("APPID", this.handle(), H.appidTable, "AcDbRegAppTableRecord"); g(2, a); g(70, 0); }
    g(0, "ENDTAB");

    tableHead("DIMSTYLE", H.dimstyleTable, 1, "AcDbDimStyleTable");
    record("DIMSTYLE", H.dimstyle, H.dimstyleTable, "AcDbDimStyleTableRecord");
    g(2, "Standard"); g(70, 0); n(40, 1); n(41, 100); n(42, 60); n(43, 380); n(44, 120); n(140, 180); n(141, 90); n(147, 60); g(77, 1); g(78, 8); g(271, 0); g(340, H.style);
    g(0, "ENDTAB");

    const blocks = [...this.blocks.values()];
    tableHead("BLOCK_RECORD", H.brTable, 2 + blocks.length);
    record("BLOCK_RECORD", H.brModel, H.brTable, "AcDbBlockTableRecord"); g(2, "*Model_Space"); g(340, H.layoutModel); g(280, 1); g(281, 0);
    record("BLOCK_RECORD", H.brPaper, H.brTable, "AcDbBlockTableRecord"); g(2, "*Paper_Space"); g(340, H.layoutPaper); g(280, 1); g(281, 0);
    for (const b of blocks) { record("BLOCK_RECORD", b.br, H.brTable, "AcDbBlockTableRecord"); g(2, b.name); g(340, 0); g(280, 1); g(281, 0); }
    g(0, "ENDTAB");
    g(0, "ENDSEC");

    // BLOCKS
    g(0, "SECTION"); g(2, "BLOCKS");
    const block = (name, br, begin, end, body, flags = 0) => {
      g(0, "BLOCK"); g(5, begin); g(330, br); g(100, "AcDbEntity"); g(8, "0"); g(100, "AcDbBlockBegin"); g(2, name); g(70, flags); n(10, 0); n(20, 0); n(30, 0); g(3, name); g(1, "");
      for (const line of body) out.push(line);
      g(0, "ENDBLK"); g(5, end); g(330, br); g(100, "AcDbEntity"); g(8, "0"); g(100, "AcDbBlockEnd");
    };
    block("*Model_Space", H.brModel, H.blkModel, H.endModel, []);
    block("*Paper_Space", H.brPaper, H.blkPaper, H.endPaper, []);
    for (const b of blocks) block(b.name, b.br, b.begin, b.end, b.out);
    g(0, "ENDSEC");

    // ENTITIES
    g(0, "SECTION"); g(2, "ENTITIES");
    for (const line of this.out) out.push(line); // a spread overflows the call stack on big floors
    g(0, "ENDSEC");

    // OBJECTS
    g(0, "SECTION"); g(2, "OBJECTS");
    const dict = (h, owner, entries, hard = 1) => { g(0, "DICTIONARY"); g(5, h); g(330, owner); g(100, "AcDbDictionary"); g(281, hard); for (const [k, v] of entries) { g(3, k); g(350, v); } };
    dict(H.root, 0, [["ACAD_GROUP", H.groups], ["ACAD_LAYOUT", H.layouts], ["ACAD_MLINESTYLE", H.mlstyles], ["ACAD_PLOTSETTINGS", H.plotsettings], ["ACAD_PLOTSTYLENAME", H.plotstyles]]);
    dict(H.groups, H.root, []);
    dict(H.layouts, H.root, [["Model", H.layoutModel], ["Layout1", H.layoutPaper]]);
    dict(H.mlstyles, H.root, [["Standard", H.mlStandard]]);
    dict(H.plotsettings, H.root, []);
    g(0, "ACDBDICTIONARYWDFLT"); g(5, H.plotstyles); g(330, H.root); g(100, "AcDbDictionary"); g(281, 1); g(3, "Normal"); g(350, H.normal); g(100, "AcDbDictionaryWithDefault"); g(340, H.normal);
    g(0, "ACDBPLACEHOLDER"); g(5, H.normal); g(330, H.plotstyles);
    g(0, "MLINESTYLE"); g(5, H.mlStandard); g(102, "{ACAD_REACTORS"); g(330, H.mlstyles); g(102, "}"); g(330, H.mlstyles); g(100, "AcDbMlineStyle");
    g(2, "Standard"); g(70, 0); g(3, ""); g(62, 256); n(51, 90); n(52, 90); g(71, 2); n(49, 0.5); g(62, 256); g(6, "BYLAYER"); n(49, -0.5); g(62, 256); g(6, "BYLAYER");
    const layout = (h, name, br, flags, order) => {
      g(0, "LAYOUT"); g(5, h); g(102, "{ACAD_REACTORS"); g(330, H.layouts); g(102, "}"); g(330, H.layouts);
      g(100, "AcDbPlotSettings"); g(1, ""); g(4, "A3"); g(6, ""); n(40, 7.5); n(41, 20); n(42, 7.5); n(43, 20); n(44, 420); n(45, 297); n(46, 0); n(47, 0); n(48, 0); n(49, 0); n(140, 0); n(141, 0); n(142, 1); n(143, 100);
      g(70, flags); g(72, 1); g(73, 0); g(74, 5); g(7, ""); g(75, 16); g(76, 0); g(77, 2); g(78, 300); n(147, 0.01); n(148, 0); n(149, 0);
      g(100, "AcDbLayout"); g(1, name); g(70, 1); g(71, order); n(10, 0); n(20, 0); n(11, 420); n(21, 297); n(12, 0); n(22, 0); n(32, 0);
      n(14, ext.x1); n(24, ext.y1); n(34, 0); n(15, ext.x2); n(25, ext.y2); n(35, 0); n(146, 0); n(13, 0); n(23, 0); n(33, 0); n(16, 1); n(26, 0); n(36, 0); n(17, 0); n(27, 1); n(37, 0); g(76, 1); g(330, br);
    };
    layout(H.layoutModel, "Model", H.brModel, 1712, 0);
    layout(H.layoutPaper, "Layout1", H.brPaper, 688, 1);
    g(0, "ENDSEC");
    g(0, "EOF");
    out[seedAt] = this.handle();
    return out.join("\n") + "\n";
  }
}
