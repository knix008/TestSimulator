# 구조

MyCalc 10.0은 번들러 없는 정적 페이지입니다. Electron은 그 페이지를 창에 띄우고, 빌드 스크립트는 같은 파일을 플랫폼별 패키지로 만듭니다.

```
index.html          화면
style/styles.css    테마 변수와 고정 크기 레이아웃
src/engine.js       실수식, 정수식
src/graph.js        2D/3D 그래프
src/themes.js       테마 40개와 사용자 정의 색
src/app.js          모드, 키패드, 시트
electron/main.js    BrowserWindow
scripts/            빌드와 테스트
test/               브라우저 테스트
```

스크립트는 ES 모듈이 아닙니다. `index.html` 맨 아래에서 `i18n.js`, `engine.js`, `graph.js`, `themes.js`, `app.js` 순서로 읽습니다. 파일 프로토콜과 HTTP에서 같이 동작합니다.

## 화면

`.app` 프레임 크기는 모드와 관계없이 같습니다. 설정과 정보는 `.app` 안의 시트로 열리고, 설정 시트는 스크롤바를 쓰지 않습니다. 테마는 CSS 변수로 문서 루트에 적용되고 `localStorage` 키 `mycalc-theme`에 저장됩니다. 어두운 테마 20개, 밝은 테마 20개, 사용자 정의 색이 있습니다.

계산기는 사용자 식을 `eval`로 실행하지 않습니다. `src/engine.js`가 토큰으로 나눈 뒤 재귀 하강으로 평가합니다. 실수 모드에서 `^`는 거듭제곱이고, 프로그래머 모드에서 `^`는 XOR입니다. 그래프를 표본 추출할 때는 키패드의 DEG/RAD와 상관없이 라디안을 사용합니다.

## Electron

`package.json`의 `main`은 `electron/main.js`입니다. 창은 `index.html`을 `loadFile`로 열고, 렌더러에서는 Node를 쓰지 않습니다. `contextIsolation`과 `sandbox`가 켜져 있습니다. 창 제목은 MyCalc 10.0입니다.

## 빌드

`scripts/build-web.js`는 화면 파일을 `dist/web`으로 복사합니다.

Windows와 Linux는 electron-builder가 만듭니다. 출력 디렉터리는 `release`입니다. Windows 대상은 NSIS이고 `oneClick`이 꺼져 있습니다. Linux 대상은 `tar.gz`와 `zip`입니다.

macOS는 `scripts/build-macos.js`가 만듭니다. macOS에서 실행하면 electron-builder를 호출합니다. 다른 OS에서는 Electron darwin 바이너리를 받아 `MyCalc.app`으로 조립한 뒤 zip으로 묶습니다. 이 경로는 코드 서명을 하지 않습니다.

## 테스트

`src/rates.js`는 환율을 담당합니다. 하나의 공개 API에서 받은 표를 `localStorage`에 넣어 두고, 받지 못하면 마지막 표로 계산합니다. 표가 하나도 없으면 파일에 들어 있는 기본값을 씁니다.

`npm test`는 `scripts/test.js`입니다. 로컬 HTTP 서버를 띄운 뒤 헤드리스 브라우저로 `test/index.html`을 엽니다. `test/cases.js`가 계산, 프로그래머, 화면, 공학용, 그래프, 테마를 검사합니다. 케이스는 화면 밖 iframe의 계산기 페이지에 스크립트를 넣어 실행합니다.
