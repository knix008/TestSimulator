// Architecture insights: the project-level observations that only emerge once
// the call graph, metrics, duplicates and DB analysis are all in hand.
//
// Each insight carries a severity, the items behind it and remediation advice,
// so the view, the summary dashboard and the report can share one source.

import { baseName, dirName } from './languages.js';
import { warningLevel } from './settings.js';

const MAX_ITEMS_PER_INSIGHT = 500;

/**
 * @returns {Array<{id,kind,severity,title,titleEn,summary,advice,count,items}>}
 */
export function buildArchitectureInsights(context) {
  const {
    functions,
    fileAggregates,
    typeMetrics,
    packageMetrics,
    graph,
    circularChains,
    duplicates,
    layerViolations,
    globals,
    globalAccesses,
    schema,
    securitySummary,
    fileRelations,
    directoryRelations,
    settings,
    enabled,
  } = context;

  const insights = [];
  const on = (id) => !enabled || enabled.has(id);

  const push = (insight) => {
    if (insight.count > 0) insights.push({ ...insight, items: insight.items.slice(0, MAX_ITEMS_PER_INSIGHT) });
  };

  if (on('circularCalls')) {
    push({
      id: 'circular-calls',
      kind: 'circularCall',
      severity: circularChains.length > 0 ? 'critical' : 'info',
      title: '순환 호출',
      titleEn: 'Circular calls',
      summary: circularChains.length + '개의 호출 순환이 있습니다. 순환은 변경 영향 범위를 예측할 수 없게 만들고 단위 테스트를 어렵게 합니다.',
      advice: '순환 고리에서 가장 약한 의존을 인터페이스·이벤트·콜백으로 뒤집어 끊으세요. 자기 재귀는 종료 조건이 명확한지 확인하면 됩니다.',
      count: circularChains.length,
      items: circularChains.map((chain) => ({
        label: chain.names.slice(0, 4).join(' → ') + (chain.names.length > 4 ? ' → …' : ''),
        detail: chain.length + '개 함수',
        nodeIds: chain.nodeIds,
      })),
    });
  }

  if (on('fanOutHub')) {
    const hubs = functions
      .filter((fn) => warningLevel('fanOut', fn.fanOut, settings) !== 'none')
      .sort((a, b) => b.fanOut - a.fanOut);
    push({
      id: 'fan-out-hub',
      kind: 'fanOutHub',
      severity: 'warning',
      title: 'Fan-out 허브',
      titleEn: 'Fan-out hubs',
      summary: hubs.length + '개 함수가 임계값(' + settings.warnFanOut + ') 이상의 함수를 직접 호출합니다.',
      advice: '조정 역할이 한 함수에 몰려 있습니다. 단계별 하위 함수로 분리하거나 파사드를 도입하세요.',
      count: hubs.length,
      items: hubs.map((fn) => ({ label: fn.fullName, detail: 'fan-out ' + fn.fanOut, id: fn.id, filePath: fn.filePath, line: fn.startLine })),
    });
  }

  if (on('fanInHub')) {
    const threshold = Math.max(5, settings.warnFanOut);
    const hubs = functions.filter((fn) => fn.fanIn >= threshold).sort((a, b) => b.fanIn - a.fanIn);
    push({
      id: 'fan-in-hub',
      kind: 'fanInHub',
      severity: 'info',
      title: 'Fan-in 허브',
      titleEn: 'Fan-in hubs',
      summary: hubs.length + '개 함수가 ' + threshold + '곳 이상에서 호출됩니다.',
      advice: '많이 쓰이는 만큼 변경 파급이 큽니다. 시그니처를 안정화하고 회귀 테스트를 우선 배치하세요.',
      count: hubs.length,
      items: hubs.map((fn) => ({ label: fn.fullName, detail: 'fan-in ' + fn.fanIn, id: fn.id, filePath: fn.filePath, line: fn.startLine })),
    });
  }

  if (on('isolatedFunctions')) {
    const isolated = functions.filter((fn) => fn.fanIn === 0 && fn.fanOut === 0);
    push({
      id: 'isolated-functions',
      kind: 'isolatedFunction',
      severity: 'info',
      title: '고립 함수',
      titleEn: 'Isolated functions',
      summary: isolated.length + '개 함수가 호출 그래프에서 아무와도 연결되어 있지 않습니다.',
      advice: '진입점·이벤트 핸들러·리플렉션 대상이 아니라면 삭제 후보입니다. 정적 분석이 놓치는 동적 호출도 함께 확인하세요.',
      count: isolated.length,
      items: isolated.map((fn) => ({ label: fn.fullName, detail: baseName(fn.filePath) + ':' + fn.startLine, id: fn.id, filePath: fn.filePath, line: fn.startLine })),
    });
  }

  if (on('godFile')) {
    const gods = fileAggregates
      .filter((f) => warningLevel('godFile', f.codeLines, settings) !== 'none')
      .sort((a, b) => b.codeLines - a.codeLines);
    push({
      id: 'god-files',
      kind: 'godFile',
      severity: 'warning',
      title: 'God 파일',
      titleEn: 'God files',
      summary: gods.length + '개 파일이 ' + settings.warnGodFileCodeLines + '줄 이상입니다.',
      advice: '파일 안에서 함께 바뀌는 함수끼리 묶어 별도 모듈로 분리하세요. 커밋 이력이 좋은 분리 기준이 됩니다.',
      count: gods.length,
      items: gods.map((f) => ({ label: baseName(f.filePath), detail: f.codeLines + '줄 / 함수 ' + f.functionCount + '개', filePath: f.filePath, line: 1 })),
    });
  }

  if (on('duplicateCodeGroups')) {
    push({
      id: 'duplicate-code',
      kind: 'duplicateCode',
      severity: duplicates.groups.length > 20 ? 'warning' : 'info',
      title: '중복 코드',
      titleEn: 'Duplicate code',
      summary: duplicates.groups.length + '개 중복 그룹, 총 ' + duplicates.totalDuplicateLines + '줄이 중복입니다.',
      advice: '가장 긴 그룹부터 공통 함수로 추출하세요. 중복은 한쪽만 고쳐지는 버그의 온상입니다.',
      count: duplicates.groups.length,
      items: duplicates.groups.map((group) => ({
        label: group.lineCount + '줄 × ' + group.occurrenceCount + '곳',
        detail: group.fragments.map((f) => baseName(f.filePath) + ':' + f.startLine).slice(0, 3).join(', '),
        filePath: group.fragments[0].filePath,
        line: group.fragments[0].startLine,
        groupId: group.id,
      })),
    });
  }

  if (on('fileCoupling')) {
    const coupled = fileRelations.edges.filter((e) => e.weight >= 5).sort((a, b) => b.weight - a.weight);
    push({
      id: 'file-coupling',
      kind: 'fileCoupling',
      severity: 'info',
      title: '파일 결합도',
      titleEn: 'File coupling',
      summary: coupled.length + '쌍의 파일이 5회 이상 서로를 호출합니다.',
      advice: '강하게 결합된 파일은 함께 바뀔 가능성이 높습니다. 하나로 합치거나 경계를 명확한 인터페이스로 정리하세요.',
      count: coupled.length,
      items: coupled.map((e) => ({ label: baseName(e.fromId) + ' → ' + baseName(e.toId), detail: e.weight + '회', filePath: e.fromId, line: 1 })),
    });
  }

  if (on('directoryCoupling')) {
    const coupled = directoryRelations.edges.filter((e) => e.weight >= 10).sort((a, b) => b.weight - a.weight);
    push({
      id: 'directory-coupling',
      kind: 'directoryCoupling',
      severity: 'info',
      title: '디렉터리 결합도',
      titleEn: 'Directory coupling',
      summary: coupled.length + '쌍의 디렉터리가 10회 이상 서로를 호출합니다.',
      advice: '모듈 경계를 넘는 호출이 많다면 경계 자체가 잘못 그어졌을 수 있습니다.',
      count: coupled.length,
      items: coupled.map((e) => ({ label: (baseName(e.fromId) || e.fromId) + ' → ' + (baseName(e.toId) || e.toId), detail: e.weight + '회' })),
    });
  }

  if (on('layerViolation')) {
    push({
      id: 'layer-violations',
      kind: 'layerViolation',
      severity: 'critical',
      title: '계층 위반',
      titleEn: 'Layer violations',
      summary: layerViolations.length + '건의 역방향 계층 의존이 있습니다 (데이터/서비스 계층이 UI를 호출).',
      advice: '의존 방향을 뒤집으세요. 하위 계층은 인터페이스만 노출하고, 상위 계층이 그 구현을 주입받아야 합니다.',
      count: layerViolations.length,
      items: layerViolations.map((v) => ({ label: v.message, detail: v.callerName + ' → ' + v.calleeName, filePath: v.callerFile, line: 1 })),
    });
  }

  if (on('packageInstability')) {
    const unstable = packageMetrics
      .filter((p) => warningLevel('packageInstability', p.instability, settings) !== 'none')
      .sort((a, b) => b.instability - a.instability);
    push({
      id: 'package-instability',
      kind: 'packageInstability',
      severity: 'warning',
      title: '불안정 패키지',
      titleEn: 'Unstable packages',
      summary: unstable.length + '개 디렉터리의 불안정성(I)이 ' + settings.warnInstability + ' 이상입니다.',
      advice: 'I가 높은 패키지는 외부 변경에 끌려다닙니다. 추상화를 올리거나(A↑) 의존을 줄여(Ce↓) 주계열에 가깝게 만드세요.',
      count: unstable.length,
      items: unstable.map((p) => ({
        label: baseName(p.directoryPath) || p.directoryPath,
        detail: 'I=' + p.instability + ' · A=' + p.abstractness + ' · D=' + p.distanceFromMainSequence,
        filePath: p.directoryPath,
      })),
    });
  }

  if (on('typeCohesion')) {
    const low = typeMetrics.filter((t) => t.warnings.typeCohesion !== 'none').sort((a, b) => b.lackOfCohesion - a.lackOfCohesion);
    push({
      id: 'type-cohesion',
      kind: 'typeStructure',
      severity: 'warning',
      title: '응집도 낮은 타입',
      titleEn: 'Low-cohesion types',
      summary: low.length + '개 타입에서 메서드 상당수가 자기 필드를 쓰지 않습니다 (LCOM ≥ ' + settings.warnLackOfCohesion + ').',
      advice: '한 타입이 여러 책임을 겸하고 있습니다. 필드를 함께 쓰는 메서드 묶음별로 타입을 나누세요.',
      count: low.length,
      items: low.map((t) => ({ label: t.fullName, detail: 'LCOM=' + t.lackOfCohesion + ' · 멤버 ' + t.memberCount, filePath: t.filePath, line: t.lineNumber })),
    });
  }

  if (on('inheritanceDepth')) {
    const deep = typeMetrics.filter((t) => t.warnings.inheritanceDepth !== 'none').sort((a, b) => b.depthOfInheritance - a.depthOfInheritance);
    push({
      id: 'inheritance-depth',
      kind: 'typeStructure',
      severity: 'warning',
      title: '깊은 상속',
      titleEn: 'Deep inheritance',
      summary: deep.length + '개 타입의 상속 깊이가 ' + settings.warnInheritanceDepth + ' 이상입니다.',
      advice: '상속 대신 합성(composition)을 검토하세요. 깊은 계층은 어느 조상이 동작을 결정하는지 추적하기 어렵습니다.',
      count: deep.length,
      items: deep.map((t) => ({ label: t.fullName, detail: 'DIT=' + t.depthOfInheritance, filePath: t.filePath, line: t.lineNumber })),
    });
  }

  if (on('globalVariables')) {
    const writeCounts = new Map();
    for (const access of globalAccesses) {
      if (access.kind === 'read') continue;
      writeCounts.set(access.globalVariableId, (writeCounts.get(access.globalVariableId) || 0) + 1);
    }
    const shared = globals
      .filter((g) => !g.isConst && (writeCounts.get(g.id) || 0) >= 2)
      .sort((a, b) => (writeCounts.get(b.id) || 0) - (writeCounts.get(a.id) || 0));
    push({
      id: 'global-variables',
      kind: 'globalVariable',
      severity: 'warning',
      title: '여러 곳에서 쓰는 전역 변수',
      titleEn: 'Widely written globals',
      summary: shared.length + '개의 비상수 전역 변수를 두 곳 이상에서 씁니다.',
      advice: '쓰기 지점이 흩어진 전역 상태는 경쟁 조건과 재현 불가 버그의 원인입니다. 소유자를 하나로 정하고 접근을 함수로 감싸세요.',
      count: shared.length,
      items: shared.map((g) => ({
        label: g.fullName,
        detail: '쓰기 ' + (writeCounts.get(g.id) || 0) + '곳' + (g.typeName ? ' · ' + g.typeName : ''),
        filePath: g.filePath,
        line: g.lineNumber,
        id: g.id,
      })),
    });
  }

  if (on('databaseSchema') && schema) {
    const orphanTables = schema.tables.filter((t) => !schema.accesses.some((a) => a.tableId === t.id));
    push({
      id: 'db-unused-tables',
      kind: 'databaseSchema',
      severity: 'info',
      title: '접근 코드가 없는 테이블',
      titleEn: 'Tables with no code access',
      summary: orphanTables.length + '개 테이블에 대한 접근 코드를 찾지 못했습니다.',
      advice: '동적으로 조립되는 SQL이거나 실제로 쓰이지 않는 테이블입니다. 후자라면 마이그레이션으로 정리하세요.',
      count: orphanTables.length,
      items: orphanTables.map((t) => ({ label: t.name, detail: t.sourceKind + ' · 컬럼 ' + t.columns.length + '개', filePath: t.filePath, line: t.lineNumber })),
    });

    const writeHeavy = new Map();
    for (const access of schema.accesses) {
      if (access.kind === 'read') continue;
      writeHeavy.set(access.tableId, (writeHeavy.get(access.tableId) || 0) + 1);
    }
    const hot = [...writeHeavy.entries()]
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1]);
    push({
      id: 'db-write-hotspots',
      kind: 'databaseSchema',
      severity: 'info',
      title: '쓰기 집중 테이블',
      titleEn: 'Write-heavy tables',
      summary: hot.length + '개 테이블을 5곳 이상에서 변경합니다.',
      advice: '쓰기 경로가 흩어져 있으면 불변식이 깨지기 쉽습니다. 저장소(repository) 한 곳으로 모으세요.',
      count: hot.length,
      items: hot.map(([tableId, count]) => {
        const table = schema.tables.find((t) => t.id === tableId);
        return { label: (table && table.name) || tableId, detail: '쓰기 함수 ' + count + '개' };
      }),
    });
  }

  if (on('securitySmells') && securitySummary) {
    push({
      id: 'security-smells',
      kind: 'security',
      severity: securitySummary.criticalCount > 0 ? 'critical' : 'warning',
      title: '보안 취약 패턴',
      titleEn: 'Security smells',
      summary:
        '심각 ' + securitySummary.criticalCount + '건, 경고 ' + securitySummary.warningCount +
        '건이 ' + securitySummary.affectedFileCount + '개 파일에서 발견되었습니다.',
      advice: '심각 항목부터 처리하세요. 하드코딩된 비밀은 값 자체를 폐기·회전해야 하며, 코드에서 지우는 것만으로는 끝나지 않습니다.',
      count: securitySummary.total,
      items: securitySummary.rules.map((rule) => ({
        label: rule.label,
        detail: rule.hits.length + '건 · ' + rule.severity,
        ruleId: rule.ruleId,
      })),
    });
  }

  if (on('gitHotspot')) {
    const hotspots = fileAggregates
      .filter((f) => warningLevel('gitHotspot', f.gitChangeLineCount, settings) !== 'none')
      .sort((a, b) => b.gitChangeLineCount - a.gitChangeLineCount);
    push({
      id: 'git-hotspots',
      kind: 'gitHotspot',
      severity: 'warning',
      title: 'Git 변경 핫스팟',
      titleEn: 'Git change hotspots',
      summary: hotspots.length + '개 파일이 최근 1년간 ' + settings.warnGitChangeLines + '줄 이상 바뀌었습니다.',
      advice: '자주 바뀌면서 복잡한 파일이 리팩터링 투자 대비 효과가 가장 큽니다. 복잡도 열과 함께 보세요.',
      count: hotspots.length,
      items: hotspots.map((f) => ({
        label: baseName(f.filePath),
        detail: f.gitChangeLineCount + '줄 변경 · 최대 복잡도 ' + f.maxCyclomaticComplexity,
        filePath: f.filePath,
        line: 1,
      })),
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count);
}

/**
 * The short "do this first" list: the highest-leverage items across every
 * dimension, ranked by severity then by how much of the codebase they touch.
 */
export function buildPriorityActions(context, insights) {
  const { functions, fileAggregates, settings } = context;
  const actions = [];

  const worstFunctions = [...functions]
    .filter((fn) => warningLevel('maintenanceIndex', fn.maintenanceIndex, settings) === 'critical')
    .sort((a, b) => a.maintenanceIndex - b.maintenanceIndex)
    .slice(0, 10);

  if (worstFunctions.length > 0) {
    actions.push({
      priority: 1,
      title: '유지보수 지수가 가장 낮은 함수 분해',
      titleEn: 'Break up the least maintainable functions',
      detail:
        worstFunctions.length + '개 함수의 MI가 임계값(' + settings.warnMaintenanceIndex +
        ')의 절반 미만입니다. 가장 낮은 것부터 조기 반환·함수 추출로 분해하세요.',
      items: worstFunctions.map((fn) => ({
        label: fn.fullName,
        detail: 'MI ' + fn.maintenanceIndex + ' · 복잡도 ' + fn.cyclomaticComplexity + ' · ' + fn.lineCount + '줄',
        filePath: fn.filePath,
        line: fn.startLine,
      })),
    });
  }

  const critical = insights.filter((i) => i.severity === 'critical' && i.count > 0);
  critical.forEach((insight, index) => {
    actions.push({
      priority: actions.length + 1 + index * 0,
      title: insight.title + ' 해소',
      titleEn: 'Resolve: ' + insight.titleEn,
      detail: insight.summary + ' ' + insight.advice,
      items: insight.items.slice(0, 10),
    });
  });

  const hotspotRisk = fileAggregates
    .filter(
      (f) =>
        warningLevel('gitHotspot', f.gitChangeLineCount, settings) !== 'none' &&
        warningLevel('cyclomaticComplexity', f.maxCyclomaticComplexity, settings) !== 'none',
    )
    .sort((a, b) => b.gitChangeLineCount - a.gitChangeLineCount)
    .slice(0, 10);

  if (hotspotRisk.length > 0) {
    actions.push({
      priority: actions.length + 1,
      title: '자주 바뀌면서 복잡한 파일 우선 리팩터링',
      titleEn: 'Refactor complex files that change often',
      detail: '변경 빈도와 복잡도가 모두 높은 파일입니다. 같은 노력으로 가장 많은 결함을 예방할 수 있는 지점입니다.',
      items: hotspotRisk.map((f) => ({
        label: baseName(f.filePath),
        detail: f.gitChangeLineCount + '줄 변경 · 최대 복잡도 ' + f.maxCyclomaticComplexity,
        filePath: f.filePath,
        line: 1,
      })),
    });
  }

  return actions.map((action, index) => ({ ...action, priority: index + 1 })).slice(0, 8);
}

/** Directory tree rollup used by the project-structure view. */
export function buildDirectoryTree(fileAggregates) {
  const nodes = new Map();

  const ensure = (path) => {
    if (nodes.has(path)) return nodes.get(path);
    const node = {
      path,
      name: baseName(path) || path,
      children: [],
      fileCount: 0,
      codeLines: 0,
      functionCount: 0,
    };
    nodes.set(path, node);
    const parent = dirName(path);
    if (parent && parent !== path) ensure(parent).children.push(node);
    return node;
  };

  for (const file of fileAggregates) {
    const dir = ensure(file.directory);
    dir.fileCount++;
    dir.codeLines += file.codeLines;
    dir.functionCount += file.functionCount;
  }

  // Roll child totals up to the ancestors.
  const roots = [...nodes.values()].filter((node) => !nodes.has(dirName(node.path)) || dirName(node.path) === node.path);
  const rollup = (node, seen) => {
    if (seen.has(node.path)) return { fileCount: 0, codeLines: 0, functionCount: 0 };
    seen.add(node.path);
    let files = node.fileCount;
    let lines = node.codeLines;
    let fns = node.functionCount;
    for (const child of node.children) {
      const sub = rollup(child, seen);
      files += sub.fileCount;
      lines += sub.codeLines;
      fns += sub.functionCount;
    }
    node.totalFileCount = files;
    node.totalCodeLines = lines;
    node.totalFunctionCount = fns;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    return { fileCount: files, codeLines: lines, functionCount: fns };
  };

  const seen = new Set();
  for (const root of roots) rollup(root, seen);
  return roots.sort((a, b) => a.path.localeCompare(b.path));
}
