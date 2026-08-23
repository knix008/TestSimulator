# ARCHITECTURE — ZipMaster Multi-OS

이 문서는 ZipMaster Multi-OS 의 설계 원칙, 모듈 구조, 데이터 흐름, 확장 방법을 설명합니다.

## 1. 설계 목표

- **UI 한 벌, 두 런타임**: React/TypeScript UI 를 브라우저(웹)와 Electron(데스크톱)이 그대로 공유한다.
- **플랫폼 차이는 서비스 경계로 격리**: 파일 접근·압축 엔진처럼 플랫폼마다 다른 부분만 `ArchiveService` 인터페이스 뒤로 숨긴다.
- **기능 패리티**: 참고 앱 `ZipMasterWin01`(단일/분할 압축, 자동 병합 해제, 진행률)의 동작을 유지하면서 다중 포맷·다중 OS 로 확장한다.

## 2. 핵심 추상화 — `ArchiveService`

[src/core/ArchiveService.ts](src/core/ArchiveService.ts)

UI 는 오직 이 인터페이스만 소비하며, 진입점에서 구현체를 주입한다.

```
ArchiveService
  capabilities()        // 포맷별 생성/해제 가능 여부, 분할·네이티브경로 지원
  pickInputs(kind)      // 압축 대상 선택 (데스크톱=다이얼로그, 웹=<input>)
  pickArchive()         // 해제 대상 선택 (웹은 분할 조각 다중선택→병합)
  compress(...)         // 압축 (+분할)
  extract(...)          // 해제 (+분할 자동 병합)
  listEntries(...)      // 내용 목록
```

두 구현체:

| 구현 | 위치 | 엔진 |
|------|------|------|
| `WebArchiveService` | [src/web/WebArchiveService.ts](src/web/WebArchiveService.ts) | 생성: `fflate`(zip/gz)+`tar-stream`(tar) · 해제: `libarchive.js`(WASM) |
| `ElectronArchiveService` | [src/desktop/ElectronArchiveService.ts](src/desktop/ElectronArchiveService.ts) | preload IPC → 메인 프로세스 `node-7z`+`7zip-bin` |

`capabilities()` 로 UI 가 사용 불가 기능(예: 웹의 7z/bz2 생성)을 자동으로 비활성화하므로, 새 제약이 생겨도 UI 코드를 고칠 필요가 없다.

## 3. 모듈 구조

```
src/
  core/                      # 플랫폼 독립 (웹·데스크톱 공용)
    types.ts                 # ArchiveFormat, CompressOptions, Progress, FormatCaps …
    ArchiveService.ts        # 서비스 인터페이스
    format.ts                # 확장자 감지, 분할 파트 규칙(.NNN), 바이트 표기
    i18n.ts                  # ko/en 사전, 언어 감지
  ui/                        # 공용 React UI
    store.tsx                # 중앙 스토어(Context): 상태 + 액션 + 테마/언어 + 오류
    ServiceContext.ts        # 주입된 ArchiveService 제공
    TitleBar.tsx             # 커스텀 타이틀바(정보 버튼 + 창 제어)
    Toolbar.tsx              # 액션 툴바(툴팁, 반응형)
    CompressPanel.tsx        # 압축 옵션(포맷/분할)
    ExtractPanel.tsx         # 해제 옵션 + 미리보기 결과
    ProgressBar.tsx          # 진행률(개수/바이트/marquee)
    AboutModal.tsx           # 프로그램 정보
    ErrorModal.tsx           # 심각한 오류 상세 + 복사
    theme.css                # 다크/라이트 테마 변수
  web/
    entry-web.tsx            # WebArchiveService 주입 → <App/>
    WebArchiveService.ts
    webFs.ts                 # 브라우저 파일 입출력(입력 선택, 다운로드, 폴더 쓰기)
    index.html
    public/icon.png
  desktop/
    main.ts                  # BrowserWindow(frameless), 메뉴 제거, 다이얼로그·IPC·창제어
    preload.ts               # contextBridge → window.zipmaster
    backend.ts               # node-7z 엔진 + 분할/병합(참고 앱 로직 이식)
    ElectronArchiveService.ts
    entry-electron.tsx
    index.html
    public/icon.png
  types/modules.d.ts         # node-7z, *?url 타입 선언
build/
  icon.ico / icon.png        # 아이콘 (원본 daemon_hammer.ico 에서 파생)
  installer.nsh              # NSIS 커스텀: 바로가기 선택 페이지
  afterBuild.cjs             # 설치 파일을 루트로 복사하는 훅
```

## 4. 빌드 파이프라인

세 개의 진입 구성으로 나뉜다.

- **웹**: [vite.web.config.ts](vite.web.config.ts) — `root: src/web`, 산출물 `dist-web/`. Node `events` 는 브라우저용 `events` 패키지로 alias 하여 `tar-stream` 이 동작하도록 한다.
- **데스크톱**: [electron.vite.config.ts](electron.vite.config.ts) — `main` / `preload` / `renderer` 3개 타깃을 함께 빌드(`out/`). `main`·`preload` 는 `externalizeDepsPlugin()` 로 네이티브 CJS 의존성(node-7z, 7zip-bin)을 번들에서 제외한다.
- **패키징**: [electron-builder.yml](electron-builder.yml) — `out/` 을 입력으로 Win(nsis)/mac(dmg)/Linux(AppImage,deb) 설치본을 만든다.

> **CJS 출력**: `package.json` 에 `"type": "module"` 을 두지 **않는다**. Electron 메인이 ESM 이면 CJS 네이티브 모듈(node-7z 등)을 로드할 때 ESM↔CJS interop 오류가 발생하므로, 데스크톱 번들은 CommonJS 로 출력한다.

## 5. 데이터 흐름

### 압축 (툴바 "파일/폴더 압축" 버튼)
```
Toolbar → store.doCompress(kind)
  → svc.pickInputs(kind)                 // 선택
  → svc.compress(inputs, opts, onProgress)
       web:      fflate/tar-stream 로 Blob 생성 → (분할 시 슬라이스) → 다운로드
       desktop:  IPC → backend.compress → node-7z add → (분할 시 splitFile) → 저장
  → 진행률 setProgress, 완료 시 토스트
```

### 해제 (툴바 "압축 해제")
```
Toolbar → store.doExtract()
  → svc.pickArchive()                    // .001 다중선택 시 병합
  → svc.extract(archive, opts, onProgress)
       web:      libarchive.js 로 항목 추출 → 폴더 저장(File System Access) 또는 개별 다운로드
       desktop:  IPC → backend.extract → (분할이면 tryCombineParts) → node-7z extractFull
```

진행률은 `Progress { message, kind: 'count'|'bytes'|'marquee', current, total }` 로 통일(참고 앱 `ProgressSnapshot` 이식). 데스크톱은 메인 프로세스가 `archive:progress` IPC 이벤트로 렌더러에 전달한다.

### 분할/병합 규칙 ([src/core/format.ts](src/core/format.ts))
- 조각 파일명: `<base>.001`, `.002` … (`String(i).padStart(3,'0')`).
- 병합: `.001` 선택 시 같은 base 의 모든 조각을 index 순으로 이어붙임. 데스크톱은 `backend.tryCombineParts`(fs 스트림), 웹은 다중선택된 `File` 들을 `new File([...parts])` 로 결합.

## 6. 보안 (데스크톱)

- `contextIsolation: true`, `nodeIntegration: false` — 렌더러는 Node API 직접 접근 불가.
- preload 의 `contextBridge` 로 화이트리스트된 함수만 `window.zipmaster` 로 노출.
- 렌더러 `index.html` 에 CSP 설정(`script-src 'self'` 등).

## 7. 확장 가이드

- **새 포맷 추가**: `core/types.ts` 의 `ArchiveFormat` 과 `core/format.ts` 의 라벨/확장자에 추가 → 각 서비스의 `capabilities()` 와 compress/extract 분기 구현.
- **새 언어 추가**: `core/i18n.ts` 의 `Lang` 확장 + 사전 추가.
- **새 창 제어/네이티브 기능**: `desktop/main.ts` 에 IPC 핸들러 추가 → `preload.ts` 에 브리지 노출 → 스토어에서 호출.
