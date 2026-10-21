# MyDCMViewer — Architecture

## 1. 개요

MyDCMViewer는 **하나의 페이지 코드**(`src/`)를 두 가지 호스트에서 실행합니다.

| 호스트 | 진입점 | 파일 시스템 · 네트워크 | 대화상자 |
| ---- | ---- | ---- | ---- |
| Tauri 2 (Windows/macOS/Linux) | `src-tauri/src/lib.rs` → `index.html` (개발: `http://localhost:5193`, 배포: `dist/`) | Rust 명령(`invoke`) — 파일·대화상자·클립보드·인쇄·폴더 감시·TCP 소켓 | 대화상자마다 별도 창(`popup.html?kind=…`, 메인 창의 자식) |
| 웹 브라우저 | `server.js` 또는 정적 서버의 `dist/` | File System Access API / `<input type=file>` / fetch / 다운로드 (네트워크 없음) | 페이지 안의 모달(`#modalHost`) |

호스트 차이는 `src/js/platform.js`(+ 데스크톱은 `desktop-bridge.js`)가 흡수하고, 그 위의 코드는 호스트를 모릅니다.
번들러 없이 클래식 스크립트(전역 `window.X`)로 작성되며, 순수 모듈(디코더·인코더·프로토콜·필터·3D 계산)은 UMD라 Node 테스트에서 `require` 됩니다. 시작 화면만 ES 모듈(`src/js/start/`)입니다.

```text
┌──────────────────────────────── page (src/) ─────────────────────────────────────┐
│ app.js ── 메뉴·툴바·탭·단축키·렌더링·내보내기·시네·시리즈·Progress·Dlg            │
│  ├─ viewer.js / layout.js      캔버스 변환·측정 도구 / 다중 뷰포트·동기 스크롤·기준선 │
│  ├─ dialogs.js                 대화상자(설정·일괄·MPR·태그 편집·융합·필터·다른 형식…) │
│  │    └─ 지연 등록: volume3d.js(3D), pacs.js(PACS)                                 │
│  ├─ dicomDecoder.js            파서·코덱·LUT·필터·렌더 ── imageFilters.js          │
│  ├─ dicomWriter.js / dicomDocs.js / docViews.js  쓰기·익명화·SC·DICOMDIR / SR·파형·RT │
│  ├─ dicomNet.js ← net-transport.js            DIMSE 프로토콜 ← 소켓 전송             │
│  ├─ imageExport.js · encoders.js · fusion.js · zipReader.js · tour.js · start/     │
│  └─ platform.js ── desktop-bridge.js (window.desktopAPI = Tauri invoke/listen)    │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    │ invoke / emit
┌──────────────────────── Tauri host (src-tauri/src) ──────────────────────────────┐
│ lib.rs  창·팝업 창·설정·파일 명령·대화상자·클립보드·폴더 감시·단일 인스턴스·파일 연결  │
│ files.rs 파일 도우미 · print.rs 프린터 인쇄 · net.rs TCP 소켓/리스너 · window_icon.rs │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Tauri 호스트 (`src-tauri/`)

- **창**: 메인 창은 코드에서 숨긴 채 만들고 페이지가 그린 뒤 `window_ready`로 표시합니다(흰 화면 깜빡임 없음). 창 위치·크기는 `settings.json`(설정 폴더, `MYDCMVIEWER_CONFIG_DIR`로 바꿀 수 있음)에 저장합니다.
- **단일 인스턴스**: 두 번째 실행의 인수(파일)는 실행 중인 창으로 넘깁니다(`open-path`). macOS는 `RunEvent::Opened`.
- **팝업 창**: `popup_open(kind, payload)` → `popup-<kind>` 창. 페이지가 `popup_ready`로 초기 데이터를 받고 `popup_resize`로 내용 크기에 맞춘 뒤 처음 한 번 메인 창 가운데에 표시합니다. 같은 종류는 하나만 열리고, 만드는 중에 또 열면 새 내용만 넘깁니다. 팝업 ↔ 메인 메시지는 `popup_emit` / `popup_send`(이벤트 `popup-event`, `popup-send`)로 중계합니다.
- **명령**: 파일(`fs_read_file` 원시 바이트 응답, `fs_write_file` 원시 본문 + `x-path` 헤더, `fs_read_dir`, `fs_stat`, `fs_trash`, `fs_copy_into` …), 대화상자, 클립보드(이미지·텍스트), 인쇄(`print_pages`: 페이지 JPEG → 프린터), 폴더 감시(`dir-changed`), 설정, 샘플 폴더, 그리고 DICOM 네트워크(아래 5장).
- **테스트 훅**(GUI 테스트 전용 환경 변수): `MYDCMVIEWER_TEST_SAVE_DIR`(저장 대화상자 대신), `_OPEN`, `_FOLDER`, `_ANSWER`(메시지 상자 단추), `_PRINT_DIR`(프린터 대신 JPEG 파일), `MYDCMVIEWER_DEBUG_PORT`(WebView2 CDP 포트).
- **번들**: `tauri.conf.json` — NSIS(한국어/영어, 사용자 단위), dmg/app, AppImage/deb, `.dcm/.dicm/.dicom` 연결, 예제(`resources/samples`). `beforeBuildCommand` 가 `scripts/stage-samples.mjs` 와 `scripts/build-web.js --app` 으로 `dist/` 를 만듭니다. Windows 설치 동작은 `windows/hooks.nsh`(예전 Electron 판 제거, 바로 가기·기본 프로그램 페이지, 데이터 삭제 질문).

## 3. 페이지 모듈

| 모듈 | 역할 |
| ---- | ---- |
| `platform.js` | 파일 시스템·대화상자·설정 추상화. 웹은 가상 경로(`/Samples`, 마운트한 폴더 핸들, ZIP)로 같은 API 제공. `saveFile` 은 진행률 훅(`Platform.progress`)을 부름 |
| `desktop-bridge.js` | `window.desktopAPI`: Tauri `invoke` / 이벤트를 함수로 감쌈 |
| `app.js` | 앱 전체. `Dlg`(대화상자: 데스크톱은 팝업 창, 웹은 모달), `Progress`(진행률 팝업), `History`(실행 취소), 탭, 렌더링 파이프라인, 내보내기, 시네, 시리즈, PACS/3D/필터/융합 연결, `window.App`(테스트용) |
| `viewer.js` | 캔버스 변환(확대·이동·회전·반전), 도구와 측정(길이·각도·Cobb·ROI·다각형·자유곡선·점·화살표·텍스트·돋보기), 눈금자·격자 |
| `layout.js` | 1×1 ~ 3×3 뷰포트, 동기 스크롤(환자 좌표의 같은 위치), 기준선 |
| `dialogs.js` | 대화상자 렌더러 레지스트리(`Dialogs.render(kind, box, payload, ctx)`), `volume`·`pacs` 는 해당 모듈을 지연 조회 |
| `dicomDecoder.js` | 파서(메타 없는 데이터셋, BE, Deflate), 코덱(vendor 지연 로드), Modality/VOI/Presentation LUT, 오버레이, 필터, `image.render()` |
| `dicomWriter.js` | 편집 모델 `parse/get/set/remove/write`, `decompress`, `anonymize`, `secondaryCapture`, `makeDicomDir`, `newUid` |
| `dicomDocs.js` · `docViews.js` | `kindOf`, SR·파형·내장 문서·RT 구조/계획·DICOMDIR·SEG 읽기와 문서 화면 |
| `dicomNet.js` · `net-transport.js` · `pacs.js` | DICOM 네트워크(5장) |
| `volume3d.js` | 볼륨 만들기(위치로 정렬·간격), WebGL2 레이 마칭(VR/MIP/MinIP/평균/등위면), 3D 창 |
| `imageFilters.js` | 가우스·언샤프·소벨·엠보스·중앙값·라플라시안·평활화·양방향·임계값 |
| `imageExport.js` | 45가지 형식 인코더(6장) |
| `fusion.js` | 겹침 영상을 환자 좌표로 재표본화해 컬러맵 합성 |
| `tour.js` | 튜토리얼 단계(`Tour.STEPS`: 대상 선택자 + 한/영 문구 + 데모 명령) |
| `start/` | 시작 화면(`startPage.js`, `sampleList.js`), 3D 배경(`startbg.js`, `start3d/*`) |

스크립트 순서(`index.html`): 디코더 → 쓰기/문서 → 형식·인코더(`imageExport.js` 포함) → 브리지·플랫폼 → 테마·번역·아이콘 → 대화상자 → 트리·뷰어·배치·융합 → 필터·3D·네트워크·PACS → 튜토리얼 → `app.js` → 시작 화면(모듈). `popup.html` 은 대화상자에 필요한 것만 싣습니다.

## 4. 렌더링 파이프라인

```text
파일 바이트 ─ dicomDecoder.load ─▶ image
image.render({ frame, wc, ww, voiLut, colormap, invert, filters })
   프레임 샘플 → Modality LUT/rescale → (filters: imageFilters.chain, 값 단위·캐시) → VOI(window/LUT/SIGMOID) → 반전·컬러맵 → 오버레이
   (컬러·팔레트 영상은 RGBA 에 필터)
app.renderDicom ─▶ fusion.compose(겹침 영상) ─▶ frameCanvas ─▶ viewer(변환·측정) / layout(다른 칸)
내보내기: viewer.exportCanvas(주석 포함 여부) + 원래 값(image.valuesOf) ─▶ encoders / imageExport
```

## 5. DICOM 네트워크

- `dicomNet.js`: 소켓을 모르는 순수 프로토콜. 전송 객체 `{ write, onData, close, onClose }` 위에서 Upper Layer(A-ASSOCIATE/RELEASE/ABORT, P-DATA 조각, 최대 PDU 협상)와 DIMSE(명령 집합, Implicit/Explicit 데이터셋)를 구현합니다. SCU: `echo/find/get/move/store`, `Client`(호출마다 연결 하나). SCP: `serve`(C-ECHO, C-STORE, C-FIND/GET/MOVE — `MemoryArchive` 로 작은 PACS도 됨). `transcode` 훅으로 상대가 받지 않는 압축 영상을 비압축으로 바꿔 보냅니다(앱은 `DicomWriter.decompress`).
- `net-transport.js`: 데스크톱 브리지의 `net_connect / net_send(원시 본문, x-id) / net_close / net_listen / net_stop_listen` 명령과 `net-data`(base64) · `net-closed` · `net-accept` 이벤트로 전송 객체를 만듭니다. 연결 응답보다 먼저 온 데이터는 잠시 보관합니다.
- `src-tauri/src/net.rs`: 소켓 표(id → TcpStream), 소켓마다 읽기 스레드, 리스너 스레드. 앱 종료 시 모두 닫습니다.
- `pacs.js`: PACS 창(노드 목록은 설정 `pacsNodes`, 받은 파일은 `~/MyDCMViewer/PACS/<시각>/`, 끝나면 메인 창에 `retrieved` 로 알려 폴더를 열고 시리즈 정렬).

## 6. 내보내기

- `imageExport.js`: `FORMATS`(id·확장자·MIME·그룹·입력 종류·옵션·가용성)와 `encode(id, input, options)`. 입력은 화면 RGBA, 원래 값(`gray`), 프레임 목록, 화소 간격. PNG/APNG/TIFF/BMP/TGA/PSD/EXR/HDR/FITS/NIfTI/NRRD … 는 직접 쓰고, JPEG 2000·JPEG-LS 는 cornerstone 전체 빌드, AVIF·JPEG XL·WebP(무손실) 는 `@jsquash` wasm, JPEG/WebP 는 캔버스, HEIC 는 WebCodecs HEVC + 직접 쓴 HEIF 컨테이너(가능할 때만).
- 코덱 파일은 처음 쓸 때 `vendor/<패키지>/…` 에서 읽습니다. `server.js` 가 `/vendor/` 로 `node_modules` 를 내주고, `scripts/build-web.js` 가 필요한 파일만 `dist/vendor/` 로 복사합니다(Tauri 는 `node_modules` 라는 폴더를 프런트엔드에 넣지 못함).
- **진행률**: 저장·내보내기·복사 동작은 `runAction` 에서 `Progress` 팝업으로 감싸고, `Platform.saveFile` 은 저장 대화상자 동안 팝업을 숨겼다가 쓰는 동안 다시 띄웁니다. 대화상자 창에서 저장하면 `popup.js` 가 메인 창에 `__progress` 이벤트를 보내 같은 팝업을 띄웁니다. `Progress` 는 한 번에 하나: 닫히는 중이면 닫힘(`closed`)을 기다렸다 새로 엽니다.

## 7. 테스트

| 종류 | 명령 | 내용 |
| ---- | ---- | ---- |
| 단위 | `npm test` | `test/*.test.js` (node:test, `test/reporter.js` 요약 표): 디코더·합성 DICOM·더 많은 전송 구문(`samples/more`)·DICOM 쓰기(pydicom 독립 검증)·문서·네트워크(실제 TCP, 단편화, 거절·시간 초과, transcode, Docker 있으면 Orthanc)·필터·3D·융합·시작 장면·UI 모듈·데스크톱 계약(명령·이벤트·설정·설치 훅)·영상 내보내기(45형식 × sharp/ffmpeg/Pillow/OpenCV/tifffile/명세 리더) |
| Rust | `npm run test:rust` | 파일 도우미, 인쇄 분할, 소켓 루프백 |
| GUI 스모크 | `npm run smoke` / `smoke:desktop` | `scripts/smoke.mjs` + `scripts/cdp.mjs`(Node 22 WebSocket CDP 드라이버): 시작 화면·예제 18종·보기·측정(실제 마우스 끌기)·필터·대화상자(MPR·3D 그림 확인·융합·PACS)·모든 내보내기(진행률 팝업 확인)·문서·튜토리얼 전 단계·두 언어, 데스크톱은 팝업 창·인쇄·PACS(`scripts/mini-pacs.cjs`) 추가. 내보낸 파일은 `scripts/validate-exports.py`(Pillow·pydicom·ffprobe·pdfinfo·명세 리더)로 다시 엽니다 |

## 8. 확장 방법

- **대화상자 추가**: `dialogs.js` 에 렌더러를 쓰고 `RENDERERS` 에 넣거나, 별도 모듈이면 `LAZY` 에 등록. 창 크기는 `SIZES` 또는 모듈의 `SIZE`, 창 제목은 번역 키 `popup.<kind>`.
- **동작 추가**: `index.html` 에 `data-action` 단추, `app.js` 의 `runAction` 에 case. 저장하는 동작이면 `BUSY_ACTIONS` 에 넣어 진행률 팝업을 띄웁니다.
- **호스트 명령 추가**: `lib.rs` 에 `#[tauri::command]` + `generate_handler!`, `desktop-bridge.js` 에 래퍼. `test/desktop-contract.test.js` 가 정의·등록·호출이 맞는지 검사합니다.
- **번역**: `src/i18n/ko.js`, `en.js` 에 같은 키를 넣습니다(`test/ui-modules.test.js` 가 양쪽 키와 HTML 의 `data-i18n` 을 검사).
