import { describe, expect, it } from "vitest";
import { en } from "../src/domain/en";
import { ko } from "../src/domain/ko";
import { dayNote, lunarSupported, solarTermIndex, solarTermTime, solarTermsOf, toLunar } from "../src/domain/lunar";

describe("Lunar", () => {
  it("converts solar days to the Korean lunar calendar, including leap months", () => {
    expect(lunarSupported()).toBe(true);
    expect(toLunar(new Date(2026, 9, 6))).toEqual({ month: 8, day: 26, leap: false });
    expect(toLunar(new Date(2026, 8, 25))).toEqual({ month: 8, day: 15, leap: false });
    expect(toLunar(new Date(2026, 1, 17))).toEqual({ month: 1, day: 1, leap: false });
    expect(toLunar(new Date(2025, 6, 25))).toEqual({ month: 6, day: 1, leap: true });
    expect(toLunar(new Date(2023, 2, 22))).toEqual({ month: 2, day: 1, leap: true });
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
