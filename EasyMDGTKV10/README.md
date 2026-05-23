# EasyMD GTK v1.0

GTK3 + WebKit2 + libcmark 기반의 가벼운 **마크다운 편집기**입니다.
**문서 구조 패널 / 편집기 / 실시간 미리보기** 3분할 화면으로,
모든 마크다운 기호를 **마우스만으로** 메뉴·툴바에서 삽입할 수 있습니다.

---

## 빠른 시작

처음 빌드하시면 **`make` 한 줄**로 끝납니다.

```bash
git clone <this-repo>
cd EasyMDGTKV10

make            # 누락 패키지 자동 감지 → 자동 설치(sudo) → 빌드
./easymd        # 실행

# 실행 시 파일을 인자로 넘기면 바로 열립니다:
./easymd README.md
```

`make` 는 빌드 직전에 **`_assert-deps`** 단계가 동작합니다.

1. `pkg-config` 로 GTK / WebKit2GTK / cmark 설치 여부 점검
2. 누락 패키지가 있으면 **자동으로 `make install-deps` 호출** (sudo 비밀번호 요구)
3. 설치 결과를 `check-deps` 로 검증한 뒤 컴파일/링크

자동 설치를 원치 않는다면 (예: CI / 권한 분리된 환경):

```bash
EASYMD_AUTO_INSTALL=0 make    # 누락 시 자동 설치 대신 수동 안내만 출력
```

단계별로 직접 실행하고 싶다면:

```bash
make install-deps   # 1) 의존성 설치만 (sudo 필요)
make check-deps     # 2) 점검만
make                # 3) 빌드 (의존성이 이미 모두 있으면 그대로 컴파일)
make run            # 4) 빌드 + 실행
```

---

## 주요 기능

- 3분할 화면: **문서 구조 (목차)** | **편집기** | **실시간 미리보기**
- **드래그로 폭 조절 가능한 사이드바**
  - 메뉴바 맨 앞 **목록 아이콘**(`view-list-symbolic` 한 개만) 클릭 또는 `F9` 로 접기/펼치기
  - 사이드바와 본문 사이 핸들을 **마우스로 드래그**해 폭을 자유롭게 조절
  - 마지막에 사용자가 설정한 폭을 기억해서 다시 펼칠 때 복원
  - 각 헤딩 항목에 **레벨별 아이콘** 표시 (★ / 📄 / ▤ / ▶︎)
- 메뉴 / 툴바를 통해 **마우스만으로** 마크다운 기호 삽입
  - 제목 1~6, 굵게/기울임/취소선, 인라인 코드/코드 블록
  - 링크/이미지, 글머리 기호/번호 매기기, 인용, 수평선, 표
- 입력과 동시에 갱신되는 **라이브 미리보기** (CommonMark + 자체 CSS, 180ms 디바운스)
- 헤딩(`#` ~ `######`)을 트리로 보여주는 **문서 구조 패널**
  - 항목을 더블클릭하면 본문의 해당 줄로 즉시 이동
  - 코드 펜스(``` / ~~~) 안의 `#` 줄은 헤딩으로 잘못 인식하지 않음
- 표준 단축키: `Ctrl+N/O/S/Shift+S/Q`, `Ctrl+B/I/D/E/K`, `Ctrl+1..6`, `F9`
- `*.md`/`*.markdown` 파일의 **열기 / 저장 / 다른 이름으로 저장**
- 저장하지 않은 변경사항이 있을 때 **닫기 확인 다이얼로그**
- **앱 아이콘 (`daemon_hammer.ico`) 자동 적용**
  - 윈도우 데코레이션 / 작업표시줄 / Alt-Tab / About 다이얼로그 로고에 사용
  - 실행 파일 옆 → CWD → `~/.local/share/icons/...` 순으로 자동 탐색
  - `make install-desktop` 으로 GNOME hicolor 테마(`easymd.ico`)에도 등록

---

## 시스템 요구사항

- Linux (Ubuntu 22.04+, Fedora, Arch 등) 또는 macOS
- GCC / Make / pkg-config
- GTK+ 3.0
- WebKit2GTK 4.1 (구형 배포판은 4.0 자동 감지)
- libcmark (CommonMark 파서)
- GdkPixbuf 의 ICO 로더 (`libpixbufloader-ico`) — 일반적으로 `libgdk-pixbuf2.0-0`
  와 함께 자동 설치되며, `daemon_hammer.ico` 를 윈도우 아이콘으로 로드할 때
  사용됩니다. 누락된 경우 PNG/JPG 폴백을 시도합니다.

---

## 설치 (의존성)

자동 설치:

```bash
make install-deps    # 누락된 패키지만 골라 설치 + 자동 검증
```

`install-deps` 는 `pkg-config` 로 다음 세 라이브러리의 설치 여부를 먼저
확인합니다.

| 라이브러리 | pkg-config 이름 |
|---|---|
| GTK+ 3 | `gtk+-3.0` |
| WebKit2GTK | `webkit2gtk-4.1` (없으면 `webkit2gtk-4.0`) |
| CommonMark | `libcmark` |

이미 설치된 라이브러리는 다시 받지 않으며, 배포판별로 다음 명령에 매핑됩니다.

| 배포판 | 명령 |
|---|---|
| Ubuntu / Debian | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libcmark-dev` |
| Fedora | `sudo dnf install gcc make pkg-config gtk3-devel webkit2gtk4.1-devel cmark-devel` |
| Arch  | `sudo pacman -S --needed base-devel pkg-config gtk3 webkit2gtk-4.1 cmark` |
| macOS | `brew install pkg-config gtk+3 webkit2gtk cmark` |

---

## 빌드 / 실행

```bash
make check-deps     # (선택) 의존성 점검 + 버전 표시
make                # 빌드 (Core + UI 레이어)
./easymd            # 실행
# 또는
make run            # 빌드 + 즉시 실행
```

> 실행 시 같은 폴더의 `daemon_hammer.ico` 를 발견하면 자동으로 윈도우/About
> 로고에 사용합니다. 로그에 `App icon loaded from: ...` 라고 찍힙니다.

---

## 데스크톱 / 런처 통합 (선택)

`make install-desktop` 한 번이면 GNOME / KDE 등에서 EasyMD 가 정식 앱처럼
검색·실행됩니다. 이 타겟이 하는 일은 다음 세 가지 입니다.

1. **아이콘 등록**: `daemon_hammer.ico` (그리고 있다면 `.png/.jpg`)를
   `~/.local/share/icons/hicolor/256x256/apps/easymd.{ico,png,jpg}` 로 복사.
2. **런처 정의**: `easymd.desktop` 의 `Exec=` 와 `Icon=` 줄을 빌드 디렉터리의
   절대경로로 치환해 `~/.local/share/applications/easymd.desktop` 에 설치.
   이렇게 하면 hicolor 테마 검색이 실패해도 절대경로 폴백이 동작합니다.
3. **캐시 갱신**: 사용 가능하면 `update-desktop-database` 와
   `gtk-update-icon-cache` 를 호출 (없어도 무시).

```bash
make install-desktop
# → ~/.local/share/applications/easymd.desktop
# → ~/.local/share/icons/hicolor/256x256/apps/easymd.ico
```

설치 후 GNOME/Dash, KDE 메뉴, `Activities` 검색에서 **EasyMD GTK** 로 보이며
실행 시 `daemon_hammer.ico` 가 작업표시줄·Alt-Tab·About 다이얼로그에 함께
표시됩니다. 제거는 위 두 파일을 직접 지우면 됩니다.

---

## 주요 화면

```
┌─[untitled.md] (수정됨) ─────────────────────[─][□][×]──────────────┐  ← 타이틀바
├───────────────────────────────────────────────────────────────────┤
│ [≡] │ 파일 │ 편집 │ 삽입 │ 도움말                            │  ← 앞: 사이드바(아이콘만)
├───────────────────────────────────────────────────────────────────┤
│ 툴바 [★ H1][📄 H2][▤ H3] | [𝐁 Bold][𝐼 Italic][S̶ Strike]           │
│      [⌨ Code][</> Block] | [🔗 Link][🖼 Image]                     │
│      [☰ List][# Numbered][❝ Quote][― HR][▦ Table]                 │
├──────────────┬───────────────────────┬────────────────────────────┤
│  문서 구조   │       편집기          │      실시간 미리보기        │
│  ┌─────────┐ │  # EasyMD GTK         │  EasyMD GTK                 │
│  │★ EasyMD │ │  ## 사용 방법         │  ──────────                 │
│  │ 📄 사용 │ │  ### 단축키           │  사용 방법                  │
│  │  ▤ 단축 │ │  ...                  │  단축키                     │
│  └─────────┘ │                       │                             │
│              ↑                       ↑                             │
│        ←drag로 폭 조절          drag로 폭 조절                     │
├──────────────┴───────────────────────┴────────────────────────────┤
│ 상태표시줄: 줄 수 / 문자 수 / 수정 여부                            │
└───────────────────────────────────────────────────────────────────┘

   사이드바 토글:  메뉴바 맨 앞 **아이콘(목록)** 클릭  /  F9
   사이드바 폭  :  사이드바와 본문 사이 핸들 드래그
   섹션 아이콘  :  H1=★  H2=📄  H3=▤  H4..H6=▶︎
```

---

## 단축키 모음

| 동작 | 단축키 |
|---|---|
| 새로 만들기 | `Ctrl+N` |
| 열기 | `Ctrl+O` |
| 저장 / 다른 이름으로 저장 | `Ctrl+S` / `Ctrl+Shift+S` |
| 종료 | `Ctrl+Q` |
| 굵게 / 기울임 / 취소선 | `Ctrl+B` / `Ctrl+I` / `Ctrl+D` |
| 인라인 코드 / 링크 | `Ctrl+E` / `Ctrl+K` |
| 제목 1~6 | `Ctrl+1` ~ `Ctrl+6` |
| 사이드바 표시 / 숨김 | `F9` |
| 정보 (About) | `F1` |

> 모든 동작은 단축키 없이 **삽입 메뉴 / 툴바 버튼** 만으로도 동일하게 사용할 수 있습니다.

---

## 아키텍처: GTK 의존 / 비의존 분리

소스를 두 레이어로 명확히 분리해 두었습니다. 코어 레이어는 GTK 헤더를
전혀 포함하지 않으므로 단위 테스트나 다른 프런트엔드(예: CLI, Qt)에서도
재사용할 수 있습니다.

```text
┌────────────────────────────────────────────────────────────────┐
│  UI 레이어  (GTK + WebKit2 의존)                                │
│  ─────────────────────────────────                              │
│  main.c                  # 진입점                               │
│  ui.c / ui.h             # 윈도우/메뉴/툴바/Paned/시그널        │
│  editor.c / editor.h     # GtkTextBuffer 어댑터                 │
│  preview.c / preview.h   # WebKitWebView 어댑터                 │
│  outline.c / outline.h   # GtkTreeStore 어댑터                  │
│  fileio.c / fileio.h     # GtkFileChooserDialog                 │
└──────────────────────────┬─────────────────────────────────────┘
                           │ (호출)
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  Core 레이어  (GTK 없음 — glib + cmark + libc 만)                │
│  ─────────────────────────────────                              │
│  mdcore.c / mdcore.h           # 스니펫 생성 / cmark→HTML / 아웃라인 파서 │
│  fileio_core.c / fileio_core.h # 순수 파일 read/write             │
│  utils.c / utils.h             # 로깅                            │
└────────────────────────────────────────────────────────────────┘
```

분리가 실제로 유지되고 있는지(코어가 GTK를 끌어오지 않는지)는 다음 명령으로 검증할 수 있습니다:

```bash
make core-only   # 코어 레이어만 GTK 없이 컴파일
```

성공하면 `mdcore.c / fileio_core.c / utils.c` 가 GTK 헤더 없이도 빌드됨이 보장됩니다.

---

## 프로젝트 구조

```text
EasyMDGTKV10/
├── source/                  # C 소스 파일
│   ├── main.c               # UI 레이어: 진입점 (CLI 파싱 + UI 부트스트랩)
│   ├── ui.c                 # UI 레이어: 메뉴/툴바/3분할 레이아웃 + 앱 아이콘
│   ├── editor.c             # UI 레이어: 마크다운 삽입 → GtkTextBuffer
│   ├── preview.c            # UI 레이어: HTML → WebKitWebView
│   ├── outline.c            # UI 레이어: 헤딩 → GtkTreeStore
│   ├── fileio.c             # UI 레이어: 파일 다이얼로그
│   ├── mdcore.c             # CORE: 스니펫 생성 / cmark→HTML / 아웃라인 파서
│   ├── fileio_core.c        # CORE: 순수 파일 read/write
│   └── utils.c              # CORE: 로깅
├── include/                 # 헤더 파일
│   ├── ui.h
│   ├── editor.h
│   ├── preview.h
│   ├── outline.h
│   ├── fileio.h
│   ├── mdcore.h
│   ├── fileio_core.h
│   └── utils.h
├── style/
│   └── modern.css           # GTK CSS 테마 (런타임 로드)
├── example/
│   └── example.md           # 기본 예제 문서 (시작 시 자동 로드)
├── build/                   # 컴파일 산출물 (자동 생성, git 무시)
├── daemon_hammer.ico        # 앱/창/About 로고 (런타임에 ui.c 가 직접 로드)
├── easymd.desktop           # GNOME 런처 정의 (install-desktop 의 입력)
├── Makefile                 # install-deps / check-deps / build / core-only / run / install-desktop
├── README.md
└── .gitignore
```

---

## Makefile 단계 요약

본 프로젝트의 Makefile은 **무엇을 만드는가**를 큰 흐름으로 보여주도록
다음 단계로 나뉘어 있습니다.

0. **setup**        – `install-deps → 검증 → 빌드` 한 번에 (one-shot 권장)
1. **install-deps** – 누락 패키지 자동 감지, 배포판별 설치, 끝나면 `check-deps` 로 자동 검증
2. **check-deps**   – 의존성 점검 및 설치 버전 표시
3. **all (build)**  – `*.c → *.o → easymd` 컴파일/링크 (의존성 부족 시 친절한 안내)
4. **core-only**    – GTK 없이 코어 레이어만 빌드해 분리 유지 검증
5. **run**          – 빌드 후 즉시 실행
6. **install-desktop** – `~/.local/share` 에 런처 + 아이콘 등록 (GNOME)
7. **clean / distclean** – 산출물 정리
8. **debug / info / help** – 부가 도구

```bash
make help      # 모든 타겟 한눈에 보기
make info      # 빌드 설정 (Core / UI 소스 목록 포함)
```

각 단계의 세부 명령은 해당 타겟 안에 캡슐화되어 있어, 흐름만 빠르게
훑은 뒤 필요한 단계로 들어가 살펴볼 수 있습니다.

---

## 자주 묻는 문제

**Q. `make install-deps` 가 `webkit2gtk4.1` 패키지를 찾지 못합니다.**

구형 배포판(Ubuntu 20.04 등)에는 4.1이 없습니다. Makefile 이 `webkit2gtk-4.0` 으로
자동 폴백하므로, `pkg-config --exists webkit2gtk-4.0` 만 성공하면 됩니다.
필요시 `sudo apt install libwebkit2gtk-4.0-dev` 를 직접 설치해도 동작합니다.

**Q. 미리보기 창이 비어있고 빈 페이지만 표시됩니다.**

WebKit2 가 설치되어 있는지(`pkg-config --modversion webkit2gtk-4.1`)와,
`make` 결과 빌드가 4.1 또는 4.0 중 어느 쪽으로 링크됐는지 `make info`
로 확인하세요.

**Q. 한국어 입력이 안 되거나 IME가 깨집니다.**

GTK3 의 IM 모듈 환경 변수(`GTK_IM_MODULE`)를 사용 중인 IME에 맞게
설정하세요. 예: `export GTK_IM_MODULE=ibus` 또는 `fcitx`.

**Q. 표/취소선이 미리보기에 그대로 보입니다.**

기본 `libcmark` 는 CommonMark 표준만 지원합니다. GitHub Flavored Markdown
(표 / 자동링크 / 취소선) 을 활성화하려면 `libcmark-gfm` 으로 교체해야
합니다 — 본 버전에서는 의도적으로 단순화된 의존성(`libcmark`)을 사용합니다.

**Q. 실행 후에도 작업표시줄/Alt-Tab 에 기본 아이콘만 보입니다.**

세 가지를 차례로 확인하세요.

1. `./easymd` 의 시작 로그에 `App icon loaded from: ...` 가 보이는지 확인합니다.
   - 보인다면 GTK 앱은 아이콘을 알고 있습니다 — 컴포지터/도크 쪽 캐시 문제일
     가능성이 높습니다.
   - 보이지 않는다면 GdkPixbuf 가 `.ico` 를 못 읽고 있는 것이라
     `dpkg -L libgdk-pixbuf2.0-0 | grep -i ico` 로 ICO 로더가 깔려 있는지
     확인합니다.
2. 도크/패널이 `.desktop` 의 아이콘 이름으로 매칭되는지 확인합니다 —
   `make install-desktop` 을 한 번 실행해 `~/.local/share/applications/easymd.desktop`
   과 `~/.local/share/icons/hicolor/256x256/apps/easymd.ico` 를 등록하세요.
3. 등록 후에도 그대로라면 캐시 갱신을 강제합니다.
   ```bash
   gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor
   update-desktop-database ~/.local/share/applications
   # GNOME Shell 은 로그아웃/재로그인 한 번이면 확실하게 반영됩니다.
   ```

**Q. About 다이얼로그에는 로고가 보이는데, 창 데코에는 안 보입니다.**

Wayland(GNOME 등)는 `.desktop` 항목과 프로세스의 `app-id` 매칭으로 아이콘을
결정합니다. 이미 코드에서 `g_set_prgname("easymd")` 와
`gdk_set_program_class("easymd")` 를 호출하므로, `make install-desktop` 으로
`easymd.desktop` 만 함께 등록되어 있으면 매칭됩니다. 그래도 안 보이면 위
**Q.** 의 3번 캐시 갱신 + 재로그인을 시도하세요.

**Q. 실행 시 `libEGL warning ... / MESA: ZINK / VMware: No 3D enabled` 같은 경고가 잔뜩 나옵니다.**

VMware/VirtualBox/헤들리스 VM 처럼 GPU 가속이 꺼진 환경에서 WebKit2GTK가
EGL/DRI2 경로를 시도하다 실패하면서 나는 **경고**입니다 (실제 동작에는
영향 없음 — 자동으로 소프트웨어 렌더링으로 폴백). EasyMD 는 시작 시점에
다음 환경변수를 자동으로 설정해 이 노이즈를 줄입니다.

```
WEBKIT_DISABLE_COMPOSITING_MODE=1
WEBKIT_DISABLE_DMABUF_RENDERER=1
LIBGL_ALWAYS_SOFTWARE=1
MESA_LOADER_DRIVER_OVERRIDE=swrast
```

실제 데스크톱 환경에서 GPU 가속을 다시 사용하고 싶다면, 셸에서
`EASYMD_FORCE_GL=1` 를 설정한 채로 실행하세요 — 이 자동 설정이 통째로
건너뛰어집니다.

```bash
EASYMD_FORCE_GL=1 ./easymd
```

---

## 라이선스

MIT
