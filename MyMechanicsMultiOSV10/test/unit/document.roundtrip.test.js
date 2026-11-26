// Every sample project survives save → open: packProject → unpackProject keeps each part's feature list,
// each assembly's components and mates, each drawing's views, sheets and annotations, the project's name,
// units, up axis and active document — and saving the opened project again gives the same file. For a
// representative pair of samples per start-page group the reopened parts also rebuild to the same geometry
// (volume, bounding box, face count, every feature ok) and assemblies solve to the same placements.
// (Regenerating all 75+ samples twice would take minutes; samples.test.js builds every one already.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { SAMPLES, SAMPLE_GROUPS, buildSample } from '../../src/cad/samples.js';
import { regenerate } from '../../src/cad/features.js';
import { solveMates } from '../../src/cad/assembly.js';
import { packProject, unpackProject, documentsOf, findDocument } from '../../src/cad/document.js';

await loadKernel();
const R = rep();

/** JSON with object keys sorted, so key order (defaults spread first on open) does not matter. */
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const plain = (v) => JSON.parse(JSON.stringify(v));
const withoutSaved = (text) => { const o = JSON.parse(text); delete o.saved; return canon(o); };

const cache = new Map();
/** The sample built once, its file text and the project opened from it. */
function loaded(id) {
  if (!cache.has(id)) {
    const project = buildSample(id, 'en');
    const text = packProject(project);
    cache.set(id, { project, text, again: unpackProject(text) });
  }
  return cache.get(id);
}

test('there are 75 or more samples, each in a known group, with unique ids', () => {
  assert.ok(SAMPLES.length >= 75, `${SAMPLES.length} samples`);
  assert.equal(new Set(SAMPLES.map((s) => s.id)).size, SAMPLES.length);
  const groups = new Set(SAMPLE_GROUPS.map((g) => g.id));
  assert.deepEqual(SAMPLES.filter((s) => !groups.has(s.group)).map((s) => s.id), []);
});

for (const sample of SAMPLES) {
  const id = sample.id;
  test(`${id}: the file is JSON of format mymechanics`, () => {
    const { text } = loaded(id);
    const raw = JSON.parse(text);
    assert.equal(raw.format, 'mymechanics');
    assert.ok(raw.saved, 'saved time stamp');
  });
  test(`${id}: reopened, the same documents in the same tab order`, () => {
    const { project, again } = loaded(id);
    assert.deepEqual(documentsOf(again).map((d) => `${d.kind}:${d.doc.id}:${d.doc.name}`), documentsOf(project).map((d) => `${d.kind}:${d.doc.id}:${d.doc.name}`));
  });
  test(`${id}: reopened, every part keeps its exact feature list`, () => {
    const { project, again } = loaded(id);
    for (const part of project.parts) {
      const other = again.parts.find((p) => p.id === part.id);
      assert.ok(other, part.name);
      assert.deepEqual(other.features.map((f) => `${f.type}:${f.id}:${f.name}`), part.features.map((f) => `${f.type}:${f.id}:${f.name}`), part.name);
      assert.equal(canon(plain(other.features)), canon(plain(part.features)), `${part.name}: every feature parameter`);
    }
  });
  test(`${id}: reopened, every part keeps its material, colour and properties`, () => {
    const { project, again } = loaded(id);
    for (const part of project.parts) {
      const { features: a, ...propsA } = plain(part);
      const { features: b, ...propsB } = plain(again.parts.find((p) => p.id === part.id));
      assert.equal(canon(propsB), canon(propsA), part.name);
    }
  });
  test(`${id}: reopened, every assembly keeps its components and mates`, () => {
    const { project, again } = loaded(id);
    for (const asm of project.assemblies) {
      const other = again.assemblies.find((a) => a.id === asm.id);
      assert.ok(other, asm.name);
      assert.equal(canon(plain(other.components)), canon(plain(asm.components)), `${asm.name}: components`);
      assert.deepEqual(other.mates.map((m) => `${m.type}:${m.id}`), asm.mates.map((m) => `${m.type}:${m.id}`), `${asm.name}: mate list`);
      assert.equal(canon(plain(other.mates)), canon(plain(asm.mates)), `${asm.name}: mate parameters and references`);
      assert.equal(canon(plain(asm)), canon(plain(other)), `${asm.name}: everything else (motion, explode, patterns)`);
    }
  });
  test(`${id}: reopened, every drawing keeps its views, sheets and annotations`, () => {
    const { project, again } = loaded(id);
    for (const d of project.drawings) {
      const other = again.drawings.find((x) => x.id === d.id);
      assert.ok(other, d.name);
      assert.deepEqual(other.views.map((v) => `${v.kind ?? ''}:${v.type}:${v.id}`), d.views.map((v) => `${v.kind ?? ''}:${v.type}:${v.id}`), `${d.name}: views`);
      assert.equal(canon(plain(other.annotations ?? [])), canon(plain(d.annotations ?? [])), `${d.name}: annotations`);
      assert.equal(canon(plain(other)), canon(plain(d)), `${d.name}: sheet, scale, source and the rest`);
    }
  });
  test(`${id}: reopened, name, units, up axis and active document are kept`, () => {
    const { project, again } = loaded(id);
    assert.equal(again.name, project.name);
    assert.equal(again.units, project.units);
    assert.equal(again.up ?? null, project.up ?? null);
    assert.deepEqual(again.active, project.active);
    assert.ok(findDocument(again, again.active), 'the active document exists');
  });
  test(`${id}: saving the reopened project gives the same file`, () => {
    const { text, again } = loaded(id);
    assert.equal(withoutSaved(packProject(again)), withoutSaved(text));
  });
  test(`${id}: a second save → open round trip changes nothing`, () => {
    const { again } = loaded(id);
    const twice = unpackProject(packProject(again));
    assert.equal(canon(plain(twice)), canon(plain(again)));
  });
}

// ───────────────────────── geometry of the reopened projects (a representative subset)

/** Two quick samples per group (found by timing every sample's rebuild). */
const GEOMETRY = ['basMotorMount', 'basCastleNut', 'mchUJointYoke', 'mchSteppedShaft', 'hsgDinRail', 'hsgLBracket', 'asmShaftDrawing', 'asmDoorHinge', 'advParamBracket', 'advSheetEnclosure', 'tut01', 'tut12'];
const shapeFacts = (body) => {
  if (!body) return null;
  const [lo, hi] = body.boundingBox.bounds;
  return { volume: R.measureVolume(body), lo, hi, faces: body.faces.length };
};
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('the geometry subset lists existing samples, two of every group', () => {
  const byId = new Map(SAMPLES.map((s) => [s.id, s]));
  assert.deepEqual(GEOMETRY.filter((id) => !byId.has(id)), []);
  for (const g of SAMPLE_GROUPS) assert.ok(GEOMETRY.filter((id) => byId.get(id)?.group === g.id).length >= 2, g.id);
});

for (const id of GEOMETRY) {
  if (!SAMPLES.some((s) => s.id === id)) continue;
  test(`${id}: reopened parts rebuild with every feature ok`, () => {
    const { again } = loaded(id);
    for (const part of again.parts) {
      const r = regenerate(part, { project: again });
      const failed = part.features.filter((f) => !r.results.get(f.id)?.ok).map((f) => `${f.name}: ${r.results.get(f.id)?.error}`);
      assert.deepEqual(failed, [], part.name);
    }
  });
  test(`${id}: reopened parts have the same volume, bounding box and face count`, () => {
    const { project, again } = loaded(id);
    for (const part of project.parts) {
      const a = shapeFacts(regenerate(part, { project }).body);
      const other = again.parts.find((p) => p.id === part.id);
      const b = shapeFacts(regenerate(other, { project: again }).body);
      assert.ok(a && b, `${part.name} has a body`);
      near(b.volume, a.volume, 1e-6);
      for (let i = 0; i < 3; i++) { near(b.lo[i], a.lo[i], 1e-6); near(b.hi[i], a.hi[i], 1e-6); }
      assert.equal(b.faces, a.faces, `${part.name}: faces`);
    }
  });
  test(`${id}: reopened assemblies solve to the same placements`, () => {
    const { project, again } = loaded(id);
    for (const asm of project.assemblies) {
      const other = again.assemblies.find((x) => x.id === asm.id);
      const ra = solveMates(plain(asm), { size: 150 });
      const copy = plain(other);
      const rb = solveMates(copy, { size: 150 });
      assert.deepEqual(rb.failed, ra.failed, `${asm.name}: failed mates`);
      const solvedA = plain(asm); solveMates(solvedA, { size: 150 });
      for (const c of solvedA.components) {
        const d = copy.components.find((x) => x.id === c.id);
        for (let i = 0; i < 3; i++) near(d.position[i], c.position[i], 1e-6);
        for (let i = 0; i < 4; i++) near(d.rotation[i], c.rotation[i], 1e-6);
      }
    }
  });
}
