# My Music Station V1.0.0

React, Vite, TypeScript, Tauri 2 기반의 멀티 OS 음악 플레이어입니다. 로컬 파일·원격 오디오 URL·비디오/미디어 링크(오디오 추출)를 재생하고, 스펙트럼 시각화·테마·배경·축소 모드·형식 변환/저장을 제공합니다.

## 주요 기능

- Windows / macOS / Linux 데스크톱 패키징 (Tauri 2)
- 재생 포맷: MP3, FLAC, WAV, OGG, AAC, M4A, WebM, OPUS, WMA, AIFF 등
- 네이티브 다이얼로그로 파일·폴더·플레이리스트 추가 (경로 보존)
- URL 추가(툴바 **링크 열기** 또는 목록 URL 칸): 직접 오디오는 **스트리밍**, 비디오/미디어 링크는 **오디오만 추출** 후 재생 (yt-dlp + ffmpeg). **파일로 저장하지 않음**
- 추출한 오디오는 앱 캐시(`remote-audio/`)에 보관 → 재실행 시 **재다운로드 없이 재생**, 캐시가 없으면 재생 시점에 다시 다운로드
- 링크 곡 우클릭 → 재생 / 목록에서 제거 (링크 다운로드·저장 없음)
- 재생 중인 곡을 목록에서 제거하면 즉시 정지 후 다음 곡 재생
- 형식 변환 저장 (ffmpeg, **로컬 파일만**): MP3 / WAV / FLAC / OGG / M4A
- `.mplist` 플레이리스트 저장·불러오기, 세션 자동 복원 (로컬 파일·링크 모두, `localStorage` + 앱 설정 폴더 `session-playlist.json`)
- 재생 / 일시정지 / 정지 / 이전·다음 / 탐색 / 볼륨(**1% 단위**)
- 스펙트럼 시각화 (여러 표시 방식, 색 방향 전환)
- 앨범 아트·메타데이터 (`music-metadata`)
- 고정 창 **835×496**, 축소 모드 **340×180** (프레임리스, 앱 아이콘 표시)
- 테마·언어(한/영)·배경 이미지·패널 투명도
- 시스템 트레이 (선택), 단일 인스턴스, 파일 연결로 열기
- Windows 설치 시 `.mplist`·오디오 연결 등록(기본 플레이어 여부 선택). 탐색기 아이콘은 **확장자별** (`mp3.ico`, `wav.ico`, …)
- 커버가 없으면 앱·목록에 포맷별 3D 스쿼클 아이콘 표시 (`asset/audio-icons/`)

## 문서

- [Architecture.md](Architecture.md) — 구조와 런타임 흐름
- [UsersGuide.md](UsersGuide.md) — 사용자 기능 안내
- [asset](asset) — 앱 / 플레이리스트 / 포맷별 오디오 / 트레이 아이콘 SVG (ICO는 `src-tauri/*-icons/`)
- [music](music) — 로컬 테스트용 음악 (내용은 git 제외)
- [background](background) — 기본 배경 이미지

## 프로그램 실행

```bash
npm start
```

`src-tauri/target/release`의 릴리스 바이너리를 실행합니다. 소스가 더 새우면 실행 파일만 다시 컴파일(`npm run build:bin`, 설치 파일은 만들지 않음)한 뒤 실행합니다. 이미 빌드된 바이너리만 쓰려면:

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

`scripts/build-desktop.mjs`가 `CARGO_TARGET_DIR`을 `src-tauri/target`으로 고정하고, 빌드 전에 `scripts/ensure-toolchain.mjs`로 필요한 것을 준비한 뒤 번들을 만들어 프로젝트 루트로 복사합니다.

### 빌드 준비물 자동 다운로드

프로젝트는 `node_modules`·`src-tauri/target`·Rust 툴체인 없이 공유되므로(용량 때문에 압축 제외), 빌드/`npm start` 시 없는 것을 자동으로 받습니다. 미리 확인만 하려면 `npm run setup`.

| 항목 | 없을 때 |
| --- | --- |
| `node_modules` (Tauri CLI 포함) | `npm install` 자동 실행 |
| Rust (cargo/rustc) | rustup 자동 설치 (`~/.cargo`, 관리자 권한 불필요) |
| Windows MSVC Build Tools | winget으로 설치 시도 (UAC 필요), 실패 시 설치 안내 출력 |
| ffmpeg | 로컬 설치본 복사 → 없으면 [BtbN 빌드](https://github.com/BtbN/FFmpeg-Builds) zip 다운로드·압축 해제 (macOS: evermeet.cx, Linux: johnvansickle 정적 빌드) |
| yt-dlp | 로컬 설치본 복사 → 없으면 GitHub 최신 릴리스 다운로드 |

환경 변수 `SKIP_DOWNLOAD=1`은 ffmpeg/yt-dlp 다운로드를, `SKIP_TOOLCHAIN_INSTALL=1`은 툴체인 설치를 건너뛰고 안내만 합니다. `node scripts/fetch-ffmpeg.mjs --download`(또는 `fetch-ytdlp.mjs --download`)로 최신 바이너리를 강제로 다시 받을 수 있습니다.

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
| ffmpeg | 형식 변환·추출 후처리 | `src-tauri/ffmpeg/` (빌드 시 로컬 복사 또는 다운로드, git 제외) |
| yt-dlp | URL/미디어 오디오 추출 | `src-tauri/yt-dlp/` (빌드 시 로컬 복사 또는 다운로드, git 제외) |

릴리스 EXE 옆에 함께 복사됩니다.

## 앱이 쓰는 데이터 위치

| 내용 | 위치 (Windows) |
| --- | --- |
| UI 설정 / 트레이 설정 | `%APPDATA%\<앱 식별자>\app-settings.json`, `shell-settings.json` |
| 세션 플레이리스트 | `%APPDATA%\<앱 식별자>\session-playlist.json` |
| 링크 추출 오디오 캐시 | `%LOCALAPPDATA%\<앱 식별자>\remote-audio\<URL 해시>.m4a` |

macOS / Linux는 Tauri의 `appConfigDir` / `appCacheDir`에 해당하는 경로를 씁니다. 캐시 파일은 해당 곡을 목록에서 제거할 때 함께 삭제됩니다.

## 기타 명령

```bash
npm run build           # = build:web
npm run build:bin       # 릴리스 실행 파일만 컴파일 (설치 파일 없음, npm start가 사용)
npm run desktop:build   # OS 기본 번들로 build-desktop
npm run setup           # 빌드 준비물 확인·다운로드
npm run clean           # 빌드 산출물 삭제 (dist, src-tauri/target, 루트 설치 파일, tsbuildinfo)
npm run clean -- --all  # + node_modules, 다운로드한 ffmpeg/yt-dlp 까지 삭제 (공유용 최소 크기)
npm run lint
```

## 아이콘 다시 만들기

SVG가 원본입니다. 래스터/ICO는 아래 스크립트가 `npx tauri icon` 산출물 중 **번들에 쓰는 파일만** 남깁니다.

```bash
node scripts/make-app-icon.mjs       # 앱 아이콘 + 트레이 PNG
node scripts/make-icon-source.mjs    # public/favicon.svg (앱 SVG와 동기화)
node scripts/make-audio-icon.mjs     # 포맷별 SVG + Explorer ICO
node scripts/make-playlist-icon.mjs  # .mplist Explorer ICO
```

`npx tauri icon`이 만드는 `.build` / `.preview` / Android·iOS 폴더는 git에 넣지 않습니다 (`.gitignore`).
