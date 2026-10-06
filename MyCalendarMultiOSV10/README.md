# 마이 캘린더

바탕화면에 두는 투명 캘린더입니다. Web, Linux, macOS, Windows에서 같은 화면을 사용합니다.

## 기능

- 제목 표시줄 없이 툴바로 달을 이동하고, 창을 드래그합니다.
- 배경 투명도를 0%에서 85%까지 조절합니다. 글자는 읽을 수 있게 유지됩니다.
- 라이트 테마 20종, 다크 테마 20종.
- 한국어와 English.
- 국가별 공휴일. [Nager.Date](https://date.nager.at)에서 인터넷으로 확인하고, 실패하면 마지막 확인 내용을 보여 줍니다.
- 설정 창과 프로그램 정보 창.
- 데스크톱에서는 작업 표시줄 대신 시스템 트레이에만 표시됩니다. 창을 닫으면 트레이로 숨고, 종료는 트레이 메뉴에서 합니다.
- 시스템 시작 시 자동 실행을 설정할 수 있습니다.

## 설치 언어

처음 실행할 때 한국어 또는 English를 고릅니다. 설치 프로그램에서 이미 고른 경우에는 그 언어로 바로 열립니다.

- Windows: NSIS 설치 파일이 설치 전에 언어 선택 창을 띄웁니다. 선택한 언어는 앱 폴더의 `install-language.txt`에 저장됩니다.
- Linux: `installer/linux/install.sh`
- macOS: `installer/macos/install.command`
- Web: 첫 화면에서 고릅니다.

## 실행

```bash
npm install
npm test
npm run dev
```

브라우저 주소는 `http://localhost:1420` 입니다. 페이지 배경은 투명도가 보이도록 깔아 둔 예시이고, 데스크톱 앱에서는 실제 바탕화면이 비칩니다.

## 데스크톱 빌드

[Tauri 사전 요구 사항](https://tauri.app/start/prerequisites/)이 필요합니다. Windows는 WebView2, Linux는 WebKitGTK, macOS는 Xcode 명령줄 도구가 필요합니다.

```bash
npm run icon
npm run desktop
npm run build:windows
npm run build:linux
npm run build:macos
```

각 명령은 그 운영체제에서 실행합니다. Windows 설치 파일은 `src-tauri/target/release/bundle/nsis/`에 만들어집니다.
