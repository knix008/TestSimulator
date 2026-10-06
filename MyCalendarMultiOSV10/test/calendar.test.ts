import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildMonthGrid,
  buildMonthWeeks,
  CALENDAR_WEEKS,
  formatISODate,
  isSameDay,
  monthTitle,
  parseISODate,
  shiftDays,
  weekdayLabels,
} from "../src/domain/calendar";
import { en } from "../src/domain/en";
import { ko } from "../src/domain/ko";

describe("Calendar", () => {
  it("builds a 42-day month that starts on the configured weekday", () => {
    const sunday = buildMonthGrid(2026, 9, 0);
    expect(sunday).toHaveLength(42);
    expect(formatISODate(sunday[0])).toBe("2026-09-27");
    expect(formatISODate(sunday[9])).toBe("2026-10-06");
    expect(sunday.filter((date) => date.getMonth() === 9)).toHaveLength(31);

    const monday = buildMonthGrid(2026, 9, 1);
    expect(formatISODate(monday[0])).toBe("2026-09-28");
    expect(formatISODate(monday[8])).toBe("2026-10-06");
  });

  it("always draws five weeks and folds a sixth week into shared cells", () => {
    for (let month = 0; month < 24; month += 1) {
      for (const start of [0, 1] as const) {
        const year = 2026 + Math.floor(month / 12);
        const weeks = buildMonthWeeks(year, month % 12, start);
        expect(weeks).toHaveLength(CALENDAR_WEEKS * 7);
        const shown = weeks.flat().filter((date) => date.getMonth() === month % 12);
        expect(shown).toHaveLength(new Date(year, (month % 12) + 1, 0).getDate());
      }
    }
    const august = buildMonthWeeks(2026, 7, 0);
    expect(august.slice(28, 30).map((cell) => cell.map(formatISODate))).toEqual([
      ["2026-08-23", "2026-08-30"],
      ["2026-08-24", "2026-08-31"],
    ]);
    expect(august[30].map(formatISODate)).toEqual(["2026-08-25"]);
    expect(buildMonthWeeks(2026, 9, 0).every((cell) => cell.length === 1)).toBe(true);
  });

  it("rotates weekday labels when the week starts on Monday", () => {
    expect(weekdayLabels(en.weekdaysShort, 0)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(weekdayLabels(ko.weekdaysShort, 1)).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  });

  it("keeps a real day when moving into a shorter month", () => {
    expect(formatISODate(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(formatISODate(addMonths(new Date(2024, 0, 31), 1))).toBe("2024-02-29");
    expect(formatISODate(addMonths(new Date(2026, 9, 6), -1))).toBe("2026-09-06");
    expect(formatISODate(addMonths(new Date(2026, 11, 6), 1))).toBe("2027-01-06");
  });

  it("compares, shifts, and formats calendar dates", () => {
    const day = parseISODate("2026-10-06");
    expect(isSameDay(day, new Date(2026, 9, 6))).toBe(true);
    expect(isSameDay(day, new Date(2026, 9, 7))).toBe(false);
    expect(formatISODate(shiftDays(day, 7))).toBe("2026-10-13");
    expect(formatISODate(shiftDays(day, -1))).toBe("2026-10-05");
  });

  it("formats the month title in Korean and English", () => {
    expect(monthTitle(2026, 9, "ko", ko.months)).toBe("2026년 10월");
    expect(monthTitle(2026, 9, "en", en.months)).toBe("October 2026");
  });
});
