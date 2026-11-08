import { MORE_SAMPLES } from './samples-more.js';

// Sample documents of the start page, in three groups (10 each). `npm run samples` also writes them to
// samples/ (test/samples.test.js checks that the folder matches this list).
export const SAMPLE_GROUPS = [
  { id: 'markdown', icon: 'mdFile', ko: 'Markdown', en: 'Markdown' },
  { id: 'html', icon: 'htmlFile', ko: 'HTML', en: 'HTML' },
  { id: 'text', icon: 'txtFile', ko: '텍스트', en: 'Text' },
];

const FEATURE_TOUR = `# MyTextMaster 기능 둘러보기

MyTextMaster 는 **Markdown**, *HTML*, 텍스트 문서를 편집하는 프로그램입니다.
왼쪽에서 쓰면 오른쪽 **미리 보기**가 바로 바뀝니다.

## 글자 꾸미기

| 문법 | 결과 |
| --- | --- |
| \`**굵게**\` | **굵게** |
| \`*기울임*\` | *기울임* |
| \`~~취소선~~\` | ~~취소선~~ |
| \`\` \`코드\` \`\` | \`코드\` |
| \`[링크](https://example.com)\` | [링크](https://example.com) |

## 목록

- 순서 없는 목록
  - 들여 쓴 항목
- 두 번째 항목

1. 순서 있는 목록
2. 두 번째

- [x] 끝낸 일
- [ ] 남은 일

## 인용과 코드

> 좋은 글은 고쳐 쓰기에서 나온다.

\`\`\`js
function hello(name) {
  return \`안녕하세요, \${name}님!\`;
}
\`\`\`

## 구분선과 그림

---

![MyTextMaster](https://via.placeholder.com/320x80?text=MyTextMaster)

## 바로 가기 키

- <kbd>Ctrl</kbd>+<kbd>B</kbd> 굵게, <kbd>Ctrl</kbd>+<kbd>I</kbd> 기울임
- <kbd>Ctrl</kbd>+<kbd>F</kbd> 찾기, <kbd>Ctrl</kbd>+<kbd>H</kbd> 바꾸기
- <kbd>Ctrl</kbd>+<kbd>\\\\</kbd> 편집 · 나란히 · 미리 보기 전환
`;

const TABLES = `# Tables and alignment

Tables use pipes \`|\` and a separator row. Colons set the alignment.

| Left | Centre | Right |
| :--- | :---: | ---: |
| apple | 3 | 1,200 |
| banana | 12 | 300 |
| cherry | 7 | 9,800 |

## Wide table

| Region | Q1 | Q2 | Q3 | Q4 | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| North | 120 | 135 | 150 | 170 | 575 |
| South | 98 | 101 | 120 | 133 | 452 |
| East | 77 | 90 | 85 | 104 | 356 |
| West | 140 | 152 | 160 | 175 | 627 |

Use **Insert › Table** to start a new one.
`;

const MEETING = `# 주간 회의록 — 2026-11-02

**참석자:** 김지원, 이서준, 박하늘
**장소:** 3층 회의실

## 안건

1. 지난주 진행 상황
2. 출시 일정
3. 기타

## 논의 내용

### 1. 지난주 진행 상황

- 로그인 화면 디자인 완료
- API 문서 80% 작성

### 2. 출시 일정

> 11월 20일 베타 출시, 12월 첫 주 정식 출시로 합의

## 할 일

- [x] 디자인 시안 공유 — 박하늘
- [ ] API 문서 마무리 — 이서준 (11/6)
- [ ] 베타 테스터 모집 공지 — 김지원 (11/8)
`;

const NOVEL = `# 첫눈

## 1장

밤사이 눈이 내렸다. 창문을 열자 차가운 공기가 방 안으로 들어왔고,
골목은 하얗게 덮여 있었다.

"벌써 겨울이네."

동생이 이불 속에서 중얼거렸다. 나는 대답 대신 창밖을 오래 바라보았다.

## 2장

학교 가는 길에는 발자국이 하나도 없었다. 나는 일부러 천천히 걸었다.
뒤를 돌아보면 내 발자국만이 길게 이어져 있었다.

---

*이 글은 MyTextMaster 의 집중 모드와 문서 스타일을 보여 주는 예제입니다.*
`;

const API_DOC = `# REST API Reference

Base URL: \`https://api.example.com/v1\`

## Authentication

Send the token in the \`Authorization\` header:

\`\`\`http
GET /users/me HTTP/1.1
Authorization: Bearer <token>
\`\`\`

## Endpoints

### \`GET /users\`

Lists users.

| Parameter | Type | Description |
| --- | --- | --- |
| \`page\` | integer | Page number (from 1) |
| \`size\` | integer | Items per page (max 100) |

**Response**

\`\`\`json
{
  "items": [{ "id": 1, "name": "Ada" }],
  "page": 1,
  "total": 42
}
\`\`\`

### \`POST /users\`

Creates a user. Returns \`201 Created\`.

## Errors

| Code | Meaning |
| --- | --- |
| 400 | Bad request |
| 401 | Not signed in |
| 404 | Not found |
`;

const LANDING = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>카페 바람 — 소개</title>
    <style>
      :root { --brand: #8a5a3b; }
      body { margin: 0; font-family: "Malgun Gothic", system-ui, sans-serif; color: #2b2118; background: #fbf7f2; }
      header { padding: 70px 24px; text-align: center; color: #fff; background: linear-gradient(135deg, #8a5a3b, #c08a5b); }
      header h1 { margin: 0 0 8px; font-size: 2.6em; }
      nav { display: flex; justify-content: center; gap: 22px; padding: 12px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
      nav a { color: var(--brand); text-decoration: none; font-weight: 600; }
      main { max-width: 900px; margin: 30px auto; padding: 0 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
      .card { padding: 20px; border-radius: 14px; background: #fff; box-shadow: 0 6px 20px rgba(80, 50, 20, .08); }
      .price { color: var(--brand); font-weight: 700; }
      footer { padding: 30px; text-align: center; color: #8b7b6b; }
    </style>
  </head>
  <body>
    <header>
      <h1>카페 바람</h1>
      <p>매일 아침 직접 볶은 원두로 내린 커피</p>
    </header>
    <nav>
      <a href="#menu">메뉴</a>
      <a href="#hours">영업시간</a>
      <a href="#map">오시는 길</a>
    </nav>
    <main id="menu">
      <div class="card">
        <h2>아메리카노</h2>
        <p>고소한 맛의 기본 커피</p>
        <p class="price">4,000원</p>
      </div>
      <div class="card">
        <h2>카페라테</h2>
        <p>부드러운 우유와 에스프레소</p>
        <p class="price">4,800원</p>
      </div>
      <div class="card" id="hours">
        <h2>영업시간</h2>
        <p>평일 08:00 – 21:00<br>주말 10:00 – 22:00</p>
      </div>
    </main>
    <footer id="map">서울시 바람구 커피로 12 · 02-123-4567</footer>
  </body>
</html>
`;

const RESUME = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Resume — Alex Kim</title>
    <style>
      body { max-width: 780px; margin: 40px auto; padding: 0 24px; font-family: Georgia, serif; color: #222; line-height: 1.55; }
      h1 { margin-bottom: 0; font-size: 2.3em; }
      .contact { color: #666; margin-top: 4px; }
      h2 { margin-top: 28px; padding-bottom: 4px; border-bottom: 2px solid #3a6cf0; color: #3a6cf0; font-size: 1.1em; text-transform: uppercase; letter-spacing: .06em; }
      .job { display: flex; justify-content: space-between; font-weight: bold; }
      .when { color: #666; font-weight: normal; }
      ul { margin-top: 4px; }
    </style>
  </head>
  <body>
    <h1>Alex Kim</h1>
    <p class="contact">Seoul · alex@example.com · github.com/alexkim</p>

    <h2>Experience</h2>
    <div class="job"><span>Senior Frontend Engineer, Sample Corp</span><span class="when">2022 – now</span></div>
    <ul>
      <li>Led the redesign of the customer dashboard (load time −45%).</li>
      <li>Built the design system used by 6 teams.</li>
    </ul>
    <div class="job"><span>Web Developer, Example Studio</span><span class="when">2018 – 2022</span></div>
    <ul>
      <li>Shipped 30+ marketing sites and two mobile web apps.</li>
    </ul>

    <h2>Skills</h2>
    <p>JavaScript, TypeScript, HTML, CSS, Rust, Tauri, accessibility, testing</p>

    <h2>Education</h2>
    <p>B.S. Computer Science, Example University, 2018</p>
  </body>
</html>
`;

const NEWSLETTER = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <title>11월 소식지</title>
  </head>
  <body style="margin:0;background:#eef2f8;font-family:'Malgun Gothic',sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:24px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:28px;background:#3a6cf0;color:#ffffff">
                <h1 style="margin:0;font-size:24px">11월 소식지</h1>
                <p style="margin:6px 0 0">이번 달 새 소식을 전해 드립니다.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;color:#1d2433;line-height:1.6">
                <h2 style="font-size:18px">새 기능</h2>
                <p>문서 미리 보기와 HTML 내보내기가 추가되었습니다.</p>
                <h2 style="font-size:18px">행사 안내</h2>
                <p>11월 25일 온라인 사용자 모임이 열립니다.</p>
                <p style="text-align:center;margin:26px 0">
                  <a href="https://example.com" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#3a6cf0;color:#fff;text-decoration:none">자세히 보기</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f4f6fb;color:#667085;font-size:12px">수신을 원하지 않으면 회신해 주세요.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const FORM = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Contact form</title>
    <style>
      body { display: grid; place-items: center; min-height: 100vh; margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; }
      form { width: 360px; padding: 26px; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(15, 23, 42, .1); }
      label { display: block; margin: 12px 0 4px; font-weight: 600; }
      input, textarea, select { width: 100%; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; box-sizing: border-box; }
      button { margin-top: 16px; width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #0f766e; color: #fff; font: inherit; font-weight: 600; }
    </style>
  </head>
  <body>
    <form>
      <h2>Contact us</h2>
      <label for="name">Name</label>
      <input id="name" placeholder="Your name">
      <label for="mail">E-mail</label>
      <input id="mail" type="email" placeholder="you@example.com">
      <label for="topic">Topic</label>
      <select id="topic">
        <option>Question</option>
        <option>Bug report</option>
        <option>Other</option>
      </select>
      <label for="message">Message</label>
      <textarea id="message" rows="4"></textarea>
      <button type="button">Send</button>
    </form>
  </body>
</html>
`;

const NOTES = `장보기 메모
==========

- 우유 2개
- 달걀 한 판
- 사과
- 커피 원두 (200g)

연락할 사람
----------
김 대리: 화요일 오전 회의 시간 확인
이 선배: 책 돌려주기

아이디어
-------
* 주말에 사진 정리하기
* 블로그에 여행기 쓰기
`;

const LOG = `2026-11-08 09:00:01 INFO  server  Starting service on port 8080
2026-11-08 09:00:01 INFO  db      Connected to database (pool=10)
2026-11-08 09:00:05 INFO  http    GET /health 200 2ms
2026-11-08 09:12:44 WARN  http    GET /api/users?page=99 404 12ms
2026-11-08 09:13:02 INFO  http    POST /api/login 200 45ms
2026-11-08 09:30:17 ERROR db      Query timeout after 5000ms: SELECT * FROM orders
2026-11-08 09:30:18 INFO  db      Retrying query (1/3)
2026-11-08 09:30:19 INFO  db      Query finished in 820ms
2026-11-08 10:00:00 INFO  cron    Nightly report scheduled
2026-11-08 10:05:31 WARN  cache   Hit ratio below 60% (57.2%)
2026-11-08 11:42:09 INFO  http    GET /api/orders 200 31ms
2026-11-08 12:00:00 INFO  server  Uptime 3h, 1,204 requests, 2 errors
`;

const CSV = `id,name,department,city,joined
1,김지원,개발,서울,2021-03-02
2,이서준,디자인,부산,2020-07-15
3,박하늘,기획,서울,2022-01-10
4,Choi Minho,Sales,Daejeon,2019-11-04
5,Jung Yuna,Support,Incheon,2023-05-22
6,강도윤,개발,서울,2024-02-19
`;

const JSON_CONFIG = `{
  "name": "my-project",
  "version": "1.0.0",
  "editor": {
    "tabSize": 2,
    "wordWrap": true,
    "theme": "dark"
  },
  "recent": [
    "notes/todo.md",
    "site/index.html"
  ]
}
`;

export const SAMPLES = [
  { id: 'feature-tour', group: 'markdown', file: 'feature-tour.md', icon: 'sparkles', ko: ['기능 둘러보기', 'Markdown 문법과 미리 보기'], en: ['Feature tour', 'Markdown syntax and the preview'], text: FEATURE_TOUR },
  { id: 'tables', group: 'markdown', file: 'tables.md', icon: 'table', ko: ['표와 정렬', '왼쪽·가운데·오른쪽 정렬 표'], en: ['Tables', 'Left, centre and right aligned'], text: TABLES },
  { id: 'meeting', group: 'markdown', file: 'weekly-meeting.md', icon: 'calendar', ko: ['주간 회의록', '안건·결정·할 일 목록'], en: ['Weekly meeting', 'Agenda, decisions, tasks'], text: MEETING },
  { id: 'novel', group: 'markdown', file: 'first-snow.md', icon: 'notes', ko: ['단편 소설', '장 나누기와 문서 스타일'], en: ['Short story', 'Chapters and the document style'], text: NOVEL },
  { id: 'api', group: 'markdown', file: 'api-reference.md', icon: 'codeBlock', ko: ['API 문서', '코드 블록과 매개변수 표'], en: ['API reference', 'Code blocks and parameter tables'], text: API_DOC },
  { id: 'landing', group: 'html', file: 'cafe-landing.html', icon: 'globe', ko: ['카페 소개 페이지', '머리글·메뉴 카드·바닥글'], en: ['Café landing page', 'Header, menu cards, footer'], text: LANDING },
  { id: 'resume', group: 'html', file: 'resume.html', icon: 'user', ko: ['이력서', '인쇄하기 좋은 한 장'], en: ['Resume', 'A printable one-pager'], text: RESUME },
  { id: 'newsletter', group: 'html', file: 'newsletter.html', icon: 'notes', ko: ['이메일 소식지', '표로 짠 이메일 레이아웃'], en: ['E-mail newsletter', 'A table-based e-mail layout'], text: NEWSLETTER },
  { id: 'form', group: 'html', file: 'contact-form.html', icon: 'edit', ko: ['문의 양식', '입력 칸과 단추'], en: ['Contact form', 'Fields and a button'], text: FORM },
  { id: 'notes', group: 'text', file: 'notes.txt', icon: 'txtFile', ko: ['메모', '장보기·연락·아이디어'], en: ['Notes', 'Shopping, calls, ideas'], text: NOTES },
  { id: 'log', group: 'text', file: 'server.log', icon: 'problems', ko: ['서버 로그', '찾기·줄 정렬 연습'], en: ['Server log', 'Practise find and sort lines'], text: LOG },
  { id: 'csv', group: 'text', file: 'staff.csv', icon: 'csvFile', ko: ['CSV 표', '쉼표로 나눈 데이터'], en: ['CSV data', 'Comma-separated values'], text: CSV },
  { id: 'json', group: 'text', file: 'config.json', icon: 'jsonFile', ko: ['JSON 설정', '구조가 있는 설정 파일'], en: ['JSON config', 'A structured settings file'], text: JSON_CONFIG },
];

SAMPLES.push(...MORE_SAMPLES);
const ORDER = SAMPLE_GROUPS.map((g) => g.id);
SAMPLES.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

export const sampleById = (id) => SAMPLES.find((sample) => sample.id === id);
