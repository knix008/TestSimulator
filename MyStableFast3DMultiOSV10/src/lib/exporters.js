// Writers for the 3D formats three.js has no exporter for: 3MF, AMF,
// COLLADA, VRML, VTK and the PCD / XYZ point clouds. Each takes the model as
// it shows (world transforms applied, one entry per mesh) and keeps what the
// format can carry: positions and triangles always, the material's base
// colour and per-vertex colours where the format has them. Textures are not
// written (the formats either have none or keep them as separate files).
import * as THREE from 'three';
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';

// Every visible mesh (and point cloud) under `root`, flattened to world space.
// Colours are sRGB 0..1, as files store them.
export function collectMeshes(root) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  root.traverse((o) => {
    if (!(o.isMesh || o.isPoints) || !o.visible) return;
    const g = o.geometry;
    const pos = g?.getAttribute('position');
    if (!pos || !pos.count) return;
    const positions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const col = g.getAttribute('color');
    let colors = null;
    if (col) {
      colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getRGB(c, THREE.SRGBColorSpace);
        colors.set([c.r, c.g, c.b], i * 3);
      }
    }
    let faces = null;
    if (o.isMesh) {
      const count = g.index ? g.index.count : pos.count;
      faces = new Uint32Array(count - (count % 3));
      for (let i = 0; i < faces.length; i++) faces[i] = g.index ? g.index.getX(i) : i;
      // A mirrored transform turns the triangles inside out: wind them back.
      if (o.matrixWorld.determinant() < 0) {
        for (let i = 0; i < faces.length; i += 3) [faces[i + 1], faces[i + 2]] = [faces[i + 2], faces[i + 1]];
      }
    }
    const mat = [].concat(o.material || [])[0];
    const base = mat?.color ? mat.color.getRGB(new THREE.Color(), THREE.SRGBColorSpace) : new THREE.Color(1, 1, 1);
    out.push({
      name: o.name || `mesh${out.length + 1}`,
      positions,
      colors,
      faces,
      color: [base.r, base.g, base.b],
      points: !!o.isPoints,
    });
  });
  return out;
}

const num = (x) => {
  const s = Number(x.toPrecision(7)).toString();
  return s === '-0' ? '0' : s;
};
const hex = (rgb) => `#${rgb.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const byte = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255);
const esc = (s) => String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
const solid = (meshes) => meshes.filter((m) => m.faces && m.faces.length);
const vertexColor = (m, i) => (m.colors ? [m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]] : m.color);

// The unit names the formats know, from the viewer's unit setting.
const UNIT_3MF = { m: 'meter', cm: 'centimeter', mm: 'millimeter', in: 'inch' };
const UNIT_METERS = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254 };

// 3D Manufacturing Format: a zip with the model as XML. Base colours are a
// basematerials group; per-vertex colours a colorgroup (materials extension).
export function write3MF(meshes, { units = 'm' } = {}) {
  const list = solid(meshes);
  if (!list.length) throw new Error('3MF needs a mesh with triangles');
  const parts = [];
  parts.push('<basematerials id="1">');
  list.forEach((m, k) => parts.push(`<base name="${esc(m.name)}" displaycolor="${hex(m.color)}"/>`));
  parts.push('</basematerials>');
  let id = 2;
  const objects = [];
  list.forEach((m, k) => {
    let group = 0;
    if (m.colors) {
      group = id++;
      parts.push(`<m:colorgroup id="${group}">`);
      for (let i = 0; i < m.positions.length / 3; i++) parts.push(`<m:color color="${hex(vertexColor(m, i))}"/>`);
      parts.push('</m:colorgroup>');
    }
    const oid = id++;
    objects.push(oid);
    parts.push(`<object id="${oid}" name="${esc(m.name)}" type="model" pid="1" pindex="${k}"><mesh><vertices>`);
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) parts.push(`<vertex x="${num(p[i])}" y="${num(p[i + 1])}" z="${num(p[i + 2])}"/>`);
    parts.push('</vertices><triangles>');
    const f = m.faces;
    for (let i = 0; i < f.length; i += 3) {
      parts.push(group
        ? `<triangle v1="${f[i]}" v2="${f[i + 1]}" v3="${f[i + 2]}" pid="${group}" p1="${f[i]}" p2="${f[i + 1]}" p3="${f[i + 2]}"/>`
        : `<triangle v1="${f[i]}" v2="${f[i + 1]}" v3="${f[i + 2]}"/>`);
    }
    parts.push('</triangles></mesh></object>');
  });
  const model = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<model unit="${UNIT_3MF[units] || 'meter'}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n`
    + '<metadata name="Application">MyStableFast3D</metadata>\n'
    + `<resources>${parts.join('')}</resources>\n`
    + `<build>${objects.map((o) => `<item objectid="${o}"/>`).join('')}</build>\n</model>\n`;
  const types = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return zipSync({
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 6 });
}

// Additive Manufacturing File: plain XML, one object per mesh, its colour a
// material. AMF has no centimetre: those models are written in millimetres.
export function writeAMF(meshes, { units = 'm' } = {}) {
  const list = solid(meshes);
  if (!list.length) throw new Error('AMF needs a mesh with triangles');
  const unit = units === 'cm' ? 'millimeter' : (UNIT_3MF[units] || 'meter');
  const scale = units === 'cm' ? 10 : 1;
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', `<amf unit="${unit}" version="1.1">`,
    '<metadata type="producer">MyStableFast3D</metadata>'];
  list.forEach((m, k) => {
    parts.push(`<material id="${k + 1}"><metadata type="name">${esc(m.name)}</metadata><color><r>${num(m.color[0])}</r><g>${num(m.color[1])}</g><b>${num(m.color[2])}</b></color></material>`);
  });
  list.forEach((m, k) => {
    parts.push(`<object id="${k}"><metadata type="name">${esc(m.name)}</metadata><mesh><vertices>`);
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      const color = m.colors ? `<color><r>${num(m.colors[i])}</r><g>${num(m.colors[i + 1])}</g><b>${num(m.colors[i + 2])}</b></color>` : '';
      parts.push(`<vertex><coordinates><x>${num(p[i] * scale)}</x><y>${num(p[i + 1] * scale)}</y><z>${num(p[i + 2] * scale)}</z></coordinates>${color}</vertex>`);
    }
    parts.push(`</vertices><volume materialid="${k + 1}">`);
    const f = m.faces;
    for (let i = 0; i < f.length; i += 3) parts.push(`<triangle><v1>${f[i]}</v1><v2>${f[i + 1]}</v2><v3>${f[i + 2]}</v3></triangle>`);
    parts.push('</volume></mesh></object>');
  });
  parts.push('</amf>');
  return new TextEncoder().encode(parts.join('\n'));
}

// COLLADA 1.4.1: a geometry, an effect with the base colour and a scene node
// per mesh; per-vertex colours as a COLOR input.
export function writeDAE(meshes, { units = 'm' } = {}) {
  const list = solid(meshes);
  if (!list.length) throw new Error('COLLADA needs a mesh with triangles');
  const meter = UNIT_METERS[units] || 1;
  const unitName = { m: 'meter', cm: 'centimeter', mm: 'millimeter', in: 'inch' }[units] || 'meter';
  const effects = [];
  const materials = [];
  const geometries = [];
  const nodes = [];
  const floats = (arr) => Array.from(arr, num).join(' ');
  list.forEach((m, k) => {
    const n = m.positions.length / 3;
    effects.push(`<effect id="effect${k}"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${m.color.map(num).join(' ')} 1</color></diffuse></lambert></technique></profile_COMMON></effect>`);
    materials.push(`<material id="material${k}" name="${esc(m.name)}"><instance_effect url="#effect${k}"/></material>`);
    const xyz = '<param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>';
    const rgb = '<param name="R" type="float"/><param name="G" type="float"/><param name="B" type="float"/>';
    let colorSource = '';
    let colorInput = '';
    if (m.colors) {
      colorSource = `<source id="geom${k}-col"><float_array id="geom${k}-col-array" count="${n * 3}">${floats(m.colors)}</float_array>`
        + `<technique_common><accessor source="#geom${k}-col-array" count="${n}" stride="3">${rgb}</accessor></technique_common></source>`;
      colorInput = `<input semantic="COLOR" source="#geom${k}-col" offset="0"/>`;
    }
    geometries.push(`<geometry id="geom${k}" name="${esc(m.name)}"><mesh>`
      + `<source id="geom${k}-pos"><float_array id="geom${k}-pos-array" count="${n * 3}">${floats(m.positions)}</float_array>`
      + `<technique_common><accessor source="#geom${k}-pos-array" count="${n}" stride="3">${xyz}</accessor></technique_common></source>`
      + colorSource
      + `<vertices id="geom${k}-vtx"><input semantic="POSITION" source="#geom${k}-pos"/></vertices>`
      + `<triangles material="mat${k}" count="${m.faces.length / 3}"><input semantic="VERTEX" source="#geom${k}-vtx" offset="0"/>${colorInput}`
      + `<p>${Array.from(m.faces).join(' ')}</p></triangles></mesh></geometry>`);
    nodes.push(`<node id="node${k}" name="${esc(m.name)}"><instance_geometry url="#geom${k}"><bind_material><technique_common>`
      + `<instance_material symbol="mat${k}" target="#material${k}"/></technique_common></bind_material></instance_geometry></node>`);
  });
  const now = new Date().toISOString();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">\n'
    + `<asset><contributor><authoring_tool>MyStableFast3D</authoring_tool></contributor><created>${now}</created><modified>${now}</modified>`
    + `<unit name="${unitName}" meter="${meter}"/><up_axis>Y_UP</up_axis></asset>\n`
    + `<library_effects>${effects.join('')}</library_effects>\n`
    + `<library_materials>${materials.join('')}</library_materials>\n`
    + `<library_geometries>${geometries.join('\n')}</library_geometries>\n`
    + `<library_visual_scenes><visual_scene id="scene" name="scene">${nodes.join('')}</visual_scene></library_visual_scenes>\n`
    + '<scene><instance_visual_scene url="#scene"/></scene>\n</COLLADA>\n';
  return new TextEncoder().encode(xml);
}

// VRML 2.0: one Shape with an IndexedFaceSet per mesh.
export function writeVRML(meshes) {
  const list = solid(meshes);
  if (!list.length) throw new Error('VRML needs a mesh with triangles');
  const out = ['#VRML V2.0 utf8', '# MyStableFast3D', ''];
  for (const m of list) {
    const p = m.positions;
    const pts = [];
    for (let i = 0; i < p.length; i += 3) pts.push(`${num(p[i])} ${num(p[i + 1])} ${num(p[i + 2])}`);
    const idx = [];
    const f = m.faces;
    for (let i = 0; i < f.length; i += 3) idx.push(`${f[i]}, ${f[i + 1]}, ${f[i + 2]}, -1`);
    out.push('Shape {');
    out.push(`  appearance Appearance { material Material { diffuseColor ${m.color.map(num).join(' ')} } }`);
    out.push('  geometry IndexedFaceSet {');
    out.push('    solid FALSE');
    out.push(`    coord Coordinate { point [\n      ${pts.join(',\n      ')}\n    ] }`);
    if (m.colors) {
      const cols = [];
      for (let i = 0; i < m.colors.length; i += 3) cols.push(`${num(m.colors[i])} ${num(m.colors[i + 1])} ${num(m.colors[i + 2])}`);
      out.push('    colorPerVertex TRUE');
      out.push(`    color Color { color [\n      ${cols.join(',\n      ')}\n    ] }`);
    }
    out.push(`    coordIndex [\n      ${idx.join(',\n      ')}\n    ]`);
    out.push('  }');
    out.push('}');
  }
  return new TextEncoder().encode(`${out.join('\n')}\n`);
}

// Every mesh merged into one list of points and triangles (for the formats
// that hold a single mesh), with a colour per point.
function merged(meshes, withFaces) {
  const list = withFaces ? solid(meshes) : meshes;
  let n = 0;
  let t = 0;
  for (const m of list) { n += m.positions.length / 3; t += m.faces ? m.faces.length / 3 : 0; }
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const faces = new Uint32Array(withFaces ? t * 3 : 0);
  let vo = 0;
  let fo = 0;
  for (const m of list) {
    const count = m.positions.length / 3;
    positions.set(m.positions, vo * 3);
    for (let i = 0; i < count; i++) colors.set(vertexColor(m, i), (vo + i) * 3);
    if (withFaces && m.faces) {
      for (let i = 0; i < m.faces.length; i++) faces[fo + i] = m.faces[i] + vo;
      fo += m.faces.length;
    }
    vo += count;
  }
  return { positions, colors, faces, count: n, colored: list.some((m) => m.colors) };
}

// Legacy VTK, ASCII POLYDATA: points, triangles, colours as COLOR_SCALARS.
export function writeVTK(meshes) {
  const m = merged(meshes, true);
  if (!m.faces.length) throw new Error('VTK needs a mesh with triangles');
  const out = ['# vtk DataFile Version 3.0', 'MyStableFast3D', 'ASCII', 'DATASET POLYDATA', `POINTS ${m.count} float`];
  for (let i = 0; i < m.count; i++) out.push(`${num(m.positions[i * 3])} ${num(m.positions[i * 3 + 1])} ${num(m.positions[i * 3 + 2])}`);
  const t = m.faces.length / 3;
  out.push(`POLYGONS ${t} ${t * 4}`);
  for (let i = 0; i < m.faces.length; i += 3) out.push(`3 ${m.faces[i]} ${m.faces[i + 1]} ${m.faces[i + 2]}`);
  out.push(`POINT_DATA ${m.count}`, 'COLOR_SCALARS rgb 3');
  for (let i = 0; i < m.count; i++) out.push(`${num(m.colors[i * 3])} ${num(m.colors[i * 3 + 1])} ${num(m.colors[i * 3 + 2])}`);
  return new TextEncoder().encode(`${out.join('\n')}\n`);
}

// Point Cloud Data 0.7, ASCII: every vertex as a point with its colour packed
// into one integer, as PCL does.
export function writePCD(meshes) {
  const m = merged(meshes, false);
  if (!m.count) throw new Error('Nothing to save');
  const out = ['# .PCD v0.7 - Point Cloud Data file format', 'VERSION 0.7', 'FIELDS x y z rgb', 'SIZE 4 4 4 4', 'TYPE F F F U',
    'COUNT 1 1 1 1', `WIDTH ${m.count}`, 'HEIGHT 1', 'VIEWPOINT 0 0 0 1 0 0 0', `POINTS ${m.count}`, 'DATA ascii'];
  for (let i = 0; i < m.count; i++) {
    const rgb = (byte(m.colors[i * 3]) << 16) | (byte(m.colors[i * 3 + 1]) << 8) | byte(m.colors[i * 3 + 2]);
    out.push(`${num(m.positions[i * 3])} ${num(m.positions[i * 3 + 1])} ${num(m.positions[i * 3 + 2])} ${rgb >>> 0}`);
  }
  return new TextEncoder().encode(`${out.join('\n')}\n`);
}

// XYZ: one "x y z r g b" line per vertex (colours 0..255).
export function writeXYZ(meshes) {
  const m = merged(meshes, false);
  if (!m.count) throw new Error('Nothing to save');
  const out = [];
  for (let i = 0; i < m.count; i++) {
    out.push(`${num(m.positions[i * 3])} ${num(m.positions[i * 3 + 1])} ${num(m.positions[i * 3 + 2])} `
      + `${byte(m.colors[i * 3])} ${byte(m.colors[i * 3 + 1])} ${byte(m.colors[i * 3 + 2])}`);
  }
  return new TextEncoder().encode(`${out.join('\n')}\n`);
}
