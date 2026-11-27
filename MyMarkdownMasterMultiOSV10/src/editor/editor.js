// The note editor: one CodeMirror 6 view per open note tab (several can live at once, each with its own
// history and settings). createNoteEditor(host, options) returns a handle the app drives — text,
// selection, formatting commands, tables, folding, search, focus / typewriter modes, style-check marks.
//
//   live mode    Obsidian / Typora live preview (livepreview.js): marks hidden except on the cursor's lines
//   source mode  the raw Markdown, still syntax-coloured
//
// Lines in this API are 1-based, `ch` / columns are 0-based UTF-16 offsets within the line.
// The other parts: syntax.js (language + colours), fold.js, complete.js, focus.js, decorations.js
// (style check), commands.js (formatting), theme.js, texts.js (ko/en), editor-icons.js; pure text logic
// in mdtext.js, table.js, htmlmd.js, foldranges.js (unit tested in test/unit/editor.test.js).
import { Compartment, EditorSelection, EditorState, Prec, Annotation } from '@codemirror/state';
import {
  drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers,
  placeholder as cmPlaceholder, rectangularSelection,
} from '@codemirror/view';
import {
  copyLineDown, defaultKeymap, deleteLine as cmDeleteLine, history, historyKeymap, indentLess, indentMore, moveLineDown as cmMoveLineDown,
  moveLineUp as cmMoveLineUp, redo as cmRedo, redoDepth, undo as cmUndo, undoDepth,
} from '@codemirror/commands';
import { indentOnInput, indentUnit, syntaxTree } from '@codemirror/language';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap, selectNextOccurrence } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { deleteMarkupBackward, insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { t } from '../i18n.js';
import { cmPhrases } from './texts.js';
import './editor-icons.js';
import { editorContext } from './context.js';
import { CODE_NODES, markdownSupport, syntaxColours } from './syntax.js';
import { linkAt, livePreview, refreshLivePreview, sourceBlocks } from './livepreview.js';
import { foldAll, foldGutterExtension, foldingExtension, toggleFoldAtCursor, unfoldAll } from './fold.js';
import { completionExtension } from './complete.js';
import { focusMode, typewriter } from './focus.js';
import { hostDecorations, setHostDecorations } from './decorations.js';
import { editorTheme } from './theme.js';
import * as cmd from './commands.js';
import { droppedImage, headingBefore, imageMarkdown, smartPunctuation } from './mdtext.js';

/** A `data:image/…;base64,…` URL → a File (or null). */
function dataUrlFile(url, alt = '') {
  const m = /^data:(image\/[\w.+-]+)(;base64)?,(.*)$/is.exec(url);
  if (!m) return null;
  try {
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const base = String(alt || 'image').replace(/[\\/:*?"<>|#^[\]]+/g, ' ').trim().slice(0, 60) || 'image';
    return new File([bytes], `${base}.${ext}`, { type: m[1] });
  } catch { return null; }
}
import { hasFormatting, htmlToMarkdown } from './htmlmd.js';

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'live',
  lineNumbers: false,
  foldGutter: true,
  readableLineLength: true,
  maxWidth: 760,
  spellcheck: false,
  focusMode: 'off',
  typewriter: false,
  smartPunctuation: false,
  autoPair: true,
  tabSize: 4,
  indentWithTabs: false,
  showStyleCheck: true,
  highlightSyntax: false,
  fontSize: 15,
  fontFamily: '',
  lineHeight: 1.65,
  codeWrap: true,
  placeholder: '',
});

const isMac = /Mac|iPhone|iPad/i.test(globalThis.navigator?.platform ?? '');
/** Marks transactions made by setText (not typing: no onChange). */
const external = Annotation.define();

function clampLine(doc, line) {
  return Math.max(1, Math.min(doc.lines, Math.round(Number(line) || 1)));
}

function codeAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (CODE_NODES.has(node.name) || node.name === 'FrontMatter' || node.name === 'HTMLTag' || node.name === 'HTMLBlock') return true;
  }
  return false;
}

/**
 * Creates a note editor in `host`. See the module comment and DEFAULT_SETTINGS; `options.callbacks`
 * and `options.complete` are read on every event, so the host may replace their functions later.
 */
export function createNoteEditor(host, options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) };
  const callbacks = options.callbacks ?? {};
  const fire = (name, ...args) => {
    try { return callbacks[name]?.(...args); } catch (error) { console.error(`[editor] ${name}`, error); return undefined; }
  };
  let handle = null;
  const ctx = {
    path: options.path ?? '',
    resolveLink: options.resolveLink,
    resolveResource: options.resolveResource,
    complete: options.complete ?? {},
    imageCache: new Map(),
    handle: () => handle,
  };

  const slots = {
    mode: new Compartment(), lineNumbers: new Compartment(), foldGutter: new Compartment(), focus: new Compartment(), typewriter: new Compartment(),
    autoPair: new Compartment(), indent: new Compartment(), attrs: new Compartment(), content: new Compartment(), placeholder: new Compartment(),
    history: new Compartment(), phrases: new Compartment(), context: new Compartment(),
  };

  const ext = {
    mode: () => (settings.mode === 'source' ? sourceBlocks : livePreview),
    lineNumbers: () => (settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    foldGutter: () => (settings.foldGutter ? foldGutterExtension() : []),
    focus: () => focusMode(settings.focusMode),
    typewriter: () => typewriter(settings.typewriter),
    autoPair: () => (settings.autoPair ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : []),
    indent: () => {
      const size = Math.max(1, Math.min(16, Number(settings.tabSize) || 4));
      return [EditorState.tabSize.of(size), indentUnit.of(settings.indentWithTabs ? '\t' : ' '.repeat(size))];
    },
    attrs: () => EditorView.editorAttributes.of({
      class: [
        settings.mode === 'source' ? 'mm-source' : 'mm-live',
        settings.readableLineLength ? 'mm-readable' : '',
        settings.codeWrap ? 'mm-code-wrap' : '',
        settings.showStyleCheck ? 'mm-style-on' : '',
        settings.highlightSyntax ? 'mm-pos-on' : '',
      ].filter(Boolean).join(' '),
    }),
    content: () => EditorView.contentAttributes.of({ spellcheck: settings.spellcheck ? 'true' : 'false', autocorrect: 'off', autocapitalize: 'off', 'aria-multiline': 'true' }),
    placeholder: () => cmPlaceholder(settings.placeholder || t('editor.placeholder')),
    history: () => history(),
    phrases: () => EditorState.phrases.of(cmPhrases()),
    context: () => editorContext.of(ctx),
  };

  const applyHostStyle = () => {
    host.classList.add('mm-editor');
    const style = host.style;
    style.setProperty('--mm-size', `${Math.max(8, Number(settings.fontSize) || 15)}px`);
    style.setProperty('--mm-line-height', String(Number(settings.lineHeight) || 1.65));
    style.setProperty('--mm-max-width', `${Math.max(320, Number(settings.maxWidth) || 760)}px`);
    if (settings.fontFamily) style.setProperty('--mm-font', settings.fontFamily); else style.removeProperty('--mm-font');
  };

  // Smart punctuation, `[[` → `[[]]` without auto-pairing; never while an IME composes.
  const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (view.composing || view.compositionStarted || text.length !== 1) return false;
    const { state } = view;
    if (text === '[' && !settings.autoPair && from === to && state.sliceDoc(from - 1, from) === '[' && state.sliceDoc(from, from + 1) !== ']') {
      view.dispatch({ changes: { from, insert: '[]]' }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
      return true;
    }
    if (!settings.smartPunctuation || !'"\'-.'.includes(text) || codeAt(state, from)) return false;
    const line = state.doc.lineAt(from);
    const r = smartPunctuation(line.text.slice(0, from - line.from), text);
    if (!r) return false;
    let insert = r.insert;
    let cursor = from - r.deleteBefore + insert.length;
    const next = state.sliceDoc(to, to + 1);
    if (settings.autoPair && from === to && (insert === '“' || insert === '‘') && (!next || /\s/.test(next))) {
      insert += insert === '“' ? '”' : '’';
    } else if (from === to && (insert === '”' || insert === '’') && next === insert) {
      // Typing the closing quote over an auto-paired one steps over it.
      view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'input.type' });
      return true;
    }
    view.dispatch({ changes: { from: from - r.deleteBefore, to, insert }, selection: { anchor: cursor }, userEvent: 'input.type', scrollIntoView: true });
    return true;
  });

  const openLink = (info, newTab) => {
    if (!info) return false;
    if (info.kind === 'tag') { fire('onTagClick', info.tag); return true; }
    fire('onOpenLink', { target: info.target ?? '', subpath: info.subpath ?? '', newTab: Boolean(newTab), external: info.external });
    return true;
  };

  const domHandlers = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return false;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      const box = target.closest('.cm-mm-checkbox');
      if (box && view.contentDOM.contains(box)) {
        event.preventDefault();
        cmd.toggleTaskAtLine(view, view.state.doc.lineAt(view.posAtDOM(box)).number);
        return true;
      }
      const el = target.closest('[data-mm-wiki],[data-mm-href],[data-mm-tag]');
      if (el && view.contentDOM.contains(el)) {
        event.preventDefault();
        if (el.dataset.mmTag != null) { fire('onTagClick', el.dataset.mmTag); return true; }
        const pos = view.posAtDOM(el);
        const info = linkAt(view.state, pos + 1) ?? linkAt(view.state, pos);
        if (info && info.kind !== 'tag') return openLink(info, mod);
        if (el.dataset.mmWiki != null) return openLink({ kind: 'wiki', target: el.dataset.mmWiki, subpath: el.dataset.mmSub ?? '' }, mod);
        return openLink({ kind: 'url', target: el.dataset.mmHref, subpath: '', external: el.dataset.mmHref }, mod);
      }
      if (mod) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const info = pos == null ? null : linkAt(view.state, pos);
        if (info) { event.preventDefault(); return openLink(info, event.shiftKey || event.altKey); }
      }
      return false;
    },
    contextmenu(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const info = pos == null ? null : linkAt(view.state, pos);
      const sel = view.state.selection.main;
      fire('onContextMenu', event, {
        link: info && info.kind !== 'tag' ? { target: info.target, subpath: info.subpath, external: info.external, kind: info.kind, text: info.text, from: info.from, to: info.to } : null,
        tag: info?.kind === 'tag' ? info.tag : null,
        selectedText: view.state.sliceDoc(sel.from, sel.to),
        pos,
      });
      return false;
    },
    paste(event, view) {
      const data = event.clipboardData;
      if (!data) return false;
      const head = view.state.selection.main.head;
      const files = [...(data.files ?? [])];
      if (files.length && fire('onPasteFiles', files, head) === true) { event.preventDefault(); return true; }
      const html = data.getData('text/html');
      const plain = data.getData('text/plain');
      if (!view.state.selection.main.empty && /^\s*(https?:\/\/|mailto:)\S+\s*$/.test(plain)) return false; // pasteURLAsLink
      if (html && !codeAt(view.state, head) && hasFormatting(html)) {
        const md = htmlToMarkdown(html);
        if (md) {
          event.preventDefault();
          view.dispatch(view.state.update(view.state.replaceSelection(md), { userEvent: 'input.paste', scrollIntoView: true }));
          return true;
        }
      }
      return false;
    },
    drop(event, view) {
      const data = event.dataTransfer;
      const files = [...(data?.files ?? [])];
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      if (files.length) {
        if (fire('onDropFiles', files, pos) === true) { event.preventDefault(); return true; }
        return false;
      }
      // A picture dragged from a web page: its URL (a data: picture is saved as an attachment instead).
      if (!data || view.inputState?.draggedContent) return false;
      const types = [...(data.types ?? [])];
      if (!types.includes('text/uri-list') && !types.includes('text/html')) return false;
      const image = droppedImage({ uriList: data.getData('text/uri-list'), html: data.getData('text/html'), plain: data.getData('text/plain') });
      if (!image) return false;
      event.preventDefault();
      if (/^data:image\//i.test(image.url)) {
        const file = dataUrlFile(image.url, image.alt);
        if (file && fire('onDropFiles', [file], pos) === true) return true;
        return true;
      }
      const insert = imageMarkdown(image.url, image.alt);
      view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length }, userEvent: 'input.drop', scrollIntoView: true });
      view.focus();
      return true;
    },
  });

  const run = (fn) => (view) => { fn(view); return true; };
  const editorKeymap = [
    { key: 'Mod-b', run: (v) => cmd.wrapSelection(v, '**', '**', t('editor.text.bold')) },
    { key: 'Mod-i', run: (v) => cmd.wrapSelection(v, '*', '*', t('editor.text.italic')) },
    { key: 'Mod-Shift-x', run: (v) => cmd.wrapSelection(v, '~~', '~~', t('editor.text.strike')) },
    { key: 'Alt-Shift-5', run: (v) => cmd.wrapSelection(v, '~~', '~~', t('editor.text.strike')) },
    { key: 'Mod-Shift-h', run: (v) => cmd.wrapSelection(v, '==', '==', t('editor.text.highlight')) },
    { key: 'Mod-e', run: (v) => cmd.wrapSelection(v, '`', '`', t('editor.text.code')) },
    { key: 'Mod-k', run: cmd.insertLink },
    { key: 'Mod-l', run: cmd.toggleTask },
    ...[1, 2, 3, 4, 5, 6].map((level) => ({ key: `Mod-${level}`, run: (v) => cmd.setHeading(v, level) })),
    { key: 'Mod-0', run: (v) => cmd.setHeading(v, 0) },
    { key: 'Mod-]', run: indentMore },
    { key: 'Mod-[', run: indentLess },
    { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
    { key: 'Mod-/', run: cmd.toggleComment },
    { key: 'Mod-s', run: () => { fire('onSave'); return true; }, preventDefault: true },
    { key: 'Mod-f', run: run((v) => openSearch(v, false)), preventDefault: true },
    { key: 'Mod-h', run: run((v) => openSearch(v, true)), preventDefault: true },
    { key: 'Tab', run: cmd.tabKey },
    { key: 'Shift-Tab', run: cmd.shiftTabKey },
    { key: 'Enter', run: insertNewlineContinueMarkup },
    { key: 'Backspace', run: deleteMarkupBackward },
  ];

  const updates = EditorView.updateListener.of((update) => {
    if (update.docChanged && !update.transactions.every((tr) => tr.annotation(external))) fire('onChange', update.state.doc.toString());
    if (update.selectionSet || update.docChanged) {
      const sel = update.state.selection.main;
      const line = update.state.doc.lineAt(sel.head);
      fire('onSelection', { from: sel.from, to: sel.to, line: line.number, ch: sel.head - line.from, selectedText: update.state.sliceDoc(sel.from, sel.to) });
    }
    if (update.focusChanged) fire(update.view.hasFocus ? 'onFocus' : 'onBlur');
  });

  const state = EditorState.create({
    doc: String(options.doc ?? ''),
    extensions: [
      slots.context.of(ext.context()),
      slots.phrases.of(ext.phrases()),
      slots.history.of(ext.history()),
      markdownSupport(),
      syntaxColours,
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true),
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{', '"', '`'] } }]),
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      indentOnInput(),
      search({ top: true }),
      completionExtension(),
      foldingExtension(),
      hostDecorations,
      Prec.high(inputHandler),
      Prec.high(keymap.of(editorKeymap)),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap.filter((b) => b.key !== 'Mod-f')]),
      domHandlers,
      updates,
      editorTheme,
      slots.mode.of(ext.mode()),
      slots.lineNumbers.of(ext.lineNumbers()),
      slots.foldGutter.of(ext.foldGutter()),
      slots.focus.of(ext.focus()),
      slots.typewriter.of(ext.typewriter()),
      slots.autoPair.of(ext.autoPair()),
      slots.indent.of(ext.indent()),
      slots.attrs.of(ext.attrs()),
      slots.content.of(ext.content()),
      slots.placeholder.of(ext.placeholder()),
    ],
  });

  applyHostStyle();
  const view = new EditorView({ state, parent: host });

  let scrollFrame = 0;
  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; fire('onScroll', topLine()); });
  };
  view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  function topLine() {
    const rect = view.scrollDOM.getBoundingClientRect();
    const block = view.lineBlockAtHeight(Math.max(0, rect.top - view.documentTop + 1));
    return view.state.doc.lineAt(block.from).number;
  }

  function openSearch(v = view, replace = false) {
    openSearchPanel(v);
    const field = v.dom.querySelector(replace ? '.cm-search input[name=replace]' : '.cm-search input[name=search]');
    if (field) { field.focus(); field.select?.(); }
    return true;
  }

  const sel = () => view.state.selection.main;
  const exec = (fn) => { const result = fn(view); return result; };

  handle = {
    view,
    get text() { return view.state.doc.toString(); },
    setText(text, { keepView = true } = {}) {
      const next = String(text ?? '');
      const current = view.state.doc.toString();
      if (next === current) return;
      if (!keepView) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: next }, selection: { anchor: 0 }, annotations: external.of(true), effects: EditorView.scrollIntoView(0, { y: 'start' }) });
        return;
      }
      // Only the part that differs: selection, folds, history and scroll stay where they were.
      let a = 0;
      const max = Math.min(next.length, current.length);
      while (a < max && next.charCodeAt(a) === current.charCodeAt(a)) a++;
      let b = 0;
      while (b < max - a && next.charCodeAt(next.length - 1 - b) === current.charCodeAt(current.length - 1 - b)) b++;
      view.dispatch({ changes: { from: a, to: current.length - b, insert: next.slice(a, next.length - b) }, annotations: external.of(true) });
    },
    focus() { view.focus(); },
    get hasFocus() { return view.hasFocus; },
    getSelection() { const r = sel(); return { from: r.from, to: r.to, text: view.state.sliceDoc(r.from, r.to) }; },
    replaceSelection(text) { view.dispatch(view.state.update(view.state.replaceSelection(String(text ?? '')), { userEvent: 'input', scrollIntoView: true })); },
    insertText(text, pos) {
      const value = String(text ?? '');
      const at = pos == null ? sel().head : Math.max(0, Math.min(view.state.doc.length, pos));
      view.dispatch({ changes: { from: at, insert: value }, selection: { anchor: at + value.length }, userEvent: 'input', scrollIntoView: true });
    },
    wrapSelection(before, after = before, placeholder = '') { return cmd.wrapSelection(view, before, after, placeholder); },
    toggleLinePrefix(prefix) { return cmd.toggleLinePrefix(view, prefix); },
    setHeading(level) { return cmd.setHeading(view, Math.max(0, Math.min(6, level | 0))); },
    toggleTask() { return cmd.toggleTask(view); },
    cycleTaskState() { return cmd.cycleTaskState(view); },
    insertLink() { return cmd.insertLink(view); },
    insertWikiLink() { return cmd.insertWikiLink(view); },
    insertTable(rows = 2, cols = 3) { return cmd.insertTable(view, rows, cols); },
    formatTable() { return cmd.formatTableAtCursor(view); },
    tableAddRow() { return cmd.tableAddRow(view); },
    tableAddColumn() { return cmd.tableAddColumn(view); },
    tableDeleteRow() { return cmd.tableDeleteRow(view); },
    tableDeleteColumn() { return cmd.tableDeleteColumn(view); },
    insertCodeBlock(lang = '') { return cmd.insertCodeBlock(view, lang); },
    insertCallout(type = 'note') { return cmd.insertCallout(view, type); },
    insertMath(display = false) { return cmd.insertMath(view, display); },
    insertHorizontalRule() { return cmd.insertHorizontalRule(view); },
    insertFootnote() { return cmd.insertFootnote(view); },
    moveLineUp() { return exec(cmMoveLineUp); },
    moveLineDown() { return exec(cmMoveLineDown); },
    duplicateLine() { return exec(copyLineDown); },
    deleteLine() { return exec(cmDeleteLine); },
    indent() { return exec(indentMore); },
    outdent() { return exec(indentLess); },
    scrollToLine(line, { select = false, center = true } = {}) {
      const l = view.state.doc.line(clampLine(view.state.doc, line));
      view.dispatch({
        selection: select ? EditorSelection.range(l.from, l.to) : undefined,
        effects: EditorView.scrollIntoView(l.from, { y: center ? 'center' : 'start', yMargin: 24 }),
      });
    },
    scrollToPos(pos) {
      const at = Math.max(0, Math.min(view.state.doc.length, pos | 0));
      view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    },
    topLine,
    /** Extra: the document position under a window point (client px), or null when it is not over this editor. */
    posAtPoint(x, y) {
      const r = view.scrollDOM.getBoundingClientRect();
      if (!(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) || !view.dom.isConnected || !view.dom.offsetParent) return null;
      return view.posAtCoords({ x, y }, false);
    },
    get lineCount() { return view.state.doc.lines; },
    posToLine(pos) { return view.state.doc.lineAt(Math.max(0, Math.min(view.state.doc.length, pos | 0))).number; },
    setSettings(partial = {}) {
      const before = { ...settings };
      Object.assign(settings, partial);
      const effects = [];
      const changed = (...keys) => keys.some((key) => key in partial && partial[key] !== before[key]);
      if (changed('mode')) effects.push(slots.mode.reconfigure(ext.mode()));
      if (changed('lineNumbers')) effects.push(slots.lineNumbers.reconfigure(ext.lineNumbers()));
      if (changed('foldGutter')) effects.push(slots.foldGutter.reconfigure(ext.foldGutter()));
      if (changed('focusMode')) effects.push(slots.focus.reconfigure(ext.focus()));
      if (changed('typewriter')) effects.push(slots.typewriter.reconfigure(ext.typewriter()));
      if (changed('autoPair')) effects.push(slots.autoPair.reconfigure(ext.autoPair()));
      if (changed('tabSize', 'indentWithTabs')) effects.push(slots.indent.reconfigure(ext.indent()));
      if (changed('mode', 'readableLineLength', 'codeWrap', 'showStyleCheck', 'highlightSyntax')) effects.push(slots.attrs.reconfigure(ext.attrs()));
      if (changed('spellcheck')) effects.push(slots.content.reconfigure(ext.content()));
      if (changed('placeholder')) effects.push(slots.placeholder.reconfigure(ext.placeholder()));
      applyHostStyle();
      if (effects.length) view.dispatch({ effects });
      if (changed('fontSize', 'fontFamily', 'lineHeight', 'maxWidth')) view.requestMeasure();
    },
    getSettings() { return { ...settings }; },
    setDecorations(payload = {}) { view.dispatch({ effects: setHostDecorations.of(payload) }); },
    openSearch({ replace = false } = {}) { return openSearch(view, replace); },
    foldAll() { return exec(foldAll); },
    unfoldAll() { return exec(unfoldAll); },
    toggleFoldAtCursor() { return exec(toggleFoldAtCursor); },
    undo() { return exec(cmUndo); },
    redo() { return exec(cmRedo); },
    canUndo() { return undoDepth(view.state) > 0; },
    canRedo() { return redoDepth(view.state) > 0; },
    clearHistory() {
      view.dispatch({ effects: slots.history.reconfigure([]) });
      view.dispatch({ effects: slots.history.reconfigure(ext.history()) });
    },
    currentHeading() {
      const line = view.state.doc.lineAt(sel().head);
      const lines = view.state.doc.sliceString(0, line.to).split('\n');
      return headingBefore(lines, lines.length - 1);
    },
    /** Extra: the note was renamed / moved (link resolution and images are relative to it). */
    setPath(path) { ctx.path = path ?? ''; ctx.imageCache.clear(); handle.refresh(); },
    /** Extra: rebuild live preview (after notes were created / deleted, attachments changed or the language switched). */
    refresh({ images = false } = {}) {
      if (images) ctx.imageCache.clear();
      view.dispatch({ effects: [refreshLivePreview.of(null), slots.phrases.reconfigure(ext.phrases()), slots.placeholder.reconfigure(ext.placeholder())] });
    },
    destroy() {
      view.scrollDOM.removeEventListener('scroll', onScroll);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      view.destroy();
      host.classList.remove('mm-editor');
      for (const name of ['--mm-size', '--mm-line-height', '--mm-max-width', '--mm-font']) host.style.removeProperty(name);
    },
  };
  return handle;
}
