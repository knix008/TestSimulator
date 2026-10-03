import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme } from "../core/themes";
import { api } from "./api";
import { App } from "./App";
import { ToolWindow } from "./ToolWindow";
import { readToolRequest } from "./toolLaunch";
import "./styles.css";

async function start() {
  try {
    const boot = await api.bootstrap();
    applyTheme(boot.settings.theme);
  } catch {
    applyTheme(null);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {readToolRequest() ? <ToolWindow /> : <App />}
    </StrictMode>,
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.mygit?.window?.themeReady?.());
  });
}

void start();
