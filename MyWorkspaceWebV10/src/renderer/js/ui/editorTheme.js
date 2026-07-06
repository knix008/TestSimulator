import { getEditorFontSizePx } from './fontScale.js';

const LIGHT = {
  bg: '#F6F8FA',
  text: '#000000',
  caret: '#0969DA',
  placeholder: '#8C959F',
  focus: '#0969DA33',
  codeBg: '#E7EBF1',
  border: '#9AA3B0',
  borderLight: '#BAC1CB',
  surface: '#FFFFFF',
  accent: '#0969DA',
  muted: '#57606A',
  selection: '#0969DA33',
  colorScheme: 'light'
};

const DARK = {
  bg: '#0D1117',
  text: '#E6EDF3',
  caret: '#2F81F7',
  placeholder: '#6E7681',
  focus: '#2F81F733',
  codeBg: '#161B22',
  border: '#30363D',
  borderLight: '#21262D',
  surface: '#161B22',
  accent: '#2F81F7',
  muted: '#8B949E',
  selection: '#2F81F733',
  colorScheme: 'dark'
};

export function buildEditorThemeChrome(themeName, fontScaleStep = 0) {
  const palette = themeName === 'dark' ? DARK : LIGHT;
  return {
    ...palette,
    fontSizePx: String(getEditorFontSizePx(fontScaleStep))
  };
}
