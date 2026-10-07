import { useState, type FormEvent, type KeyboardEvent } from "react";
import { formatISODate, parseISODate } from "../domain/calendar";
import {
  EVENT_CALENDARS,
  EVENT_COLORS,
  MAX_INTERVAL,
  REMINDER_OPTIONS,
  REPEATS,
  isReminder,
  type CalendarEvent,
  type EventCalendar,
  type Repeat,
} from "../domain/events";
import { formatMessage } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import {
  LUNAR_YEAR_MAX,
  LUNAR_YEAR_MIN,
  formatLunar,
  fromLunar,
  lunarMonthLabel,
  lunarMonths,
  lunarSupported,
  toLunar,
} from "../domain/lunar";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { CloseIcon } from "./icons";

export function formatEventDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parseISODate(iso));
}

/** A lunar event is listed by its lunar date, which is the one its owner typed. */
export function eventDateLabel(event: Pick<CalendarEvent, "date" | "calendar">, t: Messages, language: Language): string {
  const lunar = event.calendar === "lunar" ? toLunar(parseISODate(event.date)) : null;
  return lunar ? formatLunar(lunar, t) : formatEventDate(event.date, language);
}

export function repeatLabel(event: Pick<CalendarEvent, "repeat" | "interval">, t: Messages): string {
  if (event.repeat === "none") return "";
  if (event.interval === 1) return t.repeatEveryOne[event.repeat];
  return formatMessage(t.repeatEvery[event.repeat], { n: String(event.interval) });
}

/** The lunar date fields as typed, so a half-typed year does not throw the month and day away. */
interface LunarForm {
  year: string;
  month: number;
  leap: boolean;
  day: string;
}

function lunarFormOf(iso: string): LunarForm {
  const lunar = toLunar(parseISODate(iso));
  return {
    year: lunar ? String(lunar.year) : "",
    month: lunar?.month ?? 1,
    leap: lunar?.leap ?? false,
    day: lunar ? String(lunar.day) : "",
  };
}

function resolveLunarForm(form: LunarForm): Date | null {
  const year = Number(form.year);
  const day = Number(form.day);
  if (!form.year.trim() || !form.day.trim() || !Number.isInteger(year) || !Number.isInteger(day)) return null;
  return fromLunar({ year, month: form.month, day, leap: form.leap });
}

const monthKeyOf = (month: number, leap: boolean) => `${month}${leap ? "L" : ""}`;

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
  language: Language;
  initial: CalendarEvent;
  /** Day the editor was opened from, so a single repetition can be removed. */
  occurrence?: string;
  onSave: (draft: CalendarEvent) => boolean;
  onDelete: (id: string) => void;
  onSkip: (id: string, iso: string) => void;
  onClose: () => void;
}

export function EventEditor({ t, language, initial, occurrence, onSave, onDelete, onSkip, onClose }: EventEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [lunarForm, setLunarForm] = useState(() => lunarFormOf(initial.date));
  const [error, setError] = useState("");
  const editing = Boolean(initial.id);
  const repeating = initial.repeat !== "none";
  const customColor = !(EVENT_COLORS as readonly string[]).includes(draft.color);
  const set = (patch: Partial<CalendarEvent>) => setDraft((current) => ({ ...current, ...patch }));
  // Without a lunar calendar in the runtime there is nothing to convert, so the choice is hidden.
  const lunarAvailable = lunarSupported();
  const lunar = lunarAvailable && draft.calendar === "lunar";
  // A half-typed year has no months of its own; the saved date keeps the picker filled meanwhile.
  const typedMonths = lunarMonths(Number(lunarForm.year));
  const months = typedMonths.length ? typedMonths : lunarMonths(toLunar(parseISODate(draft.date))?.year ?? 0);
  const monthEntry = months.find((item) => item.month === lunarForm.month && item.leap === lunarForm.leap) ?? months[0];
  const calendarNames: Record<EventCalendar, string> = { solar: t.calendarSolar, lunar: t.calendarLunar };

  const changeLunar = (patch: Partial<LunarForm>) => {
    const next = { ...lunarForm, ...patch };
    const resolved = resolveLunarForm(next);
    const canonical = resolved ? toLunar(resolved) : null;
    // Re-reading the resolved day snaps a day past the month's end and a leap month the year lacks.
    setLunarForm(
      canonical ? { year: String(canonical.year), month: canonical.month, leap: canonical.leap, day: String(canonical.day) } : next,
    );
    if (resolved) {
      set({ date: formatISODate(resolved) });
      if (error) setError("");
    }
  };

  const changeCalendar = (calendar: EventCalendar) => {
    if (calendar === draft.calendar) return;
    if (calendar === "lunar") setLunarForm(lunarFormOf(draft.date));
    set({ calendar });
    setError("");
  };
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
    if (lunar && !resolveLunarForm(lunarForm)) {
      setError(t.lunarDateInvalid);
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

        {lunarAvailable && (
          <div className="sheet-field">
            <span className="field" id="event-calendar-label">
              {t.dateCalendar}
            </span>
            <div className="segment" role="group" aria-labelledby="event-calendar-label">
              {EVENT_CALENDARS.map((calendar) => (
                <button
                  key={calendar}
                  type="button"
                  name={`calendar-${calendar}`}
                  aria-pressed={draft.calendar === calendar}
                  onClick={() => changeCalendar(calendar)}
                >
                  {calendarNames[calendar]}
                </button>
              ))}
            </div>
          </div>
        )}

        {lunar ? (
          <>
            <div className="sheet-field">
              <span className="field" id="event-lunar-label">
                {t.lunarDate}
              </span>
              <div className="lunar-date" role="group" aria-labelledby="event-lunar-label">
                <input
                  className="text-input"
                  type="number"
                  name="lunarYear"
                  min={LUNAR_YEAR_MIN}
                  max={LUNAR_YEAR_MAX}
                  step={1}
                  aria-label={t.lunarYear}
                  value={lunarForm.year}
                  onChange={(event) => changeLunar({ year: event.target.value })}
                />
                <Dropdown
                  className="lunar-month"
                  value={monthKeyOf(lunarForm.month, lunarForm.leap)}
                  ariaLabel={t.lunarMonth}
                  options={months.map((item) => ({ value: monthKeyOf(item.month, item.leap), label: lunarMonthLabel(item, t) }))}
                  onChange={(choice) => changeLunar({ month: Number.parseInt(choice, 10), leap: choice.endsWith("L") })}
                />
                <input
                  className="text-input"
                  type="number"
                  name="lunarDay"
                  min={1}
                  max={monthEntry?.length ?? 30}
                  step={1}
                  aria-label={t.lunarDay}
                  value={lunarForm.day}
                  onChange={(event) => changeLunar({ day: event.target.value })}
                />
              </div>
              <span className="hint">{t.lunarRepeatHint}</span>
            </div>
            <div className="sheet-row">
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
              <div className="sheet-field">
                <span className="field">{t.solarDate}</span>
                <output className="solar-date" name="solarDate">
                  {formatEventDate(draft.date, language)}
                </output>
              </div>
            </div>
          </>
        ) : (
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
        )}

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
