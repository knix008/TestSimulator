// End-to-end: the orchestrator over a multi-language project.

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze, hydrate, ANALYSIS_STAGES } from '../src/core/analyze.js';
import { defaultSettings } from '../src/core/settings.js';
import { sampleProject } from './fixtures.mjs';

const result = analyze(sampleProject(), {});

test('the analysis produces a complete, self-describing result', () => {
  for (const key of [
    'schemaVersion', 'generatedAt', 'durationMs', 'settings', 'stats', 'languages',
    'functions', 'types', 'typeMetrics', 'graph', 'files', 'packages', 'globals',
    'schema', 'duplicates', 'bugRisk', 'security', 'insights', 'priorityActions',
    'summary', 'health', 'fileRelations', 'directoryRelations', 'directoryTree',
  ]) {
    assert.ok(key in result, 'the result is missing "' + key + '"');
  }

  assert.ok(result.stats.fileCount > 0);
  assert.ok(result.stats.functionCount > 0);
  assert.ok(Number.isFinite(result.durationMs));
  assert.ok(!Number.isNaN(Date.parse(result.generatedAt)));
});

test('every analyzed language is represented', () => {
  const ids = result.languages.map((entry) => entry.languageId);
  for (const expected of ['csharp', 'python', 'javascript', 'java', 'go', 'ruby']) {
    assert.ok(ids.includes(expected), expected + ' missing from the language breakdown; got ' + ids.join(', '));
  }
});

test('functions from every language reach the result with their metrics', () => {
  const byLanguage = new Map();
  for (const fn of result.functions) byLanguage.set(fn.languageId, (byLanguage.get(fn.languageId) || 0) + 1);

  for (const expected of ['csharp', 'python', 'javascript', 'java', 'go', 'ruby']) {
    assert.ok((byLanguage.get(expected) || 0) > 0, 'no functions found for ' + expected);
  }

  for (const fn of result.functions) {
    assert.ok(fn.cyclomaticComplexity >= 1, fn.fullName + ' must have a complexity of at least 1');
    assert.ok(fn.maintenanceIndex >= 0 && fn.maintenanceIndex <= 171);
    assert.ok(fn.lineCount >= 1);
    assert.equal(typeof fn.fanIn, 'number');
    assert.equal(typeof fn.fanOut, 'number');
  }
});

test('the bulky source text is not carried in the result', () => {
  for (const fn of result.functions) {
    assert.ok(!('bodyText' in fn), 'bodyText would multiply the size of a saved result');
    assert.ok(!('maskedBody' in fn));
  }
});

test('the call graph is internally consistent', () => {
  const ids = new Set(result.graph.nodes.map((node) => node.id));

  for (const edge of result.graph.edges) {
    assert.ok(ids.has(edge.callerId), 'edge references an unknown caller');
    assert.ok(ids.has(edge.calleeId), 'edge references an unknown callee');
  }
  for (const id of result.graph.entryPointIds) {
    assert.ok(ids.has(id), 'entry point is not a graph node');
  }
  assert.equal(result.graph.nodes.length, result.functions.length);
});

test('the SQL schema and the code that touches it are joined up', () => {
  const tableNames = result.schema.tables.map((table) => table.name);
  assert.ok(tableNames.includes('users'));
  assert.ok(tableNames.includes('teams'));
  assert.ok(tableNames.includes('orders'));

  assert.ok(result.schema.relations.length >= 2, 'the foreign keys become relations');
  assert.ok(result.schema.accesses.length > 0, 'the C# repository accesses the users table');

  for (const access of result.schema.accesses) {
    assert.ok(
      result.schema.tables.some((table) => table.id === access.tableId),
      'an access must point at a known table',
    );
  }
});

test('duplicate code between the two sibling files is found', () => {
  const group = result.duplicates.groups.find((entry) =>
    entry.fragments.some((f) => f.filePath.endsWith('alpha.js')) && entry.fragments.some((f) => f.filePath.endsWith('beta.js')),
  );

  assert.ok(group, 'the copied block is reported');
  assert.ok(result.summary.projectDuplicateLinePercent > 0);
});

test('security and bug-risk findings are produced and point at real files', () => {
  const paths = new Set(result.files.map((file) => file.filePath));

  assert.ok(result.security.total > 0, 'the fixtures contain deliberate smells');
  for (const rule of result.security.rules) {
    for (const hit of rule.hits) {
      assert.ok(paths.has(hit.filePath), hit.filePath + ' is not an analyzed file');
      assert.ok(hit.line >= 1);
    }
  }

  assert.ok(result.bugRisk.total > 0);
  for (const finding of result.bugRisk.findings) {
    assert.ok(finding.line >= 1);
    assert.ok(finding.message.length > 0);
  }
});

test('the summary counts agree with the underlying collections', () => {
  assert.equal(result.summary.totalFunctions, result.functions.length);
  assert.equal(result.summary.totalFiles, result.files.length);
  assert.equal(result.summary.totalTypes, result.typeMetrics.length);
  assert.equal(result.summary.duplicateGroupCount, result.duplicates.groups.length);

  const codeLines = result.files.reduce((acc, file) => acc + file.codeLines, 0);
  assert.equal(result.summary.totalCodeLines, codeLines);
});

test('the health score is bounded and graded', () => {
  assert.ok(result.health.score >= 0 && result.health.score <= 100);
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(result.health.grade));
  assert.equal(result.health.dimensions.length, 8);
});

test('insights carry a summary, advice and items that resolve', () => {
  assert.ok(result.insights.length > 0);
  for (const insight of result.insights) {
    assert.ok(insight.summary.length > 0, insight.id + ' needs a summary');
    assert.ok(insight.advice.length > 0, insight.id + ' needs advice a reader can act on');
    assert.ok(['critical', 'warning', 'info'].includes(insight.severity));
    assert.equal(insight.count > 0, true, 'insights with no findings are dropped');
  }
});

test('disabling an inspection skips its work entirely', () => {
  const settings = { ...defaultSettings(), enabledInspections: ['showFilesTab', 'showFunctionsTab'] };
  const trimmed = analyze(sampleProject(), settings);

  assert.deepEqual(trimmed.duplicates.groups, [], 'duplicate detection is off');
  assert.deepEqual(trimmed.globals, [], 'global variable analysis is off');
  assert.deepEqual(trimmed.schema.tables, [], 'database analysis is off');
  assert.equal(trimmed.security.total, 0, 'security scanning is off');
  assert.equal(trimmed.bugRisk.total, 0, 'bug risk scanning is off');
  assert.equal(trimmed.circularChains.length, 0);

  assert.ok(trimmed.functions.length > 0, 'functions are always extracted — everything else keys on them');
});

test('a language filter restricts what is analyzed', () => {
  const pythonOnly = analyze(sampleProject(), { ...defaultSettings(), languageIds: ['python'] });
  const languages = new Set(pythonOnly.functions.map((fn) => fn.languageId));

  assert.deepEqual([...languages], ['python']);
  assert.ok(pythonOnly.stats.fileCount < result.stats.fileCount);
});

test('progress is reported for every declared stage, monotonically', () => {
  const seen = [];
  analyze(sampleProject(), {}, { onProgress: (progress) => seen.push(progress) });

  assert.ok(seen.length > 0);
  for (const stage of ANALYSIS_STAGES) {
    assert.ok(seen.some((entry) => entry.stage === stage.id), 'no progress reported for stage ' + stage.id);
  }

  let previous = -1;
  for (const entry of seen) {
    assert.ok(entry.percent >= previous, 'progress must never go backwards');
    assert.ok(entry.percent >= 0 && entry.percent <= 100);
    previous = entry.percent;
  }
  assert.equal(seen[seen.length - 1].percent, 100, 'the last report is 100%');
});

test('a cancelled run returns null instead of a partial result', () => {
  const signal = { cancelled: true };
  assert.equal(analyze(sampleProject(), {}, { signal }), null);
});

test('git churn is folded into the file metrics when supplied', () => {
  const churn = { '/proj/src/app.js': 2500 };
  const withGit = analyze(sampleProject(), {}, { gitChurn: churn });
  const app = withGit.files.find((file) => file.filePath === '/proj/src/app.js');

  assert.equal(app.gitChangeLineCount, 2500);
  assert.ok(withGit.summary.gitHotspotFileCount >= 1, 'it crosses the hotspot threshold');
});

test('unreadable and unsupported files are recorded as skipped, not dropped silently', () => {
  const withJunk = analyze(
    [...sampleProject(), { path: '/proj/README.md', text: '# hi' }, { path: '/proj/blob.bin', text: null, skipped: 'binary' }],
    {},
  );

  const reasons = withJunk.skipped.map((entry) => entry.reason);
  assert.ok(reasons.includes('unsupported'), 'the markdown file is unsupported');
  assert.ok(reasons.includes('binary'), 'the unreadable file keeps the reason the reader gave');
  assert.equal(withJunk.stats.skippedCount, withJunk.skipped.length);
});

test('an empty project analyzes without throwing', () => {
  const empty = analyze([], {});

  assert.equal(empty.stats.fileCount, 0);
  assert.deepEqual(empty.functions, []);
  assert.deepEqual(empty.insights, []);
  assert.equal(empty.summary.totalCodeLines, 0);
  assert.ok(Number.isFinite(empty.health.score));
});

test('the result survives a JSON round-trip and rehydrates its lookup maps', () => {
  const serialized = JSON.stringify({
    ...result,
    graph: { nodes: result.graph.nodes, edges: result.graph.edges, entryPointIds: result.graph.entryPointIds },
  });
  const restored = hydrate(JSON.parse(serialized));

  assert.equal(restored.stats.functionCount, result.stats.functionCount);
  assert.ok(restored.graph.nodeMap instanceof Map);
  assert.ok(restored.graph.outgoing instanceof Map);
  assert.ok(restored.graph.incoming instanceof Map);
  assert.equal(restored.graph.nodeMap.size, result.graph.nodes.length);

  // Edge lists must match what the raw edges say.
  for (const edge of restored.graph.edges) {
    assert.ok(restored.graph.outgoing.get(edge.callerId).includes(edge.calleeId));
    assert.ok(restored.graph.incoming.get(edge.calleeId).includes(edge.callerId));
  }
});

test('analysis is deterministic — the same input yields the same output', () => {
  const a = analyze(sampleProject(), {});
  const b = analyze(sampleProject(), {});

  const strip = (r) => JSON.stringify({ ...r, generatedAt: null, durationMs: null, graph: { nodes: r.graph.nodes, edges: r.graph.edges } });
  assert.equal(strip(a), strip(b), 'two runs over the same sources must agree exactly');
});

test('a large synthetic project completes in reasonable time', () => {
  const files = [];
  for (let i = 0; i < 200; i++) {
    files.push({
      path: '/big/module' + i + '.js',
      text: `
export function handler${i}(a, b) {
  if (a > 0) {
    for (let j = 0; j < b; j++) {
      if (j % 2 === 0) { collect${i}(j); }
    }
  }
  return a + b;
}
function collect${i}(value) {
  return value * 2;
}
`,
    });
  }

  const started = Date.now();
  const big = analyze(files, {});
  const elapsed = Date.now() - started;

  assert.equal(big.stats.fileCount, 200);
  assert.equal(big.functions.length, 400);
  assert.ok(elapsed < 20000, 'analysis took ' + elapsed + 'ms, which suggests a pathological code path');
});
