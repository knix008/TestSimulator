# CaptureMaster GTK v1.0

![Icon](daemon_hammer.jpg)

Linux/macOS용 GTK3 스크린 캡처 도구입니다.

## 개요

`CaptureMaster`는 C11 + GTK3로 작성된 캡처 프로그램입니다.  
현재 프로젝트는 **Linux + macOS**를 지원합니다.

## 주요 기능

- 전체 화면 캡처
- 선택 영역 캡처
- 특정 창 캡처
- PNG/JPEG 저장(사용자 파일명 확장자 기준)
- 캡처 후 미리보기 표시
- 앱 아이콘(`daemon_hammer.ico/.png/.jpg`) 적용

## 동작 방식

- **전체 화면**
  - 선택 UI 없이 즉시 캡처를 시도합니다.
  - 환경에 따라 `GNOME Shell DBus` → `GDK(X11)` → `XDG ScreenCast/PipeWire` 순으로 폴백합니다.
- **선택 영역**
  - 시스템 선택 UI(포털 interactive)를 우선 시도하고, 실패 시 앱 내 드래그 선택으로 폴백합니다.
  - 선택한 영역은 앱에서 즉시 crop되어 미리보기에 표시됩니다.
- **창 캡처**
  - XDG ScreenCast의 WINDOW 선택 경로를 우선 사용합니다.
  - 결과에 검은 여백이 포함되면 자동 트리밍을 시도합니다.

## UI 정책

- 설정(지연/형식) 패널 제거
- 저장은 `저장` 버튼 클릭 후 파일 선택 다이얼로그로 진행
- `INFO` 버튼은 상단 타이틀바에 배치
- 캡처 시작 시 앱 창 숨김, 완료 후 자동 복원 및 전면 표시

## 시스템 요구사항

- Linux
- GTK+ 3.0
- PipeWire 0.3
- GLib runtime tools (`gdbus`)
- GCC / Make / pkg-config

### macOS

- macOS
- GTK+ 3.0 (`brew install gtk+3`)
- Xcode Command Line Tools
- pkg-config

## 의존성 설치

```bash
make install-deps
```

수동 설치 예시:

### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libpipewire-0.3-dev libglib2.0-bin build-essential pkg-config
```

### Fedora

```bash
sudo dnf install -y gtk3-devel pipewire-devel glib2 gcc make pkg-config
```

### Arch Linux

```bash
sudo pacman -S --needed gtk3 pipewire glib2 base-devel pkg-config
```

### macOS (Homebrew)

```bash
brew install gtk+3 pkg-config
```

## 빌드 / 실행

```bash
make check-deps
make
./capturemaster
```

또는:

```bash
make run
```

## 프로젝트 구조

```text
CaptureMasterGTKV10/
├── main.c
├── ui.c
├── ui.h
├── capture.c
├── capture.h
├── utils.c
├── utils.h
├── daemon_hammer.ico
├── daemon_hammer.jpg
├── capturemaster.desktop
├── Makefile
├── README.md
└── .gitignore
```

## 참고

- Linux에서는 `make install-desktop`으로 GNOME 런처/아이콘 설치가 가능합니다.
- 테스트 중 생성되는 `screenshot_*.png/.jpg/.jpeg` 파일은 `.gitignore`에 포함되어 있습니다.
