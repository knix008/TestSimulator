// Forensics tool windows: the file system browser (partitions, folders and files of FAT, exFAT, NTFS and ext2/3/4,
// deleted files too — WinHex) and YARA rule scanning (ImHex). Like every tool window they ask the main window
// (`call`) and draw with the shared helpers of toolwin.js.
import { icon } from '../icons.js';
import { t } from '../i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex8 = (n) => Number(n).toString(16).toUpperCase().padStart(8, '0');
const size = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
export const YARA_KEY = 'myhexa.yaraRules.v1';
const EXAMPLE = `rule Executable_MZ_PE : exe
{
    meta:
        description = "A Windows executable"
    strings:
        $mz = { 4D 5A }
        $pe = "PE\\0\\0"
    condition:
        $mz at 0 and $pe
}

rule Embedded_PNG
{
    strings:
        $png = { 89 50 4E 47 0D 0A 1A 0A }
    condition:
        $png
}`;

const st = { fs: null, yara: null };

export function resetForensics() { st.fs = null; st.yara = null; }

// ───────── file systems

export function filesystemBody(c) {
  const g = (st.fs ??= { parts: null, part: null, list: null, stack: [], deleted: true, info: null });
  if (!g.parts) c.call('core', { method: 'fsPartitions', args: { id: 'active' } }).then((r) => { g.parts = r; if (r.partitions.length === 1) openPart(c, 0); else c.redraw(); }).catch((e) => { g.parts = { scheme: 'none', partitions: [] }; c.setError(e); });
  const parts = g.parts?.partitions ?? [];
  const partRows = parts.map((p, i) => `<button class="tw-item ${g.part === i ? 'active' : ''}" data-fs-part="${i}"><b>${p.index}</b>${icon('disk')}<span class="chip">${esc(p.fs)}</span><span class="tw-text">${esc(p.label || p.typeName || p.type)}</span><code>${hex8(p.offset)}h</code><span class="muted">${size(p.length)}</span></button>`).join('') || `<div class="muted">${esc(g.parts ? t('fs.noPartitions') : t('props.loading'))}</div>`;
  let listing = '';
  if (g.list) {
    const [items, nav, start] = c.pager('fs', g.list.entries);
    listing = `<div class="tw-line">${c.btn('fs-up', t('fs.up'), 'arrowUp', 'small', g.stack.length ? '' : 'disabled')}<code class="tw-text">${esc(g.list.path || '/')}</code>${c.check('fs-deleted', t('fs.showDeleted'), g.deleted, 'trash')}<span class="muted">${esc(t('fs.count', { n: g.list.entries.length }))}</span><span class="grow"></span>${nav}</div>
      <div class="tw-list">${items.map((e, i) => `<div class="tw-item ${e.deleted ? 'muted' : ''}" data-fs-entry="${start + i}" title="${esc(e.name)}">${icon(e.dir ? 'folder' : 'file')}<span class="tw-text">${esc(e.name)}${e.deleted ? ` (${esc(t('fs.deleted'))})` : ''}</span><span class="muted">${e.dir ? '' : size(e.size)}</span><span class="muted">${esc(e.modified ?? '')}</span>
        ${e.dir ? `<button class="icon-button" data-fs-open-dir="${start + i}" title="${esc(t('fs.openDir'))}">${icon('folderOpen')}</button>` : `<button class="icon-button" data-fs-goto="${start + i}" title="${esc(t('carve.goto'))}">${icon('locate')}</button><button class="icon-button" data-fs-tab="${start + i}" title="${esc(t('carve.open'))}">${icon('newTab')}</button><button class="icon-button" data-fs-save="${start + i}" title="${esc(t('carve.save'))}">${icon('save')}</button>`}</div>`).join('') || `<div class="muted">${esc(t('fs.empty'))}</div>`}</div>`;
  }
  const info = g.info ? `<div class="tw-line muted">${icon('info')}${esc([g.info.fs, g.info.label, g.info.clusterSize ? `${t('fs.cluster')} ${g.info.clusterSize} B` : '', g.info.totalSize ? size(g.info.totalSize) : ''].filter(Boolean).join(' · '))}</div>` : '';
  return { icon: 'disk', title: t('tool.filesystem'), html: `<p class="tw-message muted">${esc(t('fs.hint', { scheme: g.parts?.scheme ?? '…' }))}</p><div class="tw-list fs-parts">${partRows}</div>${c.errorLine()}${info}${listing}` };
}

async function openPart(c, i, dir = null, push = false) {
  const g = st.fs;
  const p = g.parts.partitions[i];
  const prev = g.list;
  const list = await c.guarded(() => c.call('core', { method: 'fsList', args: { id: 'active', offset: p.offset, dir, deleted: g.deleted } }));
  if (!list) return;
  if (g.part !== i) { g.stack = []; g.info = await c.call('core', { method: 'fsInfo', args: { id: 'active', offset: p.offset } }).catch(() => null); }
  if (push && prev) g.stack.push(prev.dir);
  g.part = i;
  g.list = list;
  c.resetPage('fs');
  c.redraw();
}

// ───────── YARA

export function yaraBody(c) {
  const g = (st.yara ??= { rules: (() => { try { return localStorage.getItem(YARA_KEY) ?? EXAMPLE; } catch { return EXAMPLE; } })(), result: null, scope: 'all' });
  let results = '';
  if (g.result) {
    const flat = g.result.matches.flatMap((m) => (m.strings.length ? m.strings : [{ id: '', offset: null, length: 0, data: '' }]).map((s) => ({ rule: m.rule, tags: m.tags, ...s })));
    const [items, nav, start] = c.pager('yara', flat);
    results = `<h3 class="section-title">${icon('list')}<span>${esc(t('yara.result', { rules: g.result.matches.length, n: flat.length, total: g.result.rules }))}</span>${nav}</h3>
      <div class="tw-list">${items.map((x, i) => `<button class="tw-item" ${x.offset != null ? `data-tw-goto="${x.offset}" data-len="${x.length}"` : ''}><b>${start + i + 1}</b><span class="chip">${esc(x.rule)}</span><code>${esc(x.id)}</code>${x.offset != null ? `<code>${hex8(x.offset)}h</code><span class="muted">${x.length} B</span><code class="tw-preview">${esc(x.data)}</code>` : `<span class="muted">${esc(t('yara.noStrings'))}</span>`}</button>`).join('') || `<div class="muted">${esc(t('yara.none'))}</div>`}</div>`;
  }
  const errs = (g.result?.errors ?? g.errors ?? []).map((e) => `<div class="tw-error">${icon('error')}<span>${esc(`${t('template.line', { line: e.line, col: e.col })} ${e.message}`)}</span></div>`).join('');
  const html = `<div class="tw-line">${c.btn('yara-load', t('template.loadFile'), 'folderOpen', 'small')}${c.btn('yara-save', t('template.saveFile'), 'save', 'small')}${c.btn('yara-example', t('yara.example'), 'bulb', 'small')}<span class="grow"></span>
      ${c.sel('yara-scope', [['all', t('scope.all')], ['selection', t('scope.selectionOnly')]], g.scope, t('find.scope'), 'selectAll')}${c.btn('yara-run', t('yara.run'), 'play', 'primary')}</div>
    <textarea class="tw-code yara-code" data-tw="yara-rules" spellcheck="false" wrap="off">${esc(g.rules)}</textarea>${c.errorLine()}${errs}${results}`;
  return { icon: 'shieldCheck', title: t('tool.yara'), html };
}

/** Clicks of the two windows; true when handled. */
export async function forensicsClick(c, target) {
  const g = st.fs;
  const part = target.closest('[data-fs-part]');
  if (part) { await openPart(c, Number(part.dataset.fsPart)); return true; }
  const entryOf = (el, attr) => g.list.entries[Number(el.dataset[attr])];
  const od = target.closest('[data-fs-open-dir]');
  if (od) { await openPart(c, g.part, entryOf(od, 'fsOpenDir').id, true); return true; }
  const row = target.closest('[data-fs-entry]');
  if (row && !target.closest('button')) { const e = entryOf(row, 'fsEntry'); if (e.dir) await openPart(c, g.part, e.id, true); return true; }
  const go = target.closest('[data-fs-goto]');
  if (go) { const e = entryOf(go, 'fsGoto'); const ext = (e.extents ?? []).find((x) => x[0] >= 0); if (ext) await c.call('select', { offset: ext[0], length: Math.min(ext[1], e.size || ext[1]) }); else c.setError(t('fs.resident')); return true; }
  const tab = target.closest('[data-fs-tab]');
  if (tab) { const e = entryOf(tab, 'fsTab'); await c.guarded(() => c.call('fsOpen', { offset: g.parts.partitions[g.part].offset, id: e.id, name: e.name })); return true; }
  const save = target.closest('[data-fs-save]');
  if (save) { const e = entryOf(save, 'fsSave'); await c.guarded(() => c.call('fsSave', { offset: g.parts.partitions[g.part].offset, id: e.id, name: e.name })); return true; }
  const act = target.closest('[data-tw-act]')?.dataset.twAct;
  if (act === 'fs-up' && g?.stack.length) { const dir = g.stack.pop(); const keep = g.stack.slice(); await openPart(c, g.part, dir); g.stack = keep; c.redraw(); return true; }
  const y = st.yara;
  if (act === 'yara-run') {
    try { localStorage.setItem(YARA_KEY, y.rules); } catch { /* full */ }
    const r = await c.guarded(() => c.call('yaraScan', { rules: y.rules, scope: y.scope }));
    if (r) { y.result = r; c.resetPage('yara'); c.redraw(); }
    return true;
  }
  if (act === 'yara-example') { y.rules = EXAMPLE; c.redraw(); return true; }
  if (act === 'yara-load') { const r = await c.guarded(() => c.call('loadTextFile', { types: ['yar'] })); if (r) { y.rules = r.source; c.redraw(); } return true; }
  if (act === 'yara-save') { await c.guarded(() => c.call('saveTextFile', { source: y.rules, name: 'rules.yar' })); return true; }
  return false;
}

export function forensicsChange(c, el) {
  if (el.dataset.tw === 'fs-deleted') { st.fs.deleted = el.checked; if (st.fs.part != null) openPart(c, st.fs.part, st.fs.list?.dir ?? null); return true; }
  if (el.dataset.tw === 'yara-scope') { st.yara.scope = el.value; return true; }
  if (el.dataset.tw === 'yara-rules') { st.yara.rules = el.value; return true; }
  return false;
}

export function forensicsInput(el) {
  if (el.dataset.tw === 'yara-rules') { st.yara.rules = el.value; return true; }
  return false;
}
