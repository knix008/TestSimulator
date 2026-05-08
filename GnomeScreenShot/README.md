# Enhanced Screenshot

GNOME Screenshot 41 소스 코드의 캡처 방식을 기반으로 한 스크린샷 프로그램입니다.

## GNOME Screenshot 소스 코드 활용

gnome-screenshot 41의 핵심 기법을 그대로 구현합니다.

| 기법 | gnome-screenshot 원본 | 구현 파일 |
|------|----------------------|-----------|
| XFixes 커서 합성 | `XFixesGetCursorImage()` + `gdk_pixbuf_composite()` | `src/screenshot.c` |
| 활성 창 감지 | `gdk_screen_get_active_window()` | `src/screenshot.c` |
| 창 테두리 포함 캡처 | `gdk_window_get_frame_extents()` | `src/screenshot.c` |
| 루트 윈도우 캡처 | `gdk_pixbuf_get_from_window()` | `src/screenshot.c` |
| 영역 선택 오버레이 | 전체화면 RGBA 창 + `gdk_seat_grab()` | `src/screenshot-area-selection.c` |
| X11 백엔드 강제 | `gdk_set_allowed_backends("x11")` | `src/main.c` |

## 주요 기능

- **전체 화면** 캡처
- **현재 창** 캡처 (창 테두리 포함/제외 선택)
- **영역 선택** 캡처 (고무줄 선택)
- **마우스 포인터 포함** 옵션 (XFixes)
- **이미지 편집** — 사각형·화살표 그리기, 색상 선택
- **자동 저장** — `~/Pictures/Screenshots/Screenshot_YYYY-MM-DD_HH-MM-SS.png`
- Wayland 환경에서도 XWayland를 통해 동작

## 의존성 설치

```bash
# Ubuntu/Debian
sudo apt-get install \
    build-essential pkg-config \
    libgtk-3-dev libcairo2-dev \
    libx11-dev libxfixes-dev libxcomposite-dev \
    libglib2.0-dev
```

## 빌드

```bash
# Makefile
make

# 또는 meson
meson setup build && cd build && ninja
```

## 실행

```bash
./screenshot
```

> Wayland 세션에서도 그냥 실행하면 됩니다. 프로그램이 시작 시 자동으로 X11(XWayland) 백엔드를 선택합니다.

## Makefile 타겟

| 명령 | 설명 |
|------|------|
| `make` | 빌드 |
| `make run` | 빌드 + 실행 |
| `make debug` | 빌드 + 디버그 출력으로 실행 |
| `make clean` | 빌드 파일 삭제 |
| `make check-deps` | 의존성 확인 |
| `make deps` | 의존성 자동 설치 |
| `make install` | `/usr/local/bin` 에 설치 |

## 사용 방법

1. **모드 선택** — 전체 화면 / 현재 창 / 영역 선택
2. **옵션 선택** — 마우스 포인터 포함, 창 테두리 포함
3. **스크린샷 캡처** 버튼 클릭
   - 영역 선택 모드: 전체 화면 오버레이에서 드래그, `Esc` 로 취소
4. **편집** — 사각형·화살표 그리기
5. **저장** — 수동 저장 대화상자 또는 자동 저장 체크박스

## 프로젝트 구조

```
src/
├── main.c                      # 앱 진입점, UI
├── screenshot.c/h              # 핵심 캡처 (gnome-screenshot 방식)
├── screenshot-area-selection.c/h  # 영역 선택 오버레이
├── autosave.c/h                # 자동 저장
├── editor.c/h                  # 이미지 편집
└── utils.c/h                   # 공통 유틸리티
```

## 기술 스택

- **언어**: C (GNU11)
- **GUI**: GTK+ 3
- **그래픽**: Cairo
- **캡처**: GDK + XFixes + X11
- **빌드**: Makefile / Meson

## 라이선스

GNOME Screenshot 소스 코드의 캡처 기법을 참고하여 작성되었습니다.
