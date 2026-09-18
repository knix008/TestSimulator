# MyClock 설계 문서

WPF/.NET 8 판을 Electron 으로 옮기면서 무엇이 어디로 갔고, 왜 그렇게 했는지 적은 문서입니다.
코드를 처음 읽는 사람을 위한 안내서입니다.

## 1. 프로세스와 창

Electron 은 메인 프로세스 하나와 창마다 하나씩의 렌더러 프로세스로 나뉩니다.
WPF 판의 창들과는 다음과 같이 1:1로 대응합니다.

| Electron | WPF 원본 | 역할 |
|----------|----------|------|
| `electron/main.js` | `App.xaml.cs` | 창 생성, 트레이, 자동 실행, 창 이동/크기 조절 |
| `src/index.html` + `js/clock.js` | `MainWindow` | 테두리 없는 투명 탁상시계 |
| `src/panel.html` + `js/panel.js` | `SidePanelWindow` | 시계 좌/우에 붙는 400px 설정 패널 |
| `src/alarm.html` + `js/alarm.js` | `AlarmNotificationWindow` | 알람·타이머 팝업 |
| `src/fullscreen.html` | `ScreensaverWindow` | 전체 화면 시계 |
| `src/menu.html` + `js/menu.js` | `MainWindow` 의 `ContextMenu` | 우클릭 메뉴 |

렌더러에는 Node 접근 권한이 없습니다(`contextIsolation: true`, `nodeIntegration: false`).
파일 접근·창 제어는 모두 `electron/preload.js` 가 `window.myclock` 으로 노출한
함수만 거칩니다.

## 2. 상태는 시계 창이 소유한다

WPF 판에서는 `MainWindow` 가 알람·타이머·스톱워치 객체를 들고 있고
`SidePanelWindow` 에 같은 객체 참조를 넘겨 함께 다뤘습니다.
프로세스가 나뉜 Electron 에서는 참조를 공유할 수 없으므로 이렇게 나눴습니다.

```
설정 패널  --(명령)-->  메인 프로세스(중계)  --> 시계 창
시계 창    --(상태 스냅샷)-->  메인 프로세스(중계)  --> 설정 패널
```

- **시계 창**이 유일한 상태 소유자입니다. 알람이 울리고, 타이머가 돌고,
  설정이 저장되는 곳은 모두 여기입니다.
- **설정 패널**은 보기 전용입니다. 버튼을 누르면 `{type: 'timer:command', …}`
  같은 메시지를 보내고, 돌아온 스냅샷(`{type:'state', …}`)으로 화면을 다시 그립니다.
- 중계는 `relay:to-clock` / `relay:to-panel` 두 개의 IPC 채널이 전부입니다.

### 실행 중인 타이머를 매끄럽게 보여주기

스냅샷을 초당 열 번씩 보내면 IPC 가 낭비됩니다. 대신 스냅샷에 **종료 시각**
(`endAt`)과 스톱워치의 **시작 시각**(`startedAt`)을 함께 담아 보냅니다.
패널은 그 값으로 남은 시간을 직접 계산하므로, 상태가 실제로 바뀔 때만
메시지가 오갑니다.

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

텍스트 계열 디지털 스타일(LCD·네온·한글 등)은 캔버스가 아니라 DOM 텍스트입니다.
WPF 의 `Viewbox(Stretch=Uniform)` 에 해당하는 동작은 `fitTextClock()` 이
내용 크기를 재서 `transform: scale()` 을 계산하는 것으로 대신합니다.

캔버스는 모두 `devicePixelRatio` 를 반영하므로 고해상도 화면에서도 선명합니다.

## 4. 테마

WPF 의 `ResourceDictionary` 18개(`SolidColorBrush` 27종)를 CSS 커스텀 속성으로
변환했습니다. 브러시 키 `WindowBackgroundBrush` → CSS 변수 `--window-background`
처럼 기계적으로 대응하며, 변환은 `scripts/convert-themes.js` 가 수행했습니다.

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

`electron/win-timezones.js` 의 매핑표는 WPF 판 설정을 가져올 때만 쓰입니다.

## 7. 창 이동과 크기 조절

투명 창에서는 `-webkit-app-region: drag` 가 우클릭·버튼 조작을 함께 삼켜버려
쓰기 어렵습니다. 그래서 직접 구현했습니다.

1. 렌더러가 `pointerdown` 에서 포인터 캡처를 잡고 `window:drag-start` 를 보냅니다.
2. 메인 프로세스가 12ms 간격으로 커서 위치를 읽어 창을 따라 옮깁니다.
3. `pointerup`(또는 캡처 상실·포커스 상실)에서 `window:gesture-end` 로 멈춥니다.

포인터 캡처를 쓰는 이유는 창이 커서를 따라 움직이는 동안에도 `pointerup` 이
반드시 이 창에 전달되도록 하기 위해서입니다. 그래도 놓칠 경우를 대비해
메인 프로세스에 30초 안전장치를, 렌더러에 "버튼을 뗀 채로 들어온 이동" 감지를
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
내용을 그린 뒤 렌더러가 실제 크기를 재서 `menu:ready` 로 알려주면,
메인 프로세스가 커서 옆(화면 밖으로 나가면 반대쪽)에 놓고 창을 보여줍니다.
테마 CSS 를 그대로 쓰므로 네이티브 메뉴와 달리 앱의 색을 따릅니다.

## 8. 화면 보호기 대신 전체 화면 시계

WPF 판에는 Windows 전용 `.scr` 화면 보호기가 있었습니다(`Screensaver/`).
`.scr` 는 Windows 고유 형식이라 이식할 수 없으므로,
어느 OS 에서나 동작하는 **전체 화면 시계**로 대체했습니다.
설정 탭의 버튼이나 우클릭 메뉴로 열고, 아무 키나 누르거나 클릭하면 닫힙니다.

## 9. 설정 저장

`electron/store.js` 가 `app.getPath('userData')` 아래에 JSON 두 개를 둡니다.
쓰기는 임시 파일에 쓴 뒤 `rename` 하는 방식이라 중간에 끊겨도 파일이 깨지지 않습니다.

읽을 때는 항상 `normalizeSettings()` 를 거칩니다. 손상된 값이나 예전 형식이
들어와도 기본값으로 메워지므로, 설정 파일 때문에 앱이 뜨지 않는 일은 없습니다.

저장 폴더는 `MyClockMultiOS` 로, WPF 판의 `MyClock` 과 일부러 분리했습니다.
같은 폴더를 쓰면 두 앱이 서로의 설정 파일을 덮어씁니다.
대신 처음 실행할 때 WPF 판 설정을 **읽기만 해서** 한 번 가져옵니다
(`migrateFromWpfIfNeeded`).

## 10. 아이콘과 Windows 설치 관리자

아이콘은 `asset/icon.svg` 한 장에서 파생됩니다(`npm run icons` → PNG 9종 + `icon.ico`).
입체감은 SVG 필터 없이 그라디언트만으로 만듭니다 — 래스터라이저(resvg)가 필터를
전부 지원하지는 않기 때문입니다. 본체의 대각선 그라디언트, 좌측 상단 반사광,
테두리 림 라이트, 문자판 아래 그림자, 유리 반사가 겹쳐 3D 처럼 보입니다.

같은 아이콘이 네 곳에 쓰입니다.

| 어디 | 어떻게 |
|------|--------|
| 설치 파일 | `nsis.installerIcon` (asset/icon.ico) |
| 설치된 exe | electron-builder 가 rcedit 로 exe 에 박는다 |
| 바로가기 | exe 의 0번 아이콘을 가리킨다 |
| Alt+Tab 목록 | 창 아이콘 (`BrowserWindow`의 `icon`) + exe 아이콘 (작업 표시줄에는 표시하지 않음) |

> **주의:** `win.signAndEditExecutable: false` 를 켜면 rcedit 가 실행되지 않아
> exe 가 Electron 기본 아이콘(원자 모양) 그대로 남습니다. 그러면 바로가기와
> 작업 표시줄까지 전부 기본 아이콘이 됩니다. 서명만 건너뛰려면 이 옵션 대신
> `signtoolOptions.sign` 에 빈 훅(`scripts/skip-win-sign.js`)을 물리세요.

> **주의:** `BrowserWindow` 의 `icon` 옵션은 asar **안**의 경로를 읽지 못합니다.
> `fs.existsSync` 는 true 를 돌려주므로 조용히 기본 아이콘이 남습니다.
> `appIconPath()` 가 패키징본에서 `extraResources` 로 풀린 실제 파일을
> 먼저 찾는 이유입니다.

설치 관리자는 `build/installer.nsh` 로 확장했습니다. 두 개의 사용자 정의 페이지가 있습니다.

**바로가기 선택.** electron-builder 의 `createDesktopShortcut` /
`createStartMenuShortcut` 은 켜고 끄는 값일 뿐 사용자가 고를 수는 없어서,
두 옵션을 끄고 nsDialogs 체크박스 페이지를 직접 만든 뒤 `customInstall` 에서
고른 것만 만듭니다.

**재설치 방식 선택.** `customInit` 에서 등록된 설치 위치(`InstallLocation`)나
설정 파일(`%AppData%\MyClockMultiOS\settings.json`)이 있는지 보고, 있을 때만 이
페이지를 보여줍니다(없으면 페이지 생성 함수에서 `Abort` 로 건너뜁니다).
두 선택지의 의미는 이렇습니다.

| 선택 | 하는 일 |
|------|---------|
| 기존 설정 유지 (기본) | electron-builder 기본 동작 — 옛 제거 프로그램을 `/KEEP_APP_DATA --updated` 로 돌려 프로그램 파일만 바꾼다 |
| 완전히 삭제 | 위에 더해 `customInstall` 에서 설정·데이터 폴더, 옛 설치 폴더(새 `$INSTDIR` 과 다를 때만), 기존 바로가기를 지운다 |

> **주의:** `customInstall` 은 새 파일을 복사한 **뒤에** 실행됩니다. 그래서 완전 삭제에서도
> `$INSTDIR` 자체는 절대 지우지 않습니다 — 지우면 방금 설치한 파일이 사라집니다.

> **주의:** 이전 설치가 있으면 electron-builder 가 설치 옵션·설치 위치 페이지를
> 건너뜁니다(등록된 값을 그대로 씀). 그래서 재설치 때 페이지 순서는
> 사용권 → 재설치 방식 → 바로가기 → 설치 로 짧아집니다.

사용자 정의 페이지는 앞 페이지의 머리말을 물려받으므로, `MC_SetHeader` 매크로가
머리말 컨트롤(1037/1038)에 직접 문구를 써 넣습니다.

제거할 때는 electron-builder 의 `deleteAppDataOnUninstall` 이 productName 폴더만
알기 때문에, `customUnInstall` 에서 같은 조건(`$isDeleteAppData`)으로
`MyClockMultiOS` 폴더를 함께 지웁니다. 업데이트 중 실행되는 제거에서는 이 값이 0 이라
설정이 남습니다.

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
| 재설치 | 항상 덮어쓰기 | 설정 유지 / 완전 삭제 선택 | 처음 상태로 돌릴 수단 제공 |

## 12. 코드를 고칠 때 알아둘 점

- **`hidden` 속성으로 숨깁니다.** `display: flex` 같은 규칙이 `hidden` 을
  덮어쓰지 않도록 각 스타일시트 맨 위에 `[hidden] { display: none !important }`
  가 있습니다. 이 규칙을 지우면 숨긴 시계가 배경에 비칩니다.
- **창 기하는 `rememberGeometry()` 를 거칩니다.** 최소화 중에는 창 크기가
  0에 가깝게 보고될 수 있는데, 그 값을 저장하면 다음 실행에서 창이 사라집니다.
- **노트북 덮개·절전 뒤에는 창을 화면 안으로 되돌립니다.** Windows 가 창을
  최소화하거나 사라진 모니터 좌표에 남겨 두면 트레이만 남고 시계가 안 보입니다.
  `hiddenByUser` 가 아닌 숨김은 `registerDisplayRecovery()` 가 복구하므로,
  최소화 = 트레이 숨김 경로를 덮개 닫힘과 섞지 마세요.
- **트레이 복원·해상도 변경은 상대 좌표를 씁니다.** 절대 픽셀이 아니라
  작업 영역에서 창이 움직일 수 있는 여유 공간의 비율(`windowRelX`/`windowRelY`)로
  둡니다. 오른쪽 끝에 둔 시계는 해상도가 바뀌어도 오른쪽 끝에 남습니다.
  복원 중에는 숨겨진 창의 `getBounds()` 를 쓰지 마세요.
- **`src/js/data/` 는 생성된 파일입니다.** 원본을 고쳤다면 손으로 고치지 말고
  `scripts/convert-*.js` 를 다시 돌리세요.
- **꺼진 세그먼트는 그리지 않는 것이 의도입니다.** `digital-display.js` 에 다시
  흐린 색을 넣으면 투명 창에서 색 덩어리가 되살아납니다.
- **`build/installer.nsh` 는 문자열 이스케이프에 민감합니다.** 줄바꿈은 `$\r$\n`,
  경로 구분자는 `\` 하나입니다. 셸 heredoc 을 거쳐 쓰면 역슬래시가 줄어들기 쉬우니
  파일을 직접 편집하세요.
- **메뉴 항목을 늘리면 창 크기는 자동으로 맞춰집니다.** `menu.js` 가 내용을 잰 뒤
  메인 프로세스에 알리므로, 크기를 코드에 적어 둘 필요가 없습니다.
- **패널에서 설정을 바꿀 때는 `patchSettings()` 하나만 씁니다.** 이 함수가
  지역 상태 갱신과 시계 창 통보를 함께 처리합니다.
