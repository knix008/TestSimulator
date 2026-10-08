export const MENU_ROW = 32;
export const MENU_SEPARATOR = 9;

/**
 * Room a label needs at the menu's 13px font. Korean glyphs are about twice
 * as wide as Latin ones, so counting characters alone makes the window too
 * narrow and the shortcut on the right ends up against its edge.
 */
function labelWidth(text, narrow = 7.5, wide = 14) {
  let total = 0;
  for (const ch of String(text || "")) {
    const code = ch.codePointAt(0);
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    total += isWide ? wide : narrow;
  }
  return total;
}

/**
 * Icon, gaps and padding around a row, plus the breathing space the shortcut
 * keeps from the right edge.
 */
const MENU_ROW_CHROME = 8 + 2 + 8 + 16 + 9 + 14;
const MENU_SHORTCUT_GAP = 20;

export function layoutMenu(items, anchor, windowRect) {
  const width = Math.ceil(
    Math.max(
      240,
      ...items.map(
        (item) =>
          MENU_ROW_CHROME +
          labelWidth(item.label) +
          (item.shortcut ? MENU_SHORTCUT_GAP + labelWidth(item.shortcut, 7, 12) : 0),
      ),
    ),
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
    show: false,
    x: Math.round(layout.screenX ?? layout.x),
    y: Math.round(layout.screenY ?? layout.y),
    width: Math.ceil(layout.width),
    height: Math.ceil(layout.height),
    useContentSize: true,
  };
}

const BESIDE_GAP = 16;
const COMPANION_POPUPS = new Set(["panel", "settings", "about"]);
const ONE_WINDOW = new Set(["panel", "settings", "about", "print", "preview", "unsaved"]);

export function popupKey(spec) {
  if (!spec?.type) return "popup";
  if (spec.type === "panel") return `panel:${spec.panel || "stocks"}`;
  return spec.type;
}

export function keepsOneWindow(spec) {
  return ONE_WINDOW.has(spec?.type);
}

function clampPopupOrigin(x, y, size, area) {
  const maxX = area.x + Math.max(0, area.width - size.width);
  const maxY = area.y + Math.max(0, area.height - size.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(x, maxX))),
    y: Math.round(Math.max(area.y, Math.min(y, maxY))),
  };
}

function fitsPopup(origin, size, area) {
  return origin.x >= area.x && origin.y >= area.y && origin.x + size.width <= area.x + area.width && origin.y + size.height <= area.y + area.height;
}

/** Keep a companion window beside the main window so both stay visible. */
export function placeBeside(parent, size, workArea) {
  const area = workArea || { x: 0, y: 0, width: 1280, height: 800 };
  const frame = parent || { x: area.x, y: area.y, width: 0, height: 0 };
  const y = frame.y + (frame.height - size.height) / 2;
  const candidates = [
    { x: frame.x + frame.width + BESIDE_GAP, y },
    { x: frame.x - size.width - BESIDE_GAP, y },
    { x: frame.x + (frame.width - size.width) / 2, y: frame.y + frame.height + BESIDE_GAP },
    { x: frame.x + (frame.width - size.width) / 2, y: frame.y - size.height - BESIDE_GAP },
  ];
  for (const spot of candidates) {
    if (fitsPopup(spot, size, area)) return clampPopupOrigin(spot.x, spot.y, size, area);
  }
  const parentMid = frame.x + frame.width / 2;
  const areaMid = area.x + area.width / 2;
  const parkX = parentMid <= areaMid ? area.x + area.width - size.width : area.x;
  return clampPopupOrigin(parkX, frame.y, size, area);
}

export function popupWindowOptions(spec, parent, displayBounds, parentBounds) {
  const width = spec.width;
  const height = spec.height;
  const bounds = displayBounds || { x: 0, y: 0, width: 1280, height: 800 };
  const beside = COMPANION_POPUPS.has(spec.type) && parentBounds;
  const spot = beside
    ? placeBeside(parentBounds, { width, height }, bounds)
    : { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2 };
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
    x: Math.round(spot.x),
    y: Math.round(spot.y),
  };
}
