import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_INFO, titleText } from "../../src/core/app-info.js";
import { copyRange, cutText, pasteText } from "../../src/core/clipboard.js";
import { parseDocument, serializeDocument, createDocument } from "../../src/core/document.js";
import { acceptImage, classifyDrop } from "../../src/core/drop.js";
import { AppError, errorCopyText, normalizeError } from "../../src/core/errors.js";
import { parseFcList, parseWindowsFonts, resolveFontList } from "../../src/core/fonts.js";
import { DICT, createI18n, dictionaryKeys } from "../../src/core/i18n.js";
import { dirname, userDataDir } from "../../src/core/paths.js";
import { buildPrintModel } from "../../src/core/print-model.js";
import { RecentFiles } from "../../src/core/recent.js";
import { sanitizeSettings } from "../../src/core/settings.js";
import { UndoStack } from "../../src/core/undo.js";
import { PopupHub } from "../../electron/popup-hub.js";
import { applyPlan, planInstall, programIconFor, runInstaller } from "../../installer/plan.js";
import { buildTrayMenu, listTrayItems, menuIconFile, placeTrayMenu, programIconFile, trayIconFile } from "../../src/ui/tray-menu.js";
import { layoutMenu, menuWindowOptions, placeBeside, popupWindowOptions } from "../../src/ui/menu-layout.js";
import { buildTrayColumn } from "../../src/ui/menus.js";
import { layoutTabScroller } from "../../src/ui/tab-scroller.js";
import { CONTENT_PADDING, SCENE_MIN_SCALE, SCENE_NATURAL, WINDOW_DEFAULT, WINDOW_MIN, clampWindowSize, placeWindow, recordedWindowPlacement, sceneFit, sceneScale, stampWindowPlacement, toolbarMinWidth } from "../../src/ui/window-spec.js";
import { CUSTOM_THEME_ID, DARK_THEMES, LIGHT_THEMES, MIN_ALPHA, THEMES, backgroundAlpha, isHexColor, isTheme, themeColors, themeVars } from "../../src/core/themes.js";
import { aggregate, presentWeather } from "../../src/weather/aggregate.js";
import { formatTemp } from "../../src/weather/format.js";
import { geocodeUrl, metNoUrl, openMeteoUrl, parseGeocoding, parseMetNo, parseOpenMeteo, parseWttr, sourcePageUrl, wttrUrl } from "../../src/weather/providers.js";
import { loadWeather } from "../../src/weather/service.js";
import { conditionText } from "../../src/weather/wmo.js";
import { jsonResponse, openMeteoBody, SAMPLE_DATES } from "../support.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function registerLogic(h) {
  h.category("Core");
  h.test("title is the product name and version", () => {
    assert.equal(titleText(), "MyWeather 1.0.0");
    assert.equal(APP_INFO.author, "SHKWON(knix008@naver.com)");
    assert.equal(APP_INFO.buildNumber, "20261007.1");
    assert.equal(APP_INFO.buildDate, "2026-10-07");
    assert.equal(APP_INFO.fileExtension, "myweather");
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
      recentFiles: Array.from({ length: 12 }, (_, index) => `f${index}.myweather`),
      units: "K",
    });
    assert.equal(settings.language, "ko");
    assert.equal(settings.theme, "dark-ink");
    assert.equal(settings.transparency, 100);
    assert.equal("opacity" in settings, false);
    assert.deepEqual(settings.customTheme, { mode: "dark", bg: "#16283a", text: "#abcdef", accent: "#5cc8ff" });
    assert.equal(settings.windowSize, null);
    assert.deepEqual(sanitizeSettings({ windowSize: { width: 329, height: 187 } }).windowSize, { width: 329, height: 187 });
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
    assert.equal(sanitizeSettings({ displayPriority: "ecmwf" }).displayPriority, "ecmwf");
    assert.equal(sanitizeSettings({ displayPriority: "nope" }).displayPriority, "average");
    assert.equal(sanitizeSettings({ backgroundOpacity: 140 }).backgroundOpacity, 100);
    assert.equal(sanitizeSettings({ backgroundOpacity: -3 }).backgroundOpacity, 0);
    assert.equal(settings.fontSize, 8);
    assert.equal(settings.fontStyle, "normal");
    assert.equal(settings.zoom, 200);
    assert.equal(settings.units, "C");
    assert.equal(settings.updateHours, 1);
    assert.equal(sanitizeSettings({ updateHours: 12 }).updateHours, 12);
    assert.equal(sanitizeSettings({ updateHours: 3 }).updateHours, 1);
    assert.equal(sanitizeSettings({ updateHours: 24 }).updateHours, 24);
    assert.equal(sanitizeSettings(null).dateFormat, "long");
    assert.equal(sanitizeSettings({ dateFormat: "iso" }).dateFormat, "iso");
    assert.equal(sanitizeSettings({ dateFormat: "nope" }).dateFormat, "long");
    assert.equal(sanitizeSettings(null).openAtLogin, false);
    assert.equal(sanitizeSettings({ openAtLogin: 1 }).openAtLogin, true);
    assert.equal(settings.recentFiles.length, 10);
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
    for (let index = 0; index < 12; index += 1) recent.add(`file-${index}.myweather`);
    assert.equal(recent.items.length, 10);
    assert.equal(recent.items[0], "file-11.myweather");
    recent.add("file-11.myweather");
    assert.equal(recent.items.filter((item) => item === "file-11.myweather").length, 1);
    recent.remove("file-11.myweather");
    assert.equal(recent.items.includes("file-11.myweather"), false);
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
    assert.equal(dirname("C:/docs/a.myweather"), "C:/docs");
    assert.equal(dirname("C:\\docs\\a.myweather"), "C:/docs");
    assert.match(userDataDir("win32", "C:/Users/me"), /MyWeather/);
    assert.match(userDataDir("darwin", "/Users/me"), /Application Support\/MyWeather/);
    assert.match(userDataDir("linux", "/home/me"), /.config\/MyWeather/);
  });
  h.test("error text keeps the code, message, time, operation, app, and details", () => {
    const error = new AppError("Geocoder failed", "HTTP 500 from provider", "GEO");
    const info = normalizeError(error, { operation: "search-online", time: new Date(2026, 9, 7, 9, 5, 3), environment: "test-env" });
    assert.equal(info.time, "2026-10-07 09:05:03");
    assert.equal(info.app, "MyWeather 1.0.0");
    const text = errorCopyText(info, { time: "Time" });
    assert.match(text, /^\[GEO\] Geocoder failed/);
    assert.match(text, /Time: 2026-10-07 09:05:03/);
    assert.match(text, /Operation: search-online/);
    assert.match(text, /Application: MyWeather 1\.0\.0/);
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
  h.test("document round trip keeps the location and drops old notes", () => {
    const doc = createDocument();
    doc.tabs[0].properties.label = "harbor";
    const raw = JSON.parse(serializeDocument(doc));
    raw.tabs[0].dayNotes = { "2026-10-07": "umbrella" };
    const parsed = parseDocument(JSON.stringify(raw));
    assert.equal(parsed.tabs[0].properties.label, "harbor");
    assert.equal("dayNotes" in parsed.tabs[0], false);
    assert.equal(JSON.parse(serializeDocument(parsed)).tabs[0].dayNotes, undefined);
    assert.throws(() => parseDocument("{"), /Invalid document/);
    assert.throws(() => parseDocument(JSON.stringify({ format: "other" })), /Invalid document/);
  });
  h.test("image drops are accepted at any size and unknown files are not", () => {
    assert.equal(classifyDrop({ name: "a.myweather", type: "application/json" }), "document");
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

  h.category("Weather");
  h.test("provider urls carry coordinates and model names", () => {
    const location = { lat: 37.5665, lon: 126.978, cityEn: "Seoul" };
    assert.match(openMeteoUrl(location, "ecmwf_ifs025"), /models=ecmwf_ifs025/);
    assert.match(openMeteoUrl(location, "ecmwf_ifs025"), /latitude=37.5665/);
    assert.match(openMeteoUrl(location, "gfs_seamless"), /past_days=14/);
    assert.match(metNoUrl(location), /lat=37.5665/);
    assert.match(wttrUrl(location), /wttr\.in\/Seoul/);
    assert.match(geocodeUrl("부산", "ko"), /language=ko/);
    assert.match(sourcePageUrl(location), /open-meteo.com/);
  });
  h.test("open-meteo, met norway, and wttr parsers share one shape", () => {
    const meteo = parseOpenMeteo(openMeteoBody(SAMPLE_DATES, 20), "ecmwf");
    assert.equal(meteo.daily[0].tempMax, 20);
    assert.equal(meteo.daily[0].humidity, 50);
    const met = parseMetNo({
      properties: {
        timeseries: [
          {
            time: "2026-10-07T00:00:00Z",
            data: {
              instant: { details: { air_temperature: 10, wind_speed: 3, relative_humidity: 80 } },
              next_1_hours: { summary: { symbol_code: "rain" }, details: { precipitation_amount: 1 } },
            },
          },
          {
            time: "2026-10-07T06:00:00Z",
            data: {
              instant: { details: { air_temperature: 16, wind_speed: 4, relative_humidity: 60 } },
              next_1_hours: { summary: { symbol_code: "clearsky_day" }, details: { precipitation_amount: 0 } },
            },
          },
        ],
      },
    });
    assert.equal(met.daily[0].tempMin, 10);
    assert.equal(met.daily[0].tempMax, 16);
    assert.equal(met.daily[0].wind, 14.4);
    const wttr = parseWttr({
      weather: [{ date: "2026-10-07", mintempC: "9", maxtempC: "18", hourly: [{ time: "0", tempC: "9", weatherCode: "113", precipMM: "0", windspeedKmph: "11", humidity: "55" }] }],
    });
    assert.equal(wttr.daily[0].code, 0);
    assert.equal(conditionText(0, "ko"), "맑음");
    assert.equal(conditionText(0, "en"), "Clear");
  });
  h.test("aggregation averages sources and survives partial failure", () => {
    const weather = aggregate([
      { id: "ecmwf", ok: true, data: parseOpenMeteo(openMeteoBody(SAMPLE_DATES, 20), "ecmwf") },
      { id: "gfs", ok: true, data: parseOpenMeteo(openMeteoBody(SAMPLE_DATES, 22), "gfs") },
      { id: "jma", ok: false, error: "HTTP 400" },
    ]);
    assert.equal(weather.daily[0].tempMax, 21);
    assert.equal(weather.daily[0].bySource.ecmwf.tempMax, 20);
    assert.equal(weather.hourly[0].bySource.ecmwf.temp, 11);
    const preferred = presentWeather(weather, "ecmwf");
    assert.equal(preferred.daily[0].tempMax, 20);
    assert.equal(presentWeather(weather, "average").daily[0].tempMax, 21);
    assert.equal(presentWeather(weather, "metno").daily[0].tempMax, 21);
    assert.equal(weather.sources.filter((source) => source.ok).length, 2);
    assert.throws(() => aggregate([{ id: "ecmwf", ok: false, error: "down" }]), /All weather sources failed/);
  });
  h.test("loadWeather reports progress and keeps working sources", async () => {
    const seen = [];
    const weather = await loadWeather(
      { lat: 37.5, lon: 127, cityEn: "Seoul" },
      {
        sources: ["ecmwf", "gfs", "metno"],
        onProgress: (percent, id) => seen.push([percent, id]),
        fetchImpl: async (url) => {
          if (String(url).includes("met.no")) return jsonResponse({}, false, 503);
          if (String(url).includes("gfs")) return jsonResponse(openMeteoBody(SAMPLE_DATES, 22));
          return jsonResponse(openMeteoBody(SAMPLE_DATES, 20));
        },
      },
    );
    assert.equal(weather.daily[0].tempMax, 21);
    assert.equal(seen.at(-1)[0], 100);
    assert.equal(weather.sources.find((source) => source.id === "metno").ok, false);
  });
  h.test("geocoding results become places", () => {
    const rows = parseGeocoding({ results: [{ name: "Busan", country: "South Korea", country_code: "kr", latitude: 35.1, longitude: 129 }] });
    assert.equal(rows[0].countryCode, "KR");
    assert.equal(rows[0].lat, 35.1);
  });
  h.test("temperature formatting switches units", () => {
    assert.equal(formatTemp(0, "C"), "0°C");
    assert.equal(formatTemp(0, "F"), "32°F");
    assert.equal(formatTemp(null, "C"), "—");
  });

  h.category("Print");
  h.test("print scopes cover all tabs, the current tab, and a custom date range", () => {
    const tabs = [
      tab("Seoul", ["2026-10-07", "2026-10-08", "2026-10-09"]),
      tab("Busan", ["2026-10-07", "2026-10-08"]),
    ];
    const all = buildPrintModel({ scope: "all", tabs, activeIndex: 0, pageSetup: { paper: "A4", orientation: "portrait", margin: 15 }, language: "en" });
    assert.match(all.html, /Seoul/);
    assert.match(all.html, /Busan/);
    assert.match(all.html, /size: A4 portrait/);
    const current = buildPrintModel({ scope: "current", tabs, activeIndex: 1, pageSetup: { paper: "Letter", orientation: "landscape", margin: 10 }, language: "en" });
    assert.equal(current.html.includes("Seoul"), false);
    assert.match(current.html, /Letter landscape/);
    const custom = buildPrintModel({
      scope: "custom",
      tabs,
      activeIndex: 0,
      fromDate: "2026-10-08",
      toDate: "2026-10-08",
      pageSetup: { paper: "A4", orientation: "portrait", margin: 15 },
      language: "ko",
    });
    assert.match(custom.html, /2026-10-08/);
    assert.equal(custom.html.includes("2026-10-07"), false);
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
    assert.ok(layout.width >= 300);
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
    const forecast = placeBeside(main, { width: 720, height: 520 }, work);
    assert.equal(forecast.x, 100 + 760 + 16);
    assert.equal(forecast.y, 80 + Math.round((640 - 520) / 2));
    const parked = placeBeside({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 680, height: 640 }, work);
    assert.equal(parked.x, 1920 - 680);
    assert.ok(parked.x > 0);
    const wide = placeBeside({ x: 0, y: 0, width: 1400, height: 1080 }, { width: 680, height: 640 }, work);
    assert.equal(wide.x, 1920 - 680);
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
    const minimum = recordedWindowPlacement({}, { x: 2352, y: 0, width: 329, height: 187, maximized: false });
    assert.deepEqual(minimum, { x: 2352, y: 0, width: 329, height: 187, maximized: false });
    assert.deepEqual(stampWindowPlacement({}, { x: 2352, y: 0, width: 329, height: 187, maximized: false }).windowSize, { width: 329, height: 187 });
    assert.deepEqual({ x: recorded.x, y: recorded.y, width: recorded.width, height: recorded.height }, { x: 40, y: 18, width: 910, height: 640 });
    assert.equal(sceneScale(SCENE_NATURAL), 1);
    assert.equal(sceneScale({ width: 2000, height: 2000 }), Math.round((2000 / SCENE_NATURAL.width) * 1000) / 1000);
    assert.equal(sceneScale({ width: 80, height: 80 }), SCENE_MIN_SCALE);
    const fitted = {
      width: WINDOW_MIN.width - CONTENT_PADDING.left - CONTENT_PADDING.right,
      height: WINDOW_MIN.height - 46 - CONTENT_PADDING.top - CONTENT_PADDING.bottom,
    };
    assert.ok(sceneScale(fitted) >= SCENE_MIN_SCALE);
    const roomy = sceneFit({ width: 726, height: 572 }, 143);
    assert.equal(roomy.text, 1);
    assert.equal(roomy.art, Math.round((555 / 240) * 1000) / 1000);
    const tight = sceneFit({ width: 300, height: 160 }, 143);
    assert.ok(tight.text < 1);
    assert.equal(tight.text, tight.art);
    assert.ok(tight.text >= SCENE_MIN_SCALE);
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
    const weather = column.querySelector('[data-cmd="weather"] .menu-icon svg');
    assert.match(weather.innerHTML, /fill="#ffc428"/);
    const opened = buildTrayColumn(buildTrayMenu((key) => createI18n("ko").t(key)).find((entry) => entry.id === "weather").submenu);
    for (const name of ["daily", "weekly", "monthly"]) {
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
    const daily = hub.begin({ type: "forecast", range: "daily" }, () => ({ close() {}, send() {}, focus() {} }));
    const weekly = hub.begin({ type: "forecast", range: "weekly" }, () => ({ close() {}, send() {}, focus() {} }));
    assert.equal(daily.focused, false);
    assert.equal(weekly.focused, false);
    assert.notEqual(daily.id, weekly.id);
    const sent = [];
    hub.windows.get(daily.id).win.send = (patch) => sent.push(patch);
    const refreshed = hub.refresh("forecast:daily", { markup: "<p>2026-10-09</p>" });
    assert.equal(refreshed.focused, true);
    assert.equal(refreshed.id, daily.id);
    assert.equal(sent[0].markup, "<p>2026-10-09</p>");
    assert.match(hub.take(daily.id).markup, /2026-10-09/);
    assert.equal(hub.refresh("forecast:missing", { markup: "no" }), null);
    const pending = hub.wait(id);
    hub.closeAll();
    assert.deepEqual(await pending, { action: "close" });
    assert.deepEqual(closed, ["about"]);
    assert.equal(hub.windows.size, 0);
  });

  h.category("Installer");
  h.test("fresh install only copies the app and registers both icons", () => {
    const plan = planInstall({ language: "en", existingInstall: false, userDataExists: false, installPath: "/opt/MyWeather", userDataPath: "/data" });
    assert.deepEqual(
      plan.steps.map((step) => step.action),
      ["install", "register-app-icon", "register-file-icon"],
    );
    const vfs = applyPlan({ install: {}, data: { "/data": { settings: true } }, registry: {} }, plan);
    assert.equal(vfs.install["/opt/MyWeather"].appIcon, "assets/icon.png");
    assert.equal(vfs.registry.fileIcon, "assets/file.ico");
    assert.equal(vfs.registry.fileExt, "myweather");
    assert.ok(vfs.data["/data"]);
  });
  h.test("an existing install is removed and saved data is deleted only when asked", () => {
    const keep = planInstall({
      language: "ko",
      existingInstall: true,
      userDataExists: true,
      deleteData: false,
      installPath: "/opt/MyWeather",
      userDataPath: "/data",
      shortcuts: ["/desktop/MyWeather.lnk"],
    });
    const kept = applyPlan(
      {
        install: { "/opt/MyWeather": { old: true } },
        data: { "/data": { settings: true } },
        registry: {},
        links: { "/desktop/MyWeather.lnk": true },
        shortcuts: { desktop: "old" },
      },
      keep,
    );
    assert.equal(kept.log.includes("uninstall-existing"), true);
    assert.equal(kept.log.includes("delete-user-data"), false);
    assert.ok(kept.data["/data"]);
    assert.equal(kept.install["/opt/MyWeather"].language, "ko");
    assert.equal(kept.links["/desktop/MyWeather.lnk"], undefined);
    assert.deepEqual(kept.shortcuts, {});
    const remove = planInstall({
      language: "en",
      existingInstall: true,
      userDataExists: true,
      deleteData: true,
      installPath: "/opt/MyWeather",
      userDataPath: "/data",
    });
    const removed = applyPlan({ install: { "/opt/MyWeather": { old: true } }, data: { "/data": { settings: true } }, registry: {} }, remove);
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
          return { installed: true, userDataExists: true, installPath: "/opt/MyWeather", userDataPath: "/data" };
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
          return { installed: true, userDataExists: true, installPath: "/opt/MyWeather", userDataPath: "/data", programIcon: "assets/icon.ico", platform: "win32" };
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
    assert.equal(pkg.build.fileAssociations[0].ext, "myweather");
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
    const desktop = fs.readFileSync(path.join(root, "installer/linux/myweather.desktop"), "utf8");
    assert.match(desktop, /application\/x-myweather/);
    const mime = fs.readFileSync(path.join(root, "installer/linux/myweather-mime.xml"), "utf8");
    assert.match(mime, /\*\.myweather/);
    const main = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
    assert.match(main, /assets\/icon\.png/);
    assert.match(main, /frame: false/);
    assert.match(main, /saveWindowPlacement/);
    assert.match(main, /window-bounds/);
    assert.match(main, /window\.json/);
    assert.match(main, /thickFrame: false/);
    assert.match(main, /skipTaskbar: true/);
    assert.match(main, /setLoginItemSettings/);
    assert.match(main, /set-open-at-login/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, "src/styles.css"), "utf8"), /app-region/);
    assert.match(main, /new Tray/);
    assert.match(main, /placeTrayMenu/);
    assert.match(main, /fit-tray-menu/);
    assert.match(main, /fit-menu/);
    assert.match(main, /delete options\.parent/);
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
    assert.equal(koItems.find((item) => item.id === "weather").label, "날씨");
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
    assert.match(main, /holdSavedBounds/);
    assert.match(main, /setBounds\(bounds\)/);
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
    assert.match(page, /MyWeather V1\.0/);
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

function tab(city, dates) {
  return {
    place: { cityKo: city, cityEn: city, countryKo: "대한민국", countryEn: "South Korea" },
    properties: { label: "" },
    weather: {
      daily: dates.map((date) => ({ date, tempMin: 10, tempMax: 20, precip: 1, wind: 5 })),
    },
  };
}
