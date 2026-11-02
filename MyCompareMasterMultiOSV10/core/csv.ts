/**
 * Delimited tables: reading them, and laying them out so two of them can be
 * compared line by line.
 *
 * A CSV compared as text is nearly useless. One column widened, one row inserted, a
 * different quoting style, and every line reads as changed. What makes a table
 * comparison work is comparing *cells*: parse both sides, line the columns up to the
 * same width, and — when the rows have a key — put the rows in key order so an
 * insertion in the middle does not shift everything below it.
 *
 * The parser is RFC 4180: quoted fields, doubled quotes inside them, and newlines
 * inside quotes. The delimiter is detected rather than assumed, because a `.csv`
 * from a European spreadsheet is usually semicolon-separated.
 */

export type Table = {
  rows: string[][];
  /** The delimiter that was found, so the table can be written back as it came. */
  delimiter: string;
  /** True when the first row looks like names rather than data. */
  hasHeader: boolean;
};

export type TableOptions = {
  /** Force a delimiter instead of detecting one. */
  delimiter?: string;
  /**
   * Columns, by index, whose values identify a row. Rows are then matched and
   * ordered by them, so an insertion does not shift everything after it.
   */
  keyColumns?: number[];
  /** Treat the first row as names, rather than guessing. */
  header?: boolean;
  /** Trim each cell before comparing, which most spreadsheets' padding deserves. */
  trimCells?: boolean;
};

const DELIMITERS = [",", ";", "\t", "|"];

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

/**
 * The delimiter that divides the first few lines most consistently.
 *
 * Counting occurrences is not enough on its own — a file full of prose commas would
 * win — so the test is which character gives the same number of fields on every one
 * of the first lines. A table is regular; prose is not.
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 20);
  if (sample.length === 0) return ",";

  let best = ",";
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => splitLine(line, delimiter).length);
    const fields = counts[0];
    if (fields < 2) continue;
    const consistent = counts.every((count) => count === fields);
    // More columns is a better fit, but only among the consistent candidates.
    const score = (consistent ? 1000 : 0) + fields;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

export function parseTable(text: string, options: TableOptions = {}): Table {
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let at = 0;

  const endField = () => {
    row.push(options.trimCells ? field.trim() : field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (at < text.length) {
    const character = text[at];

    if (quoted) {
      if (character === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[at + 1] === '"') {
          field += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      field += character;
      at += 1;
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
      at += 1;
      continue;
    }
    if (character === delimiter) {
      endField();
      at += 1;
      continue;
    }
    if (character === "\r") {
      at += 1;
      continue;
    }
    if (character === "\n") {
      endRow();
      at += 1;
      continue;
    }
    field += character;
    at += 1;
  }

  // A file ending without a newline still has a last row; one ending with a newline
  // does not have an extra empty one.
  if (field !== "" || row.length > 0) endRow();

  return {
    rows,
    delimiter,
    hasHeader: options.header ?? looksLikeHeader(rows),
  };
}

/** One line into fields, for delimiter detection — quotes included. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let at = 0; at < line.length; at++) {
    const character = line[at];
    if (quoted) {
      if (character === '"' && line[at + 1] === '"') {
        at += 1;
        continue;
      }
      if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === delimiter) {
      fields.push(field);
      field = "";
      continue;
    }
    field += character;
  }
  fields.push(field);
  return fields;
}

/**
 * A first row of non-numeric, non-empty, distinct values over a body that has
 * numbers in it is a header. It is a guess, and the setting overrides it.
 */
function looksLikeHeader(rows: readonly string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0];
  if (first.some((cell) => cell.trim() === "")) return false;
  if (new Set(first.map((cell) => cell.trim().toLowerCase())).size !== first.length) return false;
  if (first.some((cell) => isNumeric(cell))) return false;
  return rows.slice(1, 6).some((row) => row.some((cell) => isNumeric(cell)));
}

function isNumeric(cell: string): boolean {
  const value = cell.trim();
  return value !== "" && Number.isFinite(Number(value));
}

/* ------------------------------------------------------------------ *
 * Laying it out
 * ------------------------------------------------------------------ */

/**
 * The table as fixed-width lines, with both sides' column widths taken into account
 * so the two comparisons line up with each other.
 *
 * Passing `widths` in is what makes a pair of tables comparable: rendered
 * independently, a column that is wider on one side would push every cell after it
 * along and make the whole row read as changed.
 */
export function renderTable(table: Table, widths: number[]): string[] {
  return table.rows.map((row) => renderRow(row, widths));
}

function renderRow(row: readonly string[], widths: readonly number[]): string {
  const cells: string[] = [];
  for (let index = 0; index < widths.length; index++) {
    const cell = row[index] ?? "";
    cells.push(cell.padEnd(widths[index]));
  }
  return cells.join(" | ").replace(/\s+$/, "");
}

/** The widest cell in each column, over both tables and capped so one essay cell
 *  cannot make every line a thousand characters. */
export function columnWidths(tables: readonly Table[], cap = 60): number[] {
  const widths: number[] = [];
  for (const table of tables) {
    for (const row of table.rows) {
      row.forEach((cell, index) => {
        widths[index] = Math.min(cap, Math.max(widths[index] ?? 0, cell.length));
      });
    }
  }
  return widths;
}

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

/**
 * The rows in key order, so two tables that hold the same records in a different
 * order compare as equal, and an inserted record is one added line rather than a
 * shift of everything below it.
 *
 * The header stays where it is — it is not a record — and rows with no key keep
 * their original order at the end, because sorting them would be arbitrary.
 */
export function sortByKey(table: Table, keyColumns: readonly number[]): Table {
  if (keyColumns.length === 0) return table;
  const start = table.hasHeader ? 1 : 0;
  const header = table.rows.slice(0, start);
  const body = table.rows.slice(start);

  const keyed = body.map((row, index) => ({ row, index, key: keyOf(row, keyColumns) }));
  keyed.sort((a, b) => {
    if (a.key === "" && b.key === "") return a.index - b.index;
    if (a.key === "") return 1;
    if (b.key === "") return -1;
    return a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "accent" })
      || a.index - b.index;
  });

  return { ...table, rows: [...header, ...keyed.map((item) => item.row)] };
}

function keyOf(row: readonly string[], keyColumns: readonly number[]): string {
  return keyColumns.map((index) => (row[index] ?? "").trim()).join(" ");
}

/**
 * Both tables as lines, ready to be compared: parsed, optionally reordered by key,
 * and laid out to the same column widths.
 */
export function tableLines(
  leftText: string,
  rightText: string,
  options: TableOptions = {},
): { left: string[]; right: string[] } {
  const parse = (text: string) => {
    const table = parseTable(text, options);
    return options.keyColumns?.length ? sortByKey(table, options.keyColumns) : table;
  };
  const left = parse(leftText);
  const right = parse(rightText);
  const widths = columnWidths([left, right]);
  return { left: renderTable(left, widths), right: renderTable(right, widths) };
}
