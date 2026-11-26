// Every start-page sample moves (samples/motion.js, motion-scenes.js): the project has an assembly with a motion
// study — the one it opens on, or (a drawing sample) one beside its sheet — whose components move over the study,
// its mates hold while they move, nothing overlaps half way through, and the stage's own parts are marked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { SAMPLES, buildSample } from '../../src/cad/samples.js';
import { regenerate } from '../../src/cad/features.js';
import { motionFrame, placeShape, interferences, flattenAssembly, composePlacement } from '../../src/cad/assembly.js';

await loadKernel();
const R = rep();
const only = process.env.SAMPLES_ONLY ? new Set(process.env.SAMPLES_ONLY.split(',')) : null;

/** The assembly whose motion the sample shows. */
function movingAssembly(project) {
  const active = project.assemblies.find((a) => a.id === project.active?.id);
  if (active?.motion?.motors?.length) return active;
  return project.assemblies.find((a) => a.stage && a.motion?.motors?.length) ?? project.assemblies.find((a) => a.motion?.motors?.length);
}

for (const sample of SAMPLES) {
  if (only && !only.has(sample.id)) continue;
  test(`sample ${sample.id} moves`, () => {
    const project = buildSample(sample.id, 'en');
    const asm = movingAssembly(project);
    assert.ok(asm, 'a motion study');
    if (project.active.kind !== 'drawing') assert.equal(project.active.id, asm.id, 'opens on the moving assembly');
    const duration = Number(asm.motion.duration) || 5;
    let moved = 0;
    for (const f of [0.2, 0.45, 0.7]) {
      const fr = motionFrame(asm, f * duration, { size: 300 });
      assert.deepEqual(fr.failed, [], `mates hold at ${(f * duration).toFixed(2)} s`);
      for (const c of asm.components) {
        const p = fr.placements.get(c.id);
        moved = Math.max(moved, Math.hypot(...p.position.map((v, i) => v - c.position[i])), 50 * Math.hypot(...p.rotation.map((v, i) => v - c.rotation[i])));
      }
    }
    assert.ok(moved > 1, `something moves (${moved})`);
    // Stage parts are marked and build.
    const bodies = new Map(project.parts.map((p) => [p.id, regenerate(p, { project }).body]));
    for (const p of project.parts.filter((x) => x.stage)) assert.ok(bodies.get(p.id) && R.measureVolume(bodies.get(p.id)) > 0, `${p.name} builds`);
    // Nothing overlaps half way through the motion.
    if (!asm.allowInterference) {
      const fr = motionFrame(asm, 0.45 * duration, { size: 300 });
      const clone = structuredClone(asm);
      for (const c of clone.components) Object.assign(c, fr.placements.get(c.id));
      const shapeOf = (c) => {
        if (!c.sub) return placeShape(bodies.get(c.part), c);
        const sub = project.assemblies.find((x) => x.id === c.sub);
        return R.makeCompound(flattenAssembly(project, sub).map((leaf) => placeShape(bodies.get(leaf.part), composePlacement(c, leaf.placement))));
      };
      assert.deepEqual(interferences(clone, shapeOf, (s) => R.measureVolume(s), 1), [], 'no interference while moving');
    }
  });
}
