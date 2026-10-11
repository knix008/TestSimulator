// Runs inside a dialog window. The main page moves the dialog into #host
// and calls these. Kept as a file because the window inherits the page's
// script policy, which does not allow eval.

window.fitDialog = function (w, h, x, y) {
  const api = window.mycircuit;
  if (api && api.resizeWindow) return Promise.all([api.resizeWindow(w, h), api.placeWindow(x, y)]);
  try { window.resizeTo(w | 0, h | 0); window.moveTo(x | 0, y | 0); } catch { /* the browser may ignore it */ }
};

window.syncDialogTheme = function (from) {
  const to = document.documentElement;
  to.lang = from.lang || "";
  to.dataset.theme = from.dataset.theme || "";
  to.dataset.themeId = from.dataset.themeId || "";
  to.style.cssText = from.style.cssText || "";
  const scale = Number(from.dataset.uiScale);
  if (scale && window.mycircuit && window.mycircuit.setZoom) window.mycircuit.setZoom(scale);
  else if (from.style.zoom) to.style.zoom = from.style.zoom;
};

window.mycircuitDialogReady = true;
