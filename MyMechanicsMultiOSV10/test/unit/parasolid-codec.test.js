// The Parasolid XT node stream (src/cad/parasolid.js), without a kernel: the format reference's own example file
// (§2.1.4.5, a sheet circle with a colour attribute) read field by field; nodes written as text and as neutral
// binary and read back; records that never end in a space; embedded-schema files (an edited base layout and a
// type the base does not have); broken files refused with a code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readXt, writeXt, BASE_SCHEMA, NODE } from '../../src/cad/parasolid.js';

// The reference's example, with its annotations removed. Lines may begin with a space; none ends in one.
const EXAMPLE = [
  '**ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz************',
  '**PARASOLID !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~0123456789************',
  '**PART1;MC=osf65;MC_MODEL=alpha;MC_ID=sdlosf6;OS=OSF1;OS_RELEASE=V4.0;FRU=sdl_par',
  'asolid_test_osf64;APPL=unknown;SITE=sdl-cambridge-',
  'u.k.;USER=davidj;FORMAT=text;GUISE=transmit;DATE=29-mar-2000;',
  '**PART2;SCH=SCH_1200000_12006;USFLD_SIZE=0;',
  '**PART3;',
  '**END_OF_HEADER***************************************************',
  'T51 : TRANSMIT FILE created by modeller version 120000017 SCH_1200000_120060',
  ' 12 1 12 0 2 0 0 0 0 1e3 1e-8 0 0 0 1 0 3 1 3 4 5 0 6 7 0',
  ' 70 2 0 1 0 0 4 1 20 8 8 8 1 T',
  '13 3 3 0 1 0 9 0 0 6 9',
  ' 50 4 11 0 9 0 0 0 +0 0 0 0 0 1 1 0 0',
  ' 31 5 10 0 7 0 0 0 +0 0 0 0 0 1 1 0 0 1',
  ' 19 6 5 0 1 0 0 3 V',
  '16 7 6 0 ?10 0 0 5 0 0 1',
  ' 17 10 0 11 10 10 0 12 7 0 0 +',
  '15 11 7 0 10 9 0',
  ' 17 12 0 0 0 0 0 10 7 0 0 -',
  '14 9 2 13 ?0 0 11 3 4 +0 0 0 0 3',
  ' 81 1 13 12 14 9 0 0 0 0 15',
  ' 80 1 14 0 16 8001 0 0 0 0 3 5 0 0 FFFFTFTFFFFFF2',
  ' 83 3 15 1 2 3',
  ' 79 15 16 SDL/TYSA_COLOUR74 20 8 1 0 13 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
  ' 1 0',
].join('\r\n');

test('the format reference example: a sheet body of one circular face, read field by field', () => {
  const x = readXt(EXAMPLE);
  assert.equal(x.schema.key, 'SCH_1200000_12006');
  assert.equal(x.version, ': TRANSMIT FILE created by modeller version 1200000');
  assert.equal(x.keywords.FORMAT, 'text');
  assert.equal(x.keywords.SCH, 'SCH_1200000_12006');
  assert.equal(x.nodes.size, 16, 'sixteen nodes');
  const body = x.root;
  assert.equal(body.type, NODE.BODY);
  assert.deepEqual([body.res_size, body.res_linear, body.body_type, body.shell, body.region, body.edge], [1000, 1e-8, 3, 3, 6, 7]);
  const plane = x.nodes.get(4);
  assert.equal(plane.type, NODE.PLANE);
  assert.deepEqual([plane.sense, plane.pvec, plane.normal, plane.x_axis], ['+', [0, 0, 0], [0, 0, 1], [1, 0, 0]]);
  const circle = x.nodes.get(5);
  assert.deepEqual([circle.type, circle.centre, circle.radius], [NODE.CIRCLE, [0, 0, 0], 1]);
  const region = x.nodes.get(6);
  assert.deepEqual([region.type, region.shell, region.region_type], [NODE.REGION, 3, 'V'], 'a void region (its own type field kept apart)');
  const edge = x.nodes.get(7);
  assert.deepEqual([edge.tolerance, edge.halfedge, edge.curve, edge.owner], [null, 10, 5, 1], 'an unset tolerance reads as null');
  const fin = x.nodes.get(10); const dummy = x.nodes.get(12);
  assert.deepEqual([fin.loop, fin.forward, fin.backward, fin.other, fin.edge, fin.sense], [11, 10, 10, 12, 7, '+']);
  assert.deepEqual([dummy.loop, dummy.other, dummy.sense], [0, 10, '-'], 'the dummy fin');
  const face = x.nodes.get(9);
  assert.deepEqual([face.loop, face.shell, face.surface, face.sense, face.front_shell], [11, 3, 4, '+', 3]);
  assert.equal(x.nodes.get(16).string, 'SDL/TYSA_COLOUR', 'a character array');
  assert.deepEqual(x.nodes.get(15).values, [1, 2, 3], 'the colour');
  assert.deepEqual(x.nodes.get(8).entries.slice(0, 2), [13, 0], 'a pointer list block');
  assert.equal(x.nodes.get(14).legal_owners.length, 13, 'V12 attribute definitions have 13 owner flags');
});

/** A few nodes of every field type the writer meets. */
function sample() {
  return [
    { type: NODE.BODY, index: 1, highest_node_id: 5, res_size: 1000, res_linear: 1e-8, state: 1, body_type: 1, nom_geom_state: 1, shell: 2, region: 3 },
    { type: NODE.SHELL, index: 2, node_id: 1, body: 1, region: 3 },
    { type: NODE.REGION, index: 3, node_id: 2, body: 1, shell: 2, region_type: 'S' },
    { type: NODE.CYLINDER, index: 4, node_id: 3, sense: '-', pvec: [0.001, -2.5e-7, 123.456789012345], axis: [0, 0, 1], radius: 0.0125, x_axis: [1, 0, 0] },
    { type: NODE.KNOT_SET, index: 5, knots: [0, 0.25, 1 / 3, 1] },
    { type: NODE.KNOT_MULT, index: 6, mult: [4, 1, 1, 4] },
    { type: 79, index: 7, string: 'MY\\NAME 9' },
    { type: NODE.FACE, index: 8, node_id: 4, tolerance: null, sense: '+', shell: 2, surface: 4 },
  ];
}

test('nodes written as text read back the same, and no record ends in a space', () => {
  const text = writeXt(sample(), { file: 'part.x_t', date: new Date(2026, 10, 23) });
  assert.match(text, /^\*\*ABCDEFGHIJ/);
  assert.match(text, /\*\*PART2;SCH=SCH_1300000_13006;USFLD_SIZE=0;/);
  assert.deepEqual([readXt(text).keywords.DATE, readXt(text).keywords.FILE, readXt(text).keywords.APPL], ['23-nov-2026', 'part.x_t', 'MyMechanics'], 'header keywords (records may break a keyword)');
  for (const line of text.split('\n')) { assert.ok(line.length <= 80, `record of ${line.length}`); assert.ok(!line.endsWith(' '), `trailing space: "${line}"`); }
  const x = readXt(text);
  assert.equal(x.schema.key, 'SCH_1300000_13006');
  const cyl = x.nodes.get(4);
  assert.deepEqual([cyl.sense, cyl.pvec, cyl.radius], ['-', [0.001, -2.5e-7, 123.456789012345], 0.0125], 'reals exactly');
  assert.deepEqual(x.nodes.get(5).knots, [0, 0.25, 1 / 3, 1]);
  assert.deepEqual(x.nodes.get(6).mult, [4, 1, 1, 4]);
  assert.equal(x.nodes.get(7).string, 'MY\\NAME 9', 'a backslash escaped and back');
  assert.equal(x.nodes.get(8).tolerance, null);
  assert.deepEqual([x.nodes.get(3).shell, x.nodes.get(3).region_type], [2, 'S']);
  // Through \r\n line ends too.
  assert.deepEqual(readXt(text.replace(/\n/g, '\r\n')).nodes.get(4).pvec, cyl.pvec);
});

test('nodes written as neutral binary read back the same; large indices use two shorts', () => {
  const nodes = sample();
  nodes.push({ type: NODE.POINT, index: 40000, node_id: 9, owner: 70000, pvec: [1, 2, 3] });
  const bin = writeXt(nodes, { binary: true });
  assert.ok(bin instanceof Uint8Array);
  assert.deepEqual([...bin.slice(0, 4)], [0x50, 0x53, 0, 0], 'PS 0 0: neutral binary');
  const x = readXt(bin);
  assert.equal(x.binary, true);
  assert.deepEqual(x.nodes.get(4).pvec, [0.001, -2.5e-7, 123.456789012345]);
  assert.equal(x.nodes.get(8).tolerance, null, 'the null real');
  assert.equal(x.nodes.get(7).string, 'MY\\NAME 9');
  const p = x.nodes.get(40000);
  assert.deepEqual([p.owner, p.pvec], [70000, [1, 2, 3]]);
});

test('an embedded-schema file: an unchanged type (255), an edited type, and a type outside the base', () => {
  // Region gains an appended "owner" pointer; type 204 (intersection data) is declared in full.
  const stream = [
    'T51 : TRANSMIT FILE created by modeller version 300000023 SCH_3000000_30000_13006300 0',
    ' 19 8 CCCCCCCA5 owner1012 0 Z3 7 0 0 0 0 0 V9',
    ' 29 255 4 8 0 0 0 0 1 2 3',
    ' 204 2 17 INTERSECTION_DATA4 Data7 uv_type0 0 1 u6 values0 1 1 fT2 5 1 1.5 2.5',
    ' 19 9 2 0 0 0 0 0 S0',
    ' 1 0',
  ].join('\n');
  const x = readXt(stream);
  assert.equal(x.schema.base, 13006);
  const r = x.nodes.get(3);
  assert.deepEqual([r.type, r.node_id, r.region_type, r.owner], [19, 7, 'V', 9]);
  assert.equal(x.nodes.get(4).pvec.join(), '1,2,3');
  assert.deepEqual(x.nodes.get(5).values, [1.5, 2.5], 'the declared variable-length field');
  assert.equal(x.nodes.get(9).owner, 0, 'a second region uses the edited layout without a schema');
});

test('broken files are refused with a code', () => {
  assert.throws(() => readXt('nothing here'), (e) => e.code === 'xt-read');
  assert.throws(() => readXt('T5 : abc17 SCH_1300000_130060 12 1 3'), (e) => e.code === 'xt-read', 'cut short');
  assert.throws(() => readXt('T5 : abc8 SCH_oops0 '), (e) => e.code === 'xt-schema');
  assert.throws(() => readXt('T5 : abc17 SCH_1300000_130060 250 1 0 1 0'), (e) => e.code === 'xt-schema', 'an unknown node type');
  assert.ok(BASE_SCHEMA[NODE.BODY].length === 23, 'the base body has 23 fields');
});
