import { createTauriApi } from "./platform/tauri-bridge.js";

// The page to print sits in a frame so this script outlives it. The window goes away
// once the print dialog closes, whether the person printed or cancelled.
const api = createTauriApi();
const frame = document.querySelector("iframe");
frame.addEventListener(
  "load",
  () => {
    const page = frame.contentWindow;
    page.addEventListener("afterprint", () => void api.closeSelf(), { once: true });
    setTimeout(() => page.print(), 50);
  },
  { once: true },
);
frame.srcdoc = (await api.takePrintHtml()) || "";
