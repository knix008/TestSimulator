import { bootPopup } from "./ui/popups.js";
import { attachWindowDrag } from "./ui/window-drag.js";

const spec = await window.electronAPI.takePopupSpec();
bootPopup(spec, {
  finish: (result) => window.electronAPI.finishPopup(result),
  immediate: (message) => window.electronAPI.popupImmediate(message),
  onUpdate: (callback) => window.electronAPI.onPopupUpdate(callback),
});
attachWindowDrag(document.body, (step) => window.electronAPI.moveWindow(step));
