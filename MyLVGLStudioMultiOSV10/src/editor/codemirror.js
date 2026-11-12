// CodeMirror 6 for the code editor window: one EditorState per file (its own undo history),
// C/C++ colours in the app's theme, completion of the ViewModel and library names, problems as
// diagnostics. Kept apart from the React window so the setup can be read in one place.
import { Compartment, EditorSelection, EditorState, StateEffect, StateField, Transaction, countColumn } from "@codemirror/state";
import {
  Decoration, ViewPlugin, EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap, lineNumbers, rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { IndentContext, ensureSyntaxTree, getIndentation, indentString } from "@codemirror/language";
import {
  syntaxTree, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { lintGutter, lintKeymap, setDiagnostics } from "@codemirror/lint";
import { cpp } from "@codemirror/lang-cpp";
import { tags } from "@lezer/highlight";
import { wordsOf } from "./spell.js";

/** Marks a change that came from outside (the disk, the design): it is not the user's typing. */
export const External = Transaction.userEvent.of("external");

/** The app's colours: the same tones as the code view of the main window. */
const highlight = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [tags.string, tags.character], color: "var(--tone-green)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--tone-orange)" },
  { tag: [tags.keyword, tags.controlKeyword, tags.modifier, tags.operatorKeyword], color: "var(--tone-pink)" },
  { tag: [tags.typeName, tags.standard(tags.typeName)], color: "var(--tone-purple)" },
  { tag: [tags.processingInstruction, tags.macroName], color: "var(--tone-purple)" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--tone-blue)" },
  { tag: tags.definition(tags.variableName), color: "var(--ink)", fontWeight: "600" },
  { tag: tags.constant(tags.variableName), color: "var(--tone-teal)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--ink)", backgroundColor: "var(--panel)", fontSize: "var(--editor-font, 13px)" },
  ".cm-scroller": { fontFamily: 'Consolas, "Cascadia Mono", "Malgun Gothic", monospace', lineHeight: "1.5" },
  ".cm-content": { caretColor: "var(--ink)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent) !important" },
  ".cm-gutters": { backgroundColor: "var(--header)", color: "var(--muted)", borderRight: "1px solid var(--line)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--ink)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--tone-orange) 22%, transparent)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--tone-teal) 30%, transparent)", outline: "none" },
  ".cm-panels": { backgroundColor: "var(--header)", color: "var(--ink)" },
  ".cm-panels-bottom": { borderTop: "1px solid var(--line)" },
  ".cm-panel input, .cm-panel button, .cm-textfield": { font: "inherit", fontSize: "12px", color: "var(--ink)", background: "var(--input, var(--panel))", border: "1px solid var(--line)", borderRadius: "3px" },
  ".cm-panel.cm-search label": { fontSize: "12px" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--selected)", color: "var(--accent-ink)" },
  ".cm-completionDetail": { color: "var(--muted)", fontStyle: "normal", marginLeft: "12px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--danger)" },
  ".cm-misspelled": { textDecoration: "underline wavy var(--tone-blue)", textDecorationSkipInk: "none", textUnderlineOffset: "3px" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--hover)", border: "1px solid var(--line)", color: "var(--muted)" },
});

/**
 * The editor's completions: { label, detail, type }. The ViewModel names come from the design;
 * the library and common C words are always there.
 */
export function completionSource(getItems) {
  return (context) => {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    if (!context.explicit && word.to - word.from < 2) return null;
    return { from: word.from, options: getItems(), validFor: /^[A-Za-z0-9_]*$/ };
  };
}

/** Compartments for what changes while a state lives: read only, word wrap, the language of its own texts. */
export const readOnlyPart = new Compartment();
export const wrapPart = new Compartment();
export const phrasesPart = new Compartment();
export const spellPart = new Compartment();
export const indentPart = new Compartment();

export const TAB_MIN = 2;
export const TAB_MAX = 8;
/** The tab width: an indent is that many spaces, and a tab character already in a file is shown that wide. */
export const indentFor = (size) => {
  const width = Math.min(TAB_MAX, Math.max(TAB_MIN, Math.round(Number(size)) || 4));
  return [indentUnit.of(" ".repeat(width)), EditorState.tabSize.of(width)];
};

/**
 * The Tab key: spaces, never a tab character. A caret (or a selection on one line) gets spaces
 * up to the next tab stop; a selection over several lines is indented, with spaces too.
 */
export function insertSpaces(view) {
  const state = view.state;
  if (state.readOnly) return false;
  const doc = state.doc;
  if (state.selection.ranges.some((range) => doc.lineAt(range.from).number !== doc.lineAt(range.to).number)) return indentMore(view);
  const size = state.tabSize;
  view.dispatch(state.update(state.changeByRange((range) => {
    const line = doc.lineAt(range.from);
    const column = countColumn(line.text.slice(0, range.from - line.from), size);
    const spaces = " ".repeat(size - (column % size));
    return { changes: { from: range.from, to: range.to, insert: spaces }, range: EditorSelection.cursor(range.from + spaces.length) };
  }), { scrollIntoView: true, userEvent: "input" }));
  return true;
}

/**
 * Auto indent: the lines of the selection (the whole file with no selection) are indented
 * again as the C code says, with spaces; tabs in front of a line become spaces, lines of only
 * blanks become empty. Lines the grammar has no indent for (inside a comment) keep their width.
 */
export function autoIndent(view) {
  const state = view.state;
  if (state.readOnly) return false;
  const doc = state.doc;
  ensureSyntaxTree(state, doc.length, 2000);
  const ranges = state.selection.ranges.every((range) => range.empty) ? [{ from: 0, to: doc.length }] : state.selection.ranges;
  const updated = Object.create(null);
  const context = new IndentContext(state, { overrideIndentation: (start) => updated[start] ?? -1 });
  const seen = new Set();
  const changes = [];
  for (const range of ranges) {
    for (let at = range.from; at <= range.to;) {
      const line = doc.lineAt(at);
      at = line.to + 1;
      if (seen.has(line.number)) continue;
      seen.add(line.number);
      const current = /^\s*/.exec(line.text)[0];
      let wanted = "";
      if (line.text.trim()) {
        let indent = getIndentation(context, line.from);
        if (indent == null || indent < 0) indent = countColumn(current, state.tabSize);
        updated[line.from] = indent;
        wanted = indentString(state, indent);
      }
      if (wanted !== current) changes.push({ from: line.from, to: line.from + current.length, insert: wanted });
    }
  }
  if (changes.length) view.dispatch({ changes, userEvent: "input.indent" });
  return true;
}

/* ------------------------------------------------------------------ spelling */
// Words of comments and strings that no dictionary knows get a wavy underline. The check runs
// on the visible lines a moment after typing stops; its answer is dropped if the text moved on.
const setSpelling = StateEffect.define();
const spellingField = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setSpelling)) next = effect.value;
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The comments and strings of the visible lines, as words with their places. */
export function readableWords(state, ranges) {
  const words = [];
  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (!/Comment|String/.test(node.name)) return undefined;
        words.push(...wordsOf(state.sliceDoc(node.from, node.to), node.from));
        return false;
      },
    });
  }
  return words;
}

/**
 * Spell checking: `check(words)` resolves to the misspelled ones. Without it (spell checking
 * off) nothing is marked.
 */
export function spellChecking(check) {
  if (!check) return [];
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.timer = null;
      this.schedule(50);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) this.schedule(300);
    }
    schedule(ms) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.run(), ms);
    }
    async run() {
      const view = this.view;
      const state = view.state;
      const seen = new Set();
      const words = readableWords(state, view.visibleRanges).filter((item) => {
        const key = `${item.from}:${item.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      let wrong;
      try {
        wrong = await check(words);
      } catch {
        return;
      }
      if (this.view.state.doc !== state.doc) return;
      const marks = Decoration.set(wrong.sort((a, b) => a.from - b.from).map((item) => Decoration.mark({ class: "cm-misspelled", attributes: { "data-misspelled": item.word } }).range(item.from, item.to)));
      this.view.dispatch({ effects: setSpelling.of(marks) });
    }
    destroy() {
      clearTimeout(this.timer);
    }
  });
  return [spellingField, plugin];
}

/** The misspelled word at a place of the document, or null: { from, to, word }. */
export function misspelledAt(state, pos) {
  const marks = state.field(spellingField, false);
  if (!marks) return null;
  let found = null;
  marks.between(pos, pos, (from, to, value) => {
    if (from <= pos && pos <= to) found = { from, to, word: value.spec.attributes["data-misspelled"] };
  });
  return found;
}

/** CodeMirror's own texts (search, go to line, folding, lint, completion) in Korean. */
const KOREAN = {
  Find: "찾기", Replace: "바꾸기", next: "다음", previous: "이전", all: "모두", "match case": "대소문자 구분", regexp: "정규식", "by word": "낱말 단위",
  replace: "바꾸기", "replace all": "모두 바꾸기", close: "닫기", "current match": "현재 일치", "replaced match on line $": "$번 줄에서 바꿨습니다",
  "replaced $ matches": "$개를 바꿨습니다", "on line": "줄", "Go to line": "줄로 이동", go: "이동",
  "Folded lines": "접은 줄", "Unfolded lines": "펼친 줄", to: "~", "folded code": "접은 코드", unfold: "펼치기", "Fold line": "줄 접기", "Unfold line": "줄 펼치기",
  "Control character": "제어 문자", "Selection deleted": "선택 영역 삭제됨", Diagnostics: "문제점", "No diagnostics": "문제 없음", Completions: "자동 완성",
};
/** The phrases of a language for EditorState.phrases; English is CodeMirror's own. */
export const phrasesFor = (language) => EditorState.phrases.of(language === "ko" ? KOREAN : {});

/**
 * A state for one file. `actions` are the window's: save, run, stop. `items()` gives the
 * completions now (they follow the design).
 */
export function createState(text, { readOnly = false, wrap = false, language = "ko", spell = null, tabSize = 4, items, actions, onUpdate }) {
  return EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      lintGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      indentPart.of(indentFor(tabSize)),
      syntaxHighlighting(highlight),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ override: [completionSource(items)], icons: false }),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: false }),
      cpp(),
      theme,
      readOnlyPart.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      wrapPart.of(wrap ? EditorView.lineWrapping : []),
      phrasesPart.of(phrasesFor(language)),
      spellPart.of(spellChecking(spell)),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { actions.save(); return true; } },
        { key: "F5", preventDefault: true, run: () => { actions.run(); return true; } },
        { key: "Shift-F5", preventDefault: true, run: () => { actions.stop(); return true; } },
        { key: "Mod-g", preventDefault: true, run: (view) => actions.gotoLine(view) },
        { key: "Tab", preventDefault: true, run: insertSpaces, shift: indentLess },
        { key: "Shift-Alt-f", preventDefault: true, run: autoIndent },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.updateListener.of(onUpdate),
    ],
  });
}

/** Problems of one file as diagnostics: [{ line, severity, text }]. */
export function diagnosticsFor(state, marks) {
  const doc = state.doc;
  return marks
    .filter((mark) => mark.line >= 1 && mark.line <= doc.lines)
    .map((mark) => {
      const line = doc.line(mark.line);
      const start = line.text.length - line.text.trimStart().length;
      return { from: line.from + start, to: Math.max(line.from + start, line.to), severity: mark.severity === "error" ? "error" : mark.severity === "warning" ? "warning" : "info", message: mark.text };
    });
}

export { EditorView, EditorState, setDiagnostics };
