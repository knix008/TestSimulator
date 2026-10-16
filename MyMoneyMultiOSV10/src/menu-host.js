import { createI18n } from "./core/i18n.js";
import { sanitizeSettings, windowLabel } from "./core/settings.js";
import { DEFAULT_THEME_ID, applyThemeVars, themeColors, themeVars } from "./core/themes.js";
import { createTauriApi } from "./platform/tauri-bridge.js";
import { buildMenuElement, buildTrayColumn } from "./ui/menus.js";
import { buildTrayMenu } from "./ui/tray-menu.js";

const api = createTauriApi();
const spec = (await api.takeMenuSpec()) || {};
if (spec.kind === "tray") Object.assign(spec, await traySpec(spec));
if (spec.theme?.vars) applyThemeVars(document.documentElement, spec.theme.vars, spec.theme.mode);
api.onApplyTheme((payload) => {
  if (payload?.vars) applyThemeVars(document.documentElement, payload.vars, payload.mode);
});

if (spec.kind === "tray") mountTrayMenu(spec);
else mountCommandMenu(spec);

/**
 * The tray menu is built here, in the saved language and theme. Rust sends the open windows
 * with their boards; each is named the way the window list always named it.
 */
async function traySpec(base) {
  const settings = sanitizeSettings(await api.readSettings());
  const i18n = createI18n(settings.language);
  const windows = (Array.isArray(base.windows) ? base.windows : []).map((entry, index) => ({
    slot: entry.slot,
    label: windowLabel(entry.board, settings.language, index),
    active: Boolean(entry.active),
    visible: Boolean(entry.visible),
  }));
  const items = buildTrayMenu((key) => i18n.t(key), { windows, canAddWindow: base.canAddWindow !== false });
  const colors = themeColors(settings.theme || DEFAULT_THEME_ID, settings.customTheme);
  return { items, theme: { vars: themeVars(colors, 0), mode: colors.mode } };
}

function mountCommandMenu(spec) {
  const menu = buildMenuElement(spec.items || []);
  menu.style.position = "relative";
  document.body.appendChild(menu);
  menu.addEventListener("click", (event) => {
    const item = event.target.closest(".menu-item");
    if (!item || item.dataset.enabled === "false") return;
    api.menuCommand(item.dataset.cmd);
  });
  // The window opens hidden at the layout's size and is shown once it fits the menu.
  const fit = () => api.fitMenu({ width: Math.ceil(menu.offsetWidth), height: Math.ceil(menu.offsetHeight) });
  requestAnimationFrame(fit);
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
    api.fitTrayMenu({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
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
    api.menuCommand(item.dataset.cmd);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") api.menuCommand("");
  });
  requestAnimationFrame(fit);
}
