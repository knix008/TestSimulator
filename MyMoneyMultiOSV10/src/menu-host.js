import { applyThemeVars } from "./core/themes.js";
import { buildMenuElement, buildTrayColumn } from "./ui/menus.js";

const spec = await window.electronAPI.takeMenuSpec();
if (spec.theme?.vars) applyThemeVars(document.documentElement, spec.theme.vars, spec.theme.mode);
window.electronAPI.onApplyTheme?.((payload) => {
  if (payload?.vars) applyThemeVars(document.documentElement, payload.vars, payload.mode);
});

if (spec.kind === "tray") mountTrayMenu(spec);
else mountCommandMenu(spec);

function mountCommandMenu(spec) {
  const menu = buildMenuElement(spec.items || []);
  menu.style.position = "relative";
  document.body.appendChild(menu);
  menu.addEventListener("click", (event) => {
    const item = event.target.closest(".menu-item");
    if (!item || item.dataset.enabled === "false") return;
    window.electronAPI.menuCommand(item.dataset.cmd);
  });
}

function mountTrayMenu(spec) {
  const row = document.createElement("div");
  row.className = "tray-menu-row";
  row.style.display = "flex";
  row.style.flexDirection = "row";
  row.style.alignItems = "flex-start";
  row.style.justifyContent = "flex-start";
  row.style.width = "max-content";
  const main = buildTrayColumn(spec.items || []);
  const sub = document.createElement("div");
  row.append(main, sub);
  document.body.appendChild(row);
  const fit = () => {
    const rect = row.getBoundingClientRect();
    window.electronAPI.fitTrayMenu?.({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
  };
  const closeSub = () => {
    sub.replaceChildren();
    fit();
  };
  row.addEventListener("mouseover", (event) => {
    const parent = event.target.closest?.("[data-submenu]");
    if (!parent || !main.contains(parent)) {
      if (main.contains(event.target)) closeSub();
      return;
    }
    const entry = (spec.items || []).find((item) => item.id === parent.dataset.submenu);
    sub.replaceChildren(buildTrayColumn(entry?.submenu || []));
    fit();
  });
  row.addEventListener("mouseleave", closeSub);
  row.addEventListener("click", (event) => {
    const item = event.target.closest(".menu-item");
    if (!item || item.dataset.submenu || !item.dataset.cmd) return;
    window.electronAPI.menuCommand(item.dataset.cmd);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.electronAPI.menuCommand("");
  });
  requestAnimationFrame(fit);
}
