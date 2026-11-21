// The AI and model picker shown where the AI is used (the AI Compose panel and the AI song wizard):
// which AI writes (built-in · Claude · Ollama) and which of its models. A choice is saved in the
// settings at once, so Settings › AI, the panel, the wizard and the status bar always agree.
//   <select data-ai-pick="provider">  → settings.aiProvider
//   <select data-ai-pick="model">     → settings.aiModel (Claude) or settings.ollamaModel (Ollama)
//   [data-ai-refresh]                 → ask Ollama for its installed models
//   [data-ai-open-settings]           → Settings › AI
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { CLAUDE_MODELS, CUSTOM_MODEL, DEFAULT_OLLAMA_MODEL, claudeModelOf, providerFor } from '../music/ai.js';

export const PROVIDER_ICONS = { builtin: 'aiBuiltin', claude: 'aiClaude', ollama: 'aiLocal' };

/** "claude-opus-5-5 — 가장 좋음" … */
export function claudeModelLabel(model, t) {
  const note = { 'claude-opus-5-5': 'ai.model.best', 'claude-sonnet-5-5': 'ai.model.balanced', 'claude-haiku-5-5': 'ai.model.fast' }[model];
  return note ? `${model} — ${t(note)}` : model;
}

/** The model choices of a provider: [[value, label], …] and the chosen value. */
export function modelChoices(settings, t, provider = settings.aiProvider) {
  if (provider === 'claude') {
    const list = CLAUDE_MODELS.map((m) => [m, claudeModelLabel(m, t)]);
    const custom = String(settings.aiModelCustom ?? '').trim();
    list.push([CUSTOM_MODEL, custom ? `${custom} — ${t('ai.model.custom')}` : `${t('ai.model.other')}…`]);
    const current = settings.aiModel === CUSTOM_MODEL ? CUSTOM_MODEL : claudeModelOf(settings);
    return { list, current };
  }
  if (provider === 'ollama') {
    const current = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
    const names = [...new Set([current, ...(settings.ollamaModels ?? [])])];
    return { list: names.map((m) => [m, m]), current };
  }
  return { list: [], current: '' };
}

/** A one-line note under the picker: what will really write the song. */
function note(settings, t) {
  const chosen = settings.aiProvider;
  if (chosen === 'claude' && !settings.aiApiKey) return { level: 'warning', text: t('ai.pick.noKey') };
  if (chosen === 'claude' && settings.aiModel === CUSTOM_MODEL && !String(settings.aiModelCustom ?? '').trim()) return { level: 'warning', text: t('ai.pick.noCustom') };
  return { level: 'info', text: t(`ai.providerNote.${providerFor(settings)}`) };
}

/**
 * The picker HTML. settings: the app settings (with aiApiKey filled in). t: the translator.
 * Options: { compact } — the left panel's narrower form; { settingsAttr } — the attribute of the
 * button that opens Settings › AI (the panel uses data-command="aiSettings", the wizard an action).
 */
export function aiPickerHtml(settings, t, { settingsAttr = 'data-ai-open-settings', settingsTip = '', compact = false } = {}) {
  const chosen = ['builtin', 'claude', 'ollama'].includes(settings.aiProvider) ? settings.aiProvider : 'builtin';
  const { list, current } = modelChoices(settings, t, chosen);
  const { level, text } = note(settings, t);
  const option = (value, label, selected, glyph = '') => `<option value="${escapeHtml(value)}"${glyph ? ` data-icon="${glyph}"` : ''} ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const providerSelect = `<select data-ai-pick="provider" data-icon="${PROVIDER_ICONS[chosen]}" aria-label="${escapeHtml(t('ai.pick.provider'))}" title="${escapeHtml(t('ai.pick.providerTip'))}">${['builtin', 'claude', 'ollama'].map((p) => option(p, t(compact ? `ai.providerShort.${p}` : `ai.provider.${p}`), chosen, PROVIDER_ICONS[p])).join('')}</select>`;
  const modelSelect = chosen === 'builtin'
    ? `<span class="ai-pick-none muted">${escapeHtml(t('ai.pick.noModel'))}</span>`
    : `<select data-ai-pick="model" data-icon="aiModel" aria-label="${escapeHtml(t('ai.pick.model'))}" title="${escapeHtml(t('ai.pick.modelTip'))}">${list.map(([v, label]) => option(v, compact && chosen === 'claude' ? label.split(' — ')[0] : label, current)).join('')}</select>`;
  const refresh = chosen === 'ollama' ? `<button type="button" class="icon-button" data-ai-refresh data-action="ai-refresh" title="${escapeHtml(t('ai.pick.refresh'))}" aria-label="${escapeHtml(t('ai.pick.refresh'))}">${icon('refresh')}</button>` : '';
  const gear = `<button type="button" class="icon-button" ${settingsAttr} title="${escapeHtml(settingsTip || t('action.aiSettings'))}" aria-label="${escapeHtml(t('action.aiSettings'))}">${icon('gear')}</button>`;
  return `<div class="ai-picker ${chosen} ${compact ? 'compact' : ''}" data-ai-picker>
    <div class="ai-pick-row"><span class="ai-pick-label">${icon(PROVIDER_ICONS[chosen])}<span>${escapeHtml(t('ai.pick.provider'))}</span></span>${providerSelect}${gear}</div>
    <div class="ai-pick-row"><span class="ai-pick-label">${icon('aiModel')}<span>${escapeHtml(t('ai.pick.model'))}</span></span>${modelSelect}${refresh}</div>
    <p class="ai-pick-note ${level}">${icon(level === 'warning' ? 'warning' : 'info')}<span>${escapeHtml(text)}</span></p>
  </div>`;
}

/**
 * The settings patch for a picker change, or null. When "other model" is chosen without an id
 * the caller opens Settings › AI (returned as { openSettings: true }).
 */
export function pickPatch(target, settings) {
  const which = target?.dataset?.aiPick;
  if (which === 'provider') return { aiProvider: target.value };
  if (which !== 'model') return null;
  if (settings.aiProvider === 'ollama') return { ollamaModel: target.value };
  if (target.value === CUSTOM_MODEL && !String(settings.aiModelCustom ?? '').trim()) return { aiModel: CUSTOM_MODEL, openSettings: true };
  return { aiModel: target.value };
}
