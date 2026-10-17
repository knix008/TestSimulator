# 기능 점검표

기준: 관리(Manage)·보기(View)·현상(Develop)·편집(Edit)·사람(People)·미디어(Media)·대시보드 모드와 도구.

아래 표의 기능은 모두 구현되어 있습니다. 기능마다 ID 가 있고(`test/features.mjs`), 그 ID 를 확인하는 테스트가 적어도 하나 있어야 합니다. 범위가 다른 점은 맨 아래 "범위가 다른 점"에 있습니다.

- **단위**: `test/unit` — 디코더·인코더·보정 알고리즘·카탈로그·검색을 Node 에서 확인
- **정적**: `test/static` — 설치 설정·웹 앱 파일, 그리고 이 표의 모든 ID 에 테스트가 있는지(`features.test.js`)
- **웹 E2E**: `test/e2e/web.suite.mjs` — 웹 빌드를 헤드리스 Edge/Chrome 에서 조작
- **데스크톱 E2E**: `test/e2e/desktop.suite.mjs` — 실제 앱(Tauri)의 기본 기능
- **기능 E2E**: `test/e2e/features.suite.mjs` — 실제 앱에서 기능마다 메뉴·대화 상자·도구를 조작하고 화면과 디스크의 결과(파일 바이트, EXIF, 픽셀)를 확인

`npm test` 가 모두 실행합니다(`npm test -- --only features` 로 기능 E2E 만). 표는 `node scripts/feature-table.mjs` 가 테스트에서 ID 를 모아 다시 씁니다.

테스트가 시스템을 건드리지 않도록 앱은 두 가지 시험용 환경 변수를 받습니다.

- `MYPHOTO_FAKE_SHELL=<기록 파일>`: 탐색기·기본 프로그램·메일·바탕 화면·"연결 프로그램 선택"을 실행하지 않고 기록만 합니다.
- `MYPHOTO_FAKE_SCANNER=<그림 파일>`: 스캐너 대신 그 파일을 "스캔"합니다.

얼굴 감지는 실제 얼굴 사진이 있어야 확인할 수 있습니다. 테스트는 `../FaceAlgorithm/images/2025-09-30-111123.jpg` 를 실행 중에만 임시 폴더로 복사해 쓰고, 그 파일이 없으면 이 경우를 건너뜁니다. 사진은 프로젝트에 넣지 않습니다.

## 기능과 테스트

<!-- feature-table:start -->

### 관리 · 탐색

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `BROWSE-TREE` | 폴더 트리·하위 폴더 이동 | 데스크톱 E2E |
| `BROWSE-DRIVES` | 시스템의 모든 드라이브(이름·여유 공간)를 보고 선택 | 기능 E2E |
| `BROWSE-VIEWS` | 보기 방식: 썸네일·목록·세부 | 데스크톱 E2E |
| `BROWSE-TILES` | 보기 방식: 타일·필름 스트립 | 기능 E2E |
| `BROWSE-SORT` | 정렬·그룹·필터 | 단위 · 데스크톱 E2E |
| `BROWSE-SEARCH` | 빠른 검색·고급 검색 문법 | 단위 · 데스크톱 E2E · 기능 E2E |
| `BROWSE-SAVEDSEARCH` | 저장된 검색 | 기능 E2E |
| `BROWSE-ALLMEDIA` | 모든 미디어(카탈로그 전체) | 단위 · 기능 E2E |
| `BROWSE-BASKET` | 이미지 바구니 | 기능 E2E |
| `BROWSE-CALENDAR` | 달력 창 | 데스크톱 E2E |
| `BROWSE-MAP` | 지도 창 | 데스크톱 E2E · 기능 E2E |
| `BROWSE-DASHBOARD` | 대시보드 | 데스크톱 E2E |
| `BROWSE-PREVIEW` | 미리 보기 창·히스토그램 | 기능 E2E |
| `BROWSE-THUMBS` | 폴더별 썸네일 저장소: 열면 백그라운드로 모두 만들고(상태 표시줄 진행률) 다음에는 저장된 썸네일을 바로 사용 | 기능 E2E |
| `BROWSE-ZIP` | ZIP 보관함 안의 사진 탐색 | 웹 E2E · 기능 E2E |

### 관리 · 정리·사람·비공개

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `ORG-RATING` | 별점 | 단위 · 웹 E2E · 데스크톱 E2E |
| `ORG-LABEL` | 색 레이블 | 단위 · 웹 E2E · 데스크톱 E2E |
| `ORG-TAG` | 태그 | 단위 · 데스크톱 E2E |
| `ORG-KEYWORDS` | 키워드 | 단위 · 웹 E2E · 데스크톱 E2E |
| `ORG-HIERKEY` | 계층 키워드(부모|자식) | 단위 · 기능 E2E |
| `ORG-QUICKKEY` | 빠른 키워드 세트: 버튼·Alt+Shift+숫자로 키워드 토글 | 기능 E2E |
| `ORG-COLLECTION` | 컬렉션: 폴더와 상관없는 사진 목록 | 기능 E2E |
| `ORG-SMARTCOLLECTION` | 스마트 컬렉션: 규칙(별점·키워드·날짜·카메라…)으로 자동 구성 | 기능 E2E |
| `ORG-CATEGORIES` | 카테고리 | 단위 · 데스크톱 E2E |
| `ORG-AUTOCAT` | 자동 카테고리(카메라·렌즈·ISO …) | 단위 |
| `ORG-CATALOGPANE` | 카탈로그 창으로 조합 필터 | 단위 · 데스크톱 E2E |
| `ORG-BACKUP` | 카탈로그 백업·복원(JSON) | 단위 |
| `ORG-PEOPLE-DETECT` | 사람: 얼굴 감지 | 기능 E2E |
| `ORG-PEOPLE-NAME` | 사람: 얼굴에 이름 붙이기 | 단위 · 기능 E2E |
| `ORG-PEOPLE-SUGGEST` | 사람: 같은 얼굴 이름 제안(인식) | 단위 · 기능 E2E |
| `ORG-PEOPLE-BROWSE` | 사람: 사람별 탐색·이름 바꾸기 | 단위 · 기능 E2E |
| `ORG-PRIVATE` | 비공개 폴더(암호·암호화) | 기능 E2E |
| `ORG-ANALYSIS` | 이미지 분석·자동 분류(인물·장면·객체, 백그라운드 워커) | 기능 E2E |
| `ORG-ANALYSISFOLDERS` | 분류별로 모아서 보기(파일은 그대로, 폴더를 만들지 않음) | 기능 E2E |

### 메타데이터

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `META-EXIF` | EXIF 읽기(카메라·노출·GPS·촬영일) | 단위 · 웹 E2E · 데스크톱 E2E |
| `META-IPTC` | IPTC/XMP 전체 필드 편집 | 단위 · 기능 E2E |
| `META-TEMPLATE` | IPTC 메타데이터 템플릿: 공통 값을 이름으로 저장하고 한 번에 적용 | 기능 E2E |
| `META-EXIFEDIT` | EXIF 편집 | 단위 · 기능 E2E |
| `META-EMBED` | 메타데이터를 파일에 넣기(JPEG XMP 임베드) | 단위 · 기능 E2E |
| `META-EMBED-MORE` | PNG·WebP·TIFF 에 XMP 내장 | 기능 E2E |
| `META-SIDECAR` | XMP 사이드카 | 단위 · 데스크톱 E2E |
| `META-GEOTAG` | 지도에 끌어 놓아 지오태그 | 기능 E2E |
| `META-GPX` | GPX 트랙으로 위치 지정(보간·시계 차이) | 기능 E2E |
| `META-PLACES` | 주소 찾기(역지오코딩) | 기능 E2E |
| `META-BATCH` | 여러 장 메타데이터 한꺼번에 편집 | 기능 E2E |

### 파일·가져오기·공유

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `FILE-OPS` | 새 폴더·이름 바꾸기·복사·이동·삭제 | 데스크톱 E2E |
| `FILE-CLIPBOARD` | 잘라내기·복사·붙여넣기(클립보드) | 기능 E2E |
| `FILE-IMPORT` | 가져오기: 하위 폴더 규칙·이름·중복 건너뛰기·메타데이터·원본 삭제 | 기능 E2E |
| `FILE-MTP` | 휴대폰·카메라(MTP)에서 가져오기 | 기능 E2E |
| `FILE-SCAN` | 스캐너에서 가져오기 | 기능 E2E |
| `FILE-SYNC` | 폴더 동기화 | 기능 E2E |
| `FILE-OPENWITH` | 연결 프로그램 선택·기본 프로그램·탐색기에서 보기 | 정적 · 기능 E2E |
| `FILE-EXTEDITOR` | 외부 편집기 등록·선택한 사진 넘기기 | 기능 E2E |
| `FILE-SHARE` | 공유(이메일)·클립보드로 이미지 복사 | 기능 E2E |
| `FILE-WALLPAPER` | 바탕 화면 배경 | 기능 E2E |
| `FILE-DUPLICATES` | 중복 찾기 | 단위 · 데스크톱 E2E |
| `FILE-COMPARE` | 비교 보기 | 데스크톱 E2E |
| `FILE-KEYS` | 단축키 사용자 지정 | 단위 · 기능 E2E |

### 보기

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `VIEW-NAV` | 보기 모드: 이동·확대·맞춤 | 웹 E2E · 데스크톱 E2E · 기능 E2E |
| `VIEW-FULLSCREEN` | 전체 화면 | 기능 E2E |
| `VIEW-INFO` | 정보·히스토그램 오버레이 | 웹 E2E |
| `VIEW-NAVIGATOR` | 내비게이터 | 기능 E2E |
| `VIEW-LOUPE` | 돋보기(루페) | 기능 E2E |
| `VIEW-ZOOMLOCK` | 확대 고정 | 단위 · 기능 E2E |
| `VIEW-PAGES` | 여러 페이지(TIFF·PDF) 넘기기 | 기능 E2E |
| `VIEW-PIXEL` | 픽셀 정보 | 기능 E2E |
| `VIEW-FACES` | 얼굴 표시와 이름 붙이기 | 기능 E2E |
| `VIEW-VIDEO` | 동영상 재생 | 기능 E2E |
| `VIEW-FRAME` | 동영상 프레임 저장 | 기능 E2E |
| `VIEW-VIDEOTRIM` | 동영상 자르기(시작·끝 → 새 WebM) | 기능 E2E |
| `VIEW-VIDEOOPTS` | 동영상 재생·화면 옵션 | 기능 E2E |
| `VIEW-ANIMPLAY` | 움직이는 그림(GIF·APNG·WebP)·동영상 재생·일시정지·정지·프레임 이동 | 기능 E2E |
| `VIEW-FILMSTRIPNAV` | 필름 스트립 양쪽의 ◀ ▶ 이동 단추(보기 모드·관리의 필름 스트립 보기) | 기능 E2E |
| `VIEW-SLIDESHOW` | 슬라이드 쇼 | 데스크톱 E2E |
| `VIEW-DICOM` | DICOM 보기: 윈도/레벨·미리 설정·반전·색상표·VOI·오버레이·프레임·시네·거리·ROI 통계·태그·귀퉁이 정보·방향 표시·값(HU)·프레임 저장 | 단위 · 기능 E2E |
| `VIEW-DICOMSCALE` | DICOM 눈금자·축척 비율·실제 크기 | 기능 E2E |
| `VIEW-DICOMANGLE` | DICOM 각도·Cobb 각 측정 | 기능 E2E |
| `VIEW-DICOMCLICK` | DICOM 측정을 클릭으로(각도 세 번, 거리·Cobb 두 번) 또는 끌어서 | 기능 E2E |
| `VIEW-DICOMGRID` | DICOM 격자(눈금자와 같은 간격의 정사각형, 칸마다 5×5, 확대·축소를 따라감) 켜기/끄기 | 기능 E2E |
| `VIEW-DICOMZOOM` | DICOM 막대의 축소·배율·확대와 축척 비율이 함께 바뀜 | 기능 E2E |
| `VIEW-DICOMEXPORT` | DICOM 프레임(한 장 또는 전부)을 지원하는 모든 형식으로 내보내기 | 기능 E2E |
| `VIEW-DICOMCINE` | DICOM 시네를 동영상으로 저장 | 기능 E2E |
| `VIEW-MEASUREUNIT` | 길이 단위 설정(mm·cm·inch) | 기능 E2E |
| `VIEW-DICOMTOOLS` | DICOM 측정 기록·프레임별 측정·시네 방식·단축키·프레임/태그 내보내기 | 기능 E2E |

### 현상·편집

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `EDIT-LIGHT` | 노출·대비·밝기·하이라이트·섀도 | 단위 · 데스크톱 E2E · 기능 E2E |
| `EDIT-COLOR` | 채도·생동감·색온도·색조 | 단위 · 기능 E2E |
| `EDIT-WHEELS` | 색상 균형 휠(어두운·중간·밝은 영역), 히스토그램 아래 | 단위 · 기능 E2E |
| `EDIT-16BIT` | 16비트 정밀 처리(16비트 PNG·TIFF 읽기·저장, 띠 없는 보정) | 단위 · 기능 E2E |
| `EDIT-WBPICK` | 화이트 밸런스 스포이트 | 단위 · 기능 E2E |
| `EDIT-LEVELS` | 레벨·톤 곡선 | 단위 · 기능 E2E |
| `EDIT-COLOREQ` | Color EQ | 단위 · 기능 E2E |
| `EDIT-LIGHTEQ` | Light EQ | 단위 · 기능 E2E |
| `EDIT-SPLIT` | 스플릿 토닝 | 단위 · 기능 E2E |
| `EDIT-DEHAZE` | 안개 제거 | 단위 · 기능 E2E |
| `EDIT-DETAIL` | 선명·명료도·노이즈 감소 | 단위 · 기능 E2E |
| `EDIT-LENS` | 렌즈 보정(왜곡·색수차·주변부) | 단위 · 기능 E2E |
| `EDIT-PERSPECTIVE` | 원근 보정 | 단위 · 기능 E2E |
| `EDIT-CROP` | 자르기·회전·뒤집기·수평 | 단위 · 데스크톱 E2E |
| `EDIT-LINE` | 선을 그어 수평 맞추기 | 기능 E2E |
| `EDIT-RESIZE` | 크기 조절 | 단위 · 기능 E2E |
| `EDIT-SAVEAS` | 다른 형식으로 저장: 읽을 수 있는 모든 형식(JPEG·PNG·WebP·BMP·TIFF·GIF·JPEG 2000·JPEG XL·PSD·PDF·DICOM·ICO·TGA·QOI·PPM·PCX·SGI·RAS·DDS·HDR·XBM) | 단위 · 기능 E2E |
| `EDIT-CANVAS` | 캔버스 크기 | 단위 · 기능 E2E |
| `EDIT-REDEYE` | 적목 제거 | 단위 · 데스크톱 E2E |
| `EDIT-HEAL` | 잡티 제거 | 단위 · 기능 E2E |
| `EDIT-CLONE` | 복제 도장 | 단위 · 기능 E2E |
| `EDIT-ERASE` | 내용 인식 지우기(칠한 곳을 주변으로 채움) | 기능 E2E |
| `EDIT-SKIN` | 피부 보정 | 단위 · 기능 E2E |
| `EDIT-LOCAL` | 부분 보정: 그러데이션·방사형·브러시 | 단위 · 기능 E2E |
| `EDIT-SELECT` | 선택 영역: 올가미·요술봉·반전 | 기능 E2E |
| `EDIT-BG` | 배경 제거: 사각형·타원·원·자유 선택으로 고른 영역을 보여 주고, 취소하거나 배경 제거를 눌러 알고리즘으로 지운 뒤 객체 크기의 투명한 그림으로 저장 | 단위 |
| `EDIT-SNIP` | 선택 영역 복사·잘라내기: 사각형·타원·원·자유 선택, 툴바·컨텍스트 메뉴·단축키, 잘라낸 그림은 다른 프로그램에 붙여 넣는다 | 단위 · 기능 E2E |
| `EDIT-PIXELTARGET` | 픽셀 타기팅: 색상·밝기 범위로 보정 대상 선택 | 기능 E2E |
| `EDIT-EFFECTS` | 특수 효과 묶음 | 단위 · 웹 E2E · 기능 E2E |
| `EDIT-RESET` | 섹션·효과별 원본 값으로 되돌리기 | 기능 E2E |
| `EDIT-LUT` | LUT: 내장 룩·.cube(1D/3D) 가져오기, 강도 | 기능 E2E |
| `EDIT-SNAPSHOT` | 편집 스냅숏: 이름 붙여 저장·되돌리기 | 기능 E2E |
| `EDIT-TILTSHIFT` | 틸트시프트 | 단위 · 기능 E2E |
| `EDIT-TEXT` | 텍스트·워터마크·테두리 | 웹 E2E · 기능 E2E |
| `EDIT-DRAW` | 그리기 도구 | 단위 · 기능 E2E |
| `EDIT-LAYERS` | 레이어(혼합 모드·불투명도) | 단위 · 기능 E2E |
| `EDIT-ADJLAYER` | 조정 레이어 | 기능 E2E |
| `EDIT-LAYERMASK` | 레이어 마스크(그러데이션·타원·브러시·반전) | 기능 E2E |
| `EDIT-HISTORY` | 기록 창·실행 취소/다시 실행 | 웹 E2E · 데스크톱 E2E · 기능 E2E |
| `EDIT-PRESETS` | 프리셋 저장·적용 | 단위 · 기능 E2E |
| `EDIT-LOOKS` | 효과 프리셋(룩) 189종: 왼쪽 패널에 항상 표시, 미리 보기, 강도·세밀 조정 | 기능 E2E |
| `EDIT-COPYPASTE` | 편집 설정 복사·붙여넣기 | 단위 · 기능 E2E |
| `EDIT-NONDESTRUCTIVE` | 비파괴 재편집(원본+설정) | 단위 · 기능 E2E |
| `EDIT-RESTORE` | 원본으로 복원 | 데스크톱 E2E · 기능 E2E |
| `EDIT-RAW` | RAW 현상(LibRaw 디모자이크) | 웹 E2E · 기능 E2E |

### 만들기

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `CREATE-PRINT` | 인쇄·밀착 인화 | 데스크톱 E2E · 기능 E2E |
| `CREATE-PDF` | PDF 만들기 | 단위 · 웹 E2E · 기능 E2E |
| `CREATE-GIF` | 애니메이션 GIF | 단위 · 기능 E2E |
| `CREATE-PANORAMA` | 파노라마 | 단위 · 기능 E2E |
| `CREATE-PANOPERSP` | 원근 파노라마(호모그래피 정합) | 단위 |
| `CREATE-HDR` | HDR 합성 | 단위 · 기능 E2E |
| `CREATE-FOCUS` | 초점 스태킹 | 단위 · 기능 E2E |
| `CREATE-SLIDESHOW` | 슬라이드 쇼 내보내기(동영상·HTML) | 기능 E2E |
| `CREATE-MUSIC` | 슬라이드 쇼 배경 음악(재생·동영상·HTML) | 기능 E2E |
| `CREATE-ZIP` | ZIP 만들기 | 단위 · 웹 E2E · 기능 E2E |

### 일괄 처리

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `BATCH-RENAME` | 일괄 이름 바꾸기 | 단위 · 데스크톱 E2E |
| `BATCH-RESIZE` | 일괄 크기 조절 | 데스크톱 E2E |
| `BATCH-CONVERT` | 형식 변환 | 단위 · 데스크톱 E2E · 기능 E2E |
| `BATCH-ADJUST` | 일괄 자동 보정 | 기능 E2E |
| `BATCH-ROTATE` | 무손실 회전·뒤집기 | 단위 · 데스크톱 E2E |
| `BATCH-DATES` | 촬영 날짜 바꾸기 | 단위 · 데스크톱 E2E |
| `BATCH-WATERMARK` | 워터마크 일괄 | 기능 E2E |
| `BATCH-PRESET` | 프리셋 일괄 적용 | 단위 · 기능 E2E |
| `BATCH-ACTIONS` | 일괄 작업(Actions): 단계 기록·재생 | 기능 E2E |
| `BATCH-AUTOROTATE` | EXIF 기준 자동 회전 | 기능 E2E |
| `BATCH-FILETIME` | 파일 날짜 ← 촬영일 | 기능 E2E |

### 형식

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `FMT-COMMON` | JPEG·PNG·WebP·BMP·GIF | 단위 · 데스크톱 E2E |
| `FMT-TIFF` | TIFF | 웹 E2E · 데스크톱 E2E |
| `FMT-TIFFPAGES` | 여러 페이지 TIFF | 단위 · 웹 E2E · 기능 E2E |
| `FMT-HEIC` | HEIC/HEIF | 단위 · 웹 E2E · 데스크톱 E2E |
| `FMT-AVIF` | AVIF | 단위 · 웹 E2E · 기능 E2E |
| `FMT-PSD` | PSD | 단위 · 웹 E2E · 데스크톱 E2E |
| `FMT-RAW` | 카메라 RAW(DNG 등) | 단위 · 웹 E2E · 데스크톱 E2E · 기능 E2E |
| `FMT-ICO` | ICO | 단위 · 웹 E2E · 기능 E2E |
| `FMT-SVG` | SVG | 단위 · 웹 E2E · 기능 E2E |
| `FMT-EXTRA` | TGA·PCX·PNM·HDR·DDS·SGI·RAS·XBM·QOI | 단위 · 웹 E2E · 기능 E2E |
| `FMT-JP2` | JPEG 2000 | 단위 · 웹 E2E · 기능 E2E |
| `FMT-JXL` | JPEG XL | 단위 · 웹 E2E · 기능 E2E |
| `FMT-PDF` | PDF 보기 | 단위 · 웹 E2E · 기능 E2E |
| `FMT-DICOM` | DICOM(DCM): 모든 전송 구문·압축(JPEG·JPEG-LS·JPEG 2000·RLE)·여러 프레임 | 단위 · 기능 E2E |
| `FMT-ICC` | ICC 색 관리(내장 프로필 → sRGB) | 기능 E2E |
| `FMT-GIF` | 애니메이션 GIF 보기 | 단위 · 웹 E2E · 기능 E2E |
| `FMT-VIDEO` | 동영상 형식 | 단위 · 웹 E2E · 기능 E2E |
| `FMT-ZIP` | ZIP 읽기 | 단위 · 기능 E2E |

### 앱

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `APP-SETTINGS` | 설정 창 | 단위 · 기능 E2E |
| `APP-THEMES` | 테마 40개(어둡게 20·밝게 20)·테마 버튼·드롭다운·사용자 정의 테마 | 단위 · 기능 E2E |
| `APP-STARTBG` | 시작 화면 배경 효과 22종 모두 WebGL 3D(하늘·지형·물 반사·입자·나무·건물·리본), 전체·카메라·물체·하늘 속도 각각 조절 | 단위 |
| `APP-THEMETAB` | 설정의 테마 탭(미리 보기 카드) | 기능 E2E |
| `APP-ABOUTFORMATS` | 정보 창: 지원하는 모든 파일 형식 | 기능 E2E |
| `APP-HEADER` | 머리글: 테마·언어(국기 토글)·설정(톱니바퀴)·정보, 대시보드 왼쪽의 분류 버튼 | 기능 E2E |
| `APP-MINWIDTH` | 창의 최소 폭이 툴바 단추가 모두 보이는 폭(모드마다 따라감) | 기능 E2E |
| `APP-TUTORIAL` | 튜토리얼: 시작 화면에서 실행, 장·단계별 진행, 자동 재생, 끝내면 설정 복원(사용자 파일 그대로) | 기능 E2E |
| `APP-PANELS` | 좌우 패널: 제목(아이콘)·< > 로 접기·접었을 때 아이콘과 제목·툴바 보이기 버튼 | 기능 E2E |
| `APP-WORKSPACE` | 작업 공간: 창 배치를 이름으로 저장·전환 | 기능 E2E |
| `APP-ZOOMBAR` | 사진 보기: 축소·현재 배율·확대 | 기능 E2E |
| `APP-KEYS-MODES` | 보기·편집 모드 단축키 사용자 지정 | 기능 E2E |
| `APP-MENUS` | 모든 메뉴 항목에 아이콘 | 기능 E2E |
| `APP-WINDOWS` | 설정·정보와 모든 팝업이 독립된 창(아이콘·제목, 크기 고정, 내용이 잘리지 않음) | 기능 E2E |
| `APP-INPUTS` | 수치 입력의 − + 버튼과 가운데 정렬, 색 선택은 원형 견본 | 기능 E2E |

### 파일·가져오기·공유

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `FILE-RECENT` | 최근 폴더·파일 10개(파일 메뉴), 하나씩·전체 지우기, 시작할 때 마지막 폴더 | 단위 · 기능 E2E |

### 관리 · 탐색

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `BROWSE-SUMMARY` | 선택이 없을 때 오른쪽 패널에 목록 요약(형식·날짜·카메라·별점) | 기능 E2E |

### 앱

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `APP-UNDO` | 파일 작업(이동·복사·이름·새 폴더) 실행 취소/다시 실행 버튼 | 기능 E2E |
| `APP-LANG` | 한국어·영어 | 단위 · 웹 E2E · 데스크톱 E2E |
| `APP-PERSIST` | 종료 후 카탈로그·마지막 폴더 유지 | 웹 E2E · 데스크톱 E2E |
| `APP-SQLITE` | SQLite 카탈로그(바뀐 기록만 저장, JSON 에서 옮기기) | 데스크톱 E2E |
| `APP-WEB` | 웹 앱(브라우저·PWA) | 정적 · 웹 E2E |
| `APP-INSTALL` | 설치 파일(Windows·macOS·Linux) | 정적 |

<!-- feature-table:end -->

## 범위가 다른 점

비교해 찾은 빈 곳(빠른 키워드, IPTC 템플릿, 컬렉션·스마트 컬렉션, 작업 공간, 외부 편집기, 보기·편집 단축키, 스냅숏, LUT, 선택 영역·픽셀 타기팅, 레이어 마스크·조정 레이어, 내용 인식 지우기, 원근 파노라마, PNG·WebP·TIFF XMP 내장, GPX 지오태깅, 슬라이드 쇼 음악, 동영상 자르기, 일괄 작업, ICC 색 관리, 16비트 처리, MTP 가져오기, SQLite 카탈로그)는 모두 구현해 위 표에 기능 ID 와 테스트가 있습니다. 다만 다음은 범위가 다릅니다.

| 기능 | 이 프로그램 |
| --- | --- |
| 16비트 처리 | 16비트 PNG·TIFF 를 정밀 사본으로 읽어 전체 톤·색 보정(노출, 대비, 레벨, 곡선, 화이트 밸런스, 채도 …)을 부동소수로 처리하고 디더링합니다. 톤·색 보정만 한 경우 16비트 PNG·TIFF 로 저장합니다. 그 밖의 단계(부분 보정, 효과, 레이어 …)는 8비트입니다. |
| ICC 색 관리 | 행렬/TRC 프로필(RGB·회색)을 sRGB 로 변환합니다. 룩업 테이블만 있는 프로필(CMYK 등)은 변환하지 않고 이름만 보여 줍니다. JPEG·PNG·WebP 는 화면 엔진이 변환합니다. |
| MTP 가져오기 | Windows(셸 이름 공간)와 Linux(GVFS)에서 됩니다. macOS 는 시스템 MTP 접근이 없어 기기 목록이 비어 있습니다. |

## 구현하지 않는 것 (이유)

| 기능 | 이유 |
| --- | --- |
| 365 클라우드·Mobile Sync | 자체 온라인 서비스·앱 전용 프로토콜 |
| Photoshop 플러그인(.8bf) | Windows 전용 네이티브 DLL — 웹·macOS·Linux 에서 실행 불가 |
| 디스크 굽기 | 운영체제 기능으로 대체(현대 OS 에서도 빠지는 기능) |
