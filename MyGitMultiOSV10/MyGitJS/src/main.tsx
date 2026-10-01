import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme } from "../core/themes";
import { api } from "./api";
import { App } from "./App";
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
      <App />
    </StrictMode>,
  );
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.mygit?.window?.themeReady?.());
  });
}

void start();
