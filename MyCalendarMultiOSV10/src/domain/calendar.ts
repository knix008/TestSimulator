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

export function monthTitle(year: number, month: number, language: "ko" | "en", monthNames: string[]): string {
  if (language === "ko") return `${year}년 ${monthNames[month]}`;
  return `${monthNames[month]} ${year}`;
}
