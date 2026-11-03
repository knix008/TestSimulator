'use strict';

// Is a comment code that was turned off, or an explanation? Shared by the
// "commented-out code" rules (core/metrics.js common:commented-code, and as a
// prose check for the engines' own detectors).
//
//   lineKind(text, style)   true = a line of code, false = a line of prose,
//                           null = says nothing (blank, a lone word, a symbol)
//   blockIsCode(lines, opts) { code, prose, isCode } for the lines of one comment
//
// text is the comment line without its comment marker (//, /*, *, #, --).
// style: 'slash' (C-like languages), 'hash' (Python, Ruby, shell, YAML …) or
// 'dash' (SQL, Lua …).
//
// Prose wins first: documentation tags (@param, \brief, :param), Korean or
// other CJK text outside string literals, three ordinary words in a row
// ("for better multi-language support"), a "name : value" description,
// a sentence ending with . ? or !. Only then is a line code, and only by its
// structure: a statement ending with ';' that assigns or calls, a declaration,
// a brace, a control statement with its condition, a preprocessor directive,
// and for hash languages an assignment, a call, an import or a block header.

// Words that are code, not prose, when they stand in a row ("static const char",
// "for item in items"). Ordinary English words that are also keywords of some
// language (when, set, on, by, data …) are left out: in a row they are prose.
const CODE_WORDS = new Set(`
  auto bool break case catch char class const constexpr continue default delete do double else elif
  enum explicit extern false final float for foreach friend func function goto if import in inline int
  interface let long namespace new nil none null nullptr operator override package private protected
  public register return self short signed sizeof static struct super switch template this throw true
  try typedef typename union unsigned using var virtual void volatile while def lambda raise
  yield async await from as is not and or fn mut pub impl trait
  uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t size_t
`.trim().split(/\s+/));

const DOC_TAG = /^(@\w+|\\(brief|param|return|returns|retval|note|see|file|author|details|code|endcode|pre|post|warning|todo)\b|:(param|type|return|returns|rtype|raises)\b|(Args|Arguments|Returns|Raises|Yields|Example|Examples|Note|Notes|See also|Parameters)\s*:)/i;
const PROSE_START = /^(TODO|FIXME|NOTE|XXX|HACK|BUG|WARNING|WARN|SAFETY|see|e\.g\.|i\.e\.|eg\b|ie\b|https?:\/\/|www\.)/i;
const CJK = /[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7a3]/;

// Text with string and character literals removed (their words are not prose).
function withoutStrings(s) {
  return s.replace(/"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'|`[^`]*`?/g, '""');
}

// Three ordinary words in a row: letters only, not code words.
function proseRun(s) {
  let run = 0;
  for (const w of s.split(/\s+/)) {
    const word = w.replace(/^[("'[]+|[)"',.;:!?\]]+$/g, '');
    const plain = /^[A-Za-z][a-z]+$|^[A-Za-z]{1,2}$|^[A-Z][a-z]+$/.test(word) && !/[_(){}=;<>*&|[\]]/.test(w.replace(/[,.;:!?)]+$/, '').replace(/^\(/, ''));
    if (plain && !CODE_WORDS.has(word.toLowerCase())) {
      run += 1;
      if (run >= 3) return true;
    } else run = 0;
  }
  return false;
}

// A trailing comment inside commented-out code ("x = 1;  // why") is cut off.
function withoutTrailingComment(s, style) {
  if (style !== 'slash') return s;
  const bare = withoutStrings(s);
  const at = bare.search(/\/\/|\/\*/);
  if (at <= 0) return s;
  // The position holds in s only when no string literal came before it.
  const before = s.slice(0, at);
  return withoutStrings(before) === bare.slice(0, at) ? before : s;
}

function lineKind(text, style = 'slash') {
  const l = withoutTrailingComment(String(text || '').trim(), style).trim();
  if (!l || /^[-=*#/~_+.]{2,}$/.test(l)) return null;
  if (DOC_TAG.test(l) || PROSE_START.test(l)) return false;
  const bare = withoutStrings(l);
  if (CJK.test(bare)) return false;
  // "return   : 0 = success", "type: 9=Visible …", "Format (if records existed):"
  if (/^[A-Za-z_][\w ]*\s:\s/.test(l) || /^[A-Za-z_]\w*\s*:\s+[A-Za-z0-9]/.test(l) && !/[;{]\s*$/.test(l)) return false;
  if (proseRun(bare)) return false;
  // A sentence: ends with . ? ! (not "...;" code, not a member access).
  if (/[A-Za-z0-9)'"][.?!]$/.test(bare) && !/[;{}]/.test(bare) && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(bare)) return false;

  if (style === 'slash' || style === 'dash') {
    if (/^#\s*(include|define|if|ifdef|ifndef|endif|else|elif|undef|pragma|error|warning)\b/.test(l)) return true;
  }
  if (/^[{}]\s*;?$/.test(l) || /^}\s*(else\b.*)?\{?$/.test(l) || /^}\s*while\s*\(.*\)\s*;$/.test(l)) return true;
  if (/^(if|while|for|switch|foreach|catch|elseif|else\s+if)\s*\(.*\)\s*(\{|;)?$/.test(l)) return true;
  if (/^(else|do|try|finally)\s*\{?$/.test(l)) return true;
  if (/^(return\b[^.]*|break|continue|goto\s+\w+|throw\b.*)\s*;$/.test(l)) return true;
  if (/;$/.test(l) && /(\w\s*(=|\+=|-=|\*=|\/=|\|=|&=)[^=]|\w\s*\(.*\)|\]\s*=|\+\+|--|->|::)/.test(bare)) return true;
  // A cast statement: "(void)type;", "(void)memset(p, 0, n);"
  if (/^\(\s*[A-Za-z_][\w\s*]*\)\s*[A-Za-z_][\w.>-]*(\(.*\))?\s*;$/.test(l)) return true;
  // Declarations: "int a, b;", "lv_obj_t *p = NULL;", "unsigned char buf[16];"
  if (/^[A-Za-z_](?:\w|::)*(?:<[\w\s,*:]*>)?(\s+[A-Za-z_](?:\w|::)*(?:<[\w\s,*:]*>)?)*[\s*&]+[A-Za-z_]\w*(\s*\[[^\]]*\])?(\s*,\s*\**\s*[A-Za-z_]\w*(\s*\[[^\]]*\])?)*\s*(=.*)?;$/.test(l)) return true;
  // A function head: "static int foo(int a) {"
  if (/^[A-Za-z_][\w\s*&:<>]*\s[*&]?[A-Za-z_][\w:]*\s*\([^)]*\)\s*(const\s*)?\{$/.test(l)) return true;
  if (style === 'hash' || style === 'dash') {
    if (/^(import\s+[\w.]+(\s+as\s+\w+)?(\s*,\s*[\w.]+(\s+as\s+\w+)?)*|from\s+[\w.]+\s+import\s+[\w*, ()]+)$/.test(l)) return true;
    if (/^(def|class)\s+\w+\s*(\(.*\))?\s*(->\s*[\w.[\], ]+)?:$/.test(l)) return true;
    if (/^(if|elif|while|for|with|except|try|else|finally)\b[^:]*:$/.test(l) && /[=<>!()[\].]|\bin\b|\bnot\b|^(try|else|finally):$/.test(l)) return true;
    // "if ready:", "while running:" — a condition of one name
    if (/^(if|elif|while)\s+(not\s+)?[A-Za-z_][\w.]*:$/.test(l)) return true;
    if (/^(return|yield|raise|del|assert|print)\b.+$/.test(l) && /[=()[\].]|\breturn\s+\w+$/.test(l)) return true;
    if (/^[A-Za-z_][\w.]*(\[[^\]]*\])?\s*(=|\+=|-=|\*=|\/=)\s*\S/.test(l) && !/^\w+\s*=\s*[A-Za-z]+\s+[A-Za-z]+/.test(l)) return true;
    if (/^[A-Za-z_][\w.]*\(.*\)$/.test(l)) return true;
    if (/^(end|fi|done|esac|end\s+if|end\s+loop)$/.test(l)) return true;
  }
  if (/^[A-Za-z_][\w.>-]*\(.*\)\s*;?$/.test(l) && /;$/.test(l)) return true;
  // A call over several lines: its first line ('fprintf(stderr, "…",') and its last ("a, b);").
  if (style === 'slash' && /^[A-Za-z_][\w.>[\]-]*\(\s*[\w&*"'].*,$/.test(l) && !proseRun(bare)) return true;
  if (style === 'slash' && /^[\w\s,.[\]>*&()+-]*\);$/.test(l) && /\w/.test(l)) return true;
  return null;
}

/**
 * One comment (a block comment, or line comments in a row): its code lines are
 * code turned off, also after a line of explanation. A documentation comment
 * with prose, or one that announces an example, shows code instead of
 * turning it off.
 */
function blockIsCode(lines, opts = {}) {
  const style = opts.style || 'slash';
  let code = 0;
  let prose = 0;
  const kinds = lines.map((line) => lineKind(line, style));
  const indent = (line) => String(line).match(/^\s*/)[0].replace(/\t/g, '    ').length;
  // Code that is all indented below the prose of the same comment is an example
  // in an explanation. Code at the prose's own indent is code turned off, and so
  // is everything nested under it ("// if (x)" then "//     y = 1;").
  const proseIndent = Math.min(Infinity, ...lines.filter((_, i) => kinds[i] === false).map(indent));
  const examplesOnly = lines.every((line, i) => kinds[i] !== true || indent(line) >= proseIndent + 2);
  const codeLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i] === true && !examplesOnly) { code++; codeLines.push(i); } else if (kinds[i] === false) prose++;
  }
  const all = lines.join('\n');
  const example = /[@\\]code\b|```|\b(usage|examples?|e\.g\.|for example|output|sample)\s*:/i.test(all);
  // Code lines after an explanation ("// not ready yet:" then "// start();") are still code turned off.
  const isCode = code > 0 && !example && !(opts.doc && prose > 0);
  return { code, prose, isCode, codeLines };
}

// The lines of each file of a C/C++ unit (unit.sources: [file, text] pairs).
const UNIT_LINES = new WeakMap();
function linesOf(unit, file) {
  if (!unit || typeof unit !== 'object') return null;
  let map = UNIT_LINES.get(unit);
  if (!map) { map = new Map(); UNIT_LINES.set(unit, map); }
  if (!map.has(file)) {
    let text = null;
    // unit.sources: a Map of file -> { text, … } (or plain text).
    for (const [f, src] of unit.sources || []) if (f === file) { text = src && typeof src === 'object' ? src.text : src; break; }
    map.set(file, text == null ? null : String(text).split(/\r?\n/));
  }
  return map.get(file);
}

/**
 * A comment of the C/C++ front end ({ value, style, line, col, file }) judged
 * by the shared detector, for the MISRA / CERT engines' own rules. A comment
 * after #endif, #else or #elif on the same line names the condition and is
 * not code; a documentation comment (/** … *\/, /*! … *\/, ///, //!) with
 * prose shows code instead of turning it off.
 */
function cComment(c, unit) {
  const none = { code: 0, prose: 0, isCode: false, codeLines: [] };
  const lines = linesOf(unit, c.file);
  const lineText = lines ? lines[(c.line || 1) - 1] || '' : '';
  const before = lineText.slice(0, Math.max(0, (c.col || 1) - 1));
  if (/^\s*#\s*(endif|else|elif)\b/.test(before)) return none;
  const v = String(c.value || '');
  const doc = /^\/(\*\*(?![*/])|\*!|\/\/(?!\/)|\/!)/.test(v);
  let body = c.style === 'block' || v.startsWith('/*') ? v.slice(2, v.endsWith('*/') ? -2 : undefined) : v.slice(2);
  if (doc) body = body.replace(/^[*!/]/, '');
  // " * text": the star and one space go; a tab after it is the indent of an example.
  return blockIsCode(body.split(/\r?\n/).map((l) => l.replace(/^\s*\*(?!\/) ?/, '')), { style: 'slash', doc });
}

module.exports = { lineKind, blockIsCode, proseRun, cComment };
