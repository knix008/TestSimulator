import { icon } from "./icons.js";

export function buildMenuItems(name, ctx) {
  const t = ctx.t;
  if (name === "window") {
    // Boards are kept in the settings as they change, so there is nothing to
    // open or save by hand. A window can hold its own board instead.
    const windows = [];
    if (ctx.canAddWindow !== false) windows.push(item("new-window", "window", t("cmd.newWindow"), "", true, true));
    if (ctx.canRemoveWindow) windows.push(item("remove-window", "trash", t("cmd.removeWindow"), "", true, !windows.length));
    return [
      item("refresh", "refresh", t("cmd.refresh"), "F5", true),
      item("undo", "undo", t("cmd.undo"), "Ctrl+Z", ctx.canUndo, true),
      item("redo", "redo", t("cmd.redo"), "Ctrl+Y", ctx.canRedo),
      item("copy", "copy", t("cmd.copy"), "Ctrl+C", true),
      item("paste", "paste", t("cmd.paste"), "Ctrl+V", true),
      item("print", "print", t("cmd.print"), "Ctrl+P", true),
      ...windows,
      item("add-tab", "add", t("cmd.addTab"), "", true, true),
      item("close-tab", "close", t("cmd.closeTab"), "", true),
      item("choose-wallpaper", "image", t("cmd.chooseWallpaper"), "", true, true),
      item("clear-wallpaper", "trash", t("cmd.clearWallpaper"), "", true),
      item("settings", "settings", t("cmd.settings"), "Ctrl+,", true, true),
      item("about", "about", t("cmd.about"), "", true),
      item("exit", "exit", t("cmd.exit"), "", true, true),
    ];
  }
  if (name === "context") {
    return [
      item("copy", "copy", t("cmd.copySummary"), "", true),
      item("next-symbol", "next", t("cmd.nextSymbol"), "", ctx.canCycle !== false),
      item("stocks", "stocks", t("cmd.stocks"), "", true),
      item("add-symbol", "add", t("cmd.addSymbol"), "", true),
      item("remove-symbol", "trash", t("cmd.removeSymbol"), "", ctx.canRemoveSymbol !== false),
      item("toggle-favorite", "favorite", t("cmd.toggleFavorite"), "", true),
      item("refresh", "refresh", t("cmd.refresh"), "", true, true),
      item("choose-wallpaper", "image", t("cmd.chooseWallpaper"), "", true, true),
      item("clear-wallpaper", "trash", t("cmd.clearWallpaper"), "", true),
    ];
  }
  return [];
}

export function buildMenuElement(items) {
  const menu = document.createElement("div");
  menu.className = "menu-popup";
  menu.dataset.columns = "1";
  menu.dataset.clipped = "false";
  menu.setAttribute("role", "menu");
  menu.style.display = "flex";
  menu.style.flexDirection = "column";
  menu.style.columnCount = "1";
  menu.style.maxWidth = "none";
  menu.style.overflow = "visible";
  menu.style.whiteSpace = "nowrap";
  for (const entry of items) {
    if (entry.separated && menu.childElementCount) {
      const line = document.createElement("div");
      line.className = "menu-sep";
      line.setAttribute("role", "separator");
      menu.appendChild(line);
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "menu-item";
    row.setAttribute("role", "menuitem");
    row.dataset.gui = "menu-item";
    row.dataset.cmd = entry.id;
    row.dataset.enabled = entry.enabled === false ? "false" : "true";
    row.disabled = entry.enabled === false;
    row.title = entry.label;
    row.style.display = "flex";
    row.style.flexDirection = "row";
    row.style.alignItems = "center";
    row.style.whiteSpace = "nowrap";
    row.style.height = "32px";
    row.style.overflow = "hidden";
    row.innerHTML = `<span class="menu-icon">${icon(entry.icon, { colorful: true })}</span><span class="menu-label"></span><span class="menu-key"></span>`;
    row.querySelector(".menu-label").textContent = entry.label;
    row.querySelector(".menu-key").textContent = entry.shortcut || "";
    menu.appendChild(row);
  }
  return menu;
}

export function buildTrayColumn(entries) {
  const menu = document.createElement("div");
  menu.className = "menu-popup";
  menu.dataset.align = "left";
  menu.style.display = "flex";
  menu.style.flexDirection = "column";
  menu.style.alignItems = "stretch";
  menu.style.textAlign = "left";
  menu.setAttribute("role", "menu");
  for (const entry of entries || []) {
    if (entry.type === "separator") {
      const line = document.createElement("div");
      line.className = "menu-sep";
      line.setAttribute("role", "separator");
      menu.appendChild(line);
      continue;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "menu-item";
    row.setAttribute("role", "menuitem");
    row.dataset.cmd = entry.id || "";
    if (entry.submenu) row.dataset.submenu = entry.id;
    row.title = entry.label || "";
    row.style.display = "flex";
    row.style.flexDirection = "row";
    row.style.justifyContent = "flex-start";
    row.style.alignItems = "center";
    row.style.textAlign = "left";
    row.style.width = "100%";
    row.innerHTML = `<span class="menu-icon">${icon(entry.icon, { colorful: true })}</span><span class="menu-label"></span>`;
    row.querySelector(".menu-label").textContent = entry.label || "";
    if (entry.submenu) {
      const caret = document.createElement("span");
      caret.className = "menu-caret";
      caret.textContent = "›";
      caret.style.marginLeft = "auto";
      row.appendChild(caret);
    }
    menu.appendChild(row);
  }
  return menu;
}

function item(id, iconName, label, shortcut, enabled, separated = false) {
  return { id, icon: iconName, label, shortcut, enabled: enabled !== false, separated };
}
