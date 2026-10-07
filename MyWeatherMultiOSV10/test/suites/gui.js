import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/core/errors.js";
import { serializeDocument } from "../../src/core/document.js";
import { DARK_THEMES, LIGHT_THEMES, THEMES } from "../../src/core/themes.js";
import { buildAboutSpec, bootPopup, fitPopupToViewport, popupFits } from "../../src/ui/popups.js";
import { WINDOW_MIN } from "../../src/ui/window-spec.js";
import { jsonResponse, openMeteoBody, SAMPLE_DATES, settle, withApp } from "../support.js";

export function registerGui(h) {
  h.category("Window");
  h.test("the title bar shows the icon and MyWeather V1.0 without a place name", async () => {
    await withApp(async ({ app }) => {
      assert.equal(app.frame.dataset.chromeless, "true");
      for (const selector of [".menubar", ".toolbar", ".statusbar", "#statusbar", "[data-status]", "[data-gui='menubar-item']", "#opacity-slider"]) {
        assert.equal(app.root.querySelector(selector), null, selector);
      }
      const bar = app.root.querySelector("[data-gui='titlebar']");
      const title = bar.querySelector("[data-gui='window-title']");
      const icon = bar.querySelector("img");
      assert.equal(bar.parentElement.dataset.gui, "drag-region");
      assert.equal(app.root.querySelector(".tabbar").hidden, true);
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("서울"), false);
      assert.equal(title.textContent, "MyWeather V1.0");
      assert.equal(app.titleText, "MyWeather V1.0");
      assert.equal(document.title, "MyWeather V1.0");
      assert.match(icon.getAttribute("src"), /icon\.png$/);
      assert.equal(getComputedStyle(bar).display, "flex");
      assert.ok(Number.parseFloat(getComputedStyle(icon).width) > 0);
      assert.equal(bar.textContent.includes("서울"), false);
      app.markDirty();
      assert.equal(app.titleText, "MyWeather V1.0");
      assert.equal(title.textContent, "MyWeather V1.0");
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
      pointer(app.root.querySelector(".title-name"), "pointerdown", 4, 4);
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
      await app.refreshWeather();
      assert.ok(app.root.querySelector(".scene-temp").textContent);
      assert.equal(app.root.querySelector(".tabbar").hidden, true);
      await app.setTransparency(80);
      const daily = await openForecast(app, "daily");
      assert.equal(daily.popup.dataset.popup, "forecast");
      assert.equal(daily.popup.querySelector(".popup-title").textContent, "일간 예보");
      assert.ok(daily.popup.querySelector("[data-hour]"));
      assert.equal(popupFits(daily.popup).fits, true);
      assert.equal(getComputedStyle(daily.popup).backgroundImage, getComputedStyle(app.shell).backgroundImage);
      await daily.close();
      const weekly = await openForecast(app, "weekly");
      assert.equal(weekly.popup.querySelector(".popup-title").textContent, "주간 예보");
      assert.ok(weekly.popup.querySelector('[data-gui="week"]'));
      assert.equal(getComputedStyle(weekly.popup).backgroundImage, getComputedStyle(app.shell).backgroundImage);
      await weekly.close();
      const monthly = await openForecast(app, "monthly");
      assert.equal(monthly.popup.querySelector(".popup-title").textContent, "월간 예보");
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
  h.test("tabs move with chevrons instead of a scrollbar", async () => {
    await withApp(async ({ app }) => {
      for (let i = 0; i < 8; i += 1) app.addTab();
      app.setWorkspaceWidth(300);
      const next = app.root.querySelector('[data-cmd="tab-next"]');
      const prev = app.root.querySelector('[data-cmd="tab-prev"]');
      assert.equal(next.disabled, false);
      assert.equal(app.tabStrip.style.overflow, "hidden");
      assert.equal(app.root.querySelector(".scrollbar"), null);
      const first = app.root.querySelector(".tab").dataset.tabId;
      next.click();
      assert.notEqual(app.root.querySelector(".tab").dataset.tabId, first);
      assert.equal(prev.disabled, false);
      assert.equal(app.root.querySelectorAll(".tab").length <= 2, true);
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
  h.test("window buttons minimize, maximize, and ask before closing dirty work", async () => {
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
      const cancelled = app.requestClose();
      const unsaved = document.querySelector('[data-popup="unsaved"]');
      assert.ok(unsaved);
      assert.equal(popupFits(unsaved).fits, true);
      unsaved.querySelector('[data-action="cancel"]').click();
      assert.equal(await cancelled, "cancelled");
      assert.equal(app.closed, false);
      platform.nextSavePath = "C:/docs/keep.myweather";
      const closing = app.requestClose();
      document.querySelector('[data-popup="unsaved"] [data-action="save"]').click();
      assert.equal(await closing, "closed");
      assert.equal(platform.quit, 1);
      assert.match(platform.files.get("C:/docs/keep.myweather"), /umbrella/);
    });
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
      for (const id of ["refresh", "undo", "redo", "copy", "paste", "new", "open", "save", "save-as", "print", "choose-wallpaper", "clear-wallpaper", "settings", "about", "exit"]) {
        assert.ok(ids.includes(id), id);
      }
      for (const item of items) {
        assert.ok(item.querySelector("svg"), item.textContent);
        assert.ok(item.querySelector(".menu-label").textContent.trim(), item.textContent);
        assert.equal(item.style.whiteSpace, "nowrap");
        assert.ok(item.title);
      }
      assert.match(menu.querySelector('[data-cmd="refresh"] svg').innerHTML, /#2f94ff/);
      assert.match(menu.querySelector('[data-cmd="settings"] svg').innerHTML, /#ffba30/);
      assert.match(menu.querySelector('[data-cmd="exit"] svg').innerHTML, /#e5484d/);
      assert.ok(menu.querySelectorAll('[role="separator"]').length >= 4);
      assert.equal(menu.querySelector('[data-cmd="undo"]').disabled, true);
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
  h.test("window menu commands run and recent files appear in it", async () => {
    await withApp(async ({ app }) => {
      app.recent.add("C:/docs/recent.myweather");
      app.openMenu("window", { clientX: 10, clientY: 10 }, { atPointer: true });
      const menu = document.querySelector('.menu-popup[data-menu="window"]');
      assert.ok(menu.querySelector('[data-cmd="recent:0"]'));
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
      await dailyEn.close();
      const weeklyEn = await openForecast(app, "weekly");
      assert.equal(weeklyEn.popup.querySelector('[data-gui="week"] .weekday').textContent, "Sun");
      await weeklyEn.close();
      const monthlyEn = await openForecast(app, "monthly");
      assert.match(monthlyEn.popup.textContent, /October 2026/);
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
      const pending = app.showSettings("recent");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.equal(popup.querySelectorAll("[data-recent]").length, 10);
      popup.querySelector('[data-action="recent-delete"]').click();
      await settle();
      assert.equal(app.recent.items.length, 9);
      popup.querySelector('[data-action="recent-clear"]').click();
      await settle();
      assert.equal(app.recent.items.length, 0);
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
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
      const sizeRow = popup.querySelector('[data-row="fontSize"]');
      const steps = [...sizeRow.querySelectorAll("[data-step]")];
      assert.deepEqual(steps.map((button) => button.dataset.step), ["-1", "1"]);
      assert.equal(steps[0].title, "감소");
      assert.equal(steps[1].title, "증가");
      const size = popup.querySelector('[data-field="fontSize"]');
      steps[1].click();
      assert.equal(size.value, "15");
      steps[0].click();
      steps[0].click();
      assert.equal(size.value, "13");
      size.value = "8";
      steps[0].click();
      assert.equal(size.value, "8");
      size.value = "72";
      steps[1].click();
      assert.equal(size.value, "72");
      popup.querySelector('[data-field="fontFamily"]').value = "Family 3";
      popup.querySelector('[data-field="fontStyle"]').value = "bolditalic";
      popup.querySelector('[data-field="fontSize"]').value = "18";
      popup.querySelector('[data-field="language"]').value = "en";
      popup.querySelector('.swatch[data-theme-id="dark-forest"]').click();
      popup.querySelector('[data-field="units"]').value = "F";
      popup.querySelector('[data-field="transparency"]').value = "80";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.fontFamily, "Family 3");
      assert.equal(app.frame.style.fontWeight, "700");
      assert.equal(app.frame.style.fontStyle, "italic");
      assert.equal(app.frame.style.fontSize, "18px");
      assert.equal(app.settings.language, "en");
      assert.equal(app.frame.dataset.theme, "dark-forest");
      assert.equal(app.settings.units, "F");
      assert.equal(app.settings.transparency, 80);
      assert.equal(app.settings.updateHours, 1);
      assert.equal(app.i18n.missing.size, 0);
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
        assert.ok(swatch.title && swatch.querySelector(".chip i") && name.textContent, swatch.dataset.themeId);
        assert.equal(swatch.querySelector(".chip").contains(name), true);
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
      assert.equal(popup.style.height, "640px");
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
      app.settings.theme = "light-paper";
      app.settings.transparency = 80;
      app.settings.backgroundOpacity = 10;
      app.settings.updateHours = 12;
      app.settings.displayPriority = "ecmwf";
      app.settings.enabledSources = ["gfs"];
      app.settings.fontSize = 22;
      app.settings.reopenLast = true;
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
      assert.equal(popup.querySelector('[data-field="theme"]').value, "dark-ink");
      assert.equal(popup.querySelector('[data-field="transparency"]').value, "30");
      assert.equal(popup.querySelector('[data-field="backgroundOpacity"]').value, "40");
      assert.equal(popup.querySelector('[data-field="updateHours"]').value, "1");
      assert.equal(popup.querySelector('[data-field="displayPriority"]').value, "average");
      assert.equal(popup.querySelector('[data-field="fontSize"]').value, "14");
      assert.equal(popup.querySelector('[data-field="reopen"]').checked, false);
      assert.equal(popup.querySelector('[data-field="countryCode"]').value, "KR");
      assert.equal(popup.querySelector('[data-field="cityEn"]').value, "Seoul");
      assert.equal(popup.querySelector('[data-source="ecmwf"]').checked, true);
      assert.equal(popup.querySelector('[data-row="wallpaper"] span:last-child').textContent, "—");
      assert.equal(app.wallpaper.dataset.image, "no");
      assert.equal(app.settings.language, "en");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.settings.language, "en");
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
      assert.equal(app.settings.theme, "dark-ink");
      assert.equal(app.settings.transparency, 30);
      assert.equal(app.settings.backgroundOpacity, 40);
      assert.equal(app.settings.updateHours, 1);
      assert.equal(app.settings.displayPriority, "average");
      assert.equal(app.settings.fontSize, 14);
      assert.equal(app.settings.reopenLast, false);
      assert.deepEqual(app.settings.enabledSources, ["ecmwf", "gfs", "jma", "metno", "wttr"]);
      assert.equal(app.settings.backgroundImage, "");
      assert.equal(app.settings.backgroundName, "");
      assert.equal(app.settings.defaultLocation.cityEn, "Seoul");
      assert.deepEqual(app.settings.windowPosition, { x: 40, y: 18 });
      assert.deepEqual(app.recent.toJSON(), keptRecent);
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
      assert.deepEqual([...tabIcons.keys()].sort(), ["appearance", "data", "font", "general", "recent", "wallpaper"]);
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
  h.test("preview prints all, current, or a custom range and can change page setup", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshWeather();
      app.addTab();
      app.doc.tabs[1].place = { ...app.doc.tabs[1].place, cityEn: "Busan", cityKo: "부산" };
      app.doc.tabs[1].weather = app.doc.tabs[0].weather;
      const pending = app.openPrint();
      await settle();
      let popup = document.querySelector('[data-popup="print"]');
      chooseScope(popup, "all");
      popup.querySelector('[data-action="preview"]').click();
      await settle();
      popup = document.querySelector('[data-popup="preview"]');
      assert.equal(popupFits(popup).fits, true);
      assert.equal(popup.style.overflow, "hidden");
      const paper = popup.querySelector('[data-field="paper"]');
      paper.value = "A3";
      paper.dispatchEvent(new window.Event("change", { bubbles: true }));
      const orientation = popup.querySelector('[data-field="orientation"]');
      orientation.value = "landscape";
      orientation.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      popup.querySelector('[data-action="print"]').click();
      await pending;
      assert.equal(platform.prints.length, 1);
      assert.match(platform.prints[0].html, /A3 landscape/);
      assert.match(platform.prints[0].html, /Seoul|서울/);
      assert.match(platform.prints[0].html, /Busan|부산/);
    });
  });
  h.test("a reversed custom range explains the error", async () => {
    await withApp(async ({ app }) => {
      await app.refreshWeather();
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      chooseScope(popup, "custom");
      popup.querySelector('[data-field="from"]').value = "2026-10-09";
      popup.querySelector('[data-field="to"]').value = "2026-10-01";
      popup.querySelector('[data-action="preview"]').click();
      await pending;
      const error = document.querySelector('[data-popup="error"]');
      assert.match(error.textContent, /올바르지 않습니다|PRINT_RANGE|2026-10-09/);
      assert.equal(popupFits(error).fits, true);
    });
  });
  h.test("preview page tabs scroll with chevrons when they overflow", async () => {
    await withApp(async ({ app }) => {
      const dates = Array.from({ length: 40 }, (_, index) => `2026-10-${String((index % 28) + 1).padStart(2, "0")}`);
      app.currentTab().weather = {
        daily: dates.map((date) => ({ date, tempMin: 1, tempMax: 2, precip: 0, wind: 1, code: 1, bySource: {} })),
        hourly: [],
        sources: [],
      };
      const pending = app.openPrint();
      await settle();
      document.querySelector('[data-popup="print"] [data-action="preview"]').click();
      await settle();
      const popup = document.querySelector('[data-popup="preview"]');
      const next = popup.querySelector('[data-action="tab-next"]');
      assert.equal(next.disabled, false);
      const before = popup.querySelector(".popup-tab").dataset.tab;
      next.click();
      assert.notEqual(popup.querySelector(".popup-tab").dataset.tab, before);
      assert.equal(popup.querySelector(".scrollbar"), null);
      popup.querySelector('[data-action="close"]').click();
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
  h.test("ctrl+n discards unsaved work into a new document", async () => {
    await withApp(async ({ app }) => {
      app.currentTab().properties.label = "keep-me";
      app.markDirty();
      press("n", { ctrlKey: true });
      await settle();
      const unsaved = document.querySelector('[data-popup="unsaved"]');
      assert.ok(unsaved);
      unsaved.querySelector('[data-action="discard"]').click();
      await settle();
      assert.equal(app.doc.dirty, false);
      assert.equal(app.doc.tabs.length, 1);
      assert.notEqual(app.currentTab().properties.label, "keep-me");
      assert.equal(app.root.querySelector(".tabbar").hidden, true);
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
  h.test("a favorite and an extra tab can be undone, and tabs are not city names", async () => {
    await withApp(async ({ app }) => {
      await app.run("add-tab");
      assert.equal(app.root.querySelector(".tabbar").hidden, false);
      assert.deepEqual(
        [...app.root.querySelectorAll("[data-gui='tab']")].map((tab) => tab.textContent),
        ["1", "2"],
      );
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("서울"), false);
      await app.run("toggle-favorite");
      assert.match(app.root.querySelector(".tab.is-active").textContent, /^★ /);
      app.undo();
      assert.equal(app.root.querySelector(".tab.is-active").textContent, "2");
      await app.run("close-tab");
      assert.equal(app.doc.tabs.length, 1);
      assert.equal(app.root.querySelector(".tabbar").hidden, true);
      app.undo();
      assert.equal(app.doc.tabs.length, 2);
      assert.equal(app.root.querySelector(".tabbar").hidden, false);
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
      assert.ok(buttons.length >= 10);
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
