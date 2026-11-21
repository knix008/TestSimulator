// Printing (CONTRACT: pure): paper, margins, the title block, and the pages a song prints — the lead
// sheet (staff notation with chords and lyrics, as many sheets as it needs), the lyrics, the chord
// chart, the arrangement overview and a summary. Sheet geometry is in millimetres.

/** Paper sizes in millimetres (portrait). */
export const PAPERS = {
  A4: { width: 210, height: 297 }, A3: { width: 297, height: 420 }, A5: { width: 148, height: 210 },
  B4: { width: 257, height: 364 }, B5: { width: 182, height: 257 },
  Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 }, Tabloid: { width: 279.4, height: 431.8 },
};
export const MARGINS = { narrow: 8, normal: 13, wide: 20 };
export const TITLE_BLOCK_MM = 14;
export const PAGE_TYPES = ['leadsheet', 'lyrics', 'chords', 'arrangement', 'summary'];

export function defaultPrintSetup() {
  return {
    printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margin: 'normal', titleBlock: true, titleText: '', author: '',
    includeLeadsheet: true, includeLyrics: true, includeChords: true, includeArrangement: false, includeSummary: false,
    lyricColumns: 2, fontScale: 100,
  };
}

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

export function normalizePrintSetup(raw = {}) {
  const base = defaultPrintSetup();
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    printer: typeof r.printer === 'string' ? r.printer : base.printer,
    copies: Math.max(1, Math.min(99, Math.round(Number(r.copies) || 1))),
    paper: r.paper in PAPERS ? r.paper : base.paper,
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: r.margin in MARGINS ? r.margin : base.margin,
    titleBlock: bool(r.titleBlock, base.titleBlock),
    titleText: typeof r.titleText === 'string' ? r.titleText.slice(0, 120) : '',
    author: typeof r.author === 'string' ? r.author.slice(0, 80) : '',
    includeLeadsheet: bool(r.includeLeadsheet, base.includeLeadsheet),
    includeLyrics: bool(r.includeLyrics, base.includeLyrics),
    includeChords: bool(r.includeChords, base.includeChords),
    includeArrangement: bool(r.includeArrangement, base.includeArrangement),
    includeSummary: bool(r.includeSummary, base.includeSummary),
    lyricColumns: [1, 2].includes(Number(r.lyricColumns)) ? Number(r.lyricColumns) : base.lyricColumns,
    fontScale: Math.max(70, Math.min(150, Math.round(Number(r.fontScale) || 100))),
  };
}

/** { width, height, frame, area, block } in mm. */
export function sheetGeometry(setup) {
  const o = normalizePrintSetup(setup);
  const paper = PAPERS[o.paper];
  const landscape = o.orientation === 'landscape';
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  const m = MARGINS[o.margin];
  const frame = { x: m, y: m, w: width - 2 * m, h: height - 2 * m };
  const block = o.titleBlock ? { x: frame.x, y: frame.y + frame.h - TITLE_BLOCK_MM, w: frame.w, h: TITLE_BLOCK_MM } : null;
  const area = { x: frame.x + 3, y: frame.y + 3, w: frame.w - 6, h: frame.h - 6 - (block ? block.h + 2 : 0) };
  return { width, height, frame, area, block };
}

/** The page groups of a song, with whether each is chosen: [{ key, type }]. */
export const printablePages = () => PAGE_TYPES.map((type) => ({ key: type, type }));

export function pageChosen(page, setup, picked = {}) {
  if (page.key in picked) return Boolean(picked[page.key]);
  return Boolean(setup[`include${page.type[0].toUpperCase()}${page.type.slice(1)}`]);
}
