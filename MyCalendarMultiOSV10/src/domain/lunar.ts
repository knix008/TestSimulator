import { formatISODate } from "./calendar";
import type { Messages } from "./messages";

export interface LunarDate {
  month: number;
  day: number;
  leap: boolean;
}

const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2_440_587.5;
const KST_OFFSET_MS = 9 * 3_600_000;

let lunarFormatter: Intl.DateTimeFormat | null | undefined;

function getLunarFormatter(): Intl.DateTimeFormat | null {
  if (lunarFormatter !== undefined) return lunarFormatter;
  lunarFormatter = null;
  for (const calendar of ["dangi", "chinese"]) {
    try {
      const formatter = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, { month: "numeric", day: "numeric", timeZone: "UTC" });
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

/** Korean lunar (dangi) date of a local calendar day, or null when the runtime has no lunar calendar. */
export function toLunar(date: Date): LunarDate | null {
  const formatter = getLunarFormatter();
  if (!formatter) return null;
  const parts = formatter.formatToParts(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const monthNumber = Number.parseInt(month, 10);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(day)) return null;
  return { month: monthNumber, day, leap: month.replace(/^\d+/, "") !== "" };
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
  const full = lunar
    ? copy.lunarFull
        .replace("{leap}", lunar.leap ? copy.lunarLeapMark : "")
        .replace("{month}", String(lunar.month))
        .replace("{day}", String(lunar.day))
    : "";
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
