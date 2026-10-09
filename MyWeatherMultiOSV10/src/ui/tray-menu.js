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

export function buildTrayMenu(t, options = {}) {
  return [
    item("show-window", "show", t("tray.show")),
    group("weather", "weather", t("tray.weather"), [
      item("refresh", "refresh", t("cmd.refresh")),
      item("daily", "daily", t("forecast.daily")),
      item("weekly", "weekly", t("forecast.weekly")),
      item("monthly", "monthly", t("forecast.monthly")),
    ]),
    group("cities", "city", t("tray.cities"), cityItems(t, options)),
    group("edit", "copy", t("tray.edit"), [
      item("print", "print", t("cmd.print")),
      item("copy", "copy", t("cmd.copy")),
      item("paste", "paste", t("cmd.paste")),
    ]),
    item("settings", "settings", t("cmd.settings")),
    item("about", "about", t("cmd.about")),
    { type: "separator" },
    item("exit", "exit", t("cmd.exit")),
  ];
}

/** The tray lists the cities the window rotates through so one can be shown without opening it. */
function cityItems(t, options) {
  const cities = Array.isArray(options.cities) ? options.cities : [];
  const language = options.language === "en" ? "en" : "ko";
  const active = Number(options.activeIndex) || 0;
  const items = [item("next-city", "next", t("cmd.nextCity")), item("add-city", "add", t("cmd.addCity")), item("new-window", "window", t("cmd.newWindow"))];
  if (!cities.length) return items;
  items.push({ type: "separator" });
  cities.forEach((place, index) => {
    const name = language === "ko" ? place.cityKo || place.cityEn : place.cityEn || place.cityKo;
    items.push(item(`city:${index}`, "city", index === active ? `● ${name}` : name));
  });
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
