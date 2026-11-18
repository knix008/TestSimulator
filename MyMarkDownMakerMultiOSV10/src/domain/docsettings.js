// The document's settings: how the Markdown files are collected and joined, and how the document is laid
// out and exported (cover, contents, figure index, fonts, header and footer, page numbers). They live in
// the app settings under `doc` (domain/settings.js), shared by the main window, the right panel and the
// Settings window, and are kept for the next start.
export const DEFAULT_EXPORT_SETTINGS = {
  // ── How the files are collected and joined (the toolbar's left half) ──
  sortOrder: 'nameAsc',      // nameAsc | nameDesc | dateNewest | dateOldest | custom
  recursive: true,           // include Markdown files in sub-folders
  insertFileHeaders: false,  // put a "## <relative path>" heading before each file
  numberHeadings: true,      // hierarchical heading numbers (1, 1.1, 1.1.1 …)

  // ── How the document is laid out and exported ──
  fontFamily: '',        // '' = system default stack
  fontSizePt: 10,
  lineHeight: 1.5,       // export line spacing
  coverPage: true,       // auto-generated cover page
  coverTitle: '',        // user-entered cover title ('' = use document title)
  coverAuthor: '',       // cover: author
  coverDate: '',         // cover: date ('' = today's date)
  coverVersion: '',      // cover: version number
  coverTitleFont: '',    // cover title font ('' = the export font)
  coverTitleSizePt: 0,   // cover title size in pt (0 = automatic, 2.7em)
  coverTitleAlign: 'center',
  coverMetaAlign: 'center', // version / author / date block alignment
  coverShowVersion: true, // show version on the cover
  coverShowAuthor: true,  // show author on the cover
  coverShowDate: true,    // show date on the cover
  tocPage: true,         // separate index / table-of-contents page
  tocPageNumbers: true,
  tocLeaders: true,
  // Heading sizes in pt per level (0: automatic, relative to the body size).
  headingSizes: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
  chapterBreak: false,   // every chapter (top-level heading) starts on a new page
  // The logo: a picture (data: URI) for every page's header / footer and the cover.
  logoImage: '',
  logoName: '',
  logoWidth: 0,          // the picture's own size in px (its proportions)
  logoHeight: 0,
  logoHeader: true,
  logoHeaderAlign: 'left',
  logoFooter: false,
  logoFooterAlign: 'left',
  logoHeightMm: 10,
  coverLogo: true,
  coverLogoPosition: 'middle', // top | middle (just above the title) | bottom
  coverLogoHeightMm: 30,
  mdPictures: 'embed',   // Markdown export: pictures embedded (data:) or written as files beside it      // dotted leaders ……… between an entry and its page number
  tocPageMap: null,      // { 'h-<index>': page } from a pagination pass (baked)
  figurePage: true,      // separate figure index page (skipped when there are
                         // no images in the document)
  figurePageNumbers: true, // show a right-aligned page number per figure entry
  figurePageMap: null,   // { 'fig-<index>': page } from a pagination pass
  showHeader: true,      // use the header text at all (toolbar toggle)
  headerText: '',
  headerAlign: 'center', // left | center | right
  showFooter: true,      // use the footer text at all (toolbar toggle)
  footerText: '',
  footerAlign: 'center',
  showPageNumber: true,
  pageNumberPos: 'bottom-right', // {top|bottom}-{left|center|right}
  pageNumberOnCover: false,      // show the page number on the cover page too
};

export const SORT_ORDERS = ['nameAsc', 'nameDesc', 'dateNewest', 'dateOldest', 'custom'];
export const ALIGNS = ['left', 'center', 'right'];
export const PAGE_NUMBER_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export const DOC_FONT_SIZE = { min: 6, max: 48, step: 0.5 };
export const LINE_HEIGHT = { min: 0.5, max: 5, step: 0.1 };
export const COVER_TITLE_SIZE = { min: 0, max: 96, step: 1 };
export const LOGO_HEIGHT = { min: 4, max: 30, step: 1 };
export const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
export const HEADING_SIZE = { min: 0, max: 96, step: 0.5 };
/** The automatic size of each heading level, as a multiple of the body size (the exports' stylesheet). */
export const HEADING_EM = { h1: 1.8, h2: 1.45, h3: 1.2, h4: 1.05, h5: 1, h6: 0.95 };
export const COVER_LOGO_HEIGHT = { min: 10, max: 120, step: 5 };
export const COVER_LOGO_POSITIONS = ['top', 'middle', 'bottom'];
/** A logo is kept in the settings (local storage): about 1.5 MB of picture at most. */
export const LOGO_MAX_CHARS = 2_100_000;
export const LOGO_TYPES = ['png', 'gif', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'svg'];

const BOOLEANS = Object.entries(DEFAULT_EXPORT_SETTINGS).filter(([, v]) => typeof v === 'boolean').map(([k]) => k);
const STRINGS = ['logoName', 'fontFamily', 'coverTitle', 'coverAuthor', 'coverDate', 'coverVersion', 'coverTitleFont', 'headerText', 'footerText'];
const clampStep = (value, { min, max, step }, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(Math.round(n / step) * step * 1000) / 1000));
};

/** Fills gaps and repairs out-of-range values; the page maps are never stored. */
export function normalizeDocSettings(raw) {
  const base = DEFAULT_EXPORT_SETTINGS;
  const s = { ...base, ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) };
  for (const key of BOOLEANS) s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  for (const key of STRINGS) s[key] = typeof s[key] === 'string' ? s[key].slice(0, 500) : base[key];
  s.sortOrder = SORT_ORDERS.includes(s.sortOrder) ? s.sortOrder : base.sortOrder;
  s.mdPictures = s.mdPictures === 'files' ? 'files' : 'embed';
  const sizes = s.headingSizes && typeof s.headingSizes === 'object' ? s.headingSizes : {};
  s.headingSizes = Object.fromEntries(HEADING_LEVELS.map((h) => { const n = clampStep(sizes[h], HEADING_SIZE, 0); return [h, n > 0 && n < 6 ? 6 : n]; }));
  s.logoImage = typeof s.logoImage === 'string' && /^data:image\//i.test(s.logoImage) && s.logoImage.length <= LOGO_MAX_CHARS ? s.logoImage : '';
  s.logoWidth = Math.max(0, Math.round(Number(s.logoWidth) || 0));
  s.logoHeight = Math.max(0, Math.round(Number(s.logoHeight) || 0));
  for (const key of ['logoHeaderAlign', 'logoFooterAlign']) s[key] = ALIGNS.includes(s[key]) ? s[key] : base[key];
  s.logoHeightMm = clampStep(s.logoHeightMm, LOGO_HEIGHT, base.logoHeightMm);
  s.coverLogoHeightMm = clampStep(s.coverLogoHeightMm, COVER_LOGO_HEIGHT, base.coverLogoHeightMm);
  s.coverLogoPosition = COVER_LOGO_POSITIONS.includes(s.coverLogoPosition) ? s.coverLogoPosition : base.coverLogoPosition;
  s.fontSizePt = clampStep(s.fontSizePt, DOC_FONT_SIZE, base.fontSizePt);
  s.lineHeight = clampStep(s.lineHeight, LINE_HEIGHT, base.lineHeight);
  s.coverTitleSizePt = clampStep(s.coverTitleSizePt, COVER_TITLE_SIZE, 0);
  for (const key of ['coverTitleAlign', 'coverMetaAlign', 'headerAlign', 'footerAlign']) s[key] = ALIGNS.includes(s[key]) ? s[key] : base[key];
  s.pageNumberPos = PAGE_NUMBER_POSITIONS.includes(s.pageNumberPos) ? s.pageNumberPos : base.pageNumberPos;
  s.tocPageMap = null;
  s.figurePageMap = null;
  return s;
}
