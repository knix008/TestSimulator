// Alembic as a scene, both ways: the hierarchy of transforms with their motion over time, meshes (with UVs) whose points may change
// on every frame, cameras and curves. Blender's ways are followed where Alembic leaves room: Y up with the object's own axes turned
// as well, a camera turned a quarter about X to look down -Z as Maya's do (and its children turned back), times as frame ÷ fps.
// Checked against a real Blender: npm run verify:blender.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { insertKey } from './anim.js';
import {
  OgawaReader, asBytes, readIndexedMeta, readObjectHeaders, readProperties, readSample, readTimeSamplings, safeName, sampleTime, writeArchive, xformMatrix,
} from './alembic.js';
import { GEOMETRY_TYPES, addObject, defaultCamera, evaluatedMesh, isVisible, sampleSpline, setFrame, worldMatrix } from './doc.js';
import { createMesh } from './mesh.js';

const DEG = Math.PI / 180;
// Alembic's Y up into this program's Z up, and back.
const A2B = new Matrix4().makeRotationX(Math.PI / 2);
const B2A = new Matrix4().makeRotationX(-Math.PI / 2);
const CAMERA_TURN = new Matrix4().makeRotationX(Math.PI / 2);
const CAMERA_UNTURN = new Matrix4().makeRotationX(-Math.PI / 2);
const toB = (x, y, z) => [x, -z, y];
const toA = (v) => [v[0], v[2], -v[1]];
const SHAPES = ['AbcGeom_PolyMesh', 'AbcGeom_SubD', 'AbcGeom_Camera', 'AbcGeom_Curve'];
const isShape = (h) => SHAPES.some((s) => (h?.meta.schema ?? '').startsWith(s));

// ─────────────── reading

/** Curve points along one curve of an Alembic curves shape, as a polyline. */
export function curvePolyline(points, order, basis, periodic, knots, weights, resolution = 12) {
  const n = points.length;
  if (order <= 2 || n < order) return { points, cyclic: periodic };
  if (basis === 1 && order === 4) {
    // Bézier: a point, two handles, a point…; periodic ones close back to the first.
    const list = periodic ? [...points, points[0]] : points;
    const out = [];
    for (let i = 0; i + 3 < list.length; i += 3) {
      const [a, b, c, d] = list.slice(i, i + 4);
      for (let s = 0; s < resolution; s++) {
        const t = s / resolution;
        const u = 1 - t;
        out.push([0, 1, 2].map((k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]));
      }
    }
    if (!periodic) out.push([...list.at(-1)]);
    return { points: out, cyclic: periodic };
  }
  // A B-spline (or NURBS) by de Boor, with the file's knots when they fit, else uniform: open at the ends, or wrapped.
  let ctrl = points;
  let w = weights?.length === n ? weights : points.map(() => 1);
  if (periodic) { ctrl = [...points, ...points.slice(0, order - 1)]; w = [...w, ...w.slice(0, order - 1)]; }
  const m = ctrl.length;
  let kv = knots?.length === m + order ? knots : knots?.length === m + order + 2 ? knots.slice(1, -1) : null;
  if (!kv) {
    kv = [];
    if (periodic) for (let i = 0; i < m + order; i++) kv.push(i);
    else { for (let i = 0; i < order; i++) kv.push(0); for (let i = 1; i < m - order + 1; i++) kv.push(i); for (let i = 0; i < order; i++) kv.push(m - order + 1); }
  }
  const [t0, t1] = [kv[order - 1], kv[m]];
  const steps = Math.max(1, (m - order + 1) * resolution);
  const out = [];
  for (let s = 0; s <= steps; s++) {
    if (periodic && s === steps) break;
    const t = Math.min(t0 + ((t1 - t0) * s) / steps, t1);
    let span = order - 1;
    while (span < m - 1 && t >= kv[span + 1]) span++;
    const d = [];
    for (let j = 0; j < order; j++) { const p = ctrl[span - order + 1 + j]; const ww = w[span - order + 1 + j]; d.push([p[0] * ww, p[1] * ww, p[2] * ww, ww]); }
    for (let r = 1; r < order; r++) {
      for (let j = order - 1; j >= r; j--) {
        const i = span - order + 1 + j;
        const den = kv[i + order - r] - kv[i];
        const alpha = den > 0 ? (t - kv[i]) / den : 0;
        d[j] = d[j].map((x, k) => (1 - alpha) * d[j - 1][k] + alpha * x);
      }
    }
    const q = d[order - 1];
    out.push([q[0] / q[3], q[1] / q[3], q[2] / q[3]]);
  }
  return { points: out, cyclic: periodic };
}

/**
 * Reads an Alembic file into the document as objects: transforms become objects (keyed on every sample when they move), each
 * holding its single mesh, camera or curve; meshes whose points change get a point cache by frame. Returns the new objects.
 */
export function importABCScene(doc, input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const reader = new OgawaReader(bytes);
  const root = reader.root();
  if (root.length < 6) throw new Error('This Alembic file has a layout that cannot be read');
  const meta = readIndexedMeta(reader, root[5]);
  const samplings = readTimeSamplings(reader, root[4]);
  const fps = doc.fps || 24;
  const frameOf = (p, i) => Math.round(sampleTime(samplings[p.ts ?? 0], i) * fps);
  const samplesOf = (p) => Math.max(1, p?.next ?? 1);
  const created = [];
  let lastFrame = 0;
  let firstFrame = Infinity;

  const shapeOf = (child, header, name) => {
    const props = readProperties(reader, reader.group(child.at)[0], meta);
    const schema = header.meta.schema;
    const geomProp = props.get('.geom');
    if (!geomProp) return null;
    const geom = readProperties(reader, geomProp.group, meta);
    if (schema.startsWith('AbcGeom_Camera')) {
      const core = geom.get('.core') ? readSample(reader, geom.get('.core'), 0) : [];
      const camera = defaultCamera();
      if (core[0] > 0) camera.lens = core[0];
      if (core[1] > 0) camera.sensor = core[1] * 10;
      if (core[14] > 0) camera.clipStart = core[14];
      if (core[15] > 0) camera.clipEnd = core[15];
      return addObject(doc, { type: 'CAMERA', name, data: camera });
    }
    const pProp = geom.get('P');
    if (!pProp) return null;
    const pointsAt = (i) => { const f = readSample(reader, pProp, i); const out = []; for (let k = 0; k + 2 < f.length; k += 3) out.push(toB(f[k], f[k + 1], f[k + 2])); return out; };
    if (schema.startsWith('AbcGeom_Curve')) {
      const pts = pointsAt(0);
      const counts = geom.get('nVertices') ? readSample(reader, geom.get('nVertices'), 0) : [pts.length];
      const [type = 1, wrap = 0, basis = 0] = geom.get('curveBasisAndType') ? readSample(reader, geom.get('curveBasisAndType'), 0) : [];
      const orders = geom.get('.orders') ? readSample(reader, geom.get('.orders'), 0) : null;
      const knots = geom.get('.knots') ? readSample(reader, geom.get('.knots'), 0) : null;
      const weights = geom.get('w') ? readSample(reader, geom.get('w'), 0) : null;
      const splines = [];
      let at = 0;
      let knotAt = 0;
      counts.forEach((n, c) => {
        const order = type === 2 ? orders?.[c] ?? 4 : type === 1 ? 2 : 4;
        const own = pts.slice(at, at + n);
        const k = knots ? knots.slice(knotAt, knotAt + n + order) : null;
        const line = curvePolyline(own, order, basis, wrap === 1, k?.length === n + order ? k : null, weights?.slice(at, at + n));
        splines.push({ kind: 'POLY', points: line.points, cyclic: line.cyclic });
        at += n;
        knotAt += n + order;
      });
      return addObject(doc, { type: 'CURVE', name, data: { splines, bevelDepth: 0, resolution: 12 } });
    }
    // A mesh: Alembic's faces wind the other way round.
    const counts = geom.get('.faceCounts') ? readSample(reader, geom.get('.faceCounts'), 0) : [];
    const indices = geom.get('.faceIndices') ? readSample(reader, geom.get('.faceIndices'), 0) : [];
    const verts = pointsAt(0);
    const faces = [];
    const corners = [];
    let at = 0;
    for (const n of counts) {
      faces.push(indices.slice(at, at + n).reverse());
      corners.push(Array.from({ length: n }, (_, k) => at + k).reverse());
      at += n;
    }
    const mesh = createMesh(verts, faces);
    const uvHolder = geom.get('uv') ?? (geom.get('.arbGeomParams') ? readProperties(reader, geom.get('.arbGeomParams').group, meta).get('uv') : null);
    if (uvHolder) {
      let vals = null;
      let lookup = null;
      if (uvHolder.compound) {
        const parts = readProperties(reader, uvHolder.group, meta);
        if (parts.get('.vals')) vals = readSample(reader, parts.get('.vals'), 0);
        if (parts.get('.indices')) lookup = readSample(reader, parts.get('.indices'), 0);
      } else vals = readSample(reader, uvHolder, 0);
      if (vals?.length) mesh.uvs = corners.map((face) => face.map((corner) => { const i = lookup ? lookup[corner] : corner; return [vals[i * 2] ?? 0, vals[i * 2 + 1] ?? 0]; }));
    }
    mesh.smooth = schema.startsWith('AbcGeom_SubD');
    const obj = addObject(doc, { type: 'MESH', name, data: mesh });
    if (samplesOf(pProp) > 1) {
      // Points that change: a cache by frame, for every sample with the same number of points.
      const points = {};
      for (let i = 0; i < samplesOf(pProp); i++) {
        const list = pointsAt(i);
        if (list.length !== verts.length) continue;
        const frame = frameOf(pProp, i);
        points[frame] = list;
        lastFrame = Math.max(lastFrame, frame);
        firstFrame = Math.min(firstFrame, frame);
      }
      obj.cache = { ...(obj.cache ?? {}), points };
    }
    return obj;
  };

  const place = (o, m) => {
    const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
    m.decompose(p, q, s);
    const e = new Euler().setFromQuaternion(q, 'ZYX');
    o.location = p.toArray();
    o.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
    o.rotationMode = 'XYZ';
    o.scale = s.toArray();
  };

  const visit = (group, header, parentObj) => {
    const children = reader.group(group.at);
    if (!children.length) return;
    const props = readProperties(reader, children[0], meta);
    const headers = readObjectHeaders(reader, children, meta);
    const kids = headers.map((h, i) => ({ h, g: children[i + 1] })).filter((k) => k.g && !k.g.data);
    const schema = header?.meta.schema ?? '';
    if (schema.startsWith('AbcGeom_Xform')) {
      // The usual layout: a transform holding its one shape, with the transforms of its children beside it.
      const shapes = kids.filter((k) => isShape(k.h));
      const own = shapes.length === 1 ? shapes[0] : null;
      const obj = (own && shapeOf(own.g, own.h, header.name)) || addObject(doc, { type: 'EMPTY', name: header.name });
      created.push(obj);
      if (parentObj) obj.parent = parentObj.id;
      const compound = props.get('.xform');
      const xs = compound ? readProperties(reader, compound.group, meta) : new Map();
      const vals = xs.get('.vals');
      const localAt = (i) => {
        // Y up to Z up on both sides, and a camera's quarter turn (and its children's) taken back out.
        const m = new Matrix4().multiplyMatrices(A2B, parentObj?.type === 'CAMERA' ? CAMERA_UNTURN : new Matrix4());
        m.multiply(xformMatrix(reader, xs, i));
        if (obj.type === 'CAMERA') m.multiply(CAMERA_TURN);
        return m.multiply(B2A);
      };
      const count = samplesOf(vals);
      place(obj, localAt(0));
      if (obj.type === 'MESH' && localAt(0).determinant() < 0) obj.data.faces = obj.data.faces.map((f) => [...f].reverse());
      if (count > 1) {
        let previous = null;
        for (let i = 0; i < count; i++) {
          const holder = {};
          place(holder, localAt(i));
          if (previous) holder.rotation = holder.rotation.map((a, k) => a + Math.round((previous[k] - a) / 360) * 360);
          previous = holder.rotation;
          const frame = frameOf(vals, i);
          lastFrame = Math.max(lastFrame, frame);
          firstFrame = Math.min(firstFrame, frame);
          for (const key of ['location', 'rotation', 'scale']) holder[key].forEach((v, k) => insertKey(obj, `${key}.${k}`, frame, v, 'LINEAR'));
        }
      }
      for (const k of kids) if (k !== own) visit(k.g, k.h, obj);
      return;
    }
    if (isShape(header)) {
      // A shape straight under the top or among others: an object of its own, Y up turned.
      const obj = shapeOf(group, header, header.name);
      if (obj) {
        created.push(obj);
        if (parentObj) obj.parent = parentObj.id;
        if (!parentObj) place(obj, new Matrix4());
      }
      return;
    }
    for (const k of kids) visit(k.g, k.h, parentObj);
  };
  visit(root[2], null, null);
  if (lastFrame > (doc.frameEnd ?? 250)) doc.frameEnd = lastFrame;
  if (Number.isFinite(firstFrame) && firstFrame < (doc.frameStart ?? 1) && firstFrame >= 0) doc.frameStart = firstFrame;
  setFrame(doc, doc.frame);
  return created;
}

// ─────────────── writing

/**
 * The scene (or the selected objects) as an Alembic file: a transform for every object, keyed on every frame of the animated range
 * when anything moves, holding its mesh (points on every frame when they change), camera or curve.
 */
export function exportABCScene(doc, { selectedOnly = false, start = null, end = null } = {}) {
  const usable = (o) => isVisible(doc, o) && (!selectedOnly || doc.selected.includes(o.id)) && (GEOMETRY_TYPES.has(o.type) || ['EMPTY', 'CAMERA', 'LIGHT', 'ARMATURE'].includes(o.type));
  const objects = doc.objects.filter(usable);
  const ids = new Set(objects.map((o) => o.id));
  const fps = doc.fps || 24;
  const r = doc.render ?? {};
  const aspect = (r.resY ?? 1080) / (r.resX ?? 1920);

  // The frames: the keyed range (and point caches), or the frame shown when nothing moves.
  const keyed = (a) => Object.values(a?.fcurves ?? {}).flat().map((k) => k.f);
  const marks = objects.flatMap((o) => [...keyed(o.anim), ...keyed(o.data?.anim), ...Object.keys(o.cache?.points ?? {}).map(Number), ...Object.keys(o.cache?.cloth ?? {}).map(Number),
    ...(o.modifiers ?? []).filter((m) => m.type === 'ARMATURE').flatMap((m) => keyed(doc.objects.find((a) => a.id === m.object)?.data?.anim))]);
  let [first, last] = marks.length ? [Math.floor(Math.min(...marks)), Math.ceil(Math.max(...marks))] : [doc.frame, doc.frame];
  if (start != null) first = start;
  if (end != null) last = Math.max(first, end);
  const frames = [];
  for (let f = first; f <= last; f++) frames.push(f);

  const relative = (o) => {
    const parent = ids.has(o.parent) ? doc.objects.find((x) => x.id === o.parent) : null;
    const m = parent ? new Matrix4().copy(worldMatrix(doc, parent)).invert().multiply(worldMatrix(doc, o)) : worldMatrix(doc, o).clone();
    const out = new Matrix4().multiplyMatrices(B2A, m).multiply(A2B);
    if (o.type === 'CAMERA') out.multiply(CAMERA_UNTURN);
    if (parent?.type === 'CAMERA') out.premultiply(CAMERA_TURN);
    return out;
  };
  const deforms = (o) => o.type === 'MESH' && (o.modifiers?.length || o.cache || o.cloth || o.softBody || o.fluid || Object.keys(o.data?.anim?.fcurves ?? {}).length);
  const xforms = new Map(objects.map((o) => [o.id, []]));
  const meshes = new Map();
  const back = doc.frame;
  for (const f of frames) {
    setFrame(doc, f);
    for (const o of objects) {
      xforms.get(o.id).push(Float64Array.from(relative(o).elements));
      const line = o.type === 'CURVE' && !(o.data?.bevelDepth > 0);
      if (GEOMETRY_TYPES.has(o.type) && !line && (f === first || deforms(o))) {
        if (!meshes.has(o.id)) meshes.set(o.id, []);
        meshes.get(o.id).push(evaluatedMesh(doc, o, { render: true }));
      }
    }
  }
  setFrame(doc, back);

  const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  // A property's samples, kept as one when they never change.
  const prop = (base, list) => {
    const bytes = list.map((x) => asBytes(x));
    const constant = bytes.every((b) => b.length === bytes[0].length && b.every((x, i) => x === bytes[0][i]));
    return constant ? { ...base, bytes: bytes[0] } : { ...base, samples: bytes, ts: 1 };
  };
  const taken = new Set();
  const node = (o) => {
    const label = safeName(o.name, taken);
    const matrices = xforms.get(o.id);
    const still = matrices.every((m) => same(m, matrices[0]));
    const identity = still && same(matrices[0], new Matrix4().elements);
    const xformProps = [
      { name: '.inherits', pod: 'bool', extent: 1, bytes: Uint8Array.of(1) },
      { name: '.ops', pod: 'u8', extent: 1, bytes: Uint8Array.of(0x30) },
      prop({ name: '.vals', pod: 'f64', extent: 16 }, still ? [matrices[0]] : matrices),
    ];
    if (!identity) xformProps.push({ name: '.isNotConstantIdentity', pod: 'bool', extent: 1, bytes: Uint8Array.of(1) });
    const kids = [];
    const shape = shapeNode(o, label);
    if (shape) kids.push(shape);
    for (const c of objects.filter((x) => x.parent === o.id)) kids.push(node(c));
    return {
      name: label,
      meta: { schema: 'AbcGeom_Xform_v3', schemaObjTitle: 'AbcGeom_Xform_v3:.xform' },
      properties: [{ name: '.xform', compound: true, meta: { schema: 'AbcGeom_Xform_v3' }, children: xformProps }],
      kids,
    };
  };
  const bounds = (pts) => {
    if (!pts.length) return new Float64Array(6);
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], p[k]); high[k] = Math.max(high[k], p[k]); }
    return Float64Array.from([...low, ...high]);
  };
  const shapeNode = (o, label) => {
    const geomMeta = (schema) => ({ schema, schemaBaseType: 'AbcGeom_GeomBase_v1', schemaObjTitle: `${schema}:.geom` });
    const wrap = (schema, children) => ({ name: `${label}Shape`, meta: geomMeta(schema), properties: [{ name: '.geom', compound: true, meta: { schema, schemaBaseType: 'AbcGeom_GeomBase_v1' }, children }], kids: [] });
    if (o.type === 'CAMERA') {
      const c = { ...defaultCamera(), ...o.data };
      const core = [c.lens, c.sensor / 10, 0, (c.sensor / 10) * aspect, 0, 1, 0, 0, 0, 0, c.fStop ?? 2.8, c.focusDistance ?? 10, 0, 0.5, c.clipStart, c.clipEnd];
      return { name: `${label}Shape`, meta: { schema: 'AbcGeom_Camera_v1', schemaObjTitle: 'AbcGeom_Camera_v1:.geom' }, properties: [{ name: '.geom', compound: true, meta: { schema: 'AbcGeom_Camera_v1' }, children: [{ name: '.core', pod: 'f64', extent: 16, bytes: asBytes(Float64Array.from(core)) }] }], kids: [] };
    }
    if (o.type === 'CURVE' && !(o.data?.bevelDepth > 0)) {
      // Curves as the lines they draw: linear, closed ones repeating their first point unless all of them close.
      const lines = (o.data?.splines ?? []).map((s) => ({ pts: sampleSpline(s, o.data.resolution ?? 12), cyclic: Boolean(s.cyclic) })).filter((s) => s.pts.length >= 2);
      if (!lines.length) return null;
      const periodic = lines.every((s) => s.cyclic);
      const pts = lines.flatMap((s) => (s.cyclic && !periodic ? [...s.pts, s.pts[0]] : s.pts).map(toA));
      const counts = lines.map((s) => s.pts.length + (s.cyclic && !periodic ? 1 : 0));
      return wrap('AbcGeom_Curve_v2', [
        { name: '.selfBnds', pod: 'f64', extent: 6, meta: { interpretation: 'box' }, bytes: asBytes(bounds(pts)) },
        { name: 'P', pod: 'f32', extent: 3, array: true, meta: { interpretation: 'point' }, bytes: asBytes(Float32Array.from(pts.flat())) },
        { name: 'nVertices', pod: 'i32', extent: 1, array: true, bytes: asBytes(Int32Array.from(counts)) },
        { name: 'curveBasisAndType', pod: 'u8', extent: 4, bytes: Uint8Array.of(1, periodic ? 1 : 0, 0, 1) },
      ]);
    }
    const list = meshes.get(o.id)?.filter((m) => m?.verts.length && m.faces.length);
    if (!list?.length) return null;
    const topology = (m) => [m.faces.length, ...m.faces.flat()];
    const steady = list.every((m) => m.verts.length === list[0].verts.length && same(topology(m), topology(list[0])));
    const pointsOf = (m) => m.verts.map(toA);
    // Alembic's faces wind the other way round.
    const reversed = (m) => m.faces.map((f) => [...f].reverse());
    const geom = [
      prop({ name: '.selfBnds', pod: 'f64', extent: 6, meta: { interpretation: 'box' } }, list.map((m) => bounds(pointsOf(m)))),
      prop({ name: 'P', pod: 'f32', extent: 3, array: true, meta: { interpretation: 'point' } }, list.map((m) => Float32Array.from(pointsOf(m).flat()))),
      prop({ name: '.faceIndices', pod: 'i32', extent: 1, array: true }, (steady ? [list[0]] : list).map((m) => Int32Array.from(reversed(m).flat()))),
      prop({ name: '.faceCounts', pod: 'i32', extent: 1, array: true }, (steady ? [list[0]] : list).map((m) => Int32Array.from(m.faces.map((f) => f.length)))),
    ];
    const mesh = list[0];
    if (steady && mesh.uvs?.some(Boolean)) {
      const uv = [];
      mesh.faces.forEach((face, f) => { for (let k = face.length - 1; k >= 0; k--) { const c = mesh.uvs[f]?.[k] ?? [0, 0]; uv.push(c[0], c[1]); } });
      geom.push({ name: 'uv', pod: 'f32', extent: 2, array: true, meta: { arrayExtent: 1, geoScope: 'fvr', interpretation: 'vector', isGeomParam: 'true', podExtent: 2, podName: 'float32_t' }, bytes: asBytes(Float32Array.from(uv)) });
    }
    return wrap('AbcGeom_PolyMesh_v1', geom);
  };
  const kids = objects.filter((o) => !ids.has(o.parent)).map(node);
  return writeArchive(kids, [{ max: frames.length, perCycle: 1 / fps, start: first / fps }]);
}
