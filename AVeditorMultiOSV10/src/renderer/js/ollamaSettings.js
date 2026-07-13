import { Icons } from './icons.js';

const STORAGE_KEY = 'av-editor-ollama';

const ELECTRON_DEFAULT_URL = 'http://127.0.0.1:11434';
const WEB_PROXY_URL = '/ollama';

function isWebRuntime() {
  return !!(typeof window !== 'undefined' && window.electronAPI?.isWeb);
}

/** Default Ollama base URL — web uses same-origin /ollama proxy (no CORS). */
export function getDefaultOllamaBaseUrl() {
  return isWebRuntime() ? WEB_PROXY_URL : ELECTRON_DEFAULT_URL;
}

const DEFAULTS = {
  baseUrl: ELECTRON_DEFAULT_URL,
  model: '',
  intervalSec: 2,
};

/** Heuristic: names that usually indicate a vision-language model. */
export function isLikelyVlmModel(name) {
  const n = String(name || '').toLowerCase();
  return /(?:^|[:\/_-])(vl|llava|bakllava|moondream|vision|minicpm-v|qwen2\.5-vl|qwen2-vl|qwen3-vl|gemma3|pixtral|internvl)/.test(n)
    || n.includes('llava')
    || n.includes('vision')
    || n.includes('-vl')
    || n.includes(':vl')
    || n.includes('moondream');
}

function normalizeStoredBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!isWebRuntime()) return raw || ELECTRON_DEFAULT_URL;
  // Migrate old direct localhost settings to the CORS-free proxy used by npm run web.
  if (!raw
    || raw === ELECTRON_DEFAULT_URL
    || raw === 'http://localhost:11434'
    || raw === 'http://127.0.0.1:11434/') {
    return WEB_PROXY_URL;
  }
  return raw;
}

export function loadOllamaSettings() {
  const baseDefault = getDefaultOllamaBaseUrl();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { baseUrl: baseDefault, model: '', intervalSec: DEFAULTS.intervalSec };
    }
    const parsed = JSON.parse(raw);
    return {
      baseUrl: normalizeStoredBaseUrl(parsed.baseUrl || baseDefault),
      model: String(parsed.model || '').trim(),
      intervalSec: Math.max(0.5, Number(parsed.intervalSec) || DEFAULTS.intervalSec),
    };
  } catch {
    return { baseUrl: baseDefault, model: '', intervalSec: DEFAULTS.intervalSec };
  }
}

export function saveOllamaSettings(settings) {
  const next = {
    baseUrl: String(settings.baseUrl || getDefaultOllamaBaseUrl()).trim() || getDefaultOllamaBaseUrl(),
    model: String(settings.model || '').trim(),
    intervalSec: Math.max(0.5, Number(settings.intervalSec) || DEFAULTS.intervalSec),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Modal to configure Ollama URL + VLM model + sample interval.
 * @returns {Promise<object|null>} saved settings, or null if cancelled
 */
export function showOllamaSettingsDialog(i18n) {
  const t = (k) => i18n.t(k);
  const current = loadOllamaSettings();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay ollama-settings-overlay';
    overlay.tabIndex = -1;

    const card = document.createElement('div');
    card.className = 'custom-dialog-card ollama-settings-card';

    const webHint = isWebRuntime()
      ? `<p class="ollama-web-hint">${Icons.info}<span>${t('ollama.webProxyHint')}</span></p>`
      : '';

    card.innerHTML = `
      <div class="custom-dialog-title">${t('ollama.settingsTitle')}</div>
      <div class="ollama-settings-body">
        <p class="ollama-vlm-hint">${Icons.warning}<span>${t('ollama.vlmRequired')}</span></p>
        ${webHint}
        <label class="ollama-field">
          <span>${t('ollama.baseUrl')}</span>
          <input type="text" id="ollama-base-url" value="${escapeAttr(current.baseUrl)}" placeholder="${escapeAttr(getDefaultOllamaBaseUrl())}"/>
        </label>
        <label class="ollama-field">
          <span>${t('ollama.model')}</span>
          <div class="ollama-model-row">
            <select id="ollama-model"></select>
            <button type="button" class="custom-dialog-btn" id="ollama-refresh-models" title="${t('ollama.refreshModels')}">${Icons.refresh}</button>
          </div>
        </label>
        <label class="ollama-field">
          <span>${t('ollama.intervalSec')}</span>
          <input type="number" id="ollama-interval" min="0.5" max="60" step="0.5" value="${current.intervalSec}"/>
        </label>
        <div class="ollama-status" id="ollama-status" aria-live="polite"></div>
      </div>
      <div class="custom-dialog-footer">
        <button type="button" class="custom-dialog-btn" id="ollama-test">${Icons.search}<span>${t('ollama.testConnection')}</span></button>
        <button type="button" class="custom-dialog-btn" id="ollama-cancel">${Icons.close}<span>${t('dialog.cancel')}</span></button>
        <button type="button" class="custom-dialog-btn primary" id="ollama-save">${Icons.check}<span>${t('dialog.ok')}</span></button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const baseInput = card.querySelector('#ollama-base-url');
    const modelSelect = card.querySelector('#ollama-model');
    const intervalInput = card.querySelector('#ollama-interval');
    const statusEl = card.querySelector('#ollama-status');

    const setStatus = (text, kind = '') => {
      statusEl.textContent = text || '';
      statusEl.dataset.kind = kind;
    };

    const fillModels = (models, preferred) => {
      modelSelect.innerHTML = '';
      const list = Array.isArray(models) ? models : [];
      if (!list.length) {
        const opt = document.createElement('option');
        opt.value = preferred || '';
        opt.textContent = preferred || t('ollama.noModels');
        modelSelect.appendChild(opt);
        return;
      }
      const sorted = [...list].sort((a, b) => {
        const av = isLikelyVlmModel(a.name) ? 0 : 1;
        const bv = isLikelyVlmModel(b.name) ? 0 : 1;
        if (av !== bv) return av - bv;
        return String(a.name).localeCompare(String(b.name));
      });
      for (const m of sorted) {
        const opt = document.createElement('option');
        opt.value = m.name;
        const vlm = isLikelyVlmModel(m.name);
        opt.textContent = vlm ? `${m.name}  ★ VLM` : m.name;
        if (vlm) opt.dataset.vlm = '1';
        modelSelect.appendChild(opt);
      }
      const pick = preferred && sorted.some((m) => m.name === preferred)
        ? preferred
        : (sorted.find((m) => isLikelyVlmModel(m.name))?.name || sorted[0].name);
      modelSelect.value = pick;
    };

    const refreshModels = async () => {
      setStatus(t('ollama.connecting'), 'info');
      const api = window.electronAPI;
      if (!api?.ollamaListModels) {
        setStatus(t('ollama.unavailable'), 'error');
        return;
      }
      const res = await api.ollamaListModels(baseInput.value.trim());
      if (!res?.ok) {
        setStatus(res?.error || t('ollama.connectFailed'), 'error');
        fillModels([], current.model);
        return;
      }
      fillModels(res.models || [], modelSelect.value || current.model);
      const hasVlm = (res.models || []).some((m) => isLikelyVlmModel(m.name));
      setStatus(
        hasVlm ? t('ollama.connected') : t('ollama.connectedNoVlm'),
        hasVlm ? 'ok' : 'warn'
      );
    };

    fillModels(current.model ? [{ name: current.model }] : [], current.model);
    refreshModels();

    const close = (value) => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(value);
    };

    card.querySelector('#ollama-refresh-models').addEventListener('click', () => refreshModels());
    card.querySelector('#ollama-test').addEventListener('click', async () => {
      setStatus(t('ollama.connecting'), 'info');
      const res = await window.electronAPI?.ollamaPing?.(baseInput.value.trim());
      if (!res?.ok) {
        setStatus(res?.error || t('ollama.connectFailed'), 'error');
        return;
      }
      fillModels((res.models || []).map((name) => ({ name })), modelSelect.value || current.model);
      const hasVlm = (res.models || []).some((name) => isLikelyVlmModel(name));
      setStatus(
        hasVlm ? t('ollama.connected') : t('ollama.connectedNoVlm'),
        hasVlm ? 'ok' : 'warn'
      );
    });
    card.querySelector('#ollama-cancel').addEventListener('click', () => close(null));
    card.querySelector('#ollama-save').addEventListener('click', () => {
      const model = modelSelect.value.trim();
      if (!model) {
        setStatus(t('ollama.modelRequired'), 'error');
        return;
      }
      if (!isLikelyVlmModel(model)) {
        setStatus(t('ollama.vlmRecommended'), 'warn');
        // Allow save but warn — user may have a custom-named VLM.
      }
      const saved = saveOllamaSettings({
        baseUrl: baseInput.value.trim(),
        model,
        intervalSec: Number(intervalInput.value),
      });
      close(saved);
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
    });
    overlay.focus();
  });
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
