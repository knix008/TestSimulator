# MySimulationMath

M 언어(`.m` 스크립트와 함수)로 수치 계산을 하고, 그림을 그리고, 블록 다이어그램 모델을 시뮬레이션하는 데스크톱 · 웹 프로그램입니다. Windows, macOS, Linux(Tauri 2)와 웹 브라우저에서 같은 화면으로 동작합니다.

A desktop and web environment for numerical computing in the M language (`.m` scripts and functions), plotting, and block-diagram simulation. The same GUI runs on Windows, macOS, Linux (Tauri 2) and in a web browser.

## 화면 / Screen

| 영역 | Area | 내용 |
|---|---|---|
| 제목 표시줄 + 리본 | Title bar + ribbon | 홈 · 플롯 · 앱 · 편집기 · 시뮬레이션 탭, 테마, 언어(한/영), 설정, 창 단추 |
| 현재 폴더 | Current Folder | 폴더 트리, 두 번 클릭으로 열기 / 실행 / 불러오기, 새로 만들기 · 이름 바꾸기 · 삭제(실행 취소 가능) |
| 편집기 | Editor | 탭, M 문법 색, 줄 번호, 중단점, `%%` 섹션 실행, 자동 완성, 찾기/바꾸기, 주석, 들여쓰기 |
| 명령 창 | Command Window | `>>` 프롬프트, ↑↓ 기록, Tab 자동 완성, 여러 줄 입력, Ctrl+C 중단, 오류의 파일:줄 링크 |
| 작업 공간 | Workspace | 변수 이름 · 값 · 크기 · 클래스, 두 번 클릭하면 변수 편집기 |
| 명령 기록 | Command History | 실행한 명령, 두 번 클릭으로 다시 실행 |
| 그림 / 모델 | Figures / Models | 그림 영역과 블록 다이어그램 편집기 탭 |

40가지 테마(다크 20 · 라이트 20)와 사용자 정의 테마, 한국어 / 영어를 지원합니다. 창 위치와 크기, 창 배치, 열린 파일은 다음 실행 때 그대로 돌아옵니다.

## 실행 / Run

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev, 늘 최신 코드) / desktop app with the latest code
npm run dev          # 웹 화면만 (Vite, 빈 포트 자동 선택) / web UI only
npm run web          # 빌드 후 웹 서버 / build, then the Node web host
npm run msm -- -r "disp(1)"   # 터미널에서 M 코드 실행 / run M code in the terminal
npm run msm -- file.m         # 스크립트 실행 / run a script
npm run msm                   # 터미널 프롬프트 (>>) / terminal prompt
npm test             # 모든 시험 (진행 상황과 요약 표) / every test with progress and a summary
npm run build        # dist/ (Vite)
npm run build:win    # Windows 설치 파일 (NSIS) / installer
```

개발 서버는 항상 비어 있는 포트(5230부터, IPv4와 IPv6 모두 확인)를 고르며 다른 프로그램이 쓰는 포트는 건드리지 않습니다.
The dev server always picks a port free on both IPv4 and IPv6 (from 5230 upwards); a port another program uses is never reused.

웹 판은 작업 폴더(기본 `~/MySimulationMath`, `--root` 또는 `MSM_ROOT`로 변경) 안의 파일만 다룹니다. 데스크톱 판은 컴퓨터의 모든 폴더를 쓸 수 있고 `system()` 명령도 동작합니다.
The web version only sees files inside its work folder (default `~/MySimulationMath`, change with `--root` or `MSM_ROOT`). The desktop version works with every folder and supports `system()`.

## 파일 형식 / File types

| 확장자 | 내용 |
|---|---|
| `.m` | M 스크립트와 함수 / M scripts and functions (설정에서 이 프로그램으로 열도록 연결 가능) |
| `.msim`, `.smdl` | 블록 다이어그램 모델 / block-diagram models |
| `.mat` | 작업 공간 데이터 / workspace data |

## 문서 / Docs

- [USERSGUIDE.md](USERSGUIDE.md) — 사용 설명서 / user's guide
- [ARCHITECTURE.md](ARCHITECTURE.md) — 구조 / architecture
- [core/CONTRACT.md](core/CONTRACT.md) — 모듈 계약 / module contract

## 라이선스 / License

MIT © 2026 SHKWON
