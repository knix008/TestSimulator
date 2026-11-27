// Two small tool windows on the core's patch and demangle methods:
//  · patch (Free Hex Editor Neo, ROM tools): a patch file from two open documents (IPS, IPS32, UPS, BPS or a text
//    listing), and a patch file applied to the active document — into a new tab or in place as one undo step.
//  · demangle (ImHex): C++ (Itanium, MSVC) and Rust symbol names, typed or found in the document's strings.
import { icon } from '../icons.js';
import { t } from '../i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const PATCH_FORMATS = ['ips', 'ips32', 'ups', 'bps', 'diff'];
let p = null;
let d = null;
export function resetPatchTools() { p = null; d = null; }

// ───────── patch

export function patchBody(c) {
  const g = (p ??= { tab: 'create', docs: null, original: null, modified: null, format: 'ips', result: null, applied: null, target: 'new', force: false });
  if (!g.docs) c.call('docs').then((docs) => { g.docs = docs; g.original ??= docs[0]?.id ?? null; g.modified ??= (docs.find((x) => x.active && x.id !== g.original) ?? docs[1])?.id ?? null; c.redraw(); }).catch((e) => c.setError(e));
  const tabs = `<div class="tw-line">${c.sel('patch-tab', [['create', t('patch.create')], ['apply', t('patch.apply')]], g.tab, t('patch.mode'), 'patch')}</div>`;
  const docOpts = (g.docs ?? []).map((x) => [x.id, `${x.name} (${x.len.toLocaleString()} B)`]);
  let html = '';
  if (g.tab === 'create') {
    html = `<div class="form-grid">
      <label class="row"><span class="row-label">${icon('file')}<span>${esc(t('patch.original'))}</span></span><span class="row-control">${c.sel('patch-original', docOpts, g.original, t('patch.original'), 'file')}</span></label>
      <label class="row"><span class="row-label">${icon('edit')}<span>${esc(t('patch.modified'))}</span></span><span class="row-control">${c.sel('patch-modified', docOpts, g.modified, t('patch.modified'), 'file')}</span></label>
      <label class="row"><span class="row-label">${icon('patch')}<span>${esc(t('patch.format'))}</span></span><span class="row-control">${c.sel('patch-format', PATCH_FORMATS.map((f) => [f, t(`patch.format.${f}`)]), g.format, t('patch.format'), 'patch')}</span></label></div>
      <p class="tw-message muted">${esc(t('patch.createHint'))}</p>
      <div class="tw-line tw-buttons"><span class="grow"></span>${c.btn('patch-make', t('patch.make'), 'play', 'primary', docOpts.length >= 2 ? '' : 'disabled')}${g.result ? c.btn('patch-save', t('patch.save'), 'save') : ''}</div>
      ${g.result ? `<div class="tw-status">${icon('check')}<span>${esc(t('patch.made', { format: g.result.format.toUpperCase(), size: g.result.size.toLocaleString(), records: g.result.records.toLocaleString() }))}</span></div>${g.result.text ? `<pre class="tw-output">${esc(g.result.text.slice(0, 20000))}</pre>` : ''}` : ''}`;
  } else {
    html = `<p class="tw-message muted">${esc(t('patch.applyHint'))}</p>
      <div class="tw-line">${c.sel('patch-target', [['new', t('tr.newTab')], ['replace', t('patch.inPlace')]], g.target, t('tr.target'), 'newTab')}${c.check('patch-force', t('patch.force'), g.force, 'warning')}<span class="grow"></span>${c.btn('patch-apply', t('patch.chooseAndApply'), 'folderOpen', 'primary')}</div>
      ${g.applied ? `<div class="tw-status">${icon(g.applied.ok ? 'check' : 'warning')}<span>${esc(t('patch.appliedInfo', { format: g.applied.format.toUpperCase(), size: g.applied.size.toLocaleString(), records: g.applied.records.toLocaleString() }))}</span></div>
        ${g.applied.checks ? `<div class="tw-line muted">${['source_crc_ok', 'target_crc_ok', 'patch_crc_ok'].filter((k) => g.applied.checks[k] != null).map((k) => `<span class="chip ${g.applied.checks[k] ? '' : 'warn'}">${icon(g.applied.checks[k] ? 'check' : 'warning')}${esc(t(`patch.check.${k}`))}</span>`).join('')}</div>` : ''}` : ''}`;
  }
  return { icon: 'patch', title: t('tool.patch'), html: `${tabs}${c.errorLine()}${html}` };
}

export async function patchClick(c, target) {
  const act = target.closest('[data-tw-act]')?.dataset.twAct;
  if (!act?.startsWith('patch-') || !p) return false;
  if (act === 'patch-make') {
    const r = await c.guarded(() => c.call('patchCreate', { original: Number(p.original), modified: Number(p.modified), format: p.format }));
    if (r) { p.result = r; c.redraw(); }
  } else if (act === 'patch-save') await c.guarded(() => c.call('patchSave', { data: p.result.data, format: p.result.format }));
  else if (act === 'patch-apply') {
    const r = await c.guarded(() => c.call('patchApplyFile', { target: p.target, force: p.force }));
    if (r) { p.applied = r; c.redraw(); }
  }
  return true;
}

export function patchChange(c, el) {
  const key = el.dataset.tw;
  if (!p || !key?.startsWith('patch-')) return false;
  const field = key.slice(6);
  p[field] = el.type === 'checkbox' ? el.checked : el.value;
  if (field === 'tab') { p.result = null; p.applied = null; p.docs = null; }
  if (field === 'original' || field === 'modified' || field === 'format') p.result = null;
  c.redraw();
  return true;
}

// ───────── demangle

export function demangleBody(c) {
  const g = (d ??= { input: '_ZN3foo3barEv\n?func@@YAHH@Z\n_ZN4core3fmt5write17h0123456789abcdefE\n_RNvCs1234_7mycrate4main', results: null, filter: 'ok' });
  const list = (g.results ?? []).filter((x) => g.filter === 'all' || x.ok);
  const [items, nav, start] = c.pager('demangle', list);
  const results = g.results ? `<h3 class="section-title">${icon('list')}<span>${esc(t('demangle.count', { n: g.results.filter((x) => x.ok).length, total: g.results.length }))}</span>${nav}<span class="grow"></span>${c.btn('dm-copy', t('demangle.copyAll'), 'copy', 'small')}</h3>
      <div class="tw-list">${items.map((x, i) => `<div class="tw-item ${x.ok ? '' : 'muted'}" title="${esc(x.input)}"><b>${start + i + 1}</b><span class="chip">${esc(x.scheme)}</span><code class="tw-text">${esc(x.output)}</code>${x.offset != null ? `<code class="muted">${esc(x.offset.toString(16).toUpperCase())}h</code>` : ''}<span class="muted tw-text">${esc(x.input)}</span></div>`).join('') || `<div class="muted">${esc(t('demangle.none'))}</div>`}</div>` : '';
  const html = `<p class="tw-message muted">${esc(t('demangle.hint'))}</p>
    <textarea class="tw-code demangle-input" data-tw="dm-input" spellcheck="false" wrap="off">${esc(g.input)}</textarea>
    <div class="tw-line">${c.sel('dm-filter', [['ok', t('demangle.onlyDemangled')], ['all', t('demangle.all')]], g.filter, t('demangle.show'), 'filter')}<span class="grow"></span>
      ${c.btn('dm-doc', t('demangle.fromDocument'), 'textStrings')}${c.btn('dm-run', t('demangle.run'), 'play', 'primary')}</div>${c.errorLine()}${results}`;
  return { icon: 'code', title: t('tool.demangle'), html };
}

export async function demangleClick(c, target) {
  const act = target.closest('[data-tw-act]')?.dataset.twAct;
  if (!act?.startsWith('dm-') || !d) return false;
  if (act === 'dm-run') {
    const r = await c.guarded(() => c.call('core', { method: 'demangle', args: { names: d.input.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) } }));
    if (r) { d.results = r; d.filter = 'all'; c.resetPage('demangle'); c.redraw(); }
  } else if (act === 'dm-doc') {
    const r = await c.guarded(() => c.call('demangleDocument', {}));
    if (r) { d.results = r; d.filter = 'ok'; c.resetPage('demangle'); c.redraw(); }
  } else if (act === 'dm-copy') {
    await c.call('copy', { text: (d.results ?? []).filter((x) => d.filter === 'all' || x.ok).map((x) => x.output).join('\n') });
  }
  return true;
}

export function demangleChange(c, el) {
  if (!d) return false;
  if (el.dataset.tw === 'dm-input') { d.input = el.value; return true; }
  if (el.dataset.tw === 'dm-filter') { d.filter = el.value; c.resetPage('demangle'); c.redraw(); return true; }
  return false;
}
