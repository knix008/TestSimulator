# DCM Viewer — Architecture

## 1. 개요

DCM Viewer는 **하나의 렌더러 코드**(`src/`)를 두 가지 호스트에서 실행합니다.

| 호스트 | 진입점 | 파일 시스템 | 대화상자 |
|--------|--------|-------------|----------|
| Electron (Windows/macOS/Linux) | `main.js` → `src/index.html` | Node `fs` (IPC) | 별도 `BrowserWindow` (`src/popup.html`) — 메인 창의 child, 함께 닫힘 |
| 웹 브라우저 | `server.js` → `src/index.html` | File System Access API / `<input type=file>` / fetch(samples) | 페이지 안의 모달(`#modalHost`) |

호스트 차이는 `src/js/platform.js` 한 곳에서 흡수합니다. 그 위의 코드(뷰어, 디코더, 대화상자, 앱)는 호스트를 모릅니다.
번들러·프레임워크 없이 순수 JavaScript(클래식 스크립트, 전역 네임스페이스)로 작성되어 `file://` 과 `http://` 모두에서 그대로 동작합니다.

```
┌──────────────────────────── renderer (src/) ─────────────────────────────┐
│ app.js ── 메뉴/툴바/패널/단축키/렌더링 파이프라인/내보내기/시네/시리즈        │
│   ├─ viewer.js      캔버스 변환·도구·측정                                     │
│   ├─ fileTree.js    폴더 트리                                                │
│   ├─ dialogs.js     대화상자 내용 (about/settings/batch/error/…/mpr/anonymize)│
│   ├─ dicomDecoder.js 파서·코덱·LUT·렌더·통계·헤더 스캔                        │
│   ├─ encoders.js    BMP/TIFF/GIF/ZIP · imageFormats.js TIFF/HEIF/JP2 디코더  │
│   ├─ themes.js · icons.js · i18n.js (+ i18n/ko.js, en.js)                   │
│   └─ platform.js ───────────────┬───────────────────────────────┐          │
└─────────────────────────────────┼───────────────────────────────┼──────────┘
                    window.electronAPI (preload.js)      브라우저 API (FS Access, fetch, download)
                                  │
                        main.js (Electron main): 창·다이얼로그·fs·설정·팝업 창 관리
```

## 2. 모듈

### `main.js` (Electron 메인 프로세스)
- 단일 인스턴스, 실행 인수 / macOS `open-file` / 두 번째 인스턴스의 파일을 렌더러에 `open-path`로 전달
- 창 위치·크기, 테마, 마지막 폴더 등을 `userData/dcmviewer-settings.json`에 저장
- IPC 핸들러: 디렉터리 읽기, 파일 읽기/쓰기(ArrayBuffer), 고유 폴더 생성, 휴지통, 복사/이동, 열기/저장/메시지 대화상자, 인쇄, 클립보드, 폴더 감시
- **팝업 창**: `popup-open(kind, payload)` → `BrowserWindow({ parent: mainWindow })` + `popup.html?kind=…`. 팝업이 `popup-ready`를 보내면 `popup-init`으로 payload/테마/언어를 전달하고 표시. `popup-resize`로 내용 크기에 맞춰 `setContentSize`, 메인 창 중앙에 배치. 팝업 ↔ 메인 렌더러 메시지는 `popup-emit` / `popup-send`로 중계. 종류별 하나만 열리며 이미 열려 있으면 포커스.
- macOS에서만 네이티브 애플리케이션 메뉴(Cmd 단축키용)를 만들고, 다른 OS는 렌더러의 HTML 메뉴만 사용

### `preload.js`
`contextBridge`로 `window.electronAPI`를 노출합니다. 렌더러는 이 객체의 유무로 Electron 여부를 판단합니다.

### `src/js/platform.js`
```
Platform.readDir(path) · readFile(path) → ArrayBuffer · readFileHead · writeFile · uniqueDir · canWriteInto
Platform.pickFiles · pickFolder · mountDropped(dataTransfer) · saveFile({ name, bytes }) · messageBox · print · clipboard…
Platform.settings.load/get/set · roots() · stat · join/dirname/basename/extname (동기)
```
웹에서는 가상 경로(`/<루트>/<상대경로>`)를 사용합니다. 루트는 `showDirectoryPicker` 핸들, `<input webkitdirectory>` 파일 목록, 드롭된 항목, 서버의 `samples/`(URL) 중 하나이며 `web.roots`에 등록됩니다. 디렉터리 핸들 루트만 쓰기가 가능하고(`converted_…` 폴더 직접 생성), 나머지는 다운로드로 대체합니다.

### `src/js/dicomDecoder.js`
ImageViewerMutlOSV20의 디코더를 가져와 확장했습니다(UMD: Node 테스트와 브라우저 모두).
- 파싱: `dicom-parser`; Deflated는 자체 inflate; 잘린 파일은 부분 데이터셋 사용
- 픽셀 디코딩: 비압축(8/12/16/32-bit, float, big-endian), RLE(자체), JPEG Baseline/Extended(libjpeg-turbo 8/12-bit wasm-js), JPEG Lossless(jpeg-lossless-decoder-js), JPEG-LS(CharLS), JPEG 2000/HTJ2K(OpenJPEG). 코덱은 처음 필요할 때 `../node_modules/…` 경로의 스크립트를 로드
- `image.render(opts)` → RGBA: Modality LUT/rescale → VOI(윈도우 또는 VOI LUT, LINEAR/LINEAR_EXACT/SIGMOID) → 0..255 LUT(16-bit까지 테이블 1개) → 컬러맵/반전 → 오버레이 평면 합성
- `frameInfo(i)`: Enhanced multi-frame의 shared/per-frame functional group을 최상위 값 위에 덮어 프레임별 윈도우·slope·위치·간격 제공
- 분석: `valueAt`, `stats(region)`, `histogram`, `dirLabel`(방향 표시), `valuesOf(frame)`(볼륨 구성용 Float32), `samplesOf`(16-bit TIFF)
- 추가 API: `isDicom(bytes)`, `scanHeader(bytes)`(픽셀 데이터 전까지만 파싱 → 시리즈 정렬 키), `sortSeries`, `parseRaw`(오프셋 유지 파싱 → 익명화 덮어쓰기), `tagsToText(tags, txt|json|csv)`

### `src/js/imageFormats.js`
브라우저가 열지 못하는 이미지의 디코더: TIFF(UTIF.js + pako, 다중 페이지·16-bit), HEIF/HEIC(libheif wasm 번들), JPEG 2000 파일(.jp2 컨테이너에서 `jp2c` 코드스트림 추출 → DICOM과 같은 OpenJPEG 코덱). 모듈은 `DicomDecoder.vendor()`로 처음 필요할 때 로드됩니다. `app.js`의 `decodeImageCanvas`가 확장자에 따라 이 모듈 또는 `createImageBitmap`을 사용하고, 다중 페이지 TIFF는 프레임 바로 페이지를 넘깁니다.

### `src/js/encoders.js`
의존성 없는 인코더: 24-bit BMP, TIFF(8-bit RGB / 16-bit 회색, 해상도 태그), GIF(≤256색은 정확한 팔레트, 그 이상은 median-cut, LZW), 애니메이션 GIF(NETSCAPE 루프), ZIP(store, CRC32). PNG/JPEG/WebP는 `canvas.toBlob`.

### `src/js/viewer.js`
- 뷰 행렬 = T(중심+이동) · R(회전) · S(반전) · S(배율, 배율×종횡비) · T(−w/2, −h/2). `DOMMatrix`로 화면↔이미지 좌표 변환
- HiDPI 캔버스 2장(이미지 / 오버레이). 확대 시 nearest, 축소 시 smoothing
- 도구: pan / wl / zoom / stack / probe / length / angle / rect / ellipse / text. 가운데 버튼=이동, 오른쪽 드래그=W/L(움직이지 않으면 컨텍스트 메뉴), 휠=확대(설정으로 프레임 이동과 교체)
- 오버레이: 측정, 프로브 십자선, `showGrid`(이미지 좌표 10 mm/50 px 격자), `showRuler`(위·왼쪽 가장자리 전체 눈금자 — `clientToImage`로 화면 축을 이미지 축에 대응시켜 선택한 단위(mm/cm/in/px)로 계산, 주 눈금 간격 60–150 px가 되도록 단위 자동 선택, 마우스 위치 표시)
- 측정은 이미지 좌표로 보관(`annotations`). Pixel Spacing 또는 `S.calibration`이 있으면 설정의 `measureUnit`(cm/in)로 자동 표시, 없으면 px. 핸들 드래그, `exportCanvas(burn)`으로 회전/반전 적용본에 주석을 구워 냄
- 이벤트: `view`, `wl{dx,dy}`, `stack{delta}`, `hover`, `measure`, `text`, `context`

### `src/js/app.js`
- 상태 `S`: 현재 파일(`kind: dicom | dicom-meta | image`), 프레임, 렌더된 프레임 캔버스, 설정, 도구, 시네 타이머, 시리즈(파일 목록·정렬 여부·그룹)
- 렌더링 파이프라인: `openFile` → 바이트 읽기 → DICOM 판별 → `DicomDecoder.load` → `renderDicom(opts)` → 프레임 캔버스 → `viewer.setSource` → 모서리 정보·상태·히스토그램·측정 라벨 갱신. 렌더 토큰으로 뒤늦은 결과를 버림
- 시리즈: 폴더의 파일 목록(이름순) 또는 `scanSeries()`로 정렬된 스택. 스택 이동 시 `openFileKeepView`가 W/L·배율·이동을 유지
- 진행률 `Progress`(start/update/finish): 오래 걸리는 작업이 `progress` 팝업(막대·%·취소)을 띄우고 `Dlg.send`로 갱신. 팝업이 준비되면 `ready` 이벤트로 마지막 상태를 다시 보냄
- 인쇄: `print` 팝업이 iframe 미리보기(용지·방향·머리글)를 보여 주고, `print` 이벤트로 HTML을 넘기면 `main.js`가 숨은 창에서 `webContents.print({ silent })` — silent = 시스템 기본 프린터
- 대화상자 파사드 `Dlg`: Electron이면 `electronAPI.popupOpen`, 웹이면 `#modalHost`에 `Dialogs.render`. 이벤트는 kind별 핸들러로 전달(`setting`, `reset`, `done`, `result`, `run`, `closed`). 테마/언어 변경은 `Dlg.broadcast`로 모든 팝업에 전파
- 고급 기능: `openMpr`(정렬된 시리즈 파일 목록 또는 다중 프레임 경로를 payload로 전달 — 팝업이 직접 파일을 읽어 볼륨 구성), `anonymizeAndSave`(`parseRaw` 오프셋에 같은 길이로 덮어쓰기), `exportWebm`(`canvas.captureStream` + `MediaRecorder`)
- 설정: `DEFAULTS` + `Platform.settings`, `applySetting(key, value)`가 즉시 반영, `resetSettings`
- 툴팁(`bindTooltips`): `title`을 `data-tip`으로 옮겨 커스텀 툴팁 표시
- 언어: `lang-toggle` 액션이 ko ↔ en 전환; 버튼에는 전환될 언어의 국기(`Icons.flag('gb' | 'kr')`)만 표시
- 파일 탭 `S.tabs[{ id, path, name, file, snap }]`: `openFile`은 새 탭(또는 `replace`로 현재 탭, 스택 탐색)에 파일을 넣고, 이미 열린 경로는 `activateTab`. 탭을 떠날 때 `saveTabState`(프레임·뷰·윈도우·측정·History)를 저장하고 돌아오면 `restoreTabState`. 디코딩 결과는 최근 6개 탭만 유지(`trimRetained`), 오래된 탭은 `image.release()` 후 전환 시 다시 읽음. 탭 스트립은 `overflow:hidden`이며 넘치면 ◀ ▶ 버튼 표시(`updateTabOverflow`)
- 실행 취소 `History`: 스냅샷(측정 배열, 회전/반전, 윈도우·LUT·컬러맵·반전) 스택. 측정 완료·삭제, 회전/반전, 윈도우 변경(드래그는 `wlend` 이벤트에서 한 번), 컬러맵 등에서 `push()`; `undo/redo`가 스냅샷을 다시 적용(`restoring` 플래그로 재귀 push 방지). 파일당 최대 100단계, 파일 열기 시 `reset()`
- 드라이브 바 `renderDriveBar`: `Platform.roots()`(Electron: 드라이브, 웹: 마운트된 루트)를 폴더 제목 옆 버튼으로; 현재 루트를 강조
- 최근 폴더 `pushRecent`: 설정 `recentDirs`(최대 10) → 파일 메뉴 하위 메뉴, 항목의 × 로 개별 삭제(메뉴 유지), 전체 삭제
- 창 최소 크기 `applyMinWindowSize`: 툴바·메뉴 바 자식 폭의 합을 `window-min-size` IPC로 전달

### `src/js/dialogs.js` · `src/popup.html` · `src/js/popup.js`
대화상자 내용은 `Dialogs.render(kind, box, payload, ctx)` 하나로 정의되고, ctx(`send/close/onMessage/resize`)만 호스트에 따라 다릅니다.
`popup.js`는 `?kind=`로 종류를 읽고 `popup-init`을 받아 렌더한 뒤 `box.getBoundingClientRect()` 높이로 창 크기를 요청합니다(스크롤 없음). 일괄 변환과 MPR은 팝업 안에서 직접 디코더·플랫폼을 사용해 작업합니다(대용량 데이터를 IPC로 옮기지 않음).

### `src/js/themes.js` · `icons.js` · `i18n.js`
- 테마 20종은 CSS 변수 세트로 정의되어 `<html>`의 인라인 custom property로 적용됩니다(`body[data-theme]`, `data-scheme`)
- 아이콘은 24×24 stroke SVG 문자열. `data-icon` 속성이 있는 메뉴/컨텍스트 메뉴 버튼에 `Icons.decorate`가 삽입
- 번역은 `i18n/ko.js`, `i18n/en.js`(스크립트 파일 — `file://`에서 fetch 제한 없음). `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`

## 3. 데이터 흐름 (예: 파일 열기)

```
tree click / drop / open-path
  → App.openPath(path) → Platform.stat → openFile
  → Platform.readFile (Electron: fs → ArrayBuffer / 웹: File.arrayBuffer / fetch)
  → DicomDecoder.isDicom → load(bytes) (파서 + 첫 프레임 디코딩은 지연)
  → renderDicom({ frame 0, resetWindow, overlays }) → image.render → RGBA → canvas
  → viewer.setSource → fit → 'view' 이벤트 → updateCorners / updateStatus
  → refreshPanels (info / tags / histogram / series), updateSeriesFromTree
```

## 4. 빌드

- `electron-builder` (package.json `build`): NSIS + portable(Windows), DMG(x64/arm64), AppImage + deb(Linux), `fileAssociations`로 `.dcm/.dicm/.dicom` 연결(아이콘 `build/dcmfile.ico` → 설치 폴더 `resources/`에 복사되어 탐색기 아이콘으로 등록), `build/icon.*`
- NSIS 커스터마이즈 `build/installer.nsh`(`nsis.include`): `customInit`에서 언인스톨 레지스트리 키(`UNINSTALL_REGISTRY_KEY`)로 기존 설치를 감지해 완전 삭제 / 덮어쓰기 / 취소를 묻고(무인 설치는 설정 유지), `preInstall`에서 설치 폴더·userData 삭제, `customPageAfterChangeDir`로 옵션 페이지(`build/optionsPage.nsh`: 바탕 화면·시작 메뉴 바로 가기, DICOM 기본 프로그램 등록 체크박스), `customInstall`에서 선택하지 않은 바로 가기 삭제와 파일 연결 해제(`APP_UNASSOCIATE`) 또는 Default Programs Capabilities 등록, `customUnInstall`에서 사용자 데이터 삭제 여부 확인. `warningsAsErrors: false`(언인스톨러 빌드에서 미사용 변수 경고)
- 코덱 패키지 중 wasm 파일과 비-`_decode` 빌드는 제외(`files` 패턴) — 디코더는 JS(asm/wasm 인라인) 빌드만 사용
- `scripts/create-icons.js`: `icon.svg`/`dcmfile.svg` → PNG(512) + ICO(16…256; sharp)
- `scripts/build-web.js`: `src/` + 필요한 코덱 스크립트 + `samples/`를 `dist-web/`로 복사 → 정적 호스팅

## 5. 테스트

`npm test` (`node --test`):
- `test/decoder.test.js` — `samples/*.dcm` 전부 디코딩, 렌더, 통계, 히스토그램, 헤더 스캔, 태그 내보내기
- `test/encoders.test.js` — BMP/TIFF 헤더, GIF LZW 라운드트립(자체 디코더), 애니메이션 GIF, ZIP 구조, 양자화
- `test/synthetic.test.js` + `test/helpers/makeDicom.js` — 합성 CT 시리즈(구 팬텀)·다중 프레임 작성기: 정렬, HU 값, `parseRaw` 제자리 편집
- `test/imageFormats.test.js` — TIFF 라운드트립(RGB·16-bit), JP2 박스 파싱, libheif 로드
- `test/ui-modules.test.js` + `test/helpers/dom.js` — 가짜 window로 렌더러 모듈 로드: 테마 20종, ko/en 키 동일성과 HTML의 i18n 키, data-icon 아이콘 존재, 대화상자 레지스트리, 웹 가상 파일 시스템, 툴바 아이콘 전용, package.json 일관성
- `test/reporter.js` — node:test 커스텀 리포터: 파일별 ✔/✘ 목록, 실패 상세, 요약 표(`npm run test:tap`은 기본 TAP)

UI는 Electron을 `--remote-debugging-port`로 띄워 CDP로 조작·스크린샷하는 방식으로 검증했습니다(팝업 창은 별도 페이지 타깃).

## 6. 확장 포인트

- 새 대화상자: `dialogs.js`에 렌더러 추가 + `SIZES` + `app.js`에서 `Dlg.open('kind', payload, handler)`
- 새 내보내기 형식: `encoders.js`에 인코더 추가, `EXPORT_EXT/EXPORT_MIME`, `encodeCanvas` 분기
- 새 테마: `themes.js`의 `mk(...)` 한 줄
- 새 언어: `i18n/<lang>.js` 추가, `index.html`/`popup.html`에 스크립트 포함, 언어 토글 순서(`lang-toggle`) 조정
- 새 도구: `viewer.js`의 `onDown/onMove/onUp` switch, `app.js`의 `labelAnnotation`, 툴바/메뉴 버튼과 단축키
