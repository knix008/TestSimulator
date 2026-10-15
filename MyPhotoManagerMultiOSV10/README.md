# MyPhotoManager

**사진 관리자·뷰어**입니다. 사진을 탐색하고, 별점·색상 레이블·키워드·카테고리로 정리하고, 크게 보고, 편집하고, 일괄 처리합니다.
JavaScript(Vite) UI와 Tauri 2(Rust) 백엔드로 만들었고 **Windows · macOS · Linux 데스크톱 앱**과 **웹 앱(설치 가능한 PWA)** 으로 돌아갑니다.

![아이콘](assets/icon.png)

## 기능

| 기능 | MyPhotoManager |
|---|---|
| **관리 모드** — 폴더 트리, 썸네일/목록/상세 보기, 썸네일 크기 조절 | 폴더·즐겨찾기·드라이브 트리, 썸네일·목록·상세 보기(가상 스크롤로 수만 장도 가볍게), 썸네일 64–400 px, 하위 폴더 표시 |
| 정렬·그룹·필터 | 이름(자연 정렬)·촬영일·수정일·크기·형식·별점·레이블·픽셀·카메라 정렬, 날짜/월/연도/폴더/별점/레이블/형식/카메라 그룹, 별점·레이블·태그·형식 필터 |
| **정리** — 별점, 색상 레이블, 태그, 키워드, 카테고리, 캡션 | 별 0–5(Ctrl+0…5), 레이블 5색(Alt+0…5), 태그(`` ` ``), 키워드, 계층 카테고리, 제목·설명·작성자·메모. 여러 장 한꺼번에 |
| **카탈로그 창 / 선택적 탐색** | 별점·레이블·태그·카테고리·키워드·**자동 카테고리**(카메라·렌즈·연도·ISO·초점 거리·조리개·플래시·방향·GPS·국가)·저장된 검색. Ctrl+클릭으로 조합(모두/하나라도) |
| 데이터베이스 · 폴더 카탈로그 | 카탈로그(desktop: `catalog.json`, web: IndexedDB). "이 폴더 카탈로그에 등록"으로 하위 폴더까지 EXIF 색인, 내보내기/가져오기 |
| **달력 · 지도** | 촬영일 달력(일·월·연), OpenStreetMap 지도에 GPS 표시, 지도에서 위치 지정(지오태그) |
| **검색** | 빠른 검색 문법(`rating:>=4 kw:sea camera:canon date:2024-01..2024-06 has:gps -night`)과 검색 창, 검색 저장 |
| **이미지 바구니** | 여러 폴더의 사진을 모아 두고 한 번에 처리 |
| **속성 창** | 정리 항목 편집, 파일 정보, 촬영 정보, 모든 메타데이터(EXIF·GPS·IPTC·XMP) |
| **보기 모드** | 창 맞춤/100%/확대 축소/이동, 필름 스트립, 정보·히스토그램 오버레이, 전체 화면, 다음 사진 미리 읽기, 애니메이션 GIF/WebP, 동영상 재생 |
| **편집 모드(Develop/Edit)** | 노출·밝기·대비·밝은/어두운 영역·흰색/검정, 색온도·색조·채도·생동감·색상환, 레벨(자동), 톤 곡선(RGB/채널별), 선명하게·명료도·노이즈 감소·흐림, 회전·뒤집기·수평 맞추기·자르기(비율)·크기 조절, 적목 제거·잡티 제거, 흑백·세피아 등 효과·비네팅·그레인·모자이크·엠보스, 텍스트(워터마크)·테두리, 실행 취소/다시 실행, 전/후 비교 |
| 원본 복원 | 편집해서 덮어쓰면 원본을 따로 보관 → "원본 복원" (데스크톱) |
| **일괄 처리** | 이름 바꾸기(템플릿·번호·날짜·찾아 바꾸기·미리 보기), 크기 조절, 형식 변환(JPEG/PNG/WebP/BMP/TIFF), 일괄 보정, 날짜·시간 변경(EXIF 직접 수정), 회전·뒤집기 |
| **무손실 JPEG 회전** | EXIF 방향만 바꿔 화질 손실 없이 회전 |
| 비교 · 중복 찾기 | 2–4장 비교(연동 확대·이동, 차이 강조), 똑같은 파일(SHA-256)·비슷한 사진(dHash) 찾기 |
| 슬라이드 쇼 | 페이드·밀어내기·켄 번스 줌, 간격·무작위·반복·설명 |
| 인쇄 · 밀착 인화 | 용지·방향·행열·여백·캡션 → 프린터 또는 JPEG/PNG |
| 대시보드 | 사진 수·연도·월·카메라·렌즈·ISO·초점 거리·형식·별점·레이블·키워드 통계 |
| 파일 관리 | 새 폴더, 이름 바꾸기, 복사·이동(끌어다 놓기, Ctrl=복사), 휴지통 삭제, 클립보드(Ctrl+C/X/V), 탐색기에서 보기, 기본 프로그램으로 열기, 바탕 화면 배경 지정 |
| 메타데이터 호환 | XMP 사이드카(별점·레이블·키워드·카테고리) — 라이트룸·브리지·darktable 와 호환, 내장 XMP 별점·키워드 읽기 |

**읽는 형식**: JPEG · PNG · GIF · WebP · AVIF · BMP · ICO · SVG · **TIFF** · **HEIC/HEIF** · **PSD/PSB**(합성 이미지) · **카메라 RAW**(DNG, CR2, CR3, NEF, NRW, ARW, ORF, RW2, RAF, PEF, SRW, 3FR, ERF, KDC …: 내장 JPEG 미리 보기) · 동영상(MP4, WebM, MOV, MKV)
**쓰는 형식**: JPEG(원본 EXIF·XMP·ICC 유지) · PNG · WebP · BMP · TIFF

## 빠른 시작

필요: Node.js 20+, Rust 1.80+ (stable), 각 OS의 Tauri 준비물(Windows: WebView2·MSVC, Linux: webkit2gtk-4.1, macOS: Xcode CLT).

```bash
npm install
npm start            # 데스크톱 앱 (tauri dev)
npm run dev          # 웹 개발 서버 http://localhost:1440
```

## 설치 파일 만들기

```bash
npm run build:win     # Windows NSIS 설치 파일  → release/MyPhotoManager-Setup-<버전>.exe
npm run build:mac     # macOS .app + .dmg       → release/MyPhotoManager-<버전>-<arch>.dmg
npm run build:linux   # .deb · .rpm · .AppImage → release/
npm run build:webapp  # 웹 앱 ZIP               → release/MyPhotoManager-<버전>-web.zip
npm run build:all     # 웹 앱 + 지금 OS에서 만들 수 있는 전부
npm run build:icons   # assets/icon.svg → 모든 아이콘·설치 화면 이미지 다시 만들기
```

만든 파일은 `release/` 와 프로젝트 폴더에 함께 놓입니다. Tauri는 교차 빌드를 하지 않으므로 **각 OS 설치 파일은 그 OS에서** 만듭니다.
세 OS를 한 번에 만들려면 이 폴더를 별도 저장소로 올리고 `.github/workflows/release.yml`(GitHub Actions, Windows·macOS(Apple Silicon/Intel)·Linux·웹)을 실행하세요.
Windows·macOS 에서 리눅스 설치 파일은 Docker 로 만들 수 있습니다: `npm run build:linux-docker` (Docker Desktop 필요).

### Windows 설치 프로그램

- 설치 시작 시 **한국어/영어**를 고릅니다. 사용자 계정에 설치(관리자 권한 불필요).
- 이전 설치가 있으면 **완전히 제거한 뒤** 새로 설치합니다.
- 이전 설치가 남긴 **데이터(카탈로그·설정·썸네일 캐시·원본 백업)** 가 있으면 지울지 묻습니다.
- 이미지 파일의 **"연결 프로그램"** 에 MyPhotoManager 를 추가합니다. 기본 프로그램은 **바꾸지 않습니다**. 제거하면 등록도 지웁니다.

### macOS / Linux

- macOS: 이미지와 폴더의 "다음으로 열기"에 나타납니다(기본 앱 순위 *Alternate*, 기본값을 빼앗지 않음).
- Linux(.deb/.rpm): 데스크톱 항목이 이미지 MIME 형식을 선언해 "다른 앱으로 열기"에 나타납니다. AppImage 는 설치 없이 실행.

### 웹 앱

`release/MyPhotoManager-<버전>-web.zip` 을 풀어 아무 정적 웹 서버(HTTPS 또는 localhost)에 올립니다. Chrome·Edge 주소창의 **앱 설치** 로 설치하면 자기 창에서 열리고 오프라인에서도 동작합니다.

- Chrome·Edge: **폴더 열기**가 쓰기 권한으로 열려 별점·이름 바꾸기·편집 저장이 폴더에 바로 반영되고, 다음 방문 때 폴더를 기억합니다.
- Firefox·Safari: 폴더·사진은 읽기 전용으로 엽니다. 보기·정리는 그대로, 편집한 사진은 내려받습니다.
- 사진은 서버로 올라가지 않습니다. 모든 처리는 브라우저 안에서 합니다.

## 테스트

```bash
npm test                    # 전부: js · package · rust · web · desktop · features
npm test -- --only features # 기능 전부를 실제 앱에서 (test/features.mjs 의 기능 ID 별)
npm test -- --quick         # js · package · rust (창 없이)
npm test -- --only web      # 웹 빌드를 헤드리스 Edge/Chrome 으로 조작
npm test -- --installer     # Windows 설치 파일도 만들어 검사
npm run fixtures            # 테스트 사진(EXIF·GPS 포함 JPEG, TIFF, PSD, DNG …), 추가 형식(test/fixtures/formats)과 웹 예제 사진 다시 만들기
node test/e2e/run-cases.mjs features "편집"   # 일부 경우만, 오류 전체 출력
```

- **JS 단위**: EXIF 방향 대수, JPEG 메타데이터(무손실 회전·EXIF 유지·날짜 이동), RAW 미리 보기 추출, PSD 읽기/쓰기, exifr 요약, XMP, 카탈로그, 검색 문법, 정렬·그룹, 일괄 이름 바꾸기, 중복(dHash), 보정 알고리즘, 기하 행렬, 설정, 번역 키 누락
- **Rust 단위**: 폴더 목록, 복사·이동(충돌 규칙)·이름 바꾸기·삭제, 원자적 저장, 창 위치, 명령줄 인자
- **웹 E2E**: 예제 사진, 파일 선택 창으로 HEIC/TIFF/PSD/DNG 열기, 정리 내용 유지(새로 고침), 뷰어, 편집, 언어, 서비스 워커
- **데스크톱 E2E**: 실제 앱을 띄워 폴더·썸네일·EXIF·키보드 정리·카탈로그·검색·뷰어·모든 형식 디코딩·무손실 회전·파일 작업·편집 저장과 원본 복원·적목·일괄 크기/변환/이름/날짜·중복·비교·슬라이드 쇼·밀착 인화·대시보드·XMP·언어·재실행 후 유지

- **기능 E2E**: 모든 기능(`test/features.mjs`)을 기능 ID 로 묶어 실제 앱에서 조작합니다 — 추가 형식 썸네일·보기·여러 페이지·동영상 프레임, LibRaw RAW 현상, ZIP, 타일·필름 스트립, 바구니·모든 미디어·저장된 검색·계층 키워드, 클립보드, 단축키 바꾸기, 설정, IPTC·EXIF 편집·파일에 넣기·지오태그·주소 찾기, 사람(이름·얼굴 감지·제안), 비공개 폴더(암호화 확인), 가져오기·스캐너·동기화·공유·연결 프로그램, 내비게이터·돋보기·확대 고정·픽셀 정보, 편집 패널 전부와 포인터 도구·효과 22종·레이어·프리셋·기록·비파괴 재편집, PDF·GIF·ZIP·슬라이드 쇼·파노라마·HDR·초점 스태킹, 워터마크·자동 회전·파일 날짜·자동 보정. 파일이 바뀌는 기능은 디스크의 바이트·EXIF·픽셀까지 확인합니다.
- **기능 점검표**: `test/static/features.test.js` 가 모든 기능 ID 에 테스트가 있는지 확인합니다. 기능과 테스트의 대응은 [docs/feature-gap.md](docs/feature-gap.md) (`node scripts/feature-table.mjs` 로 갱신).

결과는 `test-results/results.json` 에도 남습니다.

## 폴더 구조

```
src/                 UI (Vite, 바닐라 JS)
  app.js             앱 셸: 메뉴·툴바·창·모드·단축키·시작
  store.js           상태와 공용 동작(폴더 열기, 선택, 파일 작업, 정리)
  catalog/           카탈로그·검색·정렬·이름 바꾸기·중복
  formats/           형식: 판별·디코딩·EXIF·JPEG 메타·RAW·PSD·XMP·인코딩
  edit/              편집: 보정 알고리즘·기하·렌더링 파이프라인
  thumbs/            썸네일 서비스와 워커
  platform/          데스크톱(Tauri)·웹(File System Access) 파일 API, IndexedDB
  ui/                각 창과 대화상자
src-tauri/           Rust 백엔드(폴더·파일 작업·원본 백업·데이터 저장·창 위치), 설치 설정
test/                단위·E2E 테스트, 픽스처 사진
scripts/             실행·빌드·테스트·아이콘·픽스처 스크립트
```

자세한 설명: [사용 설명서](UsersGuide.md) · [구조](ARCHITECTURE.md)

Copyright © SHKWON (knix008@naver.com)
