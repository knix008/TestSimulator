// Sample data: three realistic projects with ~60 days of history, in English or Korean.
//
//   createSamples(core, { language: 'en' | 'ko', user?, now?, seed? })
//     → { projects: [{ id, key, name, boardId, issueCount }], users: [...] }
//
// Everything goes through the services with a controllable clock (ctx.now), so issue_history, comments and
// work logs carry realistic timestamps spread over the last 60 days and the reports (CFD, control chart,
// throughput, version burn-up) look real. Output is deterministic for a given seed (except `now`).
//
// IconRefs used: built-in b:rocket b:bug b:target b:lightning b:trophy b:shield b:globe b:code b:user b:flag
// b:clock b:star b:chart b:calendar b:cloud b:heart b:lock b:gear b:fire (several tinted, b:<name>#rrggbb),
// emoji e:…, letter avatars l:…, and one uploaded SVG (u:…).

const DAY = 86400000;
const HOUR = 3600000;

/** Seeded PRNG (mulberry32). */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const TEAM = {
  en: [['mia', 'Mia Chen', 'MC', '3b82f6'], ['liam', 'Liam Walker', 'LW', '10b981'], ['sofia', 'Sofia Rossi', 'SR', 'f59e0b'],
    ['noah', 'Noah Kim', 'NK', 'ef4444'], ['emma', 'Emma Davis', 'ED', '8b5cf6'], ['lucas', 'Lucas Brown', 'LB', '06b6d4']],
  ko: [['minjun', '김민준', '민준', '3b82f6'], ['seoyeon', '이서연', '서연', '10b981'], ['jiho', '박지호', '지호', 'f59e0b'],
    ['hayoon', '최하윤', '하윤', 'ef4444'], ['doyun', '정도윤', '도윤', '8b5cf6'], ['eunji', '강은지', '은지', '06b6d4']],
};

// ---- software project content ([type, en, ko, epic index | null, component index | null, labels]) ---------------
const EPICS = [
  ['Checkout redesign', '결제 화면 개편', '#7e4fd8', 'b:target#7e4fd8'],
  ['Search & discovery', '검색 및 탐색', '#1c7ed6', 'e:🔍'],
  ['Mobile performance', '모바일 성능 개선', '#e8590c', 'b:lightning#e8590c'],
  ['Loyalty program', '멤버십 포인트 제도', '#2b8a3e', 'b:trophy'],
  ['Platform security', '플랫폼 보안 강화', '#d0312d', 'b:shield#d0312d'],
];
const COMPONENTS = [
  ['Web', '웹 프론트엔드', 'b:globe', 'Shop website', '쇼핑몰 웹사이트'],
  ['API', 'API 서버', 'b:code', 'Backend services', '백엔드 서비스'],
  ['Mobile', '모바일 앱', 'e:📱', 'iOS and Android apps', 'iOS·안드로이드 앱'],
  ['Payments', '결제', null, 'Payment providers and billing', '결제 대행사와 청구'],
];
const ITEMS = [
  ['story', 'One-page checkout form', '한 페이지 결제 양식', 0, 0, ['checkout', 'ux']],
  ['story', 'Save multiple shipping addresses', '배송지 여러 개 저장', 0, 0, ['checkout']],
  ['story', 'Apple Pay and Google Pay support', '애플 페이·구글 페이 지원', 0, 3, ['payments']],
  ['task', 'Add order summary sidebar', '주문 요약 사이드바 추가', 0, 0, ['ux']],
  ['bug', 'Coupon code is applied twice', '쿠폰 코드가 두 번 적용됨', 0, 3, ['payments']],
  ['story', 'Guest checkout without account', '회원가입 없이 비회원 주문', 0, 0, ['checkout']],
  ['bug', 'Card form loses focus on iOS', 'iOS에서 카드 입력란 포커스가 사라짐', 0, 2, ['ios']],
  ['task', 'A/B test the new checkout button', '새 결제 버튼 A/B 테스트', 0, 0, ['experiment']],
  ['story', 'Show delivery estimate before payment', '결제 전에 예상 배송일 표시', 0, 1, ['checkout']],
  ['story', 'Autocomplete in the search box', '검색창 자동 완성', 1, 0, ['search', 'ux']],
  ['story', 'Filter by price range', '가격대 필터', 1, 0, ['search']],
  ['task', 'Reindex the catalog nightly', '매일 밤 상품 색인 재생성', 1, 1, ['search', 'ops']],
  ['bug', 'Search returns out-of-stock items first', '품절 상품이 먼저 검색됨', 1, 1, ['search']],
  ['story', 'Typo tolerant search', '오타를 허용하는 검색', 1, 1, ['search']],
  ['story', 'Recently viewed products', '최근 본 상품', 1, 2, ['mobile']],
  ['task', 'Search analytics dashboard', '검색 분석 대시보드', 1, 1, ['analytics']],
  ['bug', 'Korean queries are split wrongly', '한글 검색어 형태소 분리 오류', 1, 1, ['search', 'i18n']],
  ['story', 'Lazy-load product images', '상품 이미지 지연 로딩', 2, 2, ['performance']],
  ['task', 'Reduce the app bundle size', '앱 번들 크기 줄이기', 2, 2, ['performance']],
  ['bug', 'Home screen freezes on old Android phones', '구형 안드로이드에서 홈 화면 멈춤', 2, 2, ['android']],
  ['story', 'Offline cart', '오프라인 장바구니', 2, 2, ['mobile']],
  ['task', 'Profile the app startup time', '앱 시작 시간 측정', 2, 2, ['performance']],
  ['bug', 'Memory leak in the product gallery', '상품 갤러리 메모리 누수', 2, 2, ['performance']],
  ['task', 'Enable HTTP/2 on the CDN', 'CDN에 HTTP/2 적용', 2, 1, ['ops']],
  ['story', 'Earn points on every order', '주문마다 포인트 적립', 3, 1, ['loyalty']],
  ['story', 'Points balance in the profile', '프로필에 포인트 잔액 표시', 3, 0, ['loyalty']],
  ['story', 'Redeem points at checkout', '결제 시 포인트 사용', 3, 3, ['loyalty', 'checkout']],
  ['task', 'Points expiry batch job', '포인트 소멸 배치 작업', 3, 1, ['loyalty']],
  ['story', 'Birthday coupon email', '생일 쿠폰 이메일', 3, 1, ['loyalty']],
  ['bug', 'Points shown with wrong decimals', '포인트 소수점이 잘못 표시됨', 3, 0, ['loyalty']],
  ['story', 'Two-factor login', '2단계 로그인 인증', 4, 0, ['security']],
  ['task', 'Rotate API keys', 'API 키 교체', 4, 1, ['security', 'ops']],
  ['bug', 'Session not expired after a password change', '비밀번호 변경 후 세션이 만료되지 않음', 4, 1, ['security']],
  ['task', 'Dependency vulnerability scan', '의존성 취약점 점검', 4, 1, ['security']],
  ['story', 'Login rate limiting', '로그인 시도 횟수 제한', 4, 1, ['security']],
  ['task', 'Security headers on the website', '웹 보안 헤더 적용', 4, 0, ['security']],
  ['task', 'Update the privacy policy page', '개인정보 처리방침 페이지 갱신', null, 0, ['legal']],
  ['bug', 'Footer links broken on Safari', '사파리에서 하단 링크 깨짐', null, 0, ['safari']],
  ['task', 'Upgrade the Node runtime', 'Node 런타임 업그레이드', null, 1, ['ops']],
  ['task', 'Clean up old feature flags', '사용하지 않는 기능 플래그 정리', null, 1, ['tech-debt']],
  ['bug', 'Wrong currency symbol in emails', '이메일의 통화 기호 오류', null, 1, ['i18n']],
  ['story', 'Dark mode for the web shop', '웹 쇼핑몰 다크 모드', null, 0, ['ux']],
  ['task', 'Onboarding guide for new developers', '신규 개발자 온보딩 가이드 작성', null, null, ['docs']],
  ['bug', 'Duplicate order confirmation emails', '주문 확인 메일이 중복 발송됨', null, 1, ['email']],
  ['task', 'Prepare the 1.2 release notes', '1.2 릴리스 노트 준비', null, null, ['docs']],
];
const SUBTASKS = [
  ['Design review', '디자인 검토'], ['Implement the API endpoint', 'API 엔드포인트 구현'], ['Write unit tests', '단위 테스트 작성'],
  ['QA on Android', '안드로이드 QA'], ['QA on iOS', 'iOS QA'], ['Update the documentation', '문서 업데이트'],
];
const SUBTASK_PARENTS = [0, 2, 9, 24, 30]; // two subtasks each
const LINKS = [[30, 34, 'blocks'], [9, 13, 'relates'], [19, 22, 'relates'], [2, 26, 'blocks'], [43, 4, 'relates'], [16, 12, 'relates']];
const COMMENTS = [
  ['I can take this one after the current task.', '지금 작업 끝나면 제가 맡을게요.'],
  ['@{u} could you check the design for this?', '@{u} 이거 디자인 한번 봐 주실 수 있나요?'],
  ['Reproduced on staging. Logs are attached in the channel.', '스테이징에서 재현했습니다. 로그는 채널에 올려 두었어요.'],
  ['The first version is ready for review.', '첫 번째 버전 검토 준비됐습니다.'],
  ['Looks good to me. Merging after the tests pass.', '좋아 보입니다. 테스트 통과하면 병합할게요.'],
  ['We should split this into smaller pieces.', '조금 더 작은 단위로 나누는 게 좋겠어요.'],
  ['@{u} this blocks the release, can we prioritise it?', '@{u} 이게 릴리스를 막고 있어요. 우선순위 올릴 수 있을까요?'],
  ['Customer support reported this again today.', '고객 지원팀에서 오늘 또 문의가 들어왔습니다.'],
  ['Added screenshots and the steps to reproduce.', '스크린샷과 재현 순서를 추가했습니다.'],
];
const CRITERIA = [
  [['Works on desktop and mobile', 'Covered by automated tests', 'Reviewed by the product owner'], ['데스크톱과 모바일에서 동작', '자동 테스트로 검증', '제품 책임자 검토 완료']],
  [['No regression in page load time', 'Errors are logged with context', 'Documented in the wiki'], ['페이지 로딩 시간 저하 없음', '오류는 맥락과 함께 기록', '위키에 문서화']],
  [['Feature flag allows a gradual rollout', 'Analytics events are sent', 'Copy is translated'], ['기능 플래그로 단계적 배포 가능', '분석 이벤트 전송', '문구 번역 완료']],
];

// ---- bug tracker content ---------------------------------------------------------------------------------------
const BUGS = [
  ['bug', 'Crash when opening a large file', '대용량 파일을 열면 프로그램이 종료됨', 0], ['bug', 'Login fails with an SSO account', 'SSO 계정으로 로그인 실패', 0],
  ['bug', 'Sync is stuck at 99%', '동기화가 99%에서 멈춤', 1], ['bug', 'Printer margins are ignored', '인쇄 여백 설정이 무시됨', 2],
  ['bug', 'Settings reset after an update', '업데이트 후 설정이 초기화됨', 3], ['bug', 'Dark theme text is unreadable', '다크 테마에서 글자가 잘 안 보임', 3],
  ['bug', 'Slow startup on HDD', 'HDD에서 시작이 느림', null], ['bug', 'Export to PDF cuts the last page', 'PDF 내보내기 시 마지막 페이지가 잘림', 2],
  ['bug', 'Notification sound plays twice', '알림음이 두 번 재생됨', 3], ['bug', 'Cannot paste images from the clipboard', '클립보드 이미지 붙여넣기 불가', null],
  ['bug', 'Wrong time zone in reports', '보고서 시간대 오류', null], ['bug', 'Sync conflict dialog appears every time', '동기화 충돌 창이 매번 뜸', 1],
  ['bug', 'Typo on the login page', '로그인 화면 오타', 0], ['bug', 'High CPU usage when idle', '유휴 상태에서 CPU 사용량 높음', null],
  ['bug', 'Keyboard shortcuts do not work on macOS', 'macOS에서 단축키가 동작하지 않음', 3], ['bug', 'Printing hangs with a network printer', '네트워크 프린터로 인쇄 시 멈춤', 2],
  ['bug', 'Search ignores accented letters', '검색에서 악센트 문자를 무시함', null], ['bug', 'Settings window too small on 4K screens', '4K 화면에서 설정 창이 너무 작음', 3],
  ['bug', 'Crash when opening a large file (again)', '대용량 파일 열기 시 종료 (재현)', 0], ['bug', 'Sync stops after sleep', '절전 후 동기화 중단', 1],
  ['improvement', 'Remember the last export folder', '마지막 내보내기 폴더 기억', 2], ['improvement', 'Show sync progress in the tray', '트레이에 동기화 진행률 표시', 1],
  ['improvement', 'Allow custom print headers', '인쇄 머리글 사용자 지정', 2], ['improvement', 'Faster login with a saved session', '세션 저장으로 빠른 로그인', 0],
  ['improvement', 'Larger default font option', '기본 글꼴 크게 옵션', 3],
];
const BUG_COMPONENTS = [['Login', '로그인', 'b:lock'], ['Sync', '동기화', 'b:cloud'], ['Printing', '인쇄', 'e:🖨️'], ['Settings', '설정', 'b:gear']];
const ENVIRONMENTS = ['Windows 11', 'macOS 15', 'Ubuntu 24.04', 'Android 15', 'iOS 18', 'Windows 10'];

// ---- personal board content ------------------------------------------------------------------------------------
const CHORES = [
  ['Buy groceries', '장보기', 'e:🛒', [['Milk', '우유'], ['Eggs', '달걀'], ['Apples', '사과'], ['Bread', '빵']]],
  ['Pay the electricity bill', '전기 요금 납부', 'e:💡', null],
  ['Book a dentist appointment', '치과 예약', 'e:🦷', null],
  ["Read chapter 5 of 'Clean Code'", "'클린 코드' 5장 읽기", 'e:📚', null],
  ['Fix the leaking kitchen tap', '부엌 수도꼭지 누수 고치기', 'e:🔧', [['Buy a washer', '고무 패킹 구입'], ['Turn off the water', '수도 밸브 잠그기']]],
  ['Plan the weekend hiking trip', '주말 등산 계획', 'e:⛰️', [['Check the weather', '날씨 확인'], ['Pack lunch', '도시락 준비'], ['Charge the phone', '휴대폰 충전']]],
  ['Renew the passport', '여권 갱신', 'e:🛂', null],
  ['Learn 20 Spanish words', '스페인어 단어 20개 외우기', 'e:🗣️', null],
  ['Clean the garage', '차고 청소', 'e:🧹', null],
  ['Call grandma', '할머니께 전화', 'b:heart#e64980', null],
  ['Back up the family photos', '가족 사진 백업', 'b:cloud', [['Copy to the NAS', 'NAS에 복사'], ['Upload to the cloud', '클라우드에 업로드']]],
  ['Water the plants', '화분에 물 주기', 'e:🪴', null],
];

const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" fill="#7e4fd8"/><path d="M7 12h10M12 7v10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';

/**
 * @param {object} core from createCore
 * @param {{ language?: 'en'|'ko', user?: { id: string }|null, now?: number, seed?: number }} [opts]
 */
export async function createSamples(core, { language = 'en', user = null, now = Date.now(), seed = 1 } = {}) {
  const ko = language === 'ko';
  const L = (en, k) => (ko ? k : en);
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const S = core.services;
  const db = core.db;

  let admin = user?.id ? await db.get('SELECT * FROM "users" WHERE "id" = ?', [user.id]) : null;
  if (!admin) admin = await S.users.ensureLocalUser();
  const clock = { t: now };
  const ctxFor = (u) => ({ system: true, user: { id: (u || admin).id, role: (u || admin).role || 'user', username: (u || admin).username }, now: () => Math.round(clock.t) });
  const ctx = ctxFor(admin);
  const start = startOfDay(now) - 60 * DAY;

  // ---- users -----------------------------------------------------------------------------------------------
  clock.t = start - 2 * DAY;
  const team = [];
  for (const [username, name, letters, color] of TEAM[ko ? 'ko' : 'en']) {
    let row = await db.get('SELECT * FROM "users" WHERE "username" = ?', [username]);
    if (!row) {
      const u = await S.users.create(ctx, { username, displayName: name, email: `${username}@example.com`, avatar: `l:${letters}#${color}`, role: 'user' });
      row = await db.get('SELECT * FROM "users" WHERE "id" = ?', [u.id]);
    }
    team.push(row);
  }
  const people = [admin, ...team];
  const mention = () => pick(team).username;

  async function freeKey(base) {
    let k = base;
    for (let n = 2; await db.get('SELECT "id" FROM "projects" WHERE "key" = ?', [k]); n++) k = `${base}${n}`;
    return k;
  }
  async function addMembers(projectId) {
    for (const u of team) await S.projects.setMember(ctx, projectId, { userId: u.id, role: 'member' });
  }
  const priorities = await db.select('priorities', {}, { order: 'position' });
  const prio = (name) => priorities.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id || priorities[Math.floor(priorities.length / 2)]?.id;
  const randomPriority = (bias = 0) => {
    const r = rnd() - bias;
    return prio(r < 0.06 ? 'Highest' : r < 0.3 ? 'High' : r < 0.75 ? 'Medium' : r < 0.94 ? 'Low' : 'Lowest');
  };
  const resolutions = await db.select('resolutions', {}, { order: 'position' });
  const resolution = (name) => resolutions.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id || resolutions[0]?.id;

  /** Create an issue as `by` at time `at`. */
  async function make(body, at, by) { clock.t = at; return S.issues.create(ctxFor(by), body); }
  async function move(issueId, statusId, at, by, extra = {}) { clock.t = at; return S.issues.transition(ctxFor(by), issueId, { statusId, ...extra }); }
  async function comment(issueId, at, by, text) { clock.t = at; return S.comments.add(ctxFor(by), issueId, { body: text }); }
  const commentText = () => { const [en, k] = pick(COMMENTS); return L(en, k).replace('{u}', mention()); };
  const description = (summary) => {
    const [en, k] = pick(CRITERIA);
    return L(`## Goal\n${summary}.\n\n### Acceptance criteria\n${en.map((x) => `- ${x}`).join('\n')}`,
      `## 목표\n${summary}.\n\n### 완료 조건\n${k.map((x) => `- ${x}`).join('\n')}`);
  };

  const uploaded = await S.icons.create(ctx, { name: 'sample-logo', data: Buffer.from(LOGO_SVG).toString('base64') });
  const results = [];

  // =========================================================================================================
  // 1. Software team Kanban
  // =========================================================================================================
  {
    clock.t = start - DAY;
    const key = await freeKey('SHOP');
    const typeNames = ko ? { epic: '에픽', story: '스토리', task: '작업', bug: '버그', subtask: '하위 작업' } : {};
    const p = await S.projects.create(ctx, {
      key, name: L('Online Shop App', '온라인 쇼핑몰 앱'), template: 'software', icon: 'b:rocket#1c7ed6', color: '#1c7ed6',
      description: L('Web shop and mobile apps of the **commerce team**.', '**커머스 팀**의 웹 쇼핑몰과 모바일 앱입니다.'),
      names: ko ? { statuses: ['백로그', '할 일', '진행 중', '검토 중', '완료'], types: typeNames, columns: ['백로그', '할 일', '진행 중', '검토 중', '완료'], board: `${key} 보드` } : {},
    });
    await addMembers(p.id);
    const cfg = await S.projects.config(ctx, p.id);
    const type = (level, name) => cfg.types.find((t) => (name ? t.name === name : t.level === level));
    const T = {
      epic: type(-1), story: type(0, typeNames.story || 'Story'), task: type(0, typeNames.task || 'Task'), bug: type(0, typeNames.bug || 'Bug'), subtask: type(1),
    };
    const st = cfg.statuses; // Backlog, To Do, In Progress, In Review, Done (by position)

    const comps = [];
    for (const [en, k, icon, den, dko] of COMPONENTS) {
      comps.push(await S.components.create(ctx, p.id, { name: L(en, k), description: L(den, dko), icon: icon || uploaded.ref, leadId: pick(team).id }));
    }
    const versions = [
      await S.versions.create(ctx, p.id, { name: '1.0', description: L('First public release', '첫 공개 버전'), startDate: ymd(start - 30 * DAY), releaseDate: ymd(now - 45 * DAY), released: true }),
      await S.versions.create(ctx, p.id, { name: '1.1', description: L('Checkout and search improvements', '결제·검색 개선'), startDate: ymd(now - 45 * DAY), releaseDate: ymd(now - 15 * DAY), released: true }),
      await S.versions.create(ctx, p.id, { name: '1.2', description: L('Loyalty program and security', '멤버십과 보안 강화'), startDate: ymd(now - 15 * DAY), releaseDate: ymd(now + 20 * DAY) }),
    ];
    const impact = await S.fields.create(ctx, p.id, { name: L('Customer impact', '고객 영향'), type: 'select', options: ko ? ['낮음', '보통', '높음', '심각'] : ['Low', 'Medium', 'High', 'Critical'] });
    const value = await S.fields.create(ctx, p.id, { name: L('Business value', '비즈니스 가치'), type: 'number' });
    const impactValues = impact.options.map((o) => o.value);

    // --- plans ---------------------------------------------------------------------------------------------
    // dwell ranges (days) to reach status i from the previous one
    const DWELL = [null, [0.3, 5], [0.2, 4], [0.5, 4], [0.2, 2.5]];
    const steps = (created, target, fixed = null) => {
      const out = [];
      let t = created;
      for (let s = 1; s <= target; s++) {
        const [a, b] = fixed ? [fixed, fixed] : DWELL[s];
        t += between(a, b) * DAY;
        if (t > now - HOUR) break;
        out.push([s, t]);
      }
      return out;
    };
    const plans = [];
    EPICS.forEach(([en, k, color, icon], i) => {
      const created = start + i * 0.4 * DAY + 2 * HOUR;
      const path = i === 4 ? [] : i === 3 ? [[1, created + 3 * DAY]] : [[1, created + 2 * DAY], [2, created + (6 + i * 3) * DAY]];
      if (i === 0) path.push([4, now - 4 * DAY]); // the checkout epic is finished
      plans.push({ kind: 'epic', i, created, path, body: { typeId: T.epic.id, summary: L(en, k), color, icon, description: description(L(en, k)), priorityId: prio('High') } });
    });
    const n = ITEMS.length;
    ITEMS.forEach(([t, en, k, epic, comp, labels], i) => {
      const forced = i >= n - 6;
      const created = forced ? now - (9 - (i - (n - 6))) * DAY - between(1, 8) * HOUR : start + 3 * DAY + (i / (n - 6)) * 47 * DAY + between(0, 1.5) * DAY;
      let path;
      if (forced) path = steps(created, [1, 2, 2, 3, 3, 1][i - (n - 6)], 1);
      else {
        const r = rnd();
        const target = r < 0.6 ? 4 : r < 0.7 ? 3 : r < 0.82 ? 2 : r < 0.9 ? 1 : 0;
        path = steps(created, target);
        if ((i === 5 || i === 17) && path.length === 4) { // reopened: done → in progress → done
          const d = path[3][1];
          if (d + 3 * DAY < now) path.push([2, d + DAY], [4, d + 2.5 * DAY]);
        }
      }
      plans.push({ kind: 'item', i, t, created, path, epic, comp, labels, summary: L(en, k) });
    });
    for (const [j, pi] of SUBTASK_PARENTS.entries()) {
      const parent = plans.find((x) => x.kind === 'item' && x.i === pi);
      const pFinal = parent.path.length ? parent.path[parent.path.length - 1][0] : 0;
      for (let s = 0; s < 2; s++) {
        const created = parent.created + (0.2 + s * 0.3) * DAY;
        const target = pFinal >= 3 ? 4 : pFinal === 2 ? (s === 0 ? 4 : 2) : 1;
        const [en, k] = SUBTASKS[(j * 2 + s) % SUBTASKS.length];
        plans.push({ kind: 'sub', parent, created, path: steps(created, target, 0.8 + s * 0.6), summary: L(en, k) });
      }
    }
    plans.sort((a, b) => a.created - b.created);

    // --- execute ---------------------------------------------------------------------------------------------
    const statusAt = (path, idx) => (idx >= 0 ? st[path[idx][0]] : st[0]);
    for (const pl of plans) {
      const assignee = pl.kind === 'epic' ? pick(team) : rnd() < 0.2 ? admin : rnd() < 0.08 ? null : pick(team);
      const reporter = pick(people);
      const final = pl.path.length ? pl.path[pl.path.length - 1] : null;
      const done = final && final[0] === 4;
      let body;
      if (pl.kind === 'epic') body = { ...pl.body, assigneeId: assignee.id, reporterId: admin.id };
      else {
        const item = pl.kind === 'item';
        const t = item ? pl.t : 'subtask';
        const pts = item && t !== 'bug' ? pick([1, 2, 3, 3, 5, 5, 8, 13]) : item ? pick([1, 2, 3]) : null;
        let fixVersionIds;
        if (done) fixVersionIds = [final[1] < now - 45 * DAY ? versions[0].id : final[1] < now - 15 * DAY ? versions[1].id : versions[2].id];
        else if (item && rnd() < 0.6) fixVersionIds = [versions[2].id];
        body = {
          typeId: T[t].id, summary: pl.summary, assigneeId: assignee?.id ?? null, reporterId: reporter.id,
          priorityId: t === 'bug' ? randomPriority(0.15) : randomPriority(), storyPoints: pts,
          originalEstimate: pts ? pts * 4 * 3600 : item ? null : 2 * 3600,
        };
        if (item) {
          body.description = description(pl.summary);
          body.labels = ko ? pl.labels : pl.labels;
          if (pl.comp != null) body.componentIds = [comps[pl.comp].id];
          if (fixVersionIds) body.fixVersionIds = fixVersionIds;
          if (pl.epic != null) body.epicId = plans.find((x) => x.kind === 'epic' && x.i === pl.epic).issue.id;
          const custom = {};
          if (rnd() < 0.6) custom[impact.id] = t === 'bug' ? pick(impactValues.slice(1)) : pick(impactValues);
          if (t === 'story') custom[value.id] = pick([10, 20, 40, 60, 80, 100]);
          if (Object.keys(custom).length) body.custom = custom;
          if (rnd() < 0.35) body.dueDate = ymd(pl.created + between(5, 25) * DAY);
          if (pl.i % 9 === 4) body.checklist = [[L('Write the spec', '명세 작성'), true], [L('Implement', '구현'), done], [L('Test on staging', '스테이징 테스트'), done], [L('Release', '배포'), false]].map(([text, d]) => ({ text, done: d }));
          if (pl.i % 11 === 3) body.cover = { color: pick(['#ffd43b', '#74c0fc', '#b2f2bb']) };
          if (pl.i % 13 === 6) body.color = '#ff8787';
          if (t === 'bug' && pl.i % 3 === 0) body.icon = 'e:🔥';
          else if (pl.i % 10 === 1) body.icon = 'b:star#f59f00';
        } else {
          body.parentId = pl.parent.issue.id;
        }
      }
      const issue = await make({ projectId: p.id, ...body }, pl.created, reporter);
      pl.issue = issue;
      // workflow steps
      for (const [sIdx, at] of pl.path) await move(issue.id, st[sIdx].id, at, assignee || admin);
      // flag a few items that are currently in progress
      const cur = statusAt(pl.path, pl.path.length - 1);
      if (pl.kind === 'item' && cur.category === 'inprogress' && rnd() < 0.35) {
        clock.t = now - between(2, 20) * HOUR;
        await S.issues.update(ctxFor(assignee || admin), issue.id, { flagged: true });
      }
      // work logs while in progress
      const inProg = pl.path.find(([s]) => s === 2);
      if (inProg && pl.kind !== 'epic') {
        const next = pl.path.find(([s, at]) => at > inProg[1] && s !== 2);
        const endAt = next ? next[1] : now - HOUR;
        for (let w = 0; w < (rnd() < 0.5 ? 1 : 2); w++) {
          const startedAt = between(inProg[1], endAt);
          clock.t = Math.min(startedAt + 2 * HOUR, now - HOUR);
          await S.worklogs.add(ctxFor(assignee || admin), issue.id, { seconds: Math.round(between(1, 6)) * 3600, startedAt: Math.round(startedAt), comment: L('Development', '개발 작업') });
        }
      }
      // comments
      if (pl.kind !== 'sub' && rnd() < 0.5) {
        const last = final ? final[1] : pl.created + DAY;
        for (let c = 0; c < 1 + Math.floor(rnd() * 3); c++) {
          await comment(issue.id, Math.min(between(pl.created + HOUR, last + DAY), now - HOUR), pick(people), commentText());
        }
      }
      if (pl.kind === 'item' && rnd() < 0.3) {
        clock.t = Math.min(pl.created + HOUR, now - HOUR);
        await S.watchers.add(ctx, issue.id, { userId: pick(team).id });
      }
    }
    const byIndex = (i) => plans.find((x) => x.kind === 'item' && x.i === i).issue;
    for (const [a, b, kind] of LINKS) {
      const ia = plans.find((x) => x.kind === 'item' && x.i === a);
      const ib = plans.find((x) => x.kind === 'item' && x.i === b);
      clock.t = Math.min(Math.max(ia.created, ib.created) + 2 * HOUR, now - HOUR);
      await S.links.add(ctx, byIndex(a).id, { targetId: byIndex(b).id, kind });
    }

    // --- board, filters, dashboard, automation (now) -----------------------------------------------------------
    clock.t = now - HOUR;
    const bugName = T.bug.name;
    await S.boards.update(ctx, p.boardId, { settings: { swimlanes: 'epic', cardColors: 'queries', cardFields: ['priority', 'storyPoints', 'dueDate'] } });
    for (const [en, k, jql, icon] of [
      ['My issues', '내 이슈', 'assignee = currentUser()', 'b:user'],
      ['Bugs', '버그', `type = "${bugName}"`, 'b:bug#e03e2d'],
      ['Flagged', '플래그', 'flagged = true', 'b:flag#f59f00'],
      ['Due soon', '마감 임박', 'due <= "7d" AND resolution IS EMPTY', 'b:clock'],
    ]) await S.boards.quickFilters.create(ctx, p.boardId, { name: L(en, k), jql, icon });
    for (const [jql, color] of [['priority in (Highest, High)', '#ffa8a8'], [`type = "${bugName}"`, '#ffd8a8'], ['flagged = true', '#ffec99']]) {
      await S.boards.cardColors.create(ctx, p.boardId, { jql, color });
    }
    await S.filters.create(ctx, { name: L('Open bugs', '열린 버그'), jql: `project = ${key} AND type = "${bugName}" AND resolution IS EMPTY ORDER BY priority DESC`, shared: true, favourite: true, icon: 'b:bug' });
    await S.filters.create(ctx, { name: L('Updated this week', '이번 주 변경'), jql: `project = ${key} AND updated >= "-7d" ORDER BY updated DESC`, shared: false, favourite: true, icon: 'b:calendar' });
    await S.dashboards.create(ctx, {
      name: L('Team overview', '팀 현황'), icon: 'b:chart#1c7ed6', shared: true,
      layout: {
        columns: 2,
        gadgets: [
          { type: 'cfd', config: { boardId: p.boardId }, col: 0, row: 0 },
          { type: 'control', config: { boardId: p.boardId }, col: 1, row: 0 },
          { type: 'pie', config: { jql: `project = ${key} AND resolution IS EMPTY`, field: 'assignee' }, col: 0, row: 1 },
          { type: 'createdVsResolved', config: { projectId: p.id }, col: 1, row: 1 },
          { type: 'assignedToMe', config: {}, col: 0, row: 2 },
          { type: 'version', config: { versionId: versions[2].id }, col: 1, row: 2 },
        ],
      },
    });
    await S.automation.create(ctx, p.id, {
      name: L('New bugs get high priority', '새 버그는 높은 우선순위'),
      trigger: { type: 'issue.created' }, conditions: [{ jql: `type = "${bugName}" AND priority < High` }],
      actions: [{ type: 'setField', field: 'priorityId', value: prio('High') }],
    });
    await S.automation.create(ctx, p.id, {
      name: L('Thank the team when done', '완료되면 감사 댓글'),
      trigger: { type: 'issue.transitioned', toStatusId: st[4].id }, conditions: [],
      actions: [{ type: 'comment', body: L('{{issue.key}} is done. Thank you {{user.name}}!', '{{issue.key}} 완료! 수고하셨습니다, {{user.name}} 님.') }],
    });
    results.push({ id: p.id, key, name: p.name, boardId: p.boardId });
  }

  // =========================================================================================================
  // 2. Bug tracker
  // =========================================================================================================
  {
    clock.t = start - DAY;
    const key = await freeKey('BUG');
    const typeNames = ko ? { bug: '버그', improvement: '개선', task: '작업', subtask: '하위 작업' } : {};
    const p = await S.projects.create(ctx, {
      key, name: L('Customer Bug Tracker', '고객 버그 접수'), template: 'bugs', icon: 'b:bug#e03e2d', color: '#e03e2d',
      description: L('Bugs and improvement requests reported by customers of the **desktop app**.', '**데스크톱 앱** 고객이 보고한 버그와 개선 요청입니다.'),
      names: ko ? { statuses: ['열림', '진행 중', '해결됨', '종료'], types: typeNames, columns: ['열림', '진행 중', '해결됨', '종료'], board: `${key} 보드` } : {},
    });
    await addMembers(p.id);
    const cfg = await S.projects.config(ctx, p.id);
    const T = { bug: cfg.types.find((t) => t.name === (typeNames.bug || 'Bug')), improvement: cfg.types.find((t) => t.name === (typeNames.improvement || 'Improvement')) };
    const st = cfg.statuses; // Open, In Progress, Resolved, Closed
    const comps = [];
    for (const [en, k, icon] of BUG_COMPONENTS) comps.push(await S.components.create(ctx, p.id, { name: L(en, k), icon }));
    const versions = [
      await S.versions.create(ctx, p.id, { name: '2.3', releaseDate: ymd(now - 50 * DAY), released: true }),
      await S.versions.create(ctx, p.id, { name: '2.4', releaseDate: ymd(now - 20 * DAY), released: true }),
      await S.versions.create(ctx, p.id, { name: '2.5', releaseDate: ymd(now + 25 * DAY) }),
    ];
    const env = await S.fields.create(ctx, p.id, { name: L('Environment', '환경'), type: 'text' });
    const issues = [];
    for (const [i, [t, en, k, comp]] of BUGS.entries()) {
      const created = start + 5 * DAY + (i / BUGS.length) * 52 * DAY + between(0, 1) * DAY;
      const reporter = pick(people);
      const assignee = rnd() < 0.15 ? null : pick(team);
      const body = {
        projectId: p.id, typeId: T[t].id, summary: L(en, k), description: L(`### Steps to reproduce\n1. Open the app\n2. ${en}\n\n**Expected:** it works.`, `### 재현 순서\n1. 앱을 엽니다\n2. ${k}\n\n**기대 결과:** 정상 동작.`),
        priorityId: t === 'bug' ? randomPriority(0.2) : prio(pick(['Medium', 'Low'])), assigneeId: assignee?.id ?? null, reporterId: reporter.id,
        affectedVersionIds: t === 'bug' ? [created < now - 20 * DAY ? versions[0].id : versions[1].id] : [],
        componentIds: comp != null ? [comps[comp].id] : [], custom: t === 'bug' ? { [env.id]: pick(ENVIRONMENTS) } : {},
        labels: t === 'bug' && rnd() < 0.3 ? [L('customer', '고객')] : [],
      };
      if (i === 0) body.icon = 'e:💥';
      const issue = await make(body, created, reporter);
      issues.push(issue);
      const by = assignee || admin;
      if (i === 16 || i === 24) { // Won't Do
        await move(issue.id, st[2].id, Math.min(created + between(1, 4) * DAY, now - HOUR), admin, { resolutionId: resolution("Won't Do"), comment: L('This works as designed.', '의도된 동작입니다.') });
        continue;
      }
      if (i === 18 || i === 11) { // duplicates
        const original = i === 18 ? issues[0] : issues[2];
        clock.t = Math.min(created + 3 * HOUR, now - HOUR);
        await S.links.add(ctx, issue.id, { targetId: original.id, kind: 'duplicates' });
        await move(issue.id, st[2].id, Math.min(created + 5 * HOUR, now - HOUR), admin, { resolutionId: resolution('Duplicate') });
        continue;
      }
      const r = rnd();
      const target = r < 0.3 ? 3 : r < 0.55 ? 2 : r < 0.75 ? 1 : 0;
      let t2 = created;
      for (let s = 1; s <= target; s++) {
        t2 += between(0.5, s === 1 ? 6 : 4) * DAY;
        if (t2 > now - HOUR) break;
        await move(issue.id, st[s].id, t2, by, s === 2 ? { resolutionId: resolution('Done') } : {});
        if (s === 2) {
          clock.t = t2;
          await S.issues.update(ctxFor(by), issue.id, { fixVersionIds: [t2 < now - 20 * DAY ? versions[1].id : versions[2].id] });
        }
      }
      if (rnd() < 0.4) await comment(issue.id, Math.min(created + between(2, 30) * HOUR, now - HOUR), pick(people), commentText());
      for (const u of team) if (u.id !== reporter.id && rnd() < 0.2) { clock.t = Math.min(created + DAY, now - HOUR); await S.votes.vote(ctxFor(u), issue.id); }
    }
    clock.t = now - HOUR;
    await S.boards.update(ctx, p.boardId, { settings: { swimlanes: 'priority', cardColors: 'priority' } });
    await S.boards.quickFilters.create(ctx, p.boardId, { name: L('Unassigned', '담당자 없음'), jql: 'assignee IS EMPTY', icon: 'b:user#868e96' });
    await S.boards.quickFilters.create(ctx, p.boardId, { name: L('Critical', '긴급'), jql: 'priority in (Highest, High)', icon: 'b:fire#e03e2d' });
    results.push({ id: p.id, key, name: p.name, boardId: p.boardId });
  }

  // =========================================================================================================
  // 3. Simple personal board
  // =========================================================================================================
  {
    clock.t = now - 22 * DAY;
    const key = await freeKey('HOME');
    const p = await S.projects.create(ctx, {
      key, name: L('My Home', '우리 집 할 일'), template: 'simple', icon: 'e:🏠', color: '#2b8a3e',
      description: L('Chores, errands and learning goals.', '집안일, 볼일, 공부 목표.'),
      names: ko ? { statuses: ['할 일', '하는 중', '완료'], types: { task: '작업', subtask: '하위 작업' }, columns: ['할 일', '하는 중', '완료'], board: `${key} 보드` } : {},
    });
    const cfg = await S.projects.config(ctx, p.id);
    const st = cfg.statuses;
    for (const [i, [en, k, icon, list]] of CHORES.entries()) {
      const created = now - (20 - i * 1.5) * DAY;
      const target = i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : i < 6 ? 2 : 0;
      const body = {
        projectId: p.id, summary: L(en, k), icon, assigneeId: admin.id,
        dueDate: i % 2 === 0 ? ymd(now + (i - 4) * DAY) : null,
        checklist: list ? list.map(([a, b], j) => ({ text: L(a, b), done: target === 2 || j === 0 })) : undefined,
        labels: i % 5 === 0 ? [L('weekend', '주말')] : [],
      };
      const issue = await make(body, created, admin);
      let t = created;
      for (let s = 1; s <= target; s++) {
        t += between(0.3, 2) * DAY;
        if (t > now - HOUR) break;
        await move(issue.id, st[s].id, t, admin);
      }
    }
    await S.boards.update(ctx, p.boardId, { settings: { doneHideDays: 30, cardColors: 'none', estimation: 'count' } });
    results.push({ id: p.id, key, name: p.name, boardId: p.boardId });
  }

  for (const r of results) r.issueCount = await db.count('issues', { project_id: r.id });
  return { projects: results, users: team.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar })) };
}
