// The browser-side model: result container, units, project data and jobs, the catalog and its texts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeResult } from '../../src/sim/decode.js';
import { factor, fmt, toDisplay, toSI, unitLabel, KINDS, SYSTEMS as UNIT_SYSTEMS } from '../../src/sim/units.js';
import { addBc, addBody, addSystem, buildJob, createProject, packProject, pathGet, pathSet, unpackProject, outputsOf } from '../../src/sim/project.js';
import { BCS, RESULTS, SYSTEMS, SYSTEM_IDS, FOLLOW_UPS, defaultSettings } from '../../src/sim/catalog.js';
import { TEMPLATES, bodyNode, nodeBox, parseStl, writeStl } from '../../src/sim/shapes.js';
import { MATERIALS, MATERIAL_FIELDS } from '../../src/sim/materials.js';
import { ko, en } from '../../src/i18n/sim.js';
import { solve } from './wasm-helper.mjs';

test('result container decodes typed arrays', () => {
  const json = new TextEncoder().encode(JSON.stringify({ a: 1, v: { $f32: 0, n: 2 }, i: { $u32: 8, n: 1 } }));
  const pad = (4 - (json.length % 4)) % 4;
  const buf = new Uint8Array(8 + json.length + pad + 12);
  buf.set([83, 73, 77, 49]);
  new DataView(buf.buffer).setUint32(4, json.length + pad, true);
  buf.set(json, 8);
  buf.fill(32, 8 + json.length, 8 + json.length + pad);
  const blobs = new DataView(buf.buffer, 8 + json.length + pad);
  blobs.setFloat32(0, 1.5, true); blobs.setFloat32(4, -2, true); blobs.setUint32(8, 7, true);
  const r = decodeResult(buf.buffer);
  assert.equal(r.a, 1);
  assert.deepEqual([...r.v], [1.5, -2]);
  assert.deepEqual([...r.i], [7]);
  assert.throws(() => decodeResult(new Uint8Array(8).buffer));
});

test('units convert both ways and label in both systems', () => {
  assert.equal(toDisplay('stress', 2e8, 'mm'), 200);
  assert.equal(toSI('stress', 200, 'mm'), 2e8);
  assert.equal(toDisplay('displacement', 0.001, 'mm'), 1);
  assert.equal(unitLabel('stress', 'si'), 'Pa');
  for (const k of Object.keys(KINDS)) assert.ok(factor(k, 'mm') > 0 && factor(k, 'si') > 0, k);
  assert.equal(fmt(0), '0');
  assert.equal(fmt(1234.5678), '1235');
  assert.equal(fmt(123456.7), '123,500');
  assert.match(fmt(1.5e-7), /e-7$/);
});

test('every unit system converts every kind both ways (temperatures with their offset)', () => {
  for (const sys of UNIT_SYSTEMS) {
    for (const k of Object.keys(KINDS)) {
      assert.ok(factor(k, sys) > 0, `${sys} ${k}`);
      assert.ok(Math.abs(toSI(k, toDisplay(k, 123.4, sys), sys) - 123.4) < 1e-9 * 123.4, `${sys} ${k} round trip`);
    }
  }
  assert.ok(Math.abs(toDisplay('temperature', 100, 'us') - 212) < 1e-9);
  assert.ok(Math.abs(toDisplay('temperature', 0, 'siK') - 273.15) < 1e-9);
  assert.ok(Math.abs(toDisplay('stress', 6.894757e6, 'us') - 1000) < 0.01);
  assert.equal(unitLabel('length', 'cgs'), 'cm');
  assert.ok(Math.abs(toDisplay('length', 0.0254, 'us') - 1) < 1e-5);
});

test('every system, condition and result is complete and translated', () => {
  for (const id of SYSTEM_IDS) {
    const s = SYSTEMS[id];
    for (const b of s.bcs) assert.ok(BCS[b], `${id}: condition ${b}`);
    for (const q of s.results) assert.ok(RESULTS[q], `${id}: result ${q}`);
    for (const key of [`sys.${id}`, `sysDesc.${id}`, ...s.settings.map((f) => `set.${f.key}`), ...s.results.map((q) => `res.${q}`), ...(s.outputs ?? []).map((o) => `out.${o}`)]) {
      assert.ok(ko[key] && en[key], `text ${key}`);
    }
    for (const f of s.settings) if (f.type === 'select' && Array.isArray(f.options)) for (const o of f.options) assert.ok(ko[`opt.${o}`] && en[`opt.${o}`], `option ${o}`);
    for (const f of FOLLOW_UPS[id] ?? []) assert.ok(SYSTEMS[f], `follow-up ${f}`);
  }
  for (const [id, b] of Object.entries(BCS)) {
    assert.ok(ko[`bc.${id}`] && en[`bc.${id}`] && ko[`bcDesc.${id}`] && en[`bcDesc.${id}`], `bc ${id}`);
    for (const f of b.fields) assert.ok(ko[`bcf.${f.key}`] && en[`bcf.${f.key}`], `field ${f.key}`);
  }
  for (const id of Object.keys(TEMPLATES)) { assert.ok(ko[`tpl.${id}`] && en[`tpl.${id}`], `template ${id}`); for (const p of TEMPLATES[id].params) assert.ok(ko[`param.${p.key}`] && en[`param.${p.key}`], `param ${p.key}`); }
  for (const [k] of MATERIAL_FIELDS) assert.ok(ko[`mat.${k}`] && en[`mat.${k}`], `material field ${k}`);
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
});

test('every template makes a body the solver meshes', () => {
  const p = createProject('t');
  let x = 0;
  for (const id of Object.keys(TEMPLATES).filter((k) => k !== 'stl')) {
    const b = addBody(p, id, { position: [x, 0, 0] });
    const box = nodeBox(bodyNode(b));
    x += box[1][0] - box[0][0] + 50;
  }
  const s = addSystem(p, 'static');
  const job = buildJob(p, s, { analysis: 'mesh', preview: true });
  const r = solve(job);
  const bodies = new Set(r.mesh.faces.map((f) => f.body));
  for (const b of p.bodies) assert.ok(bodies.has(b.id), `${b.template} meshed`);
});

test('project: jobs, paths, save and reopen', () => {
  const p = createProject('Demo');
  const b = addBody(p, 'box', { params: { width: 100, depth: 10, height: 10 }, position: [50, 0, 0] });
  const s = addSystem(p, 'static');
  addBc(s, 'fixed', { faces: [{ body: b.id, c: [0, 0, 0], n: [-1, 0, 0], a: 100 }] });
  addBc(s, 'force', { vector: [0, 0, -100], faces: [{ body: b.id, c: [100, 0, 0], n: [1, 0, 0], a: 100 }] });
  const job = buildJob(p, s);
  assert.equal(job.analysis, 'static');
  assert.equal(job.unit, 0.001);
  assert.equal(job.bcs.length, 2);
  assert.ok(job.materials.steel.young > 1e11);
  pathSet(p, `bodies.${b.id}.params.width`, 120);
  assert.equal(pathGet(p, `bodies.${b.id}.params.width`), 120);
  pathSet(p, `systems.${s.id}.bcs.${s.bcs[1].id}.vector.2`, -50);
  assert.equal(s.bcs[1].vector[2], -50);
  s.result = { big: true };
  s.status = 'solved';
  const back = unpackProject(packProject(p));
  assert.equal(back.systems[0].result, undefined);
  assert.equal(back.systems[0].status, 'outdated');
  assert.equal(back.bodies[0].params.width, 120);
  assert.throws(() => unpackProject('{"format":"other"}'));
  const r = solve(buildJob(p, s));
  const out = outputsOf(s, r);
  // Tip deflection of a 120 mm cantilever, 10×10 mm, 50 N: F L³ / (3 E I) = 0.173 mm (steel).
  assert.ok(Math.abs(out.maxDisplacement * 1000 - 0.1728) < 0.02, `deflection ${out.maxDisplacement}`);
  for (const id of SYSTEM_IDS) assert.ok(typeof defaultSettings(id) === 'object');
});

test('STL round trip', () => {
  const tris = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const bytes = writeStl(tris);
  const back = parseStl(bytes);
  assert.equal(back.length, tris.length);
  assert.ok(back.every((v, i) => Math.abs(v - tris[i]) < 1e-6));
  const text = `solid t\n${[0, 1, 2, 3].map((k) => `facet normal 0 0 1\nouter loop\n${[0, 1, 2].map((j) => `vertex ${tris.slice(9 * k + 3 * j, 9 * k + 3 * j + 3).join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid`;
  assert.equal(parseStl(new TextEncoder().encode(text)).length, 36);
  assert.equal(MATERIALS.length, 21);
});
