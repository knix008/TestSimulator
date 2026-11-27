// Built-in template library for MyMarkdownMaster.
// Bodies are expanded by the Rust core; supported placeholders:
//   {{title}} {{date}} {{time}} {{date:FORMAT}} {{time:FORMAT}} {{yesterday}} {{tomorrow}}

const F = '```';

export const TEMPLATE_CATEGORIES = [
  { id: 'daily', label: { ko: '일상·일기', en: 'Daily & Journal' }, icon: 'calendar' },
  { id: 'meeting', label: { ko: '회의', en: 'Meetings' }, icon: 'users' },
  { id: 'project', label: { ko: '프로젝트·업무', en: 'Projects & Work' }, icon: 'briefcase' },
  { id: 'study', label: { ko: '공부·연구', en: 'Study & Research' }, icon: 'book' },
  { id: 'writing', label: { ko: '글쓰기', en: 'Writing' }, icon: 'edit' },
  { id: 'life', label: { ko: '생활', en: 'Personal & Life' }, icon: 'home' },
  { id: 'planning', label: { ko: '계획·회고', en: 'Planning & Review' }, icon: 'target' },
  { id: 'knowledge', label: { ko: '지식 관리', en: 'Knowledge Management' }, icon: 'bulb' },
];

function entry(id, category, icon, color, name, description, ko, en) {
  return { id, category, icon, color, name, description, body: { ko, en } };
}

export const TEMPLATE_LIBRARY = [
  // ───────────── daily ─────────────
  entry('daily-note', 'daily', 'calendar', '#4f7cff',
    { ko: '데일리 노트', en: 'Daily Note' },
    { ko: '오늘 할 일, 메모, 하루 정리를 한 장에', en: 'Tasks, notes and a short wrap-up for the day' },
`---
tags: [daily]
created: {{date}}
---
# {{date:YYYY-MM-DD dddd}}

← [[{{yesterday}}]] · [[{{tomorrow}}]] →

## 오늘의 핵심 한 가지
-

## 할 일
- [ ]
- [ ]
- [ ]

## 일정
| 시간 | 내용 |
| --- | --- |
| 09:00 |  |
| 14:00 |  |

## 메모


## 하루 정리
- 잘한 점:
- 아쉬운 점:
- 내일 이어서 할 것:
`,
`---
tags: [daily]
created: {{date}}
---
# {{date:dddd, YYYY-MM-DD}}

← [[{{yesterday}}]] · [[{{tomorrow}}]] →

## One thing that matters today
-

## Tasks
- [ ]
- [ ]
- [ ]

## Schedule
| Time | What |
| --- | --- |
| 09:00 |  |
| 14:00 |  |

## Notes


## End of day
- What went well:
- What didn't:
- Carry over to tomorrow:
`),

  entry('gratitude-journal', 'daily', 'heart', '#e5577a',
    { ko: '감사 일기', en: 'Gratitude Journal' },
    { ko: '감사한 일 세 가지와 오늘의 작은 기쁨', en: 'Three things you are grateful for and a small win' },
`---
tags: [journal, gratitude]
created: {{date}}
---
# 감사 일기 — {{date}}

> [!tip] 거창하지 않아도 괜찮아요
> 따뜻한 커피 한 잔, 누군가의 짧은 인사처럼 작은 것부터 적어 보세요.

## 오늘 감사한 일
1.
2.
3.

## 오늘의 작은 기쁨
-

## 고마운 사람
- [[]] — 이유:

## 나에게 해 주고 싶은 말


## 오늘 기분 (1–5)
-
`,
`---
tags: [journal, gratitude]
created: {{date}}
---
# Gratitude — {{date}}

> [!tip] Keep it small
> A good cup of coffee or a kind word from a stranger counts.

## Three things I'm grateful for
1.
2.
3.

## Small win of the day
-

## Someone I appreciate
- [[]] — because:

## A note to myself


## Mood (1–5)
-
`),

  entry('dream-log', 'daily', 'sparkles', '#8b5cf6',
    { ko: '꿈 일기', en: 'Dream Log' },
    { ko: '깨자마자 꿈의 장면과 감정을 기록', en: 'Capture scenes and feelings right after waking' },
`---
tags: [journal, dream]
created: {{date}}
lucid: false
---
# 꿈 기록 — {{date}} {{time}}

## 한 줄 요약


## 장면
- 장소:
- 등장인물:
- 일어난 일:

## 느낌과 감정
-

## 반복되는 상징
- #꿈/상징

## 현실과의 연결
> [!question] 요즘 신경 쓰이는 일과 관련이 있을까?
>

## 잠 상태
- 잠든 시각:
- 깬 시각:
- 숙면 정도 (1–5):
`,
`---
tags: [journal, dream]
created: {{date}}
lucid: false
---
# Dream — {{date}} {{time}}

## In one line


## Scenes
- Setting:
- People:
- What happened:

## Feelings
-

## Recurring symbols
- #dream/symbol

## Waking-life connections
> [!question] Does this relate to anything on my mind lately?
>

## Sleep
- Fell asleep:
- Woke up:
- Sleep quality (1–5):
`),

  entry('evening-review', 'daily', 'clock', '#f59e0b',
    { ko: '저녁 돌아보기', en: 'Evening Review' },
    { ko: '자기 전 5분, 하루를 짧게 되짚기', en: 'A five-minute look back before bed' },
`---
tags: [daily, review]
created: {{date}}
---
# 저녁 돌아보기 — {{date}}

## 오늘 한 일
- [x]
- [ ]

## 에너지 흐름
| 시간대 | 에너지 (1–5) | 메모 |
| --- | --- | --- |
| 오전 |  |  |
| 오후 |  |  |
| 저녁 |  |  |

## 배운 것 하나


## 내일 가장 먼저 할 일
- [ ]

## 잠들기 전 한마디
==오늘도 수고했어.==
`,
`---
tags: [daily, review]
created: {{date}}
---
# Evening review — {{date}}

## What I did today
- [x]
- [ ]

## Energy
| Part of day | Energy (1–5) | Notes |
| --- | --- | --- |
| Morning |  |  |
| Afternoon |  |  |
| Evening |  |  |

## One thing I learned


## First thing tomorrow
- [ ]

## Before sleep
==Good job today.==
`),

  // ───────────── meeting ─────────────
  entry('meeting-minutes', 'meeting', 'users', '#2563eb',
    { ko: '회의록', en: 'Meeting Minutes' },
    { ko: '안건, 논의, 결정 사항, 할 일까지 정리', en: 'Agenda, discussion, decisions and action items' },
`---
tags: [meeting]
date: {{date}}
attendees: []
---
# {{title}}

- 일시: {{date}} {{time}}
- 장소/링크:
- 참석자:
- 작성자:

## 안건
1.
2.

## 논의 내용
### 1.
-

### 2.
-

## 결정 사항
> [!note] 결정
> -

## 할 일
| 담당 | 내용 | 기한 |
| --- | --- | --- |
|  |  |  |

## 다음 회의
- 일시:
- 준비할 것:
`,
`---
tags: [meeting]
date: {{date}}
attendees: []
---
# {{title}}

- When: {{date}} {{time}}
- Where / link:
- Attendees:
- Note taker:

## Agenda
1.
2.

## Discussion
### 1.
-

### 2.
-

## Decisions
> [!note] Decided
> -

## Action items
| Owner | Task | Due |
| --- | --- | --- |
|  |  |  |

## Next meeting
- When:
- Prep:
`),

  entry('one-on-one', 'meeting', 'users', '#0ea5e9',
    { ko: '1:1 면담', en: '1:1 Meeting' },
    { ko: '팀원과의 정기 면담 기록', en: 'Notes for a recurring one-on-one' },
`---
tags: [meeting, 1on1]
date: {{date}}
with:
---
# 1:1 — {{title}} ({{date}})

## 지난번 약속 확인
- [ ]

## 요즘 어떻게 지내요?
- 컨디션/근황:

## 업무 이야기
- 잘 되고 있는 것:
- 막혀 있는 것:
- 도움이 필요한 것:

## 성장과 커리어
-

## 피드백
- 내가 받은 피드백:
- 내가 전한 피드백:

## 다음까지 할 일
- [ ]
- [ ]
`,
`---
tags: [meeting, 1on1]
date: {{date}}
with:
---
# 1:1 — {{title}} ({{date}})

## Follow-ups from last time
- [ ]

## How are you doing?
- Energy / personal:

## Work
- Going well:
- Blocked on:
- Where I can help:

## Growth & career
-

## Feedback
- Received:
- Given:

## Action items
- [ ]
- [ ]
`),

  entry('standup', 'meeting', 'clock', '#14b8a6',
    { ko: '데일리 스탠드업', en: 'Daily Standup' },
    { ko: '어제 한 일, 오늘 할 일, 막힌 점', en: 'Yesterday, today and blockers' },
`---
tags: [meeting, standup]
date: {{date}}
---
# 스탠드업 — {{date:YYYY-MM-DD (ddd)}}

## 어제 한 일
-

## 오늘 할 일
- [ ]
- [ ]

## 막힌 점
> [!warning] 도움 필요
> -

## 공유 사항
-
`,
`---
tags: [meeting, standup]
date: {{date}}
---
# Standup — {{date:ddd, YYYY-MM-DD}}

## Yesterday
-

## Today
- [ ]
- [ ]

## Blockers
> [!warning] Need help
> -

## FYI
-
`),

  entry('retrospective', 'meeting', 'graph', '#f97316',
    { ko: '회고 (KPT)', en: 'Retrospective' },
    { ko: 'Keep·Problem·Try로 스프린트 돌아보기', en: 'Look back on a sprint: keep, problems, try' },
`---
tags: [meeting, retro]
date: {{date}}
sprint:
---
# {{title}} 회고

- 기간:
- 참석자:

## 지난 회고 실천 점검
- [ ]

## Keep — 계속할 것
-

## Problem — 문제였던 것
-

## Try — 다음에 시도할 것
-

## 투표 결과
| 항목 | 표 |
| --- | --- |
|  |  |

## 실천 항목
- [ ] (담당: )
- [ ] (담당: )

> [!tip] 실천 항목은 두세 개만
> 다음 회고에서 꼭 확인할 수 있을 만큼만 정하세요.
`,
`---
tags: [meeting, retro]
date: {{date}}
sprint:
---
# {{title}} — Retrospective

- Period:
- Attendees:

## Follow-up on last retro
- [ ]

## Keep
-

## Problems
-

## Try
-

## Votes
| Item | Votes |
| --- | --- |
|  |  |

## Action items
- [ ] (owner: )
- [ ] (owner: )

> [!tip] Keep it to two or three
> Only commit to what you will actually check next time.
`),

  entry('interview-prep', 'meeting', 'search', '#6366f1',
    { ko: '면접 준비', en: 'Interview Prep' },
    { ko: '회사 조사, 예상 질문, 내 경험 정리', en: 'Company research, likely questions, your stories' },
`---
tags: [career, interview]
date: {{date}}
company:
role:
status: 준비 중
---
# {{title}} 면접 준비

## 회사와 직무
- 하는 일:
- 최근 소식:
- 이 직무에서 기대하는 것:

## 지원 동기 (1분 버전)


## 예상 질문과 답변
| 질문 | 핵심 답변 | 관련 경험 |
| --- | --- | --- |
| 자기소개 |  |  |
| 가장 힘들었던 프로젝트 |  |  |
| 갈등을 해결한 경험 |  |  |

## 내 경험 (STAR)
- 상황:
- 과제:
- 행동:
- 결과:

## 내가 할 질문
- [ ]
- [ ]

## 면접 후 메모
-
`,
`---
tags: [career, interview]
date: {{date}}
company:
role:
status: preparing
---
# {{title}} — Interview Prep

## Company & role
- What they do:
- Recent news:
- What the role needs:

## Why this job (one-minute version)


## Likely questions
| Question | Key points | Story |
| --- | --- | --- |
| Tell me about yourself |  |  |
| Hardest project |  |  |
| Handling a conflict |  |  |

## My story (STAR)
- Situation:
- Task:
- Action:
- Result:

## Questions to ask them
- [ ]
- [ ]

## After the interview
-
`),

  // ───────────── project ─────────────
  entry('project-brief', 'project', 'briefcase', '#0f766e',
    { ko: '프로젝트 개요', en: 'Project Brief' },
    { ko: '목표, 범위, 일정, 위험을 한눈에', en: 'Goals, scope, timeline and risks at a glance' },
`---
tags: [project]
created: {{date}}
status: 계획
owner:
---
# {{title}}

> [!note] 한 줄 요약
> 이 프로젝트는 ___을 위해 ___을 만든다.

## 배경
-

## 목표
-
-

## 범위
- 포함:
- 제외:

## 일정
${F}mermaid
gantt
    dateFormat YYYY-MM-DD
    title 주요 일정
    section 준비
    조사        :a1, {{date}}, 7d
    section 실행
    개발        :a2, after a1, 21d
    출시        :milestone, after a2, 0d
${F}

## 이해관계자
| 이름 | 역할 |
| --- | --- |
|  |  |

## 위험 요소
- [ ]

## 성공 기준
-
`,
`---
tags: [project]
created: {{date}}
status: planning
owner:
---
# {{title}}

> [!note] In one sentence
> This project builds ___ so that ___.

## Background
-

## Goals
-
-

## Scope
- In:
- Out:

## Timeline
${F}mermaid
gantt
    dateFormat YYYY-MM-DD
    title Milestones
    section Discovery
    Research    :a1, {{date}}, 7d
    section Delivery
    Build       :a2, after a1, 21d
    Launch      :milestone, after a2, 0d
${F}

## Stakeholders
| Name | Role |
| --- | --- |
|  |  |

## Risks
- [ ]

## Success criteria
-
`),

  entry('prd', 'project', 'file', '#1d4ed8',
    { ko: '제품 요구사항 (PRD)', en: 'Product Requirements (PRD)' },
    { ko: '문제, 사용자, 요구사항, 측정 지표', en: 'Problem, users, requirements and metrics' },
`---
tags: [project, prd]
created: {{date}}
status: draft
version: 0.1
---
# {{title}} — 제품 요구사항

## 문제 정의
- 누가 어떤 불편을 겪는가:
- 근거 (데이터/인터뷰):

## 대상 사용자
- 주 사용자:
- 부 사용자:

## 사용자 시나리오
1.
2.

## 요구사항
| ID | 요구사항 | 우선순위 | 비고 |
| --- | --- | --- | --- |
| R1 |  | 필수 |  |
| R2 |  | 권장 |  |

## 하지 않을 것
-

## 측정 지표
-

## 열린 질문
> [!question]
> -

## 변경 이력
- {{date}} 초안 작성
`,
`---
tags: [project, prd]
created: {{date}}
status: draft
version: 0.1
---
# {{title}} — Product Requirements

## Problem
- Who is hurting and how:
- Evidence (data / interviews):

## Target users
- Primary:
- Secondary:

## User stories
1. As a ___, I want ___ so that ___.
2.

## Requirements
| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| R1 |  | Must |  |
| R2 |  | Should |  |

## Non-goals
-

## Success metrics
-

## Open questions
> [!question]
> -

## Changelog
- {{date}} First draft
`),

  entry('bug-report', 'project', 'search', '#dc2626',
    { ko: '버그 리포트', en: 'Bug Report' },
    { ko: '재현 절차, 기대 결과, 실제 결과, 환경', en: 'Repro steps, expected vs actual, environment' },
`---
tags: [bug]
created: {{date}}
severity: 보통
status: 열림
---
# 🐞 {{title}}

## 요약


## 재현 절차
1.
2.
3.

## 기대한 결과


## 실제 결과


## 환경
| 항목 | 값 |
| --- | --- |
| 버전 |  |
| OS |  |
| 기기 |  |

## 로그 / 스크린샷
${F}text

${F}

## 추정 원인
-

> [!todo] 확인할 것
> - [ ] 최신 버전에서 재현되는지
> - [ ] 다른 환경에서도 생기는지
`,
`---
tags: [bug]
created: {{date}}
severity: medium
status: open
---
# 🐞 {{title}}

## Summary


## Steps to reproduce
1.
2.
3.

## Expected


## Actual


## Environment
| Item | Value |
| --- | --- |
| Version |  |
| OS |  |
| Device |  |

## Logs / screenshots
${F}text

${F}

## Suspected cause
-

> [!todo] To check
> - [ ] Reproduces on the latest build
> - [ ] Happens in other environments
`),

  entry('decision-record', 'project', 'check', '#7c3aed',
    { ko: '결정 기록 (ADR)', en: 'Decision Record (ADR)' },
    { ko: '왜 그렇게 결정했는지 남겨 두는 기록', en: 'Record why a technical decision was made' },
`---
tags: [adr, decision]
date: {{date}}
status: 제안됨
---
# ADR: {{title}}

## 상태
제안됨 · 승인됨 · 폐기됨 · [[대체된 결정]]

## 맥락
어떤 상황과 제약 때문에 결정이 필요했는가?

## 고려한 선택지
| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| A |  |  |
| B |  |  |
| C |  |  |

## 결정
> [!note] 우리는 ___을 선택한다.

## 근거
-

## 결과와 영향
- 좋아지는 점:
- 감수해야 할 점:
- 후속 작업:
`,
`---
tags: [adr, decision]
date: {{date}}
status: proposed
---
# ADR: {{title}}

## Status
Proposed · Accepted · Deprecated · Superseded by [[]]

## Context
What forces and constraints made this decision necessary?

## Options considered
| Option | Pros | Cons |
| --- | --- | --- |
| A |  |  |
| B |  |  |
| C |  |  |

## Decision
> [!note] We will ___.

## Rationale
-

## Consequences
- Better:
- Trade-offs we accept:
- Follow-up work:
`),

  entry('kanban-board', 'project', 'list', '#0891b2',
    { ko: '칸반 작업 목록', en: 'Kanban Task List' },
    { ko: '할 일·진행 중·검토·완료로 나눈 작업판', en: 'Tasks grouped into to do, doing, review, done' },
`---
tags: [project, kanban]
updated: {{date}}
---
# {{title}} 작업판

## 📥 할 일
- [ ]
- [ ]
- [ ]

## 🚧 진행 중
- [ ]
- [ ]

## 👀 검토
- [ ]

## ✅ 완료
- [x]

## 보류
- [ ]

> [!tip] 진행 중은 세 개까지
> 동시에 붙잡은 일이 적을수록 더 빨리 끝납니다.
`,
`---
tags: [project, kanban]
updated: {{date}}
---
# {{title}} board

## 📥 To do
- [ ]
- [ ]
- [ ]

## 🚧 Doing
- [ ]
- [ ]

## 👀 Review
- [ ]

## ✅ Done
- [x]

## Parked
- [ ]

> [!tip] Limit work in progress
> Three items in Doing, at most. Fewer open tasks finish faster.
`),

  entry('release-notes', 'project', 'tag', '#16a34a',
    { ko: '릴리스 노트', en: 'Release Notes' },
    { ko: '새 기능, 개선, 수정, 알려진 문제', en: 'New features, improvements, fixes, known issues' },
`---
tags: [release]
version:
date: {{date}}
---
# {{title}} 릴리스 노트

출시일: {{date}}

## ✨ 새 기능
-

## 🛠 개선
-

## 🐞 버그 수정
-

## ⚠️ 주의할 변경
> [!warning] 업데이트 전에 확인하세요
> -

## 알려진 문제
-

## 고마운 분들
-
`,
`---
tags: [release]
version:
date: {{date}}
---
# {{title}} — Release Notes

Released {{date}}

## ✨ New
-

## 🛠 Improved
-

## 🐞 Fixed
-

## ⚠️ Breaking changes
> [!warning] Read before upgrading
> -

## Known issues
-

## Thanks
-
`),

  // ───────────── study ─────────────
  entry('lecture-notes', 'study', 'book', '#ea580c',
    { ko: '강의 노트', en: 'Lecture Notes' },
    { ko: '강의 핵심, 예시, 질문, 복습 과제', en: 'Key points, examples, questions and review' },
`---
tags: [study, lecture]
course:
date: {{date}}
---
# {{title}}

- 과목:
- 강의자:
- 회차:

## 오늘의 주제


## 핵심 개념
- **개념 1**:
- **개념 2**:

## 예시와 공식
- $ $

## 이해 안 된 부분
> [!question]
> -

## 요약 (세 문장)
1.
2.
3.

## 복습
- [ ] 노트 다시 읽기
- [ ] 연습 문제 풀기
- 관련 노트: [[]]
`,
`---
tags: [study, lecture]
course:
date: {{date}}
---
# {{title}}

- Course:
- Lecturer:
- Session:

## Topic


## Key concepts
- **Concept 1**:
- **Concept 2**:

## Examples & formulas
- $ $

## Still confused about
> [!question]
> -

## Summary (three sentences)
1.
2.
3.

## Review
- [ ] Re-read these notes
- [ ] Do the practice problems
- Related: [[]]
`),

  entry('cornell-notes', 'study', 'table', '#c2410c',
    { ko: '코넬 노트', en: 'Cornell Notes' },
    { ko: '단서·필기·요약 세 칸 정리법', en: 'Cue column, notes and summary' },
`---
tags: [study, cornell]
date: {{date}}
---
# {{title}}

| 단서 / 질문 | 필기 |
| --- | --- |
| 핵심 질문은? |  |
|  |  |
|  |  |
|  |  |
|  |  |

## 요약
이 내용을 한 문단으로 정리하면:


> [!tip] 복습하는 법
> 필기 칸을 가리고 왼쪽 단서만 보며 설명해 보세요.
`,
`---
tags: [study, cornell]
date: {{date}}
---
# {{title}}

| Cues / questions | Notes |
| --- | --- |
| What's the main question? |  |
|  |  |
|  |  |
|  |  |
|  |  |

## Summary
In one paragraph:


> [!tip] How to review
> Cover the notes column and explain each cue out loud.
`),

  entry('paper-summary', 'study', 'file', '#9333ea',
    { ko: '논문 요약', en: 'Paper Summary' },
    { ko: '연구 질문, 방법, 결과, 한계, 내 생각', en: 'Question, method, findings, limits, takeaways' },
`---
tags: [paper, research]
authors:
year:
read: {{date}}
---
# {{title}}

- 저자:
- 학회/저널:
- 링크:

## 한 줄 요약


## 연구 질문
-

## 방법
- 데이터:
- 접근:

## 주요 결과
-

## 한계
-

## 내 생각
> [!note] 내 연구에 쓸 수 있는 점
> -

## 인용할 만한 문장
>

## 관련 논문
- [[]]
`,
`---
tags: [paper, research]
authors:
year:
read: {{date}}
---
# {{title}}

- Authors:
- Venue:
- Link:

## TL;DR


## Research question
-

## Method
- Data:
- Approach:

## Key findings
-

## Limitations
-

## My take
> [!note] Useful for my work
> -

## Quotable
>

## Related papers
- [[]]
`),

  entry('research-log', 'study', 'graph', '#be185d',
    { ko: '연구 일지', en: 'Research Log' },
    { ko: '가설, 실험, 결과, 다음 단계를 날마다', en: 'Daily hypotheses, experiments, results, next steps' },
`---
tags: [research, log]
date: {{date}}
project:
---
# 연구 일지 — {{date}}

## 오늘의 질문 / 가설
-

## 한 일
- [ ]
- [ ]

## 실험 기록
| 실험 | 조건 | 결과 | 메모 |
| --- | --- | --- | --- |
|  |  |  |  |

## 관찰
-

## 문제와 해결
> [!warning] 막힌 곳
> -

## 다음 단계
- [ ]

## 참고
- [[]]
`,
`---
tags: [research, log]
date: {{date}}
project:
---
# Research log — {{date}}

## Question / hypothesis
-

## Done today
- [ ]
- [ ]

## Experiments
| Run | Setup | Result | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

## Observations
-

## Problems & fixes
> [!warning] Stuck on
> -

## Next steps
- [ ]

## References
- [[]]
`),

  entry('book-notes', 'study', 'book', '#b45309',
    { ko: '독서 노트', en: 'Book Notes' },
    { ko: '책 정보, 핵심 내용, 밑줄, 적용할 점', en: 'Book info, key ideas, highlights, actions' },
`---
tags: [book]
author:
started: {{date}}
finished:
rating:
---
# 📚 {{title}}

- 저자:
- 출판사 / 연도:
- 읽게 된 계기:

## 세 줄 요약
1.
2.
3.

## 핵심 내용
### 1장
-

### 2장
-

## 밑줄 친 문장
>

## 내 생각


## 삶에 적용할 점
- [ ]

## 함께 읽을 책
- [[]]
`,
`---
tags: [book]
author:
started: {{date}}
finished:
rating:
---
# 📚 {{title}}

- Author:
- Publisher / year:
- Why I picked it up:

## Summary in three lines
1.
2.
3.

## Key ideas
### Chapter 1
-

### Chapter 2
-

## Highlights
>

## My thoughts


## What I'll apply
- [ ]

## Read next
- [[]]
`),

  // ───────────── writing ─────────────
  entry('blog-post', 'writing', 'edit', '#db2777',
    { ko: '블로그 글', en: 'Blog Post' },
    { ko: '제목, 도입, 본문, 마무리 구조의 초안', en: 'Draft with hook, body and wrap-up' },
`---
tags: [writing, blog]
created: {{date}}
status: 초안
slug:
description:
---
# {{title}}

> [!todo] 발행 전 확인
> - [ ] 제목이 내용을 잘 말해 주는가
> - [ ] 맞춤법 검사
> - [ ] 대표 이미지

## 들어가며
독자가 이 글을 끝까지 읽어야 하는 이유를 먼저 보여 주세요.

## 본론 1


## 본론 2


## 본론 3


## 마치며
- 핵심 한 줄:
- 독자에게 권하는 다음 행동:

---
참고 자료
-
`,
`---
tags: [writing, blog]
created: {{date}}
status: draft
slug:
description:
---
# {{title}}

> [!todo] Before publishing
> - [ ] Title says what the post delivers
> - [ ] Spell check
> - [ ] Cover image

## Intro
Give readers a reason to stay until the end.

## Point 1


## Point 2


## Point 3


## Wrapping up
- The one takeaway:
- What readers should do next:

---
References
-
`),

  entry('essay-outline', 'writing', 'list', '#a21caf',
    { ko: '에세이 개요', en: 'Essay Outline' },
    { ko: '주장, 근거, 반론, 결론의 뼈대', en: 'Thesis, arguments, counterpoints, conclusion' },
`---
tags: [writing, essay]
created: {{date}}
target-length:
---
# {{title}}

## 핵심 주장
>

## 서론
- 시작하는 장면/질문:
- 주장 제시:

## 본론
1. 근거 1 —
   - 사례:
2. 근거 2 —
   - 사례:
3. 근거 3 —
   - 사례:

## 예상 반론과 답
| 반론 | 내 답 |
| --- | --- |
|  |  |

## 결론
- 주장 다시 짚기:
- 여운을 남기는 마지막 문장:

## 자료
- [[]]
`,
`---
tags: [writing, essay]
created: {{date}}
target-length:
---
# {{title}}

## Thesis
>

## Introduction
- Opening scene or question:
- Thesis statement:

## Body
1. Argument 1 —
   - Evidence:
2. Argument 2 —
   - Evidence:
3. Argument 3 —
   - Evidence:

## Counterarguments
| Objection | Response |
| --- | --- |
|  |  |

## Conclusion
- Restate the thesis:
- Closing line:

## Sources
- [[]]
`),

  entry('novel-chapter', 'writing', 'sparkles', '#7e22ce',
    { ko: '소설 챕터', en: 'Novel Chapter' },
    { ko: '장면 목표, 갈등, 전환점을 잡고 쓰기', en: 'Plan scene goals, conflict and turns, then write' },
`---
tags: [writing, novel]
book:
chapter:
pov:
status: 초고
---
# {{title}}

## 이 장의 목적
- 이야기에서 무엇이 바뀌는가:

## 등장인물
- [[]] — 원하는 것:
- [[]] — 원하는 것:

## 장면 구성
| # | 장소 | 일어나는 일 | 전환 |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## 갈등
-

## 마지막 장면의 여운
-

---

## 본문


`,
`---
tags: [writing, novel]
book:
chapter:
pov:
status: first draft
---
# {{title}}

## Purpose of this chapter
- What changes in the story:

## Characters
- [[]] — wants:
- [[]] — wants:

## Scenes
| # | Setting | What happens | Turn |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## Conflict
-

## Ending beat
-

---

## Draft


`),

  entry('character-sheet', 'writing', 'users', '#c026d3',
    { ko: '인물 설정', en: 'Character Sheet' },
    { ko: '외모, 성격, 욕망, 관계, 변화 곡선', en: 'Looks, personality, desire, relationships, arc' },
`---
tags: [writing, character]
created: {{date}}
role:
---
# {{title}}

## 기본 정보
| 항목 | 내용 |
| --- | --- |
| 나이 |  |
| 직업 |  |
| 사는 곳 |  |
| 말버릇 |  |

## 외모


## 성격
- 장점:
- 약점:

## 원하는 것 vs 필요한 것
- 원하는 것:
- 실제로 필요한 것:

## 과거의 상처


## 관계
${F}mermaid
graph LR
    A[{{title}}] -- 신뢰 --> B[친구]
    A -- 갈등 --> C[적대자]
${F}

## 변화 곡선
- 처음:
- 끝:
`,
`---
tags: [writing, character]
created: {{date}}
role:
---
# {{title}}

## Basics
| Field | Value |
| --- | --- |
| Age |  |
| Occupation |  |
| Lives in |  |
| Verbal tic |  |

## Appearance


## Personality
- Strengths:
- Flaws:

## Want vs need
- Wants:
- Actually needs:

## Wound / backstory


## Relationships
${F}mermaid
graph LR
    A[{{title}}] -- trusts --> B[Friend]
    A -- clashes with --> C[Antagonist]
${F}

## Arc
- Beginning:
- End:
`),

  entry('how-to-guide', 'writing', 'check', '#0d9488',
    { ko: '사용 방법 안내', en: 'How-to Guide' },
    { ko: '준비물, 단계, 문제 해결이 있는 설명서', en: 'Prerequisites, steps and troubleshooting' },
`---
tags: [guide, how-to]
created: {{date}}
updated: {{date}}
---
# {{title}} 하는 법

이 문서는 ___을 처음 하는 사람을 위한 안내입니다.

## 준비물
- [ ]
- [ ]

## 단계
1. **첫 번째** —
2. **두 번째** —
3. **세 번째** —

> [!warning] 자주 하는 실수
>

## 확인 방법
-

## 문제 해결
| 증상 | 원인 | 해결 |
| --- | --- | --- |
|  |  |  |

## 더 알아보기
- [[]]
`,
`---
tags: [guide, how-to]
created: {{date}}
updated: {{date}}
---
# How to {{title}}

This guide is for anyone doing ___ for the first time.

## Before you start
- [ ]
- [ ]

## Steps
1. **First** —
2. **Then** —
3. **Finally** —

> [!warning] Common mistake
>

## Check that it worked
-

## Troubleshooting
| Symptom | Cause | Fix |
| --- | --- | --- |
|  |  |  |

## See also
- [[]]
`),

  // ───────────── life ─────────────
  entry('recipe', 'life', 'heart', '#ef4444',
    { ko: '레시피', en: 'Recipe' },
    { ko: '재료, 만드는 법, 팁, 맛 평가', en: 'Ingredients, method, tips and ratings' },
`---
tags: [recipe]
servings: 2
time: 30분
created: {{date}}
---
# 🍳 {{title}}

- 분량: 2인분
- 시간: 준비 10분 · 조리 20분
- 난이도:

## 재료
| 재료 | 양 |
| --- | --- |
|  |  |
|  |  |

### 양념
-

## 만드는 법
1.
2.
3.

> [!tip] 맛있게 만드는 팁
>

## 만들어 본 기록
- {{date}}:
`,
`---
tags: [recipe]
servings: 2
time: 30 min
created: {{date}}
---
# 🍳 {{title}}

- Serves: 2
- Time: 10 min prep · 20 min cook
- Difficulty:

## Ingredients
| Ingredient | Amount |
| --- | --- |
|  |  |
|  |  |

### Sauce / seasoning
-

## Method
1.
2.
3.

> [!tip] Tips
>

## Cooking log
- {{date}}:
`),

  entry('travel-plan', 'life', 'map', '#0284c7',
    { ko: '여행 계획', en: 'Travel Plan' },
    { ko: '일정표, 숙소, 예산, 짐 목록', en: 'Itinerary, stays, budget and packing list' },
`---
tags: [travel]
destination:
start:
end:
---
# ✈️ {{title}}

## 개요
- 기간:
- 동행:
- 여행 목적:

## 일정
| 날짜 | 오전 | 오후 | 저녁 |
| --- | --- | --- | --- |
| 1일차 |  |  |  |
| 2일차 |  |  |  |
| 3일차 |  |  |  |

## 교통·숙소
- 항공/기차:
- 숙소:

## 예산
| 항목 | 예상 | 실제 |
| --- | --- | --- |
| 교통 |  |  |
| 숙박 |  |  |
| 식비 |  |  |

## 짐 목록
- [ ] 여권/신분증
- [ ] 충전기·어댑터
- [ ] 상비약

> [!warning] 출발 전
> 여권 유효기간과 비자 필요 여부를 꼭 확인하세요.
`,
`---
tags: [travel]
destination:
start:
end:
---
# ✈️ {{title}}

## Overview
- Dates:
- Travelling with:
- Purpose:

## Itinerary
| Day | Morning | Afternoon | Evening |
| --- | --- | --- | --- |
| Day 1 |  |  |  |
| Day 2 |  |  |  |
| Day 3 |  |  |  |

## Transport & stays
- Flights / trains:
- Accommodation:

## Budget
| Item | Planned | Actual |
| --- | --- | --- |
| Transport |  |  |
| Lodging |  |  |
| Food |  |  |

## Packing list
- [ ] Passport / ID
- [ ] Chargers & adapter
- [ ] Basic medicine

> [!warning] Before you leave
> Check passport expiry and visa requirements.
`),

  entry('workout-log', 'life', 'target', '#22c55e',
    { ko: '운동 기록', en: 'Workout Log' },
    { ko: '종목, 세트, 무게, 컨디션 기록', en: 'Exercises, sets, weights and how you felt' },
`---
tags: [health, workout]
date: {{date}}
type:
---
# 운동 — {{date:YYYY-MM-DD (ddd)}}

- 시작: {{time}}
- 컨디션 (1–5):

## 준비 운동
- [ ] 스트레칭 5분

## 본 운동
| 종목 | 세트 | 횟수 | 무게 | 메모 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

## 유산소
- 종류:
- 시간 / 거리:

## 마무리
- 느낀 점:
- 다음엔:
`,
`---
tags: [health, workout]
date: {{date}}
type:
---
# Workout — {{date:ddd, YYYY-MM-DD}}

- Start: {{time}}
- How I feel (1–5):

## Warm-up
- [ ] 5 min stretching

## Main sets
| Exercise | Sets | Reps | Weight | Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

## Cardio
- Type:
- Time / distance:

## Cool-down
- How it went:
- Next time:
`),

  entry('budget', 'life', 'table', '#059669',
    { ko: '월 가계부', en: 'Monthly Budget' },
    { ko: '수입, 고정·변동 지출, 저축 목표', en: 'Income, fixed and variable spending, savings' },
`---
tags: [money, budget]
month: {{date:YYYY-MM}}
---
# {{date:YYYY년 MM월}} 가계부

## 수입
| 항목 | 금액 |
| --- | --- |
| 월급 |  |
| 기타 |  |
| **합계** |  |

## 고정 지출
| 항목 | 예산 | 실제 |
| --- | --- | --- |
| 주거비 |  |  |
| 통신비 |  |  |
| 보험 |  |  |

## 변동 지출
| 항목 | 예산 | 실제 |
| --- | --- | --- |
| 식비 |  |  |
| 교통 |  |  |
| 여가 |  |  |

## 저축·투자
- 목표:
- 실제:

## 이번 달 돌아보기
- 아낀 곳:
- 다음 달 줄일 곳:
`,
`---
tags: [money, budget]
month: {{date:YYYY-MM}}
---
# Budget — {{date:YYYY-MM}}

## Income
| Source | Amount |
| --- | --- |
| Salary |  |
| Other |  |
| **Total** |  |

## Fixed costs
| Item | Budget | Actual |
| --- | --- | --- |
| Rent / mortgage |  |  |
| Phone & internet |  |  |
| Insurance |  |  |

## Variable spending
| Item | Budget | Actual |
| --- | --- | --- |
| Groceries & dining |  |  |
| Transport |  |  |
| Fun |  |  |

## Savings & investing
- Goal:
- Actual:

## Month in review
- Where I saved:
- Cut back next month:
`),

  entry('event-plan', 'life', 'star', '#d97706',
    { ko: '행사 계획', en: 'Event Plan' },
    { ko: '생일·모임·행사 준비 체크리스트', en: 'Checklist for parties, gatherings and events' },
`---
tags: [event]
date:
place:
created: {{date}}
---
# 🎉 {{title}}

## 기본 정보
- 날짜·시간:
- 장소:
- 인원:
- 예산:

## 초대할 사람
| 이름 | 연락 | 참석 |
| --- | --- | --- |
|  |  |  |

## 준비할 것
- [ ] 장소 예약
- [ ] 초대 메시지 보내기
- [ ] 음식·음료
- [ ] 장식·선물
- [ ] 사진 담당 정하기

## 당일 진행
| 시간 | 순서 |
| --- | --- |
|  |  |

## 끝나고
- [ ] 감사 인사
- 좋았던 점 / 다음엔:
`,
`---
tags: [event]
date:
place:
created: {{date}}
---
# 🎉 {{title}}

## Basics
- Date & time:
- Venue:
- Guests:
- Budget:

## Guest list
| Name | Contacted | RSVP |
| --- | --- | --- |
|  |  |  |

## To prepare
- [ ] Book the venue
- [ ] Send invitations
- [ ] Food & drinks
- [ ] Decorations / gifts
- [ ] Pick a photographer

## Run of show
| Time | What |
| --- | --- |
|  |  |

## Afterwards
- [ ] Send thank-yous
- What worked / next time:
`),

  // ───────────── planning ─────────────
  entry('weekly-review', 'planning', 'calendar', '#3b82f6',
    { ko: '주간 회고', en: 'Weekly Review' },
    { ko: '지난주 정리와 다음 주 계획', en: 'Close out last week and plan the next' },
`---
tags: [review, weekly]
week: {{date:YYYY-[W]ww}}
created: {{date}}
---
# {{date:YYYY년 ww주차}} 주간 회고

## 이번 주 하이라이트
-

## 목표 점검
| 목표 | 결과 | 메모 |
| --- | --- | --- |
|  | ✅ / ⏳ / ❌ |  |
|  |  |  |

## 잘한 것
-

## 아쉬운 것
-

## 배운 것
-

## 다음 주 계획
- [ ]
- [ ]
- [ ]

> [!tip] 정리 루틴
> 받은 편지함 비우기 · 캘린더 확인 · 미뤄 둔 일 다시 보기
`,
`---
tags: [review, weekly]
week: {{date:YYYY-[W]ww}}
created: {{date}}
---
# Weekly review — week {{date:ww, YYYY}}

## Highlights
-

## Goals check
| Goal | Result | Notes |
| --- | --- | --- |
|  | ✅ / ⏳ / ❌ |  |
|  |  |  |

## Wins
-

## Misses
-

## Lessons
-

## Next week
- [ ]
- [ ]
- [ ]

> [!tip] Reset routine
> Clear the inbox · check the calendar · revisit the someday list
`),

  entry('monthly-review', 'planning', 'graph', '#2563eb',
    { ko: '월간 회고', en: 'Monthly Review' },
    { ko: '한 달의 성과, 숫자, 다음 달 방향', en: 'Achievements, numbers and focus for next month' },
`---
tags: [review, monthly]
month: {{date:YYYY-MM}}
---
# {{date:YYYY년 MM월}} 돌아보기

## 한 달을 한 문장으로


## 숫자로 본 이번 달
| 항목 | 목표 | 실제 |
| --- | --- | --- |
| 운동 횟수 |  |  |
| 읽은 책 |  |  |
| 저축 |  |  |

## 가장 기억에 남는 일
-

## 목표별 진행
- 일:
- 건강:
- 관계:
- 배움:

## 그만둘 것 / 시작할 것
- 그만둘 것:
- 시작할 것:

## 다음 달 집중할 세 가지
1.
2.
3.
`,
`---
tags: [review, monthly]
month: {{date:YYYY-MM}}
---
# Monthly review — {{date:YYYY-MM}}

## The month in one sentence


## By the numbers
| Metric | Goal | Actual |
| --- | --- | --- |
| Workouts |  |  |
| Books read |  |  |
| Savings |  |  |

## Most memorable
-

## Progress by area
- Work:
- Health:
- Relationships:
- Learning:

## Stop / start
- Stop:
- Start:

## Three priorities for next month
1.
2.
3.
`),

  entry('okr', 'planning', 'target', '#e11d48',
    { ko: 'OKR', en: 'OKR' },
    { ko: '목표와 핵심 결과, 진척도 관리', en: 'Objectives, key results and progress' },
`---
tags: [okr, goals]
period:
created: {{date}}
---
# {{title}} OKR

> [!note] 작성 요령
> 목표(O)는 가슴 뛰게, 핵심 결과(KR)는 숫자로 잴 수 있게 씁니다.

## O1.
| 핵심 결과 | 시작 | 목표 | 현재 | 진척 |
| --- | --- | --- | --- | --- |
| KR1 |  |  |  | 0% |
| KR2 |  |  |  | 0% |
| KR3 |  |  |  | 0% |

### 주요 활동
- [ ]
- [ ]

## O2.
| 핵심 결과 | 시작 | 목표 | 현재 | 진척 |
| --- | --- | --- | --- | --- |
| KR1 |  |  |  | 0% |
| KR2 |  |  |  | 0% |

## 주간 점검
- {{date}}:

## 분기 말 평가
-
`,
`---
tags: [okr, goals]
period:
created: {{date}}
---
# {{title}} OKRs

> [!note] How to write them
> Objectives should inspire; key results must be measurable.

## O1.
| Key result | Start | Target | Current | Progress |
| --- | --- | --- | --- | --- |
| KR1 |  |  |  | 0% |
| KR2 |  |  |  | 0% |
| KR3 |  |  |  | 0% |

### Initiatives
- [ ]
- [ ]

## O2.
| Key result | Start | Target | Current | Progress |
| --- | --- | --- | --- | --- |
| KR1 |  |  |  | 0% |
| KR2 |  |  |  | 0% |

## Weekly check-ins
- {{date}}:

## End-of-quarter score
-
`),

  entry('habit-tracker', 'planning', 'check', '#10b981',
    { ko: '습관 기록표', en: 'Habit Tracker' },
    { ko: '한 주 동안 습관을 칸마다 체크', en: 'Tick off habits day by day for a week' },
`---
tags: [habit]
week-of: {{date}}
---
# 습관 기록 — {{date}} 주

| 습관 | 월 | 화 | 수 | 목 | 금 | 토 | 일 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 물 2L 마시기 |  |  |  |  |  |  |  |
| 30분 걷기 |  |  |  |  |  |  |  |
| 책 20쪽 |  |  |  |  |  |  |  |
| 12시 전 취침 |  |  |  |  |  |  |  |

표시: ✅ 함 · ➖ 쉬는 날 · ❌ 못 함

## 이번 주 연속 기록
-

## 잘 안 된 이유
-

> [!tip] 두 번 연속으로 거르지 않기
> 하루 놓쳐도 괜찮아요. 다음 날 바로 다시 시작하면 됩니다.
`,
`---
tags: [habit]
week-of: {{date}}
---
# Habits — week of {{date}}

| Habit | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Drink 2 L of water |  |  |  |  |  |  |  |
| Walk 30 min |  |  |  |  |  |  |  |
| Read 20 pages |  |  |  |  |  |  |  |
| In bed by midnight |  |  |  |  |  |  |  |

Legend: ✅ done · ➖ rest day · ❌ missed

## Streaks this week
-

## What got in the way
-

> [!tip] Never miss twice
> Missing a day is fine. Just start again the next day.
`),

  entry('swot', 'planning', 'table', '#f43f5e',
    { ko: 'SWOT 분석', en: 'SWOT Analysis' },
    { ko: '강점·약점·기회·위협을 정리하고 전략 도출', en: 'Strengths, weaknesses, opportunities, threats' },
`---
tags: [analysis, swot]
created: {{date}}
---
# {{title}} SWOT 분석

| | 도움이 되는 것 | 해가 되는 것 |
| --- | --- | --- |
| **내부** | **강점 (S)**<br>-  | **약점 (W)**<br>-  |
| **외부** | **기회 (O)**<br>-  | **위협 (T)**<br>-  |

## 강점 (S)
-

## 약점 (W)
-

## 기회 (O)
-

## 위협 (T)
-

## 전략
- SO (강점으로 기회 잡기):
- WO (약점 보완해 기회 잡기):
- ST (강점으로 위협 막기):
- WT (약점·위협 최소화):
`,
`---
tags: [analysis, swot]
created: {{date}}
---
# {{title}} — SWOT

| | Helpful | Harmful |
| --- | --- | --- |
| **Internal** | **Strengths**<br>-  | **Weaknesses**<br>-  |
| **External** | **Opportunities**<br>-  | **Threats**<br>-  |

## Strengths
-

## Weaknesses
-

## Opportunities
-

## Threats
-

## Strategies
- SO (use strengths to seize opportunities):
- WO (fix weaknesses to seize opportunities):
- ST (use strengths to counter threats):
- WT (minimise weaknesses and threats):
`),

  entry('pros-cons', 'planning', 'bulb', '#eab308',
    { ko: '장단점 비교 결정', en: 'Pros & Cons Decision' },
    { ko: '선택지별 장단점과 가중치로 결정하기', en: 'Weigh options with pros, cons and scores' },
`---
tags: [decision]
created: {{date}}
deadline:
---
# 결정: {{title}}

## 무엇을 정해야 하나


## 선택지
${F}mermaid
graph TD
    Q{"{{title}}"} --> A[선택지 A]
    Q --> B[선택지 B]
${F}

## 장단점
| | 선택지 A | 선택지 B |
| --- | --- | --- |
| 장점 |  |  |
| 단점 |  |  |

## 기준별 점수 (1–5)
| 기준 | 가중치 | A | B |
| --- | --- | --- | --- |
| 비용 |  |  |  |
| 시간 |  |  |  |
| 만족도 |  |  |  |

## 마음이 기우는 쪽
> [!question] 1년 뒤의 나는 어떤 선택을 고마워할까?
>

## 결론
-
`,
`---
tags: [decision]
created: {{date}}
deadline:
---
# Decision: {{title}}

## What needs deciding


## Options
${F}mermaid
graph TD
    Q{"{{title}}"} --> A[Option A]
    Q --> B[Option B]
${F}

## Pros & cons
| | Option A | Option B |
| --- | --- | --- |
| Pros |  |  |
| Cons |  |  |

## Weighted scores (1–5)
| Criterion | Weight | A | B |
| --- | --- | --- | --- |
| Cost |  |  |  |
| Time |  |  |  |
| Satisfaction |  |  |  |

## Gut check
> [!question] Which choice will I thank myself for a year from now?
>

## Decision
-
`),

  // ───────────── knowledge ─────────────
  entry('literature-note', 'knowledge', 'file', '#64748b',
    { ko: '문헌 노트', en: 'Literature Note' },
    { ko: '읽은 자료를 내 말로 옮긴 짧은 기록', en: 'A source, restated in your own words' },
`---
tags: [zettel/literature]
source:
author:
created: {{date}}
---
# {{title}}

- 출처:
- 위치(쪽/시간):

## 내 말로 정리
원문을 베끼지 말고, 이해한 대로 다시 써 보세요.


## 인용
>

## 떠오른 생각
-

## 영구 노트로 옮길 것
- [ ] [[]]
`,
`---
tags: [zettel/literature]
source:
author:
created: {{date}}
---
# {{title}}

- Source:
- Location (page / timestamp):

## In my own words
Don't copy—rewrite it the way you understand it.


## Quote
>

## Thoughts it sparked
-

## Turn into permanent notes
- [ ] [[]]
`),

  entry('permanent-note', 'knowledge', 'link', '#475569',
    { ko: '영구 노트 (제텔카스텐)', en: 'Permanent Note (Zettelkasten)' },
    { ko: '하나의 생각을 완결된 문장으로, 연결과 함께', en: 'One self-contained idea, linked to others' },
`---
tags: [zettel/permanent]
id: {{date:YYYYMMDD}}{{time:HHmm}}
created: {{date}}
---
# {{title}}

## 생각
한 노트에 한 가지 생각만. 나중에 맥락 없이 읽어도 이해되게 쓰세요.


## 근거
- [[문헌 노트]]

## 연결
- 이어지는 생각: [[]]
- 반대되는 생각: [[]]
- 상위 주제: [[]]

## 질문
> [!question]
>

#생각
`,
`---
tags: [zettel/permanent]
id: {{date:YYYYMMDD}}{{time:HHmm}}
created: {{date}}
---
# {{title}}

## The idea
One idea per note, written so it makes sense without any context.


## Based on
- [[Literature note]]

## Connections
- Builds on: [[]]
- Contradicts: [[]]
- Part of: [[]]

## Open question
> [!question]
>

#idea
`),

  entry('moc', 'knowledge', 'map', '#0f172a',
    { ko: '주제 지도 (MOC)', en: 'Map of Content (MOC)' },
    { ko: '흩어진 노트를 주제별로 묶는 목차 노트', en: 'A hub note that gathers notes on a topic' },
`---
tags: [moc]
created: {{date}}
updated: {{date}}
---
# 🗺️ {{title}}

> [!note] 이 지도에 대해
> {{title}}에 관한 노트를 모아 두는 출발점입니다.

## 구조
${F}mermaid
mindmap
  root(({{title}}))
    기초
    핵심 개념
    응용
    질문
${F}

## 기초
- [[]]
- [[]]

## 핵심 개념
- [[]]
- [[]]

## 응용과 사례
- [[]]

## 아직 풀지 못한 질문
-

## 관련 지도
- [[]]
`,
`---
tags: [moc]
created: {{date}}
updated: {{date}}
---
# 🗺️ {{title}}

> [!note] About this map
> The starting point for everything I know about {{title}}.

## Structure
${F}mermaid
mindmap
  root(({{title}}))
    Basics
    Core ideas
    Applications
    Questions
${F}

## Basics
- [[]]
- [[]]

## Core ideas
- [[]]
- [[]]

## Applications & examples
- [[]]

## Open questions
-

## Related maps
- [[]]
`),

  entry('reading-list', 'knowledge', 'star', '#f59e0b',
    { ko: '읽을 목록', en: 'Reading List' },
    { ko: '읽을 책·글을 상태와 함께 관리', en: 'Books and articles to read, with status' },
`---
tags: [reading]
updated: {{date}}
---
# 📖 {{title}}

## 지금 읽는 중
| 제목 | 저자 | 시작 | 진도 |
| --- | --- | --- | --- |
| [[]] |  | {{date}} | 0% |

## 읽을 예정
- [ ]
- [ ]
- [ ]

## 다 읽음
| 제목 | 저자 | 다 읽은 날 | 별점 |
| --- | --- | --- | --- |
|  |  |  | ⭐⭐⭐⭐ |

## 추천받은 것
- 누가: , 무엇:

## 올해 목표
- 권 수:
- ==꼭 읽을 한 권==:
`,
`---
tags: [reading]
updated: {{date}}
---
# 📖 {{title}}

## Currently reading
| Title | Author | Started | Progress |
| --- | --- | --- | --- |
| [[]] |  | {{date}} | 0% |

## Up next
- [ ]
- [ ]
- [ ]

## Finished
| Title | Author | Finished | Rating |
| --- | --- | --- | --- |
|  |  |  | ⭐⭐⭐⭐ |

## Recommended to me
- By: , what:

## This year's goal
- Number of books:
- ==The one I must read==:
`),
];

export function templateText(id, lang) {
  const entry = TEMPLATE_LIBRARY.find((tpl) => tpl.id === id);
  if (!entry) return '';
  return entry.body[lang] ?? entry.body.en;
}
