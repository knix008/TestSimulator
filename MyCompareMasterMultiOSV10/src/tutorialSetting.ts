/**
 * Saves settings.showTutorial ("Show at startup") from the tour or the welcome card.
 *
 * Written straight to the server and then published, so every window follows at once:
 * the main window's store picks the saved value up through `onSettingsPublished`, and
 * the Settings dialog (its own window on the desktop) gets it over the bridge.
 */
import { api } from "./api.js";
import * as host from "./host.js";

export async function saveShowTutorial(value: boolean): Promise<void> {
  try {
    const saved = await api.updateSettings({ showTutorial: value });
    host.publishSettings(saved);
  } catch {
    /* the server is gone; the checkbox will show the old value again */
  }
}
