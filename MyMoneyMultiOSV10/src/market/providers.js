/**
 * The six places MyMoney fetches from. Two serve quotes, two serve exchange
 * rates, and two serve headlines. None of them needs an API key.
 *
 * Every parser returns the same shape for its kind so `aggregate.js` can
 * average two quote sources, or two rate sources, without knowing which is
 * which.
 */

export const SOURCE_IDS = ["yahoo", "yahoo2", "frankfurter", "erapi", "gnews", "wires"];

export const SOURCE_KIND = {
  yahoo: "quote",
  yahoo2: "quote",
  frankfurter: "rates",
  erapi: "rates",
  gnews: "news",
  wires: "news",
};

/** Yahoo serves the chart API from two edge hosts. The second is the failover. */
export const QUOTE_HOSTS = { yahoo: "query1", yahoo2: "query2" };

export const QUOTE_SOURCES = SOURCE_IDS.filter((id) => SOURCE_KIND[id] === "quote");
export const RATE_SOURCES = SOURCE_IDS.filter((id) => SOURCE_KIND[id] === "rates");
export const NEWS_SOURCES = SOURCE_IDS.filter((id) => SOURCE_KIND[id] === "news");

const USER_AGENT = "MyMoney/1.0 (knix008@naver.com)";

export function yahooChartUrl(symbol, range = "1mo", interval = "1d", host = "query1") {
  const edge = host === "query2" ? "query2" : "query1";
  const url = new URL(`https://${edge}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", interval);
  url.searchParams.set("includePrePost", "false");
  return url.toString();
}

export function yahooSearchUrl(query) {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", "10");
  url.searchParams.set("newsCount", "0");
  return url.toString();
}

export function frankfurterUrl(base, currencies) {
  const url = new URL("https://api.frankfurter.app/latest");
  url.searchParams.set("from", String(base || "USD").toUpperCase());
  const to = (currencies || []).map((code) => String(code).toUpperCase()).filter((code) => code !== String(base).toUpperCase());
  if (to.length) url.searchParams.set("to", to.join(","));
  return url.toString();
}

export function erApiUrl(base) {
  return `https://open.er-api.com/v6/latest/${encodeURIComponent(String(base || "USD").toUpperCase())}`;
}

export function googleNewsUrl(query, language) {
  const korean = language !== "en";
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", korean ? "ko" : "en-US");
  url.searchParams.set("gl", korean ? "KR" : "US");
  url.searchParams.set("ceid", korean ? "KR:ko" : "US:en");
  return url.toString();
}

/**
 * A wire feed in the reader's language. Unlike the Google News search these
 * carry a picture with most items, which is what fills the headline thumbnails.
 */
export function newsWireUrl(language) {
  return language === "en" ? "https://feeds.bbci.co.uk/news/business/rss.xml" : "https://www.yna.co.kr/rss/market.xml";
}

/** The page a reader should land on when they ask to see where a number came from. */
export function sourcePageUrl(symbol) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol || "")}`;
}

export function createProviders() {
  return [
    {
      id: "yahoo",
      kind: "quote",
      headers: { "User-Agent": USER_AGENT },
      url: (request) => yahooChartUrl(request.symbol, request.range || "1mo", "1d", "query1"),
      parse: (payload, request) => parseYahooChart(payload.json(), request.symbol, "yahoo"),
    },
    {
      id: "yahoo2",
      kind: "quote",
      headers: { "User-Agent": USER_AGENT },
      url: (request) => yahooChartUrl(request.symbol, request.range || "1mo", "1d", "query2"),
      parse: (payload, request) => parseYahooChart(payload.json(), request.symbol, "yahoo2"),
    },
    {
      id: "frankfurter",
      kind: "rates",
      headers: {},
      url: (request) => frankfurterUrl(request.base, request.currencies),
      parse: (payload) => parseFrankfurter(payload.json()),
    },
    {
      id: "erapi",
      kind: "rates",
      headers: {},
      url: (request) => erApiUrl(request.base),
      parse: (payload, request) => parseErApi(payload.json(), request.currencies),
    },
    {
      id: "gnews",
      kind: "news",
      headers: { "User-Agent": USER_AGENT },
      url: (request) => googleNewsUrl(request.query, request.language),
      parse: (payload) => parseNewsFeed(payload.text(), "gnews"),
    },
    {
      id: "wires",
      kind: "news",
      headers: { "User-Agent": USER_AGENT },
      url: (request) => newsWireUrl(request.language),
      parse: (payload) => parseNewsFeed(payload.text(), "wires"),
    },
  ];
}

export function providerById(id) {
  return createProviders().find((provider) => provider.id === id) || null;
}

export function parseYahooChart(json, symbol, sourceId = "yahoo") {
  const result = json?.chart?.result?.[0];
  if (!result) {
    const reason = json?.chart?.error?.description || json?.finance?.error?.description || "Missing chart result";
    throw new Error(reason);
  }
  const meta = result.meta || {};
  const stamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const days = [];
  for (let index = 0; index < stamps.length; index += 1) {
    const close = num(quote.close?.[index]);
    if (close == null) continue;
    days.push({
      date: isoFromStamp(stamps[index]),
      open: num(quote.open?.[index]),
      high: num(quote.high?.[index]),
      low: num(quote.low?.[index]),
      close,
      volume: num(quote.volume?.[index]),
      source: sourceId,
    });
  }
  if (!days.length) throw new Error("Empty chart series");
  return {
    symbol: symbol || meta.symbol || "",
    currency: String(meta.currency || "").toUpperCase(),
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    name: meta.longName || meta.shortName || "",
    previousClose: num(meta.chartPreviousClose) ?? num(meta.previousClose),
    days,
    source: sourceId,
  };
}

export function parseFrankfurter(json) {
  const rates = json?.rates;
  if (!rates || typeof rates !== "object") throw new Error(json?.message || "Missing rates");
  const base = String(json.base || "").toUpperCase();
  const rows = Object.entries(rates)
    .map(([code, value]) => ({ code: String(code).toUpperCase(), rate: num(value), source: "frankfurter" }))
    .filter((row) => row.rate != null);
  if (!rows.length) throw new Error("Empty rate table");
  return { base, date: String(json.date || ""), rows, source: "frankfurter" };
}

export function parseErApi(json, currencies) {
  if (json?.result === "error") throw new Error(json["error-type"] || "Rate service error");
  const rates = json?.rates;
  if (!rates || typeof rates !== "object") throw new Error("Missing rates");
  const base = String(json.base_code || json.base || "").toUpperCase();
  const wanted = (currencies || []).length ? new Set((currencies || []).map((code) => String(code).toUpperCase())) : null;
  const rows = Object.entries(rates)
    .map(([code, value]) => ({ code: String(code).toUpperCase(), rate: num(value), source: "erapi" }))
    .filter((row) => row.rate != null && row.code !== base && (!wanted || wanted.has(row.code)));
  if (!rows.length) throw new Error("Empty rate table");
  return { base, date: String(json.time_last_update_utc || "").slice(5, 16), rows, source: "erapi" };
}

/**
 * RSS 2.0 in, headlines out. The feed is XML from a third party, so every value
 * is treated as text and the markup is never inserted into the page. A picture
 * is kept only when the feed offers one and its address is http(s).
 */
export function parseNewsFeed(xml, sourceId = "gnews") {
  const text = String(xml || "");
  const items = [...text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  if (!items.length) throw new Error("No headlines in the feed");
  const rows = items
    .map((body) => ({
      title: decodeXml(tagText(body, "title")),
      link: decodeXml(tagText(body, "link")),
      outlet: decodeXml(tagText(body, "source")) || hostOf(decodeXml(tagText(body, "link"))),
      published: toIso(decodeXml(tagText(body, "pubDate"))),
      image: imageFrom(body),
      source: sourceId,
    }))
    .filter((row) => row.title);
  if (!rows.length) throw new Error("No headlines in the feed");
  return { rows, source: sourceId };
}

const MEDIA_TAG = /<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi;
const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i;

/** The item's picture, from the media tags first and then from the summary HTML. */
export function imageFrom(body) {
  for (const tag of String(body).match(MEDIA_TAG) || []) {
    const url = attr(tag, "url");
    if (!url) continue;
    const type = attr(tag, "type");
    const medium = attr(tag, "medium");
    if (type && !type.startsWith("image/")) continue;
    if (medium && medium !== "image") continue;
    if (!type && !medium && !IMAGE_FILE.test(url)) continue;
    const safe = safeImageUrl(decodeXml(url));
    if (safe) return safe;
  }
  const html = `${decodeXml(rawTag(body, "description"))} ${decodeXml(rawTag(body, "content:encoded"))}`;
  const inline = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return inline ? safeImageUrl(inline[1]) : "";
}

/** Only a plain web address may reach an `src`; never `javascript:` or `data:`. */
export function safeImageUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url) || url.length > 600) return "";
  return url;
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) || tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return match ? match[1].trim() : "";
}

function rawTag(body, name) {
  const match = String(body).match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function parseSymbolSearch(json) {
  return (json?.quotes || [])
    .filter((row) => row && row.symbol)
    .map((row) => ({
      symbol: String(row.symbol),
      code: String(row.symbol).split(".")[0],
      nameKo: String(row.longname || row.shortname || row.symbol),
      nameEn: String(row.longname || row.shortname || row.symbol),
      exchange: String(row.exchDisp || row.exchange || ""),
      kind: String(row.quoteType || ""),
    }));
}

function tagText(body, name) {
  const match = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function hostOf(url) {
  const match = String(url || "").match(/^https?:\/\/([^/]+)/i);
  return match ? match[1].replace(/^www\./, "") : "";
}

function toIso(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isoFromStamp(seconds) {
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function num(value) {
  if (value == null || value === "" || value === "N/A") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
