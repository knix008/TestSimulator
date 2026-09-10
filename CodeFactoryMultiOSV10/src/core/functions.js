// Function/method extraction.
//
// Every downstream analysis — call graph, metrics, global-variable access, DB
// table access, sequence diagrams — is keyed on the functions found here, so
// this module aims for *no false positives* first and coverage second. All
// pattern matching runs against the masked source (see core/text.js), which is
// why a brace inside a string or a `def` inside a comment cannot fool it.

import { getLanguage, displayPrefix, baseName } from './languages.js';
import { matchBracket, indentWidth, lineFromStarts } from './text.js';

/** Words that look like a call/declaration but never start one. */
const CONTROL_KEYWORDS = new Set([
  'if', 'else', 'elseif', 'elif', 'for', 'foreach', 'while', 'do', 'switch',
  'case', 'catch', 'try', 'finally', 'return', 'throw', 'throws', 'using',
  'lock', 'fixed', 'unsafe', 'await', 'yield', 'new', 'delete', 'sizeof',
  'typeof', 'instanceof', 'in', 'is', 'as', 'and', 'or', 'not', 'match',
  'when', 'with', 'assert', 'print', 'defer', 'go', 'select', 'range',
  'require', 'import', 'export', 'from', 'let', 'var', 'const', 'function',
  'class', 'struct', 'enum', 'interface', 'namespace', 'package', 'module',
  'public', 'private', 'protected', 'internal', 'static', 'final', 'abstract',
  'override', 'virtual', 'operator', 'template', 'typedef', 'define',
  'super', 'this', 'self', 'end', 'begin', 'then', 'elsif',
]);

const ACCESS_WORDS = /\b(public|private|protected|internal|export|open|pub)\b/;

/**
 * Declaration patterns per language. Each entry is a global, multiline RegExp
 * with a `name` group; `kind` labels what was matched for display.
 */
const DECL_PATTERNS = {
  csharp: [
    {
      kind: 'method',
      // modifiers, optional return type, name, parameter list
      re: /^[ \t]*(?:\[[^\]\n]*\][ \t]*)*((?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|partial|new|readonly|required|file)[ \t]+)*)(?:([\w<>\[\],.?]+(?:<[^<>()\n]*>)?[ \t]*[?]?)[ \t]+)?([A-Za-z_]\w*)[ \t]*(<[^<>()\n]*>)?[ \t]*\(/gm,
      nameIndex: 3,
      modIndex: 1,
    },
  ],
  java: [
    {
      kind: 'method',
      re: /^[ \t]*(?:@[\w.]+(?:\([^)\n]*\))?[ \t]*)*((?:(?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)[ \t]+)*)(?:(<[^<>\n]*>[ \t]*)?([\w<>\[\],.?]+)[ \t]+)?([A-Za-z_]\w*)[ \t]*\(/gm,
      nameIndex: 4,
      modIndex: 1,
    },
  ],
  cpp: [
    {
      kind: 'function',
      re: /^[ \t]*(?:(?:static|inline|virtual|explicit|constexpr|extern|friend|template[ \t]*<[^>\n]*>)[ \t]+)*(?:[A-Za-z_][\w:<>,\s*&]*?[\s*&][ \t]*)?([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)[ \t]*\(/gm,
      nameIndex: 1,
      modIndex: 0,
    },
  ],
  go: [
    { kind: 'function', re: /^func[ \t]+(?:\([^)\n]*\)[ \t]*)?([A-Za-z_]\w*)[ \t]*[(\[]/gm, nameIndex: 1, modIndex: 0 },
  ],
  rust: [
    {
      kind: 'function',
      re: /^[ \t]*((?:pub(?:\([^)\n]*\))?[ \t]+)?(?:(?:async|const|unsafe|extern(?:[ \t]+"[^"\n]*")?)[ \t]+)*)fn[ \t]+([A-Za-z_]\w*)/gm,
      nameIndex: 2,
      modIndex: 1,
    },
  ],
  swift: [
    {
      kind: 'function',
      re: /^[ \t]*((?:(?:public|private|internal|fileprivate|open|static|class|final|override|mutating|convenience|required|@\w+)[ \t]+)*)(?:func[ \t]+([A-Za-z_]\w*)|(init)\b)/gm,
      nameIndex: 2,
      altNameIndex: 3,
      modIndex: 1,
    },
  ],
  kotlin: [
    {
      kind: 'function',
      re: /^[ \t]*((?:(?:public|private|protected|internal|open|override|suspend|inline|infix|operator|tailrec|external|abstract|final)[ \t]+)*)fun[ \t]+(?:<[^>\n]+>[ \t]*)?(?:[\w.`]+\.)?([A-Za-z_]\w*)[ \t]*\(/gm,
      nameIndex: 2,
      modIndex: 1,
    },
  ],
  php: [
    {
      kind: 'function',
      re: /^[ \t]*((?:(?:public|private|protected|static|final|abstract)[ \t]+)*)function[ \t]+&?([A-Za-z_]\w*)[ \t]*\(/gm,
      nameIndex: 2,
      modIndex: 1,
    },
  ],
  javascript: [
    {
      kind: 'function',
      re: /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*\(/gm,
      nameIndex: 1,
      modIndex: 0,
    },
    {
      kind: 'arrow',
      // const foo = (a, b) => {   /   let foo = async a => {
      re: /^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]+)?=[ \t]*(?:async[ \t]+)?(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)[ \t]*=>/gm,
      nameIndex: 1,
      modIndex: 0,
    },
    {
      kind: 'method',
      // class / object-literal method shorthand: `  async foo(a) {`
      re: /^[ \t]+(?:(static|get|set|async)[ \t]+)*(?:\*[ \t]*)?([A-Za-z_$#][\w$]*)[ \t]*(?:<[^<>\n]*>)?[ \t]*\([^;\n]*?\)[ \t]*(?::[^{;\n]+?)?\{/gm,
      nameIndex: 2,
      modIndex: 1,
    },
  ],
  python: [
    { kind: 'function', re: /^[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/gm, nameIndex: 1, modIndex: 0 },
  ],
  ruby: [
    { kind: 'method', re: /^[ \t]*def[ \t]+(?:self\.)?([A-Za-z_]\w*[?!=]?)/gm, nameIndex: 1, modIndex: 0 },
  ],
  vbnet: [
    {
      kind: 'method',
      re: /^[ \t]*((?:(?:Public|Private|Protected|Friend|Shared|Overrides|Overridable|MustOverride|NotOverridable|Async|Partial|Default)[ \t]+)*)(?:Sub|Function)[ \t]+([A-Za-z_]\w*)/gim,
      nameIndex: 2,
      modIndex: 1,
    },
  ],
};

/** Ruby/VB keywords that open a block terminated by `end` / `End X`. */
const RUBY_OPENERS = /^\s*(?:def|class|module|if|unless|case|while|until|for|begin|do)\b|\bdo\s*(\|[^|]*\|)?\s*$/;

/**
 * Extracts the functions declared in one source file.
 *
 * @param {{path:string, languageId:string, text:string, masked:string, lineStarts:number[]}} file
 * @returns {Array<object>} function records, in declaration order
 */
export function extractFunctions(file) {
  const lang = getLanguage(file.languageId);
  if (!lang) return [];

  const patterns = DECL_PATTERNS[file.languageId] || [];
  const masked = file.masked;
  const found = [];
  const seenStart = new Set();

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let m;
    while ((m = pattern.re.exec(masked)) !== null) {
      // A zero-width match would spin forever.
      if (m[0].length === 0) {
        pattern.re.lastIndex++;
        continue;
      }

      const name = m[pattern.nameIndex] || (pattern.altNameIndex ? m[pattern.altNameIndex] : '');
      if (!name || CONTROL_KEYWORDS.has(name.toLowerCase())) continue;

      const declOffset = m.index + (m[0].length - m[0].trimStart().length);
      if (seenStart.has(declOffset)) continue;

      const body = resolveBody(file, lang.family, m.index + m[0].length, declOffset);
      if (!body) continue;

      seenStart.add(declOffset);
      const startLine = lineFromStarts(file.lineStarts, declOffset);
      const endLine = lineFromStarts(file.lineStarts, body.end);
      const signature = file.text.slice(declOffset, Math.min(body.headerEnd, declOffset + 400)).replace(/\s+/g, ' ').trim();

      found.push({
        name,
        kind: pattern.kind,
        startLine,
        endLine,
        startOffset: declOffset,
        bodyStart: body.start,
        endOffset: body.end,
        signature,
        modifiers: (m[pattern.modIndex] || '').trim(),
      });
    }
  }

  found.sort((a, b) => a.startOffset - b.startOffset);

  // Drop declarations that turned out to be nested inside another function's
  // body *and* share its name (a common regex artefact), and collapse exact
  // duplicates produced by two patterns matching the same line.
  const result = [];
  for (const fn of found) {
    const dup = result.find((r) => r.startLine === fn.startLine && r.name === fn.name);
    if (dup) continue;
    result.push(fn);
  }

  const prefix = displayPrefix(file.languageId);
  const fileLabel = baseName(file.path);

  return result.map((fn) => {
    const bodyText = file.text.slice(fn.bodyStart, fn.endOffset);
    const maskedBody = masked.slice(fn.bodyStart, fn.endOffset);
    return {
      id: file.languageId + ':' + file.path + '::' + fn.name + '@' + fn.startLine,
      languageId: file.languageId,
      name: fn.name,
      displayName: fn.name,
      fullName: prefix + ' ' + fileLabel + '::' + fn.name,
      filePath: file.path,
      startLine: fn.startLine,
      endLine: fn.endLine,
      lineCount: Math.max(1, fn.endLine - fn.startLine + 1),
      signature: fn.signature,
      kind: fn.kind,
      isPublic: isPublicDeclaration(file.languageId, fn),
      parameterCount: countParameters(fn.signature),
      bodyText,
      maskedBody,
      bodyStart: fn.bodyStart,
      endOffset: fn.endOffset,
      precision: lang.precision,
    };
  });
}

function isPublicDeclaration(languageId, fn) {
  const mods = fn.modifiers || '';
  if (languageId === 'go') return /^[A-Z]/.test(fn.name);
  if (languageId === 'python' || languageId === 'ruby') return !fn.name.startsWith('_');
  if (languageId === 'rust') return /\bpub\b/.test(mods);
  if (languageId === 'javascript') return /\bexport\b/.test(fn.signature) || !fn.name.startsWith('_');
  if (!mods) return languageId === 'cpp';
  return /\b(public|open|Public)\b/.test(mods) || (ACCESS_WORDS.test(mods) === false && languageId === 'java');
}

/**
 * Finds the body of a declaration that ends at `afterHeader`.
 * @returns {{start:number, end:number, headerEnd:number}|null}
 */
function resolveBody(file, family, afterHeader, declOffset) {
  const masked = file.masked;

  if (family === 'brace') {
    // Skip the rest of the parameter list, generic constraints, `throws`, a
    // return type annotation, and so on, until the opening brace.
    let i = afterHeader - 1;
    let depth = 0;
    // Re-balance the parenthesis the pattern stopped on (if any).
    while (i < masked.length) {
      const ch = masked[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth <= 0) {
          i++;
          break;
        }
      } else if (ch === '{' && depth <= 0) break;
      else if (ch === ';' && depth <= 0) return null; // prototype / abstract
      i++;
    }

    // Now look for `{` (a body) or `=>` (a C#/JS expression body).
    let j = i;
    const limit = Math.min(masked.length, i + 4000);
    while (j < limit) {
      const ch = masked[j];
      if (ch === '{') {
        const end = matchBracket(masked, j, '{', '}');
        if (end < 0) return null;
        return { start: j + 1, end, headerEnd: j };
      }
      if (ch === ';') return null;
      if (ch === '=' && masked[j + 1] === '>') {
        // Expression body — runs to the end of the statement.
        let k = j + 2;
        let paren = 0;
        while (k < masked.length) {
          const c = masked[k];
          if (c === '(' || c === '[') paren++;
          else if (c === ')' || c === ']') paren--;
          else if (c === '{') {
            const end = matchBracket(masked, k, '{', '}');
            if (end < 0) return null;
            return { start: k + 1, end, headerEnd: k };
          } else if (c === ';' && paren <= 0) break;
          k++;
        }
        return { start: j + 2, end: Math.min(k, masked.length), headerEnd: j };
      }
      j++;
    }
    return null;
  }

  if (family === 'indent') {
    // Python: the body is every following line indented deeper than the `def`.
    const lines = file.text.split('\n');
    const declLine = lineFromStarts(file.lineStarts, declOffset);
    const declIndent = indentWidth(lines[declLine - 1] || '');

    // The signature can span lines; the body starts after the line holding `:`.
    let headerLine = declLine;
    let paren = 0;
    for (let n = declLine; n <= lines.length; n++) {
      const text = lines[n - 1] || '';
      for (const ch of text) {
        if (ch === '(' || ch === '[') paren++;
        else if (ch === ')' || ch === ']') paren--;
      }
      headerLine = n;
      if (paren <= 0 && /:\s*(#.*)?$/.test(text)) break;
      if (n - declLine > 40) break;
    }

    let endLine = headerLine;
    for (let n = headerLine + 1; n <= lines.length; n++) {
      const text = lines[n - 1];
      if (!text.trim()) continue;
      if (indentWidth(text) <= declIndent) break;
      endLine = n;
    }

    const start = file.lineStarts[headerLine] !== undefined ? file.lineStarts[headerLine] : file.text.length;
    const end = endLine + 1 < file.lineStarts.length ? file.lineStarts[endLine + 1] - 1 : file.text.length;
    const headerEnd = endLine >= headerLine ? (file.lineStarts[headerLine] || file.text.length) : start;
    return { start, end: Math.max(start, end), headerEnd };
  }

  // keyword family — Ruby (`end`) and VB.NET (`End Sub` / `End Function`).
  const lines = file.text.split('\n');
  const declLine = lineFromStarts(file.lineStarts, declOffset);

  if (file.languageId === 'vbnet') {
    const isFunction = /\bFunction\b/i.test(lines[declLine - 1] || '');
    const terminator = isFunction ? /^\s*End\s+Function\b/i : /^\s*End\s+Sub\b/i;
    for (let n = declLine + 1; n <= lines.length; n++) {
      if (terminator.test(lines[n - 1])) {
        const start = file.lineStarts[declLine] !== undefined ? file.lineStarts[declLine] : file.text.length;
        const end = n < file.lineStarts.length ? file.lineStarts[n] - 1 : file.text.length;
        return { start, end: Math.max(start, end), headerEnd: start };
      }
    }
    return null;
  }

  // Ruby: count block openers against `end`.
  let depth = 1;
  for (let n = declLine + 1; n <= lines.length; n++) {
    const text = lines[n - 1];
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // A modifier `if`/`unless` (statement-trailing) opens no block.
    if (RUBY_OPENERS.test(text) && !/^\s*\S.*\s(if|unless|while|until)\s+\S/.test(text)) depth++;
    if (/^\s*end\b/.test(text) || /\bend\s*$/.test(text)) depth--;
    if (depth <= 0) {
      const start = file.lineStarts[declLine] !== undefined ? file.lineStarts[declLine] : file.text.length;
      const end = n < file.lineStarts.length ? file.lineStarts[n] - 1 : file.text.length;
      return { start, end: Math.max(start, end), headerEnd: start };
    }
  }
  return null;
}

/** Parameter count from a captured signature, empty list ⇒ 0. */
export function countParameters(signature) {
  const start = signature.indexOf('(');
  if (start < 0) return 0;

  let depth = 0;
  let end = -1;
  for (let i = start; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === '(' || ch === '[' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '>') {
      depth--;
      if (depth === 0 && ch === ')') {
        end = i;
        break;
      }
    }
  }
  if (end <= start) return 0;

  const inner = signature.slice(start + 1, end).trim();
  if (!inner) return 0;

  let count = 1;
  depth = 0;
  for (const ch of inner) {
    if (ch === '(' || ch === '[' || ch === '<' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '>' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

/** True when `name` is a plausible user-defined callee (not a keyword). */
export function isCallableName(name) {
  return !!name && !CONTROL_KEYWORDS.has(name.toLowerCase());
}

export { CONTROL_KEYWORDS };
