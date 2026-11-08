// Spell checking in the editor: misspelled words of the visible text are underlined (wavy red).
// The checking runs in spell.worker.js; code (inline, blocks), URLs, tags and attribute values
// are skipped. The user's dictionary (domain/userdict.js) is sent to the worker as it changes.
import { Facet, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

let worker = null;
let nextId = 1;
const waiting = new Map();
let userWords = [];

function ask(message) {
  worker ??= createWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...message, id });
  });
}

function createWorker() {
  const w = new Worker(new URL('./spell.worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (event) => {
    const { id, error, ...rest } = event.data;
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    if (error) job.reject(new Error(error)); else job.resolve(rest);
  };
  w.postMessage({ type: 'user', words: userWords });
  return w;
}

/** The user's dictionary changed: the worker forgets what it decided and checks again. */
export function setUserWords(words) {
  userWords = [...words];
  worker?.postMessage({ type: 'user', words: userWords });
  for (const view of views) view.plugin(spellPlugin)?.schedule(0);
}

export const suggest = (word) => ask({ type: 'suggest', word }).then((r) => r.suggestions ?? []);

const WORD = /[\p{L}][\p{L}'’]*[\p{L}]|[\p{L}]/gu;
const SKIP = /Code|URL|Url|Link(Mark|Label)?$|Tag|Attribute|Comment|Processing|Meta|HTMLBlock|HTMLTag|Escape|Entity/;

const setMarks = StateEffect.define();
const marks = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setMarks)) value = effect.value;
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const misspelled = Decoration.mark({ class: 'cm-misspelled' });
const views = new Set();

const spellPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.timer = 0;
    this.version = 0;
    views.add(view);
    this.schedule(300);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) this.schedule(update.docChanged ? 500 : 150);
  }
  schedule(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), delay);
  }
  /** Words of the visible ranges outside code, with their positions. */
  collect() {
    const { state } = this.view;
    const tree = syntaxTree(state);
    const found = [];
    for (const { from, to } of this.view.visibleRanges) {
      const text = state.sliceDoc(from, to);
      for (const match of text.matchAll(WORD)) {
        const start = from + match.index;
        const end = start + match[0].length;
        let skip = false;
        for (let node = tree.resolveInner(start, 1); node; node = node.parent) if (SKIP.test(node.name)) { skip = true; break; }
        // Bare web addresses and e-mail addresses in plain text.
        if (!skip) {
          const line = state.doc.lineAt(start);
          const around = line.text;
          const offset = start - line.from;
          const token = /\S+/g;
          let m;
          while ((m = token.exec(around))) if (m.index <= offset && offset < m.index + m[0].length) { skip = /:\/\/|@|^www\./.test(m[0]); break; }
        }
        if (!skip) found.push({ from: start, to: end, word: match[0] });
      }
    }
    return found;
  }
  async run() {
    const version = ++this.version;
    const config = this.view.state.facet(spellConfig);
    const found = this.collect();
    const words = [...new Set(found.map((f) => f.word))];
    let wrong;
    try {
      ({ wrong } = await ask({ type: 'check', words, languages: config.languages }));
    } catch {
      return;
    }
    if (version !== this.version || !this.view.dom.isConnected) return;
    const bad = new Set(wrong);
    const builder = new RangeSetBuilder();
    for (const f of found.sort((a, b) => a.from - b.from)) if (bad.has(f.word)) builder.add(f.from, f.to, misspelled);
    this.view.dispatch({ effects: setMarks.of(builder.finish()) });
    config.onResult?.(wrong);
  }
  destroy() { clearTimeout(this.timer); views.delete(this.view); }
});

const spellConfig = Facet.define({ combine: (values) => values[values.length - 1] ?? { languages: ['en', 'ko'] } });

/** The spell checking extension (languages: which dictionaries; onResult(wrong words) for the Problems panel). */
export function spellCheck(config) {
  return [spellConfig.of(config), marks, spellPlugin];
}

/** The misspelled word under a position, or null. */
export function misspelledAt(view, pos) {
  let hit = null;
  view.state.field(marks, false)?.between(pos, pos, (from, to) => { hit = { from, to, word: view.state.sliceDoc(from, to) }; });
  return hit;
}

/** All misspelled words the view has marked (the Problems panel). */
export function misspellings(view) {
  const out = [];
  const set = view.state.field(marks, false);
  if (!set) return out;
  const iter = set.iter();
  while (iter.value) { out.push({ from: iter.from, to: iter.to, word: view.state.sliceDoc(iter.from, iter.to) }); iter.next(); }
  return out;
}
