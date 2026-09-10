// Source-text primitives shared by every analyzer.
//
// The central idea is the *mask*: a copy of the source in which comment and
// string bodies are replaced by spaces, character-for-character. Offsets and
// line numbers therefore stay identical to the original, so structural scans
// (brace matching, declaration regexes, call detection) never trip over a brace
// inside a string literal or a keyword inside a comment — while the original
// text is still available whenever the literal content matters (SQL capture,
// hardcoded-secret rules).

/** Line-comment openers per language family. */
const LINE_COMMENTS = {
  csharp: ['//'],
  vbnet: ["'"],
  python: ['#'],
  java: ['//'],
  cpp: ['//'],
  go: ['//'],
  rust: ['//'],
  swift: ['//'],
  javascript: ['//'],
  ruby: ['#'],
  kotlin: ['//'],
  php: ['//', '#'],
};

const BLOCK_COMMENTS = {
  csharp: [['/*', '*/']],
  python: [],
  java: [['/*', '*/']],
  cpp: [['/*', '*/']],
  go: [['/*', '*/']],
  rust: [['/*', '*/']],
  swift: [['/*', '*/']],
  javascript: [['/*', '*/']],
  ruby: [['=begin', '=end']],
  kotlin: [['/*', '*/']],
  php: [['/*', '*/']],
  vbnet: [],
};

/** Quote characters that open a string literal, per language. */
const QUOTES = {
  python: ['"""', "'''", '"', "'"],
  ruby: ['"', "'"],
  vbnet: ['"'],
  default: ['"', "'", '`'],
};

function quotesFor(languageId) {
  return QUOTES[languageId] || QUOTES.default;
}

/**
 * Replaces comment and string *contents* with spaces, preserving length,
 * newlines and every offset.
 *
 * @param {string} source
 * @param {string} languageId
 * @returns {string} masked source, same length as `source`
 */
export function maskSource(source, languageId) {
  if (!source) return '';
  const lineOpeners = LINE_COMMENTS[languageId] || ['//'];
  const blockPairs = BLOCK_COMMENTS[languageId] || [['/*', '*/']];
  const quotes = quotesFor(languageId);
  const out = source.split('');
  const len = source.length;
  let i = 0;

  const blankTo = (from, to) => {
    for (let k = from; k < to && k < len; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < len) {
    const ch = source[i];

    if (ch === '\n') {
      i++;
      continue;
    }

    // Line comment
    let matchedLine = null;
    for (const opener of lineOpeners) {
      if (source.startsWith(opener, i)) {
        // `#` inside PHP/Python is a comment, but `#!` on line 1 and C `#include`
        // directives are not text we want to blank away wholesale — still, they
        // carry no braces or calls, so blanking is safe and simpler.
        matchedLine = opener;
        break;
      }
    }
    if (matchedLine) {
      let end = source.indexOf('\n', i);
      if (end < 0) end = len;
      blankTo(i, end);
      i = end;
      continue;
    }

    // Block comment
    let matchedBlock = null;
    for (const [open, close] of blockPairs) {
      if (source.startsWith(open, i)) {
        matchedBlock = close;
        break;
      }
    }
    if (matchedBlock) {
      let end = source.indexOf(matchedBlock, i + 2);
      end = end < 0 ? len : end + matchedBlock.length;
      blankTo(i, end);
      i = end;
      continue;
    }

    // String literal
    let matchedQuote = null;
    for (const q of quotes) {
      if (source.startsWith(q, i)) {
        matchedQuote = q;
        break;
      }
    }
    if (matchedQuote) {
      const isTriple = matchedQuote.length === 3;
      let j = i + matchedQuote.length;
      while (j < len) {
        if (source[j] === '\\' && !isTriple) {
          j += 2;
          continue;
        }
        if (source.startsWith(matchedQuote, j)) {
          j += matchedQuote.length;
          break;
        }
        // A single-quoted literal never spans a line in these languages; bail
        // out at the newline so an unbalanced quote cannot swallow the file.
        if (!isTriple && source[j] === '\n') break;
        j++;
      }
      blankTo(i, j);
      i = j;
      continue;
    }

    i++;
  }

  return out.join('');
}

/** Zero-based offset → one-based line number. */
export function lineOfOffset(source, offset) {
  let line = 1;
  const max = Math.min(offset, source.length);
  for (let i = 0; i < max; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/** Precomputed offset→line index: `lineStarts[n]` is the offset of line n+1. */
export function buildLineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** Binary-searches a line-start table built by {@link buildLineStarts}. */
export function lineFromStarts(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Physical / code / blank / comment line counts.
 * Ported from the Windows build's SourceLineCounter, including its rule that a
 * line with code *and* a trailing comment counts only as code.
 */
export function countLines(content) {
  if (!content) return { physical: 0, code: 0, blank: 0, comment: 0 };

  let physical = 0;
  let code = 0;
  let blank = 0;
  let comment = 0;
  let inBlockComment = false;

  // A file ending in a newline has N lines, not N + 1 — the trailing empty
  // element from split() is an artefact, and counting it inflates every
  // blank-line and density metric by one per file.
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  for (const raw of lines) {
    physical++;
    const trimmed = raw.replace(/\r$/, '');

    if (!trimmed.trim()) {
      blank++;
      continue;
    }

    let work = trimmed;
    if (inBlockComment) {
      const end = work.indexOf('*/');
      if (end < 0) {
        comment++;
        continue;
      }
      inBlockComment = false;
      work = work.slice(end + 2).trimStart();
      if (!work.length) {
        comment++;
        continue;
      }
    }

    const res = stripLeadingComments(work, inBlockComment);
    inBlockComment = res.inBlockComment;
    if (res.hasCode) code++;
    else comment++;
  }

  return { physical, code, blank, comment };
}

function stripLeadingComments(line, inBlockComment) {
  let work = line.trimStart();
  let block = inBlockComment;

  for (;;) {
    if (block) {
      const end = work.indexOf('*/');
      if (end < 0) return { hasCode: false, inBlockComment: true };
      block = false;
      work = work.slice(end + 2).trimStart();
      continue;
    }

    if (!work.length) return { hasCode: false, inBlockComment: false };

    if (work.startsWith('//') || work.startsWith('#') || work.startsWith(';') || work.startsWith("'")) {
      return { hasCode: false, inBlockComment: false };
    }

    if (work.startsWith('/*')) {
      const end = work.indexOf('*/', 2);
      if (end < 0) return { hasCode: false, inBlockComment: true };
      work = work.slice(end + 2).trimStart();
      continue;
    }

    return { hasCode: true, inBlockComment: false };
  }
}

const TODO_RE = /\b(TODO|FIXME|HACK|XXX|BUG|REFACTOR)\b/gi;

export function countTodoMarkers(content) {
  const matches = content.match(TODO_RE);
  return matches ? matches.length : 0;
}

/** Heuristic used by both the metrics tab and the test-ratio inspection. */
export function looksLikeTestFile(filePath) {
  const p = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    /(^|\/)tests?\//.test(p) ||
    /(^|\/)spec\//.test(p) ||
    /(^|\/)__tests__\//.test(p) ||
    /[._-](test|tests|spec)\.[a-z]+$/.test(p) ||
    /(^|\/)test_[^/]*$/.test(p)
  );
}

/**
 * Finds the offset of the matching `close` for the `open` at `from`.
 * Operates on masked text, so quotes and comments cannot unbalance it.
 * Returns -1 when unbalanced.
 */
export function matchBracket(masked, from, open = '{', close = '}') {
  if (masked[from] !== open) return -1;
  let depth = 0;
  for (let i = from; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Leading-whitespace width, tabs counted as 4 columns. */
export function indentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width++;
    else if (ch === '\t') width += 4;
    else break;
  }
  return width;
}

/** Escapes a string for safe interpolation into a RegExp source. */
export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalizes a path to forward slashes for display and comparison. */
export function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}
