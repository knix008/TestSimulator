// Port of Analysis/SchemaReportWriter.cs — the Markdown schema report.
import type { DbSchema } from '../../types';
import { getRelationshipTypeLabel } from '../../types';
import { findColumn, findTable, getTypeDisplay } from '../schema';
import { analyze, getLevelLabel, type NormalizationIssue } from './normalization';
import { buildCover } from '../export/coverPage';

function mark(value: boolean): string {
  return value ? '✓' : '';
}

function escapeCell(value: string): string {
  return (value ?? '').split('|').join('\\|');
}

function formatEndpoint(table: string | undefined, column: string | undefined): string {
  if (!table || !table.trim()) return '?';
  return column && column.trim() ? `${table}.${column}` : table;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function severityLabel(severity: NormalizationIssue['Severity']): string {
  switch (severity) {
    case 'Error':
      return '오류';
    case 'Warning':
      return '경고';
    default:
      return '정보';
  }
}

function appendTables(lines: string[], schema: DbSchema): void {
  lines.push('## 테이블 목록', '');
  if (schema.Tables.length === 0) {
    lines.push('(테이블 없음)', '');
    return;
  }
  for (const table of schema.Tables) {
    lines.push(`### ${table.Name}`);
    if (table.Comment && table.Comment.trim()) lines.push(`_${table.Comment}_`);
    lines.push('');
    if (table.Columns.length === 0) {
      lines.push('(컬럼 없음)', '');
      continue;
    }
    lines.push('| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |');
    lines.push('| --- | --- | :---: | :---: | :---: | :---: | --- | --- |');
    for (const column of table.Columns) {
      lines.push(
        [
          column.Name,
          getTypeDisplay(column),
          mark(column.IsPrimaryKey),
          mark(column.IsAutoIncrement),
          mark(column.IsNullable),
          mark(column.IsUnique),
          escapeCell(column.DefaultValue ?? ''),
          escapeCell(column.Comment ?? ''),
        ].join(' | ') + ' |',
      );
    }
    lines.push('');
  }
}

function appendRelationships(lines: string[], schema: DbSchema): void {
  lines.push('## 관계 목록', '');
  if (schema.Relationships.length === 0) {
    lines.push('(관계 없음)', '');
    return;
  }
  lines.push('| 이름 | 유형 | 소스 | 타겟 |');
  lines.push('| --- | --- | --- | --- |');
  for (const rel of schema.Relationships) {
    const sourceTable = findTable(schema, rel.SourceTableId);
    const targetTable = findTable(schema, rel.TargetTableId);
    const sourceColumn = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
    const targetColumn = findColumn(schema, rel.TargetTableId, rel.TargetColumnId);
    const name = rel.Name && rel.Name.trim() ? rel.Name : '-';
    lines.push(
      [
        escapeCell(name),
        getRelationshipTypeLabel(rel.Type),
        escapeCell(formatEndpoint(sourceTable?.Name, sourceColumn?.Name)),
        escapeCell(formatEndpoint(targetTable?.Name, targetColumn?.Name)),
      ].join(' | ') + ' |',
    );
  }
  lines.push('');
}

function appendNormalization(lines: string[], issues: NormalizationIssue[]): void {
  lines.push('## 정규화 검사 결과', '');
  if (issues.length === 0) {
    lines.push('발견된 문제가 없습니다.');
    return;
  }
  lines.push(`총 **${issues.length}**건의 항목이 발견되었습니다.`, '');
  for (const issue of issues) {
    lines.push(`### [${getLevelLabel(issue.Level)}] ${issue.Table} — ${severityLabel(issue.Severity)}`);
    lines.push(`- **내용**: ${issue.Message}`);
    if (issue.Hint && issue.Hint.trim()) lines.push(`- **권장**: ${issue.Hint}`);
    lines.push('');
  }
}

export interface ReportOptions {
  projectPath?: string | null;
  erdImageRelativePath?: string | null;
  now?: Date;
}

export function writeReport(schema: DbSchema, options: ReportOptions = {}): string {
  const issues = analyze(schema);
  const lines: string[] = [];

  // Cover page. Markdown has no page breaks, but a leading title block plus a
  // horizontal rule renders as a cover in every viewer and PDF converter.
  const cover = buildCover(schema, { projectPath: options.projectPath, now: options.now });
  lines.push(`# ${cover.subject}`, '');
  lines.push(`### ${cover.heading}`, '');
  for (const row of cover.rows) lines.push(`- **${row.label}**: ${row.value}`);
  lines.push('', `_${cover.producer}_`, '', '---', '');

  lines.push('# 데이터베이스 설계 보고서', '');
  lines.push(`- **스키마 이름**: ${schema.Name}`);
  lines.push(`- **대상 DB**: ${schema.TargetDb}`);
  lines.push(`- **작성 일시**: ${formatTimestamp(options.now ?? new Date())}`);
  if (options.projectPath && options.projectPath.trim()) {
    lines.push(`- **프로젝트 파일**: ${options.projectPath}`);
  }
  lines.push(`- **테이블 수**: ${schema.Tables.length}`);
  lines.push(`- **관계 수**: ${schema.Relationships.length}`);
  lines.push('');

  if (options.erdImageRelativePath && options.erdImageRelativePath.trim()) {
    lines.push('## ERD 다이어그램', '');
    lines.push(`![ERD 다이어그램](${options.erdImageRelativePath})`);
    lines.push('');
  }

  appendTables(lines, schema);
  appendRelationships(lines, schema);
  appendNormalization(lines, issues);
  return lines.join('\n');
}
