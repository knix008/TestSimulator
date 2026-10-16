# MyWorkPlan 구조

이 문서는 코드를 고치거나 기능을 더하려는 개발자를 위한 것입니다. 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 한눈에

```
┌──────────────────────────── 메인 창 (label "main") ─────────────────────────────┐
│ src/app.js  메뉴 막대 · 툴바 · 탭 · 도구 모음 · 보기(src/views) · 속성 · 상태 표시줄 │
│   ├ domain/document.js  PlanDocument: 프로젝트 + 실행 취소 + Schedule(계산 결과)    │
│   ├ ui/startpage.js · ui/tutorial.js · ui/background.js                          │
│   └ platform/popups.js  PopupHost: 팝업을 열고 결과·액션을 받음                    │
└──────────────┬───────────────────────────────────────────────┬──────────────────┘
               │ invoke (Tauri IPC) / emit · listen             │ localStorage + 메시지
┌──────────────▼──────────────────┐        ┌───────────────────▼────────────────────┐
│ src-tauri/src (Rust)            │        │ 팝업 창 (label "popup-<kind>")           │
│  lib.rs    명령 · 창 · 패닉 훅   │        │ src/popup.js (22종)                      │
│  instance.rs  단일 실행 잠금     │        │ settings about confirm error progress    │
│  files.rs  파일 입출력·진행률    │        │ recent print menu theme welcome          │
│  fonts.rs  window_state.rs       │        │ task resource project calendar link      │
│  i18n.rs   (tr! 한/영 메시지)    │        │ baseline update leveling recurring       │
└─────────────────────────────────┘        │ find columns assign                      │
                                           └──────────────────────────────────────────┘
```

하나의 번들(`index.html` + `src/main.js`)이 모든 창을 맡습니다. `main.js`는 창 라벨(데스크톱) 또는 `?popup=<kind>`(웹·튜토리얼 프레임)를 보고 `app.js` 또는 `popup.js`를 불러옵니다. 첫 그리기 전에 테마와 글꼴을 적용해 창이 잘못된 색으로 깜빡이지 않습니다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/domain/` | UI와 무관한 순수 로직 (Node에서 단위 테스트) |
| `├ project.js` | 프로젝트 모델과 모든 편집(작업 삽입·삭제·개요·연결·할당·달력·복사/붙여넣기), 작업 유형·노력 기반 규칙 |
| `├ schedule.js` | 일정 계산기: 개요, 의존 그래프, 앞/뒤 계산, 제약, 여유 시간, 주 공정, 비용, 자원 부하, 추적 값, 평준화 |
| `├ calendars.js` | 달력(작업 주·예외·기반 달력)과 작업 시간 산술(`add`, `subtract`, `between`, `snapForward/Backward`) |
| `├ duration.js`, `time.js` | 기간·지연·선행 작업 문자열 파싱/표시, 금액, 분 단위 시각(`toMin`/`fromMin`) |
| `├ document.js`, `history.js` | 열린 프로젝트(탭) 하나: 경로, 변경 여부, 보기 상태, 스냅샷 실행 취소 |
| `├ format.js` | `.mwp`/`.mwpt` 직렬화·파싱·복구(`normalizeProject`), 파일 이름 판별 |
| `├ interop.js` | MS Project XML(MSPDI) 읽기/쓰기(자체 XML 파서), CSV, 클립보드 텍스트(TSV) |
| `├ tracking.js` | 기준 계획 11개, 완료율, 작업 업데이트, 예정대로 진행, 프로젝트 업데이트 |
| `├ recurring.js` | 반복 작업(요약 작업 + 회차별 SNET 작업) |
| `├ templates.js` | 템플릿 7종과 튜토리얼 예제(한/영 사양을 일반 편집 함수로 빌드) |
| `├ fields.js`, `filters.js` | 표의 열(필드)과 표 묶음, 필터·그룹·정렬·검색 |
| `├ settings.js`, `recent.js` | 설정 기본값·검증·저장(localStorage), 최근 파일·폴더 10개 |
| `src/views/` | 12가지 보기: `gantt.js`(간트·추적 간트), `sheet.js`, `usage.js`(작업/자원 사용), `network.js`, `calendar-view.js`, `timeline.js`, `resource-graph.js`, `team-planner.js`, `reports.js`, 공통 `timescale.js` |
| `src/ui/` | `grid.js`(가상 스크롤 편집 표), `startpage.js`, `tutorial.js`(STEPS), `background.js`(움직이는 배경 8종), `dom.js` |
| `src/print/render.js` | 인쇄·PNG 내보내기용 SVG 페이지(테마와 무관한 흑백) |
| `src/platform/native.js` | 플랫폼 경계: 데스크톱은 Rust 명령, 웹은 브라우저 API(File System Access·내려받기·IndexedDB) |
| `src/platform/popups.js` | 팝업 열기/닫기/메시지, 팝업 크기 표(`POPUPS`) |
| `src/app.js` | 메인 창: 명령 표(`commands`), `MENUS`, `TOOLBAR`, 오른쪽 클릭 메뉴, `SHORTCUTS`, 파일 처리 |
| `src/popup.js` | 모든 팝업 창과 `SHORTCUT_LIST` |
| `src/i18n/ko.js`, `en.js`, `i18n.js` | UI 문자열(키는 두 파일이 같음) |
| `src/themes.js`, `icons.js`, `flags.js` | 테마(다크 20·라이트 20·시스템·사용자 정의), SVG 아이콘, 국기 |
| `src/calendar.js`, `src/stepper.js` | 날짜 칸 + 달력, `[−] 값 [+]` 숫자 입력 |
| `src-tauri/` | Rust 백엔드, `tauri.conf.json`(번들·파일 연결·리소스), `windows/hooks.nsh`, `linux/`(MIME·postinst), `Info.plist` |
| `scripts/` | `test.mjs`(테스트 러너), `build.mjs`(설치 파일), `start.mjs`, `build-docs.mjs`(문서 HTML), `render-icons.mjs`, `make-samples.mjs`, 튜토리얼 캡처 |
| `test/` | `unit/`(도메인), `static/`(패키징·문서), `e2e/`(`cdp.mjs`, `harness.mjs`, `web.harness.mjs`) |
| `docs/` | 생성된 HTML 설명서, `tutorial/`(튜토리얼 문서·그림) |
| `samples/` | 예제 프로젝트(`*.ko.mwp`, `*.en.mwp`, 템플릿) — 설치 파일에 포함 |

## 일정 계산 엔진

`schedule(project)`는 프로젝트를 바꾸지 않고 `Schedule` 객체(작업별 `info`, 자원별 합계, 부하, 충돌)를 돌려줍니다. 시각은 모두 **분 단위 정수**(epoch 기준)이고, 기간은 **작업 시간 분**과 사용자가 쓴 단위(`durationUnit`)로 저장됩니다.

### 1. 개요

작업은 MS Project처럼 **한 줄로 된 목록 + `outlineLevel`**입니다. 다음 행이 더 깊으면 요약 작업입니다. `outline()`이 부모·자식·WBS를 만듭니다. 요약 작업은 날짜를 갖지 않고 하위 작업에서 합쳐집니다.

### 2. 의존 그래프

`buildGraph`는 **잎 작업(요약이 아닌 작업)** 사이의 간선만 만듭니다.

- 요약 작업에 걸린 연결은 그 안의 모든 잎 작업의 연결이 됩니다(자기 자신과 그 위 모든 요약 작업의 선행 작업을 모음).
- 선행 쪽이 요약 작업이면 그 잎 작업 묶음이 한 간선의 `from`이 됩니다. FS는 묶음의 가장 늦은 완료, SS는 가장 이른 시작을 기다립니다.
- 비활성 작업은 그래프에서 빠집니다.
- `topoOrder`(Kahn)로 순서를 정하고, 순환에 걸린 작업은 행 순서로 뒤에 붙인 뒤 충돌(`circular`)로 보고합니다. 편집 단계에서는 `wouldCycle`이 순환 연결을 막습니다.

### 3. 앞으로 계산 (빠른 날짜)

위상 순서로 각 잎 작업의 시작을 정합니다.

| 단계 | 규칙 |
|---|---|
| 연결 | FS: 선행 완료 + 지연, SS: 선행 시작 + 지연, FF: (선행 완료 + 지연)에서 기간만큼 뒤로, SF: (선행 시작 + 지연)에서 뒤로. 가장 늦은 후보가 이김 |
| 지연 | 작업 시간(프로젝트 달력), 경과 단위(`ed` 등)는 시계 시간, `%`는 선행 묶음 기간의 비율 |
| 제약 | SNET·FNET은 아래 한계, MSO·MFO는 고정, SNLT·FNLT는 위 한계. 연결과 맞지 않으면 `conflicts`에 기록하고 `honorConstraints`(기본 켬)에 따라 제약 또는 연결을 따름 |
| 그 밖 | 평준화 지연 더하기, 실제 시작이 있으면 그 날짜, 달력의 다음 작업 시각으로 맞춤, 100% 완료 작업은 실제 완료로 기간 재계산 |
| 수동 일정 | 입력한 시작·완료를 그대로 씀 |

각 작업은 자기 달력을 씁니다: 작업 달력 → 첫 작업 자원의 달력 → 프로젝트 달력(`Schedule.calendarFor`).

### 4. 뒤로 계산 (늦은 날짜)

프로젝트 완료(잎 작업 완료의 최댓값)에서 역순으로 늦은 완료·시작을 구합니다. 후속 작업의 늦은 날짜와 연결 유형, FNLT·SNLT 제약, **마감일**이 늦은 완료를 줄입니다.

- **ALAP**: 앞 계산이 끝난 뒤 역순으로, 후속 작업의 빠른 날짜가 허락하는 가장 늦은 위치로 옮깁니다.
- **완료 날짜 기준 일정**(`scheduleFrom: 'finish'`): 프로젝트 완료에서 먼저 뒤로 계산해 모든 작업을 늦은 날짜에 둡니다(수동·실제 시작·SNET/MSO/MFO/FNET 작업은 앞 계산). 그다음 가장 이른 시작에서 앞 계산을 한 번 더 해 여유 시간용 빠른 날짜를 얻습니다.

### 5. 여유 시간과 주 공정

- 총 여유 = min(빠른 시작↔늦은 시작, 빠른 완료↔늦은 완료) (작업 달력의 작업 시간).
- 자유 여유 = 각 후속 간선까지의 간격 중 최솟값(프로젝트 완료까지 포함), 0 이상.
- 주 공정 = 활성 · 미완료 · 총 여유 ≤ `criticalSlack` 일수.
- 요약 작업은 하위 작업의 min/max와 기간 가중 완료율을 갖습니다.

### 6. 비용·작업량 (`computeCosts`)

| 자원 종류 | 작업량 | 비용 |
|---|---|---|
| 작업 | 기간 × 단위 (작업량 고정이면 할당의 `work`) | 작업량(시간) × 표준 단가 + 사용당 비용 |
| 재료 | 0 | 수량 × 표준 단가 + 사용당 비용 |
| 비용 | 0 | 할당 금액 |

실제 값은 완료율만큼, 고정 비용은 작업(요약 작업 포함)에 더해지고 요약·프로젝트로 합산됩니다. 자원 없는 작업은 입력한 작업량을 씁니다. `ovtRate`와 `accrue`는 저장·XML 교환만 되고 계산에는 아직 쓰이지 않습니다.

### 7. 부하와 초과 할당 (`computeLoads`)

작업 자원마다 할당의 작업량을 작업 달력의 작업 구간에 고르게 펴서(`assignmentProfile`) 날짜별 분을 합칩니다. 그날 용량(최대 단위 × 자원 달력의 그날 작업 시간)을 넘으면 그 날이 초과 할당이고, 그 날에 걸친 작업에 `overallocated`가 붙습니다. `peak`은 가장 바쁜 날의 단위입니다. 사용 보기와 자원 그래프는 `resourceLoad` / `assignmentLoad`로 이 부하를 읽습니다.

### 8. 추적 값 (`computeTracking`)

기준 계획 0번과의 차이(시작·완료는 프로젝트 달력 작업 시간, 기간·작업량·비용은 값 차이), 상태 날짜(없으면 오늘) 기준 기대 완료율과 **늦음**, 상태(완료·늦음·예정·일정대로)를 구합니다.

### 9. 평준화 (`levelResources`)

옮길 수 있는 작업(자동 일정, 시작 전, 우선순위 < 1000, 활성, MSO/MFO 아님)의 지연을 지운 뒤, 순서(표준: 시작 → 우선순위 → 여유 → 위상 / ID / 우선순위 먼저)대로 하나씩 "이미 확정한 부하"에 들어갈 때까지 하루씩 미룹니다. 미룰 때마다 다시 일정 계산합니다. `withinSlack`이면 총 여유를 넘는 이동은 하지 않습니다. 결과는 `{ delays, moved, unresolved }`이고, 앱은 `levelingDelay`에 써서 실행 취소 한 단계로 만듭니다. 오래 걸리면 진행 팝업이 단계를 보여 줍니다.

## 문서와 실행 취소

- 편집은 모두 `app.js`의 `change(labelKey, mutate)` → `PlanDocument.apply(label, change)`를 거칩니다. 바꾸기 전 프로젝트를 JSON 스냅샷으로 `History`에 넣고(최대 200), 바뀌었으면 다시 계산합니다. 실행 취소/다시 실행은 스냅샷을 맞바꿉니다. 실행 취소 항목의 이름(`op.*`)은 툴팁과 상태 표시줄에 쓰입니다.
- `dirty`는 저장 시점 스냅샷과 비교하며, 접힘 상태(`collapsed`)는 제외합니다.
- 탭마다 보기 상태(`view`: 보기 id, 표, 필터·그룹·정렬, 강조, 검색, 스크롤)를 따로 가집니다.
- 일정은 매 편집마다 전체를 다시 계산합니다(**지금 계산**은 오늘 날짜만 새로 반영).

## 파일 형식

| 형식 | 구현 | 내용 |
|---|---|---|
| `.mwp` | `format.js` | `{ format: "myworkplan", version: 1, kind: "plan", saved, project }`. 자동 일정 작업에는 다른 프로그램이 읽도록 `scheduledStart/Finish`도 쓰고, 읽을 때 버림 |
| `.mwpt` | `format.js` | 같은 형식, `kind: "template"`. 완료율·실제 날짜·기준 계획·상태 날짜·평준화 지연을 지움 |
| MSPDI `.xml` | `interop.js` | MS Project 2010+ 형식. 기간 `PT40H0M0S`, Duration/LagFormat 코드, 지연은 1/10분 단위, `%` 지연은 LagFormat 19. 작업·개요·연결·제약·마감일·달력(주·예외)·자원·할당·기준 계획·사용자 필드(Text1~3, Number1, Flag1) |
| CSV | `interop.js` | 내보내기: UTF-8 BOM, CRLF, 영어 머리글 14열. 가져오기: 구분자 자동 감지, RFC 4180, 영어·MS Project 한국어 머리글, 들여쓰기로 개요 |
| 클립보드 | `interop.js`, `app.js` | 앱 안 복사는 `myworkplan/tasks` 표시가 붙은 JSON(작업·연결·할당), 동시에 엑셀용 TSV |

읽기는 고칠 수 있는 것을 고치고(빠진 필드 기본값, 끊어진 연결·할당 제거, 개요 수준 보정) 계획이 아닌 것은 `FormatError`(`format.notJson`, `format.notPlan`, `format.newer`, `format.notMspdi`, `format.emptyCsv`)로 거절합니다. 오류 코드는 UI에서 번역됩니다.

## 팝업

- **데스크톱**: 팝업은 `open_popup`으로 만드는 OS 창(label `popup-<kind>`)이며 메인 창에 소유됩니다. 메인 창 밖에 둘 수 있고, 메인 창이 없어지면(`Destroyed` → `app.exit(0)`) 함께 닫힙니다. 각 팝업은 `POPUPS` 표의 고정 크기이고 내용이 스크롤 없이 들어갑니다(긴 내용은 탭이나 쪽으로 나눔). 그린 뒤 `popup_ready`/`place_popup`으로 보여 빈 창이 깜빡이지 않습니다.
- **웹과 튜토리얼 중**: 같은 페이지를 `index.html?popup=<kind>` 프레임으로 메인 창 안에 띄우고 `postMessage`를 씁니다(`PopupHost.useFrames`). 튜토리얼은 화면 녹화에 팝업이 찍히도록 데스크톱에서도 프레임을 씁니다(`inline`).
- 매개변수는 모든 창이 공유하는 `localStorage`의 `myworkplan.popup.<kind>`로 넘기고, 팝업은 `result`(닫으며 결과) · `action`(열린 채로 메인 창에 요청: 찾기, 배경 고르기, 최근 파일 열기 …) · `ready` · `place` · `close` · `hide` 메시지로 답합니다.
- **메뉴**는 `menu` 팝업 하나를 재사용합니다. 시작 후 미리 만들어 두고(prewarm), 내용을 그린 뒤 크기를 재서 모니터 작업 영역 안에 놓습니다(아래 공간이 없으면 위로). 숨겼다가 다시 씁니다(`hide_popup`).
- 설정 팝업이 설정을 바꾸면 `localStorage`의 `storage` 이벤트로 메인 창이 다시 적용합니다.
- 작업·자원·프로젝트·달력 같은 편집 팝업은 받은 데이터의 사본(draft)을 고치고 **확인**할 때 한 번에 돌려주므로 실행 취소 한 단계가 됩니다.

## 플랫폼 경계

`src/platform/native.js`만 플랫폼을 압니다.

| 기능 | 데스크톱 (Rust 명령) | 웹 |
|---|---|---|
| 파일 열기/저장 | `read_text_file`, `write_text_file`, `write_base64_file` (청크 단위 진행률 `io-progress`, 임시 파일에 쓰고 rename) | File System Access(핸들은 IndexedDB에 보관), 없으면 `<input>`·내려받기 |
| 대화 상자 | `tauri-plugin-dialog` | 브라우저 파일 선택 |
| 배경 이미지 | `import_background`로 데이터 폴더에 복사, asset 프로토콜로 표시 | IndexedDB |
| 글꼴 목록 | `list_fonts` | `queryLocalFonts`(허락될 때) |
| 문서·링크 열기 | `open_document`(설치 폴더 `docs/`), `open_external` | `window.open('./docs/…')` |
| 예제·시작 파일 | `sample_files`, `startup_files`(명령줄의 .mwp/.mwpt) | 내장 예제 |
| 인쇄 | `print_window`(팝업 창의 OS 인쇄) | `window.print` |
| 언어 | `set_language`(백엔드 메시지 `tr!`) | — |

Rust 쪽 메시지는 모두 `tr!("한국어", "English")`로 두 언어를 가집니다. WebView2는 같은 프로필의 모든 웹뷰가 같은 인자를 써야 하므로 `BROWSER_ARGS` 상수 하나를 쓰고, 창을 만드는 명령은 async여야 합니다(동기 명령은 Windows에서 교착).

### 창

메인 창은 처음엔 숨겨 두었다가 첫 화면을 그린 뒤 보입니다. 제목은 `MyWorkPlan v<버전>`, 최소 크기는 1000×600이며, 툴바가 다 보이는 폭보다 좁아지지 않게 `setMinimumSize`를 갱신합니다. 위치·크기·최대화는 `window_state.rs`가 설정 폴더의 JSON에 저장합니다(쓰고 rename).

### 심각한 오류

Rust 패닉 훅이 메시지·위치·스레드·백트레이스를 데이터 폴더의 `crash.log`에 덧붙이고 `fatal-error` 이벤트로 메인 창에 보내면, 오류 팝업(**심각한 오류 (백엔드)**)이 전부 표시하고 복사할 수 있게 합니다. JS 쪽 오류는 `showError`가 같은 오류 팝업으로 보냅니다(명령 실행, 팝업 렌더링 오류는 `report-error` 액션).

## 단일 실행 잠금

`instance.rs`: 시작할 때 임시 폴더의 `myworkplan-<사용자>.lock`에 OS 파일 잠금(`try_lock`)을 겁니다. 이미 잠겨 있으면 시스템 언어로 "이미 실행 중" 오류 상자(`rfd`)를 보이고 종료 코드 3으로 끝납니다. 잠금은 프로세스가 끝나면(비정상 종료 포함) OS가 풀어 주므로 낡은 잠금 파일이 다음 실행을 막지 않습니다. 두 번째 실행에 넘긴 파일은 열리지 않습니다(전달 없음).

## 설치 프로그램 훅

`src-tauri/windows/hooks.nsh` (UTF-8 BOM 유지 — 아니면 NSIS가 한국어를 ANSI로 읽음):

| 훅 | 하는 일 |
|---|---|
| `NSIS_HOOK_PREINSTALL` | ① `%APPDATA%\com.shkwon.myworkplan`(창 상태·배경·crash.log) 또는 `%LOCALAPPDATA%\com.shkwon.myworkplan`(WebView2 프로필: 설정·최근 파일)이 있으면 지울지 묻기(조용한 설치 제외, 설치 언어에 맞는 문구). ② 이전 설치의 `uninstall.exe /S`를 기다려 실행하고, 폴더 이름이 제품 이름이면 폴더째 삭제 |
| `NSIS_HOOK_POSTINSTALL` | `MyWorkPlan.Plan` / `MyWorkPlan.Template`의 `DefaultIcon`을 `plan.ico` / `template.ico`로, 시작 메뉴에 `MyWorkPlan User's Guide.lnk`(→ `docs\UsersGuide.html`), 셸에 연결 변경 알림 |
| `NSIS_HOOK_POSTUNINSTALL` | 설명서 바로 가기 삭제 |

`tauri.conf.json`: 현재 사용자 설치, 언어 선택(Korean/English), `.mwp`/`.mwpt` 파일 연결, 리소스로 문서 아이콘·`docs/`(HTML 설명서·튜토리얼·그림·`UsersGuide.md`·`README.md`)·`samples/`. Linux deb/rpm은 `linux/myworkplan.xml` MIME과 문서 아이콘을 설치합니다.

## 문서 생성

- `scripts/build-docs.mjs`: 의존성 없는 Markdown → HTML 변환기. `UsersGuide.md` · `UsersGuide.en.md` · `docs/tutorial/README*.md`를 `docs/*.html`로 만들고(목차, 밝은/어두운 색, 표·코드·그림), 그림 경로를 `docs/` 기준으로 고친 뒤 `public/docs/`에 복사합니다(웹 빌드가 `./docs/`로 제공).
- 튜토리얼 캡처(`npm run tutorial:docs` / `tutorial:video`)는 `STEPS`(src/ui/tutorial.js) 순서대로 `docs/tutorial/images/NN-<id>.jpg`를 만들고, 사용 설명서는 그 이름으로 그림을 참조합니다. 단계를 더하거나 빼면 번호가 바뀌므로 설명서의 그림 참조도 함께 고칩니다.

## 테스트

`npm test`(`scripts/test.mjs`)가 분류별로 실행하고 결과를 표로 정리해 `test-results/results.json`에 씁니다.

| 분류 | 내용 |
|---|---|
| JS 단위 | `test/unit/*.test.js` — 일정 계산, 달력·시간, 가져오기/내보내기, 템플릿, 번역 키, 테마, 아이콘 |
| 패키징/아이콘 | `test/static/` — 설치 설정·훅·파일 연결·아이콘, 문서(`docs.test.js`: HTML·링크·그림·단축키 표) |
| Rust 단위 | `cargo test --lib` — 파일 입출력·진행률·BOM, 단일 실행 잠금, 창 위치 |
| E2E 웹 | 웹 빌드를 헤드리스 Edge/Chrome으로 조작 (`test/e2e/web.harness.mjs`, CDP) |
| E2E 데스크톱 GUI | 실제 앱을 띄워 메뉴·툴바·팝업·파일·인쇄·오류 팝업을 조작 (`test/e2e/harness.mjs`, WebView2 CDP) |
| 튜토리얼 | 모든 단계가 오류 없이 대상 요소를 그리는지 |
| 설치 프로그램 | `--installer`일 때 `npm run build:win` 후 NSIS 설치 파일 검사 |

### E2E 훅

| 훅 | 쓰임 |
|---|---|
| `window.__myworkplan` | 메인 창: `state`, `t`, `commands`, `run(id)`, `popups`, `api`, `debug()`, `actions`(newPlan · openPath · saveDoc · select · change · undo/redo · switchView · levelNow · findNext …), `domain`, `tutorial()` |
| `window.__myworkplanPopup` | 팝업 창: `kind`, `state`, `render`, `close`, `errorReport`, `printLayout`, `refresh`, `applyTask` / `applyResource` / `applyProject` |
| `window.__myworkplanPrintHook` | 있으면 OS 인쇄 대신 인쇄 레이아웃을 넘겨받음 |
| `globalThis.__MYWORKPLAN_NO_WELCOME`, URL `?nowelcome` | 첫 실행 환영 창 생략 |

### 환경 변수 (Rust)

| 변수 | 효과 |
|---|---|
| `MYWORKPLAN_MULTI` | 단일 실행 잠금을 건너뜀(여러 복사본 동시 실행) |
| `MYWORKPLAN_LOCK_DIR` | 잠금 파일 폴더(기본: 임시 폴더) |
| `MYWORKPLAN_ALREADY_RUNNING_FILE` | "이미 실행 중" 문구를 메시지 상자 대신 이 파일에 씀 |
| `MYWORKPLAN_CONFIG_DIR` | 창 위치 파일 폴더(사용자 것을 건드리지 않게) |
| `MYWORKPLAN_DATA_DIR` | 데이터 폴더(배경 이미지, crash.log) |
| `MYWORKPLAN_IO_DELAY_MS` | 파일 청크마다 지연 — 진행 팝업 확인용 |
| `MYWORKPLAN_TEST_COMMANDS` | `raise_test_panic` 명령 허용(심각한 오류 팝업 확인) |
| `MYWORKPLAN_OPEN_LOG` | 문서·링크를 여는 대신 경로를 이 파일에 기록 |
| `MYWORKPLAN_NO_OPEN` | 문서·링크를 열지 않음 |

WebView2의 CDP 포트와 사용자 데이터 폴더는 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, `WEBVIEW2_USER_DATA_FOLDER`로 테스트마다 따로 잡아 사용자의 설정·최근 기록을 건드리지 않습니다.
