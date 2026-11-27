// Focus mode (iA Writer / Typora): everything but the current line, sentence or paragraph is dimmed
// (opacity on line / mark decorations, visible lines only). Typewriter mode keeps the cursor line in
// the vertical middle while typing (and pads the content so the last lines can get there too).
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { sentenceAt } from './mdtext.js';

const dimLine = Decoration.line({ class: 'cm-mm-dim' });
const dimText = Decoration.mark({ class: 'cm-mm-dim-text' });

/** [fromLine, toLine] of the paragraph around line `n` (consecutive non-blank lines). */
function paragraphLines(doc, n) {
  if (!doc.line(n).text.trim()) return [n, n];
  let a = n;
  let b = n;
  while (a > 1 && doc.line(a - 1).text.trim()) a--;
  while (b < doc.lines && doc.line(b + 1).text.trim()) b++;
  return [a, b];
}

function build(view, mode) {
  const { state } = view;
  const { doc } = state;
  const head = state.selection.main.head;
  const line = doc.lineAt(head);
  let [a, b] = [line.number, line.number];
  let sentence = null;
  if (mode === 'paragraph' || mode === 'sentence') [a, b] = paragraphLines(doc, line.number);
  if (mode === 'sentence' && doc.line(a).text.trim()) {
    const from = doc.line(a).from;
    const text = doc.sliceString(from, doc.line(b).to);
    const [s, e] = sentenceAt(text, head - from);
    sentence = [from + s, from + e];
  }
  const out = [];
  for (const { from, to } of view.visibleRanges) {
    for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++) {
      const l = doc.line(n);
      if (n < a || n > b) { out.push(dimLine.range(l.from)); continue; }
      if (sentence) {
        const x = Math.max(l.from, Math.min(l.to, sentence[0]));
        const y = Math.max(l.from, Math.min(l.to, sentence[1]));
        if (x > l.from) out.push(dimText.range(l.from, x));
        if (l.to > y) out.push(dimText.range(y, l.to));
      }
    }
  }
  return Decoration.set(out, true);
}

/** The focus mode extension ('line' | 'sentence' | 'paragraph'; 'off' → none). */
export function focusMode(mode) {
  if (!mode || mode === 'off') return [];
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view, mode); }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view, mode);
    }
  }, { decorations: (plugin) => plugin.decorations });
}

/** Typewriter scrolling: user typing and keyboard moves centre the cursor line. */
export function typewriter(on) {
  if (!on) return [];
  return [
    EditorView.editorAttributes.of({ class: 'mm-typewriter' }),
    EditorState.transactionExtender.of((tr) => {
      if (!tr.selection && !tr.docChanged) return null;
      if (tr.isUserEvent('select.pointer') || !(tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('select') || tr.isUserEvent('move'))) return null;
      return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: 'center' }) };
    }),
  ];
}
