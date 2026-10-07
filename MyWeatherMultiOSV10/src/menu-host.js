import { applyThemeVars } from "./core/themes.js";
import { buildMenuElement } from "./ui/menus.js";

const spec = await window.electronAPI.takeMenuSpec();
if (spec.theme?.vars) applyThemeVars(document.documentElement, spec.theme.vars, spec.theme.mode);
const menu = buildMenuElement(spec.items || []);
menu.style.position = "relative";
document.body.appendChild(menu);
menu.addEventListener("click", (event) => {
  const item = event.target.closest(".menu-item");
  if (!item || item.dataset.enabled === "false") return;
  window.electronAPI.menuCommand(item.dataset.cmd);
});
