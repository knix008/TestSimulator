import { useEffect, useRef, useState } from "react";
import {
  EVENTS_CHANGED,
  EVENTS_KEY,
  readStoredEvents,
  removeEvent,
  skipOccurrence,
  upsertEvent,
  writeStoredEvents,
  type CalendarEvent,
} from "../domain/events";

export interface EventStore {
  events: CalendarEvent[];
  save: (draft: CalendarEvent) => boolean;
  remove: (id: string) => void;
  skip: (id: string, iso: string) => void;
}

export function useEvents(): EventStore {
  const [events, setEvents] = useState<CalendarEvent[]>(readStoredEvents);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const reload = () => setEvents(readStoredEvents());
    const onStorage = (event: StorageEvent) => {
      if (event.key === EVENTS_KEY || event.key === null) reload();
    };
    window.addEventListener(EVENTS_CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENTS_CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const commit = (next: CalendarEvent[]) => {
    eventsRef.current = next;
    setEvents(next);
    writeStoredEvents(next);
  };

  return {
    events,
    save: (draft) => {
      const next = upsertEvent(eventsRef.current, draft);
      if (!next) return false;
      commit(next);
      return true;
    },
    remove: (id) => commit(removeEvent(eventsRef.current, id)),
    skip: (id, iso) => commit(skipOccurrence(eventsRef.current, id, iso)),
  };
}
