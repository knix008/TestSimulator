/**
 * Settings dialog body — shared by the detached popup (Electron) and the
 * in-page modal (web).
 *
 * Six tabs: General (terminal, command shell) · Text (font, colours) ·
 * Colours (theme) · Background (wallpaper library) · Prompt (presets) ·
 * Prompt edit (builder + template). All panes share one grid cell
 * (`.settings-panes`), so the body is always as tall as the tallest pane:
 * the window is sized once to that height and never scrolls. Lists that
 * could grow (wallpapers) are paged instead.
 *
 * Every control change calls `emit(values, { themeTouched })` with the full
 * value set from readValues(); the owner applies and persists them.
 */
import { FONTS, DEFAULT_FONT_ID, getFontById } from './fonts.js';
import { createPromptEditor } from './prompt-editor.js';
import { enhanceNumberInputs } from './num-field.js';
import { promptThemeFrom } from '../../shared/prompt-core.js';
import { resolveTheme } from './themes.js';

export const SETTINGS_TABS = ['general', 'terminal', 'text', 'theme', 'colors', 'background', 'ssh', 'prompt', 'promptEdit'];
const TERM_PROFILE_KEYS = ['name', 'cols', 'rows', 'fontId', 'fontSize', 'scrollback', 'shellId'];

/** Sanitise saved terminal profiles: `[{ id, name, cols, rows, fontId, fontSize, scrollback, shellId }]`. */
export function normalizeTerminalProfiles(list) {
  if (!Array.isArray(list)) return [];
  const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.parseInt(v, 10) || d));
  return list
    .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.id)
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      cols: clamp(item.cols, 20, 500, 80),
      rows: clamp(item.rows, 5, 200, 24),
      fontId: String(item.fontId || ''),
      fontSize: clamp(item.fontSize, 10, 28, 14),
      scrollback: clamp(item.scrollback, 100, 100000, 10000),
      shellId: String(item.shellId || ''),
    }));
}

export function newTerminalProfileId(now = Date.now()) {
  return `term-${now.toString(36)}`;
}
const SSH_PROFILE_KEYS = ['name', 'host', 'port', 'username', 'privateKey'];

/** Sanitise saved SSH profiles: `[{ id, name, host, port, username, privateKey }]` (never a password). */
export function normalizeSshProfiles(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.id)
    .map((item) => ({
      id: item.id,
      name: String(item.name || '').trim(),
      host: String(item.host || '').trim(),
      port: Math.max(1, Math.min(65535, Number.parseInt(item.port, 10) || 22)),
      username: String(item.username || '').trim(),
      privateKey: String(item.privateKey || '').trim(),
    }));
}

export function newSshProfileId(now = Date.now()) {
  return `ssh-${now.toString(36)}`;
}

/** Display label of a profile: its name, else user@host. */
export function sshProfileLabel(profile) {
  if (!profile) return '';
  if (profile.name) return profile.name;
  return profile.username ? `${profile.username}@${profile.host || '?'}` : profile.host || '';
}
const BG_PAGE_SIZE = 10;

const TAB_ICONS = {
  general: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  text: '<path d="M4 18l4-11 4 11M5.5 14h5M14 12h6M17 9v9"/>',
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z"/>',
  ssh: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M6.5 8l3 2.5-3 2.5M12.5 13h4"/>',
  colors: '<path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4 8 8 0 0 0-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  background: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  prompt: '<path d="M4 5h16v14H4zM7 9l3 2.5L7 14M12.5 14h4.5"/>',
  promptEdit: '<path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/><path d="M4 5h5"/>',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clampFontSize(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 14;
  return Math.max(10, Math.min(28, n));
}

function fontOptionsHtml(fonts, fontId) {
  const list = fonts?.length ? fonts : FONTS;
  const current = fontId || DEFAULT_FONT_ID;
  return list
    .map((font) => {
      const selected = font.id === current ? ' selected' : '';
      return `<option value="${escapeHtml(font.id)}"${selected}>${escapeHtml(font.label)}</option>`;
    })
    .join('');
}

export function normalizeStartDirectoryInput(value) {
  let s = String(value || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function escapeCssUrl(dataUrl) {
  return String(dataUrl || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/** Page `page` (0-based) of the library as fixed BG_PAGE_SIZE cells. */
export function pageOfLibrary(items, page, pageSize = BG_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.max(0, Math.min(page, pages - 1));
  return { items: list.slice(current * pageSize, current * pageSize + pageSize), page: current, pages };
}

function backgroundLibraryCardsHtml(i18n, items, activeId, pageSize = BG_PAGE_SIZE) {
  const cells = items.map((item) => {
    const id = escapeHtml(item.id);
    const name = escapeHtml(item.name || 'Image');
    const active = item.id === activeId ? ' active' : '';
    const url = escapeCssUrl(item.dataUrl || '');
    return `
      <div class="settings-bg-card${active}" data-bg-id="${id}">
        <button
          type="button"
          class="settings-bg-thumb"
          data-bg-select="${id}"
          style="background-image:url(&quot;${url}&quot;)"
          title="${name}"
        ></button>
        <span class="settings-bg-name" title="${name}">${name}</span>
        <button
          type="button"
          class="settings-bg-delete"
          data-bg-remove="${id}"
          title="${escapeHtml(i18n.t('settings.backgroundImageDelete'))}"
          aria-label="${escapeHtml(i18n.t('settings.backgroundImageDelete'))}"
        >×</button>
      </div>`;
  });
  // Placeholder cells keep the grid at two full rows (fixed height).
  for (let i = cells.length; i < pageSize; i += 1) {
    cells.push(
      `<div class="settings-bg-card settings-bg-placeholder"><span class="settings-bg-thumb"></span><span class="settings-bg-name">&nbsp;</span></div>`
    );
  }
  return cells.join('');
}

function applyBgFitToLibrary(root, bgFitModes, fitId) {
  const mode =
    bgFitModes.find((item) => item.id === fitId) ||
    bgFitModes[0] || {
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
    };
  root.querySelectorAll('.settings-bg-thumb').forEach((el) => {
    el.style.setProperty('--preview-bg-size', mode.size);
    el.style.setProperty('--preview-bg-position', mode.position);
    el.style.setProperty('--preview-bg-repeat', mode.repeat);
  });
}

function shellOptionsHtml(i18n, shells, shellId, defaultId) {
  const list = Array.isArray(shells) ? shells : [];
  const current = shellId || defaultId || '';
  const opts = list.map((shell) => {
    const isDefault = shell.id === defaultId;
    const label = isDefault
      ? `${shell.label} — ${i18n.t('settings.shellDefault', 'default')}`
      : shell.label;
    return `<option value="${escapeHtml(shell.id)}" title="${escapeHtml(shell.path)}"${
      shell.id === current ? ' selected' : ''
    }>${escapeHtml(label)}</option>`;
  });
  opts.push(
    `<option value="custom"${current === 'custom' ? ' selected' : ''}>${escapeHtml(
      i18n.t('settings.shellCustom', 'Custom program…')
    )}</option>`
  );
  return opts.join('');
}

/**
 * @param {HTMLElement} host  element that receives the tabs + panes
 * @param {object} options
 */
export function createSettingsUi(
  host,
  {
    i18n,
    api = null,
    payload = {},
    emit,
    fit,
    initialTab = 'general',
    bg = {},
    onBgDir,
    allowFileInput = false,
    onError = null,
    onApplyProfile = null,
  }
) {
  const colorFields = [
    ['background', 'settings.background'],
    ['cursor', 'settings.cursor'],
    ['selection', 'settings.selection'],
    ['accent', 'settings.accent'],
    ['toolbarBg', 'settings.toolbarBg'],
  ];
  const custom = { ...(payload.custom || {}) };
  const allowTray = !!payload.allowTray;
  const bgFitModes = payload.bgFitModes || [];
  const fonts = payload.fonts?.length ? payload.fonts : FONTS;
  const fontId = payload.fontId || DEFAULT_FONT_ID;
  const fontSize = clampFontSize(payload.fontSize);
  const clampPct = (v) => Math.max(0, Math.min(100, Number.parseInt(v, 10) || 0));
  const shells = Array.isArray(payload.shells) ? payload.shells : [];
  const showShell = shells.length > 0;

  let currentBgImage = payload.backgroundImage || '';
  let currentBgFit = payload.backgroundFit || 'cover';
  let bgItems = Array.isArray(payload.backgroundLibrary)
    ? payload.backgroundLibrary.map((item) => ({ ...item }))
    : [];
  let activeBgId = payload.backgroundImageId || '';
  if (!bgItems.length && currentBgImage && allowFileInput) {
    activeBgId = activeBgId || 'bg_web_1';
    bgItems = [{ id: activeBgId, name: 'Wallpaper', dataUrl: currentBgImage }];
  }
  let bgImageTransparency = clampPct(payload.bgImageTransparency);
  let bgPage = 0;

  const fitOptions = (bgFitModes.length ? bgFitModes : [{ id: 'cover' }])
    .map((mode) => {
      const label = i18n.t(`settings.bgFitModes.${mode.id}`, mode.id);
      const selected = mode.id === currentBgFit ? ' selected' : '';
      return `<option value="${mode.id}"${selected}>${label}</option>`;
    })
    .join('');

  const t = (key, fallback) => i18n.t(key, fallback);

  /* ---------------------------------------------------------------- */
  /* Markup                                                           */
  /* ---------------------------------------------------------------- */

  const tabsHtml = SETTINGS_TABS.map(
    (id) => `
      <button type="button" class="settings-tab" role="tab" data-tab="${id}" aria-selected="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[id]}</svg>
        <span>${escapeHtml(t(`settings.tabs.${id}`, id))}</span>
      </button>`
  ).join('');

  const generalHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.terminalSection')}</h3>
      <div class="settings-grid">
        <label for="setting-scrollback">${t('settings.scrollback')}</label>
        <input id="setting-scrollback" class="settings-number" type="number" min="100" max="100000" step="100"
          value="${payload.scrollback ?? 10000}" />
      </div>
      <p class="settings-hint">${t('settings.scrollbackHint')}</p>
      <div class="settings-grid" style="margin-top:12px">
        <label for="setting-term-cols">${t('settings.defaultTermSize', 'Default terminal size')}</label>
        <div class="pe-row">
          <input id="setting-term-cols" class="settings-number pe-num" type="number" min="20" max="500"
            value="${Number(payload.defaultTermCols) || 120}" />
          <span class="muted small">${t('settings.profileCols', 'columns')}</span>
          <span class="muted">×</span>
          <input id="setting-term-rows" class="settings-number pe-num" type="number" min="5" max="200"
            value="${Number(payload.defaultTermRows) || 25}" />
          <span class="muted small">${t('settings.profileRows', 'rows')}</span>
        </div>
      </div>
      <p class="settings-hint">${t('settings.defaultTermSizeHint', '')}</p>
      <div class="settings-grid settings-grid-path">
        <label for="setting-start-dir">${t('settings.startDirectory')}</label>
        <div class="settings-path-row">
          <input id="setting-start-dir" class="settings-text" type="text"
            value="${escapeHtml(payload.startDirectory || '')}"
            placeholder="${escapeHtml(t('settings.startDirectoryPlaceholder'))}" spellcheck="false" />
          ${
            api?.pickDirectory
              ? `<button type="button" class="modal-btn" id="setting-start-dir-pick">${t(
                  'settings.startDirectoryPick'
                )}</button>`
              : ''
          }
        </div>
      </div>
      <p class="settings-hint">${t('settings.startDirectoryHint')}</p>
      ${
        showShell
          ? `
      <div class="settings-grid settings-grid-path">
        <label for="setting-shell">${t('settings.shell', 'Command shell')}</label>
        <select id="setting-shell" class="settings-select settings-select-wide">${shellOptionsHtml(
          i18n,
          shells,
          payload.shellId,
          payload.shellDefaultId
        )}</select>
        <label for="setting-shell-path">${t('settings.shellCustomPath', 'Program path')}</label>
        <input id="setting-shell-path" class="settings-text mono" type="text"
          value="${escapeHtml(payload.shellCustomPath || '')}"
          placeholder="${escapeHtml(t('settings.shellCustomPathPlaceholder', ''))}" spellcheck="false" />
      </div>
      <p class="settings-hint">${t('settings.shellHint', '')}</p>`
          : ''
      }
    </div>
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.windowSection', 'Window')}</h3>
      <label class="settings-check" for="setting-statusbar">
        <input id="setting-statusbar" type="checkbox" ${payload.showStatusBar ? 'checked' : ''} />
        <span>${t('settings.statusBar')}</span>
      </label>
      <p class="settings-hint">${t('settings.statusBarHint')}</p>
      ${
        allowTray
          ? `
      <label class="settings-check" for="setting-tray" style="margin-top:12px">
        <input id="setting-tray" type="checkbox" ${payload.showTrayIcon ? 'checked' : ''} />
        <span>${t('settings.trayIcon')}</span>
      </label>
      <p class="settings-hint">${t('settings.trayIconHint')}</p>`
          : ''
      }
    </div>`;

  const fg = custom.foreground || '#d4d4d4';
  const textHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.textSection')}</h3>
      <p class="settings-hint">${t('settings.textSectionHint')}</p>
      <div class="settings-grid" style="margin-top:10px">
        <label for="setting-font">${t('settings.fontFamily')}</label>
        <select id="setting-font" class="settings-select">${fontOptionsHtml(fonts, fontId)}</select>
        <label for="setting-font-size">${t('settings.fontSize')}</label>
        <input id="setting-font-size" class="settings-number" type="number" min="10" max="28" step="1" value="${fontSize}" />
        <label for="color-foreground">${t('settings.foreground')}</label>
        <input id="color-foreground" type="color" value="${escapeHtml(fg)}" data-key="foreground" />
      </div>
    </div>
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.lsColorsSection')}</h3>
      <p class="settings-hint">${t('settings.lsColorsHint')}</p>
      <div class="settings-grid" style="margin-top:10px">
        <label for="color-ls-directory">${t('settings.lsDirectoryColor')}</label>
        <input id="color-ls-directory" type="color" value="${escapeHtml(
          payload.lsDirectoryColor || '#569CD6'
        )}" data-ls-color="directory" />
        <label for="color-ls-file">${t('settings.lsFileColor')}</label>
        <input id="color-ls-file" type="color" value="${escapeHtml(
          payload.lsFileColor || '#D4D4D4'
        )}" data-ls-color="file" />
      </div>
    </div>`;

  const colorsHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.themeSection')}</h3>
      <p class="settings-hint">${t('settings.backgroundHint')}</p>
      <div class="settings-grid" style="margin-top:10px">
        ${colorFields
          .map(
            ([key, labelKey]) => `
          <label for="color-${key}">${t(labelKey)}</label>
          <input id="color-${key}" type="color" value="${custom[key] || '#000000'}" data-key="${key}" />`
          )
          .join('')}
      </div>
      <p class="settings-hint">${t('settings.themeColorsHint', '')}</p>
    </div>`;

  const backgroundHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.backgroundImage')}</h3>
      <p class="settings-hint">${t('settings.backgroundImageHint')}</p>
      <div class="settings-bg-image">
        <div id="setting-bg-library" class="settings-bg-library"></div>
        <div class="settings-bg-actions">
          <button type="button" class="modal-btn" id="setting-bg-pick">${t('settings.backgroundImagePick')}</button>
          <button type="button" class="modal-btn" id="setting-bg-clear">${t('settings.backgroundImageClear')}</button>
          <span class="settings-bg-pager">
            <button type="button" class="modal-btn pp-icon-btn" id="setting-bg-prev" aria-label="prev">◀</button>
            <span id="setting-bg-page" class="settings-bg-page">1/1</span>
            <button type="button" class="modal-btn pp-icon-btn" id="setting-bg-next" aria-label="next">▶</button>
          </span>
        </div>
      </div>
      ${
        allowFileInput
          ? `<input id="setting-bg-file" type="file" hidden
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/tiff,image/bmp,image/svg+xml,.jpg,.jpeg,.jfif,.png,.gif,.webp,.avif,.tif,.tiff,.bmp,.svg,.ico" />`
          : ''
      }
      <div class="settings-grid" style="margin-top:12px">
        <label for="setting-bg-fit">${t('settings.backgroundFit')}</label>
        <select id="setting-bg-fit" class="settings-select">${fitOptions}</select>
      </div>
      <p class="settings-hint">${t('settings.backgroundFitHint')}</p>
      <div class="settings-grid" style="margin-top:12px">
        <label for="setting-bg-image-transparency">${t('settings.bgImageTransparency', 'Background transparency')}</label>
        <div class="settings-range-row">
          <span class="settings-range-bound">0</span>
          <input id="setting-bg-image-transparency" class="settings-range" type="range" min="0" max="100" step="1"
            value="${bgImageTransparency}" aria-describedby="setting-bg-image-transparency-value" />
          <span class="settings-range-bound">100</span>
          <span class="settings-range-value" id="setting-bg-image-transparency-value">${bgImageTransparency}%</span>
        </div>
      </div>
      <p class="settings-hint">${t('settings.bgImageTransparencyHint', '')}</p>
      <p class="settings-hint settings-error" id="setting-bg-error">&nbsp;</p>
    </div>`;

  // ---- theme tab: one card per theme in its own colours; click = apply ----
  const themesMap = payload.themes && typeof payload.themes === 'object' ? payload.themes : {};
  let themeOverrides = payload.themeOverrides && typeof payload.themeOverrides === 'object' ? { ...payload.themeOverrides } : {};
  let themeId = themesMap[payload.themeId] ? payload.themeId : Object.keys(themesMap)[0] || 'dark';
  const themeCardHtml = (id) => {
        const tt = resolveTheme(themesMap, id, themeOverrides[id]);
        const edited = themeOverrides[id] && Object.keys(themeOverrides[id]).length ? ' edited' : '';
        return `
        <button type="button" class="theme-card${id === themeId ? ' active' : ''}${edited}" data-theme-card="${id}"
          style="background:${tt.toolbarBg};color:${tt.toolbarFg};border-color:${tt.border}" title="${escapeHtml(t(`themes.${id}`, id))}">
          <span class="theme-sample" style="background:${tt.background}">
            <span class="theme-bar" style="background:${tt.accent}"><span style="background:${tt.background}"></span></span>
            <span class="theme-line" style="background:${tt.foreground}"></span>
            <span class="theme-line short" style="background:${tt.terminal?.green || tt.foreground}"></span>
            <span class="theme-line" style="background:${tt.terminal?.blue || tt.accent};width:70%"></span>
          </span>
          <span class="theme-name">${edited ? '<span class="theme-badge">✎</span>' : ''}${escapeHtml(t(`themes.${id}`, id))}</span>
        </button>`;
  };
  // Dark and light themes each get their own 8 × 2 grid.
  const themeIdsOf = (kind) => Object.keys(themesMap).filter((id) => (themesMap[id].kind || 'dark') === kind);
  const themeCardsHtml = () =>
    ['dark', 'light']
      .map(
        (kind) => `
        <fieldset class="theme-group theme-group-${kind}">
          <legend class="theme-group-title">${escapeHtml(t(kind === 'dark' ? 'settings.themeGroupDark' : 'settings.themeGroupLight', kind))}
            <span class="settings-sub">${themeIdsOf(kind).length}</span></legend>
          <div class="theme-grid">${themeIdsOf(kind).map(themeCardHtml).join('')}</div>
        </fieldset>`
      )
      .join('');
  const themeHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.themePickTitle', 'Theme')} <span class="settings-sub" data-theme-current></span></h3>
      <div data-theme-grid>${themeCardsHtml()}</div>
      <p class="settings-hint">${t('settings.themePickHint', '')}</p>
    </div>`;

  // ---- terminal tab: size / font profiles (master–detail, fixed height) ----
  let termProfiles = normalizeTerminalProfiles(payload.terminalProfiles);
  let termSel = termProfiles[0]?.id || '';
  const termCurrentSize = { cols: Number(payload.termCols) || 80, rows: Number(payload.termRows) || 24 };
  const shellOptionsForProfile = (selected) =>
    `<option value="">${escapeHtml(t('settings.profileShellDefault', '(default shell)'))}</option>` +
    shells.map((sh) => `<option value="${escapeHtml(sh.id)}"${sh.id === selected ? ' selected' : ''}>${escapeHtml(sh.label)}</option>`).join('');
  const terminalHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.profilesTitle', 'Terminal profiles')} <span class="settings-sub">${escapeHtml(
        t('settings.profilesSub', '')
      )}</span></h3>
      <div class="ssh-profiles">
        <div class="ssh-list">
          <div class="ssh-list-rows" data-term-rows></div>
          <div class="ssh-list-tools">
            <button type="button" class="modal-btn pe-btn" data-term-add>＋ ${t('settings.profileAdd', 'Add')}</button>
            <button type="button" class="modal-btn pe-btn" data-term-save-current title="${escapeHtml(
              t('settings.profileSaveCurrentTip', '')
            )}">${t('settings.profileSaveCurrent', 'From current')}</button>
            <button type="button" class="modal-btn pe-btn" data-term-remove>✕ ${t('settings.profileRemove', 'Delete')}</button>
          </div>
        </div>
        <div class="ssh-detail">
          <div class="form-grid ssh-fields">
            <label for="term-p-name">${t('settings.profileName', 'Name')}</label>
            <input id="term-p-name" class="settings-text" data-term-f="name" maxlength="40" spellcheck="false" placeholder="${escapeHtml(
              t('settings.profileNamePlaceholder', '')
            )}" />
            <label>${t('settings.profileSize', 'Terminal size')}</label>
            <div class="pe-row">
              <input class="settings-number pe-num" data-term-f="cols" type="number" min="20" max="500" value="80" />
              <span class="muted small">${t('settings.profileCols', 'columns')}</span>
              <span class="muted">×</span>
              <input class="settings-number pe-num" data-term-f="rows" type="number" min="5" max="200" value="24" />
              <span class="muted small">${t('settings.profileRows', 'rows')}</span>
              <span class="muted small" data-term-current-size></span>
            </div>
            <label for="term-p-font">${t('settings.fontFamily', 'Font')}</label>
            <select id="term-p-font" class="settings-select" data-term-f="fontId">${fontOptionsHtml(fonts, fontId)}</select>
            <label for="term-p-font-size">${t('settings.fontSize', 'Font size')}</label>
            <input id="term-p-font-size" class="settings-number pe-num" data-term-f="fontSize" type="number" min="10" max="28" value="13" />
            <label for="term-p-scrollback">${t('settings.scrollback', 'Scrollback')}</label>
            <input id="term-p-scrollback" class="settings-number" data-term-f="scrollback" type="number" min="100" max="100000" step="100" value="10000" />
            ${
              showShell
                ? `<label for="term-p-shell">${t('settings.shell', 'Command shell')}</label>
            <select id="term-p-shell" class="settings-select" data-term-f="shellId">${shellOptionsForProfile('')}</select>`
                : ''
            }
          </div>
          <div class="pe-row ssh-apply-row">
            <button type="button" class="modal-btn primary pe-btn" data-term-apply>▶ ${t('settings.profileApply', 'Apply to this window')}</button>
            <span class="settings-hint" style="margin:0">${escapeHtml(t('settings.profileApplyHint', ''))}</span>
          </div>
        </div>
      </div>
    </div>`;

  // ---- ssh tab: profiles (master–detail, fixed height) ----
  let sshProfiles = normalizeSshProfiles(payload.sshProfiles);
  let sshSel = sshProfiles[0]?.id || '';
  const sshHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${t('settings.sshTitle', 'SSH hosts')} <span class="settings-sub">${escapeHtml(
        t('settings.sshSub', '')
      )}</span></h3>
      <div class="ssh-profiles">
        <div class="ssh-list">
          <div class="ssh-list-rows" data-ssh-rows></div>
          <div class="ssh-list-tools">
            <button type="button" class="modal-btn pe-btn" data-ssh-add>＋ ${t('settings.sshAdd', 'Add')}</button>
            <button type="button" class="modal-btn pe-btn" data-ssh-remove>✕ ${t('settings.sshRemove', 'Delete')}</button>
          </div>
        </div>
        <div class="ssh-detail">
          <div class="form-grid ssh-fields">
            <label for="ssh-p-name">${t('settings.sshName', 'Name')}</label>
            <input id="ssh-p-name" class="settings-text" data-ssh-f="name" maxlength="40" spellcheck="false" placeholder="${escapeHtml(
              t('settings.sshNamePlaceholder', '')
            )}" />
            <label for="ssh-p-host">${t('ssh.host', 'Host')}</label>
            <input id="ssh-p-host" class="settings-text mono" data-ssh-f="host" spellcheck="false" placeholder="192.168.0.10" />
            <label for="ssh-p-port">${t('ssh.port', 'Port')}</label>
            <input id="ssh-p-port" class="settings-number" data-ssh-f="port" type="number" min="1" max="65535" value="22" />
            <label for="ssh-p-user">${t('ssh.username', 'User')}</label>
            <input id="ssh-p-user" class="settings-text mono" data-ssh-f="username" spellcheck="false" />
            <label for="ssh-p-key">${t('ssh.privateKey', 'Private key')}</label>
            <input id="ssh-p-key" class="settings-text mono" data-ssh-f="privateKey" spellcheck="false" placeholder="C:\\Users\\me\\.ssh\\id_rsa" />
          </div>
          <p class="settings-hint">${t('settings.sshHint', '')}</p>
        </div>
      </div>
    </div>`;

  host.innerHTML = `
    <div class="settings-tabs" role="tablist">${tabsHtml}</div>
    <div class="settings-panes">
      <section class="settings-pane" data-pane="general">${generalHtml}</section>
      <section class="settings-pane" data-pane="terminal">${terminalHtml}</section>
      <section class="settings-pane" data-pane="text">${textHtml}</section>
      <section class="settings-pane" data-pane="theme">${themeHtml}</section>
      <section class="settings-pane" data-pane="colors">${colorsHtml}</section>
      <section class="settings-pane" data-pane="background">${backgroundHtml}</section>
      <section class="settings-pane" data-pane="ssh">${sshHtml}</section>
      <section class="settings-pane" data-pane="prompt"></section>
      <section class="settings-pane" data-pane="promptEdit"></section>
    </div>`;

  const q = (selector) => host.querySelector(selector);
  // Every number field gets − / + buttons (scrollback steps by 100, the rest by 1).
  enhanceNumberInputs(host);

  /* ---------------------------------------------------------------- */
  /* Prompt editor (two panes)                                        */
  /* ---------------------------------------------------------------- */

  const promptEditor = createPromptEditor({
    i18n,
    theme: promptThemeFrom(payload.previewTheme),
    font: payload.previewFont || null,
    platform: payload.platform || 'win32',
    config: payload.promptConfig,
    gitMode: payload.promptGitMode,
    customPrompts: payload.customPrompts,
    onChange: () => emitChange({ themeTouched: false }),
  });
  q('[data-pane="prompt"]').appendChild(promptEditor.presetsPane);
  q('[data-pane="promptEdit"]').appendChild(promptEditor.editPane);

  /* ---------------------------------------------------------------- */
  /* Tabs                                                             */
  /* ---------------------------------------------------------------- */

  let activeTab = SETTINGS_TABS.includes(initialTab) ? initialTab : 'general';
  function showTab(id) {
    activeTab = id;
    host.querySelectorAll('.settings-tab').forEach((btn) => {
      const on = btn.dataset.tab === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    host.querySelectorAll('.settings-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === id);
    });
  }
  host.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  showTab(activeTab);

  /* ---------------------------------------------------------------- */
  /* Values                                                           */
  /* ---------------------------------------------------------------- */

  function readValues() {
    const next = { ...custom };
    host.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
      next[input.dataset.key] = input.value;
    });
    // Keep the pending SSH / terminal-profile edits in their lists.
    syncSshFieldsToProfile();
    syncTermFieldsToProfile();
    const selectedFont = q('#setting-font')?.value || fontId;
    const prompt = promptEditor.getState();
    return {
      custom: next,
      scrollback: Number.parseInt(q('#setting-scrollback')?.value, 10),
      startDirectory: normalizeStartDirectoryInput(q('#setting-start-dir')?.value),
      showStatusBar: !!q('#setting-statusbar')?.checked,
      showTrayIcon: allowTray ? !!q('#setting-tray')?.checked : !!payload.showTrayIcon,
      shellId: showShell ? q('#setting-shell')?.value || '' : payload.shellId || '',
      shellCustomPath: showShell
        ? normalizeStartDirectoryInput(q('#setting-shell-path')?.value)
        : payload.shellCustomPath || '',
      backgroundImage: currentBgImage,
      backgroundImageId: activeBgId || '',
      backgroundLibrary: bgItems,
      backgroundFit: currentBgFit,
      bgImageTransparency,
      fontId: getFontById(selectedFont).id,
      fontSize: clampFontSize(q('#setting-font-size')?.value),
      lsDirectoryColor: q('#color-ls-directory')?.value || payload.lsDirectoryColor,
      lsFileColor: q('#color-ls-file')?.value || payload.lsFileColor,
      promptConfig: prompt.config,
      promptGitMode: prompt.gitMode,
      promptPresetId: prompt.presetId,
      customPrompts: prompt.customPrompts,
      themeId,
      sshProfiles: sshProfiles.map((item) => ({ ...item })),
      terminalProfiles: termProfiles.map((item) => ({ ...item })),
      defaultTermCols: Number.parseInt(q('#setting-term-cols')?.value, 10) || 120,
      defaultTermRows: Number.parseInt(q('#setting-term-rows')?.value, 10) || 25,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Terminal profiles                                                */
  /* ---------------------------------------------------------------- */

  const termField = (key) => q(`[data-term-f="${key}"]`);
  const termCurrent = () => termProfiles.find((item) => item.id === termSel) || null;
  function syncTermFieldsToProfile() {
    const cur = termCurrent();
    if (!cur) return;
    const next = { ...cur };
    TERM_PROFILE_KEYS.forEach((key) => {
      const el = termField(key);
      if (el) next[key] = el.value;
    });
    Object.assign(cur, normalizeTerminalProfiles([next])[0]);
  }
  let termRenderedSel = null;
  function renderTermList() {
    if (termSel && !termCurrent()) termSel = termProfiles[0]?.id || '';
    const switched = termRenderedSel !== termSel;
    termRenderedSel = termSel;
    const rows = q('[data-term-rows]');
    if (rows) {
      rows.innerHTML = termProfiles.length
        ? termProfiles
            .map(
              (item) => `
          <button type="button" class="ssh-row${item.id === termSel ? ' active' : ''}" data-term-row="${escapeHtml(item.id)}">
            <span class="ellipsis">${escapeHtml(item.name || t('settings.profileUnnamed', '(new profile)'))}</span>
            <span class="ssh-row-sub ellipsis">${item.cols}×${item.rows} · ${escapeHtml(getFontById(item.fontId).label)} ${item.fontSize}px</span>
          </button>`
            )
            .join('')
        : `<div class="muted small ssh-empty">${escapeHtml(t('settings.profileEmpty', 'No profiles yet.'))}</div>`;
    }
    const cur = termCurrent();
    const detail = q('[data-pane="terminal"] .ssh-detail');
    if (detail) detail.classList.toggle('pe-disabled', !cur);
    TERM_PROFILE_KEYS.forEach((key) => {
      const el = termField(key);
      if (!el) return;
      el.disabled = !cur;
      if (switched || document.activeElement !== el) el.value = cur ? String(cur[key] ?? '') : '';
    });
    const sizeNote = q('[data-term-current-size]');
    if (sizeNote) sizeNote.textContent = t('settings.profileCurrentSize', 'now {cols}×{rows}').replace('{cols}', termCurrentSize.cols).replace('{rows}', termCurrentSize.rows);
    q('[data-term-remove]')?.toggleAttribute('disabled', !cur);
    q('[data-term-apply]')?.toggleAttribute('disabled', !cur);
  }
  q('[data-term-rows]')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-term-row]');
    if (!row) return;
    syncTermFieldsToProfile();
    termSel = row.dataset.termRow;
    renderTermList();
  });
  const addTermProfile = (item) => {
    syncTermFieldsToProfile();
    termProfiles = [...termProfiles, item];
    termSel = item.id;
    renderTermList();
    termField('name')?.focus();
    immediate(false);
  };
  q('[data-term-add]')?.addEventListener('click', () =>
    addTermProfile({ id: newTerminalProfileId(), name: '', cols: 80, rows: 24, fontId, fontSize, scrollback: Number(payload.scrollback) || 10000, shellId: '' })
  );
  // "From current": the window's terminal size, font, scrollback and shell as a new profile.
  q('[data-term-save-current]')?.addEventListener('click', () =>
    addTermProfile({
      id: newTerminalProfileId(),
      name: '',
      cols: termCurrentSize.cols,
      rows: termCurrentSize.rows,
      fontId: getFontById(q('#setting-font')?.value || fontId).id,
      fontSize: clampFontSize(q('#setting-font-size')?.value),
      scrollback: Number.parseInt(q('#setting-scrollback')?.value, 10) || 10000,
      shellId: showShell ? q('#setting-shell')?.value || '' : '',
    })
  );
  q('[data-term-remove]')?.addEventListener('click', () => {
    const cur = termCurrent();
    if (!cur) return;
    termProfiles = termProfiles.filter((item) => item.id !== cur.id);
    termSel = termProfiles[0]?.id || '';
    renderTermList();
    immediate(false);
  });
  q('[data-term-apply]')?.addEventListener('click', () => {
    syncTermFieldsToProfile();
    const cur = termCurrent();
    if (!cur) return;
    // The profile's font / size / scrollback / shell are the same settings the
    // other tabs edit: mirror them there first, so the change event that
    // follows carries the profile's values (not stale ones).
    const fontSel = q('#setting-font');
    if (fontSel) fontSel.value = getFontById(cur.fontId).id;
    const sizeInput = q('#setting-font-size');
    if (sizeInput) sizeInput.value = String(cur.fontSize);
    const sbInput = q('#setting-scrollback');
    if (sbInput) sbInput.value = String(cur.scrollback);
    const shellSel = q('#setting-shell');
    if (shellSel && cur.shellId) {
      shellSel.value = cur.shellId;
      syncShellPathState();
    }
    immediate(false);
    onApplyProfile?.({ ...cur });
  });
  TERM_PROFILE_KEYS.forEach((key) => {
    const el = termField(key);
    if (!el) return;
    const event = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(event, () => {
      syncTermFieldsToProfile();
      const row = q('[data-term-rows]')?.querySelector(`[data-term-row="${termSel}"]`);
      const cur = termCurrent();
      if (row && cur) {
        row.children[0].textContent = cur.name || t('settings.profileUnnamed', '(new profile)');
        row.children[1].textContent = `${cur.cols}×${cur.rows} · ${getFontById(cur.fontId).label} ${cur.fontSize}px`;
      }
      debounced(300);
    });
    el.addEventListener('change', () => immediate(false));
  });
  renderTermList();

  /* ---------------------------------------------------------------- */
  /* Theme tab                                                        */
  /* ---------------------------------------------------------------- */

  const colorKeys = [...colorFields.map(([key]) => key), 'foreground'];
  function setColorInputs(colors) {
    colorKeys.forEach((key) => {
      const input = q(`#color-${key}`);
      if (input && colors?.[key]) {
        input.value = colors[key];
        custom[key] = colors[key];
      }
    });
  }
  function renderThemeCards() {
    const grid = q('[data-theme-grid]');
    if (grid) grid.innerHTML = themeCardsHtml();
    const cur = q('[data-theme-current]');
    if (cur) cur.textContent = t('settings.themeCurrent', 'current: {name}').replace('{name}', t(`themes.${themeId}`, themeId));
  }
  q('[data-theme-grid]')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-theme-card]');
    if (!card || !themesMap[card.dataset.themeCard]) return;
    themeId = card.dataset.themeCard;
    // The colour pickers follow: the theme's own colours plus its overrides.
    setColorInputs(resolveTheme(themesMap, themeId, themeOverrides[themeId]));
    renderThemeCards();
    immediate(false);
  });
  // Colour edits belong to the current theme (its card shows ✎).
  host.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const base = themesMap[themeId];
      if (!base) return;
      const diff = {};
      colorKeys.forEach((key) => {
        const v = q(`#color-${key}`)?.value;
        if (v && v.toLowerCase() !== String(base[key] || '').toLowerCase()) diff[key] = v;
      });
      if (Object.keys(diff).length) themeOverrides[themeId] = diff;
      else delete themeOverrides[themeId];
      renderThemeCards();
    });
  });
  renderThemeCards();

  /* ---------------------------------------------------------------- */
  /* SSH profiles                                                     */
  /* ---------------------------------------------------------------- */

  const sshField = (key) => q(`[data-ssh-f="${key}"]`);
  const sshCurrent = () => sshProfiles.find((item) => item.id === sshSel) || null;
  function syncSshFieldsToProfile() {
    const cur = sshCurrent();
    if (!cur) return;
    SSH_PROFILE_KEYS.forEach((key) => {
      const el = sshField(key);
      if (!el) return;
      cur[key] = key === 'port' ? Math.max(1, Math.min(65535, Number.parseInt(el.value, 10) || 22)) : el.value.trim();
    });
  }
  let sshRenderedSel = null;
  function renderSshList() {
    if (sshSel && !sshCurrent()) sshSel = sshProfiles[0]?.id || '';
    // A focused field keeps the user's typing only while the same profile stays selected.
    const switched = sshRenderedSel !== sshSel;
    sshRenderedSel = sshSel;
    const rows = q('[data-ssh-rows]');
    if (rows) {
      rows.innerHTML = sshProfiles.length
        ? sshProfiles
            .map(
              (item) => `
          <button type="button" class="ssh-row${item.id === sshSel ? ' active' : ''}" data-ssh-row="${escapeHtml(item.id)}">
            <span class="ellipsis">${escapeHtml(sshProfileLabel(item) || t('settings.sshUnnamed', '(new host)'))}</span>
            <span class="ssh-row-sub ellipsis">${escapeHtml(item.host ? `${item.username ? `${item.username}@` : ''}${item.host}:${item.port}` : '')}</span>
          </button>`
            )
            .join('')
        : `<div class="muted small ssh-empty">${escapeHtml(t('settings.sshEmpty', 'No saved hosts yet.'))}</div>`;
    }
    const cur = sshCurrent();
    const detail = q('.ssh-detail');
    if (detail) detail.classList.toggle('pe-disabled', !cur);
    SSH_PROFILE_KEYS.forEach((key) => {
      const el = sshField(key);
      if (!el) return;
      el.disabled = !cur;
      if (switched || document.activeElement !== el) {
        el.value = cur ? String(cur[key] ?? (key === 'port' ? 22 : '')) : key === 'port' ? '22' : '';
      }
    });
    const removeBtn = q('[data-ssh-remove]');
    if (removeBtn) removeBtn.disabled = !cur;
  }
  q('[data-ssh-rows]')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-ssh-row]');
    if (!row) return;
    syncSshFieldsToProfile();
    sshSel = row.dataset.sshRow;
    renderSshList();
  });
  q('[data-ssh-add]')?.addEventListener('click', () => {
    syncSshFieldsToProfile();
    const item = { id: newSshProfileId(), name: '', host: '', port: 22, username: '', privateKey: '' };
    sshProfiles = [...sshProfiles, item];
    sshSel = item.id;
    renderSshList();
    sshField('name')?.focus();
    immediate(false);
  });
  q('[data-ssh-remove]')?.addEventListener('click', () => {
    const cur = sshCurrent();
    if (!cur) return;
    sshProfiles = sshProfiles.filter((item) => item.id !== cur.id);
    sshSel = sshProfiles[0]?.id || '';
    renderSshList();
    immediate(false);
  });
  SSH_PROFILE_KEYS.forEach((key) => {
    const el = sshField(key);
    if (!el) return;
    el.addEventListener('input', () => {
      syncSshFieldsToProfile();
      const rows = q('[data-ssh-rows]');
      const row = rows?.querySelector(`[data-ssh-row="${sshSel}"]`);
      if (row) {
        const cur = sshCurrent();
        row.children[0].textContent = sshProfileLabel(cur) || t('settings.sshUnnamed', '(new host)');
        row.children[1].textContent = cur?.host ? `${cur.username ? `${cur.username}@` : ''}${cur.host}:${cur.port}` : '';
      }
      debounced(300);
    });
    el.addEventListener('change', () => immediate(false));
  });
  renderSshList();

  function emitChange({ themeTouched = false } = {}) {
    return emit?.({ ...readValues(), themeTouched });
  }

  /* ---------------------------------------------------------------- */
  /* General / text / colours wiring                                  */
  /* ---------------------------------------------------------------- */

  let debounce = null;
  const debounced = (ms) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => emitChange({ themeTouched: false }), ms);
  };
  const immediate = (themeTouched = false) => {
    clearTimeout(debounce);
    emitChange({ themeTouched });
  };

  host.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
    input.addEventListener('input', () => immediate(true));
  });
  host.querySelectorAll('input[type="color"][data-ls-color]').forEach((input) => {
    input.addEventListener('input', () => immediate(false));
  });
  q('#setting-font')?.addEventListener('change', () => immediate(false));
  const fontSizeInput = q('#setting-font-size');
  fontSizeInput?.addEventListener('input', () => debounced(200));
  fontSizeInput?.addEventListener('change', () => immediate(false));
  q('#setting-statusbar')?.addEventListener('change', () => immediate(false));
  q('#setting-tray')?.addEventListener('change', () => immediate(false));
  const scrollInput = q('#setting-scrollback');
  scrollInput?.addEventListener('input', () => debounced(250));
  scrollInput?.addEventListener('change', () => immediate(false));
  ['#setting-term-cols', '#setting-term-rows'].forEach((sel) => {
    q(sel)?.addEventListener('change', () => immediate(false));
  });

  const startDirInput = q('#setting-start-dir');
  startDirInput?.addEventListener('input', () => debounced(150));
  startDirInput?.addEventListener('change', () => immediate(false));
  startDirInput?.addEventListener('blur', () => immediate(false));
  q('#setting-start-dir-pick')?.addEventListener('click', async () => {
    try {
      const result = await api?.pickDirectory?.({
        defaultPath: startDirInput.value.trim(),
        title: 'Select start directory',
      });
      if (!result?.ok || !result.path) return;
      startDirInput.value = result.path;
      immediate(false);
    } catch (err) {
      startDirInput.title = String(err?.message || err || 'Failed to pick folder');
    }
  });

  const shellSelect = q('#setting-shell');
  const shellPathInput = q('#setting-shell-path');
  function syncShellPathState() {
    if (!shellSelect || !shellPathInput) return;
    const isCustom = shellSelect.value === 'custom';
    shellPathInput.disabled = !isCustom;
    if (!isCustom) {
      const def = shells.find((s) => s.id === shellSelect.value);
      shellPathInput.placeholder = def?.path || '';
    } else {
      shellPathInput.placeholder = t('settings.shellCustomPathPlaceholder', '');
    }
  }
  syncShellPathState();
  shellSelect?.addEventListener('change', () => {
    syncShellPathState();
    immediate(false);
  });
  shellPathInput?.addEventListener('input', () => debounced(300));
  shellPathInput?.addEventListener('change', () => immediate(false));

  /* ---------------------------------------------------------------- */
  /* Background library                                               */
  /* ---------------------------------------------------------------- */

  function showBgError(message, details = '') {
    const el = q('#setting-bg-error');
    if (el) {
      el.textContent = message || ' ';
      el.classList.toggle('visible', !!message);
    }
    // Also the error dialog, with whatever detail we have (stack, file name ...).
    if (message) onError?.({ message, details: details || `[background image]
${message}` });
  }

  function syncActiveFromLibrary() {
    const active = bgItems.find((item) => item.id === activeBgId);
    currentBgImage = active?.dataUrl || '';
  }

  function renderBgLibrary({ jumpToActive = false } = {}) {
    if (jumpToActive && activeBgId) {
      const idx = bgItems.findIndex((item) => item.id === activeBgId);
      if (idx >= 0) bgPage = Math.floor(idx / BG_PAGE_SIZE);
    }
    const { items, page, pages } = pageOfLibrary(bgItems, bgPage);
    bgPage = page;
    const library = q('#setting-bg-library');
    if (library) {
      library.innerHTML = bgItems.length
        ? backgroundLibraryCardsHtml(i18n, items, activeBgId)
        : `<div class="settings-bg-empty">${escapeHtml(t('settings.backgroundImageEmpty'))}</div>`;
      applyBgFitToLibrary(host, bgFitModes, currentBgFit);
    }
    const clearBtn = q('#setting-bg-clear');
    if (clearBtn) clearBtn.disabled = !(activeBgId || currentBgImage);
    q('#setting-bg-page').textContent = `${page + 1}/${pages}`;
    q('#setting-bg-prev').disabled = page <= 0;
    q('#setting-bg-next').disabled = page >= pages - 1;
  }

  q('#setting-bg-prev')?.addEventListener('click', () => {
    bgPage -= 1;
    renderBgLibrary();
  });
  q('#setting-bg-next')?.addEventListener('click', () => {
    bgPage += 1;
    renderBgLibrary();
  });

  const bgAlphaInput = q('#setting-bg-image-transparency');
  const bgAlphaValue = q('#setting-bg-image-transparency-value');
  bgAlphaInput?.addEventListener('input', () => {
    bgImageTransparency = clampPct(bgAlphaInput.value);
    if (bgAlphaValue) bgAlphaValue.textContent = `${bgImageTransparency}%`;
    immediate(false);
  });

  const fileInput = q('#setting-bg-file');
  q('#setting-bg-pick')?.addEventListener('click', async () => {
    showBgError('');
    try {
      if (!bg.pick) {
        fileInput?.click();
        return;
      }
      const result = await bg.pick();
      if (result?.canceled) return;
      if (result?.error === 'too_large') {
        showBgError(t('settings.backgroundImageTooLarge'));
        return;
      }
      if (!result?.ok) {
        showBgError(result?.error || t('settings.backgroundImageFailed'));
        return;
      }
      if (Array.isArray(result.items)) {
        bgItems = result.items;
        activeBgId = result.activeId || result.id || '';
        syncActiveFromLibrary();
      } else if (result.dataUrl) {
        const id = result.id || `bg_${Date.now().toString(36)}`;
        bgItems = [
          { id, name: result.name || 'Image', dataUrl: result.dataUrl },
          ...bgItems.filter((item) => item.id !== id),
        ];
        activeBgId = id;
        currentBgImage = result.dataUrl;
      }
      if (result.directory) onBgDir?.(result.directory);
      renderBgLibrary({ jumpToActive: true });
      immediate(false);
    } catch (err) {
      showBgError(err?.message || t('settings.backgroundImageFailed'), err?.stack || '');
    }
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showBgError(t('settings.backgroundImageTooLarge'));
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read_failed'));
        reader.readAsDataURL(file);
      });
      const id = `bg_${Date.now().toString(36)}`;
      const name = String(file.name || 'Image').replace(/\.[^.]+$/, '') || 'Image';
      bgItems = [{ id, name, dataUrl }, ...bgItems];
      activeBgId = id;
      currentBgImage = dataUrl;
      renderBgLibrary({ jumpToActive: true });
      immediate(false);
    } catch (_) {
      showBgError(t('settings.backgroundImageFailed'));
    }
  });

  q('#setting-bg-clear')?.addEventListener('click', async () => {
    showBgError('');
    if (bg.clear) {
      const result = await bg.clear();
      if (result?.items) bgItems = result.items;
    }
    activeBgId = '';
    currentBgImage = '';
    renderBgLibrary();
    immediate(false);
  });

  q('#setting-bg-library')?.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-bg-remove]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = removeBtn.getAttribute('data-bg-remove');
      showBgError('');
      if (bg.remove) {
        const result = await bg.remove(id);
        if (!result?.ok) {
          showBgError(result?.error || t('settings.backgroundImageFailed'));
          return;
        }
        bgItems = result.items || [];
        activeBgId = result.activeId || '';
        currentBgImage = result.dataUrl || '';
      } else {
        bgItems = bgItems.filter((item) => item.id !== id);
        if (activeBgId === id) {
          activeBgId = '';
          currentBgImage = '';
        }
      }
      renderBgLibrary();
      immediate(false);
      return;
    }
    const selectBtn = e.target.closest('[data-bg-select]');
    if (!selectBtn) return;
    const id = selectBtn.getAttribute('data-bg-select');
    showBgError('');
    if (bg.select) {
      const result = await bg.select(id);
      if (!result?.ok) {
        showBgError(result?.error || t('settings.backgroundImageFailed'));
        return;
      }
      bgItems = result.items || bgItems;
      activeBgId = result.activeId || id;
      currentBgImage = result.dataUrl || '';
    } else {
      activeBgId = id;
      syncActiveFromLibrary();
    }
    renderBgLibrary();
    immediate(false);
  });

  const fitSelect = q('#setting-bg-fit');
  fitSelect?.addEventListener('change', () => {
    currentBgFit = fitSelect.value || 'cover';
    applyBgFitToLibrary(host, bgFitModes, currentBgFit);
    immediate(false);
  });

  renderBgLibrary({ jumpToActive: true });

  (async () => {
    if (!bg.list) return;
    try {
      const listed = await bg.list();
      if (!listed?.ok) return;
      bgItems = listed.items || [];
      activeBgId = listed.activeId || '';
      syncActiveFromLibrary();
      renderBgLibrary({ jumpToActive: true });
    } catch (_) {
      /* ignore */
    }
  })();

  /** Reset-result from the owner: put the default colours back into the pickers. */
  function applyReset(detail = {}) {
    const next = detail.custom || detail;
    if (detail.themeId && themesMap[detail.themeId]) themeId = detail.themeId;
    delete themeOverrides[themeId];
    setColorInputs(next);
    renderThemeCards();
    if (detail.lsDirectoryColor) {
      const input = q('#color-ls-directory');
      if (input) input.value = detail.lsDirectoryColor;
    }
    if (detail.lsFileColor) {
      const input = q('#color-ls-file');
      if (input) input.value = detail.lsFileColor;
    }
    immediate(true);
  }

  return {
    readValues,
    emitChange,
    applyReset,
    showTab,
    getActiveTab: () => activeTab,
    setGitMode: (mode) => promptEditor.setGitMode(mode),
    fit,
  };
}
