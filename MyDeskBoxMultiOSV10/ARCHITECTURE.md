# MyDeskBox 구조

Electron 33 앱입니다. 박스 하나는 창 둘입니다 — 바탕화면 **아이콘 층 뒤**에 들어가 판을 그리는 창과, 앞에서 제목 줄만 그리는 창. **아이콘은 진짜 바탕화면 아이콘이고 탐색기가 그 위에 그립니다.** 순수 계산은 `src/shared`, 창과 저장과 트레이는 `src/main`, 화면은 `src/renderer`에 있습니다.

## 프로세스

```
npm start
  tools/start.js          ELECTRON_RUN_AS_NODE 를 지우고 Electron 을 띄운다
    src/main/main.js      단일 인스턴스, 첫 실행 분류, 트레이, 바탕화면 감시
      src/main/fences.js  박스 창의 생성, 이동, 드롭, 숨김
      src/main/desktop/   운영체제별 바탕화면 아이콘
      src/renderer/       박스, 그리기, 설정, 확인 창
```

`main.js`는 설정 폴더가 같은 두 번째 프로세스를 `requestSingleInstanceLock`으로 거절합니다. Windows에서는 설정 폴더가 달라도 바탕화면 아이콘을 동시에 다루지 않도록 `Local\MyDeskBox.DesktopOwner` 뮤텍스를 한 번 더 겁니다.

리눅스에서는 투명 창 스위치를 켜고, Windows에서는 창이 가려져도 그리기를 멈추지 않게 합니다. macOS에서는 Dock 아이콘을 숨깁니다. 창이 모두 닫혀도 프로세스는 트레이에 남습니다.

## 디렉터리

| 경로 | 역할 |
| --- | --- |
| `src/main/main.js` | 시작, 첫 실행 분류, 종료 시 아이콘 복구 |
| `src/main/fences.js` | 박스 창 생명주기, 드롭, 박스 사이 이동 |
| `src/main/store.js` | `layout.json` 읽기·쓰기, 박스 값 정규화 |
| `src/main/tray.js` | 트레이 메뉴 |
| `src/main/themes.js` | 테마 20개, 모서리, 직접 고른 색 |
| `src/main/ask.js`, `ipc.js` | 확인 창과 렌더러 IPC |
| `src/main/desktop/index.js` | `win32` / `darwin` / 그 외를 고른다 |
| `src/main/desktop/files.js` | 바탕화면 폴더, 이름 비교, 셸 경로 |
| `src/main/desktop/windows.js` | 탐색기 리스트뷰 FFI (koffi). 아이콘 자리, 판을 뒤로 넣기 |
| `src/main/desktop/empty-bin.js` | 휴지통 비우기. 시스템 창이 뜬 동안 앱이 멈추지 않게 따로 띄운다 |
| `src/shared/arrange.js` | 박스 창과 그림자의 크기, 제목 줄 높이 |
| `src/shared/deskgrid.js` | 바탕화면 칸과, 박스에 가린 아이콘을 밀어내는 계산 |
| `src/shared/deskpick.js` | 커서가 바탕화면 아이콘 위인지 |
| `src/shared/catalog.js` | 첫 실행 분류 |
| `src/shared/taps.js` | 두 번 누르기. 끌기 때문에 브라우저 `dblclick`을 쓰지 않는다 |
| `src/shared/i18n.js` | 한국어·영어 문장 |
| `src/renderer/fence.*` | 테두리 창. 제목 줄과 가장자리 |
| `src/renderer/draw.*` | 새 박스를 그리는 전체 화면 |
| `src/renderer/panel.*` | 아이콘 층 뒤에 들어가는 판 창 |
| `src/preload/preload.js` | 렌더러에 여는 API |
| `assets/` | 앱, 트레이, 메뉴, 테마, 국기 그림 |
| `tools/start.js` | `npm start` |
| `tools/reporter.js` | `npm test` 출력. 검사마다 시간을 붙인다 |
| `tools/make-icons.js` | `assets/`를 코드로 다시 그린다 |
| `tools/icon-check.js` | 바탕화면 아이콘에 그림이 남아 있는지 센다 |
| `tools/shoot-desktop.js` | 가려져 있어도 바탕화면 층만 찍는다 |
| `build/installer.nsh` | Windows 설치 스크립트 |
| `test/` | `node --test` |

`arrange.js`, `deskgrid.js`, `i18n.js`는 렌더러 `<script>`와 메인의 `require`가 함께 읽습니다. 전역 이름은 `DeskArrange`처럼 한 객체로만 내보냅니다.

## 데이터

사용자 데이터 폴더에 두 파일을 둡니다.

- `layout.json` — 박스 목록(담은 항목의 이름과 경로), 언어, 새 박스 기본값, `didWelcome`. 저장은 임시 파일에 쓴 뒤 이름을 바꿉니다.
- `icon-homes.json` — 아이콘을 옮기기 전 좌표(`homes`)와 무엇을 옮겼는지(`nudged`), 자동 정렬을 껐는지, 셸 아이콘을 숨기기 전의 레지스트리 값.

박스 좌표는 DIP입니다. Windows 리스트뷰 좌표는 물리 픽셀이라 `screen.dipToScreenPoint` / `screenToDipPoint`로 바꿉니다.

## 첫 실행 분류

`didWelcome`이 거짓일 때만 `catalog.planFences`를 부릅니다. 순서는 폴더, 바로가기, 문서, 사진·영상, 시스템, 그 밖의 것입니다. 빈 종류는 박스를 만들지 않습니다. 박스는 작업 영역 오른쪽부터 아래로 쌓고, 높이를 넘으면 왼쪽 열로 갑니다. 만든 것이 없으면 그리기 모드로 시작합니다.

## 박스에 담는다는 것

**파일은 건드리지 않습니다.** 옮기지도, 감추지도 않습니다. 바탕화면 폴더의 내용은 앱을 켜기 전과 똑같고, 탐색기에서도 모두 그대로 보입니다. 담는다는 것은 **그 아이콘을 박스 자리로 모은다**는 뜻입니다. Stardock Fences 와 같은 방식입니다.

그래서 박스 하나는 창 **둘**로 이루어집니다.

| 창 | 무엇을 그리나 | 어디에 있나 | 마우스 |
| --- | --- | --- | --- |
| 판 (`renderer/panel.*`) | 반투명한 판과 제목 줄 색 | 바탕화면 **아이콘 층 뒤** | 받지 않는다 |
| 테두리 (`renderer/fence.*`) | 제목 줄 글씨, 톱니, 가장자리 | 앞 | 제목 줄과 가장자리만 |
| 아이콘 | — | 탐색기가 판 위에 그린다 | 탐색기가 다 맡는다 |

아이콘을 탐색기가 맡으므로 **고르기·두 번 눌러 열기·끌어 옮기기·정렬이 모두 운영체제 기본 동작**입니다. 우리가 흉내 낼 것이 없습니다.

### 판을 아이콘 뒤로 넣는 법

`Progman` 의 자식은 z 순서대로 `SHELLDLL_DefView`(아이콘 층), 그 다음 `WorkerW`(그림 층)입니다. 그림 층에 `SetParent` 하면 아이콘보다 뒤에 그려집니다(`behindIcons`).

`SetParent` 만으로는 되지 않습니다. **`WS_POPUP` 을 떼고 `WS_CHILD` 를 붙여야** 붙습니다. 그러지 않으면 조용히 실패하고 창이 그대로 앞에 남습니다. 붙인 뒤에는 좌표가 부모 기준이 되므로 자리는 `placeBehind` 로만 옮깁니다.

### 테두리 창은 가운데를 흘려보낸다

테두리 창은 박스 넓이만큼 크지만 그리는 것은 제목 줄과 가장자리뿐입니다. 가운데의 마우스는 그 아래 바탕화면 아이콘이 받아야 하므로 `passClicks` 가 40밀리초마다 커서를 보고 `setIgnoreMouseEvents(ignore, { forward: true })` 를 켜고 끕니다. 이것이 없으면 박스 안의 아이콘을 고를 수도, 빈 곳에서 바탕화면 메뉴를 부를 수도 없습니다.

### 아이콘을 박스 안에 놓기

`layoutGroups` 가 담긴 이름을 찾아 박스 안 격자로 가로부터 채우고, 담기지 않은 아이콘이 박스 자리에 남아 있으면 밖으로 밀어냅니다. 자리는 **탐색기가 쓰는 격자에 맞춥니다**. 격자 크기는 지금 놓인 아이콘들에서 읽어 오므로(`deskgrid.metrics`) 화면 배율이나 아이콘 크기 설정이 달라도 따라갑니다. 임의의 간격으로 놓으면 아이콘이 박스 밖으로 반쯤 삐져나옵니다.

격자를 벗어난 자리는 아예 쓸 수 없습니다. '격자에 맞춤'이 켜져 있으면 탐색기가 **우리가 보낸 자리도 제 격자로 끌어당깁니다**(계측). 그래서 박스 안쪽으로 들어오는 첫 칸을 올림으로 고릅니다. 반올림하면 아이콘이 제목 줄 위로 올라갑니다. 박스가 격자의 어디에 놓였느냐에 따라 위와 왼쪽에 한 칸까지 빈자리가 남습니다. Fences 도 같은 제약을 받습니다.

박스를 끄는 동안에도 아이콘이 따라옵니다(`nudgeSoon`, 40밀리초 간격). 그 길은 무거우면 안 되므로 세 가지를 다르게 합니다(`live`).

- 목록을 다시 읽지 않고 방금 읽은 것을 씁니다. 우리가 옮긴 자리는 `applyMoves` 가 그 사본에 반영합니다.
- `UpdateWindow` 로 탐색기가 다 그릴 때까지 기다리지 않습니다. 알리기만 합니다.
- 자리는 `PostMessage(LVM_SETITEMPOSITION)` 으로 던져 두고 갑니다. `SendMessage` 는 탐색기가 그 메시지를 처리할 때까지 우리를 멈춰 세웁니다.

계측: 한 번에 **25.3밀리초 → 0.8밀리초**. (`UpdateWindow` 8.4, 목록 읽기 2.4, 자리 쓰기 8×1.5, 파일 쓰기 1) 손을 떼면 `refreshIcons` 가 기다리는 길로 한 번 더 돌아 어긋난 것을 바로잡습니다.

**자동 정렬은 꺼야 합니다.** 켜져 있으면 탐색기가 자리를 곧바로 되돌려, 3초마다 같은 아이콘을 다시 옮기는 끝없는 다툼이 됩니다. 끈 것은 `icon-homes.json` 에 적어 두었다가 끝낼 때 `restoreArrange` 가 되돌립니다. 격자에 맞춤은 건드리지 않습니다 — 그 비트를 보내는 것만으로 comctl32 가 모든 아이콘을 격자로 끌어모읍니다.

## 끝내면 바탕화면이 돌아온다

파일을 옮긴 적이 없으므로, 담으면서 바꿔 둔 **아이콘 자리만** 되돌리면 됩니다.

- `layoutGroups` 와 `nudge` 는 아이콘을 옮기기 전 자리를 `icon-homes.json` 의 `homes` 에, 무엇을 옮겼는지를 `nudged` 에 적습니다.
- `homeAll` 이 그 기록으로 제자리에 돌려놓습니다. 화면 밖에 치워 둔 것(예전 판이 남긴 것)도 함께 들입니다.
- `before-quit` 이 `putBack` → `release` → `shutdown` 을 거칩니다. 트레이로 끝내지 않는 길(Ctrl+C, 작업 관리자, 로그아웃)도 `main.js` 가 `process.on('exit')` 과 신호로 같은 길을 지나게 합니다.
- 트레이의 **바탕화면으로 모두 돌려주기** 로 언제든 되돌릴 수 있습니다.

박스는 화면 밖으로 나가지 않습니다. `clampToScreen` 이 가장 가까운 화면의 작업 영역 안으로 들입니다.

## 바탕화면에 보내면 안 되는 것

계측으로 확인한 것들입니다. 셋 다 한 번만 보내도 바탕화면이 망가집니다.

- **`LVM_SETWORKAREAS`** — 보내는 순간 바탕화면 아이콘의 **그림이 모두 사라지고 이름만 남습니다.** 탐색기를 다시 띄우기 전에는 돌아오지 않습니다. 앱을 켤 때마다 `normalizeList` 가 이것을 보내고 있었고, 그것이 "켜면 아이콘이 사라진다"의 까닭이었습니다. 탐색기를 새로 띄우고 27개를 센 결과: 아무것도 안 함 27개, 이 메시지만 보냄 **0개**, 아이콘 자리잡기만 27개, 이것만 빼고 전부 켬 27개.
- **`SHChangeNotify(SHCNE_ASSOCCHANGED, ...)`** — 셸이 아이콘 그림 곳간을 통째로 다시 만들고, 그동안 바탕화면이 그림 없이 이름만 그려집니다. 셸 아이콘을 감추거나 휴지통을 비운 뒤에도 쓰지 않습니다. 바탕화면 보기에 새로 고침(`WM_COMMAND` `0x7103`)만 보냅니다.
- **목록 창 크기(`SetWindowPos`)** — 같은 증상을 냅니다. `normalizeList` 는 앞선 판이 **넓혀 둔 것만** 좁히고, 넓히지는 않습니다.

아이콘을 화면 밖(x = 20000)으로 치우는 것도 쓰지 않습니다. 탐색기가 마우스를 뗄 때마다 되돌려 놓아 250밀리초 주기의 다툼이 됩니다.

### 살펴보는 길

- `MYDESKBOX_TRACE` 에 파일 경로를 주면 무슨 일이 언제 일어났는지 적습니다.
- `node tools/icon-check.js` — 바탕화면 아이콘에 그림이 남아 있는지 셉니다. 망가뜨리는 호출을 가려낼 때 씁니다.
- `bash tools/icon-trial.sh "이름" VAR=1` — 탐색기를 새로 띄우고, 앱을 켜기 앞뒤로 그 수를 견줍니다.
- `node tools/shoot-desktop.js <파일.png> [x y w h]` — 다른 창이 덮고 있어도 바탕화면 층만 찍습니다.

## 다른 운영체제

Finder와 데스크톱 환경은 아이콘 하나의 좌표를 바꾸는 API도, 아이콘 층 뒤에 창을 넣는 길도 주지 않습니다. 그래서 `nativeIcons`가 거짓이면 판 창을 만들지 않고(`openPanel`), 아이콘 자리도 건드리지 않습니다. 박스는 테두리만 그립니다. 셸 항목 목록은 Windows에서만 채웁니다.

## 검사

```bash
npm test
npm run test:tap
```

`npm test`는 `tools/reporter.js`로 파일별 결과와 검사마다의 시간을 찍습니다. 기호는 ASCII만 써서 한글 콘솔에서 선 문자가 `?`로 보이지 않게 합니다. 운영체제 창을 띄우는 검사와, 창 없이 계산만 하는 검사를 나눕니다. 이 컴퓨터의 휴지통 자리는 바탕화면에 아이콘이 있을 때만 확인합니다.
