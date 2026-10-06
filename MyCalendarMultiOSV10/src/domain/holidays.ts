import { FALLBACK_COUNTRIES, KOREAN_COUNTRY_NAMES, type Country } from "./countries";
import type { Language } from "./messages";

export interface Holiday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  types: string[];
}

export interface YearBundle {
  holidays: Holiday[];
  fetchedAt: number;
  fromCache: boolean;
}

const FRESH_MS = 10 * 60 * 1000;
const CACHE_PREFIX = "mycalendar.holidays.v1";

export function holidayUrl(country: string, year: number): string {
  return `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
}

export function countriesUrl(): string {
  return "https://date.nager.at/api/v3/AvailableCountries";
}

export function isDisplayedHoliday(holiday: Pick<Holiday, "types">): boolean {
  if (!holiday.types || holiday.types.length === 0) return true;
  return holiday.types.includes("Public") || holiday.types.includes("Bank");
}

export function holidayTitle(holiday: Pick<Holiday, "localName" | "name">, language: Language): string {
  if (language === "ko") return holiday.localName || holiday.name;
  return holiday.name || holiday.localName;
}

function parseHoliday(value: unknown): Holiday | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
  if (typeof item.name !== "string" || typeof item.localName !== "string") return null;
  const types = Array.isArray(item.types) ? item.types.filter((type): type is string => typeof type === "string") : [];
  return {
    date: item.date,
    localName: item.localName,
    name: item.name,
    countryCode: typeof item.countryCode === "string" ? item.countryCode : "",
    types,
  };
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, timeout]),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchHolidays(country: string, year: number, signal: AbortSignal): Promise<Holiday[]> {
  if (!/^[A-Z]{2}$/.test(country) || year < 1970 || year > 2100) {
    throw new Error("invalid request");
  }
  const data = await fetchJson(holidayUrl(country, year), signal);
  if (!Array.isArray(data)) throw new Error("invalid holiday payload");
  return data.map(parseHoliday).filter((holiday): holiday is Holiday => holiday !== null);
}

function cacheKey(country: string, year: number): string {
  return `${CACHE_PREFIX}.${country}.${year}`;
}

function readCache(country: string, year: number): { holidays: Holiday[]; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(country, year));
    if (!raw) return null;
    const data = JSON.parse(raw) as { holidays?: unknown; fetchedAt?: unknown };
    if (!Array.isArray(data.holidays) || typeof data.fetchedAt !== "number") return null;
    const holidays = data.holidays.map(parseHoliday).filter((holiday): holiday is Holiday => holiday !== null);
    return { holidays, fetchedAt: data.fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(country: string, year: number, holidays: Holiday[], fetchedAt: number): void {
  try {
    localStorage.setItem(cacheKey(country, year), JSON.stringify({ holidays, fetchedAt }));
  } catch {
    // The calendar still shows the live result when storage is unavailable.
  }
}

export function requestHolidayRefresh(): void {
  try {
    localStorage.setItem("mycalendar.holiday-refresh", String(Date.now()));
  } catch {
    // Same-window listeners still run below.
  }
  window.dispatchEvent(new Event("mycalendar-refresh-holidays"));
}

export async function loadYear(country: string, year: number, signal: AbortSignal, force: boolean): Promise<YearBundle> {
  const cached = readCache(country, year);
  if (!force && cached && Date.now() - cached.fetchedAt < FRESH_MS) {
    return { ...cached, fromCache: false };
  }
  try {
    const holidays = await fetchHolidays(country, year, signal);
    const fetchedAt = Date.now();
    writeCache(country, year, holidays, fetchedAt);
    return { holidays, fetchedAt, fromCache: false };
  } catch (error) {
    if (signal.aborted) throw error;
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}

let countryRequest: Promise<{ countries: Country[]; live: boolean }> | null = null;

export function clearCountriesCache(): void {
  countryRequest = null;
}

export function loadCountries(): Promise<{ countries: Country[]; live: boolean }> {
  if (!countryRequest) {
    const signal = AbortSignal.timeout(15000);
    countryRequest = fetchJson(countriesUrl(), signal)
      .then((data) => {
        if (!Array.isArray(data)) return { countries: FALLBACK_COUNTRIES, live: false };
        const countries = data
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            if (typeof row.countryCode !== "string" || typeof row.name !== "string") return null;
            const code = row.countryCode.toUpperCase();
            if (!/^[A-Z]{2}$/.test(code)) return null;
            return { code, en: row.name, ko: KOREAN_COUNTRY_NAMES[code] ?? row.name };
          })
          .filter((country): country is Country => country !== null);
        const unique = [...new Map(countries.map((country) => [country.code, country])).values()];
        if (unique.length === 0) return { countries: FALLBACK_COUNTRIES, live: false };
        return { countries: unique, live: true };
      })
      .catch(() => ({ countries: FALLBACK_COUNTRIES, live: false }));
  }
  return countryRequest;
}
