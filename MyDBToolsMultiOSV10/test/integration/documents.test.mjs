// Document exports: Markdown, HTML/PDF, Word and Excel — including the cover
// page each of them must open with.
import { suite, test, expect } from '../helpers/runner.mjs';
import { excel, htmlReport, report, sampleSchema, schema, word } from '../helpers/core.mjs';

const sample = sampleSchema.createOnlineShopSchema();
const now = new Date('2026-01-02T03:04:05');
const projectPath = 'C:/work/OnlineShop.mdprj';

/** Read one entry out of a .docx / .xlsx package, when jszip is available. */
async function unzipText(bytes, wanted) {
  const mod = await import('jszip').catch(() => null);
  if (!mod) return null;
  const zip = await mod.default.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => n.includes(wanted));
  const parts = await Promise.all(names.map((n) => zip.files[n].async('string')));
  return parts.join('');
}

suite('Markdown report', () => {
  const md = report.writeReport(sample, { projectPath, now });

  test('opens with the cover, then the report body', () => {
    expect(md.startsWith('# OnlineShop')).toBeTruthy();
    expect(md).toContain('### 데이터베이스 설계 보고서');
    const rule = /^---$/m.exec(md).index;
    const body = /^# 데이터베이스 설계 보고서$/m.exec(md).index;
    expect(body).toBeGreaterThan(rule);
  });

  test('cover carries the metadata', () => {
    expect(md).toContain('- **대상 데이터베이스**: PostgreSQL');
    expect(md).toContain('- **테이블 수**: 5');
    expect(md).toContain('- **관계 수**: 4');
    expect(md).toContain(projectPath);
  });

  test('every table gets a section and a column table', () => {
    for (const t of ['users', 'categories', 'products', 'orders', 'order_items']) {
      expect(md).toContain(`### ${t}`);
    }
    expect(md).toContain('| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |');
  });

  test('relationships are listed with their cardinality', () => {
    expect(md).toContain('## 관계 목록');
    expect(md).toContain('1:N');
    expect(md).toContain('fk_products_category');
  });

  test('a clean schema says so', () => {
    expect(md).toContain('발견된 문제가 없습니다.');
  });

  test('pipes inside values are escaped', () => {
    const s = schema.newSchema('pipe');
    s.Tables.push(
      schema.newTable({
        Name: 't',
        Columns: [schema.newColumn({ Name: 'c', DataType: 'TEXT', Comment: 'a | b' })],
      }),
    );
    expect(report.writeReport(s, { now })).toContain('a \\| b');
  });

  test('an empty schema still renders', () => {
    const md2 = report.writeReport(schema.newSchema('empty'), { now });
    expect(md2).toContain('(테이블 없음)');
    expect(md2).toContain('(관계 없음)');
  });
});

suite('HTML / PDF report', () => {
  const html = htmlReport.buildHtmlReport(sample, { projectPath, now });

  test('is a complete document', () => {
    expect(html.startsWith('<!doctype html>')).toBeTruthy();
    expect(html).toContain('</body></html>');
    expect(html).toContain('<meta charset="utf-8">');
  });

  test('the cover is its own printed page', () => {
    expect(html).toContain('<section class="cover">');
    expect(html).toContain('page-break-after: always');
    expect(html.indexOf('class="cover"')).toBeLessThanOrEqual(html.indexOf('<h1>데이터베이스 설계 보고서</h1>'));
  });

  test('the cover title is not given the section underline', () => {
    expect(html).toContain('border-bottom: none');
  });

  test('tables and relationships are rendered', () => {
    expect(html).toContain('<h2>테이블 목록</h2>');
    expect(html).toContain('<h2>관계 목록</h2>');
    expect(html).toContain('order_items');
  });

  test('HTML special characters are escaped', () => {
    const s = schema.newSchema('<script>');
    s.Tables.push(
      schema.newTable({ Name: 'a<b>', Columns: [schema.newColumn({ Name: 'c&d', DataType: 'TEXT' })] }),
    );
    const out = htmlReport.buildHtmlReport(s, { now });
    expect(out).toContain('a&lt;b&gt;');
    expect(out).toContain('c&amp;d');
    expect(out).notToContain('<script>');
  });

  test('an embedded ERD image is included when supplied', () => {
    const withImage = htmlReport.buildHtmlReport(sample, {
      now,
      erdImageDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(withImage).toContain('<h2>ERD 다이어그램</h2>');
    expect(withImage).toContain('data:image/png;base64,AAAA');
  });
});

const docxBytes = await word.exportWord(sample, { projectPath, now });

suite('Word export', () => {
  const bytes = docxBytes;

  test('produces a docx package', () => {
    expect(bytes.length).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK');
  });

  test('the document opens with a cover and a page break', async () => {
    const xml = await unzipText(bytes, 'word/document.xml');
    if (xml === null) return; // jszip unavailable — package shape already checked
    expect(xml).toContain('OnlineShop');
    expect(xml).toContain('w:br w:type="page"');
    expect(xml.indexOf('OnlineShop')).toBeLessThanOrEqual(xml.indexOf('w:br w:type="page"'));
  });

  test('the schema content is present', async () => {
    const xml = await unzipText(bytes, 'word/document.xml');
    if (xml === null) return;
    expect(xml).toContain('order_items');
    expect(xml).toContain('BIGSERIAL');
  });

  test('an empty schema still produces a document', async () => {
    const out = await word.exportWord(schema.newSchema('empty'), { now });
    expect(new TextDecoder().decode(out.slice(0, 2))).toBe('PK');
  });
});

const xlsxBytes = await excel.exportExcel(sample, { projectPath, now });

suite('Excel export', () => {
  const bytes = xlsxBytes;

  test('produces an xlsx package', () => {
    expect(bytes.length).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK');
  });

  test('the cover sheet comes first, followed by the data sheets', async () => {
    const xml = await unzipText(bytes, 'xl/workbook.xml');
    if (xml === null) return;
    for (const sheet of ['표지', '요약', '테이블', '관계', '정규화']) {
      expect(xml).toContain(sheet);
    }
    expect(xml.indexOf('표지')).toBeLessThanOrEqual(xml.indexOf('요약'));
  });

  test('an empty schema still produces a workbook', async () => {
    const out = await excel.exportExcel(schema.newSchema('empty'), { now });
    expect(new TextDecoder().decode(out.slice(0, 2))).toBe('PK');
  });
});
