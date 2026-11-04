import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { host } from "./host.js";
import { sanitizeSettings } from "./settings.js";
import { applyTheme, setCustomThemes } from "./themes.js";
import "./icons.css";
import "./styles.css";

const settings = sanitizeSettings(await host.loadSettings().catch(() => ({})));
setCustomThemes(settings.customThemes);
applyTheme(settings.theme);
createRoot(document.getElementById("root")).render(<App initialSettings={settings} />);
requestAnimationFrame(() => requestAnimationFrame(() => void host.ready()));
