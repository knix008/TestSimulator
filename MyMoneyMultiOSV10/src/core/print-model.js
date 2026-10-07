import { formatPercent, formatPrice, formatRate, formatSigned, quotePair } from "../market/format.js";
import { countryName, currencyName, listingName, marketName } from "../market/markets.js";

export function buildPrintModel({ scope, tabs, activeIndex, fromDate, toDate, pageSetup, language }) {
  const setup = normalizeSetup(pageSetup);
  if (scope === "custom" && fromDate && toDate && fromDate > toDate) {
    const error = new Error("Invalid range");
    error.code = "PRINT_RANGE";
    throw error;
  }
  const chosen = selectTabs(scope, tabs, activeIndex);
  const lines = [];
  for (const tab of chosen) {
    const market = marketName(tab.board, language);
    const country = countryName(tab.board, language);
    lines.push({ kind: "h", text: `${market} (${country})` });
    if (tab.properties?.label) lines.push({ kind: "p", text: tab.properties.label });
    const quotes = tab.data?.quotes || [];
    if (!quotes.length) lines.push({ kind: "p", text: language === "ko" ? "시세 없음" : "No quotes" });
    for (const quote of quotes) {
      const listing = (tab.board.symbols || []).find((entry) => entry.symbol === quote.symbol);
      const name = listing ? listingName(listing, language) : quote.name || quote.symbol;
      lines.push({
        kind: "p",
        text: `${quote.symbol}  ${name}  ${formatPrice(quote.last, quote.currency, language)} ${quote.currency || ""}  ${formatSigned(quote.change, quote.currency, language)}  ${formatPercent(quote.changePercent)}`,
      });
      for (const day of filterDays(quote, scope, fromDate, toDate)) {
        lines.push({
          kind: "p",
          text: `    ${day.date}  ${formatPrice(day.open, quote.currency, language)} / ${formatPrice(day.high, quote.currency, language)} / ${formatPrice(day.low, quote.currency, language)} / ${formatPrice(day.close, quote.currency, language)}`,
        });
      }
    }
    const rates = tab.data?.rates;
    if (rates?.rows?.length) {
      lines.push({ kind: "h", text: language === "ko" ? `환율 (기준 ${rates.base})` : `Exchange rates (base ${rates.base})` });
      for (const row of rates.rows) {
        const quoted = quotePair(rates.base, row.code, row.rate);
        lines.push({ kind: "p", text: `${quoted.pair}  ${formatRate(quoted.value, language)}  ${currencyName(row.code, language)}` });
      }
    }
    const news = tab.data?.news || [];
    if (news.length) {
      lines.push({ kind: "h", text: language === "ko" ? "오늘의 뉴스" : "Today's news" });
      for (const item of news.slice(0, 20)) lines.push({ kind: "p", text: `${item.title}  — ${item.outlet || ""}` });
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

/** Only a custom scope prints the daily series; the other scopes stay on one line per symbol. */
function filterDays(quote, scope, fromDate, toDate) {
  if (scope !== "custom") return [];
  return (quote.days || []).filter((day) => (!fromDate || day.date >= fromDate) && (!toDate || day.date <= toDate));
}

function renderHtml(pages, setup) {
  const size = `${setup.paper} ${setup.orientation}`;
  const body = pages
    .map(
      (page, index) =>
        `<section class="sheet"><h1>MyMoney</h1>${page
          .map((line) => (line.kind === "h" ? `<h2>${escapeHtml(line.text)}</h2>` : `<p>${escapeHtml(line.text)}</p>`))
          .join("")}<footer>${index + 1} / ${pages.length}</footer></section>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MyMoney</title><style>
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
