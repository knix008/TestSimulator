// Folding: headings (to the next heading of the same or a higher level), list items with indented
// children, fenced code, display math, quotes / callouts and the front matter (foldranges.js finds the
// ranges on the text; the syntax tree tells code lines). Fold gutter (a setting), "…" pill, keys.
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { codeFolding, foldAll, foldCode, foldGutter, foldService, syntaxTree, toggleFold, unfoldAll, unfoldCode } from '@codemirror/language';
import { t } from '../i18n.js';
import { foldRangeAt } from './foldranges.js';

const CODE_BLOCKS = new Set(['FencedCode', 'CodeBlock', 'FrontMatter', 'BlockMath', 'HTMLBlock']);

/** A `doc` + `isCode` pair over an editor state for foldranges.js. */
function adapters(state) {
  const { doc } = state;
  const tree = syntaxTree(state);
  const docAdapter = { lines: doc.lines, text: (n) => (n >= 1 && n <= doc.lines ? doc.line(n).text : '') };
  const starts = new Set();
  const cache = new Map();
  const isCode = (n) => {
    if (cache.has(n)) return cache.get(n);
    let code = false;
    if (n >= 1 && n <= doc.lines) {
      const line = doc.line(n);
      for (let node = tree.resolveInner(Math.min(line.to, line.from + /^\s*/.exec(line.text)[0].length), 1); node; node = node.parent) {
        if (CODE_BLOCKS.has(node.name)) {
          code = true;
          if (doc.lineAt(node.from).number === n) starts.add(n);
          break;
        }
      }
    }
    cache.set(n, code);
    return code;
  };
  isCode.starts = { has: (n) => { isCode(n); return starts.has(n); } };
  return { docAdapter, isCode };
}

/** The fold range (document offsets) of the line starting at `lineStart`, or null. */
export function markdownFoldRange(state, lineStart) {
  const line = state.doc.lineAt(lineStart);
  const { docAdapter, isCode } = adapters(state);
  const range = foldRangeAt(docAdapter, line.number, isCode);
  if (!range) return null;
  const from = state.doc.line(range.fromLine).to;
  const to = state.doc.line(range.toLine).to;
  return to > from ? { from, to } : null;
}

const service = Prec.high(foldService.of((state, lineStart) => markdownFoldRange(state, lineStart)));

const folding = codeFolding({
  placeholderDOM(view, onclick) {
    const pill = document.createElement('span');
    pill.className = 'cm-mm-foldpill';
    pill.textContent = '…';
    pill.title = t('editor.fold.unfold');
    pill.setAttribute('aria-label', t('editor.fold.unfold'));
    pill.onclick = onclick;
    return pill;
  },
});

export const foldGutterExtension = () => foldGutter({
  markerDOM(open) {
    const span = document.createElement('span');
    span.className = `cm-mm-foldmarker${open ? '' : ' folded'}`;
    span.textContent = open ? '⌄' : '›';
    span.title = open ? t('editor.fold.fold') : t('editor.fold.unfold');
    return span;
  },
});

export const foldKeymap = [
  { key: 'Mod-Shift-[', run: foldCode },
  { key: 'Mod-Shift-]', run: unfoldCode },
  { key: 'Mod-Alt-[', run: foldAll },
  { key: 'Mod-Alt-]', run: unfoldAll },
];

/** Folding without the gutter (the gutter is its own compartment). */
export const foldingExtension = () => [service, folding, keymap.of(foldKeymap)];

/** Folds or unfolds at the cursor line. */
export const toggleFoldAtCursor = (view) => toggleFold(view);
export { foldAll, unfoldAll };
