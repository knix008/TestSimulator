import { I18n } from './i18n.js';
import { initTooltips } from './tooltip.js';
import {
  loadThemes,
  resolveTheme,
  applyThemeToDocument,
  defaultCustomFrom,
  getThemeList,
  clampTransparency,
} from './themes.js';
import { SessionManager } from './session-manager.js';
import {
  openAboutModal,
  openSettingsModal,
  openPromptModal,
  openSshModal,
} from './modals.js';
import { FONTS, DEFAULT_FONT_ID, getFontById } from './fonts.js';
import {
  BG_FIT_MODES,
  DEFAULT_BG_FIT,
  getBgFitById,
  normalizeBgFit,
} from './background-fit.js';

const DEFAULT_PROMPT = '{cyan}myterm{reset}:{yellow}{cwd:short}{reset}> ';
const DEFAULT_SCROLLBACK = 1000;
const DEFAULT_PROMPT_GIT_MODE = 'status';

function normalizePromptGitMode(mode) {
  const value = String(mode || '').toLowerCase();
  return value === 'off' || value === 'branch' || value === 'status'
    ? value
    : DEFAULT_PROMPT_GIT_MODE;
}

/** Keep saved Oh My glyphs readable on common terminal fonts. */
function asciiSafePromptGlyphs(text) {
  return String(text ?? '')
    .replace(/➜/g, '>')
    .replace(/➤/g, '>')
    .replace(/→/g, '>')
    .replace(/»/g, '>')
    .replace(/λ/g, '>')
    .replace(/✗/g, 'x')
    .replace(/✓/g, '*')
    .replace(/☁/g, '~')
    .replace(/╭─/g, '+--')
    .replace(/╰─/g, '+--')
    .replace(/╭/g, '+')
    .replace(/╰/g, '+');
}

function findPromptPresetId(template, presets) {
  const normalized = asciiSafePromptGlyphs(template || '');
  for (const [id, preset] of Object.entries(presets || {})) {
    if (asciiSafePromptGlyphs(preset?.template) === normalized) return id;
  }
  return '';
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
  custom: null,
  lang: 'en',
  fontSize: 14,
  fontId: DEFAULT_FONT_ID,
  scrollback: DEFAULT_SCROLLBACK,
  startDirectory: '',
  showStatusBar: true,
  showTrayIcon: false,
  bgTransparency: 0,
  backgroundImage: '',
  backgroundImageId: '',
  backgroundLibrary: [],
  backgroundImageDir: '',
  backgroundFit: DEFAULT_BG_FIT,
  promptTemplate: DEFAULT_PROMPT,
  promptGitMode: DEFAULT_PROMPT_GIT_MODE,
  promptPresetId: 'default',
  ssh: null,
  promptPresets: null,
};

const i18n = new I18n();
/** @type {SessionManager | null} */
let sessions = null;

function currentTheme() {
  return resolveTheme(state.themes, state.themeId, state.custom);
}

function activePane() {
  return sessions?.active || null;
}

async function persist() {
  const hasWallpaper = !!(state.backgroundImageId || state.backgroundImage);
  const payload = {
    themeId: state.themeId,
    custom: state.custom,
    lang: state.lang,
    fontSize: state.fontSize,
    fontId: state.fontId,
    scrollback: state.scrollback,
    startDirectory: state.startDirectory || '',
    showStatusBar: state.showStatusBar,
    showTrayIcon: state.showTrayIcon,
    bgTransparency: state.bgTransparency,
    backgroundImageDir: state.backgroundImageDir || '',
    backgroundFit: state.backgroundFit,
    promptTemplate: state.promptTemplate,
    promptGitMode: state.promptGitMode,
    promptPresetId: state.promptPresetId || '',
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
  state.backgroundFit = normalizeBgFit(saved.backgroundFit || DEFAULT_BG_FIT);
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
  btn.setAttribute('title', text);
  btn.setAttribute('aria-label', text);
  btn.dataset.tooltip = text;
  btn.classList.toggle('tb-active', connected);
  updateStatusBar();
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
  modeEl.textContent = remote ? i18n.t('settings.statusRemote') : i18n.t('settings.statusLocal');
  sessionEl.textContent = pane.title || `${i18n.t('tabs.session')} ${pane.sessionId}`;
  fontEl.textContent = `${getFontById(state.fontId).label} ${pane.fontSize}px`;
  sizeEl.textContent = `${pane.term.cols}×${pane.term.rows}`;
}

function applyTheme() {
  const theme = currentTheme();
  applyThemeToDocument(
    theme,
    state.bgTransparency,
    state.backgroundImage,
    getBgFitById(state.backgroundFit)
  );
  sessions?.applyTheme(theme);
  updateBgFitUi();
  updateTextColorUi();
}

function updateFontUi() {
  const label = document.getElementById('font-label');
  const font = getFontById(state.fontId);
  if (label) label.textContent = font.label;
  const btn = document.getElementById('btn-font');
  if (btn) {
    const tip = `${i18n.t('toolbar.fontFamily')}: ${font.label}`;
    btn.setAttribute('title', tip);
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
    btn.setAttribute('title', tip);
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
  }
}

function applyTextColor(color) {
  if (!state.custom) state.custom = defaultCustomFrom(currentTheme());
  state.custom = { ...state.custom, foreground: color };
  state.themeId = 'custom';
  applyTheme();
}

function bgFitLabel(id = state.backgroundFit) {
  return i18n.t(`toolbar.bgFitModes.${id}`, id);
}

function updateBgFitUi() {
  const label = document.getElementById('bg-fit-label');
  if (label) label.textContent = bgFitLabel();
  const btn = document.getElementById('btn-bg-fit');
  if (btn) {
    const tip = `${i18n.t('toolbar.bgFit')}: ${bgFitLabel()}`;
    btn.setAttribute('title', tip);
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
  }
}

function applyBackgroundFit(fitId, { persistSettings = true } = {}) {
  state.backgroundFit = normalizeBgFit(fitId);
  applyTheme();
  if (persistSettings) persist();
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

function applyBackgroundTransparency(value, { persistSettings = true } = {}) {
  state.bgTransparency = clampTransparency(value);
  updateTransparencyUi(state.bgTransparency);
  applyTheme();
  if (persistSettings) persist();
}

function applyFont() {
  const font = getFontById(state.fontId);
  sessions?.setFontFamily(font.family);
  updateFontUi();
}

function applyScrollback() {
  sessions?.setScrollback(state.scrollback);
}

function langLabel(lang = state.lang) {
  const id = lang === 'ko' ? 'ko' : 'en';
  return i18n.t(`language.${id}`, id.toUpperCase());
}

function updateLangUi() {
  const label = document.getElementById('lang-label');
  if (label) label.textContent = langLabel();
  const btn = document.getElementById('btn-lang');
  if (btn) {
    const tip = `${i18n.t('toolbar.language')}: ${langLabel()}`;
    btn.setAttribute('title', tip);
    btn.setAttribute('aria-label', tip);
    btn.dataset.tooltip = tip;
  }
}

async function applyLanguage(lang) {
  state.lang = lang === 'ko' ? 'ko' : 'en';
  await i18n.setLanguage(state.lang);
  // Open dialogs keep old strings; close them so reopen uses the new language.
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) modalRoot.innerHTML = '';
  // Refresh default local session titles that were baked in at create time.
  if (sessions) {
    for (const pane of sessions.panes.values()) {
      if (pane.mode !== 'ssh') {
        pane.title = `${i18n.t('tabs.session')} ${pane.sessionId}`;
      }
    }
    sessions.renderTabs();
  }
  updateRemoteButton();
  updateStatusBar();
  updateBgFitUi();
  updateLangUi();
  updateFontUi();
  updateTextColorUi();
  updateMaxButton(await (api.isMaximized?.() ?? false));
  syncToolbarMinWidth();
}

/**
 * Intrinsic toolbar content width (never use toolbar.scrollWidth — that tracks
 * the window width and caused unbounded growth via setMinSize feedback).
 */
function measureToolbarMinWidth() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return 1100;

  const brand = toolbar.querySelector('.toolbar-brand');
  const actions = document.getElementById('toolbar-actions');
  const about = document.getElementById('btn-about');
  const controls = document.getElementById('window-controls');
  const styles = getComputedStyle(toolbar);
  const pad =
    (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;

  const sections = [brand, actions, about, controls].filter((el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });

  // Sum only non-stretching sections + minimum spacer.
  const spacerMin = 16;
  const sectionCount = sections.length + 1;
  const gaps = Math.max(0, sectionCount - 1) * gap;
  let contentWidth = 0;
  for (const el of sections) {
    // scrollWidth of flex:0 0 auto children = content size, not window size.
    contentWidth += el.scrollWidth;
  }
  const measured = Math.ceil(pad + contentWidth + spacerMin + gaps + 8);
  return Math.min(1800, Math.max(900, measured));
}

/** @param {{ resizeToMin?: boolean }} [opts] */
function syncToolbarMinWidth(opts = {}) {
  if (!api.isElectron || !api.setMinSize) return;
  const width = measureToolbarMinWidth();
  api
    .setMinSize({
      width,
      height: 420,
      resizeToMin: !!opts.resizeToMin,
    })
    .catch?.(() => {});
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

function populateThemeMenu() {
  const menu = document.getElementById('theme-menu');
  const ids = [...getThemeList(state.themes), 'custom'];
  menu.innerHTML = ids
    .map((id) => {
      const label = i18n.t(`themes.${id}`, id);
      const active = id === state.themeId ? ' active' : '';
      return `<button class="menu-item${active}" type="button" data-theme="${id}">${label}</button>`;
    })
    .join('');
}

function populateLangMenu() {
  const menu = document.getElementById('lang-menu');
  menu.innerHTML = ['en', 'ko']
    .map((lang) => {
      const active = lang === state.lang ? ' active' : '';
      return `<button class="menu-item${active}" type="button" data-lang="${lang}">${i18n.t(
        `language.${lang}`
      )}</button>`;
    })
    .join('');
}

function populateFontMenu() {
  const menu = document.getElementById('font-menu');
  menu.innerHTML = FONTS.map((font) => {
    const active = font.id === state.fontId ? ' active' : '';
    return `<button class="menu-item${active}" type="button" data-font="${font.id}"><span class="font-preview" style="font-family:${font.family.replace(
      /"/g,
      "'"
    )}">${font.label}</span></button>`;
  }).join('');
}

function populateBgFitMenu() {
  const menu = document.getElementById('bg-fit-menu');
  menu.innerHTML = BG_FIT_MODES.map((mode) => {
    const active = mode.id === state.backgroundFit ? ' active' : '';
    return `<button class="menu-item${active}" type="button" data-bg-fit="${mode.id}">${bgFitLabel(
      mode.id
    )}</button>`;
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

    openSshModal({
      i18n,
      defaults: state.ssh || {},
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
  });

  on('btn-prompt', async () => {
    let presets = state.promptPresets;
    if (!presets && api.getPromptPresets) {
      const data = await api.getPromptPresets();
      presets = data?.presets || {};
      state.promptPresets = presets;
    }
    if (!presets) {
      // Offline/web fallback — main process normally supplies the full list.
      presets = {
        default: { id: 'default', group: 'basic', template: DEFAULT_PROMPT },
        classic: {
          id: 'classic',
          group: 'basic',
          template: '{green}{user}{reset}@{host}:{blue}{cwd:short}{reset}$ ',
        },
        power: {
          id: 'power',
          group: 'basic',
          template:
            '{bold}{magenta}{user}{reset}@{cyan}{host}{reset} {yellow}{cwd:short}{reset}> ',
        },
        path: { id: 'path', group: 'basic', template: '{cwd}> ' },
        minimal: { id: 'minimal', group: 'basic', template: '> ' },
        remote: {
          id: 'remote',
          group: 'basic',
          template: '{red}{user}{reset}@{yellow}{host}{reset}:{cyan}{cwd:short}{reset}# ',
        },
        ohmyzsh_robbyrussell: {
          id: 'ohmyzsh_robbyrussell',
          group: 'ohmyzsh',
          template: '{bold}{green}>{reset}  {cyan}{cwd:tail}{reset}{git:info} ',
        },
        ohmyzsh_cloud: {
          id: 'ohmyzsh_cloud',
          group: 'ohmyzsh',
          template:
            '{cyan}{user}{reset}@{green}{host}{reset} {yellow}{cwd:short}{reset}{git:info} {magenta}~{reset} ',
        },
        ohmyzsh_arrow: {
          id: 'ohmyzsh_arrow',
          group: 'ohmyzsh',
          template: '{bold}{yellow}>{reset} {cyan}{cwd:tail}{reset}{git:info} ',
        },
        ohmyzsh_agnoster: {
          id: 'ohmyzsh_agnoster',
          group: 'ohmyzsh',
          template:
            '{bg_blue}{white} {user}@{host} {bg_yellow}{black} {cwd:short} {git:segment}',
        },
      };
    }
    openPromptModal({
      i18n,
      template: state.promptTemplate,
      gitMode: state.promptGitMode,
      presetId: state.promptPresetId,
      presets,
      themes: state.themes,
      themeId: state.themeId,
      custom: state.custom,
      onApply: async (payload) => {
        const value =
          typeof payload === 'string' ? payload : payload?.template;
        const gitMode =
          typeof payload === 'object' && payload
            ? payload.gitMode
            : state.promptGitMode;
        state.promptTemplate = asciiSafePromptGlyphs(value || DEFAULT_PROMPT);
        state.promptGitMode = normalizePromptGitMode(gitMode);
        state.promptPresetId =
          findPromptPresetId(state.promptTemplate, presets) || 'custom';
        if (api.setPrompt) {
          await api.setPrompt({
            template: state.promptTemplate,
            gitMode: state.promptGitMode,
            presetId: state.promptPresetId,
          });
        }
        await persist();
        const pane = activePane();
        if (pane && pane.mode !== 'ssh') await pane.start();
      },
    });
  });

  on('btn-clear', () => activePane()?.clear());
  on('btn-copy', () => activePane()?.copy());
  on('btn-paste', () => activePane()?.paste());
  on('btn-font-dec', async () => {
    state.fontSize = sessions.changeFont(-1) || state.fontSize;
    updateStatusBar();
    await persist();
  });
  on('btn-font-inc', async () => {
    state.fontSize = sessions.changeFont(1) || state.fontSize;
    updateStatusBar();
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

  on('btn-lang', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu('lang-menu', populateLangMenu, e.currentTarget);
  });

  document.getElementById('theme-menu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    state.themeId = btn.dataset.theme;
    if (state.themeId === 'custom' && !state.custom) {
      state.custom = defaultCustomFrom(state.themes.dark);
    }
    applyTheme();
    await persist();
    closeMenus();
  });

  document.getElementById('lang-menu').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-lang]');
    if (!btn) return;
    state.lang = btn.dataset.lang;
    await applyLanguage(state.lang);
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

  function openSettings() {
    // Color pickers should reflect the active theme (or saved custom colors).
    if (state.themeId !== 'custom' || !state.custom) {
      state.custom = defaultCustomFrom(currentTheme());
    }
    openSettingsModal({
      i18n,
      custom: state.custom,
      scrollback: state.scrollback,
      startDirectory: state.startDirectory,
      showStatusBar: state.showStatusBar,
      showTrayIcon: state.showTrayIcon,
      allowTray: !!api.isElectron,
      backgroundImage: state.backgroundImage,
      backgroundImageId: state.backgroundImageId,
      backgroundLibrary: state.backgroundLibrary,
      backgroundFit: state.backgroundFit,
      bgFitModes: BG_FIT_MODES,
      themes: state.themes,
      themeId: state.themeId,
      fonts: FONTS,
      fontId: state.fontId,
      fontSize: state.fontSize,
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
        backgroundImage,
        backgroundImageId,
        backgroundLibrary,
        backgroundFit,
        themeTouched,
        fontId,
        fontSize,
      }) => {
        state.custom = custom;
        if (themeTouched) state.themeId = 'custom';
        state.scrollback = clampScrollback(scrollback);
        // Only update when provided, so other settings events cannot wipe it.
        if (typeof startDirectory === 'string') {
          state.startDirectory = startDirectory.trim();
        }
        state.showStatusBar = !!showStatusBar;
        state.showTrayIcon = !!showTrayIcon;
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
        const imageChanged = nextImage !== state.backgroundImage;
        state.backgroundImage = nextImage;
        state.backgroundFit = normalizeBgFit(backgroundFit || state.backgroundFit);
        // New wallpaper: show it fully (0% image transparency).
        if (imageChanged && nextImage) {
          state.bgTransparency = 0;
          updateTransparencyUi();
        }
        applyFont();
        applyTheme();
        applyScrollback();
        applyStatusBarVisibility();
        updateStatusBar();
        await persist();
      },
      onReset: () => {
        state.custom = defaultCustomFrom(state.themes.dark);
        return state.custom;
      },
    });
  }

  on('btn-settings', () => openSettings());
  api.onOpenSettings?.(() => openSettings());

  on('btn-about', async () => {
    const info = await api.getAppInfo();
    openAboutModal({
      i18n,
      info,
      iconSrc: document.querySelector('link[rel="icon"]')?.href || './assets/icons/icon.png',
      themes: state.themes,
      themeId: state.themeId,
      custom: state.custom,
    });
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
  btn.setAttribute('title', text);
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

  const saved = (await api.getSettings()) || {};
  state.themeId = saved.themeId || 'dark';
  state.custom = saved.custom || null;
  state.lang = saved.lang || (navigator.language?.startsWith('ko') ? 'ko' : 'en');
  state.fontSize = saved.fontSize || 14;
  state.fontId = saved.fontId || DEFAULT_FONT_ID;
  state.scrollback = clampScrollback(saved.scrollback ?? DEFAULT_SCROLLBACK);
  state.startDirectory =
    typeof saved.startDirectory === 'string' ? saved.startDirectory.trim() : '';
  // Re-write directory prefs so main process runtime options stay in sync.
  if (state.startDirectory || saved.backgroundImageDir) {
    await api.setSettings({
      startDirectory: state.startDirectory,
      backgroundImageDir:
        typeof saved.backgroundImageDir === 'string' ? saved.backgroundImageDir : '',
    });
  }
  state.showStatusBar = saved.showStatusBar !== false;
  state.showTrayIcon = !!saved.showTrayIcon;
  await restoreBackgroundFromSettings(saved);
  state.promptTemplate = asciiSafePromptGlyphs(
    saved.promptTemplate || DEFAULT_PROMPT
  );
  state.promptGitMode = normalizePromptGitMode(
    saved.promptGitMode || DEFAULT_PROMPT_GIT_MODE
  );
  state.promptPresetId =
    typeof saved.promptPresetId === 'string' ? saved.promptPresetId : '';
  state.ssh = saved.ssh || null;

  if (api.getPromptPresets) {
    try {
      const data = await api.getPromptPresets();
      state.promptPresets = data?.presets || null;
    } catch (_) {
      /* ignore */
    }
  }
  if (!state.promptPresetId) {
    state.promptPresetId =
      findPromptPresetId(state.promptTemplate, state.promptPresets) || 'custom';
  }
  // Refresh any built-in preset from main so OMZ theme fixes replace stale settings.
  const builtinTemplate = state.promptPresets?.[state.promptPresetId]?.template;
  if (builtinTemplate) {
    state.promptTemplate = builtinTemplate;
  }

  await applyLanguage(state.lang);
  updateTransparencyUi();
  applyTheme();
  applyStatusBarVisibility();

  sessions = new SessionManager({
    tabBar: document.getElementById('tab-bar'),
    panesHost: document.getElementById('terminal-panes'),
    api,
    i18n,
    getTheme: currentTheme,
    getHasBackgroundImage: () => !!state.backgroundImage,
    getPromptTemplate: () => state.promptTemplate,
    getPromptGitMode: () => state.promptGitMode,
    getStartDirectory: () => state.startDirectory || '',
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
  });

  // Sync prompt prefs into settings + main runtime before the first shell starts.
  await api.setSettings({
    promptTemplate: state.promptTemplate,
    promptGitMode: state.promptGitMode,
    promptPresetId: state.promptPresetId,
  });
  if (api.setPrompt) {
    await api.setPrompt({
      template: state.promptTemplate,
      gitMode: state.promptGitMode,
      presetId: state.promptPresetId,
    });
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
  applyTheme();
  applyFont();
  applyScrollback();
  updateFontUi();
  updateTextColorUi();
  updateStatusBar();
  // Persist restored visual prefs so markers stay aligned with the library.
  await persist();

  bindToolbar();
  // After labels paint: lock min width to toolbar content and start at that size.
  requestAnimationFrame(() => {
    syncToolbarMinWidth({ resizeToMin: true });
  });

  window.addEventListener('resize', () => {
    requestAnimationFrame(() => updateStatusBar());
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:16px;color:#fff;background:#111">Failed to start MyTerminal:\n${err}</pre>`;
});
