'use strict';

// HIS metric engine (contract: core/ENGINE_CONTRACT.md). Each HIS threshold is
// one rule `his:<METRIC>`; findings are reported at the function name with the
// measured value. Thresholds: ctx.options.his = { thresholds: { VG: 15, ... },
// pathCap, logicalOperators, misraFindings }.
//
// Exports also functionMetrics(files, options) -> rows and summary(rows) for
// report tables. See metrics.js for the exact metric definitions.

const { compute, round } = require('./metrics');

// kind 'max': value must be <= limit. kind 'min': value must be > limit.
const METRICS = [
  { id: 'COMF', kind: 'min', limit: 0.2, severity: 'MINOR', debt: 10,
    label: { en: 'comment density', ko: '주석 밀도' },
    name: { en: 'HIS COMF: functions should have a comment density above the limit', ko: 'HIS COMF: 함수의 주석 밀도는 기준보다 높아야 합니다' },
    why: { en: 'HIS asks for a comment density (comment lines per statement) above 0.2 so reviewers and maintainers can follow the intent of the code.', ko: 'HIS는 검토자와 유지보수자가 코드의 의도를 따라갈 수 있도록 주석 밀도(문장당 주석 줄 수)가 0.2보다 높기를 요구합니다.' },
    fix: { en: 'Add a header comment and explain the non-obvious steps of the function.', ko: '함수 머리 주석을 추가하고 명확하지 않은 단계를 설명합니다.' } },
  { id: 'PATH', kind: 'max', limit: 80, severity: 'MAJOR', debt: 30,
    label: { en: 'non-cyclic paths', ko: '비순환 경로 수' },
    name: { en: 'HIS PATH: functions should not have too many non-cyclic paths', ko: 'HIS PATH: 함수의 비순환 실행 경로가 너무 많으면 안 됩니다' },
    why: { en: 'The number of non-cyclic execution paths is the number of test cases needed for full path coverage. HIS limits it to 80.', ko: '비순환 실행 경로 수는 전체 경로 커버리지에 필요한 테스트 케이스 수입니다. HIS는 80으로 제한합니다.' },
    fix: { en: 'Split the function or flatten sequential decisions into helper functions or tables.', ko: '함수를 나누거나 연속된 분기를 보조 함수나 표로 바꿉니다.' } },
  { id: 'GOTO', kind: 'max', limit: 0, severity: 'MAJOR', debt: 15,
    label: { en: 'goto statements', ko: 'goto 문 수' },
    name: { en: 'HIS GOTO: functions should not use goto', ko: 'HIS GOTO: 함수에서 goto를 쓰면 안 됩니다' },
    why: { en: 'goto breaks structured control flow and makes path analysis and testing harder. HIS requires zero goto statements.', ko: 'goto는 구조적 제어 흐름을 깨뜨려 경로 분석과 테스트를 어렵게 합니다. HIS는 goto 문 0개를 요구합니다.' },
    fix: { en: 'Replace goto with loops, early returns or a cleanup helper.', ko: 'goto를 반복문, 조기 반환 또는 정리용 보조 함수로 바꿉니다.' } },
  { id: 'VG', kind: 'max', limit: 10, severity: 'MAJOR', debt: 30,
    label: { en: 'cyclomatic complexity v(G)', ko: '순환 복잡도 v(G)' },
    name: { en: 'HIS v(G): cyclomatic complexity of functions should not exceed the limit', ko: 'HIS v(G): 함수의 순환 복잡도는 기준을 넘으면 안 됩니다' },
    why: { en: 'McCabe cyclomatic complexity counts independent paths. HIS limits v(G) to 10 per function to keep functions testable.', ko: 'McCabe 순환 복잡도는 독립 경로 수를 셉니다. HIS는 테스트하기 쉽도록 함수당 v(G)를 10으로 제한합니다.' },
    fix: { en: 'Extract decision logic into smaller functions.', ko: '분기 논리를 더 작은 함수로 추출합니다.' } },
  { id: 'CALLING', kind: 'max', limit: 5, severity: 'MINOR', debt: 20,
    label: { en: 'calling functions', ko: '호출하는 함수 수' },
    name: { en: 'HIS CALLING: functions should not be called from too many functions', ko: 'HIS CALLING: 너무 많은 함수에서 호출되는 함수는 피해야 합니다' },
    why: { en: 'A function used by many callers is a strong coupling point: every change affects all of them. HIS limits callers to 5.', ko: '많은 함수가 쓰는 함수는 강한 결합 지점이라 변경이 모든 호출자에 영향을 줍니다. HIS는 호출자를 5개로 제한합니다.' },
    fix: { en: 'Check whether the function mixes responsibilities, or document and test it as a shared service.', ko: '함수가 여러 책임을 섞고 있는지 확인하거나 공용 기능으로 문서화하고 테스트합니다.' } },
  { id: 'CALLS', kind: 'max', limit: 7, severity: 'MINOR', debt: 20,
    label: { en: 'called functions', ko: '호출되는 함수 수' },
    name: { en: 'HIS CALLS: functions should not call too many different functions', ko: 'HIS CALLS: 함수가 너무 많은 서로 다른 함수를 호출하면 안 됩니다' },
    why: { en: 'Many distinct callees mean high fan-out and many dependencies to understand and stub in tests. HIS limits it to 7.', ko: '서로 다른 피호출 함수가 많으면 팬아웃이 커서 이해하고 테스트에서 대체할 의존성이 많아집니다. HIS는 7개로 제한합니다.' },
    fix: { en: 'Group related calls into helper functions.', ko: '관련된 호출을 보조 함수로 묶습니다.' } },
  { id: 'PARAM', kind: 'max', limit: 5, severity: 'MINOR', debt: 15,
    label: { en: 'parameters', ko: '매개변수 수' },
    name: { en: 'HIS PARAM: functions should not have too many parameters', ko: 'HIS PARAM: 함수의 매개변수가 너무 많으면 안 됩니다' },
    why: { en: 'Long parameter lists are hard to use correctly and hint at missing abstractions. HIS limits them to 5.', ko: '긴 매개변수 목록은 올바르게 쓰기 어렵고 빠진 추상화를 뜻합니다. HIS는 5개로 제한합니다.' },
    fix: { en: 'Pass a structure or split the function.', ko: '구조체로 전달하거나 함수를 나눕니다.' } },
  { id: 'STMT', kind: 'max', limit: 50, severity: 'MINOR', debt: 30,
    label: { en: 'statements', ko: '문장 수' },
    name: { en: 'HIS STMT: functions should not have too many statements', ko: 'HIS STMT: 함수의 문장이 너무 많으면 안 됩니다' },
    why: { en: 'Long functions are hard to review and test. HIS limits a function to 50 statements.', ko: '긴 함수는 검토와 테스트가 어렵습니다. HIS는 함수당 50문장으로 제한합니다.' },
    fix: { en: 'Extract cohesive parts into separate functions.', ko: '응집된 부분을 별도 함수로 추출합니다.' } },
  { id: 'LEVEL', kind: 'max', limit: 4, severity: 'MINOR', debt: 20,
    label: { en: 'nesting depth', ko: '중첩 깊이' },
    name: { en: 'HIS LEVEL: control structures should not be nested too deeply', ko: 'HIS LEVEL: 제어 구조를 너무 깊게 중첩하면 안 됩니다' },
    why: { en: 'Deep nesting makes the conditions of the inner code hard to see. HIS limits nesting to 4 levels.', ko: '깊은 중첩은 안쪽 코드의 실행 조건을 알아보기 어렵게 합니다. HIS는 중첩을 4단계로 제한합니다.' },
    fix: { en: 'Use guard clauses or extract inner blocks into functions.', ko: '보호 조건문을 쓰거나 안쪽 블록을 함수로 추출합니다.' } },
  { id: 'RETURN', kind: 'max', limit: 1, severity: 'MINOR', debt: 10,
    label: { en: 'return points', ko: '반환 지점 수' },
    name: { en: 'HIS RETURN: functions should have a single exit point', ko: 'HIS RETURN: 함수의 반환 지점은 하나여야 합니다' },
    why: { en: 'A single exit point (MISRA C Rule 15.5) makes resource release and verification simpler. HIS allows one return point.', ko: '단일 반환 지점(MISRA C 규칙 15.5)은 자원 해제와 검증을 단순하게 합니다. HIS는 반환 지점을 하나만 허용합니다.' },
    fix: { en: 'Store the result in a variable and return it once at the end.', ko: '결과를 변수에 저장하고 마지막에 한 번 반환합니다.' } },
  { id: 'VOCF', kind: 'max', limit: 4, severity: 'MINOR', debt: 15,
    label: { en: 'vocabulary frequency', ko: '어휘 빈도' },
    name: { en: 'HIS VOCF: the vocabulary frequency of functions should not exceed the limit', ko: 'HIS VOCF: 함수의 어휘 빈도는 기준을 넘으면 안 됩니다' },
    why: { en: 'VOCF = (N1 + N2) / (n1 + n2) from Halstead counts. A high value means the same operators and operands are repeated, often copy-paste code. HIS limits it to 4.', ko: 'VOCF는 Halstead 수치로 (N1 + N2) / (n1 + n2)입니다. 값이 크면 같은 연산자와 피연산자가 반복된다는 뜻으로 복사한 코드인 경우가 많습니다. HIS는 4로 제한합니다.' },
    fix: { en: 'Factor repeated code into loops, tables or helper functions.', ko: '반복 코드를 반복문, 표 또는 보조 함수로 묶습니다.' } },
  { id: 'ap_cg_cycle', kind: 'max', limit: 0, severity: 'MAJOR', debt: 30, project: true,
    label: { en: 'call graph cycles', ko: '호출 그래프 순환' },
    name: { en: 'HIS ap_cg_cycle: the call graph should not contain recursion cycles', ko: 'HIS ap_cg_cycle: 호출 그래프에 재귀 순환이 있으면 안 됩니다' },
    why: { en: 'Direct or indirect recursion makes stack usage unbounded and unverifiable (MISRA C Rule 17.2). HIS requires zero call graph cycles.', ko: '직접 또는 간접 재귀는 스택 사용량을 제한하거나 검증할 수 없게 합니다(MISRA C 규칙 17.2). HIS는 호출 그래프 순환 0개를 요구합니다.' },
    fix: { en: 'Replace the recursion with an iteration and an explicit, bounded stack.', ko: '재귀를 반복문과 크기가 정해진 명시적 스택으로 바꿉니다.' } },
  { id: 'NOMV', kind: 'max', limit: 0, severity: 'MAJOR', debt: 10, misra: true,
    label: { en: 'MISRA violations', ko: 'MISRA 위반 수' },
    name: { en: 'HIS NOMV: functions should have no MISRA violations', ko: 'HIS NOMV: 함수에 MISRA 위반이 없어야 합니다' },
    why: { en: 'HIS counts the MISRA violations per function and expects zero. Computed only when MISRA findings are passed in.', ko: 'HIS는 함수별 MISRA 위반 수를 세며 0개를 기대합니다. MISRA 결과가 주어질 때만 계산합니다.' },
    fix: { en: 'Fix the MISRA findings of the function or record a deviation.', ko: '함수의 MISRA 위반을 고치거나 편차를 기록합니다.' } },
  { id: 'NOMVPR', kind: 'max', limit: 0, severity: 'MINOR', debt: 10, misra: true,
    label: { en: 'violated MISRA rules', ko: '위반한 MISRA 규칙 수' },
    name: { en: 'HIS NOMVPR: functions should not violate MISRA rules', ko: 'HIS NOMVPR: 함수가 MISRA 규칙을 위반하면 안 됩니다' },
    why: { en: 'HIS counts the distinct MISRA rules violated per function and expects zero. Computed only when MISRA findings are passed in.', ko: 'HIS는 함수별로 위반한 서로 다른 MISRA 규칙 수를 세며 0개를 기대합니다. MISRA 결과가 주어질 때만 계산합니다.' },
    fix: { en: 'Fix the MISRA findings of the function or record a deviation.', ko: '함수의 MISRA 위반을 고치거나 편차를 기록합니다.' } },
];

const FILE_COMF = {
  id: 'COMF_FILE', kind: 'min', limit: 0.2, severity: 'MINOR', debt: 15, file: true, metric: 'COMF',
  label: { en: 'file comment density', ko: '파일 주석 밀도' },
  name: { en: 'HIS COMF (file): files should have a comment density above the limit', ko: 'HIS COMF(파일): 파일의 주석 밀도는 기준보다 높아야 합니다' },
  why: { en: 'HIS measures comment density for the whole file too: comment lines divided by the statements of its functions should be above 0.2.', ko: 'HIS는 파일 전체의 주석 밀도도 측정합니다. 주석 줄 수를 함수 문장 수로 나눈 값이 0.2보다 커야 합니다.' },
  fix: { en: 'Add a file header and comment the functions of the file.', ko: '파일 머리 주석을 추가하고 파일의 함수에 주석을 답니다.' },
};

const ALL = [...METRICS, FILE_COMF];
const BY_ID = new Map(ALL.map((m) => [m.id, m]));
const ROW_METRICS = ['COMF', 'PATH', 'GOTO', 'VG', 'CALLING', 'CALLS', 'PARAM', 'STMT', 'LEVEL', 'RETURN', 'VOCF', 'ap_cg_cycle', 'NOMV', 'NOMVPR'];

function catalog() {
  return ALL.map((m) => ({
    key: `his:${m.id}`,
    langs: ['c', 'cpp'],
    type: 'CODE_SMELL',
    severity: m.severity,
    debtMin: m.debt,
    tags: ['his', 'metrics'],
    name: m.name,
    why: m.why,
    fix: m.fix,
    category: 'HIS metrics',
    checker: `HIS_${m.id.toUpperCase()}`,
    cwe: '',
  }));
}

function thresholdsOf(options) {
  const his = (options && options.his) || {};
  const over = his.thresholds || {};
  const out = {};
  for (const m of ALL) {
    const v = over[m.id] != null ? over[m.id] : (m.id === 'COMF_FILE' && over.COMF != null ? over.COMF : m.limit);
    out[m.id] = Number.isFinite(Number(v)) ? Number(v) : m.limit;
  }
  return out;
}

function violates(metric, value, limit) {
  if (value == null || !Number.isFinite(value)) return false;
  return metric.kind === 'min' ? !(value > limit) : value > limit;
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : String(round(v, 2));
}

function hisOptions(options) {
  const o = (options && options.his) || {};
  return {
    pathCap: o.pathCap,
    logicalOperators: !!o.logicalOperators,
    misraFindings: o.misraFindings || (options && options.misraFindings) || null,
    cfamily: (options && options.cfamily) || {},
  };
}

function hasC(files) {
  return Array.isArray(files) && files.some((f) => f && (f.lang === 'c' || f.lang === 'cpp'));
}

// Per-function HIS metric rows.
function functionMetrics(files, options = {}) {
  if (!hasC(files)) return [];
  try {
    return compute(files, hisOptions(options)).rows.map(publicRow);
  } catch (_) {
    return [];
  }
}

// Per-file comment density.
function fileMetrics(files, options = {}) {
  if (!hasC(files)) return [];
  try {
    return compute(files, hisOptions(options)).files;
  } catch (_) {
    return [];
  }
}

function publicRow(r) {
  const out = {
    file: r.file, function: r.function, line: r.line,
    COMF: r.COMF, PATH: r.PATH, GOTO: r.GOTO, VG: r.VG, CALLING: r.CALLING, CALLS: r.CALLS,
    PARAM: r.PARAM, STMT: r.STMT, LEVEL: r.LEVEL, RETURN: r.RETURN, VOCF: r.VOCF, ap_cg_cycle: r.ap_cg_cycle,
  };
  if (r.NOMV != null) { out.NOMV = r.NOMV; out.NOMVPR = r.NOMVPR; }
  return out;
}

// min / max / avg and threshold violations per metric over the rows.
function summary(rows, options = {}) {
  const limits = thresholdsOf(options);
  const list = Array.isArray(rows) ? rows : [];
  const metrics = {};
  for (const id of ROW_METRICS) {
    const meta = BY_ID.get(id);
    const vals = list.map((r) => r && r[id]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!vals.length) {
      if (id === 'NOMV' || id === 'NOMVPR') continue;
      metrics[id] = { count: 0, min: null, max: null, avg: null, violations: 0, limit: limits[id], kind: meta.kind, label: meta.label, why: meta.why };
      continue;
    }
    let sum = 0; let min = Infinity; let max = -Infinity; let bad = 0;
    for (const v of vals) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      if (violates(meta, v, limits[id])) bad++;
    }
    metrics[id] = { count: vals.length, min, max, avg: round(sum / vals.length), violations: bad, limit: limits[id], kind: meta.kind, label: meta.label, why: meta.why };
  }
  const violatingFunctions = list.filter((r) => r && ROW_METRICS.some((id) => violates(BY_ID.get(id), r[id], limits[id]))).length;
  return { functions: list.length, violatingFunctions, metrics };
}

function limitText(meta, limit) {
  return meta.kind === 'min' ? { en: `must be above ${fmt(limit)}`, ko: `${fmt(limit)}보다 커야 합니다` } : { en: `limit ${fmt(limit)}`, ko: `기준 ${fmt(limit)}` };
}

function analyze(files, ctx = {}) {
  const inactive = (ctx && ctx.inactive) || new Set();
  const active = ALL.filter((m) => !inactive.has(`his:${m.id}`));
  if (!active.length || !hasC(files)) return [];
  const options = (ctx && ctx.options) || {};
  const limits = thresholdsOf(options);
  let data;
  try {
    data = compute(files, hisOptions(options));
  } catch (err) {
    if (ctx && ctx.warnings) ctx.warnings.push({ rule: 'his', message: String(err && err.message) });
    return [];
  }
  const findings = [];
  const rowsByKey = new Map();
  for (const r of data.rows) if (r.key) rowsByKey.set(r.key, r);
  for (const meta of active) {
    const key = `his:${meta.id}`;
    const limit = limits[meta.id];
    if (meta.file) {
      for (const f of data.files) {
        if (!violates(meta, f.COMF, limit)) continue;
        const lt = limitText(meta, limit);
        findings.push({
          rule: key, file: f.file, line: 1,
          message: {
            en: `File comment density (COMF) is ${fmt(f.COMF)}: ${f.commentLines} comment lines for ${f.statements} statements (${lt.en}).`,
            ko: `파일 주석 밀도(COMF)가 ${fmt(f.COMF)}입니다. 문장 ${f.statements}개에 주석 ${f.commentLines}줄입니다(${lt.ko}).`,
          },
        });
      }
      continue;
    }
    if (meta.project) {
      if (data.sccs.length <= limit) continue;
      for (const scc of data.sccs) {
        const members = scc.map((k) => rowsByKey.get(k)).filter(Boolean)
          .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
        if (!members.length) continue;
        const first = members[0];
        const names = members.map((m) => m.function);
        const chain = names.length === 1 ? `${names[0]} -> ${names[0]}` : names.join(' -> ');
        findings.push({
          rule: key, file: first.file, line: first.line, function: first.function,
          message: {
            en: `Call graph cycle (recursion): ${chain}${names.length > 1 ? ` -> ${names[0]}` : ''}.`,
            ko: `호출 그래프에 순환(재귀)이 있습니다: ${chain}${names.length > 1 ? ` -> ${names[0]}` : ''}.`,
          },
          events: members.map((m, i) => ({
            line: m.line, file: m.file, tag: 'path', main: i === 0,
            text: { en: `'${m.function}' is part of the cycle`, ko: `'${m.function}' 함수가 순환에 포함됩니다` },
          })),
        });
      }
      continue;
    }
    for (const r of data.rows) {
      const v = r[meta.id];
      if (!violates(meta, v, limit)) continue;
      const lt = limitText(meta, limit);
      let extraEn = ''; let extraKo = '';
      if (meta.id === 'COMF') { extraEn = ` (${r.commentLines} comment lines, ${r.STMT} statements)`; extraKo = ` (주석 ${r.commentLines}줄, 문장 ${r.STMT}개)`; }
      if (meta.id === 'VOCF') {
        const h = r.halstead;
        extraEn = ` (N1=${h.N1}, N2=${h.N2}, n1=${h.n1}, n2=${h.n2})`; extraKo = extraEn;
      }
      if (meta.id === 'PATH' && v >= (Number(hisOptions(options).pathCap) || 1e6)) { extraEn = ' (saturated)'; extraKo = ' (상한 도달)'; }
      findings.push({
        rule: key, file: r.file, line: r.line, function: r.function,
        message: {
          en: `Function '${r.function}': ${meta.label.en} is ${fmt(v)}${extraEn} (${lt.en}).`,
          ko: `함수 '${r.function}': ${meta.label.ko} ${fmt(v)}${extraKo} (${lt.ko}).`,
        },
      });
    }
  }
  return findings;
}

module.exports = { catalog, analyze, functionMetrics, fileMetrics, summary, thresholds: thresholdsOf, METRICS: ROW_METRICS };
