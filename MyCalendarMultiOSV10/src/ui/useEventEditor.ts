import { useState } from "react";
import { requestEventEdit } from "../domain/eventEdit";
import type { CalendarEvent } from "../domain/events";
import { isTauri, openAux } from "../platform/desktop";

export interface EditorTarget {
  event: CalendarEvent;
  occurrence?: string;
}

/**
 * On the desktop the editor opens in a window of its own, sized for the whole form whatever the calendar's size;
 * in the browser it stays a sheet over the screen that asked for it, held in `editing`.
 */
export function useEventEditor(): {
  editing: EditorTarget | null;
  open: (event: CalendarEvent, occurrence?: string) => void;
  close: () => void;
} {
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const open = (event: CalendarEvent, occurrence?: string) => {
    if (isTauri()) {
      requestEventEdit(event, occurrence);
      void openAux("editor");
      return;
    }
    setEditing({ event, occurrence });
  };
  return { editing, open, close: () => setEditing(null) };
}
