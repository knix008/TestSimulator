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

- `App.jsx` — 작업 공간 상태, 메뉴 정의(시작 · 파일 · 이슈 · 품질 · 보기 · 도구 · 도움말), 탭과 보기 전환, 단축키, 프로젝트 파일 · 최근 목록, 대화 상자(사용자 규칙 · 필요한 소프트웨어 · 로그인).
- `components/Chrome.jsx` — 메뉴 막대(시작 단추, 테마 분할 단추, 국기 언어 선택, 창 단추), 아이콘 도구 모음(열기 · 분석 · 데스크톱 · 보기 바로 가기 · 브랜치 · 패널 토글), 왼쪽 탐색(`NAV_GROUPS`: 프로젝트 · 이슈 · 정밀 결함 분석 · 보안·규정 · 관리, 무리 접기 · 모두 펼치기/접기), 상태 표시줄, 대화 상자 틀.
- `components/DocTabs.jsx` — 가운데 탭 줄: 홈 고정, 닫기 ×, 가운데 클릭, 끌어 옮기기, 오른쪽 클릭 메뉴, 넘치면 `<` `>` `⌄`. 꺼진 탭도 마운트된 채 숨겨 두고 `useTabActive()` 로 활성 여부를 알려 줍니다.
- `components/Layout.jsx` — 왼쪽(탐색) · 오른쪽(세부 정보) · 아래 패널. 켜기/끄기, 접기(아이콘 + 제목 띠), 분할선으로 크기 조절, 상태는 `settings.panels`. 목록 보기는 `<Inspector>` 로 세부 내용을 오른쪽 패널에 포털로 그립니다(세부 정보는 그 패널에만 나옴).
- `views/` — 보기 하나당 컴포넌트. `Panels.jsx`(개요 · 이슈 · 핫스팟 · 측정값 · 코드 · 중복 · 활동 · 규칙 · 프로파일 · 게이트 · 포트폴리오 · 작업), `정밀 결함 분석.jsx`, `Compliance.jsx`(보안 보고서 · MISRA), `Reports.jsx`(DB로 내보내기 포함), `Sca.jsx`, `History.jsx`(스냅샷), `PullRequest.jsx`, `Dast.jsx`, `Insights.jsx`(HIS · 아키텍처 · 예외 승인), `Admin.jsx` · `AdminExtras.jsx` · `Integrations.jsx`(관리 탭), `Tools.jsx`, `AiFix.jsx`, `BottomPanel.jsx`(문제 · 분석 로그 · 작업 · 출력), `ProjectFiles.jsx`(새 프로젝트 · 프로젝트 열기), `StartPage.jsx` + `lib/startBackground.js`(움직이는 배경 20종, 카드 배치는 `settings.startBackground`).
- `views/Settings/` — 설정 창(`index.jsx`: 920×600 고정, 세로 탭, 확인까지 초안, 테마 · 언어 · 배경 바로 미리 보기와 취소 시 되돌림, 탭별 초기화, Esc = 취소 · Enter = 확인; `tabs.jsx`: 탭 10개). `components/ThemePicker.jsx`(사용자 정의 + 다크 20 | 라이트 20), `components/Flags.jsx`(국기 SVG).
- 데스크톱 팝업 — `lib/popups.js` 가 메뉴 · 펼침 목록 · 테마 선택 · 설정 · 정보 창을 Tauri 자식 창(`index.html#/window/<kind>?id=…`, `views/PopupWindow.jsx`)으로 열어 주 창 밖까지 펼칩니다. 결과는 Tauri 이벤트로 돌아옵니다. 웹판은 같은 컴포넌트를 페이지 안에 그립니다.
- 문서와 튜토리얼 — `lib/docs.js` 와 `components/UserGuide.jsx`(사용 설명서 창: `./docs/*.html` 을 iframe 으로, 국기로 언어 전환, 앱 테마 토큰을 `localStorage['mycodechecker.docTheme']` 와 postMessage 로 전달), `components/Tutorial.jsx` · `TutorialWelcome.jsx` · `TutorialSettings.jsx` · `lib/tutorialSteps.js`(가이드 투어, 진행은 `settings.tutorial`).
- `lib/i18n.js` — 한국어/영어 문자열 표 `t(key)`. `lib/backend.js` — `call(name, args)`: 웹은 같은 출처의 `./api/<name>`, 데스크톱은 Tauri 가 넣어 준 `window.__MCC_HOST__ = { port, token }` 로 사이드카에 `Authorization: Bearer <전송 토큰>`. 로그인했으면 `x-mcc-user-token` 을 함께 보냅니다.
- `themes.js` — 테마 토큰 40종(다크 20 · 라이트 20) + 사용자 정의(색 토큰 15개).

### 호스트와 서버

| 진입점 | 쓰임 | 특징 |
|---|---|---|
| `vite.config.mjs` | `npm run dev` · `npm start` 의 Vite | 개발 서버 미들웨어로 `server/handle.js`. `scripts/dev.mjs` · `scripts/start.mjs` 가 `scripts/dev-port.mjs` 로 5210 부터 IPv4(127.0.0.1)와 IPv6(::1) 모두 빈 첫 포트를 골라 Vite · Tauri `devUrl` · 사이드카 CORS(`MCC_DEV_PORT`)에 넘깁니다. 다른 프로그램은 멈추지 않습니다 |
| `server/server.js` | `npm run web` (5211) | `dist/` 정적 파일 + `/api`. `--host`, `--port`(또는 `MCC_PORT`), `--config`, `--no-scheduler` |
| `host/desktop.js` | Tauri 사이드카 | 127.0.0.1 의 빈 포트, 임의 전송 토큰을 만들어 `MCC_READY {"port","token"}` 를 stdout 에 씀. `src-tauri/src/lib.rs` 가 함께 들어 있는 `node(.exe)` 로 띄우고 이 줄을 읽음 |

`server/handle.js` 는 `POST /api/<method>` 를 `api.call` 로 넘기고 `{ ok, data }` 또는 `{ ok:false, error:{code,message} }` 를 돌려줍니다(UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, APPROVAL_REQUIRED 409). 이름에 `/` 가 있으면(`/api/issues/search`) GET 이나 폼 POST 를 받아 `core/compat-api.js` 로 보냅니다. 사용자 토큰은 `x-mcc-user-token`, `Bearer <토큰>`, 호환 형식 Basic `<토큰>:` 에서 읽습니다. 본문은 64 MB 까지.

### API (`core/api.js`, `core/api-ext.js`)

`createApi({ configDir, sampleRoot, version, scheduler })` 가 메서드 표를 만들고 `call(name, args, { token })` 하나로 엽니다. `call` 은 ① `access.check` 로 권한 확인 ② 메서드 실행 ③ 보안 · 설정 · 분류 변경이면 감사 로그(`ws.auditLog`, 최근 5000건)에 남깁니다.

- `api.js` — 작업 공간, 규칙, 프로젝트 파일(`project.create` · `project.open` · `project.saveFile`), 최근 목록(`recent.list/remove/clear`, 10개), 샘플(`samples.list` · `samples.open`), 필요한 소프트웨어(`tools.*`), 프로파일(`profile.*`), 분석(`project.scan` · `project.submit` · `project.sample`), 이슈(`issue.update` · `issue.review` · `issue.ticket`), 연동(`integrations.*`, `notify.subscribe`, `pr.decorate`), HIS · 아키텍처, DB(`db.get/save/test/export`), AI(`ai.get/save/test`, `issue.aiFix`, `issue.aiFixApply`), 감사 로그, 예약(`schedule.*`), 포트폴리오 측정값, 정리.
- `api-ext.js` — 규정 · MISRA(`compliance.*`, `misra.*`), 보고서(`report.kinds/export/regulatory`), SCA(`sca.*`), DAST(`dast.*`), IDE 설정, SCM · PR(`scm.info`, `pr.analyze`), 웹훅, 사용자 · 권한(`security.*`), 외부 이슈 · 테스트 가져오기, 스냅샷 · 수명 · 활동 · 추세 · 이슈 나이 · 컴포넌트 트리. 분석 엔진에 넘길 옵션(`engineOptions`: SCA 권고 DB · 라이선스 정책, MISRA, C/C++ 포함 경로 · 매크로 · 데이터 모델, 아키텍처 규칙)과 분석 뒤처리(`afterScan`: 스냅샷 보관 12개, 작성자 할당, 웹훅)도 여기 있습니다.

### 권한 (`core/access.js`)

`ws.security.enabled` 가 꺼져 있으면(기본, 로컬 단일 사용자) 모든 호출을 허용합니다. 켜면 `ACCESS` 표의 규칙을 따릅니다.

| 규칙 | 뜻 | 예 |
|---|---|---|
| `'public'` | 로그인 없이 | `app.info`, `security.login`, `rules.list`, `report.kinds`, `dast.rules`, `compliance.standards` |
| `'auth'` | 로그인한 사용자(분석 토큰 불가) | `workspace.load/save`, `security.me`, `tools.status`, `profile.compare`, `ai.get`, `schedule.list`, `notify.subscribe` |
| `['scan', 'project']` | 그 프로젝트의 분석 실행 | `project.scan`, `sca.scan`, `pr.analyze`, `pr.decorate`, `external.import`, `tests.import` |
| `['user', 'project']` | 그 프로젝트 보기 | `report.*`, `compliance.*`, `misra.plan`, `snapshot.*`, `metrics.his`, `arch.graph`, `issue.ticket` |
| `['codeviewer', 'project']` | 소스 보기 | `project.file`, `issue.aiFix` |
| `['issueadmin', 'project']` | 이슈 관리 | `issue.aiFixApply` |
| `['admin', 'project']` | 프로젝트 관리 | `project.remove`, `misra.savePlan`, `db.export` |
| `['admin', 'global']` | 전역 관리(표에 없는 메서드의 기본값) | `security.*`, `webhook.*`, `integrations.*`, `ai.save`, `db.*`, `tools.install`, `schedule.save`, `audit.list` |

특별 규칙: `issue.update` 에서 상태 · 해결 · 분류를 바꾸면 `issueadmin`(핫스팟 상태는 `securityhotspotadmin`), 담당 · 의견은 `user`. `issue.review` 의 승인 · 반려는 `issueadmin`. 새 프로젝트를 만드는 `project.scan` 은 `provisioning` + `scan`. 분석 토큰(`mcp_` 프로젝트, `mca_` 전역)은 `scan` 만 합니다. 자기 계정의 토큰 · 비밀번호(`generateToken`, `revokeToken`, `listTokens`, `setPassword`)는 누구나 바꿉니다. `workspace.load` 는 볼 수 없는 프로젝트와 비밀 값을 빼고(`filterWorkspace`), `workspace.save` 는 구역마다 권한을 확인합니다(`profiles`/`customRules` → `profileadmin`, `gates` → `gateadmin`, 그 밖 → `admin`; 테마 · 언어 같은 개인 설정은 자유). 분석 데이터는 클라이언트에서 받지 않습니다.

## 2. 분석 엔진

### 분석 흐름 (`core/analyze.js`)

`project.scan` → `analyzePath(root, options)` → `analyzeSources(files, options)`:

1. **파일 모으기** — `walk` 가 `node_modules` · `.git` · `dist` · `build` · `target` · `vendor` · `.mcc` 등을 건너뛰고, 제외 패턴(glob)과 언어 감지(`languages.js`, 38종)를 거쳐 최대 `maxFiles`(기본 8000)개, 파일당 800 KB 까지 읽습니다. 커버리지 보고서도 읽습니다(`coverage.js`).
2. **파일별 처리** — `metrics.structuralIssues` 가 줄을 코드/주석으로 나누고 크기 · 복잡도 · 구조 이슈를 냅니다. 줄 해시(공백 정규화 MD5 앞 6자)를 남기고, 새 코드 줄을 정합니다(아래 4절). 이어서 줄 규칙(`rules.js` + `rules-extra`), 사용자 정규식 규칙, 정밀 결함 분석의 줄 경로 체커(`defectAnalysis.pathDefects`)를 돌립니다. `NOMCC`, `noqa`, `nolint`, `mcc-ignore`, `cov-ignore`, `parasoft-suppress`, `mcc-ignore` 가 있는 줄은 건너뜁니다.
3. **계약 엔진** — `runEngines` 가 `engines.js` 의 엔진을 모든 파일에 한 번씩 돌립니다(파일을 건너는 호출 · include 추적). 엔진 하나가 예외를 던지면 그 엔진만 빠지고 `warnings` 에 남습니다. 규칙 언어가 파일 언어와 다르면 버립니다(`.h` 는 C/C++ 모두 허용).
4. **후처리** — 중복(`duplication.js`, 정규화한 8줄 창), 정밀 결함 분석 장식(`decorateIssue`: CID · 체커 · 영향 · 컴포넌트), 같은 줄의 정밀 엔진 결과가 있으면 줄 기반 `defect:*` 를 지움, `// mcc[CHECKER]` 주석 억제, 저장된 이슈 상태(상태 · 해결 · 담당 · 의견 · 분류 · 태그 · 예외 신청)를 키로 다시 붙임.
5. **측정값 · 등급 · 게이트** — `ratings.js`(A–E), 새 코드 측정값, `qualitygate.evaluateGate`, `defectAnalysis.summarizeDefects`(미해결 · 새로 발견 · 기각 · 수정됨 · 정책).

이슈 키는 `sha1(규칙 | 파일 | 정규화한 줄 내용 [| 엔진 줄·메시지])` 앞 16자라서 줄 번호가 바뀌어도 같은 이슈로 이어집니다. `listRules()` 는 줄 규칙 · 구조 규칙 · 정밀 결함 분석 체커 · 엔진 카탈로그를 합치고, CWE 로 행정안전부 2021 항목 번호(`standards.mois2021`)를 붙입니다.

`scan` 은 분석 뒤에 브랜치 상태(`latest`, 최근 30개 `history`, `keys`, `cids`, `lineHashes`, 스냅샷 번호)를 저장하고, 작업(`ws.tasks`, 최근 100개)을 남기고, 정리 · `afterScan` · 알림 · 웹훅 · DB 자동 내보내기를 차례로 합니다. `commit: false`(데스크톱 분석)이면 브랜치를 바꾸지 않고 `project.desktop` 에만 둡니다. `project.submit` 은 CI 가 올린 파일들을 서버의 `<데이터 폴더>/sources/<프로젝트 키>/` 에 풀어 같은 `scan` 으로 분석합니다.

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

줄 규칙 `core/rules.js` · `core/rules-extra/`, 구조 규칙 `core/metrics.js`, 줄 기반 정밀 결함 분석 체커 `core/defects.js`(`defect:*`)는 엔진 표 밖에서 직접 돕니다. C/C++ 공용 파스는 `core/cfront.js` → `core/cfamily`([AST.md](core/cfamily/AST.md)).

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
| `export/` | 의존성 없는 Word(.docx) · Excel(.xlsx) · PDF(TTF 글꼴 내장) · ZIP. `report.export`, `report.regulatory`, `scan.mjs --out *.pdf` |
| `platform/scm.js` | `git` 호출(변경 줄, blame, 태그, 브랜치). 실패하면 빈 값 |
| `platform/pullrequest.js` | 바뀐 줄 분석, PR 게이트, GitHub · GitLab · Azure DevOps · Bitbucket 장식 본문 |
| `platform/webhooks.js` | 호환 형식 페이로드, `X-MCC-Webhook-HMAC-SHA256` 서명, 전송 기록 |
| `platform/users.js` | 사용자 · 그룹 · 권한 · 템플릿, scrypt 비밀번호, 토큰(SHA-256 해시로 저장) |
| `platform/external.js` | 외부 도구 결과 · 테스트 보고서 가져오기 |
| `platform/history.js` | 스냅샷 비교(CID), 결함 수명, 활동 이벤트, 추세, 이슈 나이 |
| `platform/measures.js` | 조건 · 분기 커버리지, 테스트 지표, 컴포넌트 트리, 고칠 노력 |
| `projectfile.js` | 프로젝트 파일 `*.mccp`(JSON `format: "mycodechecker-project"`, `version`, `name`, `key`, `source` — 파일 기준 상대 경로, `settings`: `mainBranch` · `exclusions` · `includeDirs` · `defines` · `coverageReports` · `arch` · `newCode` · `profiles` · `gateId` · `policyId` · `his` · `tags` · `description`) 읽기 · 쓰기. 분석 결과는 작업 공간에 남습니다. 데스크톱은 `tauri.conf.json` 의 `fileAssociations` 로 `.mccp` 를 앱에 연결합니다 |
| `platform/tools.js` | 필요한 소프트웨어(Git, C/C++ 컴파일러) 찾기와 패키지 관리자 설치(`tools.install` 을 부를 때만) |

### 연동 (`core/integrate.js` + `core/integrations/`)

`ws.settings.integrations` 에 SMTP · LDAP · 트래커(Jira, Redmine, GitHub, GitLab) · ALM(GitHub, GitLab, Azure DevOps, Bitbucket) · 구독 · 기본 URL 을 둡니다. 비밀 값은 화면에 `••••••••` 로만 보내고, 그대로 돌아오면 저장된 값을 지킵니다. `notify(ws, event, ctx)` 는 구독자에게 메일을 보내고 실패해도 분석을 멈추지 않습니다. 이벤트: `gate-changed`, `issues-assigned`, `defect-high-impact`, `exception-pending/approved/rejected`, `scan-failed`.

### 예약 (`core/scheduler.js`)

`{ id, name, kind: 'scan'|'dast', projectId|path, branch, cron, enabled }`. 5필드 cron(`@daily` 같은 별칭 포함)을 풀고, 서버 프로세스(`scheduler: true` — 웹 호스트와 데스크톱 사이드카)가 30초마다 확인해 때가 된 것을 하나씩 실행합니다. 결과는 `lastRun`, `lastStatus`(SUCCESS · GATE_FAILED · FAILED), `nextRun` 에 남습니다.

### 호환 API (`core/compat-api.js`)

`api.call` 을 거치므로 권한이 그대로 적용됩니다. 경로: `authentication/validate`, `server/version`, `system/status`, `system/health`, `projects/search`, `project_branches/list`, `components/show`, `issues/search`, `issues/assign`, `issues/add_comment`, `issues/do_transition`(confirm · unconfirm · reopen · resolve · falsepositive · wontfix · accept), `issues/set_tags`, `hotspots/search`, `measures/component`, `qualitygates/list`, `qualitygates/project_status`, `qualityprofiles/search`, `rules/search`, `rules/show`, `ce/activity`. 쪽 나누기는 `p` · `ps`(최대 500).

### 정밀 결함 분석 명령줄 (`core/defect-cli.js`, `scripts/defect-cli.mjs`)

중간 폴더(`--dir`, 기본 `<path>/.mcc`)에 캡처와 마지막 분석을 둡니다. `configure` → `build`(컴파일러 shim 또는 `compile_commands.json` 에서 포함 경로 · 매크로 · 표준) 또는 `capture`(빌드 없이) → `analyze`(체커 켜고 끄기, aggressiveness, 코딩 표준) → `format-errors`(JSON v8 · HTML · 텍스트) → `commit-defects`(작업 공간의 스트림에 스냅샷, 정책 실패 시 종료 코드 1). `run-desktop`, `make-library`(C 스텁 → 함수 모델), `import-results`, `manage-im`(결함 · 스트림 · 스냅샷 보기, 분류 바꾸기).

### AI 코드 수정 (`core/aifix.js`)

`ws.settings.ai = { enabled, provider: 'anthropic'|'openai-compatible'|'ollama', model, baseUrl, apiKey, effort, maxTokens, contextLines, timeoutMs, language }`. `issue.aiFix` 는 이슈 줄 앞뒤 `contextLines` 줄(번호 붙임) · 규칙 설명 · 데이터 흐름을 보내 `{ startLine, endLine, replacement, explanation, confidence }` JSON 을 받습니다. Anthropic 은 공식 SDK(기본 모델 `claude-opus-5-5`, 키가 없으면 `ANTHROPIC_API_KEY` 나 `ant auth login` 프로필), OpenAI 호환은 `/chat/completions`(Azure 는 `api-key` 머리글), Ollama 는 `/api/chat`(기본 `http://127.0.0.1:11434`). 제안에는 원래 파일의 해시가 붙고, `issue.aiFixApply` 는 파일이 그 뒤로 바뀌었으면 거절합니다. 프로젝트 밖 경로(`..`)는 받지 않습니다. 기능은 기본 꺼짐이며, 원격 공급자를 고르면 코드 조각이 그 서버로 갑니다.

### DB 내보내기 (`core/dbsink.js`)

`ws.settings.database = { enabled, kind: 'sqlite'|'postgres'|'mysql'|'mssql', file, host, port, database, user, password, ssl, schema: 'mcc', autoExport, includeIssues }`. SQLite 는 Node 내장 `node:sqlite`(기본 파일 `<데이터 폴더>/mycodechecker.db`), 나머지는 `pg` · `mysql2` · `mssql`. 표는 `<접두사>_projects`, `_analyses`, `_issues`, `_measures` 이고 없으면 만듭니다. 같은 분석을 다시 내보내면 그 행을 바꿔 써서 몇 번 해도 같습니다. 자동 내보내기 실패는 분석을 멈추지 않고 작업 경고(`DB: …`)가 됩니다.

## 4. 작업 공간 저장 (`core/store.js`)

모든 상태는 JSON 파일 하나 `workspace.json` 입니다. 위치는 `--config`, `MCC_USER_DATA`, 그다음 OS 기본값(Windows `%APPDATA%\MyCodeChecker`, macOS `~/Library/Application Support/MyCodeChecker`, Linux `$XDG_CONFIG_HOME/MyCodeChecker`). `load()` 는 파일이 없거나 깨졌으면 `freshWorkspace()` 를 주고, 저장된 값 위에 새 기본값을 합칩니다(설정 · 정밀 결함 분석 구역).

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
