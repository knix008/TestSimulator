# MyCodeChecker

내 컴퓨터에서 돌아가는 **코드 품질·보안 작업대**입니다. 코드 품질 관리, 정밀 결함 분석, 보안 약점 점검·규정 준수를 한 프로그램에 모았습니다. 웹과 Windows · macOS · Linux 에서 같은 화면으로 동작합니다 — **Tauri 2 + React** 화면, **Node.js 분석 코어**(`core/`). 설치본에는 Node.js 와 분석 엔진이 함께 들어 있어 따로 설치할 것이 없습니다. 분석은 모두 로컬에서 하며, 소스 코드는 사용자가 켠 기능(AI 코드 수정, OSV 온라인 확인)에서만 밖으로 나갑니다.

- 규칙 **4161개**, 언어 **38종**, 테스트 7600개 이상 · 한국어 / English · 테마 40종(다크 20 · 라이트 20) + 사용자 정의
- 사용법: [사용 설명서](UsersGuide.md) · [User's guide](UsersGuide.en.md) · 구조: [ARCHITECTURE.md](ARCHITECTURE.md) · English: [README.en.md](README.en.md)

## 기능

### 코드 품질

- **규칙** — 버그 · 취약점 · 코드 스멜 · 보안 핫스팟. JavaScript/TypeScript, Python, Java, Kotlin, C#, C/C++, Go, Rust, PHP, Ruby, Swift, Objective-C, Scala, Dart, VB.NET, VB6, COBOL, PL/SQL, ABAP, Apex, RPG, PL/I, JCL, Flex, Groovy, Shell, PowerShell, SQL, HTML, CSS, XML, JSON, YAML, Docker, Terraform, Bicep 등 38종. 줄 규칙 + 언어별 의미 분석기(`sem-js` · `sem-java` · `sem-cs` · `sem-py` · `sem-go` · `sem-php` · `sem-rb`) + 오염(taint) 분석 + IaC(CloudFormation · Kubernetes · Ansible · ARM · Bicep)
- **등급** A–E (신뢰성 · 보안 · 유지보수성 · 보안 검토), 기술 부채, 인지 · 순환 복잡도
- **품질 게이트** — 기본 `Checker way`(새 버그 · 새 취약점 0, 새 코드 커버리지 80 %, 중복 3 % 등), 조건 편집, 프로젝트별 지정, 배지
- **품질 프로파일** — 언어별, 상속(부모 프로파일), 비교, 백업 · 복원, 변경 기록, 사용자 정규식 규칙
- **새 코드** — 이전 분석 · 일수 · 특정 분석 · 이전 버전(git 태그) · SCM 변경 줄(git diff). 줄 해시로 이전 분석과 비교
- **커버리지** — lcov, Cobertura, JaCoCo, Clover, OpenCover, Go cover profile, 호환 일반 형식 · 테스트 보고서(JUnit, 호환 일반)
- **중복**, **브랜치 · 풀 리퀘스트**(바뀐 줄만, GitHub · GitLab · Azure DevOps · Bitbucket 장식), **포트폴리오**(여러 프로젝트 묶음, 출시 가능 판정)
- **외부 이슈 가져오기** — SARIF, 호환 일반, 결함 JSON, cppcheck, clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit, Semgrep
- **IDE** — VS Code · JetBrains · Visual Studio 확장(`ide/`, LSP 서버 `core/lsp`), 서버 연결 모드

### 정밀 결함 분석

- **경로 민감 C/C++ 체커** — 자체 C11/C17 · C++20 프런트엔드(`core/cfamily`)와 추상 해석 엔진(`core/absint`): 널 역참조, 해제 후 사용, 자원 누수, 버퍼 넘침, 0으로 나누기, 초기화 안 된 값, 죽은 코드 등. 이벤트 경로(할당 → 해제 → 사용)를 보여 줍니다
- **CID · 스트림 · 스냅샷** — 결함 커밋마다 스냅샷, CID 로 비교(새로 발견 · 수정됨 · 재발), 결함 수명, 이슈 나이, 추세
- **분류(triage)** — 분류 · 조치 · 심각도 · 소유자 · 외부 참조 · 레거시, `// mcc[CHECKER]` 주석 억제
- **컴포넌트**(경로 패턴 → 소유자), **정책**(기준 스냅샷 이후 새 영향 높음 결함이면 실패), **함수 모델**(allocator · sink · source)
- **데스크톱 분석** — 스트림을 바꾸지 않고 내 변경만 확인 · **정밀 결함 분석 명령줄**(`npm run defects` — build / analyze / commit-defects 흐름)

### 보안 약점 점검 · 규정 준수

- **행정안전부 「소프트웨어 보안약점 진단가이드」(2021) 49개 항목**, **주요정보통신기반시설** 웹 항목, OWASP Top 10 2017/2021, OWASP ASVS 4.0, CWE Top 25 2023/2024, PCI DSS 3.2.1/4.0, DISA STIG, SANS Top 25 보안 보고서
- **예외 승인 흐름** — 오탐 · 수용 처리를 "예외 신청 → 승인/반려"로만 하게 할 수 있음(사유 필수, 본인 승인 허용 여부)
- **코딩 표준** — MISRA C:2012/2023, MISRA C++:2023, CERT C/C++, AUTOSAR C++14, MISRA C:2004 · MISRA C++:2008(레거시). MISRA Compliance:2020 방식 GCS · 재분류 계획 · 편차 기록
- **HIS 메트릭**(주석 밀도, 경로 수, v(G), 호출 깊이 …), **아키텍처**(모듈 의존 그래프, 불안정도, 순환, 레이어 · 금지 의존 규칙)
- **DAST** — 실행 중인 웹 앱 검사(수동 · 능동 안전 탐침, 범위 제한, 인증, OpenAPI)
- **SCA** — 매니페스트 · 잠금 파일 · SBOM, 오프라인 OSV 권고, **도달 가능성**, **코드 조각(snippet) 일치**, **바이너리**(.jar · .whl · .nupkg · .dll …), 라이선스 정책, 의존성 혼동, CycloneDX 1.5 · SPDX 2.3 내보내기
- **보고서** — 경영진 요약, 보안, MISRA, 정밀 결함 분석 무결성 · 보안, 규칙 집합 준수(보안 약점 점검), SBOM — HTML · CSV · **Word · Excel · PDF**, 규제 보고서 ZIP(기준 행안부 2021 · 주요정보통신기반시설 웹과 넣을 보고서를 고름). 데스크톱은 저장 창으로 위치를 고르고 `저장됨: <경로>` 를 알려 줍니다

### 플랫폼

- **사용자 · 그룹 · 권한**(전역 · 프로젝트, 널리 쓰이는 권한 이름), **토큰**(사용자 · 프로젝트 분석 · 전역 분석, 만들 때 CI 명령 예와 `mcc-project.properties` 예를 보여 줌), **LDAP** 로그인
- **안전 장치** — 마지막 활성 관리자는 지우거나 끌 수 없음(LAST_ADMIN), 삭제 · 비활성화 · 토큰 폐기 · 일괄 오탐/수용 · 정리 전에 확인, 로그인 5번 실패 시 그 계정 5분 잠금, 로그인 화면의 언어 선택(로그인 뒤에도 유지). 오류는 화면 언어로 보여 줍니다(NOT_FOUND · CONFLICT · FORBIDDEN … 코드와 함께)
- **SMTP 알림**(게이트 변경, 할당, 영향 높은 결함, 예외 신청 · 승인 · 반려, 분석 실패), **Jira · Redmine · GitHub · GitLab 티켓**, **PR 게시**, **웹훅**(HMAC 서명)
- **예약 분석**(cron, 코드 분석 · 웹 스캔), **감사 로그**, 정리(하우스키핑)
- **호환 Web API**(`/api/issues/search`, `/api/qualitygates/project_status` …) — 호환 API 용 대시보드 · 스크립트가 그대로 읽습니다
- **AI 코드 수정** — 이슈 하나의 수정안을 LLM 에 물어 차이(diff)로 보여 주고, 승인할 때만 적용(적용한 수정은 **되돌리기** 가능). Anthropic Claude(공식 SDK, 기본 모델 `claude-opus-5-5`) · OpenAI 호환 서버 · 로컬 Ollama
- **데이터베이스 내보내기** — 분석 결과를 MySQL · SQLite3 · MariaDB · PostgreSQL · MSSQL 표로(분석마다 백그라운드 또는 직접)
- **필요한 소프트웨어** — Git · C/C++ 컴파일러를 찾고, 없으면 묻고 패키지 관리자(winget · scoop · Homebrew · apt · dnf · pacman · zypper)로 설치

### 작업 환경

- **프로젝트 파일 `.mccp`** — 소스 폴더(상대 경로)와 프로젝트 설정(브랜치 · 제외 · 포함 경로 · 매크로 · 커버리지 · 아키텍처 · 새 코드 · 프로파일 · 게이트)을 담은 JSON. 파일 › 새 프로젝트 · 열기 · 저장 · 최근 프로젝트, 두 번 누르면 앱이 열림(전용 아이콘). 저장하지 않은 변경이 있으면 제목에 ●, 닫을 때 **저장 / 저장 안 함 / 취소**. 이미 등록된 폴더로 새 프로젝트를 만들면 **바꾸기 / 기존 프로젝트 열기 / 취소**, **프로젝트 삭제**는 작업 공간에서만 지움(소스 폴더와 .mccp 는 남음). 이전 버전의 작업 공간 · 프로젝트 파일은 처음 열 때 자동 변환(이슈 처리 상태 유지)
- **편집 › 실행 취소 · 다시 실행**(Ctrl+Z · Ctrl+Y / Ctrl+Shift+Z, 도구 모음 단추의 풍선 도움말에 작업 이름) — 이슈 상태 · 해결 · 담당 · 태그(하나 · 여러 개), 게이트 · 프로파일 · 포트폴리오 · 정책 · 사용자 규칙 편집, 프로젝트 설정, 패널, 시작 화면 배치, AI 코드 수정 적용
- **분석 진행 창** — 1초쯤 넘게 걸리면 단계 · 지금 파일이나 엔진 · % · 지난 시간 · 남은 시간 · **취소**(취소한 분석은 실패가 아닌 CANCELED). 분석하는 동안 바꾼 이슈 처리 · 설정은 그대로 남습니다
- **화면** — 시스템 제목 표시줄 없는 메뉴 막대(테마 · 국기 언어 선택), 아이콘 + 이름 도구 모음, 가운데 **탭**(홈 고정, 닫기 · 끌어 옮기기 · 오른쪽 클릭 메뉴 · 넘치면 < > ⌄), 왼쪽 **탐색** · 오른쪽 **세부 정보** · 아래 **문제 / 분석 로그 / 작업 / 출력** 패널(켜고 끄기 · 아이콘 + 제목 띠로 접기 · 크기 조절). 데스크톱에서는 대화 상자 · 메뉴 · 펼침 목록이 각자의 창으로 열립니다. 목록 보기는 제목 · 필터 · 열 머리글이 고정되고 행만 스크롤됩니다
- **설정 창** — 920×600 고정, 세로 탭 10개(일반 · 테마 · 사용자 정의 테마 · 시작 화면 · 분석 · 새 코드 · AI 코드 수정 · 데이터베이스 · 알림·연동 · 고급), **초기화 / 확인 / 취소**, 테마 · 언어 · 배경은 바로 미리 보고 취소하면 되돌림
- **시작 화면** — 머리 카드(사용 설명서 · 튜토리얼 문서 · 튜토리얼 시작), 안내 띠, 새로 분석 타일, 최근 프로젝트 10개, 배경, 도움말, 샘플·예제. 카드는 ⠿ 로 옮기고 모서리로 크기 조절(아래 카드가 빈틈을 메움), **자동 정렬**. 언어 타일은 분석 뒤 그 언어 이슈만, 표준 타일은 그 표준 화면을 엽니다. 움직이는 배경 20종(섞기 · 속도 · 투명도)
- **튜토리얼 · 사용 설명서 창** — 실제 화면을 움직이는 튜토리얼(첫 시작 안내), 앱 테마를 따르는 사용 설명서 창(한국어 / English)
- **샘플** — `samples/demo`(19개 파일, 14개 언어), `samples/cpp-sensor`(C++ 센서 로거, `cpp-sensor.mccp` + `compile_commands.json`)

## 설치와 실행

같은 JavaScript 코어를 네 가지로 띄웁니다.

| 대상 | 개발 실행 | 설치 파일 / 배포본 |
|---|---|---|
| 웹 | `npm run dev` (5210 부터 빈 포트) | `npm run web` — 빌드 후 `server/server.js` (http://127.0.0.1:5211) |
| Windows | `npm start` (Tauri 창) | `npm run build:win` → NSIS 설치 파일 |
| Linux | `npm start` | `npm run build:linux` → .deb · .AppImage |
| macOS | `npm start` | `npm run build:mac` → .app · .dmg |

필요한 것(개발용): Node.js 22 이상, Rust(Tauri), Windows 는 WebView2. `npm start` · `npm run dev` 는 5210 부터 IPv4 · IPv6 모두 비어 있는 첫 포트를 골라 쓰며, 다른 프로그램을 멈추지 않습니다. 설치 파일은 그 운영체제에서만 만들며(다른 OS 에서 실행하면 멈추고 알려 줌), 만든 파일은 프로젝트 루트에 복사됩니다. Windows 설치 프로그램은 끝에 Git 이 없으면 winget 으로 설치할지 묻습니다.

```bash
npm install
npm run dev          # 브라우저
npm start            # 데스크톱 창
```

여러 사람이 쓰는 서버로 띄우기:

```bash
npm run build
node server/server.js --host 0.0.0.0 --port 5211 [--config <데이터 폴더>] [--no-scheduler]
```

작업 공간은 `%APPDATA%/MyCodeChecker/workspace.json`(macOS `~/Library/Application Support/MyCodeChecker`, Linux `~/.config/MyCodeChecker`, 또는 환경 변수 `MCC_USER_DATA`)에 저장됩니다.

## 빠른 시작

1. 시작 화면에서 **샘플 프로젝트**를 누르면 `samples/demo` 를 분석합니다. C/C++ 는 **파일 › 프로젝트 열기…**로 `samples/cpp-sensor/cpp-sensor.mccp`. 내 코드는 **폴더 열기…**(Ctrl+O) 또는 **새 프로젝트…**(Ctrl+N). 처음이면 **튜토리얼 시작**.
2. **개요**에서 품질 게이트와 등급을 보고, 카드를 눌러 **이슈** 목록으로 갑니다.
3. 이슈를 골라 오른쪽 **세부 정보** 패널에서 이유 · 고치는 법을 읽고 확인 · 수용 · 오탐 처리, 담당 지정, 티켓 만들기, AI 수정 제안을 합니다.
4. **보안 보고서 · MISRA 준수 · 보고서**에서 표준별 결과를 보고 Word · Excel · PDF 로 저장합니다.

## CI 에서 쓰기

```bash
# 로컬 분석, 게이트 실패 시 종료 코드 1
node scripts/scan.mjs --path . --format sarif --out report.sarif
node scripts/scan.mjs --path src --standard misra-c --misra-gate --report misra --out misra.pdf
node scripts/scan.mjs --path . --format cyclonedx --out bom.json
node scripts/scan.mjs --path . --workspace --exclude "**/generated/**"   # 앱의 프로파일 · 게이트 · 이슈 상태로

# 서버로 올려 서버의 프로파일 · 게이트 · 기록으로 분석 (코드 품질 스캐너 흐름)
node scripts/scan.mjs --server https://checker.example.com --token mcu_… --project-key my-app --branch feature/x
```

`--server` 를 주지 않아도 `mcc-project.properties`(없으면 호환 형식의 속성 파일) 의 `mcc.host.url`, `mcc.token`, `mcc.projectKey`, `mcc.projectName`, `mcc.sources`, `mcc.exclusions`, `mcc.branch.name`, `mcc.modules` 를 읽습니다. 토큰은 `--token`, `MCC_TOKEN`(호환 형식의 환경 변수도 읽음) 순으로 찾습니다. 형식: `json | sarif | html | csv | badge | cyclonedx | spdx | spdx-tv`, 보고서: `executive | security | misra | integrity | defect-security | weakness | sbom` (`--out` 확장자가 `.pdf` · `.docx` · `.xlsx` 면 그 형식). 그 밖에 `--coverage`, `--include`, `--define`, `--target lp64|ilp32|llp64`, `--osv`, `--misra-plan`, `--lang ko|en`, `--exclude <glob>`(여러 번, `mcc.exclusions` 와 합침), `--workspace [설정 폴더]`(앱의 품질 프로파일 · 게이트 · 제외 · 이슈 상태를 쓰되 임시 사본에서 돌려 작업 공간은 바꾸지 않음). 데스크톱 앱의 내장 서버는 임의 포트를 쓰므로 CI 에서 올리려면 공유 서버(`npm run web:serve`)가 필요합니다.

정밀 결함 분석 명령(`npm run defects -- <명령>`):

```bash
node scripts/defect-cli.mjs build --path . -- make            # 빌드 캡처 (또는 capture: 빌드 없이)
node scripts/defect-cli.mjs analyze --path . --coding-standard-config misra-c2012
node scripts/defect-cli.mjs format-errors --dir .mcc --html-output out/
node scripts/defect-cli.mjs commit-defects --path . --stream main   # 정책 실패 시 종료 코드 1
node scripts/defect-cli.mjs run-desktop --path .                     # 스트림에 없는 새 결함만
node scripts/defect-cli.mjs manage-im --mode defects --show --status Outstanding
```

그 밖에 `configure`, `make-library`(함수 모델), `import-results`. 전체 옵션은 `node scripts/defect-cli.mjs --help`.

## 테스트 · 문서

```bash
npm test             # node --test + test/reporter.mjs
npm run build:docs   # docs/UsersGuide*.html · Tutorial*.html · README*.html · ARCHITECTURE.html → public/docs/
```

`npm test` 출력은 영어입니다. 파일마다 머리글, 테스트마다 맞춰 정렬한 줄(상태 · 번호 · 이름 · 걸린 시간 — 시간에 따라 색), 끝에 파일별 요약 표와 통과 막대, 실패한 테스트 목록이 나오며 `test/last-report.txt` 에도 남습니다. 앱의 **도움말 › 사용 설명서**는 `build:docs` 로 만든 페이지를 엽니다.

© SHKWON (knix008@naver.com) · MIT
