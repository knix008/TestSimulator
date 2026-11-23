// Defeature (src/cad/defeature.js): which features count as details, patterns of details, and the simplified
// configuration (the part's own features untouched, the configuration active, refreshed in place).
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, defeature } from '../../src/cad/defeature.js';
import { createPart } from '../../src/cad/document.js';
import { createFeature } from '../../src/cad/features.js';
import { activeConfiguration, effectiveFeatures } from '../../src/cad/params.js';

function bracket() {
  const p = createPart('Bracket');
  const add = (type, params) => { const f = createFeature(p, type, params); p.features.push(f); return f; };
  add('sketch', { name: 'Base sketch' });
  add('extrude', { name: 'Base', depth: 20 });
  add('fillet', { name: 'Big round', radius: 8 });
  add('fillet', { name: 'Edge break', radius: 1 });
  add('chamfer', { name: 'Chamfer', distance: 0.5 });
  const h = add('hole', { name: 'M5 hole', diameter: 5.5 });
  add('hole', { name: 'Bore', diameter: 20 });
  add('linearPattern', { name: 'Hole row', seeds: [h.id] });
  add('linearPattern', { name: 'Mixed pattern', seeds: [h.id, p.features[1].id] });
  add('wrap', { name: 'Logo', depth: 0.3 });
  return p;
}

test('details by the criteria: small fillets, chamfers and holes, a pattern of details only, a wrap', () => {
  const p = bracket();
  const c = candidates(p, { filletRadius: 3, chamferDistance: 1, holeDiameter: 6 });
  assert.deepEqual(c.map((x) => x.name), ['Edge break', 'Chamfer', 'M5 hole', 'Hole row', 'Logo']);
  assert.deepEqual(c.map((x) => x.reason), ['fillet', 'chamfer', 'hole', 'pattern', 'wrap']);
  assert.deepEqual(candidates(p, { filletRadius: 10, holes: false, chamfers: false, wraps: false }).map((x) => x.name), ['Big round', 'Edge break']);
  p.features.find((f) => f.name === 'Edge break').suppressed = true;
  assert.ok(!candidates(p).some((x) => x.name === 'Edge break'), 'already suppressed: not a candidate');
});

test('the simplified configuration: details suppressed there only, active, refreshed rather than duplicated', () => {
  const p = bracket();
  const ids = candidates(p, { filletRadius: 3, chamferDistance: 1, holeDiameter: 6 }).map((x) => x.id);
  const c = defeature(p, ids, { name: 'Simplified' });
  assert.equal(activeConfiguration(p), c);
  assert.ok(p.features.every((f) => !f.suppressed), 'the part\'s features themselves untouched');
  const built = effectiveFeatures(p);
  assert.deepEqual(built.filter((f) => f.suppressed).map((f) => f.name).sort(), ['Chamfer', 'Edge break', 'Hole row', 'Logo', 'M5 hole']);
  const again = defeature(p, [ids[0]], { name: 'Simplified 2' });
  assert.equal(again, c, 'the same configuration refreshed');
  assert.equal(p.configurations.length, 1);
  assert.deepEqual(Object.keys(c.suppress).filter((k) => c.suppress[k]), [ids[0]]);
  assert.equal(c.name, 'Simplified 2');
});
