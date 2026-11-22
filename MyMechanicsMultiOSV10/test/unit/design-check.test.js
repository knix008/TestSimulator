// Design checker (src/cad/design-check.js): every rule finds what it is for and nothing in a clean project, the
// corrections fix what they say, standards survive JSON and are learnt from a project, and the report lists it all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createAssembly, addDrawing } from '../../src/cad/document.js';
import { createFeature } from '../../src/cad/features.js';
import { createSketchGeometry, addLine, addRectangle, addRelation, addConstraint } from '../../src/cad/sketch.js';
import { RULES, defaultStandard, normalizeStandard, learnStandard, runCheck, applyFix, applyAllFixes, reportHtml, sketchStatus, STANDARD_HOLES } from '../../src/cad/design-check.js';

/** A tidy project: one part (named, numbered, a fully fixed rectangle sketch, a fillet of 1, a 6.6 hole), an assembly with a fixed component, an ISO drawing. */
function clean() {
  const p = createProject({ name: 'Bracket', kind: 'part' });
  const part = p.parts[0];
  Object.assign(part, { name: 'Bracket', partNo: 'BR-100', description: 'Mounting bracket' });
  const sk = createFeature(part, 'sketch', { name: 'Profile' });
  const s = createSketchGeometry(); Object.assign(sk, s);
  // A rectangle with its corner fixed and both sizes driven: fully defined.
  const ids = addRectangle(sk, 0, 0, 40, 20);
  const lines = sk.entities.filter((e) => e.type === 'line');
  const corner = lines[0].p1;
  addRelation(sk, 'fix', [corner]);
  addConstraint(sk, { type: 'distance', a: lines[0].id, value: 40 });
  addConstraint(sk, { type: 'distance', a: lines[1].id, value: 20 });
  void ids;
  part.features.push(sk);
  part.features.push(createFeature(part, 'extrude', { name: 'Base', sketch: sk.id }));
  part.features.push(createFeature(part, 'fillet', { name: 'Edge round', radius: 1 }));
  part.features.push(createFeature(part, 'hole', { name: 'M6 clearance', diameter: 6.6 }));
  const asm = createAssembly('Bracket assembly'); asm.components.push({ id: 'c1', part: part.id, fixed: true, position: [0, 0, 0] });
  p.assemblies.push(asm);
  const d = addDrawing(p, { kind: 'part', id: part.id }, 'Bracket drawing');
  d.format = { standard: 'ISO', zones: true }; d.projection = 'first'; d.sheet = 'A3';
  d.title = { company: 'ACME', drawnBy: 'K', checkedBy: 'L', date: '2026-11-23', partNo: 'BR-100', revision: 'A' };
  d.annotations = [{ id: 'dim1', kind: 'drwDim', view: 'v-front', dtype: 'horizontal', precision: 1 }, { id: 'n1', kind: 'note', text: 'Deburr', size: 3.5 }];
  return { p, part, asm, d, sk };
}

test('a tidy project passes every rule', () => {
  const { p, sk } = clean();
  assert.equal(sketchStatus(sk).under, 0, `the sketch is fully defined: ${JSON.stringify(sketchStatus(sk))}`);
  const r = runCheck(p, defaultStandard(), { units: 'mm' });
  assert.deepEqual(r.findings.map((f) => `${f.rule}:${f.target?.name ?? ''}`), []);
  assert.deepEqual(r.skipped, ['rebuild', 'mates'], 'the two that need the modeller are skipped without it');
  assert.equal(r.passed.length, Object.keys(RULES).length - 2, 'all the others ran and passed');
});

test('each rule finds its fault', () => {
  const { p, part, asm, d, sk } = clean();
  part.partNo = ''; part.material = 'pvc-xyz';
  part.rollback = 2;
  part.features[2].suppressed = true;
  part.features.push(createFeature(part, 'fillet', { radius: 0.2 }));        // default name "Fillet1", below the minimum
  part.features.push(createFeature(part, 'hole', { name: 'Odd hole', diameter: 6.62 }));
  const loose = createFeature(part, 'sketch', { name: 'Loose' }); Object.assign(loose, createSketchGeometry()); addLine(loose, 0, 0, 10, 5); part.features.push(loose);
  asm.components[0].fixed = false;
  d.format.standard = 'ANSI'; d.projection = 'third'; d.sheet = 'Letter';
  d.title.checkedBy = ''; d.title.revision = 'b'; d.title.date = '2026.11.3';
  d.autoScale = false; d.scale = 1 / 3;
  d.annotations.push({ id: 'dim2', kind: 'drwDim', view: 'v-front', dtype: 'vertical', precision: 4, text: '42' }, { id: 'n2', kind: 'note', text: 'tiny', size: 1.8 }, { id: 'dim3', kind: 'drwDim', view: 'v-gone', dtype: 'aligned' });
  const std = defaultStandard(); std.rules.material.materials = ['steel-1020', 'al-6061'];
  const r = runCheck(p, std, { units: 'in', rebuildErrors: () => [{ feature: part.features[1], error: 'no-profile' }], mateFailures: () => [] });
  const got = (rule) => r.findings.filter((f) => f.rule === rule);
  assert.equal(got('units')[0].args.found, 'in');
  assert.deepEqual(got('partProps').map((f) => f.args.field), ['partNo']);
  assert.equal(got('material').length, 1);
  assert.equal(got('suppressed')[0].target.name, 'Edge round');
  assert.equal(got('rollback').length, 1);
  assert.equal(got('rebuild')[0].target.name, 'Base');
  assert.deepEqual(got('sketchDefined').map((f) => [f.target.name, f.args.state]), [['Loose', 'under']]);
  assert.deepEqual(got('defaultNames').map((f) => f.target.name), ['Fillet1']);
  assert.deepEqual(got('minFillet').map((f) => f.args.value), [0.2], 'the suppressed fillet is not judged');
  assert.deepEqual(got('holeSizes').map((f) => [f.args.value, f.args.nearest]), [[6.62, 6.6]]);
  assert.equal(got('fixedComponent').length, 1);
  assert.equal(got('drawingStandard')[0].args.found, 'ANSI / third');
  assert.equal(got('sheetSizes')[0].args.found, 'Letter');
  assert.deepEqual(got('titleBlock').map((f) => f.args.field), ['checkedBy']);
  assert.equal(got('titleBlock')[0].fixable, false, 'nobody to fill in as checker');
  assert.equal(got('revision')[0].args.fix, 'B');
  assert.equal(got('dateFormat')[0].args.fix, '2026-11-03');
  assert.equal(got('viewScale')[0].args.fix, 1 / 4, 'the next smaller standard scale');
  assert.deepEqual(got('dimPrecision').map((f) => f.target.id), ['dim2']);
  assert.deepEqual(got('overriddenDims').map((f) => f.target.id), ['dim2']);
  assert.deepEqual(got('textHeight').map((f) => f.target.id), ['n2']);
  assert.deepEqual(got('danglingAnnotations').map((f) => f.target.id), ['dim3']);
  assert.equal(r.counts.error + r.counts.warning + r.counts.info, r.findings.length);
  void sk;
});

test('an over-defined sketch is reported as such, also when under-defined sketches are allowed', () => {
  const { p, sk } = clean();
  const lines = sk.entities.filter((e) => e.type === 'line');
  addConstraint(sk, { type: 'distance', a: lines[2].id, value: 41 });   // the opposite side, another length
  const std = defaultStandard(); std.rules.sketchDefined.allowUnder = true;
  const r = runCheck(p, std);
  assert.deepEqual(r.findings.filter((f) => f.rule === 'sketchDefined').map((f) => f.args.state), ['over']);
});

test('corrections: each fixable finding is gone after applyAllFixes, the rest stay', () => {
  const { p, part, asm, d } = clean();
  part.rollback = 1; part.features[2].radius = 0.1; part.features[3].diameter = 8.3;
  asm.components[0].fixed = false;
  d.format.standard = 'ANSI'; d.projection = 'third';
  d.title.date = ''; d.title.revision = 'c'; d.autoScale = false; d.scale = 0.3;
  d.annotations.push({ id: 'dim2', kind: 'drwDim', view: 'v-front', precision: 3, text: 'X' }, { id: 'n2', kind: 'note', size: 2 }, { id: 'dim3', kind: 'drwDim', view: 'nope' });
  part.description = '';
  let units = 'in';
  const before = runCheck(p, defaultStandard(), { units });
  const n = applyAllFixes(p, before.findings, { setUnits: (u) => { units = u; } });
  assert.equal(n, before.findings.filter((f) => f.fixable).length);
  const after = runCheck(p, defaultStandard(), { units });
  assert.deepEqual(after.findings.map((f) => f.rule), ['partProps'], 'only the missing description is left (no value to put there)');
  assert.equal(part.rollback, null); assert.equal(part.features[2].radius, 0.5); assert.equal(part.features[3].diameter, 8.4);
  assert.equal(asm.components[0].fixed, true);
  assert.deepEqual([d.format.standard, d.projection], ['ISO', 'first']);
  assert.equal(d.title.date, new Date().toISOString().slice(0, 10)); assert.equal(d.title.revision, 'C'); assert.equal(d.scale, 1 / 4);
  const dim2 = d.annotations.find((a) => a.id === 'dim2');
  assert.equal(dim2.precision, 2); assert.equal(dim2.text, undefined);
  assert.equal(d.annotations.find((a) => a.id === 'n2').size, 2.5);
  assert.ok(!d.annotations.some((a) => a.id === 'dim3'));
  assert.equal(units, 'mm');
});

test('one correction at a time: applyFix changes only its item', () => {
  const { p, part } = clean();
  part.features.push(createFeature(part, 'fillet', { name: 'Small', radius: 0.1 }), createFeature(part, 'fillet', { name: 'Smaller', radius: 0.05 }));
  const r = runCheck(p, defaultStandard());
  const f = r.findings.find((x) => x.rule === 'minFillet' && x.target.name === 'Smaller');
  assert.equal(applyFix(p, f), true);
  assert.deepEqual(part.features.filter((x) => x.type === 'fillet').map((x) => x.radius), [1, 0.1, 0.5]);
});

test('standards: off rules and severities are kept through JSON; bad input is refused; unknown rules dropped', () => {
  const s = defaultStandard('Company');
  s.rules.defaultNames.on = false; s.rules.textHeight.min = 3.5; s.rules.holeSizes.severity = 'error';
  const back = normalizeStandard(JSON.parse(JSON.stringify({ ...s, rules: { ...s.rules, bogus: { on: true } } })));
  assert.equal(back.name, 'Company'); assert.equal(back.rules.defaultNames.on, false); assert.equal(back.rules.textHeight.min, 3.5); assert.equal(back.rules.holeSizes.severity, 'error');
  assert.ok(!('bogus' in back.rules));
  assert.throws(() => normalizeStandard({ format: 'something-else' }), /not a standard/);
  const partial = normalizeStandard({ rules: { textHeight: { min: 'big' } } });
  assert.equal(partial.rules.textHeight.min, 2.5, 'a parameter of the wrong type keeps the default');
  const { p, d } = clean(); d.annotations.push({ id: 'n3', kind: 'note', size: 3 });
  const r = runCheck(p, back);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.severity]), [['textHeight', 'warning'], ['textHeight', 'warning']], 'note 3 and the dimension (3.2 by default) under 3.5');
  assert.ok(!r.checked.includes('defaultNames'));
});

test('a standard learnt from an ANSI project expects ANSI, its sheet sizes, its precision, its materials', () => {
  const { p, d, part } = clean();
  d.format.standard = 'ANSI'; d.projection = 'third'; d.sheet = 'Tabloid'; d.annotations[0].precision = 3; part.material = 'al-6061';
  const s = learnStandard(p, { name: 'From ACME', units: 'in' });
  assert.equal(s.rules.drawingStandard.standard, 'ANSI'); assert.equal(s.rules.drawingStandard.projection, 'third');
  assert.ok(s.rules.sheetSizes.sizes.includes('Tabloid')); assert.equal(s.rules.dimPrecision.max, 3);
  assert.deepEqual(s.rules.material.materials, ['al-6061']); assert.equal(s.rules.units.units, 'in');
  const r = runCheck(p, s, { units: 'in' });
  assert.deepEqual(r.findings, [], 'the project it was learnt from passes it');
});

test('standard hole sizes hold ISO 273 clearances and tap drills', () => {
  for (const v of [3.4, 4.5, 5.5, 6.6, 9, 11, 13.5, 8.4, 10.5, 6.8, 10.2]) assert.ok(STANDARD_HOLES.includes(v), String(v));
});

test('report: counts, every finding with its document and item, passed rules; HTML escaped', () => {
  const { p, d } = clean();
  d.annotations.push({ id: 'n9', kind: 'note', text: '<b>x</b>', size: 1 });
  const r = runCheck(p, defaultStandard());
  const html = reportHtml(r, { project: 'Bracket <1>', text: (f) => `${f.rule} ${JSON.stringify(f.args)}`, labels: { title: 'Design check' } });
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes('Bracket &lt;1&gt;'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.equal((html.match(/<tr><td/g) ?? []).length, r.findings.length);
  assert.ok(html.includes('Warning: <b>1</b>'));
  assert.equal((html.match(/<li>/g) ?? []).length, r.passed.length);
});
