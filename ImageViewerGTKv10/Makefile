# =====================================================================
#   ImageViewer GTK v1.0 — Linux / macOS
#
#   처음 사용자:  make          (누락 패키지 감지 → 자동 설치 → 빌드)
#                 make setup    (위와 동일)
#
#   자동 설치 끄기:  IV_AUTO_INSTALL=0 make
#   상세 로그:      IV_VERBOSE=1 make
# =====================================================================

CC       = gcc
CFLAGS   = -Wall -Wextra -O2 -std=c11
TARGET   = imageviewer
APP_NAME = ImageViewer GTK

UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
    PLATFORM = linux
else ifeq ($(UNAME_S),Darwin)
    PLATFORM = macos
else
$(error Unsupported OS: $(UNAME_S). Supported: Linux, macOS)
endif

# pkg-config 결과는 `=` 로 두어 install-deps 직후 같은 make 실행에서
# 다시 평가되도록 합니다.
VLC_PC     = $(shell pkg-config --exists libvlc 2>/dev/null && echo libvlc)
PKGS       = gtk+-3.0 gdk-pixbuf-2.0 $(VLC_PC)
VLC_CFLAGS = $(if $(VLC_PC),-DHAVE_LIBVLC,-DNO_LIBVLC)
GTK_CFLAGS = $(shell pkg-config --cflags $(PKGS) 2>/dev/null) $(VLC_CFLAGS)
GTK_LIBS   = $(shell pkg-config --libs $(PKGS) 2>/dev/null) -lm

SOURCES = main.c app.c browser.c preview.c state.c utils.c image_io.c
HEADERS = app.h browser.h preview.h state.h utils.h image_io.h
OBJECTS = $(SOURCES:.c=.o)

# `make` 만 입력했을 때 반드시 all(설치+빌드)이 실행되도록 지정
.DEFAULT_GOAL := all

# IV_VERBOSE=1 이면 컴파일 명령·의존성 상세 표시 (기본: 간략)
ifeq ($(IV_VERBOSE),1)
    BUILD_HIDE =
else
    BUILD_HIDE = @
endif

# 의존성 검사 + 요약 문자열 (fail/miss/heif_ok 설정)
define IV_DEPS_CHECK
fail=0; miss=""; heif_ok=0; \
command -v pkg-config >/dev/null 2>&1 || { fail=1; miss="$$miss pkg-config"; }; \
command -v $(CC) >/dev/null 2>&1 || { fail=1; miss="$$miss gcc"; }; \
pkg-config --exists gtk+-3.0 2>/dev/null || { fail=1; miss="$$miss gtk3"; }; \
pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || { fail=1; miss="$$miss pixbuf"; }; \
pkg-config --exists libvlc 2>/dev/null || { fail=1; miss="$$miss libvlc"; }; \
if gdk-pixbuf-query-loaders 2>/dev/null | grep -qi heif; then heif_ok=1; fi; \
if ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
if ls /usr/local/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
[ $$heif_ok -eq 1 ] || { fail=1; miss="$$miss HEIF"; };
endef

.PHONY: all setup install-deps check-deps run clean distclean debug info \
        install-desktop install-assets help _ensure-deps _do-build \
        _refresh-pixbuf-loaders _deps-report _deps-brief deps _build-banner \
        _deps-missing

# ---------------------------------------------------------------------
# make / make all (기본): 의존성 자동 설치 → 빌드
# ---------------------------------------------------------------------
all:
	@$(MAKE) --no-print-directory _ensure-deps
	@$(MAKE) --no-print-directory _do-build

_do-build: install-assets _build-banner $(TARGET)

# ---------------------------------------------------------------------
# 의존성 상태 표시 (공통)
#   DEPS_FAIL=1  → 누락 시 종료 코드 1 (check-deps)
#   DEPS_TITLE=… → 표 제목 줄
# ---------------------------------------------------------------------
# make all 용 — 한 줄 요약
_deps-brief:
	@$(IV_DEPS_CHECK) \
	gv=$$(pkg-config --modversion gtk+-3.0 2>/dev/null); \
	pv=$$(pkg-config --modversion gdk-pixbuf-2.0 2>/dev/null); \
	vv=$$(pkg-config --modversion libvlc 2>/dev/null); \
	cv=$$($(CC) -dumpversion 2>/dev/null); \
	if [ $$fail -eq 0 ]; then \
	    printf 'deps OK   gtk:%s  pixbuf:%s  vlc:%s  HEIF  gcc:%s\n' \
	        "$${gv:-?}" "$${pv:-?}" "$${vv:-?}" "$${cv:-?}"; \
	else \
	    printf 'deps MISS —%s  (make install-deps)\n' "$$miss"; \
	fi

# make deps / check-deps — 2~3줄 요약
_deps-report:
	@$(IV_DEPS_CHECK) \
	gv=$$(pkg-config --modversion gtk+-3.0 2>/dev/null); \
	pv=$$(pkg-config --modversion gdk-pixbuf-2.0 2>/dev/null); \
	vv=$$(pkg-config --modversion libvlc 2>/dev/null); \
	cv=$$($(CC) -dumpversion 2>/dev/null); \
	printf '\n  %s | %s/%s | %s\n' \
	    "$(APP_NAME)" "$(PLATFORM)" "$$(uname -m)" "$(TARGET)"; \
	if [ $$fail -eq 0 ]; then \
	    printf '  [O] gtk:%s  pixbuf:%s  vlc:%s  HEIF  gcc:%s  libvlc:%s\n' \
	        "$${gv:-?}" "$${pv:-?}" "$${vv:-?}" "$${cv:-?}" \
	        "$(if $(VLC_PC),ON,OFF)"; \
	    printf '  → OK\n\n'; \
	else \
	    printf '  [X] 누락:%s\n  → make install-deps\n\n' "$$miss"; \
	fi; \
	if [ "$${IV_VERBOSE:-0}" = "1" ]; then \
	    printf '  상세: OS %s  pkg-config %s  자동설치 %s\n' \
	        "$$(uname -sr)" \
	        "$$(pkg-config --version 2>/dev/null)" \
	        "$${IV_AUTO_INSTALL:-1}"; \
	    heif_loader=""; \
	    if ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | head -1 | grep -q .; then \
	        heif_loader=$$(ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | head -1); \
	    fi; \
	    [ -n "$$heif_loader" ] && printf '  HEIF: %s\n' "$$heif_loader"; \
	    command -v vlc >/dev/null 2>&1 && \
	        printf '  vlc: %s\n' "$$(command -v vlc)"; \
	    printf '\n'; \
	fi; \
	if [ "$${DEPS_FAIL:-0}" = "1" ] && [ $$fail -ne 0 ]; then exit 1; fi

# 누락 여부만 반환 (0=충족, 1=누락)
_deps-missing:
	@heif_ok=0; miss=0; \
	command -v pkg-config >/dev/null 2>&1 || miss=1; \
	command -v $(CC) >/dev/null 2>&1 || miss=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || miss=1; \
	pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || miss=1; \
	pkg-config --exists libvlc 2>/dev/null || miss=1; \
	if gdk-pixbuf-query-loaders 2>/dev/null | grep -qi heif; then heif_ok=1; fi; \
	if ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
	if ls /usr/local/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
	[ $$heif_ok -eq 1 ] || miss=1; \
	exit $$miss

_build-banner:
	@printf '  build %s  (%s, %s, libvlc:%s, %s files)\n' \
	    "$(TARGET)" "$(PLATFORM)" "$(CC)" \
	    "$(if $(VLC_PC),on,off)" "$$(echo $(SOURCES) | wc -w)"

_ensure-deps:
	@printf '  [1/2] '; $(MAKE) --no-print-directory _deps-brief
	@if ! $(MAKE) --no-print-directory _deps-missing; then \
	    if [ "$${IV_AUTO_INSTALL:-1}" = "1" ]; then \
	        printf '  [2/2] 패키지 설치 중… (sudo)\n'; \
	        $(MAKE) --no-print-directory install-deps || { \
	            printf '  [X] 설치 실패 — make install-deps\n'; exit 1; }; \
	        rm -f $(OBJECTS) $(TARGET); \
	        printf '  [2/2] '; $(MAKE) --no-print-directory _deps-brief; \
	    else \
	        printf '  [X] 의존성 누락 — make install-deps\n'; exit 1; \
	    fi; \
	fi

$(TARGET): $(OBJECTS)
	@printf '  link %s\n' "$(TARGET)"
	$(BUILD_HIDE)$(CC) $(OBJECTS) -o $(TARGET) $(GTK_LIBS)
	@printf '\n  done  ./%s  (libvlc:%s)\n\n' \
	    "$(TARGET)" "$(if $(VLC_PC),on,off)"

%.o: %.c $(HEADERS)
	@if [ "$(IV_VERBOSE)" = "1" ]; then printf '  cc %s\n' '$<'; fi
	@test -n "$(GTK_CFLAGS)" || { \
	    printf '  [X] pkg-config 없음 — make install-deps\n'; exit 1; \
	}
	$(BUILD_HIDE)$(CC) $(CFLAGS) $(GTK_CFLAGS) -c $< -o $@

install-assets:
	@if [ "$(IV_VERBOSE)" = "1" ]; then printf '  assets\n'; fi
	@mkdir -p assets/icons
	@if [ ! -f assets/icons/folder-closed.png ] && [ -d ../ImageViewerV10/assets/icons ]; then \
	    cp -n ../ImageViewerV10/assets/icons/*.png assets/icons/ 2>/dev/null || true; \
	fi
	@if [ ! -f daemon_hammer.ico ] && [ -f ../daemon_hammer.ico ]; then \
	    ln -sf ../daemon_hammer.ico daemon_hammer.ico 2>/dev/null || \
	    cp -n ../daemon_hammer.ico daemon_hammer.ico 2>/dev/null || true; \
	fi

setup: all
	@printf '  setup 완료  ./%s\n' "$(TARGET)"

# ---------------------------------------------------------------------
# 의존성 설치 (누락된 패키지만 골라 설치)
# ---------------------------------------------------------------------
install-deps:
	@printf '  install-deps (%s)\n' "$(PLATFORM)"
	@$(MAKE) --no-print-directory _deps-brief
ifeq ($(UNAME_S),Linux)
	@need_pm=0; need_cc=0; need_gtk=0; need_pixbuf=0; need_vlc=0; need_heif=0; \
	command -v pkg-config >/dev/null 2>&1 || need_pm=1; \
	command -v $(CC) >/dev/null 2>&1 || need_cc=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || need_gtk=1; \
	pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || need_pixbuf=1; \
	pkg-config --exists libvlc 2>/dev/null || need_vlc=1; \
	heif_ok=0; \
	if gdk-pixbuf-query-loaders 2>/dev/null | grep -qi heif; then heif_ok=1; fi; \
	if ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
	if [ $$heif_ok -eq 0 ]; then need_heif=1; fi; \
	if command -v apt-get >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs build-essential pkg-config"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs libgtk-3-dev"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs libgdk-pixbuf-2.0-dev"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs libvlc-dev vlc"; \
	    [ $$need_heif -ne 0 ] && pkgs="$$pkgs libheif1 libheif-plugin-gdk-pixbuf"; \
	    if [ -n "$$pkgs" ]; then \
	        printf '  apt-get install%s\n' "$$pkgs"; \
	        sudo apt-get update && sudo apt-get install -y $$pkgs; \
	    else printf '  apt: 설치할 패키지 없음\n'; fi; \
	elif command -v dnf >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs gcc make pkg-config"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3-devel"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs gdk-pixbuf2-devel"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs vlc-devel vlc"; \
	    [ $$need_heif -ne 0 ] && pkgs="$$pkgs libheif libheif-heif gdk-pixbuf2-modules-extra"; \
	    if [ -n "$$pkgs" ]; then \
	        printf '  dnf install%s\n' "$$pkgs"; \
	        sudo dnf install -y $$pkgs; \
	    else printf '  dnf: 설치할 패키지 없음\n'; fi; \
	elif command -v pacman >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs base-devel"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs gdk-pixbuf2"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs vlc"; \
	    [ $$need_heif -ne 0 ] && pkgs="$$pkgs libheif"; \
	    if [ -n "$$pkgs" ]; then \
	        printf '  pacman -S%s\n' "$$pkgs"; \
	        sudo pacman -S --needed --noconfirm $$pkgs; \
	    else printf '  pacman: 설치할 패키지 없음\n'; fi; \
	else \
	    printf '  [X] 지원하지 않는 패키지 매니저\n'; exit 1; \
	fi
	@$(MAKE) --no-print-directory _refresh-pixbuf-loaders
else ifeq ($(UNAME_S),Darwin)
	@command -v brew >/dev/null 2>&1 || { \
	    printf '  [X] Homebrew 필요 https://brew.sh/\n'; exit 1; }
	@printf '  brew: pkg-config gtk+3 gdk-pixbuf libheif vlc\n'
	@brew list pkg-config >/dev/null 2>&1 || brew install pkg-config
	@brew list gtk+3 >/dev/null 2>&1 || brew install gtk+3
	@brew list gdk-pixbuf >/dev/null 2>&1 || brew install gdk-pixbuf
	@brew list libheif >/dev/null 2>&1 || brew install libheif
	@brew list vlc >/dev/null 2>&1 || brew install vlc
endif
	@$(MAKE) --no-print-directory _deps-brief

_refresh-pixbuf-loaders:
ifeq ($(UNAME_S),Linux)
	@if command -v update-gdk-pixbuf-loaders >/dev/null 2>&1; then \
	    [ "$(IV_VERBOSE)" = "1" ] && printf '  gdk-pixbuf loaders refresh\n'; \
	    sudo update-gdk-pixbuf-loaders 2>/dev/null || update-gdk-pixbuf-loaders 2>/dev/null || true; \
	fi
endif

check-deps:
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=1

deps:
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0

run: all
	@./$(TARGET)

clean:
	@rm -f $(OBJECTS) $(TARGET)

distclean: clean

debug: CFLAGS += -g -DDEBUG -O0
debug: clean all

install-desktop: $(TARGET)
ifeq ($(UNAME_S),Linux)
	@mkdir -p "$$HOME/.local/share/applications"
	@mkdir -p "$$HOME/.local/share/icons/hicolor/256x256/apps"
	@sed -e "s|^Exec=.*|Exec=$(CURDIR)/$(TARGET) %F|" \
	     -e "s|^Icon=.*|Icon=$(CURDIR)/daemon_hammer.ico|" \
	     imageviewer.desktop > "$$HOME/.local/share/applications/imageviewer.desktop"
	@[ -f daemon_hammer.ico ] && cp -f daemon_hammer.ico \
	    "$$HOME/.local/share/icons/hicolor/256x256/apps/imageviewer.ico" || true
	@chmod +x "$$HOME/.local/share/applications/imageviewer.desktop"
	@command -v update-desktop-database >/dev/null && \
	    update-desktop-database "$$HOME/.local/share/applications" || true
	@echo "Desktop entry installed."
else
	@echo "install-desktop is Linux-only."
endif

info: _deps-report
	@printf '\n  CFLAGS:     %s\n  GTK_CFLAGS: %s\n  GTK_LIBS:   %s\n  SOURCES:    %s\n\n' \
	    "$(CFLAGS)" "$(GTK_CFLAGS)" "$(GTK_LIBS)" "$(SOURCES)"

help:
	@printf '\n  %s\n' "$(APP_NAME)"; \
	printf '  make              설치+빌드\n'; \
	printf '  make deps         의존성 요약\n'; \
	printf '  make install-deps 패키지 설치\n'; \
	printf '  make run          빌드 후 실행\n'; \
	printf '  make info         의존성+컴파일 플래그\n'; \
	printf '  IV_VERBOSE=1 make 상세 로그\n'; \
	printf '  IV_AUTO_INSTALL=0  자동 설치 끄기\n\n'
