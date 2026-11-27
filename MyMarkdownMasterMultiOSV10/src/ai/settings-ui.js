// The settings popup's AI tab: providers on the left, the chosen provider's form on the right, the shared
// options below. Uses the popup's own classes (.row / .row-label / .row-control, .switch-wrap, .button,
// .theme-row) so it looks like the other tabs. All its attributes are data-ai-*, so the popup's own
// click/change handlers (data-action, data-setting, data-toggle …) never see them.
//
//   aiSettingsHtml(ai, t) → HTML string of the tab
//   bindAiSettings(host, { get, set, t }) → { refresh(), destroy() }
//     host: the element the HTML was put in; get(): current settings.ai; set(nextAi): store it.
//     The tab redraws itself after structural changes (provider, show key, reset); text fields are stored
//     on `change` (when they lose focus) so typing is never interrupted.
import './texts.js';
import './ai-icons.js';
import { icon } from '../icons.js';
import { t as baseT } from '../i18n.js';
import { escapeHtml } from '../ui/dom.js';
import { PROVIDERS, providerById } from './providers.js';
import { AI_LIMITS, DEFAULT_CONTEXT, isConfigured, normalizeAiSettings, withProvider } from './settings.js';
import { aiModels, aiTest } from './client.js';

/** Per-provider UI state that survives redraws: loaded model lists, test results, key visibility. */
const uiState = { models: {}, test: {}, showKey: false, busy: {} };

const CONTEXT_ROWS = [
  ['note', 'aiNote', 'ai.ctx.note'],
  ['selection', 'aiSelection', 'ai.ctx.selection'],
  ['linked', 'aiLinked', 'ai.ctx.linked'],
  ['vaultSearch', 'aiSearch', 'ai.ctx.vaultSearch'],
];

const row = (glyph, label, control, title = label, cls = '') => `<div class="row ${cls}" title="${escapeHtml(title)}"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${control}</span></div>`;
const toggle = (key, label, glyph, checked) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-ai-context="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
const btn = (act, label, glyph, cls = 'small', attrs = '') => `<button type="button" class="button ${cls}" data-ai-set="${act}" title="${escapeHtml(label)}" ${attrs}>${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;

export function aiSettingsHtml(aiRaw, t = baseT) {
  const ai = normalizeAiSettings(aiRaw);
  const provider = providerById(ai.provider);
  const cfg = ai.providers[provider.id];
  const list = PROVIDERS.map((p) => {
    const active = p.id === ai.provider;
    const ok = isConfigured(ai, p.id);
    return `<button type="button" class="theme-row ai-provider-row ${active ? 'active' : ''}" role="radio" aria-checked="${active}" data-ai-provider="${p.id}" title="${escapeHtml(p.name)}${ok ? ` — ${escapeHtml(t('ai.settings.configured'))}` : ''}">
      ${icon(p.local ? 'aiServer' : 'aiRobot')}<span class="theme-name">${escapeHtml(p.name)}</span>${ok ? icon('check', 'icon check ai-configured') : ''}
    </button>`;
  }).join('');

  const models = [...new Set([...(uiState.models[provider.id] ?? []), ...provider.models])];
  const datalist = `<datalist id="ai-model-list">${models.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>`;
  const test = uiState.test[provider.id];
  const busy = uiState.busy[provider.id];
  const keyRow = provider.needsKey || provider.id === 'custom' || provider.id === 'lmstudio'
    ? row('aiKey', t('ai.settings.apiKey'), `
        <input type="${uiState.showKey ? 'text' : 'password'}" class="ai-key-input" data-ai-field="apiKey" value="${escapeHtml(cfg.apiKey)}" placeholder="${escapeHtml(provider.needsKey ? t('ai.settings.keyPlaceholder') : t('ai.settings.keyOptional'))}" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(t('ai.settings.apiKey'))}" />
        <button type="button" class="icon-button" data-ai-set="toggle-key" title="${escapeHtml(t(uiState.showKey ? 'ai.settings.hideKey' : 'ai.settings.showKey'))}" aria-label="${escapeHtml(t(uiState.showKey ? 'ai.settings.hideKey' : 'ai.settings.showKey'))}">${icon(uiState.showKey ? 'aiEyeOff' : 'aiEye')}</button>
        ${provider.keyUrl ? `<a class="button small" href="${escapeHtml(provider.keyUrl)}" target="_blank" rel="noopener noreferrer" data-ai-link="${escapeHtml(provider.keyUrl)}" title="${escapeHtml(provider.keyUrl)}">${icon('aiLink')}<span>${escapeHtml(t(provider.needsKey ? 'ai.settings.getKey' : 'ai.settings.download'))}</span></a>` : ''}`)
    : row('aiKey', t('ai.settings.apiKey'), `<span class="muted">${escapeHtml(t('ai.settings.noKeyNeeded'))}</span>${provider.keyUrl ? `<a class="button small" href="${escapeHtml(provider.keyUrl)}" target="_blank" rel="noopener noreferrer" data-ai-link="${escapeHtml(provider.keyUrl)}">${icon('aiLink')}<span>${escapeHtml(t('ai.settings.download'))}</span></a>` : ''}`);
  const isAzure = provider.kind === 'azure';
  const form = [
    `<div class="row col-row ai-form-title"><span class="row-label">${icon(provider.local ? 'aiServer' : 'aiRobot')}<b>${escapeHtml(provider.name)}</b></span><span class="row-control">${ai.provider === provider.id ? `<span class="badge ok">${icon('check')}${escapeHtml(t('ai.settings.active'))}</span>` : ''}</span></div>`,
    keyRow,
    row('aiLink', t(isAzure ? 'ai.settings.endpoint' : 'ai.settings.baseUrl'), `
      <input type="text" data-ai-field="baseUrl" value="${escapeHtml(cfg.baseUrl)}" placeholder="${escapeHtml(provider.baseUrl || 'https://…/v1')}" spellcheck="false" aria-label="${escapeHtml(t('ai.settings.baseUrl'))}" />
      ${provider.baseUrl ? btn('reset-url', t('ai.settings.resetUrl'), 'aiReset', 'small', cfg.baseUrl === provider.baseUrl ? 'disabled' : '') : ''}`),
    row('aiModels', t(isAzure ? 'ai.settings.deployment' : 'ai.settings.model'), `
      <input type="text" data-ai-field="model" list="ai-model-list" data-icon="aiModels" value="${escapeHtml(cfg.model)}" placeholder="${escapeHtml(provider.defaultModel || t(isAzure ? 'ai.settings.deploymentPlaceholder' : 'ai.settings.modelPlaceholder'))}" spellcheck="false" aria-label="${escapeHtml(t('ai.settings.model'))}" />
      ${provider.modelsEndpoint ? btn('load-models', busy === 'models' ? t('ai.settings.loading') : t('ai.settings.loadModels'), 'aiModels', 'small', busy ? 'disabled' : '') : ''}
      ${datalist}`),
    uiState.models[provider.id] ? row('info', '', `<span class="muted">${escapeHtml(t('ai.settings.modelsLoaded', { count: uiState.models[provider.id].length }))}</span>`) : '',
    isAzure ? row('aiTokens', t('ai.settings.apiVersion'), `<input type="text" data-ai-field="apiVersion" value="${escapeHtml(cfg.apiVersion ?? '')}" placeholder="${escapeHtml(provider.apiVersion)}" spellcheck="false" aria-label="${escapeHtml(t('ai.settings.apiVersion'))}" />`) : '',
    row('aiPlug', t('ai.settings.test'), `${btn('test', busy === 'test' ? t('ai.settings.testing') : t('ai.settings.test'), 'aiPlug', 'small', busy ? 'disabled' : '')}
      <span class="ai-test-result ${test ? (test.ok ? 'ok' : 'fail') : ''}" title="${escapeHtml(test?.message ?? '')}">${test ? `${icon(test.ok ? 'check' : 'warning')}<span>${escapeHtml(test.message)}</span>` : ''}</span>`),
    provider.local ? row('info', '', `<span class="muted ai-wrap">${escapeHtml(t(provider.id === 'ollama' ? 'ai.settings.ollamaHint' : 'ai.settings.lmstudioHint'))}</span>`) : '',
    row('lock', '', `<span class="muted ai-wrap">${escapeHtml(t('ai.settings.keyNote'))}</span>`),
  ].join('');

  const temp = ai.temperature;
  const shared = [
    `<div class="row col-row ai-section-title"><span class="row-label">${icon('aiSettings')}<b>${escapeHtml(t('ai.settings.options'))}</b></span></div>`,
    row('aiTemp', t('ai.settings.temperature'), `<input type="range" data-ai-number="temperature" min="${AI_LIMITS.temperature.min}" max="${AI_LIMITS.temperature.max}" step="${AI_LIMITS.temperature.step}" value="${temp}" aria-label="${escapeHtml(t('ai.settings.temperature'))}" /><output class="ai-range-value">${temp.toFixed(1)}</output>${provider.kind === 'anthropic' ? `<span class="muted small" title="${escapeHtml(t('ai.settings.tempIgnored'))}">${icon('info')}</span>` : ''}`, t('ai.settings.temperatureTip')),
    row('aiTokens', t('ai.settings.maxTokens'), `<input type="number" class="ai-number" data-ai-number="maxTokens" min="${AI_LIMITS.maxTokens.min}" max="${AI_LIMITS.maxTokens.max}" step="256" value="${ai.maxTokens}" aria-label="${escapeHtml(t('ai.settings.maxTokens'))}" />`),
    row('aiHistory', t('ai.settings.historyLimit'), `<input type="number" class="ai-number" data-ai-number="chatHistoryLimit" min="${AI_LIMITS.chatHistoryLimit.min}" max="${AI_LIMITS.chatHistoryLimit.max}" step="10" value="${ai.chatHistoryLimit}" aria-label="${escapeHtml(t('ai.settings.historyLimit'))}" /><span class="muted">${escapeHtml(t('ai.settings.historyUnit'))}</span>`),
    `<div class="row ai-prompt-row" title="${escapeHtml(t('ai.settings.systemPrompt'))}"><span class="row-label">${icon('aiPrompt')}<span>${escapeHtml(t('ai.settings.systemPrompt'))}</span></span>
      <span class="row-control"><textarea data-ai-field-shared="systemPrompt" rows="3" placeholder="${escapeHtml(t('ai.systemDefault'))}" aria-label="${escapeHtml(t('ai.settings.systemPrompt'))}">${escapeHtml(ai.systemPrompt)}</textarea></span></div>`,
    `<div class="row col-row ai-section-title"><span class="row-label">${icon('aiSpark')}<b>${escapeHtml(t('ai.settings.context'))}</b></span></div>`,
    ...CONTEXT_ROWS.map(([key, glyph, label]) => toggle(key, t(label), glyph, ai.context[key] ?? DEFAULT_CONTEXT[key])),
  ].join('');

  return `<div class="ai-settings" data-ai-settings>
    <div class="ai-settings-top">
      <div class="ai-provider-list" role="radiogroup" aria-label="${escapeHtml(t('ai.settings.providers'))}">${list}</div>
      <div class="ai-provider-form">${form}<div class="ai-settings-shared">${shared}</div></div>
    </div>
  </div>`;
}

const bound = new WeakMap();

export function bindAiSettings(host, { get, set, t = baseT } = {}) {
  if (bound.has(host)) bound.get(host).destroy();
  const read = () => normalizeAiSettings(get?.());
  let destroyed = false;
  const redraw = () => {
    if (destroyed) return;
    const scroll = host.scrollTop;
    const focusKey = document.activeElement?.dataset?.aiField ?? null;
    host.innerHTML = aiSettingsHtml(read(), t);
    host.scrollTop = scroll;
    if (focusKey) host.querySelector(`[data-ai-field="${focusKey}"]`)?.focus();
  };
  const store = (next, { draw = false } = {}) => {
    set?.(normalizeAiSettings(next));
    if (draw) redraw();
  };
  const currentId = () => read().provider;

  const onClick = async (event) => {
    const providerRow = event.target.closest('[data-ai-provider]');
    if (providerRow && host.contains(providerRow)) {
      const ai = read();
      ai.provider = providerRow.dataset.aiProvider;
      store(ai, { draw: true });
      return;
    }
    const link = event.target.closest('[data-ai-link]');
    if (link && host.contains(link)) return; // a plain link: the app opens external links
    const target = event.target.closest('[data-ai-set]');
    if (!target || target.disabled || !host.contains(target)) return;
    const id = currentId();
    const provider = providerById(id);
    switch (target.dataset.aiSet) {
      case 'toggle-key': uiState.showKey = !uiState.showKey; redraw(); break;
      case 'reset-url': store(withProvider(read(), id, { baseUrl: provider.baseUrl }), { draw: true }); break;
      case 'load-models': {
        commitFields();
        uiState.busy[id] = 'models';
        redraw();
        try {
          uiState.models[id] = await aiModels(read(), id);
          uiState.test[id] = { ok: true, message: t('ai.settings.modelsLoaded', { count: uiState.models[id].length }) };
        } catch (error) {
          uiState.test[id] = { ok: false, message: error?.message ?? String(error) };
        }
        uiState.busy[id] = null;
        redraw();
        break;
      }
      case 'test': {
        commitFields();
        uiState.busy[id] = 'test';
        uiState.test[id] = { ok: true, message: t('ai.settings.testing') };
        redraw();
        uiState.test[id] = await aiTest(read(), id);
        uiState.busy[id] = null;
        redraw();
        break;
      }
      default: break;
    }
  };

  /** Stores the text fields now (Load models / Test run before the field lost focus). */
  function commitFields() {
    let ai = read();
    const id = ai.provider;
    const patch = {};
    for (const input of host.querySelectorAll('[data-ai-field]')) patch[input.dataset.aiField] = input.value.trim();
    ai = withProvider(ai, id, patch);
    set?.(ai);
  }

  const onChange = (event) => {
    const target = event.target;
    if (!host.contains(target)) return;
    if (target.dataset.aiField) {
      const ai = read();
      const id = ai.provider;
      const value = target.value.trim();
      const before = isConfigured(ai, id);
      const next = withProvider(ai, id, { [target.dataset.aiField]: value });
      // Redraw only when the check mark changes (not while the user moves on to the next field).
      store(next, { draw: before !== isConfigured(next, id) });
      return;
    }
    if (target.dataset.aiFieldShared) { store({ ...read(), [target.dataset.aiFieldShared]: target.value }); return; }
    if (target.dataset.aiNumber) {
      const next = { ...read(), [target.dataset.aiNumber]: Number(target.value) };
      store(next);
      const normal = normalizeAiSettings(next)[target.dataset.aiNumber];
      if (target.type === 'number' && Number(target.value) !== normal) target.value = normal;
      return;
    }
    if (target.dataset.aiContext) {
      const ai = read();
      store({ ...ai, context: { ...ai.context, [target.dataset.aiContext]: target.checked } });
    }
  };

  const onInput = (event) => {
    const target = event.target;
    if (target.dataset?.aiNumber === 'temperature') {
      const out = target.parentElement.querySelector('.ai-range-value');
      if (out) out.textContent = Number(target.value).toFixed(1);
    }
  };

  // Enter in a text field stores it (the popup's own Enter handling only acts on prompt popups).
  const onKeydown = (event) => {
    if (event.key === 'Enter' && event.target.matches?.('[data-ai-field]') && !event.isComposing) {
      event.preventDefault();
      event.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('input', onInput);
  host.addEventListener('keydown', onKeydown);
  if (!host.querySelector('[data-ai-settings]')) redraw();

  const handle = {
    refresh: redraw,
    destroy() {
      destroyed = true;
      host.removeEventListener('click', onClick);
      host.removeEventListener('change', onChange);
      host.removeEventListener('input', onInput);
      host.removeEventListener('keydown', onKeydown);
      bound.delete(host);
    },
  };
  bound.set(host, handle);
  return handle;
}
