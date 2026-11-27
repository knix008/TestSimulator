// The note editor's look: one EditorView.theme for every instance. Colours come only from the app's
// theme variables (--text --muted --accent --border --surface --surface2 --hover --soft-accent
// --tone-* …), so light, dark and custom themes all work. Per-editor values (font, size, line height,
// readable width) are CSS variables set on the host (.mm-editor) by editor.js.
import { EditorView } from '@codemirror/view';

const CALLOUT_TONES = {
  note: 'var(--tone-blue)', info: 'var(--tone-sky)', tip: 'var(--tone-teal)', success: 'var(--tone-green)', question: 'var(--tone-amber)',
  warning: 'var(--tone-orange)', failure: 'var(--tone-red)', danger: 'var(--tone-red)', bug: 'var(--tone-red)', example: 'var(--tone-purple)',
  quote: 'var(--tone-slate)', abstract: 'var(--tone-cyan)', todo: 'var(--tone-blue)',
};

const STYLE_TONES = {
  filler: 'var(--tone-amber)', redundancy: 'var(--tone-orange)', cliche: 'var(--tone-purple)', hedge: 'var(--tone-yellow)',
  passive: 'var(--tone-sky)', 'long-sentence': 'var(--tone-red)', 'repeated-word': 'var(--tone-pink)', 'double-space': 'var(--tone-slate)',
};

const calloutRules = Object.fromEntries(Object.entries(CALLOUT_TONES).map(([type, tone]) => [`.cm-line[data-callout="${type}"]`, { '--mm-callout': tone }]));
const styleRules = Object.fromEntries(Object.entries(STYLE_TONES).map(([kind, tone]) => [`&.mm-style-on .cm-mm-style-${kind}`, {
  textDecoration: `underline wavy ${tone}`, textDecorationThickness: '1.5px', textUnderlineOffset: '3px', textDecorationSkipInk: 'none',
}]));

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'transparent',
    fontSize: 'var(--mm-size, 15px)',
    '--mm-mono': 'ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, "D2Coding", "Malgun Gothic", monospace',
    '--mm-mark-bg': 'color-mix(in srgb, #facc15 42%, transparent)',
    '--mm-code-bg': 'color-mix(in srgb, var(--text) 6%, transparent)',
    '--mm-block-bg': 'color-mix(in srgb, var(--text) 4.5%, transparent)',
    '--mm-callout': 'var(--tone-blue)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mm-font, inherit)', lineHeight: 'var(--mm-line-height, 1.65)', overflowX: 'auto' },
  '.cm-content': { padding: '18px 0 40px', caretColor: 'var(--accent)', userSelect: 'text', WebkitUserSelect: 'text' },
  '.cm-line': { padding: '0 28px' },
  '.cm-line.cm-mm-codeblock, .cm-line.cm-mm-table, .cm-line.cm-mm-frontmatter, .cm-line.cm-mm-mathblock, .cm-mm-code, .cm-mm-math': { fontVariantLigatures: 'none' },
  '&.mm-readable .cm-content': { paddingInline: 'max(0px, calc((100% - var(--mm-max-width, 760px) - 56px) / 2))' },
  '&.mm-typewriter .cm-content': { paddingTop: '40vh', paddingBottom: '45vh' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent) !important',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
  '.cm-placeholder': { color: 'var(--muted)', fontStyle: 'italic' },

  // Gutters
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '0.8em' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 12px', opacity: '0.7' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', cursor: 'pointer' },
  '.cm-mm-foldmarker': { display: 'inline-block', width: '14px', textAlign: 'center', color: 'var(--muted)', opacity: '0', transition: 'opacity .12s' },
  '.cm-mm-foldmarker.folded': { opacity: '1', color: 'var(--accent)' },
  '.cm-gutters:hover .cm-mm-foldmarker': { opacity: '0.85' },
  '.cm-mm-foldpill, .cm-foldPlaceholder': {
    display: 'inline-block', margin: '0 4px', padding: '0 8px', borderRadius: '10px', border: '1px solid var(--border)',
    backgroundColor: 'var(--surface2)', color: 'var(--muted)', fontSize: '0.8em', lineHeight: '1.5', cursor: 'pointer', verticalAlign: 'middle',
  },
  '.cm-mm-foldpill:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' },

  // Headings (live mode sizes)
  '.cm-line.cm-mm-h1': { fontSize: '1.6em', lineHeight: '1.35', fontWeight: '700', paddingTop: '0.5em' },
  '.cm-line.cm-mm-h2': { fontSize: '1.4em', lineHeight: '1.35', fontWeight: '700', paddingTop: '0.4em' },
  '.cm-line.cm-mm-h3': { fontSize: '1.25em', lineHeight: '1.4', fontWeight: '700', paddingTop: '0.3em' },
  '.cm-line.cm-mm-h4': { fontSize: '1.12em', fontWeight: '700', paddingTop: '0.2em' },
  '.cm-line.cm-mm-h5': { fontSize: '1.05em', fontWeight: '700' },
  '.cm-line.cm-mm-h6': { fontSize: '1em', fontWeight: '700', color: 'var(--muted)' },

  // Inline marks
  '.cm-mm-highlight': { backgroundColor: 'var(--mm-mark-bg)', borderRadius: '3px', padding: '1px 0' },
  '.cm-mm-code': { fontFamily: 'var(--mm-mono)', fontSize: '0.9em', backgroundColor: 'var(--mm-code-bg)', borderRadius: '4px', padding: '1px 4px', color: 'var(--tone-pink)' },
  '.cm-mm-math': { fontFamily: 'var(--mm-mono)', fontSize: '0.92em', color: 'var(--tone-teal)', backgroundColor: 'color-mix(in srgb, var(--tone-teal) 9%, transparent)', borderRadius: '4px', padding: '1px 3px' },
  '.cm-mm-comment': { color: 'var(--muted)', opacity: '0.75' },
  '.cm-mm-link': { color: 'var(--accent)', textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--accent) 45%, transparent)', textUnderlineOffset: '3px', cursor: 'pointer' },
  '.cm-mm-link:hover': { textDecorationColor: 'var(--accent)' },
  '.cm-mm-link.unresolved': { color: 'color-mix(in srgb, var(--accent) 60%, var(--muted))', textDecorationStyle: 'dashed', opacity: '0.85' },
  '.cm-mm-link.external::after': { content: '"↗"', fontSize: '0.75em', marginLeft: '2px', color: 'var(--muted)' },
  '.cm-mm-link.embed': { fontStyle: 'italic' },
  '.cm-mm-tag': {
    color: 'var(--accent)', backgroundColor: 'var(--soft-accent)', borderRadius: '10px', padding: '1px 7px', fontSize: '0.9em', cursor: 'pointer',
  },
  '.cm-mm-tag:hover': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)' },
  '.cm-mm-bullet': { display: 'inline-block', color: 'var(--tone-orange)', width: '1ch', textAlign: 'center', fontWeight: '700' },
  '.cm-mm-checkbox': {
    width: '1.05em', height: '1.05em', margin: '0 0.35em 0 0', verticalAlign: '-0.15em', accentColor: 'var(--accent)', cursor: 'pointer',
  },
  '.cm-line.cm-mm-task-done': { color: 'var(--muted)' },
  '.cm-line.cm-mm-task-done .cm-mm-task-text': { textDecoration: 'line-through' },

  // Quotes and callouts
  '.cm-line.cm-mm-quote': { borderLeft: '3px solid color-mix(in srgb, var(--accent) 55%, var(--border))', paddingLeft: '14px', color: 'color-mix(in srgb, var(--text) 82%, var(--muted))' },
  ...calloutRules,
  '.cm-line.cm-mm-callout': { borderLeft: '3px solid var(--mm-callout)', backgroundColor: 'color-mix(in srgb, var(--mm-callout) 8%, transparent)', paddingLeft: '14px', color: 'var(--text)' },
  '.cm-line.cm-mm-callout-title': { color: 'var(--mm-callout)', fontWeight: '650', paddingTop: '4px' },
  '.cm-line.cm-mm-callout-last': { paddingBottom: '4px' },
  '.cm-mm-callout-icon': { display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px', verticalAlign: '-0.15em', color: 'var(--mm-callout)' },
  '.cm-mm-callout-icon svg.icon': { width: '1.05em', height: '1.05em', color: 'var(--mm-callout) !important' },

  // Rules, images
  '.cm-mm-hr': { display: 'inline-block', width: '100%', height: '0', borderTop: '2px solid var(--border)', verticalAlign: 'middle' },
  '.cm-mm-image': { display: 'block', padding: '6px 0 4px', lineHeight: '0' },
  '.cm-mm-image img': { maxWidth: '100%', borderRadius: '6px', boxShadow: 'var(--elev-1, none)' },
  '.cm-mm-image[data-align=center]': { textAlign: 'center' },
  '.cm-mm-image[data-align=right]': { textAlign: 'right' },
  '.cm-mm-img-frame': { position: 'relative', display: 'inline-block', maxWidth: '100%', verticalAlign: 'top', lineHeight: '0' },
  '.cm-mm-img-frame img': { display: 'block', cursor: 'grab', userSelect: 'none' },
  '.cm-mm-image.moving img': { opacity: '0.45', cursor: 'grabbing' },
  '&.mm-image-moving, &.mm-image-moving *': { cursor: 'grabbing !important' },
  '.cm-mm-image.resizing img': { outline: '2px solid var(--accent)', outlineOffset: '1px' },
  '.cm-mm-img-tools': {
    position: 'absolute', top: '6px', right: '6px', display: 'flex', alignItems: 'center', gap: '2px', padding: '3px',
    lineHeight: '1', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface, var(--bg))',
    boxShadow: 'var(--elev-2, 0 2px 8px rgba(0,0,0,.18))', opacity: '0', pointerEvents: 'none', transition: 'opacity .12s', zIndex: '3', whiteSpace: 'nowrap',
  },
  '.cm-mm-img-frame:hover .cm-mm-img-tools, .cm-mm-img-tools:focus-within': { opacity: '1', pointerEvents: 'auto' },
  '.cm-mm-image.moving .cm-mm-img-tools, .cm-mm-image.resizing .cm-mm-img-tools': { opacity: '0', pointerEvents: 'none' },
  '.cm-mm-img-btn': {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '22px', padding: '0 4px', margin: '0',
    border: '0', borderRadius: '5px', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
  },
  '.cm-mm-img-btn:hover': { background: 'var(--hover, rgba(127,127,127,.15))' },
  '.cm-mm-img-btn svg.icon': { width: '15px', height: '15px' },
  '.cm-mm-image[data-align=left] .cm-mm-img-btn.align-left, .cm-mm-image[data-align=center] .cm-mm-img-btn.align-center, .cm-mm-image[data-align=right] .cm-mm-img-btn.align-right': {
    background: 'var(--soft-accent, color-mix(in srgb, var(--accent) 18%, transparent))', color: 'var(--accent)',
  },
  '.cm-mm-img-sep': { width: '1px', alignSelf: 'stretch', margin: '2px 3px', background: 'var(--border)' },
  '.cm-mm-img-resize': {
    position: 'absolute', right: '-4px', bottom: '-4px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface, var(--bg))', color: 'var(--accent)', cursor: 'nwse-resize',
    opacity: '0', transition: 'opacity .12s', zIndex: '3', touchAction: 'none',
  },
  '.cm-mm-image[data-align=right] .cm-mm-img-resize': { right: 'auto', left: '-4px', cursor: 'nesw-resize', transform: 'scaleX(-1)' },
  '.cm-mm-img-resize svg.icon': { width: '12px', height: '12px' },
  '.cm-mm-img-frame:hover .cm-mm-img-resize, .cm-mm-image.resizing .cm-mm-img-resize': { opacity: '1' },
  '.cm-mm-img-badge': { position: 'absolute', left: '6px', bottom: '6px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '11px', lineHeight: '1.3', pointerEvents: 'none' },
  '.cm-mm-img-badge:empty': { display: 'none' },
  '.cm-mm-img-dropcaret': { position: 'absolute', width: '2px', marginLeft: '-1px', background: 'var(--accent)', pointerEvents: 'none', zIndex: '5', borderRadius: '1px' },
  '.cm-mm-image.missing': { lineHeight: '1.4', color: 'var(--muted)', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: '6px' },
  '.cm-mm-image.missing svg.icon': { width: '16px', height: '16px' },

  // Blocks: fenced code, display math, front matter, tables
  '.cm-line.cm-mm-codeblock': { fontFamily: 'var(--mm-mono)', fontSize: '0.9em', backgroundColor: 'var(--mm-block-bg)', lineHeight: '1.55' },
  '&:not(.mm-code-wrap) .cm-line.cm-mm-codeblock': { whiteSpace: 'pre', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' },
  '.cm-line.cm-mm-codeblock-begin': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px', paddingTop: '4px' },
  '.cm-line.cm-mm-codeblock-end': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', paddingBottom: '4px' },
  '.cm-mm-codelabel': { float: 'right', fontFamily: 'var(--font-family, inherit)', fontSize: '0.78em', color: 'var(--muted)', padding: '0 6px', userSelect: 'none', textTransform: 'lowercase' },
  '.cm-line.cm-mm-mathblock': { fontFamily: 'var(--mm-mono)', fontSize: '0.92em', color: 'var(--tone-teal)', backgroundColor: 'color-mix(in srgb, var(--tone-teal) 6%, transparent)' },
  '.cm-line.cm-mm-frontmatter': { fontFamily: 'var(--mm-mono)', fontSize: '0.85em', color: 'var(--muted)', backgroundColor: 'var(--mm-block-bg)', lineHeight: '1.5' },
  '.cm-line.cm-mm-frontmatter-begin': { paddingTop: '3px' },
  '.cm-line.cm-mm-frontmatter-end': { paddingBottom: '3px' },
  '.cm-line.cm-mm-fm-collapsed': { display: 'none' },
  '.cm-line.cm-mm-props-line': { paddingBottom: '4px' },
  '.cm-mm-props-chip': { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '1px 10px', border: '1px solid var(--border)', borderRadius: '999px', fontSize: '0.8em', color: 'var(--muted)', backgroundColor: 'var(--mm-block-bg)', cursor: 'pointer', userSelect: 'none' },
  '.cm-mm-props-chip:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' },
  '.cm-mm-props-chip .icon': { width: '13px', height: '13px' },
  '.cm-mm-fmkey': { color: 'var(--tone-purple)' },
  '.cm-line.cm-mm-table': { fontFamily: 'var(--mm-mono)', fontSize: '0.92em', whiteSpace: 'pre' },
  '.cm-mm-table-pipe': { color: 'var(--muted)', opacity: '0.7' },
  '.cm-line.cm-mm-table-sep': { color: 'var(--muted)', opacity: '0.6' },

  // Focus mode
  '.cm-line.cm-mm-dim, .cm-mm-dim-text': { opacity: '0.28', transition: 'opacity .15s' },

  // Style check and parts of speech
  ...styleRules,
  '&.mm-pos-on .cm-mm-pos-adverb': { color: 'var(--tone-purple)' },
  '&.mm-pos-on .cm-mm-pos-conjunction': { color: 'var(--tone-teal)' },

  // Autocomplete
  '.cm-tooltip': { border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)', borderRadius: '8px', boxShadow: 'var(--elev-2, 0 8px 24px rgba(0,0,0,.18))' },
  '.cm-tooltip.cm-tooltip-autocomplete': { padding: '4px', fontSize: '12.5px', fontFamily: 'var(--font-family, inherit)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { maxHeight: '18em', minWidth: '220px', maxWidth: '440px', fontFamily: 'inherit' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 8px', borderRadius: '5px', lineHeight: '1.45', display: 'flex', alignItems: 'center', gap: '6px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-text, #fff)' },
  '.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail, .cm-tooltip-autocomplete ul li[aria-selected] .cm-completionMatchedText': { color: 'inherit' },
  '.cm-completionLabel': { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.cm-completionDetail': { marginLeft: 'auto', paddingLeft: '12px', color: 'var(--muted)', fontStyle: 'normal', fontSize: '0.92em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700', color: 'var(--accent)' },
  '.cm-mm-cicon': { display: 'inline-flex', width: '16px', justifyContent: 'center', flex: 'none' },
  '.cm-mm-cicon svg.icon': { width: '15px', height: '15px' },
  '.cm-mm-cemoji': { fontSize: '1.15em', width: '1.4em', textAlign: 'center', flex: 'none' },

  // Search panel
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-family, inherit)', fontSize: '12.5px' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-search': { padding: '6px 10px 6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px' },
  '.cm-search br': { flexBasis: '100%', height: '0', content: '""' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', userSelect: 'none' },
  '.cm-search input[type=checkbox]': { accentColor: 'var(--accent)', margin: '0' },
  '.cm-textfield': {
    backgroundColor: 'var(--bg, var(--surface2))', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 8px',
    fontSize: '12.5px', minWidth: '200px', outline: 'none', margin: '0',
  },
  '.cm-textfield:focus': { borderColor: 'var(--accent)', boxShadow: 'var(--ring, none)' },
  '.cm-button': {
    backgroundImage: 'none', backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px',
    padding: '3px 10px', fontSize: '12px', margin: '0', cursor: 'pointer', textTransform: 'none',
  },
  '.cm-button:hover': { backgroundColor: 'var(--hover)' },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--soft-accent)' },
  '.cm-search button[name=close]': { marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: '18px', lineHeight: '1', cursor: 'pointer', padding: '0 4px', position: 'static' },
  '.cm-search button[name=close]:hover': { color: 'var(--danger, #e5484d)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--tone-yellow) 35%, transparent)', outline: '1px solid color-mix(in srgb, var(--tone-yellow) 60%, transparent)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--tone-orange) 45%, transparent)' },
  '.cm-panel.cm-gotoLine': { padding: '6px 10px' },
});
