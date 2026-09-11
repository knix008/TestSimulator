// Presentation shared by the HTML reports (schema design and analysis). Both
// are also the source document for their PDF export, so this stylesheet has to
// carry the print rules too — Chromium prints exactly what it renders.
import type { CoverInfo } from './coverPage';
import { footerText, headerText, type ReportContext, type ReportPrefs } from './reportOptions';

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const REPORT_STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
    color: #111827; margin: 0; padding: 24px; font-size: 12px; line-height: 1.6;
  }
  h1 { font-size: 22px; margin: 0 0 16px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  h2 { font-size: 16px; margin: 28px 0 10px; color: #1f2937; border-left: 4px solid #2563eb; padding-left: 8px; }
  h3 { font-size: 13px; margin: 18px 0 6px; color: #374151; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 14px; page-break-inside: auto; }
  th, td { border: 1px solid #d1d5db; padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  tr { page-break-inside: avoid; }
  .center { text-align: center; }
  .meta { list-style: none; padding: 0; margin: 0 0 18px; }
  .meta li { padding: 2px 0; }
  .comment { color: #6b7280; font-style: italic; margin: 0 0 6px; }
  .sev-Error { color: #b91c1c; font-weight: 600; }
  .sev-Warning { color: #b45309; font-weight: 600; }
  .sev-Info { color: #4338ca; font-weight: 600; }
  .erd { margin: 8px 0 20px; text-align: center; page-break-inside: avoid; }
  .erd img { max-width: 100%; border: 1px solid #e5e7eb; }
  .empty { color: #9ca3af; }

  /* Analysis report: the counts strip under the heading. */
  .cards { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 18px; }
  .card {
    border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 14px;
    min-width: 104px; text-align: center; page-break-inside: avoid;
  }
  .card .n { display: block; font-size: 20px; font-weight: 700; line-height: 1.2; }
  .card .k { display: block; font-size: 10px; color: #6b7280; letter-spacing: 0.08em; }
  .card.error .n { color: #b91c1c; }
  .card.warning .n { color: #b45309; }
  .card.info .n { color: #4338ca; }
  .card.good .n { color: #047857; }

  /* Verdict line: whether the schema passes the levels that were checked. */
  .verdict { padding: 8px 12px; border-radius: 6px; margin: 0 0 16px; font-weight: 600; }
  .verdict.pass { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .verdict.fail { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

  /* Cover: its own page, vertically centred, nothing after it on that sheet. */
  .cover {
    page-break-after: always;
    break-after: page;
    min-height: 245mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    padding: 0 12mm;
  }
  .cover-rule { width: 64px; height: 4px; background: #2563eb; margin: 0 auto 26px; }
  .cover-heading { font-size: 15px; letter-spacing: 0.22em; color: #6b7280; margin: 0 0 14px; }
  .cover-subject {
    font-size: 34px; font-weight: 700; color: #111827;
    margin: 0 0 34px; word-break: keep-all; line-height: 1.35;
    /* Undo the section-heading underline the generic h1 rule applies. */
    border-bottom: none; padding-bottom: 0;
  }
  .cover-meta { margin: 0 auto; border-collapse: collapse; width: auto; }
  .cover-meta td { border: none; padding: 5px 14px; font-size: 12px; }
  .cover-meta .k { color: #6b7280; text-align: right; white-space: nowrap; }
  .cover-meta .v { color: #111827; text-align: left; word-break: break-all; }
  .cover-producer { margin-top: 44px; font-size: 11px; letter-spacing: 0.14em; color: #9ca3af; }
  .cover-attribution { font-size: 13px; color: #374151; margin: -22px 0 30px; }

  /* Running header and footer. Fixed elements repeat on every printed sheet in
     Chromium, which is what makes them running rather than one-off. */
  .running-header, .running-footer {
    position: fixed; left: 0; right: 0;
    font-size: 10px; color: #6b7280; padding: 4px 6px;
  }
  .running-header { top: 0; border-bottom: 1px solid #e5e7eb; }
  .running-footer { bottom: 0; border-top: 1px solid #e5e7eb; }
  .align-left { text-align: left; }
  .align-center { text-align: center; }
  .align-right { text-align: right; }
  /* Keep body text clear of the running elements. */
  body.has-header { padding-top: 34px; }
  body.has-footer { padding-bottom: 34px; }
`;

/** The cover sheet, identical in both HTML reports. Null when it is turned off. */
export function renderCoverHtml(cover: CoverInfo | null): string {
  if (!cover) return '';
  const parts: string[] = ['<section class="cover">'];
  parts.push('<div class="cover-rule"></div>');
  parts.push(`<p class="cover-heading">${escapeHtml(cover.heading)}</p>`);
  parts.push(`<h1 class="cover-subject">${escapeHtml(cover.subject)}</h1>`);
  if (cover.attribution) {
    parts.push(`<p class="cover-attribution">${escapeHtml(cover.attribution)}</p>`);
  }
  parts.push('<table class="cover-meta"><tbody>');
  for (const row of cover.rows) {
    parts.push(
      `<tr><td class="k">${escapeHtml(row.label)}</td><td class="v">${escapeHtml(row.value)}</td></tr>`,
    );
  }
  parts.push('</tbody></table>');
  parts.push(`<p class="cover-producer">${escapeHtml(cover.producer)}</p>`);
  parts.push('</section>');
  return parts.join('\n');
}

/**
 * The running header and footer, plus the body classes that reserve room for
 * them. The page number is left out here: CSS cannot count printed pages, so
 * the PDF exporter supplies it through Chromium's own header/footer templates
 * instead (see `printToPdf`).
 */
export function renderRunningHtml(
  prefs: ReportPrefs,
  context: ReportContext,
): { header: string; footer: string; bodyClass: string } {
  const header = headerText(prefs, context);
  const footer = footerText(prefs, context);
  const classes: string[] = [];
  if (header) classes.push('has-header');
  if (footer) classes.push('has-footer');
  return {
    header: header
      ? `<div class="running-header align-${prefs.HeaderAlign}">${escapeHtml(header)}</div>`
      : '',
    footer: footer
      ? `<div class="running-footer align-${prefs.FooterAlign}">${escapeHtml(footer)}</div>`
      : '',
    bodyClass: classes.join(' '),
  };
}

/**
 * Chromium's print header/footer templates, used for PDF export — the only
 * place a real page number is available. Returns null when the user asked for
 * neither running text nor page numbers, so the PDF keeps its clean margins.
 */
export function buildPrintTemplates(
  prefs: ReportPrefs,
  context: ReportContext,
): { headerTemplate: string; footerTemplate: string } | null {
  const header = headerText(prefs, context);
  const footer = footerText(prefs, context);
  const wantsPageNumber = prefs.PageNumberPlacement !== 'none';
  if (!header && !footer && !wantsPageNumber) return null;

  // Chromium substitutes .pageNumber / .totalPages inside these templates, so
  // the format string is split around them rather than interpolated.
  const pageNumberHtml = () => {
    const [before, rest] = prefs.PageNumberFormat.split('{page}');
    const [between, after] = (rest ?? '').split('{total}');
    return (
      `<span>${escapeHtml(before ?? '')}</span><span class="pageNumber"></span>` +
      `<span>${escapeHtml(between ?? '')}</span>` +
      (rest?.includes('{total}') ? '<span class="totalPages"></span>' : '') +
      `<span>${escapeHtml(after ?? '')}</span>`
    );
  };

  const band = (
    text: string | null,
    align: string,
    withPageNumber: boolean,
    pageAlign: string,
  ) => {
    if (!text && !withPageNumber) return '<span></span>';
    const style =
      'font-size:9px;color:#6b7280;width:100%;padding:0 12mm;' +
      "font-family:'Malgun Gothic',system-ui,sans-serif;" +
      'display:flex;align-items:center;';
    const cell = (content: string, a: string) =>
      `<span style="flex:1;text-align:${a}">${content}</span>`;
    // Same alignment for both: one cell, so they do not fight for space.
    if (withPageNumber && text && align === pageAlign) {
      return `<div style="${style}">${cell(`${escapeHtml(text)} &nbsp; ${pageNumberHtml()}`, align)}</div>`;
    }
    const cells: string[] = [];
    if (text) cells.push(cell(escapeHtml(text), align));
    if (withPageNumber) cells.push(cell(pageNumberHtml(), pageAlign));
    return `<div style="${style}">${cells.join('')}</div>`;
  };

  return {
    headerTemplate: band(
      header,
      prefs.HeaderAlign,
      prefs.PageNumberPlacement === 'header',
      prefs.PageNumberAlign,
    ),
    footerTemplate: band(
      footer,
      prefs.FooterAlign,
      prefs.PageNumberPlacement === 'footer',
      prefs.PageNumberAlign,
    ),
  };
}
