import { describe, expect, it } from "vitest";
import { countryName, FALLBACK_COUNTRIES, sortCountries } from "../src/domain/countries";

describe("Countries", () => {
  it("includes Korea and does not repeat country codes", () => {
    expect(FALLBACK_COUNTRIES.some((country) => country.code === "KR" && country.ko === "대한민국")).toBe(true);
    expect(FALLBACK_COUNTRIES.some((country) => country.code === "US" && country.en === "United States")).toBe(true);
    expect(new Set(FALLBACK_COUNTRIES.map((country) => country.code)).size).toBe(FALLBACK_COUNTRIES.length);
    expect(FALLBACK_COUNTRIES.every((country) => /^[A-Z]{2}$/.test(country.code))).toBe(true);
  });

  it("shows the Korean or English country name for the active language", () => {
    const korea = FALLBACK_COUNTRIES.find((country) => country.code === "KR");
    expect(korea).toBeDefined();
    expect(countryName(korea!, "ko")).toBe("대한민국");
    expect(countryName(korea!, "en")).toBe("South Korea");
  });

  it("sorts countries by the active language", () => {
    const sample = FALLBACK_COUNTRIES.filter((country) => ["KR", "JP", "US"].includes(country.code));
    expect(sortCountries(sample, "en").map((country) => country.code)).toEqual(["JP", "KR", "US"]);
    expect(sortCountries(sample, "ko").map((country) => country.ko)).toEqual([...sample.map((country) => country.ko)].sort((a, b) => a.localeCompare(b, "ko")));
  });
});
