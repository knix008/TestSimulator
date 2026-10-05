(function () {
  function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
  }

  async function text(url) {
    const response = await fetch(url);
    assert(response.ok, url + " " + response.status);
    return response.text();
  }

  function suite(name, tests) {
    return { name: name, tests: tests };
  }

  function test(name, fn) {
    return { name: name, fn: fn };
  }

  window.TEST_SUITES = [
    suite("Merge", [
      test("independent edits merge without a conflict", (api, doc, win) => {
        const merged = win.MergeEngine.merge3("A\nB\nC\nD\n", "A\nX\nC\nD\n", "A\nB\nC\nY\n");
        assert(merged.conflicts === 0, merged.text);
        assert(merged.text === "A\nX\nC\nY\n", merged.text);
      }),
      test("both sides changing one line is a conflict", (api, doc, win) => {
        const merged = win.MergeEngine.merge3("A\n", "B\n", "C\n");
        assert(merged.conflicts === 1, merged.text);
      }),
      test("identical edits are kept once", (api, doc, win) => {
        const merged = win.MergeEngine.merge3("A\n", "B\n", "B\n");
        assert(merged.conflicts === 0, merged.text);
        assert(merged.text === "B\n", JSON.stringify(merged.text));
      }),
      test("a local-only change is kept", (api, doc, win) => {
        const merged = win.MergeEngine.merge3("A\nB\n", "A\nX\n", "A\nB\n");
        assert(merged.conflicts === 0 && merged.text === "A\nX\n", merged.text);
      }),
      test("sample file opens with one conflict", (api) => {
        assert(api.getDoc().name === "total.js");
        assert(api.conflictCount() === 1, String(api.conflictCount()));
      }),
      test("large similar files still merge both edits", (api, doc, win) => {
        const base = [];
        for (let i = 0; i < 3000; i += 1) base.push("L" + i);
        const local = base.slice();
        const remote = base.slice();
        local[20] = "local";
        remote[2500] = "remote";
        const merged = win.MergeEngine.merge3(base.join("\n"), local.join("\n"), remote.join("\n"));
        assert(merged.conflicts === 0, "conflicts " + merged.conflicts);
        assert(merged.text.indexOf("local") >= 0 && merged.text.indexOf("remote") >= 0);
      }),
    ]),
    suite("Markers", [
      test("choices replace a conflict", (api, doc, win) => {
        const merged = win.MergeEngine.merge3("A\n", "B\n", "C\n");
        assert(win.MergeEngine.applyChoice(merged.text, 0, "local") === "B\n");
        assert(win.MergeEngine.applyChoice(merged.text, 0, "remote") === "C\n");
        assert(win.MergeEngine.applyChoice(merged.text, 0, "base") === "A\n");
        assert(win.MergeEngine.applyChoice(merged.text, 0, "both") === "B\nC\n");
        assert(win.MergeEngine.parseConflicts(win.MergeEngine.applyChoice(merged.text, 0, "local")).conflicts.length === 0);
      }),
      test("toolbar resolution clears the sample conflict", (api) => {
        api.resolve("local");
        assert(api.conflictCount() === 0);
        assert(api.getDoc().dirty === true);
      }),
      test("take remote, base, and both from the current conflict", (api) => {
        api.resolve("remote");
        assert(api.conflictCount() === 0);
        api.undo();
        api.resolve("base");
        assert(api.conflictCount() === 0);
        api.undo();
        api.resolve("both");
        assert(api.getResultText().indexOf("tax") >= 0);
        assert(api.getResultText().indexOf("qty") >= 0);
      }),
    ]),
    suite("Session", [
      test("session file round-trips", (api, doc, win) => {
        const raw = win.MyMergeSession.serialize(api.getDocs());
        assert(raw.indexOf("mymerge-session") >= 0);
        const parsed = win.MyMergeSession.parse(raw);
        assert(parsed.files.length === 2);
        assert(api.openSessionText(raw) === 2);
        assert(api.getDoc().name === "total.js");
      }),
      test("a bad session reports a specific error", (api, doc, win) => {
        let failed = false;
        try { win.MyMergeSession.parse("{"); } catch (error) { failed = error.code === "SESSION_JSON"; }
        assert(failed);
        try { win.MyMergeSession.parse('{"kind":"other","files":[]}'); } catch (error) { assert(error.code === "SESSION_KIND"); }
      }),
    ]),
    suite("History", [
      test("undo and redo restore the conflict", (api) => {
        assert(api.canUndo() === false);
        api.resolve("local");
        assert(api.canUndo() === true);
        assert(api.conflictCount() === 0);
        api.undo();
        assert(api.conflictCount() === 1);
        api.redo();
        assert(api.conflictCount() === 0);
      }),
      test("typing can be undone", (api) => {
        api.setResultText("changed\n");
        assert(api.getResultText() === "changed\n");
        api.undo();
        assert(api.getResultText().indexOf("<<<<<<<") >= 0);
      }),
    ]),
    suite("Recent", [
      test("only ten recent files are kept", (api) => {
        for (let i = 0; i < 12; i += 1) api.addRecent({ id: "id-" + i, name: "file-" + i + ".txt", path: "D:/work/file-" + i + ".txt" });
        const recent = api.getSettings().recent;
        assert(recent.length === 10, String(recent.length));
        assert(recent[0].name === "file-11.txt");
        assert(!recent.some((row) => row.name === "file-0.txt"));
      }),
      test("one recent file or all of them can be removed", (api) => {
        api.addRecent({ id: "a", name: "a.txt", path: "D:/a.txt" });
        api.addRecent({ id: "b", name: "b.txt", path: "D:/b.txt" });
        assert(api.removeRecent("a").length === 1);
        assert(api.clearRecent().length === 0);
      }),
      test("the recent manager lists a delete control on each row", (api, doc) => {
        api.addRecent({ id: "a", name: "a.txt", path: "D:/a.txt" });
        api.addRecent({ id: "b", name: "b.txt", path: "D:/b.txt" });
        const popup = api.openPopup("recent");
        const buttons = popup.querySelectorAll('[data-popup-action="remove-recent"]');
        assert(buttons.length === 2);
        buttons[0].click();
        const again = api.getPopup();
        assert(again.querySelectorAll('[data-popup-action="remove-recent"]').length === 1);
        again.querySelector('[data-popup-action="clear-recent"]').click();
        assert(api.getSettings().recent.length === 0);
      }),
    ]),
    suite("Settings", [
      test("theme, language, and folders load next time", (api) => {
        api.setTheme("light-paper");
        api.setLanguage("en");
        api.rememberDirectory("open", "D:/repo/src/file.txt");
        api.rememberDirectory("save", "D:/out/result.txt");
        const loaded = api.loadSettings();
        assert(loaded.theme === "light-paper");
        assert(loaded.language === "en");
        assert(loaded.lastOpenDir === "D:/repo/src");
        assert(loaded.lastSaveDir === "D:/out");
      }),
      test("the settings popup applies a font, a language, and a theme", (api, doc) => {
        api.setFontCatalog(["Arial", "Consolas", "Times New Roman"]);
        const popup = api.openPopup("settings");
        popup.querySelector('[data-field="language"]').value = "en";
        popup.querySelector('[data-field="theme"]').value = "dark-midnight";
        popup.querySelector('[data-field="fontFamily"]').value = "Times New Roman";
        popup.querySelector('[data-field="fontSize"]').value = "18";
        popup.querySelector('[data-field="fontStyle"]').value = "bold-italic";
        popup.querySelector('[data-popup-action="apply-settings"]').click();
        assert(api.getLanguage() === "en");
        assert(api.getTheme() === "dark-midnight");
        const area = doc.getElementById("resultText");
        const style = doc.defaultView.getComputedStyle(area);
        assert(style.fontStyle === "italic", style.fontStyle);
        assert(Number(style.fontWeight) >= 700, style.fontWeight);
        assert(style.fontSize === "18px", style.fontSize);
      }),
      test("changing a settings field applies right away", (api, doc) => {
        api.setTheme("light-classic");
        const popup = api.openPopup("settings");
        const theme = popup.querySelector('[data-field="theme"]');
        theme.value = "dark-navy";
        theme.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.getTheme() === "dark-navy", api.getTheme());
        assert(api.getPopup() != null, "the window stays open");
        const size = api.getPopup().querySelector('[data-field="fontSize"]');
        size.value = "20";
        size.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.getSettings().fontSize === 20, String(api.getSettings().fontSize));
        api.closePopup();
        api.setTheme("light-classic");
      }),
      test("opened folders keep ten entries that can be deleted one by one or all at once", (api, doc) => {
        for (let i = 0; i < 12; i += 1) api.rememberDirectory("open", "D:/work/dir" + i + "/file.txt");
        const dirs = api.getSettings().recentDirs;
        assert(dirs.length === 10, String(dirs.length));
        assert(dirs[0] === "D:/work/dir11", dirs[0]);
        assert(dirs.indexOf("D:/work/dir0") < 0, "the oldest folder is dropped");
        assert(api.loadSettings().recentDirs.length === 10, "saved with the settings");
        const popup = api.openPopup("settings");
        popup.querySelector('[data-tab="workspace"]').click();
        const list = popup.querySelector('[data-field="recentDir"]');
        assert(list.options.length === 10, String(list.options.length));
        list.value = "D:/work/dir11";
        popup.querySelector('[data-popup-action="remove-dir"]').click();
        assert(api.getSettings().recentDirs.length === 9);
        assert(api.getSettings().recentDirs.indexOf("D:/work/dir11") < 0);
        assert(api.getPopup().querySelector('[data-panel="workspace"]').hidden === false, "stays on the tab");
        api.getPopup().querySelector('[data-popup-action="clear-dirs"]').click();
        assert(api.getSettings().recentDirs.length === 0);
        assert(api.loadSettings().recentDirs.length === 0);
        api.closePopup();
      }),
    ]),
    suite("Language", [
      test("Korean and English have the same phrases", (api, doc, win) => {
        const ko = Object.keys(win.MyMergeI18n.ko);
        const en = Object.keys(win.MyMergeI18n.en);
        assert(ko.length === en.length);
        ko.forEach((key) => {
          assert(en.indexOf(key) >= 0, key);
          assert(win.MyMergeI18n.ko[key].length > 0);
          assert(win.MyMergeI18n.en[key].length > 0);
        });
      }),
      test("the toolbar switches between Korean and English", (api, doc) => {
        assert(doc.querySelector("#toolbar [data-action='save']").title === "저장");
        api.setLanguage("en");
        assert(doc.querySelector("#toolbar [data-action='save']").title === "Save");
        api.setLanguage("ko");
        assert(doc.documentElement.lang === "ko");
      }),
      test("the language button shows the other flag and sits between theme and settings", (api, doc) => {
        const order = [...doc.querySelectorAll("#toolbar [data-action]")].map((button) => button.dataset.action);
        const theme = order.indexOf("themeMenu");
        const language = order.indexOf("language");
        const settings = order.indexOf("settings");
        assert(theme >= 0 && theme < language && language < settings, order.join(","));
        assert(order.indexOf("about") === settings + 1, order.join(","));
        const flag = doc.querySelector("#toolbar [data-action='language']");
        assert(flag.classList.contains("lang-btn"));
        assert(flag.dataset.flag === "uk");
        assert(flag.querySelector("svg.flag"));
        assert(flag.querySelector(".lang-label").textContent === "English");
        assert(flag.getBoundingClientRect().width > 40);
        api.setLanguage("en");
        const english = doc.querySelector("#toolbar [data-action='language']");
        assert(english.dataset.flag === "kr");
        assert(english.querySelector(".lang-label").textContent === "한국어");
      }),
    ]),
    suite("Theme", [
      test("every theme changes the document colors", (api, doc, win) => {
        const themes = win.MyMergeThemes.THEMES;
        assert(themes.filter((item) => item.mode === "dark").length === 20);
        assert(themes.filter((item) => item.mode === "light").length === 20);
        assert(api.themes().indexOf("custom") >= 0);
        assert(api.themes().length === 41);
        api.themes().forEach((id) => {
          api.setTheme(id);
          assert(doc.documentElement.dataset.theme === id, id);
          assert(doc.documentElement.style.getPropertyValue("--bg"));
          const area = doc.getElementById("resultText");
          const ink = win.getComputedStyle(area).color;
          const sheet = win.getComputedStyle(doc.querySelector(".result-wrap")).backgroundColor;
          const lum = (css) => {
            const parts = String(css).match(/[\d.]+/g) || [];
            return 0.2126 * Number(parts[0] || 0) + 0.7152 * Number(parts[1] || 0) + 0.0722 * Number(parts[2] || 0);
          };
          assert(Math.abs(lum(ink) - lum(sheet)) > 40, id + " " + ink + " / " + sheet);
        });
      }),
      test("the theme button opens a dropdown of both columns", (api, doc) => {
        const before = api.getTheme();
        doc.querySelector("#toolbar [data-action='themeMenu']").click();
        const menu = api.getMenu();
        assert(menu && menu.dataset.menu === "theme");
        assert(menu.parentElement.id === "menuLayer");
        assert(doc.defaultView.getComputedStyle(menu).position === "fixed");
        const columns = [...menu.querySelectorAll(".theme-col")];
        assert(columns.length === 2, String(columns.length));
        columns.forEach((column) => {
          const rows = [...column.querySelectorAll(".theme-choice")];
          assert(rows.length === 20, String(rows.length));
          const left = rows[0].getBoundingClientRect().left;
          rows.forEach((row, index) => {
            assert(Math.abs(row.getBoundingClientRect().left - left) <= 1, "theme column " + index);
            if (index > 0) assert(row.getBoundingClientRect().top > rows[index - 1].getBoundingClientRect().top);
          });
        });
        const pick = menu.querySelector(".theme-choice:not(.on)");
        pick.click();
        assert(api.getTheme() !== before);
        assert(api.getTheme() === pick.dataset.action.slice(6));
        const popup = api.openPopup("theme");
        assert(popup.querySelector('[data-panel="custom"]') != null);
        popup.querySelector('[data-field="bg"]').value = "#123456";
        popup.querySelector('[data-popup-action="apply-custom"]').click();
        assert(api.getTheme() === "custom");
        assert(doc.documentElement.style.getPropertyValue("--bg").toLowerCase() === "#123456");
      }),
    ]),
    suite("Toolbar", [
      test("every toolbar button has a tooltip and stays inside the bar", (api, doc) => {
        const shell = doc.getElementById("shell");
        shell.style.width = api.metrics.MIN_WIDTH + "px";
        const help = doc.querySelector("#menubar [data-menu='help']");
        const bar = doc.getElementById("toolbar");
        const buttons = [...bar.querySelectorAll("button")];
        assert(buttons.length >= 20, String(buttons.length));
        const right = bar.getBoundingClientRect().right;
        buttons.forEach((button) => {
          assert(button.title && button.title.length > 0, button.dataset.action || button.id);
          assert(button.getBoundingClientRect().right <= right + 1, (button.dataset.action || button.id) + " sticks out");
        });
        assert(doc.getElementById("opacityRange") == null);
        assert(bar.scrollWidth <= bar.clientWidth + 1, bar.scrollWidth + " / " + bar.clientWidth);
        shell.style.width = "";
      }),
      test("clicking every toolbar button keeps the application alive", async (api, doc) => {
        const actions = [...new Set([...doc.querySelectorAll("#toolbar [data-action]")].map((button) => button.dataset.action))];
        for (const action of actions) {
          await api.run(action);
          const popup = api.getPopup();
          if (popup) {
            const close = popup.querySelector('[data-popup-action="cancel"], [data-popup-action="close"]');
            if (close) close.click();
            else api.closePopup();
          }
          api.closeMenu();
        }
        assert(doc.getElementById("appTitle").textContent === "MyMerge 10.0");
      }),
    ]),
    suite("Menu", [
      test("menus are a single column of icon and label rows", (api, doc) => {
        api.menuDefinitions().forEach((menu) => {
          const el = api.openMenu(menu.id, 8, 60);
          assert(el.parentElement.id === "menuLayer");
          assert(!doc.getElementById("app").contains(el));
          const style = doc.defaultView.getComputedStyle(el);
          assert(style.position === "fixed", menu.id);
          assert(style.flexDirection === "column", menu.id);
          assert(el.scrollHeight <= el.clientHeight + 2, menu.id + " " + el.scrollHeight + "/" + el.clientHeight);
          const items = [...el.querySelectorAll(".menu-item")];
          assert(items.length === menu.items.length);
          items.forEach((item) => {
            assert(item.querySelector("svg"), item.dataset.action);
            assert(item.querySelector(".label").textContent.length > 0, item.dataset.action);
            assert(item.offsetHeight <= 34, item.dataset.action);
          });
          api.closeMenu();
        });
      }),
      test("a menu can be taller than the window content", (api, doc) => {
        for (let i = 0; i < 10; i += 1) api.addRecent({ id: "m" + i, name: "recent-" + i + ".txt", path: "C:/r/" + i + ".txt" });
        const el = api.openMenu("file", 4, 20);
        const app = doc.getElementById("app");
        assert(el.offsetHeight > 400, String(el.offsetHeight));
        assert(el.scrollHeight <= el.clientHeight + 2);
        assert(el.getBoundingClientRect().bottom > app.getBoundingClientRect().top);
        api.closeMenu();
      }),
      test("menus open on their button and settings and about sit on the right", (api, doc) => {
        const file = doc.querySelector("#menubar [data-menu='file']");
        file.click();
        const opened = api.getMenu();
        const fileBox = file.getBoundingClientRect();
        const menuBox = opened.getBoundingClientRect();
        assert(Math.abs(menuBox.left - fileBox.left) <= 2, menuBox.left + " vs " + fileBox.left);
        assert(Math.abs(menuBox.top - fileBox.bottom) <= 2, menuBox.top + " vs " + fileBox.bottom);
        api.closeMenu();
        const help = doc.querySelector("#menubar [data-menu='help']");
        const bar = doc.getElementById("toolbar");
        const panels = doc.querySelector("#toolbar [data-action='toggleRight']");
        const right = ["themeCycle", "themeMenu", "language", "settings", "about"].map((name) => doc.querySelector("#toolbar [data-action='" + name + "']"));
        right.forEach((button, index) => {
          assert(button, "toolbar button " + index);
          assert(button.getBoundingClientRect().left > panels.getBoundingClientRect().right, "right of panels " + index);
          if (index > 0) assert(button.getBoundingClientRect().left > right[index - 1].getBoundingClientRect().left);
        });
        assert(Math.abs(right[4].getBoundingClientRect().right - bar.getBoundingClientRect().right) <= 10, "flush right");
        ["settings", "about", "language", "themeMenu", "themeCycle"].forEach((name) => {
          assert(doc.querySelector("#menubar [data-action='" + name + "']") == null, "menubar " + name);
        });
        ["minimize", "maximize", "close"].forEach((name) => {
          const control = doc.querySelector("#menubar [data-window='" + name + "']");
          assert(control && control.title.length > 0, "window control " + name);
          assert(control.getBoundingClientRect().left > help.getBoundingClientRect().right, "control right of help");
        });
        assert(doc.querySelector(".titlebar") == null, "no separate title bar");
        right[4].click();
        assert(api.getPopup().dataset.kind === "about");
        api.closePopup();
        right[3].click();
        assert(api.getPopup().dataset.kind === "settings");
        api.closePopup();
      }),
      test("every enabled menu command can run", async (api) => {
        const actions = [];
        api.menuDefinitions().forEach((menu) => menu.items.forEach((item) => {
          if (!item.disabled) actions.push(item.action);
        }));
        for (const action of actions) {
          await api.run(action);
          const popup = api.getPopup();
          if (popup) {
            const close = popup.querySelector('[data-popup-action="cancel"], [data-popup-action="close"], [data-popup-action="discard"]');
            if (close) close.click();
            else api.closePopup();
          }
        }
        api.reopen();
        assert(actions.length > 20);
      }),
    ]),
    suite("Popup", [
      test("every popup is fixed, fits without a scrollbar, and uses one line per row", (api) => {
        api.showError(new Error("disk full"));
        api.closePopup();
        ["settings", "about", "error", "progress", "print", "unsaved", "recent", "save", "git", "assign", "theme", "guide"].forEach((kind) => {
          const el = api.openPopup(kind);
          const spec = api.metrics.POPUPS[kind];
          assert(Math.abs(el.offsetWidth - spec.width) <= 2, kind + " width");
          assert(Math.abs(el.offsetHeight - spec.height) <= 2, kind + " height");
          assert(el.scrollHeight <= el.clientHeight + 2, kind + " v " + el.scrollHeight + "/" + el.clientHeight);
          assert(el.scrollWidth <= el.clientWidth + 2, kind + " h " + el.scrollWidth + "/" + el.clientWidth);
          const style = el.ownerDocument.defaultView.getComputedStyle(el);
          assert(style.overflow === "hidden", kind);
          assert(style.position === "fixed", kind);
          const bar = el.querySelector("header.popup-titlebar");
          assert(bar, kind + " title bar");
          const icon = bar.querySelector(".popup-ico svg");
          assert(icon, kind + " icon");
          assert(icon.innerHTML.length > 0, kind + " icon body");
          assert(bar.querySelector(".popup-title").textContent.length > 0, kind + " title");
          const view = el.ownerDocument.defaultView;
          const fits = (where) => {
            el.querySelectorAll("*").forEach((node) => {
              if (node.hidden || node.offsetParent === null) return;
              const box = view.getComputedStyle(node);
              if (box.overflow !== "hidden" && box.overflowY !== "hidden") return;
              const name = kind + " " + where + " " + (node.className || node.tagName);
              assert(node.scrollHeight <= node.clientHeight + 2, name + " is cut off");
              assert(node.scrollWidth <= node.clientWidth + 2, name + " is cut off sideways");
            });
            assert(el.scrollHeight <= el.clientHeight + 2, kind + " " + where + " v");
            assert(el.scrollWidth <= el.clientWidth + 2, kind + " " + where + " h");
          };
          fits("start");
          el.querySelectorAll("[data-tab]").forEach((tab) => {
            tab.click();
            fits(tab.dataset.tab);
          });
          el.querySelectorAll(".line").forEach((line) => {
            assert(line.offsetHeight <= 34, kind + " line " + line.textContent);
          });
          api.closePopup();
        });
      }),
      test("the user guide opens in a popup instead of a server link", async (api) => {
        await api.run("guide");
        const popup = api.getPopup();
        assert(popup.dataset.kind === "guide");
        assert(popup.querySelector(".popup-title").textContent === "사용법 안내");
        assert(popup.querySelectorAll('[data-panel="open"] .line').length === 5);
        assert(api.getLastLink() === "");
        api.closePopup();
      }),
      test("popups close when the application closes", (api) => {
        api.openPopup("about");
        api.openMenu("help");
        api.closeApplication();
        assert(api.getPopup() == null);
        assert(api.getMenu() == null);
        assert(api.isClosed() === true);
        api.reopen();
      }),
    ]),
    suite("Tabs", [
      test("overflow uses arrow buttons instead of a scrollbar", (api, doc) => {
        const strip = doc.getElementById("tabstrip");
        assert(doc.defaultView.getComputedStyle(strip).overflow === "hidden");
        assert(doc.getElementById("tabPrev").disabled === true);
        api.addTabs(24);
        assert(api.tabOverflow() === true);
        assert(doc.getElementById("tabNext").disabled === false);
        assert(doc.getElementById("tabNext").title.length > 0);
        const before = strip.scrollLeft;
        api.scrollTabs(1);
        assert(strip.scrollLeft > before);
      }),
    ]),
    suite("Status", [
      test("the status bar shows the working state", (api, doc) => {
        ["stState", "stFile", "stConflicts", "stDirty", "stZoom", "stLang", "stTheme", "stEncoding", "stPos", "stGit", "stVersion"].forEach((id) => {
          const el = doc.getElementById(id);
          assert(el && el.textContent.length > 0, id);
        });
        assert(doc.getElementById("stVersion").textContent === "10.0.0");
        assert(doc.getElementById("stFile").textContent === "total.js");
      }),
    ]),
    suite("Context", [
      test("the context menu has an icon and a label on every row", (api, doc) => {
        const menu = api.openContextAt(40, 120);
        assert(menu.dataset.menu === "context");
        assert(doc.defaultView.getComputedStyle(menu).flexDirection === "column");
        const items = [...menu.querySelectorAll(".menu-item")];
        assert(items.length >= 6);
        items.forEach((item) => {
          assert(item.querySelector("svg"));
          assert(item.querySelector(".label").textContent.length > 0);
        });
        api.closeMenu();
      }),
    ]),
    suite("Clipboard", [
      test("Ctrl+C and Ctrl+V copy and paste", (api, doc) => {
        api.selectResult(0, 7);
        doc.defaultView.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
        assert(api.getClipboard() === "<<<<<<<", api.getClipboard());
        api.selectResult(0, 0);
        doc.defaultView.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));
        assert(api.getResultText().indexOf("<<<<<<<") === 0);
        assert(api.canUndo() === true);
      }),
      test("copy and paste commands use the clipboard buffer", (api) => {
        api.setResultText("alpha beta");
        api.selectResult(0, 5);
        assert(api.copy() === "alpha");
        api.selectResult(6, 10);
        api.paste();
        assert(api.getResultText().indexOf("alpha") >= 0);
      }),
    ]),
    suite("Zoom", [
      test("Ctrl+wheel zooms in and out", (api, doc) => {
        api.setZoom(100);
        doc.defaultView.dispatchEvent(new doc.defaultView.WheelEvent("wheel", { ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true }));
        assert(api.getZoom() === 110, String(api.getZoom()));
        doc.defaultView.dispatchEvent(new doc.defaultView.WheelEvent("wheel", { ctrlKey: true, deltaY: 120, bubbles: true, cancelable: true }));
        assert(api.getZoom() === 100);
        assert(doc.getElementById("zoomValue").textContent === "100%");
      }),
    ]),
    suite("Print", [
      test("all, current, and custom ranges build a preview", (api, doc) => {
        api.openPopup("print");
        api.setPrintOption("scope", "all");
        assert(api.previewCount() === 2, String(api.previewCount()));
        api.setPrintOption("scope", "current");
        assert(api.previewCount() === 1);
        api.setPrintOption("scope", "custom");
        api.setPrintOption("from", 1);
        api.setPrintOption("to", 1);
        assert(api.previewCount() === 1);
        api.setPrintOption("paper", "Letter");
        api.setPrintOption("orientation", "landscape");
        api.setPrintOption("margin", 18);
        doc.querySelector('[data-popup-action="do-print"]').click();
        const job = api.getLastPrint();
        assert(job.scope === "custom" && job.paper === "Letter" && job.orientation === "landscape" && job.margin === 18);
        assert(job.count === 1);
      }),
      test("print preview moves by page buttons", (api, doc) => {
        api.openPopup("print");
        api.setPrintOption("scope", "all");
        const label = doc.getElementById("printPage").textContent;
        doc.querySelector('[data-popup-action="print-next"]').click();
        assert(doc.getElementById("printPage").textContent !== label);
      }),
    ]),
    suite("Drop", [
      test("three dropped files become one merge", async (api) => {
        await api.dropFiles([
          { name: "base.txt", text: "A\nB\n" },
          { name: "ours.txt", text: "A\nX\n" },
          { name: "theirs.txt", text: "A\nB\nY\n" },
        ]);
        const doc = api.getDoc();
        assert(doc.baseText.indexOf("A") === 0, doc.baseText);
        assert(doc.localText.indexOf("X") >= 0);
        assert(doc.remoteText.indexOf("Y") >= 0);
      }),
      test("a conflict-marker file opens as a merge", async (api) => {
        await api.dropFiles([{ name: "conflict.txt", text: "<<<<<<< LOCAL\nL\n||||||| BASE\nB\n=======\nR\n>>>>>>> REMOTE\n" }]);
        assert(api.conflictCount() === 1);
      }),
      test("one plain file asks which pane to use", async (api) => {
        await api.dropFiles([{ name: "note.txt", text: "hello" }]);
        assert(api.getPopup().dataset.kind === "assign");
      }),
      test("a session file dropped from outside opens", async (api, doc, win) => {
        const raw = win.MyMergeSession.serialize([{ name: "dropped.txt", baseText: "a\n", localText: "b\n", remoteText: "c\n", resultText: "b\n" }]);
        await api.dropFiles([{ name: "work.mmerge", text: raw }]);
        assert(api.getDocs().some((item) => item.name === "dropped.txt"));
      }),
    ]),
    suite("Close", [
      test("a dirty document asks before closing", (api, doc) => {
        api.setResultText("dirty\n");
        assert(api.requestClose() === "ask");
        assert(api.getPopup().dataset.kind === "unsaved");
        doc.querySelector('[data-popup-action="cancel"]').click();
        assert(api.isClosed() === false);
        api.requestClose();
        doc.querySelector('[data-popup-action="discard"]').click();
        assert(api.isClosed() === true);
      }),
      test("a clean document closes directly", (api) => {
        assert(api.requestClose() === "closed");
        assert(api.isClosed() === true);
      }),
    ]),
    suite("Font", [
      test("registry output becomes family names", (api, doc, win) => {
        const names = win.MyMergeFonts.parseWindowsFontQuery([
          "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
          "    Arial (TrueType)    REG_SZ    arial.ttf",
          "    Arial Bold (TrueType)    REG_SZ    arialbd.ttf",
          "    Consolas (TrueType)    REG_SZ    consola.ttf",
          "    Malgun Gothic (TrueType)    REG_SZ    malgun.ttf",
        ].join("\n"));
        assert(names.indexOf("Arial") >= 0);
        assert(names.indexOf("Consolas") >= 0);
        assert(names.indexOf("Malgun Gothic") >= 0);
        assert(names.filter((name) => name === "Arial").length === 1);
      }),
      test("the font list in settings contains every provided family", (api, doc) => {
        const names = ["Arial", "Consolas", "Malgun Gothic", "Times New Roman"];
        api.setFontCatalog(names);
        const popup = api.openPopup("settings");
        const options = [...popup.querySelectorAll('[data-field="fontFamily"] option')].map((option) => option.value);
        names.forEach((name) => assert(options.indexOf(name) >= 0, name));
      }),
    ]),
    suite("Background", [
      test("a large image is accepted and remembered", async (api, doc) => {
        assert(api.validateBackground(5000000) === true);
        const bytes = new Uint8Array(200000);
        bytes[0] = 137;
        await api.setBackgroundBytes(bytes, "image/png", "wide.png");
        const settings = api.getSettings();
        assert(settings.backgroundName === "wide.png");
        assert(settings.backgroundBytes === 200000);
        assert(doc.documentElement.style.getPropertyValue("--workspace-image").indexOf("blob:") >= 0);
      }),
    ]),
    suite("Progress", [
      test("the progress popup shows a percent and can be copied as state", (api, doc) => {
        api.showProgress("Saving", 40);
        assert(api.getPopup().dataset.kind === "progress");
        assert(doc.getElementById("progressPct").textContent === "40");
        api.showProgress("Saving", 100);
        assert(api.progressValue() === 100);
        api.finishProgress();
        assert(api.getPopup() == null);
      }),
      test("download and link open a progress run", async (api) => {
        await api.runDownload();
        assert(api.getLastDownload().name === "sample.mmerge");
        assert(api.progressMarks().indexOf(100) >= 0);
        await api.runOpenLink("https://localhost/mymerge/USERSGUIDE.md");
        assert(api.getLastLink() === "https://localhost/mymerge/USERSGUIDE.md");
      }),
      test("saving a large result reports progress", async (api) => {
        api.setResultText("x".repeat(70000));
        await api.run("save");
        const saved = api.getLastSaved();
        assert(saved && saved.bytes >= 70000, JSON.stringify(saved && saved.bytes));
        assert(api.progressMarks().indexOf(100) >= 0);
      }),
    ]),
    suite("Error", [
      test("an error popup keeps the details and copies them", (api, doc) => {
        const error = new Error("disk full");
        error.code = "EIO";
        api.showError(error);
        const text = api.getErrorText();
        assert(text.indexOf("disk full") >= 0, text);
        assert(text.indexOf("EIO") >= 0, text);
        assert(text.indexOf("MyMerge 10.0") >= 0, text);
        const field = doc.getElementById("errorDetail").value;
        assert(field.indexOf("disk full") >= 0, field);
        assert(field.indexOf("EIO") >= 0, field);
        assert(field.indexOf("\n") < 0, "detail should stay on one line");
        doc.querySelector('[data-popup-action="copy-error"]').click();
        assert(api.getClipboard() === field, api.getClipboard());
        assert(api.copyError().indexOf("disk full") >= 0);
      }),
    ]),
    suite("Git", [
      test("porcelain lists only conflicts", (api, doc, win) => {
        const files = win.MyMergeGit.conflictPaths("UU src/a.js\n M src/b.js\nAA src/c.js\n?? note.txt\n");
        assert(files.length === 2, files.join(","));
        assert(files[0] === "src/a.js" && files[1] === "src/c.js");
      }),
      test("mergetool arguments and stage commands are recognized", (api, doc, win) => {
        const args = win.MyMergeGit.collectLaunchArgs(["electron", ".", "--", "base", "local", "remote", "merged"], false);
        const launch = win.MyMergeGit.parseLaunchArgs(args);
        assert(launch.mode === "mergetool" && launch.merged === "merged");
        const stages = win.MyMergeGit.stageArgs("src/a.js");
        assert(stages[0][1] === ":1:src/a.js" && stages[2][1] === ":3:src/a.js");
        const config = win.MyMergeGit.mergetoolConfig("MyMerge").join("\n");
        assert(config.indexOf("mergetool.mymerge") >= 0);
        assert(win.MyMergeGit.formatGitError("status", "not a repository").indexOf("not a repository") >= 0);
      }),
      test("opening a repository in the app shows the branch", (api, doc) => {
        api.run("git");
        assert(api.getPopup().dataset.kind === "git");
        assert(doc.getElementById("stGit").textContent.length > 0);
        assert(doc.body.textContent.indexOf("main") >= 0);
      }),
    ]),
    suite("Installer", [
      test("the Windows installer removes the old program and asks about saved data", async () => {
        const script = await text("/build/installer.nsh");
        assert(script.indexOf("RMDir /r") >= 0);
        assert(script.indexOf("저장된 데이터") >= 0);
        assert(script.indexOf("삭제하시겠습니까") >= 0);
        assert(script.indexOf("Saved data was found") >= 0);
        assert(script.indexOf("Do you want to delete it?") >= 0);
        assert(script.indexOf("document.ico") >= 0);
        assert(script.indexOf(".mmerge") >= 0);
        assert(script.indexOf("MyMerge.Session") >= 0);
        assert(script.indexOf("1042") >= 0);
      }),
      test("Linux and macOS installers ask before deleting saved data", async () => {
        const linux = await text("/build/linux-before-install.sh");
        const mac = await text("/build/pkg-scripts/preinstall");
        assert(linux.indexOf("/opt/MyMerge") >= 0);
        assert(linux.indexOf("저장된 데이터") >= 0 && linux.indexOf("Saved data") >= 0);
        assert(mac.indexOf("MyMerge.app") >= 0);
        assert(mac.indexOf("삭제하시겠습니까") >= 0);
      }),
      test("every build option is one electron-builder still accepts", async () => {
        const pkg = JSON.parse(await text("/package.json"));
        const schema = JSON.parse(await text("/node_modules/app-builder-lib/scheme.json"));
        const known = (node) => {
          if (!node) return null;
          if (node.properties) return Object.keys(node.properties);
          const ref = node.$ref || (node.anyOf || []).map((item) => item.$ref).find(Boolean);
          if (!ref) return null;
          return known(schema.definitions[ref.split("/").pop()]);
        };
        const check = (config, node, where) => {
          const names = known(node);
          assert(names, where + " is missing from the schema");
          Object.keys(config).forEach((key) => {
            assert(names.indexOf(key) >= 0, where + "." + key + " is not an electron-builder option");
          });
        };
        check(pkg.build, schema, "build");
        ["win", "mac", "linux", "nsis", "deb", "pkg"].forEach((section) => {
          if (!pkg.build[section]) return;
          check(pkg.build[section], schema.properties[section], "build." + section);
        });
      }),
      test("the package uses one icon and both installer languages", async () => {
        const pkg = JSON.parse(await text("/package.json"));
        assert(pkg.version === "10.0.0");
        assert(pkg.build.win.icon === "assets/icon.ico");
        assert(pkg.build.nsis.installerIcon === "assets/icon.ico");
        assert(pkg.build.nsis.uninstallerIcon === "assets/icon.ico");
        assert(pkg.build.nsis.installerLanguages.indexOf("ko_KR") >= 0);
        assert(pkg.build.nsis.installerLanguages.indexOf("en_US") >= 0);
        assert(pkg.build.fileAssociations[0].ext === "mmerge");
        assert(pkg.build.fileAssociations[0].icon === "assets/document.ico");
        assert(pkg.author.email === "knix008@naver.com");
        const main = await text("/electron/main.js");
        assert(main.indexOf("build.title") >= 0);
        assert(main.indexOf("iconPath") >= 0);
        assert(main.indexOf("closeChildren") >= 0);
        assert(main.indexOf("parent:") >= 0);
        assert(main.indexOf("resizable: false") >= 0);
      }),
    ]),
    suite("Icons", [
      test("the Windows icon carries every shortcut size", async () => {
        async function entries(url) {
          const buffer = await (await fetch(url + "?t=" + Date.now())).arrayBuffer();
          const view = new DataView(buffer);
          const count = view.getUint16(4, true);
          const sizes = [];
          for (let index = 0; index < count; index += 1) sizes.push(new Uint8Array(buffer)[6 + index * 16] || 256);
          return sizes;
        }
        const want = [16, 24, 32, 48, 64, 128, 256];
        for (const file of ["/assets/icon.ico", "/assets/document.ico", "/build/icon.ico"]) {
          const sizes = await entries(file);
          want.forEach((size) => assert(sizes.indexOf(size) >= 0, file + " is missing " + size));
        }
      }),
      test("app and document icons have a transparent edge and a bright top-left", async () => {
        async function sample(url) {
          const image = new Image();
          image.src = url + "?t=" + Date.now();
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(image, 0, 0);
          const pixel = (x, y) => ctx.getImageData(x, y, 1, 1).data;
          return { image: image, pixel: pixel };
        }
        const appIcon = await sample("/assets/icon.png");
        const docIcon = await sample("/assets/document.png");
        assert(appIcon.pixel(0, 0)[3] === 0, "app corner");
        assert(docIcon.pixel(0, 0)[3] === 0, "document corner");
        assert(appIcon.pixel(1, Math.floor(appIcon.image.height / 2))[3] === 0);
        const lum = (data) => 0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2];
        const bright = appIcon.pixel(Math.floor(appIcon.image.width * 0.28), Math.floor(appIcon.image.height * 0.22));
        const dark = appIcon.pixel(Math.floor(appIcon.image.width * 0.7), Math.floor(appIcon.image.height * 0.78));
        assert(bright[3] > 0 && lum(bright) > lum(dark), lum(bright) + " vs " + lum(dark));
        const left = appIcon.pixel(Math.floor(appIcon.image.width * 0.16), Math.floor(appIcon.image.height * 0.5));
        const docLeft = docIcon.pixel(Math.floor(docIcon.image.width * 0.16), Math.floor(docIcon.image.height * 0.5));
        assert(left[3] !== docLeft[3] || left[0] !== docLeft[0], "icons should differ");
      }),
    ]),
    suite("Window", [
      test("the title bar shows the name and version", (api, doc) => {
        assert(doc.title === "MyMerge 10.0");
        assert(doc.getElementById("appTitle").textContent === "MyMerge 10.0");
        assert(api.build.author === "SHKWON(knix008@naver.com)");
        assert(api.build.build === "2026.10.05.1");
        const about = api.openPopup("about");
        assert(about.textContent.indexOf("SHKWON(knix008@naver.com)") >= 0);
        assert(about.textContent.indexOf("2026.10.05.1") >= 0);
        assert(about.querySelector("[data-author]").getAttribute("data-author") === "SHKWON(knix008@naver.com)");
      }),
      test("the bottom-right corner shows a resize grip", (api, doc) => {
        const grip = doc.getElementById("resizeGrip");
        const app = doc.getElementById("app");
        const gripBox = grip.getBoundingClientRect();
        const appBox = app.getBoundingClientRect();
        assert(grip.querySelector("svg"), "grip marker");
        assert(grip.title.length > 0);
        assert(gripBox.width >= 12 && gripBox.height >= 12);
        assert(Math.abs(gripBox.right - appBox.right) <= 6, String(gripBox.right));
        assert(Math.abs(gripBox.bottom - appBox.bottom) <= 6, String(gripBox.bottom));
        assert(doc.defaultView.getComputedStyle(grip).cursor === "nwse-resize");
        api.setLanguage("en");
        assert(grip.title === "Resize window");
      }),
      test("the minimum width matches the toolbar constant", (api, doc) => {
        assert(api.metrics.MIN_WIDTH === 1200);
        assert(doc.defaultView.getComputedStyle(doc.getElementById("shell")).minWidth === "1200px");
      }),
    ]),
    suite("Panels", [
      test("the left panel is tools and the right panel edits properties", (api, doc) => {
        assert(doc.getElementById("leftPanel").textContent.indexOf("도구") >= 0);
        const input = doc.querySelector('#rightPanel [data-prop="name"]');
        input.value = "renamed.js";
        input.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
        assert(api.getDoc().name === "renamed.js");
        assert(api.getDoc().dirty === true);
        api.run("toggleLeft");
        assert(doc.getElementById("leftPanel").classList.contains("hidden"));
        api.run("toggleRight");
        assert(doc.getElementById("rightPanel").classList.contains("hidden"));
      }),
    ]),
  ];
})();
