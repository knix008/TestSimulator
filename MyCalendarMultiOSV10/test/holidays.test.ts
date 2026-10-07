import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCountriesCache, countriesUrl, fetchHolidays, holidayTitle, holidayUrl, isDisplayedHoliday, loadCountries, loadYear, requestHolidayRefresh } from "../src/domain/holidays";
import { builtinCountryCodes, builtinHolidays } from "../src/domain/builtinHolidays";
import { FALLBACK_COUNTRIES } from "../src/domain/countries";
import type { Holiday } from "../src/domain/holidays";
import { currentMonthDate } from "./network";

describe("Holidays", () => {
  afterEach(() => {
    clearCountriesCache();
  });

  it("shows public and bank holidays and hides observances", () => {
    expect(isDisplayedHoliday({ types: ["Public"] })).toBe(true);
    expect(isDisplayedHoliday({ types: ["Bank"] })).toBe(true);
    expect(isDisplayedHoliday({ types: ["Observance"] })).toBe(false);
    expect(isDisplayedHoliday({ types: [] })).toBe(true);
  });

  it("uses the local name in Korean and the English name in English", () => {
    const holiday = { localName: "개천절", name: "National Foundation Day" };
    expect(holidayTitle(holiday, "ko")).toBe("개천절");
    expect(holidayTitle(holiday, "en")).toBe("National Foundation Day");
    expect(holidayTitle({ localName: "", name: "Hangul Day" }, "ko")).toBe("Hangul Day");
  });

  it("requests the live Nager.Date holiday feed for a country and year", () => {
    expect(holidayUrl("KR", 2026)).toBe("https://date.nager.at/api/v3/PublicHolidays/2026/KR");
    expect(countriesUrl()).toBe("https://date.nager.at/api/v3/AvailableCountries");
  });

  it("rejects an invalid country or year before calling the network", async () => {
    const fetchMock = vi.mocked(fetch);
    await expect(fetchHolidays("Korea", 2026, new AbortController().signal)).rejects.toThrow("invalid request");
    await expect(fetchHolidays("KR", 1800, new AbortController().signal)).rejects.toThrow("invalid request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps valid holidays and drops malformed rows", async () => {
    const holidays = await fetchHolidays("KR", 2026, new AbortController().signal);
    expect(holidays.map((holiday) => holiday.name)).toEqual(["Foundation Day", "Hangul Day", "Observance Day"]);
    expect(holidays[0]?.date).toBe(currentMonthDate(5, 2026));
  });

  it("uses a fresh cache without calling the network again", async () => {
    const signal = new AbortController().signal;
    const first = await loadYear("KR", 2026, signal, false);
    const calls = vi.mocked(fetch).mock.calls.length;
    const second = await loadYear("KR", 2026, signal, false);
    expect(second.holidays).toEqual(first.holidays);
    expect(second.fromCache).toBe(false);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });

  it("refreshes a fresh cache when the user asks to check again", async () => {
    const signal = new AbortController().signal;
    await loadYear("US", 2026, signal, false);
    const calls = vi.mocked(fetch).mock.calls.length;
    const refreshed = await loadYear("US", 2026, signal, true);
    expect(refreshed.fromCache).toBe(false);
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(calls);
  });

  it("shows the last saved holidays when the network fails", async () => {
    const signal = new AbortController().signal;
    await loadYear("JP", 2026, signal, true);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    localStorage.setItem(
      "mycalendar.holidays.v1.JP.2026",
      JSON.stringify({
        holidays: [
          {
            date: "2026-01-01",
            localName: "元日",
            name: "New Year's Day",
            countryCode: "JP",
            types: ["Public"],
          },
        ],
        fetchedAt: Date.now() - 11 * 60 * 1000,
      }),
    );
    const cached = await loadYear("JP", 2026, signal, true);
    expect(cached.fromCache).toBe(true);
    expect(cached.holidays[0]?.name).toBe("New Year's Day");
  });

  it("computes built-in holidays when there is no cache and the network is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const bundle = await loadYear("DE", 2026, new AbortController().signal, true);
    expect(bundle.builtin).toBe(true);
    expect(bundle.fromCache).toBe(true);
    expect(bundle.fetchedAt).toBe(0);
    expect(bundle.holidays.find((holiday) => holiday.date === "2026-10-03")).toMatchObject({
      localName: "Tag der Deutschen Einheit",
      name: "National Holiday",
      countryCode: "DE",
      types: ["Public"],
    });
  });

  it("fails when neither the network, a cache, nor the built-in rules have the country", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    await expect(loadYear("ZZ", 2026, new AbortController().signal, true)).rejects.toThrow("offline");
  });

  it("has built-in Korean holidays including the three-day Seollal and Chuseok breaks and substitute days", async () => {
    const days = (holidays: Holiday[], name: string) =>
      holidays.filter((holiday) => holiday.localName === name).map((holiday) => holiday.date);
    const y2026 = await builtinHolidays("KR", 2026);
    expect(days(y2026, "설날")).toEqual(["2026-02-16", "2026-02-17", "2026-02-18"]);
    expect(days(y2026, "추석")).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
    expect(y2026.find((holiday) => holiday.date === "2026-03-02")?.localName).toMatch(/대체공휴일/);
    expect(y2026.find((holiday) => holiday.date === "2026-10-09")).toMatchObject({ localName: "한글날", name: "Hangul Day" });
    const y2025 = await builtinHolidays("KR", 2025);
    expect(days(y2025, "설날")).toEqual(["2025-01-28", "2025-01-29", "2025-01-30"]);
    const y2027 = await builtinHolidays("KR", 2027);
    expect(days(y2027, "설날")).toEqual(["2027-02-06", "2027-02-07", "2027-02-08"]);
    expect(days(y2027, "설날 (대체공휴일)")).toEqual(["2027-02-09"]);
  });

  it("has built-in holidays for many countries", async () => {
    const codes = await builtinCountryCodes();
    expect(codes.length).toBeGreaterThan(150);
    for (const [country, date] of [
      ["US", "2026-07-04"],
      ["JP", "2026-01-01"],
      ["CN", "2026-10-01"],
      ["GB", "2026-12-25"],
      ["FR", "2026-07-14"],
      ["BR", "2026-09-07"],
      ["IN", "2026-01-26"],
      ["AU", "2026-01-26"],
    ]) {
      const holidays = await builtinHolidays(country, 2026);
      expect(holidays.some((holiday) => holiday.date === date && isDisplayedHoliday(holiday)), `${country} ${date}`).toBe(true);
    }
    expect(await builtinHolidays("ZZ", 2026)).toEqual([]);
  });

  it("notifies open calendars to refresh holidays", () => {
    let heard = 0;
    const onRefresh = () => {
      heard += 1;
    };
    window.addEventListener("mycalendar-refresh-holidays", onRefresh);
    requestHolidayRefresh();
    window.removeEventListener("mycalendar-refresh-holidays", onRefresh);
    expect(heard).toBe(1);
    expect(localStorage.getItem("mycalendar.holiday-refresh")).toMatch(/^\d+$/);
  });

  it("loads the live country list and keeps Korean names", async () => {
    const result = await loadCountries();
    expect(result.live).toBe(true);
    expect(result.countries.find((country) => country.code === "KR")).toMatchObject({
      en: "South Korea",
      ko: "대한민국",
    });
    const unknown = result.countries.find((country) => country.code === "ZZ");
    expect(unknown?.ko).not.toBe("Zedland");
    expect(unknown?.ko === "ZZ" || /[가-힣]/.test(unknown?.ko ?? "")).toBe(true);
    expect(unknown?.en).not.toMatch(/[가-힣]/);
    expect(new Set(result.countries.map((country) => country.code)).size).toBe(result.countries.length);
    const again = await loadCountries();
    expect(again).toBe(result);
  });

  it("falls back to the offline country list when the feed is unusable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false })));
    const result = await loadCountries();
    expect(result.live).toBe(false);
    expect(result.countries.some((country) => country.code === "KR")).toBe(true);
  });

  it("offers every built-in country offline with its own English and Korean name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const result = await loadCountries();
    const codes = new Set(result.countries.map((country) => country.code));
    expect(codes.size).toBe(result.countries.length);
    expect((await builtinCountryCodes()).every((code) => codes.has(code))).toBe(true);
    expect(result.countries.find((country) => country.code === "IN")).toMatchObject({ en: "India", ko: "인도" });
    expect(new Set(FALLBACK_COUNTRIES.map((country) => country.code))).toEqual(codes);
  });

  it("never mixes English and Korean in country names", () => {
    expect(FALLBACK_COUNTRIES.length).toBeGreaterThanOrEqual(226);
    for (const country of FALLBACK_COUNTRIES) {
      expect(country.ko, country.code).toMatch(/^[가-힣 ·()-]+$/);
      expect(country.en, country.code).not.toMatch(/[가-힣]/);
      expect(country.en, country.code).toMatch(/^[\p{Script=Latin}][\p{Script=Latin}\p{Zs}.,'()-]*$/u);
    }
  });

  it("uses the built-in names for countries from the live feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ countryCode: "AG", name: "Antigua and Barbuda" }, { countryCode: "dz", name: "Algeria" }])));
    const result = await loadCountries();
    expect(result.countries.find((country) => country.code === "AG")).toMatchObject({ en: "Antigua and Barbuda", ko: "앤티가 바부다" });
    expect(result.countries.find((country) => country.code === "DZ")).toMatchObject({ en: "Algeria", ko: "알제리" });
  });
});
