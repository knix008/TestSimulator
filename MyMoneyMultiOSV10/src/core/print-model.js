import { presentBoard } from "../market/aggregate.js";
import { formatAsOf, formatPercent, formatPrice, formatRate, formatSigned, formatVolume, formatWhen, quotePair } from "../market/format.js";
import { countryName, currencyName, findMarket, listingName, marketName } from "../market/markets.js";
import { trendOf, trendTone } from "../market/trend.js";
import { convert, shownRateRows } from "../ui/market-view.js";
import { printDocumentCss } from "./print-style.js";

/** What can go on paper: the three panels of the window. */
export const PRINT_SECTIONS = ["stocks", "rates", "news"];
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
export const MARGINS = [5, 10, 15, 20, 25, 30];
export const SCALES = [80, 90, 100, 110, 125];

/** The sheet in millimetres, turned on its side when the setup asks for landscape. */
export function paperSize(setup) {
  const size = PAPER_MM[setup?.paper] || PAPER_MM.A4;
  return setup?.orientation === "landscape" ? { width: size.height, height: size.width } : { ...size };
}

/** Rows that fit one sheet, so a long watchlist or a busy news day runs onto more pages. */
function rowsPerPage(setup, kind) {
  const size = paperSize(setup);
  const usable = size.height - 2 * setup.margin - 40;
  const rowMm = (kind === "news" ? 11 : 7) * (setup.scale / 100);
  return Math.max(4, Math.floor(usable / rowMm));
}

const WORDS = {
  ko: {
    stocks: "주식 시세",
    rates: "환율",
    news: "오늘의 뉴스",
    history: "가격 기록",
    empty: "인쇄할 내용이 없습니다",
    noQuotes: "시세 없음",
    noRates: "환율 없음",
    noNews: "뉴스 없음",
    base: "기준",
    cols: { name: "종목", exchange: "시장", price: "현재가", change: "변동", percent: "등락률", volume: "거래량", pair: "통화쌍", rate: "환율", currency: "통화", date: "날짜", open: "시가", high: "고가", low: "저가", close: "종가" },
  },
  en: {
    stocks: "Stock quotes",
    rates: "Exchange rates",
    news: "Today's news",
    history: "Price history",
    empty: "Nothing to print",
    noQuotes: "No quotes",
    noRates: "No rates",
    noNews: "No news",
    base: "base",
    cols: { name: "Symbol", exchange: "Market", price: "Price", change: "Change", percent: "Change %", volume: "Volume", pair: "Pair", rate: "Rate", currency: "Currency", date: "Date", open: "Open", high: "High", low: "Low", close: "Close" },
  },
};

/**
 * A page per board and section - quotes, rates, news - laid out as plain tables
 * so the sheet reads like a report. A custom date range adds the daily prices
 * of every quote inside that range.
 */
export function buildPrintModel({
  scope,
  tabs,
  activeIndex,
  fromDate,
  toDate,
  pageSetup,
  language,
  sections,
  units = "native",
  baseCurrency = "",
  currencies = null,
  priority = "average",
  today = new Date(),
}) {
  const setup = normalizeSetup(pageSetup);
  if (scope === "custom" && fromDate && toDate && fromDate > toDate) {
    const error = new Error("Invalid range");
    error.code = "PRINT_RANGE";
    throw error;
  }
  const lang = language === "en" ? "en" : "ko";
  const words = WORDS[lang];
  const wanted = normalizeSections(sections);
  const pages = [];
  for (const raw of selectTabs(scope, tabs || [], activeIndex)) {
    const tab = raw?.data ? { ...raw, data: presentBoard(raw.data, priority) } : raw;
    const market = marketName(tab.board, lang);
    const country = countryName(tab.board, lang);
    const when = [formatAsOf(tab.data?.fetchedAt, ""), tab.properties?.label || ""].filter(Boolean).join(" · ") || today.toISOString().slice(0, 10);
    const add = (section, label, chunks) => {
      for (const body of chunks) pages.push({ city: market, country, range: section, rangeLabel: label, when, body });
    };
    for (const section of wanted) {
      if (section === "stocks") add(section, words.stocks, stocksPages(tab, lang, units, baseCurrency, setup, words));
      if (section === "rates") add(section, words.rates, ratesPages(tab, lang, currencies, setup, words));
      if (section === "news") add(section, words.news, newsPages(tab, lang, setup, words));
    }
    if (scope === "custom") add("history", words.history, historyPages(tab, lang, fromDate, toDate, setup, words));
  }
  if (!pages.length) pages.push({ city: "MyMoney", country: "", range: "stocks", rangeLabel: "", when: "", body: `<p class="empty">${esc(words.empty)}</p>` });
  return { pages, pageSetup: setup, sections: wanted, html: renderDocument(pages, setup) };
}

export function normalizeSections(sections) {
  const wanted = PRINT_SECTIONS.filter((section) => (Array.isArray(sections) ? sections.includes(section) : true));
  return wanted.length ? wanted : [...PRINT_SECTIONS];
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
  const sheets = pages.map((page, index) => `<section class="sheet">${pageHtml(page, setup, index, pages.length)}</section>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MyMoney</title><style>${printDocumentCss(setup)}</style></head><body class="print-doc">${sheets}</body></html>`;
}

function selectTabs(scope, tabs, activeIndex) {
  if (scope === "all") return tabs.filter(Boolean);
  const index = Math.max(0, Math.min(tabs.length - 1, Number(activeIndex) || 0));
  return [tabs[index]].filter(Boolean);
}

function chunk(rows, size) {
  const out = [];
  for (let at = 0; at < rows.length; at += size) out.push(rows.slice(at, at + size));
  return out;
}

function emptyPage(text) {
  return [`<p class="empty">${esc(text)}</p>`];
}

/** Quotes in watchlist order, the market index first, as many sheets as they need. */
function stocksPages(tab, language, units, baseCurrency, setup, words) {
  const quotes = tab.data?.quotes || [];
  if (!quotes.length) return emptyPage(words.noQuotes);
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const ordered = (tab.board?.symbols || []).map((entry) => bySymbol.get(entry.symbol)).filter(Boolean);
  for (const quote of quotes) if (!ordered.includes(quote)) ordered.push(quote);
  const c = words.cols;
  const head = `<tr><th style="width:34%">${esc(c.name)}</th><th style="width:9%">${esc(c.exchange)}</th><th class="num">${esc(c.price)}</th><th class="num">${esc(c.change)}</th><th class="num">${esc(c.percent)}</th><th class="num">${esc(c.volume)}</th></tr>`;
  const rows = ordered.map((quote) => {
    const listing = (tab.board?.symbols || []).find((entry) => entry.symbol === quote.symbol);
    const name = listingName(listing, language) || quote.name || quote.symbol;
    const priced = convert(quote, units, baseCurrency, tab.data?.rates);
    const market = findMarket(listing?.marketCode || tab.board?.marketCode);
    const volume = formatVolume(quote.volumeLast ?? quote.days?.[quote.days.length - 1]?.volume, language);
    return `<tr data-tone="${esc(trendTone(trendOf(quote.changePercent)))}"><td class="name"><strong>${esc(name)}</strong><em>${esc(quote.symbol)}</em></td><td>${esc(market?.marketCode || "")}</td><td class="num">${esc(formatPrice(priced.last, priced.currency, language))} ${esc(priced.currency || "")}</td><td class="num tone">${esc(formatSigned(priced.change, priced.currency, language))}</td><td class="num tone">${esc(formatPercent(quote.changePercent))}</td><td class="num">${esc(volume)}</td></tr>`;
  });
  const index = tab.data?.index;
  if (index) {
    const label = language === "en" ? tab.board?.indexEn || index.symbol : tab.board?.indexKo || index.symbol;
    rows.unshift(
      `<tr class="is-index" data-tone="${esc(trendTone(trendOf(index.changePercent)))}"><td class="name"><strong>${esc(label)}</strong><em>${esc(index.symbol)}</em></td><td>${esc(tab.board?.marketCode || "")}</td><td class="num">${esc(formatPrice(index.last, "", language))}</td><td class="num tone">${esc(formatSigned(index.change, "", language))}</td><td class="num tone">${esc(formatPercent(index.changePercent))}</td><td class="num">—</td></tr>`,
    );
  }
  return chunk(rows, rowsPerPage(setup, "stocks")).map((part) => `<table class="print-table" data-section="stocks"><thead>${head}</thead><tbody>${part.join("")}</tbody></table>`);
}

function ratesPages(tab, language, currencies, setup, words) {
  const shown = shownRateRows(tab.data?.rates, currencies);
  if (!shown.rows.length) return emptyPage(words.noRates);
  const c = words.cols;
  const head = `<tr><th>${esc(c.pair)}</th><th class="num">${esc(c.rate)}</th><th>${esc(c.currency)}</th></tr>`;
  const rows = shown.rows.map((row) => {
    const quoted = quotePair(shown.base, row.code, row.rate);
    return `<tr><td><strong>${esc(quoted.pair)}</strong></td><td class="num">${esc(formatRate(quoted.value, language))}</td><td>${esc(currencyName(row.code, language))}</td></tr>`;
  });
  const caption = `<p class="empty">${esc(`${words.base} ${shown.base}${shown.date ? ` · ${shown.date}` : ""}`)}</p>`;
  return chunk(rows, rowsPerPage(setup, "rates")).map((part) => `${caption}<table class="print-table" data-section="rates"><thead>${head}</thead><tbody>${part.join("")}</tbody></table>`);
}

function newsPages(tab, language, setup, words) {
  const news = tab.data?.news || [];
  if (!news.length) return emptyPage(words.noNews);
  const rows = news.map((item) => {
    const meta = [item.outlet, formatWhen(item.published, language)].filter(Boolean).join(" · ");
    return `<li><span class="title">${esc(item.title)}</span><span class="meta">${esc(meta)}</span></li>`;
  });
  return chunk(rows, rowsPerPage(setup, "news")).map((part) => `<ul class="news-list" data-section="news">${part.join("")}</ul>`);
}

/** A custom range prints each quote's daily prices inside that range. */
function historyPages(tab, language, fromDate, toDate, setup, words) {
  const c = words.cols;
  const head = `<tr><th style="width:30%">${esc(c.name)}</th><th>${esc(c.date)}</th><th class="num">${esc(c.open)}</th><th class="num">${esc(c.high)}</th><th class="num">${esc(c.low)}</th><th class="num">${esc(c.close)}</th></tr>`;
  const rows = [];
  for (const quote of tab.data?.quotes || []) {
    const listing = (tab.board?.symbols || []).find((entry) => entry.symbol === quote.symbol);
    const name = listingName(listing, language) || quote.name || quote.symbol;
    for (const day of quote.days || []) {
      if ((fromDate && day.date < fromDate) || (toDate && day.date > toDate)) continue;
      const money = (value) => formatPrice(value, quote.currency, language);
      rows.push(
        `<tr><td class="name"><strong>${esc(name)}</strong><em>${esc(quote.symbol)}</em></td><td>${esc(day.date)}</td><td class="num">${esc(money(day.open))}</td><td class="num">${esc(money(day.high))}</td><td class="num">${esc(money(day.low))}</td><td class="num">${esc(money(day.close))}</td></tr>`,
      );
    }
  }
  if (!rows.length) return emptyPage(words.noQuotes);
  return chunk(rows, rowsPerPage(setup, "history")).map((part) => `<table class="print-table" data-section="history"><thead>${head}</thead><tbody>${part.join("")}</tbody></table>`);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
