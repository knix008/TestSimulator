import { describe, expect, it } from "vitest";
import { en } from "../src/domain/en";
import { ko } from "../src/domain/ko";
import { formatISODate } from "../src/domain/calendar";
import {
  dayNote,
  formatLunar,
  fromLunar,
  lunarMonthLabel,
  lunarMonthLength,
  lunarMonths,
  lunarMonthsBetween,
  lunarSupported,
  solarTermIndex,
  solarTermTime,
  solarTermsOf,
  toLunar,
} from "../src/domain/lunar";

describe("Lunar", () => {
  it("converts solar days to the Korean lunar calendar, including leap months", () => {
    expect(lunarSupported()).toBe(true);
    expect(toLunar(new Date(2026, 9, 6))).toEqual({ year: 2026, month: 8, day: 26, leap: false });
    expect(toLunar(new Date(2026, 8, 25))).toEqual({ year: 2026, month: 8, day: 15, leap: false });
    expect(toLunar(new Date(2026, 1, 17))).toEqual({ year: 2026, month: 1, day: 1, leap: false });
    expect(toLunar(new Date(2025, 6, 25))).toEqual({ year: 2025, month: 6, day: 1, leap: true });
    expect(toLunar(new Date(2023, 2, 22))).toEqual({ year: 2023, month: 2, day: 1, leap: true });
    // The lunar year is named after the solar year it starts in, which the last months run past.
    expect(toLunar(new Date(2026, 0, 1))).toEqual({ year: 2025, month: 11, day: 13, leap: false });
  });


  it("lists the months of a lunar year and turns a lunar date back into a solar one", () => {
    const leapYear = lunarMonths(2025);
    expect(leapYear).toHaveLength(13);
    expect(leapYear.filter((month) => month.leap).map((month) => month.month)).toEqual([6]);
    expect(lunarMonths(2026)).toHaveLength(12);
    expect(lunarMonths(2026).every((month) => month.length === 29 || month.length === 30)).toBe(true);
    expect(lunarMonths(1700)).toEqual([]);
    expect(lunarMonths(Number.NaN)).toEqual([]);

    const solar = (lunar: Parameters<typeof fromLunar>[0]) => {
      const date = fromLunar(lunar);
      return date ? formatISODate(date) : null;
    };
    expect(solar({ year: 2026, month: 1, day: 1, leap: false })).toBe("2026-02-17");
    expect(solar({ year: 2027, month: 1, day: 1, leap: false })).toBe("2027-02-07");
    expect(solar({ year: 2026, month: 8, day: 26, leap: false })).toBe("2026-10-06");
    expect(solar({ year: 2025, month: 6, day: 1, leap: true })).toBe("2025-07-25");
    // 2026 has no leap sixth month, so the date falls back to the plain one.
    expect(solar({ year: 2026, month: 6, day: 1, leap: true })).toBe("2026-07-14");
    // The eighth month of 2027 is 29 days long, so its 30th day is its last.
    expect(solar({ year: 2027, month: 8, day: 30, leap: false })).toBe("2027-09-29");
    expect(solar({ year: 2026, month: 8, day: 0, leap: false })).toBeNull();
    expect(solar({ year: 1700, month: 8, day: 1, leap: false })).toBeNull();

    expect(lunarMonthLength({ year: 2026, month: 8, day: 1, leap: false })).toBe(30);
    expect(lunarMonthLength({ year: 2027, month: 8, day: 1, leap: false })).toBe(29);
    expect(lunarMonthLength({ year: 2026, month: 6, day: 1, leap: true })).toBeNull();

    expect(lunarMonthsBetween(new Date(2026, 9, 6), new Date(2026, 10, 5))).toBe(1);
    expect(lunarMonthsBetween(new Date(2026, 9, 6), new Date(2026, 9, 11))).toBe(1);
    expect(lunarMonthsBetween(new Date(2026, 9, 6), new Date(2026, 9, 10))).toBe(0);
    // A leap month counts as a month of its own.
    expect(lunarMonthsBetween(new Date(2025, 5, 25), new Date(2025, 7, 23))).toBe(2);
    expect(lunarMonthsBetween(new Date(2026, 9, 6), new Date(2036, 9, 6))).toBe(124);
    expect(lunarMonthsBetween(new Date(2026, 10, 5), new Date(2026, 9, 6))).toBe(-1);
  });

  it("writes lunar dates and month names in both languages", () => {
    const leap = { year: 2025, month: 6, day: 1, leap: true };
    expect(formatLunar(leap, ko)).toBe("음력 윤6월 1일");
    expect(formatLunar(leap, en)).toBe("Lunar 6/1 (leap month)");
    expect(formatLunar({ year: 2026, month: 8, day: 26, leap: false }, ko)).toBe("음력 8월 26일");
    expect(lunarMonthLabel({ month: 8, leap: false }, ko)).toBe("8월");
    expect(lunarMonthLabel({ month: 6, leap: true }, ko)).toBe("윤6월");
    expect(lunarMonthLabel({ month: 6, leap: true }, en)).toBe("Leap month 6");
  });

  it("finds the 24 solar terms within minutes of the published times", () => {
    const published: Array<[number, number, string]> = [
      [2024, 5, "2024-03-20T03:06:00Z"],
      [2025, 2, "2025-02-03T14:10:00Z"],
      [2025, 23, "2025-12-21T15:03:00Z"],
      [2026, 11, "2026-06-21T08:24:00Z"],
      [2026, 23, "2026-12-21T20:50:00Z"],
    ];
    for (const [year, index, iso] of published) {
      expect(Math.abs(solarTermTime(year, index) - Date.parse(iso))).toBeLessThan(10 * 60_000);
    }
    expect([...solarTermsOf(2026).keys()]).toEqual([
      "2026-01-05", "2026-01-20", "2026-02-04", "2026-02-19", "2026-03-05", "2026-03-20",
      "2026-04-05", "2026-04-20", "2026-05-05", "2026-05-21", "2026-06-06", "2026-06-21",
      "2026-07-07", "2026-07-23", "2026-08-07", "2026-08-23", "2026-09-07", "2026-09-23",
      "2026-10-08", "2026-10-23", "2026-11-07", "2026-11-22", "2026-12-07", "2026-12-22",
    ]);
    expect(solarTermIndex(new Date(2025, 11, 22))).toBe(23);
    expect(solarTermIndex(new Date(2025, 11, 21))).toBeNull();
    expect(ko.solarTerms).toHaveLength(24);
    expect(en.solarTerms).toHaveLength(24);
  });

  it("labels only lunar month starts, solar month starts, and solar terms", () => {
    expect(dayNote(new Date(2026, 9, 6), ko)).toEqual({ cell: null, full: "음력 8월 26일", term: null });
    expect(dayNote(new Date(2026, 9, 1), ko).cell).toBe("음 8.21");
    expect(dayNote(new Date(2026, 9, 11), ko).cell).toBe("음 9.1");
    expect(dayNote(new Date(2026, 9, 8), ko)).toEqual({ cell: "한로", full: "음력 8월 28일 · 한로", term: "한로" });
    expect(dayNote(new Date(2025, 6, 25), ko).cell).toBe("윤 6.1");
    expect(dayNote(new Date(2025, 6, 25), ko).full).toBe("음력 윤6월 1일");
    expect(dayNote(new Date(2025, 6, 25), en).full).toBe("Lunar 6/1 (leap month)");
    expect(dayNote(new Date(2026, 9, 8), en).cell).toBe("Cold Dew");
    expect(dayNote(new Date(2026, 9, 11), en).cell).toBe("L 9.1");
  });
});
