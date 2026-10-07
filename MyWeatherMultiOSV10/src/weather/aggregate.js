import { AppError } from "../core/errors.js";

export function aggregate(sourceResults) {
  const ok = sourceResults.filter((source) => source.ok && source.data);
  if (!ok.length) {
    const details = sourceResults.map((source) => `${source.id}: ${source.error || "failed"}`).join("\n");
    throw new AppError("All weather sources failed", details, "WEATHER_ALL_FAILED");
  }
  const byDate = new Map();
  for (const source of ok) {
    for (const day of source.data.daily || []) {
      if (!byDate.has(day.date)) byDate.set(day.date, []);
      byDate.get(day.date).push(day);
    }
  }
  const daily = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rows]) => ({
      date,
      tempMin: round1(average(rows.map((row) => row.tempMin))),
      tempMax: round1(average(rows.map((row) => row.tempMax))),
      precip: round1(average(rows.map((row) => row.precip))),
      wind: round1(average(rows.map((row) => row.wind))),
      humidity: round1(average(rows.map((row) => row.humidity))),
      code: mode(rows.map((row) => row.code)),
      bySource: Object.fromEntries(rows.map((row) => [row.source, row])),
    }));
  return {
    daily,
    hourly: mergeHourly(ok),
    sources: sourceResults.map((source) => ({
      id: source.id,
      ok: Boolean(source.ok),
      error: source.ok ? "" : String(source.error || "failed"),
    })),
  };
}

export function average(values) {
  const ready = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!ready.length) return null;
  return ready.reduce((sum, value) => sum + value, 0) / ready.length;
}

export function mergeHourly(okSources) {
  const groups = new Map();
  for (const source of okSources) {
    for (const row of source.data.hourly || []) {
      const key = String(row.time).slice(0, 13);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, rows]) => ({
      time: rows[0].time || `${key}:00`,
      temp: round1(average(rows.map((row) => row.temp))),
      precip: round1(average(rows.map((row) => row.precip))),
      wind: round1(average(rows.map((row) => row.wind))),
      humidity: round1(average(rows.map((row) => row.humidity))),
      code: mode(rows.map((row) => row.code)),
      bySource: Object.fromEntries(rows.filter((row) => row.source).map((row) => [row.source, row])),
    }));
}

/** Values shown for a display priority. A missing source keeps the averaged row. */
export function presentWeather(weather, priority) {
  if (!weather || !priority || priority === "average") return weather;
  const pick = (row) => {
    const preferred = row?.bySource?.[priority];
    if (!preferred) return row;
    return { ...row, ...preferred, bySource: row.bySource };
  };
  return {
    ...weather,
    daily: (weather.daily || []).map(pick),
    hourly: (weather.hourly || []).map(pick),
  };
}

function mode(values) {
  const counts = new Map();
  for (const value of values) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = null;
  let score = -1;
  for (const [value, count] of counts) {
    if (count > score) {
      best = value;
      score = count;
    }
  }
  return best;
}

function round1(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}
