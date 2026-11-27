// Style-check and parts-of-speech decorations from the host (the writing checker runs elsewhere):
// wavy underlines per kind with the message as a tooltip, and adverb / conjunction colouring. Lines
// are 1-based, columns UTF-16 offsets within the line. The marks follow edits until the host sends
// new ones; the classes only show while showStyleCheck / highlightSyntax are on (editor attributes).
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

export const STYLE_KINDS = ['filler', 'redundancy', 'cliche', 'hedge', 'passive', 'long-sentence', 'repeated-word', 'double-space'];
export const POS_KINDS = ['adverb', 'conjunction'];

export const setHostDecorations = StateEffect.define();

function toRanges(doc, items, classOf, title) {
  const out = [];
  for (const item of items ?? []) {
    const line = Number(item.line);
    if (!(line >= 1 && line <= doc.lines)) continue;
    const l = doc.line(line);
    const from = l.from + Math.max(0, Math.min(l.length, Number(item.col) || 0));
    const to = Math.min(l.to, from + Math.max(0, Number(item.len) || 0));
    if (to <= from) continue;
    const cls = classOf(item.kind);
    if (!cls) continue;
    out.push(Decoration.mark({ class: cls, attributes: title && item.message ? { title: String(item.message) } : undefined }).range(from, to));
  }
  return out;
}

export const hostDecorations = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setHostDecorations)) continue;
      const { styleIssues, partsOfSpeech } = effect.value ?? {};
      const doc = tr.state.doc;
      const keep = (kindPrefix) => {
        const out = [];
        next.between(0, doc.length, (from, to, deco) => { if (deco.spec.class?.startsWith(kindPrefix)) out.push(deco.range(from, to)); });
        return out;
      };
      const style = styleIssues !== undefined
        ? toRanges(doc, styleIssues, (kind) => (STYLE_KINDS.includes(kind) ? `cm-mm-style cm-mm-style-${kind}` : 'cm-mm-style cm-mm-style-filler'), true)
        : keep('cm-mm-style');
      const pos = partsOfSpeech !== undefined
        ? toRanges(doc, partsOfSpeech, (kind) => (POS_KINDS.includes(kind) ? `cm-mm-pos cm-mm-pos-${kind}` : null), false)
        : keep('cm-mm-pos');
      next = Decoration.set([...style, ...pos], true);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
