// The sun's position (cad/sun.js) against known values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solarPosition, sunDirection } from '../../src/cad/sun.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('solar position: equinox noon at the equator, summer solstice in Seoul, the morning sun in the east', () => {
  const eq = solarPosition(0, 0, '2024-03-20', '12:07', 0);
  near(eq.elevation, 90, 1.2);
  // Seoul (37.57 N, 126.98 E, UTC+9) on 21 June near solar noon (≈ 12:32): 90 − 37.57 + 23.44 ≈ 75.9°, due south.
  const seoul = solarPosition(37.57, 126.98, '2024-06-21', '12:32', 9);
  near(seoul.elevation, 75.9, 0.3); near(seoul.azimuth, 180, 2);
  const morning = solarPosition(37.57, 126.98, '2024-03-20', '07:00', 9);
  assert.ok(morning.azimuth > 80 && morning.azimuth < 110, `azimuth ${morning.azimuth}`);
  assert.ok(morning.elevation > 0 && morning.elevation < 20, `elevation ${morning.elevation}`);
  // At night the sun is below the horizon.
  assert.ok(solarPosition(37.57, 126.98, '2024-06-21', '01:00', 9).elevation < 0);
  // Direction: due south at 45° up is (0, −0.707, 0.707) with north along +Y; north turned 90° moves it to +X.
  const d = sunDirection(180, 45, 0); near(d[0], 0, 1e-12); near(d[1], -Math.SQRT1_2, 1e-12); near(d[2], Math.SQRT1_2, 1e-12);
  const d2 = sunDirection(180, 45, 90); near(d2[0], Math.SQRT1_2, 1e-12);
});
