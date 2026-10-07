export function buildPrintModel({
  scope,
  tabs,
  activeIndex,
  fromDate,
  toDate,
  pageSetup,
  language,
}) {
  const setup = normalizeSetup(pageSetup);
  if (scope === "custom" && fromDate && toDate && fromDate > toDate) {
    const error = new Error("Invalid range");
    error.code = "PRINT_RANGE";
    throw error;
  }
  const chosen = selectTabs(scope, tabs, activeIndex);
  const lines = [];
  for (const tab of chosen) {
    const city = language === "ko" ? tab.place.cityKo || tab.place.cityEn : tab.place.cityEn || tab.place.cityKo;
    const country = language === "ko" ? tab.place.countryKo || tab.place.countryEn : tab.place.countryEn || tab.place.countryKo;
    lines.push({ kind: "h", text: `${city} (${country})` });
    if (tab.properties?.label) lines.push({ kind: "p", text: tab.properties.label });
    const days = filterDays(tab, scope, fromDate, toDate);
    if (!days.length) lines.push({ kind: "p", text: language === "ko" ? "날씨 데이터 없음" : "No weather data" });
    for (const day of days) {
      lines.push({
        kind: "p",
        text: `${day.date}  ${fmt(day.tempMin)}~${fmt(day.tempMax)}  ${fmt(day.precip)}mm  ${fmt(day.wind)}km/h`,
      });
    }
  }
  if (!lines.length) lines.push({ kind: "p", text: language === "ko" ? "빈 문서" : "Empty document" });
  const perPage = setup.orientation === "landscape" ? 8 : 12;
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return { pages, pageSetup: setup, html: renderHtml(pages, setup) };
}

export function normalizeSetup(pageSetup = {}) {
  const paper = ["A4", "A3", "Letter"].includes(pageSetup.paper) ? pageSetup.paper : "A4";
  const orientation = pageSetup.orientation === "landscape" ? "landscape" : "portrait";
  const margin = [10, 15, 20].includes(Number(pageSetup.margin)) ? Number(pageSetup.margin) : 15;
  return { paper, orientation, margin };
}

function selectTabs(scope, tabs, activeIndex) {
  if (scope === "all") return tabs;
  const index = Math.max(0, Math.min(tabs.length - 1, activeIndex));
  return [tabs[index]];
}

function filterDays(tab, scope, fromDate, toDate) {
  const daily = tab.weather?.daily || [];
  if (scope !== "custom") return daily;
  return daily.filter((day) => (!fromDate || day.date >= fromDate) && (!toDate || day.date <= toDate));
}

function fmt(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return String(Math.round(Number(value) * 10) / 10);
}

function renderHtml(pages, setup) {
  const size = `${setup.paper} ${setup.orientation}`;
  const body = pages
    .map(
      (page, index) =>
        `<section class="sheet"><h1>MyWeather</h1>${page
          .map((line) => (line.kind === "h" ? `<h2>${escapeHtml(line.text)}</h2>` : `<p>${escapeHtml(line.text)}</p>`))
          .join("")}<footer>${index + 1} / ${pages.length}</footer></section>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MyWeather</title><style>
    @page { size: ${size}; margin: ${setup.margin}mm; }
    body { margin: 0; font-family: sans-serif; color: #122; }
    .sheet { page-break-after: always; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 8px 0; }
    p { margin: 2px 0; font-size: 12px; white-space: nowrap; }
  </style></head><body>${body}</body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
