import { formatISODate, parseISODate } from "./calendar";

export type Repeat = "none" | "weekly" | "monthly" | "yearly";

export const REPEATS: Repeat[] = ["none", "weekly", "monthly", "yearly"];

export const EVENT_COLORS = ["#3d7dff", "#12a594", "#30a46c", "#ffb224", "#f76b15", "#e5484d", "#d6409f", "#8e4ec6"] as const;

export const MAX_INTERVAL = 99;

/** Minutes before the start a reminder pops up; 0 means at the start time. */
export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080] as const;

export type Reminder = (typeof REMINDER_OPTIONS)[number] | null;

export function isReminder(value: unknown): value is Exclude<Reminder, null> {
  return typeof value === "number" && (REMINDER_OPTIONS as readonly number[]).includes(value);
}

/** All-day events are reminded relative to this time of day. */
export const ALL_DAY_REMINDER_TIME = "09:00";

export interface CalendarEvent {
  id: string;
  title: string;
  /** First occurrence, YYYY-MM-DD. */
  date: string;
  /** HH:MM, or empty for an all-day event. */
  time: string;
  repeat: Repeat;
  /** Repeat every N weeks, months, or years. */
  interval: number;
  /** Last day a repetition may fall on, YYYY-MM-DD, or empty to repeat forever. */
  until: string;
  color: string;
  /** Occurrences removed one by one from a repeating event. */
  skip: string[];
  reminder: Reminder;
}

export const EVENTS_KEY = "mycalendar.events.v1";
export const EVENTS_CHANGED = "mycalendar-events";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-f]{6}$/i;
const DAY_MS = 86_400_000;

function isISODate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && formatISODate(parseISODate(value)) === value;
}

export function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function blankEvent(date: Date, reminder: Reminder = null): CalendarEvent {
  return {
    reminder,
    id: "",
    title: "",
    date: formatISODate(date),
    time: "",
    repeat: "none",
    interval: 1,
    until: "",
    color: EVENT_COLORS[0],
    skip: [],
  };
}

export function normalizeEvent(input: Partial<CalendarEvent> | null | undefined): CalendarEvent | null {
  if (!input || typeof input.id !== "string" || !input.id) return null;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || !isISODate(input.date)) return null;
  const repeat = REPEATS.includes(input.repeat as Repeat) ? (input.repeat as Repeat) : "none";
  const interval = Math.round(Number(input.interval));
  const until = repeat !== "none" && isISODate(input.until) && input.until >= input.date ? input.until : "";
  return {
    id: input.id,
    title,
    date: input.date,
    time: typeof input.time === "string" && TIME.test(input.time) ? input.time : "",
    repeat,
    interval: repeat === "none" || !Number.isFinite(interval) ? 1 : Math.min(MAX_INTERVAL, Math.max(1, interval)),
    until,
    color: typeof input.color === "string" && HEX.test(input.color) ? input.color.toLowerCase() : EVENT_COLORS[0],
    skip: repeat === "none" || !Array.isArray(input.skip) ? [] : [...new Set(input.skip.filter(isISODate))].sort(),
    reminder: isReminder(input.reminder) ? input.reminder : null,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Day of month a monthly or yearly repetition lands on; the 31st falls back to the last day of shorter months. */
function landingDay(startDay: number, year: number, month: number): number {
  return Math.min(startDay, daysInMonth(year, month));
}

export function occursOn(event: CalendarEvent, date: Date): boolean {
  const iso = formatISODate(date);
  if (iso < event.date) return false;
  if (event.repeat === "none") return iso === event.date;
  if (event.until && iso > event.until) return false;
  if (event.skip.includes(iso)) return false;

  const start = parseISODate(event.date);
  const year = date.getFullYear();
  const month = date.getMonth();
  switch (event.repeat) {
    case "weekly": {
      const days = Math.round(
        (Date.UTC(year, month, date.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / DAY_MS,
      );
      return days % (7 * event.interval) === 0;
    }
    case "monthly": {
      const months = (year - start.getFullYear()) * 12 + month - start.getMonth();
      return months % event.interval === 0 && date.getDate() === landingDay(start.getDate(), year, month);
    }
    case "yearly": {
      const years = year - start.getFullYear();
      return (
        years % event.interval === 0 &&
        month === start.getMonth() &&
        date.getDate() === landingDay(start.getDate(), year, month)
      );
    }
  }
}

/** All-day events first, then by time, then by title. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.time !== b.time) {
    if (!a.time) return -1;
    if (!b.time) return 1;
    return a.time.localeCompare(b.time);
  }
  return a.title.localeCompare(b.title);
}

export function eventsOn(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter((event) => occursOn(event, date)).sort(compareEvents);
}

/** Manager order: by first date, then the same order as a day's list. */
export function sortForList(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || compareEvents(a, b));
}

export function readStoredEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeEvent(item as Partial<CalendarEvent>)).filter((item): item is CalendarEvent => item !== null);
  } catch {
    return [];
  }
}

export function writeStoredEvents(events: CalendarEvent[]): void {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  window.dispatchEvent(new Event(EVENTS_CHANGED));
}

/** Inserts a new event or replaces the one with the same id. Returns null when the event is invalid. */
export function upsertEvent(events: CalendarEvent[], draft: CalendarEvent): CalendarEvent[] | null {
  const event = normalizeEvent({ ...draft, id: draft.id || newEventId() });
  if (!event) return null;
  const index = events.findIndex((item) => item.id === event.id);
  if (index === -1) return [...events, event];
  return events.map((item, at) => (at === index ? event : item));
}

export function removeEvent(events: CalendarEvent[], id: string): CalendarEvent[] {
  return events.filter((item) => item.id !== id);
}

export function skipOccurrence(events: CalendarEvent[], id: string, iso: string): CalendarEvent[] {
  return events.map((item) => (item.id === id ? normalizeEvent({ ...item, skip: [...item.skip, iso] }) ?? item : item));
}
