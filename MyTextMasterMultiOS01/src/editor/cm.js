// The text editor: one CodeMirror view, one EditorState per open document (switching tabs swaps
// the state, so each document keeps its own undo history, selection and scroll position).
import { Compartment, EditorSelection, EditorState, Prec } from '@codemirror/state';
import {
  EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  highlightWhitespace, keymap, lineNumbers, rectangularSelection, runScopeHandlers,
} from '@codemirror/view';
import { spellCheck } from './spell.js';
import { bookmarks } from './bookmarks.js';
import { completions } from './snippets.js';
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo, selectAll, toggleComment, copyLineDown, indentMore, indentLess } from '@codemirror/commands';
import { gotoLine, highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import {
  HighlightStyle, LanguageDescription, bracketMatching, foldAll, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting, unfoldAll,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';

// Colours of the tone palette (styles.css): they follow light and dark themes on their own.
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.3em', color: 'var(--tone-blue)' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.18em', color: 'var(--tone-blue)' },
  { tag: tags.heading3, fontWeight: '700', fontSize: '1.08em', color: 'var(--tone-indigo)' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700', color: 'var(--tone-indigo)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--tone-sky)', textDecoration: 'underline' },
  { tag: tags.quote, color: 'var(--tone-slate)', fontStyle: 'italic' },
  { tag: [tags.monospace], color: 'var(--tone-pink)' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.list], color: 'var(--tone-orange)' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: 'var(--tone-purple)' },
  { tag: [tags.tagName], color: 'var(--tone-red)' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--tone-amber)' },
  { tag: [tags.string, tags.attributeValue, tags.special(tags.string)], color: 'var(--tone-green)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--tone-orange)' },
  { tag: [tags.comment, tags.meta], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--tone-blue)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--tone-teal)' },
  { tag: [tags.definition(tags.variableName)], color: 'var(--tone-cyan)' },
  { tag: [tags.angleBracket, tags.bracket, tags.punctuation], color: 'var(--muted)' },
  { tag: tags.invalid, color: 'var(--danger)' },
]);

const PHRASES_KO = {
  Find: '찾기', Replace: '바꾸기', next: '다음', previous: '이전', all: '모두', 'match case': '대소문자 구분', 'by word': '단어 단위',
  regexp: '정규식', replace: '바꾸기', 'replace all': '모두 바꾸기', close: '닫기', 'current match': '현재 항목', 'on line': '줄',
  'replaced match on line $': '$ 줄의 항목을 바꿨습니다', 'replaced $ matches': '$ 개를 바꿨습니다', 'Go to line': '줄로 이동', go: '이동',
  'Folded lines': '접힌 줄', 'Unfolded lines': '펼친 줄', 'Fold line': '줄 접기', 'Unfold line': '줄 펼치기', to: '→',
  'folded code': '접힌 코드', unfold: '펼치기', 'Control character': '제어 문자', 'Selection deleted': '선택 영역 삭제',
};

/** Every language the editor can highlight (Language menu), by name. */
export const LANGUAGE_NAMES = languages.map((description) => description.name).sort((a, b) => a.localeCompare(b));

/**
 * The language support for a document: Markdown (with code blocks in their own language), HTML, or by
 * file name; `syntax` (a name from LANGUAGE_NAMES, or 'plain') overrides the guess. Snippets and word
 * completion come with it.
 */
export async function languageFor(kind, name, syntax = null) {
  let support = [];
  if (syntax && syntax !== 'plain') {
    const description = languages.find((d) => d.name === syntax);
    if (description) { try { support = await description.load(); } catch { support = []; } }
  } else if (!syntax && kind === 'markdown') support = markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true });
  else if (!syntax && kind === 'html') support = html({ autoCloseTags: true, matchClosingTags: true });
  else if (!syntax) {
    const description = LanguageDescription.matchFilename(languages, name ?? '');
    if (description) { try { support = await description.load(); } catch { support = []; } }
  }
  return [support, completions(kind)];
}

/** The name of the language a document is highlighted with (status bar). */
export function languageName(kind, name, syntax) {
  if (syntax) return syntax === 'plain' ? null : syntax;
  if (kind === 'markdown') return 'Markdown';
  if (kind === 'html') return 'HTML';
  return LanguageDescription.matchFilename(languages, name ?? '')?.name ?? null;
}

export class TextEditor {
  /**
   * host: the element the editor fills. hooks: onChange(doc), onCursor(doc), onScroll(), onKey(event) → true when handled.
   */
  constructor(host, hooks) {
    this.hooks = hooks;
    this.doc = null;
    this.c = { language: new Compartment(), options: new Compartment(), phrases: new Compartment(), theme: new Compartment(), readOnly: new Compartment(), spell: new Compartment() };
    this.macro = null; // the steps being recorded, or null
    this.lastMacro = [];
    this.view = new EditorView({ parent: host, state: EditorState.create({ doc: '' }) });
    this.view.scrollDOM.addEventListener('scroll', () => hooks.onScroll?.(), { passive: true });
  }

  /** The extensions of a new document's state. */
  extensions(settings, language, dark, readOnly) {
    return [
      this.c.language.of(language),
      this.c.options.of(optionExtensions(settings)),
      this.c.phrases.of(settings.language === 'ko' ? EditorState.phrases.of(PHRASES_KO) : []),
      this.c.theme.of(EditorView.darkTheme.of(dark)),
      this.c.readOnly.of(EditorState.readOnly.of(Boolean(readOnly))),
      this.c.spell.of(this.spellExtension(settings)),
      bookmarks(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSpecialChars(),
      highlightSelectionMatches(),
      syntaxHighlighting(highlight),
      autocompletion({ activateOnTyping: true, icons: false }),
      search({ top: true }),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
      Prec.highest(EditorView.domEventHandlers({ keydown: (event) => { this.recordKey(event); return this.hooks.onKey?.(event) === true; } })),
      EditorView.inputHandler.of((view, from, to, text) => { if (this.macro) this.macro.push({ text }); return false; }),
      EditorView.updateListener.of((update) => {
        if (!this.doc) return;
        if (update.docChanged) { this.doc.state = update.state; this.hooks.onChange?.(this.doc, update); }
        if (update.selectionSet || update.docChanged) { this.doc.state = update.state; this.hooks.onCursor?.(this.doc); }
      }),
    ];
  }

  /** A fresh state for a document (its text, language and the current options). */
  async createState(doc, settings, dark, extras = []) {
    const language = await languageFor(doc.kind, doc.name, doc.syntax);
    return EditorState.create({ doc: doc.text ?? '', extensions: [this.extensions(settings, language, dark, doc.readOnly), extras] });
  }

  /** Shows a document in the view (its own state), keeping the other documents' states. */
  show(doc, settings, dark) {
    if (this.doc && this.doc !== doc) this.doc.scroll = { top: this.view.scrollDOM.scrollTop, left: this.view.scrollDOM.scrollLeft };
    this.doc = doc;
    this.view.setState(doc.state);
    this.apply(settings, dark);
    const scroll = doc.scroll;
    requestAnimationFrame(() => { if (this.doc === doc && scroll) { this.view.scrollDOM.scrollTop = scroll.top; this.view.scrollDOM.scrollLeft = scroll.left; } });
  }

  /** The current options on the shown document (after a settings or theme change). */
  apply(settings, dark) {
    if (!this.doc) return;
    this.view.dispatch({ effects: [
      this.c.options.reconfigure(optionExtensions(settings)),
      this.c.phrases.reconfigure(settings.language === 'ko' ? EditorState.phrases.of(PHRASES_KO) : []),
      this.c.theme.reconfigure(EditorView.darkTheme.of(dark)),
      this.c.spell.reconfigure(this.spellExtension(settings)),
    ] });
    this.doc.state = this.view.state;
  }

  spellExtension(settings) {
    if (!settings.spellCheck) return [];
    const languages = settings.spellLanguages === 'en' ? ['en'] : settings.spellLanguages === 'ko' ? ['ko'] : ['en', 'ko'];
    return spellCheck({ languages, onResult: (wrong) => this.hooks.onSpell?.(this.doc, wrong) });
  }

  // ───────── macros (Notepad++ Macro › Start / Stop recording, Playback)

  startMacro() { this.macro = []; }
  stopMacro() { if (this.macro) this.lastMacro = this.macro; this.macro = null; return this.lastMacro.length; }
  get recording() { return Boolean(this.macro); }

  /** Keys that are commands (Enter, Backspace, arrows, Ctrl+…); typed characters come through inputHandler. */
  recordKey(event) {
    if (!this.macro || event.isComposing) return;
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (printable || ['Shift', 'Control', 'Alt', 'Meta', 'Process'].includes(event.key)) return;
    const { key, code, ctrlKey, shiftKey, altKey, metaKey, keyCode } = event;
    this.macro.push({ key: { key, code, ctrlKey, shiftKey, altKey, metaKey, keyCode } });
  }

  /** Plays the last recorded macro `times` times (keys go through the editor's key bindings and the app's). */
  playMacro(times = 1) {
    const steps = this.lastMacro;
    if (!steps.length) return false;
    for (let n = 0; n < times; n += 1) {
      for (const step of steps) {
        if (step.text !== undefined) this.view.dispatch(this.view.state.replaceSelection(step.text), { userEvent: 'input.type' });
        else {
          const event = new KeyboardEvent('keydown', { ...step.key, bubbles: true, cancelable: true });
          if (!runScopeHandlers(this.view, event, 'editor')) this.hooks.onKey?.(event);
        }
      }
    }
    this.focus();
    return true;
  }

  async setLanguage(doc) {
    const language = await languageFor(doc.kind, doc.name, doc.syntax);
    if (this.doc === doc) { this.view.dispatch({ effects: this.c.language.reconfigure(language) }); doc.state = this.view.state; } else doc.state = doc.state.update({ effects: this.c.language.reconfigure(language) }).state;
  }

  setReadOnly(doc) {
    const effect = this.c.readOnly.reconfigure(EditorState.readOnly.of(Boolean(doc.readOnly)));
    if (this.doc === doc) { this.view.dispatch({ effects: effect }); doc.state = this.view.state; } else doc.state = doc.state.update({ effects: effect }).state;
  }

  text(doc = this.doc) { return doc?.state?.doc.toString() ?? ''; }

  /** Replaces the whole text (reload from disk); undo can bring the old text back. */
  setText(doc, text) {
    const change = { changes: { from: 0, to: doc.state.doc.length, insert: text } };
    if (this.doc === doc) this.view.dispatch(change); else doc.state = doc.state.update(change).state;
  }

  focus() { this.view.focus(); }

  // ───────── editing helpers for the menus and the toolbar

  selection() { const { from, to } = this.view.state.selection.main; return { from, to, text: this.view.state.sliceDoc(from, to) }; }

  /** Each selection range turned into fn(text); the result stays selected (or the cursor goes inside an empty wrap). */
  transform(fn, { select = true } = {}) {
    const state = this.view.state;
    const tr = state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const out = fn(text, range);
      const insert = typeof out === 'string' ? out : out.text;
      const cursor = typeof out === 'object' && out.cursor !== undefined ? range.from + out.cursor : null;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: cursor !== null ? EditorSelection.cursor(cursor) : select ? EditorSelection.range(range.from, range.from + insert.length) : EditorSelection.cursor(range.from + insert.length),
      };
    });
    this.view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
    this.focus();
  }

  /** Wraps the selection (or the word at the cursor) in before/after; unwraps when already wrapped. */
  wrap(before, after = before, placeholder = '') {
    const state = this.view.state;
    const tr = state.changeByRange((range) => {
      let { from, to } = range;
      if (from === to) {
        const word = state.wordAt(from);
        if (word && placeholder === '') ({ from, to } = word);
      }
      const text = state.sliceDoc(from, to);
      const outside = state.sliceDoc(Math.max(0, from - before.length), from) === before && state.sliceDoc(to, to + after.length) === after;
      if (outside && text) {
        return { changes: [{ from: from - before.length, to: from, insert: '' }, { from: to, to: to + after.length, insert: '' }], range: EditorSelection.range(from - before.length, to - before.length) };
      }
      if (text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length && text) {
        const inner = text.slice(before.length, text.length - after.length);
        return { changes: { from, to, insert: inner }, range: EditorSelection.range(from, from + inner.length) };
      }
      const body = text || placeholder;
      return { changes: { from, to, insert: before + body + after }, range: EditorSelection.range(from + before.length, from + before.length + body.length) };
    });
    this.view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
    this.focus();
  }

  /** Whole lines of the selection turned into fn(lines text). */
  transformLines(fn) {
    const state = this.view.state;
    const tr = state.changeByRange((range) => {
      const first = state.doc.lineAt(range.from);
      const last = state.doc.lineAt(range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to);
      const text = state.sliceDoc(first.from, last.to);
      const insert = fn(text);
      return { changes: { from: first.from, to: last.to, insert }, range: EditorSelection.range(first.from, first.from + insert.length) };
    });
    this.view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
    this.focus();
  }

  /** Inserts text at the cursor (replacing the selection); `cursor` puts the caret at that offset inside it. */
  insert(text, cursor = text.length) {
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + cursor }, scrollIntoView: true, userEvent: 'input' });
    this.focus();
  }

  /** A block on lines of its own (a table, a code block): blank lines around it. */
  insertBlock(text, cursor = 0) {
    const state = this.view.state;
    const { from, to } = state.selection.main;
    const line = state.doc.lineAt(from);
    const before = from === line.from ? (line.number > 1 && state.doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n';
    const after = '\n';
    const insert = `${before}${text}${after}`;
    this.view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + before.length + cursor }, scrollIntoView: true, userEvent: 'input' });
    this.focus();
  }

  run(command) {
    const map = { undo, redo, selectAll, toggleComment, copyLineDown, indentMore, indentLess, find: openSearchPanel, gotoLine, foldAll, unfoldAll };
    if (command === 'replace') {
      openSearchPanel(this.view);
      requestAnimationFrame(() => this.view.dom.querySelector('.cm-search input[name="replace"]')?.focus());
      return true;
    }
    return map[command]?.(this.view) ?? false;
  }

  /** Puts the cursor on a line (1-based) and scrolls it to the top third of the view. */
  goToLine(line, col = 1) {
    const n = Math.max(1, Math.min(this.view.state.doc.lines, line));
    const target = this.view.state.doc.line(n);
    const pos = Math.min(target.to, target.from + Math.max(0, col - 1));
    this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) });
    this.focus();
  }

  cursorInfo() {
    const state = this.view.state;
    const main = state.selection.main;
    const line = state.doc.lineAt(main.head);
    const selected = state.selection.ranges.reduce((sum, r) => sum + (r.to - r.from), 0);
    return { line: line.number, col: main.head - line.from + 1, selected, ranges: state.selection.ranges.length, lines: state.doc.lines };
  }

  /** The first visible line (1-based) and how far into it the view is scrolled (0…1). */
  topLine() {
    const scroller = this.view.scrollDOM;
    const top = scroller.scrollTop;
    const block = this.view.lineBlockAtHeight(top);
    const line = this.view.state.doc.lineAt(block.from).number;
    return { line, fraction: block.height ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0 };
  }

  /** Scrolls so that this line (fractional) is the first visible one. */
  scrollToLine(line, fraction = 0) {
    const doc = this.view.state.doc;
    const n = Math.max(1, Math.min(doc.lines, line));
    const block = this.view.lineBlockAt(doc.line(n).from);
    this.view.scrollDOM.scrollTop = block.top + block.height * fraction;
  }

  scrollRatio() { const s = this.view.scrollDOM; const max = s.scrollHeight - s.clientHeight; return max > 0 ? s.scrollTop / max : 0; }
  setScrollRatio(ratio) { const s = this.view.scrollDOM; s.scrollTop = ratio * (s.scrollHeight - s.clientHeight); }

  destroy() { this.view.destroy(); }
}

function optionExtensions(s) {
  return [
    s.lineNumbers ? [lineNumbers(), foldGutter()] : [],
    s.highlightActiveLine ? [highlightActiveLine(), highlightActiveLineGutter()] : [],
    s.wordWrap ? EditorView.lineWrapping : [],
    s.showWhitespace ? highlightWhitespace() : [],
    s.autoCloseBrackets ? closeBrackets() : [],
    EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
    EditorState.tabSize.of(s.tabSize),
    indentUnit.of(s.insertSpaces ? ' '.repeat(s.tabSize) : '\t'),
    EditorView.theme({ '&': { fontSize: `${s.editorFontSize}px` }, '.cm-scroller': { fontFamily: `"${s.editorFont.replace(/"/g, '')}", "D2Coding", Consolas, Menlo, "Malgun Gothic", monospace` } }),
  ];
}
