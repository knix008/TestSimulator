import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/core/errors.js";
import { serializeDocument } from "../../src/core/document.js";
import { DARK_THEMES, LIGHT_THEMES, THEMES } from "../../src/core/themes.js";
import { buildAboutSpec, bootPopup, fitPopupToViewport, popupFits } from "../../src/ui/popups.js";
import { WINDOW_MIN } from "../../src/ui/window-spec.js";
import { jsonResponse, openMeteoBody, SAMPLE_DATES, settle, withApp } from "../support.js";
import { findCity } from "../../src/weather/cities.js";
import { pageWindow, parseCityList } from "../../src/ui/popups.js";
void pageWindow;

export function registerGui(h) {
  h.category("Window");
  h.test("the title bar shows the icon and MyWeather without a place name", async () => {
    await withApp(async ({ app }) => {
      assert.equal(app.frame.dataset.chromeless, "true");
      for (const selector of [".menubar", ".toolbar", ".statusbar", "#statusbar", "[data-status]", "[data-gui='menubar-item']", "#opacity-slider"]) {
        assert.equal(app.root.querySelector(selector), null, selector);
      }
      const bar = app.root.querySelector("[data-gui='titlebar']");
      const title = bar.querySelector("[data-gui='window-title']");
      const icon = bar.querySelector("img");
      assert.equal(bar.parentElement.dataset.gui, "drag-region");
      assert.equal(app.root.querySelector(".tabbar"), null, "cities are not toolbar buttons");
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("서울"), false);
      assert.equal(title.textContent, "MyWeather");
      assert.equal(title.textContent.includes("V1.0"), false);
      assert.equal(app.titleText, "MyWeather");
      assert.equal(document.title, "MyWeather");
      assert.match(icon.getAttribute("src"), /icon\.png$/);
      assert.equal(getComputedStyle(bar).display, "flex");
      assert.ok(Number.parseFloat(getComputedStyle(icon).width) > 0);
      assert.equal(bar.textContent.includes("서울"), false);
      app.markDirty();
      assert.equal(app.titleText, "MyWeather");
      assert.equal(title.textContent, "MyWeather");
      app.applyWindowState({ minimized: true });
      assert.equal(title.hidden, true);
      app.applyWindowState({ minimized: false });
      let room = 10;
      Object.defineProperty(title, "clientWidth", { configurable: true, get: () => room });
      Object.defineProperty(title, "scrollWidth", { configurable: true, get: () => 90 });
      app.syncWindowTitle();
      assert.equal(title.hidden, true);
      room = 90;
      window.dispatchEvent(new Event("resize"));
      assert.equal(title.hidden, false);
    });
  });
  h.test("the shell is one rounded panel with minimize, maximize, and close buttons", async () => {
    await withApp(async ({ app }) => {
      const shell = app.root.querySelector(".window-shell");
      assert.ok(shell);
      assert.equal(getComputedStyle(shell).borderRadius, "22px");
      assert.equal(getComputedStyle(shell).overflow, "hidden");
      for (const el of [document.documentElement, document.body, app.frame, shell, app.content]) {
        const style = getComputedStyle(el);
        const label = el.id || el.className || el.tagName;
        assert.equal(style.overflowX || style.overflow, "hidden", label);
        assert.equal(style.overflowY || style.overflow, "hidden", label);
      }
      const controls = [...app.root.querySelectorAll("[data-gui='window-control']")].map((button) => button.dataset.cmd);
      assert.deepEqual(controls, ["minimize", "maximize", "close"]);
      for (const button of app.root.querySelectorAll("[data-gui='window-control']")) {
        assert.ok(button.title && button.querySelector("svg"), button.dataset.cmd);
      }
      assert.ok(app.root.querySelector(".win-close"));
      const nut = app.root.querySelector('[data-cmd="settings"] svg');
      assert.match(nut.innerHTML, /M8\.2 4\.4h7\.6L20\.4 12l-4\.6 7\.6H8\.2L3\.6 12z/);
      assert.match(nut.innerHTML, /fill-rule="evenodd"/);
      assert.equal(app.root.querySelector(".shell-top").dataset.gui, "drag-region");
    });
  });
  h.test("the bottom-right resize marker resizes the web panel and persists the size", async () => {
    await withApp(async ({ app, platform }) => {
      const grip = app.root.querySelector("[data-gui='resize-grip']");
      assert.ok(grip);
      assert.equal(getComputedStyle(grip).position, "absolute");
      assert.equal(getComputedStyle(grip).right, "4px");
      assert.equal(getComputedStyle(grip).bottom, "4px");
      assert.equal(getComputedStyle(grip).cursor, "nwse-resize");
      assert.ok(grip.querySelector("svg path"));
      assert.equal(app.shell.style.width, "760px");
      assert.equal(app.shell.style.height, "640px");
      pointer(grip, "pointerdown", 100, 100);
      pointer(document, "pointermove", 160, 140);
      assert.equal(app.shell.style.width, "820px");
      assert.equal(app.shell.style.height, "680px");
      pointer(document, "pointermove", -2000, -2000);
      assert.equal(app.shell.style.width, `${WINDOW_MIN.width}px`);
      assert.equal(app.shell.style.height, `${WINDOW_MIN.height}px`);
      pointer(document, "pointermove", 140, 120);
      pointer(document, "pointerup", 140, 120);
      await settle();
      assert.deepEqual(platform.settings.windowSize, { width: 800, height: 660 });
      assert.deepEqual(platform.settings.windowPosition, { x: 0, y: 0 });
      pointer(document, "pointermove", 400, 400);
      assert.equal(app.shell.style.width, "800px");
    });
  });
  h.test("on the desktop the resize marker moves the native window", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.nativeWindow = true;
    await withApp(
      async ({ app }) => {
        assert.equal(app.shell.dataset.sized, "fill");
        const grip = app.root.querySelector("[data-gui='resize-grip']");
        platform.resizeWindow = async (step) => {
          platform.resizeSteps.push(step);
          if (step.phase === "end") return { x: 12, y: 24, width: 510, height: 430 };
          return null;
        };
        pointer(grip, "pointerdown", 10, 10);
        pointer(document, "pointermove", 50, 30);
        pointer(document, "pointerup", 50, 30);
        await settle();
        assert.deepEqual(platform.resizeSteps, [{ phase: "start" }, { phase: "move", dx: 40, dy: 20 }, { phase: "end" }]);
        assert.deepEqual(platform.settings.windowSize, { width: 510, height: 430 });
        assert.deepEqual(platform.settings.windowPosition, { x: 12, y: 24 });
        await app.run("maximize");
        assert.equal(app.frame.dataset.maximized, "false");
        platform.emitWindowState({ maximized: true });
        assert.equal(app.frame.dataset.maximized, "true");
        assert.equal(grip.hidden, true);
        assert.equal(app.root.querySelector('[data-cmd="maximize"]').title, "이전 크기로");
        platform.emitWindowState({ maximized: false });
        assert.equal(grip.hidden, false);
        assert.equal(app.root.querySelector('[data-cmd="maximize"]').title, "최대화");
      },
      { platform },
    );
  });
  h.test("dragging the weather area moves the window and buttons still run", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.nativeWindow = true;
    await withApp(
      async ({ app }) => {
        const scene = app.content;
        platform.moveWindow = async (step) => {
          platform.moveSteps.push(step);
          if (step.phase === "end") return { x: 140, y: 90 };
          return null;
        };
        pointer(scene, "pointerdown", 20, 20);
        pointer(document, "pointermove", 70, 50);
        pointer(document, "pointerup", 70, 50);
        await settle();
        assert.deepEqual(platform.settings.windowPosition, { x: 140, y: 90 });
        assert.deepEqual(platform.moveSteps, [
          { phase: "start" },
          { phase: "move", dx: 50, dy: 30 },
          { phase: "end" },
        ]);
        platform.moveSteps.length = 0;
        const settings = app.root.querySelector('[data-cmd="settings"]');
        const buttonFill = getComputedStyle(settings).backgroundColor;
        assert.ok(buttonFill !== "transparent" && buttonFill !== "rgba(0, 0, 0, 0)", buttonFill);
        pointer(settings, "pointerdown", 8, 8);
        pointer(document, "pointermove", 40, 40);
        pointer(document, "pointerup", 40, 40);
        assert.deepEqual(platform.moveSteps, []);
        pointer(settings, "pointerup", 8, 8);
        assert.equal(app.root.querySelectorAll("[data-popup='settings']").length, 1);
        await new Promise((resolve) => setTimeout(resolve, 0));
        settings.click();
        assert.equal(app.root.querySelectorAll("[data-popup='settings']").length, 1);
      },
      { platform },
    );
    await withApp(async ({ app, platform: web }) => {
      const icon = app.root.querySelector(".title-icon");
      assert.equal(icon.getAttribute("draggable"), "false");
      const drag = new Event("dragstart", { bubbles: true, cancelable: true });
      icon.dispatchEvent(drag);
      assert.equal(drag.defaultPrevented, true);
      pointer(icon, "pointerdown", 4, 4);
      pointer(document, "pointermove", 24, 16);
      pointer(document, "pointerup", 24, 16);
      await settle();
      assert.equal(app.shell.style.transform, "translate(20px, 12px)");
      assert.equal(app.settings.backgroundImage, "");
      pointer(app.root.querySelector(".title-name"), "pointerdown", 24, 16);
      pointer(document, "pointermove", 24, 16);
      pointer(document, "pointerup", 24, 16);
      await settle();
      assert.equal(app.shell.style.transform, "translate(20px, 12px)");
      assert.deepEqual(web.settings.windowPosition, { x: 20, y: 12 });
      assert.deepEqual(web.settings.windowSize, { width: 760, height: 640 });
      const daily = app.root.querySelector('[data-cmd="daily"]');
      pointer(daily, "pointerdown", 1, 1);
      pointer(document, "pointermove", 30, 30);
      pointer(document, "pointerup", 30, 30);
      assert.equal(app.shell.style.transform, "translate(20px, 12px)");
      daily.click();
      assert.equal(app.root.querySelector("[data-popup='forecast']") != null, true);
    });
  });
  h.test("the next launch opens at the saved size and position", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.settings = { windowSize: { width: 520, height: 420 }, windowPosition: { x: 30, y: 18 }, windowMaximized: false };
    await withApp(async ({ app }) => {
      assert.equal(app.shell.style.width, "520px");
      assert.equal(app.shell.style.height, "420px");
      assert.equal(app.shell.style.transform, "translate(30px, 18px)");
      assert.equal(app.frame.dataset.maximized, "false");
    }, { platform });
    const maximized = createMemoryPlatform();
    maximized.settings = { windowSize: { width: 520, height: 420 }, windowPosition: { x: 30, y: 18 }, windowMaximized: true };
    await withApp(async ({ app }) => {
      assert.equal(app.frame.dataset.maximized, "true");
      assert.equal(app.shell.dataset.sized, "fill");
      assert.equal(app.root.querySelector('[data-cmd="maximize"]').title, "이전 크기로");
    }, { platform: maximized });
  });
  h.test("ctrl wheel zooms between 50 and 200", async () => {
    await withApp(async ({ app }) => {
      wheel(app, -120);
      assert.equal(app.settings.zoom, 110);
      assert.equal(app.content.dataset.zoom, "110");
      for (let i = 0; i < 20; i += 1) wheel(app, -120);
      assert.equal(app.settings.zoom, 200);
      for (let i = 0; i < 30; i += 1) wheel(app, 120);
      assert.equal(app.settings.zoom, 50);
      await app.run("zoom-reset");
      assert.equal(app.settings.zoom, 100);
    });
  });
  h.test("status messages appear as a short toast instead of a status bar", async () => {
    await withApp(async ({ app }) => {
      const toast = app.root.querySelector("[data-gui='toast']");
      assert.equal(toast.hidden, true);
      app.setStatus(app.t("msg.saved"));
      assert.equal(toast.hidden, false);
      assert.equal(toast.textContent, "저장했습니다.");
      assert.equal(toast.getAttribute("role"), "status");
      app.setStatus(app.t("status.ready"));
      assert.equal(toast.textContent, "저장했습니다.");
    });
  });
  h.test("the window shows the current weather, and range buttons open forecast windows", async () => {
    await withApp(async ({ app }) => {
      assert.equal(app.root.querySelector("#left-panel"), null);
      assert.equal(app.root.querySelector("#right-panel"), null);
      const scene = app.root.querySelector("[data-gui='scene']");
      assert.ok(scene);
      assert.equal(scene.querySelector(".scene-svg").getAttribute("width"), "240");
      const ranges = [...app.root.querySelectorAll("[data-gui='range-button']")];
      assert.deepEqual(ranges.map((button) => button.title), ["일간 예보", "주간 예보", "월간 예보"]);
      assert.ok(ranges.every((button) => button.querySelector("svg") && !button.querySelector(".tool-label")));
      assert.equal(app.root.querySelector("[data-fold]"), null);
      const background = getComputedStyle(app.frame).backgroundColor;
      assert.ok(background === "rgba(0, 0, 0, 0)" || background === "transparent", background);
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      await app.refreshWeather();
      const todayTemp = app.root.querySelector(".scene-temp").textContent;
      assert.ok(todayTemp);
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      // The city name leads the scene, set larger than the date beneath it. jsdom drops
      // calc() declarations, so the rules are read from the stylesheet source.
      const sheet = document.querySelector("head style").textContent;
      const cityRule = /\.scene-city \{[^}]*\}/.exec(sheet)[0];
      const dateRule = /\.scene-date \{[^}]*\}/.exec(sheet)[0];
      assert.match(cityRule, /font-size: calc\(30px/, cityRule);
      assert.match(dateRule, /font-size: calc\(16px/, dateRule);
      assert.match(cityRule, /font-weight: 800/, cityRule);
      assert.match(cityRule, /text-overflow: ellipsis/, "a long name tails off instead of being cut");
      assert.equal(app.root.querySelector(".tabbar"), null);
      await app.setTransparency(80);
      const daily = await openForecast(app, "daily");
      assert.equal(daily.popup.dataset.popup, "forecast");
      assert.equal(daily.popup.querySelector(".popup-title").textContent, "일간 예보");
      assert.ok(daily.popup.querySelector(".popup-icon .ico-color"));
      assert.equal(daily.popup.querySelector(".popup-when").textContent, "10월 7일");
      assert.ok(daily.popup.querySelector("[data-hour]"));
      assert.equal(popupFits(daily.popup).fits, true);
      assert.equal(getComputedStyle(daily.popup).backgroundImage, getComputedStyle(app.shell).backgroundImage);
      await daily.close();
      const weekly = await openForecast(app, "weekly");
      assert.equal(weekly.popup.querySelector(".popup-title").textContent, "주간 예보");
      assert.ok(weekly.popup.querySelector(".popup-icon .ico-color"));
      assert.equal(weekly.popup.querySelector(".popup-when").textContent, "10월 4일 – 10월 10일");
      assert.ok(weekly.popup.querySelector('[data-gui="week"]'));
      weekly.popup.querySelector('[data-date="2026-10-09"]').click();
      assert.equal(app.currentTab().selectedDate, "2026-10-09");
      assert.equal(app.root.querySelector(".scene-temp").textContent, todayTemp);
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      assert.equal(getComputedStyle(weekly.popup).backgroundImage, getComputedStyle(app.shell).backgroundImage);
      await weekly.close();
      const monthly = await openForecast(app, "monthly");
      assert.equal(monthly.popup.querySelector(".popup-title").textContent, "월간 예보");
      assert.ok(monthly.popup.querySelector(".popup-icon .ico-color"));
      assert.equal(monthly.popup.querySelector(".popup-when").textContent, "2026년 10월");
      assert.ok(monthly.popup.querySelector('[data-gui="month"]'));
      assert.equal(getComputedStyle(monthly.popup).backgroundImage, getComputedStyle(app.shell).backgroundImage);
      await monthly.close();
    });
  });
  h.test("daily, weekly, and monthly forecasts use the background image", async () => {
    await withApp(async ({ app }) => {
      await app.setWallpaper("data:image/png;base64,bbbb", "cloud.png");
      app.settings.backgroundOpacity = 25;
      app.applyWallpaper(25);
      for (const range of ["daily", "weekly", "monthly"]) {
        const pending = app.showForecast(range);
        await settle();
        const popup = document.querySelector('[data-popup="forecast"]');
        const layer = popup.querySelector("[data-gui='wallpaper']");
        assert.equal(layer.dataset.image, "yes", range);
        assert.equal(layer.style.backgroundImage, app.wallpaper.style.backgroundImage, range);
        assert.equal(layer.style.opacity, "0.25", range);
        app.applyWallpaper(60);
        assert.equal(layer.style.opacity, "0.6", range);
        popup.querySelector('[data-action="close"]').click();
        await pending;
      }
      await app.setWallpaper("", "");
      const pending = app.showForecast("daily");
      await settle();
      const cleared = document.querySelector('[data-popup="forecast"] [data-gui="wallpaper"]');
      assert.equal(cleared.dataset.image, "no");
      assert.equal(cleared.style.opacity, "0");
      document.querySelector('[data-popup="forecast"] [data-action="close"]').click();
      await pending;
      const settings = app.showSettings("general");
      await settle();
      assert.equal(document.querySelector('[data-popup="settings"] [data-gui="wallpaper"]'), null);
      document.querySelector('[data-popup="settings"] [data-action="cancel"]').click();
      await settings;
    });
  });
  h.test("the toolbar keeps the icon at the left and every button at the right", async () => {
    await withApp(async ({ app }) => {
      for (let i = 0; i < 8; i += 1) app.addTab();
      assert.equal(app.doc.tabs.length, 9);
      for (const selector of [".tabbar", ".tab", ".chev", '[data-cmd="tab-next"]', '[data-cmd="tab-prev"]']) {
        assert.equal(app.root.querySelector(selector), null, selector);
      }
      assert.equal(app.root.querySelector(".scrollbar"), null);
      const icon = app.root.querySelector(".title-icon");
      const titlebar = app.root.querySelector(".titlebar");
      assert.equal(getComputedStyle(icon).flexShrink, "0");
      assert.equal(getComputedStyle(icon).width, "18px");
      assert.equal(getComputedStyle(titlebar).minWidth, "18px");
      assert.equal(titlebar, app.root.querySelector(".shell-top").firstElementChild);
      assert.equal(getComputedStyle(app.root.querySelector(".range-tools")).marginLeft, "auto");
      assert.ok([...app.root.querySelector(".shell-top").querySelectorAll("button")].length >= 8);
    });
  });
  h.test("the last tab cannot be closed", async () => {
    await withApp(async ({ app }) => {
      await app.run("close-tab");
      assert.equal(app.doc.tabs.length, 1);
      assert.equal(app.statusMessage, "마지막 탭은 닫을 수 없습니다.");
      assert.equal(app.root.querySelector("[data-gui='toast']").textContent, "마지막 탭은 닫을 수 없습니다.");
    });
  });
  h.test("window buttons minimize and maximize, and closing never asks about saving", async () => {
    await withApp(async ({ app, platform }) => {
      app.root.querySelector('[data-cmd="minimize"]').click();
      await settle();
      assert.equal(app.frame.dataset.minimized, "true");
      assert.equal(app.root.querySelector("[data-gui='resize-grip']").hidden, true);
      await app.run("minimize");
      assert.equal(app.frame.dataset.minimized, "false");
      app.root.querySelector('[data-cmd="maximize"]').click();
      await settle();
      assert.equal(app.frame.dataset.maximized, "true");
      assert.equal(app.shell.dataset.sized, "fill");
      assert.equal(getComputedStyle(app.shell).borderRadius, "0");
      assert.equal(app.root.querySelector('[data-cmd="maximize"]').title, "이전 크기로");
      app.root.querySelector(".shell-top").dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
      await settle();
      assert.equal(app.frame.dataset.maximized, "false");
      assert.equal(app.shell.style.width, "760px");
      assert.deepEqual(platform.commands, ["minimize", "minimize", "maximize", "maximize"]);
      app.currentTab().properties.label = "umbrella";
      app.markDirty();
      // The settings look after themselves, so closing asks nothing.
      const closing = app.requestClose();
      await settle();
      assert.equal(document.querySelector('[data-popup="unsaved"]'), null, "no save prompt");
      assert.equal(await closing, "closed");
      assert.equal(platform.quit, 1);
      assert.equal(app.closed, true);
    });
  });

  h.category("Cities");
  h.test("clicking the window shows the next city and the forecasts follow it", async () => {
    await withApp(async ({ app, platform }) => {
      app.settings.cities = [findCity("KR", "Seoul"), findCity("JP", "Tokyo"), findCity("FR", "Paris")];
      app.syncTabsToCities();
      app.afterStructure();
      assert.deepEqual(app.doc.tabs.map((tab) => tab.place.cityEn), ["Seoul", "Tokyo", "Paris"]);
      assert.equal(app.root.querySelector(".scene-city").textContent, "서울");
      app.content.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      assert.equal(app.doc.activeIndex, 1);
      assert.equal(app.root.querySelector(".scene-city").textContent, "도쿄");
      app.content.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      assert.equal(app.root.querySelector(".scene-city").textContent, "파리");
      app.content.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      assert.equal(app.doc.activeIndex, 0, "the list wraps around");
      assert.deepEqual(platform.shownCities.slice(-3), [1, 2, 0]);
      app.root.querySelector('[data-cmd="refresh"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await settle();
      assert.equal(app.doc.activeIndex, 0, "a toolbar button is not a city change");
      app.showCity(2);
      await app.refreshWeather();
      const forecast = await openForecast(app, "weekly");
      assert.match(forecast.popup.textContent, /10/);
      assert.equal(app.currentTab().place.cityEn, "Paris");
      app.showCity(0);
      assert.equal(app.currentTab().place.cityEn, "Seoul");
      await forecast.close();
    });
  });
  h.test("dragging the window by the weather does not count as a city change", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.nativeWindow = true;
    platform.moveWindow = async (step) => {
      platform.moveSteps.push(step);
      return step.phase === "end" ? { x: 90, y: 40, width: 760, height: 640 } : null;
    };
    await withApp(
      async ({ app }) => {
        app.settings.cities = [findCity("KR", "Seoul"), findCity("JP", "Tokyo")];
        app.syncTabsToCities();
        app.afterStructure();
        assert.ok(app.content.querySelector("[data-scene-advance]"), "the picture offers the next city");
        pointer(app.content, "pointerdown", 20, 20);
        pointer(document, "pointermove", 90, 60);
        pointer(document, "pointerup", 90, 60);
        await settle();
        app.content.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        assert.equal(app.doc.activeIndex, 0, "the click that ends the drag is swallowed");
        await new Promise((resolve) => setTimeout(resolve, 200));
        app.content.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        assert.equal(app.doc.activeIndex, 1, "a later click still advances");
        app.doc.tabs = [app.doc.tabs[0]];
        app.afterStructure();
        assert.equal(app.content.querySelector("[data-scene-advance]"), null, "one city offers nothing to advance to");
      },
      { platform },
    );
  });
  h.test("a forecast follows the city even when its weather arrives later", async () => {
    await withApp(async ({ app }) => {
      app.settings.cities = [findCity("KR", "Seoul"), findCity("FR", "Paris")];
      app.syncTabsToCities();
      // Only the first city is loaded, so the second has to fetch after the switch.
      await app.refreshWeather();
      assert.ok(app.doc.tabs[0].weather);
      assert.equal(app.doc.tabs[1].weather, null);
      const forecast = await openForecast(app, "weekly");
      assert.equal(forecast.popup.querySelector(".popup-city").textContent, "서울");
      app.showCity(1);
      assert.equal(forecast.popup.querySelector(".popup-city").textContent, "파리", "the name changes at once");
      const waiting = forecast.popup.querySelector(".forecast-fit").textContent;
      assert.match(waiting, /새로고침으로 날씨를 불러/, "and waits with nothing to show");
      await app.refreshWeather();
      assert.ok(app.doc.tabs[1].weather, "the second city has loaded by now");
      const after = forecast.popup.querySelector(".forecast-fit").textContent;
      assert.notEqual(after, waiting, "the forecast was repainted when the weather landed");
      assert.doesNotMatch(after, /새로고침으로 날씨를 불러/, "no empty placeholder is left behind");
      assert.match(after, /°C/, "the readings are on screen");
      await forecast.close();
    });
  });
  h.test("each forecast window has a refresh button beside its close button", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      for (const range of ["daily", "weekly", "monthly"]) {
        const forecast = await openForecast(app, range);
        const head = forecast.popup.querySelector(".popup-head");
        const refresh = head.querySelector('[data-action="forecast-refresh"]');
        const close = head.querySelector('[data-gui="popup-close"]');
        assert.ok(refresh, range);
        assert.ok(refresh.title, "it says what it does");
        assert.ok(refresh.querySelector("svg.ico-color"), "and carries the refresh icon");
        const order = [...head.children];
        assert.ok(order.indexOf(refresh) < order.indexOf(close), `${range}: refresh sits left of close`);
        const asked = platform.fetchCount || 0;
        platform.fetchCount = asked;
        refresh.click();
        await settle();
        await app.refreshJob;
        assert.ok(forecast.popup.isConnected, "refreshing does not close the window");
        await forecast.close();
      }
    });
  });
  h.test("the daily, weekly, and monthly windows name the city they show", async () => {
    await withApp(async ({ app }) => {
      app.settings.cities = [findCity("KR", "Seoul"), findCity("FR", "Paris")];
      app.syncTabsToCities();
      await app.refreshWeather({ all: true });
      for (const range of ["daily", "weekly", "monthly"]) {
        const forecast = await openForecast(app, range);
        assert.equal(forecast.popup.querySelector(".popup-city").textContent, "서울", range);
        assert.ok(forecast.popup.querySelector(".popup-when").textContent, range);
        app.showCity(1);
        assert.equal(forecast.popup.querySelector(".popup-city").textContent, "파리", `${range} follows the shown city`);
        await app.setLanguage("en");
        assert.equal(forecast.popup.querySelector(".popup-city").textContent, "Paris", range);
        await app.setLanguage("ko");
        app.showCity(0);
        assert.equal(forecast.popup.querySelector(".popup-city").textContent, "서울", range);
        await forecast.close();
      }
    });
  });
  h.test("the city changes on its own at the chosen interval", async () => {
    await withApp(async ({ app }) => {
      app.settings.cities = [findCity("KR", "Seoul"), findCity("JP", "Tokyo")];
      app.syncTabsToCities();
      app.settings.rotateSeconds = 10;
      app.armRotateTimer();
      assert.equal(app.rotateDelay, 10000);
      assert.ok(app.rotateTimer);
      await new Promise((resolve) => {
        const timer = app.rotateTimer;
        clearTimeout(timer);
        app.rotateTimer = null;
        app.nextCity();
        resolve();
      });
      assert.equal(app.currentTab().place.cityEn, "Tokyo");
      app.settings.rotateSeconds = 0;
      app.syncRotateTimer();
      assert.equal(app.rotateTimer, null, "off leaves no timer behind");
      app.settings.rotateSeconds = 30;
      app.syncRotateTimer();
      assert.equal(app.rotateDelay, 30000);
      app.doc.tabs = [app.doc.tabs[0]];
      app.syncRotateTimer();
      assert.equal(app.rotateTimer, null, "one city needs no timer");
      app.destroy();
      assert.equal(app.rotateTimer, null);
    });
  });
  h.test("add city opens the search window and a pick there joins the list", async () => {
    await withApp(async ({ app, platform }) => {
      const pending = app.showSettings("cities");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.equal(popup.querySelector('[data-panel="cities"]').hidden, false);
      assert.equal(popup.querySelector('[data-field="search"]'), null, "the search box lives in its own window");
      assert.equal(popup.querySelector('[data-field="rotateSeconds"]').closest(".popup-panel").dataset.panel, "general", "the interval sits with the general choices");
      const shown = () => [...popup.querySelectorAll('[data-row="cityList"] .city-name')].map((node) => node.textContent);
      assert.deepEqual(shown(), ["서울"]);
      popup.querySelector('[data-action="open-search"]').click();
      await settle();
      const search = document.querySelector('[data-popup="search"]');
      assert.ok(search, "add city opens the search window");
      assert.equal(search.querySelector(".popup-title").textContent, "도시 검색");
      assert.ok(search.querySelector(".popup-icon svg.ico-color"), "the title bar carries a colour magnifier");
      const box = search.querySelector('[data-field="query"]');
      assert.ok(box, "the search box is in the search window");
      assert.ok(box.placeholder, "and says what to type");
      // The box and the results start at the same edge: no label column, no row inset.
      assert.equal(search.querySelector('[data-row="query"] label'), null);
      assert.equal(getComputedStyle(search.querySelector('[data-row="query"]')).paddingLeft, "0px");
      assert.notEqual(getComputedStyle(search.querySelector('[data-row="query"]')).marginBottom, "0px", "the box stands clear of the results");
      assert.equal(getComputedStyle(search.querySelector('[data-row="cityFound"] .list-block-label')).display, "none");
      assert.equal(popupFits(search).fits, true);
      assert.ok(popupFits(search).height - popupFits(search).used < 60, "the window hugs its contents");
      const results = () => [...search.querySelectorAll(".city-name")].map((node) => node.textContent);
      assert.ok(results().length > 0, "it opens showing the catalog");
      box.value = "파리";
      search.querySelector('[data-action="city-search"]').click();
      await settle();
      assert.deepEqual(results(), ["파리"], "a Korean search names the city in Korean");
      search.querySelector('[data-action="city-use"]').click();
      await settle();
      assert.deepEqual(shown(), ["서울", "파리"]);
      search.querySelector('[data-action="city-use"]').click();
      await settle();
      assert.deepEqual(shown(), ["서울", "파리"], "the same city is not taken twice");
      assert.equal(app.statusMessage, "이미 목록에 있는 도시입니다.");
      search.querySelector('[data-action="close"]').click();
      await settle();
      assert.equal(document.querySelector('[data-popup="search"]'), null);
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.deepEqual(app.settings.cities.map((place) => place.cityEn), ["Seoul", "Paris"]);
      assert.deepEqual(app.settings.cities.map((place) => place.cityKo), ["서울", "파리"]);
      assert.deepEqual(app.doc.tabs.map((tab) => tab.place.cityEn), ["Seoul", "Paris"]);
      assert.equal(platform.settings.cities.length, 2);
    });
  });
  h.test("enter in the search window looks the city up, and a menu add goes straight in", async () => {
    await withApp(async ({ app }) => {
      // The command stays open until the window is closed, so it is not awaited here.
      const opened = app.run("add-city");
      await settle();
      const search = document.querySelector('[data-popup="search"]');
      assert.ok(search, "the menu command opens the same window");
      const box = search.querySelector('[data-field="query"]');
      box.value = "로마";
      box.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await settle();
      assert.deepEqual([...search.querySelectorAll(".city-name")].map((node) => node.textContent), ["로마"]);
      search.querySelector('[data-action="city-use"]').click();
      await settle();
      assert.deepEqual(app.doc.tabs.map((tab) => tab.place.cityEn), ["Seoul", "Rome"], "with no settings open it joins the window");
      assert.equal(app.currentTab().place.cityEn, "Rome", "and becomes the city on show");
      search.querySelector('[data-action="city-use"]').click();
      await settle();
      assert.equal(app.doc.tabs.length, 2, "the same city is not taken twice");
      assert.equal(app.statusMessage, "이미 목록에 있는 도시입니다.");
      search.querySelector('[data-action="close"]').click();
      await opened;
    });
  });
  h.test("the search reaches past the built-in list and names what it finds in either language", async () => {
    const { createMemoryPlatform, jsonResponse } = await import("../support.js");
    const platform = createMemoryPlatform();
    const asked = [];
    platform.fetchImpl = async (url) => {
      const href = String(url);
      if (!href.includes("geocoding-api")) return jsonResponse({});
      asked.push(new URL(href).searchParams.get("language"));
      const korean = new URL(href).searchParams.get("language") === "ko";
      return jsonResponse({
        results: [
          {
            id: 4242,
            name: korean ? "스프링필드" : "Springfield",
            country: korean ? "미국" : "United States",
            country_code: "us",
            latitude: 39.78,
            longitude: -89.64,
          },
        ],
      });
    };
    await withApp(
      async ({ app }) => {
        const opened = app.run("add-city");
        await settle();
        const search = document.querySelector('[data-popup="search"]');
        const names = () => [...search.querySelectorAll(".city-name")].map((node) => node.textContent);
        const look = async (text) => {
          search.querySelector('[data-field="query"]').value = text;
          search.querySelector('[data-action="city-search"]').click();
          await settle();
        };
        await look("Springfield");
        assert.deepEqual(asked, ["ko", "en"], "the geocoder is asked in both languages");
        assert.deepEqual(names(), ["스프링필드"], "a city outside the built-in list is found and named in Korean");
        await app.setLanguage("en");
        assert.deepEqual(names(), ["Springfield"], "switching the language renames what is on screen");
        await app.setLanguage("ko");
        assert.deepEqual(names(), ["스프링필드"]);
        // The built-in cities answer to either language without going anywhere.
        const before = asked.length;
        await look("파리");
        assert.ok(names().includes("파리"));
        await look("Paris");
        assert.ok(names().includes("파리"), "an English name finds the same city");
        assert.ok(asked.length > before, "and the wider world is still searched alongside");
        search.querySelector('[data-action="city-use"]').click();
        await settle();
        assert.ok(app.doc.tabs.some((tab) => tab.place.cityKo === "파리" || tab.place.cityKo === "스프링필드"));
        search.querySelector('[data-action="close"]').click();
        await opened;
      },
      { platform },
    );
  });
  h.test("a search that cannot reach the network still shows what is known here", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.fetchImpl = async () => {
      throw new Error("offline");
    };
    await withApp(
      async ({ app }) => {
        const opened = app.run("add-city");
        await settle();
        const search = document.querySelector('[data-popup="search"]');
        search.querySelector('[data-field="query"]').value = "서울";
        search.querySelector('[data-action="city-search"]').click();
        await settle();
        assert.deepEqual([...search.querySelectorAll(".city-name")].map((node) => node.textContent), ["서울"]);
        assert.equal(document.querySelector('[data-popup="error"]'), null, "no error window for a city we already know");
        search.querySelector('[data-action="close"]').click();
        await opened;
      },
      { platform },
    );
  });
  h.test("the page controls sit centred on their own line and step one page or ten", async () => {
    await withApp(async ({ app }) => {
      const opened = app.run("add-city");
      await settle();
      const search = document.querySelector('[data-popup="search"]');
      const pagerRow = search.querySelector('[data-row="cityPager"]');
      assert.ok(pagerRow, "the controls have a line of their own");
      assert.equal(getComputedStyle(pagerRow).justifyContent, "center");
      assert.equal(search.querySelector('[data-row="cityFound"] .pager'), null, "and are not inside the results");
      const body = search.querySelector(".popup-body");
      assert.equal(body.lastElementChild.querySelector("[data-pager]") ? true : body.lastElementChild.contains(pagerRow), true, "they come last, above the buttons");
      const block = search.querySelector(".list-block[data-page-count]");
      const steps = [...search.querySelectorAll(".pager-btn")].map((button) => button.dataset.page);
      assert.deepEqual(steps.slice(0, 2), ["back-span", "prev"]);
      assert.deepEqual(steps.slice(-2), ["next", "next-span"]);
      const numbers = steps.slice(2, -2).map(Number);
      assert.ok(numbers.length <= 10 && numbers.length > 1, String(numbers.length));
      assert.equal(block.dataset.pageAt, "1");
      search.querySelector('[data-page="next"]').click();
      assert.equal(block.dataset.pageAt, "2", "one page forward");
      search.querySelector('[data-page="prev"]').click();
      assert.equal(block.dataset.pageAt, "1");
      search.querySelector('[data-page="next-span"]').click();
      assert.equal(block.dataset.pageAt, String(Math.min(11, Number(block.dataset.pageCount))), "ten pages forward");
      search.querySelector('[data-page="back-span"]').click();
      assert.equal(block.dataset.pageAt, "1", "and ten back again");
      assert.equal(search.querySelector('[data-page="prev"]').disabled, true);
      search.querySelector('[data-action="close"]').click();
      await opened;
    });
  });
  h.test("the shown cities read one per line and scroll when there are many", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("cities");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const list = popup.querySelector('[data-row="cityList"] .city-list');
      assert.ok(list);
      assert.equal(getComputedStyle(list).flexDirection, "column", "one city per line");
      assert.equal(getComputedStyle(list).overflowY, "auto", "a long list scrolls");
      assert.equal(popup.querySelector('[data-row="cityList"] .pager'), null, "the shown list is not paged");
      popup.querySelector('[data-action="open-search"]').click();
      await settle();
      const search = document.querySelector('[data-popup="search"]');
      search.querySelectorAll('[data-action="city-use"]').forEach((button) => button.click());
      await settle();
      search.querySelector('[data-page="next"]').click();
      search.querySelectorAll('[data-action="city-use"]').forEach((button) => button.click());
      await settle();
      const names = [...list.querySelectorAll(".city-name")].map((node) => node.textContent);
      assert.equal(names.length, 12, "every city stays on show, scrolled rather than paged");
      assert.equal(new Set(names).size, 12, "and none of them is lost");
      assert.ok(list.querySelector(".city-row .city-country"), "each line names its country too");
      search.querySelector('[data-action="close"]').click();
      await settle();
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("the shown order is changed by dragging a city's grip, and nothing is lost on the way", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("cities");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const block = popup.querySelector('[data-row="cityList"]');
      const list = block.querySelector(".city-list");
      popup.querySelector('[data-action="open-search"]').click();
      await settle();
      const search = document.querySelector('[data-popup="search"]');
      [...search.querySelectorAll('[data-action="city-use"]')].slice(0, 6).forEach((button) => button.click());
      await settle();
      search.querySelector('[data-action="close"]').click();
      await settle();
      const shown = () => [...list.querySelectorAll(".city-name")].map((node) => node.textContent);
      const started = shown();
      assert.deepEqual(started, ["서울", "부산", "인천", "대구", "대전", "광주"]);
      const carried = () => list.querySelector("[data-dragged] .city-name")?.textContent;
      const grips = list.querySelectorAll("[data-city-grip]");
      assert.equal(grips.length, 6);
      assert.ok(grips[0].title);
      // A browser refuses to capture an unknown pointer; that must not cost us the drag.
      grips[0].setPointerCapture = () => {
        throw new Error("InvalidPointerId");
      };
      grips[0].dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
      assert.equal(block.dataset.dragging, "1");
      assert.equal(carried(), "서울", "the city being moved is marked as soon as it is picked up");
      const dropOn = (index) => list.children[index].dispatchEvent(new window.Event("pointermove", { bubbles: true }));
      dropOn(1);
      assert.equal(carried(), "서울", "it stays marked while it travels");
      dropOn(2);
      assert.deepEqual(shown(), ["부산", "인천", "서울", "대구", "대전", "광주"]);
      // Wander over every row, then back: the set of cities must come through untouched.
      for (const index of [5, 0, 3, 1, 4, 2, 0, 5]) dropOn(index);
      assert.deepEqual([...shown()].sort(), [...started].sort(), "dragging never drops a city");
      assert.equal(carried(), "서울", "and the carried one is still the one that was picked up");
      list.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
      assert.equal(block.dataset.dragging, undefined);
      assert.equal(carried(), undefined, "the mark goes when the city is put down");
      const settled = shown();
      dropOn(0);
      assert.deepEqual(shown(), settled, "no drag, no move");
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.deepEqual(
        app.doc.tabs.map((tab) => tab.place.cityKo),
        settled,
        "the window follows the order the list was left in",
      );
    });
  });
  h.test("every settings page fits its window and shares one label column", async () => {
    await withApp(async ({ app }) => {
      let tallest = 0;
      let height = 0;
      for (const tab of ["general", "cities", "data", "appearance", "wallpaper"]) {
        const pending = app.showSettings(tab);
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const fit = popupFits(popup);
        assert.equal(fit.fits, true, `${tab} overflows: ${fit.used} of ${fit.height}`);
        tallest = Math.max(tallest, fit.used);
        height = fit.height;
        const panel = popup.querySelector(`[data-panel="${tab}"]`);
        const labels = [...panel.querySelectorAll(".popup-row > label, .popup-row > span:first-child, .list-block-label")];
        for (const label of labels) {
          if (!label.textContent.trim()) continue;
          assert.equal(getComputedStyle(label).width, "150px", `${tab}: ${label.textContent}`);
        }
        popup.querySelector('[data-action="cancel"]').click();
        await pending;
      }
      assert.ok(height - tallest < 80, `the window is ${height - tallest}px taller than its longest page`);
    });
  });
  h.test("the city list and the change interval come back on the next launch", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        app.settings.cities = [findCity("KR", "Seoul"), findCity("FR", "Paris"), findCity("JP", "Tokyo")];
        app.syncTabsToCities();
        app.settings.rotateSeconds = 30;
        await app.persist();
        assert.deepEqual(platform.settings.cities.map((place) => place.cityEn), ["Seoul", "Paris", "Tokyo"]);
        assert.equal(platform.settings.rotateSeconds, 30);
      },
      { platform },
    );
    await withApp(
      async ({ app }) => {
        assert.deepEqual(app.doc.tabs.map((tab) => tab.place.cityEn), ["Seoul", "Paris", "Tokyo"], "the stored cities open again");
        assert.deepEqual(app.doc.tabs.map((tab) => tab.place.cityKo), ["서울", "파리", "도쿄"]);
        assert.equal(app.settings.rotateSeconds, 30);
        assert.equal(app.rotateArmed, 30, "and the timer is armed for them");
        assert.ok(app.rotateTimer, "with more than one city it runs");
      },
      { platform },
    );
  });
  h.test("an extra window keeps its own city list", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.settings = { cities: [findCity("KR", "Seoul"), findCity("JP", "Tokyo")] };
    platform.boot = { cityIndex: 1, primary: false };
    await withApp(
      async ({ app }) => {
        assert.equal(app.ownsCityList, false);
        assert.deepEqual(app.doc.tabs.map((tab) => tab.place.cityEn), ["Seoul", "Tokyo"]);
        assert.equal(app.currentTab().place.cityEn, "Tokyo");
        app.addTab();
        assert.equal(app.doc.tabs.length, 3);
        await app.persist();
        assert.deepEqual(platform.settings.cities.map((place) => place.cityEn), ["Seoul", "Tokyo"], "the stored list is left to the first window");
      },
      { platform },
    );
  });
  h.test("a new weather window opens on the next city", async () => {
    await withApp(async ({ app, platform }) => {
      app.settings.cities = [findCity("KR", "Seoul"), findCity("JP", "Tokyo")];
      app.syncTabsToCities();
      await app.run("new-window");
      assert.deepEqual(platform.newWindows, [{ cityIndex: 1 }]);
      app.showCity(1);
      await app.run("new-window");
      assert.deepEqual(platform.newWindows[1], { cityIndex: 0 });
      assert.deepEqual(platform.settings.cities.map((place) => place.cityEn), ["Seoul", "Tokyo"]);
    });
  });
  h.test("a window told to open on a city starts there", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.settings = { cities: [findCity("KR", "Seoul"), findCity("JP", "Tokyo"), findCity("FR", "Paris")] };
    platform.boot = { cityIndex: 2 };
    await withApp(
      async ({ app }) => {
        assert.equal(app.doc.tabs.length, 3);
        assert.equal(app.currentTab().place.cityEn, "Paris");
        assert.equal(app.root.querySelector(".scene-city").textContent, "파리");
      },
      { platform },
    );
  });
  h.test("the close button puts the window away and only exit quits", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.nativeWindow = true;
    await withApp(
      async ({ app }) => {
        app.markDirty();
        assert.equal(await app.requestClose(), "hidden");
        assert.equal(platform.commands.at(-1), "hide");
        assert.equal(platform.quit, 0);
        assert.equal(app.closed, false);
        assert.equal(document.querySelector('[data-popup="unsaved"]'), null);
        app.root.querySelector('[data-cmd="close"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        await settle();
        assert.equal(platform.commands.at(-1), "hide");
        assert.equal(platform.quit, 0);
        await app.run("exit");
        assert.equal(platform.quit, 1);
        assert.equal(app.closed, true);
      },
      { platform },
    );
  });

  h.category("Menus");
  h.test("right-clicking the window opens a single-column menu of icons and labels", async () => {
    await withApp(async ({ app }) => {
      app.root.querySelector(".shell-top").dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 30 }));
      const menu = document.querySelector('.menu-popup[data-menu="window"]');
      assert.ok(menu);
      assert.equal(menu.parentElement.id, "overlay-root");
      assert.equal(app.frame.contains(menu), false);
      assert.equal(menu.dataset.columns, "1");
      assert.equal(menu.dataset.clipped, "false");
      assert.equal(menu.style.flexDirection, "column");
      assert.equal(menu.style.columnCount, "1");
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const ids = items.map((item) => item.dataset.cmd);
      for (const id of ["refresh", "copy", "paste", "next-city", "add-city", "close-tab", "new-window", "print", "choose-wallpaper", "clear-wallpaper", "settings", "about"]) {
        assert.ok(ids.includes(id), id);
      }
      // Nothing is saved to a file and nothing is undone, so those commands are gone.
      for (const id of ["save", "save-as", "exit", "new", "open", "undo", "redo"]) {
        assert.equal(ids.includes(id), false, id);
      }
      for (const item of items) {
        const svg = item.querySelector("svg");
        assert.ok(svg, item.textContent);
        assert.ok(svg.classList.contains("ico-color"), item.dataset.cmd);
        assert.match(svg.innerHTML, /fill="#[0-9a-f]{6}"/i, item.dataset.cmd);
        assert.ok(item.querySelector(".menu-label").textContent.trim(), item.textContent);
        assert.equal(item.style.whiteSpace, "nowrap");
        assert.ok(item.title);
      }
      assert.match(menu.querySelector('[data-cmd="refresh"] svg').innerHTML, /#2f94ff/);
      assert.match(menu.querySelector('[data-cmd="settings"] svg').innerHTML, /#ffba30/);
      assert.match(menu.querySelector('[data-cmd="close-tab"] svg').innerHTML, /#e5484d/);
      assert.ok(menu.querySelectorAll('[role="separator"]').length >= 4);
      const shortcuts = [...menu.querySelectorAll(".menu-key")].filter((key) => key.textContent);
      assert.ok(shortcuts.length > 1);
      const rights = shortcuts.map((key) => key.getBoundingClientRect().right);
      for (const key of shortcuts) {
        assert.equal(key.style.marginLeft, "auto", key.textContent);
        assert.equal(key.style.textAlign, "right", key.textContent);
      }
      assert.equal(new Set(rights.map((value) => Math.round(value))).size, 1);
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert.equal(document.querySelector(".menu-popup"), null);
      const realHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 300 });
      try {
        app.openMenu("window", { clientX: 40, clientY: 250 }, { atPointer: true });
        const short = document.querySelector('.menu-popup[data-menu="window"]');
        const scale = Number(short.dataset.scale);
        assert.ok(scale > 0 && scale < 1);
        assert.equal(short.style.top, "4px");
        assert.match(short.style.transform, /^scale\(0\.\d+\)$/);
      } finally {
        Object.defineProperty(window, "innerHeight", { configurable: true, value: realHeight });
        app.closeMenu();
      }
    });
  });
  h.test("window menu commands run and no file history is offered", async () => {
    await withApp(async ({ app }) => {
      app.recent.add("C:/docs/recent.myweather");
      app.openMenu("window", { clientX: 10, clientY: 10 }, { atPointer: true });
      const menu = document.querySelector('.menu-popup[data-menu="window"]');
      assert.equal(menu.querySelector('[data-cmd="recent:0"]'), null, "recent files belong to a file app");
      menu.querySelector('[data-cmd="about"]').click();
      await settle();
      assert.ok(document.querySelector('[data-popup="about"]'));
      document.querySelector('[data-popup="about"] [data-action="close"]').click();
      await settle();
    });
  });
  h.test("context menu copies the selected day", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      const forecast = await openForecast(app, "weekly");
      const day = forecast.popup.querySelector('[data-date="2026-10-07"]');
      day.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
      const menu = document.querySelector('.menu-popup[data-menu="context"]');
      assert.ok(menu);
      assert.equal(menu.dataset.columns, "1");
      assert.equal(menu.querySelector('[data-cmd="choose-wallpaper"] .menu-label').textContent, "배경 선택");
      assert.equal(menu.querySelector('[data-cmd="clear-wallpaper"] .menu-label').textContent, "배경 삭제");
      assert.match(menu.querySelector('[data-cmd="choose-wallpaper"]').innerHTML, /fill="#2f94ff"/);
      assert.match(menu.querySelector('[data-cmd="clear-wallpaper"]').innerHTML, /fill="#e5484d"/);
      for (const item of menu.querySelectorAll('[role="menuitem"]')) {
        const svg = item.querySelector("svg");
        const label = item.querySelector(".menu-label");
        assert.ok(svg.classList.contains("ico-color"), item.dataset.cmd);
        assert.match(svg.innerHTML, /fill="#[0-9a-f]{6}"/i, item.dataset.cmd);
        assert.equal(getComputedStyle(label).overflow, "visible", label.textContent);
        assert.equal(item.style.overflow, "visible", item.dataset.cmd);
      }
      menu.querySelector('[data-cmd="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /2026-10-07/);
      platform.nextImage = { dataUrl: "data:image/png;base64,aaaa", name: "sky.png", type: "image/png", size: 120 };
      app.openMenu("context", { clientX: 20, clientY: 20 }, { atPointer: true });
      document.querySelector('.menu-popup[data-menu="context"] [data-cmd="choose-wallpaper"]').click();
      await settle();
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "yes");
      app.openMenu("context", { clientX: 20, clientY: 20 }, { atPointer: true });
      document.querySelector('.menu-popup[data-menu="context"] [data-cmd="clear-wallpaper"]').click();
      await settle();
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "no");
      forecast.popup.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 16, screenX: 400, screenY: 220 }));
      const windowMenu = document.querySelector('.menu-popup[data-menu="window"]');
      assert.ok(windowMenu);
      assert.equal(windowMenu.querySelectorAll(".ico-color").length, windowMenu.querySelectorAll('[role="menuitem"]').length);
      app.closeMenu();
      await forecast.close();
    });
  });

  h.category("Weather GUI");
  h.test("refresh aggregates sources into daily, weekly, and monthly views", async () => {
    await withApp(async ({ app }) => {
      let sawProgress = false;
      const original = app.platform.fetchImpl;
      app.platform.fetchImpl = async (url, options) => {
        sawProgress = Boolean(document.querySelector('[data-popup="progress"]'));
        return original(url, options);
      };
      await app.run("refresh");
      assert.equal(sawProgress, true);
      assert.equal(document.querySelector('[data-popup="progress"]'), null);
      assert.ok(app.progressLog.some((entry) => entry.percent === 100));
      assert.equal(app.root.querySelector("[data-gui='source']"), null);
      assert.equal(app.root.textContent.includes("종합"), false);
      assert.equal(app.root.textContent.includes("ECMWF"), false);
      const settings = app.showSettings("data");
      await settle();
      const data = document.querySelector('[data-popup="settings"]');
      assert.equal(data.querySelector('[data-row="source-ecmwf"] .source-state').textContent, "정상");
      assert.equal(data.querySelector('[data-row="source-gfs"] .source-state').textContent, "정상");
      assert.equal(data.querySelector('[data-row="source-jma"] .source-state').textContent, "실패");
      assert.equal(data.querySelector('[data-row="source-metno"] .source-state').textContent, "실패");
      const states = [...data.querySelectorAll(".source-state")];
      assert.ok(states.length >= 4);
      for (const state of states) {
        assert.equal(getComputedStyle(state).width, "72px");
        assert.equal(getComputedStyle(state).textAlign, "left");
      }
      data.querySelector('[data-action="cancel"]').click();
      await settings;
      const daily = await openForecast(app, "daily");
      assert.ok(daily.popup.querySelector("[data-hour]"));
      await daily.close();
      app.currentTab().properties.alertHigh = "15";
      const monthly = await openForecast(app, "monthly");
      assert.ok(monthly.popup.querySelector('[data-date="2026-10-09"]'));
      assert.ok(monthly.popup.querySelector(".day.is-alert"));
      await monthly.close();
    });
  });
  h.test("double-clicking a week or month day shows that day's hourly forecast", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      const weekly = await openForecast(app, "weekly");
      weekly.popup.querySelector('[data-date="2026-10-09"]').dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await settle();
      const daily = document.querySelector('[data-popup-key="forecast:daily"]');
      assert.ok(daily);
      assert.equal(daily.querySelector(".popup-when").textContent, "10월 9일");
      assert.equal(app.currentTab().selectedDate, "2026-10-09");
      const ninth = [...daily.querySelectorAll("[data-hour]")];
      assert.ok(ninth.length > 0);
      assert.ok(ninth.every((hour) => hour.dataset.hour.startsWith("2026-10-09")));
      weekly.popup.querySelector('[data-date="2026-10-08"]').dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await settle();
      assert.equal(document.querySelectorAll('[data-popup-key="forecast:daily"]').length, 1);
      const same = document.querySelector('[data-popup-key="forecast:daily"]');
      assert.equal(same.querySelector(".popup-when").textContent, "10월 8일");
      const eighth = [...same.querySelectorAll("[data-hour]")];
      assert.ok(eighth.length > 0);
      assert.ok(eighth.every((hour) => hour.dataset.hour.startsWith("2026-10-08")));
      same.querySelector('[data-action="close"]').click();
      await settle();
      await weekly.close();
      const monthly = await openForecast(app, "monthly");
      monthly.popup.querySelector('[data-date="2026-10-07"]').dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await settle();
      const fromMonth = document.querySelector('[data-popup-key="forecast:daily"]');
      assert.equal(document.querySelectorAll('[data-popup-key="forecast:daily"]').length, 1);
      const seventh = [...fromMonth.querySelectorAll("[data-hour]")];
      assert.ok(seventh.length > 0);
      assert.ok(seventh.every((hour) => hour.dataset.hour.startsWith("2026-10-07")));
      fromMonth.querySelector('[data-action="close"]').click();
      await settle();
      await monthly.close();
    });
  });
  h.test("choosing a month day updates the open daily and weekly forecasts", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      const dailyPending = app.run("daily");
      await settle();
      const weeklyPending = app.run("weekly");
      await settle();
      const monthlyPending = app.run("monthly");
      await settle();
      const daily = document.querySelector('[data-popup-key="forecast:daily"]');
      const weekly = document.querySelector('[data-popup-key="forecast:weekly"]');
      const monthly = document.querySelector('[data-popup-key="forecast:monthly"]');
      assert.equal(daily.querySelector(".popup-when").textContent, "10월 7일");
      assert.equal(weekly.querySelector(".popup-when").textContent, "10월 4일 – 10월 10일");
      monthly.querySelector('[data-date="2026-10-09"]').click();
      await settle();
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      assert.equal(daily.querySelector(".popup-when").textContent, "10월 9일");
      assert.ok([...daily.querySelectorAll("[data-hour]")].every((hour) => hour.dataset.hour.startsWith("2026-10-09")));
      assert.equal(weekly.querySelector('[data-date="2026-10-09"]').classList.contains("is-selected"), true);
      monthly.querySelector('[data-date="2026-10-11"]').click();
      await settle();
      assert.equal(daily.querySelector(".popup-when").textContent, "10월 11일");
      assert.equal(daily.querySelector("[data-hour]"), null);
      assert.equal(weekly.querySelector(".popup-when").textContent, "10월 11일 – 10월 17일");
      assert.equal(weekly.querySelector('[data-date="2026-10-11"]').classList.contains("is-selected"), true);
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      app.root.querySelector("[data-cmd='daily']").click();
      await settle();
      assert.equal(daily.querySelector(".popup-when").textContent, "10월 7일");
      assert.ok([...daily.querySelectorAll("[data-hour]")].every((hour) => hour.dataset.hour.startsWith("2026-10-07")));
      app.root.querySelector("[data-cmd='weekly']").click();
      await settle();
      assert.equal(weekly.querySelector(".popup-when").textContent, "10월 4일 – 10월 10일");
      for (const popup of [daily, weekly, monthly]) popup.querySelector('[data-action="close"]').click();
      await Promise.all([dailyPending, weeklyPending, monthlyPending]);
    });
  });
  h.test("daily hours, the week, and the month are arranged instead of listed", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      const daily = await openForecast(app, "daily");
      const bands = [...daily.popup.querySelectorAll("[data-band]")].map((band) => band.dataset.band);
      assert.deepEqual(bands, ["night", "morning", "afternoon", "evening"]);
      assert.equal(daily.popup.querySelectorAll(".hour-band .hour").length, 24);
      assert.equal(daily.popup.querySelector('[data-band="night"] .hour').textContent.includes("0시"), true);
      assert.match(daily.popup.querySelector('[data-hour="2026-10-07T00:00"]').textContent, /0시/);
      assert.match(daily.popup.querySelector('[data-hour="2026-10-07T12:00"]').textContent, /12시/);
      assert.equal(getComputedStyle(daily.popup.querySelector(".hour-band")).display, "grid");
      const hour = daily.popup.querySelector(".hour");
      assert.equal(getComputedStyle(hour).borderTopWidth, "0px");
      assert.equal(getComputedStyle(hour).borderLeftWidth, "0px");
      const raised = [...document.styleSheets[0].cssRules].find((rule) => rule.selectorText === ".hour:hover, .day:hover, .hour:focus-visible, .day:focus-visible");
      assert.match(raised.cssText, /translateY\(-2px\)/);
      assert.match(raised.cssText, /14px/);
      await daily.close();

      const weekly = await openForecast(app, "weekly");
      const week = [...weekly.popup.querySelectorAll('[data-gui="week"] [data-date]')];
      assert.deepEqual(
        week.map((day) => day.dataset.date),
        ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"],
      );
      assert.deepEqual(
        week.map((day) => day.querySelector(".weekday").textContent),
        ["일", "월", "화", "수", "목", "금", "토"],
      );
      assert.equal(week[3].classList.contains("is-selected"), true);
      assert.equal(getComputedStyle(weekly.popup.querySelector('[data-gui="week"]')).display, "grid");
      assert.equal(getComputedStyle(week[3]).borderTopWidth, "0px");
      assert.match(weekly.popup.textContent, /10월 4일/);
      await weekly.close();

      const monthly = await openForecast(app, "monthly");
      const month = monthly.popup.querySelector('[data-gui="month"]');
      assert.deepEqual(
        [...month.querySelectorAll(".month-head")].map((head) => head.textContent),
        ["일", "월", "화", "수", "목", "금", "토"],
      );
      const cells = [...month.children].filter((node) => node.classList.contains("day"));
      assert.equal(cells[0].dataset.date, undefined);
      assert.equal(cells[0].textContent, "27");
      assert.equal(cells[0].classList.contains("is-outside"), true);
      assert.equal(getComputedStyle(cells[0]).borderTopWidth, "0px");
      assert.equal(month.querySelector('[data-date="2026-10-01"]').classList.contains("is-outside"), false);
      assert.ok(month.querySelector('[data-date="2026-10-31"]'));
      assert.equal(month.querySelector('[data-date="2026-10-07"]').classList.contains("is-today"), true);
      assert.match(monthly.popup.textContent, /2026년 10월/);
      await monthly.close();

      await app.setLanguage("en");
      const dailyEn = await openForecast(app, "daily");
      assert.match(dailyEn.popup.querySelector('[data-band="morning"]').textContent, /Morning/);
      assert.equal(dailyEn.popup.querySelector(".popup-when").textContent, "October 7");
      await dailyEn.close();
      const weeklyEn = await openForecast(app, "weekly");
      assert.equal(weeklyEn.popup.querySelector('[data-gui="week"] .weekday').textContent, "Sun");
      assert.equal(weeklyEn.popup.querySelector(".popup-when").textContent, "Oct 4 – Oct 10");
      await weeklyEn.close();
      const monthlyEn = await openForecast(app, "monthly");
      assert.match(monthlyEn.popup.textContent, /October 2026/);
      assert.equal(monthlyEn.popup.querySelector(".popup-when").textContent, "October 2026");
      await monthlyEn.close();
    });
  });
  h.test("failed sources show a copyable error popup", async () => {
    await withApp(async ({ app, platform }) => {
      platform.fetchImpl = async () => jsonResponse({ reason: "offline" }, false, 500);
      await app.run("refresh");
      const popup = document.querySelector('[data-popup="error"]');
      assert.ok(popup);
      assert.match(popup.textContent, /All weather sources failed|WEATHER_ALL_FAILED|ecmwf/);
      assert.equal(popup.style.overflow, "hidden");
      assert.equal(popupFits(popup).fits, true);
      popup.querySelector('[data-action="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /HTTP 500/);
    });
  });
  h.test("online search, download, and source link show progress", async () => {
    await withApp(async ({ app, platform }) => {
      platform.fetchImpl = async (url) => {
        if (String(url).includes("geocoding-api")) {
          return jsonResponse({ results: [{ name: "Osaka", country: "Japan", country_code: "JP", latitude: 34.6, longitude: 135.5 }] });
        }
        return jsonResponse({ results: [] });
      };
      app.searchQuery = "Osaka";
      await app.searchOnline();
      assert.equal(app.locationDraft.cityEn, "Osaka");
      assert.equal(app.locationDraft.lat, 34.6);
      app.currentTab().weather = { daily: [], hourly: [], sources: [], fetchedAt: "2026-10-07T00:00:00.000Z" };
      app.currentTab().weather.daily = [{ date: "2026-10-07", tempMax: 20, tempMin: 10, precip: 0, wind: 1, code: 0, bySource: {} }];
      platform.nextSavePath = "C:/docs/osaka.json";
      let duringDownload = false;
      const saveFile = platform.saveFile.bind(platform);
      platform.saveFile = async (opts) => {
        duringDownload = Boolean(document.querySelector('[data-popup="progress"]'));
        return saveFile(opts);
      };
      await app.downloadWeather();
      assert.equal(duringDownload, true);
      assert.match(platform.files.get("C:/docs/osaka.json"), /2026-10-07/);
      await app.openSourceLink();
      assert.match(platform.external[0], /open-meteo.com/);
    });
  });
  h.test("location edits support undo and redo", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      popup.querySelector('[data-field="cityEn"]').value = "Busan";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.currentTab().place.cityEn, "Busan");
      app.undo();
      assert.equal(app.currentTab().place.cityEn, "Seoul");
      app.redo();
      assert.equal(app.currentTab().place.cityEn, "Busan");
      assert.equal(app.root.querySelector("#prop-note"), null);
    });
  });

  h.category("Clipboard");
  h.test("ctrl+c and ctrl+v copy and paste the selection", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      app.selectDate("2026-10-07");
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
      await settle();
      assert.match(platform.clipboardText, /서울/);
      assert.match(platform.clipboardText, /2026-10-07/);
      assert.equal(app.root.querySelector("#prop-note"), null);
      platform.clipboardText = "pasted note";
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));
      await settle();
      assert.equal(app.doc.dirty, false);
      assert.equal(JSON.stringify(app.doc).includes("pasted note"), false);
    });
  });

  h.category("Files");
  h.test("open and save remember the directory and recent files", async () => {
    await withApp(async ({ app, platform }) => {
      const text = serializeDocument(app.doc);
      platform.nextOpen = { path: "D:/weather/a.myweather", directory: "D:/weather", text };
      await app.open();
      assert.equal(app.doc.filePath, "D:/weather/a.myweather");
      assert.equal(app.settings.lastDirectory, "D:/weather");
      assert.equal(platform.lastStartDir, "");
      platform.nextSavePath = "D:/other/b.myweather";
      app.markDirty();
      await app.saveAs();
      assert.equal(app.settings.lastDirectory, "D:/other");
      assert.equal(app.doc.dirty, false);
      platform.nextOpen = { path: "D:/other/c.myweather", directory: "D:/other", text };
      await app.open();
      assert.equal(platform.lastStartDir, "D:/other");
      assert.equal(app.recent.items[0], "D:/other/c.myweather");
    });
  });
  h.test("recent files stop at ten and can be removed one by one or all at once", async () => {
    await withApp(async ({ app }) => {
      for (let index = 0; index < 12; index += 1) app.recent.add(`C:/docs/file-${index}.myweather`);
      assert.equal(app.recent.items.length, 10);
      app.removeRecent(app.recent.items[0]);
      assert.equal(app.recent.items.length, 9);
      app.clearRecent();
      assert.equal(app.recent.items.length, 0);
      app.undo();
      assert.equal(app.recent.items.length, 9);
    });
  });
  h.test("invalid files and missing recent files show a specific error", async () => {
    await withApp(async ({ app, platform }) => {
      platform.nextOpen = { path: "C:/bad.myweather", directory: "C:/", text: "{not json" };
      await app.open();
      let popup = document.querySelector('[data-popup="error"]');
      assert.match(popup.textContent, /Invalid document/);
      popup.querySelector('[data-action="close"]').click();
      app.recent.add("C:/missing.myweather");
      await app.openRecent(0);
      await settle();
      popup = document.querySelector('[data-popup="error"]');
      assert.match(popup.textContent, /찾을 수 없습니다|ENOENT/);
      popup.querySelector('[data-action="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /ENOENT|missing/);
    });
  });
  h.test("external drops open documents and accept any image size", async () => {
    await withApp(async ({ app }) => {
      const text = serializeDocument(app.doc);
      const doc = new window.File([text], "dropped.myweather", { type: "application/json" });
      await app.handleDroppedFiles([doc]);
      assert.equal(app.doc.filePath, "dropped.myweather");
      const image = new window.File([Uint8Array.from([1, 2, 3, 4])], "wall.png", { type: "image/png" });
      Object.defineProperty(image, "size", { value: 50_000_000 });
      await app.handleDroppedFiles([image]);
      assert.equal(app.wallpaper.dataset.image, "yes");
      assert.match(app.settings.backgroundImage, /^data:image\/png/);
      const unknown = new window.File(["hello"], "notes.txt", { type: "text/plain" });
      await app.handleDroppedFiles([unknown]);
      assert.match(document.querySelector('[data-popup="error"]').textContent, /notes\.txt/);
    });
  });
  h.test("settings and the last directory are restored on the next launch", async () => {
    await withApp(async ({ app, platform }) => {
      await app.setTheme("dark-midnight");
      await app.setTransparency(55);
      await app.setLanguage("en");
      app.rememberDir("E:/maps");
      await app.persist();
      const root = document.createElement("div");
      document.body.appendChild(root);
      const { createApp } = await import("../../src/app.js");
      const next = createApp(root, { platform, autoLoad: false, now: () => new Date(2026, 9, 7, 9, 0, 0) });
      await next.ready;
      try {
        assert.equal(next.settings.theme, "dark-midnight");
        assert.equal(next.frame.dataset.theme, "dark-midnight");
        assert.equal(next.settings.transparency, 55);
        assert.equal(next.settings.language, "en");
        assert.equal(next.settings.lastDirectory, "E:/maps");
        assert.equal(next.root.querySelector("[data-cmd='daily']").title, "Daily forecast");
      } finally {
        next.destroy();
        root.remove();
      }
    });
  });

  h.category("Settings");
  h.test("settings cover language, theme, font, units, and transparency", async () => {
    await withApp(async ({ app }) => {
      const fonts = Array.from({ length: 50 }, (_, index) => `Family ${index}`);
      app.fonts = fonts;
      const pending = app.showSettings("font");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.equal(popup.style.overflow, "hidden");
      assert.equal(popup.style.resize, "none");
      assert.equal(app.frame.contains(popup), false);
      for (const row of popup.querySelectorAll(".popup-row")) {
        assert.equal(row.style.whiteSpace, "nowrap");
        assert.equal(row.querySelectorAll("br").length, 0);
      }
      assert.equal(popup.querySelector('[data-field="fontFamily"]').options.length, 50);
      // The font is a single choice now: no size, no style.
      assert.equal(popup.querySelector('[data-field="fontSize"]'), null);
      assert.equal(popup.querySelector('[data-field="fontStyle"]'), null);
      assert.equal(popup.querySelector("[data-style]"), null);
      const sample = popup.querySelector("[data-font-sample]");
      assert.ok(sample && sample.textContent.trim(), "a sample shows the chosen font");
      assert.equal(getComputedStyle(sample).justifyContent, "center", "and is centred");
      popup.querySelector('[data-field="fontFamily"]').value = "Family 3";
      popup.querySelector('[data-field="fontFamily"]').dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.match(sample.style.fontFamily, /Family 3/, "the sample wears it");
      assert.equal(popup.style.fontSize, "", "the dialog keeps its own size");
      const korean = popup.querySelector('[data-choice="language"][data-value="ko"]');
      const englishButton = popup.querySelector('[data-choice="language"][data-value="en"]');
      assert.equal(korean.querySelector("span").textContent, "한국어");
      assert.ok(korean.querySelector(".flag-kr"));
      assert.equal(englishButton.querySelector("span").textContent, "English");
      assert.ok(englishButton.querySelector(".flag-gb"));
      assert.equal(korean.getAttribute("aria-pressed"), "true");
      englishButton.click();
      assert.equal(popup.querySelector('[data-field="language"]').value, "en");
      assert.equal(englishButton.getAttribute("aria-pressed"), "true");
      assert.equal(korean.getAttribute("aria-pressed"), "false");
      popup.querySelector('.swatch[data-theme-id="dark-forest"]').click();
      popup.querySelector('[data-field="units"]').value = "F";
      popup.querySelector('[data-field="transparency"]').value = "80";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.fontFamily, "Family 3");
      assert.match(app.frame.style.fontFamily, /Family 3/, "only the window takes the font");
      assert.equal(app.settings.language, "en");
      assert.equal(app.frame.dataset.theme, "dark-forest");
      assert.equal(app.settings.units, "F");
      assert.equal(app.settings.transparency, 80);
      assert.equal(app.settings.updateHours, 1);
      assert.equal(app.i18n.missing.size, 0);
      const again = app.showSettings("font");
      await settle();
      const english = document.querySelector('[data-popup="settings"]');
      assert.deepEqual([...english.querySelectorAll(".popup-tab")].map((button) => button.textContent), ["General", "Cities", "Sources", "Appearance", "Image & font"]);
      assert.equal(english.querySelector('[data-panel="wallpaper"]').hidden, false);
      assert.ok(english.querySelector('[data-field="fontFamily"]'));
      english.querySelector('[data-action="cancel"]').click();
      await again;
      app.undo();
      assert.equal(app.settings.theme, "dark-ink");
      assert.equal(app.settings.transparency, 30);
    });
  });
  h.test("appearance offers 20 light themes, 20 dark themes, and a custom theme", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("appearance");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const popupNut = popup.querySelector(".popup-icon svg");
      assert.equal(popupNut.innerHTML, app.root.querySelector('[data-cmd="settings"] svg').innerHTML);
      assert.match(popupNut.innerHTML, /fill-rule="evenodd"/);
      assert.equal(getComputedStyle(popupNut).width, "22px");
      assert.equal(LIGHT_THEMES.length, 20);
      assert.equal(DARK_THEMES.length, 20);
      const light = popup.querySelectorAll('[data-theme-group="light"] .swatch');
      const dark = popup.querySelectorAll('[data-theme-group="dark"] .swatch');
      assert.equal(light.length, 20);
      assert.equal(dark.length, 20);
      assert.equal(new Set([...light, ...dark].map((swatch) => swatch.dataset.themeId)).size, 40);
      for (const swatch of [...light, ...dark]) {
        const name = swatch.querySelector(".swatch-name");
        const accent = swatch.querySelector(".chip i");
        assert.ok(swatch.title && accent && name.textContent, swatch.dataset.themeId);
        assert.equal(swatch.querySelector(".chip").contains(name), true);
        // The accent runs the width of the swatch instead of sitting in a corner as a dot.
        const band = getComputedStyle(accent);
        assert.equal(band.left, "0px", swatch.dataset.themeId);
        assert.equal(band.right, "0px", swatch.dataset.themeId);
        assert.equal(band.bottom, "0px", swatch.dataset.themeId);
        assert.equal(parseFloat(band.borderRadius) || 0, 0, swatch.dataset.themeId);
        assert.equal(band.width, "", "the band is stretched by its edges, not given a width");
      }
      const modes = [...popup.querySelectorAll("[data-theme-mode]")].map((button) => button.dataset.themeMode);
      assert.deepEqual(modes, ["light", "dark", "custom"]);
      assert.equal(popup.querySelector('[data-theme-mode="dark"]').getAttribute("aria-pressed"), "true");
      assert.equal(popup.querySelector('[data-theme-group="light"]').hidden, true);
      assert.equal(popup.querySelector('.swatch[data-theme-id="dark-ink"]').getAttribute("aria-pressed"), "true");
      const close = popup.querySelector('[data-gui="popup-close"]');
      assert.ok(close.classList.contains("win-close"));
      assert.equal(close.title, "닫기");
      assert.equal(close.getAttribute("aria-label"), "닫기");
      assert.ok(close.querySelector("svg.ico"));
      assert.equal(getComputedStyle(close).flexShrink, "0");
      const hover = [...document.styleSheets[0].cssRules].find((rule) => rule.selectorText === ".popup-x:hover, .popup-x:focus-visible");
      assert.equal(hover.style.background, "#e5484d");
      assert.equal(hover.style.color, "#fff");
      assert.equal(popup.style.height, "600px");
      assert.equal(getComputedStyle(popup.querySelector(".popup-body")).paddingTop, "16px");
      assert.equal(getComputedStyle(popup.querySelector(".popup-body")).paddingBottom, "16px");
      assert.equal(getComputedStyle(popup.querySelector('[data-panel="appearance"]')).gap, "10px");
      assert.equal(popupFits(popup).fits, true);
      popup.querySelector('[data-theme-mode="light"]').click();
      assert.equal(popup.querySelector('[data-theme-group="light"]').hidden, false);
      assert.equal(popup.querySelector('[data-theme-group="dark"]').hidden, true);
      popup.querySelector('[data-theme-mode="custom"]').click();
      assert.equal(popup.querySelector('[data-theme-group="custom"]').hidden, false);
      for (const field of ["customMode", "customBg", "customText", "customAccent"]) assert.ok(popup.querySelector(`[data-field="${field}"]`), field);
      assert.equal(popupFits(popup).fits, true);
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("a theme change is sent to windows that are already open", async () => {
    await withApp(async ({ app, platform }) => {
      const sent = [];
      platform.broadcastTheme = (payload) => sent.push(payload);
      const pending = app.showForecast("daily");
      await settle();
      await app.setTheme("light-sakura");
      assert.equal(document.querySelector("[data-popup='forecast']") != null, true);
      assert.equal(document.documentElement.style.getPropertyValue("--bg-solid"), "#fff0f5");
      assert.equal(sent.at(-1).mode, "light");
      assert.equal(sent.at(-1).theme, "light-sakura");
      assert.equal(sent.at(-1).vars["--bg-solid"], "#fff0f5");
      assert.equal(sent.at(-1).vars["--fg"], "#4a2740");
      document.querySelector("[data-popup='forecast'] [data-action='close']").click();
      await pending;
    });
  });
  h.test("choosing a theme updates every open window immediately", async () => {
    await withApp(async ({ app, platform }) => {
      const sent = [];
      platform.broadcastTheme = (payload) => sent.push(payload);
      const forecast = app.showForecast("daily");
      await settle();
      const pending = app.showSettings("appearance");
      await settle();
      const settings = document.querySelector('[data-popup="settings"]');
      settings.querySelector('[data-theme-mode="light"]').click();
      settings.querySelector('.swatch[data-theme-id="light-sakura"]').click();
      await settle();
      const daily = document.querySelector('[data-popup="forecast"]');
      assert.equal(sent.at(-1).theme, "light-sakura");
      assert.equal(sent.at(-1).vars["--bg-solid"], "#fff0f5");
      assert.equal(daily.dataset.theme, "light-sakura");
      assert.equal(daily.style.getPropertyValue("--bg-solid"), "#fff0f5");
      assert.equal(daily.style.getPropertyValue("--fg"), "#4a2740");
      assert.equal(settings.dataset.theme, "light-sakura");
      assert.equal(settings.style.getPropertyValue("--bg-solid"), "#fff0f5");
      assert.equal(settings.style.getPropertyValue("--bg"), "rgba(255, 240, 245, 1)");
      assert.equal(daily.style.getPropertyValue("--bg"), "rgba(255, 240, 245, 0.775)");
      assert.equal(app.settings.theme, "dark-ink");
      const weekly = app.showForecast("weekly");
      await settle();
      const next = [...document.querySelectorAll('[data-popup="forecast"]')].find((popup) => popup.querySelector('[data-range="weekly"], [data-gui="forecast"][data-range="weekly"]'));
      const opened = document.querySelector('[data-range="weekly"]')?.closest("[data-popup]") || next;
      assert.equal(opened.dataset.theme, "light-sakura");
      settings.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(daily.dataset.theme, "dark-ink");
      assert.equal(opened.dataset.theme, "dark-ink");
      assert.equal(app.settings.theme, "dark-ink");
      opened.querySelector("[data-action='close']").click();
      daily.querySelector("[data-action='close']").click();
      await forecast;
      await weekly;
    });
  });
  h.test("theme and transparency preview live and revert on cancel", async () => {
    await withApp(async ({ app }) => {
      const root = document.documentElement;
      const pending = app.showSettings("appearance");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      popup.querySelector('[data-theme-mode="light"]').click();
      popup.querySelector('.swatch[data-theme-id="light-sakura"]').click();
      await settle();
      assert.equal(app.frame.dataset.theme, "light-sakura");
      assert.equal(app.frame.dataset.mode, "light");
      assert.equal(root.style.getPropertyValue("--bg-solid"), "#fff0f5");
      const slider = popup.querySelector('[data-field="transparency"]');
      const control = popup.querySelector('[data-row="transparency"] .range-control');
      const steps = [...control.querySelectorAll(".step-btn")];
      assert.equal(steps.map((button) => button.dataset.step).join(","), "-5,5");
      assert.deepEqual(steps.map((button) => button.title), ["감소", "증가"]);
      assert.equal(steps[0].nextElementSibling.textContent, "0");
      assert.equal(steps[0].nextElementSibling.nextElementSibling, slider);
      assert.equal(slider.nextElementSibling.textContent, "100");
      assert.equal(slider.nextElementSibling.nextElementSibling, steps[1]);
      assert.equal(slider.min, "0");
      assert.equal(slider.max, "100");
      slider.value = "0";
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
      await settle();
      assert.equal(popup.querySelector('[data-out="transparency"]').textContent, "0%");
      assert.equal(root.style.getPropertyValue("--bg"), "rgba(255, 240, 245, 1)");
      slider.value = "100";
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
      await settle();
      assert.equal(popup.querySelector('[data-out="transparency"]').textContent, "100%");
      assert.equal(root.style.getPropertyValue("--bg"), "rgba(255, 240, 245, 0.25)");
      assert.equal(root.style.getPropertyValue("--fg"), "#4a2740");
      popup.querySelector('[data-step="-5"]').click();
      assert.equal(slider.value, "95");
      assert.equal(app.settings.theme, "dark-ink");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.frame.dataset.theme, "dark-ink");
      assert.equal(root.style.getPropertyValue("--bg"), "rgba(20, 24, 31, 0.775)");
    });
  });
  h.test("closing the settings with the X keeps nothing, like cancel", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      const start = { units: app.settings.units, theme: app.settings.theme };
      for (const [button, kept] of [["ok", true], ["cancel", false], ["close", false]]) {
        app.settings.units = start.units;
        app.settings.theme = start.theme;
        app.applyAll();
        await app.persist();
        const pending = app.showSettings("general");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const units = popup.querySelector('[data-field="units"]');
        units.value = "F";
        units.dispatchEvent(new window.Event("change", { bubbles: true }));
        await settle();
        // Whatever the button, the change shows the moment it is made.
        assert.match(app.root.querySelector(".scene-temp").textContent, /°F/, `${button}: shown at once`);
        assert.equal(app.settings.units, "C", `${button}: nothing saved yet`);
        popup.querySelector(`[data-action="${button}"]`).click();
        await pending;
        await settle();
        assert.equal(app.settings.units, kept ? "F" : "C", `${button}: ${kept ? "kept" : "put back"}`);
        assert.match(app.root.querySelector(".scene-temp").textContent, kept ? /°F/ : /°C/, `${button}: the window agrees`);
        assert.equal(platform.settings.units, kept ? "F" : "C", `${button}: and so does the saved copy`);
      }
    });
  });
  h.test("a settings change appears immediately and cancel puts it back", async () => {
    await withApp(async ({ app }) => {
      const day = {
        date: "2026-10-07",
        tempMin: 10,
        tempMax: 21,
        precip: 0,
        wind: 1,
        humidity: 50,
        code: 1,
        bySource: { ecmwf: { tempMin: 8, tempMax: 20, precip: 0, wind: 1, humidity: 40, code: 0 } },
      };
      const hour = {
        time: "2026-10-07T09:00",
        temp: 15,
        precip: 0,
        wind: 1,
        humidity: 50,
        code: 1,
        bySource: { ecmwf: { temp: 18, precip: 0, wind: 1, humidity: 40, code: 0 } },
      };
      app.currentTab().weather = { daily: [day], hourly: [hour], sources: [] };
      app.currentTab().selectedDate = "2026-10-07";
      app.renderWeather();
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      popup.querySelector('[data-choice="language"][data-value="en"]').click();
      await settle();
      assert.equal(app.root.querySelector('[data-cmd="settings"]').title, "Settings");
      assert.equal(popup.querySelector(".popup-title").textContent, "Settings");
      assert.equal(popup.querySelector('[data-field="units"] option[value="C"]').textContent, "Celsius");
      assert.equal(app.settings.language, "ko");
      const family = popup.querySelector('[data-field="fontFamily"]');
      family.value = "Consolas";
      family.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.match(app.frame.style.fontFamily, /Consolas/, "the window shows it at once");
      assert.equal(popup.style.fontSize, "", "the dialog is not resized by it");
      assert.equal(app.settings.fontFamily, "Segoe UI", "and nothing is saved until OK");
      const units = popup.querySelector('[data-field="units"]');
      units.value = "F";
      units.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.match(app.root.querySelector(".scene-temp").textContent, /°F/);
      assert.equal(app.settings.units, "C");
      const priority = popup.querySelector('[data-field="displayPriority"]');
      priority.value = "ecmwf";
      priority.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.match(app.root.querySelector(".scene-temp").textContent, /64°F/);
      const city = popup.querySelector('[data-field="cityEn"]');
      const other = [...city.options].find((option) => option.value !== city.value);
      city.value = other.value;
      city.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(app.root.querySelector(".scene-city").textContent, other.textContent);
      assert.equal(app.currentTab().place.cityEn, "Seoul");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.settings.language, "ko");
      assert.equal(app.settings.units, "C");
      assert.equal(app.root.querySelector('[data-cmd="settings"]').title, "설정");
      assert.match(app.root.querySelector(".scene-temp").textContent, /15°C/);
      assert.equal(app.root.querySelector(".scene-city").textContent, "서울");
    });
  });
  h.test("a custom theme uses the chosen colours and is saved", async () => {
    await withApp(async ({ app, platform }) => {
      const pending = app.showSettings("appearance");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      popup.querySelector('[data-theme-mode="custom"]').click();
      const bg = popup.querySelector('[data-field="customBg"]');
      bg.value = "#203040";
      bg.dispatchEvent(new window.Event("input", { bubbles: true }));
      await settle();
      assert.equal(app.frame.dataset.theme, "custom");
      assert.equal(popup.querySelector('.swatch[data-theme-id="custom"]').getAttribute("aria-pressed"), "true");
      const accent = popup.querySelector('[data-field="customAccent"]');
      accent.value = "#ff8800";
      accent.dispatchEvent(new window.Event("input", { bubbles: true }));
      const mode = popup.querySelector('[data-field="customMode"]');
      mode.value = "light";
      mode.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(document.documentElement.style.getPropertyValue("--accent"), "#ff8800");
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.theme, "custom");
      assert.deepEqual(app.settings.customTheme, { mode: "light", bg: "#203040", text: "#eef6ff", accent: "#ff8800" });
      assert.equal(app.frame.dataset.mode, "light");
      assert.equal(platform.settings.customTheme.accent, "#ff8800");
    });
  });
  h.test("every theme can be selected", async () => {
    await withApp(async ({ app }) => {
      for (const theme of [...THEMES, { id: "custom" }]) {
        await app.setTheme(theme.id);
        assert.equal(app.frame.dataset.theme, theme.id);
        assert.ok(document.documentElement.style.getPropertyValue("--bg"), theme.id);
      }
    });
  });
  h.test("transparency changes only the background, never the text", async () => {
    await withApp(async ({ app }) => {
      const root = document.documentElement;
      await app.setTransparency(0);
      assert.equal(root.style.getPropertyValue("--bg"), "rgba(20, 24, 31, 1)");
      await app.setTransparency(100);
      assert.equal(root.style.getPropertyValue("--bg"), "rgba(20, 24, 31, 0.25)");
      assert.equal(root.style.getPropertyValue("--fg"), "#eef2f8");
      assert.equal(app.frame.style.opacity, "");
      assert.equal(app.shell.style.opacity, "");
      app.undo();
      assert.equal(app.settings.transparency, 0);
      app.redo();
      assert.equal(app.settings.transparency, 100);
    });
  });
  h.test("the weather update interval is saved and used in the background", async () => {
    await withApp(async ({ app, platform }) => {
      assert.equal(app.settings.updateHours, 1);
      assert.equal(app.updateDelay, 60 * 60 * 1000);
      let calls = 0;
      const original = platform.fetchImpl;
      platform.fetchImpl = async (url, options) => {
        calls += 1;
        return original(url, options);
      };
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const field = popup.querySelector('[data-field="updateHours"]');
      assert.deepEqual([...field.options].map((option) => option.value), ["1", "2", "4", "6", "12", "24"]);
      assert.equal(field.selectedOptions[0].textContent, "1시간");
      field.value = "6";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.updateHours, 6);
      assert.equal(platform.settings.updateHours, 6);
      assert.equal(app.updateDelay, 6 * 60 * 60 * 1000);
      const host = document.createElement("div");
      const next = createApp(host, {
        platform,
        autoLoad: false,
        now: () => new Date(2026, 9, 7, 9, 0, 0),
      });
      try {
        await next.ready;
        assert.equal(next.settings.updateHours, 6);
      } finally {
        next.destroy();
        host.remove();
      }
      app.updateIntervalMs = () => 20;
      const before = calls;
      app.armUpdateTimer();
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.ok(calls > before);
      assert.equal(document.querySelector('[data-popup="progress"]'), null);
      assert.ok(app.currentTab().weather.fetchedAt);
    });
  });

  h.test("the sources page shows where weather is fetched and saves the choice", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("data");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const panel = popup.querySelector('[data-panel="data"]');
      assert.equal(panel.hidden, false);
      assert.equal(panel.querySelector('[data-row="sources"] span').textContent, "날씨 정보를 가져올 출처");
      assert.match(popup.querySelector('[data-tab="data"]').textContent, /날씨 출처/);
      for (const id of ["ecmwf", "gfs", "jma", "metno", "wttr"]) {
        const box = panel.querySelector(`[data-source="${id}"]`);
        assert.equal(box.type, "checkbox");
        assert.equal(box.checked, true);
        assert.ok(box.closest(".source-row").querySelector(".source-detail").textContent.trim());
      }
      panel.querySelector('[data-source="wttr"]').click();
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.enabledSources.includes("wttr"), false);
      assert.deepEqual(app.settings.enabledSources, ["ecmwf", "gfs", "jma", "metno"]);
    });
  });

  h.test("settings reset restores the original values after confirmation", async () => {
    await withApp(async ({ app }) => {
      app.settings.language = "en";
      app.settings.dateFormat = "iso";
      app.settings.theme = "light-paper";
      app.settings.transparency = 80;
      app.settings.backgroundOpacity = 10;
      app.settings.updateHours = 12;
      app.settings.displayPriority = "ecmwf";
      app.settings.enabledSources = ["gfs"];
      app.settings.openAtLogin = true;
      app.settings.windowPosition = { x: 40, y: 18 };
      app.recent.add("C:/weather/keep.myweather");
      await app.setWallpaper("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", "kept.svg");
      const keptRecent = app.recent.toJSON();
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const reset = popup.querySelector('[data-action="reset"]');
      assert.equal(reset.querySelector(".menu-label").textContent, "초기화");
      assert.match(reset.title, /처음 값/);
      reset.click();
      await settle();
      assert.equal(popup.isConnected, true);
      assert.equal(popup.querySelector('[data-field="language"]').value, "ko");
      assert.equal(popup.querySelector('[data-field="dateFormat"]').value, "long");
      assert.equal(popup.querySelector('[data-field="theme"]').value, "dark-ink");
      assert.equal(popup.querySelector('[data-field="transparency"]').value, "30");
      assert.equal(popup.querySelector('[data-field="backgroundOpacity"]').value, "40");
      assert.equal(popup.querySelector('[data-field="updateHours"]').value, "1");
      assert.equal(popup.querySelector('[data-field="displayPriority"]').value, "average");
      assert.equal(popup.querySelector('[data-field="openAtLogin"]').checked, false);
      assert.equal(popup.querySelector('[data-field="countryCode"]').value, "KR");
      assert.equal(popup.querySelector('[data-field="cityEn"]').value, "Seoul");
      assert.equal(popup.querySelector('[data-source="ecmwf"]').checked, true);
      assert.equal(popup.querySelector('[data-row="wallpaper"] span:last-child').textContent, "—");
      assert.equal(app.wallpaper.dataset.image, "no");
      assert.equal(app.settings.language, "en");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.settings.language, "en");
      assert.equal(app.settings.dateFormat, "iso");
      assert.equal(app.settings.theme, "light-paper");
      assert.equal(app.settings.backgroundName, "kept.svg");
      assert.equal(app.wallpaper.dataset.image, "yes");
      const again = app.showSettings("general");
      await settle();
      const next = document.querySelector('[data-popup="settings"]');
      next.querySelector('[data-action="reset"]').click();
      await settle();
      next.querySelector('[data-action="ok"]').click();
      await again;
      assert.equal(app.settings.language, "ko");
      assert.equal(app.settings.dateFormat, "long");
      assert.equal(app.settings.theme, "dark-ink");
      assert.equal(app.settings.transparency, 30);
      assert.equal(app.settings.backgroundOpacity, 40);
      assert.equal(app.settings.updateHours, 1);
      assert.equal(app.settings.displayPriority, "average");
      assert.equal(app.settings.openAtLogin, false);
      assert.deepEqual(app.settings.enabledSources, ["ecmwf", "gfs", "jma", "metno", "wttr"]);
      assert.equal(app.settings.backgroundImage, "");
      assert.equal(app.settings.backgroundName, "");
      assert.equal(app.settings.defaultLocation.cityEn, "Seoul");
      assert.deepEqual(app.settings.windowPosition, { x: 40, y: 18 });
      assert.deepEqual(app.recent.toJSON(), keptRecent);
    });
  });
  h.test("start with the system is chosen in settings and applies immediately", async () => {
    await withApp(async ({ app, platform }) => {
      assert.equal(platform.loginItems.at(-1), false);
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const box = popup.querySelector('[data-field="openAtLogin"]');
      assert.equal(box.type, "checkbox");
      assert.equal(box.checked, false);
      assert.equal(box.closest(".popup-row").querySelector("span").textContent, "시스템 시작 시 자동 실행");
      box.click();
      await settle();
      assert.equal(box.checked, true);
      assert.equal(app.settings.openAtLogin, false);
      assert.equal(platform.loginItems.at(-1), true);
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.settings.openAtLogin, false);
      assert.equal(platform.loginItems.at(-1), false);
      const again = app.showSettings("general");
      await settle();
      const next = document.querySelector('[data-popup="settings"]');
      next.querySelector('[data-field="openAtLogin"]').click();
      await settle();
      next.querySelector('[data-action="ok"]').click();
      await again;
      assert.equal(app.settings.openAtLogin, true);
      assert.equal(platform.settings.openAtLogin, true);
      assert.equal(platform.loginItems.at(-1), true);
    });
  });
  h.test("the date format is chosen in settings and applies immediately", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      const weekly = await openForecast(app, "weekly");
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      assert.equal(weekly.popup.querySelector(".popup-when").textContent, "10월 4일 – 10월 10일");
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const field = popup.querySelector('[data-field="dateFormat"]');
      assert.equal(popup.querySelector('[data-row="dateFormat"] span, [data-row="dateFormat"] label').textContent, "날짜 표시");
      assert.equal(field.value, "long");
      assert.deepEqual([...field.options].map((option) => option.value), ["long", "iso", "dot", "slash", "weekday"]);
      field.value = "iso";
      field.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(app.settings.dateFormat, "long");
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "2026-10-07");
      assert.equal(weekly.popup.querySelector(".popup-when").textContent, "2026-10-04 – 2026-10-10");
      assert.match(weekly.popup.querySelector(".range-title").textContent, /2026-10-04/);
      const dailyPending = app.showForecast("daily");
      await settle();
      const daily = document.querySelector('[data-popup-key="forecast:daily"]');
      assert.equal(daily.querySelector(".popup-when").textContent, "2026-10-07");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.settings.dateFormat, "long");
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일");
      assert.equal(weekly.popup.querySelector(".popup-when").textContent, "10월 4일 – 10월 10일");
      assert.equal(daily.querySelector(".popup-when").textContent, "10월 7일");
      daily.querySelector('[data-action="close"]').click();
      await dailyPending;
      const again = app.showSettings("general");
      await settle();
      const next = document.querySelector('[data-popup="settings"]');
      const nextField = next.querySelector('[data-field="dateFormat"]');
      nextField.value = "weekday";
      nextField.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      next.querySelector('[data-action="ok"]').click();
      await again;
      assert.equal(app.settings.dateFormat, "weekday");
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "10월 7일 (수)");
      assert.match(weekly.popup.querySelector(".popup-when").textContent, /10월 4일 \(일\).*10월 10일 \(토\)/);
      await weekly.close();
    });
  });
  h.test("the general page saves a display priority and the scene follows it", async () => {
    await withApp(async ({ app, platform }) => {
      const day = {
        date: "2026-10-07",
        tempMin: 10,
        tempMax: 21,
        precip: 0,
        wind: 1,
        humidity: 50,
        code: 1,
        bySource: {
          ecmwf: { tempMin: 8, tempMax: 20, precip: 0, wind: 1, humidity: 40, code: 0 },
        },
      };
      const hour = {
        time: "2026-10-07T09:00",
        temp: 15,
        precip: 0,
        wind: 1,
        humidity: 50,
        code: 1,
        bySource: {
          ecmwf: { temp: 18, precip: 0, wind: 1, humidity: 40, code: 0 },
        },
      };
      app.currentTab().weather = { daily: [day], hourly: [hour], sources: [] };
      app.currentTab().selectedDate = "2026-10-07";
      app.renderWeather();
      assert.match(app.root.querySelector(".scene-temp").textContent, /15°C/);
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const field = popup.querySelector('[data-field="displayPriority"]');
      assert.equal(popup.querySelector('[data-panel="general"]').hidden, false);
      const tabIcons = new Map();
      const collectTabs = () => {
        for (const button of popup.querySelectorAll(".popup-tab")) tabIcons.set(button.dataset.tab, button.querySelector("svg"));
      };
      collectTabs();
      const nextTab = popup.querySelector('[data-action="tab-next"]');
      while (nextTab && !nextTab.disabled) {
        nextTab.click();
        collectTabs();
      }
      assert.deepEqual([...popup.querySelectorAll(".popup-tab")].map((button) => button.dataset.tab), ["general", "cities", "data", "appearance", "wallpaper"]);
      assert.equal(popup.querySelector('[data-action="tab-next"]').hidden, true);
      assert.deepEqual([...tabIcons.keys()].sort(), ["appearance", "cities", "data", "general", "wallpaper"]);
      for (const [id, svg] of tabIcons) assert.ok(svg, id);
      popup.querySelector('[data-action="tab-prev"]').click();
      assert.deepEqual([...field.options].map((option) => option.value), ["average", "ecmwf", "gfs", "jma", "metno", "wttr"]);
      assert.equal(field.selectedOptions[0].textContent, "평균");
      field.value = "ecmwf";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.displayPriority, "ecmwf");
      assert.equal(platform.settings.displayPriority, "ecmwf");
      assert.match(app.root.querySelector(".scene-temp").textContent, /18°C/);
    });
  });

  h.test("wallpaper opacity is saved separately and its slider steps from both sides", async () => {
    await withApp(async ({ app, platform }) => {
      platform.nextImage = { dataUrl: "data:image/png;base64,aaaa", name: "sky.png", type: "image/png", size: 9_000_000, directory: "D:/pictures" };
      await app.chooseWallpaper();
      assert.equal(app.settings.backgroundName, "sky.png");
      assert.equal(app.settings.imageDirectory, "D:/pictures");
      assert.deepEqual(platform.imageStarts, [""]);
      await app.chooseWallpaper();
      assert.deepEqual(platform.imageStarts, ["", "D:/pictures"]);
      assert.equal(app.wallpaper.dataset.image, "yes");
      assert.equal(app.wallpaper.style.opacity, "0.4");
      const pending = app.showSettings("wallpaper");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.equal(popup.querySelector('[data-panel="wallpaper"]').hidden, false);
      assert.match(popup.querySelector('[data-panel="wallpaper"]').textContent, /sky\.png/);
      const preview = popup.querySelector("[data-gui='wallpaper-preview']");
      assert.equal(preview.dataset.image, "yes");
      assert.match(preview.style.backgroundImage, /aaaa/);
      assert.equal(popup.querySelector(".wallpaper-file").textContent, "sky.png");
      assert.equal(popup.querySelector(".wallpaper-file").title, "sky.png");
      const row = popup.querySelector('[data-row="backgroundOpacity"]');
      const slider = row.querySelector('[data-field="backgroundOpacity"]');
      const steps = [...row.querySelectorAll(".step-btn")];
      assert.equal(steps.map((button) => button.dataset.step).join(","), "-5,5");
      assert.deepEqual(steps.map((button) => button.title), ["감소", "증가"]);
      assert.equal(steps[0].nextElementSibling.textContent, "0");
      assert.equal(steps[0].nextElementSibling.nextElementSibling, slider);
      assert.equal(slider.nextElementSibling.textContent, "100");
      assert.equal(slider.nextElementSibling.nextElementSibling, steps[1]);
      steps[0].click();
      await settle();
      assert.equal(slider.value, "35");
      assert.equal(popup.querySelector('[data-out="backgroundOpacity"]').textContent, "35%");
      assert.equal(app.wallpaper.style.opacity, "0.35");
      slider.value = "25";
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
      await settle();
      assert.equal(app.wallpaper.style.opacity, "0.25");
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.backgroundOpacity, 25);
      assert.equal(platform.settings.backgroundOpacity, 25);
      assert.equal(app.wallpaper.style.opacity, "0.25");
      await app.setTransparency(0);
      assert.equal(app.wallpaper.style.opacity, "0.25");
      await app.setTransparency(100);
      assert.equal(app.wallpaper.style.opacity, "0.25");
    });
  });

  h.category("Popups");
  h.test("about shows build information and the author", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showAbout();
      await settle();
      const popup = document.querySelector('[data-popup="about"]');
      assert.equal(popup.dataset.independent, "true");
      assert.equal(document.querySelector('[data-backdrop="about"]'), null);
      assert.equal(popup.style.transform, "none");
      assert.equal(app.frame.contains(popup), false);
      assert.equal(popupFits(popup).fits, true);
      const text = popup.textContent;
      assert.match(text, /MyWeather/);
      assert.match(text, /1\.0\.0/);
      assert.match(text, /20261007\.1/);
      assert.match(text, /2026-10-07/);
      assert.match(text, /SHKWON\(knix008@naver\.com\)/);
      assert.match(popup.querySelector(".popup-icon svg").innerHTML, /#2f94ff/);
      const intro = popup.querySelector(".about-intro");
      assert.match(intro.querySelector(".about-app-icon").getAttribute("src"), /icon\.png$/);
      assert.match(intro.querySelector(".about-desc").textContent, /여러 출처/);
      const facts = [...popup.querySelectorAll(".popup-row")].map((row) => [row.querySelector("span")?.textContent, row.querySelector("span:last-child")?.textContent]);
      assert.deepEqual(facts, [
        ["버전", "1.0.0"],
        ["빌드 번호", "20261007.1"],
        ["빌드 날짜", "2026-10-07"],
        ["제작자", "SHKWON(knix008@naver.com)"],
      ]);
      popup.querySelector('[data-action="close"]').click();
      await pending;
      assert.equal(document.querySelector('[data-popup="about"]'), null);
    });
  });
  h.test("each forecast, settings, and about window stays single and comes forward", async () => {
    await withApp(async ({ app }) => {
      const daily = app.showForecast("daily");
      await settle();
      const weekly = app.showForecast("weekly");
      await settle();
      assert.equal(document.querySelectorAll('[data-popup="forecast"]').length, 2);
      const again = await app.showForecast("daily");
      assert.equal(again.action, "focused");
      assert.equal(document.querySelectorAll('[data-popup-key="forecast:daily"]').length, 1);
      const order = [...document.querySelectorAll("[data-popup]")].map((el) => el.dataset.popupKey);
      assert.equal(order.at(-1), "forecast:daily");
      const settings = app.showSettings("general");
      await settle();
      const second = await app.showSettings("font");
      assert.equal(second.action, "focused");
      assert.equal(document.querySelectorAll('[data-popup="settings"]').length, 1);
      assert.equal(document.querySelector('[data-popup="settings"] [data-panel="general"]').hidden, false);
      const about = app.showAbout();
      await settle();
      const aboutAgain = await app.showAbout();
      assert.equal(aboutAgain.action, "focused");
      assert.equal(document.querySelectorAll('[data-popup="about"]').length, 1);
      assert.equal([...document.querySelectorAll("[data-popup]")].at(-1).dataset.popup, "about");
      document.querySelector('[data-popup="about"] [data-action="close"]').click();
      await about;
      document.querySelector('[data-popup="settings"] [data-action="cancel"]').click();
      await settings;
      for (const popup of [...document.querySelectorAll('[data-popup="forecast"]')]) popup.querySelector('[data-action="close"]').click();
      await daily;
      await weekly;
      assert.equal(document.querySelector("[data-popup]"), null);
    });
  });
  h.test("popups are fixed, single-line, and close with the application", async () => {
    await withApp(async ({ app }) => {
      const specs = ["settings", "about", "print"];
      const pending = [];
      pending.push(app.showSettings("general"));
      await settle();
      pending.push(app.showAbout());
      await settle();
      assert.ok(document.querySelector('[data-popup="settings"]'));
      assert.ok(document.querySelector('[data-popup="about"]'));
      for (const type of specs.slice(0, 2)) {
        const popup = document.querySelector(`[data-popup="${type}"]`);
        assert.equal(popup.style.overflow, "hidden");
        assert.equal(popup.style.resize, "none");
        assert.equal(popupFits(popup).fits, true);
        for (const button of popup.querySelectorAll("button")) assert.ok(button.title, button.textContent);
      }
      app.destroy();
      assert.equal(document.querySelector(".popup"), null);
      assert.equal(specs.length, 3);
    });
  });
  h.test("fixed-size popups scale down to fit a small browser window", () => {
    const el = document.createElement("section");
    el.style.width = "680px";
    el.style.height = "560px";
    assert.equal(fitPopupToViewport(el, { innerWidth: 1280, innerHeight: 900 }), 1);
    assert.equal(el.style.transform, "");
    const scale = fitPopupToViewport(el, { innerWidth: 846, innerHeight: 495 });
    assert.ok(Math.abs(scale - 479 / 560) < 0.001);
    assert.match(el.style.transform, /translate\(-50%, -50%\) scale\(0\.85\d\)/);
    assert.equal(el.style.width, "680px");
  });
  h.test("the shared popup host used by desktop windows renders the same dialog", () => {
    const spec = buildAboutSpec((key) => key);
    let finished = null;
    const el = bootPopup(spec, {
      finish: (result) => {
        finished = result;
      },
      immediate() {},
      onUpdate() {},
    });
    assert.match(el.textContent, /SHKWON\(knix008@naver\.com\)/);
    assert.equal(el.style.overflow, "hidden");
    el.querySelector('[data-action="close"]').click();
    assert.equal(finished.action, "close");
    el.remove();
  });
  h.test("a long error shows code, time, operation, app, and details, and copies the full text", async () => {
    await withApp(async ({ app, platform }) => {
      const details = Array.from({ length: 9 }, (_, index) => `line ${index} HTTP ${500 + index}`).join("\n");
      app.reportError(new AppError("Geocoder failed", details, "GEO"), "search-online");
      await settle();
      const popup = document.querySelector('[data-popup="error"]');
      const row = (id) => popup.querySelector(`[data-row="${id}"]`).textContent;
      assert.match(row("summary"), /GEO.*Geocoder failed/);
      assert.equal(popup.querySelector('[data-row="summary"]').dataset.tone, "danger");
      assert.match(row("time"), /2026-10-07 09:00:00/);
      assert.match(row("operation"), /search-online/);
      assert.match(row("app"), /MyWeather 1\.0\.0/);
      assert.ok(row("environment").length > 4);
      assert.match(row("detail-0"), /line 0 HTTP 500/);
      assert.match(row("more"), /\d+줄 더 있음/);
      assert.equal(popup.querySelectorAll(".popup-row").length <= 12, true);
      for (const line of popup.querySelectorAll(".popup-row")) assert.equal(line.style.whiteSpace, "nowrap");
      const full = popup.querySelector('[data-field="full"]');
      assert.equal(full.readOnly, true);
      assert.equal(full.tagName, "TEXTAREA");
      assert.match(full.value, /Geocoder failed\n발생 시각/);
      assert.match(full.value, /line 8 HTTP 508/);
      assert.match(full.value, /발생 시각: 2026-10-07 09:00:00/);
      assert.equal(popupFits(popup).fits, true);
      assert.equal(popup.style.overflow, "hidden");
      popup.querySelector('[data-action="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /^\[GEO\] Geocoder failed/);
      assert.match(platform.clipboardText, /작업: .*search-online/);
      assert.match(platform.clipboardText, /프로그램: MyWeather 1\.0\.0/);
      assert.match(platform.clipboardText, /line 8 HTTP 508/);
      assert.equal(app.root.querySelector("[data-gui='toast']").textContent, "복사했습니다.");
      popup.querySelector('[data-gui="popup-close"]').click();
      await settle();
      assert.equal(document.querySelector('[data-popup="error"]'), null);
    });
  });
  h.test("an unexpected exception in a command opens the detailed error popup", async () => {
    await withApp(async ({ app }) => {
      app.showAbout = () => {
        throw new TypeError("boom from about");
      };
      await app.run("about");
      await settle();
      const popup = document.querySelector('[data-popup="error"]');
      assert.ok(popup);
      assert.match(popup.querySelector('[data-row="summary"]').textContent, /TypeError.*boom from about/);
      assert.match(popup.querySelector('[data-row="operation"]').textContent, /프로그램 정보|about/);
      assert.match(popup.querySelector('[data-field="full"]').value, /TypeError: boom from about/);
      popup.querySelector('[data-action="close"]').click();
      await settle();
    });
  });
  h.test("startup refresh stays in the background and the refresh button shows progress", async () => {
    await withApp(async ({ platform }) => {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const original = platform.fetchImpl;
      platform.fetchImpl = async (url, options) => {
        await gate;
        return original(url, options);
      };
      const root = document.createElement("div");
      document.body.appendChild(root);
      const app = createApp(root, { platform, autoLoad: true, now: () => new Date(2026, 9, 7, 9, 0, 0) });
      try {
        await app.ready;
        await settle();
        assert.equal(document.querySelector('[data-popup="progress"]'), null);
        const settings = app.showSettings("general");
        await settle();
        assert.ok(document.querySelector('[data-popup="settings"]'));
        document.querySelector('[data-popup="settings"] [data-action="cancel"]').click();
        await settings;
        release();
        await settle();
        assert.ok(app.currentTab().weather.daily.length);
        assert.equal(document.querySelector('[data-popup="progress"]'), null);
        let sawProgress = false;
        platform.fetchImpl = async (url, options) => {
          sawProgress = Boolean(document.querySelector('[data-popup="progress"]'));
          return original(url, options);
        };
        app.root.querySelector('[data-cmd="refresh"]').click();
        await settle();
        assert.equal(sawProgress, true);
        assert.equal(document.querySelector('[data-popup="progress"]'), null);
      } finally {
        app.destroy();
        root.remove();
      }
    });
  });

  h.category("Print GUI");
  h.test("the print window sets the page on the left and shows the sheet on the right", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      app.addTab();
      app.doc.tabs[1].place = { ...app.doc.tabs[1].place, cityEn: "Busan", cityKo: "부산" };
      app.doc.tabs[1].weather = app.doc.tabs[0].weather;
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      assert.ok(popup);
      assert.equal(document.querySelector('[data-popup="preview"]'), null, "there is no second window");
      assert.equal(popup.querySelector(".popup-tabs"), null, "and no tabs");
      const setup = popup.querySelector(".preview-setup");
      const side = popup.querySelector(".preview-side");
      assert.ok(setup && side);
      assert.ok(setup.getBoundingClientRect().left <= side.getBoundingClientRect().left, "settings left, sheet right");
      // Everything a print needs is on the left of the one window.
      for (const field of ["from", "to", "range-daily", "range-weekly", "range-monthly", "paper", "orientation", "margin", "scale", "header", "pageNumber", "pageNumberAt"]) {
        assert.ok(setup.querySelector(`[data-field="${field}"]`), field);
      }
      assert.equal(setup.querySelectorAll('input[name="scope"]').length, 3);
      const sheet = popup.querySelector("[data-preview-sheet]");
      const paper = popup.querySelector("[data-preview-paper]");
      const count = popup.querySelector("[data-preview-count]");
      const prev = popup.querySelector('[data-action="page-prev"]');
      const next = popup.querySelector('[data-action="page-next"]');
      assert.ok(sheet && paper && count && prev && next);
      assert.equal(popup.querySelector(".pager-btn"), null, "only previous and next");
      chooseScope(popup, "all");
      popup.querySelector('input[name="scope"]').dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(count.textContent, "1 / 6", "two cities, three forecasts each");
      assert.equal(prev.disabled, true);
      assert.match(sheet.innerHTML, /서울/);
      assert.match(sheet.innerHTML, /class="hour-board"/, "the sheet carries the real forecast");
      assert.match(sheet.innerHTML, /<svg/, "pictures and all");
      // The paper keeps its shape whatever is laid out on it.
      assert.equal(paper.style.aspectRatio, "210 / 297");
      next.click();
      assert.equal(count.textContent, "2 / 6");
      assert.match(sheet.innerHTML, /class="week-row"/);
      next.click();
      assert.match(sheet.innerHTML, /class="month-cal"/);
      prev.click();
      assert.equal(count.textContent, "2 / 6");
      for (let i = 0; i < 6; i += 1) next.click();
      assert.equal(count.textContent, "6 / 6");
      assert.equal(next.disabled, true, "it stops at the last page");
      assert.match(sheet.innerHTML, /부산/);
      const paperField = popup.querySelector('[data-field="paper"]');
      paperField.value = "A3";
      paperField.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(app.pageSetup.paper, "A3");
      assert.equal(paper.style.aspectRatio, "297 / 420", "a new paper reshapes the sheet");
      const turned = popup.querySelector('[data-field="orientation"]');
      turned.value = "landscape";
      turned.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(paper.style.aspectRatio, "420 / 297");
      // Print goes straight to the printer from this window.
      popup.querySelector('[data-action="print"]').click();
      await pending;
      assert.equal(platform.prints.length, 1);
      assert.match(platform.prints[0].html, /class="sheet-city">서울</);
      assert.match(platform.prints[0].html, /size: A3 landscape/);
      assert.equal(platform.prints[0].pageSetup.paper, "A3");
    });
  });
  h.test("the print window prints only the forecasts that were asked for", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      assert.equal(popup.querySelector("[data-preview-count]").textContent, "1 / 3");
      const daily = popup.querySelector('[data-field="range-daily"]');
      daily.checked = false;
      daily.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      const monthly = popup.querySelector('[data-field="range-monthly"]');
      monthly.checked = false;
      monthly.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(popup.querySelector("[data-preview-count]").textContent, "1 / 1");
      const sheet = popup.querySelector("[data-preview-sheet]");
      assert.match(sheet.innerHTML, /주간 예보/);
      assert.doesNotMatch(sheet.innerHTML, /일간 예보/);
      popup.querySelector('[data-action="print"]').click();
      await pending;
      assert.match(platform.prints[0].html, /주간 예보/);
      assert.doesNotMatch(platform.prints[0].html, /월간 예보/);
    });
  });
  h.test("the page number can be moved or left off", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      const sheet = popup.querySelector("[data-preview-sheet]");
      assert.match(sheet.innerHTML, /data-at="right"/);
      const at = popup.querySelector('[data-field="pageNumberAt"]');
      at.value = "center";
      at.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.match(sheet.innerHTML, /data-at="center"/);
      assert.match(sheet.innerHTML, /1 \/ 3/);
      const on = popup.querySelector('[data-field="pageNumber"]');
      on.value = "off";
      on.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.doesNotMatch(sheet.innerHTML, /sheet-foot/);
      const header = popup.querySelector('[data-field="header"]');
      header.value = "off";
      header.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.doesNotMatch(sheet.innerHTML, /sheet-head/, "the heading can go too");
      popup.querySelector('[data-action="print"]').click();
      await pending;
      assert.doesNotMatch(platform.prints[0].html, /<footer class="sheet-foot"/);
    });
  });
  h.test("a reversed custom range leaves the last good sheet up and says so", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      const before = popup.querySelector("[data-preview-sheet]").innerHTML;
      chooseScope(popup, "custom");
      popup.querySelector('[data-field="from"]').value = "2026-10-09";
      popup.querySelector('[data-field="to"]').value = "2026-10-07";
      popup.querySelector('[data-field="to"]').dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(app.statusMessage, "날짜 범위가 올바르지 않습니다.");
      assert.equal(popup.querySelector("[data-preview-sheet]").innerHTML, before, "the sheet is left alone");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });

  h.category("Coverage");
  h.test("keyboard shortcuts zoom, refresh, print, and open settings", async () => {
    await withApp(async ({ app }) => {
      press("=", { ctrlKey: true });
      assert.equal(app.settings.zoom, 110);
      press("z", { ctrlKey: true });
      assert.equal(app.settings.zoom, 100);
      press("z", { ctrlKey: true, shiftKey: true });
      assert.equal(app.settings.zoom, 110);
      press("-", { ctrlKey: true });
      press("0", { ctrlKey: true });
      assert.equal(app.settings.zoom, 100);
      press("F5");
      await settle();
      assert.match(app.root.querySelector(".scene-temp").textContent, /°C/);
      press("p", { ctrlKey: true });
      await settle();
      const print = document.querySelector('[data-popup="print"]');
      assert.ok(print);
      print.querySelector('[data-action="cancel"]').click();
      await settle();
      press(",", { ctrlKey: true });
      await settle();
      const settings = document.querySelector('[data-popup="settings"]');
      assert.equal(settings.querySelector(".popup-title").textContent, "설정");
      settings.querySelector('[data-action="cancel"]').click();
      await settle();
      assert.equal(document.querySelector(".popup"), null);
    });
  });
  h.test("the file shortcuts are gone with the file commands", async () => {
    await withApp(async ({ app }) => {
      app.currentTab().properties.label = "keep-me";
      app.markDirty();
      for (const key of ["n", "o", "s"]) {
        press(key, { ctrlKey: true });
        await settle();
      }
      assert.equal(document.querySelector('[data-popup="unsaved"]'), null);
      assert.equal(app.currentTab().properties.label, "keep-me", "nothing was thrown away");
      // Printing is what this app puts on paper, and it still answers.
      press("p", { ctrlKey: true });
      await settle();
      assert.ok(document.querySelector('[data-popup="print"]'));
      document.querySelector('[data-popup="print"] [data-action="cancel"]').click();
      await settle();
    });
  });
  h.test("double-clicking the title maximizes and a toolbar button does not", async () => {
    await withApp(async ({ app }) => {
      app.root.querySelector('[data-cmd="daily"]').dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
      await settle();
      assert.equal(app.frame.dataset.maximized, "false");
      assert.equal(document.querySelector('[data-popup="forecast"]'), null);
      app.root.querySelector("[data-gui='window-title']").dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
      await settle();
      assert.equal(app.frame.dataset.maximized, "true");
      assert.equal(app.shell.dataset.sized, "fill");
      assert.equal(app.root.querySelector("[data-gui='resize-grip']").hidden, true);
      app.root.querySelector('[data-cmd="minimize"]').click();
      await settle();
      assert.equal(getComputedStyle(app.content).display, "none");
      app.root.querySelector('[data-cmd="minimize"]').click();
      await settle();
      assert.notEqual(getComputedStyle(app.content).display, "none");
    });
  });
  h.test("a favorite and an extra city can be undone, and the title row stays free of city names", async () => {
    await withApp(async ({ app }) => {
      app.addTab();
      assert.equal(app.doc.tabs.length, 2);
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("서울"), false);
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("부산"), false);
      await app.run("toggle-favorite");
      assert.equal(app.currentTab().properties.favorite, true);
      app.undo();
      assert.equal(app.currentTab().properties.favorite, false);
      await app.run("close-tab");
      assert.equal(app.doc.tabs.length, 1);
      app.undo();
      assert.equal(app.doc.tabs.length, 2);
    });
  });
  h.test("a tall window enlarges the weather picture and the main window does not scroll", async () => {
    await withApp(async ({ app }) => {
      app.shellSize = { width: 760, height: 640 };
      app.applyShellSize();
      const art = Number(app.content.style.getPropertyValue("--art-scale"));
      const text = Number(app.content.style.getPropertyValue("--scene-scale"));
      assert.equal(text, 1);
      assert.ok(art > text);
      const copy = app.content.querySelector(".scene-copy");
      Object.defineProperty(copy, "scrollWidth", { configurable: true, get: () => 480 });
      app.applySceneScale();
      assert.equal(app.content.style.getPropertyValue("--art-scale"), String(art));
      await app.refreshWeather();
      Object.defineProperty(app.content.querySelector(".scene-copy"), "scrollWidth", { configurable: true, get: () => 140 });
      app.applySceneScale();
      assert.equal(app.content.style.getPropertyValue("--art-scale"), String(art));
      assert.equal(app.content.style.getPropertyValue("--scene-scale"), String(text));
      app.shellSize = { width: WINDOW_MIN.width, height: WINDOW_MIN.height };
      app.applyShellSize();
      const smallArt = Number(app.content.style.getPropertyValue("--art-scale"));
      const smallText = Number(app.content.style.getPropertyValue("--scene-scale"));
      assert.equal(smallArt, smallText);
      assert.ok(smallArt >= 0.55 && smallArt <= 1);
      const content = getComputedStyle(app.content);
      assert.equal(content.paddingTop, "2px");
      assert.equal(content.paddingBottom, "2px");
      assert.equal(content.overflow, "hidden");
      for (const selector of [".shell-top", ".weather", ".weather-scene"]) {
        const style = getComputedStyle(app.root.querySelector(selector));
        assert.equal(style.overflowX || style.overflow, "hidden", selector);
        assert.equal(style.overflowY || style.overflow, "hidden", selector);
      }
    });
  });
  h.test("the weather scene appears at the measured scale and ignores a small shift", async () => {
    await withApp(async ({ app }) => {
      app.shellSize = { width: 760, height: 640 };
      let width = 0;
      let height = 0;
      Object.defineProperty(app.content, "clientWidth", { configurable: true, get: () => width });
      Object.defineProperty(app.content, "clientHeight", { configurable: true, get: () => height });
      app.applySceneScale();
      const scene = app.content.querySelector(".weather-scene");
      assert.equal(app.content.dataset.sceneReady || "", "");
      assert.equal(getComputedStyle(scene).visibility, "hidden");
      width = 760;
      height = 594;
      app.applySceneScale();
      const art = app.content.style.getPropertyValue("--art-scale");
      assert.equal(app.content.dataset.sceneReady, "1");
      assert.equal(getComputedStyle(scene).visibility, "visible");
      width = 756;
      height = 590;
      app.applySceneScale();
      assert.equal(app.content.style.getPropertyValue("--art-scale"), art);
    });
  });
  h.test("forecast buttons stay icon-only and a chosen day becomes the selection", async () => {
    await withApp(async ({ app }) => {
      const buttons = [...app.root.querySelectorAll("[data-gui='range-button']")];
      assert.deepEqual(buttons.map((button) => button.textContent.trim()), ["", "", ""]);
      assert.deepEqual(buttons.map((button) => button.title), ["일간 예보", "주간 예보", "월간 예보"]);
      buttons[0].click();
      await settle();
      const opened = document.querySelector('[data-popup="forecast"]');
      assert.equal(opened.querySelector(".popup-title").textContent, "일간 예보");
      opened.querySelector('[data-action="close"]').click();
      await settle();
      await app.refreshWeather();
      const weekly = await openForecast(app, "weekly");
      const day = weekly.popup.querySelector('[data-date="2026-10-07"]');
      assert.ok(day);
      day.click();
      assert.match(app.selectionText, new RegExp(day.dataset.date));
      assert.equal(document.querySelector(".menu-popup"), null);
      day.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 18, clientY: 24 }));
      await settle();
      assert.ok(document.querySelector('.menu-popup[data-menu="context"]'));
      app.closeMenu();
      await weekly.close();
      await app.setLanguage("en");
      assert.equal(app.root.querySelector("[data-gui='scene-date']").textContent, "October 7");
      assert.deepEqual(
        [...app.root.querySelectorAll("[data-gui='range-button']")].map((button) => button.title),
        ["Daily forecast", "Weekly forecast", "Monthly forecast"],
      );
    });
  });
  h.test("units, wallpaper, a missing download, and a disabled source take effect", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      const settings = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      popup.querySelector('[data-field="units"]').value = "F";
      popup.querySelector('[data-source="gfs"]').checked = false;
      popup.querySelector('[data-action="ok"]').click();
      await settings;
      assert.match(app.root.querySelector(".scene-temp").textContent, /°F/);
      assert.equal(app.settings.enabledSources.includes("gfs"), false);
      const urls = [];
      platform.fetchImpl = async (url) => {
        urls.push(String(url));
        if (String(url).includes("models=gfs")) return jsonResponse(openMeteoBody(SAMPLE_DATES, 22));
        if (String(url).includes("met.no") || String(url).includes("wttr")) return jsonResponse({}, false, 503);
        if (String(url).includes("models=jma")) return jsonResponse({}, false, 400);
        return jsonResponse(openMeteoBody(SAMPLE_DATES, 18));
      };
      await app.refreshWeather();
      assert.equal(urls.some((url) => url.includes("models=gfs")), false);
      assert.ok(urls.some((url) => url.includes("models=ecmwf")));
      platform.nextImage = { dataUrl: "data:image/png;base64,aaaa", name: "sky.png", type: "image/png", size: 120 };
      await app.run("choose-wallpaper");
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "yes");
      assert.equal(app.settings.backgroundName, "sky.png");
      await app.run("clear-wallpaper");
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "no");
      app.currentTab().weather = null;
      await app.run("download");
      await settle();
      const error = document.querySelector('[data-popup="error"]');
      assert.ok(error);
      assert.match(error.textContent, /NO_WEATHER|날씨/);
      error.querySelector('[data-action="close"]').click();
      await settle();
    });
  });

  h.category("GUI audit");
  h.test("every window, menu, and popup control has a tooltip or label in both languages", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      for (const language of ["ko", "en"]) {
        await app.setLanguage(language);
        assertTitled(app.root);
        for (const name of ["window", "context"]) {
          app.openMenu(name, { clientX: 8, clientY: 36 }, { atPointer: true });
          assertTitled(document.querySelector(".menu-popup"));
          const items = [...document.querySelectorAll(".menu-item")];
          assert.ok(items.every((item) => item.querySelector("svg") && item.querySelector(".menu-label").textContent.trim()));
          app.closeMenu();
        }
        const about = app.showAbout();
        await settle();
        assertTitled(document.querySelector('[data-popup="about"]'));
        document.querySelector('[data-popup="about"] [data-action="close"]').click();
        await about;
        const settings = app.showSettings("appearance");
        await settle();
        assertTitled(document.querySelector('[data-popup="settings"]'));
        document.querySelector('[data-popup="settings"] [data-action="cancel"]').click();
        await settings;
        const forecast = await openForecast(app, "daily");
        assertTitled(forecast.popup);
        assert.equal(forecast.popup.querySelectorAll(".hour").length, 24);
        await forecast.close();
      }
      assert.equal(app.i18n.missing.size, 0, [...app.i18n.missing].join(","));
      assert.equal(app.root.textContent.includes("«"), false);
      const buttons = app.root.querySelectorAll("button");
      assert.ok(buttons.length >= 9, String(buttons.length));
    });
  });
}

async function openForecast(app, range) {
  const pending = app.run(range);
  await settle();
  const popup = document.querySelector('[data-popup="forecast"]');
  assert.ok(popup, range);
  return {
    popup,
    close: async () => {
      popup.querySelector('[data-action="close"]').click();
      await pending;
    },
  };
}

function chooseScope(popup, scope) {
  popup.querySelectorAll('input[name="scope"]').forEach((input) => {
    input.checked = input.value === scope;
  });
}

function press(key, extra = {}) {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
}

function pointer(target, type, x, y) {
  target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, screenX: x, screenY: y }));
}

function wheel(app, deltaY) {
  app.content.dispatchEvent(new window.WheelEvent("wheel", { deltaY, ctrlKey: true, bubbles: true, cancelable: true }));
}

function assertTitled(root) {
  assert.ok(root, "missing root");
  for (const control of root.querySelectorAll("button, input, select")) {
    if (control.type === "hidden") continue;
    assert.ok(control.title || control.getAttribute("aria-label"), control.outerHTML.slice(0, 160));
  }
}
