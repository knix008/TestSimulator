// HTML rendering of the schema report. Also the source document for PDF export:
// Chromium prints it, so Korean text needs no embedded font.
import type { DbSchema } from '../../types';
import { getRelationshipTypeLabel } from '../../types';
import { analyze, getLevelLabel, type NormalizationIssue } from '../analysis/normalization';
import { findColumn, findTable, getTypeDisplay } from '../schema';
import { buildCover } from './coverPage';
import { REPORT_STYLE, escapeHtml, renderCoverHtml, renderRunningHtml } from './reportStyle';
import { DEFAULT_REPORT_PREFS, HeadingNumberer, type ReportPrefs } from './reportOptions';
import { buildFontCss } from './reportFonts';

const TITLE = '데이터베이스 설계 보고서';

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


export interface HtmlReportOptions {
  projectPath?: string | null;
  /** data: URL of the rendered ERD, embedded inline. */
  erdImageDataUrl?: string | null;
  now?: Date;
  /** User report settings — cover, numbering, header and footer. */
  report?: ReportPrefs;
}

export function buildHtmlReport(schema: DbSchema, options: HtmlReportOptions = {}): string {
  const prefs = options.report ?? DEFAULT_REPORT_PREFS;
  const running = renderRunningHtml(prefs, {
    schema,
    title: TITLE,
    projectPath: options.projectPath,
    now: options.now,
  });
  const n = new HeadingNumberer(prefs.HeadingNumberStyle);
  const issues = analyze(schema);
  const parts: string[] = [];

  parts.push('<!doctype html><html lang="ko"><head><meta charset="utf-8">');
  parts.push(`<title>${escapeHtml(schema.Name)} — ${TITLE}</title>`);
  parts.push(`<style>${REPORT_STYLE}${buildFontCss(prefs)}</style></head>`);
  parts.push(`<body class="${running.bodyClass}">`);
  parts.push(running.header);

  // ── Cover page ──────────────────────────────────────────────────────────
  parts.push(
    renderCoverHtml(
      buildCover(schema, {
        projectPath: options.projectPath,
        now: options.now,
        heading: TITLE,
        report: prefs,
      }),
    ),
  );

  parts.push(`<h1>${TITLE}</h1>`);

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
    parts.push(`<h2>${n.headSection('ERD 다이어그램')}</h2>`);
    parts.push(`<div class="erd"><img src="${options.erdImageDataUrl}" alt="ERD 다이어그램"></div>`);
  }

  parts.push(`<h2>${n.headSection('테이블 목록')}</h2>`);
  if (schema.Tables.length === 0) {
    parts.push('<p class="empty">(테이블 없음)</p>');
  } else {
    for (const table of schema.Tables) {
      parts.push(`<h3>${escapeHtml(n.headSub(table.Name))}</h3>`);
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

  parts.push(`<h2>${n.headSection('관계 목록')}</h2>`);
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

  parts.push(`<h2>${n.headSection('정규화 검사 결과')}</h2>`);
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

  parts.push(running.footer);
  parts.push('</body></html>');
  return parts.join('\n');
}
