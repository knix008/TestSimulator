// Settings normalization, threshold evaluation and the metric rollups.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultSettings,
  normalizeSettings,
  warningLevel,
  inspectionSet,
  INSPECTIONS,
  ALL_INSPECTION_IDS,
} from '../src/core/settings.js';
import {
  fileLineMetrics,
  aggregateByFile,
  buildPackageMetrics,
  findLayerViolations,
  buildQualitySummary,
  healthScore,
  languageBreakdown,
} from '../src/core/metrics.js';
import { LANGUAGES, extensionsFor, languageForPath, detectLanguages, normalizeRuleLanguage, baseName, dirName } from '../src/core/languages.js';
import { maskSource, buildLineStarts } from '../src/core/text.js';
import { THEMES, getTheme } from '../src/themes.js';

test('defaults enable every inspection and match the documented thresholds', () => {
  const settings = defaultSettings();

  assert.equal(settings.enabledInspections.length, ALL_INSPECTION_IDS.length);
  assert.equal(settings.warnCyclomaticComplexity, 15);
  assert.equal(settings.warnCognitiveComplexity, 15);
  assert.equal(settings.warnMaxNestingDepth, 4);
  assert.equal(settings.warnParameterCount, 6);
  assert.equal(settings.warnMaintenanceIndex, 65);
  assert.equal(settings.warnGodFileCodeLines, 800);
  assert.equal(settings.minDuplicateLines, 10);
});

test('normalizeSettings clamps out-of-range values back into their spec', () => {
  const settings = normalizeSettings({
    warnCyclomaticComplexity: 9999,
    warnMaxNestingDepth: -3,
    minDuplicateLines: 1,
    warnInstability: 5,
  });

  assert.equal(settings.warnCyclomaticComplexity, 200, 'clamped to the maximum');
  assert.equal(settings.warnMaxNestingDepth, 4, 'a non-positive value falls back to the default');
  assert.equal(settings.minDuplicateLines, 2, 'clamped to the floor');
  assert.equal(settings.warnInstability, 1);
});

test('normalizeSettings drops unknown inspection ids and never leaves an empty set', () => {
  assert.deepEqual(normalizeSettings({ enabledInspections: ['cyclomaticComplexity', 'nonsense'] }).enabledInspections, [
    'cyclomaticComplexity',
  ]);
  assert.equal(normalizeSettings({ enabledInspections: [] }).enabledInspections.length, ALL_INSPECTION_IDS.length);
  assert.equal(normalizeSettings(null).enabledInspections.length, ALL_INSPECTION_IDS.length);
});

test('the stored theme id round-trips and every theme id is selectable', () => {
  assert.equal(normalizeSettings({}).theme, 'midnight', 'the default is a real theme');
  assert.equal(normalizeSettings({ theme: 'nord' }).theme, 'nord');
  assert.ok(THEMES.some((theme) => theme.id === defaultSettings().theme), 'the default theme must exist');

  for (const theme of THEMES) {
    assert.equal(getTheme(theme.id).id, theme.id);
    for (const token of ['--bg', '--text', '--accent', '--critical', '--warning', '--ok', '--diagram-bg', '--node-fill', '--edge']) {
      assert.ok(theme.tokens[token], theme.id + ' is missing the ' + token + ' token');
    }
  }
  assert.equal(getTheme('does-not-exist').id, 'midnight', 'an unknown id falls back to the default theme');
});

test('normalizeSettings falls back to a supported UI language', () => {
  assert.equal(normalizeSettings({ uiLanguage: 'fr' }).uiLanguage, 'ko');
  assert.equal(normalizeSettings({ uiLanguage: 'en' }).uiLanguage, 'en');
});

test('warningLevel bands a "greater or equal" threshold', () => {
  const settings = defaultSettings(); // warnCyclomaticComplexity = 15

  assert.equal(warningLevel('cyclomaticComplexity', 5, settings), 'none');
  assert.equal(warningLevel('cyclomaticComplexity', 15, settings), 'warning');
  assert.equal(warningLevel('cyclomaticComplexity', 29, settings), 'warning');
  assert.equal(warningLevel('cyclomaticComplexity', 30, settings), 'critical', 'twice the threshold is critical');
});

test('warningLevel bands a "less than" threshold in the opposite direction', () => {
  const settings = defaultSettings(); // warnMaintenanceIndex = 65

  assert.equal(warningLevel('maintenanceIndex', 100, settings), 'none');
  assert.equal(warningLevel('maintenanceIndex', 64, settings), 'warning');
  assert.equal(warningLevel('maintenanceIndex', 32, settings), 'critical', 'half the threshold is critical');
});

test('warningLevel is inert for inspections without a threshold and for missing values', () => {
  const settings = defaultSettings();
  assert.equal(warningLevel('circularCalls', 99, settings), 'none');
  assert.equal(warningLevel('cyclomaticComplexity', null, settings), 'none');
  assert.equal(warningLevel('not-an-inspection', 5, settings), 'none');
});

test('every inspection with a threshold has a default inside its own range', () => {
  for (const inspection of INSPECTIONS) {
    if (!inspection.threshold) continue;
    const { min, max, def, key } = inspection.threshold;
    assert.ok(def >= min && def <= max, inspection.id + ' default ' + def + ' must lie in [' + min + ', ' + max + ']');
    assert.ok(key in defaultSettings(), inspection.id + ' threshold key ' + key + ' must exist in defaults');
  }
});

test('inspectionSet reflects what the user enabled', () => {
  const enabled = inspectionSet({ enabledInspections: ['a', 'b'] });
  assert.ok(enabled.has('a'));
  assert.ok(!enabled.has('c'));
});

/* ------------------------------------------------------------- languages */

test('the language registry maps extensions unambiguously', () => {
  const seen = new Map();
  for (const language of LANGUAGES) {
    for (const ext of language.extensions) {
      assert.ok(!seen.has(ext), ext + ' is claimed by both ' + seen.get(ext) + ' and ' + language.id);
      seen.set(ext, language.id);
    }
  }

  assert.equal(languageForPath('/a/b/Main.cs').id, 'csharp');
  assert.equal(languageForPath('/a/b/app.tsx').id, 'javascript');
  assert.equal(languageForPath('/a/b/notes.txt'), null);
});

test('extensionsFor returns every extension when no language is selected', () => {
  assert.ok(extensionsFor([]).includes('.cs'));
  assert.ok(extensionsFor([]).includes('.py'));
  assert.deepEqual(extensionsFor(['python']).sort(), ['.py']);
});

test('detectLanguages ranks by file count', () => {
  const detected = detectLanguages(['/a.py', '/b.py', '/c.py', '/d.js', '/readme.md']);
  assert.equal(detected[0].id, 'python');
  assert.equal(detected[0].count, 3);
  assert.equal(detected[1].id, 'javascript');
});

test('normalizeRuleLanguage folds dialects onto their rule owner', () => {
  assert.equal(normalizeRuleLanguage('typescript'), 'javascript');
  assert.equal(normalizeRuleLanguage('kotlin'), 'java');
  assert.equal(normalizeRuleLanguage('vb'), 'vbnet');
  assert.equal(normalizeRuleLanguage('python'), 'python');
});

test('baseName and dirName handle both separators', () => {
  assert.equal(baseName('C:\\proj\\src\\App.cs'), 'App.cs');
  assert.equal(dirName('C:\\proj\\src\\App.cs'), 'C:\\proj\\src');
  assert.equal(baseName('/proj/src/app.js'), 'app.js');
  assert.equal(dirName('/proj/src/app.js'), '/proj/src');
});

/* --------------------------------------------------------------- metrics */

function file(path, text) {
  return { path, languageId: 'javascript', text, masked: maskSource(text, 'javascript'), lineStarts: buildLineStarts(text) };
}

test('fileLineMetrics reports line counts, TODO density and security counts', () => {
  const metrics = fileLineMetrics(
    file('/p/src/a.js', '// TODO one\nconst a = 1;\n\nconst b = 2;\n'),
    [{ label: 'eval()' }],
    { '/p/src/a.js': 120 },
  );

  assert.equal(metrics.fileName, 'a.js');
  assert.equal(metrics.directory, '/p/src');
  assert.equal(metrics.physicalLines, 4, 'the trailing newline does not add a line');
  assert.equal(metrics.codeLines, 2);
  assert.equal(metrics.commentLines, 1);
  assert.equal(metrics.blankLines, 1);
  assert.equal(metrics.todoMarkerCount, 1);
  assert.equal(metrics.securitySmellCount, 1);
  assert.equal(metrics.gitChangeLineCount, 120);
});

test('aggregateByFile rolls function metrics up correctly', () => {
  const fileMetrics = [fileLineMetrics(file('/p/a.js', 'const a = 1;\n'), [], null)];
  const functions = [
    { filePath: '/p/a.js', cyclomaticComplexity: 3, cognitiveComplexity: 4, maxNestingDepth: 1, maintenanceIndex: 90, magicNumberCount: 2, emptyCatchCount: 0, broadCatchCount: 0, isAsyncVoid: false, isPublic: true, isPossiblyUnused: false, fanIn: 0, fanOut: 1, returnCount: 1, statementCount: 4, switchCaseCount: 0 },
    { filePath: '/p/a.js', cyclomaticComplexity: 9, cognitiveComplexity: 12, maxNestingDepth: 3, maintenanceIndex: 40, magicNumberCount: 1, emptyCatchCount: 1, broadCatchCount: 0, isAsyncVoid: true, isPublic: false, isPossiblyUnused: true, fanIn: 2, fanOut: 0, returnCount: 3, statementCount: 20, switchCaseCount: 4 },
  ];

  const [aggregate] = aggregateByFile(fileMetrics, functions, new Map([['/p/a.js', 7]]));

  assert.equal(aggregate.functionCount, 2);
  assert.equal(aggregate.maxCyclomaticComplexity, 9);
  assert.equal(aggregate.avgCyclomaticComplexity, 6);
  assert.equal(aggregate.minMaintenanceIndex, 40);
  assert.equal(aggregate.totalMagicNumbers, 3);
  assert.equal(aggregate.publicApiCount, 1);
  assert.equal(aggregate.asyncVoidCount, 1);
  assert.equal(aggregate.possiblyUnusedCount, 1);
  assert.equal(aggregate.duplicateLineCount, 7);
});

test('package metrics compute Ca, Ce, instability and distance', () => {
  const functions = [
    { id: 'ui', filePath: '/p/ui/a.js' },
    { id: 'svc', filePath: '/p/service/b.js' },
    { id: 'data', filePath: '/p/data/c.js' },
  ];
  const graph = { edges: [{ callerId: 'ui', calleeId: 'svc' }, { callerId: 'svc', calleeId: 'data' }] };
  const types = [{ filePath: '/p/service/b.js', kind: 'interface' }, { filePath: '/p/service/b.js', kind: 'class' }];

  const packages = buildPackageMetrics(functions, graph, types);
  const byDir = new Map(packages.map((p) => [p.directoryPath, p]));

  assert.equal(byDir.get('/p/ui').efferentCoupling, 1);
  assert.equal(byDir.get('/p/ui').afferentCoupling, 0);
  assert.equal(byDir.get('/p/ui').instability, 1, 'depends on others, nothing depends on it');
  assert.equal(byDir.get('/p/data').instability, 0, 'depended upon, depends on nothing');
  assert.equal(byDir.get('/p/service').instability, 0.5);
  assert.equal(byDir.get('/p/service').abstractness, 0.5, 'one of two types is an interface');
});

test('layer violations only fire when a lower layer calls a higher one', () => {
  const functions = [
    { id: 'ui', filePath: '/p/ui/view.js', fullName: 'view' },
    { id: 'data', filePath: '/p/data/repo.js', fullName: 'repo' },
  ];

  const downward = findLayerViolations(functions, { edges: [{ callerId: 'ui', calleeId: 'data' }] });
  assert.deepEqual(downward, [], 'UI calling data is the correct direction');

  const upward = findLayerViolations(functions, { edges: [{ callerId: 'data', calleeId: 'ui' }] });
  assert.equal(upward.length, 1, 'data calling UI inverts the dependency');
});

test('buildQualitySummary counts threshold breaches across every dimension', () => {
  const settings = defaultSettings();
  const functions = [
    { filePath: '/p/a.js', cyclomaticComplexity: 30, cognitiveComplexity: 2, maxNestingDepth: 1, parameterCount: 1, returnCount: 1, magicNumberCount: 0, fanOut: 0, maintenanceIndex: 100, statementCount: 1, switchCaseCount: 0, emptyCatchCount: 1, broadCatchCount: 0, isAsyncVoid: false, isPossiblyUnused: false },
    { filePath: '/p/a.js', cyclomaticComplexity: 2, cognitiveComplexity: 2, maxNestingDepth: 1, parameterCount: 1, returnCount: 1, magicNumberCount: 0, fanOut: 0, maintenanceIndex: 10, statementCount: 1, switchCaseCount: 0, emptyCatchCount: 0, broadCatchCount: 0, isAsyncVoid: true, isPossiblyUnused: true },
  ];

  const summary = buildQualitySummary({
    functions,
    fileAggregates: [{ codeLines: 100, physicalLines: 120, commentLines: 20, commentPercentPer100Code: 20, todoDensityPer100Lines: 0, todoMarkerCount: 0, publicApiCount: 1, securitySmellCount: 0, gitChangeLineCount: 0, isTestFile: false }],
    typeMetrics: [],
    packageMetrics: [],
    duplicates: { totalDuplicateLines: 10, groups: [{}] },
    circularChains: [{}, {}],
    layerViolations: [{}],
    settings,
  });

  assert.equal(summary.highCyclomaticCount, 1);
  assert.equal(summary.lowMaintenanceIndexCount, 1);
  assert.equal(summary.emptyCatchFunctionCount, 1);
  assert.equal(summary.asyncVoidCount, 1);
  assert.equal(summary.possiblyUnusedCount, 1);
  assert.equal(summary.circularCallChainCount, 2);
  assert.equal(summary.layerViolationCount, 1);
  assert.equal(summary.projectDuplicateLinePercent, 10);
  assert.equal(summary.testCodeLinePercent, 0);
});

test('healthScore is bounded, graded and worse for a worse summary', () => {
  const good = healthScore({
    totalFunctions: 100, totalFiles: 20, highCyclomaticCount: 0, deepNestingCount: 0, lowMaintenanceIndexCount: 0,
    projectDuplicateLinePercent: 0, circularCallChainCount: 0, layerViolationCount: 0, emptyCatchFunctionCount: 0,
    asyncVoidCount: 0, securitySmellFileCount: 0, lowCommentFileCount: 0, testCodeLinePercent: 25,
  });
  const bad = healthScore({
    totalFunctions: 100, totalFiles: 20, highCyclomaticCount: 90, deepNestingCount: 90, lowMaintenanceIndexCount: 90,
    projectDuplicateLinePercent: 40, circularCallChainCount: 30, layerViolationCount: 30, emptyCatchFunctionCount: 60,
    asyncVoidCount: 40, securitySmellFileCount: 20, lowCommentFileCount: 20, testCodeLinePercent: 0,
  });

  assert.ok(good.score > bad.score);
  assert.ok(good.score <= 100 && bad.score >= 0);
  assert.equal(good.grade, 'A');
  assert.equal(bad.grade, 'F');
  assert.equal(good.dimensions.length, 8);
  for (const dimension of good.dimensions) {
    assert.ok(dimension.percent >= 0 && dimension.percent <= 100, dimension.id + ' out of range');
  }
});

test('languageBreakdown sorts by code lines and resolves display names', () => {
  const breakdown = languageBreakdown([
    { languageId: 'python', codeLines: 10, commentLines: 1 },
    { languageId: 'csharp', codeLines: 50, commentLines: 5 },
    { languageId: 'python', codeLines: 20, commentLines: 2 },
  ]);

  assert.equal(breakdown[0].languageId, 'csharp');
  assert.equal(breakdown[0].displayName, 'C#');
  assert.equal(breakdown[1].codeLines, 30, 'the two python files are summed');
  assert.equal(breakdown[1].files, 2);
});
