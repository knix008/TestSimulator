import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../src/domain/en";
import { systemLanguage } from "../src/domain/i18n";
import { ko } from "../src/domain/ko";
import { DEFAULT_SETTINGS, MIN_EVENTS_HEIGHT, STORAGE_KEY } from "../src/domain/settings";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (): Promise<unknown> => null),
  enable: vi.fn(async () => undefined),
  disable: vi.fn(async () => undefined),
  startDragging: vi.fn(async () => undefined),
  startResizeDragging: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  setTitle: vi.fn(async (_title: string) => undefined),
  setMinSize: vi.fn(async (_size: { width: number; height: number }) => undefined),
  setSize: vi.fn(async (_size: { width: number; height: number }) => undefined),
  isMaximized: vi.fn(async () => false),
  onResized: vi.fn(async (_handler: () => void) => () => {}),
  label: "main",
  listen: vi.fn(async (_name: string, _handler: (event: { payload: string }) => void) => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: mocks.enable,
  disable: mocks.disable,
}));

vi.mock("@tauri-apps/api/window", () => ({
    LogicalSize: class {
      constructor(
        public width: number,
        public height: number,
      ) {}
    },
    getCurrentWindow: () => ({
    startDragging: mocks.startDragging,
    startResizeDragging: mocks.startResizeDragging,
    close: mocks.close,
    setTitle: mocks.setTitle,
    setMinSize: mocks.setMinSize,
    setSize: mocks.setSize,
    isMaximized: mocks.isMaximized,
    onResized: mocks.onResized,
    get label() {
      return mocks.label;
    },
  }),
}));

const desktop = await import("../src/platform/desktop");

function asDesktop() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
}

describe("Desktop", () => {
  it("stays on the web path when the Tauri runtime is absent", async () => {
    expect(desktop.isTauri()).toBe(false);
    expect(await desktop.readInstallLanguage()).toBeNull();
    expect(await desktop.currentWindowLabel()).toBe("main");
    await desktop.hideMain();
    await desktop.openAux("settings");
    await desktop.setAutostartEnabled(true);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("opens the holiday source in a browser tab on the web", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await desktop.openHolidaySource();
    expect(open).toHaveBeenCalledWith("https://date.nager.at", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("syncs tray labels, always on top, windows, and autostart", async () => {
    asDesktop();
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValueOnce("ko");
    expect(await desktop.readInstallLanguage()).toBe("ko");
    mocks.invoke.mockResolvedValue(null);
    await desktop.syncShell({ ...DEFAULT_SETTINGS, language: "en", alwaysOnTop: true }, en);
    expect(mocks.invoke).toHaveBeenCalledWith("update_tray_labels", {
      show: en.showHide,
      events: en.manageEvents,
      settings: en.settings,
      about: en.about,
      quit: en.quit,
      tooltip: en.trayTooltip,
      language: "en",
      languageSwitch: "한국어",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("set_main_always_on_top", { on: true });
    await desktop.openAux("settings");
    await desktop.hideMain();
    expect(mocks.invoke).toHaveBeenCalledWith("open_aux_window", { label: "settings" });
    await desktop.openAux("events");
    expect(mocks.invoke).toHaveBeenCalledWith("open_aux_window", { label: "events" });
    expect(mocks.invoke).toHaveBeenCalledWith("hide_main", undefined);
    await desktop.setAutostartEnabled(true);
    await desktop.setAutostartEnabled(false);
    expect(mocks.enable).toHaveBeenCalled();
    expect(mocks.disable).toHaveBeenCalled();
  });

  it("drags from empty chrome and ignores controls", async () => {
    asDesktop();
    mocks.startDragging.mockClear();
    const button = document.createElement("button");
    const title = document.createElement("h1");
    await desktop.dragWindow({ button: 0, target: button });
    await desktop.dragWindow({ button: 2, target: title });
    expect(mocks.startDragging).not.toHaveBeenCalled();
    await desktop.dragWindow({ button: 0, target: title });
    expect(mocks.startDragging).toHaveBeenCalledOnce();
    await desktop.startWindowDrag();
    expect(mocks.startDragging).toHaveBeenCalledTimes(2);
  });

  it("switches language from the tray with the other language's flag", async () => {
    asDesktop();
    const rust = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    expect(rust).toMatch(/if language == "ko" \{\s*tray_icon_bytes!\("flag-uk"\)\s*\} else \{\s*tray_icon_bytes!\("flag-kr"\)/);
    expect(rust).toContain('if language == "ko" { "English" } else { "한국어" }');
    expect(rust).toContain('app.emit("tray-language", next)');
    expect(ko.languageSwitch).toBe("English");
    expect(en.languageSwitch).toBe("한국어");

    const seen: string[] = [];
    await desktop.onTrayLanguage((language) => seen.push(language));
    expect(mocks.listen).toHaveBeenCalledWith("tray-language", expect.any(Function));
    const handler = mocks.listen.mock.calls[0][1] as (event: { payload: string }) => void;
    handler({ payload: "ko" });
    handler({ payload: "fr" });
    handler({ payload: "en" });
    expect(seen).toEqual(["ko", "en"]);
  });

  it("minimizes to the tray and toggles maximize on the calendar window", async () => {
    asDesktop();
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(null);
    await desktop.minimizeMain();
    expect(mocks.invoke).toHaveBeenCalledWith("minimize_main", undefined);
    mocks.invoke.mockResolvedValueOnce(true);
    expect(await desktop.toggleMaximizeMain()).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("toggle_maximize_main", undefined);

    const seen: boolean[] = [];
    await desktop.onMaximizedChange((value) => seen.push(value));
    mocks.isMaximized.mockClear();
    mocks.isMaximized.mockResolvedValueOnce(true);
    const onResize = mocks.onResized.mock.calls[0][0];
    for (let step = 0; step < 30; step += 1) onResize();
    await vi.waitFor(() => expect(seen).toEqual([false, true]));
    expect(mocks.isMaximized).toHaveBeenCalledTimes(1);

    // Sizing a maximized window un-maximizes it on Windows, so fits queued by the maximize itself are dropped.
    mocks.setSize.mockClear();
    mocks.setMinSize.mockClear();
    mocks.isMaximized.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await desktop.setWindowSize(1920, 1200);
    await desktop.setWindowMinSize(470, 1200);
    expect(mocks.setSize).not.toHaveBeenCalled();
    expect(mocks.setMinSize).not.toHaveBeenCalled();
    await desktop.setWindowSize(470, 511);
    expect(mocks.setSize).toHaveBeenCalledWith({ width: 470, height: 511 });

    // Leaving full screen brings back the size from before it, never the screen-sized one it is leaving.
    const screen = readFileSync(resolve("src/ui/CalendarScreen.tsx"), "utf8");
    expect(screen).toContain("if (leaving) restoring.current = normalWindowSize(settings.windowSize);");
    expect(screen).toContain("let width = leaving ? minWidth : window.innerWidth;");
    expect(screen).toContain("size.width >= window.screen.availWidth && size.height >= window.screen.availHeight");

    const rust = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    // The calendar never gets a taskbar button: minimizing, from the app or the OS, hides it to the tray.
    expect(rust).not.toContain("set_skip_taskbar(false)");
    expect(rust).toMatch(/fn minimize_main\([^)]*\)[^{]*\{[^}]*window\.hide\(\)/);
    expect(rust).toMatch(/WindowEvent::Resized\(_\) if window\.is_minimized\(\)\.unwrap_or\(false\) => \{\s*let _ = window\.hide\(\);/);
    expect(rust).toMatch(/minimize_main,\s*toggle_maximize_main,/);
  });

  it("never shrinks the window below the calendar, the events toggle, and one event", async () => {
    const config = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"));
    const main = config.app.windows.find((window: { label: string }) => window.label === "main");
    // Toolbar 46, weekdays 25, square 7x5 grid at the narrowest width, collapsed footer 45, 1px border top and bottom.
    const collapsed = 46 + 25 + ((main.minWidth - 2) * 5) / 7 + 45 + 2;
    expect(main.minWidth).toBe(desktop.MIN_WINDOW_WIDTH);
    // The minimum leaves the app's name out; it follows the toolbar measured for the language and format.
    expect(desktop.MIN_WINDOW_WIDTH).toBe(366);
    const screenSource = readFileSync(resolve("src/ui/CalendarScreen.tsx"), "utf8");
    expect(screenSource).toContain("toolbarWidth(toolbarRef.current, panel)");
    expect(screenSource).toContain("[settings.language, titleFormat]");
    expect(screenSource).toContain("- (name?.getBoundingClientRect().width ?? 0)");
    expect(main.minHeight).toBe(Math.ceil(collapsed));

    // The minimum follows the current width, so changing only the height never squeezes the grid; while the
    // events are open it also keeps the add-event row and one event line.
    const screen = readFileSync(resolve("src/ui/CalendarScreen.tsx"), "utf8");
    expect(screen.match(/layout\.chrome \+ (layout\.)?squareDays \+ \(collapsed \? 0 : MIN_EVENTS_HEIGHT\)/g)).toHaveLength(2);
    expect(screen).toContain('window.addEventListener("resize", follow)');
    expect(screen).not.toContain(".footer.collapsed) .days");
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).not.toMatch(/footer\.collapsed\) \.days \{ flex-grow/);
    expect(MIN_EVENTS_HEIGHT).toBe(48);
    const capabilities = readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8");
    expect(capabilities).toContain('"core:window:allow-set-min-size"');

    asDesktop();
    await desktop.setWindowMinSize(480, 515.4);
    expect(mocks.setMinSize).toHaveBeenCalledWith({ width: 480, height: 516 });
  });

  it("leaves the window size to the user and fits it only when the content changes shape", () => {
    const grip = readFileSync(resolve("src/ui/usePanelResize.ts"), "utf8");
    const screen = readFileSync(resolve("src/ui/CalendarScreen.tsx"), "utf8");
    expect(grip).toMatch(/if \(isTauri\(\)\) \{\s*void resizeWindow\("SouthEast"\);\s*return;/);
    expect(grip).not.toContain("setWindowSize");
    // The one observer only decides whether the app's name fits; it never sizes the window.
    expect(screen.match(/new ResizeObserver\(\w+\)/g)).toEqual(["new ResizeObserver(fitName)"]);
    expect(screen).toMatch(/const fitName = \(\) => \{[^}]*setShowName\([^)]*\);\s*\};/);
    expect(screen).toContain("}, [collapsed, maximized]);");
    expect(screen).toContain('window.addEventListener("resize", remember)');
    // The events height saved by the same resize re-renders first; reading through refs keeps that from
    // cancelling the pending window size save.
    expect(screen).toContain("updateRef.current({ windowSize: { width, height } });");
  });

  it("resizes and closes the current desktop window", async () => {
    asDesktop();
    mocks.label = "settings";
    await desktop.resizeWindow("SouthEast");
    await desktop.closeCurrentWindow();
    expect(mocks.startResizeDragging).toHaveBeenCalledWith("SouthEast");
    expect(mocks.close).toHaveBeenCalled();
    expect(await desktop.currentWindowLabel()).toBe("settings");
    await desktop.setWindowTitle("설정");
    expect(mocks.setTitle).toHaveBeenCalledWith("설정");
  });

  it("gives the settings and events windows their own title bar icon and title", () => {
    const rust = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    const app = readFileSync(resolve("src/ui/App.tsx"), "utf8");
    const capabilities = JSON.parse(readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8"));
    expect(rust).toContain('include_bytes!("../icons/tray/settings-64.png")');
    expect(rust).toContain('include_bytes!("../icons/tray/events-64.png")');
    expect(rust).toMatch(/\.title\(aux_title\(app, label\)\)\s*\.icon\(/);
    expect(capabilities.windows).toContain("events");
    expect(app).toContain('kind === "settings" || kind === "events"');
    // The print preview is a wide, resizable window of its own.
    expect(rust).toContain('"print" => (include_bytes!("../icons/tray/print-64.png"), 1040.0, 720.0, 760.0, 520.0, true)');
    expect(rust).toContain('_ => (include_bytes!("../icons/tray/settings-64.png"), 600.0, 760.0, 380.0, 420.0, false)');
    // The event editor is a resizable window of its own, kept above a calendar that stays on top.
    expect(rust).toContain('"editor" => (include_bytes!("../icons/tray/events-64.png"), 460.0, 492.0, 380.0, EDITOR_MIN_HEIGHT, true)');
    // Its height then follows the form, inside the work area, so no space is left under the buttons.
    expect(rust).toContain("async fn fit_editor_window(window: tauri::WebviewWindow, height: f64)");
    expect(rust).toMatch(/generate_handler!\[[^\]]*fit_editor_window/s);
    const editor = readFileSync(resolve("src/ui/EventEditor.tsx"), "utf8");
    expect(editor).toContain("const wanted = above + form.scrollHeight");
    expect(editor).toContain("void fitEditorWindow(wanted)");
    expect(rust).toContain('let on_top = label == "editor" && KEEP_ON_TOP.load(Ordering::SeqCst);');
    expect(rust).toContain(".always_on_top(on_top)");
    expect(capabilities.windows).toContain("editor");
    expect(app).toContain('kind === "editor" ? (');
    expect(capabilities.windows).toContain("print");
    expect(app).toContain('kind === "print"');
    // Right-clicking the desktop app never shows the webview's own menu outside text fields.
    expect(app).toContain('window.addEventListener("contextmenu", onMenu)');
    // Commands that build windows must be async; a sync one deadlocks every later command on Windows.
    expect(rust).toContain("async fn open_aux_window(");
    expect(rust).toContain("async fn show_reminder_window(");
    expect(app).toContain("setWindowTitle(title)");
    const png = readFileSync(resolve("src-tauri/icons/tray/settings-64.png"));
    expect(png.readUInt32BE(16)).toBe(64);
  });

  it("opens the program information as a settings tab from the tray", async () => {
    const rust = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    const capabilities = readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8");
    expect(rust).toContain('app.emit_to("main", "tray-about", ())');
    expect(rust).not.toContain('open_aux(app, "about")');
    expect(capabilities).not.toContain('"about"');

    asDesktop();
    mocks.listen.mockClear();
    let opened = 0;
    await desktop.onTrayAbout(() => (opened += 1));
    expect(mocks.listen).toHaveBeenCalledWith("tray-about", expect.any(Function));
    mocks.listen.mock.calls[0][1]({ payload: "" });
    expect(opened).toBe(1);
  });

  it("opens the holiday source through the desktop allowlist", async () => {
    asDesktop();
    mocks.invoke.mockClear();
    await desktop.openHolidaySource();
    expect(mocks.invoke).toHaveBeenCalledWith("open_external", { url: "https://date.nager.at" });
  });

  it("asks for the language on the web only, and follows the system on a desktop run with no installer choice", async () => {
    const { useSettings } = await import("../src/ui/useSettings");
    const { render } = await import("./render");
    const seen: (string | null)[] = [];
    const Probe = () => {
      const model = useSettings();
      if (model.ready) seen.push(model.settings.language);
      return null;
    };

    const web = await render(createElement(Probe));
    await web.settle();
    expect(seen.at(-1)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await web.unmount();

    asDesktop();
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(null);
    const app = await render(createElement(Probe));
    await app.settle();
    expect(seen.at(-1)).toBe(systemLanguage());
    expect(localStorage.getItem(STORAGE_KEY)).toContain(`"language":"${systemLanguage()}"`);
    await app.unmount();
  });

  it("ships a frameless transparent tray window that hides instead of quitting", () => {
    const config = readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8");
    const rust = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    const cargo = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8");
    const capabilities = readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8");
    expect(config).toContain('"transparent": true');
    expect(config).toContain('"decorations": false');
    expect(config).toContain('"skipTaskbar": true');
    expect(rust).toContain("WindowEvent::CloseRequested");
    expect(rust).toContain("api.prevent_close()");
    expect(rust).toContain("window.hide()");
    expect(rust).toContain("tauri_plugin_autostart");
    expect(rust).toContain("tauri_plugin_single_instance");
    expect(rust).toContain('tray_by_id("main-tray")');
    expect(cargo).toContain("tray-icon");
    expect(capabilities).toContain("autostart:allow-enable");
    expect(capabilities).toContain("core:window:allow-start-dragging");
  });

  it("shows an icon on every tray menu item", () => {
    const rust = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");
    const cargo = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8");
    expect(rust).toContain("IconMenuItem::with_id");
    expect(rust).not.toMatch(/\bMenuItem::with_id/);
    expect(cargo).toContain("image-png");
    for (const name of ["show", "events", "settings", "about", "quit", "flag-uk", "flag-kr"]) {
      expect(rust).toContain(`tray_icon_bytes!("${name}")`);
      for (const size of [16, 32]) {
        const png = readFileSync(resolve(`src-tauri/icons/tray/${name}-${size}.png`));
        expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
        expect(png.readUInt32BE(16)).toBe(size);
        expect(png.readUInt32BE(20)).toBe(size);
      }
    }
  });
});
