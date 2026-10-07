import { useMemo, useState } from "react";
import { parseISODate } from "../domain/calendar";
import { blankEvent, eventsOn, isReminder, sortForList, type Reminder } from "../domain/events";
import { formatMessage } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import { Dropdown } from "./Dropdown";
import { EventEditor, eventDateLabel, formatEventDate, reminderLabel, reminderOptions, repeatSummary } from "./EventEditor";
import { BellIcon, CalendarIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon } from "./icons";
import { useEventEditor } from "./useEventEditor";
import { useEvents } from "./useEvents";

export function EventManager({
  t,
  language,
  defaultReminder,
  onDefaultReminderChange,
  day = null,
  onShowAll,
}: {
  t: Messages;
  language: Language;
  defaultReminder: Reminder;
  onDefaultReminderChange: (reminder: Reminder) => void;
  /** Lists only the events that fall on this ISO date, repeats included; null lists every event. */
  day?: string | null;
  onShowAll?: () => void;
}) {
  const store = useEvents();
  const [query, setQuery] = useState("");
  const editor = useEventEditor();
  const [confirming, setConfirming] = useState<string | null>(null);
  const listed = useMemo(() => (day ? eventsOn(store.events, parseISODate(day)) : sortForList(store.events)), [store.events, day]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? listed.filter((event) => event.title.toLowerCase().includes(needle)) : listed;
  }, [listed, query]);
  const occurrence = day ?? undefined;

  return (
    <div className="event-manager">
      {day && (
        <div className="manage-day">
          <CalendarIcon />
          <strong>{formatEventDate(day, language)}</strong>
          <button type="button" className="text-btn" onClick={onShowAll}>
            {t.showAllEvents}
          </button>
        </div>
      )}
      <div className="manage-head">
        <input
          className="text-input"
          type="search"
          value={query}
          placeholder={t.searchEvents}
          aria-label={t.searchEvents}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="text-btn solid add-event" onClick={() => editor.open(blankEvent(day ? parseISODate(day) : new Date(), defaultReminder))}>
          <PlusIcon />
          {t.addEvent}
        </button>
      </div>
      <label className="reminder-default">
        <BellIcon />
        <span>{t.defaultReminder}</span>
        <Dropdown
          value={defaultReminder === null ? "none" : String(defaultReminder)}
          ariaLabel={t.defaultReminder}
          title={t.remindersHint}
          options={reminderOptions(t)}
          onChange={(choice) => {
            const value = Number(choice);
            onDefaultReminderChange(isReminder(value) ? value : null);
          }}
        />
      </label>
      <p className="hint">
        {formatMessage(t.eventCount, { count: listed.length })} · {t.remindersHint}
      </p>
      {listed.length === 0 ? (
        <p className="hint">{day ? t.noEventsOnDay : t.noEventsYet}</p>
      ) : visible.length === 0 ? (
        <p className="hint">{t.noMatchingEvents}</p>
      ) : (
        <ul className="manage-list">
          {visible.map((event) => {
            const summary = repeatSummary(event, t, language);
            if (confirming === event.id) {
              return (
                <li key={event.id} className="manage-confirm" role="alert">
                  <TrashIcon />
                  <span className="manage-title">{formatMessage(t.confirmDelete, { title: event.title })}</span>
                  <button
                    type="button"
                    className="text-btn danger"
                    onClick={() => {
                      store.remove(event.id);
                      setConfirming(null);
                    }}
                  >
                    {t.deleteEvent}
                  </button>
                  <button type="button" className="text-btn" autoFocus onClick={() => setConfirming(null)}>
                    {t.cancel}
                  </button>
                </li>
              );
            }
            return (
              <li key={event.id}>
                <button type="button" className="manage-main" onClick={() => editor.open(event, occurrence)}>
                  <i className="event-dot" style={{ background: event.color }} />
                  <span className="manage-title">{event.title}</span>
                  <span className="manage-when">
                    {eventDateLabel(event, t, language)}
                    {event.time ? ` ${event.time}` : ""}
                  </span>
                  {(summary || event.reminder !== null) && (
                    <span className="manage-repeat">
                      {summary && (
                        <span title={summary}>
                          <RepeatIcon />
                          {summary}
                        </span>
                      )}
                      {event.reminder !== null && (
                        <span title={t.reminder}>
                          <BellIcon />
                          {reminderLabel(event.reminder, t)}
                        </span>
                      )}
                    </span>
                  )}
                </button>
                <span className="manage-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${t.editEvent}: ${event.title}`}
                    title={t.editEvent}
                    onClick={() => editor.open(event, occurrence)}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`${t.deleteEvent}: ${event.title}`}
                    title={t.deleteEvent}
                    onClick={() => setConfirming(event.id)}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editor.editing && (
        <EventEditor
          t={t}
          language={language}
          initial={editor.editing.event}
          occurrence={editor.editing.occurrence}
          onSave={store.save}
          onDelete={store.remove}
          onSkip={store.skip}
          onClose={editor.close}
        />
      )}
    </div>
  );
}
