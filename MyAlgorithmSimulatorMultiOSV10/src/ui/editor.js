import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutterLineClass, keymap, lineNumbers } from '@codemirror/view';

const LANGUAGES = { c: cpp, cpp, java, python, go, rust, javascript };
const setTrace = StateEffect.define();
const setTraceGutter = StateEffect.define();
class TraceGutter extends GutterMarker {
  elementClass = 'cm-trace-gutter';
}
const traceGutter = new TraceGutter();
const traceField = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setTrace)) value = effect.value;
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const traceGutterField = StateField.define({
  create: () => RangeSet.empty,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setTraceGutter)) value = effect.value;
    return value;
  },
  provide: (field) => gutterLineClass.from(field),
});

/** Source line (0-based) marked `@step`, or the closest earlier mark. −1 when the sample has none. */
export function traceSourceLine(source, step) {
  if (step == null || !Number.isFinite(step)) return -1;
  const lines = String(source).split('\n');
  let closest = -1;
  let closestStep = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const marks = [...lines[index].matchAll(/(?:#|\/\/|\/\*)\s*@(\d+)\b/g)].map((match) => Number(match[1]));
    if (marks.includes(step)) return index;
    for (const mark of marks) if (mark < step && mark > closestStep) { closestStep = mark; closest = index; }
  }
  return closest;
}

/** A code editor wired to the app theme. Returns { get(), destroy(), follow(step), relayout() }. */
export function createEditor(parent, { code, language, onChange }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(), history(), bracketMatching(), traceField, traceGutterField,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        LANGUAGES[language]?.() ?? [],
        EditorView.theme({
          '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', height: '100%' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "Cascadia Code", monospace' },
          '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
          '.cm-content': { fontSize: '13px' },
          '.cm-line.cm-trace': {
            backgroundColor: 'color-mix(in srgb, var(--accent) 34%, var(--surface))',
            boxShadow: 'inset 3px 0 0 var(--accent)',
          },
          '.cm-trace-gutter': {
            backgroundColor: 'color-mix(in srgb, var(--accent) 34%, var(--panel))',
            color: 'var(--accent)',
            fontWeight: '700',
          },
        }),
        EditorView.updateListener.of((update) => { if (update.docChanged) onChange(update.state.doc.toString()); }),
      ],
    }),
  });

  let traced = -2;
  const follow = (step) => {
    const index = traceSourceLine(view.state.doc.toString(), step);
    if (index === traced) return;
    traced = index;
    if (index < 0) {
      view.dispatch({ effects: [setTrace.of(Decoration.none), setTraceGutter.of(RangeSet.empty)] });
      return;
    }
    const line = view.state.doc.line(index + 1);
    const effects = [
      setTrace.of(Decoration.set([Decoration.line({ class: 'cm-trace' }).range(line.from)])),
      setTraceGutter.of(RangeSet.of([traceGutter.range(line.from)])),
    ];
    if (!view.hasFocus) effects.push(EditorView.scrollIntoView(line.from, { y: 'center' }));
    view.dispatch({ effects });
  };

  return {
    get: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
    follow,
    relayout: () => view.requestMeasure(),
  };
}
