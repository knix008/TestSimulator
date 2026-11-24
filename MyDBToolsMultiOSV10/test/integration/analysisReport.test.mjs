// The analysis report in all four document formats, and the report settings
// that shape them. These run against the real exporters, so a Word document is
// actually packed and unpacked rather than described.
import { suite, test, expect } from '../helpers/runner.mjs';
import { analysisReport, imageData, reportFonts, reportOptions, reportStyle, sampleSchema, schema } from '../helpers/core.mjs';
import { inflateRawSync } from 'node:zlib';

const {
  buildAnalysisModel,
  writeAnalysisMarkdown,
  buildAnalysisHtml,
  exportAnalysisWord,
} = analysisReport;
const { DEFAULT_REPORT_PREFS, HeadingNumberer, expandPlaceholders, normalizeReportPrefs } =
  reportOptions;

const sample = sampleSchema.createOnlineShopSchema();
const NOW = new Date(2026, 0, 15, 9, 30, 0);
/** A 1x1 PNG — enough to prove the image reaches every renderer. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const base = { now: NOW, projectPath: 'C:/work/OnlineShop.mdprj', erdImageDataUrl: PNG };

function prefs(overrides) {
  return { ...DEFAULT_REPORT_PREFS, ...overrides };
}

suite('Analysis report · model', () => {
  test('counts issues by severity and indexes by kind', () => {
    const model = buildAnalysisModel(sample, base);
    expect(model.issues.length).toBe(
      model.errorCount + model.warningCount + model.infoCount,
      'every issue is counted exactly once',
    );
    expect(model.suggestions.length).toBeGreaterThan(0);
    expect(model.actionableSuggestions).toBeLessThanOrEqual(model.suggestions.length);
  });

  test('only the requested levels are analyzed', () => {
    const model = buildAnalysisModel(sample, { ...base, levels: ['NF1'] });
    expect(model.levels).toEqual(['NF1']);
    for (const issue of model.issues) expect(issue.Level).toBe('NF1');
    const checked = model.levelSummaries.filter((s) => s.checked);
    expect(checked).toHaveLength(1);
  });

  test('levels keep their canonical order however they are passed in', () => {
    const model = buildAnalysisModel(sample, { ...base, levels: ['NF3', 'NF1', 'BCNF'] });
    expect(model.levels).toEqual(['NF1', 'NF3', 'BCNF']);
  });

  test('the verdict follows the error count', () => {
    const empty = buildAnalysisModel(schema.newSchema('empty'), base);
    expect(empty.passes).toBeTruthy('an empty schema violates nothing');
    expect(empty.errorCount).toBe(0);
  });

  test('actionable suggestions exclude the already-indexed ones', () => {
    const model = buildAnalysisModel(sample, base);
    const already = model.suggestions.filter((s) => s.Kind === 'AlreadyIndexed').length;
    expect(model.actionableSuggestions).toBe(model.suggestions.length - already);
  });
});

suite('Analysis report · Markdown', () => {
  const md = writeAnalysisMarkdown(sample, base);

  test('carries every section', () => {
    expect(md).toContain('# 데이터베이스 분석 보고서');
    expect(md).toContain('## 요약');
    expect(md).toContain('## ERD 다이어그램');
    expect(md).toContain('## 정규화 수준별 결과');
    expect(md).toContain('## 정규화 검사 결과');
    expect(md).toContain('## 인덱스 권장 사항');
  });

  test('embeds the ERD so the file stands alone', () => {
    expect(md).toContain('![ERD 다이어그램](data:image/png;base64,');
  });

  test('starts with the cover block', () => {
    expect(md.startsWith('# OnlineShop')).toBeTruthy();
    expect(md).toContain('### 데이터베이스 분석 보고서');
    expect(md).toContain('- **검사 수준**:');
  });

  test('says so plainly when there is no diagram', () => {
    const none = writeAnalysisMarkdown(sample, { ...base, erdImageDataUrl: null });
    expect(none).toContain('(다이어그램 없음)');
    expect(none).notToContain('![ERD');
  });
});

suite('Analysis report · HTML', () => {
  const html = buildAnalysisHtml(sample, base);

  test('is a complete document', () => {
    expect(html.startsWith('<!doctype html>')).toBeTruthy();
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
  });

  test('embeds the ERD as an inline image', () => {
    expect(html).toContain('<img src="data:image/png;base64,');
  });

  test('renders the verdict and the count cards', () => {
    expect(html).toMatch(/class="verdict (pass|fail)"/);
    expect(html).toContain('class="cards"');
    expect(html).toContain('인덱스 권장');
  });

  test('escapes schema text rather than injecting it', () => {
    const nasty = schema.newSchema('<script>alert(1)</script>');
    const out = buildAnalysisHtml(nasty, { now: NOW });
    expect(out).notToContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

suite('Analysis report · Word', () => {
  test('packs a real .docx', async () => {
    const bytes = await exportAnalysisWord(sample, base);
    // A docx is a zip: "PK\x03\x04".
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.length).toBeGreaterThan(2000);
  });

  test('a schema with no diagram still exports', async () => {
    const bytes = await exportAnalysisWord(schema.newSchema('empty'), { now: NOW });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

/**
 * Pull one part out of a .docx without a zip library: walk the local file
 * headers, which is enough for the small, well-formed archives `docx` writes.
 */
function docxPart(bytes, wanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    if (name === wanted) {
      return new TextDecoder().decode(method === 8 ? inflateRawSync(data) : data);
    }
    offset = dataStart + compressedSize;
  }
  return null;
}

suite('Report settings · Word header and footer', () => {
  const configured = prefs({
    HeaderEnabled: true,
    HeaderText: '{schema}',
    HeaderAlign: 'left',
    FooterEnabled: true,
    FooterText: '기밀',
    FooterAlign: 'left',
    PageNumberPlacement: 'footer',
    PageNumberAlign: 'right',
    PageNumberFormat: '{page} / {total}',
  });

  test('the page number is a live Word field, not a baked-in number', async () => {
    const bytes = await exportAnalysisWord(sample, { ...base, report: configured });
    const footer = docxPart(bytes, 'word/footer1.xml');
    expect(footer).toBeTruthy('the document has a footer part');
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
  });

  test('the page number keeps its own alignment, not the footer text one', async () => {
    const bytes = await exportAnalysisWord(sample, { ...base, report: configured });
    const footer = docxPart(bytes, 'word/footer1.xml');
    // Footer text is left, the page number right — both must survive.
    expect(footer).toContain('w:val="left"');
    expect(footer).toContain('w:val="right"');
  });

  test('no header or footer parts when both are off', async () => {
    const bytes = await exportAnalysisWord(sample, base);
    expect(docxPart(bytes, 'word/footer1.xml')).toBeFalsy();
    expect(docxPart(bytes, 'word/header1.xml')).toBeFalsy();
  });
});

suite('Report settings · cover page', () => {
  test('the cover can be turned off entirely', () => {
    const off = prefs({ CoverEnabled: false });
    const model = buildAnalysisModel(sample, { ...base, report: off });
    expect(model.cover).toBeFalsy();

    const md = writeAnalysisMarkdown(sample, { ...base, report: off });
    expect(md.startsWith('# 데이터베이스 분석 보고서')).toBeTruthy();

    const html = buildAnalysisHtml(sample, { ...base, report: off });
    expect(html).notToContain('class="cover"');
  });

  test('title and subject are overridable', () => {
    const custom = prefs({ CoverTitle: '내부 검토 자료', CoverSubject: '2026 1분기' });
    const md = writeAnalysisMarkdown(sample, { ...base, report: custom });
    expect(md).toContain('# 2026 1분기');
    expect(md).toContain('### 내부 검토 자료');
  });

  test('organization and author appear as one attribution line', () => {
    const custom = prefs({ CoverOrganization: '데이터팀', CoverAuthor: '권수호' });
    const model = buildAnalysisModel(sample, { ...base, report: custom });
    expect(model.cover.attribution).toBe('데이터팀 · 권수호');
    expect(buildAnalysisHtml(sample, { ...base, report: custom })).toContain('cover-attribution');
  });

  test('the detail rows and the path can be hidden independently', () => {
    const model = buildAnalysisModel(sample, {
      ...base,
      report: prefs({ CoverShowDetails: false, CoverShowProjectPath: true }),
    });
    expect(model.cover.rows).toHaveLength(1);
    expect(model.cover.rows[0].label).toBe('프로젝트 파일');

    const bare = buildAnalysisModel(sample, {
      ...base,
      report: prefs({ CoverShowDetails: false, CoverShowProjectPath: false }),
    });
    expect(bare.cover.rows).toHaveLength(0);
  });
});

suite('Report settings · heading numbering', () => {
  test('numbers sections and subsections in order', () => {
    const n = new HeadingNumberer('decimal');
    expect(n.headSection('첫째')).toBe('1. 첫째');
    expect(n.headSub('가')).toBe('1.1 가');
    expect(n.headSub('나')).toBe('1.2 나');
    expect(n.headSection('둘째')).toBe('2. 둘째');
    expect(n.headSub('가')).toBe('2.1 가');
  });

  test('the paren and roman styles differ from decimal', () => {
    expect(new HeadingNumberer('paren').headSection('x')).toBe('1) x');
    const roman = new HeadingNumberer('roman');
    roman.headSection('x');
    roman.headSection('y');
    roman.headSection('z');
    roman.headSection('w');
    expect(roman.headSection('v')).toBe('V. v');
  });

  test('"none" leaves headings exactly as they were', () => {
    const n = new HeadingNumberer('none');
    expect(n.enabled).toBeFalsy();
    expect(n.headSection('요약')).toBe('요약');
    expect(n.headSub('표')).toBe('표');
  });

  test('the setting reaches the rendered documents', () => {
    const numbered = prefs({ HeadingNumberStyle: 'decimal' });
    const md = writeAnalysisMarkdown(sample, { ...base, report: numbered });
    expect(md).toContain('## 1. 요약');
    expect(md).toContain('## 2. ERD 다이어그램');

    const html = buildAnalysisHtml(sample, { ...base, report: numbered });
    expect(html).toContain('<h2>1. 요약</h2>');
  });

  test('the default is off, so existing documents are unchanged', () => {
    expect(DEFAULT_REPORT_PREFS.HeadingNumberStyle).toBe('none');
    expect(writeAnalysisMarkdown(sample, base)).toContain('## 요약');
  });
});

suite('Report settings · header and footer', () => {
  const context = { schema: sample, title: '분석 보고서', projectPath: 'C:/x/y.mdprj', now: NOW };

  test('placeholders resolve against the schema', () => {
    expect(expandPlaceholders('{schema} / {db}', context)).toBe('OnlineShop / PostgreSQL');
    expect(expandPlaceholders('{title}', context)).toBe('분석 보고서');
    expect(expandPlaceholders('{path}', context)).toBe('C:/x/y.mdprj');
    expect(expandPlaceholders('{date}', context)).toContain('2026-01-15');
  });

  test('an unknown placeholder is left visible rather than blanked', () => {
    expect(expandPlaceholders('{nope} tail', context)).toBe('{nope} tail');
  });

  test('HTML gets running elements and body padding classes', () => {
    const html = buildAnalysisHtml(sample, {
      ...base,
      report: prefs({
        HeaderEnabled: true,
        HeaderText: '{schema} 분석',
        HeaderAlign: 'right',
        FooterEnabled: true,
        FooterText: '기밀',
        FooterAlign: 'left',
      }),
    });
    expect(html).toContain('<div class="running-header align-right"');
    expect(html).toContain('OnlineShop 분석');
    expect(html).toContain('<div class="running-footer align-left"');
    expect(html).toContain('class="has-header has-footer"');
  });

  test('Markdown carries them once, at the top and the bottom', () => {
    const md = writeAnalysisMarkdown(sample, {
      ...base,
      report: prefs({
        HeaderEnabled: true,
        HeaderText: '머리말',
        FooterEnabled: true,
        FooterText: '꼬리말',
      }),
    });
    expect(md.startsWith('_머리말_')).toBeTruthy();
    expect(md.trimEnd().endsWith('_꼬리말_')).toBeTruthy();
  });

  test('disabled means absent, not empty', () => {
    // The stylesheet always defines the classes, so look for the elements.
    const html = buildAnalysisHtml(sample, base);
    expect(html).notToContain('<div class="running-header');
    expect(html).notToContain('<div class="running-footer');
  });
});

suite('Report settings · page numbers', () => {
  const context = { schema: sample, title: '분석 보고서', now: NOW };

  test('no templates at all when nothing is configured', () => {
    expect(reportStyle.buildPrintTemplates(DEFAULT_REPORT_PREFS, context)).toBeFalsy();
  });

  test('the footer template carries Chromium page-number spans', () => {
    const templates = reportStyle.buildPrintTemplates(
      prefs({ PageNumberPlacement: 'footer', PageNumberFormat: '{page} / {total}' }),
      context,
    );
    expect(templates.footerTemplate).toContain('class="pageNumber"');
    expect(templates.footerTemplate).toContain('class="totalPages"');
    expect(templates.headerTemplate).toBe('<span></span>', 'header stays empty');
  });

  test('a format without {total} asks Chromium for no total', () => {
    const templates = reportStyle.buildPrintTemplates(
      prefs({ PageNumberPlacement: 'header', PageNumberFormat: '- {page} -' }),
      context,
    );
    expect(templates.headerTemplate).toContain('class="pageNumber"');
    expect(templates.headerTemplate).notToContain('totalPages');
  });

  test('running text alone still produces templates', () => {
    const templates = reportStyle.buildPrintTemplates(
      prefs({ FooterEnabled: true, FooterText: '{schema}' }),
      context,
    );
    expect(templates.footerTemplate).toContain('OnlineShop');
  });
});

suite('Report settings · persistence', () => {
  test('missing settings fall back to every default', () => {
    expect(normalizeReportPrefs(undefined)).toEqual(DEFAULT_REPORT_PREFS);
    expect(normalizeReportPrefs({})).toEqual(DEFAULT_REPORT_PREFS);
  });

  test('a stored value of the wrong type is replaced, not trusted', () => {
    const out = normalizeReportPrefs({
      CoverEnabled: 'yes',
      HeaderAlign: 'diagonal',
      HeadingNumberStyle: 'bullets',
      PageNumberPlacement: 'margin',
      CoverTitle: 42,
    });
    expect(out.CoverEnabled).toBe(true);
    expect(out.HeaderAlign).toBe('center');
    expect(out.HeadingNumberStyle).toBe('none');
    expect(out.PageNumberPlacement).toBe('none');
    expect(out.CoverTitle).toBe('');
  });

  test('valid values survive unchanged', () => {
    const out = normalizeReportPrefs({
      CoverEnabled: false,
      CoverTitle: '제목',
      HeadingNumberStyle: 'roman',
      FooterAlign: 'right',
      PageNumberPlacement: 'footer',
    });
    expect(out.CoverEnabled).toBe(false);
    expect(out.CoverTitle).toBe('제목');
    expect(out.HeadingNumberStyle).toBe('roman');
    expect(out.FooterAlign).toBe('right');
    expect(out.PageNumberPlacement).toBe('footer');
  });
});

suite('Report ERD · embedded image sizing', () => {
  const { decodeDataUrl, readPngSize, fitWithin, embeddedImageSize } = imageData;

  /** Build a PNG header with the given dimensions — enough for the size reader. */
  function pngOf(width, height) {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13, false);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
    view.setUint32(16, width, false);
    view.setUint32(20, height, false);
    return bytes;
  }

  test('reads the intrinsic size out of the PNG header', () => {
    expect(readPngSize(pngOf(1600, 900))).toEqual({ width: 1600, height: 900 });
    expect(readPngSize(pngOf(3, 7))).toEqual({ width: 3, height: 7 });
  });

  test('anything that is not a PNG reads as unknown', () => {
    expect(readPngSize(new Uint8Array([1, 2, 3]))).toBeFalsy();
    expect(readPngSize(new TextEncoder().encode('GIF89a and then some padding...'))).toBeFalsy();
  });

  test('a wide diagram is limited by width, a tall one by height', () => {
    const wide = fitWithin({ width: 2000, height: 500 }, 600, 760);
    expect(wide).toEqual({ width: 600, height: 150 });

    const tall = fitWithin({ width: 500, height: 2000 }, 600, 760);
    expect(tall).toEqual({ width: 190, height: 760 });
  });

  test('the aspect ratio survives the fit', () => {
    for (const size of [
      { width: 2000, height: 500 },
      { width: 500, height: 2000 },
      { width: 1234, height: 987 },
    ]) {
      const out = fitWithin(size, 600, 760);
      expect(Math.abs(out.width / out.height - size.width / size.height)).toBeLessThanOrEqual(0.01);
    }
  });

  test('a small diagram is left at its own size rather than blown up', () => {
    expect(fitWithin({ width: 120, height: 80 }, 600, 760)).toEqual({ width: 120, height: 80 });
  });

  test('an unreadable image falls back to the box', () => {
    const junk = 'data:image/png;base64,' + Buffer.from('not a png').toString('base64');
    expect(embeddedImageSize(junk, 600, 760)).toEqual({ width: 600, height: 760 });
  });

  test('decodeDataUrl recovers the exact bytes', () => {
    const original = pngOf(64, 48);
    const url = 'data:image/png;base64,' + Buffer.from(original).toString('base64');
    expect([...decodeDataUrl(url)]).toEqual([...original]);
  });
});

suite('Report ERD · Word keeps the diagram shape', () => {
  /** A PNG header is all the exporters read to size the picture. */
  function pngUrl(width, height) {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13, false);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, width, false);
    view.setUint32(20, height, false);
    return 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
  }

  /** The drawing extent Word is given, in EMU (1 px = 9525 EMU). */
  function extentOf(xml) {
    const m = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    return m ? { cx: Number(m[1]), cy: Number(m[2]) } : null;
  }

  async function extentFor(width, height) {
    const bytes = await exportAnalysisWord(sample, {
      ...base,
      erdImageDataUrl: pngUrl(width, height),
    });
    return extentOf(docxPart(bytes, 'word/document.xml'));
  }

  test('a wide diagram stays wide', async () => {
    const ext = await extentFor(1636, 900);
    expect(ext).toBeTruthy('the document embeds a picture');
    expect(Math.abs(ext.cx / ext.cy - 1636 / 900)).toBeLessThanOrEqual(0.01);
  });

  test('a tall diagram stays tall', async () => {
    const ext = await extentFor(600, 2400);
    expect(Math.abs(ext.cx / ext.cy - 600 / 2400)).toBeLessThanOrEqual(0.01);
  });

  test('a square diagram stays square', async () => {
    const ext = await extentFor(1200, 1200);
    expect(Math.abs(ext.cx / ext.cy - 1)).toBeLessThanOrEqual(0.01);
  });

  test('the old fixed 600x420 box is gone', async () => {
    // 600x420 was the hard-coded size; every shape came out looking like it.
    const wide = await extentFor(1636, 900);
    const tall = await extentFor(600, 2400);
    expect(wide.cx === tall.cx && wide.cy === tall.cy).toBeFalsy(
      'different diagrams must not embed at the same size',
    );
  });
});

suite('Report settings · fonts', () => {
  const { buildFontCss, clampFontSize, documentFontName, fontStack, halfPoints, scaled, SCALE } =
    reportFonts;

  test('a chosen family leads, the fallback stack follows', () => {
    const stack = fontStack('Nanum Myeongjo');
    expect(stack.startsWith('"Nanum Myeongjo",')).toBeTruthy();
    expect(stack).toContain('Malgun Gothic');
    expect(stack).toContain('sans-serif');
  });

  test('no chosen family means the fallback stack alone', () => {
    expect(fontStack('')).toBe(reportFonts.FALLBACK_STACK);
    expect(fontStack('   ')).toBe(reportFonts.FALLBACK_STACK);
  });

  test('a quote in a family name cannot break out of the CSS string', () => {
    expect(fontStack('Ev"il')).toContain('"Evil"');
  });

  test('the size is clamped to something a document can use', () => {
    expect(clampFontSize(2)).toBe(reportFonts.MIN_FONT_SIZE);
    expect(clampFontSize(400)).toBe(reportFonts.MAX_FONT_SIZE);
    expect(clampFontSize(Number.NaN)).toBe(reportFonts.DEFAULT_FONT_SIZE);
    expect(clampFontSize(11.4)).toBe(11);
  });

  test('Word takes half-points', () => {
    expect(halfPoints(10)).toBe(20);
    expect(halfPoints(13.5)).toBe(27);
  });

  test('the cover title is much larger than a section heading', () => {
    const p = prefs({ FontSize: 10 });
    expect(scaled(p, SCALE.coverTitle)).toBeGreaterThan(scaled(p, SCALE.h1));
    expect(scaled(p, SCALE.h1)).toBeGreaterThan(scaled(p, SCALE.h2));
    expect(scaled(p, SCALE.coverTitle)).toBe(34);
  });

  test('headings scale with the body size', () => {
    const small = scaled(prefs({ FontSize: 8 }), SCALE.h1);
    const large = scaled(prefs({ FontSize: 16 }), SCALE.h1);
    expect(large).toBeGreaterThan(small);
    expect(Math.abs(large / small - 2)).toBeLessThanOrEqual(0.05);
  });

  test('the stylesheet carries the family, the size and a bold cover title', () => {
    const css = buildFontCss(prefs({ FontFamily: 'Nanum Gothic', FontSize: 12 }));
    expect(css).toContain('"Nanum Gothic"');
    expect(css).toContain('font-size: 12pt');
    expect(css).toContain('font-weight: 800');
  });

  test('the settings reach the rendered HTML', () => {
    const html = buildAnalysisHtml(sample, {
      ...base,
      report: prefs({ FontFamily: 'Nanum Myeongjo', FontSize: 13 }),
    });
    expect(html).toContain('"Nanum Myeongjo"');
    expect(html).toContain('font-size: 13pt');
  });

  test('Word falls back to a real family name rather than an empty one', () => {
    expect(documentFontName('')).toBe('Malgun Gothic');
    expect(documentFontName('Batang')).toBe('Batang');
  });

  test('the chosen family reaches the .docx', async () => {
    const bytes = await exportAnalysisWord(sample, {
      ...base,
      report: prefs({ FontFamily: 'Nanum Gothic', FontSize: 14 }),
    });
    const styles = docxPart(bytes, 'word/styles.xml');
    expect(styles).toContain('Nanum Gothic');
    expect(styles).toContain('w:sz w:val="28"'); // 14pt = 28 half-points
  });

  test('an unreadable stored size does not poison the settings', () => {
    expect(normalizeReportPrefs({ FontSize: 'big' }).FontSize).toBe(
      reportFonts.DEFAULT_FONT_SIZE,
    );
    expect(normalizeReportPrefs({ FontSize: 999 }).FontSize).toBe(reportFonts.MAX_FONT_SIZE);
  });
});
