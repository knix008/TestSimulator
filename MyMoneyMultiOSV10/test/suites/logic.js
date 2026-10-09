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
import { fontFace, fontStyleOf, parseFcList, parseWindowsFonts, resolveFontList } from "../../src/core/fonts.js";
import { DICT, createI18n, dictionaryKeys } from "../../src/core/i18n.js";
import { dirname, userDataDir } from "../../src/core/paths.js";
import { MARGINS, PAPERS, PRINT_SECTIONS, SCALES, buildPrintModel, normalizeSections, normalizeSetup, paperSize } from "../../src/core/print-model.js";
import { RecentFiles } from "../../src/core/recent.js";
import { MAX_RATE_CURRENCIES, MAX_SYMBOLS, WINDOW_FIELDS, normalizeRateCurrencies, sanitizeSettings, sanitizeWindowSlots, sharedSettings, windowLabel } from "../../src/core/settings.js";
import { UndoStack } from "../../src/core/undo.js";
import { PopupHub } from "../../electron/popup-hub.js";
import { applyPlan, planInstall, programIconFor, runInstaller } from "../../installer/plan.js";
import { buildTrayMenu, listTrayItems, menuIconFile, placeTrayMenu, programIconFile, trayIconFile } from "../../src/ui/tray-menu.js";
import { layoutMenu, menuWindowOptions, placeBeside, popupKey, popupWindowOptions } from "../../src/ui/menu-layout.js";
import { icon, knownIcons } from "../../src/ui/icons.js";
import { buildTrayColumn } from "../../src/ui/menus.js";
import { layoutTabScroller } from "../../src/ui/tab-scroller.js";
import { BOARD_HEAD, BOARD_MAX_HEIGHT, BOARD_MIN_WIDTH, BOARD_ROW, CONTENT_PADDING, SCENE_ART, SCENE_GAP, SCENE_MAX_SCALE, SCENE_MIN_SCALE, SCENE_NATURAL, SCENE_TEXT, TITLE_LABEL_WIDTH, WINDOW_DEFAULT, WINDOW_MIN, boardWindowSize, isUsableSize, showsTitleText, titleTextMinWidth, roomyMinWidth, isCompactWidth, clampWindowSize, placeWindow, recordedWindowPlacement, sceneFit, sceneScale, stampWindowPlacement, toolbarMinWidth } from "../../src/ui/window-spec.js";
import { CUSTOM_THEME_ID, DARK_THEMES, LIGHT_THEMES, MIN_ALPHA, THEMES, backgroundAlpha, isHexColor, isTheme, themeColors, themeVars } from "../../src/core/themes.js";
import { LIST_GAP, LIST_ROW, SETTINGS_MAX_WIDTH, SETTINGS_MIN_WIDTH, listBlockHeight, settingsWidth, tabLabelWidth } from "../../src/ui/popups.js";
import { aggregateQuote, aggregateRates, mergeNews, newsKey, presentBoard } from "../../src/market/aggregate.js";
import { formatAsOf, formatMoney, formatPercent, formatPrice, formatRate, formatSigned, formatVolume, quotePair } from "../../src/market/format.js";
import { CURRENCIES, LISTINGS, MARKETS, currencyName, filterListings, findMarket, listingName, marketOfSymbol } from "../../src/market/markets.js";
import {
  SOURCE_IDS,
  erApiUrl,
  frankfurterUrl,
  googleNewsUrl,
  parseErApi,
  parseFrankfurter,
  newsWireUrl,
  parseNewsFeed,
  parseSymbolSearch,
  safeImageUrl,
  parseYahooChart,
  sourcePageUrl,
  yahooChartUrl,
  yahooSearchUrl,
} from "../../src/market/providers.js";
import { loadBoard, newsQuery } from "../../src/market/service.js";
import { trendOf, trendText } from "../../src/market/trend.js";
import { boardRowCount, rateBetween, shownRateRows } from "../../src/ui/market-view.js";
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
    // A stored size is kept as given; the window's own minimum is applied on use.
    assert.deepEqual(settings.windowSize, { width: 50, height: 9000 });
    assert.deepEqual(clampWindowSize(settings.windowSize), { width: WINDOW_MIN.width, height: 9000 });
    assert.equal(sanitizeSettings({ windowSize: { width: "wide", height: 400 } }).windowSize, null);
    assert.equal(sanitizeSettings({ windowSize: { width: 0, height: 0 } }).windowSize, null);
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
    assert.equal(settings.updateMinutes, 10);
    assert.equal(sanitizeSettings({ updateMinutes: 5 }).updateMinutes, 5);
    // An interval between the offered steps snaps to the nearest one.
    assert.equal(sanitizeSettings({ updateMinutes: 7 }).updateMinutes, 5);
    assert.equal(sanitizeSettings({ updateMinutes: 0 }).updateMinutes, 10);
    // Settings saved when the interval was in hours still work.
    assert.equal(sanitizeSettings({ updateHours: 12 }).updateMinutes, 720);
    assert.equal(sanitizeSettings({ updateHours: 1 }).updateMinutes, 60);
    assert.equal("updateHours" in sanitizeSettings({ updateHours: 2 }), false);
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
  h.test("one story carried by two feeds becomes one row that keeps the picture", () => {
    // The search feed spells it "Headline - Outlet"; the wire spells it plain.
    assert.equal(newsKey("뉴욕증시 하락 출발 - 연합뉴스"), newsKey("뉴욕증시 하락 출발"));
    assert.equal(newsKey("Boots sold in £7bn deal - BBC News"), newsKey("Boots sold in £7bn deal"));
    assert.notEqual(newsKey("삼성전자 신고가"), newsKey("코스피 상승"));
    assert.equal(newsKey(""), "");
    const merged = mergeNews([
      {
        id: "gnews",
        ok: true,
        data: { rows: [{ title: "뉴욕증시 하락 출발 - 연합뉴스", published: "2026-10-07T22:58:00Z", image: "", outlet: "연합뉴스", link: "a" }] },
      },
      {
        id: "wires",
        ok: true,
        data: { rows: [{ title: "뉴욕증시 하락 출발", published: "2026-10-07T22:58:00Z", image: "https://img.example/x.jpg", outlet: "yna", link: "b" }] },
      },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].title, "뉴욕증시 하락 출발 - 연합뉴스");
    assert.equal(merged[0].image, "https://img.example/x.jpg");
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
        if (href.includes("yna.co.kr") || href.includes("bbci.co.uk")) return textResponse(newsBody(["사진 기사"], { images: true }));
        return textResponse(newsBody());
      },
    });
    assert.equal(data.quotes.length, 1);
    assert.equal(data.quotes[0].last, 100);
    assert.equal(data.index.symbol, "^KS11");
    assert.ok(data.rates.rows.length >= 2);
    assert.equal(data.news.length, 3);
    assert.equal(data.news.filter((row) => row.image).length, 1);
    assert.equal(seen.at(-1)[0], 100);
    assert.equal(data.sources.find((source) => source.id === "yahoo").ok, true);
    assert.equal(data.sources.find((source) => source.id === "yahoo2").ok, false);
    assert.equal(data.sources.find((source) => source.id === "gnews").ok, true);
    assert.equal(data.sources.find((source) => source.id === "wires").ok, true);
    assert.deepEqual(data.sources.map((source) => source.id).sort(), [...SOURCE_IDS].sort());
  });
  h.test("a board whose every quote source fails is an error", async () => {
    const board = { marketCode: "KR", baseCurrency: "KRW", index: "", symbols: [{ symbol: "005930.KS" }] };
    await assert.rejects(
      loadBoard(board, { sources: ["yahoo", "yahoo2"], fetchImpl: async () => jsonResponse({}, false, 500) }),
      /All quote sources failed/,
    );
    await assert.rejects(
      loadBoard(board, { sources: ["gnews", "wires"], fetchImpl: async () => textResponse(newsBody()) }),
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

  h.test("the window mode, the rotation interval, and the currency list are checked", () => {
    assert.equal(sanitizeSettings(null).sceneMode, "single");
    assert.equal(sanitizeSettings(null).rotateSeconds, 0);
    assert.equal(sanitizeSettings({ sceneMode: "all" }).sceneMode, "all");
    assert.equal(sanitizeSettings({ sceneMode: "grid" }).sceneMode, "single");
    assert.equal(sanitizeSettings({ rotateSeconds: 10 }).rotateSeconds, 10);
    assert.equal(sanitizeSettings({ rotateSeconds: 7 }).rotateSeconds, 0);
    assert.equal(sanitizeSettings({ rotateSeconds: "30" }).rotateSeconds, 30);
    assert.deepEqual(sanitizeSettings(null).rateCurrencies, ["USD", "JPY", "EUR", "CNY"]);
    // A list drops the unknown, the repeats, and the base itself, and stops at the ceiling.
    const trimmed = sanitizeSettings({
      baseCurrency: "USD",
      rateCurrencies: ["usd", "jpy", "JPY", "NOPE", ...CURRENCIES],
    }).rateCurrencies;
    assert.equal(trimmed.includes("USD"), false);
    assert.equal(trimmed.filter((code) => code === "JPY").length, 1);
    assert.equal(trimmed.includes("NOPE"), false);
    assert.equal(trimmed.length, MAX_RATE_CURRENCIES);
    assert.deepEqual(normalizeRateCurrencies(["EUR", "EUR", "KRW"], "KRW"), ["EUR"]);
  });
  h.test("the currency catalog covers many countries and every code is named", () => {
    assert.ok(CURRENCIES.length >= 30);
    assert.equal(new Set(CURRENCIES).size, CURRENCIES.length);
    for (const code of CURRENCIES) {
      assert.match(code, /^[A-Z]{3}$/);
      assert.ok(currencyName(code, "ko"), code);
      assert.ok(currencyName(code, "en"), code);
      assert.notEqual(currencyName(code, "ko"), code);
    }
    for (const code of ["USD", "KRW", "EUR", "JPY", "CNY", "GBP", "THB", "VND", "MXN", "ZAR"]) {
      assert.ok(CURRENCIES.includes(code), code);
    }
  });
  h.test("only the chosen currencies are listed, in the order they were added", () => {
    const rates = {
      base: "KRW",
      rows: [{ code: "USD", rate: 1 }, { code: "EUR", rate: 2 }, { code: "JPY", rate: 3 }],
    };
    assert.deepEqual(shownRateRows(rates, ["JPY", "USD"]).rows.map((row) => row.code), ["JPY", "USD"]);
    // A currency fetched only so a price could be converted is not listed.
    assert.deepEqual(shownRateRows(rates, ["EUR"]).rows.map((row) => row.code), ["EUR"]);
    assert.equal(shownRateRows(rates, ["GBP"]).rows.length, 0);
    assert.equal(shownRateRows(rates, []).rows.length, 3);
    assert.equal(shownRateRows(null, ["USD"]).rows.length, 0);
  });
  h.test("a whole-watchlist window is exactly as tall as its rows", () => {
    const four = boardWindowSize(4, 760);
    assert.equal(four.width, 760);
    assert.equal(four.height, 46 + BOARD_HEAD + 4 * BOARD_ROW + CONTENT_PADDING.top + CONTENT_PADDING.bottom);
    // One more symbol is one more row of window.
    assert.equal(boardWindowSize(5, 760).height - four.height, BOARD_ROW);
    // Five columns of numbers need width even if the window was narrow.
    assert.equal(boardWindowSize(4, 400).width, BOARD_MIN_WIDTH);
    assert.equal(boardWindowSize(3, 900).width, 900);
    assert.ok(boardWindowSize(99, 760).height <= BOARD_MAX_HEIGHT);
    assert.ok(boardWindowSize(0, 760).height >= WINDOW_MIN.height);
  });
  h.test("the board row count falls back to the watchlist before any data arrives", () => {
    const board = { symbols: [{ symbol: "A" }, { symbol: "B" }] };
    assert.equal(boardRowCount({ board }), 3);
    assert.equal(boardRowCount({ board, data: { quotes: [{}, {}], index: {} } }), 3);
    assert.equal(boardRowCount({ board, data: { quotes: [{}, {}], index: null } }), 2);
    assert.equal(boardRowCount({}), 1);
  });
  h.test("a feed picture is taken only from an image tag with a web address", () => {
    const item = (inner) => `<rss><channel><item><title>T</title><link>https://a.example/1</link>${inner}</item></channel></rss>`;
    assert.equal(parseNewsFeed(item('<media:content url="https://img.example/a.jpg"/>')).rows[0].image, "https://img.example/a.jpg");
    assert.equal(parseNewsFeed(item('<media:thumbnail width="240" url="https://img.example/b.png"/>')).rows[0].image, "https://img.example/b.png");
    assert.equal(parseNewsFeed(item('<enclosure url="https://img.example/c.webp" type="image/webp"/>')).rows[0].image, "https://img.example/c.webp");
    assert.equal(parseNewsFeed(item("<description>&lt;img src=\"https://img.example/d.gif\"&gt;</description>")).rows[0].image, "https://img.example/d.gif");
    // A video, a script URL, and a feed with no picture at all.
    assert.equal(parseNewsFeed(item('<media:content url="https://v.example/clip.mp4" type="video/mp4"/>')).rows[0].image, "");
    assert.equal(parseNewsFeed(item('<media:content url="javascript:alert(1)"/>')).rows[0].image, "");
    assert.equal(parseNewsFeed(item('<media:content url="data:image/png;base64,AAA"/>')).rows[0].image, "");
    assert.equal(parseNewsFeed(item("")).rows[0].image, "");
    assert.equal(safeImageUrl("https://ok.example/a.jpg"), "https://ok.example/a.jpg");
    assert.equal(safeImageUrl("ftp://no.example/a.jpg"), "");
    assert.equal(safeImageUrl(`https://long.example/${"a".repeat(700)}`), "");
    assert.equal(parseNewsFeed(item('<media:content url="https://img.example/a.jpg"/>'), "wires").rows[0].source, "wires");
  });
  h.test("the wire feed follows the reader's language", () => {
    assert.match(newsWireUrl("ko"), /yna\.co\.kr/);
    assert.match(newsWireUrl("en"), /bbci\.co\.uk/);
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
  h.test("a page per board and section, with the paper, margins, text size and page number chosen", () => {
    const tabs = [tab("한국거래소", "Korea Exchange", "005930.KS", SAMPLE_DATES), tab("미국 증시", "US Markets", "AAPL", SAMPLE_DATES)];
    const all = buildPrintModel({ scope: "all", tabs, activeIndex: 0, pageSetup: {}, language: "en" });
    assert.equal(all.pages.length, 6);
    assert.deepEqual(all.pages.map((page) => page.range), ["stocks", "rates", "news", "stocks", "rates", "news"]);
    assert.equal(all.pages[0].city, "Korea Exchange");
    assert.equal(all.pages[1].rangeLabel, "Exchange rates");
    assert.match(all.html, /class="print-doc"/);
    assert.equal((all.html.match(/<section class="sheet">/g) || []).length, 6);
    // A printed page is a plain report: no pager, no drag grips, no clickable rows.
    assert.doesNotMatch(all.html, /pager|row-grip|data-gui=/);
    const some = buildPrintModel({ scope: "current", tabs, activeIndex: 0, pageSetup: {}, language: "ko", sections: ["news"] });
    assert.deepEqual(some.pages.map((page) => page.range), ["news"]);
    assert.deepEqual(normalizeSections([]), PRINT_SECTIONS, "asking for none prints everything");
    const empty = buildPrintModel({ scope: "all", tabs: [], activeIndex: 0, pageSetup: {}, language: "ko" });
    assert.match(empty.html, /인쇄할 내용이 없습니다/);
    assert.deepEqual(normalizeSetup({}), { paper: "A4", orientation: "portrait", margin: 15, scale: 100, header: true, pageNumber: true, pageNumberAt: "right" });
    assert.deepEqual(normalizeSetup({ paper: "B9", margin: 13, scale: 300, pageNumberAt: "top" }), normalizeSetup({}));
    assert.deepEqual(paperSize({ paper: "A4" }), { width: 210, height: 297 });
    assert.deepEqual(paperSize({ paper: "Legal", orientation: "landscape" }), { width: 356, height: 216 });
    assert.deepEqual(PAPERS, ["A4", "A3", "A5", "Letter", "Legal", "B5"]);
    assert.ok(MARGINS.includes(25) && SCALES.includes(125));
    const setup = { paper: "Legal", orientation: "landscape", margin: 25, scale: 125, header: false, pageNumber: true, pageNumberAt: "center" };
    const styled = buildPrintModel({ scope: "current", tabs, activeIndex: 0, pageSetup: setup, language: "en" });
    assert.match(styled.html, /size: Legal landscape/);
    assert.match(styled.html, /margin: 25mm/);
    assert.match(styled.html, /font-size: 16.25px/);
    assert.match(styled.html, /class="sheet-foot" data-at="center"/);
    assert.doesNotMatch(styled.html, /class="sheet-head"/);
    // Many quotes run onto more than one page instead of being cut off.
    const crowded = tab("한국거래소", "Korea Exchange", "005930.KS", SAMPLE_DATES);
    crowded.data.quotes = Array.from({ length: 60 }, (_, index) => ({ ...crowded.data.quotes[0], symbol: `S${index}` }));
    const long = buildPrintModel({ scope: "current", tabs: [crowded], activeIndex: 0, pageSetup: {}, language: "en", sections: ["stocks"] });
    assert.ok(long.pages.length >= 2, `${long.pages.length} pages`);
  });

  h.category("Windows");
  h.test("each window keeps its own board; the rest of the settings are shared", () => {
    const board = { ...sanitizeSettings({}).defaultBoard, marketCode: "US" };
    const slots = sanitizeWindowSlots([
      { id: "w1", board, bounds: { x: 10, y: 20, width: 500, height: 400 } },
      { id: "w1", board },
      { id: "../evil", board },
      { id: "w2" },
      null,
    ]);
    assert.deepEqual(slots.map((slot) => slot.id), ["w1", "w2"]);
    assert.equal(slots[0].board.marketCode, "US");
    assert.deepEqual(slots[0].bounds, { x: 10, y: 20, width: 500, height: 400 });
    assert.equal(slots[1].bounds, null);
    assert.equal(slots[1].board.marketCode, "KR", "a slot without a board starts on the starter board");
    const shared = sharedSettings({ language: "en", theme: "dark-ink", defaultBoard: board, windowSize: { width: 1, height: 1 }, windows: slots });
    assert.deepEqual(Object.keys(shared).sort(), ["language", "theme"]);
    for (const field of WINDOW_FIELDS) assert.equal(field in shared, false, field);
    assert.match(windowLabel(sanitizeSettings({}).defaultBoard, "ko", 0), /^1\. 한국거래소 · 삼성전자, SK하이닉스 외 1$/);
    assert.match(windowLabel(board, "en", 1), /^2\. /);
  });
  h.test("the font style is four switches, read from the older single choice when missing", () => {
    const old = sanitizeSettings({ fontStyle: "bolditalic" });
    assert.equal(old.fontBold, true);
    assert.equal(old.fontItalic, true);
    assert.equal(old.fontUnderline, false);
    assert.equal(old.fontStrike, false);
    const fresh = sanitizeSettings({ fontBold: false, fontItalic: true, fontUnderline: true, fontStrike: true, fontStyle: "bold" });
    assert.equal(fresh.fontBold, false, "the switches win over the old choice");
    assert.equal(fresh.fontStyle, "italic");
    assert.equal(fontStyleOf(true, false), "bold");
    const face = fontFace({ fontFamily: "Arial", fontSize: 18, fontBold: true, fontUnderline: true, fontStrike: true });
    assert.deepEqual(face, { family: '"Arial", sans-serif', size: "18px", bold: true, italic: false, decoration: "underline line-through" });
    assert.equal(fontFace({}).decoration, "none");
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
    // The floor is whatever the title bar buttons need, not a round number.
    assert.equal(WINDOW_MIN.width, toolbarMinWidth());
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
  h.test("a window shrunk to its minimum is still remembered", () => {
    // The floor for "worth saving" is the window's own minimum, not a round number.
    assert.equal(isUsableSize({ width: WINDOW_MIN.width, height: WINDOW_MIN.height }), true);
    assert.equal(isUsableSize({ width: WINDOW_MIN.width - 1, height: WINDOW_MIN.height }), false);
    assert.equal(isUsableSize({ width: WINDOW_MIN.width, height: WINDOW_MIN.height - 1 }), false);
    assert.equal(isUsableSize(null), false);
    const tiny = { x: 12, y: 34, width: WINDOW_MIN.width, height: WINDOW_MIN.height, maximized: false };
    const stamped = stampWindowPlacement({}, tiny);
    assert.deepEqual(stamped.windowSize, { width: WINDOW_MIN.width, height: WINDOW_MIN.height });
    assert.deepEqual(stamped.windowPosition, { x: 12, y: 34 });
    const recorded = recordedWindowPlacement({ windowSize: { width: 900, height: 700 } }, tiny);
    assert.equal(recorded.width, WINDOW_MIN.width);
    assert.equal(recorded.height, WINDOW_MIN.height);
    // And it reopens at exactly that size and place.
    assert.deepEqual(placeWindow({ x: 12, y: 34, width: WINDOW_MIN.width, height: WINDOW_MIN.height }, [{ x: 0, y: 0, width: 1920, height: 1080 }]), {
      x: 12,
      y: 34,
      width: WINDOW_MIN.width,
      height: WINDOW_MIN.height,
    });
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
      // A colourful icon may carry its colour as a fill or as a stroke.
      assert.match(svg.innerHTML, /(?:fill|stroke)="#[0-9a-f]{6}"/i, name);
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

  h.test("a list block is only as tall as its rows", () => {
    // Two columns, so four entries are two rows.
    assert.equal(listBlockHeight(0, 300), LIST_ROW);
    assert.equal(listBlockHeight(1, 300), LIST_ROW);
    assert.equal(listBlockHeight(4, 300), 2 * LIST_ROW + LIST_GAP);
    assert.equal(listBlockHeight(20, 300), Math.min(300, 10 * LIST_ROW + 9 * LIST_GAP));
    assert.ok(listBlockHeight(200, 300) <= 300);
  });
  h.test("the settings window is wide enough for every tab in either language", () => {
    const ko = ["일반", "관심 종목", "환율 목록", "정보 출처", "모양", "바탕 그림", "글꼴", "최근 파일"];
    const en = ["General", "Watchlist", "Currencies", "Sources", "Appearance", "Wallpaper", "Font", "Recent files"];
    // A wide letter costs more room than a latin one, so English needs more width here.
    assert.ok(tabLabelWidth("관심 종목") > tabLabelWidth("Font"));
    assert.ok(settingsWidth(en) > settingsWidth(ko));
    for (const labels of [ko, en]) {
      const width = settingsWidth(labels);
      assert.ok(width >= SETTINGS_MIN_WIDTH, `${width} >= ${SETTINGS_MIN_WIDTH}`);
      assert.ok(width <= SETTINGS_MAX_WIDTH, `${width} <= ${SETTINGS_MAX_WIDTH}`);
      // Room for all eight, measured the same way the strip lays them out.
      const needed = labels.reduce((sum, label) => sum + 45 + tabLabelWidth(label), 0) + 7 * 4 + 24;
      assert.ok(width >= needed, `${width} >= ${needed}`);
    }
    assert.equal(settingsWidth([]), SETTINGS_MIN_WIDTH);
    assert.equal(settingsWidth(["x".repeat(400)]), SETTINGS_MAX_WIDTH);
  });
  h.test("the program name yields the title bar when the window is narrow", () => {
    assert.equal(WINDOW_MIN.width, toolbarMinWidth());
    // Three steps down: the name goes first, then the icon and the roomy
    // spacing, and the buttons alone decide how narrow the window may get.
    assert.ok(toolbarMinWidth() < roomyMinWidth());
    assert.ok(roomyMinWidth() < titleTextMinWidth());
    assert.equal(titleTextMinWidth(), roomyMinWidth() + TITLE_LABEL_WIDTH);
    assert.equal(isCompactWidth(roomyMinWidth()), false);
    assert.equal(isCompactWidth(roomyMinWidth() - 1), true);
    assert.equal(isCompactWidth(toolbarMinWidth()), true);
    assert.equal(showsTitleText(titleTextMinWidth()), true);
    assert.equal(showsTitleText(titleTextMinWidth() - 1), false);
    assert.equal(showsTitleText(WINDOW_DEFAULT.width), true);
    assert.equal(showsTitleText(0), false);
  });

  h.test("the shortest window is the toolbar plus a readable quote, nothing more", () => {
    // Above and below the quote view there is only the content padding, so the
    // height is the toolbar, that padding, and the smallest the scene may be.
    const scene = Math.ceil(SCENE_NATURAL.height * SCENE_MIN_SCALE);
    assert.equal(WINDOW_MIN.height, 46 + CONTENT_PADDING.top + CONTENT_PADDING.bottom + scene);
    assert.equal(CONTENT_PADDING.top + CONTENT_PADDING.bottom, 4, "the bands are already as thin as they go");
    // It really is shorter than it used to be, and the scene is still sizeable.
    assert.ok(WINDOW_MIN.height < 187, `${WINDOW_MIN.height} is shorter than the old 187`);
    assert.ok(scene >= 90, `a ${scene}px scene is still readable`);
    // The scene shrinks to exactly that floor and no further.
    assert.equal(sceneScale({ width: 10, height: 10 }), SCENE_MIN_SCALE);
  });

  h.test("the narrowest window is exactly what the title bar buttons need", () => {
    // Sizes come from styles.css: .tool-btn and .icon-btn are 32px, .win-btn
    // is 30px, the separator is 1px, and the shell adds a 1px border a side.
    const tools = 3 * 32 + 2 * 4;
    const corner = (grid, gap) => 2 * 32 + 3 * 30 + 1 + 2 * grid + 5 * gap;
    // Compact: 6px padding a side, 4px between the groups, 2px separator margins.
    // The app icon is always there, so it counts at both spacings.
    const compact = 12 + (18 + 4) + tools + 4 + corner(2, 2) + 2;
    // Roomy: 12px/8px padding, 6px gaps, 4px separator margins, plus the icon.
    const roomy = 20 + (18 + 6) + tools + 6 + corner(4, 2) + 2;
    assert.equal(toolbarMinWidth(), compact);
    assert.equal(roomyMinWidth(), roomy);
    assert.equal(WINDOW_MIN.width, compact);
    // It really is narrower than it used to be, and still fits every button.
    assert.ok(toolbarMinWidth() < 341, `${toolbarMinWidth()} is narrower than the old 341`);
    assert.ok(toolbarMinWidth() >= tools + corner(2, 2), "the buttons still fit");
  });

  h.test("a menu is wide enough for Korean labels and their shortcuts", () => {
    // Korean glyphs are about twice as wide as Latin ones. Counting characters
    // alone made the window too narrow and pushed the shortcut off its edge.
    const items = [
      { label: "다른 이름으로 저장", shortcut: "Ctrl+Shift+S" },
      { label: "실행 취소", shortcut: "Ctrl+Z" },
    ];
    const wide = layoutMenu(items, { x: 0, y: 0 });
    const latin = layoutMenu([{ label: "Save as", shortcut: "Ctrl+Shift+S" }], { x: 0, y: 0 });
    assert.ok(wide.width > latin.width, `${wide.width} > ${latin.width}`);
    assert.ok(wide.width >= 288, `${wide.width} fits the longest Korean row`);
    // A longer label always asks for a wider window, never the same one.
    const longer = layoutMenu([{ label: "다른 이름으로 저장하기", shortcut: "Ctrl+Shift+S" }], { x: 0, y: 0 });
    assert.ok(longer.width > wide.width, `${longer.width} > ${wide.width}`);
    // A shortcut costs room of its own.
    const bare = layoutMenu([{ label: "다른 이름으로 저장" }], { x: 0, y: 0 });
    assert.ok(wide.width > bare.width, `${wide.width} > ${bare.width}`);
  });

  h.test("the quote note says when the figures were last pulled", () => {
    // Same trading day: the clock alone is enough.
    assert.equal(formatAsOf(new Date(2026, 9, 8, 16, 7).toISOString(), "2026-10-08"), "16:07");
    assert.equal(formatAsOf(new Date(2026, 9, 8, 9, 5).toISOString(), "2026-10-08"), "09:05");
    // A window left open past midnight must not read as today.
    assert.equal(formatAsOf(new Date(2026, 9, 9, 9, 2).toISOString(), "2026-10-08"), "10/9 09:02");
    // Nothing to show rather than a broken string.
    assert.equal(formatAsOf("", "2026-10-08"), "");
    assert.equal(formatAsOf("nonsense", "2026-10-08"), "");
    assert.equal(formatAsOf(null, null), "");
  });

  h.test("a search matches every word, in either language, and by code", () => {
    const all = LISTINGS;
    const names = (query) => filterListings(all, "", query).map((entry) => entry.nameKo);
    // Spaces are ignored on both sides, so a spaced query finds a joined name.
    assert.deepEqual(names("HD 현대"), ["HD현대중공업"]);
    assert.deepEqual(names("HD현대"), ["HD현대중공업"]);
    assert.deepEqual(names("현대 차"), ["현대차", "현대차우"]);
    // Every word has to appear, so a second word narrows rather than widens.
    assert.ok(names("삼성").length > names("삼성 전자").length);
    assert.deepEqual(names("삼성 전자"), ["삼성전자", "삼성전자우"]);
    // English names work the same way.
    assert.deepEqual(names("samsung elec"), ["삼성전자", "삼성전자우"]);
    assert.deepEqual(names("hyundai heavy"), ["HD현대중공업"]);
    // And a code, whole or partial, finds its listing.
    assert.deepEqual(names("329180"), ["HD현대중공업"]);
    assert.deepEqual(names("005930.KS"), ["삼성전자"]);
    // A word that matches nothing gives nothing, even beside one that does.
    assert.deepEqual(names("삼성 zzzz"), []);
    // The market filter still applies.
    assert.deepEqual(filterListings(all, "US", "현대"), []);
    assert.ok(filterListings(all, "KR", "현대").length >= 1);
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
    assert.match(main, /revealFromTray/);
    // A second launch says the program is already running and quits.
    assert.match(main, /requestSingleInstanceLock/);
    assert.match(main, /tellAlreadyRunning/);
    assert.match(main, /msg.alreadyRunning/);
    // The close button hides the window; only the tray ends the program.
    assert.match(main, /hideMoneyWindow/);
    assert.match(main, /quitApp/);
    assert.doesNotMatch(main, /popUpContextMenu/);
    const windows = [{ slot: "main", label: "1. 한국거래소", active: true }, { slot: "w1", label: "2. 나스닥", active: false }];
    const koMenu = buildTrayMenu((key) => createI18n("ko").t(key), { windows });
    const enMenu = buildTrayMenu((key) => createI18n("en").t(key), { windows });
    const koItems = listTrayItems(koMenu);
    assert.ok(koItems.length >= 12);
    for (const item of koItems) {
      assert.ok(item.icon, item.label);
      assert.ok(item.label);
      assert.ok(fs.existsSync(path.join(root, menuIconFile(item.icon))), item.icon);
      // Every tray row, submenus and window list included, carries a coloured glyph.
      assert.match(icon(item.icon, { colorful: true }), /(?:fill|stroke)="#[0-9a-f]{3,6}"/i, item.icon);
    }
    assert.equal(koMenu[0].id, "show-window");
    assert.equal(koMenu[0].label, "모든 창 표시");
    assert.equal(enMenu[0].label, "Show windows");
    // Every window is listed, the one in use marked; a new one is a click away.
    const windowGroup = koMenu.find((item) => item.id === "windows");
    assert.equal(windowGroup.icon, "window");
    assert.deepEqual(
      windowGroup.submenu.filter((item) => item.id).map((item) => item.id),
      ["new-window", "window:main", "window:w1"],
    );
    assert.equal(windowGroup.submenu.find((item) => item.id === "window:main").label, "● 1. 한국거래소");
    assert.equal(koItems.find((item) => item.id === "market").label, "시장");
    // Boards are saved on their own; there is nothing to open or save by hand.
    assert.equal(enMenu.find((item) => item.id === "file"), undefined);
    assert.ok(!koItems.some((item) => ["new", "open", "save", "save-as"].includes(item.id)));
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
  h.test("the stock icon is three bars of rising height", () => {
    const svg = icon("stocks");
    const d = svg.match(/ d="([^"]+)"/)[1];
    // Three vertical strokes, each one taller than the last.
    const bars = [...d.matchAll(/M(\d+(?:\.\d+)?) 20v-(\d+(?:\.\d+)?)/g)].map((m) => ({
      x: Number(m[1]),
      height: Number(m[2]),
    }));
    assert.equal(bars.length, 3);
    assert.deepEqual(
      bars.map((bar) => bar.x),
      [...bars.map((bar) => bar.x)].sort((a, b) => a - b),
    );
    for (let i = 1; i < bars.length; i += 1) assert.ok(bars[i].height > bars[i - 1].height, `bar ${i} is taller`);
    // The colourful face is three filled bars, not the old pair of candles.
    const colour = icon("stocks", { colorful: true });
    assert.equal((colour.match(/<rect /g) || []).length, 3);
    assert.equal(/candle/i.test(colour), false);
  });
  h.test("the rate icon draws currency signs rather than arrows", () => {
    const mono = icon("rates");
    const d = mono.match(/ d="([^"]+)"/)[1];
    // A euro: an open arc crossed by two bars. A dollar: one upright through an S.
    assert.match(d, /a4\.6 4\.6 0 1 0/, "euro bowl");
    assert.equal((d.match(/h7(?![\d.])/g) || []).length, 2, "two euro bars");
    assert.match(d, /M17\.5 5\.8v12\.4/, "dollar upright");
    // Both signs are coloured in the colourful face, and it has no arrowheads.
    const colour = icon("rates", { colorful: true });
    const strokes = [...colour.matchAll(/stroke="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase());
    assert.equal(strokes.length, 2);
    assert.equal(new Set(strokes).size, 2, "the two signs differ in colour");
  });
  h.test("every icon name renders one svg and no name falls back silently", () => {
    const fallback = icon("dot");
    for (const name of knownIcons()) {
      const svg = icon(name);
      assert.match(svg, /^<svg class="ico" viewBox="0 0 24 24"[^>]*>[\s\S]+<\/svg>$/, name);
      if (name !== "dot") assert.notEqual(svg, fallback, `${name} is not the fallback dot`);
    }
  });
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
