// GPX tracks: parsing (track/route/way points, namespaces, points without a
// time) and finding a photo's position (interpolation, offset, max gap).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locate, parseGpx } from '../../src/catalog/gpx.js';

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="logger" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="37.0" lon="127.0"><name>no time</name></wpt>
  <trk><name>walk</name><trkseg>
    <trkpt lat="37.5000" lon="127.0000"><ele>10</ele><time>2024-05-01T10:00:00Z</time></trkpt>
    <trkpt lat='37.5100' lon='127.0200'><ele>30</ele><time>2024-05-01T10:10:00Z</time></trkpt>
    <trkpt lat="37.6000" lon="127.1000"><time>2024-05-01T12:00:00Z</time></trkpt>
  </trkseg></trk>
  <rte><rtept lat="37.4" lon="126.9"><time>2024-05-01T09:00:00Z</time></rtept></rte>
</gpx>`;
const at = (iso) => Date.parse(iso);

test('parses track, route and way points with a time, sorted', () => {
  const points = parseGpx(GPX);
  assert.equal(points.length, 4, 'the way point without a time is skipped');
  assert.deepEqual(points.map((p) => p.lat), [37.4, 37.5, 37.51, 37.6]);
  assert.equal(points[1].ele, 10);
  assert.equal(points[3].ele, null);
});

test('namespaced tags (gpx:trkpt) and bad input', () => {
  const points = parseGpx('<gpx:gpx xmlns:gpx="x"><gpx:trkpt lat="1" lon="2"><gpx:time>2024-01-01T00:00:00Z</gpx:time></gpx:trkpt></gpx:gpx>');
  assert.equal(points.length, 1);
  assert.throws(() => parseGpx('<kml></kml>'), /not a GPX/);
  assert.deepEqual(parseGpx('<gpx><trkpt lat="999" lon="0"><time>2024-01-01T00:00:00Z</time></trkpt></gpx>'), []);
});

test('interpolates between two close points', () => {
  const points = parseGpx(GPX);
  const spot = locate(points, at('2024-05-01T10:05:00Z'));
  assert.deepEqual(spot, { lat: 37.505, lon: 127.01, ele: 20 });
});

test('exact point, nearest point within the gap, nothing beyond it', () => {
  const points = parseGpx(GPX);
  assert.deepEqual(locate(points, at('2024-05-01T10:10:00Z')), { lat: 37.51, lon: 127.02, ele: 30 });
  // 10:10 → 12:00 is a 110 min hole: 10:13 is 3 min after a point → that point.
  assert.deepEqual(locate(points, at('2024-05-01T10:13:00Z')), { lat: 37.51, lon: 127.02, ele: 30 });
  assert.equal(locate(points, at('2024-05-01T11:00:00Z')), null, 'middle of the hole');
  assert.equal(locate(points, at('2024-05-01T08:00:00Z')), null, 'before the track');
  assert.deepEqual(locate(points, at('2024-05-01T12:04:00Z')), { lat: 37.6, lon: 127.1, ele: null }, 'just after the end');
  assert.ok(locate(points, at('2024-05-01T11:00:00Z'), { maxGap: 2 * 3_600_000 }), 'a larger gap interpolates');
});

test('clock offset moves the photo time', () => {
  const points = parseGpx(GPX);
  // Camera one hour behind: 09:05 on the camera = 10:05 on the track.
  assert.deepEqual(locate(points, at('2024-05-01T09:05:00Z'), { offset: 3_600_000 }), { lat: 37.505, lon: 127.01, ele: 20 });
  assert.equal(locate([], at('2024-05-01T10:00:00Z')), null);
  assert.equal(locate(points, NaN), null);
});
