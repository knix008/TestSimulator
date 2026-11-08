// The look of rendered Markdown: in the preview (a frame of its own), in exported HTML and
// when printing. Four styles; `.dark` follows a dark program theme in the preview.
export const PREVIEW_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; }
.preview-body { --fg: #1f2328; --muted: #59636e; --bg: #ffffff; --border: #d1d9e0; --soft: #f6f8fa; --link: #0969da; --mark: #fff8c5; --code: #eff1f3;
  background: var(--bg); color: var(--fg); font: 16px/1.65 -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", Helvetica, Arial, sans-serif; }
.preview-body.dark { color-scheme: dark; --fg: #e6edf3; --muted: #9198a1; --bg: #0d1117; --border: #3d444d; --soft: #151b23; --link: #4493f8; --mark: #bb800926; --code: #656c7633; }
.markdown-body { max-width: 900px; margin: 0 auto; padding: 28px 36px 60px; word-wrap: break-word; }
.markdown-body > :first-child, .markdown-body > .md-block:first-child > :first-child { margin-top: 0; }
h1, h2, h3, h4, h5, h6 { margin: 1.4em 0 0.6em; font-weight: 600; line-height: 1.25; }
h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.25em; } h4 { font-size: 1em; } h5 { font-size: 0.875em; } h6 { font-size: 0.85em; color: var(--muted); }
p, blockquote, ul, ol, dl, table, pre, details { margin: 0 0 1em; }
a { color: var(--link); text-decoration: none; } a:hover { text-decoration: underline; }
blockquote { padding: 0 1em; color: var(--muted); border-left: 0.25em solid var(--border); }
ul, ol { padding-left: 2em; } li + li { margin-top: 0.25em; }
li > input[type="checkbox"] { margin: 0 0.4em 0.2em -1.4em; vertical-align: middle; }
li:has(> input[type="checkbox"]) { list-style: none; }
code, kbd, samp { font-family: Consolas, "D2Coding", "SFMono-Regular", Menlo, monospace; font-size: 0.875em; }
:not(pre) > code { padding: 0.2em 0.4em; border-radius: 6px; background: var(--code); }
pre { padding: 14px 16px; overflow: auto; line-height: 1.45; border-radius: 8px; background: var(--soft); border: 1px solid var(--border); }
pre code { padding: 0; background: none; font-size: 0.85em; white-space: pre; }
kbd { padding: 2px 6px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 5px; background: var(--soft); }
table { border-collapse: collapse; display: block; width: max-content; max-width: 100%; overflow: auto; }
th, td { padding: 6px 13px; border: 1px solid var(--border); }
th { font-weight: 600; background: var(--soft); }
tr:nth-child(2n) td { background: color-mix(in srgb, var(--soft) 60%, transparent); }
img { max-width: 100%; height: auto; border-radius: 4px; }
hr { height: 0.25em; margin: 1.5em 0; padding: 0; border: 0; background: var(--border); }
mark { background: var(--mark); color: inherit; }
del { color: var(--muted); }

/* document: a serif page like a word processor */
.style-document .markdown-body { max-width: 800px; font-family: Georgia, "Times New Roman", "Batang", "Noto Serif KR", serif; font-size: 17px; line-height: 1.75; }
.style-document h1, .style-document h2 { border-bottom: 0; }
.style-document h1 { text-align: center; font-size: 2.1em; margin-bottom: 1em; }
/* academic: numbered sections, justified text */
.style-academic .markdown-body { max-width: 760px; font-family: "Cambria", "Times New Roman", "Batang", serif; text-align: justify; counter-reset: h2; }
.style-academic h1 { text-align: center; border-bottom: 0; }
.style-academic h2 { counter-reset: h3; border-bottom: 0; }
.style-academic h2::before { counter-increment: h2; content: counter(h2) ". "; }
.style-academic h3::before { counter-increment: h3; content: counter(h2) "." counter(h3) " "; }
/* plain: no decoration */
.style-plain .markdown-body { max-width: none; font-family: system-ui, sans-serif; }
.style-plain h1, .style-plain h2 { border-bottom: 0; }
.style-plain pre { border: 0; }

/* the preview: the block that the editor's cursor is in */
.md-block.cursor-block { box-shadow: -14px 0 0 -11px #f5a524; }
@media print {
  .markdown-body { max-width: none; padding: 0; }
  pre, blockquote, table, img { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
  .md-block.cursor-block { box-shadow: none; }
}
`;
