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

export function clampWindowSize(size) {
  const width = Math.round(Number(size?.width) || WINDOW_DEFAULT.width);
  const height = Math.round(Number(size?.height) || WINDOW_DEFAULT.height);
  return { width: Math.max(WINDOW_MIN.width, width), height: Math.max(WINDOW_MIN.height, height) };
}
