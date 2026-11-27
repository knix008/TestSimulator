// Text mode (UltraEdit): the document as text in a real editor — line numbers, multiple cursors, column (rectangle)
// selection with Alt+drag or always (column mode), find and replace, go to line, visible control characters, line wrap.
// "Apply as bytes" writes the text back in the character set (one undo step).
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, crosshairCursor, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';

export function createTextEditor(host, { text, readonly = false, columnMode = () => false, wrap = false, onChange = null }) {
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
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), highlightSpecialChars(), drawSelection(), history(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection({ eventFilter: (event) => event.altKey || columnMode() }), crosshairCursor(),
        search({ top: true }), highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab, { key: 'Mod-l', run: gotoLine }]),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        editable.of(EditorState.readOnly.of(readonly)),
        EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
        theme,
      ],
    }),
  });
  return {
    view,
    text: () => view.state.doc.toString(),
    setWrap: (on) => view.dispatch({ effects: wrapping.reconfigure(on ? EditorView.lineWrapping : []) }),
    setReadonly: (on) => view.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(on)) }),
    stats: () => { const s = view.state; const r = s.selection.main; const line = s.doc.lineAt(r.head); return { line: line.number, col: r.head - line.from + 1, lines: s.doc.lines, chars: s.doc.length, cursors: s.selection.ranges.length }; },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
