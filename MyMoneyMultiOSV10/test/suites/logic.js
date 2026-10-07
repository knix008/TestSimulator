import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_INFO, titleText } from "../../src/core/app-info.js";
import { copyRange, cutText, pasteText } from "../../src/core/clipboard.js";
import { createDocument, parseDocument, serializeDocument, withSymbol, withoutSymbol } from "../../src/core/document.js";
import { acceptImage, classifyDrop } from "../../src/core/drop.js";
import { AppError, errorCopyText, normalizeError } from "../../src/core/errors.js";
import { parseFcList, parseWindowsFonts, resolveFontList } from "../../src/core/fonts.js";
import { DICT, createI18n, dictionaryKeys } from "../../src/core/i18n.js";
import { dirname, userDataDir } from "../../src/core/paths.js";
import { buildPrintModel } from "../../src/core/print-model.js";
import { RecentFiles } from "../../src/core/recent.js";
import { MAX_SYMBOLS, sanitizeSettings } from "../../src/core/settings.js";
import { UndoStack } from "../../src/core/undo.js";
import { PopupHub } from "../../electron/popup-hub.js";
import { applyPlan, planInstall, programIconFor, runInstaller } from "../../installer/plan.js";
import { buildTrayMenu, listTrayItems, menuIconFile, placeTrayMenu, programIconFile, trayIconFile } from "../../src/ui/tray-menu.js";
import { layoutMenu, menuWindowOptions, placeBeside, popupKey, popupWindowOptions } from "../../src/ui/menu-layout.js";
import { buildTrayColumn } from "../../src/ui/menus.js";
import { layoutTabScroller } from "../../src/ui/tab-scroller.js";
import { CONTENT_PADDING, SCENE_ART, SCENE_GAP, SCENE_MAX_SCALE, SCENE_MIN_SCALE, SCENE_NATURAL, SCENE_TEXT, WINDOW_DEFAULT, WINDOW_MIN, clampWindowSize, placeWindow, recordedWindowPlacement, sceneFit, sceneScale, stampWindowPlacement, toolbarMinWidth } from "../../src/ui/window-spec.js";
import { CUSTOM_THEME_ID, DARK_THEMES, LIGHT_THEMES, MIN_ALPHA, THEMES, backgroundAlpha, isHexColor, isTheme, themeColors, themeVars } from "../../src/core/themes.js";
import { aggregateQuote, aggregateRates, mergeNews, presentBoard } from "../../src/market/aggregate.js";
import { formatMoney, formatPercent, formatPrice, formatRate, formatSigned, formatVolume, quotePair } from "../../src/market/format.js";
import { LISTINGS, MARKETS, filterListings, findMarket, listingName, marketOfSymbol } from "../../src/market/markets.js";
import {
  SOURCE_IDS,
  erApiUrl,
  frankfurterUrl,
  googleNewsUrl,
  parseErApi,
  parseFrankfurter,
  parseNewsFeed,
  parseSymbolSearch,
  parseYahooChart,
  sourcePageUrl,
  yahooChartUrl,
  yahooSearchUrl,
} from "../../src/market/providers.js";
import { loadBoard, newsQuery } from "../../src/market/service.js";
import { trendOf, trendText } from "../../src/market/trend.js";
import { rateBetween } from "../../src/ui/market-view.js";
import { SAMPLE_DATES, erApiBody, frankfurterBody, jsonResponse, newsBody, textResponse, yahooBody } from "../support.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function registerLogic(h) {
  h.category("Core");
  h.test("title is the product name and version", () => {
    assert.equal(titleText(), "MyMoney 1.0.0");
    assert.equal(APP_INFO.author, "SHKWON(knix008@naver.com)");
    assert.equal(APP_INFO.buildNumber, "20261007.1");
    assert.equal(APP_INFO.buildDate, "2026-10-07");
    assert.equal(APP_INFO.fileExtension, "mymoney");
  });
  h.test("korean and english catalogs have the same keys", () => {
    assert.deepEqual(Object.keys(DICT.ko).sort(), Object.keys(DICT.en).sort());
    for (const key of dictionaryKeys()) {
      assert.ok(DICT.ko[key].trim());
      assert.ok(DICT.en[key].trim());
    }
  });
  h.test("settings reject out of range values and keep ten recent files", () => {
    const settings = sanitizeSettings({
      language: "fr",
      theme: "nope",
      transparency: 140,
      customTheme: { mode: "neon", bg: "red", text: "#ABCDEF", accent: 5 },
      windowSize: { width: 50, height: 9000 },
      fontSize: 2,
      fontStyle: "fancy",
      zoom: 999,
      recentFiles: Array.from({ length: 12 }, (_, index) => `f${index}.mymoney`),
      units: "bitcoin",
      baseCurrency: "XYZ",
    });
    assert.equal(settings.language, "ko");
    assert.equal(settings.theme, "dark-ink");
    assert.equal(settings.transparency, 100);
    assert.equal("opacity" in settings, false);
    assert.deepEqual(settings.customTheme, { mode: "dark", bg: "#16283a", text: "#abcdef", accent: "#5cc8ff" });
    assert.equal(settings.windowSize, null);
    assert.deepEqual(sanitizeSettings({ windowPosition: { x: 12.6, y: -8 }, windowMaximized: 1 }).windowPosition, { x: 13, y: -8 });
    assert.equal(sanitizeSettings({ windowPosition: { x: 12.6, y: -8 }, windowMaximized: 1 }).windowMaximized, true);
    assert.equal(sanitizeSettings({ windowPosition: { x: "left", y: 4 } }).windowPosition, null);
    assert.equal(sanitizeSettings(null).windowMaximized, false);
    assert.equal(sanitizeSettings({ theme: "midnight" }).theme, "dark-midnight");
    assert.equal(sanitizeSettings({ theme: "ocean" }).theme, "light-sky");
    assert.equal(sanitizeSettings({ theme: "custom" }).theme, "custom");
    assert.equal(sanitizeSettings(null).transparency, 30);
    assert.equal(sanitizeSettings(null).backgroundOpacity, 40);
    assert.equal(sanitizeSettings(null).displayPriority, "average");
    assert.equal(sanitizeSettings({ displayPriority: "yahoo" }).displayPriority, "yahoo");
    assert.equal(sanitizeSettings({ displayPriority: "nope" }).displayPriority, "average");
    assert.equal(sanitizeSettings({ backgroundOpacity: 140 }).backgroundOpacity, 100);
    assert.equal(sanitizeSettings({ backgroundOpacity: -3 }).backgroundOpacity, 0);
    assert.equal(settings.fontSize, 8);
    assert.equal(settings.fontStyle, "normal");
    assert.equal(settings.zoom, 200);
    assert.equal(settings.units, "native");
    assert.equal(settings.baseCurrency, "KRW");
    assert.equal(sanitizeSettings({ units: "base" }).units, "base");
    assert.equal(sanitizeSettings({ baseCurrency: "usd" }).baseCurrency, "USD");
    assert.equal(settings.updateHours, 1);
    assert.equal(sanitizeSettings({ updateHours: 12 }).updateHours, 12);
    assert.equal(sanitizeSettings({ updateHours: 3 }).updateHours, 1);
    assert.equal(settings.recentFiles.length, 10);
    assert.equal(settings.defaultBoard.marketCode, "KR");
    assert.ok(settings.defaultBoard.symbols.length >= 1);
    assert.equal("defaultLocation" in settings, false);
  });
  h.test("a board keeps only known markets, drops duplicates, and caps the watchlist", () => {
    const board = sanitizeSettings({
      defaultBoard: {
        marketCode: "ZZ",
        symbols: [
          { symbol: "AAPL", nameEn: "Apple" },
          { symbol: "AAPL", nameEn: "Apple again" },
          ...Array.from({ length: 30 }, (_, index) => ({ symbol: `S${index}`, nameEn: `S${index}` })),
        ],
        activeSymbol: "NOPE",
      },
    }).defaultBoard;
    assert.equal(board.marketCode, "KR");
    assert.equal(board.symbols.length, MAX_SYMBOLS);
    assert.equal(board.symbols.filter((entry) => entry.symbol === "AAPL").length, 1);
    assert.equal(board.activeSymbol, "AAPL");
    assert.equal(board.currency, "KRW");
    assert.equal(board.index, "^KS11");
    assert.equal(board.indexKo, "코스피");
    assert.equal(board.indexEn, "KOSPI");
  });
  h.test("undo redo and a new edit clears the redo stack", () => {
    const stack = new UndoStack();
    let value = 0;
    stack.push({ undo: () => (value = 0), redo: () => (value = 1) });
    stack.undo();
    assert.equal(value, 0);
    stack.redo();
    assert.equal(value, 1);
    stack.undo();
    stack.push({ undo: () => (value = 0), redo: () => (value = 2) });
    assert.equal(stack.canRedo(), false);
    stack.redo();
    assert.equal(value, 0);
  });
  h.test("recent files keep the newest ten and can drop one or all", () => {
    const recent = new RecentFiles(10);
    for (let index = 0; index < 12; index += 1) recent.add(`file-${index}.mymoney`);
    assert.equal(recent.items.length, 10);
    assert.equal(recent.items[0], "file-11.mymoney");
    recent.add("file-11.mymoney");
    assert.equal(recent.items.filter((item) => item === "file-11.mymoney").length, 1);
    recent.remove("file-11.mymoney");
    assert.equal(recent.items.includes("file-11.mymoney"), false);
    recent.clear();
    assert.equal(recent.items.length, 0);
  });
  h.test("clipboard helpers cut and paste a range", () => {
    assert.equal(copyRange("abcdef", 1, 4), "bcd");
    const cut = cutText("abcdef", 1, 4);
    assert.equal(cut.clipboard, "bcd");
    assert.equal(cut.text, "aef");
    assert.equal(pasteText("aef", 1, 1, "bcd").text, "abcdef");
  });
  h.test("paths and user data folders are platform specific", () => {
    assert.equal(dirname("C:/docs/a.mymoney"), "C:/docs");
    assert.equal(dirname("C:\\docs\\a.mymoney"), "C:/docs");
    assert.match(userDataDir("win32", "C:/Users/me"), /MyMoney/);
    assert.match(userDataDir("darwin", "/Users/me"), /Application Support\/MyMoney/);
    assert.match(userDataDir("linux", "/home/me"), /.config\/MyMoney/);
  });
  h.test("error text keeps the code, message, time, operation, app, and details", () => {
    const error = new AppError("Quote service failed", "HTTP 500 from provider", "QUOTE");
    const info = normalizeError(error, { operation: "refresh", time: new Date(2026, 9, 7, 9, 5, 3), environment: "test-env" });
    assert.equal(info.time, "2026-10-07 09:05:03");
    assert.equal(info.app, "MyMoney 1.0.0");
    const text = errorCopyText(info, { time: "Time" });
    assert.match(text, /^\[QUOTE\] Quote service failed/);
    assert.match(text, /Time: 2026-10-07 09:05:03/);
    assert.match(text, /Operation: refresh/);
    assert.match(text, /Application: MyMoney 1\.0\.0/);
    assert.match(text, /Environment: test-env/);
    assert.match(text, /HTTP 500/);
    const plain = normalizeError(new RangeError("bad range"));
    assert.equal(plain.code, "RangeError");
    assert.match(plain.details, /RangeError: bad range/);
    assert.equal(normalizeError("text failure").message, "text failure");
  });
  h.test("there are 20 light and 20 dark themes plus a custom theme", () => {
    assert.equal(LIGHT_THEMES.length, 20);
    assert.equal(DARK_THEMES.length, 20);
    assert.ok(LIGHT_THEMES.every((theme) => theme.mode === "light" && theme.name.ko && theme.name.en));
    assert.ok(DARK_THEMES.every((theme) => theme.mode === "dark" && theme.name.ko && theme.name.en));
    assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 40);
    assert.ok(THEMES.every((theme) => [theme.bg, theme.bgTop, theme.text, theme.accent].every(isHexColor)));
    assert.equal(isTheme(CUSTOM_THEME_ID), true);
    assert.equal(isTheme("nope"), false);
    const custom = themeColors(CUSTOM_THEME_ID, { mode: "light", bg: "#ffffff", text: "#000000", accent: "#ff0000" });
    assert.equal(custom.mode, "light");
    assert.equal(custom.accent, "#ff0000");
    assert.equal(themeColors("nope").id, "dark-ink");
  });
  h.test("transparency only changes the background alpha", () => {
    assert.ok(MIN_ALPHA > 0 && MIN_ALPHA < 1);
    assert.equal(backgroundAlpha(0), 1);
    assert.equal(backgroundAlpha(100), MIN_ALPHA);
    assert.equal(backgroundAlpha(50), 0.625);
    assert.equal(backgroundAlpha(-20), 1);
    assert.equal(backgroundAlpha(180), MIN_ALPHA);
    const colors = themeColors("light-paper");
    const solid = themeVars(colors, 0);
    const clear = themeVars(colors, 100);
    assert.equal(solid["--bg"], "rgba(247, 248, 251, 1)");
    assert.equal(clear["--bg"], `rgba(247, 248, 251, ${MIN_ALPHA})`);
    assert.equal(clear["--fg"], solid["--fg"]);
    assert.equal(clear["--bg-solid"], "#f7f8fb");
  });
  h.test("document round trip keeps the watchlist and drops old fields", () => {
    const doc = createDocument();
    doc.tabs[0].properties.label = "tech";
    const raw = JSON.parse(serializeDocument(doc));
    raw.tabs[0].dayNotes = { "2026-10-07": "buy" };
    const parsed = parseDocument(JSON.stringify(raw));
    assert.equal(parsed.tabs[0].properties.label, "tech");
    assert.equal("dayNotes" in parsed.tabs[0], false);
    assert.equal(parsed.tabs[0].board.symbols[0].symbol, "005930.KS");
    assert.equal(JSON.parse(serializeDocument(parsed)).tabs[0].dayNotes, undefined);
    assert.throws(() => parseDocument("{"), /Invalid document/);
    assert.throws(() => parseDocument(JSON.stringify({ format: "other" })), /Invalid document/);
    assert.throws(() => parseDocument(JSON.stringify({ format: "mymoney", tabs: [] })), /Invalid document/);
  });
  h.test("a watchlist adds once, removes, and never loses its active symbol", () => {
    const board = createDocument().tabs[0].board;
    const added = withSymbol(board, { symbol: "000660.KS", nameKo: "SK하이닉스", nameEn: "SK hynix", marketCode: "KR" });
    assert.equal(added.symbols.length, board.symbols.length);
    const fresh = withSymbol({ ...board, symbols: [], activeSymbol: "" }, { symbol: "AAPL", nameEn: "Apple", marketCode: "US" });
    assert.equal(fresh.symbols.length, 1);
    assert.equal(fresh.activeSymbol, "AAPL");
    assert.equal(withSymbol(fresh, { symbol: "AAPL", nameEn: "Apple" }).symbols.length, 1);
    const removed = withoutSymbol(board, board.activeSymbol);
    assert.equal(removed.symbols.some((entry) => entry.symbol === board.activeSymbol), false);
    assert.equal(removed.activeSymbol, removed.symbols[0].symbol);
  });
  h.test("image drops are accepted at any size and unknown files are not", () => {
    assert.equal(classifyDrop({ name: "a.mymoney", type: "application/json" }), "document");
    assert.equal(classifyDrop({ name: "a.PNG", type: "" }), "image");
    assert.equal(acceptImage({ name: "huge.png", type: "image/png", size: 80_000_000 }).ok, true);
    assert.equal(acceptImage({ name: "notes.txt", type: "text/plain", size: 10 }).ok, false);
  });
  h.test("font lists keep every system name", () => {
    const windows = parseWindowsFonts("Malgun Gothic\r\nSegoe UI\r\nArial\r\n");
    assert.deepEqual(windows, ["Arial", "Malgun Gothic", "Segoe UI"]);
    const linux = parseFcList("/usr/share/fonts/a.ttf: Noto Sans,Noto Sans Bold:style=Regular\n");
    assert.deepEqual(linux, ["Noto Sans"]);
    const many = Array.from({ length: 40 }, (_, index) => `Family ${index}`);
    assert.equal(resolveFontList(many).length, 40);
    assert.ok(resolveFontList([]).includes("Malgun Gothic"));
  });

  h.category("Markets");
  h.test("korea and the united states lead a catalog of listed markets", () => {
    assert.equal(MARKETS[0].marketCode, "KR");
    assert.equal(MARKETS[1].marketCode, "US");
    assert.ok(MARKETS.length >= 10);
    assert.equal(new Set(MARKETS.map((market) => market.marketCode)).size, MARKETS.length);
    for (const market of MARKETS) {
      assert.ok(market.countryKo && market.countryEn, market.marketCode);
      assert.ok(market.marketKo && market.marketEn, market.marketCode);
      assert.match(market.currency, /^[A-Z]{3}$/);
      assert.ok(market.index, market.marketCode);
    }
    const korea = findMarket("KR");
    assert.equal(korea.suffix, ".KS");
    assert.equal(findMarket("US").suffix, "");
    assert.equal(findMarket("ZZ"), null);
  });
  h.test("every listing carries the suffix of its market", () => {
    assert.ok(LISTINGS.length >= 60);
    for (const listing of LISTINGS) {
      const market = findMarket(listing.marketCode);
      assert.ok(market, listing.symbol);
      assert.equal(listing.symbol, `${listing.code}${market.suffix}`);
      assert.ok(listing.nameKo && listing.nameEn, listing.symbol);
    }
    assert.ok(filterListings(LISTINGS, "KR", "").some((entry) => entry.symbol === "005930.KS"));
    assert.ok(filterListings(LISTINGS, "US", "").some((entry) => entry.symbol === "AAPL"));
    assert.equal(filterListings(LISTINGS, "KR", "삼성전자")[0].symbol, "005930.KS");
    assert.equal(filterListings(LISTINGS, "US", "nvidia")[0].symbol, "NVDA");
    assert.equal(filterListings(LISTINGS, "US", "nothing here").length, 0);
    assert.equal(listingName({ nameKo: "삼성전자", nameEn: "Samsung" }, "ko"), "삼성전자");
    assert.equal(listingName({ nameKo: "삼성전자", nameEn: "Samsung" }, "en"), "Samsung");
    assert.equal(marketOfSymbol("005930.KS").marketCode, "KR");
    assert.equal(marketOfSymbol("AAPL").marketCode, "US");
    assert.equal(marketOfSymbol("7203.T").marketCode, "JP");
  });
  h.test("provider urls carry the symbol, the base currency, and the language", () => {
    assert.match(yahooChartUrl("005930.KS"), /chart\/005930\.KS/);
    assert.match(yahooChartUrl("005930.KS"), /range=1mo/);
    assert.match(yahooSearchUrl("samsung"), /q=samsung/);
    assert.match(yahooChartUrl("AAPL", "1mo", "1d", "query2"), /^https:\/\/query2\.finance\.yahoo\.com/);
    assert.match(yahooChartUrl("AAPL", "1mo", "1d", "query1"), /^https:\/\/query1\.finance\.yahoo\.com/);
    assert.match(frankfurterUrl("KRW", ["USD", "KRW", "EUR"]), /from=KRW/);
    assert.match(frankfurterUrl("KRW", ["USD", "KRW", "EUR"]), /to=USD%2CEUR/);
    assert.match(erApiUrl("usd"), /latest\/USD$/);
    assert.match(googleNewsUrl("증시", "ko"), /hl=ko/);
    assert.match(googleNewsUrl("stocks", "en"), /hl=en-US/);
    assert.match(sourcePageUrl("005930.KS"), /finance\.yahoo\.com\/quote\/005930/);
  });
  h.test("quote, rate, and news parsers share one shape per kind", () => {
    const yahoo = parseYahooChart(yahooBody("AAPL", SAMPLE_DATES, 100, 2, "USD"), "AAPL");
    assert.equal(yahoo.days.length, 3);
    assert.equal(yahoo.days[2].close, 100);
    assert.equal(yahoo.currency, "USD");
    assert.equal(yahoo.days[0].date, "2026-10-05");
    assert.throws(() => parseYahooChart({ chart: { error: { description: "Not Found" } } }, "X"), /Not Found/);
    assert.equal(yahoo.days[0].source, "yahoo");
    const mirror = parseYahooChart(yahooBody("AAPL", SAMPLE_DATES, 102, 2, "USD"), "AAPL", "yahoo2");
    assert.equal(mirror.days[2].close, 102);
    assert.equal(mirror.days[0].source, "yahoo2");
    assert.throws(() => parseYahooChart({ chart: { result: [{ meta: {}, timestamp: [], indicators: {} }] } }, "X"), /Empty chart series/);
    const frank = parseFrankfurter(frankfurterBody("KRW"));
    assert.equal(frank.base, "KRW");
    assert.equal(frank.rows.find((row) => row.code === "USD").rate, 0.00074);
    const er = parseErApi(erApiBody("KRW"), ["USD", "EUR"]);
    assert.equal(er.rows.length, 2);
    assert.equal(er.rows.some((row) => row.code === "KRW"), false);
    assert.throws(() => parseErApi({ result: "error", "error-type": "unsupported-code" }), /unsupported-code/);
    const news = parseNewsFeed(newsBody(["삼성전자 신고가", "코스피 상승"]));
    assert.equal(news.rows.length, 2);
    assert.equal(news.rows[0].title, "삼성전자 신고가");
    assert.equal(news.rows[0].outlet, "Example News");
    assert.match(news.rows[0].published, /^2026-10-07T/);
    assert.throws(() => parseNewsFeed("<rss></rss>"), /No headlines/);
    const found = parseSymbolSearch({ quotes: [{ symbol: "005930.KS", longname: "Samsung Electronics", exchDisp: "KSE", quoteType: "EQUITY" }] });
    assert.equal(found[0].symbol, "005930.KS");
    assert.equal(found[0].code, "005930");
  });
  h.test("a headline feed is read as text and never as markup", () => {
    const xml = `<rss><channel><item><title>&lt;script&gt;alert(1)&lt;/script&gt; 증시</title><link>https://a.example/1</link><pubDate>Wed, 07 Oct 2026 01:00:00 GMT</pubDate></item></channel></rss>`;
    const news = parseNewsFeed(xml);
    assert.equal(news.rows[0].title, "<script>alert(1)</script> 증시");
    assert.equal(news.rows[0].outlet, "a.example");
  });
  h.test("two quote sources average into one series with a change and a trend", () => {
    const quote = aggregateQuote("AAPL", [
      { id: "yahoo", ok: true, data: parseYahooChart(yahooBody("AAPL", SAMPLE_DATES, 100, 2, "USD"), "AAPL") },
      { id: "yahoo2", ok: true, data: parseYahooChart(yahooBody("AAPL", SAMPLE_DATES, 102, 2, "USD"), "AAPL", "yahoo2") },
      { id: "gone", ok: false, error: "HTTP 503" },
    ]);
    assert.equal(quote.days.length, 3);
    assert.equal(quote.last, 101);
    assert.equal(quote.previousClose, 99);
    assert.equal(quote.change, 2);
    assert.equal(quote.changePercent, 2.02);
    assert.equal(quote.trend, "up");
    assert.equal(quote.currency, "USD");
    assert.equal(quote.bySource.yahoo.last, 100);
    assert.equal(quote.bySource.yahoo2.last, 102);
    assert.throws(() => aggregateQuote("AAPL", [{ id: "yahoo", ok: false, error: "down" }]), /All quote sources failed/);
  });
  h.test("a display priority pins quotes and rates to one source", () => {
    const quote = aggregateQuote("AAPL", [
      { id: "yahoo", ok: true, data: parseYahooChart(yahooBody("AAPL", SAMPLE_DATES, 100, 2, "USD"), "AAPL") },
      { id: "yahoo2", ok: true, data: parseYahooChart(yahooBody("AAPL", SAMPLE_DATES, 102, 2, "USD"), "AAPL", "yahoo2") },
    ]);
    const rates = aggregateRates("KRW", [
      { id: "frankfurter", ok: true, data: parseFrankfurter(frankfurterBody("KRW")) },
      { id: "erapi", ok: true, data: parseErApi(erApiBody("KRW"), ["USD", "EUR", "JPY", "CNY"]) },
    ]);
    const board = { quotes: [quote], index: null, rates, news: [] };
    assert.equal(rates.rows.find((row) => row.code === "USD").rate, 0.00075);
    assert.equal(presentBoard(board, "average").quotes[0].last, 101);
    assert.equal(presentBoard(board, "yahoo").quotes[0].last, 100);
    assert.equal(presentBoard(board, "yahoo").quotes[0].currency, "USD");
    assert.equal(presentBoard(board, "yahoo2").quotes[0].last, 102);
    assert.equal(presentBoard(board, "frankfurter").rates.rows.find((row) => row.code === "USD").rate, 0.00074);
    assert.equal(presentBoard(board, "erapi").rates.rows.find((row) => row.code === "USD").rate, 0.00076);
    // A source that never answered falls back to the average.
    assert.equal(presentBoard(board, "gnews").quotes[0].last, 101);
  });
  h.test("headlines merge, drop repeats, and stay newest first", () => {
    const merged = mergeNews([
      { id: "gnews", ok: true, data: parseNewsFeed(newsBody(["가", "나"])) },
      { id: "other", ok: true, data: { rows: [{ title: "가", link: "x", outlet: "y", published: "2026-10-07T09:00:00.000Z" }] } },
      { id: "dead", ok: false, error: "HTTP 500" },
    ]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].title, "나");
    assert.equal(mergeNews([]).length, 0);
  });
  h.test("a pair is quoted on the side that reads as a price", () => {
    // Against the won the table stores 0.000749 USD per won; a reader wants 1,335 won per dollar.
    const usd = quotePair("KRW", "USD", 0.000749);
    assert.equal(usd.pair, "USD/KRW");
    assert.equal(Math.round(usd.value), 1335);
    const jpy = quotePair("KRW", "JPY", 0.118013);
    assert.equal(jpy.pair, "JPY/KRW");
    assert.ok(Math.abs(jpy.value - 8.47) < 0.01);
    // With a strong base the direct quote is already the readable one.
    const krw = quotePair("USD", "KRW", 1335.11);
    assert.equal(krw.pair, "USD/KRW");
    assert.equal(krw.value, 1335.11);
    assert.deepEqual(quotePair("KRW", "USD", 0), { pair: "KRW/USD", value: null });
    assert.deepEqual(quotePair("KRW", "USD", null), { pair: "KRW/USD", value: null });
  });
  h.test("a cross rate comes out of the quoted table in both directions", () => {
    const rates = { base: "KRW", rows: [{ code: "USD", rate: 0.00075 }, { code: "JPY", rate: 0.11 }] };
    assert.equal(rateBetween(rates, "KRW", "USD"), 0.00075);
    assert.equal(Math.round(rateBetween(rates, "USD", "KRW")), 1333);
    assert.ok(Math.abs(rateBetween(rates, "USD", "JPY") - 146.67) < 0.01);
    assert.equal(rateBetween(rates, "USD", "GBP"), null);
    assert.equal(rateBetween(null, "USD", "KRW"), null);
  });
  h.test("a trend is up, down, or unchanged inside a narrow band", () => {
    assert.equal(trendOf(2.5), "up");
    assert.equal(trendOf(-2.5), "down");
    assert.equal(trendOf(0), "flat");
    assert.equal(trendOf(0.01), "flat");
    assert.equal(trendOf(null), "none");
    assert.equal(trendText("up", "ko"), "상승");
    assert.equal(trendText("down", "en"), "Down");
  });
  h.test("money, percent, and volume follow the currency and the language", () => {
    assert.equal(formatPrice(1234567, "KRW", "ko"), "1,234,567");
    assert.equal(formatPrice(1234.5, "USD", "en"), "1,234.50");
    assert.equal(formatMoney(1234, "USD", "en"), "1,234.00 USD");
    assert.equal(formatMoney(null, "USD"), "—");
    assert.equal(formatSigned(-250, "KRW", "ko"), "-250");
    assert.equal(formatSigned(250, "KRW", "ko"), "+250");
    assert.equal(formatPercent(2.345), "+2.35%");
    assert.equal(formatPercent(-2.3), "-2.30%");
    assert.equal(formatPercent(0), "0.00%");
    assert.equal(formatRate(1333.21, "ko"), "1,333.21");
    assert.equal(formatRate(0.00075, "ko"), "0.000750");
    assert.equal(formatVolume(123_456_789, "ko"), "1.2억");
    assert.equal(formatVolume(123_456_789, "en"), "123.5M");
    assert.equal(formatVolume(null), "—");
  });
  h.test("loadBoard reports progress, keeps working sources, and names every one", async () => {
    const seen = [];
    const board = {
      marketCode: "KR",
      marketKo: "한국거래소",
      marketEn: "Korea Exchange",
      countryKo: "대한민국",
      countryEn: "South Korea",
      index: "^KS11",
      baseCurrency: "KRW",
      currencies: ["USD", "EUR"],
      symbols: [{ symbol: "005930.KS", nameKo: "삼성전자", nameEn: "Samsung Electronics" }],
    };
    const data = await loadBoard(board, {
      sources: SOURCE_IDS,
      language: "ko",
      onProgress: (percent, id) => seen.push([percent, id]),
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.includes("query2")) return jsonResponse({ chart: { error: { description: "Service unavailable" } } }, false, 503);
        if (href.includes("/v8/finance/chart/")) {
          const symbol = decodeURIComponent(href.split("/chart/")[1].split("?")[0]);
          return jsonResponse(yahooBody(symbol, SAMPLE_DATES, 100, 2, "KRW"));
        }
        if (href.includes("frankfurter")) return jsonResponse(frankfurterBody("KRW"));
        if (href.includes("er-api")) return jsonResponse(erApiBody("KRW"));
        return textResponse(newsBody());
      },
    });
    assert.equal(data.quotes.length, 1);
    assert.equal(data.quotes[0].last, 100);
    assert.equal(data.index.symbol, "^KS11");
    assert.ok(data.rates.rows.length >= 2);
    assert.equal(data.news.length, 2);
    assert.equal(seen.at(-1)[0], 100);
    assert.equal(data.sources.find((source) => source.id === "yahoo").ok, true);
    assert.equal(data.sources.find((source) => source.id === "yahoo2").ok, false);
    assert.equal(data.sources.find((source) => source.id === "gnews").ok, true);
    assert.deepEqual(data.sources.map((source) => source.id).sort(), [...SOURCE_IDS].sort());
  });
  h.test("a board whose every quote source fails is an error", async () => {
    const board = { marketCode: "KR", baseCurrency: "KRW", index: "", symbols: [{ symbol: "005930.KS" }] };
    await assert.rejects(
      loadBoard(board, { sources: ["yahoo", "yahoo2"], fetchImpl: async () => jsonResponse({}, false, 500) }),
      /All quote sources failed/,
    );
    await assert.rejects(
      loadBoard(board, { sources: ["gnews"], fetchImpl: async () => textResponse(newsBody()) }),
      /No quote source is enabled/,
    );
  });
  h.test("the news query names the market and the first watched companies", () => {
    const board = {
      marketKo: "한국거래소",
      marketEn: "Korea Exchange",
      symbols: [{ nameKo: "삼성전자", nameEn: "Samsung Electronics" }],
    };
    assert.match(newsQuery(board, "ko"), /한국거래소/);
    assert.match(newsQuery(board, "ko"), /증시/);
    assert.match(newsQuery(board, "ko"), /삼성전자/);
    assert.match(newsQuery(board, "en"), /Korea Exchange/);
    assert.match(newsQuery(board, "en"), /stock market/);
  });

  h.category("Print");
  h.test("print scopes cover all tabs, the current tab, and a custom date range", () => {
    const tabs = [tab("한국거래소", "Korea Exchange", "005930.KS", SAMPLE_DATES), tab("미국 증시", "US Markets", "AAPL", SAMPLE_DATES)];
    const all = buildPrintModel({ scope: "all", tabs, activeIndex: 0, pageSetup: { paper: "A4", orientation: "portrait", margin: 15 }, language: "en" });
    assert.match(all.html, /Korea Exchange/);
    assert.match(all.html, /US Markets/);
    assert.match(all.html, /size: A4 portrait/);
    assert.match(all.html, /Exchange rates/);
    assert.match(all.html, /Today&#39;s news|Today's news/);
    const current = buildPrintModel({ scope: "current", tabs, activeIndex: 1, pageSetup: { paper: "Letter", orientation: "landscape", margin: 10 }, language: "en" });
    assert.equal(current.html.includes("Korea Exchange"), false);
    assert.match(current.html, /Letter landscape/);
    const custom = buildPrintModel({
      scope: "custom",
      tabs,
      activeIndex: 0,
      fromDate: "2026-10-06",
      toDate: "2026-10-06",
      pageSetup: { paper: "A4", orientation: "portrait", margin: 15 },
      language: "ko",
    });
    assert.match(custom.html, /2026-10-06/);
    assert.equal(custom.html.includes("2026-10-05"), false);
    assert.throws(
      () => buildPrintModel({ scope: "custom", tabs, activeIndex: 0, fromDate: "2026-10-09", toDate: "2026-10-01", pageSetup: {}, language: "en" }),
      /Invalid range/,
    );
  });

  h.category("Layout");
  h.test("menus stay one column and are not clipped to the window", () => {
    const items = [
      { label: "새로 만들기", shortcut: "Ctrl+N" },
      { label: "다른 이름으로 저장", shortcut: "Ctrl+Shift+S" },
    ];
    const layout = layoutMenu(items, { x: 10, y: 20, screenX: 400, screenY: 500 }, { width: 80, height: 40 });
    assert.equal(layout.columns, 1);
    assert.equal(layout.clippedToWindow, false);
    assert.ok(layout.width > 80);
    assert.ok(layout.height > 40);
    assert.equal(layout.x, 10);
    const options = menuWindowOptions(layout, { id: "parent" });
    assert.equal(options.parent.id, "parent");
    assert.equal(options.resizable, false);
    assert.equal(options.frame, false);
    assert.equal(options.thickFrame, false);
    assert.equal(options.width, Math.ceil(layout.width));
  });
  h.test("popup windows are fixed and parented to the main window", () => {
    const options = popupWindowOptions({ width: 680, height: 560 }, { id: "main" }, { x: 0, y: 0, width: 1000, height: 800 });
    assert.equal(options.resizable, false);
    assert.equal(options.maximizable, false);
    assert.equal(options.thickFrame, false);
    assert.equal(options.parent.id, "main");
    assert.equal(options.width, 680);
    assert.equal(options.height, 560);
    assert.equal(options.x, Math.round((1000 - 680) / 2));
    const work = { x: 0, y: 0, width: 1920, height: 1080 };
    const main = { x: 100, y: 80, width: 760, height: 640 };
    const beside = popupWindowOptions({ type: "settings", width: 680, height: 640 }, { id: "main" }, work, main);
    assert.equal(beside.x, 100 + 760 + 16);
    assert.equal(beside.y, 80);
    const stocks = placeBeside(main, { width: 720, height: 520 }, work);
    assert.equal(stocks.x, 100 + 760 + 16);
    assert.equal(stocks.y, 80 + Math.round((640 - 520) / 2));
    const parked = placeBeside({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 680, height: 640 }, work);
    assert.equal(parked.x, 1920 - 680);
    assert.ok(parked.x > 0);
    assert.equal(popupKey({ type: "panel", panel: "rates" }), "panel:rates");
    assert.equal(popupKey({ type: "settings" }), "settings");
    assert.match(fs.readFileSync(path.join(root, "electron/main.js"), "utf8"), /popupWindowOptions\(stored, parent, workArea, parentBounds\)/);
  });
  h.test("tab overflow uses previous and next instead of a scrollbar", () => {
    const layout = layoutTabScroller(0, 8, 300, 148);
    assert.equal(layout.scrollbar, false);
    assert.equal(layout.overflow, "hidden");
    assert.equal(layout.visible, 2);
    assert.equal(layout.showPrev, false);
    assert.equal(layout.showNext, true);
    const next = layoutTabScroller(1, 8, 300, 148);
    assert.equal(next.showPrev, true);
  });
  h.test("window size is clamped to a usable minimum", () => {
    assert.deepEqual(clampWindowSize(null), WINDOW_DEFAULT);
    assert.equal(WINDOW_MIN.width, toolbarMinWidth());
    assert.ok(WINDOW_MIN.width >= 320);
    assert.equal(WINDOW_MIN.height, 46 + CONTENT_PADDING.top + CONTENT_PADDING.bottom + Math.ceil(SCENE_NATURAL.height * SCENE_MIN_SCALE));
    assert.deepEqual(clampWindowSize({ width: 10, height: 10 }), WINDOW_MIN);
    assert.deepEqual(clampWindowSize({ width: 900.4, height: 700.6 }), { width: 900, height: 701 });
    const desk = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    const restored = placeWindow({ x: 40, y: 60, width: 800, height: 640 }, desk);
    assert.deepEqual(restored, { x: 40, y: 60, width: 800, height: 640 });
    const centered = placeWindow({ width: 760, height: 640 }, desk);
    assert.equal(centered.x, Math.round((1920 - 760) / 2));
    assert.equal(centered.y, Math.round((1080 - 640) / 2));
    const missing = placeWindow({ x: 4000, y: 20, width: 800, height: 640 }, desk);
    assert.deepEqual(missing, placeWindow({ width: 800, height: 640 }, desk));
    const second = [{ x: 0, y: 0, width: 1280, height: 800 }, { x: 1280, y: 0, width: 1920, height: 1080 }];
    assert.deepEqual(placeWindow({ x: 1400, y: 80, width: 900, height: 700 }, second), { x: 1400, y: 80, width: 900, height: 700 });
    const kept = stampWindowPlacement({ windowSize: null, windowPosition: { x: 10, y: 20 } }, { x: 30, y: 40, width: 880, height: 610, maximized: false });
    assert.deepEqual(kept.windowSize, { width: 880, height: 610 });
    assert.deepEqual(kept.windowPosition, { x: 30, y: 40 });
    assert.equal(stampWindowPlacement({ windowSize: { width: 880, height: 610 } }, { width: 10, height: 10 }).windowSize.width, 880);
    const recorded = recordedWindowPlacement({ windowSize: null, windowPosition: { x: 12, y: 8 } }, { x: 40, y: 18, width: 910, height: 640 });
    assert.deepEqual({ x: recorded.x, y: recorded.y, width: recorded.width, height: recorded.height }, { x: 40, y: 18, width: 910, height: 640 });
    assert.equal(sceneScale(SCENE_NATURAL), 1);
    assert.equal(sceneScale({ width: 80, height: 80 }), SCENE_MIN_SCALE);
    // The label column holds a grouped seven-digit price, so it is the wider half.
    assert.equal(SCENE_TEXT, SCENE_NATURAL.width - SCENE_ART - SCENE_GAP);
    assert.ok(SCENE_TEXT > SCENE_ART);
    // Picture and labels always grow together.
    const roomy = sceneFit({ width: 728, height: 594 });
    assert.equal(roomy.text, roomy.art);
    assert.ok(roomy.art > 1 && roomy.art <= SCENE_MAX_SCALE);
    const huge = sceneFit({ width: 4000, height: 3000 });
    assert.equal(huge.art, SCENE_MAX_SCALE);
    assert.equal(huge.text, SCENE_MAX_SCALE);
    const tight = sceneFit({ width: 300, height: 160 });
    assert.ok(tight.text < 1);
    assert.equal(tight.text, tight.art);
    assert.ok(tight.text >= SCENE_MIN_SCALE);
    assert.equal(sceneFit({ width: 10, height: 10 }).art, SCENE_MIN_SCALE);
  });
  h.test("menus count separators in their height", () => {
    const items = [
      { label: "A", separated: false },
      { label: "B", separated: true },
      { label: "C", separated: true },
    ];
    assert.equal(layoutMenu(items, { x: 0, y: 0 }).height, 3 * 32 + 2 * 9 + 12);
  });
  h.test("the tray menu stays left aligned", () => {
    const work = { x: 0, y: 0, width: 1200, height: 700 };
    const aligned = placeTrayMenu({ x: 80, y: 660, width: 24, height: 40 }, { width: 220, height: 240 }, work);
    assert.equal(aligned.x, 80);
    assert.equal(aligned.y, 420);
    const shifted = placeTrayMenu({ x: 1160, y: 660, width: 32, height: 40 }, { width: 220, height: 240 }, work);
    assert.equal(shifted.x, 980);
    assert.equal(shifted.x + shifted.width, work.width);
    const column = buildTrayColumn(buildTrayMenu((key) => createI18n("ko").t(key)));
    assert.equal(column.dataset.align, "left");
    assert.equal(column.style.textAlign, "left");
    assert.equal(column.style.flexDirection, "column");
    const row = column.querySelector(".menu-item");
    assert.equal(row.style.justifyContent, "flex-start");
    assert.equal(row.style.textAlign, "left");
    assert.ok(row.querySelector(".menu-icon svg"));
    const market = column.querySelector('[data-cmd="market"] .menu-icon svg');
    assert.match(market.innerHTML, /fill="#ffc430"/);
    const opened = buildTrayColumn(buildTrayMenu((key) => createI18n("ko").t(key)).find((entry) => entry.id === "market").submenu);
    for (const name of ["stocks", "rates", "news"]) {
      const svg = opened.querySelector(`[data-cmd="${name}"] .menu-icon svg`);
      assert.match(svg.innerHTML, /fill="#[0-9a-f]{6}"/i, name);
    }
  });
  h.test("popup hub closes every popup when the app quits", async () => {
    const hub = new PopupHub();
    const closed = [];
    let focuses = 0;
    const started = hub.begin({ type: "about" }, () => ({
      close: () => closed.push("about"),
      send() {},
      focus() {
        focuses += 1;
      },
    }));
    const id = started.id;
    assert.equal(started.focused, false);
    const again = hub.begin({ type: "about" }, () => {
      throw new Error("about should stay open");
    });
    assert.equal(again.focused, true);
    assert.equal(again.id, id);
    assert.equal(focuses, 1);
    assert.equal(hub.windows.size, 1);
    const stocks = hub.begin({ type: "panel", panel: "stocks" }, () => ({ close() {}, send() {}, focus() {} }));
    const rates = hub.begin({ type: "panel", panel: "rates" }, () => ({ close() {}, send() {}, focus() {} }));
    assert.equal(stocks.focused, false);
    assert.equal(rates.focused, false);
    assert.notEqual(stocks.id, rates.id);
    const pending = hub.wait(id);
    hub.closeAll();
    assert.deepEqual(await pending, { action: "close" });
    assert.deepEqual(closed, ["about"]);
    assert.equal(hub.windows.size, 0);
  });

  h.category("Installer");
  h.test("fresh install only copies the app and registers both icons", () => {
    const plan = planInstall({ language: "en", existingInstall: false, userDataExists: false, installPath: "/opt/MyMoney", userDataPath: "/data" });
    assert.deepEqual(
      plan.steps.map((step) => step.action),
      ["install", "register-app-icon", "register-file-icon"],
    );
    const vfs = applyPlan({ install: {}, data: { "/data": { settings: true } }, registry: {} }, plan);
    assert.equal(vfs.install["/opt/MyMoney"].appIcon, "assets/icon.png");
    assert.equal(vfs.registry.fileIcon, "assets/file.ico");
    assert.equal(vfs.registry.fileExt, "mymoney");
    assert.ok(vfs.data["/data"]);
  });
  h.test("an existing install is removed and saved data is deleted only when asked", () => {
    const keep = planInstall({
      language: "ko",
      existingInstall: true,
      userDataExists: true,
      deleteData: false,
      installPath: "/opt/MyMoney",
      userDataPath: "/data",
      shortcuts: ["/desktop/MyMoney.lnk"],
    });
    const kept = applyPlan(
      {
        install: { "/opt/MyMoney": { old: true } },
        data: { "/data": { settings: true } },
        registry: {},
        links: { "/desktop/MyMoney.lnk": true },
        shortcuts: { desktop: "old" },
      },
      keep,
    );
    assert.equal(kept.log.includes("uninstall-existing"), true);
    assert.equal(kept.log.includes("delete-user-data"), false);
    assert.ok(kept.data["/data"]);
    assert.equal(kept.install["/opt/MyMoney"].language, "ko");
    assert.equal(kept.links["/desktop/MyMoney.lnk"], undefined);
    assert.deepEqual(kept.shortcuts, {});
    const remove = planInstall({
      language: "en",
      existingInstall: true,
      userDataExists: true,
      deleteData: true,
      installPath: "/opt/MyMoney",
      userDataPath: "/data",
    });
    const removed = applyPlan({ install: { "/opt/MyMoney": { old: true } }, data: { "/data": { settings: true } }, registry: {} }, remove);
    assert.equal(removed.data["/data"], undefined);
    assert.throws(() => planInstall({ language: "", existingInstall: false }), /language/);
  });
  h.test("the installer asks in the selected language before deleting data", async () => {
    const prompts = [];
    const steps = [];
    const plan = await runInstaller(
      {
        async chooseLanguage() {
          return "ko";
        },
        async confirm(message) {
          prompts.push(message);
          return true;
        },
        async notify(message) {
          prompts.push(message);
        },
      },
      {
        async detectExisting() {
          return { installed: true, userDataExists: true, installPath: "/opt/MyMoney", userDataPath: "/data" };
        },
        async exec(step) {
          steps.push(step.action);
        },
      },
    );
    assert.equal(plan.language, "ko");
    assert.ok(prompts.some((message) => message.includes("삭제하시겠습니까")));
    assert.ok(prompts.some((message) => message.includes("바탕화면 바로가기")));
    assert.ok(prompts.some((message) => message.includes("시작 메뉴")));
    assert.ok(steps.includes("delete-user-data"));
    assert.ok(steps.includes("uninstall-existing"));
    assert.ok(steps.includes("shortcut-desktop"));
    assert.ok(steps.includes("shortcut-start-menu"));
    assert.equal(plan.steps.find((step) => step.action === "shortcut-desktop").icon, "assets/icon.png");
    assert.ok(steps.includes("register-app-icon"));
    assert.ok(steps.includes("register-file-icon"));
    const declined = [];
    await runInstaller(
      {
        async chooseLanguage() {
          return "en";
        },
        async confirm() {
          return false;
        },
        async notify() {},
      },
      {
        async detectExisting() {
          return { installed: true, userDataExists: true, installPath: "/opt/MyMoney", userDataPath: "/data", programIcon: "assets/icon.ico", platform: "win32" };
        },
        async exec(step) {
          declined.push(step.action);
        },
      },
    );
    assert.equal(declined.includes("delete-user-data"), false);
    assert.equal(declined.includes("shortcut-desktop"), false);
    assert.equal(declined.includes("shortcut-start-menu"), false);
    assert.equal(declined.includes("uninstall-existing"), true);
  });
  h.test("packaged installers use one icon and offer korean and english", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pkg.build.win.icon, "assets/icon.ico");
    assert.equal(pkg.build.nsis.installerIcon, pkg.build.win.icon);
    assert.equal(pkg.build.nsis.uninstallerIcon, pkg.build.win.icon);
    assert.equal(pkg.build.nsis.installerHeaderIcon, pkg.build.win.icon);
    assert.equal(pkg.build.mac.icon, "assets/icon.icns");
    assert.equal(pkg.build.linux.icon, "assets/icon.png");
    assert.equal(pkg.build.fileAssociations[0].icon, "assets/file.ico");
    assert.equal(pkg.build.fileAssociations[0].ext, "mymoney");
    assert.ok(pkg.build.nsis.installerLanguages.includes("ko_KR"));
    assert.ok(pkg.build.nsis.installerLanguages.includes("en_US"));
    assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
    assert.equal(pkg.build.nsis.createDesktopShortcut, false);
    assert.equal(pkg.build.nsis.createStartMenuShortcut, false);
    assert.equal(pkg.build.extraResources[0].from, "assets/icon.ico");
    assert.equal(pkg.build.extraResources[0].to, "icon.ico");
    assert.equal(programIconFile("win32"), pkg.build.win.icon);
    assert.equal(trayIconFile("win32"), "assets/icon.ico");
    assert.equal(programIconFor("darwin"), "assets/icon.icns");
    assert.equal(programIconFor("linux"), "assets/icon.png");
    const nsis = fs.readFileSync(path.join(root, "installer/windows/installer.nsh"), "utf8");
    assert.match(nsis, /Saved data from the previous installation/);
    assert.match(nsis, /이전에 설치한 프로그램의 저장 데이터가 있습니다/);
    assert.match(nsis, /완전히 삭제/);
    assert.match(nsis, /file\.ico/);
    assert.match(nsis, /바탕화면 바로가기/);
    assert.match(nsis, /시작 메뉴 바로가기/);
    assert.match(nsis, /resources\\icon\.ico/);
    assert.match(nsis, /CreateShortCut/);
    assert.match(nsis, /RMDir \/r "\$INSTDIR"/);
    const linux = fs.readFileSync(path.join(root, "installer/linux/install.sh"), "utf8");
    const mac = fs.readFileSync(path.join(root, "installer/macos/install.sh"), "utf8");
    assert.match(linux, /cli\.js/);
    assert.match(mac, /cli\.js/);
    const desktop = fs.readFileSync(path.join(root, "installer/linux/mymoney.desktop"), "utf8");
    assert.match(desktop, /application\/x-mymoney/);
    const mime = fs.readFileSync(path.join(root, "installer/linux/mymoney-mime.xml"), "utf8");
    assert.match(mime, /\*\.mymoney/);
    const main = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
    assert.match(main, /assets\/icon\.png/);
    assert.match(main, /frame: false/);
    assert.match(main, /saveWindowPlacement/);
    assert.match(main, /window-bounds/);
    assert.match(main, /window\.json/);
    assert.match(main, /thickFrame: false/);
    assert.match(main, /skipTaskbar: true/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, "src/styles.css"), "utf8"), /app-region/);
    assert.match(main, /new Tray/);
    assert.match(main, /placeTrayMenu/);
    assert.match(main, /fit-tray-menu/);
    assert.match(main, /trayCommand/);
    assert.match(main, /revealMainWindowFromTray/);
    assert.doesNotMatch(main, /popUpContextMenu/);
    const koMenu = buildTrayMenu((key) => createI18n("ko").t(key));
    const enMenu = buildTrayMenu((key) => createI18n("en").t(key));
    const koItems = listTrayItems(koMenu);
    assert.ok(koItems.length >= 12);
    for (const item of koItems) {
      assert.ok(item.icon, item.label);
      assert.ok(item.label);
      assert.ok(fs.existsSync(path.join(root, menuIconFile(item.icon))), item.icon);
    }
    assert.equal(koMenu[0].id, "show-window");
    assert.equal(koMenu[0].label, "창 표시");
    assert.equal(enMenu[0].label, "Show window");
    assert.equal(koItems.find((item) => item.id === "market").label, "시장");
    assert.equal(enMenu.find((item) => item.id === "file").label, "File");
    assert.ok(fs.existsSync(path.join(root, "README.md")));
    assert.ok(fs.existsSync(path.join(root, "ARCHITECTURE.md")));
    assert.ok(fs.existsSync(path.join(root, "UsersGuide.md")));
    const guide = fs.readFileSync(path.join(root, "UsersGuide.md"), "utf8");
    assert.match(guide, /바탕화면/);
    assert.match(guide, /시작 메뉴/);
    assert.match(guide, /트레이/);
    assert.match(main, /transparent: true/);
    assert.match(main, /WINDOW_MIN/);
    assert.match(main, /window-resize/);
    assert.match(main, /window-move/);
    assert.match(main, /savedWindowPlacement/);
    assert.match(main, /placeWindow/);
    assert.match(main, /function revealWindow/);
    assert.match(main, /revealWindow\(win\)/);
    assert.match(main, /uncaughtException/);
    assert.match(main, /render-process-gone/);
    assert.match(main, /clipboard\.writeText\(text\)/);
    assert.match(main, /const contentsId = win\.webContents\.id/);
    assert.match(main, /contentsToPopup\.delete\(contentsId\)/);
    assert.doesNotMatch(main, /set-opacity/);
    const page = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
    assert.match(page, /MyMoney V1\.0/);
    assert.match(page, /assets\/icon\.png/);
  });

  h.category("Icons");
  h.test("app and document icons are transparent, distinct, and the app tile is a lit 3D background", () => {
    const output = execFileSync("python", ["scripts/verify_icons.py"], { cwd: root, encoding: "utf8" });
    assert.match(output, /OK transparent_border app/);
    assert.match(output, /OK beveled_background app/);
    assert.match(output, /OK transparent_border file/);
    assert.match(output, /OK top_left_glow file/);
    assert.match(output, /OK icons_differ/);
    assert.match(output, /OK packaged_formats/);
    for (const name of ["icon.png", "icon.ico", "icon.icns", "file.png", "file.ico", "file.icns"]) {
      assert.ok(fs.statSync(path.join(root, "assets", name)).size > 100, name);
    }
  });
}

function tab(marketKo, marketEn, symbol, dates) {
  return {
    board: {
      marketKo,
      marketEn,
      countryKo: "대한민국",
      countryEn: "South Korea",
      currency: "KRW",
      symbols: [{ symbol, nameKo: symbol, nameEn: symbol, marketCode: "KR" }],
    },
    properties: { label: "" },
    data: {
      quotes: [
        {
          symbol,
          currency: "KRW",
          last: 100,
          change: 2,
          changePercent: 2,
          days: dates.map((date) => ({ date, open: 98, high: 102, low: 97, close: 100 })),
        },
      ],
      rates: { base: "KRW", rows: [{ code: "USD", rate: 0.00075 }] },
      news: [{ title: "헤드라인", outlet: "Example", published: "2026-10-07T00:00:00.000Z", link: "https://a.example" }],
    },
  };
}
