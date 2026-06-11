# MyClock GTK

Linux / macOS용 데스크탑 시계 앱. Windows WPF 버전([MyClockWinV10](../MyClockWinV10))의 GTK4/C 포팅.

## 기능

| 카테고리 | 내용 |
|----------|------|
| **디지털 시계** | 7세그먼트, 도트 매트릭스, 미니멀, LCD, 레트로, 네온, 한글, 매트릭스, 빈티지, 씬 (10가지 스타일) |
| **아날로그 시계** | 클래식, 미니멀, 로마 숫자, 인덱스, 철도, 바우하우스, 도트, 항공, 해양, 모던, 스팀펑크 (11가지 스타일) |
| **테마** | 다크, 라이트, 미드나이트, 오션, 루비, 에메랄드, 퍼플, 앰버, 로즈, 모노, 선셋, 민트 (12가지) |
| **세계 시간** | IANA 타임존 기반, 160개 도시 검색, 미니 아날로그 시계 표시 |
| **알람** | 반복 요일 설정, 활성화/비활성화 토글 |
| **타이머** | 시/분/초 설정, 시작·일시정지·정지 |
| **스톱워치** | 랩 타임 기록 |
| **설정 유지** | `~/.config/myclock/settings.json`에 JSON 저장 |
| **자동 시작** | `~/.config/autostart/myclock.desktop` 생성/삭제 |

## 의존성

| 패키지 | 버전 |
|--------|------|
| GTK4 | ≥ 4.6 |
| json-glib | ≥ 1.6 |
| GLib | ≥ 2.66 |

### Ubuntu / Debian

```bash
sudo apt install libgtk-4-dev libjson-glib-dev meson ninja-build gcc
```

### Fedora / RHEL

```bash
sudo dnf install gtk4-devel json-glib-devel meson ninja-build gcc
```

### Arch Linux

```bash
sudo pacman -S gtk4 json-glib meson ninja gcc
```

### macOS (Homebrew)

```bash
brew install gtk4 json-glib meson ninja
```

## 빌드 및 실행

```bash
git clone <repo>
cd MyClockGTKV10

meson setup build
ninja -C build

# 빌드 디렉터리에서 바로 실행 (data/ 디렉터리가 자동으로 참조됨)
./build/myclock
```

### 설치 (선택)

```bash
ninja -C build install        # 기본: /usr/local
# 또는
DESTDIR=~/.local ninja -C build install
```

## 프로젝트 구조

```
MyClockGTKV10/
├── meson.build
├── data/
│   ├── myclock.css              # 베이스 스타일시트
│   └── themes/
│       ├── dark.css
│       ├── light.css
│       └── ...                  # 12개 테마
└── src/
    ├── main.c                   # 진입점
    ├── main_window.c/h          # 메인 창 (시계 표시, 테마, 알람 처리)
    ├── side_panel.c/h           # 사이드 패널 (5탭)
    ├── app_state.h              # 공유 데이터 구조체 및 열거형
    ├── widgets/
    │   ├── analog_clock.c/h     # Cairo 아날로그 시계 (11가지 스타일)
    │   ├── seven_segment.c/h    # 7세그먼트 디스플레이
    │   ├── dot_matrix.c/h       # 도트 매트릭스 디스플레이
    │   └── world_time_panel.c/h # 세계 시간 목록
    ├── models/
    │   ├── settings.c/h         # JSON 설정 저장/불러오기
    │   └── city_database.c/h    # 160개 도시 + IANA 타임존 DB
    ├── services/
    │   ├── timer_service.c/h    # 타이머 (g_get_monotonic_time 기반)
    │   └── stopwatch_service.c/h
    └── dialogs/
        ├── add_alarm_dialog.c/h
        ├── add_world_time_dialog.c/h
        └── alarm_notification.c/h
```

## 기술 스택

- **UI**: GTK4 (`GtkStack`, `GtkOverlay`, `GtkNotebook`, `GtkDrawingArea`)
- **그래픽**: Cairo (아날로그 시계, 세그먼트, 도트 매트릭스), PangoCairo (숫자 렌더링)
- **테마**: GtkCssProvider + CSS `@define-color`
- **설정**: json-glib (`JsonParser`, `JsonBuilder`)
- **타임존**: GLib `GTimeZone` + IANA ID
- **타이밍**: `g_get_monotonic_time()` (µs 정밀도)
- **컨텍스트 메뉴**: `GMenu` + `GtkPopoverMenu` + `GSimpleAction`
- **드래그 이동**: `gtk_window_begin_move_drag()` (X11·Wayland 모두 지원)

## 라이선스

MIT
