# MyDeskBox 구조

Electron 33 앱입니다. 박스 하나는 바탕화면에 그린 사각형이 아니라 테두리 없는 투명 `BrowserWindow`입니다. 아이콘은 그 창 안에서 그립니다. 순수 계산은 `src/shared`, 창과 저장과 트레이는 `src/main`, 화면은 `src/renderer`에 있습니다.

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
| `src/main/desktop/windows.js` | 탐색기 리스트뷰 FFI (koffi) |
| `src/shared/arrange.js` | 박스 안 칸, 삽입 틈, 창과 그림자의 크기 |
| `src/shared/deskgrid.js` | 바탕화면 칸과, 박스에 가린 아이콘을 밀어내는 계산 |
| `src/shared/deskpick.js` | 커서가 바탕화면 아이콘 위인지 |
| `src/shared/catalog.js` | 첫 실행 분류 |
| `src/shared/taps.js` | 두 번 누르기. 끌기 때문에 브라우저 `dblclick`을 쓰지 않는다 |
| `src/shared/i18n.js` | 한국어·영어 문장 |
| `src/renderer/fence.*` | 박스 창 |
| `src/renderer/draw.*` | 새 박스를 그리는 전체 화면 |
| `src/renderer/ghost.*` | 끄는 동안의 그림자 창. 평소에는 숨긴다 |
| `src/preload/preload.js` | 렌더러에 여는 API |
| `assets/` | 앱, 트레이, 메뉴, 테마, 국기 그림 |
| `tools/start.js` | `npm start` |
| `tools/reporter.js` | `npm test` 출력. 검사마다 시간을 붙인다 |
| `tools/make-icons.js` | `assets/`를 코드로 다시 그린다 |
| `build/installer.nsh` | Windows 설치 스크립트 |
| `test/` | `node --test` |

`arrange.js`, `deskgrid.js`, `taps.js`, `i18n.js`는 렌더러 `<script>`와 메인의 `require`가 함께 읽습니다. 전역 이름은 `DeskArrange`처럼 한 객체로만 내보냅니다.

## 데이터

사용자 데이터 폴더에 두 파일을 둡니다.

- `layout.json` — 박스 목록, 언어, 새 박스 기본값, `didWelcome`. 저장은 임시 파일에 쓴 뒤 이름을 바꿉니다.
- `icon-homes.json` — Windows에서 치워 둔 아이콘의 원래 좌표, 자동 정렬을 껐는지, 셸 아이콘을 숨기기 전의 레지스트리 값.

박스 좌표는 DIP입니다. Windows 리스트뷰 좌표는 물리 픽셀이라 `screen.dipToScreenPoint` / `screenToDipPoint`로 바꿉니다.

## 첫 실행 분류

`didWelcome`이 거짓일 때만 `catalog.planFences`를 부릅니다. 순서는 폴더, 바로가기, 문서, 사진·영상, 시스템, 그 밖의 것입니다. 빈 종류는 박스를 만들지 않습니다. 박스는 작업 영역 오른쪽부터 아래로 쌓고, 높이를 넘으면 왼쪽 열로 갑니다. 만든 것이 없으면 그리기 모드로 시작합니다.

## Windows 바탕화면

`windows.js`가 탐색기의 `SysListView32`를 읽고 `LVM_SETITEMPOSITION32`로 옮깁니다. 원격 프로세스 메모리는 `VirtualAllocEx`로 잡습니다.

- 박스에 담긴 파일 아이콘은 화면 오른쪽 멀리(x = 20000)에 주차합니다. 음수 좌표는 탐색기가 휴지통 같은 항목을 제자리로 되돌립니다.
- 자동 정렬(`LVS_AUTOARRANGE`)과 격자에 맞춤(`LVS_EX_SNAPTOGRID`)은 앱이 아이콘을 다루는 동안 끄고, 종료할 때 되돌립니다.
- 박스가 덮은 칸의 아이콘은 `deskgrid.relocate`가 빈 칸으로 옮길 좌표를 계산하고, 메인 프로세스가 그 좌표를 씁니다.
- 휴지통은 파일이 아닙니다. 경로는 `shell:RecycleBinFolder`입니다. 끌어 놓기는 HTML `dataTransfer.files`가 비어 있으므로, 메인 프로세스가 마우스를 보다가 바탕화면 아이콘을 박스 위에 놓으면 `acceptDesktopDrop`으로 넣습니다.
- 담긴 셸 아이콘은 `HideDesktopIcons`의 `NewStartPanel`과 `ClassicStartMenu`에 CLSID DWORD 1을 적어 바탕화면에서 지웁니다. 종료와 `process` `exit`에서 숨기기 전 값으로 되돌립니다. 기록이 없으면 보이게(0) 되돌립니다. 사용자가 앱보다 먼저 숨겨 둔 값 1은 유지합니다.

## 다른 운영체제

macOS는 `~/Desktop`, Linux는 `xdg-user-dir DESKTOP` 또는 `~/Desktop`의 파일을 창 안에 보여 줍니다. Finder와 데스크톱 환경은 아이콘 하나의 좌표를 바꾸는 API를 쓰지 않으므로 `nativeIcons`는 거짓이고, 바탕화면 아이콘 자리는 그대로 둡니다. 셸 항목 목록은 Windows에서만 채웁니다.

## 검사

```bash
npm test
npm run test:tap
```

`npm test`는 `tools/reporter.js`로 파일별 결과와 검사마다의 시간을 찍습니다. 기호는 ASCII만 써서 한글 콘솔에서 선 문자가 `?`로 보이지 않게 합니다. 운영체제 창을 띄우는 검사와, 창 없이 계산만 하는 검사를 나눕니다. 이 컴퓨터의 휴지통 자리는 바탕화면에 아이콘이 있을 때만 확인합니다.
