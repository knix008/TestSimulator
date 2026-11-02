/**
 * The user's guide, read from the two Markdown files at the project root.
 *
 * `doc/UsersGuide.md` (Korean) and `doc/UsersGuide.en.md` (English) are the one source: the
 * same text is read on GitHub and shown in the app's guide window, so the two can never
 * drift apart. Every `##` and `###` heading is preceded by an `<a id="..."></a>` line,
 * and the ids are the same in both languages — that is what lets the window keep its
 * place when the language changes, and what the unit test checks.
 *
 * This module only parses; it imports nothing from React or the DOM, so the tests can
 * run it under plain Node.
 */

export type GuideInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type GuideBlock =
  | { kind: "p"; text: string }
  | { kind: "h4"; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; children: string[] }[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  /** A screenshot; `src` is relative to the repository root, `alt` is its caption. */
  | { kind: "image"; src: string; alt: string };

export type GuideSection = {
  id: string;
  /** 1 for `##`, 2 for `###`. */
  level: 1 | 2;
  title: string;
  blocks: GuideBlock[];
  /** The id of the `##` section a `###` belongs to (its own id for a `##`). */
  parent: string;
};

export type GuideDocument = {
  title: string;
  /** What comes before the first section: the introduction. */
  intro: GuideBlock[];
  sections: GuideSection[];
};

/** Sections of the Markdown file that the app does not show (it has its own contents). */
const SKIPPED = new Set(["contents", "목차"]);

const ANCHOR = /^<a id="([^"]+)"><\/a>\s*$/;

export function parseGuide(markdown: string): GuideDocument {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const doc: GuideDocument = { title: "", intro: [], sections: [] };
  let blocks = doc.intro;
  let pendingId: string | null = null;
  let parent = "";
  let skipping = false;
  let index = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length > 0) blocks.push({ kind: "p", text: buffer.join(" ") });
    buffer.length = 0;
  };
  const paragraph: string[] = [];

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    const anchor = ANCHOR.exec(trimmed);
    if (anchor) {
      flushParagraph(paragraph);
      pendingId = anchor[1];
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      const depth = heading[1].length;
      const title = heading[2].trim();
      if (depth === 1) {
        doc.title = title;
      } else if (depth === 4) {
        if (!skipping) blocks.push({ kind: "h4", text: title });
      } else {
        const id = pendingId ?? slug(title);
        skipping = depth === 2 && SKIPPED.has(title.toLowerCase());
        if (!skipping) {
          if (depth === 2) parent = id;
          const section: GuideSection = { id, level: depth === 2 ? 1 : 2, title, blocks: [], parent: parent || id };
          doc.sections.push(section);
          blocks = section.blocks;
        } else {
          blocks = [];
        }
      }
      pendingId = null;
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph(paragraph);
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    if (trimmed === "" || /^-{3,}$/.test(trimmed)) {
      flushParagraph(paragraph);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      flushParagraph(paragraph);
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitRow(lines[index].trim()));
        index += 1;
      }
      const body = rows.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === ""));
      const [head = [], ...rest] = body;
      blocks.push({ kind: "table", head, rows: rest });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph(paragraph);
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: quote.join(" ") });
      continue;
    }

    const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item && item[1].length === 0) {
      flushParagraph(paragraph);
      const ordered = /\d/.test(item[2]);
      const items: { text: string; children: string[] }[] = [];
      while (index < lines.length) {
        const current = lines[index];
        const top = /^([-*]|\d+\.)\s+(.*)$/.exec(current);
        const nested = /^\s{2,}([-*]|\d+\.)\s+(.*)$/.exec(current);
        if (top) {
          items.push({ text: top[2].trim(), children: [] });
        } else if (nested && items.length > 0) {
          items[items.length - 1].children.push(nested[2].trim());
        } else if (/^\s{2,}\S/.test(current) && items.length > 0) {
          // A continuation line of the item (or of its last nested item) above.
          const last = items[items.length - 1];
          if (last.children.length > 0) last.children[last.children.length - 1] += ` ${current.trim()}`;
          else last.text += ` ${current.trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // A picture on a line of its own: `![caption](images/ko/start.png)`.
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
    if (image) {
      flushParagraph(paragraph);
      blocks.push({ kind: "image", alt: image[1].trim(), src: image[2] });
      index += 1;
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }
  flushParagraph(paragraph);
  return doc;
}

function splitRow(row: string): string[] {
  const inner = row.replace(/^\|/, "").replace(/\|$/, "");
  // A `|` inside back-ticks is part of the code, not a cell boundary.
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  let inDouble = false;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (inner.startsWith("``", i)) {
      // ``` `` Ctrl+` `` ```: a double back-tick span may hold a single back-tick.
      inDouble = !inDouble;
      current += "``";
      i += 1;
      continue;
    }
    if (char === "`" && !inDouble) inCode = !inCode;
    if (char === "|" && !inCode && !inDouble) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

/** `**bold**`, `` `code` `` and `[text](target)` — all the inline markup the guide uses. */
export function parseInline(text: string): GuideInline[] {
  const out: GuideInline[] = [];
  const pattern = /(``\s?(.+?)\s?``|`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|\*([^*\s][^*]*)\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (match[2] !== undefined) out.push({ kind: "code", text: match[2] });
    else if (match[3] !== undefined) out.push({ kind: "code", text: match[3] });
    else if (match[4] !== undefined) out.push({ kind: "bold", text: match[4] });
    else if (match[7] !== undefined) out.push({ kind: "em", text: match[7] });
    else out.push({ kind: "link", text: match[5], href: match[6] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The plain text of a block, without markup: what the search looks through. */
export function blockText(block: GuideBlock): string {
  const plain = (value: string) => parseInline(value).map((part) => part.text).join("");
  switch (block.kind) {
    case "p":
    case "h4":
    case "quote":
      return plain(block.text);
    case "code":
      return block.text;
    case "image":
      return plain(block.alt);
    case "list":
      return block.items.map((item) => [item.text, ...item.children].map(plain).join(" ")).join(" ");
    case "table":
      return [block.head, ...block.rows].map((row) => row.map(plain).join(" ")).join(" ");
  }
}

/** Every picture the document shows, as written (paths relative to the repository root). */
export function guideImages(doc: GuideDocument): string[] {
  return [...doc.intro, ...doc.sections.flatMap((section) => section.blocks)]
    .flatMap((block) => (block.kind === "image" ? [block.src] : []));
}

/** Everything a section says, for the search. */
export function sectionText(section: GuideSection): string {
  return `${section.title} ${section.blocks.map(blockText).join(" ")}`;
}
