# ============================================================
#  VNC GTK Client – Makefile
#  Target: Linux / GTK3
#
#  Source layers
#   [core]    vnc_core        – pure POSIX C (no GLib, no GTK)
#   [adapter] vnc_client      – GLib adapter  (glib-2.0, no GTK)
#   [ui]      vnc_display     – GTK display widget
#             connection_dialog
#             main_window
#             main
# ============================================================

APP     := vncclient
SRCDIR  := src
BLDDIR  := build

CC      := gcc
CSTD    := -std=c11
WARN    := -Wall -Wextra -Wno-deprecated-declarations
OPT     := -O2 -g

# ── pkg-config packages ──────────────────────────────────────
# Core needs only libgcrypt; adapter adds glib-2.0; UI adds gtk+-3.0
PKGS_CORE    := libgcrypt
PKGS_ADAPTER := glib-2.0
PKGS_UI      := gtk+-3.0

PKGS_ALL     := $(PKGS_CORE) $(PKGS_ADAPTER) $(PKGS_UI)

CFLAGS_CORE    := $(CSTD) $(WARN) $(OPT) \
                  $(shell pkg-config --cflags $(PKGS_CORE))
CFLAGS_ADAPTER := $(CSTD) $(WARN) $(OPT) \
                  $(shell pkg-config --cflags $(PKGS_ADAPTER) $(PKGS_CORE))
CFLAGS_UI      := $(CSTD) $(WARN) $(OPT) \
                  $(shell pkg-config --cflags $(PKGS_ALL))

LDFLAGS := $(shell pkg-config --libs $(PKGS_ALL))

# ── source → object mapping (per layer) ─────────────────────
SRCS_CORE    := $(SRCDIR)/vnc_core.c
SRCS_ADAPTER := $(SRCDIR)/vnc_client.c \
                $(SRCDIR)/profile.c
SRCS_UI      := $(SRCDIR)/vnc_display.c \
                $(SRCDIR)/connection_dialog.c \
                $(SRCDIR)/main_window.c \
                $(SRCDIR)/main.c

OBJS_CORE    := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/core/%.o,   $(SRCS_CORE))
OBJS_ADAPTER := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/adapter/%.o,$(SRCS_ADAPTER))
OBJS_UI      := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/ui/%.o,     $(SRCS_UI))
OBJS_ALL     := $(OBJS_CORE) $(OBJS_ADAPTER) $(OBJS_UI)

TOTAL_SRCS   := $(words $(SRCS_CORE) $(SRCS_ADAPTER) $(SRCS_UI))

# ============================================================
.PHONY: all deps check-deps clean run install help

all: deps check-deps dirs banner \
     layer-core layer-adapter layer-ui \
     link done

# ── banner / done ────────────────────────────────────────────
banner:
	@echo ""
	@echo "╔══════════════════════════════════════════════╗"
	@echo "║   VNC GTK Client  –  build ($(TOTAL_SRCS) source files)    ║"
	@echo "╚══════════════════════════════════════════════╝"

done:
	@echo ""
	@echo "  ✓  Build complete  →  ./$(APP)"
	@echo ""

# ── dependency installation ──────────────────────────────────
DEBS := libgtk-3-dev libgcrypt20-dev libglib2.0-dev ffmpeg

deps:
	@echo ""
	@echo "──────────────────────────────────────────────"
	@echo "[deps] 필수 패키지 설치 (ffmpeg 포함)"
	@echo "──────────────────────────────────────────────"
	@echo "설치 대상 패키지: $(DEBS)"
	@echo "(ffmpeg는 화면 녹화/저장 기능에 필요합니다)"
	@echo "[1/3] apt-get 사용 가능 여부 확인..."
	@command -v apt-get >/dev/null 2>&1 || { \
	echo "  [오류] apt-get을 찾을 수 없습니다. 아래 패키지를 수동 설치하세요:"; \
	echo "    $(DEBS)"; \
	exit 0; }
	@missing=""; \
	for pkg in $(DEBS); do \
		dpkg -s $$pkg >/dev/null 2>&1 || missing="$$missing $$pkg"; \
	done; \
	if [ -n "$$missing" ]; then \
		echo "[2/3] 패키지 목록 갱신 중..."; \
		sudo apt-get update -qq >/dev/null 2>&1; \
		echo "[3/3] 누락된 패키지 설치 중..."; \
		sudo apt-get install -y -qq $$missing >/dev/null 2>&1; \
		echo "  ✓ 설치 완료:$$missing"; \
	else \
		echo "[2/3] 모든 패키지가 이미 설치되어 있습니다."; \
		echo "[3/3] 설치 단계 생략."; \
		echo "  ✓ 모든 dependency가 충족됨."; \
	fi
	@echo ""

# ── check pkg-config packages ────────────────────────────────
check-deps:
	@echo ""
	@echo "  Checking build dependencies ..."
	@echo "  [pkg-config 기반 빌드 라이브러리]"
	@for pkg in $(PKGS_ALL); do \
	if pkg-config --exists $$pkg 2>/dev/null; then \
		printf "    %-24s ✓  %s\n" "$$pkg" "$(shell pkg-config --modversion $$pkg)"; \
	else \
		echo "    $$pkg  ✗  NOT FOUND  (run: make deps)"; \
		exit 1; \
	fi; \
done
	@echo ""
	@echo "  [시스템 패키지/실행파일 의존성]"
	@missing=""; \
	for pkg in $(DEBS); do \
		if [ "$$pkg" = "ffmpeg" ]; then \
			if command -v ffmpeg >/dev/null 2>&1; then \
				printf "    %-24s ✓  %s\n" "ffmpeg (exec)" "$(shell ffmpeg -version | head -n1 | cut -d' ' -f3-)"; \
			else \
				echo "    ffmpeg (exec)           ✗  NOT FOUND  (run: make deps)"; \
				missing="$$missing ffmpeg"; \
			fi; \
		else \
			if dpkg -s $$pkg >/dev/null 2>&1; then \
				printf "    %-24s ✓\n" "$$pkg"; \
			else \
				echo "    $$pkg  ✗  NOT FOUND  (run: make deps)"; \
				missing="$$missing $$pkg"; \
			fi; \
		fi; \
	done; \
	if [ -n "$$missing" ]; then \
		echo "\n  일부 시스템 패키지가 누락되어 있습니다:$$missing"; \
		exit 1; \
	fi
	@echo ""

# ── build directories ────────────────────────────────────────
dirs:
	@mkdir -p $(BLDDIR)/core $(BLDDIR)/adapter $(BLDDIR)/ui

# ── layer: core (pure POSIX C, no GLib/GTK) ─────────────────
layer-core: $(OBJS_CORE)

$(BLDDIR)/core/%.o: $(SRCDIR)/%.c
	@printf "  [core]    %-38s\n" "$<"
	@$(CC) $(CFLAGS_CORE) -c $< -o $@

# ── layer: adapter (GLib only, no GTK) ──────────────────────
layer-adapter: $(OBJS_ADAPTER)

$(BLDDIR)/adapter/%.o: $(SRCDIR)/%.c
	@printf "  [adapter] %-38s\n" "$<"
	@$(CC) $(CFLAGS_ADAPTER) -c $< -o $@

# ── layer: UI (GTK) ─────────────────────────────────────────
layer-ui: $(OBJS_UI)

$(BLDDIR)/ui/%.o: $(SRCDIR)/%.c
	@printf "  [ui]      %-38s\n" "$<"
	@$(CC) $(CFLAGS_UI) -c $< -o $@

# ── link ─────────────────────────────────────────────────────
link: $(OBJS_ALL)
	@echo ""
	@echo "  [LD]  Linking $(APP) ..."
	@$(CC) $(OBJS_ALL) -o $(APP) $(LDFLAGS)

# ── run / install / clean ────────────────────────────────────
run: all
	@echo "  Starting $(APP) ..."
	@./$(APP)

DESTDIR  ?=
PREFIX   ?= /usr/local
BINDIR    = $(DESTDIR)$(PREFIX)/bin

install: all
	@echo "  [install]  $(APP)  →  $(BINDIR)/$(APP)"
	@install -d $(BINDIR)
	@install -m 755 $(APP) $(BINDIR)/$(APP)
	@echo "  ✓  Installed."

clean:
	@echo "  [clean]  removing $(BLDDIR)/  $(APP)"
	@rm -rf $(BLDDIR) $(APP)
	@echo "  ✓  Clean."

# ── help ─────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  make deps      – install dependencies (requires sudo; includes ffmpeg)"
	@echo "  make           – install deps + build all three layers"
	@echo "  make run       – build and launch"
	@echo "  make install   – install to \$$(PREFIX)/bin  [default: $(PREFIX)/bin]"
	@echo "  make clean     – remove build artefacts"
	@echo ""
	@echo "  Source layers:"
	@echo "    core     vnc_core.c"
	@echo "    adapter  vnc_client.c  profile.c"
	@echo "    ui       vnc_display.c connection_dialog.c main_window.c main.c"
	@echo ""
