# MyKanbanBoard

Windows · macOS · Linux · 웹에서 쓰는 칸반 보드입니다. JavaScript(Vite) UI와 Tauri 2(Rust) 백엔드로 만들었습니다.

![아이콘](assets/icon-256.png)

## 주요 기능

- **보드·열·카드** — 열 추가/삭제/이름 바꾸기/정렬/WIP 제한, 카드 제목·설명·색·우선순위·마감일·담당자·태그·체크리스트
- **끌어다 놓기** — 카드·열을 마우스로 옮기기, 도구 패널의 카드/템플릿을 보드로 끌기, 외부 파일 끌어오기(보드 열기, 텍스트 → 카드, 이미지 → 배경, 카드 위에 놓으면 첨부)
- **첨부 파일** — 카드에 파일·이미지 첨부(최대 50 MB), 이미지는 카드에 썸네일, 클릭하면 이미지 보기 창
- **프로젝트(.mkproj)** — 여러 보드를 묶고 저장소를 고름: 로컬 파일(DB 설정이 없을 때) · SQLite · MariaDB · MySQL · PostgreSQL
- **실행 취소/다시 실행**, 클립보드 복사·잘라내기·붙여넣기(Ctrl+C/X/V, 다른 프로그램의 텍스트는 줄마다 카드)
- **Ctrl+마우스 휠** 확대/축소, 탭 여러 개(넘치면 오른쪽 끝 `<` `>` 버튼), 좌우 패널 접기(아이콘 레일)
- **인쇄** — 전체/현재 보드/사용자 지정(열·선택한 카드), 미리보기에서 용지·방향·여백·배율 설정 후 바로 인쇄
- **설정** — 한국어/영어, 테마 12종(+시스템), 시스템 글꼴 전체·크기·굵기·기울임, 배경 이미지(크기 제한 없음)와 불투명도, 최근 파일 10개(개별/전체 삭제), 마지막 폴더·창 위치 기억
- **메뉴·팝업은 독립 창** — 메뉴와 컨텍스트 메뉴(카드/열/보드/탭/입력칸마다 다름)는 아이콘+이름이 한 줄씩, 메인 창 밖까지 표시. 팝업은 크기 고정, 스크롤 없음, 메인 창을 닫으면 함께 닫힘
- **오류 팝업**(내용 복사 가능), 오래 걸리는 파일 작업은 **진행 팝업**, 종료 시 **저장 여부** 확인
- 툴바 버튼마다 툴팁, 창 최소 폭은 툴바 버튼이 가려지지 않는 폭, 타이틀 바에 이름과 버전

## 빠른 시작

필요: Node.js 20+, Rust 1.80+ (stable), 각 OS의 Tauri 준비물(Windows: WebView2·MSVC, Linux: webkit2gtk-4.1, macOS: Xcode CLT).

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev)
npm run dev          # 웹 개발 서버 http://localhost:1430
```

## 빌드

```bash
npm run build:win    # Windows NSIS 설치 파일  → release/MyKanbanBoard-Setup-<버전>.exe
npm run build:mac    # macOS .app + .dmg       → release/MyKanbanBoard-<버전>-<arch>.dmg
npm run build:linux  # .deb · .rpm · .AppImage → release/
npm run build:all    # 지금 OS에서 만들 수 있는 전부
npm run build:web    # 웹 빌드 → dist/ (아무 정적 웹 서버에 올리면 됨)
npm run build:icons  # assets/*.svg → 모든 아이콘·설치 화면 이미지 다시 만들기
```

Tauri는 교차 빌드를 하지 않으므로 각 OS 설치 파일은 그 OS에서 만듭니다.

### Windows 설치 프로그램

- 설치 시작 시 **한국어/영어**를 고릅니다.
- 이전 설치가 있으면 **완전히 제거한 뒤** 새로 설치합니다(이전 제거 프로그램을 조용히 실행하고 폴더를 지움).
- 이전 설치가 남긴 **데이터(설정·최근 파일·배경 이미지)** 가 있으면 지울지 묻습니다.
- `.mkanban`(보드)과 `.mkproj`(프로젝트)를 **각자의 문서 아이콘**으로 시스템에 등록합니다.
- 설치 파일·프로그램·실행 중인 창의 아이콘은 모두 같은 3D 아이콘입니다.

## 테스트

```bash
npm test                         # 전체 (설치 파일 빌드 제외)
npm test -- --installer          # 설치 파일 빌드·검사까지
npm test -- --quick              # JS + 패키징 + Rust 단위 테스트만
npm test -- --only web,desktop   # 골라서
```

분류: **JS 단위 · 패키징/아이콘 · Rust 단위 · DB 통합 · E2E 웹 · E2E 데스크톱 · 설치 프로그램**. 실행 중에는 테스트마다 ✔/✖/○와 실행 시간이 색으로 표시되고, 끝나면 분류별 결과가 열을 맞춘 표(실패 우선, 느린 순, 시간 막대)와 요약표로 정리됩니다. 결과는 `test-results/results.json`에도 저장됩니다.

E2E는 실제 앱(데스크톱: WebView2, 웹: 헤드리스 Edge/Chrome)을 띄워 메뉴·툴바·팝업·끌어다 놓기·파일·DB를 직접 조작합니다. 데스크톱 E2E는 Windows에서 실행됩니다.

### DB 통합 테스트

실제 DB 서버 주소는 git에 올리지 않는 `test/db.local.json`에 둡니다(없으면 해당 테스트는 "건너뜀").

```json
{ "mysql": "mysql://root:비밀번호@127.0.0.1:3306", "postgres": "postgres://user:비밀번호@127.0.0.1:5432" }
```

테스트는 서버에 `mykanban_test_<번호>` / `mykanban_e2e_<번호>` 데이터베이스를 만들어 쓰고 끝나면 지웁니다. 환경 변수 `MYKANBAN_TEST_MYSQL_URL`, `MYKANBAN_TEST_POSTGRES_URL`도 됩니다.

## 파일 형식

| 확장자 | 내용 |
|---|---|
| `.mkanban` | 보드 하나 (UTF-8 JSON: `format`, `version`, `board`, 첨부 내용 `attachments`) |
| `.mkproj` | 프로젝트 (이름·설명·보드 목록·저장소 설정. 로컬 저장소면 보드와 첨부도 안에 포함) |

자세한 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 제작

SHKWON (knix008@naver.com)
