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

// ───────────────────────── the files

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
};

/** File name stem → builder (language) → drawing. */
export const SAMPLE_FILES = {
  'online-shop': (lang) => buildSample(lang),
  'order-flowchart': (lang) => buildTemplate('flowchart', { language: lang }),
  'shop-database': (lang) => buildTemplate('erd', { language: lang }),
  'office-network': (lang) => buildTemplate('network', { language: lang }),
  'company-org': (lang) => buildTemplate('orgChart', { language: lang }),
  ...Object.fromEntries(Object.entries(drawn).map(([stem, build]) => [stem, (lang) => finish(build(lang))])),
};
