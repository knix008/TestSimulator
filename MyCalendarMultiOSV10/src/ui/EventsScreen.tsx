import type { MouseEvent } from "react";
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
        />
      </div>
    </section>
  );
}
