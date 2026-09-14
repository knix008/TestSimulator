# CaptureMaster

Windows · macOS · Linux(Ubuntu) 용 화면 캡처 / 주석 / 화면 녹화 프로그램.
Electron 31 + React 18 + Vite 5 로 만들어졌으며, 세 OS 모두 설치 파일을 만들 수 있습니다.

![app icon](assets/icon.svg)

## 주요 기능

| 영역 | 내용 |
|---|---|
| 캡처 | 전체 화면 · 특정 창 · 드래그 영역(전체 화면 오버레이) · 지연 캡처(카운트다운) · 캡처 시 창 자동 숨김 · 클립보드 복사 |
| 녹화 | 전체 화면 동영상 녹화(WebM VP9/VP8, 지원 시 MP4) · fps/비트레이트 · 시스템 소리(Windows) · 마이크 · 일시정지/재개 · 항상 위에 뜨는 녹화 컨트롤 창 · 녹화 중 창 최소화 |
| 편집 | 선택/이동/크기조절, 펜, 사각형, 타원, 화살표, 직선, 텍스트, 형광펜, 모자이크, 번호 배지, 자르기 · Undo/Redo(100단계) · Ctrl+휠 확대/축소 · 복사/붙여넣기(이미지·주석) |
| 문서 | `.cmcap` 캡처 파일(이미지+주석) 저장/열기 — 별도 아이콘, 설치 시 시스템 등록 · PNG/JPEG/WebP/BMP 내보내기 · 이미지/동영상 파일 열기 · URL 에서 이미지 열기(진행 표시) · 탭으로 여러 문서 |
| 인쇄 | 모든 문서 / 현재 문서 / 사용자 지정(문서 선택, 현재 문서의 선택 영역) · 가로/세로 · 페이지 맞춤 |
| UI | 타이틀 바에 이름+버전, 툴바(모든 버튼 툴팁), 상태 바, 컨텍스트 메뉴, 7가지 테마, 한국어/영어, 시스템 폰트·크기·스타일, 창 투명도 슬라이더(0~100), 최근 파일 10개(개별/전체 삭제), 열어본 폴더 기억, 설정 자동 저장/복원 |
| 팝업 | 설정·정보·오류·진행률·인쇄·소스 선택·영역 선택·녹화 컨트롤이 모두 **독립 OS 창** — 메인 창을 닫으면 함께 종료 |
| 안전 | 종료 시 저장 여부 확인, 오류 팝업에 상세 내용 + 복사 버튼, 최소 창 폭 = 툴바 폭 |

## 실행

```bash
npm install
npm start          # Vite 개발 서버 + Electron (핫 리로드)
npm run web        # 브라우저에서만 (getDisplayMedia 기반 제한 기능)
```

## 빌드 / 설치 파일

```bash
npm run build:win     # release/CaptureMaster Setup 1.0.0.exe  (NSIS, 프로젝트 루트에도 복사)
npm run build:mac     # release/CaptureMaster-1.0.0.dmg          (macOS 에서 실행)
npm run build:linux   # release/*.AppImage, *.deb                 (Linux 에서 실행)
```

아이콘은 `assets/icon.svg`(앱)와 `assets/file-icon.svg`(.cmcap 문서)에서 `npm run generate:icons` 로
ico / icns / png 세트가 생성됩니다. 설치 파일·언인스톨러·바로가기 모두 같은 아이콘을 씁니다.

### 설치 동작

- **Windows (NSIS)** — 이미 설치된 버전이 있으면 완전히 삭제한 뒤 설치합니다. 이전 설치의 데이터(설정·최근 파일·창 상태)가 남아 있으면 삭제 여부를 묻습니다(무인 설치는 유지). `.cmcap` 형식을 별도 아이콘과 함께 등록하고, 바탕화면/시작 메뉴 바로가기를 선택할 수 있습니다. 설치 언어에 따라 한국어/영어로 표시됩니다.
- **Linux (.deb)** — `dpkg -i` 로 재설치 시 파일을 교체하고, `after-install.sh` 가 `.cmcap` MIME 타입과 문서 아이콘을 등록합니다. 패키지 관리자는 대화가 불가능하므로, 남아 있는 이전 데이터 삭제 여부는 **앱이 처음 실행될 때** 묻습니다(`~/.config/CaptureMaster`).
- **macOS (.dmg)** — 앱을 Applications 로 끌어 넣습니다. 이전 데이터 삭제 여부는 Linux 와 같이 첫 실행 때 묻습니다. 화면 기록 권한(시스템 설정 → 개인 정보 보호)이 필요합니다.
- **Ubuntu Wayland** — 캡처/녹화 시 시스템의 화면 공유 포털 대화상자가 뜨며, 허용한 화면이 캡처됩니다.

## 단축키

| 키 | 동작 |
|---|---|
| Ctrl+N / Ctrl+Shift+W / Ctrl+Shift+R | 화면 / 창 / 영역 캡처 |
| Ctrl+Shift+V | 녹화 시작 / 중지 |
| Ctrl+O · Ctrl+L · Ctrl+S · Ctrl+Shift+S · Ctrl+E · Ctrl+P | 열기 · URL 열기 · 저장 · 다른 이름으로 · 내보내기 · 인쇄 |
| Ctrl+Z / Ctrl+Y · Ctrl+C / Ctrl+X / Ctrl+V · Ctrl+D · Delete | 실행 취소/다시 실행 · 복사/잘라내기/붙여넣기 · 복제 · 삭제 |
| Ctrl+휠 · Ctrl+= / Ctrl+- · Ctrl+0 · Ctrl+1 | 확대/축소 · 창에 맞춤 · 실제 크기 |
| V P R O A L T H M N C | 도구 선택 · 펜 · 사각형 · 타원 · 화살표 · 직선 · 텍스트 · 형광펜 · 모자이크 · 번호 · 자르기 |
| Enter / Esc · 방향키(+Shift) · Ctrl+Tab · Ctrl+W | 자르기 적용 / 선택 해제 · 주석 이동 · 탭 전환 · 탭 닫기 |
| Ctrl+, · F1 | 설정 · 프로그램 정보 |

## 구조

```
electron/   main.js(창·프로토콜·종료 흐름) ipc.js(파일·인쇄·클립보드·창) dialogs.js(독립 다이얼로그 창)
            capture.js(desktopCapturer) preload.js(contextBridge)
src/        App.jsx(오케스트레이션) DialogHost.jsx(다이얼로그 창 진입점) i18n.js themes.js styles.css
  lib/      document.js(.cmcap 모델) history.js(Undo/Redo) render.js(주석 렌더/히트테스트) image.js
            capture.js(창 프레임 그랩·MediaRecorder) platform.js(Electron/웹 어댑터) settings.js fonts.js
  components/ Editor.jsx(캔버스 편집기) Toolbar.jsx chrome.jsx(타이틀바·탭·상태바) common.jsx VideoView.jsx
  dialogs/  SettingsDialog SimpleDialogs(About/Error/Progress/Confirm/Prompt) CaptureDialogs(Print/Sources/Recorder/Region)
build/      installer.nsh(Windows) linux/(MIME 등록 스크립트)   scripts/   아이콘·빌드정보·설치파일 복사·smoke
test/       단위 테스트(node --test) · smoke/ (실제 Electron 앱을 스크립트로 구동)
```

## 테스트

```bash
npm test          # 단위 테스트: history / settings / document / ico
npm run build && npm run smoke   # 실제 앱을 띄워 캡처·주석·저장·다이얼로그·영역·녹화 시나리오 실행, .smoke/*.png 스크린샷
```

---

**CaptureMaster** — screen capture & recording for Windows, macOS and Linux.
Author: SHKWON (knix008@naver.com) · License: MIT
