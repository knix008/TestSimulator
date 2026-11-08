// Additional sample documents shown on the start screen (17 more, so each group has 10).
// Same shape as SAMPLES in samples.js.

const PROPOSAL = `# 사내 문서 검색 시스템 도입 제안서

작성: 플랫폼팀 · 2026년 11월

## 1. 배경

사내 위키, 공유 드라이브, 메신저에 흩어진 문서가 **3만 건**을 넘었습니다.
신규 입사자 설문에서 "필요한 문서를 찾기 어렵다"는 응답이 *68%* 였습니다.

## 2. 목표

1. 한 곳에서 모든 문서를 검색한다.
2. 검색 결과 첫 화면에서 원하는 문서를 찾는 비율을 80% 이상으로 올린다.
3. 권한이 없는 문서는 결과에 나타나지 않게 한다.

## 3. 범위

| 구분 | 포함 | 제외 |
|:-----|:-----|:-----|
| 원본 | 위키, 공유 드라이브 | 개인 메일함 |
| 형식 | Markdown, PDF, Office | 동영상 |
| 사용자 | 정규직, 계약직 | 외부 협력사 |

## 4. 일정

- [x] 요구 사항 정리 (10월)
- [ ] 시범 운영 — 개발팀 50명 (12월)
- [ ] 전사 확대 (2027년 2월)

## 5. 예산

| 항목 | 금액(만 원) |
|:-----|------:|
| 서버 | 1,200 |
| 라이선스 | 800 |
| 인건비 | 2,400 |
| **합계** | **4,400** |

> 시범 운영 결과가 목표에 못 미치면 전사 확대 전에 다시 검토합니다.

## 6. 기대 효과

- 문서 찾는 시간 하루 평균 **25분 → 10분**
- 같은 문서를 다시 만드는 일 감소
- 퇴사자 지식의 보존
`;

const RECIPE = `# Classic Kimchi Fried Rice

*Serves 2 · Prep 10 min · Cook 15 min*

A quick weeknight dish that turns leftover rice and well-fermented kimchi
into something special. Older, sour kimchi works best.

## Ingredients

| Ingredient | Amount | Note |
|:-----------|-------:|:-----|
| Cooked rice (day-old) | 2 cups | cold rice fries better |
| Kimchi, chopped | 1 cup | plus 2 tbsp of its juice |
| Pork belly or spam | 100 g | optional |
| Gochujang | 1 tbsp | |
| Soy sauce | 1 tsp | |
| Sesame oil | 1 tsp | add at the end |
| Eggs | 2 | for topping |
| Green onion | 1 stalk | sliced |

## Steps

1. Heat a pan over medium-high heat and cook the pork until crisp.
2. Add the kimchi and stir-fry for **3 minutes** until it softens.
3. Stir in gochujang, soy sauce and the kimchi juice.
4. Add the rice, breaking up clumps, and fry for 5 minutes.
5. Turn off the heat and drizzle with sesame oil.
6. Fry the eggs sunny-side up and place them on top.
7. Garnish with green onion and roasted seaweed.

## Tips

- Press the rice flat and leave it for a minute to get a crispy bottom.
- Too sour? Add a pinch of sugar.
- A slice of cheese on top melts beautifully.

> "The secret ingredient is patience — let the kimchi caramelise."
`;

const STUDY_NOTES = `# 운영체제 시험 정리 노트

## 1장. 프로세스와 스레드

- **프로세스**: 실행 중인 프로그램. 자기만의 주소 공간을 가진다.
- **스레드**: 프로세스 안의 실행 단위. 코드·데이터·힙을 함께 쓰고 스택만 따로 가진다.

| 비교 | 프로세스 | 스레드 |
|:-----|:--------|:------|
| 메모리 | 독립 | 공유 |
| 생성 비용 | 큼 | 작음 |
| 문맥 교환 | 느림 | 빠름 |
| 하나가 죽으면 | 다른 프로세스 영향 없음 | 같은 프로세스 전체가 위험 |

## 2장. CPU 스케줄링

| 알고리즘 | 선점 | 특징 |
|:---------|:---:|:-----|
| FCFS | 아니오 | 단순, 호위 효과 발생 |
| SJF | 아니오 | 평균 대기 시간 최소 |
| Round Robin | 예 | 시간 할당량이 핵심 |
| 우선순위 | 둘 다 | 기아 → 노화(aging)로 해결 |

## 3장. 교착 상태의 네 조건

1. 상호 배제
2. 점유와 대기
3. 비선점
4. 순환 대기

> 네 가지가 **모두** 성립해야 교착 상태가 생긴다. 하나만 깨면 예방된다.

## 외울 것

- [ ] 페이지 교체: FIFO, LRU, OPT 비교
- [ ] 세마포어와 뮤텍스 차이
- [x] 프로세스 상태 전이도 (생성 → 준비 → 실행 → 대기 → 종료)
`;

const RELEASE_NOTES = `# Release Notes — v2.4.0

*Released 2026-11-03*

## Highlights

- **Split view** — edit and preview side by side, with synced scrolling.
- **Dark theme** has been redesigned for better contrast.
- Opening large files (50 MB+) is now about *3x faster*.

## New

- Added word and character counts to the status bar.
- Added "Sort lines" and "Remove duplicate lines" commands.
- Tables can now be aligned with \`:---:\` style separators.
- New keyboard shortcut: \`Ctrl+Shift+P\` opens the command palette.

## Improved

| Area | Before | After |
|:-----|-------:|------:|
| Startup time | 1.8 s | 0.9 s |
| Memory (idle) | 210 MB | 140 MB |
| Search 10k lines | 420 ms | 95 ms |

## Fixed

1. Korean IME composition no longer drops the last character.
2. The cursor no longer jumps to the top after undo.
3. Fixed a crash when saving to a read-only folder.
4. Line endings (CRLF / LF) are preserved on save.

## Known issues

- Printing very wide tables may cut off the last column.

> Upgrading from 1.x? Your settings are migrated automatically on first launch.
`;

const TRAVEL_PLAN = `# 제주도 3박 4일 여행 계획

**일정**: 12월 12일(금) ~ 12월 15일(월) · **인원**: 4명

## 일정표

| 날짜 | 오전 | 오후 | 저녁 |
|:----|:----|:----|:----|
| 1일차 | 김포 → 제주 | 렌터카 인수, 애월 카페 | 흑돼지 |
| 2일차 | 성산일출봉 | 우도 자전거 | 해산물 뚝배기 |
| 3일차 | 한라산 영실 코스 | 휴식 | 시장 구경 |
| 4일차 | 협재 해변 | 제주 → 김포 | — |

## 예산 (1인)

| 항목 | 금액 |
|:-----|-----:|
| 항공 | 120,000 |
| 숙소 | 150,000 |
| 렌터카·유류 | 60,000 |
| 식비 | 180,000 |
| 입장료 | 30,000 |
| **합계** | **540,000** |

## 준비물

- [x] 신분증, 운전면허증
- [x] 숙소 예약 확인 메일
- [ ] 등산화, 방풍 재킷
- [ ] 보조 배터리
- [ ] 멀미약 (우도 배)

## 메모

- 한라산은 **입산 시간 제한**이 있으니 아침 일찍 출발할 것.
- 우도 배편은 바람이 강하면 결항될 수 있음 → 2일차와 3일차를 바꿀 수 있게 준비.
- 렌터카는 완전 자차 보험으로.
`;

const PORTFOLIO = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jiwoo Park — Product Designer</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #1f2933; background: #f7f7f2; line-height: 1.6; }
  header { padding: 64px 24px 40px; text-align: center; }
  .avatar { width: 96px; height: 96px; border-radius: 50%; margin: 0 auto 16px;
            background: linear-gradient(135deg, #f6ad55, #ed64a6); }
  h1 { margin: 0; font-size: 2rem; }
  .role { color: #616e7c; }
  nav a { margin: 0 10px; color: #c05621; text-decoration: none; font-weight: 600; }
  main { max-width: 960px; margin: 0 auto; padding: 0 24px 64px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
  .work { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
  .thumb { height: 150px; }
  .t1 { background: linear-gradient(120deg, #4fd1c5, #3182ce); }
  .t2 { background: linear-gradient(120deg, #f6e05e, #ed8936); }
  .t3 { background: linear-gradient(120deg, #9f7aea, #ed64a6); }
  .work div.body { padding: 16px; }
  .work h3 { margin: 0 0 4px; }
  .tags span { display: inline-block; font-size: .75rem; background: #fefcbf; padding: 2px 8px; border-radius: 99px; margin-right: 4px; }
  footer { text-align: center; color: #9aa5b1; padding: 24px; font-size: .9rem; }
</style>
</head>
<body>
  <header>
    <div class="avatar"></div>
    <h1>Jiwoo Park</h1>
    <p class="role">Product designer · Seoul · 7 years of experience</p>
    <nav><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></nav>
  </header>
  <main>
    <h2 id="work">Selected work</h2>
    <div class="grid">
      <article class="work"><div class="thumb t1"></div><div class="body">
        <h3>Banking app redesign</h3><p>Cut the transfer flow from 7 steps to 3.</p>
        <p class="tags"><span>Mobile</span><span>UX research</span></p></div></article>
      <article class="work"><div class="thumb t2"></div><div class="body">
        <h3>Recipe platform</h3><p>A design system with 120 components.</p>
        <p class="tags"><span>Design system</span><span>Web</span></p></div></article>
      <article class="work"><div class="thumb t3"></div><div class="body">
        <h3>Smart home dashboard</h3><p>Accessible controls for elderly users.</p>
        <p class="tags"><span>IoT</span><span>Accessibility</span></p></div></article>
    </div>
    <h2 id="about">About</h2>
    <p>I design calm, honest interfaces. Before design I studied psychology, which still shapes how I run interviews and usability tests.</p>
    <h2 id="contact">Contact</h2>
    <p>jiwoo.park@example.com</p>
  </main>
  <footer>&copy; 2026 Jiwoo Park</footer>
</body>
</html>
`;

const PRICING = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>요금제 안내</title>
<style>
  body { margin: 0; font-family: system-ui, "Malgun Gothic", sans-serif; background: #f0f4f8; color: #243b53; }
  h1 { text-align: center; margin: 48px 0 8px; }
  .sub { text-align: center; color: #627d98; margin-bottom: 40px; }
  .plans { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; padding: 0 16px 48px; }
  .plan { background: #fff; width: 280px; border-radius: 14px; padding: 28px; box-shadow: 0 4px 16px rgba(16,42,67,.08); position: relative; }
  .plan.best { border: 2px solid #2680c2; transform: translateY(-8px); }
  .badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #2680c2; color: #fff;
           font-size: .75rem; padding: 3px 12px; border-radius: 99px; }
  .price { font-size: 2.2rem; font-weight: 700; margin: 12px 0; }
  .price small { font-size: .9rem; color: #829ab1; font-weight: 400; }
  ul { list-style: none; padding: 0; margin: 0 0 24px; }
  li { padding: 6px 0; border-bottom: 1px solid #e6edf3; }
  li::before { content: "✓ "; color: #3ebd93; font-weight: 700; }
  li.no { color: #9fb3c8; }
  li.no::before { content: "✕ "; color: #ef8e58; }
  .btn { display: block; text-align: center; padding: 12px; border-radius: 8px; background: #e6edf3; color: #243b53; text-decoration: none; font-weight: 600; }
  .best .btn { background: #2680c2; color: #fff; }
  table { margin: 0 auto 64px; border-collapse: collapse; background: #fff; }
  th, td { padding: 10px 18px; border: 1px solid #d9e2ec; text-align: center; }
  th { background: #f0f4f8; }
</style>
</head>
<body>
  <h1>나에게 맞는 요금제를 고르세요</h1>
  <p class="sub">모든 요금제는 14일 무료 체험을 제공합니다. 언제든 해지할 수 있어요.</p>
  <section class="plans">
    <div class="plan">
      <h2>베이직</h2>
      <div class="price">₩0 <small>/ 월</small></div>
      <ul><li>문서 50개</li><li>저장 공간 1 GB</li><li class="no">공동 편집</li><li class="no">우선 지원</li></ul>
      <a class="btn" href="#">무료로 시작</a>
    </div>
    <div class="plan best">
      <span class="badge">가장 인기</span>
      <h2>프로</h2>
      <div class="price">₩9,900 <small>/ 월</small></div>
      <ul><li>문서 무제한</li><li>저장 공간 100 GB</li><li>공동 편집</li><li class="no">우선 지원</li></ul>
      <a class="btn" href="#">프로 시작하기</a>
    </div>
    <div class="plan">
      <h2>팀</h2>
      <div class="price">₩29,000 <small>/ 월</small></div>
      <ul><li>문서 무제한</li><li>저장 공간 1 TB</li><li>공동 편집</li><li>우선 지원</li></ul>
      <a class="btn" href="#">영업팀 문의</a>
    </div>
  </section>
  <table>
    <tr><th>기능</th><th>베이직</th><th>프로</th><th>팀</th></tr>
    <tr><td>PDF 내보내기</td><td>✓</td><td>✓</td><td>✓</td></tr>
    <tr><td>버전 기록</td><td>7일</td><td>90일</td><td>무제한</td></tr>
    <tr><td>관리자 콘솔</td><td>—</td><td>—</td><td>✓</td></tr>
  </table>
</body>
</html>
`;

const FAQ = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frequently Asked Questions</title>
<style>
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: #fffaf0; color: #3c2f2f; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
  h1 { font-size: 2.2rem; margin-bottom: 4px; }
  .lead { color: #7b6a58; margin-top: 0; }
  details { background: #fff; border: 1px solid #ecdcc4; border-radius: 10px; margin: 12px 0; padding: 0 18px; }
  details[open] { box-shadow: 0 3px 12px rgba(120, 80, 30, .1); }
  summary { cursor: pointer; padding: 16px 0; font-weight: bold; font-family: system-ui, sans-serif; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: "+"; float: right; color: #c47f2c; font-size: 1.3rem; line-height: 1; }
  details[open] summary::after { content: "−"; }
  details p { margin: 0 0 16px; line-height: 1.7; }
  .contact { margin-top: 40px; padding: 20px; background: #fdebd0; border-radius: 10px; }
  kbd { background: #f4ecdf; border: 1px solid #d6c3a5; border-radius: 4px; padding: 1px 6px; font-size: .85em; }
</style>
</head>
<body>
<main>
  <h1>FAQ</h1>
  <p class="lead">Answers to the questions we hear most often. Click a question to open it.</p>

  <details open>
    <summary>Is my data stored in the cloud?</summary>
    <p>No. Every document stays on your computer unless you choose to save it to a synced folder yourself.</p>
  </details>
  <details>
    <summary>Which file types can I open?</summary>
    <p>Markdown, HTML and plain text, plus common code and data formats such as JSON, CSV, YAML, Python and SQL.</p>
  </details>
  <details>
    <summary>How do I switch between edit and preview?</summary>
    <p>Use the toolbar buttons, or press <kbd>Ctrl</kbd> + <kbd>E</kbd> to toggle the preview pane.</p>
  </details>
  <details>
    <summary>Can I export to PDF?</summary>
    <p>Yes. Choose <em>File → Print</em> and pick a PDF printer, or use <em>Export → PDF</em> for a cleaner layout.</p>
  </details>
  <details>
    <summary>Does it work offline?</summary>
    <p>Completely. The app never needs a network connection to edit, preview or save.</p>
  </details>
  <details>
    <summary>How do I get a refund?</summary>
    <p>Write to us within 30 days of purchase and we will refund you in full, no questions asked.</p>
  </details>

  <div class="contact">
    <strong>Still stuck?</strong> Email support@example.com — we reply within one business day.
  </div>
</main>
</body>
</html>
`;

const BLOG_POST = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>아침 30분 글쓰기 습관 만들기</title>
<style>
  body { margin: 0; background: #fff; color: #222; font-family: "Noto Serif KR", Georgia, serif; }
  .bar { background: #111; color: #fff; padding: 14px 24px; font-family: system-ui, sans-serif; font-weight: 700; }
  article { max-width: 680px; margin: 0 auto; padding: 48px 20px 80px; line-height: 1.85; font-size: 1.08rem; }
  h1 { font-size: 2.1rem; line-height: 1.3; margin: 0 0 12px; }
  .meta { font-family: system-ui, sans-serif; color: #888; font-size: .9rem; margin-bottom: 32px; }
  .hero { height: 220px; border-radius: 10px; margin-bottom: 32px;
          background: linear-gradient(160deg, #ffd8a8 0%, #ffa94d 45%, #e8590c 100%); }
  h2 { font-family: system-ui, sans-serif; font-size: 1.3rem; margin-top: 40px; }
  blockquote { margin: 28px 0; padding: 4px 20px; border-left: 4px solid #e8590c; color: #555; font-style: italic; }
  .tip { background: #fff4e6; border-radius: 8px; padding: 16px 20px; font-family: system-ui, sans-serif; font-size: .95rem; }
  .tags { font-family: system-ui, sans-serif; margin-top: 40px; }
  .tags a { color: #e8590c; margin-right: 10px; text-decoration: none; }
</style>
</head>
<body>
  <div class="bar">하루 기록</div>
  <article>
    <h1>아침 30분 글쓰기 습관 만들기</h1>
    <p class="meta">김서연 · 2026년 11월 2일 · 읽는 데 4분</p>
    <div class="hero"></div>

    <p>작년 이맘때 저는 "글을 써야지"라는 말만 1년 내내 했습니다. 그러다 출근 전 30분만 쓰기로 정했고, 지금까지 280일을 이어 왔어요. 그동안 배운 것을 나눠 봅니다.</p>

    <h2>1. 잘 쓰려고 하지 않기</h2>
    <p>첫 달의 목표는 "좋은 글"이 아니라 "빈 화면을 채우는 것"이었습니다. 맞춤법도, 문단도 신경 쓰지 않았어요.</p>

    <blockquote>매일 쓰는 사람이 결국 잘 쓰는 사람이 된다.</blockquote>

    <h2>2. 장소와 시간을 고정하기</h2>
    <p>식탁, 커피 한 잔, 오전 6시 30분. 조건이 같으면 고민할 것이 줄어듭니다. 의지력은 아껴 두었다가 글에 쓰세요.</p>

    <h2>3. 기록을 눈에 보이게</h2>
    <p>달력에 쓴 날마다 동그라미를 칩니다. 이어진 동그라미를 끊기 싫어서라도 다음 날 책상에 앉게 됩니다.</p>

    <p class="tip"><strong>팁:</strong> 쓸 거리가 없으면 "어제 가장 기억에 남는 장면"을 세 줄로 적어 보세요.</p>

    <div class="tags"><a href="#">#습관</a><a href="#">#글쓰기</a><a href="#">#아침루틴</a></div>
  </article>
</body>
</html>
`;

const DASHBOARD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sales Dashboard</title>
<style>
  :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --good: #4ade80; --bad: #f87171; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; }
  .layout { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
  aside { background: #0b1222; padding: 24px 16px; }
  aside h2 { font-size: 1rem; color: var(--accent); margin-top: 0; }
  aside a { display: block; color: var(--muted); text-decoration: none; padding: 8px 10px; border-radius: 6px; }
  aside a.on { background: var(--card); color: var(--text); }
  main { padding: 24px; display: grid; gap: 16px;
         grid-template-columns: repeat(4, 1fr);
         grid-template-areas: "k1 k2 k3 k4" "chart chart chart side" "table table table side"; }
  .card { background: var(--card); border-radius: 12px; padding: 18px; }
  .kpi .label { color: var(--muted); font-size: .85rem; }
  .kpi .value { font-size: 1.8rem; font-weight: 700; margin: 6px 0; }
  .up { color: var(--good); } .down { color: var(--bad); }
  .chart { grid-area: chart; }
  .bars { display: flex; align-items: flex-end; gap: 10px; height: 160px; margin-top: 12px; }
  .bars div { flex: 1; background: linear-gradient(var(--accent), #0369a1); border-radius: 4px 4px 0 0; }
  .side { grid-area: side; }
  .side li { padding: 6px 0; border-bottom: 1px solid #334155; list-style: none; }
  .side ul { padding: 0; margin: 0; }
  .table { grid-area: table; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #334155; }
  th { color: var(--muted); font-weight: 500; }
</style>
</head>
<body>
<div class="layout">
  <aside>
    <h2>Acme Analytics</h2>
    <a class="on" href="#">Overview</a><a href="#">Orders</a><a href="#">Customers</a><a href="#">Reports</a>
  </aside>
  <main>
    <div class="card kpi" style="grid-area:k1"><div class="label">Revenue</div><div class="value">$48.2k</div><div class="up">▲ 12.4%</div></div>
    <div class="card kpi" style="grid-area:k2"><div class="label">Orders</div><div class="value">1,284</div><div class="up">▲ 5.1%</div></div>
    <div class="card kpi" style="grid-area:k3"><div class="label">Refunds</div><div class="value">23</div><div class="down">▲ 2.0%</div></div>
    <div class="card kpi" style="grid-area:k4"><div class="label">New customers</div><div class="value">312</div><div class="up">▲ 8.7%</div></div>
    <section class="card chart">
      <strong>Monthly revenue</strong>
      <div class="bars">
        <div style="height:40%"></div><div style="height:55%"></div><div style="height:48%"></div>
        <div style="height:70%"></div><div style="height:62%"></div><div style="height:85%"></div>
        <div style="height:78%"></div><div style="height:95%"></div>
      </div>
    </section>
    <section class="card side">
      <strong>Top products</strong>
      <ul><li>Wireless mouse — 412</li><li>USB-C hub — 298</li><li>Laptop stand — 187</li><li>Webcam HD — 140</li></ul>
    </section>
    <section class="card table">
      <strong>Recent orders</strong>
      <table>
        <tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr>
        <tr><td>#10421</td><td>Kim Minji</td><td>$129.00</td><td class="up">Paid</td></tr>
        <tr><td>#10420</td><td>John Smith</td><td>$54.50</td><td class="up">Paid</td></tr>
        <tr><td>#10419</td><td>Lee Junho</td><td>$310.20</td><td class="down">Refunded</td></tr>
      </table>
    </section>
  </main>
</div>
</body>
</html>
`;

const INVOICE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>청구서 INV-2026-0117</title>
<style>
  body { margin: 0; background: #e9ecef; font-family: system-ui, "Malgun Gothic", sans-serif; color: #212529; }
  .page { max-width: 760px; margin: 32px auto; background: #fff; padding: 48px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { font-size: 1.5rem; font-weight: 800; color: #5f3dc4; }
  h1 { margin: 0; font-size: 2rem; letter-spacing: .1em; color: #495057; }
  .info { display: flex; justify-content: space-between; margin: 32px 0; font-size: .95rem; line-height: 1.7; }
  .info h3 { margin: 0 0 4px; font-size: .8rem; color: #868e96; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #5f3dc4; color: #fff; padding: 10px; text-align: left; }
  td { padding: 10px; border-bottom: 1px solid #dee2e6; }
  .num { text-align: right; }
  .totals { width: 300px; margin-left: auto; margin-top: 16px; }
  .totals td { border: none; padding: 6px 10px; }
  .grand td { font-size: 1.2rem; font-weight: 700; border-top: 2px solid #5f3dc4; }
  .note { margin-top: 40px; padding: 16px; background: #f3f0ff; border-radius: 8px; font-size: .9rem; }
  @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div class="logo">한빛 디자인 스튜디오</div>
    <div style="text-align:right"><h1>청구서</h1><div>INV-2026-0117</div></div>
  </div>
  <div class="info">
    <div><h3>발행자</h3>한빛 디자인 스튜디오<br>서울시 마포구 월드컵로 12<br>사업자 번호 123-45-67890</div>
    <div><h3>청구 대상</h3>(주)푸른숲 출판<br>담당: 이정민 과장<br>jm.lee@example.com</div>
    <div><h3>날짜</h3>발행일: 2026-11-05<br>지급 기한: 2026-11-30</div>
  </div>
  <table>
    <tr><th>항목</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액</th></tr>
    <tr><td>도서 표지 디자인</td><td class="num">3</td><td class="num">800,000</td><td class="num">2,400,000</td></tr>
    <tr><td>내지 레이아웃 (페이지)</td><td class="num">240</td><td class="num">5,000</td><td class="num">1,200,000</td></tr>
    <tr><td>홍보용 카드뉴스</td><td class="num">5</td><td class="num">120,000</td><td class="num">600,000</td></tr>
    <tr><td>수정 작업 (시간)</td><td class="num">4</td><td class="num">50,000</td><td class="num">200,000</td></tr>
  </table>
  <table class="totals">
    <tr><td>공급가액</td><td class="num">4,400,000</td></tr>
    <tr><td>부가세 (10%)</td><td class="num">440,000</td></tr>
    <tr class="grand"><td>합계</td><td class="num">₩4,840,000</td></tr>
  </table>
  <div class="note"><strong>입금 계좌:</strong> 한빛은행 110-234-567890 (예금주: 한빛 디자인 스튜디오)<br>문의 사항은 billing@example.com 으로 연락 주세요. 감사합니다.</div>
</div>
</body>
</html>
`;

const PYTHON = `#!/usr/bin/env python3
"""Monthly sales report.

Reads sales.csv (date, region, product, quantity, price) and prints
total revenue per region and the best-selling products.
"""

import csv
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date


@dataclass
class Sale:
    day: date
    region: str
    product: str
    quantity: int
    price: float

    @property
    def total(self) -> float:
        return self.quantity * self.price


def load_sales(path: str) -> list[Sale]:
    sales = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sales.append(Sale(
                day=date.fromisoformat(row["date"]),
                region=row["region"],
                product=row["product"],
                quantity=int(row["quantity"]),
                price=float(row["price"]),
            ))
    return sales


def report(sales: list[Sale], top: int = 5) -> None:
    by_region: dict[str, float] = defaultdict(float)
    by_product: Counter[str] = Counter()
    for s in sales:
        by_region[s.region] += s.total
        by_product[s.product] += s.quantity

    print("Revenue by region")
    print("-" * 30)
    for region, revenue in sorted(by_region.items(), key=lambda kv: -kv[1]):
        print(f"{region:<15}{revenue:>15,.0f}")

    print()
    print(f"Top {top} products")
    for rank, (product, qty) in enumerate(by_product.most_common(top), start=1):
        print(f"{rank}. {product} ({qty} sold)")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sales.csv"
    try:
        report(load_sales(path))
    except FileNotFoundError:
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)
`;

const SQL = `-- 도서관 대출 관리 데이터베이스
-- 테이블 만들기, 예시 데이터, 자주 쓰는 조회

CREATE TABLE members (
    member_id   INTEGER PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    email       VARCHAR(100) UNIQUE,
    joined_at   DATE         DEFAULT CURRENT_DATE
);

CREATE TABLE books (
    book_id     INTEGER PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    author      VARCHAR(100),
    published   INTEGER,
    copies      INTEGER DEFAULT 1 CHECK (copies >= 0)
);

CREATE TABLE loans (
    loan_id     INTEGER PRIMARY KEY,
    member_id   INTEGER NOT NULL REFERENCES members(member_id),
    book_id     INTEGER NOT NULL REFERENCES books(book_id),
    loaned_at   DATE    NOT NULL,
    due_at      DATE    NOT NULL,
    returned_at DATE
);

CREATE INDEX idx_loans_member ON loans(member_id);

INSERT INTO members (member_id, name, email) VALUES
    (1, '김하늘', 'sky@example.com'),
    (2, '박도윤', 'doyun@example.com'),
    (3, 'Emily Clark', 'emily@example.com');

INSERT INTO books (book_id, title, author, published, copies) VALUES
    (101, '채식주의자', '한강', 2007, 3),
    (102, 'Clean Code', 'Robert C. Martin', 2008, 2),
    (103, '코스모스', '칼 세이건', 1980, 1);

INSERT INTO loans VALUES
    (1, 1, 101, '2026-10-20', '2026-11-03', NULL),
    (2, 2, 102, '2026-10-25', '2026-11-08', '2026-11-01'),
    (3, 3, 103, '2026-11-01', '2026-11-15', NULL);

-- 반납 기한이 지난 대출
SELECT m.name, b.title, l.due_at
FROM loans l
JOIN members m ON m.member_id = l.member_id
JOIN books   b ON b.book_id   = l.book_id
WHERE l.returned_at IS NULL
  AND l.due_at < CURRENT_DATE
ORDER BY l.due_at;

-- 회원별 대출 횟수
SELECT m.name, COUNT(l.loan_id) AS loan_count
FROM members m
LEFT JOIN loans l ON l.member_id = m.member_id
GROUP BY m.name
HAVING COUNT(l.loan_id) > 0
ORDER BY loan_count DESC;
`;

const YAML = `# docker-compose.yml — web app with database and cache
# Start everything with: docker compose up -d

version: "3.9"

services:
  web:
    build: ./web
    image: mytextmaster/web:2.4.0
    ports:
      - "8080:80"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:secret@db:5432/app
      REDIS_URL: redis://cache:6379
      LOG_LEVEL: info
    depends_on:
      - db
      - cache
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    command: ["redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
    restart: unless-stopped

  backup:
    image: alpine:3.20
    profiles: ["maintenance"]
    volumes:
      - db-data:/data:ro
      - ./backups:/backups
    entrypoint: >
      sh -c "tar czf /backups/db-$$(date +%F).tar.gz -C /data ."

volumes:
  db-data:
`;

const INI = `; 게임 설정 파일 (settings.ini)
; 세미콜론으로 시작하는 줄은 주석입니다.
; 값을 바꾼 뒤 게임을 다시 시작해야 적용됩니다.

[General]
Language=ko
PlayerName=용감한모험가
AutoSave=true
AutoSaveIntervalMinutes=10
ShowTutorial=false

[Display]
Width=2560
Height=1440
Fullscreen=true
VSync=true
FrameLimit=144
Brightness=0.55
; 낮음(low) / 보통(medium) / 높음(high) / 최고(ultra)
Quality=high

[Graphics]
Shadows=high
TextureQuality=ultra
AntiAliasing=TAA
MotionBlur=false
ViewDistance=1200
FieldOfView=90

[Audio]
MasterVolume=80
MusicVolume=60
EffectsVolume=85
VoiceVolume=100
Subtitles=true

[Controls]
MouseSensitivity=1.25
InvertY=false
KeyForward=W
KeyBack=S
KeyLeft=A
KeyRight=D
KeyJump=Space
KeyInventory=I
KeyMap=M

[Network]
Server=asia-east.example.com
Port=27015
MaxPing=120
`;

const CSS = `/* theme.css — a small, readable design system
   Light and dark colours, typography, buttons and cards. */

:root {
  --color-bg: #ffffff;
  --color-surface: #f6f8fa;
  --color-text: #1f2328;
  --color-muted: #656d76;
  --color-primary: #0969da;
  --color-primary-hover: #0550ae;
  --color-danger: #cf222e;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(31, 35, 40, 0.12);
  --font-sans: "Pretendard", system-ui, -apple-system, sans-serif;
  --font-mono: "D2Coding", Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0d1117;
    --color-surface: #161b22;
    --color-text: #e6edf3;
    --color-muted: #8d96a0;
    --color-primary: #4493f8;
    --color-primary-hover: #74abff;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font: 16px/1.6 var(--font-sans);
}

h1, h2, h3 {
  line-height: 1.25;
  margin: 1.5em 0 0.5em;
}

code, pre {
  font-family: var(--font-mono);
  background: var(--color-surface);
  border-radius: 4px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn:hover { background: var(--color-primary-hover); }
.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.btn--danger { background: var(--color-danger); }

.card {
  padding: 1.25rem;
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
`;

const TSV = `sku	품명	분류	창고	수량	단가	최근 입고
A-1001	무선 마우스	주변기기	서울	142	18900	2026-10-28
A-1002	기계식 키보드	주변기기	서울	58	89000	2026-10-21
A-1003	USB-C 허브	주변기기	부산	213	32000	2026-11-02
B-2001	27인치 모니터	디스플레이	서울	24	329000	2026-10-15
B-2002	모니터 받침대	액세서리	대전	77	25000	2026-10-30
B-2003	노트북 거치대	액세서리	부산	96	39000	2026-11-01
C-3001	웹캠 FHD	영상	서울	41	59000	2026-10-19
C-3002	USB 마이크	음향	대전	33	79000	2026-10-22
C-3003	블루투스 스피커	음향	부산	65	45000	2026-10-27
D-4001	HDMI 케이블 2m	케이블	서울	520	6900	2026-11-03
D-4002	랜 케이블 5m	케이블	대전	310	4900	2026-11-03
D-4003	멀티탭 6구	전원	서울	88	15900	2026-10-25
E-5001	외장 SSD 1TB	저장장치	부산	47	129000	2026-10-18
E-5002	SD 카드 128GB	저장장치	서울	160	21000	2026-10-29
`;

export const MORE_SAMPLES = [
  { id: 'proposal', group: 'markdown', file: 'project-proposal.md', icon: 'bulb', ko: ['프로젝트 제안서', '배경·목표·예산 표'], en: ['Project proposal', 'Background, goals, budget table'], text: PROPOSAL },
  { id: 'recipe', group: 'markdown', file: 'kimchi-fried-rice.md', icon: 'list', ko: ['요리법', '재료 표와 순서 목록'], en: ['Recipe', 'Ingredient table and steps'], text: RECIPE },
  { id: 'study-notes', group: 'markdown', file: 'os-study-notes.md', icon: 'notes', ko: ['공부 노트', '비교 표와 체크리스트'], en: ['Study notes', 'Comparison tables and a checklist'], text: STUDY_NOTES },
  { id: 'release-notes', group: 'markdown', file: 'release-notes.md', icon: 'tag', ko: ['릴리스 노트', '새 기능·개선·버그 수정'], en: ['Release notes', 'New, improved, fixed'], text: RELEASE_NOTES },
  { id: 'travel-plan', group: 'markdown', file: 'jeju-trip.md', icon: 'flag', ko: ['여행 계획', '일정표·예산·준비물'], en: ['Travel plan', 'Itinerary, budget, packing list'], text: TRAVEL_PLAN },
  { id: 'portfolio', group: 'html', file: 'portfolio.html', icon: 'palette', ko: ['포트폴리오', '작업 카드 격자'], en: ['Portfolio', 'A grid of project cards'], text: PORTFOLIO },
  { id: 'pricing', group: 'html', file: 'pricing.html', icon: 'money', ko: ['요금제 표', '요금 카드와 기능 비교'], en: ['Pricing table', 'Plan cards and a feature table'], text: PRICING },
  { id: 'faq', group: 'html', file: 'faq.html', icon: 'listTask', ko: ['자주 묻는 질문', '<details>로 접고 펴기'], en: ['FAQ', 'Collapsible <details> answers'], text: FAQ },
  { id: 'blog-post', group: 'html', file: 'blog-post.html', icon: 'quote', ko: ['블로그 글', '읽기 좋은 본문 서식'], en: ['Blog article', 'Comfortable reading typography'], text: BLOG_POST },
  { id: 'dashboard', group: 'html', file: 'sales-dashboard.html', icon: 'layers', ko: ['대시보드', 'CSS 격자 배치'], en: ['Dashboard', 'A CSS grid layout'], text: DASHBOARD },
  { id: 'invoice', group: 'html', file: 'invoice.html', icon: 'money', ko: ['청구서', '품목 표와 합계, 인쇄용'], en: ['Invoice', 'Line items and totals, print-ready'], text: INVOICE },
  { id: 'python', group: 'text', file: 'sales_report.py', icon: 'codeFile', ko: ['Python 스크립트', '판매 보고서 만들기'], en: ['Python script', 'A sales report generator'], text: PYTHON },
  { id: 'sql', group: 'text', file: 'library.sql', icon: 'database', ko: ['SQL 파일', '테이블·데이터·조회'], en: ['SQL file', 'Tables, data and queries'], text: SQL },
  { id: 'yaml', group: 'text', file: 'docker-compose.yml', icon: 'server', ko: ['YAML 설정', '도커 컴포즈 서비스 정의'], en: ['YAML config', 'Docker Compose services'], text: YAML },
  { id: 'ini', group: 'text', file: 'settings.ini', icon: 'txtFile', ko: ['INI 설정', '구역과 키=값'], en: ['INI settings', 'Sections and key=value'], text: INI },
  { id: 'css', group: 'text', file: 'theme.css', icon: 'codeBlock', ko: ['CSS 스타일', '색 변수와 버튼·카드'], en: ['CSS stylesheet', 'Colour variables, buttons, cards'], text: CSS },
  { id: 'tsv', group: 'text', file: 'inventory.tsv', icon: 'table', ko: ['TSV 재고표', '탭으로 나눈 데이터'], en: ['TSV inventory', 'Tab-separated values'], text: TSV },
];
