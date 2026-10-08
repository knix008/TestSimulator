import { esc } from "./html.js";
import { icon } from "./icons.js";
import { activeQuote, presentBoard } from "../market/aggregate.js";
import { formatAsOf, formatPercent, formatPrice, formatRate, formatSigned, formatVolume, formatWhen, quotePair } from "../market/format.js";
import { currencyName, findMarket, listingName, marketName } from "../market/markets.js";
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
  // When the figures were last pulled, so a window left open looks stale.
  const updated = formatAsOf(shown.data?.fetchedAt, quote?.date);
  const noteText = quote
    ? [priced.currency || "", trendText(trend, language), quote.date || "", updated].filter(Boolean).join(" · ")
    : "";
  const scene = `<section class="market-scene" data-gui="scene" data-symbol="${esc(quote?.symbol || "")}"${advance}>
      ${sceneArt(trend)}
      <div class="scene-copy">
        <div class="scene-name" title="${esc(title)}">${esc(title)}</div>
        <div class="scene-price">${esc(quote ? formatPrice(priced.last, priced.currency, language) : "—")}</div>
        <div class="scene-move" data-tone="${esc(trendTone(trend))}">${esc(
          quote ? `${formatSigned(priced.change, priced.currency, language)}  ${formatPercent(quote.changePercent)}` : t("market.empty"),
        )}</div>
        <div class="scene-note" title="${esc(noteText)}">${esc(noteText || " ")}</div>
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

export function renderPanelHtml({ panel, tab, language, units, baseCurrency, currencies, today, t, priority = "average", page = 0 }) {
  const shown = preferTab(tab, priority);
  const data = shown?.data;
  if (panel === "stocks") {
    if (!(shown.board?.symbols || []).length) return `<p class="empty" data-gui="empty">${esc(t("market.noSymbols"))}</p>`;
    if (!data?.quotes?.length) return `<p class="empty" data-gui="empty">${esc(t("market.empty"))}</p>`;
    return stocksHtml(shown, language, units, baseCurrency, t, page);
  }
  if (panel === "rates") {
    const shownRates = shownRateRows(data?.rates, currencies);
    if (!shownRates.rows.length) return `<p class="empty" data-gui="empty">${esc(t("market.noRates"))}</p>`;
    return ratesHtml(shownRates, language, t);
  }
  if (!data?.news?.length) return `<p class="empty" data-gui="empty">${esc(t("market.noNews"))}</p>`;
  return newsHtml(data.news, language, t, page);
}

/** Title bar, footer, padding and the window border around a panel's rows. */
export const PANEL_CHROME = 44 + 48 + 16 + 2;

/**
 * Tallest a panel's rows may grow before they start to scroll. A panel takes
 * the height its contents need; only the screen stops it, and the margin
 * leaves the window clear of the screen edges.
 */
/** Rows a panel shows at once; the rest wait on another page. */
export const PAGE_SIZE = 10;
/** The strip of page buttons under a list. */
export const PAGER_HEIGHT = 36;

/** Pages a list of this length needs, never fewer than one. */
export function pageCount(total) {
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / PAGE_SIZE));
}

/** A page number clamped to the pages that exist. */
export function clampPage(page, total) {
  return Math.min(Math.max(0, Math.round(Number(page) || 0)), pageCount(total) - 1);
}

/** The slice of `rows` that page `page` shows. */
export function pageSlice(rows, page) {
  const list = rows || [];
  const at = clampPage(page, list.length);
  return list.slice(at * PAGE_SIZE, at * PAGE_SIZE + PAGE_SIZE);
}

/**
 * First, previous, the page numbers, next and last. The arrows are icons; the
 * numbers read as numbers, and the page in view is marked.
 */
function pagerHtml(panel, page, total, t) {
  const pages = pageCount(total);
  if (pages < 2) return "";
  const at = clampPage(page, total);
  const step = (id, to, iconName, tip, off) =>
    `<button type="button" class="pager-btn" data-gui="pager" data-page="${to}" data-pager="${esc(id)}" title="${esc(tip)}" aria-label="${esc(tip)}"${off ? " disabled" : ""}>${icon(iconName)}</button>`;
  const numbers = Array.from({ length: pages }, (_, index) => index)
    .map(
      (index) =>
        `<button type="button" class="pager-num${index === at ? " is-current" : ""}" data-gui="pager" data-page="${index}" title="${esc(t("tip.pageGo", { n: index + 1 }))}" aria-current="${index === at}">${index + 1}</button>`,
    )
    .join("");
  const label = t("page.count", { page: at + 1, total: pages });
  return `<div class="pager" data-gui="pager-bar" data-panel="${esc(panel)}" data-page="${at}" data-pages="${pages}" title="${esc(label)}">${step(
    "first",
    0,
    "pageFirst",
    t("tip.pageFirst"),
    at === 0,
  )}${step("prev", at - 1, "pagePrev", t("tip.pagePrev"), at === 0)}<span class="pager-nums">${numbers}</span>${step(
    "next",
    at + 1,
    "pageNext",
    t("tip.pageNext"),
    at >= pages - 1,
  )}${step("last", pages - 1, "pageLast", t("tip.pageLast"), at >= pages - 1)}</div>`;
}

export function panelMaxBody(availableHeight) {
  const room = Math.max(320, Number(availableHeight) || 0);
  return Math.max(150, room - PANEL_CHROME - 80);
}

/** Height a panel's rows ask for, grown to fit them and capped by the screen. */
export function panelFitHeight(panel, rowCount, maxBody = panelMaxBody(0), pages = 1) {
  const rows = Math.max(0, Number(rowCount) || 0);
  if (!rows) return 72;
  const pager = Number(pages) > 1 ? PAGER_HEIGHT : 0;
  const ceiling = Math.max(150, Number(maxBody) || panelMaxBody(0)) - pager;
  if (panel === "stocks") return Math.min(ceiling, 54 + rows * 34) + pager;
  // A rate row is 32px with a 2px gap under it, the same as a quote row.
  if (panel === "rates") return Math.min(ceiling, 30 + rows * 34) + pager;
  return Math.min(ceiling, 30 + rows * NEWS_ROW) + pager;
}

/** How many rows a panel will draw, so the popup can be sized before it is built. */
/** Rows one page draws, so the window is sized for a page and never resizes. */
export function panelRowCount(panel, tab) {
  if (panel === "stocks") {
    return Math.min(PAGE_SIZE, (tab?.data?.quotes || []).length) + (tab?.data?.index ? 1 : 0);
  }
  if (panel === "rates") return shownRateRows(tab?.data?.rates, tab?.rateCurrencies).rows.length;
  return Math.min(PAGE_SIZE, (tab?.data?.news || []).length);
}

/** How many pages a panel has, so the window can leave room for the pager. */
export function panelPageCount(panel, tab) {
  if (panel === "stocks") return pageCount((tab?.data?.quotes || []).length);
  if (panel === "news") return pageCount((tab?.data?.news || []).length);
  return 1;
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

function stocksHtml(tab, language, units, baseCurrency, t, page = 0) {
  const rates = tab.data?.rates;
  const dragTip = t("tip.dragRow");
  const head = `<div class="quote-head" data-gui="quote-head"><span>${esc(t("col.symbol"))}</span><span>${esc(t("col.exchange"))}</span><span>${esc(t("col.price"))}</span><span>${esc(t("col.change"))}</span><span>${esc(t("col.percent"))}</span><span>${esc(t("col.volume"))}</span><span></span></div>`;
  // The watchlist decides the order; anything fetched but no longer watched
  // follows it rather than disappearing.
  const bySymbol = new Map((tab.data.quotes || []).map((quote) => [quote.symbol, quote]));
  const ordered = (tab.board.symbols || []).map((entry) => bySymbol.get(entry.symbol)).filter(Boolean);
  for (const quote of tab.data.quotes || []) if (!ordered.includes(quote)) ordered.push(quote);
  // Ten at a time; the pager under the board reaches the rest.
  const shownQuotes = pageSlice(ordered, page);
  const rows = shownQuotes.map((quote) => {
    const listing = (tab.board.symbols || []).find((entry) => entry.symbol === quote.symbol);
    const name = listingName(listing, language) || quote.name || quote.symbol;
    const trend = trendOf(quote.changePercent);
    const priced = convert(quote, units, baseCurrency, rates);
    const selected = quote.symbol === tab.selectedSymbol ? " is-selected" : "";
    const alert = isAlert(quote, tab) ? " is-alert" : "";
    // Which exchange a listing trades on, so a mixed watchlist stays readable.
    const market = findMarket(listing?.marketCode || tab.board?.marketCode);
    const exchange = market ? market.marketCode : "";
    const exchangeFull = market ? marketName(market, language) : "";
    const title = `${name} ${quote.symbol} ${exchangeFull} ${formatPrice(priced.last, priced.currency, language)} ${priced.currency} ${formatPercent(quote.changePercent)}`;
    return `<button type="button" class="quote-row${selected}${alert}" data-gui="quote" data-symbol="${esc(quote.symbol)}" data-tone="${esc(trendTone(trend))}" title="${esc(title)}">
        <span class="quote-name"><strong>${esc(name)}</strong><em>${esc(quote.symbol)}</em></span>
        <span class="quote-exchange" title="${esc(exchangeFull)}">${esc(exchange)}</span>
        <span class="quote-price">${esc(formatPrice(priced.last, priced.currency, language))}</span>
        <span class="quote-change">${esc(formatSigned(priced.change, priced.currency, language))}</span>
        <span class="quote-percent">${esc(formatPercent(quote.changePercent))}</span>
        <span class="quote-volume">${esc(formatVolume(quote.volumeLast ?? quote.days?.[quote.days.length - 1]?.volume, language))}</span>
        <span class="row-grip" data-grip="1" title="${esc(dragTip)}" aria-hidden="true">${icon("drag")}</span>
      </button>`;
  });
  const index = tab.data.index;
  const indexRow = index
    ? `<div class="quote-row is-index" data-gui="index" data-tone="${esc(trendTone(trendOf(index.changePercent)))}" title="${esc(`${t("col.index")} ${index.symbol}`)}">
        <span class="quote-name"><strong>${esc(indexLabel(tab.board, language))}</strong><em>${esc(index.symbol)}</em></span>
        <span class="quote-exchange">${esc(tab.board?.marketCode || "")}</span>
        <span class="quote-price">${esc(formatPrice(index.last, "", language))}</span>
        <span class="quote-change">${esc(formatSigned(index.change, "", language))}</span>
        <span class="quote-percent">${esc(formatPercent(index.changePercent))}</span>
        <span class="quote-volume">—</span>
        <span class="row-grip" aria-hidden="true"></span>
      </div>`
    : "";
  return `<div class="quote-board" data-gui="stocks">${head}<div class="board-rows" data-gui="quote-rows">${indexRow}${rows.join("")}</div>${pagerHtml("stocks", page, ordered.length, t)}</div>`;
}

function ratesHtml(rates, language, t) {
  const dragTip = t("tip.dragRow");
  const head = `<div class="rate-head" data-gui="rate-head"><span>${esc(t("col.pair"))}</span><span>${esc(t("col.rate"))}</span><span>${esc(t("col.currency"))}</span><span></span></div>`;
  const rows = (rates.rows || []).map((row) => {
    const quoted = quotePair(rates.base, row.code, row.rate);
    const name = currencyName(row.code, language);
    return `<div class="rate-row" data-gui="rate" data-code="${esc(row.code)}" data-pair="${esc(quoted.pair)}" title="${esc(`${quoted.pair} ${formatRate(quoted.value, language)} ${name}`)}">
        <span class="rate-pair">${esc(quoted.pair)}</span>
        <span class="rate-value">${esc(formatRate(quoted.value, language))}</span>
        <span class="rate-name">${esc(name)}</span>
        <span class="row-grip" data-grip="1" title="${esc(dragTip)}" aria-hidden="true">${icon("drag")}</span>
      </div>`;
  });
  return `<div class="rate-board" data-gui="rates">${head}<div class="board-rows" data-gui="rate-rows">${rows.join("")}</div></div>`;
}

/** One headline row: 48px tall, with room for a thumbnail whether or not one exists. */
export const NEWS_ROW = 50;

function newsHtml(news, language, t, page = 0) {
  const all = news || [];
  const rows = pageSlice(all, page).map((item) => {
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
  return `<div class="news-board" data-gui="news-board">${rows.join("")}</div>${pagerHtml("news", page, all.length, t)}`;
}

function indexLabel(board, language) {
  if (!board) return "";
  return language === "en" ? board.indexEn || board.index || "" : board.indexKo || board.index || "";
}

/**
 * Each arrowhead is a right triangle whose square corner is the tip. That
 * corner must sit on the far end of the line's last segment: up-right for a
 * gain, down-right for a loss. Mirroring it makes the arrow read as pointing
 * straight down.
 */
function sceneArt(trend, size = 160) {
  const pictures = {
    up: `<path d="M22 92h76" stroke="#8fa6b8" stroke-width="3" stroke-linecap="round"/><rect x="26" y="68" width="16" height="24" rx="4" fill="#cfe3d8"/><rect x="50" y="56" width="16" height="36" rx="4" fill="#a9d6c2"/><rect x="74" y="42" width="16" height="50" rx="4" fill="#79c6a6"/><path d="M28 70l20-16 14 10 26-32" fill="none" stroke="#1fa971" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M76 30h20v20z" fill="#1fa971"/>`,
    down: `<path d="M22 92h76" stroke="#8fa6b8" stroke-width="3" stroke-linecap="round"/><rect x="26" y="42" width="16" height="50" rx="4" fill="#f0cdcd"/><rect x="50" y="58" width="16" height="34" rx="4" fill="#efbcbc"/><rect x="74" y="72" width="16" height="20" rx="4" fill="#e79a9a"/><path d="M28 36l20 18 14-10 26 30" fill="none" stroke="#e05252" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M76 84h20v-20z" fill="#e05252"/>`,
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
