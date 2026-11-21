// Version history inside the project (src/cad/versions.js): numbered versions on save with author, comment and
// thumbnail, comparing (documents, features, volumes) and rolling back, check-out / check-in locks, where used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createPart, createAssembly, packProject, unpackProject } from '../../src/cad/document.js';
import {
  addVersion, versionsOf, latestVersion, compareVersions, rollbackTo, checkOut, checkIn, isReadOnly, setRequireCheckout, requiresCheckout,
  whereUsed, findVersion, snapshotOf, MAX_VERSIONS,
} from '../../src/cad/versions.js';

const box = (id, name, depth) => ({ id, type: 'extrude', name, sketch: 's1', depth });

function sample() {
  const p = createProject({ name: 'P', kind: 'part' });
  const part = p.parts[0];
  part.features.push({ id: 's1', type: 'sketch', name: 'Sketch1', entities: [], constraints: [] }, box('e1', 'Boss1', 10));
  return p;
}

test('every save adds a numbered version with author, time, comment and thumbnail; unchanged saves do not', () => {
  const p = sample();
  const a = addVersion(p, { author: 'kim', comment: 'first', thumbnail: 'data:image/png;base64,AAA', time: '2026-01-01T00:00:00Z' });
  assert.equal(a.added, true);
  assert.equal(a.version.n, 1);
  assert.equal(a.version.author, 'kim');
  assert.equal(a.version.counts.features, 2);
  assert.equal(addVersion(p, { comment: 'same' }).added, false);
  p.parts[0].features[1].depth = 20;
  const b = addVersion(p, { author: 'lee', comment: 'deeper' });
  assert.equal(b.version.n, 2);
  assert.equal(versionsOf(p).length, 2);
  assert.equal(latestVersion(p).comment, 'deeper');
  assert.equal(addVersion(p, { force: true }).version.n, 3, 'forced');
  // The version list goes with the file.
  const again = unpackProject(packProject(p));
  assert.equal(versionsOf(again).length, 3);
  assert.equal(findVersion(again, 1).thumbnail, 'data:image/png;base64,AAA');
  assert.ok(!findVersion(again, 2).data.includes('"versions"'), 'a version does not hold the versions');
});

test('the version list is capped', () => {
  const p = sample();
  for (let i = 0; i < MAX_VERSIONS + 5; i++) { p.parts[0].features[1].depth = i + 1; addVersion(p); }
  assert.equal(versionsOf(p).length, MAX_VERSIONS);
  assert.equal(versionsOf(p)[0].n, 6);
});

test('compare: added, removed and changed features and documents, volume changes, renames', () => {
  const p = sample();
  addVersion(p);
  const part = p.parts[0];
  part.features[1].depth = 25;
  part.features.push({ id: 'f1', type: 'fillet', name: 'Fillet1', radius: 2 });
  part.name = 'Bracket';
  const asm = createAssembly('A');
  asm.components.push({ id: 'c1', part: part.id, name: 'Bracket<1>' });
  p.assemblies.push(asm);
  addVersion(p);
  const volumeOf = (pt) => 1000 * (pt.features.find((f) => f.type === 'extrude')?.depth ?? 0);
  const d = compareVersions(p, 1, 2, { volumeOf });
  const pd = d.documents.find((x) => x.id === part.id);
  assert.equal(pd.status, 'changed');
  assert.deepEqual(pd.features, { added: ['Fillet1'], removed: [], changed: ['Boss1'] });
  assert.deepEqual(pd.renamed, { from: 'P', to: 'Bracket' });
  assert.deepEqual(pd.volume, { from: 10000, to: 25000, change: 15000 });
  assert.equal(d.documents.find((x) => x.id === asm.id).status, 'added');
  assert.deepEqual(d.summary, { added: 1, removed: 0, changed: 1 });
  const back = compareVersions(p, 2, 1);
  assert.equal(back.documents.find((x) => x.id === asm.id).status, 'removed');
  assert.equal(compareVersions(p, 2, 'current').summary.changed, 0, 'current = last saved');
  assert.equal(compareVersions(p, 9, 1), null);
});

test('rollback restores the documents of a version, keeps the history and the locks', () => {
  const p = sample();
  addVersion(p, { comment: 'v1' });
  p.parts[0].features.push({ id: 'f1', type: 'fillet', name: 'Fillet1' });
  p.parts.push(createPart('Other'));
  checkOut(p, { kind: 'part', id: p.parts[0].id }, 'kim');
  addVersion(p, { comment: 'v2' });
  assert.ok(rollbackTo(p, 1));
  assert.equal(p.parts.length, 1);
  assert.equal(p.parts[0].features.length, 2);
  assert.equal(p.parts[0].checkout.by, 'kim', 'lock kept');
  assert.equal(versionsOf(p).length, 2, 'history kept');
  assert.equal(p.rolledBackTo, 1);
  assert.equal(addVersion(p, { comment: 'after rollback' }).version.n, 3);
  assert.equal(rollbackTo(p, 42), false);
  assert.deepEqual(JSON.parse(snapshotOf(p)).parts[0].features.map((f) => f.id), ['s1', 'e1']);
});

test('check-out / check-in: read-only when check-out is required and the document is not checked out', () => {
  const p = sample();
  const ref = { kind: 'part', id: p.parts[0].id };
  assert.equal(isReadOnly(p, ref), false, 'off by default');
  setRequireCheckout(p, true);
  assert.equal(requiresCheckout(p), true);
  assert.equal(isReadOnly(p, ref), true);
  assert.equal(checkOut(p, ref, 'kim').ok, true);
  assert.equal(isReadOnly(p, ref, 'kim'), false);
  assert.equal(isReadOnly(p, ref, 'lee'), true, 'held by someone else');
  assert.deepEqual(checkOut(p, ref, 'lee'), { ok: false, error: 'held', by: 'kim' });
  assert.equal(checkIn(p, ref, 'lee').ok, false);
  assert.equal(checkIn(p, ref, 'kim').ok, true);
  assert.equal(isReadOnly(p, ref, 'kim'), true);
  assert.equal(checkOut(p, { kind: 'part', id: 'nope' }, 'kim').error, 'missing');
});

test('where used: assemblies (directly and through sub-assemblies) and drawings', () => {
  const p = createProject({ name: 'P', kind: 'part' });
  const bolt = p.parts[0];
  const plate = createPart('Plate'); p.parts.push(plate);
  const sub = createAssembly('Sub'); sub.components.push({ id: 'a', part: bolt.id, name: 'b1' }, { id: 'b', part: bolt.id, name: 'b2' });
  const top = createAssembly('Top'); top.components.push({ id: 'c', sub: sub.id, name: 'Sub<1>' }, { id: 'd', part: plate.id, name: 'Plate<1>' });
  p.assemblies.push(sub, top);
  p.drawings.push({ id: 'd1', name: 'Bolt drawing', source: { kind: 'part', id: bolt.id } }, { id: 'd2', name: 'Top drawing', source: { kind: 'assembly', id: top.id } });
  const used = whereUsed(p, { kind: 'part', id: bolt.id });
  assert.deepEqual(used.map((u) => [u.kind, u.name, u.count]), [['assembly', 'Sub', 2], ['assembly', 'Top', 0], ['drawing', 'Bolt drawing', 1], ['drawing', 'Top drawing', 0]]);
  assert.deepEqual(used.find((u) => u.name === 'Top').via, ['Sub']);
  assert.deepEqual(whereUsed(p, { kind: 'assembly', id: sub.id }).map((u) => u.name), ['Top', 'Top drawing']);
  assert.deepEqual(whereUsed(p, { kind: 'part', id: plate.id }).map((u) => u.name), ['Top', 'Top drawing']);
});
