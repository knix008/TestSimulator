// More sample drawings, written as short specs instead of coordinates: a graph laid out by
// layoutPage, shapes placed on a grid, a task board, a Gantt chart, a sequence, a screen
// wireframe, a dashboard or a mind map. Text is "한국어|English" ("~" breaks the line).
// Their names, icons and descriptions are in sample-names-extra.js. Used by samples.js only.
import { layoutPage } from './layout.js';

const lines = (spec) => spec.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'));

/** The builders, given the helpers of samples.js (start, caption, mindDoc). */
export function extraSamples({ start, caption, mindDoc }) {
  const say = (t, text) => {
    const [ko, en = ko] = String(text ?? '').split('|');
    return t(ko.trim(), en.trim()).replace(/~/g, '\n');
  };
  const dashed = { style: { dash: 'dash', endArrow: 'open' } };
  const plain = { style: { endArrow: 'none' } };
  const LINK = {
    '->': {}, '-->': dashed, '--': plain, '==': { style: { endArrow: 'none', lineWidth: 2 } },
    '-<': { style: { startArrow: 'oneOnly', endArrow: 'zeroMany' } }, '-|': { style: { startArrow: 'oneOnly', endArrow: 'oneOnly' } },
  };
  /** Links "a -> b label" between the shapes by key. */
  const linkAll = (b, t, shapes, spec) => {
    for (const line of lines(spec)) {
      const m = /^(\w+)\s*(-->|->|--|==|-<|-\|)\s*(\w+)\s*(.*)$/.exec(line);
      if (!m) throw new Error(`Bad link: ${line}`);
      const [, a, op, c, text] = m;
      if (!shapes[a] || !shapes[c]) throw new Error(`Unknown shape in link: ${line}`);
      b.link(shapes[a], shapes[c], { ...LINK[op], ...(text ? { text: say(t, text) } : {}) });
    }
  };
  const noteAt = (b, t, page, note) => {
    if (!note) return;
    const shapes = page.shapes.filter((s) => s.type !== 'connector');
    const right = Math.max(...shapes.map((s) => s.x + s.w));
    const bottom = Math.max(...shapes.map((s) => s.y + s.h));
    const at = right + 280 < 1080 ? { x: right + 30, y: 90 } : { x: 40, y: bottom + 20 };
    b.add('note', at.x, at.y, say(t, note), { w: 240, h: 110 });
  };

  /** A graph: "key master[#colour][@WxH] text" per shape, laid out by `kind`. */
  const G = (design, stencils, kind, nodes, edges = '', { spacing = 50, note } = {}) => (stem, lang) => {
    const { doc, page, b, t } = start(stem, lang, design, stencils);
    const shapes = {};
    for (const line of lines(nodes)) {
      const m = /^(\w+)\s+(\w+)(?:#(\d))?(?:@(\d+)x(\d+))?\s*(.*)$/.exec(line);
      if (!m) throw new Error(`Bad shape: ${line}`);
      const [, key, master, color, w, h, text] = m;
      shapes[key] = b.add(master, 0, 0, text ? say(t, text) : '', { ...(color ? { qs: { color: Number(color) } } : {}), ...(w ? { w: Number(w), h: Number(h) } : {}) });
    }
    linkAll(b, t, shapes, edges);
    layoutPage(page, { kind, spacing, ids: Object.values(shapes).map((s) => s.id), origin: { x: 40, y: 80 } });
    grow(Object.values(shapes), { x: 40, y: 80, w: note ? 760 : 1020, h: 680 });
    noteAt(b, t, page, note);
    return doc;
  };

  /** A small layout (a thin left-to-right strip) is enlarged evenly, up to 1.8×, to fill `area`. */
  function grow(list, area) {
    const x1 = Math.min(...list.map((s) => s.x));
    const y1 = Math.min(...list.map((s) => s.y));
    const w = Math.max(...list.map((s) => s.x + s.w)) - x1;
    const h = Math.max(...list.map((s) => s.y + s.h)) - y1;
    const k = Math.min(1.8, area.w / w, area.h / h);
    if (k <= 1.05) return;
    for (const s of list) Object.assign(s, { x: area.x + (s.x - x1) * k, y: area.y + (s.y - y1) * k, w: s.w * k, h: s.h * k });
  }

  /** Placed shapes: "key master x y [WxH] [#colour] [rDEG] text" ("." for no key). */
  const P = (design, stencils, places, edges = '', { note } = {}) => (stem, lang) => {
    const { doc, page, b, t } = start(stem, lang, design, stencils);
    const shapes = {};
    for (const line of lines(places)) {
      const m = /^(\S+)\s+(\w+)\s+(-?\d+)\s+(-?\d+)(?:\s+(\d+)x(\d+))?(?:\s+#(\d))?(?:\s+r(\d+))?\s*(.*)$/.exec(line);
      if (!m) throw new Error(`Bad place: ${line}`);
      const [, key, master, x, y, w, h, color, angle, text] = m;
      const shape = b.add(master, Number(x), Number(y), text ? say(t, text) : '', {
        ...(w ? { w: Number(w), h: Number(h) } : {}), ...(color ? { qs: { color: Number(color) } } : {}), ...(angle ? { angle: Number(angle) } : {}),
      });
      if (key !== '.') shapes[key] = shape;
    }
    linkAll(b, t, shapes, edges);
    noteAt(b, t, page, note);
    return doc;
  };

  /** A task board: "# column" lines, then "master text" cards under them. */
  const Board = (design, spec, { caption: head } = {}) => (stem, lang) => {
    const { doc, b, t } = start(stem, lang, design, ['agile', 'callouts']);
    if (head) caption(b, 640, 30, 440, say(t, head), { align: 'right', bold: true, fontSize: 14 }, 28);
    const columns = [];
    for (const line of lines(spec)) {
      if (line.startsWith('#')) columns.push({ name: line.slice(1).trim(), cards: [] });
      else { const [master, ...rest] = line.split(/\s+/); columns.at(-1).cards.push([master, rest.join(' ')]); }
    }
    const width = Math.min(250, Math.floor((1040 - (columns.length - 1) * 20) / columns.length));
    columns.forEach((column, i) => {
      const x = 40 + i * (width + 20);
      b.add('agColumn', x, 90, say(t, column.name), { w: width, h: 640, qs: { color: (i % 6) + 1, variant: 'subtle' } });
      column.cards.forEach(([master, text], j) => b.add(master, x + 12, 150 + j * 112, say(t, text), { w: width - 24, h: 92 }));
    });
    return doc;
  };

  /** A Gantt chart: "months" as "1월,2월|Jan,Feb", tasks "from length colour text", milestones "! at text". */
  const Gantt = (design, months, spec) => (stem, lang) => {
    const { doc, b, t } = start(stem, lang, design, ['timeline', 'callouts']);
    const names = say(t, months).split(',');
    const X = 250; const M = Math.min(140, Math.floor(800 / names.length));
    names.forEach((name, i) => b.add('tlMonth', X + i * M, 200, name.trim(), { w: M }));
    let row = 0;
    const bars = [];
    for (const line of lines(spec)) {
      if (line.startsWith('!')) {
        const [, at, text] = /^!\s*([\d.]+)\s+(.*)$/.exec(line);
        b.add('milestoneMarker', X + Number(at) * M - 15, 105, say(t, text), { h: 85 });
        continue;
      }
      if (line.startsWith('today')) { b.add('todayMarker', X + Number(line.split(/\s+/)[1]) * M - 12, 240, t('오늘', 'Today'), { h: 60 + 52 * 9 }); continue; }
      const [, from, length, color, text] = /^([\d.]+)\s+([\d.]+)\s+(\d)\s+(.*)$/.exec(line);
      const y = 255 + row * 52;
      b.add('textBox', 30, y, say(t, text), { w: 205, h: 34, style: { bold: true, align: 'right' } });
      bars.push(b.add('intervalBlock', X + Number(from) * M, y, '', { w: Number(length) * M, h: 34, qs: { color: Number(color) } }));
      row += 1;
    }
    for (let i = 1; i < bars.length; i += 2) b.link(bars[i - 1], bars[i]);
    return doc;
  };

  /** A sequence: participants "key text; key text", messages "a > b text" (call) or "a >> b text" (reply). */
  const Seq = (design, parts, spec) => (stem, lang) => {
    const { doc, b, t } = start(stem, lang, design, ['uml', 'callouts']);
    const who = parts.split(';').map((p) => p.trim()).filter(Boolean).map((p) => { const [key, ...rest] = p.split(/\s+/); return [key, rest.join(' ')]; });
    const msgs = lines(spec);
    const step = Math.min(0.11, 0.82 / msgs.length);
    const levels = msgs.map((_, i) => [0.5, 0.1 + i * step]);
    const gap = Math.floor(1000 / who.length);
    const at = Object.fromEntries(who.map(([key, text], i) => [key, b.add('umlLifeline', 40 + i * gap, 80, say(t, text), { w: Math.min(160, gap - 20), h: 680, points: levels })]));
    msgs.forEach((line, i) => {
      const [, a, op, c, text] = /^(\w+)\s*(>>|>)\s*(\w+)\s*(.*)$/.exec(line);
      b.link(at[a], at[c], { route: 'straight', text: `${i + 1}. ${say(t, text)}`, fromPt: i, toPt: i, style: op === '>>' ? { dash: 'dash', endArrow: 'open' } : { endArrow: 'arrow' } });
    });
    return doc;
  };

  /** A screen: a browser or phone frame with widgets stacked in columns ("||" starts the next column). */
  const Screen = (design, frame, spec, { title: url = '' } = {}) => (stem, lang) => {
    const { doc, b, t } = start(stem, lang, design, ['wireframe', 'basic', 'callouts']);
    const phone = frame === 'phone';
    const box = phone ? { x: 380, y: 80, w: 330, h: 660 } : { x: 60, y: 80, w: 1000, h: 680 };
    b.add(phone ? 'uiPhone' : 'uiBrowser', box.x, box.y, phone ? '' : url, { w: box.w, h: box.h });
    const left = phone ? box.x + 30 : box.x + 30;
    const top = phone ? box.y + 80 : box.y + 60;
    const colW = phone ? box.w - 60 : 450;
    let x = left; let y = top;
    for (const line of lines(spec)) {
      if (line === '||') { x += colW + 40; y = top; continue; }
      const m = /^(\w+)(?:@(\d+)x(\d+))?(?:#(\d))?\s*(.*)$/.exec(line);
      const [, master, w, h, color, text] = m;
      const shape = b.add(master, x, y, text ? say(t, text) : '', { ...(w ? { w: Math.min(Number(w), colW), h: Number(h) } : {}), ...(color ? { qs: { color: Number(color) } } : {}) });
      y += shape.h + (/^(uiImage|uiList)$/.test(master) ? 40 : 14);
    }
    return doc;
  };

  /** A dashboard: "master[@WxH] text" per chart, in rows. */
  const Dash = (design, spec) => (stem, lang) => {
    const { doc, b, t } = start(stem, lang, design, ['charts', 'basic']);
    let x = 40; let y = 90; let rowH = 0;
    for (const line of lines(spec)) {
      if (line === '--') { x = 40; y += rowH + 70; rowH = 0; continue; }
      const [, master, w, h, color, text] = /^(\w+)(?:@(\d+)x(\d+))?(?:#(\d))?\s*(.*)$/.exec(line);
      const shape = b.add(master, x, y, say(t, text), { ...(w ? { w: Number(w), h: Number(h) } : {}), ...(color ? { qs: { color: Number(color) } } : {}) });
      x += shape.w + 40;
      rowH = Math.max(rowH, shape.h);
    }
    return doc;
  };

  /** A mind map: "topic: sub, sub" lines around the centre. */
  const Mind = (design, center, spec) => (stem, lang) => {
    const t = (text) => say((ko, en) => (lang === 'en' ? en : ko), text);
    return mindDoc(stem, lang, design, t(center), lines(spec).map((line) => {
      const [topic, subs] = line.split(':');
      return [t(topic), subs.split(',').map((sub) => t(sub))];
    }));
  };

  return {
    // ───────── flowcharts
    'coffee-order': G('linear', ['flowchart', 'callouts'], 'flowTB', `
      s terminator#6 주문 시작|Start
      m data 메뉴 선택|Choose a drink
      z decision#4@150x90 사이즈~추가?|Size up?
      up process 사이즈 변경|Change size
      p process 결제|Pay
      c process 음료 제조|Make the drink
      e terminator#6 픽업|Pick up`, `
      s -> m
      m -> z
      z -> up 예|Yes
      z -> p 아니요|No
      up -> p
      p -> c
      c -> e`, { note: '주문이 몰리면 번호표 순서로 만듭니다.|At busy times, drinks are made in ticket order.' }),
    'refund-process': G('facet', ['flowchart', 'callouts'], 'flowTB', `
      s terminator#6 환불 요청|Refund asked
      r document 주문 확인|Check the order
      d decision#4@150x90 7일~이내?|Within~7 days?
      ok decision#4@150x90 상품~이상 없음?|Item OK?
      n display 환불 불가 안내|Explain: no refund
      pay process 카드 취소|Cancel the charge
      part process 부분 환불|Partial refund
      e terminator#6 완료|Done`, `
      s -> r
      r -> d
      d -> ok 예|Yes
      d -> n 아니요|No
      ok -> pay 예|Yes
      ok -> part 아니요|No
      pay -> e
      part -> e
      n -> e`),

    // ───────── BPMN
    'loan-application': G('office', ['bpmn'], 'flowLR', `
      s bpmnStart 신청 접수|Application in
      a bpmnUserTask 서류 확인|Check papers
      c bpmnServiceTask 신용 조회|Credit check
      g gatewayExclusive
      ok bpmnTask 대출 승인|Approve loan
      no bpmnSendTask 거절 통보|Send refusal
      pay bpmnServiceTask 대출금 입금|Pay out
      e1 bpmnEnd 완료|Done
      e2 bpmnEnd 종료|Closed`, `
      s -> a
      a -> c
      c -> g
      g -> ok 적격|Eligible
      g -> no 부적격|Not eligible
      ok -> pay
      pay -> e1
      no -> e2`, { spacing: 60 }),
    'employee-onboarding': G('whisp', ['bpmn'], 'flowLR', `
      s bpmnStart 입사 확정|Hire confirmed
      f gatewayParallel
      pc bpmnServiceTask 노트북 준비|Prepare laptop
      acc bpmnServiceTask 계정 발급|Create accounts
      desk bpmnManualTask 자리 배정|Assign a desk
      j gatewayParallel
      w bpmnUserTask 첫날 안내|First-day welcome
      m bpmnTask 멘토 지정|Assign a mentor
      e bpmnEnd 적응 완료|Settled in`, `
      s -> f
      f -> pc
      f -> acc
      f -> desk
      pc -> j
      acc -> j
      desk -> j
      j -> w
      w -> m
      m -> e`, { spacing: 55 }),
    'order-fulfilment': G('slice', ['bpmn'], 'flowLR', `
      s bpmnMessage 주문 도착|Order arrives
      pick bpmnManualTask 상품 집품|Pick items
      g gatewayExclusive
      pack bpmnManualTask 포장|Pack
      back bpmnSendTask 품절 안내|Tell sold out
      label bpmnServiceTask 송장 출력|Print label
      ship bpmnTask 택배 인계|Hand to courier
      e bpmnEnd 출고 완료|Shipped
      e2 bpmnEnd 주문 취소|Cancelled`, `
      s -> pick
      pick -> g
      g -> pack 재고 있음|In stock
      g -> back 품절|Sold out
      pack -> label
      label -> ship
      ship -> e
      back -> e2`, { spacing: 55 }),
    'invoice-payment': G('integral', ['bpmn'], 'flowLR', `
      s bpmnMessage 송장 수신|Invoice received
      m bpmnServiceTask 주문서 대조|Match the order
      g gatewayExclusive
      a bpmnUserTask 재무 승인|Finance approval
      q bpmnSendTask 공급사 문의|Ask the supplier
      t bpmnTimer 지급일 대기|Wait for pay day
      p bpmnServiceTask 이체|Transfer
      e bpmnEnd 지급 완료|Paid`, `
      s -> m
      m -> g
      g -> a 일치|Matches
      g -> q 불일치|Mismatch
      q --> m
      a -> t
      t -> p
      p -> e`, { spacing: 55 }),
    'insurance-claim': G('ion', ['bpmn'], 'flowLR', `
      s bpmnStart 사고 접수|Claim filed
      d bpmnUserTask 서류 제출|Send documents
      r bpmnUserTask 손해 사정|Assess the damage
      g gatewayExclusive
      pay bpmnServiceTask 보험금 지급|Pay the claim
      no bpmnSendTask 부지급 안내|Explain refusal
      appeal bpmnTask 이의 신청|Appeal
      e bpmnEnd 종결|Closed`, `
      s -> d
      d -> r
      r -> g
      g -> pay 보상|Covered
      g -> no 면책|Not covered
      no -> appeal
      appeal --> r
      pay -> e`, { spacing: 55 }),
    'expense-report': G('retrospect', ['bpmn'], 'flowLR', `
      s bpmnStart 출장 종료|Trip ends
      up bpmnUserTask 영수증 등록|Upload receipts
      lead bpmnUserTask 팀장 승인|Lead approves
      g gatewayExclusive
      fin bpmnUserTask 재무 검토|Finance review
      fix bpmnTask 보완 요청|Ask for changes
      pay bpmnServiceTask 급여와 함께 지급|Paid with salary
      e bpmnEnd 정산 완료|Settled`, `
      s -> up
      up -> lead
      lead -> g
      g -> fin 승인|Approved
      g -> fix 반려|Returned
      fix --> up
      fin -> pay
      pay -> e`, { spacing: 55 }),
    'access-request': G('linear', ['bpmn'], 'flowLR', `
      s bpmnStart 권한 필요|Access needed
      f bpmnUserTask 신청서 작성|Fill in request
      m bpmnUserTask 관리자 승인|Manager approves
      sec bpmnUserTask 보안팀 검토|Security review
      g gatewayExclusive
      grant bpmnServiceTask 권한 부여|Grant access
      deny bpmnSendTask 거절 통보|Send refusal
      tm bpmnTimer 90일 후 만료|Expires in 90 days
      e bpmnEnd 완료|Done`, `
      s -> f
      f -> m
      m -> sec
      sec -> g
      g -> grant 허용|Allowed
      g -> deny 불가|Denied
      grant -> tm
      tm -> e
      deny -> e`, { spacing: 55 }),

    // ───────── UML
    'shop-classes': G('integral', ['uml'], 'treeTB', `
      user umlAbstract@220x110 «abstract» User~---~- id: int~- email: String
      cust umlClass@220x130 Customer~---~- points: int~---~+ order(c: Cart)
      admin umlClass@220x110 Admin~---~- role: String~---~+ ban(u: User)
      cart umlClass@220x130 Cart~---~- items: List~---~+ total(): Money
      prod umlClass@220x110 Product~---~- name: String~- price: Money`, `
      cust -> user
      admin -> user
      cust -- cart 1 — 1
      cart -- prod * — *`, { spacing: 60 }),
    'vending-states': G('bubble', ['uml'], 'flowLR', `
      i umlInitial
      idle umlState@150x70 대기|Idle
      coin umlState@150x70 동전 투입됨|Has coins
      pick umlState@150x70 상품 선택|Selecting
      give umlState@150x70 배출 중|Dispensing
      change umlState@150x70 거스름돈|Giving change
      f umlFinal`, `
      i -> idle
      idle -> coin 동전|coin
      coin -> coin 동전 추가|more coins
      coin -> pick 버튼|button
      pick -> give 금액 충분|enough
      pick -> coin 부족|too little
      give -> change
      change -> idle
      idle -> f 전원 끔|power off`, { spacing: 60 }),
    'booking-usecases': P('office', ['uml', 'containers'], `
      . groupFrame 200 80 640x660 호텔 예약 시스템|Hotel booking system
      g umlActor 80 330 손님|Guest
      s umlActor 930 200 프런트 직원|Front desk
      p umlActor 930 520 결제 시스템|Payment system
      u1 umlUseCase 240 130 170x74 객실 검색|Search rooms
      u2 umlUseCase 240 260 170x74 예약하기|Book a room
      u3 umlUseCase 240 390 170x74 예약 취소|Cancel booking
      u4 umlUseCase 240 520 170x74 후기 작성|Write a review
      u5 umlUseCase 620 200 170x74 체크인|Check in
      u6 umlUseCase 620 390 170x74 결제 처리|Take payment`, `
      g -- u1
      g -- u2
      g -- u3
      g -- u4
      u2 --> u6 «include»
      s -- u5
      p -- u6`),
    'payment-sequence': Seq('linear', 'app 앱|App; api 주문 API|Order API; pg 결제 대행|Payment gateway; bank 카드사|Card issuer', `
      app > api 결제 요청|Pay request
      api > pg 승인 요청|Authorise
      pg > bank 한도 확인|Check limit
      bank >> pg 승인|Approved
      pg >> api 승인 번호|Auth code
      api >> app 결제 완료|Paid
      api > pg 매입 요청|Capture`),

    // ───────── databases
    'hospital-db': G('sequence', ['erd'], 'flowLR', `
      pat entity@200x130 환자~---~PK 환자ID~이름~생년월일|Patient~---~PK PatientID~Name~Birth date
      vis entity@200x150 진료~---~PK 진료ID~FK 환자ID~FK 의사ID~날짜|Visit~---~PK VisitID~FK PatientID~FK DoctorID~Date
      doc entity@200x130 의사~---~PK 의사ID~이름~진료과|Doctor~---~PK DoctorID~Name~Department
      rx entity@200x130 처방~---~PK 처방ID~FK 진료ID~약품|Prescription~---~PK RxID~FK VisitID~Drug`, `
      pat -< vis
      doc -< vis
      vis -< rx`, { spacing: 70 }),
    'library-db': G('office', ['erd'], 'flowLR', `
      mem entity@200x130 회원~---~PK 회원ID~이름~연락처|Member~---~PK MemberID~Name~Phone
      loan entity@200x150 대출~---~PK 대출ID~FK 회원ID~FK 도서ID~반납일|Loan~---~PK LoanID~FK MemberID~FK BookID~Due
      book entity@200x150 도서~---~PK 도서ID~FK 저자ID~제목~ISBN|Book~---~PK BookID~FK AuthorID~Title~ISBN
      auth entity@200x110 저자~---~PK 저자ID~이름|Author~---~PK AuthorID~Name`, `
      mem -< loan
      book -< loan
      auth -< book`, { spacing: 70 }),
    'hotel-db': G('ion', ['erd'], 'flowLR', `
      guest entity@200x130 손님~---~PK 손님ID~이름~이메일|Guest~---~PK GuestID~Name~Email
      res entity@200x170 예약~---~PK 예약ID~FK 손님ID~FK 객실ID~체크인~체크아웃|Booking~---~PK BookingID~FK GuestID~FK RoomID~Check-in~Check-out
      room entity@200x130 객실~---~PK 객실ID~FK 유형ID~층|Room~---~PK RoomID~FK TypeID~Floor
      type entity@200x110 객실 유형~---~PK 유형ID~요금|Room type~---~PK TypeID~Rate
      pay entity@200x130 결제~---~PK 결제ID~FK 예약ID~금액|Payment~---~PK PaymentID~FK BookingID~Amount`, `
      guest -< res
      room -< res
      type -< room
      res -< pay`, { spacing: 60 }),
    'grades-db': G('facet', ['erd'], 'flowLR', `
      st entity@200x130 학생~---~PK 학번~이름~학년|Student~---~PK StudentNo~Name~Year
      en entity@200x150 수강~---~PK 수강ID~FK 학번~FK 과목ID~성적|Enrolment~---~PK EnrolID~FK StudentNo~FK SubjectID~Grade
      sub entity@200x130 과목~---~PK 과목ID~FK 교사ID~과목명|Subject~---~PK SubjectID~FK TeacherID~Name
      te entity@200x110 교사~---~PK 교사ID~이름|Teacher~---~PK TeacherID~Name`, `
      st -< en
      sub -< en
      te -< sub`, { spacing: 70 }),
    'inventory-db': G('slice', ['erd'], 'flowLR', `
      sup entity@200x110 공급사~---~PK 공급사ID~회사명|Supplier~---~PK SupplierID~Company
      item entity@200x150 품목~---~PK 품목ID~FK 공급사ID~품명~단가|Item~---~PK ItemID~FK SupplierID~Name~Unit price
      stock entity@200x150 재고~---~PK,FK 품목ID~PK,FK 창고ID~수량|Stock~---~PK,FK ItemID~PK,FK WarehouseID~Quantity
      wh entity@200x110 창고~---~PK 창고ID~위치|Warehouse~---~PK WarehouseID~Location
      mv entity@200x150 입출고~---~PK 이동ID~FK 품목ID~수량~일시|Movement~---~PK MoveID~FK ItemID~Quantity~Time`, `
      sup -< item
      item -< stock
      wh -< stock
      item -< mv`, { spacing: 60 }),
    'hr-db': G('monochrome', ['erd'], 'flowLR', `
      dept entity@200x110 부서~---~PK 부서ID~부서명|Department~---~PK DeptID~Name
      emp entity@200x170 직원~---~PK 사번~FK 부서ID~FK 직급ID~이름~입사일|Employee~---~PK EmpNo~FK DeptID~FK GradeID~Name~Joined
      grade entity@200x110 직급~---~PK 직급ID~직급명|Grade~---~PK GradeID~Title
      pay entity@200x150 급여~---~PK 급여ID~FK 사번~월~금액|Payslip~---~PK PayID~FK EmpNo~Month~Amount
      leave entity@200x130 휴가~---~PK 휴가ID~FK 사번~기간|Leave~---~PK LeaveID~FK EmpNo~Dates`, `
      dept -< emp
      grade -< emp
      emp -< pay
      emp -< leave`, { spacing: 60 }),
    'movie-db': G('midnight', ['erd'], 'flowLR', `
      cust entity@200x130 고객~---~PK 고객ID~이름~등급|Customer~---~PK CustomerID~Name~Tier
      rent entity@200x150 대여~---~PK 대여ID~FK 고객ID~FK 영화ID~반납일|Rental~---~PK RentalID~FK CustomerID~FK MovieID~Due
      mov entity@200x150 영화~---~PK 영화ID~FK 장르ID~제목~연도|Movie~---~PK MovieID~FK GenreID~Title~Year
      gen entity@200x110 장르~---~PK 장르ID~장르명|Genre~---~PK GenreID~Name`, `
      cust -< rent
      mov -< rent
      gen -< mov`, { spacing: 70 }),

    // ───────── network & IT
    'school-network': G('facet', ['network'], 'treeTB', `
      net internet 인터넷|Internet
      fw firewall 방화벽|Firewall
      core switch 코어 스위치|Core switch
      lab switch 컴퓨터실|Computer lab
      office switch 교무실|Staff room
      ap wirelessAp 교실 와이파이|Classroom Wi-Fi
      pc1 desktop 학생 PC|Student PC
      pc2 desktop 학생 PC|Student PC
      t laptop 교사 노트북|Teacher laptop
      pr printer 프린터|Printer
      tab tablet 태블릿|Tablet
      prj netProjector 프로젝터|Projector`, `
      net -- fw
      fw -- core
      core -- lab
      core -- office
      core -- ap
      lab -- pc1
      lab -- pc2
      office -- t
      office -- pr
      ap -- tab
      ap -- prj`, { spacing: 45 }),
    'cafe-wifi': G('bubble', ['network'], 'treeTB', `
      net internet 인터넷|Internet
      mo netModem 모뎀|Modem
      r router 공유기|Router
      staff wirelessAp 직원용 와이파이|Staff Wi-Fi
      guest wirelessAp 손님용 와이파이|Guest Wi-Fi
      pos desktop 계산대 POS|Till
      kds monitor 주문 화면|Order screen
      ph phone 손님 휴대폰|Guest phones
      lt laptop 손님 노트북|Guest laptops`, `
      net -- mo
      mo -- r
      r -- staff
      r -- guest
      staff -- pos
      staff -- kds
      guest -- ph
      guest -- lt`, { spacing: 50, note: '손님 망은 직원 망과 분리해 계산대에 접근할 수 없습니다.|The guest network is kept apart, so guests cannot reach the till.' }),
    'data-center': G('blueprint', ['network'], 'treeTB', `
      wan netWan 외부 회선|Uplinks
      fw firewall 방화벽 이중화|Firewall pair
      lb netLoadBalancer 부하 분산기|Load balancer
      sp switch 스파인 스위치|Spine switch
      r1 rack 랙 A|Rack A
      r2 rack 랙 B|Rack B
      r3 rack 랙 C|Rack C
      web netWebServer 웹 서버|Web servers
      app netAppServer 앱 서버|App servers
      db netDbCluster DB 클러스터|DB cluster
      st netNasRack 스토리지|Storage
      ups netUps 무정전 전원|UPS`, `
      wan -- fw
      fw -- lb
      lb -- sp
      sp -- r1
      sp -- r2
      sp -- r3
      r1 -- web
      r2 -- app
      r3 -- db
      r3 -- st
      r1 -- ups`, { spacing: 45 }),
    'factory-network': G('integral', ['network'], 'treeTB', `
      erp server ERP 서버|ERP server
      fw firewall 공장 방화벽|Plant firewall
      sw switch 산업용 스위치|Industrial switch
      scada desktop 감시 PC|SCADA PC
      gw netGateway IoT 게이트웨이|IoT gateway
      s1 netSensor 온도 센서|Temperature sensor
      s2 netSensor 진동 센서|Vibration sensor
      cam netCamera 검사 카메라|Inspection camera
      hmi tablet 현장 태블릿|Floor tablet`, `
      erp -- fw
      fw -- sw
      sw -- scada
      sw -- gw
      sw -- cam
      sw -- hmi
      gw -- s1
      gw -- s2`, { spacing: 50 }),
    'hospital-network': G('linear', ['network'], 'treeTB', `
      net internet 인터넷|Internet
      fw firewall 방화벽|Firewall
      core switch 코어 스위치|Core switch
      emr dbServer 전자 의무기록|Medical records
      pacs storage 영상 저장(PACS)|Image archive (PACS)
      ward switch 병동 스위치|Ward switch
      ns desktop 간호사실 PC|Nurse station
      mon monitor 환자 모니터|Patient monitor
      cam netCamera 출입 카메라|Door camera
      voip netVoip 내선 전화|Desk phones`, `
      net -- fw
      fw -- core
      core -- emr
      core -- pacs
      core -- ward
      ward -- ns
      ward -- mon
      ward -- cam
      ward -- voip`, { spacing: 48 }),

    // ───────── cloud & security
    'static-website': G('radiance', ['cloud', 'network'], 'flowLR', `
      u user 방문자|Visitors
      dns cldDns DNS
      cdn cldCdn CDN
      b cldBucket 정적 파일|Static files
      fn cldFunction 문의 양식 함수|Contact-form function
      mail cldNotify 메일 발송|Send e-mail`, `
      u -> dns
      dns -> cdn
      cdn -> b
      cdn -> fn /api
      fn -> mail`, { spacing: 70, note: '서버 없이 파일과 함수 하나로 운영합니다.|Runs with files and one function, no server.' }),
    'iot-pipeline': G('midnight', ['cloud', 'network'], 'flowLR', `
      s netSensor 센서|Sensors
      gw netGateway 게이트웨이|Gateway
      q cldStream 데이터 스트림|Data stream
      fn cldFunction 정제 함수|Clean-up function
      db cldDatabase 시계열 DB|Time-series DB
      an cldAnalytics 분석|Analytics
      al cldNotify 경보|Alerts`, `
      s -> gw
      gw -> q
      q -> fn
      fn -> db
      db -> an
      fn -> al 임계값 초과|Over limit`, { spacing: 65 }),
    'ml-platform': G('ion', ['cloud'], 'flowLR', `
      raw cldBucket 원본 데이터|Raw data
      prep cldCompute 전처리|Prepare
      train cldAi 모델 학습|Train model
      reg cldBlock 모델 저장소|Model registry
      api cldApi 추론 API|Inference API
      mon cldMonitoring 성능 감시|Monitoring`, `
      raw -> prep
      prep -> train
      train -> reg
      reg -> api 배포|deploy
      api -> mon
      mon --> train 재학습|retrain`, { spacing: 70 }),
    'backup-dr': G('blueprint', ['cloud'], 'flowLR', `
      app cldCompute 운영 서버|Live servers
      db cldDatabase 운영 DB|Live DB
      bk cldBackup 매일 백업|Daily backup
      b2 cldBucket 다른 리전 저장소|Store in another region
      dr cldRegion@220x150 재해 복구 리전|Recovery region
      mon cldMonitoring 상태 확인|Health checks`, `
      app -> db
      db -> bk
      bk -> b2 복제|copy
      b2 -> dr 복원|restore
      mon --> app`, { spacing: 70, note: '복구 목표: 4시간 안에 서비스 재개.|Goal: back in service within 4 hours.' }),
    'k8s-cluster': G('slice', ['cloud'], 'treeTB', `
      lb netLoadBalancer 부하 분산기|Load balancer
      k cldCluster 쿠버네티스 클러스터|Kubernetes cluster
      n1 cldContainer 웹 파드 ×3|Web pods ×3
      n2 cldContainer API 파드 ×4|API pods ×4
      n3 cldContainer 작업 파드 ×2|Worker pods ×2
      as cldAutoscale 자동 확장|Autoscaler
      sec cldSecret 비밀 값|Secrets
      log cldLogs 로그|Logs`, `
      lb -> k
      k -> n1
      k -> n2
      k -> n3
      k --> as
      k --> sec
      k --> log`, { spacing: 55 }),
    'event-driven': G('retrospect', ['cloud'], 'flowLR', `
      o cldApi 주문 API|Order API
      bus cldEventBus 이벤트 버스|Event bus
      pay cldFunction 결제|Payment
      inv cldFunction 재고|Inventory
      mail cldNotify 알림|Notifications
      dw cldAnalytics 분석|Analytics`, `
      o -> bus 주문 생성됨|OrderCreated
      bus -> pay
      bus -> inv
      bus -> mail
      bus -> dw`, { spacing: 70 }),
    'secure-login': G('chalkboard', ['security', 'cloud'], 'flowLR', `
      u user 사용자|User
      pw secPassword 비밀번호|Password
      otp secToken 일회용 코드|One-time code
      idp secShieldCheck 인증 서버|Identity provider
      tk secKey 토큰 발급|Issue token
      app cldApi 서비스|Service
      au secAudit 로그인 기록|Sign-in log`, `
      u -> pw
      pw -> otp
      otp -> idp
      idp -> tk
      tk -> app
      idp --> au`, { spacing: 65 }),
    'vpc-subnets': P('blueprint', ['cloud', 'network', 'containers'], `
      . cldVpc 60 90 1000x640 VPC 10.0.0.0/16
      . groupFrame 100 160 440x520 공개 서브넷|Public subnet
      . groupFrame 580 160 440x520 사설 서브넷|Private subnet
      lb netLoadBalancer 260 230 부하 분산기|Load balancer
      nat netGateway 260 470 NAT 게이트웨이|NAT gateway
      app cldCompute 760 230 앱 서버|App servers
      db cldDatabase 765 470 데이터베이스|Database`, `
      lb -> app
      app -> db
      app --> nat 외부 업데이트|outbound updates`),

    // ───────── software architecture
    'c4-containers': G('office', ['c4'], 'flowTB', `
      u c4Person@170x130 고객~[사람]|Customer~[Person]
      web c4WebApp@200x110 웹 앱~[React]|Web app~[React]
      mob c4Mobile@170x120 모바일 앱~[Kotlin]|Mobile app~[Kotlin]
      api c4Container@200x110 API~[Node.js]|API~[Node.js]
      db c4Database@170x110 데이터베이스~[PostgreSQL]|Database~[PostgreSQL]
      q c4Queue@200x90 메시지 큐|Message queue
      w c4Container@200x110 작업 처리기~[Go]|Worker~[Go]`, `
      u -> web 사용|uses
      u -> mob 사용|uses
      web -> api JSON/HTTPS
      mob -> api JSON/HTTPS
      api -> db SQL
      api -> q
      q -> w`, { spacing: 55 }),
    'microservices': G('ion', ['c4', 'cloud'], 'flowTB', `
      gw cldApi API 게이트웨이|API gateway
      us c4Component@180x90 회원 서비스|User service
      os c4Component@180x90 주문 서비스|Order service
      ps c4Component@180x90 결제 서비스|Payment service
      ss c4Component@180x90 배송 서비스|Shipping service
      d1 c4Database@140x90 회원 DB|User DB
      d2 c4Database@140x90 주문 DB|Order DB
      bus cldEventBus 이벤트 버스|Event bus`, `
      gw -> us
      gw -> os
      os -> ps
      os -> bus
      bus -> ss
      us -> d1
      os -> d2`, { spacing: 55 }),
    'event-sourcing': G('sequence', ['c4', 'cloud'], 'flowLR', `
      cmd c4Component@170x90 명령 처리|Command handler
      es c4Queue@200x90 이벤트 저장소|Event store
      proj c4Component@170x90 프로젝션|Projections
      read c4Database@150x100 조회용 DB|Read model
      q c4WebApp@170x100 조회 화면|Query screen`, `
      cmd -> es 이벤트 추가|append
      es -> proj 구독|subscribe
      proj -> read 갱신|update
      q -> read 조회|query`, { spacing: 60 }),
    'mvc-pattern': G('linear', ['c4', 'basic'], 'circular', `
      v roundRect#1@170x90 뷰~(화면)|View~(screen)
      c roundRect#2@170x90 컨트롤러~(입력 처리)|Controller~(input)
      m roundRect#3@170x90 모델~(데이터·규칙)|Model~(data, rules)
      u c4Person@150x120 사용자|User`, `
      u -> c 입력|input
      c -> m 변경|update
      m -> v 알림|notify
      v -> u 표시|show`, { spacing: 80 }),
    'mobile-backend': G('bubble', ['c4', 'cloud'], 'flowTB', `
      app c4Mobile@170x120 모바일 앱|Mobile app
      auth cldIdentity 로그인|Sign-in
      api cldApi API
      fn cldFunction 비즈니스 로직|Business logic
      db cldDatabase 문서 DB|Document DB
      st cldBucket 사진 저장소|Photo storage
      push cldNotify 푸시 알림|Push notifications`, `
      app -> auth
      app -> api
      api -> fn
      fn -> db
      fn -> st
      fn -> push`, { spacing: 60 }),
    'library-dfd': G('facet', ['dfd'], 'flowLR', `
      mem dfdExternal 회원|Member
      p1 dfdProcess 1.0~대출|1.0~Lend
      p2 dfdProcess 2.0~반납|2.0~Return
      p3 dfdProcess 3.0~연체 알림|3.0~Overdue notice
      d1 dfdStore D1 도서|D1 Books
      d2 dfdStore D2 대출|D2 Loans`, `
      mem -> p1 대출 신청|request
      p1 -> d2 대출 기록|loan record
      d1 -> p1 도서 상태|book status
      mem -> p2 반납 도서|returned book
      p2 -> d2 반납 처리|close loan
      d2 -> p3 기한 지난 대출|overdue loans
      p3 -> mem 알림|notice`, { spacing: 60 }),
    'payroll-dfd': G('monochrome', ['dfd'], 'flowLR', `
      hr dfdExternal 인사팀|HR
      p1 dfdProcess 1.0~근태 집계|1.0~Total hours
      p2 dfdProcess 2.0~급여 계산|2.0~Work out pay
      p3 dfdProcess 3.0~이체|3.0~Transfer
      d1 dfdStore D1 근태|D1 Time sheets
      d2 dfdStore D2 급여 대장|D2 Payroll
      bank dfdExternal 은행|Bank
      emp dfdExternal 직원|Employee`, `
      hr -> p1 근무 기록|hours
      p1 -> d1
      d1 -> p2
      p2 -> d2
      d2 -> p3
      p3 -> bank 이체 파일|payment file
      p3 -> emp 급여 명세서|payslip`, { spacing: 55 }),
    'chat-system': G('whisp', ['c4', 'cloud'], 'flowLR', `
      a c4Person@140x110 사용자 A|User A
      ws cldApi 웹소켓 서버|WebSocket server
      q c4Queue@180x80 메시지 큐|Message queue
      st c4Database@150x100 메시지 저장|Message store
      push cldNotify 푸시|Push
      b c4Person@140x110 사용자 B|User B`, `
      a -> ws 메시지|message
      ws -> q
      q -> st
      q -> push 오프라인이면|if offline
      push -> b
      ws -> b 온라인이면|if online`, { spacing: 60 }),

    // ───────── wireframes
    'signup-form': Screen('monochrome', 'browser', `
      textBox@450x40 회원 가입|Create an account
      uiInput@450x36 이름|Name
      uiInput@450x36 이메일|E-mail
      uiInput@450x36 비밀번호|Password
      uiInput@450x36 비밀번호 확인|Repeat password
      uiCheckbox@300x26 약관에 동의|I accept the terms
      uiButton@450x40#1 가입하기|Sign up
      ||
      uiImage@400x300 안내 그림|Illustration
      uiCard@400x140 가입하면 첫 주문 10% 할인|10% off your first order`, { title: 'https://shop.example.com/signup' }),
    'admin-dashboard': Screen('linear', 'browser', `
      uiNavbar@450x44 관리자|Admin
      uiSidebar@200x420 메뉴|Menu
      ||
      uiTabs@450x170 오늘 · 이번 주 · 이번 달|Today · This week · This month
      uiTable@450x200 최근 주문|Latest orders
      uiPagination@300x36 1 2 3 …`, { title: 'https://admin.example.com' }),
    'product-list': Screen('bubble', 'browser', `
      uiSearch@450x36 상품 검색|Search products
      uiChip@120x30 운동화|Sneakers
      uiCard@200x220 러닝화 ₩89,000|Running shoe ₩89,000
      uiCard@200x220 등산화 ₩129,000|Hiking boot ₩129,000
      ||
      uiDropdown@200x36 정렬: 인기순|Sort: popular
      uiCard@200x220 샌들 ₩39,000|Sandal ₩39,000
      uiCard@200x220 슬리퍼 ₩19,000|Slipper ₩19,000`, { title: 'https://shop.example.com/shoes' }),
    'settings-screen': Screen('whisp', 'phone', `
      textBox@270x34 설정|Settings
      uiToggle 알림 받기|Notifications
      uiToggle 다크 모드|Dark mode
      uiDropdown@270x36 언어: 한국어|Language: English
      uiSlider@270x30 글자 크기|Text size
      uiButton@270x40 로그아웃|Sign out`),
    'checkout-page': Screen('facet', 'browser', `
      textBox@450x40 주문서|Checkout
      uiInput@450x36 받는 분|Recipient
      uiInput@450x36 주소|Address
      uiRadio@300x26 카드 결제|Card
      uiRadio@300x26 계좌 이체|Bank transfer
      uiButton@450x40#1 ₩119,000 결제하기|Pay ₩119,000
      ||
      uiList@400x180 주문 상품|Items
      uiCard@400x120 배송비 무료|Free delivery`, { title: 'https://shop.example.com/checkout' }),
    'mobile-login': Screen('ion', 'phone', `
      uiImage@270x120 로고|Logo
      uiInput@270x36 이메일|E-mail
      uiInput@270x36 비밀번호|Password
      uiButton@270x40#1 로그인|Sign in
      uiButton@270x40 카카오로 로그인|Sign in with Kakao
      textBox@270x30 비밀번호를 잊으셨나요?|Forgot your password?`),
    'profile-page': Screen('radiance', 'browser', `
      uiAvatar@90x90 사진|Photo
      textBox@450x34 김민준 · 디자이너|Alex Kim · Designer
      uiTabs@450x170 게시물 · 사진 · 정보|Posts · Photos · About
      uiButton@200x36#1 팔로우|Follow
      ||
      uiCard@400x160 최근 활동|Recent activity
      uiList@400x150 친구|Friends`, { title: 'https://social.example.com/alex' }),
    'blog-post': Screen('organic', 'browser', `
      uiBreadcrumb@400x30 홈 › 블로그 › 여행|Home › Blog › Travel
      textBox@450x40 제주에서 보낸 사흘|Three days in Jeju
      uiImage@450x220 대표 사진|Cover photo
      uiTextarea@450x120 본문|Article text
      ||
      uiCard@400x160 글쓴이 소개|About the author
      uiTextarea@400x100 댓글 쓰기|Write a comment
      uiButton@200x36#1 등록|Post`, { title: 'https://blog.example.com/jeju' }),

    // ───────── agile
    'kanban-board': Board('organic', `
      # 요청|Requested
      agStory 사진 업로드|Photo upload
      agStory 다국어 지원|More languages
      # 분석|Analysis
      agStory 결제 수단 추가|More payment methods
      # 개발 (최대 3)|Doing (max 3)
      agDoing 검색 속도 개선|Faster search
      agDoing 알림 설정|Notification settings
      # 검증|Testing
      agBug 로그아웃 오류|Logout bug
      # 완료|Done
      agDone 회원 탈퇴|Delete account
      agDone 비밀번호 변경|Change password`, { caption: 'WIP 제한: 개발 3개|WIP limit: 3 in Doing' }),
    'product-backlog': Board('linear', `
      # 이번 스프린트|This sprint
      agStory 장바구니 저장~8점|Save the cart~8 pts
      agStory 주문 조회~5점|Order history~5 pts
      # 다음|Next
      agStory 쿠폰~5점|Coupons~5 pts
      agStory 리뷰 사진~3점|Review photos~3 pts
      agEpic 에픽: 정기 배송|Epic: subscriptions
      # 나중에|Later
      agStory 선물 포장~2점|Gift wrap~2 pts
      agStory 음성 검색~13점|Voice search~13 pts`),
    'release-plan': Gantt('linear', '1주,2주,3주,4주,5주,6주,7주,8주|W1,W2,W3,W4,W5,W6,W7,W8', `
      0 2 1 스프린트 1: 로그인|Sprint 1: Login
      2 2 2 스프린트 2: 장바구니|Sprint 2: Cart
      4 2 3 스프린트 3: 결제|Sprint 3: Payment
      6 1 4 안정화|Hardening
      7 1 5 출시 준비|Release prep
      ! 4 베타|Beta
      ! 8 1.0 출시|Release 1.0
      today 3`),
    'retro-board': Board('bubble', `
      # 좋았던 점|Went well
      agDone 배포 자동화|Automated deploys
      agDone 짝 프로그래밍|Pair programming
      # 아쉬운 점|To improve
      agBug 늦은 리뷰|Slow reviews
      agBug 잦은 회의|Too many meetings
      # 해볼 것|Try next
      agTodo 리뷰 24시간 규칙|24-hour review rule
      agTodo 회의 없는 오후|Meeting-free afternoons`, { caption: '스프린트 7 회고|Sprint 7 retrospective' }),
    'story-map': Board('facet', `
      # 찾기|Find
      agEpic 상품 찾기|Find products
      agStory 검색|Search
      agStory 필터|Filters
      # 고르기|Choose
      agEpic 상품 비교|Compare
      agStory 상세 정보|Details
      agStory 리뷰 보기|Reviews
      # 사기|Buy
      agEpic 주문하기|Order
      agStory 장바구니|Cart
      agStory 결제|Checkout
      # 받기|Receive
      agEpic 배송|Delivery
      agStory 배송 조회|Tracking`),
    'bug-workflow': G('retrospect', ['agile', 'flowchart'], 'flowLR', `
      n agBug@140x80 신규|New
      t agTodo@140x80 분류됨|Triaged
      d agDoing@140x80 수정 중|In progress
      r agDoing@140x80 검토|In review
      q decision#4@140x90 QA 통과?|QA passed?
      c agDone@140x80 종료|Closed
      w agTodo@140x80 재현 안 됨|Can't reproduce`, `
      n -> t
      n -> w
      t -> d
      d -> r
      r -> q
      q -> c 예|Yes
      q -> d 아니요|No`, { spacing: 45 }),
    'burndown-review': Dash('retrospect', `
      chartKpi@240x100#1 남은 점수~12점|Points left~12
      chartKpi@240x100#2 완료~34점|Done~34 pts
      chartKpi@240x100#3 속도~평균 30점|Velocity~30 avg
      --
      agBurndown@460x260 번다운|Burndown
      chartBar@420x260 스프린트별 속도|Velocity by sprint`),
    'daily-standup': G('chalkboard', ['agile', 'basic'], 'circular', `
      a agStandup@170x100 어제 한 일|Yesterday
      b agStandup@170x100 오늘 할 일|Today
      c agBug@170x100 막힌 점|Blockers
      d agTodo@170x100 도움 요청|Ask for help
      e agDone@170x100 15분 안에 끝|Done in 15 min`, `
      a -> b
      b -> c
      c -> d
      d -> e
      e -> a`, { spacing: 70 }),

    // ───────── org charts
    'school-org': G('ion', ['org'], 'treeTB', `
      p orgExecutive@180x80 교장|Principal
      v orgManager@170x70 교감|Vice principal
      a orgManager@170x70 행정실장|Office manager
      g1 orgPosition@150x70 1학년 부장|Year 1 head
      g2 orgPosition@150x70 2학년 부장|Year 2 head
      g3 orgPosition@150x70 3학년 부장|Year 3 head
      ad orgStaff@150x70 행정 직원|Office staff
      c orgStaff@150x70 상담 교사|Counsellor`, `
      p -- v
      p -- a
      v -- g1
      v -- g2
      v -- g3
      v -- c
      a -- ad`, { spacing: 40 }),
    'hospital-org': G('linear', ['org'], 'treeTB', `
      d orgExecutive@180x80 병원장|Hospital director
      m orgManager@170x70 진료 부원장|Medical director
      n orgManager@170x70 간호부장|Head of nursing
      ad orgManager@170x70 행정부장|Head of admin
      in orgDepartment@150x70 내과|Internal medicine
      su orgDepartment@150x70 외과|Surgery
      er orgDepartment@150x70 응급실|Emergency
      w orgTeam@150x70 병동 간호팀|Ward nurses
      it orgTeam@150x70 전산팀|IT`, `
      d -- m
      d -- n
      d -- ad
      m -- in
      m -- su
      m -- er
      n -- w
      ad -- it`, { spacing: 40 }),
    'startup-org': G('bubble', ['org'], 'treeTB', `
      ceo orgExecutive@170x80 대표|CEO
      cto orgManager@160x70 CTO
      coo orgManager@160x70 COO
      dev orgTeam@150x70 개발 4명|Developers ×4
      des orgPosition@150x70 디자이너|Designer
      mk orgPosition@150x70 마케터|Marketer
      cs orgPosition@150x70 고객 지원|Support
      h orgVacancy@150x70 채용 중: 데이터|Hiring: data`, `
      ceo -- cto
      ceo -- coo
      cto -- dev
      cto -- des
      cto -- h
      coo -- mk
      coo -- cs`, { spacing: 40 }),
    'restaurant-org': G('organic', ['org'], 'treeTB', `
      o orgExecutive@170x80 사장|Owner
      hc orgManager@160x70 주방장|Head chef
      fm orgManager@160x70 홀 매니저|Floor manager
      sc orgPosition@150x70 부주방장|Sous chef
      cook orgStaff@150x70 조리사 3명|Cooks ×3
      w orgStaff@150x70 서빙 4명|Servers ×4
      cash orgStaff@150x70 계산원|Cashier`, `
      o -- hc
      o -- fm
      hc -- sc
      sc -- cook
      fm -- w
      fm -- cash`, { spacing: 40 }),
    'club-org': G('radiance', ['org'], 'treeTB', `
      pr orgExecutive@170x80 회장|President
      vp orgManager@160x70 부회장|Vice president
      tr orgPosition@150x70 총무|Treasurer
      sec orgPosition@150x70 서기|Secretary
      ev orgTeam@150x70 행사부|Events team
      pr2 orgTeam@150x70 홍보부|Publicity team
      m orgStaff@150x70 회원 40명|40 members`, `
      pr -- vp
      pr -- tr
      pr -- sec
      vp -- ev
      vp -- pr2
      ev -- m`, { spacing: 40 }),
    'city-office-org': G('office', ['org'], 'treeTB', `
      mayor orgExecutive@170x80 시장|Mayor
      dep orgManager@160x70 부시장|Deputy mayor
      pl orgDepartment@150x70 도시계획과|Planning
      wf orgDepartment@150x70 복지과|Welfare
      env orgDepartment@150x70 환경과|Environment
      fin orgDepartment@150x70 재정과|Finance
      civ orgTeam@150x70 민원실|Service desk`, `
      mayor -- dep
      dep -- pl
      dep -- wf
      dep -- env
      dep -- fin
      wf -- civ`, { spacing: 40 }),
    'family-business-org': G('facet', ['org'], 'treeTB', `
      own orgExecutive@170x80 대표 (아버지)|Owner (father)
      man orgManager@160x70 실장 (딸)|Manager (daughter)
      acc orgPartner@160x70 외부 세무사|Outside accountant
      sh orgStaff@150x70 매장 직원 2명|Shop staff ×2
      on orgPosition@150x70 온라인몰 (아들)|Online shop (son)
      dl orgStaff@150x70 배달|Delivery`, `
      own -- man
      own --> acc
      man -- sh
      man -- on
      on -- dl`, { spacing: 40 }),
    'sales-team-org': G('sequence', ['org'], 'treeTB', `
      vp orgExecutive@170x80 영업 본부장|Head of sales
      n orgManager@160x70 북부 팀장|North lead
      s orgManager@160x70 남부 팀장|South lead
      k orgManager@160x70 주요 고객 팀장|Key accounts lead
      n1 orgPosition@140x70 영업 담당 ×3|Reps ×3
      s1 orgPosition@140x70 영업 담당 ×4|Reps ×4
      k1 orgPosition@140x70 담당자 ×2|Managers ×2
      sup orgAssistant@150x70 영업 지원|Sales support`, `
      vp -- n
      vp -- s
      vp -- k
      vp --> sup
      n -- n1
      s -- s1
      k -- k1`, { spacing: 40 }),

    // ───────── mind maps
    'project-kickoff': Mind('ion', '프로젝트 착수|Project kick-off', `
      목표|Goals: 출시일|Launch date, 성공 기준|Success measures
      사람|People: 역할|Roles, 연락처|Contacts
      범위|Scope: 포함|In, 제외|Out
      위험|Risks: 일정|Schedule, 예산|Budget
      소통|Communication: 주간 회의|Weekly meeting, 메신저|Chat`),
    'book-summary': Mind('organic', '좋은 습관|Good Habits', `
      신호|Cue: 눈에 띄게|Make it obvious
      욕구|Craving: 끌리게|Make it attractive
      반응|Response: 쉽게|Make it easy
      보상|Reward: 만족스럽게|Make it satisfying
      정체성|Identity: 작은 승리|Small wins, 매일 1%|1% a day`),
    'party-planning': Mind('bubble', '생일 파티|Birthday party', `
      장소|Place: 집|Home, 공원|Park
      음식|Food: 케이크|Cake, 피자|Pizza
      손님|Guests: 친구 12명|12 friends, 초대장|Invitations
      놀이|Games: 보물찾기|Treasure hunt, 노래방|Karaoke
      준비물|Supplies: 풍선|Balloons, 선물|Gifts`),
    'health-goals': Mind('radiance', '건강한 한 해|A healthy year', `
      운동|Exercise: 주 3회 걷기|Walk 3× a week, 근력|Strength
      식사|Food: 채소|Vegetables, 물 2L|2 L of water
      수면|Sleep: 7시간|7 hours, 일정한 시간|Same bedtime
      마음|Mind: 명상|Meditation, 일기|Journal
      검진|Check-ups: 건강 검진|Health check, 치과|Dentist`),
    'marketing-ideas': Mind('retrospect', '신제품 홍보|Launch marketing', `
      온라인|Online: 블로그|Blog, 검색 광고|Search ads
      SNS|Social: 짧은 영상|Short videos, 인플루언서|Influencers
      오프라인|Offline: 팝업 매장|Pop-up store, 전단|Flyers
      혜택|Offers: 사전 예약|Pre-order, 친구 추천|Referrals
      측정|Measure: 방문 수|Visits, 전환율|Conversion`),

    // ───────── floor plans
    'bedroom': P('monochrome', ['floor', 'basic'], `
      . room 160 90 760x620
      . window 400 84 260x12
      . bed 200 140 180x230 침대|Bed
      . flrWardrobe 720 110 160x70 옷장|Wardrobe
      . desk 680 520 170x80 책상|Desk
      . chair 740 470 46x46
      . flrLamp 410 150 40x40
      . flrRug 420 400 240x160 러그|Rug
      . door 180 610 85x85
      . plant 860 640 50x50`),
    'kitchen': P('slice', ['floor', 'basic'], `
      . room 120 90 860x620
      . window 420 84 220x12
      . flrCounter 150 110 500x70 조리대|Counter
      . flrStove 660 110 120x70 가스레인지|Stove
      . sink 400 115 80x60
      . flrFridge 830 110 110x90 냉장고|Fridge
      . flrDining 330 360 300x200 식탁|Dining table
      . flrShelf 150 640 300x40 수납장|Cupboard
      . door 860 620 85x85`),
    'bathroom': P('whisp', ['floor', 'basic'], `
      . room 260 90 560x600
      . flrBath 290 110 300x140 욕조|Bathtub
      . flrShower 650 110 140x140 샤워|Shower
      . toilet 300 460 70x90 변기|Toilet
      . sink 520 600 120x70 세면대|Basin
      . flrWasher 690 440 100x100 세탁기|Washer
      . door 700 600 85x85`),
    'living-room': P('organic', ['floor', 'interior', 'basic'], `
      . room 100 90 900x620
      . window 380 84 340x12
      . intSofaL 140 140 300x220 소파|Sofa
      . intCoffee 480 260 160x90 탁자|Coffee table
      . flrTv 800 230 60x200 TV
      . intArmchair 520 440 100x100 안락의자|Armchair
      . intFireplace 900 480 80x160 벽난로|Fireplace
      . intPlantBig 140 600 80x80
      . flrRug 440 200 260x220
      . door 160 620 85x85`),
    'meeting-room': P('office', ['floor', 'basic'], `
      . room 150 90 820x600
      . tableRect 340 260 440x160 회의 탁자|Meeting table
      . chair 380 210 46x46
      . chair 480 210 46x46
      . chair 580 210 46x46
      . chair 680 210 46x46
      . chair 380 430 46x46 r180
      . chair 480 430 46x46 r180
      . chair 580 430 46x46 r180
      . chair 680 430 46x46 r180
      . flrTv 900 250 50x180 화면|Screen
      . door 170 590 85x85
      . plant 880 110 50x50`),
    'two-room-apartment': P('blueprint', ['floor', 'basic'], `
      . room 60 90 1000x640
      . room 60 90 360x320 방 1|Room 1
      . room 60 410 360x320 방 2|Room 2
      . room 760 90 300x260 욕실|Bathroom
      . bed 90 120 160x210
      . bed 90 440 160x210
      . flrCounter 480 110 260x70 주방|Kitchen
      . flrDining 500 350 220x150 식탁|Table
      . toilet 980 110 60x80
      . flrShower 800 120 120x120
      . sofa 760 560 240x90 거실|Living room
      . door 330 320 80x80
      . door 330 640 80x80
      . door 760 260 80x80`),

    // ───────── timelines
    'website-launch': Gantt('office', '1월,2월,3월,4월,5월,6월|Jan,Feb,Mar,Apr,May,Jun', `
      0 1 1 요구 사항|Requirements
      0.8 1.2 1 디자인|Design
      1.8 2 2 개발|Build
      3.6 1 3 콘텐츠|Content
      4.4 0.8 4 시험|Testing
      5.2 0.8 5 출시·홍보|Launch, promote
      ! 2 디자인 확정|Design signed off
      ! 5.2 공개|Go live
      today 2.6`),
    'wedding-plan': Gantt('whisp', '12개월 전,10,8,6,4,2,1개월 전|12 mo,10,8,6,4,2,1 mo', `
      0 1 1 예산·날짜|Budget, date
      0.5 1.5 2 예식장 예약|Book the venue
      2 2 3 드레스·정장|Dress, suit
      3 2 4 청첩장|Invitations
      4 2 5 신혼여행 준비|Honeymoon
      5.5 1.5 6 마지막 점검|Final checks
      ! 1 예식장 계약|Venue booked
      ! 7 결혼식|Wedding day`),
    'semester-plan': Gantt('facet', '3월,4월,5월,6월,7월|Mar,Apr,May,Jun,Jul', `
      0 1 1 개강·수강 정정|Term starts
      0.5 1.5 2 1차 과제|Assignment 1
      1.5 0.5 3 중간고사|Midterms
      2 1.5 4 팀 프로젝트|Team project
      3.4 0.6 5 기말고사|Finals
      4 1 6 계절 학기|Summer course
      ! 1.75 중간고사|Midterm week
      ! 3.7 성적 발표|Grades out`),
    'product-history': Gantt('radiance', '2021,2022,2023,2024,2025,2026|2021,2022,2023,2024,2025,2026', `
      0 1 1 아이디어·시제품|Idea, prototype
      1 1 2 1.0 출시|Version 1.0
      2 1.5 3 해외 진출|Going abroad
      3 1 4 모바일 앱|Mobile app
      4 1.5 5 AI 기능|AI features
      ! 1 첫 고객|First customer
      ! 3.5 사용자 100만|1 million users
      ! 5.5 상장|Listed`),
    'moving-plan': Gantt('bubble', '4주 전,3주 전,2주 전,1주 전,이사 주|4 wk,3 wk,2 wk,1 wk,Move week', `
      0 1 1 이사 업체 예약|Book movers
      0.5 1.5 2 짐 정리·버리기|Sort, throw out
      2 1.5 3 포장|Pack
      2.5 1 4 주소 변경|Change address
      4 0.5 5 이사|Move
      4.5 0.5 6 정리|Unpack
      ! 4 이사 날|Moving day`),
    'conference-prep': Gantt('sequence', '1월,2월,3월,4월,5월|Jan,Feb,Mar,Apr,May', `
      0 1 1 장소 계약|Book the venue
      0.5 1.5 2 연사 섭외|Invite speakers
      1.5 2 3 참가 등록|Registration
      2 1.5 4 홍보|Promotion
      3.5 1 5 운영 준비|Logistics
      4.5 0.5 6 행사|Event
      ! 2 프로그램 공개|Programme out
      ! 4.5 개막|Opening`),
    'construction-schedule': Gantt('blueprint', '1월,2월,3월,4월,5월,6월,7월,8월|Jan,Feb,Mar,Apr,May,Jun,Jul,Aug', `
      0 1 1 설계·허가|Design, permits
      1 1 2 토목·기초|Groundwork
      2 2 3 골조|Structure
      4 1.5 4 외장|Exterior
      4.5 2 5 내장·설비|Interior, services
      6.5 1 6 검사·입주|Inspection, move in
      ! 1 착공|Ground broken
      ! 4 상량|Topping out
      ! 7.5 준공|Completion`),

    // ───────── block diagrams
    'maslow-pyramid': P('radiance', ['blocks', 'basic'], `
      . triangle 420 90 240x150 #5 자아실현|Self-actualisation
      . trapezoid 360 250 360x100 #4 존중|Esteem
      . trapezoid 300 360 480x100 #3 소속감|Belonging
      . trapezoid 240 470 600x100 #2 안전|Safety
      . trapezoid 180 580 720x100 #1 생리적 욕구|Physiological needs`),
    'okr-goals': G('ion', ['blocks', 'basic'], 'treeTB', `
      o target@200x160 목표: 고객이 사랑하는 앱|Objective: an app customers love
      k1 roundRect#2@220x80 KR1 평점 4.7 이상|KR1 rating 4.7+
      k2 roundRect#3@220x80 KR2 재방문 40%|KR2 40% return visits
      k3 roundRect#4@220x80 KR3 문의 30% 감소|KR3 30% fewer tickets
      i1 tag@200x60 리뷰 응답|Answer reviews
      i2 tag@200x60 푸시 개인화|Personal push
      i3 tag@200x60 도움말 개편|New help pages`, `
      o -- k1
      o -- k2
      o -- k3
      k1 -- i1
      k2 -- i2
      k3 -- i3`, { spacing: 45 }),
    'value-chain': P('office', ['blocks', 'arrows', 'basic'], `
      . rect 60 100 1000x80 #6 지원 활동: 인사 · 기술 개발 · 구매|Support: HR · Technology · Purchasing
      . chevron 60 230 220x110 #1 구매 물류|Inbound logistics
      . chevron 260 230 220x110 #2 생산|Operations
      . chevron 460 230 220x110 #3 출고 물류|Outbound logistics
      . chevron 660 230 220x110 #4 마케팅·판매|Marketing, sales
      . chevron 860 230 200x110 #5 서비스|Service
      . homePlate 60 400 1000x90 #6 고객 가치와 이익|Customer value and margin`),
    'tech-stack': P('midnight', ['blocks', 'basic'], `
      . block3d 260 90 560x90 #1 화면: React|Front end: React
      . block3d 260 200 560x90 #2 API: Node.js|API: Node.js
      . block3d 260 310 560x90 #3 데이터: PostgreSQL · Redis|Data: PostgreSQL, Redis
      . block3d 260 420 560x90 #4 인프라: 쿠버네티스|Platform: Kubernetes
      . block3d 260 530 560x90 #5 클라우드|Cloud`),
    'growth-steps': P('bubble', ['blocks', 'basic'], `
      . rect 80 560 200x80 #1 1단계~시작|Step 1~Start
      . rect 290 460 200x180 #2 2단계~배우기|Step 2~Learn
      . rect 500 360 200x280 #3 3단계~연습|Step 3~Practise
      . rect 710 260 200x380 #4 4단계~가르치기|Step 4~Teach
      . star5 860 120 100x100 #5`),
    'onion-model': P('sequence', ['blocks', 'basic'], `
      . circle 260 90 600x600 #4
      . circle 340 170 440x440 #3
      . circle 420 250 280x280 #2
      . circle 490 320 140x140 #1 도메인|Domain
      . textBox 470 270 180x30 응용 서비스|Application
      . textBox 470 190 180x30 인프라|Infrastructure
      . textBox 470 110 180x30 화면·외부|UI, outside`),
    'team-puzzle': P('organic', ['blocks', 'basic'], `
      . blkPuzzle 300 140 240x200 #1 기획|Planning
      . blkPuzzle 540 140 240x200 #2 디자인|Design
      . blkPuzzle 300 340 240x200 #3 개발|Development
      . blkPuzzle 540 340 240x200 #4 운영|Operations`, '', { note: '네 조각이 모여야 제품이 됩니다.|It takes all four pieces to make the product.' }),
    'input-output': G('linear', ['blocks', 'basic'], 'flowLR', `
      i1 roundRect#1@160x70 원자재|Raw materials
      i2 roundRect#1@160x70 인력|People
      i3 roundRect#1@160x70 에너지|Energy
      p blkInOut@220x140 생산 공정|Production
      o1 roundRect#3@160x70 제품|Products
      o2 roundRect#4@160x70 폐기물|Waste
      o3 roundRect#5@160x70 데이터|Data`, `
      i1 -> p
      i2 -> p
      i3 -> p
      p -> o1
      p -> o2
      p -> o3`, { spacing: 70 }),

    // ───────── charts & dashboards
    'kpi-board': Dash('office', `
      chartKpi@240x100#1 매출~₩3.4억|Revenue~₩340 M
      chartKpi@240x100#2 주문~2,180건|Orders~2,180
      chartKpi@240x100#3 고객~912명|Customers~912
      chartKpi@240x100#4 만족도~4.6|Rating~4.6
      --
      chartGauge@240x140 목표 달성 76%|Target 76%
      chartSparkline@240x80 최근 30일|Last 30 days
      chartProgress@240x60 분기 진행률|Quarter progress`),
    'web-traffic': Dash('linear', `
      chartLine@500x240 일별 방문자|Visitors per day
      chartDonut@240x240 유입 경로|Traffic sources
      --
      chartBarH@480x200 많이 본 페이지|Top pages
      chartTable@360x140 국가별 방문|Visits by country`),
    'budget-split': Dash('organic', `
      chartPie@300x300 연간 예산 배분|Yearly budget split
      chartWaterfall@560x300 예산 변화|Budget changes
      --
      chartTable@420x140 부서별 예산|Budget by team`),
    'quarterly-sales': Dash('slice', `
      chartBar@460x260 분기별 매출|Sales by quarter
      chartStacked@460x260 제품별 매출|Sales by product
      --
      chartKpi@240x100#1 전년 대비~+18%|Year on year~+18%
      chartKpi@240x100#2 최고 분기~Q4|Best quarter~Q4`),
    'skills-radar': Dash('whisp', `
      chartRadar@320x300 팀 역량|Team skills
      chartBarH@480x260 교육 시간|Training hours
      --
      chartMatrix@320x200 역량 · 관심도|Skill vs interest`),
    'project-progress': Dash('facet', `
      chartProgress@300x60 설계 100%|Design 100%
      chartProgress@300x60 개발 70%|Build 70%
      chartProgress@300x60 시험 20%|Testing 20%
      --
      chartGauge@260x150 전체 진행 63%|Overall 63%
      chartBoxPlot@340x220 작업 소요 시간|Task durations`),
    'market-share': Dash('radiance', `
      chartDonut@280x280 시장 점유율|Market share
      chartTreemap@460x280 세부 시장|Segments
      --
      chartBubble@460x240 성장률 · 규모|Growth vs size`),
    'heatmap-report': Dash('midnight', `
      chartHeatmap@520x280 요일 · 시간별 주문|Orders by day and hour
      chartHistogram@380x260 주문 금액 분포|Order value spread
      --
      chartScatter@420x220 광고비 · 매출|Ad spend vs sales`),

    // ───────── electrical & logic
    'series-circuit': P('office', ['electrical', 'callouts'], `
      bat battery 160 330 70x70
      sw switchElec 360 170 스위치|Switch
      r1 resistor 600 185 R1 100 Ω
      l1 lamp 820 320 70x70
      am elecAmmeter 560 520 70x70`, `
      bat == sw
      sw == r1
      r1 == l1
      l1 == am
      am == bat`, { note: '직렬 회로에서는 모든 소자에 같은 전류가 흐릅니다.|In a series circuit the same current flows through every part.' }),
    'parallel-lamps': P('facet', ['electrical', 'callouts'], `
      bat voltageSource 120 330 80x80
      sw switchElec 300 170 스위치|Switch
      j1 elecJunction 560 180
      j2 elecJunction 560 560
      l1 lamp 460 340 70x70
      l2 lamp 640 340 70x70
      l3 lamp 820 340 70x70`, `
      bat == sw
      sw == j1
      j1 == l1
      j1 == l2
      j1 == l3
      l1 == j2
      l2 == j2
      l3 == j2
      j2 == bat`, { note: '램프 하나가 꺼져도 나머지는 켜져 있습니다.|If one lamp goes out, the others stay on.' }),
    'led-indicator': P('chalkboard', ['electrical', 'logic'], `
      v logicVcc 180 140 5 V
      r resistor 380 155 220 Ω
      led elecLed 620 160 LED
      g ground 820 400 접지|Ground
      sw switchElec 380 400 누름 스위치|Push button`, `
      v == r
      r == led
      led == g
      v == sw
      sw == g`),
    'doorbell': P('bubble', ['electrical', 'callouts'], `
      bat battery 160 320 70x70
      btn switchElec 360 170 초인종 버튼|Bell push
      tr elecTransformer 600 160 변압기|Transformer
      bz elecBuzzer 820 330 70x70 부저|Buzzer`, `
      bat == btn
      btn == tr
      tr == bz
      bz == bat`),
    'motor-control': P('integral', ['electrical', 'logic'], `
      ac acSource 120 320 80x80 220 V
      br elecBreaker 300 170 차단기|Breaker
      rl elecRelay 520 170 릴레이|Relay
      m elecMotor 800 320 90x90 모터|Motor
      f elecFuse 520 520 퓨즈|Fuse
      sw switchElec 300 520 시작 스위치|Start switch`, `
      ac == br
      br == rl
      rl == m
      m == f
      f == sw
      sw == ac`),
    'traffic-light-logic': G('linear', ['logic', 'basic'], 'flowLR', `
      clk logicClock@100x60 클록|Clock
      cnt logicCounter@140x100 카운터|Counter
      dec logicDecoder@140x110 디코더|Decoder
      r elecLed 빨강|Red
      y elecLed 노랑|Yellow
      g elecLed 초록|Green`, `
      clk -> cnt
      cnt -> dec
      dec -> r
      dec -> y
      dec -> g`, { spacing: 70 }),

    // ───────── process & manufacturing
    'boiler-system': G('blueprint', ['process'], 'flowLR', `
      t pidTank 급수 탱크|Feed tank
      p pidPump P-201
      b pidBoiler 보일러|Boiler
      v pidValveControl 증기 밸브|Steam valve
      h pidHeatEx 열교환기|Heat exchanger
      g pidGauge 압력계|Pressure gauge`, `
      t -> p
      p -> b
      b -> v
      v -> h
      b --> g`, { spacing: 70 }),
    'chemical-reactor': G('monochrome', ['process'], 'flowLR', `
      a pidTank 원료 A|Feed A
      b pidTank 원료 B|Feed B
      pa pidPump P-301
      pb pidPump P-302
      r pidReactor 반응기|Reactor
      c pidCooler 냉각기|Cooler
      s pidColumn 분리탑|Column
      pr pidSilo 제품 저장|Product silo`, `
      a -> pa
      b -> pb
      pa -> r
      pb -> r
      r -> c
      c -> s
      s -> pr`, { spacing: 60 }),
    'cooling-water': G('slice', ['process'], 'flowLR', `
      ch pidHeatEx 공정 열교환기|Process exchanger
      ct pidCooler 냉각탑|Cooling tower
      bs pidTankOpen 수조|Basin
      p pidPump P-401
      f pidFilter 여과기|Filter
      fm pidFlowMeter 유량계|Flow meter`, `
      ch -> ct 뜨거운 물|hot water
      ct -> bs
      bs -> p
      p -> f
      f -> fm
      fm -> ch 찬물|cool water`, { spacing: 65 }),
    'packaging-line': G('radiance', ['factory'], 'flowLR', `
      in facConveyor 투입 컨베이어|Infeed
      fill facStation 충전|Filling
      cap facRobot 뚜껑 로봇|Capping robot
      lab facStation 라벨|Labelling
      chk facInspect 무게 검사|Check weigher
      box facPress 박스 포장|Boxing
      pal trPallet 팔레트|Pallet`, `
      in -> fill
      fill -> cap
      cap -> lab
      lab -> chk
      chk -> box
      box -> pal`, { spacing: 55 }),
    'cnc-cell': P('integral', ['factory', 'callouts'], `
      st facStorage 80 300 원자재 선반|Raw stock
      rb facRobot 330 280 로딩 로봇|Loading robot
      c1 facCnc 560 140 CNC 1
      c2 facCnc 560 440 CNC 2
      ins facInspect 820 300 측정|Measure
      out facBuffer 960 300 완성품|Finished
      plc facPlc 330 560 셀 PLC|Cell PLC`, `
      st -> rb
      rb -> c1
      rb -> c2
      c1 -> ins
      c2 -> ins
      ins -> out
      plc --> rb`),
    'warehouse-flow': G('organic', ['factory', 'transport', 'business'], 'flowLR', `
      tr bizTruck 입고 트럭|Incoming truck
      rc facStation 검수|Receiving
      fl trForklift 지게차|Forklift
      rk bizWarehouse 보관 랙|Racks
      pk facWorker 피킹|Picking
      pa trBox 포장|Packing
      dt bizTruck 출고 트럭|Outgoing truck`, `
      tr -> rc
      rc -> fl
      fl -> rk
      rk -> pk
      pk -> pa
      pa -> dt`, { spacing: 55 }),
    'quality-inspection': G('linear', ['factory', 'flowchart'], 'flowTB', `
      s facConveyor 생산품 도착|Parts arrive
      v facInspect 외관 검사|Visual check
      d decision#4@150x90 합격?|Pass?
      m facTool 치수 측정|Measure
      d2 decision#4@150x90 허용 오차?|In tolerance?
      ok facStorage 출하|Ship
      rw facWorker 재작업|Rework
      sc process#2 폐기|Scrap`, `
      s -> v
      v -> d
      d -> m 예|Yes
      d -> rw 아니요|No
      m -> d2
      d2 -> ok 예|Yes
      d2 -> sc 아니요|No
      rw --> v`, { spacing: 45 }),
    'food-mixing': G('bubble', ['process'], 'flowLR', `
      f pidSilo 밀가루|Flour
      w pidTank 물|Water
      s pidTankOpen 설탕|Sugar
      m pidMixer 반죽기|Mixer
      c pidConveyor 성형 컨베이어|Shaping conveyor
      o pidBoiler 오븐|Oven
      k pidCooler 냉각|Cooling`, `
      f -> m
      w -> m
      s -> m
      m -> c
      c -> o
      o -> k`, { spacing: 60 }),

    // ───────── life, health & education
    'patient-visit': G('linear', ['medical', 'flowchart'], 'flowTB', `
      a medPatient 접수|Check in
      v medChart 문진표|Health form
      d medDoctor 진료|See the doctor
      q decision#4@150x90 검사 필요?|Tests needed?
      t medMonitor 검사|Tests
      p medPill 처방|Prescription
      e terminator#6 수납·귀가|Pay, go home`, `
      a -> v
      v -> d
      d -> q
      q -> t 예|Yes
      q -> p 아니요|No
      t -> d 결과 확인|results
      p -> e`, { spacing: 45 }),
    'vaccination': G('whisp', ['medical', 'flowchart'], 'flowTB', `
      r process 예약|Book
      c medChart 예진표 작성|Screening form
      d medStethoscope 의사 예진|Doctor check
      g decision#4@150x90 접종 가능?|Fit for it?
      s medSyringe 접종|Vaccinate
      w fcHourglass 15분 관찰|Wait 15 min
      l process 다음 날짜 안내|Next date given
      e terminator#6 귀가|Go home`, `
      r -> c
      c -> d
      d -> g
      g -> s 예|Yes
      g -> l 아니요|No
      s -> w
      w -> e
      l -> e`, { spacing: 45 }),
    'school-day': Gantt('bubble', '8시,9시,10시,11시,12시,13시,14시,15시,16시|8,9,10,11,12,1 pm,2,3,4', `
      0.5 0.5 1 등교|Arrive
      1 1 2 국어|Korean
      2 1 3 수학|Maths
      3 1 4 과학|Science
      4 1 5 점심|Lunch
      5 1 6 영어|English
      6 1 2 체육|PE
      7 1 3 동아리|Club`),
    'study-routine': G('facet', ['education', 'basic'], 'circular', `
      a eduBook@140x100 예습|Preview
      b eduLesson@180x80 수업|Class
      c eduPencil@100x100 복습|Review
      d eduQuiz@120x110 문제 풀이|Practice
      e eduAward@120x110 휴식·보상|Break, reward`, `
      a -> b
      b -> c
      c -> d
      d -> e
      e -> a`, { spacing: 70 }),
    'recipe-steps': G('organic', ['flowchart', 'basic'], 'flowTB', `
      a process 재료 손질|Prepare ingredients
      b process 반죽 만들기|Make the dough
      c delay 30분 휴지|Rest 30 min
      d process 토핑 올리기|Add toppings
      e process 220도 오븐 12분|Bake 12 min at 220°C
      q decision#4@150x90 노릇하게~익었나?|Golden?
      f terminator#6 피자 완성|Pizza ready`, `
      a -> b
      b -> c
      c -> d
      d -> e
      e -> q
      q -> f 예|Yes
      q -> e 아니요, 3분 더|No, 3 more min`, { spacing: 40 }),
    'home-chores': Board('whisp', `
      # 매일|Daily
      agTodo 설거지 (엄마)|Dishes (Mum)
      agTodo 화분 물주기 (지우)|Water plants (Jiwoo)
      # 매주|Weekly
      agDoing 청소기 (아빠)|Vacuum (Dad)
      agDoing 빨래 (민호)|Laundry (Minho)
      # 매월|Monthly
      agStory 냉장고 정리|Clean the fridge
      agStory 이불 빨래|Wash the bedding
      # 끝남|Done
      agDone 분리수거|Recycling`),
    'exam-prep': Gantt('integral', '1주,2주,3주,4주,5주,6주|W1,W2,W3,W4,W5,W6', `
      0 2 1 개념 정리|Go over topics
      1 2 2 기출 문제|Past papers
      2.5 1.5 3 약점 보완|Weak spots
      4 1 4 모의고사|Mock exams
      5 1 5 마무리 복습|Final review
      ! 4 모의고사 1회|Mock 1
      ! 6 시험|Exam day`),

    // ───────── maps & logistics
    'bus-route': P('linear', ['maps', 'transport', 'callouts'], `
      . mapRoadH 40 380 1040x44
      . mapRoadV 300 90 44x680
      . mapRoadV 760 90 44x680
      s1 trStation 140 320 터미널|Terminal
      s2 trStation 300 200 시청|City hall
      s3 trStation 520 320 시장|Market
      s4 trStation 760 200 병원|Hospital
      s5 trStation 760 560 학교|School
      s6 trStation 960 320 공원|Park
      . trBus 560 450 130x66 101번|Bus 101
      . mapCompass 1000 90`, `
      s1 -> s2
      s2 -> s3
      s3 -> s4
      s4 -> s5
      s5 -> s6`, { note: '배차 간격 10분, 첫차 5:30|Every 10 min from 5:30' }),
    'airport-transfer': G('radiance', ['transport', 'maps'], 'flowLR', `
      h mapHouse 집|Home
      t trTrain 공항 철도|Airport train
      a trPlane 공항|Airport
      b trBus 셔틀버스|Shuttle bus
      ho mapBuilding 호텔|Hotel`, `
      h -> t 15분|15 min
      t -> a 45분|45 min
      a -> b 비행 후|after the flight
      b -> ho 20분|20 min`, { spacing: 80 }),
    'park-trail': P('organic', ['maps', 'basic'], `
      . mapPark 800 560 240x170 숲|Woods
      e mapPin 120 600 입구|Entrance
      a mapPin 340 420 연못|Pond
      b mapPin 560 220 전망대|Lookout
      c mapPin 820 360 쉼터|Rest area
      d mapPin 640 620 매점|Kiosk
      . mapRiver 300 460 300x70
      . mapCompass 960 120`, `
      e -> a
      a -> b
      b -> c
      c -> d
      d -> e`, { note: '한 바퀴 3.2 km, 약 1시간|One loop: 3.2 km, about an hour' }),
    'shopping-street': P('facet', ['maps', 'business', 'basic'], `
      . mapRoadH 40 380 1040x44
      . bizStore 90 230 꽃집|Florist
      . bizStore 260 230 빵집|Bakery
      . bizStore 430 230 서점|Bookshop
      . bizStore 600 230 카페|Café
      . bizStore 770 230 약국|Pharmacy
      . bizStore 160 470 옷가게|Clothes
      . bizStore 340 470 편의점|Convenience store
      . bizStore 520 470 은행|Bank
      . mapParking 760 480 주차장|Parking
      . mapPin 940 300 지하철역|Subway
      . mapCompass 1000 620`),
    'ferry-route': P('blueprint', ['maps', 'transport'], `
      . mapRiver 40 300 1040x200 바다|Sea
      p1 mapBuilding 100 160 여객 터미널|Ferry terminal
      p2 mapHouse 500 560 섬 마을|Island village
      p3 mapBuilding 900 160 등대 섬|Lighthouse island
      sh trShip 440 340 120x70 여객선|Ferry
      . mapCompass 980 600`, `
      p1 -> p2 40분|40 min
      p2 -> p3 25분|25 min
      p3 --> p1 귀항|return`),
    'bike-path': P('whisp', ['maps', 'transport'], `
      . mapRiver 40 400 1040x80 강|River
      a mapPin 120 300 대여소 A|Rental A
      b mapPin 420 300 다리|Bridge
      c mapPin 720 300 대여소 B|Rental B
      d mapPin 960 560 캠핑장|Campsite
      . trBike 520 200 90x60
      . mapPark 600 560 240x150 강변 공원|Riverside park`, `
      a -> b 2 km
      b -> c 3 km
      c -> d 4 km`),
    'train-network': G('midnight', ['transport', 'maps'], 'circular', `
      a trStation 중앙역|Central
      b trStation 북역|North
      c trStation 공항|Airport
      d trStation 항구|Harbour
      e trStation 대학|University
      f trStation 시장|Market
      t trTrain 순환선|Circle line`, `
      a -> b
      b -> c
      c -> d
      d -> e
      e -> f
      f -> a
      t -- a`, { spacing: 60 }),
    'drone-delivery': G('ion', ['transport', 'maps'], 'flowLR', `
      w bizWarehouse 물류 거점|Hub
      d trDrone 드론|Drone
      c mapPin 배송 지점|Drop-off
      h mapHouse 고객 집|Customer home
      b netTower 관제탑|Control tower`, `
      w -> d 상자 적재|load
      d -> c 비행 8분|8 min flight
      c -> h 수령|collect
      b --> d 경로 관제|route control`, { spacing: 80 }),
    // ───────── two more per group (twelve each: two full rows of tiles)
    'library-loan': G('whisp', ['flowchart', 'callouts'], 'flowTB', `
      s terminator#6 책 고르기|Pick a book
      c manualInput 회원증 찍기|Scan the card
      d decision#4@150x90 연체~있음?|Overdue~books?
      no display 대출 불가 안내|Explain: no loan
      l process 대출 기록|Record the loan
      r document 반납일 영수증|Due-date slip
      e terminator#6 대출 완료|Done`, `
      s -> c
      c -> d
      d -> no 예|Yes
      d -> l 아니요|No
      l -> r
      r -> e`),
    'parking-payment': G('slice', ['flowchart', 'callouts'], 'flowTB', `
      s terminator#6 출차|Leaving
      t manualInput 번호판 인식|Plate read
      f decision#4@150x90 30분~이내?|Under~30 min?
      free process 무료 출차|Free exit
      p data 요금 결제|Pay the fee
      g process 차단기 열림|Barrier opens
      e terminator#6 끝|Done`, `
      s -> t
      t -> f
      f -> free 예|Yes
      f -> p 아니요|No
      free -> g
      p -> g
      g -> e`),
    'customer-onboarding': G('ion', ['bpmn'], 'flowLR', `
      s bpmnStart 가입 신청|Sign-up
      v bpmnServiceTask 본인 확인|Verify identity
      g gatewayExclusive
      a bpmnServiceTask 계좌 개설|Open account
      m bpmnUserTask 서류 재요청|Ask for papers
      w bpmnSendTask 환영 메일|Welcome e-mail
      e bpmnEnd 가입 완료|Done`, `
      s -> v
      v -> g
      g -> a 확인됨|Verified
      g -> m 부족|Missing
      m --> v
      a -> w
      w -> e`, { spacing: 55 }),
    'return-process': G('facet', ['bpmn'], 'flowLR', `
      s bpmnMessage 반품 신청|Return request
      l bpmnSendTask 회수 송장 발송|Send return label
      t bpmnTimer 상품 도착|Item arrives
      c bpmnUserTask 상태 검수|Inspect
      g gatewayExclusive
      r bpmnServiceTask 환불|Refund
      x bpmnSendTask 반송|Send back
      e bpmnEnd 종료|Closed`, `
      s -> l
      l -> t
      t -> c
      c -> g
      g -> r 정상|OK
      g -> x 훼손|Damaged
      r -> e
      x -> e`, { spacing: 55 }),
    'elevator-states': G('linear', ['uml'], 'flowLR', `
      i umlInitial
      idle umlState@150x70 대기|Idle
      up umlState@150x70 올라감|Going up
      down umlState@150x70 내려감|Going down
      open umlState@150x70 문 열림|Doors open
      stop umlState@150x70 점검 중|Out of service`, `
      i -> idle
      idle -> up 위층 호출|call above
      idle -> down 아래층 호출|call below
      up -> open 도착|arrive
      down -> open 도착|arrive
      open -> idle 10초|10 s
      idle -> stop 고장|fault`, { spacing: 60 }),
    'chat-sequence': Seq('bubble', 'a 앱 A|App A; s 채팅 서버|Chat server; d 저장소|Store; b 앱 B|App B', `
      a > s 메시지 보내기|Send message
      s > d 저장|Store
      d >> s 저장됨|Stored
      s > b 새 메시지|New message
      b >> s 읽음|Read
      s >> a 읽음 표시|Read receipt`),
    'restaurant-db': G('organic', ['erd'], 'flowLR', `
      tb entity@200x110 테이블~---~PK 테이블ID~좌석 수|Table~---~PK TableID~Seats
      od entity@200x150 주문~---~PK 주문ID~FK 테이블ID~시각|Order~---~PK OrderID~FK TableID~Time
      li entity@200x150 주문 항목~---~PK,FK 주문ID~PK,FK 메뉴ID~수량|Order line~---~PK,FK OrderID~PK,FK DishID~Qty
      mn entity@200x130 메뉴~---~PK 메뉴ID~이름~가격|Dish~---~PK DishID~Name~Price`, `
      tb -< od
      od -< li
      mn -< li`, { spacing: 70 }),
    'gym-db': G('radiance', ['erd'], 'flowLR', `
      mb entity@200x130 회원~---~PK 회원ID~이름~등급|Member~---~PK MemberID~Name~Plan
      vs entity@200x130 출입~---~PK 출입ID~FK 회원ID~시각|Visit~---~PK VisitID~FK MemberID~Time
      bk entity@200x150 수업 예약~---~PK 예약ID~FK 회원ID~FK 수업ID|Booking~---~PK BookingID~FK MemberID~FK ClassID
      cl entity@200x130 수업~---~PK 수업ID~이름~강사|Class~---~PK ClassID~Name~Coach`, `
      mb -< vs
      mb -< bk
      cl -< bk`, { spacing: 70 }),
    'campus-wifi': G('whisp', ['network'], 'treeTB', `
      net internet 인터넷|Internet
      fw firewall 방화벽|Firewall
      ctl server 무선 컨트롤러|Wi-Fi controller
      a1 wirelessAp 도서관|Library
      a2 wirelessAp 강의동|Lecture halls
      a3 wirelessAp 기숙사|Dorms
      s1 laptop 학생|Students
      s2 phone 방문객|Visitors
      s3 tablet 교직원|Staff`, `
      net -- fw
      fw -- ctl
      ctl -- a1
      ctl -- a2
      ctl -- a3
      a1 -- s1
      a2 -- s2
      a3 -- s3`, { spacing: 50 }),
    'retail-network': G('retrospect', ['network'], 'treeTB', `
      hq server 본사 서버|Head-office server
      vpn netVpn VPN
      r router 매장 공유기|Store router
      pos desktop 계산대|Till
      sc netScanner 바코드 스캐너|Barcode scanner
      cam netCamera 보안 카메라|Camera
      tv netSmartTv 메뉴 화면|Menu screen`, `
      hq -- vpn
      vpn -- r
      r -- pos
      r -- sc
      r -- cam
      r -- tv`, { spacing: 50 }),
    'video-streaming': G('midnight', ['cloud', 'network'], 'flowLR', `
      up cldBucket 원본 영상|Uploads
      tr cldFunction 변환|Transcode
      st cldBucket 화질별 파일|Renditions
      cdn cldEdge 엣지 서버|Edge servers
      u user 시청자|Viewers
      an cldAnalytics 시청 통계|Watch stats`, `
      up -> tr
      tr -> st
      st -> cdn
      cdn -> u
      u --> an`, { spacing: 70 }),
    'log-analytics': G('sequence', ['cloud'], 'flowLR', `
      ap cldCompute 앱 서버|App servers
      lg cldLogs 로그 수집|Collect logs
      q cldStream 스트림|Stream
      ix cldDatabase 검색 색인|Search index
      db cldMonitoring 대시보드|Dashboards
      al cldNotify 경보|Alerts`, `
      ap -> lg
      lg -> q
      q -> ix
      ix -> db
      ix -> al 오류 급증|error spike`, { spacing: 70 }),
    'layered-architecture': P('office', ['basic', 'c4'], `
      . rect 200 100 700x100 #1 화면 계층 (UI)|Presentation layer (UI)
      . rect 200 230 700x100 #2 응용 계층 (서비스)|Application layer (services)
      . rect 200 360 700x100 #3 도메인 계층 (규칙)|Domain layer (rules)
      . rect 200 490 700x100 #4 인프라 계층 (DB · 외부 API)|Infrastructure (DB, APIs)
      . textBox 920 280 180x120 위에서 아래로만 부릅니다|Calls go downwards only`),
    'api-auth-flow': Seq('ion', 'c 앱|Client; g API 게이트웨이|Gateway; a 인증 서버|Auth server; s 서비스|Service', `
      c > a 로그인|Log in
      a >> c 토큰|Token
      c > g 요청 + 토큰|Request + token
      g > a 토큰 검증|Check token
      a >> g 유효|Valid
      g > s 요청 전달|Forward
      s >> c 응답|Response`),
    'search-results': Screen('linear', 'browser', `
      uiSearch@450x36 무선 이어폰|Wireless earbuds
      uiChip@140x30 가격 낮은 순|Lowest price
      uiList@450x200 결과 128개|128 results
      uiPagination@300x36 1 2 3 … 13
      ||
      uiCard@400x160 추천 상품|Recommended
      uiCard@400x120 최근 본 상품|Recently viewed`, { title: 'https://shop.example.com/search' }),
    'calendar-app': Screen('bubble', 'phone', `
      textBox@270x34 2027년 3월|March 2027
      uiCalendar@270x220 달력|Calendar
      uiList@270x130 오늘 일정|Today
      uiButton@270x40#1 일정 추가|Add event`),
    'sprint-planning': Board('slice', `
      # 목표|Goal
      agEpic 결제 개선|Better checkout
      # 후보|Candidates
      agStory 간편 결제~5점|One-tap pay~5 pts
      agStory 쿠폰 적용~3점|Coupons~3 pts
      agStory 영수증 메일~2점|E-mail receipt~2 pts
      # 이번 스프린트|This sprint
      agTodo 간편 결제|One-tap pay
      agTodo 쿠폰 적용|Coupons
      # 용량|Capacity
      agPoints 팀 속도 30점|Velocity 30`, { caption: '스프린트 8 계획|Sprint 8 planning' }),
    'epic-breakdown': G('facet', ['agile'], 'treeTB', `
      e agEpic@200x80 에픽: 회원 등급|Epic: member tiers
      s1 agStory@170x90 등급 기준~5점|Tier rules~5 pts
      s2 agStory@170x90 등급 배지~3점|Tier badge~3 pts
      s3 agStory@170x90 등급 혜택~8점|Tier perks~8 pts
      t1 agTodo@150x70 화면 설계|Screen design
      t2 agTodo@150x70 API
      t3 agTodo@150x70 시험|Tests`, `
      e -- s1
      e -- s2
      e -- s3
      s3 -- t1
      s3 -- t2
      s3 -- t3`, { spacing: 40 }),
    'nonprofit-org': G('organic', ['org'], 'treeTB', `
      b orgBoard@180x80 이사회|Board
      d orgExecutive@170x80 사무국장|Director
      p orgManager@160x70 사업팀|Programmes
      f orgManager@160x70 모금팀|Fundraising
      v orgTeam@150x70 자원봉사자|Volunteers
      a orgStaff@150x70 회계|Accounts`, `
      b -- d
      d -- p
      d -- f
      d -- a
      p -- v`, { spacing: 40 }),
    'it-department-org': G('blueprint', ['org'], 'treeTB', `
      c orgExecutive@170x80 CIO
      i orgManager@160x70 인프라|Infrastructure
      a orgManager@160x70 애플리케이션|Applications
      s orgManager@160x70 보안|Security
      h orgTeam@150x70 헬프데스크|Help desk
      n orgTeam@150x70 네트워크|Network
      d orgTeam@150x70 개발|Developers`, `
      c -- i
      c -- a
      c -- s
      i -- h
      i -- n
      a -- d`, { spacing: 40 }),
    'career-plan': Mind('ion', '5년 진로 계획|Five-year career plan', `
      기술|Skills: 데이터 분석|Data analysis, 영어|English
      경험|Experience: 프로젝트 리더|Lead a project, 해외 근무|Work abroad
      자격|Certificates: 정보처리기사|IT certificate, PMP
      사람|People: 멘토|Mentor, 모임|Meet-ups
      생활|Life: 저축|Savings, 운동|Exercise`),
    'meeting-notes': Mind('whisp', '주간 회의|Weekly meeting', `
      결정|Decisions: 출시일 확정|Launch date set, 예산 승인|Budget approved
      할 일|Actions: 디자인 수정|Fix the design, 고객 인터뷰|Customer interviews
      위험|Risks: 인력 부족|Short of people
      다음 회의|Next meeting: 화요일 10시|Tuesday 10:00`),
    'kids-room': P('whisp', ['floor', 'interior', 'basic'], `
      . room 200 90 700x600
      . window 420 84 240x12
      . intBunk 230 120 150x230 이층 침대|Bunk bed
      . desk 640 520 200x80 책상|Desk
      . chair 720 470 46x46
      . flrShelf 230 620 260x40 장난감 선반|Toy shelf
      . flrRug 460 300 220x160 놀이 매트|Play mat
      . door 820 110 80x80`),
    'restaurant-floor': P('organic', ['floor', 'basic'], `
      . room 60 90 1000x640
      . flrCounter 90 110 300x70 주방 창구|Kitchen pass
      . tableRound 480 160 100x100 1
      . tableRound 680 160 100x100 2
      . tableRound 880 160 100x100 3
      . tableRect 460 400 160x80 4
      . tableRect 700 400 160x80 5
      . flrDining 120 380 240x160 단체석|Group table
      . doubleDoor 520 660 120x70 입구|Entrance
      . plant 980 640 50x50`),
    'marketing-calendar': Gantt('radiance', '1월,2월,3월,4월,5월,6월|Jan,Feb,Mar,Apr,May,Jun', `
      0 1 1 신년 이벤트|New-year sale
      1.5 1 2 봄 신상품|Spring range
      2.5 1.5 3 SNS 캠페인|Social campaign
      4 1 4 가정의 달|Family month
      5 1 5 여름 할인|Summer sale
      ! 1.5 신상품 공개|New range out
      ! 5 여름 할인 시작|Sale starts`),
    'training-program': Gantt('integral', '1주,2주,3주,4주|W1,W2,W3,W4', `
      0 0.5 1 오리엔테이션|Orientation
      0.5 1 2 기본 교육|Basics
      1.5 1 3 실습|Hands-on
      2.5 1 4 프로젝트|Project
      3.5 0.5 5 평가|Review
      ! 4 수료|Graduation`),
    'recruiting-funnel': P('slice', ['blocks', 'basic'], `
      . trapezoid 210 100 700x100 #1 지원 400명|400 applied
      . trapezoid 280 210 560x100 #2 서류 통과 120명|120 shortlisted
      . trapezoid 350 320 420x100 #3 면접 40명|40 interviewed
      . trapezoid 420 430 280x100 #4 최종 10명|10 final
      . trapezoid 470 540 180x100 #6 입사 6명|6 hired`),
    'feedback-cycle': G('linear', ['blocks', 'basic'], 'circular', `
      a roundRect#1@170x80 목표 정하기|Set goals
      b roundRect#2@170x80 실행|Do the work
      c roundRect#3@170x80 피드백|Feedback
      d roundRect#4@170x80 돌아보기|Reflect
      e roundRect#5@170x80 개선|Improve`, `
      a -> b
      b -> c
      c -> d
      d -> e
      e -> a`, { spacing: 80 }),
    'nps-report': Dash('sequence', `
      chartGauge@260x150 NPS +42
      chartKpi@240x100#1 추천~61%|Promoters~61%
      chartKpi@240x100#2 비추천~19%|Detractors~19%
      --
      chartLine@460x220 월별 NPS|NPS by month
      chartBarH@420x220 주요 의견|Top comments`),
    'inventory-dashboard': Dash('integral', `
      chartKpi@240x100#1 재고 품목~1,240|Items~1,240
      chartKpi@240x100#4 품절 임박~18|Running low~18
      chartKpi@240x100#3 회전율~6.2|Turnover~6.2
      --
      chartStacked@460x240 창고별 재고|Stock by warehouse
      chartTable@420x140 발주 필요|To reorder`),
    'night-light': P('chalkboard', ['electrical', 'logic'], `
      v logicVcc 160 140 5 V
      ldr elecVarResistor 360 150 조도 센서|Light sensor
      q transistor 600 140 트랜지스터|Transistor
      led elecLed 820 160 LED
      g ground 820 420 접지|Ground`, `
      v == ldr
      ldr == q
      q == led
      led == g`, { note: '어두워지면 센서 저항이 커져 LED가 켜집니다.|In the dark the sensor resistance rises and the LED lights.' }),
    'alarm-logic': G('office', ['logic', 'electrical'], 'flowLR', `
      d switchElec 문 센서|Door sensor
      m switchElec 동작 감지|Motion sensor
      or logicOr@120x70 OR
      arm switchElec 경비 설정|Armed
      and logicAnd@120x70 AND
      bz elecBuzzer 경보|Alarm`, `
      d -> or
      m -> or
      or -> and
      arm -> and
      and -> bz`, { spacing: 70 }),
    'pump-station': G('blueprint', ['process'], 'flowLR', `
      w pidTankOpen 취수정|Intake well
      f pidFilter 스크린|Screen
      p1 pidPump P-501
      p2 pidPump P-502 (예비)|P-502 (standby)
      v pidValveCheck 역류 방지|Check valve
      t pidTank 배수지|Reservoir
      lv pidInstrument LT`, `
      w -> f
      f -> p1
      f --> p2
      p1 -> v
      p2 --> v
      v -> t
      t --> lv`, { spacing: 60 }),
    'welding-cell': P('slice', ['factory', 'callouts'], `
      in facConveyor 60 320 180x56 투입|Infeed
      r1 facRobot 330 160 로봇 1|Robot 1
      r2 facRobot 330 460 로봇 2|Robot 2
      jig facStation 560 300 용접 지그|Welding jig
      ins facInspect 800 300 용접 검사|Weld check
      out facBuffer 960 300 완성|Done
      hmi facHmi 560 560 작업자 패널|Operator panel`, `
      in -> jig
      r1 --> jig
      r2 --> jig
      jig -> ins
      ins -> out`),
    'blood-donation': G('radiance', ['medical', 'flowchart'], 'flowTB', `
      a medPatient 접수|Check in
      q medChart 문진|Questionnaire
      t medStethoscope 혈압·빈혈 검사|Blood pressure, iron
      d decision#4@150x90 헌혈 가능?|Fit to give?
      b medBed 헌혈 (10분)|Donate (10 min)
      r process 휴식·간식|Rest, snack
      n display 다음에 다시|Come back later`, `
      a -> q
      q -> t
      t -> d
      d -> b 예|Yes
      d -> n 아니요|No
      b -> r`, { spacing: 45 }),
    'library-visit': G('facet', ['education', 'flowchart'], 'flowTB', `
      a eduStudent 입장|Come in
      s process 검색대에서 찾기|Search the catalogue
      d decision#4@150x90 서가에~있음?|On the shelf?
      b eduBook 책 꺼내기|Take the book
      h process 예약 신청|Place a hold
      c process 대출|Borrow
      e terminator#6 퇴장|Leave`, `
      a -> s
      s -> d
      d -> b 예|Yes
      d -> h 아니요|No
      b -> c
      c -> e
      h -> e`, { spacing: 45 }),
    'subway-transfer': P('midnight', ['maps', 'transport'], `
      a trStation 140 360 시청|City Hall
      b trStation 400 360 환승역|Interchange
      c trStation 700 360 강변|Riverside
      d trStation 400 140 북부|North
      e trStation 400 600 남부|South
      f trStation 960 360 공항|Airport
      . trTrain 640 520 120x60 2호선|Line 2`, `
      a -> b 1호선|Line 1
      b -> c 1호선|Line 1
      c -> f 1호선|Line 1
      d -> b 2호선|Line 2
      b -> e 2호선|Line 2`),
    'evacuation-map': P('linear', ['floor', 'maps', 'basic'], `
      . room 60 90 1000x640
      . room 60 90 320x300 사무실 A|Office A
      . room 740 90 320x300 사무실 B|Office B
      . room 60 430 320x300 회의실|Meeting room
      . stairs 500 120 120x160 계단|Stairs
      x1 mapPin 520 640 비상구|Exit
      x2 mapPin 980 640 비상구|Exit
      you mapPin 560 400 현재 위치|You are here
      . mapCompass 980 110`, `
      you -> x1 대피|evacuate
      you -> x2 대피|evacuate`, { note: '엘리베이터를 쓰지 말고 계단으로 내려가세요.|Do not use the lifts: take the stairs.' }),
  };
}
