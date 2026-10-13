// 3D file exchange — FreeCAD's formats for solids and meshes (and AMF, for 3D
// printers; FreeCAD itself does not read AMF):
//   write  STL (stl.js) · OBJ · PLY · OFF · AMF · 3MF · STEP (faceted B-rep) · FCStd (parametric FreeCAD document)
//   read   STL · OBJ · PLY · OFF · AMF · 3MF · STEP (faceted and planar/cylindrical/conical/spherical/toroidal faces) · FCStd
// Meshes are triangles [[x, y, z] × 3] in millimetres.
import { primitives } from './entities.js';
import { arcPoints, polygonArea } from './geometry.js';
import { exactVolume, flattenTriangles, hasShape, helixPath, meshBox, normalizeSolidData, partInParent, placement, resampleLoop, solidMesh } from './solids.js';
import { planarFaces } from './meshtools.js';
import { triangulate } from './triangulate.js';
import { child, childrenNamed, escapeXml, findAll, parseXml } from './xml.js';
import { isZip, readZip, writeZip, zipText } from './zip.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const f = (v) => (Math.abs(v) < 1e-12 ? '0' : String(Math.round(v * 1e9) / 1e9));

export const MESH_FORMATS = ['stl', 'obj', 'ply', 'off', 'amf', '3mf', 'step', 'fcstd'];
export const IMPORT_FORMATS = ['stl', 'obj', 'ply', 'off', 'amf', '3mf', 'step', 'stp', 'fcstd'];

/** Shared vertices: { vertices: [[x, y, z]], faces: [[i, j, k]] }. */
export function indexMesh(triangles) {
  const vertices = [];
  const map = new Map();
  const faces = triangles.map((tri) => tri.map((p) => {
    const key = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    let index = map.get(key);
    if (index === undefined) { index = vertices.length; vertices.push(p); map.set(key, index); }
    return index;
  })).filter(([a, b, c]) => a !== b && b !== c && a !== c);
  return { vertices, faces };
}

/** [{ name, triangles }] from solid entities (one object per solid). */
export function objectsOf(entities) {
  return entities.filter((e) => e.type === 'solid').map((e, i) => ({ name: e.name || `${e.kind}${i + 1}`, triangles: solidMesh(e), color: e.color }));
}

// ───────────────────────── writers

export function toObj(objects, title = 'MyCAD') {
  const lines = [`# ${title} — MyCAD (millimetres)`, ''];
  let base = 1;
  for (const object of objects) {
    const { vertices, faces } = indexMesh(object.triangles);
    lines.push(`o ${object.name.replace(/\s+/g, '_')}`);
    for (const v of vertices) lines.push(`v ${f(v[0])} ${f(v[1])} ${f(v[2])}`);
    for (const face of faces) lines.push(`f ${face.map((i) => i + base).join(' ')}`);
    base += vertices.length;
    lines.push('');
  }
  return lines.join('\n');
}

export function toPly(objects, title = 'MyCAD') {
  const { vertices, faces } = indexMesh(objects.flatMap((o) => o.triangles));
  return [
    'ply', 'format ascii 1.0', `comment ${String(title).replace(/[^ -~]/g, '_')} - MyCAD (millimetres)`,
    `element vertex ${vertices.length}`, 'property float x', 'property float y', 'property float z',
    `element face ${faces.length}`, 'property list uchar int vertex_indices', 'end_header',
    ...vertices.map((v) => v.map(f).join(' ')),
    ...faces.map((face) => `3 ${face.join(' ')}`), '',
  ].join('\n');
}

export function toOff(objects) {
  const { vertices, faces } = indexMesh(objects.flatMap((o) => o.triangles));
  return ['OFF', `${vertices.length} ${faces.length} 0`, ...vertices.map((v) => v.map(f).join(' ')), ...faces.map((face) => `3 ${face.join(' ')}`), ''].join('\n');
}

export function toAmf(objects, title = 'MyCAD') {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<amf unit="millimeter" version="1.1">', `  <metadata type="name">${escapeXml(title)}</metadata>`, '  <metadata type="cad">MyCAD</metadata>'];
  objects.forEach((object, id) => {
    const { vertices, faces } = indexMesh(object.triangles);
    out.push(`  <object id="${id + 1}">`, `    <metadata type="name">${escapeXml(object.name)}</metadata>`, '    <mesh>', '      <vertices>');
    for (const v of vertices) out.push(`        <vertex><coordinates><x>${f(v[0])}</x><y>${f(v[1])}</y><z>${f(v[2])}</z></coordinates></vertex>`);
    out.push('      </vertices>', '      <volume>');
    for (const [a, b, c] of faces) out.push(`        <triangle><v1>${a}</v1><v2>${b}</v2><v3>${c}</v3></triangle>`);
    out.push('      </volume>', '    </mesh>', '  </object>');
  });
  out.push('</amf>', '');
  return out.join('\n');
}

export function to3mf(objects, title = 'MyCAD') {
  const model = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${escapeXml(title)}</metadata>`, '  <metadata name="Application">MyCAD</metadata>', '  <resources>'];
  objects.forEach((object, i) => {
    const { vertices, faces } = indexMesh(object.triangles);
    model.push(`    <object id="${i + 1}" type="model" name="${escapeXml(object.name)}">`, '      <mesh>', '        <vertices>');
    for (const v of vertices) model.push(`          <vertex x="${f(v[0])}" y="${f(v[1])}" z="${f(v[2])}"/>`);
    model.push('        </vertices>', '        <triangles>');
    for (const [a, b, c] of faces) model.push(`          <triangle v1="${a}" v2="${b}" v3="${c}"/>`);
    model.push('        </triangles>', '      </mesh>', '    </object>');
  });
  model.push('  </resources>', '  <build>', ...objects.map((_, i) => `    <item objectid="${i + 1}"/>`), '  </build>', '</model>', '');
  return writeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n' },
    { name: '3D/3dmodel.model', data: model.join('\n') },
  ]);
}

/** STEP AP214 with one faceted B-rep (closed shell of planar faces) per object. */
export function toStep(objects, { title = 'MyCAD', author = '', date = new Date(), mergeFaces = true } = {}) {
  const lines = [];
  let id = 0;
  const add = (text) => { id += 1; lines.push(`#${id}=${text};`); return `#${id}`; };
  const s = (text) => `'${String(text).replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '_')}'`;
  const n = (v) => { const t = String(Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e6) / 1e6); return t.includes('.') || t.includes('e') ? t : `${t}.`; };
  // Shared directions (most faces of a part point the same few ways).
  const directions = new Map();
  const dir = (v) => {
    const key = v.map((x) => n(x)).join(',');
    if (!directions.has(key)) directions.set(key, add(`DIRECTION('',(${key}))`));
    return directions.get(key);
  };
  const appContext = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appContext})`);
  const productContext = add(`PRODUCT_CONTEXT('',${appContext},'mechanical')`);
  const product = add(`PRODUCT(${s(title)},${s(title)},'',(${productContext}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${product}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${appContext},'design')`);
  const definition = add(`PRODUCT_DEFINITION('design','',${formation},${definitionContext})`);
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);
  const length = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const angle = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const solidAngle = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${length},'distance_accuracy_value','confusion accuracy')`);
  const context = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},${angle},${solidAngle}))REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY'))`);
  const origin = add("CARTESIAN_POINT('',(0.,0.,0.))");
  const axis = add(`AXIS2_PLACEMENT_3D('',${origin},${add("DIRECTION('',(0.,0.,1.))")},${add("DIRECTION('',(1.,0.,0.))")})`);
  const breps = [];
  for (const object of objects) {
    const { vertices, faces } = indexMesh(object.triangles);
    const points = vertices.map((v) => add(`CARTESIAN_POINT('',(${n(v[0])},${n(v[1])},${n(v[2])}))`));
    // Faces: neighbouring triangles on one plane joined into a polygon (with inner loops for holes),
    // each a FACE_SURFACE on its PLANE, which every STEP reader can build.
    const groups = mergeFaces ? planarFaces(vertices, faces) : faces.map((face) => planarFaces(vertices, [face])[0]);
    const faceIds = groups.map(({ loops, normal, ref }) => {
      const plane = add(`PLANE('',${add(`AXIS2_PLACEMENT_3D('',${points[loops[0][0]]},${dir(normal)},${dir(ref)})`)})`);
      const bounds = loops.map((loop, i) => add(`${i ? 'FACE_BOUND' : 'FACE_OUTER_BOUND'}('',${add(`POLY_LOOP('',(${loop.map((v) => points[v]).join(',')}))`)},.T.)`));
      return add(`FACE_SURFACE('',(${bounds.join(',')}),${plane},.T.)`);
    });
    const shell = add(`CLOSED_SHELL('',(${faceIds.join(',')}))`);
    breps.push(add(`FACETED_BREP(${s(object.name)},${shell})`));
  }
  const representation = add(`FACETED_BREP_SHAPE_REPRESENTATION(${s(title)},(${[axis, ...breps].join(',')}),${context})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`);
  const stamp = date.toISOString().slice(0, 19);
  return [
    'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('MyCAD faceted solid model'),'2;1');",
    `FILE_NAME(${s(`${title}.step`)},'${stamp}',(${s(author)}),('MyCAD'),'MyCAD','MyCAD','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...lines, 'ENDSEC;', 'END-ISO-10303-21;', '',
  ].join('\n');
}


// ───────────────────────── FreeCAD document (.FCStd)

const rad = (d) => (d * Math.PI) / 180;
const matMul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const rotX = (d) => { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = (d) => { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = (d) => { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const apply = (m, v) => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);

/** The rotation of a solid (X, then Y, then Z) as a matrix. */
export const rotationOf = (e) => matMul(rotZ(e.rz ?? 0), matMul(rotY(e.ry ?? 0), rotX(e.rx ?? 0)));

/** Rotation matrix → quaternion [x, y, z, w]. */
export function quaternionOf(m) {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let x; let y; let z; let w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (m[2][1] - m[1][2]) / s; y = (m[0][2] - m[2][0]) / s; z = (m[1][0] - m[0][1]) / s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    w = (m[2][1] - m[1][2]) / s; x = s / 4; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = s / 4; z = (m[1][2] + m[2][1]) / s;
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = s / 4;
  }
  return w < 0 ? [-x, -y, -z, -w] : [x, y, z, w];
}

/** Quaternion [x, y, z, w] → rotation matrix. */
export function matrixOfQuaternion([x, y, z, w]) {
  const l = Math.hypot(x, y, z, w) || 1;
  [x, y, z, w] = [x / l, y / l, z / l, w / l];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** Rotation matrix → our angles (rx, ry, rz in degrees; R = Rz·Ry·Rx). */
export function anglesOf(m) {
  const deg = (r) => (Math.abs(r) < 1e-12 ? 0 : (r * 180) / Math.PI);
  const sy = -m[2][0];
  if (Math.abs(sy) > 1 - 1e-12) {
    // Gimbal lock: put everything in rz.
    return { rx: 0, ry: deg(Math.sign(sy) * Math.PI / 2), rz: deg(Math.atan2(-m[0][1], m[1][1])) };
  }
  return { rx: deg(Math.atan2(m[2][1], m[2][2])), ry: deg(Math.asin(sy)), rz: deg(Math.atan2(m[1][0], m[0][0])) };
}

const placementXml = (position, matrix) => {
  const [x, y, z, w] = quaternionOf(matrix);
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, w)));
  const s = Math.sin(angle / 2);
  const axis = s > 1e-9 ? [x / s, y / s, z / s] : [0, 0, 1];
  return `<PropertyPlacement Px="${f(position[0])}" Py="${f(position[1])}" Pz="${f(position[2])}" Q0="${f(x)}" Q1="${f(y)}" Q2="${f(z)}" Q3="${f(w)}" A="${f(angle)}" Ox="${f(axis[0])}" Oy="${f(axis[1])}" Oz="${f(axis[2])}"/>`;
};

/**
 * An empty OpenCASCADE compound carrying a location (.brp text). FreeCAD
 * restores a sketch's placement from its stored shape, so every sketch MyCAD
 * writes gets one; FreeCAD rebuilds the real shape on recompute.
 */
export function locatedEmptyBrep(position, matrix) {
  const row = (i) => `${matrix[i].map((v) => f(v)).join(' ')} ${f(position[i])} `;
  return ['', 'CASCADE Topology V1, (c) Matra-Datavision', 'Locations 1', '1', row(0), row(1), row(2),
    'Curve2ds 0', 'Curves 0', 'Polygon3D 0', 'PolygonOnTriangulations 0', 'Surfaces 0', 'Triangulations 0', '',
    'TShapes 1', 'Co', '', '1100000', '*', '', '+1 1 ', ''].join('\n');
}

const P = {
  float: (name, value, type = 'App::PropertyLength') => [name, type, `<Float value="${f(value)}"/>`],
  int: (name, value, type = 'App::PropertyInteger') => [name, type, `<Integer value="${Math.round(value)}"/>`],
  bool: (name, value) => [name, 'App::PropertyBool', `<Bool value="${value ? 'true' : 'false'}"/>`],
  string: (name, value) => [name, 'App::PropertyString', `<String value="${escapeXml(value)}"/>`],
  link: (name, value) => [name, 'App::PropertyLink', `<Link value="${value}"/>`],
  links: (name, values) => [name, 'App::PropertyLinkList', `<LinkList count="${values.length}">${values.map((v) => `<Link value="${v}"/>`).join('')}</LinkList>`],
  linkSub: (name, value) => [name, 'App::PropertyLinkSub', `<LinkSub value="${value}" count="0"></LinkSub>`],
  vector: (name, [x, y, z]) => [name, 'App::PropertyVector', `<PropertyVector valueX="${f(x)}" valueY="${f(y)}" valueZ="${f(z)}"/>`],
  // FreeCAD keeps point lists in a side file: uint32 count, then x, y, z as float64 (little endian).
  vectors: (name, list, file) => {
    const bytes = new Uint8Array(4 + list.length * 24);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, list.length, true);
    list.forEach((p, i) => p.forEach((v, k) => view.setFloat64(4 + i * 24 + k * 8, v, true)));
    return [name, 'App::PropertyVectorList', `<VectorList file="${file}"/>`, null, { name: file, data: bytes }];
  },
  enumeration: (name, value) => [name, 'App::PropertyEnumeration', `<Integer value="${value}"/>`],
  placement: (name, position, matrix) => [name, 'App::PropertyPlacement', placementXml(position, matrix), { position, matrix }],
  mesh: (file) => ['Mesh', 'Mesh::PropertyMeshKernel', `<Mesh file="${file}"/>`],
  shape: (file) => ['Shape', 'Part::PropertyPartShape', `<Part file="${file}"/>`],
};

/** Sketch geometry (lines, circles, arcs) as FreeCAD XML. items: { line: [a, b] } | { circle: [c, r] } | { arc: [c, r, start, end] } (degrees), 2D. */
function geometryXml(items) {
  const g = (attrs) => Object.entries(attrs).map(([k, v]) => `${k}="${typeof v === 'number' ? f(v) : v}"`).join(' ');
  const body = items.map((item, i) => {
    const ext = `<GeoExtensions count="1"><GeoExtension type="Sketcher::SketchGeometryExtension" id="${i + 1}" internalGeometryType="0" geometryModeFlags="00000000000000000000000000000000" geometryLayer="0"/></GeoExtensions>`;
    const construction = `<Construction value="${item.construction ? 1 : 0}"/>`;
    if (item.line) {
      const [a, b] = item.line;
      return `<Geometry type="Part::GeomLineSegment" id="${i + 1}" migrated="1">${ext}<LineSegment ${g({ StartX: a.x, StartY: a.y, StartZ: 0, EndX: b.x, EndY: b.y, EndZ: 0 })}/>${construction}</Geometry>`;
    }
    if (item.circle) {
      const [c, r] = item.circle;
      return `<Geometry type="Part::GeomCircle" id="${i + 1}" migrated="1">${ext}<Circle ${g({ CenterX: c.x, CenterY: c.y, CenterZ: 0, NormalX: 0, NormalY: 0, NormalZ: 1, AngleXU: 0, Radius: r })}/>${construction}</Geometry>`;
    }
    const [c, r, start, end] = item.arc;
    const s0 = rad(start);
    let s1 = rad(end);
    while (s1 <= s0) s1 += 2 * Math.PI;
    return `<Geometry type="Part::GeomArcOfCircle" id="${i + 1}" migrated="1">${ext}<ArcOfCircle ${g({ CenterX: c.x, CenterY: c.y, CenterZ: 0, NormalX: 0, NormalY: 0, NormalZ: 1, AngleXU: 0, Radius: r, StartAngle: s0, EndAngle: s1 })}/>${construction}</Geometry>`;
  });
  return ['Geometry', 'Part::PropertyGeometryList', `<GeometryList count="${items.length}">${body.join('')}</GeometryList>`];
}

const loopItems = (points) => points.map((p, i) => ({ line: [p, points[(i + 1) % points.length]] }));

/** The FreeCAD objects of one solid entity: [{ name, type, props, visible }]. */
function freecadObjectsOf(e, name, label, bms) {
  const s = e.scale ?? 1;
  const R = rotationOf(e);
  const T = [e.x ?? 0, e.y ?? 0, e.z ?? 0];
  const p = e.params;
  const objects = [];
  const obj = (type, objName, props, visible = false) => {
    objects.push({ name: objName, type, props: [P.string('Label', objName === name ? label : objName), ...props], visible });
    return objName;
  };
  const place = (matrix = R, position = T) => P.placement('Placement', position, matrix);
  const L = (v) => v * s;
  // Mirrored solids: build the unmirrored one, then mirror it about the local x–z plane.
  const mirrored = e.flip && !['sphere', 'cone', 'torus', 'tube', 'ellipsoid', 'prism', 'helix', 'mesh', 'sweep', 'boolean'].includes(e.kind)
    && !(e.kind === 'cylinder' && p.angle >= 359.999);
  const main = mirrored ? `${name}_base` : name;
  const visibleMain = !mirrored;
  switch (e.kind) {
    case 'box': obj('Part::Box', main, [P.float('Length', L(p.length)), P.float('Width', L(p.width)), P.float('Height', L(p.height)), place()], visibleMain); break;
    case 'cylinder': obj('Part::Cylinder', main, [P.float('Radius', L(p.radius)), P.float('Height', L(p.height)), P.float('Angle', p.angle, 'App::PropertyAngle'), place()], visibleMain); break;
    case 'sphere': obj('Part::Sphere', main, [P.float('Radius', L(p.radius)), place()], true); break;
    case 'cone': obj('Part::Cone', main, [P.float('Radius1', L(p.radius1)), P.float('Radius2', L(p.radius2)), P.float('Height', L(p.height)), place()], true); break;
    case 'torus': obj('Part::Torus', main, [P.float('Radius1', L(p.radius1)), P.float('Radius2', L(p.radius2)), place()], true); break;
    case 'ellipsoid': obj('Part::Ellipsoid', main, [P.float('Radius1', L(p.radius1)), P.float('Radius2', L(p.radius2)), P.float('Radius3', L(p.radius3)), place()], true); break;
    case 'prism': obj('Part::Prism', main, [P.int('Polygon', p.sides, 'App::PropertyIntegerConstraint'), P.float('Circumradius', L(p.radius)), P.float('Height', L(p.height)), place()], true); break;
    case 'tube': {
      const outer = obj('Part::Cylinder', `${name}_outer`, [P.float('Radius', L(p.outer)), P.float('Height', L(p.height)), place()]);
      const inner = obj('Part::Cylinder', `${name}_inner`, [P.float('Radius', L(p.inner)), P.float('Height', L(p.height)), place()]);
      obj('Part::Cut', main, [P.link('Base', outer), P.link('Tool', inner)], true);
      break;
    }
    case 'wedge': {
      // FreeCAD's wedge rises along its y axis; turn it so it rises along z.
      obj('Part::Wedge', main, [
        P.float('Xmin', 0, 'App::PropertyDistance'), P.float('Ymin', 0, 'App::PropertyDistance'), P.float('Zmin', -L(p.width), 'App::PropertyDistance'),
        P.float('X2min', 0, 'App::PropertyDistance'), P.float('Z2min', -L(p.width), 'App::PropertyDistance'),
        P.float('Xmax', L(p.length), 'App::PropertyDistance'), P.float('Ymax', L(p.height), 'App::PropertyDistance'), P.float('Zmax', 0, 'App::PropertyDistance'),
        P.float('X2max', L(p.topLength), 'App::PropertyDistance'), P.float('Z2max', 0, 'App::PropertyDistance'),
        place(matMul(R, rotX(90))),
      ], visibleMain);
      break;
    }
    case 'helix': {
      const spine = obj('Part::Helix', `${name}_path`, [P.float('Pitch', L(p.pitch)), P.float('Height', L(p.pitch * p.turns)), P.float('Radius', L(p.radius)), P.int('LocalCoord', e.flip ? 1 : 0, 'App::PropertyEnumeration'), place()]);
      const section = obj('Part::Circle', `${name}_section`, [P.float('Radius', L(p.wire)), place(matMul(R, rotX(90)), [T[0] + apply(R, [L(p.radius), 0, 0])[0], T[1] + apply(R, [L(p.radius), 0, 0])[1], T[2] + apply(R, [L(p.radius), 0, 0])[2]])]);
      obj('Part::Sweep', main, [P.links('Sections', [section]), P.linkSub('Spine', spine), P.bool('Solid', true), P.bool('Frenet', true)], true);
      break;
    }
    case 'pad': {
      const items = (e.shape.shapes ?? []).flatMap((shape) => [shape.outer, ...shape.holes].flatMap((loop) => loopItems(loop.map((q) => ({ x: L(q.x), y: L(q.y) })))));
      const sketch = obj('Sketcher::SketchObject', `${name}_sketch`, [geometryXml(items), place()]);
      obj('Part::Extrusion', main, [P.link('Base', sketch), P.enumeration('DirMode', 2), P.vector('Dir', apply(R, [0, 0, 1])), P.float('LengthFwd', L(p.height), 'App::PropertyDistance'), P.bool('Solid', true)], visibleMain);
      break;
    }
    case 'revolution': {
      const items = loopItems(e.shape.profile.map(([r, z]) => ({ x: L(r), y: L(z) })));
      const sketch = obj('Sketcher::SketchObject', `${name}_profile`, [geometryXml(items), place(matMul(R, rotX(90)))]);
      obj('Part::Revolution', main, [P.link('Source', sketch), P.vector('Axis', apply(R, [0, 0, 1])), P.vector('Base', T), P.float('Angle', p.angle, 'App::PropertyFloatConstraint'), P.bool('Solid', true)], visibleMain);
      break;
    }
    case 'loft': {
      // Both outlines with the same number of points, lined up as MyCAD lofts them, so FreeCAD's ruled loft is the same solid.
      const n = Math.max(e.shape.bottom.length, e.shape.top.length, 48);
      const scaleLoop = (loop) => resampleLoop(loop, n).map((q) => ({ x: L(q.x), y: L(q.y) }));
      const bottom = obj('Sketcher::SketchObject', `${name}_bottom`, [geometryXml(loopItems(scaleLoop(e.shape.bottom))), place()]);
      const up = apply(R, [0, 0, L(p.height)]);
      const top = obj('Sketcher::SketchObject', `${name}_top`, [geometryXml(loopItems(scaleLoop(e.shape.top))), place(R, [T[0] + up[0], T[1] + up[1], T[2] + up[2]])]);
      obj('Part::Loft', main, [P.links('Sections', [bottom, top]), P.bool('Solid', true), P.bool('Ruled', true)], visibleMain);
      break;
    }
    case 'sweep': {
      const map = placement(e);
      const path = e.shape.path.map(map);
      const spine = obj('Part::Polygon', `${name}_path`, [P.vectors('Nodes', path, `${name}_path.Nodes.bin`), P.bool('Close', false)]);
      const t = [path[1][0] - path[0][0], path[1][1] - path[0][1], path[1][2] - path[0][2]];
      const l = Math.hypot(...t) || 1;
      const dir = t.map((v) => v / l);
      // A rotation that turns z onto the path direction.
      const zAxis = [0, 0, 1];
      const axis = [zAxis[1] * dir[2] - zAxis[2] * dir[1], zAxis[2] * dir[0] - zAxis[0] * dir[2], zAxis[0] * dir[1] - zAxis[1] * dir[0]];
      const sin = Math.hypot(...axis);
      const cos = dir[2];
      let turn = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      if (sin > 1e-9) {
        const [x, y, z] = axis.map((v) => v / sin);
        const a = Math.atan2(sin, cos);
        turn = matrixOfQuaternion([x * Math.sin(a / 2), y * Math.sin(a / 2), z * Math.sin(a / 2), Math.cos(a / 2)]);
      } else if (cos < 0) turn = rotX(180);
      const section = obj('Part::Circle', `${name}_section`, [P.float('Radius', L(p.radius)), place(turn, path[0])]);
      obj('Part::Sweep', main, [P.links('Sections', [section]), P.linkSub('Spine', spine), P.bool('Solid', true), P.bool('Frenet', false), P.enumeration('Transition', 1)], true);
      break;
    }
    case 'boolean': {
      // The parts (in the drawing's coordinates), hidden, then the operation on them.
      const partNames = e.shape.parts.map((part, i) => {
        const child = partInParent(part, e);
        const childName = `${main}_${i + 1}`;
        const made = freecadObjectsOf(child, childName, part.name || childName, bms);
        made.forEach((o) => { o.visible = false; });
        objects.push(...made);
        return childName;
      });
      if (e.shape.op === 'cut') {
        let tool = partNames[1];
        if (partNames.length > 2) tool = obj('Part::MultiFuse', `${main}_tools`, [P.links('Shapes', partNames.slice(1))]);
        obj('Part::Cut', main, [P.link('Base', partNames[0]), P.link('Tool', tool)], true);
      } else obj(e.shape.op === 'common' ? 'Part::MultiCommon' : 'Part::MultiFuse', main, [P.links('Shapes', partNames)], true);
      break;
    }
    case 'mesh':
    default: {
      const file = bms.add(solidMesh(e));
      obj('Mesh::Feature', main, [P.mesh(file)], true);
      break;
    }
  }
  if (mirrored) {
    // Mirror plane: through the solid's position, normal = its local y axis.
    let base = main;
    if (e.kind === 'cylinder' || e.kind === 'revolution') {
      // A partial revolution mirrored about its own start plane = the same piece turned back by its angle.
      const last = objects.find((o) => o.name === main);
      last.visible = true;
      if (e.kind === 'cylinder') last.props = last.props.map((prop) => (prop[0] === 'Placement' ? place(matMul(R, rotZ(-p.angle))) : prop));
      else {
        const sketch = objects.find((o) => o.name === `${name}_profile`);
        sketch.props = sketch.props.map((prop) => (prop[0] === 'Placement' ? place(matMul(matMul(R, rotZ(-p.angle)), rotX(90))) : prop));
      }
      last.name = name;
      last.props = last.props.map((prop) => (prop[0] === 'Label' ? P.string('Label', label) : prop));
      return objects;
    }
    obj('Part::Mirroring', name, [P.link('Source', base), P.vector('Base', T), P.vector('Normal', apply(R, [0, 1, 0]))], true);
    base = name;
  }
  return objects;
}

/** A FreeCAD binary mesh (MeshKernel .bms, version 1). */
export function toBms(triangles) {
  const { vertices, faces } = indexMesh(triangles);
  // Neighbour of face i across its edge k (corner k → corner k + 1).
  const edges = new Map();
  faces.forEach((face, i) => face.forEach((a, k) => edges.set(`${a},${face[(k + 1) % 3]}`, i)));
  const NONE = 0xffffffff;
  const buffer = new ArrayBuffer(8 + 256 + 8 + vertices.length * 12 + faces.length * 24 + 24);
  const view = new DataView(buffer);
  let at = 0;
  view.setUint32(at, 0xa0b0c0d0, true); at += 4;
  view.setUint32(at, 0x00010000, true); at += 4;
  const filler = 'MESH-'.repeat(52).slice(0, 255);
  for (let i = 0; i < 255; i++) view.setUint8(at + i, filler.charCodeAt(i));
  view.setUint8(at + 255, 10);
  at += 256;
  view.setUint32(at, vertices.length, true); at += 4;
  view.setUint32(at, faces.length, true); at += 4;
  for (const v of vertices) for (const c of v) { view.setFloat32(at, c, true); at += 4; }
  for (const face of faces) {
    for (const index of face) { view.setUint32(at, index, true); at += 4; }
    for (let k = 0; k < 3; k++) { view.setUint32(at, edges.get(`${face[(k + 1) % 3]},${face[k]}`) ?? NONE, true); at += 4; }
  }
  const box = meshBox(triangles) ?? { min: [0, 0, 0], max: [0, 0, 0] };
  for (let k = 0; k < 3; k++) { view.setFloat32(at, box.min[k], true); view.setFloat32(at + 4, box.max[k], true); at += 8; }
  return new Uint8Array(buffer);
}

/** Reads a FreeCAD .bms mesh into triangles. */
export function parseBms(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0xa0b0c0d0) throw new Error('not a FreeCAD mesh');
  let at = 8 + 256;
  const count = view.getUint32(at, true);
  const facets = view.getUint32(at + 4, true);
  at += 8;
  const vertices = [];
  for (let i = 0; i < count; i++) { vertices.push([view.getFloat32(at, true), view.getFloat32(at + 4, true), view.getFloat32(at + 8, true)]); at += 12; }
  const triangles = [];
  for (let i = 0; i < facets; i++) {
    triangles.push([0, 1, 2].map((k) => vertices[view.getUint32(at + k * 4, true)]));
    at += 24;
  }
  return triangles;
}

/** 2D drawing entities as one sketch (lines, circles, arcs; polylines as line segments). */
function sketchItemsOf(entities) {
  const items = [];
  for (const entity of entities) {
    if (['text', 'dim', 'solid'].includes(entity.type)) continue;
    for (const prim of primitives(entity)) {
      const construction = Boolean(prim.lineType && prim.lineType !== 'continuous');
      if (prim.kind === 'line') items.push({ line: [prim.a, prim.b], construction });
      else if (prim.kind === 'circle') items.push({ circle: [prim.c, prim.r], construction });
      else if (prim.kind === 'arc') items.push({ arc: [prim.c, prim.r, prim.start, prim.end], construction });
      else if (prim.kind === 'poly') {
        const pts = prim.points;
        for (let i = 0; i < pts.length - (prim.closed ? 0 : 1); i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-9) items.push({ line: [a, b], construction });
        }
      }
    }
  }
  return items;
}

/** A FreeCAD document (.FCStd bytes) with parametric objects for every solid and the 2D drawing as a sketch. */
export function toFcstd(drawing, { title = drawing.title || 'MyCAD', entities = drawing.entities } = {}) {
  const meshes = [];
  const bms = { add: (triangles) => { const file = meshes.length ? `MeshKernel${meshes.length}.bms` : 'MeshKernel.bms'; meshes.push({ name: file, data: toBms(triangles) }); return file; } };
  const objects = [];
  const used = new Set();
  const uniqueName = (base) => {
    const clean = (base || 'Solid').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    let n = clean;
    for (let i = 1; used.has(n); i++) n = `${clean}${String(i).padStart(3, '0')}`;
    used.add(n);
    return n;
  };
  const solids = entities.filter((e) => e.type === 'solid');
  solids.forEach((e) => {
    const kindName = e.kind[0].toUpperCase() + e.kind.slice(1);
    const name = uniqueName(kindName);
    for (const o of freecadObjectsOf(e, name, e.name || name, bms)) {
      used.add(o.name);
      objects.push(o);
    }
  });
  const items = sketchItemsOf(entities);
  if (items.length) objects.push({ name: uniqueName('Drawing2D'), type: 'Sketcher::SketchObject', props: [P.string('Label', 'Drawing 2D'), geometryXml(items), P.placement('Placement', [0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]])], visible: true });
  // Sketches carry their placement in a stored (empty) shape too — see locatedEmptyBrep.
  const shapes = [];
  for (const o of objects.filter((x) => x.type === 'Sketcher::SketchObject')) {
    const where = o.props.find((prop) => prop[0] === 'Placement')?.[3] ?? { position: [0, 0, 0], matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    const file = `${o.name}.Shape.brp`;
    shapes.push({ name: file, data: locatedEmptyBrep(where.position, where.matrix) });
    o.props.push(P.shape(file));
  }
  const deps = (o) => o.props.flatMap(([, , xml]) => [...xml.matchAll(/<Link(?:Sub)? value="([^"]+)"/g)].map((m) => m[1])).filter((n) => objects.some((x) => x.name === n));
  const xml = [
    "<?xml version='1.0' encoding='utf-8'?>",
    '<!--', ' FreeCAD Document, see https://www.freecad.org for more information...', ' Written by MyCAD.', '-->',
    '<Document SchemaVersion="4" ProgramVersion="1.0R0 (MyCAD)" FileVersion="1">',
    '    <Properties Count="3" TransientCount="0">',
    `        <Property name="Label" type="App::PropertyString"><String value="${escapeXml(title)}"/></Property>`,
    `        <Property name="CreatedBy" type="App::PropertyString"><String value="${escapeXml(drawing.author ?? '')}"/></Property>`,
    `        <Property name="Comment" type="App::PropertyString"><String value="MyCAD drawing — press Recompute (Ctrl+R) if shapes are not shown"/></Property>`,
    '    </Properties>',
    `    <Objects Count="${objects.length}" Dependencies="1">`,
    ...objects.map((o) => { const d = deps(o); return `        <ObjectDeps Name="${o.name}" Count="${d.length}">${d.map((n) => `<Dep Name="${n}"/>`).join('')}</ObjectDeps>`; }),
    ...objects.map((o, i) => `        <Object type="${o.type}" name="${o.name}" id="${1000 + i}" Touched="1" />`),
    '    </Objects>',
    `    <ObjectData Count="${objects.length}">`,
    ...objects.map((o) => {
      const props = [...o.props, P.bool('Visibility', o.visible)];
      return [`        <Object name="${o.name}">`, `            <Properties Count="${props.length}" TransientCount="0">`,
        ...props.map(([name, type, body]) => `                <Property name="${name}" type="${type}"${name === 'Visibility' ? ' status="648"' : ''}>${body}</Property>`),
        '            </Properties>', '        </Object>'].join('\n');
    }),
    '    </ObjectData>',
    '</Document>', '',
  ].join('\n');
  const gui = [
    "<?xml version='1.0' encoding='utf-8'?>",
    '<Document SchemaVersion="1" HasExpansion="0">',
    `    <ViewProviderData Count="${objects.length}">`,
    ...objects.map((o) => `        <ViewProvider name="${o.name}" expanded="0"><Properties Count="1" TransientCount="0"><Property name="Visibility" type="App::PropertyBool"><Bool value="${o.visible ? 'true' : 'false'}"/></Property></Properties></ViewProvider>`),
    '    </ViewProviderData>',
    '    <Camera settings=""/>',
    '</Document>', '',
  ].join('\n');
  const sideFiles = objects.flatMap((o) => o.props.map((prop) => prop[4]).filter(Boolean));
  // FreeCAD reads the side files in the order Document.xml refers to them.
  const files = [...meshes, ...shapes, ...sideFiles].sort((a, b) => xml.indexOf(`file="${a.name}"`) - xml.indexOf(`file="${b.name}"`));
  return writeZip([{ name: 'Document.xml', data: xml }, ...files, { name: 'GuiDocument.xml', data: gui }]);
}

// ───────────────────────── readers

const asBytes = (data) => (typeof data === 'string' ? encoder.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data));
const asText = (data) => (typeof data === 'string' ? data : decoder.decode(data));

/** Fan-triangulates a polygon of 3D points (planar or nearly so), keeping its winding. */
function polygonTriangles(points) {
  if (points.length < 3) return [];
  if (points.length === 3) return [points];
  // Newell normal, then project onto the dominant plane and ear-clip.
  const n = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const k = Math.abs(n[2]) >= Math.abs(n[0]) && Math.abs(n[2]) >= Math.abs(n[1]) ? 2 : Math.abs(n[0]) >= Math.abs(n[1]) ? 0 : 1;
  const [u, v] = [[1, 2], [2, 0], [0, 1]][k];
  const flat = points.map((p, index) => ({ x: p[u], y: p[v], index }));
  const ccw = polygonArea(flat) > 0;
  const tris = triangulate(flat);
  return tris.map((tri) => {
    const pts = tri.map((q) => points[q.index]);
    return ccw ? pts : [pts[0], pts[2], pts[1]];
  });
}

export function isBinaryStl(bytes) {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  if (84 + count * 50 === bytes.length) return true;
  return !/^\s*solid\b/.test(decoder.decode(bytes.subarray(0, 256)));
}

export function parseStl(data) {
  const bytes = asBytes(data);
  if (isBinaryStl(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    if (84 + count * 50 > bytes.length) throw new Error('STL: file is shorter than its triangle count');
    const triangles = [];
    for (let i = 0; i < count; i++) {
      const at = 84 + i * 50 + 12;
      triangles.push([0, 1, 2].map((k) => [view.getFloat32(at + k * 12, true), view.getFloat32(at + k * 12 + 4, true), view.getFloat32(at + k * 12 + 8, true)]));
    }
    return [{ name: 'STL', triangles }];
  }
  const objects = [];
  let current = null;
  let loop = [];
  for (const raw of decoder.decode(bytes).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('solid')) { current = { name: line.slice(5).trim() || 'STL', triangles: [] }; objects.push(current); } else if (line.startsWith('vertex')) {
      loop.push(line.split(/\s+/).slice(1, 4).map(Number));
    } else if (line.startsWith('endloop')) {
      if (!current) { current = { name: 'STL', triangles: [] }; objects.push(current); }
      current.triangles.push(...polygonTriangles(loop));
      loop = [];
    }
  }
  if (!objects.some((o) => o.triangles.length)) throw new Error('STL: no triangles');
  return objects.filter((o) => o.triangles.length);
}

export function parseObj(data) {
  const vertices = [];
  const objects = [];
  let current = null;
  const ensure = (name = 'OBJ') => { if (!current) { current = { name, triangles: [] }; objects.push(current); } return current; };
  for (const raw of asText(data).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'v') vertices.push(rest.slice(0, 3).map(Number));
    else if (key === 'o' || key === 'g') { current = { name: rest.join(' ') || 'OBJ', triangles: [] }; objects.push(current); } else if (key === 'f') {
      const face = rest.map((token) => {
        const i = parseInt(token.split('/')[0], 10);
        return vertices[i < 0 ? vertices.length + i : i - 1];
      }).filter(Boolean);
      ensure().triangles.push(...polygonTriangles(face));
    }
  }
  const out = objects.filter((o) => o.triangles.length);
  if (!out.length) throw new Error('OBJ: no faces');
  return out;
}

export function parsePly(data) {
  const bytes = asBytes(data);
  // The header is ASCII; find "end_header" as bytes (a UTF-8 comment would shift a character index).
  const marker = encoder.encode('end_header');
  let headerEnd = -1;
  for (let i = 0; i + marker.length <= Math.min(bytes.length, 65536) && headerEnd < 0; i++) {
    if (marker.every((b, k) => bytes[i + k] === b)) headerEnd = i;
  }
  if (headerEnd < 0) throw new Error('PLY: no header');
  const header = decoder.decode(bytes.subarray(0, headerEnd));
  let bodyAt = headerEnd + 'end_header'.length;
  while (bytes[bodyAt] === 13 || bytes[bodyAt] === 10) { bodyAt++; if (bytes[bodyAt - 1] === 10) break; }
  const format = /format\s+(\S+)/.exec(header)?.[1] ?? 'ascii';
  const elements = [];
  for (const line of header.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'element') elements.push({ name: parts[1], count: Number(parts[2]), props: [] });
    else if (parts[0] === 'property' && elements.length) {
      elements[elements.length - 1].props.push(parts[1] === 'list' ? { list: true, countType: parts[2], type: parts[3], name: parts[4] } : { type: parts[1], name: parts[2] });
    }
  }
  const vertices = [];
  const faces = [];
  if (format === 'ascii') {
    const tokens = decoder.decode(bytes.subarray(bodyAt)).trim().split(/\s+/).map(Number);
    let t = 0;
    for (const element of elements) {
      for (let i = 0; i < element.count; i++) {
        const record = {};
        for (const prop of element.props) {
          if (prop.list) { const n = tokens[t++]; record[prop.name] = tokens.slice(t, t + n); t += n; } else record[prop.name] = tokens[t++];
        }
        if (element.name === 'vertex') vertices.push([record.x, record.y, record.z]);
        if (element.name === 'face') faces.push(record.vertex_indices ?? record.vertex_index);
      }
    }
  } else {
    const little = format === 'binary_little_endian';
    const view = new DataView(bytes.buffer, bytes.byteOffset + bodyAt, bytes.byteLength - bodyAt);
    let at = 0;
    const SIZES = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
    const read = (type) => {
      let v;
      switch (type) {
        case 'char': case 'int8': v = view.getInt8(at); break;
        case 'uchar': case 'uint8': v = view.getUint8(at); break;
        case 'short': case 'int16': v = view.getInt16(at, little); break;
        case 'ushort': case 'uint16': v = view.getUint16(at, little); break;
        case 'int': case 'int32': v = view.getInt32(at, little); break;
        case 'uint': case 'uint32': v = view.getUint32(at, little); break;
        case 'float': case 'float32': v = view.getFloat32(at, little); break;
        default: v = view.getFloat64(at, little);
      }
      at += SIZES[type] ?? 8;
      return v;
    };
    for (const element of elements) {
      for (let i = 0; i < element.count; i++) {
        const record = {};
        for (const prop of element.props) {
          if (prop.list) { const n = read(prop.countType); record[prop.name] = Array.from({ length: n }, () => read(prop.type)); } else record[prop.name] = read(prop.type);
        }
        if (element.name === 'vertex') vertices.push([record.x, record.y, record.z]);
        if (element.name === 'face') faces.push(record.vertex_indices ?? record.vertex_index);
      }
    }
  }
  const triangles = faces.flatMap((face) => polygonTriangles((face ?? []).map((i) => vertices[i]).filter(Boolean)));
  if (!triangles.length) throw new Error('PLY: no faces');
  return [{ name: 'PLY', triangles }];
}

export function parseOff(data) {
  const tokens = asText(data).replace(/#.*$/gm, '').trim().split(/\s+/);
  let t = 0;
  const head = tokens[t++];
  if (!/OFF$/.test(head)) throw new Error('OFF: missing OFF header');
  const nv = Number(tokens[t++]);
  const nf = Number(tokens[t++]);
  t++;
  const vertices = [];
  for (let i = 0; i < nv; i++) { vertices.push([Number(tokens[t]), Number(tokens[t + 1]), Number(tokens[t + 2])]); t += 3; }
  const triangles = [];
  for (let i = 0; i < nf; i++) {
    const n = Number(tokens[t++]);
    const face = tokens.slice(t, t + n).map((v) => vertices[Number(v)]).filter(Boolean);
    t += n;
    // Optional colour values up to the end of the line are not separated in a token stream; OFF files with face colours are rare.
    triangles.push(...polygonTriangles(face));
  }
  if (!triangles.length) throw new Error('OFF: no faces');
  return [{ name: 'OFF', triangles }];
}

const UNIT_SCALE = { millimeter: 1, millimetre: 1, mm: 1, meter: 1000, metre: 1000, m: 1000, inch: 25.4, in: 25.4, feet: 304.8, foot: 304.8, micron: 0.001, micrometer: 0.001, centimeter: 10 };

export function parseAmf(data) {
  const root = parseXml(asText(data));
  const unit = UNIT_SCALE[(root.attrs.unit ?? 'millimeter').toLowerCase()] ?? 1;
  const objects = [];
  for (const object of findAll(root, 'object')) {
    const name = childrenNamed(object, 'metadata').find((m) => m.attrs.type === 'name')?.text.trim() || `AMF ${object.attrs.id ?? objects.length + 1}`;
    for (const mesh of childrenNamed(object, 'mesh')) {
      const vertices = findAll(child(mesh, 'vertices') ?? mesh, 'coordinates').map((c) => ['x', 'y', 'z'].map((k) => Number(child(c, k)?.text ?? 0) * unit));
      const triangles = [];
      for (const triangle of findAll(mesh, 'triangle')) triangles.push(['v1', 'v2', 'v3'].map((k) => vertices[Number(child(triangle, k)?.text)]));
      objects.push({ name, triangles: triangles.filter((tri) => tri.every(Boolean)) });
    }
  }
  if (!objects.some((o) => o.triangles.length)) throw new Error('AMF: no triangles');
  return objects.filter((o) => o.triangles.length);
}

const parseTransform = (text) => {
  const m = (text ?? '').trim().split(/\s+/).map(Number);
  if (m.length !== 12 || m.some((v) => !Number.isFinite(v))) return null;
  return (p) => [p[0] * m[0] + p[1] * m[3] + p[2] * m[6] + m[9], p[0] * m[1] + p[1] * m[4] + p[2] * m[7] + m[10], p[0] * m[2] + p[1] * m[5] + p[2] * m[8] + m[11]];
};

export function parse3mf(data) {
  const files = readZip(asBytes(data));
  const modelName = [...files.keys()].find((name) => /^\/?3D\/.*\.model$/i.test(name)) ?? [...files.keys()].find((name) => name.endsWith('.model'));
  if (!modelName) throw new Error('3MF: no 3D model in the package');
  const root = parseXml(zipText(files, modelName));
  const unit = UNIT_SCALE[(root.attrs.unit ?? 'millimeter').toLowerCase()] ?? 1;
  const byId = new Map(findAll(root, 'object').map((o) => [o.attrs.id, o]));
  const meshOf = (object, transform, depth = 0) => {
    if (depth > 16) return [];
    const mesh = child(object, 'mesh');
    if (mesh) {
      const vertices = findAll(child(mesh, 'vertices'), 'vertex').map((v) => [Number(v.attrs.x), Number(v.attrs.y), Number(v.attrs.z)]);
      return findAll(child(mesh, 'triangles'), 'triangle').map((t) => [t.attrs.v1, t.attrs.v2, t.attrs.v3].map((i) => transform(vertices[Number(i)])));
    }
    return findAll(child(object, 'components') ?? { children: [] }, 'component').flatMap((c) => {
      const inner = parseTransform(c.attrs.transform) ?? ((p) => p);
      const target = byId.get(c.attrs.objectid);
      return target ? meshOf(target, (p) => transform(inner(p)), depth + 1) : [];
    });
  };
  const scale = (p) => p.map((v) => v * unit);
  const items = findAll(child(root, 'build') ?? root, 'item');
  const objects = (items.length ? items : [...byId.values()].map((o) => ({ attrs: { objectid: o.attrs.id } }))).map((item) => {
    const object = byId.get(item.attrs.objectid);
    const transform = parseTransform(item.attrs.transform) ?? ((p) => p);
    return object ? { name: object.attrs.name || `3MF ${item.attrs.objectid}`, triangles: meshOf(object, (p) => scale(transform(p))) } : null;
  }).filter((o) => o?.triangles.length);
  if (!objects.length) throw new Error('3MF: no triangles');
  return objects;
}

// ───────────────────────── STEP (ISO 10303-21)

/** Entities of a STEP file: Map(id → { type, args }) with args parsed into nested arrays. */
export function parseStepEntities(text) {
  const data = text.slice(text.indexOf('DATA;') + 5, text.lastIndexOf('ENDSEC'));
  const map = new Map();
  const statement = /#(\d+)\s*=\s*([\s\S]*?);\s*(?=#\d+\s*=|$)/g;
  let m;
  while ((m = statement.exec(data))) {
    const body = m[2].trim();
    if (body.startsWith('(')) {
      // Complex entity: (A(..)B(..)) → { type: 'COMPLEX', parts: { A: args, B: args } }
      const parts = {};
      const inner = body.slice(1, -1);
      const re = /([A-Z0-9_]+)\s*\(/g;
      let depth = 0;
      let start = -1;
      let name = '';
      for (let i = 0; i < inner.length; i++) {
        if (depth === 0) {
          re.lastIndex = i;
          const n = re.exec(inner);
          if (n && n.index === i) { name = n[1]; start = i + n[0].length; i = start - 1; depth = 1; continue; }
        } else if (inner[i] === '(') depth++;
        else if (inner[i] === ')') { depth--; if (depth === 0) parts[name] = parseStepArgs(inner.slice(start, i)); } else if (inner[i] === "'") { i = inner.indexOf("'", i + 1); while (inner[i + 1] === "'") i = inner.indexOf("'", i + 2); }
      }
      map.set(Number(m[1]), { type: 'COMPLEX', parts, args: [] });
    } else {
      const open = body.indexOf('(');
      map.set(Number(m[1]), { type: body.slice(0, open).trim(), args: parseStepArgs(body.slice(open + 1, body.lastIndexOf(')'))) });
    }
  }
  return map;
}

function parseStepArgs(text) {
  const out = [];
  const stack = [out];
  let token = '';
  const push = () => {
    const t = token.trim();
    token = '';
    if (!t) return;
    const top = stack[stack.length - 1];
    if (t[0] === '#') top.push({ ref: Number(t.slice(1)) });
    else if (t[0] === "'") top.push(t.slice(1, -1).replace(/''/g, "'"));
    else if (t[0] === '.') top.push(t);
    else if (t === '$' || t === '*') top.push(null);
    else if (/^[-+]?(\d|\.\d)/.test(t)) top.push(Number(t));
    else top.push(t);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      let j = i + 1;
      for (;;) { j = text.indexOf("'", j); if (j < 0) { j = text.length; break; } if (text[j + 1] === "'") j += 2; else break; }
      token += text.slice(i, j + 1);
      i = j;
    } else if (c === '(') {
      const name = token.trim();
      token = '';
      const list = [];
      const top = stack[stack.length - 1];
      top.push(name ? { typed: name, args: list } : list);
      stack.push(list);
    } else if (c === ')') { push(); stack.pop(); } else if (c === ',') push();
    else token += c;
  }
  push();
  return out;
}

/** Reads a STEP file: faceted B-reps exactly, and B-rep faces on planes, cylinders, cones, spheres and tori tessellated. */
export function parseStep(data) {
  const text = asText(data);
  if (!/ISO-10303-21/.test(text)) throw new Error('STEP: not an ISO 10303-21 file');
  const E = parseStepEntities(text);
  const get = (ref) => (ref && typeof ref === 'object' && 'ref' in ref ? E.get(ref.ref) : null);
  // Length unit: millimetre unless the file says otherwise.
  let unit = 1;
  for (const e of E.values()) {
    if (e.type === 'COMPLEX' && e.parts.LENGTH_UNIT && e.parts.SI_UNIT) {
      const prefix = e.parts.SI_UNIT[0];
      unit = prefix === '.MILLI.' ? 1 : prefix === '.CENTI.' ? 10 : prefix === '.MICRO.' ? 0.001 : prefix == null ? 1000 : 1;
    }
    if (e.type === 'COMPLEX' && e.parts.CONVERSION_BASED_UNIT && e.parts.LENGTH_UNIT && /INCH/i.test(e.parts.CONVERSION_BASED_UNIT[0] ?? '')) unit = 25.4;
  }
  let angleUnit = 1;
  for (const e of E.values()) {
    if (e.type === 'COMPLEX' && e.parts.PLANE_ANGLE_UNIT && e.parts.CONVERSION_BASED_UNIT && /DEG/i.test(e.parts.CONVERSION_BASED_UNIT[0] ?? '')) angleUnit = Math.PI / 180;
  }
  const point = (ref) => { const e = get(ref); return e?.args[1]?.map((v) => v * unit) ?? null; };
  const direction = (ref) => { const e = get(ref); const v = e?.args[1] ?? [0, 0, 1]; const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const axisOf = (ref) => {
    const e = get(ref);
    const origin = point(e.args[1]);
    const z = e.args[2] ? direction(e.args[2]) : [0, 0, 1];
    let x = e.args[3] ? direction(e.args[3]) : (Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
    x = x.map((v, i) => v - d * z[i]);
    const lx = Math.hypot(...x) || 1;
    x = x.map((v) => v / lx);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return { origin, x, y, z };
  };
  const warnings = new Set();
  // Points along an edge curve from one vertex to the other.
  const edgePoints = (edgeCurve, sameSense) => {
    const ec = get(edgeCurve);
    const a = point(get(ec.args[1]).args[1]);
    const b = point(get(ec.args[2]).args[1]);
    const curve = get(ec.args[3]);
    let pts = [a, b];
    if (curve?.type === 'CIRCLE' || curve?.type === 'ELLIPSE') {
      const ax = axisOf(curve.args[1]);
      const r1 = curve.args[2] * unit;
      const r2 = (curve.type === 'ELLIPSE' ? curve.args[3] : curve.args[2]) * unit;
      const local = (p) => { const d = p.map((v, i) => v - ax.origin[i]); return Math.atan2((d[0] * ax.y[0] + d[1] * ax.y[1] + d[2] * ax.y[2]) / r2, (d[0] * ax.x[0] + d[1] * ax.x[1] + d[2] * ax.x[2]) / r1); };
      let t0 = local(a);
      let t1 = local(b);
      const forward = ec.args[4] !== '.F.';
      if (!forward) [t0, t1] = [t1, t0];
      while (t1 <= t0 + 1e-9) t1 += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(((t1 - t0) / (2 * Math.PI)) * 72));
      pts = Array.from({ length: n + 1 }, (_, i) => {
        const t = t0 + ((t1 - t0) * i) / n;
        return ax.origin.map((o, k) => o + r1 * Math.cos(t) * ax.x[k] + r2 * Math.sin(t) * ax.y[k]);
      });
      if (!forward) pts.reverse();
      pts[0] = a;
      pts[pts.length - 1] = b;
    } else if (curve?.type === 'B_SPLINE_CURVE_WITH_KNOTS' || curve?.type === 'COMPLEX') {
      const controls = (curve.args[2] ?? curve.parts?.B_SPLINE_CURVE?.[1] ?? []).map(point).filter(Boolean);
      if (controls.length >= 2) pts = [a, ...controls.slice(1, -1), b];
      warnings.add('spline');
    }
    return sameSense ? pts : pts.slice().reverse();
  };
  const loopPoints = (loopRef) => {
    const loop = get(loopRef);
    if (loop.type === 'POLY_LOOP') return loop.args[1].map(point);
    if (loop.type === 'VERTEX_LOOP') return [];
    const out = [];
    for (const oeRef of loop.args[1]) {
      const oe = get(oeRef);
      const pts = edgePoints(oe.args[3], oe.args[4] !== '.F.');
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    if (out.length > 1) out.pop();
    return out;
  };
  const objects = [];
  const faceTriangles = (faceRef) => {
    const face = get(faceRef);
    const bounds = face.args[1].map(get);
    const surface = face.type === 'ADVANCED_FACE' ? get(face.args[2]) : null;
    const sameSense = face.type !== 'ADVANCED_FACE' || face.args[3] !== '.F.';
    const loops = bounds.map((bound) => {
      const pts = loopPoints(bound.args[1]);
      return bound.args[2] === '.F.' ? pts.slice().reverse() : pts;
    }).filter((loop) => loop.length >= 2);
    if (!surface || surface.type === 'PLANE') {
      // Planar: project onto the plane, outer loop + holes.
      const ax = surface ? axisOf(surface.args[1]) : null;
      const pts = loops.flat();
      let normal = ax?.z;
      if (!normal) {
        const n = [0, 0, 0];
        const outer = loops[0];
        for (let i = 0; i < outer.length; i++) { const a = outer[i]; const b = outer[(i + 1) % outer.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
        const l = Math.hypot(...n) || 1;
        normal = n.map((v) => v / l);
      }
      if (!sameSense) normal = normal.map((v) => -v);
      const u = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const d = u[0] * normal[0] + u[1] * normal[1] + u[2] * normal[2];
      const ux = u.map((v, i) => v - d * normal[i]);
      const ul = Math.hypot(...ux);
      const U = ux.map((v) => v / ul);
      const V = [normal[1] * U[2] - normal[2] * U[1], normal[2] * U[0] - normal[0] * U[2], normal[0] * U[1] - normal[1] * U[0]];
      const to2 = (p, index) => ({ x: p[0] * U[0] + p[1] * U[1] + p[2] * U[2], y: p[0] * V[0] + p[1] * V[1] + p[2] * V[2], p, index });
      const rings = loops.map((loop) => loop.map(to2)).filter((ring) => ring.length >= 3);
      if (!rings.length || !pts.length) return [];
      rings.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
      const [outer, ...holes] = rings;
      return triangulate(outer, holes).map((tri) => tri.map((q) => q.p));
    }
    // Curved analytic surfaces: map the boundary into (angle, height) parameters, triangulate there, map back.
    const ax = axisOf(surface.args[1]);
    const local = (p) => { const d = p.map((v, i) => v - ax.origin[i]); return [d[0] * ax.x[0] + d[1] * ax.x[1] + d[2] * ax.x[2], d[0] * ax.y[0] + d[1] * ax.y[1] + d[2] * ax.y[2], d[0] * ax.z[0] + d[1] * ax.z[1] + d[2] * ax.z[2]]; };
    const world = ([x, y, z]) => ax.origin.map((o, k) => o + x * ax.x[k] + y * ax.y[k] + z * ax.z[k]);
    let toParam;
    let fromParam;
    if (surface.type === 'CYLINDRICAL_SURFACE') {
      const r = surface.args[2] * unit;
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), z]; };
      fromParam = ([t, z]) => world([r * Math.cos(t), r * Math.sin(t), z]);
    } else if (surface.type === 'CONICAL_SURFACE') {
      const r = surface.args[2] * unit;
      const tan = Math.tan(surface.args[3] * angleUnit);
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), z]; };
      fromParam = ([t, z]) => world([(r + z * tan) * Math.cos(t), (r + z * tan) * Math.sin(t), z]);
    } else if (surface.type === 'SPHERICAL_SURFACE') {
      const r = surface.args[2] * unit;
      toParam = (p) => { const [x, y, z] = local(p); return [Math.atan2(y, x), Math.asin(Math.max(-1, Math.min(1, z / r)))]; };
      fromParam = ([t, v]) => world([r * Math.cos(v) * Math.cos(t), r * Math.cos(v) * Math.sin(t), r * Math.sin(v)]);
    } else if (surface.type === 'TOROIDAL_SURFACE') {
      const R = surface.args[2] * unit;
      const r = surface.args[3] * unit;
      toParam = (p) => { const [x, y, z] = local(p); const t = Math.atan2(y, x); return [t, Math.atan2(z, Math.hypot(x, y) - R)]; };
      fromParam = ([t, v]) => world([(R + r * Math.cos(v)) * Math.cos(t), (R + r * Math.cos(v)) * Math.sin(t), r * Math.sin(v)]);
    } else {
      warnings.add(surface.type);
      return [];
    }
    return curvedFace(loops, toParam, fromParam, sameSense, surface.type.replace('_SURFACE', '').replace('SPHERICAL', 'sphere').replace('TOROIDAL', 'torus').toLowerCase());
  };
  const shells = [];
  for (const [, e] of E) {
    if (e.type === 'MANIFOLD_SOLID_BREP' || e.type === 'FACETED_BREP' || e.type === 'BREP_WITH_VOIDS') shells.push({ name: e.args[0] || 'STEP', shell: e.args[1] });
  }
  if (!shells.length) for (const [id, e] of E) if (e.type === 'CLOSED_SHELL' || e.type === 'OPEN_SHELL') shells.push({ name: `Shell ${id}`, shell: { ref: id } });
  for (const { name, shell } of shells) {
    const triangles = [];
    for (const faceRef of get(shell)?.args[1] ?? []) {
      try { triangles.push(...faceTriangles(faceRef)); } catch (error) { warnings.add('face'); if (globalThis.process?.env?.MYCAD_STEP_DEBUG) console.error('face', faceRef.ref, error.stack); }
    }
    if (triangles.length) objects.push({ name, triangles });
  }
  if (!objects.length) throw new Error('STEP: no solids found');
  objects.warnings = [...warnings];
  return objects;
}

/**
 * Tessellates a face on a revolved analytic surface (cylinder, cone, sphere,
 * torus). The boundary loops are mapped to parameters (angle t, v); the
 * region is cut into small cells (5° of angle; 5° of v on spheres and tori),
 * each cell's piece of the region is triangulated and mapped back. A loop that
 * runs once round the axis (a whole circle edge) bounds a band.
 */
function curvedFace(loops, toParam, fromParam, sameSense, kind) {
  const TAU = 2 * Math.PI;
  const STEP = TAU / 72;
  const angular = kind === 'sphere' || kind === 'torus';
  const unwrap = (pts) => {
    const out = [];
    let prev = null;
    for (const p of pts) {
      let [t, v] = toParam(p);
      if (prev) { while (t - prev[0] > Math.PI) t -= TAU; while (t - prev[0] < -Math.PI) t += TAU; }
      out.push([t, v]);
      prev = [t, v];
    }
    return out;
  };
  const turnsOf = (ring) => {
    let delta = 0;
    for (let i = 1; i < ring.length; i++) delta += ring[i][0] - ring[i - 1][0];
    let close = ring[0][0] - ring[ring.length - 1][0];
    while (close > Math.PI) close -= TAU;
    while (close < -Math.PI) close += TAU;
    return Math.round((delta + close) / TAU);
  };
  const area = (ring) => polygonArea(ring.map(([x, y]) => ({ x, y })));
  const rings = loops.map(unwrap).filter((ring) => ring.length >= 2);
  const sign = sameSense ? 1 : -1;
  let outer;
  let holes = [];
  const wrapping = rings.filter((ring) => turnsOf(ring) !== 0);
  if (!rings.length) {
    // Only vertex loops: a whole sphere (or torus).
    if (kind !== 'sphere' && kind !== 'torus') return [];
    const v = kind === 'sphere' ? Math.PI / 2 : Math.PI;
    outer = [[-Math.PI, -v], [Math.PI, -v], [Math.PI, v], [-Math.PI, v]];
  } else if (wrapping.length) {
    // A band between full circles; a single circle on a sphere bounds a cap that runs to a pole.
    const vs = wrapping.map((ring) => ring.reduce((s, q) => s + q[1], 0) / ring.length).sort((a, b) => a - b);
    let v0 = vs[0];
    let v1 = vs[vs.length - 1];
    if (wrapping.length === 1) {
      if (kind !== 'sphere') return [];
      // The region lies left of a +t loop (towards +v), seen from the face's side.
      const up = turnsOf(wrapping[0]) * sign > 0;
      [v0, v1] = up ? [v0, Math.PI / 2] : [-Math.PI / 2, v0];
    }
    const t0 = wrapping[0][0][0];
    outer = [[t0, v0], [t0 + TAU, v0], [t0 + TAU, v1], [t0, v1]];
  } else {
    const sorted = rings.slice().sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    [outer, ...holes] = sorted;
    if (!outer) return [];
    const vRange = outer.map((q) => q[1]);
    if (Math.abs(area(outer)) < 1e-9) {
      // Seam-only boundary (a whole sphere or torus): the full parameter range.
      const t0 = Math.min(...outer.map((q) => q[0]));
      const [vMin, vMax] = kind === 'torus' ? [-Math.PI, Math.PI] : [Math.min(...vRange), Math.max(...vRange)];
      outer = [[t0, vMin], [t0 + TAU, vMin], [t0 + TAU, vMax], [t0, vMax]];
      holes = [];
    }
    // Holes drawn on the far side of the seam move by whole turns into the outer loop's range.
    const tMin = Math.min(...outer.map((q) => q[0]));
    const tMax = Math.max(...outer.map((q) => q[0]));
    holes = holes.filter((hole) => hole.length >= 3).map((hole) => {
      const c = hole.reduce((s, q) => s + q[0], 0) / hole.length;
      const shift = c < tMin ? Math.ceil((tMin - c) / TAU) * TAU : c > tMax ? -Math.ceil((c - tMax) / TAU) * TAU : 0;
      return hole.map(([t, v]) => [t + shift, v]);
    });
  }
  const tMin = Math.min(...outer.map((q) => q[0]));
  const tMax = Math.max(...outer.map((q) => q[0]));
  const vMin = Math.min(...outer.map((q) => q[1]));
  const vMax = Math.max(...outer.map((q) => q[1]));
  const vStep = angular ? STEP : Math.max(vMax - vMin, 1e-9);
  const clip = (ring, axis, limit, keepBelow) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ina = keepBelow ? a[axis] <= limit : a[axis] >= limit;
      const inb = keepBelow ? b[axis] <= limit : b[axis] >= limit;
      if (ina) out.push(a);
      if (ina !== inb) {
        const k = (limit - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      }
    }
    return out;
  };
  const clipCell = (ring, t0, t1, v0, v1) => clip(clip(clip(clip(ring, 0, t0, false), 0, t1, true), 1, v0, false), 1, v1, true);
  const inside = (p, ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const params = [];
  const emit = (piece, cellHoles, depth, box) => {
    const flat = piece.map(([x, y]) => ({ x, y }));
    if (flat.length < 3 || Math.abs(polygonArea(flat)) < 1e-14) return;
    const whole = cellHoles.filter((h) => h.whole);
    const cut = cellHoles.filter((h) => !h.whole);
    if (cut.length && depth < 3) {
      // A hole crosses this cell's edge: split the cell and keep only pieces outside the holes.
      const [t0, t1, v0, v1] = box;
      const tm = (t0 + t1) / 2;
      const vm = (v0 + v1) / 2;
      for (const [a0, a1, b0, b1] of [[t0, tm, v0, vm], [tm, t1, v0, vm], [t0, tm, vm, v1], [tm, t1, vm, v1]]) {
        const sub = clipCell(piece, a0, a1, b0, b1);
        const subHoles = cellHoles.map((h) => {
          const c = clipCell(h.ring, a0, a1, b0, b1);
          return { ring: c, whole: c.length === h.ring.length && c.every((q, i) => q === h.ring[i]) };
        }).filter((h) => h.ring.length >= 3);
        emit(sub, subHoles, depth + 1, [a0, a1, b0, b1]);
      }
      return;
    }
    for (const tri of triangulate(flat, whole.map((h) => h.ring.map(([x, y]) => ({ x, y }))))) {
      const c = [(tri[0].x + tri[1].x + tri[2].x) / 3, (tri[0].y + tri[1].y + tri[2].y) / 3];
      if (cut.some((h) => inside(c, h.ring))) continue;
      params.push(tri.map((q) => [q.x, q.y]));
    }
  };
  for (let t0 = tMin; t0 < tMax - 1e-12; t0 += STEP) {
    const t1 = Math.min(tMax, t0 + STEP);
    for (let v0 = vMin; v0 < vMax - 1e-12; v0 += vStep) {
      const v1 = Math.min(vMax, v0 + vStep);
      const piece = clipCell(outer, t0, t1, v0, v1);
      if (piece.length < 3) continue;
      const cellHoles = holes.map((hole) => {
        const c = clipCell(hole, t0, t1, v0, v1);
        return { ring: c, whole: c.length === hole.length && c.every((q, i) => q === hole[i]) };
      }).filter((h) => h.ring.length >= 3);
      emit(piece, cellHoles, 0, [t0, t1, v0, v1]);
    }
  }
  // (t, v) counter-clockwise faces away from the axis; reversed faces flip.
  const out = [];
  for (const tri of params) {
    const pts = tri.map(fromParam);
    out.push(sameSense ? pts : [pts[0], pts[2], pts[1]]);
  }
  return out;
}

// ───────────────────────── FreeCAD document reader

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Reads a FreeCAD .FCStd: parametric primitives, extrusions/revolutions of sketches, booleans, meshes, and sketches as 2D. */
export function parseFcstd(data) {
  const files = readZip(asBytes(data));
  const xml = zipText(files, 'Document.xml');
  if (!xml) throw new Error('FCStd: no Document.xml');
  const doc = parseXml(xml);
  const types = new Map(findAll(child(doc, 'Objects'), 'Object').map((o) => [o.attrs.name, o.attrs.type]));
  const props = new Map();
  for (const o of childrenNamed(child(doc, 'ObjectData'), 'Object')) {
    const map = {};
    for (const p of findAll(o, 'Property')) map[p.attrs.name] = p;
    props.set(o.attrs.name, map);
  }
  const value = (name, key, d = 0) => {
    const p = props.get(name)?.[key];
    const node = p?.children[0];
    if (!node) return d;
    if ('value' in node.attrs) return node.name === 'Bool' ? node.attrs.value === 'true' : node.name === 'Float' || node.name === 'Integer' ? num(node.attrs.value, d) : node.attrs.value;
    return d;
  };
  const vector = (name, key, d) => { const node = props.get(name)?.[key]?.children[0]; return node ? [num(node.attrs.valueX), num(node.attrs.valueY), num(node.attrs.valueZ)] : d; };
  const placementOf = (name) => {
    const node = props.get(name)?.Placement?.children[0];
    if (!node) return { position: [0, 0, 0], matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    return { position: [num(node.attrs.Px), num(node.attrs.Py), num(node.attrs.Pz)], matrix: matrixOfQuaternion([num(node.attrs.Q0), num(node.attrs.Q1), num(node.attrs.Q2), num(node.attrs.Q3, 1)]) };
  };
  const links = (name, key) => {
    const p = props.get(name)?.[key];
    if (!p) return [];
    return findAll(p, 'Link').map((l) => l.attrs.value).concat(findAll(p, 'LinkSub').map((l) => l.attrs.value)).filter(Boolean);
  };
  const consumed = new Set();
  for (const name of types.keys()) for (const key of ['Base', 'Tool', 'Shapes', 'Source', 'Sections', 'Spine', 'Profile']) for (const l of links(name, key)) consumed.add(l);
  const warnings = new Set();
  const sketchGeometry = (name) => {
    const list = findAll(props.get(name)?.Geometry ?? { children: [] }, 'Geometry');
    const items = [];
    for (const g of list) {
      if (findAll(g, 'Construction')[0]?.attrs.value === '1') continue;
      const line = findAll(g, 'LineSegment')[0];
      const circle = findAll(g, 'Circle')[0];
      const arc = findAll(g, 'ArcOfCircle')[0];
      if (line) items.push({ type: 'line', x1: num(line.attrs.StartX), y1: num(line.attrs.StartY), x2: num(line.attrs.EndX), y2: num(line.attrs.EndY) });
      else if (circle) items.push({ type: 'circle', cx: num(circle.attrs.CenterX), cy: num(circle.attrs.CenterY), r: num(circle.attrs.Radius, 1) });
      else if (arc) {
        const turn = num(arc.attrs.AngleXU);
        const flip = num(arc.attrs.NormalZ, 1) < 0;
        let start = ((num(arc.attrs.StartAngle) + turn) * 180) / Math.PI;
        let end = ((num(arc.attrs.EndAngle) + turn) * 180) / Math.PI;
        if (flip) [start, end] = [-end, -start];
        items.push({ type: 'arc', cx: num(arc.attrs.CenterX), cy: num(arc.attrs.CenterY), r: num(arc.attrs.Radius, 1), start, end });
      } else warnings.add(g.attrs.type);
    }
    return items;
  };
  // Closed loops of a sketch (2D points) from its geometry.
  const sketchLoops = (name) => {
    const prims = sketchGeometry(name).flatMap((item) => (item.type === 'line' ? [{ kind: 'line', a: { x: item.x1, y: item.y1 }, b: { x: item.x2, y: item.y2 } }]
      : item.type === 'circle' ? [{ kind: 'circle', c: { x: item.cx, y: item.cy }, r: item.r }] : [{ kind: 'arc', c: { x: item.cx, y: item.cy }, r: item.r, start: item.start, end: item.end }]));
    const loops = [];
    const chains = [];
    for (const prim of prims) {
      if (prim.kind === 'circle') loops.push(arcPoints(prim.c.x, prim.c.y, prim.r, 0, 360, 5).slice(0, -1));
      else if (prim.kind === 'line') chains.push([prim.a, prim.b]);
      else chains.push(arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 5));
    }
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-4;
    while (chains.length) {
      let chain = chains.shift();
      let grown = true;
      while (grown && !near(chain[0], chain[chain.length - 1])) {
        grown = false;
        for (let i = 0; i < chains.length; i++) {
          const o = chains[i];
          const end = chain[chain.length - 1];
          if (near(end, o[0])) chain = [...chain, ...o.slice(1)];
          else if (near(end, o[o.length - 1])) chain = [...chain, ...o.slice().reverse().slice(1)];
          else continue;
          chains.splice(i, 1);
          grown = true;
          break;
        }
      }
      if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) loops.push(chain.slice(0, -1));
    }
    return loops;
  };
  const nestLoops = (loops) => {
    const items = loops.map((points) => ({ points, area: Math.abs(polygonArea(points)) })).sort((a, b) => b.area - a.area);
    const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]; const b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    for (let i = 0; i < items.length; i++) {
      for (let j = i - 1; j >= 0; j--) if (inside(items[i].points[0], items[j].points)) { items[i].parent = items[j]; break; }
      items[i].depth = items[i].parent ? items[i].parent.depth + 1 : 0;
    }
    return items.filter((it) => it.depth % 2 === 0).map((it) => ({ outer: it.points, holes: items.filter((h) => h.parent === it).map((h) => h.points) }));
  };
  const placed = ({ position, matrix }) => ({ x: position[0], y: position[1], z: position[2], ...anglesOf(matrix) });
  // A point list kept in a side file: uint32 count, then x, y, z as float64.
  const vectorList = (name, key) => {
    const node = findAll(props.get(name)?.[key] ?? { children: [] }, 'VectorList')[0];
    if (!node) return [];
    if (node.attrs.file && files.has(node.attrs.file)) {
      const bytes = files.get(node.attrs.file);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const count = view.getUint32(0, true);
      return Array.from({ length: count }, (_, i) => [0, 1, 2].map((k) => view.getFloat64(4 + i * 24 + k * 8, true)));
    }
    return findAll(node, 'Vector').map((v) => [num(v.attrs.x), num(v.attrs.y), num(v.attrs.z)]);
  };
  const entities = [];
  const cache = new Map();
  // Solid entity data (raw) for an object, or null.
  const solidOf = (name, depth = 0) => {
    if (cache.has(name)) return cache.get(name);
    if (depth > 32) return null;
    const type = types.get(name);
    const label = value(name, 'Label', name);
    const at = placed(placementOf(name));
    let out = null;
    const solid = (kind, params, extra = {}) => ({ type: 'solid', kind, name: label, params, ...at, ...extra });
    switch (type) {
      case 'Part::Box': out = solid('box', { length: value(name, 'Length', 10), width: value(name, 'Width', 10), height: value(name, 'Height', 10) }); break;
      case 'Part::Cylinder': out = solid('cylinder', { radius: value(name, 'Radius', 2), height: value(name, 'Height', 10), angle: value(name, 'Angle', 360) }); break;
      case 'Part::Sphere': out = solid('sphere', { radius: value(name, 'Radius', 5) }); break;
      case 'Part::Cone': out = solid('cone', { radius1: value(name, 'Radius1', 2), radius2: value(name, 'Radius2', 4), height: value(name, 'Height', 10) }); break;
      case 'Part::Torus': out = solid('torus', { radius1: value(name, 'Radius1', 10), radius2: value(name, 'Radius2', 2) }); break;
      case 'Part::Ellipsoid': out = solid('ellipsoid', { radius1: value(name, 'Radius1', 2), radius2: value(name, 'Radius2', 4), radius3: value(name, 'Radius3', 0) || value(name, 'Radius2', 4) }); break;
      case 'Part::Prism': out = solid('prism', { sides: value(name, 'Polygon', 6), radius: value(name, 'Circumradius', 2), height: value(name, 'Height', 10) }); break;
      case 'Part::Wedge': {
        const v = (k, d) => value(name, k, d);
        const [x0, y0, z0, x20, z20, x1, y1, z1, x21, z21] = [v('Xmin', 0), v('Ymin', 0), v('Zmin', 0), v('X2min', 2), v('Z2min', 2), v('Xmax', 10), v('Ymax', 10), v('Zmax', 10), v('X2max', 8), v('Z2max', 8)];
        // General wedge: a hexahedron, bottom at y0 and top at y1 (FreeCAD's own axes).
        const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x20, y1, z20], [x21, y1, z20], [x21, y1, z21], [x20, y1, z21]];
        const quads = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
        const tris = quads.flatMap(([a, b, cc, d]) => [[c[a], c[b], c[cc]], [c[a], c[cc], c[d]]]).filter(([a, b, cc]) => !(same3(a, b) || same3(b, cc) || same3(a, cc)));
        const map = placementMap(placementOf(name));
        out = { type: 'solid', kind: 'mesh', name: label, params: {}, shape: { tris: flattenTriangles(orient(tris).map((tri) => tri.map(map))) } };
        break;
      }
      case 'Part::Extrusion': {
        const base = links(name, 'Base')[0];
        if (types.get(base) !== 'Sketcher::SketchObject') { warnings.add(`${type} of ${types.get(base)}`); break; }
        const shapes = nestLoops(sketchLoops(base));
        const sp = placementOf(base);
        const dir = vector(name, 'Dir', [0, 0, 1]);
        const normal = apply(sp.matrix, [0, 0, 1]);
        const along = Math.sign(dir[0] * normal[0] + dir[1] * normal[1] + dir[2] * normal[2]) || 1;
        const forward = value(name, 'LengthFwd', 10);
        const reverse = value(name, 'LengthRev', 0);
        const symmetric = value(name, 'Symmetric', false);
        const height = symmetric ? forward : forward + reverse;
        const start = symmetric ? -forward / 2 : -reverse;
        const lift = apply(sp.matrix, [0, 0, start * along]);
        const position = sp.position.map((v, i) => v + lift[i]);
        const matrix = along < 0 ? matMul(sp.matrix, rotX(180)) : sp.matrix;
        out = { type: 'solid', kind: 'pad', name: label, params: { height }, shape: { shapes: along < 0 ? shapes.map((s) => ({ outer: s.outer.map((q) => ({ x: q.x, y: -q.y })), holes: s.holes.map((h) => h.map((q) => ({ x: q.x, y: -q.y }))) })) : shapes }, ...placed({ position, matrix }) };
        break;
      }
      case 'Part::Revolution': {
        const source = links(name, 'Source')[0];
        if (types.get(source) !== 'Sketcher::SketchObject') { warnings.add(`${type} of ${types.get(source)}`); break; }
        const sp = placementOf(source);
        const axisDir = vector(name, 'Axis', [0, 0, 1]);
        const basePoint = vector(name, 'Base', [0, 0, 0]);
        const loops = sketchLoops(source);
        if (!loops.length) break;
        // Profile in (r, z) about the revolution axis.
        const l = Math.hypot(...axisDir) || 1;
        const z = axisDir.map((v) => v / l);
        const toWorld = (q) => apply(sp.matrix, [q.x, q.y, 0]).map((v, i) => v + sp.position[i]);
        const first = toWorld(loops[0][0]).map((v, i) => v - basePoint[i]);
        const along0 = first[0] * z[0] + first[1] * z[1] + first[2] * z[2];
        let x = first.map((v, i) => v - along0 * z[i]);
        const lx = Math.hypot(...x) || 1;
        x = x.map((v) => v / lx);
        const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
        const profile = loops[0].map((q) => {
          const d = toWorld(q).map((v, i) => v - basePoint[i]);
          const h = d[0] * z[0] + d[1] * z[1] + d[2] * z[2];
          const r = Math.hypot(d[0] - h * z[0], d[1] - h * z[1], d[2] - h * z[2]);
          return [r, h];
        });
        const matrix = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
        out = { type: 'solid', kind: 'revolution', name: label, params: { angle: value(name, 'Angle', 360) }, shape: { profile }, ...placed({ position: basePoint, matrix }) };
        break;
      }
      case 'Part::Cut': case 'Part::Fuse': case 'Part::Common': case 'Part::MultiFuse': case 'Part::MultiCommon': {
        // Kept as a boolean tree, like FreeCAD's.
        const children = [...links(name, 'Base'), ...links(name, 'Tool'), ...links(name, 'Shapes')].map((part) => solidOf(part, depth + 1));
        if (children.some((child) => !child) || children.length < 2) { warnings.add(`${type} (${children.filter((child) => !child).length})`); break; }
        out = { type: 'solid', kind: 'boolean', name: label, params: {}, shape: { op: type.includes('Cut') ? 'cut' : type.includes('Common') ? 'common' : 'union', parts: children.map(normalizeSolidData) } };
        break;
      }
      case 'Part::Mirroring': {
        const source = solidOf(links(name, 'Source')[0], depth + 1);
        if (!source) break;
        const base = vector(name, 'Base', [0, 0, 0]);
        const n0 = vector(name, 'Normal', [1, 0, 0]);
        const l = Math.hypot(...n0) || 1;
        const n = n0.map((v) => v / l);
        const mirror = (p) => { const d = (p[0] - base[0]) * n[0] + (p[1] - base[1]) * n[1] + (p[2] - base[2]) * n[2]; return p.map((v, i) => v - 2 * d * n[i]); };
        out = { type: 'solid', kind: 'mesh', name: label, params: {}, shape: { tris: flattenTriangles(solidMesh(normalizeSolidData(source)).map((tri) => tri.map(mirror).reverse())) } };
        break;
      }
      case 'Part::Loft': {
        const sections = links(name, 'Sections');
        if (sections.length !== 2 || sections.some((section) => types.get(section) !== 'Sketcher::SketchObject')) { warnings.add(`${type} (${sections.length})`); break; }
        const [bottom, top] = sections.map((section) => ({ loops: sketchLoops(section), place: placementOf(section) }));
        if (!bottom.loops.length || !top.loops.length) break;
        const normal = apply(bottom.place.matrix, [0, 0, 1]);
        const height = top.place.position.reduce((sum, v, i) => sum + (v - bottom.place.position[i]) * normal[i], 0);
        // The top outline in the bottom sketch's frame (both sketches parallel).
        const inverse = (m) => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
        const toBottom = (q) => {
          const world = apply(top.place.matrix, [q.x, q.y, 0]).map((v, i) => v + top.place.position[i] - bottom.place.position[i]);
          const local = apply(inverse(bottom.place.matrix), world);
          return { x: local[0], y: local[1] };
        };
        out = { type: 'solid', kind: 'loft', name: label, params: { height }, shape: { bottom: bottom.loops[0], top: top.loops[0].map(toBottom) }, ...placed(bottom.place) };
        break;
      }
      case 'Part::Sweep': {
        const spine = links(name, 'Spine')[0];
        const section = links(name, 'Sections')[0];
        const radius = types.get(section) === 'Part::Circle' ? value(section, 'Radius', 1) : null;
        if (radius === null) { warnings.add(`${type} (${types.get(section)})`); break; }
        if (types.get(spine) === 'Part::Helix') {
          const pitch = value(spine, 'Pitch', 5);
          out = {
            type: 'solid', kind: 'helix', name: label, params: { radius: value(spine, 'Radius', 10), pitch, turns: value(spine, 'Height', 20) / pitch, wire: radius },
            ...placed(placementOf(spine)), flip: value(spine, 'LocalCoord', 0) === 1,
          };
        } else if (types.get(spine) === 'Part::Polygon') {
          const map = placementMap(placementOf(spine));
          out = { type: 'solid', kind: 'sweep', name: label, params: { radius }, shape: { path: vectorList(spine, 'Nodes').map(map) } };
        } else warnings.add(`${type} (${types.get(spine)})`);
        break;
      }
      case 'Mesh::Feature': {
        const file = findAll(props.get(name)?.Mesh ?? { children: [] }, 'Mesh')[0]?.attrs.file;
        if (!file || !files.has(file)) break;
        const map = placementMap(placementOf(name));
        out = { type: 'solid', kind: 'mesh', name: label, params: {}, shape: { tris: flattenTriangles(parseBms(files.get(file)).map((tri) => tri.map(map))) } };
        break;
      }
      default:
        if (type && !['Sketcher::SketchObject', 'App::Origin', 'App::Line', 'App::Plane', 'App::Part', 'App::DocumentObjectGroup', 'Part::Circle', 'Part::Helix', 'Part::Polygon'].includes(type)) warnings.add(type);
    }
    cache.set(name, out);
    return out;
  };
  for (const [name, type] of types) {
    if (consumed.has(name)) continue;
    if (type === 'Sketcher::SketchObject') {
      // A free sketch: its geometry in the drawing (moved by the sketch placement in x–y).
      const { position, matrix } = placementOf(name);
      const map = (x, y) => { const p = apply(matrix, [x, y, 0]); return { x: p[0] + position[0], y: p[1] + position[1] }; };
      const turn = (Math.atan2(matrix[1][0], matrix[0][0]) * 180) / Math.PI;
      for (const item of sketchGeometry(name)) {
        if (item.type === 'line') { const a = map(item.x1, item.y1); const b = map(item.x2, item.y2); entities.push({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
        else if (item.type === 'circle') { const c = map(item.cx, item.cy); entities.push({ type: 'circle', cx: c.x, cy: c.y, r: item.r }); }
        else { const c = map(item.cx, item.cy); entities.push({ type: 'arc', cx: c.x, cy: c.y, r: item.r, start: item.start + turn, end: item.end + turn }); }
      }
      continue;
    }
    const solid = solidOf(name);
    if (solid) entities.push(solid);
  }
  if (!entities.length) throw new Error('FCStd: nothing MyCAD can read in this document');
  return { entities, warnings: [...warnings] };
}

const same3 = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12;
const placementMap = ({ position, matrix }) => (p) => apply(matrix, p).map((v, i) => v + position[i]);
/** Turns a closed mesh outward if its volume is negative. */
function orient(tris) {
  let v = 0;
  for (const [a, b, c] of tris) v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  return v < 0 ? tris.map(([a, b, c]) => [a, c, b]) : tris;
}

/** Kept for callers of earlier versions: booleans are computed by the solids module itself now. */
export function setBooleanImplementation() {}

// ───────────────────────── dispatch

/** Bytes of a 3D export. */
export function exportMesh(format, drawing, entities, { title = drawing.title || 'MyCAD', binary = true, author = drawing.author ?? '' } = {}) {
  const objects = objectsOf(entities);
  switch (format) {
    case 'obj': return encoder.encode(toObj(objects, title));
    case 'ply': return encoder.encode(toPly(objects, title));
    case 'off': return encoder.encode(toOff(objects));
    case 'amf': return encoder.encode(toAmf(objects, title));
    case '3mf': return to3mf(objects, title);
    case 'step': return encoder.encode(toStep(objects, { title, author }));
    case 'fcstd': return toFcstd(drawing, { title, entities });
    default: throw new Error(`unknown format ${format}${binary ? '' : ''}`);
  }
}

/**
 * Reads a 3D file. Returns { entities (raw, for normalizeEntity), warnings }.
 * Meshes become "mesh" solids; FreeCAD documents keep their parametric solids.
 */
export function importMesh(format, data) {
  const fmt = format.toLowerCase().replace(/^\./, '');
  if (fmt === 'fcstd') return parseFcstd(data);
  const parse = { stl: parseStl, obj: parseObj, ply: parsePly, off: parseOff, amf: parseAmf, '3mf': parse3mf, step: parseStep, stp: parseStep }[fmt];
  if (!parse) throw new Error(`unknown format ${format}`);
  if (fmt === '3mf' && !isZip(asBytes(data))) throw new Error('3MF: not a zip package');
  const objects = parse(data);
  return {
    entities: objects.map((o) => ({ type: 'solid', kind: 'mesh', name: o.name, params: {}, shape: { tris: flattenTriangles(orient(o.triangles)) } })),
    warnings: objects.warnings ?? [],
  };
}

export { exactVolume, hasShape, helixPath, planarFaces };
