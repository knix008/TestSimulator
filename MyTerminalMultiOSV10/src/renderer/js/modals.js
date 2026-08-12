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

function textAppearanceSectionHtml(i18n, { fonts, fontId, fontSize, foreground }) {
  const fg = foreground || '#d4d4d4';
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

export function mountPromptView(ctx, payload) {
  const { i18n, bodyEl, footerEl, setTitle, close, send, fit } = ctx;
  const presets = payload.presets || {};
  const presetEntries = Object.values(presets);
  setTitle(i18n.t('prompt.title'));
  bodyEl.innerHTML = `
    <p class="form-hint">${i18n.t('prompt.hint')}</p>
    <div class="form-grid">
      <label for="prompt-template">${i18n.t('prompt.template')}</label>
      <textarea id="prompt-template" class="form-input form-textarea" rows="3">${escapeHtml(
        payload.template || ''
      )}</textarea>
    </div>
    <div class="preset-row">
      ${presetEntries
        .map(
          (p) =>
            `<button type="button" class="modal-btn preset-btn" data-preset="${p.id}">${i18n.t(
              `prompt.presets.${p.id}`,
              p.id
            )}</button>`
        )
        .join('')}
    </div>
    <p class="form-hint mono">${i18n.t('prompt.tokens')}</p>
  `;

  bodyEl.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = presets[btn.dataset.preset];
      if (preset) bodyEl.querySelector('#prompt-template').value = preset.template;
    });
  });

  addFooterButtons(
    footerEl,
    [
      {
        label: i18n.t('prompt.apply'),
        primary: true,
        closeOnClick: false,
        onClick: async () => {
          const value = bodyEl.querySelector('#prompt-template').value;
          send({ type: 'prompt:apply', template: value });
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
  presets,
  onApply,
  themes,
  themeId,
  custom,
}) {
  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'prompt',
      width: 560,
      height: 480,
    });
    host.onEvent(async (ev) => {
      if (ev.type === 'prompt:apply') await onApply(ev.template);
    });
    host.send({
      type: 'init',
      kind: 'prompt',
      payload: { lang: i18n.lang, template, presets, themes, themeId, custom },
    });
    return host;
  }

  const presetEntries = Object.values(presets || {});
  const bodyHtml = `
    <p class="form-hint">${i18n.t('prompt.hint')}</p>
    <div class="form-grid">
      <label for="prompt-template">${i18n.t('prompt.template')}</label>
      <textarea id="prompt-template" class="form-input form-textarea" rows="3">${escapeHtml(
        template || ''
      )}</textarea>
    </div>
    <div class="preset-row">
      ${presetEntries
        .map(
          (p) =>
            `<button type="button" class="modal-btn preset-btn" data-preset="${p.id}">${i18n.t(
              `prompt.presets.${p.id}`,
              p.id
            )}</button>`
        )
        .join('')}
    </div>
    <p class="form-hint mono">${i18n.t('prompt.tokens')}</p>
  `;

  const { modal, close } = openModalInPage({
    title: i18n.t('prompt.title'),
    bodyHtml,
    buttons: [
      {
        label: i18n.t('prompt.apply'),
        primary: true,
        closeOnClick: false,
        onClick: async ({ modal: m, close: c }) => {
          const value = m.querySelector('#prompt-template').value;
          await onApply(value);
          c();
        },
      },
      { label: i18n.t('prompt.close') },
    ],
  });

  modal.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = presets[btn.dataset.preset];
      if (preset) modal.querySelector('#prompt-template').value = preset.template;
    });
  });

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
      <h3 class="settings-section-title" style="margin-top:14px">${i18n.t('settings.backgroundImage')}</h3>
      <p class="settings-hint">${i18n.t('settings.backgroundImageHint')}</p>
      <div class="settings-bg-image">
        <div
          id="setting-bg-preview"
          class="settings-bg-preview${currentBgImage ? '' : ' empty'}"
          ${currentBgImage ? `style="background-image:url('${currentBgImage.replace(/'/g, '%27')}')"` : ''}
        >${currentBgImage ? '' : i18n.t('settings.backgroundImageNone')}</div>
        <div class="settings-bg-actions">
          <button type="button" class="modal-btn" id="setting-bg-pick">${i18n.t(
            'settings.backgroundImagePick'
          )}</button>
          <button type="button" class="modal-btn" id="setting-bg-clear" ${
            currentBgImage ? '' : 'disabled'
          }>${i18n.t('settings.backgroundImageClear')}</button>
        </div>
      </div>
      <div class="settings-grid" style="margin-top:12px">
        <label for="setting-bg-fit">${i18n.t('settings.backgroundFit')}</label>
        <select id="setting-bg-fit" class="settings-select">${fitOptions}</select>
      </div>
      <p class="settings-hint">${i18n.t('settings.backgroundFitHint')}</p>
      <p class="settings-hint" id="setting-bg-error" hidden></p>
    </div>
  `;

  function applyPreviewFit(fitId) {
    const mode =
      bgFitModes.find((item) => item.id === fitId) ||
      bgFitModes[0] || {
        size: 'cover',
        position: 'center',
        repeat: 'no-repeat',
      };
    const preview = bodyEl.querySelector('#setting-bg-preview');
    if (!preview) return;
    preview.style.setProperty('--preview-bg-size', mode.size);
    preview.style.setProperty('--preview-bg-position', mode.position);
    preview.style.setProperty('--preview-bg-repeat', mode.repeat);
  }

  function updatePreview(dataUrl) {
    const preview = bodyEl.querySelector('#setting-bg-preview');
    const clearBtn = bodyEl.querySelector('#setting-bg-clear');
    currentBgImage = dataUrl || '';
    if (currentBgImage) {
      preview.classList.remove('empty');
      preview.style.backgroundImage = `url("${currentBgImage.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
      preview.textContent = '';
      if (clearBtn) clearBtn.disabled = false;
    } else {
      preview.classList.add('empty');
      preview.style.backgroundImage = '';
      preview.textContent = i18n.t('settings.backgroundImageNone');
      if (clearBtn) clearBtn.disabled = true;
    }
    applyPreviewFit(currentBgFit);
  }

  function showBgError(message) {
    const el = bodyEl.querySelector('#setting-bg-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    fit?.();
  }

  function readValues() {
    const next = { ...custom };
    bodyEl.querySelectorAll('input[type="color"]').forEach((input) => {
      next[input.dataset.key] = input.value;
    });
    const selectedFont = bodyEl.querySelector('#setting-font')?.value || fontId;
    return {
      custom: next,
      scrollback: Number.parseInt(bodyEl.querySelector('#setting-scrollback')?.value, 10),
      showStatusBar: !!bodyEl.querySelector('#setting-statusbar')?.checked,
      showTrayIcon: allowTray
        ? !!bodyEl.querySelector('#setting-tray')?.checked
        : !!payload.showTrayIcon,
      backgroundImage: currentBgImage,
      backgroundFit: currentBgFit,
      fontId: getFontById(selectedFont).id,
      fontSize: clampFontSize(bodyEl.querySelector('#setting-font-size')?.value),
    };
  }

  function emitChange({ themeTouched = false } = {}) {
    send({ type: 'settings:change', data: { ...readValues(), themeTouched } });
  }

  let scrollTimer = null;
  bodyEl.querySelectorAll('input[type="color"]').forEach((input) => {
    input.addEventListener('input', () => emitChange({ themeTouched: true }));
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
      updatePreview(result.dataUrl);
      if (result.directory) {
        send({ type: 'settings:bg-dir', directory: result.directory });
      }
      emitChange({ themeTouched: false });
      fit?.();
    } catch (err) {
      showBgError(err?.message || i18n.t('settings.backgroundImageFailed'));
    }
  });

  bodyEl.querySelector('#setting-bg-clear')?.addEventListener('click', async () => {
    showBgError('');
    await api.clearBackgroundImage?.();
    updatePreview('');
    emitChange({ themeTouched: false });
  });

  const fitSelect = bodyEl.querySelector('#setting-bg-fit');
  applyPreviewFit(currentBgFit);
  fitSelect?.addEventListener('change', () => {
    currentBgFit = fitSelect.value || 'cover';
    applyPreviewFit(currentBgFit);
    emitChange({ themeTouched: false });
  });

  document.addEventListener('popup-settings-reset', (e) => {
    const next = e.detail || {};
    [...fields.map(([key]) => key), 'foreground'].forEach((key) => {
      const input = bodyEl.querySelector(`#color-${key}`);
      if (input && next[key]) {
        input.value = next[key];
        custom[key] = next[key];
      }
    });
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
  showStatusBar = true,
  showTrayIcon = false,
  allowTray = true,
  backgroundImage = '',
  backgroundFit = 'cover',
  bgFitModes = [],
  themes = null,
  themeId = 'custom',
  fonts = FONTS,
  fontId = DEFAULT_FONT_ID,
  fontSize = 14,
  onChange,
  onReset,
  onPickBackground,
  onClearBackground,
  onBgDir,
}) {
  if (canUsePopup()) {
    const host = await openPopupHost({
      kind: 'settings',
      width: 540,
      height: 780,
      minWidth: 420,
      minHeight: 360,
    });
    host.onEvent(async (ev) => {
      if (ev.type === 'settings:change') await onChange?.(ev.data);
      if (ev.type === 'settings:reset') {
        const next = onReset?.();
        host.send({ type: 'settings:reset-result', custom: next });
      }
      if (ev.type === 'settings:bg-dir' && onBgDir) onBgDir(ev.directory);
    });
    host.send({
      type: 'init',
      kind: 'settings',
      payload: {
        lang: i18n.lang,
        custom,
        scrollback,
        showStatusBar,
        showTrayIcon,
        allowTray,
        backgroundImage,
        backgroundFit,
        bgFitModes,
        themes,
        themeId,
        fonts,
        fontId,
        fontSize,
      },
    });
    return host;
  }

  // ---- web / in-page fallback (previous behavior) ----
  let currentBgImage = backgroundImage || '';
  let currentBgFit = backgroundFit || 'cover';
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
      <h3 class="settings-section-title" style="margin-top:14px">${i18n.t('settings.backgroundImage')}</h3>
      <p class="settings-hint">${i18n.t('settings.backgroundImageHint')}</p>
      <div class="settings-bg-image">
        <div id="setting-bg-preview" class="settings-bg-preview${currentBgImage ? '' : ' empty'}"
          ${currentBgImage ? `style="background-image:url('${currentBgImage.replace(/'/g, '%27')}')"` : ''}>
          ${currentBgImage ? '' : i18n.t('settings.backgroundImageNone')}
        </div>
        <div class="settings-bg-actions">
          <button type="button" class="modal-btn" id="setting-bg-pick">${i18n.t('settings.backgroundImagePick')}</button>
          <button type="button" class="modal-btn" id="setting-bg-clear" ${currentBgImage ? '' : 'disabled'}>${i18n.t('settings.backgroundImageClear')}</button>
          <input
            id="setting-bg-file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/tiff,image/bmp,image/svg+xml,.jpg,.jpeg,.jfif,.png,.gif,.webp,.avif,.tif,.tiff,.bmp,.svg,.ico"
            hidden
          />
        </div>
      </div>
      <div class="settings-grid" style="margin-top:12px">
        <label for="setting-bg-fit">${i18n.t('settings.backgroundFit')}</label>
        <select id="setting-bg-fit" class="settings-select">${fitOptions}</select>
      </div>
      <p class="settings-hint">${i18n.t('settings.backgroundFitHint')}</p>
      <p class="settings-hint" id="setting-bg-error" hidden></p>
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
          const next = onReset();
          [...fields.map(([key]) => key), 'foreground'].forEach((key) => {
            const input = m.querySelector(`#color-${key}`);
            if (input && next[key]) input.value = next[key];
          });
          emitChange(m, { themeTouched: true });
        },
      },
      { label: i18n.t('settings.close'), primary: true },
    ],
  });

  function applyPreviewFit(m, fitId) {
    const mode =
      bgFitModes.find((item) => item.id === fitId) ||
      bgFitModes[0] || { size: 'cover', position: 'center', repeat: 'no-repeat' };
    const preview = m.querySelector('#setting-bg-preview');
    if (!preview) return;
    preview.style.setProperty('--preview-bg-size', mode.size);
    preview.style.setProperty('--preview-bg-position', mode.position);
    preview.style.setProperty('--preview-bg-repeat', mode.repeat);
  }

  function updatePreview(m, dataUrl) {
    const preview = m.querySelector('#setting-bg-preview');
    const clearBtn = m.querySelector('#setting-bg-clear');
    currentBgImage = dataUrl || '';
    if (currentBgImage) {
      preview.classList.remove('empty');
      preview.style.backgroundImage = `url("${currentBgImage.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
      preview.textContent = '';
      if (clearBtn) clearBtn.disabled = false;
    } else {
      preview.classList.add('empty');
      preview.style.backgroundImage = '';
      preview.textContent = i18n.t('settings.backgroundImageNone');
      if (clearBtn) clearBtn.disabled = true;
    }
    applyPreviewFit(m, currentBgFit);
  }

  function showBgError(m, message) {
    const el = m.querySelector('#setting-bg-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function readValues(m) {
    const next = { ...custom };
    m.querySelectorAll('input[type="color"]').forEach((input) => {
      next[input.dataset.key] = input.value;
    });
    const selectedFont = m.querySelector('#setting-font')?.value || fontId;
    return {
      custom: next,
      scrollback: Number.parseInt(m.querySelector('#setting-scrollback')?.value, 10),
      showStatusBar: !!m.querySelector('#setting-statusbar')?.checked,
      showTrayIcon: allowTray
        ? !!m.querySelector('#setting-tray')?.checked
        : showTrayIcon,
      backgroundImage: currentBgImage,
      backgroundFit: currentBgFit,
      fontId: getFontById(selectedFont).id,
      fontSize: clampFontSize(m.querySelector('#setting-font-size')?.value),
    };
  }

  function emitChange(m, { themeTouched = false } = {}) {
    onChange?.({ ...readValues(m), themeTouched });
  }

  let scrollTimer = null;
  modal.querySelectorAll('input[type="color"]').forEach((input) => {
    input.addEventListener('input', () => emitChange(modal, { themeTouched: true }));
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
        updatePreview(modal, result.dataUrl);
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
      updatePreview(modal, dataUrl);
      emitChange(modal, { themeTouched: false });
    } catch (_) {
      showBgError(modal, i18n.t('settings.backgroundImageFailed'));
    }
  });

  modal.querySelector('#setting-bg-clear')?.addEventListener('click', async () => {
    showBgError(modal, '');
    if (onClearBackground) await onClearBackground();
    updatePreview(modal, '');
    emitChange(modal, { themeTouched: false });
  });

  const fitSelect = modal.querySelector('#setting-bg-fit');
  applyPreviewFit(modal, currentBgFit);
  fitSelect?.addEventListener('change', () => {
    currentBgFit = fitSelect.value || 'cover';
    applyPreviewFit(modal, currentBgFit);
    emitChange(modal, { themeTouched: false });
  });
}
