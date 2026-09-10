// Metric aggregation: file, type and package rollups plus the project-wide
// quality summary that drives the dashboard, the architecture insights and the
// report's "priority actions" section.

import { dirName, baseName, getLanguage } from './languages.js';
import { countLines, countTodoMarkers, looksLikeTestFile } from './text.js';
import { warningLevel } from './settings.js';

/** Line-level metrics for a single file. */
export function fileLineMetrics(file, securityHits, gitChurn) {
  const counts = countLines(file.text);
  const todo = countTodoMarkers(file.text);
  const hits = securityHits || [];

  return {
    filePath: file.path,
    fileName: baseName(file.path),
    directory: dirName(file.path),
    languageId: file.languageId,
    physicalLines: counts.physical,
    codeLines: counts.code,
    blankLines: counts.blank,
    commentLines: counts.comment,
    commentPercentPer100Code: counts.code > 0 ? Number(((counts.comment / counts.code) * 100).toFixed(1)) : 0,
    todoMarkerCount: todo,
    todoDensityPer100Lines: counts.physical > 0 ? Number(((todo / counts.physical) * 100).toFixed(2)) : 0,
    isTestFile: looksLikeTestFile(file.path),
    securitySmellCount: hits.length,
    securitySmellSummary: [...new Set(hits.map((h) => h.label))].slice(0, 4).join(', '),
    gitChangeLineCount: gitChurn ? gitChurn[file.path] || 0 : 0,
  };
}

/** Rolls per-function metrics up to per-file aggregates. */
export function aggregateByFile(fileMetrics, functions, duplicateByFile) {
  const byFile = new Map();
  for (const fn of functions) {
    if (!byFile.has(fn.filePath)) byFile.set(fn.filePath, []);
    byFile.get(fn.filePath).push(fn);
  }

  return fileMetrics.map((file) => {
    const fns = byFile.get(file.filePath) || [];
    const publicApiCount = fns.filter((f) => f.isPublic).length;

    const agg = {
      ...file,
      functionCount: fns.length,
      publicApiCount,
      duplicateLineCount: (duplicateByFile && duplicateByFile.get(file.filePath)) || 0,
      maxCyclomaticComplexity: max(fns, 'cyclomaticComplexity'),
      maxCognitiveComplexity: max(fns, 'cognitiveComplexity'),
      maxNestingDepth: max(fns, 'maxNestingDepth'),
      maxFanIn: max(fns, 'fanIn'),
      maxFanOut: max(fns, 'fanOut'),
      maxReturnCount: max(fns, 'returnCount'),
      maxStatementCount: max(fns, 'statementCount'),
      maxSwitchCaseCount: max(fns, 'switchCaseCount'),
      avgCyclomaticComplexity: avg(fns, 'cyclomaticComplexity'),
      avgCognitiveComplexity: avg(fns, 'cognitiveComplexity'),
      avgMaintenanceIndex: avg(fns, 'maintenanceIndex'),
      minMaintenanceIndex: fns.length ? Math.min(...fns.map((f) => f.maintenanceIndex)) : 100,
      totalMagicNumbers: sum(fns, 'magicNumberCount'),
      totalEmptyCatchCount: sum(fns, 'emptyCatchCount'),
      totalBroadCatchCount: sum(fns, 'broadCatchCount'),
      asyncVoidCount: fns.filter((f) => f.isAsyncVoid).length,
      possiblyUnusedCount: fns.filter((f) => f.isPossiblyUnused).length,
    };
    return agg;
  });
}

/**
 * Type-level metrics. LCOM here is the share of a type's methods that do *not*
 * mention any of its fields — a cheap, language-agnostic stand-in for LCOM4
 * that still separates cohesive types from grab-bags.
 */
export function buildTypeMetrics(types, functions, settings) {
  const fnsByFile = new Map();
  for (const fn of functions) {
    if (!fnsByFile.has(fn.filePath)) fnsByFile.set(fn.filePath, []);
    fnsByFile.get(fn.filePath).push(fn);
  }

  const sortedTypesByFile = new Map();
  for (const type of types) {
    if (!sortedTypesByFile.has(type.filePath)) sortedTypesByFile.set(type.filePath, []);
    sortedTypesByFile.get(type.filePath).push(type);
  }
  for (const list of sortedTypesByFile.values()) list.sort((a, b) => a.lineNumber - b.lineNumber);

  return types.map((type) => {
    const siblings = sortedTypesByFile.get(type.filePath) || [];
    const index = siblings.indexOf(type);
    const nextLine = index >= 0 && index + 1 < siblings.length ? siblings[index + 1].lineNumber : Number.MAX_SAFE_INTEGER;

    const members = (fnsByFile.get(type.filePath) || []).filter(
      (fn) => fn.startLine >= type.lineNumber && fn.startLine < nextLine,
    );

    const fieldNames = type.attributes.map((a) => a.name).filter((n) => n && n.length > 1);
    const usingFields = members.filter((fn) =>
      fieldNames.some((field) => new RegExp('(?:^|[^\\w.])' + field + '(?![\\w])').test(fn.maskedBody || '')),
    );

    const lackOfCohesion =
      members.length === 0 || fieldNames.length === 0
        ? 0
        : Number((1 - usingFields.length / members.length).toFixed(2));

    const responseForClass = new Set(members.flatMap((fn) => fn.calleeNames || [])).size + members.length;

    return {
      id: type.id,
      displayName: type.displayName,
      fullName: type.fullName,
      filePath: type.filePath,
      languageId: type.languageId,
      lineNumber: type.lineNumber,
      kind: type.kind,
      memberCount: type.attributes.length + members.length,
      attributeCount: type.attributes.length,
      operationCount: members.length,
      matchedFunctionCount: members.length,
      maxCyclomaticComplexity: max(members, 'cyclomaticComplexity'),
      maxCognitiveComplexity: max(members, 'cognitiveComplexity'),
      minMaintenanceIndex: members.length ? Math.min(...members.map((f) => f.maintenanceIndex)) : 100,
      weightedMethodCount: sum(members, 'cyclomaticComplexity'),
      responseForClass,
      lackOfCohesion,
      depthOfInheritance: type.depthOfInheritance || 0,
      numberOfChildren: type.numberOfChildren || 0,
      inheritanceOutCount: type.inheritanceOutCount || 0,
      attributes: type.attributes,
      operations: members.map((fn) => ({ name: fn.displayName, signature: fn.signature })),
      warnings: {
        godType: warningLevel('godType', type.attributes.length + members.length, settings),
        typeCohesion: warningLevel('typeCohesion', lackOfCohesion, settings),
        inheritanceDepth: warningLevel('inheritanceDepth', type.depthOfInheritance || 0, settings),
      },
    };
  });
}

/**
 * Package (directory) metrics: Martin's afferent/efferent coupling and
 * instability, computed over the directory-level call graph.
 */
export function buildPackageMetrics(functions, graph, types) {
  const dirOf = new Map();
  for (const fn of functions) dirOf.set(fn.id, dirName(fn.filePath));

  const efferent = new Map(); // dir -> Set(dir it depends on)
  const afferent = new Map(); // dir -> Set(dir depending on it)
  const fileCount = new Map();
  const abstractCount = new Map();
  const typeCount = new Map();

  for (const fn of functions) {
    const dir = dirName(fn.filePath);
    if (!fileCount.has(dir)) fileCount.set(dir, new Set());
    fileCount.get(dir).add(fn.filePath);
  }

  for (const type of types) {
    const dir = dirName(type.filePath);
    typeCount.set(dir, (typeCount.get(dir) || 0) + 1);
    if (type.kind === 'interface') abstractCount.set(dir, (abstractCount.get(dir) || 0) + 1);
  }

  for (const edge of graph.edges) {
    const from = dirOf.get(edge.callerId);
    const to = dirOf.get(edge.calleeId);
    if (!from || !to || from === to) continue;
    if (!efferent.has(from)) efferent.set(from, new Set());
    efferent.get(from).add(to);
    if (!afferent.has(to)) afferent.set(to, new Set());
    afferent.get(to).add(from);
  }

  const dirs = new Set([...fileCount.keys(), ...typeCount.keys()]);
  return [...dirs]
    .map((dir) => {
      const ce = (efferent.get(dir) || new Set()).size;
      const ca = (afferent.get(dir) || new Set()).size;
      const instability = ce + ca === 0 ? 0 : Number((ce / (ce + ca)).toFixed(2));
      const total = typeCount.get(dir) || 0;
      const abstractness = total === 0 ? 0 : Number(((abstractCount.get(dir) || 0) / total).toFixed(2));
      return {
        directoryPath: dir,
        displayName: baseName(dir) || dir,
        fileCount: (fileCount.get(dir) || new Set()).size,
        typeCount: total,
        afferentCoupling: ca,
        efferentCoupling: ce,
        instability,
        abstractness,
        distanceFromMainSequence: Number(Math.abs(abstractness + instability - 1).toFixed(2)),
      };
    })
    .sort((a, b) => b.efferentCoupling - a.efferentCoupling || a.directoryPath.localeCompare(b.directoryPath));
}

/**
 * Layer violations: a call that runs *up* the conventional layering
 * (data → service → controller/ui), which inverts the dependency direction.
 */
const LAYER_ORDER = [
  { rank: 0, re: /(^|[/\\])(ui|view|views|pages|components|controllers?|api|web|forms?|screens?)([/\\]|$)/i },
  { rank: 1, re: /(^|[/\\])(services?|application|usecases?|handlers?|business|domain)([/\\]|$)/i },
  { rank: 2, re: /(^|[/\\])(repositor(y|ies)|data|dal|persistence|infrastructure|dao|models?|entities|store)([/\\]|$)/i },
];

export function findLayerViolations(functions, graph) {
  const layerOf = (filePath) => {
    for (const layer of LAYER_ORDER) if (layer.re.test(filePath)) return layer.rank;
    return -1;
  };

  const fnById = new Map(functions.map((f) => [f.id, f]));
  const violations = [];
  const seen = new Set();

  for (const edge of graph.edges) {
    const caller = fnById.get(edge.callerId);
    const callee = fnById.get(edge.calleeId);
    if (!caller || !callee) continue;

    const from = layerOf(caller.filePath);
    const to = layerOf(callee.filePath);
    if (from < 0 || to < 0 || from <= to) continue;

    const key = dirName(caller.filePath) + '->' + dirName(callee.filePath);
    if (seen.has(key)) continue;
    seen.add(key);

    violations.push({
      fromLayer: from,
      toLayer: to,
      callerId: caller.id,
      calleeId: callee.id,
      callerName: caller.fullName,
      calleeName: callee.fullName,
      callerFile: caller.filePath,
      calleeFile: callee.filePath,
      message: '하위 계층이 상위 계층을 호출합니다: ' + baseName(caller.filePath) + ' → ' + baseName(callee.filePath),
    });
  }

  return violations;
}

/** Project-wide quality summary. */
export function buildQualitySummary(context) {
  const { functions, fileAggregates, typeMetrics, packageMetrics, duplicates, circularChains, layerViolations, settings } = context;

  const totalCodeLines = fileAggregates.reduce((acc, f) => acc + f.codeLines, 0);
  const testCodeLines = fileAggregates.filter((f) => f.isTestFile).reduce((acc, f) => acc + f.codeLines, 0);

  const over = (list, id, pick) => list.filter((item) => warningLevel(id, pick(item), settings) !== 'none').length;

  return {
    totalFiles: fileAggregates.length,
    totalFunctions: functions.length,
    totalTypes: typeMetrics.length,
    totalCodeLines,
    totalPhysicalLines: fileAggregates.reduce((acc, f) => acc + f.physicalLines, 0),
    totalCommentLines: fileAggregates.reduce((acc, f) => acc + f.commentLines, 0),

    duplicateLineCount: duplicates.totalDuplicateLines,
    duplicateGroupCount: duplicates.groups.length,
    projectDuplicateLinePercent:
      totalCodeLines > 0 ? Number(((duplicates.totalDuplicateLines / totalCodeLines) * 100).toFixed(2)) : 0,

    circularCallChainCount: circularChains.length,
    layerViolationCount: layerViolations.length,

    highCyclomaticCount: over(functions, 'cyclomaticComplexity', (f) => f.cyclomaticComplexity),
    highCognitiveCount: over(functions, 'cognitiveComplexity', (f) => f.cognitiveComplexity),
    deepNestingCount: over(functions, 'nestingDepth', (f) => f.maxNestingDepth),
    highParameterCount: over(functions, 'parameterCount', (f) => f.parameterCount),
    highReturnCount: over(functions, 'returnCount', (f) => f.returnCount),
    highMagicNumberCount: over(functions, 'magicNumbers', (f) => f.magicNumberCount),
    highFanOutCount: over(functions, 'fanOut', (f) => f.fanOut),
    lowMaintenanceIndexCount: over(functions, 'maintenanceIndex', (f) => f.maintenanceIndex),
    highStatementCount: over(functions, 'statementCount', (f) => f.statementCount),
    highSwitchCaseCount: over(functions, 'switchCaseCount', (f) => f.switchCaseCount),
    emptyCatchFunctionCount: functions.filter((f) => f.emptyCatchCount > 0).length,
    broadCatchFunctionCount: functions.filter((f) => f.broadCatchCount > 0).length,
    asyncVoidCount: functions.filter((f) => f.isAsyncVoid).length,
    possiblyUnusedCount: functions.filter((f) => f.isPossiblyUnused).length,

    godFileCount: over(fileAggregates, 'godFile', (f) => f.codeLines),
    lowCommentFileCount: over(fileAggregates, 'lowCommentRatio', (f) => f.commentPercentPer100Code),
    highTodoDensityFileCount: over(fileAggregates, 'todoDensity', (f) => f.todoDensityPer100Lines),
    highPublicApiFileCount: over(fileAggregates, 'publicApiDensity', (f) => f.publicApiCount),
    securitySmellFileCount: fileAggregates.filter((f) => f.securitySmellCount > 0).length,
    gitHotspotFileCount: over(fileAggregates, 'gitHotspot', (f) => f.gitChangeLineCount),
    totalTodoMarkers: fileAggregates.reduce((acc, f) => acc + f.todoMarkerCount, 0),

    godTypeCount: typeMetrics.filter((t) => t.warnings.godType !== 'none').length,
    lowCohesionTypeCount: typeMetrics.filter((t) => t.warnings.typeCohesion !== 'none').length,
    deepInheritanceTypeCount: typeMetrics.filter((t) => t.warnings.inheritanceDepth !== 'none').length,
    highInstabilityPackageCount: over(packageMetrics, 'packageInstability', (p) => p.instability),

    testCodeLinePercent: totalCodeLines > 0 ? Number(((testCodeLines / totalCodeLines) * 100).toFixed(1)) : 0,
  };
}

/**
 * A 0–100 health score, so the dashboard can say something a person acts on
 * rather than only listing counts. Each dimension is the share of items that
 * cleared their threshold, weighted by how much it usually costs to fix.
 */
export function healthScore(summary) {
  const ratio = (bad, total) => (total <= 0 ? 1 : Math.max(0, 1 - bad / total));

  const dimensions = [
    { id: 'complexity', label: '복잡도', labelEn: 'Complexity', weight: 3, value: ratio(summary.highCyclomaticCount + summary.deepNestingCount, summary.totalFunctions * 2) },
    { id: 'maintainability', label: '유지보수성', labelEn: 'Maintainability', weight: 3, value: ratio(summary.lowMaintenanceIndexCount, summary.totalFunctions) },
    { id: 'duplication', label: '중복', labelEn: 'Duplication', weight: 2, value: Math.max(0, 1 - summary.projectDuplicateLinePercent / 25) },
    { id: 'structure', label: '구조', labelEn: 'Structure', weight: 2, value: ratio(summary.circularCallChainCount + summary.layerViolationCount, Math.max(20, summary.totalFiles)) },
    { id: 'safety', label: '오류 처리', labelEn: 'Error handling', weight: 2, value: ratio(summary.emptyCatchFunctionCount + summary.asyncVoidCount, Math.max(10, summary.totalFunctions)) },
    { id: 'security', label: '보안', labelEn: 'Security', weight: 3, value: ratio(summary.securitySmellFileCount, Math.max(5, summary.totalFiles)) },
    { id: 'documentation', label: '주석', labelEn: 'Comments', weight: 1, value: ratio(summary.lowCommentFileCount, Math.max(5, summary.totalFiles)) },
    { id: 'testing', label: '테스트', labelEn: 'Testing', weight: 2, value: Math.min(1, summary.testCodeLinePercent / 20) },
  ];

  const totalWeight = dimensions.reduce((acc, d) => acc + d.weight, 0);
  const score = dimensions.reduce((acc, d) => acc + d.weight * Math.min(1, Math.max(0, d.value)), 0) / totalWeight;

  return {
    score: Math.round(score * 100),
    grade: score >= 0.9 ? 'A' : score >= 0.8 ? 'B' : score >= 0.65 ? 'C' : score >= 0.5 ? 'D' : 'F',
    dimensions: dimensions.map((d) => ({ ...d, percent: Math.round(Math.min(1, Math.max(0, d.value)) * 100) })),
  };
}

function max(list, key) {
  let best = 0;
  for (const item of list) if (item[key] > best) best = item[key];
  return best;
}

function sum(list, key) {
  let total = 0;
  for (const item of list) total += item[key] || 0;
  return total;
}

function avg(list, key) {
  if (list.length === 0) return 0;
  return Number((sum(list, key) / list.length).toFixed(1));
}

export function languageBreakdown(fileMetrics) {
  const byLanguage = new Map();
  for (const file of fileMetrics) {
    if (!byLanguage.has(file.languageId)) {
      byLanguage.set(file.languageId, { languageId: file.languageId, files: 0, codeLines: 0, commentLines: 0 });
    }
    const entry = byLanguage.get(file.languageId);
    entry.files++;
    entry.codeLines += file.codeLines;
    entry.commentLines += file.commentLines;
  }
  return [...byLanguage.values()]
    .map((entry) => ({ ...entry, displayName: (getLanguage(entry.languageId) || {}).displayName || entry.languageId }))
    .sort((a, b) => b.codeLines - a.codeLines);
}
