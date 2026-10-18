/** Open-Meteo air quality. A failure here must not fail the weather forecast. */
export function airQualityUrl(location) {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    hourly: "pm10,pm2_5",
    timezone: "auto",
    forecast_days: "7",
    past_days: "1",
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
}

/** Korean 24-hour breakpoints, µg/m³. PM10 then PM2.5. */
const BREAKS = { pm10: [30, 80, 150], pm25: [15, 35, 75] };
const GRADES = ["good", "moderate", "bad", "veryBad"];

export function dustGrade(kind, value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const steps = BREAKS[kind] || BREAKS.pm10;
  const index = steps.findIndex((limit) => value <= limit);
  return GRADES[index === -1 ? GRADES.length - 1 : index];
}

/** The picture uses the worse of the two grades. */
export function worseGrade(pm10, pm25) {
  const left = dustGrade("pm10", pm10);
  const right = dustGrade("pm25", pm25);
  const rank = (grade) => (grade ? GRADES.indexOf(grade) : -1);
  return rank(left) >= rank(right) ? left : right;
}

export function dustText(reading, t) {
  if (!reading) return "";
  const parts = [];
  if (reading.pm10 != null) parts.push(`${t("dust.pm10")} ${Math.round(reading.pm10)}`);
  if (reading.pm25 != null) parts.push(`${t("dust.pm25")} ${Math.round(reading.pm25)}`);
  if (!parts.length) return "";
  const grade = worseGrade(reading.pm10, reading.pm25);
  return grade ? `${parts.join(" · ")} ${t(`dust.${grade}`)}` : parts.join(" · ");
}

export function dustBrief(reading) {
  if (!reading) return "";
  const parts = [];
  if (reading.pm10 != null) parts.push(String(Math.round(reading.pm10)));
  if (reading.pm25 != null) parts.push(String(Math.round(reading.pm25)));
  return parts.join("·");
}

/** Hourly reading when that hour exists, otherwise the day's average. */
export function dustAt(air, date, time = "") {
  if (!air) return null;
  const hour = time
    ? (air.hourly || []).find((row) => String(row.time).slice(0, 13) === String(time).slice(0, 13))
    : null;
  const day = date ? (air.daily || []).find((row) => row.date === date) : null;
  const pm10 = hour?.pm10 ?? day?.pm10 ?? null;
  const pm25 = hour?.pm25 ?? day?.pm25 ?? null;
  if (pm10 == null && pm25 == null) return null;
  return { pm10, pm25 };
}

export function parseAirQuality(json) {
  const hourly = json?.hourly;
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const pm10 = Array.isArray(hourly?.pm10) ? hourly.pm10 : [];
  const pm25 = Array.isArray(hourly?.pm2_5) ? hourly.pm2_5 : [];
  const hours = [];
  const byDate = new Map();
  for (let index = 0; index < times.length; index += 1) {
    const time = String(times[index] || "");
    const date = time.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const coarse = finite(pm10[index]);
    const fine = finite(pm25[index]);
    if (coarse == null && fine == null) continue;
    hours.push({ time, pm10: coarse, pm25: fine });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ pm10: coarse, pm25: fine });
  }
  const daily = [...byDate.entries()].map(([date, rows]) => ({
    date,
    pm10: rounded(mean(rows.map((row) => row.pm10))),
    pm25: rounded(mean(rows.map((row) => row.pm25))),
  }));
  return { hourly: hours, daily };
}

/** Leaves the forecast untouched when the air-quality body has no readings. */
export function applyAirQuality(weather, air) {
  if (!weather || !air?.hourly?.length) return weather;
  return { ...weather, air };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mean(values) {
  const ready = values.filter((value) => typeof value === "number");
  if (!ready.length) return null;
  return ready.reduce((sum, value) => sum + value, 0) / ready.length;
}

function rounded(value) {
  return value == null ? null : Math.round(value);
}
