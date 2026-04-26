# GTK Video Player in C

C 언어 + GTK3 + GStreamer 기반 동영상 플레이어입니다.
로컬 파일, YouTube 링크, RTSP 링크 재생을 지원합니다.

## 지원 기능
- 로컬 동영상 파일 재생
- YouTube 링크 재생 (WebKit 임베드 WebView)
- RTSP 링크 재생
- `Play`, `Pause`, `Stop` 제어
- `Play`, `Pause`, `Stop` 아이콘 버튼
- 볼륨 슬라이더 제어
- 현재 시간 / 총 시간 표시
- 프로그레스 바 표시 및 시킹(특정 구간부터 재생)
- 동영상 영역 클릭으로 재생/일시정지 토글
- 일시정지 시 화면 중앙 Pause 마크, 재생 전환 시 Play 마크 표시
- YouTube/RTSP 링크 입력 시 Download 버튼 활성화 (재생 중 병행 다운로드 가능)
- 로그 뷰어

## 의존성 확인 및 설치 (Linux / macOS)
프로젝트 루트에서 아래 명령을 실행하세요.

```bash
make deps-check
make deps-install
```

의존성을 분리 설치할 수도 있습니다.

```bash
make deps-install-core
make deps-install-youtube
```

macOS에서 `pkg-config` 모듈을 찾지 못하면 아래를 실행한 뒤 다시 빌드하세요.

```bash
export PKG_CONFIG_PATH="$(brew --prefix)/lib/pkgconfig:$(brew --prefix)/share/pkgconfig"
```

## 빌드 및 실행
```bash
make build
make run
```

실행 파일: `./rtspclient`

## 소스 파일
- `main.c`: 앱 진입점, core/UI 연결
- `media_core.c`, `media_core.h`: 재생/URL 처리 로직 (GUI 비의존)
- `youtube_service.c`, `youtube_service.h`: YouTube 재생/다운로드 전용 로직
- `app_ui.c`, `app_ui.h`: GTK GUI 코드
- `Makefile`: 의존성 확인/설치, 빌드, 실행

## 참고
- YouTube 재생은 WebKit WebView를 사용합니다.
- YouTube 다운로드는 `yt-dlp`를 사용합니다.

## 사용 방법
1. 입력창에 파일 경로 또는 URL(YouTube/RTSP)을 입력합니다.
2. `링크 열기` 버튼으로 링크를 재생합니다.
3. `파일 선택` 버튼으로 로컬 파일을 선택 후 재생합니다.
4. `Play`, `Pause`, `Stop` 버튼으로 제어합니다.
5. 프로그레스 바를 이동한 뒤 놓으면 해당 위치로 시킹됩니다.
6. 동영상 영역 클릭 시 재생/일시정지가 토글됩니다.
7. 하단 `Log` 영역에서 상태/오류 메시지를 확인합니다.
