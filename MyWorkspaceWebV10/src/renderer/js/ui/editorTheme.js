import { getEditorFontSizePx } from './fontScale.js';
import { buildEditorPaletteFromAppearance } from './themeManager.js';

export function buildEditorThemeChrome(appearance = {}) {
  const palette = buildEditorPaletteFromAppearance(appearance);
  const fontScaleStep =
    appearance?.fontScaleStep != null ? appearance.fontScaleStep : appearance?.fontScale;
  return {
    ...palette,
    fontSizePx: String(getEditorFontSizePx(fontScaleStep ?? 0))
  };
}
