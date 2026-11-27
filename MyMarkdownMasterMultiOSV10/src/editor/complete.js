// Autocompletion (@codemirror/autocomplete) from the host's async sources (options.complete):
//   [[ / ![[  → notes (and attachments), then # → headings, #^ or ^ → blocks; | → nothing
//   #tag at a word start → tags      :sm → emoji (inserts the character)
//   / at the line start or after a space → slash commands (run(handle))
//   a key at the start of a front matter line → property keys
// Nothing completes inside code, math or comments.
import { autocompletion, pickedCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { t } from '../i18n.js';
import { hasIcon, icon } from '../icons.js';
import { contextOf } from './context.js';
import { emojiContext, filterByQuery, linkContext, propertyContext, slashContext, tagContext } from './mdtext.js';
import { CODE_NODES } from './syntax.js';

function nodeKinds(state, pos) {
  const kinds = new Set();
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) kinds.add(node.name);
  return kinds;
}

const inCode = (kinds) => [...kinds].some((name) => CODE_NODES.has(name));

function lineBefore(context) {
  const line = context.state.doc.lineAt(context.pos);
  return { line, before: line.text.slice(0, context.pos - line.from) };
}

const call = async (fn, ...args) => {
  if (typeof fn !== 'function') return [];
  try { return (await fn(...args)) ?? []; } catch (error) { console.warn('[editor] completion source', error); return []; }
};

/** Applies a link completion: replaces the query (and leftovers up to `]]`), then steps past `]]`. */
function applyInLink(text) {
  return (view, completion, from, to) => {
    const { state } = view;
    const line = state.doc.lineAt(to);
    const rest = state.sliceDoc(to, line.to);
    const close = rest.indexOf(']]');
    const between = close >= 0 ? rest.slice(0, close) : '';
    const special = between.search(/[|#^]/);
    let end = to;
    let insert = `${text}]]`;
    if (close >= 0 && special >= 0) {
      // An alias or subpath follows: replace only what is left of the query.
      end = to + special;
      insert = text;
    } else if (close >= 0 && !between.includes('[[')) {
      end = to + close + 2;
    }
    view.dispatch({
      changes: { from, to: end, insert },
      selection: { anchor: from + insert.length },
      annotations: pickedCompletion.of(completion),
      userEvent: 'input.complete',
    });
  };
}

function linkSource(context) {
  const { state } = context;
  const { line, before } = lineBefore(context);
  const lc = linkContext(before);
  if (!lc || lc.kind === 'alias') return null;
  const kinds = nodeKinds(state, context.pos);
  if (inCode(kinds)) return null;
  const ctx = contextOf(state);
  const complete = ctx.complete ?? {};
  const from = line.from + lc.start;
  const done = (options) => (context.aborted ? null : { from, options, filter: false });
  if (lc.kind === 'note') {
    return call(complete.notes, lc.query, { embed: lc.embed }).then((items) => done(items.map((item) => ({
      label: String(item.label ?? item.path ?? ''),
      detail: item.detail ?? '',
      type: 'note',
      mmIcon: /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(item.path ?? item.label ?? '') ? 'insertImage' : /\.pdf$/i.test(item.path ?? '') ? 'pdfFile' : 'markdownFile',
      apply: applyInLink(String(item.label ?? item.path ?? '')),
    }))));
  }
  if (lc.kind === 'heading') {
    return call(complete.headings, lc.target || ctx.path).then((items) => done(filterByQuery(items, lc.query, (h) => [h.text]).map((h) => ({
      label: String(h.text),
      detail: `H${h.level}`,
      type: 'heading',
      mmIcon: `heading${Math.min(5, Math.max(1, h.level | 0))}`,
      apply: applyInLink(String(h.text)),
    }))));
  }
  return call(complete.blocks, lc.target || ctx.path).then((items) => done(filterByQuery(items, lc.query, (b) => [b.id, b.text]).map((b) => ({
    label: String(b.id),
    detail: String(b.text ?? '').slice(0, 60),
    type: 'block',
    mmIcon: 'stBlocks',
    apply: applyInLink(String(b.id)),
  }))));
}

function tagSource(context) {
  const { state } = context;
  const { line, before } = lineBefore(context);
  const tc = tagContext(before);
  if (!tc) return null;
  const kinds = nodeKinds(state, context.pos);
  if (inCode(kinds) || kinds.has('FrontMatter') || kinds.has('WikiLink') || linkContext(before)) return null;
  const complete = contextOf(state).complete ?? {};
  return call(complete.tags).then((items) => (context.aborted ? null : {
    from: line.from + tc.start,
    options: items.map((item) => {
      const tag = String(item.tag ?? item).replace(/^#/, '');
      return { label: `#${tag}`, detail: item.count != null ? t('editor.complete.tagCount', { n: item.count }) : '', type: 'tag', mmIcon: 'tag' };
    }),
    validFor: /^#[\p{L}\p{N}_/-]*$/u,
  }));
}

function emojiSource(context) {
  const { state } = context;
  const { line, before } = lineBefore(context);
  const ec = emojiContext(before);
  if (!ec) return null;
  const kinds = nodeKinds(state, context.pos);
  if (inCode(kinds) || kinds.has('FrontMatter')) return null;
  const complete = contextOf(state).complete ?? {};
  return call(complete.emoji, ec.query).then((items) => (context.aborted || !items.length ? null : {
    from: line.from + ec.start,
    filter: false,
    options: items.slice(0, 60).map(([code, char]) => ({ label: `:${code}:`, type: 'emoji', mmEmoji: char, apply: char })),
  }));
}

function slashSource(context) {
  const { state } = context;
  const { line, before } = lineBefore(context);
  const sc = slashContext(before);
  if (!sc) return null;
  const kinds = nodeKinds(state, context.pos);
  if (inCode(kinds) || kinds.has('FrontMatter') || kinds.has('URL') || linkContext(before)) return null;
  const ctx = contextOf(state);
  let items;
  try { items = ctx.complete?.slashCommands?.() ?? []; } catch { items = []; }
  const found = filterByQuery(items, sc.query);
  if (!found.length) return null;
  return {
    from: line.from + sc.start,
    filter: false,
    options: found.map((item) => ({
      label: item.label,
      detail: item.detail ?? '',
      type: 'command',
      mmIcon: item.icon,
      apply: (view, completion, from, to) => {
        view.dispatch({ changes: { from, to }, selection: { anchor: from }, annotations: pickedCompletion.of(completion), userEvent: 'input.complete' });
        try { item.run?.(ctx.handle?.()); } catch (error) { console.error('[editor] slash command', error); }
      },
    })),
  };
}

function propertySource(context) {
  const { state } = context;
  const { line, before } = lineBefore(context);
  const kinds = nodeKinds(state, context.pos);
  if (!kinds.has('FrontMatter') || line.number === 1 || /^(---|\.\.\.)/.test(line.text)) return null;
  const pc = propertyContext(before);
  if (!pc || (!pc.query && !context.explicit)) return null;
  const complete = contextOf(state).complete ?? {};
  return call(complete.propertyKeys).then((keys) => (context.aborted ? null : {
    from: line.from + pc.start,
    options: keys.map((key) => ({ label: String(key), detail: t('editor.complete.property'), type: 'property', mmIcon: 'docProps', apply: `${key}: ` })),
    validFor: /^[\p{L}\p{N}_-]*$/u,
  }));
}

export function completionExtension() {
  return autocompletion({
    override: [linkSource, tagSource, emojiSource, slashSource, propertySource],
    icons: false,
    activateOnTyping: true,
    closeOnBlur: true,
    maxRenderedOptions: 80,
    tooltipClass: () => 'mm-complete',
    addToOptions: [{
      position: 20,
      render(completion) {
        if (completion.mmEmoji) {
          const span = document.createElement('span');
          span.className = 'cm-mm-cemoji';
          span.textContent = completion.mmEmoji;
          return span;
        }
        if (completion.mmIcon) {
          const span = document.createElement('span');
          span.className = 'cm-mm-cicon';
          span.innerHTML = icon(hasIcon(completion.mmIcon) ? completion.mmIcon : 'dot');
          return span;
        }
        return null;
      },
    }],
  });
}
