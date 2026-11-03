# My Git Master V1.0.0

커밋 그래프, 변경 파일, diff, 브랜치, 태그, GitHub Release를 한 화면에서 보는 Git 클라이언트입니다. 내장 Diff & Merge 창과 터미널이 있습니다. 데스크톱 앱(Windows, macOS, Linux)은 Tauri 2로, 웹 버전은 같은 화면을 브라우저에서 씁니다.

- 사용법: [doc/UsersGuide.md](doc/UsersGuide.md)
- 구조: [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md)

제작자: SHKWON(knix008@naver.com)

## 요구 사항

| 용도 | 필요한 것 |
|------|-----------|
| 실행 (설치본) | Git이 `PATH`에 있어야 합니다. Node.js는 설치본에 들어 있습니다. |
| 개발 | Node.js 20.19 이상, Rust(stable), Git. Linux는 `libwebkit2gtk-4.1-dev` 등 [Tauri 준비물](https://tauri.app/start/prerequisites/) |

## 명령

프로젝트 루트에서 실행합니다.

| 명령 | 동작 |
|------|------|
| `npm install` | 의존성 설치 |
| `npm start` | 데스크톱 앱 개발 실행. 화면 수정은 바로, 코어 수정은 다시 시작하면 반영됩니다. |
| `npm run dev:web` | 브라우저용 개발 서버 |
| `npm run build` | 화면(`dist/`)과 서버 번들(`dist-server/`) |
| `npm run serve` | 빌드한 웹 버전 실행 (`PORT`, 기본 4730) |
| `npm run build:win` | Windows 설치본 (NSIS) |
| `npm run build:mac` | macOS dmg |
| `npm run build:linux` | Linux AppImage, deb |
| `npm test` | 기능 테스트 + 셸 테스트, 색으로 정리한 Summary |
| `npm run typecheck` | TypeScript 검사 |
| `npm run icons` | `assets/icon.ico`에서 나머지 아이콘을 다시 만듭니다 |

개발 서버 포트는 기본 5173(화면)과 4730(코어)이고, 사용 중이면 다음 빈 포트를 고릅니다. 실제 주소는 터미널에 표시됩니다.

## 설치본

```powershell
npm run build:win
```

완성된 `My Git Master_1.0.0_x64-setup.exe`가 프로젝트 루트에 복사됩니다(중간 산출물은 `src-tauri/target/release/bundle/`). 설치 마법사는 처음에 한국어와 English 중 설치 언어를 고르며, 현재 사용자용으로 설치됩니다. 제거할 때 사용자 데이터가 있으면 함께 지울지 묻습니다. 다른 OS용 설치본은 그 OS에서 같은 방식으로 만듭니다.

## 테스트

```powershell
npm test
```

| 부분 | 명령 | 내용 |
|------|------|------|
| unit | `npm run test:unit` | 임시 Git 저장소에서 Git 작업, HTTP API, 터미널·프롬프트, 설정, 테마, 시작 화면, 창·설명서, 빌드 구성, 데스크톱 코어 시작 |
| shell | `npm run test:shell` | `cargo test` — Tauri 셸 |

실행 중에는 분류별로 진행 상황이 나오고, 테스트 케이스마다 한 줄에 PASS/FAIL과 실행 시간이 세로로 정렬되어 표시됩니다. 분류가 끝날 때마다 진행 줄이, 마지막에는 분류별 요약 표와 전체 요약이 나옵니다. 출력은 색이 있고 영어로만 표시됩니다.

결과는 `test-results/`에 남습니다(`index.html`은 항목별 실행 시간, `unit.log`, `shell.log`, `summary.json`). 테스트는 OS 사용자 설정을 바꾸지 않습니다.

## 설정

| OS | 설정 | Browse Remote 캐시 |
|----|------|--------------------|
| Windows | `%AppData%\MyGitMaster\settings.json` | `%LocalAppData%\MyGitMaster\remote-cache\` |
| macOS | `~/Library/Application Support/MyGitMaster/settings.json` | `~/Library/Caches/MyGitMaster/remote-cache/` |
| Linux | `$XDG_CONFIG_HOME/MyGitMaster/settings.json` 또는 `~/.config/MyGitMaster/settings.json` | `$XDG_CACHE_HOME/MyGitMaster/remote-cache/` 또는 `~/.cache/MyGitMaster/remote-cache/` |

예전 MyGitJS(Electron 판)의 `MyGitJS` 폴더가 있으면 처음 실행할 때 설정과 토큰 키를 한 번 복사해 옵니다. HTTPS 토큰은 같은 폴더의 `.key`로 AES-256-GCM 암호화됩니다. 기본 언어는 한국어이고, 색상 테마는 Light 20개와 Dark 20개입니다.

## 폴더

| 경로 | 설명 |
|------|------|
| `core/` | Git, 설정, 테마, diff·merge, 보고서, 터미널 (TypeScript) |
| `server/` | HTTP API, 웹 서버와 데스크톱 코어 진입점 |
| `src/` | React 화면, 데스크톱 브리지 |
| `src-tauri/` | Tauri 셸 (Rust), 설치 마법사 훅 |
| `scripts/` | 개발 실행, 번들, 런타임 준비, 아이콘, 테스트 |
| `test/` | 기능 테스트 |
| `assets/` | 아이콘 |
| `doc/` | 사용자 가이드와 구조 문서 |

## 기능

- 로컬 저장소 열기, Clone, Browse Remote(bare 캐시, 읽기 전용)
- 최근 저장소와 마지막 세션 복원
- 브랜치, 원격, 태그, GitHub Releases
- 파일 트리, Git 상태 배지, 작업 트리 변경 감지
- 레인 방식 커밋 그래프, 커밋 상세, 색상 unified diff
- Git Add / Reset / Discard / Commit / Fetch / Pull / Push / Stash, Checkout
- 파일·폴더 만들기와 삭제, `.gitignore`
- 내장 Diff와 Diff & Merge(충돌 해결의 기본 도구, 별도 창), 외부 diff·merge 도구
- 내장 터미널: 여러 탭(셸 선택, < > 이동), MyTerminal 방식 프롬프트(프리셋, 내 프롬프트, 구역 편집, git 상태)
- 시작 화면(시작 버튼으로 전환, 실행 메뉴, 최근 목록, 3D 배경 20가지)과 튜토리얼
- 드라이브 탐색, 폴더 열기, Light/Dark 테마 각 20개와 내 테마, 한국어 / English
- 컬러 아이콘, 아이콘만 있는 도구 모음(모든 Git 명령), 오래 걸리는 작업의 진행 상태 창
- 메뉴·대화상자·환경설정·인쇄 미리 보기가 모두 별도 창(메인 창 밖으로 이동 가능), 사용자 설명서 창(F1, 한국어/English)
- 요약 내보내기(Markdown, CSV, Word, Excel, PDF)와 인쇄, 복사 가능한 오류 상세
