import { metSymbolToWmo, wttrToWmo } from "./wmo.js";

export const SOURCE_IDS = ["ecmwf", "gfs", "jma", "metno", "wttr"];

const MODELS = {
  ecmwf: "ecmwf_ifs025",
  gfs: "gfs_seamless",
  jma: "jma_seamless",
};

export function openMeteoUrl(location, model) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.lat));
  url.searchParams.set("longitude", String(location.lon));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "16");
  url.searchParams.set("past_days", "14");
  url.searchParams.set("models", model);
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
  );
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
  return url.toString();
}

export function metNoUrl(location) {
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", Number(location.lat).toFixed(4));
  url.searchParams.set("lon", Number(location.lon).toFixed(4));
  return url.toString();
}

export function wttrUrl(location) {
  const name = location.cityEn || location.cityKo || `${location.lat},${location.lon}`;
  return `https://wttr.in/${encodeURIComponent(name)}?format=j1`;
}

export function geocodeUrl(name, language) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", language === "ko" ? "ko" : "en");
  return url.toString();
}

export function sourcePageUrl(location) {
  return openMeteoUrl(location, MODELS.ecmwf);
}

export function createProviders() {
  return [
    modelProvider("ecmwf"),
    modelProvider("gfs"),
    modelProvider("jma"),
    {
      id: "metno",
      headers: { "User-Agent": "MyWeather/1.0 (knix008@naver.com)" },
      url: metNoUrl,
      parse: (json) => parseMetNo(json),
    },
    {
      id: "wttr",
      headers: {},
      url: wttrUrl,
      parse: (json) => parseWttr(json),
    },
  ];
}

export function parseOpenMeteo(json, sourceId) {
  const daily = json?.daily;
  if (!daily?.time) {
    const reason = json?.reason || "Missing daily forecast";
    throw new Error(reason);
  }
  const hourly = (json.hourly?.time || []).map((time, index) => ({
    time,
    temp: num(json.hourly.temperature_2m?.[index]),
    precip: num(json.hourly.precipitation?.[index]),
    wind: num(json.hourly.wind_speed_10m?.[index]),
    humidity: num(json.hourly.relative_humidity_2m?.[index]),
    code: num(json.hourly.weather_code?.[index]),
    source: sourceId,
  }));
  const humidity = humidityByDate(hourly);
  const days = daily.time.map((date, index) => ({
    date,
    tempMin: num(daily.temperature_2m_min?.[index]),
    tempMax: num(daily.temperature_2m_max?.[index]),
    precip: num(daily.precipitation_sum?.[index]),
    wind: num(daily.wind_speed_10m_max?.[index]),
    humidity: humidity.get(date) ?? null,
    code: num(daily.weather_code?.[index]),
    source: sourceId,
  }));
  return { daily: days, hourly };
}

export function parseMetNo(json) {
  const series = json?.properties?.timeseries;
  if (!Array.isArray(series)) throw new Error("Missing MET Norway timeseries");
  const days = new Map();
  const hourly = [];
  for (const entry of series) {
    const time = entry.time;
    const details = entry.data?.instant?.details || {};
    const next = entry.data?.next_1_hours || entry.data?.next_6_hours || {};
    const date = String(time).slice(0, 10);
    const hour = {
      time,
      temp: num(details.air_temperature),
      precip: num(next.details?.precipitation_amount),
      wind: details.wind_speed == null ? null : Number(details.wind_speed) * 3.6,
      humidity: num(details.relative_humidity),
      code: metSymbolToWmo(next.summary?.symbol_code),
      source: "metno",
    };
    hourly.push(hour);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(hour);
  }
  const daily = [...days.entries()].map(([date, rows]) => ({
    date,
    tempMin: minOf(rows.map((row) => row.temp)),
    tempMax: maxOf(rows.map((row) => row.temp)),
    precip: sumOf(rows.map((row) => row.precip)),
    wind: maxOf(rows.map((row) => row.wind)),
    humidity: avgOf(rows.map((row) => row.humidity)),
    code: rows.find((row) => row.code != null)?.code ?? 2,
    source: "metno",
  }));
  return { daily, hourly };
}

export function parseWttr(json) {
  const weather = json?.weather;
  if (!Array.isArray(weather)) throw new Error("Missing wttr.in weather");
  const daily = [];
  const hourly = [];
  for (const day of weather) {
    const hours = Array.isArray(day.hourly) ? day.hourly : [];
    const mapped = hours.map((hour) => {
      const hh = String(hour.time || "0").padStart(4, "0");
      return {
        time: `${day.date}T${hh.slice(0, 2)}:00`,
        temp: num(hour.tempC),
        precip: num(hour.precipMM),
        wind: num(hour.windspeedKmph),
        humidity: num(hour.humidity),
        code: wttrToWmo(hour.weatherCode),
        source: "wttr",
      };
    });
    hourly.push(...mapped);
    daily.push({
      date: day.date,
      tempMin: num(day.mintempC),
      tempMax: num(day.maxtempC),
      precip: sumOf(mapped.map((row) => row.precip)),
      wind: maxOf(mapped.map((row) => row.wind)),
      humidity: avgOf(mapped.map((row) => row.humidity)),
      code: mapped[0]?.code ?? 2,
      source: "wttr",
    });
  }
  return { daily, hourly };
}

export function parseGeocoding(json) {
  return (json?.results || []).map((row) => ({
    id: row.id ?? null,
    countryCode: String(row.country_code || "").toUpperCase(),
    countryKo: row.country || "",
    countryEn: row.country || "",
    cityKo: row.name || "",
    cityEn: row.name || "",
    lat: row.latitude,
    lon: row.longitude,
    admin: row.admin1 || "",
  }));
}

/**
 * The geocoder answers in one language at a time, so a city found in Korean has no English
 * name and the other way round. Matching the two answers by id gives a place with both.
 */
function spotOf(row) {
  return `${Number(row?.lat).toFixed(2)}|${Number(row?.lon).toFixed(2)}`;
}

export function mergeGeocoding(korean, english) {
  const byId = new Map();
  const bySpot = new Map();
  for (const row of english || []) {
    if (row.id != null) byId.set(row.id, row);
    if (!bySpot.has(spotOf(row))) bySpot.set(spotOf(row), row);
  }
  const merged = (korean || []).map((row) => {
    // The two answers rarely carry the same ids, so where they fall is the surer match.
    const other = (row.id == null ? null : byId.get(row.id)) || bySpot.get(spotOf(row)) || null;
    if (other) {
      if (other.id != null) byId.delete(other.id);
      bySpot.delete(spotOf(other));
    }
    return {
      id: row.id,
      countryCode: row.countryCode || other?.countryCode || "",
      countryKo: row.countryKo || other?.countryEn || "",
      countryEn: other?.countryEn || row.countryKo || "",
      cityKo: row.cityKo || other?.cityEn || "",
      cityEn: other?.cityEn || row.cityKo || "",
      lat: row.lat,
      lon: row.lon,
      admin: row.admin || other?.admin || "",
    };
  });
  for (const row of bySpot.values()) {
    merged.push({ ...row, cityKo: row.cityKo || row.cityEn, countryKo: row.countryKo || row.countryEn });
  }
  const seen = new Set();
  return merged.filter((row) => {
    const spot = spotOf(row);
    if (seen.has(spot)) return false;
    seen.add(spot);
    return true;
  });
}

function modelProvider(id) {
  return {
    id,
    headers: {},
    url: (location) => openMeteoUrl(location, MODELS[id]),
    parse: (json) => parseOpenMeteo(json, id),
  };
}

function humidityByDate(hourly) {
  const buckets = new Map();
  for (const row of hourly) {
    if (row.humidity == null) continue;
    const date = row.time.slice(0, 10);
    if (!buckets.has(date)) buckets.set(date, []);
    buckets.get(date).push(row.humidity);
  }
  const out = new Map();
  for (const [date, values] of buckets) out.set(date, avgOf(values));
  return out;
}

function num(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function values(list) {
  return list.filter((value) => typeof value === "number" && !Number.isNaN(value));
}

function avgOf(list) {
  const ready = values(list);
  if (!ready.length) return null;
  return ready.reduce((sum, value) => sum + value, 0) / ready.length;
}

function minOf(list) {
  const ready = values(list);
  if (!ready.length) return null;
  return Math.min(...ready);
}

function maxOf(list) {
  const ready = values(list);
  if (!ready.length) return null;
  return Math.max(...ready);
}

function sumOf(list) {
  const ready = values(list);
  if (!ready.length) return null;
  return ready.reduce((sum, value) => sum + value, 0);
}
