// Builds the analysis report as a structured document.
//
// Every export format (HTML, Markdown, Word, PDF) renders this same tree, so
// they can never drift apart: add a section here and all four gain it.
//
// Block kinds: heading | paragraph | table | list | keyValue | callout | chart

import { baseName } from '../core/languages.js';
import { INSPECTIONS, warningLevel } from '../core/settings.js';
import { crudLabel } from '../core/database.js';

export const REPORT_SECTIONS = [
  { id: 'overview', label: '개요', labelEn: 'Overview' },
  { id: 'health', label: '건강 점수', labelEn: 'Health score' },
  { id: 'priority', label: '우선 조치', labelEn: 'Priority actions' },
  { id: 'thresholds', label: '임계값', labelEn: 'Thresholds' },
  { id: 'quality', label: '품질 요약', labelEn: 'Quality summary' },
  { id: 'metrics', label: '코드 메트릭', labelEn: 'Code metrics' },
  { id: 'architecture', label: '아키텍처', labelEn: 'Architecture' },
  { id: 'duplicates', label: '중복 코드', labelEn: 'Duplicate code' },
  { id: 'globals', label: '전역 변수', labelEn: 'Global variables' },
  { id: 'database', label: '데이터베이스', labelEn: 'Database' },
  { id: 'bugRisk', label: '버그 위험', labelEn: 'Bug risk' },
  { id: 'security', label: '정보 보호 및 보안', labelEn: 'Security' },
  { id: 'glossary', label: '용어집', labelEn: 'Glossary' },
];

const TOP_N = 30;

/**
 * @param {object} result analysis result from core/analyze.js
 * @param {{lang?:'ko'|'en', sections?:string[], rootPath?:string, appInfo?:object}} options
 */
export function buildReport(result, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'ko';
  const t = (ko, en) => (lang === 'en' ? en : ko);
  const wanted = new Set(options.sections && options.sections.length ? options.sections : REPORT_SECTIONS.map((s) => s.id));
  const settings = result.settings;
  const blocks = [];

  const heading = (level, text, id) => blocks.push({ kind: 'heading', level, text, id });
  const para = (text) => blocks.push({ kind: 'paragraph', text });
  const table = (columns, rows, caption) => blocks.push({ kind: 'table', columns, rows, caption });
  const list = (items, ordered) => blocks.push({ kind: 'list', items, ordered: !!ordered });
  const keyValue = (pairs) => blocks.push({ kind: 'keyValue', pairs });
  const callout = (tone, text) => blocks.push({ kind: 'callout', tone, text });

  const title = t('코드 분석 보고서', 'Code Analysis Report');
  const subtitle = options.rootPath || result.settings.lastRootDirectory || '';

  // ------------------------------------------------------------ overview ---
  if (wanted.has('overview')) {
    heading(1, title, 'overview');
    if (subtitle) para(t('분석 대상: ', 'Target: ') + subtitle);
    keyValue([
      [t('분석 시각', 'Analyzed at'), new Date(result.generatedAt).toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR')],
      [t('분석 시간', 'Duration'), (result.durationMs / 1000).toFixed(1) + 's'],
      [t('파일', 'Files'), fmt(result.stats.fileCount)],
      [t('함수', 'Functions'), fmt(result.stats.functionCount)],
      [t('타입', 'Types'), fmt(result.stats.typeCount)],
      [t('코드 줄', 'Code lines'), fmt(result.summary.totalCodeLines)],
      [t('호출 관계', 'Call edges'), fmt(result.stats.edgeCount)],
    ]);

    if (result.languages.length > 0) {
      heading(2, t('프로그래밍 언어 구성', 'Language mix'));
      const totalLines = result.languages.reduce((acc, l) => acc + l.codeLines, 0) || 1;
      table(
        [t('언어', 'Language'), t('파일', 'Files'), t('코드 줄', 'Code lines'), t('비율', 'Share')],
        result.languages.map((l) => [
          l.displayName,
          fmt(l.files),
          fmt(l.codeLines),
          ((l.codeLines / totalLines) * 100).toFixed(1) + '%',
        ]),
      );
      blocks.push({
        kind: 'chart',
        chartType: 'bar',
        title: t('언어별 코드 줄', 'Code lines by language'),
        data: result.languages.map((l) => ({ label: l.displayName, value: l.codeLines })),
      });
    }
  }

  // -------------------------------------------------------------- health ---
  if (wanted.has('health')) {
    heading(1, t('코드 건강 점수', 'Code health score'), 'health');
    callout(
      result.health.score >= 80 ? 'ok' : result.health.score >= 60 ? 'warning' : 'critical',
      t(
        '종합 점수 ' + result.health.score + '점 (등급 ' + result.health.grade + '). 각 항목은 임계값을 통과한 비율을 가중 평균한 값입니다.',
        'Overall ' + result.health.score + ' / 100 (grade ' + result.health.grade + '), a weighted average of how much of the codebase clears each threshold.',
      ),
    );
    table(
      [t('항목', 'Dimension'), t('점수', 'Score'), t('가중치', 'Weight')],
      result.health.dimensions.map((d) => [lang === 'en' ? d.labelEn : d.label, d.percent + '%', String(d.weight)]),
    );
    blocks.push({
      kind: 'chart',
      chartType: 'bar',
      title: t('항목별 점수', 'Score by dimension'),
      data: result.health.dimensions.map((d) => ({ label: lang === 'en' ? d.labelEn : d.label, value: d.percent })),
      max: 100,
    });
  }

  // ------------------------------------------------------------ priority ---
  if (wanted.has('priority') && result.priorityActions.length > 0) {
    heading(1, t('우선 조치', 'Priority actions'), 'priority');
    para(
      t(
        '아래 순서대로 처리하면 같은 노력으로 가장 많은 위험을 줄일 수 있습니다.',
        'Working through these in order removes the most risk for the least effort.',
      ),
    );
    for (const action of result.priorityActions) {
      heading(2, action.priority + '. ' + (lang === 'en' ? action.titleEn : action.title));
      para(action.detail);
      if (action.items.length > 0) {
        list(action.items.slice(0, 10).map((item) => item.label + (item.detail ? '  —  ' + item.detail : '')));
      }
    }
  }

  // ---------------------------------------------------------- thresholds ---
  if (wanted.has('thresholds')) {
    heading(1, t('적용된 임계값', 'Thresholds in effect'), 'thresholds');
    para(
      t(
        '보고서의 "경고"는 아래 임계값 기준입니다. 값은 설정 → 분석 항목에서 프로젝트마다 조정할 수 있습니다.',
        'Every "warning" in this report is measured against these values, adjustable per project under Settings → Inspections.',
      ),
    );
    const enabled = new Set(settings.enabledInspections);
    table(
      [t('검사 항목', 'Inspection'), t('사용', 'Enabled'), t('비교', 'Comparison'), t('임계값', 'Threshold')],
      INSPECTIONS.filter((i) => i.threshold).map((i) => [
        lang === 'en' ? i.labelEn : i.label,
        enabled.has(i.id) ? 'O' : '-',
        i.threshold.compare === 'lt' ? '<' : '>=',
        String(settings[i.threshold.key]),
      ]),
    );
  }

  // ------------------------------------------------------------- quality ---
  if (wanted.has('quality')) {
    heading(1, t('품질 요약', 'Quality summary'), 'quality');
    const s = result.summary;
    table(
      [t('항목', 'Item'), t('건수', 'Count'), t('설명', 'Meaning')],
      [
        [t('높은 순환 복잡도', 'High cyclomatic complexity'), fmt(s.highCyclomaticCount), t('분기 경로가 많아 테스트가 어려운 함수', 'Functions with many branch paths')],
        [t('높은 인지 복잡도', 'High cognitive complexity'), fmt(s.highCognitiveCount), t('읽고 이해하기 어려운 함수', 'Functions that are hard to read')],
        [t('깊은 중첩', 'Deep nesting'), fmt(s.deepNestingCount), t('블록이 여러 겹 중첩된 함수', 'Deeply nested blocks')],
        [t('낮은 유지보수 지수', 'Low maintainability'), fmt(s.lowMaintenanceIndexCount), t('손대기 어려운 함수', 'Functions costly to change')],
        [t('매개변수 과다', 'Too many parameters'), fmt(s.highParameterCount), t('호출부에서 실수하기 쉬움', 'Easy to mis-call')],
        [t('빈 catch', 'Empty catch'), fmt(s.emptyCatchFunctionCount), t('예외가 조용히 사라지는 함수', 'Exceptions silently swallowed')],
        [t('광범위 catch', 'Broad catch'), fmt(s.broadCatchFunctionCount), t('모든 예외를 뭉뚱그려 잡는 함수', 'Catch-all handlers')],
        [t('async void', 'async void'), fmt(s.asyncVoidCount), t('예외가 호출자로 전파되지 않음', 'Exceptions never reach the caller')],
        [t('미사용 가능 함수', 'Possibly unused'), fmt(s.possiblyUnusedCount), t('호출 그래프에서 참조 없음', 'No caller found in the graph')],
        [t('God 파일', 'God files'), fmt(s.godFileCount), t('한 파일에 책임이 과도하게 모임', 'One file doing too much')],
        [t('God 타입', 'God types'), fmt(s.godTypeCount), t('멤버가 지나치게 많은 타입', 'Types with too many members')],
        [t('낮은 응집도 타입', 'Low cohesion types'), fmt(s.lowCohesionTypeCount), t('여러 책임을 겸하는 타입', 'Types with mixed responsibilities')],
        [t('깊은 상속', 'Deep inheritance'), fmt(s.deepInheritanceTypeCount), t('상속 계층이 깊은 타입', 'Long inheritance chains')],
        [t('순환 호출', 'Circular calls'), fmt(s.circularCallChainCount), t('호출 그래프의 순환', 'Cycles in the call graph')],
        [t('계층 위반', 'Layer violations'), fmt(s.layerViolationCount), t('역방향 계층 의존', 'Dependencies pointing the wrong way')],
        [t('중복 코드 그룹', 'Duplicate groups'), fmt(s.duplicateGroupCount), t('중복률 ' + s.projectDuplicateLinePercent + '%', s.projectDuplicateLinePercent + '% of code lines')],
        [t('보안 smell 파일', 'Files with security smells'), fmt(s.securitySmellFileCount), t('보안 규칙에 걸린 파일', 'Files matching a security rule')],
        [t('Git 핫스팟', 'Git hotspots'), fmt(s.gitHotspotFileCount), t('최근 변경이 잦은 파일', 'Files that change most often')],
        [t('테스트 코드 비율', 'Test code share'), s.testCodeLinePercent + '%', t('전체 코드 줄 대비(근사)', 'Approximate share of code lines')],
        [t('TODO 표시', 'TODO markers'), fmt(s.totalTodoMarkers), t('TODO/FIXME/HACK 등', 'TODO / FIXME / HACK markers')],
      ],
    );
  }

  // ------------------------------------------------------------- metrics ---
  if (wanted.has('metrics')) {
    heading(1, t('코드 메트릭', 'Code metrics'), 'metrics');

    heading(2, t('복잡도가 가장 높은 함수', 'Most complex functions'));
    const complex = [...result.functions].sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity).slice(0, TOP_N);
    table(
      [t('함수', 'Function'), t('파일', 'File'), t('줄', 'Line'), t('순환', 'Cyclo'), t('인지', 'Cognitive'), t('중첩', 'Nesting'), 'MI'],
      complex.map((fn) => [fn.displayName, baseName(fn.filePath), String(fn.startLine), String(fn.cyclomaticComplexity), String(fn.cognitiveComplexity), String(fn.maxNestingDepth), String(fn.maintenanceIndex)]),
    );

    heading(2, t('유지보수 지수가 가장 낮은 함수', 'Least maintainable functions'));
    const worst = [...result.functions].sort((a, b) => a.maintenanceIndex - b.maintenanceIndex).slice(0, TOP_N);
    table(
      [t('함수', 'Function'), t('파일', 'File'), 'MI', t('줄 수', 'Lines'), t('매개변수', 'Params'), 'Fan-out'],
      worst.map((fn) => [fn.displayName, baseName(fn.filePath), String(fn.maintenanceIndex), String(fn.lineCount), String(fn.parameterCount), String(fn.fanOut)]),
    );

    heading(2, t('가장 큰 파일', 'Largest files'));
    const biggest = [...result.files].sort((a, b) => b.codeLines - a.codeLines).slice(0, TOP_N);
    table(
      [t('파일', 'File'), t('코드 줄', 'Code'), t('주석 %', 'Comment %'), t('함수', 'Functions'), t('최대 복잡도', 'Max cyclo'), t('보안', 'Security')],
      biggest.map((f) => [
        baseName(f.filePath),
        fmt(f.codeLines),
        String(f.commentPercentPer100Code),
        String(f.functionCount),
        String(f.maxCyclomaticComplexity),
        String(f.securitySmellCount),
      ]),
    );

    if (result.packages.length > 0) {
      heading(2, t('패키지 지표', 'Package metrics'));
      table(
        [t('디렉터리', 'Directory'), 'Ca', 'Ce', 'I', 'A', 'D'],
        [...result.packages]
          .sort((a, b) => b.distanceFromMainSequence - a.distanceFromMainSequence)
          .slice(0, TOP_N)
          .map((p) => [
            p.displayName,
            String(p.afferentCoupling),
            String(p.efferentCoupling),
            String(p.instability),
            String(p.abstractness),
            String(p.distanceFromMainSequence),
          ]),
      );
    }
  }

  // -------------------------------------------------------- architecture ---
  if (wanted.has('architecture') && result.insights.length > 0) {
    heading(1, t('아키텍처 인사이트', 'Architecture insights'), 'architecture');
    for (const insight of result.insights) {
      heading(2, (lang === 'en' ? insight.titleEn : insight.title) + ' (' + insight.count + ')');
      para(insight.summary);
      callout('info', insight.advice);
      if (insight.items.length > 0) {
        list(insight.items.slice(0, 15).map((item) => item.label + (item.detail ? '  —  ' + item.detail : '')));
      }
    }
  }

  // ---------------------------------------------------------- duplicates ---
  if (wanted.has('duplicates')) {
    heading(1, t('중복 코드', 'Duplicate code'), 'duplicates');
    para(
      t(
        '최소 ' + result.duplicates.minDuplicateLines + '줄 연속 일치를 중복으로 봅니다. 전체 코드의 ' + result.summary.projectDuplicateLinePercent + '%가 중복입니다.',
        'A run of ' + result.duplicates.minDuplicateLines + '+ matching lines counts as a duplicate; ' + result.summary.projectDuplicateLinePercent + '% of code lines are duplicated.',
      ),
    );
    if (result.duplicates.groups.length === 0) {
      para(t('중복 그룹이 없습니다.', 'No duplicate groups found.'));
    } else {
      table(
        [t('줄 수', 'Lines'), t('중복 위치', 'Occurrences'), t('위치', 'Where')],
        result.duplicates.groups.slice(0, TOP_N).map((group) => [
          String(group.lineCount),
          String(group.occurrenceCount),
          group.fragments.map((f) => baseName(f.filePath) + ':' + f.startLine).join(', '),
        ]),
      );
    }
  }

  // ------------------------------------------------------------- globals ---
  if (wanted.has('globals')) {
    heading(1, t('전역 변수', 'Global variables'), 'globals');
    if (result.globals.length === 0) {
      para(t('전역·정적 변수를 찾지 못했습니다.', 'No global or static variables found.'));
    } else {
      const writes = new Map();
      const reads = new Map();
      for (const access of result.globalAccesses) {
        const target = access.kind === 'read' ? reads : writes;
        target.set(access.globalVariableId, (target.get(access.globalVariableId) || 0) + 1);
      }
      table(
        [t('변수', 'Variable'), t('파일', 'File'), t('줄', 'Line'), t('범위', 'Scope'), t('형식', 'Type'), t('읽기', 'Reads'), t('쓰기', 'Writes')],
        result.globals
          .slice()
          .sort((a, b) => (writes.get(b.id) || 0) - (writes.get(a.id) || 0))
          .slice(0, TOP_N * 2)
          .map((g) => [
            g.name,
            baseName(g.filePath),
            String(g.lineNumber),
            g.scope,
            g.typeName || '-',
            String(reads.get(g.id) || 0),
            String(writes.get(g.id) || 0),
          ]),
      );
    }
  }

  // ------------------------------------------------------------ database ---
  if (wanted.has('database')) {
    heading(1, t('데이터베이스', 'Database'), 'database');
    if (result.schema.tables.length === 0) {
      para(t('스키마 정의를 찾지 못했습니다.', 'No schema definitions found.'));
    } else {
      heading(2, t('테이블', 'Tables'));
      table(
        [t('테이블', 'Table'), t('출처', 'Source'), t('컬럼', 'Columns'), t('접근 함수', 'Accessing functions'), 'CRUD'],
        result.schema.tables.map((table_) => {
          const accesses = result.schema.accesses.filter((a) => a.tableId === table_.id);
          const ops = accesses.reduce((acc, a) => acc | a.operations, 0);
          return [table_.name, table_.sourceKind, String(table_.columns.length), String(accesses.length), crudLabel(ops)];
        }),
      );

      const withColumns = result.schema.tables.filter((tb) => tb.columns.length > 0).slice(0, 12);
      for (const table_ of withColumns) {
        heading(3, table_.name);
        table(
          [t('컬럼', 'Column'), t('자료형', 'Type'), 'PK', 'FK', 'NULL', t('참조', 'References')],
          table_.columns.map((c) => [
            c.name,
            c.dataType || '-',
            c.isPrimaryKey ? 'O' : '',
            c.isForeignKey ? 'O' : '',
            c.isNullable ? 'O' : '',
            c.referencedTable ? c.referencedTable + '.' + (c.referencedColumn || 'id') : '',
          ]),
        );
      }

      if (result.schema.relations.length > 0) {
        heading(2, t('관계', 'Relations'));
        list(result.schema.relations.map((r) => r.label + '  (' + r.kind + ', ' + r.cardinality + ')'));
      }
    }

    if (result.schema.catalogs.length > 0) {
      heading(2, t('데이터베이스 인스턴스', 'Database instances'));
      table(
        [t('이름', 'Name'), t('종류', 'Dialect'), t('출처', 'Source'), t('파일', 'File')],
        result.schema.catalogs.map((c) => [c.name, c.dialect, c.sourceKind, baseName(c.filePath || '')]),
      );
    }
  }

  // ------------------------------------------------------------ bug risk ---
  if (wanted.has('bugRisk')) {
    heading(1, t('버그 위험 분석', 'Bug risk'), 'bugRisk');
    para(
      t(
        '심각 ' + result.bugRisk.criticalCount + '건, 경고 ' + result.bugRisk.warningCount + '건, 정보 ' + result.bugRisk.infoCount + '건.',
        result.bugRisk.criticalCount + ' critical, ' + result.bugRisk.warningCount + ' warning, ' + result.bugRisk.infoCount + ' info.',
      ),
    );
    if (result.bugRisk.categories.length === 0) {
      para(t('검출된 위험 패턴이 없습니다.', 'No risk patterns detected.'));
    } else {
      table(
        [t('분류', 'Category'), t('심각도', 'Severity'), t('건수', 'Count')],
        result.bugRisk.categories.map((c) => [lang === 'en' ? c.labelEn : c.label, c.severity, String(c.count)]),
      );
      heading(2, t('주요 발견', 'Notable findings'));
      table(
        [t('심각도', 'Severity'), t('파일', 'File'), t('줄', 'Line'), t('내용', 'Message')],
        result.bugRisk.findings.slice(0, TOP_N * 2).map((f) => [f.severity, baseName(f.filePath), String(f.line), f.message]),
      );
    }
  }

  // ------------------------------------------------------------ security ---
  if (wanted.has('security')) {
    heading(1, t('정보 보호 및 보안', 'Security'), 'security');
    para(
      t(
        '심각 ' + result.security.criticalCount + '건, 경고 ' + result.security.warningCount + '건이 ' + result.security.affectedFileCount + '개 파일에서 발견되었습니다. 정적 휴리스틱이므로 전용 SAST 도구를 대체하지 않습니다.',
        result.security.criticalCount + ' critical and ' + result.security.warningCount + ' warning findings across ' + result.security.affectedFileCount + ' files. These are heuristics, not a replacement for a dedicated SAST tool.',
      ),
    );
    if (result.security.rules.length === 0) {
      para(t('보안 규칙에 걸린 코드가 없습니다.', 'No code matched a security rule.'));
    } else {
      for (const rule of result.security.rules) {
        heading(2, (lang === 'en' ? rule.labelEn : rule.label) + ' — ' + rule.hits.length + ' (' + rule.severity + ')');
        callout(rule.severity === 'critical' ? 'critical' : 'warning', rule.remediation);
        table(
          [t('파일', 'File'), t('줄', 'Line'), t('코드', 'Snippet')],
          rule.hits.slice(0, 20).map((hit) => [baseName(hit.filePath), String(hit.line), hit.snippet]),
        );
      }
    }
  }

  // ------------------------------------------------------------ glossary ---
  if (wanted.has('glossary')) {
    heading(1, t('용어집', 'Glossary'), 'glossary');
    table(
      [t('용어', 'Term'), t('뜻', 'Meaning')],
      [
        [t('순환 복잡도 (Cyclomatic)', 'Cyclomatic complexity'), t('함수를 통과하는 독립 실행 경로 수. 최소 테스트 케이스 수의 하한.', 'Number of independent paths through a function — a lower bound on test cases.')],
        [t('인지 복잡도 (Cognitive)', 'Cognitive complexity'), t('중첩 깊이에 가중치를 둔 복잡도. 사람이 읽는 부담에 가깝다.', 'Complexity weighted by nesting — closer to how hard the code is to read.')],
        ['MI', t('유지보수 지수(0~171). 높을수록 손대기 쉽다.', 'Maintainability index (0–171). Higher is easier to change.')],
        ['Fan-in / Fan-out', t('이 함수를 호출하는 곳 수 / 이 함수가 호출하는 곳 수.', 'How many functions call this one / how many it calls.')],
        ['LCOM', t('응집도 부족. 자기 필드를 쓰지 않는 메서드 비율.', 'Lack of cohesion — share of methods that touch none of the type’s fields.')],
        ['DIT / NOC', t('상속 깊이 / 직계 자식 타입 수.', 'Depth of inheritance tree / number of direct children.')],
        ['WMC / RFC', t('타입 내 메서드 복잡도 합 / 응답 집합 크기.', 'Sum of method complexity in a type / size of its response set.')],
        [t('불안정성 I', 'Instability (I)'), t('I = Ce / (Ca + Ce). 1에 가까울수록 외부 변경에 취약.', 'I = Ce / (Ca + Ce); closer to 1 means more exposed to outside change.')],
        [t('추상도 A', 'Abstractness (A)'), t('패키지 내 인터페이스·추상 타입 비율.', 'Share of interfaces and abstract types in a package.')],
        [t('주계열 거리 D', 'Distance (D)'), t('|A + I − 1|. 0에 가까울수록 균형 잡힌 패키지.', '|A + I − 1|; near 0 means a well-balanced package.')],
        ['Halstead', t('연산자·피연산자 어휘로 계산한 코드 규모.', 'Code size derived from operator/operand vocabulary.')],
        [t('중복률', 'Duplication rate'), t('중복으로 판정된 줄이 전체 코드 줄에서 차지하는 비율.', 'Share of code lines that are part of a duplicate block.')],
      ],
    );
    para(
      t(
        '정밀도 한계: 동적 호출, 리플렉션, 매크로, 조건부 컴파일, 런타임에 조립되는 SQL은 정적 분석이 놓칠 수 있습니다. Fan-in/out과 순환 호출은 호출 그래프에 포함된 함수에 한해 의미가 있습니다.',
        'Limits: dynamic dispatch, reflection, macros, conditional compilation and runtime-assembled SQL can be missed. Fan-in/out and cycles are only meaningful for functions the graph contains.',
      ),
    );
  }

  return {
    title,
    subtitle,
    lang,
    generatedAt: result.generatedAt,
    appInfo: options.appInfo || null,
    blocks,
  };
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

/** Convenience used by the CSV export and the metrics view. */
export function functionRowsForCsv(result) {
  const settings = result.settings;
  const header = [
    'file', 'language', 'function', 'startLine', 'endLine', 'lines',
    'cyclomatic', 'cognitive', 'nesting', 'parameters', 'returns', 'magicNumbers',
    'fanIn', 'fanOut', 'maintainabilityIndex', 'statements', 'switchCases',
    'halsteadVolume', 'emptyCatch', 'broadCatch', 'asyncVoid', 'isPublic',
    'possiblyUnused', 'precision', 'warnings',
  ];

  const rows = result.functions.map((fn) => {
    const warnings = [];
    for (const id of ['cyclomaticComplexity', 'cognitiveComplexity', 'nestingDepth', 'parameterCount', 'returnCount', 'magicNumbers', 'fanOut', 'maintenanceIndex', 'statementCount', 'switchCaseCount']) {
      const value = {
        cyclomaticComplexity: fn.cyclomaticComplexity,
        cognitiveComplexity: fn.cognitiveComplexity,
        nestingDepth: fn.maxNestingDepth,
        parameterCount: fn.parameterCount,
        returnCount: fn.returnCount,
        magicNumbers: fn.magicNumberCount,
        fanOut: fn.fanOut,
        maintenanceIndex: fn.maintenanceIndex,
        statementCount: fn.statementCount,
        switchCaseCount: fn.switchCaseCount,
      }[id];
      if (warningLevel(id, value, settings) !== 'none') warnings.push(id);
    }

    return [
      fn.filePath, fn.languageId, fn.displayName, fn.startLine, fn.endLine, fn.lineCount,
      fn.cyclomaticComplexity, fn.cognitiveComplexity, fn.maxNestingDepth, fn.parameterCount,
      fn.returnCount, fn.magicNumberCount, fn.fanIn, fn.fanOut, fn.maintenanceIndex,
      fn.statementCount, fn.switchCaseCount, fn.halsteadVolume, fn.emptyCatchCount,
      fn.broadCatchCount, fn.isAsyncVoid ? 1 : 0, fn.isPublic ? 1 : 0,
      fn.isPossiblyUnused ? 1 : 0, fn.precision, warnings.join('|'),
    ];
  });

  return { header, rows };
}
