import { describe, expect, it } from "vitest";
import {
  clampOpacity,
  dateFontFor,
  dateFontPatch,
  DEFAULT_SETTINGS,
  normalizeSettings,
  opacityFromTransparency,
  readStoredSettings,
  transparencyFromOpacity,
  STORAGE_KEY,
  writeStoredSettings,
  type Settings,
} from "../src/domain/settings";
import { MIN_OPACITY } from "../src/domain/themes";

describe("Settings", () => {
  it("starts with a readable default calendar", () => {
    expect(DEFAULT_SETTINGS.language).toBeNull();
    expect(DEFAULT_SETTINGS.themeId).toBe("dark-ink");
    expect(DEFAULT_SETTINGS.opacity).toBe(0.8);
    expect(DEFAULT_SETTINGS.countryCode).toBe("KR");
    expect(DEFAULT_SETTINGS.weekStartsOn).toBe(0);
    expect(DEFAULT_SETTINGS.alwaysOnTop).toBe(false);
    expect(DEFAULT_SETTINGS.autostart).toBe(false);
    expect(DEFAULT_SETTINGS.eventsCollapsed).toBe(false);
    expect(DEFAULT_SETTINGS.eventsHeight).toBe(176);
    expect(normalizeSettings({ eventsHeight: -20 }).eventsHeight).toBe(176);
    expect(normalizeSettings({ eventsHeight: 0 }).eventsHeight).toBe(176);
    expect(normalizeSettings({ eventsHeight: 30 }).eventsHeight).toBe(48);
    expect(normalizeSettings({ eventsHeight: 9999 }).eventsHeight).toBe(1200);
    expect(normalizeSettings({}).eventsHeight).toBe(176);
    expect(transparencyFromOpacity(DEFAULT_SETTINGS.opacity)).toBe(22);
  });

  it("keeps the date font choices and the last window size within range", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      dateFontScale: 1,
      dateFontFamily: "system",
      dateFontWeight: "bold",
      dateFontItalic: false,
      windowSize: null,
    });
    const settings = normalizeSettings({
      dateFontScale: 5,
      dateFontFamily: "comic" as never,
      dateFontWeight: "heavy",
      dateFontItalic: true,
      windowSize: { width: 640.4, height: 719.6 },
    });
    expect(settings).toMatchObject({
      dateFontScale: 1.8,
      dateFontFamily: "system",
      dateFontWeight: "heavy",
      dateFontItalic: true,
      windowSize: { width: 640, height: 720 },
    });
    expect(normalizeSettings({ dateFontScale: 0.1 }).dateFontScale).toBe(0.6);
    expect(normalizeSettings({ windowSize: { width: 50, height: 600 } }).windowSize).toBeNull();
    expect(normalizeSettings({ windowSize: "big" as never }).windowSize).toBeNull();
  });

  it("keeps the full screen date font apart from the window's", () => {
    const settings = normalizeSettings({ dateFontScale: 1.2, dateFontWeight: "regular" });
    expect(settings.fullscreenDateFont).toBeNull();
    // Until it is changed in full screen, full screen uses the window font.
    expect(dateFontFor(settings, true)).toEqual(dateFontFor(settings, false));
    const patched = normalizeSettings({ ...settings, ...dateFontPatch(settings, true, { dateFontScale: 1.7 }) });
    expect(patched.dateFontScale).toBe(1.2);
    expect(dateFontFor(patched, true)).toEqual({
      dateFontScale: 1.7,
      dateFontFamily: "system",
      dateFontWeight: "regular",
      dateFontItalic: false,
    });
    expect(dateFontPatch(patched, false, { dateFontItalic: true })).toEqual({ dateFontItalic: true });
    expect(normalizeSettings({ fullscreenDateFont: { dateFontScale: 9, dateFontFamily: "comic" } as never }).fullscreenDateFont).toEqual({
      dateFontScale: 1.8,
      dateFontFamily: "system",
      dateFontWeight: "bold",
      dateFontItalic: false,
    });
    expect(normalizeSettings({ fullscreenDateFont: "big" as never }).fullscreenDateFont).toBeNull();
  });

  it("clamps transparency, theme, country, language, and week start", () => {
    const settings = normalizeSettings({
      opacity: 0,
      themeId: "missing",
      countryCode: "us",
      language: "ko",
      weekStartsOn: 1,
      alwaysOnTop: true,
      autostart: true,
    });
    expect(settings.opacity).toBe(MIN_OPACITY);
    expect(settings.themeId).toBe("dark-ink");
    expect(settings.countryCode).toBe("US");
    expect(settings.language).toBe("ko");
    expect(settings.weekStartsOn).toBe(1);
    expect(settings.alwaysOnTop).toBe(true);
    expect(settings.autostart).toBe(true);
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(Number.NaN)).toBe(DEFAULT_SETTINGS.opacity);
    expect(normalizeSettings({ language: "fr", countryCode: "KOR", weekStartsOn: 0 } as unknown as Partial<Settings>).language).toBeNull();
    expect(normalizeSettings({ countryCode: "KOR" }).countryCode).toBe("KR");
    expect(normalizeSettings({ weekStartsOn: 1 }).weekStartsOn).toBe(1);
    expect(normalizeSettings({ weekStartsOn: 6 }).weekStartsOn).toBe(6);
    expect(normalizeSettings({ weekStartsOn: 7 as 0 }).weekStartsOn).toBe(0);
    expect(normalizeSettings({ weekStartsOn: 1.5 as 0 }).weekStartsOn).toBe(0);
    expect(normalizeSettings({}).showLunar).toBe(true);
    expect(normalizeSettings({ showLunar: false }).showLunar).toBe(false);
    expect(normalizeSettings({ showLunar: "yes" as unknown as boolean }).showLunar).toBe(true);
  });

  it("maps the transparency slider from 0 to 100 percent transparency without hiding the panel", () => {
    expect(opacityFromTransparency(0)).toBe(1);
    expect(opacityFromTransparency(100)).toBeCloseTo(MIN_OPACITY);
    expect(MIN_OPACITY).toBeGreaterThan(0);
    expect(opacityFromTransparency(150)).toBeCloseTo(MIN_OPACITY);
    expect(opacityFromTransparency(-5)).toBe(1);
    expect(opacityFromTransparency(50)).toBeCloseTo(0.55);
    for (let percent = 0; percent <= 100; percent += 1) {
      expect(transparencyFromOpacity(opacityFromTransparency(percent))).toBe(percent);
    }
    expect(transparencyFromOpacity(0)).toBe(100);
    expect(transparencyFromOpacity(DEFAULT_SETTINGS.opacity)).toBe(22);
  });

  it("saves and reloads settings from local storage", () => {
    const heard = viListener();
    writeStoredSettings({
      ...DEFAULT_SETTINGS,
      language: "en",
      themeId: "light-paper",
      opacity: 0.4,
      countryCode: "JP",
      weekStartsOn: 1,
      alwaysOnTop: true,
      autostart: false,
      eventsCollapsed: true,
    });
    expect(heard.count).toBe(1);
    window.removeEventListener("mycalendar-settings", heard.onChange);
    expect(readStoredSettings()).toMatchObject({
      language: "en",
      themeId: "light-paper",
      opacity: 0.4,
      countryCode: "JP",
      weekStartsOn: 1,
      eventsCollapsed: true,
    });
    expect(localStorage.getItem(STORAGE_KEY)).toContain("light-paper");
  });

  it("ignores missing and corrupt saved settings", () => {
    expect(readStoredSettings()).toBeNull();
    localStorage.setItem(STORAGE_KEY, "{");
    expect(readStoredSettings()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ opacity: "high", themeId: "nope" }));
    expect(readStoredSettings()).toMatchObject({ opacity: DEFAULT_SETTINGS.opacity, themeId: "dark-ink" });
  });
});

function viListener() {
  const heard = {
    count: 0,
    onChange: () => {
      heard.count += 1;
    },
  };
  window.addEventListener("mycalendar-settings", heard.onChange);
  return heard;
}
