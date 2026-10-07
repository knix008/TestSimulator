export const MENU_ROW = 32;
export const MENU_SEPARATOR = 9;

export function layoutMenu(items, anchor, windowRect) {
  const width = Math.max(
    240,
    ...items.map((item) => 52 + String(item.label || "").length * 8 + (item.shortcut ? String(item.shortcut).length * 7 + 16 : 0)),
  );
  const separators = items.filter((item, index) => item.separated && index > 0).length;
  const height = Math.max(MENU_ROW, items.length * MENU_ROW + separators * MENU_SEPARATOR + 12);
  return {
    x: anchor?.x ?? 0,
    y: anchor?.y ?? 0,
    screenX: anchor?.screenX ?? anchor?.x ?? 0,
    screenY: anchor?.screenY ?? anchor?.y ?? 0,
    width,
    height,
    columns: 1,
    clippedToWindow: false,
    windowRectIgnored: windowRect != null,
  };
}

export function menuWindowOptions(layout, parent) {
  return {
    parent: parent || null,
    frame: false,
    transparent: true,
    thickFrame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    x: Math.round(layout.screenX ?? layout.x),
    y: Math.round(layout.screenY ?? layout.y),
    width: Math.ceil(layout.width),
    height: Math.ceil(layout.height),
    useContentSize: true,
  };
}

export function popupWindowOptions(spec, parent, displayBounds) {
  const width = spec.width;
  const height = spec.height;
  const bounds = displayBounds || { x: 0, y: 0, width: 1280, height: 800 };
  return {
    parent: parent || null,
    modal: false,
    frame: false,
    transparent: true,
    thickFrame: false,
    backgroundColor: "#00000000",
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    useContentSize: true,
    width,
    height,
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2),
  };
}
