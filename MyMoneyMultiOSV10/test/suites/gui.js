import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/core/errors.js";
import { serializeDocument } from "../../src/core/document.js";
import { sanitizeSettings } from "../../src/core/settings.js";
import { DARK_THEMES, LIGHT_THEMES, THEMES } from "../../src/core/themes.js";
import { SETTINGS_MAX_HEIGHT, SETTINGS_MIN_HEIGHT, buildAboutSpec, bootPopup, fitPopupToViewport, popupFits, tallestPanelHeight } from "../../src/ui/popups.js";
import { WINDOW_MIN } from "../../src/ui/window-spec.js";
import { NEWS_ROW, panelMaxBody } from "../../src/ui/market-view.js";
import { SAMPLE_DATES, createMemoryPlatform, defaultFetch, jsonResponse, newsBody, settle, textResponse, withApp, yahooBody } from "../support.js";

export function registerGui(h) {
  h.category("Window");
  h.test("the title bar shows the icon and MyMoney V1.0 without a market name", async () => {
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
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("한국거래소"), false);
      assert.equal(title.textContent, "MyMoney V1.0");
      assert.equal(app.titleText, "MyMoney V1.0");
      assert.equal(document.title, "MyMoney V1.0");
      assert.match(icon.getAttribute("src"), /icon\.png$/);
      assert.equal(getComputedStyle(bar).display, "flex");
      assert.ok(Number.parseFloat(getComputedStyle(icon).width) > 0);
      app.markDirty();
      assert.equal(app.titleText, "MyMoney V1.0");
      assert.equal(title.textContent, "MyMoney V1.0");
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
  h.test("dragging the quote area moves the window and buttons still run", async () => {
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
      const stocks = app.root.querySelector('[data-cmd="stocks"]');
      pointer(stocks, "pointerdown", 1, 1);
      pointer(document, "pointermove", 30, 30);
      pointer(document, "pointerup", 30, 30);
      assert.equal(app.shell.style.transform, "translate(20px, 12px)");
      stocks.click();
      assert.equal(app.root.querySelector("[data-popup='panel']") != null, true);
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
  h.test("the window shows the live quote, and the three buttons open their windows", async () => {
    await withApp(async ({ app }) => {
      assert.equal(app.root.querySelector("#left-panel"), null);
      assert.equal(app.root.querySelector("#right-panel"), null);
      const scene = app.root.querySelector("[data-gui='scene']");
      assert.ok(scene);
      assert.equal(scene.querySelector(".scene-svg").getAttribute("width"), "160");
      const buttons = [...app.root.querySelectorAll("[data-gui='range-button']")];
      assert.deepEqual(buttons.map((button) => button.dataset.cmd), ["stocks", "rates", "news"]);
      assert.deepEqual(buttons.map((button) => button.title), ["주식 시세", "환율", "오늘의 뉴스"]);
      assert.ok(buttons.every((button) => button.querySelector("svg") && !button.querySelector(".tool-label")));
      const background = getComputedStyle(app.frame).backgroundColor;
      assert.ok(background === "rgba(0, 0, 0, 0)" || background === "transparent", background);
      await app.refreshMarket();
      assert.match(app.root.querySelector(".scene-price").textContent, /\d/);
      assert.equal(app.root.querySelector(".tabbar").hidden, true);
      await app.setTransparency(80);
      const stocks = await openPanel(app, "stocks");
      assert.equal(stocks.popup.dataset.popup, "panel");
      assert.equal(stocks.popup.dataset.panelKind, "stocks");
      // The quote and rate windows carry the date and time they were drawn.
      assert.match(stocks.popup.querySelector(".popup-title").textContent, /^주식 시세 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      assert.ok(stocks.popup.querySelector("[data-symbol]"));
      assert.equal(popupFits(stocks.popup).fits, true);
      assert.equal(getComputedStyle(stocks.popup).backgroundImage, getComputedStyle(app.shell).backgroundImage);
      await stocks.close();
      const rates = await openPanel(app, "rates");
      assert.match(rates.popup.querySelector(".popup-title").textContent, /^환율 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      assert.ok(rates.popup.querySelector('[data-gui="rates"]'));
      await rates.close();
      const news = await openPanel(app, "news");
      // The headlines are not a snapshot of a moment, so that window keeps its plain title.
      assert.equal(news.popup.querySelector(".popup-title").textContent, "오늘의 뉴스");
      assert.ok(news.popup.querySelector('[data-gui="news-board"]'));
      await news.close();
    });
  });
  h.test("the stocks, rates, and news windows use the background image", async () => {
    await withApp(async ({ app }) => {
      await app.setWallpaper("data:image/png;base64,bbbb", "chart.png");
      app.settings.backgroundOpacity = 25;
      app.applyWallpaper(25);
      for (const panel of ["stocks", "rates", "news"]) {
        const pending = app.showPanel(panel);
        await settle();
        const popup = document.querySelector('[data-popup="panel"]');
        const layer = popup.querySelector("[data-gui='wallpaper']");
        assert.equal(layer.dataset.image, "yes", panel);
        assert.equal(layer.style.backgroundImage, app.wallpaper.style.backgroundImage, panel);
        assert.equal(layer.style.opacity, "0.25", panel);
        app.applyWallpaper(60);
        assert.equal(layer.style.opacity, "0.6", panel);
        popup.querySelector('[data-action="close"]').click();
        await pending;
      }
      await app.setWallpaper("", "");
      const pending = app.showPanel("stocks");
      await settle();
      const cleared = document.querySelector('[data-popup="panel"] [data-gui="wallpaper"]');
      assert.equal(cleared.dataset.image, "no");
      assert.equal(cleared.style.opacity, "0");
      document.querySelector('[data-popup="panel"] [data-action="close"]').click();
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
      app.currentTab().properties.label = "tech";
      app.markDirty();
      const cancelled = app.requestClose();
      const unsaved = document.querySelector('[data-popup="unsaved"]');
      assert.ok(unsaved);
      assert.equal(popupFits(unsaved).fits, true);
      unsaved.querySelector('[data-action="cancel"]').click();
      assert.equal(await cancelled, "cancelled");
      assert.equal(app.closed, false);
      platform.nextSavePath = "C:/docs/keep.mymoney";
      const closing = app.requestClose();
      document.querySelector('[data-popup="unsaved"] [data-action="save"]').click();
      assert.equal(await closing, "closed");
      assert.equal(platform.quit, 1);
      assert.match(platform.files.get("C:/docs/keep.mymoney"), /tech/);
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
      for (const id of ["refresh", "undo", "redo", "copy", "paste", "print", "choose-wallpaper", "clear-wallpaper", "settings", "about", "exit"]) {
        assert.ok(ids.includes(id), id);
      }
      // Boards save themselves into the settings, so there is no file to open or save.
      for (const id of ["new", "open", "save", "save-as"]) assert.ok(!ids.includes(id), id);
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
  h.test("window menu commands run and no file list appears in it", async () => {
    await withApp(async ({ app }) => {
      app.recent.add("C:/docs/recent.mymoney");
      app.openMenu("window", { clientX: 10, clientY: 10 }, { atPointer: true });
      const menu = document.querySelector('.menu-popup[data-menu="window"]');
      assert.equal(menu.querySelector('[data-cmd^="recent:"]'), null);
      menu.querySelector('[data-cmd="about"]').click();
      await settle();
      assert.ok(document.querySelector('[data-popup="about"]'));
      document.querySelector('[data-popup="about"] [data-action="close"]').click();
      await settle();
    });
  });
  h.test("the context menu copies the chosen quote and can remove it", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      const stocks = await openPanel(app, "stocks");
      const row = stocks.popup.querySelector('[data-symbol="000660.KS"]');
      assert.ok(row);
      row.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
      await settle();
      const menu = document.querySelector('.menu-popup[data-menu="context"]');
      assert.ok(menu);
      assert.equal(menu.dataset.columns, "1");
      assert.equal(menu.querySelector('[data-cmd="choose-wallpaper"] .menu-label').textContent, "배경 선택");
      assert.equal(menu.querySelector('[data-cmd="add-symbol"] .menu-label').textContent, "종목 추가");
      assert.equal(menu.querySelector('[data-cmd="remove-symbol"] .menu-label').textContent, "종목 제거");
      // Add sits straight above Remove, and carries a colourful icon like the rest.
      const order = [...menu.querySelectorAll("[data-cmd]")].map((row) => row.dataset.cmd);
      assert.equal(order.indexOf("add-symbol") + 1, order.indexOf("remove-symbol"));
      assert.match(menu.querySelector('[data-cmd="add-symbol"]').innerHTML, /(?:fill|stroke)="#[0-9a-f]{6}"/i);
      assert.match(menu.querySelector('[data-cmd="choose-wallpaper"]').innerHTML, /fill="#2f94ff"/);
      assert.match(menu.querySelector('[data-cmd="clear-wallpaper"]').innerHTML, /fill="#e5484d"/);
      menu.querySelector('[data-cmd="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /000660\.KS/);
      app.openMenu("context", { clientX: 20, clientY: 20 }, { atPointer: true });
      document.querySelector('.menu-popup[data-menu="context"] [data-cmd="remove-symbol"]').click();
      await settle();
      assert.equal(app.currentTab().board.symbols.some((entry) => entry.symbol === "000660.KS"), false);
      app.undo();
      assert.equal(app.currentTab().board.symbols.some((entry) => entry.symbol === "000660.KS"), true);
      platform.nextImage = { dataUrl: "data:image/png;base64,aaaa", name: "chart.png", type: "image/png", size: 120 };
      app.openMenu("context", { clientX: 20, clientY: 20 }, { atPointer: true });
      document.querySelector('.menu-popup[data-menu="context"] [data-cmd="choose-wallpaper"]').click();
      await settle();
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "yes");
      app.openMenu("context", { clientX: 20, clientY: 20 }, { atPointer: true });
      document.querySelector('.menu-popup[data-menu="context"] [data-cmd="clear-wallpaper"]').click();
      await settle();
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "no");
      await stocks.close();
    });
  });

  h.category("Market GUI");
  h.test("refresh aggregates quotes, rates, and headlines into the three windows", async () => {
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
      assert.equal(app.root.textContent.includes("Yahoo Finance"), false);
      const settings = app.showSettings("data");
      await settle();
      const data = document.querySelector('[data-popup="settings"]');
      assert.equal(data.querySelector('[data-row="source-yahoo"] .source-state').textContent, "정상");
      assert.equal(data.querySelector('[data-row="source-yahoo2"] .source-state').textContent, "정상");
      assert.equal(data.querySelector('[data-row="source-gnews"] .source-state').textContent, "정상");
      assert.equal(data.querySelector('[data-row="source-wires"] .source-state').textContent, "정상");
      const states = [...data.querySelectorAll(".source-state")];
      assert.equal(states.length, 6);
      for (const state of states) {
        assert.equal(getComputedStyle(state).width, "72px");
        assert.equal(getComputedStyle(state).textAlign, "left");
      }
      data.querySelector('[data-action="cancel"]').click();
      await settings;
      const stocks = await openPanel(app, "stocks");
      assert.equal(stocks.popup.querySelectorAll("[data-symbol]").length, 3);
      const indexRow = stocks.popup.querySelector('[data-gui="index"]');
      assert.ok(indexRow);
      // The index row shows the benchmark's name, not its raw ticker.
      assert.equal(indexRow.querySelector(".quote-name strong").textContent, "코스피");
      assert.equal(indexRow.querySelector(".quote-name em").textContent, "^KS11");
      await stocks.close();
      app.currentTab().properties.alertHigh = "1";
      const alerted = await openPanel(app, "stocks");
      assert.ok(alerted.popup.querySelector(".quote-row.is-alert"));
      await alerted.close();
    });
  });
  h.test("the three panels lay out quotes, rates, and headlines in rows", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const stocks = await openPanel(app, "stocks");
      const head = stocks.popup.querySelector('[data-gui="quote-head"]');
      assert.deepEqual([...head.children].map((cell) => cell.textContent), ["종목", "거래소", "현재가", "전일 대비", "등락률", "거래량", ""]);
      assert.equal(getComputedStyle(head).display, "grid");
      const row = stocks.popup.querySelector('[data-symbol="005930.KS"]');
      assert.equal(row.dataset.tone, "gain");
      assert.match(row.querySelector(".quote-percent").textContent, /^\+/);
      assert.equal(getComputedStyle(row).borderTopWidth, "0px");
      const raised = [...document.styleSheets[0].cssRules].find(
        (rule) => squashSpace(rule.selectorText) === ".quote-row:hover, .rate-row:hover, .news-row:hover, .quote-row:focus-visible, .news-row:focus-visible",
      );
      assert.ok(raised, "hover rule");
      assert.match(raised.cssText, /translateY\(-2px\)/);
      await stocks.close();

      const rates = await openPanel(app, "rates");
      const pairs = [...rates.popup.querySelectorAll("[data-code]")].map((node) => node.dataset.code);
      assert.ok(pairs.includes("USD"));
      assert.ok(pairs.includes("JPY"));
      // 0.00075 USD per won is unreadable, so the row is flipped to won per dollar.
      assert.equal(rates.popup.querySelector('[data-code="USD"]').dataset.pair, "USD/KRW");
      assert.match(rates.popup.querySelector('[data-code="USD"]').textContent, /USD\/KRW\s*1,3\d\d/);
      assert.match(rates.popup.textContent, /미국 달러/);
      await rates.close();

      const news = await openPanel(app, "news");
      const items = [...news.popup.querySelectorAll('[data-gui="news"]')];
      assert.equal(items.length, 3);
      assert.match(items[0].dataset.link, /^https:\/\//);
      assert.ok(items.every((row) => row.querySelector(".news-thumb")));
      // Only the item whose feed offered a picture gets one.
      const pictured = items.filter((row) => row.querySelector(".news-thumb img"));
      assert.equal(pictured.length, 1);
      assert.match(pictured[0].querySelector(".news-thumb img").getAttribute("src"), /^https:\/\/img\.example\//);
      assert.equal(pictured[0].querySelector(".news-thumb img").getAttribute("referrerpolicy"), "no-referrer");
      assert.equal(pictured[0].querySelector(".news-thumb").dataset.image, "yes");
      await news.close();

      await app.setLanguage("en");
      const ratesEn = await openPanel(app, "rates");
      assert.match(ratesEn.popup.textContent, /US Dollar/);
      await ratesEn.close();
      const stocksEn = await openPanel(app, "stocks");
      assert.match(stocksEn.popup.textContent, /Samsung Electronics/);
      await stocksEn.close();
    });
  });
  h.test("clicking a headline opens it in the browser", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      const news = await openPanel(app, "news");
      news.popup.querySelector('[data-gui="news"]').click();
      await settle();
      assert.match(platform.external.at(-1), /^https:\/\/news\.example\//);
      await news.close();
    });
  });
  h.test("failed quote sources show a copyable error popup", async () => {
    await withApp(async ({ app, platform }) => {
      platform.fetchImpl = async () => jsonResponse({ reason: "offline" }, false, 500);
      await app.run("refresh");
      const popup = document.querySelector('[data-popup="error"]');
      assert.ok(popup);
      assert.match(popup.textContent, /All quote sources failed|QUOTE_ALL_FAILED|005930/);
      assert.equal(popup.style.overflow, "hidden");
      assert.equal(popupFits(popup).fits, true);
      popup.querySelector('[data-action="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /HTTP 500/);
    });
  });
  h.test("one dead source still leaves a board on screen", async () => {
    await withApp(async ({ app }) => {
      app.platform.fetchImpl = async (url) => {
        const href = String(url);
        if (href.includes("query2")) return jsonResponse({ chart: { error: { description: "Service unavailable" } } }, false, 503);
        if (href.includes("/v8/finance/chart/")) {
          const symbol = decodeURIComponent(href.split("/chart/")[1].split("?")[0]);
          return jsonResponse(yahooBody(symbol, SAMPLE_DATES, 100, 2, "KRW"));
        }
        if (href.includes("news.google")) return textResponse("<rss></rss>", false, 500);
        return jsonResponse({}, false, 503);
      };
      await app.refreshMarket();
      assert.equal(document.querySelector('[data-popup="error"]'), null);
      assert.equal(app.currentTab().data.quotes.length, 3);
      assert.equal(app.currentTab().data.rates.rows.length, 0);
      assert.equal(app.currentTab().data.news.length, 0);
      const rates = await openPanel(app, "rates");
      assert.match(rates.popup.textContent, /환율 정보가 없습니다/);
      await rates.close();
      const news = await openPanel(app, "news");
      assert.match(news.popup.textContent, /뉴스가 없습니다/);
      await news.close();
    });
  });
  h.test("online search, download, and the source link show progress", async () => {
    await withApp(async ({ app, platform }) => {
      const original = platform.fetchImpl;
      platform.fetchImpl = async (url, options) => {
        if (String(url).includes("finance/search")) {
          return jsonResponse({ quotes: [{ symbol: "7203.T", longname: "Toyota Motor", exchDisp: "TSE", quoteType: "EQUITY" }] });
        }
        return original(url, options);
      };
      app.searchQuery = "toyota";
      await app.searchOnline();
      assert.equal(app.listingDraft.symbol, "7203.T");
      assert.equal(app.listingDraft.marketCode, "JP");
      await app.refreshMarket();
      platform.nextSavePath = "C:/docs/korea.json";
      let duringDownload = false;
      const saveFile = platform.saveFile.bind(platform);
      platform.saveFile = async (opts) => {
        duringDownload = Boolean(document.querySelector('[data-popup="progress"]'));
        return saveFile(opts);
      };
      await app.downloadMarket();
      assert.equal(duringDownload, true);
      assert.match(platform.files.get("C:/docs/korea.json"), /005930\.KS/);
      await app.openSourceLink();
      assert.match(platform.external.at(-1), /finance\.yahoo\.com\/quote\/005930/);
    });
  });

  h.test("the news panel shows ten at a time and pages through the rest", async () => {
    const many = Array.from({ length: 23 }, (_, i) => `헤드라인 ${i + 1}`);
    await withApp(
      async ({ app }) => {
        await app.refreshMarket();
        const news = await openPanel(app, "news");
        const titles = () => [...news.popup.querySelectorAll('[data-gui="news"]')].map((row) => row.title);
        const board = () => news.popup.querySelector('[data-gui="news-board"]');
        // A page is ten, never more. The feed decides the order, so the test
        // follows which headlines appear rather than which comes first.
        assert.equal(titles().length, 10);
        const pageOne = titles();
        // Nothing scrolls, because nothing overflows.
        assert.ok(board().scrollHeight <= board().clientHeight + 1, `${board().scrollHeight} fits ${board().clientHeight}`);
        // The pager says how many pages there are: 23 headlines make three.
        const bar = news.popup.querySelector('[data-gui="pager-bar"]');
        assert.ok(bar, "the pager is under the list");
        assert.equal(bar.dataset.pages, "3");
        const numbers = [...bar.querySelectorAll(".pager-num")].map((b) => b.textContent);
        assert.deepEqual(numbers, ["1", "2", "3"]);
        assert.equal(bar.querySelector(".pager-num.is-current").textContent, "1");
        // First and previous are spent on page one; next and last are not.
        const step = (id) => bar.querySelector(`[data-pager="${id}"]`);
        assert.equal(step("first").disabled, true);
        assert.equal(step("prev").disabled, true);
        assert.equal(step("next").disabled, false);
        assert.equal(step("last").disabled, false);
        // Each step is an icon, not a character.
        for (const id of ["first", "prev", "next", "last"]) {
          assert.ok(step(id).querySelector("svg"), `${id} is an icon`);
          assert.equal(step(id).textContent.trim(), "", `${id} carries no text`);
        }
        // Next moves on to ten different headlines.
        step("next").click();
        await settle();
        const pageTwo = titles();
        assert.equal(pageTwo.length, 10);
        assert.equal(pageOne.some((title) => pageTwo.includes(title)), false, "a page repeats nothing");
        // The last page holds the remainder: 23 headlines, so three.
        news.popup.querySelector('[data-gui="pager-bar"] [data-pager="last"]').click();
        await settle();
        const pageThree = titles();
        assert.equal(pageThree.length, 3);
        // Between them the pages account for every headline exactly once.
        const seen = new Set([...pageOne, ...pageTwo, ...pageThree]);
        assert.equal(seen.size, 23, `${seen.size} of 23`);
        // A number jumps straight to that page.
        [...news.popup.querySelectorAll(".pager-num")].find((b) => b.textContent === "2").click();
        await settle();
        assert.deepEqual(titles(), pageTwo);
        // The window never resized while paging.
        assert.equal(Number(news.popup.querySelector('[data-gui="panel"]').dataset.fitHeight) > 0, true);
        await news.close();
      },
      {
        fetch: (url, options) => {
          const href = String(url);
          if (href.includes("news.google.com")) return textResponse(newsBody(many));
          if (href.includes("yna.co.kr") || href.includes("bbci.co.uk")) return textResponse(newsBody(many));
          return defaultFetch(href, options);
        },
      },
    );
  });
  h.test("a short list gets no pager at all", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const news = await openPanel(app, "news");
      const rows = news.popup.querySelectorAll('[data-gui="news"]').length;
      assert.ok(rows >= 1 && rows <= 10, `${rows} headlines`);
      assert.equal(news.popup.querySelector('[data-gui="pager-bar"]'), null, "one page needs no pager");
      await news.close();
    });
  });
  h.test("the quote panel pages too, ten symbols at a time", async () => {
    await withApp(async ({ app }) => {
      // Fill the watchlist past a single page.
      const held = new Set(app.currentTab().board.symbols.map((entry) => entry.symbol));
      for (const entry of app.listingChoices()) {
        if (held.has(entry.symbol)) continue;
        if (app.addSymbol(entry.symbol) !== "added") break;
        held.add(entry.symbol);
        if (held.size >= 13) break;
      }
      await app.refreshMarket();
      const stocks = await openPanel(app, "stocks");
      const shown = () => [...stocks.popup.querySelectorAll('[data-gui="quote"]')].map((row) => row.dataset.symbol);
      assert.equal(shown().length, 10, shown().join(", "));
      const bar = stocks.popup.querySelector('[data-gui="pager-bar"]');
      assert.ok(bar, "the quote panel has a pager");
      assert.equal(bar.dataset.pages, "2");
      const first = shown();
      bar.querySelector('[data-pager="next"]').click();
      await settle();
      const second = shown();
      assert.equal(second.length, 3, second.join(", "));
      assert.equal(first.some((symbol) => second.includes(symbol)), false, "a page shows its own symbols");
      // The rows on the new page can still be dragged.
      for (const row of stocks.popup.querySelectorAll('[data-gui="quote"]')) {
        assert.ok(row.querySelector("[data-grip]"), "the new rows carry grips");
      }
      await stocks.close();
    });
  });
  h.test("rows keep their height instead of being squeezed into the window", async () => {
    // jsdom does no layout, so the guard is on the rules that decide it:
    // a row in a column flex board must not shrink, or every row loses height.
    const rules = [...document.styleSheets[0].cssRules];
    const find = (selector) => rules.find((rule) => squashSpace(rule.selectorText) === selector);
    const shared = find(".quote-row, .rate-row, .news-row");
    assert.ok(shared, "shared row rule");
    assert.match(squashSpace(shared.cssText), /flex: 0 0 32px/);
    assert.match(squashSpace(shared.cssText), /height: 32px/);
    const news = find(".news-row");
    assert.ok(news, "news row rule");
    assert.match(squashSpace(news.cssText), /flex: 0 0 48px/);
    assert.match(squashSpace(news.cssText), /height: 48px/);
  });
  h.test("the quote and rate boards scroll their rows while the titles stay put", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const stocks = await openPanel(app, "stocks");
      const board = stocks.popup.querySelector('[data-gui="stocks"]');
      const head = board.querySelector('[data-gui="quote-head"]');
      const rows = board.querySelector('[data-gui="quote-rows"]');
      assert.ok(head && rows, "the board has a head and a row scroller");
      // The head is a sibling of the scroller, never inside it.
      assert.equal(head.parentElement, board);
      assert.equal(rows.parentElement, board);
      assert.equal(rows.contains(head), false);
      assert.ok(board.querySelectorAll('[data-gui="quote-rows"] .quote-row').length >= 1);
      assert.equal(getComputedStyle(rows).overflowY, "auto");
      // The head reserves the scrollbar gutter, so the columns line up.
      // jsdom resolves neither calc() nor var(), so read the rule itself.
      const gutter = [...document.styleSheets[0].cssRules].find(
        (rule) => squashSpace(rule.selectorText) === ".panel-fit .quote-head, .panel-fit .rate-head",
      );
      assert.ok(gutter, "gutter rule");
      assert.match(squashSpace(gutter.cssText), /padding-right: calc\(10px \+ var\(--scrollbar, 0px\)\)/);
      await stocks.close();

      const rates = await openPanel(app, "rates");
      const rateBoard = rates.popup.querySelector('[data-gui="rates"]');
      const rateRows = rateBoard.querySelector('[data-gui="rate-rows"]');
      assert.ok(rateRows, "the rate board has a row scroller");
      assert.equal(rateRows.contains(rateBoard.querySelector('[data-gui="rate-head"]')), false);
      assert.equal(getComputedStyle(rateRows).overflowY, "auto");
      await rates.close();
    });
  });
  h.test("a long watchlist makes the quote panel taller instead of scrolling", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const short = await openPanel(app, "stocks");
      const shortFit = Number(short.popup.querySelector('[data-gui="panel"]').dataset.fitHeight);
      const shortRows = short.popup.querySelectorAll('[data-gui="quote"]').length;
      await short.close();
      // Add symbols until the watchlist is well past the old 420px cap.
      const held = new Set(app.currentTab().board.symbols.map((entry) => entry.symbol));
      for (const entry of app.listingChoices()) {
        if (held.has(entry.symbol)) continue;
        if (app.addSymbol(entry.symbol) !== "added") break;
        held.add(entry.symbol);
        if (held.size >= 14) break;
      }
      await app.refreshMarket();
      const tall = await openPanel(app, "stocks");
      const tallFit = Number(tall.popup.querySelector('[data-gui="panel"]').dataset.fitHeight);
      const tallRows = tall.popup.querySelectorAll('[data-gui="quote"]').length;
      assert.ok(tallRows > shortRows, `${tallRows} > ${shortRows}`);
      assert.ok(tallFit > shortFit, `the panel grew: ${tallFit} > ${shortFit}`);
      assert.ok(tallFit > 420, `${tallFit} is past the old fixed cap`);
      // And it is still within what the screen offers.
      assert.ok(tallFit <= panelMaxBody(app.screenHeight()));
      await tall.close();
    });
  });
  h.test("a short news list neither scrolls nor leaves the window oversized", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const news = await openPanel(app, "news");
      const board = news.popup.querySelector('[data-gui="news-board"]');
      const rows = board.querySelectorAll('[data-gui="news"]');
      assert.ok(rows.length >= 1 && rows.length <= 10, `drew ${rows.length} headlines`);
      const fit = news.popup.querySelector('[data-gui="panel"]');
      assert.equal(Number(fit.dataset.fitHeight), 30 + rows.length * 50);
      await news.close();
    });
  });

  h.test("a popup opened over another one hands the channel back when it closes", async () => {
    // Native popups share one message channel. The window on top installs its
    // handler, and closing it must hand the channel back to the one below -
    // which is still on screen. Open the stocks panel, drop a picture on the
    // window, answer the question, and the panel must still take clicks.
    const platform = createMemoryPlatform();
    platform.nativePopups = true;
    let releaseOuter;
    let releaseInner;
    const seen = [];
    platform.openPopup = (spec) => {
      seen.push(spec.type);
      return spec.type === "panel"
        ? new Promise((resolve) => (releaseOuter = resolve))
        : new Promise((resolve) => (releaseInner = resolve));
    };
    await withApp(
      async ({ app }) => {
        const panelHandler = (msg) => ({ from: "panel", type: msg.type });
        const panel = app.openPopup({ type: "panel", panel: "stocks" }, { immediate: panelHandler });
        await settle();
        assert.equal(app.nativeImmediate, panelHandler, "the panel is listening");
        // A second window opens over it, carrying no handler of its own.
        const confirm = app.openPopup({ type: "wallpaper-drop" });
        await settle();
        assert.equal(app.nativeImmediate, null, "the window on top holds the channel");
        releaseInner({ action: "cancel" });
        await confirm;
        assert.equal(app.nativeImmediate, panelHandler, "the panel gets the channel back");
        releaseOuter({ action: "close" });
        await panel;
        assert.equal(app.nativeImmediate, null, "nothing is left listening");
        assert.deepEqual(seen, ["panel", "wallpaper-drop"]);
      },
      { platform },
    );
  });

  h.test("the context menu can add a symbol, opening the page that holds the pickers", async () => {
    await withApp(async ({ app }) => {
      app.openMenu("context", { clientX: 20, clientY: 20 }, { atPointer: true });
      await settle();
      const entry = document.querySelector('.menu-popup[data-menu="context"] [data-cmd="add-symbol"]');
      assert.ok(entry, "the context menu offers 종목 추가");
      entry.click();
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.ok(popup, "Settings opens");
      // It lands on the Watchlist page, where the market, symbol and Add live.
      const page = popup.querySelector(".popup-panel:not([hidden])");
      assert.equal(page.dataset.panel, "watchlist");
      for (const field of ["marketCode", "symbol"]) assert.ok(page.querySelector(`[data-field="${field}"]`), field);
      assert.ok(page.querySelector('[data-action="add-symbol"]'), "the Add button");
      // And adding from there works, as it does from the page itself.
      const held = new Set(app.currentTab().board.symbols.map((item) => item.symbol));
      const free = [...page.querySelector('[data-field="symbol"]').options].map((o) => o.value).find((v) => !held.has(v));
      page.querySelector('[data-field="symbol"]').value = free;
      popup.querySelector('[data-action="add-symbol"]').click();
      await settle();
      assert.ok(app.currentTab().board.symbols.some((item) => item.symbol === free));
      popup.querySelector('[data-action="cancel"]').click();
      await settle();
    });
  });
  h.test("the Fonts command opens the page the font settings now live on", async () => {
    await withApp(async ({ app }) => {
      // The font tab was merged into the background one; the command followed.
      const pending = app.run("fonts");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const page = popup.querySelector(".popup-panel:not([hidden])");
      assert.equal(page.dataset.panel, "wallpaper");
      assert.ok(page.querySelector('[data-field="fontFamily"]'), "the font picker is on it");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });

  h.test("a quote row can be dragged into a new place and the order is kept", async () => {
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        await app.refreshMarket();
        const stocks = await openPanel(app, "stocks");
        const list = stocks.popup.querySelector('[data-gui="quote-rows"]');
        const symbolsOf = () => [...list.querySelectorAll("[data-symbol]")].map((row) => row.dataset.symbol);
        const before = symbolsOf();
        assert.ok(before.length >= 3, before.join(", "));
        // Every row carries a grip; the index row is not part of the watchlist.
        for (const row of list.querySelectorAll("[data-symbol]")) assert.ok(row.querySelector("[data-grip]"));
        const index = list.querySelector('[data-gui="index"]');
        if (index) assert.equal(index.querySelector("[data-grip]")?.innerHTML || "", "", "the index has no grip");
        // Drag the last row onto the first one, above its midpoint.
        const rows = [...list.querySelectorAll("[data-symbol]")];
        const moved = rows[rows.length - 1];
        const target = rows[0];
        target.getBoundingClientRect = () => ({ top: 100, height: 32, bottom: 132, left: 0, right: 100, width: 100 });
        dragRowByGrip(moved, target);
        // It has already moved on screen.
        assert.equal(symbolsOf()[0], before[before.length - 1], symbolsOf().join(", "));
        await settle();
        assert.equal(moved.classList.contains("is-dragging"), false);
        // And the watchlist itself now carries that order ...
        const expected = [before[before.length - 1], ...before.slice(0, -1)];
        assert.deepEqual(app.currentTab().board.symbols.map((entry) => entry.symbol), expected);
        // ... saved, so the next launch opens with it.
        assert.deepEqual(platform.settings.defaultBoard.symbols.map((entry) => entry.symbol), expected);
        // Undo puts it back.
        app.undo();
        assert.deepEqual(app.currentTab().board.symbols.map((entry) => entry.symbol), before);
        await stocks.close();
      },
      { platform },
    );
  });
  h.test("a rate row can be dragged into a new place and the order is kept", async () => {
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        await app.refreshMarket();
        const rates = await openPanel(app, "rates");
        const list = rates.popup.querySelector('[data-gui="rate-rows"]');
        const codesOf = () => [...list.querySelectorAll("[data-code]")].map((row) => row.dataset.code);
        const before = codesOf();
        assert.ok(before.length >= 3, before.join(", "));
        const rows = [...list.querySelectorAll("[data-code]")];
        const moved = rows[rows.length - 1];
        const target = rows[0];
        target.getBoundingClientRect = () => ({ top: 60, height: 30, bottom: 90, left: 0, right: 100, width: 100 });
        dragRowByGrip(moved, target);
        await settle();
        const expected = [before[before.length - 1], ...before.slice(0, -1)];
        assert.deepEqual(app.settings.rateCurrencies, expected);
        assert.deepEqual(platform.settings.rateCurrencies, expected, "saved too");
        await rates.close();
      },
      { platform },
    );
  });

  h.test("the saved watchlist opens on a platform that only reads settings asynchronously", async () => {
    // The desktop build has no synchronous read, so the document is built from
    // the defaults and must be rebuilt once the saved settings arrive. Tests
    // that use the synchronous read never exercise that path.
    const platform = createMemoryPlatform();
    // The desktop platform has no synchronous read and its async read goes
    // straight to the file, so model both rather than delegating.
    platform.readSettingsSync = null;
    platform.readSettings = async () => (platform.settings ? structuredClone(platform.settings) : null);
    let added = "";
    await withApp(
      async ({ app }) => {
        const held = new Set(app.currentTab().board.symbols.map((entry) => entry.symbol));
        added = app.listingChoices().map((entry) => entry.symbol).find((symbol) => !held.has(symbol));
        assert.equal(app.addSymbol(added), "added");
        await settle();
        assert.ok(platform.settings.defaultBoard.symbols.some((entry) => entry.symbol === added));
      },
      { platform },
    );
    // A fresh launch on the same stored settings shows it.
    await withApp(
      async ({ app }) => {
        const symbols = app.currentTab().board.symbols.map((entry) => entry.symbol);
        assert.ok(symbols.includes(added), `after restart: ${symbols.join(", ")}`);
        // The board on screen is the saved one, not the starter list.
        assert.deepEqual(symbols, platform.settings.defaultBoard.symbols.map((entry) => entry.symbol));
        assert.equal(app.root.querySelector(".scene-name") !== null, true);
      },
      { platform },
    );
  });
  h.test("a document already opened is not replaced when the settings arrive", async () => {
    const platform = createMemoryPlatform();
    // The desktop platform has no synchronous read and its async read goes
    // straight to the file, so model both rather than delegating.
    platform.readSettingsSync = null;
    platform.readSettings = async () => (platform.settings ? structuredClone(platform.settings) : null);
    await withApp(
      async ({ app }) => {
        app.addSymbol(app.listingChoices().map((e) => e.symbol).find((symbol) => !app.currentTab().board.symbols.some((s) => s.symbol === symbol)));
        await settle();
      },
      { platform },
    );
    const saved = platform.settings.defaultBoard.symbols.map((entry) => entry.symbol);
    // Opening a file during start-up must win over the saved watchlist.
    await withApp(
      async ({ app }) => {
        app.doc.filePath = "C:/money/other.mymoney";
        await app.ready;
        assert.equal(app.doc.filePath, "C:/money/other.mymoney");
      },
      { platform, app: { autoLoad: false } },
    );
    assert.ok(saved.length >= 1);
  });

  h.test("the Settings lists reorder by their grips as well", async () => {
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("watchlist");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const list = popup.querySelector('[data-gui="watchlist"]');
        const codesOf = () => [...list.querySelectorAll("[data-watch]")].map((row) => row.dataset.watch);
        const before = codesOf();
        assert.ok(before.length >= 3, before.join(", "));
        const rows = [...list.querySelectorAll("[data-watch]")];
        const moved = rows[rows.length - 1];
        const target = rows[0];
        // The list is two columns, so it is the horizontal midpoint that decides.
        target.getBoundingClientRect = () => ({ top: 0, height: 26, bottom: 26, left: 40, right: 240, width: 200 });
        dragRowByGrip(moved, target, { vertical: false });
        await settle();
        const expected = [before[before.length - 1], ...before.slice(0, -1)];
        assert.deepEqual(codesOf(), expected, "the list shows the new order");
        assert.deepEqual(app.currentTab().board.symbols.map((entry) => entry.symbol), expected);
        popup.querySelector('[data-action="ok"]').click();
        await pending;
        assert.deepEqual(platform.settings.defaultBoard.symbols.map((entry) => entry.symbol), expected, "saved on OK");
      },
      { platform },
    );
  });
  h.test("the Settings currency list reorders by its grips too", async () => {
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("rates");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const list = popup.querySelector('[data-gui="ratelist"]');
        assert.ok(list, "the currency list is on the page");
        const codesOf = () => [...list.querySelectorAll("[data-watch]")].map((row) => row.dataset.watch);
        const before = codesOf();
        assert.ok(before.length >= 3, before.join(", "));
        const rows = [...list.querySelectorAll("[data-watch]")];
        const moved = rows[rows.length - 1];
        const target = rows[0];
        target.getBoundingClientRect = () => ({ top: 0, height: 26, bottom: 26, left: 40, right: 240, width: 200 });
        dragRowByGrip(moved, target, { vertical: false });
        await settle();
        const expected = [before[before.length - 1], ...before.slice(0, -1)];
        assert.deepEqual(app.settings.rateCurrencies, expected);
        popup.querySelector('[data-action="ok"]').click();
        await pending;
        assert.deepEqual(platform.settings.rateCurrencies, expected, "saved on OK");
      },
      { platform },
    );
  });

  h.category("Watchlist");  h.test("a market and a symbol can be chosen and added from Settings", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const market = popup.querySelector('[data-field="marketCode"]');
      const symbol = popup.querySelector('[data-field="symbol"]');
      assert.equal(market.value, "KR");
      assert.deepEqual([...market.options].slice(0, 2).map((option) => option.value), ["KR", "US"]);
      assert.match(market.options[0].textContent, /대한민국/);
      assert.ok([...symbol.options].some((option) => option.value === "005930.KS"));
      market.value = "US";
      market.dispatchEvent(new window.Event("change", { bubbles: true }));
      assert.ok([...symbol.options].every((option) => !option.value.includes(".KS")));
      assert.ok([...symbol.options].some((option) => option.value === "TSLA"));
      symbol.value = "TSLA";
      popup.querySelector('[data-action="add-symbol"]').click();
      await settle();
      const board = app.currentTab().board;
      assert.equal(board.marketCode, "US");
      assert.equal(board.currency, "USD");
      // The watchlist spans exchanges: the Korean listings stay, TSLA joins them.
      assert.deepEqual(board.symbols.map((entry) => entry.symbol), ["005930.KS", "000660.KS", "035420.KS", "TSLA"]);
      assert.deepEqual([...new Set(board.symbols.map((entry) => entry.marketCode))], ["KR", "US"]);
      assert.match(app.root.querySelector("[data-gui='toast']").textContent, /테슬라/);
      assert.equal(popup.querySelector('[data-gui="watchlist"]').querySelectorAll("[data-watch]").length, 4);
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("choosing, adding, and listing symbols all sit on the Watchlist page", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("watchlist");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const page = popup.querySelector('.popup-panel[data-panel="watchlist"]');
      assert.ok(page, "the Watchlist page exists");
      // The market picker, the symbol picker, Add, search, and the list are one page.
      for (const field of ["marketCode", "symbol", "search"]) {
        assert.ok(page.querySelector(`[data-field="${field}"]`), field);
      }
      for (const action of ["add-symbol", "search-online"]) {
        assert.ok(page.querySelector(`[data-action="${action}"]`), action);
      }
      assert.ok(page.querySelector('[data-gui="watchlist"]'), "the list itself");
      // Search comes before the symbol picker: look one up, then choose and add it.
      const order = [...page.children].map((row) => row.dataset.row).filter(Boolean);
      assert.deepEqual(order, [
        "marketCode",
        "search",
        "search-online",
        "symbol",
        "add-symbol",
        "watchlistHint",
        "watchlist",
        "sceneMode",
        "rotateSeconds",
      ]);
      // And none of them is left behind on the General page.
      const general = popup.querySelector('.popup-panel[data-panel="general"]');
      for (const field of ["marketCode", "symbol", "search"]) {
        assert.equal(general.querySelector(`[data-field="${field}"]`), null, `${field} left General`);
      }
      assert.equal(general.querySelector('[data-action="add-symbol"]'), null, "Add left General");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("a symbol added in Settings shows at once, Cancel drops it, OK keeps it for the next launch", async () => {
    const platform = createMemoryPlatform();
    let added = "";
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("watchlist");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const field = popup.querySelector('[data-field="symbol"]');
        const held = new Set(app.currentTab().board.symbols.map((entry) => entry.symbol));
        // Pick an option the default watchlist does not already hold.
        added = [...field.options].map((option) => option.value).find((value) => !held.has(value));
        assert.ok(added, "an addable symbol exists");
        field.value = added;
        popup.querySelector('[data-action="add-symbol"]').click();
        await settle();
        // The board shows it straight away ...
        assert.ok(app.currentTab().board.symbols.some((entry) => entry.symbol === added));
        // ... but nothing is written while the window is open.
        assert.equal(platform.settings?.defaultBoard?.symbols.some((entry) => entry.symbol === added) || false, false);
        // Cancel puts the watchlist back as it was.
        popup.querySelector('[data-action="cancel"]').click();
        await pending;
        await settle();
        assert.equal(app.currentTab().board.symbols.some((entry) => entry.symbol === added), false);
        assert.equal(platform.settings.defaultBoard.symbols.some((entry) => entry.symbol === added), false);
        // OK keeps it.
        const again = app.showSettings("watchlist");
        await settle();
        const second = document.querySelector('[data-popup="settings"]');
        second.querySelector('[data-field="symbol"]').value = added;
        second.querySelector('[data-action="add-symbol"]').click();
        await settle();
        second.querySelector('[data-action="ok"]').click();
        await again;
        await settle();
        assert.ok(platform.settings.defaultBoard.symbols.some((entry) => entry.symbol === added));
      },
      { platform },
    );
    // A fresh app on the same stored settings opens with the symbol in place.
    await withApp(
      async ({ app }) => {
        assert.ok(app.currentTab().board.symbols.some((entry) => entry.symbol === added));
      },
      { platform },
    );
  });
  h.test("removing a symbol is saved at once too", async () => {
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        const first = app.currentTab().board.symbols[0].symbol;
        app.removeSymbol(first);
        await settle();
        assert.equal(
          platform.settings.defaultBoard.symbols.some((entry) => entry.symbol === first),
          false,
          `${first} is gone from the saved settings`,
        );
      },
      { platform },
    );
    await withApp(
      async ({ app }) => {
        assert.ok(app.currentTab().board.symbols.length >= 1);
      },
      { platform },
    );
  });
  h.test("switching markets from the Watchlist page is saved on OK", async () => {
    const platform = createMemoryPlatform();
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("watchlist");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const market = popup.querySelector('[data-field="marketCode"]');
        market.value = "US";
        market.dispatchEvent(new window.Event("change", { bubbles: true }));
        popup.querySelector('[data-field="symbol"]').value = "TSLA";
        popup.querySelector('[data-action="add-symbol"]').click();
        await settle();
        assert.equal(app.currentTab().board.marketCode, "US");
        popup.querySelector('[data-action="ok"]').click();
        await pending;
        assert.equal(platform.settings.defaultBoard.marketCode, "US");
        assert.ok(platform.settings.defaultBoard.symbols.some((entry) => entry.symbol === "TSLA"));
      },
      { platform },
    );
  });
  h.test("a symbol found by online search can be added and is saved", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) {
        return jsonResponse({ quotes: [{ symbol: "7203.T", longname: "Toyota Motor", exchDisp: "TSE", quoteType: "EQUITY" }] });
      }
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("watchlist");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        popup.querySelector('[data-field="search"]').value = "toyota";
        popup.querySelector('[data-action="search-online"]').click();
        await settle();
        // The hit becomes a listing the pickers can offer.
        assert.equal(app.listingDraft.symbol, "7203.T");
        assert.ok(app.listingChoices().some((entry) => entry.symbol === "7203.T"));
        // Adding it lands on the board and in the saved settings.
        app.addSymbol("7203.T");
        await settle();
        assert.ok(app.currentTab().board.symbols.some((entry) => entry.symbol === "7203.T"));
        popup.querySelector('[data-action="ok"]').click();
        await pending;
        assert.ok(platform.settings.defaultBoard.symbols.some((entry) => entry.symbol === "7203.T"));
      },
      { platform },
    );
  });
  h.test("a search that finds nothing says so and changes no symbols", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) return jsonResponse({ quotes: [] });
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const before = app.currentTab().board.symbols.map((entry) => entry.symbol);
        const pending = app.searchAndPick("nothing-like-this");
        await settle();
        // An empty search is an answer, not an error popup.
        const popup = document.querySelector('[data-popup="search-results"]');
        assert.ok(popup, "the result window opens");
        assert.equal(document.querySelector('[data-popup="error"]'), null, "no error popup");
        assert.match(popup.textContent, /검색 결과가 없습니다/);
        assert.match(popup.textContent, /nothing-like-this/);
        assert.equal(popup.querySelectorAll('[data-gui="pick"]').length, 0);
        popup.querySelector('[data-action="cancel"]').click();
        assert.equal(await pending, null);
        assert.deepEqual(app.currentTab().board.symbols.map((entry) => entry.symbol), before);
      },
      { platform },
    );
  });
  h.test("a search lists what it found and the chosen one can be added", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) {
        return jsonResponse({
          quotes: [
            { symbol: "7203.T", longname: "Toyota Motor", exchDisp: "TSE", quoteType: "EQUITY" },
            { symbol: "7267.T", longname: "Honda Motor", exchDisp: "TSE", quoteType: "EQUITY" },
            { symbol: "TM", longname: "Toyota Motor ADR", exchDisp: "NYSE", quoteType: "EQUITY" },
          ],
        });
      }
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.searchAndPick("toyota");
        await settle();
        const popup = document.querySelector('[data-popup="search-results"]');
        assert.ok(popup, "the result window opens");
        // Every hit is listed with its name, symbol and exchange.
        const picks = [...popup.querySelectorAll('[data-gui="pick"]')];
        assert.deepEqual(picks.map((row) => row.dataset.symbol), ["7203.T", "7267.T", "TM"]);
        // The built-in catalogue answers first, so the row carries its Korean name.
        assert.match(picks[0].textContent, /도요타|Toyota Motor/);
        assert.match(picks[0].textContent, /7203\.T/);
        assert.match(popup.textContent, /3건을 찾았습니다/);
        // Choosing one closes the window and hands it back.
        picks[1].click();
        const chosen = await pending;
        assert.equal(chosen.symbol, "7267.T");
        assert.equal(chosen.marketCode, "JP");
        assert.equal(document.querySelector('[data-popup="search-results"]'), null, "the window closed");
        // It is now offered by the pickers, and adding it works.
        assert.ok(app.listingChoices().some((entry) => entry.symbol === "7267.T"));
        assert.equal(app.addSymbol("7267.T"), "added");
        assert.ok(app.currentTab().board.symbols.some((entry) => entry.symbol === "7267.T"));
      },
      { platform },
    );
  });
  h.test("searching 삼성전자 lists the ordinary share and the preferred one by name", async () => {
    // Yahoo answers with the parent company name for every listing, so the
    // preferred share is indistinguishable unless the catalogue names it.
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) {
        return jsonResponse({
          quotes: [
            { symbol: "005930.KS", longname: "Samsung Electronics Co., Ltd.", exchDisp: "KSC", quoteType: "EQUITY" },
            { symbol: "005935.KS", longname: "Samsung Electronics Co., Ltd.", exchDisp: "KSC", quoteType: "EQUITY" },
            { symbol: "SSNLF", longname: "Samsung Electronics Co., Ltd.", exchDisp: "OTC", quoteType: "EQUITY" },
          ],
        });
      }
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.searchAndPick("삼성전자");
        await settle();
        const popup = document.querySelector('[data-popup="search-results"]');
        const rows = [...popup.querySelectorAll('[data-gui="pick"]')];
        const named = new Map(rows.map((row) => [row.dataset.symbol, row.querySelector(".pick-name").textContent]));
        assert.equal(named.get("005930.KS"), "삼성전자");
        assert.equal(named.get("005935.KS"), "삼성전자우", "the preferred share is named, not left as the English one");
        popup.querySelector('[data-action="cancel"]').click();
        await pending;
      },
      { platform },
    );
  });
  h.test("pressing Enter in the search box runs the search", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) return jsonResponse({ quotes: [] });
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("watchlist");
        await settle();
        const settings = document.querySelector('[data-popup="settings"]');
        const box = settings.querySelector('[data-field="search"]');
        // The box says which button its Enter key stands for.
        assert.equal(box.dataset.submit, "search-online");
        box.value = "삼성전자";
        box.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await settle();
        const popup = document.querySelector('[data-popup="search-results"]');
        assert.ok(popup, "Enter alone opened the result window");
        const rows = [...popup.querySelectorAll('[data-gui="pick"]')].map((row) => row.dataset.symbol);
        assert.ok(rows.includes("005930.KS"), rows.join(", "));
        popup.querySelector('[data-action="cancel"]').click();
        await settle();
        // Enter did not also press OK and close Settings.
        assert.ok(document.querySelector('[data-popup="settings"]'), "Settings is still open");
        settings.querySelector('[data-action="cancel"]').click();
        await pending;
      },
      { platform },
    );
  });

  h.test("a Korean name is searched even though the online search refuses one", async () => {
    // Yahoo answers 400 "Invalid Search Query" to anything outside ASCII, so a
    // Korean name is matched in the catalogue and Yahoo is asked in English.
    const platform = createMemoryPlatform();
    const asked = [];
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      const href = String(url);
      if (href.includes("finance/search")) {
        const q = new URL(href).searchParams.get("q") || "";
        asked.push(q);
        if (!/^[\x20-\x7E]+$/.test(q)) return jsonResponse({ finance: { error: "Invalid Search Query" } }, false, 400);
        return jsonResponse({ quotes: [{ symbol: "005935.KS", longname: "Samsung Electronics Pfd", exchDisp: "KSC", quoteType: "EQUITY" }] });
      }
      return original(href, options);
    };
    await withApp(
      async ({ app }) => {
        const rows = await app.searchOnline("삼성전자");
        const symbols = rows.map((row) => row.symbol);
        // The catalogue match comes first, the online hit joins it.
        assert.ok(symbols.includes("005930.KS"), `삼성전자: ${symbols.join(", ")}`);
        assert.ok(symbols.includes("005935.KS"), `삼성전자우: ${symbols.join(", ")}`);
        // Yahoo was never sent the Korean text; it was asked in English.
        assert.ok(!asked.some((q) => /[^\x20-\x7E]/.test(q)), `asked: ${asked.join(" | ")}`);
        assert.ok(asked.length >= 1, "the online search was still used");
      },
      { platform },
    );
  });
  h.test("the result window still opens when the online search fails", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) return jsonResponse({ error: "nope" }, false, 400);
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.searchAndPick("삼성전자");
        await settle();
        const popup = document.querySelector('[data-popup="search-results"]');
        assert.ok(popup, "a failed online search still opens the window");
        assert.equal(document.querySelector('[data-popup="error"]'), null, "and not an error popup");
        // The catalogue match is listed, with a note that the online part was quiet.
        const picks = [...popup.querySelectorAll('[data-gui="pick"]')].map((row) => row.dataset.symbol);
        assert.ok(picks.includes("005930.KS"), picks.join(", "));
        assert.match(popup.textContent, /온라인 검색은 응답하지 않아/);
        popup.querySelector('[data-action="cancel"]').click();
        await pending;
      },
      { platform },
    );
  });
  h.test("a query that matches nothing at all still opens the window", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) return jsonResponse({ quotes: [] });
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.searchAndPick("zzzzz-nothing");
        await settle();
        const popup = document.querySelector('[data-popup="search-results"]');
        assert.ok(popup, "the window opens");
        assert.equal(popup.querySelectorAll('[data-gui="pick"]').length, 0);
        assert.match(popup.textContent, /검색 결과가 없습니다/);
        popup.querySelector('[data-action="cancel"]').click();
        assert.equal(await pending, null);
      },
      { platform },
    );
  });
  h.test("the Settings search button opens the result window and fills the pickers", async () => {
    const platform = createMemoryPlatform();
    const original = platform.fetchImpl;
    platform.fetchImpl = async (url, options) => {
      if (String(url).includes("finance/search")) {
        return jsonResponse({ quotes: [{ symbol: "7203.T", longname: "Toyota Motor", exchDisp: "TSE", quoteType: "EQUITY" }] });
      }
      return original(url, options);
    };
    await withApp(
      async ({ app }) => {
        const pending = app.showSettings("watchlist");
        await settle();
        const settings = document.querySelector('[data-popup="settings"]');
        settings.querySelector('[data-field="search"]').value = "toyota";
        settings.querySelector('[data-action="search-online"]').click();
        await settle();
        const results = document.querySelector('[data-popup="search-results"]');
        assert.ok(results, "the result window opens over Settings");
        results.querySelector('[data-gui="pick"]').click();
        await settle();
        // The pickers now stand on the hit, ready for Add.
        assert.equal(settings.querySelector('[data-field="marketCode"]').value, "JP");
        assert.equal(settings.querySelector('[data-field="symbol"]').value, "7203.T");
        settings.querySelector('[data-action="add-symbol"]').click();
        await settle();
        assert.ok(app.currentTab().board.symbols.some((entry) => entry.symbol === "7203.T"));
        settings.querySelector('[data-action="cancel"]').click();
        await pending;
      },
      { platform },
    );
  });
  h.test("the same symbol cannot be added twice and the cap is respected", async () => {
    await withApp(async ({ app }) => {
      const already = app.currentTab().board.symbols[0].symbol;
      assert.equal(app.addSymbol(already), "exists");
      const free = app.listingChoices().find((entry) => !app.currentTab().board.symbols.some((s) => s.symbol === entry.symbol));
      assert.equal(app.addSymbol(free.symbol), "added");
      assert.equal(app.addSymbol(free.symbol), "exists");
      assert.equal(app.addSymbol("NOT-A-SYMBOL"), "none");
    });
  });
  h.test("the watchlist page lists the symbols and removes one at a time", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("watchlist");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const box = popup.querySelector('[data-gui="watchlist"]');
      assert.ok(box);
      assert.equal(popupFits(popup).fits, true);
      assert.equal(box.querySelectorAll("[data-watch]").length, 3);
      assert.match(box.textContent, /삼성전자/);
      box.querySelector('[data-action="symbol-remove"]').click();
      await settle();
      assert.equal(app.currentTab().board.symbols.length, 2);
      assert.equal(box.querySelectorAll("[data-watch]").length, 2);
      assert.match(app.statusMessage, /제거/);
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      app.undo();
      assert.equal(app.currentTab().board.symbols.length, 3);
    });
  });
  h.test("a watchlist refuses duplicates, a full list, and its last symbol", async () => {
    await withApp(async ({ app }) => {
      assert.equal(app.addSymbol("005930.KS"), "exists");
      assert.equal(app.statusMessage, "이미 담긴 종목입니다.");
      assert.equal(app.addSymbol("000270.KS"), "added");
      assert.equal(app.addSymbol("NOT.REAL"), "none");
      while (app.currentTab().board.symbols.length > 1) {
        app.removeSymbol(app.currentTab().board.symbols.at(-1).symbol);
      }
      assert.equal(app.currentTab().board.symbols.length, 1);
      assert.equal(app.removeSymbol(app.currentTab().board.symbols[0].symbol), "last");
      assert.equal(app.statusMessage, "마지막 종목은 제거할 수 없습니다.");
    });
  });
  h.test("choosing another market moves the benchmark but keeps the watchlist", async () => {
    await withApp(async ({ app }) => {
      const before = app.currentTab().board.symbols.map((entry) => entry.symbol);
      assert.ok(before.length >= 1);
      assert.equal(app.applyMarket("JP"), true);
      const board = app.currentTab().board;
      // The market decides the benchmark index and the board currency ...
      assert.equal(board.marketCode, "JP");
      assert.equal(board.currency, "JPY");
      assert.equal(board.index, "^N225");
      // ... but the listings already being watched are not thrown away.
      assert.deepEqual(board.symbols.map((entry) => entry.symbol), before);
      assert.equal(board.activeSymbol, before[0]);
      assert.equal(app.applyMarket("JP"), false);
      app.undo();
      assert.equal(app.currentTab().board.marketCode, "KR");
      assert.deepEqual(app.currentTab().board.symbols.map((entry) => entry.symbol), before);
    });
  });
  h.test("one watchlist can hold listings from several exchanges at once", async () => {
    await withApp(async ({ app }) => {
      app.applyMarket("US");
      assert.equal(app.addSymbol("AAPL"), "added");
      app.applyMarket("JP");
      assert.equal(app.addSymbol("7203.T"), "added");
      const board = app.currentTab().board;
      const codes = board.symbols.map((entry) => entry.marketCode);
      assert.ok(codes.includes("KR") && codes.includes("US") && codes.includes("JP"), codes.join(","));
      // The board names the exchange for every row, so the mix stays readable.
      await app.refreshMarket();
      const stocks = await openPanel(app, "stocks");
      const rows = [...stocks.popup.querySelectorAll('[data-gui="quote"]')];
      const shown = new Map(rows.map((row) => [row.dataset.symbol, row.querySelector(".quote-exchange").textContent]));
      assert.equal(shown.get("AAPL"), "US");
      assert.equal(shown.get("7203.T"), "JP");
      assert.equal(shown.get("005930.KS"), "KR");
      await stocks.close();
    });
  });
  h.test("the base currency converts every price when Settings asks for it", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const native = app.root.querySelector(".scene-price").textContent;
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.deepEqual([...popup.querySelector('[data-field="units"]').options].map((option) => option.value), ["native", "base"]);
      popup.querySelector('[data-field="units"]').value = "base";
      // The base currency lives on the Currencies page, but it is one form.
      popup.querySelector('[data-field="baseCurrency"]').value = "USD";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.units, "base");
      assert.equal(app.settings.baseCurrency, "USD");
      const converted = app.root.querySelector(".scene-price").textContent;
      assert.notEqual(converted, native);
      const stocks = await openPanel(app, "stocks");
      assert.match(stocks.popup.querySelector('[data-symbol="005930.KS"] .quote-price').textContent, /0\.0/);
      await stocks.close();
    });
  });

  h.category("Showing symbols");
  h.test("clicking the quote area moves to the next watched symbol and wraps", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const scene = () => app.root.querySelector("[data-gui='scene']");
      const name = () => app.root.querySelector(".scene-name").textContent;
      assert.equal(scene().dataset.sceneAdvance, "1");
      assert.equal(scene().title, "눌러서 다음 종목 보기");
      assert.equal(name(), "삼성전자");
      scene().click();
      assert.equal(name(), "SK하이닉스");
      scene().click();
      assert.equal(name(), "NAVER");
      // The last symbol wraps back to the first.
      scene().click();
      assert.equal(name(), "삼성전자");
      assert.equal(app.currentTab().selectedSymbol, "005930.KS");
      assert.match(app.selectionText, /005930\.KS/);
    });
  });
  h.test("a one-symbol watchlist has nothing to advance to", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      app.removeSymbol("000660.KS");
      app.removeSymbol("035420.KS");
      assert.equal(app.currentTab().board.symbols.length, 1);
      app.renderMarket();
      assert.equal(app.root.querySelector("[data-gui='scene']").dataset.sceneAdvance, undefined);
      assert.equal(app.cycleSymbol(1), "005930.KS");
    });
  });
  h.test("the click that ends a window drag does not change the symbol", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const before = app.root.querySelector(".scene-name").textContent;
      pointer(app.content, "pointerdown", 20, 20);
      pointer(document, "pointermove", 90, 60);
      pointer(document, "pointerup", 90, 60);
      await settle();
      app.content.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      assert.equal(app.root.querySelector(".scene-name").textContent, before);
      // Once the drag is forgotten, a plain click works again.
      await new Promise((resolve) => setTimeout(resolve, 200));
      app.root.querySelector("[data-gui='scene']").click();
      assert.notEqual(app.root.querySelector(".scene-name").textContent, before);
    });
  });
  h.test("the context menu advances the symbol without a click on the scene", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      app.openMenu("context", { clientX: 10, clientY: 10 }, { atPointer: true });
      const menu = document.querySelector('.menu-popup[data-menu="context"]');
      assert.equal(menu.querySelector('[data-cmd="next-symbol"] .menu-label').textContent, "다음 종목");
      menu.querySelector('[data-cmd="next-symbol"]').click();
      await settle();
      assert.equal(app.root.querySelector(".scene-name").textContent, "SK하이닉스");
    });
  });
  h.test("the chosen interval moves the window on by itself", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      assert.equal(app.rotateTimer, null);
      const pending = app.showSettings("watchlist");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const field = popup.querySelector('[data-field="rotateSeconds"]');
      assert.deepEqual([...field.options].map((option) => option.value), ["0", "3", "5", "10", "30", "60"]);
      assert.equal(field.selectedOptions[0].textContent, "끔");
      field.value = "3";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.rotateSeconds, 3);
      assert.equal(platform.settings.rotateSeconds, 3);
      assert.equal(app.rotateDelay, 3000);
      assert.ok(app.rotateTimer);
      // Drive it by hand instead of waiting three seconds.
      const first = app.root.querySelector(".scene-name").textContent;
      app.cycleSymbol(1);
      assert.notEqual(app.root.querySelector(".scene-name").textContent, first);
      // Turning it off stops the timer.
      app.settings.rotateSeconds = 0;
      app.syncRotateTimer();
      assert.equal(app.rotateTimer, null);
    });
  });
  h.test("rotation really fires on its interval and stops when the window closes", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    const app = createApp(root, { platform, autoLoad: false, now: () => new Date(2026, 9, 7, 9, 0, 0) });
    try {
      await app.ready;
      await app.refreshMarket();
      app.settings.rotateSeconds = 3;
      app.syncRotateTimer();
      assert.equal(app.rotateDelay, 3000);
      let ticks = 0;
      const cycle = app.cycleSymbol.bind(app);
      app.cycleSymbol = (delta) => {
        ticks += 1;
        return cycle(delta);
      };
      // Drive the armed timer faster than three seconds so the test stays quick.
      clearInterval(app.rotateTimer);
      app.rotateTimer = setInterval(() => app.cycleSymbol(1), 20);
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.ok(ticks >= 2, `fired ${ticks} times`);
      app.destroy();
      const stopped = ticks;
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(app.rotateTimer, null);
      assert.equal(ticks, stopped);
    } finally {
      app.destroy();
      root.remove();
    }
  });
  h.test("the whole watchlist fits a window that grows with it", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      const pending = app.showSettings("watchlist");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const mode = popup.querySelector('[data-field="sceneMode"]');
      assert.deepEqual([...mode.options].map((option) => option.value), ["single", "all"]);
      assert.equal(mode.selectedOptions[0].textContent, "한 종목씩");
      mode.value = "all";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.sceneMode, "all");
      assert.equal(app.content.dataset.sceneMode, "all");
      const board = app.root.querySelector("[data-gui='board']");
      assert.ok(board);
      assert.equal(app.root.querySelector(".market-scene"), null);
      // Three symbols plus the index.
      const rows = board.querySelectorAll(".quote-row");
      assert.equal(rows.length, 4);
      assert.equal(app.shellSize.height, 46 + 26 + 4 * 34 + 4);
      assert.equal(app.shell.style.height, `${app.shellSize.height}px`);
      assert.deepEqual(platform.settings.windowSize, { ...app.shellSize });
      const before = app.shellSize.height;
      // One more symbol makes the window one row taller, once its quote lands.
      app.addSymbol("000270.KS");
      await waitFor(() => (app.currentTab().data.quotes || []).some((quote) => quote.symbol === "000270.KS"));
      assert.equal(app.root.querySelectorAll("[data-gui='board'] .quote-row").length, 5);
      assert.equal(app.shellSize.height, before + 34);
      // Removing it takes the row, and the height, straight back.
      app.removeSymbol("000270.KS");
      await settle();
      assert.equal(app.shellSize.height, before);
    });
  });
  h.test("leaving the whole-watchlist view gives the window its old size back", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const original = { ...app.shellSize };
      app.settings.sceneMode = "all";
      app.applyAll();
      assert.notDeepEqual({ ...app.shellSize }, original);
      app.settings.sceneMode = "single";
      app.applyAll();
      assert.deepEqual({ ...app.shellSize }, original);
      assert.ok(app.root.querySelector(".market-scene"));
    });
  });
  h.test("on the desktop the whole-watchlist window is sized through the main process", async () => {
    const { createMemoryPlatform } = await import("../support.js");
    const platform = createMemoryPlatform();
    platform.nativeWindow = true;
    await withApp(
      async ({ app }) => {
        await app.refreshMarket();
        app.settings.sceneMode = "all";
        app.applyAll();
        await settle();
        assert.equal(platform.resizeTargets.length, 1);
        assert.equal(platform.resizeTargets[0].height, 46 + 26 + 4 * 34 + 4);
        assert.ok(platform.resizeTargets[0].width >= 620);
      },
      { platform },
    );
  });
  h.test("a whole-watchlist row still chooses the symbol it was clicked on", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      app.settings.sceneMode = "all";
      app.applyAll();
      const row = app.root.querySelector('[data-symbol="035420.KS"]');
      assert.ok(row);
      row.click();
      assert.equal(app.currentTab().selectedSymbol, "035420.KS");
      app.settings.sceneMode = "single";
      app.applyAll();
      assert.equal(app.root.querySelector(".scene-name").textContent, "NAVER");
    });
  });

  h.test("adding to the board re-fetches even while a refresh is already running", async () => {
    await withApp(async ({ app, platform }) => {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const original = platform.fetchImpl;
      const asked = [];
      platform.fetchImpl = async (url, options) => {
        asked.push(String(url));
        await gate;
        return original(url, options);
      };
      // Start a quiet refresh and leave it hanging.
      void app.refreshMarket({ quiet: true });
      await settle();
      assert.ok(app.refreshJob, "a refresh should be in flight");
      asked.length = 0;
      app.addSymbol("000270.KS");
      await new Promise((resolve) => setTimeout(resolve, 150));
      // The new symbol was fetched instead of being skipped.
      assert.ok(asked.some((url) => url.includes("000270.KS")), asked.join(" | "));
      release();
      await settle();
      await settle();
      assert.ok(app.currentTab().data.quotes.some((quote) => quote.symbol === "000270.KS"));
    });
  });

  h.test("the trend arrow head points the same way its line travels", async () => {
    await withApp(async ({ app }) => {
      // A gain rises to the right, a loss falls to the right; neither points straight down.
      for (const [trend, rising] of [["up", true], ["down", false]]) {
        const art = renderArt(app, rising);
        assert.equal(art.dataset.art, trend, trend);
        const line = lastSegment(art);
        const tip = arrowTip(art);
        assert.ok(line.dx > 0, `${trend} line should travel right, got dx=${line.dx}`);
        assert.equal(line.dy < 0, rising, `${trend} line direction`);
        // The head's square corner is the tip; it has to sit at the far end of the line.
        assert.equal(tip.x, Math.max(...tip.xs), `${trend} tip should be the right-most corner`);
        assert.equal(
          tip.y,
          rising ? Math.min(...tip.ys) : Math.max(...tip.ys),
          `${trend} tip should be the ${rising ? "highest" : "lowest"} corner`,
        );
        // The tip continues the line rather than doubling back under it.
        assert.ok(tip.x >= line.x, `${trend} tip must be beyond the line end`);
        assert.equal(tip.y > line.y, !rising, `${trend} tip must continue the line's slope`);
      }
    });
  });

  h.category("Currencies");
  h.test("currencies can be added and removed, and the base is never listed", async () => {
    await withApp(async ({ app, platform }) => {
      assert.deepEqual(app.settings.rateCurrencies, ["USD", "JPY", "EUR", "CNY"]);
      const pending = app.showSettings("rates");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const list = popup.querySelector('[data-gui="ratelist"]');
      assert.ok(list);
      assert.equal(popupFits(popup).fits, true);
      assert.deepEqual([...list.querySelectorAll("[data-watch]")].map((row) => row.dataset.watch), ["USD", "JPY", "EUR", "CNY"]);
      assert.match(list.textContent, /미국 달러/);
      const picker = popup.querySelector('[data-field="currency"]');
      // The base and anything already listed are not offered again.
      const offered = [...picker.options].map((option) => option.value);
      assert.equal(offered.includes("KRW"), false);
      assert.equal(offered.includes("USD"), false);
      assert.ok(offered.includes("THB"));
      picker.value = "THB";
      popup.querySelector('[data-action="add-currency"]').click();
      await settle();
      assert.deepEqual(app.settings.rateCurrencies, ["USD", "JPY", "EUR", "CNY", "THB"]);
      assert.equal(list.querySelectorAll("[data-watch]").length, 5);
      assert.match(app.root.querySelector("[data-gui='toast']").textContent, /태국 바트/);
      list.querySelector('[data-action="currency-remove"]').click();
      await settle();
      assert.deepEqual(app.settings.rateCurrencies, ["JPY", "EUR", "CNY", "THB"]);
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(platform.settings.rateCurrencies.includes("USD"), false);
      // One undo takes back everything the Settings window changed.
      app.undo();
      assert.deepEqual(app.settings.rateCurrencies, ["USD", "JPY", "EUR", "CNY"]);
    });
  });
  h.test("the rate panel lists exactly the chosen currencies and grows with them", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const first = await openPanel(app, "rates");
      assert.deepEqual([...first.popup.querySelectorAll("[data-code]")].map((row) => row.dataset.code), ["USD", "JPY", "EUR", "CNY"]);
      const shortHeight = parseInt(first.popup.style.height, 10);
      await first.close();
      app.addCurrency("GBP");
      await settle();
      const second = await openPanel(app, "rates");
      assert.deepEqual(
        [...second.popup.querySelectorAll("[data-code]")].map((row) => row.dataset.code),
        ["USD", "JPY", "EUR", "CNY", "GBP"],
      );
      // One more currency, one more row of window: a 32px row and its 2px gap.
      assert.equal(parseInt(second.popup.style.height, 10) - shortHeight, 34);
      // And the rows really do fit in it, none clipped at the bottom.
      const board = second.popup.querySelector('[data-gui="rate-rows"]');
      assert.ok(board.scrollHeight <= board.clientHeight + 1, `${board.scrollHeight} fits ${board.clientHeight}`);
      assert.equal(popupFits(second.popup).fits, true);
      await second.close();
    });
  });
  h.test("a currency fetched only to convert a price is not listed", async () => {
    await withApp(async ({ app }) => {
      app.setRateCurrencies(["USD"]);
      app.applyMarket("JP");
      // The yen is needed to price a Tokyo listing in won, so it is fetched...
      assert.ok(app.fetchCurrencies(app.currentTab()).includes("JPY"));
      await app.refreshMarket();
      const rates = await openPanel(app, "rates");
      // ...but only the dollar was asked for, so only the dollar is listed.
      assert.deepEqual([...rates.popup.querySelectorAll("[data-code]")].map((row) => row.dataset.code), ["USD"]);
      await rates.close();
    });
  });
  h.test("changing the base currency drops it from the list", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("rates");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const base = popup.querySelector('[data-field="baseCurrency"]');
      base.value = "USD";
      base.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(app.settings.rateCurrencies.includes("USD"), false);
      assert.deepEqual(
        [...popup.querySelector('[data-gui="ratelist"]').querySelectorAll("[data-watch]")].map((row) => row.dataset.watch),
        ["JPY", "EUR", "CNY"],
      );
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.baseCurrency, "USD");
      assert.equal(app.settings.rateCurrencies.includes("USD"), false);
    });
  });

  h.category("Clipboard");
  h.test("ctrl+c copies the selected quote", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      app.selectSymbol("005930.KS");
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
      await settle();
      assert.match(platform.clipboardText, /삼성전자/);
      assert.match(platform.clipboardText, /005930\.KS/);
      platform.clipboardText = "pasted note";
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));
      await settle();
      assert.equal(JSON.stringify(app.doc).includes("pasted note"), false);
    });
  });

  h.category("Files");
  h.test("open and save remember the directory and recent files", async () => {
    await withApp(async ({ app, platform }) => {
      const text = serializeDocument(app.doc);
      platform.nextOpen = { path: "D:/money/a.mymoney", directory: "D:/money", text };
      await app.open();
      assert.equal(app.doc.filePath, "D:/money/a.mymoney");
      assert.equal(app.settings.lastDirectory, "D:/money");
      assert.equal(platform.lastStartDir, "");
      platform.nextSavePath = "D:/other/b.mymoney";
      app.markDirty();
      await app.saveAs();
      assert.equal(app.settings.lastDirectory, "D:/other");
      assert.equal(app.doc.dirty, false);
      platform.nextOpen = { path: "D:/other/c.mymoney", directory: "D:/other", text };
      await app.open();
      assert.equal(platform.lastStartDir, "D:/other");
      assert.equal(app.recent.items[0], "D:/other/c.mymoney");
    });
  });
  h.test("recent files stop at ten and can be removed one by one or all at once", async () => {
    await withApp(async ({ app }) => {
      for (let index = 0; index < 12; index += 1) app.recent.add(`C:/docs/file-${index}.mymoney`);
      assert.equal(app.recent.items.length, 10);
      // Files are no longer part of the menus; the list is only kept.
      app.openMenu("window", { clientX: 40, clientY: 40 }, { atPointer: true });
      await settle();
      const menu = document.querySelector(".menu-popup");
      assert.equal(menu.querySelectorAll('[data-cmd^="recent:"]').length, 0);
      app.closeMenu();
      await settle();
      app.removeRecent("C:/docs/file-11.mymoney");
      assert.equal(app.recent.items.length, 9);
      app.clearRecent();
      assert.equal(app.recent.items.length, 0);
      app.undo();
      assert.equal(app.recent.items.length, 9);
    });
  });
  h.test("invalid files and missing recent files show a specific error", async () => {
    await withApp(async ({ app, platform }) => {
      platform.nextOpen = { path: "C:/bad.mymoney", directory: "C:/", text: "{not json" };
      await app.open();
      let popup = document.querySelector('[data-popup="error"]');
      assert.match(popup.textContent, /Invalid document/);
      popup.querySelector('[data-action="close"]').click();
      app.recent.add("C:/missing.mymoney");
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
      const doc = new window.File([text], "dropped.mymoney", { type: "application/json" });
      await app.handleDroppedFiles([doc]);
      assert.equal(app.doc.filePath, "dropped.mymoney");
      const image = new window.File([Uint8Array.from([1, 2, 3, 4])], "wall.png", { type: "image/png" });
      Object.defineProperty(image, "size", { value: 50_000_000 });
      await answerWallpaperDrop(app, [image], "ok");
      assert.equal(app.wallpaper.dataset.image, "yes");
      assert.match(app.settings.backgroundImage, /^data:image\/png/);
      const unknown = new window.File(["hello"], "notes.txt", { type: "text/plain" });
      await app.handleDroppedFiles([unknown]);
      assert.match(document.querySelector('[data-popup="error"]').textContent, /notes\.txt/);
    });
  });
  h.test("a dropped picture becomes the background only once it is confirmed", async () => {
    await withApp(async ({ app }) => {
      const image = new window.File([Uint8Array.from([9, 9])], "photo.png", { type: "image/png" });
      // The dialog names the file, so the reader knows what is about to change.
      const pending = app.handleDroppedFiles([image]);
      await settle();
      const popup = document.querySelector('[data-popup="wallpaper-drop"]');
      assert.ok(popup, "the confirmation is asked for");
      assert.match(popup.textContent, /photo\.png/);
      // Nothing has changed while the question is on screen.
      assert.equal(app.settings.backgroundImage, "");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      assert.equal(app.settings.backgroundImage, "", "cancel leaves the background alone");
      assert.equal(app.wallpaper.dataset.image, "no");
      // Saying yes applies it.
      await answerWallpaperDrop(app, [image], "ok");
      assert.match(app.settings.backgroundImage, /^data:image\/png/);
    });
  });
  h.test("an icon file is turned away instead of becoming the background", async () => {
    await withApp(async ({ app }) => {
      // Windows reports an .ico as an image, so the name and the type both count.
      for (const [name, type] of [
        ["icon.ico", "image/x-icon"],
        ["icon.ico", "image/vnd.microsoft.icon"],
        ["icon.ico", ""],
        ["app.icns", "image/icns"],
      ]) {
        document.querySelector('[data-popup="error"]')?.remove();
        await app.handleDroppedFiles([new window.File([Uint8Array.from([1])], name, { type })]);
        await settle();
        assert.equal(document.querySelector('[data-popup="wallpaper-drop"]'), null, `${name} ${type}`);
        assert.equal(app.settings.backgroundImage, "", `${name} ${type} left the background alone`);
        const error = document.querySelector('[data-popup="error"]');
        assert.ok(error, `${name} ${type} is reported`);
        assert.match(error.textContent, /아이콘 파일/);
      }
    });
  });
  h.test("dragging the window's own picture cannot drop it back as the background", async () => {
    await withApp(async ({ app }) => {
      const bar = app.root.querySelector("[data-gui='titlebar']");
      const appIcon = bar.querySelector("img");
      // The app icon is not a drag source in the first place.
      assert.equal(appIcon.getAttribute("draggable"), "false");
      const rules = [...document.styleSheets[0].cssRules];
      const noDrag = rules.find((rule) => squashSpace(rule.selectorText) === "img, svg");
      assert.ok(noDrag, "pictures are not drag sources");
      assert.match(squashSpace(noDrag.cssText), /-webkit-user-drag: none/);
      // And if a drag does start inside the window, dropping it there does nothing.
      appIcon.dispatchEvent(new window.Event("dragstart", { bubbles: true }));
      assert.equal(app.draggingOwnContent, true);
      // jsdom has no constructible DataTransfer; the handler only reads `.files`.
      const drop = new window.Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(drop, "dataTransfer", {
        value: { files: [new window.File([Uint8Array.from([1])], "icon.png", { type: "image/png" })] },
      });
      app.frame.dispatchEvent(drop);
      await settle();
      assert.equal(document.querySelector('[data-popup="wallpaper-drop"]'), null, "nothing is asked");
      assert.equal(app.settings.backgroundImage, "", "the background is untouched");
      assert.equal(app.draggingOwnContent, false, "the flag clears for the next drop");
      // A drop that did not start inside the window still works.
      await answerWallpaperDrop(app, [new window.File([Uint8Array.from([2])], "wall.png", { type: "image/png" })], "ok");
      assert.match(app.settings.backgroundImage, /^data:image\/png/);
    });
  });
  h.test("settings and the last directory are restored on the next launch", async () => {
    await withApp(async ({ app, platform }) => {
      await app.setTheme("dark-midnight");
      await app.setTransparency(55);
      await app.setLanguage("en");
      app.rememberDir("E:/books");
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
        assert.equal(next.settings.lastDirectory, "E:/books");
        assert.equal(next.root.querySelector("[data-cmd='stocks']").title, "Stock quotes");
      } finally {
        next.destroy();
        root.remove();
      }
    });
  });

  h.category("Settings");
  h.test("settings cover language, theme, font, price display, and transparency", async () => {
    await withApp(async ({ app }) => {
      const fonts = Array.from({ length: 50 }, (_, index) => `Family ${index}`);
      app.fonts = fonts;
      const pending = app.showSettings("wallpaper");
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
      for (const flag of ["fontBold", "fontItalic"]) {
        const box = popup.querySelector(`[data-field="${flag}"]`);
        box.checked = true;
        box.dispatchEvent(new window.Event("change", { bubbles: true }));
      }
      popup.querySelector('[data-field="fontSize"]').value = "18";
      popup.querySelector('[data-field="language"]').value = "en";
      popup.querySelector('.swatch[data-theme-id="dark-forest"]').click();
      popup.querySelector('[data-field="transparency"]').value = "80";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.fontFamily, "Family 3");
      assert.equal(app.frame.style.fontWeight, "700");
      assert.equal(app.frame.style.fontStyle, "italic");
      assert.equal(app.frame.style.fontSize, "18px");
      assert.equal(app.settings.language, "en");
      assert.equal(app.frame.dataset.theme, "dark-forest");
      assert.equal(app.settings.transparency, 80);
      assert.equal(app.settings.updateMinutes, 10);
      assert.equal(app.i18n.missing.size, 0);
      app.undo();
      assert.equal(app.settings.theme, "dark-ink");
      assert.equal(app.settings.transparency, 30);
    });
  });
  h.test("font switches bold, italic, underline and strikethrough show at once on the quotes", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      const panel = await openPanel(app, "stocks");
      const pending = app.showSettings("wallpaper");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      assert.equal(popup.querySelector('[data-field="fontStyle"]'), null, "the single style list is gone");
      const toggles = [...popup.querySelectorAll('[data-gui="font-toggle"]')];
      assert.deepEqual(toggles.map((toggle) => toggle.dataset.toggle), ["fontBold", "fontItalic", "fontUnderline", "fontStrike"]);
      assert.deepEqual(toggles.map((toggle) => toggle.title), ["굵게", "기울임", "밑줄", "취소선"]);
      const flip = (flag) => {
        const box = popup.querySelector(`[data-field="${flag}"]`);
        box.checked = !box.checked;
        box.dispatchEvent(new window.Event("change", { bubbles: true }));
      };
      for (const flag of ["fontBold", "fontItalic", "fontUnderline", "fontStrike"]) flip(flag);
      const family = popup.querySelector('[data-field="fontFamily"]');
      family.value = "Consolas";
      family.dispatchEvent(new window.Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      await settle();
      // The sample in Settings, the window's quotes and the open stock panel all follow.
      const sample = popup.querySelector('[data-gui="font-preview"]');
      assert.equal(sample.dataset.fontBold, "true");
      assert.equal(sample.style.getPropertyValue("--font-decoration"), "underline line-through");
      assert.equal(app.content.dataset.fontScope, "stocks");
      assert.equal(app.content.dataset.fontBold, "true");
      assert.equal(app.content.dataset.fontItalic, "true");
      assert.equal(app.content.style.getPropertyValue("--font-decoration"), "underline line-through");
      assert.match(app.content.style.fontFamily, /Consolas/);
      const stockPanel = panel.popup.querySelector('[data-gui="panel"]');
      assert.equal(stockPanel.dataset.fontBold, "true");
      assert.equal(stockPanel.style.getPropertyValue("--font-decoration"), "underline line-through");
      assert.equal(platform.settings?.fontUnderline || false, false, "nothing is written before OK");
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(platform.settings.fontBold, true);
      assert.equal(platform.settings.fontItalic, true);
      assert.equal(platform.settings.fontUnderline, true);
      assert.equal(platform.settings.fontStrike, true);
      assert.equal(platform.settings.fontFamily, "Consolas");
      // The stylesheet draws the lines on the text of the stock display.
      const rule = [...document.styleSheets[0].cssRules].find((item) => /data-font-scope="stocks"\] \*:not\(:has\(\*\)\)/.test(item.selectorText || ""));
      assert.ok(rule, "decoration rule");
      assert.ok(rule.cssText.includes("text-decoration-line: var(--font-decoration, none)"), rule.cssText);
      await panel.close();
    });
  });
  h.test("settings show at once; Cancel, the close button and Escape all put them back", async () => {
    await withApp(async ({ app, platform }) => {
      for (const exit of ["cancel", "close", "escape"]) {
        const pending = app.showSettings("general");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const language = popup.querySelector('[data-field="language"]');
        language.value = "en";
        language.dispatchEvent(new window.Event("change", { bubbles: true }));
        const size = popup.querySelector('[data-field="fontSize"]');
        size.value = "20";
        size.dispatchEvent(new window.Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 80));
        await settle();
        assert.equal(app.settings.language, "en", `${exit}: shown at once`);
        assert.equal(app.frame.style.fontSize, "20px", exit);
        assert.equal(app.root.querySelector('[data-cmd="refresh"]').title, "Refresh quotes", exit);
        if (exit === "escape") popup.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        else popup.querySelector(`[data-action="${exit}"]`).click();
        await pending;
        await settle();
        assert.equal(app.settings.language, "ko", `${exit}: put back`);
        assert.equal(app.frame.style.fontSize, "14px", exit);
        assert.equal(platform.settings?.language ?? "ko", "ko", exit);
      }
      assert.equal(app.history.canUndo(), false, "a cancelled window leaves nothing to undo");
    });
  });
  h.test("on the desktop the close button hides the window and exit ends every window", async () => {
    const platform = createMemoryPlatform();
    platform.nativeWindow = true;
    platform.windows = [];
    platform.windowBoot = async () => ({ slot: "w1", primary: false, canAddWindow: true });
    platform.newWindow = async () => {
      platform.windows.push("new");
      return true;
    };
    platform.removeWindow = async () => {
      platform.windows.push("removed");
      return true;
    };
    await withApp(
      async ({ app }) => {
        await app.run("close");
        assert.deepEqual(platform.commands, ["hide"]);
        assert.equal(platform.quit, 0, "closing is not quitting");
        assert.equal(app.destroyed, false);
        app.openMenu("window", { clientX: 10, clientY: 10 }, { atPointer: true });
        const menu = document.querySelector('.menu-popup[data-menu="window"]');
        assert.ok(menu.querySelector('[data-cmd="new-window"] svg'));
        assert.ok(menu.querySelector('[data-cmd="remove-window"] svg'));
        menu.querySelector('[data-cmd="new-window"]').click();
        await settle();
        assert.deepEqual(platform.windows, ["new"]);
        // Removing a window asks first; Cancel keeps it.
        const asked = app.removeWindow();
        await settle();
        document.querySelector('[data-popup="remove-window"] [data-action="cancel"]').click();
        assert.equal(await asked, false);
        assert.deepEqual(platform.windows, ["new"]);
        await app.run("exit");
        assert.equal(platform.quit, 1);
      },
      { platform },
    );
  });
  h.test("a shared setting from another window is taken, but this window keeps its own board", async () => {
    await withApp(async ({ app, platform }) => {
      const before = app.settings.defaultBoard.symbols.map((entry) => entry.symbol);
      const other = sanitizeSettings({ language: "en", theme: "light-sakura", fontUnderline: true });
      other.defaultBoard.symbols = other.defaultBoard.symbols.slice(0, 1);
      const shared = { ...other };
      delete shared.defaultBoard;
      app.takeSharedSettings(shared);
      assert.equal(app.settings.language, "en");
      assert.equal(app.frame.dataset.theme, "light-sakura");
      assert.equal(app.content.style.getPropertyValue("--font-decoration"), "underline");
      assert.deepEqual(app.settings.defaultBoard.symbols.map((entry) => entry.symbol), before);
      assert.equal(platform.settings, null, "the other window already wrote it");
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
      const light = popup.querySelectorAll('[data-theme-group="light"] .swatch');
      const dark = popup.querySelectorAll('[data-theme-group="dark"] .swatch');
      assert.equal(light.length, LIGHT_THEMES.length);
      assert.equal(dark.length, DARK_THEMES.length);
      assert.equal(new Set([...light, ...dark].map((swatch) => swatch.dataset.themeId).filter(Boolean)).size, 40);
      for (const swatch of [...light, ...dark]) {
        const name = swatch.querySelector(".swatch-name");
        assert.ok(swatch.title && swatch.querySelector(".chip i") && name.textContent, swatch.dataset.themeId);
        assert.equal(swatch.querySelector(".chip").contains(name), true);
        // The accent runs the width of the swatch instead of sitting in a corner as a dot.
        const band = getComputedStyle(swatch.querySelector(".chip i"));
        assert.equal(band.left, "0px", swatch.dataset.themeId);
        assert.equal(band.right, "0px", swatch.dataset.themeId);
        assert.equal(band.bottom, "0px", swatch.dataset.themeId);
        assert.equal(parseFloat(band.borderRadius) || 0, 0, swatch.dataset.themeId);
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
      // One height for every page, decided by the tallest of them.
      assert.equal(popup.style.height, `${tallestPanelHeight(popup)}px`);
      assert.equal(getComputedStyle(popup.querySelector(".popup-body")).paddingTop, "16px");
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
      const pending = app.showPanel("stocks");
      await settle();
      await app.setTheme("light-sakura");
      assert.equal(document.querySelector("[data-popup='panel']") != null, true);
      assert.equal(document.documentElement.style.getPropertyValue("--bg-solid"), "#fff0f5");
      assert.equal(sent.at(-1).mode, "light");
      assert.equal(sent.at(-1).theme, "light-sakura");
      assert.equal(sent.at(-1).vars["--bg-solid"], "#fff0f5");
      assert.equal(sent.at(-1).vars["--fg"], "#4a2740");
      document.querySelector("[data-popup='panel'] [data-action='close']").click();
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
      // Changes are shown at once ...
      await settle();
      assert.equal(app.settings.theme, "light-sakura");
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
      // ... and Cancel puts them back.
      assert.equal(app.settings.theme, "dark-ink");
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
  h.test("the quote update interval is saved and used in the background", async () => {
    await withApp(async ({ app, platform }) => {
      assert.equal(app.settings.updateMinutes, 10);
      assert.equal(app.updateDelay, 10 * 60 * 1000);
      let calls = 0;
      const original = platform.fetchImpl;
      platform.fetchImpl = async (url, options) => {
        calls += 1;
        return original(url, options);
      };
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const field = popup.querySelector('[data-field="updateMinutes"]');
      // Minutes first, because quotes move all day, then the longer waits.
      assert.deepEqual(
        [...field.options].map((option) => option.value),
        ["1", "2", "5", "10", "15", "30", "60", "120", "240", "360", "720", "1440"],
      );
      assert.equal(field.selectedOptions[0].textContent, "10분");
      assert.equal([...field.options].find((option) => option.value === "1").textContent, "1분");
      assert.equal([...field.options].find((option) => option.value === "60").textContent, "1시간");
      field.value = "360";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.updateMinutes, 360);
      assert.equal(platform.settings.updateMinutes, 360);
      assert.equal(app.updateDelay, 360 * 60 * 1000);
      const host = document.createElement("div");
      const next = createApp(host, { platform, autoLoad: false, now: () => new Date(2026, 9, 7, 9, 0, 0) });
      try {
        await next.ready;
        assert.equal(next.settings.updateMinutes, 360);
      } finally {
        next.destroy();
        host.remove();
      }
      app.updateIntervalMs = () => 20;
      const before = calls;
      app.armUpdateTimer();
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.ok(calls > before);
      assert.equal(document.querySelector('[data-popup="progress"]'), null);
      assert.ok(app.currentTab().data.fetchedAt);
    });
  });
  h.test("the sources page shows every feed and saves the choice", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("data");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const panel = popup.querySelector('[data-panel="data"]');
      assert.equal(panel.hidden, false);
      assert.equal(panel.querySelector('[data-row="sources"] span').textContent, "정보를 가져올 출처");
      assert.match(popup.querySelector('[data-tab="data"]').textContent, /정보 출처/);
      for (const id of ["yahoo", "yahoo2", "frankfurter", "erapi", "gnews", "wires"]) {
        const box = panel.querySelector(`[data-source="${id}"]`);
        assert.equal(box.type, "checkbox");
        assert.equal(box.checked, true);
        assert.ok(box.closest(".source-row").querySelector(".source-detail").textContent.trim());
      }
      panel.querySelector('[data-source="yahoo2"]').click();
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.enabledSources.includes("yahoo2"), false);
      assert.deepEqual(app.settings.enabledSources, ["yahoo", "frankfurter", "erapi", "gnews", "wires"]);
    });
  });
  h.test("settings reset restores the original values after confirmation", async () => {
    await withApp(async ({ app }) => {
      app.settings.language = "en";
      app.settings.theme = "light-paper";
      app.settings.transparency = 80;
      app.settings.backgroundOpacity = 10;
      app.settings.updateMinutes = 720;
      app.settings.displayPriority = "yahoo";
      app.settings.enabledSources = ["yahoo"];
      app.settings.fontSize = 22;
      app.settings.startAtLogin = true;
      app.settings.units = "base";
      app.settings.baseCurrency = "USD";
      app.settings.windowPosition = { x: 40, y: 18 };
      app.recent.add("C:/money/keep.mymoney");
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
      assert.equal(popup.querySelector('[data-field="updateMinutes"]').value, "10");
      assert.equal(popup.querySelector('[data-field="displayPriority"]').value, "average");
      assert.equal(popup.querySelector('[data-field="fontSize"]').value, "14");
      assert.equal(popup.querySelector('[data-field="startAtLogin"]').checked, false);
      assert.equal(popup.querySelector('[data-field="units"]').value, "native");
      assert.equal(popup.querySelector('[data-field="baseCurrency"]').value, "KRW");
      assert.equal(popup.querySelector('[data-field="marketCode"]').value, "KR");
      assert.equal(popup.querySelector('[data-field="symbol"]').value, "005930.KS");
      assert.equal(popup.querySelector('[data-source="yahoo"]').checked, true);
      assert.equal(popup.querySelector('[data-row="wallpaper"] span:last-child').textContent, "—");
      assert.equal(app.wallpaper.dataset.image, "no");
      // The reset values are already showing in the window.
      assert.equal(app.settings.language, "ko");
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
      assert.equal(app.settings.updateMinutes, 10);
      assert.equal(app.settings.displayPriority, "average");
      assert.equal(app.settings.fontSize, 14);
      assert.equal(app.settings.startAtLogin, false);
      assert.equal(app.settings.units, "native");
      assert.equal(app.settings.baseCurrency, "KRW");
      assert.deepEqual(app.settings.enabledSources, ["yahoo", "yahoo2", "frankfurter", "erapi", "gnews", "wires"]);
      assert.equal(app.settings.backgroundImage, "");
      assert.equal(app.settings.backgroundName, "");
      assert.equal(app.settings.defaultBoard.marketCode, "KR");
      assert.deepEqual(app.settings.windowPosition, { x: 40, y: 18 });
      assert.deepEqual(app.recent.toJSON(), keptRecent);
    });
  });
  h.test("the general page saves a display priority and the scene follows it", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      assert.match(app.root.querySelector(".scene-price").textContent, /^101/);
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
      assert.deepEqual([...tabIcons.keys()].sort(), ["appearance", "data", "general", "rates", "wallpaper", "watchlist"]);
      for (const [id, svg] of tabIcons) assert.ok(svg, id);
      popup.querySelector('[data-action="tab-prev"]').click();
      assert.deepEqual([...field.options].map((option) => option.value), ["average", "yahoo", "yahoo2", "frankfurter", "erapi", "gnews", "wires"]);
      assert.equal(field.selectedOptions[0].textContent, "평균");
      field.value = "yahoo";
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.displayPriority, "yahoo");
      assert.equal(platform.settings.displayPriority, "yahoo");
      assert.match(app.root.querySelector(".scene-price").textContent, /^100/);
    });
  });
  h.test("wallpaper opacity is saved separately and its slider steps from both sides", async () => {
    await withApp(async ({ app, platform }) => {
      platform.nextImage = { dataUrl: "data:image/png;base64,aaaa", name: "chart.png", type: "image/png", size: 9_000_000, directory: "D:/pictures" };
      await app.chooseWallpaper();
      assert.equal(app.settings.backgroundName, "chart.png");
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
      assert.match(popup.querySelector('[data-panel="wallpaper"]').textContent, /chart\.png/);
      const row = popup.querySelector('[data-row="backgroundOpacity"]');
      const slider = row.querySelector('[data-field="backgroundOpacity"]');
      const steps = [...row.querySelectorAll(".step-btn")];
      assert.equal(steps.map((button) => button.dataset.step).join(","), "-5,5");
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
      await app.setTransparency(0);
      assert.equal(app.wallpaper.style.opacity, "0.25");
      await app.setTransparency(100);
      assert.equal(app.wallpaper.style.opacity, "0.25");
    });
  });

  h.test("settings keeps one size for every tab and never hides a tab", async () => {
    await withApp(async ({ app }) => {
      for (const language of ["ko", "en"]) {
        await app.setLanguage(language);
        const pending = app.showSettings("wallpaper");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        // Six tabs are drawn, and the arrows that would hide some are gone.
        const tabs = [...popup.querySelectorAll(".popup-tab")].map((button) => button.dataset.tab);
        assert.deepEqual(tabs.sort(), ["appearance", "data", "general", "rates", "wallpaper", "watchlist"], language);
        for (const nav of popup.querySelectorAll('[data-gui="tab-nav"]')) {
          assert.equal(nav.hidden, true, `${language} tab arrow`);
          assert.equal(nav.style.display, "none", `${language} tab arrow`);
        }
        assert.ok(parseInt(popup.style.width, 10) >= 680, language);
        // Every page is shown at the same height: the tallest page decides it.
        const expected = Math.max(SETTINGS_MIN_HEIGHT, Math.min(SETTINGS_MAX_HEIGHT, tallestPanelHeight(popup)));
        const seen = new Set();
        for (const id of ["appearance", "data", "general", "rates", "wallpaper", "watchlist"]) {
          popup.querySelector(`[data-tab="${id}"]`).click();
          await settle();
          const height = parseInt(popup.style.height, 10);
          seen.add(height);
          assert.equal(height, expected, `${language}/${id} height`);
          // Nothing is cut off, so no page ever needs a scrollbar.
          assert.ok(popupFits(popup).fits, `${language}/${id} must fit`);
          assert.ok(height <= SETTINGS_MAX_HEIGHT, `${language}/${id} height ${height}`);
        }
        assert.equal(seen.size, 1, `${language}: the window never resized`);
        popup.querySelector('[data-action="cancel"]').click();
        await pending;
      }
    });
  });
  h.test("no part of the settings window scrolls", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      for (const id of ["appearance", "data", "general", "rates", "wallpaper", "watchlist"]) {
        popup.querySelector(`[data-tab="${id}"]`).click();
        await settle();
        const page = popup.querySelector(`.popup-panel[data-panel="${id}"]`);
        for (const node of [popup, popup.querySelector(".popup-body"), page]) {
          const style = getComputedStyle(node);
          const label = `${id}/${node.className || node.tagName}`;
          assert.equal(style.overflowY || style.overflow, "hidden", label);
          assert.equal(style.overflowX || style.overflow, "hidden", label);
        }
      }
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("the watchlist block shrinks to the symbols it holds", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("watchlist");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const box = popup.querySelector('[data-gui="watchlist"]');
      // Three symbols are two rows of two columns, not a 300px box.
      assert.equal(parseInt(box.style.height, 10), 2 * 26 + 3);
      const before = parseInt(popup.style.height, 10);
      box.querySelector('[data-action="symbol-remove"]').click();
      await settle();
      assert.equal(app.currentTab().board.symbols.length, 2);
      assert.equal(parseInt(box.style.height, 10), 26);
      assert.ok(parseInt(popup.style.height, 10) < before);
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("the title bar drops the program name when the window is narrow", async () => {
    await withApp(async ({ app }) => {
      const label = app.root.querySelector(".title-name");
      assert.equal(app.frame.dataset.titleText, "shown");
      assert.notEqual(getComputedStyle(label).display, "none");
      assert.equal(label.textContent, "MyMoney V1.0");
      // Shrink below the width the name needs: only the icon is left.
      app.shellSize = { width: WINDOW_MIN.width, height: 400 };
      app.applyShellSize();
      assert.equal(app.frame.dataset.titleText, "hidden");
      assert.equal(getComputedStyle(label).display, "none");
      assert.ok(app.root.querySelector(".title-icon"));
      // Give the room back and the name returns.
      app.shellSize = { width: 760, height: 400 };
      app.applyShellSize();
      assert.equal(app.frame.dataset.titleText, "shown");
      assert.notEqual(getComputedStyle(label).display, "none");
    });
  });

  h.test("auto-start is saved, told to the system, and still set next launch", async () => {
    const platform = createMemoryPlatform();
    const told = [];
    platform.setAutoStart = async (on) => told.push(on);
    await withApp(
      async ({ app }) => {
        assert.equal(app.settings.startAtLogin, false);
        const pending = app.showSettings("general");
        await settle();
        const popup = document.querySelector('[data-popup="settings"]');
        const box = popup.querySelector('[data-field="startAtLogin"]');
        assert.ok(box, "the General page offers the switch");
        assert.equal(popup.querySelector('[data-field="reopen"]'), null, "the dead reopen switch is gone");
        box.checked = true;
        popup.querySelector('[data-action="ok"]').click();
        await pending;
        assert.equal(app.settings.startAtLogin, true);
        assert.equal(platform.settings.startAtLogin, true, "it is written to the settings file");
        assert.deepEqual(told, [true], "and handed to the system");
      },
      { platform },
    );
    // The next launch reads it back.
    await withApp(async ({ app }) => assert.equal(app.settings.startAtLogin, true), { platform });
  });
  h.test("the language row is a pair of flag buttons, not a dropdown", async () => {
    await withApp(async ({ app }) => {
      const pending = app.showSettings("general");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      const row = popup.querySelector('[data-row="language"]');
      assert.ok(row, "the language row");
      assert.equal(row.querySelector("select"), null, "no dropdown");
      const buttons = [...row.querySelectorAll("[data-choice='language']")];
      assert.deepEqual(buttons.map((b) => b.dataset.value), ["ko", "en"]);
      assert.match(buttons[0].textContent, /한국어/);
      assert.match(buttons[1].textContent, /English/);
      // Each carries its flag, in colour.
      for (const button of buttons) {
        const svg = button.querySelector("svg");
        assert.ok(svg, "a flag");
        assert.match(svg.innerHTML, /fill="#[0-9a-f]{3,6}"/i);
      }
      // Korean is the current language, so its button is the pressed one.
      assert.equal(buttons[0].getAttribute("aria-pressed"), "true");
      assert.equal(buttons[1].getAttribute("aria-pressed"), "false");
      // Pressing English moves the mark and the hidden field, and OK applies it.
      buttons[1].click();
      assert.equal(buttons[0].getAttribute("aria-pressed"), "false");
      assert.equal(buttons[1].getAttribute("aria-pressed"), "true");
      assert.equal(row.querySelector('[data-field="language"]').value, "en");
      popup.querySelector('[data-action="ok"]').click();
      await pending;
      assert.equal(app.settings.language, "en");
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
      assert.match(text, /MyMoney/);
      assert.match(text, /1\.0\.0/);
      assert.match(text, /20261007\.1/);
      assert.match(text, /2026-10-07/);
      assert.match(text, /SHKWON\(knix008@naver\.com\)/);
      assert.match(popup.querySelector(".popup-icon svg").innerHTML, /#2f94ff/);
      const intro = popup.querySelector(".about-intro");
      assert.match(intro.querySelector(".about-app-icon").getAttribute("src"), /icon\.png$/);
      assert.match(intro.querySelector(".about-desc").textContent, /주식 시세/);
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
  h.test("each panel, settings, and about window stays single and comes forward", async () => {
    await withApp(async ({ app }) => {
      const stocks = app.showPanel("stocks");
      await settle();
      const rates = app.showPanel("rates");
      await settle();
      assert.equal(document.querySelectorAll('[data-popup="panel"]').length, 2);
      const again = await app.showPanel("stocks");
      assert.equal(again.action, "focused");
      assert.equal(document.querySelectorAll('[data-popup-key="panel:stocks"]').length, 1);
      const order = [...document.querySelectorAll("[data-popup]")].map((el) => el.dataset.popupKey);
      assert.equal(order.at(-1), "panel:stocks");
      const settings = app.showSettings("general");
      await settle();
      const second = await app.showSettings("wallpaper");
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
      for (const popup of [...document.querySelectorAll('[data-popup="panel"]')]) popup.querySelector('[data-action="close"]').click();
      await stocks;
      await rates;
      assert.equal(document.querySelector("[data-popup]"), null);
    });
  });
  h.test("popups are fixed, single-line, and close with the application", async () => {
    await withApp(async ({ app }) => {
      const pending = [];
      pending.push(app.showSettings("general"));
      await settle();
      pending.push(app.showAbout());
      await settle();
      assert.ok(document.querySelector('[data-popup="settings"]'));
      assert.ok(document.querySelector('[data-popup="about"]'));
      for (const type of ["settings", "about"]) {
        const popup = document.querySelector(`[data-popup="${type}"]`);
        assert.equal(popup.style.overflow, "hidden");
        assert.equal(popup.style.resize, "none");
        assert.equal(popupFits(popup).fits, true);
        for (const button of popup.querySelectorAll("button")) assert.ok(button.title, button.textContent);
      }
      app.destroy();
      assert.equal(document.querySelector(".popup"), null);
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
      app.reportError(new AppError("Quote service failed", details, "QUOTE"), "refresh");
      await settle();
      const popup = document.querySelector('[data-popup="error"]');
      const row = (id) => popup.querySelector(`[data-row="${id}"]`).textContent;
      assert.match(row("summary"), /QUOTE.*Quote service failed/);
      assert.equal(popup.querySelector('[data-row="summary"]').dataset.tone, "danger");
      assert.match(row("time"), /2026-10-07 09:00:00/);
      assert.match(row("operation"), /refresh/);
      assert.match(row("app"), /MyMoney 1\.0\.0/);
      assert.ok(row("environment").length > 4);
      assert.match(row("detail-0"), /line 0 HTTP 500/);
      assert.match(row("more"), /\d+줄 더 있음/);
      assert.equal(popup.querySelectorAll(".popup-row").length <= 12, true);
      for (const line of popup.querySelectorAll(".popup-row")) assert.equal(line.style.whiteSpace, "nowrap");
      const full = popup.querySelector('[data-field="full"]');
      assert.equal(full.readOnly, true);
      assert.equal(full.tagName, "TEXTAREA");
      assert.match(full.value, /Quote service failed\n발생 시각/);
      assert.match(full.value, /line 8 HTTP 508/);
      assert.match(full.value, /발생 시각: 2026-10-07 09:00:00/);
      assert.equal(popupFits(popup).fits, true);
      popup.querySelector('[data-action="copy"]').click();
      await settle();
      assert.match(platform.clipboardText, /^\[QUOTE\] Quote service failed/);
      assert.match(platform.clipboardText, /작업: .*refresh/);
      assert.match(platform.clipboardText, /프로그램: MyMoney 1\.0\.0/);
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
        assert.ok(app.currentTab().data.quotes.length);
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
  h.test("one print window sets up the page on the left and previews it on the right", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      app.addTab();
      app.applyMarket("US");
      app.doc.tabs[1].data = app.doc.tabs[0].data;
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      // No second step: no separate preview window and no page tabs.
      assert.equal(document.querySelector('[data-popup="preview"]'), null);
      assert.equal(popup.querySelector(".popup-tabs"), null);
      assert.equal(popup.style.overflow, "hidden");
      const setup = popup.querySelector(".preview-setup");
      const side = popup.querySelector(".preview-side");
      assert.ok(setup && side);
      assert.equal(setup.nextElementSibling, side, "settings sit left of the preview");
      for (const field of ["from", "to", "section-stocks", "section-rates", "section-news", "paper", "orientation", "margin", "scale", "header", "pageNumber", "pageNumberAt"]) {
        assert.ok(setup.querySelector(`[data-field="${field}"]`), field);
      }
      assert.equal(setup.querySelectorAll('input[name="scope"]').length, 3);
      assert.deepEqual([...setup.querySelector('[data-field="paper"]').options].map((option) => option.value), ["A4", "A3", "A5", "Letter", "Legal", "B5"]);
      assert.ok(side.querySelector("[data-preview-sheet]"));
      assert.ok(side.querySelector("[data-preview-paper]"));
      // The sheet is a printed page, not the interactive panel: no pager, no drag grips.
      assert.equal(popup.querySelector(".pager-btn"), null);
      assert.equal(popup.querySelector(".row-grip"), null);
      assert.match(side.querySelector("[data-preview-sheet]").innerHTML, /삼성전자/);
      const count = () => popup.querySelector("[data-preview-count]").textContent;
      // The current tab, one page for each of quotes, rates and news.
      assert.equal(count(), "1 / 3");
      chooseScope(popup, "all");
      popup.querySelector('input[name="scope"][value="all"]').dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(count(), "1 / 6");
      const prev = popup.querySelector('[data-action="page-prev"]');
      const next = popup.querySelector('[data-action="page-next"]');
      assert.equal(prev.disabled, true);
      next.click();
      await settle();
      assert.equal(count(), "2 / 6");
      assert.equal(document.querySelector('[data-popup="print"]'), popup, "turning a page keeps the window open");
      for (let step = 0; step < 6; step += 1) next.click();
      assert.equal(count(), "6 / 6");
      assert.equal(next.disabled, true);
      const paperBox = popup.querySelector("[data-preview-paper]");
      assert.equal(paperBox.style.aspectRatio, "210 / 297");
      const paper = popup.querySelector('[data-field="paper"]');
      paper.value = "A3";
      paper.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(paperBox.style.aspectRatio, "297 / 420");
      assert.equal(count(), "6 / 6", "a new setup keeps the page in view");
      const orientation = popup.querySelector('[data-field="orientation"]');
      orientation.value = "landscape";
      orientation.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(paperBox.style.aspectRatio, "420 / 297");
      assert.equal(app.pageSetup.paper, "A3");
      popup.querySelector('[data-action="print"]').click();
      await pending;
      assert.equal(platform.prints.length, 1);
      assert.match(platform.prints[0].html, /size: A3 landscape/);
      assert.match(platform.prints[0].html, /한국거래소/);
      assert.match(platform.prints[0].html, /미국 증시/);
      assert.equal(platform.prints[0].pageSetup.paper, "A3");
    });
  });
  h.test("only the sections asked for are printed, and the page number can move or go", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      const toggle = (field, on) => {
        const box = popup.querySelector(`[data-field="${field}"]`);
        box.checked = on;
        box.dispatchEvent(new window.Event("change", { bubbles: true }));
      };
      toggle("section-rates", false);
      toggle("section-news", false);
      await settle();
      assert.equal(popup.querySelector("[data-preview-count]").textContent, "1 / 1");
      assert.ok(popup.querySelector('[data-preview-sheet] [data-section="stocks"]'));
      const pick = (field, value) => {
        const select = popup.querySelector(`[data-field="${field}"]`);
        select.value = value;
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      };
      pick("pageNumberAt", "center");
      await settle();
      assert.equal(popup.querySelector('[data-preview-sheet] .sheet-foot').dataset.at, "center");
      pick("pageNumber", "off");
      pick("header", "off");
      await settle();
      assert.equal(popup.querySelector("[data-preview-sheet] .sheet-foot"), null);
      assert.equal(popup.querySelector("[data-preview-sheet] .sheet-head"), null);
      pick("margin", "25");
      pick("scale", "125");
      await settle();
      popup.querySelector('[data-action="print"]').click();
      await pending;
      assert.match(platform.prints[0].html, /margin: 25mm/);
      assert.doesNotMatch(platform.prints[0].html, /data-section="rates"/);
      assert.doesNotMatch(platform.prints[0].html, /class="sheet-foot"/);
    });
  });
  h.test("a reversed custom range says so and keeps the last good sheet", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      const sheet = popup.querySelector("[data-preview-sheet]");
      const before = sheet.innerHTML;
      chooseScope(popup, "custom");
      popup.querySelector('[data-field="from"]').value = "2026-10-09";
      const to = popup.querySelector('[data-field="to"]');
      to.value = "2026-10-01";
      to.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      assert.equal(app.statusMessage, "날짜 범위가 올바르지 않습니다.");
      assert.equal(sheet.innerHTML, before);
      assert.ok(document.querySelector('[data-popup="print"]'));
      popup.querySelector('[data-action="cancel"]').click();
      await pending;
    });
  });
  h.test("a custom range adds the daily prices inside it, as many pages as they need", async () => {
    await withApp(async ({ app }) => {
      const start = new Date(2026, 9, 1);
      const dates = Array.from({ length: 80 }, (_, index) => {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      });
      app.currentTab().data = {
        quotes: [{ symbol: "005930.KS", currency: "KRW", last: 1, change: 0, changePercent: 0, days: dates.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1 })) }],
        rates: { base: "KRW", rows: [] },
        news: [],
        sources: [],
      };
      app.printDraft = { scope: "custom", sections: ["stocks"] };
      const pending = app.openPrint();
      await settle();
      const popup = document.querySelector('[data-popup="print"]');
      const total = Number(popup.querySelector("[data-preview-count]").textContent.split("/")[1]);
      assert.ok(total >= 3, `quotes plus a history that runs over pages: ${total}`);
      const next = popup.querySelector('[data-action="page-next"]');
      while (!next.disabled) next.click();
      assert.match(popup.querySelector("[data-preview-sheet]").innerHTML, /data-section="history"/);
      assert.equal(popup.querySelector(".scrollbar"), null);
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
      assert.match(app.root.querySelector(".scene-price").textContent, /\d/);
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
  h.test("ctrl+n, ctrl+o and ctrl+s no longer start, open or save a file", async () => {
    await withApp(async ({ app }) => {
      app.currentTab().properties.label = "keep-me";
      for (const key of ["n", "o", "s"]) press(key, { ctrlKey: true });
      press("s", { ctrlKey: true, shiftKey: true });
      await settle();
      assert.equal(document.querySelector(".popup"), null);
      assert.equal(app.currentTab().properties.label, "keep-me");
    });
  });
  h.test("double-clicking the title maximizes and a toolbar button does not", async () => {
    await withApp(async ({ app }) => {
      app.root.querySelector('[data-cmd="stocks"]').dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
      await settle();
      assert.equal(app.frame.dataset.maximized, "false");
      assert.equal(document.querySelector('[data-popup="panel"]'), null);
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
  h.test("a favorite and an extra tab can be undone, and tabs are not market names", async () => {
    await withApp(async ({ app }) => {
      await app.run("add-tab");
      assert.equal(app.root.querySelector(".tabbar").hidden, false);
      assert.deepEqual(
        [...app.root.querySelectorAll("[data-gui='tab']")].map((tab) => tab.textContent),
        ["1", "2"],
      );
      assert.equal(app.root.querySelector(".shell-top").textContent.includes("한국거래소"), false);
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
  h.test("a bigger window enlarges the price and the picture together, and never scrolls", async () => {
    await withApp(async ({ app }) => {
      app.shellSize = { width: 760, height: 640 };
      app.applyShellSize();
      const art = Number(app.content.style.getPropertyValue("--art-scale"));
      const text = Number(app.content.style.getPropertyValue("--scene-scale"));
      // Picture and number grow together, so the price never loses room to the chart.
      assert.equal(art, text);
      assert.ok(art > 1);
      await app.refreshMarket();
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
      for (const selector of [".shell-top", ".market", ".market-scene"]) {
        const style = getComputedStyle(app.root.querySelector(selector));
        assert.equal(style.overflowX || style.overflow, "hidden", selector);
        assert.equal(style.overflowY || style.overflow, "hidden", selector);
      }
    });
  });
  h.test("the quote scene appears at the measured scale and ignores a small shift", async () => {
    await withApp(async ({ app }) => {
      app.shellSize = { width: 760, height: 640 };
      let width = 0;
      let height = 0;
      Object.defineProperty(app.content, "clientWidth", { configurable: true, get: () => width });
      Object.defineProperty(app.content, "clientHeight", { configurable: true, get: () => height });
      app.applySceneScale();
      const scene = app.content.querySelector(".market-scene");
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
  h.test("panel buttons stay icon-only and a chosen quote becomes the selection", async () => {
    await withApp(async ({ app }) => {
      const buttons = [...app.root.querySelectorAll("[data-gui='range-button']")];
      assert.deepEqual(buttons.map((button) => button.textContent.trim()), ["", "", ""]);
      buttons[0].click();
      await settle();
      const opened = document.querySelector('[data-popup="panel"]');
      assert.match(opened.querySelector(".popup-title").textContent, /^주식 시세/);
      assert.match(opened.textContent, /새로고침으로 시세를 불러오세요/);
      opened.querySelector('[data-action="close"]').click();
      await settle();
      await app.refreshMarket();
      const stocks = await openPanel(app, "stocks");
      const row = stocks.popup.querySelector('[data-symbol="035420.KS"]');
      assert.ok(row);
      row.click();
      await settle();
      assert.match(app.selectionText, /035420\.KS/);
      assert.match(app.root.querySelector(".scene-name").textContent, /NAVER/);
      assert.equal(document.querySelector(".menu-popup"), null);
      await stocks.close();
      await app.setLanguage("en");
      assert.deepEqual(
        [...app.root.querySelectorAll("[data-gui='range-button']")].map((button) => button.title),
        ["Stock quotes", "Exchange rates", "Today's news"],
      );
    });
  });
  h.test("a disabled source is not fetched and a missing download is reported", async () => {
    await withApp(async ({ app, platform }) => {
      await app.refreshMarket();
      const settings = app.showSettings("data");
      await settle();
      const popup = document.querySelector('[data-popup="settings"]');
      popup.querySelector('[data-source="yahoo2"]').checked = false;
      popup.querySelector('[data-action="ok"]').click();
      await settings;
      assert.equal(app.settings.enabledSources.includes("yahoo2"), false);
      const urls = [];
      const original = platform.fetchImpl;
      platform.fetchImpl = async (url, options) => {
        urls.push(String(url));
        return original(url, options);
      };
      await app.refreshMarket();
      assert.equal(urls.some((url) => url.includes("query2")), false);
      assert.ok(urls.some((url) => url.includes("query1.finance.yahoo.com/v8/finance/chart/")));
      platform.nextImage = { dataUrl: "data:image/png;base64,aaaa", name: "chart.png", type: "image/png", size: 120 };
      await app.run("choose-wallpaper");
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "yes");
      await app.run("clear-wallpaper");
      assert.equal(app.root.querySelector("[data-gui='wallpaper']").dataset.image, "no");
      app.currentTab().data = null;
      await app.run("download");
      await settle();
      const error = document.querySelector('[data-popup="error"]');
      assert.ok(error);
      assert.match(error.textContent, /NO_DATA|시세/);
      error.querySelector('[data-action="close"]').click();
      await settle();
    });
  });

  h.category("GUI audit");
  h.test("every window, menu, and popup control has a tooltip or label in both languages", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
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
        for (const tab of ["general", "watchlist", "rates", "data", "appearance", "wallpaper", "font", "recent"]) {
          const settings = app.showSettings(tab);
          await settle();
          const popup = document.querySelector('[data-popup="settings"]');
          assertTitled(popup);
          assert.equal(popupFits(popup).fits, true, `${language}/${tab}`);
          popup.querySelector('[data-action="cancel"]').click();
          await settings;
        }
        for (const panel of ["stocks", "rates", "news"]) {
          const opened = await openPanel(app, panel);
          assertTitled(opened.popup);
          assert.equal(popupFits(opened.popup).fits, true, `${language}/${panel}`);
          await opened.close();
        }
      }
      assert.equal(app.i18n.missing.size, 0, [...app.i18n.missing].join(","));
      assert.equal(app.root.textContent.includes("«"), false);
      assert.ok(app.root.querySelectorAll("button").length >= 10);
    });
  });
  h.test("no rendered screen leaks a missing translation key", async () => {
    await withApp(async ({ app }) => {
      await app.refreshMarket();
      for (const language of ["ko", "en"]) {
        await app.setLanguage(language);
        for (const panel of ["stocks", "rates", "news"]) {
          const opened = await openPanel(app, panel);
          assert.equal(opened.popup.textContent.includes("«"), false, `${language}/${panel}`);
          await opened.close();
        }
      }
      assert.equal(app.i18n.missing.size, 0, [...app.i18n.missing].join(","));
    });
  });
}

/** The scene artwork for a quote that is rising or falling. */
function renderArt(app, rising) {
  const tab = app.currentTab();
  const close = rising ? 110 : 90;
  tab.data = {
    quotes: [
      {
        symbol: tab.board.symbols[0].symbol,
        currency: "KRW",
        last: close,
        change: rising ? 10 : -10,
        changePercent: rising ? 10 : -10,
        days: [{ date: "2026-10-07", close: 100 }, { date: "2026-10-08", close }],
      },
    ],
    rates: { base: "KRW", rows: [] },
    news: [],
    sources: [],
  };
  tab.selectedSymbol = tab.board.symbols[0].symbol;
  app.renderMarket();
  const art = app.root.querySelector(".scene-art");
  assert.ok(art, "scene art");
  return art;
}

/** Every number in an SVG path `d`, as absolute points. */
function pathPoints(d) {
  const parts = String(d).trim().split(/(?=[A-Za-z])/);
  const points = [];
  let x = 0;
  let y = 0;
  for (const part of parts) {
    const command = part[0];
    const numbers = (part.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (command === "M" || command === "L") {
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        x = numbers[i];
        y = numbers[i + 1];
        points.push({ x, y });
      }
    } else if (command === "l") {
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        x += numbers[i];
        y += numbers[i + 1];
        points.push({ x, y });
      }
    } else if (command === "h") {
      for (const n of numbers) {
        x += n;
        points.push({ x, y });
      }
    } else if (command === "v") {
      for (const n of numbers) {
        y += n;
        points.push({ x, y });
      }
    }
  }
  return points;
}

/** The last leg of the open trend line: the stroked path with no fill. */
function lastSegment(art) {
  const line = [...art.querySelectorAll("path")].find(
    (node) => node.getAttribute("fill") === "none" && (node.getAttribute("stroke-width") || "") === "6",
  );
  assert.ok(line, "trend line");
  const points = pathPoints(line.getAttribute("d"));
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  return { x: end.x, y: end.y, dx: end.x - before.x, dy: end.y - before.y };
}

/** The arrowhead's square corner, which is the tip of a right-triangle head. */
function arrowTip(art) {
  const head = [...art.querySelectorAll("path")].find((node) => node.getAttribute("fill")?.startsWith("#") && !node.getAttribute("stroke"));
  assert.ok(head, "arrow head");
  const points = pathPoints(head.getAttribute("d"));
  assert.equal(points.length, 3, "a right-triangle head has three corners");
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  // The square corner shares its x with one neighbour and its y with the other.
  const tip = points.find((point) => {
    const others = points.filter((other) => other !== point);
    return others.some((other) => other.x === point.x) && others.some((other) => other.y === point.y);
  });
  assert.ok(tip, "right-angle corner");
  return { ...tip, xs, ys };
}

/** Wait for a condition the app reaches on its own, instead of guessing a delay. */
/** CSS text keeps whatever line endings the file has, so compare selectors on one line. */
function squashSpace(text) {
  return String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim();
}

/** Drops files and answers the background confirmation the way `action` says. */
async function answerWallpaperDrop(app, files, action) {
  const pending = app.handleDroppedFiles(files);
  await settle();
  const popup = document.querySelector('[data-popup="wallpaper-drop"]');
  assert.ok(popup, "the background confirmation is on screen");
  popup.querySelector(`[data-action="${action}"]`).click();
  await pending;
}

/**
 * Drag a row by its grip onto another one. Mirrors what a mouse does: press
 * the grip, drag over the target, let go.
 */
function dragRowByGrip(moved, target, { vertical = true } = {}) {
  const grip = moved.querySelector("[data-grip]");
  assert.ok(grip, "the row offers a grip");
  grip.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  assert.equal(moved.getAttribute("draggable"), "true", "the grip arms the row");
  moved.dispatchEvent(new window.Event("dragstart", { bubbles: true }));
  const over = new window.Event("dragover", { bubbles: true, cancelable: true });
  const box = target.getBoundingClientRect();
  Object.defineProperty(over, "clientY", { value: vertical ? box.top + 1 : 0 });
  Object.defineProperty(over, "clientX", { value: vertical ? 0 : box.left + 1 });
  target.dispatchEvent(over);
  moved.dispatchEvent(new window.Event("drop", { bubbles: true, cancelable: true }));
}

async function waitFor(check, label = "condition") {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${label}`);
}

async function openPanel(app, panel) {
  const pending = app.run(panel);
  await settle();
  const popup = document.querySelector('[data-popup="panel"]');
  assert.ok(popup, panel);
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
