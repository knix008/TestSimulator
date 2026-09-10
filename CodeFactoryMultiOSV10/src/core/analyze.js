// The analysis orchestrator.
//
// Takes raw source files plus settings and produces the single result object
// every view, export and report reads from. It is deliberately free of any
// platform API — the same function runs in a browser worker, in Electron and in
// `node --test`, which is what makes the test suite meaningful.

import { LANGUAGES, getLanguage, languageForPath, baseName, dirName } from './languages.js';
import { maskSource, buildLineStarts } from './text.js';
import { extractFunctions } from './functions.js';
import { extractTypes, linkTypes } from './structure.js';
import { measureFunction } from './complexity.js';
import { buildCallGraph, computeFanMetrics, findCircularCallChains } from './callGraph.js';
import { extractGlobals, analyzeGlobalAccess } from './globals.js';
import { findDuplicates } from './duplicates.js';
import { scanBugRisk, metricsBugRisk, summarizeBugRisk } from './bugRisk.js';
import { scanSecurity, summarizeSecurity } from './security.js';
import { extractSchema, extractCatalogs, analyzeTableAccess, analyzeCatalogAccess } from './database.js';
import {
  fileLineMetrics,
  aggregateByFile,
  buildTypeMetrics,
  buildPackageMetrics,
  findLayerViolations,
  buildQualitySummary,
  healthScore,
  languageBreakdown,
} from './metrics.js';
import { buildFileRelations, buildDirectoryRelations } from './relations.js';
import { buildArchitectureInsights, buildPriorityActions, buildDirectoryTree } from './architecture.js';
import { normalizeSettings, inspectionSet } from './settings.js';

export const ANALYSIS_STAGES = [
  { id: 'prepare', label: '소스 준비', labelEn: 'Preparing sources', weight: 8 },
  { id: 'functions', label: '함수·타입 추출', labelEn: 'Extracting functions and types', weight: 22 },
  { id: 'callGraph', label: '호출 그래프 구성', labelEn: 'Building the call graph', weight: 10 },
  { id: 'metrics', label: '코드 메트릭 계산', labelEn: 'Computing metrics', weight: 18 },
  { id: 'globals', label: '전역 변수 분석', labelEn: 'Analyzing global variables', weight: 8 },
  { id: 'database', label: 'DB 스키마·접근 분석', labelEn: 'Analyzing database access', weight: 10 },
  { id: 'duplicates', label: '중복 코드 검사', labelEn: 'Detecting duplicate code', weight: 12 },
  { id: 'quality', label: '버그 위험·보안 검사', labelEn: 'Inspecting bug risk and security', weight: 8 },
  { id: 'architecture', label: '아키텍처 인사이트', labelEn: 'Deriving architecture insights', weight: 4 },
];

/**
 * @param {Array<{path:string,text:string,size?:number}>} rawFiles
 * @param {object} rawSettings
 * @param {{onProgress?:(p:{stage:string,percent:number,message:string})=>void, gitChurn?:object, signal?:{cancelled:boolean}}} [options]
 */
export function analyze(rawFiles, rawSettings, options = {}) {
  const settings = normalizeSettings(rawSettings);
  const enabled = inspectionSet(settings);
  const startedAt = Date.now();

  let completedWeight = 0;
  const totalWeight = ANALYSIS_STAGES.reduce((acc, s) => acc + s.weight, 0);
  const report = (stageId, message) => {
    if (!options.onProgress) return;
    const stage = ANALYSIS_STAGES.find((s) => s.id === stageId);
    options.onProgress({
      stage: stageId,
      percent: Math.min(99, Math.round((completedWeight / totalWeight) * 100)),
      message: message || (stage ? stage.label : stageId),
    });
  };
  const finishStage = (stageId) => {
    const stage = ANALYSIS_STAGES.find((s) => s.id === stageId);
    completedWeight += stage ? stage.weight : 0;
  };
  const cancelled = () => !!(options.signal && options.signal.cancelled);

  // ------------------------------------------------------------- prepare ---
  report('prepare');
  const languageFilter = new Set(settings.languageIds || []);
  const files = [];
  const skipped = [];

  for (const raw of rawFiles) {
    if (typeof raw.text !== 'string') {
      skipped.push({ path: raw.path, reason: raw.skipped || 'unreadable' });
      continue;
    }
    const language = languageForPath(raw.path);
    // Non-source files (.sql, .prisma) still matter to the schema extractor.
    const isSchemaFile = /\.(sql|prisma)$/i.test(raw.path);
    if (!language && !isSchemaFile) {
      skipped.push({ path: raw.path, reason: 'unsupported' });
      continue;
    }
    if (language && languageFilter.size > 0 && !languageFilter.has(language.id)) continue;

    const languageId = language ? language.id : 'sql';
    files.push({
      path: raw.path,
      relPath: raw.relPath || raw.path,
      languageId,
      text: raw.text,
      size: raw.size || raw.text.length,
      masked: maskSource(raw.text, languageId),
      lineStarts: buildLineStarts(raw.text),
    });
  }
  finishStage('prepare');

  // --------------------------------------------- functions and structure ---
  report('functions');
  const functions = [];
  const rawTypes = [];
  const rawRelations = [];

  for (let i = 0; i < files.length; i++) {
    if (cancelled()) return null;
    const file = files[i];
    if (i % 25 === 0) report('functions', baseName(file.path));

    if (getLanguage(file.languageId)) {
      for (const fn of extractFunctions(file)) functions.push(fn);
      if (enabled.has('typeStructure')) {
        const { types, relations } = extractTypes(file);
        rawTypes.push(...types);
        rawRelations.push(...relations);
      }
    }
  }

  const typeRelations = linkTypes(rawTypes, rawRelations);
  finishStage('functions');

  // ----------------------------------------------------------- call graph --
  report('callGraph');
  const graph = buildCallGraph(functions);
  const fan = computeFanMetrics(graph);
  const circularChains = enabled.has('circularCalls') ? findCircularCallChains(graph) : [];
  finishStage('callGraph');

  // -------------------------------------------------------------- metrics --
  report('metrics');
  const measured = functions.map((fn) => {
    const language = getLanguage(fn.languageId);
    const family = language ? language.family : 'brace';
    const fanEntry = fan.get(fn.id) || { fanIn: 0, fanOut: 0 };
    const calleeNames = (graph.outgoing.get(fn.id) || [])
      .map((id) => (graph.nodeMap.get(id) || {}).displayName)
      .filter(Boolean);

    return {
      ...fn,
      ...measureFunction(fn, family),
      fanIn: fanEntry.fanIn,
      fanOut: fanEntry.fanOut,
      calleeNames,
      isPossiblyUnused:
        enabled.has('possiblyUnusedCode') &&
        fanEntry.fanIn === 0 &&
        !graph.entryPointIds.includes(fn.id) &&
        !fn.isPublic,
    };
  });
  finishStage('metrics');

  // -------------------------------------------------------------- globals --
  report('globals');
  let globals = [];
  let globalAccessResult = { accesses: [], byVariableId: new Map() };
  if (enabled.has('globalVariables')) {
    const fnsByFile = new Map();
    for (const fn of measured) {
      if (!fnsByFile.has(fn.filePath)) fnsByFile.set(fn.filePath, []);
      fnsByFile.get(fn.filePath).push(fn);
    }
    for (const file of files) {
      if (cancelled()) return null;
      if (!getLanguage(file.languageId)) continue;
      globals.push(...extractGlobals(file, fnsByFile.get(file.path) || []));
    }
    globalAccessResult = analyzeGlobalAccess(globals, measured);
  }
  finishStage('globals');

  // ------------------------------------------------------------- database --
  report('database');
  let schema = { tables: [], relations: [], catalogs: [], accesses: [], columnAccesses: [], catalogAccesses: [] };
  if (enabled.has('databaseSchema')) {
    const { tables, relations } = extractSchema(files);
    const catalogs = extractCatalogs(files);
    const { accesses, columnAccesses } = analyzeTableAccess(measured, tables);
    schema = {
      tables,
      relations,
      catalogs,
      accesses,
      columnAccesses,
      catalogAccesses: analyzeCatalogAccess(measured, catalogs),
    };
  }
  finishStage('database');

  // ----------------------------------------------------------- duplicates --
  report('duplicates');
  const duplicates = enabled.has('duplicateCodeGroups')
    ? findDuplicates(files.slice(0, 2500), settings.minDuplicateLines, (m) => report('duplicates', m))
    : { minDuplicateLines: settings.minDuplicateLines, groups: [], totalDuplicateLines: 0, byFile: new Map() };
  finishStage('duplicates');

  // ------------------------------------------------ bug risk and security --
  report('quality');
  const securityHits = [];
  const bugFindings = [];
  const securityByFile = new Map();

  for (const file of files) {
    if (cancelled()) return null;
    if (!getLanguage(file.languageId)) continue;

    if (enabled.has('securitySmells')) {
      const hits = scanSecurity(file);
      if (hits.length > 0) {
        securityHits.push(...hits);
        securityByFile.set(file.path, hits);
      }
    }
    if (enabled.has('bugRisk')) bugFindings.push(...scanBugRisk(file));
  }

  if (enabled.has('bugRisk')) bugFindings.push(...metricsBugRisk(measured, settings));

  const securitySummary = summarizeSecurity(securityHits);
  const bugRisk = summarizeBugRisk(bugFindings);
  finishStage('quality');

  // -------------------------------------------------- rollups and insights --
  report('architecture');
  const fileMetrics = files
    .filter((file) => getLanguage(file.languageId))
    .map((file) => fileLineMetrics(file, securityByFile.get(file.path), options.gitChurn));

  const fileAggregates = aggregateByFile(fileMetrics, measured, duplicates.byFile);
  const typeMetrics = buildTypeMetrics(rawTypes, measured, settings);
  const packageMetrics = buildPackageMetrics(measured, graph, rawTypes);
  const layerViolations = enabled.has('layerViolation') ? findLayerViolations(measured, graph) : [];
  const fileRelations = buildFileRelations(measured, graph);
  const directoryRelations = buildDirectoryRelations(measured, graph);

  const summary = buildQualitySummary({
    functions: measured,
    fileAggregates,
    typeMetrics,
    packageMetrics,
    duplicates,
    circularChains,
    layerViolations,
    settings,
  });

  const insightContext = {
    functions: measured,
    fileAggregates,
    typeMetrics,
    packageMetrics,
    graph,
    circularChains,
    duplicates,
    layerViolations,
    globals,
    globalAccesses: globalAccessResult.accesses,
    schema,
    securitySummary,
    fileRelations,
    directoryRelations,
    settings,
    enabled,
  };

  const insights = buildArchitectureInsights(insightContext);
  const priorityActions = buildPriorityActions(insightContext, insights);
  finishStage('architecture');

  if (options.onProgress) options.onProgress({ stage: 'done', percent: 100, message: '완료' });

  // The bulky per-function source text is dropped: it would multiply the size
  // of a saved .cfproj / JSON export and nothing downstream reads it.
  const leanFunctions = measured.map(({ bodyText, maskedBody, ...rest }) => rest);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    settings,
    stats: {
      fileCount: files.length,
      skippedCount: skipped.length,
      functionCount: measured.length,
      typeCount: rawTypes.length,
      edgeCount: graph.edges.length,
    },
    skipped: skipped.slice(0, 200),
    languages: languageBreakdown(fileMetrics),
    functions: leanFunctions,
    types: rawTypes.map(({ ...type }) => type),
    typeRelations,
    typeMetrics,
    graph: {
      nodes: graph.nodes,
      edges: graph.edges,
      entryPointIds: graph.entryPointIds,
    },
    circularChains,
    files: fileAggregates,
    packages: packageMetrics,
    layerViolations,
    globals,
    globalAccesses: globalAccessResult.accesses,
    schema,
    duplicates: { ...duplicates, byFile: Object.fromEntries(duplicates.byFile) },
    bugRisk,
    security: securitySummary,
    fileRelations,
    directoryRelations,
    directoryTree: buildDirectoryTree(fileAggregates),
    insights,
    priorityActions,
    summary,
    health: healthScore(summary),
  };
}

/**
 * Rebuilds the lookup maps a serialized result loses (JSON has no Map).
 * Views call this once after loading a result from the worker or from disk.
 */
export function hydrate(result) {
  if (!result) return result;
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of result.graph.edges) {
    if (!outgoing.has(edge.callerId)) outgoing.set(edge.callerId, []);
    outgoing.get(edge.callerId).push(edge.calleeId);
    if (!incoming.has(edge.calleeId)) incoming.set(edge.calleeId, []);
    incoming.get(edge.calleeId).push(edge.callerId);
  }
  return {
    ...result,
    graph: {
      ...result.graph,
      nodeMap: new Map(result.graph.nodes.map((n) => [n.id, n])),
      outgoing,
      incoming,
    },
  };
}

export { LANGUAGES, dirName };
