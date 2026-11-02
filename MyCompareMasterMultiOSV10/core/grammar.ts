/**
 * A small lexer, and the two things it is for.
 *
 * Beyond Compare's best trick is knowing what a line *means* rather than only what
 * it says: that `i++; // fixed` and `i++;` differ only in a comment, that reindenting
 * a block changes nothing, that `"a"` and `'a'` are the same string in a language
 * where both quotes work. Doing any of that needs the line broken into tokens, and
 * once it is broken into tokens it can also be coloured. So one lexer serves both:
 *
 *   `tokenize`   — spans for syntax highlighting
 *   `significant`— the text a line is compared by, with the unimportant parts gone
 *
 * The lexer is deliberately shallow. It does not parse: it recognises comments,
 * strings, numbers, keywords and everything else, which is all either job needs, and
 * it is one pass per line with a small carried state so a block comment or a template
 * string can span lines without the file having to be read twice.
 */

export type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "punctuation";

export type Token = { start: number; end: number; kind: TokenKind };

/** What a line leaves open for the next one. */
export type LexState = {
  /** Inside a block comment, and the delimiter that will close it. */
  comment: string | null;
  /** Inside a multi-line string, and the quote that will close it. */
  string: string | null;
};

export const INITIAL_STATE: LexState = { comment: null, string: null };

export type Language = {
  id: string;
  name: string;
  extensions: string[];
  lineComments: string[];
  /** `[open, close]` pairs. */
  blockComments: [string, string][];
  /** Quotes that end at the end of a line unless escaped. */
  quotes: string[];
  /** Quotes that may run over several lines. */
  multilineQuotes: string[];
  keywords: string[];
  /** A backslash before a quote escapes it. False for the likes of Pascal. */
  backslashEscapes: boolean;
};

/* ------------------------------------------------------------------ *
 * The languages
 * ------------------------------------------------------------------ */

const C_KEYWORDS = [
  "break", "case", "catch", "class", "const", "continue", "default", "delete", "do",
  "else", "enum", "export", "extends", "false", "finally", "for", "function", "goto",
  "if", "import", "in", "instanceof", "interface", "let", "new", "null", "package",
  "private", "protected", "public", "return", "static", "struct", "switch", "this",
  "throw", "true", "try", "typedef", "typeof", "union", "var", "void", "while", "yield",
  "async", "await", "int", "long", "float", "double", "char", "bool", "boolean",
  "string", "unsigned", "signed", "sizeof", "namespace", "using", "template", "virtual",
  "override", "final", "abstract", "implements", "extern", "inline", "register", "volatile",
];

const PY_KEYWORDS = [
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
  "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
  "True", "try", "while", "with", "yield",
];

const SH_KEYWORDS = [
  "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in",
  "local", "return", "select", "then", "until", "while", "export", "readonly", "echo",
];

const SQL_KEYWORDS = [
  "select", "from", "where", "insert", "into", "values", "update", "set", "delete",
  "create", "table", "alter", "drop", "index", "view", "join", "inner", "left", "right",
  "outer", "on", "group", "by", "order", "having", "union", "all", "distinct", "as",
  "and", "or", "not", "null", "is", "in", "like", "between", "case", "when", "then",
  "else", "end", "primary", "key", "foreign", "references", "constraint", "default",
];

export const LANGUAGES: Language[] = [
  {
    id: "c-like",
    name: "C-like",
    extensions: [
      "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "java", "js", "mjs", "cjs",
      "jsx", "ts", "mts", "cts", "tsx", "go", "rs", "swift", "kt", "kts", "scala",
      "php", "dart", "groovy", "m", "mm", "proto", "glsl", "hlsl", "json5",
    ],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    quotes: ["\"", "'"],
    multilineQuotes: ["`"],
    keywords: C_KEYWORDS,
    backslashEscapes: true,
  },
  {
    id: "json",
    name: "JSON",
    extensions: ["json", "jsonc", "webmanifest"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    quotes: ["\""],
    multilineQuotes: [],
    keywords: ["true", "false", "null"],
    backslashEscapes: true,
  },
  {
    id: "python",
    name: "Python",
    extensions: ["py", "pyw", "pyi"],
    lineComments: ["#"],
    blockComments: [],
    quotes: ["\"", "'"],
    multilineQuotes: ["\"\"\"", "'''"],
    keywords: PY_KEYWORDS,
    backslashEscapes: true,
  },
  {
    id: "shell",
    name: "Shell",
    extensions: ["sh", "bash", "zsh", "ksh", "fish", "bashrc", "profile"],
    lineComments: ["#"],
    blockComments: [],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: SH_KEYWORDS,
    backslashEscapes: true,
  },
  {
    id: "ruby",
    name: "Ruby",
    extensions: ["rb", "rake", "gemspec"],
    lineComments: ["#"],
    blockComments: [["=begin", "=end"]],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: ["def", "end", "class", "module", "if", "elsif", "else", "unless", "while",
      "until", "do", "begin", "rescue", "ensure", "yield", "return", "nil", "true", "false", "self"],
    backslashEscapes: true,
  },
  {
    id: "config",
    name: "Config",
    extensions: ["yml", "yaml", "toml", "ini", "cfg", "conf", "properties", "env",
      "gitignore", "dockerignore", "editorconfig"],
    lineComments: ["#", ";"],
    blockComments: [],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: ["true", "false", "null", "yes", "no", "on", "off"],
    backslashEscapes: true,
  },
  {
    id: "sql",
    name: "SQL",
    extensions: ["sql", "ddl", "dml"],
    lineComments: ["--"],
    blockComments: [["/*", "*/"]],
    quotes: ["'", "\""],
    multilineQuotes: [],
    keywords: SQL_KEYWORDS,
    backslashEscapes: false,
  },
  {
    id: "css",
    name: "CSS",
    extensions: ["css", "scss", "sass", "less", "styl"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: ["important", "media", "import", "keyframes", "supports", "charset", "font-face"],
    backslashEscapes: true,
  },
  {
    id: "markup",
    name: "Markup",
    extensions: ["html", "htm", "xml", "xhtml", "svg", "vue", "xaml", "xsd", "plist", "rss"],
    lineComments: [],
    blockComments: [["<!--", "-->"]],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: [],
    backslashEscapes: false,
  },
  {
    id: "lua",
    name: "Lua",
    extensions: ["lua"],
    lineComments: ["--"],
    blockComments: [["--[[", "]]"]],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: ["and", "break", "do", "else", "elseif", "end", "false", "for", "function",
      "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while"],
    backslashEscapes: true,
  },
  {
    id: "batch",
    name: "Batch",
    extensions: ["bat", "cmd"],
    lineComments: ["rem", "::"],
    blockComments: [],
    quotes: ["\""],
    multilineQuotes: [],
    keywords: ["if", "else", "for", "goto", "call", "set", "echo", "exit", "setlocal", "endlocal"],
    backslashEscapes: false,
  },
  {
    id: "powershell",
    name: "PowerShell",
    extensions: ["ps1", "psm1", "psd1"],
    lineComments: ["#"],
    blockComments: [["<#", "#>"]],
    quotes: ["\"", "'"],
    multilineQuotes: [],
    keywords: ["if", "else", "elseif", "foreach", "for", "while", "function", "param",
      "return", "switch", "try", "catch", "finally", "throw", "begin", "process", "end"],
    backslashEscapes: false,
  },
];

const PLAIN: Language = {
  id: "plain",
  name: "Plain text",
  extensions: [],
  lineComments: [],
  blockComments: [],
  quotes: [],
  multilineQuotes: [],
  keywords: [],
  backslashEscapes: false,
};

const BY_EXTENSION = new Map<string, Language>();
for (const language of LANGUAGES) {
  for (const extension of language.extensions) BY_EXTENSION.set(extension, language);
}

/** The language for a file name, or plain text when none of them claims it. */
export function languageFor(file: string | null | undefined): Language {
  if (!file) return PLAIN;
  const name = file.split(/[\\/]/).pop() ?? "";
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : name.toLowerCase();
  return BY_EXTENSION.get(extension) ?? PLAIN;
}

export function isPlain(language: Language): boolean {
  return language.id === "plain";
}

/* ------------------------------------------------------------------ *
 * Lexing
 * ------------------------------------------------------------------ */

const KEYWORD_SETS = new Map<string, Set<string>>();
function keywordsOf(language: Language): Set<string> {
  let set = KEYWORD_SETS.get(language.id);
  if (!set) {
    set = new Set(language.keywords);
    KEYWORD_SETS.set(language.id, set);
  }
  return set;
}

const IDENTIFIER = /[A-Za-z_$][\w$-]*/y;
const NUMBER = /(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)/y;

/**
 * One line, broken into spans, plus the state the next line starts in.
 *
 * Adjacent spans of the same kind are merged, and plain runs are emitted rather than
 * one span per character — a 200-character line of code comes out as a handful of
 * spans, which is what makes it cheap enough to do while scrolling.
 */
export function tokenize(
  line: string,
  language: Language,
  state: LexState = INITIAL_STATE,
): { tokens: Token[]; next: LexState } {
  const tokens: Token[] = [];
  const keywords = keywordsOf(language);
  let comment = state.comment;
  let quote = state.string;
  let at = 0;
  let plainFrom = 0;

  const flushPlain = (to: number) => {
    if (to > plainFrom) tokens.push({ start: plainFrom, end: to, kind: "plain" });
  };
  const push = (start: number, end: number, kind: TokenKind) => {
    flushPlain(start);
    tokens.push({ start, end, kind });
    plainFrom = end;
  };

  // A block comment carried in from the line above runs until its closer.
  if (comment) {
    const close = line.indexOf(comment, 0);
    if (close === -1) {
      return { tokens: [{ start: 0, end: line.length, kind: "comment" }], next: { comment, string: null } };
    }
    push(0, close + comment.length, "comment");
    at = close + comment.length;
    comment = null;
  }

  // The same for a multi-line string.
  if (quote) {
    const close = findClose(line, 0, quote, language.backslashEscapes);
    if (close === -1) {
      return { tokens: [{ start: 0, end: line.length, kind: "string" }], next: { comment: null, string: quote } };
    }
    push(0, close + quote.length, "string");
    at = close + quote.length;
    quote = null;
  }

  while (at < line.length) {
    // A line comment swallows the rest of the line.
    const lineComment = language.lineComments.find((marker) => startsWithAt(line, marker, at));
    if (lineComment && isCommentHere(line, at, lineComment, language)) {
      push(at, line.length, "comment");
      at = line.length;
      break;
    }

    const block = language.blockComments.find(([open]) => startsWithAt(line, open, at));
    if (block) {
      const [open, close] = block;
      const end = line.indexOf(close, at + open.length);
      if (end === -1) {
        push(at, line.length, "comment");
        return { tokens, next: { comment: close, string: null } };
      }
      push(at, end + close.length, "comment");
      at = end + close.length;
      continue;
    }

    const multiline = language.multilineQuotes.find((marker) => startsWithAt(line, marker, at));
    if (multiline) {
      const end = findClose(line, at + multiline.length, multiline, language.backslashEscapes);
      if (end === -1) {
        push(at, line.length, "string");
        return { tokens, next: { comment: null, string: multiline } };
      }
      push(at, end + multiline.length, "string");
      at = end + multiline.length;
      continue;
    }

    const simple = language.quotes.find((marker) => startsWithAt(line, marker, at));
    if (simple) {
      const end = findClose(line, at + simple.length, simple, language.backslashEscapes);
      // An unterminated single-line string just ends with the line.
      const stop = end === -1 ? line.length : end + simple.length;
      push(at, stop, "string");
      at = stop;
      continue;
    }

    const code = line.charCodeAt(at);
    if (code >= 48 && code <= 57) {
      NUMBER.lastIndex = at;
      const match = NUMBER.exec(line);
      if (match) {
        push(at, at + match[0].length, "number");
        at += match[0].length;
        continue;
      }
    }

    IDENTIFIER.lastIndex = at;
    const word = IDENTIFIER.exec(line);
    if (word) {
      if (keywords.has(word[0]) || keywords.has(word[0].toLowerCase())) {
        push(at, at + word[0].length, "keyword");
      }
      at += word[0].length;
      continue;
    }

    at += 1;
  }

  flushPlain(line.length);
  return { tokens, next: { comment: null, string: null } };
}

function startsWithAt(line: string, marker: string, at: number): boolean {
  return line.startsWith(marker, at);
}

/**
 * Not every occurrence of a marker starts a comment.
 *
 * A word marker — Batch's `rem` — has to stand alone, or `foremost` becomes a
 * comment. And `#` or `;` has to follow whitespace or begin the line, which is the
 * rule the languages that use them actually have: `echo a#b` in a shell and
 * `key=a;b` in an ini file are values, not comments.
 */
function isCommentHere(line: string, at: number, marker: string, language: Language): boolean {
  void language;
  if (/^[a-z]+$/i.test(marker)) {
    const before = at === 0 ? " " : line[at - 1];
    const after = line[at + marker.length] ?? " ";
    return /\s/.test(before) && /[\s:]|^$/.test(after);
  }
  if (marker === "#" || marker === ";") {
    return at === 0 || /\s/.test(line[at - 1]);
  }
  return true;
}

/** The index of the closing quote, honouring backslash escapes. */
function findClose(line: string, from: number, quote: string, escapes: boolean): number {
  let at = from;
  while (at < line.length) {
    if (escapes && line[at] === "\\") {
      at += 2;
      continue;
    }
    if (line.startsWith(quote, at)) return at;
    at += 1;
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * What counts as a difference
 * ------------------------------------------------------------------ */

export type SignificanceOptions = {
  /** A line that differs only in its comments is not a difference. */
  ignoreComments?: boolean;
  /** Nor one that differs only in how it is indented or spaced. */
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  /** Nor one where the only change is `"a"` against `'a'`. */
  ignoreQuoteStyle?: boolean;
  /** Nor one where a number is written differently but means the same. */
  ignoreNumberFormat?: boolean;
};

export function hasSignificanceRules(options: SignificanceOptions | undefined): boolean {
  return Boolean(
    options
    && (options.ignoreComments || options.ignoreQuoteStyle || options.ignoreNumberFormat),
  );
}

/**
 * The text a line is compared by.
 *
 * Everything the rules call unimportant is removed or flattened, so two lines whose
 * only difference is unimportant come out identical here and are aligned as the same
 * line. The *displayed* text is untouched — this only ever decides what counts as
 * equal, which is what keeps "ignore comments" from being a destructive edit.
 */
export function significant(
  line: string,
  language: Language,
  options: SignificanceOptions,
  state: LexState = INITIAL_STATE,
): { text: string; next: LexState } {
  const { tokens, next } = tokenize(line, language, state);
  let out = "";

  for (const token of tokens) {
    const text = line.slice(token.start, token.end);
    if (token.kind === "comment") {
      if (options.ignoreComments) continue;
      out += text;
      continue;
    }
    if (token.kind === "string" && options.ignoreQuoteStyle) {
      out += normalizeQuotes(text);
      continue;
    }
    if (token.kind === "number" && options.ignoreNumberFormat) {
      out += normalizeNumber(text);
      continue;
    }
    out += text;
  }

  // A line that was nothing but a comment is now empty, and an empty line it is:
  // the diff will pair it with the other side's empty line rather than call it a
  // deletion. Trailing space left behind by a removed comment goes too.
  if (options.ignoreComments) out = out.replace(/\s+$/, "");
  if (options.ignoreWhitespace) out = out.replace(/\s+/g, " ").trim();
  if (options.ignoreCase) out = out.toLowerCase();

  return { text: out, next };
}

/** `'a'` and `"a"` both become `"a"`, so the quote style stops mattering. */
function normalizeQuotes(text: string): string {
  const quote = text[0];
  if (quote !== "'" && quote !== "\"") return text;
  const body = text.slice(1, text.endsWith(quote) && text.length > 1 ? -1 : undefined);
  return `"${body.replace(/\\(['"])/g, "$1")}"`;
}

/** `0x10`, `16`, `16.0` and `1_6` all become the same thing. */
function normalizeNumber(text: string): string {
  const cleaned = text.replace(/_/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? String(value) : cleaned;
}

/**
 * Runs `significant` down a whole file, carrying the lexer state from line to line.
 * This is what the comparison aligns on.
 */
export function significantLines(
  lines: readonly string[],
  language: Language,
  options: SignificanceOptions,
): string[] {
  let state = INITIAL_STATE;
  const result: string[] = [];
  for (const line of lines) {
    const outcome = significant(line, language, options, state);
    result.push(outcome.text);
    state = outcome.next;
  }
  return result;
}

/** Tokens for a whole file, carrying state, for the highlighter. */
export function tokenizeLines(lines: readonly string[], language: Language): Token[][] {
  let state = INITIAL_STATE;
  const result: Token[][] = [];
  for (const line of lines) {
    const outcome = tokenize(line, language, state);
    result.push(outcome.tokens);
    state = outcome.next;
  }
  return result;
}
