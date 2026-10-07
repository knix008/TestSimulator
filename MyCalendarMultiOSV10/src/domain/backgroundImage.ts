/** The windows that can show the background image; the settings window, About included, never does. */
export const BACKGROUND_WINDOWS = ["main", "events", "print", "reminder"] as const;
export type BackgroundWindow = (typeof BACKGROUND_WINDOWS)[number];
export type BackgroundWindows = Record<BackgroundWindow, boolean>;

export const DEFAULT_BACKGROUND_WINDOWS: BackgroundWindows = { main: true, events: true, print: true, reminder: true };

export function normalizeBackgroundWindows(value: unknown): BackgroundWindows {
  const input = value && typeof value === "object" ? (value as Partial<Record<string, unknown>>) : {};
  const result = { ...DEFAULT_BACKGROUND_WINDOWS };
  for (const name of BACKGROUND_WINDOWS) {
    if (typeof input[name] === "boolean") result[name] = input[name];
  }
  return result;
}

export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 0.5;

export function clampBackgroundImageOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/** The settings show transparency: 0% is the image at full strength, 100% hides it. */
export function backgroundImageTransparency(opacity: number): number {
  return Math.round((1 - clampBackgroundImageOpacity(opacity)) * 100);
}

export function backgroundImageOpacityFromTransparency(transparency: number): number {
  return clampBackgroundImageOpacity(1 - transparency / 100);
}

/** Kept apart from the settings, which every window rewrites and parses on each change. */
export const BACKGROUND_IMAGE_KEY = "mycalendar.background-image.v1";
export const BACKGROUND_IMAGE_EVENT = "mycalendar-background-image";

export function isBackgroundImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export function readBackgroundImage(): string | null {
  try {
    const value = localStorage.getItem(BACKGROUND_IMAGE_KEY);
    return isBackgroundImage(value) ? value : null;
  } catch {
    return null;
  }
}

/** Throws when storage is full, so the settings can say the image is too large. */
export function writeBackgroundImage(image: string | null): void {
  if (image === null) localStorage.removeItem(BACKGROUND_IMAGE_KEY);
  else if (isBackgroundImage(image)) localStorage.setItem(BACKGROUND_IMAGE_KEY, image);
  else throw new Error("not an image");
  window.dispatchEvent(new Event(BACKGROUND_IMAGE_EVENT));
}
