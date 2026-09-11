// Port of Export/ExcelExporter.cs, using ExcelJS instead of ClosedXML.
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

export interface ExcelExportOptions {
  projectPath?: string | null;
  /** data: URL of the rendered ERD; added on its own sheet when present. */
  erdImageDataUrl?: string | null;
  now?: Date;
}

export async function exportExcel(
  schema: DbSchema,
  options: ExcelExportOptions = {},
): Promise<Uint8Array> {
  // ExcelJS is CommonJS: some bundlers hand back the module namespace, others
  // put the exports on `.default`. Accept either shape.
  const imported = await import('exceljs');
  const ExcelJS = imported.default ?? imported;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DBTools';
  workbook.created = options.now ?? new Date();

  // 표지 — Excel has no page concept, so the cover is its own leading sheet.
  const cover = buildCover(schema, { projectPath: options.projectPath, now: options.now });
  const coverSheet = workbook.addWorksheet('표지');
  coverSheet.columns = [{ width: 24 }, { width: 62 }];
  coverSheet.getCell('B3').value = cover.heading;
  coverSheet.getCell('B3').font = { size: 12, color: { argb: 'FF6B7280' } };
  coverSheet.getCell('B5').value = cover.subject;
  coverSheet.getCell('B5').font = { size: 26, bold: true };
  let coverRow = 8;
  for (const row of cover.rows) {
    coverSheet.getCell(`A${coverRow}`).value = row.label;
    coverSheet.getCell(`A${coverRow}`).font = { color: { argb: 'FF6B7280' } };
    coverSheet.getCell(`A${coverRow}`).alignment = { horizontal: 'right' };
    coverSheet.getCell(`B${coverRow}`).value = row.value;
    coverRow++;
  }
  coverSheet.getCell(`B${coverRow + 2}`).value = cover.producer;
  coverSheet.getCell(`B${coverRow + 2}`).font = { size: 9, color: { argb: 'FF9CA3AF' } };

  // 요약
  const summary = workbook.addWorksheet('요약');
  summary.addRow(['항목', '값']);
  summary.getRow(1).font = { bold: true };
  summary.addRow(['스키마 이름', schema.Name]);
  summary.addRow(['대상 DB', schema.TargetDb]);
  summary.addRow(['작성 일시', (options.now ?? new Date()).toLocaleString()]);
  if (options.projectPath) summary.addRow(['프로젝트 파일', options.projectPath]);
  summary.addRow(['테이블 수', schema.Tables.length]);
  summary.addRow(['관계 수', schema.Relationships.length]);
  summary.columns = [{ width: 20 }, { width: 60 }];

  // ERD
  if (options.erdImageDataUrl) {
    const sheet = workbook.addWorksheet('ERD');
    sheet.getCell('A1').value = 'ERD 다이어그램';
    sheet.getCell('A1').font = { bold: true };
    const base64 = options.erdImageDataUrl.split(',')[1] ?? '';
    const imageId = workbook.addImage({ base64, extension: 'png' });
    sheet.addImage(imageId, { tl: { col: 0, row: 1 }, ext: { width: 900, height: 620 } });
  }

  // 테이블
  const tables = workbook.addWorksheet('테이블');
  tables.addRow([
    '테이블', '테이블 설명', '컬럼', '타입', 'PK', '자동증가', 'NULL', 'UNIQUE', '기본값', '컬럼 설명',
  ]);
  tables.getRow(1).font = { bold: true };
  for (const table of schema.Tables) {
    if (table.Columns.length === 0) {
      tables.addRow([table.Name, table.Comment ?? '']);
      continue;
    }
    for (const column of table.Columns) {
      tables.addRow([
        table.Name,
        table.Comment ?? '',
        column.Name,
        getTypeDisplay(column),
        mark(column.IsPrimaryKey),
        mark(column.IsAutoIncrement),
        mark(column.IsNullable),
        mark(column.IsUnique),
        column.DefaultValue ?? '',
        column.Comment ?? '',
      ]);
    }
  }
  tables.columns = [
    { width: 20 }, { width: 24 }, { width: 22 }, { width: 18 }, { width: 6 },
    { width: 10 }, { width: 8 }, { width: 10 }, { width: 18 }, { width: 30 },
  ];

  // 관계
  const relationships = workbook.addWorksheet('관계');
  relationships.addRow(['이름', '유형', '소스', '타겟']);
  relationships.getRow(1).font = { bold: true };
  for (const rel of schema.Relationships) {
    const sourceTable = findTable(schema, rel.SourceTableId);
    const targetTable = findTable(schema, rel.TargetTableId);
    const sourceColumn = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
    const targetColumn = findColumn(schema, rel.TargetTableId, rel.TargetColumnId);
    relationships.addRow([
      rel.Name ?? '',
      getRelationshipTypeLabel(rel.Type),
      endpoint(sourceTable?.Name, sourceColumn?.Name),
      endpoint(targetTable?.Name, targetColumn?.Name),
    ]);
  }
  relationships.columns = [{ width: 28 }, { width: 8 }, { width: 30 }, { width: 30 }];

  // 정규화
  const normalization = workbook.addWorksheet('정규화');
  normalization.addRow(['수준', '심각도', '테이블', '문제 컬럼', '내용', '권장']);
  normalization.getRow(1).font = { bold: true };
  for (const issue of analyze(schema)) {
    normalization.addRow([
      getLevelLabel(issue.Level),
      severityLabel(issue.Severity),
      issue.Table,
      issue.AffectedColumns,
      issue.Message,
      issue.Hint,
    ]);
  }
  normalization.columns = [
    { width: 8 }, { width: 10 }, { width: 20 }, { width: 28 }, { width: 50 }, { width: 60 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
