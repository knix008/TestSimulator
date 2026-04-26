# GTK Video Player (C / GStreamer)

C 언어 + GTK3 + GStreamer 기반 동영상 플레이어입니다.  
로컬 파일, YouTube 링크, RTSP 링크 재생 및 다운로드를 지원합니다.

## 지원 기능

- 로컬 동영상 파일 재생
- YouTube 링크 재생 (GStreamer + yt-dlp 스트림 URL 추출 방식)
- RTSP 링크 재생
- `Play`, `Pause`, `Stop` 아이콘 버튼 제어
- 볼륨 슬라이더 + 숫자(%) 표시
- 현재 시간 / 총 시간 표시
- 프로그레스 바 표시 및 시킹
- 동영상 영역 클릭으로 재생/일시정지 토글
- YouTube/RTSP 링크 입력 시 Download 버튼 활성화
- Download 클릭 시 저장 위치 선택 후 mp4로 저장
- 다운로드 중 버튼 비활성화 → 완료/실패 시 재활성화
- 다운로드 완료/실패 팝업 알림
- 로그 뷰어

## YouTube 재생 방식

YouTube URL 입력 후 `링크 열기`를 누르면:

1. 백그라운드 스레드에서 `yt-dlp -g -f b` 명령으로 스트림 URL을 추출합니다.
2. 추출된 URL(HLS/DASH 등)을 GStreamer `playbin`으로 직접 재생합니다.
3. `yt-dlp`로 URL 추출 실패 시, 임시 파일로 다운로드 후 재생합니다.

> **참고**: yt-dlp가 반환하는 YouTube 스트림 URL은 `.webm` 또는 `.mp4` 컨테이너를
> 사용하는 직접 링크입니다. GStreamer는 이를 디코딩하여 재생합니다.

## webm 파일이란?

`.webm`은 Google이 개발한 오픈소스 비디오 컨테이너 포맷입니다.  
YouTube는 내부적으로 webm(VP9/VP8 코덱) 형식으로 영상을 저장합니다.  
`yt-dlp`로 YouTube 영상을 받으면 원본이 webm인 경우가 많으며,  
이 프로젝트의 다운로드 기능은 `--merge-output-format mp4`를 사용해  
최종 파일을 mp4로 자동 변환하여 저장합니다.

## 의존성 설치 (Linux / macOS)

프로젝트 루트에서 아래 명령을 실행하세요.

```bash
make deps-install
make deps-check
```

`make`는 의존성 점검 후 자동 설치를 시도합니다.  
Linux 비대화형 셸에서는 자동 설치가 중단되므로, 인터랙티브 터미널에서  
`make deps-install`을 먼저 실행한 뒤 `make`를 실행하세요.

의존성을 분리 설치할 수도 있습니다.

```bash
make deps-install-core     # GTK3, GStreamer 라이브러리
make deps-install-youtube  # yt-dlp
```

macOS에서 `pkg-config` 모듈을 찾지 못하면:

```bash
export PKG_CONFIG_PATH="$(brew --prefix)/lib/pkgconfig:$(brew --prefix)/share/pkgconfig"
```

### YouTube 다운로드 시 ffmpeg 필요

`bestvideo+bestaudio` 포맷을 mp4로 병합하려면 `ffmpeg`가 필요합니다.

```bash
sudo apt install ffmpeg        # Linux
brew install ffmpeg            # macOS
```

## 빌드 및 실행

```bash
make
make run
```

실행 파일: `./rtspclient`

## 사용 방법

1. 입력창에 파일 경로 또는 URL(YouTube/RTSP)을 입력합니다.
2. `링크 열기` 버튼으로 링크를 재생합니다.
   - YouTube: yt-dlp로 스트림 URL 추출 후 GStreamer로 재생
   - RTSP: GStreamer playbin으로 직접 재생
3. `파일 선택` 버튼으로 로컬 파일을 선택 후 재생합니다.
4. `Download` 버튼은 YouTube 또는 RTSP URL 입력 시 활성화됩니다.
   - 클릭 시 저장 위치를 선택하면 다운로드가 시작됩니다.
   - 다운로드 중에는 버튼이 비활성화되고, 완료 시 팝업으로 알립니다.
5. `Play`, `Pause`, `Stop` 버튼으로 재생을 제어합니다.
6. 프로그레스 바를 드래그하면 해당 위치로 시킹됩니다.
7. 하단 `Log` 영역에서 상태/오류 메시지를 확인합니다.
