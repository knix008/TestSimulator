// CodeMirror 6 setup shared by every tab: the base extensions, the
// compartments the settings reconfigure at run time, the theme (all colours
// come from the app's CSS variables, so the 16 themes of src/themes.js apply
// to the editor as well) and a few editing commands the menus offer.
import { EditorState, Compartment, EditorSelection, Prec } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, highlightWhitespace, highlightTrailingWhitespace,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, selectAll, copyLineDown, deleteLine, moveLineUp, moveLineDown, toggleComment, indentMore, indentLess, insertNewlineAndIndent, insertNewline } from '@codemirror/commands';
import { foldGutter, foldKeymap, indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit, foldAll, unfoldAll, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, highlightSelectionMatches, SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious, replaceNext, replaceAll, selectMatches, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { spellChecker } from './spell';
import { lintExtension } from './lint';

// ── Compartments (reconfigured from the settings) ──
export const comp = {
  language: new Compartment(),
  wrap: new Compartment(),
  lineNumbers: new Compartment(),
  whitespace: new Compartment(),
  activeLine: new Compartment(),
  closeBrackets: new Compartment(),
  bracketMatching: new Compartment(),
  foldGutter: new Compartment(),
  indent: new Compartment(),
  readOnly: new Compartment(),
  spell: new Compartment(),
  lint: new Compartment(),
  autoIndent: new Compartment(),
};

// ── Syntax colours → CSS variables set by src/themes.js ──
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.character, t.docString], color: 'var(--syn-string)' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.literal], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName), t.standard(t.typeName)], color: 'var(--syn-type)' },
  { tag: [t.variableName, t.definition(t.variableName), t.local(t.variableName)], color: 'var(--syn-variable)' },
  { tag: [t.propertyName, t.definition(t.propertyName), t.attributeName, t.labelName], color: 'var(--syn-property)' },
  { tag: [t.operator, t.derefOperator, t.arithmeticOperator, t.logicOperator, t.compareOperator, t.updateOperator, t.punctuation, t.separator], color: 'var(--syn-operator)' },
  { tag: [t.bracket, t.paren, t.squareBracket, t.brace, t.angleBracket], color: 'var(--syn-bracket)' },
  { tag: [t.tagName, t.standard(t.tagName)], color: 'var(--syn-tag)' },
  { tag: [t.attributeValue], color: 'var(--syn-string)' },
  { tag: [t.meta, t.processingInstruction, t.documentMeta, t.annotation], color: 'var(--syn-meta)' },
  { tag: [t.regexp, t.escape, t.special(t.variableName)], color: 'var(--syn-regexp)' },
  // Markdown: headings are bold + coloured here; their H1–H6 sizes and the
  // inline-code box come from the WYSIWYG extension (src/lib/mdlive.js), so
  // the source view stays uniform monospace.
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--syn-heading)', fontWeight: 'bold' },
  { tag: t.quote, color: 'var(--syn-comment)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--syn-link)', textDecoration: 'underline' },
  { tag: t.contentSeparator, color: 'var(--syn-meta)' },
  { tag: t.invalid, color: 'var(--danger)', textDecoration: 'underline wavy' },
  { tag: [t.inserted], color: 'var(--ok)' },
  { tag: [t.deleted], color: 'var(--danger)' },
  { tag: [t.changed], color: 'var(--syn-number)' },
  { tag: [t.self, t.constant(t.variableName), t.constant(t.name)], color: 'var(--syn-constant)' },
]);

// The editor chrome. `&` is the .cm-editor element.
const editorTheme = EditorView.theme({
  '&': { height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontSize: 'var(--editor-fs, 14px)' },
  '.cm-scroller': { fontFamily: 'var(--editor-font, var(--mono))', lineHeight: '1.55', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '4px 0 40vh' },
  '&.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0 8px 0 4px' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': { background: 'var(--bg-sel) !important' },
  '.cm-selectionMatch': { background: 'color-mix(in srgb, var(--accent) 22%, transparent)' },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--fg) 5%, transparent)' },
  '.cm-activeLineGutter': { background: 'color-mix(in srgb, var(--fg) 8%, transparent)', color: 'var(--fg)' },
  '.cm-gutters': { background: 'var(--bg-panel)', color: 'var(--fg-muted)', borderRight: '1px solid var(--border)', userSelect: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '44px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
  '.cm-foldPlaceholder': { background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--fg-muted)', margin: '0 2px', padding: '0 6px', borderRadius: '3px' },
  '.cm-matchingBracket': { background: 'color-mix(in srgb, var(--accent) 30%, transparent)', outline: '1px solid color-mix(in srgb, var(--accent) 60%, transparent)' },
  '.cm-nonmatchingBracket': { background: 'color-mix(in srgb, var(--danger) 30%, transparent)' },
  '.cm-searchMatch': { background: 'color-mix(in srgb, var(--folder) 45%, transparent)', outline: '1px solid color-mix(in srgb, var(--folder) 70%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': { background: 'color-mix(in srgb, var(--folder) 85%, transparent)' },
  '.cm-highlightSpace': { backgroundImage: 'radial-gradient(circle at 50% 55%, var(--fg-muted) 12%, transparent 15%)', opacity: '0.7' },
  '.cm-highlightTab': { backgroundImage: 'linear-gradient(90deg, transparent 0, transparent calc(100% - 9px), var(--fg-muted) calc(100% - 9px), var(--fg-muted) calc(100% - 8px), transparent calc(100% - 8px)), linear-gradient(0deg, transparent 47%, var(--fg-muted) 47%, var(--fg-muted) 53%, transparent 53%)', backgroundSize: '100% 100%, calc(100% - 6px) 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center, left center', opacity: '0.55' },
  '.cm-trailingSpace': { background: 'color-mix(in srgb, var(--danger) 18%, transparent)' },
  '.cm-tooltip': { background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--fg)' },
  // The built-in search panel exists only to keep match highlighting alive
  // (src/components/FindBar.jsx draws the real UI).
  '.cm-panels': { display: 'none' },
  '.cm-specialChar': { color: 'var(--danger)' },
});

// The search extension with an invisible panel — see the note above.
const searchExt = search({ top: true, createPanel: () => ({ dom: document.createElement('div'), top: true }) });

// Base extensions common to every document.
export function baseExtensions(settings, { onChange, onUpdate }) {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    syntaxHighlighting(highlight),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches({ minSelectionLength: 2 }),
    searchExt,
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    editorTheme,
    comp.language.of([]),
    comp.wrap.of(settings.wordWrap ? EditorView.lineWrapping : []),
    comp.lineNumbers.of(settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    comp.lint.of(settings.lint !== false ? lintExtension : []),
    comp.whitespace.of(settings.showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : []),
    comp.activeLine.of(settings.highlightActiveLine ? highlightActiveLine() : []),
    comp.closeBrackets.of(settings.autoCloseBrackets ? closeBrackets() : []),
    comp.bracketMatching.of(settings.bracketMatching ? bracketMatching() : []),
    comp.foldGutter.of(settings.foldGutter ? foldGutter() : []),
    comp.indent.of(indentConfig(settings)),
    comp.readOnly.of(EditorState.readOnly.of(false)),
    comp.spell.of(settings.spellCheck ? spellChecker : []),
    comp.autoIndent.of(autoIndentConfig(settings)),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && onChange) onChange(u);
      if (onUpdate && (u.docChanged || u.selectionSet || u.focusChanged)) onUpdate(u);
    }),
  ];
}

// Auto indentation: Enter keeps / computes the indentation of the new line
// and typing a closing bracket re-indents; off → Enter inserts a bare
// newline. Tab always inserts the unit chosen by indentConfig (spaces or a
// tab character).
export function autoIndentConfig(settings) {
  return settings.autoIndent === false
    ? Prec.high(keymap.of([{ key: 'Enter', run: insertNewline }]))
    : [indentOnInput(), Prec.high(keymap.of([{ key: 'Enter', run: insertNewlineAndIndent }]))];
}

export function indentConfig(settings) {
  const n = Math.max(1, Math.min(16, Number(settings.tabSize) || 4));
  return [EditorState.tabSize.of(n), indentUnit.of(settings.insertSpaces ? ' '.repeat(n) : '\t')];
}

// The reconfiguration effects for changed settings — dispatched to the live
// view and applied to every stored (inactive tab) state.
export function settingsEffects(settings) {
  return [
    comp.wrap.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
    comp.lineNumbers.reconfigure(settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    comp.whitespace.reconfigure(settings.showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : []),
    comp.activeLine.reconfigure(settings.highlightActiveLine ? highlightActiveLine() : []),
    comp.closeBrackets.reconfigure(settings.autoCloseBrackets ? closeBrackets() : []),
    comp.bracketMatching.reconfigure(settings.bracketMatching ? bracketMatching() : []),
    comp.foldGutter.reconfigure(settings.foldGutter ? foldGutter() : []),
    comp.indent.reconfigure(indentConfig(settings)),
    comp.spell.reconfigure(settings.spellCheck ? spellChecker : []),
    comp.lint.reconfigure(settings.lint !== false ? lintExtension : []),
    comp.autoIndent.reconfigure(autoIndentConfig(settings)),
  ];
}

export function reconfigure(view, settings) {
  view.dispatch({ effects: settingsEffects(settings) });
}

export const languageEffect = (support) => comp.language.reconfigure(support || []);
export const readOnlyEffect = (ro) => comp.readOnly.reconfigure(EditorState.readOnly.of(!!ro));

export function createState(text, settings, handlers, extra = []) {
  return EditorState.create({ doc: text, extensions: [...baseExtensions(settings, handlers), ...extra] });
}

// ── Search (driven by src/components/FindBar.jsx) ──
export const searchApi = {
  setQuery(view, { search: s, replace = '', caseSensitive = false, regexp = false, wholeWord = false }) {
    const query = new SearchQuery({ search: s, replace, caseSensitive, regexp, wholeWord });
    view.dispatch({ effects: setSearchQuery.of(query) });
    return query;
  },
  open: (view) => openSearchPanel(view),
  close: (view) => closeSearchPanel(view),
  next: findNext,
  prev: findPrevious,
  replaceNext,
  replaceAll,
  selectAll: selectMatches,
  // Number of matches and the index of the match at / after the cursor.
  count(view) {
    const q = getSearchQuery(view.state);
    if (!q || !q.valid || !q.search) return { total: 0, current: 0 };
    const cursor = q.getCursor(view.state);
    const head = view.state.selection.main.from;
    let total = 0, current = 0;
    for (let m = cursor.next(); !m.done && total < 100000; m = cursor.next()) {
      total++;
      if (!current && m.value.from >= head) current = total;
      if (m.value.from === head && m.value.to === view.state.selection.main.to) current = total;
    }
    return { total, current };
  },
};

// ── Commands (menus) ──
function mapLines(view, fn) {
  const { state } = view;
  const ranges = state.selection.ranges.filter((r) => !r.empty);
  const target = ranges.length ? ranges : [{ from: 0, to: state.doc.length }];
  const changes = target.map((r) => {
    const from = state.doc.lineAt(r.from).from;
    const to = state.doc.lineAt(r.to).to;
    return { from, to, insert: fn(state.doc.sliceString(from, to).split('\n')).join('\n') };
  });
  view.dispatch({ changes, scrollIntoView: true });
  return true;
}

function mapSelection(view, fn) {
  const { state } = view;
  const ranges = state.selection.ranges.filter((r) => !r.empty);
  if (!ranges.length) return mapLines(view, (lines) => lines.map(fn));
  view.dispatch(state.changeByRange((r) => ({ changes: { from: r.from, to: r.to, insert: fn(state.doc.sliceString(r.from, r.to)) }, range: r })));
  return true;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const commands = {
  undo, redo, selectAll,
  duplicateLine: copyLineDown,
  deleteLine,
  moveLineUp, moveLineDown,
  toggleComment,
  indent: indentMore, outdent: indentLess,
  newlineAndIndent: insertNewlineAndIndent,
  foldAll, unfoldAll,
  upper: (v) => mapSelection(v, (s) => s.toUpperCase()),
  lower: (v) => mapSelection(v, (s) => s.toLowerCase()),
  sortAsc: (v) => mapLines(v, (lines) => lines.slice().sort(collator.compare)),
  sortDesc: (v) => mapLines(v, (lines) => lines.slice().sort((a, b) => collator.compare(b, a))),
  trimTrailing: (v) => mapLines(v, (lines) => lines.map((l) => l.replace(/[ \t]+$/, ''))),
  removeEmpty: (v) => mapLines(v, (lines) => lines.filter((l) => l.trim() !== '')),
  removeDuplicates: (v) => mapLines(v, (lines) => lines.filter((l, i, a) => a.indexOf(l) === i)),
  insertText: (v, text) => { v.dispatch(v.state.replaceSelection(text)); return true; },
  deleteSelection: (v) => { v.dispatch(v.state.replaceSelection('')); return true; },
  gotoLine(v, line, col = 1) {
    const n = Math.max(1, Math.min(v.state.doc.lines, line));
    const l = v.state.doc.line(n);
    const pos = Math.min(l.to, l.from + Math.max(0, col - 1));
    v.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    v.focus();
    return true;
  },
};

// Whole-document transformations applied on save (settings).
export function applySaveTransforms(text, settings) {
  let out = text;
  if (settings.trimTrailingOnSave) out = out.replace(/[ \t]+$/gm, '');
  if (settings.finalNewlineOnSave && out.length && !out.endsWith('\n')) out += '\n';
  return out;
}

// Cursor / selection summary for the status bar.
export function cursorInfo(state) {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  let selected = 0, selLines = 0;
  for (const r of state.selection.ranges) {
    if (r.empty) continue;
    selected += r.to - r.from;
    selLines += state.doc.lineAt(r.to).number - state.doc.lineAt(r.from).number + 1;
  }
  return { line: line.number, col: main.head - line.from + 1, selected, selLines, ranges: state.selection.ranges.length, chars: state.doc.length, lines: state.doc.lines };
}
