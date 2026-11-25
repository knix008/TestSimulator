# MyICOMaker v1.0.1

아이콘 디자이너 — 도형·도구·효과로 아이콘을 그리고 여러 크기를 담은 Windows **.ico**, macOS **.icns**, **PNG** 세트, **SVG** 로 내보냅니다.
Windows · macOS · Linux 데스크톱 앱(**Tauri 2**, Rust 백엔드)과 웹 브라우저에서 같은 화면으로 동작합니다.

An icon designer: draw with shapes, tools and effects; export multi-size `.ico`, `.icns`, PNG sets and SVG. Desktop app on Tauri 2 (Rust backend) for Windows, macOS and Linux, and the same app in a web browser.

## 기능

- **시작 화면** (MyUMLMaker 방식): 움직이는 배경(20종) 위 반투명 카드 — 옮기기·크기 바꾸기·배치 초기화, 바로 가기, 최근 디자인(미리 보기 그림), 템플릿 13종, 테마 40종(어두운 20·밝은 20)+사용자 정의 테마, 배경 속도·카드 불투명도
- **편집기**: 프레임 없는 창(제목 표시줄 = 드래그 영역, 최소화·최대화·닫기), 아이콘+레이블 도구 모음(좁으면 레이블이 단계적으로 숨음), 상태 표시줄과 크기 조절 손잡이, 창 위치·크기 기억
- **도구 14종**: 선택, 손(이동), 사각형, 둥근 사각형, 타원, 직선, 화살표 선, 다각형, 펜, 붓, 글자, 스포이트, 채우기, 지우개 + 그림 가져오기 (PNG·JPG·GIF·WebP·BMP·ICO·SVG·AVIF·TIFF·HEIC·DICOM)
- **도형 93종**: 기본 20, 별·빛 10, 화살표 12, 기호 30, 배지·말풍선 9, 입체 12 — 분류 탭과 검색
- **이모티콘 190종**: 8개 분류(얼굴·손·동물·음식·자연·사물·활동·기호), 이름(한/영)·문자 검색, 벡터라 모든 크기에서 선명 (Twemoji, CC-BY 4.0)
- **내 이모티콘**: 그림 파일이나 캔버스에서 선택한 개체를 직접 추가·삭제
- **예제 20개**: 시작 화면에서 미리 보기와 함께 열기, **내 예제**(편집기의 “예제로 저장”)도 추가·삭제
- **3D 모델 가져오기**: OBJ·STL·PLY·glTF/GLB·FBX·DAE·3MF·3DS·AMF·VRML — 가져오기 창에서 각도·확대·밝기·한 색·와이어프레임·그림자를 정해 1024px 투명 그림으로 넣기 (three.js)
- **끌어다 놓기**: 창 어디에나 파일을 놓으면 디자인(.myico)은 열기, 그림은 캔버스에, 3D 모델은 가져오기 창으로
- **속성·효과**: 단색·선형·원형 그러데이션, 테두리(실선·파선·점선), 3D 베벨, 광택, 그림자, 빛번짐, 흐림, 회전·뒤집기, X·Y·너비·높이 스테퍼
- **정렬·배치·레이어**: 6방향 정렬, 순서, 숨기기·잠그기, 복사·붙여넣기·복제, 실행 취소/다시 실행
- **내보내기**: ICO(한 파일 또는 크기별), PNG 세트, ICNS, SVG; 크기 16 ~ 256 선택, 실시간 크기별 미리 보기
- **인쇄 창**(따로 움직이는 독립 창, 작업 표시줄 단추): 프린터 선택·매수, 용지(사용자 지정 크기)·방향·여백, 크기별 견본 / 크게 한 장 / 스티커 시트, 머리글·바닥글, 미리 보기, 바로 인쇄·시스템 인쇄 창·PDF 저장
- **설정 창**: 일반·테마(40종+사용자 정의 테마 편집)·캔버스, 모든 창이 메인 테마를 따름
- **캔버스**: 테마 색, 눈금자와 붉은 마우스 위치 표시, 확대·축소에 맞춰 5×5 로 다시 나뉘는 격자
- **사용 설명서 창**: 도구 모음·제목 표시줄·시작 화면의 단추나 F1 로 여는 별도 창, 목차·언어·확대, 글 바탕까지 테마를 따름. **인쇄**(Ctrl+P)는 같은 인쇄 창에서 설명서를 고른 용지로 쪽 나눔해 모든 쪽을 미리 보고 프린터·PDF 로 인쇄 (`public/docs/UsersGuide*.html`)
- **한국어 / English**, 모든 아이콘은 컬러, 모든 버튼에 아이콘(아이콘·레이블 왼쪽 정렬)
- **설치 파일**: NSIS, 설치 언어 선택(한국어/English — 고른 언어로 프로그램도 시작), 이전 설치 제거·사용자 데이터 삭제 질문, 바로가기 선택

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm install` | 의존성 설치 |
| `npm start` | 데스크톱 앱 개발 실행 (`tauri dev`, 빈 포트 자동 선택, 수정이 바로 반영) |
| `npm run web` | 웹 버전을 브라우저에서 실행 |
| `npm run build:win` | Windows 설치 파일 → `release/` 와 프로젝트 루트 `MyICOMaker-Setup-1.0.1.exe` |
| `npm run build:mac` / `build:linux` | macOS .dmg / Linux .deb·.rpm·.AppImage (해당 OS 에서) |
| `npm run build:web` | 웹 번들 → `dist/` |
| `npm test` | 단위 · Rust · 빌드 · 실제 데스크톱 창 테스트, 요약 표, `test-results/report.txt` |
| `npm run build:emoji` | 이모티콘 목록·벡터 그림 `src/lib/emoji.js` 다시 만들기 (`@twemoji/svg`) |
| `npm run build:icons` | `assets/icon.svg` → 앱 아이콘, 설치 화면 그림 |
| `npm run build:docs` | 사용 설명서 HTML 생성 (`docs:shots` 는 실제 앱에서 그림 촬영) |
| `npm run clean` | 빌드 결과·설치 파일·테스트 결과·캐시 삭제 (`-- --dry-run` 으로 미리 보기) |
| `npm run clean:all` | clean + `node_modules/` 삭제 |

## 폴더

```
src/            React 화면 (App, components/, start/, windows/), lib/ (모델·도형·내보내기), icons/, i18n/
src-tauri/      Rust 백엔드 (lib.rs 창·파일 명령, files.rs, window_state.rs), windows/hooks.nsh (설치 파일)
public/docs/    사용 설명서 (한국어·English) 와 그림
scripts/        start, web, build, test, clean, render-icons, build-docs
test/           단위 테스트 (*.test.mjs), gui.mjs (실제 앱 테스트)
```

자세한 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 사용법은 [USERSGUIDE.md](USERSGUIDE.md) 를 보세요.

© 2026 SHKWON (knix008@naver.com) · MIT
