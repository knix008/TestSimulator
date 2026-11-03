import { installTauriBridge } from "./tauriBridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, setCustomThemes, type CustomTheme } from "../core/themes";
import { api } from "./api";
import { App } from "./App";
import { ToolWindow } from "./ToolWindow";
import { readToolRequest } from "./toolLaunch";
import { GuideWindow } from "./GuideWindow";
import * as host from "./host";
import { DialogWindow, InlinePopups, MenuWindow, paintSettings, popupRoute } from "./popupWindow";
import "./popupRegistrations";
import "./styles.css";
import "./icons.css";
import "./menuLabels.css";

// Before React renders: App reads window.mgm to choose folder dialogs and window controls.
installTauriBridge();

/** Every window but the menu keeps its native background in its theme's colour. */
function followThemeBackground(): void {
  const root = document.documentElement;
  const update = () => host.setBackgroundColor(getComputedStyle(root).getPropertyValue("--bg").trim());
  root.addEventListener("mygit-theme", update);
  // A user theme edited in place keeps its id, so no theme event: follow saved settings too.
  host.onSettingsPublished(() => requestAnimationFrame(update));
  update();
}

/**
 * Windows other than the main one (Diff / Merge tools, the guide) keep the current
 * theme: they follow settings published by any window, and read the saved settings
 * again whenever they come forward — a window reused for a new file or section may
 * have missed a change.
 */
function followSettings(): void {
  host.onSettingsPublished(paintSettings);
  const refresh = () => {
    if (document.visibilityState === "visible") host.loadSettings().then(paintSettings).catch(() => {});
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("hashchange", refresh);
  document.addEventListener("visibilitychange", refresh);
}

async function start() {
  const route = popupRoute();
  const root = createRoot(document.getElementById("root")!);

  // Popup windows (#menu=, #dialog=, #guide): they load their own settings and are shown
  // by the shell (menus, dialogs) or once painted (the guide).
  if (route) {
    document.documentElement.classList.add("popup-root");
    if (route.kind === "menu") document.documentElement.classList.add("menu-root");
    else followThemeBackground();
    if (route.kind === "guide") followSettings();
    await host.loadSettings().then(paintSettings).catch(() => applyTheme(null));
    root.render(
      <StrictMode>
        {route.kind === "menu" ? <MenuWindow /> : route.kind === "dialog" ? <DialogWindow /> : <GuideWindow section={route.section} />}
      </StrictMode>,
    );
    return;
  }

  try {
    const boot = await api.bootstrap();
    setCustomThemes(boot.settings.customThemes as CustomTheme[] | undefined);
    applyTheme(boot.settings.theme);
  } catch {
    applyTheme(null);
  }
  followThemeBackground();
  if (readToolRequest()) followSettings();
  root.render(
    <StrictMode>
      {readToolRequest() ? <ToolWindow /> : <><App /><InlinePopups /></>}
    </StrictMode>,
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.mgm?.window?.themeReady?.());
  });
}

void start();
