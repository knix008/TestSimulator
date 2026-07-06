/** @typedef {{ index: number, nameKey: string, accent: { r: number, g: number, b: number } }} PastelThemePreset */

/** @type {PastelThemePreset[]} */
export const PASTEL_PRESETS = [
  { index: 0, nameKey: 'pastelRose', accent: { r: 255, g: 168, b: 178 } },
  { index: 1, nameKey: 'pastelCoral', accent: { r: 255, g: 168, b: 148 } },
  { index: 2, nameKey: 'pastelApricot', accent: { r: 255, g: 196, b: 140 } },
  { index: 3, nameKey: 'pastelSand', accent: { r: 255, g: 220, b: 142 } },
  { index: 4, nameKey: 'pastelSky', accent: { r: 168, g: 212, b: 255 } },
  { index: 5, nameKey: 'pastelLemon', accent: { r: 255, g: 242, b: 136 } },
  { index: 6, nameKey: 'pastelButter', accent: { r: 240, g: 255, b: 140 } },
  { index: 7, nameKey: 'pastelMeadow', accent: { r: 208, g: 255, b: 148 } },
  { index: 8, nameKey: 'pastelSage', accent: { r: 178, g: 255, b: 164 } },
  { index: 9, nameKey: 'pastelMint', accent: { r: 148, g: 255, b: 192 } },
  { index: 10, nameKey: 'pastelSeafoam', accent: { r: 124, g: 255, b: 216 } },
  { index: 11, nameKey: 'pastelAqua', accent: { r: 112, g: 245, b: 245 } },
  { index: 12, nameKey: 'pastelPowder', accent: { r: 136, g: 204, b: 255 } },
  { index: 13, nameKey: 'pastelPeriwinkle', accent: { r: 168, g: 172, b: 255 } },
  { index: 14, nameKey: 'pastelLavender', accent: { r: 200, g: 164, b: 255 } },
  { index: 15, nameKey: 'pastelLilac', accent: { r: 218, g: 158, b: 255 } },
  { index: 16, nameKey: 'pastelOrchid', accent: { r: 240, g: 158, b: 255 } },
  { index: 17, nameKey: 'pastelPink', accent: { r: 255, g: 158, b: 210 } },
  { index: 18, nameKey: 'pastelCream', accent: { r: 255, g: 248, b: 212 } },
  { index: 19, nameKey: 'pastelPeach', accent: { r: 255, g: 195, b: 175 } }
];

export const PASTEL_THEME_COUNT = PASTEL_PRESETS.length;
export const DEFAULT_COLOR_THEME_INDEX = 4;

export function normalizeColorThemeIndex(index) {
  const value = Number.parseInt(index, 10);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value >= PASTEL_THEME_COUNT) {
    return PASTEL_THEME_COUNT - 1;
  }
  return value;
}

export function getPastelPreset(index) {
  return PASTEL_PRESETS[normalizeColorThemeIndex(index)];
}

export function argbToRgb(argb) {
  const value = Number(argb) >>> 0;
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff
  };
}

export function rgbToArgb({ r, g, b }) {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

export function resolveAccentColor({ colorThemeIndex, useCustomAccentColor, customAccentArgb }) {
  if (useCustomAccentColor) {
    return argbToRgb(customAccentArgb);
  }
  return getPastelPreset(colorThemeIndex).accent;
}
