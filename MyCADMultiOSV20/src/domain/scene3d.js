// VRML 2.0 (.wrl) and COLLADA 1.4 (.dae): scene formats FreeCAD reads and
// writes. Objects are { name, triangles, color } in millimetres, Z up.

import { child, childrenNamed, escapeXml, findAll, parseXml } from './xml.js';

const f = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Shared vertices and triangle indices of a triangle soup. */
function indexed(triangles) {
  const vertices = [];
  const map = new Map();
  const faces = [];
  for (const tri of triangles) {
    const face = tri.map((p) => {
      const key = p.map((v) => Math.round(v * 1e6)).join(',');
      let index = map.get(key);
      if (index === undefined) { index = vertices.length; vertices.push(p); map.set(key, index); }
      return index;
    });
    if (face[0] !== face[1] && face[1] !== face[2] && face[0] !== face[2]) faces.push(face);
  }
  return { vertices, faces };
}

const rgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return [0.72, 0.74, 0.78];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const hexOf = ([r, g, b]) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('')}`;
const safeName = (name, i) => (String(name || `Object${i + 1}`).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || `Object${i + 1}`);

// ───────────────────────── 4×4 matrices (row major, column vectors)

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return out;
}
const translate = ([x, y, z]) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const scaling = ([x, y, z]) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
/** Rotation about an axis by an angle in radians (Rodrigues). */
function axisAngle([x, y, z], a) {
  const l = Math.hypot(x, y, z) || 1;
  [x, y, z] = [x / l, y / l, z / l];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0, t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0, t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0, 0, 0, 0, 1];
}
const point = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
/** Applies a matrix to triangles (a mirroring matrix turns them back outward). */
const placeTriangles = (m, tris) => {
  const out = tris.map((tri) => tri.map((p) => point(m, p)));
  return det3(m) < 0 ? out.map(([a, b, c]) => [a, c, b]) : out;
};

/** A polygon (indices) as a fan of triangles. */
const fan = (poly) => poly.slice(1, -1).map((_, i) => [poly[0], poly[i + 1], poly[i + 2]]);

// ───────────────────────── VRML 2.0

export function toVrml(objects, title = 'MyCAD') {
  const lines = ['#VRML V2.0 utf8', `# ${String(title).replace(/[\r\n]/g, ' ')} — MyCAD (millimetres, Z up)`, `WorldInfo { title "${String(title).replace(/["\\]/g, '')}" }`, ''];
  objects.forEach((object, i) => {
    const { vertices, faces } = indexed(object.triangles);
    if (!faces.length) return;
    const [r, g, b] = rgb(object.color);
    lines.push(`DEF ${safeName(object.name, i)} Shape {`);
    lines.push(`  appearance Appearance { material Material { diffuseColor ${f(r)} ${f(g)} ${f(b)} } }`);
    lines.push('  geometry IndexedFaceSet {', '    solid TRUE', '    coord Coordinate { point [');
    for (const v of vertices) lines.push(`      ${f(v[0])} ${f(v[1])} ${f(v[2])},`);
    lines.push('    ] }', '    coordIndex [');
    for (const face of faces) lines.push(`      ${face.join(', ')}, -1,`);
    lines.push('    ]', '  }', '}', '');
  });
  return lines.join('\n');
}

/** VRML tokens: words, numbers, strings, braces and brackets (commas are white space). */
function vrmlTokens(text) {
  const tokens = [];
  const re = /"(?:[^"\\]|\\.)*"|[{}[\]]|[^\s,{}[\]"#]+|#[^\n]*/g;
  let m;
  while ((m = re.exec(text))) if (m[0][0] !== '#') tokens.push(m[0]);
  return tokens;
}

/** Parses VRML 2.0 (and the VRML 1.0-like subset FreeCAD writes as 2.0) into a node tree. */
function parseVrmlNodes(text) {
  const tokens = vrmlTokens(text.replace(/^#VRML[^\n]*\n/, ''));
  let i = 0;
  const defs = new Map();
  const isNodeStart = () => tokens[i] === 'DEF' || tokens[i] === 'USE' || (/^[A-Za-z_]/.test(tokens[i] ?? '') && tokens[i + 1] === '{');
  const node = () => {
    if (tokens[i] === 'USE') { i++; return defs.get(tokens[i++]) ?? null; }
    let name = null;
    if (tokens[i] === 'DEF') { i++; name = tokens[i++]; }
    const type = tokens[i++];
    if (tokens[i] !== '{') return null;
    i++;
    const out = { type, name, fields: {} };
    while (i < tokens.length && tokens[i] !== '}') {
      const key = tokens[i++];
      if (key === 'ROUTE') { i += 3; continue; }
      out.fields[key] = value();
    }
    i++;
    if (name) defs.set(name, out);
    return out;
  };
  const value = () => {
    if (tokens[i] === '[') {
      i++;
      const items = [];
      while (i < tokens.length && tokens[i] !== ']') items.push(isNodeStart() ? node() : tokens[i++]);
      i++;
      return items;
    }
    if (isNodeStart()) return node();
    // Several numbers (SFVec3f, SFRotation …) or one word.
    const items = [];
    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) items.push(tokens[i++]);
    if (items.length) return items;
    return [tokens[i++]];
  };
  const roots = [];
  while (i < tokens.length) {
    const before = i;
    if (isNodeStart()) roots.push(node());
    else i++;
    if (i === before) i++;
  }
  return roots.filter(Boolean);
}

const nums = (v) => (Array.isArray(v) ? v : []).map(Number).filter(Number.isFinite);

export function parseVrml(data) {
  const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
  if (!/^#VRML V2\.0/.test(text.trimStart())) throw new Error('VRML: only VRML 2.0 (VRML97) files can be read');
  const objects = [];
  const walk = (n, m, name) => {
    if (!n || typeof n !== 'object') return;
    const kids = (key) => [].concat(n.fields[key] ?? []).filter((c) => c && typeof c === 'object');
    switch (n.type) {
      case 'Transform': {
        const t = nums(n.fields.translation);
        const r = nums(n.fields.rotation);
        const s = nums(n.fields.scale);
        const c = nums(n.fields.center);
        let local = IDENTITY;
        if (t.length === 3) local = mul(local, translate(t));
        if (c.length === 3) local = mul(local, translate(c));
        if (r.length === 4 && r[3]) local = mul(local, axisAngle(r.slice(0, 3), r[3]));
        if (s.length === 3) local = mul(local, scaling(s));
        if (c.length === 3) local = mul(local, translate(c.map((v) => -v)));
        for (const k of kids('children')) walk(k, mul(m, local), n.name ?? name);
        break;
      }
      case 'Group': case 'Anchor': case 'Collision': case 'Billboard': case 'Switch': case 'LOD':
        for (const k of [...kids('children'), ...kids('choice'), ...kids('level')]) walk(k, m, n.name ?? name);
        break;
      case 'Shape': {
        const geometry = n.fields.geometry;
        if (geometry?.type !== 'IndexedFaceSet') break;
        const coords = nums(geometry.fields.coord?.fields?.point);
        const points = [];
        for (let k = 0; k + 2 < coords.length; k += 3) points.push([coords[k], coords[k + 1], coords[k + 2]]);
        const index = nums(geometry.fields.coordIndex);
        const tris = [];
        let poly = [];
        for (const v of [...index, -1]) {
          if (v < 0) { if (poly.length >= 3) tris.push(...fan(poly)); poly = []; } else if (points[v]) poly.push(v);
        }
        // ccw FALSE: faces wound clockwise.
        const cw = geometry.fields.ccw?.[0] === 'FALSE';
        const triangles = tris.map(([a, b, c]) => (cw ? [points[a], points[c], points[b]] : [points[a], points[b], points[c]]));
        if (!triangles.length) break;
        const diffuse = nums(n.fields.appearance?.fields?.material?.fields?.diffuseColor);
        objects.push({ name: n.name ?? name ?? `VRML${objects.length + 1}`, triangles: placeTriangles(m, triangles), ...(diffuse.length === 3 ? { color: hexOf(diffuse) } : {}) });
        break;
      }
      default: break;
    }
  };
  for (const root of parseVrmlNodes(text)) walk(root, IDENTITY, null);
  if (!objects.length) throw new Error('VRML: no IndexedFaceSet geometry');
  return objects;
}

// ───────────────────────── COLLADA 1.4.1

export function toDae(objects, { title = 'MyCAD', author = '', date = new Date() } = {}) {
  const when = date.toISOString().replace(/\.\d+Z$/, 'Z');
  const geometries = [];
  const effects = [];
  const materials = [];
  const nodes = [];
  objects.forEach((object, i) => {
    const { vertices, faces } = indexed(object.triangles);
    if (!faces.length) return;
    const id = `${safeName(object.name, i)}_${i}`;
    const [r, g, b] = rgb(object.color);
    effects.push(`    <effect id="${id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${f(r)} ${f(g)} ${f(b)} 1</color></diffuse></lambert></technique></profile_COMMON></effect>`);
    materials.push(`    <material id="${id}-mat" name="${escapeXml(object.name)}"><instance_effect url="#${id}-fx"/></material>`);
    geometries.push(`    <geometry id="${id}-mesh" name="${escapeXml(object.name)}">
      <mesh>
        <source id="${id}-pos">
          <float_array id="${id}-pos-array" count="${vertices.length * 3}">${vertices.map((v) => v.map(f).join(' ')).join(' ')}</float_array>
          <technique_common><accessor source="#${id}-pos-array" count="${vertices.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common>
        </source>
        <vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
        <triangles count="${faces.length}" material="mat"><input semantic="VERTEX" source="#${id}-vtx" offset="0"/><p>${faces.map((face) => face.join(' ')).join(' ')}</p></triangles>
      </mesh>
    </geometry>`);
    nodes.push(`      <node id="${id}" name="${escapeXml(object.name)}"><instance_geometry url="#${id}-mesh"><bind_material><technique_common><instance_material symbol="mat" target="#${id}-mat"/></technique_common></bind_material></instance_geometry></node>`);
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><author>${escapeXml(author)}</author><authoring_tool>MyCAD</authoring_tool></contributor>
    <created>${when}</created><modified>${when}</modified>
    <title>${escapeXml(title)}</title>
    <unit name="millimeter" meter="0.001"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>
${effects.join('\n')}
  </library_effects>
  <library_materials>
${materials.join('\n')}
  </library_materials>
  <library_geometries>
${geometries.join('\n')}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene" name="${escapeXml(title)}">
${nodes.join('\n')}
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`;
}

const floats = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).map(Number);

/** Triangles of a COLLADA <mesh> (triangles, polylist, polygons; the VERTEX/POSITION input). */
function daeMesh(mesh, byId) {
  const sources = new Map(childrenNamed(mesh, 'source').map((s) => [s.attrs.id, s]));
  const vertices = child(mesh, 'vertices');
  const positionOf = (id) => {
    const source = sources.get(id) ?? byId.get(id);
    const array = floats(child(source, 'float_array')?.text);
    const stride = Number(findAll(source, 'accessor')[0]?.attrs.stride) || 3;
    const out = [];
    for (let k = 0; k + 2 < array.length; k += stride) out.push([array[k], array[k + 1], array[k + 2]]);
    return out;
  };
  const posInput = childrenNamed(vertices, 'input').find((n) => n.attrs.semantic === 'POSITION');
  const positions = posInput ? positionOf(posInput.attrs.source.replace(/^#/, '')) : [];
  const tris = [];
  for (const prim of mesh.children) {
    const kind = prim.name.replace(/^.*:/, '');
    if (!['triangles', 'polylist', 'polygons'].includes(kind)) continue;
    const inputs = childrenNamed(prim, 'input');
    const stride = Math.max(1, ...inputs.map((n) => Number(n.attrs.offset) + 1));
    const vertexInput = inputs.find((n) => n.attrs.semantic === 'VERTEX');
    if (!vertexInput) continue;
    const offset = Number(vertexInput.attrs.offset) || 0;
    const pick = (list) => {
      const out = [];
      for (let k = 0; k + offset < list.length; k += stride) out.push(list[k + offset]);
      return out;
    };
    if (kind === 'triangles') {
      const idx = pick(floats(child(prim, 'p')?.text));
      for (let k = 0; k + 2 < idx.length; k += 3) tris.push([idx[k], idx[k + 1], idx[k + 2]]);
    } else if (kind === 'polylist') {
      const counts = floats(child(prim, 'vcount')?.text);
      const all = floats(child(prim, 'p')?.text);
      let at = 0;
      for (const n of counts) {
        tris.push(...fan(pick(all.slice(at, at + n * stride))));
        at += n * stride;
      }
    } else {
      for (const p of childrenNamed(prim, 'p')) tris.push(...fan(pick(floats(p.text))));
    }
  }
  return tris.map((t) => t.map((k) => positions[k])).filter((t) => t.every(Boolean));
}

/** The transform elements of a COLLADA <node>, in order. */
function daeNodeMatrix(node) {
  let m = IDENTITY;
  for (const c of node.children) {
    const v = floats(c.text);
    switch (c.name.replace(/^.*:/, '')) {
      case 'matrix': if (v.length === 16) m = mul(m, v); break;
      case 'translate': if (v.length === 3) m = mul(m, translate(v)); break;
      case 'rotate': if (v.length === 4) m = mul(m, axisAngle(v.slice(0, 3), (v[3] * Math.PI) / 180)); break;
      case 'scale': if (v.length === 3) m = mul(m, scaling(v)); break;
      default: break;
    }
  }
  return m;
}

export function parseDae(data) {
  const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const root = parseXml(text);
  if (root.name.replace(/^.*:/, '') !== 'COLLADA') throw new Error('DAE: not a COLLADA document');
  const byId = new Map(findAll(root, 'source').map((s) => [s.attrs.id, s]));
  const asset = child(root, 'asset');
  const meter = Number(child(asset, 'unit')?.attrs.meter) || 1;
  const up = (child(asset, 'up_axis')?.text ?? 'Y_UP').trim();
  // Into millimetres and Z up.
  let world = scaling([meter * 1000, meter * 1000, meter * 1000]);
  if (up === 'Y_UP') world = mul(world, [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  else if (up === 'X_UP') world = mul(world, [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const geometries = new Map(findAll(root, 'geometry').map((g) => [g.attrs.id, g]));
  const colors = new Map();
  for (const material of findAll(root, 'material')) {
    const effectId = child(material, 'instance_effect')?.attrs.url?.replace(/^#/, '');
    const effect = findAll(root, 'effect').find((e) => e.attrs.id === effectId);
    const color = floats(findAll(effect ?? { children: [] }, 'diffuse').map((d) => child(d, 'color')?.text).find(Boolean));
    if (color.length >= 3) colors.set(material.attrs.id, hexOf(color));
  }
  const objects = [];
  const visit = (node, m) => {
    const here = mul(m, daeNodeMatrix(node));
    for (const inst of childrenNamed(node, 'instance_geometry')) {
      const geometry = geometries.get(inst.attrs.url?.replace(/^#/, ''));
      const mesh = child(geometry, 'mesh');
      if (!mesh) continue;
      const triangles = daeMesh(mesh, byId);
      if (!triangles.length) continue;
      const target = findAll(inst, 'instance_material')[0]?.attrs.target?.replace(/^#/, '');
      objects.push({ name: node.attrs.name || geometry.attrs.name || `DAE${objects.length + 1}`, triangles: placeTriangles(here, triangles), ...(colors.has(target) ? { color: colors.get(target) } : {}) });
    }
    for (const kid of childrenNamed(node, 'node')) visit(kid, here);
  };
  const sceneUrl = child(child(root, 'scene'), 'instance_visual_scene')?.attrs.url?.replace(/^#/, '');
  const scenes = findAll(root, 'visual_scene');
  const scene = scenes.find((s) => s.attrs.id === sceneUrl) ?? scenes[0];
  if (scene) for (const node of childrenNamed(scene, 'node')) visit(node, world);
  // No scene: every geometry as it is.
  if (!objects.length) for (const geometry of geometries.values()) {
    const mesh = child(geometry, 'mesh');
    const triangles = mesh ? daeMesh(mesh, byId) : [];
    if (triangles.length) objects.push({ name: geometry.attrs.name || geometry.attrs.id, triangles: placeTriangles(world, triangles) });
  }
  if (!objects.length) throw new Error('DAE: no mesh geometry');
  return objects;
}
