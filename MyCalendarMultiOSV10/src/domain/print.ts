import { buildMonthGrid } from "./calendar";

export const PAPERS = {
  a4: { label: "A4", width: 210, height: 297 },
  a3: { label: "A3", width: 297, height: 420 },
  a5: { label: "A5", width: 148, height: 210 },
  b5: { label: "B5", width: 182, height: 257 },
  letter: { label: "Letter", width: 215.9, height: 279.4 },
  legal: { label: "Legal", width: 215.9, height: 355.6 },
} as const;
export type Paper = keyof typeof PAPERS;
export const PAPER_IDS = Object.keys(PAPERS) as Paper[];

export const ORIENTATIONS = ["portrait", "landscape"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Margins in millimetres. */
export const MARGINS = { none: 0, narrow: 6, normal: 12, wide: 20 } as const;
export type Margin = keyof typeof MARGINS;
export const MARGIN_IDS = Object.keys(MARGINS) as Margin[];

export const MAX_PRINT_MONTHS = 12;

export interface PrintOptions {
  paper: Paper;
  orientation: Orientation;
  margin: Margin;
  months: number;
  cellEvents: boolean;
  eventList: boolean;
  holidayNames: boolean;
  lunar: boolean;
  grayscale: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paper: "a4",
  orientation: "landscape",
  margin: "normal",
  months: 1,
  cellEvents: true,
  eventList: false,
  holidayNames: true,
  lunar: true,
  grayscale: false,
};

const OPTIONS_KEY = "mycalendar.print.v1";
/** The calendar asks the print window for the month it shows; the window may already be open in another webview. */
export const PRINT_REQUEST_KEY = "mycalendar.print-request";

export function normalizePrintOptions(input: Partial<PrintOptions> | null | undefined): PrintOptions {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  const months = Number(input?.months);
  const flag = (key: keyof PrintOptions) =>
    typeof input?.[key] === "boolean" ? (input[key] as boolean) : (DEFAULT_PRINT_OPTIONS[key] as boolean);
  return {
    paper: pick(input?.paper, PAPER_IDS, DEFAULT_PRINT_OPTIONS.paper),
    orientation: pick(input?.orientation, ORIENTATIONS, DEFAULT_PRINT_OPTIONS.orientation),
    margin: pick(input?.margin, MARGIN_IDS, DEFAULT_PRINT_OPTIONS.margin),
    months: Number.isFinite(months) ? Math.min(MAX_PRINT_MONTHS, Math.max(1, Math.round(months))) : 1,
    cellEvents: flag("cellEvents"),
    eventList: flag("eventList"),
    holidayNames: flag("holidayNames"),
    lunar: flag("lunar"),
    grayscale: flag("grayscale"),
  };
}

export function readPrintOptions(): PrintOptions {
  try {
    return normalizePrintOptions(JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "null"));
  } catch {
    return DEFAULT_PRINT_OPTIONS;
  }
}

export function writePrintOptions(options: PrintOptions): void {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
}

export function requestPrintMonth(year: number, month: number): void {
  localStorage.setItem(PRINT_REQUEST_KEY, `${year}-${month}:${Date.now()}`);
}

export function parsePrintRequest(value: string | null): { year: number; month: number } | null {
  const match = value?.match(/^(\d{4})-(\d{1,2}):/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 0 && month <= 11 ? { year: Number(match[1]), month } : null;
}

/** Page size in millimetres after the orientation is applied. */
export function pageSize(options: Pick<PrintOptions, "paper" | "orientation">): { width: number; height: number } {
  const { width, height } = PAPERS[options.paper];
  return options.orientation === "landscape" ? { width: height, height: width } : { width, height };
}

/** Value for the CSS `@page` rule; the margin is drawn inside each page so the preview matches the paper. */
export function pageRule(options: Pick<PrintOptions, "paper" | "orientation">): string {
  const { width, height } = pageSize(options);
  return `@page { size: ${width}mm ${height}mm; margin: 0; }`;
}

/** Only as many weeks as the month touches, so a printed page never carries an empty row. */
export function printWeeks(year: number, month: number, weekStartsOn: number): Date[][] {
  const grid = buildMonthGrid(year, month, weekStartsOn);
  const weeks: Date[][] = [];
  for (let index = 0; index < grid.length; index += 7) {
    const week = grid.slice(index, index + 7);
    if (week.some((date) => date.getMonth() === month)) weeks.push(week);
  }
  return weeks;
}

export function printMonths(year: number, month: number, count: number): Array<{ year: number; month: number }> {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month + index, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
}
