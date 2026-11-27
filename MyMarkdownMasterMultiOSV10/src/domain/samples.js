// Sample vaults (start page › Samples): each a small vault of linked notes in Korean or English that shows
// the features — wiki links and embeds, callouts, math, diagrams, charts, tasks, tags, properties, a canvas,
// templates and daily notes. `sampleFiles(id, language)` → { path: text }.
const today = () => new Date().toISOString().slice(0, 10);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const canvas = (nodes, edges = []) => JSON.stringify({ nodes, edges }, null, '\t');

const GUIDE = {
  ko: () => ({
    '시작하기.md': `---
tags: [안내, 시작]
aliases: [Home, 홈]
created: ${today()}
---
# MyMarkdownMaster에 오신 것을 환영합니다 👋

이 보관함(vault)은 **링크로 연결된 메모** 모음입니다. 왼쪽 *파일* 패널에서 메모를 열고, 오른쪽 패널에서 [[링크와 백링크|백링크]]와 *개요*를 확인해 보세요.

> [!tip] 세 가지 보기
> 메모 위의 **실시간 / 소스 / 읽기 / 나란히** 단추로 보기를 바꿉니다. *나란히*는 왼쪽에 소스, 오른쪽에 미리보기를 보여 주며 양쪽을 접었다 펼 수 있습니다.

## 둘러보기
- [[링크와 백링크]] — \`[[ ]]\`로 메모를 잇는 방법
- [[서식 모음]] — 제목, 목록, 표, 각주, ==강조==, 콜아웃
- [[수식과 다이어그램]] — $E=mc^2$, Mermaid, 차트
- [[할 일 관리]] — 체크 목록과 작업 검색
- [[AI 도우미]] — 여러 AI API 연결
- [[글쓰기 도구]] — 집중 모드, 타자기 스크롤, 문체 검사, 목표
- [[내보내기]] — HTML, PDF, Word, EPUB 등
- 캔버스: [[아이디어 보드.canvas]]

## 단축키 몇 가지
| 기능 | 단축키 |
| --- | --- |
| 명령 팔레트 | Ctrl+P |
| 빠른 전환 | Ctrl+O |
| 검색 | Ctrl+Shift+F |
| 오늘의 메모 | Alt+D |
| 그래프 보기 | Ctrl+G |

#안내
`,
    '링크와 백링크.md': `---
tags: [안내/링크]
---
# 링크와 백링크

- 메모 링크: [[시작하기]]
- 별칭으로 표시: [[시작하기|첫 화면으로]]
- 제목으로 링크: [[서식 모음#표]]
- 블록으로 링크: [[서식 모음#^quote]]
- 아직 없는 메모: [[나중에 쓸 메모]] (누르면 새로 만듭니다)

## 끼워 넣기(임베드)
\`![[ ]]\`는 다른 메모의 내용을 그대로 보여 줍니다.

![[서식 모음#콜아웃]]

## 백링크
오른쪽 패널의 **백링크** 탭은 이 메모를 가리키는 다른 메모를 보여 줍니다. *연결되지 않은 언급*은 이름만 적고 링크하지 않은 곳입니다 — 단추 하나로 링크로 바꿀 수 있습니다.

메모 이름을 바꾸면 모든 링크가 **자동으로** 고쳐집니다(Rust 코어).
`,
    '서식 모음.md': `---
tags: [안내/서식]
status: 완료
rating: 5
---
# 서식 모음

**굵게**, *기울임*, ~~취소선~~, ==형광펜==, \`코드\`, 이모지 :smile: :rocket: %%보이지 않는 주석%%

## 목록
1. 번호 목록
   - 중첩 목록
   - [x] 끝난 일
   - [ ] 남은 일
2. 두 번째

## 표
| 이름 | 수량 | 가격 |
| :--- | ---: | :---: |
| 사과 | 3 | 1,500 |
| 배 | 1 | 3,000 |

## 인용
> 링크는 생각을 잇는 다리입니다.
> — MyMarkdownMaster ^quote

## 콜아웃
> [!note] 참고
> 콜아웃은 \`> [!종류] 제목\`으로 씁니다.

> [!warning]- 접힌 콜아웃 (눌러서 펼치기)
> 제목 뒤의 \`-\`는 처음에 접힌 상태, \`+\`는 펼친 상태입니다.

> [!success] 성공
> note, info, tip, success, question, warning, failure, danger, bug, example, quote …

## 코드
\`\`\`js
function hello(name) {
  return \`안녕, \${name}!\`;
}
\`\`\`

## 각주
각주도 됩니다.[^1]

[^1]: 각주는 문서 아래에 모입니다.

---
[TOC]
`,
    '수식과 다이어그램.md': `---
tags: [안내/수식]
---
# 수식과 다이어그램

인라인 수식 $a^2 + b^2 = c^2$ 과 블록 수식:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Mermaid
\`\`\`mermaid
graph LR
  A[메모] --> B{링크?}
  B -- 예 --> C[백링크]
  B -- 아니오 --> D[연결되지 않은 언급]
\`\`\`

## 차트
\`\`\`chart
type: bar
labels: [1월, 2월, 3월, 4월]
series:
  - title: 메모 수
    data: [12, 19, 23, 31]
  - title: 링크 수
    data: [20, 35, 41, 60]
\`\`\`
`,
    '할 일 관리.md': `---
tags: [안내/작업]
---
# 할 일 관리

- [ ] 보관함 둘러보기 #할일
- [ ] [[AI 도우미]] 설정하기
- [x] MyMarkdownMaster 설치
- [ ] 오늘의 메모 만들기 (Alt+D)

검색 패널에서 \`task-todo:\`로 끝나지 않은 작업만 찾을 수 있습니다.
`,
    'AI 도우미.md': `---
tags: [안내/AI]
---
# AI 도우미

설정 › **AI**에서 공급자(OpenAI, Anthropic Claude, Google Gemini, Mistral, Groq, DeepSeek, xAI, OpenRouter, Perplexity, Together, Azure OpenAI, Ollama, LM Studio, 사용자 지정)를 고르고 API 키를 넣습니다.

- 오른쪽 패널의 **AI** 탭에서 대화하고, 답을 메모에 넣거나 바꿉니다.
- 선택한 글에서 오른쪽 클릭 › AI: 요약, 이어 쓰기, 다듬기, 번역, 태그 만들기 …
- 데스크톱 앱은 Rust 백엔드를 통해 요청하므로 브라우저 제약(CORS)이 없습니다.

> [!info] 키는 이 컴퓨터에만 저장됩니다.
`,
    '글쓰기 도구.md': `---
tags: [안내/글쓰기]
goal: 300
---
# 글쓰기 도구

iA Writer, Typora, Ulysses, Bear에서 영감을 받은 기능입니다.

- **집중 모드**: 지금 문장·줄·문단만 또렷하게
- **타자기 스크롤**: 쓰는 줄이 늘 화면 가운데
- **문체 검사**: 군더더기 말(정말, 그냥, 아주), 중복 표현(미리 예약), 긴 문장, 같은 낱말 반복
- **목표**: 오른쪽 *통계* 탭에서 단어 수 목표와 진행률
- **발표 모드**: 전체 화면에서 글자 크기·줄 간격·폭 조절, 또는 \`---\`로 나눈 슬라이드

정말 아주 그냥 미리 예약했던 것 같다. ← 문체 검사를 켜면 밑줄이 생깁니다.
`,
    '내보내기.md': `---
tags: [안내/내보내기]
---
# 내보내기

파일 › 내보내기에서 형식을 고릅니다. Rust 코어가 만듭니다.

HTML(스타일 포함/없음), PDF, Word(.docx), OpenDocument(.odt), EPUB, RTF, LaTeX, Markdown, 일반 텍스트, Djot, reStructuredText, AsciiDoc, MediaWiki, Textile, OPML, Org, JSON.

**다시 내보내기**(Ctrl+Alt+E)는 마지막 형식으로 바로 내보냅니다. **Markdown으로 복사**는 임베드와 링크를 풀어 다른 곳에 붙일 수 있는 Markdown을 복사합니다.
`,
    [`일일 메모/${today()}.md`]: `---
tags: [일일]
---
# ${today()}

- 오늘 [[시작하기]]를 읽었다.
- [ ] [[할 일 관리]] 정리하기
`,
    [`일일 메모/${day(-1)}.md`]: `# ${day(-1)}\n\n어제의 메모. 다음 메모: [[${today()}]]\n`,
    '템플릿/일일 메모.md': `---
tags: [일일]
date: {{date}}
---
# {{date:YYYY년 M월 D일 dddd}}

## 오늘 할 일
- [ ]

## 메모

`,
    '템플릿/회의록.md': `---
tags: [회의]
date: {{date}}
---
# {{title}}

- 일시: {{date}} {{time}}
- 참석자:

## 안건

## 결정 사항

## 할 일
- [ ]
`,
    '아이디어 보드.canvas': canvas([
      { id: 'a1b2c3d4e5f60001', type: 'text', text: '# 아이디어 보드\n캔버스에 카드를 놓고 선으로 잇습니다.', x: -380, y: -200, width: 320, height: 140, color: '5' },
      { id: 'a1b2c3d4e5f60002', type: 'file', file: '시작하기.md', x: 40, y: -240, width: 360, height: 260 },
      { id: 'a1b2c3d4e5f60003', type: 'text', text: '빈 곳을 두 번 누르면 새 카드', x: -380, y: 40, width: 280, height: 80, color: '4' },
      { id: 'a1b2c3d4e5f60004', type: 'group', label: '그룹', x: -420, y: -260, width: 860, height: 420 },
    ], [{ id: 'e1e2e3e4e5e60001', fromNode: 'a1b2c3d4e5f60001', fromSide: 'right', toNode: 'a1b2c3d4e5f60002', toSide: 'left', label: '연결' }]),
  }),
  en: () => ({
    'Welcome.md': `---
tags: [guide, start]
aliases: [Home]
created: ${today()}
---
# Welcome to MyMarkdownMaster 👋

This vault is a set of **linked notes**. Open notes from the *Files* panel on the left, and look at [[Links and backlinks|backlinks]] and the *Outline* on the right.

> [!tip] Four views
> The **Live / Source / Reading / Split** buttons above a note switch views. *Split* shows the source beside a preview; each half folds away and back.

## Tour
- [[Links and backlinks]] — joining notes with \`[[ ]]\`
- [[Formatting]] — headings, lists, tables, footnotes, ==highlights==, callouts
- [[Math and diagrams]] — $E=mc^2$, Mermaid, charts
- [[Tasks]] — checklists and task search
- [[AI assistant]] — many AI APIs
- [[Writing tools]] — focus mode, typewriter scrolling, style check, goals
- [[Export]] — HTML, PDF, Word, EPUB and more
- Canvas: [[Idea board.canvas]]

## A few shortcuts
| Action | Keys |
| --- | --- |
| Command palette | Ctrl+P |
| Quick switcher | Ctrl+O |
| Search | Ctrl+Shift+F |
| Today's note | Alt+D |
| Graph view | Ctrl+G |

#guide
`,
    'Links and backlinks.md': `---
tags: [guide/links]
---
# Links and backlinks

- Link a note: [[Welcome]]
- Show other text: [[Welcome|back home]]
- Link a heading: [[Formatting#Tables]]
- Link a block: [[Formatting#^quote]]
- A note that does not exist yet: [[Someday note]] (click to create it)

## Embeds
\`![[ ]]\` shows another note's content in place.

![[Formatting#Callouts]]

## Backlinks
The **Backlinks** tab lists the notes that link here. *Unlinked mentions* name this note without linking — one click turns them into links.

Renaming a note updates every link to it **automatically** (the Rust core).
`,
    'Formatting.md': `---
tags: [guide/formatting]
status: done
rating: 5
---
# Formatting

**Bold**, *italic*, ~~strike~~, ==highlight==, \`code\`, emoji :smile: :rocket: %%a hidden comment%%

## Lists
1. Numbered
   - Nested
   - [x] Done
   - [ ] To do
2. Second

## Tables
| Name | Qty | Price |
| :--- | ---: | :---: |
| Apple | 3 | 1.50 |
| Pear | 1 | 3.00 |

## Quote
> Links are bridges between thoughts.
> — MyMarkdownMaster ^quote

## Callouts
> [!note] Note
> Write callouts as \`> [!type] Title\`.

> [!warning]- A folded callout (click to open)
> A \`-\` after the type starts folded, \`+\` starts open.

> [!success] Success
> note, info, tip, success, question, warning, failure, danger, bug, example, quote …

## Code
\`\`\`js
function hello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Footnotes
Footnotes work too.[^1]

[^1]: They gather at the end.

---
[TOC]
`,
    'Math and diagrams.md': `---
tags: [guide/math]
---
# Math and diagrams

Inline $a^2 + b^2 = c^2$ and a block:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Mermaid
\`\`\`mermaid
graph LR
  A[Note] --> B{Linked?}
  B -- yes --> C[Backlink]
  B -- no --> D[Unlinked mention]
\`\`\`

## Chart
\`\`\`chart
type: line
labels: [Jan, Feb, Mar, Apr]
series:
  - title: Notes
    data: [12, 19, 23, 31]
  - title: Links
    data: [20, 35, 41, 60]
\`\`\`
`,
    'Tasks.md': `---
tags: [guide/tasks]
---
# Tasks

- [ ] Look around the vault #todo
- [ ] Set up the [[AI assistant]]
- [x] Install MyMarkdownMaster
- [ ] Make today's note (Alt+D)

In Search, \`task-todo:\` finds the open tasks only.
`,
    'AI assistant.md': `---
tags: [guide/ai]
---
# AI assistant

In Settings › **AI** pick a provider (OpenAI, Anthropic Claude, Google Gemini, Mistral, Groq, DeepSeek, xAI, OpenRouter, Perplexity, Together, Azure OpenAI, Ollama, LM Studio or a custom one) and enter its API key.

- Chat in the **AI** tab of the right panel; insert or replace text with the answers.
- Right-click selected text › AI: summarize, continue, improve, translate, make tags …
- The desktop app sends requests through its Rust backend: no browser (CORS) limits.

> [!info] Keys are stored on this computer only.
`,
    'Writing tools.md': `---
tags: [guide/writing]
goal: 300
---
# Writing tools

Ideas from iA Writer, Typora, Ulysses and Bear.

- **Focus mode**: only the current sentence, line or paragraph stays sharp
- **Typewriter scrolling**: the line you write stays in the middle
- **Style check**: fillers (very, really, just), redundancies (end result), clichés, passive voice, long sentences, doubled words
- **Goals**: a word-count goal with progress in the *Statistics* tab
- **Presentation**: full-screen reading with size, spacing and width controls, or slides split at \`---\`

This is really just the the end result. ← turn on the style check to see the underlines.
`,
    'Export.md': `---
tags: [guide/export]
---
# Export

File › Export, then pick a format. The Rust core writes it.

HTML (styled or plain), PDF, Word (.docx), OpenDocument (.odt), EPUB, RTF, LaTeX, Markdown, plain text, Djot, reStructuredText, AsciiDoc, MediaWiki, Textile, OPML, Org and JSON.

**Export again** (Ctrl+Alt+E) repeats the last export. **Copy as Markdown** copies portable Markdown with embeds and links resolved.
`,
    [`Daily/${today()}.md`]: `---
tags: [daily]
---
# ${today()}

- Read [[Welcome]] today.
- [ ] Tidy up [[Tasks]]
`,
    [`Daily/${day(-1)}.md`]: `# ${day(-1)}\n\nYesterday's note. Next: [[${today()}]]\n`,
    'Templates/Daily note.md': `---
tags: [daily]
date: {{date}}
---
# {{date:dddd, MMMM Do YYYY}}

## Today
- [ ]

## Notes

`,
    'Templates/Meeting.md': `---
tags: [meeting]
date: {{date}}
---
# {{title}}

- When: {{date}} {{time}}
- Who:

## Agenda

## Decisions

## Actions
- [ ]
`,
    'Idea board.canvas': canvas([
      { id: 'a1b2c3d4e5f60001', type: 'text', text: '# Idea board\nPut cards on the canvas and join them.', x: -380, y: -200, width: 320, height: 140, color: '5' },
      { id: 'a1b2c3d4e5f60002', type: 'file', file: 'Welcome.md', x: 40, y: -240, width: 360, height: 260 },
      { id: 'a1b2c3d4e5f60003', type: 'text', text: 'Double-click empty space for a new card', x: -380, y: 40, width: 280, height: 80, color: '4' },
      { id: 'a1b2c3d4e5f60004', type: 'group', label: 'Group', x: -420, y: -260, width: 860, height: 420 },
    ], [{ id: 'e1e2e3e4e5e60001', fromNode: 'a1b2c3d4e5f60001', fromSide: 'right', toNode: 'a1b2c3d4e5f60002', toSide: 'left', label: 'joins' }]),
  }),
};

const ZETTEL = {
  ko: () => ({
    '색인.md': '# 색인 (Zettelkasten)\n\n이 보관함은 *제텔카스텐* 방식의 예입니다: 메모 하나에 생각 하나, 고유 번호, 링크.\n\n- [[202401011200 원자적 메모]]\n- [[202401011230 링크는 맥락이다]]\n- [[202401011300 생각은 연결에서 자란다]]\n\n#색인\n',
    '202401011200 원자적 메모.md': '---\ntags: [제텔카스텐/원칙]\n---\n# 원자적 메모\n\n메모 하나에는 **생각 하나**만 담는다. 그래야 다른 메모와 자유롭게 이을 수 있다.\n\n다음: [[202401011230 링크는 맥락이다]]\n',
    '202401011230 링크는 맥락이다.md': '---\ntags: [제텔카스텐/원칙]\n---\n# 링크는 맥락이다\n\n링크를 걸 때 *왜* 잇는지 한 줄로 적는다. [[202401011200 원자적 메모]]가 링크의 단위가 된다.\n\n> [!quote] 니클라스 루만\n> 메모 상자는 대화 상대다.\n\n다음: [[202401011300 생각은 연결에서 자란다]]\n',
    '202401011300 생각은 연결에서 자란다.md': '---\ntags: [제텔카스텐/통찰]\n---\n# 생각은 연결에서 자란다\n\n그래프 보기(Ctrl+G)에서 연결이 많은 메모가 큰 점으로 보인다. [[색인]]에서 출발해 보자.\n',
  }),
  en: () => ({
    'Index.md': '# Index (Zettelkasten)\n\nA *Zettelkasten* example: one idea per note, a unique id, links.\n\n- [[202401011200 Atomic notes]]\n- [[202401011230 Links are context]]\n- [[202401011300 Ideas grow from connections]]\n\n#index\n',
    '202401011200 Atomic notes.md': '---\ntags: [zettelkasten/principle]\n---\n# Atomic notes\n\nOne note holds **one idea**, so it can join any other note.\n\nNext: [[202401011230 Links are context]]\n',
    '202401011230 Links are context.md': '---\ntags: [zettelkasten/principle]\n---\n# Links are context\n\nWhen linking, write one line about *why*. [[202401011200 Atomic notes]] are the unit of linking.\n\n> [!quote] Niklas Luhmann\n> The slip box is a partner in conversation.\n\nNext: [[202401011300 Ideas grow from connections]]\n',
    '202401011300 Ideas grow from connections.md': '---\ntags: [zettelkasten/insight]\n---\n# Ideas grow from connections\n\nIn the graph view (Ctrl+G) well-linked notes show as bigger dots. Start from the [[Index]].\n',
  }),
};

const PROJECT = {
  ko: () => ({
    '프로젝트 대시보드.md': `---\ntags: [프로젝트]\nstatus: 진행 중\ndue: ${day(30)}\n---\n# 웹사이트 개편 프로젝트\n\n> [!abstract] 요약\n> 회사 웹사이트를 새로 만든다. 마감 ${day(30)}.\n\n## 진행 상황\n\`\`\`chart\ntype: pie\nlabels: [완료, 진행 중, 예정]\nseries:\n  - title: 작업\n    data: [4, 3, 5]\n\`\`\`\n\n## 일정\n\`\`\`mermaid\ngantt\n  title 일정\n  dateFormat YYYY-MM-DD\n  section 설계\n  요구 사항 :done, a1, ${day(-10)}, 5d\n  디자인 :active, a2, ${day(-4)}, 10d\n  section 개발\n  구현 : a3, after a2, 12d\n\`\`\`\n\n- [[회의록 - 착수]]\n- [[요구 사항]]\n- [[작업 목록]]\n`,
    '요구 사항.md': '---\ntags: [프로젝트/문서]\n---\n# 요구 사항\n\n1. 모바일 대응 ^req-mobile\n2. 다국어 (한국어, 영어)\n3. 검색\n\n[[프로젝트 대시보드]]로 돌아가기\n',
    '작업 목록.md': '---\ntags: [프로젝트/작업]\n---\n# 작업 목록\n\n- [x] 요구 사항 정리\n- [x] 경쟁사 조사\n- [ ] 디자인 시안 #디자인\n- [ ] 모바일 레이아웃 ([[요구 사항#^req-mobile]])\n- [ ] 검색 기능\n',
    '회의록 - 착수.md': `---\ntags: [회의]\ndate: ${day(-10)}\n---\n# 착수 회의\n\n- 참석: 김, 이, 박\n- 결정: [[요구 사항]] 확정\n\n> [!todo] 다음 할 일\n> [[작업 목록]] 갱신\n`,
  }),
  en: () => ({
    'Project dashboard.md': `---\ntags: [project]\nstatus: active\ndue: ${day(30)}\n---\n# Website redesign\n\n> [!abstract] Summary\n> Rebuild the company website. Due ${day(30)}.\n\n## Progress\n\`\`\`chart\ntype: pie\nlabels: [Done, In progress, Planned]\nseries:\n  - title: Tasks\n    data: [4, 3, 5]\n\`\`\`\n\n## Schedule\n\`\`\`mermaid\ngantt\n  title Schedule\n  dateFormat YYYY-MM-DD\n  section Design\n  Requirements :done, a1, ${day(-10)}, 5d\n  Design :active, a2, ${day(-4)}, 10d\n  section Build\n  Implementation : a3, after a2, 12d\n\`\`\`\n\n- [[Meeting - kickoff]]\n- [[Requirements]]\n- [[Task list]]\n`,
    'Requirements.md': '---\ntags: [project/docs]\n---\n# Requirements\n\n1. Mobile friendly ^req-mobile\n2. Two languages\n3. Search\n\nBack to the [[Project dashboard]]\n',
    'Task list.md': '---\ntags: [project/tasks]\n---\n# Task list\n\n- [x] Gather requirements\n- [x] Competitor review\n- [ ] Design drafts #design\n- [ ] Mobile layout ([[Requirements#^req-mobile]])\n- [ ] Search\n',
    'Meeting - kickoff.md': `---\ntags: [meeting]\ndate: ${day(-10)}\n---\n# Kickoff meeting\n\n- Who: Kim, Lee, Park\n- Decided: [[Requirements]] fixed\n\n> [!todo] Next\n> Update the [[Task list]]\n`,
  }),
};

const JOURNAL = {
  ko: () => Object.fromEntries([...Array(7)].map((_, i) => [`일기/${day(-i)}.md`, `---\ntags: [일기]\nmood: ${['😊', '😐', '🙂', '😄', '😌', '🤔', '😎'][i]}\nsleep: ${6 + (i % 3)}\n---\n# ${day(-i)}\n\n## 감사한 일\n- 따뜻한 커피 ☕\n\n## 오늘\n${i ? `어제는 [[${day(-i + 1)}]]` : '새로운 하루.'}\n\n- [${i % 2 ? 'x' : ' '}] 운동 30분 #습관\n- [x] 책 읽기 #습관\n`])),
  en: () => Object.fromEntries([...Array(7)].map((_, i) => [`Journal/${day(-i)}.md`, `---\ntags: [journal]\nmood: ${['😊', '😐', '🙂', '😄', '😌', '🤔', '😎'][i]}\nsleep: ${6 + (i % 3)}\n---\n# ${day(-i)}\n\n## Grateful for\n- A warm coffee ☕\n\n## Today\n${i ? `See [[${day(-i + 1)}]]` : 'A new day.'}\n\n- [${i % 2 ? 'x' : ' '}] 30 min exercise #habit\n- [x] Reading #habit\n`])),
};

const RESEARCH = {
  ko: () => ({
    '연구 개요.md': '---\ntags: [연구]\n---\n# 연구 개요: 수면과 기억\n\n- 문헌: [[문헌 - Walker 2017]], [[문헌 - Stickgold 2005]]\n- 가설: [[가설]]\n\n수면 중 기억 강화는 $\\Delta M = k \\cdot t_{SWS}$ 로 단순화할 수 있다.\n',
    '가설.md': '---\ntags: [연구/가설]\n---\n# 가설\n\n> [!question] 서파 수면 시간이 길수록 다음 날 회상 점수가 높은가?\n\n근거: ![[문헌 - Walker 2017#핵심 주장]]\n',
    '문헌 - Walker 2017.md': '---\ntags: [문헌]\nauthor: Matthew Walker\nyear: 2017\n---\n# Why We Sleep\n\n## 핵심 주장\n수면은 기억을 **정리하고 강화**한다.[^w]\n\n[^w]: Walker, M. (2017). *Why We Sleep*.\n',
    '문헌 - Stickgold 2005.md': '---\ntags: [문헌]\nauthor: Robert Stickgold\nyear: 2005\n---\n# Sleep-dependent memory consolidation\n\nNature 437, 1272–1278. 관련: [[가설]]\n',
  }),
  en: () => ({
    'Research overview.md': '---\ntags: [research]\n---\n# Overview: sleep and memory\n\n- Literature: [[Lit - Walker 2017]], [[Lit - Stickgold 2005]]\n- [[Hypothesis]]\n\nA simplified model: $\\Delta M = k \\cdot t_{SWS}$.\n',
    'Hypothesis.md': '---\ntags: [research/hypothesis]\n---\n# Hypothesis\n\n> [!question] Does longer slow-wave sleep raise next-day recall?\n\nSupport: ![[Lit - Walker 2017#Key claim]]\n',
    'Lit - Walker 2017.md': '---\ntags: [literature]\nauthor: Matthew Walker\nyear: 2017\n---\n# Why We Sleep\n\n## Key claim\nSleep **sorts and strengthens** memories.[^w]\n\n[^w]: Walker, M. (2017). *Why We Sleep*.\n',
    'Lit - Stickgold 2005.md': '---\ntags: [literature]\nauthor: Robert Stickgold\nyear: 2005\n---\n# Sleep-dependent memory consolidation\n\nNature 437, 1272–1278. See [[Hypothesis]]\n',
  }),
};

const WRITING = {
  ko: () => ({
    '소설/0 개요.md': '---\ntags: [소설]\ngoal: 5000\n---\n# 등대지기 (가제)\n\n## 장\n1. [[1장 폭풍]]\n2. [[2장 편지]]\n\n## 인물\n- [[인물 - 하윤]]\n',
    '소설/1장 폭풍.md': '---\ntags: [소설/원고]\ngoal: 1500\n---\n# 1장 폭풍\n\n바람이 등대의 유리를 두드렸다. [[인물 - 하윤]]은 램프의 심지를 다듬으며 수평선을 보았다.\n\n%% 여기서 편지 복선을 깔 것 %%\n',
    '소설/2장 편지.md': '---\ntags: [소설/원고]\ngoal: 1500\n---\n# 2장 편지\n\n아침이 되자 바닷가에 젖은 봉투 하나가 밀려와 있었다.\n',
    '소설/인물 - 하윤.md': '---\ntags: [소설/인물]\nage: 34\n---\n# 하윤\n\n등대지기. 말수가 적고 기록을 좋아한다.\n',
  }),
  en: () => ({
    'Novel/0 Outline.md': '---\ntags: [novel]\ngoal: 5000\n---\n# The Lighthouse Keeper (draft)\n\n## Chapters\n1. [[Chapter 1 The storm]]\n2. [[Chapter 2 The letter]]\n\n## Characters\n- [[Character - Hayun]]\n',
    'Novel/Chapter 1 The storm.md': '---\ntags: [novel/draft]\ngoal: 1500\n---\n# Chapter 1 — The storm\n\nWind beat at the lighthouse glass. [[Character - Hayun]] trimmed the wick and watched the horizon.\n\n%% foreshadow the letter here %%\n',
    'Novel/Chapter 2 The letter.md': '---\ntags: [novel/draft]\ngoal: 1500\n---\n# Chapter 2 — The letter\n\nBy morning a wet envelope lay on the shore.\n',
    'Novel/Character - Hayun.md': '---\ntags: [novel/character]\nage: 34\n---\n# Hayun\n\nThe keeper. Few words, many notebooks.\n',
  }),
};

const SETS = {
  guide: { glyph: 'userGuide', files: GUIDE, start: { ko: '시작하기.md', en: 'Welcome.md' } },
  zettelkasten: { glyph: 'graphView', files: ZETTEL, start: { ko: '색인.md', en: 'Index.md' } },
  project: { glyph: 'kanban', files: PROJECT, start: { ko: '프로젝트 대시보드.md', en: 'Project dashboard.md' } },
  journal: { glyph: 'calendar', files: JOURNAL, start: { ko: `일기/${day(0)}.md`, en: `Journal/${day(0)}.md` } },
  research: { glyph: 'flask', files: RESEARCH, start: { ko: '연구 개요.md', en: 'Research overview.md' } },
  writing: { glyph: 'pen', files: WRITING, start: { ko: '소설/0 개요.md', en: 'Novel/0 Outline.md' } },
};

export const SAMPLE_IDS = Object.keys(SETS);
export const sampleGlyph = (id) => SETS[id]?.glyph ?? 'samples';
export function sampleFiles(id, language) { const set = SETS[id] ?? SETS.guide; return set.files[language === 'en' ? 'en' : 'ko'](); }
export const sampleStart = (id, language) => (SETS[id] ?? SETS.guide).start[language === 'en' ? 'en' : 'ko'];
