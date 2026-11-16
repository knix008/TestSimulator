// Every model check names the problem and a way to fix it, and the two checks that
// catch a model which would fall apart: a wall item not against a wall, and an
// object raised with nothing under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_CODES, checkProject } from '../../src/engine/checks.js';
import { ko as extraKo, en as extraEn } from '../../src/i18n/extra3d.js';
import { ko as stairKo, en as stairEn } from '../../src/i18n/stairs3d.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { normalizeProject } from '../../src/engine/document.js';
import { buildSampleProject, SAMPLE_PROJECTS } from '../../src/engine/samples.js';

const ko = { ...extraKo, ...stairKo };
const en = { ...extraEn, ...stairEn };

test('every check has a problem sentence and a fix direction, in both languages', () => {
  for (const code of CHECK_CODES) {
    for (const dict of [ko, en]) {
      assert.equal(typeof dict[`check.${code}`], 'string', `check.${code}`);
      const fix = dict[`check.fix.${code}`];
      assert.equal(typeof fix, 'string', `check.fix.${code}`);
      assert.ok(fix.length > 8, `check.fix.${code}`);
    }
  }
});

const items = {
  mirror: { id: 'mirror', placement: 'wall', size: [0.6, 0.8, 0.05] },
  vase: { id: 'vase', placement: 'floor', size: [0.2, 0.3, 0.2] },
  table: { id: 'table', placement: 'floor', size: [1.2, 0.4, 0.6] },
};
const itemOf = (id) => items[id] ?? null;
const obj = (id, item, position) => ({ id, level: 'L', item, position, rotation: [0, 0, 0], scale: [1, 1, 1], params: {} });

function room(objects) {
  return {
    levels: [{ id: 'L', name: '1F', elevation: 0, height: 2.7 }],
    walls: [{ id: 'w', level: 'L', a: [0, 0], b: [4, 0], thickness: 0.2, height: 2.7 }],
    rooms: [{ id: 'r', level: 'L', name: 'Room', points: [[-1, -1], [5, -1], [5, 4], [-1, 4]] }],
    openings: [],
    objects,
  };
}

test('a wall item standing clear of the wall is offWall, and one flush to the face is not', () => {
  const loose = checkProject(room([obj('m', 'mirror', [2, 1.2, 1.5])]), itemOf).filter((p) => p.code === 'offWall');
  assert.equal(loose.length, 1);
  assert.equal(loose[0].entity, 'm');
  assert.ok(loose[0].params.height > 0.06);
  // The wall face is at z = 0.1; a 5 cm deep item centred at 0.125 has its back on that face.
  const flush = checkProject(room([obj('m', 'mirror', [2, 1.2, 0.125])]), itemOf).filter((p) => p.code === 'offWall');
  assert.equal(flush.length, 0);
});

test('an object raised with nothing under it is unsupported; the same object on a table is not', () => {
  const bare = checkProject(room([obj('v', 'vase', [2, 0.4, 2])]), itemOf);
  assert.equal(bare.filter((p) => p.code === 'unsupported').length, 1);
  const onTable = checkProject(room([
    obj('tb', 'table', [2, 0, 2]),
    obj('v', 'vase', [2, 0.4, 2]),
  ]), itemOf);
  assert.equal(onTable.filter((p) => p.code === 'unsupported').length, 0);
  assert.equal(onTable.filter((p) => p.code === 'objectsOverlap').length, 0);
});

const CATALOG = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));

test('the furnished samples have no wall item off its wall and nothing left floating', () => {
  const bad = [];
  for (const sample of SAMPLE_PROJECTS) {
    const p = normalizeProject(buildSampleProject(sample.id, 'ko'));
    for (const pr of checkProject(p, (id) => CATALOG.get(id) ?? null)) {
      if (pr.code === 'offWall' || pr.code === 'unsupported') bad.push(`${sample.id} ${pr.code} ${pr.entity}`);
    }
  }
  assert.deepEqual(bad, []);
});
