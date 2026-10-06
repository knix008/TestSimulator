/**
 * The entry point, and the only router the app has.
 *
 * The same bundle is loaded by three kinds of window: the app itself, a menu popup
 * (`#menu=`) and a dialog popup (`#dialog=`). The hash decides which one mounts, so
 * the popups share the app's theme, strings and components without a second build.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { DialogWindow } from "./DialogHost.js";
import { MenuWindow } from "./MenuPopup.js";
import { AppProvider } from "./state.js";
import { installSmokeHooks } from "./smokeHooks.js";
import "./styles.css";

const hash = window.location.hash.replace(/^#/, "");
const container = document.getElementById("root");
if (!container) throw new Error("no #root element");

const root = createRoot(container);

if (hash.startsWith("menu=")) {
  document.documentElement.classList.add("popup", "popup-menu");
  root.render(<MenuWindow />);
} else if (hash.startsWith("dialog=")) {
  document.documentElement.classList.add("popup", "popup-dialog");
  root.render(<DialogWindow />);
} else {
  root.render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  );
  installSmokeHooks();
}
