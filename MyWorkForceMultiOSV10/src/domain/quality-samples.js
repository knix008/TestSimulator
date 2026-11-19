// Requirements, test cases and test runs for the sample workspaces: the shop sample gets a small set, and the
// "Blood-pressure monitor" example is a full traceability project (specification tree, tests with steps,
// two test runs, a failed test with the defect it found, and a requirement changed after it passed).
import { makeIssue } from './store.js';
import { ensureQualityTypes, normalizeExec, normalizeReq, normalizeTest } from './requirements.js';
import { shiftIso, uid } from './util.js';

const pickLang = (lang, value) => (Array.isArray(value) ? value[lang === 'en' ? 1 : 0] : value);

function link(from, type, to) {
  if (!from || !to) return;
  const id = uid('l');
  from.links.push({ id, type, direction: 'out', otherId: to.id });
  to.links.push({ id, type, direction: 'in', otherId: from.id });
}

/**
 * Adds a quality set to a project.
 *   reqs:  [{ ref, ext, summary, text, category, method, criteria, source, parent, status, priority, implementedBy: [issueKey…], changedAfterPass }]
 *   tests: [{ ref, ext, summary, level, kind, pre, steps: [[action, data, expected]…], verifies: [ref…] }]
 *   runs:  [{ ref, summary, version, daysAgo, status, results: { testRef: 'pass' | ['fail', note, bugRef] } }]
 *   bugs:  [{ ref, summary, text, status, priority }]
 */
export function addQualitySample(project, spec, { lang = 'ko', now = Date.now(), people = ['u1', 'u2', 'u3', 'u4'] } = {}) {
  const at = (days, hours = 12) => shiftIso(now, days, hours);
  project.methods = [...new Set([...(project.methods || []), 'requirements', 'testing'])];
  ensureQualityTypes(project);
  const refs = new Map();
  const byKey = (key) => project.issues.find((issue) => issue.key === key);
  let rank = 1000;
  const add = (partial) => makeIssue(project, { rank: (rank += 10), reporterId: people[0], created: at(-30), updated: at(-12), ...partial }, people[0]);

  for (const bug of spec.bugs || []) {
    refs.set(bug.ref, add({
      typeId: 'bug', summary: pickLang(lang, bug.summary), description: pickLang(lang, bug.text || ''), statusId: bug.status || 'todo',
      priorityId: bug.priority || 'high', assigneeId: people[1], reporterId: people[3] || people[0], created: at(-3), updated: at(-2),
    }));
  }
  for (const item of spec.reqs || []) {
    const issue = add({
      typeId: 'requirement', summary: pickLang(lang, item.summary), description: pickLang(lang, item.text || ''),
      statusId: item.status || 'done', priorityId: item.priority || 'high', assigneeId: people[0], resolutionId: (item.status || 'done') === 'done' ? 'done' : '',
      req: normalizeReq({ externalId: item.ext, category: item.category, method: item.method, criteria: pickLang(lang, item.criteria || ''), source: pickLang(lang, item.source || ''), rationale: pickLang(lang, item.rationale || '') }),
      created: at(-40), updated: at(-30),
    });
    if (item.changedAfterPass) {
      issue.history.push({ id: uid('h'), at: at(-1), actorId: people[0], field: 'description', from: '', to: issue.description });
      issue.updated = at(-1);
    }
    refs.set(item.ref, issue);
    if (item.parent) link(issue, 'refines', refs.get(item.parent));
    for (const key of item.implementedBy || []) link(byKey(key) || refs.get(key), 'implements', issue);
  }
  for (const item of spec.tests || []) {
    const issue = add({
      typeId: 'testcase', summary: pickLang(lang, item.summary), description: pickLang(lang, item.text || ''), statusId: 'done', resolutionId: 'done',
      priorityId: item.priority || 'medium', assigneeId: people[3] || people[0],
      test: normalizeTest({
        externalId: item.ext || '', level: item.level, kind: item.kind, precondition: pickLang(lang, item.pre || ''), script: item.script || '',
        steps: (item.steps || []).map(([action, data, expected]) => ({ action: pickLang(lang, action), data: pickLang(lang, data || ''), expected: pickLang(lang, expected || '') })),
      }),
      created: at(-25), updated: at(-20),
    });
    refs.set(item.ref, issue);
    for (const ref of item.verifies || []) link(issue, 'verifies', refs.get(ref));
  }
  for (const item of spec.runs || []) {
    const runs = Object.entries(item.results || {}).map(([testRef, value], index) => {
      const [result, note, bugRef] = Array.isArray(value) ? value : [value];
      const test = refs.get(testRef);
      const bug = bugRef ? refs.get(bugRef) : null;
      if (bug && test) link(test, 'found', bug);
      return { testId: test?.id, result, note: pickLang(lang, note || ''), at: result === 'notrun' ? '' : at(-item.daysAgo, 9 + index), by: people[3] || people[0], defectIds: bug ? [bug.id] : [] };
    });
    let version = (project.versions || []).find((v) => v.name === item.version);
    if (!version && item.version) {
      version = { id: uid('v'), name: item.version, description: '', released: false, releaseDate: '', startDate: at(-30) };
      project.versions.push(version);
    }
    const issue = add({
      typeId: 'testexec', summary: pickLang(lang, item.summary), description: pickLang(lang, item.text || ''), statusId: item.status || 'done',
      resolutionId: (item.status || 'done') === 'done' ? 'done' : '', priorityId: 'medium', assigneeId: people[3] || people[0],
      exec: normalizeExec({ versionId: version?.id || '', runs }), environment: pickLang(lang, item.environment || ''),
      created: at(-item.daysAgo - 1), updated: at(-item.daysAgo),
    });
    refs.set(item.ref, issue);
    for (const run of runs) for (const bugId of run.defectIds) link(issue, 'found', project.issues.find((bug) => bug.id === bugId));
  }
  return refs;
}

/** The small set added to the shop sample (Korean, like the rest of that sample). */
export const SHOP_QUALITY = {
  bugs: [
    { ref: 'b-receipt', summary: '영수증 금액에 할인 미반영', text: '## 재현 단계\n1. 쿠폰을 적용해 카드 결제\n2. 영수증 메일 확인\n\n## 기대 결과\n할인된 금액\n\n## 실제 결과\n정가가 찍힘', status: 'todo', priority: 'high' },
  ],
  reqs: [
    { ref: 'r-pay', ext: 'SRS-PAY', summary: '결제', text: '손님은 장바구니의 상품을 카드 또는 간편 결제로 살 수 있어야 한다.', category: 'functional', method: 'test', source: '사업 계획서 3장' },
    { ref: 'r-card', ext: 'SRS-PAY-1', parent: 'r-pay', summary: '카드 승인', text: '시스템은 카드 승인 요청 후 승인 번호를 주문에 기록해야 한다.', category: 'functional', method: 'test', criteria: 'Given 유효한 카드 / When 결제 / Then 주문에 승인 번호가 남는다', implementedBy: ['SHOP-9', 'SHOP-15'] },
    { ref: 'r-fail', ext: 'SRS-PAY-2', parent: 'r-pay', summary: '결제 실패 안내', text: '승인이 거절되면 시스템은 이유와 다음 행동을 한국어로 보여 주어야 한다.', category: 'usability', method: 'test', implementedBy: ['SHOP-11'] },
    { ref: 'r-receipt', ext: 'SRS-PAY-3', parent: 'r-pay', summary: '영수증 발송', text: '결제가 끝나면 1분 안에 영수증 메일을 보내야 한다.', category: 'functional', method: 'test', implementedBy: ['SHOP-12'] },
    { ref: 'r-speed', ext: 'SRS-NFR-1', summary: '결제 응답 시간', text: '결제 승인 응답은 p95 3초 이내여야 한다.', category: 'performance', method: 'analysis', criteria: '부하 시험 보고서로 확인' },
    { ref: 'r-lock', ext: 'SRS-SEC-1', summary: '로그인 잠금', text: '로그인을 5번 틀리면 10분 동안 잠가야 한다.', category: 'security', method: 'test', implementedBy: ['SHOP-18'], status: 'progress' },
  ],
  tests: [
    { ref: 't-card', ext: 'TC-PAY-1', summary: '정상 카드 결제', level: 'system', kind: 'manual', pre: '상품 1개가 담긴 장바구니', steps: [['결제 버튼을 누른다', '', '카드 입력 화면이 열린다'], ['시험용 카드 번호를 넣고 승인한다', '4111 1111 1111 1111', '승인 완료 화면'], ['주문 내역을 연다', '', '승인 번호가 보인다']], verifies: ['r-card'] },
    { ref: 't-decline', ext: 'TC-PAY-2', summary: '거절된 카드', level: 'system', kind: 'manual', steps: [['거절 카드로 결제한다', '4000 0000 0000 0002', '거절 이유와 다른 결제 수단 안내']], verifies: ['r-fail'] },
    { ref: 't-receipt', ext: 'TC-PAY-3', summary: '영수증 메일 금액', level: 'integration', kind: 'automated', script: 'npm test -- receipt', steps: [['쿠폰 적용 결제', '쿠폰 SALE10', ''], ['메일 본문 확인', '', '할인된 금액']], verifies: ['r-receipt'] },
    { ref: 't-lock', ext: 'TC-SEC-1', summary: '5회 실패 잠금', level: 'acceptance', kind: 'manual', steps: [['틀린 암호로 5번 로그인', '', '잠금 안내'], ['10분 뒤 다시 로그인', '', '로그인 됨']], verifies: ['r-lock'] },
  ],
  runs: [
    { ref: 'x-11', summary: '1.1 회귀 시험', version: '1.1', daysAgo: 2, status: 'progress', environment: 'Chrome 130 / 스테이징', results: { 't-card': 'pass', 't-decline': 'pass', 't-receipt': ['fail', '정가가 찍힘', 'b-receipt'], 't-lock': 'notrun' } },
  ],
};

/** The full traceability example (Korean and English). */
export const DEVICE_QUALITY = {
  bugs: [
    { ref: 'b-cuff', summary: ['커프 압력이 300 mmHg를 넘음', 'Cuff pressure exceeds 300 mmHg'], text: ['## 재현 단계\n1. 커프를 막은 상태로 측정 시작\n\n## 기대 결과\n300 mmHg에서 배기\n\n## 실제 결과\n312 mmHg까지 올라감', '## Steps to reproduce\n1. Start a reading with the cuff blocked\n\n## Expected result\nVent at 300 mmHg\n\n## Actual result\nRises to 312 mmHg'], status: 'progress', priority: 'highest' },
    { ref: 'b-ble', summary: ['앱 재연결 시 기록 중복', 'Readings duplicated after the app reconnects'], status: 'todo', priority: 'medium' },
  ],
  reqs: [
    { ref: 'r-measure', ext: 'SYS-1', summary: ['혈압 측정', 'Blood-pressure measurement'], text: ['기기는 위팔 커프로 수축기·이완기 혈압과 맥박을 측정해야 한다.', 'The device shall measure systolic and diastolic pressure and pulse with an upper-arm cuff.'], category: 'functional', method: 'test', source: ['제품 요구 사항서 PRD-2.1', 'Product requirements PRD-2.1'] },
    { ref: 'r-accuracy', ext: 'SYS-1.1', parent: 'r-measure', summary: ['측정 정확도', 'Measurement accuracy'], text: ['평균 오차는 ±5 mmHg, 표준 편차는 8 mmHg 이하여야 한다.', 'Mean error shall be within ±5 mmHg with a standard deviation of 8 mmHg or less.'], category: 'performance', method: 'test', source: ['ISO 81060-2', 'ISO 81060-2'], criteria: ['임상 시험 85명 비교 결과', 'Clinical comparison on 85 subjects'] },
    { ref: 'r-time', ext: 'SYS-1.2', parent: 'r-measure', summary: ['측정 시간', 'Measurement time'], text: ['한 번의 측정은 40초 안에 끝나야 한다.', 'A reading shall finish within 40 seconds.'], category: 'performance', method: 'test', implementedBy: ['BPMF-2'] },
    { ref: 'r-safety', ext: 'SYS-2', summary: ['안전', 'Safety'], text: ['기기는 사용자에게 해가 되는 압력을 가하지 않아야 한다.', 'The device shall never apply harmful pressure.'], category: 'safety', method: 'test', source: ['위험 분석 RA-04', 'Risk analysis RA-04'] },
    { ref: 'r-overpressure', ext: 'SYS-2.1', parent: 'r-safety', summary: ['과압 배기', 'Over-pressure venting'], text: ['커프 압력이 300 mmHg에 이르면 3초 안에 배기해야 한다.', 'The cuff shall vent within 3 s when pressure reaches 300 mmHg.'], category: 'safety', method: 'test', criteria: ['막힌 커프 시험 10회 모두 통과', 'All 10 blocked-cuff runs pass'], implementedBy: ['BPMF-3'] },
    { ref: 'r-timeout', ext: 'SYS-2.2', parent: 'r-safety', summary: ['측정 제한 시간', 'Measurement time limit'], text: ['측정이 180초를 넘으면 중단하고 배기해야 한다.', 'A reading running past 180 s shall stop and vent.'], category: 'safety', method: 'test', implementedBy: ['BPMF-3'], changedAfterPass: true },
    { ref: 'r-ble', ext: 'SYS-3', summary: ['앱 연동', 'App connection'], text: ['측정값은 블루투스 LE로 휴대폰 앱에 보내야 한다.', 'Readings shall be sent to the phone app over Bluetooth LE.'], category: 'interface', method: 'test', implementedBy: ['BPMF-4'] },
    { ref: 'r-memory', ext: 'SYS-4', summary: ['기록 저장', 'Reading memory'], text: ['사용자 2명 × 60회 기록을 전원 없이 보관해야 한다.', 'The device shall keep 60 readings for each of 2 users without power.'], category: 'functional', method: 'inspection' },
    { ref: 'r-label', ext: 'REG-1', summary: ['표시 사항', 'Labelling'], text: ['포장과 기기에 허가 번호, 제조 번호, 사용 기한을 표시해야 한다.', 'The box and the device shall show the approval number, lot and expiry.'], category: 'regulatory', method: 'inspection', source: ['의료기기법 시행규칙', 'Medical device regulation'] },
  ],
  tests: [
    { ref: 't-accuracy', ext: 'TC-01', summary: ['기준 혈압계 비교 시험', 'Comparison with a reference monitor'], level: 'system', kind: 'manual', pre: ['교정된 기준 혈압계, 시험 대상자 5명', 'Calibrated reference monitor, 5 subjects'], steps: [[['대상자를 5분 쉬게 한다', 'Rest the subject for 5 minutes'], '', ''], [['기준기와 번갈아 3회 측정', 'Measure 3 times, alternating with the reference'], '', ['차이를 기록', 'Differences recorded']], [['평균 오차 계산', 'Compute the mean error'], '', ['±5 mmHg 이내', 'Within ±5 mmHg']]], verifies: ['r-accuracy'] },
    { ref: 't-time', ext: 'TC-02', summary: ['측정 시간 측정', 'Reading duration'], level: 'system', kind: 'automated', script: 'pytest tests/test_timing.py', steps: [[['시뮬레이터로 120/80 신호 입력', 'Feed a 120/80 signal from the simulator'], '120/80, 72 bpm', ['40초 안에 결과 표시', 'Result within 40 s']]], verifies: ['r-time'] },
    { ref: 't-overpressure', ext: 'TC-03', summary: ['막힌 커프 과압 시험', 'Blocked-cuff over-pressure test'], level: 'system', kind: 'manual', pre: ['커프 출구를 막는다', 'Block the cuff outlet'], steps: [[['측정 시작', 'Start a reading'], '', ['압력이 오른다', 'Pressure rises']], [['압력 기록계를 본다', 'Watch the pressure logger'], '', ['300 mmHg에서 3초 안에 배기', 'Vents within 3 s at 300 mmHg']]], verifies: ['r-overpressure'] },
    { ref: 't-timeout', ext: 'TC-04', summary: ['180초 제한 시험', '180-second limit test'], level: 'system', kind: 'automated', script: 'pytest tests/test_timeout.py', steps: [[['측정을 멈추지 않는 신호 입력', 'Feed a signal that never settles'], '', ['180초에 중단·배기', 'Stops and vents at 180 s']]], verifies: ['r-timeout'] },
    { ref: 't-ble', ext: 'TC-05', summary: ['앱 전송 시험', 'App transfer test'], level: 'integration', kind: 'manual', steps: [[['앱과 짝을 맺는다', 'Pair with the app'], '', ['연결됨', 'Connected']], [['측정한다', 'Take a reading'], '', ['앱에 같은 값이 한 번 보인다', 'The same value shows once in the app']], [['연결을 끊고 다시 잇는다', 'Disconnect and reconnect'], '', ['기록이 중복되지 않는다', 'No duplicate readings']]], verifies: ['r-ble'] },
    { ref: 't-label', ext: 'TC-06', summary: ['표시 사항 검사', 'Labelling inspection'], level: 'acceptance', kind: 'manual', steps: [[['포장과 기기 표시를 점검표와 대조', 'Check the labels against the checklist'], '', ['모든 항목 일치', 'Every item matches']]], verifies: ['r-label'] },
  ],
  runs: [
    { ref: 'x-rc1', summary: ['펌웨어 1.0 RC1 시험', 'Firmware 1.0 RC1 run'], version: '1.0', daysAgo: 9, environment: ['시제품 B2, 앱 0.9', 'Prototype B2, app 0.9'], results: { 't-accuracy': 'pass', 't-time': 'pass', 't-overpressure': 'pass', 't-timeout': 'pass', 't-ble': 'pass', 't-label': 'blocked' } },
    { ref: 'x-rc2', summary: ['펌웨어 1.0 RC2 회귀 시험', 'Firmware 1.0 RC2 regression run'], version: '1.0', daysAgo: 2, status: 'progress', environment: ['시제품 B3, 앱 1.0', 'Prototype B3, app 1.0'], results: { 't-accuracy': 'pass', 't-time': 'pass', 't-overpressure': ['fail', ['312 mmHg까지 상승', 'Reached 312 mmHg'], 'b-cuff'], 't-timeout': 'notrun', 't-ble': ['fail', ['재연결 뒤 기록 2개', 'Two readings after reconnect'], 'b-ble'], 't-label': 'notrun' } },
  ],
};
