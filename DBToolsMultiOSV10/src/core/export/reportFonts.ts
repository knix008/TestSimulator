// Fonts for the generated documents.
//
// The family and size are a single setting shared by every format, but each one
// applies it differently: HTML and PDF get a stylesheet, Word gets a document
// default run, Excel a workbook font. Markdown carries no formatting at all and
// so ignores both — the viewer picks the font there.
import type { ReportPrefs } from './reportOptions';

/**
 * Always appended after the chosen family. Korean text has to keep rendering
 * when the picked font has no Hangul coverage, and it is the whole stack when
 * the user has not chosen anything.
 */
export const FALLBACK_STACK =
  '"Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif';

/** Point size the documents use when the user has not set one. */
export const DEFAULT_FONT_SIZE = 10;
export const MIN_FONT_SIZE = 7;
export const MAX_FONT_SIZE = 20;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

/** A CSS font-family value: the chosen family first, fallbacks behind it. */
export function fontStack(family: string): string {
  const name = family.trim();
  if (!name) return FALLBACK_STACK;
  // Quote it — family names routinely contain spaces.
  return `"${name.replace(/"/g, '')}", ${FALLBACK_STACK}`;
}

/** The family name Word and Excel want: a single name, not a stack. */
export function documentFontName(family: string): string {
  return family.trim() || 'Malgun Gothic';
}

/**
 * Heading sizes as multiples of the body size, taken from the proportions the
 * reports already had so that the default settings reproduce the old look.
 * The cover title is the exception — deliberately much larger than a section
 * heading, because it is a title page rather than a heading.
 */
export const SCALE = {
  h1: 1.83,
  h2: 1.33,
  h3: 1.08,
  coverTitle: 3.4,
  coverHeading: 1.25,
  coverAttribution: 1.3,
  small: 0.92,
} as const;

export function scaled(prefs: ReportPrefs, factor: number): number {
  return Math.round(clampFontSize(prefs.FontSize) * factor * 10) / 10;
}

/**
 * Stylesheet that applies the font settings. Appended after the base report
 * stylesheet so it wins on the properties it sets, and only on those.
 */
export function buildFontCss(prefs: ReportPrefs): string {
  const size = clampFontSize(prefs.FontSize);
  return `
  body {
    font-family: ${fontStack(prefs.FontFamily)};
    font-size: ${size}pt;
  }
  h1 { font-size: ${scaled(prefs, SCALE.h1)}pt; }
  h2 { font-size: ${scaled(prefs, SCALE.h2)}pt; }
  h3 { font-size: ${scaled(prefs, SCALE.h3)}pt; }
  th, td { font-size: ${size}pt; }
  .running-header, .running-footer, .card .k, .cover-producer, .done-detail {
    font-size: ${scaled(prefs, SCALE.small)}pt;
  }
  .cover-heading { font-size: ${scaled(prefs, SCALE.coverHeading)}pt; }
  .cover-attribution { font-size: ${scaled(prefs, SCALE.coverAttribution)}pt; }
  .cover-meta td { font-size: ${size}pt; }
  /* The cover title carries the document: large and heavy, not a heading. */
  .cover-subject {
    font-size: ${scaled(prefs, SCALE.coverTitle)}pt;
    font-weight: 800;
  }
`;
}

/** Word measures text in half-points. */
export function halfPoints(points: number): number {
  return Math.round(points * 2);
}
