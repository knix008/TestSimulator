# MyGit 구조

이 폴더에는 두 개의 Git 클라이언트가 있습니다. 화면에서 하는 일은 같고, 저장소를 여는 방식만 다릅니다.

| 앱 | UI | Git 접근 |
|----|----|----------|
| MyGitJS | React. 브라우저 또는 Electron | 이 컴퓨터의 `git` 실행 파일 |
| MyGit Win V10 | WinForms | LibGit2Sharp |

사용 방법은 [UsersGuide.md](UsersGuide.md), 빌드 방법은 [README.md](README.md)를 참고하세요.

## MyGitJS

브라우저, Windows, macOS, Linux가 같은 React 화면을 씁니다. Git 명령은 그 컴퓨터에서만 동작하는 Node API가 실행합니다.

```
브라우저 또는 Electron
        │  http://127.0.0.1
        ▼
React UI (Vite)
        │  /api
        ▼
Express API  ──spawn──►  git
        │
        ├── settings.json  (OS 사용자 폴더)
        └── remote-cache   (Browse Remote bare clone)
```

API와 개발 서버는 `127.0.0.1`에만 바인딩됩니다. 다른 컴퓨터에서 이 API로 저장소를 열 수 없습니다.

### 실행 형태

명령은 프로젝트 루트에서 실행합니다.

| 명령 | 화면 | API |
|------|------|-----|
| `npm run dev:web` | Vite http://127.0.0.1:5173 | http://127.0.0.1:4730. Vite가 `/api`를 프록시합니다. |
| `npm run dev` | Electron이 5173을 엽니다. 폴더 선택 대화상자를 쓸 수 있습니다. | 같은 4730 |
| `npm run start:web` | `dist`를 API가 함께 제공합니다. | `PORT` 또는 4730 |
| `npm run start:desktop` / `npm run dist` | Electron이 패키지 안의 `dist`를 엽니다. | 빈 포트의 로컬 서버 |

웹에서는 경로를 입력합니다. Electron은 `preload.cjs`의 `pickDirectory`로 운영체제 폴더 대화상자를 엽니다. `contextIsolation`이 켜져 있고 `nodeIntegration`은 꺼져 있습니다.

### 소스

| 경로 | 역할 |
|------|------|
| `src/App.tsx` | 메뉴, 도구 모음, Files / Repository, 히스토리, diff, 대화상자 |
| `src/CommitHistory.tsx` | 커밋 목록과 그래프 렌더링 |
| `src/DiffView.tsx` | unified diff |
| `src/graph.ts` | WinForms `CommitGraphBuilder`와 같은 레인 계산. 경로 필터는 평탄한 그래프 |
| `src/icons.tsx` | 메뉴, 도구 모음, 컨텍스트 메뉴용 SVG |
| `src/i18n.ts` | 한국어(기본)와 English. Git 명령 이름은 영어 |
| `src/api.ts` | `/api` 호출. 실패 시 메서드, URL, HTTP 상태, 코드, 서버 상세를 묶습니다. |
| `core/themes.ts` | Light 20, Dark 20. CSS 변수를 `documentElement`에 적용 |
| `core/gitApp.ts` | open, clone, browse, status, log, diff, commit, fetch, pull, push, stash, export |
| `core/gitProcess.ts` | `git` 프로세스. `GIT_TERMINAL_PROMPT=0` |
| `core/status.ts` | porcelain 배지 U D R T ! ± X P |
| `core/settings.ts` | 설정, 최근 목록, AES-256-GCM 토큰 |
| `core/fsBrowse.ts` | 드라이브 목록과 한 단계 폴더 목록 |
| `core/errors.ts` | `ApiError`. URL에 붙은 자격 증명을 `https://***@`로 가림 |
| `server/index.ts` | Express 라우트. 오류 JSON은 `{ error, code, detail }` |
| `server/cli.ts` | 개발/웹 실행 진입점 |
| `electron/main.cjs`, `preload.cjs` | 창과 폴더 대화상자 |
| `test/run.ts`, `test/cases.ts`, `test/report.ts` | 기능 테스트와 색이 있는 Summary |

### 요청이 처리되는 방식

1. 화면이 `src/api.ts`로 `/api/...`를 호출합니다.
2. `server/index.ts`가 인자만 검사하고 `GitApp`에 넘깁니다.
3. `GitApp`은 `git`을 실행하고, 실패하면 `ApiError`를 던집니다. 인증이 필요하면 `AUTH_REQUIRED`이고, 짧은 메시지와 함께 git 출력이 `detail`에 남습니다.
4. 저장소가 아니면 `NOT_A_REPO`입니다. Files의 **폴더 열기**는 이 경우 그 폴더를 파일 목록으로 보여 줍니다. 드라이브 버튼은 저장소를 열지 않고 그 드라이브의 폴더만 나열합니다.
5. 성공한 open / clone / browse는 마지막 세션과 최근 목록을 설정 파일에 기록합니다.

Clone과 Browse Remote는 자격 증명을 URL에 남겨 두지 않습니다. clone 직후 `git remote set-url origin`으로 원래 URL을 다시 넣습니다.

### 설정과 캐시

`SettingsStore`는 OS 사용자 폴더의 `MyGitJS/settings.json`을 사용합니다. 테스트는 `MYGIT_SETTINGS_DIR`와 `MYGIT_CACHE_DIR`로 이 경로를 임시 폴더에 가둡니다.

Browse Remote는 URL 해시 이름의 bare clone을 캐시에 두고, 같은 URL을 다시 열면 `git fetch`만 합니다. 이 보기는 `remoteView`라서 checkout, commit, push가 거부됩니다.

작업 트리는 `fs.watch`로 감시합니다. 변경이 있으면 약 400ms 뒤에 세대 번호가 올라가고, 화면은 `/api/tick`으로 그 번호를 확인해 파일 목록과 배지를 다시 읽습니다.

### 테마와 언어

테마 id는 `light-classic`, `dark-midnight`처럼 `모드-이름`입니다. 설정에 없는 id는 읽을 때 `light-classic`으로 돌아갑니다. `PUT /api/settings`에 잘못된 `theme`이 오면 거절하지 않고 현재 테마를 유지합니다.

언어는 `ko` 또는 `en`입니다. 메뉴 루트, 항목, 최근 저장소, 컨텍스트 메뉴, 도구 모음은 아이콘과 함께 표시됩니다. 테마, 언어, 정보는 도구 모음 오른쪽에 있습니다.

### 왼쪽 패널

위가 Files, 아래가 Repository입니다. Files 제목 옆에는 시스템 드라이브와 **폴더 열기**가 있습니다. 폴더를 탐색하는 동안 저장소가 열려 있으면 Files 제목을 눌러 저장소 파일로 돌아갑니다.

## MyGit Win V10

Windows 데스크톱 한 프로세스 안에서 WinForms가 LibGit2Sharp를 호출합니다.

| 경로 | 역할 |
|------|------|
| `MainForm.cs` | 메인 창 |
| `Controls/CommitGraphView.cs` | 커밋 그래프 |
| `Controls/RepositoryFileListView.cs` | Files 트리 |
| `Services/GitRepositoryService.cs` | 저장소 열기, clone |
| `Services/RemoteRepositoryService.cs` | Browse Remote 캐시 |
| `Services/GitWorkflowService.cs` | stage, commit, push |
| `Services/CommitGraphBuilder.cs` | 레인 계산. MyGitJS `src/graph.ts`가 이 규칙을 따릅니다. |
| `Services/PathGitStatus.cs` | 상태 배지 |
| `Services/AppSettingsStore.cs` | `%AppData%\MyGitWinV10\settings.json`. PAT는 DPAPI |
| `Services/Localization.cs` | 한국어 / English |
| `Dialogs/` | clone, browse, commit, 요약, 환경설정, 정보 |
| `installer/` | WiX MSI |

WinForms의 왼쪽은 Repository가 위, Files가 아래입니다. 요약은 PDF, Word, Markdown과 차트로 내보냅니다.

## 테스트가 건드리지 않는 것

`npm test`를 프로젝트 루트에서 실행하면 임시 폴더에 저장소를 만들고 로컬 `file://` bare 저장소로 clone, fetch, pull, push, browse를 확인합니다. 사용자 설정 파일과 이 저장소의 Git 이력은 사용하지 않습니다. 파일을 운영체제 기본 앱으로 여는 API는 탐색기가 뜨지 않도록 호출하지 않습니다.
