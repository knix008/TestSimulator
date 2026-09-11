// Port of Export/WordExporter.cs, using the `docx` library instead of OpenXML SDK.
import type { DbSchema } from '../../types';
import { getRelationshipTypeLabel } from '../../types';
import { analyze, getLevelLabel } from '../analysis/normalization';
import { findColumn, findTable, getTypeDisplay } from '../schema';
import { buildCover } from './coverPage';

function mark(value: boolean): string {
  return value ? '✓' : '';
}

function endpoint(table: string | undefined, column: string | undefined): string {
  if (!table) return '?';
  return column ? `${table}.${column}` : table;
}

function severityLabel(severity: string): string {
  if (severity === 'Error') return '오류';
  if (severity === 'Warning') return '경고';
  return '정보';
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface WordExportOptions {
  projectPath?: string | null;
  erdImageDataUrl?: string | null;
  now?: Date;
}

export async function exportWord(
  schema: DbSchema,
  options: WordExportOptions = {},
): Promise<Uint8Array> {
  const docx = await import('docx');
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    ImageRun,
    PageBreak,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = docx;

  const cell = (text: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: text ?? '', bold, size: 18 })] })],
    });

  const table = (headers: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map((h) => cell(h, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) })),
      ],
    });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  // ── Cover page ──────────────────────────────────────────────────────────
  const cover = buildCover(schema, { projectPath: options.projectPath, now: options.now });
  // Push the title down the page so the cover reads as a title sheet.
  children.push(new Paragraph({ text: '', spacing: { before: 2400 } }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: cover.heading, size: 24, color: '6B7280', characterSpacing: 60 })],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 520 },
      children: [new TextRun({ text: cover.subject, size: 60, bold: true })],
    }),
  );
  for (const row of cover.rows) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 90 },
        children: [
          new TextRun({ text: `${row.label}   `, size: 20, color: '6B7280' }),
          new TextRun({ text: row.value, size: 20 }),
        ],
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 700 },
      children: [new TextRun({ text: cover.producer, size: 18, color: '9CA3AF', characterSpacing: 40 })],
    }),
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(
    new Paragraph({ text: '데이터베이스 설계 보고서', heading: HeadingLevel.HEADING_1 }),
  );
  const now = options.now ?? new Date();
  const meta = [
    `스키마 이름: ${schema.Name}`,
    `대상 DB: ${schema.TargetDb}`,
    `작성 일시: ${now.toLocaleString()}`,
    ...(options.projectPath ? [`프로젝트 파일: ${options.projectPath}`] : []),
    `테이블 수: ${schema.Tables.length}`,
    `관계 수: ${schema.Relationships.length}`,
  ];
  for (const line of meta) children.push(new Paragraph({ text: line, bullet: { level: 0 } }));

  if (options.erdImageDataUrl) {
    children.push(new Paragraph({ text: 'ERD 다이어그램', heading: HeadingLevel.HEADING_2 }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: decodeDataUrl(options.erdImageDataUrl),
            transformation: { width: 600, height: 420 },
          }),
        ],
      }),
    );
  }

  children.push(new Paragraph({ text: '테이블 목록', heading: HeadingLevel.HEADING_2 }));
  if (schema.Tables.length === 0) {
    children.push(new Paragraph({ text: '(테이블 없음)' }));
  } else {
    for (const t of schema.Tables) {
      children.push(new Paragraph({ text: t.Name, heading: HeadingLevel.HEADING_3 }));
      if (t.Comment) {
        children.push(new Paragraph({ children: [new TextRun({ text: t.Comment, italics: true })] }));
      }
      if (t.Columns.length === 0) {
        children.push(new Paragraph({ text: '(컬럼 없음)' }));
        continue;
      }
      children.push(
        table(
          ['컬럼', '타입', 'PK', '자동증가', 'NULL', 'UNIQUE', '기본값', '설명'],
          t.Columns.map((c) => [
            c.Name,
            getTypeDisplay(c),
            mark(c.IsPrimaryKey),
            mark(c.IsAutoIncrement),
            mark(c.IsNullable),
            mark(c.IsUnique),
            c.DefaultValue ?? '',
            c.Comment ?? '',
          ]),
        ),
      );
      children.push(new Paragraph({ text: '' }));
    }
  }

  children.push(new Paragraph({ text: '관계 목록', heading: HeadingLevel.HEADING_2 }));
  if (schema.Relationships.length === 0) {
    children.push(new Paragraph({ text: '(관계 없음)' }));
  } else {
    children.push(
      table(
        ['이름', '유형', '소스', '타겟'],
        schema.Relationships.map((rel) => {
          const st = findTable(schema, rel.SourceTableId);
          const tt = findTable(schema, rel.TargetTableId);
          const sc = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
          const tc = findColumn(schema, rel.TargetTableId, rel.TargetColumnId);
          return [
            rel.Name || '-',
            getRelationshipTypeLabel(rel.Type),
            endpoint(st?.Name, sc?.Name),
            endpoint(tt?.Name, tc?.Name),
          ];
        }),
      ),
    );
    children.push(new Paragraph({ text: '' }));
  }

  children.push(new Paragraph({ text: '정규화 검사 결과', heading: HeadingLevel.HEADING_2 }));
  const issues = analyze(schema);
  if (issues.length === 0) {
    children.push(new Paragraph({ text: '발견된 문제가 없습니다.' }));
  } else {
    children.push(new Paragraph({ text: `총 ${issues.length}건의 항목이 발견되었습니다.` }));
    children.push(
      table(
        ['수준', '심각도', '테이블', '문제 컬럼', '내용', '권장'],
        issues.map((i) => [
          getLevelLabel(i.Level),
          severityLabel(i.Severity),
          i.Table,
          i.AffectedColumns,
          i.Message,
          i.Hint,
        ]),
      ),
    );
  }

  const doc = new Document({
    creator: 'DBTools',
    title: `${schema.Name} 설계 보고서`,
    styles: {
      default: {
        document: { run: { font: 'Malgun Gothic', size: 20 } },
      },
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
