// Real Word headers and footers for the document exports.
//
// Word is the one format with genuine running elements *and* live page-number
// fields, so the page number here is a field Word recalculates rather than a
// number baked in at export time.
import {
  footerText,
  headerText,
  type ReportAlign,
  type ReportContext,
  type ReportPrefs,
} from './reportOptions';

type Docx = typeof import('docx');

/** What a docx section needs: `headers` / `footers`, or nothing at all. */
export interface WordRunningParts {
  headers?: { default: InstanceType<Docx['Header']> };
  footers?: { default: InstanceType<Docx['Footer']> };
}

function alignmentOf(docx: Docx, align: ReportAlign) {
  if (align === 'left') return docx.AlignmentType.LEFT;
  if (align === 'right') return docx.AlignmentType.RIGHT;
  return docx.AlignmentType.CENTER;
}

/**
 * Runs for the page-number format, splitting `{page}` and `{total}` out so each
 * becomes a Word field and the literal text around them stays literal.
 */
function pageNumberRuns(docx: Docx, format: string) {
  const { PageNumber, TextRun } = docx;
  const runs: InstanceType<Docx['TextRun']>[] = [];
  const pattern = /\{page\}|\{total\}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const literal = (text: string) => {
    if (text) runs.push(new TextRun({ text, size: 16, color: '6B7280' }));
  };

  while ((match = pattern.exec(format)) !== null) {
    literal(format.slice(last, match.index));
    runs.push(
      new TextRun({
        children: [match[0] === '{page}' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES],
        size: 16,
        color: '6B7280',
      }),
    );
    last = match.index + match[0].length;
  }
  literal(format.slice(last));
  return runs;
}

/**
 * The text and the page number are separate paragraphs with their own
 * alignments — the user sets each independently, so a footer reading "left" and
 * a page number reading "right" has to come out that way.
 */
function band(
  docx: Docx,
  text: string | null,
  textAlign: ReportAlign,
  pageNumberFormat: string | null,
  pageAlign: ReportAlign,
): InstanceType<Docx['Paragraph']>[] {
  const { Paragraph, TextRun } = docx;
  const paragraphs: InstanceType<Docx['Paragraph']>[] = [];

  if (text) {
    paragraphs.push(
      new Paragraph({
        alignment: alignmentOf(docx, textAlign),
        children: [new TextRun({ text, size: 16, color: '6B7280' })],
      }),
    );
  }
  if (pageNumberFormat !== null) {
    paragraphs.push(
      new Paragraph({
        alignment: alignmentOf(docx, pageAlign),
        children: pageNumberRuns(docx, pageNumberFormat),
      }),
    );
  }
  return paragraphs;
}

export function buildWordRunningParts(
  docx: Docx,
  prefs: ReportPrefs,
  context: ReportContext,
): WordRunningParts {
  const { Header, Footer } = docx;
  const header = headerText(prefs, context);
  const footer = footerText(prefs, context);
  const pageInHeader = prefs.PageNumberPlacement === 'header' ? prefs.PageNumberFormat : null;
  const pageInFooter = prefs.PageNumberPlacement === 'footer' ? prefs.PageNumberFormat : null;

  const parts: WordRunningParts = {};

  const headerParagraphs = band(
    docx,
    header,
    prefs.HeaderAlign,
    pageInHeader,
    prefs.PageNumberAlign,
  );
  if (headerParagraphs.length > 0) {
    parts.headers = { default: new Header({ children: headerParagraphs }) };
  }

  const footerParagraphs = band(
    docx,
    footer,
    prefs.FooterAlign,
    pageInFooter,
    prefs.PageNumberAlign,
  );
  if (footerParagraphs.length > 0) {
    parts.footers = { default: new Footer({ children: footerParagraphs }) };
  }

  return parts;
}
