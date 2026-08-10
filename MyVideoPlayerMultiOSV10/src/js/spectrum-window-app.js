import { SpectrumPainter, SPECTRUM_STYLES, normalizeSpectrumStyle } from './spectrum.js';
import { getSpectrumChannelName } from './spectrum-bridge.js';
import { t, setLocale, applyI18n } from './i18n.js';

const CHANNEL = getSpectrumChannelName();
const canvas = document.getElementById('spectrumCanvas');
const painter = new SpectrumPainter(canvas);
const styleNameEl = document.getElementById('spectrumStyleName');
const labelEl = document.getElementById('spectrumLabel');
const titleEl = document.getElementById('spectrumTitle');

let styleId = 'rainbow';
let locale = 'en';

function styleLabel(id) {
  const style = SPECTRUM_STYLES.find((s) => s.id === id) || SPECTRUM_STYLES[0];
  return t(style.labelKey);
}

function applyLocalUi() {
  applyI18n(document);
  if (labelEl) labelEl.textContent = t('spectrumLabel');
  if (titleEl) titleEl.textContent = `${t('spectrumLabel')} — MyVideoPlayer`;
  document.title = `${t('spectrumLabel')} — MyVideoPlayer`;
  if (styleNameEl) styleNameEl.textContent = styleLabel(styleId);
}

function setStyle(id, { notify = false } = {}) {
  styleId = normalizeSpectrumStyle(id);
  painter.setStyle(styleId);
  if (styleNameEl) styleNameEl.textContent = styleLabel(styleId);
  if (notify) emit({ type: 'style', style: styleId });
}

function cycleStyle(delta) {
  const ids = SPECTRUM_STYLES.map((s) => s.id);
  const idx = Math.max(0, ids.indexOf(styleId));
  setStyle(ids[(idx + delta + ids.length) % ids.length], { notify: true });
}

function applyThemePayload(theme) {
  if (!theme || typeof theme !== 'object') return;
  const root = document.documentElement;
  if (theme.themeId) root.setAttribute('data-theme', theme.themeId);
  if (theme.scheme) {
    root.setAttribute('data-color-scheme', theme.scheme);
    root.style.colorScheme = theme.scheme === 'light' ? 'light' : 'dark';
  }
  if (theme.vars && typeof theme.vars === 'object') {
    for (const [key, value] of Object.entries(theme.vars)) {
      if (typeof value === 'string') root.style.setProperty(key, value);
    }
  }
  const bg = getComputedStyle(root).getPropertyValue('--bg-panel').trim();
  painter.setBackground(bg || '#161a22');
}

function emit(message) {
  const payload = { channel: CHANNEL, ...message };
  if (window.desktopAPI?.sendSpectrumHostMessage) {
    window.desktopAPI.sendSpectrumHostMessage(payload);
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      new BroadcastChannel(CHANNEL).postMessage(payload);
    }
  } catch {
    /* ignore */
  }
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(payload, window.location.origin);
    } catch {
      /* ignore */
    }
  }
}

function handleMessage(msg) {
  if (!msg || (msg.channel && msg.channel !== CHANNEL)) return;
  switch (msg.type) {
    case 'init':
    case 'sync':
      if (msg.locale) {
        locale = msg.locale === 'ko' ? 'ko' : 'en';
        setLocale(locale);
      }
      if (msg.style) setStyle(msg.style, { notify: false });
      if (msg.theme) applyThemePayload(msg.theme);
      applyLocalUi();
      break;
    case 'frame':
      if (msg.bins) painter.paint(msg.bins);
      break;
    case 'style':
      if (msg.style) setStyle(msg.style, { notify: false });
      break;
    case 'theme':
      if (msg.theme) applyThemePayload(msg.theme);
      break;
    case 'locale':
      locale = msg.locale === 'ko' ? 'ko' : 'en';
      setLocale(locale);
      applyLocalUi();
      break;
    case 'close':
      window.close();
      break;
    default:
      break;
  }
}

function bind() {
  document.getElementById('btnSpectrumPrev')?.addEventListener('click', () => cycleStyle(-1));
  document.getElementById('btnSpectrumNext')?.addEventListener('click', () => cycleStyle(1));
  document.getElementById('btnSpectrumWinClose')?.addEventListener('click', () => {
    emit({ type: 'closed' });
    window.close();
  });

  window.addEventListener('beforeunload', () => {
    emit({ type: 'closed' });
  });

  window.addEventListener('message', (e) => {
    handleMessage(e.data);
  });

  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(CHANNEL);
    ch.addEventListener('message', (e) => handleMessage(e.data));
  }

  if (window.desktopAPI?.onSpectrumMessage) {
    window.desktopAPI.onSpectrumMessage(handleMessage);
  }

  window.addEventListener('resize', () => painter.resize());
  applyLocalUi();
  emit({ type: 'ready' });
}

bind();
