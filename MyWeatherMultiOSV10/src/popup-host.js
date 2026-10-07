import { bootPopup } from "./ui/popups.js";

const spec = await window.electronAPI.takePopupSpec();
bootPopup(spec, {
  finish: (result) => window.electronAPI.finishPopup(result),
  immediate: (message) => window.electronAPI.popupImmediate(message),
  onUpdate: (callback) => window.electronAPI.onPopupUpdate(callback),
});
