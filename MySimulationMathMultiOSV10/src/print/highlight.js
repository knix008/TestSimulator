// Syntax colours of M code for printing: the editor's own parser (the same
// tokens as on screen), as text runs [{ t, c }] with print classes (tk-*,
// light-paper colours in printdoc.js contentCss).
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { mLanguage } from '../lib/editor.js';

const classes = tagHighlighter([
  { tag: tags.keyword, class: 'tk-k' },
  { tag: [tags.standard(tags.variableName), tags.function(tags.variableName)], class: 'tk-f' },
  { tag: tags.string, class: 'tk-s' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'tk-c' },
  { tag: tags.number, class: 'tk-n' },
  { tag: tags.operator, class: 'tk-o' },
  { tag: tags.bracket, class: 'tk-b' },
  { tag: tags.meta, class: 'tk-m' },
  { tag: tags.atom, class: 'tk-a' },
  { tag: tags.invalid, class: 'tk-i' },
]);

export function highlightM(text) {
  const src = String(text || '');
  try {
    const tree = mLanguage.parser.parse(src);
    const runs = [];
    let pos = 0;
    highlightTree(tree, classes, (from, to, cls) => {
      if (from > pos) runs.push({ t: src.slice(pos, from) });
      runs.push({ t: src.slice(from, to), c: cls });
      pos = to;
    });
    if (pos < src.length) runs.push({ t: src.slice(pos) });
    return runs;
  } catch {
    return [{ t: src }];
  }
}
