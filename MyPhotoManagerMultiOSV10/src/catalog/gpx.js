// GPX tracks for geotagging: the points a GPS logger or phone recorded
// (track, route and way points with a time), and where the camera was when a
// photo was taken — between two points the position is interpolated.

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag);
  return m ? Number(m[1]) : NaN;
};
const child = (body, name) => {
  const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(body);
  return m ? m[1].trim() : null;
};

/** Points of a GPX file with a time, sorted by time: [{ lat, lon, ele, time (ms) }]. */
export function parseGpx(text) {
  const source = String(text);
  if (!/<gpx\b/i.test(source)) throw new Error('not a GPX file');
  const points = [];
  const re = /<(?:\w+:)?(trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?\1>)/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const lat = attr(m[2], 'lat');
    const lon = attr(m[2], 'lon');
    const body = m[3] ?? '';
    const when = child(body, 'time');
    const time = when ? Date.parse(when) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(time)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleText = child(body, 'ele');
    const ele = eleText == null || eleText === '' ? NaN : Number(eleText);
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null, time });
  }
  points.sort((a, b) => a.time - b.time);
  return points;
}

/**
 * Where the track was at `time` (ms). `offset` (ms) is added to the photo time
 * first (camera clock wrong or set to another time zone). When the points
 * before and after are both within `maxGap` the position is interpolated;
 * otherwise the nearest point counts if it is within `maxGap`. Returns { lat, lon, ele } or null.
 */
export function locate(points, time, { offset = 0, maxGap = 5 * 60_000 } = {}) {
  if (!points.length || !Number.isFinite(time)) return null;
  const at = time + offset;
  let lo = 0;
  let hi = points.length - 1;
  if (at <= points[0].time) return points[0].time - at <= maxGap ? pick(points[0]) : null;
  if (at >= points[hi].time) return at - points[hi].time <= maxGap ? pick(points[hi]) : null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time <= at) lo = mid; else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (at - a.time <= maxGap && b.time - at <= maxGap) {
    const f = b.time === a.time ? 0 : (at - a.time) / (b.time - a.time);
    return {
      lat: round(a.lat + (b.lat - a.lat) * f),
      lon: round(a.lon + (b.lon - a.lon) * f),
      ele: a.ele != null && b.ele != null ? Math.round((a.ele + (b.ele - a.ele) * f) * 10) / 10 : a.ele ?? b.ele,
    };
  }
  const near = at - a.time < b.time - at ? a : b;
  return Math.abs(near.time - at) <= maxGap ? pick(near) : null;
}

const round = (v) => Math.round(v * 1e6) / 1e6;
const pick = (p) => ({ lat: round(p.lat), lon: round(p.lon), ele: p.ele });
