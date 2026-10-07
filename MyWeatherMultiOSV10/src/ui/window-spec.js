export const WINDOW_DEFAULT = { width: 760, height: 640 };

/** Natural size of the weather picture and its labels, before the window shrinks them together. */
export const SCENE_NATURAL = { width: 440, height: 248 };
export const SCENE_MIN_SCALE = 0.55;
const TOOLBAR_HEIGHT = 46;
const CONTENT_PAD_BOTTOM = 24;

/**
 * Narrowest main window that keeps the icon, "MyWeather V1.0", and the English
 * Daily / Weekly / Monthly labels fully visible beside the corner buttons.
 * One pixel narrower clips those labels.
 */
export function toolbarMinWidth() {
  return 589;
}

export const WINDOW_MIN = {
  width: toolbarMinWidth(),
  height: TOOLBAR_HEIGHT + CONTENT_PAD_BOTTOM + Math.ceil(SCENE_NATURAL.height * SCENE_MIN_SCALE),
};

export function sceneScale(box) {
  const width = Math.max(1, Number(box?.width) || SCENE_NATURAL.width);
  const height = Math.max(1, Number(box?.height) || SCENE_NATURAL.height);
  const scale = Math.min(1, width / SCENE_NATURAL.width, height / SCENE_NATURAL.height);
  return Math.round(Math.max(SCENE_MIN_SCALE, Math.min(1, scale)) * 1000) / 1000;
}

export function clampWindowSize(size) {
  const width = Math.round(Number(size?.width) || WINDOW_DEFAULT.width);
  const height = Math.round(Number(size?.height) || WINDOW_DEFAULT.height);
  return { width: Math.max(WINDOW_MIN.width, width), height: Math.max(WINDOW_MIN.height, height) };
}
