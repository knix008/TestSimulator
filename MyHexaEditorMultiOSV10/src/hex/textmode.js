// Text mode (UltraEdit): the document as text in a real editor — line numbers, multiple cursors, column (rectangle)
// selection with Alt+drag or always (column mode), find and replace, go to line, visible control characters, line wrap.
// "Apply as bytes" writes the text back in the character set (one undo step).
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, crosshairCursor, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';

/**
 * The line ending of a text: "\r\n", "\n" or "\r" when it uses only one (the editor keeps it, so bytes round-trip),
 * "mixed" when it uses several (the editor would make them all the same), null without line breaks.
 */
export function lineEndingOf(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const cr = (text.match(/\r/g) ?? []).length - crlf;
  const kinds = [crlf && '\r\n', lf && '\n', cr && '\r'].filter(Boolean);
  return kinds.length > 1 ? 'mixed' : kinds[0] ?? null;
}

export function createTextEditor(host, { text, readonly = false, columnMode = () => false, wrap = false, onChange = null }) {
  // CodeMirror joins lines with "\n" unless told the document's own separator.
  const ending = lineEndingOf(text);
  const wrapping = new Compartment();
  const editable = new Compartment();
  const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '14px', backgroundColor: 'var(--chart, var(--surface))', color: 'var(--text)' },
    '.cm-scroller': { fontFamily: 'var(--hx-font, ui-monospace, "Cascadia Mono", Consolas, "D2Coding", monospace)', lineHeight: '1.5' },
    '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 9%, transparent)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 32%, transparent) !important' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
    '.cm-specialChar': { color: 'var(--danger)' },
  });
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: text,
      extensions: [
        ...(ending && ending !== 'mixed' ? [EditorState.lineSeparator.of(ending)] : []),
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), highlightSpecialChars(), drawSelection(), history(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection({ eventFilter: (event) => event.altKey || columnMode() }), crosshairCursor(),
        search({ top: true }), highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab, { key: 'Mod-l', run: gotoLine }]),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        editable.of(EditorState.readOnly.of(readonly)),
        EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.sliceDoc()); }),
        theme,
      ],
    }),
  });
  return {
    view,
    // sliceDoc joins the lines with the document's own separator (doc.toString() always uses a bare LF)
    text: () => view.state.sliceDoc(),
    lineEnding: ending,
    setWrap: (on) => view.dispatch({ effects: wrapping.reconfigure(on ? EditorView.lineWrapping : []) }),
    setReadonly: (on) => view.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(on)) }),
    stats: () => { const s = view.state; const r = s.selection.main; const line = s.doc.lineAt(r.head); return { line: line.number, col: r.head - line.from + 1, lines: s.doc.lines, chars: s.doc.length, cursors: s.selection.ranges.length }; },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
