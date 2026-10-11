// Popup windows (settings, about, confirmation, theme dropdown) are real OS
// windows: they can sit outside the main window and be moved on their own.
// The main window owns them, and closing it closes them (lib.rs).
//
// Windows talk through localStorage (same origin, `storage` events reach the
// other windows): settings and the capture history are shared that way, and a
// popup's opening parameters go in `mycapture.popup.<kind>`.
import { invoke } from '@tauri-apps/api/core';

/** Logical size of each popup. The settings window is fixed: every tab fits without scrolling. */
export const POPUPS = {
  settings: { width: 720, height: 650 },
  about: { width: 480, height: 470 }, // then fitted to its content
  confirm: { width: 440, height: 230 },
  'theme-menu': { width: 460, height: 640 },
  menu: { width: 250, height: 300 }, // context menu; fitted to its items
};

export const popupKey = (kind) => `mycapture.popup.${kind}`;
export const popupLabel = (kind) => `popup-${kind}`;
export const SESSION_KEY = 'mycapture.session';

export function popupParams(kind) {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(popupKey(kind)) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/**
 * Opens (or brings back) a popup. `anchor` = screen position in CSS pixels for
 * the top-left corner; without it the popup is centred over the calling window.
 */
export async function openPopup(kind, { params = {}, anchor = null } = {}) {
  const size = POPUPS[kind];
  try {
    globalThis.localStorage?.setItem(popupKey(kind), JSON.stringify({ ...params, at: Date.now() }));
  } catch { /* the popup falls back to its defaults */ }
  const x = anchor ? anchor.x : window.screenX + (window.outerWidth - size.width) / 2;
  const y = anchor ? anchor.y : window.screenY + Math.max(36, (window.outerHeight - size.height) / 2);
  await invoke('open_popup', { kind, x: Math.round(x), y: Math.round(y), width: size.width, height: size.height });
}

export const closePopup = (kind) => invoke('close_popup', { kind });
