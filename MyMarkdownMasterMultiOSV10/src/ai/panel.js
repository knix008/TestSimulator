// The AI chat side panel: provider/model, conversation with streamed Markdown answers, buttons that put
// an answer into the note, context chips (note, selection, linked notes, vault search), history per vault.
//
// createAiPanel(host, api) → { refresh(), focus(), ask(text, { action, autoApply }), destroy() }
// `api` (supplied by the app): see the comment at the end of this file.
import './texts.js';
import './ai-icons.js';
import { icon } from '../icons.js';
import { getLanguage, t as baseT } from '../i18n.js';
import { escapeHtml } from '../ui/dom.js';
import { PROVIDERS, providerById } from './providers.js';
import { isConfigured, normalizeAiSettings } from './settings.js';
import { aiChat, defaultSystemPrompt } from './client.js';
import { AI_ACTIONS, aiActionById, applyResult, buildContextBlock } from './actions.js';

const CHIPS = [
  ['note', 'aiNote', 'ai.ctx.note'],
  ['selection', 'aiSelection', 'ai.ctx.selection'],
  ['linked', 'aiLinked', 'ai.ctx.linked'],
  ['vaultSearch', 'aiSearch', 'ai.ctx.vaultSearch'],
];
const WELCOME_ACTIONS = ['summarizeNote', 'continue', 'tags', 'title', 'actionItems', 'askVault'];
const APPLY_ICON = { replace: 'aiReplace', insertBelow: 'aiInsert', append: 'aiAppend', properties: 'aiTag' };
const RENDER_EVERY = 120; // ms between Markdown renders while an answer streams in

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const call = async (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);

export function createAiPanel(host, api = {}) {
  const t = (key, params) => (api.t ?? baseT)(key, params);
  const state = {
    conversations: [],
    currentId: null,
    view: 'chat', // chat | history
    actionsOpen: false,
    context: null, // chip states for this panel (start from settings.context)
    override: null, // { provider, model } when the app gives no saveAiSettings
    streaming: null, // { controller, message, conversation }
    loaded: false,
  };
  let destroyed = false;

  // aiSettings() must answer synchronously (the panel reads it on every render).
  const effective = () => {
    const ai = normalizeAiSettings(safe(() => api.aiSettings?.()));
    if (state.override?.provider && providerById(state.override.provider)) ai.provider = state.override.provider;
    if (state.override?.model) ai.providers[ai.provider].model = state.override.model;
    return ai;
  };
  const context = () => (state.context ??= { ...effective().context });
  const current = () => state.conversations.find((c) => c.id === state.currentId) ?? null;

  host.classList.add('ai-host');
  host.innerHTML = `<div class="ai-panel" data-ai-panel>
    <div class="ai-head"></div>
    <div class="ai-body" role="log" aria-live="polite"></div>
    <div class="ai-composer"></div>
  </div>`;
  const el = {
    head: host.querySelector('.ai-head'),
    body: host.querySelector('.ai-body'),
    composer: host.querySelector('.ai-composer'),
  };

  // ───────────────────────── history

  async function loadHistory() {
    try {
      const list = await call(api.loadHistory);
      state.conversations = Array.isArray(list) ? list.filter((c) => c && Array.isArray(c.messages)) : [];
    } catch { state.conversations = []; }
    state.currentId = null;
    state.loaded = true;
  }

  let saveTimer = null;
  function saveHistory() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const limit = effective().chatHistoryLimit;
      const list = limit <= 0 ? [] : state.conversations
        .filter((c) => c.messages.length)
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
        .slice(0, limit)
        .map((c) => ({ ...c, messages: c.messages.map(({ pending, ...m }) => m) }));
      Promise.resolve(call(api.saveHistory, list)).catch(() => {});
    }, 300);
  }

  function newConversation() {
    const ai = effective();
    const conversation = { id: uid(), title: '', at: Date.now(), provider: ai.provider, model: ai.providers[ai.provider].model, messages: [] };
    state.conversations.unshift(conversation);
    state.currentId = conversation.id;
    return conversation;
  }

  // ───────────────────────── rendering

  function renderHead() {
    const ai = effective();
    const provider = providerById(ai.provider);
    const cfg = ai.providers[ai.provider];
    const models = [...new Set([cfg.model, ...(provider.models ?? [])].filter(Boolean))];
    const providerOptions = PROVIDERS.map((p) => `<option value="${p.id}" data-icon="${isConfigured(ai, p.id) ? 'aiApply' : 'aiRobot'}" ${p.id === ai.provider ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    const modelOptions = models.length
      ? models.map((m) => `<option value="${escapeHtml(m)}" ${m === cfg.model ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')
      : `<option value="">${escapeHtml(t('ai.noModel'))}</option>`;
    el.head.innerHTML = `
      <div class="ai-head-row">
        <span class="ai-title">${icon('aiSpark')}<span>${escapeHtml(t('ai.title'))}</span></span>
        <span class="ai-grow"></span>
        <button class="icon-button" data-ai="new" title="${escapeHtml(t('ai.newChat'))}" aria-label="${escapeHtml(t('ai.newChat'))}">${icon('aiNewChat')}</button>
        <button class="icon-button ${state.view === 'history' ? 'active' : ''}" data-ai="history" title="${escapeHtml(t('ai.history'))}" aria-label="${escapeHtml(t('ai.history'))}" aria-pressed="${state.view === 'history'}">${icon('aiHistory')}</button>
        <button class="icon-button" data-ai="settings" title="${escapeHtml(t('ai.settings'))}" aria-label="${escapeHtml(t('ai.settings'))}">${icon('aiSettings')}</button>
      </div>
      <div class="ai-head-row ai-pickers">
        <select class="ai-provider" data-ai-select="provider" data-icon="aiRobot" title="${escapeHtml(t('ai.provider'))}" aria-label="${escapeHtml(t('ai.provider'))}" ${state.streaming ? 'disabled' : ''}>${providerOptions}</select>
        <select class="ai-model" data-ai-select="model" data-icon="aiModels" title="${escapeHtml(t('ai.model'))}" aria-label="${escapeHtml(t('ai.model'))}" ${state.streaming ? 'disabled' : ''}>${modelOptions}</select>
      </div>`;
  }

  function renderComposer() {
    const ai = effective();
    const ready = isConfigured(ai);
    const ctx = context();
    const note = safe(() => api.activeNote?.());
    const selection = String(safe(() => api.selection?.()) ?? '');
    const chipNote = (id) => {
      if (id === 'note') return note ? note.title || note.path : t('ai.ctx.noNote');
      if (id === 'selection') return selection.trim() ? t('ai.ctx.chars', { count: selection.length }) : t('ai.ctx.noSelection');
      if (id === 'linked') return t('ai.ctx.linkedHint');
      return t('ai.ctx.vaultHint');
    };
    const chips = CHIPS.map(([id, glyph, key]) => {
      const on = Boolean(ctx[id]);
      const tip = `${t(key)} — ${chipNote(id)}`;
      return `<button class="ai-chip ${on ? 'on' : ''}" data-ai-chip="${id}" aria-pressed="${on}" title="${escapeHtml(tip)}">${icon(glyph)}<span>${escapeHtml(t(key))}</span></button>`;
    }).join('');
    const streaming = Boolean(state.streaming);
    const actionsMenu = state.actionsOpen ? `<div class="ai-actions-menu" role="menu">${AI_ACTIONS.map((a) => {
      const off = a.needsSelection && !selection.trim();
      return `<button class="ai-menu-item" role="menuitem" data-ai-action="${a.id}" ${off ? 'disabled' : ''} title="${escapeHtml(off ? t('ai.needsSelection') : t(a.labelKey))}">${icon(a.icon)}<span>${escapeHtml(t(a.labelKey))}</span>${a.needsSelection ? `<small>${escapeHtml(t('ai.ctx.selection'))}</small>` : ''}</button>`;
    }).join('')}</div>` : '';
    const draft = el.composer.querySelector('textarea')?.value ?? '';
    el.composer.innerHTML = `
      <div class="ai-chips" role="group" aria-label="${escapeHtml(t('ai.ctx.title'))}">${chips}</div>
      <div class="ai-input-wrap">
        <textarea class="ai-input" rows="2" placeholder="${escapeHtml(ready ? t('ai.placeholder') : t('ai.placeholderOff'))}" aria-label="${escapeHtml(t('ai.placeholder'))}" ${ready ? '' : 'disabled'}>${escapeHtml(draft)}</textarea>
      </div>
      <div class="ai-composer-foot">
        <button class="button small ${state.actionsOpen ? 'primary' : ''}" data-ai="actions" aria-expanded="${state.actionsOpen}" title="${escapeHtml(t('ai.actions'))}" ${ready && !streaming ? '' : 'disabled'}>${icon('aiActions')}<span>${escapeHtml(t('ai.actions'))}</span></button>
        <span class="ai-grow"></span>
        <span class="ai-status muted">${escapeHtml(streaming ? t('ai.streaming') : '')}</span>
        ${streaming
          ? `<button class="button small danger" data-ai="stop" title="${escapeHtml(t('ai.stop'))}">${icon('aiStop')}<span>${escapeHtml(t('ai.stop'))}</span></button>`
          : `<button class="button small primary" data-ai="send" title="${escapeHtml(t('ai.sendTip'))}" ${ready ? '' : 'disabled'}>${icon('aiSend')}<span>${escapeHtml(t('ai.send'))}</span></button>`}
      </div>
      ${actionsMenu}`;
    autosize();
  }

  function messageHtml(message, conversation) {
    const isUser = message.role === 'user';
    const action = message.actionId ? aiActionById(message.actionId) : null;
    const last = conversation.messages[conversation.messages.length - 1] === message;
    const buttons = [];
    const btn = (act, glyph, key, cls = '') => `<button class="icon-button ${cls}" data-ai-msg="${act}" data-id="${message.id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
    if (!message.pending && !message.error) {
      buttons.push(btn('copy', 'aiCopy', 'ai.copy'));
      if (!isUser) {
        const applyKind = message.apply;
        if (applyKind && applyKind !== 'chat') buttons.unshift(`<button class="button small primary" data-ai-msg="apply" data-id="${message.id}" title="${escapeHtml(t(`ai.apply.${applyKind}`))}">${icon(APPLY_ICON[applyKind] ?? 'aiApply')}<span>${escapeHtml(t(`ai.apply.${applyKind}`))}</span></button>`);
        buttons.push(btn('insert', 'aiInsert', 'ai.insert'), btn('replace', 'aiReplace', 'ai.replace'), btn('append', 'aiAppend', 'ai.append'), btn('newNote', 'aiNewNote', 'ai.newNote'));
      }
    }
    if (!isUser && last && !message.pending && !state.streaming) buttons.push(btn('retry', 'aiRetry', 'ai.retry'));
    if (!message.pending) buttons.push(btn('delete', 'aiTrash', 'ai.delete', 'danger'));
    const label = isUser && action ? `<span class="ai-msg-action">${icon(action.icon)}${escapeHtml(t(action.labelKey))}</span>` : '';
    const userText = isUser ? (action ? (message.display ?? '') : message.content) : '';
    const body = isUser
      ? `${label}${userText ? `<div class="ai-msg-text">${escapeHtml(userText)}</div>` : ''}`
      : message.error
        ? `<div class="ai-msg-error">${icon('warning')}<span>${escapeHtml(message.error)}</span></div>`
        : `<div class="ai-msg-md markdown-body" data-md="${message.id}"></div>${message.pending && !message.content ? `<div class="ai-typing" aria-label="${escapeHtml(t('ai.streaming'))}"><i></i><i></i><i></i></div>` : ''}${message.stopped ? `<div class="ai-msg-note muted">${escapeHtml(t('ai.stopped'))}</div>` : ''}`;
    const meta = !isUser && message.model ? `<span class="ai-msg-meta muted" title="${escapeHtml(message.model)}">${escapeHtml(message.model)}</span>` : '';
    return `<div class="ai-msg ${isUser ? 'user' : 'assistant'} ${message.error ? 'error' : ''}" data-msg="${message.id}">
      <div class="ai-bubble">${body}</div>
      <div class="ai-msg-tools">${meta}<span class="ai-grow"></span>${buttons.join('')}</div>
    </div>`;
  }

  function emptyHtml() {
    const ai = effective();
    const provider = providerById(ai.provider);
    if (!isConfigured(ai)) {
      return `<div class="ai-empty">
        <div class="ai-empty-icon">${icon('aiKey')}</div>
        <div class="ai-empty-title">${escapeHtml(t('ai.empty.title'))}</div>
        <div class="ai-empty-text muted">${escapeHtml(t(provider.needsKey ? 'ai.empty.noKey' : 'ai.empty.noModel', { provider: provider.name }))}</div>
        <button class="button primary" data-ai="settings">${icon('aiSettings')}<span>${escapeHtml(t('ai.openSettings'))}</span></button>
        <div class="ai-empty-text muted small">${escapeHtml(t('ai.empty.keyLocal'))}</div>
      </div>`;
    }
    return `<div class="ai-empty">
      <div class="ai-empty-icon">${icon('aiSpark')}</div>
      <div class="ai-empty-title">${escapeHtml(t('ai.welcome'))}</div>
      <div class="ai-empty-text muted">${escapeHtml(t('ai.welcomeHint'))}</div>
      <div class="ai-quick">${WELCOME_ACTIONS.map((id) => aiActionById(id)).map((a) => `<button class="button small" data-ai-action="${a.id}" title="${escapeHtml(t(a.labelKey))}">${icon(a.icon)}<span>${escapeHtml(t(a.labelKey))}</span></button>`).join('')}</div>
    </div>`;
  }

  function historyHtml() {
    const list = state.conversations.filter((c) => c.messages.length).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    if (!list.length) return `<div class="ai-empty"><div class="ai-empty-icon">${icon('aiHistory')}</div><div class="ai-empty-text muted">${escapeHtml(t('ai.noHistory'))}</div></div>`;
    const date = (at) => { try { return new Date(at).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'ko-KR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
    return `<div class="ai-history-head"><span class="muted">${escapeHtml(t('ai.historyCount', { count: list.length }))}</span><span class="ai-grow"></span>
      <button class="button small danger" data-ai="clear-history" title="${escapeHtml(t('ai.clearHistory'))}">${icon('aiTrash')}<span>${escapeHtml(t('ai.clearHistory'))}</span></button></div>
      <div class="ai-history-list">${list.map((c) => `<div class="ai-history-row ${c.id === state.currentId ? 'active' : ''}" data-ai-open="${c.id}" role="button" tabindex="0" title="${escapeHtml(c.title || t('ai.untitled'))}">
        ${icon('aiChat')}<span class="ai-history-title">${escapeHtml(c.title || t('ai.untitled'))}</span>
        <span class="ai-history-meta muted">${escapeHtml(date(c.at))} · ${c.messages.length}</span>
        <button class="icon-button danger" data-ai-delete-chat="${c.id}" title="${escapeHtml(t('ai.delete'))}" aria-label="${escapeHtml(t('ai.delete'))}">${icon('aiTrash')}</button>
      </div>`).join('')}</div>`;
  }

  function renderBody() {
    if (state.view === 'history') { el.body.innerHTML = historyHtml(); return; }
    const conversation = current();
    if (!conversation || !conversation.messages.length || !isConfigured(effective())) {
      el.body.innerHTML = emptyHtml();
      return;
    }
    el.body.innerHTML = conversation.messages.map((m) => messageHtml(m, conversation)).join('');
    for (const message of conversation.messages) if (message.role === 'assistant' && !message.error) renderMarkdownOf(message);
    scrollToEnd(true);
  }

  function render() {
    if (destroyed) return;
    renderHead();
    renderBody();
    renderComposer();
  }

  function renderMarkdownOf(message) {
    const target = el.body.querySelector(`[data-md="${message.id}"]`);
    if (!target) return;
    const text = message.content ?? '';
    const sourcePath = safe(() => api.activeNote?.())?.path ?? '';
    if (typeof api.renderMarkdown === 'function') {
      try {
        const result = api.renderMarkdown(text, target, sourcePath);
        if (result && typeof result.then === 'function') result.catch(() => { target.textContent = text; });
      } catch { target.textContent = text; }
    } else {
      target.textContent = text;
    }
  }

  /** Replaces one message's DOM (after it finished or failed). */
  function updateMessage(message) {
    const conversation = current();
    const node = el.body.querySelector(`[data-msg="${message.id}"]`);
    if (!conversation || !node) return renderBody();
    const wrap = document.createElement('div');
    wrap.innerHTML = messageHtml(message, conversation);
    node.replaceWith(wrap.firstElementChild);
    if (message.role === 'assistant' && !message.error) renderMarkdownOf(message);
    // The previous assistant message may lose its retry button.
    for (const other of conversation.messages) {
      if (other !== message && other.role === 'assistant' && el.body.querySelector(`[data-msg="${other.id}"] [data-ai-msg="retry"]`)) {
        const old = el.body.querySelector(`[data-msg="${other.id}"]`);
        const w = document.createElement('div');
        w.innerHTML = messageHtml(other, conversation);
        old.replaceWith(w.firstElementChild);
        renderMarkdownOf(other);
      }
    }
    return undefined;
  }

  function nearBottom() {
    return el.body.scrollHeight - el.body.scrollTop - el.body.clientHeight < 80;
  }
  function scrollToEnd(force = false) {
    if (force || nearBottom()) el.body.scrollTop = el.body.scrollHeight;
  }

  function autosize() {
    const area = el.composer.querySelector('textarea');
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight + 2, 200)}px`;
  }

  // ───────────────────────── sending

  function gatherContext(question, { skipNote = false } = {}) {
    const ctx = context();
    const parts = {};
    const tasks = [];
    if (ctx.note && !skipNote) parts.note = safe(() => api.activeNote?.()) ?? null;
    if (ctx.selection && !skipNote) parts.selection = String(safe(() => api.selection?.()) ?? '');
    if (ctx.linked) tasks.push(Promise.resolve(call(api.linkedNotes)).then((list) => { parts.linked = Array.isArray(list) ? list.slice(0, 8) : []; }).catch(() => {}));
    if (ctx.vaultSearch && question.trim()) tasks.push(Promise.resolve(call(api.searchVault, question, 6)).then((list) => { parts.search = Array.isArray(list) ? list : []; }).catch(() => {}));
    return Promise.all(tasks).then(() => buildContextBlock(parts));
  }

  /**
   * Sends a question (or an action). `action`: an AI_ACTIONS id or object. `autoApply`: put the answer
   * into the note when it is done (for actions whose apply is not 'chat').
   */
  async function ask(text = '', { action = null, autoApply = false } = {}) {
    if (destroyed) return null;
    const ai = effective();
    if (!isConfigured(ai)) { render(); call(api.notify, 'warning', t('ai.empty.title')); return null; }
    if (state.streaming) stop();
    const act = typeof action === 'string' ? aiActionById(action) : action;
    const note = safe(() => api.activeNote?.()) ?? null;
    const selection = String(safe(() => api.selection?.()) ?? '');
    if (act?.needsSelection && !selection.trim()) { call(api.notify, 'warning', t('ai.needsSelection')); return null; }
    if (act && !act.vault && !act.needsSelection && !note) { call(api.notify, 'warning', t('ai.needsNote')); return null; }
    const question = String(text ?? '').trim();
    if (!act && !question) return null;

    state.view = 'chat';
    state.actionsOpen = false;
    let conversation = current();
    if (!conversation) conversation = newConversation();
    const content = act ? act.prompt({ selection, note: note?.text ?? '', title: note?.title ?? '', language: getLanguage(), question }) : question;
    const userMessage = { id: uid(), role: 'user', content, at: Date.now(), ...(act ? { actionId: act.id, display: act.vault ? question : '' } : {}) };
    if (!conversation.title) conversation.title = (act ? t(act.labelKey) + (question ? `: ${question}` : '') : question).slice(0, 80);
    conversation.messages.push(userMessage);
    const answer = { id: uid(), role: 'assistant', content: '', at: Date.now(), pending: true, model: ai.providers[ai.provider].model, provider: ai.provider, ...(act ? { actionId: act.id, apply: act.apply } : {}) };
    conversation.messages.push(answer);
    conversation.at = Date.now();
    conversation.provider = ai.provider;
    conversation.model = answer.model;
    const area = el.composer.querySelector('textarea');
    if (area && !act) area.value = '';
    return run(conversation, answer, { act, autoApply, question, applyCtx: { selection, note } });
  }

  async function run(conversation, answer, { act = null, autoApply = false, question = '', applyCtx = {} } = {}) {
    const ai = effective();
    const controller = new AbortController();
    state.streaming = { controller, message: answer, conversation };
    render();
    const contextBlock = await gatherContext(question || lastUserText(conversation), { skipNote: Boolean(act && !act.vault) });
    const base = ai.systemPrompt.trim() || defaultSystemPrompt();
    const system = contextBlock ? `${base}\n\n${contextBlock}` : base;
    const history = conversation.messages
      .filter((m) => m !== answer && !m.error && !m.pending && String(m.content ?? '').trim())
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content }));
    let lastRender = 0;
    let timer = null;
    const paint = () => {
      timer = null;
      lastRender = Date.now();
      const stick = nearBottom();
      const node = el.body.querySelector(`[data-msg="${answer.id}"] .ai-typing`);
      node?.remove();
      renderMarkdownOf(answer);
      if (stick) scrollToEnd(true);
    };
    try {
      const full = await aiChat({
        settings: ai, system, messages: history, signal: controller.signal,
        onDelta: (delta, all) => {
          answer.content = all ?? answer.content + delta;
          if (timer) return;
          const wait = Math.max(0, RENDER_EVERY - (Date.now() - lastRender));
          timer = setTimeout(paint, wait);
        },
      });
      answer.content = full || answer.content;
      if (!answer.content.trim()) answer.error = t('ai.error.empty');
    } catch (error) {
      if (error?.name === 'AbortError') answer.stopped = true;
      else answer.error = error?.message ?? String(error);
    } finally {
      clearTimeout(timer);
      answer.pending = false;
      answer.at = Date.now();
      if (state.streaming?.message === answer) state.streaming = null;
    }
    if (destroyed) return answer.content;
    if (answer.stopped && !answer.content) conversation.messages.splice(conversation.messages.indexOf(answer), 1);
    if (state.currentId === conversation.id && state.view === 'chat') { updateMessage(answer); renderHead(); renderComposer(); scrollToEnd(); }
    saveHistory();
    if (!answer.error && answer.content && act && autoApply && act.apply !== 'chat') await applyAnswer(answer, applyCtx);
    return answer.error ? null : answer.content;
  }

  const lastUserText = (conversation) => [...conversation.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  function stop() {
    state.streaming?.controller.abort();
  }

  async function sendInput() {
    const area = el.composer.querySelector('textarea');
    const text = area?.value ?? '';
    if (!text.trim() || state.streaming) return;
    await ask(text);
  }

  // ───────────────────────── answer buttons

  async function applyAnswer(message, ctx = {}) {
    const action = aiActionById(message.actionId) ?? { apply: 'chat' };
    const note = ctx.note ?? safe(() => api.activeNote?.());
    const result = applyResult(action, message.content, { existingTags: ctx.existingTags ?? safe(() => api.noteTags?.()) ?? [] });
    try {
      if (result.kind === 'replace') await call(api.replaceSelection, result.text);
      else if (result.kind === 'insertBelow') await (api.insertBelow ? call(api.insertBelow, result.text) : call(api.insertText, result.text));
      else if (result.kind === 'append') await call(api.appendToNote, result.text);
      else if (result.kind === 'properties') {
        if (api.setNoteTags) await call(api.setNoteTags, result.tags);
        else await call(api.insertText, result.text);
      } else return;
      call(api.notify, 'success', t(result.kind === 'properties' ? 'ai.tagsApplied' : 'ai.applied', { count: result.tags?.length ?? 0, title: note?.title ?? '' }));
    } catch (error) {
      call(api.notify, 'error', error?.message ?? String(error));
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    call(api.notify, 'success', t('ai.copied'));
  }

  async function messageAction(act, id) {
    const conversation = current();
    const message = conversation?.messages.find((m) => m.id === id);
    if (!message) return;
    const text = message.role === 'user' && message.actionId ? (message.display || message.content) : message.content;
    try {
      switch (act) {
        case 'copy': return copyText(text);
        case 'insert': await call(api.insertText, text); return call(api.notify, 'success', t('ai.inserted'));
        case 'replace': await call(api.replaceSelection, text); return call(api.notify, 'success', t('ai.replaced'));
        case 'append': await call(api.appendToNote, `\n\n${text}\n`); return call(api.notify, 'success', t('ai.appended'));
        case 'newNote': await call(api.createNote, text); return undefined;
        case 'apply': return applyAnswer(message);
        case 'delete': {
          conversation.messages.splice(conversation.messages.indexOf(message), 1);
          saveHistory();
          return renderBody();
        }
        case 'retry': {
          if (state.streaming) return undefined;
          const index = conversation.messages.indexOf(message);
          conversation.messages.splice(index, 1);
          const ai = effective();
          const answer = { id: uid(), role: 'assistant', content: '', at: Date.now(), pending: true, model: ai.providers[ai.provider].model, provider: ai.provider, ...(message.actionId ? { actionId: message.actionId, apply: message.apply } : {}) };
          conversation.messages.push(answer);
          const act2 = message.actionId ? aiActionById(message.actionId) : null;
          return run(conversation, answer, { act: act2 });
        }
        default: return undefined;
      }
    } catch (error) {
      return call(api.notify, 'error', error?.message ?? String(error));
    }
  }

  // ───────────────────────── provider / model choice

  function choose(patch) {
    const ai = effective();
    const next = normalizeAiSettings(ai);
    if (patch.provider) next.provider = patch.provider;
    if (patch.model !== undefined) next.providers[next.provider].model = patch.model;
    if (typeof api.saveAiSettings === 'function') {
      state.override = null;
      api.saveAiSettings(next);
    } else {
      state.override = { provider: next.provider, model: next.providers[next.provider].model };
    }
    render();
  }

  // ───────────────────────── events

  const onClick = (event) => {
    const target = event.target.closest('[data-ai], [data-ai-chip], [data-ai-action], [data-ai-msg], [data-ai-open], [data-ai-delete-chat]');
    if (!target || target.disabled || !host.contains(target)) {
      if (state.actionsOpen && !event.target.closest('.ai-actions-menu')) { state.actionsOpen = false; renderComposer(); }
      return;
    }
    if (target.dataset.aiDeleteChat) {
      event.stopPropagation();
      state.conversations = state.conversations.filter((c) => c.id !== target.dataset.aiDeleteChat);
      if (state.currentId === target.dataset.aiDeleteChat) state.currentId = null;
      saveHistory();
      renderBody();
      return;
    }
    if (target.dataset.aiOpen) {
      state.currentId = target.dataset.aiOpen;
      state.view = 'chat';
      render();
      return;
    }
    if (target.dataset.aiChip) {
      const ctx = context();
      ctx[target.dataset.aiChip] = !ctx[target.dataset.aiChip];
      renderComposer();
      return;
    }
    if (target.dataset.aiAction) {
      const action = aiActionById(target.dataset.aiAction);
      state.actionsOpen = false;
      const text = action?.vault ? el.composer.querySelector('textarea')?.value ?? '' : '';
      if (action?.vault && !text.trim()) {
        context().vaultSearch = true;
        renderComposer();
        const area = el.composer.querySelector('textarea');
        area?.focus();
        call(api.notify, 'info', t('ai.askVaultHint'));
        return;
      }
      ask(text, { action });
      return;
    }
    if (target.dataset.aiMsg) { messageAction(target.dataset.aiMsg, target.dataset.id); return; }
    switch (target.dataset.ai) {
      case 'new':
        if (state.streaming) stop();
        state.currentId = null;
        state.view = 'chat';
        render();
        focus();
        break;
      case 'history': state.view = state.view === 'history' ? 'chat' : 'history'; render(); break;
      case 'settings': call(api.openAiSettings); break;
      case 'actions': state.actionsOpen = !state.actionsOpen; renderComposer(); break;
      case 'send': sendInput(); break;
      case 'stop': stop(); break;
      case 'clear-history':
        state.conversations = [];
        state.currentId = null;
        saveHistory();
        renderBody();
        break;
      default: break;
    }
  };

  const onChange = (event) => {
    const select = event.target.closest('[data-ai-select]');
    if (!select || !host.contains(select)) return;
    if (select.dataset.aiSelect === 'provider') choose({ provider: select.value });
    if (select.dataset.aiSelect === 'model') choose({ model: select.value });
  };

  const onKeydown = (event) => {
    if (event.target.matches?.('.ai-input')) {
      // IME: Enter that confirms a Korean/Japanese/Chinese composition must not send.
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        sendInput();
        return;
      }
    }
    if (event.key === 'Escape') {
      if (state.streaming) { event.preventDefault(); stop(); return; }
      if (state.actionsOpen) { event.preventDefault(); state.actionsOpen = false; renderComposer(); }
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('[data-ai-open]')) {
      event.preventDefault();
      event.target.click();
    }
  };

  const onInput = (event) => { if (event.target.matches?.('.ai-input')) autosize(); };

  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('keydown', onKeydown);
  host.addEventListener('input', onInput);

  function focus() {
    el.composer.querySelector('textarea')?.focus();
  }

  function refresh() {
    if (destroyed) return;
    state.override = typeof api.saveAiSettings === 'function' ? null : state.override;
    if (state.streaming) { renderHead(); renderComposer(); return; }
    render();
  }

  /** Call when the vault changes: reloads that vault's history. */
  async function reloadHistory() {
    if (state.streaming) stop();
    await loadHistory();
    render();
  }

  function destroy() {
    destroyed = true;
    stop();
    clearTimeout(saveTimer);
    host.removeEventListener('click', onClick);
    host.removeEventListener('change', onChange);
    host.removeEventListener('keydown', onKeydown);
    host.removeEventListener('input', onInput);
    host.classList.remove('ai-host');
    host.innerHTML = '';
  }

  render();
  loadHistory().then(() => { if (!destroyed) render(); });

  return { refresh, focus, ask, destroy, reloadHistory, stop, get streaming() { return Boolean(state.streaming); } };
}

function safe(fn) {
  try { return fn(); } catch { return undefined; }
}

/*
 * The `api` object the panel uses (all optional except aiSettings; missing ones disable their button):
 *   t(key, params)                    → string (defaults to i18n.t)
 *   notify(kind, text)                kind: 'info' | 'success' | 'warning' | 'error'
 *   aiSettings()                      → settings.ai (synchronously)
 *   saveAiSettings(nextAi)            stores settings.ai when the provider/model is picked in the panel header
 *   openAiSettings()                  opens the settings popup on its AI tab
 *   renderMarkdown(text, element, sourcePath)   renders Markdown into element (may return a promise)
 *   activeNote()                      → { path, title, text } | null
 *   selection()                       → string (the editor's selected text, '' when none)
 *   linkedNotes()                     → [{ path, title, text }] (may return a promise)
 *   searchVault(query, limit)         → [{ path, title, excerpt }] (may return a promise)
 *   insertText(text)                  inserts at the cursor
 *   insertBelow(text)                 inserts below the selection / current line (falls back to insertText)
 *   replaceSelection(text)
 *   appendToNote(text)
 *   createNote(text)                  creates a new note with this text and opens it
 *   noteTags()                        → string[] the note's current `tags` (for "generate tags")
 *   setNoteTags(tags)                 writes the note's `tags` property (falls back to insertText of #tags)
 *   loadHistory()                     → [conversation] for the current vault (may return a promise)
 *   saveHistory(list)                 stores that list for the current vault
 */
