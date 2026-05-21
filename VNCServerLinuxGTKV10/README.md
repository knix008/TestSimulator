# VNC Server for Linux (GTK3, C/C++)

Linux용 VNC 서버 GUI 애플리케이션입니다. **GTK3**로 설정·시작 UI를 제공하고, **libvncserver**로 화면을 공유합니다.

- **기본**: 전체 화면(모니터) — `xdg-desktop-portal` + PipeWire
- **선택**: 특정 X11 창만 — XComposite / XCopyArea
- **폴백**: Portal 실패 시 네이티브 X11에서 `ximagesrc` 또는 루트 픽스맵

페어 클라이언트: [VNCClientLInuxGTKV10](../VNCClientLInuxGTKV10) (`./vncclient`)

## 요구 사항

- Linux (GTK3 데스크톱 세션)
- C++17 (`g++`), `make`, `pkg-config`
- 개발 패키지 — `make deps` (아래 참고)

| 환경 | 화면 캡처 | 원격 입력 |
|------|-----------|-----------|
| **Wayland** (GNOME/KDE 등) | Portal 화면 공유 **필수** (모니터 선택) | XWayland 창 위주 (`XTest` / `XSendEvent`). 네이티브 Wayland 앱은 제한적 |
| **X11** | Portal 또는 `ximagesrc` / 루트 픽스맵 | 전체 데스크톱에 가깝게 동작 |

Wayland에서는 **XWayland**가 있어야 X11 창 선택·일부 입력이 동작합니다.

## 빠른 시작

```bash
cd VNCServerLinuxGTKV10
make deps    # 개발 패키지 설치 (sudo)
make         # ./vncserver 생성
./vncserver
```

1. GUI에서 **공유 범위** — 기본 **「전체 화면」** 유지  
2. **Start** → 화면 공유 대화상자에서 **모니터(전체 화면)** 선택 (앱 창이 아님)  
3. 상태에 `캡처 백엔드: portal-pipewire` 확인 후 클라이언트 연결  

```bash
# 예: 기본 포트 5900
vncviewer localhost:5900
# 또는
../VNCClientLInuxGTKV10/vncclient
```

**비밀번호**를 비우면 인증 없이 연결됩니다.

## Makefile 타깃

| 타깃 | 설명 |
|------|------|
| `deps` | Debian/Ubuntu/Fedora/Arch 개발 패키지 설치 |
| `deps-list` | 설치 대상 패키지 목록 출력 |
| `all` (기본) | `./vncserver` 빌드 |
| `run` | 빌드 후 실행 |
| `clean` | `build/`, `./vncserver` 삭제 |

### Debian / Ubuntu (`make deps`)

- `build-essential`, `pkg-config`
- `libgtk-3-dev`, `libvncserver-dev`, `libx11-dev`, `libxcomposite-dev`, `libxtst-dev`
- `gstreamer1.0-tools`, `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good`
- `libgstreamer1.0-dev`, `libgstreamer-plugins-base1.0-dev`

런타임: `xdg-desktop-portal` 및 데스크톱별 backend (`xdg-desktop-portal-gnome` 등), PipeWire.

## 프로젝트 구조

```
VNCServerLinuxGTKV10/
├── Makefile
├── README.md
├── .gitignore
├── vncserver              # 빌드 결과 (git 제외)
├── build/                 # 중간 .o (git 제외)
├── include/
│   ├── gui_gtk.h
│   ├── vnc_core.h
│   ├── capture_gstreamer.h
│   └── window_picker.h
└── src/
    ├── main.cpp
    ├── gui_gtk.cpp           # GTK3 UI
    ├── vnc_core.cpp          # libvncserver, 캡처 루프, 원격 입력
    ├── capture_gstreamer.cpp   # Portal PipeWire / ximagesrc
    └── window_picker.cpp       # 「특정 창만」용 X11 창 선택
```

## GUI 설정

| 항목 | 설명 |
|------|------|
| **Port** | VNC 포트 (기본 5900) |
| **Password** | 선택; 비우면 무인증 |
| **Allow remote mouse and keyboard** | 원격 입력 허용 |
| **공유 범위** | `전체 화면 (기본 · Portal)` / `특정 창만 (X11 창 ID)` |
| **창 선택…** | 「특정 창만」일 때 대상 X11 창 지정 |

서버 실행 중에는 Start 후 Portal 대화가 끝날 때까지 **화면 공유를 완료**한 뒤 클라이언트를 연결하는 것이 좋습니다.

## 화면 캡처

| 모드 | 방식 | 상태 로그 예 |
|------|------|----------------|
| 전체 화면 | Portal → PipeWire | `portal-pipewire` |
| 전체 화면 (Portal 실패, X11) | GStreamer `ximagesrc` | `gstreamer-x11` |
| 전체 화면 (X11 폴백) | 루트 픽스맵 | X11 root |
| 특정 창만 | XComposite / XCopyArea | `window` / `x11` |

Wayland에서 Portal 없이 X11 창 합성만으로는 **전체 데스크톱이 아닌 일부 창만** 보일 수 있어, 전체 화면 모드에서는 Portal을 사용합니다.

## 원격 입력

- VNC 좌표를 X11 루트 좌표로 **스케일**하여 전달합니다.
- 클릭 시 포인터 아래 **최상위 창에 포커스** (`_NET_ACTIVE_WINDOW`, `XSetInputFocus`) 후 버튼 이벤트를 해당 창으로 전송합니다.
- Wayland 네이티브 앱(순수 Wayland 창)에는 입력이 거의 전달되지 않을 수 있습니다.

## VNC 클라이언트 호환

- **ExtDesktopSize / NewFBSize**: 뷰어 창 크기에 맞춰 프레임버퍼 크기 조정 (libvncserver)
- 리사이즈 직후 한 프레임 **Raw**로 동기화한 뒤 ZRLE/Tight 사용 (TightVNC zlib 이슈 완화)
- TightVNC에서 해상도 변경 로그가 거슬리면: `vncviewer -RemoteResize=0 localhost:5900`

## 제한 사항

- [VNCServerWinV10](../VNCServerWinV10) 대비 다중 모니터 선택, H.264, 클립보드 파일 전송 등 미구현
- Wayland **네이티브** 창 전체 제어·입력은 Portal RemoteDesktop / uinput 등 별도 연동 필요
- 「특정 창만」은 X11 창 ID 기준 (XWayland에 노출된 창)

## 문제 해결

| 증상 | 확인 |
|------|------|
| `Missing dependencies` | `make deps` 후 `make` |
| `Failed to open X11 display` | `echo $DISPLAY`, GUI 세션에서 실행 |
| 검은 화면만 보임 | Portal에서 **모니터** 선택, `캡처 백엔드: portal-pipewire`, content % > 0 |
| 화면이 나왔다가 검게 됨 | PipeWire/Portal 재허용, 서버·클라이언트 재빌드 후 재시작 |
| 창 하나만 보임 | 전체 화면 모드 + Portal 모니터 선택 여부 |
| `Connection refused` | `./vncserver` 실행 후 GUI **Start** |
| 마우스가 맨 위 창만 반응 | XWayland 한계; 클릭 대상이 XWayland 창인지 확인 |
| 키보드/마우스 전혀 안 됨 | 서버 **Allow input**, 클라이언트 **View only** 해제 |
| TigerVNC `inflate failed` / 끊김 | 리사이즈 후 Raw→ZRLE 경로 적용됨; 최신 빌드 사용 |

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
