// Solar position for sun and shadow studies (NOAA / Spencer approximation,
// accurate to well under a degree — plenty for shadows).
//
// sunPosition(latitude°, longitude°, date, timezoneHours) → {azimuth, altitude}
// in degrees: azimuth clockwise from north, altitude above the horizon.

const RAD = Math.PI / 180;

export function sunPosition(lat, lon, date, tz = 9) {
  const d = date instanceof Date ? date : new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  // Local clock time the caller meant (the Date's own fields, not the machine's zone).
  const dayOfYear = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000) + 1;
  const hours = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const timeOffset = eqTime + 4 * lon - 60 * tz;
  const tst = hours * 60 + timeOffset;
  const ha = (tst / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  const altitude = 90 - zen / RAD;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(phi) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(phi) * Math.sin(zen) || 1e-9)))) / RAD;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { azimuth: az, altitude, declination: decl / RAD };
}

// Sunrise and sunset hours (local clock) by scanning the day.
export function daylight(lat, lon, date, tz = 9) {
  const d = date instanceof Date ? date : new Date(date);
  let rise = null, set = null, prev = null;
  for (let m = 0; m <= 24 * 60; m += 5) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m);
    const up = sunPosition(lat, lon, t, tz).altitude > -0.83;
    if (prev !== null && up && !prev && rise === null) rise = m / 60;
    if (prev !== null && !up && prev) set = m / 60;
    prev = up;
  }
  return { sunrise: rise, sunset: set };
}
