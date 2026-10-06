import { useMemo, useState } from "react";
import { blankEvent, isReminder, sortForList, type CalendarEvent, type Reminder } from "../domain/events";
import { formatMessage } from "../domain/i18n";
import type { Language, Messages } from "../domain/messages";
import { Dropdown } from "./Dropdown";
import { EventEditor, formatEventDate, reminderLabel, reminderOptions, repeatSummary } from "./EventEditor";
import { BellIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon } from "./icons";
import { useEvents } from "./useEvents";

export function EventManager({
  t,
  language,
  defaultReminder,
  onDefaultReminderChange,
}: {
  t: Messages;
  language: Language;
  defaultReminder: Reminder;
  onDefaultReminderChange: (reminder: Reminder) => void;
}) {
  const store = useEvents();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = sortForList(store.events);
    return needle ? sorted.filter((event) => event.title.toLowerCase().includes(needle)) : sorted;
  }, [store.events, query]);

  return (
    <div className="event-manager">
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
        <button type="button" className="text-btn solid add-event" onClick={() => setEditing(blankEvent(new Date(), defaultReminder))}>
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
        {formatMessage(t.eventCount, { count: store.events.length })} · {t.remindersHint}
      </p>
      {store.events.length === 0 ? (
        <p className="hint">{t.noEventsYet}</p>
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
                <button type="button" className="manage-main" onClick={() => setEditing(event)}>
                  <i className="event-dot" style={{ background: event.color }} />
                  <span className="manage-title">{event.title}</span>
                  <span className="manage-when">
                    {formatEventDate(event.date, language)}
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
                    onClick={() => setEditing(event)}
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
      {editing && (
        <EventEditor
          t={t}
          initial={editing}
          onSave={store.save}
          onDelete={store.remove}
          onSkip={store.skip}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
