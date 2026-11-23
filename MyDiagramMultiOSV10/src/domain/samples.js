// The sample drawings written to samples/ (scripts/make-samples.mjs), in Korean
// and English, built with the same edit functions the app uses. Their names and
// groups are in sample-names.js. Not imported by the app: the installed files are
// what the start page opens.
import { designById } from './designs.js';
import { addLayer, addPage } from './diagram.js';
import { layoutPage } from './layout.js';
import { masterById } from './stencils.js';
import { sampleInfo } from './sample-names.js';
import { builder, buildSample, buildTemplate, data, L, newDoc } from './templates.js';
import { extraSamples } from './samples-extra.js';

/** A new drawing named after its entry in sample-names.js, with a title on the page. */
function start(stem, lang, design, stencils, { title = true } = {}) {
  const name = sampleInfo(stem).item.name[lang === 'en' ? 'en' : 'ko'];
  const { doc, page, b } = newDoc(lang, name, design);
  doc.stencils = stencils;
  doc.author = 'SHKWON';
  doc.company = 'MyDiagram';
  page.name = name;
  if (title) b.add('title', 40, 18, name, { w: 620, style: { align: 'left' } });
  return { doc, page, b, t: (ko, en) => L(lang, ko, en) };
}

const plain = { style: { endArrow: 'none' } };
const dashed = { style: { dash: 'dash', endArrow: 'open' } };
const wire = (extra = {}) => ({ style: { endArrow: 'none', lineWidth: 2 }, ...extra });
const caption = (b, x, y, w, text, style = {}, h = 40) => b.add('textBox', x, y, text, { w, h, style: { align: 'left', valign: 'top', fontSize: 12, ...style } });
/** A label just below and right of a shape, where the line leaving its bottom does not cross it. */
const sideLabel = (b, shape, text, w = 130) => caption(b, shape.x + shape.w / 2 + 8, shape.y + shape.h + 2, w, text, {}, 22);

/**
 * Text outside a shape (or on a shape without a fill) would take the colour meant
 * for the shape's fill and vanish on the page: it gets the page's text colour.
 * Shapes without a fill drop the theme's shadow, which would draw them as a box.
 */
function finish(doc) {
  const design = designById(doc.design);
  const ink = design.dark ? design.text : '#1f2937';
  for (const page of doc.pages) {
    for (const shape of page.shapes) {
      if (shape.type === 'connector' || shape.type === 'group') continue;
      const master = masterById(shape.master);
      const [, top, , bottom] = master.text;
      const noFill = master.style?.fill === 'none' || shape.style?.fill === 'none';
      const outside = top >= 1 || (bottom <= 0 && (!master.textHeader || noFill));
      if ((outside || noFill) && !shape.style?.textColor) shape.style = { ...shape.style, textColor: ink };
      if (noFill) shape.style = { ...shape.style, shadow: false };
      if (shape.master === 'milestoneMarker') shape.style = { ...shape.style, line: ink };
    }
  }
  return doc;
}

// ───────────────────────── flowcharts

function loginFlow(lang) {
  const { doc, b, t } = start('login-flow', lang, 'linear', ['flowchart', 'arrows', 'callouts']);
  const begin = b.add('terminator', 40, 120, t('시작', 'Start'), { qs: { color: 6 } });
  const input = b.add('manualInput', 220, 105, t('아이디·비밀번호\n입력', 'Enter ID and\npassword'));
  const verify = b.add('predefined', 410, 110, t('인증 서버 확인', 'Check with the\nauth server'), { w: 150, y: 105 });
  const match = b.add('decision', 610, 90, t('일치?', 'Match?'), { w: 150, h: 100, qs: { color: 4 } });
  const two = b.add('decision', 830, 85, t('2단계 인증\n사용?', 'Two-factor\non?'), { w: 170, h: 110, qs: { color: 4 } });
  const count = b.add('process', 620, 290, t('실패 횟수 +1', 'Failures +1'));
  const many = b.add('decision', 610, 420, t('5회 초과?', 'Over 5?'), { w: 150, h: 100, qs: { color: 4 } });
  const lock = b.add('process', 620, 580, t('계정 잠금', 'Lock account'), { qs: { color: 2 } });
  const end1 = b.add('terminator', 620, 700, t('종료', 'End'), { qs: { color: 6 } });
  const otp = b.add('manualInput', 850, 270, t('인증 코드 입력', 'Enter the code'));
  const otpOk = b.add('decision', 840, 400, t('코드 맞음?', 'Code OK?'), { w: 150, h: 100, qs: { color: 4 } });
  const session = b.add('process', 850, 580, t('세션 생성', 'Create session'));
  const end2 = b.add('terminator', 850, 700, t('홈 화면', 'Home screen'), { qs: { color: 6 } });
  b.link(begin, input); b.link(input, verify); b.link(verify, match);
  b.link(match, two, { text: t('예', 'Yes'), fromPt: 1, toPt: 3 });
  b.link(match, count, { text: t('아니요', 'No'), fromPt: 2, toPt: 0 });
  b.link(count, many); b.link(many, lock, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(many, input, { text: t('아니요', 'No'), fromPt: 3, toPt: 2 });
  b.link(lock, end1);
  b.link(two, otp, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(otp, otpOk);
  b.link(otpOk, session, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(otpOk, otp, { text: t('아니요', 'No'), fromPt: 3, toPt: 3 });
  b.link(two, session, { text: t('아니요', 'No'), fromPt: 1, toPt: 1 });
  b.link(session, end2);
  b.add('note', 50, 540, t('실패 횟수는 로그인에 성공하면 0으로 되돌립니다.', 'The failure count goes back to 0 after a successful login.'), { w: 230, h: 110 });
  return doc;
}

function atmWithdrawal(lang) {
  const { doc, b, t } = start('atm-withdrawal', lang, 'facet', ['flowchart', 'callouts']);
  const begin = b.add('terminator', 40, 120, t('시작', 'Start'), { qs: { color: 6 } });
  const card = b.add('manualOperation', 210, 115, t('카드 삽입', 'Insert card'));
  const pin = b.add('manualInput', 380, 105, t('PIN 입력', 'Enter PIN'));
  const ok = b.add('decision', 560, 95, t('PIN 맞음?', 'PIN OK?'), { w: 140, h: 90, qs: { color: 4 } });
  const amount = b.add('data', 760, 105, t('금액 입력', 'Enter amount'));
  const tries = b.add('decision', 560, 250, t('3회 초과?', 'Over 3 tries?'), { w: 140, h: 90, qs: { color: 4 } });
  const keep = b.add('process', 565, 400, t('카드 보관', 'Keep the card'), { qs: { color: 2 } });
  const end1 = b.add('terminator', 565, 520, t('종료', 'End'), { qs: { color: 6 } });
  const enough = b.add('decision', 745, 240, t('잔액 충분?', 'Enough\nbalance?'), { w: 150, h: 90, qs: { color: 4 } });
  const lack = b.add('display', 935, 250, t('잔액 부족', 'Too low'), { w: 100 });
  const prepare = b.add('process', 760, 380, t('현금 준비', 'Count cash'));
  const cash = b.add('display', 760, 500, t('현금 배출', 'Dispense cash'));
  const receipt = b.add('document', 760, 620, t('명세표 출력', 'Print receipt'));
  const end2 = b.add('terminator', 925, 626, t('카드 반환', 'Return card'), { w: 110, qs: { color: 6 } });
  b.link(begin, card); b.link(card, pin); b.link(pin, ok); b.link(ok, amount, { text: t('예', 'Yes') });
  b.link(ok, tries, { text: t('아니요', 'No'), fromPt: 2, toPt: 0 });
  b.link(tries, pin, { text: t('아니요', 'No'), fromPt: 3, toPt: 2 });
  b.link(tries, keep, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(keep, end1); b.link(amount, enough, { fromPt: 2, toPt: 0 });
  b.link(enough, prepare, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(enough, lack, { text: t('아니요', 'No'), fromPt: 1, toPt: 3 });
  b.link(lack, amount, { fromPt: 0, toPt: 1 });
  b.link(prepare, cash); b.link(cash, receipt); b.link(receipt, end2);
  b.add('note', 90, 330, t('고객이 30초 안에 답하지 않으면 거래를 취소하고 카드를 돌려줍니다.', 'If the customer does not answer in 30 seconds, the transaction is cancelled and the card returned.'), { w: 240, h: 130 });
  return doc;
}

function bugTriage(lang) {
  const { doc, b, t } = start('bug-triage', lang, 'slice', ['flowchart', 'callouts']);
  const report = b.add('terminator', 40, 110, t('버그 신고', 'Bug reported'), { qs: { color: 6 } });
  const repro = b.add('process', 220, 105, t('재현 시도', 'Try to reproduce'));
  const can = b.add('decision', 400, 95, t('재현됨?', 'Reproduced?'), { w: 150, h: 90, qs: { color: 4 } });
  const severe = b.add('decision', 620, 95, t('심각도\n높음?', 'High\nseverity?'), { w: 140, h: 90, qs: { color: 4 } });
  const hotfix = b.add('process', 840, 105, t('긴급 수정', 'Hotfix'), { qs: { color: 2 } });
  const ask = b.add('document', 410, 270, t('추가 정보 요청', 'Ask for details'));
  const backlog = b.add('storedData', 625, 270, t('백로그 등록', 'Add to backlog'));
  const sprint = b.add('process', 625, 400, t('스프린트 배정', 'Plan in sprint'));
  const review = b.add('process', 840, 400, t('코드 리뷰', 'Code review'));
  const pass = b.add('decision', 840, 530, t('테스트\n통과?', 'Tests\npass?'), { w: 130, h: 90, qs: { color: 4 } });
  const deploy = b.add('process', 625, 540, t('배포', 'Deploy'));
  const done = b.add('terminator', 410, 545, t('완료', 'Closed'), { qs: { color: 6 } });
  b.link(report, repro); b.link(repro, can);
  b.link(can, severe, { text: t('예', 'Yes') });
  b.link(can, ask, { text: t('아니요', 'No'), fromPt: 2, toPt: 0 });
  b.link(ask, repro, { fromPt: 3, toPt: 2 });
  b.link(severe, hotfix, { text: t('예', 'Yes') });
  b.link(severe, backlog, { text: t('아니요', 'No'), fromPt: 2, toPt: 0 });
  b.link(backlog, sprint); b.link(sprint, review); b.link(hotfix, review, { fromPt: 2, toPt: 0 }); b.link(review, pass, { fromPt: 2, toPt: 0 });
  b.link(pass, deploy, { text: t('예', 'Yes'), fromPt: 3, toPt: 1 });
  b.link(pass, hotfix, { text: t('아니요', 'No'), fromPt: 1, toPt: 1 });
  b.link(deploy, done);
  return doc;
}

function hiringProcess(lang) {
  const { doc, b, t } = start('hiring-process', lang, 'ion', ['containers', 'flowchart']);
  [t('지원자', 'Candidate'), t('채용팀', 'Recruiting'), t('현업 부서', 'Department')].forEach((name, i) => b.add('swimlane', 40, 80 + i * 210, name, { w: 960, h: 210, qs: { color: i + 1 } }));
  const need = b.add('terminator', 100, 555, t('채용 요청', 'Request a hire'), { qs: { color: 6 } });
  const post = b.add('process', 100, 350, t('공고 게시', 'Post the job'));
  const apply = b.add('document', 100, 145, t('지원서 제출', 'Apply'));
  const screen = b.add('process', 280, 350, t('서류 심사', 'Screen résumés'));
  const pass = b.add('decision', 460, 340, t('통과?', 'Pass?'), { qs: { color: 4 } });
  const reject = b.add('document', 460, 145, t('불합격 안내', 'Rejection letter'));
  const talk = b.add('process', 460, 555, t('면접', 'Interview'));
  const fit = b.add('decision', 640, 545, t('적합?', 'Good fit?'), { qs: { color: 4 } });
  const offer = b.add('process', 640, 350, t('오퍼 작성', 'Make an offer'));
  const accept = b.add('decision', 640, 135, t('수락?', 'Accept?'), { qs: { color: 4 } });
  const join = b.add('terminator', 860, 150, t('입사', 'Starts work'), { qs: { color: 6 } });
  const again = b.add('process', 820, 350, t('후보 재검토', 'Review others'));
  const record = b.add('process', 820, 555, t('결과 기록', 'Record result'));
  b.link(need, post, { fromPt: 0, toPt: 2 }); b.link(post, apply, { fromPt: 0, toPt: 2 }); b.link(apply, screen, { fromPt: 1, toPt: 0 }); b.link(screen, pass);
  b.link(pass, reject, { text: t('아니요', 'No'), fromPt: 0, toPt: 2 });
  b.link(pass, talk, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(talk, fit);
  b.link(fit, offer, { text: t('예', 'Yes'), fromPt: 0, toPt: 2 });
  b.link(fit, record, { text: t('아니요', 'No'), fromPt: 1, toPt: 3 });
  b.link(offer, accept, { fromPt: 0, toPt: 2 });
  b.link(accept, join, { text: t('예', 'Yes'), textPos: 0.3, fromPt: 1, toPt: 3 });
  b.link(accept, again, { text: t('아니요', 'No'), fromPt: 1, toPt: 0 });
  b.link(again, record, { fromPt: 2, toPt: 0 });
  return doc;
}

function incidentResponse(lang) {
  const { doc, b, t } = start('incident-response', lang, 'sequence', ['containers', 'flowchart']);
  [t('모니터링', 'Monitoring'), t('당직 엔지니어', 'On-call engineer'), t('개발팀', 'Developers'), t('고객 지원', 'Customer support')].forEach((name, i) => b.add('swimlaneV', 40 + i * 240, 75, name, { w: 240, h: 695, qs: { color: i + 1 } }));
  const alarm = b.add('terminator', 95, 135, t('경보 감지', 'Alert fires'), { qs: { color: 6 } });
  const check = b.add('process', 335, 130, t('영향 확인', 'Check the impact'));
  const big = b.add('decision', 335, 240, t('심각?', 'Severe?'), { qs: { color: 4 } });
  const ticket = b.add('document', 575, 245, t('일반 티켓', 'Normal ticket'));
  const declare = b.add('process', 335, 385, t('장애 선언', 'Declare incident'), { qs: { color: 2 } });
  const cause = b.add('process', 575, 385, t('원인 분석', 'Find the cause'));
  const notice = b.add('document', 815, 380, t('장애 공지', 'Incident notice'));
  const fix = b.add('process', 575, 495, t('복구 조치', 'Restore service'));
  const fixed = b.add('decision', 575, 600, t('복구됨?', 'Restored?'), { qs: { color: 4 } });
  const recovered = b.add('document', 815, 605, t('복구 공지', 'Recovery notice'));
  const review = b.add('process', 335, 700, t('사후 검토', 'Post-mortem'), { h: 60, qs: { color: 6 } });
  b.link(alarm, check); b.link(check, big, { fromPt: 2, toPt: 0 });
  b.link(big, ticket, { text: t('아니요', 'No'), fromPt: 1, toPt: 3 });
  b.link(big, declare, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(declare, cause); b.link(cause, notice, { style: { dash: 'dash', endArrow: 'open' } }); b.link(cause, fix, { route: 'straight', fromPt: 2, toPt: 0 }); b.link(fix, fixed, { route: 'straight', fromPt: 2, toPt: 0 });
  b.link(fixed, fix, { text: t('아니요', 'No'), fromPt: 3, toPt: 3 });
  b.link(fixed, recovered, { text: t('예', 'Yes'), fromPt: 1, toPt: 3 });
  b.link(fixed, review, { fromPt: 2, toPt: 1 });
  return doc;
}

// ───────────────────────── BPMN

function purchaseApproval(lang) {
  const { doc, b, t } = start('purchase-approval', lang, 'whisp', ['bpmn', 'containers']);
  [t('요청자', 'Requester'), t('팀장', 'Team lead'), t('구매팀', 'Purchasing')].forEach((name, i) => b.add('swimlane', 40, 80 + i * 200, name, { w: 980, h: 200, qs: { color: i + 1 } }));
  const s = b.add('bpmnStart', 110, 155, t('필요 발생', 'Need arises'));
  const form = b.add('bpmnTask', 200, 135, t('구매 요청서\n작성', 'Write purchase\nrequest'));
  const review = b.add('bpmnTask', 200, 335, t('요청 검토', 'Review request'));
  const g = b.add('gatewayExclusive', 400, 347);
  caption(b, 464, 362, 110, t('승인?', 'Approved?'), {}, 24);
  const back = b.add('bpmnTask', 370, 135, t('반려 통보', 'Notify rejection'), { w: 120 });
  const e1 = b.add('bpmnEnd', 540, 155, t('반려', 'Rejected'));
  const fork = b.add('gatewayParallel', 400, 547);
  const quote = b.add('bpmnTask', 510, 495, t('견적 비교', 'Compare quotes'), { h: 62 });
  const budget = b.add('bpmnTask', 510, 590, t('예산 확인', 'Check budget'), { h: 62 });
  const join = b.add('gatewayParallel', 680, 547);
  const po = b.add('bpmnTask', 770, 535, t('발주', 'Place the order'), { h: 80 });
  const e2 = b.add('bpmnEnd', 945, 555, t('완료', 'Done'));
  const store = b.add('bpmnDataStore', 660, 340, t('구매 시스템', 'Purchasing system'));
  b.link(s, form); b.link(form, review, { fromPt: 2, toPt: 0 }); b.link(review, g);
  b.link(g, back, { text: t('아니요', 'No'), fromPt: 0, toPt: 2 });
  b.link(back, e1);
  b.link(g, fork, { text: t('예', 'Yes'), fromPt: 2, toPt: 0 });
  b.link(fork, quote, { fromPt: 0, toPt: 3 }); b.link(fork, budget, { fromPt: 2, toPt: 3 });
  b.link(quote, join, { fromPt: 1, toPt: 0 }); b.link(budget, join, { fromPt: 1, toPt: 2 });
  b.link(join, po); b.link(po, e2);
  b.link(po, store, { fromPt: 0, toPt: 1, ...dashed });
  return doc;
}

function supportTicket(lang) {
  const { doc, b, t } = start('support-ticket', lang, 'retrospect', ['bpmn', 'containers']);
  [[t('고객', 'Customer'), 80, 170], [t('상담원', 'Agent'), 250, 230], [t('기술팀', 'Engineers'), 480, 190]].forEach(([name, y, h], i) => b.add('swimlane', 40, y, name, { w: 980, h, qs: { color: i + 1 } }));
  const s = b.add('bpmnMessage', 110, 135, t('문의 접수', 'Question arrives'));
  const sort = b.add('bpmnTask', 190, 325, t('문의 분류', 'Sort the ticket'));
  const easy = b.add('gatewayExclusive', 380, 337);
  caption(b, 350, 310, 120, t('바로 답변?', 'Answer now?'), { align: 'center' }, 24);
  const answer = b.add('bpmnTask', 510, 325, t('답변 발송', 'Send an answer'));
  const wait = b.add('gatewayEvent', 700, 337);
  const reply = b.add('bpmnMessage', 790, 135, t('고객 확인', 'Customer confirms'));
  const solved = b.add('bpmnEnd', 930, 135, t('해결', 'Solved'));
  const timer = b.add('bpmnTimer', 830, 345, t('3일 경과', '3 days pass'));
  const closed = b.add('bpmnEnd', 950, 345, t('자동 종료', 'Auto-closed'));
  const analyse = b.add('bpmnSubprocess', 310, 525, t('원인 분석', 'Analyse the cause'));
  const patch = b.add('bpmnCallActivity', 510, 530, t('수정 배포', 'Ship a fix'));
  const db = b.add('bpmnDataStore', 170, 535, t('티켓 DB', 'Ticket DB'));
  b.link(s, sort, { fromPt: 1, toPt: 0 }); b.link(sort, easy);
  b.link(easy, answer, { text: t('예', 'Yes'), fromPt: 1, toPt: 3 });
  b.link(easy, analyse, { text: t('아니요', 'No'), fromPt: 2, toPt: 0 });
  b.link(analyse, patch); b.link(patch, answer, { fromPt: 0, toPt: 2 });
  b.link(answer, wait); b.link(wait, reply, { fromPt: 0, toPt: 3 }); b.link(wait, timer, { fromPt: 1, toPt: 3 });
  b.link(reply, solved); b.link(timer, closed);
  b.link(analyse, db, { fromPt: 3, toPt: 1, ...dashed });
  return doc;
}

// ───────────────────────── UML

function libraryClass(lang) {
  const { doc, b, t } = start('library-class', lang, 'integral', ['uml', 'callouts']);
  const book = b.add('umlClass', 60, 90, 'Book\n---\n- isbn: String\n- title: String\n- year: int\n---\n+ isAvailable(): boolean', { w: 220, h: 170 });
  const member = b.add('umlClass', 420, 90, 'Member\n---\n- id: int\n- name: String\n---\n+ borrow(b: Book): Loan', { w: 220, h: 150 });
  const staff = b.add('umlClass', 770, 90, 'Librarian\n---\n- staffNo: int\n---\n+ addBook(b: Book)', { w: 220, h: 130 });
  const author = b.add('umlClass', 60, 420, 'Author\n---\n- name: String\n- country: String', { w: 220, h: 110 });
  const loan = b.add('umlClass', 420, 380, 'Loan\n---\n- start: Date\n- due: Date\n---\n+ isOverdue(): boolean\n+ close()', { w: 220, h: 170 });
  const search = b.add('umlInterface', 770, 400, '«interface»\nSearchable\n---\n+ matches(q: String): boolean', { w: 220, h: 110 });
  b.link(author, book, { text: '1..*', fromPt: 0, toPt: 2, style: { endArrow: 'open' } });
  b.link(member, loan, { text: '1 — *', fromPt: 2, toPt: 0, style: { endArrow: 'open' } });
  b.link(loan, book, { text: '* — 1', fromPt: 3, toPt: 1, style: { endArrow: 'open' } });
  b.link(staff, member, { fromPt: 3, toPt: 1, style: { endArrow: 'triangleOpen' } });
  b.link(loan, search, { fromPt: 1, toPt: 3, style: { dash: 'dash', endArrow: 'triangleOpen' } });
  b.add('umlNote', 420, 610, t('연체된 대출이 있는 회원은 새로 빌릴 수 없습니다.', 'A member with an overdue loan cannot borrow again.'), { w: 240, h: 90 });
  return doc;
}

function atmUsecase(lang) {
  const { doc, b, t } = start('atm-usecase', lang, 'office', ['uml', 'containers']);
  b.add('groupFrame', 190, 80, t('ATM 시스템', 'ATM system'), { w: 650, h: 660 });
  const customer = b.add('umlActor', 80, 320, t('고객', 'Customer'));
  const bank = b.add('umlActor', 930, 200, t('은행 시스템', 'Bank system'));
  const tech = b.add('umlActor', 930, 520, t('정비사', 'Technician'));
  const use = (x, y, ko, en) => b.add('umlUseCase', x, y, t(ko, en), { w: 170, h: 74 });
  const balance = use(240, 130, '잔액 조회', 'Check balance');
  const withdraw = use(240, 250, '현금 출금', 'Withdraw cash');
  const deposit = use(240, 370, '현금 입금', 'Deposit cash');
  const transfer = use(240, 490, '계좌 이체', 'Transfer money');
  const auth = use(620, 210, '카드 인증', 'Authenticate card');
  const refill = use(620, 490, '현금 보충', 'Refill cash');
  const logs = use(620, 610, '기록 확인', 'Read the logs');
  for (const u of [balance, withdraw, deposit, transfer]) b.link(customer, u, { route: 'straight', fromPt: 1, toPt: 3, ...plain });
  for (const u of [balance, withdraw, deposit, transfer]) b.link(u, auth, { route: 'straight', ...dashed });
  b.add('textBox', 430, 295, '«include»', { w: 90, h: 26, style: { italic: true, fontSize: 12 } });
  b.link(bank, auth, { route: 'straight', ...plain });
  b.link(tech, refill, { route: 'straight', ...plain }); b.link(tech, logs, { route: 'straight', ...plain });
  return doc;
}

function loginSequence(lang) {
  const { doc, b, t } = start('login-sequence', lang, 'linear', ['uml', 'callouts']);
  const levels = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [0.5, 0.11 + i * 0.115]);
  const line = (x, name) => b.add('umlLifeline', x, 80, name, { w: 150, h: 680, points: levels });
  const browser = line(60, t('브라우저', 'Browser'));
  const web = line(320, t('웹 서버', 'Web server'));
  const auth = line(580, t('인증 서비스', 'Auth service'));
  const db = line(840, t('데이터베이스', 'Database'));
  const message = (a, c, level, text, reply = false) => b.link(a, c, { route: 'straight', text, fromPt: level, toPt: level, style: reply ? { dash: 'dash', endArrow: 'open' } : { endArrow: 'arrow' } });
  message(browser, web, 0, t('1. 로그인 요청', '1. Log in'));
  message(web, auth, 1, t('2. 자격 확인', '2. Verify'));
  message(auth, db, 2, t('3. 사용자 조회', '3. Find user'));
  message(db, auth, 3, t('4. 사용자 정보', '4. User row'), true);
  message(auth, web, 4, t('5. 토큰 발급', '5. Token'), true);
  message(web, browser, 5, t('6. 세션 쿠키', '6. Session cookie'), true);
  message(browser, web, 6, t('7. 홈 화면 요청', '7. Get home'));
  message(web, browser, 7, t('8. 홈 화면', '8. Home page'), true);
  return doc;
}

function orderState(lang) {
  const { doc, b, t } = start('order-state', lang, 'bubble', ['uml', 'callouts']);
  const state = (x, y, ko, en) => b.add('umlState', x, y, t(ko, en), { w: 150, h: 70 });
  const init = b.add('umlInitial', 60, 130);
  const waiting = state(160, 110, '결제 대기', 'Awaiting payment');
  const paid = state(460, 110, '결제 완료', 'Paid');
  const preparing = state(760, 110, '상품 준비', 'Preparing');
  const shipping = state(760, 300, '배송 중', 'Shipping');
  const delivered = state(760, 490, '배송 완료', 'Delivered');
  const cancelled = state(160, 400, '취소됨', 'Cancelled');
  const refunding = state(460, 400, '환불 처리', 'Refunding');
  const returning = state(460, 620, '반품 처리', 'Returning');
  const end1 = b.add('umlFinal', 218, 590);
  const end2 = b.add('umlFinal', 960, 508);
  const go = (a, c, text, extra = {}) => b.link(a, c, { text, ...extra });
  go(init, waiting, '');
  go(waiting, paid, t('결제', 'pay'), { fromPt: 1, toPt: 3 });
  go(paid, preparing, t('접수', 'accept'), { fromPt: 1, toPt: 3 });
  go(preparing, shipping, t('출고', 'ship'), { fromPt: 2, toPt: 0 });
  go(shipping, delivered, t('수령', 'receive'), { fromPt: 2, toPt: 0 });
  go(delivered, end2, t('확정', 'confirm'), { fromPt: 1, toPt: 3 });
  go(waiting, cancelled, t('시간 초과', 'timeout'), { fromPt: 2, toPt: 0 });
  go(paid, refunding, t('취소 요청', 'cancel'), { fromPt: 2, toPt: 0 });
  go(refunding, cancelled, t('환불 완료', 'refunded'), { fromPt: 3, toPt: 1 });
  go(delivered, returning, t('반품 요청', 'return'), { fromPt: 2, toPt: 1 });
  go(returning, refunding, t('검수 완료', 'checked'), { fromPt: 0, toPt: 2 });
  go(cancelled, end1, '', { fromPt: 2, toPt: 0 });
  return doc;
}

function checkoutActivity(lang) {
  const { doc, b, t } = start('checkout-activity', lang, 'radiance', ['uml', 'callouts']);
  const act = (x, y, ko, en, w = 170) => b.add('umlState', x, y, t(ko, en), { w, h: 52 });
  const init = b.add('umlInitial', 505, 78);
  const cart = act(435, 130, '재고 확인', 'Check stock');
  const dec = b.add('umlDecision', 495, 205);
  const soldout = act(700, 204, '품절 안내', 'Tell sold out');
  const endA = b.add('umlFinal', 930, 213);
  const fork = b.add('umlFork', 200, 295, '', { w: 640 });
  const pay = act(285, 340, '결제 승인', 'Approve payment', 150);
  const stock = act(445, 340, '재고 차감', 'Reduce stock', 150);
  const point = act(605, 340, '포인트 적립', 'Add points', 150);
  const join = b.add('umlFork', 200, 435, '', { w: 640 });
  const order = act(435, 480, '주문서 발행', 'Issue order');
  const mail = act(435, 570, '영수증 메일', 'E-mail receipt');
  const end = b.add('umlFinal', 503, 665);
  b.link(init, cart, { route: 'straight', fromPt: 2, toPt: 0 }); b.link(cart, dec, { route: 'straight', fromPt: 2, toPt: 0 });
  b.link(dec, soldout, { text: t('없음', 'none'), fromPt: 1, toPt: 3 });
  b.link(soldout, endA, { fromPt: 1, toPt: 3 });
  b.link(dec, fork, { text: t('있음', 'in stock'), fromPt: 2, toPt: 1 });
  b.link(fork, pay, { route: 'straight', fromPt: 3, toPt: 0 }); b.link(fork, stock, { route: 'straight', fromPt: 4, toPt: 0 }); b.link(fork, point, { route: 'straight', fromPt: 5, toPt: 0 });
  b.link(pay, join, { route: 'straight', fromPt: 2, toPt: 0 }); b.link(stock, join, { route: 'straight', fromPt: 2, toPt: 1 }); b.link(point, join, { route: 'straight', fromPt: 2, toPt: 2 });
  b.link(join, order, { route: 'straight', fromPt: 4, toPt: 0 }); b.link(order, mail, { fromPt: 2, toPt: 0 }); b.link(mail, end, { fromPt: 2, toPt: 0 });
  return doc;
}

function webDeployment(lang) {
  const { doc, b, t } = start('web-deployment', lang, 'blueprint', ['uml', 'network']);
  const node = (x, y, w, h, ko, en) => b.add('umlNode', x, y, t(ko, en), { w, h, style: { valign: 'top', align: 'left', bold: true } });
  node(50, 280, 230, 190, '«기기» 사용자 PC', '«device» User PC');
  node(370, 100, 260, 190, '«서버» 웹 서버', '«server» Web server');
  node(370, 460, 260, 190, '«서버» 앱 서버', '«server» App server');
  node(730, 100, 260, 190, '«서버» 캐시 서버', '«server» Cache server');
  node(730, 460, 260, 190, '«서버» DB 서버', '«server» DB server');
  const comp = (x, y, text) => b.add('umlComponent', x, y, text, { w: 170, h: 70 });
  const browser = comp(70, 360, t('브라우저', 'Browser'));
  const nginx = comp(400, 190, 'nginx');
  const api = comp(400, 550, t('주문 API', 'Order API'));
  const redis = comp(760, 190, 'Redis');
  const pg = comp(760, 550, 'PostgreSQL');
  b.link(browser, nginx, { text: 'HTTPS', fromPt: 0, toPt: 3 });
  b.link(nginx, api, { text: 'HTTP', fromPt: 2, toPt: 0 });
  b.link(api, redis, { text: 'TCP 6379', fromPt: 1, toPt: 2 });
  b.link(api, pg, { text: 'TCP 5432', fromPt: 1, toPt: 3 });
  return doc;
}

// ───────────────────────── databases

function schoolEr(lang) {
  const { doc, b, t } = start('school-er', lang, 'sequence', ['erd', 'callouts']);
  const entity = (x, y, ko, en) => b.add('entity', x, y, t(ko, en), { w: 130, h: 60 });
  const relation = (x, y, ko, en) => b.add('relationship', x, y, t(ko, en), { w: 130, h: 80 });
  const attr = (x, y, ko, en, key = false) => b.add(key ? 'keyAttribute' : 'attribute', x, y, t(ko, en), { w: 110, h: 50 });
  const student = entity(100, 330, '학생', 'Student');
  const takes = relation(300, 320, '수강', 'Takes');
  const course = entity(500, 330, '강좌', 'Course');
  const teaches = relation(700, 320, '담당', 'Teaches');
  const prof = entity(890, 330, '교수', 'Professor');
  const has = relation(590, 440, '포함', 'Has');
  const task = b.add('weakEntity', 585, 575, t('과제', 'Assignment'), { w: 140, h: 60 });
  b.link(student, takes, { text: 'N', route: 'straight', ...plain }); b.link(takes, course, { text: 'M', route: 'straight', ...plain });
  b.link(course, teaches, { text: 'N', route: 'straight', ...plain }); b.link(teaches, prof, { text: '1', route: 'straight', ...plain });
  b.link(course, has, { text: '1', route: 'straight', ...plain }); b.link(has, task, { text: 'N', route: 'straight', ...plain });
  const own = (e, a) => b.link(e, a, { route: 'straight', ...plain });
  own(student, attr(40, 210, '학번', 'Student no.', true)); own(student, attr(170, 210, '이름', 'Name')); own(student, attr(105, 450, '학년', 'Year'));
  own(takes, attr(310, 210, '성적', 'Grade'));
  own(course, attr(450, 210, '강좌 번호', 'Course no.', true)); own(course, attr(580, 210, '강좌명', 'Title')); own(course, attr(420, 450, '학점', 'Credits'));
  own(prof, attr(790, 210, '교번', 'Staff no.', true)); own(prof, attr(920, 210, '이름', 'Name')); own(prof, attr(850, 450, '연구실', 'Office'));
  own(task, attr(400, 580, '과제 번호', 'Task no.', true)); own(task, attr(790, 580, '마감일', 'Due date'));
  return doc;
}

function blogDatabase(lang) {
  const { doc, b, t } = start('blog-database', lang, 'midnight', ['erd', 'callouts']);
  const table = (x, y, h, ko, en) => b.add('entity', x, y, t(ko, en), { w: 220, h });
  const user = table(60, 90, 160, '사용자\n---\nPK 사용자ID\n이름\n이메일\n가입일', 'User\n---\nPK UserID\nName\nEmail\nJoined');
  const post = table(420, 90, 180, '게시글\n---\nPK 게시글ID\nFK 사용자ID\n제목\n본문\n작성일', 'Post\n---\nPK PostID\nFK UserID\nTitle\nBody\nCreated');
  const link = table(780, 90, 130, '게시글_태그\n---\nPK,FK 게시글ID\nPK,FK 태그ID', 'Post_Tag\n---\nPK,FK PostID\nPK,FK TagID');
  const comment = table(420, 400, 170, '댓글\n---\nPK 댓글ID\nFK 게시글ID\nFK 사용자ID\n내용\n작성일', 'Comment\n---\nPK CommentID\nFK PostID\nFK UserID\nText\nCreated');
  const tag = table(780, 400, 110, '태그\n---\nPK 태그ID\n이름', 'Tag\n---\nPK TagID\nName');
  const view = b.add('dbView', 60, 420, t('인기 게시글 (뷰)\n---\n제목\n댓글 수', 'Popular posts (view)\n---\nTitle\nComment count'), { w: 220, h: 120 });
  b.link(user, post, { fromPt: 2, toPt: 6, style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } });
  b.link(post, comment, { fromPt: 4, toPt: 0, style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } });
  b.link(user, comment, { fromPt: 4, toPt: 6, style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } });
  b.link(post, link, { fromPt: 2, toPt: 6, style: { startArrow: 'oneOnly', endArrow: 'oneMany' } });
  b.link(tag, link, { fromPt: 0, toPt: 4, style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } });
  return doc;
}

// ───────────────────────── network & IT

function homeNetwork(lang) {
  const { doc, b, t } = start('home-network', lang, 'slice', ['network', 'basic']);
  const net = b.add('internet', 480, 80);
  sideLabel(b, net, t('인터넷', 'Internet'));
  const router = b.add('router', 475, 245, t('공유기', 'Home router'), { data: data({ IP: '192.168.0.1' }) });
  const sw = b.add('switch', 215, 250);
  sideLabel(b, sw, t('유선 스위치', 'Wired switch'));
  const ap = b.add('wirelessAp', 745, 240);
  sideLabel(b, ap, t('무선 AP', 'Wireless AP'));
  const device = (m, x, name, ip) => b.add(m, x, 470, name, { data: data({ IP: ip }) });
  const wired = [device('desktop', 50, t('데스크톱', 'Desktop'), '192.168.0.10'), device('printer', 200, t('프린터', 'Printer'), '192.168.0.11'), device('storage', 350, 'NAS', '192.168.0.12')];
  const air = [device('laptop', 560, t('노트북', 'Laptop'), '192.168.0.20'), device('phone', 720, t('휴대폰', 'Phone'), '192.168.0.21'), device('tablet', 830, t('태블릿', 'Tablet'), '192.168.0.22')];
  b.link(net, router, { fromPt: 2, toPt: 0, ...plain });
  b.link(router, sw, plain); b.link(router, ap, plain);
  for (const d of wired) b.link(sw, d, { fromPt: 2, toPt: 0, ...plain });
  for (const d of air) b.link(ap, d, { fromPt: 2, toPt: 0, style: { endArrow: 'none', dash: 'dash' } });
  b.add('note', 60, 90, t('게스트는 별도 와이파이를 쓰고 NAS에는 접근할 수 없습니다.', 'Guests use a separate Wi-Fi and cannot reach the NAS.'), { w: 230, h: 100 });
  return doc;
}

function cloud3Tier(lang) {
  const { doc, b, t } = start('cloud-3tier', lang, 'organic', ['network', 'containers']);
  [[420, '웹 계층', 'Web tier'], [630, '앱 계층', 'App tier'], [840, '데이터 계층', 'Data tier']].forEach(([x, ko, en]) => b.add('groupFrame', x, 90, t(ko, en), { w: 190, h: 640 }));
  const user = b.add('user', 40, 340, t('사용자', 'Users'));
  const cdn = b.add('cloudNet', 130, 333, 'CDN', { w: 120 });
  const lb = b.add('router', 290, 345, t('부하 분산기', 'Load balancer'));
  const web1 = b.add('server', 485, 180, t('웹 1', 'Web 1'), { data: data({ [t('사양', 'Size')]: '2 vCPU' }) });
  const web2 = b.add('server', 485, 450, t('웹 2', 'Web 2'), { data: data({ [t('사양', 'Size')]: '2 vCPU' }) });
  const app1 = b.add('server', 695, 180, t('앱 1', 'App 1'), { data: data({ [t('사양', 'Size')]: '4 vCPU' }) });
  const app2 = b.add('server', 695, 450, t('앱 2', 'App 2'), { data: data({ [t('사양', 'Size')]: '4 vCPU' }) });
  const main = b.add('dbServer', 880, 170);
  caption(b, 954, 200, 74, t('주 DB', 'Primary DB'), {}, 24);
  const replica = b.add('dbServer', 880, 370, t('복제 DB', 'Replica DB'));
  const files = b.add('storage', 875, 570, t('파일 저장소', 'File storage'));
  b.link(user, cdn, { route: 'straight' }); b.link(cdn, lb, { route: 'straight' });
  b.link(lb, web1, { fromPt: 1, toPt: 3 }); b.link(lb, web2, { fromPt: 1, toPt: 3 });
  b.link(web1, app1, { route: 'straight' }); b.link(web2, app2, { route: 'straight' });
  b.link(app1, main, { fromPt: 1, toPt: 3 }); b.link(app2, main, { fromPt: 1, toPt: 3 });
  b.link(main, replica, { text: t('복제', 'replication'), fromPt: 2, toPt: 0, ...dashed });
  b.link(app2, files, { fromPt: 1, toPt: 3 });
  return doc;
}

function branchVpn(lang) {
  const { doc, page, b, t } = start('branch-vpn', lang, 'integral', ['network', 'containers', 'basic']);
  page.name = t('개요', 'Overview');
  b.add('groupFrame', 50, 110, t('본사 (서울)', 'Head office (Seoul)'), { w: 300, h: 560 });
  b.add('groupFrame', 700, 90, t('지사 (부산)', 'Branch (Busan)'), { w: 300, h: 280 });
  b.add('groupFrame', 700, 410, t('지사 (대전)', 'Branch (Daejeon)'), { w: 300, h: 280 });
  const net = b.add('cloudNet', 445, 310, t('인터넷', 'Internet'), { w: 160, h: 100 });
  const hqFw = b.add('firewall', 155, 180, '', { data: data({ IP: '203.0.113.1' }) });
  sideLabel(b, hqFw, t('방화벽', 'Firewall'));
  const hqSw = b.add('switch', 145, 340);
  sideLabel(b, hqSw, t('코어 스위치', 'Core switch'));
  const hqSrv = b.add('server', 170, 490, t('사내 서버', 'Company server'), { data: data({ IP: '10.1.0.10' }) });
  const buFw = b.add('firewall', 750, 160, t('방화벽', 'Firewall'), { data: data({ IP: '198.51.100.2' }) });
  const buPc = b.add('desktop', 880, 155, t('사무실 PC', 'Office PC'));
  const djFw = b.add('firewall', 750, 480, t('방화벽', 'Firewall'), { data: data({ IP: '198.51.100.3' }) });
  const djPc = b.add('desktop', 880, 475, t('사무실 PC', 'Office PC'));
  b.link(hqFw, hqSw, { fromPt: 2, toPt: 0, ...plain }); b.link(hqSw, hqSrv, { fromPt: 2, toPt: 0, ...plain });
  b.link(buFw, buPc, plain); b.link(djFw, djPc, plain);
  const vpn = { style: { dash: 'dash', endArrow: 'none', lineWidth: 2 } };
  b.link(hqFw, net, { text: 'IPsec VPN', fromPt: 1, toPt: 3, ...vpn });
  b.link(net, buFw, { fromPt: 1, toPt: 3, ...vpn }); b.link(net, djFw, { fromPt: 1, toPt: 3, ...vpn });
  caption(b, 610, 325, 80, 'IPsec VPN', {}, 24);

  const hq = addPage(doc, { name: t('본사 LAN', 'Head office LAN') });
  const hb = builder(hq);
  hb.add('title', 40, 18, t('본사 LAN (10.1.0.0/16)', 'Head office LAN (10.1.0.0/16)'), { w: 620, style: { align: 'left' } });
  const fw = hb.add('firewall', 480, 90);
  sideLabel(hb, fw, t('방화벽', 'Firewall'));
  const core = hb.add('switch', 470, 230);
  sideLabel(hb, core, t('코어 스위치', 'Core switch'));
  const s1 = hb.add('switch', 170, 380);
  sideLabel(hb, s1, t('1층 스위치', '1st floor switch'));
  const s2 = hb.add('switch', 760, 380);
  sideLabel(hb, s2, t('2층 스위치', '2nd floor switch'));
  const rack = hb.add('rack', 490, 370, t('서버 랙', 'Server rack'), { data: data({ IP: '10.1.0.0/24' }) });
  hb.link(fw, core, { fromPt: 2, toPt: 0, ...plain }); hb.link(core, s1, plain); hb.link(core, s2, plain); hb.link(core, rack, { fromPt: 2, toPt: 0, ...plain });
  [['desktop', 60, t('영업 PC', 'Sales PC'), '10.1.1.11'], ['desktop', 190, t('재무 PC', 'Finance PC'), '10.1.1.12'], ['printer', 320, t('프린터', 'Printer'), '10.1.1.50']].forEach(([m, x, name, ip]) => hb.link(s1, hb.add(m, x, 560, name, { data: data({ IP: ip }) }), { fromPt: 2, toPt: 0, ...plain }));
  [['laptop', 640, t('개발 노트북', 'Dev laptop'), '10.1.2.11'], ['wirelessAp', 780, t('무선 AP', 'Wireless AP'), '10.1.2.2'], ['monitor', 900, t('회의실', 'Meeting room'), '10.1.2.30']].forEach(([m, x, name, ip]) => hb.link(s2, hb.add(m, x, 560, name, { data: data({ IP: ip }) }), { fromPt: 2, toPt: 0, ...plain }));

  const br = addPage(doc, { name: t('지사 LAN', 'Branch LAN') });
  const bb = builder(br);
  bb.add('title', 40, 18, t('지사 LAN (10.2.0.0/16)', 'Branch LAN (10.2.0.0/16)'), { w: 620, style: { align: 'left' } });
  const bFw = bb.add('firewall', 480, 100);
  sideLabel(bb, bFw, t('방화벽', 'Firewall'));
  const bSw = bb.add('switch', 470, 260);
  sideLabel(bb, bSw, t('스위치', 'Switch'));
  bb.link(bFw, bSw, { fromPt: 2, toPt: 0, ...plain });
  [['desktop', 170, t('영업 PC', 'Sales PC'), '10.2.0.11'], ['desktop', 330, t('상담 PC', 'Support PC'), '10.2.0.12'], ['printer', 490, t('프린터', 'Printer'), '10.2.0.50'], ['wirelessAp', 640, t('무선 AP', 'Wireless AP'), '10.2.0.2'], ['storage', 780, 'NAS', '10.2.0.60']].forEach(([m, x, name, ip]) => bb.link(bSw, bb.add(m, x, 440, name, { data: data({ IP: ip }) }), { fromPt: 2, toPt: 0, ...plain }));
  return doc;
}

function cicdPipeline(lang) {
  const { doc, b, t } = start('cicd-pipeline', lang, 'chalkboard', ['blocks', 'arrows', 'network']);
  const stages = [t('커밋', 'Commit'), t('빌드', 'Build'), t('테스트', 'Test'), t('스테이징', 'Staging'), t('운영', 'Production')];
  stages.forEach((name, i) => b.add(i ? 'chevron' : 'homePlate', 50 + i * 190, 85, name, { w: 200, h: 70, qs: { color: (i % 6) + 1 } }));
  const dev = b.add('laptop', 60, 240);
  caption(b, 40, 214, 140, t('개발자', 'Developer'), { align: 'center' }, 24);
  const repo = b.add('storage', 250, 240, t('코드 저장소', 'Code repository'));
  const build = b.add('gear', 430, 225, t('빌드 서버', 'Build server'));
  const tests = b.add('target', 630, 225, t('자동 테스트', 'Automated tests'));
  const image = b.add('block3d', 830, 235, t('이미지 저장소', 'Image registry'), { w: 150 });
  const stage = b.add('server', 875, 450, t('스테이징', 'Staging'));
  const approve = b.add('decision', 610, 450, t('승인?', 'Approved?'), { w: 140 });
  const prod = b.add('rack', 430, 435, t('운영 서버', 'Production'));
  const alert = b.add('document', 225, 460, t('실패 알림', 'Failure alert'));
  b.link(dev, repo, { text: 'git push', route: 'straight' }); b.link(repo, build, { route: 'straight' }); b.link(build, tests, { route: 'straight' }); b.link(tests, image, { route: 'straight' });
  b.link(image, stage, { fromPt: 2, toPt: 0 });
  b.link(stage, approve, { fromPt: 3, toPt: 1 });
  b.link(approve, prod, { text: t('예', 'Yes'), fromPt: 3, toPt: 1 });
  b.link(approve, alert, { text: t('아니요', 'No'), fromPt: 2, toPt: 2 });
  b.link(alert, dev, { fromPt: 3, toPt: 2, ...dashed });
  return doc;
}

// ───────────────────────── org chart

function projectTeam(lang) {
  const { doc, b, t } = start('project-team', lang, 'ion', ['org', 'basic']);
  const person = (m, x, y, text, role, extra = {}) => b.add(m, x, y, text, { data: role ? data({ [t('역할', 'Role')]: role }) : [], ...extra });
  const pm = person('orgExecutive', 425, 80, t('김민준\n프로젝트 관리자', 'Alex Kim\nProject Manager'), t('총괄', 'Lead'), { w: 190 });
  const consult = person('orgConsultant', 790, 90, t('외부 컨설턴트\n오지호', 'Consultant\nJay Oh'), t('자문', 'Advice'), { w: 170 });
  const pmo = person('orgAssistant', 100, 95, t('PMO 지원', 'PMO support'), t('일정·보고', 'Schedule, reports'));
  const leads = [
    person('orgPhoto', 105, 225, t('이서연\n기획 리더', 'Sara Lee\nPlanning lead'), t('기획', 'Planning')),
    person('orgPhoto', 425, 225, t('박지훈\n개발 리더', 'James Park\nDev lead'), t('개발', 'Development')),
    person('orgPhoto', 755, 225, t('최유나\nQA 리더', 'Yuna Choi\nQA lead'), t('품질', 'Quality')),
  ];
  const line = (a, c, extra = {}) => b.link(a, c, { ...plain, ...extra });
  line(pm, consult, { style: { endArrow: 'none', dash: 'dash' } }); line(pm, pmo, { style: { endArrow: 'none', dash: 'dash' } });
  for (const lead of leads) line(pm, lead, { fromPt: 2, toPt: 0 });
  const member = (lead, m, x, y, text, role) => line(lead, person(m, x, y, text, role, { w: 150 }), { fromPt: 2, toPt: 0 });
  member(leads[0], 'orgPosition', 45, 370, t('정하은\n서비스 기획', 'Hana Jung\nProduct planner'), t('요구 사항', 'Requirements'));
  member(leads[0], 'orgPosition', 205, 370, t('강도윤\nUX 디자이너', 'Dan Kang\nUX designer'), t('화면 설계', 'UI design'));
  member(leads[1], 'orgPosition', 365, 370, t('윤서준\n프런트엔드', 'Sean Yoon\nFront-end'), 'React');
  member(leads[1], 'orgPosition', 525, 370, t('임지아\n백엔드', 'Jia Lim\nBack-end'), 'API');
  member(leads[2], 'orgPosition', 695, 370, t('한예린\n테스터', 'Erin Han\nTester'), t('테스트', 'Testing'));
  member(leads[2], 'orgVacancy', 855, 370, t('공석\n자동화 테스터', 'Vacant\nTest automation'), '');
  b.add('note', 45, 510, t('우리 팀 8명. 공석은 3월까지 채용합니다.', 'A team of 8. The vacancy is to be filled by March.'), { w: 210, h: 110 });
  return doc;
}

// ───────────────────────── mind maps & strategy

/** Spreads or shrinks the shapes' centres so that the drawing fills `area`. */
function fitShapes(page, area) {
  const shapes = page.shapes.filter((shape) => shape.type !== 'connector');
  const x1 = Math.min(...shapes.map((shape) => shape.x));
  const y1 = Math.min(...shapes.map((shape) => shape.y));
  const x2 = Math.max(...shapes.map((shape) => shape.x + shape.w));
  const y2 = Math.max(...shapes.map((shape) => shape.y + shape.h));
  const scale = (value, from, length, to, size, own) => to + own / 2 + ((value - from - own / 2) / (length - own)) * (size - own);
  for (const shape of shapes) {
    const cx = scale(shape.x + shape.w / 2, x1, x2 - x1, area.x, area.w, 120);
    const cy = scale(shape.y + shape.h / 2, y1, y2 - y1, area.y, area.h, 40);
    shape.x = cx - shape.w / 2;
    shape.y = cy - shape.h / 2;
  }
}

function mindDoc(stem, lang, design, center, topics) {
  const { doc, page, b, t } = start(stem, lang, design, ['mind', 'basic'], { title: false });
  const root = b.add('centralTopic', 0, 0, center);
  topics.forEach(([name, subs], i) => {
    const topic = b.add('mainTopic', 0, 0, name, { qs: { color: i + 1 } });
    b.link(root, topic, { route: 'curved', style: { endArrow: 'none', lineWidth: 3 } });
    for (const sub of subs) b.link(topic, b.add('subTopic', 0, 0, sub, { qs: { color: i + 1, variant: 'subtle' } }), { route: 'curved', style: { endArrow: 'none' } });
  });
  layoutPage(page, { kind: 'radial', spacing: 22, origin: { x: 40, y: 30 } });
  fitShapes(page, { x: 40, y: 80, w: 980, h: 680 });
  b.add('title', 40, 18, sampleInfo(stem).item.name[t('ko', 'en')], { w: 620, style: { align: 'left' } });
  return doc;
}

const studyPlan = (lang) => mindDoc('study-plan', lang, 'bubble', L(lang, '자격증 합격', 'Pass the exam'), [
  [L(lang, '교재', 'Books'), [L(lang, '기본서', 'Textbook'), L(lang, '문제집', 'Workbook')]],
  [L(lang, '일정', 'Schedule'), [L(lang, '평일 2시간', '2 h on weekdays'), L(lang, '주말 복습', 'Weekend review')]],
  [L(lang, '모의고사', 'Mock tests'), [L(lang, '격주 1회', 'Every 2 weeks'), L(lang, '오답 노트', 'Error notes')]],
  [L(lang, '건강', 'Health'), [L(lang, '수면 7시간', '7 h of sleep'), L(lang, '걷기', 'Walking')]],
]);

const travelPlan = (lang) => mindDoc('travel-plan', lang, 'radiance', L(lang, '제주 여행', 'Trip to Jeju'), [
  [L(lang, '교통', 'Transport'), [L(lang, '항공권', 'Flights'), L(lang, '렌터카', 'Rental car')]],
  [L(lang, '숙소', 'Stay'), [L(lang, '호텔 2박', '2 hotel nights'), L(lang, '게스트하우스', 'Guesthouse')]],
  [L(lang, '볼거리', 'Sights'), [L(lang, '한라산', 'Hallasan'), L(lang, '성산일출봉', 'Seongsan Peak')]],
  [L(lang, '먹거리', 'Food'), [L(lang, '흑돼지', 'Black pork'), L(lang, '해산물', 'Seafood')]],
  [L(lang, '준비물', 'Packing'), [L(lang, '우비', 'Raincoat'), L(lang, '운동화', 'Sneakers')]],
]);

function swot(lang) {
  const { doc, b, t } = start('swot', lang, 'facet', ['containers', 'basic', 'callouts']);
  const quads = [
    [50, 85, 1, t('강점 (Strengths)', 'Strengths'), [t('충성 고객층', 'Loyal customers'), t('자체 물류망', 'Own logistics'), t('빠른 배송', 'Fast delivery'), t('높은 재구매율', 'Repeat purchases')]],
    [530, 85, 2, t('약점 (Weaknesses)', 'Weaknesses'), [t('좁은 상품군', 'Narrow range'), t('높은 인건비', 'High labour cost'), t('낮은 인지도', 'Low awareness'), t('낡은 시스템', 'Old IT systems')]],
    [50, 420, 3, t('기회 (Opportunities)', 'Opportunities'), [t('해외 직구 확대', 'Cross-border sales'), t('구독 서비스', 'Subscriptions'), t('제휴 마케팅', 'Partner marketing'), t('친환경 수요', 'Green demand')]],
    [530, 420, 4, t('위협 (Threats)', 'Threats'), [t('대형 경쟁사', 'Big competitors'), t('원가 상승', 'Rising costs'), t('규제 강화', 'New regulation'), t('환율 변동', 'Exchange rates')]],
  ];
  for (const [x, y, color, name, items] of quads) {
    b.add('container', x, y, name, { w: 460, h: 320, qs: { color } });
    items.forEach((text, i) => b.add('roundRect', x + 25 + (i % 2) * 215, y + 60 + Math.floor(i / 2) * 125, text, { w: 195, h: 90, qs: { color, variant: 'subtle' } }));
  }
  return doc;
}

// ───────────────────────── floor plans

function studioApartment(lang) {
  const { doc, b, t } = start('studio-apartment', lang, 'monochrome', ['floor', 'basic']);
  b.add('room', 60, 90, '', { w: 920, h: 640 });
  b.add('room', 60, 90, '', { w: 280, h: 250, style: { lineWidth: 3 } });
  b.add('window', 480, 84, '', { w: 220 });
  b.add('window', 974, 380, '', { w: 12, h: 180 });
  b.add('toilet', 90, 110, t('변기', 'Toilet'));
  b.add('sink', 230, 105, t('세면대', 'Sink'));
  b.add('door', 245, 260, '', { w: 75, h: 75 });
  b.add('tableRect', 80, 380, t('주방 조리대', 'Kitchen counter'), { w: 110, h: 190 });
  b.add('sink', 100, 585, t('개수대', 'Sink'));
  b.add('rect', 225, 380, t('냉장고', 'Fridge'), { w: 90, h: 90, style: { fill: '#e2e8f0', line: '#475569', textColor: '#1f2937' } });
  b.add('door', 240, 650, '', { w: 75, h: 75 });
  caption(b, 320, 695, 90, t('현관', 'Entrance'), {}, 24);
  b.add('bed', 790, 120, t('침대', 'Bed'), { w: 160, h: 220 });
  b.add('desk', 440, 110, t('책상', 'Desk'), { w: 170 });
  b.add('chair', 500, 195, '', { angle: 180 });
  b.add('sofa', 480, 620, t('소파', 'Sofa'), { w: 220, angle: 180, style: { textAngle: 180 } });
  b.add('tableRect', 520, 500, t('탁자', 'Table'), { w: 140, h: 70 });
  b.add('rect', 780, 620, 'TV', { w: 170, h: 60, style: { fill: '#475569', line: '#1e293b', textColor: '#ffffff' } });
  b.add('plant', 900, 410);
  return doc;
}

function cafeLayout(lang) {
  const { doc, page, b, t } = start('cafe-layout', lang, 'organic', ['floor', 'basic', 'callouts']);
  const furniture = addLayer(page, t('가구', 'Furniture'));
  const notes = addLayer(page, t('메모', 'Notes'));
  const onF = { layers: [furniture.id] };
  b.add('room', 50, 85, '', { w: 950, h: 650 });
  b.add('window', 450, 79, '', { w: 200 });
  b.add('window', 720, 79, '', { w: 200 });
  b.add('tableRect', 80, 110, t('주문 카운터', 'Order counter'), { w: 300, h: 70, ...onF });
  b.add('tableRect', 80, 180, t('쇼케이스', 'Showcase'), { w: 120, h: 60, ...onF });
  b.add('room', 50, 520, t('화장실', 'Restroom'), { w: 170, h: 215, style: { lineWidth: 3 } });
  b.add('toilet', 80, 545);
  b.add('sink', 135, 660);
  const round = (x, y, text) => {
    const size = 90;
    b.add('tableRound', x, y, text, { w: size, h: size, ...onF });
    for (const [dx, dy, angle] of [[28, -40, 0], [28, 96, 180], [-40, 28, 270], [96, 28, 90]]) b.add('chair', x + dx, y + dy, '', { w: 34, h: 34, angle, ...onF });
  };
  round(480, 180, 'A'); round(690, 180, 'B'); round(480, 400, 'C'); round(690, 400, 'D');
  b.add('sofa', 850, 120, t('소파석', 'Sofa'), { w: 110, h: 240, ...onF });
  b.add('tableRect', 770, 620, t('긴 테이블', 'Long table'), { w: 200, h: 70, ...onF });
  b.add('plant', 300, 660, '', onF);
  b.add('plant', 920, 450, '', onF);
  b.add('doubleDoor', 480, 665, t('출입문', 'Entrance'), { w: 120, h: 70 });
  b.add('note', 250, 300, t('줄 서는 공간 2m 이상 확보', 'Keep at least 2 m for the queue'), { w: 190, h: 90, layers: [notes.id] });
  return doc;
}

function classroom(lang) {
  const { doc, b, t } = start('classroom', lang, 'blueprint', ['floor', 'basic']);
  b.add('room', 60, 85, '', { w: 900, h: 660 });
  b.add('rect', 300, 100, t('칠판', 'Blackboard'), { w: 420, h: 32, style: { fill: '#14532d', line: '#052e16', textColor: '#ffffff' } });
  b.add('desk', 440, 150, t('교탁', 'Teacher'), { w: 140, h: 60 });
  b.add('chair', 487, 212, '', { w: 36, h: 36 });
  for (let i = 0; i < 3; i++) b.add('window', 54, 170 + i * 180, '', { w: 12, h: 130 });
  let number = 1;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 170 + col * 170;
      const y = 280 + row * 112;
      b.add('desk', x, y, String(number), { w: 120, h: 50 });
      b.add('chair', x + 43, y + 54, '', { w: 34, h: 34, angle: 180 });
      number += 1;
    }
  }
  b.add('door', 868, 110, '', { w: 82, h: 82 });
  b.add('door', 868, 655, '', { w: 82, h: 82 });
  b.add('plant', 80, 660);
  return doc;
}

// ───────────────────────── timelines

function productRoadmap(lang) {
  const { doc, b, t } = start('product-roadmap', lang, 'radiance', ['timeline', 'callouts']);
  const X = 150; const W = 840; const q = W / 4;
  b.add('timelineBar', X, 300, '', { w: W + 20 });
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach((name, i) => b.add('textBox', X + i * q, 336, `2027 ${name}`, { w: q, h: 26, style: { bold: true, fontSize: 12 } }));
  [[t('베타 공개', 'Public beta'), 0.18, 215], [t('1.0 출시', 'Release 1.0'), 0.46, 215], [t('모바일 앱', 'Mobile app'), 0.7, 215], [t('2.0 출시', 'Release 2.0'), 0.94, 215]].forEach(([name, at, y]) => b.add('milestoneMarker', X + at * W - 15, y, name, { h: 85 }));
  const lanes = [
    [t('기획', 'Planning'), 1, [[0, 0.2, t('요구 사항', 'Requirements')], [0.48, 0.2, t('사용자 조사', 'User research')]]],
    [t('개발', 'Development'), 2, [[0.05, 0.4, t('핵심 기능', 'Core features')], [0.5, 0.42, t('모바일·협업', 'Mobile, sharing')]]],
    [t('품질', 'Quality'), 3, [[0.3, 0.16, t('베타 테스트', 'Beta testing')], [0.78, 0.15, t('부하 시험', 'Load test')]]],
    [t('마케팅', 'Marketing'), 4, [[0.38, 0.14, t('사전 예약', 'Pre-orders')], [0.86, 0.13, t('캠페인', 'Campaign')]]],
  ];
  lanes.forEach(([name, color, blocks], i) => {
    const y = 390 + i * 70;
    b.add('textBox', 40, y, name, { w: 100, h: 40, style: { bold: true, align: 'right' } });
    for (const [at, span, text] of blocks) b.add('intervalBlock', X + at * W, y, text, { w: span * W, h: 40, qs: { color, variant: 'subtle' } });
  });
  return doc;
}

function eventSchedule(lang) {
  const { doc, b, t } = start('event-schedule', lang, 'whisp', ['timeline', 'callouts']);
  const X = 60; const W = 920;
  const at = (hour) => X + ((hour - 9) / 9) * W;
  b.add('timelineBar', X, 300, '', { w: W + 20 });
  for (let hour = 9; hour <= 18; hour += 1) b.add('textBox', at(hour) - 30, 336, `${hour}:00`, { w: 60, h: 24, style: { fontSize: 11 } });
  [[9, '등록', 'Registration'], [10, '기조 강연', 'Keynote'], [12, '점심', 'Lunch'], [14, '패널 토론', 'Panel talk'], [16, '시상', 'Awards'], [17, '네트워킹', 'Networking']].forEach(([hour, ko, en]) => b.add('eventPin', at(hour) - 20 + (hour === 9 ? 20 : 0), 165, t(ko, en), { w: 40, h: 60 }));
  const tracks = [
    [t('대강당', 'Main hall'), 1, [[10, 12, t('기조 강연', 'Keynote')], [14, 16, t('패널 토론', 'Panel talk')], [16, 17, t('시상', 'Awards')]]],
    [t('A 세미나실', 'Room A'), 2, [[13, 14, t('사례 1', 'Case 1')], [14, 15.5, t('실습: 설계', 'Lab: design')]]],
    [t('B 세미나실', 'Room B'), 3, [[13, 14, t('사례 2', 'Case 2')], [15, 16.5, t('실습: 구현', 'Lab: build')]]],
    [t('로비', 'Lobby'), 4, [[9, 10, t('등록', 'Sign-in')], [12, 13, t('점심', 'Lunch')], [17, 18, t('네트워킹', 'Networking')]]],
  ];
  tracks.forEach(([name, color, blocks], i) => {
    const y = 400 + i * 70;
    b.add('textBox', X, y - 24, name, { w: 200, h: 22, style: { bold: true, align: 'left', fontSize: 12 } });
    for (const [from, to, text] of blocks) b.add('intervalBlock', at(from) + 2, y, text, { w: at(to) - at(from) - 4, h: 38, qs: { color, variant: 'subtle' } });
  });
  return doc;
}

// ───────────────────────── block diagrams

function salesFunnel(lang) {
  const { doc, b, t } = start('sales-funnel', lang, 'office', ['blocks', 'basic', 'callouts']);
  const stages = [
    [t('방문', 'Visitors'), 100000, 1], [t('관심', 'Interested'), 40000, 2], [t('장바구니', 'Cart'), 12000, 3], [t('구매', 'Purchase'), 4800, 4], [t('재구매', 'Repeat'), 1500, 6],
  ];
  const cx = 410; const top = 760; const step = 130; const y0 = 110; const h = 112;
  stages.forEach(([name, count, color], i) => {
    const w = top - i * step;
    b.add('trapezoid', cx - w / 2, y0 + i * (h + 6), `${name}\n${count.toLocaleString('en-US')}`, {
      w, h, flipV: true, params: { offset: (step / 2) / w }, qs: { color },
      data: data({ [t('인원', 'People')]: count }),
    });
    if (i > 0) b.add('tag', 800, y0 + i * (h + 6) - 28, t(`전환율 ${Math.round((count / stages[i - 1][1]) * 100)}%`, `Conversion ${Math.round((count / stages[i - 1][1]) * 100)}%`), { w: 190, h: 56, qs: { color, variant: 'subtle' } });
  });
  return doc;
}

function pdcaCycle(lang) {
  const { doc, b, t } = start('pdca-cycle', lang, 'linear', ['blocks', 'arrows', 'callouts']);
  const node = (x, y, en, ko, color) => b.add('circle', x, y, `${en}\n${t(ko, '').trim()}`.trim(), { w: 160, h: 160, qs: { color }, style: { bold: true, fontSize: 16 } });
  const plan = node(420, 80, 'Plan', '계획', 1);
  const act = node(720, 310, 'Do', '실행', 2);
  const check = node(420, 560, 'Check', '평가', 3);
  const fix = node(120, 310, 'Act', '개선', 4);
  b.add('circularArrow', 445, 335, '', { w: 110, h: 110, qs: { color: 5, variant: 'subtle' } });
  const arc = { route: 'curved', style: { lineWidth: 3 } };
  b.link(plan, act, { fromPt: 1, toPt: 0, ...arc }); b.link(act, check, { fromPt: 2, toPt: 1, ...arc }); b.link(check, fix, { fromPt: 3, toPt: 2, ...arc }); b.link(fix, plan, { fromPt: 0, toPt: 3, ...arc });
  caption(b, 610, 85, 370, t('목표를 정하고 문제와 원인을 분석해 계획을 세웁니다.', 'Set a goal, analyse the problem and its causes, and make a plan.'), {}, 60);
  caption(b, 890, 340, 150, t('작은 범위에서 계획대로 실행하고 결과를 기록합니다.', 'Carry out the plan on a small scale and record the results.'), {}, 100);
  caption(b, 600, 695, 400, t('결과를 목표와 비교해 무엇을 배웠는지 평가합니다.', 'Compare the results with the goal and see what was learned.'), {}, 60);
  caption(b, 30, 630, 210, t('효과가 있으면 표준으로 삼고, 아니면 다시 계획합니다.', 'Make it standard if it worked; otherwise plan again.'), {}, 80);
  return doc;
}

// ───────────────────────── electrical

function lampCircuit(lang) {
  const { doc, b, t } = start('lamp-circuit', lang, 'office', ['electrical', 'callouts']);
  const battery = b.add('voltageSource', 150, 320, '', { w: 70, h: 70 });
  caption(b, 60, 340, 85, t('전지\n12 V', 'Battery\n12 V'), { align: 'right' });
  const sw = b.add('switchElec', 300, 150, t('스위치 S1', 'Switch S1'));
  const fuse = b.add('resistor', 500, 167, t('저항 R1 10 Ω', 'Resistor R1 10 Ω'));
  const l1 = b.add('lamp', 680, 320, '', { w: 70, h: 70, angle: 90 });
  const l2 = b.add('lamp', 860, 320, '', { w: 70, h: 70, angle: 90 });
  caption(b, 755, 345, 90, t('램프 L1', 'Lamp L1'), {}, 24);
  caption(b, 935, 345, 90, t('램프 L2', 'Lamp L2'), {}, 24);
  const gnd = b.add('ground', 160, 550, t('접지', 'Ground'));
  b.link(battery, sw, wire({ fromPt: 0, toPt: 0 }));
  b.link(sw, fuse, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.link(fuse, l1, wire({ fromPt: 1, toPt: 0 }));
  b.link(fuse, l2, wire({ fromPt: 1, toPt: 0 }));
  b.link(l1, gnd, wire({ fromPt: 1, toPt: 0 }));
  b.link(l2, gnd, wire({ fromPt: 1, toPt: 0 }));
  b.link(battery, gnd, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.add('note', 350, 300, t('S1을 닫으면 두 램프가 병렬로 켜지며 전압은 같습니다.', 'Closing S1 lights both lamps in parallel, at the same voltage.'), { w: 230, h: 100 });
  return doc;
}

function rcFilter(lang) {
  const { doc, b, t } = start('rc-filter', lang, 'linear', ['electrical', 'callouts']);
  const source = b.add('acSource', 150, 280, '', { w: 70, h: 70 });
  caption(b, 60, 300, 85, t('입력\nVin', 'Input\nVin'), { align: 'right' });
  const r = b.add('resistor', 350, 167, 'R = 1 kΩ', { w: 120 });
  const c = b.add('capacitor', 590, 295, '', { angle: 90 });
  caption(b, 680, 305, 120, 'C = 100 nF', {}, 24);
  const out = b.add('onPage', 820, 162, t('출력', 'Out'), { w: 40, h: 40, style: { fontSize: 10 } });
  caption(b, 870, 175, 120, 'Vout', { bold: true }, 24);
  const gnd = b.add('ground', 160, 490, t('접지', 'Ground'));
  const gnd2 = b.add('ground', 605, 490, t('접지', 'Ground'));
  b.link(source, r, wire({ fromPt: 0, toPt: 0 }));
  b.link(r, c, wire({ fromPt: 1, toPt: 0 }));
  b.link(r, out, wire({ fromPt: 1, toPt: 3, route: 'straight' }));
  b.link(source, gnd, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.link(c, gnd2, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.add('note', 300, 590, t('저역 통과 필터: 차단 주파수 fc = 1 / (2πRC) ≈ 1.6 kHz', 'Low-pass filter: cut-off fc = 1 / (2πRC) ≈ 1.6 kHz'), { w: 400, h: 90 });
  return doc;
}

function transistorSwitch(lang) {
  const { doc, b, t } = start('transistor-switch', lang, 'office', ['electrical', 'callouts']);
  const vcc = b.add('voltageSource', 110, 290, '', { w: 70, h: 70 });
  caption(b, 30, 310, 75, 'Vcc\n5 V', { align: 'right' });
  const sw = b.add('switchElec', 240, 348, t('입력 스위치', 'Input switch'));
  const rb = b.add('resistor', 410, 365, 'Rb 10 kΩ');
  const q = b.add('transistor', 610, 340, '');
  caption(b, 695, 365, 120, t('트랜지스터\nQ1 (NPN)', 'Transistor\nQ1 (NPN)'));
  const lamp = b.add('lamp', 650, 200, '', { w: 60, h: 60, angle: 90 });
  caption(b, 720, 218, 110, t('부하 램프', 'Load lamp'), {}, 24);
  const gnd1 = b.add('ground', 120, 490, t('접지', 'Ground'));
  const gnd2 = b.add('ground', 655, 490, t('접지', 'Ground'));
  b.link(vcc, lamp, wire({ fromPt: 0, toPt: 0 }));
  b.link(vcc, sw, wire({ fromPt: 0, toPt: 0 }));
  b.link(sw, rb, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.link(rb, q, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.link(lamp, q, wire({ fromPt: 1, toPt: 1, route: 'straight' }));
  b.link(q, gnd2, wire({ fromPt: 2, toPt: 0, route: 'straight' }));
  b.link(vcc, gnd1, wire({ fromPt: 1, toPt: 0, route: 'straight' }));
  b.add('note', 280, 610, t('베이스에 작은 전류가 흐르면 컬렉터의 큰 전류가 흘러 램프가 켜집니다.', 'A small base current lets a large collector current flow, and the lamp lights.'), { w: 400, h: 90 });
  return doc;
}

/**
 * The drawings below are laid out for A4 landscape (Korean); on the narrower US Letter page
 * (English) the whole drawing shrinks evenly, around the top-left corner, until it fits.
 */
function fitToPage(doc) {
  const margin = 12;
  for (const page of doc.pages) {
    const shapes = page.shapes.filter((shape) => shape.type !== 'connector' && shape.type !== 'group');
    const right = Math.max(...shapes.map((shape) => shape.x + shape.w));
    const bottom = Math.max(...shapes.map((shape) => shape.y + shape.h));
    const k = Math.min(1, (page.width - margin) / right, (page.height - margin) / bottom);
    if (k >= 1) continue;
    for (const shape of shapes) Object.assign(shape, { x: shape.x * k, y: shape.y * k, w: shape.w * k, h: shape.h * k });
  }
  return doc;
}

// ───────────────────────── more flowcharts and BPMN

function passwordReset(lang) {
  const { doc, b, t } = start('password-reset', lang, 'ion', ['flowchart', 'callouts']);
  const yes = t('예', 'Yes'); const no = t('아니요', 'No');
  const begin = b.add('terminator', 40, 120, t('비밀번호 찾기', 'Forgot password'), { qs: { color: 6 } });
  const email = b.add('manualInput', 215, 105, t('이메일 입력', 'Enter e-mail'));
  const known = b.add('decision', 400, 95, t('가입된\n주소?', 'Known\naddress?'), { w: 150, h: 100, qs: { color: 4 } });
  const send = b.add('process', 620, 115, t('재설정 링크 발송', 'Send a reset link'), { w: 150 });
  const same = b.add('display', 410, 270, t('같은 안내 표시', 'Show the same notice'), { w: 140 });
  const open = b.add('manualOperation', 625, 255, t('메일의 링크 열기', 'Open the link'), { w: 140 });
  const fresh = b.add('decision', 620, 385, t('30분 이내?', 'Within\n30 min?'), { w: 150, h: 100, qs: { color: 4 } });
  const expired = b.add('display', 850, 405, t('링크 만료 안내', 'Link expired'), { w: 140 });
  const typed = b.add('manualInput', 625, 545, t('새 비밀번호 입력', 'Type a new password'), { w: 140 });
  const rules = b.add('decision', 850, 530, t('규칙에\n맞음?', 'Meets the\nrules?'), { w: 150, h: 100, qs: { color: 4 } });
  const save = b.add('process', 620, 690, t('저장 · 모든 기기 로그아웃', 'Save, sign out everywhere'), { w: 170, h: 70 });
  const end = b.add('terminator', 880, 695, t('로그인 화면', 'Login screen'), { qs: { color: 6 } });
  b.link(begin, email); b.link(email, known);
  b.link(known, send, { text: yes, fromPt: 1, toPt: 3 });
  b.link(known, same, { text: no, fromPt: 2, toPt: 0 });
  b.link(send, open, { fromPt: 2, toPt: 0 }); b.link(open, fresh, { fromPt: 2, toPt: 0 });
  b.link(fresh, expired, { text: no, fromPt: 1, toPt: 3 });
  b.link(expired, begin, { fromPt: 0, toPt: 0 });
  b.link(fresh, typed, { text: yes, fromPt: 2, toPt: 0 });
  b.link(typed, rules, { fromPt: 1, toPt: 3 });
  b.link(rules, typed, { text: no, fromPt: 0, toPt: 0 });
  b.link(rules, save, { text: yes, fromPt: 2, toPt: 1 });
  b.link(save, end, { fromPt: 1, toPt: 3 });
  b.add('note', 60, 420, t('주소가 없어도 같은 안내를 보여 가입 여부가 드러나지 않게 합니다.', 'The same notice is shown for unknown addresses, so nobody can tell who has an account.'), { w: 260, h: 130 });
  return doc;
}

function leaveRequest(lang) {
  const { doc, b, t } = start('leave-request', lang, 'organic', ['bpmn', 'containers']);
  [t('직원', 'Employee'), t('팀장', 'Team lead'), t('인사팀', 'HR')].forEach((name, i) => b.add('swimlane', 40, 80 + i * 200, name, { w: 1000, h: 200, qs: { color: i + 1 } }));
  const s = b.add('bpmnStart', 110, 155, t('휴가 필요', 'Leave needed'));
  const form = b.add('bpmnUserTask', 200, 135, t('휴가 신청서\n작성', 'Fill in the\nleave form'));
  const fix = b.add('bpmnTask', 400, 135, t('날짜 조정', 'Change the dates'), { w: 120 });
  const review = b.add('bpmnUserTask', 200, 335, t('일정 검토', 'Check the plan'));
  const g = b.add('gatewayExclusive', 410, 347);
  caption(b, 474, 362, 110, t('승인?', 'Approved?'), {}, 24);
  const balance = b.add('bpmnServiceTask', 560, 535, t('남은 휴가 차감', 'Update the balance'));
  const pay = b.add('bpmnSendTask', 740, 535, t('급여팀 통보', 'Tell payroll'));
  const told = b.add('bpmnTask', 740, 135, t('휴가 사용', 'Take the leave'));
  const e = b.add('bpmnEnd', 930, 155, t('완료', 'Done'));
  const store = b.add('bpmnDataStore', 900, 540, t('인사 시스템', 'HR system'));
  b.link(s, form); b.link(form, review, { fromPt: 2, toPt: 0 }); b.link(review, g);
  b.link(g, fix, { text: t('아니요', 'No'), fromPt: 0, toPt: 2 });
  b.link(fix, form, { fromPt: 3, toPt: 1 });
  b.link(g, balance, { text: t('예', 'Yes'), fromPt: 2, toPt: 3 });
  b.link(balance, pay); b.link(pay, told, { fromPt: 0, toPt: 2 }); b.link(told, e);
  b.link(balance, store, { fromPt: 2, toPt: 2, ...dashed });
  return doc;
}

// ───────────────────────── wireframes

function loginWireframe(lang) {
  const { doc, b, t } = start('login-wireframe', lang, 'monochrome', ['wireframe', 'basic', 'callouts']);
  b.add('uiBrowser', 60, 80, 'https://shop.example.com/login', { w: 1000, h: 690 });
  b.add('uiNavbar', 80, 130, t('MyShop      홈      상품      고객센터', 'MyShop      Home      Products      Help'), { w: 960 });
  b.add('uiImage', 120, 230, t('대표 그림', 'Hero picture'), { w: 380, h: 300 });
  b.add('textBox', 600, 220, t('로그인', 'Sign in'), { w: 360, h: 50, style: { bold: true, fontSize: 24, align: 'left' } });
  b.add('uiInput', 600, 290, t('이메일', 'E-mail'), { w: 360 });
  b.add('uiInput', 600, 345, t('비밀번호', 'Password'), { w: 360 });
  b.add('uiCheckbox', 600, 400, t('로그인 상태 유지', 'Keep me signed in'), { w: 200 });
  b.add('uiButton', 600, 450, t('로그인', 'Sign in'), { w: 360, h: 40, qs: { color: 1 } });
  caption(b, 600, 505, 360, t('비밀번호 찾기 · 회원 가입', 'Forgot password? · Create an account'), { align: 'center' }, 24);
  b.add('uiButton', 600, 560, t('Google로 계속', 'Continue with Google'), { w: 175, h: 40 });
  b.add('uiButton', 785, 560, t('Apple로 계속', 'Continue with Apple'), { w: 175, h: 40 });
  b.add('note', 120, 600, t('오류는 해당 입력란 바로 아래에 빨간 글자로 보여 줍니다.', 'Errors show in red right under the field they are about.'), { w: 380, h: 110 });
  return doc;
}

function mobileShopApp(lang) {
  const { doc, b, t } = start('mobile-shop-app', lang, 'bubble', ['wireframe', 'arrows', 'callouts']);
  const phone = (x, ko, en) => b.add('uiPhone', x, 100, '', { w: 240, h: 480, data: data({ [t('화면', 'Screen')]: t(ko, en) }) });
  const home = phone(80, '홈', 'Home');
  const product = phone(440, '상품', 'Product');
  const cart = phone(800, '장바구니', 'Cart');
  b.add('uiSearch', 100, 160, t('검색', 'Search'), { w: 200 });
  [[100, 210, '운동화', 'Shoes'], [205, 210, '가방', 'Bags'], [100, 370, '모자', 'Hats'], [205, 370, '시계', 'Watches']].forEach(([x, y, ko, en]) => b.add('uiCard', x, y, t(ko, en), { w: 95, h: 150 }));
  b.add('uiImage', 460, 160, t('러닝화', 'Running shoes'), { w: 200, h: 140 });
  b.add('textBox', 460, 340, '₩89,000', { w: 200, h: 30, style: { bold: true, fontSize: 18 } });
  b.add('uiDropdown', 460, 385, t('사이즈 270', 'Size 270'), { w: 200 });
  b.add('uiButton', 460, 460, t('장바구니 담기', 'Add to cart'), { w: 200, h: 40, qs: { color: 1 } });
  b.add('textBox', 820, 160, t('러닝화 × 1\n모자 × 2', 'Running shoes × 1\nCap × 2'), { w: 200, h: 150, style: { align: 'left', valign: 'top' } });
  b.add('textBox', 820, 370, t('합계 ₩119,000', 'Total ₩119,000'), { w: 200, h: 30, style: { bold: true } });
  b.add('uiButton', 820, 460, t('결제하기', 'Pay now'), { w: 200, h: 40, qs: { color: 1 } });
  b.link(home, product, { text: t('상품 누르기', 'Tap a product') });
  b.link(product, cart, { text: t('담기', 'Add') });
  [[80, '1. 홈', '1. Home'], [440, '2. 상품', '2. Product'], [800, '3. 장바구니', '3. Cart']].forEach(([x, ko, en]) => b.add('textBox', x, 595, t(ko, en), { w: 240, h: 30, style: { bold: true } }));
  b.add('note', 80, 650, t('세 화면 모두 아래쪽 탭 막대(홈 · 검색 · 장바구니 · 내 정보)를 같은 자리에 둡니다.', 'All three screens keep the bottom tab bar (Home, Search, Cart, Me) in the same place.'), { w: 960, h: 90 });
  return doc;
}

// ───────────────────────── cloud & security

function serverlessApi(lang) {
  const { doc, b, t } = start('serverless-api', lang, 'midnight', ['cloud', 'network', 'containers']);
  b.add('groupFrame', 380, 90, t('클라우드 리전', 'Cloud region'), { w: 720, h: 660 });
  const users = b.add('user', 60, 320, t('사용자', 'Users'));
  const cdn = b.add('cldCdn', 230, 320, 'CDN');
  const site = b.add('cldBucket', 235, 540, t('웹 파일', 'Web files'));
  const api = b.add('cldApi', 430, 325, t('API 게이트웨이', 'API gateway'));
  const login = b.add('cldIdentity', 430, 140, t('로그인', 'Sign-in'));
  const orders = b.add('cldFunction', 640, 210, t('주문 함수', 'Orders function'));
  const images = b.add('cldFunction', 640, 440, t('그림 함수', 'Images function'));
  const db = b.add('cldDatabase', 860, 200, t('주문 DB', 'Orders DB'));
  const queue = b.add('cldQueue', 830, 450, t('작업 큐', 'Job queue'));
  const pictures = b.add('cldBucket', 1000, 435, t('그림 저장소', 'Pictures'));
  const watch = b.add('cldMonitoring', 635, 630, t('모니터링', 'Monitoring'));
  b.link(users, cdn); b.link(cdn, site); b.link(cdn, api);
  b.link(api, login); b.link(api, orders); b.link(api, images);
  b.link(orders, db); b.link(images, queue); b.link(queue, pictures);
  b.link(orders, watch, dashed); b.link(images, watch, dashed);
  b.add('note', 60, 120, t('함수는 요청이 있을 때만 실행되고 쓴 만큼만 요금을 냅니다.', 'The functions run only when called and are billed for what they use.'), { w: 250, h: 120 });
  return doc;
}

function zeroTrust(lang) {
  const { doc, b, t } = start('zero-trust', lang, 'blueprint', ['security', 'network', 'containers']);
  b.add('secZone', 650, 90, t('보호 구역', 'Protected zone'), { w: 430, h: 620 });
  const laptop = b.add('laptop', 60, 150, t('직원 노트북', 'Staff laptop'));
  const phone = b.add('phone', 70, 420, t('휴대폰', 'Phone'));
  const id = b.add('secFingerprint', 270, 140, t('신원 확인 (MFA)', 'Identity check (MFA)'));
  const health = b.add('secScan', 270, 410, t('기기 상태 검사', 'Device health check'));
  const policy = b.add('secShieldCheck', 470, 270, t('정책 엔진', 'Policy engine'));
  const hr = b.add('server', 720, 160, t('인사 앱', 'HR app'));
  const crm = b.add('dbServer', 720, 360, t('고객 DB', 'Customer DB'));
  const files = b.add('netFileServer', 720, 560, t('파일 서버', 'File server'));
  const lock = b.add('secLock', 950, 150, t('저장 암호화', 'Encrypted at rest'));
  const audit = b.add('secAudit', 950, 350, t('감사 기록', 'Audit log'));
  const token = b.add('secKey', 935, 580, t('짧은 토큰', 'Short-lived token'));
  b.link(laptop, id); b.link(phone, health); b.link(id, policy); b.link(health, policy);
  for (const app of [hr, crm, files]) b.link(policy, app);
  b.link(hr, lock, dashed); b.link(crm, audit, dashed); b.link(files, token, dashed);
  b.add('note', 60, 600, t('위치와 상관없이 모든 접속을 매번 확인합니다.', 'Every request is checked, wherever it comes from.'), { w: 280, h: 110 });
  return doc;
}

// ───────────────────────── software architecture

function c4Context(lang) {
  const { doc, b, t } = start('c4-context', lang, 'office', ['c4', 'callouts']);
  const customer = b.add('c4Person', 100, 90, t('고객\n[사람]\n온라인으로 상품을 삽니다', 'Customer\n[Person]\nBuys products online'), { w: 190, h: 150 });
  const staff = b.add('c4Person', 100, 520, t('상담원\n[사람]\n주문을 관리합니다', 'Support staff\n[Person]\nLooks after orders'), { w: 190, h: 150 });
  const shop = b.add('c4System', 440, 330, t('온라인 쇼핑몰\n[소프트웨어 시스템]\n상품 검색과 주문', 'Online shop\n[Software system]\nBrowse and order products'), { w: 250, h: 140 });
  const pay = b.add('c4External', 840, 110, t('결제 대행사\n[외부 시스템]', 'Payment provider\n[External system]'), { w: 220, h: 110 });
  const mail = b.add('c4External', 840, 345, t('메일 서비스\n[외부 시스템]', 'E-mail service\n[External system]'), { w: 220, h: 110 });
  const courier = b.add('c4External', 840, 580, t('택배사 시스템\n[외부 시스템]', 'Courier system\n[External system]'), { w: 220, h: 110 });
  b.link(customer, shop, { text: t('검색·주문 [HTTPS]', 'Browses, orders [HTTPS]') });
  b.link(staff, shop, { text: t('주문 관리', 'Manages orders') });
  b.link(shop, pay, { text: t('결제 [API]', 'Takes payments [API]') });
  b.link(shop, mail, { text: t('메일 발송 [SMTP]', 'Sends e-mail [SMTP]') });
  b.link(shop, courier, { text: t('배송 예약 [API]', 'Books deliveries [API]') });
  b.link(mail, customer, { text: t('메일 전달', 'Delivers e-mail'), ...dashed });
  return doc;
}

function orderDfd(lang) {
  const { doc, b, t } = start('order-dfd', lang, 'sequence', ['dfd', 'callouts']);
  const customer = b.add('dfdExternal', 60, 150, t('고객', 'Customer'));
  const bank = b.add('dfdExternal', 60, 580, t('은행', 'Bank'));
  const warehouse = b.add('dfdExternal', 930, 150, t('물류 창고', 'Warehouse'));
  const take = b.add('dfdProcess', 330, 120, t('1.0\n주문 접수', '1.0\nTake order'));
  const charge = b.add('dfdProcess', 330, 520, t('2.0\n결제', '2.0\nCharge card'));
  const ship = b.add('dfdProcess', 660, 320, t('3.0\n출고', '3.0\nShip order'));
  const orders = b.add('dfdStore', 620, 150, t('D1 주문', 'D1 Orders'));
  const payments = b.add('dfdStore', 620, 600, t('D2 결제', 'D2 Payments'));
  const stock = b.add('dfdStore', 900, 470, t('D3 재고', 'D3 Stock'));
  const flow = (a, c, ko, en) => b.link(a, c, { text: t(ko, en) });
  flow(customer, take, '주문 내용', 'order details');
  flow(take, orders, '새 주문', 'new order');
  flow(take, charge, '결제 금액', 'amount');
  flow(charge, bank, '승인 요청', 'charge');
  flow(bank, charge, '승인 결과', 'approval');
  flow(charge, payments, '결제 기록', 'payment record');
  flow(orders, ship, '결제된 주문', 'paid order');
  flow(ship, warehouse, '출고 목록', 'pick list');
  flow(ship, stock, '재고 변경', 'stock change');
  flow(ship, customer, '송장 번호', 'tracking number');
  return doc;
}

// ───────────────────────── agile

function sprintBoard(lang) {
  const { doc, b, t } = start('sprint-board', lang, 'retrospect', ['agile', 'callouts']);
  caption(b, 700, 30, 380, t('스프린트 7 · 3월 3일 ~ 14일', 'Sprint 7 · 3 – 14 March'), { align: 'right', bold: true, fontSize: 14 }, 28);
  const columns = [
    [t('백로그', 'Backlog'), [['agEpic', '에픽: 모바일 앱', 'Epic: Mobile app'], ['agStory', '검색 필터\n5점', 'Search filters\n5 pts'], ['agStory', '찜 목록\n3점', 'Wish list\n3 pts']]],
    [t('할 일', 'To do'), [['agTodo', '주문 메일\n2점', 'Order e-mail\n2 pts'], ['agBug', '장바구니 합계 오류\n1점', 'Wrong cart total\n1 pt']]],
    [t('진행 중', 'Doing'), [['agDoing', '결제 화면\n5점', 'Payment page\n5 pts'], ['agDoing', '로그인 API\n3점', 'Login API\n3 pts']]],
    [t('완료', 'Done'), [['agDone', '회원 가입\n3점', 'Sign-up\n3 pts'], ['agDone', '상품 목록\n5점', 'Product list\n5 pts'], ['agDone', '홈 화면\n2점', 'Home page\n2 pts']]],
  ];
  columns.forEach(([name, cards], i) => {
    const x = 40 + i * 270;
    b.add('agColumn', x, 90, name, { w: 250, h: 640, qs: { color: i + 1, variant: 'subtle' } });
    cards.forEach(([master, ko, en], j) => b.add(master, x + 15, 150 + j * 115, t(ko, en), { w: 220, h: 95 }));
  });
  return doc;
}

function scrumCycle(lang) {
  const { doc, b, t } = start('scrum-cycle', lang, 'linear', ['agile', 'arrows', 'callouts']);
  const box = (master, x, y, ko, en, extra = {}) => b.add(master, x, y, t(ko, en), { w: 170, h: 100, ...extra });
  const backlog = box('agBacklog', 50, 320, '제품 백로그', 'Product backlog');
  const planning = box('agSprint', 290, 130, '스프린트 계획', 'Sprint planning');
  const sprint = b.add('circularArrow', 470, 290, t('2주 스프린트', '2-week sprint'), { w: 190, h: 190, qs: { color: 2 } });
  const standup = box('agStandup', 720, 120, '매일 스탠드업', 'Daily stand-up');
  const review = box('agRelease', 880, 320, '스프린트 리뷰', 'Sprint review', { w: 180 });
  const retro = box('agRetro', 600, 580, '회고', 'Retrospective');
  const done = b.add('roundRect', 880, 580, t('제품 증분', 'Product increment'), { w: 180, h: 100, qs: { color: 6 } });
  b.link(backlog, planning, { text: t('우선순위 순', 'by priority') });
  b.link(planning, sprint); b.link(sprint, standup, { ...dashed, text: t('매일 15분', '15 min a day') });
  b.link(sprint, review); b.link(review, done); b.link(review, retro);
  b.link(retro, planning, { route: 'curved', text: t('다음 스프린트', 'next sprint') });
  b.add('note', 60, 560, t('스프린트 중에는 목표를 바꾸지 않습니다.', 'The sprint goal does not change during a sprint.'), { w: 240, h: 110 });
  return doc;
}

// ───────────────────────── logic, process and manufacturing

function halfAdder(lang) {
  const { doc, b, t } = start('half-adder', lang, 'chalkboard', ['logic', 'electrical', 'callouts']);
  const a = b.add('roundRect', 80, 200, t('입력 A', 'Input A'), { w: 100, h: 50, qs: { color: 1 } });
  const bIn = b.add('roundRect', 80, 430, t('입력 B', 'Input B'), { w: 100, h: 50, qs: { color: 2 } });
  const xor = b.add('logicXor', 440, 190, t('XOR (합)', 'XOR (sum)'), { w: 140, h: 84 });
  const and = b.add('logicAnd', 440, 420, t('AND (자리올림)', 'AND (carry)'), { w: 140, h: 84 });
  const s = b.add('elecLed', 780, 207, t('S 합', 'S sum'));
  const c = b.add('elecLed', 780, 437, t('C 자리올림', 'C carry'));
  for (const gate of [xor, and]) { b.link(a, gate, wire()); b.link(bIn, gate, wire()); }
  b.link(xor, s, wire()); b.link(and, c, wire());
  b.add('textBox', 160, 590, t('A B │ S C\n0 0 │ 0 0\n0 1 │ 1 0\n1 0 │ 1 0\n1 1 │ 0 1', 'A B │ S C\n0 0 │ 0 0\n0 1 │ 1 0\n1 0 │ 1 0\n1 1 │ 0 1'), { w: 260, h: 150, style: { fontSize: 15 } });
  b.add('note', 640, 600, 'S = A ⊕ B\nC = A · B', { w: 300, h: 110 });
  return doc;
}

function waterTreatment(lang) {
  const { doc, b, t } = start('water-treatment', lang, 'blueprint', ['process', 'callouts']);
  const pipe = { style: { endArrow: 'arrow', lineWidth: 2 } };
  const raw = b.add('pidTank', 50, 260, t('원수', 'Raw water'));
  const p1 = b.add('pidPump', 200, 290, 'P-101');
  const mix = b.add('pidMixer', 330, 260, t('응집', 'Coagulation'));
  const settle = b.add('pidColumn', 480, 230, t('침전', 'Settling'), { w: 90, h: 160 });
  const filter = b.add('pidFilter', 640, 290, t('모래 여과', 'Sand filter'));
  const valve = b.add('pidValveControl', 790, 310, 'FCV-201', { w: 70, h: 40 });
  const clean = b.add('pidTank', 950, 260, t('정수지', 'Clean water'));
  const flowMeter = b.add('pidInstrument', 790, 190, 'FI');
  const level = b.add('pidInstrument', 500, 120, 'LT');
  const chlorine = b.add('pidTankOpen', 640, 540, t('염소', 'Chlorine'), { w: 80, h: 100 });
  const p2 = b.add('pidPump', 800, 555, t('P-102 주입', 'P-102 dosing'));
  b.link(raw, p1, pipe); b.link(p1, mix, pipe); b.link(mix, settle, pipe); b.link(settle, filter, pipe); b.link(filter, valve, pipe); b.link(valve, clean, pipe);
  b.link(chlorine, p2, pipe); b.link(p2, clean, pipe);
  b.link(flowMeter, valve, { style: { dash: 'dot', endArrow: 'none' } });
  b.link(level, settle, { style: { dash: 'dot', endArrow: 'none' } });
  b.add('note', 60, 560, t('FI: 유량 표시, LT: 수위 전송기, FCV: 유량 조절 밸브', 'FI: flow indicator, LT: level transmitter, FCV: flow control valve'), { w: 300, h: 120 });
  return doc;
}

function assemblyLine(lang) {
  const { doc, b, t } = start('assembly-line', lang, 'slice', ['factory', 'callouts']);
  const parts = b.add('facStorage', 40, 300, t('부품 창고', 'Parts store'));
  const belt1 = b.add('facConveyor', 200, 320, t('컨베이어 1', 'Conveyor 1'), { w: 180 });
  const weld = b.add('facRobot', 430, 160, t('용접 로봇', 'Welding robot'));
  const cnc = b.add('facCnc', 420, 420, t('CNC 가공', 'CNC machining'));
  const belt2 = b.add('facConveyor', 590, 320, t('컨베이어 2', 'Conveyor 2'), { w: 180 });
  const check = b.add('facInspect', 810, 310, t('비전 검사', 'Vision check'));
  const goods = b.add('facStorage', 970, 300, t('완제품', 'Finished goods'));
  const rework = b.add('facWorker', 820, 500, t('재작업', 'Rework'));
  const plc = b.add('facPlc', 420, 630, t('라인 PLC', 'Line PLC'));
  const hmi = b.add('facHmi', 600, 630, t('작업자 패널', 'Operator panel'));
  b.link(parts, belt1); b.link(belt1, weld); b.link(belt1, cnc); b.link(weld, belt2); b.link(cnc, belt2);
  b.link(belt2, check); b.link(check, goods, { text: t('합격', 'pass') }); b.link(check, rework, { text: t('불량', 'fail') });
  b.link(rework, belt2, dashed);
  b.link(plc, cnc, dashed); b.link(plc, hmi, plain);
  return doc;
}

// ───────────────────────── strategy

function customerJourney(lang) {
  const { doc, b, t } = start('customer-journey', lang, 'radiance', ['basic', 'arrows', 'callouts']);
  const stages = [[t('알게 됨', 'Discover')], [t('비교', 'Compare')], [t('구매', 'Buy')], [t('받음', 'Receive')], [t('다시 찾음', 'Come back')]];
  const rows = [
    [t('행동', 'Actions'), [t('광고·후기 보기', 'Sees ads, reviews'), t('가격·배송 비교', 'Compares prices'), t('장바구니·결제', 'Cart and pay'), t('상자 열기', 'Opens the box'), t('재구매·추천', 'Buys again, tells friends')]],
    [t('접점', 'Touchpoints'), [t('SNS · 검색', 'Social, search'), t('상품 페이지', 'Product page'), t('결제 화면', 'Checkout'), t('택배 · 메일', 'Courier, e-mail'), t('쿠폰 · 앱 알림', 'Coupons, app alerts')]],
    [t('감정', 'Feelings'), [t('궁금함', 'Curious'), t('망설임', 'Unsure'), t('기대', 'Hopeful'), t('만족 / 실망', 'Pleased or let down'), t('신뢰', 'Trusting')]],
    [t('개선 아이디어', 'Ideas'), [t('짧은 동영상 후기', 'Short video reviews'), t('비교표 제공', 'A comparison table'), t('간편 결제', 'One-tap payment'), t('배송 단계 알림', 'Delivery updates'), t('회원 등급 혜택', 'Member rewards')]],
  ];
  stages.forEach(([name], i) => b.add('chevron', 150 + i * 190, 90, name, { w: 185, h: 60, qs: { color: i + 1 } }));
  rows.forEach(([label, cells], r) => {
    const y = 180 + r * 140;
    b.add('textBox', 30, y, label, { w: 110, h: 110, style: { bold: true, align: 'right' } });
    cells.forEach((text, i) => b.add('roundRect', 155 + i * 190, y, text, { w: 175, h: 110, qs: { color: i + 1, variant: 'subtle' } }));
  });
  return doc;
}

// ───────────────────────── life, health and education

function familyTree(lang) {
  const { doc, b, t } = start('family-tree', lang, 'whisp', ['genogram', 'callouts']);
  const person = (master, x, y, ko, en) => b.add(master, x, y, t(ko, en), { w: 60, h: 60 });
  const couple = { style: { endArrow: 'none', lineWidth: 2 } };
  const child = { style: { endArrow: 'none' } };
  const g1 = person('genMale', 200, 110, '할아버지\n1940', 'Grandfather\n1940');
  const g2 = person('genFemaleDead', 420, 110, '할머니\n1943–2019', 'Grandmother\n1943–2019');
  const g3 = person('genMaleDead', 680, 110, '외할아버지\n1938–2015', 'Grandfather\n1938–2015');
  const g4 = person('genFemale', 900, 110, '외할머니\n1945', 'Grandmother\n1945');
  const aunt = person('genFemale', 120, 330, '고모\n1966', 'Aunt\n1966');
  const father = person('genMale', 330, 330, '아버지\n1968', 'Father\n1968');
  const mother = person('genFemale', 780, 330, '어머니\n1970', 'Mother\n1970');
  const uncle = person('genMale', 990, 330, '외삼촌\n1973', 'Uncle\n1973');
  const me = person('genMaleSelf', 480, 560, '나\n1995', 'Me\n1995');
  const sister = person('genFemale', 650, 560, '여동생\n1998', 'Sister\n1998');
  b.link(g1, g2, couple); b.link(g3, g4, couple); b.link(father, mother, couple);
  b.link(g1, aunt, child); b.link(g1, father, child); b.link(g3, mother, child); b.link(g3, uncle, child);
  b.link(father, me, child); b.link(father, sister, child);
  b.add('note', 60, 640, t('네모는 남자, 동그라미는 여자, ✕ 표시는 고인, 굵은 테두리는 본인입니다.', 'Squares are men, circles women; a cross marks someone who has died, a bold outline is you.'), { w: 330, h: 110 });
  return doc;
}

function hospitalAdmission(lang) {
  const { doc, b, t } = start('hospital-admission', lang, 'linear', ['flowchart', 'medical', 'callouts']);
  const yes = t('예', 'Yes'); const no = t('아니요', 'No');
  const arrive = b.add('terminator', 40, 120, t('내원', 'Arrive'), { qs: { color: 6 } });
  const desk = b.add('process', 210, 120, t('접수', 'Check in'));
  const doctor = b.add('medDoctor', 410, 110, t('진료', 'See a doctor'));
  const admit = b.add('decision', 560, 100, t('입원 필요?', 'Admit?'), { w: 150, h: 100, qs: { color: 4 } });
  const outpatient = b.add('process', 560, 290, t('외래 처방', 'Outpatient care'), { w: 150 });
  const bed = b.add('medBed', 800, 115, t('병실 배정', 'Ward bed'));
  const care = b.add('medMonitor', 815, 300, t('치료·관찰', 'Treatment, watch'));
  const better = b.add('decision', 790, 450, t('회복됨?', 'Recovered?'), { w: 150, h: 100, qs: { color: 4 } });
  const papers = b.add('process', 560, 470, t('퇴원 수속', 'Discharge'), { w: 150 });
  const pills = b.add('medPill', 590, 620, t('퇴원 약', 'Take-home medicine'));
  const home = b.add('terminator', 300, 610, t('귀가', 'Go home'), { qs: { color: 6 } });
  b.link(arrive, desk); b.link(desk, doctor); b.link(doctor, admit);
  b.link(admit, bed, { text: yes, fromPt: 1 });
  b.link(admit, outpatient, { text: no, fromPt: 2, toPt: 0 });
  b.link(outpatient, home);
  b.link(bed, care); b.link(care, better);
  b.link(better, care, { text: no, fromPt: 1 });
  b.link(better, papers, { text: yes, fromPt: 3, toPt: 1 });
  b.link(papers, pills); b.link(pills, home);
  return doc;
}

function courseCurriculum(lang) {
  const { doc, b, t } = start('course-curriculum', lang, 'integral', ['education', 'basic', 'callouts']);
  const terms = [
    [t('1학기', 'Term 1'), [t('프로그래밍 1', 'Programming 1'), t('이산 수학', 'Discrete maths'), t('글쓰기', 'Writing')]],
    [t('2학기', 'Term 2'), [t('프로그래밍 2', 'Programming 2'), t('선형 대수', 'Linear algebra'), t('데이터베이스', 'Databases')]],
    [t('3학기', 'Term 3'), [t('자료 구조', 'Data structures'), t('네트워크', 'Networks'), t('통계', 'Statistics')]],
    [t('4학기', 'Term 4'), [t('알고리즘', 'Algorithms'), t('기계 학습', 'Machine learning'), t('졸업 작품', 'Final project')]],
  ];
  const at = terms.map(([name, courses], i) => {
    const x = 60 + i * 270;
    b.add('textBox', x, 80, name, { w: 220, h: 34, style: { bold: true, fontSize: 15 } });
    return courses.map((course, j) => b.add('eduLesson', x, 130 + j * 115, course, { w: 220, h: 72, qs: { color: i + 1 } }));
  });
  const need = (a, c) => b.link(a, c, { style: { endArrow: 'arrow' } });
  need(at[0][0], at[1][0]); need(at[1][0], at[2][0]); need(at[2][0], at[3][0]);
  need(at[0][1], at[2][0]); need(at[1][1], at[3][1]); need(at[2][2], at[3][1]); need(at[1][2], at[3][2]);
  b.add('eduStudent', 90, 540, t('신입생', 'New student'));
  b.add('eduCertificate', 870, 520, t('학위', 'Degree'), { w: 220, h: 130 });
  b.add('note', 330, 540, t('화살표는 먼저 들어야 하는 과목(선수 과목)을 가리킵니다.', 'An arrow leads from a course to the ones that need it first.'), { w: 400, h: 100 });
  return doc;
}

// ───────────────────────── maps & logistics

function deliveryRoute(lang) {
  const { doc, b, t } = start('delivery-route', lang, 'organic', ['maps', 'business', 'callouts']);
  b.add('mapRoadH', 40, 380, '', { w: 1040 });
  b.add('mapRoadV', 520, 90, '', { h: 680 });
  b.add('mapPark', 800, 600, t('공원', 'Park'), { w: 220, h: 120 });
  b.add('mapCompass', 1000, 90);
  const depot = b.add('mapBuilding', 90, 240, t('물류 센터', 'Depot'));
  b.add('bizTruck', 200, 440, t('1호 차', 'Truck 1'));
  const stops = [[300, 270], [640, 230], [900, 290], [700, 500], [330, 560]].map(([x, y], i) => b.add('mapPin', x, y, String(i + 1)));
  const route = { route: 'curved', style: { dash: 'dash', lineWidth: 3, endArrow: 'arrow' } };
  b.link(depot, stops[0], route);
  for (let i = 1; i < stops.length; i += 1) b.link(stops[i - 1], stops[i], route);
  b.link(stops.at(-1), depot, route);
  caption(b, 60, 660, 420, t('9:00 출발 · 배송지 5곳 · 13:00 복귀', 'Leaves 9:00 · 5 stops · back by 13:00'), { bold: true, fontSize: 14 }, 30);
  return doc;
}

function campusMap(lang) {
  const { doc, b, t } = start('campus-map', lang, 'facet', ['maps', 'basic', 'callouts']);
  b.add('mapRoadH', 40, 360, '', { w: 1040 });
  b.add('mapRoadV', 560, 90, '', { h: 680 });
  b.add('mapSchool', 120, 150, t('본관', 'Main hall'));
  b.add('mapBuilding', 330, 130, t('도서관', 'Library'));
  b.add('mapBuilding', 760, 140, t('공학관', 'Engineering'));
  b.add('mapBuilding', 960, 140, t('기숙사', 'Dormitory'));
  b.add('mapHospital', 150, 470, t('보건소', 'Health centre'));
  b.add('mapParking', 340, 480, t('주차장', 'Parking'));
  b.add('mapPark', 680, 470, t('중앙 잔디밭', 'Central lawn'), { w: 260, h: 160 });
  b.add('mapBuilding', 990, 480, t('체육관', 'Gym'));
  b.add('mapPin', 620, 290, t('현재 위치', 'You are here'));
  b.add('mapCompass', 1010, 660);
  caption(b, 40, 410, 160, t('정문 →', 'Main gate →'), { bold: true }, 26);
  return doc;
}

// ───────────────────────── charts & dashboards

function salesDashboard(lang) {
  const { doc, b, t } = start('sales-dashboard', lang, 'ion', ['charts', 'basic']);
  [[t('매출\n₩12억', 'Revenue\n₩1.2 B'), 1], [t('주문\n8,430건', 'Orders\n8,430'), 2], [t('신규 고객\n1,120명', 'New customers\n1,120'), 3], [t('반품률\n2.1%', 'Return rate\n2.1%'), 4]]
    .forEach(([text, color], i) => b.add('chartKpi', 40 + i * 265, 90, text, { w: 245, h: 100, qs: { color } }));
  b.add('chartBar', 40, 240, t('월별 매출', 'Revenue by month'), { w: 500, h: 250 });
  b.add('chartPie', 600, 240, t('분류별 비중', 'Share by category'), { w: 250, h: 250 });
  b.add('chartGauge', 890, 270, t('목표 달성 82%', 'Target 82%'), { w: 190, h: 120 });
  b.add('chartLine', 40, 590, t('일별 방문자', 'Visitors per day'), { w: 500, h: 120 });
  b.add('chartTable', 600, 580, t('많이 팔린 상품', 'Best sellers'), { w: 480, h: 110 });
  return doc;
}

function surveyResults(lang) {
  const { doc, b, t } = start('survey-results', lang, 'bubble', ['charts', 'basic', 'callouts']);
  b.add('chartDonut', 60, 110, t('78%\n만족', '78%\nsatisfied'), { w: 260, h: 260 });
  b.add('chartBarH', 400, 100, t('우리를 고른 이유', 'Why did you choose us?'), { w: 620, h: 280 });
  b.add('chartStacked', 60, 500, t('연령대별 응답', 'Answers by age'), { w: 460, h: 180 });
  b.add('chartRadar', 620, 480, t('서비스 점수', 'Service scores'), { w: 220, h: 200 });
  b.add('note', 880, 520, t('응답 1,240명 · 2027년 3월', '1,240 people · March 2027'), { w: 200, h: 140 });
  return doc;
}

// ───────────────────────── more floor plans and timelines

function smallOffice(lang) {
  const { doc, b, t } = start('small-office', lang, 'monochrome', ['floor', 'basic', 'interior']);
  b.add('room', 50, 85, '', { w: 1000, h: 660 });
  b.add('room', 50, 85, '', { w: 330, h: 300, style: { lineWidth: 3 } });
  caption(b, 70, 100, 200, t('회의실', 'Meeting room'), { bold: true }, 24);
  b.add('window', 450, 79, '', { w: 220 });
  b.add('window', 760, 79, '', { w: 220 });
  b.add('tableRect', 110, 180, t('회의 탁자', 'Meeting table'), { w: 210, h: 110 });
  for (const [x, y, angle] of [[130, 135, 0], [195, 135, 0], [260, 135, 0], [130, 297, 180], [195, 297, 180], [260, 297, 180]]) b.add('chair', x, y, '', { w: 40, h: 40, angle });
  b.add('door', 300, 305, '', { w: 75, h: 75 });
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = 470 + col * 180; const y = 140 + row * 190;
      b.add('desk', x, y, t(`자리 ${row * 3 + col + 1}`, `Desk ${row * 3 + col + 1}`), { w: 150, h: 75 });
      b.add('chair', x + 55, y + 80, '', { w: 40, h: 40, angle: 180 });
    }
  }
  b.add('flrCounter', 90, 560, t('안내 데스크', 'Reception'), { w: 220, h: 60 });
  b.add('sofa', 90, 650, t('대기석', 'Waiting area'), { w: 200, h: 80 });
  b.add('tableRound', 700, 580, t('휴게 탁자', 'Break table'), { w: 110, h: 110 });
  b.add('sink', 880, 650);
  b.add('flrFridge', 960, 630);
  b.add('doubleDoor', 470, 675, t('출입문', 'Entrance'), { w: 120, h: 70 });
  b.add('plant', 980, 110);
  return doc;
}

function projectGantt(lang) {
  const { doc, b, t } = start('project-gantt', lang, 'office', ['timeline', 'callouts']);
  const X = 260; const M = 130;
  const months = lang === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] : ['1월', '2월', '3월', '4월', '5월', '6월'];
  months.forEach((name, i) => b.add('tlMonth', X + i * M, 200, name, { w: M }));
  const tasks = [
    [t('요구 사항', 'Requirements'), 0, 1, 1], [t('설계', 'Design'), 0.8, 1.2, 1], [t('프런트엔드', 'Front-end'), 1.8, 2.2, 2], [t('백엔드', 'Back-end'), 1.8, 2.5, 2],
    [t('시험', 'Testing'), 3.8, 1.2, 3], [t('교육', 'Training'), 4.5, 0.8, 4], [t('출시 후 지원', 'Support after launch'), 5.2, 0.8, 5],
  ];
  const bars = tasks.map(([name, from, length, color], i) => {
    const y = 255 + i * 58;
    b.add('textBox', 40, y, name, { w: 205, h: 36, style: { bold: true, align: 'right' } });
    return b.add('intervalBlock', X + from * M, y, '', { w: length * M, h: 36, qs: { color } });
  });
  b.link(bars[0], bars[1]); b.link(bars[1], bars[2]); b.link(bars[3], bars[4]); b.link(bars[4], bars[6]);
  b.add('milestoneMarker', X + 2 * M - 15, 105, t('설계 승인', 'Design signed off'), { h: 85 });
  b.add('milestoneMarker', X + 5.2 * M - 15, 105, t('출시', 'Launch'), { h: 85 });
  b.add('todayMarker', X + 3.3 * M - 12, 240, t('오늘', 'Today'), { h: 420 });
  return doc;
}

// ───────────────────────── the files

/** A builder whose drawing shrinks to fit a smaller page (fitToPage). */
const fitted = (build) => (lang) => fitToPage(build(lang));

/** File name stem → builder (language) → drawing. */
const drawn = {
  'login-flow': loginFlow, 'atm-withdrawal': atmWithdrawal, 'bug-triage': bugTriage, 'hiring-process': hiringProcess, 'incident-response': incidentResponse,
  'purchase-approval': purchaseApproval, 'support-ticket': supportTicket,
  'library-class': libraryClass, 'atm-usecase': atmUsecase, 'login-sequence': loginSequence, 'order-state': orderState, 'checkout-activity': checkoutActivity, 'web-deployment': webDeployment,
  'school-er': schoolEr, 'blog-database': blogDatabase,
  'home-network': homeNetwork, 'cloud-3tier': cloud3Tier, 'branch-vpn': branchVpn, 'cicd-pipeline': cicdPipeline,
  'project-team': projectTeam,
  'study-plan': studyPlan, 'travel-plan': travelPlan, swot,
  'studio-apartment': studioApartment, 'cafe-layout': cafeLayout, classroom,
  'product-roadmap': productRoadmap, 'event-schedule': eventSchedule,
  'sales-funnel': salesFunnel, 'pdca-cycle': pdcaCycle,
  'lamp-circuit': lampCircuit, 'rc-filter': rcFilter, 'transistor-switch': transistorSwitch,
  'password-reset': fitted(passwordReset), 'leave-request': fitted(leaveRequest),
  'login-wireframe': fitted(loginWireframe), 'mobile-shop-app': fitted(mobileShopApp),
  'serverless-api': fitted(serverlessApi), 'zero-trust': fitted(zeroTrust), 'c4-context': fitted(c4Context), 'order-dfd': fitted(orderDfd),
  'sprint-board': fitted(sprintBoard), 'scrum-cycle': fitted(scrumCycle), 'customer-journey': fitted(customerJourney),
  'half-adder': fitted(halfAdder), 'water-treatment': fitted(waterTreatment), 'assembly-line': fitted(assemblyLine),
  'family-tree': fitted(familyTree), 'hospital-admission': fitted(hospitalAdmission), 'course-curriculum': fitted(courseCurriculum),
  'delivery-route': fitted(deliveryRoute), 'campus-map': fitted(campusMap), 'sales-dashboard': fitted(salesDashboard), 'survey-results': fitted(surveyResults),
  'small-office': fitted(smallOffice), 'project-gantt': fitted(projectGantt),
};

/** The samples written as specs (samples-extra.js): built with the helpers above, fitted to the page. */
const specs = extraSamples({ start, caption, mindDoc });
for (const [stem, build] of Object.entries(specs)) drawn[stem] = fitted((lang) => build(stem, lang));

/** File name stem → builder (language) → drawing. */
export const SAMPLE_FILES = {
  'online-shop': (lang) => buildSample(lang),
  'order-flowchart': (lang) => buildTemplate('flowchart', { language: lang }),
  'shop-database': (lang) => buildTemplate('erd', { language: lang }),
  'office-network': (lang) => buildTemplate('network', { language: lang }),
  'company-org': (lang) => buildTemplate('orgChart', { language: lang }),
  ...Object.fromEntries(Object.entries(drawn).map(([stem, build]) => [stem, (lang) => finish(build(lang))])),
};
