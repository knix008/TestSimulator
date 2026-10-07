export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function shiftDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

export function addMonths(date: Date, delta: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

export function buildMonthGrid(year: number, month: number, weekStartsOn: number): Date[] {
  const firstDow = new Date(year, month, 1).getDay();
  const offset = (firstDow - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
  });
}

export const CALENDAR_WEEKS = 5;

/** Five fixed weeks; days of a sixth week share the cell of the same weekday in the fifth week. */
export function buildMonthWeeks(year: number, month: number, weekStartsOn: number): Date[][] {
  const grid = buildMonthGrid(year, month, weekStartsOn);
  const size = CALENDAR_WEEKS * 7;
  return grid.slice(0, size).map((date, index) => {
    const overflow = grid[index + 7];
    return index >= size - 7 && overflow.getMonth() === month ? [date, overflow] : [date];
  });
}

export function weekdayLabels(labels: string[], weekStartsOn: number): string[] {
  return [...labels.slice(weekStartsOn), ...labels.slice(0, weekStartsOn)];
}

/** Ways to write the year and month in the calendar's title bar; each language keeps its own choice. */
export const MONTH_TITLE_FORMATS = {
  ko: ["ko-long", "ko-short-year", "ko-hanja", "ko-dot", "ko-compact", "ko-dash", "ko-slash", "ko-month"],
  en: ["en-long", "en-short", "en-apostrophe", "en-upper", "en-slash", "en-dot", "en-dash", "en-month"],
} as const;
export type KoMonthTitleFormat = (typeof MONTH_TITLE_FORMATS.ko)[number];
export type EnMonthTitleFormat = (typeof MONTH_TITLE_FORMATS.en)[number];
export type MonthTitleFormat = KoMonthTitleFormat | EnMonthTitleFormat;
export type MonthTitleFormats = { ko: KoMonthTitleFormat; en: EnMonthTitleFormat };
export const DEFAULT_MONTH_TITLE_FORMATS: MonthTitleFormats = { ko: "ko-long", en: "en-long" };

export function normalizeMonthTitleFormats(value: unknown): MonthTitleFormats {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pick = <T extends string>(options: readonly T[], candidate: unknown, fallback: T): T =>
    options.includes(candidate as T) ? (candidate as T) : fallback;
  return {
    ko: pick(MONTH_TITLE_FORMATS.ko, input.ko, DEFAULT_MONTH_TITLE_FORMATS.ko),
    en: pick(MONTH_TITLE_FORMATS.en, input.en, DEFAULT_MONTH_TITLE_FORMATS.en),
  };
}

/** `month` is 0-based; a format from the other language falls back to this language's default. */
export function monthTitle(
  year: number,
  month: number,
  language: "ko" | "en",
  monthNames: string[],
  format: MonthTitleFormat = DEFAULT_MONTH_TITLE_FORMATS[language],
): string {
  const m = month + 1;
  const mm = String(m).padStart(2, "0");
  const yy = String(year % 100).padStart(2, "0");
  if (language === "ko") {
    switch (format) {
      case "ko-short-year":
        return `${yy}년 ${m}월`;
      case "ko-hanja":
        return `${year}年 ${m}月`;
      case "ko-dot":
        return `${year}. ${m}.`;
      case "ko-compact":
        return `${year}.${mm}`;
      case "ko-dash":
        return `${year}-${mm}`;
      case "ko-slash":
        return `${year}/${mm}`;
      case "ko-month":
        return `${m}월`;
      default:
        return `${year}년 ${m}월`;
    }
  }
  const name = monthNames[month];
  const short = name.slice(0, 3);
  switch (format) {
    case "en-short":
      return `${short} ${year}`;
    case "en-apostrophe":
      return `${short} '${yy}`;
    case "en-upper":
      return `${short.toUpperCase()} ${year}`;
    case "en-slash":
      return `${mm}/${year}`;
    case "en-dot":
      return `${mm}.${year}`;
    case "en-dash":
      return `${year}-${mm}`;
    case "en-month":
      return name;
    default:
      return `${name} ${year}`;
  }
}
