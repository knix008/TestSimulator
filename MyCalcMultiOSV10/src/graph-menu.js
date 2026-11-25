// The right-click menu on the 2D and 3D plot: save as a picture, copy, print,
// the graph theme, the background colour, the common switches, and the guide.
// The switches press the toolbar's own buttons, so both stay in step.

const BACKGROUND_SWATCHES = [
  "#ffffff", "#f5f5f4", "#fdf6e3", "#e0f2fe",
  "#dcfce7", "#fce7f3", "#1c1917", "#000000",
  "#0f172a", "#1e3a8a", "#14532d", "#3b0764",
];

let graphMenuEl = null;
let graphMenuReturn = null;

function closeGraphMenu() {
  if (!graphMenuEl) return;
  graphMenuEl.remove();
  graphMenuEl = null;
  document.removeEventListener("pointerdown", graphMenuOutside, true);
  window.removeEventListener("blur", closeGraphMenu);
  window.removeEventListener("resize", closeGraphMenu);
  if (graphMenuReturn && typeof graphMenuReturn.focus === "function") graphMenuReturn.focus({ preventScroll: true });
  graphMenuReturn = null;
}

function graphMenuOutside(ev) {
  if (graphMenuEl && !graphMenuEl.contains(ev.target)) closeGraphMenu();
}

function graphMenuChanged() {
  renderFunctions();
  syncGraphChrome();
  syncViewFields();
  if (typeof syncSidePanel === "function") syncSidePanel();
  publishGraph();
}

function menuItem({ label, check = null, run = null, submenu = null, swatch = "", disabled = false, id = "" }) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "ctx-item";
  item.setAttribute("role", check === null ? "menuitem" : "menuitemcheckbox");
  if (id) item.dataset.menu = id;
  if (check !== null) item.setAttribute("aria-checked", String(!!check));
  item.disabled = disabled;
  const mark = document.createElement("span");
  mark.className = "ctx-check";
  mark.textContent = check ? "✓" : "";
  item.append(mark);
  if (swatch) {
    const chip = document.createElement("span");
    chip.className = "ctx-swatch";
    chip.style.background = swatch;
    item.append(chip);
  }
  const text = document.createElement("span");
  text.className = "ctx-label";
  text.textContent = label;
  item.append(text);
  if (submenu) {
    item.setAttribute("aria-haspopup", "menu");
    item.setAttribute("aria-expanded", "false");
    const arrow = document.createElement("span");
    arrow.className = "ctx-arrow";
    arrow.textContent = "›";
    item.append(arrow);
    const open = () => openGraphSubmenu(item, submenu);
    item.addEventListener("pointerenter", open);
    item.addEventListener("click", open);
    item.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        open();
        item.querySelector(".ctx-menu .ctx-item:not(:disabled)")?.focus();
      }
    });
  } else if (run) {
    item.addEventListener("click", () => {
      closeGraphMenu();
      run();
    });
    item.addEventListener("pointerenter", () => closeGraphSubmenus(item.parentElement));
  }
  return item;
}

function menuSeparator() {
  const line = document.createElement("div");
  line.className = "ctx-sep";
  line.setAttribute("role", "separator");
  return line;
}

function closeGraphSubmenus(menu) {
  if (!menu) return;
  for (const open of menu.querySelectorAll(":scope > .ctx-item > .ctx-menu")) {
    open.parentElement.setAttribute("aria-expanded", "false");
    open.remove();
  }
}

function openGraphSubmenu(item, build) {
  const parent = item.parentElement;
  if (item.querySelector(":scope > .ctx-menu")) return;
  closeGraphSubmenus(parent);
  const sub = document.createElement("div");
  sub.className = "ctx-menu ctx-sub";
  sub.setAttribute("role", "menu");
  for (const child of build()) sub.append(child);
  item.append(sub);
  item.setAttribute("aria-expanded", "true");
  // To the right of the item, or to its left where the window ends; never
  // past the bottom.
  const box = item.getBoundingClientRect();
  const width = sub.offsetWidth;
  const height = sub.offsetHeight;
  const roomRight = window.innerWidth - box.right;
  sub.style.left = roomRight >= width + 4 ? `${box.width - 2}px` : `${-width + 2}px`;
  const top = Math.min(0, window.innerHeight - 6 - (box.top + height));
  sub.style.top = `${Math.max(-box.top + 6, top) - 5}px`;
  sub.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft" || ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      sub.remove();
      item.setAttribute("aria-expanded", "false");
      item.focus();
    }
  });
}

function themeItems() {
  return GRAPH_THEMES.map((theme) =>
    menuItem({
      id: `theme-${theme.id}`,
      label: uiLang === "en" ? theme.en : theme.ko,
      check: board.graphTheme === theme.id,
      swatch: theme.bg || "",
      run: () => {
        board.setGraphTheme(theme.id);
        graphMenuChanged();
      },
    }),
  );
}

function backgroundItems() {
  const items = [
    menuItem({
      id: "bg-theme",
      label: uiText("테마 기본", "Theme default"),
      check: !board.background,
      run: () => {
        board.setBackground(null);
        graphMenuChanged();
      },
    }),
  ];
  const grid = document.createElement("div");
  grid.className = "ctx-swatches";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", uiText("배경 색", "Background colour"));
  for (const color of BACKGROUND_SWATCHES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ctx-color";
    chip.dataset.color = color;
    chip.style.background = color;
    chip.setAttribute("aria-label", color);
    chip.dataset.tooltip = color;
    chip.setAttribute("aria-pressed", String(board.background === color));
    chip.addEventListener("click", () => {
      closeGraphMenu();
      board.setBackground(color);
      graphMenuChanged();
    });
    grid.append(chip);
  }
  items.push(grid);
  items.push(
    menuItem({
      id: "bg-custom",
      label: uiText("사용자 지정…", "Custom…"),
      swatch: board.background && !BACKGROUND_SWATCHES.includes(board.background) ? board.background : "",
      run: () => {
        const picker = document.getElementById("graphBackgroundPicker");
        if (!picker) return;
        picker.value = board.backgroundColor() || "#ffffff";
        picker.click();
      },
    }),
  );
  return items;
}

function graphMenuEntries() {
  const is3d = board.dimension === "3d";
  const press = (id) => () => document.getElementById(id)?.click();
  const entries = [
    menuItem({ id: "save", label: uiText("이미지로 저장…", "Save as image…"), run: openExportSheet }),
    menuItem({ id: "copy", label: uiText("이미지 복사", "Copy image"), run: copyGraphImage }),
    menuItem({ id: "print", label: uiText("인쇄…", "Print…"), run: openPrintWindow }),
    menuSeparator(),
    menuItem({ id: "theme", label: uiText("그래프 테마", "Graph theme"), submenu: themeItems }),
    menuItem({ id: "background", label: uiText("배경 색", "Background colour"), submenu: backgroundItems }),
    menuSeparator(),
    menuItem({ id: "grid", label: uiText("격자", "Grid"), check: board.showGrid, run: press("gridToggle") }),
    menuItem({ id: "legend", label: uiText("범례", "Legend"), check: board.showLegend, run: press("legendToggle") }),
  ];
  if (is3d) {
    entries.push(menuItem({ id: "values", label: uiText("축 값", "Axis values"), check: board.showAxisValues, run: press("axisToggle") }));
    entries.push(menuItem({ id: "box", label: uiText("범위 상자", "Range box"), check: board.showBox, run: press("boxToggle") }));
    entries.push(menuItem({ id: "heat", label: uiText("온도 바", "Colour bar"), check: board.showHeat, run: press("heatToggle") }));
  } else {
    entries.push(menuItem({ id: "ruler", label: uiText("눈금자", "Ruler"), check: board.showRuler, run: press("rulerToggle") }));
  }
  entries.push(menuItem({ id: "reset", label: uiText("보기 초기화", "Reset view"), run: press("resetView") }));
  entries.push(menuSeparator());
  entries.push(menuItem({ id: "guide", label: uiText("사용 설명서", "User guide"), run: () => openChildWindow("guide") }));
  return entries;
}

function openGraphMenu(x, y) {
  closeGraphMenu();
  graphMenuReturn = document.activeElement;
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "graphMenu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", uiText("그래프 메뉴", "Graph menu"));
  for (const entry of graphMenuEntries()) menu.append(entry);
  document.body.append(menu);
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - height - 4))}px`;
  graphMenuEl = menu;
  menu.addEventListener("keydown", graphMenuKeys);
  document.addEventListener("pointerdown", graphMenuOutside, true);
  window.addEventListener("blur", closeGraphMenu);
  window.addEventListener("resize", closeGraphMenu);
  menu.querySelector(".ctx-item")?.focus({ preventScroll: true });
  return menu;
}

function graphMenuKeys(ev) {
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    closeGraphMenu();
    return;
  }
  if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Home" && ev.key !== "End") return;
  const menu = ev.target.closest(".ctx-menu");
  if (!menu) return;
  const items = [...menu.querySelectorAll(":scope > .ctx-item:not(:disabled), :scope > .ctx-swatches > .ctx-color")];
  if (!items.length) return;
  ev.preventDefault();
  ev.stopPropagation();
  const at = items.indexOf(document.activeElement);
  let next = 0;
  if (ev.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % items.length;
  else if (ev.key === "ArrowUp") next = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
  else if (ev.key === "End") next = items.length - 1;
  items[next].focus();
}

function openExportSheet() {
  const sheet = document.getElementById("exportSheet");
  if (!sheet) return;
  sheet.hidden = false;
  syncExportAlpha();
  document.getElementById("exportFormat")?.focus();
}

// The plot as a PNG on the clipboard, on its own background.
async function copyGraphImage() {
  const previous = board.paintBackdrop;
  board.paintBackdrop = true;
  board.draw();
  try {
    const blob = await canvasBlob(board.canvas, "image/png");
    if (!navigator.clipboard || typeof ClipboardItem !== "function") throw new Error("clipboard");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    if (typeof memoToast === "function") memoToast(uiText("그래프를 복사했습니다", "Graph copied"));
  } catch {
    reportInput(uiText("그래프를 복사하지 못했습니다.", "Could not copy the graph."));
  } finally {
    board.paintBackdrop = previous;
    board.draw();
  }
}

function bindGraphMenu() {
  const canvas = board.canvas;
  if (!canvas) return;
  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    // The desktop shell's own edit menu stays away from the plot.
    ev.stopPropagation();
    openGraphMenu(ev.clientX, ev.clientY);
  });
  // Shift+F10 and the menu key open it from the keyboard, at the plot's corner.
  canvas.addEventListener("keydown", (ev) => {
    if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) {
      ev.preventDefault();
      const box = canvas.getBoundingClientRect();
      openGraphMenu(box.left + 24, box.top + 24);
    }
  });
  const picker = document.getElementById("graphBackgroundPicker");
  if (picker) {
    picker.addEventListener("input", () => {
      board.setBackground(picker.value);
      graphMenuChanged();
    });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && graphMenuEl) {
      ev.preventDefault();
      ev.stopPropagation();
      closeGraphMenu();
    }
  }, true);
}

bindGraphMenu();
