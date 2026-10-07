import { useEffect, useRef, useState } from "react";
import { formatISODate } from "../domain/calendar";
import { EVENTS_CHANGED } from "../domain/events";
import { formatMessage } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import {
  QUEUE_KEY,
  REMINDERS_CHANGED,
  dismissReminders,
  readQueue,
  snoozeReminder,
  tickReminders,
  visibleReminders,
  writeQueue,
  type ReminderItem,
} from "../domain/reminders";
import type { Settings } from "../domain/settings";
import { showReminderWindow } from "../platform/desktop";
import { PanelBackdrop } from "./BackgroundImage";
import { formatEventDate, reminderLabel } from "./EventEditor";
import { BellIcon } from "./icons";

const TICK_MS = 15_000;

/** "Starts in 10 min", "Tomorrow at 09:30", "Today, all day", ... */
export function reminderTiming(item: ReminderItem, now: number, t: Messages, language: Language): string {
  const today = new Date(now);
  const tomorrow = formatISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const isToday = item.date === formatISODate(today);
  const isTomorrow = item.date === tomorrow;
  const date = formatEventDate(item.date, language);
  if (!item.time) {
    if (isToday) return t.todayAllDay;
    return isTomorrow ? t.tomorrowAllDay : formatMessage(t.dateAllDay, { date });
  }
  const minutes = Math.round((item.startAt - now) / 60_000);
  if (minutes < 0) return formatMessage(t.startedAt, { time: item.time });
  if (minutes === 0) return t.startingNow;
  if (minutes < 60) return formatMessage(t.startsInMinutes, { n: minutes });
  if (isToday) return formatMessage(t.todayAt, { time: item.time });
  if (isTomorrow) return formatMessage(t.tomorrowAt, { time: item.time });
  return formatMessage(t.dateAt, { date, time: item.time });
}

/** Runs in the calendar window, which stays alive in the tray, and queues reminders as they come due. */
export function useReminderScheduler() {
  useEffect(() => {
    let shown = 0;
    const tick = () => {
      const { visible } = tickReminders();
      if (visible > shown) void showReminderWindow().catch(() => undefined);
      shown = visible;
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    const onStorage = (event: StorageEvent) => {
      if (event.key === QUEUE_KEY) shown = visibleReminders(readQueue(), Date.now()).length;
    };
    window.addEventListener(EVENTS_CHANGED, tick);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(EVENTS_CHANGED, tick);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
}

export function useReminderQueue() {
  const [queue, setQueue] = useState<ReminderItem[]>(readQueue);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const reload = () => {
      setQueue(readQueue());
      setNow(Date.now());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === QUEUE_KEY || event.key === null) reload();
    };
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    window.addEventListener(REMINDERS_CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REMINDERS_CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const commit = (next: ReminderItem[]) => {
    setQueue(next);
    writeQueue(next);
  };

  return {
    now,
    visible: visibleReminders(queue, now),
    snooze: (key: string) => commit(snoozeReminder(readQueue(), key, Date.now())),
    dismiss: (keys: string[]) => commit(dismissReminders(readQueue(), keys)),
  };
}

export function ReminderPopup({
  t,
  language,
  settings,
  onSize,
  onEmpty,
}: {
  t: Messages;
  language: Language;
  /** Carries the background image choices; without it the popup keeps the plain theme. */
  settings?: Settings;
  /** Reports the rendered height so a desktop popup window can fit it. */
  onSize?: (height: number) => void;
  onEmpty?: () => void;
}) {
  const { now, visible, snooze, dismiss } = useReminderQueue();
  const panelRef = useRef<HTMLElement>(null);
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;
  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;
  const count = visible.length;

  useEffect(() => {
    if (count === 0) onEmptyRef.current?.();
  }, [count]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !onSizeRef.current) return;
    const report = () => onSizeRef.current?.(panel.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [count]);

  if (count === 0) return null;

  return (
    <section ref={panelRef} className="reminder-panel" role="alertdialog" aria-labelledby="reminder-title" aria-live="assertive">
      {settings && <PanelBackdrop settings={settings} target="reminder" />}
      <header className="reminder-head">
        <span className="reminder-bell">
          <BellIcon />
        </span>
        <h1 id="reminder-title">{t.remindersTitle}</h1>
        {count > 1 && (
          <button type="button" className="text-btn" onClick={() => dismiss(visible.map((item) => item.key))}>
            {t.dismissAll}
          </button>
        )}
      </header>
      <ul className="reminder-list">
        {visible.map((item) => (
          <li key={item.key} className="reminder-item">
            <i className="reminder-stripe" style={{ background: item.color }} />
            <div className="reminder-text">
              <strong>{item.title}</strong>
              <span>{reminderTiming(item, now, t, language)}</span>
              <span className="hint">{reminderLabel(item.minutesBefore, t)}</span>
            </div>
            <div className="reminder-actions">
              <button type="button" className="text-btn" onClick={() => snooze(item.key)}>
                {t.snooze}
              </button>
              <button type="button" className="text-btn primary" onClick={() => dismiss([item.key])}>
                {t.dismiss}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
