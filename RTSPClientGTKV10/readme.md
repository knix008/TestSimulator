# GTK Video Player in C

C 언어 + GTK3 + GStreamer + WebKit 기반 동영상 플레이어입니다.
로컬 파일, YouTube 링크, RTSP 링크 재생을 지원합니다.

## 지원 기능
- 로컬 동영상 파일 재생
- YouTube 링크 재생 (WebKit 임베드 WebView)
- RTSP 링크 재생
- `Play`, `Pause`, `Stop` 아이콘 버튼 제어
- 볼륨 슬라이더 + 숫자(%) 표시
- 현재 시간 / 총 시간 표시
- 프로그레스 바 표시 및 시킹
- 동영상 영역 클릭으로 재생/일시정지 토글
- YouTube/RTSP 링크 입력 시 Download 버튼 활성화
- Download 클릭 시 저장 위치 선택
- 다운로드 완료/실패 팝업 알림
- 로그 뷰어

## 의존성 설치 (Linux / macOS)
프로젝트 루트에서 아래 명령을 실행하세요.

```bash
make deps-install
make deps-check
```

`make`는 의존성 점검 후 자동 설치를 시도합니다.  
Linux에서 비대화형 셸(비밀번호 입력 불가)에서는 자동 설치가 중단되므로, 인터랙티브 터미널에서 먼저 `make deps-install`을 실행한 뒤 `make`를 실행하세요.

의존성을 분리 설치할 수도 있습니다.

```bash
make deps-install-core
make deps-install-youtube
```

macOS에서 `pkg-config` 모듈을 찾지 못하면:

```bash
export PKG_CONFIG_PATH="$(brew --prefix)/lib/pkgconfig:$(brew --prefix)/share/pkgconfig"
```

참고: YouTube WebView 재생을 위해 WebKit 의존성(`libwebkit2gtk-4.0-dev` / `webkitgtk`)이 필요합니다.

## 빌드 및 실행
```bash
make
make run
```

실행 파일: `./rtspclient`

## 사용 방법
1. 입력창에 파일 경로 또는 URL(YouTube/RTSP)을 입력합니다.
2. `링크 열기` 버튼으로 링크를 재생합니다.
3. `파일 선택` 버튼으로 로컬 파일을 선택 후 재생합니다.
4. `Download` 버튼 클릭 후 저장 위치를 선택해 다운로드합니다.
5. `Play`, `Pause`, `Stop` 버튼으로 제어합니다.
6. 프로그레스 바를 이동한 뒤 놓으면 해당 위치로 시킹됩니다.
7. 하단 `Log` 영역에서 상태/오류 메시지를 확인합니다.
