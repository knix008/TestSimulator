import { isISODate } from "./events";

/** The events window may live in another webview, so the day it should list travels through storage. */
export const EVENTS_DAY_KEY = "mycalendar.events-day";

/** A null day lists every event. */
export function requestEventsDay(day: string | null): void {
  localStorage.setItem(EVENTS_DAY_KEY, JSON.stringify({ day, at: Date.now() }));
}

export function parseEventsDay(value: string | null): string | null {
  if (!value) return null;
  try {
    const day = (JSON.parse(value) as { day?: unknown }).day;
    return isISODate(day) ? day : null;
  } catch {
    return null;
  }
}

export function readEventsDay(): string | null {
  try {
    return parseEventsDay(localStorage.getItem(EVENTS_DAY_KEY));
  } catch {
    return null;
  }
}
