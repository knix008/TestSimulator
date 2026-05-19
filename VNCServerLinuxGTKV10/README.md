# VNC Server for Linux (GTK3, C/C++)

Linux용 VNC 서버 GUI 애플리케이션입니다. **GTK3** 로 설정·시작 UI를 제공하고, **libvncserver**로 화면을 공유합니다. 캡처는 **GStreamer + xdg-desktop-portal(전체 화면)** 을 우선 사용하고, 실패 시 X11 폴백을 사용합니다.

## 요구 사항

- Linux (X11 세션, `DISPLAY` 환경 변수 설정)
- C++17 컴파일러 (`g++`), `make`, `pkg-config`
- 개발 패키지 — `make deps`로 설치 (아래 참고)

Wayland만 사용하는 환경에서는 **XWayland**가 있어야 할 수 있습니다.

## 빠른 시작

```bash
cd VNCServerLinuxGTKV10
make deps    # 개발 패키지 설치 (sudo 필요)
make         # 프로젝트 루트에 ./vncserver 생성
./vncserver  # 또는 make run
```

GUI에서 **Start** 를 누르면 처음 한 번 **화면 공유 허용** 대화상자가 뜰 수 있습니다(GNOME 등). **전체 화면/모니터** 를 선택해 허용하세요.

VNC 클라이언트 연결 예:

```bash
vncviewer localhost:5900
```

TigerVNC에서 `SetDesktopSize failed: 1` 로그가 보이면, 뷰어가 창 크기에 맞춰 **원격 해상도 변경**을 시도한 것이고 이 서버는 X11 화면 크기를 고정으로만 보냅니다(오류가 아님). 로그를 줄이려면:

```bash
vncviewer -RemoteResize=0 localhost:5900
```

**TightVNC Viewer**에서 화면이 깨지거나 비면, 뷰어 옵션에서 인코딩을 **ZRLE** 또는 **Raw**로 바꿔 보세요(서버는 libvncserver Tight 대신 ZRLE를 우선 사용합니다).

## Makefile 타깃

| 타깃 | 설명 |
|------|------|
| `deps` | Debian/Ubuntu/Fedora/Arch 개발 패키지 설치 |
| `deps-list` | 설치 대상 패키지 목록만 출력 |
| `all` (기본) | `./vncserver` 빌드 |
| `run` | 빌드 후 `./vncserver` 실행 |
| `clean` | `build/` 및 `./vncserver` 삭제 |

### Debian / Ubuntu 패키지 (`make deps`)

- `build-essential`, `pkg-config`
- `libgtk-3-dev`, `libvncserver-dev`, `libx11-dev`, `libxcomposite-dev`, `libxtst-dev`
- `libgstreamer1.0-dev`, `libgstreamer-plugins-base1.0-dev`, `gstreamer1.0-plugins-good`

## 프로젝트 구조

```
VNCServerLinuxGTKV10/
├── Makefile
├── README.md
├── vncserver          # 빌드 결과 (git 제외)
├── build/             # 중간 .o 파일 (git 제외)
├── include/
│   ├── gui_gtk.h    # GTK UI 진입점 (GTK 헤더 없음)
│   ├── vnc_core.h          # VNC 서버 API (GTK 없음)
│   └── capture_gstreamer.h # GStreamer / portal 캡처
└── src/
    ├── main.cpp              # 프로그램 진입점
    ├── gui_gtk.cpp           # GTK3 UI (다크 테마)
    ├── vnc_core.cpp          # libvncserver + X11 폴백 캡처/입력
    └── capture_gstreamer.cpp # portal PipeWire / ximagesrc 캡처
```

## 주요 기능

- **Status** — 연결 상태 LED(중지: 빨강, 실행: 녹색) + `Stopped` / `Running` 텍스트
- **Settings** — 포트, 비밀번호(선택), 원격 마우스·키보드 허용
- **Control** — 서버 시작 / 중지
- **Log** — 연결·오류 메시지

## 화면 캡처 방식

| 우선순위 | 방식 | 로그 예 |
|---------|------|---------|
| 1 | xdg-desktop-portal + PipeWire (전체 모니터) | `portal-pipewire` |
| 2 | GStreamer `ximagesrc` | `gstreamer-x11` |
| 3 | X11 창 합성 폴백 | `N layers, X11 fallback` |

## 제한 사항

- [VNCServerWinV10](../VNCServerWinV10) 대비 다중 모니터, H.264, 파일 전송 등은 미구현

## 문제 해결

| 증상 | 확인 |
|------|------|
| `Missing dependencies` | `make deps` 실행 |
| `Failed to open X11 display` | `echo $DISPLAY`, 데스크톱 세션에서 실행 |
| `Screen capture failed` | 화면 공유 거부 여부 확인, `make deps` 후 재빌드 |
| 창 하나만 보임 | 로그에 `portal-pipewire` 인지 확인, portal 허용 후 재시작 |
| TigerVNC `SetDesktopSize failed: 1` | 정상(고정 해상도). `vncviewer -RemoteResize=0` 사용 |
| TigerVNC `Connection refused` | `./vncserver` 실행 후 GUI에서 Start |
| 빌드 후 이전 UI | `./vncserver` 재빌드·재실행 |

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
