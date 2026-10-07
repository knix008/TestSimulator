export const WINDOW_DEFAULT = { width: 760, height: 640 };

/** Natural size of the weather picture and its labels, before the window shrinks them together. */
export const SCENE_NATURAL = { width: 440, height: 248 };
export const SCENE_MIN_SCALE = 0.55;
const TOOLBAR_HEIGHT = 46;
/** Tight inset around the weather scene. Matches `.content` padding in styles.css. */
export const CONTENT_PADDING = { top: 2, right: 16, bottom: 2, left: 16 };

/**
 * Narrowest main window that keeps the icon, "MyWeather V1.0", and the
 * icon buttons fully visible. One pixel narrower clips the toolbar.
 */
export function toolbarMinWidth() {
  return 439;
}

export const WINDOW_MIN = {
  width: toolbarMinWidth(),
  height: TOOLBAR_HEIGHT + CONTENT_PADDING.top + CONTENT_PADDING.bottom + Math.ceil(SCENE_NATURAL.height * SCENE_MIN_SCALE),
};

/** Largest scale that fills the content box. The scene grows and shrinks with the window. */
export function sceneScale(box) {
  const width = Math.max(1, Number(box?.width) || SCENE_NATURAL.width);
  const height = Math.max(1, Number(box?.height) || SCENE_NATURAL.height);
  const scale = Math.min(width / SCENE_NATURAL.width, height / SCENE_NATURAL.height);
  return Math.round(Math.max(SCENE_MIN_SCALE, scale) * 1000) / 1000;
}

const SCENE_ART = 240;
const SCENE_GAP = 28;
/** Fixed label column. Live weather text must not change the picture size. */
export const SCENE_TEXT = SCENE_NATURAL.width - SCENE_ART - SCENE_GAP;

/**
 * Picture and labels share one scale while the window is small.
 * In a taller window the picture grows to the leftover height and the labels stay readable.
 */
export function sceneFit(box, textWidth = 200) {
  const width = Math.max(1, Number(box?.width) || SCENE_NATURAL.width);
  const height = Math.max(1, Number(box?.height) || SCENE_NATURAL.height);
  const text = Math.max(1, Number(textWidth) || 200);
  const uniform = Math.min(width / (SCENE_ART + SCENE_GAP + text), height / SCENE_ART);
  const shared = Math.round(Math.max(SCENE_MIN_SCALE, Math.min(1, uniform)) * 1000) / 1000;
  if (uniform <= 1) return { text: shared, art: shared };
  const artPx = Math.min(height, Math.max(SCENE_ART, width - SCENE_GAP - text));
  return { text: 1, art: Math.round((artPx / SCENE_ART) * 1000) / 1000 };
}

/** Keep the real window rectangle when settings are written. A missing size must not erase it. */
export function stampWindowPlacement(settings, placement) {
  const next = settings && typeof settings === "object" ? settings : {};
  const width = Math.round(Number(placement?.width));
  const height = Math.round(Number(placement?.height));
  if (!(width >= 200) || !(height >= 200)) return next;
  next.windowSize = { width, height };
  const x = Number(placement?.x);
  const y = Number(placement?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) next.windowPosition = { x: Math.round(x), y: Math.round(y) };
  if (typeof placement?.maximized === "boolean") next.windowMaximized = placement.maximized;
  return next;
}

export function clampWindowSize(size) {
  const width = Math.round(Number(size?.width) || WINDOW_DEFAULT.width);
  const height = Math.round(Number(size?.height) || WINDOW_DEFAULT.height);
  return { width: Math.max(WINDOW_MIN.width, width), height: Math.max(WINDOW_MIN.height, height) };
}

function overlapAmount(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/** Enough of the title row is on a display that the window can still be moved. */
export function windowIsVisible(bounds, workAreas) {
  const title = { x: bounds.x, y: bounds.y, width: Math.min(bounds.width, 120), height: Math.min(bounds.height, 46) };
  return (workAreas || []).some((area) => overlapAmount(title, area) >= 32 * 16);
}

function centerIn(area, size) {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

function fitToArea(size, area) {
  return clampWindowSize({
    width: Math.min(size.width, area.width),
    height: Math.min(size.height, area.height),
  });
}

/**
 * Restore the last window. A position that no longer meets a display
 * (monitor removed or disconnected) opens centered on the first work area.
 */
export function placeWindow(saved, workAreas, fallback = WINDOW_DEFAULT) {
  const areas = (Array.isArray(workAreas) ? workAreas : []).filter((area) => Number(area?.width) > 0 && Number(area?.height) > 0);
  const primary = areas[0] || { x: 0, y: 0, width: 1920, height: 1080 };
  const requested = clampWindowSize({ width: saved?.width || fallback.width, height: saved?.height || fallback.height });
  const x = Number(saved?.x);
  const y = Number(saved?.y);
  const displays = areas.length ? areas : [primary];
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const candidate = { x: Math.round(x), y: Math.round(y), width: requested.width, height: requested.height };
    if (windowIsVisible(candidate, displays)) {
      let home = primary;
      let best = 0;
      for (const area of displays) {
        const amount = overlapAmount(candidate, area);
        if (amount > best) {
          home = area;
          best = amount;
        }
      }
      const fitted = fitToArea(requested, home);
      return { x: candidate.x, y: candidate.y, width: fitted.width, height: fitted.height };
    }
  }
  return centerIn(primary, fitToArea(requested, primary));
}
