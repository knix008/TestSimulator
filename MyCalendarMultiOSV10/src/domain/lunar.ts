import { formatISODate } from "./calendar";
import type { Messages } from "./messages";

export interface LunarDate {
  /** Gregorian year the lunar year is named after; its first day always falls in that year. */
  year: number;
  month: number;
  day: number;
  leap: boolean;
}

/** Lunar years the helpers below resolve; the Intl lunar calendars cover this range. */
export const LUNAR_YEAR_MIN = 1800;
export const LUNAR_YEAR_MAX = 2200;

const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2_440_587.5;
const KST_OFFSET_MS = 9 * 3_600_000;

let lunarFormatter: Intl.DateTimeFormat | null | undefined;

function getLunarFormatter(): Intl.DateTimeFormat | null {
  if (lunarFormatter !== undefined) return lunarFormatter;
  lunarFormatter = null;
  for (const calendar of ["dangi", "chinese"]) {
    try {
      const formatter = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        timeZone: "UTC",
      });
      if (formatter.resolvedOptions().calendar === calendar) {
        lunarFormatter = formatter;
        break;
      }
    } catch {
      // Calendar not available in this runtime.
    }
  }
  return lunarFormatter;
}

function convertToLunar(date: Date): LunarDate | null {
  const formatter = getLunarFormatter();
  if (!formatter) return null;
  const parts = formatter.formatToParts(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const monthNumber = Number.parseInt(month, 10);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(day)) return null;
  // "relatedYear" is the Gregorian year a lunar year is named after; TypeScript's part types omit it.
  const related = Number(parts.find((part) => (part.type as string) === "relatedYear")?.value);
  // A lunar year starts between late January and late February, so without relatedYear only the
  // late months of a lunar year can sit in the next solar year.
  const year = Number.isFinite(related)
    ? related
    : date.getFullYear() - (monthNumber >= 11 && date.getMonth() <= 1 ? 1 : 0);
  return { year, month: monthNumber, day, leap: month.replace(/^\d+/, "") !== "" };
}

const dateCache = new Map<string, LunarDate | null>();

/** Korean lunar (dangi) date of a local calendar day, or null when the runtime has no lunar calendar. */
export function toLunar(date: Date): LunarDate | null {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const cached = dateCache.get(key);
  if (cached !== undefined) return cached;
  const converted = convertToLunar(date);
  dateCache.set(key, converted);
  return converted;
}

export interface LunarMonth {
  month: number;
  leap: boolean;
  /** Local date of the first day of the lunar month. */
  day1: Date;
  /** 29 or 30 days. */
  length: number;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Local date of lunar 1/1; the lunar new year falls between January 21 and February 21. */
function lunarNewYear(year: number): Date | null {
  for (let offset = 0; offset < 40; offset += 1) {
    const day = new Date(year, 0, 20 + offset);
    const lunar = toLunar(day);
    if (lunar && lunar.year === year && lunar.month === 1 && lunar.day === 1 && !lunar.leap) return day;
  }
  return null;
}

const monthsCache = new Map<number, LunarMonth[]>();

/** The 12 or 13 months of a lunar year in order; empty when the year is out of range or has no lunar calendar. */
export function lunarMonths(year: number): LunarMonth[] {
  const cached = monthsCache.get(year);
  if (cached) return cached;
  const months: LunarMonth[] = [];
  if (Number.isInteger(year) && year >= LUNAR_YEAR_MIN && year <= LUNAR_YEAR_MAX) {
    let day1 = lunarNewYear(year);
    while (day1) {
      const lunar = toLunar(day1);
      if (!lunar || lunar.year !== year) break;
      const length = toLunar(addDays(day1, 29))?.day === 30 ? 30 : 29;
      months.push({ month: lunar.month, leap: lunar.leap, day1, length });
      day1 = addDays(day1, length);
    }
  }
  monthsCache.set(year, months);
  return months;
}

/** The month a lunar date lands in: the leap month when that year has one, otherwise the plain month. */
export function lunarMonthOf(year: number, month: number, leap = false): LunarMonth | null {
  const months = lunarMonths(year);
  const wanted = leap ? months.find((item) => item.month === month && item.leap) : undefined;
  return wanted ?? months.find((item) => item.month === month && !item.leap) ?? null;
}

/** Local date of a lunar date; day 30 of a 29-day month lands on its last day. Null when it cannot be resolved. */
export function fromLunar(lunar: LunarDate): Date | null {
  if (!Number.isInteger(lunar.day) || lunar.day < 1 || lunar.day > 30) return null;
  const month = lunarMonthOf(lunar.year, lunar.month, lunar.leap);
  return month ? addDays(month.day1, Math.min(lunar.day, month.length) - 1) : null;
}

/** Length of the lunar month a lunar date sits in, or null when its year is out of range. */
export function lunarMonthLength(lunar: LunarDate): number | null {
  const month = lunarMonths(lunar.year).find((item) => item.month === lunar.month && item.leap === lunar.leap);
  return month?.length ?? null;
}

/** Mean length of a lunar month; a month start is a new moon, so rounding the ratio is exact. */
const SYNODIC_MONTH_DAYS = 29.530_588_853;

/** Whole lunar months from the month of `from` to the month of `to`, negative when `to` comes first. */
export function lunarMonthsBetween(from: Date, to: Date): number | null {
  const start = toLunar(from);
  const end = toLunar(to);
  if (!start || !end) return null;
  const firstFrom = addDays(from, 1 - start.day);
  const firstTo = addDays(to, 1 - end.day);
  const days = Math.round(
    (Date.UTC(firstTo.getFullYear(), firstTo.getMonth(), firstTo.getDate()) -
      Date.UTC(firstFrom.getFullYear(), firstFrom.getMonth(), firstFrom.getDate())) /
      DAY_MS,
  );
  return Math.round(days / SYNODIC_MONTH_DAYS);
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Apparent geocentric longitude of the Sun in degrees (Meeus, Astronomical Algorithms, ch. 25). */
export function solarLongitude(julianEphemerisDay: number): number {
  const t = (julianEphemerisDay - 2_451_545) / 36_525;
  const meanLongitude = 280.46646 + 36_000.76983 * t + 0.0003032 * t * t;
  const meanAnomaly = toRadians(357.52911 + 35_999.05029 * t - 0.0001537 * t * t);
  const center =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly) +
    0.000289 * Math.sin(3 * meanAnomaly);
  const omega = toRadians(125.04 - 1_934.136 * t);
  return normalizeDegrees(meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega));
}

/** Solar terms in order from 소한 (285°) to 동지 (270°); index k sits at longitude 285 + 15k. */
export const SOLAR_TERM_COUNT = 24;

function deltaTSeconds(year: number): number {
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

/** Moment (UTC ms) when the Sun reaches the longitude of solar term `index` in `year`. */
export function solarTermTime(year: number, index: number): number {
  const target = normalizeDegrees(285 + 15 * index);
  let jd = (Date.UTC(year, 0, 6) - 0) / DAY_MS + UNIX_EPOCH_JD + index * 15.218;
  for (let step = 0; step < 8; step += 1) {
    const diff = ((target - solarLongitude(jd) + 540) % 360) - 180;
    jd += (diff * 365.2422) / 360;
  }
  return (jd - UNIX_EPOCH_JD) * DAY_MS - deltaTSeconds(year) * 1000;
}

const termCache = new Map<number, Map<string, number>>();

/** ISO date (Korea Standard Time) → solar term index for every term in `year`. */
export function solarTermsOf(year: number): Map<string, number> {
  const cached = termCache.get(year);
  if (cached) return cached;
  const terms = new Map<string, number>();
  for (let index = 0; index < SOLAR_TERM_COUNT; index += 1) {
    const kst = new Date(solarTermTime(year, index) + KST_OFFSET_MS);
    terms.set(formatISODate(new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate())), index);
  }
  termCache.set(year, terms);
  return terms;
}

export function solarTermIndex(date: Date): number | null {
  return solarTermsOf(date.getFullYear()).get(formatISODate(date)) ?? null;
}

type LunarCopy = Pick<Messages, "lunarShort" | "lunarLeapShort" | "lunarFull" | "lunarLeapMark" | "solarTerms">;

/** "음력 8월 26일" / "Lunar 8/26". */
export function formatLunar(lunar: LunarDate, copy: Pick<Messages, "lunarFull" | "lunarLeapMark">): string {
  return copy.lunarFull
    .replace("{leap}", lunar.leap ? copy.lunarLeapMark : "")
    .replace("{month}", String(lunar.month))
    .replace("{day}", String(lunar.day));
}

/** "8월" or "윤8월" for a month picker. */
export function lunarMonthLabel(
  month: Pick<LunarMonth, "month" | "leap">,
  copy: Pick<Messages, "lunarMonthName" | "lunarLeapMonthName">,
): string {
  return (month.leap ? copy.lunarLeapMonthName : copy.lunarMonthName).replace("{month}", String(month.month));
}

export interface DayNote {
  /** Short text under the day number, or null when the day shows nothing. */
  cell: string | null;
  /** Full description for the selected-day line and screen readers. */
  full: string;
  term: string | null;
}

/** Lunar date and solar term for a day. The cell text appears only on lunar or solar month starts and on solar terms. */
export function dayNote(date: Date, copy: LunarCopy): DayNote {
  const lunar = toLunar(date);
  const termIndex = solarTermIndex(date);
  const term = termIndex === null ? null : copy.solarTerms[termIndex];
  const monthStart = lunar !== null && (lunar.day === 1 || date.getDate() === 1);
  const short = lunar && monthStart ? `${lunar.leap ? copy.lunarLeapShort : copy.lunarShort} ${lunar.month}.${lunar.day}` : null;
  const full = lunar ? formatLunar(lunar, copy) : "";
  const cellParts = [short, term].filter((part): part is string => Boolean(part));
  return {
    cell: cellParts.length ? cellParts.join(" · ") : null,
    full: [full, term].filter(Boolean).join(" · "),
    term,
  };
}

export function lunarSupported(): boolean {
  return getLunarFormatter() !== null;
}
