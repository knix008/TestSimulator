# DBToolsMultiOSV10 — 구조 문서

원본 [DBToolsWinV10](../DBToolsWinV10) (C# / WinForms, 약 21,000줄)을 TypeScript로 이식한
구조와, 원본 파일이 어디로 옮겨졌는지를 정리합니다.

---

## 1. 계층 구조

```
┌───────────────────────────────────────────────────────────────┐
│  src/components  ·  src/hooks          React UI               │
│    App.tsx, DiagramCanvas, 대화상자, 패널, 메뉴, 아이콘         │
└───────────────┬───────────────────────────────┬───────────────┘
                │                               │
┌───────────────▼───────────────┐ ┌─────────────▼───────────────┐
│  src/render                   │ │  src/platform               │
│    theme.ts  (16종 팔레트)     │ │    Host 인터페이스           │
│    drawDiagram.ts (Canvas 2D) │ │    ElectronHost / WebHost   │
└───────────────┬───────────────┘ └─────────────┬───────────────┘
                │                               │
┌───────────────▼───────────────────────────────▼───────────────┐
│  src/core — 플랫폼 독립 로직                                    │
│    모델 · 기하 · 관계 경로 · 배치 · 분석 · 가져오기 · 내보내기     │
└───────────────────────────────────────────────────────────────┘
```

핵심 규칙은 **`src/core` 가 DOM·Electron·Node API에 의존하지 않는 것**입니다.
덕분에 같은 코드가 브라우저, Electron 렌더러, 그리고 Node 테스트 러너에서 그대로 실행됩니다.
유일한 예외는 텍스트 폭 측정으로, 캔버스가 없으면 문자 폭 근사치로 대체합니다
(`src/core/layout.ts`의 `measureText`).

---

## 2. 원본 → 포팅 매핑

### 모델 · 직렬화

| DBToolsWinV10 | DBToolsMultiOSV10 |
|---|---|
| `Models/DbSchema.cs`, `DbTable.cs`, `DbColumn.cs`, `DbRelationship.cs` | `src/types.ts` (타입) + `src/core/schema.ts` (생성·복제·조회) |
| `Models/DataTypeProvider.cs` | `src/core/dataTypes.ts` |
| `Models/DbTargetType*.cs`, `RelationshipType.cs`, `RelationshipLineStyle.cs`, `ToolMode.cs` | `src/types.ts` (문자열 리터럴 유니온) |
| `Serialization/SchemaSerializer.cs` | `src/core/serializer.ts` |
| `App/UndoRedoManager.cs` | `src/core/undoRedo.ts` |
| `App/AppSettings.cs`, `RecentFilesManager.cs` | `src/core/settings.ts` |

C#의 `enum` 은 문자열 리터럴 유니온으로 옮겼습니다. `.mdprj` 가 원래 `JsonStringEnumConverter`
로 열거형을 문자열로 저장했기 때문에, 이 선택으로 **파일 형식이 원본과 완전히 호환**됩니다.

### 분석

| DBToolsWinV10 | DBToolsMultiOSV10 |
|---|---|
| `Analysis/NormalizationAnalyzer.cs` | `src/core/analysis/normalization.ts` |
| `Analysis/NormalizationLevel(s).cs`, `NormalizationLabels.cs`, `IssueSeverity.cs` | 같은 파일에 통합 |
| `Analysis/IndexAdvisor.cs`, `IndexSuggestion.cs` | `src/core/analysis/indexAdvisor.ts` |
| `Analysis/SchemaReportWriter.cs` | `src/core/analysis/report.ts` |

`[Flags] NormalizationLevels` 비트 플래그는 `NormalizationLevel[]` 배열로 바꿨습니다.
검사 6종(1NF · 2NF · 3NF · BCNF · 4NF · 5NF)의 판정 로직과 메시지 문구는 원본 그대로입니다.

### 가져오기

| DBToolsWinV10 | DBToolsMultiOSV10 |
|---|---|
| `Import/SqlDdlSchemaImporter.cs` | `src/core/import/sqlDdl.ts` |
| `Import/SqliteSchemaImporter.cs`, `SqliteFileDetector.cs` | `src/core/import/sqliteSchema.ts` |
| `Import/DbFileFormatDetector.cs`, `DatabaseFileImporter.cs`, `DbFileFormat.cs` | `src/core/import/databaseFile.ts` |
| `Import/SchemaLayout.cs` | `src/core/layout.ts` |
| `Import/SchemaRelationshipBuilder.cs` | `src/core/import/sqlDdl.ts`의 `addForeignKey` |
| `Import/VectorIndex/Faiss*.cs` | `src/core/import/vectorIndex/{faiss,fourcc,reader}.ts` |
| `Import/VectorIndex/HnswIndexReader.cs`, `VectorIndexSchemaBuilder.cs`, `VectorIndexFileDetector.cs` | `src/core/import/vectorIndex/index.ts` |
| `Import/AccessSchemaImporter.cs`, `SqlServerFileSchemaImporter.cs` | 이식하지 않음 (네이티브 드라이버 의존, README 참고) |

`Microsoft.Data.Sqlite` → `sql.js`(WASM), `BinaryReader` → `DataView` 기반
`BinaryCursor`(`vectorIndex/reader.ts`)로 대체했습니다. Faiss 바이너리 파서는
fourcc 테이블과 스킵 규칙을 그대로 옮겨 동일한 인덱스 형식을 읽습니다.

> `sql.js` 는 UMD/CommonJS 패키지라 `vite.config.ts` 의 `optimizeDeps.include` 에
> 반드시 포함되어야 합니다. 제외하면 프로덕션 빌드(Rollup)는 통과하지만 개발 서버에서
> default export 를 찾지 못해 앱이 마운트되지 않습니다.

### 내보내기

| DBToolsWinV10 | DBToolsMultiOSV10 |
|---|---|
| `Export/SqlExporter.cs` | `src/core/export/sqlExporter.ts` |
| `Export/SchemaExportHelper.cs`, `SqlStatementSplitter.cs` | `src/core/export/schemaExportHelper.ts` |
| `Export/SqliteDatabaseExporter.cs` | `src/core/export/sqliteDatabase.ts` |
| `Export/MarkdownExporter.cs` | `src/core/analysis/report.ts` + `useFileActions` |
| (원본에 없음) 표지 | `src/core/export/coverPage.ts` |
| `Export/ExcelExporter.cs` (ClosedXML) | `src/core/export/excel.ts` (ExcelJS) |
| `Export/WordExporter.cs` (OpenXML SDK) | `src/core/export/word.ts` (docx) |
| `Export/PdfExporter.cs`, `PdfFontResolver.cs` (PDFsharp) | `src/core/export/htmlReport.ts` + Chromium 인쇄 |
| `Export/DiagramImageExporter.cs` (ImageSharp) | `src/core/export/diagramImage.ts` (Canvas + gifenc) |

**표지**는 `coverPage.ts` 의 `buildCover()` 가 한 번 만들어 네 형식이 함께 씁니다.
형식마다 "페이지"의 의미가 다르므로 표현만 달리합니다 — HTML/PDF는
`page-break-after: always` 를 가진 섹션, Word는 문단 뒤 `PageBreak`, Excel은 맨 앞의
**표지** 시트, Markdown은 제목 블록과 `---` 구분선입니다.

Markdown 본문은 표지 아래부터 **원본과 바이트 단위로 동일**하게 유지되며,
`test/integration/fidelity.test.mjs` 가 문서 제목 줄부터 잘라 비교해 이를 보증합니다.

**PDF**는 라이브러리를 쓰지 않고 HTML을 만들어 Chromium이 인쇄하게 했습니다
(Electron은 `webContents.printToPDF`, 웹은 숨은 iframe의 `window.print()`).
원본은 PDFsharp에 한글 폰트를 따로 해석해 넣어야 했지만, 이 방식은 OS 폰트를
그대로 쓰므로 폰트 번들이 필요 없습니다.

### UI

| DBToolsWinV10 | DBToolsMultiOSV10 |
|---|---|
| `MainForm.cs` (4,561줄) | `src/App.tsx` + `src/hooks/useAppState.ts` + `src/hooks/useFileActions.ts` |
| `MainForm.Export*.cs` | `src/hooks/useFileActions.ts` + `App.tsx`의 `exportItems` |
| `Controls/DiagramCanvas.cs` (2,240줄) | `src/components/DiagramCanvas.tsx` (입력) + `src/render/drawDiagram.ts` (그리기) |
| `Controls/RelationshipPathBuilder.cs` | `src/core/relationshipPath.ts` |
| `Controls/CanvasRuler.cs` | `src/components/CanvasRuler.tsx` |
| `Controls/BufferedPropertyGrid` + `LocalizedAttributes` | `src/components/PropertyGrid.tsx` |
| `Dialogs/TableEditDialog.cs` | `src/components/TableEditDialog.tsx` |
| `Dialogs/ColumnEditDialog.cs` | `src/components/ColumnEditDialog.tsx` |
| `Dialogs/RelationshipDialog.cs` | `src/components/RelationshipEditDialog.tsx` |
| `Dialogs/PreferencesDialog.cs` | `src/components/PreferencesDialog.tsx` |
| `Dialogs/AboutDialog.cs`, `ErrorDialog.cs` | `src/components/SimpleDialogs.tsx` |
| `ToolStrip` / `MenuStrip` | `src/components/Menu.tsx` (`MenuList` · `Dropdown` · `ContextMenu`) |
| `App/ModernTheme.cs`, `ScrollBarTheme.cs`, `NativeControlTheme.cs` | `src/render/theme.ts` + `src/styles/global.css` |
| `App/IconProvider.cs`, `Assets/*.ico` | `src/components/Icons.tsx` (인라인 SVG), `scripts/make-icons.mjs` |
| `App/L.cs`, `Localization/Strings_*.resx` | `src/i18n/index.ts`, `src/i18n/locales/{ko,en}.json` |
| `Program.cs` | `src/main.tsx` + `electron/main.ts` |
| `installer/*.wixproj`, `Product.wxs` (WiX MSI) | `package.json`의 `build` 섹션 (electron-builder NSIS) |

---

## 3. 테마 시스템 (`src/render/theme.ts`)

원본은 `ModernTheme.cs` 의 정적 프로퍼티로 라이트/다크 2종만 제공했습니다.
이식판은 **16종**을 제공하며, 구조는 두 층입니다.

```
ThemeSeed (12~16개 씨앗 색상)  ──buildPalette()──▶  Palette (45개 키)
                                                        │
LIGHT / DARK 리터럴 팔레트 ─────────────────────────────┘
                                                        ▼
                                       THEMES: ThemeDefinition[]
                                                        │
                              ┌─────────────────────────┴──────────────┐
                              ▼                                        ▼
                 applyPaletteToDocument()                    getPalette(id)
                 → :root CSS 커스텀 프로퍼티                  → Canvas 2D 렌더러
```

- `light` 와 `dark` 는 `ModernTheme.cs` 를 **값 그대로** 옮긴 리터럴 팔레트입니다.
- 나머지 14종은 `buildPalette(seed)` 가 씨앗 색상에서 45개 키를 파생시킵니다
  (`mix()` 로 표면·테두리·머티드 텍스트·행 교차색·스크롤바 등을 계산).
  16 × 45 = 720개 값을 손으로 관리하지 않기 위한 선택입니다.
- `ThemeId` 는 16개 문자열 리터럴 유니온입니다. 기존 설정에 저장된 `'light'` / `'dark'`
  가 그대로 유효한 id 라서 **마이그레이션이 필요 없습니다**. 알 수 없는 값은
  `isThemeId()` 로 걸러 기본값으로 되돌립니다.

UI는 CSS 커스텀 프로퍼티(`--panel-background` 등)를 통해, 캔버스 렌더러는 같은
`Palette` 객체를 직접 읽어 색을 씁니다. 그래서 패널과 다이어그램의 색이 항상 일치하고,
이미지로 내보낼 때도 현재 테마가 그대로 반영됩니다.

테마 선택 UI는 세 곳이며 모두 같은 `THEMES` 배열을 씁니다 — 툴바 드롭다운,
**보기 → 테마** 서브메뉴(색상 칩), 설정의 4×4 미리보기 그리드.

### 대화상자 = 별도의 창

모든 대화상자는 **독립된 OS 창**으로 열립니다. 자체 타이틀바·아이콘·작업 표시줄 항목을
가지며, 크기 조절도 됩니다.

```
App.tsx  ──▶  Dialog  ──▶  PopupWindow  ──window.open('', '', features)──▶  새 창
                 │                                    │
                 │                          createPortal(children, 새 창의 <div>)
                 └── 팝업 차단 시 ──▶ InPageDialog (기존 모달로 자동 대체)
```

`window.open` 은 두 호스트 모두에서 진짜 최상위 창을 만듭니다. Electron 에서는
`setWindowOpenHandler` 가 `about:blank` 요청을 가로채 `BrowserWindow` 로 만들고
(아이콘·부모 창·크기를 `overrideBrowserWindowOptions` 로 지정), 브라우저에서는 팝업이 됩니다.

새 창의 document 는 비어 있으므로 `PopupWindow` 가 다음을 처리합니다.

| 항목 | 처리 |
|------|------|
| 스타일 | 여는 창의 `<style>` · `<link rel=stylesheet>` 를 복제 |
| 테마 | 팔레트는 `<html>` 인라인 스타일에 있으므로 복사하고, `MutationObserver` 로 계속 동기화 |
| 크기 | 내용 높이를 측정해 `resizeTo` — **스크롤바가 생기지 않습니다** |
| 닫기 | 창의 `beforeunload` → `onClose`. 메인 창이 닫히면 자식 창도 함께 정리 |
| 키보드 | Esc 로 닫기 |

크기 측정이 까다로운 지점이 하나 있습니다. `.dialog-body` 는 flex 자식이라 창 높이만큼
늘어나므로 `scrollHeight` 가 "늘어난 크기"를 돌려줍니다. 그대로 쓰면 창이 커지기만 하고
줄어들지 못합니다. 그래서 측정 순간에만 `flex: 0 0 auto` 로 바꿔 내용의 자연 높이를 읽고
원래대로 되돌립니다. 언어를 바꾸면 글자 길이가 달라지는데, `MutationObserver` 가 이를
감지해 다시 맞춥니다 — 창 높이를 코드에 상수로 박아두지 않아도 되는 이유입니다.

`width` / `height` prop 은 창이 열릴 때의 초기값일 뿐이고, 최종 크기는 측정으로 정해집니다.

### 툴바

툴바는 `flex-wrap: nowrap` 으로 **항상 한 줄**입니다. 그래서 앱에는 하드한 최소 너비가
생기는데, 그 값은 언어·테마 이름·플랫폼 폰트에 따라 달라지므로 상수로 두지 않고
`useToolbarMinWidth` 가 살아 있는 DOM에서 측정합니다.

```
툴바 자식들의 실제 폭 합계 + padding + gap
        │
        ├─ Electron : IPC → BrowserWindow.setMinimumSize(측정값 + 창 프레임)
        └─ 웹       : document.body.style.minWidth → 잘림 대신 가로 스크롤
```

탄력적으로 줄어들 수 있는 요소는 `.tb-spacer` 하나뿐이고, 나머지는 `flex: 0 0 auto` 라
어떤 버튼도 찌그러지지 않습니다. 스페이서는 **설정 · 우측 패널 토글 · 프로그램 정보**
바로 앞에 놓여, 그 세 개만 오른쪽으로 밀려납니다.

테마 컨트롤은 `SplitButton` 입니다. 왼쪽 절반은 `THEMES` 배열을 순환(라이트 8종 → 다크 8종
→ 처음으로)하고, 오른쪽 캐럿은 16종 목록을 엽니다. 버튼의 팔레트 글리프는 현재 테마의
`accent` 색을 인라인 스타일로 입어서, 같은 테마가 목록에서 보여주는 색상 칩과 정확히
같은 값을 씁니다.

### 아이콘

`Icons.tsx` 는 인라인 SVG 컴포넌트 모음입니다. 모두 `stroke="currentColor"` 라
테마 전환 시 자동으로 색을 따라갑니다. 사용처는 네 곳입니다.

| 위치 | 방법 |
|------|------|
| 메뉴바 상단 항목 | `MenuBarItem` 의 `icon` prop |
| 메뉴 항목 | `MenuItem.icon` (또는 색상 칩 `MenuItem.swatch`) |
| 대화상자 타이틀바 | `Dialog` 의 `icon` prop |
| 툴바 버튼 | 직접 배치 |

창(OS) 타이틀바 아이콘은 `electron/main.ts` 의 `resolveWindowIcon()` 이
`build/icon.ico`(Windows) 또는 `build/icon.png` 를 찾아 `BrowserWindow` 에 넘깁니다.
패키징된 빌드는 electron-builder 가 처리하지만, 개발 실행에서는 이 코드가 없으면
Electron 기본 로고가 표시됩니다.

---

## 4. 플랫폼 추상화

```ts
interface Host {
  kind: 'electron' | 'web';
  openFile(request): Promise<OpenedFile | null>;
  saveFile(request): Promise<string | null>;
  writeFile(path, data): Promise<string | null>;
  readSettings() / writeSettings()
  readRecentFiles() / writeRecentFiles()
  chooseDirectory() / writeFilesToDirectory()
  getStartupFile() / readFileByPath()
  printToPdf(html, name)
  setTitle(title) / onBeforeClose(handler)
}
```

| 동작 | ElectronHost | WebHost |
|------|--------------|---------|
| 열기/저장 | `dialog.showOpenDialog` / `showSaveDialog` + `fs` (IPC) | File System Access API → 없으면 `<input type=file>` / 다운로드 |
| 설정 | `<userData>/settings.json` | `localStorage` |
| 최근 파일 | `<userData>/recent.json` | 미지원 (절대 경로 접근 불가) |
| Sample 일괄 생성 | 폴더 선택 후 일괄 기록 | 파일별 다운로드 |
| PDF | `webContents.printToPDF` | 숨은 iframe + `window.print()` |
| 종료 확인 | `close` 이벤트 가로채기 → 렌더러 확인 → `confirmClose` | `beforeunload` |

UI 코드에는 플랫폼 분기가 없습니다. 유일한 예외는 최근 파일 메뉴로,
웹에서는 항목을 다시 열 수 없으므로 "(최근 파일 없음)" 을 표시합니다.

### Electron 보안 설정

`contextIsolation: true`, `nodeIntegration: false` 로 두고 모든 기능을
`electron/preload.ts` 의 좁은 브리지로만 노출합니다. 렌더러는 Node API에 직접 접근하지 않습니다.
외부 링크는 `setWindowOpenHandler` 로 시스템 브라우저에 넘깁니다.

### 개발 실행 경로

`npm start` 는 `concurrently` 로 Vite 개발 서버와 Electron을 함께 띄웁니다.
여기에 두 가지 안전장치가 있습니다.

1. **주소 고정** — Vite `server.host`, `wait-on` 대상, Electron이 여는 주소를 모두
   `http://127.0.0.1:5174` 로 통일했습니다. 기본값으로 두면 Vite가 IPv6(`::1`)에만
   바인딩되는데, `localhost` 를 Node(`fetch`, `wait-on`)와 Chromium이 서로 다르게
   해석해 창이 비거나 오래된 `dist/` 가 로드됩니다.
2. **환경 변수 격리** — `scripts/start-electron.mjs` 가 `ELECTRON_RUN_AS_NODE` 를
   제거한 뒤 Electron을 spawn 합니다. 이 변수가 셸에 설정되어 있으면 Electron
   바이너리가 일반 Node로 동작해 `app.isPackaged` 접근에서 죽습니다.

`electron/main.ts` 의 `loadRenderer()` 는 개발 서버가 살아 있으면 그쪽을, 아니면
빌드된 `dist/` 를 불러옵니다(이 경우 "stale 가능" 경고를 콘솔에 남깁니다).
로드 자체가 실패하면 `did-fail-load` 핸들러가 **빈 창 대신** 실패한 URL과 오류 코드를
보여주는 안내 화면을 띄웁니다.

---

## 5. 다이어그램 렌더링

`src/render/drawDiagram.ts` 는 원본 `DiagramCanvas.OnPaint` 를 Canvas 2D로 옮긴 것으로,
**화면 표시와 이미지 내보내기가 같은 함수를 사용**합니다. 내보내기는 `plain: true` 로
선택 표시와 경로 핸들만 생략합니다.

그리기는 세 패스로 나뉩니다.

1. 관계선 (테이블 아래)
2. 테이블 상자
3. 관계 이름 라벨 (테이블 위 — 원본과 다른 점, README 참고)

좌표계는 원본과 동일합니다. 헤더 28px, 행 22px, 하단 여백 4px, 기본 폭 210px.
`getTableHeight` · `getConnectionPoint` · 관계 경로 계산은 수식까지 그대로 옮겨
같은 `.mdprj` 를 열면 원본과 같은 그림이 나옵니다.

입력 처리(`DiagramCanvas.tsx`)는 Pointer Events로 통합해 마우스·펜·터치를 함께 지원합니다.

---

## 6. 테스트 전략

테스트는 `test/` 에 있고 외부 의존성이 없습니다. `test/index.mjs` 가 `*.test.mjs` 를
찾아 실행하며, `test/helpers/runner.mjs` 가 `suite` / `test` / `expect` 를 제공합니다.
`test/helpers/colors.mjs` 는 ANSI 스타일과 문자폭 계산(한글은 2칸)을 맡아 리포트의
열을 정렬합니다. `index.mjs` 는 각 파일을 `import` 하기 전에 `setSourceFile()` 로
표시를 남기고 — ESM 은 import 를 한 번에 하나씩 평가하므로 이 표시가 정확합니다 —
러너는 그 값으로 결과를 파일별로 묶습니다.

| 파일 | 검증 대상 |
|------|-----------|
| `unit/model.test.mjs` | 데이터 타입, 스키마 모델, 복제·삭제, 직렬화 왕복·BOM·null 생략 |
| `unit/geometry.test.mjs` | 테이블 기하, 연결점, 3가지 관계선 경로, 히트 테스트, 꺾임점, 자동 배치 |
| `unit/analysis.test.mjs` | 1NF~5NF 각 판정, 레벨 선택, 인덱스 어드바이저 4등급 |
| `unit/sql.test.mjs` | DB별 DDL, 컬럼 제약, 인용·이스케이프, 문장 분리, DDL 파서, 5개 DB 왕복 |
| `unit/ui.test.mjs` | 16종 테마 팔레트 완전성·대비, i18n 키 일치, 실행취소 50단계, 표지 모델 |
| `unit/vectorIndex.test.mjs` | fourcc, 바이너리 커서 경계, hnswlib·Faiss 헤더, 형식 감지 |
| `integration/sqlite.test.mjs` | 생성 DDL을 실제 SQLite에서 실행 → FK 방향·강제·왕복 가져오기 |
| `integration/documents.test.mjs` | Markdown·HTML/PDF·Word·Excel 내보내기와 표지 |
| `integration/fidelity.test.mjs` | 원본 C# 앱 산출물과 바이트 비교 (없으면 자동 건너뜀) |

`scripts/ts-loader.mjs` 는 esbuild로 타입만 제거해 `src/**/*.ts` 를 Node에서 직접
import 할 수 있게 합니다. 별도 빌드 단계 없이 소스를 그대로 시험하며,
Vite 전용 구문(`?url` 에셋 import, 디렉터리 index 해석, JSON import)도 처리합니다.

### 원본 대조 검증

`test/integration/fidelity.test.mjs` 는 이 포팅의 출력을 원본이 실제로 생성해 둔
`../DBToolsWinV10/Template/` 파일과 비교합니다.

- PostgreSQL / MySQL / MariaDB `CREATE TABLE` 섹션 — **바이트 일치**
- `OnlineShop_report.md` — **바이트 일치**
- `OnlineShop.mdprj` — 테이블·컬럼 속성 구조 일치
- `ALTER TABLE` 외래 키 — 의도적으로 다름(원본 결함 수정). 스크립트가 양쪽을 출력해 차이를 명시합니다.

`OnlineShop_sqlserver.sql` 은 원본에서도 `SampleDbGenerator.cs` 안의 하드코딩 상수라
내보내기 엔진의 산출물이 아니므로 비교 대상에서 제외했습니다.

### UI 검증

UI는 자동 테스트에 포함되어 있지 않습니다. 변경 후에는 Electron 앱과 웹 빌드를 직접
띄워 확인했습니다(`playwright-core` 로 창을 열어 클릭·스크린샷·콘솔 오류 수집).
이 드라이버는 일회성이라 저장소에 두지 않았습니다 — 재현이 필요하면
`npm i --no-save playwright-core` 후 `_electron.launch()` 로 `dist-electron/main.js` 를
실행하면 됩니다. 이때도 `ELECTRON_RUN_AS_NODE` 는 지워야 합니다.

---

## 7. 생성물과 저장소

| 경로 | 생성 방법 | 커밋 여부 |
|------|-----------|-----------|
| `build/icon.*`, `build/icons/` | `npm run make:icons` | **커밋** — 바이너리 자산 없이 코드로 생성하지만, 받은 즉시 실행되도록 포함 |
| `template/OnlineShop_*` | `npm run make:template` | **커밋** — 앱이 참조하는 Sample 파일 |
| `dist/`, `dist-electron/` | `npm run build` | 무시 |
| `release/` | `npm run build:win` 등 | 무시 |
| 루트의 `*.exe` · `*.dmg` · `*.AppImage` · `*.deb` | `npm run copy:installer` | 무시 |
| `node_modules/.vite/` | Vite 캐시 | 무시 |

빌드 스크립트(`build:win` / `build:mac` / `build:linux` / `electron:build`)는 마지막에
`copy-installer.mjs` 를 실행해 `release/` 트리 안의 설치 파일을 프로젝트 루트로 올립니다.
`*-unpacked/` 와 `mac*/` 디렉터리(앱 원본 트리)와 `.blockmap`(업데이트 메타데이터)은
배포물이 아니므로 건너뜁니다. `release/` 원본은 그대로 남겨 둡니다.

`make-icons.mjs` 는 PNG 인코더와 ICO 컨테이너를 직접 구현해 외부 이미지 라이브러리
없이 아이콘을 그립니다. `make-template.mjs` 는 포팅된 내보내기 엔진을 그대로 호출하므로
Template 파일이 항상 현재 코드의 출력과 일치합니다.
