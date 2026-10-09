import { applyThemeVars } from "./core/themes.js";
import { applyPopupFont, applyPopupLanguage, applyPopupTheme, bootPopup, paintWallpaper } from "./ui/popups.js";
import { attachWindowDrag } from "./ui/window-drag.js";

let popupSpec = null;
window.electronAPI.onApplyTheme?.((payload) => {
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
window.electronAPI.onApplyWallpaper?.((payload) => {
  const layer = document.querySelector('[data-popup="forecast"] [data-gui="wallpaper"]');
  if (layer) paintWallpaper(layer, payload?.image || "", payload?.opacity);
});

const spec = await window.electronAPI.takePopupSpec();
popupSpec = spec;
bootPopup(spec, {
  finish: (result) => window.electronAPI.finishPopup(result),
  immediate: (message) => window.electronAPI.popupImmediate(message),
  onUpdate: (callback) => window.electronAPI.onPopupUpdate(callback),
});
attachWindowDrag(document.body, (step) => window.electronAPI.moveWindow(step));
