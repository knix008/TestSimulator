import { useEffect, useMemo, useState } from "react";
import { parseISODate } from "../domain/calendar";
import { EVENT_EDIT_KEY, parseEventEditRequest, readEventEditRequest } from "../domain/eventEdit";
import { blankEvent } from "../domain/events";
import { setWindowTitle } from "../platform/desktop";
import { EventEditor } from "./EventEditor";
import { useEvents } from "./useEvents";
import type { ReadyContext } from "./useSettings";

/** The desktop's event editor window; asking for another event while it is open replaces the form. */
export function EventEditorWindow({ ctx, onClose }: { ctx: ReadyContext; onClose: () => void }) {
  const { settings, t } = ctx;
  const store = useEvents();
  const [request, setRequest] = useState(readEventEditRequest);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== EVENT_EDIT_KEY) return;
      const next = parseEventEditRequest(event.newValue);
      if (next) setRequest(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Read once per request, so a change saved elsewhere meanwhile does not wipe what is being typed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => {
    if (!request) return null;
    if (!request.id) return blankEvent(parseISODate(request.date), request.reminder);
    return store.events.find((event) => event.id === request.id) ?? null;
  }, [request]);

  const title = initial?.id ? t.editEvent : t.addEvent;
  useEffect(() => {
    void setWindowTitle(title);
  }, [title]);

  // The event was deleted elsewhere, or nothing was asked for.
  useEffect(() => {
    if (!initial) onClose();
  }, [initial]);
  if (!initial) return null;

  return (
    <EventEditor
      key={request?.at}
      standalone
      t={t}
      language={settings.language}
      initial={initial}
      occurrence={request?.occurrence}
      onSave={store.save}
      onDelete={store.remove}
      onSkip={store.skip}
      onClose={onClose}
    />
  );
}
