import { useState, type FormEvent, type KeyboardEvent } from "react";
import { parseISODate } from "../domain/calendar";
import {
  EVENT_COLORS,
  MAX_INTERVAL,
  REMINDER_OPTIONS,
  REPEATS,
  isReminder,
  type CalendarEvent,
  type Repeat,
} from "../domain/events";
import { formatMessage } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { CloseIcon } from "./icons";

export function formatEventDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parseISODate(iso));
}

export function repeatLabel(event: Pick<CalendarEvent, "repeat" | "interval">, t: Messages): string {
  if (event.repeat === "none") return "";
  if (event.interval === 1) return t.repeatEveryOne[event.repeat];
  return formatMessage(t.repeatEvery[event.repeat], { n: String(event.interval) });
}

export function reminderLabel(reminder: number | null, t: Messages): string {
  if (reminder === null) return t.reminderNone;
  if (reminder === 0) return t.reminderAtStart;
  const [n, unit] =
    reminder % 10080 === 0
      ? [reminder / 10080, "week"]
      : reminder % 1440 === 0
        ? [reminder / 1440, "day"]
        : reminder % 60 === 0
          ? [reminder / 60, "hour"]
          : [reminder, "minute"];
  const key = (n === 1 ? unit : `${unit}s`) as keyof Messages["reminderBefore"];
  return formatMessage(t.reminderBefore[key], { n });
}

export function reminderOptions(t: Messages): DropdownOption[] {
  return [
    { value: "none", label: t.reminderNone },
    ...REMINDER_OPTIONS.map((minutes) => ({ value: String(minutes), label: reminderLabel(minutes, t) })),
  ];
}

/** "Weekly · until Dec 31, 2026" style summary; empty for a one-off event. */
export function repeatSummary(event: CalendarEvent, t: Messages, language: Language): string {
  const label = repeatLabel(event, t);
  if (!label || !event.until) return label;
  return `${label} · ${formatMessage(t.repeatUntilShort, { date: formatEventDate(event.until, language) })}`;
}

export interface EventEditorProps {
  t: Messages;
  initial: CalendarEvent;
  /** Day the editor was opened from, so a single repetition can be removed. */
  occurrence?: string;
  onSave: (draft: CalendarEvent) => boolean;
  onDelete: (id: string) => void;
  onSkip: (id: string, iso: string) => void;
  onClose: () => void;
}

export function EventEditor({ t, initial, occurrence, onSave, onDelete, onSkip, onClose }: EventEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const editing = Boolean(initial.id);
  const repeating = initial.repeat !== "none";
  const customColor = !(EVENT_COLORS as readonly string[]).includes(draft.color);
  const set = (patch: Partial<CalendarEvent>) => setDraft((current) => ({ ...current, ...patch }));
  const repeatNames: Record<Repeat, string> = {
    none: t.repeatNone,
    weekly: t.repeatWeekly,
    monthly: t.repeatMonthly,
    yearly: t.repeatYearly,
  };
  const [everyBefore, everyAfter] =
    draft.repeat === "none" ? ["", ""] : t.repeatEvery[draft.repeat].split("{n}");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError(t.titleRequired);
      return;
    }
    if (onSave(draft)) onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="sheet-back"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-editor-title"
        onSubmit={submit}
        onKeyDown={onKeyDown}
        noValidate
      >
        <header className="sheet-head">
          <h2 id="event-editor-title">{editing ? t.editEvent : t.addEvent}</h2>
          <button type="button" className="icon-btn close-btn" aria-label={t.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <label className="sheet-field">
          <span className="field">{t.eventTitle}</span>
          <input
            className="text-input"
            name="title"
            value={draft.title}
            maxLength={80}
            placeholder={t.eventTitlePlaceholder}
            autoFocus
            autoComplete="off"
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              set({ title: event.target.value });
              if (error) setError("");
            }}
          />
        </label>

        <div className="sheet-row">
          <label className="sheet-field">
            <span className="field">{t.eventDate}</span>
            <input
              className="text-input"
              type="date"
              name="date"
              required
              value={draft.date}
              onChange={(event) => event.target.value && set({ date: event.target.value })}
            />
          </label>
          <label className="sheet-field">
            <span className="field">{t.eventTime}</span>
            <input
              className="text-input"
              type="time"
              name="time"
              value={draft.time}
              onChange={(event) => set({ time: event.target.value })}
            />
          </label>
        </div>

        <div className="sheet-field">
          <span className="field" id="event-repeat-label">
            {t.repeat}
          </span>
          <div className="segment" role="group" aria-labelledby="event-repeat-label">
            {REPEATS.map((repeat) => (
              <button
                key={repeat}
                type="button"
                aria-pressed={draft.repeat === repeat}
                onClick={() => set({ repeat, interval: draft.interval || 1 })}
              >
                {repeatNames[repeat]}
              </button>
            ))}
          </div>
        </div>

        {draft.repeat !== "none" && (
          <div className="sheet-row">
            <label className="sheet-field">
              <span className="field">{t.repeatInterval}</span>
              <span className="interval">
                {everyBefore.trim() && <span>{everyBefore.trim()}</span>}
                <input
                  className="text-input"
                  type="number"
                  name="interval"
                  min={1}
                  max={MAX_INTERVAL}
                  value={draft.interval}
                  onChange={(event) => set({ interval: Number(event.target.value) || 1 })}
                />
                {everyAfter.trim() && <span>{everyAfter.trim()}</span>}
              </span>
            </label>
            <label className="sheet-field">
              <span className="field">{t.repeatUntil}</span>
              <input
                className="text-input"
                type="date"
                name="until"
                min={draft.date}
                value={draft.until}
                title={t.repeatUntilHint}
                onChange={(event) => set({ until: event.target.value })}
              />
            </label>
          </div>
        )}

        <label className="sheet-field">
          <span className="field">{t.reminder}</span>
          <Dropdown
            value={draft.reminder === null ? "none" : String(draft.reminder)}
            ariaLabel={t.reminder}
            title={draft.time ? undefined : t.allDayReminderHint}
            options={reminderOptions(t)}
            onChange={(choice) => {
              const value = Number(choice);
              set({ reminder: isReminder(value) ? value : null });
            }}
          />
          {!draft.time && draft.reminder !== null && <span className="hint">{t.allDayReminderHint}</span>}
        </label>

        <div className="sheet-field">
          <span className="field" id="event-color-label">
            {t.eventColor}
          </span>
          <div className="color-row" role="radiogroup" aria-labelledby="event-color-label">
            {EVENT_COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.color === color}
                aria-label={t.colorNames[index]}
                title={t.colorNames[index]}
                style={{ background: color }}
                onClick={() => set({ color })}
              />
            ))}
            <label className={customColor ? "custom-color selected" : "custom-color"} title={t.customColor}>
              {customColor && <i style={{ background: draft.color }} />}
              <input
                type="color"
                name="customColor"
                aria-label={t.customColor}
                value={draft.color}
                onChange={(event) => set({ color: event.target.value.toLowerCase() })}
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <footer className="sheet-actions">
          {editing && repeating && occurrence && (
            <button
              type="button"
              className="text-btn danger"
              onClick={() => {
                onSkip(initial.id, occurrence);
                onClose();
              }}
            >
              {t.deleteOccurrence}
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="text-btn danger"
              onClick={() => {
                onDelete(initial.id);
                onClose();
              }}
            >
              {repeating ? t.deleteSeries : t.deleteEvent}
            </button>
          )}
          <span className="grow" />
          <button type="button" className="text-btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="text-btn primary">
            {t.save}
          </button>
        </footer>
      </form>
    </div>
  );
}
