// IFC 4 export (ISO 16739, STEP physical file), the BIM exchange format that
// FreeCAD's BIM workbench reads and writes. Each BIM object becomes its IFC
// class (IfcWall with IfcOpeningElement voids filled by IfcWindow / IfcDoor,
// IfcSlab, IfcColumn, IfcBeam, IfcStair, IfcRoof, IfcSpace, IfcRailing,
// IfcCurtainWall, IfcFurniture / IfcSanitaryTerminal, IfcGrid) in a
// project › site › building › storey tree; other solids become
// IfcBuildingElementProxy. Geometry is written as tessellated bodies
// (IfcTriangulatedFaceSet) in millimetres, with base quantities (Qto_*).
import { archQuantities, axisLetter, axisLines, COLUMN_SHAPES, wallWidth, EQUIPMENT_TYPES, isArchKind, prism, ROOF_TYPES, WALL_ALIGN, wallParts } from './arch.js';
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
      if (type === 'shower') return ['IFCSANITARYTERMINAL', '.SHOWER.'];
      if (type === 'urinal') return ['IFCSANITARYTERMINAL', '.URINAL.'];
      if (type === 'boiler') return ['IFCBOILER', '.WATER.'];
      if (type === 'airConditioner') return ['IFCUNITARYEQUIPMENT', '.SPLITSYSTEM.'];
      if (type === 'radiator') return ['IFCSPACEHEATER', '.RADIATOR.'];
      if (type === 'panelBoard') return ['IFCELECTRICDISTRIBUTIONBOARD', '.DISTRIBUTIONBOARD.'];
      if (type === 'serverRack') return ['IFCCOMMUNICATIONSAPPLIANCE', '.COMPUTER.'];
      if (type === 'washer' || type === 'dishwasher' || type === 'stove') return ['IFCELECTRICAPPLIANCE', type === 'washer' ? '.WASHINGMACHINE.' : type === 'dishwasher' ? '.DISHWASHER.' : '.ELECTRICCOOKER.'];
      if (type === 'tree') return ['IFCGEOGRAPHICELEMENT', '.USERDEFINED.'];
      if (['car', 'fridge', 'bicycle', 'truck', 'piano'].includes(type)) return ['IFCBUILDINGELEMENTPROXY', '.ELEMENT.'];
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
  /**
   * A swept body (IfcExtrudedAreaSolid, as BIM programs write walls, slabs,
   * columns and beams): a profile placed at `at` (storey-relative) with its own
   * z axis `zDir` and x axis `xDir`, extruded `depth` along that z.
   */
  const sweptOf = (profileDef, at, zDir, xDir, depth) => {
    const position = add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((${at.map(real).join(',')}))`)},${add(`IFCDIRECTION((${zDir.map(real).join(',')}))`)},${add(`IFCDIRECTION((${xDir.map(real).join(',')}))`)})`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${profileDef},${position},${zAxis},${real(depth)})`);
    const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`);
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  };
  const point2 = (x, y) => add(`IFCCARTESIANPOINT((${real(x)},${real(y)}))`);
  const at2 = (x, y) => add(`IFCAXIS2PLACEMENT2D(${point2(x, y)},$)`);
  const polyline = (loop) => add(`IFCPOLYLINE((${[...loop, loop[0]].map((p) => point2(p.x, p.y)).join(',')}))`);
  /** The profile of a column or beam section (rectangle, circle, I), or null (other sections are tessellated). */
  const sectionProfile = (p) => {
    const shape = COLUMN_SHAPES[p.profile] ?? 'rect';
    if ((p.preset ?? 0) !== 0) return null;
    if (shape === 'rect') return add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${at2(0, 0)},${real(p.width)},${real(p.depth ?? p.height)})`);
    if (shape === 'round') return add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${at2(0, 0)},${real(p.width / 2)})`);
    if (shape === 'hsection' && p.tw > 0 && p.tf > 0) return add(`IFCISHAPEPROFILEDEF(.AREA.,$,${at2(0, 0)},${real(p.width)},${real(p.depth ?? p.height)},${real(p.tw)},${real(p.tf)},$,$,$)`);
    return null;
  };
  /** Swept bodies where the object is a plain extrusion; null → tessellate. */
  const sweptBody = (entity, dz) => {
    // Arch_ToggleIfcBrepFlag: written as a faceted body; a component with additions or subtractions has no plain profile.
    if (entity.bim?.brep || entity.components) return null;
    if ((entity.rx ?? 0) % 360 || (entity.ry ?? 0) % 360 || (entity.scale ?? 1) !== 1 || entity.flip) return null;
    const p = entity.params;
    const map = placement(entity);
    const w = (q, z = 0) => map([q.x, q.y, z]);
    if (entity.kind === 'wall') {
      const path = entity.shape?.path ?? [];
      if (path.length !== 2 || entity.shape.closed) return null;
      const [a, b] = path.map((q) => w(q));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) return null;
      const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, 0];
      const width = wallWidth(entity);
      // Centre line, left or right (the side the wall grows to from its line).
      const offset = (WALL_ALIGN[p.align] ?? 'center') === 'left' ? width / 2 : (WALL_ALIGN[p.align] ?? 'center') === 'right' ? -width / 2 : 0;
      return sweptOf(add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${at2(len / 2, offset)},${real(len)},${real(width)})`), [a[0], a[1], a[2] - dz], [0, 0, 1], dir, p.height);
    }
    if (entity.kind === 'slab') {
      const outer = (entity.shape?.outer ?? []).map((q) => { const [x, y] = w(q); return { x, y }; });
      if (outer.length < 3) return null;
      const holes = (entity.shape?.holes ?? []).map((h) => h.map((q) => { const [x, y] = w(q); return { x, y }; }));
      const def = holes.length ? add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${polyline(outer)},(${holes.map(polyline).join(',')}))`) : add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${polyline(outer)})`);
      return sweptOf(def, [0, 0, (entity.z ?? 0) - p.thickness - dz], [0, 0, 1], [1, 0, 0], p.thickness);
    }
    if (entity.kind === 'column') {
      const def = sectionProfile(p);
      if (!def) return null;
      const a = (entity.rz ?? 0) * Math.PI / 180;
      return sweptOf(def, [entity.x ?? 0, entity.y ?? 0, (entity.z ?? 0) - dz], [0, 0, 1], [Math.cos(a), Math.sin(a), 0], p.height);
    }
    if (entity.kind === 'beam') {
      const path = entity.shape?.path ?? [];
      if (path.length !== 2 || entity.shape.closed) return null;
      const def = sectionProfile({ ...p, depth: p.height });
      if (!def) return null;
      const [a, b] = path.map((q) => w(q));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) return null;
      const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, 0];
      // Along the beam; the profile's y up (x across).
      return sweptOf(def, [a[0], a[1], a[2] + p.height / 2 - dz], dir, [-dir[1], dir[0], 0], len);
    }
    return null;
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
  // BIM_IfcProperties: the object's own property set; BIM_Classification: its classification reference.
  const valueOf = (v) => (typeof v === 'boolean' ? `IFCBOOLEAN(${v ? '.T.' : '.F.'})` : typeof v === 'number' ? `IFCREAL(${real(v)})` : `IFCLABEL(${s(String(v))})`);
  const classifications = new Map();
  const bimExtras = (element, entity, key) => {
    const props = entity.bim?.props;
    if (props) {
      const values = Object.entries(props).map(([k, v]) => add(`IFCPROPERTYSINGLEVALUE(${s(k)},$,${valueOf(v)},$)`));
      const set = add(`IFCPROPERTYSET(${guid(`${key}-pset`)},${history},'Pset_MyCAD_Properties',$,(${values.join(',')}))`);
      add(`IFCRELDEFINESBYPROPERTIES(${guid(`${key}-pset-rel`)},${history},$,$,(${element}),${set})`);
    }
    const c = entity.bim?.classification;
    if (c) {
      if (!classifications.has(c.system)) classifications.set(c.system, add(`IFCCLASSIFICATION($,$,$,${s(c.system)},$,$,$)`));
      const ref = add(`IFCCLASSIFICATIONREFERENCE($,${s(c.code)},${s(c.title || c.code)},${classifications.get(c.system)},$,$)`);
      add(`IFCRELASSOCIATESCLASSIFICATION(${guid(`${key}-class`)},${history},$,$,(${element}),${ref})`);
    }
  };

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
      const wall = add(`IFCWALL(${guid(key)},${history},${s(name)},$,$,${place},${sweptBody(entity, st.z) ?? shapeOf(world(whole), st.z)},$,.STANDARD.)`);
      st.elements.push(wall);
      mycad(wall, dataOf(entity), key);
      bimExtras(wall, entity, key);
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
    // BIM_IfcElements / BIM_Convert: a class given to the object wins over the one its kind implies.
    const [cls, type] = entity.bim?.ifcType ? [entity.bim.ifcType.toUpperCase(), '.NOTDEFINED.'] : ifcClassOf(entity);
    const tris = solidMesh(entity);
    const id = add(`${cls}(${guid(key)},${history},${s(name)},$,${isArchKind(entity.kind) ? '$' : s(entity.kind)},${place},${sweptBody(entity, st.z) ?? shapeOf(tris, st.z)},$,${type})`);
    st.elements.push(id);
    if (entity.kind !== 'mesh') mycad(id, dataOf(entity), key);
    bimExtras(id, entity, key);
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
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
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
 * Reads an IFC (2x3 or 4) file. Objects written by MyCAD come back as the
 * parametric objects they were; other programs' walls, slabs, columns and beams
 * whose bodies are extrusions become those BIM objects (walls with their door,
 * window and opening voids as openings); anything else becomes a mesh solid named
 * after the element and its class (openings cut). Returns { entities, warnings, bim }.
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

  // ── Other programs' elements as BIM objects (FreeCAD reads IFC this way): a wall, slab,
  // column or beam whose body is one extrusion becomes that object with its parameters;
  // a wall's openings (filled by doors and windows) become its openings. The rest: meshes.
  const fills = new Map(); // opening → the door / window in it
  for (const e of E.values()) if (e.type === 'IFCRELFILLSELEMENT') fills.set(e.args[4]?.ref, e.args[5]?.ref);
  const dirOf = (m, v) => vec.sub(applyMap(m, v), applyMap(m, [0, 0, 0]));
  /** A product whose body is a single extruded area: the profile, profile → world map, world direction and depth. */
  const extrusionOf = (e) => {
    const shape = get(e.args[6]);
    const reps = (shape?.args[2] ?? []).map(get).filter(Boolean);
    const body = reps.find((rep) => /^Body$/i.test(rep.args[1] ?? '')) ?? (reps.length === 1 ? reps[0] : null);
    const items = body?.args[3] ?? [];
    if (items.length !== 1) return null;
    const item = get(items[0]);
    if (item?.type !== 'IFCEXTRUDEDAREASOLID') return null;
    const prof = profile(item.args[0]);
    if (!prof) return null;
    const W = compose(localPlacement(e.args[5]), axisPlacement(item.args[1]));
    const dir = vec.unit(dirOf(W, direction(item.args[2], [0, 0, 1])));
    return { prof, profEntity: get(item.args[0]), W, dir, depth: (Number(item.args[3]) || 0) * unit };
  };
  const xy = (p) => ({ x: p[0], y: p[1] });
  const hostedFills = new Set();
  const doneWalls = new Set();
  const parametric = new Map();
  /** A wall: an upright extrusion of a rectangle → its centre line, width, height, openings. */
  const wallFrom = (id, e) => {
    const x = extrusionOf(e);
    if (!x || Math.abs(x.dir[2]) < 0.999 || x.prof.holes.length || x.prof.outer.length !== 4) return null;
    const c = x.prof.outer.map((p) => applyMap(x.W, [p[0], p[1], 0]));
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [e01, e12] = [len(c[0], c[1]), len(c[1], c[2])];
    if (Math.abs(len(c[0], c[2]) - Math.hypot(e01, e12)) > 1e-3 * (e01 + e12)) return null; // not a rectangle
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [start, end, width] = e01 >= e12 ? [mid(c[0], c[3]), mid(c[1], c[2]), e12] : [mid(c[0], c[1]), mid(c[3], c[2]), e01];
    const height = x.depth * Math.abs(x.dir[2]);
    const base = Math.min(c[0][2], c[0][2] + x.dir[2] * x.depth);
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const t = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    const openings = [];
    for (const ref of voids.get(id) ?? []) {
      const opening = E.get(ref);
      const tris = opening ? productTris(opening) : [];
      if (!tris.length) continue;
      const pts = tris.flat();
      const along = pts.map((p) => (p[0] - start[0]) * t[0] + (p[1] - start[1]) * t[1]);
      const zs = pts.map((p) => p[2]);
      // The door or window in it: related (IfcRelFillsElement), or one standing inside the opening (FreeCAD writes no relation).
      let fillerId = fills.get(ref);
      if (!fillerId) {
        const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))); const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
        fillerId = [...E.entries()].find(([fid, fe]) => (fe.type === 'IFCDOOR' || fe.type === 'IFCWINDOW') && !hostedFills.has(fid) && (() => { const ft = productTris(fe).flat(); if (!ft.length) return false; const c = [0, 1, 2].map((k) => (Math.min(...ft.map((p) => p[k])) + Math.max(...ft.map((p) => p[k]))) / 2); return c.every((v, k) => v >= lo[k] - 1 && v <= hi[k] + 1); })())?.[0];
      }
      const filler = E.get(fillerId);
      if (filler) hostedFills.add(fillerId);
      const type = filler?.type === 'IFCDOOR' ? 'door' : filler?.type === 'IFCWINDOW' ? 'window' : 'opening';
      const at = Math.max(0, Math.min(...along));
      openings.push({ type, at, width: Math.min(length, Math.max(...along)) - at, height: Math.max(...zs) - Math.min(...zs), sill: Math.max(0, Math.min(...zs) - base) });
    }
    openings.sort((a, b) => a.at - b.at);
    return { type: 'solid', kind: 'wall', name: decodeIfcString(e.args[2]) || 'Wall', params: { width, height, align: 0 }, shape: { path: [xy(start), xy(end)], openings }, z: base };
  };
  for (const [id, e] of E.entries()) {
    if ((e.type !== 'IFCWALL' && e.type !== 'IFCWALLSTANDARDCASE') || mycadData.has(id)) continue;
    const wall = wallFrom(id, e);
    if (wall) { parametric.set(id, wall); doneWalls.add(id); }
  }
  /** A slab: an upright extrusion of any outline → that outline and its thickness (hanging below its top). */
  const slabFrom = (e) => {
    const x = extrusionOf(e);
    if (!x || Math.abs(x.dir[2]) < 0.999) return null;
    const loop = (pts) => pts.map((p) => xy(applyMap(x.W, [p[0], p[1], 0])));
    const z0 = applyMap(x.W, [0, 0, 0])[2];
    return { type: 'solid', kind: 'slab', name: decodeIfcString(e.args[2]) || 'Slab', params: { thickness: x.depth * Math.abs(x.dir[2]) }, shape: { outer: loop(x.prof.outer), holes: x.prof.holes.map(loop) }, z: Math.max(z0, z0 + x.dir[2] * x.depth) };
  };
  /** A column (upright) or a beam (level): a rectangle, circle or I section along the extrusion. */
  const sectionParams = (p, prof = null) => {
    const L = (v) => (Number(v) || 0) * unit;
    // A plain outline that is a rectangle square to its axes (FreeCAD writes sections so).
    if (prof && (p?.type === 'IFCARBITRARYCLOSEDPROFILEDEF') && prof.outer.length === 4 && !prof.holes.length) {
      const xs = prof.outer.map((q) => q[0]); const ys = prof.outer.map((q) => q[1]);
      const w = Math.max(...xs) - Math.min(...xs); const d = Math.max(...ys) - Math.min(...ys);
      if (prof.outer.every((q) => (Math.abs(q[0] - Math.min(...xs)) < 1e-6 || Math.abs(q[0] - Math.max(...xs)) < 1e-6) && (Math.abs(q[1] - Math.min(...ys)) < 1e-6 || Math.abs(q[1] - Math.max(...ys)) < 1e-6))) return { profile: 0, width: w, depth: d };
    }
    if (p?.type === 'IFCRECTANGLEPROFILEDEF') return { profile: 0, width: L(p.args[3]), depth: L(p.args[4]) };
    if (p?.type === 'IFCCIRCLEPROFILEDEF') return { profile: 1, width: 2 * L(p.args[3]), depth: 2 * L(p.args[3]) };
    if (p?.type === 'IFCISHAPEPROFILEDEF') return { profile: 2, width: L(p.args[3]), depth: L(p.args[4]), tw: L(p.args[5]), tf: L(p.args[6]) };
    return null;
  };
  const columnFrom = (e) => {
    const x = extrusionOf(e);
    const sec = sectionParams(x?.profEntity, x?.prof);
    if (!x || !sec || Math.abs(x.dir[2]) < 0.999) return null;
    const xs = x.prof.outer.map((p) => p[0]); const ys = x.prof.outer.map((p) => p[1]);
    const centre = applyMap(x.W, [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0]);
    const ax = dirOf(x.W, [1, 0, 0]);
    const base = Math.min(centre[2], centre[2] + x.dir[2] * x.depth);
    return { type: 'solid', kind: 'column', name: decodeIfcString(e.args[2]) || 'Column', params: { width: sec.width, depth: sec.depth, height: x.depth, profile: sec.profile, preset: 0, tw: sec.tw ?? 0, tf: sec.tf ?? 0 }, x: centre[0], y: centre[1], z: base, rz: (Math.atan2(ax[1], ax[0]) * 180) / Math.PI };
  };
  const beamFrom = (e) => {
    const x = extrusionOf(e);
    // A beam drawn as a box extruded up by its height (FreeCAD without a base line): along the box's long side.
    if (x && Math.abs(x.dir[2]) > 0.999 && x.prof.outer.length === 4 && !x.prof.holes.length) {
      const c = x.prof.outer.map((p) => applyMap(x.W, [p[0], p[1], 0]));
      const len = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const [e01, e12] = [len(c[0], c[1]), len(c[1], c[2])];
      const [start, end, width] = e01 >= e12 ? [mid(c[0], c[3]), mid(c[1], c[2]), e12] : [mid(c[0], c[1]), mid(c[3], c[2]), e01];
      const height = x.depth;
      return { type: 'solid', kind: 'beam', name: decodeIfcString(e.args[2]) || 'Beam', params: { width, height, profile: 0, preset: 0, tw: 0, tf: 0 }, shape: { path: [xy(start), xy(end)] }, z: Math.min(c[0][2], c[0][2] + x.dir[2] * height) };
    }
    const sec = sectionParams(x?.profEntity, x?.prof);
    if (!x || !sec || Math.abs(x.dir[2]) > 1e-3) return null;
    const xs = x.prof.outer.map((p) => p[0]); const ys = x.prof.outer.map((p) => p[1]);
    const start = applyMap(x.W, [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0]);
    const end = vec.add(start, vec.mul(x.dir, x.depth));
    // Which profile axis stands up: its size is the beam's height.
    const upY = Math.abs(dirOf(x.W, [0, 1, 0])[2]) >= Math.abs(dirOf(x.W, [1, 0, 0])[2]);
    const [width, height] = upY ? [sec.width, sec.depth] : [sec.depth, sec.width];
    return { type: 'solid', kind: 'beam', name: decodeIfcString(e.args[2]) || 'Beam', params: { width, height, profile: sec.profile, preset: 0, tw: sec.tw ?? 0, tf: sec.tf ?? 0 }, shape: { path: [xy(start), xy(end)] }, z: start[2] - height / 2 };
  };
  const PARAMETRIC = { IFCSLAB: slabFrom, IFCCOLUMN: columnFrom, IFCBEAM: beamFrom };

  const entities = [];
  for (const [id, e] of E.entries()) {
    const own = mycadData.get(id);
    if (own?.hosted) continue;
    if (!own && hostedFills.has(id)) continue; // a door or window: an opening of its wall now
    if (!own && parametric.has(id)) { entities.push({ ...parametric.get(id), storeyRef: storeyOfElement.get(id) }); continue; }
    if (!own && PARAMETRIC[e.type] && get(e.args[5])?.type === 'IFCLOCALPLACEMENT' && !(voids.get(id)?.length)) {
      const made = PARAMETRIC[e.type](e);
      if (made) { entities.push({ ...made, storeyRef: storeyOfElement.get(id) }); continue; }
    }
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
