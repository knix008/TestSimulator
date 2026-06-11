# ============================================================
#  CommandCenterGTKv10 (FileMaster) — Makefile
#  Target: Linux / macOS (GTK3)
#
#  make     의존성 검사 → 누락 시 자동 설치 → 빌드
#            실행 파일: ./commandcenter (프로젝트 루트)
#  CC_AUTO_INSTALL=0 make   자동 설치 비활성화
# ============================================================

APP       := commandcenter
TARGET    := $(APP)
ICON_FILE := daemon_hammer.ico
ICON_SRCS := ../TTSWinV10/daemon_hammer.ico \
             ../EasyMDWebV10/public/daemon_hammer.ico \
             ../VNCServerWinV10/VNCServer/daemon_hammer.ico
INCDIR  := include
SRCDIR  := src
BLDDIR  := build

CC      := gcc
CSTD    := -std=c11
WARN    := -Wall -Wextra
OPT     := -O2 -g
PTHREAD := -pthread

PKGS    := gtk+-3.0 libarchive

# = 로 두어 install-deps 이후 재평가
GTK_CFLAGS := $(shell pkg-config --cflags $(PKGS) 2>/dev/null)
GTK_LIBS   := $(shell pkg-config --libs $(PKGS) 2>/dev/null)

CFLAGS  := $(CSTD) $(WARN) $(OPT) $(PTHREAD) -I$(INCDIR) \
           -DAPP_ICON_FILE=\"$(ICON_FILE)\" $(GTK_CFLAGS)
LDFLAGS := $(PTHREAD) -lm $(GTK_LIBS)
ifeq ($(UNAME_S),Darwin)
  ifneq ($(BREW_PREFIX),)
    LDFLAGS += -L$(BREW_PREFIX)/lib
  endif
endif

SRCS := $(SRCDIR)/main.c \
        $(SRCDIR)/app_icon.c \
        $(SRCDIR)/about_dialog.c \
        $(SRCDIR)/main_window.c \
        $(SRCDIR)/file_panel.c \
        $(SRCDIR)/folder_tree_panel.c \
        $(SRCDIR)/file_entry.c \
        $(SRCDIR)/file_ops.c \
        $(SRCDIR)/file_ops_conflict.c \
        $(SRCDIR)/json_util.c \
        $(SRCDIR)/session_settings.c \
        $(SRCDIR)/input_dialog.c \
        $(SRCDIR)/progress_dialog.c \
        $(SRCDIR)/ui_menu.c \
        $(SRCDIR)/search_dialog.c \
        $(SRCDIR)/archive_ops.c \
        $(SRCDIR)/compress_dialog.c

OBJS := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/%.o,$(SRCS))

UNAME_S  := $(shell uname -s)
APT_DEBS := build-essential pkg-config libgtk-3-dev libarchive-dev

ifeq ($(UNAME_S),Linux)
  PLATFORM := linux
else ifeq ($(UNAME_S),Darwin)
  PLATFORM := macos
  BREW_PREFIX := $(shell brew --prefix 2>/dev/null)
  export PKG_CONFIG_PATH := $(BREW_PREFIX)/lib/pkgconfig:$(BREW_PREFIX)/opt/gtk+3/lib/pkgconfig
else
  $(error Unsupported OS: $(UNAME_S). Supported: Linux, macOS (Darwin))
endif

ifeq ($(UNAME_S),Darwin)
  ifneq ($(BREW_PREFIX),)
    PREFIX ?= $(BREW_PREFIX)
  else
    PREFIX ?= /usr/local
  endif
else
  PREFIX ?= /usr/local
endif

DESTDIR         ?=
INSTALL         ?= install
BINDIR          := $(DESTDIR)$(PREFIX)/bin
DESKTOPDIR      := $(DESTDIR)$(PREFIX)/share/applications
SHAREDIR        := $(DESTDIR)$(PREFIX)/share/commandcenter
ICON_256        := $(DESTDIR)$(PREFIX)/share/icons/hicolor/256x256/apps
DESKTOP_IN      := commandcenter.desktop
DESKTOP_INST    := commandcenter.desktop

.PHONY: all deps install-deps check-deps clean run help icon \
        install uninstall _ensure-deps _deps-report _deps-missing _build banner done dirs

.DEFAULT_GOAL := all

# CC_SKIP_DEPS=1 : install-deps 후 재진입 시 의존성 루프 방지
all:
ifndef CC_SKIP_DEPS
	@$(MAKE) --no-print-directory _ensure-deps
endif
	@$(MAKE) --no-print-directory _build

_ensure-deps:
	@echo "==> [1/2] 의존성 확인"
	@$(MAKE) --no-print-directory _deps-report
	@if $(MAKE) --no-print-directory _deps-missing >/dev/null 2>&1; then \
	    echo "    → 의존성 충족, 빌드 진행"; \
	else \
	    if [ "$${CC_AUTO_INSTALL:-1}" = "1" ]; then \
	        echo "==> [2/2] 누락 패키지 자동 설치 (sudo 필요할 수 있음)"; \
	        $(MAKE) --no-print-directory install-deps || exit 1; \
	        CC_SKIP_DEPS=1 $(MAKE) --no-print-directory all; \
	        exit 0; \
	    else \
	        echo "    [X] 의존성 누락 — make install-deps 또는 CC_AUTO_INSTALL=1"; \
	        exit 1; \
	    fi; \
	fi

_deps-report:
	@echo "    $(TARGET) — $(PLATFORM)/$$(uname -m)"
	@if command -v pkg-config >/dev/null 2>&1; then \
	    echo "    [O] pkg-config $$(pkg-config --version 2>/dev/null)"; \
	else echo "    [X] pkg-config"; fi
	@if command -v $(CC) >/dev/null 2>&1; then \
	    echo "    [O] $(CC) $$($(CC) -dumpversion 2>/dev/null)"; \
	else echo "    [X] $(CC)"; fi
	@if command -v make >/dev/null 2>&1; then \
	    echo "    [O] make"; \
	else echo "    [X] make"; fi
	@for pkg in $(PKGS); do \
	    if pkg-config --exists $$pkg 2>/dev/null; then \
	        echo "    [O] $$pkg $$(pkg-config --modversion $$pkg)"; \
	    else \
	        if [ "$(PLATFORM)" = "macos" ]; then \
	            echo "    [X] $$pkg (brew install gtk+3)"; \
	        else \
	            echo "    [X] $$pkg (libgtk-3-dev 등)"; \
	        fi; \
	    fi; \
	done
	@echo ""

_deps-missing:
	@fail=0; \
	command -v $(CC) >/dev/null 2>&1 || fail=1; \
	command -v pkg-config >/dev/null 2>&1 || fail=1; \
	command -v make >/dev/null 2>&1 || fail=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || fail=1; \
	pkg-config --exists libarchive 2>/dev/null || fail=1; \
	test $$fail -eq 0

check-deps: _deps-report
	@$(MAKE) --no-print-directory _deps-missing || \
	    (echo "의존성 누락 — make 또는 make install-deps" && exit 1)

deps install-deps:
	@echo "==> 의존성 설치 ($$(uname -s))"
ifeq ($(UNAME_S),Linux)
	@need_pm=0; need_cc=0; need_gtk=0; \
	command -v pkg-config >/dev/null 2>&1 || need_pm=1; \
	command -v $(CC) >/dev/null 2>&1 || need_cc=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || need_gtk=1; \
	if command -v apt-get >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs $(APT_DEBS)"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs libgtk-3-dev libarchive-dev"; \
	    pkgs=$$(echo $$pkgs | tr ' ' '\n' | sort -u | tr '\n' ' '); \
	    if [ -n "$$(echo $$pkgs | tr -d ' ')" ]; then \
	        echo "    apt-get install$$pkgs"; \
	        sudo apt-get update -qq && sudo apt-get install -y $$pkgs; \
	    else echo "    apt — 추가 설치 불필요"; fi; \
	elif command -v dnf >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs gcc make pkg-config"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3-devel libarchive-devel"; \
	    if [ -n "$$pkgs" ]; then echo "    dnf install$$pkgs"; sudo dnf install -y $$pkgs; fi; \
	elif command -v pacman >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs base-devel"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3 libarchive"; \
	    if [ -n "$$pkgs" ]; then echo "    pacman -S$$pkgs"; \
	        sudo pacman -S --needed --noconfirm $$pkgs; fi; \
	else \
	    echo "    [X] 지원하지 않는 패키지 매니저 — 수동: $(APT_DEBS)"; exit 1; \
	fi
else ifeq ($(UNAME_S),Darwin)
	@command -v brew >/dev/null 2>&1 || { \
	    echo "    [X] Homebrew 필요 — https://brew.sh"; exit 1; }; \
	brew list pkg-config >/dev/null 2>&1 || brew install pkg-config; \
	brew list gtk+3 >/dev/null 2>&1 || brew install gtk+3; \
	brew list libarchive >/dev/null 2>&1 || brew install libarchive
else
	@echo "    [X] install-deps: Linux / macOS 전용"
	@exit 1
endif
	@echo "    [O] 설치 완료"

_build: dirs banner $(TARGET) done

banner:
	@echo ""
	@echo "  $(TARGET) — build ($(words $(SRCS)) sources)"
	@echo ""

done:
	@echo "  Build complete → ./$(TARGET)"
	@echo ""

dirs:
	@mkdir -p $(BLDDIR)

icon: $(ICON_FILE)

$(ICON_FILE):
	@if [ -f "$(ICON_FILE)" ]; then exit 0; fi; \
	for p in $(ICON_SRCS); do \
	    if [ -f "$$p" ]; then \
	        echo "[icon] $(ICON_FILE) ← $$p"; \
	        ln -sf "$$p" "$(ICON_FILE)"; \
	        exit 0; \
	    fi; \
	done; \
	echo "[X] $(ICON_FILE) 없음 — TestSimulator 형제 프로젝트에 ico를 두거나 루트에 복사하세요."; \
	exit 1

$(TARGET): $(OBJS) $(ICON_FILE)
	@test -n "$(GTK_CFLAGS)" || { echo "[X] gtk+-3.0 없음 — make 재실행"; exit 1; }
	@echo "[link] ./$(TARGET)"
	@$(CC) $(OBJS) -o $(TARGET) $(LDFLAGS)

$(BLDDIR)/%.o: $(SRCDIR)/%.c
	@test -n "$(GTK_CFLAGS)" || { echo "[X] gtk+-3.0 없음 — make 재실행"; exit 1; }
	@echo "[cc]   $<"
	@$(CC) $(CFLAGS) -c $< -o $@

run: all
	@./$(TARGET)

install: all
	@echo "==> install $(TARGET) → $(PREFIX) ($(PLATFORM))"
	@$(INSTALL) -d "$(BINDIR)"
	@$(INSTALL) -m 755 "$(TARGET)" "$(BINDIR)/$(TARGET)"
	@$(INSTALL) -d "$(SHAREDIR)"
	@$(INSTALL) -m 644 "$(ICON_FILE)" "$(SHAREDIR)/$(ICON_FILE)"
ifeq ($(UNAME_S),Linux)
	@$(INSTALL) -d "$(ICON_256)"
	@$(INSTALL) -m 644 "$(ICON_FILE)" "$(ICON_256)/commandcenter.ico"
	@$(INSTALL) -d "$(DESKTOPDIR)"
	@{ \
	  echo '[Desktop Entry]'; \
	  echo 'Type=Application'; \
	  echo 'Name=Command Center V1.0'; \
	  echo 'GenericName=File Manager'; \
	  echo 'Comment=Dual-panel file manager (CommandCenter)'; \
	  echo 'Exec=$(BINDIR)/$(TARGET) %F'; \
	  echo 'Icon=commandcenter'; \
	  echo 'Terminal=false'; \
	  echo 'Categories=Utility;FileManager;'; \
	  echo 'StartupWMClass=commandcenter'; \
	  echo 'MimeType=inode/directory;'; \
	} > "$(DESKTOPDIR)/$(DESKTOP_INST)"
	@chmod 644 "$(DESKTOPDIR)/$(DESKTOP_INST)"
	@command -v gtk-update-icon-cache >/dev/null 2>&1 && \
	    gtk-update-icon-cache -f -t "$(DESTDIR)$(PREFIX)/share/icons/hicolor" \
	    2>/dev/null || true
	@command -v update-desktop-database >/dev/null 2>&1 && \
	    update-desktop-database "$(DESKTOPDIR)" 2>/dev/null || true
	@echo "    [O] $(DESKTOPDIR)/$(DESKTOP_INST)"
	@echo "    [O] $(ICON_256)/commandcenter.ico"
endif
	@echo "    [O] $(BINDIR)/$(TARGET)"
	@echo "    [O] $(SHAREDIR)/$(ICON_FILE)"
	@echo ""
	@echo "  실행: $(BINDIR)/$(TARGET)"

uninstall:
	@echo "==> uninstall $(TARGET) from $(PREFIX) ($(PLATFORM))"
	@rm -f "$(BINDIR)/$(TARGET)"
	@rm -f "$(SHAREDIR)/$(ICON_FILE)"
	@rmdir "$(SHAREDIR)" 2>/dev/null || true
ifeq ($(UNAME_S),Linux)
	@rm -f "$(ICON_256)/commandcenter.ico"
	@rmdir "$(ICON_256)" 2>/dev/null || true
	@rm -f "$(DESKTOPDIR)/$(DESKTOP_INST)"
	@command -v gtk-update-icon-cache >/dev/null 2>&1 && \
	    gtk-update-icon-cache -f -t "$(DESTDIR)$(PREFIX)/share/icons/hicolor" \
	    2>/dev/null || true
	@command -v update-desktop-database >/dev/null 2>&1 && \
	    update-desktop-database "$(DESKTOPDIR)" 2>/dev/null || true
endif
	@echo "    [O] 제거 완료"

clean:
	@rm -rf $(BLDDIR) $(TARGET)

help:
	@echo "Targets:"
	@echo "  make                 의존성 검사·자동 설치 후 빌드 → ./$(TARGET)"
	@echo "  make check-deps      의존성만 검사"
	@echo "  make install-deps    누락 패키지 수동 설치"
	@echo "  make run             ./$(TARGET) 실행"
	@echo "  make install         PREFIX=$(PREFIX) 에 설치"
	@echo "  make uninstall       설치 제거"
	@echo "  make clean           build/ 및 실행 파일 삭제"
	@echo ""
	@echo "  Linux:  sudo make install"
	@echo "          make install PREFIX=$$HOME/.local"
	@echo "  macOS:  make install-deps   # brew install gtk+3"
	@echo "          make install        # PREFIX=$$(brew --prefix) 기본"
	@echo ""
	@echo "  CC_AUTO_INSTALL=0    자동 설치 끄기"
