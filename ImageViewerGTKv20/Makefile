# =====================================================================
#   ImageViewer GTK v1.0 — Linux / macOS
#
#   처음 사용자:  make          (누락 패키지 감지 → 자동 설치 → 빌드)
#   자동 설치 끄기:  IV_AUTO_INSTALL=0 make
#   컴파일 명령 표시: IV_VERBOSE=1 make
# =====================================================================

CC       = gcc
SRCDIR   = source
INCDIR   = include
BUILDDIR = build
CFLAGS   = -Wall -Wextra -O2 -std=c11 -I$(INCDIR) \
           -DAPP_ICON_FILE=\"$(CURDIR)/daemon_hammer.ico\" \
           -DASSETS_DIR=\"$(CURDIR)/assets\" \
           -DAPP_ROOT_DIR=\"$(CURDIR)\"
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

# pkg-config 는 `=` 로 두어 install-deps 직후 같은 make 에서 재평가
VLC_PC     = $(shell pkg-config --exists libvlc 2>/dev/null && echo libvlc)
PKGS       = gtk+-3.0 gdk-pixbuf-2.0 $(VLC_PC)
VLC_CFLAGS = $(if $(VLC_PC),-DHAVE_LIBVLC,-DNO_LIBVLC)
GTK_CFLAGS = $(shell pkg-config --cflags $(PKGS) 2>/dev/null) $(VLC_CFLAGS) $(HEIF_CFLAGS)
GTK_LIBS   = $(shell pkg-config --libs $(PKGS) 2>/dev/null) $(HEIF_LIBS) -lm

SRCS     = main.c gtk_app.c gtk_browser.c gtk_preview.c gtk_editor.c state.c utils.c assets.c image_io.c image_effects.c heif_native.c rembg_onnx.c
HEADERS  = $(wildcard $(INCDIR)/*.h)
GEN_ICONS = tools/gen_icons
ICON_STAMP = assets/icons/.stamp

# libheif C API — 내장 HIF→JPG (strukturag/libheif)
HEIF_PC := $(shell pkg-config --exists libheif 2>/dev/null && echo libheif)
ifneq ($(HEIF_PC),)
  HEIF_CFLAGS := $(shell pkg-config --cflags libheif) -DHAVE_LIBHEIF
  HEIF_LIBS   := $(shell pkg-config --libs libheif)
else ifneq ($(wildcard /usr/include/x86_64-linux-gnu/libheif/heif.h),)
  HEIF_CFLAGS := -I/usr/include/x86_64-linux-gnu -DHAVE_LIBHEIF
  HEIF_LIBS   := -lheif
else ifneq ($(wildcard /usr/include/libheif/heif.h),)
  HEIF_CFLAGS := -I/usr/include -DHAVE_LIBHEIF
  HEIF_LIBS   := -lheif
endif
HEIF_CFLAGS ?=
HEIF_LIBS   ?=

# libsoup — rembg ONNX 모델 다운로드 (없으면 curl 폴백)
SOUP_PC := $(shell pkg-config --exists libsoup-2.4 2>/dev/null && echo libsoup-2.4)
ifneq ($(SOUP_PC),)
  SOUP_CFLAGS := -DHAVE_LIBSOUP $(shell pkg-config --cflags libsoup-2.4)
  SOUP_LIBS   := $(shell pkg-config --libs libsoup-2.4)
endif
SOUP_CFLAGS ?=
SOUP_LIBS   ?=

# ONNX Runtime — rembg AI 배경 제거
# 우선순위: ONNXRUNTIME_ROOT → third_party/onnxruntime → /usr/local
BUNDLED_ORT := $(CURDIR)/third_party/onnxruntime
ifdef ONNXRUNTIME_ROOT
  ORT_ROOT := $(ONNXRUNTIME_ROOT)
else ifneq ($(wildcard $(BUNDLED_ORT)/include/onnxruntime_c_api.h),)
  ORT_ROOT := $(BUNDLED_ORT)
else
  ORT_ROOT := /usr/local
endif
ORT_INC := $(ORT_ROOT)/include
ORT_LIB := $(ORT_ROOT)/lib
ifneq ($(wildcard $(ORT_INC)/onnxruntime_c_api.h),)
  ONNX_CFLAGS := -DHAVE_ONNXRUNTIME -I$(ORT_INC)
  ONNX_LIBS   := -L$(ORT_LIB) -lonnxruntime -Wl,-rpath,$(ORT_LIB)
else ifneq ($(wildcard $(ORT_INC)/onnxruntime/core/session/onnxruntime_c_api.h),)
  ORT_INC_SUB := $(ORT_INC)/onnxruntime/core/session
  ONNX_CFLAGS := -DHAVE_ONNXRUNTIME -I$(ORT_INC) -I$(ORT_INC_SUB)
  ONNX_LIBS   := -L$(ORT_LIB) -lonnxruntime -Wl,-rpath,$(ORT_LIB)
endif
ONNX_CFLAGS ?=
ONNX_LIBS   ?=

GTK_CFLAGS += $(SOUP_CFLAGS) $(ONNX_CFLAGS)
GTK_LIBS   += $(SOUP_LIBS) $(ONNX_LIBS)

SOURCES  = $(addprefix $(SRCDIR)/,$(SRCS))
OBJECTS  = $(patsubst $(SRCDIR)/%.c,$(BUILDDIR)/%.o,$(SOURCES))

.DEFAULT_GOAL := all

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

# 필수: pkg-config gcc gtk3 gdk-pixbuf libheif-dev (+ AI: onnxruntime)
define IV_DEPS_CHECK
fail=0; miss=""; heif_dev_ok=0; \
command -v pkg-config >/dev/null 2>&1 || { fail=1; miss="$$miss pkg-config"; }; \
command -v $(CC) >/dev/null 2>&1 || { fail=1; miss="$$miss gcc"; }; \
pkg-config --exists gtk+-3.0 2>/dev/null || { fail=1; miss="$$miss gtk3"; }; \
pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || { fail=1; miss="$$miss pixbuf"; }; \
pkg-config --exists libheif 2>/dev/null && heif_dev_ok=1; \
[ -f /usr/include/libheif/heif.h ] && heif_dev_ok=1; \
[ -f /usr/include/x86_64-linux-gnu/libheif/heif.h ] && heif_dev_ok=1; \
[ $$heif_dev_ok -eq 1 ] || { fail=1; miss="$$miss libheif-dev"; }; \
ort_ok=0; \
[ -f "$(BUNDLED_ORT)/include/onnxruntime_c_api.h" ] && ort_ok=1; \
[ -f "$(BUNDLED_ORT)/include/onnxruntime/core/session/onnxruntime_c_api.h" ] && ort_ok=1; \
[ -f "/usr/local/include/onnxruntime_c_api.h" ] && ort_ok=1; \
[ -f "/usr/local/include/onnxruntime/core/session/onnxruntime_c_api.h" ] && ort_ok=1; \
[ $$ort_ok -eq 1 ] || { fail=1; miss="$$miss onnxruntime"; };
endef

.PHONY: all setup install-deps install-onnx check-deps run clean distclean debug info \
        install-desktop install-assets assets help _ensure-deps _do-build \
        _deps-report deps _build-banner _deps-missing

all:
	@$(MAKE) --no-print-directory _ensure-deps
	@$(MAKE) --no-print-directory _do-build

_do-build: install-assets _build-banner $(TARGET)

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
	if [ $$heif_dev_ok -eq 1 ]; then \
	    hv=$$(pkg-config --modversion libheif 2>/dev/null || echo "header"); \
	    _iv_ok "libheif $$hv (내장 HIF→JPG)"; \
	else _iv_miss "libheif-dev"; fi; \
	if pkg-config --exists libvlc 2>/dev/null; then \
	    _iv_ok "libvlc $$(pkg-config --modversion libvlc) (동영상, 선택)"; \
	else _iv_sub "[·] libvlc 없음 — 동영상 미지원"; fi; \
	if [ -f "$(BUNDLED_ORT)/include/onnxruntime_c_api.h" ] || [ -f "$(BUNDLED_ORT)/include/onnxruntime/core/session/onnxruntime_c_api.h" ]; then \
	    _iv_ok "onnxruntime (third_party)"; \
	else \
	    _iv_miss "onnxruntime (make install-onnx)"; \
	fi; \
	_iv_sub "libheif: $(if $(HEIF_LIBS),on,off)  libvlc: $(if $(VLC_PC),on,off)  onnx: $(if $(ONNX_LIBS),on,off)  soup: $(if $(SOUP_LIBS),on,off)"; \
	if [ $$fail -eq 0 ]; then _iv_sub "→ 의존성 충족"; \
	else _iv_sub "→ 누락:$$miss — make install-deps"; fi; \
	printf '\n'; \
	if [ "$${DEPS_FAIL:-0}" = "1" ] && [ $$fail -ne 0 ]; then exit 1; fi

_deps-missing:
	@$(IV_DEPS_CHECK) exit $$fail

_build-banner:
	@$(IV_SH_HELPERS) \
	_iv_step "빌드 — $(TARGET)"; \
	_iv_sub "플랫폼: $(PLATFORM)  libheif: $(if $(HEIF_LIBS),on,off)  libvlc: $(if $(VLC_PC),on,off)"

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
	        $(MAKE) --no-print-directory install-onnx || { \
	            _iv_miss "ONNX Runtime 설치 실패 — make install-onnx"; exit 1; }; \
	        rm -f $(OBJECTS) $(TARGET); \
	        $(MAKE) --no-print-directory _deps-report DEPS_FAIL=0; \
	    else \
	        _iv_miss "의존성 누락 (IV_AUTO_INSTALL=0)"; exit 1; \
	    fi; \
	else \
	    $(IV_SH_HELPERS) _iv_sub "→ 빌드 단계로 진행"; \
	fi

$(BUILDDIR):
	@mkdir -p $(BUILDDIR)

$(TARGET): $(OBJECTS) | $(BUILDDIR)
	@$(IV_SH_HELPERS) _iv_sub "[LINK] $(TARGET)"
	$(BUILD_HIDE)$(CC) $(OBJECTS) -o $(TARGET) $(GTK_LIBS)
	@$(IV_SH_HELPERS) _iv_step "빌드 완료" && _iv_sub "실행: ./$(TARGET)" && printf '\n'

$(BUILDDIR)/%.o: $(SRCDIR)/%.c $(HEADERS) | $(BUILDDIR)
	@test -n "$(GTK_CFLAGS)" || { $(IV_SH_HELPERS) _iv_miss "pkg-config 없음 — make install-deps"; exit 1; }
	$(BUILD_HIDE)$(CC) $(CFLAGS) $(GTK_CFLAGS) -c $< -o $@

$(GEN_ICONS): tools/gen_icons.c
	@$(IV_SH_HELPERS) _iv_sub "[GEN] $@"
	$(BUILD_HIDE)$(CC) -O2 -std=c11 tools/gen_icons.c -o $@ \
	    $$(pkg-config --cflags --libs cairo glib-2.0 2>/dev/null)

$(ICON_STAMP): tools/gen_icons.c $(GEN_ICONS)
	@mkdir -p assets/icons
	@$(IV_SH_HELPERS) _iv_sub "[ASSETS] 형식·폴더 아이콘 생성"
	$(BUILD_HIDE)./$(GEN_ICONS) $(CURDIR)/assets/icons
	@touch $(ICON_STAMP)

install-assets: $(ICON_STAMP)
	@if [ ! -f daemon_hammer.ico ] && [ -f ../daemon_hammer.ico ]; then \
	    ln -sf ../daemon_hammer.ico daemon_hammer.ico 2>/dev/null || \
	    cp -n ../daemon_hammer.ico daemon_hammer.ico 2>/dev/null || true; \
	fi

assets: $(ICON_STAMP)

setup: all

ONNX_VER     ?= 1.19.2
ONNX_DIR     := $(CURDIR)/third_party/onnxruntime
ONNX_TGZ     := onnxruntime-linux-x64-$(ONNX_VER).tgz
ONNX_URL     := https://github.com/microsoft/onnxruntime/releases/download/v$(ONNX_VER)/$(ONNX_TGZ)

install-onnx:
	@$(IV_SH_HELPERS) \
	_iv_step "ONNX Runtime $(ONNX_VER) 설치"; \
	mkdir -p third_party; \
	if [ -f "$(ONNX_DIR)/include/onnxruntime_c_api.h" ]; then \
	    _iv_ok "이미 설치됨: $(ONNX_DIR)"; \
	else \
	    _iv_sub "다운로드: $(ONNX_URL)"; \
	    curl -fL -sS "$(ONNX_URL)" -o "third_party/$(ONNX_TGZ)"; \
	    tar -xzf "third_party/$(ONNX_TGZ)" -C third_party; \
	    rm -f "third_party/$(ONNX_TGZ)"; \
	    ln -sfn "onnxruntime-linux-x64-$(ONNX_VER)" "$(ONNX_DIR)"; \
	    _iv_ok "설치 완료 — ONNXRUNTIME_ROOT=$(ONNX_DIR) make"; \
	fi

install-deps:
	@$(IV_SH_HELPERS) _iv_step "의존성 설치 ($(PLATFORM))"
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0
ifeq ($(UNAME_S),Linux)
	@need_pm=0; need_cc=0; need_gtk=0; need_pixbuf=0; need_heif=0; need_vlc=0; \
	need_curl=0; \
	$(IV_SH_HELPERS) \
	command -v pkg-config >/dev/null 2>&1 || need_pm=1; \
	command -v $(CC) >/dev/null 2>&1 || need_cc=1; \
	command -v curl >/dev/null 2>&1 || need_curl=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || need_gtk=1; \
	pkg-config --exists gdk-pixbuf-2.0 2>/dev/null || need_pixbuf=1; \
	pkg-config --exists libheif 2>/dev/null || need_heif=1; \
	[ -f /usr/include/libheif/heif.h ] && need_heif=0; \
	[ -f /usr/include/x86_64-linux-gnu/libheif/heif.h ] && need_heif=0; \
	pkg-config --exists libvlc 2>/dev/null || need_vlc=1; \
	if command -v apt-get >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs build-essential pkg-config"; \
	    [ $$need_curl -ne 0 ] && pkgs="$$pkgs curl ca-certificates"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs libgtk-3-dev"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs libgdk-pixbuf-2.0-dev"; \
	    [ $$need_heif -ne 0 ] && pkgs="$$pkgs libheif-dev"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs libvlc-dev"; \
	    if [ -n "$$pkgs" ]; then \
	        _iv_sub "apt-get install$$pkgs"; \
	        sudo apt-get update && sudo apt-get install -y $$pkgs; \
	    fi; \
	elif command -v dnf >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs gcc make pkg-config"; \
	    [ $$need_curl -ne 0 ] && pkgs="$$pkgs curl ca-certificates"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3-devel"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs gdk-pixbuf2-devel"; \
	    [ $$need_heif -ne 0 ] && pkgs="$$pkgs libheif-devel"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs vlc-devel"; \
	    if [ -n "$$pkgs" ]; then \
	        _iv_sub "dnf install$$pkgs"; \
	        sudo dnf install -y $$pkgs; \
	    fi; \
	elif command -v pacman >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs base-devel"; \
	    [ $$need_curl -ne 0 ] && pkgs="$$pkgs curl ca-certificates"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3"; \
	    [ $$need_pixbuf -ne 0 ] && pkgs="$$pkgs gdk-pixbuf2"; \
	    [ $$need_heif -ne 0 ] && pkgs="$$pkgs libheif"; \
	    [ $$need_vlc -ne 0 ] && pkgs="$$pkgs vlc"; \
	    if [ -n "$$pkgs" ]; then \
	        _iv_sub "pacman -S$$pkgs"; \
	        sudo pacman -S --needed --noconfirm $$pkgs; \
	    fi; \
	else \
	    _iv_miss "지원하지 않는 패키지 매니저"; exit 1; \
	fi
else ifeq ($(UNAME_S),Darwin)
	@$(IV_SH_HELPERS) \
	command -v brew >/dev/null 2>&1 || { _iv_miss "Homebrew 필요"; exit 1; }; \
	brew list curl >/dev/null 2>&1 || brew install curl; \
	brew list pkg-config >/dev/null 2>&1 || brew install pkg-config; \
	brew list gtk+3 >/dev/null 2>&1 || brew install gtk+3; \
	brew list gdk-pixbuf >/dev/null 2>&1 || brew install gdk-pixbuf; \
	brew list libheif >/dev/null 2>&1 || brew install libheif; \
	brew list vlc >/dev/null 2>&1 || brew install vlc || true
endif
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0

check-deps:
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=1

deps:
	@$(MAKE) --no-print-directory _deps-report DEPS_FAIL=0

run: all
	@./$(TARGET)

clean:
	@rm -rf $(BUILDDIR) $(TARGET)
	@rm -f $(GEN_ICONS)

distclean: clean
	@rm -f $(ICON_STAMP)

debug: CFLAGS += -g -DDEBUG -O0
debug: clean all

install-desktop: $(TARGET)
ifeq ($(UNAME_S),Linux)
	@mkdir -p "$$HOME/.local/share/applications"
	@mkdir -p "$$HOME/.local/share/icons/hicolor/256x256/apps"
	@sed -e "s|^Exec=.*|Exec=$(CURDIR)/$(TARGET) %F|" \
	     -e "s|^Icon=.*|Icon=imageviewer|" \
	     imageviewer.desktop > "$$HOME/.local/share/applications/imageviewer.desktop"
	@if [ -f daemon_hammer.ico ]; then \
	    cp -f daemon_hammer.ico \
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
	@printf '\n  CFLAGS:     %s\n  GTK_CFLAGS: %s\n  GTK_LIBS:   %s\n\n' \
	    "$(CFLAGS)" "$(GTK_CFLAGS)" "$(GTK_LIBS)"

help:
	@$(IV_SH_HELPERS) \
	_iv_step "$(APP_NAME) — make"; \
	_iv_sub "make / make setup     의존성 + 빌드"; \
	_iv_sub "make install-deps   GTK·gdk-pixbuf·libheif-dev"; \
	_iv_sub "make install-onnx   ONNX Runtime (third_party/)"; \
	_iv_sub "ONNXRUNTIME_ROOT=... make  AI 배경 제거 활성화"; \
	_iv_sub "make deps           의존성 확인"; \
	_iv_sub "make run            빌드 후 실행"; \
	_iv_sub "IV_AUTO_INSTALL=0   자동 apt/brew 설치 끄기"; \
	printf '\n'
