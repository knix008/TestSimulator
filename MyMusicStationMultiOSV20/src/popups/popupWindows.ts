import { isTauri } from '@tauri-apps/api/core'
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow'
import { isPopupWindowLabel } from './protocol'

/** Closes every popup window the main window has opened (used before hiding/closing main). */
export const closeAllPopupWindows = async () => {
  if (!isTauri()) {
    return
  }

  try {
    const windows = await getAllWebviewWindows()
    await Promise.all(windows.filter((win) => isPopupWindowLabel(win.label)).map((win) => win.close().catch(() => {})))
  } catch (error) {
    console.warn('[popup] failed to close popup windows', error)
  }
}
