import { applyFontFace, applyFontRoles, surfaceFonts } from "./core/fonts.js";
import { applyThemeVars } from "./core/themes.js";
import { gripIcon } from "./ui/icons.js";
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
const popup = bootPopup(spec, {
  finish: (result) => api.finishPopup(result),
  resize: (size) => api.resizePopup(size),
  immediate: (message) => api.popupImmediate(message),
  onUpdate: (callback) => api.onPopupUpdate(callback),
});
attachWindowDrag(document.body, coalesceSteps((step) => api.moveWindow(step)));
// Settings is sized to hold its tallest page and About to hold its lines, so both keep their size;
// every other window can be resized.
const FIXED_SIZE = new Set(["settings", "about"]);
if (!FIXED_SIZE.has(spec?.type)) makeResizable(popup);

/**
 * The right edge, the bottom edge and the corner grip resize the window. Its top-left corner
 * stays put while it does, so the pointer's offset inside the page is the change in size.
 */
function makeResizable(el) {
  document.body.dataset.resizable = "true";
  for (const edge of ["right", "bottom", "corner"]) {
    const handle = document.createElement(edge === "corner" ? "button" : "div");
    handle.className = edge === "corner" ? "resize-grip popup-resize" : "popup-resize";
    handle.dataset.resize = edge;
    handle.dataset.gui = "popup-resize";
    if (edge === "corner") {
      handle.type = "button";
      handle.tabIndex = -1;
      handle.innerHTML = gripIcon();
    }
    handle.addEventListener("pointerdown", (event) => beginResize(event, edge));
    el.appendChild(handle);
  }
  const fill = () => {
    el.style.width = `${window.innerWidth}px`;
    el.style.height = `${window.innerHeight}px`;
  };
  window.addEventListener("resize", fill);
}

function beginResize(event, edge) {
  if (event.button != null && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const start = { x: event.clientX, y: event.clientY, width: window.innerWidth, height: window.innerHeight };
  // Held, so the drag keeps going when the pointer runs past the window's edge.
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch {
    /* synthetic pointer */
  }
  let wanted = null;
  let queued = false;
  const send = () => {
    queued = false;
    if (wanted) void api.resizePopup(wanted);
    wanted = null;
  };
  const move = (next) => {
    const dx = edge === "bottom" ? 0 : Math.round(next.clientX - start.x);
    const dy = edge === "right" ? 0 : Math.round(next.clientY - start.y);
    wanted = { width: start.width + dx, height: start.height + dy, keepCorner: true };
    if (!queued) {
      queued = true;
      requestAnimationFrame(send);
    }
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    document.body.classList.remove("is-resizing");
    send();
  };
  document.body.classList.add("is-resizing");
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}
