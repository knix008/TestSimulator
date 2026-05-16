# =====================================================================
#   ImageViewer GTK v1.0 — Linux / macOS
#
#   처음 사용자:  make          (누락 패키지 감지 → 자동 설치 → 빌드)
#                 make setup    (위와 동일)
#
#   자동 설치 끄기:  IV_AUTO_INSTALL=0 make
#   컴파일 명령 표시: IV_VERBOSE=1 make
# =====================================================================

CC       = gcc
CFLAGS   = -Wall -Wextra -O2 -std=c11 -DAPP_ICON_FILE=\"$(CURDIR)/daemon_hammer.ico\"
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
GTK_CFLAGS = $(shell pkg-config --cflags $(PKGS) 2>/dev/null) $(VLC_CFLAGS) $(HEIF_CFLAGS)
GTK_LIBS   = $(shell pkg-config --libs $(PKGS) 2>/dev/null) $(HEIF_LIBS) -lm

SOURCES = main.c gtk_app.c gtk_browser.c gtk_preview.c state.c utils.c image_io.c heif_native.c
HEADERS = app.h gtk_app.h gtk_browser.h gtk_preview.h state.h utils.h image_io.h heif_native.h
OBJECTS = $(SOURCES:.c=.o)

# libheif 직접 디코드 (PQ/HLG → sRGB) — libheif-dev 설치 시 활성화
HEIF_PC := $(shell pkg-config --exists libheif 2>/dev/null && echo libheif)
ifneq ($(wildcard /usr/include/libheif/heif.h),)
  ifeq ($(HEIF_PC),)
    HEIF_CFLAGS := -I/usr/include -DHAVE_LIBHEIF
    HEIF_LIBS := -lheif
  else
    HEIF_CFLAGS := $(shell pkg-config --cflags libheif) -DHAVE_LIBHEIF
    HEIF_LIBS := $(shell pkg-config --libs libheif)
  endif
endif
HEIF_CFLAGS ?=
HEIF_LIBS ?=

# `make` 만 입력했을 때 반드시 all(설치+빌드)이 실행되도록 지정
.DEFAULT_GOAL := all

# IV_VERBOSE=1 이면 gcc 전체 명령 줄 표시 (기본: 단계만)
ifeq ($(IV_VERBOSE),1)
    BUILD_HIDE =
else
    BUILD_HIDE = @
endif

define IV_SH_HELPERS
_iv_step() { printf '==> %s\n' "$$*"; }; \
_iv_sub() { printf '    %s\n' "$$*"; }; \
_iv_ok() { printf '    [O] %s\n' "$$*"; }; \
_iv_miss() { printf '    [X] %s\n' "$$*"; };
endef

# 의존성 검사 (fail/miss/heif_ok/heif_dev_ok/hif_tools_ok 설정)
define IV_DEPS_CHECK
fail=0; miss=""; heif_ok=0; heif_dev_ok=0; hif_tools_ok=0; \
command -v pkg-config >/dev/null 2>&1 || { fail=1; miss="$$miss pkg-config"; }; \
command -v $(CC) >/dev/null 2>&1 || { fail=1; miss="$$miss gcc"; }; \
pkg-config --exists gtk+-3.0 2>/dev/null || { fail=1; miss="$$miss gtk3"; }; \
pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || { fail=1; miss="$$miss pixbuf"; }; \
if gdk-pixbuf-query-loaders 2>/dev/null | grep -qi heif; then heif_ok=1; fi; \
if ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
if ls /usr/local/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
[ $$heif_ok -eq 1 ] || { fail=1; miss="$$miss HEIF-loader"; }; \
pkg-config --exists libheif 2>/dev/null && heif_dev_ok=1; \
[ -f /usr/include/libheif/heif.h ] && heif_dev_ok=1; \
[ $$heif_dev_ok -eq 1 ] || { fail=1; miss="$$miss libheif-dev"; }; \
command -v heif-convert >/dev/null 2>&1 && \
command -v ffmpeg >/dev/null 2>&1 && \
{ command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; } && \
hif_tools_ok=1; \
[ $$hif_tools_ok -eq 1 ] || { fail=1; miss="$$miss HIF-tools"; };
endef

.PHONY: all setup install-deps check-deps run clean distclean debug info \
        install-desktop install-assets help _ensure-deps _do-build \
        _refresh-pixbuf-loaders _deps-report deps _build-banner _deps-missing

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
_deps-report:
	@$(IV_SH_HELPERS) $(IV_DEPS_CHECK) \
	_iv_step "$(APP_NAME) — 의존성 ($(PLATFORM)/$$(uname -m), 대상: $(TARGET))"; \
	if command -v pkg-config >/dev/null 2>&1; then \
	    _iv_ok "pkg-config $$(pkg-config --version 2>/dev/null)"; \
	else _iv_miss "pkg-config (build-essential)"; fi; \
	if command -v $(CC) >/dev/null 2>&1; then \
	    _iv_ok "$(CC) $$($(CC) -dumpversion 2>/dev/null)"; \
	else _iv_miss "$(CC) (build-essential)"; fi; \
	if command -v make >/dev/null 2>&1; then \
	    mk=$$(make --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1); \
	    _iv_ok "make $$mk"; \
	else _iv_miss "make"; fi; \
	if pkg-config --exists gtk+-3.0 2>/dev/null; then \
	    _iv_ok "gtk+-3.0 $$(pkg-config --modversion gtk+-3.0)"; \
	else _iv_miss "gtk+-3.0 (libgtk-3-dev)"; fi; \
	if pkg-config --exists gdk-pixbuf-2.0 2>/dev/null; then \
	    _iv_ok "gdk-pixbuf $$(pkg-config --modversion gdk-pixbuf-2.0)"; \
	else _iv_miss "gdk-pixbuf (libgdk-pixbuf-2.0-dev)"; fi; \
	if [ $$heif_ok -eq 1 ]; then \
	    heif_base=$$(basename "$$(ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | head -1)" 2>/dev/null); \
	    [ -z "$$heif_base" ] && heif_base="gdk-pixbuf HEIF"; \
	    _iv_ok "HEIF 미리보기 ($$heif_base)"; \
	else _iv_miss "HEIF 로더 (libheif-plugin-gdk-pixbuf)"; fi; \
	if [ $$heif_dev_ok -eq 1 ]; then \
	    hv=$$(pkg-config --modversion libheif 2>/dev/null || echo "header"); \
	    _iv_ok "libheif $$hv (HIF→JPG 직접 변환)"; \
	else _iv_miss "libheif-dev (HIF→JPG 직접 변환)"; fi; \
	if [ $$hif_tools_ok -eq 1 ]; then _iv_ok "HIF→JPG 보조 (ffmpeg·ImageMagick·heif-convert)"; \
	else _iv_miss "HIF→JPG 보조 도구 (ffmpeg·ImageMagick·heif-convert)"; fi; \
	if pkg-config --exists libvlc 2>/dev/null; then \
	    _iv_ok "libvlc $$(pkg-config --modversion libvlc) (동영상, 선택)"; \
	else _iv_sub "[·] libvlc 없음 — 동영상 미지원 (NO_LIBVLC)"; fi; \
	_iv_sub "libheif 링크: $(if $(HEIF_LIBS),on,off)  libvlc: $(if $(VLC_PC),on,off)"; \
	if [ $$fail -eq 0 ]; then \
	    _iv_sub "→ 의존성 충족"; \
	else \
	    _iv_sub "→ 누락:$$miss — make install-deps"; \
	fi; \
	printf '\n'; \
	if [ "$${DEPS_FAIL:-0}" = "1" ] && [ $$fail -ne 0 ]; then exit 1; fi

# 누락 여부만 반환 (0=충족, 1=누락) — libvlc·ffmpeg 등 선택 기능은 제외
_deps-missing:
	@$(IV_DEPS_CHECK) exit $$fail

_build-banner:
	@$(IV_SH_HELPERS) \
	_iv_step "빌드 — $(TARGET)"; \
	_iv_sub "플랫폼: $(PLATFORM)  컴파일러: $(CC)  libvlc: $(if $(VLC_PC),on,off)"; \
	_iv_sub "소스: $(words $(SOURCES))개 ($(SOURCES))"

_ensure-deps:
	@$(IV_SH_HELPERS) _iv_step "[1/2] 의존성 확인"
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0
	@if ! $(MAKE) --no-print-directory _deps-missing; then \
	    if [ "$${IV_AUTO_INSTALL:-1}" = "1" ]; then \
	        $(IV_SH_HELPERS) \
	        _iv_step "[2/2] 누락 패키지 설치 (sudo 필요할 수 있음)"; \
	        _iv_sub "끄기: IV_AUTO_INSTALL=0 make"; \
	        $(MAKE) --no-print-directory install-deps || { \
	            _iv_miss "자동 설치 실패 — make install-deps"; exit 1; }; \
	        rm -f $(OBJECTS) $(TARGET); \
	        $(IV_SH_HELPERS) _iv_step "설치 후 재확인"; \
	        $(MAKE) --no-print-directory _deps-report DEPS_FAIL=0; \
	    else \
	        $(IV_SH_HELPERS) _iv_miss "의존성 누락 (IV_AUTO_INSTALL=0)"; \
	        exit 1; \
	    fi; \
	else \
	    $(IV_SH_HELPERS) _iv_sub "→ 빌드 단계로 진행"; \
	fi

$(TARGET): $(OBJECTS)
	@$(IV_SH_HELPERS) _iv_sub "[LINK] $(TARGET) ← $(OBJECTS)"
	@if [ "$(IV_VERBOSE)" = "1" ]; then \
	    echo "    $(CC) $(OBJECTS) -o $(TARGET) $(GTK_LIBS)"; \
	fi
	$(BUILD_HIDE)$(CC) $(OBJECTS) -o $(TARGET) $(GTK_LIBS)
	@$(IV_SH_HELPERS) \
	_iv_step "빌드 완료"; \
	_iv_sub "실행: ./$(TARGET)  또는  make run"; \
	printf '\n'

%.o: %.c $(HEADERS)
	@$(IV_SH_HELPERS) _iv_sub "[CC] $< → $@"
	@test -n "$(GTK_CFLAGS)" || { \
	    $(IV_SH_HELPERS) _iv_miss "pkg-config 플래그 없음 — make install-deps"; exit 1; \
	}
	@if [ "$(IV_VERBOSE)" = "1" ]; then \
	    echo "    $(CC) $(CFLAGS) $(GTK_CFLAGS) -c $< -o $@"; \
	fi
	$(BUILD_HIDE)$(CC) $(CFLAGS) $(GTK_CFLAGS) -c $< -o $@

install-assets:
	@$(IV_SH_HELPERS) _iv_sub "[ASSETS] 아이콘 준비"
	@mkdir -p assets
	@if [ ! -f daemon_hammer.ico ] && [ -f ../daemon_hammer.ico ]; then \
	    ln -sf ../daemon_hammer.ico daemon_hammer.ico 2>/dev/null || \
	    cp -n ../daemon_hammer.ico daemon_hammer.ico 2>/dev/null || true; \
	fi
	@if [ -f daemon_hammer.ico ]; then \
	    python3 -c "import gi; gi.require_version('GdkPixbuf','2.0'); \
from gi.repository import GdkPixbuf; \
p=GdkPixbuf.Pixbuf.new_from_file('daemon_hammer.ico'); \
p.savev('assets/daemon_hammer.png','png',[],[])" 2>/dev/null || true; \
	fi

setup: all
	@$(IV_SH_HELPERS) _iv_step "Setup 완료 — ./$(TARGET)"

# ---------------------------------------------------------------------
# 의존성 설치 (누락된 패키지만 골라 설치)
# ---------------------------------------------------------------------
install-deps:
	@$(IV_SH_HELPERS) _iv_step "의존성 설치 ($(PLATFORM))"
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0
ifeq ($(UNAME_S),Linux)
	@need_pm=0; need_cc=0; need_gtk=0; need_pixbuf=0; need_heif_loader=0; \
	 need_heif_dev=0; need_im=0; need_ffmpeg=0; need_heif_convert=0; need_vlc=0; \
	$(IV_SH_HELPERS) \
	command -v pkg-config >/dev/null 2>&1 || need_pm=1; \
	command -v $(CC) >/dev/null 2>&1 || need_cc=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || need_gtk=1; \
	pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || need_pixbuf=1; \
	heif_ok=0; \
	if gdk-pixbuf-query-loaders 2>/dev/null | grep -qi heif; then heif_ok=1; fi; \
	if ls /usr/lib/*/gdk-pixbuf-2.0/*/loaders/*heif* 2>/dev/null | grep -q .; then heif_ok=1; fi; \
	[ $$heif_ok -eq 0 ] && need_heif_loader=1; \
	need_heif_dev=1; \
	pkg-config --exists libheif 2>/dev/null && need_heif_dev=0; \
	[ -f /usr/include/libheif/heif.h ] && need_heif_dev=0; \
	command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1 || need_im=1; \
	command -v ffmpeg >/dev/null 2>&1 || need_ffmpeg=1; \
	command -v heif-convert >/dev/null 2>&1 || need_heif_convert=1; \
	pkg-config --exists libvlc 2>/dev/null || need_vlc=1; \
	_iv_sub "설치 판단:"; \
	[ $$need_pm -eq 0 ] && [ $$need_cc -eq 0 ] && _iv_ok "빌드 도구" || _iv_miss "빌드 도구 → INSTALL"; \
	[ $$need_gtk -eq 0 ] && _iv_ok "GTK+3" || _iv_miss "GTK+3 → INSTALL"; \
	[ $$need_pixbuf -eq 0 ] && _iv_ok "gdk-pixbuf" || _iv_miss "gdk-pixbuf → INSTALL"; \
	[ $$need_heif_loader -eq 0 ] && _iv_ok "HEIF 로더" || _iv_miss "HEIF 로더 → INSTALL"; \
	[ $$need_heif_dev -eq 0 ] && _iv_ok "libheif-dev" || _iv_miss "libheif-dev → INSTALL"; \
	[ $$need_im -eq 0 ] && _iv_ok "ImageMagick" || _iv_miss "ImageMagick → INSTALL"; \
	[ $$need_ffmpeg -eq 0 ] && _iv_ok "ffmpeg" || _iv_miss "ffmpeg → INSTALL"; \
	[ $$need_heif_convert -eq 0 ] && _iv_ok "heif-convert" || _iv_miss "heif-convert → INSTALL"; \
	[ $$need_vlc -eq 0 ] && _iv_ok "libvlc (선택)" || _iv_sub "[·] libvlc 없음 — 동영상 미지원"; \
	if command -v apt-get >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs build-essential pkg-config"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs libgtk-3-dev"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs libgdk-pixbuf-2.0-dev"; \
	    [ $$need_heif_loader -ne 0 ] && pkgs="$$pkgs libheif1 libheif-plugin-gdk-pixbuf"; \
	    { [ $$need_heif_dev -ne 0 ] || [ $$need_heif_convert -ne 0 ]; } && \
	        pkgs="$$pkgs libheif-dev libheif-examples"; \
	    [ $$need_im -ne 0 ] && pkgs="$$pkgs imagemagick"; \
	    [ $$need_ffmpeg -ne 0 ] && pkgs="$$pkgs ffmpeg"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs libvlc-dev"; \
	    if [ -n "$$pkgs" ]; then \
	        _iv_sub "apt-get install$$pkgs"; \
	        sudo apt-get update && sudo apt-get install -y $$pkgs; \
	    else _iv_sub "apt: 추가 설치 없음"; fi; \
	elif command -v dnf >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs gcc make pkg-config"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3-devel"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs gdk-pixbuf2-devel"; \
	    [ $$need_heif_loader -ne 0 ] && pkgs="$$pkgs libheif libheif-heif gdk-pixbuf2-modules-extra"; \
	    { [ $$need_heif_dev -ne 0 ] || [ $$need_heif_convert -ne 0 ]; } && \
	        pkgs="$$pkgs libheif-devel libheif-tools"; \
	    [ $$need_im -ne 0 ] && pkgs="$$pkgs ImageMagick"; \
	    [ $$need_ffmpeg -ne 0 ] && pkgs="$$pkgs ffmpeg"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs vlc-devel"; \
	    if [ -n "$$pkgs" ]; then \
	        _iv_sub "dnf install$$pkgs"; \
	        sudo dnf install -y $$pkgs; \
	    else _iv_sub "dnf: 추가 설치 없음"; fi; \
	elif command -v pacman >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs base-devel"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs gdk-pixbuf2"; \
	    [ $$need_heif_loader -ne 0 ] || [ $$need_heif_dev -ne 0 ] || \
	        [ $$need_heif_convert -ne 0 ] && pkgs="$$pkgs libheif"; \
	    [ $$need_im -ne 0 ] && pkgs="$$pkgs imagemagick"; \
	    [ $$need_ffmpeg -ne 0 ] && pkgs="$$pkgs ffmpeg"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs vlc"; \
	    if [ -n "$$pkgs" ]; then \
	        _iv_sub "pacman -S$$pkgs"; \
	        sudo pacman -S --needed --noconfirm $$pkgs; \
	    else _iv_sub "pacman: 추가 설치 없음"; fi; \
	else \
	    _iv_miss "지원하지 않는 패키지 매니저"; exit 1; \
	fi
	@$(MAKE) --no-print-directory _refresh-pixbuf-loaders
else ifeq ($(UNAME_S),Darwin)
	@$(IV_SH_HELPERS) \
	command -v brew >/dev/null 2>&1 || { _iv_miss "Homebrew 필요 https://brew.sh/"; exit 1; }; \
	_iv_sub "brew: gtk+3 gdk-pixbuf libheif imagemagick ffmpeg (libvlc 선택)"
	@brew list pkg-config >/dev/null 2>&1 || brew install pkg-config
	@brew list gtk+3 >/dev/null 2>&1 || brew install gtk+3
	@brew list gdk-pixbuf >/dev/null 2>&1 || brew install gdk-pixbuf
	@brew list libheif >/dev/null 2>&1 || brew install libheif
	@brew list imagemagick >/dev/null 2>&1 || brew install imagemagick
	@brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
	@brew list vlc >/dev/null 2>&1 || brew install vlc || true
endif
	@$(IV_SH_HELPERS) _iv_step "설치 후 검증"
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0

_refresh-pixbuf-loaders:
ifeq ($(UNAME_S),Linux)
	@if command -v update-gdk-pixbuf-loaders >/dev/null 2>&1; then \
	    $(IV_SH_HELPERS) _iv_sub "[gdk-pixbuf] 로더 캐시 갱신"; \
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
	@rm -f $(OBJECTS) $(TARGET) app.o browser.o preview.o

distclean: clean
	@rm -f assets/daemon_hammer.png

debug: CFLAGS += -g -DDEBUG -O0
debug: clean all

install-desktop: $(TARGET)
ifeq ($(UNAME_S),Linux)
	@mkdir -p "$$HOME/.local/share/applications"
	@mkdir -p "$$HOME/.local/share/icons/hicolor/256x256/apps"
	@sed -e "s|^Exec=.*|Exec=$(CURDIR)/$(TARGET) %F|" \
	     -e "s|^Icon=.*|Icon=imageviewer|" \
	     imageviewer.desktop > "$$HOME/.local/share/applications/imageviewer.desktop"
	@if [ -f assets/daemon_hammer.png ]; then \
	    cp -f assets/daemon_hammer.png \
	        "$$HOME/.local/share/icons/hicolor/256x256/apps/imageviewer.png"; \
	elif [ -f daemon_hammer.ico ]; then \
	    python3 -c "import gi; gi.require_version('GdkPixbuf','2.0'); \
from gi.repository import GdkPixbuf; \
p=GdkPixbuf.Pixbuf.new_from_file('daemon_hammer.ico'); \
p.savev('$$HOME/.local/share/icons/hicolor/256x256/apps/imageviewer.png','png',[],[])" \
	    2>/dev/null || cp -f daemon_hammer.ico \
	        "$$HOME/.local/share/icons/hicolor/256x256/apps/imageviewer.ico"; \
	fi
	@command -v gtk-update-icon-cache >/dev/null && \
	    gtk-update-icon-cache -f -t "$$HOME/.local/share/icons/hicolor" 2>/dev/null || true
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
	@$(IV_SH_HELPERS) \
	_iv_step "$(APP_NAME) — make 도움말"; \
	_iv_sub "make              의존성 확인·설치 + 빌드"; \
	_iv_sub "make deps         의존성 항목별 확인"; \
	_iv_sub "make install-deps   빌드·HEIF·HIF→JPG 도구 설치"; \
	_iv_sub "make run          빌드 후 실행"; \
	_iv_sub "make info         의존성 + 컴파일 플래그"; \
	_iv_sub "IV_VERBOSE=1 make gcc 명령 줄 표시"; \
	_iv_sub "IV_AUTO_INSTALL=0  자동 설치 끄기"; \
	printf '\n'
