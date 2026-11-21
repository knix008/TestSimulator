// Every sample project builds: all features succeed, assemblies' mates hold, drawings project and render
// (SVG and DXF), and the project survives a save / open round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { SAMPLES, buildSample } from '../../src/cad/samples.js';
import { regenerate } from '../../src/cad/features.js';
import { solveMates, placeShape, interferences, flattenAssembly, composePlacement } from '../../src/cad/assembly.js';
import { packProject, unpackProject, documentsOf } from '../../src/cad/document.js';
import { projectView, drawingSvg, drawingDxf, layoutViews } from '../../src/cad/drawing.js';

await loadKernel();
const R = rep();

for (const sample of SAMPLES) {
  test(`sample ${sample.id} builds`, () => {
    const project = buildSample(sample.id, 'ko');
    assert.ok(project, 'project');
    assert.ok(documentsOf(project).length >= 1);
    for (const part of project.parts) {
      const r = regenerate(part, { project });
      const failed = part.features.filter((f) => !r.results.get(f.id)?.ok).map((f) => `${f.name}: ${r.results.get(f.id)?.error} ${r.results.get(f.id)?.detail ?? ''}`);
      assert.deepEqual(failed, [], `${part.name}`);
      assert.ok(r.body && R.measureVolume(r.body) > 0, `${part.name} has volume`);
    }
    for (const asm of project.assemblies) {
      const result = solveMates(asm, { size: 150 });
      assert.deepEqual(result.failed, [], `${asm.name}: mates hold (error ${result.error})`);
      const bodies = new Map(project.parts.map((p) => [p.id, regenerate(p, { project }).body]));
      // A sub-assembly component: its parts placed in it, as one compound.
      const shapeOf = (c) => {
        if (!c.sub) return placeShape(bodies.get(c.part), c);
        const sub = project.assemblies.find((x) => x.id === c.sub);
        return R.makeCompound(flattenAssembly(project, sub).map((leaf) => placeShape(bodies.get(leaf.part), composePlacement(c, leaf.placement))));
      };
      const clashes = asm.allowInterference ? [] : interferences(asm, shapeOf, (s) => R.measureVolume(s), 1);
      assert.deepEqual(clashes, [], `${asm.name}: no interference`);
    }
    for (const d of project.drawings) {
      let source; let body;
      if (d.source.kind === 'assembly') {
        source = project.assemblies.find((a) => a.id === d.source.id);
        const bodies = new Map(project.parts.map((p) => [p.id, regenerate(p, { project }).body]));
        body = R.makeCompound(flattenAssembly(project, source).map((leaf) => placeShape(bodies.get(leaf.part), leaf.placement)));
      } else {
        source = project.parts.find((p) => p.id === d.source.id);
        body = regenerate(source, { project }).body;
      }
      const projections = new Map(d.views.filter((v) => v.kind !== 'detail').map((v) => [v.id, projectView(body, v.type, v)]));
      for (const [id, p] of projections) assert.ok(p.visible.length > 0, `view ${id} has lines`);
      const { scale } = layoutViews(d, projections);
      assert.ok(scale > 0);
      const svg = drawingSvg(d, projections, { info: { name: source.name } });
      assert.ok(svg.includes('<svg') && svg.includes('visible-line'));
      const dxf = drawingDxf(d, projections);
      assert.ok(dxf.includes('LINE') && dxf.trim().endsWith('EOF'));
    }
    const again = unpackProject(packProject(project));
    assert.equal(again.parts.length, project.parts.length);
    assert.deepEqual(again.active, project.active);
  });
}
