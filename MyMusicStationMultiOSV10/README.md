# My Music Station

React, Vite, Tauri 기반의 웹/데스크톱 음악 플레이어입니다. 로컬 음악 파일과 원격 오디오 URL을 재생하고, Web Audio API 기반 스펙트럼 시각화와 분리된 테마 선택을 제공합니다.

## 주요 기능

- 웹 브라우저 실행 및 Windows/macOS/Linux 데스크톱 패키징 지원
- MP3, FLAC, WAV, OGG, AAC, M4A, WebM 등 브라우저가 지원하는 오디오 포맷 재생
- 로컬 파일 다중 추가 및 원격 오디오 URL 추가
- 음악 폴더 열기 및 마지막으로 연 폴더 기억 후 다시 열기
- `.mmspl` 플레이리스트 파일 저장/불러오기
- 재생, 일시정지, 정지, 이전/다음 트랙, 탐색, 볼륨 제어
- 실시간 스펙트럼 시각화
- 고정 960x560 크기, 스크롤 없는 컴팩트 GUI, 프레임리스 창, 커스텀 툴바
- Dark, Modern, Classic, Fancy 및 사용자 추가 테마 선택
- 한국어/영어 UI 전환
- Windows 설치 시 `.mmspl` 파일 형식 등록, 시작 메뉴 폴더, 설치 전 기존 앱 제거 훅 지원
- 데스크톱 앱 종료 버튼은 창을 숨기고, 실제 종료는 시스템 트레이 메뉴에서 수행

## 문서

- [Architecture.md](Architecture.md): 앱 구조와 런타임 흐름
- [UsersGuide.md](UsersGuide.md): 사용자 기능 안내
- [music](music): 테스트 또는 배포 전 음악 파일을 둘 수 있는 로컬 폴더

## 프로그램 실행

```bash
npm start
```

이미 빌드된 데스크톱 앱을 바로 실행합니다. 빌드 산출물이 없으면 먼저 `npm run build:win`, `npm run build:mac`, `npm run build:linux` 중 현재 OS에 맞는 명령을 한 번 실행하세요.

개발 모드로 Tauri 앱을 실행하려면 다음 명령을 사용합니다.

```bash
npm run desktop:dev
```

## 웹 개발 서버

```bash
npm run dev
```

## 웹 빌드

```bash
npm run build:web
```

빌드 결과는 `dist` 폴더에 생성됩니다.

## Windows 설치 파일 생성

```bash
npm run build:win
```

생성 결과는 다음 위치에 있습니다.

- `src-tauri/target/release/bundle/msi/My Music Station_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/My Music Station_0.1.0_x64-setup.exe`

## macOS 설치 파일 생성

```bash
npm run build:mac
```

macOS에서 실행하면 `.app`과 `.dmg` 번들을 생성합니다.

## Linux 설치 파일 생성

```bash
npm run build:linux
```

Linux에서 실행하면 AppImage, DEB, RPM 번들을 생성합니다.

## 호환 명령어

```bash
npm run build
npm run desktop:dev
npm run desktop:build
```

기존 명령어도 유지되어 있습니다. `npm run build`는 `npm run build:web`과 같습니다.
