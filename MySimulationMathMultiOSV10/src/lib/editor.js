// CodeMirror 6 for M files: syntax colours from the theme (--syn-*), line
// numbers, a breakpoint gutter, the debugger's current line, %% section
// rules, run-section, completion and hover help from the engine, find /
// replace and comment / indent commands.
import { EditorState, Compartment, StateField, StateEffect, RangeSet, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightActiveLine, gutter, GutterMarker, Decoration, ViewPlugin,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, indentMore, indentLess, lineComment, lineUncomment } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { octave } from '@codemirror/legacy-modes/mode/octave';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { hoverHelp } from './hoverHelp.js';
import { spellCheck } from './spell.js';
import { reindentM } from './indentM.js';
export { sectionOfText } from './sections.js';

export const mLanguage = StreamLanguage.define(octave);

const syn = (k) => `var(--syn-${k})`;
export const mHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: syn('keyword'), fontWeight: '600' },
  { tag: [tags.standard(tags.variableName), tags.function(tags.variableName)], color: syn('function') },
  { tag: tags.string, color: syn('string') },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: syn('comment'), fontStyle: 'italic' },
  { tag: tags.number, color: syn('number') },
  { tag: tags.operator, color: syn('operator') },
  { tag: tags.variableName, color: syn('variable') },
  { tag: tags.bracket, color: syn('bracket') },
  { tag: tags.meta, color: syn('meta') },
  { tag: tags.invalid, color: syn('tag') },
  { tag: tags.atom, color: syn('constant') },
]);

// ── Breakpoints ────────────────────────────────────────────
const bpMarker = new (class extends GutterMarker { toDOM() { const s = document.createElement('span'); s.className = 'cm-bp-dot'; return s; } })();
export const toggleBreakpointEffect = StateEffect.define({ map: (pos, mapping) => mapping.mapPos(pos) });
export const setBreakpointsEffect = StateEffect.define();

const breakpointField = StateField.define({
  create() { return RangeSet.empty; },
  update(set, tr) {
    let next = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(toggleBreakpointEffect)) {
        let has = false;
        next.between(e.value, e.value, () => { has = true; });
        next = next.update(has ? { filter: (from) => from !== e.value } : { add: [bpMarker.range(e.value)] });
      } else if (e.is(setBreakpointsEffect)) {
        const b = new RangeSetBuilder();
        const lines = [...new Set(e.value)].filter((n) => n >= 1 && n <= tr.state.doc.lines).sort((a, c) => a - c);
        for (const n of lines) { const pos = tr.state.doc.line(n).from; b.add(pos, pos, bpMarker); }
        next = b.finish();
      }
    }
    return next;
  },
});

export function breakpointLines(state) {
  const out = [];
  const set = state.field(breakpointField, false);
  if (!set) return out;
  const it = set.iter();
  while (it.value) { out.push(state.doc.lineAt(it.from).number); it.next(); }
  return [...new Set(out)];
}

// ── Debugger line ──────────────────────────────────────────
export const setDebugLineEffect = StateEffect.define();
const debugLineDeco = Decoration.line({ class: 'cm-debug-line' });
const debugField = StateField.define({
  create() { return Decoration.none; },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setDebugLineEffect)) {
        const n = e.value;
        deco = n && n >= 1 && n <= tr.state.doc.lines ? Decoration.set([debugLineDeco.range(tr.state.doc.line(n).from)]) : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const debugMarker = new (class extends GutterMarker { toDOM() { const s = document.createElement('span'); s.className = 'cm-debug-arrow'; s.textContent = '➜'; return s; } })();

// ── %% sections ────────────────────────────────────────────
const sectionDeco = Decoration.line({ class: 'cm-section-head' });
const sectionPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view) {
    const b = new RangeSetBuilder();
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        if (/^\s*%%(\s|$)/.test(line.text)) b.add(line.from, line.from, sectionDeco);
        pos = line.to + 1;
      }
    }
    return b.finish();
  }
}, { decorations: (v) => v.decorations });

/** The %% section around `pos`: { from, to, text, startLine }. */
export function sectionAt(state, pos) {
  const doc = state.doc;
  const cur = doc.lineAt(pos).number;
  let start = 1;
  for (let n = cur; n >= 1; n--) { if (/^\s*%%(\s|$)/.test(doc.line(n).text)) { start = n; break; } }
  let end = doc.lines;
  for (let n = Math.max(cur, start) + 1; n <= doc.lines; n++) { if (/^\s*%%(\s|$)/.test(doc.line(n).text)) { end = n - 1; break; } }
  const from = doc.line(start).from;
  const to = doc.line(end).to;
  return { from, to, text: doc.sliceString(from, to), startLine: start };
}

function lookTheme({ fontFamily, fontSize }) {
  return EditorView.theme({
    '&': { fontSize: `${fontSize}px`, height: '100%' },
    '.cm-content, .cm-gutters': { fontFamily: `"${fontFamily}", Consolas, "D2Coding", monospace` },
  });
}

const KIND_TYPE = { function: 'function', builtin: 'function', variable: 'variable', field: 'property', property: 'property', file: 'text', keyword: 'keyword', class: 'class', folder: 'namespace' };

/**
 * Creates an editor in `parent`. actions (a mutable object the caller keeps
 * current): onChange(text), onCursor({ line, col, sel }), onBreakpoints(lines),
 * complete(text, cursor) → [{ label, kind }], help(name) → { en, ko, syntax }, spellWords() → [words],
 * spellKnown() → Set of lower-case names, addSpellWord(word), run(), runSection(), evalSelection(),
 * save(), toggleBreakpoint().
 */
export function createMEditor({ parent, doc = '', settings = {}, actions = {} }) {
  const look = new Compartment();
  const tabs = new Compartment();
  const wrap = new Compartment();
  const numbers = new Compartment();
  const spell = new Compartment();
  const ed = settings || {};
  const tabSize = ed.tabSize || 4;
  // 들여쓰기 간격 (Settings › 편집기): spaces per level for Tab, Enter and 자동 들여쓰기; the tab size is the width of a tab character
  const indentOf = (o) => ' '.repeat(o.indentSize || o.tabSize || 4);
  let indentOpts = { unit: indentOf(ed), functions: ed.indentFunctions === false ? 'nested' : 'all' };
  const call = (name, ...args) => { const fn = actions[name]; return fn ? fn(...args) : undefined; };
  // 맞춤법: English words in comments and strings (lib/spell.js)
  const spellExt = () => spellCheck({ words: () => call('spellWords') || [], known: () => call('spellKnown') || null, onAdd: (w) => call('addSpellWord', w) });

  const completionSource = async (context) => {
    const word = context.matchBefore(/[\w.]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    if (!context.explicit && word.to - word.from < 2) return null;
    const line = context.state.doc.lineAt(context.pos);
    const text = line.text.slice(0, context.pos - line.from);
    const items = (await call('complete', text, text.length)) || [];
    if (!items.length) return null;
    const dot = word.text.lastIndexOf('.');
    return {
      from: dot >= 0 ? word.from + dot + 1 : word.from,
      options: items.slice(0, 200).map((it) => ({ label: it.label, type: KIND_TYPE[it.kind] || 'variable', detail: it.detail || undefined })),
      validFor: /^\w*$/,
    };
  };

  // 자동 들여쓰기: the whole text (or the selected lines, indented in the context of the whole text), one Undo step
  let viewRef = null;
  function reindent() {
    const view = viewRef;
    if (!view) return;
    const doc = view.state.doc;
    const next = reindentM(doc.toString(), indentOpts.unit, { functions: indentOpts.functions }).split(/\r?\n/);
    const sel = view.state.selection.main;
    const a = sel.empty ? 1 : doc.lineAt(sel.from).number, b = sel.empty ? doc.lines : doc.lineAt(sel.to).number;
    const changes = [];
    for (let n = a; n <= b; n++) {
      const line = doc.line(n);
      if (next[n - 1] !== undefined && next[n - 1] !== line.text) changes.push({ from: line.from, to: line.to, insert: next[n - 1] });
    }
    if (changes.length) view.dispatch({ changes, userEvent: 'input.indent' });
  }

  const toggleBp = (view, lineNo) => {
    const n = lineNo || view.state.doc.lineAt(view.state.selection.main.head).number;
    view.dispatch({ effects: toggleBreakpointEffect.of(view.state.doc.line(n).from) });
    call('onBreakpoints', breakpointLines(view.state));
    return true;
  };

  const keys = [
    { key: 'F5', run: () => { call('run'); return true; } },
    { key: 'Mod-Enter', run: () => { if (actions.ctrlEnterSection === false) return false; call('runSection'); return true; } },
    { key: 'F9', run: () => { call('evalSelection'); return true; } },
    { key: 'F12', run: (v) => toggleBp(v) },
    { key: 'F10', run: () => { call('debug', 'step'); return true; } },
    { key: 'F11', run: () => { call('debug', 'stepIn'); return true; } },
    { key: 'Shift-F11', run: () => { call('debug', 'stepOut'); return true; } },
    { key: 'Mod-s', run: () => { call('save'); return true; }, preventDefault: true },
    { key: 'Mod-r', run: lineComment, preventDefault: true },
    { key: 'Mod-t', run: lineUncomment, preventDefault: true },
    { key: 'Mod-]', run: indentMore },
    { key: 'Mod-[', run: indentLess },
    { key: 'Mod-g', run: gotoLine, preventDefault: true },
    { key: 'Mod-i', run: () => { reindent(); return true; }, preventDefault: true },
  ];

  const state = EditorState.create({
    doc,
    extensions: [
      numbers.of(ed.lineNumbers === false ? [] : lineNumbers()),
      gutter({
        class: 'cm-bp-gutter',
        markers: (v) => {
          const bps = v.state.field(breakpointField);
          const dbg = v.state.field(debugField);
          if (!dbg.size) return bps;
          const b = new RangeSetBuilder();
          const items = [];
          const it = bps.iter();
          while (it.value) { items.push([it.from, bpMarker]); it.next(); }
          const d = dbg.iter();
          if (d.value) items.push([d.from, debugMarker]);
          items.sort((a, c) => a[0] - c[0]);
          for (const [pos, m] of items) b.add(pos, pos, m);
          return b.finish();
        },
        initialSpacer: () => bpMarker,
        domEventHandlers: { mousedown: (view, line) => toggleBp(view, view.state.doc.lineAt(line.from).number) },
      }),
      breakpointField,
      debugField,
      highlightActiveLineGutter(),
      foldGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(mHighlight),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ override: [completionSource], activateOnTyping: true }),
      hoverHelp((name) => call('help', name)),
      spell.of(ed.spellCheck ? spellExt() : []),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      mLanguage,
      sectionPlugin,
      tabs.of([EditorState.tabSize.of(tabSize), indentUnit.of(indentOpts.unit)]),
      wrap.of(ed.wrap ? EditorView.lineWrapping : []),
      look.of(lookTheme({ fontFamily: ed.fontFamily || 'Consolas', fontSize: ed.fontSize || 13 })),
      keymap.of([...keys, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) call('onChange', u.state.doc.toString());
        if (u.docChanged || u.selectionSet) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          call('onCursor', { line: line.number, col: head - line.from + 1, sel: u.state.selection.main.to - u.state.selection.main.from });
        }
      }),
    ],
  });
  const view = new EditorView({ state, parent });
  viewRef = view;

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    focus: () => view.focus(),
    /** Replaces the selection with text (the 도움말 panel's insert). */
    insert(text) { view.dispatch(view.state.replaceSelection(String(text))); view.focus(); },
    selection() { const r = view.state.selection.main; return view.state.sliceString(r.from, r.to); },
    currentLine: () => view.state.doc.lineAt(view.state.selection.main.head).number,
    section: () => sectionAt(view.state, view.state.selection.main.head),
    gotoLine(n, col) {
      const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, n || 1)));
      const at = line.from + Math.max(0, Math.min(line.length, (col || 1) - 1));
      view.dispatch({ selection: { anchor: at }, scrollIntoView: true, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
      view.focus();
    },
    setDebugLine(n) {
      view.dispatch({ effects: setDebugLineEffect.of(n || null) });
      if (n) { const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, n))); view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) }); }
    },
    breakpoints: () => breakpointLines(view.state),
    setBreakpoints(lines) { view.dispatch({ effects: setBreakpointsEffect.of(lines || []) }); },
    toggleBreakpoint: () => toggleBp(view),
    undo: () => undo(view),
    redo: () => redo(view),
    find: () => openSearchPanel(view),
    comment: () => lineComment(view),
    uncomment: () => lineUncomment(view),
    indent: () => indentMore(view),
    outdent: () => indentLess(view),
    reindent: () => { reindent(); view.focus(); },
    configure(next) {
      const n = next || {};
      const ts = n.tabSize || 4;
      indentOpts = { unit: indentOf(n), functions: n.indentFunctions === false ? 'nested' : 'all' };
      view.dispatch({ effects: [
        look.reconfigure(lookTheme({ fontFamily: n.fontFamily || 'Consolas', fontSize: n.fontSize || 13 })),
        tabs.reconfigure([EditorState.tabSize.of(ts), indentUnit.of(indentOf(n))]),
        wrap.reconfigure(n.wrap ? EditorView.lineWrapping : []),
        numbers.reconfigure(n.lineNumbers === false ? [] : lineNumbers()),
        spell.reconfigure(n.spellCheck ? spellExt() : []),
      ] });
    },
    destroy: () => view.destroy(),
  };
}
