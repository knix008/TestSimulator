// File formats. The .blend reader is tested on files this test writes in the same self-describing layout, in the old MVert and
// the new attribute form; `npm run verify:formats` also runs the readers over real files from other programs.
import assert from 'node:assert/strict';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { exportABC, importABC } from '../../src/core/alembic.js';
import { isZstd, zstdDecompress } from '../../src/core/zstd.js';
import { describe, test } from 'node:test';
import { exportGLB, importGLB } from '../../src/core/io.js';
import { deflateRawSync, deflateSync, gzipSync } from 'node:zlib';
import { blendVersion, importBlend } from '../../src/core/blendfile.js';
import { addObject, appendDocument, createDefaultScene, defaultMaterial, deserialize, getObject, serialize } from '../../src/core/doc.js';
import { exportDAE, exportFBX, exportUSDA, importDAE, importFBX, importUSDA, parseXML } from '../../src/core/formats.js';
import { gunzip, inflateRaw, inflateZlib } from '../../src/core/inflate.js';
import { cubeMesh, faceArea, icoSphereMesh, signedVolume, torusMesh } from '../../src/core/mesh.js';
import { createNode } from '../../src/core/nodes.js';

const near = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b} (±${eps})`);
const material = { name: 'Red', baseColor: [1, 0, 0], metallic: 0, roughness: 0.5 };
const sameShape = (a, b) => {
  assert.equal(a.verts.length, b.verts.length);
  assert.equal(a.faces.length, b.faces.length);
  near(signedVolume(a), signedVolume(b), 1e-3);
  near(a.faces.reduce((s, f) => s + faceArea(a, f), 0), b.faces.reduce((s, f) => s + faceArea(b, f), 0), 1e-3);
};

describe('inflate', () => {
  const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => (i * i * 7 + (i >> 3)) & 255);
  test('reads what zlib writes, at every level', () => {
    for (const level of [0, 1, 6, 9]) {
      const data = bytes(70000);
      assert.deepEqual(Buffer.from(inflateRaw(deflateRawSync(data, { level }))), Buffer.from(data), `level ${level}`);
    }
  });
  test('repetitive data: long back references, and growing past the size hint', () => {
    const data = new Uint8Array(200000).fill(65);
    assert.equal(inflateZlib(deflateSync(data)).length, 200000);
    assert.equal(inflateZlib(deflateSync(data), 10).length, 200000);
  });
  test('gzip with its header', () => {
    assert.equal(new TextDecoder().decode(gunzip(gzipSync(Buffer.from('hello .blend')))), 'hello .blend');
    assert.throws(() => gunzip(new Uint8Array(20)));
  });
  test('cut-off data is an error, not a hang', () => {
    const packed = deflateRawSync(bytes(5000));
    assert.throws(() => inflateRaw(packed.subarray(0, 100)), /ends too early|Bad/);
  });
});

describe('FBX', () => {
  const objects = () => {
    const mesh = cubeMesh(2);
    return [{ name: 'Box', mesh, material }, { name: 'Ball', mesh: icoSphereMesh(2, 1), material: null }];
  };
  test('a binary file round-trips: shape, faces, UVs, names, colours', () => {
    const list = objects();
    const bytes = exportFBX(list);
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 18)), 'Kaydara FBX Binary');
    const back = importFBX(bytes);
    assert.deepEqual(back.map((o) => o.name), ['Box', 'Ball']);
    sameShape(back[0].mesh, list[0].mesh);
    sameShape(back[1].mesh, list[1].mesh);
    assert.deepEqual(back[0].mesh.uvs[2], list[0].mesh.uvs[2]);
    assert.deepEqual(back[0].material.baseColor, [1, 0, 0]);
    assert.equal(back[0].material.name, 'Red');
    assert.equal(back[1].material, null);
  });
  test('polygons stay polygons: a quad comes back as a quad', () => {
    const back = importFBX(exportFBX([{ name: 'Box', mesh: cubeMesh(2) }]));
    assert.ok(back[0].mesh.faces.every((f) => f.length === 4));
  });
  const ascii = (extra = '') => `; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXVersion: 7400
}
GlobalSettings:  {
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",100
\t}
}
Objects:  {
\tGeometry: 1, "Geometry::Tri", "Mesh" {
\t\tVertices: *12 {
\t\t\ta: 0,0,0,1,0,0,
\t\t\t1,1,0,0,1,0
\t\t}
\t\tPolygonVertexIndex: *4 {
\t\t\ta: 0,1,2,-4
\t\t}
\t\tLayerElementUV: 0 {
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "IndexToDirect"
\t\t\tUV: *8 {
\t\t\t\ta: 0,0,1,0,1,1,0,1
\t\t\t}
\t\t\tUVIndex: *4 {
\t\t\t\ta: 3,2,1,0
\t\t\t}
\t\t}
\t}
\tModel: 2, "Model::Tri", "Mesh" {
\t\tProperties70:  {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",10,0,0
\t\t\t${extra}
\t\t}
\t}
\tMaterial: 3, "Material::Blue", "" {
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",0,0,1
\t\t}
\t}
}
Connections:  {
\tC: "OO",2,0
\tC: "OO",1,2
\tC: "OO",3,2
}
`;
  test('an ASCII file: units, Y-up to Z-up, translation, UV indices, material', () => {
    const [o] = importFBX(new TextEncoder().encode(ascii()));
    assert.equal(o.name, 'Tri');
    assert.equal(o.mesh.faces.length, 1);
    assert.deepEqual(o.mesh.faces[0], [0, 1, 2, 3]);
    assert.deepEqual(o.mesh.uvs[0][0], [0, 1]);
    assert.deepEqual(o.material.baseColor, [0, 0, 1]);
    // Y up: (x, y, z) → (x, −z, y). The vertex (0,1,0) in file units, moved 10 along X.
    const v = o.mesh.verts[3];
    near(v[0], 10);
    near(v[1], 0);
    near(v[2], 1);
  });
  test('Lcl Scaling with a negative value keeps the normals outward', () => {
    const [o] = importFBX(new TextEncoder().encode(ascii('P: "Lcl Scaling", "Lcl Scaling", "", "A",-1,1,1')));
    assert.deepEqual(o.mesh.faces[0], [3, 2, 1, 0]);
  });
  test('compressed arrays and the 64-bit node layout of FBX 7.5', () => {
    // A hand-made 7500 file: one geometry with zlib-compressed arrays.
    const enc = new TextEncoder();
    const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
    const cat = (...parts) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
    const str = (s) => { const b = enc.encode(s); const h = new Uint8Array(5); h[0] = 83; new DataView(h.buffer).setUint32(1, b.length, true); return cat(h, b); };
    const i64 = (n) => { const h = new Uint8Array(1); h[0] = 76; return cat(h, u64(n)); };
    const array = (kind, typed) => {
      const raw = new Uint8Array(typed.buffer);
      const packed = deflateSync(raw);
      const h = new Uint8Array(13);
      h[0] = kind.charCodeAt(0);
      const v = new DataView(h.buffer);
      v.setUint32(1, typed.length, true);
      v.setUint32(5, 1, true);
      v.setUint32(9, packed.length, true);
      return cat(h, packed);
    };
    const node = (at, name, props, kids = []) => {
      const nameBytes = enc.encode(name);
      const body = cat(...props);
      const headSize = 25 + nameBytes.length;
      let cursor = at + headSize + body.length;
      const built = [];
      for (const kid of kids) { const b = kid(cursor); built.push(b); cursor += b.length; }
      if (kids.length) cursor += 25;
      const end = cursor;
      return cat(u64(end), u64(props.length), u64(body.length), Uint8Array.of(nameBytes.length), nameBytes, body, ...built, kids.length ? new Uint8Array(25) : new Uint8Array(0));
    };
    const magic = new Uint8Array(27);
    magic.set(enc.encode('Kaydara FBX Binary  '), 0);
    magic[21] = 0x1a;
    new DataView(magic.buffer).setUint32(23, 7500, true);
    const objects2 = (at) => node(at, 'Objects', [], [(a) => node(a, 'Geometry', [i64(1), str('Solo\0\u0001Geometry'), str('Mesh')], [
      (b) => node(b, 'Vertices', [array('d', new Float64Array([0, 0, 0, 100, 0, 0, 0, 100, 0]))]),
      (b) => node(b, 'PolygonVertexIndex', [array('i', new Int32Array([0, 1, -3]))]),
    ])]);
    const first = objects2(27);
    const file = cat(magic, first, new Uint8Array(25));
    const [o] = importFBX(file);
    assert.equal(o.name, 'Solo');
    assert.deepEqual(o.mesh.faces, [[0, 1, 2]]);
    near(Math.hypot(...o.mesh.verts[1]), 1);
  });
  test('rubbish is a readable error', () => {
    assert.throws(() => importFBX(new TextEncoder().encode('hello there')), /Objects/);
  });
});

describe('Collada', () => {
  test('a round trip: shape, polygons, UVs, names, colours', () => {
    const mesh = cubeMesh(2);
    const back = importDAE(exportDAE([{ name: 'My Box & Co', mesh, material }]));
    assert.equal(back.length, 1);
    assert.equal(back[0].name, 'My Box & Co');
    sameShape(back[0].mesh, mesh);
    assert.ok(back[0].mesh.faces.every((f) => f.length === 4));
    assert.deepEqual(back[0].mesh.uvs[3], mesh.uvs[3]);
    assert.deepEqual(back[0].material.baseColor, [1, 0, 0]);
  });
  const file = (up, node) => `<?xml version="1.0"?>
<!-- A comment with <tags> inside -->
<COLLADA version="1.4.1"><asset><unit name="cm" meter="0.01"/><up_axis>${up}</up_axis></asset>
<library_geometries><geometry id="g"><mesh>
<source id="p"><float_array id="pa" count="9">0 0 0 100 0 0 0 100 0</float_array><technique_common><accessor source="#pa" count="3" stride="3"/></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
<triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node name="Parent">${node}</node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
  test('units, Y-up and nested node transforms', () => {
    const [o] = importDAE(file('Y_UP', '<translate>0 100 0</translate><node name="Child"><instance_geometry url="#g"/></node>'));
    assert.equal(o.name, 'Child');
    // In the file, vertex 2 is at (0, 100, 0) + the parent's (0, 100, 0) = 2 m up; Y up becomes Z up.
    near(o.mesh.verts[2][2], 2);
    near(o.mesh.verts[1][0], 1);
  });
  test('a full matrix and a rotation', () => {
    const [m] = importDAE(file('Z_UP', '<matrix>1 0 0 100 0 1 0 0 0 0 1 0 0 0 0 1</matrix><instance_geometry url="#g"/>'));
    near(m.mesh.verts[0][0], 1);
    const [r] = importDAE(file('Z_UP', '<rotate>0 0 1 90</rotate><instance_geometry url="#g"/>'));
    near(r.mesh.verts[1][1], 1);
  });
  test('the XML reader: attributes in either quotes, entities, self-closing tags, CDATA', () => {
    const root = parseXML(`<?xml version="1.0"?><a x="1" y='two &amp; three'><b/><c>text<![CDATA[<raw>]]></c></a>`);
    const a = root.children[0];
    assert.equal(a.attrs.x, '1');
    assert.equal(a.attrs.y, 'two & three');
    assert.equal(a.children[0].name, 'b');
    assert.equal(a.children[1].text, 'text<raw>');
  });
  test('not Collada: a readable error', () => {
    assert.throws(() => importDAE('<html></html>'), /Not a Collada/);
  });
});

describe('USD text', () => {
  test('a round trip: shape, polygons, UVs, names, colours', () => {
    const mesh = cubeMesh(2);
    const back = importUSDA(exportUSDA([{ name: 'Box', mesh, material }, { name: 'Box', mesh: cubeMesh(1) }]));
    assert.deepEqual(back.map((o) => o.name), ['Box', 'Box_1']);
    sameShape(back[0].mesh, mesh);
    assert.deepEqual(back[0].mesh.uvs[1], mesh.uvs[1]);
    assert.deepEqual(back[0].material.baseColor, [1, 0, 0]);
    assert.ok(back[0].mesh.faces.every((f) => f.length === 4));
  });
  const nested = `#usda 1.0
(
    defaultPrim = "World"
    metersPerUnit = 0.01
    upAxis = "Y"
)

def Xform "World"
{
    double3 xformOp:translate = (0, 200, 0)
    uniform token[] xformOpOrder = ["xformOp:translate"]

    def Mesh "Tri" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (100, 0, 0), (0, 100, 0)]
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (0, 1)] (
            interpolation = "vertex"
        )
        uniform token subdivisionScheme = "none"
    }
}
`;
  test('units, Y-up and a parent transform; vertex-interpolated UVs', () => {
    const [o] = importUSDA(nested);
    assert.equal(o.name, 'Tri');
    near(o.mesh.verts[2][2], 3);
    near(o.mesh.verts[1][0], 1);
    assert.deepEqual(o.mesh.uvs[0], [[0, 0], [1, 0], [0, 1]]);
    assert.equal(o.mesh.smooth, false);
  });
  test('binary files are named, not misread', () => {
    assert.throws(() => importUSDA(new TextEncoder().encode('PXR-USDC....')), /binary \.usdc/);
    assert.throws(() => importUSDA(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0])), /usdz/);
    assert.throws(() => importUSDA(new TextEncoder().encode('hello')), /Not a USD/);
  });
});

// ─────────────── a .blend written here, as the real thing lays it out

function blendFile({ layout, header = 'BLENDER-v400', compress = null, big = false }) {
  const types = ['char', 'short', 'int', 'float', 'void', 'ID', 'Object', 'Mesh', 'MVert', 'MPoly', 'MLoop', 'CustomData', 'CustomDataLayer', 'Material', 'Link'];
  const lens = [1, 2, 4, 4, 0, 66, 256, 512, 20, 12, 8, 16, 96, 64, 8];
  const names = [];
  const nameIndex = (n) => { if (!names.includes(n)) names.push(n); return names.indexOf(n); };
  const tid = (t) => types.indexOf(t);
  const structs = [
    ['ID', [['char', 'name[66]']]],
    ['Object', [['ID', 'id'], ['short', 'type'], ['short', 'rotmode'], ['void', '*data'], ['Object', '*parent'], ['float', 'loc[3]'], ['float', 'rot[3]'], ['float', 'size[3]'], ['float', 'parentinv[4][4]']]],
    ['MVert', [['float', 'co[3]'], ['short', 'no[3]'], ['char', 'flag'], ['char', 'bweight']]],
    ['MPoly', [['int', 'loopstart'], ['int', 'totloop'], ['short', 'mat_nr'], ['char', 'flag'], ['char', 'pad']]],
    ['MLoop', [['int', 'v'], ['int', 'e']]],
    ['CustomDataLayer', [['int', 'type'], ['char', 'name[68]'], ['void', '*data'], ['char', 'pad[16]']]],
    ['CustomData', [['CustomDataLayer', '*layers'], ['int', 'totlayer'], ['int', 'pad']]],
    ['Material', [['ID', 'id'], ['float', 'r'], ['float', 'g'], ['float', 'b'], ['float', 'pad']]],
    ['Mesh', [['ID', 'id'], ['int', 'totvert'], ['int', 'totpoly'], ['int', 'totloop'], ['short', 'totcol'], ['short', 'pad'], ['MVert', '*mvert'], ['MPoly', '*mpoly'], ['MLoop', '*mloop'], ['int', '*poly_offset_indices'], ['Material', '**mat'], ['CustomData', 'vdata'], ['CustomData', 'ldata']]],
  ];
  const size = (s) => {
    let at = 0;
    for (const [t, n] of s[1]) {
      const dims = [...n.matchAll(/\[(\d+)\]/g)].reduce((p, m) => p * Number(m[1]), 1);
      at += (n.startsWith('*') ? 8 : lens[tid(t)]) * dims;
    }
    return at;
  };
  for (const s of structs) lens[tid(s[0])] = size(s);
  const enc = new TextEncoder();
  const parts = [enc.encode(header)];
  if (big) parts[0] = enc.encode('BLENDER17-01v0502');
  const fieldOffset = (st, field) => {
    const s = structs.find((x) => x[0] === st);
    let at = 0;
    for (const [t, n] of s[1]) {
      const clean = n.replace(/^\*+/, '').replace(/\[.*$/, '');
      if (clean === field) return at;
      const dims = [...n.matchAll(/\[(\d+)\]/g)].reduce((p, m) => p * Number(m[1]), 1);
      at += (n.startsWith('*') ? 8 : lens[tid(t)]) * dims;
    }
    throw new Error(field);
  };
  let ptr = 0x1000n;
  const blocks = [];
  const block = (code, st, bytes, count = 1) => { const old = ptr; ptr += 0x1000n; blocks.push({ code, st: st ? structs.findIndex((x) => x[0] === st) : 0, bytes, old, count }); return old; };
  const f32 = (list) => new Uint8Array(new Float32Array(list).buffer);
  const i32 = (list) => new Uint8Array(new Int32Array(list).buffer);
  const obj = (name) => { const b = new Uint8Array(lens[tid('Object')]); b.set(enc.encode(name), 0); return b; };

  // A quad.
  const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1];
  const me = new Uint8Array(lens[tid('Mesh')]);
  const view = new DataView(me.buffer);
  me.set(enc.encode('MEQuad'), 0);
  view.setInt32(fieldOffset('Mesh', 'totvert'), 4, true);
  view.setInt32(fieldOffset('Mesh', 'totpoly'), 1, true);
  view.setInt32(fieldOffset('Mesh', 'totloop'), 4, true);
  view.setInt16(fieldOffset('Mesh', 'totcol'), 1, true);
  const put = (field, p) => view.setBigUint64(fieldOffset('Mesh', field), p, true);
  const custom = (field, layers) => {
    const bytes = new Uint8Array(lens[tid('CustomDataLayer')] * layers.length);
    const v = new DataView(bytes.buffer);
    layers.forEach((l, i) => {
      const base = i * lens[tid('CustomDataLayer')];
      v.setInt32(base, l.type, true);
      bytes.set(enc.encode(l.name), base + 4);
      v.setBigUint64(base + 72, l.pointer, true);
    });
    const p = block('DATA', 'CustomDataLayer', bytes, layers.length);
    const base = fieldOffset('Mesh', field);
    view.setBigUint64(base, p, true);
    view.setInt32(base + 8, layers.length, true);
  };
  if (layout === 'attributes') {
    custom('vdata', [{ type: 48, name: 'position', pointer: block('DATA', null, f32(positions)) }]);
    custom('ldata', [{ type: 27, name: '.corner_vert', pointer: block('DATA', null, i32([0, 1, 2, 3])) }, { type: 49, name: 'UVMap', pointer: block('DATA', null, f32(uv)) }]);
    put('poly_offset_indices', block('DATA', null, i32([0, 4])));
  } else {
    const mv = new Uint8Array(lens[tid('MVert')] * 4);
    positions.forEach((x, i) => new DataView(mv.buffer).setFloat32(Math.floor(i / 3) * lens[tid('MVert')] + (i % 3) * 4, x, true));
    put('mvert', block('DATA', 'MVert', mv, 4));
    const mp = new Uint8Array(lens[tid('MPoly')]);
    new DataView(mp.buffer).setInt32(fieldOffset('MPoly', 'totloop'), 4, true);
    put('mpoly', block('DATA', 'MPoly', mp, 1));
    const ml = new Uint8Array(lens[tid('MLoop')] * 4);
    [0, 1, 2, 3].forEach((v, i) => new DataView(ml.buffer).setInt32(i * lens[tid('MLoop')], v, true));
    put('mloop', block('DATA', 'MLoop', ml, 4));
  }
  const mat = new Uint8Array(lens[tid('Material')]);
  mat.set(enc.encode('MAPaint'), 0);
  new DataView(mat.buffer).setFloat32(fieldOffset('Material', 'r'), 0.25, true);
  new DataView(mat.buffer).setFloat32(fieldOffset('Material', 'g'), 0.5, true);
  new DataView(mat.buffer).setFloat32(fieldOffset('Material', 'b'), 0.75, true);
  const matPointer = block('MA', 'Material', mat);
  const slots = new Uint8Array(8);
  new DataView(slots.buffer).setBigUint64(0, matPointer, true);
  put('mat', block('DATA', null, slots));
  const mePointer = block('ME', 'Mesh', me);

  const object = (name, { loc = [0, 0, 0], rot = [0, 0, 0], size: scale = [1, 1, 1], parent = 0n, type = 1, data = mePointer, rotmode = 1 }) => {
    const b = obj(`OB${name}`);
    const v = new DataView(b.buffer);
    v.setInt16(fieldOffset('Object', 'type'), type, true);
    v.setInt16(fieldOffset('Object', 'rotmode'), rotmode, true);
    v.setBigUint64(fieldOffset('Object', 'data'), data, true);
    v.setBigUint64(fieldOffset('Object', 'parent'), parent, true);
    b.set(f32(loc), fieldOffset('Object', 'loc'));
    b.set(f32(rot), fieldOffset('Object', 'rot'));
    b.set(f32(scale), fieldOffset('Object', 'size'));
    b.set(f32([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), fieldOffset('Object', 'parentinv'));
    return block('OB', 'Object', b);
  };
  const root = object('Root', { loc: [10, 0, 0], type: 0, data: 0n });
  object('Quad', { loc: [0, 5, 0], rot: [0, 0, Math.PI / 2], size: [2, 2, 2], parent: root });
  object('Camera', { type: 11, data: 0n });

  // The struct table.
  const pad4 = (list) => { const total = list.reduce((s, p) => s + p.length, 0); return total % 4 ? [...list, new Uint8Array(4 - (total % 4))] : list; };
  const zstr = (s) => { const b = new Uint8Array(s.length + 1); b.set(enc.encode(s), 0); return b; };
  const strc = [];
  for (const [name, fields] of structs) {
    strc.push(new Uint8Array(new Int16Array([tid(name), fields.length]).buffer));
    for (const [t, n] of fields) strc.push(new Uint8Array(new Int16Array([tid(t), nameIndex(n)]).buffer));
  }
  const nameBytes = names.map(zstr);
  const typeBytes = types.map(zstr);
  const dna = [
    enc.encode('SDNA'), enc.encode('NAME'), i32([names.length]), ...pad4(nameBytes),
    enc.encode('TYPE'), i32([types.length]), ...pad4(typeBytes),
    enc.encode('TLEN'), ...pad4([new Uint8Array(new Int16Array(lens).buffer)]),
    enc.encode('STRC'), i32([structs.length]), ...strc,
  ];
  // NAME's table is aligned from the block's start: its header takes 12 bytes, a multiple of 4, so padding the strings is enough.
  const dnaBytes = new Uint8Array(dna.reduce((s, p) => s + p.length, 0));
  { let o = 0; for (const p of dna) { dnaBytes.set(p, o); o += p.length; } }
  blocks.push({ code: 'DNA1', st: 0, bytes: dnaBytes, old: 1n, count: 1 });
  blocks.push({ code: 'ENDB', st: 0, bytes: new Uint8Array(0), old: 0n, count: 0 });
  for (const b of blocks) {
    const code = new Uint8Array(4);
    code.set(enc.encode(b.code), 0);
    if (big) {
      const h = new Uint8Array(32);
      h.set(code, 0);
      const v = new DataView(h.buffer);
      v.setUint32(4, b.st, true);
      v.setBigUint64(8, b.old, true);
      v.setBigInt64(16, BigInt(b.bytes.length), true);
      v.setBigInt64(24, BigInt(b.count), true);
      parts.push(h, b.bytes);
    } else {
      const h = new Uint8Array(24);
      h.set(code, 0);
      const v = new DataView(h.buffer);
      v.setUint32(4, b.bytes.length, true);
      v.setBigUint64(8, b.old, true);
      v.setUint32(16, b.st, true);
      v.setUint32(20, b.count, true);
      parts.push(h, b.bytes);
    }
  }
  const file = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  { let o = 0; for (const p of parts) { file.set(p, o); o += p.length; } }
  return compress ? compress(file) : file;
}

describe('.blend', () => {
  const check = (bytes, withUv) => {
    const list = importBlend(bytes);
    assert.deepEqual(list.map((o) => o.name), ['Quad'], 'only mesh objects; the empty parent and the camera are not meshes');
    const { mesh, material: mat } = list[0];
    assert.deepEqual(mesh.faces, [[0, 1, 2, 3]]);
    // Scale 2, a quarter turn about Z, moved 5 along Y, under a parent moved 10 along X.
    near(mesh.verts[0][0], 10);
    near(mesh.verts[0][1], 5);
    near(mesh.verts[1][0], 10, 1e-4);
    near(mesh.verts[1][1], 7, 1e-4);
    near(mesh.verts[3][0], 8, 1e-4);
    near(mesh.verts[3][1], 5, 1e-4);
    assert.equal(mat.name, 'Paint');
    near(mat.baseColor[2], 0.75);
    if (withUv) assert.deepEqual(mesh.uvs[0][2], [1, 1]);
  };
  test('the old layout (MVert, MPoly, MLoop), as Blender 2.63 to 3.4 write it', () => check(blendFile({ layout: 'legacy', header: 'BLENDER-v276' }), false));
  test('the attribute layout, as Blender 3.6 and 4.x write it', () => check(blendFile({ layout: 'attributes' }), true));
  test('the 64-bit block headers of Blender 5', () => check(blendFile({ layout: 'attributes', big: true }), true));
  test('gzip-compressed files open', () => check(blendFile({ layout: 'legacy', compress: gzipSync }), false));
  test('a Zstandard stream decodes to what went in', () => {
    // Node's own encoder, at several levels: long matches, repeats and literals.
    const plain = new Uint8Array(200000);
    for (let i = 0; i < plain.length; i++) plain[i] = (i % 97 === 0 ? (i * 31) & 255 : (i >> 3) & 255) ^ (i % 1000 < 50 ? (Math.imul(i, 2654435761) >>> 24) : 0);
    for (const level of [1, 3, 9, 19]) {
      const packed = new Uint8Array(zstdCompressSync(plain, { params: { [zlibConstants.ZSTD_c_compressionLevel]: level } }));
      assert.ok(isZstd(packed), 'the magic number');
      assert.equal(Buffer.from(zstdDecompress(packed)).equals(Buffer.from(plain)), true, `level ${level}`);
    }
    // Several frames join, and a skippable frame between them is passed over.
    const a = zstdCompressSync(Buffer.from('first ')); const b = zstdCompressSync(Buffer.from('second'));
    const skip = Buffer.from([0x50, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, 9, 9, 9]);
    assert.equal(Buffer.from(zstdDecompress(new Uint8Array(Buffer.concat([a, skip, b])))).toString(), 'first second');
  });
  test('the version is read from the header', () => {
    assert.equal(blendVersion(blendFile({ layout: 'legacy', header: 'BLENDER-v276' })), 276);
    assert.equal(blendVersion(blendFile({ layout: 'attributes', big: true })), 502);
  });
  test('anything else is a readable error', () => {
    assert.throws(() => importBlend(new TextEncoder().encode('NOT A BLEND FILE AT ALL')), /Not a \.blend/);
  });
});

describe('append', () => {
  test('objects come over with materials, images, parents and modifier targets, under fresh ids', () => {
    const source = createDefaultScene();
    const mat = defaultMaterial('Shiny');
    mat.useNodes = true;
    mat.nodes = { kind: 'SHADER', nodes: [createNode('TEX_IMAGE', 0, 0, { image: 'imgA' })], links: [] };
    source.materials.push(mat);
    source.images.push({ id: 'imgA', name: 'A', dataUrl: 'data:image/png;base64,AAAA' });
    source.images.push({ id: 'imgB', name: 'unused', dataUrl: 'data:image/png;base64,BBBB' });
    const parent = addObject(source, { type: 'EMPTY', name: 'Holder' });
    const child = addObject(source, { type: 'MESH', name: 'Part', data: cubeMesh(1), parent: parent.id, materials: [mat.id], modifiers: [{ type: 'BOOLEAN', object: parent.id }] });
    const target = createDefaultScene();
    const countBefore = target.objects.length;
    const added = appendDocument(target, deserialize(serialize(source)), { name: 'Library' });
    assert.equal(target.objects.length, countBefore + source.objects.length);
    const part = added.find((o) => o.name === 'Part');
    const holder = added.find((o) => o.name === 'Holder');
    assert.notEqual(part.id, child.id);
    assert.equal(part.parent, holder.id);
    assert.equal(part.modifiers[0].object, holder.id);
    assert.equal(getObject(target, part.parent).name, 'Holder');
    const newMat = target.materials.find((m) => m.id === part.materials[0]);
    assert.equal(newMat.name, 'Shiny');
    const image = target.images.find((i) => i.id === newMat.nodes.nodes[0].values.image);
    assert.equal(image.name, 'A');
    assert.equal(target.images.some((i) => i.name === 'unused'), false, 'only what is used comes along');
    assert.equal(target.collections.at(-1).name, 'Library');
    assert.equal(part.collection, target.collections.at(-1).id);
  });
  test('names that are taken get a number; `only` picks objects', () => {
    const target = createDefaultScene();
    const added = appendDocument(target, createDefaultScene(), { only: ['Cube'] });
    assert.deepEqual(added.map((o) => o.name), ['Cube.001']);
  });
  test('the source is not changed', () => {
    const source = createDefaultScene();
    const text = serialize(source);
    appendDocument(createDefaultScene(), source);
    assert.equal(serialize(source), text);
  });
});

describe('Alembic', () => {
  const placed = (m, [x, y, z]) => ({ ...m, verts: m.verts.map((v) => [v[0] + x, v[1] + y, v[2] + z]) });
  const scene = () => [{ name: 'Box', mesh: placed(cubeMesh(2), [1, 2, 3]) }, { name: 'Ring', mesh: placed(torusMesh(12, 6, 2, 0.5), [-4, 0, 1]) }];
  test('round trip keeps names, shape, place and the way faces turn', () => {
    const list = importABC(exportABC(scene()));
    assert.deepEqual(list.map((o) => o.name), ['Box', 'Ring']);
    scene().forEach((want, i) => {
      assert.equal(list[i].mesh.faces.length, want.mesh.faces.length);
      assert.equal(list[i].mesh.verts.length, want.mesh.verts.length);
      list[i].mesh.verts.forEach((v, k) => v.forEach((c, j) => assert.ok(Math.abs(c - want.mesh.verts[k][j]) < 1e-5)));
      assert.ok(Math.abs(signedVolume(list[i].mesh) - signedVolume(want.mesh)) < 1e-3, 'the same volume, with the same sign');
    });
  });
  test('UVs stay with their face corners', () => {
    const box = cubeMesh(2);
    box.uvs = box.faces.map((f, i) => f.map((_, k) => [i / 10, k / 10]));
    const [back] = importABC(exportABC([{ name: 'Box', mesh: box }]));
    box.faces.forEach((face, i) => {
      const found = back.mesh.faces[i];
      face.forEach((v, k) => {
        const at = found.indexOf(v);
        assert.ok(Math.abs(back.mesh.uvs[i][at][0] - box.uvs[i][k][0]) < 1e-6 && Math.abs(back.mesh.uvs[i][at][1] - box.uvs[i][k][1]) < 1e-6);
      });
    });
  });
  test('the file is an Ogawa archive marked complete', () => {
    const bytes = exportABC(scene());
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), 'Ogawa');
    assert.equal(bytes[5], 0xff);
  });
  test('what is not Alembic is refused with a reason', () => {
    assert.throws(() => importABC(new Uint8Array(40)), /Not an Alembic/);
    assert.throws(() => importABC(Uint8Array.of(0x89, 0x48, 0x44, 0x46, 13, 10, 26, 10, ...new Array(30).fill(0))), /HDF5/);
  });
});
describe('glTF node transforms', () => {
  test('rotation and a parent both count', () => {
    const glb = exportGLB([{ name: 'A', mesh: cubeMesh(2) }]);
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
    // A quarter turn about glTF's Y (this program's Z), under a parent moved along glTF's X.
    json.nodes[0].rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    json.nodes[0].scale = [1, 3, 1];
    json.nodes.push({ name: 'Parent', translation: [10, 0, 0], children: [0] });
    json.scenes[0].nodes = [json.nodes.length - 1];
    const text = new TextEncoder().encode(JSON.stringify(json));
    const pad = new Uint8Array((4 - (text.length % 4)) % 4).fill(32);
    const rest = glb.subarray(20 + jsonLength);
    const out = new Uint8Array(20 + text.length + pad.length + rest.length);
    out.set(glb.subarray(0, 12));
    const v = new DataView(out.buffer);
    v.setUint32(8, out.length, true);
    v.setUint32(12, text.length + pad.length, true);
    v.setUint32(16, 0x4e4f534a, true);
    out.set(text, 20);
    out.set(pad, 20 + text.length);
    out.set(rest, 20 + text.length + pad.length);
    const [o] = importGLB(out);
    const xs = o.mesh.verts.map((p) => p[0]);
    assert.ok(Math.abs(Math.min(...xs) - 9) < 1e-5 && Math.abs(Math.max(...xs) - 11) < 1e-5, 'moved by the parent');
    const zs = o.mesh.verts.map((p) => p[2]);
    assert.ok(Math.abs(Math.max(...zs) - 3) < 1e-5, 'stretched along the height');
    assert.ok(signedVolume(o.mesh) > 0, 'faces outward');
  });
});
describe('USD metadata', () => {
  test('braces in the metadata of a prim are not its body, and a shape goes by the name of its transform', () => {
    const text = `#usda 1.0
(
    defaultPrim = "root"
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "root" (
    customData = {
        dictionary Blender = {
            bool generated = 1
        }
    }
)
{
    def Xform "Named"
    {
        double3 xformOp:translate = (0, 0, 5)
        uniform token[] xformOpOrder = ["xformOp:translate"]
        def Mesh "Cube" (
            active = true
        )
        {
            int[] faceVertexCounts = [3]
            int[] faceVertexIndices = [0, 1, 2]
            point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        }
    }
}
`;
    const [o] = importUSDA(new TextEncoder().encode(text));
    assert.equal(o.name, 'Named');
    assert.equal(o.mesh.verts[0][2], 5);
  });
});
