import { aggregateQuote, aggregateRates, mergeNews } from "./aggregate.js";
import { AppError } from "../core/errors.js";
import { createProviders, parseSymbolSearch, SOURCE_IDS, yahooSearchUrl } from "./providers.js";
import { listingName } from "./markets.js";

/**
 * Fetch one board: a quote for every watched symbol, the market index, the
 * exchange-rate table, and the headlines. A source that fails is reported in
 * `sources` and the rest of the board is still returned; only a board with no
 * quotes at all is an error.
 */
export async function loadBoard(board, options) {
  const fetchImpl = options.fetchImpl;
  const enabled = new Set(options.sources || SOURCE_IDS);
  const providers = createProviders().filter((provider) => enabled.has(provider.id));
  const quoteProviders = providers.filter((provider) => provider.kind === "quote");
  const rateProviders = providers.filter((provider) => provider.kind === "rates");
  const newsProviders = providers.filter((provider) => provider.kind === "news");
  const symbols = [...new Set((board.symbols || []).map((entry) => entry.symbol).filter(Boolean))];
  if (!quoteProviders.length) {
    throw new AppError("No quote source is enabled", [...enabled].join(", ") || "(none)", "QUOTE_NO_SOURCE");
  }

  const jobs = [];
  for (const symbol of symbols) jobs.push({ kind: "quote", symbol });
  if (board.index) jobs.push({ kind: "index", symbol: board.index });
  if (rateProviders.length) jobs.push({ kind: "rates" });
  if (newsProviders.length) jobs.push({ kind: "news" });

  const total = Math.max(
    1,
    (symbols.length + (board.index ? 1 : 0)) * quoteProviders.length + rateProviders.length + newsProviders.length,
  );
  let finished = 0;
  const step = (label) => {
    finished += 1;
    options.onProgress?.(Math.min(100, Math.round((finished / total) * 100)), label);
  };

  const sourceStates = new Map(SOURCE_IDS.filter((id) => enabled.has(id)).map((id) => [id, { id, ok: false, error: "", used: false }]));
  const note = (id, ok, error) => {
    const state = sourceStates.get(id);
    if (!state) return;
    state.used = true;
    if (ok) {
      state.ok = true;
      state.error = "";
    } else if (!state.ok) {
      state.error = String(error || "failed");
    }
  };

  const run = async (provider, request) => {
    try {
      throwIfAborted(options.signal);
      const url = provider.url(request);
      if (!url) throw new Error("Not available from this source");
      const response = await fetchImpl(url, { headers: provider.headers || {}, signal: options.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await readPayload(response);
      const data = provider.parse(payload, request);
      note(provider.id, true);
      return { id: provider.id, ok: true, data };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      note(provider.id, false, error?.message || String(error));
      return { id: provider.id, ok: false, error: error?.message || String(error), name: error?.name };
    } finally {
      step(provider.id);
    }
  };

  const quoteFor = async (symbol) => {
    const results = await Promise.all(quoteProviders.map((provider) => run(provider, { symbol, range: options.range || "1mo" })));
    return { symbol, results };
  };

  const [quoteRuns, indexRun, rateRuns, newsRuns] = await Promise.all([
    Promise.all(symbols.map(quoteFor)),
    board.index ? quoteFor(board.index) : Promise.resolve(null),
    rateProviders.length
      ? Promise.all(rateProviders.map((provider) => run(provider, { base: board.baseCurrency, currencies: board.currencies || [] })))
      : Promise.resolve([]),
    newsProviders.length
      ? Promise.all(
          newsProviders.map((provider) => run(provider, { query: newsQuery(board, options.language), language: options.language })),
        )
      : Promise.resolve([]),
  ]);
  throwIfAborted(options.signal);

  const quotes = [];
  const failures = [];
  for (const attempt of quoteRuns) {
    try {
      quotes.push(aggregateQuote(attempt.symbol, attempt.results));
    } catch (error) {
      failures.push(`${attempt.symbol}: ${error.message}`);
    }
  }
  if (symbols.length && !quotes.length) {
    const details = [...failures, ...quoteRuns.flatMap((attempt) => attempt.results.map((r) => `${r.id}: ${r.error || "ok"}`))].join("\n");
    throw new AppError("All quote sources failed", details, "QUOTE_ALL_FAILED");
  }
  let index = null;
  if (indexRun) {
    try {
      index = aggregateQuote(indexRun.symbol, indexRun.results);
    } catch {
      index = null;
    }
  }
  return {
    quotes,
    index,
    rates: aggregateRates(board.baseCurrency, rateRuns),
    news: mergeNews(newsRuns),
    failures,
    sources: [...sourceStates.values()].map((state) => ({ id: state.id, ok: state.ok, error: state.ok ? "" : state.error || "failed" })),
  };
}

export async function searchSymbols(query, options) {
  const response = await options.fetchImpl(yahooSearchUrl(query), { headers: {}, signal: options.signal });
  if (!response.ok) throw new AppError("Symbol search failed", `HTTP ${response.status}`, "SEARCH");
  return parseSymbolSearch(await response.json());
}

/** What to ask the news feed for: the market, then the names already watched. */
export function newsQuery(board, language) {
  const names = (board.symbols || [])
    .slice(0, 3)
    .map((entry) => listingName(entry, language))
    .filter(Boolean);
  const market = language === "en" ? board.marketEn || board.countryEn : board.marketKo || board.countryKo;
  const head = language === "en" ? "stock market" : "증시";
  return [market, head, ...names].filter(Boolean).join(" OR ");
}

async function readPayload(response) {
  let cachedText = null;
  let cachedJson = null;
  let hasJson = false;
  if (typeof response.text === "function") cachedText = await response.text();
  else if (typeof response.json === "function") {
    cachedJson = await response.json();
    hasJson = true;
    cachedText = JSON.stringify(cachedJson);
  }
  return {
    text: () => cachedText ?? "",
    json: () => {
      if (hasJson) return cachedJson;
      cachedJson = JSON.parse(cachedText ?? "null");
      hasJson = true;
      return cachedJson;
    },
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("Aborted");
  error.name = "AbortError";
  throw error;
}
