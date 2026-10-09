export function programIconFile(platform) {
  if (platform === "win32") return "assets/icon.ico";
  if (platform === "darwin") return "assets/icon.icns";
  return "assets/icon.png";
}

export function trayIconFile(platform) {
  return platform === "win32" ? "assets/icon.ico" : "assets/icon.png";
}

export function menuIconFile(name) {
  return `assets/menu/${name}.png`;
}

function item(id, icon, label) {
  return { id, icon, label };
}

function group(id, icon, label, submenu) {
  return { id, icon, label, submenu };
}

/**
 * The tray menu. Data is kept in the settings file as it changes, so there is
 * no File menu; the Windows group opens another window or brings one back.
 * `options.windows` is [{ slot, label, active }] for every open window.
 */
export function buildTrayMenu(t, options = {}) {
  return [
    item("show-window", "show", t("tray.show")),
    group("windows", "window", t("tray.windows"), windowItems(t, options)),
    group("market", "market", t("tray.market"), [
      item("refresh", "refresh", t("cmd.refresh")),
      item("stocks", "stocks", t("panel.stocks")),
      item("rates", "rates", t("panel.rates")),
      item("news", "news", t("panel.news")),
    ]),
    group("edit", "copy", t("tray.edit"), [
      item("undo", "undo", t("cmd.undo")),
      item("redo", "redo", t("cmd.redo")),
      item("copy", "copy", t("cmd.copy")),
      item("paste", "paste", t("cmd.paste")),
      item("print", "print", t("cmd.print")),
    ]),
    item("settings", "settings", t("cmd.settings")),
    item("about", "about", t("cmd.about")),
    { type: "separator" },
    item("exit", "exit", t("cmd.exit")),
  ];
}

function windowItems(t, options) {
  const items = [];
  if (options.canAddWindow !== false) items.push(item("new-window", "window", t("cmd.newWindow")));
  const windows = Array.isArray(options.windows) ? options.windows : [];
  if (windows.length && items.length) items.push({ type: "separator" });
  for (const entry of windows) {
    items.push(item(`window:${entry.slot}`, "board", entry.active ? `● ${entry.label}` : entry.label));
  }
  return items;
}

export function trayMenuSize(menu) {
  let height = 8;
  let width = 200;
  for (const entry of menu || []) {
    if (entry.type === "separator") height += 9;
    else {
      height += 32;
      width = Math.max(width, 56 + String(entry.label || "").length * 14);
    }
  }
  return { width, height };
}

/** Keep the menu's left edge on the tray icon, then slide it back onto the screen. */
export function placeTrayMenu(icon, size, workArea) {
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  let x = Math.round(icon?.x || 0);
  let y = Math.round((icon?.y || 0) - height);
  if ((icon?.y || 0) <= workArea.y + 4) y = Math.round((icon?.y || 0) + (icon?.height || 0));
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  if (x + width > right) x = Math.round(right - width);
  if (x < workArea.x) x = Math.round(workArea.x);
  if (y + height > bottom) y = Math.round(bottom - height);
  if (y < workArea.y) y = Math.round(workArea.y);
  return { x, y, width, height };
}

export function listTrayItems(menu) {
  const items = [];
  for (const entry of menu || []) {
    if (entry.type === "separator") continue;
    items.push(entry);
    if (entry.submenu) items.push(...listTrayItems(entry.submenu));
  }
  return items;
}
