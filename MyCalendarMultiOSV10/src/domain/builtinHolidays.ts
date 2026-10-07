import type HolidaysParser from "date-holidays-parser";
import { loadHolidayRules } from "./holidayRules";
import type { Holiday } from "./holidays";

const DAY_MS = 24 * 60 * 60 * 1000;

const TYPE_NAMES: Record<string, string> = {
  public: "Public",
  bank: "Bank",
  optional: "Optional",
  school: "School",
  observance: "Observance",
};

type Engine = new (country?: string) => HolidaysParser;
let engine: Promise<Engine> | null = null;

/** The rules for about 200 countries are large, so they load only when the built-in holidays are needed. */
function loadEngine(): Promise<Engine> {
  engine ??= Promise.all([import("date-holidays-parser"), loadHolidayRules()]).then(
    ([{ default: Parser }, rules]) =>
      class extends Parser {
        constructor(country?: string) {
          if (country === undefined) super(rules);
          else super(rules, country);
        }
      },
  );
  engine.catch(() => {
    engine = null;
  });
  return engine;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export async function builtinCountryCodes(): Promise<string[]> {
  const Holidays = await loadEngine();
  return Object.keys(new Holidays().getCountries());
}

/** Holidays computed on the device from built-in rules, used when the live service cannot be reached. */
export async function builtinHolidays(country: string, year: number): Promise<Holiday[]> {
  const Holidays = await loadEngine();
  if (!(country in new Holidays().getCountries())) return [];
  const calendar = new Holidays(country);
  // Asking for English switches the instance's language, so the local names have to be read first.
  const local = calendar.getHolidays(year);
  const english = new Map(calendar.getHolidays(year, "en").map((holiday) => [`${holiday.date}|${holiday.rule}`, holiday.name]));
  const result: Holiday[] = [];
  for (const holiday of local) {
    let first = holiday.date.slice(0, 10);
    const days = Math.max(1, Math.round((holiday.end.getTime() - holiday.start.getTime()) / DAY_MS));
    // The rule data starts Seollal on lunar New Year's Day, but the three days off run from the eve to the day after.
    if (country === "KR" && !holiday.substitute && holiday.rule.startsWith("korean 01-0-01")) first = addDays(first, -1);
    const name = english.get(`${holiday.date}|${holiday.rule}`) ?? holiday.name;
    for (let offset = 0; offset < days; offset += 1) {
      result.push({
        date: addDays(first, offset),
        localName: holiday.name,
        name,
        countryCode: country,
        types: [TYPE_NAMES[holiday.type] ?? holiday.type],
      });
    }
  }
  return result;
}
