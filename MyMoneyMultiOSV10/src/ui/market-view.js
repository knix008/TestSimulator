import { esc } from "./html.js";
import { activeQuote, presentBoard } from "../market/aggregate.js";
import { formatPercent, formatPrice, formatRate, formatSigned, formatVolume, formatWhen, quotePair } from "../market/format.js";
import { currencyName, listingName, marketName } from "../market/markets.js";
import { safeImageUrl } from "../market/providers.js";
import { trendOf, trendText, trendTone } from "../market/trend.js";

/**
 * The window either shows one symbol large, or the whole watchlist as rows.
 * In the single view the scene itself advances to the next symbol on a click.
 */
export function renderMarketHtml({ tab, language, units, baseCurrency, today, t, priority = "average", mode = "single" }) {
  const shown = preferTab(tab, priority);
  if (mode === "all") return renderBoardHtml(shown, language, units, baseCurrency, t);
  const quote = activeQuote(shown.data, shown.selectedSymbol || shown.board?.activeSymbol);
  const listing = (tab?.board?.symbols || []).find((entry) => entry.symbol === quote?.symbol);
  const title = quote ? listingName(listing, language) || quote.name || quote.symbol : marketName(tab?.board, language);
  const trend = quote ? trendOf(quote.changePercent) : "none";
  const priced = convert(quote, units, baseCurrency, shown.data?.rates);
  const many = (tab?.board?.symbols || []).length > 1;
  const advance = many ? ` data-scene-advance="1" title="${esc(t("tip.nextSymbol"))}"` : "";
  const scene = `<section class="market-scene" data-gui="scene" data-symbol="${esc(quote?.symbol || "")}"${advance}>
      ${sceneArt(trend)}
      <div class="scene-copy">
        <div class="scene-name" title="${esc(title)}">${esc(title)}</div>
        <div class="scene-price">${esc(quote ? formatPrice(priced.last, priced.currency, language) : "—")}</div>
        <div class="scene-move" data-tone="${esc(trendTone(trend))}">${esc(
          quote ? `${formatSigned(priced.change, priced.currency, language)}  ${formatPercent(quote.changePercent)}` : t("market.empty"),
        )}</div>
        <div class="scene-note">${esc(quote ? `${priced.currency || ""} · ${trendText(trend, language)} · ${quote.date || ""}`.trim() : " ")}</div>
      </div>
    </section>`;
  return `<div class="market">${scene}</div>`;
}

function renderBoardHtml(shown, language, units, baseCurrency, t) {
  if (!(shown.board?.symbols || []).length) {
    return `<div class="market market-board"><p class="empty" data-gui="empty">${esc(t("market.noSymbols"))}</p></div>`;
  }
  if (!shown.data?.quotes?.length) {
    return `<div class="market market-board"><p class="empty" data-gui="empty">${esc(t("market.empty"))}</p></div>`;
  }
  return `<div class="market market-board" data-gui="board">${stocksHtml(shown, language, units, baseCurrency, t)}</div>`;
}

/**
 * Rows the whole-watchlist window will draw. Before the first fetch lands this
 * guesses from the watchlist itself, so the window does not resize twice.
 */
export function boardRowCount(tab) {
  const quotes = tab?.data?.quotes?.length || 0;
  const rows = quotes ? quotes + (tab?.data?.index ? 1 : 0) : (tab?.board?.symbols || []).length + 1;
  return Math.max(1, rows);
}

export function renderPanelHtml({ panel, tab, language, units, baseCurrency, currencies, today, t, priority = "average" }) {
  const shown = preferTab(tab, priority);
  const data = shown?.data;
  if (panel === "stocks") {
    if (!(shown.board?.symbols || []).length) return `<p class="empty" data-gui="empty">${esc(t("market.noSymbols"))}</p>`;
    if (!data?.quotes?.length) return `<p class="empty" data-gui="empty">${esc(t("market.empty"))}</p>`;
    return stocksHtml(shown, language, units, baseCurrency, t);
  }
  if (panel === "rates") {
    const shownRates = shownRateRows(data?.rates, currencies);
    if (!shownRates.rows.length) return `<p class="empty" data-gui="empty">${esc(t("market.noRates"))}</p>`;
    return ratesHtml(shownRates, language, t);
  }
  if (!data?.news?.length) return `<p class="empty" data-gui="empty">${esc(t("market.noNews"))}</p>`;
  return newsHtml(data.news, language, t);
}

export function panelFitHeight(panel, rowCount) {
  const rows = Math.max(0, Number(rowCount) || 0);
  if (!rows) return 72;
  if (panel === "stocks") return Math.min(420, 54 + rows * 34);
  if (panel === "rates") return Math.min(420, 30 + rows * 30);
  return Math.min(540, 30 + rows * NEWS_ROW);
}

/** How many rows a panel will draw, so the popup can be sized before it is built. */
export function panelRowCount(panel, tab) {
  if (panel === "stocks") return (tab?.data?.quotes || []).length + (tab?.data?.index ? 1 : 0);
  if (panel === "rates") return shownRateRows(tab?.data?.rates, tab?.rateCurrencies).rows.length;
  return Math.min(10, (tab?.data?.news || []).length);
}

/**
 * The fetch asks for more currencies than the panel shows, because a price
 * conversion needs the listing's own currency too. Only the chosen ones are
 * listed, in the order the reader put them in.
 */
export function shownRateRows(rates, currencies) {
  const base = rates?.base || "";
  const rows = rates?.rows || [];
  if (!currencies?.length) return { base, date: rates?.date || "", rows };
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return { base, date: rates?.date || "", rows: currencies.map((code) => byCode.get(code)).filter(Boolean) };
}

function preferTab(tab, priority) {
  if (!tab?.data) return tab || {};
  return { ...tab, data: presentBoard(tab.data, priority) };
}

/** A price in the display currency the reader asked for. */
export function convert(quote, units, baseCurrency, rates) {
  if (!quote) return { last: null, change: null, currency: "" };
  const from = String(quote.currency || "").toUpperCase();
  const to = String(baseCurrency || "").toUpperCase();
  if (units !== "base" || !to || !from || from === to) {
    return { last: quote.last, change: quote.change, currency: from };
  }
  const factor = rateBetween(rates, from, to);
  if (factor == null) return { last: quote.last, change: quote.change, currency: from };
  return {
    last: quote.last == null ? null : quote.last * factor,
    change: quote.change == null ? null : quote.change * factor,
    currency: to,
  };
}

/** The table is quoted against one base, so a cross rate is one division away. */
export function rateBetween(rates, from, to) {
  if (!rates?.rows?.length) return null;
  const base = String(rates.base || "").toUpperCase();
  const find = (code) => rates.rows.find((row) => row.code === code)?.rate ?? null;
  if (from === base) return find(to);
  if (to === base) {
    const value = find(from);
    return value ? 1 / value : null;
  }
  const a = find(from);
  const b = find(to);
  if (!a || b == null) return null;
  return b / a;
}

function stocksHtml(tab, language, units, baseCurrency, t) {
  const rates = tab.data?.rates;
  const head = `<div class="quote-head" data-gui="quote-head"><span>${esc(t("col.symbol"))}</span><span>${esc(t("col.price"))}</span><span>${esc(t("col.change"))}</span><span>${esc(t("col.percent"))}</span><span>${esc(t("col.volume"))}</span></div>`;
  const rows = (tab.data.quotes || []).map((quote) => {
    const listing = (tab.board.symbols || []).find((entry) => entry.symbol === quote.symbol);
    const name = listingName(listing, language) || quote.name || quote.symbol;
    const trend = trendOf(quote.changePercent);
    const priced = convert(quote, units, baseCurrency, rates);
    const selected = quote.symbol === tab.selectedSymbol ? " is-selected" : "";
    const alert = isAlert(quote, tab) ? " is-alert" : "";
    const title = `${name} ${quote.symbol} ${formatPrice(priced.last, priced.currency, language)} ${priced.currency} ${formatPercent(quote.changePercent)}`;
    return `<button type="button" class="quote-row${selected}${alert}" data-gui="quote" data-symbol="${esc(quote.symbol)}" data-tone="${esc(trendTone(trend))}" title="${esc(title)}">
        <span class="quote-name"><strong>${esc(name)}</strong><em>${esc(quote.symbol)}</em></span>
        <span class="quote-price">${esc(formatPrice(priced.last, priced.currency, language))}</span>
        <span class="quote-change">${esc(formatSigned(priced.change, priced.currency, language))}</span>
        <span class="quote-percent">${esc(formatPercent(quote.changePercent))}</span>
        <span class="quote-volume">${esc(formatVolume(quote.volumeLast ?? quote.days?.[quote.days.length - 1]?.volume, language))}</span>
      </button>`;
  });
  const index = tab.data.index;
  const indexRow = index
    ? `<div class="quote-row is-index" data-gui="index" data-tone="${esc(trendTone(trendOf(index.changePercent)))}" title="${esc(`${t("col.index")} ${index.symbol}`)}">
        <span class="quote-name"><strong>${esc(indexLabel(tab.board, language))}</strong><em>${esc(index.symbol)}</em></span>
        <span class="quote-price">${esc(formatPrice(index.last, "", language))}</span>
        <span class="quote-change">${esc(formatSigned(index.change, "", language))}</span>
        <span class="quote-percent">${esc(formatPercent(index.changePercent))}</span>
        <span class="quote-volume">—</span>
      </div>`
    : "";
  return `<div class="quote-board" data-gui="stocks">${head}${indexRow}${rows.join("")}</div>`;
}

function ratesHtml(rates, language, t) {
  const head = `<div class="rate-head" data-gui="rate-head"><span>${esc(t("col.pair"))}</span><span>${esc(t("col.rate"))}</span><span>${esc(t("col.currency"))}</span></div>`;
  const rows = (rates.rows || []).map((row) => {
    const quoted = quotePair(rates.base, row.code, row.rate);
    const name = currencyName(row.code, language);
    return `<div class="rate-row" data-gui="rate" data-code="${esc(row.code)}" data-pair="${esc(quoted.pair)}" title="${esc(`${quoted.pair} ${formatRate(quoted.value, language)} ${name}`)}">
        <span class="rate-pair">${esc(quoted.pair)}</span>
        <span class="rate-value">${esc(formatRate(quoted.value, language))}</span>
        <span class="rate-name">${esc(name)}</span>
      </div>`;
  });
  return `<div class="rate-board" data-gui="rates">${head}${rows.join("")}</div>`;
}

/** One headline row: 48px tall, with room for a thumbnail whether or not one exists. */
export const NEWS_ROW = 50;

function newsHtml(news, language, t) {
  const rows = news.slice(0, 10).map((item) => {
    const when = formatWhen(item.published, language);
    const meta = [item.outlet, when].filter(Boolean).join(" · ");
    const picture = safeImageUrl(item.image)
      ? `<img src="${esc(safeImageUrl(item.image))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : "";
    return `<button type="button" class="news-row" data-gui="news" data-link="${esc(item.link || "")}" title="${esc(item.title)}">
        <span class="news-thumb" data-image="${picture ? "yes" : "no"}">${picture}</span>
        <span class="news-copy">
          <span class="news-title">${esc(item.title)}</span>
          <span class="news-meta">${esc(meta || t("col.outlet"))}</span>
        </span>
      </button>`;
  });
  return `<div class="news-board" data-gui="news-board">${rows.join("")}</div>`;
}

function indexLabel(board, language) {
  if (!board) return "";
  return language === "en" ? board.indexEn || board.index || "" : board.indexKo || board.index || "";
}

function sceneArt(trend, size = 160) {
  const pictures = {
    up: `<path d="M22 92h76" stroke="#8fa6b8" stroke-width="3" stroke-linecap="round"/><rect x="26" y="68" width="16" height="24" rx="4" fill="#cfe3d8"/><rect x="50" y="56" width="16" height="36" rx="4" fill="#a9d6c2"/><rect x="74" y="42" width="16" height="50" rx="4" fill="#79c6a6"/><path d="M28 70l20-16 14 10 26-32" fill="none" stroke="#1fa971" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M76 30h20v20z" fill="#1fa971"/>`,
    down: `<path d="M22 92h76" stroke="#8fa6b8" stroke-width="3" stroke-linecap="round"/><rect x="26" y="42" width="16" height="50" rx="4" fill="#f0cdcd"/><rect x="50" y="58" width="16" height="34" rx="4" fill="#efbcbc"/><rect x="74" y="72" width="16" height="20" rx="4" fill="#e79a9a"/><path d="M28 36l20 18 14-10 26 30" fill="none" stroke="#e05252" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M96 84h-20v-20z" fill="#e05252"/>`,
    flat: `<path d="M22 92h76" stroke="#8fa6b8" stroke-width="3" stroke-linecap="round"/><rect x="26" y="60" width="16" height="32" rx="4" fill="#d9e2ea"/><rect x="50" y="58" width="16" height="34" rx="4" fill="#cfd9e3"/><rect x="74" y="61" width="16" height="31" rx="4" fill="#c5d1dd"/><path d="M28 50h60" fill="none" stroke="#7d8ea0" stroke-width="6" stroke-linecap="round"/><path d="M92 42v16l14-8z" fill="#7d8ea0"/>`,
    none: `<rect x="24" y="30" width="72" height="62" rx="10" fill="#eef3f8" stroke="#9db4c8" stroke-width="3"/><path d="M36 50h48M36 62h36M36 74h26" stroke="#9db4c8" stroke-width="5" stroke-linecap="round"/>`,
  };
  const body = pictures[trend] || pictures.none;
  return `<span class="scene-art" data-art="${esc(trend)}"><svg class="scene-svg" viewBox="12 12 96 96" width="${size}" height="${size}" aria-hidden="true">${body}</svg></span>`;
}

/** A gain or loss past the alert threshold marks the row. */
export function isAlert(quote, tab) {
  const high = Number(tab?.properties?.alertHigh);
  const low = Number(tab?.properties?.alertLow);
  const percent = quote?.changePercent;
  if (percent == null) return false;
  if (tab?.properties?.alertHigh !== "" && Number.isFinite(high) && percent >= high) return true;
  if (tab?.properties?.alertLow !== "" && Number.isFinite(low) && percent <= -Math.abs(low)) return true;
  return false;
}
