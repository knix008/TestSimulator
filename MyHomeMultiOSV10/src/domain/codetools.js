// Tidying and checking code with the downloaded packages (domain/packages.js): Prettier tidies,
// JSHint checks JavaScript, HTMLHint checks HTML. JSON and CSS are checked here without a package.
// `tools` is what platform/packages.js loadPackage() returns: { prettier, prettierPlugins } etc.
import { lineColumn } from './highlight.js';

/** Prettier's parser for each language of the editor. */
export const PARSERS = { html: 'html', css: 'css', js: 'babel', json: 'json' };

export async function formatCode(tools, text, language) {
  const parser = PARSERS[language];
  if (!parser) throw new Error(`no formatter for ${language}`);
  if (!tools?.prettier?.format) throw new Error('Prettier is not loaded');
  const plugins = Object.values(tools.prettierPlugins ?? {});
  return tools.prettier.format(text, { parser, plugins, printWidth: 100, tabWidth: 2, singleQuote: true, htmlWhitespaceSensitivity: 'ignore' });
}

const item = (line, column, severity, message, rule = '') => ({ line: Math.max(1, Number(line) || 1), column: Math.max(1, Number(column) || 1), severity, message: String(message ?? ''), rule });
const sortItems = (items) => items.sort((a, b) => a.line - b.line || a.column - b.column);

/** JSON: the first error with its place (the browser gives "at position N" or "line L column C"). */
export function checkJson(text) {
  try {
    JSON.parse(text);
    return [];
  } catch (error) {
    const message = String(error.message);
    const lc = /line (\d+) column (\d+)/i.exec(message);
    if (lc) return [item(lc[1], lc[2], 'error', message)];
    const pos = /position (\d+)/i.exec(message);
    const at = pos ? lineColumn(text, Number(pos[1])) : { line: 1, column: 1 };
    return [item(at.line, at.column, 'error', message)];
  }
}

/** CSS: braces, brackets, comments and strings that are not closed (enough to find the usual slip). */
export function checkCss(text) {
  const items = [];
  const stack = [];
  const pairs = { '}': '{', ')': '(', ']': '[' };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) { const at = lineColumn(text, i); items.push(item(at.line, at.column, 'error', 'unclosed comment', 'css-comment')); break; }
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      if (text[j] !== c) { const at = lineColumn(text, i); items.push(item(at.line, at.column, 'error', 'unclosed string', 'css-string')); }
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') stack.push([c, i]);
    else if (pairs[c]) {
      const top = stack.pop();
      if (!top || top[0] !== pairs[c]) { const at = lineColumn(text, i); items.push(item(at.line, at.column, 'error', `unexpected "${c}"`, 'css-brace')); if (top) stack.push(top); }
    }
    i += 1;
  }
  for (const [c, at] of stack) { const p = lineColumn(text, at); items.push(item(p.line, p.column, 'error', `"${c}" is not closed`, 'css-brace')); }
  return sortItems(items);
}

export function checkJs(tools, text) {
  const jshint = tools?.JSHINT;
  if (typeof jshint !== 'function') throw new Error('JSHint is not loaded');
  jshint(text, { esversion: 2022, browser: true, devel: true, module: /^\s*(import|export)\b/m.test(text), asi: false, undef: false, unused: false }, {});
  return sortItems((jshint.errors ?? []).filter(Boolean).map((e) => item(e.line, e.character, String(e.code ?? '').startsWith('E') ? 'error' : 'warning', e.reason, e.code ?? '')));
}

/**
 * The HTMLHint linter. The browser build (htmlhint.min.js, UMD) puts the module's exports on
 * globalThis.HTMLHint — { HTMLHint, HTMLParser, HTMLRules, Reporter } — so the object with verify()
 * is globalThis.HTMLHint.HTMLHint. A linter handed over directly (tests) works too.
 */
export function htmlHinter(tools) {
  const global = tools?.HTMLHint;
  if (typeof global?.verify === 'function') return global;
  if (typeof global?.HTMLHint?.verify === 'function') return global.HTMLHint;
  if (typeof global?.default?.verify === 'function') return global.default;
  return null;
}

export function checkHtml(tools, text) {
  const hint = htmlHinter(tools);
  if (!hint) throw new Error('HTMLHint is not loaded');
  return sortItems(hint.verify(text).map((m) => item(m.line, m.col, m.type === 'error' ? 'error' : 'warning', m.message, m.rule?.id ?? '')));
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** HTML without HTMLHint: tags and comments that are not closed. */
export function checkHtmlBasic(text) {
  const items = [];
  const comment = text.indexOf('<!--');
  if (comment >= 0 && text.indexOf('-->', comment + 4) < 0) {
    const at = lineColumn(text, comment);
    items.push(item(at.line, at.column, 'error', 'unclosed comment', 'comment'));
  }
  const stack = [];
  const re = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)\b[^>]*?>/g;
  let match = re.exec(text);
  while (match) {
    const tag = match[0];
    if (!tag.startsWith('<!--')) {
      const name = match[1].toLowerCase();
      const at = lineColumn(text, match.index);
      if (tag.startsWith('</')) {
        const top = stack.pop();
        if (!top || top.name !== name) items.push(item(at.line, at.column, 'error', `unexpected </${name}>`, 'tag-pair'));
        if (top && top.name !== name) stack.push(top);
      } else if (!tag.endsWith('/>') && !VOID_TAGS.has(name)) stack.push({ name, ...at });
    }
    match = re.exec(text);
  }
  for (const open of stack) items.push(item(open.line, open.column, 'error', `<${open.name}> is not closed`, 'tag-pair'));
  return sortItems(items);
}

/** JavaScript without JSHint: the first syntax error the engine reports. */
export function checkJsSyntax(text) {
  if (!String(text ?? '').trim()) return [];
  const body = String(text).replace(/^\s*import\b[^;]*;?/gm, '').replace(/^\s*export\s+default\s+/gm, '').replace(/^\s*export\s+/gm, '');
  try {
    // Syntax only. The function is never called.
    // eslint-disable-next-line no-new-func
    new Function(body);
    return [];
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    const at = /:(\d+):(\d+)/.exec(String(error?.stack ?? ''));
    return [item(at?.[1] ?? 1, at?.[2] ?? 1, 'error', message, 'syntax')];
  }
}

/** The problems of a text, using a package when it is installed and a small check otherwise. */
export function checkSource(tools, text, language) {
  if (language === 'json') return { tool: 'JSON', items: checkJson(text) };
  if (language === 'css') return { tool: 'CSS', items: checkCss(text) };
  if (language === 'js') return typeof tools?.JSHINT === 'function' ? { tool: 'JSHint', items: checkJs(tools, text) } : { tool: 'JavaScript', items: checkJsSyntax(text) };
  if (language === 'html') return htmlHinter(tools) ?{ tool: 'HTMLHint', items: checkHtml(tools, text) } : { tool: 'HTML', items: checkHtmlBasic(text) };
  return { tool: '', items: [] };
}

/** The problems of a text: { tool, items: [{ line, column, severity, message, rule }] }. */
export function checkCode(tools, text, language) {
  if (language === 'json') return { tool: 'JSON', items: checkJson(text) };
  if (language === 'css') return { tool: 'CSS', items: checkCss(text) };
  if (language === 'js') return { tool: 'JSHint', items: checkJs(tools, text) };
  if (language === 'html') return { tool: 'HTMLHint', items: checkHtml(tools, text) };
  return { tool: '', items: [] };
}
