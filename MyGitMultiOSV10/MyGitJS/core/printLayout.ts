import type { Report } from "./report.js";

export type PaperId = "A4" | "A3" | "Letter" | "Legal";
export type PageOrientation = "portrait" | "landscape";
export type PageAlign = "left" | "center" | "right";
export type PageNumberPosition =
  | "top-left" | "top-center" | "top-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
export type PageNumberStyle = "number" | "pageOf";

export type PageSetup = {
  paper: PaperId;
  orientation: PageOrientation;
  marginMm: number;
  showHeader: boolean;
  headerText: string;
  headerAlign: PageAlign;
  showFooter: boolean;
  footerText: string;
  footerAlign: PageAlign;
  showPageNumber: boolean;
  pageNumberPosition: PageNumberPosition;
  pageNumberStyle: PageNumberStyle;
  showDate: boolean;
};

export type RunningSlots = { left: string; center: string; right: string };

export function defaultPageSetup(title: string): PageSetup {
  return {
    paper: "A4",
    orientation: "landscape",
    marginMm: 12,
    showHeader: true,
    headerText: title,
    headerAlign: "center",
    showFooter: false,
    footerText: "",
    footerAlign: "center",
    showPageNumber: true,
    pageNumberPosition: "bottom-right",
    pageNumberStyle: "pageOf",
    showDate: false,
  };
}

export type PrintBlock =
  | { type: "title"; text: string }
  | { type: "meta"; text: string }
  | { type: "kv"; label: string; value: string }
  | { type: "heading"; text: string }
  | { type: "thead"; cells: string[] }
  | { type: "row"; cells: string[] }
  | { type: "line"; text: string };

const PX_PER_MM = 96 / 25.4;

export const PAPERS: Record<PaperId, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export const MARGIN_CHOICES = [10, 12, 16, 20];

export function pageBox(setup: PageSetup) {
  const paper = PAPERS[setup.paper];
  const widthMm = setup.orientation === "landscape" ? paper.height : paper.width;
  const heightMm = setup.orientation === "landscape" ? paper.width : paper.height;
  const marginMm = Math.max(8, Math.min(setup.marginMm, Math.min(widthMm, heightMm) / 2 - 8));
  const bands = runningBands(setup, 1, 1, " ");
  const chrome = (bands.top ? 18 : 0) + (bands.bottom ? 18 : 0);
  return {
    width: mm(widthMm),
    height: mm(heightMm),
    innerWidth: mm(widthMm - marginMm * 2),
    innerHeight: mm(heightMm - marginMm * 2) - chrome,
    margin: mm(marginMm),
    widthMm,
    heightMm,
    marginMm,
  };
}

export function formatPageNumber(style: PageNumberStyle, page: number, total: number): string {
  return style === "number" ? String(page) : `${page} / ${total}`;
}

export function runningBands(setup: PageSetup, page: number, total: number, dateText: string): { top: RunningSlots | null; bottom: RunningSlots | null } {
  const top: RunningSlots = { left: "", center: "", right: "" };
  const bottom: RunningSlots = { left: "", center: "", right: "" };
  const put = (edge: "top" | "bottom", align: PageAlign, text: string) => {
    const value = text.trim();
    if (!value) return;
    const band = edge === "top" ? top : bottom;
    band[align] = band[align] ? `${band[align]}  ${value}` : value;
  };
  if (setup.showHeader) put("top", setup.headerAlign, setup.headerText);
  if (setup.showFooter) put("bottom", setup.footerAlign, setup.footerText);
  if (setup.showDate) put("top", setup.headerAlign === "left" ? "right" : "left", dateText);
  if (setup.showPageNumber) {
    const [edge, align] = setup.pageNumberPosition.split("-") as ["top" | "bottom", PageAlign];
    put(edge, align, formatPageNumber(setup.pageNumberStyle, page, total));
  }
  const used = (band: RunningSlots) => Boolean(band.left || band.center || band.right);
  return { top: used(top) ? top : null, bottom: used(bottom) ? bottom : null };
}

export function reportBlocks(report: Report): PrintBlock[] {
  const blocks: PrintBlock[] = [
    { type: "title", text: report.title },
    { type: "meta", text: report.generatedAt },
  ];
  for (const row of report.summary) blocks.push({ type: "kv", label: row.label, value: row.value });
  for (const table of report.tables) {
    if (!table.headers.length && !table.rows.length) continue;
    blocks.push({ type: "heading", text: table.title });
    if (table.headers.length) blocks.push({ type: "thead", cells: table.headers });
    for (const row of table.rows) blocks.push({ type: "row", cells: table.headers.map((_, index) => row[index] ?? "") });
  }
  if (report.text) {
    blocks.push({ type: "heading", text: report.text.title });
    for (const line of report.text.body.split(/\r?\n/)) blocks.push({ type: "line", text: line.length ? line : " " });
  }
  return blocks;
}

export function paginate(blocks: PrintBlock[], innerWidth: number, innerHeight: number): PrintBlock[][] {
  const pages: PrintBlock[][] = [];
  let page: PrintBlock[] = [];
  let used = 0;
  let header: PrintBlock | null = null;
  const startPage = () => {
    page = [];
    used = 0;
  };
  const finishPage = () => {
    if (page.length) pages.push(page);
    startPage();
  };
  for (const block of blocks) {
    if (block.type === "thead") header = block;
    if (block.type === "heading") header = null;
    const height = blockHeight(block, innerWidth);
    const repeat = page.length > 0 && used + height > innerHeight && header && block.type === "row" ? header : null;
    if (page.length > 0 && used + height > innerHeight) {
      finishPage();
      if (repeat && repeat.type === "thead") {
        page.push(repeat);
        used += blockHeight(repeat, innerWidth);
      }
    }
    page.push(block);
    used += height;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

export function layoutReport(report: Report, setup: PageSetup): { pages: PrintBlock[][]; box: ReturnType<typeof pageBox> } {
  const box = pageBox(setup);
  return { pages: paginate(reportBlocks(report), box.innerWidth, box.innerHeight), box };
}

export function chunks(blocks: PrintBlock[]): PrintChunk[] {
  const grouped: PrintChunk[] = [];
  let table: { headers: string[]; rows: string[][] } | null = null;
  const flush = () => {
    if (!table) return;
    grouped.push({ type: "table", headers: table.headers, rows: table.rows });
    table = null;
  };
  for (const block of blocks) {
    if (block.type === "thead") {
      flush();
      table = { headers: block.cells, rows: [] };
    } else if (block.type === "row" && table) {
      table.rows.push(block.cells);
    } else {
      flush();
      if (block.type === "kv") grouped.push(block);
      else if (block.type === "row") grouped.push({ type: "table", headers: [], rows: [block.cells] });
      else grouped.push({ type: block.type, text: block.text });
    }
  }
  flush();
  return grouped;
}

export type PrintChunk =
  | { type: "title"; text: string }
  | { type: "meta"; text: string }
  | { type: "heading"; text: string }
  | { type: "line"; text: string }
  | { type: "kv"; label: string; value: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export function renderPrintHtml(report: Report, setup: PageSetup): string {
  const { pages, box } = layoutReport(report, setup);
  const sheets = pages.map((blocks, index) => {
    const bands = runningBands(setup, index + 1, pages.length, report.generatedAt);
    return `<section class="sheet">${bandHtml(bands.top, "header")}${chunks(blocks).map(chunkHtml).join("")}${bandHtml(bands.bottom, "footer")}</section>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
  @page { size: ${box.widthMm}mm ${box.heightMm}mm; margin: ${box.marginMm}mm; }
  body { margin: 0; color: #1c1c1c; font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 12px 0 4px; }
  p { margin: 0 0 8px; color: #555; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 6px; }
  th, td { border: 1px solid #c8c8c8; padding: 3px 5px; text-align: left; vertical-align: top; font-size: 11px; }
  th { background: #f2f2f2; }
  .kv th { width: 28%; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 11px; margin: 0; }
  .run { display: flex; gap: 8px; font-size: 10px; color: #666; }
  .run span { flex: 1; min-width: 0; }
  .run span:nth-child(2) { text-align: center; }
  .run span:nth-child(3) { text-align: right; }
  header.run { margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ddd; }
  footer.run { margin-top: 8px; padding-top: 3px; border-top: 1px solid #ddd; }
</style></head><body>${sheets}</body></html>`;
}

function bandHtml(slots: RunningSlots | null, tag: "header" | "footer"): string {
  if (!slots) return "";
  return `<${tag} class="run"><span>${escapeHtml(slots.left)}</span><span>${escapeHtml(slots.center)}</span><span>${escapeHtml(slots.right)}</span></${tag}>`;
}

function blockHeight(block: PrintBlock, innerWidth: number): number {
  switch (block.type) {
    case "title": return 28;
    case "meta": return 18;
    case "kv": return 8 + textLines(block.value, Math.max(40, innerWidth * 0.7), 11) * 16;
    case "heading": return 26;
    case "thead":
    case "row": {
      const columns = Math.max(block.cells.length, 1);
      const columnWidth = Math.max(20, innerWidth / columns - 8);
      const lines = Math.max(1, ...block.cells.map((cell) => textLines(cell, columnWidth, 11)));
      return lines * 14 + 8;
    }
    case "line": return textLines(block.text, innerWidth, 11) * 14 + 2;
  }
}

function textLines(text: string, width: number, fontPx: number): number {
  const perLine = Math.max(1, Math.floor(width / (fontPx * 0.55)));
  return text.split(/\r?\n/).reduce((sum, part) => sum + Math.max(1, Math.ceil((part.length || 1) / perLine)), 0);
}

function chunkHtml(chunk: PrintChunk): string {
  switch (chunk.type) {
    case "title": return `<h1>${escapeHtml(chunk.text)}</h1>`;
    case "meta": return `<p>${escapeHtml(chunk.text)}</p>`;
    case "kv": return `<table class="kv"><tr><th>${escapeHtml(chunk.label)}</th><td>${escapeHtml(chunk.value)}</td></tr></table>`;
    case "heading": return `<h2>${escapeHtml(chunk.text)}</h2>`;
    case "line": return `<pre>${escapeHtml(chunk.text)}</pre>`;
    case "table": {
      const head = chunk.headers.length ? `<thead><tr>${chunk.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>` : "";
      const body = chunk.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
      return `<table>${head}<tbody>${body}</tbody></table>`;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function mm(value: number): number {
  return Math.round(value * PX_PER_MM);
}
