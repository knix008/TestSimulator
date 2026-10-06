# MyDiff 아키텍처

MyDiff는 WinForms로 만들어진 `MyDiffWinV10`을 JavaScript/TypeScript로 다시 쓴 멀티 OS 판입니다.
같은 코드베이스가 **Electron 데스크톱 앱**과 **브라우저에서 접속하는 웹 앱** 두 가지로 동작합니다.

핵심 원칙은 하나입니다. **diff 로직은 플랫폼을 모른다.** `core/`는 Electron도 브라우저도 모르는
순수 TypeScript이고, 플랫폼에 의존하는 코드는 `electron/`과 `server/`에만 있습니다.

---

## 1. 전체 구조

```
                    ┌───────────────────────────────┐
                    │   src/  (React UI, 브라우저)    │
                    │   화면·상호작용·테마·i18n        │
                    └───────────────┬───────────────┘
                                    │  fetch (JSON)
                                    │  src/api.ts
                    ┌───────────────▼───────────────┐
                    │   server/  (Express, Node)     │
                    │   /api/* 엔드포인트             │
                    └───────────────┬───────────────┘
                                    │  직접 호출
                    ┌───────────────▼───────────────┐
                    │   core/  (플랫폼 무관 TypeScript) │
                    │   diff 계산·git·설정·파일 탐색    │
                    └───────────────────────────────┘

   electron/  ─ 창 생성, 네이티브 대화상자, 클립보드 (위 3개를 감싸는 껍데기)
```

UI는 **상태를 거의 들고 있지 않습니다.** 비교 결과·설정·git 상태는 모두 서버 쪽 `DiffApp` 인스턴스가
가지고 있고, UI는 `/api/bootstrap`으로 현재 상태를 받아 그립니다. 그래서 같은 화면이 Electron 창
안에서도, 브라우저 탭에서도 똑같이 동작합니다.

---

## 2. 디렉터리별 역할

### `core/` — 플랫폼 무관 로직

| 파일 | 역할 |
| --- | --- |
| `lineDiff.ts` | 2-way 줄 단위 diff. 양쪽에서 일치하는 줄을 앵커로 잡아 정렬한 뒤, 앵커 사이 구간을 삭제 / 추가 / 변경으로 분류합니다. 변경된 줄 안의 단어 단위 하이라이트도 여기서 계산합니다. |
| `session.ts` | `DiffSession` — 한 번의 비교 결과. 좌/우 원본, 행 목록, 통계, overview 바에 쓸 버킷을 들고 있고, UI 요청에 맞춰 `rows(start, count)`로 잘라 줍니다. |
| `binary.ts` | 바이너리 판별과 16진 덤프. 텍스트가 아니면 자동으로 hex 뷰로 전환됩니다. |
| `dirCompare.ts` | 디렉터리 2개를 재귀 비교해 `same / different / leftOnly / rightOnly`로 분류. `DEFAULT_EXCLUDES`(`.git`, `node_modules`, …)로 걸러냅니다. |
| `git.ts` | `git` 실행 파일을 직접 호출하는 얇은 래퍼. 변경 목록, 커밋 로그, blob 내용, `difftool` 등록/해제를 담당합니다. |
| `settings.ts` | `settings.json` 읽기·검증·쓰기. 잘못된 값은 조용히 기본값으로 떨어집니다. |
| `themes.ts` | 라이트/다크 테마 토큰. CSS 변수와 Electron 창 배경색이 같은 정의에서 나옵니다. |
| `fsBrowse.ts` | 내장 파일 선택기용 디렉터리 목록·드라이브 목록. 브라우저 모드에서 네이티브 대화상자 없이 경로를 고를 때 씁니다. |
| `errors.ts` | `ApiError` — HTTP 상태 코드와 복사 가능한 상세 블록을 함께 들고 다니는 오류. 경로 등 민감한 문자열은 `redact()`로 지웁니다. |
| `diffApp.ts` | 위 모듈들을 묶는 **애플리케이션 상태**. 현재 세션, 설정, 열린 저장소, 디렉터리 비교 결과를 보관하고 `openFiles` / `compareDirectories` / `openChange` 같은 동작을 노출합니다. |

`core/`는 `node:fs`, `node:path`, `node:child_process`만 씁니다. Electron API도, DOM도 참조하지 않습니다.

### `server/` — HTTP 경계

`server/index.ts`의 `startServer()`가 Express 앱을 만들고 `DiffApp` 인스턴스 하나를 감쌉니다.
엔드포인트는 전부 얇습니다 — 입력을 문자열/숫자로 정규화하고, `DiffApp` 메서드를 부르고, JSON으로 돌려줍니다.

| 그룹 | 엔드포인트 |
| --- | --- |
| 부팅 | `GET /api/bootstrap` — 설정·세션·저장소·git 사용 가능 여부를 한 번에 |
| 파일 비교 | `POST /api/files/open`, `POST /api/reload`, `GET /api/session/rows`, `GET /api/session/text` |
| 디렉터리 비교 | `POST /api/dir/compare`, `POST /api/dir/open` |
| git | `POST /api/git/open`, `GET /api/git/changes`, `GET /api/git/log`, `POST /api/git/open-change`, `GET /api/git/unified`, `GET`·`POST /api/git/difftool` |
| 파일 탐색 | `GET /api/fs`, `GET /api/drives` |
| 설정 | `GET`·`PUT /api/settings`, `POST /api/settings/reset` |

행 데이터를 `start`/`count`로 잘라 보내기 때문에, 수십만 줄짜리 파일도 화면에 보이는 만큼만 오갑니다.

오류는 마지막 미들웨어가 `ApiError`로 변환해 `{ error, code, detail }` 형태로 내보내고,
UI의 `ErrorDialog`가 그대로 복사 가능한 형태로 보여 줍니다.

`server/cli.ts`는 같은 서버를 독립 실행하는 진입점입니다(웹 모드, `npm run serve`).

### `src/` — React UI

- `App.tsx` — 메뉴·툴바·상태바와 탭(파일 / 디렉터리 / git) 전환, 전역 상태 보관
- `DiffPanes.tsx` — 좌우 패널. 가상 스크롤로 보이는 행만 그리고, 양쪽 스크롤을 동기화합니다
- `OverviewBar.tsx` — 스크롤바 옆 미니맵. 파일 전체에서 차이가 어디 있는지 보여 주고 클릭하면 이동
- `DirectoryPanel.tsx` / `GitPanel.tsx` / `UnifiedDiffView.tsx` — 디렉터리 비교, git 변경 목록, unified diff 텍스트
- `PathPicker.tsx` — Electron에서는 네이티브 대화상자, 브라우저에서는 `/api/fs` 기반 내장 탐색기
- `Preferences.tsx` — 언어·테마·글꼴 크기·줄바꿈·제외 폴더 등 설정 화면
- `SplitPane.tsx`, `ErrorDialog.tsx`, `icons.tsx`(인라인 SVG), `i18n.ts`(한국어/영어 전체 문자열)
- `api.ts` — 위 엔드포인트를 감싼 타입 안전한 클라이언트. UI 코드에 `fetch`가 흩어지지 않게 합니다

### `electron/` — 데스크톱 껍데기

- `main.cjs` — 창 생성, 아이콘·배경색 결정, 프로덕션에서 `dist-server/index.cjs`를 **in-process로** 띄우고
  무작위 포트로 창을 연결합니다. 개발 모드에서는 Vite 개발 서버(`MYDIFF_UI`)를 그대로 가리킵니다.
- `preload.cjs` — `contextIsolation` 상태에서 `window.mydiff`로 네이티브 기능 4개만 노출합니다
  (파일/폴더 선택, 클립보드 복사, 외부 열기). UI는 이 객체가 없으면 자동으로 웹 모드로 동작합니다.
- `theme-bg.cjs` — 첫 페인트가 흰색으로 번쩍이지 않도록 `core/themes.ts`와 같은 배경색을 들고 있습니다.

### 그 외

| 경로 | 내용 |
| --- | --- |
| `scripts/` | 빌드 보조 스크립트 (아이콘 생성, 서버 번들, 개발 실행, 프리뷰, postinstall) |
| `build/` | 설치 프로그램 리소스. `installer.nsh`가 Windows 설치 동작을 정의하고, 아이콘 파일은 빌드 때 생성됩니다 |
| `Samples/` | 비교 동작을 확인할 때 쓰는 텍스트/바이너리 샘플 쌍 |
| `Assets/` | WinForms 판에서 이어받은 원본 아이콘 |

---

## 3. 실행 모드

| 모드 | 명령 | UI | API |
| --- | --- | --- | --- |
| 데스크톱 개발 | `npm start` | Vite 개발 서버 (127.0.0.1:5174) | `tsx server/cli.ts` (127.0.0.1:4760) |
| 웹 개발 | `npm run dev:web` | 같은 Vite 서버를 브라우저에서 | 같음 |
| 데스크톱 프로덕션 | 설치된 앱 / `npm run preview` | `dist/` 정적 파일 | `dist-server/index.cjs`를 Electron 프로세스 안에서 |
| 웹 프로덕션 | `npm run build && npm run serve` | `dist/` | `dist-server/cli.mjs` |

개발 모드는 전부 소스에서 바로 돌기 때문에, 다시 띄우면 항상 최신 수정이 반영됩니다.

### git difftool로 호출될 때

`mydiff LEFT RIGHT` 형태로 인자 2개를 받으면 그 쌍을 바로 엽니다.
Electron은 `pendingPair()`로 `process.argv`에서 읽어 서버에 넘기고, 서버는 첫 `/api/bootstrap`에서
그 쌍을 소비합니다. 등록/해제는 UI의 git 탭에서 `git config --global difftool.mydiff.cmd`를 씁니다.

### 설정 파일 위치

| OS | 경로 |
| --- | --- |
| Windows | `%APPDATA%\MyDiffJS\settings.json` |
| macOS | `~/Library/Application Support/MyDiffJS/settings.json` |
| Linux | `$XDG_CONFIG_HOME/MyDiffJS/settings.json` (기본 `~/.config`) |

`MYDIFF_SETTINGS_DIR`로 덮어쓸 수 있습니다.

---

## 4. 빌드 파이프라인

```
npm run build
 ├─ scripts/generate-icons.mjs   → build/icon.ico, build/icon.png(1024), build/icons/*.png
 ├─ vite build                   → dist/            (React UI 정적 파일)
 └─ scripts/bundle-server.mjs    → dist-server/index.cjs  (Electron이 로드)
                                   dist-server/cli.mjs    (독립 웹 서버)

npm run build:win | build:mac | build:linux | build:all
 └─ electron-builder (electron-builder.yml)  → release/
```

`scripts/bundle-server.mjs`는 esbuild로 `server/` + `core/` + `express`를 **한 파일로 묶습니다.**
덕분에 설치본에는 `node_modules`가 들어가지 않고, 패키징 대상은 `dist/`, `dist-server/`, `electron/` 셋뿐입니다.
(`core/`와 `server/`는 TypeScript 소스에 ESM 규칙대로 `.js` 확장자를 붙여 import 하므로,
번들러에 `.js → .ts` 해석 플러그인이 하나 붙어 있습니다.)

아이콘은 `scripts/generate-icons.mjs`가 의존성 없이 직접 그립니다. 거리 함수(SDF)로 도형을 그리고
PNG/ICO를 손으로 인코딩하기 때문에, 네이티브 이미지 라이브러리나 .NET 없이 모든 OS에서 같은 결과가 나옵니다.

### 산출물

| OS | 형식 |
| --- | --- |
| Windows | NSIS 설치 파일 (x64, arm64), 포터블 exe (x64) |
| macOS | dmg, zip (x64, arm64) |
| Linux | AppImage, deb, rpm, tar.gz |

크로스 빌드 제약은 일반적인 Electron 규칙을 그대로 따릅니다. macOS 타깃은 macOS에서,
Linux deb/rpm은 Linux(또는 Docker)에서 만드는 것이 안전합니다.

### Windows 설치 동작 (`build/installer.nsh`)

WinForms 판의 WiX 설치 프로그램이 하던 두 가지 규칙을 NSIS로 옮긴 것입니다.

1. **기존 설치본은 완전히 제거한 뒤 새로 설치합니다.** 설치 시작 시 레지스트리의 제거 목록에서
   같은 `DisplayName`을 찾아 이전 제거 프로그램을 조용히 실행하고, 남은 설치 폴더까지 삭제합니다.
2. **사용자 데이터는 묻지 않고 지우지 않습니다.** 설정이 남아 있으면 설치 때 한 번, 제거 때 한 번
   삭제 여부를 물어봅니다. 업그레이드처럼 조용히(`/S`) 도는 경우에는 묻지도, 지우지도 않습니다.

삭제 대상은 `%APPDATA%\MyDiffJS`(설정)와 `%APPDATA%\MyDiff`(Electron 프로필)입니다.
`git config`에 등록한 difftool 항목은 사용자의 git 설정이므로 설치 프로그램이 건드리지 않습니다 —
필요하면 앱의 git 탭에서 해제하세요.

---

## 5. WinForms 판과의 차이

| | MyDiffWinV10 (WinForms) | MyDiffMultiOSV10 |
| --- | --- | --- |
| UI | WinForms 컨트롤 | React + CSS 변수 테마 |
| 플랫폼 | Windows 전용 | Windows / macOS / Linux + 브라우저 |
| diff 로직 | `Core/` C# 클래스 | `core/` TypeScript (동일한 알고리즘) |
| 설정 | `%APPDATA%\MyDiffWinV10` | `%APPDATA%\MyDiffJS` 외 OS별 표준 경로 |
| 설치 | WiX MSI | electron-builder (NSIS / dmg / AppImage·deb·rpm) |
| 아이콘 생성 | `Assets/GenerateIcon.cs` (.NET, System.Drawing) | `scripts/generate-icons.mjs` (의존성 없음) |

기능 범위 — 좌우 2-way diff, 단어 단위 하이라이트, overview 바, 디렉터리 비교, git 연동,
바이너리 hex 비교, 한국어/영어 전환, difftool 등록 — 는 그대로 유지했습니다.
MyDiff는 **읽기 전용 뷰어**이며 병합 도구가 아니라는 점도 그대로입니다.
