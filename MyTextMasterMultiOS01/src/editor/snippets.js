// Snippets (TextMate tab triggers): type the trigger word, pick it from the completion list (or
// press Tab / Enter), and the snippet is inserted with fields to fill in (Tab moves to the next).
// Plus word completion: words already in the document.
import { completeAnyWord, snippetCompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';

const s = (label, detail, template) => snippetCompletion(template, { label, detail, type: 'keyword', boost: 2 });

export const MARKDOWN_SNIPPETS = [
  s('h1', '# Heading 1', '# ${Heading}\n'),
  s('h2', '## Heading 2', '## ${Heading}\n'),
  s('h3', '### Heading 3', '### ${Heading}\n'),
  s('link', '[text](url)', '[${text}](${https://})'),
  s('img', '![alt](path)', '![${alt}](${images/picture.png})'),
  s('code', '```lang … ```', '```${js}\n${}\n```\n'),
  s('table', '| a | b |', '| ${Column 1} | ${Column 2} |\n| --- | --- |\n| ${} |  |\n'),
  s('task', '- [ ] task', '- [ ] ${task}'),
  s('quote', '> quote', '> ${quote}'),
  s('details', '<details> … </details>', '<details>\n<summary>${Summary}</summary>\n\n${}\n\n</details>\n'),
  s('front', 'front matter', '---\ntitle: ${Title}\ndate: ${2026-01-01}\ntags: [${}]\n---\n'),
  s('note', '> **Note**', '> **${Note}**\n> ${text}'),
  s('kbd', '<kbd>Key</kbd>', '<kbd>${Ctrl}</kbd>'),
  s('footnote', '[^1]: …', '[^${1}]: ${note}'),
];

export const HTML_SNIPPETS = [
  s('html5', 'HTML5 document', '<!doctype html>\n<html lang="${ko}">\n  <head>\n    <meta charset="utf-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <title>${Title}</title>\n  </head>\n  <body>\n    ${}\n  </body>\n</html>\n'),
  s('a', '<a href>', '<a href="${https://}">${text}</a>'),
  s('img', '<img src alt>', '<img src="${images/picture.png}" alt="${}">'),
  s('div', '<div class>', '<div class="${}">\n  ${}\n</div>'),
  s('ul', '<ul><li>', '<ul>\n  <li>${}</li>\n</ul>'),
  s('ol', '<ol><li>', '<ol>\n  <li>${}</li>\n</ol>'),
  s('table', '<table>', '<table>\n  <tr>\n    <th>${Header}</th>\n  </tr>\n  <tr>\n    <td>${}</td>\n  </tr>\n</table>'),
  s('link', '<link stylesheet>', '<link rel="stylesheet" href="${style.css}">'),
  s('script', '<script src>', '<script src="${app.js}"></script>'),
  s('style', '<style>', '<style>\n  ${}\n</style>'),
  s('form', '<form>', '<form action="${}" method="${post}">\n  <label for="${name}">${Name}</label>\n  <input id="${name}" name="${name}">\n  <button type="submit">${Send}</button>\n</form>'),
  s('meta', '<meta name content>', '<meta name="${description}" content="${}">'),
  s('section', '<section><h2>', '<section>\n  <h2>${Title}</h2>\n  <p>${}</p>\n</section>'),
];

const fromList = (list) => (context) => {
  const word = context.matchBefore(/[\w-]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: list, validFor: /^[\w-]*$/ };
};

/** Completion sources for a document kind: its snippets and the words of the document. */
export function completions(kind) {
  const sources = [completeAnyWord];
  if (kind === 'markdown') sources.unshift(fromList(MARKDOWN_SNIPPETS));
  if (kind === 'html') sources.unshift(fromList(HTML_SNIPPETS));
  return EditorState.languageData.of(() => sources.map((autocomplete) => ({ autocomplete })));
}
