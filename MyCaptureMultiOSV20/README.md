# MyCapture

화면 · 창 · 영역 캡처와 화면 녹화 프로그램 (Windows · macOS · Linux, Tauri 2).

- 캡처: 모니터 / 모든 화면 / 창 / 드래그 영역 → **JPG · PNG · GIF · AVIF · WEBP · TIFF · BMP**
- 클립보드로 복사(캡처할 때 자동 · 방금 캡처 · 기록 · 보기 화면), **다른 형식으로 저장**(기록 · 보기 화면, AVIF 포함)
- 캡처하면 자동 저장되고 캡처 기록에 아래로 쌓임 (설정에서 "매번 위치 묻기" 가능)
- 오른쪽 클릭 메뉴(아이콘, 위치별 항목)
- 캡처 기록 패널: 썸네일 목록(동영상 표시), 고르면 크게 보기(이미지 확대 · 축소, 동영상 재생 · 일시정지 · 정지), 개별 · 전체 삭제(목록에서만, 파일은 유지)
- 창 위치 · 크기 · 최대화 기억
- 테마: 어두운 20 · 밝은 20 · 사용자 정의 · 시스템 따르기 (🎨 누르면 다음 테마, ▾ 목록, 설정의 테마 탭)
- 설정 · 정보 · 확인 · 테마 목록은 메인 밖으로 옮길 수 있는 별도 창, 메인을 닫으면 함께 종료
- 녹화: **MP4 · WebM**, 일시정지/재개, 시스템 오디오 + 마이크(장치 · 입력 크기 · 레벨 미터 · 테스트 녹음), 전체 화면 녹화 제어판
- MyCapture 창 자신은 MyCapture 의 캡처 · 녹화에 찍히지 않음 (다른 캡처 프로그램으로는 시작 화면까지 찍을 수 있음)
- 시작 화면: 옮기고 크기를 바꾸는 카드 보드(빠른 시작 · 최근 캡처 · 요령 · 테마), 자동 정렬, 시작할 때 표시 여부
- 타이틀바에 시작 화면 · 왼쪽 패널 · 오른쪽 패널 접기 버튼, 사용 설명서 창(목차 · 찾기 · 따라 하기)
- 한국어 / English 전환 (국기 버튼), 설정 탭, 접는 대상 패널, 프레임 없는 창

사용법은 [doc/UsersGuide.md](doc/UsersGuide.md) (영어 [doc/UsersGuide.en.md](doc/UsersGuide.en.md)), 처음이라면 [doc/Tutorial.md](doc/Tutorial.md), 구조는 [ARCHITECTURE.md](ARCHITECTURE.md).

## 준비

Node.js 20.19+ / 22.12+, Rust stable, 그리고 [Tauri 2 사전 요구 사항](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
```

## 실행

```sh
npm start            # tauri dev (Vite :1420 + 데스크톱 앱). 이 프로젝트의 Vite 가 1420 에 남아 있으면 먼저 정리
npm run dev          # 브라우저 미리보기 (UI 만, 네이티브 기능 없음)
```

## 테스트

```sh
npm test                      # 전체: JS 단위 · Rust 단위 · Rust 통합(실제 화면) · E2E(실제 앱)
npm test -- --quick           # JS + Rust 단위만
npm test -- --only e2e        # 분류 고르기: js, rust, integration, e2e
npm test -- --skip e2e
npm run test:unit | test:capture | test:e2e
```

진행 중에는 테스트마다 ✔/✖ 와 실행 시간이 표시되고, 끝나면 분류별로 실패 우선 · 느린 순으로 정렬한 목록과 요약 표가 나옵니다. 결과는 `test-results/results.json` 에도 저장됩니다.
통합 테스트와 E2E 는 데스크톱 세션이 필요하고, E2E 는 Windows(WebView2) 에서 실행됩니다. `ffprobe` 가 있으면 녹화 파일의 코덱 · 길이 · 크기도 검사합니다.

## 정리

```sh
npm run clean                # 빌드 결과 · Rust target · 설치 파일 · 테스트 결과 · Vite 캐시
npm run clean:all            # 위 + node_modules (다음 실행 · 빌드 전에 npm install)
npm run clean -- --dry-run   # 지울 목록과 크기만 보기
```

모두 .gitignore 에 있는 생성물이라 소스 · doc/ (그림 포함) · assets/ 는 건드리지 않습니다. 실행 중인 MyCapture 가 파일을 잡고 있으면 그 항목은 실패로 표시되니 앱을 닫고 다시 실행하세요.

## 설치 파일

```sh
npm run build:win      # MyCapture-Setup-1.0.2.exe   (Windows NSIS)
npm run build:mac      # MyCapture-1.0.2-<arch>.dmg  (macOS)
npm run build:linux    # MyCapture-1.0.2-<arch>.deb / .rpm / .AppImage
npm run build:all      # 지금 OS 에서 만들 수 있는 전부
```

설치 파일은 `release/` 에 만들어지고 프로젝트 루트에도 복사됩니다. Tauri 는 교차 빌드를 하지 않으므로 각 OS 의 설치 파일은 그 OS 에서 만듭니다. 빌드는 이 폴더에서 띄운 MyCapture 프로세스를 먼저 종료합니다.

Windows 설치 프로그램: 한국어/영어 선택, 관리자 권한 없이 사용자 폴더에 설치(경로 변경 가능), 시작 메뉴 · 바탕화면 바로 가기, 기존 설치 제거 후 설치, 이전 설정 데이터 삭제 여부 질문.

아이콘을 바꾸려면 `assets/icon.svg` 를 고친 뒤 `npm run build:icons`.

## 폴더

```text
assets/            프로그램 아이콘 (icon.svg 원본, png · ico · icns)
src/               UI (app.js 메인 창, overlay.js 영역 선택, recbar.js 녹화 제어판)
  domain/          순수 로직     platform/  Rust 경계 · 녹화 · 마이크
src-tauri/         Rust 백엔드, Tauri 설정, NSIS 훅과 설치 이미지(windows/)
scripts/           build.mjs 설치 파일, test.mjs 테스트 실행기, render-icons.mjs
doc/               사용 설명서 · 따라 하기 (한국어 · 영어, 앱의 📖 창이 그대로 보여 줌)
test/unit/         JS 단위     test/e2e/  앱 E2E     test/capture_integration.rs
.azure/            초기 프로젝트 계획 (참고용)
```
