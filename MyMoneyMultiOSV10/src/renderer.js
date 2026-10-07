import { createApp } from "./app.js";
import { createHostPlatform } from "./platform/host.js";

const root = document.querySelector("#app");
try {
  const platform = createHostPlatform();
  document.body.dataset.host = platform.kind === "electron" ? "desktop" : "web";
  const app = createApp(root, {
    platform,
    autoLoad: true,
    reportGlobalErrors: true,
  });
  window.__mymoney = app;
  app.ready.catch((error) => app.reportError(error, "startup"));
} catch (error) {
  showStartupError(error);
}

function showStartupError(error) {
  const text = [
    "MyMoney failed to start.",
    `Time: ${new Date().toISOString()}`,
    `Environment: ${navigator.userAgent}`,
    "",
    error && error.stack ? error.stack : String(error),
  ].join("\n");
  const box = document.createElement("section");
  box.className = "startup-error";
  box.setAttribute("role", "alertdialog");
  const title = document.createElement("h1");
  title.textContent = "MyMoney";
  const area = document.createElement("textarea");
  area.readOnly = true;
  area.value = text;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy / 복사";
  copy.addEventListener("click", async () => {
    area.select();
    try {
      if (window.electronAPI?.clipboardWrite) await window.electronAPI.clipboardWrite(text);
      else await navigator.clipboard.writeText(text);
    } catch {
      document.execCommand?.("copy");
    }
  });
  box.append(title, area, copy);
  root.replaceChildren(box);
}
