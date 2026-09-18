import { I18n } from './i18n.js';
import { initTooltips } from './tooltip.js';
import {
  loadThemes,
  resolveTheme,
  applyThemeToDocument,
  defaultCustomFrom,
  getThemeList,
  clampTransparency,
  themeOverridesFrom,
  normalizeThemeOverrides,
  ensureContrast,
} from './themes.js';
import { SessionManager } from './session-manager.js';
import {
  DEFAULT_LS_DIRECTORY_COLOR,
  DEFAULT_LS_FILE_COLOR,
  normalizeLsColors,
} from './ls-colors.js';
import { openAboutModal, openSettingsModal, openSshModal } from './modals.js';
import { SETTINGS_TABS, normalizeSshProfiles, normalizeTerminalProfiles } from './settings-view.js';
import { configureErrorDialog, reportError, installGlobalErrorHandlers } from './error-dialog.js';
import {
  DEFAULT_PROMPT_GIT_MODE,
  normalizePromptGitMode,
  normalizePrompt,
  resolvePromptFromSettings,
  customPromptsAsPresets,
  normalizeCustomPrompts,
  promptThemeFrom,
} from '../../shared/prompt-core.js';
import { FONTS, DEFAULT_FONT_ID, getFontById } from './fonts.js';
import {
  BG_FIT_MODES,
  DEFAULT_BG_FIT,
  getBgFitById,
  normalizeBgFit,
} from './background-fit.js';

const DEFAULT_SCROLLBACK = 10000;
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_TERM_COLS = 120;
const DEFAULT_TERM_ROWS = 25;

function clampTermSize(cols, rows) {
  return {
    cols: Math.max(20, Math.min(500, Number.parseInt(cols, 10) || DEFAULT_TERM_COLS)),
    rows: Math.max(5, Math.min(200, Number.parseInt(rows, 10) || DEFAULT_TERM_ROWS)),
  };
}

function clampScrollback(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_SCROLLBACK;
  return Math.max(100, Math.min(100000, n));
}

const api = window.myTerminal || {
  isElectron: false,
  platform: 'web',
  async getAppInfo() {
    return {
      name: 'MyTerminal',
      version: '1.0.0',
      author: 'SHKWON',
      email: 'knix008@naver.com',
      platform: 'web',
      arch: navigator.platform,
    };
  },
  async getSettings() {
    try {
      return JSON.parse(localStorage.getItem('myterminal.settings') || '{}');
    } catch {
      return {};
    }
  },
  async setSettings(settings) {
    let prev = {};
    try {
      prev = JSON.parse(localStorage.getItem('myterminal.settings') || '{}');
    } catch {
      prev = {};
    }
    localStorage.setItem(
      'myterminal.settings',
      JSON.stringify({ ...prev, ...(settings || {}) })
    );
    return true;
  },
  openExternal(url) {
    window.open(url, '_blank');
  },
};

const state = {
  themes: null,
  themeId: 'dark',
  /** Effective colours of the current theme (theme + its overrides) — for popups / prompt. */
  custom: null,
  /** Per-theme user colour overrides: { [themeId]: { background, accent, … } }. */
  themeOverrides: {},
  lang: 'en',
  fontSize: DEFAULT_FONT_SIZE,
  fontId: DEFAULT_FONT_ID,
  scrollback: DEFAULT_SCROLLBACK,
  startDirectory: '',
  showStatusBar: true,
  showTrayIcon: false,
  bgTransparency: 0,
  /** Wallpaper image alpha, separate from whole-window opacity. 0 = opaque, 100 = hidden. */
  bgImageTransparency: 0,
  backgroundImage: '',
  backgroundImageId: '',
  backgroundLibrary: [],
  backgroundImageDir: '',
  backgroundFit: DEFAULT_BG_FIT,
  /** Last non-none fit so the toolbar show/hide toggle can restore it. */
  backgroundFitOn: DEFAULT_BG_FIT,
  promptGitMode: DEFAULT_PROMPT_GIT_MODE,
  /** Last non-off mode so the toolbar toggle can restore it. */
  promptGitModeOn: DEFAULT_PROMPT_GIT_MODE,
  promptPresetId: 'default',
  /** Prompt theme (segments; see shared/prompt-core.js). */
  promptConfig: null,
  /** User-saved prompts: [{ id, label, config }]. */
  customPrompts: [],
  /** Command shell (settings › general); '' = platform default. */
  shellId: '',
  shellCustomPath: '',
  /** Shells detected by main (Electron only). */
  shells: [],
  shellDefaultId: '',
  lsDirectoryColor: DEFAULT_LS_DIRECTORY_COLOR,
  lsFileColor: DEFAULT_LS_FILE_COLOR,
  ssh: null,
  /** Saved SSH hosts (settings › SSH): [{ id, name, host, port, username, privateKey }]. */
  sshProfiles: [],
  /** Terminal profiles (settings › terminal): [{ id, name, cols, rows, fontId, fontSize, scrollback, shellId }]. */
  terminalProfiles: [],
  /** Default terminal size (columns × rows) the window is fitted to on first launch. */
  termCols: DEFAULT_TERM_COLS,
  termRows: DEFAULT_TERM_ROWS,
};

const i18n = new I18n();
/** @type {SessionManager | null} */
let sessions = null;

function currentTheme() {
  return resolveTheme(state.themes, state.themeId, state.themeOverrides?.[state.themeId]);
}

/** Keep `state.custom` (effective colours) in step with the theme + overrides. */
function syncCustomColors() {
  state.custom = defaultCustomFrom(currentTheme());
}

/**
 * Colour change for the current theme (colours tab, text-colour button):
 * only the keys that differ from the theme's own colours are kept as its
 * overrides; other themes, prompts and wallpapers are untouched.
 */
function setThemeColors(colors) {
  const base = state.themes?.[state.themeId];
  if (!base) return;
  const next = themeOverridesFrom({ ...defaultCustomFrom(base), ...(colors || {}) }, base);
  if (Object.keys(next).length) state.themeOverrides[state.themeId] = next;
  else delete state.themeOverrides[state.themeId];
  syncCustomColors();
}

function activePane() {
  return sessions?.active || null;
}

async function persist() {
  const hasWallpaper = !!(state.backgroundImageId || state.backgroundImage);
  const payload = {
    themeId: state.themeId,
    custom: state.custom,
    themeOverrides: state.themeOverrides,
    lang: state.lang,
    fontSize: state.fontSize,
    fontId: state.fontId,
    scrollback: state.scrollback,
    startDirectory: state.startDirectory || '',
    showStatusBar: state.showStatusBar,
    showTrayIcon: state.showTrayIcon,
    bgTransparency: state.bgTransparency,
    bgImageTransparency: state.bgImageTransparency,
    backgroundImageDir: state.backgroundImageDir || '',
    backgroundFit: state.backgroundFit,
    backgroundFitOn:
      state.backgroundFit !== 'none'
        ? state.backgroundFit
        : state.backgroundFitOn || DEFAULT_BG_FIT,
    promptGitMode: state.promptGitMode,
    promptGitModeOn: state.promptGitModeOn || DEFAULT_PROMPT_GIT_MODE,
    promptPresetId: state.promptPresetId || '',
    promptConfig: state.promptConfig,
    // Colours the prompt's accent / foreground / background specs refer to.
    promptTheme: promptThemeFrom(currentTheme()),
    customPrompts: state.customPrompts,
    shellId: state.shellId || '',
    shellCustomPath: state.shellCustomPath || '',
    lsDirectoryColor: state.lsDirectoryColor,
    lsFileColor: state.lsFileColor,
    sshProfiles: state.sshProfiles,
    terminalProfiles: state.terminalProfiles,
    termCols: state.termCols,
    termRows: state.termRows,
    ssh: state.ssh
      ? {
          host: state.ssh.host,
          port: state.ssh.port,
          username: state.ssh.username,
          privateKey: state.ssh.privateKey || '',
        }
      : null,
  };
  if (api.isElectron) {
    // Files live in userData/backgrounds; settings only keep markers + prefs.
    // Keep the marker whenever an id is known so a transient empty dataUrl
    // cannot wipe wallpaper selection on the next launch.
    payload.backgroundImage = hasWallpaper ? 'file' : '';
    payload.backgroundImageId = state.backgroundImageId || '';
  } else {
    payload.backgroundImage = state.backgroundImage || '';
    payload.backgroundImageId = state.backgroundImageId || '';
    payload.backgroundLibrary = (state.backgroundLibrary || []).map((item) => ({
      id: item.id,
      name: item.name,
      dataUrl: item.dataUrl,
    }));
  }
  await api.setSettings(payload);
}

/** Restore wallpaper + transparency prefs from settings / background library. */
async function restoreBackgroundFromSettings(saved = {}) {
  state.bgTransparency = clampTransparency(saved.bgTransparency ?? 0);
  state.bgImageTransparency = clampTransparency(saved.bgImageTransparency ?? 0);
  state.backgroundFit = normalizeBgFit(saved.backgroundFit || DEFAULT_BG_FIT);
  if (state.backgroundFit !== 'none') {
    state.backgroundFitOn = state.backgroundFit;
  } else if (
    typeof saved.backgroundFitOn === 'string' &&
    saved.backgroundFitOn !== 'none'
  ) {
    state.backgroundFitOn = normalizeBgFit(saved.backgroundFitOn);
  } else {
    state.backgroundFitOn = DEFAULT_BG_FIT;
  }
  state.backgroundImageDir =
    typeof saved.backgroundImageDir === 'string' ? saved.backgroundImageDir : '';
  state.backgroundImage = '';
  state.backgroundImageId =
    typeof saved.backgroundImageId === 'string' ? saved.backgroundImageId : '';
  state.backgroundLibrary = Array.isArray(saved.backgroundLibrary)
    ? saved.backgroundLibrary.filter((item) => item?.id && item?.dataUrl)
    : [];

  const savedId = state.backgroundImageId;
  const wantsFile = saved.backgroundImage === 'file' || !!savedId;

  if (api.isElectron && api.listBackgroundImages) {
    try {
      const listed = await api.listBackgroundImages();
      if (listed?.ok) {
        state.backgroundLibrary = listed.items || [];
        let activeId = listed.activeId || savedId || '';
        let active = state.backgroundLibrary.find((item) => item.id === activeId);
        if (!active && wantsFile && state.backgroundLibrary.length) {
          active = state.backgroundLibrary[0];
          activeId = active.id;
        }
        state.backgroundImageId = active?.id || '';
        state.backgroundImage = active?.dataUrl || '';
        // Re-align library activeId with settings after a partial wipe.
        if (
          state.backgroundImageId &&
          state.backgroundImageId !== listed.activeId &&
          api.selectBackgroundImage
        ) {
          try {
            await api.selectBackgroundImage(state.backgroundImageId);
          } catch (_) {
            /* ignore */
          }
        }
      }
    } catch (_) {
      /* fall through */
    }
  }

  if (!state.backgroundImage && api.isElectron && api.loadBackgroundImage && wantsFile) {
    try {
      const loaded = await api.loadBackgroundImage();
      if (loaded?.ok && loaded.dataUrl) {
        state.backgroundImage = loaded.dataUrl;
        state.backgroundImageId = loaded.activeId || state.backgroundImageId;
      }
    } catch (_) {
      /* ignore */
    }
  }

  if (
    !state.backgroundImage &&
    typeof saved.backgroundImage === 'string' &&
    saved.backgroundImage.startsWith('data:')
  ) {
    state.backgroundImage = saved.backgroundImage;
    if (!state.backgroundLibrary.length) {
      state.backgroundImageId = state.backgroundImageId || 'bg_web_1';
      state.backgroundLibrary = [
        {
          id: state.backgroundImageId,
          name: 'Wallpaper',
          dataUrl: state.backgroundImage,
        },
      ];
    } else {
      const active = state.backgroundLibrary.find(
        (item) => item.id === state.backgroundImageId
      );
      if (active?.dataUrl) state.backgroundImage = active.dataUrl;
    }
  } else if (!state.backgroundImage && state.backgroundLibrary.length) {
    const active =
      state.backgroundLibrary.find((item) => item.id === state.backgroundImageId) ||
      state.backgroundLibrary[0];
    state.backgroundImageId = active.id;
    state.backgroundImage = active.dataUrl || '';
  }
}

function updateRemoteButton() {
  const btn = document.getElementById('btn-remote');
  if (!btn) return;
  const connected = activePane()?.mode === 'ssh';
  const key = connected ? 'toolbar.remoteDisconnect' : 'toolbar.remote';
  const text = i18n.t(key);
  btn.removeAttribute('title');
  btn.setAttribute('aria-label', text);
  btn.dataset.tooltip = text;
  btn.classList.toggle('tb-active', connected);
  updateStatusBar();
}

function updateGitStatusButton() {
  const btn = document.getElementById('btn-git-status');
  if (!btn) return;
  const on = state.promptGitMode !== 'off';
  const key = on ? 'toolbar.gitStatusOn' : 'toolbar.gitStatusOff';
  const text = i18n.t(key);
  btn.removeAttribute('title');
  btn.setAttribute('aria-label', text);
  btn.dataset.tooltip = text;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('tb-active', on);
}

/** Apply git prompt mode, persist, and refresh the active local prompt. */
async function applyPromptGitMode(mode) {
  state.promptGitMode = normalizePromptGitMode(mode);
  if (state.promptGitMode !== 'off') {
    state.promptGitModeOn = state.promptGitMode;
  }
  if (api.setPrompt) {
    await api.setPrompt({ gitMode: state.promptGitMode });
  }
  await persist();
  updateGitStatusButton();
  settingsHost?.setGitMode?.(state.promptGitMode);
  const pane = activePane();
  if (pane && pane.mode !== 'ssh') pane.clear();
}

/** @type {{ setGitMode?: Function, showTab?: Function, onEvent?: Function, open?: boolean } | null} */
let settingsHost = null;
/** Open About / SSH popups by kind, so a second toolbar press brings the window to the front. */
const popupHosts = { about: null, ssh: null };

function focusOpenPopup(kind) {
  const host = popupHosts[kind];
  if (host?.open && host.focus) {
    host.focus();
    return true;
  }
  popupHosts[kind] = null;
  return false;
}
let promptApplyTimer = null;

/**
 * Prompt change from the settings dialog: keep state, then (debounced) push
 * the config to the shells and redraw the active prompt.
 */
function applyPromptChange({ config, gitMode, presetId, customPrompts }) {
  const nextConfig = config ? normalizePrompt(config) : state.promptConfig;
  const nextMode = normalizePromptGitMode(gitMode);
  const changed =
    JSON.stringify(nextConfig) !== JSON.stringify(state.promptConfig) || nextMode !== state.promptGitMode;
  state.promptConfig = nextConfig;
  state.promptGitMode = nextMode;
  if (nextMode !== 'off') state.promptGitModeOn = nextMode;
  state.promptPresetId = typeof presetId === 'string' ? presetId : '';
  if (Array.isArray(customPrompts)) state.customPrompts = normalizeCustomPrompts(customPrompts);
  if (!changed) return;
  clearTimeout(promptApplyTimer);
  promptApplyTimer = setTimeout(async () => {
    if (api.setPrompt) {
      await api.setPrompt({ config: state.promptConfig, gitMode: state.promptGitMode });
    }
    updateGitStatusButton();
    const pane = activePane();
    if (!pane || pane.mode === 'ssh') return;
    // Redraw the prompt (Ctrl+L path: clears the screen and draws it again).
    pane.clear();
  }, 350);
}

function applyStatusBarVisibility() {
  const bar = document.getElementById('status-bar');
  const visible = !!state.showStatusBar;
  document.body.classList.toggle('statusbar-hidden', !visible);
  if (bar) bar.hidden = !visible;
  updateStatusBar();
  // Wait for flex layout to settle, then refit every pane so the last row
  // is not clipped by the status bar.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!sessions?.panes) {
        sessions?.active?.fit();
        return;
      }
      for (const pane of sessions.panes.values()) pane.fit();
    });
  });
}

function updateStatusBar() {
  if (!state.showStatusBar) return;
  const pane = activePane();
  const modeEl = document.getElementById('status-mode');
  const sessionEl = document.getElementById('status-session');
  const fontEl = document.getElementById('status-font');
  const sizeEl = document.getElementById('status-size');
  if (!modeEl || !sessionEl || !fontEl || !sizeEl) return;

  if (!pane) {
    modeEl.textContent = '';
    sessionEl.textContent = '';
    fontEl.textContent = '';
    sizeEl.textContent = '';
    return;
  }

  const remote = pane.mode === 'ssh';
  const shellName = !remote && pane.shellInfo?.short ? ` · ${pane.shellInfo.short}` : '';
  modeEl.textContent = (remote ? i18n.t('settings.statusRemote') : i18n.t('settings.statusLocal')) + shellName;
  sessionEl.textContent = pane.title || `${i18n.t('tabs.session')} ${pane.sessionId}`;
  fontEl.textContent = `${getFontById(state.fontId).label} ${pane.fontSize}px`;
  sizeEl.textContent = `${pane.term.cols}×${pane.term.rows}`;
}

function applyTheme() {
  const theme = currentTheme();
  // Two independent controls: the toolbar slider drives whole-window opacity
  // (setOpacity), while the Settings "background transparency" slider drives the
  // wallpaper image's alpha (below).
  applyThemeToDocument(
    theme,
    state.bgImageTransparency,
    state.backgroundImage,
    getBgFitById(state.backgroundFit)
  );
  sessions?.applyTheme(theme);
  sessions?.setLsColors?.(effectiveLsColors());
  updateBgFitUi();
  updateBgImageButton();
  updateTextColorUi();
}

function updateFontUi() {
  const font = getFontById(state.fontId);
  const sizeLabel = document.getElementById('font-size-label');
  if (sizeLabel) sizeLabel.textContent = `${state.fontSize}px`;
  const btn = document.getElementById('btn-font');
  if (btn) {
    const tip = `${i18n.t('toolbar.fontFamily')}: ${font.label}`;
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
  }
}

function updateTextColorUi() {
  const input = document.getElementById('fg-color');
  const btn = document.getElementById('btn-fg-color');
  const color = currentTheme().foreground || '#d4d4d4';
  if (input && input.value.toLowerCase() !== String(color).toLowerCase()) {
    input.value = color;
  }
  if (btn) {
    const tip = `${i18n.t('toolbar.textColor')}: ${color}`;
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
  }
}

function applyTextColor(color) {
  setThemeColors({ foreground: color });
  applyTheme();
}

function bgFitLabel(id = state.backgroundFit) {
  return i18n.t(`toolbar.bgFitModes.${id}`, id);
}

function updateBgFitUi() {
  const btn = document.getElementById('btn-bg-fit');
  if (btn) {
    const tip = `${i18n.t('toolbar.bgFit')}: ${bgFitLabel()}`;
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
  }
}

function updateBgImageButton() {
  const btn = document.getElementById('btn-bg-image');
  if (!btn) return;
  const on = state.backgroundFit !== 'none';
  const key = on ? 'toolbar.bgImageOn' : 'toolbar.bgImageOff';
  const text = i18n.t(key);
  btn.removeAttribute('title');
  btn.setAttribute('aria-label', text);
  btn.dataset.tooltip = text;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('tb-active', on);
  const iconOn = btn.querySelector('.tb-bg-image-on');
  const iconOff = btn.querySelector('.tb-bg-image-off');
  if (iconOn) iconOn.hidden = !on;
  if (iconOff) iconOff.hidden = on;
}

function applyBackgroundFit(fitId, { persistSettings = true } = {}) {
  state.backgroundFit = normalizeBgFit(fitId);
  if (state.backgroundFit !== 'none') {
    state.backgroundFitOn = state.backgroundFit;
  }
  applyTheme();
  syncToolbarMinWidth();
  if (persistSettings) persist();
}

/** Toolbar toggle: hide wallpaper (fit=none) or restore the last fit mode. */
function toggleBackgroundImage() {
  if (state.backgroundFit === 'none') {
    applyBackgroundFit(state.backgroundFitOn || DEFAULT_BG_FIT);
  } else {
    state.backgroundFitOn = state.backgroundFit;
    applyBackgroundFit('none');
  }
}

function updateTransparencyUi(value = state.bgTransparency) {
  const slider = document.getElementById('bg-transparency');
  const label = document.getElementById('bg-transparency-value');
  const n = clampTransparency(value);
  if (slider && String(slider.value) !== String(n)) slider.value = String(n);
  if (slider) {
    slider.setAttribute('aria-valuenow', String(n));
    slider.setAttribute(
      'aria-valuetext',
      i18n.t('toolbar.transparencyCurrent', `${n}%`).replace('{value}', String(n))
    );
  }
  if (label) label.textContent = `${n}%`;
}

/** Map a transparency percent (0–100) to a usable window opacity (1.0–0.2). */
function windowOpacityFromTransparency(n) {
  const t = clampTransparency(n);
  return Math.max(0.2, 1 - t / 100);
}

/** Push the current transparency to the whole window via Electron setOpacity. */
function applyWindowOpacity() {
  api.setWindowOpacity?.(windowOpacityFromTransparency(state.bgTransparency));
}

function applyBackgroundTransparency(value, { persistSettings = true } = {}) {
  state.bgTransparency = clampTransparency(value);
  updateTransparencyUi(state.bgTransparency);
  applyWindowOpacity();
  applyTheme();
  if (persistSettings) persist();
}

function applyFont() {
  const font = getFontById(state.fontId);
  sessions?.setFontFamily(font.family);
  updateFontUi();
  syncToolbarMinWidth();
}

function applyScrollback() {
  sessions?.setScrollback(state.scrollback);
}

/** Tab strip overflow: show ◀ ▶ on the right and enable them per scroll position. */
function updateTabScrollButtons() {
  const bar = document.getElementById('tab-bar');
  const box = document.getElementById('tab-scroll');
  if (!bar || !box) return;
  const overflow = bar.scrollWidth > bar.clientWidth + 1;
  box.hidden = !overflow;
  if (!overflow) return;
  const left = document.getElementById('tab-scroll-left');
  const right = document.getElementById('tab-scroll-right');
  if (left) left.disabled = bar.scrollLeft <= 0;
  if (right) right.disabled = bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 1;
}

function bindTabScroll() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  const step = () => Math.max(120, Math.round(bar.clientWidth * 0.6));
  document.getElementById('tab-scroll-left')?.addEventListener('click', () => {
    bar.scrollBy({ left: -step(), behavior: 'smooth' });
  });
  document.getElementById('tab-scroll-right')?.addEventListener('click', () => {
    bar.scrollBy({ left: step(), behavior: 'smooth' });
  });
  bar.addEventListener('scroll', () => updateTabScrollButtons(), { passive: true });
  // Mouse wheel over the strip scrolls it sideways.
  bar.addEventListener(
    'wheel',
    (e) => {
      if (bar.scrollWidth <= bar.clientWidth) return;
      bar.scrollLeft += e.deltaY || e.deltaX;
      e.preventDefault();
    },
    { passive: false }
  );
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => updateTabScrollButtons()).observe(bar);
  window.addEventListener('resize', () => updateTabScrollButtons());
}

/** The ls / dir colours, deepened when they would vanish on a light terminal background. */
function effectiveLsColors() {
  const bg = currentTheme().background || '#1e1e1e';
  return {
    directory: ensureContrast(state.lsDirectoryColor, bg, 4.5),
    file: ensureContrast(state.lsFileColor, bg, 4.5),
  };
}

/**
 * Terminal profile → this window: font, size, scrollback, default shell, then
 * the window is resized so the active terminal shows cols × rows.
 */
async function applyTerminalProfile(profile) {
  const p = normalizeTerminalProfiles([profile])[0];
  if (!p) return;
  state.fontId = getFontById(p.fontId).id;
  state.fontSize = p.fontSize;
  state.scrollback = p.scrollback;
  if (p.shellId) state.shellId = p.shellId;
  sessions?.setFontSize(state.fontSize);
  applyFont();
  applyScrollback();
  updateFontUi();
  await persist();
  await resizeTerminalTo(p.cols, p.rows);
}

/**
 * Resize the window so the active terminal shows cols × rows. Grows / shrinks
 * by whole cells over a few passes (a font change alters the cell size); the
 * window's minimum width — the toolbar — can keep the terminal wider than asked.
 */
let resizeChain = Promise.resolve();
async function resizeTerminalTo(cols, rows) {
  // One resize at a time: a second request waits for the running one.
  const run = resizeChain.then(() => resizeTerminalToNow(cols, rows)).catch(() => {});
  resizeChain = run;
  return run;
}

async function resizeTerminalToNow(cols, rows) {
  const pane = activePane();
  if (!pane || !api.resizeWindowBy) {
    updateStatusBar();
    return;
  }
  // Plain timers: requestAnimationFrame stalls while a dialog covers the window.
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Wait until the pane's pixel size actually changed (the window resize lands asynchronously). */
  const waitForHostChange = async (before) => {
    for (let i = 0; i < 10; i += 1) {
      await settle(60);
      const m = pane.cellMetrics();
      if (m.hostWidth !== before.hostWidth || m.hostHeight !== before.hostHeight) return true;
    }
    return false;
  };
  let lastSize = '';
  for (let pass = 0; pass < 8; pass += 1) {
    await settle(120);
    pane.fit();
    const m = pane.cellMetrics();
    if (!m.cellWidth || !m.cellHeight) break;
    if (pane.term.cols === cols && pane.term.rows === rows) break;
    const dw = Math.round((cols - pane.term.cols) * m.cellWidth);
    const dh = Math.round((rows - pane.term.rows) * m.cellHeight);
    if (!dw && !dh) break;
    const res = await api.resizeWindowBy({ dw, dh });
    // The window did not change (its minimum size — the toolbar width — is in the way): stop.
    const size = res ? `${res.width}x${res.height}` : '';
    if (size && size === lastSize) break;
    lastSize = size;
    if (!(await waitForHostChange(m))) break;
  }
  await settle(60);
  pane.fit();
  updateStatusBar();
}

function langLabel(lang = state.lang) {
  const id = lang === 'ko' ? 'ko' : 'en';
  return i18n.t(`language.${id}`, id.toUpperCase());
}

/** Toolbar language button: shows the current language's flag; a click switches to the next one. */
const LANGS = ['ko', 'en'];
/** Inline SVG flags (Windows has no flag emoji): 태극기 for Korean, the Union Jack for English. */
const LANG_FLAGS = {
  ko: `<svg viewBox="0 0 60 40" class="flag-ko">
      <rect width="60" height="40" fill="#fff"/>
      <g transform="translate(30 20) rotate(-33.7)">
        <circle r="12" fill="#cd2e3a"/>
        <path d="M-12 0a12 12 0 0 0 24 0a6 6 0 0 0-12 0a6 6 0 0 1-12 0z" fill="#0047a0"/>
      </g>
      <!-- trigrams as solid blocks: at icon size thin bars only blur -->
      <g fill="#222">
        <rect x="-6" y="-4" width="12" height="8" rx="1" transform="translate(12 8) rotate(-33.7)"/>
        <rect x="-6" y="-4" width="12" height="8" rx="1" transform="translate(48 32) rotate(-33.7)"/>
        <rect x="-6" y="-4" width="12" height="8" rx="1" transform="translate(48 8) rotate(33.7)"/>
        <rect x="-6" y="-4" width="12" height="8" rx="1" transform="translate(12 32) rotate(33.7)"/>
      </g>
    </svg>`,
  en: `<svg viewBox="0 0 60 30" class="flag-en">
      <clipPath id="flag-en-clip"><rect width="60" height="30"/></clipPath>
      <g clip-path="url(#flag-en-clip)">
        <rect width="60" height="30" fill="#012169"/>
        <path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6"/>
        <path d="M0 0L60 30M60 0L0 30" stroke="#c8102e" stroke-width="2"/>
        <path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/>
        <path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/>
      </g>
    </svg>`,
};

function updateLangUi() {
  const btn = document.getElementById('btn-lang');
  if (btn) {
    const tip = i18n.t('toolbar.languageToggle', 'Language: {name}').replace('{name}', langLabel());
    btn.removeAttribute('title');
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
    btn.dataset.lang = state.lang;
    // The flag shows the language a click switches TO: 태극기 while in English, the Union Jack while in Korean.
    const next = LANGS[(LANGS.indexOf(state.lang) + 1) % LANGS.length];
    const flag = document.getElementById('lang-flag');
    if (flag) flag.innerHTML = LANG_FLAGS[next] || LANG_FLAGS.en;
  }
}

async function applyLanguage(lang) {
  state.lang = lang === 'ko' ? 'ko' : 'en';
  await i18n.setLanguage(state.lang);
  // Open dialogs keep old strings; close them so reopen uses the new language.
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) modalRoot.innerHTML = '';
  // Refresh default local session titles that were baked in at create time
  // (tabs opened with a specific shell keep that shell's name).
  if (sessions) {
    for (const pane of sessions.panes.values()) {
      if (pane.mode !== 'ssh' && !pane.shellInfo) {
        pane.title = `${i18n.t('tabs.session')} ${pane.sessionId}`;
      }
    }
    sessions.renderTabs();
  }
  updateRemoteButton();
  updateGitStatusButton();
  updateStatusBar();
  updateBgFitUi();
  updateBgImageButton();
  updateLangUi();
  updateFontUi();
  updateTextColorUi();
  updateMaxButton(await (api.isMaximized?.() ?? false));
  syncToolbarMinWidth();
}

/** Fallback / floor until layout is measured (brand + actions + opacity + win btns). */
const TOOLBAR_MIN_WIDTH_FLOOR = 920;
const TOOLBAR_MIN_WIDTH_CAP = 1800;

/**
 * Intrinsic toolbar content width (never use toolbar.scrollWidth — that tracks
 * the window width and caused unbounded growth via setMinSize feedback).
 * Includes flex gap, horizontal margins, and spacer min-width so the close (X)
 * control is never clipped when the window is at minimum size.
 */
function measureToolbarMinWidth() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return TOOLBAR_MIN_WIDTH_FLOOR;

  const styles = getComputedStyle(toolbar);
  const pad =
    (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;

  const kids = Array.from(toolbar.children).filter((el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });

  let contentWidth = 0;
  kids.forEach((el, idx) => {
    if (idx > 0) contentWidth += gap;
    const cs = getComputedStyle(el);
    contentWidth += (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    if (el.classList.contains('toolbar-spacer')) {
      // Spacer shrinks; reserve only its minimum so min-width stays stable.
      contentWidth += parseFloat(cs.minWidth) || 16;
      return;
    }
    // scrollWidth = intrinsic content; rect width helps when fonts just painted.
    const rectW = el.getBoundingClientRect().width;
    contentWidth += Math.max(el.scrollWidth, Math.ceil(rectW));
  });

  // DPI / resize-border safety so the X button stays fully inside the client area.
  const measured = Math.ceil(pad + contentWidth + 20);
  return Math.min(TOOLBAR_MIN_WIDTH_CAP, Math.max(TOOLBAR_MIN_WIDTH_FLOOR, measured));
}

/** @param {{ resizeToMin?: boolean }} [opts] */
async function syncToolbarMinWidth(opts = {}) {
  if (!api.isElectron || !api.setMinSize) return null;
  const width = measureToolbarMinWidth();
  try {
    return await api.setMinSize({ width, height: 420, resizeToMin: !!opts.resizeToMin });
  } catch (_) {
    return null;
  }
}

function updateBrandTitle(version) {
  const el = document.getElementById('brand-title');
  if (!el) return;
  const ver = String(version || '1.0.0').replace(/^v/i, '');
  el.textContent = `MyTerminal V${ver}`;
}

function closeMenus() {
  document.querySelectorAll('.tb-menu').forEach((m) => {
    m.hidden = true;
    m.classList.remove('tb-menu-open');
    // Restore menu to its toolbar wrapper after portal open.
    if (m._menuHome && m.parentElement !== m._menuHome) {
      m._menuHome.appendChild(m);
    }
  });
}

function positionMenu(menu, anchor) {
  if (!menu._menuHome) menu._menuHome = menu.parentElement;
  // Portal to body so toolbar overflow cannot clip the dropdown.
  document.body.appendChild(menu);
  menu.hidden = false;
  menu.classList.add('tb-menu-open');

  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.style.top = `${rect.bottom + 6}px`;

  const mrect = menu.getBoundingClientRect();
  if (mrect.right > window.innerWidth - 8) {
    menu.style.left = `${Math.max(8, window.innerWidth - mrect.width - 8)}px`;
  }
  if (mrect.bottom > window.innerHeight - 8) {
    menu.style.top = `${Math.max(8, rect.top - mrect.height - 6)}px`;
  }
}

function toggleMenu(menuId, populate, anchor) {
  const menu = document.getElementById(menuId);
  const willOpen = menu.hidden;
  closeMenus();
  if (populate) populate();
  if (willOpen && anchor) {
    // Defer open so a bubbling document click cannot instantly re-close it.
    requestAnimationFrame(() => {
      positionMenu(menu, anchor);
    });
  }
}

/** Inline SVG glyphs used inside the toolbar dropdown menus. */
const MENU_ICONS = {
  font: '<path d="M5 18l4.5-12 4.5 12M6.7 14h5.6"/><path d="M15.5 18l3-8 3 8M16.5 15.4h4"/>',
  custom: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9.5" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="15.5" cy="13.5" r="1"/><path d="M12 20c-1 0-1.4-.9-.9-1.7.6-.9.2-1.9-.9-1.9"/>',
  fitNone: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M7 15l3-3 2 2 3-3 2 2"/><path d="M4 6l16 12" opacity="0.9"/>',
  fitCover: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M4 6l16 12M20 6L4 18"/>',
  fitContain: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><rect x="8" y="8.5" width="8" height="7" rx="1"/>',
  fitStretch: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M4 12h16M8 9l-3 3 3 3M16 9l3 3-3 3"/>',
  fitCenter: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><circle cx="12" cy="12" r="3"/>',
  fitTile: '<rect x="5" y="6" width="6" height="5" rx="1"/><rect x="13" y="6" width="6" height="5" rx="1"/><rect x="5" y="13" width="6" height="5" rx="1"/><rect x="13" y="13" width="6" height="5" rx="1"/>',
};

const BG_FIT_ICON = {
  none: MENU_ICONS.fitNone,
  cover: MENU_ICONS.fitCover,
  contain: MENU_ICONS.fitContain,
  stretch: MENU_ICONS.fitStretch,
  center: MENU_ICONS.fitCenter,
  tile: MENU_ICONS.fitTile,
};

/** A distinct glyph per built-in theme (backgrounds are too similar to tell apart). */
const THEME_ICONS = {
  dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  light:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  midnight:
    '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M16.5 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  forest: '<path d="M12 3l4.5 7H14l3 4.5H7l3-4.5H7.5z"/><path d="M12 14.5V21"/>',
  sunset:
    '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 3.5v2.5M4.8 7.3l1.6 1.6M19.2 7.3l-1.6 1.6M2.5 13h2M19.5 13h2"/>',
  ocean:
    '<path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  custom: MENU_ICONS.custom,
};

/** A leading icon cell (`viewBox` SVG) for a dropdown menu item. */
function menuIcon(svgInner) {
  return `<span class="menu-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${svgInner}</svg></span>`;
}

/** A leading text-badge cell (e.g. a language code) for a dropdown menu item. */
function menuBadge(text) {
  return `<span class="menu-ico menu-badge" aria-hidden="true">${text}</span>`;
}

/** A leading swatch cell: a theme's own colors plus a distinct glyph. */
function menuSwatch(bg, fg, svgInner) {
  return `<span class="menu-ico menu-swatch" aria-hidden="true" style="background:${bg};border-color:${fg};color:${fg}"><svg viewBox="0 0 24 24">${svgInner}</svg></span>`;
}

/** "+ ▾" menu on the tab bar: one entry per installed command shell (default marked). */
function populateShellMenu() {
  const menu = document.getElementById('shell-menu');
  const shells = state.shells || [];
  const defaultId = state.shellId && shells.some((sh) => sh.id === state.shellId) ? state.shellId : state.shellDefaultId;
  menu.innerHTML = shells
    .map((sh) => {
      const isDefault = sh.id === defaultId;
      const tag = isDefault ? ` <span class="menu-tag">${i18n.t('tabs.defaultShell', 'default')}</span>` : '';
      return `<button class="menu-item${isDefault ? ' active' : ''}" type="button" data-shell="${sh.id}" title="${sh.path}">${menuBadge(
        (sh.short || sh.id).slice(0, 4)
      )}<span class="menu-label">${sh.label}${tag}</span></button>`;
    })
    .join('');
}

async function openNewTabWithShell(shellId) {
  const sh = (state.shells || []).find((x) => x.id === shellId);
  await sessions.create({
    fontSize: state.fontSize,
    fontFamily: getFontById(state.fontId).family,
    scrollback: state.scrollback,
    shellId,
    shellShort: sh?.short || shellId,
  });
  updateStatusBar();
}

function populateThemeMenu() {
  const menu = document.getElementById('theme-menu');
  const ids = getThemeList(state.themes);
  menu.innerHTML = ids
    .map((id) => {
      const label = i18n.t(`themes.${id}`, id);
      const active = id === state.themeId ? ' active' : '';
      const glyph = THEME_ICONS[id] || THEME_ICONS.custom;
      const t = resolveTheme(state.themes, id, state.themeOverrides?.[id]);
      const lead = menuSwatch(t.background || '#1e1e1e', t.foreground || '#d4d4d4', glyph);
      return `<button class="menu-item${active}" type="button" data-theme="${id}">${lead}<span class="menu-label">${label}</span></button>`;
    })
    .join('');
}


function populateFontMenu() {
  const menu = document.getElementById('font-menu');
  menu.innerHTML = FONTS.map((font) => {
    const active = font.id === state.fontId ? ' active' : '';
    return `<button class="menu-item${active}" type="button" data-font="${font.id}">${menuIcon(
      MENU_ICONS.font
    )}<span class="font-preview menu-label" style="font-family:${font.family.replace(
      /"/g,
      "'"
    )}">${font.label}</span></button>`;
  }).join('');
}

function populateBgFitMenu() {
  const menu = document.getElementById('bg-fit-menu');
  menu.innerHTML = BG_FIT_MODES.map((mode) => {
    const active = mode.id === state.backgroundFit ? ' active' : '';
    const lead = menuIcon(BG_FIT_ICON[mode.id] || MENU_ICONS.fitCover);
    return `<button class="menu-item${active}" type="button" data-bg-fit="${mode.id}">${lead}<span class="menu-label">${bgFitLabel(
      mode.id
    )}</span></button>`;
  }).join('');
}

function bindToolbar() {
  const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);

  on('btn-remote', async () => {
    if (!api.isElectron || !api.sshConnect) {
      alert(i18n.t('ssh.webOnly'));
      return;
    }
    const pane = activePane();
    if (!pane) return;

    if (pane.mode === 'ssh') {
      await api.sshDisconnect({ sessionId: pane.sessionId });
      pane.markLocal();
      sessions.renderTabs();
      updateRemoteButton();
      return;
    }

    if (focusOpenPopup('ssh')) return;
    const sshHost = await openSshModal({
      i18n,
      defaults: state.ssh || {},
      profiles: state.sshProfiles,
      themes: state.themes,
      themeId: state.themeId,
      custom: state.custom,
      onConnect: async (config) => {
        const result = await api.sshConnect({
          ...config,
          sessionId: pane.sessionId,
          cols: pane.term.cols,
          rows: pane.term.rows,
        });
        if (!result?.ok) {
          reportError(
            { message: result?.error || i18n.t('ssh.failed'), details: `[ssh] ${config.username || ''}@${config.host}:${config.port}\n${result?.details || result?.error || i18n.t('ssh.failed')}` },
            { context: 'ssh', title: i18n.t('ssh.title') }
          );
        }
        if (result?.ok) {
          pane.markRemote(`${config.username}@${config.host}`);
          sessions.renderTabs();
          state.ssh = {
            host: config.host,
            port: config.port,
            username: config.username,
            privateKey: config.privateKey || '',
          };
          updateRemoteButton();
          await persist();
        }
        return result;
      },
    });
    if (sshHost?.focus) popupHosts.ssh = sshHost;
  });

  on('btn-prompt', () => openSettings('prompt'));

  on('btn-git-status', async () => {
    if (state.promptGitMode === 'off') {
      await applyPromptGitMode(state.promptGitModeOn || DEFAULT_PROMPT_GIT_MODE);
    } else {
      state.promptGitModeOn = state.promptGitMode;
      await applyPromptGitMode('off');
    }
  });

  on('btn-clear', () => activePane()?.clear());
  on('btn-copy', () => activePane()?.copy());
  on('btn-paste', () => activePane()?.paste());
  on('btn-font-dec', async () => {
    state.fontSize = sessions.changeFont(-1) || state.fontSize;
    updateFontUi();
    updateStatusBar();
    syncToolbarMinWidth();
    await persist();
  });
  on('btn-font-inc', async () => {
    state.fontSize = sessions.changeFont(1) || state.fontSize;
    updateFontUi();
    updateStatusBar();
    syncToolbarMinWidth();
    await persist();
  });

  on('btn-font', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu('font-menu', populateFontMenu, e.currentTarget);
  });

  document.getElementById('font-menu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-font]');
    if (!btn) return;
    state.fontId = btn.dataset.font;
    applyFont();
    updateStatusBar();
    await persist();
    closeMenus();
  });

  const fgColor = document.getElementById('fg-color');
  const fgBtn = document.getElementById('btn-fg-color');
  if (fgBtn && fgColor) {
    on('btn-fg-color', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenus();
      // Show native color picker near the toolbar button.
      if (typeof fgColor.showPicker === 'function') {
        try {
          fgColor.showPicker();
          return;
        } catch (_) {
          /* fall through */
        }
      }
      fgColor.click();
    });
    fgColor.addEventListener('input', (e) => {
      applyTextColor(e.target.value);
    });
    fgColor.addEventListener('change', async () => {
      await persist();
    });
  }

  on('btn-theme', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu('theme-menu', populateThemeMenu, e.currentTarget);
  });

  on('btn-bg-image', () => {
    toggleBackgroundImage();
  });

  on('btn-bg-fit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu('bg-fit-menu', populateBgFitMenu, e.currentTarget);
  });

  document.getElementById('bg-fit-menu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-bg-fit]');
    if (!btn) return;
    applyBackgroundFit(btn.dataset.bgFit);
    closeMenus();
  });

  on('btn-lang', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenus();
    // Cycle through the supported languages; the badge shows the new one.
    const next = LANGS[(LANGS.indexOf(state.lang) + 1) % LANGS.length];
    await applyLanguage(next);
    await persist();
  });

  document.getElementById('shell-menu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-shell]');
    if (!btn) return;
    closeMenus();
    await openNewTabWithShell(btn.dataset.shell);
  });

  document.getElementById('theme-menu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    if (!state.themes?.[btn.dataset.theme]) return;
    state.themeId = btn.dataset.theme;
    syncCustomColors();
    applyTheme();
    await persist();
    closeMenus();
  });


  const transparencySlider = document.getElementById('bg-transparency');
  if (transparencySlider) {
    transparencySlider.addEventListener('input', (e) => {
      applyBackgroundTransparency(e.target.value, { persistSettings: false });
    });
    transparencySlider.addEventListener('change', (e) => {
      applyBackgroundTransparency(e.target.value, { persistSettings: true });
    });
  }

  async function openSettings(tab = 'general') {
    const wanted = SETTINGS_TABS.includes(tab) ? tab : 'general';
    // Already open (Electron popup): switch tabs and bring it to the front.
    if (settingsHost?.open && settingsHost.showTab) {
      settingsHost.showTab(wanted);
      settingsHost.focus?.();
      return;
    }
    // Color pickers reflect the active theme with its overrides.
    syncCustomColors();
    const host = await openSettingsModal({
      i18n,
      tab: wanted,
      custom: state.custom,
      themeOverrides: state.themeOverrides,
      sshProfiles: state.sshProfiles,
      terminalProfiles: state.terminalProfiles,
      termCols: activePane()?.term?.cols || 80,
      termRows: activePane()?.term?.rows || 24,
      defaultTermCols: state.termCols,
      defaultTermRows: state.termRows,
      onApplyProfile: (profile) => applyTerminalProfile(profile),
      shells: state.shells,
      shellId: state.shellId,
      shellCustomPath: state.shellCustomPath,
      shellDefaultId: state.shellDefaultId,
      platform: api.platform || 'web',
      promptConfig: state.promptConfig,
      promptGitMode: state.promptGitMode,
      customPrompts: state.customPrompts,
      // The preview uses the terminal's font family at the dialog's own size — the
      // terminal font size never changes other windows.
      previewFont: { family: getFontById(state.fontId).family, size: 13 },
      scrollback: state.scrollback,
      startDirectory: state.startDirectory,
      showStatusBar: state.showStatusBar,
      showTrayIcon: state.showTrayIcon,
      allowTray: !!api.isElectron,
      backgroundImage: state.backgroundImage,
      backgroundImageId: state.backgroundImageId,
      backgroundLibrary: state.backgroundLibrary,
      backgroundFit: state.backgroundFit,
      backgroundFitOn: state.backgroundFitOn || DEFAULT_BG_FIT,
      bgImageTransparency: state.bgImageTransparency,
      bgFitModes: BG_FIT_MODES,
      themes: state.themes,
      themeId: state.themeId,
      fonts: FONTS,
      fontId: state.fontId,
      fontSize: state.fontSize,
      lsDirectoryColor: state.lsDirectoryColor,
      lsFileColor: state.lsFileColor,
      onBgDir: async (directory) => {
        if (!directory) return;
        state.backgroundImageDir = directory;
        await persist();
      },
      onPickBackground: api.pickBackgroundImage
        ? async () => {
            const result = await api.pickBackgroundImage();
            if (result?.ok && result.directory) {
              state.backgroundImageDir = result.directory;
            }
            if (result?.ok && Array.isArray(result.items)) {
              state.backgroundLibrary = result.items;
              state.backgroundImageId = result.activeId || result.id || '';
            }
            return result;
          }
        : null,
      onClearBackground: api.clearBackgroundImage
        ? async () => {
            const result = await api.clearBackgroundImage();
            if (result?.items) state.backgroundLibrary = result.items;
            state.backgroundImageId = '';
            return result;
          }
        : null,
      onChange: async ({
        custom,
        scrollback,
        startDirectory,
        showStatusBar,
        showTrayIcon,
        shellId,
        shellCustomPath,
        promptConfig,
        promptGitMode,
        promptPresetId,
        customPrompts,
        themeId,
        sshProfiles,
        terminalProfiles,
        defaultTermCols,
        defaultTermRows,
        backgroundImage,
        backgroundImageId,
        backgroundLibrary,
        backgroundFit,
        backgroundFitOn,
        bgImageTransparency,
        themeTouched,
        fontId,
        fontSize,
        lsDirectoryColor,
        lsFileColor,
      }) => {
        // Theme tab picks the theme; the colours tab edits the current theme's overrides.
        if (typeof themeId === 'string' && state.themes?.[themeId]) state.themeId = themeId;
        if (custom && typeof custom === 'object') setThemeColors(custom);
        else syncCustomColors();
        void themeTouched;
        state.scrollback = clampScrollback(scrollback);
        // Only update when provided, so other settings events cannot wipe it.
        if (typeof startDirectory === 'string') {
          state.startDirectory = startDirectory.trim();
        }
        state.showStatusBar = !!showStatusBar;
        state.showTrayIcon = !!showTrayIcon;
        if (typeof shellId === 'string' && shellId !== state.shellId) {
          state.shellId = shellId;
          const sh = (state.shells || []).find((x) => x.id === (shellId || state.shellDefaultId));
          if (sh) sessions?.applyDefaultShellInfo({ id: sh.id, label: sh.label, short: sh.short || sh.id });
        }
        if (Array.isArray(sshProfiles)) state.sshProfiles = normalizeSshProfiles(sshProfiles);
        if (Array.isArray(terminalProfiles)) state.terminalProfiles = normalizeTerminalProfiles(terminalProfiles);
        if (defaultTermCols != null || defaultTermRows != null) {
          const next = clampTermSize(defaultTermCols ?? state.termCols, defaultTermRows ?? state.termRows);
          if (next.cols !== state.termCols || next.rows !== state.termRows) {
            state.termCols = next.cols;
            state.termRows = next.rows;
            resizeTerminalTo(next.cols, next.rows);
          }
        }
        if (typeof shellCustomPath === 'string') state.shellCustomPath = shellCustomPath;
        if (promptConfig && typeof promptConfig === 'object') {
          applyPromptChange({ config: promptConfig, gitMode: promptGitMode, presetId: promptPresetId, customPrompts });
        }
        if (fontId) state.fontId = getFontById(fontId).id;
        if (fontSize != null) {
          state.fontSize = Math.max(10, Math.min(28, Number.parseInt(fontSize, 10) || state.fontSize));
          sessions?.setFontSize(state.fontSize);
        }
        if (Array.isArray(backgroundLibrary)) {
          state.backgroundLibrary = backgroundLibrary;
        }
        if (typeof backgroundImageId === 'string') {
          state.backgroundImageId = backgroundImageId;
        }
        // Prefer explicit image; otherwise resolve from library id (avoid wiping on '').
        let nextImage = typeof backgroundImage === 'string' ? backgroundImage : state.backgroundImage;
        if (!nextImage && state.backgroundImageId) {
          nextImage =
            state.backgroundLibrary.find((item) => item.id === state.backgroundImageId)
              ?.dataUrl || '';
        }
        state.backgroundImage = nextImage;
        state.backgroundFit = normalizeBgFit(backgroundFit || state.backgroundFit);
        if (state.backgroundFit !== 'none') {
          state.backgroundFitOn = state.backgroundFit;
        } else if (
          typeof backgroundFitOn === 'string' &&
          backgroundFitOn !== 'none'
        ) {
          state.backgroundFitOn = normalizeBgFit(backgroundFitOn);
        }
        if (bgImageTransparency != null) {
          state.bgImageTransparency = clampTransparency(bgImageTransparency);
        }
        if (lsDirectoryColor != null || lsFileColor != null) {
          const colors = normalizeLsColors({
            directory: lsDirectoryColor ?? state.lsDirectoryColor,
            file: lsFileColor ?? state.lsFileColor,
          });
          state.lsDirectoryColor = colors.directory;
          state.lsFileColor = colors.file;
          sessions?.setLsColors?.(effectiveLsColors());
        }
        applyFont();
        applyTheme();
        applyScrollback();
        applyStatusBarVisibility();
        updateStatusBar();
        await persist();
      },
      // Reset: the current theme's own colours come back (its overrides are
      // dropped) and the ls colours return to their defaults. Other themes'
      // overrides, custom prompts, wallpapers and every other setting stay.
      onReset: () => {
        delete state.themeOverrides[state.themeId];
        syncCustomColors();
        state.lsDirectoryColor = DEFAULT_LS_DIRECTORY_COLOR;
        state.lsFileColor = DEFAULT_LS_FILE_COLOR;
        applyTheme();
        sessions?.setLsColors?.(effectiveLsColors());
        persist();
        return {
          themeId: state.themeId,
          custom: state.custom,
          lsDirectoryColor: state.lsDirectoryColor,
          lsFileColor: state.lsFileColor,
        };
      },
    });
    if (host?.onEvent) {
      settingsHost = { ...host, open: true };
      host.onEvent((ev) => {
        if (ev.type === 'closed') settingsHost = null;
        if (ev.type === 'error') reportError({ message: ev.message, details: ev.details }, { context: 'settings' });
      });
    } else {
      settingsHost = null; // in-page modal: no lifecycle events
    }
  }

  on('btn-settings', () => openSettings());
  api.onOpenSettings?.(() => openSettings());

  on('btn-about', async () => {
    if (focusOpenPopup('about')) return;
    const info = await api.getAppInfo();
    const host = await openAboutModal({
      i18n,
      info,
      iconSrc: document.querySelector('link[rel="icon"]')?.href || './assets/icons/icon.png',
      themes: state.themes,
      themeId: state.themeId,
      custom: state.custom,
    });
    if (host?.focus) popupHosts.about = host;
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.tb-menu-wrap') || e.target.closest('.tb-menu')) return;
    closeMenus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.tb-menu.tb-menu-open, .tb-menu:not([hidden])');
    if (!open || open.hidden) return;
    e.preventDefault();
    closeMenus();
  });

  if (api.isElectron) {
    on('btn-min', () => api.minimize());
    on('btn-max', async () => {
      const maximized = await api.maximize();
      updateMaxButton(maximized);
    });
    on('btn-close', () => api.close());
    api.onMaximized?.(updateMaxButton);
    api.isMaximized?.().then(updateMaxButton);
    api.onSshDisconnected?.((payload) => {
      const pane = sessions?.panes.get(String(payload?.sessionId || ''));
      if (pane) {
        pane.markLocal();
        sessions.renderTabs();
      }
      updateRemoteButton();
    });
  } else {
    document.body.classList.add('web');
  }
  updateRemoteButton();
}

function updateMaxButton(maximized) {
  const btn = document.getElementById('btn-max');
  const key = maximized ? 'toolbar.restore' : 'toolbar.maximize';
  const text = i18n.t(key);
  btn.removeAttribute('title');
  btn.setAttribute('aria-label', text);
  btn.dataset.tooltip = text;
}

async function boot() {
  initTooltips();
  state.themes = await loadThemes();

  try {
    const info = await api.getAppInfo?.();
    updateBrandTitle(info?.version || '1.0.0');
  } catch (_) {
    updateBrandTitle('1.0.0');
  }

  configureErrorDialog({
    i18n,
    getTheme: () => ({ themes: state.themes, themeId: state.themeId, custom: state.custom }),
  });
  installGlobalErrorHandlers('renderer');
  api.onAppError?.((info) => reportError({ message: info?.message, details: info?.details }, { context: info?.context || 'main' }));

  const saved = (await api.getSettings()) || {};
  state.themes = state.themes || (await loadThemes());
  // A legacy "custom" theme (edited Dark) becomes Dark with overrides.
  state.themeOverrides = normalizeThemeOverrides(saved.themeOverrides, state.themes);
  if (saved.themeId === 'custom' && saved.custom && !state.themeOverrides.dark) {
    const dark = themeOverridesFrom(saved.custom, state.themes.dark);
    if (Object.keys(dark).length) state.themeOverrides.dark = dark;
  }
  state.themeId = state.themes[saved.themeId] ? saved.themeId : 'dark';
  syncCustomColors();
  state.lang = saved.lang || (navigator.language?.startsWith('ko') ? 'ko' : 'en');
  state.fontSize = saved.fontSize || DEFAULT_FONT_SIZE;
  state.fontId = saved.fontId || DEFAULT_FONT_ID;
  state.scrollback = clampScrollback(saved.scrollback ?? DEFAULT_SCROLLBACK);
  state.startDirectory =
    typeof saved.startDirectory === 'string' ? saved.startDirectory.trim() : '';
  // Keep main-process start-directory prefs in sync before the first shell starts.
  await api.setSettings({
    startDirectory: state.startDirectory || '',
    backgroundImageDir:
      typeof saved.backgroundImageDir === 'string' ? saved.backgroundImageDir : '',
  });
  state.showStatusBar = saved.showStatusBar !== false;
  state.showTrayIcon = !!saved.showTrayIcon;
  await restoreBackgroundFromSettings(saved);
  state.customPrompts = normalizeCustomPrompts(saved.customPrompts);
  {
    const resolved = resolvePromptFromSettings(saved, customPromptsAsPresets(state.customPrompts));
    state.promptConfig = resolved.config;
    state.promptPresetId = resolved.presetId;
  }
  state.promptGitMode = normalizePromptGitMode(
    saved.promptGitMode || DEFAULT_PROMPT_GIT_MODE
  );
  state.shellId = typeof saved.shellId === 'string' ? saved.shellId : '';
  state.shellCustomPath =
    typeof saved.shellCustomPath === 'string' ? saved.shellCustomPath : '';
  if (api.listShells) {
    try {
      const listed = await api.listShells();
      state.shells = Array.isArray(listed?.shells) ? listed.shells : [];
      state.shellDefaultId = listed?.defaultId || '';
    } catch (_) {
      state.shells = [];
    }
  }
  if (state.promptGitMode !== 'off') {
    state.promptGitModeOn = state.promptGitMode;
  } else if (
    typeof saved.promptGitModeOn === 'string' &&
    saved.promptGitModeOn !== 'off'
  ) {
    state.promptGitModeOn = normalizePromptGitMode(saved.promptGitModeOn);
  }
  {
    const colors = normalizeLsColors({
      directory: saved.lsDirectoryColor,
      file: saved.lsFileColor,
    });
    state.lsDirectoryColor = colors.directory;
    state.lsFileColor = colors.file;
  }
  state.ssh = saved.ssh || null;
  state.sshProfiles = normalizeSshProfiles(saved.sshProfiles);
  state.terminalProfiles = normalizeTerminalProfiles(saved.terminalProfiles);
  {
    const size = clampTermSize(saved.termCols, saved.termRows);
    state.termCols = size.cols;
    state.termRows = size.rows;
  }
  // Main knows whether a window size had been saved before this launch (it
  // saves bounds as soon as the window moves, so settings alone can't tell).
  let firstLaunch = !saved.windowBounds;
  try {
    const info = await api.getAppInfo?.();
    if (info && typeof info.firstLaunch === 'boolean') firstLaunch = info.firstLaunch;
  } catch (_) {
    /* keep the settings-based guess */
  }

  await applyLanguage(state.lang);
  updateTransparencyUi();
  applyWindowOpacity();
  applyTheme();
  applyStatusBarVisibility();

  sessions = new SessionManager({
    tabBar: document.getElementById('tab-bar'),
    panesHost: document.getElementById('terminal-panes'),
    api,
    i18n,
    getTheme: currentTheme,
    getHasBackgroundImage: () =>
      !!state.backgroundImage && state.backgroundFit !== 'none',
    getPromptConfig: () => state.promptConfig,
    getPromptGitMode: () => state.promptGitMode,
    getStartDirectory: () => state.startDirectory || '',
    getLsColors: () => effectiveLsColors(),
    getNewSessionOptions: () => ({
      fontSize: state.fontSize,
      fontFamily: getFontById(state.fontId).family,
      scrollback: state.scrollback,
    }),
    onActiveChange: () => {
      updateRemoteButton();
      updateStatusBar();
    },
    onPaneFit: () => updateStatusBar(),
    onTabsRendered: () => updateTabScrollButtons(),
    // "+ ▾": pick the shell for the new tab (Electron; the web shell has none).
    onNewTabMenu:
      api.isElectron
        ? (anchor) => {
            if (!state.shells?.length) return;
            toggleMenu('shell-menu', populateShellMenu, anchor);
          }
        : null,
  });

  // Sync prompt prefs into settings + main runtime before the first shell starts.
  await api.setSettings({
    promptGitMode: state.promptGitMode,
    promptPresetId: state.promptPresetId,
    promptConfig: state.promptConfig,
    promptTheme: promptThemeFrom(currentTheme()),
    shellId: state.shellId || '',
    shellCustomPath: state.shellCustomPath || '',
    lsDirectoryColor: state.lsDirectoryColor,
    lsFileColor: state.lsFileColor,
  });
  if (api.setPrompt) {
    await api.setPrompt({ config: state.promptConfig, gitMode: state.promptGitMode });
  }

  const adoptId = new URLSearchParams(window.location.search).get('adopt');
  if (adoptId && api.takeAdopt) {
    const meta = await api.takeAdopt(adoptId);
    await sessions.create({
      sessionId: adoptId,
      title: meta?.title,
      fontSize: meta?.fontSize || state.fontSize,
      fontFamily: meta?.fontFamily || getFontById(state.fontId).family,
      scrollback: state.scrollback,
      adopt: {
        title: meta?.title,
        mode: meta?.mode || 'local',
        serialized: meta?.serialized || '',
        fontSize: meta?.fontSize || state.fontSize,
        fontFamily: meta?.fontFamily || '',
      },
    });
  } else {
    await sessions.create({
      fontSize: state.fontSize,
      fontFamily: getFontById(state.fontId).family,
      scrollback: state.scrollback,
    });
  }
  // Re-apply after panes exist so wallpaper transparency hits xterm + CSS together.
  updateTransparencyUi();
  applyWindowOpacity();
  applyTheme();
  applyFont();
  applyScrollback();
  updateFontUi();
  updateTextColorUi();
  updateStatusBar();
  // Persist restored visual prefs so markers stay aligned with the library.
  await persist();

  bindToolbar();
  bindTabScroll();
  // Test hooks (scripts/smoke-settings.js).
  window.__myTerminal = { applyTerminalProfile, state };
  // After labels/fonts paint: lock min width to toolbar content and start at that size.
  setTimeout(async () => {
    await syncToolbarMinWidth({ resizeToMin: true });
    // First launch (no saved window size): fit the terminal to the default cols × rows
    // once the window has settled at its start size.
    if (firstLaunch && !saved.windowMaximized) {
      await new Promise((r) => setTimeout(r, 350));
      await resizeTerminalTo(state.termCols, state.termRows);
    }
  }, 50);

  window.addEventListener('resize', () => {
    requestAnimationFrame(() => updateStatusBar());
  });
}

boot().catch((err) => {
  console.error(err);
  reportError(err, { context: 'boot' });
  document.body.innerHTML = `<pre style="padding:16px;color:#fff;background:#111;user-select:text">Failed to start MyTerminal:\n${err?.stack || err}</pre>`;
});
