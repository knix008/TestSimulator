# My LVGL Studio

LVGL 애플리케이션의 화면을 그래픽으로 설계하고, 바로 실행해 보고, 펌웨어에 넣을 C 코드를 생성하는 데스크톱 도구입니다. Tauri 2와 JavaScript(React)로 만들었습니다.

설계 화면은 HTML로 흉내 낸 것이 아니라 WebAssembly로 컴파일한 **실제 LVGL이 그립니다.**

## 주요 기능

- **화면 설계:** 팔레트에서 끌어다 놓기, 이동과 크기 조절, 구성 요소 트리, 속성 패널, 여러 화면, Undo/Redo
- **콘트롤:** 프로젝트의 LVGL 버전에 있는 위젯을 모두 표시 (v8.4 35종, v9.2 35종, v9.6 36종). Grid 레이아웃 포함
- **이미지:** PNG, JPG, BMP, GIF, WebP, SVG 가져오기, 회전과 배율. 원본은 프로젝트에 보관하고 LVGL 버전에 맞는 C 배열로 생성
- **이벤트:** 코드 없이 화면 전환, 텍스트 변경, 표시 전환, 로그 출력을 연결
- **두 가지 실행 방식**
  - 실행 화면(F5): 분리된 창에서 바로 동작. 컴파일러와 LVGL 소스가 필요 없음
  - 네이티브 실행(Shift+F5): 생성한 C 코드를 gcc와 SDL2로 빌드해 별도 창에서 실행
- **LVGL 버전 선택:** 프로젝트 설정에서 v8.3 이상과 v9 중에서 고르며, 생성 코드가 해당 버전의 API를 따름
- **LVGL 관리자:** 필요한 버전의 소스만 GitHub에서 내려받아 설치하거나 삭제
- **코드 보기:** 디자인/분할/코드 전환
- **프로젝트 폴더:** 저장하면 프로젝트 폴더에 프로젝트 파일(`.mylvgl`)과 구조화한 C 코드를 함께 저장
- **시작 화면:** 움직이는 배경 24종(3D 포함), 메뉴 타일, 최근 프로젝트, 옮기고 크기를 바꿀 수 있는 카드
- **테마:** 라이트 20종과 다크 20종, 색을 직접 정하는 사용자 정의 테마. 어떤 색을 골라도 글자 대비 4.5:1 이상을 보장
- **환경 설정:** 언어, 테마, 시작 화면 옵션. 창 위치와 크기도 기억

## 프로젝트 폴더

```
MyApp/
├─ MyApp.mylvgl            프로젝트 파일 (형식: FILE_FORMAT.md)
├─ assets/images/          가져온 이미지 원본
├─ CMakeLists.txt          데스크톱 빌드
├─ config/lv_conf.h        데스크톱 빌드용 LVGL 설정
└─ src/
   ├─ main.c               데스크톱 실행 진입점
   └─ ui/                  펌웨어에 넣는 폴더
      ├─ ui.h, ui.c        객체 선언과 ui_init()
      ├─ ui_events.h, ui_events.c
      ├─ screens/ui_<화면>.c   화면마다 한 파일
      └─ images/ui_img_<이미지>.c   이미지마다 한 파일
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
| 네이티브 실행 | gcc, CMake, Ninja, SDL2 (LVGL 관리자의 **컴파일러 설치**로 설치 가능) |
| WebAssembly 엔진 다시 빌드 | Emscripten, CMake, Ninja |

Windows에서는 MSYS2 UCRT64로 네이티브 실행 도구를 설치할 수 있습니다.

```
pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-SDL2
```

MSYS2의 Emscripten 패키지는 Node도 함께 설치합니다. `ucrt64\bin`이 PATH에서 기존 Node보다 앞에 있으면 PC 전체의 `node`가 바뀌므로 주의하세요. 엔진 빌드 스크립트는 자신을 실행한 Node를 `EM_NODE_JS`로 Emscripten에 넘깁니다.

## 명령

| 명령 | 내용 |
|---|---|
| `npm start` | 현재 소스로 데스크톱 앱 실행 |
| `npm run dev:web` | 브라우저에서 화면만 실행(저장과 네이티브 기능 제외) |
| `npm test` | 문서 모델, 설정, 테마, 배경, 코드 생성기, 모든 위젯·속성·이벤트, 생성 코드와 엔진의 픽셀 비교 |
| `npm test -- --no-native` | gcc 빌드를 뺀 테스트 |
| `npm run test:gui` | 앱을 `src-tauri/target/e2e`에 빌드한 뒤 모든 화면을 조작하는 GUI 테스트. `npm start` 창을 띄운 채 실행할 수 있습니다. |
| `npm run fetch:lvgl` | 엔진 빌드용 LVGL 소스를 `third_party/`에 받기 |
| `npm run build:engine` | WebAssembly 엔진을 빌드해 `public/engine/`에 저장 |
| `npm run icons` | 앱 아이콘 생성 |
| `npm run build:win` | Windows 설치 파일 빌드 (`build:mac`, `build:linux`도 있음) |

## 현재 제약

- 한글 글꼴은 아직 없습니다. 내장 Montserrat에는 한글이 없어서 한글 텍스트가 LVGL 화면에 표시되지 않습니다.
- 사용자 C 코드 연결은 아직 없습니다.
- 탭 뷰의 탭 안에 위젯을 배치하는 기능은 아직 없습니다. 탭에는 이름만 표시됩니다.
- 외부 라이브러리나 장치가 필요한 위젯(Lottie, rlottie, GIF, FFmpeg, GStreamer, 3D Texture)과 입력기(Pinyin)는 넣지 않았습니다.
- 앱 안에서 실행할 때 PC 키보드 입력은 LVGL로 전달되지 않습니다. 텍스트 입력에는 키보드 위젯을 사용합니다.
- 메뉴와 대화상자는 아직 My Git Master처럼 별도 OS 창이 아니라 창 안에 표시됩니다.
- macOS와 Linux용 코드는 포함되어 있지만 Windows에서만 개발했으며 다른 OS에서는 아직 검증하지 않았습니다.
- 실제 보드에 올리는 빌드와 플래싱은 포함하지 않습니다.

## 문서

- [UsersGuide.md](UsersGuide.md): 사용 설명서
- [ARCHITECTURE.md](ARCHITECTURE.md): 구조와 설계 결정
- [FILE_FORMAT.md](FILE_FORMAT.md): `.mylvgl` 파일 형식

## 라이선스

MIT. LVGL은 MIT 라이선스이며 © LVGL Kft입니다.
