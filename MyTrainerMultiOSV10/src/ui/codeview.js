// Code tab: the PyTorch script for the model (CodeMirror 6). Generated from the
// model graph while it is untouched; once edited it is kept as the user's own
// code (Regenerate brings the generated version back). Python highlighting,
// completion and hover help from the Python / PyTorch dictionary, syntax
// checking, and a Dictionary panel to look up and insert grammar, built-ins,
// dictionary methods and PyTorch APIs.
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, selectAll, toggleComment, undo } from '@codemirror/commands';
import { python, pythonLanguage } from '@codemirror/lang-python';
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, keymap, lineNumbers, rectangularSelection } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { DICTIONARY_KINDS, lookupWord, PY_DICTIONARY, searchDictionary } from '../domain/pydict.js';
import { icon } from '../icons.js';
import { escapeHtml } from './dom.js';

const lightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#7c3aed', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: '#0a7d3e' },
  { tag: tags.comment, color: '#8a94a6', fontStyle: 'italic' },
  { tag: tags.number, color: '#b45309' },
  { tag: [tags.bool, tags.null], color: '#c2410c' },
  { tag: tags.definition(tags.variableName), color: '#1d4ed8' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#2563eb' },
  { tag: tags.className, color: '#b91c1c', fontWeight: '600' },
  { tag: tags.propertyName, color: '#0e7490' },
  { tag: tags.operator, color: '#6b7280' },
  { tag: tags.self, color: '#be185d' },
]);
const darkStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c4a7ff', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: '#86efac' },
  { tag: tags.comment, color: '#7f8aa3', fontStyle: 'italic' },
  { tag: tags.number, color: '#fcd34d' },
  { tag: [tags.bool, tags.null], color: '#fdba74' },
  { tag: tags.definition(tags.variableName), color: '#93c5fd' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#7dd3fc' },
  { tag: tags.className, color: '#fca5a5', fontWeight: '600' },
  { tag: tags.propertyName, color: '#67e8f9' },
  { tag: tags.operator, color: '#cbd5e1' },
  { tag: tags.self, color: '#f9a8d4' },
]);

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: '"Cascadia Code", Consolas, "D2Coding", Menlo, "DejaVu Sans Mono", monospace', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px var(--shadow)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, #f5a524 35%, transparent)' },
});

/** Completions from the dictionary: after "nn." only nn entries, after "torch." torch ones, … */
function dictionaryCompletions(context) {
  const word = context.matchBefore(/[A-Za-z_][\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const text = word.text;
  const dot = text.lastIndexOf('.');
  const prefix = dot >= 0 ? text.slice(0, dot + 1) : '';
  const options = [];
  for (const entry of PY_DICTIONARY) {
    if (entry.label.includes(' ')) continue;
    if (prefix) {
      if (!entry.label.startsWith(prefix) && !(entry.kind === 'dict' || entry.kind === 'list' || entry.kind === 'tensor' || entry.kind === 'optim')) continue;
      const label = entry.label.startsWith(prefix) ? entry.label.slice(prefix.length) : entry.label.split('.').pop();
      if (label.includes('.')) continue;
      options.push({ label, type: entry.kind === 'keyword' || entry.kind === 'syntax' ? 'keyword' : entry.kind === 'nn' ? 'class' : 'function', detail: entry.signature.split('\n')[0], info: entry.ko, boost: entry.label.startsWith(prefix) ? 2 : 0 });
    } else {
      options.push({ label: entry.label, type: entry.kind === 'keyword' || entry.kind === 'syntax' ? 'keyword' : entry.kind === 'nn' ? 'class' : 'function', detail: entry.signature.split('\n')[0], info: entry.ko });
    }
  }
  return { from: word.from + (dot >= 0 ? dot + 1 : 0), options, validFor: /^\w*$/ };
}

export class CodeView {
  constructor(app) {
    this.app = app;
    this.themeCompartment = new Compartment();
    this.wrapCompartment = new Compartment();
    this.sizeCompartment = new Compartment();
    this.languageCompartment = new Compartment();
    this.suppress = false;
    this.element = document.createElement('div');
    this.element.className = 'code-view';
    this.element.innerHTML = `<div class="code-toolbar"></div><div class="code-body"><div class="code-editor"></div><aside class="dict-panel"></aside></div>`;
    this.toolbar = this.element.querySelector('.code-toolbar');
    this.dict = this.element.querySelector('.dict-panel');
    this.dictState = { query: '', kind: null, selected: null };
    const app_ = app;
    const hover = hoverTooltip((view, pos) => {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      let start = pos - line.from; let end = start;
      while (start > 0 && /[\w]/.test(text[start - 1])) start--;
      while (end < text.length && /[\w]/.test(text[end])) end++;
      if (start === end) return null;
      let before = '';
      let b = start;
      while (b > 0 && /[\w.]/.test(text[b - 1])) b--;
      before = text.slice(b, start);
      const entry = lookupWord(text.slice(start, end), before);
      if (!entry) return null;
      return {
        pos: line.from + start,
        end: line.from + end,
        above: true,
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'code-hover';
          dom.innerHTML = `<b>${escapeHtml(entry.label)}</b><code>${escapeHtml(entry.signature)}</code><p>${escapeHtml(app_.lang() === 'en' ? entry.en : entry.ko)}</p>`;
          return { dom };
        },
      };
    });
    const syntaxLinter = linter((view) => {
      const diagnostics = [];
      syntaxTree(view.state).iterate({
        enter: (node) => {
          if (node.type.isError) {
            const from = node.from;
            const to = Math.max(node.to, Math.min(view.state.doc.length, from + 1));
            diagnostics.push({ from, to, severity: 'error', message: app_.t('code.syntaxError') });
          }
        },
      });
      // Tabs and spaces mixed in one file's indentation confuse Python.
      let tabs = false; let spaces = false;
      for (let i = 1; i <= view.state.doc.lines; i++) {
        const indent = /^[ \t]*/.exec(view.state.doc.line(i).text)[0];
        if (indent.includes('\t')) tabs = true;
        if (indent.includes(' ')) spaces = true;
      }
      if (tabs && spaces) diagnostics.push({ from: 0, to: Math.min(1, view.state.doc.length), severity: 'warning', message: app_.t('code.mixedIndent') });
      return diagnostics.slice(0, 50);
    }, { delay: 400 });
    this.view = new EditorView({
      parent: this.element.querySelector('.code-editor'),
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), foldGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
          rectangularSelection(), highlightActiveLine(), highlightSelectionMatches(), search({ top: true }),
          indentUnit.of('    '),
          this.languageCompartment.of(python()),
          pythonLanguage.data.of({ autocomplete: dictionaryCompletions }),
          autocompletion({ activateOnTyping: true }),
          hover, syntaxLinter, lintGutter(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
          editorTheme,
          this.themeCompartment.of(syntaxHighlighting(lightStyle)),
          this.wrapCompartment.of([]),
          this.sizeCompartment.of(EditorView.theme({ '&': { fontSize: '14px' } })),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.suppress) this.app.codeEdited(update.state.doc.toString());
          }),
        ],
      }),
    });
    this.toolbar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-code]');
      if (button && !button.disabled) this.app.codeAction(button.dataset.code);
    });
    this.toolbar.addEventListener('change', (event) => {
      if (event.target.dataset.codeOption) this.app.codeOption(event.target.dataset.codeOption, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    });
    this.dict.addEventListener('input', (event) => {
      if (event.target.dataset.dict === 'search') { this.dictState.query = event.target.value; this.renderDictionary(false); }
    });
    this.dict.addEventListener('click', (event) => {
      const kind = event.target.closest('[data-dict-kind]');
      if (kind) { this.dictState.kind = kind.dataset.dictKind || null; this.renderDictionary(); return; }
      const entry = event.target.closest('[data-dict-entry]');
      if (entry) { this.dictState.selected = entry.dataset.dictEntry; this.renderDictionary(false); return; }
      const insert = event.target.closest('[data-dict-insert]');
      if (insert) this.insert(insert.dataset.dictInsert);
    });
  }

  mount(host) {
    host.replaceChildren(this.element);
    this.renderToolbar();
    this.renderDictionary();
    this.applyLook();
    requestAnimationFrame(() => this.view.requestMeasure());
  }

  setText(text) {
    if (this.view.state.doc.toString() === text) return;
    this.suppress = true;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
    this.suppress = false;
  }

  get text() { return this.view.state.doc.toString(); }

  applyLook() {
    const s = this.app.settings();
    this.view.dispatch({ effects: [
      this.themeCompartment.reconfigure(syntaxHighlighting(this.app.dark() ? darkStyle : lightStyle)),
      this.wrapCompartment.reconfigure(s.codeWrap ? EditorView.lineWrapping : []),
      this.sizeCompartment.reconfigure(EditorView.theme({ '&': { fontSize: `${s.codeFontSize}px` } })),
    ] });
  }

  renderToolbar() {
    const t = this.app.t;
    const project = this.app.project();
    const s = this.app.settings();
    const busy = ['training', 'paused'].includes(this.app.run().state);
    this.toolbar.innerHTML = `
      <button class="button small" data-code="regenerate" title="${escapeHtml(t('code.regenerateTip'))}">${icon('codeRegen')}<span>${escapeHtml(t('code.regenerate'))}</span></button>
      <button class="button small primary" data-code="run" ${!this.app.desktop || busy ? 'disabled' : ''} title="${escapeHtml(this.app.desktop ? t('code.runTip') : t('web.desktopOnly'))}">${icon('codeRun')}<span>${escapeHtml(t('code.run'))}</span></button>
      <button class="button small" data-code="save" title="${escapeHtml(t('code.saveTip'))}">${icon('save')}<span>${escapeHtml(t('code.save'))}</span></button>
      <button class="button small" data-code="copy">${icon('copy')}<span>${escapeHtml(t('code.copy'))}</span></button>
      <button class="button small" data-code="search">${icon('search')}<span>${escapeHtml(t('code.find'))}</span></button>
      <span class="tool-sep"></span>
      <label class="inline-check" title="${escapeHtml(t('code.hooksTip'))}"><input type="checkbox" data-code-option="codeHooks" ${s.codeHooks ? 'checked' : ''}/><span>${escapeHtml(t('code.hooks'))}</span></label>
      <label class="inline-check"><input type="checkbox" data-code-option="codeWrap" ${s.codeWrap ? 'checked' : ''}/><span>${escapeHtml(t('code.wrap'))}</span></label>
      <label class="inline-check"><span>${escapeHtml(t('code.fontSize'))}</span><select data-code-option="codeFontSize">${[11, 12, 13, 14, 15, 16, 18, 20, 24].map((n) => `<option value="${n}" ${s.codeFontSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <span class="grow"></span>
      <span class="code-status ${project.code.custom ? 'custom' : ''}">${icon(project.code.custom ? 'edit' : 'sparkles')}<span>${escapeHtml(project.code.custom ? t('code.custom') : t('code.generated'))}</span></span>`;
  }

  renderDictionary(full = true) {
    const t = this.app.t;
    const lang = this.app.lang();
    const list = searchDictionary(this.dictState.query, lang, this.dictState.kind);
    const selected = PY_DICTIONARY.find((entry) => entry.label === this.dictState.selected) ?? list[0] ?? null;
    const listHtml = list.slice(0, 200).map((entry) => `<button class="dict-item ${entry === selected ? 'active' : ''}" data-dict-entry="${escapeHtml(entry.label)}"><span class="dict-kind k-${entry.kind}">${escapeHtml(t(`dictKind.${entry.kind}`))}</span><b>${escapeHtml(entry.label)}</b></button>`).join('');
    const detail = selected ? `<div class="dict-detail"><h4>${escapeHtml(selected.label)}</h4><pre class="dict-sig">${escapeHtml(selected.signature)}</pre><p>${escapeHtml(lang === 'en' ? selected.en : selected.ko)}</p>
      ${selected.example ? `<pre class="dict-example">${escapeHtml(selected.example)}</pre>` : ''}
      <button class="button small" data-dict-insert="${escapeHtml(selected.label)}">${icon('plus')}<span>${escapeHtml(t('code.insert'))}</span></button></div>` : '';
    if (full) {
      this.dict.innerHTML = `<div class="dict-head">${icon('dictionary')}<b>${escapeHtml(t('code.dictionary'))}</b></div>
        <div class="search-box">${icon('search')}<input type="text" data-dict="search" value="${escapeHtml(this.dictState.query)}" placeholder="${escapeHtml(t('code.dictSearch'))}" spellcheck="false"/></div>
        <div class="dict-kinds"><button class="chip ${!this.dictState.kind ? 'active' : ''}" data-dict-kind="">${escapeHtml(t('dictKind.all'))}</button>${DICTIONARY_KINDS.map((kind) => `<button class="chip ${this.dictState.kind === kind ? 'active' : ''}" data-dict-kind="${kind}">${escapeHtml(t(`dictKind.${kind}`))}</button>`).join('')}</div>
        <div class="dict-list">${listHtml}</div><div class="dict-detail-host">${detail}</div>`;
    } else {
      this.dict.querySelector('.dict-list').innerHTML = listHtml;
      this.dict.querySelector('.dict-detail-host').innerHTML = detail;
    }
  }

  /** Inserts a dictionary entry's example (or its signature) at the cursor. */
  insert(label) {
    const entry = PY_DICTIONARY.find((item) => item.label === label);
    if (!entry) return;
    const text = entry.example || entry.signature.split('\n')[0];
    const { from, to } = this.view.state.selection.main;
    const line = this.view.state.doc.lineAt(from);
    const indent = /^\s*/.exec(line.text)[0];
    const insertText = text.split('\n').map((l, i) => (i ? indent + l : l)).join('\n');
    this.view.dispatch({ changes: { from, to, insert: insertText }, selection: { anchor: from + insertText.length } });
    this.view.focus();
  }

  /** The editor's context menu: undo / redo, clipboard, select all, find, comment, look the word up. */
  contextItems(t) {
    const view = this.view;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const word = view.state.wordAt(from);
    const lookup = word ? view.state.sliceDoc(word.from, word.to) : '';
    return [
      { label: t('ctx.undo'), icon: 'undo', key: 'Ctrl+Z', action: () => undo(view) },
      { label: t('ctx.redo'), icon: 'redo', key: 'Ctrl+Y', action: () => redo(view) },
      'sep',
      { label: t('ctx.cut'), icon: 'cut', key: 'Ctrl+X', disabled: !selected, action: async () => { await navigator.clipboard.writeText(selected).catch(() => {}); view.dispatch(view.state.replaceSelection('')); } },
      { label: t('ctx.copy'), icon: 'copy', key: 'Ctrl+C', disabled: !selected, action: () => navigator.clipboard.writeText(selected).catch(() => {}) },
      { label: t('ctx.paste'), icon: 'paste', key: 'Ctrl+V', action: async () => { const text = await navigator.clipboard.readText().catch(() => ''); if (text) view.dispatch(view.state.replaceSelection(text)); view.focus(); } },
      { label: t('ctx.selectAll'), icon: 'selectAll', key: 'Ctrl+A', action: () => { selectAll(view); view.focus(); } },
      'sep',
      { label: t('ctx.find'), icon: 'search', key: 'Ctrl+F', action: () => this.openSearch() },
      { label: t('ctx.comment'), icon: 'commentToggle', key: 'Ctrl+/', action: () => { toggleComment(view); view.focus(); } },
      { label: lookup ? t('ctx.dictionary') + ': ' + lookup : t('ctx.dictionary'), icon: 'dictionary', disabled: !lookup, action: () => { this.dictState.query = lookup; this.renderDictionary(); } },
    ];
  }

  openSearch() {
    import('@codemirror/search').then(({ openSearchPanel }) => openSearchPanel(this.view));
  }

  /** Puts the cursor on a line (error messages from Python). */
  goToLine(number) {
    const line = this.view.state.doc.line(Math.max(1, Math.min(this.view.state.doc.lines, number)));
    this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    this.view.focus();
  }
}
