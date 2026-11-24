# DBToolsMultiOSV10 — MyDBTools v1.0.1

[DBToolsWinV10](../DBToolsWinV10)(Windows Forms / .NET 10)를 **TypeScript + React** 로 다시 구현한
ER 다이어그램 · 데이터베이스 스키마 설계 도구입니다. 데스크톱 판은 **Tauri 2**(Rust 셸 + 운영체제
웹뷰)로, 웹 판은 정적 페이지로 같은 코드가 **웹 브라우저, Windows, macOS, Linux** 에서 동작합니다.

테이블·컬럼·관계를 시각적으로 편집하고, 1NF~5NF 정규화 검사와 인덱스 어드바이저를 제공하며,
SQLite / PostgreSQL / MySQL / MariaDB / SQL Server / FAISS(Vector DB) 형식의 DDL 생성과
DB 파일 가져오기를 지원합니다.

**v1.0.1 에서 새로 생긴 것** — Electron → Tauri 전환, 시작 화면, 예제 20개, 테마 40개(라이트 20 ·
다크 20) + 사용자 정의 테마와 테마 설정 창, 테마를 따르는 캔버스 배경 5종, 별도 인쇄 창(미리 보기 ·
프린터 · PDF), 사용자 설명서·튜토리얼(한/영, 별도 창), 테두리 없는 창과 직접 그린 제목 표시줄,
뜻에 따라 색을 입힌 아이콘, 입체적인 새 프로그램 아이콘(`assets/`).

---

## 실행 환경

| 대상 | 요구 사항 |
|------|-----------|
| 웹 | 최신 Chrome · Edge · Firefox · Safari |
| 데스크톱 | Windows 10/11 (x64, WebView2), macOS 10.15+, Linux (deb / AppImage, WebKitGTK 4.1) |
| 개발 | Node.js 20 이상, Rust(stable, `cargo`), Windows는 MSVC 빌드 도구 |

## 빠른 시작

```bash
npm install
npm start          # 데스크톱 앱: 문서 복사 → Vite 개발 서버 → tauri dev (최신 코드 즉시 반영)
npm run web        # 브라우저용 개발 서버 (http://127.0.0.1:5174)
```

`npm start` / `npm run web` 은 5174 포트가 비어 있지 않으면 **다른 프로그램의 포트를 건드리지 않고**
다음 빈 포트를 골라 씁니다(`scripts/free-port.mjs`). VS Code 터미널이 물려준
`ELECTRON_RUN_AS_NODE` 도 지운 뒤 실행합니다.

## 빌드

```bash
npm run build          # 문서 복사(build:docs) + 웹 번들(dist/)
npm run build:debug    # 디버그 exe (설치 파일 없이) — src-tauri/target/debug/MyDBTools(.exe)
npm run build:win      # Windows NSIS 설치 파일
npm run build:mac      # macOS .app / .dmg
npm run build:linux    # Linux .deb / .AppImage
```

설치 파일은 각 운영체제에서 만듭니다. 끝나면 **이번 버전(package.json의 1.0.1) 설치 파일만 프로젝트
루트로 복사**하고, 루트에 남아 있던 이전 버전은 지웁니다. 원본은 `src-tauri/target/release/bundle/`.

설치 파일·실행 파일·창·작업 표시줄 아이콘은 `assets/icon.ico`·`assets/icons/*.png`,
`.mdprj` 문서 아이콘은 `assets/file-icon.ico`(NSIS 훅 `src-tauri/windows/hooks.nsh` 가 연결)입니다.

### 정리

```bash
npm run clean       # dist/ · src-tauri/target/ · src-tauri/gen/ · public/doc 의 문서 사본 · 테스트 임시 폴더
npm run clean:all   # 위 전부 + node_modules/ + 루트에 복사된 설치 파일 (다시 쓰려면 npm install)
```

### 생성물 다시 만들기

```bash
npm run make:icons     # assets/icon.ico, icon.png, file-icon.ico, file-icon.png, icons/*.png
npm run make:template  # template/ 예제 파일
npm run build:docs     # doc/*.md → public/doc/ (설명서 창이 읽는 사본)
```

아이콘은 `scripts/make-icons.mjs` 가 코드로 그립니다(외부 그림 없음). 프로그램 아이콘은 색이 다른
세 층의 원통(빛을 받는 곡면 음영)과 ER 테이블 카드를 다채로운 타일 위에 올린 입체 그림입니다.

## 테스트

```bash
npm test                    # 단위 + 통합 테스트 (327개)
npm run test:rust           # Rust 셸 단위 테스트
npm run typecheck           # TypeScript 타입 검사
```

---

## 원본 대비 변경 사항

포팅은 원본 동작을 그대로 따르는 것을 원칙으로 했습니다. 아래 네 가지는 원본에 있던
**실제 결함**이라 수정했으며, 나머지 출력은 원본과 바이트 단위로 동일합니다.

### 1. 외래 키 방향 (가장 중요)

원본 모델에서 관계의 `Source` 는 **부모(참조되는 PK)**, `Target` 은 **자식(FK를 가진 컬럼)** 입니다.
가져오기 코드(`SchemaRelationshipBuilder`)와 Sample 스키마 모두 이 규칙을 따릅니다.
그러나 `SqlExporter` · 캔버스 FK 배지 · 정규화 분석기 · 인덱스 어드바이저는 반대로 해석하고 있었습니다.

그 결과 원본이 내보내는 DDL은 다음과 같았습니다.

```sql
-- 원본 (실행 불가)
ALTER TABLE "categories"
    ADD CONSTRAINT "fk_products_category"
    FOREIGN KEY ("id")
    REFERENCES "products"("category_id");
```

`products.category_id` 에는 UNIQUE 제약이 없으므로 PostgreSQL·MySQL·SQL Server 모두
이 문장을 거부합니다. 본 포팅은 모델 쪽 규칙에 맞춰 소비자들을 수정했습니다.

```sql
-- 포팅 (정상 실행)
ALTER TABLE "products"
    ADD CONSTRAINT "fk_products_category"
    FOREIGN KEY ("category_id")
    REFERENCES "categories"("id");
```

같은 원인으로 캔버스의 **FK 배지**가 부모 테이블의 PK에 붙던 문제, 인덱스 어드바이저가
FK 컬럼을 "이미 인덱싱됨"으로 분류하던 문제, 정규화 4NF/5NF 판정이 뒤집히던 문제도 함께 해결됩니다.

관계 방향 규칙은 [`src/core/schema.ts`](src/core/schema.ts) 한 곳에 helper로 정의하고
모든 소비자가 이를 통해서만 관계를 읽도록 정리했습니다.

### 2. CREATE TABLE 안의 인라인 FOREIGN KEY 파싱

원본 `SqlDdlSchemaImporter` 는 테이블 본문을 파싱하는 시점에 아직 해당 테이블을
`tableMap` 에 등록하지 않아, `CREATE TABLE ... FOREIGN KEY (...) REFERENCES ...` 형태의
제약을 전부 버렸습니다. SQLite용 DDL은 이 형식만 사용하므로 **원본은 자신이 내보낸
SQLite DDL을 다시 읽어들이면 관계가 모두 사라졌습니다.**

포팅은 모든 `CREATE TABLE` 을 읽은 뒤 외래 키를 한 번에 해석하는 2-pass 방식으로 바꿔,
전방 참조와 자기 참조까지 정상 처리합니다.

### 3. 컬럼 길이 / 정밀도 파싱

`VARCHAR(255)` 처럼 괄호가 타입 이름에 붙어 있으면 원본은 `DataType = "VARCHAR(255)"`,
`Length = null` 로 읽어 속성 패널에서 길이를 편집할 수 없었습니다.
포팅은 괄호를 분리해 `DataType = "VARCHAR"`, `Length = 255` 로 채웁니다.
(재내보내기 결과 문자열은 동일합니다.)

### 4. SQLite `.db` 내보내기의 기본값 변환

스키마를 다른 DB로 전환해도 컬럼 타입·기본값은 그대로 유지됩니다(원본과 동일).
다만 PostgreSQL 스키마의 `DEFAULT NOW()` 는 SQLite가 파싱하지 못해
`CREATE TABLE` 자체가 실패했습니다 — 기본 제공 OnlineShop Sample조차 `.db` 로
내보낼 수 없었습니다. `.db` 생성 경로에 한해 `NOW()` · `GETDATE()` · `NEWID()` 등을
SQLite 등가 표현으로 변환합니다. **SQL 텍스트 내보내기는 원본 그대로 유지**합니다.

또한 인라인 `UNIQUE` 컬럼은 SQLite에서 `sqlite_autoindex_*` 만 생성하는데 원본은 이를
건너뛰어 UNIQUE 정보를 잃었습니다. PK 컬럼은 별도로 걸러내므로 이 제외 규칙을 없앴습니다.

### 그 외 사소한 개선

- 관계 이름 라벨을 테이블보다 **위에** 그려 글자가 잘리지 않습니다.
- `.mdprj` 의 UTF-8 BOM(원본 `File.WriteAllText` 가 생성)을 읽을 때 제거합니다.
- **격자 대비 상향** — 원본 `ModernTheme` 의 격자선 불투명도(라이트 4%, 다크 6%)는
  거의 보이지 않아, 툴바 격자 토글을 켜도 변화를 알 수 없었습니다. 라이트 7% / 다크 9%
  (major는 14% / 17%)로 올렸습니다. 이 두 값만 원본과 다릅니다.

---

## 원본에서 제외된 기능

| 기능 | 사유 |
|------|------|
| Access (`.mdb` / `.accdb`) 가져오기 | Windows 전용 ACE OLEDB 드라이버 필요. Access에서 `.sql` 로 내보낸 뒤 가져오세요. |
| SQL Server (`.mdf`) 가져오기 | SQL Server LocalDB 엔진 필요. SSMS 스크립트(`.sql`)를 사용하세요. |
| SQLCipher 암호화 SQLite | `sql.js` 가 SQLCipher를 지원하지 않습니다. 감지 시 안내 메시지를 표시합니다. |
| AVIF 이미지 내보내기 | 브라우저·Chromium에 AVIF 인코더가 없습니다. PNG/WebP를 사용하세요. |

위 형식은 감지 시 원인과 대안을 설명하는 오류 대화상자를 표시합니다.

## 주요 기능

- **ER 다이어그램 편집** — 테이블 배치, 1:1 / 1:N / N:M 관계, 컬럼 속성 편집, Crow's Foot 표기법
- **관계선 스타일** — 직선 / 곡선(3차 Bezier) / 꺾은선(직교). 곡선은 제어점, 꺾은선은 구간 중점을 드래그
- **캔버스 조작** — 빈 영역 드래그로 팬, 스페이스+드래그, 휠 확대/축소(커서 기준), 전체 맞춤, 눈금자, 격자/스냅
- **실행 취소 / 다시 실행** — 최대 50단계
- **DB 파일 가져오기** — SQLite, Vector Index(Faiss / hnswlib), SQL DDL, `.mdprj` 프로젝트
- **정규화 검사** — 1NF · 2NF · 3NF · BCNF · 4NF · 5NF를 개별 선택하여 검사, 결과 클릭 시 해당 테이블로 이동
- **인덱스 어드바이저** — PK/UNIQUE/FK/이름 패턴 기반으로 `CREATE INDEX` 문 제안
- **내보내기** — Markdown · Word(.docx) · PDF · HTML · Excel(.xlsx) · PNG(투명) · JPEG · WebP ·
  GIF · JSON · SQL DDL · SQLite `.db` · DB별 SQL. 문서 형식(Markdown · Excel · Word · PDF · HTML)에는
  **표지(커버 페이지)** 가 먼저 들어갑니다
- **다국어** — 한국어 / English (원본 `Strings_*.resx` 이식). 툴바 언어 버튼으로 즉시 전환하며,
  현재 언어에 따라 아이콘이 **가 / A** 로 바뀝니다
- **16종 테마** — 라이트 8종 (라이트 · 페이퍼 · 솔라라이즈드 라이트 · 노르드 라이트 · 로즈 ·
  포레스트 · 오션 · 고대비 라이트), 다크 8종 (다크 · 미드나이트 · 솔라라이즈드 다크 · 노르드 ·
  드라큘라 · 원 다크 · 그루브박스 · 고대비 다크). 툴바 분할 버튼(순환 + 직접 선택) ·
  **보기 → 테마** · 설정의 미리보기 그리드에서 선택
- **아이콘 UI** — 메뉴바·메뉴 항목·대화상자 타이틀바·창 타이틀바 모두 아이콘 표시
- **독립 창 대화상자** — 편집·설정·정보 등 모든 대화상자가 자체 타이틀바와 아이콘을 가진
  별도의 OS 창으로 열립니다. 창 크기는 내용에 맞춰 자동 계산되어 **스크롤바가 생기지 않으며**,
  필요하면 직접 크기를 조절할 수 있습니다

## 프로젝트 구조

```
├── assets/            # 프로그램·문서 아이콘 (make:icons 가 생성)
├── doc/               # 사용자 설명서 · 튜토리얼 (한/영) — 원본
├── public/doc/        # 설명서 창 뷰어 (index.html · viewer.js · viewer.css) + 문서 사본
├── src/
│   ├── components/    # 캔버스, 대화 상자, 시작 화면, 테마 설정 창, 인쇄 창 …
│   ├── core/          # 플랫폼 독립 로직 (스키마, 분석, 내보내기, 예제 20개)
│   ├── hooks/         # 앱 상태, 파일 동작
│   ├── platform/      # 호스트 추상화 (TauriHost / WebHost)
│   ├── render/        # 캔버스 그리기, 테마 40개 + 사용자 정의
│   └── styles/        # global.css, shell.css(창 크롬·시작 화면·인쇄 창)
├── src-tauri/         # Tauri 셸 (Rust)
│   └── src/           # lib.rs(창·명령), files.rs, popout.rs(대화 상자·인쇄 창), print.rs
├── scripts/           # start · dev · platform-build · build-docs · make-icons …
├── template/          # 예제 출력 파일
└── test/              # node 기반 테스트
```

### 설계 원칙

- **`src/core` 는 플랫폼에 의존하지 않습니다.** 브라우저·Tauri 웹뷰·Node 테스트 러너에서 그대로 동작합니다.
- **호스트 추상화** — 파일 대화 상자와 입출력은 `Host` 인터페이스 뒤에 있습니다. Tauri는 Rust 명령
  (바이트는 base64), 웹은 File System Access API(미지원 시 다운로드)로 구현합니다.
- **대화 상자와 인쇄 창은 진짜 창** — `window.open("about:blank#dialog-N")` 으로 Rust 셸이 테두리 없는
  자식 창을 만들고, React 포털로 같은 상태를 그대로 그립니다. 대화 상자는 내용에 맞춰 크기를 정하고
  메인 창을 잠그며, 인쇄 창은 크기 조절이 되고 메인 창을 잠그지 않습니다.

### 주요 의존성

| 패키지 | 용도 |
|--------|------|
| react · react-dom | UI |
| @tauri-apps/api · @tauri-apps/cli · tauri-plugin-dialog | 데스크톱 셸 |
| sql.js | SQLite 읽기/쓰기 (WASM) |
| docx · exceljs | Word · Excel 보고서 |
| gifenc | GIF 내보내기 |
| webview2-com · windows (Rust) | Windows 인쇄 · PDF (WebView2) |

## 설정 및 파일 위치

| 항목 | 데스크톱 | 웹 |
|------|----------|-----|
| 설정 · 사용자 정의 테마 | `<데이터 폴더>/settings.json` | localStorage |
| 최근 파일 | `<데이터 폴더>/recent.json` | 지원 안 함 |
| 창 위치 · 크기 | `<데이터 폴더>/window.json` | — |

데이터 폴더: Windows `%APPDATA%MyDBTools`, macOS `~/Library/Application Support/MyDBTools`, Linux
`~/.config/MyDBTools` (이전 Electron 판과 같은 폴더). 시험 실행은 `DBTOOLS_DATA_DIR` 로 다른 폴더를 쓰며,
이때는 단일 실행 잠금도 끕니다.

## 문제 해결

### 창이 뜨지 않습니다

창은 페이지가 그려진 뒤에 나타납니다(흰 화면 깜빡임 방지). 페이지가 8초 안에 응답하지 않으면 그래도
창을 보여 줍니다. 빈 창이면 `npm start` 터미널의 Vite 오류를 확인하세요.

### 빌드했는데 루트에 설치 파일이 없습니다

`npx tauri build` 를 직접 실행하면 복사 단계가 없습니다. `npm run build:win` 등을 쓰세요.

## 문서

- [doc/UsersGuide.md](doc/UsersGuide.md) · [doc/UsersGuide.en.md](doc/UsersGuide.en.md) — 사용자 설명서
- [doc/Tutorial.md](doc/Tutorial.md) · [doc/Tutorial.en.md](doc/Tutorial.en.md) — 튜토리얼
- [Architecture.md](Architecture.md) — 모듈 구조와 포팅 매핑 (Electron 시절 기준, 셸 부분은 README 가 최신)
