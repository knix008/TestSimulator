import { AppError } from "../core/errors.js";
import { trendOf } from "./trend.js";

/**
 * One symbol seen by several quote sources becomes one series. Days present in
 * more than one source are averaged, and each source's own row is kept under
 * `bySource` so Settings can pin the display to a single provider.
 */
export function aggregateQuote(symbol, sourceResults) {
  const ok = sourceResults.filter((source) => source.ok && source.data);
  if (!ok.length) {
    const details = sourceResults.map((source) => `${source.id}: ${source.error || "failed"}`).join("\n");
    throw new AppError("All quote sources failed", details, "QUOTE_ALL_FAILED");
  }
  const byDate = new Map();
  for (const source of ok) {
    for (const day of source.data.days || []) {
      if (!byDate.has(day.date)) byDate.set(day.date, []);
      byDate.get(day.date).push(day);
    }
  }
  const days = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rows]) => ({
      date,
      open: round2(average(rows.map((row) => row.open))),
      high: round2(average(rows.map((row) => row.high))),
      low: round2(average(rows.map((row) => row.low))),
      close: round2(average(rows.map((row) => row.close))),
      volume: round2(average(rows.map((row) => row.volume))),
      bySource: Object.fromEntries(rows.filter((row) => row.source).map((row) => [row.source, row])),
    }));
  const named = ok.find((source) => source.data.name) || ok[0];
  const priced = ok.find((source) => source.data.currency) || ok[0];
  return withSummary({
    symbol,
    name: named.data.name || "",
    currency: priced.data.currency || "",
    exchange: priced.data.exchange || "",
    days,
    bySource: Object.fromEntries(ok.map((source) => [source.id, withSummary({ symbol, days: source.data.days || [] })])),
  });
}

/** `last`, `previousClose`, `change`, and `changePercent` from the tail of a series. */
export function withSummary(quote) {
  const days = quote.days || [];
  const last = days[days.length - 1] || null;
  const previous = days[days.length - 2] || null;
  const close = last?.close ?? null;
  const before = previous?.close ?? null;
  const change = close != null && before != null ? round2(close - before) : null;
  const changePercent = close != null && before ? round2(((close - before) / before) * 100) : null;
  return {
    ...quote,
    date: last?.date || "",
    last: close,
    previousClose: before,
    change,
    changePercent,
    trend: trendOf(changePercent),
  };
}

/** Two rate tables with the same base become one averaged table. */
export function aggregateRates(base, sourceResults) {
  const ok = sourceResults.filter((source) => source.ok && source.data);
  if (!ok.length) return { base, date: "", rows: [] };
  const byCode = new Map();
  for (const source of ok) {
    for (const row of source.data.rows || []) {
      if (!byCode.has(row.code)) byCode.set(row.code, []);
      byCode.get(row.code).push(row);
    }
  }
  const rows = [...byCode.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, entries]) => ({
      code,
      rate: round6(average(entries.map((entry) => entry.rate))),
      bySource: Object.fromEntries(entries.map((entry) => [entry.source, entry])),
    }));
  return { base: String(base || "").toUpperCase(), date: ok[0].data.date || "", rows };
}

/** Headlines from every working feed, newest first, one row per title. */
export function mergeNews(sourceResults, limit = 40) {
  const ok = sourceResults.filter((source) => source.ok && source.data);
  const seen = new Set();
  const rows = [];
  for (const source of ok) {
    for (const row of source.data.rows || []) {
      const key = row.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  rows.sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));
  return rows.slice(0, limit);
}

/** Values shown for a display priority. A missing source keeps the averaged row. */
export function presentBoard(board, priority) {
  if (!board || !priority || priority === "average") return board;
  const quotes = (board.quotes || []).map((quote) => {
    const preferred = quote.bySource?.[priority];
    if (!preferred?.days?.length) return quote;
    return { ...quote, ...preferred, name: quote.name, currency: quote.currency, exchange: quote.exchange, bySource: quote.bySource };
  });
  const index = board.index ? presentQuote(board.index, priority) : board.index;
  const rates = {
    ...board.rates,
    rows: (board.rates?.rows || []).map((row) => {
      const preferred = row.bySource?.[priority];
      if (!preferred) return row;
      return { ...row, rate: preferred.rate, bySource: row.bySource };
    }),
  };
  return { ...board, quotes, index, rates };
}

function presentQuote(quote, priority) {
  const preferred = quote?.bySource?.[priority];
  if (!preferred?.days?.length) return quote;
  return { ...quote, ...preferred, name: quote.name, currency: quote.currency, exchange: quote.exchange, bySource: quote.bySource };
}

export function average(values) {
  const ready = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!ready.length) return null;
  return ready.reduce((sum, value) => sum + value, 0) / ready.length;
}

/** The quote the window shows big, or the first one in the watchlist. */
export function activeQuote(board, symbol) {
  const quotes = board?.quotes || [];
  if (!quotes.length) return null;
  return quotes.find((quote) => quote.symbol === symbol) || quotes[0];
}

function round2(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

function round6(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1e6) / 1e6;
}
