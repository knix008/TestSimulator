# MyWorkPlan

Windows · macOS · Linux · 웹에서 쓰는 프로젝트 계획·일정 관리 프로그램입니다. Microsoft Project처럼 작업과 개요, 연결, 주 공정, 달력, 자원과 비용, 평준화, 기준 계획, 진행 추적, 보고서를 다룹니다. JavaScript(Vite) UI와 Tauri 2(Rust) 백엔드로 만들었습니다.

![아이콘](assets/icon-256.png)

- 버전: 1.0.0
- 사용법: [UsersGuide.md](UsersGuide.md) (English: [UsersGuide.en.md](UsersGuide.en.md))
- 구조: [ARCHITECTURE.md](ARCHITECTURE.md)
- 튜토리얼 문서: [docs/tutorial/README.md](docs/tutorial/README.md), 동영상 `MyWorkPlan-Tutorial.mp4`

## 주요 기능

### 계획

- **작업·요약 작업·마일스톤** — 표에 바로 입력, 맨 아래 빈 행에 이름을 쓰면 새 작업, `Insert`로 선택한 행 위에 삽입
- **개요** — 들여쓰기/내어쓰기(`Alt+Shift+→/←`), 위/아래 이동, 접기·펼치기, WBS 자동 번호
- **기간** — `5d` · `3w` · `4h` · `1mo` · 경과 시간 `2ed` · 예상 `5d?` · 마일스톤 `0d`, 한국어 단위(`5일`)도 가능
- **연결** — 완료-시작/시작-시작/완료-완료/시작-완료, 지연·앞당김(`2d`, `-1d`, `50%`), 선행 작업 칸에 `5SS+2d`처럼 입력, 막대를 다른 막대에 끌어 연결, 요약 작업에 건 연결은 하위 작업 전체에 적용
- **반복 작업** — 매일·매주·매월·매년, 횟수 또는 끝 날짜
- **작업 정보 창** — 일반 · 선행 작업 · 자원 · 고급 · 메모 · 사용자 지정 필드 탭, 여러 작업 한꺼번에 고치기
- **실행 취소/다시 실행**(탭마다 200단계), 복사·잘라내기·붙여넣기(엑셀·메모장 목록은 개요 그대로 작업이 됨), 아래로 채우기
- **템플릿 7종** — 소프트웨어 개발 · 건축 공사 · 행사 기획 · 마케팅 캠페인 · 제품 출시 · 연구 프로젝트 · 사무실 이전, 예제 프로젝트(한국어/영어)

### 일정 계산

- 자동 일정과 수동 일정, 새 작업의 기본 모드
- 앞으로 계산(빠른 날짜)·뒤로 계산(늦은 날짜), 총 여유 시간·자유 여유 시간, **주 공정**(빨간 막대, 여유 기준 일수 조정)
- **제약 조건 8가지**(가능한 한 빨리/늦게, 다음 날짜 이후/이전에 시작·완료, 반드시 시작/완료해야 하는 날짜), **마감일**, 충돌 표시
- **일정 기준** — 프로젝트 시작 날짜 또는 완료 날짜(완료 날짜에서 거꾸로 계산)
- **달력** — 표준 · 24시간 · 야간 근무와 사용자 달력, 요일별 작업 시간, 휴일·특근 예외, 작업 달력 → 자원 달력 → 프로젝트 달력

### 자원과 비용

- 작업·재료·비용 자원, 최대 단위, 표준 단가, 사용당 비용, 자원 달력
- 자원 할당 창(단위 %, 재료 수량, 비용 금액, 새 자원 바로 추가), 자원 이름 칸 직접 입력(`김철수, 이영희[50%]`)
- 작업 유형(단위·기간·작업량 고정)과 노력 기반, 고정 비용, 작업·요약·프로젝트 비용 합산
- **초과 할당** 표시, 다음 초과 할당으로 이동, **자원 평준화**(순서·여유 시간 안에서만·이전 평준화 지우기), 평준화 지우기
- **팀 플래너** — 작업 블록을 다른 사람 줄로 끌어 담당자 바꾸기

### 진행 추적

- **기준 계획** 11개(기준 계획, 기준 계획 1~10), 전체 또는 선택한 작업, 이전 기준 계획 보관
- 완료율 버튼(0 · 25 · 50 · 75 · 100%), 예정대로 진행으로 표시, 작업 업데이트(실제 시작·완료·기간)
- **프로젝트 업데이트** — 상태 날짜까지 일정대로 완료, 남은 작업 다시 일정
- **상태 날짜**, 늦은 작업, 시작·완료·기간·작업량·비용 차이, **추적 간트**와 **진행선**

### 보기 (12가지)

간트 차트 · 추적 간트 · 작업 시트 · 작업 사용 · 네트워크 다이어그램 · 일정표 · 시간 표시 막대 · 자원 시트 · 자원 사용 · 자원 그래프 · 팀 플래너 · 보고서

- 표(열 묶음) 9가지, 열 선택·숨기기·너비 조절, 필터 16가지와 **강조 표시**, 그룹 10가지, 정렬 9가지, 검색
- 찾기 · 바꾸기 · 이동(작업 ID·날짜) · 날짜 범위 필터
- 간트 막대 끌기(시작·기간·완료율·연결), 확대/축소(50~200%), 시간 눈금(일·주·월·분기), 프로젝트 전체 보기, 오늘로 이동

### 보고서

프로젝트 개요 · 비용 개요 · 작업량 개요 · 번다운 · 주 공정 작업 · 늦은 작업 · 다가오는 작업 · 마일스톤 보고서 · 자원 개요. SVG 차트, **보고서 복사**로 다른 프로그램에 붙여넣기.

### 파일과 연동

- `.mwp` 프로젝트, `.mwpt` 템플릿(UTF-8 JSON), 저장은 임시 파일에 쓴 뒤 바꿔치기
- **MS Project XML(MSPDI)** 가져오기·내보내기, **CSV** 가져오기(영어/한국어 머리글, 쉼표·세미콜론·탭 자동 감지)·내보내기, 간트 차트 **PNG** 그림 내보내기
- 다른 프로젝트 삽입, 여러 프로젝트를 탭으로, 모두 저장
- **최근 파일 10개 · 최근 폴더 10개**(하나씩/전체 지우기, 없어진 파일 표시)
- **끌어다 놓기** — 프로젝트·XML·CSV 파일은 열기, 이미지는 배경, 텍스트는 작업 목록(웹)
- 저장하지 않은 변경은 탭 닫기·끝내기 전에 저장/저장 안 함/취소를 물음, 지난번 파일 다시 열기(선택)

### 인쇄

전체 프로젝트 · 현재 보기 · 사용자 지정(ID 범위·날짜 범위·선택한 작업), 용지·방향·여백·배율·내용(표+차트/표만/차트만)·범례·머리글·바닥글, 미리 보기에서 쪽 넘기기, 바로 인쇄. 인쇄물은 테마와 상관없이 흰 바탕.

### 화면과 사용 편의

- **테마** — 다크 20 · 라이트 20 · 사용자 정의(12가지 색 편집, 글자 대비 경고) · 시스템 설정. 툴바의 테마 버튼은 누를 때마다 **무작위 테마**, 옆의 ▾는 다크 | 라이트 **두 줄 목록**
- **한국어/영어** — 툴바의 **국기 버튼**(한국어일 때 영국 국기, 영어일 때 태극기), 백엔드 메시지까지 전환
- **시작 페이지** — 템플릿, 최근 파일·폴더, 예제, 튜토리얼, **움직이는 배경 20가지**(오로라 · 물결 · 입자 · 별자리 · 거품 · 흐르는 격자 · 간트 막대 · 별빛 · 비 · 눈 · 반딧불 · 파문 · 코드 비 · 육각 격자 · 궤도 · 라바 램프 · 은하 나선 · 색종이 · 마일스톤 · 리본, 무작위 바꾸기, 속도)
- **튜토리얼** — 예제 프로젝트로 모든 기능을 장별로 보여 줌(자동 재생, 장 고르기, 끝나면 설정 원래대로)
- **설정** — 일반 · 테마 · 글꼴(시스템 글꼴 전체·크기·굵기·기울임) · 배경(움직이는 배경/이미지, 배경 불투명도, 맞춤) · 일정 · 간트 차트 · 최근 기록 · 단축키. 모든 설정은 저장되어 다음 실행에 다시 쓰임
- **패널** — 왼쪽 도구 모음과 오른쪽 속성 패널(선택한 작업·자원·연결·프로젝트를 바로 편집), 접으면 아이콘 레일, 구분자로 너비 조절
- **상태 표시줄** — 명령 결과, 새 작업 모드, 저장 상태, 작업·선택 수, 완료 날짜, 완료율, 충돌, 필터, 테마, 언어, 시간 눈금 슬라이더, 확대 비율, 시계
- **메뉴와 팝업은 독립 창** — 메뉴·오른쪽 클릭 메뉴(작업 행·막대·연결선·자원·열 머리글·차트·탭·입력 칸마다 다름)는 메인 창 밖까지 펼쳐지고, 팝업은 메인 창 밖으로 옮길 수 있으며 메인 창과 함께 닫힘
- **오류 팝업**(내용 복사), 백엔드 심각한 오류는 위치·스레드·백트레이스와 `crash.log`, 오래 걸리는 작업은 **진행 팝업**
- **한 번에 하나만 실행** — 두 번째 실행은 "이미 실행 중" 오류를 보이고 끝남
- 모든 버튼 툴팁, 타이틀 바에 `MyWorkPlan v1.0.0`, 창 오른쪽 아래 크기 조절 손잡이, 창 위치·크기 기억

## 빠른 시작

필요: Node.js 20+, Rust 1.80+ (stable), 각 OS의 Tauri 준비물(Windows: WebView2·MSVC, Linux: webkit2gtk-4.1, macOS: Xcode CLT).

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev)
npm run dev          # 웹 개발 서버 http://localhost:1450
```

## 빌드

```bash
npm run build:win    # Windows NSIS 설치 파일  → release/MyWorkPlan-Setup-1.0.0.exe (+ 프로젝트 루트에 사본)
npm run build:mac    # macOS .app + .dmg       → release/MyWorkPlan-1.0.0-<arch>.dmg
npm run build:linux  # .deb · .rpm · .AppImage → release/
npm run build:all    # 지금 OS에서 만들 수 있는 전부
npm run build:web    # 웹 빌드 → dist/ (아무 정적 웹 서버에 올리면 됨)
npm run build:docs   # UsersGuide*.md · docs/tutorial/README*.md → docs/*.html, public/docs/
npm run build:icons  # 아이콘 다시 만들기
npm run samples      # samples/ 예제 프로젝트 다시 만들기
```

Tauri는 교차 빌드를 하지 않으므로 각 OS 설치 파일은 그 OS에서 만듭니다. Windows 설치 파일은 `release/`에 만들어지고 프로젝트 루트에 `MyWorkPlan-Setup-1.0.0.exe`로 사본이 놓입니다. 설치 파일에는 사용 설명서(HTML·Markdown), 튜토리얼 문서와 그림, 예제 프로젝트가 함께 들어갑니다.

### Windows 설치 프로그램

- 설치 시작 시 **한국어/영어**를 고릅니다.
- 이전 설치가 있으면 **완전히 제거한 뒤** 새로 설치합니다(이전 제거 프로그램을 조용히 실행하고 폴더를 지움).
- 이전 설치가 남긴 **데이터(설정·최근 파일·폴더·배경 이미지)** 가 있으면 지울지 묻습니다.
- `.mwp`(프로젝트)와 `.mwpt`(템플릿)를 **각자의 문서 아이콘**으로 등록합니다. 파일을 두 번 클릭하면 MyWorkPlan에서 열립니다.
- 사용 설명서와 튜토리얼 문서를 설치 폴더의 `docs`에 넣고, 시작 메뉴 `MyWorkPlan` 폴더에 **MyWorkPlan User's Guide** 바로 가기를 만듭니다.
- 현재 사용자용 설치(관리자 권한 불필요). macOS는 .dmg, Linux deb/rpm은 MIME 형식과 문서 아이콘을 등록합니다.

## 테스트

```bash
npm test                         # 전체 (설치 파일 빌드 제외)
npm test -- --quick              # JS + 패키징 + Rust 단위 테스트만 (창·브라우저 없이)
npm test -- --only js,rust       # 골라서
npm test -- --installer          # 설치 파일 빌드·검사까지
```

분류: **JS 단위 · 패키징/아이콘 · Rust 단위 · E2E 웹 · E2E 데스크톱 GUI · 튜토리얼 · 설치 프로그램**.

- 실행 중에는 테스트마다 ✔/✖/○와 실행 시간이 색으로 표시되고, 끝나면 분류별 결과 표와 요약표가 나옵니다.
- 결과는 `test-results/results.json`에도 저장됩니다.
- E2E는 실제 앱(데스크톱: WebView2, 웹: 헤드리스 Edge/Chrome)을 CDP로 조작합니다. 메뉴·툴바·팝업·끌어다 놓기·파일·인쇄·오류 팝업·단일 실행 잠금을 직접 확인하며, 사용자의 설정·창 위치·데이터는 건드리지 않습니다(전용 폴더 사용).
- 문서 검사(`test/static/docs.test.js`)는 HTML 문서와 그 안의 링크·그림, 단축키 표를 확인합니다.

## 튜토리얼 문서와 동영상

```bash
npm run tutorial:docs    # 튜토리얼 단계마다 화면을 캡처 → docs/tutorial/README.md (+ README.en.md), docs/tutorial/images/
npm run tutorial:video   # 튜토리얼 자동 재생을 녹화 → MyWorkPlan-Tutorial.mp4 (프로젝트 루트)
npm run build:docs       # 마크다운 → docs/UsersGuide.html · UsersGuide.en.html · Tutorial.html · Tutorial.en.html
```

그림은 `docs/tutorial/images/NN-<단계 id>.jpg`(NN = 튜토리얼 단계 순서)로 저장되고, 사용 설명서도 이 그림을 씁니다. 앱의 **도움말 › 사용 설명서**는 설치된 `docs/UsersGuide.html`(영어 화면이면 `UsersGuide.en.html`)을 엽니다. 웹 빌드는 `public/docs/`를 `./docs/`로 함께 내보냅니다.

## 파일 형식

| 확장자 | 내용 |
|---|---|
| `.mwp` | 프로젝트 (UTF-8 JSON: `format: "myworkplan"`, `version`, `kind: "plan"`, `project`) |
| `.mwpt` | 템플릿 (같은 형식, `kind: "template"`, 진행·기준 계획·상태 날짜 없음) |
| `.xml` | Microsoft Project XML (MSPDI) — 가져오기·내보내기 |
| `.csv` · `.tsv` · `.txt` | 작업 표 — 가져오기(CSV 내보내기는 `.csv`, UTF-8 BOM) |
| `.png` | 간트 차트 그림 — 내보내기 |

자세한 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 제작

SHKWON (knix008@naver.com)

---

## English

**MyWorkPlan** is a project planning and scheduling app in the style of Microsoft Project for Windows, macOS, Linux and the web (JavaScript/Vite UI, Tauri 2/Rust backend).

- **Planning** — tasks, summary tasks and milestones, outline (indent/outdent, WBS), durations (`5d`, `3w`, `4h`, elapsed `2ed`, estimated `5d?`), FS/SS/FF/SF links with lags and leads, recurring tasks, task information with six tabs, undo/redo, copy/paste (also from Excel), 7 templates and sample projects.
- **Scheduling engine** — forward and backward pass, total and free slack, critical path, 8 constraint types, deadlines, schedule from the start or the finish date, calendars with working weeks and exceptions.
- **Resources and costs** — work, material and cost resources, assignments, task types and effort driven, fixed costs, overallocation, resource leveling, Team Planner.
- **Tracking** — 11 baselines, % complete, update tasks, update project, status date, variances, Tracking Gantt and progress line.
- **12 views** (Gantt Chart, Tracking Gantt, Task Sheet, Task Usage, Network Diagram, Calendar, Timeline, Resource Sheet, Resource Usage, Resource Graph, Team Planner, Reports), 9 tables, filters, highlighting, groups, sorting, find/replace/go to; **9 reports**.
- **Files** — `.mwp` / `.mwpt`, MS Project XML import/export, CSV import/export, PNG export, recent files and folders, drag and drop, unsaved-change prompts; **printing** with a live preview.
- **UI** — 20 dark + 20 light + custom themes (random theme button and a two-column dropdown), Korean/English with a flag button, start page with moving backgrounds, a tutorial, persisted settings, collapsible panels, a status bar, separate popup windows, error popups with copyable details, single-instance lock.

```bash
npm install
npm start              # desktop app (tauri dev)
npm run dev            # web dev server at http://localhost:1450
npm run build:win      # Windows installer → release/ and ./MyWorkPlan-Setup-1.0.0.exe
npm run build:mac      # macOS .dmg
npm run build:linux    # .deb · .rpm · .AppImage
npm run build:all      # everything this OS can build
npm run build:web      # web build → dist/
npm test               # all tests (npm test -- --quick, --only js,rust, --installer)
```

The Windows installer asks for Korean or English, removes a previous installation completely, asks whether to delete saved data, registers `.mwp` / `.mwpt` with their own icons and installs the user's guide with a Start-menu shortcut.

User's guide: [UsersGuide.en.md](UsersGuide.en.md) · Architecture (Korean): [ARCHITECTURE.md](ARCHITECTURE.md)

Author: SHKWON (knix008@naver.com)
