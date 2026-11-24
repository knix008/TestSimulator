// The analysis report — normalization findings plus index advice, with the ERD
// drawn from the schema.
//
// One model, four renderings. `buildAnalysisModel` does all the analysis and
// counting; Markdown, HTML, PDF (Chromium printing the HTML) and Word only
// format what it returns, so the four documents cannot drift apart.
import type { DbSchema } from '../../types';
import {
  ALL_LEVELS,
  analyzeLevels,
  formatLevelsLabel,
  getLevelLabel,
  type NormalizationIssue,
  type NormalizationLevel,
} from '../analysis/normalization';
import { analyzeIndexes, type IndexSuggestion, type IndexSuggestionKind } from '../analysis/indexAdvisor';
import { buildCover, formatTimestamp, type CoverInfo } from './coverPage';
import { REPORT_STYLE, escapeHtml, renderCoverHtml, renderRunningHtml } from './reportStyle';
import {
  DEFAULT_REPORT_PREFS,
  HeadingNumberer,
  footerText,
  headerText,
  type ReportPrefs,
} from './reportOptions';
import { buildWordRunningParts } from './wordRunning';
import { buildFontCss, documentFontName, halfPoints, scaled, SCALE } from './reportFonts';
import { decodeDataUrl, embeddedImageSize } from './imageData';
import { ERD_MAX_HEIGHT, ERD_MAX_WIDTH } from './word';

const REPORT_HEADING = '데이터베이스 분석 보고서';

/** Actionable first — that is the order someone works through the list in. */
const KIND_ORDER: IndexSuggestionKind[] = ['Required', 'Recommended', 'Consider', 'AlreadyIndexed'];

export function severityLabel(severity: NormalizationIssue['Severity']): string {
  switch (severity) {
    case 'Error':
      return '오류';
    case 'Warning':
      return '경고';
    default:
      return '정보';
  }
}

export function kindLabel(kind: IndexSuggestionKind): string {
  switch (kind) {
    case 'Required':
      return '필수';
    case 'Recommended':
      return '권장';
    case 'Consider':
      return '검토';
    default:
      return '이미 인덱스';
  }
}

export interface AnalysisReportOptions {
  projectPath?: string | null;
  now?: Date;
  /** Levels to check. Defaults to all of them. */
  levels?: NormalizationLevel[];
  /** data: URL of the ERD as drawn on the canvas, embedded inline. */
  erdImageDataUrl?: string | null;
  /** User report settings — cover, numbering, header and footer. */
  report?: ReportPrefs;
}

export interface LevelSummary {
  level: NormalizationLevel;
  label: string;
  checked: boolean;
  issues: number;
  errors: number;
  /** A level with no Error-severity finding is considered satisfied. */
  passes: boolean;
}

export interface AnalysisReportModel {
  /** Null when the user turned the cover page off. */
  cover: CoverInfo | null;
  /** The settings this model was built with — the renderers read them back. */
  prefs: ReportPrefs;
  heading: string;
  timestamp: string;
  schemaName: string;
  targetDb: string;
  projectPath: string | null;
  tableCount: number;
  relationshipCount: number;
  erdImageDataUrl: string | null;

  levels: NormalizationLevel[];
  levelsLabel: string;
  levelSummaries: LevelSummary[];
  issues: NormalizationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** True when nothing of Error severity was found in the checked levels. */
  passes: boolean;

  suggestions: IndexSuggestion[];
  actionableSuggestions: number;
}

export function buildAnalysisModel(
  schema: DbSchema,
  options: AnalysisReportOptions = {},
): AnalysisReportModel {
  const levels =
    options.levels && options.levels.length > 0
      ? ALL_LEVELS.filter((l) => options.levels!.includes(l))
      : [...ALL_LEVELS];

  const issues = analyzeLevels(schema, levels);
  const suggestions = [...analyzeIndexes(schema)].sort(
    (a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind),
  );

  const count = (severity: NormalizationIssue['Severity']) =>
    issues.filter((i) => i.Severity === severity).length;

  const levelSummaries: LevelSummary[] = ALL_LEVELS.map((level) => {
    const forLevel = issues.filter((i) => i.Level === level);
    const errors = forLevel.filter((i) => i.Severity === 'Error').length;
    return {
      level,
      label: getLevelLabel(level),
      checked: levels.includes(level),
      issues: forLevel.length,
      errors,
      passes: errors === 0,
    };
  });

  const errorCount = count('Error');
  const now = options.now ?? new Date();
  const prefs = options.report ?? DEFAULT_REPORT_PREFS;

  return {
    cover: buildCover(schema, {
      projectPath: options.projectPath,
      now,
      heading: REPORT_HEADING,
      extraRows: [{ label: '검사 수준', value: formatLevelsLabel(levels) }],
      report: prefs,
    }),
    prefs,
    heading: REPORT_HEADING,
    timestamp: formatTimestamp(now),
    schemaName: schema.Name,
    targetDb: schema.TargetDb,
    projectPath: options.projectPath ?? null,
    tableCount: schema.Tables.length,
    relationshipCount: schema.Relationships.length,
    erdImageDataUrl: options.erdImageDataUrl ?? null,

    levels,
    levelsLabel: formatLevelsLabel(levels),
    levelSummaries,
    issues,
    errorCount,
    warningCount: count('Warning'),
    infoCount: count('Info'),
    passes: errorCount === 0,

    suggestions,
    actionableSuggestions: suggestions.filter((s) => s.Kind !== 'AlreadyIndexed').length,
  };
}

function verdictText(model: AnalysisReportModel): string {
  return model.passes
    ? `검사한 수준(${model.levelsLabel})에서 정규화 위반으로 볼 항목이 없습니다.`
    : `검사한 수준(${model.levelsLabel})에서 ${model.errorCount}건의 위반이 발견되었습니다.`;
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function escapeCell(value: string): string {
  return (value ?? '').split('|').join('\\|');
}

export function writeAnalysisMarkdown(
  schema: DbSchema,
  options: AnalysisReportOptions = {},
): string {
  const model = buildAnalysisModel(schema, options);
  const context = {
    schema,
    title: model.heading,
    projectPath: options.projectPath,
    now: options.now,
  };
  const n = new HeadingNumberer(model.prefs.HeadingNumberStyle);
  const lines: string[] = [];

  // Markdown has no pages: the running header and footer appear once, and page
  // numbers are simply not representable.
  const header = headerText(model.prefs, context);
  if (header) lines.push(`_${header}_`, '');

  // A title block and a rule read as a cover in every viewer and in every
  // Markdown-to-PDF converter.
  if (model.cover) {
    lines.push(`# ${model.cover.subject}`, '');
    lines.push(`### ${model.cover.heading}`, '');
    if (model.cover.attribution) lines.push(`**${model.cover.attribution}**`, '');
    for (const row of model.cover.rows) lines.push(`- **${row.label}**: ${row.value}`);
    lines.push('', `_${model.cover.producer}_`, '', '---', '');
  }

  lines.push(`# ${model.heading}`, '');
  lines.push(`- **스키마 이름**: ${model.schemaName}`);
  lines.push(`- **대상 DB**: ${model.targetDb}`);
  lines.push(`- **작성 일시**: ${model.timestamp}`);
  if (model.projectPath && model.projectPath.trim()) {
    lines.push(`- **프로젝트 파일**: ${model.projectPath}`);
  }
  lines.push(`- **테이블 수**: ${model.tableCount}`);
  lines.push(`- **관계 수**: ${model.relationshipCount}`);
  lines.push(`- **검사 수준**: ${model.levelsLabel}`);
  lines.push('');

  lines.push(`## ${n.headSection('요약')}`, '');
  lines.push(`> ${verdictText(model)}`, '');
  lines.push('| 항목 | 건수 |');
  lines.push('| --- | ---: |');
  lines.push(`| 오류 | ${model.errorCount} |`);
  lines.push(`| 경고 | ${model.warningCount} |`);
  lines.push(`| 정보 | ${model.infoCount} |`);
  lines.push(`| 인덱스 권장 | ${model.actionableSuggestions} |`);
  lines.push('');

  // The ERD as drawn on the canvas, embedded so the file stands alone.
  lines.push(`## ${n.headSection('ERD 다이어그램')}`, '');
  if (model.erdImageDataUrl) {
    lines.push(`![ERD 다이어그램](${model.erdImageDataUrl})`, '');
  } else {
    lines.push('(다이어그램 없음)', '');
  }

  lines.push(`## ${n.headSection('정규화 수준별 결과')}`, '');
  lines.push('| 수준 | 검사 | 판정 | 발견 |');
  lines.push('| --- | :---: | :---: | ---: |');
  for (const s of model.levelSummaries) {
    lines.push(
      `| ${s.label} | ${s.checked ? '✓' : ''} | ${s.checked ? (s.passes ? '충족' : '위반') : '-'} | ${s.checked ? s.issues : '-'} |`,
    );
  }
  lines.push('');

  lines.push(`## ${n.headSection('정규화 검사 결과')}`, '');
  if (model.issues.length === 0) {
    lines.push('발견된 문제가 없습니다.', '');
  } else {
    lines.push(`총 **${model.issues.length}**건의 항목이 발견되었습니다.`, '');
    for (const issue of model.issues) {
      lines.push(
        `### ${n.headSub(`[${getLevelLabel(issue.Level)}] ${issue.Table} — ${severityLabel(issue.Severity)}`)}`,
      );
      if (issue.AffectedColumns && issue.AffectedColumns.trim()) {
        lines.push(`- **문제 컬럼**: ${issue.AffectedColumns}`);
      }
      lines.push(`- **내용**: ${issue.Message}`);
      if (issue.Hint && issue.Hint.trim()) lines.push(`- **권장**: ${issue.Hint}`);
      lines.push('');
    }
  }

  lines.push(`## ${n.headSection('인덱스 권장 사항')}`, '');
  if (model.suggestions.length === 0) {
    lines.push('권장할 인덱스가 없습니다.', '');
  } else {
    lines.push('| 구분 | 테이블 | 컬럼 | 근거 | 권장 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const s of model.suggestions) {
      lines.push(
        [
          kindLabel(s.Kind),
          escapeCell(s.Table),
          escapeCell(s.Column),
          escapeCell(s.Reason),
          escapeCell(s.Recommendation),
        ].join(' | ') + ' |',
      );
    }
    lines.push('');
  }

  const footer = footerText(model.prefs, context);
  if (footer) lines.push('', '---', '', `_${footer}_`);
  return lines.join('\n');
}

// ─── HTML (and the source document for PDF) ──────────────────────────────────

export function buildAnalysisHtml(
  schema: DbSchema,
  options: AnalysisReportOptions = {},
): string {
  const model = buildAnalysisModel(schema, options);
  const running = renderRunningHtml(model.prefs, {
    schema,
    title: model.heading,
    projectPath: options.projectPath,
    now: options.now,
  });
  const n = new HeadingNumberer(model.prefs.HeadingNumberStyle);
  const parts: string[] = [];

  parts.push('<!doctype html><html lang="ko"><head><meta charset="utf-8">');
  parts.push(`<title>${escapeHtml(model.schemaName)} — ${escapeHtml(model.heading)}</title>`);
  parts.push(`<style>${REPORT_STYLE}${buildFontCss(model.prefs)}</style></head>`);
  parts.push(`<body class="${running.bodyClass}">`);
  parts.push(running.header);

  parts.push(renderCoverHtml(model.cover));

  parts.push(`<h1>${escapeHtml(model.heading)}</h1>`);
  parts.push('<ul class="meta">');
  parts.push(`<li><strong>스키마 이름</strong>: ${escapeHtml(model.schemaName)}</li>`);
  parts.push(`<li><strong>대상 DB</strong>: ${escapeHtml(model.targetDb)}</li>`);
  parts.push(`<li><strong>작성 일시</strong>: ${escapeHtml(model.timestamp)}</li>`);
  if (model.projectPath) {
    parts.push(`<li><strong>프로젝트 파일</strong>: ${escapeHtml(model.projectPath)}</li>`);
  }
  parts.push(`<li><strong>테이블 수</strong>: ${model.tableCount}</li>`);
  parts.push(`<li><strong>관계 수</strong>: ${model.relationshipCount}</li>`);
  parts.push(`<li><strong>검사 수준</strong>: ${escapeHtml(model.levelsLabel)}</li>`);
  parts.push('</ul>');

  parts.push(`<h2>${n.headSection('요약')}</h2>`);
  parts.push(
    `<p class="verdict ${model.passes ? 'pass' : 'fail'}">${escapeHtml(verdictText(model))}</p>`,
  );
  parts.push('<div class="cards">');
  const card = (kind: string, n: number, label: string) =>
    `<div class="card ${kind}"><span class="n">${n}</span><span class="k">${escapeHtml(label)}</span></div>`;
  parts.push(card(model.errorCount > 0 ? 'error' : 'good', model.errorCount, '오류'));
  parts.push(card('warning', model.warningCount, '경고'));
  parts.push(card('info', model.infoCount, '정보'));
  parts.push(card('info', model.actionableSuggestions, '인덱스 권장'));
  parts.push('</div>');

  // The ERD as drawn on the canvas.
  parts.push(`<h2>${n.headSection('ERD 다이어그램')}</h2>`);
  if (model.erdImageDataUrl) {
    parts.push(`<div class="erd"><img src="${model.erdImageDataUrl}" alt="ERD 다이어그램"></div>`);
  } else {
    parts.push('<p class="empty">(다이어그램 없음)</p>');
  }

  parts.push(`<h2>${n.headSection('정규화 수준별 결과')}</h2>`);
  parts.push(
    '<table><thead><tr><th>수준</th><th class="center">검사</th><th class="center">판정</th><th class="center">발견</th></tr></thead><tbody>',
  );
  for (const s of model.levelSummaries) {
    const verdict = !s.checked ? '-' : s.passes ? '충족' : '위반';
    const cls = !s.checked ? '' : s.passes ? 'sev-Info' : 'sev-Error';
    parts.push(
      `<tr><td>${s.label}</td><td class="center">${s.checked ? '✓' : ''}</td>` +
        `<td class="center ${cls}">${verdict}</td>` +
        `<td class="center">${s.checked ? s.issues : '-'}</td></tr>`,
    );
  }
  parts.push('</tbody></table>');

  parts.push(`<h2>${n.headSection('정규화 검사 결과')}</h2>`);
  if (model.issues.length === 0) {
    parts.push('<p>발견된 문제가 없습니다.</p>');
  } else {
    parts.push(`<p>총 <strong>${model.issues.length}</strong>건의 항목이 발견되었습니다.</p>`);
    parts.push(
      '<table><thead><tr><th>수준</th><th>심각도</th><th>테이블</th><th>문제 컬럼</th><th>내용</th><th>권장</th></tr></thead><tbody>',
    );
    for (const issue of model.issues) {
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

  parts.push(`<h2>${n.headSection('인덱스 권장 사항')}</h2>`);
  if (model.suggestions.length === 0) {
    parts.push('<p class="empty">권장할 인덱스가 없습니다.</p>');
  } else {
    parts.push(
      '<table><thead><tr><th>구분</th><th>테이블</th><th>컬럼</th><th>근거</th><th>권장</th></tr></thead><tbody>',
    );
    for (const s of model.suggestions) {
      parts.push('<tr>');
      parts.push(`<td>${escapeHtml(kindLabel(s.Kind))}</td>`);
      parts.push(`<td>${escapeHtml(s.Table)}</td>`);
      parts.push(`<td>${escapeHtml(s.Column)}</td>`);
      parts.push(`<td>${escapeHtml(s.Reason)}</td>`);
      parts.push(`<td>${escapeHtml(s.Recommendation)}</td>`);
      parts.push('</tr>');
    }
    parts.push('</tbody></table>');
  }

  parts.push(running.footer);
  parts.push('</body></html>');
  return parts.join('\n');
}

// ─── Word ────────────────────────────────────────────────────────────────────

export async function exportAnalysisWord(
  schema: DbSchema,
  options: AnalysisReportOptions = {},
): Promise<Uint8Array> {
  const model = buildAnalysisModel(schema, options);
  const n = new HeadingNumberer(model.prefs.HeadingNumberStyle);
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
  const cover = model.cover;
  if (cover) {
    children.push(new Paragraph({ text: '', spacing: { before: 2400 } }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: cover.heading,
            size: halfPoints(scaled(model.prefs, SCALE.coverHeading)),
            color: '6B7280',
            characterSpacing: 60,
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: cover.attribution ? 200 : 520 },
        // The title page's title: sized from the setting and heavy.
        children: [
          new TextRun({
            text: cover.subject,
            size: halfPoints(scaled(model.prefs, SCALE.coverTitle)),
            bold: true,
          }),
        ],
      }),
    );
    if (cover.attribution) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 460 },
          children: [new TextRun({ text: cover.attribution, size: 24, color: '374151' })],
        }),
      );
    }
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
        children: [
          new TextRun({ text: cover.producer, size: 18, color: '9CA3AF', characterSpacing: 40 }),
        ],
      }),
    );
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  children.push(new Paragraph({ text: model.heading, heading: HeadingLevel.HEADING_1 }));
  const meta = [
    `스키마 이름: ${model.schemaName}`,
    `대상 DB: ${model.targetDb}`,
    `작성 일시: ${model.timestamp}`,
    ...(model.projectPath ? [`프로젝트 파일: ${model.projectPath}`] : []),
    `테이블 수: ${model.tableCount}`,
    `관계 수: ${model.relationshipCount}`,
    `검사 수준: ${model.levelsLabel}`,
  ];
  for (const line of meta) children.push(new Paragraph({ text: line, bullet: { level: 0 } }));

  children.push(
    new Paragraph({ text: n.headSection('요약'), heading: HeadingLevel.HEADING_2 }),
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: verdictText(model), bold: true })],
    }),
  );
  children.push(
    table(
      ['항목', '건수'],
      [
        ['오류', String(model.errorCount)],
        ['경고', String(model.warningCount)],
        ['정보', String(model.infoCount)],
        ['인덱스 권장', String(model.actionableSuggestions)],
      ],
    ),
  );
  children.push(new Paragraph({ text: '' }));

  // The ERD as drawn on the canvas.
  children.push(
    new Paragraph({ text: n.headSection('ERD 다이어그램'), heading: HeadingLevel.HEADING_2 }),
  );
  if (model.erdImageDataUrl) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: decodeDataUrl(model.erdImageDataUrl),
            // The ERD keeps the proportions it has on the canvas — Word is told
            // the measured size, scaled to the page, not a fixed box.
            transformation: embeddedImageSize(
              model.erdImageDataUrl,
              ERD_MAX_WIDTH,
              ERD_MAX_HEIGHT,
            ),
          }),
        ],
      }),
    );
  } else {
    children.push(new Paragraph({ text: '(다이어그램 없음)' }));
  }

  children.push(
    new Paragraph({ text: n.headSection('정규화 수준별 결과'), heading: HeadingLevel.HEADING_2 }),
  );
  children.push(
    table(
      ['수준', '검사', '판정', '발견'],
      model.levelSummaries.map((s) => [
        s.label,
        s.checked ? '✓' : '',
        !s.checked ? '-' : s.passes ? '충족' : '위반',
        s.checked ? String(s.issues) : '-',
      ]),
    ),
  );
  children.push(new Paragraph({ text: '' }));

  children.push(
    new Paragraph({ text: n.headSection('정규화 검사 결과'), heading: HeadingLevel.HEADING_2 }),
  );
  if (model.issues.length === 0) {
    children.push(new Paragraph({ text: '발견된 문제가 없습니다.' }));
  } else {
    children.push(new Paragraph({ text: `총 ${model.issues.length}건의 항목이 발견되었습니다.` }));
    children.push(
      table(
        ['수준', '심각도', '테이블', '문제 컬럼', '내용', '권장'],
        model.issues.map((i) => [
          getLevelLabel(i.Level),
          severityLabel(i.Severity),
          i.Table,
          i.AffectedColumns,
          i.Message,
          i.Hint,
        ]),
      ),
    );
    children.push(new Paragraph({ text: '' }));
  }

  children.push(
    new Paragraph({ text: n.headSection('인덱스 권장 사항'), heading: HeadingLevel.HEADING_2 }),
  );
  if (model.suggestions.length === 0) {
    children.push(new Paragraph({ text: '권장할 인덱스가 없습니다.' }));
  } else {
    children.push(
      table(
        ['구분', '테이블', '컬럼', '근거', '권장'],
        model.suggestions.map((s) => [
          kindLabel(s.Kind),
          s.Table,
          s.Column,
          s.Reason,
          s.Recommendation,
        ]),
      ),
    );
  }

  const running = buildWordRunningParts(docx, model.prefs, {
    schema,
    title: model.heading,
    projectPath: options.projectPath,
    now: options.now,
  });

  const doc = new Document({
    creator: 'DBTools',
    title: `${schema.Name} ${REPORT_HEADING}`,
    styles: {
      default: {
        document: {
          run: {
            font: documentFontName(model.prefs.FontFamily),
            size: halfPoints(model.prefs.FontSize),
          },
        },
      },
    },
    sections: [{ children, ...running }],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
