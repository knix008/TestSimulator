import { esc } from "./html.js";
import { presentWeather } from "../weather/aggregate.js";
import { formatTemp, isoDate } from "../weather/format.js";
import { conditionIcon, conditionText } from "../weather/wmo.js";

export function renderWeatherHtml({ tab, language, units, today, t, priority = "average", dateFormat = "long", cityCount = 1 }) {
  const shown = preferTab(tab, priority);
  const city = language === "ko" ? tab?.place?.cityKo || tab?.place?.cityEn || "" : tab?.place?.cityEn || tab?.place?.cityKo || "";
  const reading = todayReading(shown, today);
  const code = reading?.code ?? 1;
  const art = conditionIcon(code);
  const advance = cityCount > 1 ? ` data-scene-advance="1" title="${esc(t("tip.nextCity"))}"` : "";
  const scene = `<section class="weather-scene" data-gui="scene"${advance}>
      ${sceneArt(art)}
      <div class="scene-copy">
        <div class="scene-city">${esc(city)}</div>
        <div class="scene-date" data-gui="scene-date">${esc(formatDay(isoDate(today), language, dateFormat, t) || "\u00a0")}</div>
        <div class="scene-temp">${esc(reading ? formatTemp(reading.temp, units) : "—")}</div>
        <div class="scene-cond">${esc(reading ? conditionText(code, language) : t("weather.empty"))}</div>
        <div class="scene-range">${esc(reading ? `${formatTemp(reading.day.tempMin, units)} – ${formatTemp(reading.day.tempMax, units)}` : "\u00a0")}</div>
      </div>
    </section>`;
  return `<div class="weather">${scene}</div>`;
}

export function renderForecastHtml({ range, tab, language, units, today, t, priority = "average", dateFormat = "long", anchor = "" }) {
  const shown = preferTab(tab, priority);
  tab = shown;
  const weather = tab?.weather;
  if (!weather?.daily?.length) return `<p class="empty" data-gui="empty">${esc(t("weather.empty"))}</p>`;
  const basis = anchor || isoDate(today);
  if (range === "daily") return hoursHtml(dayRecord(tab, basis), tab, language, units, t);
  if (range === "weekly") return weekHtml(weather.daily, tab, language, units, today, t, dateFormat, basis);
  return monthHtml(weather.daily, tab, language, units, today, t, dateFormat);
}

export function forecastFitHeight(range, hasWeather) {
  if (!hasWeather) return 72;
  if (range === "weekly") return 96;
  if (range === "monthly") return 500;
  return 300;
}

export function forecastWhen({ range, tab, language, today, priority = "average", dateFormat = "long", t, anchor = "" }) {
  const shown = preferTab(tab, priority);
  if (range === "weekly") return weekTitle(weekStart(dateOf(anchor, today)), language, dateFormat, t);
  if (range === "monthly") return monthTitle(today, language, dateFormat);
  return formatDay(anchor || currentReading(shown, today)?.day?.date || isoDate(today), language, dateFormat, t);
}

function preferTab(tab, priority) {
  if (!tab?.weather) return tab;
  return { ...tab, weather: presentWeather(tab.weather, priority) };
}

function dayRecord(tab, iso) {
  return (tab?.weather?.daily || []).find((row) => row.date === iso) || { date: iso };
}

function todayReading(tab, today) {
  const todayKey = isoDate(today);
  const day = (tab?.weather?.daily || []).find((row) => row.date === todayKey);
  if (!day) return null;
  const hours = (tab.weather.hourly || []).filter((row) => String(row.time).slice(0, 10) === todayKey);
  const hour = nearestHour(hours, today);
  return { day, hour, temp: hour?.temp ?? day.tempMax, code: hour?.code ?? day.code };
}

function currentReading(tab, today) {
  const daily = tab?.weather?.daily || [];
  if (!daily.length) return null;
  const todayKey = isoDate(today);
  const date = tab.selectedDate || todayKey;
  const day = daily.find((row) => row.date === date) || daily.find((row) => row.date === todayKey) || daily[0];
  const hours = (tab.weather.hourly || []).filter((row) => String(row.time).slice(0, 10) === day.date);
  const hour = nearestHour(hours, today);
  return { day, hour, temp: hour?.temp ?? day.tempMax, code: hour?.code ?? day.code };
}

function nearestHour(hours, today) {
  if (!hours.length) return null;
  const minutes = today.getHours() * 60 + today.getMinutes();
  let best = hours[0];
  let score = Infinity;
  for (const hour of hours) {
    const [hh, mm] = String(hour.time).slice(11, 16).split(":");
    const delta = Math.abs(Number(hh) * 60 + Number(mm || 0) - minutes);
    if (delta < score) {
      score = delta;
      best = hour;
    }
  }
  return best;
}

const HOUR_BANDS = [
  ["night", 0],
  ["morning", 6],
  ["afternoon", 12],
  ["evening", 18],
];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function hoursHtml(day, tab, language, units, t) {
  const byHour = new Map();
  for (const hour of tab.weather?.hourly || []) {
    if (!day || String(hour.time).slice(0, 10) !== day.date) continue;
    const index = Number(String(hour.time).slice(11, 13));
    if (Number.isInteger(index) && index >= 0 && index <= 23 && !byHour.has(index)) byHour.set(index, hour);
  }
  const bands = HOUR_BANDS.map(([id, from]) => {
    const cells = [];
    for (let hourIndex = from; hourIndex < from + 6; hourIndex += 1) {
      const hour = byHour.get(hourIndex);
      const label = hourLabel(hourIndex, language);
      if (!hour) {
        cells.push(`<div class="hour is-empty"><span>${esc(label)}</span><span>—</span></div>`);
        continue;
      }
      const title = `${label} ${conditionText(hour.code, language)} ${formatTemp(hour.temp, units)}`;
      cells.push(
        `<button type="button" class="hour" data-gui="hour" data-hour="${esc(hour.time)}" title="${esc(title)}">${sceneArt(conditionIcon(hour.code), 22)}<span>${esc(label)}</span><span>${esc(formatTemp(hour.temp, units))}</span></button>`,
      );
    }
    return `<div class="hour-band" data-band="${id}"><span class="band-name">${esc(t(`period.${id}`))}</span>${cells.join("")}</div>`;
  }).join("");
  return `<div class="hour-board" data-gui="hours">${bands}</div>`;
}

function weekHtml(days, tab, language, units, today, t, dateFormat, anchor) {
  const start = weekStart(dateOf(anchor, today));
  const byDate = new Map(days.map((day) => [day.date, day]));
  const cells = WEEKDAYS.map((id, index) => {
    const date = addDays(start, index);
    const key = isoDate(date);
    return dayCell({
      dateKey: key,
      day: byDate.get(key),
      tab,
      language,
      units,
      today,
      name: t(`weekday.${id}`),
      iconSize: 26,
    });
  }).join("");
  return `<div class="range-title">${esc(weekTitle(start, language, dateFormat, t))}</div><div class="week-row" data-gui="week">${cells}</div>`;
}

function monthHtml(days, tab, language, units, today, t, dateFormat) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const cursor = addDays(first, -first.getDay());
  const last = new Date(year, month + 1, 0);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const heads = WEEKDAYS.map((id) => `<div class="month-head">${esc(t(`weekday.${id}`))}</div>`).join("");
  const cells = [];
  while (cursor <= last || cursor.getDay() !== 0) {
    const key = isoDate(cursor);
    const outside = cursor.getMonth() !== month;
    if (outside) cells.push(`<div class="day is-outside"><span class="day-num">${cursor.getDate()}</span></div>`);
    else {
      cells.push(
        dayCell({
          dateKey: key,
          day: byDate.get(key),
          tab,
          language,
          units,
          today,
          name: "",
          iconSize: 20,
        }),
      );
    }
    cursor.setDate(cursor.getDate() + 1);
    if (cells.length > 42) break;
  }
  return `<div class="range-title">${esc(monthTitle(today, language, dateFormat))}</div><div class="month-cal" data-gui="month">${heads}${cells.join("")}</div>`;
}

function dayCell({ dateKey, day, tab, language, units, today, name, iconSize }) {
  const selected = dateKey === tab.selectedDate ? " is-selected" : "";
  const alert = day && isAlert(day, tab) ? " is-alert" : "";
  const todayMark = dateKey === isoDate(today) ? " is-today" : "";
  const art = day ? sceneArt(conditionIcon(day.code), iconSize) : `<span class="hour-gap">—</span>`;
  const temps = day
    ? `<span class="temps"><span>${esc(formatTemp(day.tempMin, units))}</span><span>${esc(formatTemp(day.tempMax, units))}</span></span>`
    : "";
  const condition = day ? `${conditionText(day.code, language)} ` : "";
  const range = day ? `${formatTemp(day.tempMin, units)} – ${formatTemp(day.tempMax, units)}` : "";
  const title = `${name ? `${name} ` : ""}${dateKey} ${condition}${range}`.trim();
  const head = name ? `<span class="weekday">${esc(name)}</span>` : "";
  return `<button type="button" class="day${selected}${alert}${todayMark}" data-gui="day" data-date="${esc(dateKey)}" title="${esc(title)}">${head}<span class="day-num">${Number(dateKey.slice(8))}</span>${art}${temps}</button>`;
}

function hourLabel(hour, language) {
  if (language === "ko") return `${hour}시`;
  const hour12 = hour % 12 || 12;
  return `${hour12} ${hour < 12 ? "AM" : "PM"}`;
}

function dateOf(iso, fallback) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return fallback;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function weekStart(today) {
  return addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -today.getDay());
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatDay(iso, language, format = "long", t) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return "";
  if (format === "iso") return `${year}-${match[2]}-${match[3]}`;
  if (format === "dot") return `${year}. ${month}. ${day}.`;
  if (format === "slash") return `${year}/${match[2]}/${match[3]}`;
  const long = language === "ko" ? `${month}월 ${day}일` : `${MONTH_EN[month - 1]} ${day}`;
  if (format !== "weekday") return long;
  const name = t?.(`weekday.${WEEKDAYS[new Date(year, month - 1, day).getDay()]}`) || "";
  if (!name) return long;
  return language === "ko" ? `${long} (${name})` : `${name}, ${long}`;
}

function weekTitle(start, language, format = "long", t) {
  const end = addDays(start, 6);
  if (format === "iso" || format === "dot" || format === "slash" || format === "weekday") {
    return `${formatDay(isoDate(start), language, format, t)} – ${formatDay(isoDate(end), language, format, t)}`;
  }
  if (language === "ko") return `${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;
  return `${MONTH_EN[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTH_EN[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
}

function monthTitle(today, language, format = "long") {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  if (format === "iso") return `${year}-${String(month).padStart(2, "0")}`;
  if (format === "dot") return `${year}. ${month}.`;
  if (format === "slash") return `${year}/${String(month).padStart(2, "0")}`;
  if (language === "ko") return `${year}년 ${month}월`;
  return `${MONTH_EN[today.getMonth()]} ${year}`;
}

function sceneArt(name, size = 240) {
  const pictures = {
    sun: `<circle cx="60" cy="60" r="18" fill="#ffd15c"/><g stroke="#ffb703" stroke-width="4" stroke-linecap="round"><path d="M60 16v12M60 92v12M16 60h12M92 60h12M28 28l9 9M83 83l9 9M92 28l-9 9M37 83l-9 9"/></g>`,
    partly: `<circle cx="42" cy="46" r="14" fill="#ffd15c"/><path d="M38 86h44a16 16 0 0 0 1-32 22 22 0 0 0-42 6 14 14 0 0 0-3 26z" fill="#f4f8ff" stroke="#9db4c8"/>`,
    cloud: `<path d="M30 82h52a18 18 0 0 0 2-36 26 26 0 0 0-50 7 16 16 0 0 0-4 29z" fill="#f7fbff" stroke="#8eabc4"/>`,
    rain: `<path d="M32 70h50a16 16 0 0 0 1-32 24 24 0 0 0-46 6 14 14 0 0 0-5 26z" fill="#eef5fb" stroke="#8eabc4"/><g stroke="#3d8bfd" stroke-width="3" stroke-linecap="round"><path d="M42 78l-4 12M58 78l-4 12M74 78l-4 12"/></g>`,
    snow: `<path d="M32 70h50a16 16 0 0 0 1-32 24 24 0 0 0-46 6 14 14 0 0 0-5 26z" fill="#f7fbff" stroke="#8eabc4"/><g fill="#7ec8ff"><circle cx="44" cy="86" r="3"/><circle cx="60" cy="92" r="3"/><circle cx="76" cy="84" r="3"/></g>`,
    storm: `<path d="M32 68h50a16 16 0 0 0 1-32 24 24 0 0 0-46 6 14 14 0 0 0-5 26z" fill="#d9e3ef" stroke="#6d8194"/><path d="M58 66l-10 16h10l-4 14 16-20H60z" fill="#ffd15c"/>`,
    fog: `<g stroke="#9aa8b5" stroke-width="6" stroke-linecap="round"><path d="M24 46h72M18 64h84M28 82h64"/></g>`,
  };
  const body = pictures[name] || pictures.cloud;
  return `<span class="scene-art" data-art="${esc(name)}"><svg class="scene-svg" viewBox="12 12 96 96" width="${size}" height="${size}" aria-hidden="true">${body}</svg></span>`;
}

function isAlert(day, tab) {
  const high = Number(tab.properties?.alertHigh);
  const low = Number(tab.properties?.alertLow);
  if (tab.properties?.alertHigh !== "" && Number.isFinite(high) && day.tempMax != null && day.tempMax >= high) return true;
  if (tab.properties?.alertLow !== "" && Number.isFinite(low) && day.tempMin != null && day.tempMin <= low) return true;
  return false;
}

