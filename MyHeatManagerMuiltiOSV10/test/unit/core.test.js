// Unit tests of the pure frontend modules (node --test test/unit/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyModel, normalizeModel, parseModel, serializeModel, bodyBounds, bodyContains, bodyArea, moveBody, resizeBody,
  materialAt, checkModel, interpolate, bodyPowerAt, totalPower, cellCount, engineModel, boundaryTargets,
} from '../../src/core/model.js';
import { MATERIAL_LIBRARY, materialFromLibrary, diffusivity } from '../../src/core/materials.js';
import { SAMPLE_IDS, sampleModel } from '../../src/core/samples.js';
import { MESSAGES } from '../../src/core/i18n.js';
import { COMMAND_IDS, MENUS, WORKBENCHES, TOOLBAR_GROUPS, CONTEXT_ITEMS, SHORTCUTS, commandName } from '../../src/core/commands.js';
import { THEMES, resolveTheme, sanitizeTheme, themeVars } from '../../src/core/themes.js';
import { arrheniusFactor, coffinManson, componentLife, systemLife, uFactor, sectionFigures } from '../../src/core/reliability.js';
import { parseNodeCsv, nodeStats, idwRaster, nodeBounds, sampleNodeCsv, nodesAt } from '../../src/core/heatmap.js';
import { decodeResult, field, viewField, range, cellAt, sampleLine, fieldCsv, resultVtk, MAGIC } from '../../src/core/result.js';
import { lut, niceTicks, formatValue, colorAt } from '../../src/core/colormap.js';
import { sanitizeSettings, addRecent, toDisplayT, fromDisplayT } from '../../src/core/settings.js';

test('empty model has the defaults the engine expects', () => {
  const m = emptyModel('en');
  assert.equal(m.format, 'myheat');
  assert.equal(m.domain.dim, 2);
  assert.equal(m.domain.background, 'air');
  assert.ok(m.materials.some((x) => x.id === 'air'));
  assert.equal(m.study.type, 'steady');
  assert.equal(cellCount(m.domain), 6000);
});

test('normalizeModel fills defaults and clamps', () => {
  const m = normalizeModel({ domain: { nx: -3, width: 0 }, bodies: [{ shape: 'weird', w: -1 }], boundaries: [{ type: 'nope' }] });
  assert.equal(m.domain.nx, 1);
  assert.ok(m.domain.width > 0);
  assert.equal(m.bodies[0].shape, 'rect');
  assert.equal(m.bodies[0].w, 0);
  assert.equal(m.boundaries[0].type, 'convection');
  assert.equal(m.boundaries[0].region, null);
});

test('model round-trips through JSON', () => {
  const m = sampleModel('windowFrame', 'ko');
  const again = parseModel(serializeModel(m));
  assert.deepEqual(again, m);
  assert.throws(() => parseModel('{"format":"other"}'), /unknown format/);
  assert.throws(() => parseModel('nope'), /JSON/);
  assert.deepEqual(parseModel('\uFEFF{}').domain.nx, 100);
});

test('body geometry: bounds, containment, area, move, resize', () => {
  const r = { shape: 'rect', x: 1, y: 2, w: 3, h: 4 };
  assert.deepEqual(bodyBounds(r), { x0: 1, y0: 2, x1: 4, y1: 6 });
  assert.ok(bodyContains(r, 2, 3));
  assert.ok(!bodyContains(r, 5, 3));
  assert.equal(bodyArea(r), 12);
  const c = { shape: 'circle', cx: 0, cy: 0, r: 2 };
  assert.ok(bodyContains(c, 1, 1));
  assert.ok(!bodyContains(c, 2, 2));
  assert.ok(Math.abs(bodyArea(c) - Math.PI * 4) < 1e-12);
  const p = { shape: 'polygon', points: [[0, 0], [4, 0], [0, 4]] };
  assert.ok(bodyContains(p, 1, 1));
  assert.ok(!bodyContains(p, 3, 3));
  assert.equal(bodyArea(p), 8);
  assert.deepEqual(moveBody(r, 1, -1), { ...r, x: 2, y: 1 });
  assert.deepEqual(bodyBounds(resizeBody(p, { x0: 0, y0: 0, x1: 8, y1: 2 })), { x0: 0, y0: 0, x1: 8, y1: 2 });
  assert.equal(resizeBody(c, { x0: 0, y0: 0, x1: 4, y1: 2 }).r, 1);
});

test('materialAt: later bodies paint over earlier ones, background elsewhere', () => {
  const m = normalizeModel({
    domain: { width: 10, height: 10, background: 'air' },
    materials: [{ id: 'air' }, { id: 'a' }, { id: 'b' }],
    bodies: [{ shape: 'rect', x: 0, y: 0, w: 6, h: 6, material: 'a' }, { shape: 'rect', x: 4, y: 4, w: 6, h: 6, material: 'b' }],
  });
  assert.equal(materialAt(m, 1, 1), 'a');
  assert.equal(materialAt(m, 5, 5), 'b');
  assert.equal(materialAt(m, 9, 1), 'air');
});

test('power schedules: profile interpolation and Joule heating', () => {
  assert.equal(interpolate([[0, 0], [10, 100]], 5), 50);
  assert.equal(interpolate([[0, 0], [10, 100]], -1), 0);
  assert.equal(interpolate([[0, 0], [10, 100]], 99), 100);
  const body = normalizeModel({ bodies: [{ current: [[0, 10], [10, 20]], resistance: 0.5 }] }).bodies[0];
  assert.equal(bodyPowerAt(body, 0), 50);
  assert.equal(bodyPowerAt(body, 10), 200);
  const m = normalizeModel({ bodies: [{ power: 3 }, { power: 2, hidden: true }, { powerProfile: [[0, 1], [1, 5]] }] });
  assert.equal(totalPower(m, 1), 8);
  assert.equal(engineModel(m).bodies.length, 2);
  assert.equal(engineModel(m).view, undefined);
});

test('checkModel reports missing sinks, materials, fluids', () => {
  const m = emptyModel('ko');
  assert.ok(checkModel(m).some((i) => i.key === 'issueNoSink' && i.level === 'error'));
  const bad = normalizeModel({ ...m, bodies: [{ shape: 'rect', material: 'missing', w: 10, h: 10 }], study: { flow: true }, domain: { ...m.domain, background: null } });
  const keys = checkModel(bad).map((i) => i.key);
  assert.ok(keys.includes('issueBodyMaterial'));
  assert.ok(keys.includes('issueNoFluid'));
});

test('every sample is valid: no errors, materials present, targets resolve', () => {
  for (const id of SAMPLE_IDS) {
    for (const lang of ['ko', 'en']) {
      const m = sampleModel(id, lang);
      const errors = checkModel(m).filter((i) => i.level === 'error');
      assert.deepEqual(errors, [], `${id} (${lang}): ${JSON.stringify(errors)}`);
      assert.ok(m.name && m.description, id);
      for (const bc of m.boundaries) assert.ok(boundaryTargets(m, bc.type).includes(bc.target), `${id}: ${bc.target}`);
      for (const c of m.reliability.components) assert.ok(m.bodies.some((b) => b.id === c.body), `${id}: reliability ${c.body}`);
      assert.ok(cellCount(m.domain) <= 120_000, `${id} has ${cellCount(m.domain)} cells`);
    }
  }
});

test('material library: positive properties, unique ids, fluids have viscosity', () => {
  const ids = new Set();
  for (const m of MATERIAL_LIBRARY) {
    assert.ok(!ids.has(m.id), m.id);
    ids.add(m.id);
    assert.ok(m.k > 0 && m.rho > 0 && m.cp > 0, m.id);
    if (m.kind === 'fluid') assert.ok(m.mu > 0 && m.beta > 0, m.id);
    if (m.kind === 'pcm') assert.ok(m.latent > 0 && Number.isFinite(m.Tmelt), m.id);
    if (m.kind === 'porous') assert.ok(m.porosity > 0 && m.porosity < 1 && m.permeability > 0 && ids.has(m.fluid) === false || MATERIAL_LIBRARY.some((x) => x.id === m.fluid), m.id);
    assert.ok(m.name.ko && m.name.en, m.id);
  }
  assert.equal(materialFromLibrary('copper', 'en').name, 'Copper');
  assert.ok(Math.abs(diffusivity(materialFromLibrary('copper')) - 391 / (8933 * 385)) < 1e-12);
});

test('i18n: both languages have the same keys', () => {
  const ko = Object.keys(MESSAGES.ko).sort();
  const en = Object.keys(MESSAGES.en).sort();
  assert.deepEqual(en, ko);
});

test('commands: every listed command exists and has both names', () => {
  const ids = new Set(COMMAND_IDS);
  const used = [...MENUS.flatMap((m) => m.items), ...WORKBENCHES.flatMap((w) => w.groups.flatMap((g) => g.tools)), ...TOOLBAR_GROUPS.flat(), ...CONTEXT_ITEMS, ...Object.keys(SHORTCUTS)].filter((id) => id !== '|');
  for (const id of used) assert.ok(ids.has(id), id);
  for (const id of COMMAND_IDS) {
    assert.notEqual(commandName(id, 'ko'), id);
    assert.notEqual(commandName(id, 'en'), id);
  }
});

test('themes: 40 built-in, valid colours, custom theme sanitised', () => {
  assert.equal(THEMES.length, 40);
  assert.equal(THEMES.filter((th) => th.mode === 'dark').length, 20);
  for (const th of THEMES) for (const v of Object.values(th.colors)) assert.match(v, /^#[0-9a-f]{6}$/i, th.id);
  assert.equal(resolveTheme('nope').id, 'dark');
  assert.equal(sanitizeTheme({ colors: { bg: 'red' }, mode: 'light' }).colors.bg, THEMES[0].colors.bg);
  assert.equal(themeVars(THEMES[0])['--panel-alt'], THEMES[0].colors.panelAlt);
});

test('reliability: Arrhenius, Coffin–Manson, system life, U-factor', () => {
  assert.equal(arrheniusFactor(0.7, 55, 55), 1);
  const af = arrheniusFactor(0.7, 85, 55);
  assert.ok(af > 6 && af < 8, `AF ${af}`);
  assert.equal(coffinManson(10, 1e6, 2), 1e4);
  assert.equal(coffinManson(0), Infinity);
  const life = componentLife({ Ea: 0.7, Tref: 55, mttfRef: 1e6, cycles: 1000, cm: { C: 1e6, n: 2 } }, { max: 85, swing: 20 });
  assert.ok(Math.abs(life.mttf - 1e6 / af) < 1e-6);
  assert.equal(life.cyclesToFailure, 2500);
  assert.equal(life.fatigueYears, 2.5);
  const sys = systemLife([{ fit: 100, lifeYears: 3 }, { fit: 300, lifeYears: 5 }]);
  assert.equal(sys.fit, 400);
  assert.equal(sys.minLifeYears, 3);
  assert.equal(uFactor(-39, 1, 21, -18), 1);
  assert.ok(Number.isNaN(uFactor(1, 0, 1, 0)));
  assert.ok(Math.abs(sectionFigures(3.9, 0.1, 1, 21, -18).L2D - 0.1) < 1e-12);
});

test('heat map: CSV parsing (separators, Kelvin), statistics, IDW', () => {
  const data = parseNodeCsv('Node;X;Y;Temp (K)\n1;0;0;300\n2;1;0;310\n3;0;1;320\n');
  assert.equal(data.nodes.length, 3);
  assert.ok(Math.abs(data.nodes[0].T - 26.85) < 1e-9);
  const stats = nodeStats(data.nodes, 40);
  assert.equal(stats.count, 3);
  assert.equal(stats.over.length, 1);
  assert.throws(() => parseNodeCsv('a,b\n1,2'), /x and y/);
  const sample = parseNodeCsv(sampleNodeCsv());
  const nodes = nodesAt(sample);
  const raster = idwRaster(nodes, nodeBounds(nodes), 40, 30, 2);
  assert.equal(raster.length, 1200);
  assert.ok(raster.every(Number.isFinite));
  const s = nodeStats(nodes);
  for (const v of raster) assert.ok(v >= s.min - 1e-9 && v <= s.max + 1e-9);
  // An exact hit returns the node value.
  const exact = idwRaster([{ x: 0.5, y: 0.5, T: 7 }, { x: 0, y: 0, T: 1 }], { x0: 0, y0: 0, x1: 1, y1: 1 }, 1, 1);
  assert.equal(exact[0], 7);
});

/** Builds result bytes the way the engine does. */
function fakeResult() {
  const grid = { dim: 2, nx: 3, ny: 2, nz: 1, dx: 1, dy: 1, dz: 1 };
  const mat = [0, 0, 255, 0, 0, 0];
  const T = [20, 21, 0, 23, 24, 25, 30, 31, 0, 33, 34, 35];
  const qx = [1, 0, 0, 3, 0, 0];
  const qy = [0, 1, 0, 4, 0, 0];
  const header = { ok: true, grid, materials: ['al'], times: [0, 10], fields: {
    mat: { offset: 0, length: 6, frames: 1 }, T: { offset: 6, length: 6, frames: 2 }, qx: { offset: 18, length: 6, frames: 1 }, qy: { offset: 24, length: 6, frames: 1 },
  }, stats: { Tmin: 20, Tmax: 35 } };
  let json = JSON.stringify(header);
  while (json.length % 4) json += ' ';
  const data = new Float32Array([...mat, ...T, ...qx, ...qy]);
  const bytes = new Uint8Array(8 + json.length + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, json.length, true);
  bytes.set(new TextEncoder().encode(json), 8);
  bytes.set(new Uint8Array(data.buffer), 8 + json.length);
  return bytes.buffer;
}

test('result decoding, fields, frames, magnitudes, ranges', () => {
  const r = decodeResult(fakeResult());
  assert.equal(r.header.grid.nx, 3);
  assert.deepEqual(Array.from(field(r, 'T', 1)), [30, 31, 0, 33, 34, 35]);
  assert.deepEqual(Array.from(field(r, 'T', 9)), [30, 31, 0, 33, 34, 35]);
  assert.equal(field(r, 'nope'), null);
  const flux = viewField(r, 'flux');
  assert.equal(flux.values[3], 5);
  assert.equal(viewField(r, 'velocity'), null);
  assert.deepEqual(range(field(r, 'T', 0), field(r, 'mat')), { lo: 20, hi: 25 });
  assert.equal(cellAt(r.header.grid, 2.5, 1.5), 5);
  assert.equal(cellAt(r.header.grid, 3.5, 1.5), -1);
  const line = sampleLine(r.header.grid, field(r, 'T', 0), field(r, 'mat'), { x: 0, y: 0.5 }, { x: 3, y: 0.5 }, 0, 6);
  assert.ok(line.every((p) => p.value !== 0), 'void cell skipped');
  const csv = fieldCsv(r, field(r, 'T', 0), 'T', 'C').trim().split('\n');
  assert.equal(csv[0], 'x_mm,y_mm,T_C');
  assert.equal(csv.length, 1 + 5);
  const vtk = resultVtk(r);
  assert.match(vtk, /DIMENSIONS 4 3 2/);
  assert.match(vtk, /SCALARS T float 1/);
  assert.throws(() => decodeResult(new ArrayBuffer(16)), /not a MyHeatManager result/);
});

test('colour maps and number formatting', () => {
  assert.equal(lut('turbo').length, 768);
  assert.deepEqual(colorAt('grey', 0).map(Math.round), [20, 20, 20]);
  const banded = lut('viridis', 4);
  assert.deepEqual(Array.from(banded.slice(0, 3)), Array.from(banded.slice(30, 33)));
  assert.deepEqual(niceTicks(0, 10, 6), [0, 2, 4, 6, 8, 10]);
  assert.equal(formatValue(1234.5678), '1235');
  assert.equal(formatValue(1e-5), '1.00e-5');
  assert.equal(formatValue(NaN), '—');
});

test('settings: sanitised, recent list, temperature units', () => {
  const s = sanitizeSettings({ language: 'fr', fontSize: 99, recentFiles: [{ path: 'a' }, 3], panelSize: 'x' });
  assert.equal(s.language, 'ko');
  assert.equal(s.fontSize, 20);
  assert.equal(s.recentFiles.length, 1);
  assert.equal(typeof s.panelSize, 'number');
  const r = addRecent(addRecent(s, 'C:/a/x.myheat'), 'C:/a/x.myheat');
  assert.equal(r.recentFiles.length, 2);
  assert.equal(r.recentFiles[0].name, 'x.myheat');
  assert.equal(toDisplayT(100, 'F'), 212);
  assert.ok(Math.abs(fromDisplayT(toDisplayT(37, 'K'), 'K') - 37) < 1e-12);
});

test('tutorial: every step has texts in both languages, chapters exist, ids unique', async () => {
  const { STEPS, CHAPTER_IDS } = await import('../../src/ui/tutorial.js');
  const { STEP_TEXT, STEP_IDS, CHAPTERS } = await import('../../src/core/tutorial-text.js');
  const ids = STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, STEP_IDS, 'steps and texts in the same order');
  for (const step of STEPS) {
    const text = STEP_TEXT[step.id];
    assert.ok(text.ko.title && text.ko.text && text.en.title && text.en.text, step.id);
    assert.ok(CHAPTERS[step.chapter], step.id);
    assert.equal(typeof step.run, 'function');
    assert.ok(step.target, step.id);
  }
  assert.deepEqual(CHAPTER_IDS, Object.keys(CHAPTERS));
  for (const id of CHAPTER_IDS) assert.ok(STEPS.some((s) => s.chapter === id), `chapter ${id} has no step`);
});

test('start page templates point at existing samples', async () => {
  const { START_TEMPLATES } = await import('../../src/ui/startpage.js').catch(() => ({ START_TEMPLATES: null }));
  if (!START_TEMPLATES) return; // needs a DOM for the background module
  for (const tpl of START_TEMPLATES) if (tpl.sample) assert.ok(SAMPLE_IDS.includes(tpl.sample), tpl.id);
});

test('thermal comfort: ISO 7730 example values and fields over air cells only', async () => {
  const { pmv, ppd, comfortFields, comfortCategory } = await import('../../src/core/comfort.js');
  // ISO 7730 Table D.1, first row: ta = tr = 22 °C, 0.1 m/s, 60 %, 1.2 met, 0.5 clo → PMV −0.75, PPD 17 %.
  const v = pmv(22, 22, 0.1, 60, 1.2, 0.5);
  assert.ok(Math.abs(v + 0.75) < 0.02, `PMV ${v}`);
  assert.ok(Math.abs(ppd(v) - 17) < 1, `PPD ${ppd(v)}`);
  assert.equal(Math.round(ppd(0)), 5);
  assert.equal(comfortCategory(0.1), 'A');
  const f = comfortFields(new Float32Array([22, 30, 22]), new Float32Array([0.1, 0.1, 0]), new Float32Array([0, 0, 0]), new Float32Array([0, 0, 1]), [0]);
  assert.ok(f.pmv[1] > f.pmv[0]);
  assert.ok(Number.isNaN(f.pmv[2]), 'solid cells have no PMV');
});

test('parameter study: sweep values, choices set and read the model', async () => {
  const { sweepValues, parameterChoices, metricChoices } = await import('../../src/ui/parametric.js');
  assert.deepEqual(sweepValues(0, 10, 3), [0, 5, 10]);
  const m = sampleModel('tutorial', 'en');
  const choices = parameterChoices(m);
  const q1 = choices.find((c) => c.key === 'body:q1:power');
  assert.equal(q1.get(m), 6);
  assert.equal(q1.get(q1.set(m, 9)), 9);
  assert.equal(m.bodies.find((b) => b.id === 'q1').power, 6, 'the original model is untouched');
  const fan = choices.find((c) => c.key === 'bc:fan:h');
  assert.equal(fan.get(fan.set(m, 80)), 80);
  const mesh = choices.find((c) => c.key === 'domain:cells');
  assert.equal(mesh.set(m, 2).domain.nx, m.domain.nx * 2);
  const metrics = metricChoices(m);
  assert.equal(metrics[0].of({ stats: { Tmax: 70 } }), 70);
  assert.ok(metrics.some((x) => x.key === 'probe:p1'));
});

test('language switch renames sample, library and automatic labels, keeps typed ones', async () => {
  const { relabelModel } = await import('../../src/core/model-i18n.js');
  const ko = sampleModel('tutorial', 'ko');
  ko.bodies.push({ ...ko.bodies[0], id: 'mine', name: '내 부품' }, { ...ko.bodies[0], id: 'auto', name: '물체 7' });
  const en = relabelModel(ko, 'ko', 'en');
  const enSample = sampleModel('tutorial', 'en');
  assert.equal(en.name, enSample.name);
  assert.equal(en.bodies.find((b) => b.id === 'sink').name, 'Heat sink');
  assert.equal(en.bodies.find((b) => b.id === 'mine').name, '내 부품', 'typed name kept');
  assert.equal(en.bodies.find((b) => b.id === 'auto').name, 'Body 7');
  assert.equal(en.materials.find((m) => m.id === 'al6061').name, 'Aluminium 6061');
  assert.equal(en.probes.find((p) => p.id === 'p3').name, 'Fin tip');
  assert.equal(en.boundaries.find((b) => b.id === 'fan').name, 'Fan air');
  const back = relabelModel(en, 'en', 'ko');
  assert.equal(back.bodies.find((b) => b.id === 'sink').name, '방열판');
  assert.equal(relabelModel(ko, 'ko', 'ko'), ko);
});
