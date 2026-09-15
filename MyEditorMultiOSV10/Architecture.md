# My Editor — 아키텍처

```
MyEditorMultiOSV10/
├ core/                 플랫폼 무관 (Node 전용, 두 호스트가 공유)
│  ├ encoding.js        인코딩 감지·변환(iconv-lite), 줄 끝 감지·정규화
│  ├ files.js           읽기/쓰기(원자적), 디렉터리 목록, 드라이브, mkdir/rename/remove, 이미지 → data URL
│  ├ session.js         session.json (설정 · 탭 · 초안 · 최근 파일 · 창 위치)
│  ├ search.js          폴더 전체 찾기(재귀 탐색, 바이너리/대용량/빌드 폴더 제외, 포함·제외 글롭, 취소, 결과 상한)
│  ├ lint.js            언어별 검사 도구 실행(별도 프로세스, stdin, 도구 탐색·캐시, 문서별 취소) → { line, col, severity, message }
│  ├ terminal.js        터미널 세션(파이프 셸 — 프롬프트·에코 없이 기동, 출력 버퍼, cwd/idle 마커) + Tab 자동완성(내장 명령·PATH·경로) + git status 파싱
│  └ api.js             메서드 테이블 `api.call(name, args)` + 오류 직렬화
├ electron/             데스크톱 호스트
│  ├ main.js            창, 단일 인스턴스, argv 파일 열기, 네이티브 대화상자, 닫기 확인, 스모크 훅
│  ├ ipc.js             ipcMain: 'api' · 'dialog' · 창 제어
│  └ preload.js         contextBridge → window.myEditor
├ server/server.js      웹 호스트: dist/ 정적 서빙 + POST /api/<name>
├ src/                  React UI (Vite)
│  ├ App.jsx            문서 모델·탭·열기/저장/닫기·세션 복원·메뉴·단축키·대화상자 흐름
│  ├ lib/editor.js      CodeMirror 확장 세트, Compartment, 테마(CSS 변수), 검색 API, 편집 명령
│  ├ lib/languages.js   @codemirror/language-data 150+ 언어 지연 로드, 확장자 판별
│  ├ lib/markdown.js    Markdown 서식 명령(감싸기/접두사 토글/블록 삽입), marked+DOMPurify 렌더러
│  ├ lib/mdlive.js      Markdown WYSIWYG: 구문 트리 기반 Decoration(기호 숨김·위젯·줄 스타일), 이미지 위젯(크기 조절 → <img width>)
│  ├ dialogs/ImageDialog.jsx  이미지 넣기(파일/URL, 링크 또는 Base64 내장, 너비, 미리보기)
│  ├ lib/lint.js        진단 표시(@codemirror/lint: 거터 마커·밑줄·툴팁·패널), 백엔드 결과 → Diagnostic 변환
│  ├ lib/images.js      이미지 경로 해석(문서 폴더 기준 → file.dataUrl, 캐시), 드롭/붙여넣기 파일 → data URL
│  ├ lib/spell.js       스펠링 체크: nspell + assets/dict/en.{aff,dic}(지연 로드), 가시 범위만 검사, 제안·사용자 사전
│  ├ lib/backend.js     전송 스위치(IPC ↔ fetch), 대화상자 폴백, 창 제어
│  ├ lib/i18n.js        ko / en 사전
│  ├ lib/settings.js    설정 기본값
│  ├ themes.js          16 테마 → CSS 변수(구문 색 --syn-* 포함)
│  ├ components/        MenuBar · Toolbar · TabBar · EditorPane · FindBar · MarkdownBar · Preview · Sidebar · SearchPanel · TerminalPanel · FontPicker · StatusBar · ContextMenu · Icons
│  └ dialogs/           Dialogs(확인·오류·정보·줄 이동·프롬프트·언어·인코딩·단축키) · SettingsDialog · FileDialog(웹)
├ scripts/              start-electron · free-port · generate-icons(+ico) · build-info · smoke · clean …
├ test/core.test.mjs    코어 단위 테스트
└ build/                installer.nsh, linux 설치 스크립트, icons/(생성됨)
```

## 1. 계층

### core/ — 플랫폼 무관, Node 전용
- `encoding.decode(buf)` 는 BOM → 엄격한 UTF-8 → UTF-16 NUL 패턴 → 이진 판별 → 시스템 레거시 코드 페이지 순으로 판별하고, 텍스트를 `\n` 으로 정규화한 뒤 `{ text, encoding, eol }` 를 돌려줍니다. `encode(text, enc, eol)` 는 반대 방향이며 BOM 은 직접 붙입니다. `canEncode` 로 손실 여부를 미리 확인합니다.
- `files.write` 는 임시 파일 + rename 으로 원자적으로 쓰고(네트워크 공유 등에서 rename 이 실패하면 직접 쓰기) 새 mtime 을 돌려줍니다. 렌더러는 이 mtime 으로 외부 변경을 감지합니다.
- `session.js` 는 512 KB 를 넘는 초안을 버리는 것 외에는 단순한 JSON 저장소입니다.
- `api.js` 의 메서드 테이블(`app.info`, `session.*`, `recent.*`, `file.*`, `fs.*`, `os.*`, `clipboard.*`)이 두 호스트의 공통 계약입니다. 오류는 `serializeError` 로 code · path · stack 을 담아 전달됩니다.

### electron/
- `main.js` 는 프레임 없는 창 하나를 만들고, `--smoke-shot` 이 있으면 스크린샷 후 종료합니다. 닫기 요청은 렌더러에 위임(`win:close-request` → 저장 확인 → `win:close-reply`)합니다. 명령줄 인수 · 두 번째 인스턴스 · macOS `open-file` 의 파일은 렌더러가 `renderer:ready` 를 보낸 뒤 `files:open` 으로 전달됩니다.
- 네이티브 열기/저장/폴더 대화상자는 `dialog` IPC 로 노출됩니다.

### server/server.js
- `dist/` 를 서빙하고 `/api/<name>` 을 `api.call` 로 연결합니다. 기본 바인드는 루프백이며 `--token` 으로 보호합니다. 문서 전체가 JSON 본문으로 오가므로 본문 한도는 256 MB 입니다.

### src/ — React UI
- **문서 모델**: `docs[]` 에는 메타데이터(경로 · 인코딩 · 줄 끝 · 언어 · dirty · mtime …)만 있고, 텍스트는 CodeMirror `EditorState` 에 있습니다. 활성 문서의 상태는 단 하나의 `EditorView` 안에, 나머지는 `statesRef` 맵에 보관되며 탭을 바꾸면 `view.setState()` 로 교체합니다. 그래서 탭마다 실행 취소 기록 · 선택 · 접기가 유지됩니다. `dispatchTo(id, spec)` 은 상태가 어디에 있든 트랜잭션을 적용합니다.
- **dirty 판정**은 마지막으로 읽거나 저장한 `Text` 와 `doc.eq()` 비교(구조 공유 덕분에 빠름)로 합니다.
- **설정 변경**은 Compartment 재구성 효과(`settingsEffects`)를 활성 뷰와 보관된 모든 상태에 적용합니다.
- **언어**는 `LanguageDescription.load()` 로 지연 로드되어 Vite 가 문법마다 청크로 나눕니다. Markdown 이면 `markdownLive` 확장을 함께 넣습니다.
- **찾기**는 CodeMirror 의 search 상태를 그대로 쓰되 내장 패널은 보이지 않는 빈 DOM 으로 대체하고(`.cm-panels{display:none}`) FindBar 가 `SearchQuery` 를 밀어 넣습니다. 패널이 "열려" 있어야 일치 강조가 동작하기 때문입니다.
- **Markdown WYSIWYG**(`mdlive.js`)는 ViewPlugin 이 보이는 범위의 구문 트리를 훑어 `Decoration.replace`(기호 숨김 · 위젯) 와 `Decoration.line`(제목/인용/코드 줄 스타일) 을 만듭니다. 선택 영역이 닿은 줄은 원본을 그대로 보여 줍니다. 이미지(`Image` 노드와 `<img>` HTMLTag/HTMLBlock)는 커서 줄에서도 항상 ImageWidget 으로 바뀌고, 같은 범위를 `EditorView.atomicRanges` 로도 제공해 커서 이동·삭제가 그림 단위로 이루어집니다. 로컬 이미지는 렌더러가 직접 읽을 수 없으므로(file:// · dev 서버 · 웹) `file.dataUrl` 로 받아 옵니다.
- **외부 변경 감지**: 창 포커스 · 탭 활성화 시 `file.stat` 으로 mtime/size 를 비교합니다(1.5초 스로틀).
- **세션 저장**은 1초 디바운스로, 탭 목록 · 커서 · dirty 문서의 초안을 씁니다.

## 2. 흐름

```
열기:  nativeDialog('open') ─┬ Electron: dialog.showOpenDialog
                             └ 웹: FileDialog.jsx (fs.list / fs.drives)
       → call('file.read') → addDoc(meta, text) → applyLanguage → activate
저장:  applySaveTransforms → (utf 아니면 file.canEncode → 경고) → call('file.write', {force})
       → savedRef 갱신, mtime 갱신, recent.touch
닫기:  confirmDiscard(저장/저장 안 함/취소) → removeDocs → 탭이 없으면 새 문서
종료:  win:close-request → closeAllForExit → win:close-reply(allow)
```

## 3. 테스트

- `npm test` — core 단위 테스트(인코딩 왕복 · UTF-16 스니핑 · 줄 끝 · 파일 I/O · 세션 · API 오류).
- `npm run smoke` — 실제 Electron 창을 띄워 `window.__med` 훅으로 시나리오를 실행하고 `.smoke/*.png` 를 남깁니다. 시나리오마다 별도 프로필을 씁니다(이전 프로세스가 프로필을 잠깐 잡고 있을 수 있음). 웹 스모크는 서버를 띄워 API 를 확인한 뒤 preload 없는 창으로 UI 를 찍습니다.

## 4. 빌드 · 패키징

- `vite build` → `dist/`(모든 경로 상대) → electron-builder(asar) — `electron/`, `core/`, `build/icons/` 포함. `src/build-info.json`(빌드 시각 · git 커밋) 은 extraResources 로 들어가 정보 대화상자에 표시됩니다.
- NSIS 스크립트(`build/installer.nsh`)는 바로가기 선택 페이지, 이전 설치 정리, 남은 데이터 삭제 여부 질문을 처리합니다.
- `MED_USER_DATA` 환경 변수로 프로필 위치를 바꿀 수 있습니다(테스트용).
