# DCM Viewer (Multi-OS)

JavaScript로 만든 DICOM(.dcm) 뷰어입니다. **웹 브라우저**와 **Windows / macOS / Linux 데스크톱(Electron)** 에서 같은 코드로 동작합니다.
C# WinForms 버전(`../DCMViewerV10`)의 기능을 모두 옮기고, DICOM 전용 기능(윈도우/레벨, VOI LUT, 컬러맵, 오버레이, 시네, 시리즈 스택, 측정, 태그 브라우저, MPR/MIP, 익명화, 동영상 내보내기 등)을 추가했습니다.

## 주요 기능

| 분류 | 기능 |
|------|------|
| 파일 | DICOM(.dcm/.dicm/.dicom, 확장자 없는 파일 자동 감지) + JPEG/PNG/GIF/WebP/BMP/TIFF/ICO/SVG 열기, 폴더 트리 탐색, 드래그 앤 드롭, `.dcm` 파일 연결(설치판), 마지막 폴더 기억 |
| 디코딩 | 비압축(LE/BE), Deflated, RLE, JPEG Baseline/Extended(12-bit), JPEG Lossless, JPEG-LS, JPEG 2000 / HTJ2K · MONOCHROME1/2, RGB, YBR, PALETTE COLOR · 8/12/16/32-bit, float · 다중 프레임, Enhanced multi-frame(functional groups), Modality LUT, VOI LUT/Window, Presentation LUT, 오버레이 평면(60xx) |
| 보기 | 확대/축소/이동/화면 맞춤/실제 크기, 회전, 좌우/상하 반전, 보간, 모서리 정보(환자·검사·W/L·배율), 방향 표시(R/L/A/P/H/F), 픽셀 값 조사 |
| 윈도우 | 마우스 드래그 W/L, 파일 윈도우, CT 프리셋(뇌/폐/뼈/…), VOI LUT, LINEAR/LINEAR_EXACT/SIGMOID, 반전, 컬러맵 8종, 히스토그램 |
| 시네·스택 | 다중 프레임 슬라이더/재생(fps·반복), 폴더를 DICOM 시리즈로 정렬(SeriesInstanceUID·InstanceNumber·위치), 스택 스크롤(휠/키보드), 보기 상태 유지 |
| 측정 | 길이(mm), 각도, 사각형/타원 ROI(면적·평균·표준편차·최소·최대, HU 단위), 텍스트 주석, 핸들 드래그 편집 |
| 고급 | **MPR / MIP / MinIP / 평균** 볼륨 보기(축상·관상·시상, 슬랩 두께, 십자선), **익명화 사본 저장**(PHI 태그·private 태그 덮어쓰기), **시네 동영상(WebM)** 내보내기 |
| 내보내기 | PNG/JPEG/WebP/BMP/TIFF/GIF, 16-bit TIFF(원본 값), 모든 프레임 ZIP, 애니메이션 GIF, 태그 TXT/JSON/CSV, 클립보드 복사, 인쇄 |
| 일괄 변환 | 폴더(하위 폴더 포함 옵션)의 DCM을 선택 형식으로 변환 → `converted_<형식>` 폴더(브라우저에서 읽기 전용이면 ZIP 다운로드) |
| UI | 아이콘 메뉴 + 아이콘만 있는 한 줄 툴바(툴팁, 내보내기 드롭다운), 한국어/영어 토글(국기 버튼), **테마 20종**(클릭 순환 + 드롭다운 선택), 프로그램 설정 대화상자(고정 크기), 최근 폴더 10개(개별/전체 삭제), 마지막 폴더 자동 열기, 창 제목에 파일·환자 정보, 컨텍스트 메뉴, 단축키 |
| 팝업 | 데스크톱에서는 모든 대화상자(정보·설정·일괄 변환·오류·단축키·MPR·익명화)가 **독립된 창**으로 열리고 메인 창이 닫히면 함께 닫힙니다. 창 크기는 내용에 맞춰 스크롤 없이 표시됩니다. |

## 실행

```bash
npm install            # 의존성 설치 + (sharp) 아이콘 생성 준비
npm start              # 데스크톱(Electron) 실행  — npm start -- 파일.dcm  또는  폴더
npm run web            # 웹 모드: http://127.0.0.1:8080  (PORT=… HOST=0.0.0.0 로 변경 가능)
npm test               # 디코더 / 인코더 / 합성 DICOM 테스트
```

> IDE 터미널에서 `ELECTRON_RUN_AS_NODE=1`이 설정되어 있으면 Electron이 Node로 실행되어 창이 뜨지 않습니다.
> `scripts/start-dev.js`가 이 변수를 제거하므로 `npm start`를 사용하세요.

## 빌드 / 배포

```bash
npm run create-icons   # src/assets/icon.svg → icon.png / icon.ico, build/*.ico (sharp 필요)
npm run build:win      # NSIS 설치판 + 포터블 exe  → dist/, 설치 파일은 프로젝트 루트에도 복사
npm run build:mac      # DMG (x64 / arm64)
npm run build:linux    # AppImage + deb
npm run build:web      # 정적 웹 배포용 dist-web/ (index.html + 코덱)
```

설치판은 `.dcm` / `.dicm` / `.dicom` 파일 연결을 등록합니다(Windows·macOS·Linux MIME `application/dicom`).

## 요구 사항

- Node.js 18 이상 (개발: Node 22)
- 브라우저: Chromium 계열(Chrome/Edge) 권장 — 폴더 열기·쓰기(File System Access API), WebM 녹화(MediaRecorder). 다른 브라우저에서는 파일 선택과 다운로드 방식으로 동작합니다.

## 프로젝트 구조

```
DCMViewerMultiOSV10/
├── main.js                 Electron 메인 프로세스 (창, 다이얼로그, 파일 시스템, 설정, 팝업 창)
├── preload.js              렌더러 ↔ 메인 IPC 브리지
├── server.js               웹 모드 정적 서버 (src/ + node_modules 코덱 + samples/)
├── src/
│   ├── index.html          메인 화면
│   ├── popup.html          팝업 창 페이지 (대화상자 1개를 독립 창으로)
│   ├── styles/main.css     레이아웃·테마 변수
│   ├── i18n/ko.js, en.js   번역
│   ├── assets/             아이콘 (icon.svg → png/ico)
│   └── js/
│       ├── dicomDecoder.js DICOM 파서·코덱·렌더링(윈도우/LUT/컬러맵/오버레이/통계/헤더 스캔/익명화용 파싱)
│       ├── encoders.js     BMP / TIFF(8·16bit) / GIF(정지·애니메이션) / ZIP 인코더
│       ├── platform.js     Electron·웹 공통 파일 시스템/다이얼로그 추상화 (웹: File System Access API)
│       ├── viewer.js       캔버스 뷰어 (확대/이동/회전/반전, 도구, 측정)
│       ├── fileTree.js     폴더 트리
│       ├── dialogs.js      대화상자 내용 (정보·설정·일괄 변환·오류·단축키·MPR·익명화·입력)
│       ├── popup.js        팝업 창 부트스트랩
│       ├── themes.js       테마 20종
│       ├── icons.js        메뉴/툴바 SVG 아이콘, 국기
│       ├── i18n.js         번역 유틸
│       └── app.js          애플리케이션 (메뉴, 툴바, 패널, 렌더링 파이프라인, 내보내기, 시네, 시리즈)
├── scripts/                start-dev, create-icons, build-web, copy-dist
├── test/                   node --test (samples + 합성 DICOM 픽스처)
└── samples/                테스트용 DICOM
```

## 문서

- [UsersGuide.md](UsersGuide.md) — 사용자 가이드
- [Architecture.md](Architecture.md) — 구조·데이터 흐름·확장 방법

## 저작권

Copyright © 2026 SHKWON (knix008@naver.com) · MIT License
