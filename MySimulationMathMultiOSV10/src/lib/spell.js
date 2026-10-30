// English spell check of the editor (맞춤법 toggle on the 편집기 ribbon):
// words in comments and strings are checked against the Hunspell English
// dictionary (dictionary-en, via nspell), loaded the first time it is needed.
// Code is never checked; inside comments and strings, words that look like code
// (ALLCAPS, camelCase, with digits or underscores, function names) are skipped.
// Misspelled words get a wavy underline; hovering shows suggestions and
// 사전에 추가 (the user's words, settings.editor.spellWords).
import { ViewPlugin, Decoration, hoverTooltip, EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { t } from './i18n.js';

// ── pure helpers (tested in test/spell.test.mjs) ──

/** The words of a text worth checking: [{ from, to, word }] (offsets into the text). */
export function wordsOf(text) {
  const out = [];
  const re = /[A-Za-z][A-Za-z']*[A-Za-z]|[A-Za-z]/g;
  for (let m; (m = re.exec(text));) {
    const w = m[0];
    const before = text[m.index - 1] || '', after = text[m.index + w.length] || '';
    if (/[\w./\\@#$]/.test(before) || /[\w/\\@(]/.test(after)) continue; // part of a path, call, address or identifier
    if (text.startsWith('://', m.index + w.length) || (after === ':' && /^[\\/]/.test(text[m.index + w.length + 1] || ''))) continue; // https://, C:\
    out.push({ from: m.index, to: m.index + w.length, word: w });
  }
  return out;
}

/** Words that are not prose: short, ALLCAPS, camelCase / PascalCase inside, or in `known` (lower case). */
export function looksLikeCode(word, known) {
  if (word.length < 3) return true;
  if (/^[A-Z]+$/.test(word)) return true;
  if (/[a-z][A-Z]/.test(word) || /^[A-Z]{2,}[a-z]/.test(word)) return true;
  return !!(known && known.has(word.toLowerCase()));
}

/** A checker over Hunspell aff / dic text (nspell): { correct(word), suggest(word) }. */
export function makeChecker(nspell, aff, dic) {
  const sp = nspell(aff, dic);
  const cache = new Map();
  return {
    correct(w) {
      let r = cache.get(w);
      if (r === undefined) {
        // the sentence-start capital and a possessive 's are fine
        r = sp.correct(w) || sp.correct(w.toLowerCase()) || (/'s$/i.test(w) && sp.correct(w.slice(0, -2)));
        cache.set(w, r);
      }
      return r;
    },
    suggest: (w) => sp.suggest(w).slice(0, 6),
    add(w) { sp.add(w); cache.delete(w); },
  };
}

// ── loading (browser: the dictionary is a lazy chunk) ──
let checker = null;
let loading = null;
export function loadSpeller() {
  if (!loading) {
    loading = Promise.all([
      import('nspell'),
      import('../../node_modules/dictionary-en/index.aff?raw'),
      import('../../node_modules/dictionary-en/index.dic?raw'),
    ]).then(([n, a, d]) => { checker = makeChecker(n.default || n, a.default, d.default); return checker; });
  }
  return loading;
}

// ── CodeMirror extension ──
const refresh = StateEffect.define();
const mark = Decoration.mark({ class: 'cm-spell-error' });

/**
 * opts: words() → the user's words (array), known() → Set of lower-case names that are not
 * misspellings (function names), onAdd(word) → keep a word (사전에 추가).
 */
export function spellCheck(opts = {}) {
  const userWords = () => new Set((opts.words ? opts.words() : []).map((w) => String(w).toLowerCase()));
  const isWrong = (w, known, mine) => checker && !looksLikeCode(w, known) && !mine.has(w.toLowerCase()) && !checker.correct(w);

  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = Decoration.none;
      if (checker) this.decorations = this.build(view);
      else loadSpeller().then(() => view.dispatch({ effects: refresh.of(null) })).catch((e) => console.warn('spell check: the dictionary did not load', e));
    }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))) this.decorations = this.build(u.view);
    }
    build(view) {
      if (!checker) return Decoration.none;
      const known = opts.known ? opts.known() : null;
      const mine = userWords();
      const ranges = [];
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from, to,
          enter: (node) => {
            if (!/comment|string/.test(node.name)) return;
            const text = view.state.sliceDoc(node.from, node.to);
            for (const w of wordsOf(text)) if (isWrong(w.word, known, mine)) ranges.push(mark.range(node.from + w.from, node.from + w.to));
          },
        });
      }
      return Decoration.set(ranges, true);
    }
  }, { decorations: (v) => v.decorations });

  const tip = hoverTooltip((view, pos) => {
    if (!checker) return null;
    const node = syntaxTree(view.state).resolveInner(pos, 1);
    if (!/comment|string/.test(node.name)) return null;
    const text = view.state.sliceDoc(node.from, node.to);
    const hit = wordsOf(text).find((w) => node.from + w.from <= pos && pos <= node.from + w.to);
    if (!hit || !isWrong(hit.word, opts.known ? opts.known() : null, userWords())) return null;
    const from = node.from + hit.from, to = node.from + hit.to;
    return {
      pos: from, end: to, above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-spell-tip';
        const head = document.createElement('div');
        head.className = 'cm-spell-head';
        head.textContent = t('spell_unknown', { word: hit.word });
        dom.appendChild(head);
        const list = checker.suggest(hit.word);
        const row = document.createElement('div');
        row.className = 'cm-spell-sugs';
        if (!list.length) { const n = document.createElement('span'); n.className = 'cm-spell-none'; n.textContent = t('spell_none'); row.appendChild(n); }
        for (const s of list) {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = s; b.title = t('spell_replace', { word: s });
          b.onmousedown = (e) => { e.preventDefault(); view.dispatch({ changes: { from, to, insert: s } }); };
          row.appendChild(b);
        }
        dom.appendChild(row);
        if (opts.onAdd) {
          const add = document.createElement('button');
          add.type = 'button'; add.className = 'cm-spell-add'; add.textContent = t('spell_add', { word: hit.word });
          add.onmousedown = (e) => { e.preventDefault(); opts.onAdd(hit.word); view.dispatch({ effects: refresh.of(null) }); };
          dom.appendChild(add);
        }
        return { dom };
      },
    };
  });

  return [plugin, tip, EditorView.baseTheme({
    '.cm-spell-error': { textDecoration: 'underline wavy #e5484d', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
  })];
}

/** Re-checks the words of a view (after the user's words changed elsewhere). */
export const refreshSpell = (view) => view.dispatch({ effects: refresh.of(null) });
