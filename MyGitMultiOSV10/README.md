# MyGit V1.0.0

Git 클라이언트입니다. 같은 작업 흐름을 두 앱으로 제공합니다.

| 앱 | 경로 | 대상 |
|----|------|------|
| **MyGitJS** | `MyGitJS/` | Web, Windows, macOS, Linux. React 화면과 로컬 Node API가 이 컴퓨터의 `git`을 호출합니다. |
| **MyGit Win V10** | `MyGitWinV10.App/` | Windows 전용 WinForms (.NET 8, LibGit2Sharp). 기존 데스크톱 앱이며 그대로 유지됩니다. |

화면 사용법은 [UsersGuide.md](UsersGuide.md), 구성은 [Architecture.md](Architecture.md)를 참고하세요.

제작자: SHKWON(knix008@naver.com)

## MyGitJS

### 요구 사항

- Node.js 20 이상
- Git이 `PATH`에 있어야 합니다

명령은 이 프로젝트 루트에서 실행합니다. `npm install`은 `MyGitJS` 의존성을 설치합니다.

| 명령 | 동작 |
|------|------|
| `npm run dev:web` | 브라우저용 개발 서버 |
| `npm run dev` | Electron 개발 창 |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 빌드 후 데스크톱 실행 |
| `npm run start:web` | 빌드 후 웹 서버 실행 |
| `npm test` | 기능 테스트 |
| `npm run dist` | 현재 OS용 설치 파일 |

### 개발 실행

```powershell
npm install
npm run dev:web
```

브라우저에서 http://127.0.0.1:5173 을 엽니다. 웹에서는 저장소 경로를 직접 입력합니다. API는 http://127.0.0.1:4730 이며, Vite가 `/api`를 그 주소로 프록시합니다.

폴더 선택 대화상자가 있는 Electron 창:

```powershell
npm run dev
```

### 빌드 후 실행

```powershell
npm run build
npm start
npm run start:web
```

현재 운영체제용 설치 패키지:

```powershell
npm run dist
```

Windows 설치 마법사는 처음에 한국어와 English 중 설치 언어를 고릅니다. 설치 폴더 다음에는 바탕 화면 바로 가기와 시작 메뉴 바로 가기를 각각 만들지 선택할 수 있습니다. 두 항목은 기본적으로 선택되어 있습니다. macOS는 dmg, Linux는 AppImage와 deb입니다. 다른 OS용 패키지는 그 OS에서 같은 명령을 실행합니다. 완성된 설치 파일은 이 프로젝트 루트로 복사됩니다. 중간 산출물은 `MyGitJS/release/`에 남습니다.

### 테스트

```powershell
npm test
```

임시 Git 저장소에서 테마, 아이콘, 상태 배지, 그래프, 설정, 파일 시스템, Git 작업, HTTP API를 확인합니다. 터미널과 `MyGitJS/test-results/index.html`에 항목별 실행시간과 Summary가 색으로 정리됩니다. 테스트는 OS 사용자 설정을 바꾸지 않습니다.

### 설정

| OS | 설정 | Browse Remote 캐시 |
|----|------|--------------------|
| Windows | `%AppData%\MyGitJS\settings.json` | `%LocalAppData%\MyGitJS\remote-cache\` |
| macOS | `~/Library/Application Support/MyGitJS/settings.json` | `~/Library/Caches/MyGitJS/remote-cache/` |
| Linux | `$XDG_CONFIG_HOME/MyGitJS/settings.json` 또는 `~/.config/MyGitJS/settings.json` | `$XDG_CACHE_HOME/MyGitJS/remote-cache/` 또는 `~/.cache/MyGitJS/remote-cache/` |

HTTPS 토큰은 같은 폴더의 `.key`로 AES-256-GCM 암호화됩니다. 기본 언어는 한국어이고, 색상 테마는 Light 20개와 Dark 20개입니다. 기본 테마는 `light-classic`입니다.

## MyGit Win V10

### 요구 사항

- Windows 10 이상
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (framework-dependent 빌드)

### 빌드와 실행

루트에서 다음 명령을 사용합니다.

```powershell
npm run win:build
npm run win:run
```

### 설치 패키지 (MSI)

설치 프로젝트는 앱을 `win-x64` framework-dependent로 게시한 뒤 WiX Toolset v6로 묶습니다.

```powershell
npm run win:dist
```

결과 파일은 프로젝트 루트의 `MyGitWinV10Setup.msi`입니다. 같은 파일이 `installer/bin/Release/`에도 있습니다. Release 빌드 전에 실행 중인 MyGit을 종료하세요. 잠긴 `MyGitWinV10.App.exe`가 빌드를 막을 수 있습니다.

설정은 `%AppData%\MyGitWinV10\settings.json`이고, Browse Remote 캐시는 `%LocalAppData%\MyGitWinV10\remote-cache\`입니다. PAT는 Windows DPAPI(현재 사용자)로 암호화됩니다.

### 아이콘 다시 만들기

`Assets/MyGit.ico`와 Files 패널 상태 아이콘을 함께 만듭니다.

```powershell
dotnet run --project Assets/GenerateIcon.csproj -- Assets/MyGit.ico
```

## 폴더

| 경로 | 설명 |
|------|------|
| `MyGitJS/` | Web / Windows / macOS / Linux 클라이언트 |
| `MyGitWinV10.App/` | Windows WinForms 앱 |
| `Assets/` | 아이콘과 아이콘 생성기 |
| `installer/` | WiX MSI 프로젝트 |
| `UsersGuide.md` | 사용 방법 |
| `Architecture.md` | 앱 구조 |

## 두 앱이 같이 하는 일

- 로컬 저장소 열기, Clone, Browse Remote(bare 캐시, 읽기 전용)
- 최근 저장소와 마지막 세션 복원
- 브랜치, 원격, 태그, GitHub Releases
- 파일 트리, Git 상태 배지, 작업 트리 변경 감지
- 레인 방식 커밋 그래프, 커밋 상세, 색상 unified diff
- Git Add / Reset / Discard / Commit / Fetch / Pull / Push / Stash
- Checkout, 파일·폴더 만들기와 삭제, `.gitignore`
- 한국어 / English. Git 명령 이름은 영어를 유지합니다.
- 외부 diff 도구 (`{left}`, `{right}`)
- 내장 Diff & Merge. 충돌 해결의 기본 도구이고 별도 창으로 열립니다. 외부 merge 도구도 고를 수 있습니다.

MyGitJS는 여기에 드라이브 탐색, 폴더 열기, Light/Dark 테마 각 20개, 복사 가능한 오류 상세, Markdown 요약과 인쇄를 더합니다. WinForms 앱은 PDF, Word, Markdown 차트 리포트를 내보냅니다.
