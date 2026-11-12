# My LVGL Studio

LVGL 애플리케이션의 화면을 그래픽으로 설계하고, 바로 실행해 보고, 펌웨어에 넣을 C 코드를 생성하는 데스크톱 도구입니다. Tauri 2와 JavaScript(React)로 만들었습니다.

설계 화면은 HTML로 흉내 낸 것이 아니라 WebAssembly로 컴파일한 **실제 LVGL이 그립니다.**

## 주요 기능

- **화면 설계:** 팔레트에서 끌어다 놓기, 이동과 크기 조절, 구성 요소 트리, 속성 패널, 여러 화면, Undo/Redo
- **콘트롤:** 프로젝트의 LVGL 버전에 있는 위젯을 모두 표시 (v8.4 35종, v9.2 35종, v9.6 36종). Grid 레이아웃 포함
- **이미지:** PNG, JPG, BMP, GIF, WebP, SVG 가져오기, 회전과 배율. 원본은 프로젝트에 보관하고 LVGL 버전에 맞는 C 배열로 생성
- **이벤트:** 코드 없이 화면 전환, 텍스트 변경, 표시 전환, 로그 출력을 연결
- **화면과 로직 분리 (MVVM):** 위젯 속성을 뷰모델 속성에 데이터 바인딩(단방향, 양방향, 변환기, 형식). 로직은 `src/app/`에 두며 앱이 덮어쓰지 않고, 생성된 `glue.h`만 쓰므로 LVGL 없이 시험 가능. 설계 화면과 생성 코드가 같은 C 바인딩 라이브러리를 사용
- **두 가지 실행 방식**
  - 실행 화면(F5): 분리된 창에서 바로 동작. 컴파일러와 LVGL 소스가 필요 없음
  - 네이티브 실행(Shift+F5): 생성한 C 코드를 gcc와 SDL2로 빌드해 별도 창에서 실행
- **LVGL 버전 선택:** 프로젝트 설정에서 v8.3 이상과 v9 중에서 고르며, 생성 코드가 해당 버전의 API를 따름
- **LVGL 관리자:** 필요한 버전의 소스만 GitHub에서 내려받아 설치하거나 삭제
- **튜토리얼과 설명서:** 둥근 LCD용 스마트워치 GUI를 직접 만드는 실습형 튜토리얼(시작할 때 묻는 것은 환경 설정에서 끌 수 있음), 앱 안의 사용 설명서(F1)
- **탐색기:** 프로젝트 폴더 구조를 보여 주고 파일을 열기
- **값 연결과 애니메이션:** 슬라이더를 끌면 다른 콘트롤이 함께 움직이게 연결, 값의 자동 왕복
- **원형 화면:** 프로젝트 설정에서 켜고, 원 밖으로 나간 콘트롤을 알려 줌
- **코드 보기:** 디자인/분할/코드 전환. 화면 코드를 고치면 그래픽이 바뀌고, 그래픽을 고치면 코드가 바뀝니다.
- **코드 편집기 (Ctrl+E):** 별도 창에서 로직(`src/app`)과 생성 코드를 편집하고 바로 빌드·실행. 로직은 GUI와 따로 자동 저장, 바인딩·뷰모델 파일도 코드로 편집, `vm_` 자동 완성
- **화면 크기:** 툴바에서 14가지 크기 중 고르거나 너비와 높이를 직접 입력
- **글꼴:** TTF, OTF, TTC, OTC 파일을 읽어 설계 화면과 코드에 그대로 사용. Noto Sans CJK처럼 언어별 면이 있는 글꼴은 언어로 면을 선택
- **LVGL 설정:** 그 버전의 `lv_conf_template.h`를 읽어 `lv_conf.h`의 모든 설정을 창으로 표시
- **프로젝트 폴더:** 저장하면 프로젝트 폴더에 프로젝트 파일(`.mylvgl`)과 구조화한 C 코드를 함께 저장
- **시작 화면:** 움직이는 배경 24종(3D 포함), 메뉴 타일, 최근 프로젝트, 옮기고 크기를 바꿀 수 있는 카드
- **테마:** 라이트 20종과 다크 20종, 색을 직접 정하는 사용자 정의 테마. 어떤 색을 골라도 글자 대비 4.5:1 이상을 보장
- **환경 설정:** 언어, 테마, 시작 화면 옵션. 창 위치와 크기도 기억

## 문제점과 버전 변경

- 툴바의 LVGL 버전 버튼으로 버전을 바꾸면 엔진, 콘트롤 목록, 생성 코드가 함께 바뀝니다.
- 하단 패널의 **문제점** 탭은 설계의 충돌과 오류, 컴파일러 메시지를 목록으로 보여 주고, 항목에서 콘트롤이나 코드로 이동합니다.

## 프로젝트 폴더

```
MyApp/
├─ MyApp.mylvgl            프로젝트 파일 (형식: FILE_FORMAT.md)
├─ assets/images/          가져온 이미지 원본
├─ CMakeLists.txt          데스크톱 빌드
├─ config/lv_conf.h        데스크톱 빌드용 LVGL 설정
├─ lib/mvvm/               바인딩 라이브러리 (생성)
└─ src/
   ├─ main.c               데스크톱 실행 진입점 (ui_init() 다음 app_init())
   ├─ ui/                  화면 (View, 생성)
   │  ├─ ui.h, ui.c        객체 선언과 ui_init()
   │  ├─ ui_events.h, ui_events.c
   │  ├─ ui_bindings.c     위젯과 뷰모델 속성의 연결
   │  ├─ screens/ui_<화면>.c   화면마다 한 파일
   │  └─ images/ui_img_<이미지>.c   이미지마다 한 파일
   ├─ glue/                뷰모델 (생성): glue.h, vm_<이름>.h/.c
   └─ app/                 사용자 로직: 없을 때만 한 번 만들고 다시는 덮어쓰지 않음
```

## 내장 엔진과 LVGL 소스

| 구분 | 앱에 포함 여부 | 용도 |
|---|---|---|
| WebAssembly 엔진 8.4.0, 9.2.2, 9.6.0 | 포함 | 화면 설계, 앱 안에서 실행 |
| LVGL 소스 | 포함하지 않음(LVGL 관리자로 설치) | 네이티브 실행 |

내장 엔진이 없는 버전(예: 9.4.0)을 고르면 설계 화면은 같은 주 버전의 가장 가까운 엔진으로 그리고 상태 표시줄에 경고를 표시합니다. 네이티브 실행과 코드 생성은 고른 버전을 그대로 사용합니다.

## 실행

```
npm install
npm start
```

`npm start`는 빈 포트에 Vite를 띄우고 Tauri 개발 창을 엽니다.

## 준비물

| 작업 | 필요한 도구 |
|---|---|
| 앱 개발과 실행 | Node.js 20.19 이상, Rust, Tauri 2 플랫폼 의존성 |
| 네이티브 실행 | Windows: 없음(앱이 전용 컴파일러를 자동 설치). macOS, Linux: gcc, CMake, Ninja, SDL2 (LVGL 관리자의 **컴파일러 설치**) |
| WebAssembly 엔진 다시 빌드 | Emscripten, CMake, Ninja |

Windows에서는 앱을 실행할 때 필요한 파일만 `%LOCALAPPDATA%\MyLVGLStudio\toolchain`에 받아 씁니다. PC의 PATH나 다른 프로그램은 바뀌지 않고, 앱을 제거하면 함께 지워집니다. 자세한 내용은 [ARCHITECTURE.md](ARCHITECTURE.md)를 보세요.

MSYS2의 Emscripten 패키지는 Node도 함께 설치합니다. `ucrt64\bin`이 PATH에서 기존 Node보다 앞에 있으면 PC 전체의 `node`가 바뀌므로 주의하세요. 엔진 빌드 스크립트는 자신을 실행한 Node를 `EM_NODE_JS`로 Emscripten에 넘깁니다.

## 명령

| 명령 | 내용 |
|---|---|
| `npm start` | 현재 소스로 데스크톱 앱 실행 |
| `npm run dev:web` | 브라우저에서 화면만 실행(저장과 네이티브 기능 제외) |
| `npm test` | 문서 모델, 설정, 테마, 배경, 코드 생성기, 모든 위젯·속성·이벤트, 생성 코드와 엔진의 픽셀 비교 |
| `npm test -- --no-native` | gcc 빌드를 뺀 테스트 |
| `npm run test:gui` | 앱을 `src-tauri/target/e2e`에 빌드한 뒤 모든 화면을 조작하는 GUI 테스트. `npm start` 창을 띄운 채 실행할 수 있습니다. |
| `npm run tutorial:video` | 릴리스 앱으로 튜토리얼을 진행하며 녹화해 `MyLVGLStudio-Tutorial.mp4`를 프로젝트 루트에 저장(한국어, 무음, ffmpeg 필요). 녹화 중에는 앱 창이 화면에 뜹니다. |
| `npm run fetch:lvgl` | 엔진 빌드용 LVGL 소스를 `third_party/`에 받기 |
| `npm run build:engine` | WebAssembly 엔진을 빌드해 `public/engine/`에 저장 |
| `npm run mvvm-source` | `engine/mvvm`의 바인딩 라이브러리를 생성기용 `src/lvgl/mvvmSource.js`로 복사 (라이브러리를 고친 뒤 엔진 빌드와 함께) |
| `npm run icons` | 앱 아이콘과 프로젝트 파일 아이콘 생성 |
| `npm run build:win` | Windows 설치 파일 빌드 (`build:mac`, `build:linux`도 있음) |

## 현재 제약

- 실행 화면(F5)은 내장 엔진이라 `src/app/`의 사용자 로직은 네이티브 실행에서만 동작합니다. 실행 화면에서는 뷰모델 탭에서 값을 바꿔 로직을 대신합니다.
- 뷰모델의 컬렉션(목록, 표 항목) 바인딩, 명령(Command), 다른 스레드에서의 값 설정은 아직 없습니다.
- 탭 뷰의 탭 안에 위젯을 배치하는 기능은 아직 없습니다. 탭에는 이름만 표시됩니다.
- 외부 라이브러리나 장치가 필요한 위젯(Lottie, rlottie, GIF, FFmpeg, GStreamer, 3D Texture)과 입력기(Pinyin)는 넣지 않았습니다.
- 앱 안에서 실행할 때 PC 키보드 입력은 LVGL로 전달되지 않습니다. 텍스트 입력에는 키보드 위젯을 사용합니다.
- 메뉴와 드롭다운 목록은 아직 창 안에 표시됩니다. 대화상자는 독립된 창입니다.
- macOS와 Linux용 코드는 포함되어 있지만 Windows에서만 개발했으며 다른 OS에서는 아직 검증하지 않았습니다.
- 실제 보드에 올리는 빌드와 플래싱은 포함하지 않습니다.

## 샘플

[samples/](samples/)에 샘플 프로젝트 28종이 있고, 모두 끌어서 움직이는 조작이 있습니다. 시작 화면이나 **파일 > 샘플 프로젝트**에서 복사본으로 엽니다. LVGL 소스는 들어 있지 않으며, 해당 버전이 설치되어 있지 않으면 열 때 내려받을지 묻습니다. `npm run samples`로 다시 생성합니다.

## 문서

- [doc/UsersGuide.md](doc/UsersGuide.md): 사용 설명서 (앱 안에서는 F1)
- [doc/Tutorial.md](doc/Tutorial.md): 처음 하는 사람을 위한 튜토리얼 (앱 안에서는 **도움말 > 튜토리얼**)
- 영어판: [doc/UsersGuide.en.md](doc/UsersGuide.en.md), [doc/Tutorial.en.md](doc/Tutorial.en.md)
- [ARCHITECTURE.md](ARCHITECTURE.md): 구조와 설계 결정
- [FILE_FORMAT.md](FILE_FORMAT.md): `.mylvgl` 파일 형식

## 라이선스

MIT. LVGL은 MIT 라이선스이며 © LVGL Kft입니다.
