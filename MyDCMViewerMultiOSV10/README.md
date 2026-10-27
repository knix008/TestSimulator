# MyDCMViewer (Multi-OS)

JavaScript로 만든 DICOM(.dcm) 의료 영상 뷰어입니다. **Windows / macOS / Linux 데스크톱(Tauri 2)** 과 **웹 브라우저**에서 같은 페이지 코드로 동작합니다.
RadiAnt DICOM Viewer · MicroDicom 수준의 기능(시작 화면, 튜토리얼, 다중 뷰포트, MPR·3D 볼륨 렌더링, 영상 필터, PET/CT 융합, PACS 연결, 45가지 영상 형식 내보내기 등)을 목표로 합니다.

## 주요 기능

| 분류 | 기능 |
| ---- | ---- |
| 시작 | **시작 화면**(파일·폴더·DICOMDIR 열기, 일괄 변환, 설정, 최근 파일, 3D 움직이는 배경 18종, 투명도·속도 조절), **예제 영상 21종**(CT·MR·Enhanced MR/CT·컬러 도플러·XA·CR·초음파·오버레이·팔레트·Modality LUT·RT 선량/구조/계획·SR·심전도·DICOM 동영상 3종·DICOMDIR), **튜토리얼**(11장 46단계 — 모든 기능을 데모로 하나씩 실행, 장 선택 · 다시 실행, 도움말 › 튜토리얼), **도움말 창**(모든 기능을 그림과 함께 설명 · 찾기 · 해당 튜토리얼 단계로 바로 가기, Ctrl+F1), **튜토리얼 동영상** `MyDCMViewer-Tutorial.mp4` |
| 파일 | 파일마다 **탭**, DICOM(.dcm/.dicm/.dicom, 확장자 없는 파일·메타 없는 데이터셋 자동 감지) + JPEG/PNG/GIF/WebP/AVIF/BMP/ICO/SVG, TIFF(다중 페이지·16-bit), HEIF/HEIC, JPEG 2000, **DICOMDIR**(환자 › 검사 › 시리즈), **ZIP 압축 파일**, 폴더 트리, 끌어 놓기, `.dcm` 파일 연결 |
| 디코딩 | 비압축(LE/BE), Deflated(데이터셋·프레임), RLE, JPEG Baseline/Extended/Process 6·10, JPEG Lossless, JPEG-LS, JPEG 2000 / HTJ2K · MONOCHROME1/2, RGB, YBR_FULL/422, PALETTE COLOR · 8/12/16/32-bit, float · 다중 프레임, Enhanced(functional groups), Modality/VOI/Presentation LUT, 오버레이(60xx) |
| 보기 | 확대·이동·회전·반전·보간, 눈금자·격자, 모서리 정보, 방향 표시, 픽셀 값, **뷰포트 배치**(1×1 ~ 3×3), **동기 스크롤**(같은 슬라이스 위치), **기준선**, 실행 취소/다시 실행 |
| 윈도우 | 마우스 W/L, W/L 입력, 파일 윈도우, CT 프리셋, VOI LUT, LINEAR/LINEAR_EXACT/SIGMOID, 반전, 컬러맵, 히스토그램 |
| 시네 · 동영상 | 여러 프레임 영상 **재생 · 잠시 멈춤 · 멈춤**(Space · S), 한 프레임씩, fps · 반복, **DICOM 동영상**(MPEG-4 AVC/H.264 · HEVC 를 브라우저 동영상 엔진으로 재생, MPEG-2 는 추출), 동영상 추출(MP4 · M2V) |
| 측정 | 길이, 각도, **Cobb 각**, 사각형/타원/**다각형/자유곡선 ROI**(면적·둘레·평균·SD·최소·최대, HU), **점**(값), **화살표**, 텍스트, **돋보기**, 길이 보정, 측정값 CSV |
| 고급 | **MPR / MIP / MinIP / 평균**(축상·관상·시상, 슬랩, 십자선), **곡면 MPR**, **3D 볼륨 렌더링**(VR 프리셋: CT 뼈·연부 조직·폐·혈관, MR / MIP / MinIP / 평균 / 등위면, 자르기 상자, 앞·뒤·좌·우·위·아래 보기, PNG 내보내기), **영상 필터**(부드럽게·선명하게·잡음 제거·중앙값·윤곽선·엠보스·라플라시안·히스토그램 평활화·반전·임계값, 여러 개 연결), **영상 융합**(PET/CT 등 환자 좌표로 재표본화) |
| DICOM 도구 | **태그 편집**(새 파일로 저장), **익명화**(PHI·private 태그, UID 새로 만들기), **압축 해제 저장**(전송 구문 변환), **Secondary Capture** 저장, DICOMDIR 내보내기(CD/USB) |
| 문서 | 구조화 보고서(SR 트리 → HTML/텍스트), **심전도 등 파형**(CSV/PNG), 내장 PDF/CDA(추출), RT 구조(윤곽 CSV)·계획(텍스트)·선량 |
| PACS | **C-ECHO**(연결 확인), **C-FIND**(환자·검사·시리즈 검색, 날짜 범위·와일드카드), **C-GET**, **C-MOVE**(우리 Storage SCP로), **C-STORE**(현재 파일·시리즈 보내기), **Storage SCP**(다른 장비가 보내는 영상 받기), 압축 영상 자동 변환(transcode) |
| 내보내기 | **45가지 영상 형식**(아래), 16-bit TIFF, 모든 프레임 ZIP, 애니메이션 GIF, **동영상 MP4/WebM**, **PDF 보고서**(제목·작성자·메모·넣을 정보 선택, PDF 문서 속성), DICOM, 태그 TXT/JSON/CSV, 클립보드, **인쇄**(미리보기 · 용지 · 여백 · 양면 · 흑백 · 해상도 → 프린터) |
| 일괄 변환 | 폴더의 DCM을 선택 형식으로 변환(`converted_<형식>`) |
| UI | 아이콘 메뉴·툴바, **모든 오른쪽 단추 메뉴에 아이콘**(영상 · 폴더 트리 · 파일 탭 · 입력 칸 편집 메뉴), 오른쪽 아래 **크기 변경 표시**, 테마 20종, 한국어/영어, 설정, 프로그램 정보(아이콘 + 설명, 항목 · 설명 정렬), 대화상자는 데스크톱에서 독립된 창, 저장 · 내보내기 중 **진행률 창** |

### 내보내기 형식 (파일 › 영상 내보내기 › 다른 형식으로 내보내기)

| 그룹 | 형식 |
| ---- | ---- |
| 일반 | PNG(8/16-bit), APNG, JPEG(점진적), WebP(손실/무손실), AVIF(8/10/12-bit), HEIC(브라우저의 WebCodecs HEVC가 있을 때), JPEG XL, GIF, 애니메이션 GIF, BMP, TIFF(LZW/Deflate/PackBits, 16-bit·float, 여러 쪽) |
| 전문가용 | JPEG 2000(.jp2/.j2k), JPEG-LS(.jls), PSD, TGA, DDS, QOI |
| HDR / 실수 | OpenEXR, Radiance HDR, PFM |
| 의료 / 연구용 볼륨 | NIfTI-1(.nii/.nii.gz), Analyze 7.5(.hdr+.img → ZIP), MetaImage(.mha, .mhd+.raw → ZIP), NRRD |
| 과학 · 문서 · 아이콘 · 고전 | FITS · SVG, EPS, PDF · ICO, CUR, ICNS · PCX, PBM/PGM/PPM/PAM, SGI, Sun Raster, XBM, XPM, WBMP, Farbfeld |

16-bit·실수·의료 형식은 화면 그림이 아니라 **원래 화소 값**(HU 등)을, 여러 쪽·볼륨 형식은 **모든 프레임(또는 정렬된 시리즈)** 을 담습니다.
모든 형식은 다른 프로그램(sharp/libvips, ffmpeg, Pillow, OpenCV, tifffile, pydicom, 형식 명세 리더)으로 다시 읽어 검증합니다(아래 테스트).

## 실행

```bash
npm install
npm start              # 데스크톱(Tauri) 개발 실행 — 페이지는 http://localhost:5193 (src/ 수정 후 Ctrl+R)
npm run web            # 웹 모드: http://127.0.0.1:8080 (PORT=… HOST=0.0.0.0 로 변경)
npm run mini-pacs      # PACS 창을 시험할 작은 PACS (samples/ 의 DICOM, AE MINIPACS, 포트 11113)
npm run help:media     # 도움말 그림(doc/images)을 실제 프로그램에서 다시 찍고 도움말 창 데이터(src/help) 만들기
npm run help:build     # doc/help/*.md 만 고쳤을 때 도움말 창 데이터 다시 만들기
npm run tutorial:video # 튜토리얼 전체 녹화 → MyDCMViewer-Tutorial.mp4, doc/tutorial.md
npm run video-samples  # samples/video/ 의 DICOM 동영상(H.264 · HEVC · MPEG-2) 다시 만들기 (ffmpeg + pydicom)
```

> 데스크톱 실행·빌드에는 Rust(cargo)가 필요합니다. 웹 모드는 Node만 있으면 됩니다.
> 브라우저에서는 TCP 연결을 열 수 없으므로 **PACS 기능은 데스크톱 앱에서만** 동작합니다.

## 빌드 / 배포

```bash
npm run build:win      # Windows NSIS 설치 프로그램 (MyDCMViewer_<버전>_x64-setup.exe → 프로젝트 루트)
npm run build:mac      # macOS .app + .dmg (macOS에서)
npm run build:linux    # AppImage + .deb (Linux에서)
npm run build:all      # 지금 OS의 설치 파일 전부
npm run build:web      # 정적 웹 배포용 dist/ (페이지 + vendor/ 코덱 + samples/)
```

### Windows 설치 프로그램 (`src-tauri/windows/hooks.nsh`)

- 한국어/영어 선택, 사용자 단위 설치
- **바로 가기 페이지**: 바탕 화면·시작 메뉴 바로 가기, **DICOM 파일(.dcm/.dicm/.dicom) 기본 프로그램 등록**
- 예전 Electron 판("DCM Viewer")이 있으면 먼저 완전히 제거하고, 남은 설정·최근 폴더 데이터를 지울지 묻습니다(업데이트 설치는 묻지 않음).
- DICOM 파일 전용 문서 아이콘, "연결 프로그램" 목록과 기본 앱 목록 등록
- 제거할 때 "앱 데이터 삭제"를 고르면 설정까지 지웁니다.

## 테스트

```bash
npm test               # 단위 테스트 15개 파일 (~240개, 20초): 디코더·DICOM 쓰기/문서·네트워크(DIMSE)·필터·3D·융합·
                       #   영상 내보내기(45형식 × 독립 디코더 검증)·데스크톱 계약·UI 모듈
npm run test:rust      # Tauri 호스트(Rust) 테스트: 파일·인쇄·소켓
npm run smoke          # 웹 GUI 스모크 테스트: 헤드리스 Edge로 실제 화면을 조작하고 내보낸 파일을 Pillow·pydicom·ffprobe·pdfinfo로 검사
npm run smoke:desktop  # 데스크톱(Tauri) GUI 스모크: 팝업 창, 인쇄(파일로), PACS(scripts/mini-pacs.cjs 상대) 포함
node scripts/smoke.mjs --only export,pacs --keep   # 일부 구역만, 내보낸 파일 보관
```

- 독립 검증 도구: Python 3 + Pillow·numpy·pydicom(필수), OpenCV·tifffile(있으면 사용), ffmpeg/ffprobe, pdfinfo. 없는 도구는 "건너뜀"으로 표시되고 통과로 세지 않습니다.
- PACS 상호 운용은 pynetdicom 3.0.4와 양방향(echo·find·get·move·store)으로 확인했습니다. Docker가 실행 중이면 `test/dicom-net.test.js` 가 Orthanc로도 검증합니다.

## 요구 사항

- Node.js 22, Rust(stable, 데스크톱 빌드)
- Windows 10/11(WebView2), macOS 10.15+, Linux(webkit2gtk 4.1)
- 웹: Chromium 계열 권장(폴더 열기·쓰기, MediaRecorder, WebGL2)

## 프로젝트 구조

```text
MyDCMViewerMultiOSV10/
├── src-tauri/                 Tauri 호스트 (Rust)
│   ├── src/lib.rs             창·팝업 창·파일 대화상자·파일 입출력·클립보드·인쇄·폴더 감시·설정, 명령 목록
│   ├── src/net.rs             DICOM 네트워크용 TCP 소켓·리스너 (프로토콜은 페이지의 dicomNet.js)
│   ├── src/files.rs, print.rs 파일 도우미, 프린터로 바로 인쇄
│   ├── windows/hooks.nsh      Windows 설치 프로그램 추가 동작
│   └── tauri.conf.json        번들·파일 연결·아이콘
├── server.js                  웹 모드 서버 (src/ + vendor/ 코덱 + samples/)
├── src/
│   ├── index.html, popup.html 메인 화면, 대화상자 1개짜리 팝업 창
│   ├── i18n/ko.js, en.js      번역
│   └── js/
│       ├── app.js             애플리케이션 (메뉴·툴바·탭·렌더링·내보내기·시네·시리즈·PACS/3D/필터 연결)
│       ├── viewer.js, layout.js 캔버스 뷰어·측정 도구, 다중 뷰포트·동기 스크롤·기준선
│       ├── dialogs.js         대화상자 (설정·일괄 변환·MPR·태그 편집·융합·필터·다른 형식 내보내기 …)
│       ├── dicomDecoder.js    DICOM 파서·코덱·렌더링(+필터)
│       ├── dicomWriter.js     DICOM 편집·쓰기·압축 해제·익명화·Secondary Capture·DICOMDIR
│       ├── dicomDocs.js, docViews.js  SR·파형·내장 문서·RT·DICOMDIR 읽기와 화면
│       ├── dicomNet.js, net-transport.js, pacs.js  DIMSE 프로토콜, 소켓 전송, PACS 창
│       ├── volume3d.js        WebGL2 볼륨 렌더링과 3D 창
│       ├── imageFilters.js    영상 필터
│       ├── imageExport.js     45가지 영상 형식 인코더
│       ├── fusion.js          영상 융합
│       ├── dicomVideo.js      DICOM 동영상: H.264 / HEVC 스트림 → MP4, 재생기
│       ├── help.js, contextMenu.js  도움말 창, 편집 오른쪽 단추 메뉴
│       ├── tour.js            튜토리얼
│       ├── start/             시작 화면과 3D 배경
│       └── …                  platform.js(파일 시스템 추상화), desktop-bridge.js(Tauri 명령), encoders.js, zipReader.js …
├── doc/                   도움말(help/*.md, images/), 튜토리얼(tutorial.md) — 도움말 창의 원본
├── src/help/              도움말 창 데이터(help-data.js)와 그림 — npm run help:build 로 생성
├── MyDCMViewer-Tutorial.mp4  튜토리얼 동영상
├── scripts/                   dev, build-web, platform-build, smoke(GUI 테스트), cdp(CDP 드라이버),
│                              validate-exports.py(외부 검증), mini-pacs.cjs, create-icons, stage-samples
├── test/                      node --test 단위 테스트 + reporter.js
└── samples/                   예제 DICOM (samples/README.md)
```

## 문서

- [doc/README.md](doc/README.md) — 기능별 도움말(그림 포함)과 [튜토리얼](doc/tutorial.md)
- [UsersGuide.md](UsersGuide.md) — 사용자 가이드
- [Architecture.md](Architecture.md) — 구조·데이터 흐름·테스트

## 저작권

Copyright © 2026 SHKWON <knix008@naver.com> · MIT License
