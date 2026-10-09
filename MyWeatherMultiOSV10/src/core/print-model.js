import { renderForecastHtml, forecastWhen } from "../ui/weather-view.js";
import { printDocumentCss } from "./print-style.js";

export const PRINT_RANGES = ["daily", "weekly", "monthly"];
/** Paper sizes in millimetres, upright. The preview keeps these proportions whatever is on them. */
export const PAPER_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  B5: { width: 176, height: 250 },
};
export const PAPERS = Object.keys(PAPER_MM);
export const PAGE_NUMBER_SPOTS = ["left", "center", "right"];

/** The sheet in millimetres, turned on its side when the setup asks for landscape. */
export function paperSize(setup) {
  const size = PAPER_MM[setup?.paper] || PAPER_MM.A4;
  return setup?.orientation === "landscape" ? { width: size.height, height: size.width } : { ...size };
}
export const MARGINS = [5, 10, 15, 20, 25, 30];
export const SCALES = [80, 90, 100, 110, 125];

const WORDS = {
  ko: { daily: "일간 예보", weekly: "주간 예보", monthly: "월간 예보", none: "날씨 데이터 없음", empty: "인쇄할 내용이 없습니다" },
  en: { daily: "Daily forecast", weekly: "Weekly forecast", monthly: "Monthly forecast", none: "No weather data", empty: "Nothing to print" },
};

/**
 * A page per city and range, carrying the same markup the forecast windows draw, so the
 * printed sheet shows the pictures, the dates and the temperatures rather than a list of text.
 */
export function buildPrintModel({
  scope,
  tabs,
  activeIndex,
  fromDate,
  toDate,
  pageSetup,
  language,
  ranges,
  today = new Date(),
  units = "C",
  priority = "average",
  dateFormat = "long",
  t = (key) => key,
}) {
  const setup = normalizeSetup(pageSetup);
  if (scope === "custom" && fromDate && toDate && fromDate > toDate) {
    const error = new Error("Invalid range");
    error.code = "PRINT_RANGE";
    throw error;
  }
  const words = WORDS[language === "en" ? "en" : "ko"];
  const wanted = normalizeRanges(ranges);
  const pages = [];
  for (const tab of selectTabs(scope, tabs, activeIndex)) {
    const city = language === "ko" ? tab.place.cityKo || tab.place.cityEn : tab.place.cityEn || tab.place.cityKo;
    const country = language === "ko" ? tab.place.countryKo || tab.place.countryEn : tab.place.countryEn || tab.place.countryKo;
    const trimmed = withDays(tab, scope, fromDate, toDate);
    for (const range of wanted) {
      const shared = { range, tab: trimmed, language, units, priority, dateFormat, today, t, anchor: anchorFor(trimmed, today) };
      pages.push({
        city,
        country,
        range,
        rangeLabel: words[range],
        when: trimmed.weather?.daily?.length ? forecastWhen(shared) : words.none,
        body: renderForecastHtml(shared),
      });
    }
  }
  if (!pages.length) pages.push({ city: "MyWeather", country: "", range: "daily", rangeLabel: "", when: "", body: `<p class="empty">${esc(words.empty)}</p>` });
  return { pages, pageSetup: setup, ranges: wanted, html: renderDocument(pages, setup) };
}

export function normalizeRanges(ranges) {
  const wanted = PRINT_RANGES.filter((range) => (Array.isArray(ranges) ? ranges.includes(range) : true));
  return wanted.length ? wanted : [...PRINT_RANGES];
}

export function normalizeSetup(pageSetup = {}) {
  const paper = PAPERS.includes(pageSetup.paper) ? pageSetup.paper : "A4";
  const orientation = pageSetup.orientation === "landscape" ? "landscape" : "portrait";
  const margin = MARGINS.includes(Number(pageSetup.margin)) ? Number(pageSetup.margin) : 15;
  const scale = SCALES.includes(Number(pageSetup.scale)) ? Number(pageSetup.scale) : 100;
  const header = pageSetup.header === undefined ? true : Boolean(pageSetup.header);
  const pageNumber = pageSetup.pageNumber === undefined ? true : Boolean(pageSetup.pageNumber);
  const pageNumberAt = PAGE_NUMBER_SPOTS.includes(pageSetup.pageNumberAt) ? pageSetup.pageNumberAt : "right";
  return { paper, orientation, margin, scale, header, pageNumber, pageNumberAt };
}

/** The head block a page carries, used by the preview and the printed sheet alike. */
export function pageHeadHtml(page, header = true) {
  if (!header) return "";
  return `<header class="sheet-head"><span class="sheet-city">${esc(page.city)}</span><span class="sheet-country">${esc(page.country)}</span><span class="sheet-range">${esc(page.rangeLabel)}</span></header><div class="sheet-when">${esc(page.when)}</div>`;
}

/** The foot carries the page number where the setup asks for it, or nothing at all. */
export function pageFootHtml(setup, index, total) {
  if (!setup?.pageNumber) return "";
  const at = PAGE_NUMBER_SPOTS.includes(setup.pageNumberAt) ? setup.pageNumberAt : "right";
  return `<footer class="sheet-foot" data-at="${at}"><span class="page-no">${index + 1} / ${total}</span></footer>`;
}

export function pageHtml(page, setup, index = 0, total = 1) {
  return `${pageHeadHtml(page, setup.header)}<div class="sheet-body">${page.body}</div>${pageFootHtml(setup, index, total)}`;
}

function renderDocument(pages, setup) {
  const sheets = pages
    .map(
      (page, index) =>
        `<section class="sheet">${pageHtml(page, setup, index, pages.length)}</section>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MyWeather</title><style>${printDocumentCss(setup)}</style></head><body class="print-doc">${sheets}</body></html>`;
}

function selectTabs(scope, tabs, activeIndex) {
  if (scope === "all") return tabs;
  const index = Math.max(0, Math.min(tabs.length - 1, activeIndex));
  return [tabs[index]].filter(Boolean);
}

/** A custom range prints only the days asked for, so the calendar shows that span alone. */
function withDays(tab, scope, fromDate, toDate) {
  if (scope !== "custom" || !tab.weather) return tab;
  const daily = (tab.weather.daily || []).filter((day) => (!fromDate || day.date >= fromDate) && (!toDate || day.date <= toDate));
  const keep = new Set(daily.map((day) => day.date));
  const hourly = (tab.weather.hourly || []).filter((row) => keep.has(String(row.time).slice(0, 10)));
  return { ...tab, weather: { ...tab.weather, daily, hourly } };
}

function anchorFor(tab, today) {
  const daily = tab.weather?.daily || [];
  if (!daily.length) return "";
  const key = isoOf(today);
  return daily.some((day) => day.date === key) ? key : daily[0].date;
}

function isoOf(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
