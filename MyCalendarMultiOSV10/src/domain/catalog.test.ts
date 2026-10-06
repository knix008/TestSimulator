import { describe, expect, it } from "vitest";
import { addMonths, buildMonthGrid, formatISODate, weekdayLabels } from "./calendar";
import { FALLBACK_COUNTRIES } from "./countries";
import { en } from "./en";
import { holidayTitle, holidayUrl, isDisplayedHoliday } from "./holidays";
import { ko } from "./ko";
import { normalizeSettings } from "./settings";
import { darkThemes, lightThemes } from "./themes";

describe("themes", () => {
  it("ships 20 light themes and 20 dark themes", () => {
    expect(lightThemes).toHaveLength(20);
    expect(darkThemes).toHaveLength(20);
    const ids = [...lightThemes, ...darkThemes].map((theme) => theme.id);
    expect(new Set(ids).size).toBe(40);
  });
});

describe("languages", () => {
  it("keeps Korean and English message keys aligned", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
    expect(en.months).toHaveLength(12);
    expect(ko.months).toHaveLength(12);
    expect(en.weekdays).toHaveLength(7);
    expect(ko.weekdaysShort).toHaveLength(7);
  });
});

describe("calendar", () => {
  it("starts October 2026 on the Sunday before the 1st", () => {
    const grid = buildMonthGrid(2026, 9, 0);
    expect(grid).toHaveLength(42);
    expect(formatISODate(grid[0])).toBe("2026-09-27");
    expect(formatISODate(grid[9])).toBe("2026-10-06");
  });

  it("can start the week on Monday", () => {
    expect(formatISODate(buildMonthGrid(2026, 9, 1)[0])).toBe("2026-09-28");
    expect(weekdayLabels(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], 1)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("keeps a valid day when the next month is shorter", () => {
    expect(formatISODate(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(formatISODate(addMonths(new Date(2024, 0, 31), 1))).toBe("2024-02-29");
  });
});

describe("holidays", () => {
  it("keeps public holidays and chooses the name for the active language", () => {
    expect(isDisplayedHoliday({ types: ["Public"] })).toBe(true);
    expect(isDisplayedHoliday({ types: ["Bank"] })).toBe(true);
    expect(isDisplayedHoliday({ types: ["Observance"] })).toBe(false);
    expect(holidayTitle({ localName: "개천절", name: "National Foundation Day" }, "ko")).toBe("개천절");
    expect(holidayTitle({ localName: "개천절", name: "National Foundation Day" }, "en")).toBe(
      "National Foundation Day",
    );
    expect(holidayUrl("KR", 2026)).toBe("https://date.nager.at/api/v3/PublicHolidays/2026/KR");
  });
});

describe("settings", () => {
  it("clamps transparency and falls back when a theme is unknown", () => {
    const settings = normalizeSettings({
      opacity: 0,
      themeId: "missing",
      countryCode: "us",
      language: "ko",
      weekStartsOn: 1,
    });
    expect(settings.opacity).toBe(0.15);
    expect(settings.themeId).toBe("dark-ink");
    expect(settings.countryCode).toBe("US");
    expect(settings.language).toBe("ko");
    expect(settings.weekStartsOn).toBe(1);
  });
});

describe("countries", () => {
  it("includes Korea and does not repeat codes", () => {
    expect(FALLBACK_COUNTRIES.some((country) => country.code === "KR" && country.ko === "대한민국")).toBe(true);
    expect(new Set(FALLBACK_COUNTRIES.map((country) => country.code)).size).toBe(FALLBACK_COUNTRIES.length);
  });
});
