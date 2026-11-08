// Bookmarks (Notepad++): a mark in the gutter on chosen lines; next / previous / clear, and the
// list for the side panel. They follow the text as it is edited and belong to each document's state.
import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';

const toggle = StateEffect.define();
const clear = StateEffect.define();

class BookmarkMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-bookmark';
    el.title = 'bookmark';
    return el;
  }
}
const marker = new BookmarkMarker();

const field = StateField.define({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(clear)) set = RangeSet.empty;
      if (effect.is(toggle)) {
        const pos = effect.value;
        let has = false;
        set.between(pos, pos, () => { has = true; });
        set = has ? set.update({ filter: (from) => from !== pos }) : set.update({ add: [marker.range(pos)], sort: true });
      }
    }
    return set;
  },
});

export const bookmarks = () => [
  field,
  gutter({
    class: 'cm-bookmark-gutter',
    markers: (view) => view.state.field(field),
    initialSpacer: () => marker,
    domEventHandlers: {
      mousedown(view, line) { view.dispatch({ effects: toggle.of(line.from) }); return true; },
    },
  }),
  EditorView.baseTheme({ '.cm-bookmark-gutter .cm-gutterElement': { width: '14px', cursor: 'pointer' } }),
];

const lineStart = (view, pos) => view.state.doc.lineAt(pos).from;

export function toggleBookmark(view) {
  const effects = [...new Set(view.state.selection.ranges.map((r) => lineStart(view, r.head)))].map((pos) => toggle.of(pos));
  view.dispatch({ effects });
}

export const clearBookmarks = (view) => view.dispatch({ effects: clear.of(null) });

/** Line numbers (1-based) of the bookmarks of a state. */
export function bookmarkLines(state) {
  const out = [];
  const set = state.field(field, false);
  if (!set) return out;
  const iter = set.iter();
  while (iter.value) { out.push(state.doc.lineAt(iter.from).number); iter.next(); }
  return out;
}

/** Moves the cursor to the next (direction 1) or previous (-1) bookmark, wrapping around. */
export function gotoBookmark(view, direction) {
  const lines = bookmarkLines(view.state);
  if (!lines.length) return false;
  const current = view.state.doc.lineAt(view.state.selection.main.head).number;
  const target = direction > 0 ? (lines.find((n) => n > current) ?? lines[0]) : ([...lines].reverse().find((n) => n < current) ?? lines[lines.length - 1]);
  const pos = view.state.doc.line(target).from;
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  return true;
}
