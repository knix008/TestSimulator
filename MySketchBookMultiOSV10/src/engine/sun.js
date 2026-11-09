// Sun position for shadows (SketchUp's Shadows panel): date, time, place and the
// model's north angle → a direction in world space. NOAA's simplified solar
// equations; accurate to well under a degree, plenty for interior daylight.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Day of the year (1–366) from 'MM-DD'. */
export function dayOfYear(mmdd) {
  const [m, d] = String(mmdd).split('-').map(Number);
  const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return (days[(m || 1) - 1] ?? 0) + (d || 1);
}

/**
 * Solar azimuth (degrees clockwise from north) and altitude (degrees above the horizon)
 * for local clock time `time` ('HH:MM') at `latitude`/`longitude` with `utcOffset` hours.
 */
export function solarPosition({ date = '06-21', time = '12:00', latitude = 37.57, longitude = 126.98, utcOffset = 9 }) {
  const n = dayOfYear(date);
  const [hh, mm] = String(time).split(':').map(Number);
  const hours = (hh || 0) + (mm || 0) / 60;
  const gamma = ((2 * Math.PI) / 365) * (n - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const timeOffset = eqTime + 4 * longitude - 60 * utcOffset;
  const tst = hours * 60 + timeOffset;
  const ha = rad(tst / 4 - 180);
  const lat = rad(latitude);
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  const altitude = 90 - deg(zenith);
  let azimuth = deg(Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zenith) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zenith) || 1e-9)))));
  azimuth = ha > 0 ? (azimuth + 180) % 360 : (540 - azimuth) % 360;
  return { azimuth, altitude };
}

/**
 * Unit vector pointing from the scene towards the sun. North is −Z rotated by `north` degrees
 * (clockwise seen from above), east is +X.
 */
export function sunDirection(sun) {
  const { azimuth, altitude } = solarPosition(sun);
  const az = rad(azimuth + (sun.north ?? 0));
  const alt = rad(Math.max(altitude, -5));
  return { x: Math.sin(az) * Math.cos(alt), y: Math.sin(alt), z: -Math.cos(az) * Math.cos(alt), altitude, azimuth };
}
