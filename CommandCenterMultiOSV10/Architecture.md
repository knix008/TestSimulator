# Command Center — 내부 구조

## 1. 한눈에 보기

```
                 ┌──────────────────────── src/ (React UI, Vite) ───────────────────────┐
                 │ App.jsx ── FilePanel ×2 ── FolderTree · ContextMenu · Chrome(메뉴/툴바) │
                 │           Dialogs(프롬프트·확인·충돌·진행률·압축·정보·속성·오류) · Search │
                 │           lib/backend.js  ←  유일한 호스트 분기점                        │
                 └──────────────┬───────────────────────────────┬──────────────────────┘
                     IPC (preload)                          fetch('/api/…') + 폴링
                 ┌──────────────▼──────────────┐   ┌───────────▼──────────────────────┐
                 │ electron/ main.js ipc.js     │   │ server/server.js (node:http 만)   │
                 │ shell.openPath / trashItem   │   │ dist/ 정적 제공 + POST /api/<name> │
                 └──────────────┬──────────────┘   └───────────┬──────────────────────┘
                                └────────────► core/api.js ◄────┘
                                        fsops · archive(tar/zip/bz2) · jobs · session
```

같은 `core/` 가 두 호스트에서 그대로 실행되므로 데스크톱과 웹의 동작이 항상 같습니다.
UI 는 `window.commandCenter`(preload 가 노출) 유무로 전송 방식만 고릅니다.

## 2. core/ — 플랫폼 무관 코어 (CommonJS, Node 만 사용)

| 파일 | 역할 |
|---|---|
| `api.js` | 메서드 이름 → 함수 표. `createApi(host)` 가 호스트 전용 기능(열기·휴지통·클립보드)을 주입받습니다. 긴 작업은 즉시 **잡 스냅샷**을 돌려줍니다. `serializeError` 가 code/path/syscall/stack 을 UI 로 넘깁니다. |
| `fsops.js` | 목록(권한 문자열, 날짜, 확장자), 루트 목록(홈·드라이브·/tmp·마운트), 드라이브 목록(`listDrives`: Windows 는 Win32_LogicalDisk 를 PowerShell 로 읽어 이름·종류·용량, 60초 캐시), 속성(폴더 합계), mkdir/새 파일/이름 바꾸기, 항목 수 세기, **복사/이동**(충돌 질문, 폴더 병합, 자기 자신 안으로 이동 금지, EXDEV 시 복사+삭제), 삭제, 휴지통(호스트 함수 없으면 freedesktop/macOS 휴지통 폴더), **검색**(글롭 + 내용, 64 MB 제한). |
| `archive.js` | tar.gz / tar.bz2 / zip 생성·해제, 분할(`splitFile`)·결합(`joinParts`), 형식 감지(`describe`, `splitDetect`), 매직 바이트 스니핑, zip-slip 방지, ZIP 파일명 인코딩(UTF-8 플래그 → Info-ZIP 유니코드 필드 → EUC-KR → latin1). |
| `tar.js` | 자체 스트리밍 tar 라이터/리더(ustar + pax `path`/`linkpath`/`mtime`, GNU `L`/`K` 읽기, base-256 크기). 긴 이름과 비ASCII 이름은 pax 로 기록해 libarchive/GNU tar/bsdtar 와 호환됩니다. |
| `bzip2-worker.js` | `compressjs` 의 동기 bzip2 를 **worker_threads** 에서 실행(메인 프로세스 정지 방지). 1 MB 버퍼로 파일을 스트리밍하고 진행률을 postMessage. 취소는 `worker.terminate()`. 패키징 시 `asarUnpack` 대상. |
| `jobs.js` | `Job`(진행률·취소·충돌 질문·결과·오류 상세)과 `JobRegistry`(`run`, 스냅샷, 60초 뒤 정리). 업데이트는 33 ms 로 병합. |
| `session.js` | `session.json`(좌/우 경로, 분할, 언어, 테마, 정렬, 창 위치). 존재하지 않는 폴더는 홈으로 대체. |

### 잡(job) 흐름

```
UI runJob('ops.transfer', …)            core: jobs.run(kind, meta, fn)
   ├─ 첫 스냅샷 {id, status:'running'}   ├─ job.setTotal(countItems)
   ├─ followJob(id)                      ├─ job.progress(path) …
   │    Electron: 'job:update' push      ├─ 충돌: await job.askConflict(info)  → 스냅샷에 conflict
   │    Web: 150 ms 폴링 jobs.get        │      UI 가 ConflictDialog → jobs.resolveConflict(id, answer, applyAll)
   └─ status !== 'running' → 완료        └─ finish(result) | fail(err) (errorDetail 포함)
```

## 3. electron/ — 데스크톱 호스트

- `main.js`: 단일 인스턴스, 창 크기/위치 복원(`session.windowBounds`), 테마 배경색(`session.themeBg`)으로 첫 프레임 깜빡임 방지, macOS 만 애플리케이션 메뉴(Cmd+Q/C/V). `--smoke-shot=<png>` `--smoke-script=<js>` `--smoke-probe=<js>` `--smoke-url=<http>` 는 smoke 테스트용.
- `ipc.js`: `ipcMain.handle('api')` → `api.call`; `job:update` 푸시; `fs.watch` 기반 `watch:start/stop` → `dir:changed`.
- `preload.js`: `window.commandCenter` (call / onJobUpdate / watchDir / onDirChanged / quit). `call` 은 `{ok,…}` 객체를 그대로 돌려주고 UI 가 Error 를 만듭니다 — contextBridge 를 넘는 Error 는 message 외의 속성을 잃기 때문입니다.

## 4. server/ — 웹 호스트

`node:http` 만 사용합니다. `GET` 은 `dist/` 정적 파일(SPA 폴백), `POST /api/<name>` 은 JSON 본문을 `api.call` 로 넘깁니다.
`--host` `--port` `--token`(Bearer / `?token=`) 옵션, 기본 루프백 바인딩. 브라우저 세션 저장은 `session.js` 의 XDG/AppData 경로.

## 5. src/ — UI

| 파일 | 역할 |
|---|---|
| `App.jsx` | 세션 로드/저장, 활성 패널, 모든 액션(`runAction`), 진행률+충돌을 묶는 `runWithProgress`, F-키 단축키, 분할선, 전역 오류 핸들러(`error`/`unhandledrejection` → 오류 팝업), smoke 훅 `window.__cc`. |
| `components/FilePanel.jsx` | 목록 로드·정렬·선택(Ctrl/Shift/키보드)·컨텍스트 메뉴·폴더 감시(`watchDir`, 250 ms 디바운스, 작업 중 일시 정지)·패널 상태줄. App 은 `ref`(refresh/getSelectedEntries/selectPaths…)와 `onAction(id)` 로만 상호작용. |
| `components/FolderTree.jsx` | 루트(`fs.roots`) + 지연 로딩(`fs.subdirs`), 현재 경로까지 자동 확장. |
| `components/Chrome.jsx` | 메뉴바(파일/편집/보기/압축), 툴바(작업 버튼 + 우측: 테마 분할 버튼 · 국기 언어 토글 · 설정 · 정보). |
| `components/ContextMenu.jsx` | 위치 보정 팝업 메뉴(메뉴바 드롭다운·컨텍스트 메뉴·테마 목록 공용, 체크/스와치 지원). |
| `dialogs/Dialogs.jsx` | `useDialogs()` — 프라미스 기반 스택(`prompt/confirm/error/conflict/compress/about/properties`, `open()` 은 진행률처럼 갱신형). `describeError` 가 Error → 메시지+상세. 오류 팝업에는 **자세한 내용 복사** 버튼. |
| `dialogs/SearchDialog.jsx` | 비모달 검색 창(`search.start` 잡, 진행 중 개수, 결과 더블클릭). |
| `dialogs/SettingsDialog.jsx` | 설정 폼(언어·테마·글꼴 크기·분할 기본 크기·숨김·삭제 확인·폴더 복원·자동 새로고침). 값은 세션에 저장되고 App 이 적용(`applyTheme`, `--fs`, `suspendWatch`). |
| `lib/backend.js` | 전송 분기: `call`, `runJob/followJob`(푸시 vs 폴링), `watchDir`(fs.watch vs mtime 폴링), 클립보드, `unwrap`(오류 객체 → Error, 스택 결합). |
| `lib/i18n.js` | ko/en 사전 + `t()` + `useLanguage()`(useSyncExternalStore). |
| `lib/format.js` | 크기/종류 표시, 경로 분리자(백엔드에서 받음), breadcrumb 분해. |
| `themes.js` | 16 테마 토큰 → `:root` CSS 변수(`applyTheme`), 순환(`nextThemeId`). |
| `styles.css` | 변수 기반 스타일(기본값 = 미드나이트). |

## 6. 빌드·패키징

- `vite build` → `dist/` (`base: './'` 로 file:// 와 임의 경로 서빙 모두 지원).
- electron-builder: `files` 에 `core/`·`electron/`·`dist/`·`build/icons/`; `asarUnpack` 에 `core/bzip2-worker.js` 와 `compressjs`(워커는 asar 밖에서만 로드 가능). `extraResources` 로 `build-info.json`.
- Windows NSIS: `build/installer.nsh` — 바로가기 선택 페이지, 이전 설치 완전 삭제, 남은 데이터 삭제 여부 질문. 설치/제거 프로그램 아이콘도 앱과 같은 `icon.ico`.
- Linux deb: `after-install.sh` (desktop DB·아이콘 캐시 갱신, chrome-sandbox setuid).
- `scripts/generate-icons.mjs`: sharp 로 SVG → PNG(16~1024), `ico.mjs` 로 ICO/ICNS 컨테이너 생성.

## 7. 테스트

- `test/archive.test.mjs`: 세 형식 왕복(한글·긴 이름·심볼릭 링크 포함), 분할/결합, 취소 시 잔여 파일 없음, 확장자 헬퍼.
- `test/fsops.test.mjs`: 목록 메타데이터, 충돌(건너뛰기/덮어쓰기/모두 적용), 이동·자기 자신 안으로 이동 금지, 취소, mkdir/생성/이름 바꾸기/삭제, 검색, API 디스패치·세션.
- `scripts/smoke.mjs`: 실제 Electron 을 별도 프로필로 띄워 스크린샷(`--scenario context|compress|search|about|light_en|delete|themes|error|theme_*`), `--web` 이면 웹 서버를 띄우고 preload 없는 창으로 브라우저 모드를 캡처, `--probe <js>` 로 DOM 상태를 출력.

## 8. 설계 메모

- **왜 자체 tar 인가**: 네이티브 의존성 없이 Electron/서버에서 동일하게 동작하고, GTK 판(libarchive)과 서로 읽을 수 있어야 하기 때문.
- **왜 bzip2 는 워커인가**: `compressjs` 는 동기·바이트 단위라 메인 프로세스에서 돌리면 IPC 가 멈춤.
- **왜 분할 첫 조각이 `.zip`/`.tgz` 인가**: GTK 판의 규칙을 그대로 따라 두 프로그램이 서로의 분할 파일을 해제할 수 있게 함(7-Zip 순서와 다름 — README 의 `cat` 안내 참고).
- **왜 대화상자가 앱 내부 모달인가**: 웹 버전에서도 같은 코드를 쓰기 위함. 충돌 질문은 진행률 창 위에 스택으로 쌓임.
- **오류 전달**: 백엔드 → `serializeError`(code/path/syscall/stack) → `unwrap` 이 렌더러 Error 로 재구성(스택 두 프로세스 결합) → `describeError` → 팝업 + 복사.
