# ============================================================
#  CommandCenterGTKv10 (FileMaster) — Makefile
#  Target: Linux / GTK3
#
#  make     의존성 검사 → 누락 시 자동 설치 → 빌드
#            실행 파일: ./CommandCenterGTKv10 (프로젝트 루트)
#  CC_AUTO_INSTALL=0 make   자동 설치 비활성화
# ============================================================

APP     := cmdcenter
TARGET  := $(APP)
INCDIR  := include
SRCDIR  := src
BLDDIR  := build

CC      := gcc
CSTD    := -std=c11
WARN    := -Wall -Wextra
OPT     := -O2 -g
PTHREAD := -pthread

PKGS    := gtk+-3.0

# = 로 두어 install-deps 이후 재평가
GTK_CFLAGS := $(shell pkg-config --cflags $(PKGS) 2>/dev/null)
GTK_LIBS   := $(shell pkg-config --libs $(PKGS) 2>/dev/null)

CFLAGS  := $(CSTD) $(WARN) $(OPT) $(PTHREAD) -I$(INCDIR) $(GTK_CFLAGS)
LDFLAGS := $(PTHREAD) -lm $(GTK_LIBS)

SRCS := $(SRCDIR)/main.c \
        $(SRCDIR)/main_window.c \
        $(SRCDIR)/file_panel.c \
        $(SRCDIR)/folder_tree_panel.c \
        $(SRCDIR)/preview_panel.c \
        $(SRCDIR)/file_entry.c \
        $(SRCDIR)/file_ops.c \
        $(SRCDIR)/json_util.c \
        $(SRCDIR)/bookmark_manager.c \
        $(SRCDIR)/session_settings.c \
        $(SRCDIR)/input_dialog.c \
        $(SRCDIR)/search_dialog.c

OBJS := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/%.o,$(SRCS))

UNAME_S  := $(shell uname -s)
APT_DEBS := build-essential pkg-config libgtk-3-dev

.PHONY: all deps install-deps check-deps clean run help \
        _ensure-deps _deps-report _deps-missing _build banner done dirs

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
	@echo "    $(TARGET) — ($$(uname -s)/$$(uname -m))"
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
	        echo "    [X] $$pkg (libgtk-3-dev 등)"; \
	    fi; \
	done
	@echo ""

_deps-missing:
	@fail=0; \
	command -v $(CC) >/dev/null 2>&1 || fail=1; \
	command -v pkg-config >/dev/null 2>&1 || fail=1; \
	command -v make >/dev/null 2>&1 || fail=1; \
	pkg-config --exists gtk+-3.0 2>/dev/null || fail=1; \
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
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs libgtk-3-dev"; \
	    pkgs=$$(echo $$pkgs | tr ' ' '\n' | sort -u | tr '\n' ' '); \
	    if [ -n "$$(echo $$pkgs | tr -d ' ')" ]; then \
	        echo "    apt-get install$$pkgs"; \
	        sudo apt-get update -qq && sudo apt-get install -y $$pkgs; \
	    else echo "    apt — 추가 설치 불필요"; fi; \
	elif command -v dnf >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs gcc make pkg-config"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3-devel"; \
	    if [ -n "$$pkgs" ]; then echo "    dnf install$$pkgs"; sudo dnf install -y $$pkgs; fi; \
	elif command -v pacman >/dev/null 2>&1; then \
	    pkgs=""; \
	    [ $$need_pm -ne 0 ] || [ $$need_cc -ne 0 ] && pkgs="$$pkgs base-devel"; \
	    [ $$need_gtk -ne 0 ] && pkgs="$$pkgs gtk3"; \
	    if [ -n "$$pkgs" ]; then echo "    pacman -S$$pkgs"; \
	        sudo pacman -S --needed --noconfirm $$pkgs; fi; \
	else \
	    echo "    [X] 지원하지 않는 패키지 매니저 — 수동: $(APT_DEBS)"; exit 1; \
	fi
else
	@echo "    install-deps: Linux 전용"
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

$(TARGET): $(OBJS)
	@test -n "$(GTK_CFLAGS)" || { echo "[X] gtk+-3.0 없음 — make 재실행"; exit 1; }
	@echo "[link] ./$(TARGET)"
	@$(CC) $(OBJS) -o $(TARGET) $(LDFLAGS)

$(BLDDIR)/%.o: $(SRCDIR)/%.c
	@test -n "$(GTK_CFLAGS)" || { echo "[X] gtk+-3.0 없음 — make 재실행"; exit 1; }
	@echo "[cc]   $<"
	@$(CC) $(CFLAGS) -c $< -o $@

run: all
	@./$(TARGET)

clean:
	@rm -rf $(BLDDIR) $(TARGET)

help:
	@echo "Targets:"
	@echo "  make                 의존성 검사·자동 설치 후 빌드 → ./$(TARGET)"
	@echo "  make check-deps      의존성만 검사"
	@echo "  make install-deps    누락 패키지 수동 설치"
	@echo "  make run             ./$(TARGET) 실행"
	@echo "  make clean           build/ 및 실행 파일 삭제"
	@echo ""
	@echo "  CC_AUTO_INSTALL=0    자동 설치 끄기"
