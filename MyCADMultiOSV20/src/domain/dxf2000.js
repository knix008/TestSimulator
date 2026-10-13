// DXF 2000 (AC1015) writer: the modern DXF most CAD programs read, with real
// entities — LWPOLYLINE, ELLIPSE (arcs), SPLINE (NURBS), HATCH (solid and
// patterns, with holes), LEADER, MTEXT, POINT — and 3D solids as 3DFACE
// meshes. Every object has a handle; the file has the tables, blocks and
// objects a strict reader expects. (exportDxf in dxf.js still writes R12.)
import { AUTO, isVisible, styleOf } from './drawing.js';
import { firstBaseline, isFullEllipse, primitives, splinePoints } from './entities.js';
import { HATCH_PATTERNS } from './hatch.js';
import { clampedKnots } from './nurbs.js';
import { rotate } from './geometry.js';
import { solidMesh } from './solids.js';
import { dxfName, encodeDxfText, hexToAci } from './dxf.js';

const LTYPES = {
  CONTINUOUS: ['Solid line', []], DASHED: ['Dashed __ __ __', [6, -3]], CENTER: ['Center ____ _ ____', [12, -3, 2, -3]],
  HIDDEN: ['Hidden _ _ _', [3, -2]], PHANTOM: ['Phantom ____ _ _ ____', [12, -3, 2, -3, 2, -3]], DOT: ['Dot . . .', [0, -2]],
};
const LTYPE_NAMES = { continuous: 'CONTINUOUS', dashed: 'DASHED', center: 'CENTER', hidden: 'HIDDEN', phantom: 'PHANTOM', dotted: 'DOT' };
const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
const lineweight = (mm) => LINEWEIGHTS.reduce((best, w) => (Math.abs(w - mm * 100) < Math.abs(best - mm * 100) ? w : best), 25);
const trueColor = (hex) => { const v = /^#([0-9a-f]{6})$/i.exec(hex ?? '')?.[1]; return v ? parseInt(v, 16) : null; };
const fmt = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

export function exportDxf2000(drawing, { entities = null } = {}) {
  const out = [];
  let handle = 0x20;
  const next = () => (handle++).toString(16).toUpperCase();
  const pair = (code, value) => out.push(String(code), typeof value === 'number' ? fmt(value) : String(value));
  const list = (entities ?? drawing.entities).filter((entity) => isVisible(drawing, entity));

  // Handles decided up front (tables refer to each other).
  const H = {
    vportTable: next(), ltypeTable: next(), layerTable: next(), styleTable: next(), viewTable: next(), ucsTable: next(),
    appidTable: next(), dimstyleTable: next(), blockRecordTable: next(), modelRecord: next(), paperRecord: next(),
    modelBlock: next(), modelEnd: next(), paperBlock: next(), paperEnd: next(), rootDict: next(), groupDict: next(),
    vport: next(), byBlock: next(), byLayer: next(), style: next(), appid: next(), dimstyle: next(),
  };
  const ltypeHandles = Object.fromEntries(Object.keys(LTYPES).map((name) => [name, next()]));
  const layerHandles = new Map(drawing.layers.map((layer) => [layer.id, next()]));
  const layerNames = new Map(drawing.layers.map((layer) => [layer.id, dxfName(layer.name)]));

  // Entities first (to know the final handle seed), then the file around them.
  const body = [];
  const write = (code, value) => body.push(String(code), typeof value === 'number' ? fmt(value) : String(value));
  const head = (type, entity, extra = {}) => {
    write(0, type); write(5, next()); write(330, H.modelRecord); write(100, 'AcDbEntity');
    write(8, layerNames.get(entity.layer) ?? '0');
    const lineType = extra.lineType ?? entity.lineType;
    if (lineType) write(6, LTYPE_NAMES[lineType] ?? 'CONTINUOUS');
    if (entity.color && entity.color !== AUTO) { write(62, hexToAci(entity.color)); write(420, trueColor(entity.color)); }
    if (entity.lineWidth) write(370, lineweight(entity.lineWidth));
  };
  const xyz = (codeX, p, z = 0) => { write(codeX, p.x); write(codeX + 10, p.y); write(codeX + 20, z); };
  const mtext = (entity, prim) => {
    const lines = String(prim.text).split('\n');
    const baseline = firstBaseline(prim);
    // MTEXT hangs from its top edge: one text height above the first baseline.
    const top = rotate({ x: prim.p.x, y: prim.p.y + baseline + prim.size }, prim.p, prim.angle ?? 0);
    const attach = prim.align === 'center' ? 2 : prim.align === 'right' ? 3 : 1;
    head('MTEXT', entity); write(100, 'AcDbMText');
    xyz(10, top); write(40, prim.size); write(41, 0); write(71, attach); write(72, 1);
    const text = lines.map(encodeDxfText).join('\\P');
    for (let k = 0; k + 250 < text.length; k += 250) write(3, text.slice(k, k + 250));
    write(1, text.slice(Math.floor(Math.max(0, text.length - 1) / 250) * 250));
    const a = ((prim.angle ?? 0) * Math.PI) / 180;
    write(11, Math.cos(a)); write(21, Math.sin(a)); write(31, 0);
  };
  const text = (entity, prim) => {
    if (String(prim.text).includes('\n')) { mtext(entity, prim); return; }
    const baseline = firstBaseline(prim);
    const at = rotate({ x: prim.p.x, y: prim.p.y + baseline }, prim.p, prim.angle ?? 0);
    const halign = prim.align === 'center' ? 1 : prim.align === 'right' ? 2 : 0;
    head('TEXT', entity); write(100, 'AcDbText');
    xyz(10, at); write(40, prim.size); write(1, encodeDxfText(prim.text));
    if (prim.angle) write(50, prim.angle);
    if (halign) { write(72, halign); xyz(11, at); }
    write(100, 'AcDbText');
  };
  const lwpolyline = (entity, points, closed, lineType) => {
    head('LWPOLYLINE', entity, { lineType }); write(100, 'AcDbPolyline');
    write(90, points.length); write(70, closed ? 1 : 0); write(43, 0);
    for (const p of points) { write(10, p.x); write(20, p.y); }
  };
  const hatch = (entity, loops, pattern, angle = 0, scale = 1) => {
    head('HATCH', entity); write(100, 'AcDbHatch');
    write(10, 0); write(20, 0); write(30, 0); write(210, 0); write(220, 0); write(230, 1);
    write(2, pattern === 'solid' ? 'SOLID' : pattern.toUpperCase()); write(70, pattern === 'solid' ? 1 : 0); write(71, 0);
    write(91, loops.length);
    loops.forEach((loop, k) => {
      write(92, k === 0 ? 3 : 2); write(72, 0); write(73, 1); write(93, loop.length);
      for (const p of loop) { write(10, p.x); write(20, p.y); }
      write(97, 0);
    });
    write(75, 0); write(76, 1);
    if (pattern !== 'solid') {
      write(52, angle); write(41, scale); write(77, 0);
      const lines = HATCH_PATTERNS[pattern] ?? HATCH_PATTERNS.ansi31;
      write(78, lines.length);
      for (const [lineAngle, spacing, offset = 0, dash = 0] of lines) {
        const a = ((lineAngle + angle) * Math.PI) / 180;
        write(53, lineAngle + angle); write(43, 0); write(44, 0);
        // Offset to the next line: along the line (stagger) and across it.
        write(45, (Math.cos(a) * offset - Math.sin(a) * spacing) * scale); write(46, (Math.sin(a) * offset + Math.cos(a) * spacing) * scale);
        if (dash > 0) { write(79, 2); write(49, dash * scale); write(49, -dash * scale); } else write(79, 0);
      }
    }
    write(98, 0);
  };
  const primitive = (entity, prim) => {
    switch (prim.kind) {
      case 'line': head('LINE', entity, { lineType: prim.lineType }); write(100, 'AcDbLine'); xyz(10, prim.a); xyz(11, prim.b); break;
      case 'circle': head('CIRCLE', entity, { lineType: prim.lineType }); write(100, 'AcDbCircle'); xyz(10, prim.c); write(40, prim.r); break;
      case 'arc':
        head('ARC', entity, { lineType: prim.lineType }); write(100, 'AcDbCircle'); xyz(10, prim.c); write(40, prim.r);
        write(100, 'AcDbArc'); write(50, prim.start); write(51, prim.end);
        break;
      case 'poly': lwpolyline(entity, prim.points, prim.closed, prim.lineType); break;
      case 'fill':
        if (prim.holes?.length || prim.points.length > 4) hatch(entity, [prim.points, ...(prim.holes ?? [])], 'solid');
        else {
          const [a, b, c, d = c] = prim.points;
          head('SOLID', entity); write(100, 'AcDbTrace'); xyz(10, a); xyz(11, b); xyz(12, d); xyz(13, c);
        }
        break;
      case 'text': text(entity, prim); break;
      default: break;
    }
  };

  for (const entity of list) {
    switch (entity.type) {
      case 'polyline': lwpolyline(entity, entity.points, entity.closed); break;
      case 'ellipse': {
        // DXF ellipses keep the major axis first (ratio ≤ 1).
        const swap = entity.ry > entity.rx;
        const major = swap ? entity.ry : entity.rx;
        const a = ((entity.angle + (swap ? 90 : 0)) * Math.PI) / 180;
        const full = isFullEllipse(entity);
        const shift = swap ? -90 : 0;
        head('ELLIPSE', entity); write(100, 'AcDbEllipse');
        xyz(10, { x: entity.cx, y: entity.cy }); xyz(11, { x: Math.cos(a) * major, y: Math.sin(a) * major });
        write(210, 0); write(220, 0); write(230, 1);
        write(40, Math.min(entity.rx, entity.ry) / major);
        write(41, full ? 0 : ((entity.start + shift) * Math.PI) / 180); write(42, full ? Math.PI * 2 : ((entity.end + shift) * Math.PI) / 180);
        break;
      }
      case 'point': head('POINT', entity); write(100, 'AcDbPoint'); xyz(10, entity); break;
      case 'spline': {
        const degree = Math.min(entity.degree, entity.points.length - 1);
        const knots = entity.knots ?? clampedKnots(entity.points.length, degree);
        head('SPLINE', entity); write(100, 'AcDbSpline');
        write(210, 0); write(220, 0); write(230, 1);
        write(70, 8 + (entity.weights ? 4 : 0)); write(71, degree); write(72, knots.length); write(73, entity.points.length); write(74, 0);
        write(42, 1e-10); write(43, 1e-10);
        for (const k of knots) write(40, k);
        for (const w of entity.weights ?? []) write(41, w);
        for (const p of entity.points) xyz(10, p);
        if (entity.closed) {
          // A closed spline drawn through its points also goes back to the start.
          const pts = splinePoints(entity);
          lwpolyline(entity, [pts.at(-1), pts[0]], false);
        }
        break;
      }
      case 'hatch': hatch(entity, entity.loops, entity.pattern, entity.angle, entity.scale); break;
      case 'leader':
        head('LEADER', entity); write(100, 'AcDbLeader'); write(3, 'Standard');
        write(71, 1); write(72, 0); write(73, 3); write(74, 0); write(75, 0); write(40, entity.size); write(41, 0);
        write(76, entity.points.length);
        for (const p of entity.points) xyz(10, p);
        if (entity.text) primitive(entity, primitives(entity).find((prim) => prim.kind === 'text'));
        break;
      case 'solid': {
        // 3D solids: their triangles as 3D faces.
        for (const [a, b, c] of solidMesh(entity)) {
          head('3DFACE', entity); write(100, 'AcDbFace');
          write(10, a[0]); write(20, a[1]); write(30, a[2]); write(11, b[0]); write(21, b[1]); write(31, b[2]);
          write(12, c[0]); write(22, c[1]); write(32, c[2]); write(13, c[0]); write(23, c[1]); write(33, c[2]);
        }
        break;
      }
      default:
        for (const prim of primitives(entity)) primitive(entity, prim);
    }
  }

  // ── the file
  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1015');
  pair(9, '$DWGCODEPAGE'); pair(3, 'ANSI_1252');
  pair(9, '$INSUNITS'); pair(70, 4);
  pair(9, '$MEASUREMENT'); pair(70, 1);
  pair(9, '$LUNITS'); pair(70, 2);
  pair(9, '$HANDSEED'); pair(5, (handle + 1).toString(16).toUpperCase());
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'CLASSES'); pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'TABLES');
  const table = (name, tableHandle, count, entries, subclass = null) => {
    pair(0, 'TABLE'); pair(2, name); pair(5, tableHandle); pair(330, 0); pair(100, 'AcDbSymbolTable'); pair(70, count);
    if (subclass) pair(100, subclass);
    entries();
    pair(0, 'ENDTAB');
  };
  table('VPORT', H.vportTable, 1, () => {
    pair(0, 'VPORT'); pair(5, H.vport); pair(330, H.vportTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbViewportTableRecord');
    pair(2, '*Active'); pair(70, 0); pair(10, 0); pair(20, 0); pair(11, 1); pair(21, 1); pair(12, 0); pair(22, 0); pair(40, 300); pair(41, 1.6);
  });
  table('LTYPE', H.ltypeTable, Object.keys(LTYPES).length + 2, () => {
    for (const [name, h] of [['ByBlock', H.byBlock], ['ByLayer', H.byLayer]]) {
      pair(0, 'LTYPE'); pair(5, h); pair(330, H.ltypeTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbLinetypeTableRecord');
      pair(2, name); pair(70, 0); pair(3, ''); pair(72, 65); pair(73, 0); pair(40, 0);
    }
    for (const [name, [description, pattern]] of Object.entries(LTYPES)) {
      pair(0, 'LTYPE'); pair(5, ltypeHandles[name]); pair(330, H.ltypeTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbLinetypeTableRecord');
      pair(2, name); pair(70, 0); pair(3, description); pair(72, 65); pair(73, pattern.length);
      pair(40, pattern.reduce((sum, item) => sum + Math.abs(item), 0));
      for (const item of pattern) { pair(49, item); pair(74, 0); }
    }
  });
  table('LAYER', H.layerTable, drawing.layers.length, () => {
    for (const layer of drawing.layers) {
      pair(0, 'LAYER'); pair(5, layerHandles.get(layer.id)); pair(330, H.layerTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbLayerTableRecord');
      pair(2, layerNames.get(layer.id)); pair(70, layer.locked ? 4 : 0);
      pair(62, (layer.visible ? 1 : -1) * hexToAci(layer.color));
      if (trueColor(layer.color) !== null) pair(420, trueColor(layer.color));
      pair(6, LTYPE_NAMES[layer.lineType] ?? 'CONTINUOUS'); pair(370, lineweight(layer.lineWidth ?? 0.25)); pair(390, 0);
    }
  });
  table('STYLE', H.styleTable, 1, () => {
    pair(0, 'STYLE'); pair(5, H.style); pair(330, H.styleTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbTextStyleTableRecord');
    pair(2, 'Standard'); pair(70, 0); pair(40, 0); pair(41, 1); pair(50, 0); pair(71, 0); pair(42, 2.5); pair(3, 'txt'); pair(4, '');
  });
  table('VIEW', H.viewTable, 0, () => {});
  table('UCS', H.ucsTable, 0, () => {});
  table('APPID', H.appidTable, 1, () => {
    pair(0, 'APPID'); pair(5, H.appid); pair(330, H.appidTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbRegAppTableRecord'); pair(2, 'ACAD'); pair(70, 0);
  });
  table('DIMSTYLE', H.dimstyleTable, 1, () => {
    pair(0, 'DIMSTYLE'); pair(105, H.dimstyle); pair(330, H.dimstyleTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbDimStyleTableRecord');
    pair(2, 'Standard'); pair(70, 0);
  }, 'AcDbDimStyleTable');
  table('BLOCK_RECORD', H.blockRecordTable, 2, () => {
    for (const [name, h] of [['*Model_Space', H.modelRecord], ['*Paper_Space', H.paperRecord]]) {
      pair(0, 'BLOCK_RECORD'); pair(5, h); pair(330, H.blockRecordTable); pair(100, 'AcDbSymbolTableRecord'); pair(100, 'AcDbBlockTableRecord'); pair(2, name);
    }
  });
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'BLOCKS');
  for (const [name, record, begin, end, paper] of [['*Model_Space', H.modelRecord, H.modelBlock, H.modelEnd, false], ['*Paper_Space', H.paperRecord, H.paperBlock, H.paperEnd, true]]) {
    pair(0, 'BLOCK'); pair(5, begin); pair(330, record); pair(100, 'AcDbEntity'); if (paper) pair(67, 1); pair(8, '0'); pair(100, 'AcDbBlockBegin');
    pair(2, name); pair(70, 0); pair(10, 0); pair(20, 0); pair(30, 0); pair(3, name); pair(1, '');
    pair(0, 'ENDBLK'); pair(5, end); pair(330, record); pair(100, 'AcDbEntity'); if (paper) pair(67, 1); pair(8, '0'); pair(100, 'AcDbBlockEnd');
  }
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  out.push(...body);
  pair(0, 'ENDSEC');

  pair(0, 'SECTION'); pair(2, 'OBJECTS');
  pair(0, 'DICTIONARY'); pair(5, H.rootDict); pair(330, 0); pair(100, 'AcDbDictionary'); pair(281, 1); pair(3, 'ACAD_GROUP'); pair(350, H.groupDict);
  pair(0, 'DICTIONARY'); pair(5, H.groupDict); pair(330, H.rootDict); pair(100, 'AcDbDictionary'); pair(281, 1);
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return `${out.join('\n')}\n`;
}

export { styleOf };
