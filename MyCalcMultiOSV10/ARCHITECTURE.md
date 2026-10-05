# 구조

MyCalc 10.0은 번들러 없는 정적 페이지입니다. Electron은 그 페이지를 창에 띄우고, 빌드 스크립트는 같은 파일을 플랫폼별 패키지로 만듭니다.

```
index.html          화면
style/styles.css    테마 변수와 고정 크기 레이아웃
src/engine.js       실수식, 정수식
src/graph.js        2D/3D 그래프
src/themes.js       테마 40개와 사용자 정의 색
src/rates.js        환율 표
src/units.js        단위 표와 변환
src/app.js          모드, 키패드, 시트
electron/main.js    BrowserWindow
scripts/            빌드와 테스트
test/               브라우저 테스트
```

스크립트는 ES 모듈이 아닙니다. `index.html` 맨 아래에서 `i18n.js`, `engine.js`, `graph.js`, `image-export.js`, `themes.js`, `rates.js`, `units.js`, `app.js` 순서로 읽습니다. 파일 프로토콜과 HTTP에서 같이 동작합니다.

## 화면

모드마다 `.app` 프레임 크기가 정해져 있습니다. 기본과 공학용은 594픽셀 높이이고, 프로그래머는 480x700, 기본과 환율과 단위는 360x594입니다. 같은 값이 `electron/main.js`의 `MODE_CONTENT_SIZE`에도 있어 데스크톱 창이 모드를 따라 크기를 바꿉니다.

그래프는 계산기 창의 모드가 아닙니다. 탭을 누르면 그래프 창만 열리고 계산기 화면은 그대로 있습니다. `#screenGraph`는 계산기 창에도 남아 있지만 `visibility: hidden` 으로 화면 밖에 고정되어, 보이지 않는 채로 그림을 유지합니다. 나중에 연 그래프 창이 `hello` 를 보내면 계산기 창이 그 상태를 그대로 돌려줍니다. 그래프 창은 도구 모음이 한 줄에 들어가는 크기를 최소로 삼습니다. 그 값은 `app.js`의 `GRAPH_MIN_WIDTH`/`GRAPH_MIN_HEIGHT`와 `electron/main.js`의 `childSpec.graph` 양쪽에 있습니다.

프레임 없는 투명 창은 Windows에서 크기 조절 테두리 없이 열리고, `setBounds` 를 부를 때마다 최소 크기가 방금 준 크기로 올라갑니다. 그래서 창은 커지기만 하고 줄지 않았습니다. `electron/main.js`는 창마다 처음 최소 크기를 적어 두고(`windowFloor`), 좌표를 옮길 때마다 그 값을 다시 넣습니다. 설정과 정보는 `.app` 안의 시트로 열리고, 설정 시트는 스크롤바를 쓰지 않습니다. 테마는 CSS 변수로 문서 루트에 적용되고 `localStorage` 키 `mycalc-theme`에 저장됩니다. 어두운 테마 20개, 밝은 테마 20개, 사용자 정의 색이 있습니다.

숫자 키 배치도 설정에 있습니다. `mycalc-keypad` 키에 `789` 또는 `123`이 들어가고, `digitRows()`가 그 값을 보고 세 줄의 순서를 정합니다. 기본, 공학용, 프로그래머, 환율, 단위 키패드가 모두 같은 함수를 씁니다. `0`은 어느 배치에서나 숫자 칸 가운데 아래에 놓입니다. 창을 여러 개 열어 두면 `mycalc-ui` 브로드캐스트와 `storage` 이벤트로 배치가 함께 바뀝니다.

그래프 색은 `src/graph.js`의 `PALETTE` 여덟 개이고, 축 색은 `AXIS_COLORS` 입니다. 두 목록은 겹치지 않습니다. 3D 곡면은 한 함수에 한 색이며, 높이는 색을 섞지 않고 빛만 밝기를 바꿉니다. 높이 한계에서 잘린 칸은 잘리기 전 기울기로 음영을 계산합니다. 그러지 않으면 잘린 자리에 밝은 톱니가 한 줄 생깁니다.

계산기는 사용자 식을 `eval`로 실행하지 않습니다. `src/engine.js`가 토큰으로 나눈 뒤 재귀 하강으로 평가합니다. 실수 모드에서 `^`는 거듭제곱이고, 프로그래머 모드에서 `^`는 XOR입니다. 그래프를 표본 추출할 때는 키패드의 DEG/RAD와 상관없이 라디안을 사용합니다.

## Electron

`package.json`의 `main`은 `electron/main.js`입니다. 창은 `index.html`을 `loadFile`로 열고, 렌더러에서는 Node를 쓰지 않습니다. `contextIsolation`과 `sandbox`가 켜져 있습니다. 창 제목은 MyCalc 10.0입니다.

## 빌드

`scripts/build-web.js`는 화면 파일을 `dist/web`으로 복사합니다.

Windows와 Linux는 electron-builder가 만듭니다. 출력 디렉터리는 `release`입니다. Windows 대상은 NSIS이고 `oneClick`이 꺼져 있습니다. Linux 대상은 `tar.gz`와 `zip`입니다.

macOS는 `scripts/build-macos.js`가 만듭니다. macOS에서 실행하면 electron-builder를 호출합니다. 다른 OS에서는 Electron darwin 바이너리를 받아 `MyCalc.app`으로 조립한 뒤 zip으로 묶습니다. 이 경로는 코드 서명을 하지 않습니다.

## 테스트

`src/rates.js`는 환율을 담당합니다. 하나의 공개 API에서 받은 표를 `localStorage`에 넣어 두고, 받지 못하면 마지막 표로 계산합니다. 표가 하나도 없으면 파일에 들어 있는 기본값을 씁니다.

`src/units.js`는 단위를 담당합니다. 열두 묶음마다 기준 단위가 하나 있고, 각 단위는 기준에 대한 배수를 가집니다. 온도만 더하는 값이 있어 `toBase`와 `fromBase` 함수를 직접 들고 있습니다. 네트워크를 쓰지 않으며 고른 묶음과 단위는 `mycalc-unit` 키에 남습니다.

`npm test`는 `scripts/test.js`입니다. 로컬 HTTP 서버를 띄운 뒤 헤드리스 브라우저로 `test/index.html`을 엽니다. `test/cases.js`가 계산, 프로그래머, 화면, 공학용, 그래프, 환율, 단위, 테마, 키패드 배치를 검사합니다. 함수 표에 있는 이름은 하나씩 모두 불러 보고, 단위는 묶음마다 모든 단위를 기준 단위까지 갔다 오게 해서 확인합니다. 케이스는 화면 밖 iframe의 계산기 페이지에 스크립트를 넣어 실행합니다.
