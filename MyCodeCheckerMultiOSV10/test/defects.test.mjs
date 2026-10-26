import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSources } from '../core/analyze.js';
import { isDismissed, evaluatePolicy, DEFAULT_POLICY } from '../core/defects.js';

test('forward null, leak, use after free and divide by zero keep a stable CID', () => {
  const text = [
    'void f(int *p) {',
    '  if (p == NULL) {',
    '    *p = 1;',
    '  }',
    '}',
    'void leak() {',
    '  char *buf = malloc(8);',
    '  buf[0] = 1;',
    '}',
    'void uaf(char *q) {',
    '  free(q);',
    '  *q = 2;',
    '}',
    'int div(int n) { return n / 0; }',
  ].join('\n');
  const first = analyzeSources([{ path: 'a.c', text }]);
  const second = analyzeSources([{ path: 'a.c', text }]);
  const checkers = new Set(first.issues.map((i) => i.checker));
  for (const name of ['FORWARD_NULL', 'RESOURCE_LEAK', 'USE_AFTER_FREE', 'DIVIDE_BY_ZERO', 'NULL_RETURNS']) {
    assert.ok(checkers.has(name), `missing ${name}`);
  }
  const forward = first.issues.find((i) => i.checker === 'FORWARD_NULL');
  assert.ok(forward.events.some((e) => e.main));
  assert.equal(forward.cid, second.issues.find((i) => i.checker === 'FORWARD_NULL').cid);
  assert.equal(forward.impact, 'High');
  assert.equal(forward.classification, 'Unclassified');
  const guarded = analyzeSources([{ path: 'ok.c', text: 'void ok(int *p) {\n  if (p == NULL) return;\n  *p = 1;\n}\n' }]);
  assert.equal(guarded.issues.some((i) => i.checker === 'FORWARD_NULL'), false);
});

test('a clean function is not a Defect Analysis defect and the first snapshot is the reference', () => {
  const clean = analyzeSources([{ path: 'ok.js', text: 'function add(left, right) {\n  return left + right;\n}\n' }]);
  assert.equal(clean.issues.filter((i) => String(i.rule).startsWith('cov:')).length, 0);
  assert.equal(clean.qualityGate.status, 'OK');
  const risky = analyzeSources([{ path: 'a.c', text: 'void f(int *p) { if (p == NULL) *p = 1; }\n' }]);
  assert.equal(risky.defectAnalysis.reference, true);
  assert.equal(risky.defectAnalysis.policy.status, 'OK');
  const again = analyzeSources([{ path: 'a.c', text: 'void f(int *p) { if (p == NULL) *p = 1; }\nvoid extra(int n) { return n / 0; }\n' }], {
    previousCids: risky.defectAnalysis.cids,
    hasBaseline: true,
  });
  assert.equal(again.defectAnalysis.reference, false);
  assert.ok(again.defectAnalysis.policyNewHigh >= 1);
  assert.equal(again.defectAnalysis.policy.status, 'ERROR');
  const same = analyzeSources([{ path: 'a.c', text: 'void f(int *p) { if (p == NULL) *p = 1; }\n' }], {
    previousCids: risky.defectAnalysis.cids,
    previousIssues: risky.issues,
  });
  assert.equal(same.defectAnalysis.newlyDetected, 0);
  assert.equal(same.defectAnalysis.fixed, 0);
  assert.equal(evaluatePolicy(DEFAULT_POLICY, { policyNewHigh: 0, policyNewHighSecurity: 0 }).status, 'OK');
});

test('triage dismissal and a fixed CID', () => {
  const issue = { classification: 'False Positive', action: 'Undecided', resolution: null };
  assert.equal(isDismissed(issue), true);
  const first = analyzeSources([{ path: 'a.c', text: 'void f(int *p) { if (p == NULL) { *p = 1; } }\n' }]);
  const gone = analyzeSources([{ path: 'a.c', text: 'void f(int *p) { if (p) { *p = 1; } }\n' }], {
    previousCids: first.defectAnalysis.cids,
    previousIssues: first.issues,
  });
  assert.ok(gone.defectAnalysis.fixed >= 1);
  assert.equal(gone.defectAnalysis.fixedDefects[0].defectStatus, 'Fixed');
});
