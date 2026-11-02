/**
 * A single two-way comparison held on the server.
 *
 * Rows are computed once and handed to the renderer in windows, so a 200k-line pair
 * costs one diff and a few hundred rows of JSON per scroll rather than the whole
 * document. Binary pairs skip the line diff entirely and are read as a hex dump.
 */
import { binaryStats, hexRows, isBinary, type BinaryStats, type HexRow } from "./binary.js";
import {
  blockStarts,
  computeRows,
  documentFromRows,
  wordSpans,
  type CompareOptions,
  type DiffDocument,
  type DiffRow,
} from "./lineDiff.js";
import { ApiError } from "./errors.js";
import { formatLines, type FormatId } from "./formats.js";
import {
  INITIAL_STATE,
  hasSignificanceRules,
  languageFor,
  significantLines,
  tokenize,
  type LexState,
  type Token,
} from "./grammar.js";
import { decode, splitBody, stripBom } from "./textFile.js";

export type CompareSide = {
  /** Display label: the file path, or `HEAD:src/app.ts` for a git revision. */
  label: string;
  /** Absolute path when the side came from disk, otherwise null. */
  path: string | null;
  data: Uint8Array;
  size: number;
  modified: number | null;
  /** True when the side does not exist (added or deleted file). */
  missing: boolean;
};

export type SideSummary = {
  label: string;
  path: string | null;
  size: number;
  modified: number | null;
  missing: boolean;
  lines: number;
  newline: "\n" | "\r\n";
};

export type CompareSummary = {
  id: string;
  mode: "text" | "binary";
  left: SideSummary;
  right: SideSummary;
  rowCount: number;
  added: number;
  removed: number;
  modified: number;
  /** Row indexes where each run of differences starts. */
  diffBlocks: number[];
  /** Per-row kinds, compact enough to drive the overview bar without fetching rows. */
  kinds: string;
  identical: boolean;
  differentBytes: number;
};

export type TextRow = DiffRow & {
  /** Changed character ranges inside a modified row, when word highlighting is on. */
  leftSpans?: { start: number; end: number }[];
  rightSpans?: { start: number; end: number }[];
  /** Syntax spans, when highlighting is on. Only the non-plain ones are sent. */
  leftTokens?: Token[];
  rightTokens?: Token[];
};

/** `kinds` is sent as one character per row: s(ame) a(dded) r(emoved) m(odified). */
const KIND_CODE: Record<string, string> = { same: "s", added: "a", removed: "r", modified: "m" };

export class CompareSession {
  readonly id: string;
  readonly mode: "text" | "binary";
  readonly left: CompareSide;
  readonly right: CompareSide;
  readonly options: CompareOptions;

  private readonly leftLines: string[];
  private readonly rightLines: string[];
  private readonly leftNewline: "\n" | "\r\n";
  private readonly rightNewline: "\n" | "\r\n";
  private readonly document: DiffDocument | null;
  private readonly binary: BinaryStats | null;
  /** The language id, so the renderer highlights with the same grammar. */
  readonly language: string;
  /** Which reader produced the lines — `text` when the file is compared as itself. */
  readonly format: FormatId;
  /** Lexer state per line, worked out once and only when highlighting asks for it. */
  private leftLex: LexState[] | null = null;
  private rightLex: LexState[] | null = null;

  constructor(id: string, left: CompareSide, right: CompareSide, options: CompareOptions = {}) {
    this.id = id;
    this.left = left;
    this.right = right;
    this.options = options;
    /*
     * A format reader comes first. An MP3 or an executable is binary and would
     * otherwise be a hex dump; a CSV is text and would otherwise compare as noise.
     * Either way, if a reader can make lines of the pair, those lines become the
     * comparison, and everything downstream — the diff, the search, the printing —
     * works on them exactly as it would on a text file.
     */
    const rendered = options.forceHex
      ? null
      : formatLines(
        { file: left.path ?? left.label, data: left.data },
        { file: right.path ?? right.label, data: right.data },
        { format: options.format, table: options.table },
      );

    this.format = rendered?.format ?? "text";
    this.mode = !rendered && (options.forceHex || isBinary(left.data) || isBinary(right.data))
      ? "binary"
      : "text";
    // A rendering has no grammar of its own; it is a report, not source.
    this.language = rendered ? "plain" : languageFor(left.path ?? left.label).id;

    if (this.mode === "binary") {
      this.leftLines = [];
      this.rightLines = [];
      this.leftNewline = "\n";
      this.rightNewline = "\n";
      this.document = null;
      this.binary = binaryStats(left.data, right.data);
      return;
    }

    const leftText = stripBom(decode(left.data));
    const rightText = stripBom(decode(right.data));
    this.leftLines = rendered ? rendered.left : splitBody(leftText).lines;
    this.rightLines = rendered ? rendered.right : splitBody(rightText).lines;
    this.leftNewline = leftText.includes("\r\n") ? "\r\n" : "\n";
    this.rightNewline = rightText.includes("\r\n") ? "\r\n" : "\n";
    // The grammar rules are applied to whole files, because a block comment is only
    // recognisable with the lines above it in hand. The result is the alignment key;
    // the rows still carry what the file actually says.
    const language = languageFor(left.path ?? left.label);
    const keys = hasSignificanceRules(options)
      ? {
        left: significantLines(this.leftLines, language, options),
        right: significantLines(this.rightLines, languageFor(right.path ?? right.label), options),
      }
      : undefined;

    this.document = documentFromRows(computeRows(this.leftLines, this.rightLines, options, keys));
    this.binary = null;
  }

  /**
   * The lexer state each line of one side begins in.
   *
   * The window of rows the renderer asks for can start in the middle of a block
   * comment, and it has no way of knowing that from the lines it was sent. Computing
   * it here once per file, and sending it with the rows, is what lets the highlighter
   * colour a window correctly without being given the whole file.
   */
  private lexStates(side: "left" | "right"): LexState[] {
    const cached = side === "left" ? this.leftLex : this.rightLex;
    if (cached) return cached;

    const lines = side === "left" ? this.leftLines : this.rightLines;
    const source = side === "left" ? this.left : this.right;
    const language = languageFor(source.path ?? source.label);
    const states: LexState[] = [];
    let state = INITIAL_STATE;
    for (const line of lines) {
      states.push(state);
      state = tokenize(line, language, state).next;
    }
    if (side === "left") this.leftLex = states;
    else this.rightLex = states;
    return states;
  }

  summary(): CompareSummary {
    const kinds = this.document
      ? this.document.rows.map((row) => KIND_CODE[row.kind]).join("")
      : (this.binary as BinaryStats).kinds.map((kind) => KIND_CODE[kind]).join("");
    const added = this.document?.added ?? this.binary?.added ?? 0;
    const removed = this.document?.removed ?? this.binary?.removed ?? 0;
    const modified = this.document?.modified ?? this.binary?.modified ?? 0;

    return {
      id: this.id,
      mode: this.mode,
      left: this.side(this.left, this.leftLines.length, this.leftNewline),
      right: this.side(this.right, this.rightLines.length, this.rightNewline),
      rowCount: this.rowCount,
      added,
      removed,
      modified,
      diffBlocks: this.document
        ? this.document.diffBlocks
        : blockStarts((this.binary as BinaryStats).kinds),
      kinds,
      identical: added === 0 && removed === 0 && modified === 0,
      differentBytes: this.binary?.differentBytes ?? 0,
    };
  }

  get rowCount(): number {
    return this.document ? this.document.rows.length : (this.binary as BinaryStats).rowCount;
  }

  /** One window of aligned text rows, with word spans attached when asked for. */
  rows(start: number, count: number, wordHighlight: boolean, syntax = false): TextRow[] {
    if (!this.document) return [];
    const from = Math.max(0, Math.min(start, this.document.rows.length));
    const to = Math.max(from, Math.min(from + count, this.document.rows.length));
    const language = syntax ? languageFor(this.left.path ?? this.left.label) : null;
    const leftStates = syntax ? this.lexStates("left") : null;
    const rightStates = syntax ? this.lexStates("right") : null;

    const slice: TextRow[] = [];
    for (let index = from; index < to; index++) {
      const row = this.document.rows[index];
      const next: TextRow = { ...row };

      if (wordHighlight && row.kind === "modified" && row.left !== null && row.right !== null) {
        const spans = wordSpans(row.left, row.right);
        next.leftSpans = spans.left;
        next.rightSpans = spans.right;
      }

      if (language && !isPlainId(language.id)) {
        if (row.left !== null && row.leftNo !== null && leftStates) {
          next.leftTokens = colourOf(row.left, language, leftStates[row.leftNo - 1]);
        }
        if (row.right !== null && row.rightNo !== null && rightStates) {
          next.rightTokens = colourOf(row.right, language, rightStates[row.rightNo - 1]);
        }
      }

      slice.push(next);
    }
    return slice;
  }

  hex(start: number, count: number): HexRow[] {
    if (!this.binary) return [];
    const total = this.binary.rowCount;
    const from = Math.max(0, Math.min(start, total));
    const to = Math.max(from, Math.min(from + count, total));
    return hexRows(this.left.data, this.right.data, from, to - from);
  }

  /** Plain text of one side over a row range — what Copy puts on the clipboard. */
  text(side: "left" | "right" | "both", start: number, count: number): string {
    if (!this.document) {
      return this.hex(start, count)
        .map((row) => {
          const dump = (bytes: (number | null)[]) =>
            bytes.map((byte) => (byte === null ? ".." : byte.toString(16).toUpperCase().padStart(2, "0"))).join(" ");
          const offset = row.offset.toString(16).toUpperCase().padStart(8, "0");
          if (side === "left") return `${offset}  ${dump(row.left.bytes)}  ${row.left.ascii}`;
          if (side === "right") return `${offset}  ${dump(row.right.bytes)}  ${row.right.ascii}`;
          return `${offset}  ${dump(row.left.bytes)}  |  ${dump(row.right.bytes)}`;
        })
        .join("\n");
    }
    return this.rows(start, count, false)
      .map((row) => {
        if (side === "left") return row.left ?? "";
        if (side === "right") return row.right ?? "";
        return `${row.left ?? ""}\t${row.right ?? ""}`;
      })
      .join("\n");
  }

  /** Every line of one side, used by the print document builder. */
  allRows(): TextRow[] {
    return this.document ? this.document.rows.map((row) => ({ ...row })) : [];
  }

  /** The file's own lines, as read. */
  sideLines(side: "left" | "right"): string[] {
    return side === "left" ? [...this.leftLines] : [...this.rightLines];
  }

  newlineOf(side: "left" | "right"): "\n" | "\r\n" {
    return side === "left" ? this.leftNewline : this.rightNewline;
  }

  /**
   * `target` rebuilt with the given rows taken from the other side.
   *
   * This is the "copy to the other side" of a folder-and-file comparison tool: a row
   * whose source side is blank disappears from the target (a deletion), and a row
   * whose target side is blank gains the source's line (an insertion). Rows are
   * walked in order, so the result is the target file with exactly those changes.
   */
  takeRows(target: "left" | "right", rows: readonly number[]): string[] {
    const document = this.editableDocument();
    const wanted = new Set(rows);
    const source = target === "left" ? "right" : "left";
    const lines: string[] = [];
    document.rows.forEach((row, index) => {
      const text = wanted.has(index) ? row[source] : row[target];
      if (text !== null && text !== undefined) lines.push(text);
    });
    return lines;
  }

  /* ------------------------------------------------------ search */

  /**
   * Every row that matches, over the whole file rather than the window on screen.
   *
   * The renderer only ever holds a few hundred rows, so a search done there would
   * quietly stop at the edge of what had been scrolled past. Searching here is also
   * what lets Replace All mean all.
   */
  search(needle: string, options: SearchOptions = {}): number[] {
    if (!this.document || !needle) return [];
    const match = matcher(needle, options);
    if (!match) return [];

    const sides: ("left" | "right")[] = options.side === "left"
      ? ["left"]
      : options.side === "right" ? ["right"] : ["left", "right"];

    const found: number[] = [];
    this.document.rows.forEach((row, index) => {
      for (const side of sides) {
        const text = row[side];
        if (text !== null && text !== undefined && match(text)) {
          found.push(index);
          return;
        }
      }
    });
    return found;
  }

  /**
   * One side with every match replaced, and how many were replaced.
   *
   * The lines come back rather than being written: the caller writes the file, so
   * the same path handles a replacement, an in-place edit and taking rows from the
   * other side, and all three are undoable in the same way.
   */
  replaceAll(
    side: "left" | "right",
    needle: string,
    replacement: string,
    options: SearchOptions = {},
  ): { lines: string[]; replaced: number } {
    this.editableDocument();
    const pattern = regexFor(needle, options);
    if (!pattern) return { lines: side === "left" ? [...this.leftLines] : [...this.rightLines], replaced: 0 };

    let replaced = 0;
    const lines = (side === "left" ? this.leftLines : this.rightLines).map((line) => {
      pattern.lastIndex = 0;
      const next = line.replace(pattern, (...args) => {
        replaced += 1;
        // `$1` and friends work, because the replacement goes through the same
        // machinery a plain `String.replace` would use.
        return expand(replacement, args as unknown[]);
      });
      return next;
    });
    return { lines, replaced };
  }

  /** One side rebuilt with a single row's text replaced — the in-place edit. */
  replaceRow(side: "left" | "right", rowIndex: number, text: string): string[] {
    const document = this.editableDocument();
    const lines: string[] = [];
    document.rows.forEach((row, index) => {
      const value = index === rowIndex ? text : row[side];
      if (value !== null && value !== undefined) lines.push(value);
    });
    return lines;
  }

  /**
   * The document, when writing to it is allowed. Refuses when what is on screen is a reading of the file rather than
   * the file. Saving the tags of an MP3 back over the MP3 would destroy it.
   */
  private editableDocument(): DiffDocument {
    if (!this.document) throw new ApiError("A binary comparison cannot be edited.", "BINARY", 400);
    if (this.format !== "text") {
      throw new ApiError(
        "This comparison shows what the file means, not what it says, so it cannot be edited here.",
        "NOT_EDITABLE",
        400,
      );
    }
    return this.document;
  }

  private side(side: CompareSide, lines: number, newline: "\n" | "\r\n"): SideSummary {
    return {
      label: side.label,
      path: side.path,
      size: side.size,
      modified: side.modified,
      missing: side.missing,
      lines,
      newline,
    };
  }
}


/** Plain text has no grammar, so highlighting it would only cost bandwidth. */
function isPlainId(id: string): boolean {
  return id === "plain";
}

/**
 * The spans worth colouring. The plain runs are dropped: they are the gaps between
 * the others, and the renderer fills them in, so sending them would roughly double
 * the size of a row for no information.
 */
function colourOf(line: string, language: ReturnType<typeof languageFor>, state: LexState | undefined): Token[] {
  return tokenize(line, language, state ?? INITIAL_STATE).tokens
    .filter((token) => token.kind !== "plain");
}

/* ------------------------------------------------------------------ *
 * Searching
 * ------------------------------------------------------------------ */

export type SearchOptions = {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  /** Which side to look at; both by default. */
  side?: "left" | "right" | "both";
};

/** A predicate for one line, or null when the pattern itself is unusable. */
function matcher(needle: string, options: SearchOptions): ((line: string) => boolean) | null {
  const pattern = regexFor(needle, options);
  if (!pattern) return null;
  return (line: string) => {
    pattern.lastIndex = 0;
    return pattern.test(line);
  };
}

/**
 * The pattern, built once.
 *
 * A bad regular expression is the user still typing, not an error worth a dialog, so
 * it yields null and the search simply finds nothing until the expression is
 * finished.
 */
function regexFor(needle: string, options: SearchOptions): RegExp | null {
  if (!needle) return null;
  const source = options.regex ? needle : escapeRegex(needle);
  // Two backslashes: in a template literal a single `\b` is the backspace
  // character, and the pattern would then look for that instead of a word edge.
  const body = options.wholeWord ? `\\b(?:${source})\\b` : source;
  try {
    return new RegExp(body, options.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

/** The regex metacharacters, as a set: a character class here would need to be
 *  escaped twice over and is unreadable for it. */
const REGEX_SPECIAL = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")",
  "|", "[", "]", "\\", "/"]);

function escapeRegex(value: string): string {
  let out = "";
  for (const character of value) out += REGEX_SPECIAL.has(character) ? "\\" + character : character;
  return out;
}

/** `$1`, `$&` and `$$` in a replacement, resolved against one match. */
function expand(replacement: string, args: unknown[]): string {
  const groups = args.slice(0, -2) as string[];
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (whole, token: string) => {
    if (token === "$") return "$";
    if (token === "&") return groups[0] ?? "";
    const index = Number(token);
    return groups[index] ?? whole;
  });
}
