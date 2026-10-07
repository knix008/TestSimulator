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

export function buildTrayMenu(t) {
  const item = (id, icon, label) => ({ id, icon, label });
  const group = (id, icon, label, submenu) => ({ id, icon, label, submenu });
  return [
    group("weather", "weather", t("tray.weather"), [
      item("refresh", "refresh", t("cmd.refresh")),
      item("daily", "daily", t("forecast.daily")),
      item("weekly", "weekly", t("forecast.weekly")),
      item("monthly", "monthly", t("forecast.monthly")),
    ]),
    group("file", "open", t("tray.file"), [
      item("new", "new", t("cmd.new")),
      item("open", "open", t("cmd.open")),
      item("save", "save", t("cmd.save")),
      item("save-as", "saveAs", t("cmd.saveAs")),
      item("print", "print", t("cmd.print")),
    ]),
    group("edit", "copy", t("tray.edit"), [
      item("undo", "undo", t("cmd.undo")),
      item("redo", "redo", t("cmd.redo")),
      item("copy", "copy", t("cmd.copy")),
      item("paste", "paste", t("cmd.paste")),
    ]),
    item("settings", "settings", t("cmd.settings")),
    item("about", "about", t("cmd.about")),
    { type: "separator" },
    item("exit", "exit", t("cmd.exit")),
  ];
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
