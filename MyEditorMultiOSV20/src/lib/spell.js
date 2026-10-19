// Spell checking with the bundled English (en_US Hunspell) dictionary —
// assets/dict/, checked through nspell, loaded on first use.
//
// Misspelled words get a wavy underline (class cm-spell-error). In plain
// text and Markdown every word is checked; in code only comments and
// strings are (setting spellCodeAll: every word). Words with digits, underscores, dots, "@" or "/" (URLs,
// identifiers, file names), camelCase and short all-caps words are skipped.
// The user's own words (right-click › 사전에 추가) persist in the session.
import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { syntaxTree, language } from '@codemirror/language';

let dict = null;
let loading = null;
const userWords = new Set();
const ignored = new Set();          // this run only
const cache = new Map();            // word → correct?
let codeAll = false;                // check every word in code (not only comments / strings)

export function setSpellOptions({ codeAll: v }) { if (v !== undefined) codeAll = !!v; }

export function ensureDictionary() {
  if (dict) return Promise.resolve(dict);
  if (!loading) {
    loading = Promise.all([import('nspell'), import('../../assets/dict/en.aff?raw'), import('../../assets/dict/en.dic?raw')])
      .then(([ns, aff, dic]) => {
        const make = ns.default || ns;
        dict = make({ aff: aff.default, dic: dic.default });
        for (const w of userWords) dict.add(w);
        cache.clear();
        return dict;
      })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const isReady = () => !!dict;

export function setUserWords(list) {
  userWords.clear();
  for (const w of list || []) userWords.add(w);
  if (dict) for (const w of userWords) dict.add(w);
  cache.clear();
}
export function addUserWord(word) {
  userWords.add(word);
  if (dict) dict.add(word);
  cache.clear();
  return [...userWords];
}
export function ignoreWord(word) { ignored.add(word.toLowerCase()); cache.clear(); }

export function isCorrect(word) {
  if (!dict) return true;
  if (ignored.has(word.toLowerCase())) return true;
  let v = cache.get(word);
  if (v === undefined) { v = dict.correct(word); cache.set(word, v); }
  return v;
}

export function suggest(word) {
  if (!dict) return [];
  try { return dict.suggest(word).slice(0, 6); } catch { return []; }
}

// Tokens: runs of word-ish characters; only pure letter runs (optionally
// with an inner apostrophe) are checked.
const TOKEN_RE = /[A-Za-z0-9_'’./@:\\-]+/g;
const WORD_RE = /^[A-Za-z]+(?:['’][A-Za-z]+)?$/;

function skip(word) {
  if (word.length < 2) return true;
  if (/^[A-Z]+$/.test(word) && word.length <= 6) return true;   // acronyms
  if (/[a-z][A-Z]/.test(word)) return true;                     // camelCase
  return false;
}

export const spellRefresh = StateEffect.define();

// Ranges of `state` in [from, to] where words are checked.
function checkableRanges(state, from, to) {
  const lang = state.facet(language);
  if (!lang || lang.name === 'markdown' || codeAll) return [{ from, to }];
  const out = [];
  syntaxTree(state).iterate({
    from, to,
    enter: (n) => {
      if (/comment|string|text/i.test(n.name) && !/template/i.test(n.name)) {
        out.push({ from: Math.max(from, n.from), to: Math.min(to, n.to) });
        return false;
      }
      return undefined;
    },
  });
  return out;
}

const mark = Decoration.mark({ class: 'cm-spell-error' });

function build(view) {
  if (!dict) return Decoration.none;
  const { state } = view;
  const decos = [];
  for (const vr of view.visibleRanges) {
    for (const r of checkableRanges(state, vr.from, vr.to)) {
      const text = state.doc.sliceString(r.from, r.to);
      TOKEN_RE.lastIndex = 0;
      let m;
      while ((m = TOKEN_RE.exec(text))) {
        const tok = m[0];
        if (!WORD_RE.test(tok) || skip(tok)) continue;
        // Markdown / plain text: skip inline code spans (`…`).
        const before = text[m.index - 1];
        if (before === '`' || text[m.index + tok.length] === '`') continue;
        if (!isCorrect(tok)) decos.push(mark.range(r.from + m.index, r.from + m.index + tok.length));
      }
    }
  }
  return Decoration.set(decos, true);
}

const plugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.alive = true;
    this.decorations = build(view);
    if (!dict) ensureDictionary().then(() => { if (this.alive) view.dispatch({ effects: spellRefresh.of(null) }); }).catch(() => {});
  }
  destroy() { this.alive = false; }
  update(u) {
    if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(spellRefresh))) || syntaxTree(u.state) !== syntaxTree(u.startState)) {
      this.decorations = build(u.view);
    }
  }
}, { decorations: (v) => v.decorations });

export const spellChecker = [
  plugin,
  EditorView.baseTheme({
    '.cm-spell-error': { textDecoration: 'underline wavy var(--danger)', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
  }),
];

// The misspelled word under `pos`, or null.
export function wordAt(view, pos) {
  const p = view.plugin(plugin);
  if (!p) return null;
  let hit = null;
  p.decorations.between(pos, pos, (from, to) => { hit = { from, to, word: view.state.doc.sliceString(from, to) }; return false; });
  return hit;
}

// Re-checks every open view after the dictionary or the word lists changed.
export function refreshAll(views) {
  for (const v of views) { try { if (v) v.dispatch({ effects: spellRefresh.of(null) }); } catch { /* destroyed */ } }
}
