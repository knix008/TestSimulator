// IFC 4 export (ISO 16739, STEP physical file), the BIM exchange format that
// FreeCAD's BIM workbench reads and writes. Each BIM object becomes its IFC
// class (IfcWall with IfcOpeningElement voids filled by IfcWindow / IfcDoor,
// IfcSlab, IfcColumn, IfcBeam, IfcStair, IfcRoof, IfcSpace, IfcRailing,
// IfcCurtainWall, IfcFurniture / IfcSanitaryTerminal, IfcGrid) in a
// project › site › building › storey tree; other solids become
// IfcBuildingElementProxy. Geometry is written as tessellated bodies
// (IfcTriangulatedFaceSet) in millimetres, with base quantities (Qto_*).
import { archQuantities, axisLetter, axisLines, wallWidth, EQUIPMENT_TYPES, isArchKind, prism, ROOF_TYPES, wallParts } from './arch.js';
import { polygonArea } from './geometry.js';
import { triangulate } from './triangulate.js';
import { placement, solidMesh, solidMeshGroups } from './solids.js';

const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** A 22-character IFC GlobalId from a text (stable: the same object gets the same id). */
export function ifcGuid(seed) {
  // Four 32-bit FNV-1a hashes of the seed make 128 bits.
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x7f4a7c15].map((basis, k) => {
    let h = (basis ^ (k * 0x45d9f3b)) >>> 0;
    for (const ch of `${k}:${seed}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  });
  let n = 0n;
  for (const w of words) n = (n << 32n) | BigInt(w);
  let out = '';
  // 22 base-64 digits: the first carries 2 bits, the rest 6 each.
  for (let i = 0; i < 22; i++) { out = IFC_CHARS[Number(n & 63n)] + out; n >>= 6n; }
  return IFC_CHARS[IFC_CHARS.indexOf(out[0]) & 3] + out.slice(1);
}

/** A STEP string: quotes doubled, everything outside printable ASCII as \X2\…\X0\. */
export function ifcString(text) {
  if (text === null || text === undefined) return '$';
  let out = '';
  let wide = '';
  const flush = () => { if (wide) { out += `\\X2\\${wide}\\X0\\`; wide = ''; } };
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      flush();
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch;
    } else if (code > 0xffff) {
      const v = code - 0x10000;
      wide += ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16)).toUpperCase();
    } else wide += code.toString(16).toUpperCase().padStart(4, '0');
  }
  flush();
  return `'${out}'`;
}

/** A STEP real: always with a decimal point. */
const real = (v) => {
  const x = Math.abs(v) < 1e-9 ? 0 : Number(v);
  const text = Number.isInteger(x) ? `${x}.` : String(Number(x.toPrecision(12)));
  return /[.E]/.test(text) ? text.replace('e', 'E') : `${text}.`;
};

/** The IFC class and predefined type of a solid. */
function ifcClassOf(entity) {
  const p = entity.params ?? {};
  switch (entity.kind) {
    case 'wall': return ['IFCWALL', '.STANDARD.'];
    case 'curtainwall': return ['IFCCURTAINWALL', '.NOTDEFINED.'];
    case 'column': return ['IFCCOLUMN', '.COLUMN.'];
    case 'beam': return ['IFCBEAM', '.BEAM.'];
    case 'slab': return ['IFCSLAB', '.FLOOR.'];
    case 'stairs': return ['IFCSTAIR', ['.STRAIGHT_RUN_STAIR.', '.QUARTER_TURN_STAIR.', '.HALF_TURN_STAIR.', '.SPIRAL_STAIR.'][p.stairType ?? 0] ?? '.STRAIGHT_RUN_STAIR.'];
    case 'roof': return ['IFCROOF', ['.GABLE_ROOF.', '.HIP_ROOF.', '.SHED_ROOF.', '.FLAT_ROOF.'][p.roofType] ?? '.NOTDEFINED.'];
    case 'railing': return ['IFCRAILING', '.HANDRAIL.'];
    case 'equipment': {
      const type = EQUIPMENT_TYPES[p.equipment];
      const sanitary = { toilet: '.WCSEAT.', basin: '.WASHHANDBASIN.', bathtub: '.BATH.', sink: '.SINK.' }[type];
      if (sanitary) return ['IFCSANITARYTERMINAL', sanitary];
      if (type === 'car' || type === 'fridge') return ['IFCBUILDINGELEMENTPROXY', '.ELEMENT.'];
      return ['IFCFURNITURE', type === 'chair' ? '.CHAIR.' : type === 'table' || type === 'desk' ? '.TABLE.' : type === 'bed' ? '.BED.' : type === 'sofa' ? '.SOFA.' : '.NOTDEFINED.'];
    }
    case 'truss': return ['IFCMEMBER', '.MEMBER.'];
    case 'panel': return ['IFCPLATE', '.SHEET.'];
    case 'pipe': return ['IFCPIPESEGMENT', '.RIGIDSEGMENT.'];
    default: return ['IFCBUILDINGELEMENTPROXY', '.ELEMENT.'];
  }
}

/**
 * IFC 4 text of the solids of a drawing.
 * options: { title, author, entities (default: every solid), file }
 */
export function toIfc(drawing, { title = drawing?.title || 'MyCAD', author = drawing?.author || '', entities = null, file = 'model.ifc', timestamp = (drawing?.updated || new Date().toISOString()).slice(0, 19) } = {}) {
  const solids = (entities ?? drawing?.entities ?? []).filter((entity) => entity.type === 'solid');
  const lines = [];
  let next = 1;
  const add = (text) => { const id = `#${next++}`; lines.push(`${id}=${text};`); return id; };
  const seed = drawing?.id ?? title;
  const guid = (key) => `'${ifcGuid(`${seed}/${key}`)}'`;
  const s = ifcString;

  const person = add(`IFCPERSON($,${s(author || 'MyCAD')},$,$,$,$,$,$)`);
  const org = add(`IFCORGANIZATION($,'MyCAD',$,$,$)`);
  const owner = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = add(`IFCAPPLICATION(${org},'1.0','MyCAD','MyCAD')`);
  const history = add(`IFCOWNERHISTORY(${owner},${app},$,.ADDED.,$,$,$,0)`);
  const units = add(`IFCUNITASSIGNMENT((${[
    add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ].join(',')}))`);
  const origin = add('IFCCARTESIANPOINT((0.,0.,0.))');
  const zAxis = add('IFCDIRECTION((0.,0.,1.))');
  const xAxis = add('IFCDIRECTION((1.,0.,0.))');
  const world = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
  const project = add(`IFCPROJECT(${guid('project')},${history},${s(title)},$,$,$,$,(${context}),${units})`);
  const placementAt = (parent, z = 0) => {
    const point = z ? add(`IFCCARTESIANPOINT((0.,0.,${real(z)}))`) : origin;
    return add(`IFCLOCALPLACEMENT(${parent ?? '$'},${add(`IFCAXIS2PLACEMENT3D(${point},${zAxis},${xAxis})`)})`);
  };
  const sitePlace = placementAt(null);
  const site = add(`IFCSITE(${guid('site')},${history},'Site',$,$,${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPlace = placementAt(sitePlace);
  const building = add(`IFCBUILDING(${guid('building')},${history},${s(title)},$,$,${buildingPlace},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES(${guid('agg-project')},${history},$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES(${guid('agg-site')},${history},$,$,${site},(${building}))`);

  // Storeys: the drawing's levels; without them one per height the walls, slabs and columns stand on.
  const levels = drawing?.bim?.levels?.length ? [...drawing.bim.levels].sort((a, b) => a.elevation - b.elevation) : null;
  const bases = levels ? levels.map((level) => level.elevation) : [...new Set(solids.filter((e) => ['wall', 'column', 'curtainwall'].includes(e.kind)).map((e) => Math.round(e.z ?? 0)))].sort((a, b) => a - b);
  if (!bases.length) bases.push(0);
  const storeys = bases.map((z, i) => {
    const place = placementAt(buildingPlace, z);
    const name = levels ? levels[i].name : bases.length > 1 ? `Level ${i}` : 'Level 0';
    return { z, place, level: levels?.[i].id ?? null, id: add(`IFCBUILDINGSTOREY(${guid(`storey-${levels?.[i].id ?? z}`)},${history},${s(name)},$,$,${place},$,$,.ELEMENT.,${real(z)})`), elements: [], spaces: [] };
  });
  add(`IFCRELAGGREGATES(${guid('agg-building')},${history},$,$,${building},(${storeys.map((st) => st.id).join(',')}))`);
  const storeyOf = (entity) => {
    const own = entity.level ? storeys.find((st) => st.level === entity.level) : null;
    if (own) return own;
    const z = (entity.z ?? 0) + 1;
    return [...storeys].reverse().find((st) => st.z <= z) ?? storeys[0];
  };
  // Materials (IfcMaterial), one per id; layered walls get an IfcMaterialLayerSet.
  const materialIds = new Map();
  const materialOf = (m) => {
    if (!materialIds.has(m.id)) materialIds.set(m.id, add(`IFCMATERIAL(${s(m.name)},$,${s(m.id)})`));
    return materialIds.get(m.id);
  };
  const associate = (element, material, key) => add(`IFCRELASSOCIATESMATERIAL(${guid(`${key}-material`)},${history},$,$,(${element}),${material})`);

  if (drawing?.bim) {
    const value = add(`IFCPROPERTYSINGLEVALUE('Building',$,IFCTEXT(${s(JSON.stringify(drawing.bim))}),$)`);
    const set = add(`IFCPROPERTYSET(${guid('project-mycad')},${history},'MyCAD',$,(${value}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${guid('project-mycad-rel')},${history},$,$,(${project}),${set})`);
  }

  /** A tessellated body of triangles (world mm), relative to a storey. */
  const shapeOf = (tris, dz) => {
    if (!tris.length) return '$';
    const index = new Map();
    const points = [];
    const faces = tris.map((tri) => tri.map(([x, y, z]) => {
      const key = `${x.toFixed(4)},${y.toFixed(4)},${(z - dz).toFixed(4)}`;
      if (!index.has(key)) { index.set(key, points.length + 1); points.push(`(${real(+x.toFixed(4))},${real(+y.toFixed(4))},${real(+(z - dz).toFixed(4))})`); }
      return index.get(key);
    })).filter(([a, b, c]) => a !== b && b !== c && a !== c);
    const list = add(`IFCCARTESIANPOINTLIST3D((${points.join(',')}))`);
    const set = add(`IFCTRIANGULATEDFACESET(${list},$,$,(${faces.map((f) => `(${f.join(',')})`).join(',')}),$)`);
    const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${set}))`);
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  };
  const quantities = (element, name, list, key) => {
    const items = list.filter(([, v]) => Number.isFinite(v) && v > 0).map(([q, v, kind]) => (kind === 'area'
      ? add(`IFCQUANTITYAREA(${s(q)},$,$,${real(v / 1e6)},$)`)
      : kind === 'volume' ? add(`IFCQUANTITYVOLUME(${s(q)},$,$,${real(v / 1e9)},$)`) : add(`IFCQUANTITYLENGTH(${s(q)},$,$,${real(v)},$)`)));
    if (!items.length) return;
    const set = add(`IFCELEMENTQUANTITY(${guid(`${key}-qto`)},${history},${s(name)},$,$,(${items.join(',')}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${guid(`${key}-qto-rel`)},${history},$,$,(${element}),${set})`);
  };
  const volumeOf = (tris) => Math.abs(tris.reduce((v, [a, b, c]) => v + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0));

  // MyCAD's own parameters, so an IFC written by MyCAD opens again as parametric objects.
  const mycad = (element, data, key) => {
    const value = add(`IFCPROPERTYSINGLEVALUE('Entity',$,IFCTEXT(${s(JSON.stringify(data))}),$)`);
    const set = add(`IFCPROPERTYSET(${guid(`${key}-mycad`)},${history},'MyCAD',$,(${value}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${guid(`${key}-mycad-rel`)},${history},$,$,(${element}),${set})`);
  };
  const dataOf = ({ id, layer, ...rest }) => rest;

  let counter = 0;
  for (const entity of solids) {
    counter += 1;
    const key = entity.id ?? `solid-${counter}`;
    const st = storeyOf(entity);
    const place = placementAt(st.place);
    const name = entity.name || entity.kind;
    if (entity.kind === 'axis') {
      const p = entity.params;
      const axisLine = (a, b, tag) => add(`IFCGRIDAXIS(${s(tag)},${add(`IFCPOLYLINE((${add(`IFCCARTESIANPOINT((${real(a.x)},${real(a.y)}))`)},${add(`IFCCARTESIANPOINT((${real(b.x)},${real(b.y)}))`)}))`)},.T.)`);
      const map = placement(entity);
      const at = (x, y) => { const [wx, wy] = map([x, y, 0]); return { x: wx, y: wy }; };
      const { xs, ys } = axisLines(entity);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const u = xs.map((x, i) => axisLine(at(x, y0 - p.extension), at(x, y1 + p.extension), String(i + 1)));
      const v = ys.map((y, j) => axisLine(at(x0 - p.extension, y), at(x1 + p.extension, y), axisLetter(j)));
      const grid = add(`IFCGRID(${guid(key)},${history},${s(name)},$,$,${place},$,(${u.join(',')}),(${v.join(',')}),$,.RECTANGULAR.)`);
      st.elements.push(grid);
      mycad(grid, dataOf(entity), key);
      continue;
    }
    if (entity.kind === 'space') {
      const tris = solidMeshGroups(entity).flatMap((group) => group.tris);
      const space = add(`IFCSPACE(${guid(key)},${history},${s(name)},$,$,${place},${shapeOf(tris, st.z)},${s(name)},.ELEMENT.,.INTERNAL.,$)`);
      st.spaces.push(space);
      mycad(space, dataOf(entity), key);
      quantities(space, 'Qto_SpaceBaseQuantities', [['NetFloorArea', archQuantities(entity).floorArea, 'area'], ['Height', entity.params.height]], key);
      continue;
    }
    if (entity.kind === 'wall') {
      const map = placement(entity);
      const world = (tris) => tris.map((tri) => tri.map(map));
      const { main, openings } = wallParts(entity);
      // IFC walls are whole; their openings (IfcOpeningElement) are subtracted by the reader.
      // One solid the full width (a layered wall's layers are its IfcMaterialLayerSet), so readers can cut the openings.
      const whole = wallParts({ ...entity, params: { ...entity.params, width: wallWidth(entity) }, shape: { ...entity.shape, openings: [], layers: [] } }).main;
      const wall = add(`IFCWALL(${guid(key)},${history},${s(name)},$,$,${place},${shapeOf(world(whole), st.z)},$,.STANDARD.)`);
      st.elements.push(wall);
      mycad(wall, dataOf(entity), key);
      const layers = entity.shape?.layers ?? [];
      if (layers.length) {
        const items = layers.map((layer) => add(`IFCMATERIALLAYER(${materialOf(layer.material)},${real(layer.thickness)},$,${s(layer.material.name)},$,$,$)`));
        const set = add(`IFCMATERIALLAYERSET((${items.join(',')}),${s(name)},$)`);
        const half = layers.reduce((sum, layer) => sum + layer.thickness, 0) / 2;
        associate(wall, add(`IFCMATERIALLAYERSETUSAGE(${set},.AXIS2.,.NEGATIVE.,${real(entity.params.align === 1 ? half * 2 : entity.params.align === 2 ? 0 : half)},$)`), key);
      } else if (entity.material) associate(wall, materialOf(entity.material), key);
      const q = archQuantities(entity);
      quantities(wall, 'Qto_WallBaseQuantities', [['Length', q.length], ['Width', entity.params.width], ['Height', entity.params.height], ['NetSideArea', q.wallArea, 'area'], ['NetVolume', volumeOf(world(main)), 'volume']], key);
      openings.forEach((part, i) => {
        const okey = `${key}/opening-${i}`;
        const voidId = add(`IFCOPENINGELEMENT(${guid(okey)},${history},${s(`${name} opening ${i + 1}`)},$,$,${placementAt(place)},${shapeOf(world(part.void), st.z)},$,.OPENING.)`);
        add(`IFCRELVOIDSELEMENT(${guid(`${okey}-voids`)},${history},$,$,${wall},${voidId})`);
        const o = part.opening;
        if (o.type === 'opening') return;
        const fill = world([...part.wood, ...part.glass]);
        const fillId = o.type === 'window'
          ? add(`IFCWINDOW(${guid(`${okey}-fill`)},${history},${s(`${name} window ${i + 1}`)},$,$,${placementAt(place)},${shapeOf(fill, st.z)},$,${real(o.height)},${real(o.width)},.WINDOW.,.${o.width > 1400 ? 'DOUBLE_PANEL_VERTICAL' : 'SINGLE_PANEL'}.,$)`)
          : add(`IFCDOOR(${guid(`${okey}-fill`)},${history},${s(`${name} door ${i + 1}`)},$,$,${placementAt(place)},${shapeOf(fill, st.z)},$,${real(o.height)},${real(o.width)},.DOOR.,.${o.type === 'doubleDoor' ? 'DOUBLE_DOOR_SINGLE_SWING' : o.type === 'sliding' ? 'DOUBLE_DOOR_SLIDING' : o.hinge > 0 ? 'SINGLE_SWING_LEFT' : 'SINGLE_SWING_RIGHT'}.,$)`);
        add(`IFCRELFILLSELEMENT(${guid(`${okey}-fills`)},${history},$,$,${voidId},${fillId})`);
        st.elements.push(fillId);
        mycad(fillId, { hosted: true }, `${okey}-fill`);
      });
      continue;
    }
    if (entity.kind === 'rebar') {
      const q = archQuantities(entity);
      const bar = add(`IFCREINFORCINGBAR(${guid(key)},${history},${s(name)},$,$,${place},${shapeOf(solidMesh(entity), st.z)},$,$,${real(entity.params.diameter)},${real((Math.PI * entity.params.diameter ** 2) / 4)},${real(q.length)},.MAIN.,.TEXTURED.)`);
      st.elements.push(bar);
      mycad(bar, dataOf(entity), key);
      if (entity.material) associate(bar, materialOf(entity.material), key);
      continue;
    }
    const [cls, type] = ifcClassOf(entity);
    const tris = solidMesh(entity);
    const id = add(`${cls}(${guid(key)},${history},${s(name)},$,${isArchKind(entity.kind) ? '$' : s(entity.kind)},${place},${shapeOf(tris, st.z)},$,${type})`);
    st.elements.push(id);
    if (entity.kind !== 'mesh') mycad(id, dataOf(entity), key);
    if (entity.material) associate(id, materialOf(entity.material), key);
    const q = isArchKind(entity.kind) ? archQuantities(entity) : {};
    if (entity.kind === 'slab') quantities(id, 'Qto_SlabBaseQuantities', [['Width', entity.params.thickness], ['NetArea', q.floorArea, 'area'], ['NetVolume', volumeOf(tris), 'volume']], key);
    if (entity.kind === 'column' || entity.kind === 'beam') quantities(id, entity.kind === 'column' ? 'Qto_ColumnBaseQuantities' : 'Qto_BeamBaseQuantities', [['Length', entity.kind === 'column' ? entity.params.height : q.length], ['NetVolume', volumeOf(tris), 'volume']], key);
    if (entity.kind === 'roof') quantities(id, 'Qto_RoofBaseQuantities', [['NetArea', q.roofArea, 'area']], key);
  }
  for (const st of storeys) {
    if (st.elements.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`contains-${st.z}`)},${history},$,$,(${st.elements.join(',')}),${st.id})`);
    if (st.spaces.length) add(`IFCRELAGGREGATES(${guid(`spaces-${st.z}`)},${history},$,$,${st.id},(${st.spaces.join(',')}))`);
  }
  const header = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${s(file)},'${timestamp}',(${s(author || 'MyCAD')}),('MyCAD'),'MyCAD IFC export','MyCAD','');`,
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
  ];
  return `${[...header, ...lines, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n')}\n`;
}

/** Names of the IFC classes in a file (for tests and the import summary). */
export const ROOF_IFC_TYPES = ROOF_TYPES;

// ───────────────────────── IFC import

/** Decodes the escapes of a STEP string (\X2\…\X0\, \X\hh, \S\c, doubled backslashes). */
export function decodeIfcString(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
      const units = hex.match(/.{4}/g) ?? [];
      return String.fromCharCode(...units.map((u) => parseInt(u, 16)));
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128))
    .replace(/\\\\/g, '\\');
}

/**
 * A room (space object) from the body of an IfcSpace: the outline of its floor
 * (the downward faces at its lowest level), its height and level.
 */
function spaceFrom(tris, name) {
  const zs = tris.flat().map((p) => p[2]);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const counts = new Map();
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  for (const tri of tris) {
    if (!tri.every((p) => Math.abs(p[2] - z0) < 1)) continue;
    for (let i = 0; i < 3; i++) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const id = [key(a), key(b)].sort().join('|');
      const entry = counts.get(id);
      if (entry) entry.n += 1; else counts.set(id, { n: 1, a, b });
    }
  }
  const segments = [...counts.values()].filter((edge) => edge.n === 1).map(({ a, b }) => [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }]);
  const loops = joinLoops(segments).filter((loop) => loop.length >= 3);
  if (!loops.length) return null;
  loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  const [outer, ...holes] = loops;
  const o = outer[0];
  const rel = (loop) => loop.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  return { type: 'solid', kind: 'space', name, params: { height: Math.max(100, z1 - z0) }, shape: { outer: rel(outer), holes: holes.map(rel) }, x: o.x, y: o.y, z: z0, rx: 0, ry: 0, rz: 0 };
}

/** Joins 2D segments into closed loops. */
function joinLoops(segments) {
  const key = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const from = new Map();
  for (const [a, b] of segments) {
    for (const [p, q] of [[a, b], [b, a]]) {
      if (!from.has(key(p))) from.set(key(p), []);
      from.get(key(p)).push(q);
    }
  }
  const used = new Set();
  const loops = [];
  for (const [a] of segments) {
    if (used.has(key(a))) continue;
    const loop = [a];
    used.add(key(a));
    let current = a;
    for (let guard = 0; guard < segments.length + 2; guard++) {
      const next = (from.get(key(current)) ?? []).find((p) => !used.has(key(p)));
      if (!next) break;
      loop.push(next);
      used.add(key(next));
      current = next;
    }
    loops.push(loop);
  }
  return loops;
}

/** Colours of imported IFC classes in the 3D view. */
const IFC_COLORS = {
  IFCWALL: '#d9d4c7', IFCWALLSTANDARDCASE: '#d9d4c7', IFCSLAB: '#b9bcc2', IFCROOF: '#b5523b', IFCCOLUMN: '#c8c8c8', IFCBEAM: '#a9b3bd',
  IFCWINDOW: '#8cc4ec', IFCDOOR: '#a8763e', IFCSTAIR: '#c9b79c', IFCSTAIRFLIGHT: '#c9b79c', IFCRAILING: '#8f98a3', IFCCURTAINWALL: '#8cc4ec',
  IFCPLATE: '#8cc4ec', IFCMEMBER: '#8f98a3', IFCFURNITURE: '#a8763e', IFCFURNISHINGELEMENT: '#a8763e', IFCSANITARYTERMINAL: '#f2f2f2',
};
/** Spatial structure and helpers that are not building elements. */
const NOT_ELEMENTS = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCOPENINGELEMENT', 'IFCGRID', 'IFCANNOTATION', 'IFCVIRTUALELEMENT']);

const vec = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  unit: (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
};
/** Affine maps { r: 3×3 (columns x, y, z), t }. */
const IDENTITY = { r: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
const applyMap = (m, p) => [
  m.r[0][0] * p[0] + m.r[1][0] * p[1] + m.r[2][0] * p[2] + m.t[0],
  m.r[0][1] * p[0] + m.r[1][1] * p[1] + m.r[2][1] * p[2] + m.t[1],
  m.r[0][2] * p[0] + m.r[1][2] * p[1] + m.r[2][2] * p[2] + m.t[2],
];
const rotate = (m, v) => applyMap({ r: m.r, t: [0, 0, 0] }, v);
/** a ∘ b: b first, then a. */
const compose = (a, b) => ({ r: b.r.map((col) => rotate(a, col)), t: applyMap(a, b.t) });

/**
 * Reads an IFC (2x3 or 4) file. BIM elements become mesh solids named after
 * the element and its class (walls with their openings cut); objects written by
 * MyCAD come back as the parametric objects they were. Returns { entities, warnings }.
 */
export function parseIfc(data, { stepEntities, cut = null } = {}) {
  const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
  if (!/ISO-10303-21/.test(text) || !/FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(text)) throw new Error('IFC: not an IFC (ISO 10303-21) file');
  const E = stepEntities(text);
  const get = (ref) => (ref && typeof ref === 'object' && 'ref' in ref ? E.get(ref.ref) : null);
  const warnings = new Set();
  // Length unit → millimetres.
  let unit = 1000;
  for (const e of E.values()) {
    if (e.type === 'IFCSIUNIT' && e.args[1] === '.LENGTHUNIT.') unit = { '.MILLI.': 1, '.CENTI.': 10, '.DECI.': 100, '.KILO.': 1e6 }[e.args[2]] ?? 1000;
    if (e.type === 'IFCCONVERSIONBASEDUNIT' && e.args[1] === '.LENGTHUNIT.') unit = /foot|feet/i.test(e.args[2]) ? 304.8 : /inch/i.test(e.args[2]) ? 25.4 : unit;
  }
  const point = (ref) => { const e = get(ref); return e ? [0, 1, 2].map((i) => (Number(e.args[0][i]) || 0) * unit) : [0, 0, 0]; };
  const direction = (ref, fallback) => { const e = get(ref); return e ? vec.unit([0, 1, 2].map((i) => Number(e.args[0][i]) || 0)) : fallback; };
  const axisPlacement = (ref) => {
    const e = get(ref);
    if (!e) return IDENTITY;
    if (e.type === 'IFCAXIS2PLACEMENT2D') {
      const o = point(e.args[0]);
      const x = direction(e.args[1], [1, 0, 0]);
      return { r: [[x[0], x[1], 0], [-x[1], x[0], 0], [0, 0, 1]], t: [o[0], o[1], 0] };
    }
    const o = point(e.args[0]);
    const z = direction(e.args[1], [0, 0, 1]);
    let x = direction(e.args[2], Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]);
    x = vec.unit(vec.sub(x, vec.mul(z, vec.dot(x, z))));
    return { r: [x, vec.cross(z, x), z], t: o };
  };
  const placements = new Map();
  const localPlacement = (ref) => {
    const e = get(ref);
    if (!e || e.type !== 'IFCLOCALPLACEMENT') return IDENTITY;
    if (placements.has(ref.ref)) return placements.get(ref.ref);
    placements.set(ref.ref, IDENTITY);
    const m = compose(localPlacement(e.args[0]), axisPlacement(e.args[1]));
    placements.set(ref.ref, m);
    return m;
  };
  const operator = (ref) => {
    const e = get(ref);
    if (!e) return IDENTITY;
    const [a1, a2, o, scale, a3, s2, s3] = e.args;
    const x = direction(a1, [1, 0, 0]);
    let z = direction(a3, null) ?? vec.unit(vec.cross(x, direction(a2, [0, 1, 0])));
    const y = vec.unit(vec.cross(z, x));
    z = vec.cross(x, y);
    const k = Number(scale) || 1;
    return { r: [vec.mul(x, k), vec.mul(y, Number(s2) || k), vec.mul(z, Number(s3) || k)], t: point(o) };
  };

  // 2D curves and profiles (loops of [x, y] in mm).
  const curve2d = (ref) => {
    const e = get(ref);
    if (!e) return [];
    if (e.type === 'IFCPOLYLINE') return e.args[0].map((p) => point(p).slice(0, 2));
    if (e.type === 'IFCINDEXEDPOLYCURVE') {
      const list = get(e.args[0])?.args[0] ?? [];
      const pts = list.map((p) => [Number(p[0]) * unit, Number(p[1]) * unit]);
      if (!Array.isArray(e.args[1])) return pts;
      const out = [];
      for (const seg of e.args[1]) {
        const idx = (seg.args?.[0] ?? []).map((i) => pts[i - 1]).filter(Boolean);
        if (seg.typed === 'IFCARCINDEX' && idx.length === 3) {
          const [a, b, c] = idx;
          const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
          if (Math.abs(d) < 1e-12) { out.push(a, c); continue; }
          const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
          const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
          const r = Math.hypot(a[0] - ux, a[1] - uy);
          const ang = (p) => Math.atan2(p[1] - uy, p[0] - ux);
          let [t0, t1] = [ang(a), ang(c)];
          const ccw = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 0;
          if (ccw) { while (t1 < t0) t1 += 2 * Math.PI; } else { while (t1 > t0) t1 -= 2 * Math.PI; }
          const n = Math.max(4, Math.ceil(Math.abs(t1 - t0) / (Math.PI / 18)));
          for (let k = 0; k <= n; k++) { const t = t0 + ((t1 - t0) * k) / n; out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); }
        } else out.push(...idx);
      }
      return out;
    }
    if (e.type === 'IFCCIRCLE') {
      const m = axisPlacement(e.args[0]);
      const r = Number(e.args[1]) * unit;
      return Array.from({ length: 48 }, (_, i) => applyMap(m, [r * Math.cos((i * Math.PI) / 24), r * Math.sin((i * Math.PI) / 24), 0]).slice(0, 2));
    }
    warnings.add(e.type);
    return [];
  };
  const clean = (loop) => {
    const out = loop.filter((p, i) => i === 0 || Math.hypot(p[0] - loop[i - 1][0], p[1] - loop[i - 1][1]) > 1e-6);
    if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
    return out;
  };
  const rectLoop = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const circleLoop = (r) => Array.from({ length: 48 }, (_, i) => [r * Math.cos((i * Math.PI) / 24), r * Math.sin((i * Math.PI) / 24)]);
  /** A profile: { outer, holes } in its own placement. */
  const profile = (ref) => {
    const e = get(ref);
    if (!e) return null;
    const a = e.args;
    const L = (v) => (Number(v) || 0) * unit;
    let shape = null;
    switch (e.type) {
      case 'IFCRECTANGLEPROFILEDEF': shape = { outer: rectLoop(L(a[3]), L(a[4])), holes: [] }; break;
      case 'IFCRECTANGLEHOLLOWPROFILEDEF': shape = { outer: rectLoop(L(a[3]), L(a[4])), holes: [rectLoop(L(a[3]) - 2 * L(a[5]), L(a[4]) - 2 * L(a[5]))] }; break;
      case 'IFCCIRCLEPROFILEDEF': shape = { outer: circleLoop(L(a[3])), holes: [] }; break;
      case 'IFCCIRCLEHOLLOWPROFILEDEF': shape = { outer: circleLoop(L(a[3])), holes: [circleLoop(L(a[3]) - L(a[4]))] }; break;
      case 'IFCELLIPSEPROFILEDEF': shape = { outer: circleLoop(1).map(([x, y]) => [x * L(a[3]), y * L(a[4])]), holes: [] }; break;
      case 'IFCISHAPEPROFILEDEF': {
        const [w, d, tw, tf] = [L(a[3]), L(a[4]), L(a[5]), L(a[6])];
        shape = { outer: [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + tf], [tw / 2, -d / 2 + tf], [tw / 2, d / 2 - tf], [w / 2, d / 2 - tf], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, d / 2 - tf], [-tw / 2, d / 2 - tf], [-tw / 2, -d / 2 + tf], [-w / 2, -d / 2 + tf]], holes: [] };
        break;
      }
      case 'IFCLSHAPEPROFILEDEF': {
        const [d, w, t] = [L(a[3]), L(a[4]) || L(a[3]), L(a[5])];
        shape = { outer: [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + t], [-w / 2 + t, -d / 2 + t], [-w / 2 + t, d / 2], [-w / 2, d / 2]], holes: [] };
        break;
      }
      case 'IFCARBITRARYCLOSEDPROFILEDEF': shape = { outer: clean(curve2d(a[2])), holes: [] }; break;
      case 'IFCARBITRARYPROFILEDEFWITHVOIDS': shape = { outer: clean(curve2d(a[2])), holes: (a[3] ?? []).map((c) => clean(curve2d(c))).filter((h) => h.length >= 3) }; break;
      default: warnings.add(e.type); return null;
    }
    // Parametrised profiles have their own 2D placement (argument 2).
    if (e.type !== 'IFCARBITRARYCLOSEDPROFILEDEF' && e.type !== 'IFCARBITRARYPROFILEDEFWITHVOIDS' && a[2]) {
      const m = axisPlacement(a[2]);
      const move = (loop) => loop.map((p) => applyMap(m, [p[0], p[1], 0]).slice(0, 2));
      shape = { outer: move(shape.outer), holes: shape.holes.map(move) };
    }
    return shape.outer.length >= 3 ? shape : null;
  };

  /** Triangles of a planar polygon in 3D (with holes), by projecting on its main plane. */
  const polygon3d = (outer, holes = []) => {
    if (outer.length < 3) return [];
    let n = [0, 0, 0];
    for (let i = 0; i < outer.length; i++) {
      const p = outer[i];
      const q = outer[(i + 1) % outer.length];
      n = [n[0] + (p[1] - q[1]) * (p[2] + q[2]), n[1] + (p[2] - q[2]) * (p[0] + q[0]), n[2] + (p[0] - q[0]) * (p[1] + q[1])];
    }
    const axis = [0, 1, 2].reduce((best, i) => (Math.abs(n[i]) > Math.abs(n[best]) ? i : best), 0);
    const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
    const flat = (loop) => loop.map((p) => ({ x: p[u], y: p[v], p }));
    const tris = triangulate(flat(outer), holes.map(flat));
    const sameWay = n[axis] >= 0;
    return tris.map(([a, b, c]) => (sameWay ? [a.p, b.p, c.p] : [a.p, c.p, b.p]));
  };
  const faceTris = (faceRef) => {
    const face = get(faceRef);
    if (!face) return [];
    let outer = null;
    const holes = [];
    for (const boundRef of face.args[0] ?? []) {
      const bound = get(boundRef);
      const loop = get(bound?.args[0]);
      if (!loop || loop.type !== 'IFCPOLYLOOP') { warnings.add(loop?.type ?? 'IFCFACEBOUND'); continue; }
      let pts = loop.args[0].map(point);
      if (bound.args[1] === '.F.') pts = pts.reverse();
      if (bound.type === 'IFCFACEOUTERBOUND' || !outer) { if (outer) holes.push(outer); outer = pts; } else holes.push(pts);
    }
    return outer ? polygon3d(outer, holes) : [];
  };
  /** Triangles of a representation item, in the item's own coordinates. */
  const itemTris = (ref, depth = 0) => {
    const e = get(ref);
    if (!e || depth > 8) return [];
    const a = e.args;
    switch (e.type) {
      case 'IFCTRIANGULATEDFACESET': case 'IFCTRIANGULATEDIRREGULARNETWORK': {
        const pts = (get(a[0])?.args[0] ?? []).map((p) => [Number(p[0]) * unit, Number(p[1]) * unit, Number(p[2]) * unit]);
        const pn = Array.isArray(a[4]) && a[4].length ? a[4] : null;
        const at = (i) => pts[(pn ? pn[i - 1] : i) - 1];
        return (a[3] ?? []).map((tri) => tri.map(at)).filter((tri) => tri.every(Boolean));
      }
      case 'IFCPOLYGONALFACESET': {
        const pts = (get(a[0])?.args[0] ?? []).map((p) => [Number(p[0]) * unit, Number(p[1]) * unit, Number(p[2]) * unit]);
        const pn = Array.isArray(a[3]) && a[3].length ? a[3] : null;
        const at = (i) => pts[(pn ? pn[i - 1] : i) - 1];
        return (a[2] ?? []).flatMap((faceRef) => {
          const f = get(faceRef);
          if (!f) return [];
          const outer = f.args[0].map(at).filter(Boolean);
          const holes = f.type === 'IFCINDEXEDPOLYGONALFACEWITHVOIDS' ? (f.args[1] ?? []).map((h) => h.map(at).filter(Boolean)) : [];
          return polygon3d(outer, holes);
        });
      }
      case 'IFCFACETEDBREP': case 'IFCFACETEDBREPWITHVOIDS': case 'IFCADVANCEDBREP': {
        const shell = get(a[0]);
        if (e.type === 'IFCADVANCEDBREP') warnings.add(e.type);
        return (shell?.args[0] ?? []).flatMap(faceTris);
      }
      case 'IFCSHELLBASEDSURFACEMODEL': case 'IFCFACEBASEDSURFACEMODEL':
        return (a[0] ?? []).flatMap((shellRef) => (get(shellRef)?.args[0] ?? []).flatMap(faceTris));
      case 'IFCEXTRUDEDAREASOLID': case 'IFCEXTRUDEDAREASOLIDTAPERED': {
        const shape = profile(a[0]);
        if (!shape) return [];
        const m = axisPlacement(a[1]);
        const d = direction(a[2], [0, 0, 1]);
        const depth = (Number(a[3]) || 0) * unit;
        const loop = (pts) => pts.map(([x, y]) => ({ x, y }));
        const tris = prism(loop(shape.outer), 0, 1, shape.holes.map(loop));
        // Unit-height prism stretched along the extrusion direction.
        return tris.map((tri) => tri.map(([x, y, z]) => applyMap(m, [x + d[0] * depth * z, y + d[1] * depth * z, d[2] * depth * z])));
      }
      case 'IFCBOOLEANRESULT': case 'IFCBOOLEANCLIPPINGRESULT': {
        const first = itemTris(a[1], depth + 1);
        const second = get(a[2]);
        if (second && !/HALFSPACE/.test(second.type) && cut && a[0] === '.DIFFERENCE.') {
          const other = itemTris(a[2], depth + 1);
          return other.length ? cut(first, [other]) : first;
        }
        if (second) warnings.add(`${e.type} (${second.type})`);
        return first;
      }
      case 'IFCMAPPEDITEM': {
        const source = get(a[0]);
        if (!source) return [];
        const origin = axisPlacement(source.args[0]);
        const rep = get(source.args[1]);
        const m = compose(operator(a[1]), origin);
        return (rep?.args[3] ?? []).flatMap((item) => itemTris(item, depth + 1)).map((tri) => tri.map((p) => applyMap(m, p)));
      }
      case 'IFCCSGSOLID': return itemTris(a[0], depth + 1);
      case 'IFCBLOCK': {
        const m = axisPlacement(a[0]);
        return prism([{ x: 0, y: 0 }, { x: a[1] * unit, y: 0 }, { x: a[1] * unit, y: a[2] * unit }, { x: 0, y: a[2] * unit }], 0, a[3] * unit).map((tri) => tri.map((p) => applyMap(m, p)));
      }
      default:
        warnings.add(e.type);
        return [];
    }
  };
  /** World triangles of a product's body. */
  const productTris = (e) => {
    const shape = get(e.args[6]);
    if (!shape) return [];
    const reps = (shape.args[2] ?? []).map(get).filter(Boolean);
    const bodies = reps.filter((rep) => /^(Body|Facetation|Body-FallBack)$/i.test(rep.args[1] ?? '')) ;
    const chosen = bodies.length ? bodies : reps.filter((rep) => !/^(Axis|FootPrint|Box|Annotation|Profile|Clearance)$/i.test(rep.args[1] ?? ''));
    const m = localPlacement(e.args[5]);
    return chosen.flatMap((rep) => (rep.args[3] ?? []).flatMap((item) => itemTris(item))).map((tri) => tri.map((p) => applyMap(m, p)));
  };

  // Relations: MyCAD's own parameters, openings voiding elements.
  const mycadData = new Map();
  const voids = new Map();
  let bim = null;
  const storeyOfElement = new Map();
  for (const e of E.values()) {
    if (e.type === 'IFCRELDEFINESBYPROPERTIES') {
      const set = get(e.args[5]);
      if (set?.type !== 'IFCPROPERTYSET' || set.args[2] !== 'MyCAD') continue;
      const value = (set.args[4] ?? []).map(get).find((prop) => prop?.args[0] === 'Entity');
      const raw = value?.args[2]?.args?.[0];
      if (typeof raw !== 'string') continue;
      try {
        const parsed = JSON.parse(decodeIfcString(raw));
        for (const target of e.args[4] ?? []) mycadData.set(target.ref, parsed);
      } catch { warnings.add('MyCAD data'); }
      const building = (set.args[4] ?? []).map(get).find((prop) => prop?.args[0] === 'Building')?.args[2]?.args?.[0];
      if (typeof building === 'string') { try { bim = JSON.parse(decodeIfcString(building)); } catch { warnings.add('MyCAD data'); } }
    }
    if (e.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') for (const ref of e.args[4] ?? []) storeyOfElement.set(ref.ref, e.args[5]?.ref);
    if (e.type === 'IFCRELVOIDSELEMENT') {
      const host = e.args[4]?.ref;
      if (!voids.has(host)) voids.set(host, []);
      voids.get(host).push(e.args[5]?.ref);
    }
  }

  const entities = [];
  for (const [id, e] of E.entries()) {
    const own = mycadData.get(id);
    if (own?.hosted) continue;
    if (own && own.type === 'solid') { entities.push(own); continue; }
    if (!e.type.startsWith('IFC') || NOT_ELEMENTS.has(e.type)) continue;
    // Products: an object placement and a shape (arguments 5 and 6).
    if (get(e.args[5])?.type !== 'IFCLOCALPLACEMENT') continue;
    if (get(e.args[6])?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    let tris = productTris(e);
    if (!tris.length) continue;
    const holes = (voids.get(id) ?? []).map((ref) => E.get(ref)).filter(Boolean).map(productTris).filter((t) => t.length);
    if (holes.length && cut) {
      try { tris = cut(tris, holes); } catch { warnings.add('IFCOPENINGELEMENT'); }
    } else if (holes.length) warnings.add('IFCOPENINGELEMENT');
    const name = decodeIfcString(e.args[2]) || e.type;
    if (e.type === 'IFCSPACE') {
      const room = spaceFrom(tris, name);
      if (room) entities.push({ ...room, storeyRef: [...E.entries()].find(([, rel]) => rel.type === 'IFCRELAGGREGATES' && (rel.args[5] ?? []).some((ref) => ref.ref === id))?.[1].args[4]?.ref }); else warnings.add('IFCSPACE');
      continue;
    }
    const cls = e.type;
    entities.push({ storeyRef: storeyOfElement.get(id), type: 'solid', kind: 'mesh', name: `${name} (${cls})`, ...(IFC_COLORS[e.type] ? { color: IFC_COLORS[e.type] } : {}), params: {}, shape: { tris: tris.flatMap((tri) => tri.flat()) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  }
  // Levels: MyCAD's own building, else one per storey of the file (spaces and elements on their storey).
  if (!bim) {
    const storeys = [...E.entries()].filter(([, e]) => e.type === 'IFCBUILDINGSTOREY');
    if (storeys.length) {
      bim = { levels: storeys.map(([id, e], i) => ({ id: `S${id}`, name: decodeIfcString(e.args[2]) || `Level ${i}`, elevation: Number(e.args[9]) * unit || localPlacement(e.args[5]).t[2] || 0, height: 3000 })) };
      for (const entity of entities) if (entity.storeyRef) entity.level = `S${entity.storeyRef}`;
    }
  }
  for (const entity of entities) delete entity.storeyRef;
  return { entities, warnings: [...warnings], bim };
}
