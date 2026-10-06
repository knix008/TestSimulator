import { formatISODate } from "./calendar";
import { ALL_DAY_REMINDER_TIME, occursOn, readStoredEvents, type CalendarEvent } from "./events";

export interface ReminderItem {
  /** Identifies one reminder of one occurrence; editing the time or the lead time makes a new one. */
  key: string;
  eventId: string;
  title: string;
  color: string;
  /** Occurrence day, YYYY-MM-DD. */
  date: string;
  /** HH:MM, or empty for an all-day event. */
  time: string;
  minutesBefore: number;
  startAt: number;
  /** When the popup should show it; snoozing moves this forward. */
  showAt: number;
}

export const QUEUE_KEY = "mycalendar.reminders.queue";
export const FIRED_KEY = "mycalendar.reminders.fired";
export const REMINDERS_CHANGED = "mycalendar-reminders";
export const SNOOZE_MINUTES = 5;
/** A reminder missed while the app was off still pops up until this long after the event starts. */
export const LATE_GRACE_MS = 60 * 60 * 1000;
const FIRED_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const MINUTE = 60_000;

export function occurrenceStart(event: Pick<CalendarEvent, "time">, day: Date): Date {
  const [hours, minutes] = (event.time || ALL_DAY_REMINDER_TIME).split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

export function dueReminders(events: CalendarEvent[], now: number, fired: Record<string, number>): ReminderItem[] {
  const today = new Date(now);
  const due: ReminderItem[] = [];
  for (const event of events) {
    if (event.reminder === null) continue;
    const lookAhead = Math.ceil(event.reminder / 1440) + 1;
    for (let offset = -1; offset <= lookAhead; offset += 1) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      if (!occursOn(event, day)) continue;
      const startAt = occurrenceStart(event, day).getTime();
      const fireAt = startAt - event.reminder * MINUTE;
      const date = formatISODate(day);
      const key = `${event.id}@${date}T${event.time || "all-day"}@${event.reminder}`;
      if (fireAt > now || now >= startAt + LATE_GRACE_MS || key in fired) continue;
      due.push({
        key,
        eventId: event.id,
        title: event.title,
        color: event.color,
        date,
        time: event.time,
        minutesBefore: event.reminder,
        startAt,
        showAt: fireAt,
      });
    }
  }
  return due.sort((a, b) => a.startAt - b.startAt);
}

function readJson<T>(key: string, fallback: T, valid: (value: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return valid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function isItem(value: unknown): value is ReminderItem {
  const item = value as ReminderItem;
  return (
    typeof item === "object" &&
    item !== null &&
    typeof item.key === "string" &&
    typeof item.title === "string" &&
    typeof item.startAt === "number" &&
    typeof item.showAt === "number"
  );
}

export function readQueue(): ReminderItem[] {
  return readJson<unknown[]>(QUEUE_KEY, [], Array.isArray).filter(isItem);
}

export function writeQueue(queue: ReminderItem[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event(REMINDERS_CHANGED));
}

export function readFired(): Record<string, number> {
  return readJson<Record<string, number>>(FIRED_KEY, {}, (value) => typeof value === "object" && value !== null && !Array.isArray(value));
}

export function visibleReminders(queue: ReminderItem[], now: number): ReminderItem[] {
  return queue.filter((item) => item.showAt <= now).sort((a, b) => a.startAt - b.startAt);
}

export function snoozeReminder(queue: ReminderItem[], key: string, now: number, minutes = SNOOZE_MINUTES): ReminderItem[] {
  return queue.map((item) => (item.key === key ? { ...item, showAt: now + minutes * MINUTE } : item));
}

export function dismissReminders(queue: ReminderItem[], keys: string[]): ReminderItem[] {
  return queue.filter((item) => !keys.includes(item.key));
}

/** Queues every reminder that came due and reports how many are showing now. */
export function tickReminders(now = Date.now()): { added: ReminderItem[]; visible: number } {
  const fired = readFired();
  const added = dueReminders(readStoredEvents(), now, fired);
  let queue = readQueue();
  if (added.length) {
    for (const item of added) fired[item.key] = now;
    for (const [key, at] of Object.entries(fired)) {
      if (now - at > FIRED_RETENTION_MS) delete fired[key];
    }
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
    queue = [...queue, ...added];
    writeQueue(queue);
  }
  return { added, visible: visibleReminders(queue, now).length };
}
