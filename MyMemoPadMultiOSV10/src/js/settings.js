import { applyI18n, getLocale, setLocale, t } from './i18n.js';
import {
  DEFAULT_LOOK,
  DEFAULT_SETTINGS,
  PRESET_BACK_COLORS,
  clampTransparency,
  lockSettingsTheme,
  lookFromSettings
} from './shared.js';
import { sendSettingsCommand } from './settings-bus.js';

export function measureSettingsHeight() {
  const root = document.getElementById('view-settings');
  const form = document.getElementById('settings-form');
  const bar = document.getElementById('settings-toolbar');
  if (!root || root.hidden || !form) return 0;
  const barH = bar ? bar.offsetHeight : 32;
  const cs = getComputedStyle(form);
  let inner = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  for (const el of form.children) {
    const s = getComputedStyle(el);
    if (el.hidden || s.display === 'none') continue;
    inner += el.offsetHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
  }
  return Math.ceil(barH + inner);
}

export function initSettings({ isElectron, getAppInfo }) {
  lockSettingsTheme();
  const view = document.getElementById('view-settings');
  const form = document.getElementById('settings-form');
  const palette = document.getElementById('color-palette');
  const backColor = document.getElementById('back-color');
  const fontName = document.getElementById('font-name');
  const fontSize = document.getElementById('font-size');
  const fontColor = document.getElementById('font-color');
  const opacityField = document.getElementById('opacity-field');
  const opacityRange = document.getElementById('opacity-range');
  const opacityValue = document.getElementById('opacity-value');
  const languageSelect = document.getElementById('language-select');
  const autostartCheck = document.getElementById('autostart-check');
  const autostartNote = document.getElementById('autostart-web-note');
  const aboutAuthor = document.getElementById('about-author');
  const aboutVersion = document.getElementById('about-version');

  let context = {
    ownerRole: 'pad',
    sourceIndex: -1,
    look: { ...DEFAULT_LOOK },
    settings: { ...DEFAULT_SETTINGS },
    html: '',
    appInfo: { version: '1.0.0' }
  };

  palette.innerHTML = '';
  for (const hex of PRESET_BACK_COLORS) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'swatch';
    sw.style.background = hex;
    sw.addEventListener('click', () => {
      backColor.value = hex;
      previewBack(hex);
    });
    palette.appendChild(sw);
  }

  function scopeWhole() {
    return form.querySelector('input[name="scope"]:checked')?.value !== 'selection';
  }

  function previewBack(hex) {
    sendSettingsCommand({ type: 'previewColor', color: hex });
  }

  function fitWindow() {
    const run = () => {
      const needed = measureSettingsHeight();
      if (window.desktopAPI?.fitSettingsWindow) {
        window.desktopAPI.fitSettingsWindow(needed);
        return;
      }
      if (typeof window.resizeTo !== 'function' || needed < 200) return;
      window.resizeTo(window.outerWidth || 500, needed + 8);
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function applyFontNow() {
    sendSettingsCommand({
      type: 'applyFont',
      family: fontName.value,
      size: Number(fontSize.value) || 12,
      color: fontColor.value,
      whole: scopeWhole()
    });
  }

  function toggleStyle(command) {
    sendSettingsCommand({ type: 'toggleStyle', command, whole: scopeWhole() });
  }

  document.getElementById('style-bold').addEventListener('click', () => toggleStyle('bold'));
  document.getElementById('style-italic').addEventListener('click', () => toggleStyle('italic'));
  document.getElementById('style-underline').addEventListener('click', () => toggleStyle('underline'));
  document.getElementById('style-strike').addEventListener('click', () => toggleStyle('strikeThrough'));

  fontName.addEventListener('change', applyFontNow);
  fontSize.addEventListener('change', applyFontNow);
  fontColor.addEventListener('input', applyFontNow);
  backColor.addEventListener('input', () => previewBack(backColor.value));

  opacityRange.addEventListener('input', () => {
    const n = clampTransparency(opacityRange.value);
    opacityValue.textContent = t('settings.opacity.value', { n });
    sendSettingsCommand({ type: 'opacity', transparencyPercent: n });
  });

  languageSelect.addEventListener('change', () => {
    setLocale(languageSelect.value);
    refreshChrome();
    sendSettingsCommand({ type: 'language', language: languageSelect.value });
    fitWindow();
  });

  document.getElementById('settings-default').addEventListener('click', () => {
    fillFromLook(DEFAULT_LOOK, DEFAULT_SETTINGS);
    previewBack(DEFAULT_LOOK.editorBackColor);
    applyFontNow();
    sendSettingsCommand({ type: 'opacity', transparencyPercent: 0 });
  });

  function closeWindow() {
    if (window.desktopAPI?.close) window.desktopAPI.close();
    else window.close();
  }

  document.getElementById('settings-cancel').addEventListener('click', () => {
    sendSettingsCommand({ type: 'cancel', snapshot: context });
  });

  document.getElementById('settings-close').addEventListener('click', () => {
    sendSettingsCommand({ type: 'cancel', snapshot: context });
    if (!window.desktopAPI) closeWindow();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const look = currentLook();
    const settings = {
      ...look,
      language: languageSelect.value,
      windowTransparencyPercent: look.transparencyPercent
    };
    if (isElectron && typeof autostartCheck.checked === 'boolean') {
      await window.desktopAPI.setAutoStart(autostartCheck.checked);
    }
    sendSettingsCommand({
      type: 'commit',
      look,
      settings,
      sourceIndex: context.sourceIndex,
      ownerRole: context.ownerRole
    });
    if (!window.desktopAPI) closeWindow();
  });

  function currentLook() {
    return {
      fontName: fontName.value,
      fontSize: Number(fontSize.value) || 12,
      fontStyle: 'Regular',
      foreColor: fontColor.value,
      editorBackColor: backColor.value,
      formBackColor: backColor.value,
      transparencyPercent: clampTransparency(opacityRange.value)
    };
  }

  function fillFromLook(look, settings) {
    ensureFontOption(look.fontName);
    fontName.value = look.fontName;
    fontSize.value = String(look.fontSize || 12);
    fontColor.value = look.foreColor || '#000000';
    backColor.value = look.editorBackColor || DEFAULT_LOOK.editorBackColor;
    opacityRange.value = String(look.transparencyPercent || 0);
    opacityValue.textContent = t('settings.opacity.value', { n: opacityRange.value });
    languageSelect.value = settings?.language || getLocale();
  }

  function ensureFontOption(name) {
    if (!name) return;
    const exists = [...fontName.options].some((o) => o.value === name || o.textContent === name);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      fontName.appendChild(opt);
    }
    fontName.value = name;
  }

  function refreshChrome() {
    applyI18n(document);
    aboutAuthor.textContent = `${t('settings.author')}: SHKWON (knix008@naver.com)`;
    const version = context.appInfo?.version || getAppInfo?.()?.version || '1.0.0';
    aboutVersion.textContent = t('about.version', { n: version });
    opacityValue.textContent = t('settings.opacity.value', { n: opacityRange.value });
    document.title = t('settings.title');
  }

  async function load(next) {
    context = {
      ownerRole: next?.ownerRole || 'pad',
      sourceIndex: Number.isInteger(next?.sourceIndex) ? next.sourceIndex : -1,
      look: next?.look || lookFromSettings(next?.settings),
      settings: next?.settings || { ...DEFAULT_SETTINGS },
      html: next?.html || '',
      appInfo: next?.appInfo || context.appInfo
    };
    setLocale(context.settings.language || getLocale());
    fillFromLook(context.look, context.settings);
    opacityField.hidden = context.ownerRole === 'list';
    autostartNote.hidden = isElectron;
    autostartCheck.disabled = !isElectron;
    if (isElectron && window.desktopAPI?.getAutoStart) {
      autostartCheck.checked = await window.desktopAPI.getAutoStart();
    } else {
      autostartCheck.checked = false;
    }
    refreshChrome();
    view.hidden = false;
    fitWindow();
  }

  return { load, refreshChrome, view };
}
