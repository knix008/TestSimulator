# CaptureMaster

Windows · macOS · Linux(Ubuntu) 용 화면 캡처 / 주석 / 화면 녹화 프로그램.
Electron 31 + React 18 + Vite 5 로 만들어졌으며, 세 OS 모두 설치 파일을 만들 수 있습니다.

- 사용 방법: [UsersGuide.md](UsersGuide.md)
- 내부 구조: [Architecture.md](Architecture.md)

![app icon](assets/icon.svg)

## 주요 기능

| 영역 | 내용 |
|---|---|
| 캡처 | 전체 화면 · 특정 창 · 드래그 영역(전체 화면 오버레이) · 지연 캡처(카운트다운) · 캡처 시 창 자동 숨김 · 클립보드 복사 |
| 녹화 | 전체 화면 동영상 녹화(WebM VP9/VP8, 지원 시 MP4) · fps/비트레이트 · 시스템 소리(Windows) · 마이크 · 일시정지/재개 · 항상 위에 뜨는 녹화 컨트롤 창 · 녹화 중 창 최소화 |
| 편집 | 선택/이동/크기조절, 펜, 사각형, 타원, 화살표, 직선, 텍스트, 형광펜, 모자이크, 번호 배지, 자르기 · Undo/Redo(100단계) · Ctrl+휠 확대/축소 · 복사/붙여넣기(이미지·주석) |
| 문서 | `.cmcap` 캡처 파일(이미지+주석) 저장/열기 — 별도 아이콘, 설치 시 시스템 등록 · PNG/JPEG/WebP/BMP 내보내기 · 이미지/동영상 파일 열기 · URL 에서 이미지 열기(진행 표시) · 탭으로 여러 문서 |
| 인쇄 | 모든 문서 / 현재 문서 / 사용자 지정(문서 선택, 현재 문서의 선택 영역) · 가로/세로 · 페이지 맞춤 |
| UI | 타이틀 바에 이름+버전, 아이콘 툴바(모든 버튼 툴팁, 언어 전환 버튼, 우측에 설정·정보), 상태 바(우측 하단 크기 변경 마커), 최소 크기로 시작(툴바·시작 화면이 모두 보이는 크기), 컨텍스트 메뉴, **16가지 테마**, 한국어/영어, 시스템 폰트·크기·스타일, 창 투명도 슬라이더(0~100), 최근 파일 10개(개별/전체 삭제), 열어본 폴더 기억, 설정 자동 저장/복원 |
| 팝업 | 설정·정보·오류·진행률·인쇄·소스 선택·영역 선택·녹화 컨트롤이 모두 **독립 OS 창** — 메인 창을 닫으면 함께 종료, 첫 프레임까지 그린 뒤 표시(깜빡임 없음) |
| 안전 | 종료 시 저장 여부 확인, 오류 팝업에 상세 내용(렌더러·메인 프로세스 모두) + 복사 버튼, 최소 창 폭 = 툴바 폭 |

## 실행

```bash
npm install
npm start          # Vite 개발 서버 + Electron (핫 리로드)
npm run web        # 브라우저에서만 (getDisplayMedia 기반, 기능 일부 제한)
```

`CM_USER_DATA=<폴더>` 환경 변수를 주면 개발 실행이 별도 프로필(설정·창 상태·단일 인스턴스 잠금)을 사용합니다.

## 빌드 / 설치 파일

```bash
npm run build:win     # release/CaptureMaster Setup 1.0.0.exe  (NSIS, 프로젝트 루트에도 복사)
npm run build:mac     # release/CaptureMaster-1.0.0.dmg          (macOS 에서 실행)
npm run build:linux   # release/*.AppImage, *.deb                 (Linux 에서 실행)
```

```bash
npm run clean         # dist/ release/ build/icons/ src/build-info.json .smoke/ 와 루트의 설치 파일 삭제
npm run clean:all     # 위 항목 + node_modules/ (다시 npm install 필요)
```

아이콘은 `assets/icon.svg`(앱)와 `assets/file-icon.svg`(.cmcap 문서)에서 `npm run generate:icons` 로
ico / icns / png 세트가 생성됩니다. 설치 파일·언인스톨러·바로가기 모두 같은 아이콘을 씁니다.

### 설치 동작

- **Windows (NSIS)** — 이미 설치된 버전이 있으면 완전히 삭제한 뒤 설치합니다. 이전 설치의 데이터(설정·최근 파일·창 상태)가 남아 있으면 삭제 여부를 묻습니다(무인 설치는 유지). `.cmcap` 형식을 별도 아이콘과 함께 등록하고, 바탕화면/시작 메뉴 바로가기를 선택할 수 있습니다. 설치 언어에 따라 한국어/영어로 표시됩니다.
- **Linux (.deb)** — `dpkg -i` 로 재설치 시 파일을 교체하고, `after-install.sh` 가 `.cmcap` MIME 타입과 문서 아이콘을 등록합니다. 패키지 관리자는 대화가 불가능하므로, 남아 있는 이전 데이터 삭제 여부는 **앱이 처음 실행될 때** 묻습니다(`~/.config/CaptureMaster`).
- **macOS (.dmg)** — 앱을 Applications 로 끌어 넣습니다. 이전 데이터 삭제 여부는 Linux 와 같이 첫 실행 때 묻습니다. 화면 기록 권한(시스템 설정 → 개인 정보 보호)이 필요합니다.
- **Ubuntu Wayland** — 캡처/녹화 시 시스템의 화면 공유 포털 대화상자가 뜨며, 허용한 화면이 캡처됩니다.

## 테스트

```bash
npm test                          # 단위 테스트: history / settings / document / themes / ico
npm run build && npm run smoke    # 실제 앱을 띄워 캡처·주석·저장·다이얼로그·영역·녹화 시나리오 실행
npm run smoke -- region           # 시나리오 하나만
```

smoke 테스트는 별도 프로필(`.smoke/profile`)로 실행되므로 실행 중인 앱과 충돌하지 않으며, 결과 스크린샷은 `.smoke/*.png` 에 남습니다.

## 구조 (요약)

```
electron/   main.js ipc.js dialogs.js capture.js preload.js state.js
src/        App.jsx DialogHost.jsx i18n.js themes.js styles.css main.jsx
  lib/      document.js history.js render.js image.js capture.js platform.js dialogBus.js settings.js fonts.js errors.js format.js
  components/ Editor.jsx Toolbar.jsx chrome.jsx common.jsx VideoView.jsx Icons.jsx ErrorBoundary.jsx
  dialogs/  DialogFrame.jsx SettingsDialog.jsx SimpleDialogs.jsx CaptureDialogs.jsx
build/      installer.nsh  linux/{after-install.sh, after-remove.sh, capturemaster-mime.xml}
scripts/    generate-icons.mjs generate-build-info.mjs sync-public-svgs.mjs start-electron.mjs copy-installer.js free-port.mjs smoke.mjs
test/       *.test.mjs  smoke/*.js
```

자세한 설명은 [Architecture.md](Architecture.md) 를 보세요.

---

**CaptureMaster** — screen capture & recording for Windows, macOS and Linux.
Author: SHKWON (knix008@naver.com) · License: MIT
