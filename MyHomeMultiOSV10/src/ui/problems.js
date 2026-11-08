// The bottom panel: Problems. It lists what to fix before publishing (errors, warnings) and the
// words the English and Korean dictionaries do not know (spelling), for the open site, checked
// again a moment after every change. A click shows the place on the canvas, a double click goes
// there to fix it (the field, with the word selected); a spelling row's menu has corrections,
// "Add to dictionary" and "Ignore". The toolbar's panel button (Ctrl+J) opens and closes it.
import { blockLabel, blockDef, fieldLabel } from '../domain/blocks.js';
import { countProblems, filterProblems, groupProblems, occurrenceIndex, replaceRange, siteProblems } from '../domain/problems.js';
import { decodeWordList, SpellChecker } from '../domain/spell.js';
import { SPELL_EXTRA } from '../domain/spell-extra.js';
import { normalizeUserWords, PANEL_MIN, BOTTOM_MAX_SHARE } from '../domain/settings.js';
import { escapeHtml, keyLabel } from './dom.js';
import { icon } from '../icons.js';

const SEVERITY_ICON = { error: 'error', warning: 'warning', spelling: 'spellCheck' };
const SEVERITY_LABEL = { error: 'problems.errors', warning: 'problems.warnings', spelling: 'problems.spelling' };
const idle = (fn) => (typeof globalThis.requestIdleCallback === 'function' ? globalThis.requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 1));

/** Loads the two word lists once (about 1.4 MB, shared by every site). */
let dictionaries = null;
export function loadDictionaries(base = globalThis.document?.baseURI ?? '') {
  dictionaries ??= Promise.all(['en', 'ko'].map(async (id) => {
    const response = await fetch(new URL(`dict/${id}.txt`, base));
    if (!response.ok) throw new Error(`dict/${id}.txt: ${response.status}`);
    return decodeWordList(await response.text());
  })).then(([en, ko]) => ({ en, ko })).catch((error) => { dictionaries = null; throw error; });
  return dictionaries;
}

export class ProblemsPanel {
  /** `app`: the main window (state, t, actions); see app.js. */
  constructor(app) {
    this.app = app;
    this.rows = [];
    this.docId = null;
    this.version = -1;
    this.ms = 0;
    this.filter = { severity: 'all', current: false, query: '' };
    this.selected = null;
    this.timer = 0;
    this.checker = null;
    this.dictionaryError = null;
    this.ignored = new Map(); // site id → Set of words ignored in this session
    this.suggestions = new Map();
  }

  get t() { return this.app.t; }
  get settings() { return this.app.state.settings; }
  get element() { return this.app.root.querySelector('#bottom-panel'); }
  get shown() { return this.settings.showBottomPanel && !this.app.onStart(); }

  // ───────────────────────── checking

  /** The checker with the user's words (the dictionaries load the first time). */
  async ensureChecker() {
    if (this.checker) return this.checker;
    const { en, ko } = await loadDictionaries();
    this.checker ??= new SpellChecker({ en, ko, extra: SPELL_EXTRA, user: this.settings.userWords });
    this.userWordsKey = this.settings.userWords.join('\n');
    return this.checker;
  }

  /** After a change: checks again once the edits pause (and in idle time). */
  schedule(delay = 350) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => idle(() => this.check()), delay);
  }

  /** Checks the active site now. Resolves when done (the dictionaries may have to load first). */
  async check() {
    clearTimeout(this.timer);
    const doc = this.app.activeDoc();
    if (!doc) {
      if (this.docId) { this.rows = []; this.docId = null; this.render(); this.app.renderStatus(); }
      return this.rows;
    }
    const s = this.settings;
    const spelling = s.spellCheck && (s.spellEnglish || s.spellKorean);
    if (spelling && !this.checker) {
      try { await this.ensureChecker(); } catch (error) { this.dictionaryError = error; }
    }
    if (this.checker && this.userWordsKey !== s.userWords.join('\n')) { this.checker.setUserWords(s.userWords); this.userWordsKey = s.userWords.join('\n'); }
    const started = performance.now();
    const ignored = this.ignored.get(doc.site.id) ?? new Set();
    this.rows = siteProblems(doc.site, { checker: spelling ? this.checker : null })
      .filter((r) => r.kind !== 'spelling' || ((/[가-힣]/.test(r.word) ? s.spellKorean : s.spellEnglish) && !ignored.has(r.word)));
    this.ms = performance.now() - started;
    this.docId = doc.id;
    this.version = doc.version ?? 0;
    this.suggestions.clear();
    if (this.selected && !this.rows.some((r) => r.key === this.selected)) this.selected = null;
    this.render();
    this.app.renderStatus();
    this.markCanvas();
    return this.rows;
  }

  /** The rows of the active site (none while its check is pending). */
  list() {
    const doc = this.app.activeDoc();
    return doc && this.docId === doc.id ? this.rows : [];
  }

  counts() { return countProblems(this.list()); }

  message(r) {
    if (r.kind === 'spelling') return this.t('problems.unknownWord', { word: r.word });
    return this.t(r.code, r.params);
  }

  shownRows() {
    const page = this.filter.current ? this.app.currentPage()?.id ?? '-' : null;
    return groupProblems(filterProblems(this.list(), { severity: this.filter.severity, pageId: page, query: this.filter.query, text: (r) => `${this.message(r)} ${this.where(r).join(' ')}` }));
  }

  /** [page or "Site", block, field] for a row. */
  where(r) {
    const t = this.t;
    const L = this.app.language();
    const site = this.app.activeDoc()?.site;
    const page = r.pageId ? site?.pages.find((p) => p.id === r.pageId) : null;
    if (r.scope === 'site') return [t('problems.site'), t({ 'meta.title': 'site.title', 'meta.description': 'site.description', 'meta.keywords': 'site.keywords' }[r.path] ?? 'panel.site')];
    if (r.scope === 'page') return [page?.name || t('problems.untitledPage'), r.path ? t(`page.${r.path}`, null, r.path) : ''];
    const block = this.app.findBlock(r.blockId);
    const def = blockDef(block?.type);
    const field = this.app.fieldOf(r.blockId, r.path);
    const parts = String(r.path).split('.');
    const item = parts.length === 3 ? ` ${Number(parts[1]) + 1}` : '';
    const sub = parts.length === 3 ? def?.fields.find((f) => f.key === parts[0])?.item?.find((f) => f.key === parts[2]) : null;
    const fieldName = sub ? `${fieldLabel(def.fields.find((f) => f.key === parts[0]), L)}${item} · ${fieldLabel(sub, L)}` : field ? fieldLabel(field, L) : '';
    const pageName = def?.global ? t(block?.type === 'navbar' ? 'problems.allPagesHeader' : 'problems.allPagesFooter') : page?.name ?? '';
    return [pageName, `${block ? blockLabel(block.type, L) : ''}${fieldName ? ` › ${fieldName}` : ''}`];
  }

  /** The text of the row's field and a short excerpt around the word. */
  fieldText(r) {
    const site = this.app.activeDoc()?.site;
    if (!site) return '';
    if (r.scope === 'site') return String(site.meta?.[r.path.replace('meta.', '')] ?? '');
    if (r.scope === 'page') return String(site.pages.find((p) => p.id === r.pageId)?.[r.path] ?? '');
    const block = this.app.findBlock(r.blockId);
    return String(String(r.path).split('.').reduce((o, k) => o?.[k], block?.props) ?? '');
  }

  excerpt(r) {
    const text = this.fieldText(r).replace(/\s+/g, ' ');
    if (r.kind !== 'spelling') return escapeHtml(text.slice(0, 80));
    const raw = this.fieldText(r);
    const before = raw.slice(Math.max(0, r.start - 24), r.start).replace(/\s+/g, ' ');
    const after = raw.slice(r.end, r.end + 24).replace(/\s+/g, ' ');
    return `${r.start > 24 ? '…' : ''}${escapeHtml(before)}<mark>${escapeHtml(raw.slice(r.start, r.end))}</mark>${escapeHtml(after)}${r.end + 24 < raw.length ? '…' : ''}`;
  }

  suggest(r) {
    if (r.kind !== 'spelling' || !this.checker) return [];
    if (!this.suggestions.has(r.word)) this.suggestions.set(r.word, this.checker.suggest(r.word, 5));
    return this.suggestions.get(r.word);
  }

  // ───────────────────────── drawing

  height() {
    const max = Math.max(PANEL_MIN.bottom, Math.round(window.innerHeight * BOTTOM_MAX_SHARE));
    return Math.max(PANEL_MIN.bottom, Math.min(max, this.settings.bottomHeight));
  }

  render() {
    const panel = this.element;
    if (!panel || !this.settings.showBottomPanel) return;
    const t = this.t;
    const f = this.filter;
    const L = this.app.language();
    if (panel.dataset.lang !== L || !panel.querySelector('.problems-header')) {
      panel.dataset.lang = L;
      const seg = (id, label, glyph) => `<button class="segment" data-problem-severity="${id}" role="radio" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`;
      panel.innerHTML = `
        <div class="problems-header">
          <span class="problems-title">${icon('problems')}<span>${escapeHtml(t('problems.title'))}</span></span>
          <span class="problem-count error" data-problem-count="error">${icon('error')}<b>0</b></span>
          <span class="problem-count warning" data-problem-count="warning">${icon('warning')}<b>0</b></span>
          <span class="problem-count spelling" data-problem-count="spelling">${icon('spellCheck')}<b>0</b></span>
          <span class="segmented small" role="radiogroup" aria-label="${escapeHtml(t('problems.severityFilter'))}">${seg('all', t('problems.all'))}${seg('error', t('problems.errors'), 'error')}${seg('warning', t('problems.warnings'), 'warning')}${seg('spelling', t('problems.spelling'), 'spellCheck')}</span>
          <button class="problem-toggle" data-problem-current title="${escapeHtml(t('problems.currentOnlyTip'))}" aria-label="${escapeHtml(t('problems.currentOnly'))}">${icon('pageItem')}<span>${escapeHtml(t('problems.currentOnly'))}</span></button>
          <label class="search-box problems-search" title="${escapeHtml(t('problems.filter'))}">${icon('filter')}<input id="problem-query" type="search" placeholder="${escapeHtml(t('problems.filter'))}" aria-label="${escapeHtml(t('problems.filter'))}" spellcheck="false" /></label>
          <span class="grow"></span>
          <span class="problems-meta" id="problems-meta"></span>
          <button class="problem-toggle" data-problem-spell title="${escapeHtml(t('problems.spellTip'))}" aria-label="${escapeHtml(t('action.spellCheck'))}">${icon('spellCheck')}<span>${escapeHtml(t('action.spellCheck'))}</span></button>
          <button class="button small" data-command="dictionary" title="${escapeHtml(t('tip.dictionary'))}" aria-label="${escapeHtml(t('action.dictionary'))}">${icon('dictionary')}<span>${escapeHtml(t('action.dictionary'))}</span></button>
          <button class="button small" data-problem-run title="${escapeHtml(t('problems.runNowTip'))}" aria-label="${escapeHtml(t('problems.runNow'))}">${icon('refresh')}<span>${escapeHtml(t('problems.runNow'))}</span></button>
          <button class="icon-button" data-command="bottomPanel" title="${escapeHtml(`${t('problems.close')} (${keyLabel('Ctrl+J')})`)}" aria-label="${escapeHtml(t('problems.close'))}">${icon('close')}</button>
        </div>
        <div class="problems-list" tabindex="0" role="listbox" aria-label="${escapeHtml(t('problems.list'))}">
          <div class="problem-row head" aria-hidden="true"><span class="cell sev"></span><span class="cell msg">${escapeHtml(t('problems.colMessage'))}</span><span class="cell el">${escapeHtml(t('problems.colWhere'))}</span><span class="cell type">${escapeHtml(t('problems.colKind'))}</span><span class="cell dg">${escapeHtml(t('problems.colText'))}</span><span class="cell rule">${escapeHtml(t('problems.colFix'))}</span></div>
          <div class="problems-body"></div>
        </div>`;
    }
    const doc = this.app.activeDoc();
    const all = this.list();
    const counts = countProblems(all);
    for (const severity of ['error', 'warning', 'spelling']) {
      const badge = panel.querySelector(`[data-problem-count="${severity}"]`);
      badge.querySelector('b').textContent = String(counts[severity]);
      badge.title = t(`problems.${severity}Count`, { count: counts[severity] });
    }
    for (const b of panel.querySelectorAll('[data-problem-severity]')) { const on = b.dataset.problemSeverity === f.severity; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); }
    const current = panel.querySelector('[data-problem-current]');
    current.classList.toggle('active', f.current);
    current.setAttribute('aria-pressed', String(f.current));
    current.disabled = !doc;
    const spell = panel.querySelector('[data-problem-spell]');
    spell.classList.toggle('active', this.settings.spellCheck);
    spell.setAttribute('aria-pressed', String(this.settings.spellCheck));
    const query = panel.querySelector('#problem-query');
    if (document.activeElement !== query && query.value !== f.query) query.value = f.query;
    panel.querySelector('[data-problem-run]').disabled = !doc;
    const meta = this.dictionaryError ? t('problems.noDictionary') : doc && this.docId === doc.id ? t('problems.checked', { count: all.length, ms: Math.max(1, Math.round(this.ms)) }) : '';
    panel.querySelector('#problems-meta').textContent = meta;
    const groups = this.shownRows();
    let html;
    if (!doc) html = `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('problems.noSite'))}</span></p>`;
    else if (!groups.length) html = `<p class="problems-empty">${icon(all.length ? 'filter' : 'check')}<span>${escapeHtml(t(all.length ? 'problems.noneFiltered' : 'problems.none'))}</span></p>`;
    else {
      let budget = 1000;
      html = groups.map((g) => {
        const rows = g.rows.slice(0, Math.max(0, budget));
        budget -= rows.length;
        return `<div class="problem-group ${g.severity}">${icon(SEVERITY_ICON[g.severity])}<span>${escapeHtml(t(SEVERITY_LABEL[g.severity]))}</span><b>${g.rows.length}</b></div>${rows.map((r) => this.rowHtml(r)).join('')}`;
      }).join('');
    }
    const body = panel.querySelector('.problems-body');
    if (body.dataset.html !== html) { body.innerHTML = html; body.dataset.html = html; }
  }

  rowHtml(r) {
    const t = this.t;
    const [page, part] = this.where(r);
    const selected = r.key === this.selected;
    const message = this.message(r);
    const fix = r.kind === 'spelling'
      ? `<button class="problem-fix" data-problem-add="${escapeHtml(r.key)}" title="${escapeHtml(t('problems.addWordTip', { word: r.word }))}">${icon('addWord')}<span>${escapeHtml(t('problems.addWord'))}</span></button>${selected ? this.suggest(r).slice(0, 3).map((w) => `<button class="problem-fix suggestion" data-problem-replace="${escapeHtml(r.key)}" data-word="${escapeHtml(w)}" title="${escapeHtml(t('problems.replaceTip', { word: w }))}">${escapeHtml(w)}</button>`).join('') : ''}`
      : `<code>${escapeHtml(r.code.replace(/^check\./, ''))}</code>`;
    return `<div class="problem-row ${r.severity} ${selected ? 'selected' : ''}" role="option" aria-selected="${selected}" data-problem="${escapeHtml(r.key)}" title="${escapeHtml(`${message}\n${t('problems.rowTip')}`)}">
      <span class="cell sev">${icon(SEVERITY_ICON[r.severity])}</span>
      <span class="cell msg">${escapeHtml(message)}</span>
      <span class="cell el">${icon(r.scope === 'site' ? 'siteProps' : r.scope === 'page' ? 'pageItem' : blockDef(this.app.findBlock(r.blockId)?.type)?.icon ?? 'dot', 'icon tiny')}<b>${escapeHtml(page)}</b>${part ? `<small>${escapeHtml(part)}</small>` : ''}</span>
      <span class="cell type">${escapeHtml(t(r.kind === 'spelling' ? (/[가-힣]/.test(r.word) ? 'problems.kindKorean' : 'problems.kindEnglish') : 'problems.kindCheck'))}</span>
      <span class="cell dg">${this.excerpt(r)}</span>
      <span class="cell rule">${fix}</span>
    </div>`;
  }

  /** Wavy underlines under the unknown words of the page on the canvas. */
  markCanvas() {
    const view = this.app.state.view;
    if (!view?.markSpelling) return;
    const page = this.app.currentPage();
    const rows = this.shown && this.settings.spellCheck ? this.list().filter((r) => r.kind === 'spelling' && r.scope === 'block' && (r.pageId === page?.id || this.app.isGlobalBlock(r.blockId))) : [];
    view.markSpelling(rows.map((r) => ({ blockId: r.blockId, path: r.path, word: r.word, occurrence: occurrenceIndex(this.fieldText(r), r.word, r.start) })));
  }

  // ───────────────────────── going to a problem

  select(key, { reveal = false, edit = false } = {}) {
    this.selected = key;
    this.render();
    this.element?.querySelector(`[data-problem="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
    const row = this.list().find((r) => r.key === key);
    if (row && reveal) this.reveal(row, { edit });
    return row;
  }

  /** Shows where a problem is: its page, its block selected and scrolled into sight with the word marked;
   * `edit` also opens its field in the editor with the word selected. */
  reveal(row, { edit = false } = {}) {
    const app = this.app;
    if (row.scope === 'site') { if (edit) app.focusEditor('site', `[data-site-field="${CSS.escape(row.path.replace('meta.', ''))}"]`, row); return; }
    if (row.pageId && row.pageId !== app.currentPage()?.id && !(row.scope === 'block' && app.isGlobalBlock(row.blockId))) app.openPage(row.pageId);
    if (row.scope === 'page') { app.focusEditor('page', `[data-page-field="${CSS.escape(row.path)}"]`, edit ? row : null); return; }
    app.select(row.blockId, { from: 'problems' });
    const occurrence = row.kind === 'spelling' ? occurrenceIndex(this.fieldText(row), row.word, row.start) : 0;
    requestAnimationFrame(() => app.state.view?.showProblem?.({ blockId: row.blockId, path: row.path, word: row.word ?? '', occurrence }));
    if (edit) app.focusEditor('content', `#editors [data-prop="${CSS.escape(row.path)}"][data-block="${CSS.escape(row.blockId)}"]`, row);
  }

  // ───────────────────────── fixing

  async addWord(word) {
    const words = normalizeUserWords([...this.settings.userWords, word]);
    this.app.updateSettings({ userWords: words });
    this.app.notify('success', this.t('problems.wordAdded', { word }));
    await this.check();
  }

  ignore(word) {
    const site = this.app.activeDoc()?.site;
    if (!site) return;
    if (!this.ignored.has(site.id)) this.ignored.set(site.id, new Set());
    this.ignored.get(site.id).add(word);
    this.app.notify('info', this.t('problems.wordIgnored', { word }));
    this.check();
  }

  /** Puts a correction in place of the word (one undo step). */
  replace(row, replacement) {
    const text = this.fieldText(row);
    let { start, end } = row;
    if (text.slice(start, end) !== row.word) {
      const at = text.indexOf(row.word);
      if (at < 0) return false;
      start = at; end = at + row.word.length;
    }
    const next = replaceRange(text, start, end, replacement);
    this.app.setFieldText(row, next);
    this.app.notify('success', this.t('problems.replaced', { from: row.word, to: replacement }));
    this.check();
    return true;
  }

  /** The right-click menu of a row. */
  contextMenu(row, event) {
    const t = this.t;
    const suggestions = this.suggest(row);
    const handlers = { 'custom:goto': () => this.reveal(row, { edit: true }), 'custom:copy': () => this.app.copyText(`${this.message(row)} — ${this.where(row).filter(Boolean).join(' › ')}`) };
    const items = [{ id: 'custom:goto', label: t('problems.goTo'), icon: 'goTo', shortcut: 'Enter' }];
    if (row.kind === 'spelling') {
      items.push({ separator: true });
      suggestions.forEach((word, i) => { handlers[`custom:replace${i}`] = () => this.replace(row, word); items.push({ id: `custom:replace${i}`, label: t('problems.replaceWith', { word }), icon: 'replace' }); });
      if (!suggestions.length) items.push({ id: 'custom:none', label: t('problems.noSuggestions'), icon: 'info', disabled: true });
      handlers['custom:add'] = () => this.addWord(row.word);
      handlers['custom:ignore'] = () => this.ignore(row.word);
      items.push({ separator: true }, { id: 'custom:add', label: t('problems.addWordNamed', { word: row.word }), icon: 'addWord' }, { id: 'custom:ignore', label: t('problems.ignoreNamed', { word: row.word }), icon: 'wordIgnore' });
    }
    items.push({ separator: true }, { id: 'custom:copy', label: t('problems.copy'), icon: 'copy' }, ...this.app.menuItems(['dictionary', 'spellCheck']));
    return this.app.showMenu(items, this.app.menuAnchor(event), 'context', { handlers, header: { icon: SEVERITY_ICON[row.severity], title: row.kind === 'spelling' ? row.word : t(SEVERITY_LABEL[row.severity]) } });
  }

  // ───────────────────────── events

  bind() {
    const panel = this.element;
    if (!panel) return;
    panel.addEventListener('click', (event) => {
      const severity = event.target.closest('[data-problem-severity]');
      if (severity) { this.filter = { ...this.filter, severity: severity.dataset.problemSeverity }; this.render(); return; }
      const current = event.target.closest('[data-problem-current]');
      if (current && !current.disabled) { this.filter = { ...this.filter, current: !this.filter.current }; this.render(); return; }
      if (event.target.closest('[data-problem-spell]')) { this.app.run('spellCheck'); return; }
      if (event.target.closest('[data-problem-run]')) { this.runNow(); return; }
      const add = event.target.closest('[data-problem-add]');
      if (add) { const row = this.list().find((r) => r.key === add.dataset.problemAdd); if (row) this.addWord(row.word); return; }
      const fix = event.target.closest('[data-problem-replace]');
      if (fix) { const row = this.list().find((r) => r.key === fix.dataset.problemReplace); if (row) this.replace(row, fix.dataset.word); return; }
      const row = event.target.closest('[data-problem]');
      if (row) this.select(row.dataset.problem, { reveal: true });
    });
    panel.addEventListener('dblclick', (event) => {
      if (event.target.closest('button')) return;
      const row = event.target.closest('[data-problem]');
      if (row) this.select(row.dataset.problem, { reveal: true, edit: true });
    });
    panel.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('[data-problem]');
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      const problem = this.select(row.dataset.problem);
      if (problem) this.contextMenu(problem, event);
    });
    panel.addEventListener('input', (event) => {
      if (event.target.id !== 'problem-query') return;
      this.filter = { ...this.filter, query: event.target.value };
      this.render();
    });
    panel.addEventListener('keydown', (event) => {
      if (!event.target.closest('.problems-list')) return;
      const keys = this.shownRows().flatMap((g) => g.rows).map((r) => r.key);
      if (!keys.length) return;
      const at = keys.indexOf(this.selected);
      const go = (i) => { event.preventDefault(); event.stopPropagation(); this.select(keys[Math.max(0, Math.min(keys.length - 1, i))], { reveal: true }); };
      if (event.key === 'ArrowDown') go(at < 0 ? 0 : at + 1);
      else if (event.key === 'ArrowUp') go(at < 0 ? 0 : at - 1);
      else if (event.key === 'Home') go(0);
      else if (event.key === 'End') go(keys.length - 1);
      else if (event.key === 'PageDown') go(at + 10);
      else if (event.key === 'PageUp') go(at - 10);
      else if (event.key === 'Enter' && at >= 0) { event.preventDefault(); event.stopPropagation(); this.select(keys[at], { reveal: true, edit: true }); }
      else if (event.key === 'ContextMenu' && at >= 0) { event.preventDefault(); const r = this.list().find((x) => x.key === keys[at]); const box = this.element.querySelector(`[data-problem="${CSS.escape(keys[at])}"]`)?.getBoundingClientRect(); if (r) this.contextMenu(r, { clientX: (box?.left ?? 0) + 40, clientY: box?.bottom ?? 0 }); }
    });
    this.app.root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
      if (!this.settings.showBottomPanel || event.button !== 0) return;
      event.preventDefault();
      const start = this.height();
      this.app.pointerDrag(event, {
        cursor: 'row-resize',
        move: (dx, dy) => {
          const max = Math.max(PANEL_MIN.bottom, Math.round(window.innerHeight * BOTTOM_MAX_SHARE));
          const height = Math.max(PANEL_MIN.bottom, Math.min(max, start - dy));
          this.app.root.style.setProperty('--bottom-height', `${height}px`);
          this.settings.bottomHeight = height;
        },
        end: (e, moved) => { if (moved) this.app.updateSettings({ bottomHeight: this.settings.bottomHeight }, { quiet: true }); },
      });
    });
  }

  /** "Check now": checks and says how it went. */
  async runNow() {
    await this.check();
    const c = this.counts();
    this.app.notify(c.total ? 'info' : 'success', c.total ? this.t('problems.summary', { errors: c.error, warnings: c.warning, spelling: c.spelling }) : this.t('problems.none'));
  }

  /** Opens the panel and puts the keyboard in its list. */
  async show() {
    if (!this.settings.showBottomPanel) this.app.updateSettings({ showBottomPanel: true });
    await this.check();
    requestAnimationFrame(() => this.element?.querySelector('.problems-list')?.focus({ preventScroll: true }));
  }
}
