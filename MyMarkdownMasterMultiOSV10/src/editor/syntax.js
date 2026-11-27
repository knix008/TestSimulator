// The Markdown language of the note editor: GFM (CodeMirror's markdownLanguage) plus Obsidian syntax as
// Lezer extensions — YAML front matter, [[wiki links]] and ![[embeds]], ==highlight==, #tags, $math$ and
// $$display math$$, %%comments%% — and the highlight style (theme CSS variables, light and dark).
// Fenced code is highlighted for the languages that are installed (JS/TS, CSS, HTML), loaded lazily.
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Tag, tags } from '@lezer/highlight';

export const mdTags = {
  highlight: Tag.define(),
  hashtag: Tag.define(),
  math: Tag.define(),
  wikiLink: Tag.define(tags.link),
  frontMatter: Tag.define(tags.meta),
};

const Punctuation = /[\p{P}\p{S}]/u;

const FrontMatter = {
  defineNodes: [
    { name: 'FrontMatter', block: true, style: mdTags.frontMatter },
    { name: 'FrontMatterMark', style: tags.processingInstruction },
  ],
  parseBlock: [{
    name: 'FrontMatter',
    before: 'LinkReference',
    parse(cx, line) {
      if (cx.lineStart !== 0 || !/^---[ \t]*$/.test(line.text)) return false;
      // Only when a closing line follows (else `---` is a rule).
      const input = cx.input;
      const head = input ? input.read(0, Math.min(input.length, 200000)) : '';
      if (!/\n(---|\.\.\.)[ \t]*(\r?\n|$)/.test(head)) return false;
      const marks = [cx.elt('FrontMatterMark', 0, 3)];
      let end = line.text.length;
      while (cx.nextLine()) {
        end = cx.lineStart + line.text.length;
        if (/^(---|\.\.\.)[ \t]*$/.test(line.text)) {
          marks.push(cx.elt('FrontMatterMark', cx.lineStart, cx.lineStart + 3));
          cx.nextLine();
          break;
        }
      }
      cx.addElement(cx.elt('FrontMatter', 0, end, marks));
      return true;
    },
  }],
};

const BlockMath = {
  defineNodes: [{ name: 'BlockMath', block: true, style: mdTags.math }, { name: 'MathMark', style: tags.processingInstruction }],
  parseBlock: [{
    name: 'BlockMath',
    before: 'FencedCode',
    parse(cx, line) {
      if (cx.parentType().name !== 'Document') return false;
      const text = line.text.slice(line.pos);
      if (!text.startsWith('$$')) return false;
      const from = cx.lineStart + line.pos;
      const marks = [cx.elt('MathMark', from, from + 2)];
      const rest = text.slice(2).trimEnd();
      if (rest.endsWith('$$') && rest.length >= 2) {
        const end = from + 2 + rest.length;
        marks.push(cx.elt('MathMark', end - 2, end));
        cx.nextLine();
        cx.addElement(cx.elt('BlockMath', from, end, marks));
        return true;
      }
      let end = cx.lineStart + line.text.length;
      while (cx.nextLine()) {
        end = cx.lineStart + line.text.length;
        const t = line.text.trimEnd();
        if (t.endsWith('$$')) {
          marks.push(cx.elt('MathMark', cx.lineStart + t.length - 2, cx.lineStart + t.length));
          cx.nextLine();
          break;
        }
      }
      cx.addElement(cx.elt('BlockMath', from, end, marks));
      return true;
    },
  }],
};

const WikiLinks = {
  defineNodes: [
    { name: 'WikiLink', style: { 'WikiLink/...': mdTags.wikiLink } },
    { name: 'Embed', style: { 'Embed/...': mdTags.wikiLink } },
    { name: 'WikiMark', style: tags.processingInstruction },
    { name: 'WikiTarget' },
    { name: 'WikiAlias' },
  ],
  parseInline: [{
    name: 'WikiLink',
    before: 'Link',
    parse(cx, next, pos) {
      let embed = false;
      if (next === 33 /* ! */) {
        if (cx.char(pos + 1) !== 91 || cx.char(pos + 2) !== 91) return -1;
        embed = true;
      } else if (next !== 91 || cx.char(pos + 1) !== 91) return -1;
      const open = pos + (embed ? 3 : 2);
      const rest = cx.slice(open, Math.min(cx.end, open + 1000));
      const close = rest.indexOf(']]');
      if (close <= 0) return -1;
      const inner = rest.slice(0, close);
      if (inner.includes('\n') || inner.includes('[[')) return -1;
      const end = open + close + 2;
      const children = [cx.elt('WikiMark', pos, open)];
      const bar = inner.indexOf('|');
      const targetEnd = bar >= 0 ? open + bar : open + close;
      if (targetEnd > open) children.push(cx.elt('WikiTarget', open, targetEnd));
      if (bar >= 0) {
        children.push(cx.elt('WikiMark', targetEnd, targetEnd + 1));
        if (open + close > targetEnd + 1) children.push(cx.elt('WikiAlias', targetEnd + 1, open + close));
      }
      children.push(cx.elt('WikiMark', open + close, end));
      return cx.addElement(cx.elt(embed ? 'Embed' : 'WikiLink', pos, end, children));
    },
  }],
};

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };
const Highlight = {
  defineNodes: [{ name: 'Highlight', style: { 'Highlight/...': mdTags.highlight } }, { name: 'HighlightMark', style: tags.processingInstruction }],
  parseInline: [{
    name: 'Highlight',
    after: 'Emphasis',
    parse(cx, next, pos) {
      if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
      const before = cx.slice(pos - 1, pos);
      const after = cx.slice(pos + 2, pos + 3);
      const sBefore = /\s|^$/.test(before);
      const sAfter = /\s|^$/.test(after);
      const pBefore = Punctuation.test(before);
      const pAfter = Punctuation.test(after);
      return cx.addDelimiter(HighlightDelim, pos, pos + 2, !sAfter && (!pAfter || sBefore || pBefore), !sBefore && (!pBefore || sAfter || pAfter));
    },
  }],
};

const Hashtags = {
  defineNodes: [{ name: 'Hashtag', style: mdTags.hashtag }, { name: 'HashtagMark', style: mdTags.hashtag }],
  parseInline: [{
    name: 'Hashtag',
    parse(cx, next, pos) {
      if (next !== 35 /* # */) return -1;
      const prev = pos > cx.offset ? cx.slice(pos - 1, pos) : '';
      if (prev && !/[\s([{,;'"“‘]/.test(prev)) return -1;
      const m = /^#([\p{L}\p{N}_/-]+)/u.exec(cx.slice(pos, Math.min(cx.end, pos + 200)));
      if (!m || /^[\d/-]+$/.test(m[1])) return -1;
      return cx.addElement(cx.elt('Hashtag', pos, pos + m[0].length, [cx.elt('HashtagMark', pos, pos + 1)]));
    },
  }],
};

const InlineMath = {
  defineNodes: [{ name: 'InlineMath', style: mdTags.math }],
  parseInline: [{
    name: 'InlineMath',
    before: 'Escape',
    parse(cx, next, pos) {
      if (next !== 36 /* $ */) return -1;
      if (cx.char(pos - 1) === 92 /* \ */) return -1;
      const double = cx.char(pos + 1) === 36;
      const ml = double ? 2 : 1;
      const first = cx.char(pos + ml);
      if (!double && (first === 32 || first === 9 || first === 10 || first < 0 || first === 36)) return -1;
      const rest = cx.slice(pos + ml, Math.min(cx.end, pos + 2000));
      let close = -1;
      if (double) close = rest.indexOf('$$');
      else {
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '\n' && rest[i + 1] === '\n') break;
          if (rest[i] === '$' && rest[i - 1] !== ' ' && rest[i - 1] !== '\\' && !/\d/.test(rest[i + 1] ?? '')) { close = i; break; }
        }
      }
      if (close <= 0) return -1;
      const end = pos + ml + close + ml;
      return cx.addElement(cx.elt('InlineMath', pos, end, [cx.elt('MathMark', pos, pos + ml), cx.elt('MathMark', end - ml, end)]));
    },
  }],
};

const Comments = {
  defineNodes: [{ name: 'PercentComment', style: tags.comment }, { name: 'PercentCommentMark', style: tags.comment }],
  parseInline: [{
    name: 'PercentComment',
    before: 'Escape',
    parse(cx, next, pos) {
      if (next !== 37 || cx.char(pos + 1) !== 37) return -1;
      const rest = cx.slice(pos + 2, cx.end);
      const close = rest.indexOf('%%');
      if (close < 0) return -1;
      const end = pos + 2 + close + 2;
      return cx.addElement(cx.elt('PercentComment', pos, end, [cx.elt('PercentCommentMark', pos, pos + 2), cx.elt('PercentCommentMark', end - 2, end)]));
    },
  }],
};

export const OBSIDIAN_SYNTAX = [FrontMatter, BlockMath, WikiLinks, Highlight, Hashtags, InlineMath, Comments];

// Fenced code languages: only what is installed (no @codemirror/language-data), loaded on first use.
const CODE_LANGUAGES = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'javascript', 'mjs', 'cjs', 'node'], load: () => import('@codemirror/lang-javascript').then((m) => m.javascript()) }),
  LanguageDescription.of({ name: 'JSX', alias: ['jsx'], load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })) }),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'typescript'], load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })) }),
  LanguageDescription.of({ name: 'TSX', alias: ['tsx'], load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true, typescript: true })) }),
  LanguageDescription.of({ name: 'JSON', alias: ['json', 'json5', 'jsonc'], load: () => import('@codemirror/lang-javascript').then((m) => m.javascript()) }),
  LanguageDescription.of({ name: 'CSS', alias: ['css', 'scss', 'less'], load: () => import('@codemirror/lang-css').then((m) => m.css()) }),
  LanguageDescription.of({ name: 'HTML', alias: ['html', 'htm', 'xml', 'svg', 'vue'], load: () => import('@codemirror/lang-html').then((m) => m.html()) }),
];

/** The Markdown language support with the Obsidian extensions. */
export function markdownSupport() {
  return markdown({ base: markdownLanguage, extensions: OBSIDIAN_SYNTAX, codeLanguages: CODE_LANGUAGES, addKeymap: false, completeHTMLTags: false });
}

/** Syntax colours (both modes): theme tones, readable on light and dark themes. */
export const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--mm-h1, var(--text))', fontWeight: '700' },
  { tag: tags.heading2, color: 'var(--mm-h2, var(--text))', fontWeight: '700' },
  { tag: tags.heading3, color: 'var(--mm-h3, var(--text))', fontWeight: '700' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: 'var(--mm-h4, var(--text))', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, mdTags.wikiLink], color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--tone-sky)' },
  { tag: tags.monospace, color: 'var(--tone-pink)', fontFamily: 'var(--mm-mono)' },
  { tag: tags.quote, color: 'var(--mm-quote-text, var(--text))' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--muted)' },
  { tag: [tags.meta, mdTags.frontMatter], color: 'var(--tone-purple)' },
  { tag: tags.comment, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: mdTags.highlight, backgroundColor: 'var(--mm-mark-bg)' },
  { tag: mdTags.hashtag, color: 'var(--accent)' },
  { tag: mdTags.math, color: 'var(--tone-teal)', fontFamily: 'var(--mm-mono)' },
  { tag: tags.labelName, color: 'var(--tone-cyan)' },
  { tag: tags.character, color: 'var(--tone-amber)' },
  // Code inside fences.
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: 'var(--tone-purple)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--tone-green)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--tone-orange)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--tone-blue)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--tone-amber)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--tone-cyan)' },
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--tone-red)' },
  { tag: tags.lineComment, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--danger)' },
]);

export const syntaxColours = syntaxHighlighting(markdownHighlight);

/** Node names whose text is code (no completion, no smart punctuation, no tags). */
export const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'CodeInfo', 'CodeMark', 'InlineMath', 'BlockMath', 'HTMLBlock', 'Comment', 'PercentComment', 'URL', 'Autolink']);
