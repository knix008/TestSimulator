/** Gap kept between a context menu and the edge of the window or the work area. */
export const MENU_MARGIN = 6;

export interface WorkArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** The window's client origin, in the same coordinates as `left`/`top`. */
  windowX: number;
  windowY: number;
}

export interface MenuPlace {
  left: number;
  top: number;
  /** How far the window has to grow on each side so the whole menu stays on screen. */
  padLeft: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  /** Set when the menu is larger than the area it can occupy, and must scroll. */
  maxWidth: number | null;
  maxHeight: number | null;
}

export function currentWorkArea(): WorkArea {
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = screen.availLeft ?? 0;
  const top = screen.availTop ?? 0;
  return {
    left,
    top,
    right: left + (screen.availWidth || window.innerWidth),
    bottom: top + (screen.availHeight || window.innerHeight),
    windowX: window.screenX || 0,
    windowY: window.screenY || 0,
  };
}

export function menuNeedsRoom(place: MenuPlace): boolean {
  return place.padLeft >= 0.5 || place.padTop >= 0.5 || place.padRight >= 0.5 || place.padBottom >= 0.5;
}

interface AxisPlace {
  position: number;
  padStart: number;
  padEnd: number;
  max: number | null;
}

/**
 * Opens down and to the right of the cursor. Flips the other way when that keeps the menu on screen
 * with less growth. When `grow` is set, any part that still sticks out of the window is reported as
 * padding the window must gain; the menu itself is not shrunk to the window.
 */
function placeAxis(
  cursor: number,
  size: number,
  windowSize: number,
  windowOrigin: number,
  workStart: number,
  workEnd: number,
  grow: boolean,
): AxisPlace {
  if (!grow) {
    const max = Math.max(0, windowSize - MENU_MARGIN * 2);
    const used = Math.min(size, max);
    let origin = cursor;
    if (origin + used > windowSize - MENU_MARGIN) origin = cursor - used;
    origin = Math.min(Math.max(MENU_MARGIN, origin), Math.max(MENU_MARGIN, windowSize - MENU_MARGIN - used));
    return { position: origin, padStart: 0, padEnd: 0, max: size - used > 0.5 ? max : null };
  }

  const room = Math.max(0, workEnd - workStart - MENU_MARGIN * 2);
  const used = Math.min(size, room);
  const max = size - used > 0.5 ? room : null;
  const start = workStart + MENU_MARGIN;
  const end = workEnd - MENU_MARGIN;
  const winStart = windowOrigin;
  const winEnd = windowOrigin + windowSize;
  const fitted = (origin: number) => {
    if (used <= 0) return start;
    if (origin < start) return start;
    if (origin + used > end) return Math.max(start, end - used);
    return origin;
  };
  const growth = (origin: number) => {
    const at = fitted(origin);
    const off = Math.max(0, start - at) + Math.max(0, at + used - end);
    const newStart = Math.min(winStart, at);
    const newEnd = Math.max(winEnd, at + used);
    return off * 1_000_000 + (winStart - newStart) + (newEnd - winEnd);
  };
  const forward = windowOrigin + cursor;
  const backward = forward - used;
  const screenOrigin = growth(backward) < growth(forward) ? fitted(backward) : fitted(forward);
  const menuStart = screenOrigin;
  const menuEnd = screenOrigin + used;
  // Leave a margin inside the grown window. A menu that ends on the window edge loses its last row to clipping.
  let newStart = Math.min(winStart, menuStart);
  let newEnd = Math.max(winEnd, menuEnd);
  if (menuStart < winStart + MENU_MARGIN) newStart = Math.min(newStart, menuStart - MENU_MARGIN);
  if (menuEnd > winEnd - MENU_MARGIN) newEnd = Math.max(newEnd, menuEnd + MENU_MARGIN);
  const padStart = Math.ceil(Math.max(0, winStart - newStart));
  const padEnd = Math.ceil(Math.max(0, newEnd - winEnd));
  return {
    position: menuStart - (winStart - padStart),
    padStart,
    padEnd,
    max,
  };
}

export function placeMenu(
  cursorX: number,
  cursorY: number,
  menuWidth: number,
  menuHeight: number,
  windowWidth: number,
  windowHeight: number,
  grow: boolean,
  work: WorkArea,
): MenuPlace {
  const x = placeAxis(cursorX, menuWidth, windowWidth, work.windowX, work.left, work.right, grow);
  const y = placeAxis(cursorY, menuHeight, windowHeight, work.windowY, work.top, work.bottom, grow);
  return {
    left: x.position,
    top: y.position,
    padLeft: x.padStart,
    padTop: y.padStart,
    padRight: x.padEnd,
    padBottom: y.padEnd,
    maxWidth: x.max,
    maxHeight: y.max,
  };
}
