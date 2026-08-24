# ARCHITECTURE — ZipMaster Multi-OS

이 문서는 ZipMaster Multi-OS 의 설계 원칙, 모듈 구조, 데이터 흐름, 확장 방법을 설명합니다.

## 1. 설계 목표

- **UI 한 벌, 두 런타임**: React/TypeScript UI 를 브라우저(웹)와 Electron(데스크톱)이 그대로 공유한다.
- **플랫폼 차이는 서비스 경계로 격리**: 파일 접근·압축 엔진·파일 조작처럼 플랫폼마다 다른 부분만 `ArchiveService` 인터페이스 뒤로 숨긴다.
- **기능 패리티 + 확장**: 참고 앱 `ZipMasterWin01`(단일/분할 압축, 자동 병합 해제, 진행률)의 동작을 유지하면서 다중 포맷·다중 OS·파일 탐색/조작으로 확장한다.

## 2. 핵심 추상화 — `ArchiveService`

[src/core/ArchiveService.ts](src/core/ArchiveService.ts)

UI 는 오직 이 인터페이스만 소비하며, 진입점에서 구현체를 주입한다.

```
ArchiveService
  capabilities()           // 포맷별 생성/해제 가능 여부, 분할·네이티브경로 지원
  pickInputs(kind)         // 압축 대상 선택 (데스크톱=다이얼로그, 웹=<input>)
  pickDirectory()          // 디렉터리 하나 선택 (설정의 기본 폴더 지정 등)
  pickArchive()            // 해제 대상 선택 (웹은 분할 조각 다중선택→병합)
  compress(...)            // 압축 (+분할)
  extract(...)             // 해제 (+분할 자동 병합, selection 지정 시 선택 해제)
  listEntries(...)         // 내용 목록
  // ---- 파일 시스템 탐색(왼쪽 트리) ----
  canBrowse()              // 임의 경로 탐색 지원 여부 (웹=false)
  listDrives() / listDir(path)
  listEntriesByPath(path)  // 트리에서 클릭한 아카이브의 내부 목록
  // ---- 파일 조작 ----
  deletePath(path)         // 삭제(휴지통 이동)
  copyPath(src, destDir) / movePath(src, destDir)
  startDrag(path)          // 탐색기 → OS 네이티브 드래그 내보내기
```

두 구현체:

| 구현 | 위치 | 엔진 |
|------|------|------|
| `WebArchiveService` | [src/web/WebArchiveService.ts](src/web/WebArchiveService.ts) | 생성: `fflate`(zip/gz)+`tar-stream`(tar) · 해제: `libarchive.js`(WASM). 탐색/파일 조작은 미지원(`canBrowse()=false`) |
| `ElectronArchiveService` | [src/desktop/ElectronArchiveService.ts](src/desktop/ElectronArchiveService.ts) | preload IPC → 메인 프로세스 `node-7z`+`7zip-bin`, `node:fs` 파일 조작, `shell.trashItem` |

`capabilities()` 와 `canBrowse()` 로 UI 가 사용 불가 기능(예: 웹의 7z/bz2 생성, 웹의 파일 탐색/조작)을 자동으로 비활성화하므로, 새 제약이 생겨도 UI 코드를 고칠 필요가 없다.

## 3. 모듈 구조

```
src/
  core/                      # 플랫폼 독립 (웹·데스크톱 공용)
    types.ts                 # ArchiveFormat, CompressOptions(+split), ExtractOptions(+selection),
                             #   Progress, FormatCaps, FsEntry(+modified), DirListing …
    ArchiveService.ts        # 서비스 인터페이스
    format.ts                # 확장자 감지, 해제 전용(디스크 이미지) 인식, 분할 파트 규칙(.NNN), 바이트 표기
    i18n.ts                  # ko/en 사전, 언어 감지
  ui/                        # 공용 React UI
    App.tsx                  # Shell 조립 + Store/ContextMenu 프로바이더
    store.tsx                # 중앙 스토어(Context): 상태 + 액션 + 테마/언어/설정 + 탐색/파일조작
    ServiceContext.ts        # 주입된 ArchiveService 제공
    TitleBar.tsx             # 커스텀 타이틀바(정보 버튼 + 창 제어)
    Toolbar.tsx              # 액션 툴바(압축/폴더압축/해제 + 설정/정보/테마/언어)
    OptionsBar.tsx           # 압축 옵션(포맷/분할)
    FileBrowser.tsx          # 왼쪽: 경로 드롭다운 + 확장 트리 + 우클릭 메뉴 + 단축키 + 드래그&드롭
    ArchiveViewer.tsx        # 오른쪽: 아카이브 내용(선택 해제) 또는 일반 파일 정보
    StatusBar.tsx            # 하단 상태바(경로/항목수/선택 아카이브/진행률)
    SettingsModal.tsx        # 설정: 테마·언어·기본 폴더·마지막 폴더 기억
    ProgressModal.tsx        # 진행률 팝업(작업 중 표시)
    ContextMenu.tsx          # 전역 우클릭 컨텍스트 메뉴 프로바이더/렌더러
    ProgressBar.tsx          # 진행률 바(개수/바이트/marquee)
    AboutModal.tsx           # 프로그램 정보
    ErrorModal.tsx           # 심각한 오류 상세 + 복사
    theme.css                # 다크/라이트 테마 변수 + 레이아웃
  web/
    entry-web.tsx            # WebArchiveService 주입 → <App/>
    WebArchiveService.ts
    webFs.ts                 # 브라우저 파일 입출력(입력 선택, 다운로드, 폴더 쓰기)
    index.html
    public/icon.png
  desktop/
    main.ts                  # BrowserWindow(frameless), 메뉴 제거, 다이얼로그·IPC·창제어·파일조작·startDrag
    preload.ts               # contextBridge → window.zipmaster
    backend.ts               # node-7z 엔진 + 분할/병합 + listDir/copyPath/movePath(참고 앱 로직 이식)
    ElectronArchiveService.ts
    entry-electron.tsx
    index.html
    public/icon.png
  types/modules.d.ts         # node-7z, *?url 타입 선언
build/
  icon.ico / icon.png        # 아이콘
  installer.nsh              # NSIS 커스텀: 바로가기 선택 페이지(설치 패스 전용 매크로)
  afterBuild.cjs             # 설치 파일을 루트로 복사하는 훅
```

## 4. 빌드 파이프라인

세 개의 진입 구성으로 나뉜다.

- **웹**: [vite.web.config.ts](vite.web.config.ts) — `root: src/web`, 산출물 `dist-web/`. Node `events` 는 브라우저용 `events` 패키지로 alias 하여 `tar-stream` 이 동작하도록 한다.
- **데스크톱**: [electron.vite.config.ts](electron.vite.config.ts) — `main` / `preload` / `renderer` 3개 타깃을 함께 빌드(`out/`). `main`·`preload` 는 `externalizeDepsPlugin()` 로 네이티브 CJS 의존성(node-7z, 7zip-bin)을 번들에서 제외한다.
- **패키징**: [electron-builder.yml](electron-builder.yml) — `out/` 을 입력으로 Win(nsis)/mac(dmg)/Linux(AppImage,deb) 설치본을 만든다.

> **CJS 출력**: `package.json` 에 `"type": "module"` 을 두지 **않는다**. Electron 메인이 ESM 이면 CJS 네이티브 모듈(node-7z 등)을 로드할 때 ESM↔CJS interop 오류가 발생하므로, 데스크톱 번들은 CommonJS 로 출력한다.

> **NSIS 커스텀 스크립트**: [build/installer.nsh](build/installer.nsh) 의 바로가기 선택 페이지 관련 Function/Var 는 `customPageAfterChangeDir` 매크로 **안**에 둔다. 최상위에 두면 설치 프로그램과 제거 프로그램이 같은 스크립트로 컴파일되는 과정에서 제거 패스가 이를 참조하지 않아 "unreferenced" 경고→오류가 발생한다. `MUI_HEADER_TEXT` 는 가드된 `MUI2.nsh` include 로 확보한다.

## 5. 데이터 흐름

### 압축 (툴바 "파일/폴더 압축" 또는 탐색기 우클릭 "압축하기")
```
Toolbar → store.doCompress(kind) → svc.pickInputs(kind)     // 다이얼로그로 대상 선택
FileBrowser 우클릭 → store.compressEntry(entry)             // 트리에서 고른 경로를 바로 입력
  → (공용) runCompress(inputs) → svc.compress(inputs, {format,split,splitSizeMb}, onProgress)
       web:      fflate/tar-stream 로 Blob 생성 → (분할 시 슬라이스) → 다운로드
       desktop:  IPC → backend.compress → node-7z add → (분할 시 splitFile) → 저장
  → 진행률 setProgress(→ ProgressModal), 완료 시 토스트
```

### 해제 (툴바 "압축 해제" / 뷰어 버튼 / 우클릭 "압축 해제" / 선택 해제)
```
store.doExtract(selection?, archivePath?)
  → 대상: 명시 경로 > 트리에서 선택한 아카이브 > 파일 다이얼로그
  → svc.extract(archive, {overwrite, selection}, onProgress)
       web:      libarchive.js 로 항목 추출 → 폴더 저장(File System Access) 또는 개별 다운로드
       desktop:  IPC → backend.extract → (분할이면 tryCombineParts) → node-7z extractFull
                 selection 지정 시 $cherryPick 으로 해당 항목만 추출
```

진행률은 `Progress { message, kind: 'count'|'bytes'|'marquee', current, total }` 로 통일. 데스크톱은 메인 프로세스가 `archive:progress` IPC 이벤트로 렌더러에 전달하며, `progress` 가 설정된 동안 **ProgressModal** 이 화면에 표시된다.

### 파일 탐색 (왼쪽 트리)
```
FileBrowser 는 useArchiveService() 로 svc.listDir(path) 를 직접 호출해
  childrenCache(경로별 자식) · expanded(펼친 경로) 를 로컬 상태로 관리한다.
store.browseTo(path) 가 현재 경로(listing)를 바꾸면 FileBrowser 가
  루트~현재 계보를 자동 로드·펼침(전체 경로가 보이도록).
아카이브 클릭 → store.openFsEntry → listEntriesByPath → 오른쪽에 내용,
일반 파일 클릭 → store.fileInfo 설정 → 오른쪽에 파일 정보(FsEntry.modified 포함).
```

### 파일 조작 & 드래그 앤 드롭 (데스크톱)
```
복사/잘라내기(클립보드 상태) → 붙여넣기 → svc.copyPath / movePath
삭제 → window.confirm → svc.deletePath (main 에서 shell.trashItem 로 휴지통 이동)
키보드: Ctrl+C / Ctrl+X / Ctrl+V / Delete (트리 포커스 시)
DnD: 내부 항목 드래그(application/x-zipmaster-path) → 폴더에 드롭 시 이동,
     OS 파일 드롭(dataTransfer.files[].path) → 현재/대상 폴더로 복사,
     Alt+드래그 → svc.startDrag → 메인 webContents.startDrag 로 OS 내보내기
조작 후 영향받은 디렉터리를 loadChildren 로 다시 로드해 트리를 갱신.
```

### 분할/병합 규칙 ([src/core/format.ts](src/core/format.ts))
- 조각 파일명: `<base>.001`, `.002` … (`String(i).padStart(3,'0')`).
- 병합: `.001` 선택 시 같은 base 의 모든 조각을 index 순으로 이어붙임. 데스크톱은 `backend.tryCombineParts`(fs 스트림), 웹은 다중선택된 `File` 들을 `new File([...parts])` 로 결합.

### 인코딩 (한글 아카이브 목록)
- Windows 에서 7za 는 콘솔 출력을 OEM 코드페이지(한국어=CP949)로 내보내는데 node-7z 는 이를 UTF-8 로 디코딩해 한글이 깨진다. `Seven.list` 에 `$raw: ['-sccUTF-8']` 을 주어 7za 가 UTF-8 로 출력하도록 강제한다([backend.ts](src/desktop/backend.ts)).

## 6. 상태 지속성 (localStorage)

| 키 | 의미 |
|----|------|
| `zm.theme` | 다크/라이트 테마 |
| `zm.lang` | 언어(ko/en) |
| `zm.defaultDir` | 시작 시 열 기본 폴더 |
| `zm.rememberLast` | 마지막 폴더 기억 여부 |
| `zm.lastDir` | 마지막으로 열었던 폴더(복원용) |

## 7. 보안 (데스크톱)

- `contextIsolation: true`, `nodeIntegration: false` — 렌더러는 Node API 직접 접근 불가.
- preload 의 `contextBridge` 로 화이트리스트된 함수만 `window.zipmaster` 로 노출.
- 렌더러 `index.html` 에 CSP 설정(`script-src 'self'` 등).
- 삭제는 영구 삭제가 아니라 **휴지통 이동**(`shell.trashItem`)으로 복구 가능하게 처리.

## 8. 확장 가이드

- **새 포맷 추가**: `core/types.ts` 의 `ArchiveFormat` 과 `core/format.ts` 의 라벨/확장자에 추가 → 각 서비스의 `capabilities()` 와 compress/extract 분기 구현. 해제만 지원하는 컨테이너는 `EXTRACT_ONLY_EXTS` 에 확장자만 추가.
- **새 언어 추가**: `core/i18n.ts` 의 `Lang` 확장 + 사전 추가.
- **새 창 제어/네이티브 기능**: `desktop/main.ts` 에 IPC 핸들러 추가 → `preload.ts` 에 브리지 노출 → `ArchiveService` 인터페이스와 두 구현체에 메서드 추가 → 스토어/컴포넌트에서 호출.
