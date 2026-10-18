# 구조

MyCalc 10.0은 번들러 없는 정적 페이지입니다. Tauri는 그 페이지를 창에 띄우고, 빌드는 같은 파일을 지금 운영체제의 패키지로 만듭니다.

```
index.html          화면
style/styles.css    테마 변수와 고정 크기 레이아웃
src/engine.js       실수식, 정수식
src/graph.js        2D/3D 그래프
src/themes.js       테마 40개와 사용자 정의 색
src/rates.js        환율 표
src/units.js        단위 표와 변환
src/dates.js        날짜 차이, 기간 더하기와 빼기
src/desktop.js      Tauri일 때만 window.mycalcDesktop
src/app.js          모드, 키패드, 시트
src/memo.js         메모장 창과 메모장에 추가
src-tauri/          Tauri 셸(Rust)과 NSIS 설치 훅
scripts/            개발 서버, 웹 빌드, 테스트
test/               브라우저 테스트
```

스크립트는 ES 모듈이 아닙니다. `index.html` 맨 아래에서 `i18n.js`, `engine.js`, `graph.js`, `image-export.js`, `themes.js`, `rates.js`, `units.js`, `desktop.js`, `app.js`, `memo.js` 순서로 읽습니다. `desktop.js`는 `window.__TAURI__`가 있을 때만 `window.mycalcDesktop`을 만듭니다. 브라우저와 테스트에는 그 객체가 없어서 `window.open`과 `window.print`를 그대로 씁니다. `memo.js`는 `app.js`의 전역(`board`, `state`, `uiChannel`, `openChildWindow`)을 그대로 씁니다. 파일 프로토콜과 HTTP에서 같이 동작합니다.

## 화면

모드마다 `.app` 프레임 크기가 정해져 있습니다. 기본과 공학용은 594픽셀 높이이고, 프로그래머는 480x700, 통계는 560x810, 기본과 환율과 단위와 날짜는 360x594입니다. 같은 값이 `src-tauri/src/lib.rs`의 `MODE_CONTENT_SIZE`에도 있어 데스크톱 창이 모드를 따라 크기를 바꿉니다.

그래프는 계산기 창의 모드가 아닙니다. 탭을 누르면 그래프 창만 열리고 계산기 화면은 그대로 있습니다. `#screenGraph`는 계산기 창에도 남아 있지만 `visibility: hidden` 으로 화면 밖에 고정되어, 보이지 않는 채로 그림을 유지합니다. 나중에 연 그래프 창이 `hello` 를 보내면 계산기 창이 그 상태를 그대로 돌려줍니다. 그래프 창은 도구 모음이 한 줄에 들어가는 크기를 최소로 삼습니다. 그 값은 `app.js`의 `GRAPH_MIN_WIDTH`/`GRAPH_MIN_HEIGHT`와 `src-tauri/src/lib.rs`의 graph 창 양쪽에 있습니다.

메모장은 `?pop=memo` 창입니다. 항목은 `localStorage` 키 `mycalc-memo` 에 `{ v: 1, items: [{ id, kind, text, title, builtin }] }` 로 들어 있고, 처음 읽을 때 `MEMO_BUILTINS`(엔진의 모든 함수 예제, 자주 쓰는 공식, 그래프 프리셋 전부)로 채워집니다. 다른 창은 `memoAppend` 로 목록 앞에 넣기만 하고, 바뀔 때마다 `mycalc-ui` 로 `memo` 를 알려 메모장 창이 다시 그립니다. 메모장에서 항목을 쓰면 계산 항목은 `mycalc-ui` 의 `memo-use` 로 계산기 창에, 그래프 항목은 `mycalc-graph` 의 `memo-plot` 으로 그래프 창에 갑니다. 그래프 창이 아직 없으면 계산기 창이 그 항목을 들고 있다가 새 창의 `hello` 에 답하면서 넘기고, 그래프 창은 같은 `token` 을 한 번만 그린 뒤 `memo-plotted` 로 알려 줍니다. 메모장 창의 최소 크기는 `memo.js`의 `MEMO_MIN_WIDTH`/`MEMO_MIN_HEIGHT`와 `src-tauri/src/lib.rs`의 memo 창 양쪽에 있습니다. 입력란이나 선택한 글에서 오른쪽을 누르면 잘라내기·복사·붙여넣기 메뉴가 나오고, 글자는 페이지 언어를 따릅니다.

계산기 창과 정보 창은 프레임이 없고 크기가 고정입니다. 그래프, 설정, 도움말, 메모장, 인쇄 창은 프레임이 없고, 연 순간 적어 둔 최소 크기보다 작아지지 않습니다. 그 바닥값은 `src-tauri/src/lib.rs`가 창 라벨마다 기억했다가 `set_bounds`를 적용하기 전후에 다시 넣습니다. 계산기 창을 닫으면 나머지 창도 닫힙니다. 설정과 정보는 `.app` 안의 시트로 열리고, 설정 시트는 스크롤바를 쓰지 않습니다. 테마는 CSS 변수로 문서 루트에 적용되고 `localStorage` 키 `mycalc-theme`에 저장됩니다. 어두운 테마 20개, 밝은 테마 20개, 사용자 정의 색이 있습니다.

숫자 키 배치도 설정에 있습니다. `mycalc-keypad` 키에 `789` 또는 `123`이 들어가고, `digitRows()`가 그 값을 보고 세 줄의 순서를 정합니다. 기본, 공학용, 프로그래머, 환율, 단위 키패드가 모두 같은 함수를 씁니다. `0`은 어느 배치에서나 숫자 칸 가운데 아래에 놓입니다. 창을 여러 개 열어 두면 `mycalc-ui` 브로드캐스트와 `storage` 이벤트로 배치가 함께 바뀝니다.

그래프 색은 `src/graph.js`의 `PALETTE` 여덟 개이고, 축 색은 `AXIS_COLORS` 입니다. 두 목록은 겹치지 않습니다. 3D 곡면은 한 함수에 한 색이며, 높이는 색을 섞지 않고 빛만 밝기를 바꿉니다. 높이 한계에서 잘린 칸은 잘리기 전 기울기로 음영을 계산합니다. 그러지 않으면 잘린 자리에 밝은 톱니가 한 줄 생깁니다.

계산기는 사용자 식을 `eval`로 실행하지 않습니다. `src/engine.js`가 토큰으로 나눈 뒤 재귀 하강으로 평가합니다. 실수 모드에서 `^`는 거듭제곱이고, 프로그래머 모드에서 `^`는 XOR입니다. 그래프를 표본 추출할 때는 키패드의 DEG/RAD와 상관없이 라디안을 사용합니다.

## Tauri

데스크톱 셸은 `src-tauri`입니다. 식별자는 `local.mycalc.desktop`이고 창 제목은 MyCalc 10.0입니다. 페이지는 Node를 쓰지 않습니다. `src/desktop.js`가 `invoke`로 창 크기, 최소화와 최대화, 위치, 자식 창, 그림 저장을 부탁합니다. `npm start`는 `scripts/dev-server.js`로 `http://127.0.0.1:1420`을 연 뒤 그 주소를 웹뷰에 넣습니다. 계산기 주소는 `index.html?desktop=1`이고, 그래프 창만 `desktop=1`을 더 붙입니다.

인쇄 창은 프린터 목록을 보여 주고, 고른 프린터와 매수, 용지, 여백, 방향, 색으로 인쇄합니다. 그래프 배경도 인쇄되고 머리글과 바닥글은 비웁니다. 오른쪽 클릭의 잘라내기·복사·붙여넣기 글자는 페이지 언어를 따릅니다.

## 빌드

`scripts/build-web.js`는 화면 파일을 `dist/web`으로 복사합니다. `tauri build`는 그 명령을 먼저 실행하고 `dist/web`을 프론트로 넣습니다. 패키지는 `src-tauri/target/release/bundle/`에 생깁니다.

Windows 대상은 NSIS입니다. 한 번에 깔리는 설치 파일이 아니라 마법사이고, 언어는 한국어와 영어, 설치 대상은 현재 사용자와 모든 사용자입니다. `src-tauri/windows/hooks.nsh`가 이전 설치를 지운 뒤, 설정을 지울지는 물은 다음 새 파일이 놓인 뒤에만 지웁니다. 예전 Electron 판의 `%APPDATA%\MyCalc`, `%APPDATA%\mycalc`와 이 앱의 `%APPDATA%\local.mycalc.desktop`을 함께 봅니다.

Linux 대상은 deb와 AppImage, macOS 대상은 app과 dmg입니다. 각 명령은 그 운영체제에서 실행합니다. macOS 패키지는 서명되어 있지 않습니다.

## 테스트

`src/rates.js`는 환율을 담당합니다. 하나의 공개 API에서 받은 표를 `localStorage`에 넣어 두고, 받지 못하면 마지막 표로 계산합니다. 표가 하나도 없으면 파일에 들어 있는 기본값을 씁니다.

`src/units.js`는 단위를 담당합니다. 열두 묶음마다 기준 단위가 하나 있고, 각 단위는 기준에 대한 배수를 가집니다. 온도만 더하는 값이 있어 `toBase`와 `fromBase` 함수를 직접 들고 있습니다. 네트워크를 쓰지 않으며 고른 묶음과 단위는 `mycalc-unit` 키에 남습니다.

`src/dates.js`는 그레고리력으로 두 날짜의 차이와 기간 이동을 계산합니다. 차이는 년·월·일과 함께 정확한 일수를 내고, 월을 더할 때 그 달에 없는 날은 그 달의 마지막 날로 붙입니다. 고른 날짜와 기간은 `mycalc-date` 키에 남습니다.

`npm test`는 `scripts/test.js`입니다. 로컬 HTTP 서버를 띄운 뒤 헤드리스 브라우저로 `test/index.html`을 엽니다. `test/cases.js`가 계산, 프로그래머, 화면, 공학용, 그래프, 환율, 단위, 테마, 키패드 배치, 메모장을 검사합니다. 함수 표에 있는 이름은 하나씩 모두 불러 보고, 단위는 묶음마다 모든 단위를 기준 단위까지 갔다 오게 해서 확인합니다. 케이스는 화면 밖 iframe의 계산기 페이지에 스크립트를 넣어 실행합니다.
