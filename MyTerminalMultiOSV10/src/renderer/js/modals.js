import { canUsePopup, openPopupHost } from './popup-host.js';
import { FONTS, DEFAULT_FONT_ID, getFontById } from './fonts.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clampFontSize(value) {
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
      return `<option value="${escapeHtml(font.id)}"${selected}>${escapeHtml(
        font.label
      )}</option>`;
    })
    .join('');
}

function startDirectoryControlsHtml(i18n, startDirectory = '', { allowBrowse = true } = {}) {
  const value = escapeHtml(startDirectory || '');
  const placeholder = escapeHtml(i18n.t('settings.startDirectoryPlaceholder'));
  return `
      <div class="settings-grid settings-grid-path">
        <label for="setting-start-dir">${i18n.t('settings.startDirectory')}</label>
        <div class="settings-path-row">
          <input
            id="setting-start-dir"
            class="settings-text"
            type="text"
            value="${value}"
            placeholder="${placeholder}"
            spellcheck="false"
          />
          ${
            allowBrowse
              ? `<button type="button" class="modal-btn" id="setting-start-dir-pick">${i18n.t(
                  'settings.startDirectoryPick'
                )}</button>`
              : ''
          }
        </div>
      </div>
      <p class="settings-hint">${i18n.t('settings.startDirectoryHint')}</p>`;
}

function escapeCssUrl(dataUrl) {
  return String(dataUrl || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function backgroundLibraryCardsHtml(i18n, items, activeId) {
  if (!items?.length) {
    return `<div class="settings-bg-empty">${escapeHtml(
      i18n.t('settings.backgroundImageEmpty')
    )}</div>`;
  }
  return items
    .map((item) => {
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
    })
    .join('');
}

function backgroundImageSectionHtml(
  i18n,
  { items = [], activeId = '', backgroundFitOptions = '', canClear = false } = {}
) {
  return `
      <h3 class="settings-section-title" style="margin-top:14px">${i18n.t(
        'settings.backgroundImage'
      )}</h3>
      <p class="settings-hint">${i18n.t('settings.backgroundImageHint')}</p>
      <div class="settings-bg-image">
        <div id="setting-bg-library" class="settings-bg-library">
          ${backgroundLibraryCardsHtml(i18n, items, activeId)}
        </div>
        <div class="settings-bg-actions">
          <button type="button" class="modal-btn" id="setting-bg-pick">${i18n.t(
            'settings.backgroundImagePick'
          )}</button>
          <button type="button" class="modal-btn" id="setting-bg-clear" ${
            canClear ? '' : 'disabled'
          }>${i18n.t('settings.backgroundImageClear')}</button>
        </div>
      </div>
      <div class="settings-grid" style="margin-top:12px">
        <label for="setting-bg-fit">${i18n.t('settings.backgroundFit')}</label>
        <select id="setting-bg-fit" class="settings-select">${backgroundFitOptions}</select>
      </div>
      <p class="settings-hint">${i18n.t('settings.backgroundFitHint')}</p>
      <p class="settings-hint" id="setting-bg-error" hidden></p>`;
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

function wireStartDirectoryControls(root, { api, sendChange, fit } = {}) {
  const input = root.querySelector('#setting-start-dir');
  if (!input) return;
  let timer = null;
  const emit = () => sendChange?.();
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(emit, 250);
  });
  input.addEventListener('change', () => {
    clearTimeout(timer);
    emit();
  });
  root.querySelector('#setting-start-dir-pick')?.addEventListener('click', async () => {
    try {
      const result = await api?.pickDirectory?.({
        defaultPath: input.value.trim(),
        title: 'Select start directory',
      });
      if (!result?.ok || !result.path) return;
      input.value = result.path;
      // Persist immediately so a restart right after browse still restores the path.
      clearTimeout(timer);
      emit();
      fit?.();
    } catch (_) {
      /* ignore */
    }
  });
}

function textAppearanceSectionHtml(
  i18n,
  { fonts, fontId, fontSize, foreground, lsDirectoryColor, lsFileColor }
) {
  const fg = foreground || '#d4d4d4';
  const dirColor = lsDirectoryColor || '#569CD6';
  const fileColor = lsFileColor || '#D4D4D4';
  return `
    <div class="settings-section">
      <h3 class="settings-section-title">${i18n.t('settings.textSection')}</h3>
      <p class="settings-hint">${i18n.t('settings.textSectionHint')}</p>
      <div class="settings-grid">
        <label for="setting-font">${i18n.t('settings.fontFamily')}</label>
        <select id="setting-font" class="settings-select">${fontOptionsHtml(
          fonts,
          fontId
        )}</select>
        <label for="setting-font-size">${i18n.t('settings.fontSize')}</label>
        <input
          id="setting-font-size"
          class="settings-number"
          type="number"
          min="10"
          max="28"
          step="1"
          value="${clampFontSize(fontSize)}"
        />
        <label for="color-foreground">${i18n.t('settings.foreground')}</label>
        <input id="color-foreground" type="color" value="${escapeHtml(
          fg
        )}" data-key="foreground" />
      </div>
    </div>
    <div class="settings-section">
      <h3 class="settings-section-title">${i18n.t('settings.lsColorsSection')}</h3>
      <p class="settings-hint">${i18n.t('settings.lsColorsHint')}</p>
      <div class="settings-grid">
        <label for="color-ls-directory">${i18n.t('settings.lsDirectoryColor')}</label>
        <input
          id="color-ls-directory"
          type="color"
          value="${escapeHtml(dirColor)}"
          data-ls-color="directory"
        />
        <label for="color-ls-file">${i18n.t('settings.lsFileColor')}</label>
        <input
          id="color-ls-file"
          type="color"
          value="${escapeHtml(fileColor)}"
          data-ls-color="file"
        />
      </div>
    </div>
  `;
}

function addFooterButtons(footerEl, buttons, { modal, close }) {
  footerEl.innerHTML = '';
  buttons.forEach((btn) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `modal-btn${btn.primary ? ' primary' : ''}`;
    el.textContent = btn.label;
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
  `;
  return openModalInPage({
    title: i18n.t('about.title'),
    bodyHtml,
    buttons: [{ label: i18n.t('about.close'), primary: true }],
  });
}

/* ---------------- Prompt ---------------- */

function promptPresetsHtml(i18n, presets, selectedId = '') {
  const groups = { basic: [], ohmyzsh: [], other: [] };
  Object.values(presets || {}).forEach((preset) => {
    if (!preset?.id) return;
    if (preset.group === 'ohmyzsh') groups.ohmyzsh.push(preset);
    else if (preset.group === 'basic' || !preset.group) groups.basic.push(preset);
    else groups.other.push(preset);
  });
  return ['basic', 'ohmyzsh', 'other']
    .filter((key) => groups[key].length)
    .map((key) => {
      const title = i18n.t(`prompt.groups.${key}`, key);
      const buttons = groups[key]
        .map((p) => {
          const active = p.id === selectedId ? ' preset-btn-active' : '';
          return `<button type="button" class="modal-btn preset-btn${active}" data-preset="${escapeHtml(
            p.id
          )}">${escapeHtml(i18n.t(`prompt.presets.${p.id}`, p.id))}</button>`;
        })
        .join('');
      return `
        <div class="preset-group">
          <div class="preset-group-title">${escapeHtml(title)}</div>
          <div class="preset-row">${buttons}</div>
        </div>`;
    })
    .join('');
}

function wirePromptPresets(root, presets) {
  root.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = presets?.[btn.dataset.preset];
      if (preset) root.querySelector('#prompt-template').value = preset.template;
      root.querySelectorAll('[data-preset]').forEach((b) => {
        b.classList.toggle('preset-btn-active', b === btn);
      });
    });
  });
}

function promptGitModeOptionsHtml(i18n, selected = 'status') {
  const modes = [
    ['off', 'prompt.gitModes.off'],
    ['branch', 'prompt.gitModes.branch'],
    ['status', 'prompt.gitModes.status'],
  ];
  return modes
    .map(([id, key]) => {
      const sel = id === selected ? ' selected' : '';
      return `<option value="${id}"${sel}>${escapeHtml(i18n.t(key, id))}</option>`;
    })
    .join('');
}

function promptBodyHtml(i18n, { template, presets, gitMode, presetId }) {
  return `
    <p class="form-hint">${i18n.t('prompt.hint')}</p>
    ${promptPresetsHtml(i18n, presets, presetId || '')}
    <p class="form-hint">${i18n.t('prompt.ohmyzshHint')}</p>
    <div class="form-grid">
      <label for="prompt-git-mode">${i18n.t('prompt.gitMode')}</label>
      <select id="prompt-git-mode" class="settings-select">
        ${promptGitModeOptionsHtml(i18n, gitMode || 'status')}
      </select>
      <label for="prompt-template">${i18n.t('prompt.template')}</label>
      <textarea id="prompt-template" class="form-input form-textarea" rows="3">${escapeHtml(
        template || ''
      )}</textarea>
    </div>
    <p class="form-hint">${i18n.t('prompt.gitModeHint')}</p>
    <p class="form-hint mono">${i18n.t('prompt.tokens')}</p>
  `;
}

function readPromptForm(root) {
  return {
    template: root.querySelector('#prompt-template')?.value || '',
    gitMode: root.querySelector('#prompt-git-mode')?.value || 'status',
  };
}

export function mountPromptView(ctx, payload) {
  const { i18n, bodyEl, footerEl, setTitle, close, send, fit } = ctx;
  const presets = payload.presets || {};
  setTitle(i18n.t('prompt.title'));
  bodyEl.innerHTML = promptBodyHtml(i18n, {
    template: payload.template,
    presets,
    gitMode: payload.gitMode,
    presetId: payload.presetId,
  });

  wirePromptPresets(bodyEl, presets);

  addFooterButtons(
    footerEl,
    [
      {
        label: i18n.t('prompt.apply'),
        primary: true,
        closeOnClick: false,
        onClick: async () => {
          const { template, gitMode } = readPromptForm(bodyEl);
          send({ type: 'prompt:apply', template, gitMode });
          close();
        },
      },
      { label: i18n.t('prompt.close') },
    ],
    { modal: bodyEl, close }
  );
  fit?.();
}

export async function openPromptModal({
  i18n,
  template,
  gitMode = 'status',
  presetId = '',
  presets,
  onApply,
  themes,
  themeId,
  custom,
}) {
  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'prompt',
      width: 600,
      height: 700,
      minWidth: 480,
      minHeight: 420,
    });
    host.onEvent(async (ev) => {
      if (ev.type === 'prompt:apply') {
        await onApply({
          template: ev.template,
          gitMode: ev.gitMode,
        });
      }
    });
    host.send({
      type: 'init',
      kind: 'prompt',
      payload: {
        lang: i18n.lang,
        template,
        gitMode,
        presetId,
        presets,
        themes,
        themeId,
        custom,
      },
    });
    return host;
  }

  const bodyHtml = promptBodyHtml(i18n, { template, presets, gitMode, presetId });

  const { modal, close } = openModalInPage({
    title: i18n.t('prompt.title'),
    bodyHtml,
    buttons: [
      {
        label: i18n.t('prompt.apply'),
        primary: true,
        closeOnClick: false,
        onClick: async ({ modal: m, close: c }) => {
          await onApply(readPromptForm(m));
          c();
        },
      },
      { label: i18n.t('prompt.close') },
    ],
  });

  wirePromptPresets(modal, presets);

  return { modal, close };
}

/* ---------------- SSH ---------------- */

export function mountSshView(ctx, payload) {
  const { i18n, bodyEl, footerEl, setTitle, close, send, fit } = ctx;
  const defaults = payload.defaults || {};
  setTitle(i18n.t('ssh.title'));
  bodyEl.innerHTML = `
    <div class="form-stack">
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
      payload: { lang: i18n.lang, defaults, themes, themeId, custom },
    });
    return host;
  }

  const bodyHtml = `
    <div class="form-stack">
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

  openModalInPage({
    title: i18n.t('ssh.title'),
    bodyHtml,
    buttons: [
      {
        label: i18n.t('ssh.connect'),
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
}

/* ---------------- Settings ---------------- */

export function mountSettingsView(ctx, payload) {
  const { i18n, api, bodyEl, footerEl, setTitle, close, send, fit } = ctx;
  const fields = [
    ['background', 'settings.background'],
    ['cursor', 'settings.cursor'],
    ['selection', 'settings.selection'],
    ['accent', 'settings.accent'],
    ['toolbarBg', 'settings.toolbarBg'],
  ];

  let currentBgImage = payload.backgroundImage || '';
  let currentBgFit = payload.backgroundFit || 'cover';
  let bgItems = Array.isArray(payload.backgroundLibrary)
    ? payload.backgroundLibrary.map((item) => ({ ...item }))
    : [];
  let activeBgId = payload.backgroundImageId || '';
  const custom = { ...(payload.custom || {}) };
  const allowTray = !!payload.allowTray;
  const bgFitModes = payload.bgFitModes || [];
  const fonts = payload.fonts?.length ? payload.fonts : FONTS;
  const fontId = payload.fontId || DEFAULT_FONT_ID;
  const fontSize = clampFontSize(payload.fontSize);

  const fitOptions = (bgFitModes.length ? bgFitModes : [{ id: 'cover' }])
    .map((mode) => {
      const label = i18n.t(`settings.bgFitModes.${mode.id}`, mode.id);
      const selected = mode.id === currentBgFit ? ' selected' : '';
      return `<option value="${mode.id}"${selected}>${label}</option>`;
    })
    .join('');

  setTitle(i18n.t('settings.title'));
  bodyEl.innerHTML = `
    <div class="settings-section">
      <h3 class="settings-section-title">${i18n.t('settings.terminalSection')}</h3>
      <div class="settings-grid">
        <label for="setting-scrollback">${i18n.t('settings.scrollback')}</label>
        <input
          id="setting-scrollback"
          class="settings-number"
          type="number"
          min="100"
          max="100000"
          step="100"
          value="${payload.scrollback ?? 1000}"
        />
      </div>
      <p class="settings-hint">${i18n.t('settings.scrollbackHint')}</p>
      ${startDirectoryControlsHtml(i18n, payload.startDirectory || '', {
        allowBrowse: !!api?.pickDirectory,
      })}
      <label class="settings-check" for="setting-statusbar" style="margin-top:12px">
        <input id="setting-statusbar" type="checkbox" ${payload.showStatusBar ? 'checked' : ''} />
        <span>${i18n.t('settings.statusBar')}</span>
      </label>
      <p class="settings-hint">${i18n.t('settings.statusBarHint')}</p>
      ${
        allowTray
          ? `
      <label class="settings-check" for="setting-tray" style="margin-top:12px">
        <input id="setting-tray" type="checkbox" ${payload.showTrayIcon ? 'checked' : ''} />
        <span>${i18n.t('settings.trayIcon')}</span>
      </label>
      <p class="settings-hint">${i18n.t('settings.trayIconHint')}</p>`
          : ''
      }
    </div>
    ${textAppearanceSectionHtml(i18n, {
      fonts,
      fontId,
      fontSize,
      foreground: custom.foreground,
      lsDirectoryColor: payload.lsDirectoryColor,
      lsFileColor: payload.lsFileColor,
    })}
    <div class="settings-section">
      <h3 class="settings-section-title">${i18n.t('settings.themeSection')}</h3>
      <p class="settings-hint">${i18n.t('settings.backgroundHint')}</p>
      <div class="settings-grid">
        ${fields
          .map(
            ([key, labelKey]) => `
          <label for="color-${key}">${i18n.t(labelKey)}</label>
          <input id="color-${key}" type="color" value="${custom[key] || '#000000'}" data-key="${key}" />
        `
          )
          .join('')}
      </div>
      ${backgroundImageSectionHtml(i18n, {
        items: bgItems,
        activeId: activeBgId,
        backgroundFitOptions: fitOptions,
        canClear: !!activeBgId || !!currentBgImage,
      })}
    </div>
  `;

  function showBgError(message) {
    const el = bodyEl.querySelector('#setting-bg-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    fit?.();
  }

  function renderBgLibrary() {
    const library = bodyEl.querySelector('#setting-bg-library');
    const clearBtn = bodyEl.querySelector('#setting-bg-clear');
    if (library) {
      library.innerHTML = backgroundLibraryCardsHtml(i18n, bgItems, activeBgId);
      applyBgFitToLibrary(bodyEl, bgFitModes, currentBgFit);
    }
    if (clearBtn) clearBtn.disabled = !(activeBgId || currentBgImage);
    fit?.();
  }

  function syncActiveFromLibrary() {
    const active = bgItems.find((item) => item.id === activeBgId);
    currentBgImage = active?.dataUrl || '';
  }

  function readValues() {
    const next = { ...custom };
    bodyEl.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
      next[input.dataset.key] = input.value;
    });
    const selectedFont = bodyEl.querySelector('#setting-font')?.value || fontId;
    return {
      custom: next,
      scrollback: Number.parseInt(bodyEl.querySelector('#setting-scrollback')?.value, 10),
      startDirectory: String(bodyEl.querySelector('#setting-start-dir')?.value || '').trim(),
      showStatusBar: !!bodyEl.querySelector('#setting-statusbar')?.checked,
      showTrayIcon: allowTray
        ? !!bodyEl.querySelector('#setting-tray')?.checked
        : !!payload.showTrayIcon,
      backgroundImage: currentBgImage,
      backgroundImageId: activeBgId || '',
      backgroundLibrary: bgItems,
      backgroundFit: currentBgFit,
      fontId: getFontById(selectedFont).id,
      fontSize: clampFontSize(bodyEl.querySelector('#setting-font-size')?.value),
      lsDirectoryColor:
        bodyEl.querySelector('#color-ls-directory')?.value || payload.lsDirectoryColor,
      lsFileColor: bodyEl.querySelector('#color-ls-file')?.value || payload.lsFileColor,
    };
  }

  function emitChange({ themeTouched = false } = {}) {
    send({ type: 'settings:change', data: { ...readValues(), themeTouched } });
  }

  let scrollTimer = null;
  bodyEl.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
    input.addEventListener('input', () => emitChange({ themeTouched: true }));
  });
  bodyEl.querySelectorAll('input[type="color"][data-ls-color]').forEach((input) => {
    input.addEventListener('input', () => emitChange({ themeTouched: false }));
  });
  bodyEl.querySelector('#setting-font')?.addEventListener('change', () => {
    emitChange({ themeTouched: false });
  });
  const fontSizeInput = bodyEl.querySelector('#setting-font-size');
  fontSizeInput?.addEventListener('input', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => emitChange({ themeTouched: false }), 200);
  });
  fontSizeInput?.addEventListener('change', () => {
    clearTimeout(scrollTimer);
    emitChange({ themeTouched: false });
  });
  bodyEl.querySelector('#setting-statusbar')?.addEventListener('change', () => {
    emitChange({ themeTouched: false });
  });
  bodyEl.querySelector('#setting-tray')?.addEventListener('change', () => {
    emitChange({ themeTouched: false });
  });
  const scrollInput = bodyEl.querySelector('#setting-scrollback');
  scrollInput?.addEventListener('input', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => emitChange({ themeTouched: false }), 250);
  });
  scrollInput?.addEventListener('change', () => {
    clearTimeout(scrollTimer);
    emitChange({ themeTouched: false });
  });
  wireStartDirectoryControls(bodyEl, {
    api,
    sendChange: () => emitChange({ themeTouched: false }),
    fit,
  });

  bodyEl.querySelector('#setting-bg-pick')?.addEventListener('click', async () => {
    showBgError('');
    try {
      const result = await api.pickBackgroundImage?.();
      if (result?.canceled) return;
      if (result?.error === 'too_large') {
        showBgError(i18n.t('settings.backgroundImageTooLarge'));
        return;
      }
      if (!result?.ok) {
        showBgError(result?.error || i18n.t('settings.backgroundImageFailed'));
        return;
      }
      if (Array.isArray(result.items)) {
        bgItems = result.items;
        activeBgId = result.activeId || result.id || '';
        syncActiveFromLibrary();
      } else {
        currentBgImage = result.dataUrl || '';
        activeBgId = result.id || activeBgId;
        if (result.dataUrl && result.id) {
          bgItems = [
            { id: result.id, name: result.name || 'Image', dataUrl: result.dataUrl },
            ...bgItems.filter((item) => item.id !== result.id),
          ];
        }
      }
      if (result.directory) {
        send({ type: 'settings:bg-dir', directory: result.directory });
      }
      renderBgLibrary();
      emitChange({ themeTouched: false });
    } catch (err) {
      showBgError(err?.message || i18n.t('settings.backgroundImageFailed'));
    }
  });

  bodyEl.querySelector('#setting-bg-clear')?.addEventListener('click', async () => {
    showBgError('');
    if (api.clearBackgroundImage) {
      const result = await api.clearBackgroundImage();
      if (result?.items) bgItems = result.items;
    }
    activeBgId = '';
    currentBgImage = '';
    renderBgLibrary();
    emitChange({ themeTouched: false });
  });

  bodyEl.querySelector('#setting-bg-library')?.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-bg-remove]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = removeBtn.getAttribute('data-bg-remove');
      showBgError('');
      if (api.removeBackgroundImage) {
        const result = await api.removeBackgroundImage(id);
        if (!result?.ok) {
          showBgError(result?.error || i18n.t('settings.backgroundImageFailed'));
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
      emitChange({ themeTouched: false });
      return;
    }
    const selectBtn = e.target.closest('[data-bg-select]');
    if (!selectBtn) return;
    const id = selectBtn.getAttribute('data-bg-select');
    showBgError('');
    if (api.selectBackgroundImage) {
      const result = await api.selectBackgroundImage(id);
      if (!result?.ok) {
        showBgError(result?.error || i18n.t('settings.backgroundImageFailed'));
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
    emitChange({ themeTouched: false });
  });

  const fitSelect = bodyEl.querySelector('#setting-bg-fit');
  applyBgFitToLibrary(bodyEl, bgFitModes, currentBgFit);
  fitSelect?.addEventListener('change', () => {
    currentBgFit = fitSelect.value || 'cover';
    applyBgFitToLibrary(bodyEl, bgFitModes, currentBgFit);
    emitChange({ themeTouched: false });
  });

  (async () => {
    if (!api.listBackgroundImages) return;
    try {
      const listed = await api.listBackgroundImages();
      if (!listed?.ok) return;
      bgItems = listed.items || [];
      activeBgId = listed.activeId || '';
      syncActiveFromLibrary();
      renderBgLibrary();
    } catch (_) {
      /* ignore */
    }
  })();

  document.addEventListener('popup-settings-reset', (e) => {
    const detail = e.detail || {};
    const next = detail.custom || detail;
    [...fields.map(([key]) => key), 'foreground'].forEach((key) => {
      const input = bodyEl.querySelector(`#color-${key}`);
      if (input && next[key]) {
        input.value = next[key];
        custom[key] = next[key];
      }
    });
    if (detail.lsDirectoryColor) {
      const input = bodyEl.querySelector('#color-ls-directory');
      if (input) input.value = detail.lsDirectoryColor;
    }
    if (detail.lsFileColor) {
      const input = bodyEl.querySelector('#color-ls-file');
      if (input) input.value = detail.lsFileColor;
    }
    emitChange({ themeTouched: true });
  });

  addFooterButtons(
    footerEl,
    [
      {
        label: i18n.t('settings.reset'),
        closeOnClick: false,
        onClick: () => send({ type: 'settings:reset' }),
      },
      { label: i18n.t('settings.close'), primary: true },
    ],
    { modal: bodyEl, close }
  );
  fit?.();
}

export async function openSettingsModal({
  i18n,
  custom,
  scrollback = 1000,
  startDirectory = '',
  showStatusBar = true,
  showTrayIcon = false,
  allowTray = true,
  backgroundImage = '',
  backgroundImageId = '',
  backgroundLibrary = [],
  backgroundFit = 'cover',
  bgFitModes = [],
  themes = null,
  themeId = 'custom',
  fonts = FONTS,
  fontId = DEFAULT_FONT_ID,
  fontSize = 14,
  lsDirectoryColor = '#569CD6',
  lsFileColor = '#D4D4D4',
  onChange,
  onReset,
  onPickBackground,
  onClearBackground,
  onBgDir,
}) {
  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'settings',
      width: 560,
      height: 720,
      minWidth: 480,
      minHeight: 520,
    });
    host.onEvent(async (ev) => {
      if (ev.type === 'settings:change') await onChange?.(ev.data);
      if (ev.type === 'settings:reset') {
        const next = onReset?.() || {};
        host.send({ type: 'settings:reset-result', ...next });
      }
      if (ev.type === 'settings:bg-dir' && onBgDir) onBgDir(ev.directory);
    });
    host.send({
      type: 'init',
      kind: 'settings',
      payload: {
        lang: i18n.lang,
        autoFit: false,
        custom,
        scrollback,
        startDirectory,
        showStatusBar,
        showTrayIcon,
        allowTray,
        backgroundImage,
        backgroundImageId,
        backgroundLibrary,
        backgroundFit,
        bgFitModes,
        themes,
        themeId,
        fonts,
        fontId,
        fontSize,
        lsDirectoryColor,
        lsFileColor,
      },
    });
    return host;
  }

  // ---- web / in-page fallback (previous behavior) ----
  let currentBgImage = backgroundImage || '';
  let currentBgFit = backgroundFit || 'cover';
  let bgItems = Array.isArray(backgroundLibrary)
    ? backgroundLibrary.map((item) => ({ ...item }))
    : [];
  let activeBgId = backgroundImageId || '';
  if (!bgItems.length && currentBgImage) {
    activeBgId = activeBgId || 'bg_web_1';
    bgItems = [{ id: activeBgId, name: 'Wallpaper', dataUrl: currentBgImage }];
  }
  const fields = [
    ['background', 'settings.background'],
    ['cursor', 'settings.cursor'],
    ['selection', 'settings.selection'],
    ['accent', 'settings.accent'],
    ['toolbarBg', 'settings.toolbarBg'],
  ];
  const fitOptions = (bgFitModes.length ? bgFitModes : [{ id: 'cover' }])
    .map((mode) => {
      const label = i18n.t(`settings.bgFitModes.${mode.id}`, mode.id);
      const selected = mode.id === currentBgFit ? ' selected' : '';
      return `<option value="${mode.id}"${selected}>${label}</option>`;
    })
    .join('');

  const bodyHtml = `
    <div class="settings-section">
      <h3 class="settings-section-title">${i18n.t('settings.terminalSection')}</h3>
      <div class="settings-grid">
        <label for="setting-scrollback">${i18n.t('settings.scrollback')}</label>
        <input id="setting-scrollback" class="settings-number" type="number" min="100" max="100000" step="100" value="${scrollback}" />
      </div>
      <p class="settings-hint">${i18n.t('settings.scrollbackHint')}</p>
      ${startDirectoryControlsHtml(i18n, startDirectory || '', {
        allowBrowse: !!window.myTerminal?.pickDirectory,
      })}
      <label class="settings-check" for="setting-statusbar" style="margin-top:12px">
        <input id="setting-statusbar" type="checkbox" ${showStatusBar ? 'checked' : ''} />
        <span>${i18n.t('settings.statusBar')}</span>
      </label>
      <p class="settings-hint">${i18n.t('settings.statusBarHint')}</p>
      ${
        allowTray
          ? `<label class="settings-check" for="setting-tray" style="margin-top:12px">
        <input id="setting-tray" type="checkbox" ${showTrayIcon ? 'checked' : ''} />
        <span>${i18n.t('settings.trayIcon')}</span>
      </label>
      <p class="settings-hint">${i18n.t('settings.trayIconHint')}</p>`
          : ''
      }
    </div>
    ${textAppearanceSectionHtml(i18n, {
      fonts,
      fontId,
      fontSize,
      foreground: custom?.foreground,
      lsDirectoryColor,
      lsFileColor,
    })}
    <div class="settings-section">
      <h3 class="settings-section-title">${i18n.t('settings.themeSection')}</h3>
      <p class="settings-hint">${i18n.t('settings.backgroundHint')}</p>
      <div class="settings-grid">
        ${fields
          .map(
            ([key, labelKey]) => `
          <label for="color-${key}">${i18n.t(labelKey)}</label>
          <input id="color-${key}" type="color" value="${custom[key] || '#000000'}" data-key="${key}" />`
          )
          .join('')}
      </div>
      ${backgroundImageSectionHtml(i18n, {
        items: bgItems,
        activeId: activeBgId,
        backgroundFitOptions: fitOptions,
        canClear: !!activeBgId || !!currentBgImage,
      })}
      <input
        id="setting-bg-file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/tiff,image/bmp,image/svg+xml,.jpg,.jpeg,.jfif,.png,.gif,.webp,.avif,.tif,.tiff,.bmp,.svg,.ico"
        hidden
      />
    </div>
  `;

  const { modal } = openModalInPage({
    title: i18n.t('settings.title'),
    bodyHtml,
    buttons: [
      {
        label: i18n.t('settings.reset'),
        closeOnClick: false,
        onClick: ({ modal: m }) => {
          const next = onReset() || {};
          const customNext = next.custom || next;
          [...fields.map(([key]) => key), 'foreground'].forEach((key) => {
            const input = m.querySelector(`#color-${key}`);
            if (input && customNext[key]) input.value = customNext[key];
          });
          if (next.lsDirectoryColor) {
            const input = m.querySelector('#color-ls-directory');
            if (input) input.value = next.lsDirectoryColor;
          }
          if (next.lsFileColor) {
            const input = m.querySelector('#color-ls-file');
            if (input) input.value = next.lsFileColor;
          }
          emitChange(m, { themeTouched: true });
        },
      },
      { label: i18n.t('settings.close'), primary: true },
    ],
  });

  function showBgError(m, message) {
    const el = m.querySelector('#setting-bg-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function syncActiveFromLibrary() {
    const active = bgItems.find((item) => item.id === activeBgId);
    currentBgImage = active?.dataUrl || '';
  }

  function renderBgLibrary(m) {
    const library = m.querySelector('#setting-bg-library');
    const clearBtn = m.querySelector('#setting-bg-clear');
    if (library) {
      library.innerHTML = backgroundLibraryCardsHtml(i18n, bgItems, activeBgId);
      applyBgFitToLibrary(m, bgFitModes, currentBgFit);
    }
    if (clearBtn) clearBtn.disabled = !(activeBgId || currentBgImage);
  }

  function readValues(m) {
    const next = { ...custom };
    m.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
      next[input.dataset.key] = input.value;
    });
    const selectedFont = m.querySelector('#setting-font')?.value || fontId;
    return {
      custom: next,
      scrollback: Number.parseInt(m.querySelector('#setting-scrollback')?.value, 10),
      startDirectory: String(m.querySelector('#setting-start-dir')?.value || '').trim(),
      showStatusBar: !!m.querySelector('#setting-statusbar')?.checked,
      showTrayIcon: allowTray
        ? !!m.querySelector('#setting-tray')?.checked
        : showTrayIcon,
      backgroundImage: currentBgImage,
      backgroundImageId: activeBgId || '',
      backgroundLibrary: bgItems,
      backgroundFit: currentBgFit,
      fontId: getFontById(selectedFont).id,
      fontSize: clampFontSize(m.querySelector('#setting-font-size')?.value),
      lsDirectoryColor:
        m.querySelector('#color-ls-directory')?.value || lsDirectoryColor,
      lsFileColor: m.querySelector('#color-ls-file')?.value || lsFileColor,
    };
  }

  function emitChange(m, { themeTouched = false } = {}) {
    onChange?.({ ...readValues(m), themeTouched });
  }

  let scrollTimer = null;
  modal.querySelectorAll('input[type="color"][data-key]').forEach((input) => {
    input.addEventListener('input', () => emitChange(modal, { themeTouched: true }));
  });
  modal.querySelectorAll('input[type="color"][data-ls-color]').forEach((input) => {
    input.addEventListener('input', () => emitChange(modal, { themeTouched: false }));
  });
  modal.querySelector('#setting-font')?.addEventListener('change', () => {
    emitChange(modal, { themeTouched: false });
  });
  const fontSizeInput = modal.querySelector('#setting-font-size');
  fontSizeInput?.addEventListener('input', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => emitChange(modal, { themeTouched: false }), 200);
  });
  fontSizeInput?.addEventListener('change', () => {
    clearTimeout(scrollTimer);
    emitChange(modal, { themeTouched: false });
  });
  modal.querySelector('#setting-statusbar')?.addEventListener('change', () => {
    emitChange(modal, { themeTouched: false });
  });
  modal.querySelector('#setting-tray')?.addEventListener('change', () => {
    emitChange(modal, { themeTouched: false });
  });
  const scrollInput = modal.querySelector('#setting-scrollback');
  scrollInput?.addEventListener('input', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => emitChange(modal, { themeTouched: false }), 250);
  });
  scrollInput?.addEventListener('change', () => {
    clearTimeout(scrollTimer);
    emitChange(modal, { themeTouched: false });
  });
  wireStartDirectoryControls(modal, {
    api: window.myTerminal,
    sendChange: () => emitChange(modal, { themeTouched: false }),
  });

  const fileInput = modal.querySelector('#setting-bg-file');
  modal.querySelector('#setting-bg-pick')?.addEventListener('click', async () => {
    showBgError(modal, '');
    try {
      if (onPickBackground) {
        const result = await onPickBackground();
        if (result?.canceled) return;
        if (result?.error === 'too_large') {
          showBgError(modal, i18n.t('settings.backgroundImageTooLarge'));
          return;
        }
        if (!result?.ok) {
          showBgError(modal, result?.error || i18n.t('settings.backgroundImageFailed'));
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
        renderBgLibrary(modal);
        emitChange(modal, { themeTouched: false });
      } else fileInput?.click();
    } catch (err) {
      showBgError(modal, err?.message || i18n.t('settings.backgroundImageFailed'));
    }
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showBgError(modal, i18n.t('settings.backgroundImageTooLarge'));
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
      renderBgLibrary(modal);
      emitChange(modal, { themeTouched: false });
    } catch (_) {
      showBgError(modal, i18n.t('settings.backgroundImageFailed'));
    }
  });

  modal.querySelector('#setting-bg-clear')?.addEventListener('click', async () => {
    showBgError(modal, '');
    if (onClearBackground) await onClearBackground();
    activeBgId = '';
    currentBgImage = '';
    renderBgLibrary(modal);
    emitChange(modal, { themeTouched: false });
  });

  modal.querySelector('#setting-bg-library')?.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-bg-remove]');
    if (removeBtn) {
      const id = removeBtn.getAttribute('data-bg-remove');
      if (window.myTerminal?.removeBackgroundImage) {
        const result = await window.myTerminal.removeBackgroundImage(id);
        if (result?.ok) {
          bgItems = result.items || [];
          activeBgId = result.activeId || '';
          currentBgImage = result.dataUrl || '';
        }
      } else {
        bgItems = bgItems.filter((item) => item.id !== id);
        if (activeBgId === id) {
          activeBgId = '';
          currentBgImage = '';
        }
      }
      renderBgLibrary(modal);
      emitChange(modal, { themeTouched: false });
      return;
    }
    const selectBtn = e.target.closest('[data-bg-select]');
    if (!selectBtn) return;
    const id = selectBtn.getAttribute('data-bg-select');
    if (window.myTerminal?.selectBackgroundImage) {
      const result = await window.myTerminal.selectBackgroundImage(id);
      if (result?.ok) {
        bgItems = result.items || bgItems;
        activeBgId = result.activeId || id;
        currentBgImage = result.dataUrl || '';
      }
    } else {
      activeBgId = id;
      syncActiveFromLibrary();
    }
    renderBgLibrary(modal);
    emitChange(modal, { themeTouched: false });
  });

  const fitSelect = modal.querySelector('#setting-bg-fit');
  applyBgFitToLibrary(modal, bgFitModes, currentBgFit);
  fitSelect?.addEventListener('change', () => {
    currentBgFit = fitSelect.value || 'cover';
    applyBgFitToLibrary(modal, bgFitModes, currentBgFit);
    emitChange(modal, { themeTouched: false });
  });
}
