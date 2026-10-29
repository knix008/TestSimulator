# MyCodeChecker 구조

화면(`src/`)과 분석 코어(`core/`)가 HTTP API 하나로만 이어집니다. 코어는 CommonJS, Node 내장 모듈만 씁니다(예외: AI 코드 수정의 `@anthropic-ai/sdk`, DB 내보내기의 `pg` · `mysql2` · `mssql` — 그 기능을 쓸 때만 불러옵니다). 같은 코어를 Vite 개발 서버, 웹 호스트, Tauri 사이드카, 명령줄 도구가 함께 씁니다.

```
┌──────────── src/ (React 18, Vite) ─────────────┐     scripts/scan.mjs   scripts/defect-cli.mjs
│ App.jsx · components/ · views/ · lib/backend.js │       (CI 스캐너)       (정밀 결함 분석의 CLI)
└───────────────┬────────────────────────────────┘             │                 │
                │ POST /api/<method>  (JSON)                    │                 │
┌───────────────▼──────────────── server/handle.js ─────────┐   │                 │
│  전송 토큰 · CORS · 사용자 토큰 → api.call(name, args)       │   │                 │
│  /api/<area>/<action> → core/compat-api.js (호환)  │   │                 │
└───────┬───────────────────────────────────────────────────┘   │                 │
        │ vite.config (dev) · server/server.js (web) · host/desktop.js (Tauri sidecar)
┌───────▼─────── core/api.js + core/api-ext.js ─────────────────▼─────────────────▼──┐
│ access.js(권한) · store.js(workspace.json) · scheduler.js · integrate.js · aifix.js · dbsink.js │
│ analyze.js ──► rules.js · rules-extra · metrics.js · duplication.js · coverage.js   │
│             └► defects.js(경로 체커 · CID) · engines.js ─► core/<area>/ 엔진 19개     │
│ platform/ (compliance · reports · scm · pullrequest · webhooks · users · external · │
│            history · measures · tools) · export/ (docx · xlsx · pdf) · integrations/ │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. 계층

### 화면 (`src/`)

- `App.jsx` — 작업 공간 상태, 메뉴 정의(시작 · 파일 · 편집 · 이슈 · 품질 · 보기 · 도구 · 도움말), 탭과 보기 전환, 단축키(Ctrl+Z · Ctrl+Y / Ctrl+Shift+Z 포함), 프로젝트 파일 · 최근 목록 · 프로젝트 삭제(`project.remove`), 대화 상자(사용자 규칙 · 필요한 소프트웨어 · 로그인), 분석 작업 폴링과 진행 창, 종료 전 저장 확인.
- `components/Chrome.jsx` — 메뉴 막대(시작 단추, 테마 분할 단추, 국기 언어 선택, 창 단추, 저장 안 한 변경이면 제목에 ●), 아이콘 도구 모음(열기 · 분석 · 데스크톱 · 실행 취소 · 다시 실행(풍선 도움말에 작업 이름) · 보기 바로 가기 · 브랜치 · 패널 토글), 왼쪽 탐색(`NAV_GROUPS`: 프로젝트 · 이슈 · 정밀 결함 분석 · 보안·규정 · 관리, 무리 접기 · 모두 펼치기/접기), 상태 표시줄, 대화 상자 틀.
- `components/DocTabs.jsx` — 가운데 탭 줄: 홈 고정, 닫기 ×, 가운데 클릭, 끌어 옮기기, 오른쪽 클릭 메뉴, 넘치면 `<` `>` `⌄`. 꺼진 탭도 마운트된 채 숨겨 두고 `useTabActive()` 로 활성 여부를 알려 줍니다.
- `components/Layout.jsx` — 왼쪽(탐색) · 오른쪽(세부 정보) · 아래 패널. 켜기/끄기, 접기(아이콘 + 제목 띠), 분할선으로 크기 조절, 상태는 `settings.panels`. 목록 보기는 `<Inspector>` 로 세부 내용을 오른쪽 패널에 포털로 그립니다(세부 정보는 그 패널에만 나옴).
- `views/` — 보기 하나당 컴포넌트. `Panels.jsx`(개요 · 이슈 · 핫스팟 · 측정값 · 코드 · 중복 · 활동 · 규칙 · 프로파일 · 게이트 · 포트폴리오 · 작업), `DefectAnalysis.jsx`(정밀 결함 분석), `Compliance.jsx`(보안 보고서 · MISRA), `Reports.jsx`(DB로 내보내기 포함), `Sca.jsx`, `History.jsx`(스냅샷), `PullRequest.jsx`, `Dast.jsx`, `Insights.jsx`(HIS · 아키텍처 · 예외 승인), `Admin.jsx` · `AdminExtras.jsx` · `Integrations.jsx`(관리 탭), `Tools.jsx`, `AiFix.jsx`, `BottomPanel.jsx`(문제 · 분석 로그 · 작업 · 출력), `ProjectFiles.jsx`(새 프로젝트 · 프로젝트 열기), `StartPage.jsx` + `lib/startBackground.js`(움직이는 배경 20종, 카드 배치는 `settings.startBackground`) + `lib/startLayout.js`(카드 배치: 옮기거나 크기를 바꾸면 아래 카드를 위로 당겨 빈틈을 메우고, 자동 정렬은 내용 높이로 세 열에 쌓는 masonry), `ScanProgress.jsx`(분석 진행 창: 단계 · 파일/엔진 · % · 지난/남은 시간 · 취소). 목록 보기는 제목 · 필터 · 열 머리글을 고정하고 행 영역만 스크롤합니다(창이 아주 작으면 보기 전체 스크롤).
- `views/Settings/` — 설정 창(`index.jsx`: 920×600 고정, 세로 탭, 확인까지 초안, 테마 · 언어 · 배경 바로 미리 보기와 취소 시 되돌림, 탭별 초기화, Esc = 취소 · Enter = 확인; `tabs.jsx`: 탭 10개). `components/ThemePicker.jsx`(사용자 정의 + 다크 20 | 라이트 20), `components/Flags.jsx`(국기 SVG).
- 데스크톱 팝업 — `lib/popups.js` 가 메뉴 · 펼침 목록 · 테마 선택 · 설정 · 정보 창을 Tauri 자식 창(`index.html#/window/<kind>?id=…`, `views/PopupWindow.jsx`)으로 열어 주 창 밖까지 펼칩니다. 결과는 Tauri 이벤트로 돌아옵니다. 웹판은 같은 컴포넌트를 페이지 안에 그립니다.
- 문서와 튜토리얼 — `lib/docs.js` 와 `components/UserGuide.jsx`(사용 설명서 창: `./docs/*.html` 을 iframe 으로, 국기로 언어 전환, 앱 테마 토큰을 `localStorage['mycodechecker.docTheme']` 와 postMessage 로 전달), `components/Tutorial.jsx` · `TutorialWelcome.jsx` · `TutorialSettings.jsx` · `lib/tutorialSteps.js`(가이드 투어, 진행은 `settings.tutorial`).
- `lib/i18n.js` — 한국어/영어 문자열 표 `t(key)`. `lib/backend.js` — `call(name, args)`: 웹은 같은 출처의 `./api/<name>`, 데스크톱은 Tauri 가 넣어 준 `window.__MCC_HOST__ = { port, token }` 로 사이드카에 `Authorization: Bearer <전송 토큰>`. 로그인했으면 `x-mcc-user-token` 을 함께 보냅니다.
- `themes.js` — 테마 토큰 40종(다크 20 · 라이트 20) + 사용자 정의(색 토큰 15개).
- `lib/ui.js` + `components/UiHost.jsx` — 앱 전체의 확인 창 · 알림(toast) · 오류 창. `ask({ title, body, okLabel, danger, buttons })` 는 확인/취소(또는 고른 단추 id), `attempt(fn, { ok })` 는 API 호출을 감싸 실패하면 서버가 준 `error.text[언어]` 로 오류 창을 띄웁니다. 삭제 · 비활성화 · 토큰 폐기 · 일괄 오탐/수용 · 정리 확인과 "바꾸기 / 기존 프로젝트 열기", "바꾸기 / 다른 위치에 저장" 같은 세 단추 질문이 이것을 씁니다.
- `lib/history.js` — 실행 취소 / 다시 실행 스택. `record({ label, undo, redo })` 는 이미 한 작업을 쌓고(`undo` · `redo` 는 원래 작업과 같은 API 를 부르는 async 함수), 최대 100개, 새 작업은 다시 실행 쪽을 비우고 다른 프로젝트를 열면 둘 다 비웁니다. 이슈 처리(하나 · 일괄), 게이트 · 프로파일 · 포트폴리오 · 정책 · 사용자 규칙, 프로젝트 설정, 패널, 시작 화면 배치, AI 수정 적용(되돌리기 = `issue.aiFixRevert`)이 기록합니다.
- `lib/dirty.js` — 종료 전 저장 확인용 변경 추적. 열린 프로젝트는 `.mccp` 에 들어가는 값의 서명(`projectSignature`, `core/projectfile.js` 의 설정 키와 맞춤)을 `project.open` · `project.saveFile` · `project.create` 때 찍어 두고 비교하며, 실행 취소 · 다시 실행도 다음 저장까지 바뀜으로 칩니다. 열린 편집기(설정 창, 규칙 · 게이트 · 프로파일 편집, 새 프로젝트 창)는 `useEditorDirty(key, dirty, { label, save })` 로 알리고, 자식 창의 편집기는 broadcast 로 알립니다. 닫을 때 저장 / 저장 안 함 / 취소를 묻습니다.
- 내보내기 저장 — 데스크톱은 저장 창으로 경로를 고른 뒤 `file.save` 로 쓰고 `저장됨: <경로>` 를 띄웁니다. 웹판은 브라우저 내려받기입니다.

### 호스트와 서버

| 진입점 | 쓰임 | 특징 |
|---|---|---|
| `vite.config.mjs` | `npm run dev` · `npm start` 의 Vite | 개발 서버 미들웨어로 `server/handle.js`. `scripts/dev.mjs` · `scripts/start.mjs` 가 `scripts/dev-port.mjs` 로 5210 부터 IPv4(127.0.0.1)와 IPv6(::1) 모두 빈 첫 포트를 골라 Vite · Tauri `devUrl` · 사이드카 CORS(`MCC_DEV_PORT`)에 넘깁니다. 다른 프로그램은 멈추지 않습니다 |
| `server/server.js` | `npm run web` (5211) | `dist/` 정적 파일 + `/api`. `--host`, `--port`(또는 `MCC_PORT`), `--config`, `--no-scheduler` |
| `host/desktop.js` | Tauri 사이드카 | 127.0.0.1 의 빈 포트, 임의 전송 토큰을 만들어 `MCC_READY {"port","token"}` 를 stdout 에 씀. `src-tauri/src/lib.rs` 가 함께 들어 있는 `node(.exe)` 로 띄우고 이 줄을 읽음 |

`server/handle.js` 는 `POST /api/<method>` 를 `api.call` 로 넘기고 `{ ok, data }` 또는 `{ ok:false, error:{ code, message, text:{ en, ko }, … } }` 를 돌려줍니다(BAD_REQUEST 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND · NO_METHOD 404, APPROVAL_REQUIRED · CONFLICT · LAST_ADMIN · CANCELLED 409, TOO_MANY 429). 오류 본문은 `core/api.js` 의 `serializeError` 가 만듭니다: `core/errors.js` 의 `describe(err)` 가 오류에 이미 `code` · `text` 가 있으면 그대로 쓰고, 없으면 메시지를 정규식 표(`TABLE`: `[패턴, 코드, 한국어 문장]`)에 맞춰 코드와 한국어 문장을 붙이며, 표에 없으면 코드별 기본 문장(`BY_CODE`)을 씁니다. 화면에 필요한 곁값(`projectId`, `projectName`, `file`, `keys`, `field` — 예: CONFLICT 가 어느 프로젝트인지)도 함께 보냅니다. 화면은 `text[지금 언어]` 를 보여 줍니다. 이름에 `/` 가 있으면(`/api/issues/search`) GET 이나 폼 POST 를 받아 `core/compat-api.js` 로 보냅니다. 사용자 토큰은 `x-mcc-user-token`, `Bearer <토큰>`, 호환 형식 Basic `<토큰>:` 에서 읽습니다. 본문은 64 MB 까지.

### API (`core/api.js`, `core/api-ext.js`)

`createApi({ configDir, sampleRoot, version, scheduler })` 가 메서드 표를 만들고 `call(name, args, { token })` 하나로 엽니다. `call` 은 ① `access.check` 로 권한 확인 ② 메서드 실행 ③ 보안 · 설정 · 분류 변경이면 감사 로그(`ws.auditLog`, 최근 5000건)에 남깁니다.

- `api.js` — 작업 공간, 규칙, 프로젝트 파일(`project.create` · `project.open` · `project.saveFile` · `project.remove`), 최근 목록(`recent.list/remove/clear`, 10개), 샘플(`samples.list` · `samples.open`), 필요한 소프트웨어(`tools.*`), 프로파일(`profile.*`), 분석(`project.scan` · `project.submit` · `project.sample`, 진행이 있는 분석 `scan.start` · `scan.job` · `scan.cancel`), 이슈(`issue.update` · `issue.review` · `issue.ticket`), 연동(`integrations.*`, `notify.subscribe`, `pr.decorate`), HIS · 아키텍처, DB(`db.get/save/test/export`), AI(`ai.get/save/test`, `issue.aiFix`, `issue.aiFixApply`, `issue.aiFixRevert`), 내보내기 파일 쓰기(`file.save`), 감사 로그, 예약(`schedule.*`), 포트폴리오 측정값, 정리.
  - `project.create` 는 소스 폴더가 이미 프로젝트면 `CONFLICT`(+ `projectId` · `projectName`)를 던지고 `{ replace: true }` 일 때만 바꿉니다. `project.saveFile` 은 이 프로젝트를 연 파일이 아닌 기존 `.mccp` 이면 `CONFLICT`(+ `file`)를 던지고 `{ overwrite: true }` 일 때만 씁니다. 화면은 이를 세 단추 질문(바꾸기 / 기존 프로젝트 열기 / 취소, 바꾸기 / 다른 위치에 저장 / 취소)으로 바꿉니다. `project.remove` 는 작업 공간에서 프로젝트와 분석만 지우고 소스 폴더와 `.mccp` 는 건드리지 않습니다.
  - `file.save({ path, text | base64 })` 는 데스크톱 전용입니다. `createApi({ localFiles: true })`(`host/desktop.js`)일 때만 있고, 그 밖(웹 서버)에서는 `NO_METHOD` 입니다. 저장 창이 고른 경로의 폴더가 있어야 씁니다.
- `api-ext.js` — 규정 · MISRA(`compliance.*`, `misra.*`), 보고서(`report.kinds/export/regulatory`), SCA(`sca.*`), DAST(`dast.*`), IDE 설정, SCM · PR(`scm.info`, `pr.analyze`), 웹훅, 사용자 · 권한(`security.*`), 외부 이슈 · 테스트 가져오기, 스냅샷 · 수명 · 활동 · 추세 · 이슈 나이 · 컴포넌트 트리. 분석 엔진에 넘길 옵션(`engineOptions`: SCA 권고 DB · 라이선스 정책, MISRA, C/C++ 포함 경로 · 매크로 · 데이터 모델, 아키텍처 규칙)과 분석 뒤처리(`afterScan`: 스냅샷 보관 12개, 작성자 할당, 웹훅)도 여기 있습니다.

### 권한 (`core/access.js`)

`ws.security.enabled` 가 꺼져 있으면(기본, 로컬 단일 사용자) 모든 호출을 허용합니다. 켜면 `ACCESS` 표의 규칙을 따릅니다.

| 규칙 | 뜻 | 예 |
|---|---|---|
| `'public'` | 로그인 없이 | `app.info`, `security.login`, `rules.list`, `report.kinds`, `dast.rules`, `compliance.standards` |
| `'auth'` | 로그인한 사용자(분석 토큰 불가) | `workspace.load/save`, `security.me`, `tools.status`, `profile.compare`, `ai.get`, `schedule.list`, `notify.subscribe`, `scan.job`, `scan.cancel`(작업 소유자 확인은 메서드 안에서), `file.save` |
| `['scan', 'project']` | 그 프로젝트의 분석 실행 | `project.scan`, `scan.start`, `sca.scan`, `pr.analyze`, `pr.decorate`, `external.import`, `tests.import` |
| `['scan', 'global']` | 분석 실행(전역) | `dast.start` · `dast.progress` · `dast.cancel`, 결과 읽기 `dast.results` · `dast.result` · `dast.report` |
| `['user', 'project']` | 그 프로젝트 보기 | `report.*`, `compliance.*`, `misra.plan`, `snapshot.*`, `metrics.his`, `arch.graph`, `issue.ticket` |
| `['codeviewer', 'project']` | 소스 보기 | `project.file`, `issue.aiFix` |
| `['issueadmin', 'project']` | 이슈 관리 | `issue.aiFixApply`, `issue.aiFixRevert` |
| `['admin', 'project']` | 프로젝트 관리 | `project.remove`, `misra.savePlan`, `db.export` |
| `['admin', 'global']` | 전역 관리(표에 없는 메서드의 기본값) | `security.*`, `webhook.*`, `integrations.*`, `ai.save`, `db.*`, `tools.install`, `schedule.save`, `audit.list` |

특별 규칙: `issue.update` 에서 상태 · 해결 · 분류를 바꾸면 `issueadmin`(핫스팟 상태는 `securityhotspotadmin`), 담당 · 의견은 `user`. `issue.review` 의 승인 · 반려는 `issueadmin`. 새 프로젝트를 만드는 `project.scan` 은 `provisioning` + `scan`. 분석 토큰(`mcp_` 프로젝트, `mca_` 전역)은 `scan` 만 합니다. 자기 계정의 토큰 · 비밀번호(`generateToken`, `revokeToken`, `listTokens`, `setPassword`)는 누구나 바꿉니다. `workspace.load` 는 볼 수 없는 프로젝트와 비밀 값을 빼고(`filterWorkspace`), `workspace.save` 는 구역마다 권한을 확인합니다(`profiles`/`customRules` → `profileadmin`, `gates` → `gateadmin`, 그 밖 → `admin`; 테마 · 언어 같은 개인 설정은 자유). 분석 데이터는 클라이언트에서 받지 않습니다.

사용자 관리(`platform/users.js`)는 마지막 활성 관리자를 지우거나 비활성화하는 변경을 `LAST_ADMIN` 으로 막고, 권한 검사를 켜기 전에 비밀번호가 있는 활성 관리자가 있어야 합니다(화면은 켜기 전에 그 계정 이름을 보여 줌). **로그인 잠금** — `security.login`(`api-ext.js`)은 로그인 ID(소문자)별 실패 시각을 메모리의 `loginFailures` 에 두고, 10분 안에 5번 실패했고 마지막 실패가 5분 안이면 `TOO_MANY`(429)로 거절합니다. 성공하면 기록을 지웁니다. 로컬 검사가 실패하면 LDAP 를 시도합니다.

## 2. 분석 엔진

### 분석 흐름 (`core/analyze.js`)

`project.scan` → `analyzePath(root, options)` → `analyzeSources(files, options)`:

1. **파일 모으기** — `walk` 가 `node_modules` · `.git` · `dist` · `build` · `target` · `vendor` · `.mcc` 등을 건너뛰고, 제외 패턴(glob)과 언어 감지(`languages.js`, 38종)를 거쳐 최대 `maxFiles`(기본 8000)개, 파일당 800 KB 까지 읽습니다. 커버리지 보고서도 읽습니다(`coverage.js`).
2. **파일별 처리** — `metrics.structuralIssues` 가 줄을 코드/주석으로 나누고 크기 · 복잡도 · 구조 이슈를 냅니다. 줄 해시(공백 정규화 MD5 앞 6자)를 남기고, 새 코드 줄을 정합니다(아래 4절). 이어서 줄 규칙(`rules.js` + `rules-extra`), 사용자 정규식 규칙, 정밀 결함 분석의 줄 경로 체커(`defectAnalysis.pathDefects`)를 돌립니다. `NOMCC`, `noqa`, `nolint`, `mcc-ignore`, `cov-ignore`, `parasoft-suppress`(그리고 호환 형식의 표지, 정규식은 `core/compat` 의 `SUPPRESSION_RE`)가 있는 줄은 건너뜁니다.
3. **계약 엔진** — `runEngines` 가 `engines.js` 의 엔진을 모든 파일에 한 번씩 돌립니다(파일을 건너는 호출 · include 추적). 엔진 하나가 예외를 던지면 그 엔진만 빠지고 `warnings` 에 남습니다. 규칙 언어가 파일 언어와 다르면 버립니다(`.h` 는 C/C++ 모두 허용).
4. **후처리** — 중복(`duplication.js`, 정규화한 8줄 창), 정밀 결함 분석 장식(`decorateIssue`: CID · 체커 · 영향 · 컴포넌트), 같은 줄의 정밀 엔진 결과가 있으면 줄 기반 `defect:*` 를 지움, `// mcc[CHECKER]` 주석 억제, 저장된 이슈 상태(상태 · 해결 · 담당 · 의견 · 분류 · 태그 · 예외 신청)를 키로 다시 붙임.
5. **측정값 · 등급 · 게이트** — `ratings.js`(A–E), 새 코드 측정값, `qualitygate.evaluateGate`, `defectAnalysis.summarizeDefects`(미해결 · 새로 발견 · 기각 · 수정됨 · 정책).

이슈 키는 `sha1(규칙 | 파일 | 정규화한 줄 내용 [| 엔진 줄·메시지])` 앞 16자라서 줄 번호가 바뀌어도 같은 이슈로 이어집니다. `listRules()` 는 줄 규칙 · 구조 규칙 · 정밀 결함 분석 체커 · 엔진 카탈로그를 합치고, CWE 로 행정안전부 2021 항목 번호(`standards.mois2021`)를 붙입니다.

`scan` 은 분석 뒤에 브랜치 상태(`latest`, 최근 30개 `history`, `keys`, `cids`, `lineHashes`, 스냅샷 번호)를 저장하고, 작업(`ws.tasks`, 최근 100개)을 남기고, 정리 · `afterScan` · 알림 · 웹훅 · DB 자동 내보내기를 차례로 합니다. `commit: false`(데스크톱 분석)이면 브랜치를 바꾸지 않고 `project.desktop` 에만 둡니다. `project.submit` 은 CI 가 올린 파일들을 서버의 `<데이터 폴더>/sources/<프로젝트 키>/` 에 풀어 같은 `scan` 으로 분석합니다. 가져온 외부 이슈는 다시 분석해도 브랜치에 남습니다.

**분석 중 저장 (`core/merge.js`)** — `scan` 은 시작할 때 작업 공간을 읽고 한참 뒤에 저장하므로, 그 사이 다른 호출이 저장한 변경(이슈 처리, 설정)을 덮어쓰면 안 됩니다. 저장할 때마다 `merge3(base, mine, theirs)` 로 3방향 병합합니다: `base` 는 분석이 읽은(또는 마지막으로 저장한) 상태, `mine` 은 분석이 바꾼 사본, `theirs` 는 지금 디스크의 작업 공간. 분석이 `base` 에서 바꾼 것은 분석 쪽이, 나머지는 `theirs` 가 이깁니다. 객체는 키마다, 모든 항목에 `id` 가 있는 배열은 항목마다 병합하고(한쪽에서 지우고 다른 쪽이 안 바꾼 항목은 지워진 채), 그 밖의 배열 · 값은 통째로 다룹니다. `tasks` 는 최신순을 유지합니다.

**진행이 있는 분석 (`scan.start` / `scan.job` / `scan.cancel`, `core/analyze-worker.js`)** — 화면은 `scan.start` 로 작업을 만들고(`{ jobId }`) `scan.job` 을 폴링합니다. 작업은 같은 `scan()` 을 돌리되 `analyzePath` 만 `worker_threads` 워커(`analyze-worker.js`)에서 실행해 서버가 폴링 · 취소에 계속 답합니다. 워커는 `{ type: 'progress', phase, done, total, detail }` · `{ type: 'done', analysis }` · `{ type: 'error', message }` 를 보냅니다(`analyze.js` 의 `options.onProgress`). SCA 권고 DB 는 복사하지 않고 워커 안에서 `osvSource` 로 다시 만듭니다. 단계별 비중(`WEIGHT`)은 `collect` 0–10 %, `rules` 10–55 %, `engines` 55–97 %, `finish` 97–100 % 이고, 진행 기록은 `{ phase, done, total, detail, percent(최대 99, 끝나면 100), elapsedMs, etaMs }` 입니다(남은 시간은 3 % 를 넘은 뒤 경과 시간으로 추정). 프로젝트당 실행 중인 작업은 하나라서 두 번째 `scan.start` 는 `{ jobId, joined: true }` 로 진행 중인 작업에 붙습니다. 작업은 시작한 사용자(`by`)와 관리자만 볼 수 있고, 다른 사람이면 `FORBIDDEN` 입니다. `scan.cancel` 은 상태를 `cancelled` 로 두고 워커를 끝내며, 분석은 `CANCELLED` 오류로 끝나 결과를 저장하지 않고 작업 기록에는 `CANCELED` 로 남습니다(실패 아님). 끝난 작업은 10분 뒤 잊습니다. `project.scan` 은 그대로 같은 프로세스에서 돕니다.

### 엔진 목록 (`core/engines.js`)

계약은 [core/ENGINE_CONTRACT.md](core/ENGINE_CONTRACT.md): `catalog() → RuleMeta[]`, `analyze(files, ctx) → Finding[]`, 규칙 키 `<family>:<id>`, 모든 문자열 `{ en, ko }`, Node 내장만.

| id | 영역 | 비고 |
|---|---|---|
| `taint` | 오염 분석(소스 → 싱크) | JS/TS, Python, Java, Kotlin, C#, PHP, Go, Ruby. `core/taint/README.md` |
| `sca` | 의존성 · 취약점 · 라이선스 · 도달 가능성 · 조각 · 바이너리 | `core/sca/README.md` |
| `misra-c`, `misra-cpp` | MISRA C:2012/2023, C++:2023 | `core/cfamily` 프런트엔드 위 |
| `cert` | CERT C / C++ | |
| `absint` | C/C++ 추상 해석(경로 민감, 함수 요약) | 정밀 결함 분석 체커 이름. `core/absint/README.md` |
| `kr-secure` | 행정안전부 보안약점 중 다른 엔진이 덮지 않는 항목 | |
| `his` | HIS 메트릭 위반 | `metrics.his` API 도 씀 |
| `arch` | 모듈 의존 · 순환 · 레이어 규칙 | `arch.graph` API 도 씀 |
| `iac` | CloudFormation · Kubernetes · Ansible · ARM · Bicep | 파일 내용으로 종류 판별 |
| `autosar` | AUTOSAR C++14 | |
| `misra-legacy` | MISRA C:2004 · C++:2008 | |
| `sem-js` … `sem-rb` | 언어별 의미 분석(JS/TS, Java, C#, Python, Go, PHP, Ruby) | |

줄 규칙 `core/rules.js` · `core/rules-extra/`, 구조 규칙 `core/metrics.js`, 줄 기반 정밀 결함 분석 체커 `core/defects.js`(`defect:*`)는 엔진 표 밖에서 직접 돕니다. C/C++ 공용 파스는 `core/cfront.js` → `core/cfamily`([AST.md](core/cfamily/AST.md)). 단위마다 포함 헤더 전체의 AST·토큰을 들고 있으므로, 소스·헤더가 150개를 넘는 프로젝트는 `cfront.batches()` 가 토큰 예산(약 100만)에 맞춘 묶음으로 나눠 파스하고, C/C++ 엔진 7개가 묶음마다 돈 뒤 그 묶음을 버립니다(어떤 단위도 포함하지 않는 헤더는 마지막에 단독으로). 프로젝트 전체 규칙은 이때 한 묶음씩만 봅니다. 분석 Worker 힙은 실제 메모리의 절반(최소 4 GB, `MCC_WORKER_HEAP_MB`)입니다.

### 새 엔진 더하기

1. `core/<area>/index.js` 에 `catalog()` 와 `analyze(files, ctx)` 를 계약대로 만듭니다. `ctx.inactive`(꺼진 규칙 키), `ctx.root`, `ctx.options`(= `analyzeSources` 옵션, `engineOptions` 가 넣은 값 포함)를 읽습니다.
2. `core/engines.js` 의 `ENGINE_MODULES` 에 `{ id, path }` 를 더합니다. 모듈이 없으면 건너뛰므로 순서대로 붙여도 됩니다.
3. 설정이 필요하면 `api-ext.js` 의 `engineOptions` 에 옵션을 더합니다.
4. `test/<area>.test.mjs` 를 만듭니다(`node --test`, 건너뛰는 테스트 · 경고 출력 없음, 테스트 이름은 영어).
5. 규칙 수가 바뀌면 화면 · README 의 숫자는 `listRules().length` 로 확인합니다.

## 3. 플랫폼 모듈

| 모듈 | 하는 일 |
|---|---|
| `platform/compliance.js` | 표준별 보고서(OWASP, ASVS, CWE Top 25, PCI DSS, STIG, SANS, CERT, MISRA, 행정안전부 2021 `mois2021`, 주요정보통신기반시설 `kisaWeb`). CWE 로 이슈를 범주에 연결. MISRA Compliance:2020 판정 |
| `platform/kr-standards.js` | 행정안전부 49 항목(7장), 주요정보통신기반시설 웹 26 항목과 CWE |
| `platform/reports.js` | 인쇄용 HTML 보고서 7종 + CSV |
| `export/` | 의존성 없는 Word(.docx) · Excel(.xlsx) · PDF(TTF 글꼴 내장) · ZIP. `report.export`, `report.regulatory`(기준 `mois2021` · `kisaWeb` 과 넣을 보고서 종류를 받음), `scan.mjs --report … --out *.pdf / *.docx / *.xlsx` |
| `platform/scm.js` | `git` 호출(변경 줄, blame, 태그, 브랜치). 실패하면 빈 값 |
| `platform/pullrequest.js` | 바뀐 줄 분석, PR 게이트, GitHub · GitLab · Azure DevOps · Bitbucket 장식 본문 |
| `platform/webhooks.js` | 호환 형식 페이로드, `X-MCC-Webhook-HMAC-SHA256` 서명, 전송 기록 |
| `platform/users.js` | 사용자 · 그룹 · 권한 · 템플릿, scrypt 비밀번호, 토큰(SHA-256 해시로 저장) |
| `platform/external.js` | 외부 도구 결과 · 테스트 보고서 가져오기 |
| `platform/history.js` | 스냅샷 비교(CID), 결함 수명, 활동 이벤트, 추세, 이슈 나이 |
| `platform/measures.js` | 조건 · 분기 커버리지, 테스트 지표, 컴포넌트 트리, 고칠 노력 |
| `binfile.js` | 바이너리 파일의 이슈 위치(`project.file` 의 `lines` · `find`): 4 MB 까지는 바로, 그보다 크면 백그라운드에서 1 MB 씩 읽어 줄바꿈 위치와 찾는 문자열을 모으고(`rangesPending: true` 동안 화면은 0.8초마다 다시 물음), 경로 · 크기 · 수정 시각으로 4 개 파일을 기억합니다. 화면의 16진수 보기(`Panels.jsx` `HexView`)는 보이는 줄만 그립니다 |
| `projectfile.js` | 프로젝트 파일 `*.mccp`(JSON `format: "mycodechecker-project"`, `version`, `name`, `key`, `source` — 파일 기준 상대 경로, `settings`: `mainBranch` · `exclusions` · `includeDirs` · `defines` · `coverageReports` · `arch` · `newCode` · `profiles` · `gateId` · `policyId` · `his` · `tags` · `description`) 읽기 · 쓰기. 분석 결과는 작업 공간에 남습니다. 데스크톱은 `tauri.conf.json` 의 `fileAssociations` 로 `.mccp` 를 앱에 연결합니다 |
| `platform/tools.js` | 필요한 소프트웨어(Git, C/C++ 컴파일러) 찾기와 패키지 관리자 설치(`tools.install` 을 부를 때만) |

### 연동 (`core/integrate.js` + `core/integrations/`)

`ws.settings.integrations` 에 SMTP · LDAP · 트래커(Jira, Redmine, GitHub, GitLab) · ALM(GitHub, GitLab, Azure DevOps, Bitbucket) · 구독 · 기본 URL 을 둡니다. 비밀 값은 화면에 `••••••••` 로만 보내고, 그대로 돌아오면 저장된 값을 지킵니다. `notify(ws, event, ctx)` 는 구독자에게 메일을 보내고 실패해도 분석을 멈추지 않습니다. 이벤트: `gate-changed`, `issues-assigned`, `defect-high-impact`, `exception-pending/approved/rejected`, `scan-failed`.

### 예약 (`core/scheduler.js`)

`{ id, name, kind: 'scan'|'dast', projectId|path, branch, cron, enabled }`. 5필드 cron(`@daily` 같은 별칭 포함)을 풀고, 서버 프로세스(`scheduler: true` — 웹 호스트와 데스크톱 사이드카)가 30초마다 확인해 때가 된 것을 하나씩 실행합니다. 결과는 `lastRun`, `lastStatus`(SUCCESS · GATE_FAILED · FAILED), `nextRun` 에 남습니다.

### 호환 형식 (`core/compat/`)

다른 코드 분석 도구도 쓰는 형식을 읽어 기존 프로젝트 · CI 작업 · 소스 주석이 그대로 동작하게 합니다. **호환 형식의 이름(속성 파일 이름, 키 접두어, 환경 변수, 주석 표지, 모델 함수 접두어, 형식 id, 옛 게이트 id)을 적는 곳은 `core/compat/index.js` 하나뿐이고**, 다른 모듈은 여기의 상수와 함수를 가져다 씁니다. 기본값은 어디서나 우리 이름(`mcc-project.properties`, `mcc.*` 키, `MCC_TOKEN`, `NOMCC` · `mcc[...]` · `mcc-ignore` 주석, `__mcc_*__` 모델 함수)이고, 옛 이름은 입력으로만 받습니다.

| 묶음 | 내용 |
|---|---|
| 속성 | `PROPERTY_FILES`(우리 파일 먼저), `normalizeProperties` — 호환 키를 `mcc.*` 로 바꾸고, 둘 다 있으면 우리 키가 이김(모듈 키 `a.<접두어>.x` 포함) |
| 토큰 | `TOKEN_ENV = 'MCC_TOKEN'`, `tokenFromEnv` — 우리 변수 먼저, 없으면 호환 변수 |
| 억제 주석 | `SUPPRESS_MARKER = 'NOMCC'`(빠른 수정이 쓰는 표지), `SUPPRESSION_RE`, `MARKER_RE`, 체커 주석 `annotationRe`(`// mcc[CHECKER]` 와 호환 표기) |
| 함수 모델 | `MODEL_PREFIX = '__mcc_'`, `normalizeModelSource` — 호환 모델 함수 이름을 우리 이름으로 |
| 커버리지 · 가져오기 | `COVERAGE_FILES`(일반 커버리지 XML 위치), `FORMATS`(`generic-issues` · `defect-json` · `generic-tests`), `FORMAT_ALIASES` · `normalizeFormat`(옛 형식 id), `DEFECT_JSON_TYPE`, `DEFECT_ENGINE = 'defect'` |
| 웹 API | `WEBHOOK_SIGNATURE_HEADER = 'X-MCC-Webhook-HMAC-SHA256'`, `LEGACY_GATE_ID` · `LEGACY_GATE_NAME`(옛 기본 게이트) |
| 이슈 키 | `LEGACY_RULE_PREFIXES`, `hashRuleKey`(이름이 바뀐 규칙 접두어는 옛 철자로 해시해 이슈 키와 그 아래 처리 상태가 그대로), `currentRuleKey` |

`core/compat/migrate.js` 는 이전 버전이 저장한 데이터를 지금 형식으로 올립니다. `migrateWorkspace(ws)` 는 `store.load()` 가 `workspace.json` 을 읽을 때마다, `migrateProjectSettings(settings)` 는 `projectfile.readProjectFile` 이 `.mccp` 를 읽을 때마다 돕니다. 바뀐 객체 키(`KEY_MAP`, 예: 옛 정밀 결함 분석 구역 → `defectAnalysis`), 문자열 값(`VALUE_MAP`: 보고서 종류 · 이벤트 · 기록 구역 · 가져오기 형식), 태그(`TAG_MAP`), 옛 규칙 키 접두어(`currentRuleKey`), 옛 기본 게이트 id · 이름(→ `checker-way` / `Checker way`, 그 게이트를 쓰던 프로젝트의 `gateId` 도)을 고칩니다. 두 철자가 함께 있으면 지금 것을 지키고 빈 곳만 옛 것으로 채웁니다. 이미 지금 형식이면 그대로 통과하므로 여러 번 돌려도 같습니다. 이슈 키는 `hashRuleKey` 덕분에 바뀌지 않아 분류(triage)가 이어집니다.

### 호환 API (`core/compat-api.js`)

`api.call` 을 거치므로 권한이 그대로 적용됩니다. 경로: `authentication/validate`, `server/version`, `system/status`, `system/health`, `projects/search`, `project_branches/list`, `components/show`, `issues/search`, `issues/assign`, `issues/add_comment`, `issues/do_transition`(confirm · unconfirm · reopen · resolve · falsepositive · wontfix · accept), `issues/set_tags`, `hotspots/search`, `measures/component`, `qualitygates/list`, `qualitygates/project_status`, `qualityprofiles/search`, `rules/search`, `rules/show`, `ce/activity`. 쪽 나누기는 `p` · `ps`(최대 500).

### CI 스캐너 (`scripts/scan.mjs`)

로컬 분석은 `analyzePath` 를 바로 부르고, `--server` 는 파일을 `project.submit` 으로 올립니다. 설정은 `mcc-project.properties`(없으면 `core/compat` 의 호환 속성 파일)에서 읽습니다. `--exclude <glob>` 은 여러 번 줄 수 있고 `mcc.exclusions` 와 합칩니다. `--workspace [설정 폴더]` 는 `createStore` 로 앱의 `workspace.json` 을 찾아 `os.tmpdir()` 의 임시 폴더(`mcc-cli-*`)에 복사한 뒤 그 폴더로 `createApi({ configDir })` 를 만들어 분석하므로, 앱의 프로파일 · 게이트 · 제외 · 이슈 상태를 쓰면서 원래 작업 공간은 바꾸지 않습니다.

### 정밀 결함 분석 명령줄 (`core/defect-cli.js`, `scripts/defect-cli.mjs`)

`npm run defects -- <명령>` 으로 부릅니다. 중간 폴더(`--dir`, 기본 `<path>/.mcc`)에 캡처와 마지막 분석을 둡니다. `configure` → `build`(컴파일러 shim 또는 `compile_commands.json` 에서 포함 경로 · 매크로 · 표준) 또는 `capture`(빌드 없이) → `analyze`(체커 켜고 끄기, aggressiveness, 코딩 표준) → `format-errors`(JSON v8 · HTML · 텍스트) → `commit-defects`(작업 공간의 스트림에 스냅샷, 정책 실패 시 종료 코드 1). `run-desktop`, `make-library`(C 스텁 → 함수 모델), `import-results`, `manage-im`(결함 · 스트림 · 스냅샷 보기, 분류 바꾸기).

### AI 코드 수정 (`core/aifix.js`)

`ws.settings.ai = { enabled, provider: 'anthropic'|'openai-compatible'|'ollama', model, baseUrl, apiKey, effort, maxTokens, contextLines, timeoutMs, language }`. `issue.aiFix` 는 이슈 줄 앞뒤 `contextLines` 줄(번호 붙임) · 규칙 설명 · 데이터 흐름을 보내 `{ startLine, endLine, replacement, explanation, confidence }` JSON 을 받습니다. Anthropic 은 공식 SDK(기본 모델 `claude-opus-5-5`, 키가 없으면 `ANTHROPIC_API_KEY` 나 `ant auth login` 프로필), OpenAI 호환은 `/chat/completions`(Azure 는 `api-key` 머리글), Ollama 는 `/api/chat`(기본 `http://127.0.0.1:11434`). 제안에는 원래 파일의 해시가 붙고, `issue.aiFixApply` 는 파일이 그 뒤로 바뀌었으면 거절합니다. 적용하면 `saveUndo` 가 되돌리기 자료(`{ id, projectPath, file, hashAfter, source(적용 전 원본), at }`)를 `<configDir>/aifix-undo/<undoId>.json` 에 두고 결과에 `undoId` 를 돌려줍니다. `issue.aiFixRevert({ projectId, undoId, issueKey })` 는 `revertFix` 로 파일의 지금 해시가 `hashAfter` 와 같을 때만 원본을 되쓰고(다르면 `CONFLICT`, 자료가 없으면 `NOT_FOUND`) 자료 파일을 지우며, 이슈에 `[AI CodeFix] undone` 의견을 남깁니다. 화면의 **되돌리기**와 편집 › 실행 취소가 이것을 부릅니다. 프로젝트 밖 경로(`..`)는 받지 않습니다. 기능은 기본 꺼짐이며, 원격 공급자를 고르면 코드 조각이 그 서버로 갑니다.

### DB 내보내기 (`core/dbsink.js`)

`ws.settings.database = { enabled, kind: 'sqlite'|'postgres'|'mysql'|'mssql', file, perProject, host, port, database, user, password, ssl, schema: 'mcc', autoExport, includeIssues }`. SQLite 는 Node 내장 `node:sqlite`(기본 파일 `<데이터 폴더>/mycodechecker.db`; `perProject`(기본 켜짐)이면 같은 폴더의 `<파일 이름>-<프로젝트 키>.db` 로 프로젝트마다 파일을 따로 씁니다 — `fileFor`. 연결 시험은 그 폴더에 임시 파일을 만들어 보고 지웁니다), 나머지는 `pg` · `mysql2` · `mssql`. 표는 `<접두사>_projects`, `_analyses`, `_issues`, `_measures` 이고 없으면 만듭니다. 같은 분석을 다시 내보내면 그 행을 바꿔 써서 몇 번 해도 같습니다. 자동 내보내기 실패는 분석을 멈추지 않고 작업 경고(`DB: …`)가 됩니다.

## 4. 작업 공간 저장 (`core/store.js`)

모든 상태는 JSON 파일 하나 `workspace.json` 이고, 분석의 이슈 목록만 같은 폴더의 SQLite 파일에 둡니다. 목록 하나가 파일 하나이고 프로젝트마다 폴더를 나눕니다: `projects/<프로젝트 id>/branch-<해시>.db`(브랜치의 최신 분석) · `snap-<해시>.db`(스냅샷) · `desktop.db`(데스크톱 분석)(`core/issuedb.js` 의 `openStore`; 파일마다 검색 · 정렬 · 집계용 좁은 행 `issue` 와 이슈 JSON `body` 를 따로). 검색은 그 목록의 작은 파일에서만 하고, 다시 쓰는 목록은 새 파일(`*.new`)에 저널 · 인덱스 없이 한꺼번에 쓰고(`open(file, { bulk: true })`) 인덱스를 나중에 만든 뒤 옛 파일과 바꾸므로 세 배쯤 빠르고 도중에 꺼져도 옛 목록이 남으며(수 초가 걸리는 SQL — 새 파일의 인덱스, 이전 `issues.db` 에서 옮기기, 낱말 인덱스 — 은 `core/issuedb-worker.js` 스레드에서 하므로(`runJob`, 멈춤 표시 `stopJobs`) 서비스는 그동안에도 답합니다), 지운 프로젝트 · 스냅샷은 행을 지우지 않고 파일을 지웁니다. 열린 파일은 프로세스 전체에서 함께 쓰고(최대 48개, 오래 안 쓴 것부터 닫음), 옛 파일을 다른 곳에서 열고 있어 바꿀 수 없으면 그 자리에 씁니다. 인덱스는 거르기 · 정렬마다 하나(규칙 · 유형 · 심각도 · 파일 · 엔진 · 상태 · 새 코드)이고 모두 끝에 `type` 을 두어, 기본 거르기(보안 핫스팟 제외)와 집계를 행을 읽지 않고 인덱스만으로 답합니다(이전 버전 파일은 처음 검색할 때 새 인덱스로 바꿈). 낱말 검색은 FTS5 trigram 인덱스(`fts`, 낱말 일부도 찾음 — `instr` 과 같은 결과)로 하며, 처음 낱말을 검색할 때 백그라운드에서 조금씩 만들고 그동안은 행마다 `instr` 로 찾습니다. 아직 읽지 않은 목록의 이슈를 바꾸면(`issue.update`) 목록을 읽지 않고 그 행만 키로 찾아 바꾸고(`store.pendingByKeys` · `updatePending`), 목록은 백그라운드에서 읽어 게이트를 다시 셉니다(나중에 읽는 목록에는 그 변경을 덮어씀). API 읽기 캐시 키에는 `store.issueRevision()` 이 들어갑니다. 이전 버전의 `issues.db` 하나에 있던 목록은 백그라운드에서 조금씩(`importListAsync`, 5000 행씩) 자기 파일로 옮기고, 그동안은 `issues.db` 에서 그대로 읽고 찾으며(인덱스는 건드리지 않음), 쓰는 목록이 모두 옮겨지면 `issues.db` 를 지웁니다(`store.storageIdle()`). `workspace.json` 에는 그 자리에 `{ $db, count }` 가 남고, 목록은 실제로 읽을 때까지 읽지 않습니다(`store.pendingIssues`). 이슈 하나를 바꾸면 그 행만(`store.changed`), 새 분석은 저장 전에 조금씩 나눠(`store.prepareLists`) 씁니다. 이슈 화면의 검색은 `issue.search`(필터 · 낱말 · 정렬 · 페이지 · 건수)로 데이터베이스에서 합니다. 위치는 `--config`, `MCC_USER_DATA`, 그다음 OS 기본값(Windows `%APPDATA%\MyCodeChecker`, macOS `~/Library/Application Support/MyCodeChecker`, Linux `$XDG_CONFIG_HOME/MyCodeChecker`). `load()` 는 파일이 없거나 깨졌으면 `freshWorkspace()` 를 주고, 읽은 데이터를 먼저 `migrateWorkspace`(`core/compat/migrate.js`)로 지금 형식으로 올린 뒤 저장된 값 위에 새 기본값을 합칩니다(설정 · 정밀 결함 분석 구역). 오래 걸리는 분석의 저장은 `core/merge.js` 의 3방향 병합을 거칩니다(2절). AI 수정의 되돌리기 자료는 같은 폴더의 `aifix-undo/` 에 따로 둡니다.

| 구역 | 내용 |
|---|---|
| `settings` | 테마 · 언어 · 제외 패턴 · 새 코드 기준 · 한계값 · 승인 · 라이선스 정책 · C/C++ · 정리 · 패널(`panels`) · 시작 화면 배경 · 사용자 정의 테마 · 튜토리얼 진행(`tutorial`) · `integrations` · `ai` · `database` |
| `gates`, `profiles`, `customRules` | 품질 게이트(기본 `Checker way`), 언어별 프로파일(기본 `Checker way`, 상속 · 변경 기록), 사용자 정규식 규칙 |
| `projects[]` | `id`(경로의 SHA-1 앞 12자), `key`, `path`, `mainBranch`, `gateId`, `profiles`, `newCode`, `branches{ 이름: { latest, history, keys, cids, lineHashes, snapshot, snapshots } }`, `issueState{ 키 또는 cid:N: 상태 }` |
| `defectAnalysis` | 정책 · 컴포넌트 · 함수 모델 · 보기 |
| `portfolios`, `tasks`, `schedules`, `webhooks`, `webhookDeliveries`, `security`, `auditLog`, `dast`, `misraPlans` | 이름 그대로 |

## 5. 새 코드 모델

`newCodeOptions` 가 프로젝트(`project.newCode`)나 작업 공간 설정의 기준으로 정합니다.

- **SCM**(`scm`) · **이전 버전**(`version`) — `git diff` 로 바뀐 줄(`scm.changedLines`)을 받아 `isNewLine(file, line)`. 참조를 비우면 직전 커밋, 브랜치 분석은 대상 브랜치. git 이 없거나 저장소가 아니면 아래 해시 방식으로 내려갑니다.
- **이전 분석**(`previous`, 기본) — 기준 분석의 줄 해시 묶음과 비교해, 기준에 없는 내용의 줄을 새 줄로 봅니다(같은 해시는 개수만큼 소비). 이슈는 키가 기준에 없고 새 줄에 있을 때 새 이슈입니다.
- **일수**(`days`) · **특정 분석**(`analysis`) — 그 시점 분석의 이슈 키와 비교합니다.
- 기준이 없으면(첫 분석) 모두 새 코드입니다.

새 코드 커버리지는 새 줄 가운데 보고서에 있는 줄만, 새 코드 중복은 새 줄에 걸친 중복 줄로 셉니다. 메인이 아닌 브랜치는 대상 브랜치(기본 메인)의 줄 해시 · 키와 비교합니다.

## 6. 테스트

```bash
npm test     # node --test --test-reporter=./test/reporter.mjs test/*.test.mjs
```

`test/<area>.test.mjs` 51개 파일이 엔진 · 플랫폼 · API · 권한 · 예약 · 내보내기 · 프로젝트 파일 · 데스크톱 호스트를 시험합니다(7600개 이상). `test/reporter.mjs` 는 영어로, 파일마다 머리글, 테스트마다 정렬한 줄(상태 · 번호 · 이름 · 걸린 시간 — 시간에 따라 색), 끝에 파일별 요약 표와 통과 막대 · 통과율 · 실패 목록을 내고 `test/last-report.txt` 에 남깁니다. 건너뛰는 테스트와 경고 출력은 두지 않습니다. 작업 공간을 쓰는 테스트는 임시 `configDir` 을 씁니다. 사용 설명서 · 튜토리얼 문서 · README · 이 문서의 HTML 은 `npm run build:docs`(`scripts/build-docs.mjs`, 의존성 없음 — 목차, 라이트/다크, 한글 글꼴, 앱 테마 따르기)로 `docs/` 와 `public/docs/` 에 만들고, 앱의 도움말 메뉴와 사용 설명서 창이 `./docs/` 에서 엽니다. 튜토리얼 문서와 그림은 `npm run tutorial:capture` 가 만듭니다.
