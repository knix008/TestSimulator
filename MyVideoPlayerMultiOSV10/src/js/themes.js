import { persistGetItem, persistSetItem } from './persist.js';

const CUSTOM_STORAGE_KEY = 'myvideoplayer.customThemes.v1';

/** Editable keys shown in the custom theme editor */
export const THEME_EDIT_KEYS = [
  { key: '--bg-app', labelKey: 'colorAppBg' },
  { key: '--bg-toolbar', labelKey: 'colorToolbar' },
  { key: '--bg-stage', labelKey: 'colorStage' },
  { key: '--bg-modal', labelKey: 'colorDialog' },
  { key: '--bg-control', labelKey: 'colorControls' },
  { key: '--bg-primary', labelKey: 'colorAccent' },
  { key: '--bg-primary-hover', labelKey: 'colorAccentHover' },
  { key: '--text', labelKey: 'colorText' },
  { key: '--text-muted', labelKey: 'colorMuted' },
  { key: '--border', labelKey: 'colorBorder' },
  { key: '--seek-fill', labelKey: 'colorSeek' },
  { key: '--danger', labelKey: 'colorDanger' },
  { key: '--spectrum-bar', labelKey: 'colorSpectrum' }
];

export const BUILTIN_THEME_NAME_KEYS = {
  dark: 'themeDark',
  light: 'themeLight',
  ocean: 'themeOcean',
  forest: 'themeForest'
};

const BASE_VARS = {
  dark: {
    '--bg-app': '#121418',
    '--bg-chrome': '#0e1014',
    '--bg-toolbar': '#1a1e26',
    '--bg-stage': '#0a0c10',
    '--bg-panel': '#161a22',
    '--bg-statusbar': '#151922',
    '--bg-modal': '#1c212b',
    '--bg-control': '#252b36',
    '--bg-control-hover': '#323a49',
    '--bg-primary': '#3d8bfd',
    '--bg-primary-hover': '#5a9dff',
    '--border': '#2a3140',
    '--border-strong': '#3a4458',
    '--text': '#e8ecf3',
    '--text-muted': '#9aa3b5',
    '--text-inverse': '#0e1014',
    '--danger': '#e85d5d',
    '--danger-hover': '#f07070',
    '--seek-track': '#2f3747',
    '--seek-fill': '#3d8bfd',
    '--subtitle-bg': 'rgba(0, 0, 0, 0.55)',
    '--subtitle-text': '#ffffff',
    '--shadow': '0 12px 40px rgba(0, 0, 0, 0.45)',
    '--tooltip-bg': '#2a3140',
    '--tooltip-text': '#f2f5fa',
    '--spectrum-bar': '#5ab0ff',
    '--spectrum-glow': 'rgba(90, 176, 255, 0.35)'
  },
  light: {
    '--bg-app': '#eceff4',
    '--bg-chrome': '#e2e7ef',
    '--bg-toolbar': '#f4f6fa',
    '--bg-stage': '#d8dee8',
    '--bg-panel': '#eef1f6',
    '--bg-statusbar': '#e6ebf3',
    '--bg-modal': '#ffffff',
    '--bg-control': '#dfe5ef',
    '--bg-control-hover': '#cfd7e4',
    '--bg-primary': '#1f6feb',
    '--bg-primary-hover': '#388bfd',
    '--border': '#c5cedc',
    '--border-strong': '#9aa8bd',
    '--text': '#1a2230',
    '--text-muted': '#5b677a',
    '--text-inverse': '#ffffff',
    '--danger': '#cf3b3b',
    '--danger-hover': '#e04a4a',
    '--seek-track': '#c5cedc',
    '--seek-fill': '#1f6feb',
    '--subtitle-bg': 'rgba(0, 0, 0, 0.62)',
    '--subtitle-text': '#ffffff',
    '--shadow': '0 12px 36px rgba(30, 40, 60, 0.18)',
    '--tooltip-bg': '#1f2937',
    '--tooltip-text': '#f8fafc',
    '--spectrum-bar': '#1f6feb',
    '--spectrum-glow': 'rgba(31, 111, 235, 0.28)'
  },
  ocean: {
    '--bg-app': '#0b171c',
    '--bg-chrome': '#081216',
    '--bg-toolbar': '#122229',
    '--bg-stage': '#061014',
    '--bg-panel': '#13262e',
    '--bg-statusbar': '#101f26',
    '--bg-modal': '#173039',
    '--bg-control': '#1d3a45',
    '--bg-control-hover': '#274a57',
    '--bg-primary': '#2bb8a8',
    '--bg-primary-hover': '#3dcebd',
    '--border': '#274652',
    '--border-strong': '#356574',
    '--text': '#e4f4f2',
    '--text-muted': '#8fb0b4',
    '--text-inverse': '#061014',
    '--danger': '#e07070',
    '--danger-hover': '#ef8585',
    '--seek-track': '#243f4a',
    '--seek-fill': '#2bb8a8',
    '--subtitle-bg': 'rgba(0, 0, 0, 0.55)',
    '--subtitle-text': '#ffffff',
    '--shadow': '0 12px 40px rgba(0, 0, 0, 0.5)',
    '--tooltip-bg': '#1d3a45',
    '--tooltip-text': '#e4f4f2',
    '--spectrum-bar': '#3dcebd',
    '--spectrum-glow': 'rgba(43, 184, 168, 0.35)'
  },
  forest: {
    '--bg-app': '#12160f',
    '--bg-chrome': '#0e120c',
    '--bg-toolbar': '#1a2116',
    '--bg-stage': '#0b0f09',
    '--bg-panel': '#182015',
    '--bg-statusbar': '#151c12',
    '--bg-modal': '#1e2819',
    '--bg-control': '#2a3524',
    '--bg-control-hover': '#38462f',
    '--bg-primary': '#6faf4e',
    '--bg-primary-hover': '#84c462',
    '--border': '#33402c',
    '--border-strong': '#45573c',
    '--text': '#eaf0e4',
    '--text-muted': '#9aab8f',
    '--text-inverse': '#0b0f09',
    '--danger': '#d96b5c',
    '--danger-hover': '#e78376',
    '--seek-track': '#2f3b28',
    '--seek-fill': '#6faf4e',
    '--subtitle-bg': 'rgba(0, 0, 0, 0.55)',
    '--subtitle-text': '#ffffff',
    '--shadow': '0 12px 40px rgba(0, 0, 0, 0.48)',
    '--tooltip-bg': '#2a3524',
    '--tooltip-text': '#eaf0e4',
    '--spectrum-bar': '#84c462',
    '--spectrum-glow': 'rgba(111, 175, 78, 0.35)'
  }
};

export const BUILTIN_THEMES = [
  { id: 'dark', name: 'Dark', scheme: 'dark', vars: BASE_VARS.dark },
  { id: 'light', name: 'Light', scheme: 'light', vars: BASE_VARS.light },
  { id: 'ocean', name: 'Ocean', scheme: 'dark', vars: BASE_VARS.ocean },
  { id: 'forest', name: 'Forest', scheme: 'dark', vars: BASE_VARS.forest }
];

export function getBuiltinTheme(id) {
  return BUILTIN_THEMES.find((t) => t.id === id) || BUILTIN_THEMES[0];
}

export function loadCustomThemes() {
  try {
    const raw = persistGetItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((t) => t && t.id && t.name && t.vars);
  } catch {
    return [];
  }
}

export function saveCustomThemes(list) {
  persistSetItem(CUSTOM_STORAGE_KEY, JSON.stringify(list));
}

export function getCustomTheme(id) {
  return loadCustomThemes().find((t) => t.id === id) || null;
}

export function upsertCustomTheme(theme) {
  const list = loadCustomThemes();
  const idx = list.findIndex((t) => t.id === theme.id);
  const next = {
    id: theme.id,
    name: String(theme.name || 'Custom').trim().slice(0, 40) || 'Custom',
    scheme: theme.scheme === 'light' ? 'light' : 'dark',
    vars: { ...theme.vars },
    updatedAt: Date.now()
  };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveCustomThemes(list);
  return next;
}

export function deleteCustomTheme(id) {
  const list = loadCustomThemes().filter((t) => t.id !== id);
  saveCustomThemes(list);
  return list;
}

export function createThemeId() {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function resolveThemeId(themeSetting) {
  if (!themeSetting) return 'dark';
  if (themeSetting === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (BUILTIN_THEMES.some((t) => t.id === themeSetting)) return themeSetting;
  if (String(themeSetting).startsWith('custom:')) {
    const id = themeSetting.slice('custom:'.length);
    return getCustomTheme(id) ? themeSetting : 'dark';
  }
  // legacy / unknown
  return getCustomTheme(themeSetting) ? `custom:${themeSetting}` : 'dark';
}

export function getThemeDefinition(themeSetting) {
  const resolved = resolveThemeId(themeSetting);
  if (resolved.startsWith('custom:')) {
    const custom = getCustomTheme(resolved.slice('custom:'.length));
    if (custom) return { ...custom, settingId: resolved, builtin: false };
  }
  const builtin = getBuiltinTheme(resolved);
  return { ...builtin, settingId: builtin.id, builtin: true };
}

export function getThemeDisplayName(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  return def?.name || 'Dark';
}

export const THEME_VAR_KEYS = Object.keys(BASE_VARS.dark);

/**
 * Copy computed theme variables onto top-layer overlays (dialogs/menus),
 * so they always follow the active theme even in the dialog top layer.
 */
export function syncThemeToOverlays(root = document.documentElement) {
  if (typeof document === 'undefined') return;
  const styles = getComputedStyle(root);
  const themeId = root.getAttribute('data-theme') || 'dark';
  const scheme =
    root.getAttribute('data-color-scheme') ||
    (themeId === 'light' ? 'light' : 'dark');

  const overlays = document.querySelectorAll(
    'dialog.modal, dialog.modal .modal-card, .recent-menu, .popup-menu, .tooltip, .save-progress-popup'
  );

  // Hard fallbacks keep dialog/tooltip labels readable if a var is missing.
  const fallbacks =
    scheme === 'light'
      ? {
          '--bg-modal': '#ffffff',
          '--bg-control': '#dfe5ef',
          '--border': '#c5cedc',
          '--text': '#1a2230',
          '--text-muted': '#4b5568',
          '--bg-primary': '#1f6feb'
        }
      : {
          '--bg-modal': '#1c212b',
          '--bg-control': '#252b36',
          '--border': '#2a3140',
          '--text': '#e8ecf3',
          '--text-muted': '#a8b0c0',
          '--bg-primary': '#5a9dff'
        };

  for (const el of overlays) {
    el.setAttribute('data-theme', themeId);
    el.setAttribute('data-color-scheme', scheme);
    el.style.colorScheme = scheme === 'light' ? 'light' : 'dark';

    // Toolbar menus use scheme-locked --menu-* colors in CSS; copying theme
    // surface vars onto them can wash out labels against the stage background.
    const isToolbarMenu =
      el.classList.contains('popup-menu') || el.classList.contains('recent-menu');
    if (isToolbarMenu) {
      for (const key of THEME_VAR_KEYS) {
        el.style.removeProperty(key);
      }
      continue;
    }

    for (const key of THEME_VAR_KEYS) {
      const value = styles.getPropertyValue(key).trim() || fallbacks[key] || '';
      if (value) el.style.setProperty(key, value);
      else el.style.removeProperty(key);
    }
    for (const [key, value] of Object.entries(fallbacks)) {
      if (!styles.getPropertyValue(key).trim()) {
        el.style.setProperty(key, value);
      }
    }
  }
}

/**
 * Apply theme vars to documentElement.
 * Builtins use data-theme attribute (CSS file).
 * Customs use data-theme="custom" + inline CSS variables.
 */
export function applyThemeToDocument(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  const root = document.documentElement;
  // Clear previous custom inline vars
  for (const key of THEME_VAR_KEYS) {
    root.style.removeProperty(key);
  }

  const scheme = def.scheme === 'light' ? 'light' : 'dark';
  if (def.builtin) {
    root.setAttribute('data-theme', def.id);
    root.setAttribute('data-color-scheme', scheme);
    // Also mirror vars inline so dialogs/top-layer always resolve them.
    for (const [key, value] of Object.entries(def.vars || {})) {
      root.style.setProperty(key, value);
    }
  } else {
    root.setAttribute('data-theme', 'custom');
    root.setAttribute('data-color-scheme', scheme);
    for (const [key, value] of Object.entries(def.vars || {})) {
      root.style.setProperty(key, value);
    }
  }
  root.style.colorScheme = scheme;
  syncThemeToOverlays(root);
  return def;
}

export function cloneVarsFromTheme(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  return { ...(def.vars || getBuiltinTheme('dark').vars) };
}

export function ensureDerivedVars(vars) {
  const next = { ...vars };
  if (next['--bg-primary'] && !next['--seek-fill']) next['--seek-fill'] = next['--bg-primary'];
  if (next['--bg-primary'] && !next['--spectrum-bar']) next['--spectrum-bar'] = next['--bg-primary'];
  if (next['--bg-primary'] && !next['--bg-primary-hover']) next['--bg-primary-hover'] = next['--bg-primary'];
  if (next['--danger'] && !next['--danger-hover']) next['--danger-hover'] = next['--danger'];
  if (next['--bg-toolbar'] && !next['--bg-chrome']) next['--bg-chrome'] = next['--bg-toolbar'];
  if (next['--bg-toolbar'] && !next['--bg-statusbar']) next['--bg-statusbar'] = next['--bg-toolbar'];
  if (next['--bg-control'] && !next['--bg-control-hover']) next['--bg-control-hover'] = next['--bg-control'];
  if (next['--bg-control'] && !next['--tooltip-bg']) next['--tooltip-bg'] = next['--bg-control'];
  if (next['--bg-app'] && !next['--bg-panel']) next['--bg-panel'] = next['--bg-app'];
  if (next['--bg-app'] && !next['--bg-stage']) next['--bg-stage'] = next['--bg-app'];
  if (next['--text'] && !next['--tooltip-text']) next['--tooltip-text'] = next['--text'];
  if (!next['--border-strong'] && next['--border']) next['--border-strong'] = next['--border'];
  if (!next['--seek-track'] && next['--border']) next['--seek-track'] = next['--border'];
  if (!next['--subtitle-bg']) next['--subtitle-bg'] = 'rgba(0, 0, 0, 0.55)';
  if (!next['--subtitle-text']) next['--subtitle-text'] = '#ffffff';
  if (!next['--shadow']) next['--shadow'] = '0 12px 40px rgba(0, 0, 0, 0.4)';
  if (!next['--spectrum-glow'] && next['--spectrum-bar']) {
    next['--spectrum-glow'] = 'rgba(90, 176, 255, 0.3)';
  }
  if (!next['--text-inverse']) next['--text-inverse'] = '#ffffff';
  return next;
}
