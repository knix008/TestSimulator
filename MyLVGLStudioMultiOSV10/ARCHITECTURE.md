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
    src/, config/, assets/    │                    ▼
           ▲                  ▼            네이티브 프로그램
           │            데이터 폴더/lvgl     (SDL2 창, 별도 프로세스)
       사용자 파일       <버전>/ 소스
```

### 계층별 역할과 규칙

| 계층 | 파일 | 역할 | 규칙 |
|---|---|---|---|
| UI | `App.jsx`, `Surface.jsx`, `StartScreen.jsx`, `Preferences.jsx`, `panels.jsx`, `dialogs.jsx`, `controls.jsx`, `start/backgrounds.js` | 화면, 명령, 입력 처리 | 문서는 `store.update()`로만 변경 |
| 상태 | `store.js`, `settings.js`, `themes.js` | 현재 문서와 Undo 기록, 앱 설정의 규칙과 검증, 테마 표 | 문서 변경은 복사본에 적용, 읽은 설정은 `sanitizeSettings()`를 거침 |
| 문서 | `src/lvgl/project.js`, `schema.js`, `emit.js`, `codegen.js`, `gluegen.js`, `viewmodel.js`, `versions.js` | 문서 규칙, 뷰모델과 바인딩, 연산 목록, C 생성 | UI와 데스크톱 API에 의존하지 않으므로 Node 테스트에서 그대로 실행 |
| 엔진 | `src/lvgl/engine.js`, `public/engine/`, `engine/runtime.c`, `engine/mvvm/` | LVGL 구동, 프레임과 좌표 제공, 바인딩 | 문서를 직접 읽지 않고 연산만 재생. 바인딩은 생성 코드와 같은 `engine/mvvm` 라이브러리로 |
| 호스트 | `src/host.js` | 데스크톱 기능 호출 | Tauri API는 이 파일에서만 호출 |
| 셸 | `src-tauri/src/*.rs` | 파일, 네트워크, 프로세스 | 프런트엔드가 넘긴 경로와 버전 문자열을 검사 |

### UI 구성

```
App
├─ 메뉴 막대            Menu (파일, 편집, 보기, 실행, 도구, 도움말), 창 버튼
├─ 도구 모음            ToolButton, 테마와 언어 팝업
├─ StartScreen           배경 캔버스 + 카드 (작업 영역과 번갈아 표시)
├─ 작업 영역
│  ├─ 왼쪽              Palette
│  ├─ 가운데            화면 탭, 버전 표시, 확대·축소, 디자인/분할/코드 전환
│  │  ├─ Surface        캔버스(LVGL 프레임) + 오버레이(선택, 핸들, 포인터)
│  │  ├─ CodeView       생성 코드(편집하면 문서로 되돌림)
│  │  └─ LogView        로그, 빌드 (가운데 열 아래)
│  └─ 오른쪽            ComponentTree, Attributes (속성, 이벤트)
├─ 상태 표시줄          모드, 파일, LVGL 버전, 화면 크기, 선택 항목, 크기 조절 손잡이
└─ 대화상자             NewProjectDialog, ProjectSettings, LvglManager, PreferencesDialog,
                        ConfirmDialog, MessageDialog, AboutDialog
└─ ContextMenu          오른쪽 버튼 메뉴. 브라우저 기본 메뉴를 대체
```

### 주요 동작 흐름

#### 위젯 편집

```
포인터 또는 속성 입력 → store.update() → 새 문서
  → Surface: engine.load() (emit → 모든 객체 재생성 → 렌더링) → 캔버스, 선택 상자 좌표 갱신
  → 코드 보기가 열려 있으면: generateCode() → CodeView 갱신
```

#### Arc의 입력 판정

Arc는 `engine/runtime.c`와 `codegen.js` 양쪽에서 `LV_OBJ_FLAG_ADV_HITTEST`를 켭니다. 기본값이면 사각형 전체가 입력을 받아, 겹친 링 중 안쪽 링이 바깥 링의 입력을 가져갑니다. 두 곳은 항상 함께 바꿔야 합니다.

#### 대화상자 창

`Dialog`는 `window.open("about:blank#dialog-<이름>")`으로 자식 창을 열고 React 포털로 그 문서에 그립니다. 같은 렌더러이므로 상태와 처리기를 나누지 않으며, `popout.js`가 스타일시트와 `<html>` 속성을 복사해 맞춥니다. 창은 내용을 잰 뒤 그 크기로 보여 주고, 열려 있는 동안 메인 창을 비활성화합니다. 대화상자 안에서 창에 이벤트를 다는 코드는 `window` 대신 요소의 `ownerDocument.defaultView`를 써야 합니다. 웹판과 `MLS_INLINE_DIALOGS`를 켠 GUI 테스트는 창 안에 그립니다. 튜토리얼의 안내 카드는 창의 일부를 비춰야 하므로 메인 창 안에 있습니다.

`standsFree` 대화상자(사용 설명서, 라벨 `dialog-free-*`)는 예외입니다. 소유자 없이 작업 표시줄에 나타나고, 크기를 바꿀 수 있고, 메인 창을 막지 않습니다. 메인 창이 닫힐 때 `popout::close_all`로 함께 닫습니다. 다시 열기 명령은 `focusPopout`으로 기존 창을 앞으로 가져옵니다.

#### 값 연결과 애니메이션

이벤트 동작 `setValue`, `showValue`는 원본 값을 대상의 범위로 환산해 전달합니다. 엔진의 `range_of`와 생성기의 `valueRange`가 같은 범위를 내야 설계 화면과 코드가 같게 동작합니다. `animate` 속성은 실행할 때만 동작하고, 값이 바뀔 때마다 VALUE_CHANGED를 보내 연결된 콘트롤도 함께 움직입니다.

#### 개발 서버 범위

프로젝트 폴더에는 LVGL 소스와 빌드 결과가 수만 개 들어 있습니다. `vite.config.js`가 의존성 검색을 `index.html`로 제한하고 이 폴더들을 감시에서 빼지 않으면 `npm start`의 페이지 표시가 46초까지 늘어납니다. 시험으로 고정해 두었습니다.

#### 글꼴

설계 화면(WASM 엔진)과 생성 코드 모두 LVGL의 TinyTTF로 그리므로 결과가 픽셀까지 같습니다(`test/run.mjs`가 gcc 빌드와 비교). 파일 내용은 문서 밖의 `fonts.js`에 두어 실행 취소 기록을 키우지 않습니다. 디코더는 글꼴 모음의 첫 면만 열기 때문에, 다른 면을 쓸 때는 모음 머리의 첫 항목이 그 면을 가리키도록 복사본을 고칩니다. 엔진은 (파일, 면, 크기)별로 디코더를 유지합니다. 파일에 없는 글자는 `fallback`으로 내장 글꼴에서 찾습니다.

#### LVGL 설정

`engine/lv_conf.h`는 설계 엔진과 시뮬레이터가 함께 쓰는 공용 설정이고 엔진은 이 설정으로 미리 빌드됩니다. 프로젝트의 `lvConf`는 생성되는 `config/lv_conf.h`에만 반영되므로 설계 화면의 모양에는 영향을 주지 않습니다. 창의 항목은 코드에 적어 두지 않고 버전의 템플릿을 읽어 만듭니다.

#### 코드 편집

```
코드 보기에 입력 → 250ms 뒤 applyCodeEdit(문서, 파일, 글)
  → 지금 문서에서 생성한 코드와 입력한 코드를 각각 읽어 차이만 문서에 적용
  → 적용 결과를 다시 생성해서 입력과 같은지 확인
  → 성공: store.update() → 위와 같은 경로로 그래픽 갱신
  → 실패: 문서는 그대로, 코드 창 아래에 오류와 줄 번호 표시
```

차이만 적용하므로 코드에 나타나지 않는 값(이벤트, 키보드의 대상, 이 LVGL 버전에 없는 콘트롤)은 그대로 남습니다. 편집할 수 있는 파일은 화면 파일, `main.c`의 `WIDTH`/`HEIGHT`, `ui.c`의 `lv_theme_default_init` 입니다.

#### 앱 안에서 실행

```
F5 → 이벤트를 포함해 engine.load() → requestAnimationFrame마다 ml_tick()
  → 포인터는 ml_pointer()로 LVGL에 전달 → 이벤트 동작 실행 → 프레임과 로그 갱신
```

#### 저장

```
Ctrl+S → projectFiles() (경로 → 내용 표) + starterFiles() (src/app) → host.writeProject() → write_project
  → 생성 파일 쓰기 → src/app/ 은 없는 파일만 쓰기 (다른 이름으로 저장이면 원래 폴더의 src/app/ 복사)
  → GENERATED_DIRS 의 불필요한 .c, .h 삭제
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
| `src/lvgl/problems.js` | 문서와 컴파일러 출력에서 문제점 목록을 만드는 순수 함수(`findProblems`, `parseBuildProblems`), 콘트롤의 코드 위치 찾기(`locateInCode`). |
| `src/tooltips.js` | `title`을 직접 주지 않은 버튼에 이름을 툴팁으로 붙입니다. 포인터가 올라올 때 계산해 현재 언어를 따릅니다. |
| `src/lvgl/project.js` | 문서, `.mylvgl` 읽기와 검증, 순수 연산(추가, 삭제, 이동, 복제). UI에 의존하지 않습니다. |
| `src/lvgl/emit.js` | 문서를 연산 목록으로 변환 |
| `src/lvgl/engine.js` | WebAssembly 엔진 구동. 앱과 Node 테스트에서 함께 사용합니다. |
| `src/lvgl/codegen.js` | C 코드 생성 |
| `src/lvgl/viewmodel.js` | 뷰모델과 바인딩의 문서 연산(추가, 이름 바꾸기, 삭제, 연결), 데이터 컨텍스트 해석, 파일 검증 |
| `src/CodeEditor.jsx` | 코드 편집기 창: 로직 자동 저장, 생성 코드 편집, 자동 완성, 줄 표시, 빌드·출력·문제점, 실행 |
| `src/lvgl/glueparse.js` | `ui_bindings.c`, `vm_<이름>.c`를 읽어 바인딩과 뷰모델 속성에 반영 |
| `src/lvgl/appcheck.js` | 로직(`src/app/`)이 쓰는 뷰모델 이름 중 설계에 없는 것을 찾기(이름 바꾸기 기록으로 새 이름 제시) |
| `src/lvgl/gluegen.js` | MVVM 층의 C 생성: `lib/mvvm/`, `src/glue/`, `ui_bindings.c`, 사용자 시작 파일 `src/app/` |
| `src/lvgl/mvvmSource.js` | `engine/mvvm`의 사본 (`npm run mvvm-source`로 생성, 테스트가 일치를 확인) |
| `src/ViewModels.jsx` | 뷰모델 탭, 속성 패널의 연결 편집기, 데이터 컨텍스트 선택 |
| `engine/mvvm/` | 바인딩 라이브러리 C 소스: `mvvm.c`(LVGL 없음), `mvvm_lvgl.c`(위젯 바인딩, 타이머). 엔진과 생성 프로젝트가 함께 씁니다. |
| `src/lvgl/codeparse.js` | 고친 C 코드를 읽어 문서에 반영 |
| `src/lvgl/lvconf.js` | `lv_conf_template.h` 해석, 조건 평가, 프로젝트별 `lv_conf.h` 생성 |
| `src/lvgl/confTemplates.js` | 내장 엔진 버전의 `lv_conf_template.h` (`npm run conf-templates`로 생성) |
| `src/lvgl/fonts.js` | 글꼴 파일 해석(면, 이름, 문자표)과 글꼴 보관 |
| `src/LvConfDialog.jsx`, `src/FontsDialog.jsx` | LVGL 설정 창과 글꼴 창 |
| `src/Tutorial.jsx`, `src/lvgl/tutorial.js` | 튜토리얼: 스마트워치를 만드는 단계와 할 일(프로젝트를 보고 판단, `finishStep`으로 대신 수행), 아래 창을 그대로 쓰게 두는 안내 카드, 시작 시 묻는 창 |
| `src/Guide.jsx`, `src/markdown.js` | `doc/`의 문서를 앱 안에서 보는 창. 마크다운을 데이터로 바꿔 요소로 그리며 HTML을 만들지 않음 |
| `src/cursor.js` | 끄는 동안의 마우스 포인터 |
| `src/popout.js`, `src-tauri/src/popout.rs` | 대화상자를 독립 OS 창으로 띄우기 |
| `src-tauri/windows/hooks.nsh` | 설치 시 `.mylvgl` 파일 아이콘과 등록, 제거 시 정리 |
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
- **정리 범위:** `GENERATED_DIRS`(`src/ui/screens`, `src/ui/images`, `src/ui/fonts`, `src/glue`)에 있으면서 현재 표에 없는 `.c`, `.h`만 지웁니다.
- **사용자 코드 보호:** `src/app/`은 생성 표에 없고 `GENERATED_DIRS`에도 없습니다. `write_missing`이 없는 파일만 쓰므로 한 번 만든 뒤에는 앱이 절대 덮어쓰지 않습니다.
- **빌드 목록:** CMake는 생성한 파일을 목록으로 적으므로 네이티브 빌드 폴더에 남은 옛 화면이 함께 컴파일되지 않습니다. 사용자 코드만 `src/app/*.c`, `*.cpp`를 glob으로 찾습니다(C++이 있으면 `enable_language(CXX)`). 네이티브 실행은 빌드 폴더의 `src/app/`을 지우고 프로젝트 폴더(또는 샘플 폴더)의 것을 복사합니다.
- **파일 이름 충돌:** 화면 이름이 파일 이름이 되므로 `cNames()`는 대소문자만 다른 이름도 충돌로 처리합니다.
- **파일 연결:** 설치본은 `.mylvgl`을 앱에 연결합니다. 첫 실행은 `startup_file`, 실행 중에는 single-instance 플러그인이 보내는 `open-file` 이벤트로 엽니다.

## 화면과 로직 분리 (MVVM)

생성 코드와 사용자 로직이 섞이면 설계를 바꿀 때 로직이 사라집니다. 그래서 WPF의 MVVM처럼 세 층으로 나누고, 그 사이를 생성되는 뷰모델(glue)로만 잇습니다.

```
  src/ui/  (View, 생성)                src/glue/ (ViewModel, 생성)          src/app/ (사용자)
  ┌───────────────────────┐  mv_bind   ┌──────────────────────────┐  get/set   ┌──────────────────┐
  │ ui_slider1 ◄──────────┼───────────►│ vm_main.c                │◄───────────┤ app.c (로직)     │
  │ ui_label1  ◄──────────┼────────────┤  speed  running  status  │ mv_observe │ motor.c (Model)  │
  │ ui_bindings.c         │ VALUE_     │ glue.h (lvgl.h 없음)     ├───────────►│ tests/ (LVGL 없이)│
  └───────────────────────┘ CHANGED    └──────────────────────────┘            └──────────────────┘
              ▲                                     ▲
              └────── lib/mvvm (mvvm.c: 속성·관찰자·형식, mvvm_lvgl.c: 위젯 바인딩·타이머) ──┘
```

- **문서:** `project.viewModels`(이름, 속성: 형식·초깃값·범위), 화면의 `dataContext`, 노드의 `bindings`(속성 키, 경로, 뷰모델, 방향, 변환기, 형식). 자세한 내용은 [FILE_FORMAT.md](FILE_FORMAT.md).
- **연산:** `emit()`이 `vmprop`(맨 앞, 번호로 가리킴)과 `bind`(모든 객체를 만든 뒤)를 냅니다. 엔진은 `ml_vm_prop`, `ml_bind`로 재생하고, 생성기는 `vm_<이름>.c`와 `ui_bindings.c`로 출력합니다. 같은 연산, 같은 C 라이브러리이므로 설계 화면과 네이티브 프로그램의 바인딩 결과가 픽셀까지 같습니다(테스트로 확인).
- **라이브러리:** `mvvm.c`는 표준 C만 씁니다. 값이 바뀔 때만 관찰자에게 알리고, 바인딩이 스스로 낸 변경은 그 바인딩에 다시 알리지 않으며(`mv_set_*_from`), 같은 속성의 연쇄 변경은 `MV_MAX_DEPTH`에서 멈춥니다. 형식 문자열은 직접 해석해 값 하나만 읽습니다. `mvvm_lvgl.c`는 `lv_obj_check_type`으로 위젯 종류를 알아내고 `LV_EVENT_VALUE_CHANGED`로 화면 → 뷰모델 방향을, `LV_EVENT_DELETE`로 정리를 합니다.
- **설계 화면:** 바인딩은 설계 모드에서도 적용되어 뷰모델의 초깃값이 보입니다. 실행 중의 값은 엔진의 `ml_vm_changes` 카운터가 바뀔 때만 읽어 뷰모델 탭에 보냅니다(분리 실행 창은 `run-vm` 이벤트, 탭에서 바꾼 값은 `run-vm-set`).
- **로직 점검:** `read_app_code`가 `src/app/`의 소스를 읽고(프로젝트를 열 때, 저장 뒤, 창이 다시 앞에 올 때), `appcheck.js`가 주석과 문자열을 지운 코드에서 `vm_<모델>_get_/set_/prop_<속성>`, `vm_<모델>_init`, `#include "vm_<모델>.h"` 중 생성되지 않는 이름을 찾아 문제점(파일과 줄)으로 냅니다. 새 이름은 `viewModelRenames` 기록으로 찾고(추측 아님), 한두 글자 오타만 비슷한 이름을 제안합니다. 로직이 직접 정의한 `vm_` 함수는 제외합니다. 로직 파일은 읽기만 합니다.
- **코드 편집기 (`CodeEditor.jsx`, `editor/codemirror.js`):** 독립 창(`standsFree`, `keepOnEscape` 대화상자). CodeMirror 6, 보기 하나에 파일마다 `EditorState`를 보관해 실행 취소 기록이 파일별로 유지됨(`root`를 창의 문서로 주어 별도 창에도 스타일이 들어감). 바깥에서 바뀐 내용(디스크, 설계)은 `External` 표시와 `addToHistory: false`로 넣어 실행 취소 대상이 아님. 키는 CodeMirror가 먼저 받고, 처리한 키(defaultPrevented)와 나머지 Ctrl 키는 메인 창으로 가지 않게 막음. 로직은 `app_file_write`로 입력 0.4초 뒤 저장(`src/app/` 밖은 Rust가 거부), 저장 안 된 프로젝트는 `app_draft`가 만든 데이터 폴더의 `drafts/project-*`에 쓰고 `appOrigin`으로 첫 저장 때 복사. 생성 파일 편집은 `applyCodeEdit`로 설계에 반영하고 폴더가 있으면 1.2초 뒤 프로젝트 저장. 실행은 보류 중인 저장을 끝낸 뒤 네이티브 실행.
- **코드 편집:** `ui_bindings.c`의 `mv_bind`와 `src/glue/vm_<이름>.c`의 `mv_prop_init_*`는 `glueparse.js`가 설계로 되돌립니다(같은 자리의 이름 변경은 rename으로 연결 유지). 나머지 glue 파일과 `lib/mvvm/`은 읽기 전용입니다. 화면 파일에서 위젯 이름을 바꾸면 노드가 유지되므로 바인딩도 유지됩니다.

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

## 실행 창

F5는 `run` 라벨의 별도 Tauri 창을 엽니다. 메인 창이 문서와 이미지 원본을 `run_open`으로 Rust에 맡기면, 실행 창(`RunWindow.jsx`)이 `run_payload`로 받아 자체 엔진 인스턴스에서 돌립니다. 메인 창의 설계 화면과 상태를 공유하지 않으므로 실행 중에도 편집할 수 있습니다. 로그는 `run-log` 이벤트로, 창 닫힘은 `run-closed` 이벤트로 메인 창에 전달합니다. 브라우저(`dev:web`)에서는 별도 창이 없어 설계 화면 안에서 실행합니다.

## 끌기 처리

끌기는 모두 `window`의 포인터 이벤트로 처리합니다. 끌리는 요소는 움직이고 다시 그려지기 때문입니다. 브라우저의 기본 드래그가 시작되면 `pointercancel`로 끌기가 끊기므로 `dragstart`를 앱 전체에서 막습니다. `Surface`의 콜백은 ref로 보관합니다. 언어가 바뀌어 콜백이 달라져도 엔진을 다시 불러오거나 실행을 다시 시작하지 않게 하기 위해서입니다.

## 네이티브 실행

`native.rs`는 `<데이터 폴더>/native/<버전>/`에 프로젝트와 빌드 폴더를 둡니다.

- 내용이 바뀐 파일만 다시 써서 빌드 시간을 줄입니다. LVGL은 버전마다 첫 빌드에서 한 번만 컴파일합니다.
- 진행 내용은 `native-log`, `native-started`, `native-exit` 이벤트로 화면에 전달합니다.
- Windows에서는 앱 전용 컴파일러(`src-tauri/src/toolchain.rs`)만 씁니다. WinLibs(gcc, CMake, Ninja)와 SDL2의 정해진 버전을 SHA-256으로 확인해 `%LOCALAPPDATA%\MyLVGLStudio\toolchain`에 필요한 파일만 풉니다. 빌드할 때 PATH에는 이 폴더와 Windows 폴더만 두어 다른 도구 체인이 끼어들지 않습니다. 시작할 때 없으면 자동으로 설치하고, 제거 프로그램이 지웁니다(`windows/hooks.nsh`, 업데이트 때는 유지).
- 앱을 닫으면 실행 중인 프로그램도 함께 끝납니다.

생성되는 `main.c`는 `ML_HEADLESS`로 빌드하면 SDL 없이 한 프레임을 파일로 저장합니다. 픽셀 비교 테스트가 이 경로를 사용합니다.

## 편집 모델

- **Undo:** 변경은 복사본에 적용하고, 이전 문서 전체를 기록합니다.
- **묶기:** 같은 필드의 연속 입력은 `coalesce` 키로, 끌기 동작은 gesture로 한 단계로 묶습니다.
- **좌표:** 선택과 히트 테스트는 엔진이 계산한 실제 좌표(`ml_coords`)를 사용하므로 Flex 배치에서도 맞습니다.

## 버전별 위젯

`schema.js`의 위젯에 `since`와 `until`을 둘 수 있습니다. `availableIn()`이 콘트롤 패널과 컨텍스트 메뉴의 표시를 결정합니다. 프로젝트의 버전을 바꿔 없는 위젯이 생기면 문서에는 남기고 `emit()`이 제외하므로, 버전을 되돌리면 복구됩니다.

| 위젯 | 버전 |
|---|---|
| Color Wheel, Meter | v8만 |
| Scale, Barcode | v9.0 이상 |
| Arc Label | v9.4 이상 |
| 그 외 33종 (Grid 포함) | 공통 |

## 이미지

픽셀은 문서에 넣지 않습니다. 문서(`project.images`)는 이름과 경로만 갖고, 원본과 디코드한 픽셀은 `src/lvgl/images.js`의 저장소에 둡니다. 편집할 때마다 문서 전체를 복사하는 Undo 기록을 작게 유지하기 위한 구조입니다.

- **가져오기:** Rust가 파일을 base64로 읽고, 브라우저의 `createImageBitmap`이 RGBA로 디코드합니다.
- **설계 화면:** 엔진이 BGRA 픽셀을 WebAssembly 메모리에 한 번 복사한 뒤 설명자(`ml_image_load`)를 만듭니다.
- **코드:** v9는 ARGB8888 `lv_image_dsc_t`, v8은 색 깊이별 데이터를 담은 `lv_img_dsc_t`를 생성합니다. 코드 보기에서는 픽셀 배열을 생략합니다.
- **저장:** 원본은 `assets/images/`, C 배열은 `src/ui/images/`에 씁니다.

## 숫자 입력

수치 입력은 모두 `controls.jsx`의 `Stepper`와 `SizeField`, 시작 화면 옵션은 `RangeStepper`를 씁니다. 입력란을 내용 폭에 맞추므로 값과 단위가 함께 가운데 정렬됩니다.

## 시작 화면과 테마

- **배경:** `start/backgrounds.js`의 각 배경은 시간과 팔레트만 받는 순수 함수입니다. 같은 함수로 큰 캔버스와 선택용 축소판을 그리고, 테스트는 기록용 컨텍스트로 실행합니다. 새 배경은 `DRAW`에 함수를 추가하고 `i18n.js`에 이름을 넣으면 됩니다.
- **시계:** 배경의 시간은 React 밖에서 흐르므로 렌더링과 무관하게 애니메이션이 이어집니다.
- **카드 보드:** `start/layout.js`와 `start.css`는 My Git Master와 같은 설계입니다. 3열 격자에 카드를 놓고 위로 압축합니다. 규칙은 DOM과 무관한 순수 함수입니다.
- **가독성:** `themes.js`의 `readable()`이 글자색을 모든 표면과 비교해 대비 4.5:1을 넘을 때까지 보정합니다. 사용자 테마도 같은 경로를 거치므로 어떤 색을 골라도 글자가 사라지지 않습니다. GUI 테스트는 40개 테마 모두에서 입력란, 드롭다운, 안내 문구의 실제 대비를 측정합니다.
- **테마:** `themes.js`는 색 10가지에서 나머지 변수를 만듭니다. 내장 테마와 사용자 테마가 같은 함수를 쓰며, 사용자 테마는 `settings.customThemes`에 저장합니다.
- **설정:** `settings.json`은 Rust의 `save_settings`가 키 단위로 병합하므로 창 위치와 화면의 설정이 서로 덮어쓰지 않습니다.

## 테스트

| 명령 | 범위 |
|---|---|
| `npm test` | 문서 모델, 파일 형식, 설정, 테마, 배경, 코드 생성기, 내장 엔진별로 모든 위젯·속성·트리거·동작, 생성 C와 엔진의 픽셀 일치 |
| `npm run test:gui` | 별도 빌드 폴더(`target/e2e`), 격리된 데이터 폴더와 WebView2 프로필로 실제 앱을 띄워 조작(`MLS_SETTINGS_DIR`가 있으면 단일 인스턴스를 적용하지 않음): 시작 화면, 설계, 저장, 실행, 환경 설정, 재시작 후 복원, LVGL 설치와 네이티브 실행 |

픽셀 비교는 같은 프로젝트를 WebAssembly 엔진과 gcc 빌드로 각각 그려 모든 픽셀의 색을 비교합니다. 모든 위젯과 속성, 크기 형식, 정렬, 글꼴을 쓴 프로젝트(`test/features.mjs`)까지 대상입니다. 시간에 따라 변하는 스피너는 숨겨서 비교합니다.

출력 형식은 `test/reporter.mjs`가 맡습니다. 테스트마다 순번, 결과, 이름, 시간을 세로로 맞춰 색과 함께 출력하고, 끝에 카테고리별 요약 표와 실패 목록을 보여 주며, `test-results/`에 JSON으로 저장합니다.

## 새 위젯이나 속성을 추가할 때

1. `schema.js`에 위젯과 속성을 추가합니다.
2. `runtime.c`의 enum과 `switch`에 같은 id로 추가합니다.
3. 정수 속성이면 `emit.js`의 목록에, 코드 출력은 `codegen.js`에, 코드를 다시 읽는 부분은 `codeparse.js`에 추가합니다.
4. `i18n.js`의 두 언어에 이름을 넣고, 필요하면 `icons.jsx`에 아이콘을 추가합니다.
5. `npm run build:engine`으로 엔진을 다시 빌드합니다.
6. `valueFor()`와 `visible` 표(`test/features.mjs`)에 추가해 픽셀 비교와 화면 변화 검사의 대상에 넣습니다.
