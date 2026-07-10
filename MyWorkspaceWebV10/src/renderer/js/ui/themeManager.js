import {
  DEFAULT_COLOR_THEME_INDEX,
  normalizeColorThemeIndex,
  resolveAccentColor
} from './pastelThemeCatalog.js';
import { buildThemePalette, rgbToHex, rgbToHexAlpha } from './pastelThemePaletteBuilder.js';

const CSS_VAR_MAP = {
  bg: '--bg',
  surface: '--surface',
  sidebar: '--sidebar',
  border: '--border',
  borderLight: '--border-light',
  text: '--text',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentPressed: '--accent-pressed',
  accentButtonText: '--accent-button-text',
  accentButtonHover: '--accent-button-hover',
  accentButtonPressed: '--accent-button-pressed',
  pastelSaveButtonText: '--pastel-save-button-text',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  editorBg: '--editor-bg',
  editorText: '--editor-text',
  panelHeaderWorkspace: '--panel-header-workspace',
  panelHeaderOutline: '--panel-header-outline',
  panelHeaderEditor: '--panel-header-editor',
  panelHeaderPageTitle: '--panel-header-page-title'
};

export function normalizeUiColorSettings(config = {}) {
  return {
    colorThemeIndex: normalizeColorThemeIndex(config.colorThemeIndex ?? DEFAULT_COLOR_THEME_INDEX),
    useCustomAccentColor: Boolean(config.useCustomAccentColor),
    customAccentArgb: Number(config.customAccentArgb) || 0xa8d4ff
  };
}

export function applyThemePalette(palette) {
  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const target of targets) {
    for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
      target.style.setProperty(cssVar, rgbToHex(palette[key]));
    }
  }
}

export function applyThemeAppearance({
  theme = 'Light',
  colorThemeIndex = DEFAULT_COLOR_THEME_INDEX,
  useCustomAccentColor = false,
  customAccentArgb
} = {}) {
  const dark = String(theme).toLowerCase() === 'dark';
  document.body.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

  const accent = resolveAccentColor({
    colorThemeIndex,
    useCustomAccentColor,
    customAccentArgb
  });
  const palette = buildThemePalette(accent, dark);
  applyThemePalette(palette);
  return palette;
}

export function buildEditorPaletteFromAppearance(appearance = {}) {
  const dark = String(appearance.theme).toLowerCase() === 'dark';
  const accent = resolveAccentColor({
    colorThemeIndex: appearance.colorThemeIndex,
    useCustomAccentColor: appearance.useCustomAccentColor,
    customAccentArgb: appearance.customAccentArgb
  });
  const palette = buildThemePalette(accent, dark);
  return {
    bg: rgbToHex(palette.editorBg),
    text: rgbToHex(palette.editorText),
    caret: rgbToHex(palette.editorCaret),
    placeholder: rgbToHex(palette.editorPlaceholder),
    focus: rgbToHexAlpha(palette.editorFocusRing, 0.2),
    codeBg: rgbToHex(palette.editorCodeBg),
    border: rgbToHex(palette.border),
    borderLight: rgbToHex(palette.borderLight),
    surface: rgbToHex(palette.surface),
    accent: rgbToHex(palette.accent),
    muted: rgbToHex(palette.textSecondary),
    selection: rgbToHexAlpha(palette.accent, 0.2),
    colorScheme: dark ? 'dark' : 'light'
  };
}
