// Runs inside a dialog window. The main page moves the dialog into #host
// and calls these. Kept as a file because the window inherits the page's
// script policy, which does not allow eval.
//
// A dialog window cannot call the desktop shell itself (about:blank has no
// access to it), so it asks the main page's window.mycircuit, naming itself
// by the label the main page gave it (mycircuitDialogLabel).

function desktopApi() {
  try { return window.opener && window.opener.mycircuit; } catch { return null; }
}

// Size the window for the dialog and show it. The desktop shell centres it over
// the main window; a browser goes to x, y.
window.fitDialog = function (w, h, x, y) {
  const api = desktopApi();
  const label = window.mycircuitDialogLabel;
  if (api && api.fitDialog && label) {
    const zoom = Number(document.documentElement.dataset.uiScale) || 1;
    return api.fitDialog(label, Math.ceil(w * zoom), Math.ceil(h * zoom));
  }
  try { window.resizeTo(w | 0, h | 0); window.moveTo(x | 0, y | 0); } catch { /* the browser may ignore it */ }
};

window.syncDialogTheme = function (from) {
  const to = document.documentElement;
  to.lang = from.lang || "";
  to.dataset.theme = from.dataset.theme || "";
  to.dataset.themeId = from.dataset.themeId || "";
  to.dataset.uiScale = from.dataset.uiScale || "";
  to.style.cssText = from.style.cssText || "";
  const scale = Number(from.dataset.uiScale);
  const api = desktopApi();
  if (scale && api && api.setZoom && window.mycircuitDialogLabel) api.setZoom(scale, window.mycircuitDialogLabel);
  else if (from.style.zoom) to.style.zoom = from.style.zoom;
};

// The title row moves the window. Windows does that by the CSS app-region;
// the macOS and Linux webviews need to be asked.
document.addEventListener("mousedown", (e) => {
  const api = desktopApi();
  if (!api || api.nativeDragRegions || !api.startDragging || e.button !== 0) return;
  if (!e.target.closest || !e.target.closest(".modal-head") || e.target.closest("button, input, select, a")) return;
  e.preventDefault();
  api.startDragging(window.mycircuitDialogLabel);
});

window.mycircuitDialogReady = true;
