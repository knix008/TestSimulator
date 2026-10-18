# MyUMLMaker

Windows · macOS · Linux · 웹에서 쓰는 UML 모델링 프로그램입니다. StarUML처럼 **모델 기반**으로 UML 2 다이어그램 15종과 ER · 순서도 · 데이터 흐름 · SysML · BPMN · C4 · 마인드맵 · 와이어프레임 · 클라우드 다이어그램을 그리고, 모델을 검증하고, 코드를 만들고(코드 생성), 거꾸로 소스 코드를 모델로 읽어 들입니다(역공학). JavaScript(Vite) UI와 Tauri 2(Rust) 백엔드로 만들었습니다.

![아이콘](assets/icon-256.png)

- 버전: 1.0.0
- 사용법: [UsersGuide.md](UsersGuide.md) (English: [UsersGuide.en.md](UsersGuide.en.md))
- 구조: [ARCHITECTURE.md](ARCHITECTURE.md)
- 튜토리얼 문서: [docs/tutorial/README.md](docs/tutorial/README.md). 동영상은 `npm run tutorial:video`로 루트에 `MyUMLMaker-Tutorial.mp4`를 만듭니다(저장소에는 넣지 않습니다).

## 주요 기능

### 모델과 다이어그램

- **모델과 뷰를 나눔** — 요소는 모델에 한 번만 있고, 여러 다이어그램에 뷰로 나타납니다. 뷰만 지우기 / 모델에서 지우기
- **모델 탐색기** — 프로젝트 › 모델 › 패키지 › 요소 트리, 검색, 끌어서 옮기기, 탐색기에서 다이어그램으로 끌어 놓기
- **편집기** — 속성 · 구성원(속성·오퍼레이션·리터럴·매개변수) · 문서 · 스타일 탭에서 선택한 요소를 바로 편집
- **다이어그램 29종** — UML 15종(클래스 · 패키지 · 객체 · 복합 구조 · 컴포넌트 · 배치 · 프로파일 · 유스케이스 · 시퀀스 · 커뮤니케이션 · 타이밍 · 인터랙션 개요 · 정보 흐름 · 상태 머신 · 액티비티), ER, 순서도, 데이터 흐름, SysML 4종, BPMN, C4, 마인드맵, 와이어프레임, 클라우드(AWS · Azure · GCP)
- **템플릿 17종**과 "온라인 쇼핑몰" 예제 프로젝트(한국어/영어)

### 그리기

- 다이어그램 종류마다 맞는 **도구 상자**, 요소 위의 **빠른 단추**와 **관련 요소 추가**(이웃 요소를 관계와 함께 만들기)
- **빠른 편집** — 요소를 두 번 눌러 `+name: Type`, `+op(a: int): void` 같은 한 줄 문법으로 이름·속성·오퍼레이션을 한꺼번에 고침
- 시퀀스 메시지 번호와 활성 막대 자동, 결합 프래그먼트 12종, 상태·전이의 트리거 [가드] / 효과, 액티비티 파티션, ER 까마귀발 표기
- 관계 끌기(허용되지 않는 관계는 막음), 선 모양(직각 · 직선 · 곡선), 꺾임점, 끝 레이블(역할·다중성)
- 잘라내기 · 복사 · 붙여넣기, 실행 취소/다시 실행, 맞춤·분배, 자동 레이아웃, 확대(`Ctrl+휠`)와 미니맵
- 위쪽·왼쪽 **눈금자**(다이어그램 좌표, 포인터 위치), 선 **격자**(5칸마다 진한 선, 확대해도 화면에서 같은 간격)

### 모델 도구

- **모델 검증** — 20여 규칙(이름 없음, 중복 이름, 순환 일반화, 다중성 형식, 시작 의사 상태, 기본 키 …), 결과에서 요소로 이동
- **찾기** — 이름 · 문서 · 종류 · 타입으로 모델 전체 검색
- **코드 생성** — Java · C# · C++ · Python · TypeScript · Kotlin · PHP와 **SQL DDL**(MySQL/MariaDB · PostgreSQL · SQLite · SQL Server · Oracle), 미리 보기, 폴더 또는 ZIP
- **역공학** — Java · C# · C++ · Python · TypeScript 소스와 SQL DDL 파일·폴더를 읽어 클래스·인터페이스·열거형·관계와 클래스 다이어그램(SQL은 ER 다이어그램)을 만듦. C++는 `.h` · `.hpp` · `.hh` · `.hxx` · `.cpp` · `.cc` · `.cxx`의 네임스페이스·클래스·구조체·공용체·열거형·접근 구역·필드·메서드(순수 가상 → 추상)·생성자·기반 목록을 읽음
- **Mermaid · PlantUML 가져오기**, Mermaid · PlantUML 텍스트로 내보내기

### 파일과 연동

- `.myuml` 프로젝트(예전 `.muml`도 열림), `.mumlt` 템플릿, `.mfj` 모델 조각(UTF-8 JSON), 저장은 임시 파일에 쓴 뒤 바꿔치기, 자동 저장(데스크톱)
- **StarUML** `.mdj` 열기·저장
- 내보내기 — 그림(PNG · JPEG · WebP · BMP · TIFF · SVG, 배율 1~3배, 투명 배경), 모든 다이어그램을 그림 ZIP으로, PDF(모든 다이어그램), **HTML 문서** · **Markdown 문서**(모델 전체의 설명서)
- **데이터베이스에 저장·열기**(데스크톱) — SQLite · MariaDB · MySQL · PostgreSQL
- **한 번에 프로젝트 하나** — 다이어그램 위 줄에 프로젝트 이름과 **다이어그램마다 탭 하나**(넘치면 ‹ ›), 그 아래 **다이어그램 종류 탭**(묶음 › 종류, 고르면 그 종류의 다이어그램과 도구 상자). 새로 만들기·열기·최근 파일·끌어다 놓기·DB 열기는 지금 프로젝트를 대신하고, 저장하지 않은 변경이 있으면 먼저 물음(끝낼 때도)
- 최근 파일·폴더, **끌어다 놓기**
- **인쇄** — 미리 보기, 다이어그램 범위, 용지·방향·여백, 한 장에 맞추기

### 화면과 사용 편의

- **테마** — 다크 20 · 라이트 20 · 사용자 정의 · 시스템 설정, **다이어그램 색 구성** 4가지(클래식 · 파스텔 · 청사진 · 어두운)
- **한국어/영어** — 툴바의 국기 버튼, 백엔드 메시지까지 전환
- **시작 페이지** — 템플릿, 열기, 최근 파일·폴더, 예제, 튜토리얼, **움직이는 배경 20가지**
- **튜토리얼** — 실제 프로그램을 움직이며 58단계로 모든 기능을 보여 줌(자동 재생, 장 고르기)
- **설정** — 일반 · 테마 · 글꼴 · 배경 · 시작 화면 · 다이어그램 · 데이터베이스 · 단축키 등, 다음 실행에 다시 쓰임
- 접을 수 있는 패널, 상태 표시줄, **메뉴와 팝업은 독립 창**(메인 창과 함께 닫힘), 오류 팝업(내용 복사), 심각한 오류는 `crash.log`
- **한 번에 하나만 실행**, 타이틀 바에 `MyUMLMaker v1.0.0`, 창 위치·크기 기억, 프레젠테이션 모드

## 빠른 시작

필요: Node.js 20+, Rust 1.80+ (stable), 각 OS의 Tauri 준비물(Windows: WebView2·MSVC, Linux: webkit2gtk-4.1, macOS: Xcode CLT).

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev)
npm run dev          # 웹 개발 서버 http://localhost:1450
```

## 빌드

```bash
npm run build:win    # Windows NSIS 설치 파일  → release/MyUMLMaker-Setup-1.0.0.exe (+ 프로젝트 루트에 사본)
npm run build:mac    # macOS .app + .dmg       → release/
npm run build:linux  # .deb · .rpm · .AppImage → release/
npm run build:all    # 지금 OS에서 만들 수 있는 전부
npm run build:web    # 웹 빌드 → dist/ (아무 정적 웹 서버에 올리면 됨)
npm run build:docs   # UsersGuide*.md · docs/tutorial/README*.md → docs/*.html, public/docs/
npm run build:icons  # 앱·문서 아이콘과 설치 프로그램 그림 다시 만들기
npm run samples      # samples/ 예제 다시 만들기
```

Tauri는 교차 빌드를 하지 않으므로 각 OS 설치 파일은 그 OS에서 만듭니다. 설치 파일은 `release/`에 만들어지고 프로젝트 루트에도 사본이 놓입니다. 설치 파일에는 사용 설명서(HTML·Markdown), 튜토리얼 문서와 그림, 예제가 함께 들어갑니다.

### Windows 설치 프로그램

- 설치 시작 시 **한국어/영어**를 고릅니다.
- 이전 설치가 있으면 **완전히 제거한 뒤** 새로 설치합니다(이전 제거 프로그램을 조용히 실행하고 폴더를 지움).
- 이전 설치의 **설정은 기본값으로 되돌리고, 사용자 데이터(최근 파일·폴더, 열린 프로젝트 목록, DB 연결, 배경 이미지, 튜토리얼 기록)는 그대로 둡니다** (설치 후 첫 실행 때 한 번).
- `.myuml`(프로젝트, "MYUML" 문서 아이콘 `src-tauri/icons/project.ico`)과 `.mumlt`(템플릿)를 **각자의 문서 아이콘**으로 등록합니다. 파일을 두 번 클릭하면 MyUMLMaker에서 열립니다.
- 사용 설명서와 튜토리얼 문서를 설치 폴더의 `docs`에, 예제를 `samples`에 넣습니다.
- 현재 사용자용 설치(관리자 권한 불필요). macOS는 .dmg, Linux deb/rpm은 MIME 형식과 문서 아이콘을 등록합니다.

## 테스트

```bash
npm test                         # 전체 (설치 파일 빌드 제외)
npm test -- --quick              # JS + 패키징 + Rust 단위 테스트만 (창·브라우저 없이)
npm test -- --only js,rust       # 골라서 (--skip desktop 으로 빼기도 가능)
npm test -- --installer          # 설치 파일 빌드·검사까지
```

분류: **JS 단위 · 패키징/아이콘/문서 · Rust 단위 · DB 통합 · E2E 웹 · E2E 데스크톱 GUI · 튜토리얼 · 설치 프로그램**.

- 실행 중에는 테스트마다 ✔/✖/○와 실행 시간이 색으로 표시되고, 끝나면 분류별 결과 표와 요약표가 나옵니다.
- 결과는 `test-results/results.json`에도 저장됩니다.
- DB 통합 테스트는 `test/db.local.json`(`.gitignore`로 제외, 비밀번호가 들어갈 수 있음)의 MariaDB/MySQL 서버를 쓰고(없으면 건너뜀), PostgreSQL은 주소가 없으면 임시 서버를 띄웁니다.
- E2E는 실제 앱(데스크톱: WebView2, 웹: 헤드리스 Edge/Chrome)을 CDP로 조작하며, 사용자의 설정·창 위치·데이터는 건드리지 않습니다(전용 폴더 사용).
- StarUML 호환 검사(`test/unit/staruml.test.js`)는 StarUML의 모든 다이어그램 종류와 그 도구 상자 도구, 모든 도구가 그리기·잇기·렌더링되는지, 기능 명령, 코드 생성·역공학 언어, `.mdj` · 모델 조각 · Mermaid · PlantUML 왕복, HTML · Markdown 문서, 예제에 모든 다이어그램 종류가 있는지를 확인합니다.
- 문서 검사(`test/static/docs.test.js`)는 HTML 문서와 그 안의 링크·그림, README의 빌드 명령, 단축키 표, 튜토리얼 단계 수를 확인합니다.

## 튜토리얼 문서와 동영상

```bash
npm run tutorial:docs    # 튜토리얼 단계마다 화면을 캡처 → docs/tutorial/README.md (+ README.en.md), docs/tutorial/images/
npm run tutorial:video   # 튜토리얼 자동 재생을 녹화 → MyUMLMaker-Tutorial.mp4 (프로젝트 루트, ffmpeg 필요, 저장소에는 넣지 않음)
npm run build:docs       # 마크다운 → docs/UsersGuide.html · UsersGuide.en.html · Tutorial.html · Tutorial.en.html
```

그림은 `docs/tutorial/images/NN-<단계 id>.jpg`(NN = 튜토리얼 단계 순서)로 저장되고, 사용 설명서도 이 그림을 씁니다. 앱의 **도움말 › 사용 설명서**는 설치된 `docs/UsersGuide.html`(영어 화면이면 `UsersGuide.en.html`)을 엽니다. 웹 빌드는 `public/docs/`를 `./docs/`로 함께 내보냅니다.

## 저장소에 넣지 않는 것

`.gitignore`가 의존성과 만든 결과물을 커밋에서 뺍니다. `package-lock.json`과 `src-tauri/Cargo.lock`은 커밋합니다.

| 경로 | 이유 |
|---|---|
| `node_modules/` | `npm install` |
| `dist/` | `npm run build:web` |
| `src-tauri/target/`, `src-tauri/gen/` | Rust · Tauri 빌드 |
| `release/`, 루트의 `MyUMLMaker-*.exe` · `.msi` · `.dmg` · `.deb` · `.rpm` · `.AppImage` | 설치 파일 |
| `*.mp4` | `npm run tutorial:video` |
| `test-results/`, `*.log` | `npm test` 결과 |
| `test/db.local.json` | DB 통합 테스트 접속 정보 |

## 파일 형식

| 확장자 | 내용 |
|---|---|
| `.myuml` | 프로젝트 (UTF-8 JSON: `format`, `version`, `kind: "project"`, `project`). 예전 `.muml`도 열리고, 저장할 때 `.myuml` 이름을 물음 |
| `.mumlt` | 템플릿 (같은 형식, `kind: "template"` — 열면 새 프로젝트로 시작, 저장 시 새 이름을 물음) |
| `.mfj` | 모델 조각 — 모델의 일부를 내보내고 다른 프로젝트로 가져오기 |
| `.mdj` | StarUML 프로젝트 — 열기·저장 |
| `.mmd` · `.puml` | Mermaid · PlantUML 텍스트 — 가져오기·내보내기 |
| `.png` · `.jpg` · `.webp` · `.bmp` · `.tiff` · `.svg` · `.pdf` · `.html` · `.zip` | 내보내기 (`.zip`: Markdown 문서, 모든 다이어그램 그림) |

자세한 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 사용법은 [UsersGuide.md](UsersGuide.md)를 보세요.

## 제작

SHKWON (knix008@naver.com)

---

## English

**MyUMLMaker** is a model-driven UML tool in the style of StarUML for Windows, macOS, Linux and the web (JavaScript/Vite UI, Tauri 2/Rust backend).

- **Model and views** — every element lives once in the model and appears as views on any number of diagrams; Model Explorer tree with search and drag and drop; an editor with properties, members, documentation and style.
- **29 diagram types** — 15 UML 2 diagrams (class, package, object, composite structure, component, deployment, profile, use case, sequence, communication, timing, interaction overview, information flow, state machine, activity), ER, flowchart, data flow, 4 SysML diagrams, BPMN, C4, mind map, wireframe and cloud (AWS, Azure, GCP); 17 templates and a sample project.
- **Drawing** — per-diagram toolbox, quick buttons and "add related element", one-line **quick edit** (`+name: Type`, `+op(a: int): void`), automatic message numbers and activation bars, 12 combined fragments, crow's-foot ER notation, rectilinear/straight/curved lines, align and distribute, auto layout, undo/redo.
- **Model tools** — validation (20+ rules), find, **code generation** (Java, C#, C++, Python, TypeScript, Kotlin, PHP, SQL DDL for five dialects), **reverse engineering** from Java, C#, C++ (`.h .hpp .hh .hxx .cpp .cc .cxx`), Python, TypeScript and SQL DDL, Mermaid and PlantUML import/export.
- **One project at a time** — the row above the canvas shows the project name and one tab per diagram (‹ › when they overflow), with diagram type tabs (group › type) under it that open a diagram of that type and switch the toolbox; new / open / recent / drop / database open replace the current project after asking about unsaved changes. Rulers on the top and left edges, a line grid with a darker line every 5 steps that keeps its screen spacing at every zoom.
- **Files** — `.myuml` projects (old `.muml` files still open), `.mumlt` templates, `.mfj` model fragments, StarUML `.mdj` open and save, picture (PNG, JPEG, WebP, BMP, TIFF, SVG) and PDF export, HTML and Markdown model documents, database storage (SQLite, MariaDB, MySQL, PostgreSQL), recent files and folders, drag and drop, printing with a preview.
- **UI** — 20 dark + 20 light + custom themes, 4 diagram colour schemes, Korean/English with a flag button, start page with 20 moving backgrounds, a 58-step tutorial, persisted settings, separate popup windows, error popups, single-instance lock.

```bash
npm install
npm start              # desktop app (tauri dev)
npm run dev            # web dev server at http://localhost:1450
npm run build:win      # Windows installer → release/ and ./MyUMLMaker-Setup-1.0.0.exe
npm run build:mac      # macOS .dmg
npm run build:linux    # .deb · .rpm · .AppImage
npm run build:all      # everything this OS can build
npm run build:web      # web build → dist/
npm test               # all tests (npm test -- --quick, --only js,rust, --installer)
```

The Windows installer asks for Korean or English, removes a previous installation completely, resets the previous settings while keeping the user's data (recent files, open projects, database connection, background image, tutorial history), registers `.myuml` (its own "MYUML" document icon) / `.mumlt` with their own icons and installs the user's guide and samples.

`.gitignore` keeps dependencies and build output out of the repository (`node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, `release/` and the root installers, `*.mp4`, `test-results/`, `test/db.local.json`). `package-lock.json` and `src-tauri/Cargo.lock` stay committed.

User's guide: [UsersGuide.en.md](UsersGuide.en.md) · Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

Author: SHKWON (knix008@naver.com)
