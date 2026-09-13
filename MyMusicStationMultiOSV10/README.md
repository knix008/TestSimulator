# My Music Station V1.0.0

React, Vite, TypeScript, Tauri 2 기반의 멀티 OS 음악 플레이어입니다. 로컬 파일·원격 오디오 URL·비디오/미디어 링크(오디오 추출)를 재생하고, 스펙트럼 시각화·테마·배경·축소 모드·형식 변환/저장을 제공합니다.

## 주요 기능

- Windows / macOS / Linux 데스크톱 패키징 (Tauri 2)
- 재생 포맷: MP3, FLAC, WAV, OGG, AAC, M4A, WebM, OPUS, WMA, AIFF 등
- 네이티브 다이얼로그로 파일·폴더·플레이리스트 추가 (경로 보존)
- URL 추가: 직접 오디오는 **스트리밍**, 비디오/미디어 링크는 **오디오만 추출** 후 재생 (yt-dlp + ffmpeg)
- 추출한 오디오는 앱 캐시(`remote-audio/`)에 보관 → 재실행 시 **재다운로드 없이 재생**, 캐시가 없으면 재생 시점에 다시 다운로드
- 링크 곡 우클릭 → 재생 / 형식·음질 선택 저장(**로컬 파일로 전환**) / 목록에서 제거
- 재생 중인 곡을 목록에서 제거하면 즉시 정지 후 다음 곡 재생
- 형식 변환 저장 (ffmpeg): MP3 / WAV / FLAC / OGG / M4A, 음질 설정 지원
- `.mplist` 플레이리스트 저장·불러오기, 세션 자동 복원 (로컬 파일·링크 모두, `localStorage` + 앱 설정 폴더 `session-playlist.json`)
- 재생 / 일시정지 / 정지 / 이전·다음 / 탐색 / 볼륨
- 스펙트럼 시각화 (여러 표시 방식, 색 방향 전환)
- 앨범 아트·메타데이터 (`music-metadata`)
- 고정 창 **835×496**, 축소 모드 **340×180** (프레임리스, 앱 아이콘 표시)
- 테마·언어(한/영)·배경 이미지·패널 투명도
- 시스템 트레이 (선택), 단일 인스턴스, 파일 연결로 열기
- Windows 설치 시 `.mplist`·오디오 연결 등록(기본 플레이어 여부 선택)

## 문서

- [Architecture.md](Architecture.md) — 구조와 런타임 흐름
- [UsersGuide.md](UsersGuide.md) — 사용자 기능 안내
- [asset](asset) — 앱 / 플레이리스트 / 트레이 아이콘 SVG
- [music](music) — 로컬 테스트용 음악 (내용은 git 제외)
- [background](background) — 기본 배경 이미지

## 프로그램 실행

```bash
npm start
```

`src-tauri/target/release`의 릴리스 바이너리를 실행합니다. 소스가 더 새우면 데스크톱 빌드 후 실행합니다. 이미 빌드된 바이너리만 쓰려면:

```bash
npm start -- --no-build
```

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

## 설치 파일 생성

`scripts/build-desktop.mjs`가 `CARGO_TARGET_DIR`을 `src-tauri/target`으로 고정하고, 빌드 전에 `ffmpeg`·`yt-dlp`를 준비한 뒤 번들을 만들어 프로젝트 루트로 복사합니다.

```bash
npm run build:win     # Windows NSIS → My Music Station V1.0.0_*_x64-setup.exe
npm run build:mac     # macOS .dmg
npm run build:linux   # AppImage
npm run copy:installers
```

원본 번들: `src-tauri/target/release/bundle/`

이미 설치한 앱을 갱신하려면 루트의 setup으로 **다시 설치**하세요. `npm start`만으로는 Program Files 설치본을 덮어쓰지 않습니다.

## 외부 도구

| 도구 | 용도 | 위치 |
| --- | --- | --- |
| ffmpeg | 형식 변환·추출 후처리 | `src-tauri/ffmpeg/` (빌드 시 fetch, git 제외) |
| yt-dlp | URL/미디어 오디오 추출 | `src-tauri/yt-dlp/` (빌드 시 fetch, git 제외) |

릴리스 EXE 옆에 함께 복사됩니다.

## 앱이 쓰는 데이터 위치

| 내용 | 위치 (Windows) |
| --- | --- |
| UI 설정 / 트레이 설정 | `%APPDATA%\<앱 식별자>\app-settings.json`, `shell-settings.json` |
| 세션 플레이리스트 | `%APPDATA%\<앱 식별자>\session-playlist.json` |
| 링크 추출 오디오 캐시 | `%LOCALAPPDATA%\<앱 식별자>\remote-audio\<URL 해시>.m4a` |
emote-audio\<URL 해시>.m4a` |

macOS / Linux는 Tauri의 `appConfigDir` / `appCacheDir`에 해당하는 경로를 씁니다. 캐시 파일은 해당 곡을 목록에서 제거할 때 함께 삭제됩니다.

## 기타 명령

```bash
npm run build           # = build:web
npm run desktop:build   # OS 기본 번들로 build-desktop
npm run lint
```
