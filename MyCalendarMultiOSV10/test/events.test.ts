import { beforeEach, describe, expect, it } from "vitest";
import { parseISODate } from "../src/domain/calendar";
import {
  EVENTS_KEY,
  blankEvent,
  eventsOn,
  normalizeEvent,
  occursOn,
  readStoredEvents,
  removeEvent,
  skipOccurrence,
  sortForList,
  upsertEvent,
  writeStoredEvents,
  type CalendarEvent,
} from "../src/domain/events";

function event(patch: Partial<CalendarEvent>): CalendarEvent {
  return normalizeEvent({ ...blankEvent(new Date(2026, 0, 1)), id: "e1", title: "Test", ...patch })!;
}

const on = (item: CalendarEvent, iso: string) => occursOn(item, parseISODate(iso));

describe("Events", () => {
  beforeEach(() => localStorage.clear());

  it("shows a one-off event only on its own day", () => {
    const item = event({ date: "2026-10-06" });
    expect(on(item, "2026-10-06")).toBe(true);
    expect(on(item, "2026-10-07")).toBe(false);
    expect(on(item, "2026-10-13")).toBe(false);
  });

  it("repeats weekly with an interval and an end date", () => {
    const weekly = event({ date: "2026-10-06", repeat: "weekly" });
    expect(["2026-10-06", "2026-10-13", "2026-10-20", "2027-03-30"].every((iso) => on(weekly, iso))).toBe(true);
    expect(on(weekly, "2026-09-29")).toBe(false);
    expect(on(weekly, "2026-10-14")).toBe(false);

    const fortnightly = event({ date: "2026-10-06", repeat: "weekly", interval: 2, until: "2026-11-03" });
    expect(on(fortnightly, "2026-10-20")).toBe(true);
    expect(on(fortnightly, "2026-10-13")).toBe(false);
    expect(on(fortnightly, "2026-11-03")).toBe(true);
    expect(on(fortnightly, "2026-11-17")).toBe(false);
  });

  it("keeps weekly repetitions on the same weekday across daylight saving changes", () => {
    const weekly = event({ date: "2026-03-02", repeat: "weekly" });
    expect(on(weekly, "2026-03-09")).toBe(true);
    expect(on(weekly, "2026-11-02")).toBe(true);
  });

  it("repeats monthly and lands the 31st on the last day of shorter months", () => {
    const monthly = event({ date: "2026-01-31", repeat: "monthly" });
    expect(on(monthly, "2026-02-28")).toBe(true);
    expect(on(monthly, "2026-03-31")).toBe(true);
    expect(on(monthly, "2026-04-30")).toBe(true);
    expect(on(monthly, "2026-03-30")).toBe(false);

    const quarterly = event({ date: "2026-01-15", repeat: "monthly", interval: 3 });
    expect(on(quarterly, "2026-04-15")).toBe(true);
    expect(on(quarterly, "2026-02-15")).toBe(false);
  });

  it("repeats yearly, including leap days", () => {
    const birthday = event({ date: "2024-02-29", repeat: "yearly" });
    expect(on(birthday, "2025-02-28")).toBe(true);
    expect(on(birthday, "2028-02-29")).toBe(true);
    expect(on(birthday, "2028-02-28")).toBe(false);

    const everyTwo = event({ date: "2026-10-06", repeat: "yearly", interval: 2 });
    expect(on(everyTwo, "2028-10-06")).toBe(true);
    expect(on(everyTwo, "2027-10-06")).toBe(false);
  });

  it("removes a single repetition without touching the rest", () => {
    const weekly = event({ date: "2026-10-06", repeat: "weekly" });
    const [skipped] = skipOccurrence([weekly], "e1", "2026-10-13");
    expect(on(skipped, "2026-10-13")).toBe(false);
    expect(on(skipped, "2026-10-20")).toBe(true);
  });

  it("sorts a day's events with all-day first, then by time", () => {
    const list = [
      event({ id: "b", title: "Lunch", date: "2026-10-06", time: "12:30" }),
      event({ id: "a", title: "Holiday prep", date: "2026-10-06" }),
      event({ id: "c", title: "Standup", date: "2026-10-06", time: "09:00" }),
    ];
    expect(eventsOn(list, parseISODate("2026-10-06")).map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(sortForList([event({ id: "x", date: "2026-12-01" }), event({ id: "y", date: "2026-01-01" })]).map((item) => item.id)).toEqual(["y", "x"]);
  });

  it("rejects or repairs invalid input", () => {
    expect(normalizeEvent({ id: "x", title: "  ", date: "2026-10-06" })).toBeNull();
    expect(normalizeEvent({ id: "x", title: "A", date: "2026-02-30" })).toBeNull();
    const repaired = normalizeEvent({
      id: "x",
      title: " A ",
      date: "2026-10-06",
      time: "25:00",
      repeat: "daily" as never,
      interval: 500,
      until: "2026-01-01",
      color: "red",
    })!;
    expect(repaired).toMatchObject({ title: "A", time: "", repeat: "none", interval: 1, until: "", color: "#3d7dff" });
    const capped = normalizeEvent({ id: "y", title: "B", date: "2026-10-06", repeat: "weekly", interval: 500, until: "2026-01-01" })!;
    expect(capped.interval).toBe(99);
    expect(capped.until).toBe("");
  });

  it("adds, edits, removes, and stores events", () => {
    const added = upsertEvent([], { ...blankEvent(new Date(2026, 9, 6)), title: "Dentist", color: "#E5484D" })!;
    expect(added).toHaveLength(1);
    expect(added[0].id).not.toBe("");
    expect(added[0].color).toBe("#e5484d");
    expect(upsertEvent(added, { ...added[0], title: "" })).toBeNull();
    const edited = upsertEvent(added, { ...added[0], title: "Dentist 3pm", time: "15:00" })!;
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ title: "Dentist 3pm", time: "15:00" });

    let notified = 0;
    const count = () => (notified += 1);
    window.addEventListener("mycalendar-events", count);
    writeStoredEvents(edited);
    window.removeEventListener("mycalendar-events", count);
    expect(notified).toBe(1);
    expect(readStoredEvents()).toEqual(edited);
    expect(removeEvent(edited, edited[0].id)).toEqual([]);

    localStorage.setItem(EVENTS_KEY, "{broken");
    expect(readStoredEvents()).toEqual([]);
  });
});
