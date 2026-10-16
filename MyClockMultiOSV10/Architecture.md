# MyClock 설계 문서

WPF/.NET 8 판을 JavaScript 로 옮기면서 무엇이 어디로 갔고, 왜 그렇게 했는지 적은 문서입니다.
코드를 처음 읽는 사람을 위한 안내서입니다.

처음에는 Electron 으로 옮겼고, 그 뒤 **데스크톱 셸만 Tauri 2(Rust)로 바꿨습니다.** 화면(`src/`)은
그대로이며, Electron 메인 프로세스가 하던 일을 `src-tauri/src/` 의 Rust 코드가 같은 규칙으로
합니다. 기능과 설정 파일 형식·위치는 바뀌지 않았습니다. 바꾸며 달라진 자리는
[11-1절](#11-1-electron-에서-tauri-로)에 있습니다.

## 1. 셸과 창

Tauri 앱은 Rust 로 된 셸 프로세스 하나와, 창마다 하나씩의 웹뷰(Windows 는 WebView2,
macOS 는 WKWebView, Linux 는 WebKitGTK)로 나뉩니다.
WPF 판의 창들과는 다음과 같이 1:1로 대응합니다.

| 이 판 | WPF 원본 | 역할 |
|----------|----------|------|
| `src-tauri/src/lib.rs` | `App.xaml.cs` | 창 생성, 트레이, 자동 실행, 창 이동/크기 조절, 단일 실행 |
| `src-tauri/src/store.rs` | `SettingsManager.cs` | 설정·일정 저장, WPF 판 설정 가져오기 |
| `src-tauri/src/geometry.rs` | (창 배치 코드) | 화면 비율로 위치 기억, 작업 영역 안으로 당기기, 패널·메뉴 자리 |
| `src/index.html` + `js/clock.js` | `MainWindow` | 테두리 없는 투명 탁상시계 (앱 상태의 주인) |
| `src/zoneclock.html` + `js/zoneclock.js` | (없음) | 추가 시계 — 시간대·테마를 저마다 따로 갖는 시계 창 |
| `src/panel.html` + `js/panel.js` | `SidePanelWindow` | 설정 패널(`?only=settings`) 과 분리한 기능 창(`?only=<탭>&tool=1`) |
| `src/about.html` + `js/about.js` | (없음) | 프로그램 정보 — 아이콘·버전·빌드·제작자 |
| `src/alarm.html` + `js/alarm.js` | `AlarmNotificationWindow` | 알람·타이머 팝업 |
| `src/fullscreen.html` | `ScreensaverWindow` | 전체 화면 시계 |
| `src/menu.html` + `js/menu.js` | `MainWindow` 의 `ContextMenu` | 우클릭 메뉴 |

렌더러는 파일·창에 직접 손대지 못합니다. 모든 일은 `src/js/bridge.js` 가 만든
`window.myclock` 을 거칩니다 — 모양은 Electron 판의 preload API 와 똑같아서 렌더러 코드는
바뀌지 않았습니다. `bridge.js` 는 각 호출을 Rust 의 `#[tauri::command]` 로 보내고(`invoke`),
셸이 보내는 알림은 **그 창으로 온 것만** 듣습니다(`getCurrentWebviewWindow().listen`).
권한(`src-tauri/capabilities/default.json`)은 이벤트 수신만 열어 두고, 창 조작·파일·트레이는
모두 MyClock 자체 명령으로만 합니다. 각 HTML 의 CSP 는 IPC 주소(`ipc:` · `http://ipc.localhost`)만
더 열어 둡니다.

창 이름(label)은 종류별 접두어에 번호를 붙입니다: `clock`(메인 시계), `zone-N`(추가 시계),
`panel-N`, `clockset-N`(추가 시계의 설정 창), `tool-N`, `alarm-N`, `menu-N`, `about-N`,
`full-N`. 같은 창을 닫고 곧바로 다시 열어도 이름이 겹치지 않게 하려고 매번 새 번호를 씁니다.

## 1-1. 창 하나가 한 가지만 맡는다

설정 패널은 **설정만** 맡습니다. 세계 시간·알람·타이머·스톱워치·캘린더는 저마다
독립한 창(`open_tool_window`)으로 열리며, 내용은 같은 `panel.html` 을 `?only=<탭>` 으로
띄운 것입니다. 창 하나가 한 가지만 보여 주므로 탭 줄 대신 제목만 남습니다
(`.tool-window` 클래스).

설정 창은 **시계마다 하나씩**입니다 (`State.clock_settings`, `panel.html?only=settings&tool=1&clock=<id>`).
창이 곧 그 시계의 것이므로 창 안에서 시계를 고르지 않습니다. 메인 시계의 설정은 시계 옆에
붙는 패널이고, 추가 시계의 설정은 그 시계 옆에 뜨며 시계를 닫으면 함께 닫힙니다.
그 밖의 창(세계 시간·알람·타이머·스톱워치·캘린더·정보)은 **언제나 하나뿐**이며,
이미 떠 있으면 그 창을 앞으로 가져옵니다.

설정 창 자체도 갈래 탭(`.sub-tab` / `.sub-page`)으로 나눠 **한 번에 한 갈래만** 보여
줍니다. 스크롤 막대를 두지 않으므로 창이 작으면 아래가 잘린다 — 그래서 패널이 모든 갈래의
**높이**를 재서 가장 큰 것에 맞는 크기를 셸에 알려 주고(`panel_fit` → `State.panel_fit`),
셸은 기본값(`PANEL_WIDTH`/`PANEL_HEIGHT`)과 그 값 중 큰 쪽으로 창을 잡습니다
(`geometry::panel_bounds_for`).

> **폭은 재지 않는다.** 내용은 창 폭을 그대로 채우므로 `scrollWidth` 로 재면 잴수록
> 창이 넓어진다(실제로 한 번 그렇게 늘어났다). 폭은 가장 넓은 것 — 테마 네 칸
> (`THEME_COLUMNS × --theme-tile`) — 에서 계산한다.
테마 칸 너비도 가장 긴 이름을 재서 `--theme-tile` 로 넣으므로(`fitThemeTiles`)
글꼴·배율이 달라도 이름이 잘리지 않습니다.

갈라지는 것과 함께 쓰는 것을 분명히 둡니다.

| | 범위 | 어디에 저장 |
|---|------|-------------|
| 도시(시간대)·테마·디지털/아날로그·스타일·시간 형식·밝기·색·표시 우선순위 | **시계마다 따로** | `settings.extraClocks[]` (메인 시계는 설정 본체의 `zone`/`city`/`theme`…) |
| 알람·타이머·스톱워치·일정·세계 도시 목록·알람음 | **앱 전체가 하나** | 설정 본체 (메인 시계 창이 들고 있다) |
| 항상 위에 표시·자동 실행·초기화 | **앱 전체가 하나** | 트레이 메뉴에서 다룬다 (`build_tray_menu`) — 설정 창은 시계 모양만 맡는다 |

표시 우선순위(`displayPriority`: low·normal·high·highest)는 셸의
`apply_display_priority()` 가 창마다 겁니다. 트레이의 항상 위에 표시는 `normal` 시계와
기능 창에만 걸립니다. 맨 위 창끼리는 단계가 없으므로 `highest` 는 다른 시계가
앞으로 올 때마다 `raise_highest_clocks()` 가 다시 올립니다 (`raise()` — Windows 는
포커스를 빼앗지 않는 `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE)`, 다른 OS 는 항상 위를
껐다 켜서 맨 앞으로).

추가 시계 창은 앱 상태를 갖지 않습니다. 자기 설정 한 벌만 받아 그 지역 시각을 그리고,
설정을 고칠 때는 `clocks.update` 로 셸에 알립니다. 그래서 `zoneclock.js` 에는
알람·타이머 코드가 없습니다 (검사가 이를 확인합니다).

## 2. 상태는 시계 창이 소유한다

WPF 판에서는 `MainWindow` 가 알람·타이머·스톱워치 객체를 들고 있고
`SidePanelWindow` 에 같은 객체 참조를 넘겨 함께 다뤘습니다.
창마다 웹뷰가 따로인 이 판에서는 참조를 공유할 수 없으므로 이렇게 나눴습니다.

```
설정 패널  --(명령)-->  셸(중계)  --> 시계 창
시계 창    --(상태 스냅샷)-->  셸(중계)  --> 설정 패널
```

- **시계 창**이 유일한 상태 소유자입니다. 알람이 울리고, 타이머가 돌고,
  설정이 저장되는 곳은 모두 여기입니다.
- **설정 패널**은 보기 전용입니다. 버튼을 누르면 `{type: 'timer:command', …}`
  같은 메시지를 보내고, 돌아온 스냅샷(`{type:'state', …}`)으로 화면을 다시 그립니다.
- 중계는 `relay_to_clock` / `relay_to_panel` 두 명령(알림 이름 `from-panel` / `from-clock`)이 전부입니다.
  분리한 기능 창들도 같은 `from-clock` 스냅샷을 함께 받습니다 — 알람·타이머는
  앱이 하나로 들고 있으므로 어느 창에서 보든 같은 값이어야 합니다.
- 시계가 여러 개이므로 창 조작(끌기·크기·최소 크기)은 **보낸 쪽 창**(명령의 `window: WebviewWindow`
  인자)에 적용합니다. 컨텍스트 메뉴도 연 창(`State.menu_opener`)으로 결과를 돌려줍니다.
- 메뉴 창은 한 겹이므로 "시계 추가..."는 첫 메뉴를 닫고 **도시 목록 메뉴를 다시 띄웁니다**
  (`openAddClockMenu`, 항목 id `addclock:<번호>`). 트레이는 네이티브 메뉴라 하위 메뉴를
  쓰며, 도시·시계 목록·항상 위 같은 값이 바뀔 때마다 다시 만듭니다(`refresh_tray_menu`).
- 패널이 **어느 탭으로 열릴지**는 셸이 `panel_pending_tab` 에 적어 두고
  패널이 뜬 뒤 `panel_pending_tab` 명령으로 가져갑니다 (한 번 읽으면 지운다). 적어 둔 것이 없으면
  **설정 탭**이 기본입니다 (패널을 여는 길은 대부분 ⚙ 버튼·우클릭 *설정...* 입니다).

### 실행 중인 타이머를 매끄럽게 보여주기

스냅샷을 초당 열 번씩 보내면 창 사이 통신이 낭비됩니다. 대신 스냅샷에 **종료 시각**
(`endAt`)과 스톱워치의 **시작 시각**(`startedAt`)을 함께 담아 보냅니다.
패널은 그 값으로 남은 시간을 직접 계산하므로, 상태가 실제로 바뀔 때만
메시지가 오갑니다.

## 2-1. 셸 → 창 알림은 창이 들을 때까지 기다린다

Electron 은 `ready-to-show` 뒤에 메시지를 보내면 페이지가 이미 듣고 있었습니다. Tauri 에서는
창을 만든 직후 보낸 알림(메뉴 항목 `menu:items`, 알람 내용 `alarm:show`, 패널 방향 `panel:side` …)을
페이지가 아직 듣지 않아 흘릴 수 있습니다. 그래서 셸의 `post(label, event, payload)` 는

- 그 창이 그 알림을 **이미 듣고 있으면** 곧바로 보내고 (`emit_to`),
- 아니면 창·알림별 대기열(`State.queued`, 64개까지)에 쌓아 둡니다.

`bridge.js` 의 `on(event)` 는 리스너를 단 **뒤에** `bridge_listen(event)` 를 불러 "이제 듣는다"고
알리고, 쌓여 있던 것을 한꺼번에 받습니다. 두 쪽이 같은 잠금 아래에서 판단하므로 하나도
두 번 오거나 빠지지 않습니다. 페이지를 다시 읽으면(`PageLoadEvent::Started`) 듣는 목록을 비워
처음부터 다시 듣습니다. 창은 숨긴 채 만들고 페이지를 다 읽은 뒤(`PageLoadEvent::Finished` →
`on_loaded`) 보이므로 흰 화면이 번쩍이지 않습니다.

### 잠금 규칙

셸의 공유 상태(`State`)는 `Mutex` 하나입니다. 두 가지를 지킵니다.

- **잠금을 쥔 채 창을 만들거나 보이거나 옮기지 않는다.** 그런 호출은 같은 잠금을 잡는 창 이벤트를
  곧바로 부를 수 있습니다. 필요한 값만 꺼내고 놓은 뒤에 창을 다룹니다.
- **한 식 안에서 두 번 잡지 않는다.** `if st(app).a || f(app)` 처럼 쓰면 앞의 잠금 임시값이 식이
  끝날 때까지 살아 있어, `f` 가 다시 잡는 순간 같은 스레드에서 멈춥니다 (`if let x = st(app)…` 은
  본문 끝까지 산다). 실제로 이 실수로 시작 직후 앱이 "응답 없음"이 된 적이 있습니다. 개발
  빌드에서는 `st()` 가 같은 스레드의 재진입을 잡아 곧바로 알리고(`HOLDING`), 검사도 이 꼴을 찾습니다.

창을 만드는 명령은 `async` 입니다 — 동기 명령은 메인 스레드에서 돌아, 거기서 창을 만들면
Windows 에서 멈춥니다. 트레이 메뉴·창 이벤트처럼 메인 스레드에서 불리는 곳은 `bg()` 로
다른 스레드에 넘겨 창을 만듭니다. 미뤄 두는 일(몰아서 저장, 400ms 뒤 복구 …)은
`schedule(key, delay, work)` 로 걸고, 셸의 틱 스레드(`start_ticker`)가 때가 되면 실행합니다.
같은 이름으로 다시 걸면 앞의 것은 버려지므로 그대로 "몰아서 하기"가 됩니다.

## 3. 그리기

WPF 의 `Canvas` + `Shape` 트리는 HTML5 Canvas 2D 로 옮겼습니다.
좌표와 비율은 원본 그대로입니다.

| 모듈 | 원본 | 방식 |
|------|------|------|
| `analog-clock.js` | `AnalogClockControl` | 380×380 디자인 좌표계에 그린 뒤 창 크기에 맞춰 균일 배율 |
| `analog-clock.js` (mini) | `MiniAnalogClockControl` | 72×72 — 세계 시간 목록과 트레이 아이콘용 |
| `digital-display.js` | `SevenSegmentDisplay` | 숫자 52×96, 육각형 세그먼트 7개 |
| `digital-display.js` | `DotMatrixDisplay` | 7×7 도트 패턴 |

7세그먼트·도트 매트릭스는 **켜진 부분만** 그립니다. WPF 판은 꺼진 세그먼트를
흐린 색(`SegDimBrush`)으로 칠했지만, 투명 창에서는 그 색이 뒤의 화면과 겹쳐
검거나 엉뚱한 색 덩어리로 보여 시간을 읽기 어려웠습니다. 켜진 부분만 그리면
나머지는 창 배경(투명)이 그대로 비칩니다.

표시 자리는 모드마다 다릅니다. **디지털**은 숫자 바로 위 한 줄(`.digital-header`)에
"도시 · 오전/오후 · 날짜"를 함께 둡니다. 이 줄은 디지털 패널 안에 있으므로 아날로그로
바꾸면 함께 사라집니다. **아날로그**는 오전/오후·도시·날짜를 모두 문자판 안에 그립니다
(`drawAmPmAndDate(g, date, color, label)`) — 문자판 바깥에는 글자를 두지 않습니다.
긴 도시 이름은 `fitLabel` 이 문자판 폭에 맞춰 줄입니다.

텍스트 계열 디지털 스타일(LCD·네온·한글 등)은 캔버스가 아니라 DOM 텍스트입니다.
WPF 의 `Viewbox(Stretch=Uniform)` 에 해당하는 동작은 `fitTextClock()` 이
내용 크기를 재서 `transform: scale()` 을 계산하는 것으로 대신합니다.

캔버스는 모두 `devicePixelRatio` 를 반영하므로 고해상도 화면에서도 선명합니다.

## 4. 테마

WPF 의 `ResourceDictionary` 18개(`SolidColorBrush` 27종)를 CSS 커스텀 속성으로
변환했습니다. 브러시 키 `WindowBackgroundBrush` → CSS 변수 `--window-background`
처럼 기계적으로 대응하며, 변환은 `scripts/convert-themes.js` 가 수행했습니다.

여기에 **팔레트로 만든 테마 12종**(티얼·인디고·코랄·라임·브론즈·노르드·드라큘라·
솔라라이즈·세피아·아이스·스카이·말차)을 더했습니다. 손으로 30개 색을 고르면 테마마다
톤이 어긋나므로, 더한 테마들은 바탕·강조·초침 세 색만 정하고 나머지는 `buildTheme()` 이
섞어서 만듭니다 (`mix`/`shade`/`tint`, 초침은 `hueShift(accent, 150)`,
강조색 위 글자는 `readableOn()` 이 밝기로 고릅니다).

### 어두운 판 / 밝은 판은 늘 같은 수

테마는 **색 한 가지마다 어두운 판과 밝은 판을 짝으로** 가집니다 (`THEME_FAMILIES`,
29색 × 2 = 58종 + 사용자 색). 손으로 고른 쪽은 그대로 두고 없는 쪽만 `twinTheme()` 이
만듭니다 — 강조색·초침색은 그대로 두고 바탕만 `autoBase(accent, light)` 로 뒤집습니다.
설정 패널은 색 목록 하나와 **어두운/밝은 바탕 단추**를 따로 두고, 단추를 누르면
`themeVariant(theme, light)` 로 같은 색의 반대쪽 판으로 갈아탑니다 (사용자 색도 같은
단추를 따릅니다). 그래서 목록 길이는 색 가짓수만큼이고, 두 판의 수는 구조적으로 같습니다.

밝은 바탕에서는 네온 민트 같은 색이 흰 바탕에 묻히므로 `readableInk()` 가 밝기 차이가
모자란 색만 조입니다 (밝은 판은 어둡게, 어두운 판은 밝게). 차이가 넉넉하면 고른 색을
그대로 두므로, 손으로 고른 어두운 테마들은 이 보정에 걸리지 않습니다.

사용자 정의 테마(`CustomTheme`)는 저장된 색(`customThemeColor`)과 바탕 밝기
(`customThemeLight`)로 **그때그때 만들어** 등록표에 끼웁니다. 그래서 색이 바뀌면
`setCustomTheme()` 을 먼저 부르고 `applyTheme()` 을 불러야 합니다 — 창마다
(시계·패널·메뉴·전체화면·알람 팝업) 테마를 적용하기 직전에 한 번씩 부릅니다.
메뉴 창은 자기 설정을 읽지 않으므로 `menu.open` 페이로드에 색을 함께 실어 보냅니다.

테마를 바꾸면 `applyTheme()` 이 `document.documentElement` 의 변수만 교체합니다.
캔버스 렌더러는 `analogColorsFrom()` 으로 그 변수를 읽으므로 자동으로 따라갑니다.

테마를 고르면 디지털 표시 색(`digitColor`, `amPmColor`)도 그 테마의
`DigitalTextBrush` · `AccentBrush` 값으로 함께 맞춰집니다
(`themeDisplayColors()` → `settings:patch` 처리부).
그 뒤 사용자가 색을 직접 고르면 **다음 테마 변경 전까지** 그 색이 유지됩니다.
같은 테마를 다시 누르면 테마 색으로 되돌아갑니다.

> WPF 판은 테마와 무관하게 숫자 색을 고정했지만, 그러면 선셋 테마에 파란 숫자처럼
> 어긋난 조합이 남습니다. 테마를 따라가되 사용자가 덮어쓸 수 있게 바꿨습니다.

설정 탭의 테마 버튼은 `renderThemeGrid()` 가 각 테마의 변수로 **직접 칠합니다**
(배경 `--window-background`, 글자 `--foreground`, 작은 문자판 스와치 안에 `--digital-text`).
고르기 전에 색을 볼 수 있게 하기 위해서이며, 그래서 선택 표시는 배경이 아니라
테두리 두께로 합니다 — 배경은 테마 색을 보여줘야 하니까요.

## 5. 알람음

WPF 판은 PCM WAV 를 만들어 `%AppData%` 에 캐시하고 `MediaPlayer` 로 재생했습니다.
`tones.js` 는 **같은 합성 공식**을 그대로 옮겨 `AudioBuffer` 를 만듭니다.
음원 파일도, 캐시 폴더도 없습니다.

- 음색 9종(`pluckVoice`, `softBellVoice`, `squareVoice` …)과 패턴 32종은
  `WavToneGenerator.cs` 의 상수·계수를 1:1로 옮긴 것입니다.
- `Breeze` 패턴의 `new Random(42)` 자리는 결정적 LCG(`seededRandom`)로 대체했습니다.
  같은 소리가 매번 재현됩니다.
- 알람은 팝업 창에서 반복 재생되고, 팝업을 닫으면 멈춥니다.
  설정 탭의 미리듣기는 패널 창에서 한 번만 재생합니다.

## 6. 시간대

WPF 판은 Windows 시간대 ID(`"Korea Standard Time"`)를 저장했습니다.
이 값은 Linux/macOS 에서 통하지 않으므로 도시 데이터베이스 286개를 모두
IANA 시간대(`"Asia/Seoul"`)로 변환했습니다(`scripts/convert-cities.js`).

현지 시각 계산은 `Intl.DateTimeFormat` 에 `timeZone` 을 넘기는 방식이라
별도 라이브러리가 필요 없고, OS 의 시간대 데이터를 그대로 따릅니다.

`src-tauri/data/win-timezones.json` 의 매핑표는 WPF 판 설정을 가져올 때만 쓰입니다
(`store.rs` 가 `include_str!` 로 실행 파일에 넣는다).

## 7. 창 이동과 크기 조절

투명 창에서는 `-webkit-app-region: drag` 가 우클릭·버튼 조작을 함께 삼켜버려
쓰기 어렵습니다. 그래서 직접 구현했습니다.

1. 렌더러가 `pointerdown` 에서 포인터 캡처를 잡고 `window_drag_start` 를 보냅니다.
2. 셸이 12ms 간격으로 커서 위치를 읽어 창을 따라 옮깁니다 (`start_gesture`, 물리 픽셀로).
3. `pointerup`(또는 캡처 상실·포커스 상실)에서 `window_gesture_end` 로 멈춥니다.

포인터 캡처를 쓰는 이유는 창이 커서를 따라 움직이는 동안에도 `pointerup` 이
반드시 이 창에 전달되도록 하기 위해서입니다. 그래도 놓칠 경우를 대비해
셸에 여러 겹의 안전장치(13절)를, 렌더러에 "버튼을 뗀 채로 들어온 이동" 감지를
각각 두었습니다. 이 장치가 없으면 창이 커서에 붙어 따라다니게 됩니다.

오른쪽 아래 그립을 끌 때도 같은 구조로 크기를 조절합니다.
그립은 `<svg>` 를 `<div>` 로 감싼 형태입니다. 인라인 SVG 는 **획이 그려진 자리에서만**
클릭을 받기 때문에, svg 자체를 잡기 영역으로 쓰면 빗금 사이를 눌렀을 때
이벤트가 뒤의 시계 본체로 새어 창이 끌려갑니다.

### 컨텍스트 메뉴를 왜 별도 창으로 띄우는가

메뉴를 시계 창 안의 DOM 으로 그리면 **창 크기에 잘립니다.** 시계 창은 작게는
140×50 까지 줄어드는데 메뉴는 300px 이 넘습니다. WPF 의 `ContextMenu` 는 자체
HWND 팝업이라 창 밖으로 넘칠 수 있었지만, HTML 요소는 그럴 수 없습니다.

그래서 메뉴는 테두리 없는 투명 창(`menu.html`)으로 띄웁니다.
내용을 그린 뒤 렌더러가 실제 크기를 재서 `menu_ready` 로 알려주면,
셸이 커서 옆(화면 밖으로 나가면 반대쪽)에 놓고 창을 보여줍니다.
테마 CSS 를 그대로 쓰므로 네이티브 메뉴와 달리 앱의 색을 따릅니다.

## 8. 화면 보호기 대신 전체 화면 시계

WPF 판에는 Windows 전용 `.scr` 화면 보호기가 있었습니다(`Screensaver/`).
`.scr` 는 Windows 고유 형식이라 이식할 수 없으므로,
어느 OS 에서나 동작하는 **전체 화면 시계**로 대체했습니다.
설정 탭의 버튼이나 우클릭 메뉴로 열고, Esc(전역 단축키로 걸어 둔다) · 설정의 "원래 크기로
돌아가기" · 트레이의 같은 항목으로 닫습니다.

투명 창을 OS 의 전체 화면 모드로 열면 곧바로 풀리므로, 커서가 있는 화면의 **작업 영역만 한
투명 창**을 맨 위에 띄웁니다. 시계 상자를 재기 전에는 클릭이 바탕으로 지나가게
(`set_ignore_cursor_events(true)`) 두었다가, 렌더러가 잰 상자(`fullscreen_fit`)로 창을 줄이고
나서 클릭을 받습니다. 작업 표시줄은 창 밖이라 트레이를 누를 수 있습니다. 여는 동안 탁상시계들은
숨기고, 닫으면 숨겼던 것만 다시 보입니다. 설정·기능 창은 전체 화면 위로 올려 둡니다.

## 9. 설정 저장

`src-tauri/src/store.rs` 가 설정 폴더(`%AppData%\MyClockMultiOS` 등 — Electron 판의 `userData` 와
같은 곳) 아래에 JSON 두 개를 둡니다. 쓰기는 임시 파일에 쓴 뒤 `rename` 하는 방식이라 중간에
끊겨도 파일이 깨지지 않고, 읽고-합치고-쓰는 동안 다른 저장이 끼어들지 않게 `STORE_LOCK` 으로
한 줄로 세웁니다. 항목 순서도 Electron 판과 같게 씁니다(`serde_json` 의 `preserve_order`).

읽을 때는 항상 `normalize_settings()` 를 거칩니다 (Electron 판 `normalizeSettings()` 와 같은 규칙). 손상된 값이나 예전 형식이
들어와도 기본값으로 메워지므로, 설정 파일 때문에 앱이 뜨지 않는 일은 없습니다.

저장 폴더는 `MyClockMultiOS` 로, WPF 판의 `MyClock` 과 일부러 분리했습니다.
같은 폴더를 쓰면 두 앱이 서로의 설정 파일을 덮어씁니다.
대신 처음 실행할 때 WPF 판 설정을 **읽기만 해서** 한 번 가져옵니다
(`migrate_from_wpf_if_needed`).

> Electron 판은 저장된 `null` 위치를 다시 읽을 때 `Number(null) = 0` 으로 바꿔, 한 번도 옮기지 않은
> 추가 시계가 다음 실행에 화면 왼쪽 위로 가는 일이 있었습니다. 이 판은 `null` 을 그대로 둡니다.

## 10. 아이콘과 Windows 설치 관리자

아이콘은 `asset/icon.svg` 한 장에서 파생됩니다(`npm run icons` → PNG 9종 + `icon.ico` + `icon.icns`).
빌드할 때 `beforeBuildCommand` 가 다시 만들고, `npm start` 는 없을 때만 만듭니다(`--if-missing`).
`.icns` 는 PNG 를 그대로 담는 형식(ic07~ic10)이라 `generate-icons.js` 가 직접 묶습니다.
입체감은 SVG 필터 없이 그라디언트만으로 만듭니다 — 래스터라이저(resvg)가 필터를
전부 지원하지는 않기 때문입니다. 본체의 대각선 그라디언트, 좌측 상단 반사광,
테두리 림 라이트, 문자판 아래 그림자, 유리 반사가 겹쳐 3D 처럼 보입니다.

| 어디 | 어떻게 |
|------|--------|
| 설치 파일 | `bundle.windows.nsis.installerIcon` (asset/icon.ico) |
| 설치된 exe·창·트레이 | `bundle.icon` 목록 — Tauri 가 exe 리소스와 기본 창 아이콘으로 넣는다 |
| 바로가기 | exe 의 0번 아이콘을 가리킨다 |
| 트레이 메뉴 항목 | `menu_icons.rs` 가 16px 그림을 직접 그린다 (고해상도 화면은 두 배) |
| 정보 창 | `include_str!("../../asset/icon.svg")` — 실행 파일 안에 원본 svg 를 넣어 둔다 |

설치 관리자는 Tauri 의 NSIS 템플릿에 `src-tauri/windows/hooks.nsh` 를 더한 것입니다. 사용자별
설치(`installMode: currentUser`)이고, 처음에 한국어/English 를 고릅니다.
훅 파일은 Tauri 페이지보다 **먼저** 읽히므로, 사용자 정의 페이지 두 개는 환영 페이지 앞에 옵니다.

**재설치 방식 선택.** 등록된 설치(Tauri 판 `Uninstall\MyClock`, Electron 판
`Uninstall\7b9e1599-…`)나 설정 파일(`%AppData%\MyClockMultiOS\settings.json`)이 있을 때만 보입니다.

| 선택 | 하는 일 |
|------|---------|
| 기존 설정 유지 (기본) | 프로그램 파일만 바꾼다. Electron 판이 있으면 그 제거 프로그램을 `/S /currentuser --updated` 로 돌려 (데이터는 남긴다) 지운다 |
| 완전히 삭제 | 위에 더해 설정·데이터 폴더, WebView2 캐시(`%LOCALAPPDATA%\com.shkwon.myclock`), 옛 설치 폴더(새 `$INSTDIR` 과 다를 때만), 기존 바로가기, 자동 실행 항목을 지운다 |

**바로가기 선택.** 바탕화면/시작 메뉴 체크박스. 고른 것만 `NSIS_HOOK_POSTINSTALL` 에서 만들고,
Tauri 자체의 시작 메뉴 바로가기는 `$NoShortcutMode` 로 끕니다.

**Electron 판에서 옮겨 오기.** Electron 판이 켜 둔 자동 실행 값(`Run\com.shkwon.myclock`)은 지우고,
켜져 있었으면 Tauri 판 이름(`Run\MyClock`, tauri-plugin-autostart 와 같은 값)으로 새 exe 를 걸어 둡니다.
Electron 판이 설정 폴더 옆에 두던 Chromium 캐시도 지웁니다 (`settings.json`·`calendar_events.json` 은 남긴다).

**제거.** Tauri 제거 프로그램의 "앱 데이터 삭제"를 체크하면 `NSIS_HOOK_POSTUNINSTALL` 이 설정 폴더도
지웁니다 (Tauri 는 `%AppData%\<identifier>` 만 안다). 업데이트 중의 제거(`/UPDATE`)에서는 지우지 않습니다.

> **주의:** 훅의 **함수** 안에서는 Tauri 의 `$UpdateMode`·`$PassiveMode` 를 쓸 수 없습니다 — 이 파일보다
> 뒤에 선언되어 NSIS 컴파일이 실패합니다. 함수는 명령줄을 직접 읽고(`MC_AbortIfUnattended`),
> 매크로(`NSIS_HOOK_*`)는 섹션 안에서 펼쳐지므로 써도 됩니다.

> **주의:** `hooks.nsh` 는 UTF-8 **BOM** 으로 둡니다. BOM 이 없으면 NSIS 가 한글을 ANSI 로 읽어 깨집니다.

사용자 정의 페이지는 앞 페이지의 머리말을 물려받으므로, `MC_SetHeader` 매크로가
머리말 컨트롤(1037/1038)에 직접 문구를 써 넣습니다.

## 11. 이식하면서 달라진 점

| 항목 | WPF 판 | 이 판 | 이유 |
|------|--------|-------|------|
| 화면 보호기 | Windows `.scr` | 전체 화면 시계 | `.scr` 는 Windows 전용 |
| 자동 실행 | 레지스트리 `Run` 키 | 로그인 항목 / `.desktop` | OS 별 표준 방식 |
| 알람음 | WAV 파일 캐시 | 실행 시 합성 | 파일·캐시 폴더 불필요 |
| 시간대 | Windows TZ ID | IANA TZ | 크로스플랫폼 |
| 컨텍스트 메뉴 | WPF `ContextMenu` | HTML 메뉴 | 테마 CSS 를 그대로 적용 |
| 모드 전환 | 우클릭 메뉴만 | 시계 위 토글 버튼 · 설정 탭 · 우클릭 메뉴 | 전환 수단이 눈에 보이도록 |
| 모드 전환 시 창 | 모드별 위치까지 복원 | 크기만 복원, 위치는 유지 | 전환할 때마다 창이 화면을 가로질러 튀지 않도록 |
| 디지털 밝기 | 설정 슬라이더 | 슬라이더 + 시계 위 마우스 휠 | 설정을 열지 않고도 바로 조절 |
| 디지털 표시 색 | 테마와 무관하게 고정 | 테마를 따라가되 덮어쓰기 가능 | 테마와 어긋난 색 조합이 남지 않도록 |
| 패널 닫기 | 우클릭 메뉴의 "설정 닫기" | 패널의 ✕ 버튼 · Esc · 우클릭 메뉴 | 연 곳에서 바로 닫을 수 있도록 |
| 작업 표시줄 | `ShowInTaskbar=False` (트레이 전용) | `skipTaskbar: true` (트레이 전용), 최소화 = 트레이 | WPF 판과 같이 실행 중에는 트레이 아이콘만 보이도록 |
| 꺼진 세그먼트 | 흐린 색으로 표시 | 그리지 않음 (투명) | 투명 창에서 배경과 겹쳐 읽기 어려웠음 |
| 테마 버튼 | 이름만 | 테마 색으로 칠한 버튼 + 숫자 색 스와치 | 고르기 전에 색을 볼 수 있도록 |
| 전체 화면 시계 | 검은 배경 | 투명 배경 | 바탕화면 위에 시계만 띄우기 위해 (시계 창과 같은 규칙) |
| 프로그램 정보 | 없음 | 아이콘·버전·빌드·제작자 창 | 설치본에서 버전을 확인할 수 있도록 |
| 시계 수 | 하나 | 여러 개 (시간대·테마·모양을 저마다 따로) | 여러 도시를 한눈에, 창마다 다른 모양으로 |
| 기능 창 | 설정 패널의 탭 | 세계 시간·알람·타이머·스톱워치·캘린더가 저마다 창 | 설정은 설정만 맡고, 쓰던 기능을 띄워 둘 수 있도록 |
| 테마 수 | 18종 (어두운 17 · 밝은 1) | 29색 × 어두운/밝은 판 + 사용자 색 | 어느 바탕을 좋아하든 같은 색을 쓸 수 있도록 |
| 사용자 색 | 없음 | 색 하나로 테마 한 벌 생성 (두 판 모두) | 원하는 색이 테마에 없을 때 |
| 호버 배경 | 창 전체에 불투명 배경 | 디지털만 옅게(0.38), 아날로그는 깔지 않음 | 둥근 문자판 뒤에 사각형이 보이지 않도록 |
| 재설치 | 항상 덮어쓰기 | 설정 유지 / 완전 삭제 선택 | 처음 상태로 돌릴 수단 제공 |

## 11-1. Electron 에서 Tauri 로

셸만 바꿨으므로 기능·설정 파일·화면은 그대로입니다. 같은 일을 하는 자리만 표로 둡니다.

| Electron 판 | Tauri 판 | 메모 |
|-------------|----------|------|
| 메인 프로세스 (`main.js`) | `src-tauri/src/lib.rs` (+ `geometry.rs`, `menu_icons.rs`) | 함수 이름은 snake_case 로 같은 뜻 (`openToolWindow` → `open_tool_window`) |
| preload (`contextBridge`) | `src/js/bridge.js` (`__TAURI_INTERNALS__.invoke`) | `window.myclock` 의 모양은 같다 |
| `ipcMain.handle/on('x:y')` | `#[tauri::command] fn x_y` | 채널 이름의 `:`·`-` 를 `_` 로 |
| `webContents.send` | `post()` + 대기열 (2-1절) | 창이 듣기 전 알림을 흘리지 않는다 |
| 설정 저장소 (`store.js`) | `src-tauri/src/store.rs` | 같은 규칙, 같은 폴더·파일. 검사는 `cargo test` |
| `requestSingleInstanceLock` | `tauri-plugin-single-instance` | **예외 없이** 언제나 하나 (개발용 `--multi` 도 없앴다) |
| `setLoginItemSettings` / `.desktop` | `tauri-plugin-autostart` | Windows Run 값 이름이 `com.shkwon.myclock` → `MyClock` (설치 프로그램이 옮긴다) |
| `Menu` / `Tray` / `nativeImage` | `tauri::menu` / `TrayIconBuilder` / `Image` | 켜고 끄는 항목은 아이콘 대신 OS 체크 표시 |
| `dialog.showMessageBox` | `tauri-plugin-dialog` | 초기화 확인 |
| `globalShortcut('Escape')` | `tauri-plugin-global-shortcut` | 전체 화면 시계 닫기 |
| `screen` 이벤트 · `powerMonitor` | 2초마다 화면 구성 비교 + 시계 건너뜀(잠자기) 감지 (`start_ticker`) | 모니터 연결·해상도·배율 변화, 절전에서 깨어남 |
| `setAlwaysOnTop(level)` · `moveTop()` | `set_always_on_top` + `raise()` (Windows `SetWindowPos`) | 맨 위 창끼리의 단계(screen-saver 등)는 없다 — 순서로 가른다 |
| `setParentWindow` (패널 ↔ 시계) | 쓰지 않음 | 패널은 시계 옆에 붙어 따라다니기만 한다. 시계를 숨길 때 떼었다 붙이는 코드가 필요 없다 |
| 투명 창 표면 재생성(`refreshLayeredWindow`) | 다시 그리기 알림만(`surface:refresh`) | WebView2 투명 창은 Electron 처럼 하얗게 굳지 않는다 |
| `backgroundThrottling: false` | WebView2 인자 `--disable-background-timer-throttling` 등 | 트레이로 숨긴 동안에도 알람·타이머가 늦지 않게 |
| 렌더러 충돌 시 다시 읽기 | 없음 | WebView2 가 스스로 처리 |
| 정보 창의 Electron/Chromium/Node 버전 | Tauri / WebView 버전 | |
| `MyClock-Setup-x.y.z.exe` | 같은 이름으로 루트에 복사 (`copy-installer-to-root.js`) | Tauri 의 원래 이름은 `MyClock_x.y.z_x64-setup.exe` |

## 12. 검사 (npm test)

`npm test` 는 두 묶음입니다 — `npm run test:js`(node:test) 와 `npm run test:rust`(cargo test).

JS 쪽은 창을 띄우지 않고 **진짜 렌더러 코드**를 돌려 봅니다. `test/helpers/` 가
브라우저 자리를 대신합니다. 렌더러는 `window.myclock` 만 보므로 가짜 API 를 끼우면 됩니다
(`bridge.js` 는 Tauri 가 없으면 아무것도 하지 않는다).

| 하네스 | 하는 일 |
|--------|---------|
| `helpers/fakes.js` | 캔버스·DOM 전역 |
| `helpers/minidom.js` | 아주 작은 DOM — `panel.html` 을 트리로 세우고 선택자·이벤트를 흉내 냄 |
| `helpers/clockwindow.js` | `index.html` 의 스크립트를 한 샌드박스에 넣어 `clock.js` 를 돌림 |
| `helpers/panelwindow.js` | 같은 방식으로 `panel.js` 를 돌림 (설정 패널·기능 창 둘 다) |
| `helpers/zoneclockwindow.js` | 같은 방식으로 추가 시계 `zoneclock.js` 를 돌림 |

- `clock.js` 의 `let` 변수는 샌드박스 전역에 노출되지 않습니다. 상태는
  `request:state` 스냅샷으로 들여다보고, 시각은 컨텍스트의 `Date` 를 갈아 끼워
  움직입니다 (`tickAt`).
- 샌드박스에서 돌아온 배열은 realm 이 달라 `deepStrictEqual` 이 실패합니다.
  비교할 때는 `[...arr]` 로 옮겨 담으세요.
- 창을 쓰지 않는 검사(`wiring.test.js`)는 소스끼리 맞춰 봅니다 — 코드가 찾는
  요소 id 가 문서에 있는지, `bridge.js` 가 부르는 명령마다 `#[tauri::command]` 와
  `generate_handler!` 등록이 있는지, 듣는 알림을 셸이 보내는지, 창 이름마다 권한이 있는지,
  잠금을 한 식 안에서 두 번 잡지 않는지.
- Rust 쪽(`cargo test`)은 `store.rs`(Electron 판 `store.test.js` 를 그대로 옮긴 검사),
  `geometry.rs`(해상도가 바뀌어도 오른쪽 끝에 남기, 사라진 화면, 메뉴 뒤집기),
  `menu_icons.rs`, 우선순위·최소 크기 규칙을 봅니다.
- 보고서 형식은 `scripts/test-reporter.js` 입니다. 기호는 ASCII 만 씁니다
  (한글 콘솔에서 유니코드 체크 표시가 "?" 로 깨집니다).

빌드 산출물은 `npm run clean` 으로 지웁니다 (`scripts/clean.js` — `src-tauri/target`·`src-tauri/gen`,
옛 `dist/`, 생성된 아이콘, 루트의 설치 파일. `--all` 은 `node_modules` 까지, `-n` 은 목록만).

실제 창을 확인할 때는 `MYCLOCK_CONFIG_DIR=<임시 폴더>` 로 쓰는 사람의 설정을 피하고,
`MYCLOCK_DEBUG_PORT=<포트>` 로 WebView2 의 DevTools 프로토콜을 열어 각 창(`http://tauri.localhost/…`)을
조작합니다. 투명 창의 실제 모습은 CDP 스크린샷(투명이 흰색으로 나온다)이 아니라 화면 캡처로 봅니다.

## 13. 창을 끄는 제스처 — 놓쳐도 끝나야 한다

테두리 없는 투명 창이라 끌기는 직접 구현한다: 렌더러가 `pointerdown` 에서
`window_drag_start` 를 보내면 셸이 12ms 마다 커서를 따라 창을 옮긴다.
문제는 **떼는 것을 놓쳤을 때**다. 포인터 캡처가 풀리거나 창이 포커스를 잃으면
`pointerup` 이 오지 않고, 창이 커서에 붙은 채 남아 "손대지 않았는데 창이 저 혼자
움직인다"로 보인다 (설정 패널은 시계를 따라다니므로 함께 움직인다).

끊는 길을 여러 겹으로 둔다.

| 어디 | 무엇으로 |
|------|----------|
| 렌더러 | `pointerup`/`pointercancel`/`lostpointercapture`, 버튼 없이 들어온 `pointermove`(`buttons === 0`), `mouseup`, `blur`, `visibilitychange` |
| 셸 | 마우스 주 단추가 떼어졌으면 종료 (Windows `GetAsyncKeyState`, 왼손잡이 설정도 본다), 커서가 `GESTURE_IDLE` 동안 멈춰 있으면 종료, `GESTURE_MAX` 가 지나면 무조건 종료, 끌던 창이 포커스를 잃으면 종료 |

## 14. 설정 창을 다시 그릴 때

설정은 시계 창이 상태를 보낼 때마다 다시 그린다. 그때 값을 그대로 다시 넣으면
**끌고 있던 슬라이더가 제자리로 튕겨** 손에서 빠진다. 그래서 `isBeingUsed()`
(= `document.activeElement`)가 가리키는 칸은 건너뛰고(`setValue`), 칸을 쓰는 동안에는
창 크기 맞추기(`fitSettingsWindow`)도 미룬다.

## 15. 코드를 고칠 때 알아둘 점

- **`hidden` 속성으로 숨깁니다.** `display: flex` 같은 규칙이 `hidden` 을
  덮어쓰지 않도록 각 스타일시트 맨 위에 `[hidden] { display: none !important }`
  가 있습니다. 이 규칙을 지우면 숨긴 시계가 배경에 비칩니다.
- **창 기하는 `remember_clock_placement()` 를 거칩니다.** 최소화·숨김 중에는 창 크기가
  0에 가깝게 보고될 수 있는데, 그 값을 저장하면 다음 실행에서 창이 사라집니다.
  셸이 직접 옮긴 움직임(`set_bounds`)은 300ms 동안 사용자의 배치로 적지 않습니다(`quiet_until`).
- **창 좌표는 논리 픽셀(DIP)입니다.** `bounds()`/`set_bounds()` 가 화면마다 배율을 보고
  물리 픽셀과 바꿉니다. Electron 판과 같은 단위라 저장된 위치를 그대로 이어 씁니다.
- **노트북 덮개·절전 뒤에는 창을 화면 안으로 되돌립니다.** Windows 가 창을
  최소화하거나 사라진 모니터 좌표에 남겨 두면 트레이만 남고 시계가 안 보입니다.
  `hidden_by_user` 가 아닌 숨김은 `start_ticker()` 의 화면 변화 감지가 복구하므로,
  최소화 = 트레이 숨김 경로를 덮개 닫힘과 섞지 마세요.
- **트레이 복원·해상도 변경은 상대 좌표를 씁니다.** 절대 픽셀이 아니라
  작업 영역에서 창이 움직일 수 있는 여유 공간의 비율(`windowRelX`/`windowRelY`)로
  둡니다. 오른쪽 끝에 둔 시계는 해상도가 바뀌어도 오른쪽 끝에 남습니다.
  복원 중에는 숨겨진 창의 `getBounds()` 를 쓰지 마세요.
- **`src/js/data/` 의 변환본은 생성된 파일입니다.** 원본(WPF xaml)을 고쳤다면
  `scripts/convert-*.js` 를 다시 돌리세요. 단 `themes.js` 는 변환본 **뒤쪽**에
  손으로 쓴 부분(색 섞기 helper, 팔레트 테마, `CustomTheme`)이 붙어 있으니,
  다시 돌릴 때는 그 부분을 떼어 두고 붙여야 합니다.
- **아날로그에서는 호버 배경을 깔지 않습니다.** `setChromeVisible()` 과
  `applyClockMode()` 두 곳이 `settings.isDigital` 을 함께 봅니다. 한쪽만 고치면
  모드를 바꾸는 동안 사각형이 남습니다. 배경이 없는 대신 `.analog-mode` 가
  글자에 그림자를 넣어 바탕화면 위에서도 읽히게 합니다.
- **꺼진 세그먼트는 그리지 않는 것이 의도입니다.** `digital-display.js` 에 다시
  흐린 색을 넣으면 투명 창에서 색 덩어리가 되살아납니다.
- **`src-tauri/windows/hooks.nsh` 는 문자열 이스케이프에 민감합니다.** 줄바꿈은 `$\r$\n`,
  경로 구분자는 `\` 하나입니다. 셸 heredoc 을 거쳐 쓰면 역슬래시가 줄어들기 쉬우니
  파일을 직접 편집하세요.
- **메뉴 항목을 늘리면 창 크기는 자동으로 맞춰집니다.** `menu.js` 가 내용을 잰 뒤
  셸에 알리므로, 크기를 코드에 적어 둘 필요가 없습니다. 알람 팝업도 같은 방식으로
  내용이 길면 창을 늘립니다(`alarm.js` 의 `fitToContent`).
- **셸 쪽 상태 잠금을 고칠 때는 2-1절의 잠금 규칙을 지키세요.**
- **패널에서 설정을 바꿀 때는 `patchSettings()` 하나만 씁니다.** 이 함수가
  지역 상태 갱신과 시계 창 통보를 함께 처리합니다.
