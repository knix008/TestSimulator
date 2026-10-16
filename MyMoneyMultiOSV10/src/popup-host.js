import { applyFontFace, applyFontRoles, surfaceFonts } from "./core/fonts.js";
import { applyThemeVars } from "./core/themes.js";
import { applyPopupTheme, bootPopup, paintWallpaper } from "./ui/popups.js";
import { coalesceSteps } from "./platform/desktop.js";
import { createTauriApi } from "./platform/tauri-bridge.js";
import { attachWindowDrag } from "./ui/window-drag.js";

const api = createTauriApi();

api.onApplyTheme((payload) => {
  if (!payload) return;
  const popup = document.querySelector("[data-popup]");
  if (popup?.dataset.popup === "panel" && (payload.fonts || payload.font)) {
    // A font change reaches this window's own quote panel, not the settings window.
    const panel = popup.querySelector("[data-gui='panel']");
    if (panel) {
      if (payload.fonts) applyFontRoles(panel, surfaceFonts(payload.fonts, panel.dataset.panelKind));
      else applyFontFace(panel, payload.font);
    }
    if (!payload.theme && !payload.vars) return;
  }
  const type = document.querySelector("[data-popup]")?.dataset.popup || "";
  if (payload.theme) {
    applyPopupTheme(
      { type, theme: payload.theme, customTheme: payload.customTheme, transparency: payload.transparency },
      { theme: payload.theme, customTheme: payload.customTheme, transparency: payload.transparency },
    );
    return;
  }
  if (payload.vars) applyThemeVars(document.documentElement, payload.vars, payload.mode);
});
api.onApplyWallpaper((payload) => {
  const layer = document.querySelector('[data-popup="panel"] [data-gui="wallpaper"]');
  if (layer) paintWallpaper(layer, payload?.image || "", payload?.opacity);
});

const spec = await api.takePopupSpec();
bootPopup(spec, {
  finish: (result) => api.finishPopup(result),
  resize: (size) => api.resizePopup(size),
  immediate: (message) => api.popupImmediate(message),
  onUpdate: (callback) => api.onPopupUpdate(callback),
});
attachWindowDrag(document.body, coalesceSteps((step) => api.moveWindow(step)));
