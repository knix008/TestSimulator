import { applyThemeVars } from "./core/themes.js";
import { applyPopupTheme, bootPopup, paintWallpaper } from "./ui/popups.js";
import { attachWindowDrag } from "./ui/window-drag.js";

window.electronAPI.onApplyTheme?.((payload) => {
  if (!payload) return;
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
window.electronAPI.onApplyWallpaper?.((payload) => {
  const layer = document.querySelector('[data-popup="forecast"] [data-gui="wallpaper"]');
  if (layer) paintWallpaper(layer, payload?.image || "", payload?.opacity);
});

const spec = await window.electronAPI.takePopupSpec();
bootPopup(spec, {
  finish: (result) => window.electronAPI.finishPopup(result),
  immediate: (message) => window.electronAPI.popupImmediate(message),
  onUpdate: (callback) => window.electronAPI.onPopupUpdate(callback),
});
attachWindowDrag(document.body, (step) => window.electronAPI.moveWindow(step));
