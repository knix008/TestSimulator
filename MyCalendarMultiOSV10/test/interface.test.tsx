import { act, useState } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKGROUND_IMAGE_KEY, isBackgroundImage, writeBackgroundImage } from "../src/domain/backgroundImage";
import { addMonths, monthTitle } from "../src/domain/calendar";
import { EVENT_EDIT_KEY, parseEventEditRequest, requestEventEdit } from "../src/domain/eventEdit";
import { blankEvent } from "../src/domain/events";
import { formatISODate } from "../src/domain/calendar";
import { parseEventsDay, readEventsDay, requestEventsDay } from "../src/domain/eventsDay";
import { formatMessage, messages } from "../src/domain/i18n";
import { DEFAULT_SETTINGS, FULLSCREEN_KEY, MIN_EVENTS_HEIGHT, normalizeSettings, type Settings } from "../src/domain/settings";
import { APP_VERSION } from "../src/version";
import { App } from "../src/ui/App";
import { CalendarScreen } from "../src/ui/CalendarScreen";
import { Dropdown } from "../src/ui/Dropdown";
import { formatEventDate } from "../src/ui/EventEditor";
import { EventEditorWindow } from "../src/ui/EventEditorWindow";
import { EventsScreen } from "../src/ui/EventsScreen";
import { PrintScreen } from "../src/ui/PrintScreen";
import { LanguageGate } from "../src/ui/LanguageGate";
import { ReminderPopup } from "../src/ui/ReminderPopup";
import { SettingsScreen } from "../src/ui/SettingsScreen";
import type { SettingsTab } from "../src/ui/settingsTab";
import type { ReadyContext } from "../src/ui/useSettings";
import { click, render, setControlValue } from "./render";

function CalendarHarness({
  language = "ko" as const,
  onOpenSettings = () => {},
  onOpenEvents = () => {},
  onOpenPrint = () => {},
  initial = {},
}: {
  language?: "ko" | "en";
  onOpenSettings?: (tab?: SettingsTab) => void;
  onOpenEvents?: (day?: string) => void;
  onOpenPrint?: (year: number, month: number) => void;
  initial?: Partial<Settings>;
}) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, ...initial, language });
  const update = (patch: Partial<Settings>) => {
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  };
  const active = settings.language === "en" ? "en" : "ko";
  const ctx: ReadyContext = {
    settings: { ...settings, language: active },
    update,
    desktopError: null,
    t: messages[active],
  };
  return <CalendarScreen ctx={ctx} onOpenSettings={onOpenSettings} onOpenEvents={onOpenEvents} onOpenPrint={onOpenPrint} />;
}

function SettingsHarness() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, language: "ko" });
  const update = (patch: Partial<Settings>) => {
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  };
  const active = settings.language === "en" ? "en" : "ko";
  const ctx: ReadyContext = {
    settings: { ...settings, language: active },
    update,
    desktopError: null,
    t: messages[active],
  };
  return <SettingsScreen ctx={ctx} onClose={() => {}} />;
}

function EventsHarness() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, language: "ko" });
  const ctx: ReadyContext = {
    settings: { ...settings, language: "ko" },
    update: (patch) => setSettings((current) => normalizeSettings({ ...current, ...patch })),
    desktopError: null,
    t: messages.ko,
  };
  return <EventsScreen ctx={ctx} onClose={() => {}} />;
}

function PrintHarness() {
  const ctx: ReadyContext = {
    settings: { ...DEFAULT_SETTINGS, language: "ko" },
    update: () => {},
    desktopError: null,
    t: messages.ko,
  };
  return <PrintScreen ctx={ctx} onClose={() => {}} />;
}

describe("Interface", () => {
  it("keeps the toolbar on one aligned row without a transparency slider", async () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.toolbar\s*\{[^}]*flex-direction:\s*row;/s);
    expect(css).toMatch(/\.toolbar\s*\{[^}]*flex-wrap:\s*nowrap;/s);
    expect(css).toMatch(/\.toolbar\s*\{[^}]*align-items:\s*center;/s);
    expect(css).toContain(".chrome-close { margin-left: auto; }");
    expect(css).toMatch(/\.screen-body\s*\{[^}]*overflow:\s*visible;/s);
    expect(css).toContain("* { scrollbar-width: none; }");

    const view = await render(<CalendarHarness />);
    const toolbar = view.host.querySelector(".toolbar");
    expect(toolbar).not.toBeNull();
    expect(toolbar?.children).toHaveLength(2);
    expect(toolbar?.querySelector("h1")?.textContent).toBe(monthTitle(new Date().getFullYear(), new Date().getMonth(), "ko", messages.ko.months));
    expect(view.host.querySelector('input[type="range"]')).toBeNull();
    expect(toolbar?.textContent).not.toContain("투명도");
    expect(toolbar?.lastElementChild?.classList.contains("toolbar-end")).toBe(true);
    expect(css).toMatch(/\.toolbar-end\s*\{[^}]*margin-left:\s*auto;/s);
    await view.unmount();
  });

  it("moves the month, selects a day, and jumps back to today", async () => {
    const view = await render(<CalendarHarness />);
    const today = new Date();
    const heading = () => view.host.querySelector(".toolbar h1")?.textContent;
    const button = (label: string) => [...view.host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent === label);
    click(button(messages.ko.nextMonth)!);
    expect(heading()).toBe(monthTitle(addMonths(today, 1).getFullYear(), addMonths(today, 1).getMonth(), "ko", messages.ko.months));
    const todayButton = button(messages.ko.today)!;
    // An icon button: no text label, the name is spoken and shown as a tooltip.
    expect(todayButton.textContent).toBe("");
    expect(todayButton.getAttribute("title")).toBe(messages.ko.today);
    expect(todayButton.querySelector("svg")).not.toBeNull();
    click(todayButton);
    expect(heading()).toBe(monthTitle(today.getFullYear(), today.getMonth(), "ko", messages.ko.months));
    const selected = view.host.querySelector(".day.selected");
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
    expect(selected?.textContent).toContain(String(today.getDate()));
    await view.unmount();
  });

  it("keeps the month and every date in place when a day is clicked", async () => {
    const view = await render(<CalendarHarness />);
    await view.settle();
    const heading = () => view.host.querySelector(".toolbar h1")?.textContent;
    const layout = () => [...view.host.querySelectorAll(".day")].map((day) => `${day.className.includes("out")}:${day.textContent}`).join("|");
    const button = (label: string) => [...view.host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label);
    const month = heading();
    const before = layout();
    const days = () => [...view.host.querySelectorAll<HTMLButtonElement>(".day")];
    const leading = days().find((day, index) => index < 7 && day.classList.contains("out"));
    const trailing = days().reverse().find((day) => day.classList.contains("out"));
    const inside = days().find((day) => !day.classList.contains("out"));
    for (const target of [leading, inside, trailing].filter((day): day is HTMLButtonElement => Boolean(day))) {
      const label = target.getAttribute("aria-label");
      click(target);
      expect(heading()).toBe(month);
      expect(layout()).toBe(before);
      expect(view.host.querySelector(".day.selected")?.getAttribute("aria-label")).toBe(label);
      expect(view.host.querySelector(".selected-date")?.textContent?.startsWith(label?.split(",")[0] ?? "-")).toBe(true);
    }
    const today = new Date();
    const following = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1);
    click(button(messages.ko.nextMonth)!);
    expect(heading()).toBe(monthTitle(following.getFullYear(), following.getMonth(), "ko", messages.ko.months));
    await view.unmount();
  });

  it("changes transparency from the appearance settings", async () => {
    const view = await render(<SettingsHarness />);
    expect(view.host.querySelector("#transparency")).toBeNull();
    click([...view.host.querySelectorAll('[role="tab"]')][1]!);
    const slider = view.host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(view.host.querySelector('label[for="transparency"]')?.textContent).toBe(messages.ko.transparency);
    expect(view.host.querySelector('label[for="transparency"] > svg.icon')).not.toBeNull();
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("100");
    expect(slider.value).toBe("22");
    setControlValue(slider, "75");
    expect(view.host.querySelector(".opacity strong")?.textContent).toBe("75%");
    setControlValue(slider, "100");
    expect(view.host.querySelector(".opacity strong")?.textContent).toBe("100%");
    expect((view.host.querySelector('input[type="range"]') as HTMLInputElement).value).toBe("100");
    setControlValue(slider, "0");
    expect(view.host.querySelector(".opacity strong")?.textContent).toBe("0%");

    // The buttons move in steps of 5 and snap a dragged value onto them.
    const down = view.host.querySelector(`button[aria-label="${formatMessage(messages.ko.decrease, { name: messages.ko.transparency })}"]`) as HTMLButtonElement;
    const up = view.host.querySelector(`button[aria-label="${formatMessage(messages.ko.increase, { name: messages.ko.transparency })}"]`) as HTMLButtonElement;
    expect(down.disabled).toBe(true);
    click(up);
    expect(slider.value).toBe("5");
    setControlValue(slider, "22");
    click(up);
    expect(slider.value).toBe("25");
    setControlValue(slider, "22");
    click(down);
    expect(slider.value).toBe("20");
    await view.unmount();
  });

  it("moves the calendar when the month title is dragged", async () => {
    const view = await render(<CalendarHarness />);
    const title = view.host.querySelector(".toolbar h1")!;
    await act(async () => {
      title.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 20, clientY: 16, button: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 50, clientY: 36, button: 0 }));
    });
    expect(view.host.querySelector(".calendar")?.getAttribute("style")).toContain("translate(30px, 20px)");
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    });
    await view.unmount();
  });

  it("drags from anywhere on the panel while a short press still selects a date", async () => {
    const view = await render(<CalendarHarness />);
    const style = () => view.host.querySelector(".calendar")?.getAttribute("style") ?? "";
    const press = async (target: Element, from: [number, number], to: [number, number], click: boolean) => {
      await act(async () => {
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: from[0], clientY: from[1], button: 0 }));
        window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], button: 0 }));
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
        if (click) (target as HTMLElement).click();
      });
    };

    await press(view.host.querySelector(".weekdays")!, [10, 10], [30, 25], false);
    expect(style()).toContain("translate(20px, 15px)");

    const selectedLabel = () => view.host.querySelector(".day.selected")?.getAttribute("aria-label");
    const before = selectedLabel();
    const days = Array.from(view.host.querySelectorAll<HTMLButtonElement>(".day:not(.out)"));
    const other = days.find((day) => day.getAttribute("aria-label") !== before)!;
    await press(other, [100, 100], [140, 110], true);
    expect(style()).toContain("translate(60px, 25px)");
    expect(selectedLabel()).toBe(before);

    await press(other, [100, 100], [102, 101], true);
    expect(style()).toContain("translate(60px, 25px)");
    expect(selectedLabel()).toBe(other.getAttribute("aria-label"));
    await view.unmount();
  });

  it("moves the selected day with the keyboard", async () => {
    const view = await render(<CalendarHarness />);
    const section = view.host.querySelector(".calendar")!;
    const before = view.host.querySelector(".day.selected")?.getAttribute("aria-label");
    await act(async () => {
      section.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });
    expect(view.host.querySelector(".day.selected")?.getAttribute("aria-label")).not.toBe(before);
    await act(async () => {
      section.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "t" }));
    });
    expect(view.host.querySelector(".day.selected")?.textContent).toContain(String(new Date().getDate()));
    await view.unmount();
  });

  it("shows live public holidays for the selected country and hides observances", async () => {
    const view = await render(<CalendarHarness />);
    await view.settle();
    const text = view.host.textContent ?? "";
    expect(text).toContain("개천절");
    expect(text).toContain("한글날");
    expect(text).not.toContain("기념일");
    expect(text).toContain("대한민국");
    expect(text).toContain(messages.ko.holidayLive);
    const holiday = view.host.querySelector(`[aria-label*="개천절"]`);
    expect(holiday?.className).toContain("holiday");
    await view.unmount();
  });

  it("switches the calendar between Korean and English", async () => {
    const view = await render(<CalendarHarness language="en" />);
    await view.settle();
    const toolbar = view.host.querySelector(".toolbar");
    expect(toolbar?.textContent).not.toContain("Transparency");
    expect(toolbar?.querySelector(".today-btn")?.getAttribute("aria-label")).toBe("Today");
    expect(toolbar?.querySelector("h1")?.textContent).toBe(
      monthTitle(new Date().getFullYear(), new Date().getMonth(), "en", messages.en.months),
    );
    expect(view.host.textContent).toContain("Foundation Day");
    expect(view.host.textContent).not.toContain("개천절");
    await view.unmount();
  });

  it("offers general, appearance, background, calendar, and holiday settings", async () => {
    const view = await render(<SettingsHarness />);
    await view.settle();
    const tabs = [...view.host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    expect(tabs).toEqual([
      messages.ko.general,
      messages.ko.appearance,
      messages.ko.calendarSection,
      messages.ko.aboutTab,
    ]);
    // Holidays and the background image sit under their own headings in the general tab.
    expect([...view.host.querySelectorAll(".screen-body h2.section-heading")].map((heading) => heading.textContent)).toEqual([
      messages.ko.holidaysSection,
      messages.ko.backgroundTab,
    ]);
    expect(view.host.querySelector("#country-search")).not.toBeNull();
    expect(view.host.querySelector(".background-image-thumb")).not.toBeNull();
    expect(view.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(messages.ko.general);
    // Only the chosen tab is outlined, each icon beside its label.
    const tabCss = readFileSync(resolve("src/styles.css"), "utf8");
    expect(tabCss).toMatch(/\.tabs \{[^}]*display: flex;/);
    expect(tabCss).toMatch(/\.tabs button \{[^}]*flex: 1 1 auto;[^}]*flex-direction: row;[^}]*border: 1px solid transparent;/);
    expect(tabCss).toMatch(/\.tabs button\[aria-selected="true"\] \{[^}]*border-color: var\(--border\);/);
    expect(tabCss).toContain(".modal.settings-modal { width: min(600px, calc(100vw - 24px)); }");
    // The desktop settings window fits every tab; only a screen shorter than the window makes its content scroll.
    expect(view.host.querySelector("section.panel.screen.settings-screen > .screen-body")).not.toBeNull();
    expect(tabCss).toContain(".settings-screen > .screen-body { flex: 1 1 0; min-height: 0; overflow-y: auto; }");
    // The web dialog keeps one height whichever tab is open, like the desktop window.
    expect(tabCss).toContain(".modal.settings-modal .panel { height: min(760px, calc(100vh - 32px)); }");
    // Every setting is written at one size, a little under the rest of the app.
    expect(tabCss).toContain(
      ".settings-screen > .screen-body :not(.font-preview b, .about-name) { font-size: 12px; }",
    );
    expect(tabCss).toContain(".settings-screen .select, .settings-screen .text-input { height: 30px; padding: 0 10px; }");
    // In a short browser the tab scrolls with a visible bar, and no control is squeezed to fit.
    expect(tabCss).toContain(".settings-screen > .screen-body > * { flex-shrink: 0; }");
    // The event form uses the same text size and control heights.
    expect(tabCss).toContain(".sheet, .sheet :not(.sheet-head h2) { font-size: 12px; }");
    expect(tabCss).toContain(".sheet .select, .sheet .text-input { height: 30px; padding: 0 10px; }");
    expect(tabCss).not.toContain(".sheet .segment button { height: 32px; }");
    expect(tabCss).toMatch(/, \.settings-screen > \.screen-body \{ scrollbar-width: thin; \}/);
    expect(tabCss).toContain('.dropdown-list [role="option"] { padding: 0.45em 0.8em;');
    expect([...view.host.querySelectorAll('[role="tab"]')].every((tab) => tab.querySelector("svg.icon"))).toBe(true);
    const languageButton = (label: string) => [...view.host.querySelectorAll(".segment button")].find((button) => button.textContent === label);
    expect(languageButton("한국어")?.querySelector("svg.flag")?.getAttribute("viewBox")).toBe("-36 -24 72 48");
    expect(languageButton("English")?.querySelector("svg.flag")?.getAttribute("viewBox")).toBe("0 0 60 30");
    // Always on top and autostart.
    expect(view.host.querySelectorAll(".check > svg.icon")).toHaveLength(2);
    expect(view.host.querySelector(".field.with-icon > svg.icon")).not.toBeNull();
    expect(view.host.querySelector("#transparency")).toBeNull();
    expect(view.host.querySelector(".chrome-icon svg")).not.toBeNull();
    expect(view.host.querySelector(".chrome-close")?.getAttribute("aria-label")).toBe(messages.ko.close);
    // Every window's close button turns red under the pointer, like the calendar's own.
    expect(view.host.querySelector(".chrome-close")?.classList.contains("close-btn")).toBe(true);
    expect(readFileSync(resolve("src/styles.css"), "utf8")).toContain(
      ".icon-btn.close-btn:hover, .icon-btn.close-btn:focus-visible { background: #e5484d; color: #fff; }",
    );
    expect(view.host.textContent).toContain(messages.ko.webBanner);
    expect((view.host.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true);

    click([...view.host.querySelectorAll('[role="tab"]')][1]!);
    // Light and dark themes are shown together, without a switch between them.
    const groups = [...view.host.querySelectorAll('.theme-group[role="group"]')];
    expect(groups.map((group) => group.querySelector(".field")?.textContent)).toEqual([messages.ko.light, messages.ko.dark]);
    expect(groups.map((group) => group.querySelectorAll(".swatch").length)).toEqual([20, 20]);
    expect([...view.host.querySelectorAll("button")].some((button) => button.textContent === messages.ko.light)).toBe(false);
    click(groups[0].querySelector(".swatch")!);
    expect(view.host.querySelector('.swatch[aria-pressed="true"] .swatch-name')?.textContent).toBe("종이");
    expect(view.host.querySelectorAll('.swatch[aria-pressed="true"]')).toHaveLength(1);
    expect(tabCss).toContain(".theme-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }");
    expect(tabCss).toMatch(/\.chip \{\s*align-self: stretch;\s*height: 24px;/);

    click([...view.host.querySelectorAll('[role="tab"]')][2]!);
    const weekdayButtons = [...view.host.querySelectorAll<HTMLButtonElement>(".weekday-segment button")];
    expect(weekdayButtons.map((button) => button.textContent)).toEqual(messages.ko.weekdaysShort);
    expect(view.host.querySelector('.weekday-segment [aria-pressed="true"]')?.getAttribute("aria-label")).toBe(messages.ko.sunday);
    click(weekdayButtons[1]);
    expect(view.host.querySelector('.weekday-segment [aria-pressed="true"]')?.getAttribute("aria-label")).toBe(messages.ko.monday);
    click(view.host.querySelector('.weekday-segment [aria-label="토요일"]')!);
    expect(view.host.querySelector('.weekday-segment [aria-pressed="true"]')?.textContent).toBe("토");
    const lunar = view.host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(lunar.checked).toBe(true);
    expect(lunar.closest("label")?.textContent).toBe(messages.ko.showLunar);
    click(lunar);
    expect((view.host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(view.host.textContent).toContain(messages.ko.lunarHint);

    click([...view.host.querySelectorAll('[role="tab"]')][0]!);
    expect(view.host.querySelector(".weekday-segment")).toBeNull();
    const search = view.host.querySelector("#country-search") as HTMLInputElement;
    setControlValue(search, "일본");
    expect(view.host.querySelector("select")).toBeNull();
    const combo = view.host.querySelector('[role="combobox"]') as HTMLButtonElement;
    expect(combo.getAttribute("aria-label")).toBe(messages.ko.country);
    click(combo);
    const options = [...document.body.querySelectorAll('[role="listbox"] [role="option"]')];
    expect(options.some((option) => option.textContent === "일본 (JP)")).toBe(true);
    click(options.find((option) => option.textContent === "일본 (JP)")!);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(combo.textContent).toBe("일본 (JP)");
    await view.unmount();
  });

  it("shows the program information as the last settings tab, without a calendar button", async () => {
    const calendar = await render(<CalendarHarness />);
    expect(calendar.host.querySelector(`[aria-label="${messages.ko.about}"]`)).toBeNull();
    await calendar.unmount();

    const view = await render(<SettingsHarness />);
    const tabs = [...view.host.querySelectorAll('[role="tab"]')];
    expect(tabs).toHaveLength(4);
    expect(tabs[3]?.textContent).toBe(messages.ko.aboutTab);
    expect(tabs[3]?.querySelector("svg circle")).not.toBeNull();
    expect(view.host.querySelector(".about-info")).toBeNull();
    click(tabs[3]!);
    expect(tabs[3]?.getAttribute("aria-selected")).toBe("true");
    expect(view.host.textContent).toContain(APP_VERSION);
    expect(view.host.textContent).toContain("Web, Linux, macOS, Windows");
    expect(view.host.textContent).toContain("date.nager.at");
    // The app icon sits beside the name and description, and every item below is a label/value row.
    const head = view.host.querySelector(".about-head");
    expect(head?.querySelector("img.about-icon")?.getAttribute("src")).toBe("/favicon.png");
    expect(head?.querySelector(".about-name")?.textContent).toBe(messages.ko.appName);
    expect(head?.textContent).toContain(messages.ko.aboutBody);
    const labels = [...view.host.querySelectorAll(".about-grid > dt")].map((dt) => dt.textContent);
    expect(labels).toEqual([messages.ko.version, messages.ko.featuresTitle, messages.ko.aboutPlatformsLabel, messages.ko.language, messages.ko.holidaysSection]);
    expect(view.host.querySelectorAll(".about-grid > dd")).toHaveLength(labels.length);
    await view.unmount();
  });

  it("asks for Korean or English before the first calendar is shown", async () => {
    let selected = "";
    const gate = await render(<LanguageGate onSelect={(language) => { selected = language; }} />);
    expect(gate.host.textContent).toContain("한국어");
    expect(gate.host.textContent).toContain("English");
    click([...gate.host.querySelectorAll("button")].find((button) => button.textContent === "English")!);
    expect(selected).toBe("en");
    await gate.unmount();

    const app = await render(<App />);
    await app.settle();
    expect(document.body.textContent).toContain("Choose your installation language");
    click([...document.body.querySelectorAll("button")].find((button) => button.textContent === "한국어")!);
    await app.settle();
    expect(document.body.querySelector(`[aria-label="${messages.ko.today}"]`)).not.toBeNull();
    expect(document.documentElement.lang).toBe("ko");
    click(document.body.querySelector(`[aria-label="${messages.ko.settings}"]`)!);
    expect(document.body.textContent).toContain(messages.ko.general);
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    await app.settle();
    expect(document.body.querySelector(".screen")).toBeNull();
    await app.unmount();
  });

  it("shows minimize, maximize, and close controls only in the desktop app", async () => {
    const web = await render(<CalendarHarness />);
    expect(web.host.querySelector(".window-controls")).toBeNull();
    expect(web.host.querySelectorAll(".resize")).toHaveLength(0);
    await web.unmount();

    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const desktop = await render(<CalendarHarness />);
    const controls = [...desktop.host.querySelectorAll(".window-controls button")].map((button) => button.getAttribute("aria-label"));
    expect(controls).toEqual([messages.ko.minimize, messages.ko.maximize, messages.ko.close]);
    expect(desktop.host.querySelector(".toolbar")?.children).toHaveLength(3);
    expect(desktop.host.querySelectorAll(".resize")).toHaveLength(1);
    expect(desktop.host.querySelector(".resize-grip")).not.toBeNull();
    await desktop.unmount();
  });

  it("leaves the maximized desktop window with Escape", async () => {
    let maximized = true;
    const calls: string[] = [];
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string) => {
          calls.push(command);
          if (command === "plugin:window|is_maximized") return maximized;
          if (command === "toggle_maximize_main") {
            maximized = !maximized;
            return maximized;
          }
          return null;
        },
      },
    });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
      configurable: true,
      value: { unregisterListener: () => {} },
    });
    const fullscreenFont = { dateFontScale: 1.6, dateFontFamily: "serif", dateFontWeight: "heavy", dateFontItalic: false } as const;
    const view = await render(<CalendarHarness initial={{ dateFontScale: 1.2, fullscreenDateFont: fullscreenFont }} />);
    await view.settle();
    const days = () => view.host.querySelector(".days") as HTMLElement;
    expect(view.host.querySelector(".calendar")?.classList.contains("maximized")).toBe(true);
    // Full screen keeps a date font of its own, and tells the settings window which one is on screen.
    expect(days().style.getPropertyValue("--date-font-scale")).toBe("1.6");
    expect(days().style.getPropertyValue("--date-weight")).toBe("850");
    expect(localStorage.getItem(FULLSCREEN_KEY)).toBe("1");
    // The full screen button gives its focus back to the calendar, so no focus ring stays on it afterwards.
    const restore = view.host.querySelector(`.window-controls button[aria-label="${messages.ko.restore}"]`) as HTMLButtonElement;
    restore.focus();
    const escape = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" });
    await act(async () => {
      document.body.dispatchEvent(escape);
    });
    await view.settle();
    expect(escape.defaultPrevented).toBe(true);
    expect(calls).toContain("toggle_maximize_main");
    expect(view.host.querySelector(".calendar")?.classList.contains("maximized")).toBe(false);
    expect(days().style.getPropertyValue("--date-font-scale")).toBe("1.2");
    expect(days().style.getPropertyValue("--date-weight")).toBe("680");
    expect(localStorage.getItem(FULLSCREEN_KEY)).toBe("0");
    expect(document.activeElement).toBe(view.host.querySelector(".panel.calendar"));
    const toggles = calls.filter((command) => command === "toggle_maximize_main").length;
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(calls.filter((command) => command === "toggle_maximize_main")).toHaveLength(toggles);
    await view.unmount();
    delete (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  it("collapses and expands the holiday list under the calendar", async () => {
    const view = await render(<CalendarHarness />);
    await view.settle();
    const toggle = () => view.host.querySelector(".footer-toggle") as HTMLButtonElement;
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toContain('.footer-toggle[aria-expanded="false"] .icon { transform: rotate(180deg); }');
    expect(toggle().getAttribute("aria-label")).toBe(messages.ko.collapseEvents);
    expect(view.host.querySelector("#calendar-events")?.textContent).toContain("개천절");

    click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-label")).toBe(messages.ko.expandEvents);
    expect(view.host.querySelector("#calendar-events")).toBeNull();
    expect(view.host.querySelector(".footer")?.className).toContain("collapsed");
    expect(view.host.querySelector(".status-row")?.textContent).toContain("대한민국");

    click(toggle());
    expect(view.host.querySelector("#calendar-events")?.textContent).toContain("한글날");
    await view.unmount();
  });

  it("keeps the calendar grid height when the holiday list opens, closes, or changes", async () => {
    const view = await render(<CalendarHarness />);
    await view.settle();
    const grid = () => (view.host.querySelector(".days") as HTMLElement).style.height;
    expect(grid()).toBe("");
    expect((view.host.querySelector(".calendar") as HTMLElement).style.height).toBe("");
    click(view.host.querySelector(".footer-toggle")!);
    expect(grid()).toBe("");
    click(view.host.querySelector(".footer-toggle")!);
    expect(grid()).toBe("");
    click([...view.host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === messages.ko.nextMonth)!);
    await view.settle();
    expect(grid()).toBe("");
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.days \{\s*flex: 0 1 auto;\s*aspect-ratio: 7 \/ 5;/);
    expect(css).toMatch(/\.app-frame > \.panel\.calendar,[^{]*\{\s*height: auto;/);
    expect(css).not.toContain("max-height: 108px");
    await view.unmount();
  });

  it("keeps calendar rows, columns, and the month title the same size in every month", async () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.days \{[^}]*grid-template-rows: repeat\(5, minmax\(0, 1fr\)\);[^}]*gap: 2px;/s);
    expect(css).toMatch(/\.mark \{[^}]*position: absolute;/s);
    expect(css).toContain(".month-title > * { grid-area: 1 / 1; }");
    expect(css).toContain(".month-title-sizer { visibility: hidden; }");

    const view = await render(<CalendarHarness />);
    // Every month's title is laid out in the same cell, so the widest one sets the width all year.
    const sizers = [...view.host.querySelectorAll(".month-title-sizer")].map((node) => node.textContent);
    expect(sizers).toEqual(messages.ko.months.map((_, month) => monthTitle(new Date().getFullYear(), month, "ko", messages.ko.months)));
    expect(view.host.querySelector(".month-title-sizer")?.getAttribute("aria-hidden")).toBe("true");
    await view.settle();
    const next = [...view.host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === messages.ko.nextMonth)!;
    for (let month = 0; month < 12; month += 1) {
      expect(view.host.querySelector(".days")?.children).toHaveLength(35);
      for (const pair of view.host.querySelectorAll(".day-pair")) {
        expect(pair.querySelectorAll(".day")).toHaveLength(2);
        expect(pair.getAttribute("role")).toBe("gridcell");
      }
      click(next);
      await view.settle();
    }
    await view.unmount();
  });

  it("starts the week on any chosen day", async () => {
    const view = await render(<CalendarHarness initial={{ weekStartsOn: 6 }} />);
    await view.settle();
    const header = [...view.host.querySelectorAll(".weekdays span")].map((item) => item.textContent);
    expect(header).toEqual(["토", "일", "월", "화", "수", "목", "금"]);
    expect(view.host.querySelector(".weekdays span")?.className).toBe("saturday");
    const first = view.host.querySelector(".days .day") as HTMLElement;
    expect(first.getAttribute("aria-label")).toContain("토요일");
    await view.unmount();
  });

  it("shows small lunar dates on month starts and the solar terms", async () => {
    const view = await render(<CalendarHarness />);
    await view.settle();
    const firstOfMonth = [...view.host.querySelectorAll(".day:not(.out)")][0] as HTMLElement;
    expect(firstOfMonth.querySelector(".num")?.textContent).toBe("1");
    expect(firstOfMonth.querySelector(".sub")?.textContent).toMatch(/^(음|윤) \d+\.\d+/);
    const subs = [...view.host.querySelectorAll(".day .sub")];
    const terms = subs.filter((sub) => sub.classList.contains("term")).map((sub) => sub.textContent);
    expect(terms.length).toBeGreaterThanOrEqual(1);
    for (const term of terms) expect(messages.ko.solarTerms.some((name) => term?.includes(name))).toBe(true);
    const lunarDays = subs.filter((sub) => !sub.classList.contains("term")).length;
    expect(lunarDays).toBeLessThanOrEqual(4);
    expect(view.host.querySelectorAll(".day:not(.out)").length - subs.length).toBeGreaterThan(20);
    expect(view.host.querySelector(".selected-lunar")?.textContent).toMatch(/^음력 (윤)?\d+월 \d+일/);
    await view.unmount();

    const plain = await render(<CalendarHarness initial={{ showLunar: false }} />);
    await plain.settle();
    expect(plain.host.querySelectorAll(".day .sub")).toHaveLength(0);
    expect(plain.host.querySelector(".selected-lunar")).toBeNull();
    await plain.unmount();
  });

  it("scrolls only inside the events area and never the calendar page", () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/html\[data-platform="desktop"\],\s*html\[data-platform="desktop"\] body \{ overflow: hidden; \}/);
    expect(css).toContain('html[data-platform="desktop"] .app-frame > .panel.calendar { height: 100%; }');
    expect(css).toContain('html[data-platform="desktop"] .panel.calendar .events { flex: 1 1 auto; min-height: 48px; }');
    expect(css).toMatch(/\.toolbar \{\s*flex: none;/);
    expect(css).toContain(".footer > * { flex: none; }");
    expect(css).toContain('html[data-platform="web"] .app-frame > .panel.calendar { max-height: calc(100vh - 24px); }');
    expect(css).toMatch(/\.events \.holiday-list \{[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.day-items \{[^}]*overflow-y: auto;/s);
  });

  it("draws dropdowns in the theme's colours instead of the OS list", async () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.dropdown \{[^}]*color: var\(--text\);/);
    expect(css).toMatch(/\.dropdown-list \{[^}]*background: var\(--bg-solid, #14181f\);[^}]*color: var\(--text\);/);
    for (const file of ["SettingsScreen", "EventEditor", "EventManager"]) {
      expect(readFileSync(resolve(`src/ui/${file}.tsx`), "utf8")).not.toContain("<select");
    }

    let value = "b";
    let outerKeys = 0;
    const options = [
      { value: "a", label: "Apple" },
      { value: "b", label: "Banana" },
      { value: "c", label: "Cherry" },
    ];
    function Harness() {
      const [current, setCurrent] = useState(value);
      return (
        <div onKeyDown={() => (outerKeys += 1)}>
          <Dropdown value={current} options={options} ariaLabel="Fruit" onChange={(next) => { value = next; setCurrent(next); }} />
        </div>
      );
    }
    const view = await render(<Harness />);
    const combo = view.host.querySelector('[role="combobox"]') as HTMLButtonElement;
    const key = (name: string) =>
      act(() => {
        combo.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
      });
    const list = () => document.body.querySelector('[role="listbox"]');
    expect(combo.getAttribute("aria-expanded")).toBe("false");
    key("ArrowDown");
    expect(list()).not.toBeNull();
    expect(list()?.querySelector('[aria-selected="true"]')?.textContent).toBe("Banana");
    key("ArrowDown");
    expect(combo.getAttribute("aria-activedescendant")).toBe(list()?.querySelector(".active")?.id);
    key("Enter");
    expect(list()).toBeNull();
    expect(value).toBe("c");
    key("Enter");
    key("Escape");
    expect(list()).toBeNull();
    expect(value).toBe("c");
    expect(outerKeys).toBe(0);
    key("a");
    expect(value).toBe("a");
    click(combo);
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(list()).toBeNull();
    await view.unmount();
  });

  it("shows a vertical scrollbar only in the events lists and a settings tab too tall for its screen", () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toContain("* { scrollbar-width: none; }");
    expect(css).toContain("*::-webkit-scrollbar { display: none; }");
    expect(css).toContain(".events .holiday-list, .events .day-items, .settings-screen > .screen-body { scrollbar-width: thin; }");
    expect(css.match(/scrollbar-width: (thin|auto)/g)).toHaveLength(1);
  });

  it("scales the day numbers with the calendar width", () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.days \{[^}]*container-type: inline-size;/);
    expect(css).toMatch(/\.days > \* \{[^}]*font-size: clamp\(7px, round\(calc\(2\.78cqw \* var\(--date-font-scale, 1\)\), 1px\), 80px\);/);
    expect(css).toMatch(/\.num \{ font-size: 1em;/);
    expect(css).toMatch(/\.mark \{[^}]*top: calc\(50% \+ 0\.79em\);[^}]*width: 0\.36em;/);
    expect(css).toMatch(/\.sub \{[^}]*font-size: calc\(0\.72em \/ var\(--date-font-scale, 1\)\);/);
    expect(css).not.toMatch(/\.(num|mark|sub) \{[^}]*\b(1[0-9]|[5-9])px/);
  });

  it("gives every holiday line the same fixed line height", () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.events \{[^}]*--event-line: 24px;[^}]*gap: 0;/);
    expect(css).toMatch(/\.events > p,\s*\.events \.holiday-list button \{[^}]*height: var\(--event-line\);[^}]*line-height: var\(--event-line\);[^}]*white-space: nowrap;/s);
  });

  it("keeps the holiday area the same height in every month", async () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.events \{[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.events \.holiday-list \{[^}]*overflow-y: auto;/);

    const view = await render(<CalendarHarness />);
    await view.settle();
    const next = [...view.host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === messages.ko.nextMonth)!;
    const heights = new Set<string>();
    for (let month = 0; month < 12; month += 1) {
      heights.add((view.host.querySelector("#calendar-events") as HTMLElement).style.height);
      click(next);
      await view.settle();
    }
    expect([...heights]).toEqual([`${DEFAULT_SETTINGS.eventsHeight}px`]);
    await view.unmount();
  });

  it("resizes from the bottom-right grip without moving the dates", async () => {
    const view = await render(<CalendarHarness />);
    const panel = view.host.querySelector(".calendar") as HTMLElement;
    panel.getBoundingClientRect = () => new DOMRect(0, 0, 520, 600);
    const grip = view.host.querySelector(".resize-grip") as HTMLButtonElement;
    expect(grip.getAttribute("aria-label")).toBe(messages.ko.resizeWindow);
    expect(grip.querySelector("svg")).not.toBeNull();
    const pointer = (type: string, x: number, y: number) =>
      act(async () => {
        grip.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
      });
    const grid = () => (view.host.querySelector(".days") as HTMLElement).style.height;
    const events = () => view.host.querySelector("#calendar-events") as HTMLElement;
    events().getBoundingClientRect = () => new DOMRect(0, 0, 500, 120);
    await pointer("pointerdown", 520, 600);
    await pointer("pointermove", 580, 640);
    expect(panel.style.width).toBe("580px");
    expect(grid()).toBe("");
    expect(events().style.height).toBe("160px");
    expect(panel.style.transform).toBe("translate(30px, 0px)");
    await pointer("pointermove", 100, 0);
    expect(panel.style.width).toBe("366px");
    expect(grid()).toBe("");
    expect(events().style.height).toBe(`${MIN_EVENTS_HEIGHT}px`);
    await pointer("pointermove", 520, 700);
    await pointer("pointerup", 520, 700);
    expect(grid()).toBe("");
    expect(events().style.height).toBe("220px");
    await view.unmount();
  });

  it("deletes events straight from the calendar's list after a confirmation", async () => {
    localStorage.clear();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const base = { date: iso, interval: 1, until: "", color: "#3d7dff", skip: [], reminder: null };
    localStorage.setItem(
      "mycalendar.events.v1",
      JSON.stringify([
        { ...base, id: "gym", title: "운동", time: "07:30", repeat: "weekly" },
        { ...base, id: "call", title: "통화", time: "10:00", repeat: "none" },
      ]),
    );
    const stored = () => JSON.parse(localStorage.getItem("mycalendar.events.v1") ?? "[]") as Array<{ id: string; skip: string[] }>;
    const view = await render(<CalendarHarness />);
    await view.settle();
    const remove = (title: string) =>
      view.host.querySelector(`.day-items button[aria-label="${messages.ko.deleteEvent}: ${title}"]`) as HTMLButtonElement | null;
    const confirm = () => view.host.querySelector(".day-items .day-confirm") as HTMLElement | null;
    const confirmButton = (label: string) => [...confirm()!.querySelectorAll("button")].find((button) => button.textContent === label);
    expect(remove("운동")).not.toBeNull();
    expect(remove("통화")).not.toBeNull();

    // A repeating event asks whether to drop only this day or the whole series; Escape keeps it.
    click(remove("운동")!);
    expect(confirm()?.textContent).toContain(formatMessage(messages.ko.confirmDelete, { title: "운동" }));
    expect(confirmButton(messages.ko.deleteOccurrence)).toBeDefined();
    expect(confirmButton(messages.ko.deleteSeries)).toBeDefined();
    expect(document.activeElement?.textContent).toBe(messages.ko.cancel);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => {
      document.activeElement!.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(confirm()).toBeNull();
    expect(stored()).toHaveLength(2);
    click(remove("운동")!);
    click(confirmButton(messages.ko.deleteOccurrence)!);
    expect(remove("운동")).toBeNull();
    expect(stored().find((event) => event.id === "gym")?.skip).toEqual([iso]);

    // The Delete key on an event asks too; a one-off event is simply deleted.
    const call = view.host.querySelector(`.day-items button[aria-label="${messages.ko.editEvent}: 통화"]`) as HTMLButtonElement;
    await act(async () => {
      call.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });
    expect(confirmButton(messages.ko.deleteOccurrence)).toBeUndefined();
    click(confirmButton(messages.ko.deleteEvent)!);
    expect(stored().map((event) => event.id)).toEqual(["gym"]);
    expect(view.host.querySelector(".day-items")?.textContent).toContain(messages.ko.noEvents);
    await view.unmount();
  });

  it("adds a repeating colored event, edits one day, and lists it in the event manager", async () => {
    localStorage.clear();
    let openedEvents = 0;
    const view = await render(<CalendarHarness onOpenEvents={() => { openedEvents += 1; }} />);
    await view.settle();
    const byLabel = (label: string) => view.host.querySelector(`[aria-label="${label}"]`) as HTMLElement;
    const sheet = () => view.host.querySelector(".sheet") as HTMLFormElement | null;
    const submit = () =>
      act(() => {
        sheet()!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

    click(byLabel(messages.ko.addEvent));
    expect(sheet()?.querySelector("h2")?.textContent).toBe(messages.ko.addEvent);
    submit();
    expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(messages.ko.titleRequired);

    setControlValue(sheet()!.querySelector('input[name="title"]') as HTMLInputElement, "운동");
    setControlValue(sheet()!.querySelector('input[name="time"]') as HTMLInputElement, "07:30");
    click([...sheet()!.querySelectorAll(".segment button")].find((button) => button.textContent === messages.ko.repeatWeekly)!);
    expect(sheet()!.querySelector('input[name="interval"]')).not.toBeNull();
    expect(sheet()!.textContent).toContain("주마다");
    const custom = sheet()!.querySelector(`input[type="color"][aria-label="${messages.ko.customColor}"]`) as HTMLInputElement;
    expect(custom.closest(".custom-color")?.classList.contains("selected")).toBe(false);
    setControlValue(custom, "#abcdef");
    expect(custom.closest(".custom-color")?.classList.contains("selected")).toBe(true);
    expect((custom.closest(".custom-color")!.querySelector("i") as HTMLElement).style.background).toMatch(/#abcdef|rgb\(171, 205, 239\)/);
    expect(sheet()!.querySelector('[role="radio"][aria-checked="true"]')).toBeNull();
    click(sheet()!.querySelector(`[aria-label="${messages.ko.colorNames[5]}"]`)!);
    expect(custom.closest(".custom-color")?.classList.contains("selected")).toBe(false);
    expect(sheet()!.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")).toBe(messages.ko.colorNames[5]);
    submit();
    expect(sheet()).toBeNull();

    const dotted = [...view.host.querySelectorAll(".day:not(.out) .dots")];
    expect(dotted.length).toBeGreaterThanOrEqual(1);
    expect((dotted[0].querySelector("i:not(.holiday-dot)") as HTMLElement).style.background).toMatch(/#e5484d|rgb\(229, 72, 77\)/);
    const item = view.host.querySelector(".day-items .day-event") as HTMLElement;
    expect(item.textContent).toContain("07:30");
    expect(item.textContent).toContain("운동");
    expect(item.querySelector(".event-repeat")).not.toBeNull();
    expect(view.host.querySelector(".holiday-list")?.textContent).toContain("운동");

    click(item);
    expect(sheet()?.querySelector("h2")?.textContent).toBe(messages.ko.editEvent);
    click([...sheet()!.querySelectorAll("button")].find((button) => button.textContent === messages.ko.deleteOccurrence)!);
    expect(view.host.querySelector(".day-items .day-event")).toBeNull();
    expect(view.host.querySelector(".day-items")?.textContent).toContain(messages.ko.noEvents);
    expect(view.host.querySelectorAll(".day:not(.out) .dots").length).toBe(dotted.length - 1);

    click(byLabel(messages.ko.manageEvents));
    expect(openedEvents).toBe(1);
    await view.unmount();

    const settings = await render(<SettingsHarness />);
    expect(settings.host.querySelector(".manage-list")).toBeNull();
    await settings.unmount();

    const manager = await render(<EventsHarness />);
    expect(manager.host.querySelector(".chrome-title, h1")?.textContent).toBe(messages.ko.manageEvents);
    const rows = [...manager.host.querySelectorAll(".manage-list .manage-main")];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("운동");
    expect(rows[0].textContent).toContain(messages.ko.repeatEveryOne.weekly);

    click(manager.host.querySelector(`[aria-label="${messages.ko.editEvent}: 운동"]`)!);
    const editor = manager.host.querySelector(".sheet") as HTMLFormElement;
    setControlValue(editor.querySelector('input[name="title"]') as HTMLInputElement, "수영");
    act(() => {
      editor.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(manager.host.querySelector(".sheet")).toBeNull();
    expect(manager.host.querySelector(".manage-list")?.textContent).toContain("수영");

    click(manager.host.querySelector(`[aria-label="${messages.ko.deleteEvent}: 수영"]`)!);
    const confirm = manager.host.querySelector('.manage-confirm[role="alert"]');
    expect(confirm?.textContent).toContain("'수영' 일정을 삭제할까요?");
    click([...confirm!.querySelectorAll("button")].find((button) => button.textContent === messages.ko.cancel)!);
    expect(manager.host.querySelector(".manage-confirm")).toBeNull();
    click(manager.host.querySelector(`[aria-label="${messages.ko.deleteEvent}: 수영"]`)!);
    click([...manager.host.querySelectorAll(".manage-confirm button")].find((button) => button.textContent === messages.ko.deleteEvent)!);
    expect(manager.host.querySelector(".manage-list")).toBeNull();
    expect(manager.host.textContent).toContain(messages.ko.noEventsYet);
    await manager.unmount();
  });

  it("lists a double-clicked day's events for editing, and adds one on an empty day", async () => {
    localStorage.clear();
    const today = new Date();
    const later = new Date(today.getFullYear(), today.getMonth() + 2, 1);
    const todayIso = formatISODate(today);
    localStorage.setItem(
      "mycalendar.events.v1",
      JSON.stringify([
        { ...blankEvent(today, null), id: "a", title: "회의" },
        { ...blankEvent(later, null), id: "b", title: "여행" },
      ]),
    );
    const doubleClick = (target: Element) =>
      act(() => {
        target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });

    let opened: string | undefined | null = null;
    const view = await render(<CalendarHarness onOpenEvents={(day) => { opened = day; }} />);
    await view.settle();
    doubleClick(view.host.querySelector(".day.today")!);
    expect(opened).toBe(todayIso);
    expect(view.host.querySelector(".sheet")).toBeNull();
    // A day without events has nothing to list, so it goes straight to a new event on that day.
    opened = null;
    doubleClick(view.host.querySelector(".day:not(.out):not(.today):not(:has(.dots))")!);
    expect(opened).toBeNull();
    expect(view.host.querySelector(".sheet")).not.toBeNull();
    await view.unmount();

    requestEventsDay(todayIso);
    const manager = await render(<EventsHarness />);
    expect(manager.host.querySelector(".manage-day strong")?.textContent).toBe(formatEventDate(todayIso, "ko"));
    const titles = () => [...manager.host.querySelectorAll(".manage-list .manage-title")].map((node) => node.textContent);
    expect(titles()).toEqual(["회의"]);
    click(manager.host.querySelector(`[aria-label="${messages.ko.editEvent}: 회의"]`)!);
    expect((manager.host.querySelector('.sheet input[name="title"]') as HTMLInputElement).value).toBe("회의");
    click([...manager.host.querySelectorAll(".sheet button")].find((button) => button.textContent === messages.ko.cancel)!);
    expect(manager.host.querySelector(".sheet")).toBeNull();
    click([...manager.host.querySelectorAll(".manage-day button")].find((button) => button.textContent === messages.ko.showAllEvents)!);
    expect(manager.host.querySelector(".manage-day")).toBeNull();
    expect(titles()).toEqual(["회의", "여행"]);
    expect(readEventsDay()).toBeNull();
    await manager.unmount();

    requestEventsDay(formatISODate(new Date(later.getFullYear(), later.getMonth(), 2)));
    const empty = await render(<EventsHarness />);
    expect(empty.host.textContent).toContain(messages.ko.noEventsOnDay);
    await empty.unmount();
    expect(parseEventsDay('{"day":"2026-02-30"}')).toBeNull();
    expect(parseEventsDay("nonsense")).toBeNull();
    localStorage.clear();
  });


  it("enters an event by its lunar date and keeps the solar date in step", async () => {
    localStorage.clear();
    const view = await render(<CalendarHarness />);
    await view.settle();
    const sheet = () => view.host.querySelector(".sheet") as HTMLFormElement;
    const field = (name: string) => sheet().querySelector(`[name="${name}"]`) as HTMLInputElement;
    click(view.host.querySelector(`[aria-label="${messages.ko.addEvent}"]`)!);

    const solar = sheet().querySelector('button[name="calendar-solar"]') as HTMLButtonElement;
    const lunar = sheet().querySelector('button[name="calendar-lunar"]') as HTMLButtonElement;
    expect([solar.textContent, lunar.textContent]).toEqual([messages.ko.calendarSolar, messages.ko.calendarLunar]);
    // Solar is the default and keeps the plain date field.
    expect(solar.getAttribute("aria-pressed")).toBe("true");
    expect(lunar.getAttribute("aria-pressed")).toBe("false");
    expect(sheet().querySelector('input[name="date"]')).not.toBeNull();
    expect(sheet().querySelector('input[name="lunarYear"]')).toBeNull();

    click(lunar);
    expect(lunar.getAttribute("aria-pressed")).toBe("true");
    expect(sheet().querySelector('input[name="date"]')).toBeNull();

    setControlValue(field("lunarYear"), "2026");
    click(sheet().querySelector(".lunar-month")!);
    const options = [...document.body.querySelectorAll('[role="listbox"] [role="option"]')];
    expect(options).toHaveLength(12);
    click(options.find((option) => option.textContent === "8월")!);
    setControlValue(field("lunarDay"), "26");
    expect(sheet().querySelector('output[name="solarDate"]')?.textContent).toBe(formatEventDate("2026-10-06", "ko"));

    // An empty day has no date to save, and the editor says so instead of storing the old one.
    setControlValue(field("lunarDay"), "");
    setControlValue(field("title"), "제사");
    const submit = () =>
      act(() => {
        sheet().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    submit();
    expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(messages.ko.lunarDateInvalid);

    setControlValue(field("lunarDay"), "26");
    click([...sheet().querySelectorAll(".segment button")].find((button) => button.textContent === messages.ko.repeatYearly)!);
    submit();
    expect(view.host.querySelector(".sheet")).toBeNull();
    const stored = () => JSON.parse(localStorage.getItem("mycalendar.events.v1") ?? "[]");
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ title: "제사", date: "2026-10-06", calendar: "lunar", repeat: "yearly" });
    await view.unmount();

    const manager = await render(<EventsHarness />);
    // A lunar event is listed by the date its owner typed.
    expect(manager.host.querySelector(".manage-when")?.textContent).toContain("음력 8월 26일");
    click(manager.host.querySelector(`[aria-label="${messages.ko.editEvent}: 제사"]`)!);
    const editor = manager.host.querySelector(".sheet") as HTMLFormElement;
    const lunarField = (name: string) => editor.querySelector(`[name="${name}"]`) as HTMLInputElement;
    expect(editor.querySelector('button[name="calendar-lunar"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(lunarField("lunarYear").value).toBe("2026");
    expect(lunarField("lunarDay").value).toBe("26");
    expect(editor.querySelector(".lunar-month")?.textContent).toContain("8월");

    // The eighth month of 2026 has 30 days but 2027's has 29, so the 30th moves to the month's end.
    setControlValue(lunarField("lunarDay"), "30");
    expect(lunarField("lunarDay").value).toBe("30");
    setControlValue(lunarField("lunarYear"), "2027");
    expect(lunarField("lunarDay").value).toBe("29");
    expect(editor.querySelector('output[name="solarDate"]')?.textContent).toBe(formatEventDate("2027-09-29", "ko"));

    // Switching back to solar keeps the date the lunar fields resolved.
    click(editor.querySelector('button[name="calendar-solar"]') as HTMLButtonElement);
    expect((editor.querySelector('input[name="date"]') as HTMLInputElement).value).toBe("2027-09-29");
    act(() => {
      editor.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(JSON.parse(localStorage.getItem("mycalendar.events.v1") ?? "[]")[0]).toMatchObject({
      date: "2027-09-29",
      calendar: "solar",
    });
    expect(manager.host.querySelector(".manage-when")?.textContent).toContain(formatEventDate("2027-09-29", "ko"));
    await manager.unmount();
  });

  it("keeps the footer buttons in one right-aligned column whether the events are open or closed", async () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    // One right inset for every footer row: collapsing the events cannot shift the status row.
    expect(css).toMatch(/\.footer \{[^}]*padding: 8px 30px 12px 12px;/s);
    expect(css).toContain(".footer.collapsed { gap: 0; padding-bottom: 8px; }");
    expect(css).not.toMatch(/\.footer\.collapsed \{[^}]*padding-right/);
    expect(css).not.toMatch(/\.events \{[^}]*padding-right/);
    expect(css).toMatch(/\.footer-actions \{[^}]*margin-left: auto;/);
    expect(css).toContain(".footer-actions .icon-btn { width: 24px; height: 24px; flex: none; }");

    const view = await render(<CalendarHarness />);
    await view.settle();
    const status = () => view.host.querySelector(".status-row");
    const head = () => view.host.querySelector(".events-head");
    const labels = (row: Element | null) =>
      [...(row?.querySelectorAll(".footer-actions .icon-btn") ?? [])].map((button) => button.getAttribute("aria-label"));
    expect(labels(status())).toEqual([messages.ko.refreshHolidays, messages.ko.collapseEvents]);
    expect(labels(head())).toEqual([messages.ko.addEvent, messages.ko.manageEvents]);
    // Both rows end with the same right-aligned group, so the four buttons share one column.
    expect(status()?.lastElementChild?.className).toBe("footer-actions");
    expect(head()?.lastElementChild?.className).toBe("footer-actions");

    click(view.host.querySelector(".footer-toggle")!);
    expect(head()).toBeNull();
    expect(labels(status())).toEqual([messages.ko.refreshHolidays, messages.ko.expandEvents]);
    expect(status()?.lastElementChild?.className).toBe("footer-actions");
    await view.unmount();
  });

  it("opens a context menu with an icon on every item when a day is right-clicked", async () => {
    localStorage.clear();
    let openedEvents = 0;
    let openedSettings = 0;
    const view = await render(
      <CalendarHarness onOpenEvents={() => { openedEvents += 1; }} onOpenSettings={() => { openedSettings += 1; }} />,
    );
    await view.settle();
    const day = [...view.host.querySelectorAll<HTMLButtonElement>(".day:not(.out)")].find((cell) => cell.textContent?.startsWith("15"))!;
    const rightClick = () =>
      act(() => {
        day.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
      });
    rightClick();
    const menu = () => document.querySelector('.day-menu[role="menu"]');
    expect(menu()?.parentElement).toBe(document.body);
    expect(view.host.querySelector(".day-menu")).toBeNull();
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.day-menu\s*\{[^}]*position:\s*fixed;/s);
    expect(css).toMatch(/\.day-menu\s*\{[^}]*max-width:\s*280px;/s);
    expect(day.getAttribute("aria-pressed")).toBe("true");
    const items = [...menu()!.querySelectorAll('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      messages.ko.addEventOn,
      messages.ko.goToday,
      messages.ko.manageEvents,
      messages.ko.print,
      messages.ko.settings,
    ]);
    expect(items.every((item) => item.querySelector(".day-menu-icon svg.icon"))).toBe(true);

    act(() => {
      menu()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(menu()).toBeNull();

    rightClick();
    click(menu()!.querySelector('[role="menuitem"]')!);
    expect(menu()).toBeNull();
    const editor = view.host.querySelector(".sheet") as HTMLFormElement;
    expect(editor.querySelector("h2")?.textContent).toBe(messages.ko.addEvent);
    setControlValue(editor.querySelector('input[name="title"]') as HTMLInputElement, "치과");
    act(() => {
      editor.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    rightClick();
    const edit = [...menu()!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === `${messages.ko.editEvent}: 치과`);
    expect(edit?.querySelector(".day-menu-icon svg.icon")).not.toBeNull();
    expect(menu()!.querySelectorAll('[role="separator"]')).toHaveLength(2);
    click(edit!);
    expect(view.host.querySelector(".sheet h2")?.textContent).toBe(messages.ko.editEvent);
    act(() => {
      view.host.querySelector(".sheet")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    rightClick();
    click([...menu()!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === messages.ko.manageEvents)!);
    rightClick();
    click([...menu()!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === messages.ko.settings)!);
    expect(openedEvents).toBe(1);
    expect(openedSettings).toBe(1);
    await view.unmount();
  });

  it("opens the calendar menu with icons from the title bar and prints the month on view", async () => {
    localStorage.clear();
    let printed: [number, number] | null = null;
    let openedEvents = 0;
    const view = await render(
      <CalendarHarness onOpenPrint={(year, month) => { printed = [year, month]; }} onOpenEvents={() => { openedEvents += 1; }} />,
    );
    await view.settle();
    const menu = () => document.querySelector('.day-menu[role="menu"]');
    const openMenu = (target: Element) =>
      act(() => {
        target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 20 }));
      });
    openMenu(view.host.querySelector(".toolbar h1")!);
    expect(menu()?.getAttribute("aria-label")).toBe(messages.ko.windowMenu);
    const items = [...menu()!.querySelectorAll('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      messages.ko.prevMonth,
      messages.ko.nextMonth,
      messages.ko.goToday,
      messages.ko.addEvent,
      messages.ko.manageEvents,
      messages.ko.print,
      messages.ko.settings,
    ]);
    expect(items.every((item) => item.querySelector(".day-menu-icon svg.icon"))).toBe(true);

    click(items[1]);
    const next = addMonths(new Date(), 1);
    expect(view.host.querySelector(".toolbar h1")?.textContent).toBe(monthTitle(next.getFullYear(), next.getMonth(), "ko", messages.ko.months));
    openMenu(view.host.querySelector(".status-row")!);
    click([...menu()!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === messages.ko.print)!);
    expect(printed).toEqual([next.getFullYear(), next.getMonth()]);
    openMenu(view.host.querySelector(".toolbar")!);
    click([...menu()!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === messages.ko.manageEvents)!);
    expect(openedEvents).toBe(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(printed).toEqual([next.getFullYear(), next.getMonth()]);
    await view.unmount();
  });

  it("previews the print with page setup and prints the laid-out pages", async () => {
    localStorage.clear();
    localStorage.setItem("mycalendar.events.v1", JSON.stringify([]));
    localStorage.setItem("mycalendar.print-request", `2026-9:${Date.now()}`);
    const view = await render(<PrintHarness />);
    await view.settle();
    const previewPages = () => [...view.host.querySelectorAll<HTMLElement>(".print-preview .print-page")];
    const printPages = () => [...document.body.querySelectorAll<HTMLElement>(".print-root .print-page")];
    expect(view.host.querySelector(".chrome h1")?.textContent).toBe(messages.ko.printTitle);
    expect(previewPages()).toHaveLength(1);
    expect(printPages()).toHaveLength(1);
    expect(previewPages()[0].querySelector(".print-head h2")?.textContent).toBe("2026년 10월");
    expect(previewPages()[0].style.width).toBe("297mm");
    expect(previewPages()[0].style.height).toBe("210mm");
    expect(previewPages()[0].style.padding).toBe("12mm");
    expect(previewPages()[0].querySelectorAll(".print-day")).toHaveLength(35);
    expect(document.head.querySelector('style[data-print="page"]')?.textContent).toBe("@page { size: 297mm 210mm; margin: 0; }");

    const byText = (selector: string, text: string) =>
      [...view.host.querySelectorAll<HTMLElement>(selector)].find((element) => element.textContent?.includes(text))!;
    click(byText(".print-options .segment button", messages.ko.printOrientations.portrait));
    expect(previewPages()[0].style.width).toBe("210mm");
    click(byText(".print-options .segment button", messages.ko.printMargins.wide));
    expect(previewPages()[0].style.padding).toBe("20mm");

    const months = view.host.querySelector(`[role="combobox"][aria-label="${messages.ko.printMonths}"]`) as HTMLElement;
    click(months);
    click([...document.body.querySelectorAll('[role="option"]')].find((option) => option.textContent === "3")!);
    expect(previewPages().map((page) => page.querySelector(".print-head h2")?.textContent)).toEqual(["2026년 10월", "2026년 11월", "2026년 12월"]);
    expect(printPages()).toHaveLength(3);
    expect(previewPages()[2].querySelector(".print-foot")?.textContent).toContain("3 / 3쪽");
    expect(view.host.textContent).toContain("모두 3쪽");

    const paper = view.host.querySelector(`[role="combobox"][aria-label="${messages.ko.printPaper}"]`) as HTMLElement;
    click(paper);
    click([...document.body.querySelectorAll('[role="option"]')].find((option) => option.textContent?.startsWith("A5"))!);
    expect(previewPages()[0].style.width).toBe("148mm");

    click(byText(".print-options .check", messages.ko.printEventList).querySelector("input")!);
    expect(previewPages()[0].querySelector(".print-list h3")?.textContent).toBe(messages.ko.printMonthEvents);
    click(byText(".print-options .check", messages.ko.printGrayscale).querySelector("input")!);
    expect(previewPages()[0].classList.contains("grayscale")).toBe(true);
    expect(JSON.parse(localStorage.getItem("mycalendar.print.v1")!)).toMatchObject({ paper: "a5", months: 3, margin: "wide" });

    const zoom = byText(".print-zoom .text-btn", "%");
    const before = zoom.textContent;
    click(view.host.querySelector(`[aria-label="${messages.ko.zoomIn}"]`)!);
    expect(zoom.textContent).not.toBe(before);

    const original = window.print;
    let calls = 0;
    window.print = () => {
      calls += 1;
    };
    click(byText(".print-btn", messages.ko.print));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    window.print = original;
    expect(calls).toBe(2);
    await view.unmount();
    expect(document.head.querySelector('style[data-print="page"]')).toBeNull();
    expect(document.body.querySelector(".print-root")).toBeNull();

    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/@media print \{[^@]*body > :not\(\.print-root\) \{ display: none !important; \}/);
  });

  it("scales, swaps, and styles the date font from the calendar settings", async () => {
    const view = await render(<SettingsHarness />);
    click([...view.host.querySelectorAll('[role="tab"]')][2]!);
    const size = view.host.querySelector("#date-font-size") as HTMLInputElement;
    expect(size.min).toBe("60");
    expect(size.max).toBe("180");
    expect(size.value).toBe("100");
    setControlValue(size, "140");
    expect(view.host.querySelector(".font-row .opacity strong")?.textContent).toBe("140%");
    const preview = view.host.querySelector(".font-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--date-font-scale")).toBe("1.4");

    // Step buttons sit on either side of every number slider in the settings.
    const stepper = (name: string, label: string) =>
      view.host.querySelector(`button[aria-label="${formatMessage(label, { name })}"]`) as HTMLButtonElement;
    const sizeDown = stepper(messages.ko.dateFontSize, messages.ko.decrease);
    const sizeUp = stepper(messages.ko.dateFontSize, messages.ko.increase);
    expect(sizeDown.nextElementSibling).toBe(size);
    expect(size.nextElementSibling).toBe(sizeUp);
    click(sizeUp);
    expect(size.value).toBe("145");
    click(sizeDown);
    click(sizeDown);
    expect(size.value).toBe("135");
    setControlValue(size, "180");
    expect(sizeUp.disabled).toBe(true);
    setControlValue(size, "60");
    expect(sizeDown.disabled).toBe(true);
    setControlValue(size, "140");

    const family = view.host.querySelector(`[role="combobox"][aria-label="${messages.ko.dateFontFamily}"]`) as HTMLButtonElement;
    click(family);
    click([...document.body.querySelectorAll('[role="option"]')].find((option) => option.textContent === messages.ko.fontFamilies.serif)!);
    expect(preview.style.getPropertyValue("--date-font")).toContain("serif");

    click([...view.host.querySelectorAll(".font-row .segment button")].find((button) => button.textContent === messages.ko.fontWeights.heavy)!);
    expect(preview.style.getPropertyValue("--date-weight")).toBe("850");
    const italic = [...view.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((box) =>
      box.closest("label")?.textContent?.includes(messages.ko.dateFontItalic),
    )!;
    click(italic);
    expect(preview.style.getPropertyValue("--date-style")).toBe("italic");

    const reset = [...view.host.querySelectorAll<HTMLButtonElement>(".font-head button")][0];
    expect(reset.disabled).toBe(false);
    click(reset);
    expect(reset.disabled).toBe(true);
    expect(preview.style.getPropertyValue("--date-font-scale")).toBe("1");
    expect(preview.style.getPropertyValue("--date-font")).toBe("");
    await view.unmount();

    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toContain("round(calc(2.78cqw * var(--date-font-scale, 1)), 1px)");
    expect(css).toMatch(/\.num \{[^}]*font-weight: var\(--date-weight, 680\);[^}]*font-style: var\(--date-style, normal\)/);
    const calendar = await render(<CalendarHarness initial={{ dateFontScale: 1.5, dateFontWeight: "regular" }} />);
    const days = calendar.host.querySelector(".days") as HTMLElement;
    expect(days.style.getPropertyValue("--date-font-scale")).toBe("1.5");
    expect(days.style.getPropertyValue("--date-weight")).toBe("450");
    await calendar.unmount();
  });

  it("keeps a separate date font for full screen and edits the one on screen", async () => {
    const tauri = Object.getOwnPropertyDescriptor(window, "__TAURI_INTERNALS__");
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    localStorage.setItem(FULLSCREEN_KEY, "1");
    const view = await render(<SettingsHarness />);
    click([...view.host.querySelectorAll('[role="tab"]')][2]!);
    const target = (label: string) =>
      [...view.host.querySelectorAll<HTMLButtonElement>(".font-row .segment button")].find((button) => button.textContent === label)!;
    const size = () => view.host.querySelector("#date-font-size") as HTMLInputElement;
    // Opened while the calendar is in full screen, the full screen font is the one being changed.
    expect(target(messages.ko.dateFontTargets.fullscreen).getAttribute("aria-pressed")).toBe("true");
    setControlValue(size(), "160");
    expect(size().value).toBe("160");
    click(target(messages.ko.dateFontTargets.window));
    expect(size().value).toBe("100");
    setControlValue(size(), "120");
    click(target(messages.ko.dateFontTargets.fullscreen));
    expect(size().value).toBe("160");

    // Leaving full screen switches the settings to the window font.
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: FULLSCREEN_KEY, newValue: "0" }));
    });
    expect(target(messages.ko.dateFontTargets.window).getAttribute("aria-pressed")).toBe("true");
    expect(size().value).toBe("120");
    await view.unmount();
    localStorage.removeItem(FULLSCREEN_KEY);
    if (tauri) Object.defineProperty(window, "__TAURI_INTERNALS__", tauri);
    else delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("puts a background image behind the calendar window only", async () => {
    localStorage.clear();
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    localStorage.setItem(BACKGROUND_IMAGE_KEY, image);

    const settings = await render(<SettingsHarness />);
    const settingsTabs = [...settings.host.querySelectorAll('[role="tab"]')];
    // The image is chosen in the general tab; the appearance tab keeps only transparency and themes.
    click(settingsTabs[1]!);
    expect(settings.host.querySelector(".theme-grid")).not.toBeNull();
    expect(settings.host.querySelector(".background-image-thumb")).toBeNull();
    click(settingsTabs[0]!);
    expect(settingsTabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(settings.host.querySelector(".theme-grid")).toBeNull();
    expect(settings.host.querySelector(".panel-backdrop")).toBeNull();
    const thumb = settings.host.querySelector(".background-image-thumb") as HTMLElement;
    expect(thumb.style.backgroundImage).toContain("data:image/png");
    const slider = settings.host.querySelector("#background-image-transparency") as HTMLInputElement;
    expect(slider.value).toBe("50");
    setControlValue(slider, "30");
    expect(slider.value).toBe("30");
    // There is no choice of windows: the image belongs to the calendar.
    expect(settings.host.querySelector(".background-image-windows")).toBeNull();
    const remove = [...settings.host.querySelectorAll("button")].find((button) => button.textContent === messages.ko.removeBackgroundImage)!;
    click(remove);
    expect(localStorage.getItem(BACKGROUND_IMAGE_KEY)).toBeNull();
    expect(settings.host.querySelector(".background-image-thumb")?.textContent).toBe(messages.ko.noBackgroundImage);
    await settings.unmount();

    localStorage.setItem(BACKGROUND_IMAGE_KEY, image);
    const calendar = await render(<CalendarHarness initial={{ backgroundImageOpacity: 0.7 }} />);
    const backdrop = calendar.host.querySelector(".panel.calendar > .panel-backdrop") as HTMLElement;
    expect(backdrop).not.toBeNull();
    expect(backdrop.style.opacity).toBe("0.7");
    expect(backdrop.style.backgroundImage).toContain("url(");
    await act(async () => writeBackgroundImage(null));
    expect(calendar.host.querySelector(".panel-backdrop")).toBeNull();
    await calendar.unmount();

    localStorage.setItem(BACKGROUND_IMAGE_KEY, image);
    const events = await render(<EventsHarness />);
    expect(events.host.querySelector(".panel-backdrop")).toBeNull();
    await events.unmount();
    const print = await render(<PrintHarness />);
    expect(print.host.querySelector(".panel-backdrop")).toBeNull();
    await print.unmount();
    const reminder = await render(<ReminderPopup t={messages.ko} language="ko" />);
    expect(reminder.host.querySelector(".panel-backdrop")).toBeNull();
    await reminder.unmount();
    for (const file of ["EventsScreen", "PrintScreen", "ReminderPopup", "SettingsScreen", "EventEditor"]) {
      expect(readFileSync(resolve(`src/ui/${file}.tsx`), "utf8")).not.toContain("PanelBackdrop");
    }

    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.panel-backdrop \{[^}]*z-index: -1;[^}]*background-size: cover;/);
    expect(css).toMatch(/\.panel \{[^}]*isolation: isolate;/);
    localStorage.clear();
  });

  it("shows the app name beside the icon only when it fits, and the year and month in the chosen format", async () => {
    const calendar = await render(
      <CalendarHarness initial={{ monthTitleFormats: { ko: "ko-dot", en: "en-long" } }} />,
    );
    const brand = calendar.host.querySelector(".toolbar .app-brand")!;
    const name = brand.querySelector(".app-name")!;
    expect(brand.querySelector("img.app-icon")?.getAttribute("alt")).toBe(messages.ko.appName);
    expect(name.textContent).toBe(messages.ko.appName);
    // Without a measured toolbar there is no room known, so only the icon shows.
    expect(name.hasAttribute("data-hidden")).toBe(true);
    expect(name.getAttribute("aria-hidden")).toBe("true");
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toContain(".app-name[data-hidden] { position: absolute; visibility: hidden; pointer-events: none; }");
    const source = readFileSync(resolve("src/ui/CalendarScreen.tsx"), "utf8");
    expect(source).toContain("setShowName(panel.offsetWidth >= needed + name)");
    expect(source).toContain('querySelector<HTMLElement>(".app-name:not([data-hidden])")');
    expect(source).toContain("new ResizeObserver(fitName)");
    const now = new Date();
    expect(calendar.host.querySelector(".toolbar h1")?.textContent).toBe(`${now.getFullYear()}. ${now.getMonth() + 1}.`);
    await calendar.unmount();

    const view = await render(<SettingsHarness />);
    const tabs = () => [...view.host.querySelectorAll('[role="tab"]')];
    const format = () => view.host.querySelector(`[role="combobox"][aria-label="${messages.ko.monthTitleFormat}"]`) as HTMLButtonElement;
    const pick = (label: string) => {
      click(format());
      const options = [...document.body.querySelectorAll('[role="listbox"] [role="option"]')];
      click(options.find((option) => option.textContent === label)!);
    };
    click(tabs()[2]!);
    expect(format().textContent).toBe(monthTitle(now.getFullYear(), now.getMonth(), "ko", messages.ko.months));
    click(format());
    expect([...document.body.querySelectorAll('[role="listbox"] [role="option"]')]).toHaveLength(8);
    click(format());
    pick(`${now.getMonth() + 1}월`);
    expect(format().textContent).toBe(`${now.getMonth() + 1}월`);

    // English keeps its own choice, and switching back finds the Korean one unchanged.
    click(tabs()[0]!);
    click([...view.host.querySelectorAll(".segment button")].find((button) => button.textContent === "English")!);
    click(tabs()[2]!);
    const english = () => view.host.querySelector(`[role="combobox"][aria-label="${messages.en.monthTitleFormat}"]`) as HTMLButtonElement;
    expect(english().textContent).toBe(monthTitle(now.getFullYear(), now.getMonth(), "en", messages.en.months));
    click(tabs()[0]!);
    click([...view.host.querySelectorAll(".segment button")].find((button) => button.textContent === "한국어")!);
    click(tabs()[2]!);
    expect(format().textContent).toBe(`${now.getMonth() + 1}월`);
    await view.unmount();
  });

  it("edits events in a window of its own on the desktop, whose form scrolls when the window is short", async () => {
    localStorage.clear();
    const base = { calendar: "solar", time: "09:00", interval: 1, until: "", color: "#3d7dff", skip: [], reminder: null };
    localStorage.setItem(
      "mycalendar.events.v1",
      JSON.stringify([{ ...base, id: "gym", title: "운동", date: "2026-10-12", repeat: "weekly" }]),
    );
    const ctx: ReadyContext = { settings: { ...DEFAULT_SETTINGS, language: "ko" }, update: () => {}, desktopError: null, t: messages.ko };
    let closed = 0;
    const gym = JSON.parse(localStorage.getItem("mycalendar.events.v1")!)[0];
    requestEventEdit(gym, "2026-10-19");
    expect(parseEventEditRequest(localStorage.getItem(EVENT_EDIT_KEY))).toMatchObject({ id: "gym", occurrence: "2026-10-19" });
    expect(parseEventEditRequest("not json")).toBeNull();

    const view = await render(<EventEditorWindow ctx={ctx} onClose={() => { closed += 1; }} />);
    const form = () => view.host.querySelector(".editor-screen > form.sheet.standalone") as HTMLFormElement;
    // A title bar of its own replaces the sheet's heading, with a grip to resize the window.
    expect(view.host.querySelector(".sheet-back")).toBeNull();
    expect(view.host.querySelector(".editor-screen > .chrome h1")?.textContent).toBe(messages.ko.editEvent);
    expect(form().querySelector(".sheet-head")).toBeNull();
    expect(form().getAttribute("role")).toBeNull();
    expect(view.host.querySelector(`.editor-screen > .resize-grip[aria-label="${messages.ko.resizeWindow}"]`)).not.toBeNull();
    expect((form().querySelector('input[name="title"]') as HTMLInputElement).value).toBe("운동");
    expect([...form().querySelectorAll("button")].some((button) => button.textContent === messages.ko.deleteOccurrence)).toBe(true);

    // Asking for a new event while the window is open replaces the form.
    await act(async () => {
      requestEventEdit(blankEvent(new Date(2026, 9, 21), 10));
      window.dispatchEvent(new StorageEvent("storage", { key: EVENT_EDIT_KEY, newValue: localStorage.getItem(EVENT_EDIT_KEY) }));
    });
    expect(view.host.querySelector(".editor-screen > .chrome h1")?.textContent).toBe(messages.ko.addEvent);
    expect((form().querySelector('input[name="title"]') as HTMLInputElement).value).toBe("");
    expect((form().querySelector('input[name="date"]') as HTMLInputElement).value).toBe("2026-10-21");
    setControlValue(form().querySelector('input[name="title"]') as HTMLInputElement, "회의");
    await act(async () => {
      form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(closed).toBe(1);
    const stored = JSON.parse(localStorage.getItem("mycalendar.events.v1")!) as Array<{ title: string; date: string; reminder: number | null }>;
    expect(stored.find((event) => event.title === "회의")).toMatchObject({ date: "2026-10-21", reminder: 10 });
    await view.unmount();

    // An event deleted meanwhile has nothing to edit, so the window closes.
    requestEventEdit({ ...gym, id: "gone" });
    const gone = await render(<EventEditorWindow ctx={ctx} onClose={() => { closed += 1; }} />);
    expect(closed).toBe(2);
    expect(gone.host.querySelector("form")).toBeNull();
    await gone.unmount();
    localStorage.clear();

    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.editor-screen > \.sheet\.standalone \{[^}]*flex: 0 1 auto;[^}]*min-height: 0;[^}]*max-height: none;/);
    expect(css).toMatch(/\.sheet\.standalone \.sheet-actions \{[^}]*position: sticky;[^}]*bottom: 0;/);
    // Both screens that open the editor go through the hook, which picks the window on the desktop.
    const hook = readFileSync(resolve("src/ui/useEventEditor.ts"), "utf8");
    expect(hook).toMatch(/if \(isTauri\(\)\) \{\s*requestEventEdit\(event, occurrence\);\s*void openAux\("editor"\);/);
    for (const file of ["src/ui/CalendarScreen.tsx", "src/ui/EventManager.tsx"]) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source).toContain("const editor = useEventEditor();");
      expect(source).not.toContain("setEditing(");
    }
  });

  it("draws a colored dot for every event of a day, in rows that wrap only when full", async () => {
    localStorage.clear();
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    const colors = ["#e5484d", "#46a758", "#0090ff", "#ffc53d", "#6e56cf", "#12a594", "#d6409f"];
    const events = colors.map((color, index) => ({
      id: `dot-${index}`,
      title: `점 ${index}`,
      date: day,
      calendar: "solar",
      time: "",
      repeat: "none",
      interval: 1,
      until: "",
      color,
      skip: [],
      reminder: null,
    }));
    localStorage.setItem("mycalendar.events.v1", JSON.stringify(events));
    const view = await render(<CalendarHarness />);
    await view.settle();
    const cell = [...view.host.querySelectorAll(".day:not(.out)")].find((node) => node.querySelector(".num")?.textContent === "15")!;
    const dots = [...cell.querySelectorAll(".dots i:not(.holiday-dot)")] as HTMLElement[];
    const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5), 16)})`;
    expect(dots).toHaveLength(colors.length);
    expect(dots.map((dot) => dot.style.background.replace(/^#\w+$/, rgb))).toEqual(colors.map(rgb));
    await view.unmount();
    localStorage.clear();

    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/\.dots \{[^}]*top: calc\(50% \+ 0\.56em\);[^}]*flex-wrap: wrap;[^}]*align-content: flex-start;[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.day\.has-sub \.dots \{[^}]*bottom: calc\(50% \+ 0\.56em\);[^}]*flex-wrap: wrap-reverse;/);
    expect(css).toContain(".dots i.holiday-dot { background: var(--holiday); }");
    const source = readFileSync(resolve("src/ui/CalendarScreen.tsx"), "utf8");
    expect(source).toContain('{names.length > 0 && <i className="holiday-dot" />}');
  });

  it("keeps the background image choices within range", () => {
    expect(DEFAULT_SETTINGS.backgroundImageOpacity).toBe(0.5);
    expect(normalizeSettings({ backgroundImageOpacity: 4 } as Partial<Settings>).backgroundImageOpacity).toBe(1);
    expect(normalizeSettings({ backgroundImageOpacity: -1 } as Partial<Settings>).backgroundImageOpacity).toBe(0);
    expect(normalizeSettings({ backgroundImageWindows: { main: false } } as unknown as Partial<Settings>)).not.toHaveProperty(
      "backgroundImageWindows",
    );
    expect(isBackgroundImage("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isBackgroundImage("javascript:alert(1)")).toBe(false);
    expect(isBackgroundImage('data:image/png;base64,AA") url("x')).toBe(false);
    expect(() => writeBackgroundImage("https://example.com/a.png")).toThrow();
  });

  it("pops up due reminders and snoozes or dismisses them", async () => {
    localStorage.clear();
    const now = Date.now();
    const item = (key: string, title: string) => ({
      key,
      eventId: key,
      title,
      color: "#e5484d",
      date: "2026-10-06",
      time: "10:00",
      minutesBefore: 10,
      startAt: now + 10 * 60_000,
      showAt: now - 1000,
    });
    localStorage.setItem("mycalendar.reminders.queue", JSON.stringify([item("a", "치과"), item("b", "회의")]));
    let emptied = 0;
    const view = await render(<ReminderPopup t={messages.ko} language="ko" onEmpty={() => { emptied += 1; }} />);
    const titles = () => [...view.host.querySelectorAll(".reminder-text strong")].map((node) => node.textContent);
    expect(view.host.querySelector('[role="alertdialog"] h1')?.textContent).toBe(messages.ko.remindersTitle);
    expect(titles()).toEqual(["치과", "회의"]);
    expect(view.host.querySelector(".reminder-text")?.textContent).toContain("10분 후 시작");
    expect(view.host.querySelector(".reminder-text")?.textContent).toContain("10분 전");

    click([...view.host.querySelectorAll(".reminder-item button")].find((button) => button.textContent === messages.ko.snooze)!);
    expect(titles()).toEqual(["회의"]);
    expect(JSON.parse(localStorage.getItem("mycalendar.reminders.queue")!)).toHaveLength(2);
    click([...view.host.querySelectorAll(".reminder-item button")].find((button) => button.textContent === messages.ko.dismiss)!);
    expect(view.host.querySelector(".reminder-panel")).toBeNull();
    expect(emptied).toBe(1);
    expect(JSON.parse(localStorage.getItem("mycalendar.reminders.queue")!).map((entry: { key: string }) => entry.key)).toEqual(["a"]);
    await view.unmount();
  });

  it("opens the settings window on the tab the calendar asked for", async () => {
    localStorage.setItem("mycalendar.settings-tab", `about:${Date.now()}`);
    const view = await render(<SettingsHarness />);
    expect(view.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(messages.ko.aboutTab);
    expect(localStorage.getItem("mycalendar.settings-tab")).toBeNull();
    await view.unmount();
  });

  it("fills the desktop window without an outer gap", () => {
    const css = readFileSync(resolve("src/styles.css"), "utf8");
    expect(css).toMatch(/html\[data-platform="desktop"\] \.app-frame \{ padding: 0; \}/);
  });
});
