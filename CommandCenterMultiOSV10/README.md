# Command Center (CommandCenterMultiOSV10)

Windows · macOS · Linux · **웹** 용 듀얼 패널 파일 관리자.
[CommandCenterGTKv10](../CommandCenterGTKv10) (GTK3, Linux/macOS) 를 참고하여 Electron 31 + React 18 + Vite 5 로
다시 만들었으며, 같은 코어(`core/`)가 데스크톱 앱과 웹 서버 양쪽에서 동작합니다.

- 사용 방법: [UsersGuide.md](UsersGuide.md)
- 내부 구조: [Architecture.md](Architecture.md)

![app icon](assets/icon.svg)

## 주요 기능

| 영역 | 내용 |
|---|---|
| 패널 | 좌/우 듀얼 패널(활성 패널 테두리 표시), 분할선 드래그, **드라이브 메뉴**(시스템의 모든 드라이브/볼륨 — 이름·여유/전체 용량), 경로 빵부스러기(breadcrumb), 홈 버튼, 패널 이름 클릭 → 폴더 트리(홈 · 드라이브/루트 · /tmp · 마운트) |
| 목록 | 이름 · 권한 · 수정일 · 종류 · 크기, 열 머리글 클릭 정렬(폴더 우선, `..` 고정), 다중 선택(Ctrl/Shift), 숨김 파일 표시, 폴더 변경 자동 새로고침 |
| 파일 작업 | 패널 간 복사(F5)/이동(F6), 새 폴더(F7)/새 파일, 이름 바꾸기(F2), 삭제(F8), 휴지통, 클립보드 복사/붙여넣기(URI 목록), 기본 앱으로 열기, 속성 |
| 충돌·진행 | 같은 이름이 있으면 덮어쓰기/건너뛰기/취소 + "이후 항목에도 동일하게 적용", 모든 긴 작업은 진행률 창(취소 가능) |
| 압축 | `.tar.gz` `.tar.bz2` `.zip` 생성/해제, **분할 압축**(zip → `.zip`+`.z01`…, tar → `.tgz`+`.001`…; GTK 판과 호환), 분할 파일 더블클릭 시 자동 결합 해제, `.tar` `.gz` `.bz2` 해제, ZIP 한글 파일명(EUC-KR) 복원 |
| 검색 | 재귀 파일 검색(F9): 이름 패턴(`*.txt`) + 내용 검색, 결과 더블클릭으로 해당 폴더 이동 |
| UI | 16가지 테마(툴바 우측 분할 버튼: 클릭=다음 테마, ▾=목록), 한국어/영어(국기 아이콘 토글), **설정**(일반: 언어·테마·글꼴 크기·분할 기본 크기·숨김 파일·삭제 확인·마지막 폴더 복원·자동 새로고침 / 터미널: 기본 셸·시작 디렉터리), 프로그램 정보 버튼, 상태 표시줄 |
| 하단 패널 | 파일 목록 아래의 탭 패널(``Ctrl+` ``). **로그** 탭: 모든 상태 메시지와 오류가 시각과 함께 쌓임(복사/지우기). **터미널** 탭: 원하는 만큼 열 수 있고(Windows: PowerShell · Command Prompt · PowerShell 7 · Git Bash, macOS/Linux: 로그인 셸 · bash · zsh · sh) 활성 패널 폴더 또는 설정한 시작 디렉터리에서 시작. MyEditor 와 같은 콘솔 — **oh-my-posh 스타일 프롬프트** `[📁 경로]▶[⎇ main]▶[~]▶[+]▶[↑]▶`(oh-my-posh 식 세그먼트: 남은 git 단계마다 한 칸 — 적색 ~ 변경 있음 · 노란색 + add 됨 · 황색 ↑ 커밋됨/푸시 필요 · 보라 ↓ pull 필요 · 진한 빨강 ⇅ 갈라짐 / ! 충돌, 브랜치 세그먼트는 가장 진행된 단계의 색(남은 게 없으면 녹색 main ✓); 명령마다 갱신, 개수는 툴팁) 바로 뒤에서 입력(한글 IME 포함), **Tab 자동 완성**(명령·파일), ↑↓ 기록, 실행 중인 프로그램에 답 입력 가능 |
| 오류 | 모든 오류는 팝업으로 — 메시지 + 자세한 내용(코드·경로·발생 프로세스의 스택) + **자세한 내용 복사** 버튼 |
| 세션 | 마지막 좌/우 경로, 분할 위치, 정렬, 테마, 언어, 창 위치, 하단 패널 표시/높이, 터미널 기본 셸·시작 디렉터리를 저장하고 복원 |

## 실행

```bash
npm install
npm start          # Vite 개발 서버 + Electron (UI 는 핫 리로드, core/·electron/ 이 바뀌면 Electron 자동 재시작)
npm run web        # 빌드 후 웹 버전: http://127.0.0.1:5186 (브라우저가 열립니다)
```

`CC_USER_DATA=<폴더>` 환경 변수를 주면 개발 실행이 별도 프로필(세션·창 상태·단일 인스턴스 잠금)을 사용합니다.

### 웹 버전

`server/server.js` 가 `dist/` 와 `/api/*` 를 함께 제공하므로, 서버가 실행되는 컴퓨터의 파일 시스템을 브라우저에서 관리합니다.

```bash
node server/server.js --port 8080 --host 0.0.0.0 --token 비밀값   # 다른 PC 에서 접속 (토큰 필수 권장)
node server/server.js --host 0.0.0.0 --token 비밀값 --allow-open      # + 더블클릭으로 서버의 기본 앱 실행 허용
```

기본은 루프백(127.0.0.1)만 바인딩합니다. API 는 파일 전체에 대한 읽기/쓰기 권한이므로, 다른 인터페이스에 열 때는 `--token`
(요청의 `Authorization: Bearer …` 또는 `?token=`)을 함께 쓰세요. 터미널 탭은 **서버 컴퓨터**의 셸이므로 더욱 그렇습니다. 웹 버전에서는 "기본 앱으로 열기"가 `--allow-open` 일 때만 켜지고, 휴지통은 Linux/macOS 에서만 동작합니다.

## 빌드 / 설치 파일

```bash
npm run build:win     # release/Command Center Setup 1.0.0.exe (NSIS) — 프로젝트 루트에도 복사
npm run build:mac     # release/Command Center-1.0.0.dmg          (macOS 에서 실행)
npm run build:linux   # release/*.AppImage, *.deb                  (Linux 에서 실행)
```

아이콘은 `assets/icon.svg` 하나에서 `npm run generate:icons` 로 `build/icons/` 의 ico · icns · png 세트가 생성되며,
앱 · 설치 파일 · 언인스톨러 · macOS DMG · 웹 파비콘이 모두 같은 아이콘을 씁니다.

### 설치 동작

- **Windows (NSIS)** — 설치 폴더 선택, 바탕화면/시작 메뉴 바로가기 선택(한국어/영어). 이미 설치된 버전은 완전히 삭제한 뒤 설치하고, 남아 있는 이전 데이터(세션·설정)는 삭제 여부를 묻습니다(무인 설치는 유지).
- **Linux (.deb / AppImage)** — `dpkg -i` 로 설치하면 애플리케이션 메뉴에 등록됩니다. 데이터는 `~/.config/Command Center`.
- **macOS (.dmg)** — 앱을 Applications 로 끌어 넣습니다. 데이터는 `~/Library/Application Support/Command Center`.

```bash
npm run clean         # dist/ release/ build/icons/ .smoke/ 와 루트의 설치 파일 삭제
npm run clean:all     # 위 항목 + node_modules/
```

## 테스트

```bash
npm test                            # 단위 테스트: tar/zip/bz2 왕복, 분할 압축, 복사 충돌, 검색, API, 터미널(셸 왕복·Tab 완성·git 상태)
npm run build && npm run smoke      # 실제 앱을 띄워 스크린샷(.smoke/main.png) + 웹 서버 API/UI 확인
npm run smoke -- --scenario all     # 컨텍스트 메뉴·압축·검색·정보·삭제·테마·오류·터미널·로그·설정(터미널 탭) 화면을 각각 캡처
npm run smoke -- --scenario compress --web   # 같은 시나리오를 웹 모드로
```

smoke 테스트는 별도 프로필(`.smoke/profile`)로 실행되므로 실행 중인 앱과 충돌하지 않습니다.

## 단축키

| 키 | 동작 |
|----|------|
| F2 | 이름 바꾸기 |
| F5 | 반대 패널로 복사 |
| F6 | 반대 패널로 이동 |
| F7 | 새 폴더 |
| F8 | 삭제 |
| F9 | 검색 |
| Tab | 활성 패널 전환 |
| Enter / Backspace | 열기 / 상위 폴더 |
| Ctrl+A / Ctrl+C / Ctrl+V | 모두 선택 / 클립보드 복사 / 붙여넣기 |
| Delete | 삭제 |
| Ctrl+` | 하단 패널(로그·터미널) 표시/숨김 |
| Ctrl+Shift+` | 새 터미널 |
| 터미널 안: Tab / ↑ ↓ / Ctrl+L / Esc | 자동 완성 / 이전·다음 명령 / 화면 지우기 / 입력 취소 |

## 구조 (요약)

```
core/       api.js fsops.js archive.js tar.js bzip2-worker.js jobs.js session.js terminal.js   ← 플랫폼 무관 (Node)
electron/   main.js ipc.js preload.js                                             ← 데스크톱 호스트
server/     server.js                                                             ← 웹 호스트 (http 모듈만 사용)
src/        App.jsx themes.js styles.css main.jsx
  lib/      backend.js i18n.js format.js
  components/ FilePanel.jsx FolderTree.jsx Chrome.jsx ContextMenu.jsx Icons.jsx BottomDock.jsx
  dialogs/  Dialogs.jsx SearchDialog.jsx SettingsDialog.jsx
assets/     icon.svg
build/      installer.nsh linux/{after-install.sh, after-remove.sh}
scripts/    generate-icons.mjs ico.mjs generate-build-info.mjs sync-public-svgs.mjs start-electron.mjs copy-installer.js free-port.mjs smoke.mjs clean.mjs
test/       archive.test.mjs fsops.test.mjs terminal.test.mjs
```

자세한 설명은 [Architecture.md](Architecture.md) 를 보세요.

## 라이선스

MIT License — 제작자: SHKWON (knix008@naver.com)
