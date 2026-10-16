import { applyThemeVars } from "./core/themes.js";
import { applyPopupFont, applyPopupLanguage, applyPopupTheme, bootPopup, paintWallpaper } from "./ui/popups.js";
import { coalesceSteps } from "./platform/desktop.js";
import { createTauriApi } from "./platform/tauri-bridge.js";
import { attachWindowDrag } from "./ui/window-drag.js";

const api = createTauriApi();

let popupSpec = null;
api.onApplyTheme((payload) => {
  if (!payload) return;
  const type = document.querySelector("[data-popup]")?.dataset.popup || "";
  if (payload.fontFamily != null) {
    const popup = document.querySelector("[data-popup]");
    if (popup) applyPopupFont(popup, payload);
  }
  if (payload.language && ["settings", "search"].includes(popupSpec?.type)) {
    popupSpec.language = payload.language === "en" ? "en" : "ko";
    applyPopupLanguage(document.body, popupSpec);
  }
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
  const layer = document.querySelector('[data-popup="forecast"] [data-gui="wallpaper"]');
  if (layer) paintWallpaper(layer, payload?.image || "", payload?.opacity);
});

const spec = await api.takePopupSpec();
popupSpec = spec;
bootPopup(spec, {
  finish: (result) => api.finishPopup(result),
  immediate: (message) => api.popupImmediate(message),
  onUpdate: (callback) => api.onPopupUpdate(callback),
});
attachWindowDrag(document.body, coalesceSteps((step) => api.moveWindow(step)));
