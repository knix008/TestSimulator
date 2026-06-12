# MyClock GTK

Linux / macOS용 데스크탑 시계 앱. Windows WPF 버전([MyClockWinV10](../MyClockWinV10))의 GTK4/C 포팅.

## 기능

| 카테고리 | 내용 |
|----------|------|
| **디지털 시계** | 7세그먼트, 도트 매트릭스, 미니멀, LCD, 레트로, 네온, 한글, 매트릭스, 빈티지, 씬 (10가지 스타일) |
| **아날로그 시계** | 클래식, 미니멀, 로마 숫자, 인덱스, 철도, 바우하우스, 도트, 항공, 해양, 모던, 스팀펑크 (11가지 스타일) |
| **테마** | 다크, 라이트, 미드나이트, 오션, 루비, 에메랄드, 퍼플, 앰버, 로즈, 모노, 선셋, 민트 (12가지) |
| **세계 시간** | IANA 타임존 기반, 160개 도시 검색, 미니 아날로그 시계 표시 |
| **알람** | 반복 요일 알람 + **캘린더 알람** (특정 날짜+시간 1회), 알람음, 시스템 알림(`notify-send`) |
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

의존성 설치는 `make deps` 한 번으로 처리됩니다 (플랫폼 자동 감지).

### Ubuntu / Debian

```bash
make deps
# → sudo apt install gcc make pkg-config libgtk-4-dev libjson-glib-dev
```

### macOS (Homebrew)

```bash
make deps
# → brew install pkg-config gtk4 json-glib
```

### Fedora / RHEL

```bash
sudo dnf install gtk4-devel json-glib-devel gcc make pkg-config
```

### Arch Linux

```bash
sudo pacman -S gtk4 json-glib gcc make pkg-config
```

## 빌드 및 실행

```bash
git clone <repo>
cd MyClockGTKV10

make          # 의존성 자동 확인 후 빌드
./myclock     # 실행 (data/ 디렉터리가 현재 위치에 있어야 함)
```

### 설치 (선택)

```bash
make install         # /usr/local/bin 및 /usr/local/share/myclock 에 설치
make uninstall       # 설치 제거
```

### Makefile 타겟

| 타겟 | 설명 |
|------|------|
| `make` | 의존성 확인 후 빌드 (기본) |
| `make deps` | 플랫폼에 맞는 패키지 설치 |
| `make install` | 바이너리 및 데이터 파일 설치 |
| `make uninstall` | 설치 제거 |
| `make clean` | 빌드 산출물 삭제 |

## 프로젝트 구조

```
MyClockGTKV10/
├── Makefile
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

- **UI**: GTK4 (`GtkStack`, `GtkOverlay`, `GtkNotebook`, `GtkDrawingArea`, `GtkDropDown`, `GtkCalendar`)
- **그래픽**: Cairo (아날로그 시계, 세그먼트, 도트 매트릭스), PangoCairo (숫자 렌더링)
- **테마**: GtkCssProvider + CSS `@define-color`
- **설정**: json-glib (`JsonParser`, `JsonBuilder`)
- **타임존**: GLib `GTimeZone` + IANA ID
- **타이밍**: `g_get_monotonic_time()` (µs 정밀도)
- **리사이즈**: X11 `XMoveResizeWindow` 직접 제어 (실시간 클록 업데이트)
- **알람음**: `paplay` / `aplay` subprocess + `g_timeout_add_seconds` 반복
- **시스템 알림**: `notify-send` (freedesktop)
- **DnD 순서 변경**: `GtkDragSource` + `GtkDropTarget`, 위젯 재배치
- **빌드**: GNU Make (Linux: apt, macOS: Homebrew 자동 감지)
- **설치 경로**: `$(PREFIX)/bin` + `$(PREFIX)/share/myclock` (컴파일 타임 `MYCLOCK_PKGDATADIR`)

## 플랫폼 참고

- **항상 위 (Always on Top)**: GTK4에서 해당 API가 제거됨. 설정은 저장되나 창 관리자 레벨에서는 적용되지 않음.
- **창 리사이즈**: X11 백엔드에서 직접 처리(실시간). Wayland는 WM에 위임(리사이즈 완료 시 업데이트).
- **알람음**: `paplay` 또는 `aplay`가 설치된 경우에만 재생. 없으면 터미널 벨.

## 라이선스

MIT
