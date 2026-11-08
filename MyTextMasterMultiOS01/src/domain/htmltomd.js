// HTML → Markdown for the WYSIWYG view: whatever the user edits in the rendered page is written
// back to the Markdown source. GFM: tables, ~~strikethrough~~, task lists. Pictures keep the
// path written in the document (data-src), not the address the preview loaded them from.
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

let service = null;

function make() {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  td.use(gfm);
  td.addRule('image-source', {
    filter: 'img',
    replacement: (content, node) => {
      const src = node.getAttribute('data-src') || node.getAttribute('src') || '';
      const alt = (node.getAttribute('alt') || '').replace(/\n+/g, ' ');
      const title = node.getAttribute('title');
      return src ? `![${alt}](${src}${title ? ` "${title}"` : ''})` : '';
    },
  });
  // <del>/<s>/<strike> with two tildes (the plugin writes one).
  td.addRule('strike-two', { filter: ['del', 's', 'strike'], replacement: (content) => `~~${content}~~` });
  // A task list item's check box: "[x] " / "[ ] " (also for boxes the user can tick).
  td.addRule('task-box', {
    filter: (node) => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox' && node.parentNode?.nodeName === 'LI',
    replacement: (content, node) => (node.checked || node.hasAttribute('checked') ? '[x] ' : '[ ] '),
  });
  // List items with one space after the marker ("- x", "1. x"), nested lines indented to match.
  td.addRule('list-item', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentNode;
      let prefix = '- ';
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start')) || 1;
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/^(\[[ x]\])\s+/, '$1 ').replace(/\n/gm, `\n${' '.repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
    },
  });
  td.keep(['kbd', 'mark', 'sub', 'sup', 'u']);
  return td;
}

/** Markdown for an HTML fragment (the WYSIWYG page's article). */
export function htmlToMarkdown(html) {
  service ??= make();
  const md = service.turndown(String(html ?? ''));
  // Tidy: no blank lines piling up, one newline at the end.
  // (Two spaces before a line end are a hard line break: only whitespace-only lines are emptied.)
  return `${md.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** The smallest change that turns `before` into `after` (one replace), for a gentle editor update. */
export function minimalChange(before, after) {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let endA = before.length;
  let endB = after.length;
  while (endA > start && endB > start && before.charCodeAt(endA - 1) === after.charCodeAt(endB - 1)) { endA -= 1; endB -= 1; }
  return { from: start, to: endA, insert: after.slice(start, endB) };
}
