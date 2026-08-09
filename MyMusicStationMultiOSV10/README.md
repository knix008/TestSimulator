# My Music Station

React, Vite, TypeScript, Tauri 기반의 멀티 OS 음악 플레이어입니다. 로컬 음악 파일과 원격 오디오 URL을 재생하고, Web Audio API 기반 스펙트럼 시각화와 테마/언어 전환을 제공합니다.

## 주요 기능

- Windows / macOS / Linux 데스크톱 패키징 (Tauri 2)
- MP3, FLAC, WAV, OGG, AAC, M4A, WebM, OPUS 등 WebView가 지원하는 오디오 포맷 재생
- 네이티브 다이얼로그로 파일/폴더 추가 (경로 보존 → 플레이리스트 저장 가능)
- 음악 폴더 열기 및 마지막 폴더 기억 후 다시 열기
- `.mplist` 플레이리스트 저장/불러오기
- 재생, 일시정지, 정지, 이전/다음 트랙, 탐색, 볼륨 제어
- 실시간 스펙트럼 시각화 (왼쪽 파랑 → 오른쪽 빨강)
- 앨범 아트·메타데이터 표시 (`music-metadata`)
- 고정 1100×544 프레임리스 창, 커스텀 툴바, 하단 상태바
- Dark / Modern / Classic / Fancy 및 사용자 추가 테마
- 한국어 / 영어 UI 전환
- 시스템 트레이 아이콘 (창 닫기 = 숨김, 종료는 트레이 Quit)
- Windows 설치 시 `.mplist` 연결, 시작 메뉴 등록, 설치 전 기존 앱 완전 제거

## 문서

- [Architecture.md](Architecture.md): 앱 구조와 런타임 흐름
- [UsersGuide.md](UsersGuide.md): 사용자 기능 안내
- [asset](asset): 앱 / 플레이리스트 / 트레이 아이콘 SVG 원본
- [music](music): 로컬 테스트용 음악 폴더 (내용은 git 제외)

## 프로그램 실행

```bash
npm start
```

`src-tauri/target/release`의 릴리스 EXE를 실행합니다. 소스가 EXE보다 새우면 **설치 패키지까지 같은 빌드**로 다시 만든 뒤 실행합니다 (`build:win`과 동일 경로).

개발 모드 (핫 리로드):

```bash
npm run desktop:dev
```

## 웹 개발 / 빌드

```bash
npm run dev
npm run build:web
```

웹 빌드 결과는 `dist`에 생성됩니다.

## 설치 파일 생성 (npm start와 동일 바이너리)

`npm start`와 설치본은 **같은 release 바이너리**에서 나옵니다. `scripts/build-desktop.mjs`가 `CARGO_TARGET_DIR`을 저장소 로컬 `src-tauri/target`으로 고정한 뒤 번들을 만들고 루트로 복사합니다.

```bash
npm run build:win     # Windows NSIS + MSI → 프로젝트 루트 복사
npm run build:mac     # macOS .app + .dmg
npm run build:linux   # AppImage + DEB + RPM
npm run copy:installers   # bundle 산출물만 루트로 다시 복사
```

Windows 예시 (루트에 복사됨):

- `My Music Station_0.1.0_x64-setup.exe`
- `My Music Station_0.1.0_x64_en-US.msi`

원본 번들 경로: `src-tauri/target/release/bundle/`

이미 설치한 앱을 최신과 맞추려면, 루트의 setup.exe로 **다시 설치**하세요. `npm start`만으로는 Program Files의 기존 설치본을 덮어쓰지 않습니다.

## 기타 명령

```bash
npm run build           # = build:web
npm run desktop:build   # OS 기본 번들로 build-desktop
npm run lint
```
