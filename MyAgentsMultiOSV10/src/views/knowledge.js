// Knowledge view: knowledge bases (left list), the chosen one's documents, adding text or files, and a
// search box that shows what an agent would find (BM25 scores).
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';

export function createKnowledgeView(app) {
  const { t } = app;
  const state = { list: [], current: null, results: null, query: '', busy: false, preview: null };

  async function load() {
    try { state.list = await app.client.kbs(); } catch (error) { app.showError('error.load', error); }
    if (!state.list.some((k) => k.id === state.current)) state.current = state.list[0]?.id ?? null;
    render();
  }

  let host = null;
  function mount(el) { host = el; render(); load(); }

  function render() {
    if (!host) return;
    const kb = state.list.find((k) => k.id === state.current);
    host.innerHTML = `<div class="view-page kb-view">
      <aside class="kb-list">
        <div class="view-head">${icon('book')}<h2>${escapeHtml(t('view.knowledge'))}</h2><span class="grow"></span><button class="small-button primary" data-kb="new">${icon('plus')}<span>${escapeHtml(t('kb.new'))}</span></button></div>
        ${state.list.map((k) => `<button class="kb-item list-line ${k.id === state.current ? 'active' : ''}" data-kb-open="${escapeHtml(k.id)}" title="${escapeHtml(k.name)}">${icon('book')}<b class="ell">${escapeHtml(k.name)}</b><small class="muted">${escapeHtml(t('kb.counts', { docs: k.docs.length, chunks: k.chunks }))}</small></button>`).join('') || `<p class="muted">${escapeHtml(t('kb.none'))}</p>`}
        <p class="muted small kb-note">${icon('info')} ${escapeHtml(t('kb.note'))}</p>
      </aside>
      <section class="kb-main">${kb ? kbHtml(kb) : `<div class="view-empty">${icon('book')}<p>${escapeHtml(t('kb.pick'))}</p></div>`}</section>
    </div>`;
  }

  function kbHtml(kb) {
    return `<div class="view-head">${icon('book')}<h2>${escapeHtml(kb.name)}</h2><span class="muted">${escapeHtml(t('kb.counts', { docs: kb.docs.length, chunks: kb.chunks }))} · ${escapeHtml(Math.round(kb.chars / 1000))}k ${escapeHtml(t('kb.chars'))}</span><span class="grow"></span>
        <button class="small-button" data-kb="rename">${icon('edit')}<span>${escapeHtml(t('op.rename'))}</span></button>
        <button class="small-button danger" data-kb="delete">${icon('trash')}<span>${escapeHtml(t('action.delete'))}</span></button></div>
      ${kb.description ? `<p class="muted">${escapeHtml(kb.description)}</p>` : ''}
      <div class="kb-add">
        <button class="button" data-kb="files">${icon('importFile')}<span>${escapeHtml(t('kb.addFiles'))}</span></button>
        <button class="button" data-kb="text">${icon('notes')}<span>${escapeHtml(t('kb.addText'))}</span></button>
        <button class="button" data-kb="url">${icon('web')}<span>${escapeHtml(t('kb.addUrl'))}</span></button>
        <span class="muted small">${escapeHtml(t('kb.formats'))}</span>
      </div>
      <div class="list-view kb-docs" role="table"><div class="list-head" role="row"><span></span><span>${escapeHtml(t('kb.doc'))}</span><span>${escapeHtml(t('kb.size'))}</span><span>${escapeHtml(t('kb.chunks'))}</span><span>${escapeHtml(t('kb.added'))}</span><span></span></div>
        ${kb.docs.map((d) => `<div class="list-row" role="row" title="${escapeHtml(d.name)}">${icon('file')}<button class="link-button ell" data-doc-view="${escapeHtml(d.id)}">${escapeHtml(d.name)}</button><span class="num">${escapeHtml(d.chars.toLocaleString())}</span><span class="num">${d.chunks}</span><span class="muted ell">${escapeHtml(new Date(d.addedAt).toLocaleString())}</span><button class="icon-button danger" data-doc-delete="${escapeHtml(d.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash')}</button></div>`).join('') || `<div class="list-empty muted">${escapeHtml(t('kb.empty'))}</div>`}</div>
      ${state.preview ? `<div class="kb-preview"><div class="view-head small">${icon('file')}<b>${escapeHtml(state.preview.name)}</b><span class="grow"></span><button class="icon-button" data-kb="close-preview">${icon('close')}</button></div><pre>${escapeHtml(state.preview.text.slice(0, 20000))}</pre></div>` : ''}
      <div class="kb-search">
        <h3>${icon('search')} ${escapeHtml(t('kb.test'))}</h3>
        <div class="copy-row"><input type="search" class="field-input" data-kb-query value="${escapeHtml(state.query)}" placeholder="${escapeHtml(t('kb.testPlaceholder'))}" /><button class="button primary" data-kb="search">${icon('search')}<span>${escapeHtml(t('kb.search'))}</span></button></div>
        ${state.results ? (state.results.length ? state.results.map((r, i) => `<div class="kb-hit"><div class="kb-hit-head"><b>[${i + 1}] ${escapeHtml(r.doc)}</b><span class="muted">#${r.chunk} · score ${r.score}</span></div><p>${escapeHtml(r.text)}</p></div>`).join('') : `<p class="muted">${escapeHtml(t('kb.noHits'))}</p>`) : ''}
      </div>`;
  }

  async function addFiles() {
    const files = await app.pickFiles({ accept: '.txt,.md,.markdown,.csv,.json,.jsonl,.html,.htm,.xml,.yaml,.yml,.log,.js,.ts,.py,.java,.c,.cpp,.cs,.go,.rs,.sql,.css,.ini,.toml', multiple: true });
    for (const f of files) {
      try { await app.client.addDoc(state.current, { name: f.name, text: f.text }); app.notify('success', t('kb.added1', { name: f.name })); } catch (error) { app.showError('error.kbAdd', error, f.name); }
    }
    load();
  }

  async function onClick(event) {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.kbOpen) { state.current = b.dataset.kbOpen; state.results = null; state.preview = null; render(); return; }
    if (b.dataset.docDelete) { if ((await app.ask({ icon: 'trash', title: t('kb.deleteDoc'), message: t('kb.deleteDocText'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('action.delete'), danger: true, primary: true }] })) === 'ok') { await app.client.deleteDoc(state.current, b.dataset.docDelete); load(); } return; }
    if (b.dataset.docView) { const kb = state.list.find((k) => k.id === state.current); const d = kb.docs.find((x) => x.id === b.dataset.docView); const out = await app.client.docText(state.current, d.id); state.preview = { name: d.name, text: out.text }; render(); return; }
    const a = b.dataset.kb;
    if (a === 'new') {
      const res = await app.form({ title: t('kb.new'), icon: 'book', submitLabel: t('kb.create'), fields: [{ name: 'name', type: 'text', label: t('kb.name'), required: true, value: '' }, { name: 'description', type: 'textarea', label: t('kb.description'), value: '' }] });
      if (!res?.values?.name) return;
      const kb = await app.client.createKb(res.values);
      state.current = kb.id;
      load();
    } else if (a === 'rename') {
      const kb = state.list.find((k) => k.id === state.current);
      const res = await app.form({ title: t('op.rename'), icon: 'edit', fields: [{ name: 'name', type: 'text', label: t('kb.name'), required: true, value: kb.name }, { name: 'description', type: 'textarea', label: t('kb.description'), value: kb.description }] });
      if (res?.values?.name) { await app.client.updateKb(kb.id, res.values); load(); }
    } else if (a === 'delete') {
      const kb = state.list.find((k) => k.id === state.current);
      if ((await app.ask({ icon: 'trash', title: t('kb.deleteTitle'), message: t('kb.deleteText', { name: kb.name }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('action.delete'), danger: true, primary: true }] })) === 'ok') { await app.client.deleteKb(kb.id); state.current = null; load(); }
    } else if (a === 'files') addFiles();
    else if (a === 'text') {
      const res = await app.form({ title: t('kb.addText'), icon: 'notes', submitLabel: t('kb.add'), fields: [{ name: 'name', type: 'text', label: t('kb.docName'), required: true, value: 'note.md' }, { name: 'text', type: 'textarea', label: t('kb.content'), required: true, value: '' }] });
      if (res?.values?.text) { await app.client.addDoc(state.current, res.values).catch((e) => app.showError('error.kbAdd', e)); load(); }
    } else if (a === 'url') {
      const res = await app.form({ title: t('kb.addUrl'), icon: 'web', submitLabel: t('kb.add'), fields: [{ name: 'url', type: 'text', label: 'URL', required: true, value: 'https://' }] });
      if (!res?.values?.url) return;
      try {
        const draft = { name: 'fetch', nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 'w', type: 'tool.web', name: 'w', config: { url: res.values.url, maxChars: 200000 } }], edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'w', toPort: 'in' }] };
        const r = await app.client.runDraft(draft, { wait: true, payload: {} });
        if (r.status !== 'succeeded') throw new Error(r.error?.message ?? r.status);
        await app.client.addDoc(state.current, { name: `${(r.output.title || new URL(res.values.url).host).slice(0, 80)}.txt`, text: `${res.values.url}\n\n${r.output.text}` });
        app.notify('success', t('kb.added1', { name: res.values.url }));
      } catch (error) { app.showError('error.kbAdd', error, res.values.url); }
      load();
    } else if (a === 'search') {
      state.query = host.querySelector('[data-kb-query]')?.value ?? '';
      state.results = await app.client.searchKb(state.current, state.query);
      render();
    } else if (a === 'close-preview') { state.preview = null; render(); }
  }

  function onKey(event) { if (event.target.matches?.('[data-kb-query]') && event.key === 'Enter') host.querySelector('[data-kb="search"]')?.click(); }

  return { mount, render, load, onClick, onKey, addFiles, state };
}
