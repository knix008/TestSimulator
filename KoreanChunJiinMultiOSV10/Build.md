# 빌드 · 시험

## 준비물

- **Node.js 20 이상** (`node -v` 로 확인)
- 그 밖에는 없습니다. `npm install` 이 나머지를 받아 옵니다.

```bash
cd KoreanChunJiinMultiOSV10
npm install
```

## 개발 중에 돌리기

| 명령 | 하는 일 |
|---|---|
| `npm run web` | 브라우저로 연다 (http://localhost:5173) |
| `npm start` | 데스크톱 앱을 띄운다 (Vite + Electron, 고치면 바로 반영) |
| `npm test` | 엔진 회귀 시험 584항목 |
| `npm run test:quiet` | 실패한 항목과 요약만 |
| `npm run test:app` | 창을 띄워 17가지를 확인 (하나라도 어긋나면 실패) |
| `npm run clean:release` | `release/` 비우기 |
| `npm run copy:installer` | 설치 파일을 프로젝트 루트로 복사 |

`npm start` 는 코드를 고치면 그 자리에서 화면이 바뀝니다.
빌드된 결과를 껴안고 도는 방식이 아니므로 다시 컴파일할 필요가 없습니다.

## 배포판 만들기

| 명령 | 결과물 |
|---|---|
| `npm run build` | `dist/` — 정적 웹 서버에 그대로 올리면 되는 웹판 |
| `npm run build:win` | `release/Chunjiin Setup 1.0.0.exe` (NSIS 설치 프로그램) |
| `npm run build:mac` | `release/*.dmg`, `release/*.zip` |
| `npm run build:linux` | `release/*.AppImage`, `release/*.deb` |

electron-builder 는 **자기 운영체제용만** 만드는 것이 가장 확실합니다.
Windows 배포판은 Windows 에서, macOS 배포판은 macOS 에서 만드세요.
(macOS 는 코드 서명 때문에 다른 운영체제에서 만들 수 없습니다.)

### 웹판 올리기

`dist/` 는 상대 경로로 빌드되므로 하위 폴더에 올려도 됩니다.

```bash
npm run build
npx serve dist          # 확인해 보기
```

브라우저에서 파일 열기/저장을 쓰려면 `https://` 또는 `http://localhost` 여야 합니다.
평문 `http://` 로 다른 기기에 올리면 클립보드·파일 API 가 막힙니다.

### 아이콘

아이콘은 `build/` 에 이미 들어 있습니다 (C 판 `assets/` 에서 가져온 것).

- `build/icon.ico` — Windows
- `build/icon.png` — macOS, 창 아이콘
- `build/icons/*.png` — Linux (크기별)

`build/icon.ico` 를 바꿨다면 리눅스용 묶음을 다시 만드세요.

```bash
npm run make:icons
```

## 자주 걸리는 것

### `EPERM: operation not permitted, rename 'release\win-unpacked.tmp'`

앞선 빌드가 남긴 `release/` 가 있으면 electron-builder 가 electron 압축을
`release/win-unpacked.tmp` 에 푼 뒤 이름을 바꾸다가 넘어집니다.

`npm run build:win` 은 `npm run clean:release` 를 먼저 부르므로 이제 걸리지 않습니다.
그래도 나면 그 폴더를 열어 둔 탐색기나 터미널, 실행 중인 `Chunjiin.exe` 가 있는지 보세요.

```bash
npm run clean:release        # 손으로 비우기
```

### `npm start` 를 했는데 5173 포트가 이미 쓰이고 있다

`npm start` 는 Vite 개발 서버와 Electron 을 **한 프로세스가 함께 쥡니다**
(`scripts/dev.mjs`). 창을 닫거나 `Ctrl+C` 를 누르면 둘 다 내려가고
포트도 반드시 풀립니다.

그래도 5173 이 차 있으면(다른 프로그램이 쓰는 등) Vite 가 빈 포트를 잡고
그 주소를 Electron 에 넘기므로 그냥 뜹니다. 잡은 포트는 시작할 때 찍힙니다.

앞서 비정상 종료로 남은 것이 있다면 이렇게 확인하고 정리합니다.

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object OwningProcess
Stop-Process -Id <위에서 나온 PID> -Force
```

### `TypeError: Cannot read properties of undefined (reading 'whenReady')`

셸에 `ELECTRON_RUN_AS_NODE=1` 이 남아 있으면 Electron 이 창을 띄우지 않고
그냥 Node 로만 돌아서 `app` 이 `undefined` 가 됩니다.

`npm start` 는 `scripts/dev.mjs` 가, `npm run electron` 은 `scripts/run-electron.mjs` 가
자식 프로세스로 넘기기 전에 그 변수를 지웁니다.
`npx electron .` 을 직접 치면 걸리므로, 그때는 이렇게 하세요.

```bash
unset ELECTRON_RUN_AS_NODE && npx electron .    # bash
Remove-Item Env:ELECTRON_RUN_AS_NODE; npx electron .   # PowerShell
```

### 설치 스크립트가 막혔다는 경고

```
npm warn install-scripts electron@37.10.3 (postinstall: node install.js)
```

`package.json` 의 `allowScripts` 에 허용 목록이 들어 있습니다.
그래도 electron 바이너리가 없다면 다시 만들어 주세요.

```bash
npm rebuild electron esbuild
```

## 시험 새로 쓰기

`tests/engine.test.mjs` 는 키 시퀀스와 기대 문자열을 짝지어 놓은 표입니다.

```js
section('낱말·문장');
expect('안녕', 'a014|4110a', '안녕');
//      이름    키 시퀀스     기대 결과
```

키 시퀀스 문법:

```
0~9  키 0~9        a 키 10 (ㅇㅁ)      b 키 11 (? !)
_ 스페이스   < 백스페이스   | 연타 순환 끊기   ! 조합 확정
~ 전체 지우기   / 줄바꿈   [ ] 커서 왼쪽·오른쪽   { } 맨 앞·맨 뒤
H E U N S  모드: 한글/영소/영대/숫자/기호      M 모드 순환
(그 밖의 글자, 공백 포함은 무시하므로 보기 좋게 띄어 써도 됩니다)
```

확인 함수는 여섯 가지입니다.

| 함수 | 무엇을 본다 |
|---|---|
| `expect` | 조합을 확정한 뒤의 버퍼 |
| `expectLive` | 확정하지 않은, 조합 중인 모습 그대로 |
| `expectCursor` | 버퍼와 커서 위치 |
| `expectComp` | 상태줄에 나오는 조합 문자열 |
| `expectMode` | 모드 이름 |
| `checkLabels` | 버튼에 적힌 글자와 실제로 들어가는 글자가 같은지 |

새 구역을 만들었으면 파일 맨 아래 `main()` 안에 호출을 넣어 주세요.

## C 판과 결과가 같은지 보기

원본 프로젝트에도 같은 시험이 있습니다. 둘을 나란히 돌려 비교할 수 있습니다.

```bash
../KoreanChunJiInC++/build/test_engine.exe -q --no-color | tail -8
npm run test:quiet -- --no-color | tail -8
```

585 대 584 로 하나가 차이 나는데, 그 하나는 C 의 `NULL` 포인터 시험이라
자바스크립트에는 해당이 없습니다. 나머지는 모두 같은 결과입니다.
