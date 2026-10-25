// Unit tests of reading solver decks back into models (node --test test/unit/decks.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleModel } from '../../src/core/samples.js';
import { nastranBdf, ansysCdb, comsolMphtxt } from '../../src/core/formats.js';
import { nastranToModel, ansysToModel, calculixToModel, comsolToModel, deckReader } from '../../src/core/decks.js';

const power = (m) => m.bodies.filter((b) => !b.hidden).reduce((s, b) => s + (b.power || 0), 0);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

for (const id of ['tutorial', 'pcb3d']) {
  const model = sampleModel(id, 'en');
  for (const [label, write, read] of [['Nastran', nastranBdf, nastranToModel], ['Ansys', ansysCdb, ansysToModel]]) {
    test(`${label} round trip of ${id}: domain, materials, power and convection come back`, () => {
      const { model: back, warnings } = read(write(model), { language: 'en' });
      near(back.domain.width, model.domain.width, 1e-6, 'width');
      near(back.domain.height, model.domain.height, 1e-6, 'height');
      assert.equal(back.domain.dim, model.domain.dim);
      assert.equal(back.domain.nx, model.domain.nx);
      if (model.domain.dim === 2) near(back.domain.depth, model.domain.depth, 1e-6, 'depth');
      near(power(back), power(model), 1e-6 * Math.max(1, power(model)), 'power');
      const used = new Set(back.bodies.map((b) => b.material));
      for (const m of back.materials.filter((x) => used.has(x.id))) {
        const original = model.materials.find((x) => x.name === m.name);
        assert.ok(original, `material ${m.name} kept its name`);
        near(m.rho, original.rho, 1e-6 * original.rho, `${m.name} rho`);
      }
      assert.ok(back.boundaries.some((b) => b.type === 'convection' && b.h > 0), 'convection came back');
      assert.ok(!warnings.some((w) => /MSH/.test(w)), 'no MSH-only warnings');
    });
  }
  test(`COMSOL mesh of ${id}: geometry comes back, domains named`, () => {
    const { model: back, warnings } = comsolToModel(comsolMphtxt(model), { language: 'en' });
    near(back.domain.width, model.domain.width, 1e-6, 'width');
    assert.ok(back.materials.some((m) => /^Domain \d+$/.test(m.name)));
    assert.ok(warnings.some((w) => /material/.test(w)));
  });
}

test('Nastran small-field deck in mm with a fixed temperature and QVOL', () => {
  const card = (...f) => f.map((v, i) => (i === 0 ? String(v).padEnd(8) : String(v).padStart(8))).join('');
  const rows = ['SOL 153', 'CEND', 'BEGIN BULK'];
  // 10 x 4 mm plate of 2 x 1 quads.
  let n = 1;
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= 2; i++) rows.push(card('GRID', n++, '', `${i * 5}.`, `${j * 4}.`, '0.'));
  rows.push(card('CQUAD4', 1, 7, 1, 2, 5, 4), card('CQUAD4', 2, 7, 2, 3, 6, 5));
  rows.push(card('PSHELL', 7, 3, '2.'), card('MAT4', 3, '200.', '900.', '2.7+3'));
  rows.push(card('SPC', 1, 1, 1, '80.'), card('SPC', 1, 4, 1, '80.'));
  rows.push(card('QVOL', 2, '1.+6', '', 2), 'ENDDATA');
  const { model, warnings } = nastranToModel(rows.join('\n'), { language: 'en' });
  assert.ok(warnings.some((w) => /millimetres/.test(w)));
  near(model.domain.width, 10, 1e-9, 'width');
  near(model.domain.depth, 2, 1e-9, 'depth from PSHELL');
  const m = model.materials.find((x) => x.k === 200);
  assert.ok(m && m.cp === 900 && m.rho === 2700, 'MAT4 values (2.7+3 = 2700)');
  // 1e6 W/m³ × 5 mm × 4 mm × 2 mm = 0.04 W
  near(power(model), 0.04, 1e-9, 'QVOL power');
  const fixed = model.boundaries.find((b) => b.type === 'temperature');
  assert.ok(fixed && fixed.T === 80 && fixed.target === 'left', 'SPC on the left edge became a fixed temperature');
});

test('Ansys CDWRITE style: MPDATA, R5.0 value lines, (3i8,6e20.13)', () => {
  const e20 = (v) => v.toExponential(12).replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2').padStart(20);
  const i8 = (v) => String(v).padStart(8);
  const rows = ['/PREP7', 'ET,       1,55', 'MPDATA,R5.0, 1,KXX ,       1, 1,  150.000000    ,', 'MPDATA,R5.0, 1,DENS,       1, 1,  2000.00000    ,',
    'NBLOCK,6,SOLID,       4,       4', '(3i8,6e20.13)'];
  [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]].forEach(([x, y], i) => rows.push(`${i8(i + 1)}${i8(0)}${i8(0)}${e20(x)}${e20(y)}${e20(0)}`));
  rows.push('N,R5.3,LOC,      -1,', 'EBLOCK,19,SOLID,       1,       1', '(19i8)');
  rows.push([1, 1, 1, 1, 0, 0, 0, 0, 4, 0, 1, 1, 2, 3, 4].map(i8).join(''), i8(-1));
  rows.push('SFE,       1,   2,CONV,   1,R5.0', ' 2.50000000E+01', 'SFE,       1,   2,CONV,   2,R5.0', ' 4.00000000E+01');
  rows.push('BFE,       1,HGEN,   1,R5.0', ' 1.00000000E+05');
  const { model } = ansysToModel(rows.join('\n'), { language: 'en', unit: 'm' });
  near(model.domain.width, 10, 1e-9, 'width in mm');
  assert.equal(model.materials.find((m) => m.rho === 2000)?.k, 150);
  const conv = model.boundaries.find((b) => b.type === 'convection');
  assert.ok(conv && conv.h === 25 && conv.Tinf === 40 && conv.target === 'right', 'face 2 (J-K) = right edge, h 25, 40 °C');
  assert.ok(power(model) > 0);
});

test('CalculiX / Abaqus deck with sets, GENERATE and a C3D8 brick', () => {
  const rows = ['*HEADING', 'brick', '*NODE, NSET=NALL'];
  const pts = [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0], [0, 0, 5], [20, 0, 5], [20, 10, 5], [0, 10, 5]];
  pts.forEach(([x, y, z], i) => rows.push(`${i + 1}, ${x}, ${y}, ${z}`));
  rows.push('*ELEMENT, TYPE=C3D8, ELSET=EBLOCK', '1, 1, 2, 3, 4, 5, 6, 7, 8');
  rows.push('*NSET, NSET=COLD, GENERATE', '1, 4, 1');
  rows.push('*MATERIAL, NAME=Copper', '*CONDUCTIVITY', '390.', '*DENSITY', '8900.', '*SPECIFIC HEAT', '385.');
  rows.push('*SOLID SECTION, ELSET=EBLOCK, MATERIAL=Copper', '*STEP', '*HEAT TRANSFER, STEADY STATE', '*BOUNDARY', 'COLD, 11, 11, 20.');
  rows.push('*FILM', 'EBLOCK, F2, 30., 12.5', '*DFLUX', '1, BF, 2.0E6', '*END STEP');
  const { model, warnings } = calculixToModel(rows.join('\n'), { language: 'en' });
  assert.ok(warnings.some((w) => /millimetres/.test(w)), warnings.join());
  assert.equal(model.domain.dim, 3);
  const cu = model.materials.find((m) => m.k === 390);
  assert.ok(cu && cu.rho === 8900 && cu.cp === 385);
  assert.equal(model.boundaries.find((b) => b.type === 'temperature')?.target, 'front');
  const film = model.boundaries.find((b) => b.type === 'convection');
  assert.ok(film && film.h === 12.5 && film.Tinf === 30 && film.target === 'back', 'F2 of a C3D8 is the z-max face');
  // 2e6 W/m³ × 20 × 10 × 5 mm³ = 2 W
  near(power(model), 2, 1e-9, 'body flux');
});

test('deckReader picks the reader from the extension', () => {
  assert.equal(deckReader('a.BDF'), nastranToModel);
  assert.equal(deckReader('x.cdb'), ansysToModel);
  assert.equal(deckReader('job.inp'), calculixToModel);
  assert.equal(deckReader('m.mphtxt'), comsolToModel);
  assert.equal(deckReader('m.step'), null);
});
