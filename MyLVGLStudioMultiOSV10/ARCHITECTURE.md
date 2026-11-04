# My LVGL Studio 아키텍처

## 애플리케이션 구조

### 전체 구성

앱은 WebView에서 실행되는 JavaScript 프런트엔드와 Rust로 만든 Tauri 셸로 나뉩니다. LVGL은 두 곳에서 실행됩니다. 설계 화면에서는 WebView 안의 WebAssembly로, 네이티브 실행에서는 별도 프로세스로 실행됩니다.

```
┌─ My LVGL Studio 프로세스 ───────────────────────────────────────────┐
│                                                                     │
│  ┌─ WebView ─────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  UI 계층 (React)                                              │  │
│  │    App.jsx · Surface.jsx · panels.jsx · dialogs.jsx           │  │
│  │        │ 읽기·변경              │ 프레임·좌표·포인터          │  │
│  │        ▼                        ▼                             │  │
│  │  상태 계층             엔진 계층                              │  │
│  │    store.js              engine.js                            │  │
│  │    (문서, Undo)          lvgl-<버전>.js (WebAssembly)         │  │
│  │        │                   runtime.c + LVGL                   │  │
│  │        ▼                        ▲ 연산 재생                   │  │
│  │  문서 계층 (UI 의존 없음)       │                             │  │
│  │    project.js · schema.js · emit.js ──┘                       │  │
│  │    codegen.js · versions.js                                   │  │
│  │        │                                                      │  │
│  │        ▼                                                      │  │
│  │  host.js (데스크톱 기능의 단일 창구)                          │  │
│  └───────┬───────────────────────────────▲───────────────────────┘  │
│          │ invoke (명령)                 │ 이벤트                   │
│  ┌───────▼───────────────────────────────┴───────────────────────┐  │
│  │  Tauri 셸 (Rust)                                              │  │
│  │    main.rs    창, 설정, 프로젝트 폴더 읽기·쓰기               │  │
│  │    lvgl.rs    릴리스 목록, 다운로드, 설치, 삭제               │  │
│  │    native.rs  CMake 빌드, 프로그램 실행, 출력 전달            │  │
│  └───────┬──────────────────┬────────────────────┬───────────────┘  │
└──────────┼──────────────────┼────────────────────┼──────────────────┘
           ▼                  ▼                    ▼
    프로젝트 폴더        GitHub (LVGL)      cmake → ninja → gcc
    <이름>.mylvgl        태그 목록, zip            │
    src/, config/             │                    ▼
           ▲                  ▼            네이티브 프로그램
           │            데이터 폴더/lvgl     (SDL2 창, 별도 프로세스)
       사용자 파일       <버전>/ 소스
```

### 계층별 역할과 규칙

| 계층 | 파일 | 역할 | 규칙 |
|---|---|---|---|
| UI | `App.jsx`, `Surface.jsx`, `StartScreen.jsx`, `Preferences.jsx`, `panels.jsx`, `dialogs.jsx`, `controls.jsx`, `start/backgrounds.js` | 화면, 명령, 입력 처리 | 문서는 `store.update()`로만 변경 |
| 상태 | `store.js`, `settings.js`, `themes.js` | 현재 문서와 Undo 기록, 앱 설정의 규칙과 검증, 테마 표 | 문서 변경은 복사본에 적용, 읽은 설정은 `sanitizeSettings()`를 거침 |
| 문서 | `src/lvgl/project.js`, `schema.js`, `emit.js`, `codegen.js`, `versions.js` | 문서 규칙, 연산 목록, C 생성 | UI와 데스크톱 API에 의존하지 않으므로 Node 테스트에서 그대로 실행 |
| 엔진 | `src/lvgl/engine.js`, `public/engine/`, `engine/runtime.c` | LVGL 구동, 프레임과 좌표 제공 | 문서를 직접 읽지 않고 연산만 재생 |
| 호스트 | `src/host.js` | 데스크톱 기능 호출 | Tauri API는 이 파일에서만 호출 |
| 셸 | `src-tauri/src/*.rs` | 파일, 네트워크, 프로세스 | 프런트엔드가 넘긴 경로와 버전 문자열을 검사 |

### UI 구성

```
App
├─ 메뉴 막대            Menu (파일, 편집, 보기, 실행, 도구, 도움말), 창 버튼
├─ 도구 모음            ToolButton, 테마와 언어 팝업
├─ StartScreen           배경 캔버스 + 카드 (작업 영역과 번갈아 표시)
├─ 작업 영역
│  ├─ 왼쪽              Palette, ComponentTree
│  ├─ 가운데            화면 탭, 버전 표시, 확대·축소, 디자인/분할/코드 전환
│  │  ├─ Surface        캔버스(LVGL 프레임) + 오버레이(선택, 핸들, 포인터)
│  │  └─ CodeView       생성 코드(읽기 전용)
│  ├─ 오른쪽            Attributes (속성, 이벤트)
│  └─ 아래              LogView (로그, 빌드)
├─ 상태 표시줄          모드, 파일, LVGL 버전, 화면 크기, 선택 항목, 크기 조절 손잡이
└─ 대화상자             NewProjectDialog, ProjectSettings, LvglManager, PreferencesDialog,
                        ConfirmDialog, MessageDialog, AboutDialog
```

### 주요 동작 흐름

#### 위젯 편집

```
포인터 또는 속성 입력 → store.update() → 새 문서
  → Surface: engine.load() (emit → 모든 객체 재생성 → 렌더링) → 캔버스, 선택 상자 좌표 갱신
  → 코드 보기가 열려 있으면: generateCode() → CodeView 갱신
```

#### 앱 안에서 실행

```
F5 → 이벤트를 포함해 engine.load() → requestAnimationFrame마다 ml_tick()
  → 포인터는 ml_pointer()로 LVGL에 전달 → 이벤트 동작 실행 → 프레임과 로그 갱신
```

#### 저장

```
Ctrl+S → projectFiles() (경로 → 내용 표) → host.writeProject() → write_project
  → 프로젝트 폴더에 쓰기 → src/ui/screens/ 의 불필요한 .c 삭제
```

#### 네이티브 빌드와 실행

```
Shift+F5 → native_check (도구 확인) → lvgl_installed (없으면 LVGL 관리자로 설치)
  → native_run: 코드 쓰기 → cmake 구성·빌드 → 프로그램 실행
  → native-log 이벤트 → 빌드 탭(빌드 출력), 로그 탭(프로그램 출력)
  → 프로그램 종료 → native-exit 이벤트
```

## 핵심 설계

앱의 중심은 **하나의 연산 목록**입니다. 프로젝트 문서를 `emit()`이 연산 목록으로 바꾸면, 설계 화면과 생성 코드가 같은 목록을 사용합니다. 그래서 두 결과가 따로 어긋나기 어렵고, 테스트로 픽셀 단위 일치까지 확인할 수 있습니다.

```
 프로젝트 문서 (.mylvgl JSON)
          │
          ▼
    emit.js: 연산 목록
          │
    ┌─────┴──────────────┐
    ▼                    ▼
 engine.js           codegen.js
 (연산을 재생)        (연산을 C로 출력)
    │                    │
    ▼                    ▼
 runtime.c + LVGL     src/ui/*.c, *.h
 (WebAssembly)           │
    │                    ▼
    ▼                 gcc + SDL2 + LVGL 소스
 설계 화면, 앱 내 실행   네이티브 실행, 펌웨어
```

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/lvgl/schema.js` | 위젯과 속성 표. 속성 패널, 엔진, 생성기가 함께 읽습니다. |
| `src/lvgl/project.js` | 문서, `.mylvgl` 읽기와 검증, 순수 연산(추가, 삭제, 이동, 복제). UI에 의존하지 않습니다. |
| `src/lvgl/emit.js` | 문서를 연산 목록으로 변환 |
| `src/lvgl/engine.js` | WebAssembly 엔진 구동. 앱과 Node 테스트에서 함께 사용합니다. |
| `src/lvgl/codegen.js` | C 코드 생성 |
| `src/lvgl/versions.js` | 지원 버전, 엔진 선택, v8과 v9의 API 이름 차이 |
| `src/lvgl/lvConfText.js` | 생성 프로젝트용 `lv_conf.h` 문자열. 테스트가 `engine/lv_conf.h`와 같은지 확인합니다. |
| `src/App.jsx` | 창 전체, 명령, 단축키 |
| `src/Surface.jsx` | 캔버스, 편집 오버레이, 포인터 처리, LVGL 시계 |
| `src/panels.jsx`, `dialogs.jsx`, `controls.jsx` | 패널, 대화상자, 공용 입력 컨트롤 |
| `src/store.js` | 문서 상태와 Undo 기록 |
| `src/host.js` | 데스크톱 기능 호출의 단일 창구. 브라우저에서는 대체 동작을 합니다. |
| `engine/` | `runtime.c`(JS가 호출하는 C 명령 계층), `lv_conf.h`, CMake 설정 |
| `public/engine/` | 빌드된 엔진 `lvgl-<버전>.js`. 커밋 대상이며 앱에 포함됩니다. |
| `src-tauri/src/main.rs` | 창, 설정, 파일 입출력 |
| `src-tauri/src/lvgl.rs` | LVGL 관리자: 릴리스 목록, 다운로드, 압축 해제, 삭제 |
| `src-tauri/src/native.rs` | 네이티브 빌드와 실행, 출력 전달 |
| `third_party/` | 엔진 빌드 전용 LVGL 소스. git에서 제외합니다. |
| `test/run.mjs`, `test/gui.mjs` | 단위와 픽셀 비교 테스트, 실제 앱 GUI 테스트 |

## 프로젝트 폴더

저장은 `projectFiles()`가 만든 `경로 → 내용` 표를 `write_project`에 넘기는 한 동작입니다. 프로젝트 파일과 코드를 항상 함께 쓰므로 둘이 어긋나지 않습니다. 구조는 README, 파일 형식은 [FILE_FORMAT.md](FILE_FORMAT.md)에 있습니다.

- **경로 검사:** Rust의 `safe_relative()`가 절대 경로와 `..`를 거부합니다.
- **기존 폴더 보호:** 새 프로젝트와 다른 이름으로 저장은 `dir_state`가 `other`이면 거부합니다.
- **정리 범위:** `GENERATED_DIRS`(`src/ui/screens`)에 있으면서 현재 표에 없는 `.c`만 지웁니다.
- **빌드 목록:** CMake는 glob 없이 생성한 파일 목록을 사용하므로 네이티브 빌드 폴더에 남은 옛 화면이 함께 컴파일되지 않습니다.
- **파일 이름 충돌:** 화면 이름이 파일 이름이 되므로 `cNames()`는 대소문자만 다른 이름도 충돌로 처리합니다.
- **파일 연결:** 설치본은 `.mylvgl`을 앱에 연결합니다. 첫 실행은 `startup_file`, 실행 중에는 single-instance 플러그인이 보내는 `open-file` 이벤트로 엽니다.

## 엔진

`engine/runtime.c`는 LVGL 위에 얇은 명령 계층을 둡니다. 객체는 작은 정수 id로 가리키며, 숫자 id는 `schema.js`의 표와 일치해야 합니다. v8과 v9의 차이는 이 파일의 `LVGL_VERSION_MAJOR` 분기에 모읍니다.

- **문자열 없는 경로:** 속성 설정은 `ml_set_i(id, prop, value)`처럼 정수로 호출해 호출 비용을 줄입니다.
- **다시 그리기:** 설계 중에는 변경마다 모든 객체를 지우고 다시 만듭니다. 구조가 단순하고 상태가 남지 않습니다.
- **프레임 전달:** LVGL은 direct 모드로 전체 크기 버퍼에 그리고, JS가 BGRA를 RGBA로 바꿔 캔버스에 씁니다.
- **입력:** 포인터 입력은 큐에 넣으므로 읽기 주기 사이의 짧은 클릭도 사라지지 않습니다.
- **설계와 실행의 차이:** 설계 모드는 이벤트를 등록하지 않고 포인터를 전달하지 않습니다. 실행 모드는 둘 다 합니다.

엔진은 `SINGLE_FILE`로 빌드합니다. wasm이 JS 파일 안에 들어 있어 Tauri와 Node 어디서든 같은 방법으로 불러올 수 있습니다.

## LVGL 버전

버전은 프로젝트 문서의 `lvgl` 값입니다. 버전마다 두 가지가 결정됩니다.

1. **그리는 엔진:** `engineFor()`가 같은 버전, 없으면 같은 주 버전에서 가장 가까운 내장 엔진을 고릅니다.
2. **생성 코드의 API:** `apiFor()`가 v8(`lv_btn_create`, `lv_scr_load`)과 v9(`lv_button_create`, `lv_screen_load`) 이름을 고릅니다.

소스는 필요할 때 내려받습니다. 내장 엔진은 소스 없이 설계와 앱 내 실행을 제공하기 위해 앱에 포함합니다. 사용자 PC에 Emscripten을 요구하지 않기 위한 선택이며, 그 대가로 내장되지 않은 버전은 근사 엔진으로 표시됩니다.

`lvgl.rs`는 임시 폴더에 푼 뒤 마지막에 이름을 바꿔 설치하므로, 중단된 설치가 설치 완료로 보이지 않습니다. 버전 문자열은 폴더 이름과 URL이 되므로 `N.N.N` 형식만 받습니다. 압축 항목은 `enclosed_name()`으로 검사해 대상 폴더 밖에 쓰지 못하게 합니다. LVGL 9.6부터 공개 헤더가 `include/lvgl/`로 옮겨졌으므로 `src`와 함께 `include`도 설치합니다.

## 네이티브 실행

`native.rs`는 `<데이터 폴더>/native/<버전>/`에 프로젝트와 빌드 폴더를 둡니다.

- 내용이 바뀐 파일만 다시 써서 빌드 시간을 줄입니다. LVGL은 버전마다 첫 빌드에서 한 번만 컴파일합니다.
- 진행 내용은 `native-log`, `native-started`, `native-exit` 이벤트로 화면에 전달합니다.
- Windows에서는 MSYS2 UCRT64 폴더를 PATH 앞에 둡니다. 다른 도구 체인의 gcc나 make가 쓰이는 것을 막기 위해서입니다.
- 앱을 닫으면 실행 중인 프로그램도 함께 끝납니다.

생성되는 `main.c`는 `ML_HEADLESS`로 빌드하면 SDL 없이 한 프레임을 파일로 저장합니다. 픽셀 비교 테스트가 이 경로를 사용합니다.

## 편집 모델

- **Undo:** 변경은 복사본에 적용하고, 이전 문서 전체를 기록합니다.
- **묶기:** 같은 필드의 연속 입력은 `coalesce` 키로, 끌기 동작은 gesture로 한 단계로 묶습니다.
- **좌표:** 선택과 히트 테스트는 엔진이 계산한 실제 좌표(`ml_coords`)를 사용하므로 Flex 배치에서도 맞습니다.

## 시작 화면과 테마

- **배경:** `start/backgrounds.js`의 각 배경은 시간과 팔레트만 받는 순수 함수입니다. 같은 함수로 큰 캔버스와 선택용 축소판을 그리고, 테스트는 기록용 컨텍스트로 실행합니다. 새 배경은 `DRAW`에 함수를 추가하고 `i18n.js`에 이름을 넣으면 됩니다.
- **시계:** 배경의 시간은 React 밖에서 흐르므로 렌더링과 무관하게 애니메이션이 이어집니다.
- **테마:** `themes.js`는 색 10가지에서 나머지 변수를 만듭니다. 내장 테마와 사용자 테마가 같은 함수를 쓰며, 사용자 테마는 `settings.customThemes`에 저장합니다.
- **설정:** `settings.json`은 Rust의 `save_settings`가 키 단위로 병합하므로 창 위치와 화면의 설정이 서로 덮어쓰지 않습니다.

## 테스트

| 명령 | 범위 |
|---|---|
| `npm test` | 문서 모델, 파일 형식, 설정, 테마, 배경, 코드 생성기, 내장 엔진별로 모든 위젯·속성·트리거·동작, 생성 C와 엔진의 픽셀 일치 |
| `npm run test:gui` | 격리된 데이터 폴더와 WebView2 프로필로 실제 앱을 띄워 조작: 시작 화면, 설계, 저장, 실행, 환경 설정, 재시작 후 복원, LVGL 설치와 네이티브 실행 |

픽셀 비교는 같은 프로젝트를 WebAssembly 엔진과 gcc 빌드로 각각 그려 모든 픽셀의 색을 비교합니다. 모든 위젯과 속성, 크기 형식, 정렬, 글꼴을 쓴 프로젝트(`test/features.mjs`)까지 대상입니다. 시간에 따라 변하는 스피너는 숨겨서 비교합니다.

출력 형식은 `test/reporter.mjs`가 맡습니다. 테스트마다 순번, 결과, 이름, 시간을 세로로 맞춰 색과 함께 출력하고, 끝에 카테고리별 요약 표와 실패 목록을 보여 주며, `test-results/`에 JSON으로 저장합니다.

## 새 위젯이나 속성을 추가할 때

1. `schema.js`에 위젯과 속성을 추가합니다.
2. `runtime.c`의 enum과 `switch`에 같은 id로 추가합니다.
3. 정수 속성이면 `emit.js`의 목록에, 코드 출력은 `codegen.js`에 추가합니다.
4. `i18n.js`의 두 언어에 이름을 넣고, 필요하면 `icons.jsx`에 아이콘을 추가합니다.
5. `npm run build:engine`으로 엔진을 다시 빌드합니다.
6. `valueFor()`와 `visible` 표(`test/features.mjs`)에 추가해 픽셀 비교와 화면 변화 검사의 대상에 넣습니다.
