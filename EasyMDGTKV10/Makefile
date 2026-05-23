# =====================================================================
#   EasyMD GTK - Makefile
#
#   이 Makefile은 "무엇을 만드는가"를 한 화면에서 읽을 수 있도록 단계
#   (target) 단위로 구성되어 있습니다.
#
#   ── 처음 사용자라면 그냥 `make` 한 줄로 끝납니다:
#         make                 # 누락 패키지 감지 → 자동 설치(sudo) → 빌드
#         make setup           # 위와 동일 (명시적 alias)
#
#   ── 자동 설치를 끄려면:
#         EASYMD_AUTO_INSTALL=0 make
#
#   ── 단계별로 직접 진행하려면:
#       0)  setup          :  install-deps → check-deps → all (alias of all)
#       1)  install-deps   :  필요한 라이브러리/도구 설치 (sudo)
#       2)  check-deps     :  설치된 의존성 검증
#       3)  all (build)    :  소스 컴파일 + 링크 (의존성 누락 시 자동 설치)
#       4)  run            :  빌드된 실행 파일 실행
#       5)  install-desktop:  GNOME 런처/아이콘 등록
#       6)  clean / distclean : 산출물 정리
#       7)  info / debug   :  부가 도구
#
#   세부 패키지명/명령어는 각 단계 안에서만 다루므로, 큰 흐름을 보고
#   필요한 단계로 들어가시면 됩니다.
# =====================================================================

# ---------------------------------------------------------------------
# 0. 기본 설정
# ---------------------------------------------------------------------
CC          = gcc
CFLAGS      = -Wall -Wextra -O2 -std=c11
TARGET      = easymd
APP_NAME    = "EasyMD GTK"

UNAME_S    := $(shell uname -s)

# WebKit2 패키지명은 배포판마다 다르므로 자동 감지합니다.
# (Ubuntu 22.04+, Fedora: webkit2gtk-4.1 / 그 외 구형: webkit2gtk-4.0)
#
# 주의: `=` (recursive) 로 정의해 컴파일 시점마다 다시 평가되도록 했습니다.
#       이렇게 해야 _assert-deps 가 자동 설치 후 4.0 으로 폴백한 경우에도
#       이어지는 컴파일 단계에서 올바른 패키지명이 잡힙니다.
WEBKIT_PC = $(shell pkg-config --exists webkit2gtk-4.1 && echo webkit2gtk-4.1 \
                || (pkg-config --exists webkit2gtk-4.0 && echo webkit2gtk-4.0) \
                || echo webkit2gtk-4.1)

PKGS       = gtk+-3.0 $(WEBKIT_PC) libcmark

ifeq ($(UNAME_S),Linux)
    # GtkPrinter / gtk_enumerate_printers (PDF export to file)
    PKGS      += gtk+-unix-print-3.0
    PLATFORM   = linux
else ifeq ($(UNAME_S),Darwin)
    PLATFORM   = macos
    # Homebrew는 /opt/homebrew(Apple Silicon) 또는 /usr/local(Intel)에 설치됩니다.
    # pkg-config가 Homebrew 라이브러리를 찾을 수 있도록 PKG_CONFIG_PATH를 설정합니다.
    BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /usr/local)
    export PKG_CONFIG_PATH := \
        $(BREW_PREFIX)/lib/pkgconfig:\
        $(BREW_PREFIX)/opt/gtk+3/lib/pkgconfig:\
        $(BREW_PREFIX)/opt/webkitgtk/lib/pkgconfig:\
        $(BREW_PREFIX)/opt/webkitgtk@4.1/lib/pkgconfig:\
        $(BREW_PREFIX)/opt/cmark/lib/pkgconfig:\
        $(PKG_CONFIG_PATH)
else
$(error Unsupported OS: $(UNAME_S). Supported: Linux, macOS)
endif

# 컴파일/링크 플래그도 `=` 로 두어 명령어 시점에 pkg-config 가 다시 호출되게
# 합니다. (자동 설치 직후의 컴파일에서도 유효한 -I/-l 플래그를 받기 위함)
GTK_CFLAGS = $(shell pkg-config --cflags $(PKGS))
GTK_LIBS   = $(shell pkg-config --libs   $(PKGS)) -lz

# Sources are split into two layers:
#
#   * Core layer  (no GTK; glib + cmark only)
#   * UI layer    (GTK + WebKit2)
#
# Keeping them visible in the Makefile makes the build dependency clear.

# Update for new directory structure
CORE_SOURCES = source/mdcore.c source/fileio_core.c source/utils.c
UI_SOURCES   = source/main.c source/ui.c source/editor.c source/preview.c source/outline.c source/fileio.c

CORE_HEADERS = include/mdcore.h include/fileio_core.h include/utils.h
UI_HEADERS   = include/ui.h include/editor.h include/preview.h include/outline.h include/fileio.h

SOURCES  = $(CORE_SOURCES) $(UI_SOURCES)
HEADERS  = $(CORE_HEADERS) $(UI_HEADERS)
BUILDDIR = build
OBJECTS  = $(patsubst source/%.c,$(BUILDDIR)/%.o,$(SOURCES))

# ---------------------------------------------------------------------
# 1. 빌드 (compile + link)
#
#    빌드 시작 전 _assert-deps 가 먼저 동작합니다.
#      - 의존성이 모두 설치된 경우       : 그대로 컴파일/링크로 진행
#      - 일부 패키지가 누락된 경우       : 자동으로 'make install-deps' 호출
#      - EASYMD_AUTO_INSTALL=0 환경변수  : 자동 설치 비활성화 (수동 안내만)
#
#    이 덕분에 사용자는 그냥 `make` 한 줄만 쳐도 누락된 dev 패키지가 알아서
#    깔린 뒤 빌드까지 이어집니다(=`make setup` 과 동등). sudo 비밀번호는
#    apt 단계에서 한 번만 묻습니다.
# ---------------------------------------------------------------------
.PHONY: all _assert-deps
all: _assert-deps $(TARGET)

# pkg-config 는 여러 패키지를 한 번에 묻는데, 그 중 하나라도 없으면
# stdout 에 아무것도 출력하지 않습니다. 그래서 PKGS 전체를 한 번에 호출
# 하기 전에, 패키지를 하나씩 검사해 누락된 것을 모아 보여줍니다.
_assert-deps:
	@missing=""; \
	pkg-config --exists gtk+-3.0     2>/dev/null || missing="$$missing libgtk-3-dev"; \
	pkg-config --exists gtk+-unix-print-3.0 2>/dev/null || missing="$$missing libgtk-3-dev"; \
	pkg-config --exists libcmark     2>/dev/null || missing="$$missing libcmark-dev"; \
	if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	   && ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then \
	    missing="$$missing libwebkit2gtk-4.1-dev"; \
	fi; \
	if command -v fc-list > /dev/null 2>&1; then \
	    fc-list | grep -qi "Fira"     || missing="$$missing fonts-firacode"; \
	    fc-list | grep -qi "Noto Sans" || missing="$$missing fonts-noto"; \
	fi; \
	if [ -n "$$missing" ]; then \
	    echo ""; \
	    echo "  [!] 빌드 의존성 누락 감지:$$missing"; \
	    if [ "$${EASYMD_AUTO_INSTALL:-1}" = "1" ]; then \
	        echo "  ==> 자동으로 'make install-deps' 를 실행합니다 (sudo 비밀번호 필요)."; \
	        echo "      자동 설치를 원치 않으면:  EASYMD_AUTO_INSTALL=0 make"; \
	        echo ""; \
	        $(MAKE) --no-print-directory install-deps || { \
	            echo ""; \
	            echo "  [X] 자동 설치 실패. 수동으로 시도해 주세요:"; \
	            echo "      sudo apt-get install -y$$missing build-essential pkg-config"; \
	            exit 1; \
	        }; \
	    else \
	        echo "      EASYMD_AUTO_INSTALL=0 → 자동 설치 비활성화 상태"; \
	        echo "      직접 설치:  make install-deps"; \
	        echo "      수동 명령:  sudo apt-get install -y$$missing build-essential pkg-config"; \
	        echo ""; \
	        exit 1; \
	    fi; \
	fi

$(TARGET): $(OBJECTS)
	@echo "[ LD ] $(TARGET)"
	@$(CC) $(OBJECTS) -o $(TARGET) $(GTK_LIBS)
	@echo "Build complete for $(PLATFORM) ($(WEBKIT_PC))"

$(BUILDDIR)/%.o: source/%.c $(HEADERS) | $(BUILDDIR)
	@echo "[ CC ] $<"
	@$(CC) $(CFLAGS) $(GTK_CFLAGS) -Iinclude -c $< -o $@

$(BUILDDIR):
	@mkdir -p $(BUILDDIR)

# ---------------------------------------------------------------------
# 2. 의존성 설치 (install-deps) + 원클릭 설정 (setup)
#
#    install-deps 는 다음을 수행합니다:
#      a) 누락된 패키지만 골라내어 (이미 깔린 패키지는 건너뜀)
#      b) 배포판 패키지 매니저로 설치한 뒤
#      c) check-deps 로 결과를 검증
#
#    setup 은 처음 빌드하는 사용자를 위한 원클릭 entry point 로,
#    install-deps → all 을 한 번에 진행합니다.
# ---------------------------------------------------------------------
.PHONY: setup install-deps

setup:
	@echo "==> [1/2] 의존성 설치"
	@$(MAKE) --no-print-directory install-deps
	@echo ""
	@echo "==> [2/2] 빌드"
	@$(MAKE) --no-print-directory all
	@echo ""
	@echo "==> Setup 완료. 실행: ./$(TARGET)  또는  make run"

install-deps:
	@echo "==> Installing dependencies for $(PLATFORM)..."
ifeq ($(UNAME_S),Linux)
	@# (a) 누락된 패키지 식별 — 패키지 매니저가 동일한 라이브러리에 대해
	@#     쓰는 이름이 서로 달라, 검사 결과를 매니저별로 가공합니다.
	@need_gtk=0; need_cmark=0; need_webkit=0; need_fira=0; need_noto=0; \
	pkg-config --exists gtk+-3.0     2>/dev/null || need_gtk=1; \
	pkg-config --exists libcmark     2>/dev/null || need_cmark=1; \
	if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	   && ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then need_webkit=1; fi; \
	fc-list 2>/dev/null | grep -qi "Fira"     || need_fira=1; \
	fc-list 2>/dev/null | grep -qi "Noto Sans" || need_noto=1; \
	echo "    detected:  GTK+3=$$( [ $$need_gtk -eq 0 ]    && echo OK || echo MISSING )" \
	     " WebKit2=$$( [ $$need_webkit -eq 0 ] && echo OK || echo MISSING )" \
	     " cmark=$$( [ $$need_cmark -eq 0 ]   && echo OK || echo MISSING )" \
	     " FiraCode=$$( [ $$need_fira -eq 0 ] && echo OK || echo MISSING )" \
	     " NotoSans=$$( [ $$need_noto -eq 0 ] && echo OK || echo MISSING )"; \
	\
	if command -v apt-get > /dev/null; then \
	    echo "    using: apt-get"; \
	    pkgs="build-essential pkg-config"; \
	    [ $$need_gtk    -ne 0 ] && pkgs="$$pkgs libgtk-3-dev"; \
	    [ $$need_cmark  -ne 0 ] && pkgs="$$pkgs libcmark-dev"; \
	    [ $$need_webkit -ne 0 ] && pkgs="$$pkgs libwebkit2gtk-4.1-dev"; \
	    [ $$need_fira   -ne 0 ] && pkgs="$$pkgs fonts-firacode"; \
	    [ $$need_noto   -ne 0 ] && pkgs="$$pkgs fonts-noto-core fonts-noto-cjk"; \
	    sudo apt-get update; \
	    sudo apt-get install -y $$pkgs \
	    || ( [ $$need_webkit -ne 0 ] && \
	         echo "    libwebkit2gtk-4.1-dev 실패 → 4.0 로 재시도..." && \
	         sudo apt-get install -y \
	            $$(echo $$pkgs | sed 's/libwebkit2gtk-4.1-dev/libwebkit2gtk-4.0-dev/') ); \
	elif command -v dnf > /dev/null; then \
	    echo "    using: dnf"; \
	    pkgs="gcc make pkg-config"; \
	    [ $$need_gtk    -ne 0 ] && pkgs="$$pkgs gtk3-devel"; \
	    [ $$need_cmark  -ne 0 ] && pkgs="$$pkgs cmark-devel"; \
	    [ $$need_webkit -ne 0 ] && pkgs="$$pkgs webkit2gtk4.1-devel"; \
	    [ $$need_fira   -ne 0 ] && pkgs="$$pkgs fira-code-fonts"; \
	    [ $$need_noto   -ne 0 ] && pkgs="$$pkgs google-noto-sans-fonts google-noto-sans-cjk-fonts"; \
	    sudo dnf install -y $$pkgs; \
	elif command -v pacman > /dev/null; then \
	    echo "    using: pacman"; \
	    pkgs="base-devel pkg-config"; \
	    [ $$need_gtk    -ne 0 ] && pkgs="$$pkgs gtk3"; \
	    [ $$need_cmark  -ne 0 ] && pkgs="$$pkgs cmark"; \
	    [ $$need_webkit -ne 0 ] && pkgs="$$pkgs webkit2gtk-4.1"; \
	    [ $$need_fira   -ne 0 ] && pkgs="$$pkgs ttf-fira-code"; \
	    [ $$need_noto   -ne 0 ] && pkgs="$$pkgs noto-fonts noto-fonts-cjk"; \
	    sudo pacman -S --needed $$pkgs; \
	else \
	    echo "    !! 지원하지 않는 패키지 매니저입니다. README 참고하여 수동 설치 부탁드립니다."; \
	    exit 1; \
	fi
else ifeq ($(UNAME_S),Darwin)
	@# ── macOS: Homebrew 필수 ───────────────────────────────────────
	@if ! command -v brew > /dev/null; then \
	    echo "    !! Homebrew 가 필요합니다: https://brew.sh/"; \
	    exit 1; \
	fi
	@BREW_PREFIX=$$(brew --prefix); \
	export PKG_CONFIG_PATH="$$BREW_PREFIX/lib/pkgconfig:$$BREW_PREFIX/opt/gtk+3/lib/pkgconfig:$$BREW_PREFIX/opt/webkitgtk/lib/pkgconfig:$$BREW_PREFIX/opt/webkitgtk@4.1/lib/pkgconfig:$$BREW_PREFIX/opt/cmark/lib/pkgconfig:$$PKG_CONFIG_PATH"; \
	need_gtk=0; need_cmark=0; need_webkit=0; need_fira=0; \
	pkg-config --exists gtk+-3.0 2>/dev/null || need_gtk=1; \
	pkg-config --exists libcmark 2>/dev/null || need_cmark=1; \
	if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	   && ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then need_webkit=1; fi; \
	command -v fc-list > /dev/null 2>&1 \
	    && { fc-list | grep -qi "Fira" || need_fira=1; } \
	    || need_fira=1; \
	echo "    detected:  GTK+3=$$( [ $$need_gtk -eq 0 ] && echo OK || echo MISSING )" \
	     " WebKit2=$$( [ $$need_webkit -eq 0 ] && echo OK || echo MISSING )" \
	     " cmark=$$( [ $$need_cmark -eq 0 ] && echo OK || echo MISSING )" \
	     " FiraCode=$$( [ $$need_fira -eq 0 ] && echo OK || echo MISSING )"; \
	echo "    using: Homebrew"; \
	pkgs="pkg-config"; \
	[ $$need_gtk    -ne 0 ] && pkgs="$$pkgs gtk+3"; \
	[ $$need_cmark  -ne 0 ] && pkgs="$$pkgs cmark"; \
	[ $$need_webkit -ne 0 ] && pkgs="$$pkgs webkitgtk"; \
	if [ "$$pkgs" != "pkg-config" ]; then \
	    brew install $$pkgs \
	    || { [ $$need_webkit -ne 0 ] \
	         && echo "    webkitgtk 실패 → webkitgtk@4.0 재시도..." \
	         && brew install $$(echo $$pkgs | sed 's/webkitgtk/webkitgtk@4.0/'); }; \
	fi; \
	if [ $$need_fira -ne 0 ]; then \
	    echo "    Fira Code 폰트 설치 (Homebrew Cask)..."; \
	    brew install --cask font-fira-code 2>/dev/null \
	    || { brew tap homebrew/cask-fonts 2>/dev/null \
	         && brew install --cask font-fira-code 2>/dev/null; } \
	    || echo "  [!] Fira Code 자동 설치 실패 → 수동: brew install --cask font-fira-code"; \
	fi
endif
	@echo ""
	@echo "==> 설치 결과 검증 (check-deps)..."
	@$(MAKE) --no-print-directory check-deps
	@echo "==> Dependencies installed and verified."

# ---------------------------------------------------------------------
# 3. 의존성 점검 (check-deps)
#    어떤 도구/라이브러리가 빠졌는지 빌드 전에 빠르게 확인합니다.
# ---------------------------------------------------------------------
.PHONY: check-deps
check-deps:
	@echo "==> Checking dependencies..."
	@command -v pkg-config > /dev/null \
		|| (echo "  [X] pkg-config 미설치 → 'make install-deps'" && exit 1)
	@pkg-config --exists gtk+-3.0 \
		|| (echo "  [X] GTK+ 3 미설치 → 'make install-deps'" && exit 1)
	@pkg-config --exists $(WEBKIT_PC) \
		|| (echo "  [X] WebKit2GTK ($(WEBKIT_PC)) 미설치 → 'make install-deps'" && exit 1)
	@pkg-config --exists libcmark \
		|| (echo "  [X] libcmark 미설치 → 'make install-deps'" && exit 1)
	@echo "  [O] gtk+-3.0     $(shell pkg-config --modversion gtk+-3.0)"
	@echo "  [O] $(WEBKIT_PC)  $(shell pkg-config --modversion $(WEBKIT_PC))"
	@echo "  [O] libcmark     $(shell pkg-config --modversion libcmark)"
	@if command -v fc-list > /dev/null 2>&1; then \
		if fc-list | grep -qi "Fira"; then \
			echo "  [O] Fira Code    (설치됨)"; \
		else \
			echo "  [!] Fira Code    미설치 (권장) → 'make install-deps'"; \
		fi; \
		if fc-list | grep -qi "Noto Sans"; then \
			echo "  [O] Noto Sans    (설치됨)"; \
		else \
			echo "  [!] Noto Sans    미설치 (권장) → 'make install-deps'"; \
		fi; \
	else \
		echo "  [?] 폰트 확인 불가 (fc-list 없음 — fontconfig 미설치)"; \
	fi
	@echo "==> All dependencies satisfied."

# ---------------------------------------------------------------------
# 4. 실행 (run)
# ---------------------------------------------------------------------
.PHONY: run
run: $(TARGET)
	@echo "[ RUN ] ./$(TARGET)"
	@./$(TARGET)

# ---------------------------------------------------------------------
# 5. 데스크톱 통합 (install-desktop)
#    Linux 한정. ~/.local/share 에 .desktop / 아이콘을 등록합니다.
#
#    아이콘 등록 흐름:
#      a) daemon_hammer.ico 를 hicolor 테마(256x256/apps)에 easymd.ico
#         (있다면 .png/.jpg 도) 로 복사 → 테마명 "easymd" 로 검색되게 함
#      b) 만약 hicolor 트리에 .ico 만 들어가서 테마 검색이 실패하더라도
#         확실히 동작하도록, .desktop 파일의 Icon= 항목은 소스 트리의
#         daemon_hammer.ico 절대경로로 치환해 둡니다.
#      c) gtk-update-icon-cache / update-desktop-database 가 있으면 호출
# ---------------------------------------------------------------------
.PHONY: install-desktop
install-desktop: $(TARGET)
ifeq ($(UNAME_S),Linux)
	@echo "[ INSTALL ] Desktop entry + app icon"
	@mkdir -p "$$HOME/.local/share/applications"
	@mkdir -p "$$HOME/.local/share/icons/hicolor/256x256/apps"
	@# (a) Copy bundled icon(s) into the hicolor theme as "easymd.*".
	@if [ -f daemon_hammer.ico ]; then \
		cp -f daemon_hammer.ico "$$HOME/.local/share/icons/hicolor/256x256/apps/easymd.ico"; \
		echo "    icon -> $$HOME/.local/share/icons/hicolor/256x256/apps/easymd.ico"; \
	fi
	@if [ -f daemon_hammer.png ]; then \
		cp -f daemon_hammer.png "$$HOME/.local/share/icons/hicolor/256x256/apps/easymd.png"; \
		echo "    icon -> $$HOME/.local/share/icons/hicolor/256x256/apps/easymd.png"; \
	fi
	@if [ -f daemon_hammer.jpg ]; then \
		cp -f daemon_hammer.jpg "$$HOME/.local/share/icons/hicolor/256x256/apps/easymd.jpg"; \
	fi
	@# (b) Write the .desktop file with absolute paths so it works even
	@#     before any icon-cache refresh and regardless of theme support.
	@sed -e "s|^Exec=.*|Exec=$(CURDIR)/$(TARGET) %F|" \
	     -e "s|^Icon=.*|Icon=$(CURDIR)/daemon_hammer.ico|" \
	     easymd.desktop > "$$HOME/.local/share/applications/easymd.desktop"
	@chmod +x "$$HOME/.local/share/applications/easymd.desktop"
	@# (c) Refresh caches if the helpers are available (best-effort).
	@command -v update-desktop-database > /dev/null \
		&& update-desktop-database "$$HOME/.local/share/applications" || true
	@command -v gtk-update-icon-cache > /dev/null \
		&& gtk-update-icon-cache -f -t "$$HOME/.local/share/icons/hicolor" 2>/dev/null \
		|| true
	@echo "Installed: $$HOME/.local/share/applications/easymd.desktop"
else
	@echo "install-desktop is Linux-only."
endif

# ---------------------------------------------------------------------
# 6. 정리 (clean / distclean)
# ---------------------------------------------------------------------
.PHONY: clean distclean
clean:
	@echo "[ CLEAN ] Removing build artifacts..."
	@rm -rf $(BUILDDIR)/ $(TARGET)
	@echo "Clean complete"

distclean: clean
	@echo "[ CLEAN ] Removing all generated files..."
	@rm -rf .deps/
	@echo "Distribution clean complete"

# ---------------------------------------------------------------------
# 7. 부가 도구 (debug / info / core-only)
# ---------------------------------------------------------------------
.PHONY: debug info core-only
debug: CFLAGS += -g -DDEBUG -O0
debug: clean all

# core-only 는 GTK 비의존 코어 레이어만 컴파일해서 분리가 실제로 유지되고
# 있는지(코어 파일이 GTK 헤더를 끌어오지 않는지) 검증합니다.
CORE_OBJECTS = $(patsubst source/%.c,$(BUILDDIR)/%.o,$(CORE_SOURCES))
CORE_PKGS    = glib-2.0 libcmark
core-only:
	@echo "==> Building core layer only (no GTK)..."
	@for src in $(CORE_SOURCES); do \
		echo "[ CC ] $$src (core)"; \
		$(CC) $(CFLAGS) $(shell pkg-config --cflags $(CORE_PKGS)) \
			-c $$src -o $$(basename $$src .c).core.o || exit 1; \
	done
	@echo "==> Core layer compiles independently of GTK."
	@rm -f *.core.o

info:
	@echo "========================================"
	@echo "  EasyMD GTK Build Configuration"
	@echo "========================================"
	@echo "App:           $(APP_NAME)"
	@echo "Platform:      $(PLATFORM)"
	@echo "Compiler:      $(CC)"
	@echo "CFLAGS:        $(CFLAGS)"
	@echo "Pkgs:          $(PKGS)"
	@echo "Core sources:  $(CORE_SOURCES)"
	@echo "UI   sources:  $(UI_SOURCES)"
	@echo "Target:        $(TARGET)"
	@echo "========================================"

# ---------------------------------------------------------------------
# 8. 도움말 (help)
# ---------------------------------------------------------------------
.PHONY: help
help:
	@echo "EasyMD GTK - 사용 가능한 make 타겟:"
	@echo ""
	@echo "  ── 처음 빌드하시나요? ──────────────────────────────────────"
	@echo "  make                  의존성 자동 감지 → (필요시) 자동 설치 → 빌드"
	@echo "                        (sudo 비밀번호는 설치가 필요한 경우에만 묻습니다)"
	@echo "  make setup            위와 동일한 동작 (명시적 alias)"
	@echo ""
	@echo "  ── 자동 설치 제어 ─────────────────────────────────────────"
	@echo "  EASYMD_AUTO_INSTALL=0 make    자동 설치 비활성화 (수동 안내만)"
	@echo ""
	@echo "  ── 단계별로 ────────────────────────────────────────────────"
	@echo "  make install-deps     의존성 자동 설치 (sudo 필요)"
	@echo "  make check-deps       의존성 점검"
	@echo "  make run              빌드 + 실행"
	@echo "  make install-desktop  데스크톱 런처 등록 (Linux)"
	@echo ""
	@echo "  ── 부가 기능 ────────────────────────────────────────────────"
	@echo "  make core-only        코어 레이어만 컴파일 (GTK 분리 검증)"
	@echo "  make debug            디버그 빌드"
	@echo "  make info             빌드 설정 표시"
	@echo "  make clean            산출물 정리"
	@echo "  make distclean        모든 생성물 정리"
