import { isISODate, isReminder, type CalendarEvent, type Reminder } from "./events";

/**
 * The event editor has its own window on the desktop, so the event to open travels through storage. A saved
 * event is named by its id and read fresh from the store; a new one carries the day and reminder it starts with.
 */
export const EVENT_EDIT_KEY = "mycalendar.event-edit";

export interface EventEditRequest {
  /** Empty for a new event. */
  id: string;
  date: string;
  reminder: Reminder;
  /** Day the editor was opened from, so a single repetition can be removed. */
  occurrence?: string;
  /** Tells two requests for the same event apart, so asking again starts a fresh form. */
  at: number;
}

export function requestEventEdit(event: CalendarEvent, occurrence?: string): void {
  const request: EventEditRequest = { id: event.id, date: event.date, reminder: event.reminder, occurrence, at: Date.now() };
  localStorage.setItem(EVENT_EDIT_KEY, JSON.stringify(request));
}

export function parseEventEditRequest(value: string | null): EventEditRequest | null {
  let input: Partial<EventEditRequest> | null;
  try {
    input = JSON.parse(value ?? "null");
  } catch {
    return null;
  }
  if (!input || typeof input.id !== "string" || !isISODate(input.date) || typeof input.at !== "number") return null;
  return {
    id: input.id,
    date: input.date,
    reminder: isReminder(input.reminder) ? input.reminder : null,
    occurrence: isISODate(input.occurrence) ? input.occurrence : undefined,
    at: input.at,
  };
}

export function readEventEditRequest(): EventEditRequest | null {
  return parseEventEditRequest(localStorage.getItem(EVENT_EDIT_KEY));
}
