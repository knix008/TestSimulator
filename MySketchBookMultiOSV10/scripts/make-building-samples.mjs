// Samples for "Import › Floor plan…" from other programs, and their tests:
//
//   apartment-59.pdf      the 59 m² apartment drawing (samples/plans/apartment-59.dxf) printed to an A3 PDF at
//                         1:50 — lines, arcs as Bézier curves, Korean room names (CID font + ToUnicode), layers as
//                         PDF optional content groups, a "SCALE 1:50" title; page 2 is the scanned copy (a picture)
//   duplex.ifc            the two-storey duplex template as IFC4 (storeys, walls with openings, doors, windows,
//                         spaces, stairs, furniture), millimetres, as BIM programs write it
//   duplex.sh3d           the same house as a Sweet Home 3D home (Home.xml, centimetres) with a curved garden wall,
//                         furniture, a furniture group and one piece with its own OBJ model
//   house-2room.tga       the house picture as a run-length encoded TGA
//   house-2room-2p.tif    a two-page TIFF (PackBits) (a cover page, then the plan), like a multi-page scan
//   apartment-59-bw.tif   the apartment picture as a black-and-white TIFF (LZW), as scanners save drawings
//
//   node scripts/make-building-samples.mjs      (after scripts/make-plan-samples.mjs)
//
// Every file is written here byte by byte (no PDF / IFC / SH3D library), so the readers are tested against
// files whose content is known; <id>.expected.json holds what the import must find.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';
import { buildTemplate } from '../src/engine/templates.js';
import { readDxf, flattenDxf, extentOf } from '../src/io/plan-dxf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'samples', 'plans');
const r3 = (v) => Math.round(v * 1000) / 1000;
const NAMES = { living: '거실', kitchen: '주방', bath: '욕실', bath2: '욕실2', bedroom: '침실1', bedroom2: '침실2', dressing: '드레스룸', office: '서재' };

// ───────────────────────── PDF

const PT_PER_MM = 72 / 25.4;
const PDF_SCALE = 50; // 1:50
const PDF_MARGIN = [60, 120]; // points from the page corner to the drawing

/** Arc (centre, radius, start angle, ccw sweep; radians, y up) → cubic Bézier pieces of at most 90°. */
function arcBeziers(c, r, a0, sweep) {
  const n = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (sweep * i) / n; const t1 = a0 + (sweep * (i + 1)) / n;
    const k = (4 / 3) * Math.tan((t1 - t0) / 4);
    const p0 = [c[0] + r * Math.cos(t0), c[1] + r * Math.sin(t0)]; const p3 = [c[0] + r * Math.cos(t1), c[1] + r * Math.sin(t1)];
    out.push([p0, [p0[0] - k * r * Math.sin(t0), p0[1] + k * r * Math.cos(t0)], [p3[0] + k * r * Math.sin(t1), p3[1] - k * r * Math.cos(t1)], p3]);
  }
  return out;
}

/** A minimal PDF writer: objects, streams (Flate), xref. */
class PdfWriter {
  constructor() { this.objects = []; }
  add(body) { this.objects.push(body); return this.objects.length; }
  set(n, body) { this.objects[n - 1] = body; }
  reserve() { this.objects.push(null); return this.objects.length; }
  stream(dict, data, { compress = true } = {}) {
    const raw = typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data);
    const bytes = compress ? zlib.deflateSync(raw) : raw;
    return this.add({ dict: `<< ${dict} /Length ${bytes.length}${compress ? ' /Filter /FlateDecode' : ''} >>`, bytes });
  }
  toBuffer(rootRef) {
    const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let offset = parts[0].length;
    const offsets = [];
    this.objects.forEach((o, i) => {
      offsets.push(offset);
      const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
      const body = typeof o === 'string' ? Buffer.from(`${o}\nendobj\n`, 'latin1') : Buffer.concat([Buffer.from(`${o.dict}\nstream\n`, 'latin1'), o.bytes, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
      parts.push(head, body);
      offset += head.length + body.length;
    });
    const xref = [`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    parts.push(Buffer.from(`${xref}trailer\n<< /Size ${this.objects.length + 1} /Root ${rootRef} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(parts);
  }
}

async function writePdf() {
  const dxf = readDxf(fs.readFileSync(path.join(outDir, 'apartment-59.dxf')));
  const flat = flattenDxf(dxf, { keepHidden: true });
  const ext = extentOf(flat);
  const k = PT_PER_MM / PDF_SCALE; // drawing millimetres → points
  const P = ([x, y]) => [(x - ext.min[0]) * k + PDF_MARGIN[0], (y - ext.min[1]) * k + PDF_MARGIN[1]];
  const f = (v) => (Math.round(v * 1000) / 1000).toString();
  const W = 1190.55; const H = 841.89; // A3 landscape
  const pdf = new PdfWriter();
  const catalog = pdf.reserve(); const pages = pdf.reserve();
  // Layers (optional content groups)
  const layerNames = [...new Set([...flat.lines, ...flat.arcs, ...flat.texts].map((e) => e.layer))].sort();
  const ocg = new Map(layerNames.map((name) => [name, pdf.add(`<< /Type /OCG /Name (${name}) >>`)]));
  // Fonts: Helvetica for Latin texts; a CID font with ToUnicode for Korean ones (not embedded: the text is read, not shown).
  const helv = pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const chars = [...new Set(flat.texts.filter((t) => /[^\x20-\x7e]/.test(t.text)).flatMap((t) => [...t.text]))];
  const cid = new Map(chars.map((ch, i) => [ch, i + 1]));
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chars.length} beginbfchar\n${chars.map((ch) => `<${cid.get(ch).toString(16).padStart(4, '0')}> <${ch.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
  const toUnicode = pdf.stream('', cmap);
  const descriptor = pdf.add('<< /Type /FontDescriptor /FontName /MalgunGothic /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>');
  const cidFont = pdf.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /MalgunGothic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /CIDToGIDMap /Identity >>`);
  const korean = pdf.add(`<< /Type /Font /Subtype /Type0 /BaseFont /MalgunGothic /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`);
  // Page 1: the drawing, layer by layer
  const ops = ['0 G 0.5 w 1 J 1 j'];
  for (const name of layerNames) {
    const id = `oc${ocg.get(name)}`;
    ops.push(`/OC /${id} BDC`);
    ops.push(name === 'A-WALL' ? '1.2 w' : '0.35 w');
    for (const l of flat.lines.filter((x) => x.layer === name)) { const a = P(l.a); const b = P(l.b); ops.push(`${f(a[0])} ${f(a[1])} m ${f(b[0])} ${f(b[1])} l S`); }
    for (const a of flat.arcs.filter((x) => x.layer === name)) {
      const a0 = Math.atan2(a.p0[1] - a.c[1], a.p0[0] - a.c[0]);
      const pieces = arcBeziers(P(a.c), a.r * k, a0, a.sweep);
      ops.push(`${f(pieces[0][0][0])} ${f(pieces[0][0][1])} m ${pieces.map(([, p1, p2, p3]) => `${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])} ${f(p3[0])} ${f(p3[1])} c`).join(' ')} S`);
    }
    for (const t of flat.texts.filter((x) => x.layer === name)) {
      const size = t.height * k;
      const p = P(t.p);
      const n = [...t.text].length;
      const wide = /[^\x20-\x7e]/.test(t.text);
      const width = wide ? n * size : n * size * 0.556;
      const s = wide ? `<${[...t.text].map((ch) => cid.get(ch).toString(16).padStart(4, '0')).join('')}>` : `(${t.text})`;
      ops.push(`BT /${wide ? 'F2' : 'F1'} ${f(size)} Tf ${f(p[0] - width / 2)} ${f(p[1] - size * 0.35)} Td ${s} Tj ET`);
    }
    ops.push('EMC');
  }
  // Title block: a frame (left out by the reader), the title and the scale
  ops.push('0.8 w 20 20 m 1170.55 20 l S 1170.55 20 m 1170.55 821.89 l S 1170.55 821.89 m 20 821.89 l S 20 821.89 m 20 20 l S');
  ops.push(`BT /F1 14 Tf 900 60 Td (APARTMENT 59 - FLOOR PLAN) Tj ET BT /F1 11 Tf 900 40 Td (SCALE 1:${PDF_SCALE}) Tj ET`);
  const content1 = pdf.stream('', ops.join('\n'));
  const props = [...ocg.entries()].map(([, n]) => `/oc${n} ${n} 0 R`).join(' ');
  const page1 = pdf.add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${helv} 0 R /F2 ${korean} 0 R >> /Properties << ${props} >> >> /Contents ${content1} 0 R >>`);
  // Page 2: the scanned copy as a grey picture over the page
  // (a JPEG, as scanners write them)
  const scan = await sharp(path.join(outDir, 'apartment-59-scan.png')).greyscale().jpeg({ quality: 70 }).toBuffer({ resolveWithObject: true });
  const image = pdf.add({ dict: `<< /Type /XObject /Subtype /Image /Width ${scan.info.width} /Height ${scan.info.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${scan.data.length} >>`, bytes: scan.data });
  const iw = W - 80; const ih = (iw * scan.info.height) / scan.info.width;
  const content2 = pdf.stream('', `q ${f(iw)} 0 0 ${f(ih)} 40 ${f((H - ih) / 2)} cm /Im1 Do Q`);
  const page2 = pdf.add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im1 ${image} 0 R >> >> /Contents ${content2} 0 R >>`);
  const ocgRefs = [...ocg.values()].map((n) => `${n} 0 R`).join(' ');
  pdf.set(pages, `<< /Type /Pages /Kids [${page1} 0 R ${page2} 0 R] /Count 2 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R /OCProperties << /OCGs [${ocgRefs}] /D << /Order [${ocgRefs}] /ON [${ocgRefs}] >> >> >>`);
  fs.writeFileSync(path.join(outDir, 'apartment-59.pdf'), pdf.toBuffer(catalog));
  // Plan metres read from the PDF at 1:50 = the DXF's plan metres + this offset (x, z).
  const mpp = (0.0254 / 72) * PDF_SCALE;
  const offset = [r3(-ext.min[0] / 1000 + PDF_MARGIN[0] * mpp), r3(ext.min[1] / 1000 - PDF_MARGIN[1] * mpp)];
  const expected = JSON.parse(fs.readFileSync(path.join(outDir, 'apartment-59.expected.json'), 'utf8'));
  expected.pdf = { file: 'apartment-59.pdf', pages: 2, planPage: 1, scanPage: 2, scale: PDF_SCALE, paper: 'A3', offset, layers: layerNames };
  fs.writeFileSync(path.join(outDir, 'apartment-59.expected.json'), `${JSON.stringify(expected, null, 1)}\n`);
  console.log(`apartment-59.pdf: ${flat.lines.length} lines, ${flat.arcs.length} arcs, ${flat.texts.length} texts on ${layerNames.length} layers + a scanned page`);
}

// ───────────────────────── the duplex (IFC and Sweet Home 3D)

/** Furniture of the duplex (plan metres, level index): name, catalogue id, centre, elevation, rotation, size [w, h, d], expected item. */
const FURNITURE = [
  { level: 0, name: 'Sofa', catalogId: 'eTeks#sofa', center: [2.2, -3.4], rotation: 0, size: [2.0, 0.85, 0.9], expect: 'sofa-modern' },
  { level: 0, name: 'Dining table', catalogId: 'eTeks#rectangularTable', center: [-1, -2], rotation: 0, size: [1.6, 0.75, 0.9], expect: 'dining-table' },
  { level: 0, name: 'Chair', catalogId: 'eTeks#chair', center: [-1, -2.75], rotation: Math.PI, size: [0.45, 0.9, 0.5], group: 'chairs', expect: 'dining-chair' },
  { level: 0, name: 'Chair', catalogId: 'eTeks#chair', center: [-1, -1.25], rotation: 0, size: [0.45, 0.9, 0.5], group: 'chairs', expect: 'dining-chair' },
  { level: 0, name: 'Toilet', catalogId: 'eTeks#toilet', center: [-1, 3.7], rotation: Math.PI, size: [0.4, 0.75, 0.65], expect: 'toilet' },
  { level: 0, name: 'Desk', catalogId: 'eTeks#desk', center: [2.5, 3.6], rotation: Math.PI, size: [1.4, 0.75, 0.7], expect: 'desk' },
  { level: 1, name: 'Double bed', catalogId: 'eTeks#bed140x190', center: [-2.5, -2.2], rotation: 0, size: [1.6, 0.6, 2.0], expect: 'bed' },
  { level: 1, name: 'Wardrobe', catalogId: 'eTeks#wardrobe', center: [2.5, -3.75], rotation: 0, size: [1.2, 2.1, 0.6], expect: 'wardrobe' },
  { level: 1, name: 'Bath', catalogId: 'eTeks#bath', center: [-0.5, 3.6], rotation: 0, size: [1.7, 0.6, 0.75], expect: 'bathtub' },
  { level: 1, name: 'Bronze sculpture', catalogId: 'user#sculpture', center: [3, 2.2], rotation: 0.5, size: [0.5, 1.2, 0.5], model: true, expect: null },
];
const STAIRS = { level: 0, center: [-3.4, 2.4], rotation: 0, size: [0.9, 2.7, 3.4] };
// A curved garden wall (Sweet Home 3D only): a quarter turn outside the east wall.
const GARDEN_WALL = { a: [6.5, -2], b: [6.5, 2], thickness: 0.15, height: 1.2, extent: Math.PI / 2 };

function duplex() {
  const project = buildTemplate('duplex', { names: (key) => NAMES[key] ?? key });
  const levels = project.levels.map((l, i) => ({ ...l, index: i }));
  const levelIndex = new Map(levels.map((l) => [l.id, l.index]));
  const walls = project.walls.map((w) => ({ ...w, levelIndex: levelIndex.get(w.level) }));
  const wallById = new Map(walls.map((w) => [w.id, w]));
  const openings = project.openings.map((o) => {
    const w = wallById.get(o.wall);
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    return { ...o, w, u, center: [w.a[0] + u[0] * o.offset, w.a[1] + u[1] * o.offset], levelIndex: w.levelIndex, kind: o.item.startsWith('window') ? 'window' : 'door' };
  });
  const rooms = project.rooms.map((r) => ({ ...r, levelIndex: levelIndex.get(r.level) }));
  return { levels, walls, openings, rooms };
}

const OBJ = `# A twisted column (centimetres)
mtllib sculpture.mtl
usemtl bronze
${[0, 1].flatMap((top) => [0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2 + (top ? 0.6 : 0) + Math.PI / 4; return `v ${(Math.cos(a) * 25).toFixed(3)} ${top ? 120 : 0} ${(Math.sin(a) * 25).toFixed(3)}`; })).join('\n')}
f 1 2 3 4
f 8 7 6 5
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
`;
const MTL = 'newmtl bronze\nKd 0.55 0.38 0.2\nKs 0.3 0.3 0.3\nNs 40\n';

function writeSh3d(model) {
  const cm = (v) => Math.round(v * 1000) / 10;
  const x = [];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  x.push("<?xml version='1.0'?>");
  x.push("<!DOCTYPE home [\n<!ELEMENT home (property*, furnitureVisibleProperty*, environment?, backgroundImage?, print?, compass?, (camera | observerCamera)*, level*, (pieceOfFurniture | doorOrWindow | furnitureGroup | light)*, wall*, room*, polyline*, dimensionLine*, label*)>\n<!ATTLIST home version CDATA #IMPLIED name CDATA #IMPLIED wallHeight CDATA #IMPLIED>\n]>");
  x.push(`<home version='7200' name='duplex.sh3d' camera='topCamera' wallHeight='240'>`);
  x.push("  <property name='com.eteks.sweethome3d.SweetHome3D.ExpandedGroups' value=''/>");
  x.push("  <environment groundColor='FF5E7A3C' skyColor='FFCCE4FC' lightColor='FFD0D0D0' wallsAlpha='0'/>");
  for (const l of model.levels) x.push(`  <level id='level${l.index}' name='${esc(l.name)}' elevation='${cm(l.elevation)}' floorThickness='30' height='${cm(l.height)}' elevationIndex='${l.index}'/>`);
  // Furniture: one group of chairs, a model of its own for the sculpture
  const piece = (f, tag = 'pieceOfFurniture', indent = '  ') => `${indent}<${tag} level='level${f.level}' catalogId='${esc(f.catalogId)}' name='${esc(f.name)}' creator='eTeks' model='${f.model ? '0/sculpture.obj' : `content${f.catalogId.replace(/\W/g, '')}`}' icon='icon' x='${cm(f.center[0])}' y='${cm(f.center[1])}' elevation='${cm(f.elevation ?? 0)}' angle='${(-f.rotation).toFixed(6)}' width='${cm(f.size[0])}' depth='${cm(f.size[2])}' height='${cm(f.size[1])}' movable='true' modelMirrored='false'/>`;
  for (const f of FURNITURE.filter((g) => !g.group)) x.push(piece(f));
  const chairs = FURNITURE.filter((g) => g.group === 'chairs');
  x.push(`  <furnitureGroup level='level0' name='Chairs' x='-100' y='-200' angle='0' width='45' depth='200' height='90'>`);
  for (const f of chairs) x.push(piece(f, 'pieceOfFurniture', '    '));
  x.push('  </furnitureGroup>');
  x.push(`  <pieceOfFurniture level='level0' catalogId='eTeks#staircase' name='Staircase' model='stairs' x='${cm(STAIRS.center[0])}' y='${cm(STAIRS.center[1])}' elevation='0' angle='0' width='${cm(STAIRS.size[0])}' depth='${cm(STAIRS.size[2])}' height='${cm(STAIRS.size[1])}'/>`);
  // Doors and windows: centred in their wall, width along it; the front (+y turned by the angle) on the wall's left
  for (const o of model.openings) {
    const angle = Math.atan2(o.u[1], o.u[0]);
    const [catalogId, name] = o.item === 'door-entrance' ? ['eTeks#frontDoor', 'Front door'] : o.kind === 'door' ? ['eTeks#door', 'Door'] : o.item === 'window-sliding' ? ['eTeks#slidingWindow', 'Sliding window'] : ['eTeks#window', 'Window'];
    x.push(`  <doorOrWindow level='level${o.levelIndex}' catalogId='${catalogId}' name='${name}' model='door' x='${cm(o.center[0])}' y='${cm(o.center[1])}' elevation='${cm(o.sill)}' angle='${angle.toFixed(6)}' width='${cm(o.width)}' depth='${cm(o.w.thickness)}' height='${cm(o.height)}' wallThickness='1' wallDistance='0' boundToWall='true'/>`);
  }
  model.walls.forEach((w, i) => x.push(`  <wall id='wall${i}' level='level${w.levelIndex}' xStart='${cm(w.a[0])}' yStart='${cm(w.a[1])}' xEnd='${cm(w.b[0])}' yEnd='${cm(w.b[1])}' height='${cm(w.height ?? model.levels[w.levelIndex].height)}' thickness='${cm(w.thickness)}' pattern='hatchUp'/>`));
  x.push(`  <wall id='wallGarden' level='level0' xStart='${cm(GARDEN_WALL.a[0])}' yStart='${cm(GARDEN_WALL.a[1])}' xEnd='${cm(GARDEN_WALL.b[0])}' yEnd='${cm(GARDEN_WALL.b[1])}' height='${cm(GARDEN_WALL.height)}' thickness='${cm(GARDEN_WALL.thickness)}' arcExtent='${GARDEN_WALL.extent.toFixed(6)}' pattern='hatchUp'/>`);
  const COLORS = { 거실: 'FFC8A27A', 욕실: 'FFB0B8C0', 욕실2: 'FFB0B8C0' };
  for (const r of model.rooms) x.push(`  <room level='level${r.levelIndex}' name='${esc(r.name)}' areaVisible='true'${COLORS[r.name] ? ` floorColor='${COLORS[r.name]}'` : ''} ceilingColor='FFFFFFFF'>\n${r.points.map((p) => `    <point x='${cm(p[0])}' y='${cm(p[1])}'/>`).join('\n')}\n  </room>`);
  x.push("  <label text='Duplex' x='0' y='-600'/>");
  x.push('</home>');
  const files = { 'Home.xml': strToU8(x.join('\n')), '0/sculpture.obj': strToU8(OBJ), '0/sculpture.mtl': strToU8(MTL) };
  fs.writeFileSync(path.join(outDir, 'duplex.sh3d'), zipSync(files, { level: 6, mtime: new Date('2026-11-10T00:00:00Z') }));
  return { colors: COLORS };
}

/** IFC4 (STEP) of the duplex: millimetres, plan [x, z] → IFC [x, −z], storeys at their elevation. */
function writeIfc(model) {
  const lines = [];
  let n = 0;
  const e = (s) => { n += 1; lines.push(`#${n}=${s};`); return `#${n}`; };
  let g = 0;
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const guid = () => { g += 1; let v = g * 7919 + 1000003; let s = ''; for (let i = 0; i < 22; i++) { s += ALPHA[(v + i * 13) % 64]; v = Math.floor(v / 3) + 17 * i; } return `'${s}'`; };
  // STEP strings: ' doubled, \ doubled, other than ASCII as \X2\hhhh\X0\ (UTF-16), as IFC exporters write them.
  const step = (s) => `'${[...String(s)].map((ch) => (ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch.charCodeAt(0) < 128 ? ch : `\\X2\\${[...ch].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('')}\\X0\\`)).join('')}'`;
  const mm = (v) => `${(Math.round(v * 10000) / 10).toFixed(1)}`;
  const pt3 = (x, y, z) => e(`IFCCARTESIANPOINT((${mm(x)},${mm(y)},${mm(z)}))`);
  const pt2 = (x, y) => e(`IFCCARTESIANPOINT((${mm(x)},${mm(y)}))`);
  const dir3 = (x, y, z) => e(`IFCDIRECTION((${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}))`);
  const origin = pt3(0, 0, 0); const zDir = dir3(0, 0, 1); const xDir = dir3(1, 0, 0);
  const world = e(`IFCAXIS2PLACEMENT3D(${origin},${zDir},${xDir})`);
  const context = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
  const axisCtx = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${context},$,.GRAPH_VIEW.,$)`);
  const units = e(`IFCUNITASSIGNMENT((${e('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)')},${e('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')},${e('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')}))`);
  const project = e(`IFCPROJECT(${guid()},$,'Duplex',$,$,$,$,(${context}),${units})`);
  const place = (rel, x, y, z, dx = 1, dy = 0) => e(`IFCLOCALPLACEMENT(${rel ?? '$'},${e(`IFCAXIS2PLACEMENT3D(${pt3(x, y, z)},${zDir},${dir3(dx, dy, 0)})`)})`);
  const sitePl = place(null, 0, 0, 0);
  const site = e(`IFCSITE(${guid()},$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPl = place(sitePl, 0, 0, 0);
  const building = e(`IFCBUILDING(${guid()},$,'Duplex',$,$,${buildingPl},$,$,.ELEMENT.,$,$,$)`);
  e(`IFCRELAGGREGATES(${guid()},$,$,$,${project},(${site}))`);
  e(`IFCRELAGGREGATES(${guid()},$,$,$,${site},(${building}))`);
  const box = (w, d, h, cx = 0, cy = 0) => {
    const profile = e(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${e(`IFCAXIS2PLACEMENT2D(${pt2(cx, cy)},$)`)},${mm(w)},${mm(d)})`);
    return e(`IFCEXTRUDEDAREASOLID(${profile},${e(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)},${zDir},${mm(h)})`);
  };
  const shape = (items, axis = null) => e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${[axis, e(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${items.join(',')}))`)].filter(Boolean).join(',')}))`);
  const storeys = [];
  for (const l of model.levels) {
    const pl = place(buildingPl, 0, 0, l.elevation);
    const storey = e(`IFCBUILDINGSTOREY(${guid()},$,${step(l.name)},$,$,${pl},$,$,.ELEMENT.,${mm(l.elevation)})`);
    storeys.push({ storey, pl, level: l, contained: [], spaces: [] });
  }
  e(`IFCRELAGGREGATES(${guid()},$,$,$,${building},(${storeys.map((s) => s.storey).join(',')}))`);
  // Walls: placement at the start, x along the wall; the body runs half a thickness past both ends (joints overlap).
  const wallIfc = new Map();
  model.walls.forEach((w, i) => {
    const s = storeys[w.levelIndex];
    const a = [w.a[0], -w.a[1]]; const b = [w.b[0], -w.b[1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const pl = place(s.pl, a[0], a[1], 0, u[0], u[1]);
    const axis = e(`IFCSHAPEREPRESENTATION(${axisCtx},'Axis','Curve2D',(${e(`IFCPOLYLINE((${pt2(0, 0)},${pt2(L, 0)}))`)}))`);
    const h = w.height ?? s.level.height;
    const type = i % 2 ? 'IFCWALLSTANDARDCASE' : 'IFCWALL';
    const wall = e(`${type}(${guid()},$,'Wall ${i + 1}',$,$,${pl},${shape([box(L + w.thickness, w.thickness, h, L / 2, 0)], axis)},$,.STANDARD.)`);
    s.contained.push(wall);
    wallIfc.set(w.id, { wall, pl, L, w });
  });
  // Openings, doors and windows
  for (const o of model.openings) {
    const host = wallIfc.get(o.wall);
    const s = storeys[o.levelIndex];
    const start = o.offset - o.width / 2;
    const opl = place(host.pl, start, 0, o.sill);
    const opening = e(`IFCOPENINGELEMENT(${guid()},$,'Opening',$,$,${opl},${shape([box(o.width, host.w.thickness + 0.1, o.height, o.width / 2, 0)])},$,.OPENING.)`);
    e(`IFCRELVOIDSELEMENT(${guid()},$,$,$,${host.wall},${opening})`);
    const fpl = place(opl, 0, 0, 0);
    const fill = o.kind === 'door'
      ? e(`IFCDOOR(${guid()},$,'${o.item === 'door-entrance' ? 'Front door' : 'Door'}',$,$,${fpl},${shape([box(o.width, 0.05, o.height, o.width / 2, 0)])},$,${mm(o.height)},${mm(o.width)},.DOOR.,.SINGLE_SWING_LEFT.,$)`)
      : e(`IFCWINDOW(${guid()},$,'${o.item === 'window-sliding' ? 'Sliding window' : 'Window'}',$,$,${fpl},${shape([box(o.width, 0.08, o.height, o.width / 2, 0)])},$,${mm(o.height)},${mm(o.width)},.WINDOW.,${o.item === 'window-sliding' ? '.DOUBLE_PANEL_HORIZONTAL.' : '.SINGLE_PANEL.'},$)`);
    e(`IFCRELFILLSELEMENT(${guid()},$,$,$,${opening},${fill})`);
    s.contained.push(fill);
  }
  // Spaces (rooms): the room outline extruded to the storey height
  model.rooms.forEach((r, i) => {
    const s = storeys[r.levelIndex];
    const pts = [...r.points, r.points[0]].map((p) => pt2(p[0], -p[1]));
    const profile = e(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${e(`IFCPOLYLINE((${pts.join(',')}))`)})`);
    const solid = e(`IFCEXTRUDEDAREASOLID(${profile},${e(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)},${zDir},${mm(s.level.height)})`);
    const space = e(`IFCSPACE(${guid()},$,'${s.level.index + 1}0${i + 1}',$,$,${place(s.pl, 0, 0, 0)},${shape([solid])},${step(r.name)},.ELEMENT.,.INTERNAL.,$)`);
    s.spaces.push(space);
  });
  // Stairs and furniture: boxes at their place, x turned by the rotation
  const solidAt = (s, f, type, extra) => {
    const c = [f.center[0], -f.center[1]];
    const pl = place(s.pl, c[0], c[1], f.elevation ?? 0, Math.cos(f.rotation), Math.sin(f.rotation));
    return e(`${type}(${guid()},$,${step(f.name)},$,$,${pl},${shape([box(f.size[0], f.size[2], f.size[1])])},$,${extra})`);
  };
  storeys[STAIRS.level].contained.push(solidAt(storeys[STAIRS.level], { ...STAIRS, name: 'Stair' }, 'IFCSTAIR', '.STRAIGHT_RUN_STAIR.'));
  for (const f of FURNITURE) storeys[f.level].contained.push(solidAt(storeys[f.level], f, 'IFCFURNITURE', '.NOTDEFINED.'));
  for (const s of storeys) {
    e(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},$,$,$,(${s.contained.join(',')}),${s.storey})`);
    if (s.spaces.length) e(`IFCRELAGGREGATES(${guid()},$,$,$,${s.storey},(${s.spaces.join(',')}))`);
  }
  const head = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');", "FILE_NAME('duplex.ifc','2026-11-10T00:00:00',('MySketchBook'),('MySketchBook samples'),'MySketchBook','MySketchBook','');", "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;'];
  fs.writeFileSync(path.join(outDir, 'duplex.ifc'), `${[...head, ...lines, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n')}\n`);
  return { entities: n };
}

function writeDuplex() {
  const model = duplex();
  const { colors } = writeSh3d(model);
  const { entities } = writeIfc(model);
  const expected = {
    id: 'duplex', title: '복층 주택 (IFC · Sweet Home 3D)',
    levels: model.levels.map((l) => ({ name: l.name, elevation: r3(l.elevation), height: r3(l.height) })),
    walls: model.walls.map((w) => ({ level: w.levelIndex, a: w.a.map(r3), b: w.b.map(r3), thickness: w.thickness, height: r3(w.height ?? model.levels[w.levelIndex].height) })),
    openings: model.openings.map((o) => ({ level: o.levelIndex, kind: o.kind, item: o.item, center: o.center.map(r3), width: o.width, height: o.height, sill: o.sill })),
    rooms: model.rooms.map((r) => ({ level: r.levelIndex, name: r.name, area: r3(Math.abs(r.points.reduce((s, p, i) => { const q = r.points[(i + 1) % r.points.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2)), floorColor: colors[r.name] ? `#${colors[r.name].slice(2).toLowerCase()}` : null })),
    furniture: FURNITURE.map((f) => ({ level: f.level, name: f.name, center: f.center, rotation: r3(f.rotation), size: f.size, expect: f.expect, model: Boolean(f.model) })),
    stairs: { level: STAIRS.level, center: STAIRS.center, size: STAIRS.size },
    sh3d: { file: 'duplex.sh3d', gardenWall: { a: GARDEN_WALL.a, b: GARDEN_WALL.b, thickness: GARDEN_WALL.thickness, height: GARDEN_WALL.height, extent: r3(GARDEN_WALL.extent) } },
    ifc: { file: 'duplex.ifc', schema: 'IFC4', units: 'mm' },
  };
  fs.writeFileSync(path.join(outDir, 'duplex.expected.json'), `${JSON.stringify(expected, null, 1)}\n`);
  console.log(`duplex.ifc (${entities} entities), duplex.sh3d: ${model.levels.length} levels, ${model.walls.length} walls, ${model.openings.length} openings, ${model.rooms.length} rooms, ${FURNITURE.length} pieces + stairs`);
}

// ───────────────────────── pictures: TGA and TIFF

/** 8-bit grey TGA, run-length encoded (type 11), top-left origin. */
function encodeTga({ data, width, height }) {
  const head = Buffer.alloc(18);
  head[2] = 11; head.writeUInt16LE(width, 12); head.writeUInt16LE(height, 14); head[16] = 8; head[17] = 0x20;
  const out = [head];
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * width, (y + 1) * width);
    let x = 0;
    while (x < width) {
      let run = 1;
      while (x + run < width && run < 128 && row[x + run] === row[x]) run++;
      if (run > 1) { out.push(Buffer.from([0x80 | (run - 1), row[x]])); x += run; continue; }
      let raw = 1;
      while (x + raw < width && raw < 128 && row[x + raw] !== row[x + raw - 1]) raw++;
      out.push(Buffer.from([raw - 1]), Buffer.from(row.subarray(x, x + raw)));
      x += raw;
    }
  }
  return Buffer.concat(out);
}

/** PackBits (TIFF compression 32773) of one row. */
function packBits(row) {
  const out = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
    if (run > 1) { out.push(257 - run, row[i]); i += run; continue; }
    let lit = 1;
    while (i + lit < row.length && lit < 128 && row[i + lit] !== row[i + lit - 1]) lit++;
    out.push(lit - 1, ...row.subarray(i, i + lit));
    i += lit;
  }
  return out;
}

/** An 8-bit grey TIFF with several pages (little endian, one PackBits strip per page). */
function encodeTiffPages(pages) {
  const strips = pages.map((p) => { const bytes = []; for (let y = 0; y < p.height; y++) bytes.push(...packBits(p.data.subarray(y * p.width, (y + 1) * p.width))); return Buffer.from(bytes); });
  const parts = [];
  let offset = 8;
  const header = Buffer.alloc(8); header.write('II', 0, 'latin1'); header.writeUInt16LE(42, 2);
  parts.push(header);
  const ifdOffsets = [];
  const layouts = strips.map((d) => { const at = offset; offset += d.length + (d.length % 2); return at; });
  strips.forEach((d) => { parts.push(d); if (d.length % 2) parts.push(Buffer.alloc(1)); });
  pages.forEach((p, i) => {
    ifdOffsets.push(offset);
    const tags = [[256, 4, p.width], [257, 4, p.height], [258, 3, 8], [259, 3, 32773], [262, 3, 1], [273, 4, layouts[i]], [277, 3, 1], [278, 4, p.height], [279, 4, strips[i].length], [284, 3, 1]];
    const ifd = Buffer.alloc(2 + tags.length * 12 + 4);
    ifd.writeUInt16LE(tags.length, 0);
    tags.forEach(([tag, type, value], k) => { const o = 2 + k * 12; ifd.writeUInt16LE(tag, o); ifd.writeUInt16LE(type, o + 2); ifd.writeUInt32LE(1, o + 4); if (type === 3) ifd.writeUInt16LE(value, o + 8); else ifd.writeUInt32LE(value, o + 8); });
    parts.push(ifd);
    offset += ifd.length;
  });
  // Link the pages: header → first IFD, each IFD → the next.
  header.writeUInt32LE(ifdOffsets[0], 4);
  const buffer = Buffer.concat(parts);
  ifdOffsets.forEach((o, i) => { const count = buffer.readUInt16LE(o); buffer.writeUInt32LE(i + 1 < ifdOffsets.length ? ifdOffsets[i + 1] : 0, o + 2 + count * 12); });
  return buffer;
}

async function writePictures() {
  const grey = async (file) => { const { data, info } = await sharp(path.join(outDir, file)).greyscale().raw().toBuffer({ resolveWithObject: true }); return { data, width: info.width, height: info.height }; };
  const house = await grey('house-2room.png');
  fs.writeFileSync(path.join(outDir, 'house-2room.tga'), encodeTga(house));
  // A cover page (a framed title area), then the plan.
  const cover = { width: 400, height: 300, data: Buffer.alloc(400 * 300, 255) };
  for (let y = 20; y < 280; y++) for (let x = 20; x < 380; x++) if (y < 24 || y > 275 || x < 24 || x > 375 || (y > 120 && y < 140 && x > 80 && x < 320)) cover.data[y * 400 + x] = 30;
  fs.writeFileSync(path.join(outDir, 'house-2room-2p.tif'), encodeTiffPages([cover, house]));
  await sharp(path.join(outDir, 'apartment-59.png')).greyscale().threshold(160).tiff({ compression: 'lzw', bitdepth: 1 }).toFile(path.join(outDir, 'apartment-59-bw.tif'));
  for (const id of ['house-2room', 'apartment-59']) {
    const file = path.join(outDir, `${id}.expected.json`);
    const expected = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (id === 'house-2room') { expected.tga = { file: 'house-2room.tga' }; expected.tiffPages = { file: 'house-2room-2p.tif', pages: 2, planPage: 2 }; }
    else expected.bilevel = { file: 'apartment-59-bw.tif', compression: 'lzw' };
    fs.writeFileSync(file, `${JSON.stringify(expected, null, 1)}\n`);
  }
  console.log('house-2room.tga, house-2room-2p.tif (2 pages), apartment-59-bw.tif (black and white, LZW)');
}

await writePdf();
writeDuplex();
await writePictures();
// index.json: the new files next to the samples they come from.
const indexFile = path.join(outDir, 'index.json');
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')).filter((s) => s.id !== 'duplex');
const add = (id, files) => { const s = index.find((x) => x.id === id); if (s) s.files = [...new Set([...s.files, ...files])]; };
add('apartment-59', ['apartment-59.pdf', 'apartment-59-bw.tif']);
add('house-2room', ['house-2room.tga', 'house-2room-2p.tif']);
const dx = JSON.parse(fs.readFileSync(path.join(outDir, 'duplex.expected.json'), 'utf8'));
index.push({ id: 'duplex', title: dx.title, files: ['duplex.ifc', 'duplex.sh3d'], levels: dx.levels.length, walls: dx.walls.length, doors: dx.openings.filter((o) => o.kind === 'door').length, windows: dx.openings.filter((o) => o.kind === 'window').length, rooms: dx.rooms.length, furniture: dx.furniture.length });
fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
