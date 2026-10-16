# MyPhotoManager 구조

## 한 코드, 두 실행 환경

UI 는 Vite 로 묶은 바닐라 JavaScript 하나입니다. 실행 환경의 차이는 `src/platform/` 에만 있습니다.

| | 데스크톱 (Tauri 2) | 웹 (PWA) |
|---|---|---|
| 경로 | 실제 경로 `C:\Photos\a.jpg` | 연 폴더 기준 `@3:Photos/2024/a.jpg` |
| 폴더 목록·파일 작업 | Rust 명령 (`list_dir`, `copy_paths`, `move_paths`, `rename_path`, `delete_paths`(휴지통), `create_dir`, `set_modified`) | File System Access API (Chrome·Edge, 쓰기 가능·기억) / `input[webkitdirectory]`·끌어 놓기 (읽기 전용 메모리 폴더) |
| 사진 읽기 | asset 프로토콜 (`convertFileSrc`, 범위 요청, 바뀐 파일은 `?v=` 로 새로 읽음) | `File` → Blob URL |
| 쓰기 | `write_file` — 요청 본문 그대로(base64 없음), 경로는 퍼센트 인코딩 헤더, 임시 파일 후 이름 바꾸기 | `createWritable()`, 읽기 전용이면 내려받기 |
| 카탈로그·설정 | 앱 데이터 폴더 `catalog.sqlite` / `settings.json` (+ localStorage). 예전 `catalog.json` 은 처음 실행 때 옮겨짐 | IndexedDB / localStorage |
| 원본 백업 | `originals/<경로 해시>.<확장자>` (`backup_original` · `restore_original`) | 없음 |
| 기타 | 탐색기에서 보기·기본 프로그램·바탕 화면 배경(`wallpaper` 크레이트), 인쇄, 단일 인스턴스(두 번째 실행의 경로를 넘김), 창 위치 기억, OS 파일 끌어 놓기 | 서비스 워커(오프라인), 매니페스트(설치) |

`fs.caps` 가 기능 차이(휴지통·원본·탐색기 …)를 알려 주고 UI 는 그에 맞춰 메뉴를 켜고 끕니다.

## 상태와 흐름 (`src/store.js`)

`app.state` 에 지금 보는 **원천**(folder / filter / search / calendar / basket / collection / paths), 원천에서 읽은 `items`, 정렬·필터·그룹을 거친 `list`/`groups`, 선택·포커스, 모드, 뒤로/앞으로 기록이 있습니다. 동작(폴더 열기, 선택, 정리, 파일 작업)은 모두 store 함수이고 바뀌면 이벤트(`source`, `items`, `selection`, `catalog`, `info`, `mode` …)를 냅니다. 각 창은 필요한 이벤트만 듣고 다시 그립니다.

## 카탈로그 (`src/catalog/`)

- `catalog.js` — 경로를 키로 한 레코드: 사용자가 넣은 것(별점·레이블·태그·키워드·카테고리·제목·설명·작성자·메모·편집됨)과 앱이 알아낸 것(크기·수정 시각·픽셀 크기·EXIF 요약·dHash). 이름 바꾸기·이동·복사 때 레코드가 따라갑니다. 정리하지 않은 레코드만 있는 사라진 파일은 정리됩니다. 자동 카테고리는 EXIF 요약에서 계산합니다.
- `query.js` — 빠른 검색 문법 파서와 일치 판정, 카탈로그 창의 조합 필터(같은 종류는 OR, 다른 종류는 AND/OR).
- `listing.js` — 자연 정렬(Intl.Collator numeric), 그룹.
- `rename.js` — 템플릿, 충돌 검사, 서로 맞바꾸는 이름을 위한 임시 이름 2단계.
- `dupes.js` — 9×8 회색 축소에서 64비트 dHash, 해밍 거리, 단일 연결 군집.
- 컬렉션 — `catalog.collections`(수동: 경로 목록, 이동·삭제를 따라감 / 스마트: `query.js` 의 `RULE_FIELDS` 규칙과 all·any).
- `gpx.js` — GPX 트랙 지점 읽기, 촬영 시각의 위치(양쪽 지점이 최대 간격 안이면 보간, 아니면 가까운 지점).

저장은 1.2초 디바운스. 데스크톱은 SQLite(`catalog.sqlite`, `catalogdb.rs`): 저장할 때마다 레코드 JSON 을 지난번 쓴 것과 비교해 **바뀐 레코드만** 한 트랜잭션으로 쓰고 사라진 것은 지웁니다(어디서 고친 레코드든 놓치지 않음). 처음 실행 때 예전 `catalog.json` 을 옮깁니다. 웹은 IndexedDB 의 JSON.

## 형식 (`src/formats/`)

- `decode.js` — 형식별로 바로 세운 캔버스/ImageBitmap 을 돌려줍니다.
  - 브라우저 형식: JPEG 는 EXIF 방향을 **직접** 읽고 EXIF 를 뗀 뒤 디코딩해 엔진마다 결과가 같게, 큰 JPEG 는 축소 디코딩.
  - TIFF: UTIF(가장 큰 페이지), HEIC/HEIF: libheif(WebAssembly, 필요할 때만 불러옴, primary 이미지), PSD/PSB: 직접 만든 합성 이미지 리더(비트맵·회색·인덱스·RGB·CMYK·Lab, 1/8/16/32비트, RAW·PackBits·ZIP).
  - RAW: `raw.js` 가 TIFF IFD 사슬·SubIFD·Panasonic JpgFromRaw 에서 브라우저가 읽을 수 있는(베이스라인/프로그레시브) 가장 큰 JPEG 를, RAF 는 헤더에서, 그 밖(CR3 …)은 파일 안의 완전한 JPEG 스트림을 찾습니다. 방향은 RAW 의 IFD0.
- `jpeg-meta.js` — 세그먼트 파서. EXIF 방향 읽기/쓰기(태그가 없으면 IFD0 을 EXIF 블록 끝에 다시 만들어 붙임, 다른 데이터는 그 자리) → **무손실 회전**. 재인코딩한 JPEG 에 원본의 EXIF/XMP/ICC/IPTC 를 다시 넣고, IFD1 썸네일을 끊고 픽셀 크기를 고칩니다. EXIF 날짜를 고정 폭이라 제자리에서 바꿉니다.
- `tiffstruct.js` — IFD 읽기/쓰기, EXIF·GPS 블록 생성(테스트 픽스처도 이것으로 만듦).
- `exif.js` — exifr 결과를 카탈로그 요약으로(카메라 이름 정리, GPS, 내장 XMP 별점·레이블·키워드), 속성 창용 그룹별 태그.
- `xmp.js` — 라이트룸 호환 사이드카. 기존 파일은 우리 속성만 바꾸고 나머지(현상 설정 등)는 남김.
- `encode.js` — 캔버스 인코딩(JPEG/PNG/WebP), BMP·TIFF 직접 쓰기, 16비트 형식은 `highbit.js` 로.
- `xmpembed.js` — PNG(iTXt)·WebP(XMP 청크, VP8X 플래그)·TIFF(태그 700, IFD 를 파일 끝에 다시 씀) 내장 XMP 읽기/쓰기.
- `icc.js` — ICC 프로필(행렬/TRC RGB·회색, gamma·para·table 곡선, v2·v4 이름) 읽기와 sRGB 변환(XYZ D50 → sRGB, Bradford). TIFF(태그 34675)·PSD(리소스 1039)에 쓰입니다.
- `highbit.js` — 16비트 PNG·TIFF 의 정밀 사본(Float32 RGBA), 순서 디더링, 면적 평균 축소, 16비트 TIFF·PNG 쓰기.

## 썸네일 (`src/thumbs/`)

메모리 LRU → IndexedDB(`경로|크기|수정 시각` 키, WebP) → 모듈 워커(최대 4개, OffscreenCanvas). 워커가 디코딩·축소·EXIF 요약·dHash 를 한 번에 하고, 결과가 카탈로그에 들어갑니다. 화면에 보이는 항목이 큐 앞으로 오고 폴더를 떠나면 남은 일은 취소됩니다. SVG·동영상은 페이지에서(동영상은 1초 지점 프레임).

## 이미지 분석 (`src/analysis/`)

폴더를 열면(`app.on('items')` → `autoAnalyze`, 2.5초 뒤) 그 폴더의 사진이 큐에 들어가고, **모듈 워커**(`worker.js`) 하나가 한 장씩 분석합니다. 페이지는 큐·대기·결과 저장만 하므로 화면이 멈추지 않습니다.

- `worker.js` — face-api 에 든 TensorFlow.js(WebGL, 안 되면 CPU)로 두 그래프 모델을 실행: **MobileNet v2**(ImageNet 1000 가지, 224×224, [-1, 1] 정규화, 1001번째 출력은 배경이라 버림 → softmax 상위 5개)와 **SSDLite MobileNet v2**(COCO 80 가지, 긴 변 384, 상자별 최고 점수 → 비최대 억제). 입력은 썸네일(384px)을 OffscreenCanvas 로 그린 것. 색 통계(96px)도 여기서.
- `taxonomy.js` — 순수 함수: `colorStats`(밝기·대비·채도·회색/흰/어둠 비율, 위 1/3 의 파랑·따뜻한 빛, 아래 절반의 파랑·모래, 초록, 평평한 영역, 경계) → `scenesFromStats`(문서·스크린샷·흑백·야경·노을·하늘·자연·눈·바다·해변), `imagenetIds`(번호 범위 + 이름 표), `cocoIds`, `classify`(사람 수 = max(사람 상자, 찾은 얼굴), 확률 합으로 장면·객체, 실내면 하늘·노을 같은 색만의 추측을 버림). 분류 id 는 경로(`object/animal/dog`)라 부모로 걸러도 자식이 나옵니다. `labels.json` 은 ImageNet·COCO 이름.
- `analyzer.js` — 큐(다른 폴더를 열면 교체), 상태 막대 진행(`statusProgress`), 6장마다 `catalog.setAnalysis`, 파일이 같으면(`v`·수정 시각) 다시 하지 않음, 의료 영상·PDF·동영상은 건너뜀. 모델은 `public/models/mobilenet·cocossd` (`scripts/vendor-assets.mjs` 가 처음 한 번 내려받음).
- 카탈로그 창의 *이미지 분석* 과 대시보드 왼쪽의 **분류** 단추는 `categoryCounts` 로 개수를, 필터 `{ type: 'analysis', value }` 로 목록을 만듭니다(부모를 고르면 자식도 포함, 같은 종류끼리는 "또는"). `ui/organize.js` 는 종류별 대표 분류(`primaryCategory`)로 그 목록만 엽니다. 폴더를 만들거나 파일을 복사·이동하지 않고 `folders: 0` 을 돌려줍니다.

## 편집 (`src/edit/`)

- `adjust.js` — ImageData 에 바로 작용하는 순수 함수: 톤 LUT(노출·밝기·S자 대비·레벨·흰/검정·채널별/마스터 단조 3차 곡선), 화이트 밸런스, 밝은/어두운 영역, 색상환 회전, 채도·생동감, 효과, 3-박스 가우시안, 언샵 마스크, 명료도, 에지 보존 노이즈 감소, 비네팅, 고정 시드 그레인, 컨볼루션, 적목, 자동 원천 선택 힐링, 히스토그램, 자동 레벨.
- `geometry.js` — 회전·뒤집기·수평 맞추기(같은 비율의 최대 내접 사각형으로 자동 자르기)·자르기·크기 조절을 **하나의 아핀 행렬**로. 같은 행렬로 그리고, 역행렬로 미리 보기의 클릭을 원본 픽셀로 바꿉니다(적목·힐링 점은 원본 좌표로 저장).
- `pipeline.js` — 보정(원본 좌표: 적목·힐링·복제·**내용 인식 지우기**) → 색·톤(16비트 원본이면 정밀 사본으로 계산해 디더링, 색상 휠, LUT) → 부분 보정(그러데이션·방사형·브러시·올가미·자동 선택·색상 범위 마스크) → 렌즈·원근 → 기하 → 디테일·효과 → 캔버스·테두리·레이어(이미지·조정 레이어, 레이어 마스크)·그리기·텍스트. 미리 보기는 긴 변 1800px 축소본으로, 저장은 원본 크기로 같은 함수를 부릅니다.
- `inpaint.js` — 내용 인식 채우기: 구멍 주변만 잘라 피라미드, 가장 거친 단계는 확산, 단계마다 PatchMatch 최근접 패치 + 가중 투표(고정 시드라 미리 보기와 저장이 같음).
- `lut.js` — `.cube`(1D·3D) 파서, 3선형 보간, 내장 룩, 가져온 LUT 는 앱 데이터에 보관하고 렌더 전에 `prepareEdit` 로 불러옴.
- `create/homography.js` — 원근 파노라마: Harris 코너·정규화 패치 서술자·비율 시험·교차 확인 → RANSAC 호모그래피 → 가운데 사진 평면으로 투영, 노출 이득, 가장자리 가중 혼합. 맞지 않으면 이동 방식(`panorama.js`)으로.

## UI (`src/ui/`, `src/app.js`)

`app.js` 가 메뉴·모드·툴바·창 배치·단축키·시작(명령줄 경로, 마지막 폴더, 웹 폴더 복원)을 맡습니다. 파일 목록(`filelist.js`)은 행 단위 가상화(이진 탐색으로 보이는 행만, 타일은 경로 키로 재사용), 고무줄 선택, 포인터 기반 끌어 놓기(`data-drop` 대상: 폴더 트리·폴더 타일·주소 막대)입니다. 대화상자는 데스크톱에서 각각 독립된 창입니다(`dialog.js`). 단축키는 `keymap.js` 에 관리·보기·편집 모드별 명령으로 등록되어 사용자가 바꿉니다. DICOM 도구(`dicomview.js`: 윈도·측정(클릭 또는 끌기, 다음 점은 포인터를 따라감)·각도·Cobb·눈금자·축척 막대·눈금자와 같은 간격의 격자(칸마다 5×5, 확대·축소를 따라감)·붉은 점선 십자와 + 포인터·− 배율 +·시네·모든 형식으로 프레임 내보내기)는 뷰어 위의 SVG 층입니다(그림 좌표의 측정 층, 화면 좌표의 눈금자·격자·축척·점선 층). 보기 모드에서 언어를 바꾸면 `viewer.relabel()` 만 호출해 그림·배율·프레임을 유지합니다. 필름 스트립은 `app.state.list` 의 폴더와 상위 폴더(아이콘과 실제 이름)를 사진과 함께 보여 주고, 폴더를 열어도 보기 모드에 남습니다. 창의 최소 폭은 `minwidth.js` 가 보이는 툴바의 자연 폭으로 맞춥니다(`set_min_size`). 그 밖에 `quickmeta.js`(빠른 키워드·IPTC 템플릿), `collections.js`, `actions.js`(일괄 작업), `external.js`(외부 편집기), `gpxtag.js`, `videotrim.js`, `themepicker.js`(설정의 테마 탭).

시작 화면 배경(`startbg.js`)은 WebGL 3D 장면 22개입니다(`start3d/`). `gl.js` 의 Kit 이 하늘 돔(구름·별·은하수·성운·레트로 해), 카메라를 따라가는 지형 격자(높이는 `terrain.js` 의 GLSL, 같은 식의 JS 판으로 나는 카메라가 지형 위에 머묾), 물(파도·프레넬, 거울 패스로 하늘·지형·나무 반사), 입자(비·눈·꽃잎·불씨·보케·연기, 상자 안에서 감싸 돎), 조명 메시(`meshes.js` 의 나무·건물·다면체, 나무는 셰이더가 지형 위로 올림), 리본·오로라 커튼을 그립니다. `scenes.js` 의 장면마다 `build`(메시 한 번)와 `draw(시계)` 가 있고, 시계는 카메라·물체·하늘 세 개이며 각각 설정의 속도(`startScreen.cameraSpeed`·`objectSpeed`·`skySpeed`, 전체 `motion`)로 흐릅니다(`startscenes.js` 의 `startRates`). 셋 다 멈추면 그리기 루프도 멈춥니다.

## Rust (`src-tauri/src/`)

- `files.rs` — 폴더 목록(숨김 판정: Windows 속성/점 파일, 하위 폴더 유무 탐색은 최대 4000 항목), 장소 목록, 재귀 탐색, 복사/이동(충돌: 둘 다 유지·덮어쓰기·건너뛰기, 같은 폴더에 복사하면 사본, 드라이브가 다르면 복사 후 삭제), 이름 검사, 휴지통(`trash`), 수정 시각(`filetime`), 원자적 쓰기. 모두 단위 테스트.
- `lib.rs` — 명령 등록, 원본 백업, 앱 데이터, 단일 인스턴스, 패닉 훅(crash.log + UI 알림), 창 생성(WebView2 인자 통일).
- `window_state.rs` — 창 위치·크기·최대화 기억(연결된 모니터에 보일 때만 복원).
- `catalogdb.rs` — SQLite 카탈로그(rusqlite, bundled): files(path, record JSON)·meta 표, 바뀐 것만 쓰는 트랜잭션.
- `mtp.rs` — 휴대폰·카메라(MTP): Windows 는 셸 이름 공간(PowerShell, ASCII 스크립트), Linux 는 GVFS, DCIM·Pictures 의 새 파일만 앱 데이터의 `mtp/` 로 복사. 테스트는 `MYPHOTO_FAKE_MTP`.
- `printing.rs`·`thumbstore.rs` — 바로 인쇄(WebView2), 폴더별 썸네일 저장소.

## 설치 설정

- `tauri.conf.json` — asset 프로토콜 범위 `**`(점으로 시작하는 폴더 포함), NSIS(한국어/영어, 사용자 설치, 훅), deb/rpm(사용자 .desktop 템플릿 + postinst), AppImage, macOS 11+.
- `windows/hooks.nsh` (UTF-8 BOM) — 이전 데이터 삭제 질문, 이전 설치 완전 제거, "연결 프로그램" 등록(OpenWithProgids·SupportedTypes, 기본 프로그램은 바꾸지 않음)과 제거 시 해제.
- `Info.plist` — 이미지·폴더 Viewer, LSHandlerRank Alternate.
- `scripts/build.mjs` — Tauri 번들 → `release/` 이름 정리, 웹 앱 ZIP(자체 ZIP 작성기), `build-linux-docker.mjs` — Docker 로 리눅스 패키지.

## 테스트

`scripts/test.mjs` 가 분류별로 실행하고 결과를 표로 보여 줍니다. E2E 는 WebView2/Edge 의 DevTools 프로토콜을 Node 22 WebSocket 으로 직접 다룹니다(`test/e2e/cdp.mjs`). 데스크톱 E2E 는 앱마다 따로 WebView2 프로필·설정·데이터 폴더(`MYPHOTO_CONFIG_DIR`, `MYPHOTO_DATA_DIR`, `MYPHOTO_MULTI`)와 픽스처 사진 사본을 써서 사용자의 것을 건드리지 않습니다. 앱은 `window.__myphoto` 로 상태와 동작을 노출합니다(`menu(메뉴, 번역 키…)` 는 메뉴 항목을 클릭처럼 실행, `viewer.debug()`·`editor.debug()` 는 내부 상태). 네이티브 폴더·파일·저장 선택 창은 `window.__myphotoPicks` 에 넣어 둔 답을 차례로 씁니다. 백엔드의 `MYPHOTO_FAKE_SHELL`(탐색기·기본 프로그램·메일·바탕 화면·연결 프로그램을 기록만)과 `MYPHOTO_FAKE_SCANNER`(스캐너 대신 파일 복사)는 기능 E2E 가 시스템을 건드리지 않게 합니다. 기능마다 ID 가 있고(`test/features.mjs`), 각 테스트는 확인하는 ID 를 적어 둡니다.
