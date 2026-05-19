# VNC Server for Linux (GTK3, C/C++)

Linux용 VNC 서버 GUI 애플리케이션입니다. **GTK3** 로 설정·시작 UI를 제공하고, **libvncserver**와 **X11** 로 화면을 공유합니다.

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

VNC 클라이언트 연결 예:

```bash
vncviewer localhost:5900
```

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
- `libgtk-3-dev`, `libvncserver-dev`, `libx11-dev`, `libxtst-dev`

## 프로젝트 구조

```
VNCServerLinuxGTKV10/
├── Makefile
├── README.md
├── vncserver          # 빌드 결과 (git 제외)
├── build/             # 중간 .o 파일 (git 제외)
├── include/
│   ├── gui_gtk.h    # GTK UI 진입점 (GTK 헤더 없음)
│   └── vnc_core.h   # VNC 서버 API (GTK 없음)
└── src/
    ├── main.cpp     # 프로그램 진입점
    ├── gui_gtk.cpp  # GTK3 UI (다크 테마)
    └── vnc_core.cpp # libvncserver + X11 캡처/입력
```

## 주요 기능

- **Status** — Stopped / Running 라디오 표시 (실행 시 녹색)
- **Settings** — 포트, 비밀번호(선택), 원격 마우스·키보드 허용
- **Control** — 서버 시작 / 중지
- **Log** — 연결·오류 메시지

## 제한 사항

- 전체 화면(루트 윈도우) 단일 캡처 기준
- [VNCServerWinV10](../VNCServerWinV10) 대비 다중 모니터, H.264, 파일 전송 등은 미구현

## 문제 해결

| 증상 | 확인 |
|------|------|
| `Missing dependencies` | `make deps` 실행 |
| `Failed to open X11 display` | `echo $DISPLAY`, 데스크톱 세션에서 실행 |
| `Screen capture failed` | X11/Wayland·권한 확인, 로그 메시지 참고 |
| 빌드 후 이전 UI | `./vncserver` 재빌드·재실행 |

## 라이선스

TestSimulator 저장소 정책을 따릅니다.
