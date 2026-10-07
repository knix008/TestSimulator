import { useEffect, useState, type MouseEvent } from "react";
import { EVENTS_DAY_KEY, parseEventsDay, readEventsDay, requestEventsDay } from "../domain/eventsDay";
import { dragWindow, isTauri } from "../platform/desktop";
import { EventManager } from "./EventManager";
import { EventsIcon } from "./icons";
import type { ReadyContext } from "./useSettings";
import { WindowChrome } from "./WindowChrome";

export function EventsScreen({
  ctx,
  onClose,
  onHeaderMouseDown,
}: {
  ctx: ReadyContext;
  onClose: () => void;
  onHeaderMouseDown?: (event: MouseEvent) => void;
}) {
  const { settings, update, t } = ctx;
  const [day, setDay] = useState(readEventsDay);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === EVENTS_DAY_KEY) setDay(parseEventsDay(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const onMouseDown = (event: MouseEvent) => {
    if (isTauri()) {
      void dragWindow(event);
      return;
    }
    onHeaderMouseDown?.(event);
  };
  return (
    <section className="panel screen events-screen">
      <WindowChrome icon={<EventsIcon />} title={t.manageEvents} closeLabel={t.close} onClose={onClose} onMouseDown={onMouseDown} />
      <div className="screen-body">
        <EventManager
          t={t}
          language={settings.language}
          defaultReminder={settings.defaultReminder}
          onDefaultReminderChange={(defaultReminder) => update({ defaultReminder })}
          day={day}
          onShowAll={() => {
            requestEventsDay(null);
            setDay(null);
          }}
        />
      </div>
    </section>
  );
}
