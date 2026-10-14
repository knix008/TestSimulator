# ACDSee 대비 기능 점검표

기준: ACDSee Photo Studio Home / Professional / Ultimate 의 관리(Manage)·보기(View)·현상(Develop)·편집(Edit)·사람(People)·미디어(Media)·대시보드 모드와 도구.

아래 표의 기능은 모두 구현되어 있습니다. 기능마다 ID 가 있고(`test/features.mjs`), 그 ID 를 확인하는 테스트가 적어도 하나 있어야 합니다.

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
| `BROWSE-TREE` | 폴더 트리·드라이브·하위 폴더 이동 | 데스크톱 E2E |
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
| `BROWSE-ZIP` | ZIP 보관함 안의 사진 탐색 | 웹 E2E · 기능 E2E |

### 관리 · 정리·사람·비공개

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `ORG-RATING` | 별점 | 단위 · 웹 E2E · 데스크톱 E2E |
| `ORG-LABEL` | 색 레이블 | 단위 · 웹 E2E · 데스크톱 E2E |
| `ORG-TAG` | 태그 | 단위 · 데스크톱 E2E |
| `ORG-KEYWORDS` | 키워드 | 단위 · 웹 E2E · 데스크톱 E2E |
| `ORG-HIERKEY` | 계층 키워드(부모|자식) | 단위 · 기능 E2E |
| `ORG-CATEGORIES` | 카테고리 | 단위 · 데스크톱 E2E |
| `ORG-AUTOCAT` | 자동 카테고리(카메라·렌즈·ISO …) | 단위 |
| `ORG-CATALOGPANE` | 카탈로그 창으로 조합 필터 | 단위 · 데스크톱 E2E |
| `ORG-BACKUP` | 카탈로그 백업·복원(JSON) | 단위 |
| `ORG-PEOPLE-DETECT` | 사람: 얼굴 감지 | 기능 E2E |
| `ORG-PEOPLE-NAME` | 사람: 얼굴에 이름 붙이기 | 단위 · 기능 E2E |
| `ORG-PEOPLE-SUGGEST` | 사람: 같은 얼굴 이름 제안(인식) | 단위 · 기능 E2E |
| `ORG-PEOPLE-BROWSE` | 사람: 사람별 탐색·이름 바꾸기 | 단위 · 기능 E2E |
| `ORG-PRIVATE` | 비공개 폴더(암호·암호화) | 기능 E2E |

### 메타데이터

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `META-EXIF` | EXIF 읽기(카메라·노출·GPS·촬영일) | 단위 · 웹 E2E · 데스크톱 E2E |
| `META-IPTC` | IPTC/XMP 전체 필드 편집 | 단위 · 기능 E2E |
| `META-EXIFEDIT` | EXIF 편집 | 단위 · 기능 E2E |
| `META-EMBED` | 메타데이터를 파일에 넣기(JPEG XMP 임베드) | 단위 · 기능 E2E |
| `META-SIDECAR` | XMP 사이드카 | 단위 · 데스크톱 E2E |
| `META-GEOTAG` | 지도에 끌어 놓아 지오태그 | 기능 E2E |
| `META-PLACES` | 주소 찾기(역지오코딩) | 기능 E2E |
| `META-BATCH` | 여러 장 메타데이터 한꺼번에 편집 | 기능 E2E |

### 파일·가져오기·공유

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `FILE-OPS` | 새 폴더·이름 바꾸기·복사·이동·삭제 | 데스크톱 E2E |
| `FILE-CLIPBOARD` | 잘라내기·복사·붙여넣기(클립보드) | 기능 E2E |
| `FILE-IMPORT` | 가져오기: 하위 폴더 규칙·이름·중복 건너뛰기·메타데이터·원본 삭제 | 기능 E2E |
| `FILE-SCAN` | 스캐너에서 가져오기 | 기능 E2E |
| `FILE-SYNC` | 폴더 동기화 | 기능 E2E |
| `FILE-OPENWITH` | 연결 프로그램 선택·기본 프로그램·탐색기에서 보기 | 정적 · 기능 E2E |
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
| `VIEW-SLIDESHOW` | 슬라이드 쇼 | 데스크톱 E2E |

### 현상·편집

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `EDIT-LIGHT` | 노출·대비·밝기·하이라이트·섀도 | 단위 · 데스크톱 E2E · 기능 E2E |
| `EDIT-COLOR` | 채도·생동감·색온도·색조 | 단위 · 기능 E2E |
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
| `EDIT-CANVAS` | 캔버스 크기 | 단위 · 기능 E2E |
| `EDIT-REDEYE` | 적목 제거 | 단위 · 데스크톱 E2E |
| `EDIT-HEAL` | 잡티 제거 | 단위 · 기능 E2E |
| `EDIT-CLONE` | 복제 도장 | 단위 · 기능 E2E |
| `EDIT-SKIN` | 피부 보정 | 단위 · 기능 E2E |
| `EDIT-LOCAL` | 부분 보정: 그러데이션·방사형·브러시 | 단위 · 기능 E2E |
| `EDIT-EFFECTS` | 특수 효과 묶음 | 단위 · 웹 E2E · 기능 E2E |
| `EDIT-TILTSHIFT` | 틸트시프트 | 단위 · 기능 E2E |
| `EDIT-TEXT` | 텍스트·워터마크·테두리 | 웹 E2E · 기능 E2E |
| `EDIT-DRAW` | 그리기 도구 | 단위 · 기능 E2E |
| `EDIT-LAYERS` | 레이어(혼합 모드·불투명도) | 단위 · 기능 E2E |
| `EDIT-HISTORY` | 기록 창·실행 취소/다시 실행 | 웹 E2E · 데스크톱 E2E · 기능 E2E |
| `EDIT-PRESETS` | 프리셋 저장·적용 | 단위 · 기능 E2E |
| `EDIT-COPYPASTE` | 편집 설정 복사·붙여넣기 | 단위 · 기능 E2E |
| `EDIT-NONDESTRUCTIVE` | 비파괴 재편집(원본+설정) | 단위 · 기능 E2E |
| `EDIT-RESTORE` | 원본으로 복원 | 데스크톱 E2E · 기능 E2E |
| `EDIT-RAW` | RAW 현상(LibRaw 디모자이크) | 웹 E2E · 기능 E2E |

### 만들기

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `CREATE-PRINT` | 인쇄·밀착 인화 | 데스크톱 E2E |
| `CREATE-PDF` | PDF 만들기 | 단위 · 웹 E2E · 기능 E2E |
| `CREATE-GIF` | 애니메이션 GIF | 단위 · 기능 E2E |
| `CREATE-PANORAMA` | 파노라마 | 단위 · 기능 E2E |
| `CREATE-HDR` | HDR 합성 | 단위 · 기능 E2E |
| `CREATE-FOCUS` | 초점 스태킹 | 단위 · 기능 E2E |
| `CREATE-SLIDESHOW` | 슬라이드 쇼 내보내기(동영상·HTML) | 기능 E2E |
| `CREATE-ZIP` | ZIP 만들기 | 단위 · 웹 E2E · 기능 E2E |

### 일괄 처리

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `BATCH-RENAME` | 일괄 이름 바꾸기 | 단위 · 데스크톱 E2E |
| `BATCH-RESIZE` | 일괄 크기 조절 | 데스크톱 E2E |
| `BATCH-CONVERT` | 형식 변환 | 데스크톱 E2E |
| `BATCH-ADJUST` | 일괄 자동 보정 | 기능 E2E |
| `BATCH-ROTATE` | 무손실 회전·뒤집기 | 단위 · 데스크톱 E2E |
| `BATCH-DATES` | 촬영 날짜 바꾸기 | 단위 · 데스크톱 E2E |
| `BATCH-WATERMARK` | 워터마크 일괄 | 기능 E2E |
| `BATCH-PRESET` | 프리셋 일괄 적용 | 단위 · 기능 E2E |
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
| `FMT-GIF` | 애니메이션 GIF 보기 | 단위 · 웹 E2E · 기능 E2E |
| `FMT-VIDEO` | 동영상 형식 | 단위 · 웹 E2E · 기능 E2E |
| `FMT-ZIP` | ZIP 읽기 | 단위 · 기능 E2E |

### 앱

| ID | 기능 | 테스트 |
| --- | --- | --- |
| `APP-SETTINGS` | 설정·테마 | 단위 · 기능 E2E |
| `APP-LANG` | 한국어·영어 | 단위 · 웹 E2E · 데스크톱 E2E |
| `APP-PERSIST` | 종료 후 카탈로그·마지막 폴더 유지 | 웹 E2E · 데스크톱 E2E |
| `APP-WEB` | 웹 앱(브라우저·PWA) | 정적 · 웹 E2E |
| `APP-INSTALL` | 설치 파일(Windows·macOS·Linux) | 정적 |

<!-- feature-table:end -->

## 구현하지 않는 것 (이유)

| ACDSee | 이유 |
| --- | --- |
| ACDSee 365 클라우드·Mobile Sync | ACD Systems 의 자체 온라인 서비스·앱 전용 프로토콜 |
| Photoshop 플러그인(.8bf) | Windows 전용 네이티브 DLL — 웹·macOS·Linux 에서 실행 불가 |
| 디스크 굽기 | 운영체제 기능으로 대체(현대 OS 에서 ACDSee 도 제거) |
