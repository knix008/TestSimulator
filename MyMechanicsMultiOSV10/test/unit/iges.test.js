// IGES export and import through the full OpenCASCADE build (src/cad/occt-full.js): a part goes out as IGES and comes
// back as the same solid — volume, area, box and face count — both as a manifold solid (type 186) and as trimmed
// surfaces (type 144, sewn back into a shell and a solid on import).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { igesToBrep, brepToIges } from '../../src/cad/occt-full.js';
import { importIges, exportIges } from '../../src/cad/exchange.js';

await loadKernel();
const R = rep();
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);
// A block with a through bore and a cylindrical boss with a spherical cap: planes, cylinders and a sphere.
const part = () => R.makeBox([0, 0, 0], [60, 40, 20]).cut(R.makeCylinder(8, 40, [20, 20, -10], [0, 0, 1]))
  .fuse(R.makeCylinder(10, 15, [45, 20, 20], [0, 0, 1])).fuse(R.makeSphere(10).translate([45, 20, 35]));

const facts = (s) => { const [lo, hi] = s.boundingBox.bounds; return { volume: R.measureVolume(s), area: R.measureArea(s), lo, hi, faces: s.faces.length }; };
const same = (a, b, what) => {
  near(a.volume, b.volume, 1e-6, `${what} volume`);
  near(a.area, b.area, 1e-6, `${what} area`);
  for (let k = 0; k < 3; k++) { assert.ok(Math.abs(a.lo[k] - b.lo[k]) < 1e-4 && Math.abs(a.hi[k] - b.hi[k]) < 1e-4, `${what} box`); }
  assert.equal(a.faces, b.faces, `${what} faces`);
};

test('IGES as a manifold solid (type 186): out and back, the same solid', async () => {
  const s = part(); const want = facts(s);
  const iges = await brepToIges(s.serialize(), { mode: 'brep' });
  assert.match(iges.slice(0, 80 * 3), /S\s*0*1\s*$/m, 'an IGES start section');
  assert.match(iges, /^\s*186\s/m, 'a manifold solid entity (186) in the directory');
  const back = R.deserializeShape(await igesToBrep(iges));
  same(facts(back), want, 'solid');
});

test('IGES as trimmed surfaces (type 144): read back and sewn into the same solid', async () => {
  const s = part(); const want = facts(s);
  const iges = await exportIges(s, { mode: 'faces' });
  assert.match(iges, /^\s*144\s/m, 'trimmed surfaces (144)');
  const back = await importIges(iges);
  assert.equal(back.solid, true, 'sewn into a closed solid');
  same(facts(back.shape), want, 'sewn');
});

test('IGES in inches: the solid comes back the same size in millimetres', async () => {
  const s = R.makeBox([0, 0, 0], [25.4, 50.8, 12.7]); const want = facts(s);
  const iges = await exportIges(s, { unit: 'IN' });
  assert.match(iges, /INCH|\bIN\b/i, 'the global section names inches');
  same(facts((await importIges(iges)).shape), want, 'inch file');
});

test('a broken IGES file is refused with an error code, not a crash', async () => {
  await assert.rejects(() => igesToBrep('this is not an IGES file\n'), (e) => ['iges-read', 'iges-empty'].includes(e.code));
});
