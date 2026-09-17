import { canUsePopup, openPopupHost } from './popup-host.js';
import { createSettingsUi, SETTINGS_TABS } from './settings-view.js';
import { resolveTheme } from './themes.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inline SVG icons for footer buttons, keyed by semantic role. Stroke uses
 * currentColor so they inherit the button's text color (incl. primary white).
 */
const FOOTER_BTN_ICONS = {
  apply:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  connect:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h11M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reset:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v5h5M20 20v-5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 9a7 7 0 00-12-3L4 9m1 6a7 7 0 0012 3l3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

/** Pick a button icon: explicit btn.icon name, else infer from role/primary. */
function footerBtnIconMarkup(btn) {
  const name = btn.icon || (btn.primary ? 'apply' : 'close');
  return FOOTER_BTN_ICONS[name] || '';
}

export function addFooterButtons(footerEl, buttons, { modal, close }) {
  footerEl.innerHTML = '';
  buttons.forEach((btn) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `modal-btn${btn.primary ? ' primary' : ''}`;
    // Icon + label together (icon inherits currentColor via the SVG stroke).
    const label = document.createElement('span');
    label.textContent = btn.label;
    el.innerHTML = footerBtnIconMarkup(btn);
    el.appendChild(label);
    el.addEventListener('click', async () => {
      if (btn.onClick) await btn.onClick({ close, modal });
      if (btn.closeOnClick !== false) close();
    });
    footerEl.appendChild(el);
  });
}

/** In-page modal (web / fallback). */
export function openModalInPage({ title, bodyHtml, buttons = [] }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2></h2>
        <button class="tb-btn modal-x" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    </div>
  `;

  const modal = backdrop.querySelector('.modal');
  modal.querySelector('h2').textContent = title;
  modal.querySelector('.modal-body').innerHTML = bodyHtml;
  const footer = modal.querySelector('.modal-footer');
  const close = () => backdrop.remove();

  addFooterButtons(footer, buttons, { modal, close });
  backdrop.querySelector('.modal-x').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  root.appendChild(backdrop);
  return { close, modal };
}

export function openModal(options) {
  return openModalInPage(options);
}

/* ---------------- About ---------------- */

/** Build/runtime info rows (Electron desktop only; empty on the web). */
function aboutBuildInfoHtml(i18n, info = {}) {
  if (!info.electron) return '';
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const rows = [
    [i18n.t('about.electron', 'Electron'), info.electron],
    [i18n.t('about.chromium', 'Chromium'), info.chrome],
    [i18n.t('about.nodejs', 'Node.js'), info.node],
    [i18n.t('about.os', 'OS'), info.os],
    [i18n.t('about.buildDate', 'Build date'), fmtDate(info.buildDate)],
  ].filter(([, v]) => v);
  if (!rows.length) return '';
  return `
    <div class="about-section-title">${i18n.t('about.buildSection', 'Build info')}</div>
    <div class="about-meta">
      ${rows
        .map(([k, v]) => `<div class="about-row"><strong>${k}</strong><span>${v}</span></div>`)
        .join('')}
    </div>
  `;
}

export function mountAboutView(ctx, payload) {
  const { i18n, bodyEl, footerEl, setTitle, close } = ctx;
  const info = payload.info || {};
  setTitle(i18n.t('about.title'));
  bodyEl.innerHTML = `
    <div class="about-hero">
      <img src="${payload.iconSrc || ''}" alt="MyTerminal" />
      <div>
        <h3>MyTerminal</h3>
        <div>${i18n.t('about.description')}</div>
      </div>
    </div>
    <div class="about-meta">
      <div class="about-row"><strong>${i18n.t('about.author')}</strong><span>SHKWON</span></div>
      <div class="about-row"><strong>${i18n.t('about.email')}</strong><a href="mailto:knix008@naver.com">knix008@naver.com</a></div>
      <div class="about-row"><strong>${i18n.t('about.version')}</strong><span>${info.version || '1.0.0'}</span></div>
      <div class="about-row"><strong>${i18n.t('about.platform')}</strong><span>${info.platform || 'web'} / ${info.arch || ''}</span></div>
      <div class="about-row"><strong>${i18n.t('about.runtime')}</strong><span>${info.electron ? `Electron ${info.electron}` : 'Web Browser'}</span></div>
    </div>
    ${aboutBuildInfoHtml(i18n, info)}
  `;
  addFooterButtons(
    footerEl,
    [{ label: i18n.t('about.close'), primary: true }],
    { modal: bodyEl, close }
  );
}

export async function openAboutModal({ i18n, info, iconSrc, themes, themeId, custom }) {
  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'about',
      width: 480,
      height: 420,
      backgroundColor: '#252526',
    });
    host.send({
      type: 'init',
      kind: 'about',
      payload: {
        lang: i18n.lang,
        info,
        iconSrc,
        themes,
        themeId,
        custom,
      },
    });
    return host;
  }

  const bodyHtml = `
    <div class="about-hero">
      <img src="${iconSrc}" alt="MyTerminal" />
      <div>
        <h3>MyTerminal</h3>
        <div>${i18n.t('about.description')}</div>
      </div>
    </div>
    <div class="about-meta">
      <div class="about-row"><strong>${i18n.t('about.author')}</strong><span>SHKWON</span></div>
      <div class="about-row"><strong>${i18n.t('about.email')}</strong><a href="mailto:knix008@naver.com">knix008@naver.com</a></div>
      <div class="about-row"><strong>${i18n.t('about.version')}</strong><span>${info.version || '1.0.0'}</span></div>
      <div class="about-row"><strong>${i18n.t('about.platform')}</strong><span>${info.platform || 'web'} / ${info.arch || navigator.platform}</span></div>
      <div class="about-row"><strong>${i18n.t('about.runtime')}</strong><span>${info.electron ? `Electron ${info.electron}` : 'Web Browser'}</span></div>
    </div>
    ${aboutBuildInfoHtml(i18n, info)}
  `;
  return openModalInPage({
    title: i18n.t('about.title'),
    bodyHtml,
    buttons: [{ label: i18n.t('about.close'), primary: true }],
  });
}

/* ---------------- SSH ---------------- */

/** Saved hosts (settings › SSH) as a picker above the connection form. */
function sshProfileSelectHtml(i18n, profiles = []) {
  if (!profiles.length) return '';
  const label = (pf) => pf.name || (pf.username ? `${pf.username}@${pf.host}` : pf.host);
  return `
      <div class="form-field">
        <label for="ssh-profile">${i18n.t('ssh.profile', 'Saved host')}</label>
        <select id="ssh-profile" class="form-input">
          <option value="">${escapeHtml(i18n.t('ssh.profileNone', '(choose a saved host)'))}</option>
          ${profiles
            .map((pf) => `<option value="${escapeHtml(pf.id)}">${escapeHtml(label(pf))} — ${escapeHtml(pf.host)}:${pf.port}</option>`)
            .join('')}
        </select>
      </div>`;
}

function wireSshProfileSelect(root, profiles = []) {
  const select = root.querySelector('#ssh-profile');
  if (!select) return;
  select.addEventListener('change', () => {
    const pf = profiles.find((item) => item.id === select.value);
    if (!pf) return;
    root.querySelector('#ssh-host').value = pf.host || '';
    root.querySelector('#ssh-port').value = String(pf.port || 22);
    root.querySelector('#ssh-user').value = pf.username || '';
    root.querySelector('#ssh-key').value = pf.privateKey || '';
    root.querySelector('#ssh-pass')?.focus();
  });
}

export function mountSshView(ctx, payload) {
  const { i18n, bodyEl, footerEl, setTitle, close, send, fit } = ctx;
  const defaults = payload.defaults || {};
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  setTitle(i18n.t('ssh.title'));
  bodyEl.innerHTML = `
    <div class="form-stack">
      ${sshProfileSelectHtml(i18n, profiles)}
      <div class="form-field">
        <label for="ssh-host">${i18n.t('ssh.host')}</label>
        <input id="ssh-host" class="form-input" value="${escapeHtml(defaults.host || '')}" placeholder="192.168.0.10" />
      </div>
      <div class="form-field">
        <label for="ssh-port">${i18n.t('ssh.port')}</label>
        <input id="ssh-port" class="form-input" type="number" value="${escapeHtml(
          String(defaults.port || 22)
        )}" />
      </div>
      <div class="form-field">
        <label for="ssh-user">${i18n.t('ssh.username')}</label>
        <input id="ssh-user" class="form-input" value="${escapeHtml(defaults.username || '')}" />
      </div>
      <div class="form-field">
        <label for="ssh-pass">${i18n.t('ssh.password')}</label>
        <input id="ssh-pass" class="form-input" type="password" value="" autocomplete="off" />
      </div>
      <div class="form-field">
        <label for="ssh-key">${i18n.t('ssh.privateKey')}</label>
        <input id="ssh-key" class="form-input" value="${escapeHtml(
          defaults.privateKey || ''
        )}" placeholder="C:\\Users\\me\\.ssh\\id_rsa" />
      </div>
      <div class="form-field">
        <label for="ssh-keypass">${i18n.t('ssh.passphrase')}</label>
        <input id="ssh-keypass" class="form-input" type="password" value="" autocomplete="off" />
      </div>
    </div>
    <p class="form-hint form-hint-after">${i18n.t('ssh.hint')}</p>
    <p id="ssh-error" class="form-error" hidden></p>
  `;

  addFooterButtons(
    footerEl,
    [
      {
        label: i18n.t('ssh.connect'),
        icon: 'connect',
        primary: true,
        closeOnClick: false,
        onClick: async () => {
          const errEl = bodyEl.querySelector('#ssh-error');
          errEl.hidden = true;
          const config = {
            host: bodyEl.querySelector('#ssh-host').value.trim(),
            port: Number(bodyEl.querySelector('#ssh-port').value) || 22,
            username: bodyEl.querySelector('#ssh-user').value.trim(),
            password: bodyEl.querySelector('#ssh-pass').value,
            privateKey: bodyEl.querySelector('#ssh-key').value.trim(),
            passphrase: bodyEl.querySelector('#ssh-keypass').value,
          };
          send({ type: 'ssh:connect', config });
        },
      },
      { label: i18n.t('ssh.cancel') },
    ],
    { modal: bodyEl, close }
  );

  wireSshProfileSelect(bodyEl, profiles);

  // Parent replies with connect result via popup-app bridge.
  const onMsg = (e) => {
    const ev = e.detail || {};
    const errEl = bodyEl.querySelector('#ssh-error');
    if (ev.ok) close();
    else {
      errEl.hidden = false;
      errEl.textContent = ev.error || i18n.t('ssh.failed');
      fit?.();
    }
  };
  document.addEventListener('popup-ssh-result', onMsg, { once: false });
  fit?.();
}

export async function openSshModal({
  i18n,
  defaults = {},
  profiles = [],
  onConnect,
  themes,
  themeId,
  custom,
}) {
  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'ssh',
      width: 480,
      height: 620,
    });
    host.onEvent(async (ev) => {
      if (ev.type === 'ssh:connect') {
        const result = await onConnect(ev.config);
        host.send({
          type: 'ssh:result',
          ok: !!result?.ok,
          error: result?.error,
        });
      }
    });
    host.send({
      type: 'init',
      kind: 'ssh',
      payload: { lang: i18n.lang, defaults, profiles, themes, themeId, custom },
    });
    return host;
  }

  const bodyHtml = `
    <div class="form-stack">
      ${sshProfileSelectHtml(i18n, profiles)}
      <div class="form-field">
        <label for="ssh-host">${i18n.t('ssh.host')}</label>
        <input id="ssh-host" class="form-input" value="${escapeHtml(defaults.host || '')}" placeholder="192.168.0.10" />
      </div>
      <div class="form-field">
        <label for="ssh-port">${i18n.t('ssh.port')}</label>
        <input id="ssh-port" class="form-input" type="number" value="${escapeHtml(
          String(defaults.port || 22)
        )}" />
      </div>
      <div class="form-field">
        <label for="ssh-user">${i18n.t('ssh.username')}</label>
        <input id="ssh-user" class="form-input" value="${escapeHtml(defaults.username || '')}" />
      </div>
      <div class="form-field">
        <label for="ssh-pass">${i18n.t('ssh.password')}</label>
        <input id="ssh-pass" class="form-input" type="password" value="" autocomplete="off" />
      </div>
      <div class="form-field">
        <label for="ssh-key">${i18n.t('ssh.privateKey')}</label>
        <input id="ssh-key" class="form-input" value="${escapeHtml(
          defaults.privateKey || ''
        )}" placeholder="C:\\Users\\me\\.ssh\\id_rsa" />
      </div>
      <div class="form-field">
        <label for="ssh-keypass">${i18n.t('ssh.passphrase')}</label>
        <input id="ssh-keypass" class="form-input" type="password" value="" autocomplete="off" />
      </div>
    </div>
    <p class="form-hint form-hint-after">${i18n.t('ssh.hint')}</p>
    <p id="ssh-error" class="form-error" hidden></p>
  `;

  const { modal } = openModalInPage({
    title: i18n.t('ssh.title'),
    bodyHtml,
    buttons: [
      {
        label: i18n.t('ssh.connect'),
        icon: 'connect',
        primary: true,
        closeOnClick: false,
        onClick: async ({ modal, close }) => {
          const errEl = modal.querySelector('#ssh-error');
          errEl.hidden = true;
          const config = {
            host: modal.querySelector('#ssh-host').value.trim(),
            port: Number(modal.querySelector('#ssh-port').value) || 22,
            username: modal.querySelector('#ssh-user').value.trim(),
            password: modal.querySelector('#ssh-pass').value,
            privateKey: modal.querySelector('#ssh-key').value.trim(),
            passphrase: modal.querySelector('#ssh-keypass').value,
          };
          const result = await onConnect(config);
          if (result?.ok) close();
          else {
            errEl.hidden = false;
            errEl.textContent = result?.error || i18n.t('ssh.failed');
          }
        },
      },
      { label: i18n.t('ssh.cancel') },
    ],
  });
  wireSshProfileSelect(modal, profiles);
}

/* ---------------- Settings ---------------- */

/** Preview palette source: the resolved theme (custom colours included). */
function previewThemeFrom(payload) {
  try {
    if (payload.themes) return resolveTheme(payload.themes, payload.themeId || 'dark', payload.custom);
  } catch (_) {
    /* fall through */
  }
  return null;
}

/**
 * Popup-window view. The window is sized once to the tallest tab (see
 * popup-app.js) and then locked, so nothing here may change its height.
 */
export function mountSettingsView(ctx, payload) {
  const { i18n, api, bodyEl, footerEl, setTitle, close, send, setBeforeClose } = ctx;
  setTitle(i18n.t('settings.title'));

  const ui = createSettingsUi(bodyEl, {
    i18n,
    api,
    payload: { ...payload, previewTheme: previewThemeFrom(payload) },
    initialTab: payload.tab || 'general',
    emit: (data) => send({ type: 'settings:change', data }),
    bg: {
      pick: api?.pickBackgroundImage ? () => api.pickBackgroundImage() : null,
      clear: api?.clearBackgroundImage ? () => api.clearBackgroundImage() : null,
      remove: api?.removeBackgroundImage ? (id) => api.removeBackgroundImage(id) : null,
      select: api?.selectBackgroundImage ? (id) => api.selectBackgroundImage(id) : null,
      list: api?.listBackgroundImages ? () => api.listBackgroundImages() : null,
    },
    onBgDir: (directory) => send({ type: 'settings:bg-dir', directory }),
    onError: (info) => send({ type: 'error', ...info }),
    onApplyProfile: (profile) => send({ type: 'settings:apply-profile', profile }),
  });

  setBeforeClose?.(async () => {
    await ui.emitChange({ themeTouched: false });
  });

  document.addEventListener('popup-settings-reset', (e) => ui.applyReset(e.detail || {}));
  document.addEventListener('popup-settings-tab', (e) => {
    const tab = e.detail?.tab;
    if (SETTINGS_TABS.includes(tab)) ui.showTab(tab);
  });
  document.addEventListener('popup-settings-git-mode', (e) => ui.setGitMode(e.detail?.gitMode));

  addFooterButtons(
    footerEl,
    [
      {
        label: i18n.t('settings.reset'),
        icon: 'reset',
        closeOnClick: false,
        onClick: () => send({ type: 'settings:reset' }),
      },
      { label: i18n.t('settings.close'), primary: true },
    ],
    { modal: bodyEl, close }
  );
}

/** Width of the settings window (content); the height comes from the tallest tab. */
export const SETTINGS_POPUP_WIDTH = 900;

export async function openSettingsModal({
  i18n,
  tab = 'general',
  custom,
  scrollback = 10000,
  startDirectory = '',
  showStatusBar = true,
  showTrayIcon = false,
  allowTray = true,
  shells = [],
  shellId = '',
  shellCustomPath = '',
  shellDefaultId = '',
  platform = 'web',
  backgroundImage = '',
  backgroundImageId = '',
  backgroundLibrary = [],
  backgroundFit = 'cover',
  bgImageTransparency = 0,
  bgFitModes = [],
  themes = null,
  themeId = 'dark',
  themeOverrides = {},
  sshProfiles = [],
  terminalProfiles = [],
  termCols = 80,
  termRows = 24,
  defaultTermCols = 120,
  defaultTermRows = 25,
  previewFont = null,
  onApplyProfile,
  fonts = null,
  fontId = '',
  fontSize = 14,
  lsDirectoryColor = '#569CD6',
  lsFileColor = '#D4D4D4',
  promptConfig = null,
  promptGitMode = 'status',
  customPrompts = [],
  onChange,
  onReset,
  onPickBackground,
  onClearBackground,
  onBgDir,
}) {
  const payload = {
    lang: i18n.lang,
    tab,
    custom,
    scrollback,
    startDirectory,
    showStatusBar,
    showTrayIcon,
    allowTray,
    shells,
    shellId,
    shellCustomPath,
    shellDefaultId,
    platform,
    backgroundImage,
    backgroundImageId,
    backgroundLibrary,
    backgroundFit,
    bgImageTransparency,
    bgFitModes,
    themes,
    themeId,
    fonts,
    fontId,
    fontSize,
    lsDirectoryColor,
    lsFileColor,
    promptConfig,
    promptGitMode,
    customPrompts,
    themeOverrides,
    sshProfiles,
    terminalProfiles,
    termCols,
    termRows,
    defaultTermCols,
    defaultTermRows,
    previewFont,
  };

  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'settings',
      width: SETTINGS_POPUP_WIDTH,
      height: 760,
      minWidth: SETTINGS_POPUP_WIDTH,
      minHeight: 400,
    });
    host.onEvent(async (ev) => {
      if (ev.type === 'settings:change') await onChange?.(ev.data);
      if (ev.type === 'settings:reset') {
        const next = onReset?.() || {};
        host.send({ type: 'settings:reset-result', ...next });
      }
      if (ev.type === 'settings:bg-dir' && onBgDir) onBgDir(ev.directory);
      if (ev.type === 'settings:apply-profile') await onApplyProfile?.(ev.profile);
    });
    host.send({ type: 'init', kind: 'settings', payload: { ...payload, autoFit: false } });
    return {
      ...host,
      showTab: (next) => host.send({ type: 'settings:tab', tab: next }),
      setGitMode: (mode) => host.send({ type: 'settings:git-mode', gitMode: mode }),
    };
  }

  // ---- web / in-page fallback ----
  const { modal, close } = openModalInPage({
    title: i18n.t('settings.title'),
    bodyHtml: '',
    buttons: [
      {
        label: i18n.t('settings.reset'),
        icon: 'reset',
        closeOnClick: false,
        onClick: () => ui.applyReset(onReset?.() || {}),
      },
      {
        label: i18n.t('settings.close'),
        primary: true,
        onClick: async () => {
          await ui.emitChange({ themeTouched: false });
        },
      },
    ],
  });
  modal.classList.add('modal-settings');
  const ui = createSettingsUi(modal.querySelector('.modal-body'), {
    i18n,
    api: window.myTerminal || null,
    payload: { ...payload, previewTheme: previewThemeFrom(payload) },
    initialTab: tab,
    allowFileInput: true,
    emit: (data) => onChange?.(data),
    bg: {
      pick: onPickBackground || null,
      clear: onClearBackground || null,
      remove: window.myTerminal?.removeBackgroundImage
        ? (id) => window.myTerminal.removeBackgroundImage(id)
        : null,
      select: window.myTerminal?.selectBackgroundImage
        ? (id) => window.myTerminal.selectBackgroundImage(id)
        : null,
      list: null,
    },
    onBgDir,
    onError: (info) => import('./error-dialog.js').then((m) => m.reportError(info, { context: 'settings' })),
    onApplyProfile,
  });
  return { modal, close, showTab: ui.showTab, setGitMode: ui.setGitMode };
}
