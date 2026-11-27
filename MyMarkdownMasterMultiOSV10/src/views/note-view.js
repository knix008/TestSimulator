// One note in one tab. Modes: 'live' (Obsidian / Typora live preview), 'source' (raw Markdown),
// 'reading' (the rendered note) and 'split' (Markdific / MarkText: source beside a live preview, both halves
// collapsible, the divider draggable, scrolling kept in step). The properties (front matter) sit above as
// a collapsible table. The text itself lives in the app's document store (one per path, shared by every
// tab showing the note); this view shows and edits it.
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { escapeHtml, pointerDrag } from '../ui/dom.js';

export const NOTE_MODES = ['live', 'source', 'reading', 'split'];
const MODE_ICONS = { live: 'editMode', source: 'markdownFile', reading: 'preview', split: 'splitView' };

/**
 * app: { doc(path) → { text }, updateText(path, text, from), renderNote(path, text) → Promise<{ html, frontmatter }>,
 *        createEditor(host, path, view) → editor handle, renderPreview(el, rendered, path, view), previewScrollTo(el, line),
 *        previewTopLine(el), propertiesHtml(path, frontmatter), settings(), saveTabState(tab), onFocus(view),
 *        backlinkCount(path), breadcrumb(path) }
 */
export class NoteView {
  constructor(tab, app) {
    this.tab = tab;
    this.app = app;
    this.path = tab.path;
    this.el = document.createElement('div');
    this.el.className = 'note-view';
    this.editor = null;
    this.renderTimer = 0;
    this.renderSeq = 0;
    this.syncing = false;
    this.lastRendered = null;
    const s = tab.state ?? (tab.state = {});
    s.share ??= app.settings().splitShare ?? 50;
    s.collapsed ??= null; // 'editor' | 'preview' | null (split mode)
    s.propertiesOpen ??= true;
    this.build();
    this.setMode(tab.mode ?? app.settings().defaultMode ?? 'live', { initial: true });
  }

  get mode() { return this.tab.mode; }

  build() {
    this.el.innerHTML = `
      <div class="note-header">
        <div class="note-crumb" data-note-crumb></div>
        <span class="grow"></span>
        <span class="note-badges" data-note-badges></span>
        <span class="seg-toggle note-modes" role="tablist">${NOTE_MODES.map((m) => `<button data-note-mode="${m}" role="tab" title="${escapeHtml(t(`mode.${m}.tip`))}">${icon(MODE_ICONS[m])}<span>${escapeHtml(t(`mode.${m}`))}</span></button>`).join('')}</span>
        <button class="icon-button" data-note-more title="${escapeHtml(t('note.more'))}" aria-label="${escapeHtml(t('note.more'))}">${icon('toolbarMore')}</button>
      </div>
      <div class="note-properties" data-note-properties></div>
      <div class="note-body">
        <div class="note-pane note-edit-pane">
          <button class="note-collapse" data-note-collapse="editor" title="${escapeHtml(t('split.collapseEditor'))}">${icon('chevronLeft')}</button>
          <div class="note-editor-host"></div>
          <button class="note-rail" data-note-expand="editor" title="${escapeHtml(t('split.expandEditor'))}">${icon('chevronRight')}<span>${escapeHtml(t('mode.source'))}</span></button>
        </div>
        <div class="note-divider" data-note-divider role="separator" aria-orientation="vertical" title="${escapeHtml(t('split.divider'))}"></div>
        <div class="note-pane note-preview-pane">
          <button class="note-collapse" data-note-collapse="preview" title="${escapeHtml(t('split.collapsePreview'))}">${icon('chevronRight')}</button>
          <div class="note-preview-scroll"><article class="markdown-rendered note-preview"></article></div>
          <button class="note-rail" data-note-expand="preview" title="${escapeHtml(t('split.expandPreview'))}">${icon('chevronLeft')}<span>${escapeHtml(t('mode.reading'))}</span></button>
        </div>
      </div>`;
    this.editorHost = this.el.querySelector('.note-editor-host');
    this.preview = this.el.querySelector('.note-preview');
    this.previewScroll = this.el.querySelector('.note-preview-scroll');
    this.el.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-note-mode]');
      if (mode) return this.setMode(mode.dataset.noteMode);
      const collapse = event.target.closest('[data-note-collapse]');
      if (collapse) return this.collapse(collapse.dataset.noteCollapse);
      const expand = event.target.closest('[data-note-expand]');
      if (expand) return this.collapse(null);
      if (event.target.closest('[data-note-more]')) return this.app.noteMenu(this, event.target.closest('[data-note-more]'));
      const crumb = event.target.closest('[data-crumb]');
      if (crumb) return this.app.revealInTree(crumb.dataset.crumb);
      const props = event.target.closest('[data-props-toggle]');
      if (props) { this.tab.state.propertiesOpen = !this.tab.state.propertiesOpen; this.renderProperties(); this.app.saveTabState(this.tab); }
      return undefined;
    });
    this.el.addEventListener('focusin', () => this.app.onFocus(this));
    this.el.addEventListener('pointerdown', () => this.app.onFocus(this), true);
    this.el.querySelector('[data-note-divider]').addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const body = this.el.querySelector('.note-body').getBoundingClientRect();
      pointerDrag(event, {
        cursor: 'col-resize',
        move: (dx, dy, e) => { this.tab.state.share = Math.round(Math.max(15, Math.min(85, ((e.clientX - body.left) / body.width) * 100))); this.applyShare(); },
        end: (e, moved) => { if (moved) { this.app.saveTabState(this.tab); this.editor?.view?.requestMeasure(); } },
      });
    });
    this.el.querySelector('[data-note-divider]').addEventListener('dblclick', () => { this.tab.state.share = 50; this.applyShare(); this.app.saveTabState(this.tab); });
    // Scroll sync, both ways (the side being scrolled by the user leads).
    this.previewScroll.addEventListener('scroll', () => {
      if (this.mode !== 'split' || this.syncing || !this.app.settings().syncScroll) return;
      const line = this.app.previewTopLine(this.preview, this.previewScroll);
      if (line == null) return;
      this.syncing = true;
      this.editor?.scrollToLine(line + 1, { center: false });
      requestAnimationFrame(() => { this.syncing = false; });
    }, { passive: true });
  }

  applyShare() {
    const s = this.tab.state;
    this.el.style.setProperty('--note-share', `${s.share}%`);
    this.el.dataset.collapsed = this.mode === 'split' ? s.collapsed ?? '' : '';
  }

  collapse(which) {
    this.tab.state.collapsed = which;
    this.applyShare();
    this.app.saveTabState(this.tab);
    if (which !== 'preview') this.scheduleRender(0);
    requestAnimationFrame(() => this.editor?.view?.requestMeasure());
  }

  setMode(mode, { initial = false } = {}) {
    if (!NOTE_MODES.includes(mode)) mode = 'live';
    const before = this.tab.mode;
    const line = !initial ? this.currentLine() : this.tab.state.line ?? null;
    this.tab.mode = mode;
    this.el.dataset.mode = mode;
    for (const b of this.el.querySelectorAll('[data-note-mode]')) { const on = b.dataset.noteMode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }
    this.applyShare();
    const needsEditor = mode !== 'reading';
    if (needsEditor && !this.editor) this.editor = this.app.createEditor(this.editorHost, this.path, this);
    if (this.editor) this.editor.setSettings({ mode: mode === 'live' ? 'live' : 'source' });
    if (mode === 'reading' || mode === 'split') this.scheduleRender(0);
    this.renderProperties();
    if (!initial && before !== mode) {
      this.app.saveTabState(this.tab);
      requestAnimationFrame(() => { if (line != null) this.revealLine(line, { select: false }); if (needsEditor) this.editor?.focus(); });
    }
  }

  currentLine() {
    if (this.mode === 'reading') return this.app.previewTopLine(this.preview, this.previewScroll);
    const top = this.editor?.topLine?.();
    return top == null ? null : top - 1;
  }

  /** The note's text changed (typing here or elsewhere). */
  textChanged(text, fromEditor = false) {
    if (!fromEditor && this.editor && this.editor.text !== text) this.editor.setText(text, { keepView: true });
    this.scheduleRender();
    this.updateHeader();
  }

  scheduleRender(delay = 180) {
    if (this.mode !== 'reading' && this.mode !== 'split') return;
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.renderNow(), delay);
  }

  async renderNow() {
    const seq = (this.renderSeq += 1);
    const text = this.app.doc(this.path)?.text ?? '';
    try {
      const rendered = await this.app.renderNote(this.path, text);
      if (seq !== this.renderSeq) return;
      this.lastRendered = rendered;
      this.renderProperties(rendered.frontmatter);
      if (this.mode === 'reading' || this.mode === 'split') {
        const top = this.previewScroll.scrollTop;
        await this.app.renderPreview(this.preview, rendered, this.path, this);
        if (seq !== this.renderSeq) return;
        this.previewScroll.scrollTop = top;
        if (this.mode === 'split' && this.app.settings().syncScroll) this.syncPreviewToEditor();
      }
    } catch (error) {
      this.preview.innerHTML = `<p class="render-error">${icon('error')}<span>${escapeHtml(String(error?.message ?? error))}</span></p>`;
    }
  }

  /** The editor scrolled: the preview follows. */
  syncPreviewToEditor() {
    if (this.mode !== 'split' || this.syncing || !this.editor) return;
    const line = this.editor.topLine() - 1;
    this.syncing = true;
    this.app.previewScrollTo(this.preview, line, this.previewScroll);
    requestAnimationFrame(() => { this.syncing = false; });
  }

  renderProperties(frontmatter = this.lastRendered?.frontmatter) {
    // Properties live in the right panel's 속성 tab, not above the document.
    const host = this.el.querySelector('[data-note-properties]');
    if (host) { host.hidden = true; host.innerHTML = ''; }
    void frontmatter;
  }

  updateHeader() {
    const crumb = this.el.querySelector('[data-note-crumb]');
    crumb.innerHTML = this.app.breadcrumb(this.path);
    const doc = this.app.doc(this.path);
    const badges = this.el.querySelector('[data-note-badges]');
    badges.innerHTML = doc?.dirty ? `<span class="badge warn" title="${escapeHtml(t('doc.unsaved'))}">${icon('save')}<span>${escapeHtml(t('doc.unsavedShort'))}</span></span>` : '';
  }

  /** Shows a line (a heading, a search hit, a backlink): selects it in the editor, scrolls the preview. */
  revealLine(line, { select = true, col = 0, len = 0 } = {}) {
    if (line == null) return;
    // The editor counts lines from 1, the core and the preview from 0.
    if (this.editor && this.mode !== 'reading') this.editor.scrollToLine(line + 1, { select: select && !len, center: true });
    if (this.editor && len) { const pos = this.editor.view.state.doc.line(Math.min(line + 1, this.editor.lineCount)).from + col; this.editor.view.dispatch({ selection: { anchor: pos, head: pos + len } }); }
    if (this.mode === 'reading' || this.mode === 'split') {
      const go = () => this.app.previewScrollTo(this.preview, line, this.previewScroll, { flash: true });
      if (this.lastRendered) go(); else setTimeout(go, 250);
    }
  }

  focus() { if (this.mode === 'reading') this.previewScroll.focus?.(); else this.editor?.focus(); }

  renamed(path) { this.path = path; this.tab.path = path; this.updateHeader(); this.scheduleRender(0); }

  destroy() {
    clearTimeout(this.renderTimer);
    this.app.destroyPreview?.(this.preview);
    this.editor?.destroy();
    this.el.remove();
  }
}
