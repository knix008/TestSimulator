// Decal mapping (app-decals.js decalUV): projected on a flat face (centre, width, turn), wrapped round a cylinder by
// arc length.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { decalUV } from '../../src/app-decals.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('a flat face: the decal centre at (0.5, 0.5), its corners at 0 and 1, a 90° turn swaps the axes', () => {
  const box = R.makeBox([0, 0, 0], [40, 20, 10]);
  const top = box.faces.find((f) => f.geomType === 'PLANE' && f.center.z > 9);
  const d = { width: 20, aspect: 0.5, cx: 0, cy: 0, angle: 0 };
  const c = [top.center.x, top.center.y, 10];
  const uv = decalUV(top, d, [c]);
  near(uv[0][0], 0.5); near(uv[0][1], 0.5);
  // 10 along the face's x (half the width) and 5 along y (half the height) → a corner, whichever way the face's x runs.
  const pts = [[c[0] + 10, c[1], 10], [c[0], c[1] + 5, 10]];
  const [a, b] = decalUV(top, d, pts);
  // In mm on the image (width 20, height 10): the two offsets 10 and 5 come back whichever way the face's x runs.
  const mm = (q) => Math.abs(q[0] - 0.5) * 20 + Math.abs(q[1] - 0.5) * 10;
  near(mm(a) + mm(b), 15, 1e-9);
  // Turned 90°: the 10 mm offset now runs along the image's height (beyond it: 10 / 10 = 1 from the middle).
  const [a90] = decalUV(top, { ...d, angle: 90 }, [pts[0]]);
  near(Math.abs(a90[0] - 0.5) * 20 + Math.abs(a90[1] - 0.5) * 10, 10, 1e-9);
});

test('wrapped round a cylinder: a quarter turn away is a quarter of the circumference along the image', () => {
  const cyl = R.makeCylinder(10, 30, [0, 0, 0], [0, 0, 1]);
  const side = cyl.faces.find((f) => f.geomType === 'CYLINDRE');
  const c = side.pointOnSurface(0.5, 0.5); const ang0 = Math.atan2(c.y, c.x);
  const p0 = [10 * Math.cos(ang0), 10 * Math.sin(ang0), c.z];
  const p1 = [10 * Math.cos(ang0 + Math.PI / 2), 10 * Math.sin(ang0 + Math.PI / 2), c.z];
  const d = { width: 31.415926535, aspect: 1, mapping: 'wrap', angle: 0 };
  const [u0, u1] = decalUV(side, { ...d, cx: 0, cy: 0 }, [p0, p1], { at: [0, 0, 0], dir: [0, 0, 1] });
  // Centred on the face's middle: a quarter turn = 15.708 mm = half the width away.
  near(Math.abs(u1[0] - u0[0]), 0.5, 1e-6);
  near(u0[1], u1[1], 1e-9);
});
