// The Edit tab's text editor: a CodeMirror 6 view behind a small handle that reads like a <textarea>
// (value, selectionStart / selectionEnd, setSelectionRange, focus …). The view paints only the visible
// lines, so typing stays quick in a long merged document and Korean IME composition is left alone.
//
// The app rewrites the whole text on its own now and then (renumbering, the contents and figure index
// following the headings, Undo / Redo). Those replacements keep the writer where they are: the same
// line stays at the same place on screen (replaceKeepingAnchor / replaceKeepingView), or the restored
// change is brought into view (replaceAndReveal). They are "silent": the app does not hear them as
// typing. CodeMirror's own history is off — the app keeps one for the document (domain/dochistory.js).
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { pictureExtension } from './images.js';

/** Markdown marks in the theme's icon colours (styles.css --tone-*), readable on every theme. */
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--tone-indigo)', fontWeight: '700', fontSize: '1.18em' },
  { tag: tags.heading2, color: 'var(--tone-blue)', fontWeight: '700', fontSize: '1.1em' },
  { tag: tags.heading3, color: 'var(--tone-teal)', fontWeight: '700' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: 'var(--tone-green)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--tone-sky)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--tone-pink)', fontFamily: 'var(--mono, Consolas, monospace)' },
  { tag: tags.quote, color: 'var(--tone-slate)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--tone-orange)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--tone-purple)' },
  { tag: tags.comment, color: 'var(--muted)' },
]);

let viewGen = 0;
/** Holds the scroll position through a full-text replacement (CodeMirror measures the new lines later). */
function pinScroll(view, top, left) {
  const token = ++viewGen;
  const apply = () => {
    if (token !== viewGen) return;
    view.scrollDOM.scrollTop = top;
    view.scrollDOM.scrollLeft = left;
  };
  apply();
  view.requestMeasure({ key: pinScroll, read: () => {}, write: apply });
  requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
}

const silentViews = new WeakSet();
function dispatchSilent(view, spec) {
  silentViews.add(view);
  try { view.dispatch(spec); } finally { silentViews.delete(view); }
}

const clampPos = (pos, len) => Math.max(0, Math.min(pos ?? 0, len));

/**
 * Creates the editor in `host`. `callbacks` (read on every event, so they may be replaced): onInput,
 * onCompositionStart, onCompositionEnd, onCaret (selection moved), onBlur, onKeyDown(event),
 * onContextMenu(event). Returns the handle.
 */
export function createEditor(host, { placeholder = '', callbacks = {}, pictures = null, showPictures = true } = {}) {
  const placeholderSlot = new Compartment();
  const picturesSlot = new Compartment();
  const pictureExt = pictures ? pictureExtension(pictures) : [];
  const call = (name, event) => callbacks[name]?.(event);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: '',
      extensions: [
        keymap.of([...defaultKeymap, ...searchKeymap]),
        search({ top: true }),
        highlightSelectionMatches(),
        drawSelection(),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(markdownStyle),
        EditorView.lineWrapping,
        EditorState.allowMultipleSelections.of(false),
        EditorView.theme({
          '&': { height: '100%', fontSize: 'inherit', backgroundColor: 'transparent', color: 'var(--text)' },
          '&.cm-focused': { outline: 'none' },
          '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
          '.cm-content': { fontFamily: 'inherit', caretColor: 'var(--text)', padding: '14px 0 40vh' },
          '.cm-line': { padding: '0 22px 0 14px' },
          '.cm-gutters': { backgroundColor: 'transparent', color: 'color-mix(in srgb, var(--muted) 70%, transparent)', border: 'none', paddingLeft: '8px' },
          '.cm-lineNumbers .cm-gutterElement': { minWidth: '34px', fontSize: '0.82em', paddingRight: '6px' },
          '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)', fontWeight: '700' },
          '.cm-cursor': { borderLeftColor: 'var(--text)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important' },
          '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
          '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
          '.cm-panels input, .cm-panels button': { fontFamily: 'var(--font-family)', fontSize: '12px' },
          '.cm-placeholder': { color: 'var(--muted)' },
        }),
        EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        placeholderSlot.of(placeholder ? cmPlaceholder(placeholder) : []),
        picturesSlot.of(showPictures ? pictureExt : []),
        EditorView.updateListener.of((update) => {
          if (silentViews.has(update.view)) return;
          if (update.view.composing) call('onCompositionStart');
          if (update.docChanged) call('onInput');
          else if (update.selectionSet) call('onCaret');
        }),
        EditorView.domEventHandlers({
          compositionstart: () => { call('onCompositionStart'); return false; },
          compositionend: () => { call('onCompositionEnd'); return false; },
          blur: () => { call('onBlur'); return false; },
          keydown: (event) => { call('onKeyDown', event); return event.defaultPrevented; },
          contextmenu: (event) => { call('onContextMenu', event); return event.defaultPrevented; },
        }),
      ],
    }),
  });

  const handle = {
    view,
    get value() { return view.state.doc.toString(); },
    set value(text) { handle.replaceKeepingView(text ?? ''); },
    get length() { return view.state.doc.length; },
    get selectionStart() { return view.state.selection.main.from; },
    get selectionEnd() { return view.state.selection.main.to; },
    get hasFocus() { return view.hasFocus; },
    get composing() { return view.composing; },
    setSelectionRange(start, end) {
      const len = view.state.doc.length;
      const from = clampPos(start, len);
      view.dispatch({ selection: { anchor: from, head: clampPos(end ?? from, len) }, scrollIntoView: false });
    },
    /** The text changes above the caret (cover, contents): the same document position stays at the same place on screen. */
    replaceKeepingAnchor(text, { caret, mapPos } = {}) {
      const token = ++viewGen;
      const wrap = view.scrollDOM.getBoundingClientRect();
      const head = view.state.selection.main.head;
      const caretCoords = view.coordsAtPos(head);
      const inView = Boolean(caretCoords && caretCoords.top >= wrap.top - 4 && caretCoords.top <= wrap.bottom + 4);
      const oldAnchor = inView ? head : (view.posAtCoords({ x: wrap.left + 24, y: wrap.top + 8 }) ?? head);
      const before = view.coordsAtPos(oldAnchor);
      const yInView = before ? before.top - wrap.top : 0;
      const left = view.scrollDOM.scrollLeft;
      const next = text ?? '';
      const map = typeof mapPos === 'function' ? mapPos : (p) => p;
      const newAnchor = clampPos(map(oldAnchor), next.length);
      const newCaret = clampPos(caret ?? map(head), next.length);
      dispatchSilent(view, { changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: newCaret }, scrollIntoView: false });
      // Layout is read in the measure's read phase (never during an update) and the scroll set in its write phase.
      const shift = (after) => {
        if (token !== viewGen || !after) return;
        view.scrollDOM.scrollTop += after.top - view.scrollDOM.getBoundingClientRect().top - yInView;
        view.scrollDOM.scrollLeft = left;
      };
      const place = () => view.requestMeasure({ key: 'keep-anchor', read: () => (token === viewGen && newAnchor <= view.state.doc.length ? view.coordsAtPos(newAnchor) : null), write: shift });
      place();
      requestAnimationFrame(() => { place(); requestAnimationFrame(place); });
    },
    /** Text and selection in one step, the view held where it is. */
    replaceKeepingView(text, start, end) {
      const top = view.scrollDOM.scrollTop;
      const left = view.scrollDOM.scrollLeft;
      const next = text ?? '';
      const spec = { scrollIntoView: false };
      if (view.state.doc.toString() !== next) spec.changes = { from: 0, to: view.state.doc.length, insert: next };
      if (start != null) spec.selection = { anchor: clampPos(start, next.length), head: clampPos(end ?? start, next.length) };
      if (spec.changes || spec.selection) dispatchSilent(view, spec);
      pinScroll(view, top, left);
    },
    /** Undo / Redo: the caret on the restored change, that line in the middle of the view. */
    replaceAndReveal(text, start, end) {
      const token = ++viewGen;
      const next = text ?? '';
      const from = clampPos(start, next.length);
      const spec = { selection: { anchor: from, head: clampPos(end ?? from, next.length) }, scrollIntoView: false };
      if (view.state.doc.toString() !== next) spec.changes = { from: 0, to: view.state.doc.length, insert: next };
      dispatchSilent(view, spec);
      // Dispatched from frames, never from inside an update or a measure.
      const reveal = () => { if (token === viewGen) view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main, { y: 'center' }) }); };
      reveal();
      requestAnimationFrame(() => { reveal(); requestAnimationFrame(reveal); });
    },
    /** Selects a range and brings it into the middle of the view (go to a heading or a picture). */
    select(start, end) {
      viewGen += 1;
      const len = view.state.doc.length;
      view.dispatch({ selection: { anchor: clampPos(start, len), head: clampPos(end ?? start, len) }, effects: EditorView.scrollIntoView(clampPos(start, len), { y: 'center' }) });
      view.focus();
    },
    selectAll() { view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); view.focus(); },
    selectedText() { const { from, to } = view.state.selection.main; return view.state.sliceDoc(from, to); },
    /** Replaces the selection as typing would (one change the app hears). */
    insert(text) {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    get scrollTop() { return view.scrollDOM.scrollTop; },
    set scrollTop(n) { pinScroll(view, n, view.scrollDOM.scrollLeft); },
    focus() { view.focus(); },
    blur() { view.contentDOM.blur(); },
    measure() { view.requestMeasure(); },
    /** Pictures shown as pictures (true) or as their Markdown text. */
    setPictures(on) { view.dispatch({ effects: picturesSlot.reconfigure(on ? pictureExt : []) }); },
    /** The document position at window coordinates (a drop from outside). */
    posAt(x, y) { return view.posAtCoords({ x, y }); },
    /** Inserts text at `pos` (one change the app hears) and puts the caret after it. */
    insertAt(pos, text) { view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, userEvent: 'input' }); view.focus(); },
    setPlaceholder(text) { view.dispatch({ effects: placeholderSlot.reconfigure(text ? cmPlaceholder(text) : []) }); },
    /** The find panel (Ctrl+F). */
    openSearch() { import('@codemirror/search').then(({ openSearchPanel }) => openSearchPanel(view)); },
    destroy() { view.destroy(); },
  };
  return handle;
}
