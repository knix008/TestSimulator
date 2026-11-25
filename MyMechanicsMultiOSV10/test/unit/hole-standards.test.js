// Hole Wizard metric standards besides ISO (hole-more.js): DIN, JIS and GB clearance fits, socket head counterbores
// and 90° countersinks, and a counterbored DIN hole built to its table values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { METRIC_STANDARDS, metricStdHole } from '../../src/cad/hole-more.js';

test('every standard lists M3 … M24 with fine < medium < coarse clearance and a counterbore bigger than the hole', () => {
  for (const [std, rows] of Object.entries(METRIC_STANDARDS)) {
    assert.deepEqual(Object.keys(rows), ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M14', 'M16', 'M20', 'M24'], std);
    for (const [size, [f, m, c, cb, depth, cs]] of Object.entries(rows)) {
      const d = Number(size.slice(1));
      assert.ok(d < f && f < m && m < c, `${std} ${size} fits`);
      assert.ok(cb > c && depth >= d && cs > c, `${std} ${size} counterbore / countersink`);
    }
  }
});

test('metricStdHole: the values by hole type and fit', () => {
  assert.deepEqual(metricStdHole('din', 'M8', 'simple', 'normal'), { diameter: 9 });
  assert.deepEqual(metricStdHole('din', 'M8', 'counterbore', 'close'), { diameter: 8.4, cbDiameter: 15, cbDepth: 8.6 });
  assert.deepEqual(metricStdHole('jis', 'M12', 'simple', 'normal'), { diameter: 14 });
  assert.deepEqual(metricStdHole('gb', 'M6', 'countersink', 'loose'), { diameter: 7, csDiameter: 12.8, csAngle: 90 });
  assert.equal(metricStdHole('gb', 'M7', 'simple'), null);
});
