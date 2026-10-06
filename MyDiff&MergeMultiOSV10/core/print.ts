/**
 * Print layout.
 *
 * The preview and the printed page are the same DOM, laid out by the geometry this
 * module computes: millimetres for the sheet and the margins, and a line count per
 * page derived from the font the user picked. Printing then only has to set `@page`
 * to the same size, so what the preview shows is what comes out.
 */
import type { PrintSettings } from "./settings.js";

export type PaperSize = PrintSettings["paper"];

/** Width and height in millimetres, portrait. */
export const PAPER: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export type PageGeometry = {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  /** Sheet size in millimetres, already rotated for landscape. */
  width: number;
  height: number;
  margin: number;
  /** Printable area in millimetres. */
  contentWidth: number;
  contentHeight: number;
  /** Rows that fit on one page, header and footer already deducted. */
  linesPerPage: number;
  /** Line height in millimetres, for the preview's own layout. */
  lineHeight: number;
};

const MM_PER_PT = 25.4 / 72;
/** Header and footer together, in millimetres. */
const CHROME_HEIGHT = 14;

export function geometry(settings: PrintSettings, fontSizePx: number): PageGeometry {
  const sheet = PAPER[settings.paper] ?? PAPER.A4;
  const landscape = settings.orientation === "landscape";
  const width = landscape ? sheet.height : sheet.width;
  const height = landscape ? sheet.width : sheet.height;
  const margin = Math.max(0, Math.min(settings.margin, 50));
  const contentWidth = Math.max(20, width - margin * 2);
  const chrome = settings.headerFooter ? CHROME_HEIGHT : 0;
  const contentHeight = Math.max(20, height - margin * 2 - chrome);
  // Printed text is a touch tighter than on screen; 1.25 em matches the panes.
  const lineHeight = fontSizePx * 0.75 * MM_PER_PT * 1.25;
  return {
    paper: settings.paper,
    orientation: settings.orientation,
    width,
    height,
    margin,
    contentWidth,
    contentHeight,
    linesPerPage: Math.max(5, Math.floor(contentHeight / lineHeight)),
    lineHeight,
  };
}

export type PrintRow = {
  left: string | null;
  right: string | null;
  leftNo: number | null;
  rightNo: number | null;
  kind: string;
};

export type PrintPage = {
  /** 1-based. */
  number: number;
  rows: PrintRow[];
};

export type PrintDocument = {
  title: string;
  subtitle: string;
  leftHeading: string;
  rightHeading: string;
  geometry: PageGeometry;
  pages: PrintPage[];
};

export function paginate(rows: readonly PrintRow[], perPage: number): PrintPage[] {
  if (rows.length === 0) return [{ number: 1, rows: [] }];
  const pages: PrintPage[] = [];
  for (let start = 0; start < rows.length; start += perPage) {
    pages.push({ number: pages.length + 1, rows: rows.slice(start, start + perPage) });
  }
  return pages;
}

/**
 * Parses what the user typed into the custom range box: `1-3, 5, 9-` and so on.
 * Out-of-range and reversed pieces are dropped rather than clamped, so a typo prints
 * nothing instead of printing the wrong thing. An empty or unparsable string means
 * every page.
 */
export function parsePageRange(input: string, total: number): number[] {
  const text = input.trim();
  if (!text) return allPages(total);

  const wanted = new Set<number>();
  for (const piece of text.split(/[,\s]+/).filter(Boolean)) {
    const match = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(piece);
    if (!match) continue;
    const [, fromText, dash, toText] = match;
    if (!dash) {
      const page = Number(fromText);
      if (page >= 1 && page <= total) wanted.add(page);
      continue;
    }
    const from = fromText ? Number(fromText) : 1;
    const to = toText ? Number(toText) : total;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) continue;
    for (let page = Math.max(1, from); page <= Math.min(total, to); page++) wanted.add(page);
  }
  return [...wanted].sort((a, b) => a - b);
}

export function allPages(total: number): number[] {
  return Array.from({ length: Math.max(0, total) }, (_, index) => index + 1);
}

/** `1-3, 5` for a set of page numbers — what the range box shows after a preset. */
export function formatPageRange(pages: readonly number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const page of sorted.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  parts.push(start === previous ? `${start}` : `${start}-${previous}`);
  return parts.join(", ");
}
