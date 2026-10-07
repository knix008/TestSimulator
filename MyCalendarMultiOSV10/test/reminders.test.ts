import { beforeEach, describe, expect, it } from "vitest";
import { messages } from "../src/domain/i18n";
import { EVENTS_KEY, blankEvent, normalizeEvent, type CalendarEvent } from "../src/domain/events";
import {
  FIRED_KEY,
  dueReminders,
  dismissReminders,
  occurrenceStart,
  readQueue,
  snoozeReminder,
  tickReminders,
  visibleReminders,
} from "../src/domain/reminders";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/domain/settings";
import { reminderLabel } from "../src/ui/EventEditor";
import { reminderTiming } from "../src/ui/ReminderPopup";

const at = (iso: string, time = "00:00") => {
  const [y, m, d] = iso.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};

function event(patch: Partial<CalendarEvent>): CalendarEvent {
  return normalizeEvent({ ...blankEvent(new Date(2026, 9, 6)), id: "e1", title: "Standup", ...patch })!;
}

describe("Reminders", () => {
  beforeEach(() => localStorage.clear());

  it("fires at the chosen lead time and not before", () => {
    const standup = event({ date: "2026-10-06", time: "10:00", reminder: 15 });
    expect(dueReminders([standup], at("2026-10-06", "09:44"), {})).toHaveLength(0);
    const [due] = dueReminders([standup], at("2026-10-06", "09:45"), {});
    expect(due).toMatchObject({ eventId: "e1", date: "2026-10-06", minutesBefore: 15 });
    expect(due.startAt).toBe(at("2026-10-06", "10:00"));
    expect(due.showAt).toBe(at("2026-10-06", "09:45"));
    expect(dueReminders([standup], at("2026-10-06", "09:50"), { [due.key]: 1 })).toHaveLength(0);
  });

  it("skips events without a reminder and stale ones past the grace period", () => {
    expect(dueReminders([event({ date: "2026-10-06", time: "10:00" })], at("2026-10-06", "10:00"), {})).toHaveLength(0);
    const standup = event({ date: "2026-10-06", time: "10:00", reminder: 0 });
    expect(dueReminders([standup], at("2026-10-06", "10:59"), {})).toHaveLength(1);
    expect(dueReminders([standup], at("2026-10-06", "11:00"), {})).toHaveLength(0);
  });

  it("reminds days ahead, on repetitions, and uses 9 AM for all-day events", () => {
    const birthday = event({ date: "2020-10-08", repeat: "yearly", reminder: 1440 });
    const [due] = dueReminders([birthday], at("2026-10-07", "09:00"), {});
    expect(due.date).toBe("2026-10-08");
    expect(due.startAt).toBe(at("2026-10-08", "09:00"));
    expect(occurrenceStart({ time: "" }, new Date(2026, 9, 8)).getHours()).toBe(9);

    const weekly = event({ date: "2026-09-01", time: "18:30", repeat: "weekly", reminder: 60 });
    expect(dueReminders([weekly], at("2026-10-06", "17:30"), {})[0].date).toBe("2026-10-06");
    expect(dueReminders([weekly], at("2026-10-07", "17:30"), {})).toHaveLength(0);
  });

  it("queues each reminder once and lets the popup snooze or dismiss it", () => {
    localStorage.setItem(EVENTS_KEY, JSON.stringify([event({ date: "2026-10-06", time: "10:00", reminder: 10 })]));
    const now = at("2026-10-06", "09:51");
    expect(tickReminders(now)).toMatchObject({ visible: 1 });
    expect(tickReminders(now + 30_000).added).toHaveLength(0);
    expect(Object.keys(JSON.parse(localStorage.getItem(FIRED_KEY)!))).toHaveLength(1);

    const queue = readQueue();
    const snoozed = snoozeReminder(queue, queue[0].key, now);
    expect(visibleReminders(snoozed, now + 60_000)).toHaveLength(0);
    expect(visibleReminders(snoozed, now + 5 * 60_000)).toHaveLength(1);
    expect(dismissReminders(snoozed, [queue[0].key])).toEqual([]);
  });

  it("describes lead times and start times in both languages", () => {
    expect(reminderLabel(null, messages.ko)).toBe("알림 없음");
    expect(reminderLabel(0, messages.ko)).toBe("일정 시간에");
    expect(reminderLabel(10, messages.ko)).toBe("10분 전");
    expect(reminderLabel(120, messages.ko)).toBe("2시간 전");
    expect(reminderLabel(1440, messages.en)).toBe("1 day before");
    expect(reminderLabel(10080, messages.en)).toBe("1 week before");
    expect(reminderLabel(5, messages.en)).toBe("5 minutes before");

    const item = { key: "k", eventId: "e", title: "T", color: "#3d7dff", date: "2026-10-06", time: "10:00", minutesBefore: 10, startAt: at("2026-10-06", "10:00"), showAt: 0 };
    expect(reminderTiming(item, at("2026-10-06", "09:50"), messages.ko, "ko")).toBe("10분 후 시작");
    expect(reminderTiming(item, at("2026-10-06", "10:00"), messages.en, "en")).toBe("Starting now");
    expect(reminderTiming(item, at("2026-10-06", "10:20"), messages.ko, "ko")).toBe("10:00에 시작함");
    expect(reminderTiming(item, at("2026-10-05", "20:00"), messages.en, "en")).toBe("Tomorrow at 10:00");
    expect(reminderTiming({ ...item, time: "" }, at("2026-10-06", "08:00"), messages.ko, "ko")).toBe("오늘 종일");
  });

  it("presets new events with the default reminder from settings", () => {
    expect(DEFAULT_SETTINGS.defaultReminder).toBe(10);
    expect(normalizeSettings({}).defaultReminder).toBe(10);
    expect(normalizeSettings({ defaultReminder: null }).defaultReminder).toBeNull();
    expect(normalizeSettings({ defaultReminder: 7 as never }).defaultReminder).toBeNull();
    expect(normalizeSettings({ defaultReminder: 60 }).defaultReminder).toBe(60);
    expect(blankEvent(new Date(), 30).reminder).toBe(30);
    expect(normalizeEvent({ ...blankEvent(new Date()), id: "x", title: "A", reminder: 3 as never })!.reminder).toBeNull();
  });
});
