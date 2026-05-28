# VNC Server for Linux (GTK3, C/C++)

Linux용 VNC 서버 GUI 애플리케이션입니다. **GTK3**로 설정·시작 UI를 제공하고, **libvncserver**로 화면을 공유합니다.

- **기본**: 전체 화면(모니터) — `xdg-desktop-portal` + PipeWire
- **폴백**: Portal 실패 시 네이티브 X11에서 `ximagesrc` 또는 루트 픽스맵

페어 클라이언트: [VNCClientLInuxGTKV10](../VNCClientLInuxGTKV10) (`./vncclient`)

## 요구 사항

- Linux (GTK3 데스크톱 세션)
- C++17 (`g++`), `make`, `pkg-config`
- 개발 패키지 — `make deps` (아래 참고)

| 환경 | 화면 캡처 | 원격 입력 |
|------|-----------|-----------|
| **Wayland** (GNOME/KDE 등) | Portal 화면 공유 **필수** (모니터 선택) | **`/dev/uinput`** 가상 장치(권장). 실패 시 XTest 폴백(XWayland 위주) |
| **X11** | Portal 또는 `ximagesrc` / 루트 픽스맵 | uinput 우선, 실패 시 XTest |

Wayland·X11 공통 원격 입력은 **`/dev/uinput`** 권한이 필요합니다. 설정 방법은 아래 [원격 입력](#원격 입력)을 참고하세요.

## 빠른 시작

```bash
cd VNCServerLinuxGTKV10
make deps    # 개발 패키지 설치 (sudo)
make         # ./vncserver 생성
./vncserver
```

1. GUI에서 설정(포트/비밀번호/입력/해상도)을 확인  
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
│   └── input_inject.h
└── src/
    ├── main.cpp
    ├── gui_gtk.cpp           # GTK3 UI
    ├── vnc_core.cpp          # libvncserver, 캡처 루프, 원격 입력
    ├── capture_gstreamer.cpp   # Portal PipeWire / ximagesrc
    └── input_inject.cpp      # uinput 가상 포인터·키보드
```

## GUI 설정

| 항목 | 설명 |
|------|------|
| **Port** | VNC 포트 (기본 5900) |
| **Password** | 선택; 비우면 무인증 |
| **Allow remote mouse and keyboard** | 원격 입력 허용 |
| **전송 해상도** | 슬라이더·숫자 입력(10–100%). 캡처 해상도 대비 VNC 전송 크기 비율 |
서버 실행 중에는 Start 후 Portal 대화가 끝날 때까지 **화면 공유를 완료**한 뒤 클라이언트를 연결하는 것이 좋습니다.

## 화면 캡처

| 모드 | 방식 | 상태 로그 예 |
|------|------|----------------|
| 전체 화면 | Portal → PipeWire | `portal-pipewire` |
| 전체 화면 (Portal 실패, X11) | GStreamer `ximagesrc` | `gstreamer-x11` |
| 전체 화면 (X11 폴백) | 루트 픽스맵 | X11 root |

Wayland에서 Portal 없이 X11 창 합성만으로는 **전체 데스크톱이 아닌 일부 창만** 보일 수 있어, 전체 화면 모드에서는 Portal을 사용합니다.

## 원격 입력

VNC 클라이언트의 **마우스·키보드**로 서버 쪽 응용 프로그램을 조작할 수 있습니다. GUI에서 **Allow remote mouse and keyboard**를 켠 뒤 서버를 시작하세요. 클라이언트는 **View only** 모드가 아니어야 합니다.

### 동작 방식

1. VNC 화면 좌표를 서버 화면 **루트 좌표**로 스케일 (`map_vnc_coords_to_root`, 전송 해상도 % 반영)
2. **uinput**이 활성이면 가상 포인터·키보드로 이벤트 주입 (`input_inject_pointer_root`, `input_inject_key`)
3. uinput 초기화 실패 시 **XTest** / `XSendEvent`로 폴백 (XWayland·X11 창 위주)

| 백엔드 | Wayland 네이티브 앱 | XWayland / X11 |
|--------|---------------------|----------------|
| **uinput** (권장) | 동작 가능 (컴포지터가 가상 장치 수신) | 동작 |
| **XTest** 폴백 | 거의 미동작 | XWayland 창·X11 앱에 가깝게 동작 |

구현 파일: `src/input_inject.cpp`, `src/vnc_core.cpp` (`ptr_add_event`, `kbd_add_event`).

### `/dev/uinput` 권한

uinput은 기본적으로 `root`만 쓸 수 있는 경우가 많습니다. 서버 사용자를 **`input` 그룹**에 넣고 **로그아웃 후 재로그인**하세요.

```bash
sudo usermod -aG input "$USER"
# 로그아웃 후 재로그인

# 확인
groups | grep -w input
ls -l /dev/uinput
```

권한이 없으면 uinput은 건너뛰고 XTest 폴백만 사용됩니다 (Wayland에서는 입력이 제한될 수 있음).

### 서버 시작 시 상태 메시지

| 메시지 | 의미 |
|--------|------|
| `입력: uinput (가상 마우스/키보드) — Wayland·X11 공통` | uinput 정상 — Wayland·X11 모두 원격 입력 권장 |
| `입력: XTest(X11) 폴백 — … /dev/uinput 권한(input 그룹)을 확인하세요` | Wayland + uinput 실패 → XWayland 위주만 기대 |
| `입력: XTest(X11) — uinput 초기화 실패` | X11 세션에서도 uinput 실패, XTest만 사용 |

### 테스트

1. `make` 후 `./vncserver` 실행
2. **Allow remote mouse and keyboard** 체크, **Start**
3. 상태창에 **uinput** 메시지가 나오는지 확인
4. Portal에서 **모니터(전체 화면)** 선택 후 클라이언트 연결
5. 원격에서 마우스 이동·클릭·키 입력으로 서버 앱 조작 확인

uinput 메시지가 보이는데도 입력이 안 되면: Portal/화면 공유 재허용, 서버·클라이언트 재시작, 다른 보안 정책(원격 세션 등) 여부를 확인하세요.

### XTest 폴백 시 추가 동작

- 클릭 시 포인터 아래 **최상위 창에 포커스** (`_NET_ACTIVE_WINDOW`, `XSetInputFocus`) 후 버튼 이벤트 전송
- Wayland **네이티브** 창(순수 Wayland)에는 입력이 거의 전달되지 않을 수 있음 → uinput 권한 설정 권장

## VNC 클라이언트 호환

- **ExtDesktopSize / NewFBSize**: 뷰어 창 크기에 맞춰 프레임버퍼 크기 조정 (libvncserver)
- 리사이즈 직후 한 프레임 **Raw**로 동기화한 뒤 ZRLE/Tight 사용 (TightVNC zlib 이슈 완화)
- TightVNC에서 해상도 변경 로그가 거슬리면: `vncviewer -RemoteResize=0 localhost:5900`

## 제한 사항

- [VNCServerWinV10](../VNCServerWinV10) 대비 다중 모니터 선택, H.264, 클립보드 파일 전송 등 미구현
- 일부 보안 정책·원격 데스크톱 세션에서 uinput이 차단될 수 있음 (그때 XTest 폴백)

## 문제 해결

| 증상 | 확인 |
|------|------|
| `Missing dependencies` | `make deps` 후 `make` |
| `Failed to open X11 display` | `echo $DISPLAY`, GUI 세션에서 실행 |
| 검은 화면만 보임 | Portal에서 **모니터** 선택, `캡처 백엔드: portal-pipewire`, content % > 0 |
| 화면이 나왔다가 검게 됨 | PipeWire/Portal 재허용, 서버·클라이언트 재빌드 후 재시작 |
| 창 하나만 보임 | 전체 화면 모드 + Portal 모니터 선택 여부 |
| `Connection refused` | `./vncserver` 실행 후 GUI **Start** |
| 마우스가 맨 위 창만 반응 | uinput 미사용(XTest 폴백) 가능성; `input` 그룹·`/dev/uinput` 권한 확인 |
| 키보드/마우스 전혀 안 됨 | 서버 **Allow input**, 클라이언트 **View only** 해제 |
| uinput 메시지 없음 | `sudo usermod -aG input $USER` 후 재로그인, `/dev/uinput` 쓰기 권한 확인 |
| Wayland 앱에만 입력 안 됨 | 상태에 XTest 폴백인지 확인 → uinput 활성화 필요 |
| TigerVNC `inflate failed` / 끊김 | 리사이즈 후 Raw→ZRLE 경로 적용됨; 최신 빌드 사용 |

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
