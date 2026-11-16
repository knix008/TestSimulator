// Models & keys view: one card per provider (ready or not, keys stored, test, model list), the default
// model, and the core settings for agents (commands allowed, the work folder).
import { PROVIDERS } from '../../core/providers/index.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';

export function createModelsView(app) {
  const { t } = app;
  const state = { creds: [], providers: [], settings: null, models: {}, pick: {}, testing: null, testStarted: 0, results: {}, ollama: null };
  let tick = 0;

  /** The model a card tests and makes default: the one picked, else the default model when it is this provider's, else the first installed, else the built-in suggestion. */
  function picked(p) {
    if (state.pick[p.id]) return state.pick[p.id];
    const def = state.settings?.defaultModel ?? '';
    if (def.startsWith(`${p.id}:`)) return def.slice(p.id.length + 1);
    return state.models[p.id]?.[0] ?? p.defaultModel;
  }

  /** Local servers list what is installed: fetched by itself so the picker shows real models. */
  async function loadInstalled() {
    for (const p of PROVIDERS.filter((x) => x.id === 'ollama')) {
      try { state.ollama = await app.client.ollamaStatus(); } catch { state.ollama = null; }
      if (state.ollama && !state.ollama.running) continue;
      try { const r = await app.client.models(p.id); state.models[p.id] = r.models; } catch (error) { state.results[p.id] ??= { ok: false, text: error.message }; }
    }
    render();
  }
  let host = null;

  async function load() {
    try {
      const [c, s] = await Promise.all([app.client.credentials(), app.client.settings()]);
      state.creds = c.items;
      state.providers = c.providers;
      state.settings = s;
    } catch (error) { app.showError('error.load', error); }
    render();
    loadInstalled();
  }

  function mount(el) { host = el; render(); load(); }

  function card(p) {
    const st = state.providers.find((x) => x.id === p.id) ?? {};
    const creds = state.creds.filter((c) => c.provider === p.id);
    const res = state.results[p.id];
    const models = state.models[p.id];
    return `<section class="model-card ${st.ready ? 'ready' : 'missing'}">
      <div class="model-card-head">${icon(p.icon)}<b>${escapeHtml(p.label)}</b><span class="grow"></span>
        <span class="run-chip ${st.ready ? 'st-succeeded' : 'st-skipped'}">${icon(st.ready ? 'check' : 'key')}<span>${escapeHtml(st.ready ? (st.fromEnv ? t('models.fromEnv', { env: p.env ?? '' }) : t('models.ready')) : t('models.noKey'))}</span></span></div>
      ${p.hint ? `<p class="muted small">${escapeHtml(p.hint)}</p>` : ''}
      ${p.id === 'ollama' && state.ollama ? ollamaLine(state.ollama, picked(p)) : ''}
      <div class="model-creds">${creds.map((c) => `<div class="cred-row"><span>${icon('key')}<b>${escapeHtml(c.name)}</b> <code>${escapeHtml(c.keyHint || '—')}</code>${c.baseUrl ? ` <small class="muted">${escapeHtml(c.baseUrl)}</small>` : ''}${c.isDefault ? ` <i class="badge">${escapeHtml(t('models.default'))}</i>` : ''}</span><span class="grow"></span><button class="icon-button" data-cred-edit="${escapeHtml(c.id)}" title="${escapeHtml(t('action.edit'))}">${icon('edit')}</button><button class="icon-button danger" data-cred-delete="${escapeHtml(c.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash')}</button></div>`).join('')}</div>
      <div class="model-actions">
        ${p.id === 'mock' ? '' : `<button class="small-button" data-cred-add="${p.id}">${icon('plus')}<span>${escapeHtml(p.needsKey ? t('models.addKey') : t('models.addServer'))}</span></button>`}
        ${p.id === 'mock' ? '' : `<label class="model-pick" title="${escapeHtml(t('models.pick'))}">${icon('layers')}<select data-icon="layers" data-model-pick="${p.id}" aria-label="${escapeHtml(t('models.pick'))}">${[...new Set([picked(p), ...(state.models[p.id] ?? p.models ?? [])])].map((m) => `<option value="${escapeHtml(m)}" ${m === picked(p) ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select></label>`}
        <button class="small-button" data-model-test="${p.id}" ${state.testing === p.id ? 'disabled' : ''}>${icon(state.testing === p.id ? 'hourglass' : 'flask')}<span>${escapeHtml(state.testing === p.id ? t('models.testing', { s: Math.round((Date.now() - state.testStarted) / 1000) }) : t('models.test'))}</span></button>
        <button class="small-button" data-model-list="${p.id}">${icon('list')}<span>${escapeHtml(t('models.list'))}</span></button>
        <button class="small-button ${state.settings?.defaultModel?.startsWith(`${p.id}:`) ? 'active' : ''}" data-model-default="${p.id}">${icon('star')}<span>${escapeHtml(t('models.makeDefault'))}</span></button>
        ${p.keyUrl ? `<button class="small-button" data-open-url="${escapeHtml(p.keyUrl)}">${icon('globe')}<span>${escapeHtml(t('models.getKey'))}</span></button>` : ''}
      </div>
      ${state.testing === p.id && ['ollama', 'compatible'].includes(p.id) ? `<div class="model-result wait">${icon('hourglass')}<span>${escapeHtml(t('models.localSlow'))}</span></div>` : ''}
      ${res ? `<div class="model-result ${res.ok ? 'ok' : 'bad'}">${icon(res.ok ? 'check' : 'error')}<span>${escapeHtml(res.text)}</span></div>` : ''}
      ${models ? `<div class="model-list">${models.slice(0, 60).map((m) => `<button class="chip ${state.settings?.defaultModel === `${p.id}:${m}` ? 'on' : ''}" data-model-set="${escapeHtml(`${p.id}:${m}`)}" title="${escapeHtml(t('models.makeDefault'))}">${escapeHtml(m)}</button>`).join('')}</div>` : ''}
    </section>`;
  }

  /** Ollama's state on its card: installed / running / version / models, with Install, Start or Download. */
  function ollamaLine(o, model) {
    const has = o.models.some((m) => m === model || m === `${model}:latest` || m.split(':')[0] === model);
    const [cls, glyph, text, act] = !o.installed ? ['bad', 'error', t('ollama.state.missing'), 'install'] : !o.running ? ['warn', 'warning', t('ollama.state.stopped'), 'start'] : !has ? ['warn', 'download', t('ollama.state.noModel', { model, n: o.models.length }), 'pull'] : ['ok', 'check', t('ollama.state.ready', { version: o.version, n: o.models.length }), ''];
    return `<div class="ollama-state ${cls}" data-ollama-state="${!o.installed ? 'missing' : !o.running ? 'stopped' : has ? 'ready' : 'no-model'}">${icon(glyph)}<span>${escapeHtml(text)}</span><span class="grow"></span>${act && o.canInstall ? `<button class="small-button primary" data-ollama="${act}">${icon(act === 'start' ? 'play' : 'download')}<span>${escapeHtml(t(`ollama.${act}`, { model }))}</span></button>` : ''}</div>`;
  }

  function render() {
    if (!host) return;
    const s = state.settings;
    host.innerHTML = `<div class="view-page models-view">
      <div class="view-head">${icon('key')}<h2>${escapeHtml(t('view.models'))}</h2><span class="grow"></span></div>
      <div class="models-top">
        <label class="field"><span class="field-label">${icon('star')} ${escapeHtml(t('models.defaultModel'))}</span><div class="copy-row"><input class="field-input mono" data-default-model value="${escapeHtml(s?.defaultModel ?? '')}" placeholder="anthropic:claude-opus-5-5" /><button class="button" data-model="save-default">${icon('save')}<span>${escapeHtml(t('action.save'))}</span></button></div><small class="field-hint">${escapeHtml(t('models.defaultHint'))}</small></label>
        <label class="field field-inline"><span class="field-label">${icon('terminal')} ${escapeHtml(t('models.allowShell'))}</span><label class="switch-wrap"><input type="checkbox" data-allow-shell ${s?.allowShell ? 'checked' : ''} ${app.isWeb() ? 'disabled' : ''} /><span class="switch"></span></label><small class="field-hint">${escapeHtml(t('models.allowShellHint'))}</small></label>
        <label class="field"><span class="field-label">${icon('folder')} ${escapeHtml(t('models.workDir'))}</span><div class="copy-row"><input class="field-input mono" data-work-dir value="${escapeHtml(s?.workDir ?? '')}" placeholder="${escapeHtml(s?.workDirResolved ?? '')}" /><button class="button" data-model="save-workdir">${icon('save')}<span>${escapeHtml(t('action.save'))}</span></button></div><small class="field-hint">${escapeHtml(t('models.workDirHint', { dir: s?.workDirResolved ?? '' }))}</small></label>
      </div>
      <div class="model-grid">${PROVIDERS.map(card).join('')}</div>
      <p class="muted small">${icon('info')} ${escapeHtml(t('models.privacy'))}</p>
    </div>`;
  }

  async function credForm(provider, existing = null) {
    const p = PROVIDERS.find((x) => x.id === provider);
    const res = await app.form({
      title: `${p.label} — ${existing ? t('action.edit') : p.needsKey ? t('models.addKey') : t('models.addServer')}`, icon: 'key', submitLabel: t('action.save'),
      fields: [
        { name: 'name', type: 'text', label: t('models.credName'), value: existing?.name ?? p.label },
        ...(p.needsKey || provider === 'compatible' ? [{ name: 'apiKey', type: 'text', label: t('models.apiKey'), value: '', placeholder: existing?.keyHint ? `${existing.keyHint} (${t('models.keepKey')})` : 'sk-…', required: !existing && p.needsKey }] : []),
        { name: 'baseUrl', type: 'text', label: t('models.baseUrl'), value: existing?.baseUrl ?? (provider === 'ollama' || provider === 'compatible' ? p.baseUrl : ''), placeholder: p.baseUrl ?? t('models.baseUrlDefault') },
        { name: 'isDefault', type: 'checkbox', label: t('models.useDefault'), value: existing?.isDefault ?? true },
      ],
    });
    if (!res) return;
    try {
      if (existing) await app.client.updateCredential(existing.id, res.values); else await app.client.createCredential({ provider, ...res.values });
      app.notify('success', t('models.saved'));
      app.catalogsChanged();
    } catch (error) { app.showError('error.save', error); }
    load();
  }

  async function onClick(event) {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.credAdd) return credForm(b.dataset.credAdd);
    if (b.dataset.credEdit) { const c = state.creds.find((x) => x.id === b.dataset.credEdit); return credForm(c.provider, c); }
    if (b.dataset.credDelete) {
      if ((await app.ask({ icon: 'trash', title: t('models.deleteKey'), message: t('models.deleteKeyText'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('action.delete'), danger: true, primary: true }] })) !== 'ok') return undefined;
      await app.client.deleteCredential(b.dataset.credDelete);
      app.catalogsChanged();
      return load();
    }
    if (b.dataset.ollama) { if (await app.offerOllama(null, picked(PROVIDERS.find((x) => x.id === 'ollama')))) loadInstalled(); else loadInstalled(); return undefined; }
    if (b.dataset.modelTest) {
      const p = PROVIDERS.find((x) => x.id === b.dataset.modelTest);
      const ref = `${p.id}:${picked(p)}`;
      state.testing = p.id;
      state.testStarted = Date.now();
      delete state.results[p.id];
      render();
      clearInterval(tick);
      tick = setInterval(() => { if (state.testing) render(); else clearInterval(tick); }, 1000);
      let failed = null;
      try { const r = await app.client.testModel(ref); state.results[p.id] = { ok: true, text: `${r.model}: "${String(r.text).slice(0, 80)}" · ${r.ms} ms` }; } catch (error) { state.results[p.id] = { ok: false, text: error.message }; failed = error; }
      if (failed && p.id === 'ollama') { state.testing = null; clearInterval(tick); render(); if (await app.offerOllama(failed, picked(p))) loadInstalled(); return undefined; }
      state.testing = null;
      clearInterval(tick);
      return render();
    }
    if (b.dataset.modelList) {
      try { const r = await app.client.models(b.dataset.modelList); state.models[b.dataset.modelList] = r.models; } catch (error) { state.results[b.dataset.modelList] = { ok: false, text: error.message }; }
      return render();
    }
    if (b.dataset.modelDefault) { const p = PROVIDERS.find((x) => x.id === b.dataset.modelDefault); return setDefault(`${p.id}:${picked(p)}`); }
    if (b.dataset.modelSet) return setDefault(b.dataset.modelSet);
    if (b.dataset.openUrl) return app.openUrl(b.dataset.openUrl);
    if (b.dataset.model === 'save-default') return setDefault(host.querySelector('[data-default-model]').value.trim());
    if (b.dataset.model === 'save-workdir') { state.settings = await app.client.saveSettings({ workDir: host.querySelector('[data-work-dir]').value.trim() }); app.notify('success', t('models.saved')); return load(); }
    return undefined;
  }

  async function setDefault(ref) {
    state.settings = { ...state.settings, ...(await app.client.saveSettings({ defaultModel: ref })) };
    app.notify('success', t('models.defaultSet', { model: ref }));
    app.catalogsChanged();
    load();
  }

  async function onChange(event) {
    if (event.target.dataset.modelPick) { state.pick[event.target.dataset.modelPick] = event.target.value; return; }
    if ('allowShell' in event.target.dataset) { await app.client.saveSettings({ allowShell: event.target.checked }); app.catalogsChanged(); load(); }
  }

  return { mount, render, load, onClick, onChange, state };
}
