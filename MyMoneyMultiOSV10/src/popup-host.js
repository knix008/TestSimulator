import { applyFontFace } from "./core/fonts.js";
import { applyThemeVars } from "./core/themes.js";
import { applyPopupTheme, bootPopup, paintWallpaper } from "./ui/popups.js";
import { attachWindowDrag } from "./ui/window-drag.js";

window.electronAPI.onApplyTheme?.((payload) => {
  if (!payload) return;
  if (payload.font) {
    // A font change in Settings reaches an open stock panel at once.
    const panel = document.querySelector('[data-popup="panel"] [data-gui="panel"]');
    if (panel) applyFontFace(panel, payload.font);
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
window.electronAPI.onApplyWallpaper?.((payload) => {
  const layer = document.querySelector('[data-popup="panel"] [data-gui="wallpaper"]');
  if (layer) paintWallpaper(layer, payload?.image || "", payload?.opacity);
});

const spec = await window.electronAPI.takePopupSpec();
bootPopup(spec, {
  finish: (result) => window.electronAPI.finishPopup(result),
  resize: (size) => window.electronAPI.resizePopup?.(size),
  immediate: (message) => window.electronAPI.popupImmediate(message),
  onUpdate: (callback) => window.electronAPI.onPopupUpdate(callback),
});
attachWindowDrag(document.body, (step) => window.electronAPI.moveWindow(step));
