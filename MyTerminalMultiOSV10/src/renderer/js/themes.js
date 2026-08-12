let themes = null;

const DARK_FG = '#1f1f1f';
const DARK_TOOLBAR_FG = '#222222';
const DARK_CURSOR = '#000000';

export async function loadThemes() {
  if (themes) return themes;
  const res = await fetch('./shared/themes/themes.json');
  themes = await res.json();
  return themes;
}

export function getThemeList(themesMap) {
  return Object.keys(themesMap);
}

function parseRgb(color) {
  const raw = String(color || '').trim();
  if (!raw) return null;
  if (raw.startsWith('rgba(') || raw.startsWith('rgb(')) {
    const parts = raw
      .replace(/^rgba?\(/, '')
      .replace(/\)$/, '')
      .split(',')
      .map((p) => Number.parseFloat(p.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
    return null;
  }
  let hex = raw.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length < 6) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return null;
  return { r, g, b };
}

/** Relative luminance 0..1 (WCAG). */
export function relativeLuminance(color) {
  const rgb = parseRgb(color);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function isLightColor(color, threshold = 0.55) {
  return relativeLuminance(color) >= threshold;
}

export function isLightTheme(theme) {
  if (!theme) return false;
  if (theme.id === 'light') return true;
  return isLightColor(theme.background) || isLightColor(theme.toolbarBg);
}

/**
 * On light backgrounds, force dark text/cursor/toolbar labels so content stays readable.
 */
export function ensureReadableTheme(theme) {
  const t = {
    ...theme,
    terminal: { ...(theme.terminal || {}) },
  };
  const lightBg = isLightColor(t.background);
  const lightToolbar = isLightColor(t.toolbarBg);

  if (lightBg) {
    if (isLightColor(t.foreground, 0.48)) t.foreground = DARK_FG;
    if (isLightColor(t.cursor, 0.48)) t.cursor = DARK_CURSOR;
    if (isLightColor(t.terminal.white, 0.55)) t.terminal.white = '#444444';
    if (isLightColor(t.terminal.brightWhite, 0.65)) t.terminal.brightWhite = '#333333';
  }

  if (lightToolbar && isLightColor(t.toolbarFg, 0.48)) {
    t.toolbarFg =
      t.foreground && !isLightColor(t.foreground, 0.48) ? t.foreground : DARK_TOOLBAR_FG;
  }

  return t;
}

export function resolveTheme(themesMap, themeId, custom) {
  let theme;
  if (themeId === 'custom' && custom) {
    const base = themesMap.dark || {};
    theme = {
      ...base,
      ...custom,
      id: 'custom',
      terminal: { ...(base.terminal || {}), ...(custom.terminal || {}) },
    };
  } else {
    theme = themesMap[themeId] || themesMap.dark;
  }
  return ensureReadableTheme(theme);
}

export function clampTransparency(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Image transparency 0 = fully visible, 100 = invisible. */
export function transparencyToImageOpacity(transparency) {
  return (100 - clampTransparency(transparency)) / 100;
}

export function colorWithAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const raw = String(color || '#000000').trim();

  if (raw.startsWith('rgba(')) {
    return raw.replace(/rgba\(([^)]+)\)/, (_, body) => {
      const parts = body.split(',').map((p) => p.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
    });
  }
  if (raw.startsWith('rgb(')) {
    return raw.replace(/rgb\(([^)]+)\)/, (_, body) => `rgba(${body}, ${a})`);
  }

  let hex = raw.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length >= 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return `rgba(30, 30, 30, ${a})`;
}

function cssUrl(value) {
  if (!value) return 'none';
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

export function applyThemeToDocument(
  theme,
  imageTransparency = 0,
  backgroundImage = '',
  backgroundFit = null
) {
  const root = document.documentElement;
  const imageOpacity = transparencyToImageOpacity(imageTransparency);
  const solidBg = theme.background;

  root.style.setProperty('--bg', solidBg);
  root.style.setProperty('--bg-solid', solidBg);
  root.style.setProperty('--bg-image', cssUrl(backgroundImage));
  root.style.setProperty('--bg-image-opacity', String(imageOpacity));
  root.style.setProperty('--fg', theme.foreground);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--toolbar-bg', theme.toolbarBg);
  root.style.setProperty('--toolbar-fg', theme.toolbarFg);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--button-hover', theme.buttonHover);
  root.style.setProperty('--danger', theme.danger);
  root.style.setProperty('--bg-transparency', String(clampTransparency(imageTransparency)));
  document.body.classList.toggle('has-bg-image', !!backgroundImage);

  if (backgroundFit) {
    root.style.setProperty('--bg-size', backgroundFit.size);
    root.style.setProperty('--bg-position', backgroundFit.position);
    root.style.setProperty('--bg-repeat', backgroundFit.repeat);
    document.body.dataset.bgFit = backgroundFit.id;
  }

  const light = isLightTheme(theme);
  document.body.classList.toggle('theme-light', light);
  root.style.setProperty('color-scheme', light ? 'light' : 'dark');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

export function toXtermTheme(theme, hasBackgroundImage = false) {
  const t = theme.terminal || {};
  // When a wallpaper is present, keep the terminal canvas clear so the image shows.
  const background = hasBackgroundImage ? 'rgba(0, 0, 0, 0)' : theme.background;
  return {
    background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    cursorAccent: theme.background,
    selectionBackground: theme.selection,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}

export function defaultCustomFrom(theme) {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    selection: theme.selection,
    accent: theme.accent,
    toolbarBg: theme.toolbarBg,
    toolbarFg: theme.toolbarFg,
    border: theme.border,
    buttonHover: theme.buttonHover,
    danger: theme.danger,
    terminal: { ...(theme.terminal || {}) },
  };
}
