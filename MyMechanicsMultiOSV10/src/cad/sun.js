// The sun's place in the sky from a location and a moment (the NOAA solar-position equations): azimuth (degrees
// clockwise from north) and elevation (degrees above the horizon, with atmospheric refraction), and the direction
// toward the sun in the model (Z up, north along +Y turned by `north` degrees about Z).

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Julian day of a UTC date-time. */
function julian(y, mo, d, hUtc) {
  if (mo <= 2) { y -= 1; mo += 12; }
  const A = Math.floor(y / 100); const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + B - 1524.5 + hUtc / 24;
}

/**
 * The sun's azimuth and elevation (degrees) at latitude / longitude (degrees, east positive), on `date` ('YYYY-MM-DD')
 * at local `time` ('HH:MM') in time zone `tz` (hours from UTC).
 */
export function solarPosition(lat, lon, date, time, tz = 0) {
  const [y, mo, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  const local = (hh || 0) + (mm || 0) / 60;
  const jd = julian(y, mo, d, local - tz);
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const yv = Math.tan(rad(eps / 2)) ** 2;
  const eqTime = 4 * deg(yv * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * yv * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * yv * yv * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const trueSolar = ((local * 60 + eqTime + 4 * lon - 60 * tz) % 1440 + 1440) % 1440;
  let ha = trueSolar / 4 - 180; if (ha < -180) ha += 360;
  const cosZen = Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha));
  const zen = deg(Math.acos(Math.max(-1, Math.min(1, cosZen))));
  // Azimuth clockwise from north.
  const az = (deg(Math.atan2(Math.sin(rad(ha)), Math.cos(rad(ha)) * Math.sin(rad(lat)) - Math.tan(rad(decl)) * Math.cos(rad(lat)))) + 180 + 360) % 360;
  let el = 90 - zen;
  // Refraction near the horizon.
  if (el > -0.575 && el < 85) {
    const te = Math.tan(rad(el));
    const r = el > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5 : el > -0.575 ? 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711))) : -20.774 / te;
    el += r / 3600;
  }
  return { azimuth: az, elevation: el, declination: decl, hourAngle: ha };
}

/** The unit direction toward the sun in the model: north along +Y turned by `north` degrees (counter-clockwise). */
export function sunDirection(azimuth, elevation, north = 0) {
  const a = rad(azimuth - north); const e = rad(elevation);
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}
