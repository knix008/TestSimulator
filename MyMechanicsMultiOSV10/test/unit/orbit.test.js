// The turntable orbit (src/view/orbit.js): random and very large drags never turn the view upside down
// (up · Z ≥ 0), never roll it (right stays level), stop short of the poles, and carry on smoothly from exact
// top / bottom / normal-to views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orbitStep, elevationOf, POLE_MARGIN, WORLD_UP } from '../../src/view/orbit.js';
import { VIEWS } from '../../src/view/viewport.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const limit = Math.PI / 2 - POLE_MARGIN;

/** A camera that is well formed: unit dir and up, at right angles, up not below the horizon, no roll. */
function checkCamera({ dir, up }, msg) {
  assert.ok(Math.abs(Math.hypot(...dir) - 1) < 1e-9, `${msg}: |dir|`);
  assert.ok(Math.abs(Math.hypot(...up) - 1) < 1e-9, `${msg}: |up|`);
  assert.ok(Math.abs(dot(dir, up)) < 1e-9, `${msg}: up ⊥ dir`);
  assert.ok(dot(up, WORLD_UP) >= -1e-12, `${msg}: up · Z = ${dot(up, WORLD_UP)}`);
  const right = cross(up, dir);
  assert.ok(Math.abs(right[2]) < 1e-9, `${msg}: right is level (no roll), right.z = ${right[2]}`);
}

// A deterministic random sequence.
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test('random and huge drags never flip or roll the view', () => {
  let cam = { dir: unit([1, -1, 1]), up: unit([-0.5, 0.5, 1]) };
  cam = orbitStep(cam.dir, cam.up, 0, 0);
  for (let i = 0; i < 5000; i++) {
    const big = rand() < 0.1;
    const dx = (rand() - 0.5) * (big ? 4000 : 80);
    const dy = (rand() - 0.5) * (big ? 4000 : 80);
    cam = orbitStep(cam.dir, cam.up, dx, dy);
    checkCamera(cam, `step ${i}`);
    assert.ok(Math.abs(elevationOf(cam.dir)) <= limit + 1e-9, `step ${i}: elevation inside the clamp`);
  }
});

test('a 1000 px vertical drag stops at the clamp, up and down, in one go or in small steps', () => {
  for (const sign of [1, -1]) {
    const one = orbitStep(unit([1, -1, 1]), [0, 0, 1], 0, 1000 * sign);
    assert.ok(Math.abs(elevationOf(one.dir) - sign * limit) < 1e-9, `one drag ${sign}`);
    checkCamera(one, 'one drag');
    let cam = { dir: unit([0, -1, 0]), up: [0, 0, 1] };
    for (let i = 0; i < 100; i++) { cam = orbitStep(cam.dir, cam.up, 0, 10 * sign); checkCamera(cam, `small step ${i}`); }
    assert.ok(Math.abs(elevationOf(cam.dir) - sign * limit) < 1e-9, `small steps ${sign}`);
    // Dragging back comes down again (it does not stick at the pole).
    const back = orbitStep(cam.dir, cam.up, 0, -100 * sign);
    assert.ok(Math.abs(elevationOf(back.dir)) < limit - 0.5, 'drags back');
  }
});

test('from exact top, bottom and normal-to views the next drag carries on without a jump', () => {
  for (const name of ['top', 'bottom', 'front', 'right', 'iso', 'back', 'left']) {
    const v = VIEWS[name];
    const dir = unit(v.dir); let up = unit(v.up); up = unit(up.map((x, i) => x - dir[i] * dot(up, dir)));
    for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 1]]) {
      const next = orbitStep(dir, up, dx, dy);
      checkCamera(next, `${name} ${dx},${dy}`);
      // One pixel turns the view by about 0.006 rad — never a jump.
      assert.ok(Math.acos(Math.min(1, dot(next.dir, dir))) < 0.01, `${name} ${dx},${dy}: dir moves smoothly`);
      assert.ok(Math.acos(Math.min(1, dot(next.up, up))) < 0.02, `${name} ${dx},${dy}: up moves smoothly`);
    }
  }
  // A view normal to a slanted face, rolled: the drag levels it (up stays above the horizon) without a flip.
  const dir = unit([0.2, -0.3, 0.93]); const up = unit(cross(dir, unit(cross([0.6, 0.8, 0.1], dir))));
  const next = orbitStep(dir, up, 3, 2);
  checkCamera(next, 'slanted');
});

test('standard views are Z up', () => {
  for (const name of ['front', 'back', 'right', 'left', 'iso', 'dimetric', 'trimetric']) assert.deepEqual(VIEWS[name].up, [0, 0, 1], name);
  assert.deepEqual(VIEWS.front.dir, [0, -1, 0]);
  assert.deepEqual(VIEWS.top.dir, [0, 0, 1]);
  assert.deepEqual(VIEWS.right.dir, [1, 0, 0]);
  assert.ok(VIEWS.iso.dir[0] > 0 && VIEWS.iso.dir[1] < 0 && VIEWS.iso.dir[2] > 0);
});
