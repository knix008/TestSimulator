// The right panel: properties of the document at the caret — the data inspector, the structure a template
// finds, file information, checksums and hashes, statistics (histogram, entropy graph, randomness tests) and
// bookmarks. HTML in, clicks back (the shell routes [data-prop-*] clicks to `click`).
import { call as core } from '../core/core.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml as h } from '../ui/dom.js';
import { formatOffset } from '../hex/hexview.js';
import { BOOKMARK_COLORS } from '../hex/editor.js';
import { addHash, exportHashList, importHashList, loadHashDb, lookupHash, removeHash, saveHashDb } from '../domain/hashdb.js';

export const RIGHT_ICONS = { inspector: 'inspector', structure: 'structureTree', info: 'docProperties', hashes: 'hash', stats: 'chartBar', bookmarks: 'bookmark' };

export const fmtSize = (n) => {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n; let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return u ? `${v.toFixed(v < 10 ? 2 : 1)} ${units[u]} (${n.toLocaleString()} B)` : `${n.toLocaleString()} B`;
};

/**
 * app: { editor, settings(), updateSettings(patch), notify, showError, popups, copyText(text), rerender(), runTemplate(tab, opts),
 *        openTool(kind, params), withProgress }
 */
export function createProps(app) {
  const hashDb = loadHashDb();
  const state = { inspect: null, inspectKey: '', hashes: null, stats: null, detect: new Map(), collapsed: new Set(), activeNode: null, timer: 0 };
  const off = (n) => {
    const s = app.settings();
    return `${formatOffset(n + (s.baseAddress || 0), s.offsetBase, s.offsetBase === 'hex' ? 8 : 10, s.uppercase)}${s.offsetBase === 'hex' ? 'h' : ''}`;
  };
  const tab = () => app.editor.active();
  const scopeOf = (tb) => { const sel = tb.view?.selection(); return sel?.length ? { offset: sel.start, length: sel.length, selection: true } : { offset: 0, length: tb.doc.len, selection: false }; };
  const empty = (key) => `<div class="prop-note">${icon('info')}<span>${h(t(key))}</span></div>`;

  // ───────── data inspector

  function caretMoved() {
    clearTimeout(state.timer);
    state.timer = setTimeout(refreshInspector, 60);
  }

  async function refreshInspector() {
    const tb = tab();
    if (!tb?.view) { state.inspect = null; return; }
    const offset = tb.view.caret;
    const endian = app.settings().endian;
    const key = `${tb.doc.id}:${tb.doc.info.version}:${offset}:${endian}`;
    if (key === state.inspectKey) return;
    state.inspectKey = key;
    try {
      state.inspect = await core('inspect', { id: tb.doc.id, offset, endian });
    } catch (error) { state.inspect = { offset, fields: [], error: String(error?.message ?? error) }; }
    if (app.settings().rightTab === 'inspector') app.rerender();
  }

  function inspectorHtml() {
    const tb = tab();
    if (!tb) return empty('props.noDocument');
    const s = app.settings();
    const r = state.inspect;
    const tools = `<div class="prop-tools"><span>${icon('locate')}<b>${h(r ? off(r.offset) : '—')}</b></span><span class="grow"></span>
      <span class="segmented small" role="radiogroup">${['le', 'be'].map((e) => `<button class="segment ${s.endian === e ? 'active' : ''}" data-prop-endian="${e}" title="${h(t(`endian.${e}`))}">${h(t(`endian.${e}Short`))}</button>`).join('')}</span></div>`;
    if (!r) return tools + empty('props.loading');
    if (r.error) return tools + `<div class="prop-note">${icon('error')}<span>${h(r.error)}</span></div>`;
    const rows = r.fields.map((f) => `<tr class="${f.editable && !tb.doc.readonly ? 'editable' : ''}" data-inspect-edit="${h(f.id)}" title="${h(t(`inspect.${f.id}`))} — ${h(t('props.editHint'))}"><th>${h(t(`inspect.${f.id}`, null, f.id))}</th><td>${h(f.value)}</td></tr>`).join('');
    return `${tools}<table class="prop-table">${rows}</table><div class="prop-note">${icon('info')}<span>${h(t('props.inspectorHint'))}</span></div>`;
  }

  async function editInspected(id) {
    const tb = tab();
    const field = state.inspect?.fields.find((f) => f.id === id);
    if (!tb || !field || tb.doc.readonly) return;
    const result = await app.popups.open('form', { title: t('inspect.editTitle', { name: t(`inspect.${id}`, null, id) }), icon: 'edit', fields: [{ key: 'value', type: 'text', label: t(`inspect.${id}`, null, id), value: field.value.replace(/^'(.*)' \(U\+[0-9A-F]+\)$/, '$1').replace(/ \(0x[0-9A-F]+\)$/i, ''), icon: 'edit' }], okLabel: t('common.apply') });
    if (!result?.values) return;
    try {
      const r = await core('encodeValue', { type: id, text: result.values.value, endian: app.settings().endian });
      await app.editor.edit(tb.doc, 'write', { offset: state.inspect.offset, data: r.data, kind: 'inspector' });
      state.inspectKey = '';
      refreshInspector();
    } catch (error) { app.showError('error.value', error); }
  }

  // ───────── structure (templates)

  function flatten(nodes, depth, path, out) {
    nodes.forEach((n, i) => {
      const p = `${path}/${i}`;
      out.push({ n, depth, p });
      if (n.children?.length && !state.collapsed.has(p)) flatten(n.children, depth + 1, p, out);
    });
    return out;
  }

  function structureHtml() {
    const tb = tab();
    if (!tb) return empty('props.noDocument');
    const tp = tb.doc.template;
    const builtins = app.templates?.() ?? [];
    const users = app.userTemplates?.() ?? [];
    const current = tp?.template ?? 'auto';
    const options = [['auto', t('template.auto')], ...builtins.map((b) => [b.id, b.name]), ...users.map((u) => [`user:${u.id}`, `★ ${u.name}`])];
    const tools = `<div class="prop-tools">
      <select data-template-select data-icon="structureTree" aria-label="${h(t('template.choose'))}" title="${h(t('template.choose'))}">${options.map(([v, l]) => `<option value="${h(v)}" ${v === current ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>
      <button class="icon-button" data-prop-action="template-run" title="${h(t('template.run'))}">${icon('play')}</button>
      <button class="icon-button" data-prop-action="template-edit" title="${h(t('tool.template'))}">${icon('code')}</button>
      <button class="icon-button" data-prop-action="template-expand" title="${h(t('template.expandAll'))}">${icon('expandAll')}</button>
      <button class="icon-button" data-prop-action="template-collapse" title="${h(t('template.collapseAll'))}">${icon('collapseAll')}</button>
      <button class="icon-button" data-prop-action="template-clear" title="${h(t('template.clear'))}" ${tp ? '' : 'disabled'}>${icon('close')}</button></div>`;
    if (!tp) return tools + empty('template.none');
    const errs = (tp.errors ?? []).map((e) => `<div class="prop-note">${icon(e.warning ? 'warning' : 'error')}<span>${h(`${e.line}:${e.col} ${e.message}`)}</span></div>`).join('');
    const rows = flatten(tp.nodes ?? [], 0, '', []).slice(0, 4000).map(({ n, depth, p }) => {
      const kids = n.children?.length;
      return `<div class="tree-node ${state.activeNode === p ? 'active' : ''}" data-tp-node="${h(p)}" style="padding-left:${4 + depth * 14}px" title="${h(`${n.name}: ${n.type} @ ${off(n.offset)} (${n.size})${n.comment ? ` — ${n.comment}` : ''}`)}">
        <span class="tw" ${kids ? `data-tp-toggle="${h(p)}"` : ''}>${kids ? (state.collapsed.has(p) ? '▸' : '▾') : ''}</span>
        ${n.color ? `<span class="sw" style="background:${h(n.color)}"></span>` : ''}<span class="nm">${h(n.name)}</span><span class="ty">${h(n.type)}</span><span class="vl">${h(n.value ?? '')}</span><span class="of">${h(off(n.offset))}</span></div>`;
    }).join('');
    return `${tools}<div class="prop-note">${icon('structureTree')}<span>${h(t('template.result', { name: tp.name ?? '', n: (tp.count ?? 0).toLocaleString() }))}</span></div>${errs}<div class="tree">${rows}</div>`;
  }

  function nodeAt(path) {
    const parts = path.split('/').filter(Boolean).map(Number);
    let list = tab()?.doc.template?.nodes ?? [];
    let node = null;
    for (const i of parts) { node = list[i]; list = node?.children ?? []; }
    return node;
  }

  // ───────── information

  function infoHtml() {
    const tb = tab();
    if (!tb) return empty('props.noDocument');
    const d = tb.doc;
    const sel = tb.view?.selection();
    const det = state.detect.get(d.id);
    if (!det || det.version !== d.info.version) {
      state.detect.set(d.id, { version: d.info.version, value: null });
      core('detect', { id: d.id }).then((v) => { state.detect.set(d.id, { version: d.info.version, value: v }); if (app.settings().rightTab === 'info') app.rerender(); }).catch(() => {});
    }
    const type = state.detect.get(d.id)?.value;
    const src = d.source;
    const rows = [
      ['file', t('info.name'), d.name],
      ['folderOpen', t('info.path'), src.path ?? src.label ?? t(`source.${src.kind}`)],
      ['layers', t('info.source'), t(`source.${src.kind}`)],
      ['ruler', t('info.size'), fmtSize(d.len)],
      ['fileType', t('info.type'), type ? `${type.name}${type.details ? ` — ${type.details}` : ''}` : '…'],
      ['code', t('info.mime'), type?.mime ?? '—'],
      ['edit', t('info.modified'), t(d.modified ? 'common.yes' : 'common.no')],
      ['lock', t('info.readonly'), t(d.readonly ? 'common.yes' : 'common.no')],
      ['resize', t('info.resizable'), t(d.resizable ? 'common.yes' : 'common.no')],
      ['undo', t('info.undoSteps'), `${d.info.undoCount ?? 0} / ${d.info.redoCount ?? 0}`],
      ['locate', t('info.caret'), tb.view ? `${off(tb.view.caret)} (${tb.view.caret.toLocaleString()})` : '—'],
      ['selectAll', t('info.selection'), sel?.length ? `${off(sel.start)} – ${off(sel.end - 1)} · ${sel.length.toLocaleString()} B` : '—'],
      ['bookmark', t('panel.bookmarks'), String(d.bookmarks.length)],
    ];
    return `<table class="prop-table">${rows.map(([g, k, v]) => `<tr><th>${icon(g)} ${h(k)}</th><td>${h(String(v))}</td></tr>`).join('')}</table>`;
  }

  // ───────── checksums and hashes

  function hashesHtml() {
    const tb = tab();
    if (!tb) return empty('props.noDocument');
    const sc = scopeOf(tb);
    const r = state.hashes?.doc === tb.doc.id && state.hashes.version === tb.doc.info.version ? state.hashes : null;
    const tools = `<div class="prop-tools"><span class="chip">${icon(sc.selection ? 'selectAll' : 'file')}${h(sc.selection ? t('scope.selection', { n: sc.length.toLocaleString() }) : t('scope.all'))}</span><span class="grow"></span>
      <button class="button small" data-prop-action="hash-choose" title="${h(t('hash.choose'))}">${icon('checkAll')}<span>${h(t('hash.choose'))}</span></button>
      <button class="button small primary" data-prop-action="hash-run" title="${h(t('hash.run'))}">${icon('play')}<span>${h(t('hash.run'))}</span></button></div>`;
    if (!r) return tools + empty('hash.hint');
    return `${tools}<div class="prop-note">${icon('info')}<span>${h(t('hash.of', { range: r.selection ? `${off(r.offset)} + ${r.length.toLocaleString()} B` : t('scope.all') }))}</span></div>
      ${hits(r)}<table class="prop-table">${r.results.map((x) => { const k = lookupHash(hashDb, x.value); return `<tr class="hash-row ${k ? `hash-${k.category}` : ''}" data-copy="${h(x.value)}" title="${h(t('hash.copy'))}"><th>${h(x.name)}</th><td>${h(x.value)}${k ? `<span class="chip hash-chip ${k.category}">${icon(k.category === 'notable' ? 'warning' : 'check')}${h(`${t(`hashdb.${k.category}`)}${k.name ? `: ${k.name}` : ''}`)}</span>` : ''}</td><td class="hash-act">${k ? `<button class="icon-button" data-hash-remove="${h(x.value)}" title="${h(t('hashdb.remove'))}">${icon('trash')}</button>` : `<button class="icon-button" data-hash-add="${h(x.value)}" title="${h(t('hashdb.add'))}">${icon('plus')}</button>`}</td></tr>`; }).join('')}</table>
      ${hashDbHtml()}`;
  }

  /** The known / notable summary of a result. */
  function hits(r) {
    const found = r.results.map((x) => lookupHash(hashDb, x.value)).filter(Boolean);
    if (!found.length) return hashDb.entries.size ? `<div class="prop-note">${icon('hash')}<span>${h(t('hashdb.noMatch'))}</span></div>` : '';
    const notable = found.find((x) => x.category === 'notable');
    const k = notable ?? found[0];
    return `<div class="prop-note hash-hit ${k.category}">${icon(notable ? 'warning' : 'check')}<span>${h(t(`hashdb.hit.${k.category}`, { name: k.name || '—' }))}</span></div>`;
  }

  function hashDbHtml() {
    const counts = { known: 0, notable: 0 };
    for (const e of hashDb.entries.values()) counts[e.category] += 1;
    return `<h3 class="section-title">${icon('database')}<span>${h(t('hashdb.title'))}</span></h3>
      <div class="prop-note">${icon('info')}<span>${h(t('hashdb.count', { known: counts.known.toLocaleString(), notable: counts.notable.toLocaleString() }))}</span></div>
      <div class="prop-tools"><button class="button small" data-prop-action="hashdb-import" title="${h(t('hashdb.import'))}">${icon('importFile')}<span>${h(t('hashdb.import'))}</span></button>
      <button class="button small" data-prop-action="hashdb-export" ${hashDb.entries.size ? '' : 'disabled'} title="${h(t('hashdb.export'))}">${icon('exportFile')}<span>${h(t('hashdb.export'))}</span></button>
      <button class="button small" data-prop-action="hashdb-clear" ${hashDb.entries.size ? '' : 'disabled'} title="${h(t('hashdb.clear'))}">${icon('trash')}<span>${h(t('hashdb.clear'))}</span></button></div>`;
  }

  const persist = () => { try { saveHashDb(hashDb); } catch (error) { app.showError('error.hashdb', error); } app.rerender(); };

  async function addToDb(value) {
    const tb = tab();
    const r = await app.popups.open('form', { title: t('hashdb.add'), icon: 'hash', message: value, fields: [
      { key: 'name', type: 'text', label: t('hashdb.name'), value: tb?.doc.name ?? '', icon: 'file' },
      { key: 'category', type: 'segmented', label: t('hashdb.category'), value: 'known', options: [['known', t('hashdb.known')], ['notable', t('hashdb.notable')]] },
    ], okLabel: t('hashdb.addOk') });
    if (!r?.values) return;
    addHash(hashDb, value, r.values.name, r.values.category);
    persist();
  }

  async function importDb() {
    const r = await app.popups.open('form', { title: t('hashdb.import'), icon: 'importFile', message: t('hashdb.importHint'), fields: [
      { key: 'category', type: 'segmented', label: t('hashdb.category'), value: 'known', options: [['known', t('hashdb.known')], ['notable', t('hashdb.notable')]] },
    ], okLabel: t('hashdb.chooseFile') });
    if (!r?.values) return;
    const file = await app.loadText(['txt', 'csv', 'md5', 'sha1', 'sha256', 'hash']);
    if (!file) return;
    const res = importHashList(hashDb, file.source, r.values.category, '');
    persist();
    app.notify(res.added ? 'success' : 'warning', t('hashdb.imported', { n: res.added.toLocaleString(), skipped: res.skipped.toLocaleString() }));
  }


  async function runHashes() {
    const tb = tab();
    if (!tb) return;
    const sc = scopeOf(tb);
    const r = await app.withProgress('progress.hash', tb.doc.name, (op) => core('hash', { id: tb.doc.id, offset: sc.offset, length: sc.length, algorithms: app.settings().hashAlgorithms }, op), { cancellable: true });
    state.hashes = { ...r, doc: tb.doc.id, version: tb.doc.info.version, selection: sc.selection };
    app.updateSettings({ rightTab: 'hashes', showRightPanel: true });
  }

  async function chooseHashes() {
    const list = await core('hashList');
    const chosen = new Set(app.settings().hashAlgorithms);
    const result = await app.popups.open('form', { title: t('hash.choose'), icon: 'hash', columns: 3, fields: list.map((a) => ({ key: a.id, type: 'check', label: a.name, value: chosen.has(a.id), group: t(`hashGroup.${a.group}`) })), okLabel: t('common.apply') });
    if (!result?.values) return;
    const ids = list.map((a) => a.id).filter((id) => result.values[id]);
    app.updateSettings({ hashAlgorithms: ids.length ? ids : ['crc32'] });
  }

  // ───────── statistics

  function statsHtml() {
    const tb = tab();
    if (!tb) return empty('props.noDocument');
    const sc = scopeOf(tb);
    const r = state.stats?.doc === tb.doc.id && state.stats.version === tb.doc.info.version ? state.stats : null;
    const tools = `<div class="prop-tools"><span class="chip">${icon(sc.selection ? 'selectAll' : 'file')}${h(sc.selection ? t('scope.selection', { n: sc.length.toLocaleString() }) : t('scope.all'))}</span><span class="grow"></span>
      <button class="button small primary" data-prop-action="stats-run" title="${h(t('stats.run'))}">${icon('play')}<span>${h(t('stats.run'))}</span></button></div>`;
    if (!r) return tools + empty('stats.hint');
    const pct = (n) => (r.length ? `${((n / r.length) * 100).toFixed(1)}%` : '—');
    const rows = [
      [t('stats.entropy'), `${r.entropy.toFixed(4)} ${t('stats.bitsPerByte')}`], [t('stats.distinct'), `${r.distinct} / 256`],
      [t('stats.zero'), `${r.zero.toLocaleString()} (${pct(r.zero)})`], [t('stats.printable'), `${r.printable.toLocaleString()} (${pct(r.printable)})`],
      [t('stats.control'), `${r.control.toLocaleString()} (${pct(r.control)})`], [t('stats.high'), `${r.high.toLocaleString()} (${pct(r.high)})`],
      [t('stats.mean'), String(r.mean)], [t('stats.median'), String(r.median)], [t('stats.chi'), `${r.chiSquare} (p ≈ ${r.chiSquareP}%)`],
      [t('stats.pi'), `${r.monteCarloPi} (${t('stats.error')} ${r.monteCarloError}%)`], [t('stats.serial'), String(r.serialCorrelation)],
      [t('stats.common'), r.mostCommon.slice(0, 8).map((x) => `${x.byte.toString(16).padStart(2, '0').toUpperCase()}×${x.count.toLocaleString()}`).join(' ')],
    ];
    return `${tools}<div class="prop-note">${icon('chartBar')}<span>${h(t('stats.histogram'))}</span></div><canvas class="hist-canvas" data-hist></canvas>
      <div class="prop-note">${icon('activity')}<span>${h(t('stats.entropyGraph', { size: r.blockSize.toLocaleString() }))}</span></div><canvas class="entropy-canvas" data-entropy title="${h(t('stats.entropyClick'))}"></canvas>
      <table class="prop-table">${rows.map(([k, v]) => `<tr><th>${h(k)}</th><td>${h(v)}</td></tr>`).join('')}</table>`;
  }

  async function runStats() {
    const tb = tab();
    if (!tb) return;
    const sc = scopeOf(tb);
    const r = await app.withProgress('progress.stats', tb.doc.name, (op) => core('stats', { id: tb.doc.id, offset: sc.offset, length: sc.length, blocks: app.settings().statsBlocks }, op), { cancellable: true });
    state.stats = { ...r, doc: tb.doc.id, version: tb.doc.info.version };
    app.updateSettings({ rightTab: 'stats', showRightPanel: true });
  }

  function drawCanvas(canvas, draw) {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.clientWidth; const hgt = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    draw(g, w, hgt, { accent: css.getPropertyValue('--accent').trim() || '#3b82f6', muted: css.getPropertyValue('--muted').trim() || '#888', danger: css.getPropertyValue('--danger').trim() || '#e5484d', border: css.getPropertyValue('--border').trim() || '#ccc' });
  }

  function afterRender(body) {
    const r = state.stats;
    const hist = body.querySelector('[data-hist]');
    if (hist && r) drawCanvas(hist, (g, w, hgt, c) => {
      // Square-root scale: one very common value (often 00) does not flatten all the others.
      const max = Math.sqrt(Math.max(1, ...r.histogram));
      const bw = w / 256;
      for (let i = 0; i < 256; i += 1) {
        const v = Math.sqrt(r.histogram[i]) / max;
        g.fillStyle = i === 0 ? c.muted : i >= 0x20 && i < 0x7F ? c.accent : i >= 0x80 ? '#8b5cf6' : '#d9822b';
        g.fillRect(i * bw, hgt - v * (hgt - 4), Math.max(1, bw - 0.3), v * (hgt - 4));
      }
    });
    const ent = body.querySelector('[data-entropy]');
    if (ent && r) drawCanvas(ent, (g, w, hgt, c) => {
      const list = r.blockEntropy;
      g.strokeStyle = c.border; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, hgt * (1 - 7 / 8)); g.lineTo(w, hgt * (1 - 7 / 8)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = c.accent; g.lineWidth = 1.5; g.beginPath();
      list.forEach((e, i) => { const x = list.length > 1 ? (i / (list.length - 1)) * w : w / 2; const y = hgt - (e / 8) * (hgt - 4) - 2; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    });
  }

  // ───────── bookmarks

  function bookmarksHtml() {
    const tb = tab();
    if (!tb) return empty('props.noDocument');
    const list = tb.doc.bookmarks;
    const tools = `<div class="prop-tools"><span class="chip">${icon('bookmark')}${list.length}</span><span class="grow"></span>
      <button class="button small" data-command="bookmarkToggle" title="${h(t('bookmark.toggle'))}">${icon('bookmarkAdd')}<span>${h(t('bookmark.add'))}</span></button>
      <button class="icon-button" data-command="bookmarkPrev" title="${h(t('bookmark.prev'))}">${icon('chevronUp')}</button>
      <button class="icon-button" data-command="bookmarkNext" title="${h(t('bookmark.next'))}">${icon('chevronDown')}</button>
      <button class="icon-button" data-prop-action="bookmark-clear" title="${h(t('bookmark.clear'))}" ${list.length ? '' : 'disabled'}>${icon('trash')}</button></div>`;
    if (!list.length) return tools + empty('bookmark.empty');
    return tools + list.map((b, i) => `<div class="bm-row" data-bookmark="${i}" title="${h(t('bookmark.rowTip'))}">
      <button class="sw" style="background:${h(b.color)}" data-bookmark-color="${i}" title="${h(t('bookmark.color'))}" aria-label="${h(t('bookmark.color'))}"></button>
      <span class="of">${h(off(b.offset))}</span><span class="nm">${h(b.name)}</span><span class="of">${h(b.length.toLocaleString())} B</span>
      <button class="icon-button" data-bookmark-rename="${i}" title="${h(t('bookmark.rename'))}">${icon('edit')}</button>
      <button class="icon-button danger" data-bookmark-remove="${i}" title="${h(t('bookmark.remove'))}">${icon('close')}</button></div>`).join('');
  }

  // ───────── routing

  function html(tabId) {
    return ({ inspector: inspectorHtml, structure: structureHtml, info: infoHtml, hashes: hashesHtml, stats: statsHtml, bookmarks: bookmarksHtml })[tabId]?.() ?? '';
  }

  /** A click in the right panel; true when handled. */
  function click(target, event) {
    const tb = tab();
    const hAdd = target.closest('[data-hash-add]');
    if (hAdd) { addToDb(hAdd.dataset.hashAdd).catch((e) => app.showError('error.hashdb', e)); return true; }
    const hRemove = target.closest('[data-hash-remove]');
    if (hRemove) { removeHash(hashDb, hRemove.dataset.hashRemove); persist(); return true; }
    const endian = target.closest('[data-prop-endian]');
    if (endian) { app.updateSettings({ endian: endian.dataset.propEndian }); state.inspectKey = ''; refreshInspector(); return true; }
    const edit = target.closest('[data-inspect-edit]');
    if (edit && event?.detail >= 2) { editInspected(edit.dataset.inspectEdit); return true; }
    if (edit) return true;
    const copy = target.closest('[data-copy]');
    if (copy) { app.copyText(copy.dataset.copy); return true; }
    const toggle = target.closest('[data-tp-toggle]');
    if (toggle) { const p = toggle.dataset.tpToggle; if (state.collapsed.has(p)) state.collapsed.delete(p); else state.collapsed.add(p); app.rerender(); return true; }
    const node = target.closest('[data-tp-node]');
    if (node && tb?.view) { const n = nodeAt(node.dataset.tpNode); state.activeNode = node.dataset.tpNode; if (n) tb.view.select(n.offset, n.offset + Math.max(1, n.size), { center: true }); app.rerender(); return true; }
    const bmColor = target.closest('[data-bookmark-color]');
    if (bmColor && tb) { const b = tb.doc.bookmarks[Number(bmColor.dataset.bookmarkColor)]; b.color = BOOKMARK_COLORS[(BOOKMARK_COLORS.indexOf(b.color) + 1) % BOOKMARK_COLORS.length]; app.editor.saveBookmarks(tb.doc); tb.view?.schedule(); app.rerender(); return true; }
    const bmRemove = target.closest('[data-bookmark-remove]');
    if (bmRemove && tb) { tb.doc.bookmarks.splice(Number(bmRemove.dataset.bookmarkRemove), 1); app.editor.saveBookmarks(tb.doc); tb.view?.schedule(); app.rerender(); return true; }
    const bmRename = target.closest('[data-bookmark-rename]');
    if (bmRename && tb) {
      const b = tb.doc.bookmarks[Number(bmRename.dataset.bookmarkRename)];
      app.promptText({ title: t('bookmark.rename'), value: b.name, glyph: 'bookmark' }).then((name) => { if (name) { b.name = name; app.editor.saveBookmarks(tb.doc); app.rerender(); } });
      return true;
    }
    const bm = target.closest('[data-bookmark]');
    if (bm && tb?.view) { const b = tb.doc.bookmarks[Number(bm.dataset.bookmark)]; tb.view.select(b.offset, b.offset + Math.max(1, b.length), { center: true }); return true; }
    const ent = target.closest('[data-entropy]');
    if (ent && tb?.view && state.stats) {
      const box = ent.getBoundingClientRect();
      const i = Math.floor(((event.clientX - box.left) / box.width) * state.stats.blockEntropy.length);
      const at = state.stats.offset + i * state.stats.blockSize;
      tb.view.select(at, Math.min(tb.doc.len, at + state.stats.blockSize), { center: true });
      return true;
    }
    const act = target.closest('[data-prop-action]');
    if (!act) return false;
    switch (act.dataset.propAction) {
      case 'template-run': app.runTemplate(tb, { template: app.panelTemplate?.() ?? 'auto' }); break;
      case 'template-edit': app.openTool('template'); break;
      case 'template-clear': if (tb) { tb.doc.template = null; tb.doc.marks.template = []; tb.view?.schedule(); app.rerender(); } break;
      case 'template-expand': state.collapsed.clear(); app.rerender(); break;
      case 'template-collapse': { const all = flatten(tb?.doc.template?.nodes ?? [], 0, '', []); for (const x of all) if (x.n.children?.length) state.collapsed.add(x.p); app.rerender(); break; }
      case 'hash-run': runHashes().catch((e) => app.showError('error.hash', e)); break;
      case 'hash-choose': chooseHashes(); break;
      case 'hashdb-import': importDb().catch((e) => app.showError('error.hashdb', e)); break;
      case 'hashdb-export': app.saveText(exportHashList(hashDb), 'hashes.txt').catch((e) => app.showError('error.hashdb', e)); break;
      case 'hashdb-clear': app.ask({ kind: 'hashdbClear', icon: 'warning', title: t('hashdb.clear'), message: t('hashdb.clearAsk', { n: hashDb.entries.size.toLocaleString() }), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'clear', label: t('hashdb.clear'), icon: 'trash', danger: true }] }).then((c) => { if (c === 'clear') { hashDb.entries.clear(); persist(); } }); break;
      case 'stats-run': runStats().catch((e) => app.showError('error.stats', e)); break;
      case 'bookmark-clear': if (tb) { tb.doc.bookmarks.length = 0; app.editor.saveBookmarks(tb.doc); tb.view?.schedule(); app.rerender(); } break;
      default: return false;
    }
    return true;
  }

  return { html, click, afterRender, caretMoved, refreshInspector, runHashes, runStats, chooseHashes, state, hashDb, resetCollapse: () => state.collapsed.clear() };
}
