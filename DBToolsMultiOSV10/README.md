# DBToolsMultiOSV10

[DBToolsWinV10](../DBToolsWinV10)(Windows Forms / .NET 10)를 **JavaScript(TypeScript)** 로 다시 구현한
ER 다이어그램 · 데이터베이스 스키마 설계 도구입니다. **웹 브라우저, Windows, macOS, Linux** 에서
같은 코드로 동작합니다.

테이블·컬럼·관계를 시각적으로 편집하고, 1NF~5NF 정규화 검사와 인덱스 어드바이저를 제공하며,
SQLite / PostgreSQL / MySQL / MariaDB / SQL Server / FAISS(Vector DB) 형식의 DDL 생성과
DB 파일 가져오기를 지원합니다.

---

## 실행 환경

| 대상 | 요구 사항 |
|------|-----------|
| 웹 | 최신 Chrome · Edge · Firefox · Safari |
| 데스크톱 | Windows 10/11 (x64), macOS 11+, Linux (AppImage / deb) |
| 개발 | Node.js 20 이상 |

## 빠른 시작

```bash
npm install

npm start          # Electron 데스크톱 앱 (Vite 개발 서버 + 최신 코드 즉시 반영)
npm run web        # 브라우저 전용 개발 서버 (http://127.0.0.1:5174)
```

`npm start` 는 Electron 메인 프로세스를 컴파일한 뒤 Vite 개발 서버와 함께 실행하므로
**실행할 때마다 항상 최신 수정 사항이 반영됩니다.**

빌드된 결과물을 그대로 확인하려면 개발 서버 없이 실행합니다.

```bash
npm run build && npm run electron:start
```

> **개발 서버 주소는 `http://127.0.0.1:5174` 로 고정되어 있습니다.**
> `localhost` 는 `127.0.0.1`(IPv4)과 `::1`(IPv6) 사이에서 모호하고, Node와 Chromium이
> 서로 다른 쪽을 고르면 Electron 창이 빈 화면으로 뜹니다. 그래서 `vite.config.ts` 의
> `server.host`, `wait-on` 대상, Electron이 여는 주소를 모두 명시적인 IPv4로 통일했습니다.

## 빌드

```bash
npm run build          # 웹 번들(dist/) + Electron 메인(dist-electron/)
npm run build:web      # 웹 전용 정적 번들 — dist/ 를 그대로 정적 호스팅하면 됩니다

npm run build:win      # Windows NSIS 설치 파일
npm run build:mac      # macOS DMG
npm run build:linux    # Linux AppImage + deb
```

설치 패키지는 `release/` 에 생성된 뒤 **프로젝트 루트로 복사**됩니다
(`npm run copy:installer` 가 각 빌드 스크립트 끝에 자동으로 실행됩니다).
따라서 빌드가 끝나면 루트에서 바로 다음과 같은 파일을 볼 수 있습니다.

```
DBToolsMultiOSV10/
├── DBTools Setup 1.0.0.exe      ← Windows
├── DBTools-1.0.0.dmg            ← macOS
├── DBTools-1.0.0.AppImage       ← Linux
└── release/                     ← electron-builder 원본 출력 (그대로 보존)
```

복사만 다시 하려면 `npm run copy:installer` 를 실행합니다.
`*-unpacked/` 폴더와 `.blockmap` 업데이트 메타데이터는 배포물이 아니므로 제외됩니다.
루트에 복사된 설치 파일은 `.gitignore` 처리되어 있습니다.

Windows 설치 파일은 바탕 화면·시작 메뉴 바로 가기, `.mdprj` 파일 연결,
제거 시 작업 데이터 삭제 옵션을 포함합니다.

### 생성물 다시 만들기

```bash
npm run make:icons     # build/icon.ico, icon.png, file-icon.ico, icons/*.png
npm run make:template  # template/OnlineShop_*.{mdprj,sql,db,md}
```

두 스크립트 모두 외부 이미지 라이브러리나 바이너리 자산 없이 **코드로** 결과물을 만듭니다
(`make-icons.mjs` 는 PNG 인코더와 ICO 컨테이너를 직접 구현합니다).
다만 `build/` 와 `template/` 는 **저장소에 포함**되어 있어, 받은 직후
`npm install && npm start` 만으로 바로 실행됩니다. 아이콘 모양이나 Sample 스키마를
바꿨을 때만 다시 실행하면 됩니다.

## 테스트

```bash
npm test                    # test/ 아래 모든 테스트 (197건)
npm test -- <이름>          # 스위트 이름으로 필터 (예: npm test -- normalization)
npm run test:integration    # SQLite 통합 테스트만
npm run test:fidelity       # 원본 출력 대조만
npm run test:watch          # 파일 변경 시 자동 재실행
npm run typecheck           # 렌더러 + Electron 타입 검사
```

테스트는 `test/` 에 있으며 의존성이 없습니다(러너를 직접 구현했습니다).
`scripts/ts-loader.mjs` 가 `src/**/*.ts` 를 빌드 없이 그대로 불러오므로
**테스트가 실제 소스를 검증**합니다.

결과는 파일별로 묶여 색으로 표시되고, 마지막에 통과 비율 막대와 스위트·테스트·
파일·소요시간 요약, 실패 목록이 출력됩니다. 색은 터미널일 때만 켜집니다 —
`NO_COLOR=1` 로 끄고, 파이프로 넘길 때는 `FORCE_COLOR=1` 로 켤 수 있습니다.

```
test/
├── index.mjs            # *.test.mjs 를 찾아 실행
├── helpers/
│   ├── runner.mjs       # suite / test / expect
│   └── core.mjs         # 애플리케이션 모듈 진입점
├── unit/                # 모델·기하·분석·SQL·테마·i18n·벡터 인덱스
└── integration/         # SQLite 왕복, 문서 내보내기, 원본 대조
```

원본 대조(`fidelity`)는 C# 앱이 생성해 둔 `../DBToolsWinV10/Template/*.sql` 및
`OnlineShop_report.md` 와 **바이트 단위로** 비교합니다. CREATE TABLE 섹션, Markdown 보고서
본문, 프로젝트 JSON 구조가 모두 일치합니다(외래 키 방향만 의도적으로 다릅니다 — 아래 참고).
원본 프로젝트가 옆에 없으면 이 스위트는 자동으로 건너뜁니다.

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
- Vite 개발 서버가 없으면 Electron이 빌드된 `dist/` 를 자동으로 불러옵니다.
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
- **내보내기** — Markdown · Excel(.xlsx) · Word(.docx) · PDF · PNG(투명) · JPEG · WebP · GIF · JSON ·
  SQL DDL · SQLite `.db` · DB별 SQL. 문서 형식(Markdown · Excel · Word · PDF)에는
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

## 화면 구성

```
┌──────────────────────────────────────────────────────────────────────┐
│  ▣ 파일   ✎ 편집   ⛶ 보기   ▥ 분석   ? 도움말     ← 모두 아이콘 표시   │
├──────────────────────────────────────────────────────────────────────┤
│  툴바: 새로 만들기 · 열기 · DB · 저장 │ 실행취소/다시실행 │ 내보내기 │   │
│        테이블 · 관계 · 선 스타일 │ 줌 · 배율 · 격자 · 자동 배치 │      │
│        분석 · 보고서 · DB 종류 · Sample · 테마 · 언어 ⋯⋯ 설정 · 패널 · 정보 │
├──────────┬───────────────────────────────────────┬───────────────────┤
│  도구    │         ER 다이어그램 캔버스           │  구조 / 정규화 /  │
│  패널    │         (눈금자 · 테이블 · 관계선)     │  인덱스 어드바이저 │
│          │                                       │───────────────────│
│          │                                       │  속성 패널        │
├──────────┴───────────────────────────────────────┴───────────────────┤
│  상태 표시줄 (스키마 · DB 종류 · 테이블/관계 수 · 변경됨 · 메시지)      │
└──────────────────────────────────────────────────────────────────────┘
```

### 툴바 빠른 전환

툴바는 **항상 한 줄**로 표시됩니다. 버튼이 잘리지 않도록 창의 최소 너비를 툴바 내용에서
측정해 자동으로 설정하며, 오른쪽 끝에는 **설정 · 우측 패널 토글 · 프로그램 정보** 세 개만
배치하고 나머지는 모두 왼쪽에 둡니다.

| 버튼 | 동작 |
|------|------|
| 격자 | 캔버스 격자 표시/숨김 (켜지면 버튼 강조) |
| 자동 배치 | 모든 테이블을 격자로 재배열하고 화면에 맞춤 |
| 배율 % | 클릭하면 100%로 복원 |
| 테마 (분할 버튼) | 왼쪽을 누르면 **다음 테마로 순환**, 오른쪽 ▾ 로 **16종 중 직접 선택** |
| 언어 | 한국어 ↔ English 즉시 전환. 현재 언어에 따라 아이콘이 **가 / A** 로 바뀝니다 |

## 단축키

| 단축키 | 동작 | 단축키 | 동작 |
|--------|------|--------|------|
| Ctrl+N | 새 프로젝트 | Ctrl+T | 테이블 추가 |
| Ctrl+O | 프로젝트 열기 | Ctrl+L | 컬럼 추가 |
| Ctrl+Shift+O | DB 파일 열기 | Ctrl+R | 관계 추가 |
| Ctrl+S | 저장 | F2 | 선택 항목 편집 |
| Ctrl+Shift+S | 다른 이름으로 저장 | Delete | 선택 항목 삭제 |
| Ctrl+Z / Ctrl+Y | 실행 취소 / 다시 실행 | Esc | 선택 도구로 복귀 |
| Ctrl++ / Ctrl+- | 확대 / 축소 | F5 | 정규화 검사 |
| Ctrl+0 | 전체 맞춤 | Ctrl+Shift+R | 보고서 작성 |

## 프로젝트 구조

```
DBToolsMultiOSV10/
├── electron/          # Electron 메인 프로세스 + preload 브리지
├── scripts/           # 아이콘·Template 생성, 테스트 러너
├── src/
│   ├── core/          # 플랫폼 독립 로직 (브라우저/Node 양쪽에서 동작)
│   │   ├── analysis/  # 정규화 분석, 인덱스 어드바이저, Markdown 보고서
│   │   ├── export/    # SQL, SQLite DB, 이미지, Excel, Word, HTML/PDF
│   │   ├── import/    # SQL DDL 파서, SQLite 리더, Vector Index 리더
│   │   ├── geometry.ts, relationshipPath.ts, layout.ts, schema.ts …
│   ├── platform/      # 호스트 추상화 (ElectronHost / WebHost)
│   ├── render/        # 테마 팔레트 + Canvas 2D 다이어그램 렌더러
│   ├── components/    # React UI
│   ├── hooks/         # 앱 상태, 파일·내보내기 액션
│   └── i18n/          # ko / en 문자열 (원본 resx 이식)
├── template/          # OnlineShop 예제 파일 (생성물 · 커밋됨)
└── build/             # 아이콘 (생성물 · 커밋됨)
```

`scripts/` 안의 역할은 다음과 같습니다.

| 파일 | 역할 |
|------|------|
| `start-electron.mjs` | `ELECTRON_RUN_AS_NODE` 를 제거하고 Electron 실행 |
| `copy-installer.mjs` | `release/` 의 설치 파일을 프로젝트 루트로 복사 |
| `make-icons.mjs` | 아이콘 생성 (PNG/ICO 인코더 자체 구현) |
| `make-template.mjs` | Sample 파일 생성 (내보내기 엔진 재사용) |
| `ts-loader.mjs` | Node에서 `src/**/*.ts` 를 빌드 없이 import |
| `ts-loader.mjs` | (위 참조) 테스트가 `src/**/*.ts` 를 빌드 없이 불러오게 함 |

### 설계 원칙

- **`src/core` 는 플랫폼에 의존하지 않습니다.** DOM·Electron·Node API를 직접 쓰지 않으므로
  브라우저·Electron 렌더러·Node 테스트 러너에서 그대로 동작합니다.
  (캔버스가 필요한 텍스트 측정만 없을 때 근사치로 대체합니다.)
- **파일 입출력은 전부 `src/platform` 의 `Host` 인터페이스를 통과합니다.**
  Electron은 IPC + `fs`, 웹은 File System Access API(미지원 시 다운로드)로 구현되어 있어
  UI 코드에는 플랫폼 분기가 없습니다.
- **다이어그램 렌더러는 화면과 이미지 내보내기가 같은 코드를 씁니다.**

### 주요 의존성

| 패키지 | 용도 |
|--------|------|
| react · react-dom | UI |
| sql.js | SQLite 읽기/쓰기 (WASM) |
| exceljs | Excel(.xlsx) 내보내기 |
| docx | Word(.docx) 내보내기 |
| gifenc | GIF 인코딩 (브라우저 캔버스는 GIF를 지원하지 않음) |
| electron · electron-builder | 데스크톱 패키징 |

PDF는 별도 라이브러리 없이 Chromium의 인쇄 엔진(`webContents.printToPDF` / `window.print()`)을
사용합니다. 한글 폰트를 번들할 필요가 없고 결과가 OS 폰트와 일치합니다.

## 설정 및 파일 위치

| 항목 | Electron | 웹 |
|------|----------|-----|
| 설정 | `<userData>/settings.json` | `localStorage["dbtools.settings"]` |
| 최근 파일 | `<userData>/recent.json` | 사용 안 함 (경로 접근 불가) |

`<userData>` 는 Windows `%AppData%\DBTools`, macOS `~/Library/Application Support/DBTools`,
Linux `~/.config/DBTools` 입니다.

## 문제 해결

### `npm start` 했는데 창이 비어 있습니다

터미널 출력을 먼저 확인하세요. `[dbtools] loading dev server ...` 가 보이면 개발 서버를
정상적으로 연 것이고, `[dbtools] failed to load ...` 는 실패 원인과 URL을 알려줍니다.
로드가 실패하면 앱은 빈 창 대신 오류 안내 화면을 표시합니다.

과거에 이 증상을 만든 원인 두 가지는 모두 해결되어 있습니다.

- `sql.js` 가 개발 모드에서 로드되지 않던 문제 — `vite.config.ts` 의
  `optimizeDeps.include` 에 `sql.js` 가 반드시 있어야 합니다. UMD/CommonJS 패키지라
  Vite가 미리 번들하지 않으면 개발 서버에서만 default export 를 찾지 못합니다.
- `localhost` 의 IPv4/IPv6 불일치 — 개발 서버 주소를 `127.0.0.1` 로 고정했습니다.

### `Cannot read properties of undefined (reading 'isPackaged')`

셸에 `ELECTRON_RUN_AS_NODE=1` 이 설정되어 있으면 Electron 바이너리가 일반 Node로
동작합니다. `scripts/start-electron.mjs` 런처가 이 변수를 제거하므로 `npm start` 는
영향을 받지 않습니다. `electron .` 을 직접 실행할 때만 주의하세요.

### 포트 5174가 이미 사용 중입니다

이전 `npm start` 의 Vite 프로세스가 남아 있는 경우입니다. `strictPort: true` 라
다른 포트로 옮겨가지 않고 실패합니다. 남은 Node/Electron 프로세스를 종료하세요.

### 빌드했는데 루트에 설치 파일이 없습니다

`npm run build:win` (또는 `build:mac` / `build:linux`) 를 사용하세요.
`electron-builder` 를 직접 호출하면 복사 단계가 실행되지 않습니다.
`release/` 에 결과물이 있다면 `npm run copy:installer` 만 따로 실행해도 됩니다.

## 문서

- [UsersGuide.md](UsersGuide.md) — 기능별 사용 설명
- [Architecture.md](Architecture.md) — 모듈 구조와 포팅 매핑
