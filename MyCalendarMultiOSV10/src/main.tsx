import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SETTINGS } from "./domain/settings";
import { applyTheme, getTheme } from "./domain/themes";
import { isTauri } from "./platform/desktop";
import { App } from "./ui/App";
import "./styles.css";

document.documentElement.dataset.platform = isTauri() ? "desktop" : "web";
applyTheme(getTheme(DEFAULT_SETTINGS.themeId), DEFAULT_SETTINGS.opacity);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
