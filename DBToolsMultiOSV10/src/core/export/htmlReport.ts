// HTML rendering of the schema report. Also the source document for PDF export:
// Chromium prints it, so Korean text needs no embedded font.
import type { DbSchema } from '../../types';
import { getRelationshipTypeLabel } from '../../types';
import { analyze, getLevelLabel, type NormalizationIssue } from '../analysis/normalization';
import { findColumn, findTable, getTypeDisplay } from '../schema';
import { buildCover } from './coverPage';

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mark(value: boolean): string {
  return value ? '✓' : '';
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

function endpoint(table: string | undefined, column: string | undefined): string {
  if (!table) return '?';
  return column ? `${table}.${column}` : table;
}

const STYLE = `
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
`;

export interface HtmlReportOptions {
  projectPath?: string | null;
  /** data: URL of the rendered ERD, embedded inline. */
  erdImageDataUrl?: string | null;
  now?: Date;
}

export function buildHtmlReport(schema: DbSchema, options: HtmlReportOptions = {}): string {
  const issues = analyze(schema);
  const parts: string[] = [];

  parts.push('<!doctype html><html lang="ko"><head><meta charset="utf-8">');
  parts.push(`<title>${escapeHtml(schema.Name)} — 데이터베이스 설계 보고서</title>`);
  parts.push(`<style>${STYLE}</style></head><body>`);

  // ── Cover page ──────────────────────────────────────────────────────────
  const cover = buildCover(schema, { projectPath: options.projectPath, now: options.now });
  parts.push('<section class="cover">');
  parts.push('<div class="cover-rule"></div>');
  parts.push(`<p class="cover-heading">${escapeHtml(cover.heading)}</p>`);
  parts.push(`<h1 class="cover-subject">${escapeHtml(cover.subject)}</h1>`);
  parts.push('<table class="cover-meta"><tbody>');
  for (const row of cover.rows) {
    parts.push(
      `<tr><td class="k">${escapeHtml(row.label)}</td><td class="v">${escapeHtml(row.value)}</td></tr>`,
    );
  }
  parts.push('</tbody></table>');
  parts.push(`<p class="cover-producer">${escapeHtml(cover.producer)}</p>`);
  parts.push('</section>');

  parts.push('<h1>데이터베이스 설계 보고서</h1>');

  parts.push('<ul class="meta">');
  parts.push(`<li><strong>스키마 이름</strong>: ${escapeHtml(schema.Name)}</li>`);
  parts.push(`<li><strong>대상 DB</strong>: ${escapeHtml(schema.TargetDb)}</li>`);
  parts.push(`<li><strong>작성 일시</strong>: ${formatTimestamp(options.now ?? new Date())}</li>`);
  if (options.projectPath) {
    parts.push(`<li><strong>프로젝트 파일</strong>: ${escapeHtml(options.projectPath)}</li>`);
  }
  parts.push(`<li><strong>테이블 수</strong>: ${schema.Tables.length}</li>`);
  parts.push(`<li><strong>관계 수</strong>: ${schema.Relationships.length}</li>`);
  parts.push('</ul>');

  if (options.erdImageDataUrl) {
    parts.push('<h2>ERD 다이어그램</h2>');
    parts.push(`<div class="erd"><img src="${options.erdImageDataUrl}" alt="ERD 다이어그램"></div>`);
  }

  parts.push('<h2>테이블 목록</h2>');
  if (schema.Tables.length === 0) {
    parts.push('<p class="empty">(테이블 없음)</p>');
  } else {
    for (const table of schema.Tables) {
      parts.push(`<h3>${escapeHtml(table.Name)}</h3>`);
      if (table.Comment) parts.push(`<p class="comment">${escapeHtml(table.Comment)}</p>`);
      if (table.Columns.length === 0) {
        parts.push('<p class="empty">(컬럼 없음)</p>');
        continue;
      }
      parts.push('<table><thead><tr>');
      parts.push(
        '<th>컬럼</th><th>타입</th><th class="center">PK</th><th class="center">자동증가</th>' +
          '<th class="center">NULL</th><th class="center">UNIQUE</th><th>기본값</th><th>설명</th>',
      );
      parts.push('</tr></thead><tbody>');
      for (const column of table.Columns) {
        parts.push('<tr>');
        parts.push(`<td>${escapeHtml(column.Name)}</td>`);
        parts.push(`<td>${escapeHtml(getTypeDisplay(column))}</td>`);
        parts.push(`<td class="center">${mark(column.IsPrimaryKey)}</td>`);
        parts.push(`<td class="center">${mark(column.IsAutoIncrement)}</td>`);
        parts.push(`<td class="center">${mark(column.IsNullable)}</td>`);
        parts.push(`<td class="center">${mark(column.IsUnique)}</td>`);
        parts.push(`<td>${escapeHtml(column.DefaultValue ?? '')}</td>`);
        parts.push(`<td>${escapeHtml(column.Comment ?? '')}</td>`);
        parts.push('</tr>');
      }
      parts.push('</tbody></table>');
    }
  }

  parts.push('<h2>관계 목록</h2>');
  if (schema.Relationships.length === 0) {
    parts.push('<p class="empty">(관계 없음)</p>');
  } else {
    parts.push('<table><thead><tr><th>이름</th><th>유형</th><th>소스</th><th>타겟</th></tr></thead><tbody>');
    for (const rel of schema.Relationships) {
      const sourceTable = findTable(schema, rel.SourceTableId);
      const targetTable = findTable(schema, rel.TargetTableId);
      const sourceColumn = findColumn(schema, rel.SourceTableId, rel.SourceColumnId);
      const targetColumn = findColumn(schema, rel.TargetTableId, rel.TargetColumnId);
      parts.push('<tr>');
      parts.push(`<td>${escapeHtml(rel.Name || '-')}</td>`);
      parts.push(`<td>${getRelationshipTypeLabel(rel.Type)}</td>`);
      parts.push(`<td>${escapeHtml(endpoint(sourceTable?.Name, sourceColumn?.Name))}</td>`);
      parts.push(`<td>${escapeHtml(endpoint(targetTable?.Name, targetColumn?.Name))}</td>`);
      parts.push('</tr>');
    }
    parts.push('</tbody></table>');
  }

  parts.push('<h2>정규화 검사 결과</h2>');
  if (issues.length === 0) {
    parts.push('<p>발견된 문제가 없습니다.</p>');
  } else {
    parts.push(`<p>총 <strong>${issues.length}</strong>건의 항목이 발견되었습니다.</p>`);
    parts.push(
      '<table><thead><tr><th>수준</th><th>심각도</th><th>테이블</th><th>문제 컬럼</th><th>내용</th><th>권장</th></tr></thead><tbody>',
    );
    for (const issue of issues) {
      parts.push('<tr>');
      parts.push(`<td>${getLevelLabel(issue.Level)}</td>`);
      parts.push(`<td class="sev-${issue.Severity}">${severityLabel(issue.Severity)}</td>`);
      parts.push(`<td>${escapeHtml(issue.Table)}</td>`);
      parts.push(`<td>${escapeHtml(issue.AffectedColumns)}</td>`);
      parts.push(`<td>${escapeHtml(issue.Message)}</td>`);
      parts.push(`<td>${escapeHtml(issue.Hint)}</td>`);
      parts.push('</tr>');
    }
    parts.push('</tbody></table>');
  }

  parts.push('</body></html>');
  return parts.join('\n');
}
